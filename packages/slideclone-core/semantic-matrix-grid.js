"use strict";

const MAX_PIXELS = 24_000_000;
const MAX_LINES = 32;

function inferSemanticMatrixGrid(sourceImage, regionBox = {}, slideSize = {}, semanticHint = "") {
  if (!isComparisonSemanticHint(semanticHint) || !validImage(sourceImage)) return null;
  const widthPt = finitePositive(slideSize.widthPt);
  const heightPt = finitePositive(slideSize.heightPt);
  if (!widthPt || !heightPt || !validBox(regionBox, widthPt, heightPt)) return null;
  const pxBox = toPixelBox(regionBox, sourceImage, { widthPt, heightPt });
  if (pxBox.w < 40 || pxBox.h < 40) return null;
  const background = sampleBackground(sourceImage, pxBox);
  const xPixels = projectionLines(sourceImage, pxBox, background, "v");
  const yPixels = projectionLines(sourceImage, pxBox, background, "h");
  if (xPixels.length < 3 || yPixels.length < 3 || xPixels.length > MAX_LINES || yPixels.length > MAX_LINES) return null;
  const xLines = xPixels.map((value) => round(value / sourceImage.width * widthPt));
  const yLines = yPixels.map((value) => round(value / sourceImage.height * heightPt));
  const bounds = {
    x: xLines[0],
    y: yLines[0],
    w: round(xLines[xLines.length - 1] - xLines[0]),
    h: round(yLines[yLines.length - 1] - yLines[0])
  };
  if (bounds.w <= 0 || bounds.h <= 0) return null;
  return {
    provider: "semantic-matrix-grid-v1",
    rows: yLines.length - 1,
    columns: xLines.length - 1,
    xLines,
    yLines,
    bounds,
    coverageRatio: round(bounds.w * bounds.h / Math.max(1, widthPt * heightPt)),
    lineCount: xLines.length + yLines.length,
    stroke: sampleStroke(sourceImage, xPixels, yPixels)
  };
}

function isComparisonSemanticHint(value) {
  return /comparison[-_\s]?matrix|comparison[-_\s]?table|compare|对比矩阵|方案对比|竞品对比|比较表|对照表/i.test(String(value || ""));
}

function projectionLines(image, box, background, axis) {
  const positions = [];
  const length = axis === "h" ? box.h : box.w;
  const span = axis === "h" ? box.w : box.h;
  const minimum = span * (axis === "h" ? 0.52 : 0.42);
  for (let offset = 0; offset < length; offset += 1) {
    let contrast = 0;
    for (let step = 0; step < span; step += 1) {
      const x = axis === "h" ? box.x + step : box.x + offset;
      const y = axis === "h" ? box.y + offset : box.y + step;
      const rgb = sampleRgb(image, x, y);
      if (isLineContrast(rgb, background)) contrast += 1;
    }
    if (contrast >= minimum) positions.push((axis === "h" ? box.y : box.x) + offset);
  }
  return clusterPositions(positions);
}

function clusterPositions(values) {
  const clusters = [];
  for (const value of values) {
    const current = clusters[clusters.length - 1];
    if (!current || value > current[current.length - 1] + 1) clusters.push([value]);
    else current.push(value);
  }
  return clusters.map((cluster) => cluster.reduce((sum, value) => sum + value, 0) / cluster.length);
}

function isLineContrast(rgb, background) {
  const distance = Math.hypot(rgb[0] - background[0], rgb[1] - background[1], rgb[2] - background[2]);
  const luminance = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
  const bgLuminance = (background[0] * 299 + background[1] * 587 + background[2] * 114) / 1000;
  return distance >= 38 && Math.abs(luminance - bgLuminance) >= 28;
}

function sampleBackground(image, box) {
  const points = [
    [box.x, box.y],
    [box.x + box.w - 1, box.y],
    [box.x, box.y + box.h - 1],
    [box.x + box.w - 1, box.y + box.h - 1]
  ];
  const samples = points.map(([x, y]) => sampleRgb(image, x, y));
  return [0, 1, 2].map((channel) => Math.round(samples.reduce((sum, rgb) => sum + rgb[channel], 0) / samples.length));
}

function sampleStroke(image, xLines, yLines) {
  const x = Math.max(0, Math.min(image.width - 1, Math.round(xLines[0])));
  const y = Math.max(0, Math.min(image.height - 1, Math.round(yLines[0])));
  return rgbToHex(sampleRgb(image, x, y));
}

function sampleRgb(image, x, y) {
  const safeX = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const safeY = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  const offset = (safeY * image.width + safeX) * 4;
  return [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]];
}

function toPixelBox(box, image, slideSize) {
  const x = Math.max(0, Math.floor(Number(box.x) / slideSize.widthPt * image.width));
  const y = Math.max(0, Math.floor(Number(box.y) / slideSize.heightPt * image.height));
  const right = Math.min(image.width, Math.ceil((Number(box.x) + Number(box.w)) / slideSize.widthPt * image.width));
  const bottom = Math.min(image.height, Math.ceil((Number(box.y) + Number(box.h)) / slideSize.heightPt * image.height));
  return { x, y, w: right - x, h: bottom - y };
}

function validImage(image) {
  return Boolean(image && Number.isInteger(image.width) && Number.isInteger(image.height)
    && image.width > 0 && image.height > 0 && image.width * image.height <= MAX_PIXELS
    && image.rgba && image.rgba.length >= image.width * image.height * 4);
}

function validBox(box, widthPt, heightPt) {
  const values = [box?.x, box?.y, box?.w, box?.h].map(Number);
  return values.every(Number.isFinite) && values[2] > 0 && values[3] > 0
    && values[0] >= 0 && values[1] >= 0
    && values[0] + values[2] <= widthPt && values[1] + values[3] <= heightPt;
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function rgbToHex(rgb) {
  return `#${rgb.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function round(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

module.exports = { inferSemanticMatrixGrid, isComparisonSemanticHint };
