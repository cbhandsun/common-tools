// @ts-check
"use strict";

const { types } = require("node:util");
const { boundedOcrSourceDeck } = require("./ocr-source-deck");

/** @typedef {{text: string, confidence: number, box: {x: number, y: number, w: number, h: number}}} OcrLine */

/** @param {unknown} value @param {string} key @returns {unknown} */
function field(value, key) {
  if (!value || typeof value !== "object" || types.isProxy(value)) throw new TypeError("OCR result is invalid");
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!("value" in descriptor)) throw new TypeError("OCR result is invalid");
  return /** @type {unknown} */ (descriptor.value);
}

/** @param {unknown} value @returns {number} */
function number(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("OCR result is invalid");
  return value;
}

/** Snapshot known data before invoking the existing geometry/text validator.
 * Preserve source text here; contextual corrections belong to the IR projection.
 * @param {unknown} value
 * @param {unknown} dimensions
 * @returns {{lines: readonly OcrLine[]}}
 */
function admitOcrResult(value, dimensions) {
  const size = { widthPx: number(field(dimensions, "widthPx")), heightPx: number(field(dimensions, "heightPx")) };
  const input = field(value, "lines");
  if (!Array.isArray(input) || types.isProxy(input) || input.length > 10000) throw new TypeError("OCR result is invalid");
  /** @type {OcrLine[]} */
  const lines = [];
  for (let index = 0; index < input.length; index += 1) {
    const line = field(input, String(index));
    const text = field(line, "text"), box = field(line, "box"), confidence = field(line, "confidence");
    if (typeof text !== "string") throw new TypeError("OCR result is invalid");
    lines.push(Object.freeze({ text, confidence: confidence === undefined ? 1 : number(confidence), box: Object.freeze({
      x: number(field(box, "x")), y: number(field(box, "y")), w: number(field(box, "w")), h: number(field(box, "h"))
    }) }));
  }
  const result = Object.freeze({ lines: Object.freeze(lines) });
  boundedOcrSourceDeck({ metadata: { dimensions: size }, ocr: result, sourceImage: "assets/ocr-source.png" });
  return result;
}

module.exports = { admitOcrResult };
