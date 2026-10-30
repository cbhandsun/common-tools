"use strict";



function sameBox(left, right) {
  return ["x", "y", "w", "h"].every((key) => Number(left?.[key]) === Number(right?.[key]));
}

function boundedCandidateLimits(count) {
  if (!Number.isSafeInteger(count) || count < 1) return [];
  return [...new Set([1, 2, 3, 6, 12, count].filter((value) => value <= count))];
}

function focusedCandidateLimits(count) {
  if (!Number.isSafeInteger(count) || count < 1) return [];
  return [...new Set([1, Math.min(3, count)].filter((value) => value <= count))];
}

function clampSlideBox(box, slideSize) {
  if (!box || !slideSize) return null;
  const x1 = Math.max(0, Math.min(slideSize.widthPt, Number(box.x)));
  const y1 = Math.max(0, Math.min(slideSize.heightPt, Number(box.y)));
  const x2 = Math.max(x1, Math.min(slideSize.widthPt, Number(box.x) + Number(box.w)));
  const y2 = Math.max(y1, Math.min(slideSize.heightPt, Number(box.y) + Number(box.h)));
  if (![x1, y1, x2, y2].every(Number.isFinite) || x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function hexColor(value) {
  const match = /^#([0-9a-f]{6})$/iu.exec(String(value || ""));
  if (!match) return null;
  const numeric = Number.parseInt(match[1], 16);
  return { r: numeric >> 16, g: (numeric >> 8) & 255, b: numeric & 255 };
}

function colorBrightness(color) {
  return color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
}

function dominantColor(colors) {
  const bins = new Map();
  for (const color of colors) {
    const key = `${color.r >> 4},${color.g >> 4},${color.b >> 4}`;
    const current = bins.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    current.r += color.r; current.g += color.g; current.b += color.b; current.count += 1;
    bins.set(key, current);
  }
  let best = null;
  for (const value of bins.values()) if (!best || value.count > best.count) best = value;
  return best ? { r: best.r / best.count, g: best.g / best.count, b: best.b / best.count } : null;
}

function ptToPxBox(box, image, slideSize) {
  const scaleX = image.width / slideSize.widthPt; const scaleY = image.height / slideSize.heightPt;
  const left = Math.max(0, Math.floor(box.x * scaleX));
  const top = Math.max(0, Math.floor(box.y * scaleY));
  const right = Math.min(image.width, Math.ceil((box.x + box.w) * scaleX));
  const bottom = Math.min(image.height, Math.ceil((box.y + box.h) * scaleY));
  return right > left && bottom > top ? { x: left, y: top, w: right - left, h: bottom - top } : null;
}

function pxToPtBox(box, image, slideSize) {
  return { x: box.x * slideSize.widthPt / image.width, y: box.y * slideSize.heightPt / image.height, w: box.w * slideSize.widthPt / image.width, h: box.h * slideSize.heightPt / image.height };
}

function pixelColor(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return { r: image.rgba[offset] ?? 0, g: image.rgba[offset + 1] ?? 0, b: image.rgba[offset + 2] ?? 0, a: image.rgba[offset + 3] ?? 0 };
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, Number(value)));
}

function colorHexDistance(left, right) {
  const a = hexColor(left);
  const b = hexColor(right);
  if (!a || !b) return 0;
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

const VISUAL_FALLBACK_REJECTION_CODE = Object.freeze({
  graphicalObjectsRegressed: 1,
  connectorsRegressed: 2,
  largeRasterEditability: 3,
  nativeComponentQuality: 4,
  deckValidation: 5,
  build: 6,
  quality: 7,
  artifact: 8,
  unexpected: 9,
  semanticEditability: 10
});

const NATIVE_ONLY_RESIDUAL_REJECTION_CODE = Object.freeze({
  deckValidation: 1,
  build: 2,
  artifact: 3,
  quality: 4,
  unexpected: 5
});

const TEXT_FIDELITY_PRIMITIVE_MAX_RUNS = 4000;

const COMPONENT_FIDELITY_PRIMITIVE_MAX_RUNS = 160;

const TEXT_FIDELITY_DELTA_THRESHOLD = 12;

const TEXT_FIDELITY_PRIMITIVE_BUDGETS = Object.freeze([4000, 3400, 3000, 2600, 2200, 1800, 1600, 1200, 800, 400, 200, 100, 60, 50, 45, 40, 30, 20, 10, 5, 1]);

const COMPONENT_FIDELITY_PRIMITIVE_BUDGETS = Object.freeze([160, 80, 40, 20]);

const RESIDUAL_PRIMITIVE_MAX_SHAPES = 2600;

const RESIDUAL_PRIMITIVE_SCAN_STEP_PX = 2;

function isRaster(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Number.isSafeInteger(value.width)
    && Number.isSafeInteger(value.height)
    && value.width > 0
    && value.height > 0
    && value.rgba instanceof Uint8Array;
}

function isFiniteBox(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && ["x", "y", "w", "h"].every((key) => Number.isFinite(Number(value[key])))
    && Number(value.w) > 0
    && Number(value.h) > 0;
}

function isSlideSize(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Number.isFinite(Number(value.widthPt))
    && Number.isFinite(Number(value.heightPt))
    && Number(value.widthPt) > 0
    && Number(value.heightPt) > 0;
}

function colorDistance(left, right) {
  return Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b);
}

function brightness(color) {
  return color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
}

function saturationProxy(color) {
  return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
}

function rgbToHex(color) {
  const part = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0").toUpperCase();
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

const NATIVE_ONLY_COMPONENT_FIDELITY_PRIMITIVE_BUDGETS = Object.freeze([80]);

module.exports = { sameBox, boundedCandidateLimits, focusedCandidateLimits, clampSlideBox, hexColor, colorBrightness, dominantColor, ptToPxBox, pxToPtBox, pixelColor, clampUnit, colorHexDistance, VISUAL_FALLBACK_REJECTION_CODE, NATIVE_ONLY_RESIDUAL_REJECTION_CODE, TEXT_FIDELITY_PRIMITIVE_MAX_RUNS, COMPONENT_FIDELITY_PRIMITIVE_MAX_RUNS, TEXT_FIDELITY_DELTA_THRESHOLD, TEXT_FIDELITY_PRIMITIVE_BUDGETS, COMPONENT_FIDELITY_PRIMITIVE_BUDGETS, RESIDUAL_PRIMITIVE_MAX_SHAPES, RESIDUAL_PRIMITIVE_SCAN_STEP_PX, isRaster, isFiniteBox, isSlideSize, colorDistance, brightness, saturationProxy, rgbToHex, round, NATIVE_ONLY_COMPONENT_FIDELITY_PRIMITIVE_BUDGETS };
