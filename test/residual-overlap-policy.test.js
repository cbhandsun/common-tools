"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  intersectionArea,
  isResidualCropCoveredByText
} = require("../skills/pd-hifi-slideclone/scripts/lib/residual-overlap-policy");

test("residual overlap policy detects text-dominated image fragments", () => {
  const image = { x: 813.47, y: 242.49, w: 91.8, h: 64.81 };
  const textBoxes = [{ box: { x: 703, y: 247, w: 185, h: 85 } }];

  assert.equal(isResidualCropCoveredByText(image, textBoxes), true);
  assert.ok(intersectionArea(image, textBoxes[0].box) > image.w * image.h * 0.7);
});

test("residual overlap policy preserves independent endpoint icons", () => {
  const image = { x: 900, y: 210, w: 30, h: 30 };
  const textBoxes = [{ box: { x: 703, y: 247, w: 185, h: 85 } }];

  assert.equal(isResidualCropCoveredByText(image, textBoxes), false);
  assert.equal(intersectionArea(image, textBoxes[0].box), 0);
});

test("residual overlap policy rejects malformed boxes and bounds thresholds", () => {
  assert.equal(isResidualCropCoveredByText(null, []), false);
  assert.equal(isResidualCropCoveredByText({ x: 0, y: 0, w: Number.NaN, h: 10 }, [{ box: { x: 0, y: 0, w: 10, h: 10 } }]), false);
  assert.equal(isResidualCropCoveredByText({ x: 0, y: 0, w: 10, h: 10 }, [{ box: { x: 9, y: 0, w: 10, h: 10 } }], 0.1), true);
  assert.equal(isResidualCropCoveredByText({ x: 0, y: 0, w: 10, h: 10 }, [{ box: { x: 9, y: 0, w: 10, h: 10 } }], 2), false);
});
