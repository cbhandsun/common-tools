"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { eraseObjectMask } = require("../packages/slideclone-core/full-slide-native-residual");
const { eraseMasks } = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

test("local fidelity replacement preserves adjacent source pixels outside its footprint", () => {
  const image = { width: 80, height: 80, rgba: Buffer.alloc(80 * 80 * 4, 255) };
  for (let x = 10; x < 50; x += 1) {
    const offset = (18 * 80 + x) * 4;
    image.rgba[offset] = 0; image.rgba[offset + 1] = 0; image.rgba[offset + 2] = 0;
  }
  const crop = { type: "fidelity-crop", box: { x: 20, y: 20, w: 20, h: 20 } };
  const mask = eraseObjectMask(crop, image, { x: 0, y: 0, w: 80, h: 80 });
  const residual = eraseMasks(image, [mask]);
  for (let x = 10; x < 50; x += 1) {
    const offset = (18 * 80 + x) * 4;
    assert.deepEqual(residual.rgba.subarray(offset, offset + 4), Buffer.from([0, 0, 0, 255]));
  }
});

test("crop masks use their projected footprint while native text retains its erasure margin", () => {
  const image = { width: 200, height: 100 };
  const slide = { x: 0, y: 0, w: 100, h: 50 };
  const box = { x: 10.25, y: 5.25, w: 20, h: 10 };
  assert.deepEqual(eraseObjectMask({ type: "fidelity-crop", box }, image, slide), { x: 20, y: 10, w: 41, h: 21 });
  assert.ok(eraseObjectMask({ box }, image, slide).x < 20);
  assert.deepEqual(eraseObjectMask({ type: "fidelity-crop", box: { x: 0, y: 0, w: 100, h: 50 } }, image, slide), { x: 0, y: 0, w: 200, h: 100 });
  for (const badBox of [{ x: -1, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 0, h: 10 }, { x: 0, y: 0, w: Infinity, h: 10 }]) {
    assert.throws(() => eraseObjectMask({ type: "fidelity-crop", box: badBox }, image, slide), /geometry is invalid/);
  }
});
