// @ts-check
"use strict";

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value @returns {value is Box} */
function box(value) { return record(value) && finite(value.x) && finite(value.y) && finite(value.w) && finite(value.h) && value.x >= 0 && value.y >= 0 && value.w > 0 && value.h > 0; }
/** @param {unknown} value @returns {Raster} */
function raster(value) {
  if (!record(value) || !finite(value.width) || !finite(value.height) || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height)
    || value.width < 1 || value.height < 1 || value.width > 16384 || value.height > 16384 || value.width * value.height > 40_000_000
    || !(value.rgba instanceof Uint8Array) || value.rgba.length !== value.width * value.height * 4) throw new TypeError("text ink raster is invalid");
  return { width: value.width, height: value.height, rgba: value.rgba };
}
/** @param {Raster} image @param {Box} region @param {{widthPt:number,heightPt:number}} size */
function windowFor(image, region, size) {
  const sx = image.width / size.widthPt, sy = image.height / size.heightPt;
  return { sx, sy, left: Math.max(0, Math.floor((region.x - 2) * sx)), right: Math.min(image.width, Math.ceil((region.x + region.w + 2) * sx)),
    top: Math.max(0, Math.floor((region.y - 2) * sy)), bottom: Math.min(image.height, Math.ceil((region.y + region.h + 2) * sy)) };
}
/** @param {Raster} image @param {ReturnType<typeof windowFor>} window @param {number[]} color */
function measure(image, window, color) {
  let left = image.width, right = -1, top = image.height, bottom = -1, pixels = 0;
  for (let y = window.top; y < window.bottom; y += 1) for (let x = window.left; x < window.right; x += 1) {
    const offset = (y * image.width + x) * 4;
    if ((image.rgba[offset + 3] ?? 0) < 160) continue;
    if (color.some((channel, index) => Math.abs((image.rgba[offset + index] ?? 255) - channel) > 65)) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); pixels += 1;
  }
  if (pixels < 8) return null;
  return { x: left / window.sx, y: top / window.sy, w: (right - left + 1) / window.sx, h: (bottom - top + 1) / window.sy };
}

/** Measure color-near ink in bounded OCR windows, without modifying pixels or deciding whether to edit text.
 * Nearby same-color graphics can contaminate a measurement; downstream planning and re-render validation are required.
 * @param {unknown} input
 * @returns {{measurements:{id:string,source:Box,rendered:Box}[],samples:number}}
 */
function measureTextInkGeometry(input) {
  if (!record(input) || !Array.isArray(input.textBoxes) || input.textBoxes.length > 2000 || !record(input.slideSize)
    || !finite(input.slideSize.widthPt) || !finite(input.slideSize.heightPt) || input.slideSize.widthPt <= 0 || input.slideSize.heightPt <= 0
    || input.slideSize.widthPt > 100000 || input.slideSize.heightPt > 100000) throw new TypeError("text ink request is invalid");
  const size = { widthPt: input.slideSize.widthPt, heightPt: input.slideSize.heightPt };
  const source = raster(input.sourceImage), rendered = raster(input.renderedImage);
  if (Math.abs((source.width / source.height) / (rendered.width / rendered.height) - 1) > 0.01) throw new TypeError("text ink rasters have incompatible aspect ratios");
  const ids = new Set();
  const windows = [];
  let samples = 0;
  for (const text of input.textBoxes) {
    if (!record(text) || typeof text.id !== "string" || !text.id || text.id.length > 256 || !box(text.box)
      || text.box.x + text.box.w > size.widthPt || text.box.y + text.box.h > size.heightPt || !record(text.font)
      || typeof text.font.color !== "string" || !/^#[0-9a-f]{6}$/iu.test(text.font.color)) continue;
    if (ids.has(text.id)) throw new TypeError("text ink ids are ambiguous");
    ids.add(text.id);
    const hexColor = text.font.color;
    const color = [1, 3, 5].map(offset => parseInt(hexColor.slice(offset, offset + 2), 16));
    if (Math.min(...color) > 190) continue;
    const a = windowFor(source, text.box, size), b = windowFor(rendered, text.box, size);
    samples += (a.right - a.left) * (a.bottom - a.top) + (b.right - b.left) * (b.bottom - b.top);
    if (samples > 20_000_000) throw new RangeError("text ink sampling exceeds the processing boundary");
    windows.push({ id: text.id, color, a, b });
  }
  const measurements = [];
  for (const item of windows) {
    const a = measure(source, item.a, item.color), b = measure(rendered, item.b, item.color);
    if (a && b) measurements.push({ id: item.id, source: a, rendered: b });
  }
  return { measurements, samples };
}

module.exports = { measureTextInkGeometry };
