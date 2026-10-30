// @ts-check
"use strict";
const crypto = require("node:crypto");
const { types } = require("node:util");
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{hash:string,box:Box,confidence:number}} ConfidenceCrop */
/** @typedef {{operation:"same-text-confidence",sourceHash:string,revision:string,originalConfidence:number,provider:string,crops:ConfidenceCrop[]}} ConfidenceEvidence */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && [null, Object.prototype].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value @returns {value is string} */
function hash(value) { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
/** Preserve the original confidence; this evidence cannot authorize changing source text.
 * @param {unknown} value @param {{text:string,confidence:number,box:Box}} line
 * @param {{widthPx:number,heightPx:number}} dimensions @returns {ConfidenceEvidence|undefined} */
function admitOcrConfidenceEvidence(value, line, dimensions) {
  if (value === undefined) return undefined;
  if (!record(value) || value.operation !== "same-text-confidence" || !hash(value.sourceHash) || !hash(value.revision)
    || !finite(value.originalConfidence) || value.originalConfidence < 0.5 || value.originalConfidence >= 0.9
    || typeof value.provider !== "string" || !/^[A-Za-z0-9_.-]{1,64}$/u.test(value.provider)
    || !Array.isArray(value.crops) || types.isProxy(value.crops) || value.crops.length !== 2) throw new TypeError("OCR confidence evidence is invalid");
  const expectedRevision = crypto.createHash("sha256").update(JSON.stringify({ text: line.text,
    confidence: value.originalConfidence, box: line.box })).digest("hex");
  if (value.revision !== expectedRevision) throw new TypeError("OCR confidence evidence revision is stale");
  /** @type {ConfidenceCrop[]} */ const crops = [];
  for (let index = 0; index < 2; index++) {
    const property = Object.getOwnPropertyDescriptor(value.crops, String(index));
    if (!property || !("value" in property) || !record(property.value)) throw new TypeError("OCR confidence crop is invalid");
    const crop = property.value;
    if (!hash(crop.hash) || !finite(crop.confidence) || crop.confidence < 0.9 || crop.confidence > 1 || !record(crop.box)) throw new TypeError("OCR confidence crop is invalid");
    const { x, y, w, h } = crop.box;
    if (!finite(x) || !finite(y) || !finite(w) || !finite(h) || ![x, y, w, h].every(Number.isSafeInteger)
      || x < 0 || y < 0 || w < 1 || h < 1 || x + w > dimensions.widthPx || y + h > dimensions.heightPx
      || x > line.box.x || y > line.box.y || x + w < line.box.x + line.box.w || y + h < line.box.y + line.box.h) throw new TypeError("OCR confidence crop geometry is invalid");
    crops.push({ hash: crop.hash, confidence: crop.confidence, box: { x, y, w, h } });
  }
  const first = crops[0], second = crops[1];
  if (!first || !second || first.hash === second.hash || JSON.stringify(first.box) === JSON.stringify(second.box)
    || line.confidence !== Math.min(first.confidence, second.confidence) || line.confidence <= value.originalConfidence) throw new TypeError("OCR confidence evidence is contradictory");
  return { operation: "same-text-confidence", sourceHash: value.sourceHash, revision: value.revision,
    originalConfidence: value.originalConfidence, provider: value.provider, crops };
}
module.exports = { admitOcrConfidenceEvidence };
