// @ts-check
"use strict";

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** @param {unknown} evidence @param {unknown} vote */
function fitDashedLineGeometry(evidence, vote) {
  if (!record(evidence) || !record(evidence.bounds) || !record(vote) || !Array.isArray(evidence.points)
    || evidence.points.length < 24 || evidence.points.length > 262144) return null;
  const { minX, minY, w, h } = evidence.bounds;
  const { slope, intercept } = vote;
  if (typeof minX !== "number" || typeof minY !== "number" || typeof w !== "number" || typeof h !== "number"
    || typeof slope !== "number" || typeof intercept !== "number" || ![minX, minY, w, h, slope, intercept].every(Number.isFinite)
    || minX < 0 || minY < 0 || w < 30 || h < 24 || minX + w > 2048 || minY + h > 2048
    || Math.abs(slope) < 0.35 || Math.abs(slope) > 2.21 || Math.abs(intercept) > 4) return null;
  /** @type {Array<{x: number, y: number}>} */
  const points = [];
  for (const point of evidence.points) {
    if (!record(point) || typeof point.x !== "number" || typeof point.y !== "number" || !Number.isFinite(point.x) || !Number.isFinite(point.y)
      || point.x < minX || point.x >= minX + w || point.y < minY || point.y >= minY + h) return null;
    const nx = (point.x - minX) / (w - 1), ny = (point.y - minY) / (h - 1);
    if (Math.abs(ny - slope * nx - intercept) <= 0.035) points.push({ x: point.x, y: point.y });
  }
  if (points.length < 24) return null;
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  let covariance = 0, variance = 0;
  for (const p of points) { covariance += (p.x - cx) * (p.y - cy); variance += (p.x - cx) ** 2; }
  if (variance < points.length * 4) return null;
  const fittedSlope = covariance / variance;
  if (Math.sign(fittedSlope) !== Math.sign(slope) || Math.abs(fittedSlope - slope * (h - 1) / (w - 1)) > 0.2) return null;
  const norm = Math.hypot(1, fittedSlope), ux = 1 / norm, uy = fittedSlope / norm;
  const projections = points.map(p => (p.x - cx) * ux + (p.y - cy) * uy);
  const residuals = points.map(p => (p.y - cy) * ux - (p.x - cx) * uy).sort((a, b) => a - b);
  const thickness = Math.max(1, Math.min(12, residuals[Math.floor(residuals.length * 0.9)] - residuals[Math.floor(residuals.length * 0.1)] + 1));
  let minimum = Infinity, maximum = -Infinity;
  for (const value of projections) { minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); }
  const start = minimum + thickness / 2, end = maximum - thickness / 2;
  if (end - start < Math.max(20, w * 0.35)) return null;
  return { x1: cx + ux * start, y1: cy + uy * start, x2: cx + ux * end, y2: cy + uy * end, thickness };
}

module.exports = { fitDashedLineGeometry };
