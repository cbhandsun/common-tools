"use strict";
// @ts-check
const crypto = require("node:crypto");
const { containsControlCharacter } = require("../capability-contracts");
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
const PROJECT_AUDIT_SCOPE_IDS = Object.freeze(["product-journey", "visual-interaction", "data-security", "engineering-delivery"]);
const PROJECT_AUDIT_SCOPE_BY_TOKEN = new Map([
  ["2", ["product-journey"]],
  ["product", ["product-journey"]],
  ["product-journey", ["product-journey"]],
  ["journey", ["product-journey"]],
  ["产品", ["product-journey"]],
  ["产品闭环", ["product-journey"]],
  ["产品旅程", ["product-journey"]],
  ["用户旅程", ["product-journey"]],
  ["业务闭环", ["product-journey"]],
  ["3", ["visual-interaction"]],
  ["visual", ["visual-interaction"]],
  ["interaction", ["visual-interaction"]],
  ["ux", ["visual-interaction"]],
  ["accessibility", ["visual-interaction"]],
  ["visual-interaction", ["visual-interaction"]],
  ["视觉", ["visual-interaction"]],
  ["交互", ["visual-interaction"]],
  ["无障碍", ["visual-interaction"]],
  ["视觉交互", ["visual-interaction"]],
  ["视觉交互与无障碍", ["visual-interaction"]],
  ["视觉、交互与无障碍", ["visual-interaction"]],
  ["4", ["data-security"]],
  ["data", ["data-security"]],
  ["security", ["data-security"]],
  ["reliability", ["data-security"]],
  ["data-security", ["data-security"]],
  ["数据", ["data-security"]],
  ["权限", ["data-security"]],
  ["可靠性", ["data-security"]],
  ["数据权限", ["data-security"]],
  ["数据权限可靠性", ["data-security"]],
  ["数据、权限与可靠性", ["data-security"]],
  ["5", ["engineering-delivery"]],
  ["engineering", ["engineering-delivery"]],
  ["delivery", ["engineering-delivery"]],
  ["工程", ["engineering-delivery"]],
  ["交付", ["engineering-delivery"]],
  ["工程交付", ["engineering-delivery"]],
  ["工程与交付", ["engineering-delivery"]],
  ["engineering-delivery", ["engineering-delivery"]]
]);
const PROJECT_AUDIT_ALL_SCOPE_TOKENS = new Set(["1", "all", "全部", "全域", "全部四域", "四域", "所有", "全量"]);

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
/** @param {unknown} value */
function normalizeProjectAuditScopeOption(value) {
  const scope = assertNonEmptyString(value, "auditScope");
  if (scope.length > 256 || containsControlCharacter(scope)) throw new TypeError("auditScope is invalid");
  const tokens = scope.split(/[,，;；]/u).map((token) => token.trim().toLowerCase());
  if (tokens.some((token) => !token) || new Set(tokens).size !== tokens.length) throw new TypeError("auditScope is invalid");
  if (tokens.some((token) => PROJECT_AUDIT_ALL_SCOPE_TOKENS.has(token))) {
    if (tokens.length !== 1) throw new TypeError("auditScope is invalid");
    return PROJECT_AUDIT_SCOPE_IDS.join(",");
  }
  const selected = tokens.flatMap((token) => PROJECT_AUDIT_SCOPE_BY_TOKEN.get(token) || []);
  if (selected.length !== tokens.length || new Set(selected).size !== selected.length) throw new TypeError("auditScope is invalid");
  return PROJECT_AUDIT_SCOPE_IDS.filter((id) => selected.includes(id)).join(",");
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
  if (capability === "ppt-improve" && keys.every((key) => key === "repairProfile") && keys.length === 1 && typeof repairProfile === "string" && PPT_IMPROVE_REPAIR_PROFILES.has(repairProfile)) return Object.freeze({ repairProfile });
  const auditScope = readField(value, "auditScope");
  if (capability === "project-audit" && keys.every((key) => key === "auditScope") && keys.length === 1) return Object.freeze({ auditScope: normalizeProjectAuditScopeOption(auditScope) });
  throw new TypeError("team Job options are invalid for the capability");
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
