// @ts-check
"use strict";

const { types } = require("node:util");

/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @typedef {[number,number,number,number]} Pixel */

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(item => "value" in item);
}

/** @param {Uint8Array} rgba @param {number} a @param {number} b */
function distance(rgba, a, b) {
  return Math.max(
    Math.abs((rgba[a] ?? 0) - (rgba[b] ?? 0)),
    Math.abs((rgba[a + 1] ?? 0) - (rgba[b + 1] ?? 0)),
    Math.abs((rgba[a + 2] ?? 0) - (rgba[b + 2] ?? 0)),
    Math.abs((rgba[a + 3] ?? 0) - (rgba[b + 3] ?? 0))
  );
}

/**
 * Mark narrow color runs with independently contrasting pixels on both sides.
 * A broad fill cannot become several lines merely because downstream groups
 * have a small row budget. Each source pixel is visited a constant number of times.
 * @param {unknown} input @returns {Uint8Array|null}
 */
function axisStrokeEvidenceMask(input) {
  if (!record(input) || !record(input.image) || (input.axis !== "h" && input.axis !== "v")) return null;
  const { width, height, rgba } = input.image;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 40000000
    || types.isProxy(rgba) || !types.isUint8Array(rgba)) return null;
  const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
  const length = /** @type {unknown} */ (Reflect.get(typedArrayPrototype, "length", rgba));
  const buffer = /** @type {unknown} */ (Reflect.get(typedArrayPrototype, "buffer", rgba));
  const byteOffset = /** @type {unknown} */ (Reflect.get(typedArrayPrototype, "byteOffset", rgba));
  if (typeof length !== "number" || length !== width * height * 4 || !types.isArrayBuffer(buffer)
    || typeof byteOffset !== "number") return null;
  const pixels = new Uint8Array(buffer, byteOffset, length), horizontal = input.axis === "h";
  const parallel = horizontal ? width : height, perpendicular = horizontal ? height : width;
  const stride = (horizontal ? width : 1) * 4;
  const mask = new Uint8Array(width * height);
  for (let along = 0; along < parallel; along++) {
    const baseOffset = (horizontal ? along : along * width) * 4;
    let start = 0;
    while (start < perpendicular) {
      const firstOffset = baseOffset + start * stride;
      let end = start + 1;
      while (end < perpendicular && distance(pixels, firstOffset, baseOffset + end * stride) <= 24) {
        end++;
      }
      if (end - start <= 12 && (pixels[firstOffset + 3] ?? 0) >= 64 && start > 0 && end < perpendicular
        && distance(pixels, firstOffset, firstOffset - stride) >= 12
        && distance(pixels, baseOffset + (end - 1) * stride, baseOffset + end * stride) >= 12) {
        for (let across = start; across < end; across++) {
          mask[(horizontal ? across * width + along : along * width + across)] = 1;
        }
      }
      start = end;
    }
  }
  return mask;
}

module.exports = { axisStrokeEvidenceMask };
