"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { types } = require("node:util");
const { readWorkerSettings, readOcrCheckpointRevision } = require("./worker-settings");

const ENVIRONMENT_KEYS = Object.freeze([
  "OPENXML_BUILDER_EXE", "COMMON_TOOLS_WORKER_CAPABILITIES",
  "COMMON_TOOLS_WORKER_POLL_SECONDS", "COMMON_TOOLS_WORKER_ID",
  "COMMON_TOOLS_IMAGE_OCR_CHECKPOINT_REVISION", "COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE",
  "COMMON_TOOLS_IMAGE_RAW_OCR_EXECUTABLE", "COMMON_TOOLS_IMAGE_RAW_OCR_SHA256",
  "COMMON_TOOLS_IMAGE_RAW_OCR_LANGUAGES", "COMMON_TOOLS_IMAGE_PADDLEOCR_MODEL_CACHE",
  ...["WORKER", "PYTHON", "ADAPTER", "IMAGE_NORMALIZER", "HEALTHCHECK"].flatMap(
    name => [`COMMON_TOOLS_IMAGE_PADDLEOCR_${name}`, `COMMON_TOOLS_IMAGE_PADDLEOCR_${name}_SHA256`]
  ),
  "COMMON_TOOLS_IMAGE_PADDLEOCR_PROTOCOL_SHA256"
]);

/** @typedef {Readonly<Record<string, string>>} ImageWorkerEnvironment */

/** Read only known own data properties, before any filesystem or profile work.
 * @param {unknown} input
 * @returns {ImageWorkerEnvironment}
 */
function readImageWorkerEnvironment(input) {
  if (!input || typeof input !== "object" || types.isProxy(input) || Array.isArray(input)) {
    throw new TypeError("worker environment is invalid");
  }
  /** @type {Record<string, string>} */
  const snapshot = Object.create(null);
  for (const key of ENVIRONMENT_KEYS) {
    const property = Object.getOwnPropertyDescriptor(input, key);
    if (!property) continue;
    if (!("value" in property)) throw new TypeError("worker environment is invalid");
    const value = /** @type {unknown} */ (property.value);
    if (value === undefined) continue;
    if (typeof value !== "string") throw new TypeError(`${key} must be a string`);
    if (value.length > 4096 || value.includes("\0")) throw new TypeError(`${key} is invalid`);
    snapshot[key] = value;
  }
  return Object.freeze(snapshot);
}

/** @param {unknown} file @returns {boolean} */
function pathIsFile(file) {
  if (typeof file !== "string" || file.length > 4096 || file.includes("\0")) return false;
  try { return path.isAbsolute(file) && fs.statSync(file).isFile(); } catch { return false; }
}

/** The injected readers perform their existing executable/model checksum validation.
 * @template {{readonly enabled: boolean}} PaddleProfile
 * @template {{readonly enabled: boolean}} RawProfile
 * @param {{paddleProfileName: string, readPaddleProfile: (environment: ImageWorkerEnvironment) => PaddleProfile, readRawProfile: (environment: ImageWorkerEnvironment) => RawProfile}} readers
 */
function createImageWorkerSettings(readers) {
  /** @param {unknown} [input] */
  return function workerSettings(input = process.env) {
    const environment = readImageWorkerEnvironment(input);
    const { pollSeconds, workerId } = readWorkerSettings(environment, {
      capability: "image-to-editable",
      capabilityError: "image worker supports only image-to-editable",
      workerIdPrefix: "team-image-worker-"
    });
    const builderExecutable = environment.OPENXML_BUILDER_EXE || "/opt/openxml/OpenXmlDeckBuilder";
    if (!pathIsFile(builderExecutable)) throw new Error("OPENXML_BUILDER_EXE is unavailable");
    const rawImageOcrProfile = environment.COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE === readers.paddleProfileName
      ? readers.readPaddleProfile(environment) : readers.readRawProfile(environment);
    const ocrCheckpointFingerprint = readOcrCheckpointRevision(environment);
    if (ocrCheckpointFingerprint && !rawImageOcrProfile.enabled) throw new Error("OCR checkpoints require an enabled OCR profile");
    return Object.freeze({ pollSeconds, workerId, builderExecutable, rawImageOcrProfile, ocrCheckpointFingerprint });
  };
}

module.exports = { createImageWorkerSettings, pathIsFile, readImageWorkerEnvironment };
