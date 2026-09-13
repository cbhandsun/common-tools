"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { assertQualityReport } = require("../packages/capability-contracts");
const { assessHeadlessQuality } = require("../packages/slideclone-core/headless-quality-assessor");

function makeSolidImage(width, height, color) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    rgba[offset] = color[0];
    rgba[offset + 1] = color[1];
    rgba[offset + 2] = color[2];
    rgba[offset + 3] = 255;
  }
  return { width, height, rgba };
}

test("assessHeadlessQuality passes clean reconstructed page and complies with QualityReport", () => {
  const page = {
    shapes: [
      { box: { x: 50, y: 50, w: 200, h: 100 } },
      { box: { x: 300, y: 50, w: 200, h: 100 } }
    ],
    textBoxes: [
      { text: "标题一", font: { sizePt: 14 }, box: { x: 60, y: 60, w: 180, h: 30 } },
      { text: "标题二", font: { sizePt: 14 }, box: { x: 310, y: 60, w: 180, h: 30 } }
    ],
    residuals: []
  };

  const report = assessHeadlessQuality(page, { widthPt: 960, heightPt: 540 });

  assert.equal(report.passed, true);
  assert.equal(report.checks.length, 4);
  assert.ok(report.checks.every((c) => c.passed));
  assert.equal(report.metrics["text-overflow-rate"], 0);
  assert.equal(report.metrics["outside-boundary-count"], 0);
  assert.equal(report.metrics["text-collision-count"], 0);
  assert.equal(report.metrics["native-coverage-ratio"], 1);

  // Validate strict adherence to capability contract
  assert.doesNotThrow(() => assertQualityReport(report));
});

test("assessHeadlessQuality catches elements outside canvas boundary", () => {
  const page = {
    shapes: [
      { box: { x: 900, y: 50, w: 100, h: 50 } } // x + w = 1000 > 960 widthPt
    ],
    textBoxes: [],
    residuals: []
  };

  const report = assessHeadlessQuality(page, { widthPt: 960, heightPt: 540 });
  assert.equal(report.passed, false);

  const canvasCheck = report.checks.find((c) => c.name === "canvas-boundary-check");
  assert.ok(canvasCheck);
  assert.equal(canvasCheck.passed, false);
  assert.equal(report.metrics["outside-boundary-count"], 1);
});

test("assessHeadlessQuality catches colliding text boxes", () => {
  const page = {
    shapes: [],
    textBoxes: [
      { text: "第一行", font: { sizePt: 12 }, box: { x: 50, y: 50, w: 100, h: 30 } },
      { text: "严重重叠的第二行", font: { sizePt: 12 }, box: { x: 55, y: 52, w: 90, h: 26 } }
    ],
    residuals: []
  };

  const report = assessHeadlessQuality(page);
  assert.equal(report.passed, false);

  const collisionCheck = report.checks.find((c) => c.name === "text-collision-check");
  assert.ok(collisionCheck);
  assert.equal(collisionCheck.passed, false);
  assert.equal(report.metrics["text-collision-count"], 1);
});

test("assessHeadlessQuality can enforce perceptual PNG similarity", () => {
  const page = { shapes: [{ box: { x: 10, y: 10, w: 100, h: 50 } }], textBoxes: [], residuals: [] };
  const black = makeSolidImage(16, 16, [0, 0, 0]);
  const white = makeSolidImage(16, 16, [255, 255, 255]);

  const passing = assessHeadlessQuality(page, undefined, { referenceImage: black, renderedImage: black });
  assert.equal(passing.passed, true);
  assert.equal(passing.metrics["perceptual-ssim"], 1);
  assert.equal(passing.metrics["perceptual-phash-distance"], 0);

  const failing = assessHeadlessQuality(page, undefined, { referenceImage: black, renderedImage: white });
  assert.equal(failing.passed, false);
  const check = failing.checks.find((item) => item.name === "perceptual-image-check");
  assert.ok(check);
  assert.equal(check.passed, false);
});

test("assessHeadlessQuality handles defensive error paths", () => {
  assert.throws(() => assessHeadlessQuality(null), /pageData must be an object/);
  assert.throws(() => assessHeadlessQuality("not a page"), /pageData must be an object/);
  assert.throws(() => assessHeadlessQuality({}, undefined, { referenceImage: makeSolidImage(1, 1, [0, 0, 0]) }), /renderedImage is required/);
});

test("assessHeadlessQuality rejects invalid slide dimensions and thresholds", () => {
  const page = { shapes: [], textBoxes: [], residuals: [] };
  assert.throws(() => assessHeadlessQuality(page, null, []), /options must be an object/);
  assert.throws(() => assessHeadlessQuality(page, { widthPt: -1, heightPt: 540 }), /slideSize\.widthPt/);
  assert.throws(() => assessHeadlessQuality(page, { widthPt: 960, heightPt: Infinity }), /slideSize\.heightPt/);
  assert.throws(() => assessHeadlessQuality(page, { widthPt: 960, heightPt: 540 }, { minNativeRatio: 1.5 }), /minNativeRatio/);
  assert.throws(() => assessHeadlessQuality(page, { widthPt: 960, heightPt: 540 }, { maxOverflowRate: -0.01 }), /maxOverflowRate/);
  assert.throws(() => assessHeadlessQuality(page, undefined, { minSsim: 1.5 }), /minSsim/);
  assert.throws(() => assessHeadlessQuality(page, undefined, { maxPhashDistance: 64 }), /maxPhashDistance/);
});
