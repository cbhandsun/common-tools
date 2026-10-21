// @ts-check
"use strict";

/** @typedef {{width: number, height: number, rgba: Uint8Array}} Raster */
/** @typedef {{x: number, y: number, w: number, h: number}} Box */

const MAX_REGION_PIXELS = 262144;

/**
 * Flat punctuation cannot explain substantial ink throughout a tall source box.
 * This is deliberately not a classifier for letters, digits or CJK glyphs.
 * @param {Raster | null} image @param {string} text @param {Box} box
 */
function hasTallPunctuationGraphicInk(image, text, box) {
  if (!image || typeof text !== "string" || /[\r\n]/u.test(text) || !/^[\p{Pd}_.=~ \t]{2,8}$/u.test(text.trim())
    || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
    || image.width < 1 || image.height < 1 || !(image.rgba instanceof Uint8Array)
    || image.rgba.length !== image.width * image.height * 4
    || !box || ![box.x, box.y, box.w, box.h].every(Number.isFinite)
    || box.x < 0 || box.y < 0 || box.w <= 0 || box.h <= 0
    || box.x + box.w > image.width || box.y + box.h > image.height) return false;
  const left = Math.floor(box.x), top = Math.floor(box.y);
  const right = Math.ceil(box.x + box.w), bottom = Math.ceil(box.y + box.h);
  const width = right - left, height = bottom - top;
  if (width * height > MAX_REGION_PIXELS || height < 24 || width < 24) return false;
  let supportedRows = 0, foreground = 0;
  let firstRow = bottom, lastRow = top;
  for (let y = top; y < bottom; y += 1) {
    let ink = 0;
    for (let x = left; x < right; x += 1) {
      const offset = (y * image.width + x) * 4;
      const r = image.rgba[offset], g = image.rgba[offset + 1], b = image.rgba[offset + 2], a = image.rgba[offset + 3];
      if (r === undefined || g === undefined || b === undefined || a === undefined) return false;
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      if (a >= 64 && luma < 132) ink += 1;
    }
    foreground += ink;
    if (ink < Math.max(3, width * 0.015)) continue;
    supportedRows += 1;
    firstRow = Math.min(firstRow, y);
    lastRow = y;
  }
  const density = foreground / (width * height);
  return density >= 0.015 && density <= 0.35 && supportedRows / height >= 0.45
    && (lastRow - firstRow + 1) / height >= 0.7;
}

module.exports = { hasTallPunctuationGraphicInk };
