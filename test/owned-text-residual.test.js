"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseOwnedTextResiduals, hasOwnedTextInternalResidual } = require("../packages/slideclone-core/owned-text-residual");
function row(overrides = {}) {
  return { id: "ordinary-label", textRevision: "a".repeat(64), sourceHash: "b".repeat(64), pixelDiffRatio: 0.4, foregroundMissingRatio: 0.2, ...overrides };
}
test("internal residual evidence is measured, source-bound, revision-bound and immutable", () => {
  assert.equal(parseOwnedTextResiduals(undefined).size, 0); assert.equal(parseOwnedTextResiduals([]).size, 0);
  const original = row(), parsed = parseOwnedTextResiduals([original]).get(original.id);
  original.pixelDiffRatio = 0;
  assert.equal(parsed.pixelDiffRatio, 0.4);
  assert.equal(hasOwnedTextInternalResidual(parsed, "a".repeat(64), "b".repeat(64)), true);
  assert.equal(hasOwnedTextInternalResidual(parsed, "c".repeat(64), "b".repeat(64)), false);
  assert.equal(hasOwnedTextInternalResidual(parsed, "a".repeat(64), "c".repeat(64)), false);
  assert.equal(hasOwnedTextInternalResidual(undefined, "a".repeat(64), "b".repeat(64)), false);
  assert.equal(hasOwnedTextInternalResidual(row({ pixelDiffRatio: 0.01, foregroundMissingRatio: 0.01 }), "a".repeat(64), "b".repeat(64)), false);
});
test("residual parser rejects invalid, ambiguous, sparse, unsafe and extreme inputs without executing code", () => {
  let executed = false;
  const getter = { ...row(), get pixelDiffRatio() { executed = true; return 0.4; } };
  const proxy = new Proxy(row(), { get() { executed = true; throw new Error("unexpected"); } });
  const array = [row()]; Object.defineProperty(array, "0", { get() { executed = true; return row(); } });
  for (const value of [null, {}, [null], new Array(1), array, new Proxy([row()], {}), [getter], [proxy],
    [Object.assign(Object.create({}), row())], [row(), row()], Array.from({ length: 2001 }, () => row()),
    [row({ id: "unsafe\n" })], [row({ id: "" })], [row({ id: "x".repeat(257) })], [row({ sourceHash: "invalid" })],
    [row({ textRevision: "invalid" })], [row({ pixelDiffRatio: NaN })], [row({ pixelDiffRatio: 1.1 })],
    [row({ foregroundMissingRatio: Infinity })], [row({ foregroundMissingRatio: -1 })], [row({ pixelDiffRatio: "0.4" })]]) {
    assert.throws(() => parseOwnedTextResiduals(value));
  }
  assert.equal(executed, false);
  assert.equal(parseOwnedTextResiduals(Array.from({ length: 2000 }, (_, index) => row({ id: `label-${index}` }))).size, 2000);
});
