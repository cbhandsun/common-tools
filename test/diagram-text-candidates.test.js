"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { collectDiagramTextCandidates: collect, PRODUCER_FIELDS } = require("../packages/slideclone-core/diagram-text-candidates");

const image = (items) => ({ source: { demandUnderstandingNativeTextBoxes: items } });
test("diagram candidates preserve producer order, identity and rounded geometry deduplication", () => {
  const items = PRODUCER_FIELDS.map((text) => ({ text, box: { x: 1, y: 2, w: 3, h: 4 } }));
  const source = Object.fromEntries(PRODUCER_FIELDS.map((key, index) => [key, [items[index]]]));
  const result = collect([{ source }, { source }]);
  assert.deepEqual(result, items);
  assert.equal(result[0], items[0]);
  const original = { text: "same", box: { x: "1.001" } };
  assert.deepEqual(collect([image([original, { text: "same", box: { x: 1.002 } }])]), [original]);
  assert.equal(original.box.x, "1.001");
});
test("diagram candidate keys cannot collide across detector and text separators", () => {
  const items = [{ source: { detector: "a" }, text: "b:c" }, { source: { detector: "a:b" }, text: "c" }];
  assert.deepEqual(collect([image(items)]), items);
});
test("diagram candidates handle empty metadata and reject malformed or unbounded values", () => {
  for (const value of [undefined, null, [], [null, {}, { source: {} }]]) assert.deepEqual(collect(value), []);
  for (const value of [false, "secret", {}, new Array(100001)]) assert.throws(() => collect(value), /diagram text/);
  for (const item of [null, false, [], { text: 1 }, { text: "x".repeat(100001) }, { box: { x: Infinity } }, { box: { x: 1000001 } }, { box: { x: false } }]) {
    assert.throws(() => collect([image([item])]), /diagram text/);
  }
  assert.throws(() => collect([image(new Array(100001))]), /limit exceeded/);
  assert.equal(collect([image([{ box: { x: -1000000, y: 1000000 } }])]).length, 1);
});
test("diagram metadata never invokes accessors or coordinate conversion hooks", () => {
  let invoked = false;
  const candidate = Object.defineProperty({}, "text", { get() { invoked = true; throw new Error("private text"); } });
  assert.throws(() => collect([image([candidate])]), /metadata accessor is invalid/);
  assert.throws(() => collect([image([{ box: { x: { valueOf() { invoked = true; return 1; } } } }])]), /coordinate is invalid/);
  assert.equal(invoked, false);
});
