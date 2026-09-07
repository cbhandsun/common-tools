// @ts-check
"use strict";

const MAX_SLIDE_DIMENSION_PT = 100000;
/** @typedef {{widthPt: number, heightPt: number}} SlideSize */

/** @param {unknown} value @returns {number | null} */
function dimension(value) {
  let parsed = value;
  if (typeof value === "string") {
    if (value.length > 64) return null;
    const text = value.trim();
    if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d{1,3})?$/i.test(text)) return null;
    parsed = Number(text);
  }
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_SLIDE_DIMENSION_PT ? parsed : null;
}

/** Parse legacy decimal strings once, yielding a numeric-only size for downstream stages.
 * Invalid input has no usable size; callers choose rejection or a documented fallback.
 * @param {unknown} value @returns {SlideSize | null}
 */
function parseSlideSize(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const width = Object.getOwnPropertyDescriptor(value, "widthPt");
  const height = Object.getOwnPropertyDescriptor(value, "heightPt");
  const widthPt = dimension(width && Object.hasOwn(width, "value") ? width.value : undefined);
  const heightPt = dimension(height && Object.hasOwn(height, "value") ? height.value : undefined);
  return widthPt !== null && heightPt !== null ? { widthPt, heightPt } : null;
}

module.exports = { MAX_SLIDE_DIMENSION_PT, parseSlideSize };
