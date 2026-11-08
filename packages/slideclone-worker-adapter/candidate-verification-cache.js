// @ts-check
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { types } = require("node:util");
const { safeAssetPath } = require("../slideclone-core/deck-ir-admission");
const { readZipEntries, readZipEntry } = require("../slideclone-core/pptx-zip");

const CACHE_VERSION = 2;
const DEFAULT_MAX_ENTRIES = 64;
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_RESULT_BYTES = 4 * 1024 * 1024;
const MAX_BINDING_BYTES = 64 * 1024 * 1024;
const MAX_IDENTITY_FILE_BYTES = 256 * 1024 * 1024;
const MAX_IDENTITY_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_PPTX_ENTRIES = 2048;
const MAX_PPTX_EXPANDED_BYTES = 512 * 1024 * 1024;
const MAX_PPTX_ENTRY_BYTES = 128 * 1024 * 1024;
/** @typedef {Readonly<{key:string,root:string,sourceCount:number,quality:unknown,bytes:number}>} VerificationCacheEntry */
/** @typedef {Readonly<{key:string|null,cached:unknown,getEntry:()=>VerificationCacheEntry|null,isCurrent:()=>boolean,commit:(quality:unknown)=>boolean}>} VerificationCacheAttempt */
/** @type {WeakSet<object>} */
const verificationEntries = new WeakSet();

/** @param {unknown} value @returns {value is VerificationCacheEntry} */
function isCandidateVerificationCacheEntry(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && verificationEntries.has(value);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || types.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Object.getOwnPropertySymbols(value).length === 0
    && Object.keys(descriptors).length === Object.keys(value).length
    && Object.values(descriptors).every((descriptor) => "value" in descriptor && descriptor.enumerable === true);
}

/** @param {Record<string, unknown>} value @param {string} key @returns {unknown} */
function ownValue(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

/** @param {unknown} value @param {number} minimum @param {number} maximum @param {number} fallback @param {string} label */
function boundedInteger(value, minimum, maximum, fallback, label) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new RangeError(`${label} is outside the cache boundary`);
  }
  return Number(value);
}

/** Canonicalizes bounded JSON data without invoking getters, proxies, or toJSON methods.
 * @param {unknown} value @param {number} [maximumBytes] */
function canonicalEncode(value, maximumBytes = MAX_BINDING_BYTES) {
  let nodes = 0;
  let chargedBytes = 0;
  const seen = new Set();
  /** @param {number} bytes */
  function charge(bytes) {
    chargedBytes += bytes;
    if (!Number.isSafeInteger(chargedBytes) || chargedBytes > maximumBytes) {
      throw new RangeError("candidate verification data exceeds the cache byte boundary");
    }
  }
  /** @param {unknown} item @param {number} depth @returns {unknown} */
  function visit(item, depth) {
    nodes += 1;
    if (nodes > 250000 || depth > 48) throw new RangeError("candidate verification data exceeds the cache boundary");
    if (item === null || typeof item === "boolean" || typeof item === "string") {
      if (typeof item === "string" && item.length > 4 * 1024 * 1024) throw new RangeError("candidate verification string exceeds the cache boundary");
      charge(typeof item === "string" ? Buffer.byteLength(JSON.stringify(item)) : 5);
      return item;
    }
    if (typeof item === "number" && Number.isFinite(item)) {
      charge(32);
      return Object.is(item, -0) ? 0 : item;
    }
    if (typeof item !== "object" || item === null || types.isProxy(item) || seen.has(item)) {
      throw new TypeError("candidate verification data is not cacheable");
    }
    seen.add(item);
    try {
      if (Array.isArray(item)) {
        if (Object.getPrototypeOf(item) !== Array.prototype || item.length > 50000 || Object.getOwnPropertySymbols(item).length > 0) {
          throw new TypeError("candidate verification array is not cacheable");
        }
        const descriptors = Object.getOwnPropertyDescriptors(item);
        const expectedNames = new Set(["length", ...Array.from({ length: item.length }, (_, index) => String(index))]);
        if (Object.keys(descriptors).some((name) => !expectedNames.has(name))) throw new TypeError("candidate verification array is not cacheable");
        charge(item.length + 2);
        return Array.from({ length: item.length }, (_, index) => {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) throw new TypeError("candidate verification array is sparse");
          return visit(descriptor.value, depth + 1);
        });
      }
      if (!record(item)) throw new TypeError("candidate verification record is not cacheable");
      const output = Object.create(null);
      const descriptors = Object.getOwnPropertyDescriptors(item);
      charge(Object.keys(descriptors).length + 2);
      for (const key of Object.keys(descriptors).sort()) {
        if (!key || key.length > 512 || ["__proto__", "constructor", "prototype"].includes(key)
          || [...key].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
          throw new TypeError("candidate verification key is not cacheable");
        }
        // The builder receives JSON: absent optional object fields and undefined
        // serialize identically. Arrays, accessors and executable values do not.
        const descriptor = descriptors[key];
        if (!descriptor || !("value" in descriptor)) throw new TypeError("candidate verification record is not cacheable");
        if (descriptor.value === undefined) continue;
        charge(Buffer.byteLength(JSON.stringify(key)) + 1);
        output[key] = visit(descriptor.value, depth + 1);
      }
      return output;
    } finally {
      seen.delete(item);
    }
  }
  const encoded = JSON.stringify(visit(value, 0));
  if (Buffer.byteLength(encoded) > maximumBytes) throw new RangeError("candidate verification data exceeds the cache byte boundary");
  return encoded;
}

/** @param {unknown} value @returns {unknown} */
function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

/** @param {unknown} value @param {number} maximumBytes */
function immutableClone(value, maximumBytes) {
  return deepFreeze(JSON.parse(canonicalEncode(value, maximumBytes)));
}

/** @param {string} root @param {string} file */
function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** @param {string} root @returns {{resolved:string,real:string}} */
function rootIdentity(root) {
  if (typeof root !== "string" || root.length > 32768 || root.includes("\0") || !path.isAbsolute(root)) {
    throw new TypeError("candidate verification root is invalid");
  }
  const resolved = path.resolve(root);
  const info = fs.lstatSync(resolved);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new TypeError("candidate verification root is invalid");
  return { resolved, real: fs.realpathSync(resolved) };
}

/** @param {{resolved:string,real:string}} root @param {unknown} value */
function resolveOwnedFile(root, value) {
  if (typeof value !== "string" || value.length > 32768 || value.includes("\0") || !path.isAbsolute(value)) {
    throw new TypeError("candidate verification file path is invalid");
  }
  const resolved = path.resolve(value);
  if (!inside(root.resolved, resolved)) throw new TypeError("candidate verification file is outside the job root");
  const info = fs.lstatSync(resolved);
  const real = fs.realpathSync(resolved);
  if (!info.isFile() || info.isSymbolicLink() || !inside(root.real, real)) throw new TypeError("candidate verification file is invalid");
  return { resolved, real, relative: path.relative(root.real, real).replace(/\\/gu, "/") };
}

/** @param {string} file @param {{bytes:number}} budget */
function stableFileDigest(file, budget) {
  const descriptor = fs.openSync(file, "r");
  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile() || before.size < 1 || before.size > MAX_IDENTITY_FILE_BYTES
      || budget.bytes + before.size > MAX_IDENTITY_TOTAL_BYTES) throw new RangeError("candidate verification file exceeds the identity boundary");
    const hash = crypto.createHash("sha256");
    const buffer = Buffer.allocUnsafe(65536);
    let position = 0;
    while (position < before.size) {
      const count = fs.readSync(descriptor, buffer, 0, Math.min(buffer.length, before.size - position), position);
      if (count < 1) throw new Error("candidate verification file changed while hashing");
      hash.update(buffer.subarray(0, count));
      position += count;
    }
    const after = fs.fstatSync(descriptor);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      throw new Error("candidate verification file changed while hashing");
    }
    budget.bytes += before.size;
    return { bytes: before.size, sha256: hash.digest("hex") };
  } finally {
    fs.closeSync(descriptor);
  }
}

/** @param {string} file @param {{bytes:number}} budget */
function stableFileBuffer(file, budget) {
  const descriptor = fs.openSync(file, "r");
  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile() || before.size < 22 || before.size > MAX_IDENTITY_FILE_BYTES
      || budget.bytes + before.size > MAX_IDENTITY_TOTAL_BYTES) throw new RangeError("candidate verification PPTX exceeds the identity boundary");
    const buffer = Buffer.allocUnsafe(before.size);
    let position = 0;
    while (position < before.size) {
      const count = fs.readSync(descriptor, buffer, position, before.size - position, position);
      if (count < 1) throw new Error("candidate verification PPTX changed while reading");
      position += count;
    }
    const after = fs.fstatSync(descriptor);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) {
      throw new Error("candidate verification PPTX changed while reading");
    }
    budget.bytes += before.size;
    return buffer;
  } finally {
    fs.closeSync(descriptor);
  }
}

/** @param {string} value */
function safeZipName(value) {
  if (!value || value.length > 512 || value.includes("\0") || value.includes("\\") || value.startsWith("/")) {
    throw new TypeError("candidate verification PPTX entry is unsafe");
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === "." || normalized.startsWith("../") || value.includes("//") || /^[A-Za-z]:/u.test(value)) {
    throw new TypeError("candidate verification PPTX entry is unsafe");
  }
  return value;
}

/** Hashes uncompressed package contents so volatile ZIP timestamps do not create false misses.
 * @param {string} file @param {{bytes:number}} budget */
function semanticPptxIdentity(file, budget) {
  const buffer = stableFileBuffer(file, budget);
  const entries = readZipEntries(buffer, {
    maxArchiveBytes: MAX_IDENTITY_FILE_BYTES,
    maxEntries: MAX_PPTX_ENTRIES,
    maxEntryBytes: MAX_PPTX_ENTRY_BYTES
  });
  if (entries.length < 2 || entries.length > MAX_PPTX_ENTRIES) throw new TypeError("candidate verification PPTX entry count is invalid");
  const names = new Set();
  const foldedNames = new Set();
  let expandedBytes = 0;
  for (const entry of entries) {
    const name = safeZipName(entry.name);
    const folded = name.toLowerCase();
    if (names.has(name) || foldedNames.has(folded)) throw new TypeError("candidate verification PPTX has ambiguous entries");
    if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > MAX_PPTX_ENTRY_BYTES) {
      throw new RangeError("candidate verification PPTX entry exceeds the boundary");
    }
    names.add(name);
    foldedNames.add(folded);
    expandedBytes += entry.uncompressedSize;
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > MAX_PPTX_EXPANDED_BYTES) {
      throw new RangeError("candidate verification PPTX expands beyond the boundary");
    }
  }
  if (!names.has("[Content_Types].xml") || !names.has("ppt/presentation.xml")) {
    throw new TypeError("candidate verification artifact is not a PPTX package");
  }
  const hash = crypto.createHash("sha256");
  for (const name of [...names].sort()) {
    const data = readZipEntry(buffer, name, {
      maxArchiveBytes: MAX_IDENTITY_FILE_BYTES,
      maxEntries: MAX_PPTX_ENTRIES,
      maxEntryBytes: MAX_PPTX_ENTRY_BYTES
    });
    if (!Buffer.isBuffer(data)) throw new Error("candidate verification PPTX entry is unavailable");
    updateFrame(hash, name);
    updateFrame(hash, String(data.length));
    updateFrame(hash, crypto.createHash("sha256").update(data).digest("hex"));
  }
  return hash.digest("hex");
}

/** @param {crypto.Hash} hash @param {string} value */
function updateFrame(hash, value) {
  const content = Buffer.from(value, "utf8");
  hash.update(String(content.length));
  hash.update(":");
  hash.update(content);
}

/** @param {unknown} deck */
function referencedAssetPaths(deck) {
  const paths = new Set();
  /** @param {unknown} value @param {string} parent */
  function visit(value, parent) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, "");
      return;
    }
    if (!record(value)) return;
    for (const [key, item] of Object.entries(value)) {
      const field = key.toLowerCase();
      if (item !== null && item !== undefined && (field === "assetpath" || field === "sourceimage"
        || (field === "pageimage" && parent.toLowerCase() === "source"))) {
        paths.add(safeAssetPath(item));
        if (paths.size > 10000) throw new RangeError("candidate verification asset count exceeds the boundary");
      }
      visit(item, key);
    }
  }
  visit(deck, "");
  return [...paths].sort();
}

/** @param {unknown} value @param {number} sourceCount @param {number} maximumBytes */
function completedVerification(value, sourceCount, maximumBytes) {
  if (!record(value) || typeof ownValue(value, "passed") !== "boolean") return null;
  const checks = ownValue(value, "checks");
  const metrics = ownValue(value, "metrics");
  if (!Array.isArray(checks) || checks.length < 2 || checks.length > 64 || !record(metrics)) return null;
  const named = new Map();
  for (const check of checks) {
    if (!record(check) || typeof ownValue(check, "name") !== "string" || typeof ownValue(check, "passed") !== "boolean") return null;
    const name = String(ownValue(check, "name"));
    if (!name || name.length > 128 || named.has(name)) return null;
    named.set(name, ownValue(check, "passed"));
  }
  const passed = ownValue(value, "passed");
  if (named.get("quality-rendered") !== true || named.get("visual-fidelity") !== passed) return null;
  const pixelDiffRatio = ownValue(metrics, "pixel-diff-ratio");
  const foregroundMissingRatio = ownValue(metrics, "foreground-missing-ratio");
  const meanAbsoluteDelta = ownValue(metrics, "mean-absolute-delta");
  const pagesCompared = ownValue(metrics, "quality-pages-compared");
  if (!Number.isFinite(pixelDiffRatio) || Number(pixelDiffRatio) < 0 || Number(pixelDiffRatio) > 1
    || !Number.isFinite(foregroundMissingRatio) || Number(foregroundMissingRatio) < 0 || Number(foregroundMissingRatio) > 1
    || !Number.isFinite(meanAbsoluteDelta) || Number(meanAbsoluteDelta) < 0 || Number(meanAbsoluteDelta) > 255
    || !Number.isSafeInteger(pagesCompared) || pagesCompared !== sourceCount
    || Number(ownValue(metrics, "quality-render-failed") || 0) !== 0) return null;
  try {
    return immutableClone(value, maximumBytes);
  } catch {
    return null;
  }
}

/** @param {unknown} value */
function sourceList(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20 || value.some((item) => typeof item !== "string")) {
    throw new TypeError("candidate verification sources are invalid");
  }
  return value;
}

/** Only runtime observations may differ between an original reference and its
 * cache replay. Validate all input before removing these two numeric fields;
 * regional evidence, policy decisions and unknown fields remain identity-bound.
 * @param {unknown} value */
function referenceIdentity(value) {
  const encoded=canonicalEncode(value === undefined ? null : value);
  const snapshot=/** @type {unknown} */(JSON.parse(encoded));
  if (!record(snapshot) || !record(snapshot.metrics)) return encoded;
  const elapsed=snapshot.metrics["quality-render-milliseconds"],hit=snapshot.metrics["quality-verification-cache-hit"];
  if (elapsed !== undefined && (typeof elapsed !== "number" || !Number.isSafeInteger(elapsed) || elapsed < 0)
    || hit !== undefined && hit !== 0 && hit !== 1) return encoded;
  delete snapshot.metrics["quality-render-milliseconds"];
  delete snapshot.metrics["quality-verification-cache-hit"];
  return canonicalEncode(snapshot);
}

/** @typedef {{root:string,pptxFile:string,sourceImages:string[],deck:unknown,referenceQuality?:unknown,renderer:Function,comparator:Function,settings:unknown,policy:unknown}} CacheBinding */

/** Job-local memoization for complete render-quality conclusions. It is independent from publication and shadow-candidate retention.
 * @param {unknown} [options] */
function createCandidateVerificationCache(options = {}) {
  if (!record(options)) throw new TypeError("candidate verification cache options are invalid");
  const maxEntries = boundedInteger(ownValue(options, "maxEntries"), 1, 256, DEFAULT_MAX_ENTRIES, "candidate verification maxEntries");
  const maxBytes = boundedInteger(ownValue(options, "maxBytes"), 1024, 64 * 1024 * 1024, DEFAULT_MAX_BYTES, "candidate verification maxBytes");
  const maxResultBytes = boundedInteger(ownValue(options, "maxResultBytes"), 512, maxBytes, Math.min(DEFAULT_MAX_RESULT_BYTES, maxBytes), "candidate verification maxResultBytes");
  /** @type {Map<string,VerificationCacheEntry>} */
  const entries = new Map();
  /** @type {WeakMap<Function,number>} */
  const functionIds = new WeakMap();
  let nextFunctionId = 1;
  let usedBytes = 0;

  /** @param {Function} value */
  function functionId(value) {
    if (typeof value !== "function") throw new TypeError("candidate verification adapter is invalid");
    let identifier = functionIds.get(value);
    if (identifier === undefined) {
      identifier = nextFunctionId;
      nextFunctionId += 1;
      functionIds.set(value, identifier);
    }
    return identifier;
  }

  /** @param {unknown} input */
  function bindingKey(input) {
    if (!record(input)) throw new TypeError("candidate verification binding is invalid");
    const root = rootIdentity(/** @type {string} */ (ownValue(input, "root")));
    const pptx = resolveOwnedFile(root, ownValue(input, "pptxFile"));
    const sources = sourceList(ownValue(input, "sourceImages"));
    const deck = ownValue(input, "deck");
    if (!record(deck)) throw new TypeError("candidate verification requires a complete deck revision");
    const deckEncoded = canonicalEncode(deck);
    const deckSnapshot = JSON.parse(deckEncoded);
    const referenceQuality = ownValue(input, "referenceQuality");
    const referenceEncoded = referenceIdentity(referenceQuality);
    const settingsEncoded = canonicalEncode(ownValue(input, "settings"));
    const policyEncoded = canonicalEncode(ownValue(input, "policy"));
    const budget = { bytes: 0 };
    const memo = new Map();
    /** @param {{resolved:string,real:string,relative:string}} file */
    const identity = file => {
      if (!memo.has(file.real)) memo.set(file.real, stableFileDigest(file.resolved, budget));
      return { path: file.relative, ...memo.get(file.real) };
    };
    const sourceIdentities = sources.map(file => identity(resolveOwnedFile(root, file)));
    const assetIdentities = referencedAssetPaths(deckSnapshot).map(asset => {
      const file = resolveOwnedFile(root, path.resolve(root.resolved, asset));
      return identity(file);
    });
    const pptxIdentity = semanticPptxIdentity(pptx.resolved, budget);
    const hash = crypto.createHash("sha256");
    for (const value of [String(CACHE_VERSION), root.real, deckEncoded, referenceEncoded, settingsEncoded, policyEncoded,
      canonicalEncode(sourceIdentities), canonicalEncode(assetIdentities), pptxIdentity,
      String(functionId(/** @type {Function} */ (ownValue(input, "renderer")))),
      String(functionId(/** @type {Function} */ (ownValue(input, "comparator"))))]) updateFrame(hash, value);
    return { key: hash.digest("hex"), sourceCount: sources.length, root: root.real };
  }

  /** @param {string} key @returns {VerificationCacheEntry|null} */
  function hit(key) {
    const value = entries.get(key);
    if (!value) return null;
    entries.delete(key);
    entries.set(key, value);
    return value;
  }

  /** @param {unknown} input @returns {VerificationCacheAttempt} */
  function begin(input) {
    let initial;
    try {
      initial = bindingKey(input);
    } catch {
      return Object.freeze({ key: null, cached: null,
        /** @returns {VerificationCacheEntry|null} */
        getEntry: () => null, isCurrent: () => false, commit: () => false });
    }
    let currentEntry = hit(initial.key);
    let committed = false;
    return Object.freeze({
      key: initial.key,
      cached: currentEntry?.quality ?? null,
      /** @returns {VerificationCacheEntry|null} */
      getEntry: () => currentEntry,
      isCurrent: () => {
        try { return bindingKey(input).key === initial.key; } catch { return false; }
      },
      /** @param {unknown} quality */
      commit(quality) {
        if (committed) return false;
        committed = true;
        const completed = completedVerification(quality, initial.sourceCount, maxResultBytes);
        if (completed === null) return false;
        let current;
        try {
          current = bindingKey(input);
        } catch {
          return false;
        }
        if (current.key !== initial.key || current.sourceCount !== initial.sourceCount) return false;
        const bytes = Buffer.byteLength(canonicalEncode(completed, maxResultBytes));
        if (bytes > maxResultBytes || bytes > maxBytes) return false;
        const previous = entries.get(initial.key);
        if (previous) {
          usedBytes -= previous.bytes;
          entries.delete(initial.key);
        }
        const entry = Object.freeze({ key: initial.key, root: initial.root,
          sourceCount: initial.sourceCount, quality: completed, bytes });
        verificationEntries.add(entry);
        currentEntry = entry;
        entries.set(initial.key, entry);
        usedBytes += bytes;
        while (entries.size > maxEntries || usedBytes > maxBytes) {
          const oldest = entries.entries().next().value;
          if (!oldest) break;
          entries.delete(oldest[0]);
          usedBytes -= oldest[1].bytes;
        }
        return entries.has(initial.key);
      }
    });
  }

  return Object.freeze({
    begin,
    clear() {
      entries.clear();
      usedBytes = 0;
    }
  });
}

module.exports = { createCandidateVerificationCache, isCandidateVerificationCacheEntry };
