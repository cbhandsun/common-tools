// @ts-check
"use strict";

const { types } = require("node:util");

const MAX_DEPTH = 16;
const MAX_NODES = 30000;
/** @typedef {(string | number)[]} FieldPath */

/** @param {object} value @param {string} key @returns {unknown} */
function dataProperty(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!("value" in descriptor) || descriptor.enumerable !== true) throw new TypeError("editable deck requires enumerable data properties");
  return /** @type {unknown} */ (descriptor.value);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainRecord(value) {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** XML 1.0 text permits TAB/LF/CR, scalar BMP characters and paired surrogates.
 * JSON strings alone do not provide this guarantee.
 * @param {string} text */
function isXmlText(text) {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code >= 0xfffe) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = text.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

/** @param {unknown} value @param {number} depth @param {{nodes:number}} counter
 * @param {FieldPath} fieldPath @param {number} slideArea */
function visit(value, depth, counter, fieldPath, slideArea) {
  counter.nodes += 1;
  if (counter.nodes > MAX_NODES || depth > MAX_DEPTH) throw new Error("editable deck structure exceeds safe limits");
  if (types.isProxy(value)) throw new TypeError("editable deck cannot contain proxies");
  const isImageSource = fieldPath[0] === "pages"
    && typeof fieldPath[1] === "number" && fieldPath[2] === "images"
    && typeof fieldPath[3] === "number" && fieldPath[4] === "source";
  const isResidualPixelCount = isImageSource && (
    (fieldPath.length === 6 && fieldPath[5] === "residualForegroundPixelCountAfterVisualAtomErase")
    || (fieldPath.length === 7 && fieldPath[5] === "residualSplitRejected"
      && (fieldPath[6] === "foregroundPixelCount" || fieldPath[6] === "coveredForegroundPixelCount")));
  if (isResidualPixelCount) {
    // Pixel counts use the admitted source page's 40M-pixel ceiling, not point coordinates.
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 40_000_000) throw new Error("editable deck contains an invalid number");
    return;
  }
  if (typeof value === "string") {
    if (value.length > 32768 || !isXmlText(value)) throw new Error("editable deck contains an invalid string");
    return;
  }
  if (value === null || typeof value === "boolean") return;
  const isPageArea = fieldPath.length === 6 && fieldPath[0] === "pages"
    && typeof fieldPath[1] === "number" && Number.isInteger(fieldPath[1])
    && fieldPath[2] === "reconstruction" && fieldPath[3] === "qualityBudget"
    && fieldPath[4] === "metrics" && fieldPath[5] === "slideAreaPt2";
  const maximum = isPageArea ? slideArea : 100000;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > maximum || (isPageArea && value < 0)) throw new Error("editable deck contains an invalid number");
    return;
  }
  if (Array.isArray(value)) {
    /** @type {unknown[]} */ const items = value;
    if (items.length > MAX_NODES - counter.nodes) throw new Error("editable deck structure exceeds safe limits");
    if (Object.getPrototypeOf(items) !== Array.prototype || Reflect.ownKeys(items).length !== items.length + 1) throw new TypeError("editable deck requires plain dense arrays");
    for (let index = 0; index < items.length; index++) visit(dataProperty(items, String(index)), depth + 1, counter, [...fieldPath, index], slideArea);
    return;
  }
  if (!isPlainRecord(value)) throw new Error("editable deck contains an invalid value");
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_NODES - counter.nodes) throw new Error("editable deck structure exceeds safe limits");
  const foldedKeys = new Set();
  for (const key of keys) {
    if (typeof key !== "string") throw new Error("editable deck contains an invalid property");
    const folded = key.toLowerCase();
    if (foldedKeys.has(folded)) throw new Error("editable deck contains ambiguous field casing");
    foldedKeys.add(folded);
    if (key.length > 128 || !isXmlText(key)) throw new Error("editable deck contains an invalid property");
    visit(dataProperty(value, key), depth + 1, counter, [...fieldPath, key], slideArea);
  }
}

/** Validate serializable IR values without mutating or echoing user content.
 * Page-area metadata keeps its existing geometry-derived bound.
 * @param {unknown} value @param {number} [slideArea] */
function validateDeckIrTree(value, slideArea = 0) {
  if (!Number.isFinite(slideArea) || slideArea < 0 || slideArea > 16000000) throw new TypeError("editable deck area bound is invalid");
  visit(value, 0, { nodes: 0 }, [], slideArea);
}

/** Read the outer contract without executing getters before tree admission.
 * @param {unknown} value @returns {{pages: unknown[], widthPt: number, heightPt: number}} */
function validateDeckIrEnvelope(value) {
  if (!isPlainRecord(value) || dataProperty(value, "version") !== "1.0") throw new Error("editable input requires a bounded deck.json IR");
  const dimensions = dataProperty(value, "slideSize");
  const pages = dataProperty(value, "pages");
  if (!isPlainRecord(dimensions) || types.isProxy(pages) || !Array.isArray(pages) || pages.length < 1 || pages.length > 50) throw new Error("editable input requires a bounded deck.json IR");
  const widthPt = dataProperty(dimensions, "widthPt"), heightPt = dataProperty(dimensions, "heightPt");
  if (typeof widthPt !== "number" || typeof heightPt !== "number" || !Number.isFinite(widthPt) || !Number.isFinite(heightPt)
    || widthPt < 72 || widthPt > 4000 || heightPt < 72 || heightPt > 4000) throw new Error("editable deck slideSize is invalid");
  const slideArea = Math.ceil(widthPt * heightPt);
  validateDeckIrTree(envelopeMetadata(value), slideArea);
  validateEnvelopePages(pages, slideArea);
  return {pages, widthPt, heightPt};
}

/** Validate non-page envelope metadata without aggregating independent page budgets.
 * @param {Record<string, unknown>} value */
function envelopeMetadata(value) {
  const metadata = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new Error("editable deck contains an invalid property");
    Object.defineProperty(metadata, key, {
      value: key === "pages" ? null : dataProperty(value, key), enumerable: true
    });
  }
  return metadata;
}

/** Validate every page against the existing single-tree budget and traversal protections.
 * @param {unknown[]} pages @param {number} slideArea */
function validateEnvelopePages(pages, slideArea) {
  if (Object.getPrototypeOf(pages) !== Array.prototype || Reflect.ownKeys(pages).length !== pages.length + 1) {
    throw new TypeError("editable deck requires plain dense arrays");
  }
  for (let index = 0; index < pages.length; index += 1) {
    visit(dataProperty(pages, String(index)), 2, {nodes: 0}, ["pages", index], slideArea);
  }
}

module.exports = { validateDeckIrTree, validateDeckIrEnvelope };
