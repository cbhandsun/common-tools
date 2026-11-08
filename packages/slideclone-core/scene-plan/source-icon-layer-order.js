"use strict";
// @ts-check
/** @typedef {{x: number, y: number, w: number, h: number}} Box */
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @returns {value is Box} */
function box(value) {
  return record(value) && [value.x, value.y, value.w, value.h].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100000)
    && typeof value.w === "number" && value.w > 0 && typeof value.h === "number" && value.h > 0;
}
/** @param {Box} outer @param {Box} inner */
function contains(outer, inner) {
  return inner.x >= outer.x - 0.01 && inner.y >= outer.y - 0.01
    && inner.x + inner.w <= outer.x + outer.w + 0.01 && inner.y + inner.h <= outer.y + outer.h + 0.01;
}
/** @param {Box} a @param {Box} b */
function overlaps(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
/** @param {unknown} value @returns {value is string} */
function asset(value) {
  return typeof value === "string" && value.length <= 1024 && /^assets\/[A-Za-z0-9_./-]+$/.test(value)
    && !value.split("/").some(part => part === ".." || part === "." || !part);
}
/** @param {unknown} value @returns {value is string} */
function identity(value) { return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,256}$/.test(value); }
/** @param {unknown} value */
function icon(value) {
  if (!record(value) || value.type !== "freeform" || value.hidden === true || !identity(value.id) || !box(value.box)
    || !record(value.source) || !identity(value.source.sourceTextBoxId) || !asset(value.source.pageImage)
    || !box(value.source.sourceIconBox) || !contains(value.source.sourceIconBox, value.box)
    || !["outline-contour", "interior-contour"].includes(String(value.source.iconPart))) return null;
  return { shape: value, box: value.source.sourceIconBox, key: JSON.stringify([
    value.source.pageImage, value.source.sourceTextBoxId, value.source.sourceIconBox
  ]), image: value.source.pageImage };
}
/** @param {unknown} value */
function background(value) {
  if (!record(value) || !["rect", "roundRect"].includes(String(value.type)) || value.hidden === true
    || !identity(value.id) || !box(value.box) || !record(value.source) || value.source.preserveResidualInterior !== true
    || !asset(value.source.pageImage) || !record(value.style) || typeof value.style.fill !== "string"
    || !/^#[A-Fa-f0-9]{6}$/.test(value.style.fill)
    || (value.style.opacity !== undefined && value.style.opacity !== 1)
    || (value.style.fillOpacity !== undefined && value.style.fillOpacity !== 1)
    || (value.style.fillTransparency !== undefined && value.style.fillTransparency !== 0)) return null;
  return { box: value.box, image: value.source.pageImage, id: value.id };
}

/** Repair only source-backed icon/background inversions; never expose generic guesses.
 * Intentional overlapping foreground objects block a move. Input is not mutated.
 * @param {unknown} input @param {unknown} slideSize */
function orderSourceIconLayers(input, slideSize) {
  if (!Array.isArray(input) || input.length > 10000) throw new TypeError("Invalid source icon layer input");
  if (!record(slideSize) || typeof slideSize.widthPt !== "number" || typeof slideSize.heightPt !== "number"
    || !box({ x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt })) throw new TypeError("Invalid source icon layer slide size");
  const canvas = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
  /** @type {unknown[]} */
  const shapes = input;
  /** @type {Map<string, {box: Box, image: string, indices: number[], containerId: unknown}>} */
  const groups = new Map();
  /** @type {Map<number, {box: Box, image: string, id: string}>} */
  const backgrounds = new Map();
  const ids = new Set();
  for (let index = 0; index < shapes.length; index += 1) {
    const shape = shapes[index];
    if (record(shape) && identity(shape.id)) {
      if (ids.has(shape.id)) return { shapes, movedShapes: 0 };
      ids.add(shape.id);
    }
    const foreground = icon(shape);
    if (foreground && contains(canvas, foreground.box)) {
      const group = groups.get(foreground.key) || { box: foreground.box, image: foreground.image, indices: [],
        containerId: record(foreground.shape.source) ? foreground.shape.source.containerId : undefined };
      if (record(foreground.shape.source) && group.containerId !== foreground.shape.source.containerId) return { shapes, movedShapes: 0 };
      group.indices.push(index);
      groups.set(foreground.key, group);
    }
    const panel = background(shape);
    if (panel && contains(canvas, panel.box)) backgrounds.set(index, panel);
  }
  if (groups.size > 128 || backgrounds.size > 128) return { shapes, movedShapes: 0 };
  /** @type {Map<number, number[]>} */
  const deferred = new Map();
  const moved = new Set();
  for (const group of groups.values()) {
    if ([...groups.values()].some(other => other !== group && overlaps(group.box, other.box))) continue;
    const first = group.indices[0];
    if (first === undefined) continue;
    let target = first;
    const containing = [...backgrounds.entries()].filter(([, panel]) => panel.image === group.image && contains(panel.box, group.box));
    // Nested or duplicate containers require an explicit owner rather than a geometric guess.
    if (containing.length > 1 && !identity(group.containerId)) continue;
    if (group.containerId !== undefined && !containing.some(([, panel]) => panel.id === group.containerId)) continue;
    for (const [index, panel] of backgrounds) {
      if (index > target && panel.image === group.image && contains(panel.box, group.box)
        && (group.containerId === undefined || panel.id === group.containerId)) target = index;
    }
    if (target === first) continue;
    const members = new Set(group.indices);
    let blocked = false;
    for (let index = first; index <= target; index += 1) {
      if (members.has(index)) continue;
      const shape = shapes[index], panel = backgrounds.get(index);
      if (panel && panel.image === group.image && contains(panel.box, group.box)
        && (group.containerId === undefined || panel.id === group.containerId)) continue;
      // Unknown geometry cannot establish safe foreground ownership.
      if (!record(shape) || !box(shape.box) || overlaps(shape.box, group.box)) { blocked = true; break; }
    }
    if (blocked) continue;
    const pending = deferred.get(target) || [];
    const inverted = group.indices.filter(index => index < target);
    pending.push(...inverted);
    deferred.set(target, pending);
    for (const index of inverted) moved.add(index);
  }
  if (!moved.size) return { shapes, movedShapes: 0 };
  const ordered = shapes.flatMap((shape, index) => [
    ...(moved.has(index) ? [] : [shape]),
    ...(deferred.get(index) || []).sort((a, b) => a - b).map(original => shapes[original])
  ]);
  return { shapes: ordered, movedShapes: moved.size };
}

module.exports = { orderSourceIconLayers };
