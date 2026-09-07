// @ts-check
"use strict";
const {assertNonEmptyString, assertQualityReport} = require("../capability-contracts");
/** @type {(value: unknown, label: string) => asserts value is Record<string, unknown>} */
const assertPlainObject = require("../capability-contracts").assertPlainObject;
const {readJobRowState,readJobRowIdentity} = require("./job-row-state");
const {readStoredWorkerFailure} = require("./worker-failure");
const {assertObjectKey,normalizeTeamJobOptions,withTraceParent} = require("./job-input");
/** @param {unknown} value */
function storedQuality(value) {
  if (value == null) return null;
  try {
    if (typeof value === "string") {
      if (value.length > 262144) return null;
      value = JSON.parse(value);
    }
    return assertQualityReport(value);
  }
  // Historic jobs may predate the fixed report contract. Do not expose their
  // arbitrary JSON to an MCP caller; new writes are rejected at the boundary.
  catch { return null; }
}
/** @param {unknown} value @param {string} outputPrefix */
function readStoredArtifacts(value, outputPrefix) {
  try {
    if (typeof value === "string" && value.length > 262144) throw new Error("oversized artifacts");
    const parsed = typeof value === "string" ? JSON.parse(value) : value ?? [];
    const prefix = assertObjectKey(outputPrefix, "artifact output prefix");
    if (!prefix.endsWith("/")) throw new Error("invalid artifact output prefix");
    return validateArtifacts({ outputPrefix: prefix }, parsed);
  } catch { throw new TypeError("database job artifacts are invalid"); }
}
/** @param {unknown} value @param {string} capability */
function readStoredOptions(value, capability) {
  try {
    if (typeof value === "string" && value.length > 8192) throw new TypeError();
    return normalizeTeamJobOptions(capability, typeof value === "string" ? JSON.parse(value) : value);
  } catch { throw new TypeError("database job options are invalid"); }
}
/** @param {readonly string[]} capabilities */
function createJobRowReader(capabilities) {
/** @param {unknown} row */
return function fromRow(row) {
  assertPlainObject(row, "database job row");
  const state = readJobRowState(row);
  const { traceParent, ...identity } = readJobRowIdentity(row, capabilities);
  return withTraceParent({ ...identity, ...state, options: readStoredOptions(row.options, identity.capability), artifacts: readStoredArtifacts(row.artifacts, identity.outputPrefix), quality: storedQuality(row.quality), error: readStoredWorkerFailure(row.error) }, traceParent);
};
}

/** @param {{outputPrefix:string}} job @param {unknown} artifacts */
function validateArtifacts(job, artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length > 32) throw new Error("worker artifacts are invalid");
  return artifacts.map((artifact) => {
    assertPlainObject(artifact, "worker artifact");
    const name = assertNonEmptyString(artifact.name, "worker artifact name");
    const objectKey = assertObjectKey(artifact.objectKey, "worker artifact objectKey");
    if (!objectKey.startsWith(job.outputPrefix) || typeof artifact.mediaType !== "string" || !artifact.mediaType || typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error("worker artifact is invalid");
    return { name, objectKey, mediaType: artifact.mediaType, sha256: artifact.sha256 };
  });
}

module.exports={createJobRowReader,storedQuality,validateArtifacts};
