"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createSystemMapSourceDetection
} = require("../packages/slideclone-native-engine/scripts/lib/native-rebuild-system-map-source-detection");

const DEFAULT_SLIDE = Object.freeze({ widthPt: 960, heightPt: 540 });

function createImage(width = 16, height = 16) {
  return { width, height, rgba: new Uint8Array(width * height * 4) };
}

function paintPixel(image, x, y, color) {
  const offset = (y * image.width + x) * 4;
  image.rgba[offset] = color.r;
  image.rgba[offset + 1] = color.g;
  image.rgba[offset + 2] = color.b;
  image.rgba[offset + 3] = color.a;
}

function createDependencies(overrides = {}) {
  return {
    detectDenseLinkedNodeAtoms: () => [],
    fileExists: () => false,
    pixel: () => ({ r: 0, g: 0, b: 0, a: 255 }),
    pointInsidePxBox: () => false,
    ptToPxBox: (box) => box,
    pxToPtBox: (box) => box,
    readPng: () => createImage(),
    round: (value) => Math.round(Number(value) * 100) / 100,
    ...overrides
  };
}

test("system map source detection fails closed when dependencies are missing", () => {
  assert.throws(
    () => createSystemMapSourceDetection({ ...createDependencies(), pixel: null }),
    /system map source detection dependency pixel must be a function/
  );
});

test("system map source detection resolves the first existing source image path", () => {
  const { findSystemMapSourceImageFile } = createSystemMapSourceDetection(createDependencies({
    fileExists: (value) => value === "existing.png"
  }));
  assert.equal(findSystemMapSourceImageFile([
    { source: { pageImage: "missing.png" } },
    { source: { sourceImage: "existing.png" } }
  ]), "existing.png");
});

test("system map topology probe reports not ready when too few nodes are detected", () => {
  const { measureSystemMapNativeTopology } = createSystemMapSourceDetection(createDependencies({
    detectDenseLinkedNodeAtoms: () => new Array(3).fill(null).map((_, index) => ({
      center: { x: index * 10, y: index * 5 },
      box: { w: 10, h: 10 },
      shapeHint: "rect",
      source: { method: "test" }
    }))
  }));
  assert.deepEqual(
    measureSystemMapNativeTopology(createImage(), { x: 0, y: 0, w: 300, h: 200 }, DEFAULT_SLIDE),
    { ready: false, nodeCount: 3, edgeCount: 0 }
  );
});

test("system map source network lines are detected from blue runs outside node masks", () => {
  const nodes = [{ x: 0, y: 0, size: 1 }, { x: 90, y: 40, size: 1 }];
  const image = createImage(120, 90);
  const blue = { r: 10, g: 90, b: 160, a: 255 };
  for (let x = 40; x <= 94; x += 1) paintPixel(image, x, 14, blue);
  for (let y = 10; y <= 60; y += 1) paintPixel(image, 50, y, blue);
  const { detectSystemMapSourceNetworkLineShapes } = createSystemMapSourceDetection(createDependencies());
  const lines = detectSystemMapSourceNetworkLineShapes(
    "map",
    image,
    { x: 0, y: 0, w: 120, h: 90 },
    DEFAULT_SLIDE,
    nodes,
    { detector: "system-map-source-test" }
  );
  assert.ok(lines.length >= 2);
  assert.ok(lines.every((line) => line.source.sourceImageDetected === true));
});
