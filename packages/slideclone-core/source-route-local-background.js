// @ts-check
"use strict";
const { types } = require("node:util");
const { sourceRaster } = require("./residual-text-mask");
const { record, list } = require("./source-scene-group-containment");
/** Presence metadata for measured closures only; it grants no pixel ownership.
 * @type {WeakSet<object>} */ const activeBackgrounds = new WeakSet();
/** Observe smooth background outside a measured endpoint body. Both opposite
 * flanks must vary continuously under the original 18-channel tolerance, start at that
 * body's mask, and converge continuously to the independently sampled global
 * background. A clipped band, sharp branch or unknown flank grants nothing.
 * This models background for route proposals only; it grants no erasure,
 * port, component completion or ownership. Uses the existing cached raster.
 * @param {unknown} input @returns {(index:number)=>number[]} */
function sourceRouteLocalBackground(input) {
  if (!record(input) || !list(input.background) || input.background.length !== 3
    || input.background.some(v => typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 255)
    || !record(input.work) || !Number.isSafeInteger(input.work.checks) || Number(input.work.checks) < 0
    || Number(input.work.checks) > 4000000) throw new TypeError("Route background input is invalid");
  const image = sourceRaster(input.image), area = image.width * image.height;
  if (area > 262144) throw new RangeError("Route background exceeds the unit budget");
  if (types.isProxy(input.body) || !types.isUint8Array(input.body)) throw new TypeError("Route background body mask is invalid");
  const prototype = Object.getPrototypeOf(Uint8Array.prototype), buffer = Reflect.get(prototype, "buffer", input.body);
  if (!types.isArrayBuffer(buffer) || Reflect.get(prototype, "length", input.body) !== area) throw new TypeError("Route background body mask is invalid");
  const body = new Uint8Array(buffer, Reflect.get(prototype, "byteOffset", input.body), area);
  const background = /** @type {number[]} */ (input.background), work = input.work;
  /** @typedef {{left:number[],right:number[]}} Section */
  /** @type {Map<number,Section>} */ const rows = new Map(), columns = new Map();
  let active = false;
  /** @param {number[]} a @param {number[]} b */
  const agrees = (a, b) => a.every((v, c) => Math.abs(v - (b[c] ?? 0)) <= 18);
  /** @param {number} index */
  const color = index => [0, 1, 2].map(c => image.rgba[index * 4 + c] ?? 0);
  /** @param {Section} section @param {number} position */
  const interpolate = (section, position) => section.left.map((v, c) => v + ((section.right[c] ?? 0) - v) * position);
  for (const horizontal of [true, false]) {
    const length = horizontal ? image.height : image.width, across = horizontal ? image.width : image.height;
    if (across < 8) continue;
    const target = horizontal ? rows : columns;
    /** @param {number} along @param {number} side */
    const cell = (along, side) => horizontal ? along * image.width + side : side * image.width + along;
    for (const direction of [1, -1]) {
      /** @type {{index:number,section:Section}[]} */ let pending = [];
      for (let i = direction === 1 ? 1 : length - 2; i >= 0 && i < length; i += direction) {
        work.checks = Number(work.checks) + 8;
        if (Number(work.checks) > 4000000) return () => background;
        const a = cell(i, 0), b = cell(i, across - 1), previous = i - direction;
        const starts = previous >= 0 && previous < length && !!body[cell(previous, 0)] && !!body[cell(previous, across - 1)];
        if (body[a] || body[b] || (image.rgba[a * 4 + 3] ?? 0) < 240 || (image.rgba[b * 4 + 3] ?? 0) < 240) { pending = []; continue; }
        const left = color(a), right = color(b), section = { left, right };
        if (starts) pending = [];
        if (!starts && !pending.length) continue;
        const last = pending.at(-1);
        if (last && (!agrees(left, last.section.left) || !agrees(right, last.section.right))) { pending = []; continue; }
        pending.push({ index: i, section });
        if (agrees(left, background) && agrees(right, background)) {
          // At least three independently observed cross-sections must connect
          // the body boundary to the global field; no extrapolation is used.
          let observed = 0, supported = 0;
          if (pending.length >= 3) for (const sample of pending) for (let j = 0; j < across; j++) {
            work.checks = Number(work.checks) + 1;
            if (Number(work.checks) > 4000000) return () => background;
            const n = cell(sample.index, j); if (body[n]) continue;
            observed++;
            if ((image.rgba[n * 4 + 3] ?? 0) >= 240 && agrees(color(n), interpolate(sample.section, j / (across - 1)))) supported++;
          }
          if (observed && supported / observed >= .9) for (const sample of pending) {
            work.checks = Number(work.checks) + 6;
            if (Number(work.checks) > 4000000) return () => background;
            if (sample.section.left.some((v,c) => v !== background[c]) || sample.section.right.some((v,c) => v !== background[c])) active = true;
            target.set(sample.index, sample.section);
          }
          pending = [];
        }
      }
    }
  }
  const at = (/** @type {number} */ index) => {
    const row = rows.get(Math.floor(index / image.width)), column = columns.get(index % image.width);
    const a = row ? interpolate(row, index % image.width / (image.width - 1)) : undefined;
    const b = column ? interpolate(column, Math.floor(index / image.width) / (image.height - 1)) : undefined;
    if (a && b && !agrees(a, b)) return background;
    return a ?? b ?? background;
  };
  if (active) activeBackgrounds.add(at);
  return at;
}
/** Skip only portfolios known to contain no non-global measured sections.
 * Wrappers, provider objects and copied functions do not inherit this fact.
 * @param {unknown} value */
function hasRouteLocalBackground(value) { return typeof value === "function" && activeBackgrounds.has(value); }
module.exports = { sourceRouteLocalBackground, hasRouteLocalBackground };
