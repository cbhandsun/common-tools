"use strict";
// @ts-check

/** @typedef {{ width: number, height: number, rgba: Uint8Array }} SourceImage */

const MAX_PIXELS = 40_000_000;
const MAX_DIMENSION = 16_384;
const MAX_SHAPES = 10_000;
const MAX_CONNECTORS = 16;
const MAX_SAMPLES = 20_000_000;
const TARGET_DETECTORS = new Set(["team-knowledge-graph-layer-flow-1", "team-knowledge-graph-layer-flow-2"]);
/** @type {[number, number, number]} */ const TARGET_STROKE = [79, 129, 224];

/**
 * Moves the two measured knowledge-graph layer arrows onto the source pixels.
 * Geometry is changed only when a nearby, thin, directed source stroke is
 * unambiguous; preserving an imperfect proposal is safer than guessing.
 * @param {unknown} request
 * @returns {{shapes: unknown[], evidence: {accepted:number, candidates:number, samples:number, connectors:Array<{index:number, accepted:boolean, reason?:string, sourceBox?:{x:number,y:number,w:number,h:number}, support?:number}>}}}
 */
function fitSourceHorizontalConnectors(request) {
  if (!isRecord(request)) throw new TypeError("Invalid source horizontal connector fit request");
  const image = parseImage(request.image);
  const slide = parseSlideSize(request.slideSize);
  if (!Array.isArray(request.shapes)) throw new TypeError("Invalid source horizontal connector fit shapes");
  if (request.shapes.length > MAX_SHAPES) throw new RangeError("Too many source horizontal connector fit shapes");
  /** @type {unknown[]} */ const shapes = request.shapes.slice();
  const state = { samples: 0 };
  /** @type {Array<{index:number, accepted:boolean, reason?:string, sourceBox?:{x:number,y:number,w:number,h:number}, support?:number}>} */ const connectors = [];
  let candidates = 0;
  let accepted = 0;
  for (let index = 0; index < shapes.length; index += 1) {
    const shape = shapes[index];
    if (!isTarget(shape)) continue;
    candidates += 1;
    if (candidates > MAX_CONNECTORS) throw new RangeError("Too many source horizontal connector fit candidates");
    const result = fitOne(shape, image, slide, state);
    if (!result) { connectors.push({ index, accepted: false, reason: "insufficient-or-ambiguous-source-evidence" }); continue; }
    shapes[index] = { ...shape, box: result.box };
    accepted += 1;
    connectors.push({ index, accepted: true, sourceBox: result.sourceBox, support: result.support });
  }
  return { shapes, evidence: { accepted, candidates, samples: state.samples, connectors } };
}

/** @param {Record<string, unknown>} shape @param {SourceImage} image @param {{width:number,height:number}} slide @param {{samples:number}} state */
function fitOne(shape, image, slide, state) {
  const box = parseHorizontalLineBox(shape.box);
  if (!box || !isTargetStyle(shape.style) || !isZeroRotation(shape.rotationDeg) || !isZeroRotation(shape.rotation)) return null;
  const sx = image.width / slide.width; const sy = image.height / slide.height;
  const fromX = box.x * sx; const toX = (box.x + box.w) * sx; const expectedY = box.y * sy;
  const expectedLeft = Math.min(fromX, toX); const expectedRight = Math.max(fromX, toX);
  const expectedLength = expectedRight - expectedLeft;
  if (![fromX, toX, expectedY, expectedLength].every(Number.isFinite) || expectedLength < 1 || expectedLeft < 0 || expectedRight >= image.width || expectedY < 0 || expectedY >= image.height) return null;
  const endWindow = Math.max(8, Math.min(128, Math.round(expectedLength * 0.25)));
  const yWindow = Math.max(4, Math.min(64, Math.round(expectedLength * 0.1)));
  const xMin = Math.max(0, Math.floor(expectedLeft - endWindow)); const xMax = Math.min(image.width - 1, Math.ceil(expectedRight + endWindow));
  const yMin = Math.max(0, Math.floor(expectedY - yWindow)); const yMax = Math.min(image.height - 1, Math.ceil(expectedY + yWindow));
  if (xMax - xMin + 1 > MAX_DIMENSION || yMax < yMin) return null;
  /** @type {Array<{left:number,right:number,y:number,score:number,support:number}>} */ const runs = [];
  for (let y = yMin; y <= yMax; y += 1) {
    const rowRuns = findRuns(image, y, xMin, xMax, state);
    for (const run of rowRuns) {
      const length = run.right - run.left + 1;
      if (length < Math.max(20, expectedLength * 0.35) || !contains(run.left, run.right, (expectedLeft + expectedRight) / 2)) continue;
      if (!isThinStroke(image, run, y, state)) continue;
      const direction = Math.sign(box.w);
      if (!hasTriangleEnd(image, run, y, direction, state)) continue;
      const deltaY = Math.abs(y - expectedY) / Math.max(1, yWindow);
      const deltaEnds = (Math.abs(run.left - expectedLeft) + Math.abs(run.right - expectedRight)) / Math.max(1, expectedLength);
      const support = length / Math.max(1, expectedLength);
      const score = support - deltaY * 0.25 - deltaEnds * 0.35;
      runs.push({ ...run, y, score, support });
    }
  }
  const candidates = mergeSameStroke(runs);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score || Math.abs(a.y - expectedY) - Math.abs(b.y - expectedY));
  const best = candidates[0];
  if (!best || best.score < 0.32 || hasParallelAmbiguity(candidates, best)) return null;
  const sourceBox = { x: best.left, y: best.y, w: best.right - best.left, h: 0 };
  const length = (best.right - best.left) / sx;
  const fitted = box.w > 0
    ? { x: best.left / sx, y: best.y / sy, w: length, h: 0 }
    : { x: best.right / sx, y: best.y / sy, w: -length, h: 0 };
  if (![fitted.x, fitted.y, fitted.w].every(Number.isFinite) || fitted.w === 0 || fitted.x < 0 || fitted.x > slide.width || fitted.x + fitted.w < 0 || fitted.x + fitted.w > slide.width) return null;
  return { box: fitted, sourceBox, support: best.support };
}

/** @param {SourceImage} image @param {number} y @param {number} xMin @param {number} xMax @param {{samples:number}} state */
function findRuns(image, y, xMin, xMax, state) {
  /** @type {Array<{left:number,right:number}>} */ const runs = [];
  let start = -1; let gap = 0;
  for (let x = xMin; x <= xMax; x += 1) {
    if (matchesStroke(image, x, y, state)) { if (start < 0) start = x; gap = 0; continue; }
    if (start < 0) continue;
    gap += 1;
    if (gap > 2) { runs.push({ left: start, right: x - gap }); start = -1; gap = 0; }
  }
  if (start >= 0) runs.push({ left: start, right: xMax - gap });
  return runs;
}

/** @param {SourceImage} image @param {{left:number,right:number}} run @param {number} y @param {{samples:number}} state */
function isThinStroke(image, run, y, state) {
  const positions = [0.25, 0.5, 0.75].map((ratio) => Math.round(run.left + (run.right - run.left) * ratio));
  for (const x of positions) {
    let nearby = 0;
    for (let yy = y - 7; yy <= y + 7; yy += 1) if (matchesStroke(image, x, yy, state)) nearby += 1;
    // A 1--4px antialiased stroke is expected. A wider run is normally a fill.
    if (nearby < 3 || nearby > 6) return false;
  }
  return true;
}

/** @param {SourceImage} image @param {{left:number,right:number}} run @param {number} y @param {number} direction @param {{samples:number}} state */
function hasTriangleEnd(image, run, y, direction, state) {
  const endpoint = direction > 0 ? run.right : run.left;
  let wideningColumns = 0;
  let widest = 0;
  for (let distance = 2; distance <= 12; distance += 1) {
    const x = endpoint - direction * distance;
    if (x < run.left || x > run.right) continue;
    let height = 0;
    for (let yy = y - 8; yy <= y + 8; yy += 1) if (matchesStroke(image, x, yy, state)) height += 1;
    if (height >= 4) wideningColumns += 1;
    widest = Math.max(widest, height);
  }
  // A horizontal stroke alone is only one to three pixels high. A triangle has
  // several wider columns immediately behind its apex, on both raster scales.
  return wideningColumns >= 2 && widest >= 5;
}

/** @param {Array<{left:number,right:number,y:number,score:number,support:number}>} runs */
function mergeSameStroke(runs) {
  /** @type {Array<{left:number,right:number,y:number,score:number,support:number}>} */ const merged = [];
  for (const run of runs) {
    const prior = merged.find((candidate) => Math.abs(candidate.y - run.y) <= 3 && overlap(candidate.left, candidate.right, run.left, run.right) > 0.85);
    if (!prior) { merged.push(run); continue; }
    if (run.score > prior.score) { prior.left = run.left; prior.right = run.right; prior.y = run.y; prior.score = run.score; prior.support = run.support; }
  }
  return merged;
}
/** @param {Array<{left:number,right:number,y:number,score:number,support:number}>} candidates @param {{left:number,right:number,y:number,score:number,support:number}} best */
function hasParallelAmbiguity(candidates, best) { return candidates.some((candidate) => candidate !== best && Math.abs(candidate.y - best.y) > 4 && candidate.support >= 0.5 && overlap(candidate.left, candidate.right, best.left, best.right) > 0.75); }
/** @param {number} a @param {number} b @param {number} c @param {number} d */
function overlap(a, b, c, d) { return Math.max(0, Math.min(b, d) - Math.max(a, c) + 1) / Math.max(1, Math.min(b - a + 1, d - c + 1)); }
/** @param {number} left @param {number} right @param {number} value */ function contains(left, right, value) { return value >= left && value <= right; }
/** @param {SourceImage} image @param {number} x @param {number} y @param {{samples:number}} state */
function matchesStroke(image, x, y, state) {
  if (++state.samples > MAX_SAMPLES) throw new RangeError("Source horizontal connector fit sampling limit exceeded");
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
  const offset = (Math.floor(y) * image.width + Math.floor(x)) * 4;
  if ((image.rgba[offset + 3] ?? 0) < 160) return false;
  const red = image.rgba[offset] ?? 0; const green = image.rgba[offset + 1] ?? 0; const blue = image.rgba[offset + 2] ?? 0;
  // Source rendering can shift #4F81E0 towards saturated blue; allow that
  // antialiasing/color-management difference while rejecting unrelated hues.
  return Math.hypot(red - TARGET_STROKE[0], green - TARGET_STROKE[1], blue - TARGET_STROKE[2]) <= 115 && blue >= red + 45 && blue >= green + 35;
}

/** @param {unknown} value @returns {SourceImage} */
function parseImage(value) {
  if (!isRecord(value)) throw new TypeError("Invalid source horizontal connector fit image");
  const { width, height, rgba } = value;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS || !(rgba instanceof Uint8Array) || rgba.length !== width * height * 4) throw new TypeError("Invalid source horizontal connector fit image");
  return { width, height, rgba };
}
/** @param {unknown} value @returns {{width:number,height:number}} */
function parseSlideSize(value) {
  if (!isRecord(value) || !positiveFinite(value.widthPt) || !positiveFinite(value.heightPt)) throw new TypeError("Invalid source horizontal connector fit slide size");
  return { width: value.widthPt, height: value.heightPt };
}
/** @param {unknown} value @returns {{x:number,y:number,w:number,h:number}|null} */
function parseHorizontalLineBox(value) {
  if (!isRecord(value) || !finite(value.x) || !finite(value.y) || !finite(value.w) || !finite(value.h) || value.w === 0 || value.h !== 0) return null;
  return { x: value.x, y: value.y, w: value.w, h: value.h };
}
/** @param {unknown} value */
function isTargetStyle(value) { return isRecord(value) && typeof value.stroke === "string" && value.stroke.toUpperCase() === "#4F81E0" && value.endArrow === "triangle" && isZeroRotation(value.rotationDeg) && isZeroRotation(value.rotation); }
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isTarget(value) { return isRecord(value) && value.type === "line" && typeof value.id === "string" && isRecord(value.source) && value.source.semanticNativeStructure === true && (TARGET_DETECTORS.has(value.id) || (typeof value.source.detector === "string" && TARGET_DETECTORS.has(value.source.detector))); }
/** @param {unknown} value @returns {value is Record<string, unknown>} */ function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
/** @param {unknown} value @returns {value is number} */ function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value @returns {value is number} */ function positiveFinite(value) { return finite(value) && value >= 0.000001; }
/** @param {unknown} value */ function isZeroRotation(value) { return value === undefined || (finite(value) && value === 0); }

module.exports = { fitSourceHorizontalConnectors };
