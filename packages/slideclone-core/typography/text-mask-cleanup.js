"use strict";

function eraseDarkPixelsInRects(image, rects = [], options = {}) {
  if (!isImage(image)) return { image, erasedPixels: 0 };
  if (!Array.isArray(rects) || rects.length === 0) return { image, erasedPixels: 0 };
  const maxLuma = clampNumber(options.maxLuma, 0, 255, 110);
  const fill = normalizeFill(options.fill);
  const next = { width: image.width, height: image.height, rgba: Buffer.from(image.rgba) };
  let erasedPixels = 0;

  for (const rect of rects) {
    const bounds = clampRect(rect, image.width, image.height);
    if (!bounds) continue;
    for (let y = bounds.y; y < bounds.y + bounds.h; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.w; x += 1) {
        const offset = (y * image.width + x) * 4;
        if (next.rgba[offset + 3] < 32) continue;
        const luma = next.rgba[offset] * 0.2126
          + next.rgba[offset + 1] * 0.7152
          + next.rgba[offset + 2] * 0.0722;
        if (luma > maxLuma) continue;
        next.rgba[offset] = fill.r;
        next.rgba[offset + 1] = fill.g;
        next.rgba[offset + 2] = fill.b;
        next.rgba[offset + 3] = fill.a;
        erasedPixels += 1;
      }
    }
  }
  return { image: next, erasedPixels };
}

function isImage(image) {
  return Number.isInteger(image?.width)
    && image.width > 0
    && Number.isInteger(image?.height)
    && image.height > 0
    && Buffer.isBuffer(image?.rgba)
    && image.rgba.length >= image.width * image.height * 4;
}

function clampRect(rect, width, height) {
  const x1 = Math.max(0, Math.floor(finite(rect?.x)));
  const y1 = Math.max(0, Math.floor(finite(rect?.y)));
  const x2 = Math.min(width, Math.ceil(finite(rect?.x) + Math.max(0, finite(rect?.w))));
  const y2 = Math.min(height, Math.ceil(finite(rect?.y) + Math.max(0, finite(rect?.h))));
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function normalizeFill(fill = {}) {
  return {
    r: Math.round(clampNumber(fill.r, 0, 255, 255)),
    g: Math.round(clampNumber(fill.g, 0, 255, 255)),
    b: Math.round(clampNumber(fill.b, 0, 255, 255)),
    a: Math.round(clampNumber(fill.a, 0, 255, 255))
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

module.exports = { eraseDarkPixelsInRects };
