"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { isSimpleOwnedText, isOwnedTextEligible } = require("../packages/slideclone-core/owned-text-eligibility");

function text() {
  return { id: "text", text: "\u4e2d\u6587\u2192\u6d41\u7a0b", font: { sizePt: 20 },
    style: { visibility: "visible", wrap: false }, source: { editable: true, confidence: 0.95, ocrProvider: "test" } };
}

test("simple owned text permits ordinary native symbols across arrow, math and currency families", () => {
  for (const value of ["\u4e2d\u6587\u2192\u6d41\u7a0b", "A \u21d2 B", "A \u2208 B", "x \u2264 3", "\u00a5100", "\u20ac123", "ABC", "\u4e2d\u6587\uff0c\u6807\u70b9"]) {
    assert.equal(isSimpleOwnedText(value), true);
    assert.equal(isOwnedTextEligible({ ...text(), text: value }), true);
  }
});

test("simple owned text rejects empty, invalid, extreme, invisible and shaping-dependent inputs", () => {
  for (const value of [null, undefined, {}, 123, "", "ab", "   ", "a".repeat(129),
    "A\nB", "A\rB", "A\tB", "A\0B", "A\u2028B", "A\u2029B", "A\u200dB", "A\u200cB", "A\u202eB",
    "A\ud800B", "A\ue000B", "A\u0378B", "A\ufe0fB", "A\ufe0eB", "A\u{e0100}B", "A\u20e3B",
    "A\u{1f600}B", "A\u{1f1e8}\u{1f1f3}B", "A\u{1f3fd}B", "A\u{e0061}B",
    "a\u0301b", "\u0627\u0644\u0641", "\u0915\u093f\u0924"]) {
    assert.equal(isSimpleOwnedText(value), false);
  }
});

test("shared admission preserves confidence, ownership, visibility and rendering boundaries", () => {
  assert.equal(isOwnedTextEligible(text()), true);
  for (const value of [undefined, {}, [], 1]) assert.equal(isOwnedTextEligible(value), false);
  for (const patch of [null, { font: null }, { id: "" }, { id: "a".repeat(257) }, { text: "\u{1f600}ab" },
    { rotation: NaN }, { rotation: 1 }, { wrap: true }, { runs: [] }, { runs: null },
    { font: { sizePt: Infinity } }, { font: { sizePt: 5 } }, { font: { sizePt: 97 } },
    { font: { sizePt: 20, opacity: 0 } }, { style: { visibility: "hidden", wrap: false } },
    { style: { visibility: "visible", wrap: true } }, { style: { visibility: "visible", wrap: false, opacity: NaN } },
    { style: { visibility: "visible", wrap: false, textWarp: "textPlain" } },
    { source: { ...text().source, confidence: 0.89 } }, { source: { ...text().source, confidence: 1.1 } },
    { source: { ...text().source, confidence: NaN } }, { source: { ...text().source, editable: false } },
    { source: { ...text().source, nativeComponentGroupId: "group" } },
    { source: { ...text().source, segmentedOcrLineId: "line" } },
    { source: { ...text().source, ocrProvider: "" } }]) {
    assert.equal(isOwnedTextEligible(patch === null ? null : { ...text(), ...patch }), false);
  }
});

test("shared admission rejects accessors and proxies without executing them", () => {
  let executed = false;
  const accessor = { ...text() };
  Object.defineProperty(accessor, "text", { get() { executed = true; throw new Error("getter executed"); } });
  const nested = { ...text(), source: { ...text().source } };
  Object.defineProperty(nested.source, "confidence", { get() { executed = true; throw new Error("getter executed"); } });
  const proxy = new Proxy(text(), { get() { executed = true; throw new Error("proxy executed"); } });
  for (const value of [accessor, nested, proxy]) assert.equal(isOwnedTextEligible(value), false);
  assert.equal(executed, false);
});
