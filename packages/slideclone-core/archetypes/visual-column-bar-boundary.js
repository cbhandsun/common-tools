// @ts-check
"use strict";

/** A baseline and foreground column lengths do not prove a physical bar:
 * OCR masks and panel contents can terminate those columns inside a larger fill.
 * Require source transitions on both sides and the top before objectifying it.
 * Fixed work: 16 pairs per edge, 96 source pixel reads per proposal.
 * @param {unknown} input @param {unknown} candidate */
function hasSourceColumnBarBoundary(input, candidate) {
  try {
    if (!input || typeof input !== "object" || !candidate || typeof candidate !== "object") return false;
    if (!("width" in input) || !("height" in input) || !("rgba" in input)) return false;
    const { width, height, rgba } = input;
    if (typeof width !== "number" || typeof height !== "number" || !Number.isSafeInteger(width)
      || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > 40_000_000
      || !(rgba instanceof Uint8Array) || rgba.length !== width * height * 4) return false;
    if (!("x" in candidate) || !("y" in candidate) || !("w" in candidate) || !("h" in candidate)) return false;
    const { x, y, w, h } = candidate;
    if (typeof x !== "number" || typeof y !== "number" || typeof w !== "number" || typeof h !== "number"
      || ![x, y, w, h].every(Number.isSafeInteger) || x < 2 || y < 2 || w < 8 || h < 8
      || x + w + 1 >= width || y + h > height) return false;
    for (let edge = 0; edge < 3; edge++) {
      let transitions = 0;
      for (let index = 0; index < 16; index++) {
        const fraction = 0.1 + 0.8 * (index + 0.5) / 16;
        const ix = edge < 2 ? x + (edge === 1 ? w - 2 : 1) : Math.floor(x + w * fraction);
        const iy = edge === 2 ? y + 1 : Math.floor(y + h * fraction);
        const ox = edge < 2 ? x + (edge === 1 ? w + 1 : -2) : ix;
        const oy = edge === 2 ? y - 2 : iy;
        const inside = (iy * width + ix) * 4, outside = (oy * width + ox) * 4;
        if (rgba[inside + 3] < 250 || rgba[outside + 3] < 250) continue;
        if ([0, 1, 2].some(channel => Math.abs(rgba[inside + channel] - rgba[outside + channel]) > 24)) transitions++;
      }
      if (transitions < 8) return false;
    }
    return true;
  } catch {
    // Unknown/proxied inputs cannot authorize destructive raster replacement.
    return false;
  }
}

module.exports = { hasSourceColumnBarBoundary };
