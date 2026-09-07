"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createLayerColorBlockShapes,
  createTableZoneBackgroundShapes
} = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

function image() {
  const width = 960, height = 540, rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 145; y < 395; y += 1) for (let x = 180; x < 780; x += 1) {
    const offset = (y * width + x) * 4; rgba[offset] = 20; rgba[offset + 1] = 110; rgba[offset + 2] = 180;
  }
  return {width, height, rgba};
}

test("generic and table color-block rebuilders namespace IDs for the same source image", () => {
  const sourceImage = image();
  const input = {
    id: "native-graphic-underlay",
    box: {x: 0, y: 0, w: 960, h: 540},
    source: {textObjectified: true, detector: "foreground-graphic-underlay-crop", layer: {
      layerType: "table-zone", recommendedAction: "attempt-native-reconstruction",
      diagramUnderstanding: {visualGrid: {rows: 2, columns: 2, xLines: [0, 480, 960], yLines: [0, 270, 540], lineCount: 4, coverageRatio: 0.5, bounds: {x: 0, y: 0, w: 960, h: 540}}}
    }}
  };
  const generic = createLayerColorBlockShapes([structuredClone(input)], sourceImage);
  const table = createTableZoneBackgroundShapes([structuredClone(input)], [], sourceImage);

  assert.ok(generic.length > 0); assert.ok(table.length > 0);
  assert.equal(new Set([...generic, ...table].map((shape) => shape.id)).size, generic.length + table.length);
  assert.ok(generic.every((shape) => shape.id.startsWith("layer-color-block-")));
  assert.ok(table.every((shape) => shape.id.startsWith("table-zone-")));
});
