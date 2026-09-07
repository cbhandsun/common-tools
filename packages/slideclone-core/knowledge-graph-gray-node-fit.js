// @ts-check
"use strict";
const { fitSourceBorders } = require("./source-border-fit");

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{left:number,right:number,top:number,bottom:number}} Border */
const PREFIX = "team-knowledge-graph-";
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @returns {value is Box} */
function box(value) { return record(value) && [value.x, value.y, value.w, value.h].every(v => typeof v === "number" && Number.isFinite(v)) && typeof value.w === "number" && value.w > 0 && typeof value.h === "number" && value.h > 0; }
/** @param {unknown} value @returns {value is Record<string,unknown> & {id:string,box:Box}} */
function grayNode(value) {
  return record(value) && typeof value.id === "string" && /^team-knowledge-graph-node-[234]$/.test(value.id) && box(value.box)
    && record(value.source) && value.source.semanticNativeStructure === true && record(value.style) && value.style.stroke === "#A7A7A7" && value.style.fill === "#FFFFFF";
}
/** @param {Box} value */
function center(value) { return { x: value.x + value.w / 2, y: value.y + value.h / 2 }; }

/** Fit only the three known gray-node roles and update their incident straight connectors.
 * @param {unknown} input
 * @returns {{shapes:unknown[],borders:Border[],evidence:{accepted:number,candidates:number,samples:number}}}
 */
function fitKnowledgeGraphGrayNodes(input) {
  if (!record(input) || !Array.isArray(input.shapes) || input.shapes.length > 10000 || !record(input.slideSize)) throw new TypeError("gray node fit input is invalid");
  /** @type {unknown[]} */ const shapes = input.shapes.slice();
  const candidates = shapes.filter(grayNode);
  if (new Set(candidates.map(s => s.id)).size !== candidates.length) throw new TypeError("gray node fit ids are ambiguous");
  const incidentIds = new Set();
  for (const shape of shapes) {
    if (!record(shape) || typeof shape.id !== "string" || !/^team-knowledge-graph-(?:node-[1-5]|translator-hub|right-work-high|right-work-target)$/.test(shape.id)) continue;
    if (incidentIds.has(shape.id)) throw new TypeError("gray node fit ids are ambiguous");
    incidentIds.add(shape.id);
  }
  const proposed = candidates.map(s => ({ ...s, source: { ...(record(s.source) ? s.source : {}), nativeComponentRole: "node" } }));
  const result = fitSourceBorders({ shapes: proposed, image: input.image, slideSize: { width: input.slideSize.widthPt, height: input.slideSize.heightPt } });
  /** @type {Border[]} */ const borders = [];
  const changed = new Set();
  for (const evidence of result.evidence.nodes) {
    if (!evidence.accepted) continue;
    const original = candidates[evidence.index], fitted = result.shapes[evidence.index], sides = evidence.sides;
    if (!original || !record(fitted) || !box(fitted.box) || !sides?.left || !sides.right || !sides.top || !sides.bottom) throw new Error("gray node fit result is invalid");
    shapes[shapes.indexOf(original)] = { ...original, box: fitted.box };
    changed.add(original.id);
    borders.push({ left: sides.left.coordinate, right: sides.right.coordinate, top: sides.top.coordinate, bottom: sides.bottom.coordinate });
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
  return { shapes, borders, evidence: { accepted: borders.length, candidates: result.evidence.candidates, samples: result.evidence.samples } };
}

module.exports = { fitKnowledgeGraphGrayNodes };
