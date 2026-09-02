"use strict";

const QUALITY_GATE_REQUIRED = "quality-gate-required";

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} is invalid`);
  return value;
}

function qualityGateRequirement(output) {
  const value = assertPlainObject(output, "worker output").completionPolicy;
  if (value === undefined) return false;
  if (value !== QUALITY_GATE_REQUIRED) throw new TypeError("worker completion policy is invalid");
  return true;
}

function resolveWorkerCompletion(output, quality) {
  const required = qualityGateRequirement(output);
  if (!required || quality.passed) return Object.freeze({ status: "succeeded", error: null });
  return Object.freeze({
    status: "failed",
    error: Object.freeze({
      code: "QUALITY_GATE_FAILED",
      message: "capability output did not pass required quality gates",
      retryable: false
    })
  });
}

module.exports = { QUALITY_GATE_REQUIRED, qualityGateRequirement, resolveWorkerCompletion };
