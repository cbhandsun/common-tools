// @ts-check
"use strict";
const INVALID = "editable deck template context is invalid";
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** Context comes from the builder's read-only inspection of the actual template graph.
 * Preserved pages retain their original layout and ignore a requested new layout.
 * @param {unknown} pages @param {unknown} context */
function validateDeckTemplateContext(pages, context = null) {
  if (!Array.isArray(pages) || pages.length > 50) throw new TypeError(INVALID);
  const layouts = new Set(); const indices = new Set();
  if (context !== null) {
    if (!record(context) || !Array.isArray(context.layoutIds) || !Array.isArray(context.slideIndices)
      || context.layoutIds.length < 1 || context.layoutIds.length > 10000
      || context.slideIndices.length < 1 || context.slideIndices.length > 10000) throw new TypeError(INVALID);
    for (const id of context.layoutIds) {
      if (typeof id !== "string" || !id || id.length > 512 || id.includes("\0") || layouts.has(id.toLowerCase())) throw new TypeError(INVALID);
      layouts.add(id.toLowerCase());
    }
    for (const index of context.slideIndices) {
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= 10000 || indices.has(index)) throw new TypeError(INVALID);
      indices.add(index);
    }
  }
  for (const page of pages) {
    if (!record(page)) throw new TypeError(INVALID);
    const index = page.pageIndex === undefined ? 0 : page.pageIndex;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= 10000
      || (page.preserveTemplateSlide != null && typeof page.preserveTemplateSlide !== "boolean")) throw new TypeError(INVALID);
    if (page.intent != null && !record(page.intent)) throw new TypeError(INVALID);
    const layout = record(page.intent) ? page.intent.templateLayoutId : null;
    if (layout != null && typeof layout !== "string") throw new TypeError(INVALID);
    if (page.preserveTemplateSlide === true) {
      if (!indices.has(index)) throw new Error("editable deck template source slide is unavailable");
    } else if (typeof layout === "string" && layout.trim() && !layouts.has(layout.toLowerCase())) {
      throw new Error("editable deck template layout is unavailable");
    }
  }
}
module.exports = {validateDeckTemplateContext};
