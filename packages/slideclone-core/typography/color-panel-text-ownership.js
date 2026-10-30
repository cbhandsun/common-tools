"use strict";
// @ts-check

const { types } = require("node:util");

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && [null, Object.prototype].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value @returns {value is Box} */
function box(value) {
  return record(value) && finite(value.x) && finite(value.y) && finite(value.w) && finite(value.h)
    && value.x >= 0 && value.y >= 0 && value.w > 0 && value.h > 0
    && value.x + value.w <= 100000 && value.y + value.h <= 100000;
}

/** @param {unknown} textBox */
function hasSourceTextGeometry(textBox) {
  return record(textBox) && record(textBox.source) && box(textBox.source.evidenceBox) && box(textBox.box);
}

/** @param {unknown} textBox @param {unknown} panel */
function colorPanelOwnsText(textBox, panel) {
  if (!record(textBox) || !box(textBox.box) || !box(panel)) return false;
  const text = textBox.box;
  const tolerance = Math.min(2, text.h * 0.1);
  const width = Math.max(0, Math.min(panel.x + panel.w + tolerance, text.x + text.w) - Math.max(panel.x - tolerance, text.x));
  const height = Math.max(0, Math.min(panel.y + panel.h + tolerance, text.y + text.h) - Math.max(panel.y - tolerance, text.y));
  return width * height / (text.w * text.h) >= 0.95;
}

module.exports = { colorPanelOwnsText, hasSourceTextGeometry };
