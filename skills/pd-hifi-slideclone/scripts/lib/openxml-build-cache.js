"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { readZipEntries } = require("./pptx-zip");
const { maintainHashedCache } = require("./cache-budget");

const CACHE_VERSION = 1;
const MAX_PPTX_BYTES = 256 * 1024 * 1024;

function createOpenXmlBuildCacheIdentity(job, builder, projectDir, options = {}) {
  const fileMemo = options.fileMemo instanceof Map ? options.fileMemo : new Map();
  const ir = JSON.parse(fs.readFileSync(job.irFile, "utf8"));
  const irDir = path.dirname(job.irFile);
  const canonicalIr = canonicalizeIr(ir, irDir, "", fileMemo);
  const payload = {
    version: CACHE_VERSION,
    ir: canonicalIr,
    template: fileIdentity(job.templatePptx, fileMemo),
    builder: builderIdentity(builder, projectDir, fileMemo),
    powerPointSafe: options.powerPointSafe === true
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function canonicalizeIr(value, irDir, key = "", fileMemo = new Map()) {
  if (Array.isArray(value)) return value.map((item) => canonicalizeIr(item, irDir, "", fileMemo));
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const name of Object.keys(value).sort()) {
    const item = value[name];
    if ((name === "assetPath" || name === "sourceImage") && typeof item === "string" && item) {
      const resolved = path.isAbsolute(item) ? path.normalize(item) : path.resolve(irDir, item);
      output[name] = fileIdentity(resolved, fileMemo);
    } else {
      output[name] = canonicalizeIr(item, irDir, name, fileMemo);
    }
  }
  return output;
}

function builderIdentity(builder, projectDir, fileMemo) {
  const executableFiles = [builder.command, ...(builder.args || [])]
    .filter((value) => typeof value === "string" && path.isAbsolute(value) && existingFile(value));
  const sources = [...new Set([...executableFiles, ...listBuilderSources(projectDir)])].sort((left, right) => left.localeCompare(right));
  return {
    command: path.basename(String(builder.command || "")),
    args: (builder.args || []).map((value) => path.isAbsolute(value) ? path.basename(value) : value),
    files: sources.map((file) => ({ name: path.relative(projectDir, file).replace(/\\/g, "/"), ...fileIdentity(file, fileMemo) }))
  };
}

function listBuilderSources(projectDir) {
  if (!fs.existsSync(projectDir)) return [];
  return fs.readdirSync(projectDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (/\.cs$/.test(entry.name) || /\.csproj$/.test(entry.name) || entry.name === "packages.lock.json"))
    .map((entry) => path.join(projectDir, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function readOpenXmlBuildCache(cacheDir, key, outFile) {
  const entryDir = cacheEntryDir(cacheDir, key);
  const manifestFile = path.join(entryDir, "manifest.json");
  const pptxFile = path.join(entryDir, "deck.pptx");
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    if (manifest.version !== CACHE_VERSION || manifest.key !== key || manifest.bytes < 22 || manifest.bytes > MAX_PPTX_BYTES) return null;
    const stat = fs.statSync(pptxFile);
    if (!stat.isFile() || stat.size !== manifest.bytes) return null;
    const inspection = inspectPptxPackage(pptxFile);
    if (inspection.sha256 !== manifest.sha256) return null;
    copyAtomic(pptxFile, outFile);
    return Object.freeze({ hit: true, key, bytes: stat.size });
  } catch {
    return null;
  }
}

function writeOpenXmlBuildCache(cacheDir, key, pptxFile, options = {}) {
  const inspection = inspectPptxPackage(pptxFile);
  const stat = fs.statSync(pptxFile);
  if (stat.size > MAX_PPTX_BYTES) throw new Error("OpenXML build cache output exceeds the cache boundary");
  const entryDir = cacheEntryDir(cacheDir, key);
  const parent = path.dirname(entryDir);
  fs.mkdirSync(parent, { recursive: true });
  const staging = `${entryDir}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(staging, { mode: 0o700 });
  try {
    fs.copyFileSync(pptxFile, path.join(staging, "deck.pptx"));
    fs.writeFileSync(path.join(staging, "manifest.json"), `${JSON.stringify({
      version: CACHE_VERSION,
      key,
      bytes: stat.size,
      sha256: inspection.sha256,
      createdAt: new Date().toISOString()
    }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    if (fs.existsSync(entryDir)) fs.rmSync(entryDir, { recursive: true, force: true });
    fs.renameSync(staging, entryDir);
    maintainHashedCache({ root: cacheDir, maxBytes: options.maxBytes || 20 * 1024 * 1024 * 1024, layout: "nested" });
    return Object.freeze({ stored: true, key, bytes: stat.size });
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function validatePptxPackage(file) {
  return { entries: inspectPptxPackage(file).entries };
}

function inspectPptxPackage(file) {
  const buffer = fs.readFileSync(file);
  const entries = readZipEntries(buffer, { maxArchiveBytes: MAX_PPTX_BYTES, maxEntries: 20_000 });
  const names = new Set(entries.map((entry) => entry.name));
  if (!names.has("[Content_Types].xml") || !names.has("ppt/presentation.xml")) {
    throw new Error("OpenXML build output is not a valid PPTX package");
  }
  return { entries: entries.length, sha256: crypto.createHash("sha256").update(buffer).digest("hex") };
}

function cacheEntryDir(cacheDir, key) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("OpenXML build cache key is invalid");
  return path.join(path.resolve(cacheDir), key.slice(0, 2), key);
}

function copyAtomic(source, destination) {
  const resolved = path.resolve(destination);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temp = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.copyFileSync(source, temp);
    fs.renameSync(temp, resolved);
  } catch (error) {
    try { fs.rmSync(temp, { force: true }); } catch {}
    throw error;
  }
}

function fileIdentity(file, memo = new Map()) {
  if (!file) return null;
  const resolved = path.resolve(file);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error("OpenXML build cache dependency is not a file");
  const memoKey = `${resolved}\0${stat.size}\0${stat.mtimeMs}\0${stat.ctimeMs}`;
  if (!memo.has(memoKey)) memo.set(memoKey, { bytes: stat.size, sha256: sha256File(resolved) });
  return memo.get(memoKey);
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function existingFile(file) {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}

module.exports = {
  CACHE_VERSION,
  createOpenXmlBuildCacheIdentity,
  readOpenXmlBuildCache,
  validatePptxPackage,
  writeOpenXmlBuildCache
};
