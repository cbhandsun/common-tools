// @ts-check
"use strict";

/** @typedef {{width: number, height: number, rgba: Uint8Array}} Raster */
/** @typedef {{x: number, y: number, w: number, h: number}} Box */
/** @param {unknown} v @returns {v is Record<string, unknown>} */
function record(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
/** @param {unknown} v @returns {v is number} */
function finite(v) { return typeof v === "number" && Number.isFinite(v); }

/**
 * Require a connected, unequal-width two-pane frame with offset headers.
 * Equal grids, isolated strokes and dense glyphs remain ambiguous text.
 * @param {unknown} imageInput @param {unknown} boxInput
 * @returns {{pixelBox: Box, scannedPixels: number} | null}
 */
function framedGraphicEvidence(imageInput, boxInput) {
  if (!record(imageInput) || !record(boxInput)) return null;
  const { width, height, rgba } = imageInput;
  const { x, y, w, h } = boxInput;
  if (!finite(width) || !finite(height) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 40000000
    || !(rgba instanceof Uint8Array) || rgba.length !== width * height * 4
    || !finite(x) || !finite(y) || !finite(w) || !finite(h) || x < 0 || y < 0 || w < 24 || h < 24
    || x + w > width || y + h > height || w / h < 0.6 || w / h > 1.8) return null;
  const pad = Math.ceil(Math.min(w, h) * 0.1);
  const left = Math.max(0, Math.floor(x) - pad), top = Math.max(0, Math.floor(y) - pad);
  const right = Math.min(width, Math.ceil(x + w) + pad), bottom = Math.min(height, Math.ceil(y + h) + pad);
  const rw = right - left, rh = bottom - top;
  if (rw * rh > 262144) return null;
  const mask = new Uint8Array(rw * rh), counts = new Uint32Array(rw), first = new Uint32Array(rw);
  first.fill(rh);
  let ink = 0;
  for (let row = 0; row < rh; row++) for (let col = 0; col < rw; col++) {
    const offset = ((top + row) * width + left + col) * 4;
    const r = rgba[offset], g = rgba[offset + 1], b = rgba[offset + 2], a = rgba[offset + 3];
    if (r === undefined || g === undefined || b === undefined || a === undefined) return null;
    if (a < 64 || r * 0.2126 + g * 0.7152 + b * 0.0722 >= 132) continue;
    mask[row * rw + col] = 1; counts[col] = (counts[col] ?? 0) + 1; ink++;
    first[col] = Math.min(first[col] ?? rh, row);
  }
  if (ink / mask.length < 0.06 || ink / mask.length > 0.4) return null;
  /** @type {{start: number, end: number, top: number}[]} */
  const stems = [];
  for (let col = 0; col < rw; col++) {
    if ((counts[col] ?? 0) < rh * 0.72) continue;
    const previous = stems[stems.length - 1];
    if (previous && previous.end === col - 1) {
      previous.end = col; previous.top = Math.min(previous.top, first[col] ?? rh);
    } else stems.push({ start: col, end: col, top: first[col] ?? rh });
  }
  const [a, b, c] = stems;
  if (stems.length !== 3 || !a || !b || !c || stems.some(stem => stem.end - stem.start + 1 > rw * 0.12)) return null;
  const gap1 = b.start - a.end, gap2 = c.start - b.end;
  if (Math.min(gap1, gap2) < rw * 0.18 || Math.max(gap1, gap2) / Math.min(gap1, gap2) < 1.35
    || c.end - a.start < rw * 0.7 || Math.abs(a.top - b.top) > rh * 0.05
    || c.top - Math.min(a.top, b.top) < rh * 0.04) return null;
  const seed = Math.floor(rh / 2) * rw + Math.floor((b.start + b.end) / 2);
  if (!mask[seed]) return null;
  const seen = new Uint8Array(mask.length), stack = [seed]; seen[seed] = 1;
  let minX = rw, minY = rh, maxX = 0, maxY = 0;
  while (stack.length) {
    const index = stack.pop();
    if (index === undefined) break;
    const col = index % rw, row = Math.floor(index / rw);
    minX = Math.min(minX, col); maxX = Math.max(maxX, col);
    minY = Math.min(minY, row); maxY = Math.max(maxY, row);
    const next = [];
    if (col > 0) next.push(index - 1); if (col + 1 < rw) next.push(index + 1);
    if (row > 0) next.push(index - rw); if (row + 1 < rh) next.push(index + rw);
    for (const i of next) if (mask[i] && !seen[i]) { seen[i] = 1; stack.push(i); }
  }
  if (minX > a.end || maxX < c.start || maxY - minY < rh * 0.7) return null;
  let bridge = false;
  for (let row = Math.floor(minY + (maxY - minY) * 0.8); row <= maxY; row++) {
    let hits = 0;
    for (let col = a.start; col <= c.end; col++) hits += seen[row * rw + col] ? 1 : 0;
    if (hits / (c.end - a.start + 1) >= 0.85) bridge = true;
  }
  return bridge ? { pixelBox: { x: left + minX, y: top + minY, w: maxX - minX + 1, h: maxY - minY + 1 }, scannedPixels: mask.length } : null;
}

module.exports = { framedGraphicEvidence };
