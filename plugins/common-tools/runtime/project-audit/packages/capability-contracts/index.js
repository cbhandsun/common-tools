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

/** @param {unknown} value @param {string} label @returns {asserts value is Record<string, unknown>} */
function assertPlainObject(value, label) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
}

/** @param {unknown} value @param {string} label @returns {string} */
function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

/** @param {unknown} value @returns {boolean} */
function containsControlCharacter(value) {
  if (typeof value !== "string") return false;
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
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

module.exports = { JOB_STATUSES, TERMINAL_JOB_STATUSES, assertJob, assertPlainObject, assertNonEmptyString, assertQualityReport, assertTransition, canTransition, containsControlCharacter, createCapabilityRegistration };
