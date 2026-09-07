"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { measureTextInkGeometry } = require("../packages/slideclone-core/text-ink-geometry");

function fixture() {
  const image = scale => {
    const width = 100 * scale, height = 100 * scale, rgba = Buffer.alloc(width * height * 4, 255);
    for (let y = 22 * scale; y < 30 * scale; y++) for (let x = 12 * scale; x < 32 * scale; x++) rgba.set([20, 30, 40, 255], (y * width + x) * 4);
    return { width, height, rgba };
  };
  return { slideSize: { widthPt: 100, heightPt: 100 }, sourceImage: image(1), renderedImage: image(2),
    textBoxes: [{ id: "text", box: { x: 10, y: 20, w: 30, h: 15 }, font: { color: "#141e28" } }] };
}

test("measures equivalent ink in slide coordinates across raster resolutions without mutation", () => {
  const input = fixture(), bytes = Buffer.from(input.sourceImage.rgba), before = structuredClone(input.textBoxes);
  const result = measureTextInkGeometry(input);
  assert.deepEqual(result.measurements, [{ id: "text", source: { x: 12, y: 22, w: 20, h: 8 }, rendered: { x: 12, y: 22, w: 20, h: 8 } }]);
  assert.ok(result.samples > 0);
  assert.deepEqual(input.sourceImage.rgba, bytes); assert.deepEqual(input.textBoxes, before);
});

test("empty, absent, transparent and nonmatching ink produces no proposed measurement", () => {
  const input = fixture();
  assert.deepEqual(measureTextInkGeometry({ ...input, textBoxes: [] }), { measurements: [], samples: 0 });
  input.renderedImage.rgba.fill(255);
  assert.deepEqual(measureTextInkGeometry(input).measurements, []);
  input.renderedImage.rgba.fill(0);
  assert.deepEqual(measureTextInkGeometry(input).measurements, []);
  input.textBoxes[0].font.color = "#FFFFFF";
  assert.equal(measureTextInkGeometry(input).samples, 0);
});

test("invalid rasters, mismatched aspect ratio and ambiguous ids are rejected", () => {
  const input = fixture();
  for (const sourceImage of [null, { width: 100, height: 100, rgba: Buffer.alloc(3) }, { width: Infinity, height: 1, rgba: Buffer.alloc(4) }]) {
    assert.throws(() => measureTextInkGeometry({ ...input, sourceImage }), /raster is invalid/u);
  }
  assert.throws(() => measureTextInkGeometry(null), /request is invalid/u);
  assert.throws(() => measureTextInkGeometry({ ...input, renderedImage: { width: 10, height: 1, rgba: Buffer.alloc(40) } }), /aspect ratios/u);
  assert.throws(() => measureTextInkGeometry({ ...input, textBoxes: [input.textBoxes[0], input.textBoxes[0]] }), /ambiguous/u);
});

test("unsafe color, invalid and out-of-slide boxes are ignored rather than sampled", () => {
  const input = fixture(), original = input.textBoxes[0];
  const textBoxes = [null, { ...original, font: { color: "#000000; arbitrary" } }, { ...original, box: { x: -1, y: 0, w: 3, h: 3 } }, { ...original, box: { x: 99, y: 99, w: 3, h: 3 } }];
  assert.deepEqual(measureTextInkGeometry({ ...input, textBoxes }), { measurements: [], samples: 0 });
});

test("aggregate sampling and object-count limits reject extreme input before pixel traversal", () => {
  const input = fixture();
  const textBoxes = Array.from({ length: 500 }, (_, index) => ({ id: `text-${index}`, box: { x: 0, y: 0, w: 100, h: 100 }, font: { color: "#141e28" } }));
  assert.throws(() => measureTextInkGeometry({ ...input, textBoxes }), /sampling exceeds/u);
  assert.throws(() => measureTextInkGeometry({ ...input, textBoxes: Array(2001).fill(null) }), /request is invalid/u);
});
