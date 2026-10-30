// @ts-check
"use strict";

const { types } = require("node:util");

/** @param {unknown} input @returns {Record<string, unknown>} */
function dataObject(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input) || types.isProxy(input)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(input))
    || Object.values(Object.getOwnPropertyDescriptors(input)).some(property => !("value" in property)))
    throw new TypeError("editable deck native shadow object is invalid");
  return /** @type {Record<string, unknown>} */ (input);
}

/** @param {Record<string, unknown>} input @param {string[]} fields */
function canonicalFields(input, fields) {
  for (const key of Object.getOwnPropertyNames(input)) {
    if (fields.some(field => field.toLowerCase() === key.toLowerCase() && field !== key))
      throw new TypeError("editable deck native shadow casing is invalid");
  }
}

/** Native effect-mask contraction only; never grants source paint or erasure authority.
 * Omitted axes retain the writer default. Values use DrawingML's 1/100000 resolution.
 * @param {unknown} input @returns {{scaleX?:number,scaleY?:number}} */
function parseNativeShadowScale(input) {
  if (input === null || input === undefined) return {};
  const style = dataObject(input);
  canonicalFields(style, ["shadow"]);
  if (!Object.hasOwn(style, "shadow") || style.shadow === null || style.shadow === undefined) return {};
  const shadow = dataObject(style.shadow);
  canonicalFields(shadow, ["scaleX", "scaleY"]);
  /** @type {{scaleX?:number,scaleY?:number}} */
  const result = {};
  for (const key of /** @type {const} */ (["scaleX", "scaleY"])) {
    if (!Object.hasOwn(shadow, key)) continue;
    const value = shadow[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0.00001 || value > 1)
      throw new TypeError("editable deck native shadow scale is invalid");
    result[key] = Math.round(value * 100000);
  }
  return result;
}

module.exports = { parseNativeShadowScale };
