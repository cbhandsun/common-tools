"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { inferSemanticMatrixGrid } = require("../skills/pd-hifi-slideclone/scripts/lib/semantic-matrix-grid");

test("recovers complete comparison matrix boundaries including the header row", () => {
  const image = blankImage(560, 320, "#ffffff");
  for (const y of [64, 128, 192, 256]) fillRect(image, 56, y, 448, 3, "#94a3b8");
  for (const x of [56, 205, 354, 503]) fillRect(image, x, 64, 3, 195, "#94a3b8");
  fillRect(image, 58, 66, 146, 60, "#eff6ff");
  fillRect(image, 207, 66, 146, 60, "#f8fafc");
  fillRect(image, 356, 66, 146, 60, "#f8fafc");

  const grid = inferSemanticMatrixGrid(image, { x: 0, y: 0, w: 560, h: 320 }, { widthPt: 560, heightPt: 320 }, "方案对比 comparison matrix");
  assert.equal(grid.rows, 3);
  assert.equal(grid.columns, 3);
  assert.deepEqual(grid.xLines, [57, 206, 355, 504]);
  assert.deepEqual(grid.yLines, [64.5, 129, 193, 257]);
  assert.equal(grid.stroke, "#94A3B8");
});

test("ignores text-like short strokes that do not span the matrix", () => {
  const image = blankImage(320, 220, "#ffffff");
  for (let row = 0; row < 8; row += 1) fillRect(image, 80, 70 + row * 4, 90, 2, "#334155");
  assert.equal(inferSemanticMatrixGrid(image, { x: 0, y: 0, w: 320, h: 220 }, { widthPt: 320, heightPt: 220 }, "comparison matrix"), null);
});

test("fails closed for malformed, excessive, and unrelated inputs", () => {
  const image = blankImage(100, 100, "#ffffff");
  assert.equal(inferSemanticMatrixGrid(null, { x: 0, y: 0, w: 100, h: 100 }, { widthPt: 100, heightPt: 100 }, "comparison"), null);
  assert.equal(inferSemanticMatrixGrid(image, { x: 0, y: 0, w: -1, h: 100 }, { widthPt: 100, heightPt: 100 }, "comparison"), null);
  assert.equal(inferSemanticMatrixGrid(image, { x: 0, y: 0, w: 100, h: 100 }, { widthPt: 100, heightPt: 100 }, "decorative grid"), null);
  assert.equal(inferSemanticMatrixGrid({ width: 6000, height: 5000, rgba: Buffer.alloc(4) }, { x: 0, y: 0, w: 100, h: 100 }, { widthPt: 100, heightPt: 100 }, "comparison"), null);
});

function blankImage(width, height, color) {
  const image = { width, height, rgba: Buffer.alloc(width * height * 4) };
  fillRect(image, 0, 0, width, height, color);
  return image;
}

function fillRect(image, x, y, w, h, color) {
  const rgb = [0, 2, 4].map((offset) => Number.parseInt(color.slice(1 + offset, 3 + offset), 16));
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const index = (yy * image.width + xx) * 4;
      image.rgba[index] = rgb[0];
      image.rgba[index + 1] = rgb[1];
      image.rgba[index + 2] = rgb[2];
      image.rgba[index + 3] = 255;
    }
  }
}
