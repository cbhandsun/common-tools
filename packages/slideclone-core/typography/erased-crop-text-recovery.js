// @ts-check
"use strict";
const { types } = require("node:util");
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(entry => "value" in entry);
}
/** @param {unknown} value @returns {value is unknown[]} */
function list(value) {
  return Array.isArray(value) && !types.isProxy(value) && value.length <= 30000
    && Object.getPrototypeOf(value) === Array.prototype
    && Reflect.ownKeys(value).length === value.length + 1
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(entry => "value" in entry);
}
/** Snapshot the admitted source label without reading accessors or serializing
 * user metadata. Identity alone is insufficient if a later stage mutates it.
 * @param {unknown} value @returns {string | undefined} */
function textKey(value) {
  if (!record(value) || typeof value.text !== "string" || !value.text.trim() || value.text.length > 100000
    || [...value.text].some(character => character.charCodeAt(0) < 32 && ![9, 10, 13].includes(character.charCodeAt(0)))
    || !record(value.box) || (value.font !== undefined && !record(value.font))
    || (record(value.font) && value.font.hidden === true)
    || (value.style !== undefined && !record(value.style))
    || (record(value.style) && value.style.visibility === "hidden")
    || (value.source !== undefined && !record(value.source))) return undefined;
  const box = value.box;
  if (["x", "y", "w", "h"].some(key => typeof box[key] !== "number"
    || !Number.isFinite(box[key]) || Math.abs(/** @type {number} */ (box[key])) > 100000)
    || /** @type {number} */ (box.w) <= 0 || /** @type {number} */ (box.h) <= 0) return undefined;
  if (value.id !== undefined && (typeof value.id !== "string" || value.id.length > 512)) return undefined;
  const binding = record(value.source) ? [value.source.labelRef, value.source.ocrLabelRef, value.source.pageImage] : [];
  if (binding.some(field => field !== undefined && (typeof field !== "string" || field.length > 512))) return undefined;
  return JSON.stringify([value.id, value.text, box.x, box.y, box.w, box.h, binding]);
}
/** A page-local, single-use transaction. Only the eraser's successful write
 * callback can commit exact source objects; public crop metadata is no receipt.
 * @param {unknown} page @param {unknown} texts */
function createErasedCropTextRecovery(page, texts) {
  /** @type {Map<Record<string, unknown>, string>} */ const snapshots = new Map();
  /** @type {Map<Record<string, unknown>, Set<Record<string, unknown>>>} */ const committed = new Map();
  if (list(texts)) for (const text of texts) {
    const key = textKey(text);
    if (key !== undefined && record(text)) snapshots.set(text, key);
  }
  let consumed = false;
  /** @param {unknown} image @param {unknown} selected */
  function commit(image, selected) {
    if (consumed || !record(image) || !record(page) || !list(page.images) || !page.images.includes(image)
      || !record(image.source) || image.source.textErasedFromCrop !== true || !list(selected)) return;
    for (const text of selected) {
      if (!record(text) || !snapshots.has(text) || snapshots.get(text) !== textKey(text)) continue;
      const crops = committed.get(text) || new Set();
      crops.add(image); committed.set(text, crops);
    }
  }
  /** @param {unknown} retained @returns {Record<string, unknown>[]} */
  function recover(retained) {
    if (consumed) return [];
    consumed = true;
    if (!record(page) || !list(page.images) || !list(retained)) return [];
    const ids = new Set();
    for (const text of retained) if (record(text) && textKey(text) !== undefined) {
      if (typeof text.id === "string") ids.add(text.id);
      if (record(text.source) && typeof text.source.splitFromTextBoxId === "string") ids.add(text.source.splitFromTextBoxId);
    }
    const images = page.images;
    return [...committed].filter(([text, crops]) => snapshots.get(text) === textKey(text)
      && !retained.includes(text) && !(typeof text.id === "string" && ids.has(text.id))
      && [...crops].some(image => images.includes(image) && record(image.source) && image.source.textErasedFromCrop === true))
      .map(([text]) => text);
  }
  return { record: commit, recover };
}
module.exports = { createErasedCropTextRecovery };
