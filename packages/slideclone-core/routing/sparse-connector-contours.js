"use strict";
// @ts-check
/** @typedef {{x: number, y: number}} Point */
/** @typedef {{x: number, y: number, w: number, h: number}} Box */
/** @typedef {{r: number, g: number, b: number}} Rgb */

const { traceNativeMaskContours } = require("../scene-plan/native-mask-contours");

// Callers must establish connector semantics; this is not a text vectorizer.
/** @param {Point[]} points @param {Box} box */
function traceSparseConnectorContours(points, box) {
  if (!Array.isArray(points) || !box || ![box.x, box.y, box.w, box.h].every(Number.isSafeInteger)
    || box.x < 0 || box.y < 0 || box.w < 1 || box.h < 1 || box.w * box.h > 1_000_000
    || !Number.isSafeInteger(box.x + box.w) || !Number.isSafeInteger(box.y + box.h)
    || points.length > 1_000_000) throw new TypeError("Invalid sparse connector contour input");
  if (!points.length) return null;
  const unique = new Set();
  for (const point of points) {
    if (!point || !Number.isInteger(point.x) || !Number.isInteger(point.y)
      || point.x < box.x || point.x >= box.x + box.w || point.y < box.y || point.y >= box.y + box.h) {
      throw new TypeError("Invalid sparse connector contour point");
    }
    unique.add(`${point.x},${point.y}`);
  }
  const density = unique.size / (box.w * box.h);
  if (unique.size < 45 || density < 0.025 || density > 0.18) return null;
  for (const tolerancePx of [0.5, 0.75, 1]) {
    const segments = traceNativeMaskContours(points, box, { maxSegments: 120, tolerancePx });
    if (segments) return { segments, tolerancePx, pixelCount: unique.size };
  }
  return null;
}

/** @param {Rgb[]} colors */
function estimateSparseConnectorInkColor(colors) {
  if (!Array.isArray(colors) || colors.length > 1_000_000) throw new TypeError("Invalid sparse connector colors");
  for (const color of colors) {
    if (!color || ![color.r, color.g, color.b].every(value => Number.isFinite(value) && value >= 0 && value <= 255)) {
      throw new TypeError("Invalid sparse connector color");
    }
  }
  if (!colors.length) return null;
  /** @param {Rgb} color */
  const chroma = color => Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
  const sorted = colors.map(chroma).sort((a, b) => a - b);
  const threshold = /** @type {number} */ (sorted[Math.floor(sorted.length * 0.75)]);
  const core = colors.filter(color => chroma(color) >= threshold);
  return {
    r: core.reduce((sum, color) => sum + color.r, 0) / core.length,
    g: core.reduce((sum, color) => sum + color.g, 0) / core.length,
    b: core.reduce((sum, color) => sum + color.b, 0) / core.length
  };
}

module.exports = { traceSparseConnectorContours, estimateSparseConnectorInkColor };
