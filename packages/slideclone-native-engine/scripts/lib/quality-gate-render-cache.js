"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  normalizeRenderer,
  readRenderCacheMetadata,
  sameRenderCacheIdentity
} = require("./render-cache-metadata");

function resolveRenderOutputDir(args, outputDir, irFile) {
  if (args["render-out"]) return path.resolve(args["render-out"]);
  const baseName = path.basename(outputDir) || path.basename(irFile, ".json");
  // Output folders commonly end in `_quality`; include absolute identities so
  // concurrent gates must not overwrite one another's renderer cache.
  const cacheIdentity = `${path.resolve(outputDir)}\u0000${path.resolve(irFile)}`;
  const safeName = shortCacheName(baseName, cacheIdentity);
  return path.join(realWorkspaceCwd(), "runs", "quality-gate-render-cache", safeName);
}

function resolveFreshRenderOutputDir(args, renderOutputDir) {
  const resolved = path.resolve(renderOutputDir);
  if (args["render-out"]) return resolved;
  const suffix = [
    "attempt",
    Date.now().toString(36),
    process.pid.toString(36),
    crypto.randomBytes(4).toString("hex")
  ].join("-");
  return path.join(path.dirname(resolved), `${path.basename(resolved)}-${suffix}`);
}

function resolveReusableRenderDir({ args = {}, outputDir, irFile, pptxFile, renderOutputDir, renderer = "", cacheIdentity = null }) {
  const expectedPages = expectedRenderPageCount({ args, irFile });
  if (args["render-dir"]) {
    const explicitRenderDir = path.resolve(args["render-dir"]);
    return countRenderedPages(explicitRenderDir, { renderer, expectedPages }) > 0 ? explicitRenderDir : null;
  }
  if (String(args["reuse-render"] || "true").toLowerCase() === "false") return null;

  const renderRoot = path.resolve(args["render-root"] || path.join("runs", "quality-gate-render-cache"));
  const qualityRoot = path.resolve(args["quality-root"] || path.join("runs", "quality-gate"));
  const directCandidates = expandRenderCacheCandidates(unique([
    path.join(renderOutputDir, "render"),
    renderOutputDir
  ]));
  const directMatch = directCandidates.find((candidate) => reusableRenderMatches(candidate, { renderer, expectedPages, cacheIdentity }));
  if (directMatch) return directMatch;

  const prefixCandidates = findRenderDirsByPrefix(renderRoot, renderSearchNames([
    path.basename(outputDir || ""),
    path.basename(irFile || "", path.extname(irFile || "")),
    pptxFile ? path.basename(pptxFile, path.extname(pptxFile)) : ""
  ]));
  const prefixMatch = prefixCandidates.find((candidate) => reusableRenderMatches(candidate, { renderer, expectedPages, cacheIdentity }));
  if (prefixMatch) return prefixMatch;

  const identityMatch = findRenderDirsByIdentity(renderRoot, cacheIdentity)
    .find((candidate) => reusableRenderMatches(candidate, { renderer, expectedPages, cacheIdentity }));
  if (identityMatch) return identityMatch;

  // Recursive report discovery is retained only for legacy cache layouts.
  const legacyCandidates = findRenderDirsFromQualityReports({ qualityRoot, pptxFile });
  return legacyCandidates.find((candidate) => reusableRenderMatches(candidate, { renderer, expectedPages, cacheIdentity })) || null;
}

function findRenderDirsByIdentity(renderRoot, cacheIdentity) {
  if (!cacheIdentity || !fs.existsSync(renderRoot)) return [];
  return expandRenderCacheCandidates(fs.readdirSync(renderRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .slice(0, 2_000)
    .map((entry) => path.join(renderRoot, entry.name, "render")))
    .filter((renderDir) => sameRenderCacheIdentity(readRenderCacheMetadata(renderDir), cacheIdentity));
}

function expandRenderCacheCandidates(renderDirs = []) {
  const candidates = [];
  for (const renderDir of renderDirs) {
    if (!renderDir) continue;
    candidates.push(renderDir);
    try {
      if (!fs.existsSync(renderDir)) continue;
      for (const entry of fs.readdirSync(renderDir, { withFileTypes: true })) {
        if (entry.isDirectory()) candidates.push(path.join(renderDir, entry.name));
      }
    } catch {
      // A missing or unreadable cache directory is simply not reusable.
    }
  }
  return unique(candidates);
}

function reusableRenderMatches(renderDir, { renderer, expectedPages, cacheIdentity }) {
  if (countRenderedPages(renderDir, { renderer, expectedPages }) <= 0) return false;
  if (!cacheIdentity) return true;
  const metadata = readRenderCacheMetadata(renderDir);
  return metadata !== null && JSON.stringify(metadata) === JSON.stringify(cacheIdentity);
}

function expectedRenderPageCount({ args = {}, irFile = "" } = {}) {
  const maxPages = Number(args["max-pages"] || 999);
  const boundedMaxPages = Number.isFinite(maxPages) && maxPages > 0 ? Math.floor(maxPages) : 999;
  const irPageCount = countIrPages(irFile);
  if (irPageCount > 0) return Math.min(irPageCount, boundedMaxPages);
  return boundedMaxPages < 999 ? boundedMaxPages : 1;
}

function countIrPages(irFile) {
  if (!irFile || !fs.existsSync(irFile)) return 0;
  try {
    const ir = readJson(irFile);
    return Array.isArray(ir.pages) ? ir.pages.length : 0;
  } catch {
    return 0;
  }
}

function countRenderedPages(renderDir, options = {}) {
  return selectRenderedPageFiles(renderDir, options).length;
}

function selectRenderedPageFiles(renderDir, options = {}) {
  if (!renderDir || !fs.existsSync(renderDir)) return [];
  const groups = { libreoffice: [], generic: [] };
  for (const entry of fs.readdirSync(renderDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (/^lo-page-\d+\.png$/i.test(name)) groups.libreoffice.push(name);
    else if (/^page-\d+\.png$/i.test(name)) groups.generic.push(name);
  }
  const rawRenderer = String(options.renderer || "").trim();
  const renderer = rawRenderer ? normalizeRenderer(rawRenderer) : "";
  const expectedPages = Number(options.expectedPages || 0);
  const preferred = renderer === "libreoffice"
    ? [groups.libreoffice, groups.generic]
    : renderer === "powerpoint"
      ? [groups.generic]
      : [];
  const selected = preferred.find((group) => group.length > 0)
    || [groups.libreoffice, groups.generic].sort((a, b) => b.length - a.length)[0]
    || [];
  if (expectedPages > 0 && selected.length < expectedPages) return [];
  return selected
    .slice()
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .slice(0, expectedPages > 0 ? expectedPages : undefined)
    .map((name) => path.join(renderDir, name));
}

function findRenderDirsFromQualityReports({ qualityRoot, pptxFile }) {
  if (!qualityRoot || !fs.existsSync(qualityRoot) || !pptxFile) return [];
  const expectedPptx = path.resolve(pptxFile);
  const expectedPptxName = path.basename(pptxFile);
  const result = [];
  for (const reportFile of findQualityReports(qualityRoot)) {
    const report = readJsonOrNull(reportFile);
    if (!report) continue;
    const reportPptx = report.pptxFile || report.inputPptx || report.targetPptx || "";
    const matches = reportPptx
      && (path.resolve(reportPptx) === expectedPptx || path.basename(reportPptx) === expectedPptxName);
    if (matches && report.render?.renderDir) result.push(path.resolve(report.render.renderDir));
  }
  return result;
}

function findQualityReports(root) {
  const result = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile() && entry.name === "quality-gate-report.json") result.push(file);
    }
  }
  return result;
}

function findRenderDirsByPrefix(renderRoot, values) {
  if (!fs.existsSync(renderRoot)) return [];
  // Keep recognizing legacy cache folders that used the raw deck prefix,
  // while new folders include a collision-safe hash suffix.
  const prefixes = unique(values.filter(Boolean).flatMap((value) => [
    shortCacheName(value),
    sanitizePathPart(value)
  ]))
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  return expandRenderCacheCandidates(fs.readdirSync(renderRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => prefixes.some((prefix) => entry.name.toLowerCase().startsWith(prefix)))
    .map((entry) => path.join(renderRoot, entry.name, "render")));
}

function renderSearchNames(values) {
  const result = [];
  for (const value of values) {
    const text = String(value || "");
    if (!text) continue;
    result.push(text);
    result.push(text.replace(/\.native(?:-editable)?(?:\.ir)?$/i, ""));
    result.push(text.replace(/\.native(?:-editable)?$/i, ""));
    result.push(text.replace(/\.ir$/i, ""));
  }
  return unique(result);
}

function readJsonOrNull(file) {
  try {
    return readJson(file);
  } catch {
    return null;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function readRenderedPages(renderDir, options = {}) {
  const renderedPages = selectRenderedPageFiles(renderDir, options)
    .map((name, index) => ({
      pageIndex: index,
      image: name
    }));
  return {
    provider: "existing-render-dir",
    renderDir,
    renderedPages
  };
}

function sanitizePathPart(value) {
  return String(value || "deck")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "deck";
}

function shortCacheName(value, identity = value) {
  const safe = sanitizePathPart(value);
  const hash = crypto.createHash("sha1").update(String(identity || safe)).digest("hex").slice(0, 8);
  if (safe.length <= 39) return `${safe}-${hash}`;
  return `${safe.slice(0, 39)}-${hash}`;
}

function realWorkspaceCwd() {
  try {
    return fs.realpathSync.native(process.cwd());
  } catch {
    return process.cwd();
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

module.exports = {
  countRenderedPages,
  expectedRenderPageCount,
  findRenderDirsByIdentity,
  findRenderDirsByPrefix,
  findRenderDirsFromQualityReports,
  readRenderedPages,
  realWorkspaceCwd,
  resolveFreshRenderOutputDir,
  resolveRenderOutputDir,
  resolveReusableRenderDir,
  reusableRenderMatches,
  selectRenderedPageFiles
};
