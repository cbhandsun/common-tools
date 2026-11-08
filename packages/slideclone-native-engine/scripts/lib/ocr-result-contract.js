"use strict";
const { types } = require("node:util");

const MAX_ITEMS = 20_000;
const MAX_TEXT_LENGTH = 4_096;
const MAX_COORDINATE = 1_000_000;

function normalizeOcrItems(value, options = {}) {
  if (!Array.isArray(value)) throw new Error("OCR result items are invalid");
  if (value.length > MAX_ITEMS) throw new Error("OCR result exceeds the item limit");
  const imageWidth = positiveNumberOrNull(options.imageWidth);
  const imageHeight = positiveNumberOrNull(options.imageHeight);
  return value.map((item, index) => normalizeOcrItem(item, index, { imageWidth, imageHeight }));
}

function normalizeOcrItem(value, index, bounds) {
  if (!value || typeof value !== "object" || Array.isArray(value) || types.isProxy(value)) {
    throw new Error(`OCR item ${index} is invalid`);
  }
  const text = normalizeText(value.text, index);
  const polygon = normalizePolygon(value.polygon ?? value.box, index, bounds);
  const confidence = normalizeConfidence(value.confidence ?? value.score, index);
  const orientation = normalizeOrientation(value.orientation, index);
  const hintsProperty = Object.getOwnPropertyDescriptor(value, "wordPositionHints");
  if (hintsProperty && !("value" in hintsProperty)) throw new Error("OCR word position is invalid");
  const wordPositionHints = normalizeWordPositionHints(hintsProperty?.value, text, polygon, index, bounds);
  return Object.freeze({ text, confidence, polygon, orientation, ...(wordPositionHints ? { wordPositionHints } : {}) });
}

function normalizeWordPositionHints(value, text, polygon, index, bounds) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || types.isProxy(value) || value.length < 1 || value.length > 512) throw new Error("OCR word position is invalid");
  const lineBox = boxFromPolygon(polygon);
  let previous = -Infinity;
  const hints = Array.from({length:value.length}, (_, offset) => {
    const itemProperty = Object.getOwnPropertyDescriptor(value, String(offset));
    if (!itemProperty || !("value" in itemProperty)) throw new Error("OCR word position is invalid");
    const hint = itemProperty.value;
    if (!hint || typeof hint !== "object" || types.isProxy(hint)
      || Object.values(Object.getOwnPropertyDescriptors(hint)).some(property => !("value" in property))
      || typeof hint.text !== "string" || !hint.text || hint.text.length > 512
      || hasControlCharacters(hint.text) || !hint.box) throw new Error("OCR word position is invalid");
    if (typeof hint.box !== "object" || types.isProxy(hint.box)
      || Object.values(Object.getOwnPropertyDescriptors(hint.box)).some(property => !("value" in property)))
      throw new Error("OCR word position is invalid");
    const { x, y, w, h } = hint.box;
    if (![x, y, w, h].every(number => typeof number === "number" && Number.isFinite(number)) || w <= 0 || h <= 0)
      throw new Error("OCR word position is invalid");
    const wordPolygon = normalizePolygon([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], index, bounds);
    if (x < lineBox.x || y < lineBox.y || x + w > lineBox.x + lineBox.w || y + h > lineBox.y + lineBox.h || x + w / 2 <= previous)
      throw new Error("OCR word position is invalid");
    previous = x + w / 2;
    return Object.freeze({ text: hint.text, box: Object.freeze(boxFromPolygon(wordPolygon)) });
  });
  if (hints.map(hint => hint.text).join("") !== text) throw new Error("OCR word position sequence is invalid");
  return Object.freeze(hints);
}

function normalizeText(value, index) {
  if (typeof value !== "string") throw new Error(`OCR item ${index} text is invalid`);
  const text = value.trim();
  if (!text || text.length > MAX_TEXT_LENGTH || hasControlCharacters(text, true)) {
    throw new Error(`OCR item ${index} text is invalid`);
  }
  return text;
}

function hasControlCharacters(text, allowWhitespace = false) {
  return Array.from(text).some(character => {
    const code = character.charCodeAt(0);
    return !(allowWhitespace && [9, 10, 13].includes(code)) && (code < 32 || code === 127);
  });
}

function normalizePolygon(value, index, bounds) {
  if (!Array.isArray(value) || value.length < 4 || value.length > 16) {
    throw new Error(`OCR item ${index} polygon is invalid`);
  }
  const polygon = value.map((point) => {
    if (!Array.isArray(point) || point.length !== 2) throw new Error(`OCR item ${index} polygon is invalid`);
    const x = finiteCoordinate(point[0], index);
    const y = finiteCoordinate(point[1], index);
    if ((bounds.imageWidth !== null && x > bounds.imageWidth) || (bounds.imageHeight !== null && y > bounds.imageHeight)) {
      throw new Error(`OCR item ${index} polygon is outside the image`);
    }
    return Object.freeze([x, y]);
  });
  const box = boxFromPolygon(polygon);
  if (box.w <= 0 || box.h <= 0) throw new Error(`OCR item ${index} polygon has no area`);
  return Object.freeze(polygon);
}

function normalizeConfidence(value, index) {
  if (value === null || value === undefined) return null;
  const confidence = Number(value);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`OCR item ${index} confidence is invalid`);
  }
  return confidence;
}

function normalizeOrientation(value, index) {
  if (value === null || value === undefined || value === -1) return null;
  const orientation = Number(value);
  if (!Number.isFinite(orientation) || orientation < -360 || orientation > 360) {
    throw new Error(`OCR item ${index} orientation is invalid`);
  }
  return orientation;
}

function finiteCoordinate(value, index) {
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate) || coordinate < 0 || coordinate > MAX_COORDINATE) {
    throw new Error(`OCR item ${index} polygon is invalid`);
  }
  return coordinate;
}

function boxFromPolygon(polygon) {
  const xs = polygon.map((point) => point[0]);
  const ys = polygon.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function positiveNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= MAX_COORDINATE ? number : null;
}

module.exports = {
  MAX_ITEMS,
  MAX_TEXT_LENGTH,
  boxFromPolygon,
  normalizeOcrItems
};
