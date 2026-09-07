"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSlideSize, MAX_SLIDE_DIMENSION_PT } = require("../packages/slideclone-core/slide-size");
const { createNativeRebuildPlan } = require("../packages/slideclone-core/native-rebuild-deck-pipeline");

test("slide sizes normalize decimal strings without retaining unrelated input fields", () => {
  const input = { widthPt: " 9.6e2 ", heightPt: "+540.0", private: "content" };
  assert.deepEqual(parseSlideSize(input), { widthPt: 960, heightPt: 540 });
  assert.equal(input.widthPt, " 9.6e2 ");
  assert.deepEqual(parseSlideSize({ widthPt: ".5", heightPt: MAX_SLIDE_DIMENSION_PT }), { widthPt: 0.5, heightPt: 100000 });
});

test("empty, malformed and excessive dimensions never become valid sizes", () => {
  for (const input of [undefined, null, [], true, "960x540", {}]) assert.equal(parseSlideSize(input), null);
  for (const value of [undefined, null, true, false, [], {}, "", " ", "0x3c0", "private", "1".repeat(65), "1e999", "1e-999", NaN, Infinity, -1, 0, 100001]) {
    assert.equal(parseSlideSize({ widthPt: value, heightPt: 540 }), null);
    assert.equal(parseSlideSize({ widthPt: 960, heightPt: value }), null);
  }
});

test("dimension validation does not execute coercion hooks, accessors or inherited values", () => {
  const hostile = { valueOf() { throw new Error("must not execute"); }, toString() { throw new Error("must not execute"); } };
  assert.equal(parseSlideSize({ widthPt: hostile, heightPt: 540 }), null);
  assert.equal(parseSlideSize({ get widthPt() { throw new Error("must not execute"); }, heightPt: 540 }), null);
  assert.equal(parseSlideSize(Object.create({ widthPt: 960, heightPt: 540 })), null);
});

test("planner retains its documented fallback while producing numeric dimensions", () => {
  const source = { slideSize: { widthPt: true, heightPt: 540 }, pages: [] };
  const services = { readJson: () => source, sourceNativeSlideMetadata: () => new Map(), defaultSlide: { widthPt: "800", heightPt: "600" } };
  assert.deepEqual(createNativeRebuildPlan({ workDir: "C:/safe", services }).slideSize, { widthPt: 800, heightPt: 600 });
  assert.deepEqual(createNativeRebuildPlan({ workDir: "C:/safe", services: { ...services, defaultSlide: null } }).slideSize, { widthPt: 960, heightPt: 540 });
  assert.equal(source.slideSize.widthPt, true);
});

test("unexpected property inspection failures propagate instead of silently choosing a size", () => {
  const failure = new Error("inspection failed");
  const proxy = new Proxy({}, { getOwnPropertyDescriptor() { throw failure; } });
  assert.throws(() => parseSlideSize(proxy), (error) => error === failure);
});
