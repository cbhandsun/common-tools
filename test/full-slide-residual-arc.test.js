"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { MAX_ARC_SEGMENTS, createArcResidualMasks } = require("../packages/slideclone-core/arc-residual-masks");
const { eraseObjectMask } = require("../packages/slideclone-core/full-slide-native-residual");
const { eraseMasks } = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

function blackPixel(image, x, y) {
  const offset = (y * image.width + x) * 4;
  image.rgba[offset] = 0; image.rgba[offset + 1] = 0; image.rgba[offset + 2] = 0;
}

function pixel(image, x, y) {
  return image.rgba.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4);
}

test("non-filled arc residuals erase only their elliptical path corridor", () => {
  const image = { width: 160, height: 120, rgba: Buffer.alloc(160 * 120 * 4, 255) };
  const item = { type: "arc", style: { fill: "none", adjustments: [270, 360] }, box: { x: 20, y: 20, w: 120, h: 60 } };
  blackPixel(image, 80, 20); // arc start at the top of a non-circular ellipse
  blackPixel(image, 140, 50); // arc end at the right edge
  blackPixel(image, 80, 50); // box interior, away from the arc
  blackPixel(image, 30, 70); // another non-arc region inside the old rectangle mask
  const masks = eraseObjectMask(item, image, { x: 0, y: 0, w: 160, h: 120 });
  assert.ok(Array.isArray(masks));
  assert.ok(masks.length > 1 && masks.length <= MAX_ARC_SEGMENTS);
  const residual = eraseMasks(image, masks);
  assert.deepEqual(pixel(residual, 80, 20), Buffer.from([255, 255, 255, 255]));
  assert.deepEqual(pixel(residual, 140, 50), Buffer.from([255, 255, 255, 255]));
  assert.deepEqual(pixel(residual, 80, 50), Buffer.from([0, 0, 0, 255]));
  assert.deepEqual(pixel(residual, 30, 70), Buffer.from([0, 0, 0, 255]));
});

test("arc residuals preserve cross-zero sweep direction and bound generated segments", () => {
  const image = { width: 160, height: 120, rgba: Buffer.alloc(160 * 120 * 4, 255) };
  const item = { type: "arc", style: { fill: "none", adjustments: [330, 30] }, box: { x: 20, y: 20, w: 120, h: 60 } };
  blackPixel(image, 140, 50);
  blackPixel(image, 20, 50);
  const residual = eraseMasks(image, eraseObjectMask(item, image, { x: 0, y: 0, w: 160, h: 120 }));
  assert.deepEqual(pixel(residual, 140, 50), Buffer.from([255, 255, 255, 255]));
  assert.deepEqual(pixel(residual, 20, 50), Buffer.from([0, 0, 0, 255]));
  assert.equal(createArcResidualMasks(item.box, [999999, -999999], image, 8).length, 1);
  const emptyAdjustmentMasks = createArcResidualMasks(item.box, [], image, 8);
  assert.equal(emptyAdjustmentMasks.length, 23);
  assert.ok(emptyAdjustmentMasks.length <= MAX_ARC_SEGMENTS);
  const defaultArcResidual = eraseMasks(image, emptyAdjustmentMasks);
  assert.deepEqual(pixel(defaultArcResidual, 140, 50), Buffer.from([255, 255, 255, 255]));
  assert.deepEqual(pixel(defaultArcResidual, 20, 50), Buffer.from([0, 0, 0, 255]));
  const negativeStart = createArcResidualMasks(item.box, [-60, 90], image, 8)[0];
  assert.ok(Math.abs(negativeStart.x1 - 140) < 0.01 && Math.abs(negativeStart.y1 - 50) < 0.01);
});

test("arc residuals apply DrawingML flips and clockwise rotation around the ellipse center", () => {
  const image = { width: 160, height: 120, rgba: Buffer.alloc(160 * 120 * 4, 255) };
  const box = { x: 20, y: 20, w: 120, h: 60 };
  blackPixel(image, 20, 50);
  blackPixel(image, 140, 50);
  blackPixel(image, 80, 80);
  const flipped = eraseMasks(image, createArcResidualMasks(box, [270, 360], image, 8, { flipH: true }));
  assert.deepEqual(pixel(flipped, 20, 50), Buffer.from([255, 255, 255, 255]));
  assert.deepEqual(pixel(flipped, 140, 50), Buffer.from([0, 0, 0, 255]));
  const rotated = createArcResidualMasks(box, [270, 360], image, 8, { rotationDeg: 90 });
  const rotatedEnd = rotated[rotated.length - 1];
  assert.ok(rotatedEnd && Math.abs(rotatedEnd.x2 - 80) < 0.01 && Math.abs(rotatedEnd.y2 - 110) < 0.01);
});

test("ellipse arc endpoints use radial angles and rotate before nonuniform pixel scaling", () => {
  const box = { x: 20, y: 20, w: 120, h: 60 };
  const image = { width: 320, height: 120 };
  const start = createArcResidualMasks(box, [45, 90], image, 8)[0];
  const radialOffset = 1 / Math.sqrt(1 / (60 * 60) + 1 / (30 * 30));
  assert.ok(Math.abs(start.x1 - (80 + radialOffset)) < 1e-8);
  assert.ok(Math.abs(start.y1 - (50 + radialOffset)) < 1e-8);
  const rotated = eraseObjectMask({ type: "arc", box, style: { adjustments: [0, 90], rotationDeg: 90 } }, image, { x: 0, y: 0, w: 160, h: 120 });
  assert.ok(Math.abs(rotated[0].x1 - 160) < 1e-8);
  assert.ok(Math.abs(rotated[0].y1 - 110) < 1e-8);
});

test("arc residual masks reject malformed adjustments and retain legacy line behavior", () => {
  const image = { width: 100, height: 100 };
  const box = { x: 10, y: 10, w: 50, h: 20 };
  for (const adjustments of [[0, Infinity], [0, 1, 2], "0,90"]) {
    assert.throws(() => createArcResidualMasks(box, adjustments, image, 8), /arc adjustment|arc adjustments/);
  }
  assert.throws(() => createArcResidualMasks(box, [], image, 8, { flipH: "true" }), /arc transform is invalid/);
  assert.equal(eraseObjectMask({ type: "line", box: { x: 10, y: 10, w: 20, h: 20 } }, image, { x: 0, y: 0, w: 100, h: 100 }).kind, "line");
});
