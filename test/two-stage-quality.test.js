"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { runTwoStageQualityGate } = require("../packages/slideclone-core/two-stage-quality-gate");

function makeImage(color) {
  const rgba = Buffer.alloc(4 * 4 * 4);
  for (let i = 0; i < 16; i += 1) {
    const offset = i * 4;
    rgba[offset] = color[0];
    rgba[offset + 1] = color[1];
    rgba[offset + 2] = color[2];
    rgba[offset + 3] = 255;
  }
  return { width: 4, height: 4, rgba };
}

test("runTwoStageQualityGate executes Stage 1 headless checks and outputs execution report", () => {
  const cleanSlide = {
    shapes: [
      { box: { x: 50, y: 50, w: 200, h: 100 } }
    ],
    textBoxes: [
      { text: "正常文本", font: { sizePt: 12 }, box: { x: 60, y: 60, w: 180, h: 30 } }
    ],
    residuals: []
  };

  const report = runTwoStageQualityGate(cleanSlide);
  assert.equal(report.passed, true);
  assert.equal(report.engine, "headless");
  assert.equal(report.summary.stage1Passed, true);
  assert.equal(report.summary.textOverflowRate, 0);
  assert.equal(report.qualityReport.passed, true);
});

test("runTwoStageQualityGate reports failure on geometric issues", () => {
  const badSlide = {
    shapes: [
      { box: { x: 1000, y: 0, w: 100, h: 100 } } // outside slide
    ],
    textBoxes: [],
    residuals: []
  };

  const report = runTwoStageQualityGate(badSlide, { slideSize: { widthPt: 960, heightPt: 540 } });
  assert.equal(report.passed, false);
  assert.equal(report.summary.stage1Passed, false);
  assert.equal(report.summary.canvasBoundaryViolations, 1);
});

test("runTwoStageQualityGate includes perceptual metrics when images are provided", () => {
  const cleanSlide = {
    shapes: [{ box: { x: 50, y: 50, w: 200, h: 100 } }],
    textBoxes: [],
    residuals: []
  };
  const image = makeImage([30, 80, 120]);

  const report = runTwoStageQualityGate(cleanSlide, { referenceImage: image, renderedImage: image });
  assert.equal(report.passed, true);
  assert.equal(report.summary.perceptualSsim, 1);
  assert.equal(report.summary.perceptualPhashDistance, 0);
});
