"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { calibrateConnectorStrokeWidth } = require("../packages/slideclone-core/connector-stroke-calibration");

test("connector stroke calibration converts robust source pixel samples to slide points", () => {
  const result = calibrateConnectorStrokeWidth({
    sampledWidthsPx: [2, 2.1, 1.9, 30, 0, Number.NaN],
    sourceImageWidthPx: 944,
    slideWidthPt: 960,
    fallbackPt: 1.5
  });
  assert.equal(result.strokeWidthPt, 2);
  assert.equal(result.observedStrokeWidthPx, 2);
  assert.equal(result.sampleCount, 3);
  assert.equal(result.usedFallback, false);
});

test("connector stroke calibration handles empty samples with a bounded fallback", () => {
  const result = calibrateConnectorStrokeWidth({ sampledWidthsPx: [], sourceImageWidthPx: 1920, slideWidthPt: 960, fallbackPt: 1.6 });
  assert.equal(result.strokeWidthPt, 1.5);
  assert.equal(result.observedStrokeWidthPx, null);
  assert.equal(result.usedFallback, true);
});

test("connector stroke calibration clamps extreme observations", () => {
  assert.equal(calibrateConnectorStrokeWidth({ sampledWidthsPx: [0.2], sourceImageWidthPx: 960, slideWidthPt: 960, fallbackPt: 1 }).strokeWidthPt, 0.5);
  assert.equal(calibrateConnectorStrokeWidth({ sampledWidthsPx: [90], sourceImageWidthPx: 960, slideWidthPt: 960, fallbackPt: 1 }).strokeWidthPt, 8);
});

test("connector stroke calibration rejects invalid boundaries and missing evidence", () => {
  assert.throws(() => calibrateConnectorStrokeWidth(null), /must be an object/u);
  assert.throws(() => calibrateConnectorStrokeWidth({ sampledWidthsPx: [], sourceImageWidthPx: 960, slideWidthPt: 960 }), /requires a valid sample/u);
  assert.throws(() => calibrateConnectorStrokeWidth({ sampledWidthsPx: [2], sourceImageWidthPx: 0, slideWidthPt: 960 }), /source image width/u);
  assert.throws(() => calibrateConnectorStrokeWidth({ sampledWidthsPx: [2], sourceImageWidthPx: 960, slideWidthPt: 960, minimumPt: 3, maximumPt: 2 }), /cannot exceed/u);
});
