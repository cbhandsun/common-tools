"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { inferVisualGridCells } = require("../skills/pd-hifi-slideclone/scripts/lib/visual-grid-cells");

test("visual grid cells sample bounded native cell colors", () => {
  const image = rgbaImage(100, 100, "#FFFFFF");
  fillRect(image, 0, 0, 50, 50, "#DC2626");
  fillRect(image, 50, 0, 50, 50, "#16A34A");
  fillRect(image, 0, 50, 50, 50, "#2563EB");
  fillRect(image, 50, 50, 50, 50, "#FACC15");

  const cells = inferVisualGridCells(
    { xLines: [0, 50, 100], yLines: [0, 50, 100] },
    image,
    { widthPt: 100, heightPt: 100 }
  );

  assert.equal(cells.length, 4);
  assert.deepEqual(cells.map((cell) => cell.box), [
    { x: 0, y: 0, w: 50, h: 50 },
    { x: 50, y: 0, w: 50, h: 50 },
    { x: 0, y: 50, w: 50, h: 50 },
    { x: 50, y: 50, w: 50, h: 50 }
  ]);
  assert.deepEqual(cells.map((cell) => cell.fill), ["#DC2828", "#18A44C", "#2464EC", "#FCCC14"]);
});

test("visual grid cells fail closed for malformed and extreme external geometry", () => {
  const image = rgbaImage(10, 10, "#FFFFFF");
  assert.deepEqual(inferVisualGridCells({}, image, { widthPt: 10, heightPt: 10 }), []);
  assert.deepEqual(inferVisualGridCells({ xLines: [0, Number.NaN], yLines: [0, 10] }, image, { widthPt: 10, heightPt: 10 }), []);
  assert.deepEqual(inferVisualGridCells({ xLines: [0, 11], yLines: [0, 10] }, image, { widthPt: 10, heightPt: 10 }), []);
  assert.deepEqual(inferVisualGridCells({ xLines: Array.from({ length: 66 }, (_, index) => index), yLines: [0, 10] }, image, { widthPt: 100, heightPt: 10 }), []);
  assert.deepEqual(inferVisualGridCells({ xLines: [0, 10], yLines: [0, 10] }, { width: 10, height: 10, rgba: Buffer.alloc(3) }, { widthPt: 10, heightPt: 10 }), []);
});

function rgbaImage(width, height, color) {
  const image = { width, height, rgba: Buffer.alloc(width * height * 4) };
  fillRect(image, 0, 0, width, height, color);
  return image;
}

function fillRect(image, x, y, w, h, color) {
  const rgb = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}
