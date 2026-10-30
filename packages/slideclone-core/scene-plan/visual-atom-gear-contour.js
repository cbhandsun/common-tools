// @ts-check
"use strict";
const { types } = require("node:util");
const MAX_PROFILE_LENGTH = 16384;
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
/** Read data properties only. Raster profiles must never execute provider code.
 * @param {object} value @param {string} key @returns {unknown} */
function data(value, key) {
  const property = Object.getOwnPropertyDescriptor(value, key);
  return property && Object.hasOwn(property, "value") ? property.value : undefined;
}
/** @param {unknown} value @returns {value is number} */
function coordinate(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_PROFILE_LENGTH;
}
/** Missing scan lines cannot establish an exterior contour.
 * @param {unknown} value @param {'row'|'col'} axis
 * @returns {{low:number[],high:number[]}|null} */
function profileEdges(value, axis) {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const length = data(value, "length");
  if (typeof length !== "number" || length < 3 || length > MAX_PROFILE_LENGTH) return null;
  /** @type {number[]} */ const low = [], high = [];
  let previous = -1;
  for (let i = 0; i < length; i++) {
    const row = data(value, String(i));
    if (!record(row)) return null;
    const position = data(row, axis === "row" ? "y" : "x");
    const min = data(row, axis === "row" ? "minX" : "minY");
    const max = data(row, axis === "row" ? "maxX" : "maxY");
    const count = data(row, "count");
    if (!coordinate(position) || !coordinate(min) || !coordinate(max) || min > max
      || !coordinate(count) || count < 1 || count > max - min + 1 || i > 0 && position !== previous + 1) return null;
    low.push(min); high.push(-max); previous = position;
  }
  return { low, high };
}
/** Both contours are oriented so a larger value means farther inward. A
 * notch has exterior paint on both sides of the inward excursion. A convex
 * circle's pixel staircase and a central glyph hole do not create this.
 * @param {number[]} edge */
function hasInwardNotch(edge) {
  const suffix = new Array(edge.length).fill(Infinity);
  for (let i = edge.length - 1; i >= 0; i--) suffix[i] = Math.min(edge[i] ?? Infinity, suffix[i + 1] ?? Infinity);
  let prefix = edge[0] ?? Infinity;
  for (let i = 1; i < edge.length - 1; i++) {
    if ((edge[i] ?? -Infinity) - Math.max(prefix, suffix[i + 1] ?? Infinity) >= 1) return true;
    prefix = Math.min(prefix, edge[i] ?? Infinity);
  }
  return false;
}
/** Additional classification evidence only: no ownership, paint or erase
 * authority is granted. Preserve the existing density and ring gates.
 * @param {unknown} rows @param {unknown} columns */
function gearContourHasTeeth(rows, columns) {
  const row = profileEdges(rows, "row"), col = profileEdges(columns, "col");
  return row !== null && col !== null && [row.low, row.high, col.low, col.high].every(hasInwardNotch);
}
module.exports = { gearContourHasTeeth };
