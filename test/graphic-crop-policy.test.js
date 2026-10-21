"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { shouldProtectSmallForegroundGraphicCrop } = require("../packages/slideclone-core/graphic-crop-materializer");
const { admitTightGraphicCrop, buildMinimumUnitCropEvidence } = require("../packages/slideclone-core/graphic-crop-policy");

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

test("minimum-unit protection requires a text-free crop rather than merely a small area", () => {
  const base = { detector: "foreground-graphic-crop", box: { x: 10, y: 20, w: 80, h: 60 }, textBoxes: [] };
  assert.equal(shouldProtectSmallForegroundGraphicCrop(base), true);
  for (const box of [{ x: 15, y: 30, w: 10, h: 10 }, { x: 0, y: 0, w: 20, h: 30 }, { x: 0, y: 0, w: 100, h: 100 }]) {
    assert.equal(shouldProtectSmallForegroundGraphicCrop({ ...base, textBoxes: [{ text: "body", box }] }), false);
  }
  assert.equal(shouldProtectSmallForegroundGraphicCrop({ ...base, textBoxes: [{ text: "body", box: { x: 90, y: 20, w: 10, h: 10 } }] }), true);
  assert.equal(shouldProtectSmallForegroundGraphicCrop({ ...base, textBoxes: [{ text: "  " }] }), true);
});

test("minimum-unit text evidence fails closed for malformed and excessive inputs without coercion", () => {
  const base = { detector: "foreground-graphic-crop", box: { x: 10, y: 20, w: 80, h: 60 } };
  let coerced = false;
  for (const textBoxes of [null, {}, [null], [{ text: 12 }], [{ text: "body" }],
    [{ text: "body", box: { x: Infinity, y: 0, w: 1, h: 1 } }],
    [{ text: "body", box: { x: 0, y: 0, w: 0, h: 1 } }],
    [{ text: "body", box: { x: { valueOf() { coerced = true; return 0; } }, y: 0, w: 1, h: 1 } }],
    Array(10001).fill({ text: "" })]) {
    assert.equal(shouldProtectSmallForegroundGraphicCrop({ ...base, textBoxes }), false);
  }
  assert.equal(coerced, false);
});

function tightAdmission(overrides = {}) {
  const rgba = Buffer.alloc(18 * 14 * 4);
  for (let y = 2; y < 12; y += 1) for (let x = 3; x < 15; x += 1) rgba[(y * 18 + x) * 4 + 3] = 255;
  return {
    detector: "foreground-graphic-crop",
    box: { x: 10, y: 20, w: 80, h: 60 },
    slideSize: { widthPt: 960, heightPt: 540 },
    component: {},
    textBoxes: [],
    sourceWidth: 600,
    sourceHeight: 400,
    originalPixelBox: { x: 100, y: 80, w: 24, h: 20 },
    refinement: { refined: true, box: { x: 2, y: 2, w: 18, h: 14 }, image: { width: 18, height: 14, rgba },
      removedNeighborPixels: 4, retainedDetailComponents: 1 },
    ...overrides
  };
}

test("tight crop admission requires a real isolated refinement rather than a small rectangle claim", () => {
  const admitted = admitTightGraphicCrop(tightAdmission());
  assert.ok(admitted);
  assert.equal(admitted.tightCropAdmission.operation, "source-isolated-tight-graphic");
  assert.ok(admitted.tightCropAdmission.opaqueDensity > 0 && admitted.tightCropAdmission.opaqueDensity < 0.78);
  assert.equal(Object.isFrozen(admitted.tightCropAdmission), true);
  assert.equal(admitTightGraphicCrop(tightAdmission({ refinement: { ...tightAdmission().refinement, refined: false } })), null);
  const solid = tightAdmission(); solid.refinement.image.rgba.fill(255);
  assert.equal(admitTightGraphicCrop(solid), null);
});

test("tight crop admission rejects malformed, excessive and text-owned evidence", () => {
  const base = tightAdmission();
  for (const input of [
    null,
    { ...base, sourceWidth: Infinity },
    { ...base, refinement: { ...base.refinement, box: { x: 20, y: 0, w: 18, h: 14 } } },
    { ...base, refinement: { ...base.refinement, retainedDetailComponents: 65 } },
    { ...base, refinement: { ...base.refinement, image: { ...base.refinement.image, rgba: Buffer.alloc(4) } } },
    { ...base, textBoxes: [{ text: "owned", box: { x: 20, y: 30, w: 20, h: 10 } }] }
  ]) assert.equal(admitTightGraphicCrop(input), null);
});
