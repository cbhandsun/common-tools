"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { summarizeLocalComponentAsset } = require("./lib/component-asset-learning");
const {
  _private: componentAssetMatcherPrivate = {}
} = require("./lib/component-asset-matcher");

const DEFAULT_OUT_ROOT = path.join("runs", "plugin-component-inventory", "islide-applied-components");
const SUPPORTED_EXTENSIONS = new Set([".pptx", ".potx", ".ppt", ".crtx"]);
const DEFAULT_DISCOVER_LIMIT = 12;

function parseArgs(argv) {
  const args = {
    sources: [],
    out: DEFAULT_OUT_ROOT,
    provider: "islide",
    discoverISlideTemp: false,
    discoverOfficePlusLocal: false,
    discoverRoot: "",
    discoverLimit: DEFAULT_DISCOVER_LIMIT,
    recursive: false,
    maxFiles: 100,
    includeGenericInstalled: false,
    includeStructure: true,
    structureMaxSlides: 4,
    structureMaxComponentCatalogItems: 12
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--source" || arg === "--input") && next) {
      args.sources.push(next);
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if (arg === "--provider" && next) {
      args.provider = next;
      i += 1;
    } else if (arg === "--discover-islide-temp") {
      args.discoverISlideTemp = true;
    } else if (arg === "--discover-officeplus-local") {
      args.discoverOfficePlusLocal = true;
    } else if (arg === "--discover-root" && next) {
      args.discoverRoot = next;
      i += 1;
    } else if (arg === "--discover-limit" && next) {
      args.discoverLimit = Number(next);
      i += 1;
    } else if (arg === "--max-files" && next) {
      args.maxFiles = Number(next);
      i += 1;
    } else if (arg === "--include-generic-installed") {
      args.includeGenericInstalled = true;
    } else if (arg === "--recursive") {
      args.recursive = true;
    } else if (arg === "--no-structure") {
      args.includeStructure = false;
    } else if (arg === "--structure-max-slides" && next) {
      args.structureMaxSlides = Number(next);
      i += 1;
    } else if (arg === "--structure-max-component-catalog-items" && next) {
      args.structureMaxComponentCatalogItems = Number(next);
      i += 1;
    } else {
      throw new Error(`Unknown harvest-applied-ppt-components argument: ${arg}`);
    }
  }
  if (args.sources.length === 0 && !args.discoverISlideTemp && !args.discoverOfficePlusLocal) {
    throw new Error("At least one --source PPTX file/directory, --discover-islide-temp, or --discover-officeplus-local is required.");
  }
  args.maxFiles = normalizePositiveInt(args.maxFiles, 100);
  args.discoverLimit = normalizePositiveInt(args.discoverLimit, DEFAULT_DISCOVER_LIMIT);
  args.includeStructure = args.includeStructure !== false;
  args.structureMaxSlides = normalizePositiveInt(args.structureMaxSlides, 4);
  args.structureMaxComponentCatalogItems = normalizePositiveInt(args.structureMaxComponentCatalogItems, 12);
  args.provider = sanitizeProvider(args.provider);
  return args;
}

function harvestAppliedPptComponents(options = {}) {
  const provider = sanitizeProvider(options.provider || "islide");
  const outRoot = path.resolve(String(options.out || DEFAULT_OUT_ROOT));
  const sourceInputs = Array.isArray(options.sources) ? options.sources : [options.sources];
  const maxFiles = normalizePositiveInt(options.maxFiles, 100);
  const includeStructure = options.includeStructure !== false;
  const structureMaxSlides = normalizePositiveInt(options.structureMaxSlides, 4);
  const structureMaxComponentCatalogItems = normalizePositiveInt(options.structureMaxComponentCatalogItems, 12);
  const explicitSources = collectSourceFiles(sourceInputs.filter(Boolean), {
    recursive: options.recursive === true,
    maxFiles
  });
  const discoveredISlideSources = options.discoverISlideTemp === true
    ? discoverISlideTempSourcePptx({
      root: options.discoverRoot,
      limit: options.discoverLimit
    })
    : [];
  const discoveredOfficePlusSources = options.discoverOfficePlusLocal === true
    ? discoverOfficePlusLocalSourcePptx({
      root: options.discoverRoot,
      limit: options.discoverLimit
    })
    : [];
  const discoveredSources = [...discoveredISlideSources, ...discoveredOfficePlusSources];
  const candidateSources = uniqueFiles([...explicitSources, ...discoveredSources]).slice(0, maxFiles);
  // The OfficePLUS add-in ships a promotional deck named officeplus.pptx. It
  // contains UI screenshots and branding, not downloaded components, so it
  // must never silently enter the applied-component corpus.
  const skippedSources = [];
  const sources = candidateSources.filter((source) => {
    if (options.includeGenericInstalled === true || !isGenericInstalledTemplate(source, provider)) return true;
    skippedSources.push({ source, reason: "generic-installed-template" });
    return false;
  });
  ensureDir(outRoot);
  const copied = [];
  const copiedHashes = new Set();
  for (const source of sources.slice(0, maxFiles)) {
    const fullHash = hashFile(source);
    if (copiedHashes.has(fullHash)) continue;
    copiedHashes.add(fullHash);
    const hash = fullHash.slice(0, 12);
    const ext = path.extname(source).toLowerCase();
    const base = appliedComponentStem(path.basename(source, ext), provider);
    const targetName = `${provider}-applied-${base}-${hash}${ext}`;
    const target = path.join(outRoot, targetName);
    fs.copyFileSync(source, target);
    const stat = fs.statSync(target);
    const component = {
      provider,
      source,
      path: target,
      name: targetName,
      sizeBytes: stat.size,
      sha256: fullHash,
      modifiedAt: stat.mtime.toISOString(),
      assetKind: ext === ".crtx" ? "chart-template" : "presentation-template",
      roleTags: [
        "applied-component",
        `${provider}-applied-component`,
        "openxml-inspectable",
        ...(ext === ".crtx" ? ["native-chart-template"] : [])
      ]
    };
    if (includeStructure) {
      Object.assign(component, summarizeHarvestedComponentStructure(component, {
        structureMaxSlides,
        structureMaxComponentCatalogItems
      }));
    }
    copied.push(component);
  }
  const manifest = {
    provider: "applied-ppt-component-harvest-v1",
    createdAt: new Date().toISOString(),
    outRoot,
    sourceCount: sources.length,
    discoveredCount: discoveredSources.length,
    skippedSources,
    copiedCount: copied.length,
    components: copied
  };
  fs.writeFileSync(path.join(outRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

function discoverISlideTempSourcePptx(options = {}) {
  const root = path.resolve(String(options.root || defaultISlideTempRoot()));
  const limit = normalizePositiveInt(options.limit, DEFAULT_DISCOVER_LIMIT);
  if (!fs.existsSync(root)) return [];
  const candidates = [];
  walkDiscoveryRoot(root, {
    candidates,
    maxCandidates: Math.max(limit * 8, 32),
    maxDepth: 8
  });
  return candidates
    .filter((entry) => /\.source\.default\.[^.]+\.pptx$/i.test(path.basename(entry.path))
      || /\.source\.[^.]+\.pptx$/i.test(path.basename(entry.path))
      || /source/i.test(path.basename(entry.path)))
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.size - a.size)
    .slice(0, limit)
    .map((entry) => entry.path);
}

function discoverOfficePlusLocalSourcePptx(options = {}) {
  const roots = officePlusDiscoveryRoots(options.root);
  const limit = normalizePositiveInt(options.limit, DEFAULT_DISCOVER_LIMIT);
  const candidates = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    walkDiscoveryRoot(root, {
      candidates,
      maxCandidates: Math.max(limit * 12, 48),
      maxDepth: 8
    });
  }
  return uniqueFiles(candidates
    .filter((entry) => looksLikeOfficePlusComponentDeck(entry.path))
    .sort((a, b) => b.mtimeMs - a.mtimeMs || b.size - a.size)
    .slice(0, limit)
    .map((entry) => entry.path));
}

function officePlusDiscoveryRoots(root = "") {
  const explicit = String(root || "").trim();
  if (explicit) return [path.resolve(explicit)];
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const base = path.join(local, "OfficePLUS");
  return [
    path.join(base, "Temp"),
    path.join(base, "webview2", "OPPowerPNTAddin", "EBWebView", "Default", "Download Service"),
    path.join(base, "webview2", "OPPowerPNTAddin", "EBWebView", "Default", "Cache"),
    path.join(base, "webview2", "OPPowerPNTAddin", "EBWebView", "Default", "blob_storage")
  ];
}

function summarizeHarvestedComponentStructure(component = {}, options = {}) {
  const learningSummary = summarizeLocalComponentAsset({
    ...component,
    assetKind: component.assetKind || "presentation-template"
  }, {
    maxSlides: normalizePositiveInt(options.structureMaxSlides, 4),
    maxComponentCatalogItems: normalizePositiveInt(options.structureMaxComponentCatalogItems, 12)
  });
  const safeLearningSummary = redactLearningSummaryTextSamples(learningSummary);
  const summarizeAssetStructureSignature = componentAssetMatcherPrivate.summarizeAssetStructureSignature;
  const structureSignature = typeof summarizeAssetStructureSignature === "function"
    ? summarizeAssetStructureSignature(safeLearningSummary)
    : null;
  return {
    learningSummary: safeLearningSummary,
    ...(structureSignature ? { structureSignature } : {})
  };
}

function redactLearningSummaryTextSamples(value) {
  if (Array.isArray(value)) return value.map(redactLearningSummaryTextSamples);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "placeholderText") {
      result.placeholderTextRedacted = true;
      continue;
    }
    result[key] = redactLearningSummaryTextSamples(child);
  }
  return result;
}

function looksLikeOfficePlusComponentDeck(file) {
  const ext = path.extname(file).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) return false;
  const name = path.basename(file).toLowerCase();
  const full = String(file || "").toLowerCase();
  return /matl|component|content|officeplus|download|temp|\.pptx$|\.potx$|\.ppt$|\.crtx$/.test(name)
    || /officeplus|oppowerpntaddin|download service|blob_storage|cache/.test(full);
}

function isGenericInstalledTemplate(file, provider) {
  if (provider !== "officeplus") return false;
  const normalized = path.resolve(String(file || "")).replace(/\\/g, "/").toLowerCase();
  return /\/microsoft officeplus\/[^/]+\/addin\/officeplus\.pptx$/.test(normalized);
}

function walkDiscoveryRoot(dir, context, depth = 0) {
  if (context.candidates.length >= context.maxCandidates || depth > context.maxDepth) return;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of sorted) {
    if (context.candidates.length >= context.maxCandidates) return;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDiscoveryRoot(fullPath, context, depth + 1);
    } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      try {
        const stat = fs.statSync(fullPath);
        context.candidates.push({ path: path.resolve(fullPath), mtimeMs: stat.mtimeMs, size: stat.size });
      } catch {
        // Ignore files that disappear while iSlide is still writing them.
      }
    }
  }
}

function defaultISlideTempRoot() {
  return path.join(os.tmpdir(), "iSlide Tools", "site", "content", "file");
}

function uniqueFiles(files = []) {
  const seen = new Set();
  const result = [];
  for (const file of files) {
    const resolved = path.resolve(String(file || ""));
    const key = resolved.toLowerCase();
    if (!resolved || seen.has(key)) continue;
    seen.add(key);
    result.push(resolved);
  }
  return result;
}

function collectSourceFiles(inputs = [], options = {}) {
  const files = [];
  const seen = new Set();
  for (const input of inputs) {
    const source = path.resolve(String(input || ""));
    if (!source) continue;
    if (!fs.existsSync(source)) throw new Error(`Source does not exist: ${source}`);
    const stat = fs.statSync(source);
    if (stat.isFile()) {
      addFile(source);
    } else if (stat.isDirectory()) {
      walkSourceDirectory(source, {
        recursive: options.recursive === true,
        maxFiles: normalizePositiveInt(options.maxFiles, 100),
        files,
        seen,
        addFile
      });
    }
  }
  return files;

  function addFile(file) {
    const ext = path.extname(file).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) return;
    const key = path.resolve(file).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    files.push(path.resolve(file));
  }
}

function walkSourceDirectory(dir, context, depth = 0) {
  if (context.files.length >= context.maxFiles) return;
  if (depth > 0 && !context.recursive) return;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (context.files.length >= context.maxFiles) return;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceDirectory(fullPath, context, depth + 1);
    } else if (entry.isFile()) {
      context.addFile(fullPath);
    }
  }
}

function sanitizeProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(provider)) {
    throw new Error("Provider must be a short lowercase id containing only letters, numbers, '-' or '_'.");
  }
  return provider;
}

function sanitizeFileStem(value) {
  return String(value || "component")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "component";
}

function appliedComponentStem(value, provider) {
  const safeProvider = sanitizeProvider(provider || "plugin");
  let stem = sanitizeFileStem(value);
  const providerAppliedPattern = new RegExp(`^${escapeRegExp(safeProvider)}-applied-`, "i");
  for (let guard = 0; guard < 4; guard += 1) {
    const next = stem.replace(providerAppliedPattern, "").replace(/^applied-/i, "");
    if (next === stem) break;
    stem = next;
  }
  stem = stem.replace(/-[0-9a-f]{12}$/i, "");
  return sanitizeFileStem(stem || "component");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hashFile(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

function normalizePositiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv);
  const manifest = harvestAppliedPptComponents(args);
  console.log(JSON.stringify(manifest, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  appliedComponentStem,
  collectSourceFiles,
  defaultISlideTempRoot,
  discoverISlideTempSourcePptx,
  discoverOfficePlusLocalSourcePptx,
  harvestAppliedPptComponents,
  isGenericInstalledTemplate,
  officePlusDiscoveryRoots,
  parseArgs,
  sanitizeProvider,
  _private: {
    redactLearningSummaryTextSamples,
    summarizeHarvestedComponentStructure
  }
};
