"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { selectDenseIconParts } = require("../packages/slideclone-core/quality/dense-icon-part-policy");
const { refineDenseIconCrop } = require("../packages/slideclone-core/archetypes/icon-crop-refiner");

const primary = { pixels: 2000, box: { x: 20, y: 40, w: 60, h: 50 }, color: { r: 20, g: 100, b: 220 } };
const cap = { pixels: 700, box: { x: 22, y: 18, w: 56, h: 18 }, color: { r: 25, g: 110, b: 225 } };
test("dense multipart policy preserves nearby aligned peers without mutating evidence", () => {
  const values = [cap, primary]; const before = structuredClone(values);
  assert.deepEqual(selectDenseIconParts(values, 1), [1, 0]);
  assert.deepEqual(values, before);
  const rotated = values.map(p => ({ ...p, box: { x: p.box.y, y: p.box.x, w: p.box.h, h: p.box.w } }));
  assert.deepEqual(selectDenseIconParts(rotated, 1), [1, 0]);
});
test("dense multipart policy excludes thin, tiny, distant, off-center and differently colored neighbors", () => {
  for (const value of [{ ...cap, pixels: 12 }, { ...cap, pixels: 100 },
    { ...cap, box: { ...cap.box, x: 80 } }, { ...cap, box: { ...cap.box, y: 1 } },
    { ...cap, color: { r: 180, g: 180, b: 180 } }, { ...cap, box: { ...cap.box, h: 3 } }, null]) {
    assert.deepEqual(selectDenseIconParts([primary, value], 0), [0]);
  }
});
test("dense multipart policy bounds unknown and excessive input without evaluating numeric coercion", () => {
  for (const values of [null, [], Array(10001).fill(primary), [{ ...primary, pixels: Infinity }],
    [{ ...primary, pixels: 3001 }], [{ ...primary, color: { r: NaN, g: 20, b: 20 } }],
    [{ ...primary, box: { ...primary.box, w: { valueOf() { throw Error("private-input"); } } } }]]) {
    assert.throws(() => selectDenseIconParts(values, 0), error => /Invalid/.test(error.message) && !error.message.includes("private-input"));
  }
  assert.equal(selectDenseIconParts([primary, ...Array(100).fill(cap)], 0).length, 8);
});
test("dense refinement keeps a disconnected icon cap and excludes the thin outgoing relationship", () => {
  const image = { width: 100, height: 100, rgba: Buffer.alloc(100 * 100 * 4, 255) };
  const fill = (x, y, w, h) => { for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) image.rgba.set([20, 100, 220, 255], (row * 100 + col) * 4); };
  fill(20, 40, 60, 50); fill(22, 18, 56, 18); fill(80, 64, 20, 1);
  const result = refineDenseIconCrop(image, { minimumNeighbors: 17, paddingPx: 2 });
  assert.equal(result.retainedDetailComponents, 1);
  assert.ok(result.box.y <= 18 && result.box.y + result.box.h >= 90);
  assert.ok(result.box.x + result.box.w < 90);
});
