// @ts-check
"use strict";

const crypto = require("node:crypto");

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_SHEET = /^[A-Za-z0-9 _.-]{1,31}$/;
const SUPPORTED_TYPES = new Set(["bar", "column", "line", "pie", "donut", "doughnut"]);
const NATIVE_PAYLOAD_ADMISSION_ERROR = "editable deck native chart payload is invalid";

/** @typedef {null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue}} JsonValue */
/** @typedef {{ name: string, values: number[] }} NormalizedSeries */
/** @typedef {{ ok: boolean, errors: string[] }} NativeChartPayloadValidation */

/** @param {unknown} chart */
function promoteNativeChartPayload(chart) {
  assertChartBounds(chart);
  if (!SUPPORTED_TYPES.has(normalizeType(field(chart, "type")))) throw new TypeError("chart type is not supported for native promotion");
  if (normalizedSeries(chart).length === 0) throw new TypeError("chart data is empty, non-finite, or exceeds native limits");
  const signature = chartFallbackSignature(chart);
  return {
    schemaVersion: "1.0",
    fallbackSignature: signature,
    fallbackSha256: sha256(signature),
    dataVerified: true,
    workbook: { sheetName: "Data" }
  };
}

/** @param {unknown} chart @param {string} [label] @returns {NativeChartPayloadValidation} */
function validateNativeChartPayload(chart, label = "chart") {
  const errors = [];
  try { assertChartBounds(chart); } catch (error) { errors.push(`${label}: ${errorMessage(error)}`); }
  const payload = field(chart, "nativePayload");
  if (!isPlainObject(payload)) return { ok: false, errors: [`${label}.nativePayload is required for native ChartPart output`] };
  if (payload.schemaVersion !== "1.0") errors.push(`${label}.nativePayload.schemaVersion must be 1.0`);
  if (payload.dataVerified !== true) errors.push(`${label}.nativePayload.dataVerified must be true`);
  const fallbackSignature = payload.fallbackSignature;
  if (typeof fallbackSignature !== "string" || fallbackSignature.length === 0 || fallbackSignature.length > 1024 * 1024) {
    errors.push(`${label}.nativePayload.fallbackSignature is invalid`);
  }
  const fallbackSha256 = payload.fallbackSha256;
  if (typeof fallbackSha256 !== "string" || !SHA256.test(fallbackSha256)) errors.push(`${label}.nativePayload.fallbackSha256 must be a lowercase SHA-256 digest`);
  if (errors.length === 0 && typeof fallbackSignature === "string" && typeof fallbackSha256 === "string" && sha256(fallbackSignature) !== fallbackSha256) {
    errors.push(`${label}.nativePayload fallback signature hash is invalid`);
  }
  if (errors.length === 0 && fallbackSignature !== chartFallbackSignature(chart)) {
    errors.push(`${label}.nativePayload is stale because chart data, type, or style changed`);
  }
  const workbook = isPlainObject(payload.workbook) ? payload.workbook : null;
  const sheetName = workbook?.sheetName ?? "Data";
  if (typeof sheetName !== "string" || !SAFE_SHEET.test(sheetName) || /[\\/*?:[\]]/.test(sheetName) || sheetName.startsWith("'") || sheetName.endsWith("'")) {
    errors.push(`${label}.nativePayload.workbook.sheetName is invalid`);
  }
  if (!SUPPORTED_TYPES.has(normalizeType(field(chart, "type")))) errors.push(`${label}.type is not supported by the native ChartPart builder`);
  if (normalizedSeries(chart).length === 0) errors.push(`${label} has no finite native chart series data`);
  return { ok: errors.length === 0, errors };
}

/** Admit only explicitly supplied native payloads; absent and null payloads use vector fallback.
 * @param {unknown} pages */
function validateDeckNativeChartPayloads(pages) {
  if (!Array.isArray(pages) || pages.length > 50) throw new TypeError(NATIVE_PAYLOAD_ADMISSION_ERROR);
  let chartCount = 0;
  for (const page of pages) {
    if (!isPlainObject(page)) throw new TypeError(NATIVE_PAYLOAD_ADMISSION_ERROR);
    const charts = page.charts;
    if (charts == null) continue;
    if (!Array.isArray(charts)) throw new TypeError(NATIVE_PAYLOAD_ADMISSION_ERROR);
    chartCount += charts.length;
    if (chartCount > 30000) throw new TypeError(NATIVE_PAYLOAD_ADMISSION_ERROR);
    for (const chart of charts) {
      if (!isPlainObject(chart)) throw new TypeError(NATIVE_PAYLOAD_ADMISSION_ERROR);
      if (!Object.hasOwn(chart, "nativePayload") || chart.nativePayload == null) continue;
      if (chart.style != null && !isPlainObject(chart.style)) throw new TypeError(NATIVE_PAYLOAD_ADMISSION_ERROR);
      try {
        if (!validateNativeChartPayload(chart).ok) throw new TypeError(NATIVE_PAYLOAD_ADMISSION_ERROR);
      } catch {
        throw new TypeError(NATIVE_PAYLOAD_ADMISSION_ERROR);
      }
    }
  }
}

/** @param {unknown} chart @returns {string} */
function chartFallbackSignature(chart) {
  const payload = {
    schemaVersion: "1.0",
    type: normalizeType(field(chart, "type")),
    categories: normalizedCategories(chart),
    series: normalizedSeries(chart),
    style: sanitizeJson(field(chart, "style") ?? {})
  };
  return stableStringify(payload);
}

/** @param {unknown} chart @returns {string[]} */
function normalizedCategories(chart) {
  const count = Math.max(0, ...normalizedSeries(chart).map((series) => series.values.length));
  const categories = field(chart, "categories");
  return Array.from({ length: count }, (_, index) => Array.isArray(categories) && typeof categories[index] === "string" ? categories[index].slice(0, 4096) : String(index + 1));
}

/** @param {unknown} chart @returns {NormalizedSeries[]} */
function normalizedSeries(chart) {
  const series = field(chart, "series");
  const values = field(chart, "values");
  const input = Array.isArray(series) && series.length > 0
    ? series
    : (Array.isArray(values) ? [{ name: "Series 1", values }] : []);
  return input.slice(0, 64).flatMap((entry, index) => {
    if (!isPlainObject(entry) || !isFiniteNumberArray(entry.values) || entry.values.length === 0 || entry.values.length > 10000) return [];
    return [{ name: typeof entry.name === "string" && entry.name.length > 0 ? entry.name.slice(0, 4096) : `Series ${index + 1}`, values: entry.values }];
  });
}

/** @param {unknown} chart */
function assertChartBounds(chart) {
  const categories = field(chart, "categories");
  const series = field(chart, "series");
  const values = field(chart, "values");
  if (Array.isArray(categories) && categories.length > 10000) throw new TypeError("chart categories exceed the 10000 item limit");
  if (Array.isArray(categories) && categories.some((value) => typeof value !== "string" || value.length > 4096)) throw new TypeError("chart categories must be strings of at most 4096 characters");
  if (Array.isArray(series) && series.length > 64) throw new TypeError("chart series exceed the 64 item limit");
  if (Array.isArray(values) && (values.length > 10000 || values.length === 0 || !isFiniteNumberArray(values))) throw new TypeError("chart values must contain 1 to 10000 finite numbers");
  for (const entry of Array.isArray(series) ? series : []) {
    if (!isPlainObject(entry) || (entry.name !== undefined && (typeof entry.name !== "string" || entry.name.length > 4096))) throw new TypeError("chart series entries and names are invalid");
    if (!isFiniteNumberArray(entry.values) || entry.values.length === 0 || entry.values.length > 10000) throw new TypeError("chart series values must contain 1 to 10000 finite numbers");
  }
}

/** @param {unknown} value @returns {string} */
function normalizeType(value) {
  const type = String(value || "bar").trim().toLowerCase();
  return type === "doughnut" ? "donut" : type;
}

/** @param {JsonValue} value @returns {string} */
function stableStringify(value) {
  return JSON.stringify(sortJson(value));
}

/** @param {unknown} value @returns {JsonValue} */
function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isPlainObject(value)) {
    if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("chart payload contains a non-finite number");
    if (["string", "number", "boolean"].includes(typeof value) || value === null) return /** @type {null | boolean | number | string} */ (value);
    throw new TypeError("chart payload contains an unsupported JSON value");
  }
  /** @type {{[key: string]: JsonValue}} */
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (["__proto__", "prototype", "constructor"].includes(key)) throw new TypeError("chart payload contains a forbidden key");
    out[key] = sortJson(value[key]);
  }
  return out;
}

/** @param {unknown} value @returns {JsonValue} */
function sanitizeJson(value) {
  return sortJson(value);
}

/** @param {string} value @returns {string} */
function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** @param {unknown} value @returns {value is number[]} */
function isFiniteNumberArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

/** @param {unknown} value @param {string} name @returns {unknown} */
function field(value, name) {
  return isPlainObject(value) ? value[name] : undefined;
}

/** @param {unknown} error @returns {string} */
function errorMessage(error) {
  return error instanceof Error ? error.message : "invalid chart";
}

module.exports = {
  chartFallbackSignature,
  normalizeType,
  normalizedCategories,
  normalizedSeries,
  promoteNativeChartPayload,
  stableStringify,
  validateDeckNativeChartPayloads,
  validateNativeChartPayload
};
