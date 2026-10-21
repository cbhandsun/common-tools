"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { admitTransparentResidualMasks } = require("../packages/slideclone-core/residual-mask-alpha-policy");
const { eraseMasks } = require("../packages/slideclone-core/residual-primitive-erasure");

test("alpha selection accepts only exact existing nontext mask identities", () => {
  const a = { x: 1, y: 1, w: 2, h: 2 }, b = { x: 4, y: 1, w: 2, h: 2 };
  const masks = [a, b];
  assert.deepEqual([...admitTransparentResidualMasks(undefined, masks)], []);
  assert.deepEqual([...admitTransparentResidualMasks([], masks)], []);
  assert.deepEqual([...admitTransparentResidualMasks([b], masks)], [b]);
  for (const value of [null, {}, [a, a], [{ ...a }], [new Proxy(a, {})], new Array(1), new Proxy([], {}), Array(30001).fill(a)])
    assert.throws(() => admitTransparentResidualMasks(value, masks), /residual alpha selection/);
  assert.deepEqual(masks, [a, b]);
});

test("text ownership cannot be acquired through an alpha selector", () => {
  const text = { x: 1, y: 1, w: 2, h: 2, textInk: undefined };
  assert.throws(() => admitTransparentResidualMasks([text], [text]), /residual alpha selection/);
});

test("selection rejects hostile descriptors without invoking getters or exposing content", () => {
  let calls = 0;
  const selected = [];
  Object.defineProperty(selected, "0", { get() { calls++; throw new Error("PRIVATE"); } });
  selected.length = 1;
  const mask = Object.defineProperty({}, "x", { get() { calls++; throw new Error("PRIVATE"); } });
  for (const [value, masks] of [[selected, []], [[mask], [mask]]])
    assert.throws(() => admitTransparentResidualMasks(value, masks), error => !error.message.includes("PRIVATE"));
  assert.equal(calls, 0);
});

test("primitive holes preserve the original opaque background restoration of text rectangles", () => {
  const width = 12, height = 8, rgba = Buffer.alloc(width * height * 4, 255);
  const primitive = { x: 1, y: 1, w: 3, h: 3 }, text = { x: 7, y: 1, w: 3, h: 3 };
  for (const box of [primitive, text]) for (let y = box.y; y < box.y + box.h; y++)
    for (let x = box.x; x < box.x + box.w; x++) rgba.set([25, 60, 95, 255], (y * width + x) * 4);
  const source = { width, height, rgba }, original = Buffer.from(rgba);
  const result = eraseMasks(source, [text, primitive], { transparentMasks: [primitive] });
  assert.equal(result.rgba[(2 * width + 2) * 4 + 3], 0);
  assert.equal(result.rgba[(2 * width + 8) * 4 + 3], 255);
  assert.equal(result.rgba[3], 255);
  assert.deepEqual(source.rgba, original);
  assert.throws(() => eraseMasks(source, [text], { transparentMasks: [primitive] }), /residual alpha selection/);
});
