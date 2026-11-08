// @ts-check
"use strict";
const { types } = require("node:util");
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{text:string,box:Box}} WordHint */
/** @param {unknown} value @param {string} key @returns {unknown} */
function field(value, key) {
  if (!value || typeof value !== "object" || types.isProxy(value)) throw new TypeError("OCR word position is invalid");
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor)) throw new TypeError("OCR word position is invalid");
  return /** @type {unknown} */ (descriptor.value);
}
/** @param {unknown} value @returns {number} */
function number(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("OCR word position is invalid");
  return value;
}
/** Position hints describe recognition alignment, never glyph ownership or erasure permission.
 * @param {unknown} value @param {{text:string,box:Box}} line @returns {readonly WordHint[]|undefined} */
function admitOcrWordPositionHints(value, line) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || types.isProxy(value) || value.length < 1 || value.length > 512)
    throw new TypeError("OCR word position is invalid");
  /** @type {WordHint[]} */
  const hints = [];
  let previousCenter = -Infinity;
  for (let index = 0; index < value.length; index += 1) {
    const hint = field(value, String(index)), text = field(hint, "text"), box = field(hint, "box");
    if (typeof text !== "string" || !text || text.length > 512
      || Array.from(text).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
      throw new TypeError("OCR word position is invalid");
    const x = number(field(box, "x")), y = number(field(box, "y")), w = number(field(box, "w")), h = number(field(box, "h"));
    if (w <= 0 || h <= 0 || x < line.box.x || y < line.box.y || x + w > line.box.x + line.box.w
      || y + h > line.box.y + line.box.h || x + w / 2 <= previousCenter)
      throw new TypeError("OCR word position is invalid");
    previousCenter = x + w / 2;
    hints.push(Object.freeze({ text, box: Object.freeze({ x, y, w, h }) }));
  }
  if (hints.map(hint => hint.text).join("") !== line.text.trim()) throw new TypeError("OCR word position sequence is invalid");
  return Object.freeze(hints);
}
module.exports = { admitOcrWordPositionHints };
