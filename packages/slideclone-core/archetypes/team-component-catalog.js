"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_REGISTRY_BYTES = 4 * 1024 * 1024;
const MAX_ASSETS = 100;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

/**
 * Loads a small, integrity-checked view of a team component store.
 * The asset-store reader is injected so this package remains portable.
 */
function loadTeamComponentCatalog(options) {
  const config = requirePlainObject(options, "component catalog options");
  const root = requireOwnedRoot(readOwn(config, "root"));
  const readRegistry = requireFunction(readOwn(config, "readRegistry"), "readRegistry");
  const getCandidates = requireFunction(readOwn(config, "registryCandidates"), "registryCandidates");
  const registryFile = path.join(root.configured, "asset-registry.json");
  const registryStat = regularFile(registryFile, "component catalog registry");
  if (registryStat.size <= 0 || registryStat.size > MAX_REGISTRY_BYTES) {
    throw new Error("component catalog registry exceeds the read boundary");
  }
  const registrySha256 = hashFile(registryFile);
  const registry = requirePlainObject(readRegistry(registryFile), "component catalog registry");
  const assets = readOwn(registry, "assets");
  if (!Array.isArray(assets) || assets.length > MAX_ASSETS) {
    throw new Error("component catalog assets exceed the boundary");
  }

  const selected = [];
  const selectedByHash = new Map();
  for (const asset of assets) {
    const entry = requirePlainObject(asset, "component catalog asset");
    if (readOwn(entry, "selfFidelityPromoted") !== true) continue;
    const validated = validatePromotedAsset(asset);
    if (selectedByHash.has(validated.sha256)) throw new Error("component catalog contains duplicate assets");
    selected.push(asset);
    selectedByHash.set(validated.sha256, validated);
  }
  const candidates = getCandidates({ ...registry, assets: selected }, root.configured, { requireFiles: true });
  if (!Array.isArray(candidates) || candidates.length !== selected.length) {
    throw new Error("component catalog candidate verification is incomplete");
  }

  const assetDirectory = requireAssetDirectory(root.real);
  let totalBytes = 0;
  const verifiedCandidates = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const validated = validateCandidate(candidate, selectedByHash, root.real, assetDirectory);
    if (seen.has(validated.sha256)) throw new Error("component catalog contains duplicate candidates");
    seen.add(validated.sha256);
    totalBytes += validated.sizeBytes;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TOTAL_BYTES) {
      throw new Error("component catalog assets exceed the total size boundary");
    }
    const matchingMetadata = {};
    for (const key of ["provider", "name", "modifiedAt", "roleTags", "reusePolicy", "learningSummary", "structureSignature"]) {
      const value = readOwn(candidate, key);
      if (value !== undefined) matchingMetadata[key] = value;
    }
    verifiedCandidates.push({
      ...matchingMetadata,
      id: validated.id,
      path: validated.path,
      sha256: validated.sha256,
      extension: validated.extension,
      sizeBytes: validated.sizeBytes,
      assetKind: validated.assetKind,
      selfFidelityPromoted: true,
      selfFidelity: { passed: true }
    });
  }
  if (seen.size !== selectedByHash.size) throw new Error("component catalog candidate verification is incomplete");

  return {
    inventory: { provider: "plugin-component-registry-v1", candidates: verifiedCandidates },
    evidence: { registrySHA256: registrySha256, assetCount: selected.length, candidateCount: verifiedCandidates.length, totalBytes }
  };
}

function requireOwnedRoot(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error("component catalog root must be an absolute path");
  const configured = path.resolve(value);
  const stat = lstat(configured, "component catalog root");
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("component catalog root must be a non-symlink directory");
  const real = fs.realpathSync.native(configured);
  return { configured, real };
}

function requireAssetDirectory(root) {
  const directory = path.join(root, "assets", "sha256");
  const stat = lstat(directory, "component catalog asset directory");
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("component catalog asset directory must be a non-symlink directory");
  const real = fs.realpathSync.native(directory);
  if (!isInside(root, real)) throw new Error("component catalog asset directory escapes the root");
  return real;
}

function validatePromotedAsset(asset) {
  const entry = requirePlainObject(asset, "component catalog asset");
  const sha256 = requireSha(readOwn(entry, "sha256"));
  const extension = requireExtension(readOwn(entry, "extension"));
  const sizeBytes = requireSize(readOwn(entry, "sizeBytes"));
  if (readOwn(entry, "selfFidelityPromoted") !== true) throw new Error("component catalog asset is not self-fidelity promoted");
  const fidelity = requirePlainObject(readOwn(entry, "selfFidelity"), "component catalog self-fidelity evidence");
  if (readOwn(fidelity, "passed") !== true) throw new Error("component catalog asset has not passed self-fidelity");
  return { sha256, extension, sizeBytes, assetKind: safeLabel(readOwn(entry, "assetKind"), 80), id: safeId(readOwn(entry, "id"), sha256) };
}

function validateCandidate(candidate, selected, root, assetDirectory) {
  const item = requirePlainObject(candidate, "component catalog candidate");
  const sha256 = requireSha(readOwn(item, "contentSha256"));
  const stored = selected.get(sha256);
  if (!stored) throw new Error("component catalog candidate is not selected by the registry");
  const extension = requireExtension(readOwn(item, "extension"));
  const sizeBytes = requireSize(readOwn(item, "sizeBytes"));
  if (extension !== stored.extension || sizeBytes !== stored.sizeBytes) throw new Error("component catalog candidate does not match the registry");
  if (readOwn(item, "selfFidelityPromoted") !== true) throw new Error("component catalog candidate is not self-fidelity promoted");
  const fidelity = requirePlainObject(readOwn(item, "selfFidelity"), "component catalog candidate self-fidelity evidence");
  if (readOwn(fidelity, "passed") !== true) throw new Error("component catalog candidate has not passed self-fidelity");
  const candidatePath = readOwn(item, "path");
  if (typeof candidatePath !== "string" || !path.isAbsolute(candidatePath)) throw new Error("component catalog candidate path is invalid");
  const expected = path.join(assetDirectory, `${sha256}${extension}`);
  const stat = regularFile(expected, "component catalog asset");
  const real = fs.realpathSync.native(expected);
  let candidateReal;
  try { candidateReal = fs.realpathSync.native(candidatePath); }
  catch { throw new Error("component catalog candidate path is outside the asset directory"); }
  if (candidateReal !== real) throw new Error("component catalog candidate path is outside the asset directory");
  if (real !== expected || !isInside(root, real) || !isInside(assetDirectory, real) || stat.size !== sizeBytes) {
    throw new Error("component catalog asset path or size is invalid");
  }
  return { sha256, extension, sizeBytes, path: real, assetKind: stored.assetKind, id: stored.id };
}

function regularFile(file, label) {
  const stat = lstat(file, label);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
  return stat;
}

function lstat(file, label) {
  try { return fs.lstatSync(file); } catch { throw new Error(`${label} does not exist`); }
}

function requirePlainObject(value, label) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error();
    return value;
  } catch { throw new Error(`${label} must be a plain object`); }
}

function readOwn(object, key) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor) return undefined;
    if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) throw new Error();
    return descriptor.value;
  } catch { throw new Error("component catalog input is unsafe"); }
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new Error(`component catalog ${name} must be a function`);
  return value;
}

function requireSha(value) {
  const sha = typeof value === "string" ? value.toLowerCase() : "";
  if (!/^[a-f0-9]{64}$/.test(sha)) throw new Error("component catalog sha256 is invalid");
  return sha;
}

function requireExtension(value) {
  const extension = typeof value === "string" ? value.toLowerCase() : "";
  if (!/^\.[a-z0-9]{1,8}$/.test(extension)) throw new Error("component catalog extension is invalid");
  return extension;
}

function requireSize(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("component catalog asset size is invalid");
  return value;
}

function safeId(value, sha256) {
  const id = typeof value === "string" ? value.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 120) : "";
  return id || `local-${sha256.slice(0, 12)}`;
}

function safeLabel(value, maxLength) {
  if (typeof value !== "string") return "";
  let clean = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code >= 32 && code !== 127) clean += character;
  }
  return clean.slice(0, maxLength);
}

function isInside(root, target) {
  return target !== root && target.startsWith(`${root}${path.sep}`);
}

function hashFile(file) {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(file);
  hash.update(data);
  return hash.digest("hex");
}

module.exports = { loadTeamComponentCatalog, _private: { validatePromotedAsset, validateCandidate } };
