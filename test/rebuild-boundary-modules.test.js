"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { materializeFidelityCrop } = require("../skills/pd-hifi-slideclone/scripts/lib/fidelity-crop-materializer");
const { measuredFontSize, resolveRoleFontSize } = require("../skills/pd-hifi-slideclone/scripts/lib/font-evidence");
const { parsePageSelection, planSelectedPages } = require("../skills/pd-hifi-slideclone/scripts/lib/page-selection");
const { sanitizeNativeCharts, sanitizeNativeShapes } = require("../skills/pd-hifi-slideclone/scripts/lib/native-output-sanitizer");

test("page selection parses ranges strictly and plans stable source ordinals", () => {
  const selection = parsePageSelection("3,1-2");
  const plan = planSelectedPages([{ pageIndex: 0 }, { pageIndex: 1 }, { pageIndex: 2 }, { pageIndex: 3 }], selection);
  assert.deepEqual(plan.map((item) => [item.pageIndex, item.selectedPageOrdinal]), [[0, 0], [1, 1], [2, 2]]);
  assert.equal(parsePageSelection(null), null);
  assert.throws(() => parsePageSelection("1,bad"), /invalid page selection/);
  assert.throws(() => parsePageSelection("1-20000"), /range is too large/);
});

test("font evidence uses bounded measured values and role fallbacks", () => {
  assert.equal(measuredFontSize({ font: { sizePt: 12.3456 } }, 10), 12.346);
  assert.equal(measuredFontSize({ font: { sizePt: 2 } }, 10), 10);
  assert.equal(resolveRoleFontSize("title", 12, { title: 30 }), 30);
  assert.throws(() => measuredFontSize({}, 0), /fallback font size/);
  assert.throws(() => resolveRoleFontSize("x", 12, []), /must be an object/);
});

test("fidelity crop materializer validates paths, boxes, operations and output", () => {
  const calls = [];
  const result = materializeFidelityCrop({
    id: "crop-1",
    sourceImage: { width: 100, height: 100 },
    cropBox: { x: 10, y: 10, w: 20, h: 20 },
    slideSize: { widthPt: 100, heightPt: 100 },
    assetDir: "C:/tmp/assets",
    irDir: "C:/tmp",
    fileName: "crop.png",
    source: { detector: "test" }
  }, {
    ptToPxBox: (box) => box,
    pxToPtBox: (box) => box,
    cropPng: (_image, box) => ({ box }),
    writePng: (file, image) => calls.push([file, image]),
    ensureDir: (dir) => calls.push([dir])
  });
  assert.equal(result.assetPath, "assets/crop.png");
  assert.equal(result.source.editable, false);
  assert.equal(calls.length, 2);
  assert.throws(() => materializeFidelityCrop({ fileName: "../crop.png" }, {}), /operation/);
  assert.throws(() => materializeFidelityCrop({
    id: "x", sourceImage: { width: 10, height: 10 }, cropBox: { x: 9, y: 9, w: 5, h: 5 }, slideSize: { widthPt: 10, heightPt: 10 }, assetDir: "C:/a", irDir: "C:/", fileName: "x.png"
  }, { ptToPxBox: (box) => box, pxToPtBox: (box) => box, cropPng: () => ({}), writePng: () => {}, ensureDir: () => {} }), /exceeds source image/);
});

test("native output boundary sanitizes charts and shape collections independently", () => {
  assert.deepEqual(sanitizeNativeShapes("invalid"), []);
  assert.deepEqual(sanitizeNativeCharts([{ box: { x: 10, y: 10, w: 100, h: 80 }, values: [1] }]).map((item) => item.type), ["bar"]);
});
