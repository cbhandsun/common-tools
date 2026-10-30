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
  if (!(areaRatio > 0 && areaRatio <= 0.16 && aspect >= 0.8 && aspect <= 4.5 && component.aggregate !== true)) return false;
  if (input.textBoxes === undefined) return true;
  if (!Array.isArray(input.textBoxes) || input.textBoxes.length > 10000) return false;
  const x = scalarNumber(input.box.x); const y = scalarNumber(input.box.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(x + w) || !Number.isFinite(y + h)) return false;
  for (const item of input.textBoxes) {
    if (!record(item) || typeof item.text !== "string") return false;
    if (!item.text.trim()) continue;
    if (!record(item.box)) return false;
    const tx = scalarNumber(item.box.x); const ty = scalarNumber(item.box.y);
    const tw = scalarNumber(item.box.w); const th = scalarNumber(item.box.h);
    if (![tx, ty, tw, th, tx + tw, ty + th].every(Number.isFinite) || tw <= 0 || th <= 0) return false;
    if (Math.min(x + w, tx + tw) > Math.max(x, tx) && Math.min(y + h, ty + th) > Math.max(y, ty)) return false;
  }
  return true;
}

/**
 * A small bounding box is only a candidate. Protection requires proof that the
 * crop was actually isolated and tightened around non-solid source ink.
 * @param {unknown} input
 * @returns {Readonly<Record<string, unknown>> | null}
 */
function admitTightGraphicCrop(input = {}) {
  if (!record(input) || !shouldProtectSmallForegroundGraphicCrop(input)) return null;
  const sourceWidth = input.sourceWidth; const sourceHeight = input.sourceHeight;
  if (!finite(sourceWidth) || !finite(sourceHeight)
    || !Number.isSafeInteger(sourceWidth) || !Number.isSafeInteger(sourceHeight)
    || sourceWidth < 1 || sourceWidth > 16384 || sourceHeight < 1 || sourceHeight > 16384
    || sourceWidth * sourceHeight > 40000000 || !record(input.refinement)
    || input.refinement.refined !== true || !record(input.refinement.image)) return null;
  const slideSize = input.slideSize === undefined ? DEFAULT_SLIDE : input.slideSize;
  if (!record(input.box) || !record(slideSize)) return null;
  const width = scalarNumber(slideSize.widthPt); const height = scalarNumber(slideSize.heightPt);
  const boxWidth = scalarNumber(input.box.w); const boxHeight = scalarNumber(input.box.h);
  if (![width, height, boxWidth, boxHeight].every((value) => Number.isFinite(value) && value > 0)) return null;
  const areaRatio = boxWidth * boxHeight / Math.max(1, width * height);
  const aspect = boxWidth / Math.max(1, boxHeight);
  if (areaRatio > 0.035 || boxWidth / width > 0.18 || boxHeight / height > 0.22
    || aspect < 0.5 || aspect > 3.25) return null;
  let original;
  let tightened;
  try {
    original = pixelBox(input.originalPixelBox, "originalPixelBox");
    tightened = pixelBox(input.refinement.box, "refinement.box");
  } catch {
    return null;
  }
  if (original.x + original.w > sourceWidth || original.y + original.h > sourceHeight
    || tightened.x + tightened.w > original.w || tightened.y + tightened.h > original.h) return null;
  const image = input.refinement.image;
  const imageWidth = image.width; const imageHeight = image.height; const rgba = image.rgba;
  if (!finite(imageWidth) || !finite(imageHeight)
    || !Number.isSafeInteger(imageWidth) || !Number.isSafeInteger(imageHeight)
    || imageWidth !== tightened.w || imageHeight !== tightened.h || !(rgba instanceof Uint8Array)
    || rgba.length !== imageWidth * imageHeight * 4) return null;
  const removedNeighborPixels = scalarNumber(input.refinement.removedNeighborPixels ?? 0);
  const retainedDetailComponents = scalarNumber(input.refinement.retainedDetailComponents ?? 0);
  if (![removedNeighborPixels, retainedDetailComponents].every((value) => Number.isSafeInteger(value) && value >= 0)
    || retainedDetailComponents > 64 || removedNeighborPixels > original.w * original.h) return null;
  let opaquePixels = 0; let opaqueEdgePixels = 0;
  for (let y = 0; y < imageHeight; y += 1) for (let x = 0; x < imageWidth; x += 1) {
    const alpha = rgba[(y * imageWidth + x) * 4 + 3];
    if (alpha === undefined || alpha < 32) continue;
    opaquePixels += 1;
    if (x === 0 || y === 0 || x === imageWidth - 1 || y === imageHeight - 1) opaqueEdgePixels += 1;
  }
  const area = imageWidth * imageHeight;
  const perimeter = Math.max(1, imageWidth * 2 + imageHeight * 2 - 4);
  const opaqueDensity = opaquePixels / Math.max(1, area);
  const edgeOccupancy = opaqueEdgePixels / perimeter;
  const sourceAreaRatio = original.w * original.h / Math.max(1, sourceWidth * sourceHeight);
  const retainedAreaRatio = tightened.w * tightened.h / Math.max(1, original.w * original.h);
  if (opaqueDensity < 0.025 || opaqueDensity > 0.78 || edgeOccupancy > 0.58) return null;
  return Object.freeze({
    tightCropAdmission: Object.freeze({
      operation: "source-isolated-tight-graphic",
      sourceAreaRatio,
      retainedAreaRatio,
      opaqueDensity,
      edgeOccupancy,
      removedNeighborPixels,
      retainedDetailComponents
    })
  });
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

module.exports = { admitTightGraphicCrop, buildMinimumUnitCropEvidence, shouldProtectSmallForegroundGraphicCrop };
