// @ts-check
"use strict";
const { types } = require("node:util"), { createHash } = require("node:crypto"), path = require("node:path");

/** @param {unknown} value @returns {Record<string,unknown>} */
function record(value) {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value)) throw new TypeError("invalid-approved-frame-input");
  const proto = Object.getPrototypeOf(value), descriptors = Object.getOwnPropertyDescriptors(value);
  if ((proto !== Object.prototype && proto !== null) || Reflect.ownKeys(descriptors).length > 128
      || Reflect.ownKeys(descriptors).some(key => typeof key !== "string" || !Object.hasOwn(descriptors[key] ?? {}, "value"))) throw new TypeError("invalid-approved-frame-input");
  return /** @type {Record<string,unknown>} */ (value);
}
/** @param {unknown} value @param {number} limit @returns {unknown[]} */
function list(value, limit) {
  if (!value || typeof value !== "object" || types.isProxy(value) || !Array.isArray(value)) throw new TypeError("invalid-approved-frame-list");
  const descriptors = Object.getOwnPropertyDescriptors(value), size = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size > limit || Reflect.ownKeys(descriptors).length !== size + 1) throw new TypeError("invalid-approved-frame-list");
  const copy = [];
  for (let i = 0; i < size; i++) {
    const descriptor = descriptors[String(i)];
    if (!descriptor || !("value" in descriptor)) throw new TypeError("invalid-approved-frame-list");
    copy.push(descriptor.value);
  }
  return copy;
}
/** @param {unknown} value */
function hash(value) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError("invalid-approved-frame-hash"); return value; }
/** @param {unknown} value */
function identifier(value) { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/u.test(value)) throw new TypeError("invalid-approved-frame-id"); return value; }
/** @param {unknown} value */
function absolutePath(value) {
  if (typeof value !== "string" || value.length > 32767 || !path.isAbsolute(value) || hasControls(value)) throw new TypeError("invalid-approved-frame-path");
  return path.resolve(value);
}
/** @param {string} value */
function hasControls(value) { return [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127); }
/** Snapshot every JSON-visible field without serialization hooks. Undefined
 * object fields are omitted as in Deck IR serialization; undefined array
 * elements become null. Cycles, getters and excessive graphs reject.
 * @param {unknown} input */
function snapshot(input) {
  let nodes = 0, stringBytes = 0; const active = new Set();
  /** @param {unknown} value @param {number} depth @returns {unknown} */
  function copy(value, depth) {
    if (++nodes > 100000 || depth > 64) throw new RangeError("approved-frame-snapshot-budget");
    if (value === null || value === undefined || typeof value === "boolean") return value ?? null;
    if (typeof value === "number") { if (!Number.isFinite(value)) throw new TypeError("invalid-approved-frame-number"); return value; }
    if (typeof value === "string") {
      stringBytes += Buffer.byteLength(value); if (stringBytes > 8 * 1024 * 1024) throw new RangeError("approved-frame-snapshot-budget"); return value;
    }
    if (!value || typeof value !== "object" || types.isProxy(value) || active.has(value)) throw new TypeError("invalid-approved-frame-snapshot");
    active.add(value);
    try {
      if (Array.isArray(value)) return list(value, 10000).map(item => copy(item, depth + 1));
      const data = record(value);
      return Object.fromEntries(Object.keys(data).sort().filter(key => data[key] !== undefined).map(key => {
        stringBytes += Buffer.byteLength(key);
        if (stringBytes > 8 * 1024 * 1024) throw new RangeError("approved-frame-snapshot-budget");
        return [key, copy(data[key], depth + 1)];
      }));
    } finally { active.delete(value); }
  }
  return JSON.stringify(copy(input, 0));
}
/** @param {unknown} value */
function fingerprint(value) { return createHash("sha256").update(snapshot(value)).digest("hex"); }
/** @param {unknown} value */
function parseReview(value) {
  const data = record(value), source = record(data.source);
  if (data.approvalId !== "user-20261023-approx-frame") throw new TypeError("approved-frame-host-approval-required");
  const width = source.width, height = source.height;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || width > 32768 || height > 32768 || width * height > 40000000) throw new TypeError("invalid-approved-frame-source");
  /** @type {unknown} */ const copiedFits = JSON.parse(snapshot(list(data.fits, 3)));
  const fits = list(copiedFits, 3);
  if (fits.length !== 3) throw new TypeError("invalid-approved-frame-fits");
  const assets = list(data.assets, 64).map(value => {
    const item = record(value);
    return { imageId: identifier(item.imageId), beforeSha256: hash(item.beforeSha256), afterSha256: hash(item.afterSha256), afterFile: absolutePath(item.afterFile) };
  });
  const retirements = list(data.retirements, 4).map(value => { const item = record(value); return { id: identifier(item.id), fingerprint: hash(item.fingerprint) }; });
  if (!assets.length || new Set(assets.map(item => item.imageId)).size !== assets.length || new Set(retirements.map(item => item.id)).size !== retirements.length) throw new TypeError("invalid-approved-frame-review-members");
  return { approvalId: data.approvalId, source: { width, height, sha256: hash(source.sha256) }, fits, assets, retirements };
}

module.exports = { record, list, hash, identifier, absolutePath, hasControls, snapshot, fingerprint, parseReview };
