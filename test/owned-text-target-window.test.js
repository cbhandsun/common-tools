"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { ownedTextTargetWindow, parseOwnedTextHistory, OWNED_TEXT_SEARCH_TARGET_LIMIT } = require("../packages/slideclone-core/owned-text-target-window");
const target = index => ({ pageIndex: 0, id: `text-${index}`, textRevision: "a".repeat(64), sourceHash: "b".repeat(64) });
test("four-target windows skip attempted revisions but admit changed text or source", () => {
  const ranked = Array.from({ length: 8 }, (_, index) => target(index));
  assert.deepEqual(ownedTextTargetWindow(ranked, undefined), ranked.slice(0, 4));
  assert.deepEqual(ownedTextTargetWindow(ranked, ranked.slice(0, 4)), ranked.slice(4));
  assert.deepEqual(ownedTextTargetWindow([ranked[0]], [{ ...ranked[0], textRevision: "c".repeat(64) }]), [ranked[0]]);
  assert.deepEqual(ownedTextTargetWindow([ranked[0]], [{ ...ranked[0], sourceHash: "c".repeat(64) }]), [ranked[0]]);
  assert.deepEqual(ownedTextTargetWindow([], []), []);
});
test("history is bounded, unambiguous and rejects unsafe values without executing them", () => {
  for (const value of [null, {}, [null], [target(0), target(0)], Array.from({ length: OWNED_TEXT_SEARCH_TARGET_LIMIT + 1 }, (_, i) => target(i)),
    [{ ...target(0), pageIndex: -1 }], [{ ...target(0), id: "unsafe\n" }], [{ ...target(0), textRevision: "invalid" }],
    [{ ...target(0), sourceHash: "" }], [{ ...target(0), pageIndex: 20 }], new Array(1)]) {
    assert.throws(() => parseOwnedTextHistory(value), TypeError);
  }
  let executed = false;
  const accessor = { ...target(0), get id() { executed = true; throw new Error("unexpected"); } };
  const arrayAccessor = [];
  Object.defineProperty(arrayAccessor, "0", { get() { executed = true; throw new Error("unexpected"); } });
  for (const value of [[accessor], arrayAccessor, new Proxy([], { get() { executed = true; throw new Error("unexpected"); } })]) {
    assert.throws(() => parseOwnedTextHistory(value), TypeError);
  }
  assert.equal(executed, false);
});

test("the existing search budget bounds carried history and the final partial window", () => {
  const ranked = Array.from({ length: OWNED_TEXT_SEARCH_TARGET_LIMIT + 4 }, (_, i) => target(i));
  assert.deepEqual(ownedTextTargetWindow(ranked, ranked.slice(0, OWNED_TEXT_SEARCH_TARGET_LIMIT - 1)),
    [ranked[OWNED_TEXT_SEARCH_TARGET_LIMIT - 1]]);
  assert.deepEqual(ownedTextTargetWindow(ranked, ranked.slice(0, OWNED_TEXT_SEARCH_TARGET_LIMIT)), []);
});

