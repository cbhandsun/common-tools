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

/** @param {Raster} image @param {number} x @param {number} y @returns {Pixel|null} */
function pixel(image, x, y) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return null;
  const offset = (y * image.width + x) * 4;
  return [image.rgba[offset] ?? 0, image.rgba[offset + 1] ?? 0, image.rgba[offset + 2] ?? 0, image.rgba[offset + 3] ?? 0];
}

/** @param {Pixel} a @param {Pixel} b */
function distance(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]), Math.abs(a[3] - b[3]));
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
  const image = { width, height, rgba: new Uint8Array(buffer, byteOffset, length) }, horizontal = input.axis === "h";
  const parallel = horizontal ? width : height, perpendicular = horizontal ? height : width;
  const mask = new Uint8Array(width * height);
  for (let along = 0; along < parallel; along++) {
    /** @param {number} across */
    const at = across => pixel(image, horizontal ? along : across, horizontal ? across : along);
    let start = 0;
    while (start < perpendicular) {
      const first = at(start);
      if (!first) return null;
      let end = start + 1, last = first;
      while (end < perpendicular) {
        const next = at(end);
        if (!next || distance(first, next) > 24) break;
        last = next; end++;
      }
      const before = at(start - 1), after = at(end);
      if (end - start <= 12 && first[3] >= 64 && before && after
        && distance(first, before) >= 12 && distance(last, after) >= 12) {
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
