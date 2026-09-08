"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { summarizeLocalComponentAsset } = require("./component-asset-learning");
const {
  assetRegistryPath,
  defaultComponentAssetStoreRoot,
  readComponentAssetRegistry,
  registryCandidates
} = require("./component-asset-store");
const {
  _private: componentAssetMatcherPrivate = {}
} = require("./component-asset-matcher");

const COMPONENT_EXTENSIONS = new Set([
  ".pptx",
  ".potx",
  ".ppt",
  ".crtx",
  ".ppam",
  ".thmx",
  ".svg",
  ".emf",
  ".wmf",
  ".png",
  ".jpg",
  ".jpeg",
  ".json",
  ".xml",
  ".db",
  ".sqlite",
  ".dll"
]);

const SKIP_DIR_PATTERNS = [
  /\\(browser|webbrowser|webview2|ebwebview)(\\|$)/i,
  /\\(cache|gpucache|shadercache|crashpad|logs?)(\\|$)/i,
  /\\(libvlc|runtimes?|node_modules)(\\|$)/i
];
const SKIP_DIR_NAMES = new Set([
  "cache",
  "gpucache",
  "shadercache",
  "crashpad",
  "log",
  "logs",
  "tmp",
  "temp"
]);

function defaultLocalComponentRoots(env = process.env) {
  const workspaceRoot = env.SLIDECLONE_WORKSPACE_ROOT || process.cwd();
  return [
    path.join(workspaceRoot, "runs", "plugin-component-inventory", "officeplus-applied-components"),
    path.join(workspaceRoot, "runs", "plugin-component-inventory", "islide-applied-components"),
    path.join(workspaceRoot, "runs", "plugin-component-inventory", "manual-applied-components"),
    path.join(workspaceRoot, "runs", "plugin-component-inventory", "watched-plugin-components", "officeplus"),
    path.join(workspaceRoot, "runs", "plugin-component-inventory", "watched-plugin-components", "islide"),
    path.join(workspaceRoot, "runs", "plugin-component-inventory", "isolated-collection", "verified")
  ];
}

function defaultProviderComponentRoots(env = process.env) {
  const appData = env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const tempDir = env.TEMP || env.TMP || os.tmpdir();
  const programFiles = env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  return [
    path.join(appData, "iSlide"),
    path.join(localAppData, "iSlide"),
    path.join(tempDir, "iSlide Tools", "site", "content", "file"),
    path.join(programFiles, "Microsoft OfficePLUS"),
    path.join(localAppData, "OfficePLUS"),
    path.join(localAppData, "OfficePLUS", "Temp", "OPPowerPNTAddin", "Files"),
    path.join(localAppData, "OfficePLUSAgent"),
    path.join(programFilesX86, "Office Timeline"),
    path.join(appData, "Office Timeline"),
    path.join(appData, "think-cell"),
    path.join(localAppData, "think-cell"),
    path.join(programFiles, "AiPPT"),
    path.join(appData, "博思AIPPT"),
    path.join(appData, "aippt-desktop"),
    path.join(appData, "isheji-aippt-desktop")
  ];
}

function defaultPluginComponentRoots(env = process.env, options = {}) {
  return [
    ...defaultLocalComponentRoots(env),
    ...(options.includeProviderRoots === true ? defaultProviderComponentRoots(env) : [])
  ];
}

function buildPluginComponentInventory(options = {}) {
  const explicitRoots = Array.isArray(options.roots);
  const roots = normalizeRoots(explicitRoots
    ? options.roots
    : defaultPluginComponentRoots(options.env, { includeProviderRoots: options.includeProviderRoots === true }));
  const storedCandidates = explicitRoots || options.includeAssetStore === false
    ? []
    : loadDefaultStoredCandidates(options);
  let candidates = enrichCandidatesWithLearning(rankComponentCandidates([
    ...storedCandidates,
    ...discoverInstalledPptComponentSources({
    ...options,
    roots
    })
  ]), options);
  candidates = applySelfFidelityPromotions(candidates, options.selfFidelityPromotionReport, {
    requirePromoted: options.requireSelfFidelityPromoted === true
  });
  return {
    provider: "plugin-component-registry-v1",
    createdAt: new Date().toISOString(),
    mode: options.includeProviderRoots === true ? "acquisition" : "offline-local",
    roots: roots.map((root) => ({ path: root, exists: safeExists(root) })),
    summary: summarizeCandidates(candidates),
    recommendations: recommendComponentLearning(candidates),
    candidates
  };
}

function loadDefaultStoredCandidates(options = {}) {
  const storeRoot = path.resolve(String(options.assetStoreRoot || defaultComponentAssetStoreRoot(options.env)));
  const registry = readComponentAssetRegistry(assetRegistryPath(storeRoot), { allowMissing: true });
  return registryCandidates(registry, storeRoot, { requireFiles: true });
}

function enrichCandidatesWithLearning(candidates = [], options = {}) {
  if (options.learnStructure !== true) return candidates;
  const maxAssets = normalizePositiveInt(options.learnMaxAssets, 20);
  const learnable = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter((item) => shouldLearnCandidateStructure(item.candidate))
    .sort((a, b) => learningPriority(b.candidate) - learningPriority(a.candidate) || a.index - b.index)
    .slice(0, maxAssets);
  const selected = new Set(learnable.map((item) => normalizePath(item.candidate.path)));
  return candidates.map((candidate) => {
    if (!selected.has(normalizePath(candidate.path))) return candidate;
    const learningSummary = summarizeLocalComponentAsset(candidate, {
      maxSlides: normalizePositiveInt(options.learnMaxSlides, 4),
      maxComponentCatalogItems: normalizePositiveInt(options.learnMaxComponentCatalogItems, 12)
    });
    const summarizeAssetStructureSignature = componentAssetMatcherPrivate.summarizeAssetStructureSignature;
    const structureSignature = typeof summarizeAssetStructureSignature === "function"
      ? summarizeAssetStructureSignature(learningSummary)
      : null;
    return {
      ...candidate,
      learningSummary,
      ...(structureSignature ? { structureSignature } : {})
    };
  });
}

function learningPriority(candidate = {}) {
  const tags = Array.isArray(candidate.roleTags) ? candidate.roleTags : [];
  let score = 0;
  if (tags.includes("applied-component")) score += 100;
  if (candidate.provider === "islide") score += 40;
  if (candidate.provider === "officeplus") score += 30;
  if (tags.includes("downloaded-component")) score += 24;
  if (tags.includes("timeline")) score += 12;
  if (candidate.assetKind === "presentation-template") score += 8;
  return score;
}

function applySelfFidelityPromotions(candidates = [], report = null, options = {}) {
  const requirePromoted = options.requirePromoted === true;
  // A verified manifest persists the promotion result so later inventory
  // refreshes do not need to re-supply every historical fidelity report.
  if (!report || typeof report !== "object") {
    return requirePromoted
      ? candidates.filter(isPersistedSelfFidelityPromoted)
      : candidates;
  }
  const results = Array.isArray(report.results) ? report.results.slice(0, 500) : [];
  const promoted = new Map();
  for (const result of results) {
    if (result?.passed !== true) continue;
    const file = safeString(result.file);
    if (!file || !path.isAbsolute(file)) continue;
    promoted.set(normalizePath(path.resolve(file)), {
      provider: "component-self-fidelity-promotion-v1",
      passed: true,
      sha256: safeSha256(result.sha256),
      reportFile: safeAbsoluteReportPath(result.reportFile),
      replayPptx: safeAbsoluteReportPath(result.replayPptx),
      comparison: sanitizeFidelityComparison(result.comparison),
      regionSummary: sanitizeFidelityRegionSummary(result.regionSummary)
    });
  }
  return candidates
    .map((candidate) => {
      const promotion = promoted.get(normalizePath(path.resolve(String(candidate.path || ""))));
      if (!promotion) return requirePromoted && !isPersistedSelfFidelityPromoted(candidate) ? null : candidate;
      return {
        ...candidate,
        roleTags: uniqueStrings([...(candidate.roleTags || []), "self-fidelity-promoted"]),
        score: Number(candidate.score || 0) + 32,
        selfFidelityPromoted: true,
        selfFidelity: promotion
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || safeString(a.name).localeCompare(safeString(b.name)));
}

function isPersistedSelfFidelityPromoted(candidate = {}) {
  // Tags are descriptive metadata and historic manifests can contain a stale
  // tag after a failed or interrupted replay. Only the explicit persisted
  // verification flag is production-grade evidence.
  return candidate.selfFidelityPromoted === true;
}

function sanitizeFidelityComparison(value = {}) {
  return {
    ok: value?.ok === true,
    pixelDiffRatio: finiteMetric(value?.pixelDiffRatio, 0, 1),
    foregroundMissingRatio: finiteMetric(value?.foregroundMissingRatio, 0, 1),
    meanAbsoluteDelta: finiteMetric(value?.meanAbsoluteDelta, 0, 255)
  };
}

function sanitizeFidelityRegionSummary(value = {}) {
  return {
    regions: Math.trunc(finiteMetric(value?.regions, 0, 1000) || 0),
    passed: Math.trunc(finiteMetric(value?.passed, 0, 1000) || 0),
    maxPixelDiffRatio: finiteMetric(value?.maxPixelDiffRatio, 0, 1),
    maxForegroundMissingRatio: finiteMetric(value?.maxForegroundMissingRatio, 0, 1),
    maxMeanAbsoluteDelta: finiteMetric(value?.maxMeanAbsoluteDelta, 0, 255)
  };
}

function finiteMetric(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function safeSha256(value) {
  const text = safeString(value).toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : "";
}

function safeAbsoluteReportPath(value) {
  const text = safeString(value);
  return text && path.isAbsolute(text) ? path.normalize(text) : "";
}

function shouldLearnCandidateStructure(candidate = {}) {
  if (!["presentation-template", "chart-template"].includes(candidate.assetKind)) return false;
  if (!path.isAbsolute(String(candidate.path || ""))) return false;
  const policy = String(candidate.reusePolicy || "");
  const tags = Array.isArray(candidate.roleTags) ? candidate.roleTags : [];
  return policy.includes("learn")
    || policy.includes("inspect-openxml")
    || tags.includes("applied-component")
    || tags.includes("downloaded-component")
    || tags.includes("timeline");
}

function discoverInstalledPptComponentSources(options = {}) {
  const roots = normalizeRoots(Array.isArray(options.roots) ? options.roots : defaultPluginComponentRoots(options.env));
  const maxDepth = Number.isFinite(Number(options.maxDepth)) ? Number(options.maxDepth) : 5;
  const maxFilesPerRoot = Number.isFinite(Number(options.maxFilesPerRoot)) ? Number(options.maxFilesPerRoot) : 600;
  const maxTotalFiles = Number.isFinite(Number(options.maxTotalFiles)) ? Number(options.maxTotalFiles) : 3000;
  const manifestMetadata = loadHarvestManifestMetadata(roots);
  const candidates = [];
  for (const root of roots) {
    if (candidates.length >= maxTotalFiles) break;
    if (!safeExists(root)) continue;
    const before = candidates.length;
    walkComponentRoot(root, {
      root,
      maxDepth,
      maxFiles: maxFilesPerRoot,
      remaining: () => Math.max(0, maxTotalFiles - candidates.length),
      onFile(file) {
        const candidate = classifyComponentCandidate(file, root);
        if (candidate) candidates.push(applyHarvestManifestMetadata(candidate, manifestMetadata));
      }
    });
    if (candidates.length - before >= maxFilesPerRoot) continue;
  }
  return rankComponentCandidates(candidates);
}

function loadHarvestManifestMetadata(roots = []) {
  const metadata = new Map();
  for (const root of roots) {
    const manifestFiles = harvestManifestFilesForRoot(root);
    for (const manifestFile of manifestFiles) {
      let manifest = null;
      try {
        manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
      } catch {
        continue;
      }
      const components = Array.isArray(manifest?.components) ? manifest.components : [];
      for (const component of components) {
        const componentPath = safeString(component?.path || "");
        if (!componentPath) continue;
        const key = normalizePath(path.resolve(componentPath));
        const value = {};
        if (component.learningSummary && typeof component.learningSummary === "object") {
          value.learningSummary = component.learningSummary;
        }
        if (component.structureSignature && typeof component.structureSignature === "object") {
          value.structureSignature = component.structureSignature;
        }
        if (Array.isArray(component.roleTags)) value.roleTags = component.roleTags.map(safeString).filter(Boolean);
        const selfFidelity = sanitizeStoredSelfFidelity(component.selfFidelity, {
          allowPersistedPromotion: component.selfFidelityPromoted === true
        });
        if (component.selfFidelityPromoted === true && selfFidelity) {
          value.selfFidelityPromoted = true;
          value.selfFidelity = selfFidelity;
        }
        if (Object.keys(value).length > 0) metadata.set(key, value);
      }
    }
  }
  return metadata;
}

function harvestManifestFilesForRoot(root) {
  const files = [];
  const direct = path.join(root, "manifest.json");
  if (safeExists(direct)) files.push(direct);
  for (const provider of ["officeplus", "islide"]) {
    const nested = path.join(root, provider, "manifest.json");
    if (safeExists(nested)) files.push(nested);
  }
  return files;
}

function applyHarvestManifestMetadata(candidate = {}, metadata = new Map()) {
  const extra = metadata.get(normalizePath(path.resolve(String(candidate.path || ""))));
  if (!extra) return candidate;
  const roleTags = uniqueStrings([...(candidate.roleTags || []), ...(extra.roleTags || [])]);
  return {
    ...candidate,
    ...(roleTags.length ? { roleTags } : {}),
    ...(extra.learningSummary ? { learningSummary: extra.learningSummary } : {}),
    ...(extra.structureSignature ? { structureSignature: extra.structureSignature } : {}),
    ...(extra.selfFidelityPromoted === true ? { selfFidelityPromoted: true } : {}),
    ...(extra.selfFidelity ? { selfFidelity: extra.selfFidelity } : {})
  };
}

function sanitizeStoredSelfFidelity(value = {}, options = {}) {
  if (!value || typeof value !== "object") return null;
  const allowPersistedPromotion = options.allowPersistedPromotion === true;
  // Older verified manifests persisted the explicit promotion flag and the
  // report paths, but not the redundant `passed` boolean. Treat that exact
  // combination as valid evidence; tags and empty metadata remain ineligible.
  if (value.passed !== true && !allowPersistedPromotion) return null;
  const out = { passed: true };
  for (const key of ["reportFile", "replayPptx"]) {
    const file = safeString(value[key]);
    if (file && path.isAbsolute(file)) out[key] = path.resolve(file);
  }
  if (value.passed !== true && !out.reportFile && !out.replayPptx) return null;
  return out;
}

function walkComponentRoot(dir, context, depth = 0, seen = { count: 0 }) {
  if (seen.count >= context.maxFiles || context.remaining() <= 0) return;
  if (depth > context.maxDepth || shouldSkipDirectory(dir)) return;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const ordered = entries.sort((a, b) => {
    const aPath = path.join(dir, a.name);
    const bPath = path.join(dir, b.name);
    return scoreDirectoryEntry(b, bPath) - scoreDirectoryEntry(a, aPath)
      || recentEntryTimeMs(bPath) - recentEntryTimeMs(aPath)
      || a.name.localeCompare(b.name);
  });
  for (const entry of ordered) {
    if (seen.count >= context.maxFiles || context.remaining() <= 0) return;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkComponentRoot(fullPath, context, depth + 1, seen);
      continue;
    }
    if (!entry.isFile()) continue;
    seen.count += 1;
    context.onFile(fullPath);
  }
}

function classifyComponentCandidate(file, root) {
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file);
  const normalized = normalizePath(file);
  if (isAppliedPluginComponentManifestPath(normalized)) return null;
  if (/\\officeplus\\temp\\/i.test(normalized) && !isOfficePlusDownloadedComponentPath(normalized)) return null;
  if (!COMPONENT_EXTENSIONS.has(ext) && !isSemanticComponentName(base, normalized)) return null;
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  const provider = inferProvider(normalized);
  const assetKind = inferAssetKind(ext, base, normalized);
  if (!assetKind) return null;
  const roleTags = inferRoleTags({ ext, base, normalized, provider, assetKind });
  return {
    id: stableComponentId(provider, normalized),
    provider,
    root,
    path: file,
    name: base,
    extension: ext || null,
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    assetKind,
    roleTags,
    reusePolicy: inferReusePolicy({ provider, assetKind, ext, normalized, base }),
    score: scoreCandidate({ provider, assetKind, ext, normalized, sizeBytes: stat.size, roleTags })
  };
}

function inferProvider(normalizedPath) {
  if (normalizedPath.includes("\\office timeline\\")) return "office-timeline";
  if (normalizedPath.includes("\\microsoft officeplus\\") || normalizedPath.includes("\\officeplus\\")) return "officeplus";
  if (normalizedPath.includes("\\islide\\") || normalizedPath.includes("\\islide tools\\")) return "islide";
  if (/\\islide-applied-components?\\/i.test(normalizedPath) || /\\islide-applied-[^\\]+$/i.test(normalizedPath)) return "islide";
  if (/\\officeplus-applied-components?\\/i.test(normalizedPath) || /\\officeplus-applied-[^\\]+$/i.test(normalizedPath)) return "officeplus";
  if (normalizedPath.includes("\\think-cell\\")) return "think-cell";
  if (normalizedPath.includes("\\aippt") || normalizedPath.includes("\\博思aippt") || normalizedPath.includes("\\isheji-aippt")) return "aippt";
  return "unknown-plugin";
}

function inferAssetKind(ext, base, normalizedPath) {
  if (ext === ".pptx" || ext === ".potx" || ext === ".ppt") return "presentation-template";
  if (ext === ".crtx") return "chart-template";
  if (ext === ".ppam") return "powerpoint-addin";
  if (ext === ".thmx") return "theme";
  if (ext === ".svg" || ext === ".emf" || ext === ".wmf") return "vector-component";
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") return "bitmap-reference";
  if (ext === ".json" || ext === ".xml" || ext === ".db" || ext === ".sqlite") return isSemanticComponentName(base, normalizedPath) ? "component-metadata" : null;
  if (ext === ".dll" && /templates?\.dll$/i.test(base)) return "embedded-template-store";
  return null;
}

function inferRoleTags({ ext, base, normalized, provider, assetKind }) {
  const text = `${base} ${normalized}`.toLowerCase();
  const tags = new Set();
  if (provider === "office-timeline" || /timeline|milestone|swimlane|roadmap/.test(text)) tags.add("timeline");
  if (/icon|图标/.test(text) || /^icon\d/i.test(base)) tags.add("icon");
  if (/banner|background|skin|tag|chrome/.test(text)) tags.add("chrome-style");
  if (/template|demo|sample|slide|模板/.test(text) || ["presentation-template", "chart-template"].includes(assetKind)) tags.add("template-layout");
  if (assetKind === "chart-template") tags.add("native-chart-template");
  if (/chart|graph|diagram|flow|matrix|process|流程|组件/.test(text)) tags.add("diagram");
  if (isOfficePlusDownloadedComponentPath(normalized)) tags.add("downloaded-component");
  if (isIslideDownloadedComponentPath(normalized)) tags.add("downloaded-component");
  if (isAppliedPluginComponentPath(normalized)) tags.add("applied-component");
  if (provider === "officeplus" && base.toLowerCase() === "officeplus.pptx") tags.add("generic-installed-template");
  if (/font|simhei|yahei|dengxian|kaiti|simsun/.test(text)) tags.add("font-sample");
  if (ext === ".svg" || ext === ".emf" || ext === ".wmf") tags.add("vector");
  if (ext === ".pptx" || ext === ".potx" || ext === ".crtx") tags.add("openxml-inspectable");
  return [...tags].sort();
}

function inferReusePolicy({ provider, assetKind, ext, normalized, base }) {
  if (assetKind === "chart-template" && isAppliedPluginComponentPath(normalized)) {
    return "inspect-openxml-applied-plugin-chart-template";
  }
  if (assetKind === "chart-template" && provider === "officeplus") {
    return "inspect-openxml-and-learn-native-chart-style";
  }
  if (assetKind === "presentation-template" && isAppliedPluginComponentPath(normalized)) {
    return "inspect-openxml-applied-plugin-component";
  }
  if (assetKind === "presentation-template" && provider === "office-timeline") {
    return "learn-layout-patterns-from-installed-demo";
  }
  if (assetKind === "presentation-template" && provider === "officeplus") {
    if (isOfficePlusDownloadedComponentPath(normalized)) return "inspect-openxml-downloaded-plugin-component";
    return "inspect-openxml-and-learn-style";
  }
  if (assetKind === "presentation-template" && provider === "islide") {
    if (isIslideDownloadedComponentPath(normalized)) return "inspect-openxml-downloaded-plugin-component";
    return "inspect-openxml-and-learn-style";
  }
  if (assetKind === "vector-component") {
    return "learn-vector-style-or-use-after-license-review";
  }
  if (assetKind === "bitmap-reference") {
    return /font|simhei|yahei|dengxian|kaiti|simsun/i.test(`${base} ${normalized}`)
      ? "font-appearance-reference"
      : "visual-style-reference-not-direct-native";
  }
  if (assetKind === "embedded-template-store") {
    return "inspect-only-plugin-private-store";
  }
  if (provider === "think-cell") return "runtime-chart-engine-not-direct-template-source";
  return "inspect-before-use";
}

function recommendComponentLearning(candidates = []) {
  const byPolicy = summarizeBy(candidates, "reusePolicy");
  const byProvider = summarizeBy(candidates, "provider");
  const byTag = {};
  for (const candidate of candidates) {
    for (const tag of candidate.roleTags || []) byTag[tag] = (byTag[tag] || 0) + 1;
  }
  const actions = [];
  if (byProvider["office-timeline"]) {
    actions.push({
      priority: 1,
      target: "timeline-and-milestone-components",
      source: "office-timeline demo PPTX",
      approach: "extract OpenXML grouped-shape geometry and convert it into parameterized timeline components"
    });
  }
  if (byProvider.officeplus) {
    actions.push({
      priority: 2,
      target: "polished-card-icon-and-banner-styles",
      source: "OfficePLUS SVG/PNG/PPTX assets",
      approach: "learn vector silhouettes, colors, shadow/radius recipes, and build native component variants"
    });
  }
  if (byProvider.islide) {
    actions.push({
      priority: 3,
      target: "template-layout-mining",
      source: "iSlide local cache",
      approach: "scan non-browser cache stores only; avoid launching plugin UI during conversion"
    });
  }
  return {
    byProvider,
    byPolicy,
    byTag,
    actions
  };
}

function summarizeCandidates(candidates = []) {
  const structureCoverage = summarizeStructureCoverage(candidates);
  return {
    total: candidates.length,
    byProvider: summarizeBy(candidates, "provider"),
    byAssetKind: summarizeBy(candidates, "assetKind"),
    learnedStructures: candidates.filter((candidate) => candidate.learningSummary?.status === "ok").length,
    structureSignatures: candidates.filter((candidate) => candidate.structureSignature).length,
    selfFidelityPromoted: candidates.filter((candidate) => candidate.selfFidelityPromoted === true).length,
    byStructureKind: structureCoverage.byStructureKind,
    byStructureMotif: structureCoverage.byStructureMotif,
    highReusableStructureGroups: structureCoverage.highReusableStructureGroups,
    reusableStructureGroups: structureCoverage.reusableStructureGroups,
    topCandidates: candidates.slice(0, 20).map((candidate) => ({
      provider: candidate.provider,
      assetKind: candidate.assetKind,
      name: candidate.name,
      roleTags: candidate.roleTags,
      reusePolicy: candidate.reusePolicy,
      structureSignature: candidate.structureSignature || null,
      selfFidelityPromoted: candidate.selfFidelityPromoted === true,
      selfFidelity: candidate.selfFidelity || null,
      score: candidate.score
    }))
  };
}

function summarizeStructureCoverage(candidates = []) {
  const byStructureKind = {};
  const byStructureMotif = {};
  let highReusableStructureGroups = 0;
  let reusableStructureGroups = 0;
  for (const candidate of candidates) {
    const signature = candidate.structureSignature || {};
    const kindCounts = Object.keys(signature.counts || {}).length
      ? signature.counts
      : Object.fromEntries((Array.isArray(signature.kinds) ? signature.kinds : [signature.primaryKind]).filter(Boolean).map((kind) => [kind, 1]));
    const motifCounts = Object.keys(signature.motifCounts || {}).length
      ? signature.motifCounts
      : Object.fromEntries((Array.isArray(signature.motifs) ? signature.motifs : [signature.primaryMotif]).filter(Boolean).map((motif) => [motif, 1]));
    for (const [kind, count] of Object.entries(kindCounts)) {
      addNumericCount(byStructureKind, kind, count);
    }
    for (const [motif, count] of Object.entries(motifCounts)) {
      addNumericCount(byStructureMotif, motif, count);
    }
    highReusableStructureGroups += Math.max(0, Math.round(Number(signature.highReusableGroups || 0)));
    reusableStructureGroups += Math.max(0, Math.round(Number(signature.reusableGroups || 0)));
  }
  return {
    byStructureKind,
    byStructureMotif,
    highReusableStructureGroups,
    reusableStructureGroups
  };
}

function addNumericCount(target, key, value) {
  const safeKey = safeString(key || "");
  if (!safeKey) return;
  const count = Math.max(1, Math.round(Number(value) || 1));
  target[safeKey] = (target[safeKey] || 0) + count;
}

function rankComponentCandidates(candidates) {
  const seen = new Set();
  return [...candidates]
    .filter((candidate) => {
      const key = normalizePath(candidate.path);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score || b.sizeBytes - a.sizeBytes || a.path.localeCompare(b.path));
}

function scoreCandidate({ provider, assetKind, ext, normalized, sizeBytes, roleTags }) {
  let score = 0;
  if (provider === "office-timeline") score += 40;
  if (provider === "officeplus") score += 34;
  if (provider === "islide") score += 28;
  if (assetKind === "presentation-template") score += 38;
  if (assetKind === "vector-component") score += 30;
  if (assetKind === "embedded-template-store") score += 26;
  if (assetKind === "bitmap-reference") score += 12;
  if (roleTags.includes("timeline")) score += 28;
  if (roleTags.includes("diagram")) score += 20;
  if (roleTags.includes("template-layout")) score += 18;
  if (roleTags.includes("downloaded-component")) score += 24;
  if (roleTags.includes("applied-component")) score += 22;
  if (roleTags.includes("generic-installed-template")) score -= 18;
  if (roleTags.includes("icon")) score += 12;
  if (roleTags.includes("chrome-style")) score += 10;
  if (ext === ".dll" && sizeBytes > 10_000_000) score -= 12;
  if (/\\(browser|webview2|cache|logs?)\\/i.test(normalized)) score -= 40;
  return score;
}

function scoreDirectoryEntry(entryOrName, fullPath = "") {
  const name = typeof entryOrName === "string" ? entryOrName : entryOrName?.name || "";
  const isDirectory = typeof entryOrName === "object" && entryOrName?.isDirectory?.() === true;
  const lower = name.toLowerCase();
  const normalized = normalizePath(fullPath || name);
  let score = 0;
  if (isDirectory) score += 2;
  if (/demo|template|asset|image|icon|shape|timeline|diagram|素材|模板|图标|组件/.test(lower)) score += 10;
  if (/oppowerpntaddin|files|download|content|matl|component|组件/.test(lower)) score += 18;
  if (isOfficePlusDownloadedComponentDirectory(normalized)) score += 35;
  if (/\\(?:islide tools|site|content|file)(\\|$)/i.test(normalized)) score += 22;
  if (/browser|webview|cache|log|temp|tmp|libvlc|runtime/.test(lower)) score -= 20;
  if (/\\(?:webview2|ebwebview|code cache|cache_data|gpucache|shadercache|node_modules)(\\|$)/i.test(normalized)) score -= 60;
  return score;
}

function recentEntryTimeMs(fullPath) {
  try {
    return fs.statSync(fullPath).mtimeMs || 0;
  } catch {
    return 0;
  }
}

function shouldSkipDirectory(dir) {
  const normalized = normalizePath(dir);
  if (isOfficePlusDownloadedComponentDirectory(normalized)) return false;
  if (SKIP_DIR_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  const base = path.basename(normalized);
  return SKIP_DIR_NAMES.has(base);
}

function isOfficePlusDownloadedComponentPath(normalizedPath) {
  if (/\\officeplus\\temp\\oppowerpntaddin\\files\\[^\\]+\.pptx$/i.test(normalizedPath)) return true;
  return /\\officeplus\\temp\\/i.test(normalizedPath)
    && /(?:matl|component|content|素材|组件|template|模板|download|downloaded)/i.test(path.basename(normalizedPath))
    && /\.pptx$/i.test(normalizedPath);
}

function isIslideDownloadedComponentPath(normalizedPath) {
  return /\\islide tools\\site\\content\\file\\.+\.(?:pptx|potx|ppt)$/i.test(normalizedPath);
}

function isAppliedPluginComponentPath(normalizedPath) {
  return /\\(?:islide|officeplus|plugin)-applied-components?\\[^\\]+\.(?:pptx|potx|ppt)$/i.test(normalizedPath)
    || /\\applied-(?:islide|officeplus|plugin)-components?\\[^\\]+\.(?:pptx|potx|ppt)$/i.test(normalizedPath)
    || /\\(?:islide|officeplus)-applied-[^\\]+\.(?:pptx|potx|ppt)$/i.test(normalizedPath);
}

function isAppliedPluginComponentManifestPath(normalizedPath) {
  return /\\(?:islide|officeplus|plugin)-applied-components?\\manifest\.json$/i.test(normalizedPath)
    || /\\applied-(?:islide|officeplus|plugin)-components?\\manifest\.json$/i.test(normalizedPath);
}

function isOfficePlusDownloadedComponentDirectory(normalizedPath) {
  return /\\officeplus\\temp(?:\\oppowerpntaddin(?:\\files)?)?$/i.test(normalizedPath);
}

function isSemanticComponentName(base, fullPath) {
  return /template|asset|shape|icon|素材|模板|图标|组件|diagram|timeline|chart|slide|demo|style/i.test(`${base} ${fullPath}`);
}

function summarizeBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function normalizeRoots(roots = []) {
  return (Array.isArray(roots) ? roots : [])
    .map((root) => String(root || "").trim())
    .filter(Boolean)
    .map((root) => path.resolve(root));
}

function normalizePositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function stableComponentId(provider, file) {
  const normalized = normalizePath(file);
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${provider}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizePath(value) {
  return String(value || "").replace(/\//g, "\\").toLowerCase();
}

function safeExists(file) {
  try {
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 500);
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values.map(safeString).filter(Boolean)) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result.sort();
}

module.exports = {
  buildPluginComponentInventory,
  classifyComponentCandidate,
  defaultLocalComponentRoots,
  defaultPluginComponentRoots,
  defaultProviderComponentRoots,
  discoverInstalledPptComponentSources,
  inferProvider,
  inferReusePolicy,
  recommendComponentLearning,
  _private: {
    applySelfFidelityPromotions,
    enrichCandidatesWithLearning,
    inferAssetKind,
    inferRoleTags,
    learningPriority,
    loadHarvestManifestMetadata,
    isAppliedPluginComponentManifestPath,
    isAppliedPluginComponentPath,
    isOfficePlusDownloadedComponentDirectory,
    isOfficePlusDownloadedComponentPath,
    isIslideDownloadedComponentPath,
    normalizeRoots,
    shouldLearnCandidateStructure,
    shouldSkipDirectory,
    stableComponentId
  }
};
