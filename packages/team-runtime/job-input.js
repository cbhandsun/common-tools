"use strict";
// @ts-check
const crypto = require("node:crypto");
/** @param {unknown} value @param {string} label */
function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}
/** @param {object} value @param {string} name @returns {unknown} */
function readField(value, name) {
  try { return /** @type {Record<string, unknown>} */ (value)[name]; }
  catch { throw new TypeError("team Job input is invalid"); }
}
const OBJECT_KEY_PATTERN = /^[a-z0-9][a-z0-9._/-]{0,511}$/;
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;
const TRACE_PARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

const PPT_IMPROVE_REPAIR_PROFILES = new Set(["safe-package", "layout-safe", "typography-safe", "editability-safe", "audit-only"]);

/** @param {unknown} value @param {string} label */
function assertObjectKey(value, label) {
  const key = assertNonEmptyString(value, label);
  if (!OBJECT_KEY_PATTERN.test(key) || key.includes("//") || key.startsWith("/") || key.includes("..")) throw new TypeError(`${label} is invalid`);
  return key;
}
/** @param {unknown} value */
function assertProjectId(value) {
  const projectId = assertNonEmptyString(value, "projectId");
  if (!PROJECT_ID_PATTERN.test(projectId)) throw new TypeError("projectId is invalid");
  return projectId;
}
/** @param {unknown} value */
function assertTraceParent(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new TypeError("traceParent is invalid");
  const match = TRACE_PARENT_PATTERN.exec(value);
  if (!match || /^0{32}$/.test(match[1] || "") || /^0{16}$/.test(match[2] || "")) throw new TypeError("traceParent is invalid");
  return value;
}
/** @template {object} T @param {T} job @param {string | undefined} traceParent @returns {Readonly<T & {traceParent: string | undefined}>} */
function withTraceParent(job, traceParent) {
  Object.defineProperty(job, "traceParent", { value: traceParent, enumerable: false, writable: false, configurable: false });
  return Object.freeze(/** @type {T & {traceParent: string | undefined}} */ (job));
}
/** @param {unknown} ownerId */
function ownerPrefix(ownerId) {
  const owner = assertNonEmptyString(ownerId, "ownerId");
  // Object names are externally observable in storage telemetry; never place a
  // raw subject identifier in them.
  return `owners/${crypto.createHash("sha256").update(owner).digest("hex")}/`;
}
/** @param {unknown} ownerId @param {unknown} inputObjectKey */
function ownedInputKey(ownerId, inputObjectKey) {
  const key = assertObjectKey(inputObjectKey, "inputObjectKey");
  if (!key.startsWith(`${ownerPrefix(ownerId)}inputs/`)) throw new Error("input object does not belong to the owner input prefix");
  return key;
}
/** @param {unknown} capability @param {unknown} value */
function normalizeTeamJobOptions(capability, value) {
  if (value === undefined || value === null) return Object.freeze({});
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("team Job options are invalid");
  let keys;
  try { keys = Object.keys(value); } catch { throw new TypeError("team Job options are invalid"); }
  if (keys.length === 0) return Object.freeze({});
  const repairProfile = readField(value, "repairProfile");
  if (capability !== "ppt-improve" || keys.some((key) => key !== "repairProfile") || keys.length !== 1 || (typeof repairProfile !== "string" || !PPT_IMPROVE_REPAIR_PROFILES.has(repairProfile))) throw new TypeError("team Job options are invalid for the capability");
  return Object.freeze({ repairProfile });
}

/** @param {readonly string[]} capabilities */
function createJobFactory(capabilities) {
  /** @param {unknown} input */
  return function createTeamJob(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("team Job input is invalid");
    const capability = readField(input, "capability");
    if (typeof capability !== "string" || !capabilities.includes(capability)) throw new Error("unsupported capability");
    const owner = assertNonEmptyString(readField(input, "ownerId"), "ownerId");
    const projectId = readField(input, "projectId");
    const key = assertNonEmptyString(readField(input, "idempotencyKey"), "idempotencyKey");
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(key)) throw new TypeError("idempotencyKey is invalid");
    const inputObjectKey = ownedInputKey(owner, readField(input, "inputObjectKey"));
    const expiresAt = readField(input, "expiresAt");
    let expiry;
    try {
      if (typeof expiresAt === "string" || typeof expiresAt === "number") expiry = new Date(expiresAt);
      else if (expiresAt instanceof Date) expiry = new Date(Date.prototype.getTime.call(expiresAt));
      else throw new Error();
    } catch { throw new Error("expiresAt must be in the future"); }
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) throw new Error("expiresAt must be in the future");
    const rawAttempts = readField(input, "maxAttempts");
    const maxAttempts = rawAttempts === undefined ? 1 : rawAttempts;
    if (typeof maxAttempts !== "number" || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) throw new Error("maxAttempts must be between 1 and 5");
    const traceParent = assertTraceParent(readField(input, "traceParent"));
    const options = normalizeTeamJobOptions(capability, readField(input, "options"));
    const id = crypto.randomUUID();
    return withTraceParent({ id, capability, ownerId: owner, projectId: projectId === undefined ? undefined : assertProjectId(projectId), idempotencyKey: key,
      status: /** @type {const} */ ("queued"), attempt: 0, maxAttempts, inputObjectKey, outputPrefix: `${ownerPrefix(owner)}jobs/${id}/`, options,
      artifacts: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), expiresAt: expiry.toISOString() }, traceParent);
  };
}
module.exports = { assertObjectKey, assertProjectId, assertTraceParent, withTraceParent, ownerPrefix, ownedInputKey, normalizeTeamJobOptions, createJobFactory };
