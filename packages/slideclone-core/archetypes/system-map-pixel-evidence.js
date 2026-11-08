"use strict";

function measureSystemMapPictorialEnclosure(sourceImage, diagramBox, slideSize, projectBox) {
  if (!sourceImage || !sourceImage.rgba || !Number.isSafeInteger(sourceImage.width) || !Number.isSafeInteger(sourceImage.height)) {
    return Object.freeze({ detected: false, confidence: 0, sampledEllipses: 0 });
  }
  if (typeof projectBox !== "function") throw new TypeError("projectBox must be a function");
  const region = projectBox(diagramBox, sourceImage, slideSize, 0);
  if (!validRegion(region, sourceImage)) return Object.freeze({ detected: false, confidence: 0, sampledEllipses: 0 });
  let best = 0;
  let sampledEllipses = 0;
  for (let centerY = 0.32; centerY <= 0.48 + 1e-9; centerY += 0.04) {
    for (let radiusX = 0.12; radiusX <= 0.24 + 1e-9; radiusX += 0.03) {
      for (let radiusY = 0.32; radiusY <= 0.52 + 1e-9; radiusY += 0.04) {
        sampledEllipses += 1;
        best = Math.max(best, greenEllipseCoverage(sourceImage, region, { centerX: 0.5, centerY, radiusX, radiusY }));
      }
    }
  }
  return Object.freeze({
    detected: best >= 0.22,
    confidence: round(best),
    sampledEllipses
  });
}

function greenEllipseCoverage(image, region, ellipse) {
  const angularSamples = 360;
  let hits = 0;
  for (let index = 0; index < angularSamples; index += 1) {
    const angle = Math.PI * 2 * index / angularSamples;
    let matched = false;
    for (let thickness = -8; thickness <= 8; thickness += 4) {
      const x = Math.round(region.x + region.w * (ellipse.centerX + (ellipse.radiusX + thickness / region.w) * Math.cos(angle)));
      const y = Math.round(region.y + region.h * (ellipse.centerY + (ellipse.radiusY + thickness / region.h) * Math.sin(angle)));
      if (isSaturatedGreenPixel(image, x, y)) { matched = true; break; }
    }
    if (matched) hits += 1;
  }
  return hits / angularSamples;
}

function isSaturatedGreenPixel(image, x, y) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
  const offset = (y * image.width + x) * 4;
  const red = Number(image.rgba[offset] || 0);
  const green = Number(image.rgba[offset + 1] || 0);
  const blue = Number(image.rgba[offset + 2] || 0);
  const alpha = Number(image.rgba[offset + 3] || 0);
  return alpha >= 64 && green >= 120 && green - red >= 25 && green - blue >= 18;
}

function validRegion(region, image) {
  return region && [region.x, region.y, region.w, region.h].every((value) => Number.isFinite(Number(value)))
    && region.w > 0 && region.h > 0
    && region.x >= 0 && region.y >= 0
    && region.x + region.w <= image.width + 1
    && region.y + region.h <= image.height + 1;
}

function round(value) { return Number(value.toFixed(6)); }

module.exports = { greenEllipseCoverage, isSaturatedGreenPixel, measureSystemMapPictorialEnclosure };
