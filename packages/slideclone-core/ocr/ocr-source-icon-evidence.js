// @ts-check
"use strict";

const { types } = require("node:util");

/** @typedef {{x:number,y:number,w:number,h:number,pixels:number,rows:number[]}} EnclosedPart */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && [null, Object.prototype].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every((property) => "value" in property);
}

/** @param {unknown} value @returns {Raster | null} */
function raster(value) {
  if (!record(value) || typeof value.width !== "number" || typeof value.height !== "number"
    || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height)
    || value.width < 24 || value.height < 24 || value.width > 512 || value.height > 512
    || types.isProxy(value.rgba) || !types.isUint8Array(value.rgba)) return null;
  const prototype = Object.getPrototypeOf(Uint8Array.prototype);
  const length = Reflect.get(prototype, "length", value.rgba);
  const buffer = Reflect.get(prototype, "buffer", value.rgba);
  if (length !== value.width * value.height * 4 || !types.isArrayBuffer(buffer)) return null;
  return { width: value.width, height: value.height,
    rgba: new Uint8Array(buffer, Reflect.get(prototype, "byteOffset", value.rgba), length) };
}

/** @param {Raster} image */
function outlineMask(image) {
  const { width, height, rgba } = image;
  const border = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let samples = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
    samples += 1;
    for (let channel = 0; channel < 3; channel += 1) {
      const histogram = border[channel], value = rgba[(y * width + x) * 4 + channel];
      if (!histogram || value === undefined) return null;
      histogram[value] = (histogram[value] ?? 0) + 1;
    }
  }
  const background = border.map(histogram => {
    let count = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      count += histogram[value] ?? 0;
      if (count >= samples / 2) return value;
    }
    return 255;
  });
  const contrasts = new Float32Array(width * height);
  let strongest = 0;
  for (let pixel = 0; pixel < contrasts.length; pixel += 1) {
    if ((rgba[pixel * 4 + 3] ?? 0) < 64) continue;
    let contrast = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      contrast = Math.max(contrast, Math.abs((rgba[pixel * 4 + channel] ?? 0) - (background[channel] ?? 255)));
    }
    contrasts[pixel] = contrast; strongest = Math.max(strongest, contrast);
  }
  if (strongest < 48) return null;
  const threshold = Math.max(32, strongest * 0.55);
  return Uint8Array.from(contrasts, contrast => contrast >= threshold ? 1 : 0);
}

/** @param {Uint8Array} mask @param {number} width @param {number} height @returns {EnclosedPart[] | null} */
function enclosedParts(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  /** @type {EnclosedPart[]} */
  const parts = [];
  let enclosed = 0;
  for (let seed = 0; seed < mask.length; seed += 1) {
    if (mask[seed] || seen[seed]) continue;
    let tail = 1, edge = false, pixels = 0, minX = width, minY = height, maxX = -1, maxY = -1;
    const rowCounts = new Uint32Array(height);
    stack[0] = seed; seen[seed] = 1;
    while (tail > 0) {
      const pixel = stack[--tail]; if (pixel === undefined) return null;
      const x = pixel % width, y = Math.floor(pixel / width);
      pixels += 1; rowCounts[y] = (rowCounts[y] ?? 0) + 1;
      edge ||= x === 0 || y === 0 || x === width - 1 || y === height - 1;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      const neighbors = [x > 0 ? pixel - 1 : -1, x + 1 < width ? pixel + 1 : -1,
        y > 0 ? pixel - width : -1, y + 1 < height ? pixel + width : -1];
      for (const next of neighbors) if (next >= 0 && !mask[next] && !seen[next]) {
        seen[next] = 1; stack[tail++] = next;
      }
    }
    if (edge) continue;
    if (++enclosed > 64) return null;
    if (pixels < Math.max(12, mask.length * 0.004)) continue;
    parts.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1,
      pixels, rows: Array.from(rowCounts.subarray(minY, maxY + 1)) });
  }
  return parts;
}

/** @param {EnclosedPart} part @param {number} start @param {number} end */
function bandWidth(part, start, end) {
  const first = Math.floor(part.h * start), last = Math.max(first + 1, Math.ceil(part.h * end));
  let total = 0;
  for (let index = first; index < last; index += 1) total += part.rows[index] ?? 0;
  return total / (last - first);
}

/**
 * Require an enclosed rounded head above a wider, flat-bottomed torso.
 * Rounded stacked glyph counters and open strokes do not satisfy this topology.
 * This detector reads at most one owned 512x512 crop and has no engine imports.
 * @param {unknown} input
 * @returns {boolean}
 */
function hasSourceIconEvidence(input) {
  const image = raster(input); if (!image) return false;
  const mask = outlineMask(image); if (!mask) return false;
  const parts = enclosedParts(mask, image.width, image.height); if (!parts) return false;
  for (const head of parts) {
    const density = head.pixels / (head.w * head.h);
    if (head.w / head.h < 0.78 || head.w / head.h > 1.28 || density < 0.62 || density > 0.88
      || bandWidth(head, 0, 0.12) > head.w * 0.65 || bandWidth(head, 0.88, 1) > head.w * 0.65
      || bandWidth(head, 0.35, 0.65) < head.w * 0.85) continue;
    for (const torso of parts) {
      const gap = torso.y - head.y - head.h;
      if (torso === head || gap < -head.h * 0.08 || gap > head.h * 0.35
        || torso.w < head.w * 1.35 || torso.w > head.w * 2.8 || torso.h < head.h * 0.55 || torso.h > head.h * 1.5
        || torso.w / torso.h < 1.25 || torso.pixels / (torso.w * torso.h) < 0.4
        || Math.abs(head.x + head.w / 2 - torso.x - torso.w / 2) > torso.w * 0.22
        || bandWidth(torso, 0, 0.12) > torso.w * 0.72 || bandWidth(torso, 0.88, 1) < torso.w * 0.65) continue;
      return true;
    }
  }
  return false;
}

module.exports = { hasSourceIconEvidence };
