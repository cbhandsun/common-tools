"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const STORE_PROVIDER = "component-asset-store-v1";
const INVENTORY_PROVIDER = "plugin-component-registry-v1";
const DEFAULT_MAX_SOURCE_BYTES = 250 * 1024 * 1024;
const MATERIALIZABLE_KINDS = new Set([
  "presentation-template",
  "chart-template",
  "theme",
  "vector-component",
  "bitmap-reference"
]);

function defaultComponentAssetStoreRoot(env = process.env) {
  const workspaceRoot = path.resolve(String(env.SLIDECLONE_WORKSPACE_ROOT || process.cwd()));
  return path.join(workspaceRoot, "runs", "plugin-component-inventory");
}

function assetRegistryPath(storeRoot) {
  return path.join(path.resolve(storeRoot), "asset-registry.json");
}

function assetDirectory(storeRoot) {
  return path.join(path.resolve(storeRoot), "assets", "sha256");
}

function materializeComponentInventory(inventory, options = {}) {
  validateInventory(inventory);
  const storeRoot = path.resolve(String(options.storeRoot || defaultComponentAssetStoreRoot(options.env)));
  const maxSourceBytes = positiveInteger(options.maxSourceBytes, DEFAULT_MAX_SOURCE_BYTES);
  const includeReferenceAssets = options.includeReferenceAssets === true;
  const strict = options.strict !== false;
  const existing = readComponentAssetRegistry(assetRegistryPath(storeRoot), { allowMissing: true });
  const assetsByHash = new Map(existing.assets.map((asset) => [asset.sha256, asset]));
  const results = [];

  fs.mkdirSync(assetDirectory(storeRoot), { recursive: true });
  for (const candidate of inventory.candidates) {
    if (!shouldMaterializeCandidate(candidate, { includeReferenceAssets })) {
      results.push({ status: "not-adopted", id: safeId(candidate?.id), name: safeBasename(candidate?.name) });
      continue;
    }
    try {
      const asset = materializeCandidate(candidate, { storeRoot, maxSourceBytes });
      const previous = assetsByHash.get(asset.sha256);
      assetsByHash.set(asset.sha256, mergeStoredAsset(previous, asset));
      results.push({ status: previous ? "deduplicated" : "materialized", id: asset.id, sha256: asset.sha256, relativePath: asset.relativePath });
    } catch (error) {
      results.push({ status: "failed", id: safeId(candidate?.id), name: safeBasename(candidate?.name), error: safeErrorMessage(error) });
    }
  }

  const failed = results.filter((result) => result.status === "failed");
  if (strict && failed.length > 0) {
    throw new Error(`component asset materialization failed for ${failed.length} adopted candidate(s): ${failed.map((item) => item.name || item.id).join(", ")}`);
  }
  const registry = {
    provider: STORE_PROVIDER,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    assetRoot: "assets/sha256",
    summary: summarizeResults(results, assetsByHash.size),
    assets: [...assetsByHash.values()].sort((left, right) => left.sha256.localeCompare(right.sha256))
  };
  writeJsonAtomic(assetRegistryPath(storeRoot), registry);
  return { registry, results };
}

function materializeCandidate(candidate, options) {
  if (!candidate || typeof candidate !== "object") throw new Error("candidate must be an object");
  const sourcePath = String(candidate.path || "");
  if (!sourcePath || !path.isAbsolute(sourcePath)) throw new Error("candidate path must be absolute");
  const stat = fs.lstatSync(sourcePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("candidate path must resolve to a regular non-symlink file");
  if (stat.size <= 0 || stat.size > options.maxSourceBytes) throw new Error("candidate file size is outside the asset-store boundary");
  const extension = normalizedExtension(candidate.extension || path.extname(sourcePath));
  if (!extension) throw new Error("candidate extension is not materializable");
  const sha256 = hashFile(sourcePath);
  const relativePath = path.posix.join("assets", "sha256", `${sha256}${extension}`);
  const destination = resolveStoreRelativePath(options.storeRoot, relativePath);
  copyFileAtomicVerified(sourcePath, destination, sha256, stat.size);
  return {
    id: safeId(candidate.id) || `${safeProvider(candidate.provider)}-${sha256.slice(0, 12)}`,
    sha256,
    relativePath,
    extension,
    sizeBytes: stat.size,
    provider: safeProvider(candidate.provider),
    assetKind: safeAssetKind(candidate.assetKind),
    sourceName: safeBasename(candidate.name || path.basename(sourcePath)),
    sourcePathHash: crypto.createHash("sha256").update(path.normalize(sourcePath).toLowerCase()).digest("hex"),
    roleTags: safeStrings([...(candidate.roleTags || []), "local-materialized"]),
    reusePolicy: safeText(candidate.reusePolicy, 160),
    ...(safeLearningSummary(candidate.learningSummary) ? { learningSummary: safeLearningSummary(candidate.learningSummary) } : {}),
    ...(safeStructureSignature(candidate.structureSignature) ? { structureSignature: safeStructureSignature(candidate.structureSignature) } : {}),
    ...(candidate.selfFidelityPromoted === true ? { selfFidelityPromoted: true } : {}),
    ...(candidate.selfFidelity && typeof candidate.selfFidelity === "object" ? { selfFidelity: sanitizeFidelity(candidate.selfFidelity) } : {})
  };
}

function shouldMaterializeCandidate(candidate = {}, options = {}) {
  if (!MATERIALIZABLE_KINDS.has(String(candidate.assetKind || ""))) return false;
  if (options.includeReferenceAssets === true) return true;
  const tags = new Set(Array.isArray(candidate.roleTags) ? candidate.roleTags.map(String) : []);
  return candidate.selfFidelityPromoted === true || tags.has("applied-component") || tags.has("downloaded-component");
}

function readComponentAssetRegistry(file, options = {}) {
  const resolved = path.resolve(String(file || ""));
  if (!fs.existsSync(resolved)) {
    if (options.allowMissing === true) return emptyRegistry();
    throw new Error("component asset registry does not exist");
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || stat.size <= 0 || stat.size > 32 * 1024 * 1024) throw new Error("component asset registry exceeds the read boundary");
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/, ""));
  if (parsed?.provider !== STORE_PROVIDER || parsed?.schemaVersion !== 1 || !Array.isArray(parsed.assets)) {
    throw new Error("component asset registry has an invalid contract");
  }
  const assets = parsed.assets.map(validateStoredAsset);
  return { ...parsed, assets };
}

function registryCandidates(registry, storeRoot, options = {}) {
  if (!registry || registry.provider !== STORE_PROVIDER || !Array.isArray(registry.assets)) return [];
  const requireFiles = options.requireFiles !== false;
  const root = path.resolve(storeRoot);
  return registry.assets.map((asset) => {
    const validated = validateStoredAsset(asset);
    const file = resolveStoreRelativePath(root, validated.relativePath);
    if (requireFiles) verifyStoredFile(file, validated);
    return {
      id: validated.id,
      provider: validated.provider,
      root: assetDirectory(root),
      path: file,
      name: validated.sourceName || path.basename(file),
      extension: validated.extension,
      sizeBytes: validated.sizeBytes,
      modifiedAt: safeModifiedAt(file),
      assetKind: validated.assetKind,
      roleTags: safeStrings([...(validated.roleTags || []), "local-materialized"]),
      reusePolicy: validated.reusePolicy,
      score: 200,
      contentSha256: validated.sha256,
      storeRelativePath: validated.relativePath,
      ...(validated.learningSummary ? { learningSummary: validated.learningSummary } : {}),
      ...(validated.structureSignature ? { structureSignature: validated.structureSignature } : {}),
      ...(validated.selfFidelityPromoted === true ? { selfFidelityPromoted: true } : {}),
      ...(validated.selfFidelity ? { selfFidelity: validated.selfFidelity } : {})
    };
  });
}

function validateInventory(inventory) {
  if (!inventory || typeof inventory !== "object" || inventory.provider !== INVENTORY_PROVIDER || !Array.isArray(inventory.candidates)) {
    throw new Error("component inventory has an invalid contract");
  }
  if (inventory.candidates.length > 10000) throw new Error("component inventory exceeds the candidate boundary");
}

function validateStoredAsset(asset) {
  if (!asset || typeof asset !== "object") throw new Error("component asset entry must be an object");
  const sha256 = String(asset.sha256 || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("component asset sha256 is invalid");
  const extension = normalizedExtension(asset.extension);
  const expected = path.posix.join("assets", "sha256", `${sha256}${extension}`);
  if (String(asset.relativePath || "").replace(/\\/g, "/") !== expected) throw new Error("component asset relative path is invalid");
  const sizeBytes = positiveInteger(asset.sizeBytes, 0);
  if (!sizeBytes) throw new Error("component asset size is invalid");
  const assetKind = safeAssetKind(asset.assetKind);
  if (!assetKind) throw new Error("component asset kind is invalid");
  return {
    ...asset,
    id: safeId(asset.id) || `local-${sha256.slice(0, 12)}`,
    sha256,
    relativePath: expected,
    extension,
    sizeBytes,
    provider: safeProvider(asset.provider),
    assetKind,
    sourceName: safeBasename(asset.sourceName),
    sourcePathHash: /^[a-f0-9]{64}$/i.test(String(asset.sourcePathHash || "")) ? String(asset.sourcePathHash).toLowerCase() : "",
    roleTags: safeStrings(asset.roleTags),
    aliases: safeStrings(asset.aliases),
    reusePolicy: safeText(asset.reusePolicy, 160),
    learningSummary: safeLearningSummary(asset.learningSummary),
    structureSignature: safeStructureSignature(asset.structureSignature),
    selfFidelity: asset.selfFidelity && typeof asset.selfFidelity === "object" ? sanitizeFidelity(asset.selfFidelity) : null
  };
}

function resolveStoreRelativePath(storeRoot, relativePath) {
  const root = path.resolve(storeRoot);
  const resolved = path.resolve(root, String(relativePath || ""));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("component asset path escapes the store root");
  return resolved;
}

function copyFileAtomicVerified(source, destination, sha256, sizeBytes) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination)) {
    verifyStoredFile(destination, { sha256, sizeBytes });
    return;
  }
  const temporary = `${destination}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL);
    verifyStoredFile(temporary, { sha256, sizeBytes });
    try {
      fs.renameSync(temporary, destination);
    } catch (error) {
      if (!fs.existsSync(destination)) throw error;
      verifyStoredFile(destination, { sha256, sizeBytes });
    }
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

function verifyStoredFile(file, asset) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size !== Number(asset.sizeBytes) || hashFile(file) !== asset.sha256) {
    throw new Error("component asset failed integrity verification");
  }
}

function hashFile(file) {
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const handle = fs.openSync(file, "r");
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest("hex");
}

function mergeStoredAsset(previous, next) {
  if (!previous) return next;
  return {
    ...next,
    ...previous,
    id: previous.id || next.id,
    roleTags: safeStrings([...(previous.roleTags || []), ...(next.roleTags || [])]),
    aliases: safeStrings([...(previous.aliases || []), previous.sourceName, next.sourceName]).filter((name) => name !== next.sourceName)
  };
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  const backup = `${file}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.previous`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    if (!fs.existsSync(file)) {
      fs.renameSync(temporary, file);
      return;
    }
    fs.renameSync(file, backup);
    try {
      fs.renameSync(temporary, file);
      fs.rmSync(backup, { force: true });
    } catch (error) {
      if (!fs.existsSync(file) && fs.existsSync(backup)) fs.renameSync(backup, file);
      throw error;
    }
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
    if (fs.existsSync(backup) && fs.existsSync(file)) fs.rmSync(backup, { force: true });
  }
}

function summarizeResults(results, storedAssets) {
  const summary = { candidates: results.length, storedAssets, materialized: 0, deduplicated: 0, skipped: 0, failed: 0 };
  for (const result of results) {
    if (result.status === "materialized") summary.materialized += 1;
    else if (result.status === "deduplicated") summary.deduplicated += 1;
    else if (result.status === "failed") summary.failed += 1;
    else summary.skipped += 1;
  }
  return summary;
}

function emptyRegistry() {
  return { provider: STORE_PROVIDER, schemaVersion: 1, assetRoot: "assets/sha256", assets: [] };
}

function normalizedExtension(value) {
  const extension = String(value || "").trim().toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : "";
}

function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function safeProvider(value) {
  return safeText(value, 80).toLowerCase().replace(/[^a-z0-9._-]/g, "-") || "unknown-plugin";
}

function safeAssetKind(value) {
  const kind = safeText(value, 80).toLowerCase();
  return MATERIALIZABLE_KINDS.has(kind) ? kind : "";
}

function safeId(value) {
  return safeText(value, 120).replace(/[^A-Za-z0-9._-]/g, "-");
}

function safeBasename(value) {
  return path.basename(safeText(value, 260));
}

function safeText(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength);
}

function safeStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => safeText(value, 120)).filter(Boolean))].sort();
}

function safeErrorMessage(error) {
  const message = safeText(error?.message || "component asset materialization failed", 240);
  return message.replace(/[A-Za-z]:\\[^:]+/g, "[local-path]");
}

function safeLearningSummary(value) {
  return sanitizeEmbeddedMetadata(value);
}

function safeStructureSignature(value) {
  return sanitizeEmbeddedMetadata(value);
}

function sanitizeEmbeddedMetadata(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const text = safeText(value, 1000);
    return isAbsoluteLikePath(text) ? "[local-path]" : text;
  }
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => sanitizeEmbeddedMetadata(item, depth + 1));
  if (typeof value !== "object") return null;
  const output = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 500)) {
    const key = safeText(rawKey, 120).replace(/[^A-Za-z0-9._-]/g, "_");
    if (!key || /^(?:path|file|root|reportFile|replayPptx|sourcePath)$/i.test(key)) continue;
    output[key] = sanitizeEmbeddedMetadata(rawValue, depth + 1);
  }
  return output;
}

function isAbsoluteLikePath(value) {
  return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
}

function sanitizeFidelity(value) {
  return {
    passed: value.passed === true,
    ...(typeof value.sha256 === "string" && /^[a-f0-9]{64}$/i.test(value.sha256) ? { sha256: value.sha256.toLowerCase() } : {})
  };
}

function safeModifiedAt(file) {
  try {
    return fs.statSync(file).mtime.toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

module.exports = {
  STORE_PROVIDER,
  assetDirectory,
  assetRegistryPath,
  defaultComponentAssetStoreRoot,
  materializeComponentInventory,
  readComponentAssetRegistry,
  registryCandidates,
  shouldMaterializeCandidate,
  _private: {
    hashFile,
    resolveStoreRelativePath,
    validateStoredAsset
  }
};
