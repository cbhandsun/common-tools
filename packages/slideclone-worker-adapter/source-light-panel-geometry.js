"use strict";

const { admitsSemanticPanelFill } = require("./semantic-panel-fill-policy");

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }

/** @param {unknown} shape @param {unknown} raster @param {unknown} slideSize */
function fitSourceLightPanelGeometry(shape, raster, slideSize) {
  if (!admitsSemanticPanelFill(shape, slideSize) || !record(shape) || !record(shape.box) || !record(slideSize) || !record(raster)) return null;
  const { x, y, w, h } = shape.box;
  const { widthPt, heightPt } = slideSize;
  const { width, height, rgba: data } = raster;
  if (![x, y, w, h, widthPt, heightPt].every(finite) || !finite(x) || !finite(y) || !finite(w) || !finite(h) || !finite(widthPt) || !finite(heightPt)) return null;
  if (!finite(width) || !finite(height) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 16 || height < 16 || width > 16384 || height > 16384 || width * height > 40_000_000 ||
      !(data instanceof Uint8Array) || data.length !== width * height * 4) return null;
  const sx = width / widthPt, sy = height / heightPt;
  const base = { x: x * sx, y: y * sy, w: w * sx, h: h * sy };
  if (base.w < 48 || base.h < 48) return null;
  const pixels = data, rasterWidth = width, rasterHeight = height;
  /** @param {number} px @param {number} py */
  function light(px, py) {
    px = Math.round(px); py = Math.round(py);
    if (px < 0 || py < 0 || px >= rasterWidth || py >= rasterHeight) return null;
    const i = (py * rasterWidth + px) * 4;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (pixels[i + 3] < 250 || Math.min(r, g, b) < 180 || Math.max(r, g, b) - Math.min(r, g, b) > 35) return null;
    return (r + g + b) / 3;
  }
  /** @param {boolean} vertical @param {number} estimate @param {number} start @param {number} length @param {number} inward @param {number} scale */
  function edge(vertical, estimate, start, length, inward, scale) {
    const radius = Math.min(40, Math.ceil(12 * scale), Math.floor(length * 0.1));
    const candidates = [];
    for (let axis = Math.round(estimate) - radius; axis <= Math.round(estimate) + radius; axis++) {
      const contrasts = [];
      for (let sample = 0; sample < 41; sample++) {
        const along = start + length * (0.2 + 0.6 * sample / 40);
        let inside = 0, outside = 0, valid = true;
        for (let offset = 2; offset <= 4; offset++) {
          const a = vertical ? light(axis + inward * offset, along) : light(along, axis + inward * offset);
          const b = vertical ? light(axis - inward * offset, along) : light(along, axis - inward * offset);
          if (a === null || b === null) { valid = false; break; }
          inside += a; outside += b;
        }
        if (valid) contrasts.push((outside - inside) / 3);
      }
      if (contrasts.length < 33 || contrasts.filter(value => value >= 3).length < 29) continue;
      contrasts.sort((a, b) => a - b);
      const score = contrasts[Math.floor(contrasts.length / 2)];
      if (score >= 3) candidates.push({ axis, score });
    }
    candidates.sort((a, b) => b.score - a.score || Math.abs(a.axis - estimate) - Math.abs(b.axis - estimate));
    const best = candidates[0];
    if (!best || candidates.some(item => Math.abs(item.axis - best.axis) > 6 && item.score >= best.score * 0.9)) return null;
    const plateau = candidates.filter(item => Math.abs(item.axis - best.axis) <= 6 && item.score >= best.score * 0.97);
    return plateau.reduce((sum, item) => sum + item.axis, 0) / plateau.length;
  }
  // Broad central spans exclude rounded corners; all four transitions must agree.
  const left = edge(true, base.x, base.y, base.h, 1, sx);
  const right = edge(true, base.x + base.w, base.y, base.h, -1, sx);
  const top = edge(false, base.y, base.x, base.w, 1, sy);
  const bottom = edge(false, base.y + base.h, base.x, base.w, -1, sy);
  if (left === null || right === null || top === null || bottom === null) return null;
  const box = { x: left / sx, y: top / sy, w: (right - left) / sx, h: (bottom - top) / sy };
  if (box.w < w * 0.9 || box.w > w * 1.1 || box.h < h * 0.9 || box.h > h * 1.1) return null;
  const movement = Math.abs(box.x - x) + Math.abs(box.y - y) + Math.abs(box.w - w) * 0.5 + Math.abs(box.h - h) * 0.5;
  return movement >= 0.4 ? { box, movement, fittedEdges: 4, provider: "source-light-panel-transition" } : null;
}

module.exports = { fitSourceLightPanelGeometry };
