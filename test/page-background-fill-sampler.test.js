"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { sampleUniformPageBackgroundFill } = require("../packages/slideclone-native-engine/scripts/lib/page-background-fill-sampler");

function image(width, height, color) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) rgba.set([...color, 255], offset);
  return { width, height, rgba };
}
function fill(bitmap, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) bitmap.rgba.set([...color, 255], (yy * bitmap.width + xx) * 4);
}

test("page background sampling excludes panels that occupy the old three-percent inset anchors", () => {
  const bitmap = image(1000, 750, [254, 254, 254]);
  fill(bitmap, 20, 90, 960, 430, [242, 244, 245]);
  fill(bitmap, 20, 550, 960, 185, [242, 244, 245]);
  assert.equal(sampleUniformPageBackgroundFill(bitmap), "#FEFEFE");
});

test("page background sampling preserves colored inset backgrounds and ignores a one-pixel capture border", () => {
  const bitmap = image(100, 60, [255, 255, 255]);
  fill(bitmap, 1, 1, 98, 58, [242, 242, 247]);
  assert.equal(sampleUniformPageBackgroundFill(bitmap), "#F2F2F7");
  assert.equal(sampleUniformPageBackgroundFill(image(100, 100, [34, 57, 81])), "#223951");
});

test("page background sampling rejects mixed edges, transparent evidence and malformed raster inputs", () => {
  const mixed = image(100, 100, [255, 255, 255]);
  fill(mixed, 0, 0, 50, 100, [50, 100, 150]);
  fill(mixed, 50, 0, 50, 100, [150, 50, 100]);
  assert.equal(sampleUniformPageBackgroundFill(mixed), "#FFFFFF");
  const transparent = image(100, 100, [0, 0, 0]);
  for (let offset = 3; offset < transparent.rgba.length; offset += 4) transparent.rgba[offset] = 0;
  for (const invalid of [transparent, null, {}, { width: 10, height: 10, rgba: Buffer.alloc(399) },
    { width: Infinity, height: 10, rgba: Buffer.alloc(400) },
    { width: 10.5, height: 10, rgba: Buffer.alloc(420) },
    { width: 20000, height: 10, rgba: Buffer.alloc(800000) }]) assert.equal(sampleUniformPageBackgroundFill(invalid), "#FFFFFF");
});
