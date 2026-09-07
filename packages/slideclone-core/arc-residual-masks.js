// @ts-check
"use strict";

const MAX_ARC_SEGMENTS = 96;
const ARC_SEGMENT_DEGREES = 4;
const MAX_DRAWING_ANGLE = 21599999 / 60000;

/** @typedef {{ x: number, y: number, w: number, h: number }} Box */
/** @typedef {{ width: number, height: number }} ImageSize */
/** @typedef {{ kind: "line", x1: number, y1: number, x2: number, y2: number, width: number }} LineMask */
/** @typedef {{ rotation?: number, flipH?: boolean, flipV?: boolean }} ArcTransform */

/** @param {unknown} value @param {number} fallback */
function boundedAngle(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("arc adjustment is invalid");
  return Math.max(0, Math.min(MAX_DRAWING_ANGLE, value));
}

/** @param {number} value */
function normalizedAngle(value) {
  return ((value % 360) + 360) % 360;
}

/** @param {number} start @param {number} end */
function clockwiseSpan(start, end) {
  const span = end - start;
  return span <= 0 ? span + 360 : span;
}

/** @param {unknown} value @returns {ArcTransform} */
function parseArcTransform(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError("arc transform is invalid");
  const style = /** @type {Record<string, unknown>} */ (value);
  const rotation = style.rotationDeg ?? style.rotation ?? style.rotate ?? 0;
  if (typeof rotation !== "number" || !Number.isFinite(rotation)) throw new TypeError("arc transform is invalid");
  for (const flip of [style.flipH, style.flipV]) if (flip !== undefined && typeof flip !== "boolean") throw new TypeError("arc transform is invalid");
  return { rotation: normalizedAngle(rotation), flipH: style.flipH === true, flipV: style.flipV === true };
}

/** @param {number} centerX @param {number} centerY @param {number} radiusX @param {number} radiusY @param {number} angle @param {ArcTransform} transform */
function transformedEllipsePoint(centerX, centerY, radiusX, radiusY, angle, transform) {
  // DrawingML uses the ray's angle, not the ellipse's parametric angle.
  const cosine = Math.cos(angle); const sine = Math.sin(angle);
  const denominator = Math.hypot(radiusY * cosine, radiusX * sine);
  let x = radiusX * (radiusY * cosine / denominator);
  let y = radiusY * (radiusX * sine / denominator);
  if (transform.flipH) x = -x;
  if (transform.flipV) y = -y;
  const radians = (transform.rotation || 0) * Math.PI / 180;
  return { x: centerX + x * Math.cos(radians) - y * Math.sin(radians), y: centerY + x * Math.sin(radians) + y * Math.cos(radians) };
}

/**
 * Converts the DrawingML arc adjustments into a bounded series of existing
 * line-corridor masks. DrawingML angles advance clockwise in screen space;
 * the x/y radii remain independent so non-circular arcs stay elliptical.
 *
 * @param {Box} box Arc bounds in the original coordinate space.
 * @param {unknown} adjustments
 * @param {ImageSize} image
 * @param {number} width
 * @param {unknown} [style]
 * @param {{ x: number, y: number }} [pixelScale] Applied after rotation/flip.
 * @returns {LineMask[]}
 */
function createArcResidualMasks(box, adjustments, image, width, style, pixelScale = { x: 1, y: 1 }) {
  if (!Array.isArray(adjustments) || adjustments.length > 2) throw new TypeError("arc adjustments are invalid");
  if (![box.x, box.y, box.w, box.h, pixelScale.x, pixelScale.y].every(Number.isFinite)
    || box.w <= 0 || box.h <= 0 || pixelScale.x <= 0 || pixelScale.y <= 0
    || !Number.isFinite(width) || width <= 0 || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
    || image.width <= 0 || image.height <= 0) {
    throw new TypeError("arc mask input is invalid");
  }
  // These are the preset arc guides: adj1 defaults to 270 degrees and adj2
  // to 0, and each guide is pinned to [0, 21599999] before the sweep is made.
  const start = boundedAngle(adjustments[0], 270);
  const end = boundedAngle(adjustments[1], 0);
  const span = clockwiseSpan(start, end);
  const segments = Math.min(MAX_ARC_SEGMENTS, Math.max(1, Math.ceil(span / ARC_SEGMENT_DEGREES)));
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;
  const radiusX = box.w / 2;
  const radiusY = box.h / 2;
  const transform = parseArcTransform(style);
  /** @type {LineMask[]} */
  const masks = [];
  for (let index = 0; index < segments; index += 1) {
    const first = (start + span * index / segments) * Math.PI / 180;
    const second = (start + span * (index + 1) / segments) * Math.PI / 180;
    const startPoint = transformedEllipsePoint(centerX, centerY, radiusX, radiusY, first, transform);
    const endPoint = transformedEllipsePoint(centerX, centerY, radiusX, radiusY, second, transform);
    masks.push({
      kind: "line",
      x1: startPoint.x * pixelScale.x,
      y1: startPoint.y * pixelScale.y,
      x2: endPoint.x * pixelScale.x,
      y2: endPoint.y * pixelScale.y,
      width,
    });
  }
  return masks;
}

module.exports = { MAX_ARC_SEGMENTS, createArcResidualMasks };
