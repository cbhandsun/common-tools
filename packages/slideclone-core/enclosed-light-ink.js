// @ts-check
"use strict";
const { types } = require("node:util");
const { squaredSourceStrokeDistances } = require("./source-stroke-distance");
/** @typedef {{width:number,height:number,rgba:Uint8Array}} SampleGrid */
/** @param {number[]} color */
const luminance = color => (color[0] ?? 0) * .2126 + (color[1] ?? 0) * .7152 + (color[2] ?? 0) * .0722;
/** @param {number[]} a @param {number[]} b @param {number} tolerance */
const near = (a, b, tolerance) => a.every((v, c) => Math.abs(v - (b[c] ?? 0)) <= tolerance);

/** Same 82% / 18 source-color evidence used for light OCR ink.
 * @param {number[][]} colors @returns {number[]|null} */
function uniformColor(colors) {
  if (colors.length < 12) return null;
  /** @type {Map<string,number[][]>} */ const bins = new Map();
  for (const color of colors) {
    const key = color.map(v => Math.floor(v / 32)).join(":");
    const bin = bins.get(key) ?? []; bin.push(color); bins.set(key, bin);
  }
  const dominant = [...bins.values()].sort((a, b) => b.length - a.length)[0];
  if (!dominant) return null;
  /** @param {number[][]} samples */
  const median = samples => [0, 1, 2].map(c => samples.map(p => p[c] ?? 0).sort((a, b) => a - b)[Math.floor(samples.length / 2)] ?? 0);
  let rgb = median(dominant);
  if (colors.filter(p => near(p, rgb, 18)).length / colors.length < .82) {
    rgb = median(colors);
    if (colors.filter(p => near(p, rgb, 18)).length / colors.length < .82) return null;
  }
  return rgb;
}

/** Antialias transitions are excluded from the independently uniform core,
 * exactly as in the original OCR light-ink measurement. The core must still
 * explain 58% of ALL contrasting observations below.
 * @param {number[][]} colors */
function coreColor(colors) {
  /** @type {Map<string,number[][]>} */ const bins = new Map();
  for (const p of colors) {
    const key = p.map(v => Math.floor(v / 32)).join(":");
    const bin = bins.get(key) ?? []; bin.push(p); bins.set(key, bin);
  }
  return uniformColor([...bins.values()].sort((a, b) => b.length - a.length)[0] ?? []);
}

/** Validate without executing accessors or accepting shared, resizable storage.
 * @param {unknown} input @returns {SampleGrid} */
function sampleGrid(input) {
  if (!input || typeof input !== "object" || types.isProxy(input) || Array.isArray(input)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(input))
    || Object.values(Object.getOwnPropertyDescriptors(input)).some(p => !("value" in p))) throw new TypeError("Ink sample grid is invalid");
  const value = /** @type {Record<string,unknown>} */ (input), { width, height, rgba } = value;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 262144
    || types.isProxy(rgba) || !types.isUint8Array(rgba)) throw new TypeError("Ink sample window is invalid");
  const proto = Object.getPrototypeOf(Uint8Array.prototype), buffer = Reflect.get(proto, "buffer", rgba);
  const length = Reflect.get(proto, "length", rgba), offset = Reflect.get(proto, "byteOffset", rgba);
  if (!types.isArrayBuffer(buffer) || Reflect.get(ArrayBuffer.prototype, "resizable", buffer) === true || length !== width * height * 4) throw new TypeError("Ink sample storage is invalid");
  return { width, height, rgba: new Uint8Array(buffer, offset, length) };
}

/** Identify enclosed light strokes in an ALREADY READ sampling grid. No source
 * reads, OCR classification, geometry changes or pixel ownership are granted.
 * Boundary-connected paper and wide counters are rejected. Stroke thickness
 * uses exact Euclidean distance; the independent six-cell surface ring and
 * core keep the original 82% / 18 / 58% / 42 color gates. Conflicting colors,
 * clipped rings and transparency retain the caller's original fallback.
 * @param {unknown} input @returns {string|null} */
function enclosedLightInkColor(input) {
  const { width, height, rgba } = sampleGrid(input), count = width * height;
  const mask = new Uint8Array(count), seen = new Uint8Array(count), queue = new Int32Array(count);
  /** @param {number} i */ const color = i => [rgba[i * 4] ?? 0, rgba[i * 4 + 1] ?? 0, rgba[i * 4 + 2] ?? 0];
  /** @param {number} i */
  const neighbors = i => { const x = i % width, y = Math.floor(i / width); return [x ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y ? i - width : -1, y < height - 1 ? i + width : -1]; };
  for (let i = 0; i < count; i++) if ((rgba[i * 4 + 3] ?? 0) >= 240 && luminance(color(i)) >= 220) mask[i] = 1;
  const strokeDistances = squaredSourceStrokeDistances({ width, height, mask });
  /** @type {number[][]} */ const candidates = [];
  for (let seed = 0; seed < count; seed++) {
    if (!mask[seed] || seen[seed]) continue;
    let head = 0, tail = 1, clipped = false, left = width, top = height, right = -1, bottom = -1, maxRadiusSquared = 0;
    queue[0] = seed; seen[seed] = 1;
    /** @type {number[][]} */ const inkSamples = [];
    while (head < tail) {
      const i = queue[head++] ?? 0, x = i % width, y = Math.floor(i / width);
      clipped ||= x === 0 || y === 0 || x === width - 1 || y === height - 1;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      maxRadiusSquared = Math.max(maxRadiusSquared, strokeDistances[i] ?? 0); inkSamples.push(color(i));
      for (const n of neighbors(i)) if (n >= 0 && mask[n] && !seen[n]) { seen[n] = 1; queue[tail++] = n; }
    }
    if (clipped || tail < 12 || maxRadiusSquared > (Math.min(right - left + 1, bottom - top + 1) / 4) ** 2) continue;
    const ink = coreColor(inkSamples); if (!ink) continue;
    const distance = new Int16Array(count).fill(-1); head = 0; let end = tail;
    for (let j = 0; j < tail; j++) distance[queue[j] ?? 0] = 0;
    /** @type {number[][]} */ const ring = [];
    let opaque = true;
    while (head < end) {
      const i = queue[head++] ?? 0, d = distance[i] ?? 0;
      if ((rgba[i * 4 + 3] ?? 0) < 240) opaque = false;
      if (d === 6) { ring.push(color(i)); continue; }
      for (const n of neighbors(i)) {
        if (n < 0) { clipped = true; continue; }
        if (distance[n] === -1) { distance[n] = d + 1; queue[end++] = n; }
      }
    }
    if (clipped || !opaque) continue;
    const background = uniformColor(ring);
    if (!background || luminance(ink) - luminance(background) < 42) continue;
    // A light mark beside real dark glyphs cannot recolor the whole OCR line.
    // Use the independently observed local surface, so the dark colored panel
    // itself is not confused with contrasting text. No new source reads.
    const darkSamples = [];
    for (let i = 0; i < count; i++) {
      const p = color(i);
      if ((rgba[i * 4 + 3] ?? 0) >= 240 && luminance(background) - luminance(p) >= 42) darkSamples.push(p);
    }
    if (coreColor(darkSamples)) continue;
    let contrasted = 0, supported = 0;
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const i = y * width + x, p = color(i);
      if ((rgba[i * 4 + 3] ?? 0) < 240) opaque = false;
      if (!near(p, background, 41)) { contrasted++; if (near(p, ink, 18)) supported++; }
    }
    if (opaque && contrasted >= 12 && supported / contrasted >= .58) candidates.push(ink);
  }
  if (!candidates.length || candidates.some(p => !near(p, candidates[0] ?? [], 18))) return null;
  const ink = uniformColor(candidates.flatMap(p => Array.from({ length: 12 }, () => p)));
  return ink ? `#${ink.map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase()}` : null;
}
module.exports = { enclosedLightInkColor };
