"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { hasSourceColumnBarBoundary } = require("../packages/slideclone-core/visual-column-bar-boundary");
const { detectBaselineColumnBarComponents } = require("../packages/slideclone-core/visual-atom-semantic-components");

function image() { return { width: 200, height: 130, rgba: Buffer.alloc(200 * 130 * 4, 255) }; }
function fill(raster, box, color = [70, 120, 180, 255]) {
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
    raster.rgba.set(color, (y * raster.width + x) * 4);
  }
}
const region = { x: 0, y: 0, w: 200, h: 130 };
const axes = [{ axis: "h", box: { x: 5, y: 100, w: 190, h: 2 } }];

test("source-backed columns retain all three physical bars", () => {
  for (const color of [[70, 120, 180, 255], [220, 80, 100, 255], [10, 10, 10, 255]]) {
    const raster = image();
    const boxes = [20, 40, 60].map((y, i) => ({ x: 20 + i * 55, y, w: 20, h: 100 - y }));
    for (const box of boxes) { fill(raster, box, color); assert.equal(hasSourceColumnBarBoundary(raster, box), true); }
    assert.equal(detectBaselineColumnBarComponents(raster, region, [255, 255, 255], [], axes).length, 3);
  }
});

test("OCR masks inside a complete panel cannot invent baseline bars", () => {
  const raster = image();
  fill(raster, { x: 10, y: 10, w: 180, h: 110 });
  const masks = [35, 90, 145].map(x => ({ x, y: 0, w: 20, h: 130 }));
  masks.push({ x: 10, y: 0, w: 25, h: 30 }, { x: 55, y: 0, w: 35, h: 50 },
    { x: 110, y: 0, w: 35, h: 70 });
  assert.deepEqual(detectBaselineColumnBarComponents(raster, region, [255, 255, 255], masks, axes), []);
});

test("open sides, open tops, empty rasters and transparent pixels do not prove a bar", () => {
  const box = { x: 30, y: 30, w: 30, h: 60 };
  for (const extension of [{ x: 15, y: 30, w: 45, h: 60 }, { x: 30, y: 30, w: 45, h: 60 },
    { x: 30, y: 15, w: 30, h: 75 }]) {
    const raster = image(); fill(raster, extension);
    assert.equal(hasSourceColumnBarBoundary(raster, box), false);
  }
  assert.equal(hasSourceColumnBarBoundary(image(), box), false);
  const transparent = image(); fill(transparent, box, [70, 120, 180, 0]);
  assert.equal(hasSourceColumnBarBoundary(transparent, box), false);
});

test("invalid, clipped, extreme and hostile inputs fail closed", () => {
  const raster = image(), box = { x: 30, y: 30, w: 30, h: 60 };
  const hostile = new Proxy({}, { has() { throw new Error("hostile input"); } });
  for (const input of [null, {}, [], hostile, { ...raster, width: Infinity }, { ...raster, rgba: [] }]) {
    assert.equal(hasSourceColumnBarBoundary(input, box), false);
  }
  for (const candidate of [null, {}, hostile, { ...box, x: 0 }, { ...box, x: 190 },
    { ...box, w: Number.MAX_SAFE_INTEGER }, { ...box, y: NaN }, { ...box, h: 0 }, { ...box, x: 30.5 }]) {
    assert.equal(hasSourceColumnBarBoundary(raster, candidate), false);
  }
});
