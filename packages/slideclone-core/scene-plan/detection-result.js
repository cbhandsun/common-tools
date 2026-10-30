"use strict";

const CONTRACT_VERSION = "1.0";
const FAILURE_MODES = new Set(["none", "insufficient-evidence", "invalid-input", "unsupported", "internal-failure"]);
const SAFE_CODE = /^[a-z0-9][a-z0-9._:-]{0,95}$/;
const MAX_ITEMS = 128;

function createDetectionResult(input = {}, defaults = {}) {
  const source = plainObject(input) ? input : {};
  const fallback = plainObject(defaults) ? defaults : {};
  const matched = source.matched === true;
  const failureMode = normalizeFailureMode(source.failureMode, matched);
  const result = {
    contractVersion: CONTRACT_VERSION,
    matched,
    confidence: finiteRatio(source.confidence, matched ? finiteRatio(fallback.confidence, 0) : 0),
    bounds: normalizeBox(source.bounds || fallback.bounds),
    evidence: normalizeEvidence(source.evidence),
    reasonCodes: normalizeCodes(source.reasonCodes),
    claimedRegions: normalizeClaimedRegions(source.claimedRegions),
    diagnostics: normalizeDiagnostics(source.diagnostics),
    failureMode
  };
  return deepFreeze(result);
}

function unmatchedDetectionResult(reasonCode = "detector.no-match", options = {}) {
  return createDetectionResult({
    matched: false,
    reasonCodes: [safeCode(reasonCode, "detector.no-match")],
    failureMode: options.failureMode || "insufficient-evidence",
    diagnostics: options.diagnostics
  });
}

function validateDetectionResult(value) {
  const errors = [];
  if (!plainObject(value)) return { ok: false, errors: ["detection result must be an object"] };
  if (value.contractVersion !== CONTRACT_VERSION) errors.push(`contractVersion must be ${CONTRACT_VERSION}`);
  if (typeof value.matched !== "boolean") errors.push("matched must be a boolean");
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) errors.push("confidence must be between 0 and 1");
  if (value.bounds !== null && !validBox(value.bounds)) errors.push("bounds must be null or a finite positive box");
  if (!Array.isArray(value.evidence) || value.evidence.some((item) => !validEvidence(item))) errors.push("evidence must contain bounded coded entries");
  if (!Array.isArray(value.reasonCodes) || value.reasonCodes.some((item) => !SAFE_CODE.test(item))) errors.push("reasonCodes must contain safe bounded codes");
  if (!Array.isArray(value.claimedRegions) || value.claimedRegions.some((item) => !validClaimedRegion(item))) errors.push("claimedRegions must contain valid region claims");
  if (!plainObject(value.diagnostics) || Object.values(value.diagnostics).some((item) => !validDiagnosticValue(item))) errors.push("diagnostics must contain bounded scalar values");
  if (!FAILURE_MODES.has(value.failureMode)) errors.push("failureMode is invalid");
  if (value.matched === true && value.failureMode !== "none") errors.push("matched results must use failureMode none");
  return { ok: errors.length === 0, errors };
}

function normalizeClaimedRegions(value) {
  return boundedArray(value).map((item, index) => ({
    id: safeCode(item?.id, `region-${index + 1}`),
    box: normalizeBox(item?.box),
    purpose: safeCode(item?.purpose, "native-rebuild"),
    dropResidual: item?.dropResidual === true
  })).filter((item) => item.box !== null);
}

function normalizeEvidence(value) {
  return boundedArray(value).map((item, index) => ({
    code: safeCode(item?.code, `evidence-${index + 1}`),
    score: finiteRatio(item?.score, 0),
    box: normalizeBox(item?.box)
  }));
}

function normalizeCodes(value) {
  return [...new Set(boundedArray(value).map((item) => safeCode(item, "detector.unspecified")))];
}

function normalizeDiagnostics(value) {
  if (!plainObject(value)) return {};
  const output = {};
  for (const key of Object.keys(value).slice(0, MAX_ITEMS)) {
    const normalizedKey = safeCode(key, "metric");
    const item = value[key];
    if (typeof item === "boolean") output[normalizedKey] = item;
    else if (Number.isFinite(item)) output[normalizedKey] = Math.max(-1e12, Math.min(1e12, Number(item)));
    else if (typeof item === "string" && SAFE_CODE.test(item)) output[normalizedKey] = item;
  }
  return output;
}

function normalizeFailureMode(value, matched) {
  if (matched) return "none";
  return FAILURE_MODES.has(value) && value !== "none" ? value : "insufficient-evidence";
}

function normalizeBox(value) {
  if (!validBox(value)) return null;
  return Object.freeze({ x: Number(value.x), y: Number(value.y), w: Number(value.w), h: Number(value.h) });
}

function validBox(value) {
  const numbers = [value?.x, value?.y, value?.w, value?.h].map(Number);
  return numbers.every(Number.isFinite)
    && Math.abs(numbers[0]) <= 1e7
    && Math.abs(numbers[1]) <= 1e7
    && numbers[2] > 0 && numbers[2] <= 1e7
    && numbers[3] > 0 && numbers[3] <= 1e7;
}

function validEvidence(item) {
  return plainObject(item) && SAFE_CODE.test(item.code) && Number.isFinite(item.score)
    && item.score >= 0 && item.score <= 1 && (item.box === null || validBox(item.box));
}

function validClaimedRegion(item) {
  return plainObject(item) && SAFE_CODE.test(item.id) && SAFE_CODE.test(item.purpose)
    && validBox(item.box) && typeof item.dropResidual === "boolean";
}

function validDiagnosticValue(value) {
  return typeof value === "boolean" || Number.isFinite(value) || (typeof value === "string" && SAFE_CODE.test(value));
}

function safeCode(value, fallback) {
  const normalized = String(value || "").trim().toLowerCase();
  return SAFE_CODE.test(normalized) ? normalized : fallback;
}

function finiteRatio(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1 ? numeric : fallback;
}

function boundedArray(value) {
  return Array.isArray(value) ? value.slice(0, MAX_ITEMS) : [];
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze(value) {
  Object.freeze(value);
  for (const item of Object.values(value)) {
    if (item && typeof item === "object" && !Object.isFrozen(item)) deepFreeze(item);
  }
  return value;
}

module.exports = {
  CONTRACT_VERSION,
  FAILURE_MODES,
  createDetectionResult,
  unmatchedDetectionResult,
  validateDetectionResult
};
