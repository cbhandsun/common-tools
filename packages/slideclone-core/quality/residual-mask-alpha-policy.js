// @ts-check
"use strict";
const { types } = require("node:util");
/** A selector changes only alpha within already admitted erasure masks. It
 * cannot add geometry or grant ownership of a text mask or another source.
 * @param {unknown} value @param {readonly unknown[]} masks
 * @returns {ReadonlySet<unknown>} */
function admitTransparentResidualMasks(value, masks) {
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > 30000 || Reflect.ownKeys(value).length !== value.length + 1
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(item => !("value" in item)))
    throw new TypeError("residual alpha selection is invalid");
  const admitted = new Set(masks);
  const selected = new Set();
  for (const mask of value) {
    if (!admitted.has(mask) || !mask || typeof mask !== "object" || Array.isArray(mask) || types.isProxy(mask)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(mask))
      || Object.values(Object.getOwnPropertyDescriptors(mask)).some(item => !("value" in item))
      || Object.hasOwn(mask, "textInk") || selected.has(mask))
      throw new TypeError("residual alpha selection is invalid");
    selected.add(mask);
  }
  return selected;
}
module.exports = { admitTransparentResidualMasks };
