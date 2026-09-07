// @ts-check
"use strict";

const DEFAULT_SLIDE = Object.freeze({ widthPt: 960, heightPt: 540 });

/** @typedef {{x: number, y: number, w: number, h: number}} PixelBox */
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value @returns {number} */
function scalarNumber(value) {
  return typeof value === "number" || (typeof value === "string" && value.length <= 64 && value.trim()) ? Number(value) : NaN;
}

/** @param {unknown} input @returns {boolean} */
function shouldProtectSmallForegroundGraphicCrop(input = {}) {
  if (!record(input) || input.detector !== "foreground-graphic-crop" || !record(input.box)) return false;
  const slideSize = input.slideSize === undefined ? DEFAULT_SLIDE : input.slideSize;
  const component = input.component === undefined ? {} : input.component;
  if (!record(slideSize) || !record(component)) return false;
  const w = scalarNumber(input.box.w); const h = scalarNumber(input.box.h);
  const width = scalarNumber(slideSize.widthPt); const height = scalarNumber(slideSize.heightPt);
  if (![w, h, width, height].every((value) => Number.isFinite(value) && value > 0) || !Number.isFinite(width * height) || !Number.isFinite(w * h)) return false;
  const areaRatio = w * h / Math.max(1, width * height);
  const aspect = w / Math.max(1, h);
  return areaRatio > 0 && areaRatio <= 0.16 && aspect >= 0.8 && aspect <= 4.5 && component.aggregate !== true;
}

/** @param {unknown} value @param {string} label @returns {PixelBox} */
function pixelBox(value, label) {
  if (!record(value)) throw new TypeError(`${label} must be a positive bounded pixel box`);
  const { x, y, w, h } = value;
  if (!finite(x) || !finite(y) || !finite(w) || !finite(h) || x < 0 || y < 0 || w <= 0 || h <= 0) throw new TypeError(`${label} must be a positive bounded pixel box`);
  return { x, y, w, h };
}

/** @param {unknown} input */
function buildMinimumUnitCropEvidence(input = {}) {
  if (!record(input)) throw new TypeError("minimum-unit crop source dimensions are invalid");
  const { sourceWidth, sourceHeight, originalPixelBox, refinement } = input;
  if (!finite(sourceWidth) || !finite(sourceHeight) || !Number.isSafeInteger(sourceWidth) || sourceWidth < 1 || sourceWidth > 16384
    || !Number.isSafeInteger(sourceHeight) || sourceHeight < 1 || sourceHeight > 16384) throw new RangeError("minimum-unit crop source dimensions are invalid");
  const original = pixelBox(originalPixelBox, "originalPixelBox");
  if (original.x + original.w > sourceWidth || original.y + original.h > sourceHeight) throw new RangeError("minimum-unit crop exceeds the source image");
  if (!record(refinement)) throw new TypeError("minimum-unit crop refinement is invalid");
  const local = pixelBox(refinement.box, "refinement.box");
  if (local.x + local.w > original.w || local.y + local.h > original.h) throw new RangeError("minimum-unit crop refinement exceeds the original crop");
  const removedNeighborPixels = scalarNumber(refinement.removedNeighborPixels ?? 0);
  const retainedDetailComponents = scalarNumber(refinement.retainedDetailComponents ?? 0);
  const pixelBudget = sourceWidth * sourceHeight;
  if (![removedNeighborPixels, retainedDetailComponents].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= pixelBudget)) throw new TypeError("minimum-unit crop cleanup evidence is invalid");
  return Object.freeze({
    cropEvidenceRequired: true,
    originalPixelBox: Object.freeze(original),
    coordinateReferenceSizePx: Object.freeze({ width: sourceWidth, height: sourceHeight }),
    mappedPixelBox: Object.freeze({ ...original }),
    tightenedPixelBox: Object.freeze({ x: original.x + local.x, y: original.y + local.y, w: local.w, h: local.h }),
    removedNeighborPixels,
    retainedDetailComponents
  });
}

module.exports = { buildMinimumUnitCropEvidence, shouldProtectSmallForegroundGraphicCrop };
