"use strict";
// @ts-check

/** @typedef {{ width: number, height: number, rgba: Uint8Array }} SourceImage */
const MAX_PIXELS = 40_000_000;
const MAX_DIMENSION = 16_384;
const MAX_NODES = 128;
const MAX_SHAPES = 10_000;
const MAX_SAMPLES = 20_000_000;
const MIN_SUPPORT = 0.8;

/**
 * Fits independently proposed native node borders to their nearby source pixels.
 * This deliberately accepts only four-sided, source-backed rectangles.
 * @param {unknown} request
 * @returns {{shapes: unknown[], evidence: {accepted: number, candidates: number, samples: number, nodes: Array<{index: number, accepted: boolean, sides?: Record<string, {coordinate: number, support: number}>}>}}}
 */
function fitSourceBorders(request) {
  if (!isRecord(request)) throw new TypeError("Invalid source border fit request");
  /** @type {Record<string, unknown>} */ const input = request;
  const image = parseImage(input.image);
  const slideSize = parseSlideSize(input.slideSize);
  if (!Array.isArray(input.shapes)) throw new TypeError("Invalid source border fit shapes");
  if (input.shapes.length > MAX_SHAPES) throw new RangeError("Too many source border fit shapes");
  /** @type {unknown[]} */ const shapes = input.shapes.slice();
  const state = { samples: 0 };
  const nodes = [];
  let candidates = 0;
  let accepted = 0;
  for (let index = 0; index < shapes.length; index += 1) {
    const shape = shapes[index];
    if (!isCandidate(shape)) continue;
    candidates += 1;
    if (candidates > MAX_NODES) throw new RangeError("Too many source border fit nodes");
    const fit = fitOne(shape, image, slideSize, state);
    if (!fit) { nodes.push({ index, accepted: false }); continue; }
    const next = { ...shape, box: fit.box };
    shapes[index] = next;
    accepted += 1;
    nodes.push({ index, accepted: true, sides: fit.sides });
  }
  return { shapes, evidence: { accepted, candidates, samples: state.samples, nodes } };
}

/** @param {Record<string, unknown>} shape @param {SourceImage} image @param {{width:number,height:number}} slide @param {{samples:number}} state */
function fitOne(shape, image, slide, state) {
  const box = parseBox(shape.box);
  const style = isRecord(shape.style) ? shape.style : null;
  const color = parseColor(style ? style.stroke : undefined);
  if (!isZeroRotation(style ? style.rotationDeg : undefined) || !isZeroRotation(style ? style.rotation : undefined) || !isZeroRotation(shape.rotationDeg) || !isZeroRotation(shape.rotation)) return null;
  if (!box || !color) return null;
  if (box.x < 0 || box.y < 0 || box.x + box.w > slide.width || box.y + box.h > slide.height) return null;
  const sx = image.width / slide.width; const sy = image.height / slide.height;
  const pixel = { x: box.x * sx, y: box.y * sy, w: box.w * sx, h: box.h * sy };
  if (![pixel.x, pixel.y, pixel.w, pixel.h].every(Number.isFinite) || pixel.x < 0 || pixel.y < 0 || pixel.x + pixel.w > image.width || pixel.y + pixel.h > image.height || pixel.w < 1 || pixel.h < 1) return null;
  const window = Math.max(2, Math.min(32, Math.round(Math.max(pixel.w, pixel.h) * 0.18), 24));
  const sides = /** @type {Array<[string, boolean, number, number, number]>} */ ([
    ["left", true, pixel.x, pixel.y, pixel.h], ["right", true, pixel.x + pixel.w, pixel.y, pixel.h],
    ["top", false, pixel.y, pixel.x, pixel.w], ["bottom", false, pixel.y + pixel.h, pixel.x, pixel.w]
  ]).map(([name, vertical, expected, start, length]) => findSide(name, vertical, expected, start, length, window, color, image, state));
  if (sides.some((side) => !side || side.support < MIN_SUPPORT)) return null;
  const found = /** @type {[{name:string,coordinate:number,support:number},{name:string,coordinate:number,support:number},{name:string,coordinate:number,support:number},{name:string,coordinate:number,support:number}]} */ (sides);
  const [leftSide, rightSide, topSide, bottomSide] = found;
  const left = leftSide.coordinate; const right = rightSide.coordinate;
  const top = topSide.coordinate; const bottom = bottomSide.coordinate;
  const fitted = { x: left / sx, y: top / sy, w: (right - left) / sx, h: (bottom - top) / sy };
  if (![fitted.x, fitted.y, fitted.w, fitted.h].every(Number.isFinite) || fitted.w <= 0 || fitted.h <= 0 || box.x + box.w / 2 < fitted.x || box.x + box.w / 2 > fitted.x + fitted.w || box.y + box.h / 2 < fitted.y || box.y + box.h / 2 > fitted.y + fitted.h) return null;
  return { box: fitted, sides: Object.fromEntries(found.map((side) => [side.name, { coordinate: side.coordinate, support: side.support }])) };
}

/** @param {string} name @param {boolean} vertical @param {number} expected @param {number} start @param {number} length @param {number} window @param {[number, number, number]} color @param {SourceImage} image @param {{samples:number}} state */
function findSide(name, vertical, expected, start, length, window, color, image, state) {
  const from = Math.ceil(start + length * 0.2); const to = Math.floor(start + length * 0.8);
  if (to < from || to - from + 1 > 50_000) return null;
  /** @type {{name:string,coordinate:number,support:number}|null} */ let best = null;
  for (let at = Math.round(expected) - window; at <= Math.round(expected) + window; at += 1) {
    let run = 0; let misses = 0; let longestRun = 0; let hits = 0; let total = 0;
    for (let along = from; along <= to; along += 1) {
      if (++state.samples > MAX_SAMPLES) throw new RangeError("Source border fit sampling limit exceeded");
      const x = vertical ? at : along; const y = vertical ? along : at;
      total += 1;
      if (isEdgePixel(image, x, y, vertical, color)) { hits += 1; run += misses + 1; misses = 0; longestRun = Math.max(longestRun, run); }
      else { misses += 1; if (misses > 2) { run = 0; misses = 0; } }
    }
    const support = Math.min(hits / Math.max(1, total), longestRun / Math.max(1, total));
    if (!best || support > best.support || (support === best.support && Math.abs(at - expected) < Math.abs(best.coordinate - expected))) best = { name, coordinate: at, support };
  }
  return best;
}

/** @param {SourceImage} image @param {number} x @param {number} y @param {boolean} vertical @param {[number, number, number]} color */
function isEdgePixel(image, x, y, vertical, color) {
  if (!matches(image, x, y, color)) return false;
  const dx = vertical ? 3 : 0; const dy = vertical ? 0 : 3;
  // A hollow border has contrast on both normal sides. Requiring both prevents a
  // solid same-colour panel from being mistaken for its outside perimeter.
  return !matches(image, x + dx, y + dy, color) && !matches(image, x - dx, y - dy, color);
}
/** @param {SourceImage} image @param {number} x @param {number} y @param {[number, number, number]} color */
function matches(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
  const offset = (Math.floor(y) * image.width + Math.floor(x)) * 4;
  if ((image.rgba[offset + 3] ?? 0) < 128) return false;
  const distance = Math.hypot(color[0] - (image.rgba[offset] ?? 0), color[1] - (image.rgba[offset + 1] ?? 0), color[2] - (image.rgba[offset + 2] ?? 0));
  return distance < 110;
}
/** @param {unknown} value @returns {SourceImage} */
function parseImage(value) {
  /** @type {Record<string, unknown>} */ const source = isRecord(value) ? value : throwInvalidImage();
  const width = source.width; const height = source.height; const rgba = source.rgba;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS || !(rgba instanceof Uint8Array) || rgba.length !== width * height * 4) throw new TypeError("Invalid source border fit image");
  return { width, height, rgba };
}
/** @param {unknown} value */
function parseSlideSize(value) {
  /** @type {Record<string, unknown>} */ const size = isRecord(value) ? value : throwInvalidSlideSize();
  const width = numberField(size, "width") ?? numberField(size, "widthPt"); const height = numberField(size, "height") ?? numberField(size, "heightPt");
  if (!width || !height || width < 0.000001 || height < 0.000001) throw new TypeError("Invalid source border fit slide size"); return { width, height };
}
/** @param {unknown} value */
function parseBox(value) { if (!isRecord(value)) return null; const x = numberField(value, "x"); const y = numberField(value, "y"); const w = numberField(value, "w"); const h = numberField(value, "h"); return x === undefined || y === undefined || !w || !h || w <= 0 || h <= 0 ? null : { x, y, w, h }; }
/** @param {unknown} value */
/** @param {unknown} value @returns {[number, number, number]|null} */
function parseColor(value) { if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return null; return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)]; }
/** @param {unknown} value @returns {value is Record<string, unknown>} */ function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
/** @param {Record<string, unknown>} value @param {string} key */ function numberField(value, key) { const result = value[key]; return typeof result === "number" && Number.isFinite(result) ? result : undefined; }
/** @param {unknown} value */ function isZeroRotation(value) { return value === undefined || (typeof value === "number" && Number.isFinite(value) && value === 0); }
/** @param {unknown} value @returns {value is Record<string, unknown>} */ function isCandidate(value) { return isRecord(value) && (value.type === "roundRect" || value.type === "rect") && isRecord(value.source) && value.source.nativeComponentRole === "node" && value.source.semanticNativeStructure === true; }
/** @returns {never} */ function throwInvalidImage() { throw new TypeError("Invalid source border fit image"); }
/** @returns {never} */ function throwInvalidSlideSize() { throw new TypeError("Invalid source border fit slide size"); }

module.exports = { fitSourceBorders };
