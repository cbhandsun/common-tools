"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  MAX_NETWORK_NODES,
  MAX_RASTER_PIXELS,
  createRadialNetworkDetector
} = require("../skills/pd-hifi-slideclone/scripts/lib/radial-network-detector");

test("radial detector selects only supported aggregate and terminal candidates", () => {
  const detector = createRadialNetworkDetector(operations());
  assert.equal(detector.shouldObjectify({ source: { terminal: true } }), true);
  assert.equal(detector.shouldObjectify({ source: {
    detector: "foreground-aggregate-crop",
    layer: { layerType: "diagram-zone", recommendedAction: "split-native-with-residual-crop" }
  } }), true);
  assert.equal(detector.shouldObjectify({ source: {
    detector: "foreground-aggregate-crop",
    layer: { layerType: "diagram-zone", areaRatio: 0.5, diagramUnderstanding: { visualAtomKindCounts: { "grid-line-candidate": 12 } } }
  } }), true);
  assert.equal(detector.shouldObjectify({ source: { detector: "foreground-aggregate-crop", layer: { layerType: "diagram-zone" } } }), false);
  assert.equal(detector.shouldObjectify({ source: { layer: { areaRatio: Number.POSITIVE_INFINITY } } }), false);
});

test("radial detector infers bounded nodes and a center box from raster evidence", () => {
  const raster = networkRaster();
  const detector = createRadialNetworkDetector(operations({ pixel: raster.pixel }));
  const result = detector.infer({ box: { x: 0, y: 0, w: raster.width, h: raster.height } }, raster);

  assert.ok(result);
  assert.ok(result.nodes.length >= 12);
  assert.ok(result.nodes.length <= MAX_NETWORK_NODES);
  assert.deepEqual(result.center, { x: 120, y: 83.2 });
  assert.ok(result.nodes.every((node) => /^#[0-9A-F]{6}$/.test(node.color)));
  assert.ok(result.centerBox.w > 0 && result.centerBox.h > 0);
  assert.equal(result.detectionResult.contractVersion, "1.0");
  assert.equal(result.detectionResult.matched, true);
  assert.equal(result.detectionResult.diagnostics["node-count"], result.nodes.length);
});

test("radial detector infers search control geometry only with pixel evidence", () => {
  const grayRaster = { width: 800, height: 500 };
  const nodes = Array.from({ length: 24 }, (_, index) => ({ center: { x: 650 + index, y: 100 + index }, box: { x: 0, y: 0, w: 8, h: 8 } }));
  const image = { box: { x: 0, y: 0, w: 800, h: 400 } };
  const found = createRadialNetworkDetector(operations({ pixel: () => ({ r: 120, g: 120, b: 120, a: 255 }) }))
    .inferSearchBox(image, { nodes }, grayRaster, { widthPt: 800, heightPt: 500 });
  const missing = createRadialNetworkDetector(operations({ pixel: () => ({ r: 255, g: 255, b: 255, a: 255 }) }))
    .inferSearchBox(image, { nodes }, grayRaster, { widthPt: 800, heightPt: 500 });

  assert.ok(found?.box && found?.iconBox && found?.cursorBox);
  assert.equal(found.detectionResult.matched, true);
  assert.deepEqual(found.detectionResult.reasonCodes, ["radial-network.search-control-matched"]);
  assert.equal(found.cursorBox.w, 0);
  assert.equal(missing, null);
});

test("radial detector fails closed for malformed and extreme raster boundaries", () => {
  const detector = createRadialNetworkDetector(operations());
  assert.equal(detector.infer({}, null), null);
  assert.equal(detector.infer({ box: { x: 0, y: 0, w: 10, h: 10 } }, { width: 0, height: 1 }), null);
  assert.equal(detector.infer({ box: { x: 0, y: 0, w: 10, h: 10 } }, { width: MAX_RASTER_PIXELS + 1, height: 1 }), null);
  assert.deepEqual(detector.detectNodes({ width: 10, height: 10 }, { x: Number.NaN, y: 0, w: 1, h: 1 }, null, { x: 1, y: 1 }), []);
  assert.equal(detector.inferSearchBox({ box: { x: 0, y: 0, w: 10, h: 10 } }, { nodes: [] }, { width: 10, height: 10 }), null);
});

test("radial detector validates and propagates every injected operation", () => {
  const valid = operations();
  assert.throws(() => createRadialNetworkDetector([]), /operations must be an object/);
  for (const name of [
    "averageColor", "boxesNearPt", "clamp", "constrainPtBox", "expandPxBox", "isTerminalCandidate",
    "luma", "pixel", "ptToPxBox", "pxToPtBox", "rgbToHex", "rgbToHsl", "round", "saturation", "unionPtBox"
  ]) {
    assert.throws(() => createRadialNetworkDetector({ ...valid, [name]: null }), new RegExp(`operation ${name}`));
  }
  assert.throws(() => createRadialNetworkDetector({ ...valid, defaultSlide: {} }), /defaultSlide/);
  const failure = new Error("terminal classifier unavailable");
  const detector = createRadialNetworkDetector(operations({ isTerminalCandidate: () => { throw failure; } }));
  assert.throws(() => detector.shouldObjectify({}), (error) => error === failure);
});

test("native rebuild delegates network recognition to the detector module", () => {
  const source = fs.readFileSync(path.join(
    __dirname, "..", "skills", "pd-hifi-slideclone", "scripts", "rebuild-real-pptx-native.js"
  ), "utf8");
  assert.match(source, /createRadialNetworkDetector\(/);
  assert.match(source, /infer: inferRadialNetworkDiagram/);
  assert.doesNotMatch(source, /function inferRadialNetworkDiagram|function inferNetworkSearchBox|function detectNetworkNodeBoxes|function isNetworkColorPixel/);
});

function networkRaster() {
  const width = 240;
  const height = 160;
  const blocks = [];
  for (const y of [4, 140]) {
    for (const x of [4, 34, 64, 94, 124, 154, 184, 214]) blocks.push({ x, y, w: 16, h: 16 });
  }
  return {
    width,
    height,
    pixel: (_image, x, y) => blocks.some((box) => x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h)
      ? { r: 20, g: 130, b: 220, a: 255 }
      : { r: 255, g: 255, b: 255, a: 255 }
  };
}

function operations(overrides = {}) {
  const identityBox = (box) => ({ ...box });
  return {
    averageColor: (colors) => colors[0] || { r: 0, g: 0, b: 0, a: 255 },
    boxesNearPt: (left, right, gap) => !(left.x + left.w + gap < right.x || right.x + right.w + gap < left.x || left.y + left.h + gap < right.y || right.y + right.h + gap < left.y),
    clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
    constrainPtBox: identityBox,
    defaultSlide: { widthPt: 240, heightPt: 160 },
    expandPxBox: identityBox,
    isTerminalCandidate: (image) => image?.source?.terminal === true,
    luma: (color) => (color.r + color.g + color.b) / 3,
    pixel: () => ({ r: 255, g: 255, b: 255, a: 255 }),
    ptToPxBox: identityBox,
    pxToPtBox: identityBox,
    rgbToHex: (color) => `#${[color.r, color.g, color.b].map((value) => Math.round(value).toString(16).padStart(2, "0")).join("").toUpperCase()}`,
    rgbToHsl: (color) => color.b > color.r ? { h: 205, s: 0.8, l: 0.5 } : { h: 0, s: 0, l: 1 },
    round: (value) => Math.round(value * 1000) / 1000,
    saturation: (color) => color.r === color.g && color.g === color.b ? 0 : 1,
    unionPtBox: (left, right) => ({
      x: Math.min(left.x, right.x),
      y: Math.min(left.y, right.y),
      w: Math.max(left.x + left.w, right.x + right.w) - Math.min(left.x, right.x),
      h: Math.max(left.y + left.h, right.y + right.h) - Math.min(left.y, right.y)
    }),
    ...overrides
  };
}
