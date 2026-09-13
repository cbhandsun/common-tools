"use strict";

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
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`OCR item ${index} is invalid`);
  }
  const text = normalizeText(value.text, index);
  const polygon = normalizePolygon(value.polygon ?? value.box, index, bounds);
  const confidence = normalizeConfidence(value.confidence ?? value.score, index);
  const orientation = normalizeOrientation(value.orientation, index);
  return Object.freeze({ text, confidence, polygon, orientation });
}

function normalizeText(value, index) {
  if (typeof value !== "string") throw new Error(`OCR item ${index} text is invalid`);
  const text = value.trim();
  if (!text || text.length > MAX_TEXT_LENGTH || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
    throw new Error(`OCR item ${index} text is invalid`);
  }
  return text;
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
