"use strict";
// @ts-check
const { traceNativeMaskContours } = require("./native-mask-contours");
const { estimateSparseConnectorInkColor } = require("../routing/sparse-connector-contours");
/** @typedef {{x: number, y: number, w: number, h: number}} Box */
/** @typedef {{x: number, y: number}} Point */
/** @typedef {{width: number, height: number, rgba: Uint8Array}} Raster */
/** @typedef {[number, number, number]} Rgb */
/** @param {unknown} v @returns {v is Record<string, unknown>} */
function record(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
/** @param {unknown} v @returns {v is Box} */
function box(v) {
  return record(v) && [v.x, v.y, v.w, v.h].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100000)
    && typeof v.w === "number" && v.w > 0 && typeof v.h === "number" && v.h > 0;
}
/** @param {unknown} v @returns {v is string} */
function id(v) { return typeof v === "string" && /^[A-Za-z0-9_.:-]{1,256}$/.test(v); }
/** @param {unknown} v @returns {Rgb|null} */
function color(v) {
  if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v)) return null;
  return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
}
/** @param {Raster} image @param {number} offset @returns {Rgb} */
function rgbAt(image, offset) { return [image.rgba[offset] ?? 0, image.rgba[offset + 1] ?? 0, image.rgba[offset + 2] ?? 0]; }
/** @param {Rgb} actual @param {Rgb} expected */
function matchingColor(actual, expected) {
  const lo = Math.min(...actual), chroma = Math.max(...actual) - lo;
  const expectedLo = Math.min(...expected), expectedChroma = Math.max(...expected) - expectedLo;
  if (expectedChroma < 28) return Math.hypot(...actual.map((v, i) => v - (expected[i] ?? 0))) <= 50;
  if (chroma < Math.max(28, expectedChroma * 0.3) || lo > 220) return false;
  return Math.hypot(...actual.map((v, i) => (v - lo) / chroma - ((expected[i] ?? 0) - expectedLo) / expectedChroma)) <= 0.25;
}
/** @param {Point[]} points */
function bendingEvidence(points) {
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  let xx = 0, yy = 0, xy = 0;
  for (const p of points) { const x = p.x - meanX, y = p.y - meanY; xx += x * x; yy += y * y; xy += x * y; }
  const angle = Math.atan2(2 * xy, xx - yy) / 2, dx = Math.cos(angle), dy = Math.sin(angle);
  let min = Infinity, max = -Infinity;
  const projected = points.map(p => {
    const t = (p.x - meanX) * dx + (p.y - meanY) * dy;
    min = Math.min(min, t); max = Math.max(max, t);
    return { t, n: -(p.x - meanX) * dy + (p.y - meanY) * dx };
  });
  const span = max - min;
  if (span < 30) return null;
  const bins = Array.from({ length: 12 }, () => ({ count: 0, sum: 0, min: Infinity, max: -Infinity }));
  for (const p of projected) {
    const bin = bins[Math.min(11, Math.floor((p.t - min) / span * 12))];
    if (!bin) return null;
    bin.count += 1; bin.sum += p.n; bin.min = Math.min(bin.min, p.n); bin.max = Math.max(bin.max, p.n);
  }
  const occupied = bins.filter(bin => bin.count >= 2), thin = occupied.filter(bin => bin.max - bin.min <= span * 0.15);
  const centers = bins.map((bin, index) => ({ t: index, n: bin.count ? bin.sum / bin.count : 0 })).slice(1, -1);
  const mean = centers.reduce((sum, p) => sum + p.n, 0) / centers.length;
  const middle = centers.reduce((sum, p) => sum + p.t, 0) / centers.length;
  const slope = centers.reduce((sum, p) => sum + (p.t - middle) * (p.n - mean), 0)
    / centers.reduce((sum, p) => sum + (p.t - middle) ** 2, 0);
  const bend = Math.max(...centers.map(p => Math.abs(p.n - mean - slope * (p.t - middle))));
  return { spanPx: span, bendPx: bend, occupiedBins: occupied.length, thinBins: thin.length };
}
/** @param {Point} p @param {Box} b */
function distanceToBox(p, b) { return Math.hypot(Math.max(b.x - p.x, 0, p.x - b.x - b.w), Math.max(b.y - p.y, 0, p.y - b.y - b.h)); }

/** @param {Record<string, unknown>} shape @param {Raster} image @param {{widthPt: number, heightPt: number}} slide
 * @param {{id: string, box: Box}[]} nodes @param {{used: number, diagnostics: Record<string, number>}} budget */
function traceCurve(shape, image, slide, nodes, budget) {
  if (!box(shape.box) || !record(shape.style)) return null;
  const stroke = color(shape.style.stroke);
  if (!stroke || shape.box.x + shape.box.w > slide.widthPt || shape.box.y + shape.box.h > slide.heightPt) return null;
  const sx = image.width / slide.widthPt, sy = image.height / slide.heightPt;
  const padding = Math.min(24, Math.min(shape.box.w, shape.box.h) * 0.25);
  const left = Math.max(0, Math.floor((shape.box.x - padding) * sx));
  const top = Math.max(0, Math.floor((shape.box.y - padding) * sy));
  const right = Math.min(image.width, Math.ceil((shape.box.x + shape.box.w + padding) * sx));
  const bottom = Math.min(image.height, Math.ceil((shape.box.y + shape.box.h + padding) * sy));
  const width = right - left, height = bottom - top, area = width * height;
  if (width < 24 || height < 24 || area > 524288 || budget.used + area > 4000000) return null;
  budget.used += area;
  const mask = new Uint8Array(area);
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const offset = (y * image.width + x) * 4;
    if ((image.rgba[offset + 3] ?? 0) >= 128 && matchingColor(rgbAt(image, offset), stroke)) mask[(y - top) * width + x - left] = 1;
  }
  const pixelNodes = nodes.map(node => ({ id: node.id, box: { x: node.box.x * sx, y: node.box.y * sy, w: node.box.w * sx, h: node.box.h * sy } }));
  // Node interiors and their outlines are owned by the native node, not by a relation.
  for (const node of pixelNodes) {
    const margin = Math.max(3, Math.min(sx, sy) * 2);
    const x1 = Math.max(left, Math.floor(node.box.x - margin)), x2 = Math.min(right, Math.ceil(node.box.x + node.box.w + margin));
    const y1 = Math.max(top, Math.floor(node.box.y - margin)), y2 = Math.min(bottom, Math.ceil(node.box.y + node.box.h + margin));
    if (x2 <= x1 || y2 <= y1) continue;
    for (let y = y1; y < y2; y += 1) mask.fill(0, (y - top) * width + x1 - left, (y - top) * width + x2 - left);
  }
  /** @type {{points: Point[], bounds: Box, contacts: string[], geometry: NonNullable<ReturnType<typeof bendingEvidence>>}[]} */
  const candidates = [];
  for (let seed = 0; seed < area; seed += 1) {
    if (!mask[seed]) continue;
    mask[seed] = 0;
    const pending = [seed];
    /** @type {Point[]} */ const points = [];
    let x1 = right, y1 = bottom, x2 = left, y2 = top, clipped = false;
    while (pending.length) {
      const cell = pending.pop();
      if (cell === undefined) break;
      const x = cell % width, y = Math.floor(cell / width), px = x + left, py = y + top;
      points.push({ x: px, y: py });
      x1 = Math.min(x1, px); y1 = Math.min(y1, py); x2 = Math.max(x2, px); y2 = Math.max(y2, py);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) clipped = true;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next]) { mask[next] = 0; pending.push(next); }
      }
    }
    const bounds = { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
    const density = points.length / (bounds.w * bounds.h);
    if (clipped || points.length < 45 || bounds.w < 24 || bounds.h < 24 || density < 0.008 || density > 0.25) continue;
    budget.diagnostics.sparseComponents = (budget.diagnostics.sparseComponents || 0) + 1;
    const geometry = bendingEvidence(points);
    if (!geometry) continue;
    budget.diagnostics.maxThinBins = Math.max(budget.diagnostics.maxThinBins || 0, geometry.thinBins);
    budget.diagnostics.maxBendPx = Math.max(budget.diagnostics.maxBendPx || 0, geometry.bendPx);
    if (geometry.occupiedBins < 10 || geometry.thinBins < 8 || geometry.bendPx < Math.max(2.5, geometry.spanPx * 0.025)) continue;
    budget.diagnostics.bendingComponents = (budget.diagnostics.bendingComponents || 0) + 1;
    const contactRadius = Math.max(8, Math.min(sx, sy) * 7);
    const contacts = pixelNodes.filter(node => points.some(point => distanceToBox(point, node.box) <= contactRadius)).map(node => node.id);
    const contactKey = `contactCount${contacts.length}`;
    budget.diagnostics[contactKey] = (budget.diagnostics[contactKey] || 0) + 1;
    if (contacts.length !== 2) continue;
    candidates.push({ points, bounds, contacts, geometry });
  }
  candidates.sort((a, b) => b.points.length - a.points.length);
  const chosen = candidates[0];
  if (!chosen || (candidates[1] && candidates[1].points.length >= chosen.points.length * 0.5)) return null;
  let segments = null, tolerancePx = 0;
  for (const tolerance of [0.5, 0.75, 1, 1.5]) {
    segments = traceNativeMaskContours(chosen.points, chosen.bounds, { maxSegments: 120, tolerancePx: tolerance });
    if (segments) { tolerancePx = tolerance; break; }
  }
  if (!segments) { budget.diagnostics.contourRejected = (budget.diagnostics.contourRejected || 0) + 1; return null; }
  const ink = estimateSparseConnectorInkColor(chosen.points.map(p => {
    const offset = (p.y * image.width + p.x) * 4;
    const [r, g, b] = rgbAt(image, offset);
    return { r, g, b };
  }));
  if (!ink) return null;
  return { bounds: chosen.bounds, box: { x: chosen.bounds.x / sx, y: chosen.bounds.y / sy, w: chosen.bounds.w / sx, h: chosen.bounds.h / sy },
    color: `#${[ink.r, ink.g, ink.b].map(n => Math.round(n).toString(16).padStart(2, "0")).join("")}`, segments,
    evidence: { provider: "source-semantic-curve-contour-v1", ...chosen.geometry, sourceNodeIds: chosen.contacts,
      sourcePixelCount: chosen.points.length, tolerancePx } };
}

/** Fit actual source trajectories, leaving unsupported proposals for normal admission to reject.
 * No shape IDs, labels, fixed layout, or fixed color are used to identify relations.
 * @param {unknown} request */
function fitSourceSemanticCurves(request) {
  if (!record(request) || !Array.isArray(request.shapes) || request.shapes.length > 10000
    || !record(request.slideSize) || typeof request.slideSize.widthPt !== "number" || typeof request.slideSize.heightPt !== "number"
    || !box({ x: 0, y: 0, w: request.slideSize.widthPt, h: request.slideSize.heightPt })
    || !record(request.image) || !Number.isSafeInteger(request.image.width) || !Number.isSafeInteger(request.image.height)
    || typeof request.image.width !== "number" || typeof request.image.height !== "number"
    || request.image.width < 1 || request.image.height < 1 || request.image.width > 16384 || request.image.height > 16384
    || request.image.width * request.image.height > 40000000 || !(request.image.rgba instanceof Uint8Array)
    || request.image.rgba.length !== request.image.width * request.image.height * 4) throw new TypeError("Invalid source semantic curve inputs");
  const image = { width: request.image.width, height: request.image.height, rgba: request.image.rgba };
  const slide = { widthPt: request.slideSize.widthPt, heightPt: request.slideSize.heightPt };
  /** @type {{id: string, box: Box}[]} */ const nodes = [];
  const identities = new Set();
  let attempted = 0, accepted = 0;
  for (const shape of request.shapes) {
    if (!record(shape) || !id(shape.id)) continue;
    if (identities.has(shape.id)) throw new TypeError("Ambiguous source semantic curve identities");
    identities.add(shape.id);
    if (box(shape.box) && record(shape.source) && shape.source.nativeComponentRole === "node"
      && shape.source.semanticNativeStructure === true && shape.box.x + shape.box.w <= slide.widthPt
      && shape.box.y + shape.box.h <= slide.heightPt) nodes.push({ id: shape.id, box: shape.box });
  }
  const budget = { used: 0, diagnostics: /** @type {Record<string, number>} */ ({}) }, usedContours = new Set();
  const shapes = request.shapes.map((/** @type {unknown} */ shape) => {
    if (!record(shape) || shape.type !== "arc" || !id(shape.id) || !record(shape.source)
      || shape.source.semanticNativeStructure !== true || shape.source.nativeComponentRole !== "relationship"
      || nodes.length < 2 || nodes.length > 96 || attempted >= 32) return shape;
    attempted += 1;
    const curve = traceCurve(shape, image, slide, nodes, budget);
    if (!curve) return shape;
    const fingerprint = JSON.stringify(curve.bounds);
    if (usedContours.has(fingerprint)) return shape;
    usedContours.add(fingerprint); accepted += 1;
    return { ...shape, type: "freeform", box: curve.box,
      style: { fill: curve.color, stroke: "none", strokeWidthPt: 0, freeformSegments: curve.segments },
      source: { ...shape.source, componentQualityRole: "connector-curve", sourceSemanticCurveFit: curve.evidence } };
  });
  return { shapes, evidence: { attempted, accepted, sampledPixels: budget.used, diagnostics: budget.diagnostics } };
}
module.exports = { fitSourceSemanticCurves };
