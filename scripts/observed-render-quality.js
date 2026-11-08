// @ts-check
"use strict";
const path = require("node:path");
const { types } = require("node:util");
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function plainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}
/** Diagnostic observation must preserve the production refinement feedback loop.
 * @param {(request: Record<string, unknown>) => Promise<unknown>} verify
 * @param {(pages: string[]) => unknown} observeRenderedPages */
function createObservedRenderQualityVerifier(verify, observeRenderedPages) {
  if (typeof verify !== "function" || typeof observeRenderedPages !== "function") throw new TypeError("Invalid render observation dependencies");
  /** @param {unknown} request */
  return async request => {
    if (!plainRecord(request) || (request.collectRenderedPages !== undefined && typeof request.collectRenderedPages !== "function")) {
      throw new TypeError("Invalid render observation request");
    }
    const collect = request.collectRenderedPages;
    return verify({ ...request, collectRenderedPages: async (/** @type {unknown} */ pages) => {
      if (!Array.isArray(pages) || types.isProxy(pages) || pages.length < 1 || pages.length > 20
        || Object.getPrototypeOf(pages) !== Array.prototype
        || Reflect.ownKeys(pages).length !== pages.length + 1
        || Object.values(Object.getOwnPropertyDescriptors(pages)).some(property => !("value" in property))) {
        throw new TypeError("Invalid observed rendered pages");
      }
      /** @type {string[]} */ const files = [];
      for (const file of pages) {
        if (typeof file !== "string" || file.length > 32768 || !path.isAbsolute(file)
          || [...file].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
          throw new TypeError("Invalid observed rendered pages");
        }
        files.push(file);
      }
      if (typeof collect === "function") await collect(files.slice());
      await observeRenderedPages(files);
    } });
  };
}
module.exports = { createObservedRenderQualityVerifier };
