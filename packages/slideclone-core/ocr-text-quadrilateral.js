// @ts-check
"use strict";

const { types } = require("node:util");

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {readonly [number,number]} Point */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(item => "value" in item);
}
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value @returns {value is unknown[]} */
function array(value) {
  return Array.isArray(value) && !types.isProxy(value)
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(item => "value" in item);
}
/** @param {unknown} value @returns {Box} */
function box(value) {
  if (!record(value) || !finite(value.x) || !finite(value.y) || !finite(value.w) || !finite(value.h)
    || value.x < 0 || value.y < 0 || value.w <= 0 || value.h <= 0) throw new TypeError("OCR polygon geometry is invalid");
  return { x: value.x, y: value.y, w: value.w, h: value.h };
}
/** @param {readonly Point[]} points */
function envelope(points) {
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
/** @param {Box} a @param {Box} b */
function sameBox(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h)) <= 0.000001;
}

/** Snapshot bounded polygons without invoking caller accessors or coercion.
 * @param {unknown} value @param {{widthPx:number,heightPx:number}} dimensions
 * @param {Box} candidate @returns {readonly Point[]|undefined} */
function admitOcrPolygon(value, dimensions, candidate) {
  if (value === undefined) return undefined;
  if (!record(dimensions) || !finite(dimensions.widthPx) || !finite(dimensions.heightPx)
    || !Number.isSafeInteger(dimensions.widthPx) || !Number.isSafeInteger(dimensions.heightPx)
    || dimensions.widthPx < 1 || dimensions.heightPx < 1 || dimensions.widthPx > 16384 || dimensions.heightPx > 16384
    || dimensions.widthPx * dimensions.heightPx > 40000000 || !array(value) || value.length < 4 || value.length > 16) {
    throw new TypeError("OCR polygon geometry is invalid");
  }
  /** @type {Point[]} */ const points = [];
  for (let index = 0; index < value.length; index++) {
    const point = value[index];
    if (!array(point) || point.length !== 2 || !finite(point[0]) || !finite(point[1]) || point[0] < 0 || point[1] < 0
      || point[0] > dimensions.widthPx || point[1] > dimensions.heightPx) throw new TypeError("OCR polygon geometry is invalid");
    points.push(Object.freeze([point[0], point[1]]));
  }
  const bounds = envelope(points);
  if (bounds.w <= 0 || bounds.h <= 0 || !sameBox(bounds, box(candidate))) throw new TypeError("OCR polygon geometry is stale");
  return Object.freeze(points);
}

/** Infer only a near-rectangular, consistently ordered quadrilateral. Perspective
 * polygons retain their source geometry but do not authorize an invented rotation.
 * @param {readonly Point[]|undefined} points @param {number} [scaleX] @param {number} [scaleY]
 * @returns {{box:Box,rotation:number}|null} */
function projectOcrPolygon(points, scaleX = 1, scaleY = 1) {
  if (!points || points.length !== 4 || !finite(scaleX) || !finite(scaleY) || scaleX <= 0 || scaleY <= 0) return null;
  const scaled = points.map(point => [point[0] * scaleX, point[1] * scaleY]);
  const [a, b, c, d] = scaled;
  if (!a || !b || !c || !d) return null;
  const ax = a[0] ?? 0, ay = a[1] ?? 0, bx = b[0] ?? 0, by = b[1] ?? 0;
  const cx = c[0] ?? 0, cy = c[1] ?? 0, dx = d[0] ?? 0, dy = d[1] ?? 0;
  const vx = (bx - ax + cx - dx) / 2, vy = (by - ay + cy - dy) / 2;
  const w = Math.hypot(vx, vy), h = (Math.hypot(dx - ax, dy - ay) + Math.hypot(cx - bx, cy - by)) / 2;
  if (w <= 0 || h <= 0 || w > 100000 || h > 100000 || (bx - ax) * (dy - ay) - (by - ay) * (dx - ax) <= 0) return null;
  const mx = (ax + bx + cx + dx) / 4, my = (ay + by + cy + dy) / 4;
  const ux = vx / w, uy = vy / w;
  const expected = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [
    mx + (sx ?? 0) * w * ux / 2 - (sy ?? 0) * h * uy / 2,
    my + (sx ?? 0) * w * uy / 2 + (sy ?? 0) * h * ux / 2
  ]);
  const tolerance = Math.max(Math.min(scaleX, scaleY) * 2, h * 0.1);
  if (scaled.some((point, index) => Math.hypot((point[0] ?? 0) - (expected[index]?.[0] ?? 0),
    (point[1] ?? 0) - (expected[index]?.[1] ?? 0)) > tolerance)) return null;
  const nativeBox = { x: mx - w / 2, y: my - h / 2, w, h };
  if (nativeBox.x < 0 || nativeBox.y < 0) return null;
  return { box: nativeBox, rotation: Math.atan2(vy, vx) * 180 / Math.PI };
}

/** Apply the admitted geometry only before any owner has moved/resized the OCR box.
 * @param {unknown} value @returns {Record<string,unknown>} */
function projectOcrTextBox(value) {
  if (!record(value)) throw new TypeError("OCR text geometry is invalid");
  if (!record(value.source) || value.source.ocrPolygonPt === undefined) return value;
  const candidate = box(value.box);
  const bounds = box(value.source.evidenceBox);
  if (!sameBox(candidate, bounds)) return value;
  const polygon = value.source.ocrPolygonPt;
  if (!array(polygon) || polygon.length !== 4) return value;
  /** @type {Point[]} */ const points = [];
  for (const point of polygon) {
    if (!array(point) || point.length !== 2 || !finite(point[0]) || !finite(point[1])) throw new TypeError("OCR text geometry is invalid");
    points.push([point[0], point[1]]);
  }
  if (!sameBox(envelope(points), bounds)) throw new TypeError("OCR text geometry is stale");
  const geometry = projectOcrPolygon(points);
  if (!geometry || Math.abs(geometry.rotation) < 0.5) return value;
  return { ...value, box: geometry.box, rotation: geometry.rotation,
    source: { ...value.source, ocrQuadrilateralProjected: true } };
}

/** Native text rotation is around the box center, not its upper-left corner.
 * @param {unknown} value @returns {Box|null} */
function rotatedTextEnvelope(value) {
  if (!record(value) || !finite(value.rotation) || Math.abs(value.rotation) < 0.001) return null;
  const original = box(value.box), radians = (value.rotation % 360) * Math.PI / 180;
  const w = Math.abs(Math.cos(radians)) * original.w + Math.abs(Math.sin(radians)) * original.h;
  const h = Math.abs(Math.sin(radians)) * original.w + Math.abs(Math.cos(radians)) * original.h;
  return { x: original.x + (original.w - w) / 2, y: original.y + (original.h - h) / 2, w, h };
}

module.exports = { admitOcrPolygon, projectOcrPolygon, projectOcrTextBox, rotatedTextEnvelope };
