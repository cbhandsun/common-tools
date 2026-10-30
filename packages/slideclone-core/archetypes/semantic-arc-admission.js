// @ts-check
"use strict";

const { createArcResidualMasks } = require("./arc-residual-masks");

const MAX_IMAGE_PIXELS = 40000000;
const MAX_CANDIDATE_ARCS = 128;
const MAX_SAMPLES_PER_ARC = 3072;
const MAX_SAMPLES_PER_SEGMENT = 48;
const MAX_SAMPLE_GAP_PX = 3;
const MIN_SUPPORT_RATIO = 0.8;
const MAX_COLOR_DISTANCE = 76;
const MAX_NEIGHBORHOOD_RADIUS_PX = 6;

/** @typedef {{ x: number, y: number, w: number, h: number }} Box */
/** @typedef {{ width: number, height: number, rgba: Uint8Array }} RgbaImage */
/** @typedef {{ widthPt: number, heightPt: number }} SlideSize */
/** @typedef {{ kind: "line", x1: number, y1: number, x2: number, y2: number, width: number }} LineMask */
/** @typedef {{ candidates: number, accepted: number, rejected: number }} ArcAdmissionEvidence */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is RgbaImage} */
function isValidImage(value) {
  if (!isRecord(value) || typeof value.width !== "number" || typeof value.height !== "number"
    || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height)
    || value.width < 1 || value.height < 1 || value.width * value.height > MAX_IMAGE_PIXELS
    || !(value.rgba instanceof Uint8Array)) return false;
  return value.rgba.length === value.width * value.height * 4;
}

/** @param {unknown} value @returns {value is SlideSize} */
function isValidSlideSize(value) {
  return isRecord(value) && typeof value.widthPt === "number" && typeof value.heightPt === "number"
    && Number.isFinite(value.widthPt) && Number.isFinite(value.heightPt)
    && value.widthPt > 0 && value.heightPt > 0;
}

/** @param {unknown} value @returns {value is Box} */
function isValidBox(value) {
  return isRecord(value) && typeof value.x === "number" && typeof value.y === "number"
    && typeof value.w === "number" && typeof value.h === "number"
    && Number.isFinite(value.x) && Number.isFinite(value.y)
    && Number.isFinite(value.w) && Number.isFinite(value.h) && value.w > 0 && value.h > 0;
}

/** @param {unknown} value */
function isSemanticArc(value) {
  return isRecord(value) && value.type === "arc" && isRecord(value.source)
    && value.source.semanticNativeStructure === true;
}

/** @param {unknown} value @returns {[number, number, number] | null} */
function parseStrokeColor(value) {
  if (typeof value !== "string") return null;
  const match = /^#?([0-9a-f]{6})$/iu.exec(value.trim());
  if (!match) return null;
  const hex = match[1];
  if (hex === undefined) return null;
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
}

/** @param {Record<string, unknown>} style @param {{ x: number, y: number }} pixelScale */
function neighborhoodRadius(style, pixelScale) {
  const rawStrokeWidth = style.strokeWidthPt ?? style.strokeWidth ?? 1;
  if (typeof rawStrokeWidth !== "number" || !Number.isFinite(rawStrokeWidth) || rawStrokeWidth <= 0 || rawStrokeWidth > 72) return null;
  const strokePx = rawStrokeWidth * Math.max(pixelScale.x, pixelScale.y);
  return Math.min(MAX_NEIGHBORHOOD_RADIUS_PX, Math.max(1, Math.ceil(strokePx / 2) + 1));
}

/** @param {LineMask[]} masks */
function countPlannedSamples(masks) {
  let count = 0;
  for (const mask of masks) {
    const length = Math.hypot(mask.x2 - mask.x1, mask.y2 - mask.y1);
    const samples = Math.min(MAX_SAMPLES_PER_SEGMENT, Math.max(2, Math.ceil(length / MAX_SAMPLE_GAP_PX) + 1));
    count += samples;
    if (count > MAX_SAMPLES_PER_ARC) return null;
  }
  return count;
}

/** @param {RgbaImage} image @param {number} x @param {number} y @param {number} radius @param {[number, number, number]} color */
function hasMatchingPixel(image, x, y, radius, color) {
  const left = Math.max(0, x - radius); const right = Math.min(image.width - 1, x + radius);
  const top = Math.max(0, y - radius); const bottom = Math.min(image.height - 1, y + radius);
  const maximumDistanceSquared = MAX_COLOR_DISTANCE * MAX_COLOR_DISTANCE;
  let matching = false;
  let contrasting = false;
  for (let pixelY = top; pixelY <= bottom; pixelY += 1) {
    for (let pixelX = left; pixelX <= right; pixelX += 1) {
      const offset = (pixelY * image.width + pixelX) * 4;
      const alpha = image.rgba[offset + 3];
      const r = image.rgba[offset]; const g = image.rgba[offset + 1]; const b = image.rgba[offset + 2];
      if (alpha === undefined || alpha < 128 || r === undefined || g === undefined || b === undefined) continue;
      const red = color[0] - r; const green = color[1] - g; const blue = color[2] - b;
      if (red * red + green * green + blue * blue <= maximumDistanceSquared) matching = true;
      else contrasting = true;
      if (matching && contrasting) return true;
    }
  }
  return false;
}

/** @param {LineMask[]} masks @param {RgbaImage} image @param {number} radius @param {[number, number, number]} color */
function hasContinuousSourceSupport(masks, image, radius, color) {
  const planned = countPlannedSamples(masks);
  if (planned === null || planned === 0) return false;
  let supported = 0;
  let longestRun = 0;
  let run = 0;
  for (const mask of masks) {
    const length = Math.hypot(mask.x2 - mask.x1, mask.y2 - mask.y1);
    const sampleCount = Math.min(MAX_SAMPLES_PER_SEGMENT, Math.max(2, Math.ceil(length / MAX_SAMPLE_GAP_PX) + 1));
    for (let index = 0; index < sampleCount; index += 1) {
      const fraction = sampleCount === 1 ? 0 : index / (sampleCount - 1);
      const x = Math.round(mask.x1 + (mask.x2 - mask.x1) * fraction);
      const y = Math.round(mask.y1 + (mask.y2 - mask.y1) * fraction);
      if (hasMatchingPixel(image, x, y, radius, color)) {
        supported += 1;
        run += 1;
        longestRun = Math.max(longestRun, run);
      } else {
        run = 0;
      }
    }
  }
  return supported / planned >= MIN_SUPPORT_RATIO && longestRun / planned >= MIN_SUPPORT_RATIO;
}

/** @param {Record<string, unknown>} shape @param {SlideSize} slideSize @param {RgbaImage} image */
function sourceSupportsArc(shape, slideSize, image) {
  if (!isValidBox(shape.box) || !isRecord(shape.style)) return false;
  if (shape.box.x < 0 || shape.box.y < 0 || shape.box.x + shape.box.w > slideSize.widthPt || shape.box.y + shape.box.h > slideSize.heightPt) return false;
  const color = parseStrokeColor(shape.style.stroke);
  const adjustments = shape.style.adjustments ?? [];
  if (!color || !Array.isArray(adjustments) || adjustments.length > 2) return false;
  if (adjustments.some((value) => typeof value !== "number" || !Number.isFinite(value))) return false;
  const pixelScale = { x: image.width / slideSize.widthPt, y: image.height / slideSize.heightPt };
  const radius = neighborhoodRadius(shape.style, pixelScale);
  if (radius === null) return false;
  if (![pixelScale.x, pixelScale.y].every(Number.isFinite)) return false;
  const rotation = shape.style.rotationDeg ?? shape.style.rotation ?? shape.style.rotate ?? 0;
  if (typeof rotation !== "number" || !Number.isFinite(rotation)) return false;
  if ([shape.style.flipH, shape.style.flipV].some(value => value !== undefined && typeof value !== "boolean")) return false;
  const masks = createArcResidualMasks(shape.box, adjustments, image, 1, shape.style, pixelScale);
  return hasContinuousSourceSupport(masks, image, radius, color);
}

/**
 * Retains semantic-native arcs only when their full trajectory has color-matched
 * evidence in the source pixels. It never mutates the page or image supplied by
 * the caller.
 *
 * @param {unknown} request
 * @returns {{ shapes: unknown[], evidence: ArcAdmissionEvidence }}
 */
function admitSemanticArcs(request) {
  if (!isRecord(request) || !isRecord(request.page) || !Array.isArray(request.page.shapes)) throw new TypeError("semantic arc page is invalid");
  if (!isValidSlideSize(request.slideSize)) throw new TypeError("semantic arc slide size is invalid");
  const candidates = request.page.shapes.filter(isSemanticArc);
  if (candidates.length > MAX_CANDIDATE_ARCS) throw new RangeError("semantic arc candidate count exceeds the safety limit");
  if (candidates.length === 0) return { shapes: [...request.page.shapes], evidence: { candidates: 0, accepted: 0, rejected: 0 } };
  if (!isValidImage(request.image)) throw new TypeError("semantic arc image is invalid");
  const image = request.image;
  const slideSize = request.slideSize;
  /** @type {unknown[]} */
  const shapes = [];
  let accepted = 0;
  let rejected = 0;
  for (const shape of request.page.shapes) {
    if (!isSemanticArc(shape)) {
      shapes.push(shape);
      continue;
    }
    if (sourceSupportsArc(shape, slideSize, image)) {
      shapes.push(shape);
      accepted += 1;
    } else {
      rejected += 1;
    }
  }
  return { shapes, evidence: { candidates: candidates.length, accepted, rejected } };
}

module.exports = { admitSemanticArcs };
