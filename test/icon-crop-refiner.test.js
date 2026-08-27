"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { refineStandaloneIconCrop } = require("../skills/pd-hifi-slideclone/scripts/lib/icon-crop-refiner");

function imageWithNeighbor() {
  const width = 20, height = 14;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let pixel = 0; pixel < width * height; pixel += 1) rgba[pixel * 4 + 3] = 255;
  const fill = (x, y, color) => { const offset = (y * width + x) * 4; rgba[offset] = color[0]; rgba[offset + 1] = color[1]; rgba[offset + 2] = color[2]; };
  for (let y = 3; y <= 10; y += 1) for (let x = 3; x <= 10; x += 1) fill(x, y, [20, 180, 100]);
  for (let y = 5; y <= 8; y += 1) for (let x = 16; x <= 19; x += 1) fill(x, y, [20, 180, 100]);
  return { width, height, rgba };
}

test("refines a dominant icon crop by removing connected white background and an adjacent component", () => {
  const result = refineStandaloneIconCrop(imageWithNeighbor(), { paddingPx: 1 });

  assert.equal(result.refined, true);
  assert.equal(result.removedNeighborPixels, 16);
  assert.ok(result.image.width < 14, "expected the unrelated neighbor to be removed from the crop bounds");
  assert.equal(result.image.rgba[3], 0, "expected edge-connected white background to be transparent");
});

test("keeps multi-part icons intact when no foreground component dominates", () => {
  const width = 20, height = 14;
  const image = { width, height, rgba: Buffer.alloc(width * height * 4, 255) };
  for (let pixel = 0; pixel < width * height; pixel += 1) image.rgba[pixel * 4 + 3] = 255;
  const fill = (x, y) => { const offset = (y * width + x) * 4; image.rgba[offset] = 20; image.rgba[offset + 1] = 180; image.rgba[offset + 2] = 100; };
  for (let y = 3; y <= 6; y += 1) for (let x = 3; x <= 6; x += 1) fill(x, y);
  for (let y = 8; y <= 11; y += 1) for (let x = 13; x <= 16; x += 1) fill(x, y);
  const result = refineStandaloneIconCrop(image);
  assert.equal(result.refined, false);
});
