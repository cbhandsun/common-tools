// @ts-check
"use strict";
const {types} = require("node:util");
const {assertTraceParent, withTraceParent} = require("./job-input");
const {assertLeaseAttempt, attemptOutputPrefix} = require("./worker-lease");

/** @param {unknown} value @param {string} label */
function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096) throw new TypeError(`${label} is invalid`);
  return value;
}

/** Read a repository result without executing accessors while copying fields.
 * @param {unknown} value */
function createWorkerJob(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || types.isProxy(value)) throw new TypeError("worker claimed Job is invalid");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError("worker claimed Job is invalid");
  /** @type {Record<string, unknown>} */ const fields = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new TypeError("worker claimed Job fields are invalid");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    // Repository jobs intentionally keep validated tracing metadata out of JSON.
    if (!descriptor || !("value" in descriptor) || (!descriptor.enumerable && key !== "traceParent")) throw new TypeError("worker claimed Job requires data properties");
    fields[key] = /** @type {unknown} */ (descriptor.value);
  }
  const id = assertNonEmptyString(fields.id, "claimed Job id");
  const capability = assertNonEmptyString(fields.capability, "claimed Job capability");
  const attempt = assertLeaseAttempt(fields.attempt);
  const outputPrefix = attemptOutputPrefix(fields.outputPrefix, attempt);
  return Object.freeze(withTraceParent({...fields, id, capability, attempt, outputPrefix}, assertTraceParent(fields.traceParent)));
}

/** @template {ReturnType<typeof createWorkerJob>} T
 * @param {T} job @param {() => Promise<boolean>} isCancellationRequested */
function createWorkerHandlerContext(job, isCancellationRequested) {
  if (typeof isCancellationRequested !== "function") throw new TypeError("worker cancellation callback is required");
  return Object.freeze({job, isCancellationRequested});
}
module.exports = {createWorkerJob, createWorkerHandlerContext};
