// @ts-check
"use strict";

/** @typedef {{r: number, g: number, b: number}} Color */
/** @typedef {{width: number, height: number, rgba: Uint8Array}} Raster */
/** @typedef {{axis: number, start: number, end: number, colors: Color[]}} Run */
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }

/** @param {unknown} input */
function parse(input) {
  if (!record(input) || !record(input.image) || !record(input.color)) throw new TypeError("Invalid axis ink fit input");
  const { width, height, rgba } = input.image;
  const { r, g, b } = input.color;
  const { vertical, expected, start, length, window } = input;
  if (!finite(width) || !finite(height) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 40000000
    || !(rgba instanceof Uint8Array) || rgba.length !== width * height * 4
    || !finite(r) || !finite(g) || !finite(b) || [r, g, b].some(v => v < 0 || v > 255)
    || typeof vertical !== "boolean" || !finite(expected) || !finite(start) || !finite(length) || !finite(window)
    || start < 0 || length <= 0 || window < 0 || window > 64
    || expected < 0 || expected >= (vertical ? width : height)
    || start + length > (vertical ? height : width)) throw new TypeError("Invalid axis ink fit geometry");
  return { image: { width, height, rgba }, color: { r, g, b }, vertical, expected, start, length, window };
}

/** @param {Color} actual @param {Color} expected */
function chromaticMatch(actual, expected) {
  const a = [actual.r, actual.g, actual.b], e = [expected.r, expected.g, expected.b];
  const amin = Math.min(...a), emin = Math.min(...e);
  const arange = Math.max(...a) - amin, erange = Math.max(...e) - emin;
  return arange >= Math.max(40, erange) && erange >= 40
    && a.every((channel, i) => Math.abs((channel - amin) / arange - ((e[i] ?? 0) - emin) / erange) <= 0.12);
}

/** @param {Raster} image @param {boolean} vertical @param {number} axis @param {number} along @returns {Color | null} */
function colorAt(image, vertical, axis, along) {
  const x = vertical ? axis : along, y = vertical ? along : axis;
  const offset = (y * image.width + x) * 4;
  const r = image.rgba[offset], g = image.rgba[offset + 1], b = image.rgba[offset + 2], a = image.rgba[offset + 3];
  return r === undefined || g === undefined || b === undefined || a === undefined || a < 64 ? null : { r, g, b };
}

/**
 * Find a shorter displaced chromatic shaft, not a guessed full-length line.
 * Gray ink and competing parallel runs deliberately provide no usable fit.
 * @param {unknown} input
 */
function fitSourceAxisInk(input) {
  const { image, color, vertical, expected, start, length, window } = parse(input);
  const first = Math.max(0, Math.floor(expected - window));
  const last = Math.min((vertical ? image.width : image.height) - 1, Math.ceil(expected + window));
  const padding = Math.min(24, Math.max(3, Math.round(Math.max(image.width, image.height) * 0.01)));
  const from = Math.max(0, Math.floor(start) - padding);
  const to = Math.min((vertical ? image.height : image.width) - 1, Math.ceil(start + length) - 1 + padding);
  let samples = (last - first + 1) * (to - from + 1);
  if (samples + last - first + 1 > 262144 || Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b) < 40) {
    return { fit: null, samples: 0 };
  }
  const minimumLength = Math.max(24, length * 0.15);
  /** @type {Run[]} */
  const runs = [];
  for (let axis = first; axis <= last; axis++) {
    let runStart = -1;
    /** @type {Color[]} */
    let colors = [];
    for (let along = from; along <= to + 1; along++) {
      const actual = along <= to ? colorAt(image, vertical, axis, along) : null;
      if (actual && chromaticMatch(actual, color)) {
        if (runStart < 0) runStart = along;
        if (colors.length < 256) colors.push(actual);
      } else if (runStart >= 0) {
        if (along - runStart >= minimumLength) runs.push({ axis, start: runStart, end: along - 1, colors });
        runStart = -1; colors = [];
      }
    }
  }
  runs.sort((a, b) => (b.end - b.start) - (a.end - a.start) || Math.abs(a.axis - expected) - Math.abs(b.axis - expected));
  const best = runs[0];
  if (!best) return { fit: null, samples };
  const midpoint = Math.floor((best.start + best.end) / 2);
  let low = best.axis, high = best.axis;
  for (const direction of [-1, 1]) {
    let axis = best.axis + direction;
    while (axis >= first && axis <= last) {
      samples++;
      const actual = colorAt(image, vertical, axis, midpoint);
      if (!actual || !chromaticMatch(actual, color)) break;
      if (direction < 0) low = axis; else high = axis;
      axis += direction;
    }
  }
  const thicknessPx = high - low + 1;
  if (thicknessPx > 16 || thicknessPx > (best.end - best.start + 1) * 0.2
    || runs.some(run => (run.axis < low - 2 || run.axis > high + 2)
      && run.end - run.start >= (best.end - best.start) * 0.92)) return { fit: null, samples };
  const count = best.colors.length;
  const mean = { r: 0, g: 0, b: 0 };
  for (const value of best.colors) { mean.r += value.r; mean.g += value.g; mean.b += value.b; }
  mean.r /= count; mean.g /= count; mean.b /= count;
  return { fit: { coordinate: (low + high) / 2, start: best.start, length: best.end - best.start + 1, thicknessPx, color: mean }, samples };
}

module.exports = { fitSourceAxisInk };
