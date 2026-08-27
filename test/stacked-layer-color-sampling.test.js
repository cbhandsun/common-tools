"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { measureStackedLayerFront, sampleStackedLayerFrontFill, sampleStackedLayerTopFill } = require("../skills/pd-hifi-slideclone/scripts/lib/stacked-layer-color-sampling");

test("samples the dominant interior fill while ignoring text-colored noise", () => {
  const width = 200;
  const height = 100;
  const rgba = Buffer.alloc(width * height * 4, 255);
  fill(rgba, width, { x: 20, y: 20, w: 160, h: 50 }, [41, 183, 103, 255]);
  fill(rgba, width, { x: 70, y: 0, w: 60, h: 15 }, [210, 242, 222, 255]);
  fill(rgba, width, { x: 70, y: 42, w: 60, h: 4 }, [255, 255, 255, 255]);

  assert.equal(sampleStackedLayerFrontFill(
    { width, height, rgba },
    { x: 20, y: 20, w: 160, h: 50 },
    { widthPt: 200, heightPt: 100 },
    "#000000"
  ), "#29B767");
  assert.deepEqual(measureStackedLayerFront(
    { width, height, rgba },
    { x: 18, y: 18, w: 164, h: 54 },
    { widthPt: 200, heightPt: 100 },
    "#000000"
  ), { fill: "#29B767", box: { x: 20, y: 20, w: 160, h: 50 }, measured: true });
  assert.equal(sampleStackedLayerTopFill(
    { width, height, rgba },
    { x: 20, y: 20, w: 160, h: 50 },
    { widthPt: 200, heightPt: 100 },
    "#000000"
  ), "#D2F2DE");
});

test("fails closed for malformed, excessive, and out-of-range inputs", () => {
  assert.equal(sampleStackedLayerFrontFill(null, {}, {}, "#ABCDEF"), "#ABCDEF");
  assert.equal(sampleStackedLayerFrontFill(
    { width: 5000, height: 5000, rgba: Buffer.alloc(4) },
    { x: 0, y: 0, w: 10, h: 10 },
    { widthPt: 100, heightPt: 100 },
    "#123456"
  ), "#123456");
});

function fill(rgba, imageWidth, box, color) {
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      const offset = (y * imageWidth + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) rgba[offset + channel] = color[channel];
    }
  }
}
