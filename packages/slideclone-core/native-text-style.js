"use strict";
// @ts-check
const {round, clamp} = require("./raster-native-detection");
/** @typedef {{[key:string]: unknown, text?: string, role?: string, box?: {x?: number, y?: number, w?: number, h?: number}, font?: {[key:string]: unknown, sizePt?: number, weight?: string | number | null}}} TextBox */
/** @param {TextBox} item */
function shouldNativeTextBox(item) {
  const box = item?.box || {};
  const font = item?.font || {};
  const text = String(item?.text || "").trim();
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const sizePt = Number(font.sizePt || 0);
  const ratio = width / Math.max(1, height);
  const cjkCount = (text.match(/[\u3400-\u9fff]/g) || []).length;

  // Rotated/slanted labels inside diagrams often OCR as tall narrow boxes.
  // Keeping them in the graphic crop is more faithful than making huge wrapped text.
  if (height >= 72 && ratio <= 0.95 && sizePt >= 22 && cjkCount >= 4) {
    return false;
  }
  return true;
}

/** @param {TextBox} item @param {unknown} [currentWeight] */
function inferWeight(item, currentWeight = null) {
  const role = String(item.role || "").toLowerCase();
  const size = Number(item.font?.sizePt || 0);
  const text = String(item.text || "").trim();
  const box = item.box || {};
  const cjkCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const current = normalizeFontWeightForOpenXml(currentWeight, "");
  if (current && current !== "regular") return current;
  if (role === "title" || size >= 18) return "bold";
  if (looksLikeLargeMetric(text) && size >= 24) return "bold";
  if (looksLikeLargeKpiValue(text) && size >= 24) return "bold";
  if (looksLikeShortCardHeading(item)) return "bold";
  if (Number(box.y || 0) < 105 && size >= 15.5 && cjkCount >= 6) return "bold";
  if (Number(box.h || 0) >= 20 && size >= 14.5 && cjkCount >= 5 && text.length <= 24) return "bold";
  return "regular";
}

/** @param {TextBox[]} [textBoxes] */
function normalizeTextBoxFontWeights(textBoxes = []) {
  return (textBoxes || []).map((textBox) => {
    if (!textBox?.font || textBox.font.weight === undefined || textBox.font.weight === null) return textBox;
    const normalizedWeight = normalizeFontWeightForOpenXml(textBox.font.weight, "regular");
    if (textBox.font.weight === normalizedWeight) return textBox;
    return {
      ...textBox,
      font: {
        ...textBox.font,
        weight: normalizedWeight
      }
    };
  });
}

/** @param {unknown} value @param {string} [fallback] */
function normalizeFontWeightForOpenXml(value, fallback = "regular") {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "number") return Number(value) >= 600 ? "bold" : "regular";
  const text = String(value).trim().toLowerCase();
  if (!text) return fallback;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text) >= 600 ? "bold" : "regular";
  if (/^(bold|bolder|heavy|semibold|semi-bold|demibold|demi-bold)$/.test(text)) return "bold";
  if (/^(regular|normal|book|light|lighter)$/.test(text)) return "regular";
  return text;
}

/** @param {TextBox} item */
function refineFontSize(item) {
  const font = item.font || {};
  const box = item.box || {};
  const size = Number(font.sizePt || 0);
  const height = Number(box.h || 0);
  const text = String(item.text || "").trim();
  if (!size || !height) return font.sizePt;
  let nextSize = size;
  if (looksLikeLargeMetric(text) && height >= 44) {
    nextSize = round(clamp(height * 1.08, size, 76));
  } else if (looksLikeLargeKpiValue(text) && height >= 44) {
    nextSize = round(clamp(height * 0.95, size, 76));
  } else if (looksLikeTopTitle(item) && height >= 20) {
    nextSize = round(clamp(height * 1.05, size, 52));
  } else if (looksLikeShortCardHeading(item) && height >= 18) {
    nextSize = round(clamp(height * 0.95, size, 30));
  }
  return fitSingleLineFontSize(item, nextSize);
}

/** @param {string} text */
function looksLikeLargeMetric(text) {
  return /^[0-9０-９]+(?:[.%％]|[%-－–—][0-9０-９]+[%％]?)+$/.test(String(text || "").trim());
}

/** @param {string} text */
function looksLikeLargeKpiValue(text) {
  return /^[0-9０-９]+(?:\+|＋)?\s*[\u4e00-\u9fff]{1,2}$/.test(String(text || "").trim());
}

/** @param {TextBox} item */
function looksLikeTopTitle(item) {
  const text = String(item?.text || "").trim();
  const box = item?.box || {};
  const cjkCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
  return Number(box.y || 0) < 95 && cjkCount >= 8 && text.length <= 34;
}

/** @param {TextBox} item */
function looksLikeShortCardHeading(item) {
  const text = String(item?.text || "").trim();
  const box = item?.box || {};
  const cjkCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
  if (cjkCount < 4 || cjkCount > 12) return false;
  if (/[。；，,.;:：]/.test(text)) return false;
  return Number(box.w || 0) <= 220 && Number(box.h || 0) >= 18;
}

/** @param {TextBox} item */
function shouldDisableTextWrap(item) {
  const text = String(item?.text || "").trim();
  const box = item?.box || {};
  if (!text || text.includes("\n")) return false;
  const height = Number(box.h || 0);
  const width = Number(box.w || 0);
  const size = Number(item?.font?.sizePt || 0);
  if (!height || !width || !size) return false;
  if (height <= Math.max(24, size * 1.75)) return true;
  if (looksLikeLargeMetric(text) && height <= size * 2.3) return true;
  return false;
}

/** @param {TextBox} item @param {number | undefined} currentSize */
function fitSingleLineFontSize(item, currentSize) {
  const text = String(item?.text || "").trim();
  const box = item?.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const size = Number(currentSize || 0);
  if (!text || text.includes("\n") || !width || !height || !size) return currentSize;
  if (!shouldDisableTextWrap({ ...item, font: { ...(item.font || {}), sizePt: size } })) return currentSize;
  if (Number(box.y || 0) < 110 && text.length <= 36) return currentSize;
  const units = estimatedTextUnits(text);
  if (units <= 0) return currentSize;
  const maxSize = (width * 0.94) / units;
  if (maxSize >= size) return currentSize;
  return round(clamp(maxSize, Math.max(7.5, size * 0.62), size));
}

/** @param {string} text */
function estimatedTextUnits(text) {
  let units = 0;
  for (const char of String(text || "")) {
    if (/[\u3400-\u9fff\uff00-\uffef]/.test(char)) units += 0.86;
    else if (/[A-Z]/.test(char)) units += 0.68;
    else if (/[a-z0-9]/.test(char)) units += 0.56;
    else if (/\s/.test(char)) units += 0.32;
    else units += 0.44;
  }
  return units;
}

module.exports = {shouldNativeTextBox, inferWeight, normalizeTextBoxFontWeights, normalizeFontWeightForOpenXml, refineFontSize, looksLikeLargeMetric, looksLikeLargeKpiValue, looksLikeTopTitle, looksLikeShortCardHeading, shouldDisableTextWrap, fitSingleLineFontSize, estimatedTextUnits};
