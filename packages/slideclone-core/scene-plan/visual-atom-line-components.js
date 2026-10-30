"use strict";

const { colorDistance, expandPxBox, inAnyMask, luminance, rgbToHex, saturation } = require("./visual-atom-utils");
const { looksLikeDiagonalLine } = require("./visual-atom-shape-recognition");

function detectAxisLineComponents(image, region, bg, masks) {
  return [
    ...detectHorizontalLineComponents(image, region, bg, masks),
    ...detectVerticalLineComponents(image, region, bg, masks)
  ];
}

function detectHorizontalLineComponents(image, region, bg, masks) {
  const rows = [];
  for (let y = region.y; y < region.y + region.h; y += 1) {
    let count = 0;
    let minX = null;
    let maxX = null;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let x = region.x; x < region.x + region.w; x += 1) {
      if (inAnyMask(x, y, masks) || !isForegroundPixel(image, x, y, bg)) continue;
      const offset = (y * image.width + x) * 4;
      count += 1;
      minX = minX === null ? x : Math.min(minX, x);
      maxX = maxX === null ? x : Math.max(maxX, x);
      sumR += image.rgba[offset];
      sumG += image.rgba[offset + 1];
      sumB += image.rgba[offset + 2];
    }
    const span = minX === null ? 0 : maxX - minX + 1;
    if (span >= region.w * 0.42 && count / Math.max(1, span) >= 0.42) {
      rows.push({ y, count, minX, maxX, sumR, sumG, sumB });
    }
  }
  return groupedAxisLineComponents(rows, "h", image, region);
}

function detectVerticalLineComponents(image, region, bg, masks) {
  const cols = [];
  for (let x = region.x; x < region.x + region.w; x += 1) {
    let count = 0;
    let minY = null;
    let maxY = null;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let y = region.y; y < region.y + region.h; y += 1) {
      if (inAnyMask(x, y, masks) || !isForegroundPixel(image, x, y, bg)) continue;
      const offset = (y * image.width + x) * 4;
      count += 1;
      minY = minY === null ? y : Math.min(minY, y);
      maxY = maxY === null ? y : Math.max(maxY, y);
      sumR += image.rgba[offset];
      sumG += image.rgba[offset + 1];
      sumB += image.rgba[offset + 2];
    }
    const span = minY === null ? 0 : maxY - minY + 1;
    if (span >= region.h * 0.42 && count / Math.max(1, span) >= 0.42) {
      cols.push({ x, count, minY, maxY, sumR, sumG, sumB });
    }
  }
  return groupedAxisLineComponents(cols, "v", image, region);
}

function groupedAxisLineComponents(items, axis, image, region) {
  const result = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const total = group.reduce((sum, item) => sum + item.count, 0);
    if (axis === "h") {
      const minX = Math.min(...group.map((item) => item.minX));
      const maxX = Math.max(...group.map((item) => item.maxX));
      const minY = Math.min(...group.map((item) => item.y));
      const maxY = Math.max(...group.map((item) => item.y));
      if (maxX - minX + 1 >= region.w * 0.42 && maxY - minY + 1 <= Math.max(10, region.h * 0.035)) {
        result.push(axisLineComponent({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, group, total, image, "h"));
      }
    } else {
      const minX = Math.min(...group.map((item) => item.x));
      const maxX = Math.max(...group.map((item) => item.x));
      const minY = Math.min(...group.map((item) => item.minY));
      const maxY = Math.max(...group.map((item) => item.maxY));
      if (maxY - minY + 1 >= region.h * 0.42 && maxX - minX + 1 <= Math.max(10, region.w * 0.035)) {
        result.push(axisLineComponent({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, group, total, image, "v"));
      }
    }
    group = [];
  };
  const coordinate = axis === "h" ? "y" : "x";
  for (const item of items) {
    if (!group.length || item[coordinate] <= group[group.length - 1][coordinate] + 1) group.push(item);
    else {
      flush();
      group.push(item);
    }
  }
  flush();
  return result;
}

function axisLineComponent(box, group, pixelCount, image, axis) {
  const sums = group.reduce((acc, item) => {
    acc.r += item.sumR;
    acc.g += item.sumG;
    acc.b += item.sumB;
    return acc;
  }, { r: 0, g: 0, b: 0 });
  return {
    box: expandPxBox(box, image, 0),
    pixelCount,
    color: rgbToHex([
      Math.round(sums.r / Math.max(1, pixelCount)),
      Math.round(sums.g / Math.max(1, pixelCount)),
      Math.round(sums.b / Math.max(1, pixelCount))
    ]),
    kind: "grid-line-candidate",
    shapeHint: axis === "h" ? "grid-line-horizontal" : "grid-line-vertical",
    axis
  };
}

function detectDiagonalLineComponents(components = [], region = {}) {
  return (components || [])
    .filter((component) => looksLikeDiagonalLine(component, region))
    .map((component) => ({
      ...component,
      kind: "connector-line-candidate",
      shapeHint: "line-diagonal"
    }));
}

function isForegroundPixel(image, x, y, bg) {
  const offset = (y * image.width + x) * 4;
  const alpha = image.rgba[offset + 3];
  if (alpha < 16) return false;
  const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]];
  const lum = luminance(rgb);
  const sat = saturation(rgb);
  const bgDistance = colorDistance(rgb, bg);
  if (lum > 248 && sat < 0.06) return false;
  return bgDistance > 26 || sat > 0.18 || lum < 210;
}

function isLowContrastContainerPixel(image, x, y, bg) {
  const offset = (y * image.width + x) * 4;
  const alpha = image.rgba[offset + 3];
  if (alpha < 16) return false;
  const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]];
  const lum = luminance(rgb);
  const sat = saturation(rgb);
  const bgDistance = colorDistance(rgb, bg);
  return bgDistance >= 8
    && bgDistance <= 32
    && lum >= 210
    && lum <= 248
    && sat <= 0.18;
}

module.exports = {
  detectAxisLineComponents,
  detectHorizontalLineComponents,
  detectVerticalLineComponents,
  groupedAxisLineComponents,
  axisLineComponent,
  detectDiagonalLineComponents,
  isForegroundPixel,
  isLowContrastContainerPixel
};
