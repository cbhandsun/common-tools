// @ts-check
"use strict";
const { fitSourceBorders } = require("./source-border-fit");

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{left:number,right:number,top:number,bottom:number}} Border */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
const PREFIX = "team-knowledge-graph-";
const MAX_SAMPLES = 5_000_000;
const MIN_TOLERANT_SUPPORT = 0.82;
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @returns {value is Box} */
function box(value) { return record(value) && [value.x, value.y, value.w, value.h].every(v => typeof v === "number" && Number.isFinite(v)) && typeof value.w === "number" && value.w > 0 && typeof value.h === "number" && value.h > 0; }
/** @param {unknown} value @returns {value is Box} */
function lineBox(value) { return record(value) && [value.x, value.y, value.w, value.h].every(v => typeof v === "number" && Number.isFinite(v)) && typeof value.w === "number" && typeof value.h === "number" && (value.w !== 0 || value.h !== 0); }
/** @param {unknown} value @returns {value is Record<string,unknown> & {id:string,box:Box}} */
function knowledgeGraphNode(value) {
  return record(value) && typeof value.id === "string" && /^team-knowledge-graph-node-(?:[1-9]|[1-9][0-9])$/.test(value.id) && (value.type === "roundRect" || value.type === "rect") && box(value.box)
    && record(value.source) && value.source.semanticNativeStructure === true && record(value.style) && value.style.rotationDeg === undefined && typeof value.style.stroke === "string" && value.style.stroke !== "none" && value.style.fill === "#FFFFFF";
}
/** @param {Box} value */
function center(value) { return { x: value.x + value.w / 2, y: value.y + value.h / 2 }; }
/** @param {Box} value @param {{x:number,y:number}} target */
function pointOnBoxToward(value, target) {
  const origin = center(value); const dx = target.x - origin.x; const dy = target.y - origin.y;
  if (dx === 0 && dy === 0) return origin;
  const scale = 1 / Math.max(Math.abs(dx) / (value.w / 2), Math.abs(dy) / (value.h / 2));
  return { x: origin.x + dx * scale, y: origin.y + dy * scale };
}
/** @param {{x:number,y:number}} point @param {Box} value */
function distanceToBox(point, value) {
  const dx = Math.max(value.x - point.x, 0, point.x - (value.x + value.w));
  const dy = Math.max(value.y - point.y, 0, point.y - (value.y + value.h));
  return Math.hypot(dx, dy);
}
/** @param {unknown} value @returns {[number,number,number]|null} */
function color(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value)
    ? [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)]
    : null;
}

/** Fit source-backed knowledge-graph nodes and update their incident straight connectors.
 * @param {unknown} input
 * @returns {{shapes:unknown[],borders:Border[],evidence:{accepted:number,candidates:number,samples:number}}}
 */
function fitKnowledgeGraphGrayNodes(input) {
  if (!record(input) || !Array.isArray(input.shapes) || input.shapes.length > 10000 || !record(input.slideSize)) throw new TypeError("gray node fit input is invalid");
  /** @type {unknown[]} */ const shapes = input.shapes.slice();
  const candidates = shapes.filter(knowledgeGraphNode);
  if (new Set(candidates.map(s => s.id)).size !== candidates.length) throw new TypeError("gray node fit ids are ambiguous");
  const incidentIds = new Set();
  for (const shape of shapes) {
    if (!record(shape) || typeof shape.id !== "string" || !/^team-knowledge-graph-(?:node-(?:[1-9]|[1-9][0-9])|translator-hub|right-work-high|right-work-target)$/.test(shape.id)) continue;
    if (incidentIds.has(shape.id)) throw new TypeError("gray node fit ids are ambiguous");
    incidentIds.add(shape.id);
  }
  const proposed = candidates.map(s => ({ ...s, source: { ...(record(s.source) ? s.source : {}), nativeComponentRole: "node" } }));
  const result = fitSourceBorders({ shapes: proposed, image: input.image, slideSize: { width: input.slideSize.widthPt, height: input.slideSize.heightPt } });
  /** @type {Border[]} */ const borders = [];
  const changed = new Set();
  const beforeById = new Map(candidates.map(s => [s.id, s.box]));
  const acceptedCandidateIndexes = new Set();
  for (const evidence of result.evidence.nodes) {
    if (!evidence.accepted) continue;
    const original = candidates[evidence.index], fitted = result.shapes[evidence.index], sides = evidence.sides;
    if (!original || !record(fitted) || !box(fitted.box) || !sides?.left || !sides.right || !sides.top || !sides.bottom) throw new Error("gray node fit result is invalid");
    shapes[shapes.indexOf(original)] = { ...original, box: fitted.box };
    changed.add(original.id);
    acceptedCandidateIndexes.add(evidence.index);
    borders.push({ left: sides.left.coordinate, right: sides.right.coordinate, top: sides.top.coordinate, bottom: sides.bottom.coordinate });
  }
  const tolerant = { samples: 0 };
  for (let index = 0; index < candidates.length; index += 1) {
    if (acceptedCandidateIndexes.has(index)) continue;
    const original = candidates[index];
    if (!original) throw new Error("gray node fit candidate is missing");
    const fitted = fitTolerantKnowledgeGraphNode(original, input.image, input.slideSize, tolerant);
    if (!fitted) continue;
    shapes[shapes.indexOf(original)] = { ...original, box: fitted.box };
    changed.add(original.id);
    borders.push(fitted.border);
  }
  /** @param {number} index @returns {Box | null} */
  const node = index => { const shape = shapes.find(s => record(s) && s.id === `${PREFIX}node-${index}`); return record(shape) && box(shape.box) ? shape.box : null; };
  /** @param {string} name @param {number} fromId @param {number} toId @param {"vertical"|"horizontal"} direction */
  function reconnect(name, fromId, toId, direction) {
    if (!changed.has(`${PREFIX}node-${fromId}`) && !changed.has(`${PREFIX}node-${toId}`)) return;
    const from = node(fromId), to = node(toId);
    const index = shapes.findIndex(s => record(s) && s.id === `${PREFIX}${name}`);
    const shape = shapes[index];
    if (!from || !to || !record(shape) || shape.type !== "line" || !record(shape.source) || shape.source.semanticNativeStructure !== true) return;
    const a = center(from), b = center(to);
    if (direction === "horizontal") { a.x = from.x + from.w; b.x = to.x; }
    else if (b.y > a.y) { a.y = from.y + from.h; b.y = to.y; }
    else { a.y = from.y; b.y = to.y + to.h; }
    shapes[index] = { ...shape, box: { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y } };
  }
  reconnect("translator-hub", 2, 1, "vertical");
  reconnect("right-work-high", 4, 3, "vertical");
  reconnect("right-work-target", 4, 5, "horizontal");
  reconnectSemanticKnowledgeGraphLines();
  return { shapes, borders, evidence: { accepted: borders.length, candidates: result.evidence.candidates, samples: result.evidence.samples + tolerant.samples } };

  function reconnectSemanticKnowledgeGraphLines() {
    if (!changed.size) return;
    const nodes = [];
    for (const item of shapes) {
      if (!record(item) || typeof item.id !== "string" || !item.id.startsWith(`${PREFIX}node-`) || !box(item.box)) continue;
      nodes.push({ id: item.id, before: beforeById.get(item.id) || item.box, after: item.box });
    }
    if (!nodes.length) return;
    for (let index = 0; index < shapes.length; index += 1) {
      const shape = shapes[index];
      if (!record(shape) || shape.type !== "line" || !lineBox(shape.box) || !record(shape.source) || shape.source.semanticNativeStructure !== true) continue;
      const id = typeof shape.id === "string" ? shape.id : "";
      const detector = typeof shape.source.detector === "string" ? shape.source.detector : "";
      if (!id.startsWith(PREFIX) && !detector.startsWith(PREFIX)) continue;
      const start = { x: shape.box.x, y: shape.box.y };
      const end = { x: shape.box.x + shape.box.w, y: shape.box.y + shape.box.h };
      const nextStart = reconnectEndpoint(start, end, nodes);
      const nextEnd = reconnectEndpoint(end, start, nodes);
      if (nextStart === start && nextEnd === end) continue;
      shapes[index] = { ...shape, box: { x: nextStart.x, y: nextStart.y, w: nextEnd.x - nextStart.x, h: nextEnd.y - nextStart.y } };
    }
  }

  /** @param {{x:number,y:number}} point @param {{x:number,y:number}} other @param {{id:string,before:Box,after:Box}[]} nodes */
  function reconnectEndpoint(point, other, nodes) {
    let best = null;
    for (const candidate of nodes) {
      if (!changed.has(candidate.id)) continue;
      const distance = distanceToBox(point, candidate.before);
      const tolerance = Math.max(10, Math.min(24, Math.max(candidate.before.w, candidate.before.h) * 0.3));
      if (distance > tolerance) continue;
      if (!best || distance < best.distance) best = { distance, node: candidate };
    }
    return best ? pointOnBoxToward(best.node.after, other) : point;
  }
}

/** @param {Record<string,unknown> & {id:string,box:Box}} shape @param {unknown} image @param {unknown} slideSize @param {{samples:number}} state */
function fitTolerantKnowledgeGraphNode(shape, image, slideSize, state) {
  if (!record(image) || typeof image.width !== "number" || typeof image.height !== "number"
    || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1
    || image.width > 16384 || image.height > 16384 || image.width * image.height > 40_000_000
    || !(image.rgba instanceof Uint8Array) || image.rgba.length !== image.width * image.height * 4) return null;
  if (!record(slideSize) || typeof slideSize.widthPt !== "number" || typeof slideSize.heightPt !== "number"
    || !Number.isFinite(slideSize.widthPt) || !Number.isFinite(slideSize.heightPt) || slideSize.widthPt <= 0 || slideSize.heightPt <= 0) return null;
  const raster = { width: image.width, height: image.height, rgba: image.rgba };
  const stroke = color(record(shape.style) ? shape.style.stroke : null);
  if (!stroke) return null;
  const sx = image.width / slideSize.widthPt; const sy = image.height / slideSize.heightPt;
  const pixel = { x: shape.box.x * sx, y: shape.box.y * sy, w: shape.box.w * sx, h: shape.box.h * sy };
  if (![pixel.x, pixel.y, pixel.w, pixel.h].every(Number.isFinite) || pixel.w < 16 || pixel.h < 12) return null;
  const window = Math.max(28, Math.min(72, Math.round(Math.max(pixel.w, pixel.h) * 0.3)));
  const sides = [
    tolerantSide("left", true, pixel.x, pixel.y, pixel.h, window, stroke, raster, state),
    tolerantSide("right", true, pixel.x + pixel.w, pixel.y, pixel.h, window, stroke, raster, state),
    tolerantSide("top", false, pixel.y, pixel.x, pixel.w, window, stroke, raster, state),
    tolerantSide("bottom", false, pixel.y + pixel.h, pixel.x, pixel.w, window, stroke, raster, state)
  ];
  const [leftSide, rightSide, topSide, bottomSide] = sides;
  if (!leftSide || !rightSide || !topSide || !bottomSide) return null;
  if (sides.some(side => !side || side.support < MIN_TOLERANT_SUPPORT)) return null;
  const left = leftSide.coordinate, right = rightSide.coordinate, top = topSide.coordinate, bottom = bottomSide.coordinate;
  const fitted = { x: left / sx, y: top / sy, w: (right - left) / sx, h: (bottom - top) / sy };
  const centerPoint = center(shape.box);
  if (fitted.w <= 0 || fitted.h <= 0 || centerPoint.x < fitted.x || centerPoint.x > fitted.x + fitted.w || centerPoint.y < fitted.y || centerPoint.y > fitted.y + fitted.h) return null;
  if (fitted.w < shape.box.w * 0.55 || fitted.w > shape.box.w * 1.65 || fitted.h < shape.box.h * 0.55 || fitted.h > shape.box.h * 1.85) return null;
  return { box: fitted, border: { left, right, top, bottom } };
}

/** @param {string} name @param {boolean} vertical @param {number} expected @param {number} start @param {number} length @param {number} window @param {[number,number,number]} stroke @param {Raster} image @param {{samples:number}} state */
function tolerantSide(name, vertical, expected, start, length, window, stroke, image, state) {
  const from = Math.max(0, Math.ceil(start + length * 0.08));
  const to = Math.min(vertical ? image.height - 1 : image.width - 1, Math.floor(start + length * 0.92));
  if (to <= from || to - from > 80_000) return null;
  let best = null;
  for (let at = Math.round(expected) - window; at <= Math.round(expected) + window; at += 1) {
    let hits = 0; let total = 0; let run = 0; let misses = 0; let longest = 0;
    for (let along = from; along <= to; along += 1) {
      if (++state.samples > MAX_SAMPLES) throw new RangeError("gray node fit sampling limit exceeded");
      total += 1;
      const x = vertical ? at : along; const y = vertical ? along : at;
      if (tolerantEdgePixel(image, x, y, vertical, stroke)) { hits += 1; run += misses + 1; misses = 0; longest = Math.max(longest, run); }
      else { misses += 1; if (misses > 4) { run = 0; misses = 0; } }
    }
    const support = Math.min(hits / Math.max(1, total), longest / Math.max(1, total));
    if (!best || support > best.support || (support === best.support && Math.abs(at - expected) < Math.abs(best.coordinate - expected))) best = { name, coordinate: at, support };
  }
  return best;
}

/** @param {Raster} image @param {number} x @param {number} y @param {boolean} vertical @param {[number,number,number]} stroke */
function tolerantEdgePixel(image, x, y, vertical, stroke) {
  if (!pixelMatches(image, x, y, stroke)) return false;
  const dx = vertical ? 3 : 0; const dy = vertical ? 0 : 3;
  return !pixelMatches(image, x + dx, y + dy, stroke) || !pixelMatches(image, x - dx, y - dy, stroke);
}

/** @param {Raster} image @param {number} x @param {number} y @param {[number,number,number]} stroke */
function pixelMatches(image, x, y, stroke) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
  const offset = (Math.floor(y) * image.width + Math.floor(x)) * 4;
  const rgba = image.rgba;
  if ((rgba[offset + 3] ?? 0) < 128) return false;
  return Math.hypot(stroke[0] - (rgba[offset] ?? 0), stroke[1] - (rgba[offset + 1] ?? 0), stroke[2] - (rgba[offset + 2] ?? 0)) < 120;
}

module.exports = { fitKnowledgeGraphGrayNodes };
