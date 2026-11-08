// @ts-check
"use strict";
const assert = require("node:assert/strict");
const { types } = require("node:util");
const SIGNALS = new Set(["SIGABRT", "SIGHUP", "SIGINT", "SIGKILL", "SIGPIPE", "SIGSEGV", "SIGTERM"]);
const CODES = new Set(["ETIMEDOUT", "ENOBUFS", "ENOENT", "EACCES", "EINVAL", "EPERM", "ENOMEM", "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"]);
/** @param {unknown} value @param {string} key @returns {{valid:boolean,value:unknown}} */
function field(value, key) {
  if (value === null || typeof value !== "object" || types.isProxy(value)) return { valid: false, value: undefined };
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return !descriptor ? { valid: true, value: undefined } : "value" in descriptor
    ? { valid: true, value: descriptor.value } : { valid: false, value: undefined };
}
/** Never put process arguments, stdio, error text, paths or env in an assertion.
 * @param {unknown} result */
function assertProcessSucceeded(result) {
  const statusField = field(result, "status"), signalField = field(result, "signal"), errorField = field(result, "error");
  const rawStatus = statusField.value, rawSignal = signalField.value, error = errorField.value, rawCode = field(error, "code").value;
  const status = typeof rawStatus === "number" && Number.isSafeInteger(rawStatus) && rawStatus >= 0 && rawStatus <= 0xffffffff ? rawStatus : null;
  const signal = typeof rawSignal === "string" && SIGNALS.has(rawSignal) ? rawSignal : null;
  const errorCode = typeof rawCode === "string" && CODES.has(rawCode) ? rawCode : null;
  const message = "child-process-status " + JSON.stringify({ status, signal, errorCode, errorPresent: error !== undefined });
  assert.equal(status, 0, message);
  assert.ok(statusField.valid && signalField.valid && errorField.valid && (rawSignal === undefined || rawSignal === null) && error === undefined, message);
}
module.exports = { assertProcessSucceeded };
