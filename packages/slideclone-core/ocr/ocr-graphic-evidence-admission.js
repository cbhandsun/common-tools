// @ts-check
"use strict";

const { types } = require("node:util");

const REASONS = new Set([
  "connected-source-overflow",
  "chromatic-source-ink",
  "isolated-multipart-source-ink"
]);

/** @typedef {{x:number,y:number,w:number,h:number}} PixelBox */
/** @typedef {{operation:"source-geometry-graphic",version:1,kind:"pictorial-icon",candidatePixelBox:PixelBox,tightenedPixelBox:PixelBox,scannedPixels:number,reasons:readonly string[],metrics:{density:number,outsideRatio:number,chromaticRatio:number,significantComponents:number,largestComponentRatio:number}}} OcrGraphicEvidence */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && [null, Object.prototype].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every((property) => "value" in property);
}

/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }

/** @param {unknown} value @param {string} label @returns {PixelBox} */
function pixelBox(value, label) {
  if (!record(value)) throw new TypeError(`${label} is invalid`);
  const { x, y, w, h } = value;
  if (!finite(x) || !finite(y) || !finite(w) || !finite(h)
    || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !Number.isSafeInteger(w) || !Number.isSafeInteger(h)
    || x < 0 || y < 0 || w < 1 || h < 1) throw new TypeError(`${label} is invalid`);
  return { x, y, w, h };
}

/** @param {PixelBox} left @param {PixelBox} right */
function sameBox(left, right) {
  return left.x === right.x && left.y === right.y && left.w === right.w && left.h === right.h;
}

/** @param {PixelBox} inner @param {PixelBox} outer */
function contained(inner, outer) {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/**
 * Admit only source-bound, geometry-only evidence. It intentionally carries no
 * OCR text or arbitrary provider metadata into the output deck.
 * @param {unknown} value
 * @param {{sourceWidth:number,sourceHeight:number,candidatePixelBox:PixelBox}} expected
 * @returns {OcrGraphicEvidence | null}
 */
function admitOcrGraphicEvidence(value, expected) {
  if (value === undefined || value === null) return null;
  if (!record(expected) || !Number.isSafeInteger(expected.sourceWidth) || !Number.isSafeInteger(expected.sourceHeight)
    || expected.sourceWidth < 1 || expected.sourceWidth > 16384 || expected.sourceHeight < 1 || expected.sourceHeight > 16384
    || expected.sourceWidth * expected.sourceHeight > 40000000) throw new TypeError("OCR graphic evidence source is invalid");
  const expectedCandidate = pixelBox(expected.candidatePixelBox, "OCR graphic evidence expected candidate box");
  if (!record(value) || value.operation !== "source-geometry-graphic" || value.version !== 1 || value.kind !== "pictorial-icon") {
    throw new TypeError("OCR graphic evidence is invalid");
  }
  const candidatePixelBox = pixelBox(value.candidatePixelBox, "OCR graphic evidence candidate box");
  const tightenedPixelBox = pixelBox(value.tightenedPixelBox, "OCR graphic evidence tightened box");
  if (!sameBox(candidatePixelBox, expectedCandidate) || !contained(tightenedPixelBox, candidatePixelBox)
    || !contained(candidatePixelBox, { x: 0, y: 0, w: expected.sourceWidth, h: expected.sourceHeight })) {
    throw new TypeError("OCR graphic evidence geometry is stale");
  }
  const scannedPixels = value.scannedPixels;
  if (!finite(scannedPixels) || !Number.isSafeInteger(scannedPixels) || scannedPixels < candidatePixelBox.w * candidatePixelBox.h
    || scannedPixels > 262144 || !Array.isArray(value.reasons) || types.isProxy(value.reasons)
    || value.reasons.length < 1 || value.reasons.length > REASONS.size) throw new TypeError("OCR graphic evidence is invalid");
  const reasons = value.reasons.map((reason) => {
    if (typeof reason !== "string" || !REASONS.has(reason)) throw new TypeError("OCR graphic evidence reason is invalid");
    return reason;
  });
  if (new Set(reasons).size !== reasons.length || !record(value.metrics)) throw new TypeError("OCR graphic evidence is invalid");
  const { density, outsideRatio, chromaticRatio, significantComponents, largestComponentRatio } = value.metrics;
  if (!finite(density) || density < 0 || density > 1
    || !finite(outsideRatio) || outsideRatio < 0 || outsideRatio > 1
    || !finite(chromaticRatio) || chromaticRatio < 0 || chromaticRatio > 1
    || !finite(significantComponents) || !Number.isSafeInteger(significantComponents) || significantComponents < 0 || significantComponents > 64
    || !finite(largestComponentRatio) || largestComponentRatio < 0 || largestComponentRatio > 1) {
    throw new TypeError("OCR graphic evidence metrics are invalid");
  }
  const metrics = { density, outsideRatio, chromaticRatio, significantComponents, largestComponentRatio };
  return Object.freeze({
    operation: "source-geometry-graphic", version: 1, kind: "pictorial-icon",
    candidatePixelBox: Object.freeze(candidatePixelBox), tightenedPixelBox: Object.freeze(tightenedPixelBox),
    scannedPixels, reasons: Object.freeze(reasons), metrics: Object.freeze(metrics)
  });
}

module.exports = { admitOcrGraphicEvidence };
