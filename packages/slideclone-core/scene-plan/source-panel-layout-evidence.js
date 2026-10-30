// @ts-check
"use strict";
const { types } = require("node:util");
const { detectSolidVisualFallbackRectangles } = require("./solid-region-evidence");
const { fitSourceTextBand } = require("../typography/source-text-band-evidence");
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(item => "value" in item);
}
/** Measure closed source regions independently of connector detection. A fill
 * transition is container evidence; it must never masquerade as a connector.
 * @param {unknown} input @returns {{provider:string,panelCount:number}|null} */
function sourcePanelLayoutEvidence(input) {
  if (!record(input) || !record(input.image) || !record(input.slideSize) || !Array.isArray(input.textBoxes)
    || types.isProxy(input.textBoxes) || input.textBoxes.length > 10000
    || Object.values(Object.getOwnPropertyDescriptors(input.textBoxes)).some(item => !("value" in item))) return null;
  const { width, height, rgba } = input.image, { widthPt, heightPt } = input.slideSize;
  if (typeof width !== "number" || typeof height !== "number" || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 40000000
    || typeof widthPt !== "number" || typeof heightPt !== "number" || !Number.isFinite(widthPt) || !Number.isFinite(heightPt)
    || widthPt <= 0 || heightPt <= 0 || types.isProxy(rgba) || !types.isUint8Array(rgba)) return null;
  const prototype = Object.getPrototypeOf(Uint8Array.prototype);
  const buffer = Reflect.get(prototype, "buffer", rgba), length = Reflect.get(prototype, "length", rgba);
  if (!types.isArrayBuffer(buffer) || length !== width * height * 4) return null;
  const image = { width, height, rgba: new Uint8Array(buffer, Reflect.get(prototype, "byteOffset", rgba), length) };
  /** @type {{x:number,y:number,w:number,h:number}[]} */ const boxes = [];
  for (let index = 0; index < input.textBoxes.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(input.textBoxes, String(index));
    const item = descriptor?.value;
    if (!record(item) || !record(item.box) || typeof item.text !== "string" || !item.text.trim() || item.text.length > 512) return null;
    const { x, y, w, h } = item.box;
    if (typeof x !== "number" || typeof y !== "number" || typeof w !== "number" || typeof h !== "number"
      || ![x,y,w,h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || x+w > widthPt || y+h > heightPt) return null;
    boxes.push({ x,y,w,h });
  }
  const panels = detectSolidVisualFallbackRectangles(image, { widthPt, heightPt })
    .filter(region => region.box.w * region.box.h / (widthPt * heightPt) >= 0.08)
    .filter(region => boxes.filter(box => box.x >= region.box.x && box.y >= region.box.y
      && box.x+box.w <= region.box.x+region.box.w && box.y+box.h <= region.box.y+region.box.h).length >= 2)
    .map(region => fitSourceTextBand({ image, slideSize: { widthPt,heightPt }, box: region.box })).filter(Boolean);
  return panels.length >= 3 ? { provider: "source-closed-panel-layout-v1", panelCount: panels.length } : null;
}
module.exports = { sourcePanelLayoutEvidence };
