// @ts-check
"use strict";

/** @param {unknown} value @returns {number} */
function assertLeaseAttempt(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2147483647) throw new RangeError("worker lease attempt is invalid");
  return value;
}

/** @param {unknown} value @returns {number} */
function assertLeaseSeconds(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 30 || value > 600) throw new RangeError("worker leaseSeconds must be between 30 and 600");
  return value;
}

/** @param {unknown} prefix @param {unknown} attempt @returns {string} */
function attemptOutputPrefix(prefix, attempt) {
  const checked = assertLeaseAttempt(attempt);
  if (typeof prefix !== "string" || !/^owners\/[a-f0-9]{1,64}\/jobs\/[a-zA-Z0-9_-]{1,128}\/$/.test(prefix)) throw new TypeError("worker output prefix is invalid");
  return `${prefix}attempts/${checked}/`;
}

module.exports = { assertLeaseAttempt, assertLeaseSeconds, attemptOutputPrefix };
