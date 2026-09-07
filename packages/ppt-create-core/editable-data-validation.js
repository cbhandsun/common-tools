// @ts-check
"use strict";

const MAX_TABLE_ROWS = 10_000;
const MAX_TABLE_COLUMNS = 1_000;
const MAX_TABLE_CELL_LENGTH = 32_768;
const MAX_CHART_CATEGORIES = 10_000;
const MAX_CHART_SERIES = 64;
const MAX_CHART_LABEL_LENGTH = 4_096;
const MAX_CHART_VALUES = 10_000;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** @param {number | undefined} code */
function invalidXmlCodePoint(code) {
  return code === undefined || (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d)
    || (code >= 0xd800 && code <= 0xdfff) || code === 0xfffe || code === 0xffff;
}

/** @param {string} value */
function containsUnsafeText(value) {
  return [...value].some((character) => {
    const code = character.codePointAt(0);
    return invalidXmlCodePoint(code) || (code !== undefined && code <= 0x1f) || code === 0x7f;
  });
}

/** @param {unknown} value @param {string} label @param {number} maximum */
function boundedEditableText(value, label, maximum) {
  if (typeof value !== "string" || value.length > maximum || containsUnsafeText(value)) throw new TypeError(`${label} is invalid`);
  return value;
}

/** @param {string} value */
function containsUnsafeRawDataText(value) {
  return [...value].some((character) => {
    const code = character.codePointAt(0);
    return invalidXmlCodePoint(code) || code === 0x7f;
  });
}

/** @param {unknown} value @param {string} label @param {number} maximum */
function boundedRawDataText(value, label, maximum) {
  if (typeof value !== "string" || value.length > maximum || containsUnsafeRawDataText(value)) throw new TypeError(`${label} is invalid`);
  return value;
}

/**
 * Validates raw native table data without requiring a rectangular matrix. The
 * OpenXML table writer fills uneven rows, including empty rows, so admission
 * must preserve that established image-to-editable behavior.
 * @param {unknown} table
 */
function validateEditableTableData(table) {
  if (!plainObject(table) || !Array.isArray(table.rows) || table.rows.length < 1 || table.rows.length > MAX_TABLE_ROWS) throw new TypeError("editable table rows are invalid");
  for (const row of table.rows) {
    if (!Array.isArray(row) || row.length > MAX_TABLE_COLUMNS) throw new TypeError("editable table row is invalid");
    for (const cell of row) boundedRawDataText(cell, "editable table cell", MAX_TABLE_CELL_LENGTH);
  }
}

/**
 * Validates raw native chart data using the limits accepted by the OpenXML
 * writer. This intentionally differs from the smaller interactive edit form:
 * historical rebuilt charts may have one or more than twelve categories.
 * @param {unknown} value
 * @param {readonly string[]} allowedTypes
 * @returns {boolean}
 */
function isSupportedNativeChartType(value, allowedTypes) {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "" || normalized === "doughnut" || allowedTypes.includes(normalized);
}

/** @param {unknown} values @param {string} label */
function validateFiniteValues(values, label) {
  if (!Array.isArray(values) || values.length > MAX_CHART_VALUES) throw new TypeError(`${label} are invalid`);
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} are invalid`);
  }
}

/**
 * @param {unknown} chart
 * @param {readonly string[]} allowedTypes
 */
function validateEditableChartData(chart, allowedTypes) {
  if (!plainObject(chart) || !isSupportedNativeChartType(chart.type, allowedTypes)) throw new TypeError("editable chart type is invalid");
  if (chart.categories !== undefined && chart.categories !== null) {
    if (!Array.isArray(chart.categories) || chart.categories.length > MAX_CHART_CATEGORIES) throw new TypeError("editable chart categories are invalid");
    for (const category of chart.categories) boundedRawDataText(category, "editable chart category", MAX_CHART_LABEL_LENGTH);
  }
  if (chart.values !== undefined && chart.values !== null) validateFiniteValues(chart.values, "editable chart values");
  if (chart.series !== undefined && chart.series !== null && (!Array.isArray(chart.series) || chart.series.length > MAX_CHART_SERIES)) throw new TypeError("editable chart series are invalid");
  const series = Array.isArray(chart.series) ? chart.series : [];
  for (const entry of series) {
    if (!plainObject(entry)) throw new TypeError("editable chart series is invalid");
    if (entry.name !== undefined && entry.name !== null) boundedRawDataText(entry.name, "editable chart series name", MAX_CHART_LABEL_LENGTH);
    validateFiniteValues(entry.values, "editable chart values");
  }
  if (series.length > 0 && series.some((entry) => Array.isArray(entry.values) && entry.values.length === 0)) throw new TypeError("editable chart values are invalid");
  if (series.length === 0 && (!Array.isArray(chart.values) || chart.values.length === 0)) throw new TypeError("editable chart data is invalid");
}

module.exports = { MAX_CHART_CATEGORIES, MAX_CHART_LABEL_LENGTH, MAX_CHART_SERIES, MAX_CHART_VALUES, MAX_TABLE_CELL_LENGTH, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, boundedEditableText, boundedRawDataText, validateEditableChartData, validateEditableTableData };
