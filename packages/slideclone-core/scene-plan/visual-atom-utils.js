"use strict";

const { DEFAULT_SLIDE } = require("./visual-atom-constants");

function sampleBackground(image, region) {
  const points = [
    [region.x + 2, region.y + 2],
    [region.x + region.w - 3, region.y + 2],
    [region.x + 2, region.y + region.h - 3],
    [region.x + region.w - 3, region.y + region.h - 3]
  ].map(([x, y]) => sampleRgb(image, clamp(x, 0, image.width - 1), clamp(y, 0, image.height - 1)));
  return [
    median(points.map((rgb) => rgb[0])),
    median(points.map((rgb) => rgb[1])),
    median(points.map((rgb) => rgb[2]))
  ];
}

function sampleRgb(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]];
}

function ptToPxBox(box, image, slideSize = DEFAULT_SLIDE, pad = 0) {
  const scaleX = image.width / Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt);
  const scaleY = image.height / Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt);
  const x = clamp(Math.floor(Number(box.x || 0) * scaleX - pad), 0, image.width - 1);
  const y = clamp(Math.floor(Number(box.y || 0) * scaleY - pad), 0, image.height - 1);
  const w = clamp(Math.ceil(Number(box.w || 0) * scaleX + pad * 2), 1, image.width - x);
  const h = clamp(Math.ceil(Number(box.h || 0) * scaleY + pad * 2), 1, image.height - y);
  return { x, y, w, h };
}

function pxToPtBox(box, image, slideSize = DEFAULT_SLIDE, pad = 0) {
  const scaleX = Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt) / image.width;
  const scaleY = Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt) / image.height;
  return {
    x: round(Math.max(0, box.x * scaleX - pad)),
    y: round(Math.max(0, box.y * scaleY - pad)),
    w: round(box.w * scaleX + pad * 2),
    h: round(box.h * scaleY + pad * 2)
  };
}

function pxLineEndpointsToPt(endpoints, image, slideSize = DEFAULT_SLIDE) {
  if (!endpoints?.from || !endpoints?.to) return null;
  const scaleX = Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt) / image.width;
  const scaleY = Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt) / image.height;
  return {
    from: {
      x: round(Number(endpoints.from.x || 0) * scaleX),
      y: round(Number(endpoints.from.y || 0) * scaleY)
    },
    to: {
      x: round(Number(endpoints.to.x || 0) * scaleX),
      y: round(Number(endpoints.to.y || 0) * scaleY)
    }
  };
}

function pxPointsToPt(points, image, slideSize = DEFAULT_SLIDE) {
  const scaleX = Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt) / image.width;
  const scaleY = Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt) / image.height;
  return (points || []).map((point) => ({
    x: round(Number(point.x || 0) * scaleX),
    y: round(Number(point.y || 0) * scaleY)
  }));
}

function pxSankeyBandToPt(band = {}, image, slideSize = DEFAULT_SLIDE) {
  const scaleX = Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt) / image.width;
  const scaleY = Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt) / image.height;
  return {
    sourceX: round(Number(band.sourceX || 0) * scaleX),
    targetX: round(Number(band.targetX || 0) * scaleX),
    sourceTop: round(Number(band.sourceTop || 0) * scaleY),
    sourceBottom: round(Number(band.sourceBottom || 0) * scaleY),
    sourceCenterY: round(Number(band.sourceCenterY || 0) * scaleY),
    targetTop: round(Number(band.targetTop || 0) * scaleY),
    targetBottom: round(Number(band.targetBottom || 0) * scaleY),
    targetCenterY: round(Number(band.targetCenterY || 0) * scaleY),
    sourceThickness: round(Number(band.sourceThickness || 0) * scaleY),
    targetThickness: round(Number(band.targetThickness || 0) * scaleY),
    confidence: round(band.confidence)
  };
}

function overlapRatio(a = {}, b = {}) {
  const x1 = Math.max(Number(a.x || 0), Number(b.x || 0));
  const y1 = Math.max(Number(a.y || 0), Number(b.y || 0));
  const x2 = Math.min(Number(a.x || 0) + Number(a.w || 0), Number(b.x || 0) + Number(b.w || 0));
  const y2 = Math.min(Number(a.y || 0) + Number(a.h || 0), Number(b.y || 0) + Number(b.h || 0));
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1) / Math.max(1, Number(a.w || 0) * Number(a.h || 0));
}

function inAnyMask(x, y, masks = []) {
  return masks.some((mask) => x >= mask.x && x < mask.x + mask.w && y >= mask.y && y < mask.y + mask.h);
}

function boxesNear(a, b, gap) {
  return !(a.x + a.w + gap < b.x || b.x + b.w + gap < a.x || a.y + a.h + gap < b.y || b.y + b.h + gap < a.y);
}

function boxContains(outer = {}, inner = {}, pad = 0) {
  return Number(inner.x || 0) >= Number(outer.x || 0) - pad
    && Number(inner.y || 0) >= Number(outer.y || 0) - pad
    && Number(inner.x || 0) + Number(inner.w || 0) <= Number(outer.x || 0) + Number(outer.w || 0) + pad
    && Number(inner.y || 0) + Number(inner.h || 0) <= Number(outer.y || 0) + Number(outer.h || 0) + pad;
}

function unionBox(a, b) {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function intersectionArea(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function distanceToBox(point, box = {}) {
  const x = Number(point.x || 0);
  const y = Number(point.y || 0);
  const left = Number(box.x || 0);
  const top = Number(box.y || 0);
  const right = left + Number(box.w || 0);
  const bottom = top + Number(box.h || 0);
  const dx = x < left ? left - x : x > right ? x - right : 0;
  const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
  return Math.hypot(dx, dy);
}

function distanceBetweenPoints(a = {}, b = {}) {
  return Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.y || 0) - Number(b.y || 0));
}

function centerOfBox(box = {}) {
  return {
    x: Number(box.x || 0) + Number(box.w || 0) / 2,
    y: Number(box.y || 0) + Number(box.h || 0) / 2
  };
}

function expandPxBox(box, image, pad) {
  const x = clamp(box.x - pad, 0, image.width - 1);
  const y = clamp(box.y - pad, 0, image.height - 1);
  return {
    x,
    y,
    w: clamp(box.w + pad * 2, 1, image.width - x),
    h: clamp(box.h + pad * 2, 1, image.height - y)
  };
}

function luminance([r, g, b]) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function saturation([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function colorDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function rgbToHex(rgb) {
  return `#${rgb.map((value) => clamp(value, 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex) {
  const normalized = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return [0, 0, 0];
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16)
  ];
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 255;
}

function average(values = []) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, values.length);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

module.exports = {
  sampleBackground,
  sampleRgb,
  ptToPxBox,
  pxToPtBox,
  pxLineEndpointsToPt,
  pxPointsToPt,
  pxSankeyBandToPt,
  overlapRatio,
  inAnyMask,
  boxesNear,
  boxContains,
  unionBox,
  intersectionArea,
  distanceToBox,
  distanceBetweenPoints,
  centerOfBox,
  expandPxBox,
  luminance,
  saturation,
  colorDistance,
  rgbToHex,
  hexToRgb,
  median,
  average,
  clamp,
  round
};
