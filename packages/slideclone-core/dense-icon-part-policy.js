// @ts-check
"use strict";

/** @typedef {{x: number, y: number, w: number, h: number}} Box */
/** @typedef {{pixels: number, box: Box, color: {r: number, g: number, b: number}}} Part */
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value @returns {value is Part} */
function part(value) {
  if (!record(value) || !record(value.box) || !record(value.color)) return false;
  const {x, y, w, h} = value.box, {r, g, b} = value.color;
  return finite(value.pixels) && Number.isSafeInteger(value.pixels) && value.pixels > 0
    && finite(x) && finite(y) && finite(w) && finite(h) && x >= 0 && y >= 0 && w > 0 && h > 0
    && Number.isFinite(w * h) && value.pixels <= w * h && Number.isFinite(x + w) && Number.isFinite(y + h)
    && finite(r) && finite(g) && finite(b)
    && [r, g, b].every(channel => channel >= 0 && channel <= 255);
}
/** @param {Part} candidate @param {Part} primary */
function alignedPeer(candidate, primary) {
  const a = candidate.box, b = primary.box;
  if (candidate.pixels < Math.max(12, primary.pixels * 0.08) || candidate.pixels / (a.w * a.h) < 0.35
    || a.w / a.h < 0.2 || a.w / a.h > 5
    || Math.hypot(candidate.color.r - primary.color.r, candidate.color.g - primary.color.g, candidate.color.b - primary.color.b) > 48) return false;
  const gapX = Math.max(0, a.x - b.x - b.w, b.x - a.x - a.w);
  const gapY = Math.max(0, a.y - b.y - b.h, b.y - a.y - a.h);
  const overlapX = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const distance = Math.max(4, Math.min(b.w, b.h) * 0.18);
  const centeredX = Math.abs(a.x + a.w / 2 - b.x - b.w / 2) <= b.w * 0.15;
  const centeredY = Math.abs(a.y + a.h / 2 - b.y - b.h / 2) <= b.h * 0.15;
  return (gapY <= distance && centeredX && overlapX / Math.min(a.w, b.w) >= 0.7)
    || (gapX <= distance && centeredY && overlapY / Math.min(a.h, b.h) >= 0.7);
}
/** @param {unknown} values @param {unknown} primaryIndex @returns {number[]} */
function selectDenseIconParts(values, primaryIndex) {
  if (!Array.isArray(values) || values.length > 10000 || !finite(primaryIndex) || !Number.isSafeInteger(primaryIndex)
    || primaryIndex < 0 || primaryIndex >= values.length) throw new TypeError("Invalid dense icon parts");
  const primary = values[primaryIndex];
  if (!part(primary)) throw new TypeError("Invalid primary dense icon part");
  const indices = [primaryIndex];
  for (let i = 0; i < values.length && indices.length < 8; i++) {
    const candidate = values[i];
    if (i !== primaryIndex && part(candidate) && alignedPeer(candidate, primary)) indices.push(i);
  }
  return indices;
}

module.exports = { selectDenseIconParts };
