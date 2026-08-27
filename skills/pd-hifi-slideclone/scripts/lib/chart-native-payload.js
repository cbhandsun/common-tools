"use strict";

const crypto = require("node:crypto");

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_SHEET = /^[A-Za-z0-9 _.-]{1,31}$/;
const SUPPORTED_TYPES = new Set(["bar", "column", "line", "pie", "donut", "doughnut"]);

function promoteNativeChartPayload(chart) {
  assertChartBounds(chart);
  if (!SUPPORTED_TYPES.has(normalizeType(chart?.type))) throw new TypeError("chart type is not supported for native promotion");
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

function validateNativeChartPayload(chart, label = "chart") {
  const errors = [];
  try { assertChartBounds(chart); } catch (error) { errors.push(`${label}: ${error.message}`); }
  const payload = chart?.nativePayload;
  if (!isPlainObject(payload)) return { ok: false, errors: [`${label}.nativePayload is required for native ChartPart output`] };
  if (payload.schemaVersion !== "1.0") errors.push(`${label}.nativePayload.schemaVersion must be 1.0`);
  if (payload.dataVerified !== true) errors.push(`${label}.nativePayload.dataVerified must be true`);
  if (typeof payload.fallbackSignature !== "string" || payload.fallbackSignature.length === 0 || payload.fallbackSignature.length > 1024 * 1024) {
    errors.push(`${label}.nativePayload.fallbackSignature is invalid`);
  }
  if (!SHA256.test(String(payload.fallbackSha256 || ""))) errors.push(`${label}.nativePayload.fallbackSha256 must be a lowercase SHA-256 digest`);
  if (errors.length === 0 && sha256(payload.fallbackSignature) !== payload.fallbackSha256) {
    errors.push(`${label}.nativePayload fallback signature hash is invalid`);
  }
  if (errors.length === 0 && payload.fallbackSignature !== chartFallbackSignature(chart)) {
    errors.push(`${label}.nativePayload is stale because chart data, type, or style changed`);
  }
  const sheetName = payload.workbook?.sheetName ?? "Data";
  if (typeof sheetName !== "string" || !SAFE_SHEET.test(sheetName) || /[\\/*?:\[\]]/.test(sheetName) || sheetName.startsWith("'") || sheetName.endsWith("'")) {
    errors.push(`${label}.nativePayload.workbook.sheetName is invalid`);
  }
  if (!SUPPORTED_TYPES.has(normalizeType(chart?.type))) errors.push(`${label}.type is not supported by the native ChartPart builder`);
  if (normalizedSeries(chart).length === 0) errors.push(`${label} has no finite native chart series data`);
  return { ok: errors.length === 0, errors };
}

function chartFallbackSignature(chart) {
  const payload = {
    schemaVersion: "1.0",
    type: normalizeType(chart?.type),
    categories: normalizedCategories(chart),
    series: normalizedSeries(chart),
    style: sanitizeJson(chart?.style ?? {})
  };
  return stableStringify(payload);
}

function normalizedCategories(chart) {
  const count = Math.max(0, ...normalizedSeries(chart).map((series) => series.values.length));
  const categories = Array.isArray(chart?.categories) ? chart.categories : [];
  return Array.from({ length: count }, (_, index) => typeof categories[index] === "string" ? categories[index].slice(0, 4096) : String(index + 1));
}

function normalizedSeries(chart) {
  const input = Array.isArray(chart?.series) && chart.series.length > 0
    ? chart.series
    : (Array.isArray(chart?.values) ? [{ name: "Series 1", values: chart.values }] : []);
  return input.slice(0, 64).flatMap((entry, index) => {
    if (!isPlainObject(entry) || !Array.isArray(entry.values) || entry.values.length === 0 || entry.values.length > 10000) return [];
    if (!entry.values.every(Number.isFinite)) return [];
    return [{ name: typeof entry.name === "string" && entry.name.length > 0 ? entry.name.slice(0, 4096) : `Series ${index + 1}`, values: entry.values }];
  });
}

function assertChartBounds(chart) {
  if (Array.isArray(chart?.categories) && chart.categories.length > 10000) throw new TypeError("chart categories exceed the 10000 item limit");
  if (Array.isArray(chart?.categories) && chart.categories.some((value) => typeof value !== "string" || value.length > 4096)) throw new TypeError("chart categories must be strings of at most 4096 characters");
  if (Array.isArray(chart?.series) && chart.series.length > 64) throw new TypeError("chart series exceed the 64 item limit");
  if (Array.isArray(chart?.values) && (chart.values.length > 10000 || chart.values.length === 0 || chart.values.some((value) => !Number.isFinite(value)))) throw new TypeError("chart values must contain 1 to 10000 finite numbers");
  for (const entry of Array.isArray(chart?.series) ? chart.series : []) {
    if (!isPlainObject(entry) || (entry.name !== undefined && (typeof entry.name !== "string" || entry.name.length > 4096))) throw new TypeError("chart series entries and names are invalid");
    if (!Array.isArray(entry.values) || entry.values.length === 0 || entry.values.length > 10000 || entry.values.some((value) => !Number.isFinite(value))) throw new TypeError("chart series values must contain 1 to 10000 finite numbers");
  }
}

function normalizeType(value) {
  const type = String(value || "bar").trim().toLowerCase();
  if (type === "doughnut") return "donut";
  return type;
}

function stableStringify(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isPlainObject(value)) {
    if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("chart payload contains a non-finite number");
    if (["string", "number", "boolean"].includes(typeof value) || value === null) return value;
    throw new TypeError("chart payload contains an unsupported JSON value");
  }
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (["__proto__", "prototype", "constructor"].includes(key)) throw new TypeError("chart payload contains a forbidden key");
    out[key] = sortJson(value[key]);
  }
  return out;
}

function sanitizeJson(value) {
  return sortJson(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

module.exports = {
  chartFallbackSignature,
  normalizeType,
  normalizedCategories,
  normalizedSeries,
  promoteNativeChartPayload,
  stableStringify,
  validateNativeChartPayload
};
