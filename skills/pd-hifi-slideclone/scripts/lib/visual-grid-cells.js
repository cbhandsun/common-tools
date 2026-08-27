"use strict";

const MAX_GRID_LINES = 65;

function inferVisualGridCells(visualGrid = {}, sourceImage = null, slideSize = {}) {
  if (!visualGrid || typeof visualGrid !== "object" || Array.isArray(visualGrid)) return [];
  if (!isValidImage(sourceImage)) return [];
  const widthPt = finitePositive(slideSize.widthPt);
  const heightPt = finitePositive(slideSize.heightPt);
  if (!widthPt || !heightPt) return [];
  const xLines = normalizeLines(visualGrid.xLines, widthPt);
  const yLines = normalizeLines(visualGrid.yLines, heightPt);
  if (xLines.length < 2 || yLines.length < 2) return [];
  const cells = [];
  for (let row = 0; row < yLines.length - 1; row += 1) {
    for (let column = 0; column < xLines.length - 1; column += 1) {
      const x = xLines[column];
      const y = yLines[row];
      const w = xLines[column + 1] - x;
      const h = yLines[row + 1] - y;
      if (w <= 0 || h <= 0) continue;
      cells.push({
        row,
        column,
        box: roundedBox({ x, y, w, h }),
        fill: sampleCellColor(sourceImage, { x, y, w, h }, { widthPt, heightPt })
      });
    }
  }
  return cells;
}

function normalizeLines(values, maximum) {
  if (!Array.isArray(values) || values.length < 2 || values.length > MAX_GRID_LINES) return [];
  const numbers = values.map(Number);
  if (numbers.some((value) => !Number.isFinite(value) || value < 0 || value > maximum)) return [];
  const unique = [...new Set(numbers.map((value) => Math.round(value * 1000) / 1000))].sort((a, b) => a - b);
  return unique.length >= 2 ? unique : [];
}

function sampleCellColor(image, box, slideSize) {
  const counts = new Map();
  for (const fy of [0.22, 0.5, 0.78]) {
    for (const fx of [0.22, 0.5, 0.78]) {
      const px = Math.max(0, Math.min(image.width - 1, Math.round((box.x + box.w * fx) / slideSize.widthPt * image.width)));
      const py = Math.max(0, Math.min(image.height - 1, Math.round((box.y + box.h * fy) / slideSize.heightPt * image.height)));
      const offset = (py * image.width + px) * 4;
      if (image.rgba[offset + 3] < 64) continue;
      const color = rgbToHex(
        quantize(image.rgba[offset]),
        quantize(image.rgba[offset + 1]),
        quantize(image.rgba[offset + 2])
      );
      counts.set(color, (counts.get(color) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "#FFFFFF";
}

function quantize(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value || 0) / 4) * 4));
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function roundedBox(box) {
  return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value * 10000) / 10000]));
}

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function isValidImage(image) {
  return Boolean(
    image
    && Number.isInteger(image.width)
    && Number.isInteger(image.height)
    && image.width > 0
    && image.height > 0
    && Buffer.isBuffer(image.rgba)
    && image.rgba.length >= image.width * image.height * 4
  );
}

module.exports = {
  inferVisualGridCells,
  _private: {
    normalizeLines,
    sampleCellColor
  }
};
