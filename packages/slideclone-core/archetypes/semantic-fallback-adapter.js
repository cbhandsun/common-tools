// @ts-check
"use strict";

const MAX_DEPTH = 6;
const MAX_ITEMS = 100;
const MAX_TEXT_LENGTH = 500;
const FORBIDDEN_GEOMETRY_KEYS = new Set([
  "x",
  "y",
  "w",
  "h",
  "left",
  "top",
  "right",
  "bottom",
  "width",
  "height",
  "box",
  "bounds",
  "bbox",
  "rect",
  "position",
  "coordinates"
]);

/**
 * @typedef {Object} SemanticFallbackItem
 * @property {string} [title]
 * @property {string} [body]
 * @property {string} [badge]
 * @property {string} [metric]
 * @property {string} [trend]
 * @property {readonly SemanticFallbackItem[]} [children]
 */

/**
 * @typedef {Object} SemanticFallbackDocument
 * @property {string | null} archetype
 * @property {readonly SemanticFallbackItem[]} items
 * @property {Readonly<Record<string, string>>} slotValues
 */

/**
 * Validate a model-produced semantic fallback payload. The payload may describe
 * hierarchy and text, but it may not provide absolute geometry.
 * @param {unknown} value
 * @returns {SemanticFallbackDocument}
 */
function validateSemanticFallback(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("semantic fallback must be an object");
  assertNoGeometryKeys(value, "semantic fallback");
  const raw = /** @type {Record<string, unknown>} */ (value);
  const archetype = optionalText(raw.archetype, "archetype");
  if (raw.items !== undefined && raw.items !== null && !Array.isArray(raw.items)) {
    throw new TypeError("items must be an array");
  }
  const counter = { count: 0 };
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  if (rawItems.length > MAX_ITEMS) throw new RangeError(`semantic fallback cannot contain more than ${MAX_ITEMS} items`);
  const items = rawItems.map((item, index) => normalizeItem(item, `items[${index}]`, 0, counter));
  const slotValues = normalizeSlotValues(raw.slotValues);
  return Object.freeze({
    archetype,
    items: Object.freeze(items),
    slotValues: Object.freeze(slotValues)
  });
}

/**
 * Convert a semantic fallback payload into the PageContext shape accepted by
 * DeclarativeRebuilderPipeline.
 * @param {unknown} value
 * @param {{ slideSize?: { widthPt?: number, heightPt?: number }, pageIndex?: number }} [baseContext]
 * @returns {Readonly<{ archetype: string | undefined, items: readonly SemanticFallbackItem[], metadata: Readonly<{ slotValues: Readonly<Record<string, string>>, source: string }>, slideSize?: { widthPt?: number, heightPt?: number }, pageIndex?: number }>}
 */
function semanticFallbackToPageContext(value, baseContext = {}) {
  const fallback = validateSemanticFallback(value);
  if (!baseContext || typeof baseContext !== "object" || Array.isArray(baseContext)) {
    throw new TypeError("baseContext must be an object");
  }
  const context = {
    archetype: fallback.archetype || undefined,
    items: fallback.items,
    metadata: Object.freeze({ slotValues: fallback.slotValues, source: "semantic-fallback" })
  };
  if (baseContext.slideSize) {
    Object.assign(context, { slideSize: normalizeSlideSize(baseContext.slideSize) });
  }
  if (baseContext.pageIndex !== undefined) {
    if (!Number.isSafeInteger(baseContext.pageIndex) || baseContext.pageIndex < 0) throw new TypeError("pageIndex must be a non-negative integer");
    Object.assign(context, { pageIndex: baseContext.pageIndex });
  }
  return Object.freeze(context);
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {number} depth
 * @param {{ count: number }} counter
 * @returns {SemanticFallbackItem}
 */
function normalizeItem(value, label, depth, counter) {
  if (depth > MAX_DEPTH) throw new RangeError(`semantic fallback nesting depth exceeds ${MAX_DEPTH}`);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  counter.count += 1;
  if (counter.count > MAX_ITEMS) throw new RangeError(`semantic fallback cannot contain more than ${MAX_ITEMS} total items`);
  assertNoGeometryKeys(value, label);
  const raw = /** @type {Record<string, unknown>} */ (value);
  /** @type {Record<string, unknown>} */
  const item = {};
  for (const key of ["title", "body", "badge", "metric", "trend"]) {
    const text = optionalText(raw[key], `${label}.${key}`);
    if (text !== null) item[key] = text;
  }
  if (raw.children !== undefined && raw.children !== null && !Array.isArray(raw.children)) {
    throw new TypeError(`${label}.children must be an array`);
  }
  if (Array.isArray(raw.children)) {
    if (raw.children.length > MAX_ITEMS) throw new RangeError(`${label}.children cannot contain more than ${MAX_ITEMS} items`);
    item.children = Object.freeze(raw.children.map((child, index) => normalizeItem(child, `${label}.children[${index}]`, depth + 1, counter)));
  }
  return Object.freeze(/** @type {SemanticFallbackItem} */ (item));
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string | null}
 */
function optionalText(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const text = value.trim();
  if (!text) return null;
  if (text.length > MAX_TEXT_LENGTH) throw new RangeError(`${label} exceeds ${MAX_TEXT_LENGTH} characters`);
  if (text.includes("\0")) throw new TypeError(`${label} cannot contain NUL characters`);
  return text;
}

/**
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
function normalizeSlotValues(value) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("slotValues must be an object");
  assertNoGeometryKeys(value, "slotValues");
  const raw = /** @type {Record<string, unknown>} */ (value);
  /** @type {Record<string, string>} */
  const slots = {};
  for (const [key, item] of Object.entries(raw)) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(key)) throw new TypeError("slotValues keys must be simple identifiers");
    const text = optionalText(item, `slotValues.${key}`);
    if (text !== null) slots[key] = text;
  }
  return slots;
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function assertNoGeometryKeys(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(/** @type {Record<string, unknown>} */ (value))) {
    if (FORBIDDEN_GEOMETRY_KEYS.has(key.toLowerCase())) {
      throw new TypeError(`${label} must not contain geometry key "${key}"`);
    }
  }
}

/**
 * @param {{ widthPt?: number, heightPt?: number }} slideSize
 * @returns {{ widthPt?: number, heightPt?: number }}
 */
function normalizeSlideSize(slideSize) {
  const result = {};
  if (slideSize.widthPt !== undefined) {
    if (typeof slideSize.widthPt !== "number" || !Number.isFinite(slideSize.widthPt) || slideSize.widthPt <= 0) throw new TypeError("slideSize.widthPt must be a positive number");
    Object.assign(result, { widthPt: slideSize.widthPt });
  }
  if (slideSize.heightPt !== undefined) {
    if (typeof slideSize.heightPt !== "number" || !Number.isFinite(slideSize.heightPt) || slideSize.heightPt <= 0) throw new TypeError("slideSize.heightPt must be a positive number");
    Object.assign(result, { heightPt: slideSize.heightPt });
  }
  return result;
}

module.exports = {
  FORBIDDEN_GEOMETRY_KEYS,
  semanticFallbackToPageContext,
  validateSemanticFallback
};
