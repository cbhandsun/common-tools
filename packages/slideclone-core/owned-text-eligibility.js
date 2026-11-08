// @ts-check
"use strict";
const { types } = require("node:util");

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}

/** Single-run scalar text; emoji sequences and shaping-dependent scripts require separate evidence.
 * @param {unknown} value @returns {value is string} */
function isSimpleOwnedText(value) {
  return typeof value === "string" && value.length >= 3 && value.length <= 128 && value.trim().length > 0
    && /^[\p{Script=Han}\p{Punctuation}\p{Symbol}\x20-\x7E]+$/u.test(value)
    && !/[\p{Emoji_Presentation}\p{Regional_Indicator}\p{Emoji_Modifier}\p{Default_Ignorable_Code_Point}\p{Control}\p{Surrogate}\p{Private_Use}\p{Unassigned}\u20e3]/u.test(value);
}

/** Shared selection/probe admission, before allocating the bounded render budget.
 * @param {unknown} value @returns {value is Record<string,unknown>} */
function isOwnedTextEligible(value) {
  if (!record(value) || typeof value.id !== "string" || !value.id || value.id.length > 256
    || !record(value.source) || !record(value.style) || !record(value.font)) return false;
  const { source, style, font } = value;
  return isSimpleOwnedText(value.text) && typeof source.ocrProvider === "string"
    && source.ocrProvider.length > 0 && source.ocrProvider.length <= 256
    && source.nativeComponentGroupId === undefined && style.nativeComponentGroupId === undefined
    && style.textWarp === undefined && source.segmentedOcrLineId === undefined
    && source.editable === true && typeof source.confidence === "number" && Number.isFinite(source.confidence)
    && source.confidence >= 0.9 && source.confidence <= 1
    && style.visibility === "visible" && style.wrap === false && (value.wrap === undefined || value.wrap === false)
    && value.runs === undefined && (value.rotation === undefined || value.rotation === 0)
    && typeof font.sizePt === "number" && Number.isFinite(font.sizePt) && font.sizePt >= 6 && font.sizePt <= 96
    && (style.opacity === undefined || (typeof style.opacity === "number" && Number.isFinite(style.opacity) && style.opacity > 0))
    && (font.opacity === undefined || (typeof font.opacity === "number" && Number.isFinite(font.opacity) && font.opacity > 0));
}

module.exports = { isSimpleOwnedText, isOwnedTextEligible };
