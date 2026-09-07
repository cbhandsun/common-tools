// @ts-check
"use strict";

const MAX_ITEMS = 2000;
const MAX_SLIDE_DIMENSION = 100000;
const MAX_ID_LENGTH = 256;
const MAX_TEXT_LENGTH = 512;

/** @typedef {{x: number, y: number, w: number, h: number}} Bounds */
/** @typedef {{source: Bounds, rendered: Bounds}} Measurement */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** @param {unknown} value @param {string} message @returns {Record<string, unknown>} */
function requiredRecord(value, message) {
  if (!record(value)) throw new TypeError(message);
  return value;
}

/** @param {unknown} value @param {string} message @returns {unknown[]} */
function boundedList(value, message) {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) throw new TypeError(message);
  return value;
}

/** @param {unknown} value @param {string} message */
function finite(value, message) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(message);
  return value;
}

/** @param {unknown} value @param {string} message */
function identifier(value, message) {
  if (typeof value !== "string" || !value || value.length > MAX_ID_LENGTH) throw new TypeError(message);
  return value;
}

/** @param {unknown} value @param {{widthPt: number, heightPt: number}} slideSize @param {string} message @returns {Bounds} */
function box(value, slideSize, message) {
  const entry = requiredRecord(value, message);
  const x = finite(entry.x, message), y = finite(entry.y, message), w = finite(entry.w, message), h = finite(entry.h, message);
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > slideSize.widthPt || y + h > slideSize.heightPt) throw new RangeError(message);
  return { x, y, w, h };
}

/** @param {unknown} value */
function slide(value) {
  const entry = requiredRecord(value, "measured text fit slide size is invalid");
  const widthPt = finite(entry.widthPt, "measured text fit slide size is invalid");
  const heightPt = finite(entry.heightPt, "measured text fit slide size is invalid");
  if (widthPt <= 0 || heightPt <= 0 || widthPt > MAX_SLIDE_DIMENSION || heightPt > MAX_SLIDE_DIMENSION) throw new RangeError("measured text fit slide size is invalid");
  return { widthPt, heightPt };
}

/** @param {unknown} value @param {{widthPt: number, heightPt: number}} slideSize */
function measurements(value, slideSize) {
  /** @type {Map<string, Measurement>} */
  const result = new Map();
  for (const item of boundedList(value, "measured text fit measurements are invalid")) {
    const entry = requiredRecord(item, "measured text fit measurement is invalid");
    const id = identifier(entry.id, "measured text fit measurement id is invalid");
    if (result.has(id)) throw new TypeError("measured text fit measurement ids are ambiguous");
    result.set(id, { source: box(entry.source, slideSize, "measured text fit source bounds are invalid"), rendered: box(entry.rendered, slideSize, "measured text fit rendered bounds are invalid") });
  }
  return result;
}

/** @param {Record<string, unknown>} text @param {{widthPt: number, heightPt: number}} slideSize */
function eligible(text, slideSize) {
  if (typeof text.text !== "string" || text.text.length < 1 || text.text.length > MAX_TEXT_LENGTH || /[\r\n]/u.test(text.text)) return null;
  if (text.rotation !== undefined && (typeof text.rotation !== "number" || !Number.isFinite(text.rotation) || text.rotation !== 0)) return null;
  const style = record(text.style) ? text.style : null;
  const source = record(text.source) ? text.source : null;
  const font = record(text.font) ? text.font : null;
  if (!style || !source || !font || style.visibility !== "visible" || style.wrap !== false || style.fit === "shrink"
    || (style.opacity !== undefined && (typeof style.opacity !== "number" || !Number.isFinite(style.opacity) || style.opacity <= 0))
    || (font.opacity !== undefined && (typeof font.opacity !== "number" || !Number.isFinite(font.opacity) || font.opacity <= 0))
    || source.editable !== true || typeof source.confidence !== "number" || !Number.isFinite(source.confidence) || source.confidence < 0.8 || source.confidence > 1
    || font.align !== "left" || font.valign !== "middle") return null;
  const sizePt = font.sizePt;
  if (typeof sizePt !== "number" || !Number.isFinite(sizePt) || sizePt < 6 || sizePt > 96) return null;
  try { return { box: box(text.box, slideSize, "measured text fit text box is invalid"), sizePt }; }
  catch { return null; }
}

/**
 * Plans conservative, measurement-backed adjustments for visible editable single-line text.
 * Rejected text box objects retain their original references; accepted objects clone only box and font.
 * @param {unknown} input
 */
function planMeasuredSingleLineTextFit(input) {
  const request = requiredRecord(input, "measured text fit request is invalid");
  const slideSize = slide(request.slideSize);
  const textBoxes = boundedList(request.textBoxes, "measured text fit text boxes are invalid");
  const byId = measurements(request.measurements, slideSize);
  const ids = new Set();
  for (const item of textBoxes) {
    const text = requiredRecord(item, "measured text fit text box is invalid");
    const id = identifier(text.id, "measured text fit text box id is invalid");
    if (ids.has(id)) throw new TypeError("measured text fit text box ids are ambiguous");
    ids.add(id);
  }

  let candidates = 0;
  /** @type {{id: string, index: number, ratio: number, dx: number, dy: number, sizePt: number}[]} */
  const changes = [];
  const next = textBoxes.map((item, index) => {
    const text = /** @type {Record<string, unknown>} */ (item);
    const admissible = eligible(text, slideSize);
    const measurement = byId.get(/** @type {string} */ (text.id));
    if (!admissible || !measurement) return item;
    candidates += 1;

    const widthRatio = measurement.source.w / measurement.rendered.w;
    const heightRatio = measurement.source.h / measurement.rendered.h;
    if (widthRatio < 1.04 || widthRatio > 1.5 || heightRatio < 1.04 || heightRatio > 1.6 || Math.abs(widthRatio / heightRatio - 1) > 0.15) return item;
    const ratio = Math.min(widthRatio, heightRatio);
    const centerY = admissible.box.y + admissible.box.h / 2;
    const dx = measurement.source.x - (admissible.box.x + (measurement.rendered.x - admissible.box.x) * ratio);
    const dy = measurement.source.y - (centerY + (measurement.rendered.y - centerY) * ratio);
    if (Math.abs(dx) > 8 || Math.abs(dy) > 6) return item;
    const sizePt = Math.round(admissible.sizePt * ratio * 100) / 100;
    const nextBox = { ...admissible.box, x: admissible.box.x + dx, y: admissible.box.y + dy };
    if (sizePt > 96 || nextBox.x < 0 || nextBox.y < 0 || nextBox.x + nextBox.w > slideSize.widthPt || nextBox.y + nextBox.h > slideSize.heightPt) return item;
    changes.push({ id: /** @type {string} */ (text.id), index, ratio, dx, dy, sizePt });
    return { ...text, box: nextBox, font: { .../** @type {Record<string, unknown>} */ (text.font), sizePt } };
  });
  return { textBoxes: next, evidence: { candidates, accepted: changes.length }, changes };
}

module.exports = { planMeasuredSingleLineTextFit };
