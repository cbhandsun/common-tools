"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { shouldProtectSmallForegroundGraphicCrop } = require("../skills/pd-hifi-slideclone/scripts/lib/graphic-crop-materializer");
const { buildMinimumUnitCropEvidence } = require("../skills/pd-hifi-slideclone/scripts/lib/minimum-unit-crop-evidence");

test("crop classification rejects non-finite geometry and never coerces caller objects", () => {
  let coerced = false;
  for (const w of [NaN, Infinity, -1, 0, "invalid", { valueOf() { coerced = true; return 50; } }]) {
    assert.equal(shouldProtectSmallForegroundGraphicCrop({ detector: "foreground-graphic-crop", box: { w, h: 40 } }), false);
  }
  assert.equal(coerced, false);
  assert.equal(shouldProtectSmallForegroundGraphicCrop({ detector: "foreground-graphic-crop", box: { w: 40, h: 40 }, slideSize: { widthPt: NaN, heightPt: 540 } }), false);
});

test("crop classification preserves area, aspect, aggregate and default-slide policies", () => {
  const base = { detector: "foreground-graphic-crop", box: { w: 80, h: 60 } };
  assert.equal(shouldProtectSmallForegroundGraphicCrop(base), true);
  assert.equal(shouldProtectSmallForegroundGraphicCrop({ ...base, component: { aggregate: true } }), false);
  assert.equal(shouldProtectSmallForegroundGraphicCrop({ ...base, detector: "screenshot" }), false);
  assert.equal(shouldProtectSmallForegroundGraphicCrop({ ...base, box: { w: 900, h: 400 } }), false);
  assert.equal(shouldProtectSmallForegroundGraphicCrop({ ...base, box: { w: 500, h: 10 } }), false);
  assert.equal(shouldProtectSmallForegroundGraphicCrop({ ...base, box: { w: "80", h: "60" } }), true);
  assert.equal(shouldProtectSmallForegroundGraphicCrop({}), false);
});

test("crop evidence rejects coercion hooks and bounded counters cannot exceed the source pixel budget", () => {
  const base = { sourceWidth: 100, sourceHeight: 100, originalPixelBox: { x: 0, y: 0, w: 10, h: 10 }, refinement: { box: { x: 0, y: 0, w: 10, h: 10 } } };
  let coerced = false;
  for (const count of [{ valueOf() { coerced = true; return 1; } }, -1, Infinity, 10001, "invalid"]) {
    assert.throws(() => buildMinimumUnitCropEvidence({ ...base, refinement: { ...base.refinement, removedNeighborPixels: count } }), /evidence/);
  }
  assert.equal(coerced, false);
  const result = buildMinimumUnitCropEvidence({ ...base, refinement: { ...base.refinement, removedNeighborPixels: "3" } });
  assert.equal(result.removedNeighborPixels, 3);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.tightenedPixelBox), true);
});
