// @ts-check
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { ownerPrefix } = require("../team-runtime/job-input");
const { attemptOutputPrefix } = require("../team-runtime/worker-lease");
const { admitOcrResult } = require("./ocr-result-admission");

const CACHE_VERSION = "ocr-checkpoint-v1";
const MAX_SOURCE_BYTES = 60 * 1024 * 1024;
const MAX_CACHE_BYTES = 1024 * 1024;
const MAX_IMAGE_DIMENSION = 16384;
const MAX_IMAGE_PIXELS = 40000000;
const MAX_PAGE_INDEX = 19;
const OBJECT_KEY_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,511}$/;
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PROFILE_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;

/** @typedef {{x: number, y: number, w: number, h: number}} Box */
/** @typedef {{text: string, confidence: number, box: Box}} OcrLine */
/** @typedef {{lines: readonly OcrLine[]}} OcrResult */
/** @typedef {{inputFile: string, assetPath: string, dimensions: {widthPx: number, heightPx: number}, pageIndex: number}} OcrSource */
/** @typedef {{id: string, ownerId: string, inputObjectKey: string, outputPrefix: string}} OcrJob */
/** @typedef {{readObject: (input: {objectKey: string, maxBytes: number, retryMissing: boolean}) => Promise<unknown>, putObject: (input: {objectKey: string, body: Buffer, contentType: string}) => Promise<unknown>}} ObjectStore */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** @param {unknown} value @param {string} name @returns {unknown} */
function field(value, name) {
  if (!isRecord(value)) throw new TypeError("OCR checkpoint input is invalid");
  try { return value[name]; } catch { throw new TypeError("OCR checkpoint input is invalid"); }
}

/** @param {unknown} value @param {string} message @returns {string} */
function safeString(value, message) {
  if (typeof value !== "string" || !value || value.length > 1024 || containsControlCharacter(value)) throw new TypeError(message);
  return value;
}

/** @param {string} value @returns {boolean} */
function containsControlCharacter(value) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** @param {unknown} value @param {string} message @returns {number} */
function safeInteger(value, message) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new TypeError(message);
  return value;
}


/** @param {unknown} value @param {string} label @returns {string} */
function safeObjectKey(value, label) {
  const key = safeString(value, label);
  if (!OBJECT_KEY_PATTERN.test(key) || key.includes("//") || key.startsWith("/") || key.split("/").some((part) => part === "." || part === "..")) {
    throw new TypeError(label);
  }
  return key;
}

/** @param {unknown} value @returns {string} */
function safeAssetPath(value) {
  const path = safeString(value, "OCR checkpoint source is invalid");
  if (path.includes("\\") || path.includes(":") || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new TypeError("OCR checkpoint source is invalid");
  }
  return path;
}

/** @param {unknown} value @returns {{widthPx: number, heightPx: number}} */
function safeDimensions(value) {
  const widthPx = safeInteger(field(value, "widthPx"), "OCR checkpoint source is invalid");
  const heightPx = safeInteger(field(value, "heightPx"), "OCR checkpoint source is invalid");
  if (widthPx < 1 || heightPx < 1 || widthPx > MAX_IMAGE_DIMENSION || heightPx > MAX_IMAGE_DIMENSION || widthPx * heightPx > MAX_IMAGE_PIXELS) {
    throw new RangeError("OCR checkpoint source dimensions are invalid");
  }
  return Object.freeze({ widthPx, heightPx });
}

/** @param {unknown} value @returns {OcrSource} */
function safeSource(value) {
  const inputFile = safeString(field(value, "inputFile"), "OCR checkpoint source is invalid");
  if (!path.isAbsolute(inputFile)) throw new TypeError("OCR checkpoint source is invalid");
  const assetPath = safeAssetPath(field(value, "assetPath"));
  const dimensions = safeDimensions(field(value, "dimensions"));
  const pageIndex = safeInteger(field(value, "pageIndex"), "OCR checkpoint source is invalid");
  if (pageIndex < 0 || pageIndex > MAX_PAGE_INDEX) throw new RangeError("OCR checkpoint source is invalid");
  return Object.freeze({ inputFile, assetPath, dimensions, pageIndex });
}

/** @param {unknown} value @returns {OcrJob} */
function safeJob(value) {
  const ownerId = safeString(field(value, "ownerId"), "OCR checkpoint job is invalid").trim();
  if (!ownerId) throw new TypeError("OCR checkpoint job is invalid");
  const id = safeString(field(value, "id"), "OCR checkpoint job is invalid");
  if (!JOB_ID_PATTERN.test(id)) throw new TypeError("OCR checkpoint job is invalid");
  const root = ownerPrefix(ownerId);
  const inputObjectKey = safeObjectKey(field(value, "inputObjectKey"), "OCR checkpoint job is invalid");
  const suppliedOutputPrefix = safeObjectKey(field(value, "outputPrefix"), "OCR checkpoint job is invalid");
  const outputPrefix = `${root}jobs/${id}/`;
  let outputIsValid = suppliedOutputPrefix === outputPrefix;
  if (!outputIsValid) {
    const attempt = field(value, "attempt");
    if (typeof attempt === "number" && Number.isSafeInteger(attempt)) outputIsValid = suppliedOutputPrefix === attemptOutputPrefix(outputPrefix, attempt);
  }
  if (!inputObjectKey.startsWith(`${root}inputs/`) || !outputIsValid) throw new Error("OCR checkpoint job ownership is invalid");
  // Always publish at the stable job root.  Worker attempt prefixes are
  // intentionally ephemeral, while the job root is the retry boundary.
  return Object.freeze({ id, ownerId, inputObjectKey, outputPrefix });
}

/** @param {unknown} value @returns {string} */
function safeProfileFingerprint(value) {
  if (typeof value !== "string" || !PROFILE_FINGERPRINT_PATTERN.test(value)) throw new TypeError("OCR checkpoint profile fingerprint is invalid");
  return value;
}

/** @param {unknown} value @returns {ObjectStore} */
function safeObjectStore(value) {
  if (!isRecord(value)) throw new TypeError("OCR checkpoint object store is invalid");
  const readObject = field(value, "readObject");
  const putObject = field(value, "putObject");
  if (typeof readObject !== "function" || typeof putObject !== "function") throw new TypeError("OCR checkpoint object store is invalid");
  return /** @type {ObjectStore} */ (value);
}

/** @param {OcrSource} source @returns {Buffer} */
function readSourceBytes(source) {
  let descriptor;
  try {
    descriptor = fs.openSync(source.inputFile, "r");
    const metadata = fs.fstatSync(descriptor);
    if (!metadata.isFile() || metadata.size < 1 || metadata.size > MAX_SOURCE_BYTES) throw new Error("OCR checkpoint source file is invalid");
    const buffer = Buffer.allocUnsafe(metadata.size + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = fs.readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    const metadataAfterRead = fs.fstatSync(descriptor);
    if (bytesRead !== metadata.size || metadataAfterRead.size !== metadata.size || !metadataAfterRead.isFile()) throw new Error("OCR checkpoint source file is invalid");
    return buffer.subarray(0, bytesRead);
  } catch {
    // File-system messages commonly include the source path.  Preserve the
    // failure category without allowing that local path into worker telemetry.
    throw new Error("OCR checkpoint source file is unavailable");
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

/** @param {Buffer} sourceBytes @param {OcrSource} source @param {string} profileFingerprint @returns {string} */
function checkpointDigest(sourceBytes, source, profileFingerprint) {
  return crypto.createHash("sha256")
    .update(sourceBytes)
    .update("\0", "utf8")
    .update(CACHE_VERSION, "utf8")
    .update("\0", "utf8")
    .update(String(source.dimensions.widthPx), "utf8")
    .update("\0", "utf8")
    .update(String(source.dimensions.heightPx), "utf8")
    .update("\0", "utf8")
    .update(String(source.pageIndex), "utf8")
    .update("\0", "utf8")
    .update(profileFingerprint, "utf8")
    .digest("hex");
}

/** @param {unknown} value @param {OcrSource} source @returns {OcrResult} */
function canonicalOcr(value, source) { return admitOcrResult(value, source.dimensions); }

/** @param {unknown} error @returns {boolean} */
function isMissingCheckpoint(error) {
  return error instanceof Error && error.name === "NoSuchKey";
}

/** @param {() => Promise<unknown>} isCancellationRequested */
async function assertNotCancelled(isCancellationRequested) {
  if (await isCancellationRequested()) throw new Error("OCR checkpoint was cancelled");
}

/** @param {Buffer} body @param {{objectKey: string, job: OcrJob, source: OcrSource, profileFingerprint: string, sourceSha256: string}} expected @returns {OcrResult} */
function decodeCheckpoint(body, expected) {
  if (!Buffer.isBuffer(body) || body.length < 1 || body.length > MAX_CACHE_BYTES) throw new Error("OCR checkpoint cache response is invalid");
  /** @type {unknown} */
  let parsed;
  try { parsed = JSON.parse(body.toString("utf8")); }
  catch { throw new Error("OCR checkpoint cache document is invalid"); }
  const version = field(parsed, "version"); const objectKey = field(parsed, "objectKey"); const binding = field(parsed, "binding"); const ocr = field(parsed, "ocr");
  if (version !== CACHE_VERSION || objectKey !== expected.objectKey || !isRecord(binding)) throw new Error("OCR checkpoint cache binding is invalid");
  const ownerHash = crypto.createHash("sha256").update(expected.job.ownerId).digest("hex");
  const dimensions = field(binding, "dimensions");
  if (field(binding, "jobId") !== expected.job.id || field(binding, "ownerHash") !== ownerHash || field(binding, "sourceSha256") !== expected.sourceSha256
    || field(binding, "profileFingerprint") !== expected.profileFingerprint || field(binding, "pageIndex") !== expected.source.pageIndex || !isRecord(dimensions)
    || field(dimensions, "widthPx") !== expected.source.dimensions.widthPx || field(dimensions, "heightPx") !== expected.source.dimensions.heightPx) {
    throw new Error("OCR checkpoint cache binding is invalid");
  }
  return canonicalOcr(ocr, expected.source);
}

/** @param {{objectKey: string, job: OcrJob, source: OcrSource, profileFingerprint: string, sourceSha256: string, ocr: OcrResult}} input @returns {Buffer} */
function encodeCheckpoint(input) {
  const document = {
    version: CACHE_VERSION,
    objectKey: input.objectKey,
    binding: {
      jobId: input.job.id,
      ownerHash: crypto.createHash("sha256").update(input.job.ownerId).digest("hex"),
      sourceSha256: input.sourceSha256,
      dimensions: input.source.dimensions,
      pageIndex: input.source.pageIndex,
      profileFingerprint: input.profileFingerprint
    },
    ocr: { lines: input.ocr.lines }
  };
  const body = Buffer.from(JSON.stringify(document), "utf8");
  if (body.length > MAX_CACHE_BYTES) throw new RangeError("OCR checkpoint cache document exceeds limits");
  return body;
}

/**
 * Creates a per-job durable OCR checkpoint.  The returned function intentionally
 * has no local memoization: the object store is the retry and process boundary.
 * @param {{objectStore: unknown, profileFingerprint: unknown}} options
 */
function createOcrCheckpoint(options) {
  const store = safeObjectStore(field(options, "objectStore"));
  const profileFingerprint = safeProfileFingerprint(field(options, "profileFingerprint"));
  /** @param {{job: unknown, source: unknown, runOcr: unknown, isCancellationRequested: unknown}} input @returns {Promise<OcrResult>} */
  return async function runCheckpoint(input) {
    const job = safeJob(field(input, "job"));
    const source = safeSource(field(input, "source"));
    const runOcr = field(input, "runOcr");
    const isCancellationRequested = field(input, "isCancellationRequested");
    if (typeof runOcr !== "function" || typeof isCancellationRequested !== "function") throw new TypeError("OCR checkpoint callbacks are invalid");
    const cancellationCheck = /** @type {() => Promise<unknown>} */ (isCancellationRequested);
    const ocrRunner = /** @type {() => Promise<unknown>} */ (runOcr);
    await assertNotCancelled(cancellationCheck);
    const sourceBytes = readSourceBytes(source);
    const sourceSha256 = crypto.createHash("sha256").update(sourceBytes).digest("hex");
    const digest = checkpointDigest(sourceBytes, source, profileFingerprint);
    const objectKey = `${job.outputPrefix}.internal/ocr/${digest}.json`;
    await assertNotCancelled(cancellationCheck);
    /** @type {unknown} */
    let cached;
    let cacheFound = false;
    try {
      cached = await store.readObject({ objectKey, maxBytes: MAX_CACHE_BYTES, retryMissing: false });
      cacheFound = true;
    } catch (error) {
      if (!isMissingCheckpoint(error)) throw error;
    }
    if (cacheFound) {
      const result = decodeCheckpoint(/** @type {Buffer} */ (cached), { objectKey, job, source, profileFingerprint, sourceSha256 });
      await assertNotCancelled(cancellationCheck);
      return result;
    }
    const rawOcr = await ocrRunner();
    const sourceAfterOcr = readSourceBytes(source);
    const sourceSha256AfterOcr = crypto.createHash("sha256").update(sourceAfterOcr).digest("hex");
    if (sourceSha256AfterOcr !== sourceSha256) throw new Error("OCR checkpoint source file changed during recognition");
    const result = canonicalOcr(rawOcr, source);
    await assertNotCancelled(cancellationCheck);
    const body = encodeCheckpoint({ objectKey, job, source, profileFingerprint, sourceSha256, ocr: result });
    await assertNotCancelled(cancellationCheck);
    await store.putObject({ objectKey, body, contentType: "application/json" });
    await assertNotCancelled(cancellationCheck);
    return result;
  };
}

module.exports = { createOcrCheckpoint };
