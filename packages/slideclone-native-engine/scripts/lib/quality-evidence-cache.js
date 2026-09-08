"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { maintainHashedCache } = require("./cache-budget");
const diffPixelPng = require("../adapters/diff-pixel-png");
const compareThresholds = require("../adapters/compare-placeholder");

const VERSION = 1;
const MAX_FILES = 5000;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;

function createQualityEvidenceIdentity({ ir, irFile = "", render, config = {}, thresholds = {}, implementationFiles = [] }) {
  const sourceFiles = new Map();
  const renderedFiles = new Map();
  for (const page of ir?.pages || []) {
    if (typeof page?.sourceImage === "string") sourceFiles.set(Number(page.pageIndex), path.resolve(page.sourceImage));
  }
  for (const page of render?.renderedPages || []) {
    if (typeof page?.image === "string") renderedFiles.set(Number(page.pageIndex), path.resolve(page.image));
  }
  const baseDir = irFile ? path.dirname(path.resolve(irFile)) : process.cwd();
  const canonicalIr = canonicalizeIrValue(ir, baseDir);
  const payload = {
    version: VERSION,
    ir: canonicalIr,
    sources: fileMapIdentity(sourceFiles),
    rendered: fileMapIdentity(renderedFiles),
    config: canonicalConfig(config, baseDir),
    thresholds,
    implementation: implementationFiles.map((file) => fileIdentity(path.resolve(file)))
  };
  return {
    key: sha256Json(payload),
    payload,
    sourceFiles,
    renderedFiles
  };
}

async function loadOrComputeQualityEvidence({ cacheDir, identity, outputDir, qualityIrFile, ir, render, thresholds, context, iteration = 0, progress = () => {} }) {
  const cachedEvidence = identity ? readQualityEvidenceCache({ cacheDir, identity, outputDir }) : null;
  const diffStartedAt = Date.now();
  const diff = cachedEvidence ? { ok: true, data: cachedEvidence.diff } : await diffPixelPng({ irFile: qualityIrFile, ir, render, iteration }, context);
  if (diff?.ok !== true) throw new Error(diff?.error || "diff-pixel-png failed");
  const diffMs = Date.now() - diffStartedAt;
  progress({ phase: "diff", status: "done", elapsedMs: diffMs, pages: diff.data?.metrics?.length || 0 });
  const compareStartedAt = Date.now();
  progress({ phase: "compare", status: "start" });
  const compare = cachedEvidence ? { ok: true, data: cachedEvidence.compare } : await compareThresholds({
    irFile: qualityIrFile, ir, render, diff: diff.data, thresholds, iteration
  }, context);
  if (compare?.ok !== true) throw new Error(compare?.error || "compare-thresholds failed");
  const compareMs = Date.now() - compareStartedAt;
  progress({ phase: "compare", status: "done", elapsedMs: compareMs });
  return {
    cachedEvidence,
    diff,
    compare,
    timings: {
      diffMs,
      diffCacheHit: Boolean(cachedEvidence),
      compareMs,
      compareCacheHit: Boolean(cachedEvidence),
      textOcrMs: cachedEvidence ? 0 : Number(compare.data?.timings?.textOcrMs || 0),
      cachedTextOcrMs: cachedEvidence ? Number(compare.data?.timings?.textOcrMs || 0) : 0
    }
  };
}

function qualityEvidenceImplementationFiles(context = {}, entryFile = "") {
  const files = [entryFile, __filename, require.resolve("../adapters/diff-pixel-png"), require.resolve("../adapters/compare-placeholder"), require.resolve("./png")].filter(Boolean);
  for (const configured of [context.config?.textOcr?.adapter, context.config?.paddleOcr?.workerScript]) {
    try {
      const resolved = resolveContextPath(context, configured);
      if (resolved && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) files.push(resolved);
    } catch {}
  }
  return [...new Set(files.map((file) => path.resolve(file)))];
}

function qualityEvidenceConfig(context = {}) {
  const config = JSON.parse(JSON.stringify(context.config || {}));
  if (config.paddleOcr) { delete config.paddleOcr.brokerToken; delete config.paddleOcr.brokerUrl; }
  const adapter = context.config?.textOcr?.adapter;
  if (!adapter || !/ocr-paddleocr-local\.js$/i.test(adapter)) return config;
  try {
    const implementation = require(resolveContextPath(context, adapter));
    config.paddleOcrIdentity = implementation?._private?.resolveSettings(context)?.identity || null;
  } catch { config.paddleOcrIdentity = "unavailable"; }
  return config;
}

function resolveContextPath(context, value) {
  if (!value || typeof value !== "string") return null;
  if (path.isAbsolute(value)) return path.normalize(value);
  const candidates = [context.configFile ? path.resolve(path.dirname(context.configFile), value) : null, context.skillRoot ? path.resolve(context.skillRoot, value) : null, path.resolve(process.cwd(), value)].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[candidates.length - 1];
}

function readQualityEvidenceCache({ cacheDir, identity, outputDir }) {
  if (!cacheDir || !identity?.key) return null;
  const entryDir = cacheEntryDir(cacheDir, identity.key);
  const manifestFile = path.join(entryDir, "manifest.json");
  try {
    const stat = fs.statSync(manifestFile);
    if (!stat.isFile() || stat.size < 2 || stat.size > MAX_MANIFEST_BYTES) return null;
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    if (manifest?.version !== VERSION || manifest?.key !== identity.key || !Array.isArray(manifest.files)) return null;
    if (manifest.files.length > MAX_FILES) return null;
    let totalBytes = 0;
    for (const item of manifest.files) {
      const relative = safeRelativeFile(item?.path);
      const source = path.join(entryDir, "files", relative);
      const sourceStat = fs.statSync(source);
      totalBytes += sourceStat.size;
      if (!sourceStat.isFile() || sourceStat.size !== item.size || totalBytes > MAX_TOTAL_BYTES || sha256File(source) !== item.sha256) return null;
    }
    for (const item of manifest.files) {
      const relative = safeRelativeFile(item.path);
      const destination = path.join(path.resolve(outputDir), relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(entryDir, "files", relative), destination);
    }
    const tokens = pathTokens({ identity, outputDir });
    return {
      diff: decodePaths(manifest.diff, tokens),
      compare: decodePaths(manifest.compare, tokens),
      contactSheet: manifest.contactSheet ? decodePaths(manifest.contactSheet, tokens) : null,
      key: identity.key,
      files: manifest.files.length
    };
  } catch {
    return null;
  }
}

function writeQualityEvidenceCache({ cacheDir, identity, outputDir, diff, compare, contactSheet, maxBytes }) {
  if (!cacheDir || !identity?.key || !diff || !compare) return null;
  const entryDir = cacheEntryDir(cacheDir, identity.key);
  if (fs.existsSync(path.join(entryDir, "manifest.json"))) {
    const valid = readQualityEvidenceCache({ cacheDir, identity, outputDir });
    if (valid) return { key: identity.key, reused: true, files: valid.files };
  }
  const temporary = `${entryDir}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  const outputRoot = path.resolve(outputDir);
  try {
    fs.mkdirSync(path.join(temporary, "files"), { recursive: true });
    const files = collectEvidenceFiles(outputRoot);
    let totalBytes = 0;
    const manifestFiles = files.map((source) => {
      const relative = safeRelativeFile(path.relative(outputRoot, source));
      const stat = fs.statSync(source);
      totalBytes += stat.size;
      if (!stat.isFile() || totalBytes > MAX_TOTAL_BYTES) throw new Error("quality evidence cache exceeds its size boundary");
      const destination = path.join(temporary, "files", relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
      return { path: relative.replace(/\\/g, "/"), size: stat.size, sha256: sha256File(source) };
    });
    const tokens = pathTokens({ identity, outputDir: outputRoot });
    const manifest = {
      version: VERSION,
      key: identity.key,
      files: manifestFiles,
      diff: encodePaths(diff, tokens),
      compare: encodePaths(compare, tokens),
      contactSheet: contactSheet ? encodePaths(contactSheet, tokens) : null
    };
    const body = `${JSON.stringify(manifest)}\n`;
    if (Buffer.byteLength(body) > MAX_MANIFEST_BYTES) throw new Error("quality evidence cache manifest exceeds its size boundary");
    fs.writeFileSync(path.join(temporary, "manifest.json"), body, { encoding: "utf8", mode: 0o600 });
    fs.mkdirSync(path.dirname(entryDir), { recursive: true });
    if (fs.existsSync(entryDir)) fs.rmSync(entryDir, { recursive: true, force: true });
    fs.renameSync(temporary, entryDir);
    maintainHashedCache({ root: cacheDir, maxBytes: maxBytes || 20 * 1024 * 1024 * 1024, layout: "nested" });
    return { key: identity.key, reused: false, files: manifestFiles.length };
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function tryWriteQualityEvidenceCache(options) {
  try { return writeQualityEvidenceCache(options); } catch { return null; }
}

function collectEvidenceFiles(outputRoot) {
  const result = [];
  for (const relativeRoot of ["diff", "compare"]) {
    const root = path.join(outputRoot, relativeRoot);
    if (!fs.existsSync(root)) continue;
    walkFiles(root, result);
  }
  const contactSheet = path.join(outputRoot, "quality-contact-sheet.png");
  if (fs.existsSync(contactSheet) && fs.statSync(contactSheet).isFile()) result.push(contactSheet);
  if (result.length > MAX_FILES) throw new Error("quality evidence cache file count exceeds its boundary");
  return result;
}

function walkFiles(root, result) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error("quality evidence cache refuses symbolic links");
    if (entry.isDirectory()) walkFiles(file, result);
    else if (entry.isFile()) result.push(file);
    if (result.length > MAX_FILES) throw new Error("quality evidence cache file count exceeds its boundary");
  }
}

function pathTokens({ identity, outputDir }) {
  const encode = new Map([[path.resolve(outputDir), "<OUTPUT>"]]);
  const decode = new Map([["<OUTPUT>", path.resolve(outputDir)]]);
  for (const [pageIndex, file] of identity.sourceFiles || []) {
    encode.set(path.resolve(file), `<SOURCE:${pageIndex}>`);
    decode.set(`<SOURCE:${pageIndex}>`, path.resolve(file));
  }
  for (const [pageIndex, file] of identity.renderedFiles || []) {
    encode.set(path.resolve(file), `<RENDER:${pageIndex}>`);
    decode.set(`<RENDER:${pageIndex}>`, path.resolve(file));
  }
  return { encode, decode };
}

function encodePaths(value, tokens) {
  return transformStrings(value, (text) => replacePathTokens(text, tokens.encode));
}

function decodePaths(value, tokens) {
  return transformStrings(value, (text) => replacePathTokens(text, tokens.decode));
}

function replacePathTokens(text, replacements) {
  let result = text;
  for (const [from, to] of replacements) {
    if (result === from) result = to;
    else if (result.startsWith(`${from}${path.sep}`)) result = `${to}${result.slice(from.length)}`;
  }
  return result;
}

function transformStrings(value, transform) {
  if (typeof value === "string") return transform(value);
  if (Array.isArray(value)) return value.map((item) => transformStrings(item, transform));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, transformStrings(item, transform)]));
}

function canonicalizeIrValue(value, baseDir, key = "") {
  if (Array.isArray(value)) return value.map((item) => canonicalizeIrValue(item, baseDir, key));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && /^(sourceImage|assetPath)$/i.test(key)) {
      const file = path.isAbsolute(value) ? value : path.resolve(baseDir, value);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return { file: fileIdentity(file) };
    }
    return value;
  }
  return Object.fromEntries(Object.keys(value).sort().map((name) => [name, canonicalizeIrValue(value[name], baseDir, name)]));
}

function canonicalConfig(config, baseDir) {
  return canonicalizeIrValue(config, baseDir);
}

function fileMapIdentity(files) {
  return [...files.entries()].sort((a, b) => a[0] - b[0]).map(([pageIndex, file]) => ({ pageIndex, ...fileIdentity(file) }));
}

function fileIdentity(file) {
  const resolved = path.resolve(file);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error("quality evidence input must be a file");
  return { size: stat.size, sha256: sha256File(resolved) };
}

function safeRelativeFile(value) {
  const normalized = String(value || "").replace(/\\/g, "/");
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("quality evidence cache path is invalid");
  }
  return normalized.split("/").join(path.sep);
}

function cacheEntryDir(cacheDir, key) {
  if (!/^[a-f0-9]{64}$/.test(String(key))) throw new Error("quality evidence cache key is invalid");
  const root = path.resolve(String(cacheDir));
  return path.join(root, key.slice(0, 2), key);
}

function sha256Json(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

module.exports = {
  createQualityEvidenceIdentity,
  loadOrComputeQualityEvidence,
  qualityEvidenceConfig,
  qualityEvidenceImplementationFiles,
  readQualityEvidenceCache,
  tryWriteQualityEvidenceCache,
  writeQualityEvidenceCache,
  _private: { canonicalizeIrValue, safeRelativeFile, transformStrings }
};
