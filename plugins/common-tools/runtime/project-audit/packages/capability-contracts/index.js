// @ts-check
"use strict";

/** @typedef {"queued" | "running" | "input_required" | "cancel_requested" | "succeeded" | "failed" | "cancelled" | "expired"} JobStatus */

/** @type {ReadonlySet<JobStatus>} */
const JOB_STATUSES = new Set(["queued", "running", "input_required", "cancel_requested", "succeeded", "failed", "cancelled", "expired"]);
/** @type {ReadonlySet<JobStatus>} */
const TERMINAL_JOB_STATUSES = new Set(["succeeded", "failed", "cancelled", "expired"]);
/** @param {...JobStatus} statuses @returns {ReadonlySet<JobStatus>} */
function transitionSet(...statuses) { return new Set(statuses); }
/** @type {Readonly<Record<JobStatus, ReadonlySet<JobStatus>>>} */
const TRANSITIONS = Object.freeze({
  queued: transitionSet("running", "cancel_requested", "cancelled", "expired"),
  running: transitionSet("input_required", "cancel_requested", "succeeded", "failed", "expired"),
  input_required: transitionSet("queued", "cancel_requested", "expired"),
  cancel_requested: transitionSet("cancelled", "succeeded", "failed", "expired"),
  succeeded: transitionSet(), failed: transitionSet(), cancelled: transitionSet(), expired: transitionSet()
});

const MCP_NON_EMPTY_STRING = Object.freeze({ type: "string", minLength: 1, maxLength: 4096 });
const MCP_JOB_ID_SCHEMA = Object.freeze({ type: "string", minLength: 1, maxLength: 256 });
const MCP_JOB_STATUS_SCHEMA = Object.freeze({ type: "string", enum: Object.freeze([...JOB_STATUSES]) });
const MCP_JOB_SCHEMA = Object.freeze({
  type: "object",
  required: Object.freeze(["id", "capability", "status"]),
  properties: Object.freeze({
    id: MCP_JOB_ID_SCHEMA,
    capability: Object.freeze({ type: "string", minLength: 1, maxLength: 64 }),
    status: MCP_JOB_STATUS_SCHEMA
  }),
  additionalProperties: true
});
const MCP_SIYUAN_ID_SCHEMA = Object.freeze({ type: "string", pattern: "^[0-9]{14}-[a-z0-9]{7}$" });
const MCP_SHORT_NOTICE_SCHEMA = Object.freeze({ type: "string", minLength: 1, maxLength: 256 });

/** @param {boolean} readOnlyHint @param {boolean} destructiveHint @param {boolean} idempotentHint */
function mcpToolAnnotations(readOnlyHint, destructiveHint, idempotentHint) {
  return Object.freeze({ readOnlyHint, destructiveHint, idempotentHint, openWorldHint: false });
}

/** @param {unknown} value @param {string} label @returns {asserts value is Record<string, unknown>} */
function assertPlainObject(value, label) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
}

/** @param {unknown} value @param {string} label @returns {string} */
function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

/** @param {unknown} value @param {string} label @returns {readonly string[]} */
function assertStringList(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new TypeError(`${label} must be a string array`);
  return Object.freeze(value.map((item) => item.trim()));
}

/** @param {unknown} value @param {string} label @returns {Record<string, unknown>} */
function assertObjectSchema(value, label) {
  assertPlainObject(value, label);
  if (value.type !== "object") throw new TypeError(`${label} must be an object schema`);
  return value;
}

/** @param {unknown} value @param {string} label @returns {{readOnlyHint: boolean, destructiveHint: boolean, idempotentHint: boolean, openWorldHint: boolean}} */
function assertMcpToolAnnotations(value, label) {
  assertPlainObject(value, label);
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "destructiveHint,idempotentHint,openWorldHint,readOnlyHint") throw new TypeError(`${label} is invalid`);
  if (typeof value.readOnlyHint !== "boolean" || typeof value.destructiveHint !== "boolean" || typeof value.idempotentHint !== "boolean" || value.openWorldHint !== false) throw new TypeError(`${label} is invalid`);
  return Object.freeze({
    readOnlyHint: value.readOnlyHint,
    destructiveHint: value.destructiveHint,
    idempotentHint: value.idempotentHint,
    openWorldHint: false
  });
}

/** @param {Record<string, unknown>} properties @param {readonly string[]} [required] @returns {Readonly<Record<string, unknown>>} */
function defineMcpObjectSchema(properties, required = []) {
  assertPlainObject(properties, "schema properties");
  return Object.freeze({
    type: "object",
    properties: Object.freeze({ ...properties }),
    required: assertStringList(required, "schema required"),
    additionalProperties: false
  });
}

/**
 * @param {unknown} value
 * @returns {Readonly<{capability: string | null, name: string, description: string, inputSchema: Record<string, unknown>, outputSchema: Record<string, unknown>, annotations: ReturnType<typeof assertMcpToolAnnotations>}>}
 */
function defineMcpToolContract(value) {
  assertPlainObject(value, "MCP tool contract");
  const capability = value.capability === null ? null : assertNonEmptyString(value.capability, "MCP tool capability");
  const name = assertNonEmptyString(value.name, "MCP tool name");
  if (!/^[a-z][a-z0-9_]{0,127}$/.test(name)) throw new TypeError("MCP tool name is invalid");
  const description = assertNonEmptyString(value.description, "MCP tool description");
  return Object.freeze({
    capability,
    name,
    description,
    inputSchema: Object.freeze({ ...assertObjectSchema(value.inputSchema, "MCP tool input schema") }),
    outputSchema: Object.freeze({ ...assertObjectSchema(value.outputSchema, "MCP tool output schema") }),
    annotations: assertMcpToolAnnotations(value.annotations, "MCP tool annotations")
  });
}

/** @param {unknown} value @returns {boolean} */
function containsControlCharacter(value) {
  if (typeof value !== "string") return false;
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && (code <= 0x1f || code === 0x7f)) return true;
  }
  return false;
}

/** @param {unknown} job @returns {Record<string, unknown>} */
function assertJob(job) {
  assertPlainObject(job, "job");
  assertNonEmptyString(job.id, "job.id");
  assertNonEmptyString(job.capability, "job.capability");
  assertNonEmptyString(job.ownerId, "job.ownerId");
  assertNonEmptyString(job.idempotencyKey, "job.idempotencyKey");
  if (typeof job.status !== "string" || !JOB_STATUSES.has(/** @type {JobStatus} */ (job.status))) throw new TypeError("job.status is invalid");
  if (!Array.isArray(job.artifacts)) throw new TypeError("job.artifacts must be an array");
  if (job.quality !== undefined && job.quality !== null) assertQualityReport(job.quality);
  return job;
}

/** @param {JobStatus} from @param {JobStatus} to @returns {boolean} */
function canTransition(from, to) { return TRANSITIONS[from]?.has(to) === true; }

/** @param {JobStatus} from @param {JobStatus} to */
function assertTransition(from, to) {
  if (!canTransition(from, to)) throw new Error(`invalid job transition: ${from} -> ${to}`);
}

/** @param {unknown} value */
function createCapabilityRegistration(value) {
  assertPlainObject(value, "registration");
  return Object.freeze({
    capability: assertNonEmptyString(value.capability, "registration.capability"),
    toolNames: Object.freeze(Array.isArray(value.toolNames) ? value.toolNames.map((name) => assertNonEmptyString(name, "tool name")) : []),
    minimumRuntimeVersion: assertNonEmptyString(value.minimumRuntimeVersion, "registration.minimumRuntimeVersion"),
    requiredWorkerProfile: value.requiredWorkerProfile == null ? "base" : assertNonEmptyString(value.requiredWorkerProfile, "registration.requiredWorkerProfile")
  });
}

/** @param {unknown} value */
function assertQualityReport(value) {
  assertPlainObject(value, "quality report");
  const keys = Object.keys(value).sort();
  if (keys.length !== 3 || keys.join(",") !== "checks,metrics,passed" || typeof value.passed !== "boolean" || !Array.isArray(value.checks) || value.checks.length < 1 || value.checks.length > 32) {
    throw new TypeError("quality report is invalid");
  }
  const names = new Set();
  const checks = value.checks.map((check) => {
    assertPlainObject(check, "quality check");
    const checkKeys = Object.keys(check).sort();
    if (checkKeys.length !== 2 || checkKeys.join(",") !== "name,passed" || typeof check.passed !== "boolean") throw new TypeError("quality check is invalid");
    const name = assertNonEmptyString(check.name, "quality check name");
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(name) || names.has(name)) throw new TypeError("quality check name is invalid");
    names.add(name);
    return Object.freeze({ name, passed: check.passed });
  });
  if (value.passed !== checks.every((check) => check.passed)) throw new TypeError("quality report passed state is invalid");
  assertPlainObject(value.metrics, "quality metrics");
  /** @type {Record<string, number>} */
  const metrics = {};
  const metricEntries = Object.entries(value.metrics);
  if (metricEntries.length > 32) throw new TypeError("quality metrics are invalid");
  for (const [name, metric] of metricEntries) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(name) || typeof metric !== "number" || !Number.isFinite(metric) || metric < 0 || metric > 1e12) throw new TypeError("quality metrics are invalid");
    metrics[name] = metric;
  }
  return Object.freeze({ passed: value.passed, checks: Object.freeze(checks), metrics: Object.freeze(metrics) });
}

/**
 * @typedef {Object} JobRepository
 * @property {(id: string) => unknown} get
 * @property {(options: { id: string, capability: string, idempotencyKey: string, expiresAt?: string }) => unknown} create
 * @property {(capability: string, idempotencyKey: string) => unknown} findByIdempotency
 * @property {(id: string, status: JobStatus, extra?: Record<string, unknown>) => unknown} transition
 * @property {(filter?: { capability?: string, status?: JobStatus, limit?: number }) => unknown} list
 */

/**
 * @param {unknown} value
 * @param {string} [label]
 * @returns {asserts value is JobRepository}
 */
function assertJobRepository(value, label = "job repository") {
  assertPlainObject(value, label);
  const candidate = /** @type {Record<string, unknown>} */ (value);
  const requiredMethods = ["get", "create", "findByIdempotency", "transition", "list"];
  for (const method of requiredMethods) {
    if (typeof candidate[method] !== "function") {
      throw new TypeError(label + "." + method + " must be a function");
    }
  }
}

/**
 * @param {unknown} filter
 * @param {{defaultLimit?: number | null}} [options]
 * @returns {Readonly<{capability: string | null, status: JobStatus | null, limit: number | null}>}
 */
function validateJobListFilter(filter = {}, options = {}) {
  if (filter == null) filter = {};
  assertPlainObject(filter, "filter");
  assertPlainObject(options, "filter options");
  const candidate = /** @type {Record<string, unknown>} */ (filter);
  const optionRecord = /** @type {Record<string, unknown>} */ (options);
  const rawDefaultLimit = optionRecord.defaultLimit === undefined ? null : optionRecord.defaultLimit;
  if (rawDefaultLimit !== null && (typeof rawDefaultLimit !== "number" || !Number.isInteger(rawDefaultLimit) || rawDefaultLimit < 1 || rawDefaultLimit > 1000)) {
    throw new TypeError("filter default limit must be an integer between 1 and 1000");
  }
  const defaultLimit = /** @type {number | null} */ (rawDefaultLimit);
  const capability = candidate.capability === undefined ? null : assertNonEmptyString(candidate.capability, "filter.capability");
  const status = candidate.status === undefined ? null : assertNonEmptyString(candidate.status, "filter.status");
  if (status !== null && !JOB_STATUSES.has(/** @type {JobStatus} */ (status))) throw new TypeError("filter.status is invalid");
  const rawLimitValue = candidate.limit === undefined || candidate.limit === null ? defaultLimit : candidate.limit;
  if (rawLimitValue !== null && (typeof rawLimitValue !== "number" || !Number.isInteger(rawLimitValue) || rawLimitValue < 1 || rawLimitValue > 1000)) {
    throw new TypeError("filter.limit must be an integer between 1 and 1000");
  }
  return Object.freeze({ capability, status: /** @type {JobStatus | null} */ (status), limit: /** @type {number | null} */ (rawLimitValue) });
}

module.exports = {
  JOB_STATUSES,
  MCP_JOB_ID_SCHEMA,
  MCP_JOB_SCHEMA,
  MCP_JOB_STATUS_SCHEMA,
  MCP_NON_EMPTY_STRING,
  MCP_SHORT_NOTICE_SCHEMA,
  MCP_SIYUAN_ID_SCHEMA,
  TERMINAL_JOB_STATUSES,
  assertJob,
  assertJobRepository,
  assertPlainObject,
  assertNonEmptyString,
  assertQualityReport,
  assertTransition,
  canTransition,
  containsControlCharacter,
  createCapabilityRegistration,
  defineMcpObjectSchema,
  defineMcpToolContract,
  mcpToolAnnotations,
  validateJobListFilter
};
