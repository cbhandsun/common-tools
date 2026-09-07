"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildMinimumUnitCropEvidence } = require("../skills/pd-hifi-slideclone/scripts/lib/minimum-unit-crop-evidence");

test("minimum-unit crop evidence maps a local refinement back to source pixels", () => {
  const result = buildMinimumUnitCropEvidence({
    sourceWidth: 944,
    sourceHeight: 704,
    originalPixelBox: { x: 100, y: 200, w: 80, h: 60 },
    refinement: { box: { x: 3, y: 4, w: 70, h: 50 }, removedNeighborPixels: 18, retainedDetailComponents: 2 },
  });
  assert.deepEqual(result.tightenedPixelBox, { x: 103, y: 204, w: 70, h: 50 });
  assert.equal(result.removedNeighborPixels, 18);
  assert.equal(result.cropEvidenceRequired, true);
});

test("minimum-unit crop evidence supports an unchanged crop without inventing cleanup", () => {
  const result = buildMinimumUnitCropEvidence({
    sourceWidth: 100,
    sourceHeight: 100,
    originalPixelBox: { x: 0, y: 0, w: 10, h: 10 },
    refinement: { box: { x: 0, y: 0, w: 10, h: 10 } },
  });
  assert.equal(result.removedNeighborPixels, 0);
  assert.equal(result.retainedDetailComponents, 0);
});

test("minimum-unit crop evidence rejects malformed, overflowing, and excessive input", () => {
  assert.throws(() => buildMinimumUnitCropEvidence({}), /dimensions/u);
  assert.throws(() => buildMinimumUnitCropEvidence({ sourceWidth: 20000, sourceHeight: 10, originalPixelBox: { x: 0, y: 0, w: 1, h: 1 }, refinement: { box: { x: 0, y: 0, w: 1, h: 1 } } }), /dimensions/u);
  assert.throws(() => buildMinimumUnitCropEvidence({ sourceWidth: 10, sourceHeight: 10, originalPixelBox: { x: 9, y: 9, w: 2, h: 2 }, refinement: { box: { x: 0, y: 0, w: 1, h: 1 } } }), /exceeds/u);
  assert.throws(() => buildMinimumUnitCropEvidence({ sourceWidth: 10, sourceHeight: 10, originalPixelBox: { x: 0, y: 0, w: 5, h: 5 }, refinement: { box: { x: 4, y: 4, w: 2, h: 2 } } }), /refinement exceeds/u);
});
