"use strict";

const { admitsSemanticPanelFill } = require("./semantic-panel-fill-policy");

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {Record<string,unknown> & {id:string,box:Box,source:Record<string,unknown>,style:Record<string,unknown>}} Shape */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @returns {value is Shape} */
function shapeRecord(value) {
  return record(value) && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 256 && record(value.box)
    && [value.box.x, value.box.y, value.box.w, value.box.h].every(item => typeof item === "number" && Number.isFinite(item))
    && typeof value.box.w === "number" && value.box.w > 0 && typeof value.box.h === "number" && value.box.h > 0
    && record(value.source) && record(value.style);
}
/** @param {unknown} value */
function pageAsset(value) {
  return typeof value === "string" && value.length <= 512 && /^assets\/[a-z0-9_./-]+$/i.test(value)
    && value.split("/").every(part => part !== "" && part !== "." && part !== "..");
}
/** @param {unknown} value @returns {number[] | null} */
function paleColor(value) {
  if (typeof value !== "string" || !/^#[a-f0-9]{6}$/i.test(value)) return null;
  const rgb = [1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16));
  return Math.min(...rgb) >= 180 && Math.max(...rgb) - Math.min(...rgb) <= 35 ? rgb : null;
}
/** @param {Shape} a @param {Shape} b */
function coincides(a, b) {
  const ac = paleColor(a.style.fill), bc = paleColor(b.style.fill);
  if (!ac || !bc || ac.some((value, i) => Math.abs(value - bc[i]) > 8)) return false;
  const xOverlap = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x);
  const yOverlap = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y);
  if (xOverlap <= 0 || yOverlap <= 0) return false;
  const overlap = xOverlap * yOverlap;
  return overlap / (a.box.w * a.box.h) >= 0.98 && overlap / (b.box.w * b.box.h) >= 0.98
    && Math.max(Math.abs(a.box.x - b.box.x), Math.abs(a.box.y - b.box.y),
      Math.abs(a.box.x + a.box.w - b.box.x - b.box.w), Math.abs(a.box.y + a.box.h - b.box.y - b.box.h)) <= 6;
}
/** @param {unknown} input @param {unknown} slideSize @param {unknown} [extraObjects] */
function planRedundantPanelBackgrounds(input, slideSize, extraObjects = []) {
  if (!Array.isArray(input) || input.length > 10000 || !input.every(record)
    || !Array.isArray(extraObjects) || extraObjects.length > 10000 || !extraObjects.every(record)) return [];
  const shapes = input.filter(shapeRecord);
  const objects = [...input, ...extraObjects];
  const counts = new Map();
  for (const item of objects) if (typeof item.id === "string") counts.set(item.id, (counts.get(item.id) || 0) + 1);
  const owners = shapes.filter(shape => counts.get(shape.id) === 1 && admitsSemanticPanelFill(shape, slideSize) && pageAsset(shape.source.pageImage)
    && record(shape.source.finalLightPanelSourceGeometryFit)
    && shape.source.finalLightPanelSourceGeometryFit.provider === "worker-source-light-panel-transition-v1"
    && shape.source.finalLightPanelSourceGeometryFit.fittedEdges === 4);
  const plans = [];
  for (const fallback of shapes) {
    const source = fallback.source, style = fallback.style;
    if (counts.get(fallback.id) !== 1 || fallback.type !== "rect" || source.editable !== true || source.nativeRebuild !== true || source.semanticNativeStructure !== true
      || source.visualFallbackPrimitive !== true || source.retainedInVisualFallback !== true || source.componentQualityIgnore !== true
      || !pageAsset(source.pageImage) || fallback.hidden === true || fallback.visible === false || source.hidden === true
      || (style.opacity !== undefined && style.opacity !== 1) || (style.fillOpacity !== undefined && style.fillOpacity !== 1)
      || (style.stroke !== undefined && style.stroke !== "none") || (style.strokeWidthPt !== undefined && style.strokeWidthPt !== 0)) continue;
    const matches = owners.filter(owner => owner.id !== fallback.id && owner.source.pageImage === source.pageImage
      && input.indexOf(owner) > input.indexOf(fallback) && coincides(fallback, owner));
    if (matches.length !== 1) continue;
    const referenced = objects.some(item => {
      const refs = [item.from, item.to, item.fromId, item.toId, item.parentId];
      if (record(item.source)) refs.push(item.source.sourceShapeId, item.source.sourceCardId, item.source.parentId);
      return refs.includes(fallback.id);
    });
    if (!referenced) plans.push({ removedId: fallback.id, ownerId: matches[0].id });
  }
  return plans;
}

module.exports = { planRedundantPanelBackgrounds };
