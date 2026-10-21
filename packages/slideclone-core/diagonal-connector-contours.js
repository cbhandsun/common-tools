// @ts-check
"use strict";

const { traceNativeMaskContours } = require("./native-mask-contours");
const { estimateSparseConnectorInkColor } = require("./sparse-connector-contours");

/** @typedef {{x: number, y: number}} Point */
/** @param {{image?: {width: number, height: number, rgba: Buffer}, box?: {x: number, y: number, w: number, h: number}, slideSize?: {widthPt: number, heightPt: number}}} [input] */
function traceDiagonalConnectorFromRaster({ image, box, slideSize } = {}) {
  if (!image || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
    || image.width < 1 || image.height < 1 || image.width > 16384 || image.height > 16384 || image.width * image.height > 40_000_000
    || !Buffer.isBuffer(image.rgba) || image.rgba.length !== image.width * image.height * 4
    || !box || ![box.x, box.y, box.w, box.h].every(Number.isFinite)
    || box.x < 0 || box.y < 0 || box.w <= 0 || box.h <= 0
    || !slideSize || ![slideSize.widthPt, slideSize.heightPt].every(Number.isFinite)
    || slideSize.widthPt <= 0 || slideSize.heightPt <= 0
    || box.x + box.w > slideSize.widthPt || box.y + box.h > slideSize.heightPt) return null;
  const scaleX = image.width / slideSize.widthPt, scaleY = image.height / slideSize.heightPt;
  const left = Math.floor(box.x * scaleX), top = Math.floor(box.y * scaleY);
  const right = Math.min(image.width, Math.ceil((box.x + box.w) * scaleX));
  const bottom = Math.min(image.height, Math.ceil((box.y + box.h) * scaleY));
  const width = right - left, height = bottom - top;
  if (width < 24 || height < 24 || width * height > 262144) return null;
  const points = [], colors = [];
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const offset = (y * image.width + x) * 4;
    const r = image.rgba[offset], g = image.rgba[offset + 1], b = image.rgba[offset + 2];
    const alpha = image.rgba[offset + 3];
    if (r === undefined || g === undefined || b === undefined || alpha === undefined) return null;
    if (alpha < 64 || (r + g + b) / 3 >= 242 || Math.max(r, g, b) - Math.min(r, g, b) < 28) continue;
    points.push({ x: x - left, y: y - top }); colors.push({ r, g, b });
  }
  const density = points.length / (width * height);
  if (points.length < 45 || density < 0.025 || density > 0.4) return null;
  const geometry = straightDiagonalEvidence(points);
  if (!geometry) return null;
  // Geometry proves a narrow stem; retain the actual head instead of its hull.
  let segments = null;
  let tolerancePx = 0;
  for (const tolerance of [0.5, 0.75, 1]) {
    segments = traceNativeMaskContours(points, { x: 0, y: 0, w: width, h: height }, { maxSegments: 120, tolerancePx: tolerance });
    if (segments) { tolerancePx = tolerance; break; }
  }
  if (!segments) return null;
  const color = estimateSparseConnectorInkColor(colors);
  if (!color) return null;
  return {
    box: { x: left / scaleX, y: top / scaleY, w: width / scaleX, h: height / scaleY },
    color: `#${[color.r, color.g, color.b].map(value => Math.round(value).toString(16).padStart(2, "0")).join("")}`,
    segments, evidence: { ...geometry, tolerancePx, pixelCount: points.length, density }
  };
}

/** @param {Point[]} points */
function straightDiagonalEvidence(points) {
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let xx = 0, yy = 0, xy = 0;
  for (const point of points) {
    const x = point.x - meanX, y = point.y - meanY;
    xx += x * x; yy += y * y; xy += x * y;
  }
  const gap = Math.hypot(xx - yy, 2 * xy);
  const major = xx + yy + gap, minor = xx + yy - gap;
  if (!(major > 0) || minor < -1e-6 || (minor > 0 && major / minor < 10)) return null;
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  if (Math.abs(dx) < 0.25 || Math.abs(dy) < 0.25) return null;
  const projected = points.map(point => ({
    t: (point.x - meanX) * dx + (point.y - meanY) * dy,
    n: -(point.x - meanX) * dy + (point.y - meanY) * dx
  }));
  let minT = Infinity, maxT = -Infinity;
  for (const point of projected) { minT = Math.min(minT, point.t); maxT = Math.max(maxT, point.t); }
  const length = maxT - minT;
  if (length < 30) return null;
  const bins = Array.from({ length: 16 }, () => ({ count: 0, min: Infinity, max: -Infinity, sum: 0 }));
  for (const point of projected) {
    const bin = bins[Math.min(15, Math.floor((point.t - minT) / length * 16))];
    if (!bin) return null;
    bin.count++; bin.sum += point.n; bin.min = Math.min(bin.min, point.n); bin.max = Math.max(bin.max, point.n);
  }
  const occupied = bins.filter(bin => bin.count >= 2);
  const thin = occupied.filter(bin => bin.max - bin.min <= Math.max(3, length * 0.1));
  if (occupied.length < 14 || thin.length < 6 || occupied.some(bin => bin.max - bin.min > length * 0.45)) return null;
  const centers = occupied.map(bin => bin.sum / bin.count);
  if (Math.max(...centers) - Math.min(...centers) > length * 0.08) return null;
  return { provider: "diagonal-connector-geometry-v1", axisX: dx, axisY: dy, lengthPx: length,
    occupiedBins: occupied.length, thinBins: thin.length };
}

module.exports = { traceDiagonalConnectorFromRaster };
