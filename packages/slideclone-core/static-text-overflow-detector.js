// @ts-check
"use strict";

const MIN_SUGGESTED_FONT_PT = 8;
const MAX_FONT_PT = 200;
const MAX_PADDING_PT = 10000;
const MAX_LINE_HEIGHT = 10;
const MAX_TEXT_LENGTH = 10000;
const DEFAULT_LINE_HEIGHT = 1.25;

/**
 * @typedef {Object} Padding
 * @property {number} top
 * @property {number} right
 * @property {number} bottom
 * @property {number} left
 */

/**
 * @typedef {Object} Box
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {Object} OverflowOptions
 * @property {number | Partial<Padding>} [padding]
 * @property {number} [lineHeight]
 * @property {number | null} [maxLines]
 * @property {boolean} [allowWrap]
 */

/**
 * @typedef {Object} OverflowReport
 * @property {boolean} overflows
 * @property {"none" | "warning" | "critical"} severity
 * @property {number} requiredWidth
 * @property {number} requiredHeight
 * @property {number} availableWidth
 * @property {number} availableHeight
 * @property {number} estimatedLines
 * @property {number | null} maxAllowedLines
 * @property {number} suggestedFontSizePt
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function assertFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {string} label
 * @returns {number}
 */
function optionalFiniteNumber(value, fallback, label) {
  if (value === undefined || value === null) return fallback;
  return assertFiniteNumber(value, label);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeText(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") {
    if (value.length > MAX_TEXT_LENGTH) throw new TypeError(`text must be at most ${MAX_TEXT_LENGTH} characters`);
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  throw new TypeError("text must be a string, number, boolean, null, or undefined");
}

/**
 * @param {unknown} value
 * @returns {OverflowOptions}
 */
function normalizeOptions(value) {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) throw new TypeError("options must be an object");
  return /** @type {OverflowOptions} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function normalizePaddingSide(value, label) {
  if (value === undefined || value === null) return 0;
  const number = assertFiniteNumber(value, label);
  if (number < 0 || number > MAX_PADDING_PT) {
    throw new TypeError(`${label} must be a number between 0 and ${MAX_PADDING_PT}`);
  }
  return number;
}

/**
 * @param {unknown} value
 * @returns {Padding}
 */
function resolvePadding(value) {
  if (value == null) return { top: 2, right: 2, bottom: 2, left: 2 };
  if (typeof value === "number") {
    const p = normalizePaddingSide(value, "padding");
    return { top: p, right: p, bottom: p, left: p };
  }
  if (isPlainObject(value)) {
    const raw = /** @type {Record<string, unknown>} */ (value);
    return {
      top: normalizePaddingSide(raw.top, "padding.top"),
      right: normalizePaddingSide(raw.right, "padding.right"),
      bottom: normalizePaddingSide(raw.bottom, "padding.bottom"),
      left: normalizePaddingSide(raw.left, "padding.left")
    };
  }
  throw new TypeError("padding must be a number or an object");
}

/**
 * Estimate single-line text width based on CJK and Latin proportions.
 * @param {string} text
 * @param {number} fontSizePt
 * @returns {number}
 */
function estimateSingleLineWidth(text, fontSizePt) {
  assertFiniteNumber(fontSizePt, "fontSizePt");
  if (!text) return 0;
  const cjkMatches = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const latinCount = text.length - cjkCount;

  // CJK characters take roughly 1.0em; Latin/digits average ~0.55em.
  const emUnits = cjkCount * 1.0 + latinCount * 0.55;
  return Math.round(emUnits * fontSizePt * 100) / 100;
}

/**
 * Detect text overflow and line wrapping risks geometrically without requiring Office COM.
 * @param {unknown} text
 * @param {unknown} fontSizePt
 * @param {unknown} box
 * @param {OverflowOptions} [options]
 * @returns {OverflowReport}
 */
function detectStaticTextOverflow(text, fontSizePt, box, options = {}) {
  const normalizedText = normalizeText(text);
  const fontValue = optionalFiniteNumber(fontSizePt, 12, "fontSizePt");
  if (fontValue <= 0 || fontValue > MAX_FONT_PT) {
    throw new TypeError(`fontSizePt must be a positive finite number no greater than ${MAX_FONT_PT}`);
  }
  const fontPt = Math.max(1, Math.min(MAX_FONT_PT, fontValue));
  const normalizedOptions = normalizeOptions(options);

  if (!isPlainObject(box)) {
    throw new TypeError("box must be an object with w and h");
  }
  const rawBox = /** @type {Record<string, unknown>} */ (box);
  const w = assertFiniteNumber(rawBox.w, "box.w");
  const h = assertFiniteNumber(rawBox.h, "box.h");
  if (w <= 0 || h <= 0) throw new TypeError("box width and height must be positive finite numbers");

  const padding = resolvePadding(normalizedOptions.padding);
  const lineHeightValue = optionalFiniteNumber(normalizedOptions.lineHeight, DEFAULT_LINE_HEIGHT, "lineHeight");
  if (lineHeightValue < 1 || lineHeightValue > MAX_LINE_HEIGHT) {
    throw new TypeError(`lineHeight must be a number between 1 and ${MAX_LINE_HEIGHT}`);
  }
  const lineHeight = lineHeightValue;
  if (normalizedOptions.allowWrap !== undefined && typeof normalizedOptions.allowWrap !== "boolean") {
    throw new TypeError("allowWrap must be a boolean");
  }
  const allowWrap = normalizedOptions.allowWrap !== false;
  let maxLines = /** @type {number | null} */ (null);
  if (normalizedOptions.maxLines != null) {
    if (typeof normalizedOptions.maxLines !== "number" || !Number.isSafeInteger(normalizedOptions.maxLines) || normalizedOptions.maxLines < 1 || normalizedOptions.maxLines > 1000) {
      throw new TypeError("maxLines must be an integer between 1 and 1000");
    }
    maxLines = normalizedOptions.maxLines;
  }

  const availableWidth = Math.max(1, w - padding.left - padding.right);
  const availableHeight = Math.max(1, h - padding.top - padding.bottom);

  const singleLineWidth = estimateSingleLineWidth(normalizedText, fontPt);
  const singleLineHeight = fontPt * lineHeight;

  let estimatedLines = 1;
  let requiredWidth = singleLineWidth;
  let requiredHeight = singleLineHeight;

  if (allowWrap && singleLineWidth > availableWidth) {
    estimatedLines = Math.ceil(singleLineWidth / availableWidth);
    requiredWidth = Math.min(singleLineWidth, availableWidth);
    requiredHeight = estimatedLines * singleLineHeight;
  }

  const widthOverflow = requiredWidth > availableWidth;
  const heightOverflow = requiredHeight > availableHeight;
  const linesOverflow = maxLines != null && estimatedLines > maxLines;

  const overflows = widthOverflow || heightOverflow || linesOverflow;

  // Calculate severity
  let severity = /** @type {"none" | "warning" | "critical"} */ ("none");
  if (overflows) {
    const widthRatio = requiredWidth / availableWidth;
    const heightRatio = requiredHeight / availableHeight;
    const maxRatio = Math.max(widthRatio, heightRatio);

    if (maxRatio > 1.2 || (maxLines != null && estimatedLines >= maxLines + 2)) {
      severity = "critical";
    } else {
      severity = "warning";
    }
  }

  // Calculate suggested font size to eliminate overflow
  let suggestedFontSizePt = fontPt;
  if (overflows) {
    if (!allowWrap || maxLines === 1) {
      // Scale directly to fit single line
      const scale = availableWidth / Math.max(1, singleLineWidth);
      suggestedFontSizePt = Math.max(MIN_SUGGESTED_FONT_PT, Math.min(fontPt, Math.floor(fontPt * scale * 2) / 2));
    } else {
      // Binary search / proportional reduction to fit available box and maxLines
      const targetLines = maxLines != null ? maxLines : Math.floor(availableHeight / singleLineHeight);
      const allowedTotalHeight = Math.min(availableHeight, (targetLines || 1) * singleLineHeight);
      const areaRatio = (availableWidth * allowedTotalHeight) / Math.max(1, singleLineWidth * singleLineHeight);
      const scale = Math.sqrt(Math.max(0.2, Math.min(1.0, areaRatio)));
      suggestedFontSizePt = Math.max(MIN_SUGGESTED_FONT_PT, Math.min(fontPt, Math.floor(fontPt * scale * 2) / 2));
    }
  }

  return Object.freeze({
    overflows,
    severity,
    requiredWidth: Math.round(requiredWidth * 100) / 100,
    requiredHeight: Math.round(requiredHeight * 100) / 100,
    availableWidth: Math.round(availableWidth * 100) / 100,
    availableHeight: Math.round(availableHeight * 100) / 100,
    estimatedLines,
    maxAllowedLines: maxLines,
    suggestedFontSizePt
  });
}

module.exports = {
  detectStaticTextOverflow,
  estimateSingleLineWidth
};
