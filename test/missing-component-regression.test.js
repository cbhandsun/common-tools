"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { sharedMissingComponentRegression, missingReferenceRegions } = require("../packages/slideclone-worker-adapter/missing-component-regression");
const { finalRefinementQualityAcceptable } = require("../packages/slideclone-worker-adapter/team-worker");

function region(id, x, y, severity, extra = {}) {
  return { id, pageIndex: 0, kind: "missing", role: "missing-native-component", severity,
    box: { x, y, w: 10, h: 10 }, source: { detector: "missing-native-component-quality" }, ...extra };
}

test("missing-component rank changes do not compare unrelated source regions", () => {
  const before = [region("missing-001", 100, 100, 5), region("missing-002", 200, 200, 9)];
  const after = [region("missing-001", 200, 200, 9), region("missing-002", 100, 100, 5)];
  assert.equal(sharedMissingComponentRegression(before, after), 0);
  assert.equal(sharedMissingComponentRegression(before, [after[0]]), 0);
});

test("fixed source ROI evidence distinguishes shrinking fragments from true regressions and fails closed on missing evidence", () => {
  const before = [region("a", 100, 100, 5)];
  const after = [region("b", 103, 103, 8, { box: { x: 103, y: 103, w: 4, h: 4 } })];
  const reference = { pageIndex: 0, box: { ...before[0].box }, severity: 3 };
  assert.equal(sharedMissingComponentRegression(before, after, [reference]), 0);
  assert.equal(sharedMissingComponentRegression(before, after, [{ ...reference, severity: 7 }]), 2);
  assert.equal(sharedMissingComponentRegression(before, after, []), Infinity);
  assert.equal(sharedMissingComponentRegression(before, after, [{ ...reference, severity: NaN }]), Infinity);
  assert.equal(sharedMissingComponentRegression(before, after, [{ ...reference, pageIndex: 1 }]), Infinity);
  assert.equal(sharedMissingComponentRegression(before, after, [reference], [{ ...reference, severity: 2 }]), 1);
  assert.equal(sharedMissingComponentRegression(before, after, [reference], []), Infinity);
  assert.equal(sharedMissingComponentRegression(before, after, [reference, reference]), Infinity);
  const regions = missingReferenceRegions({ componentWorst: after, componentReferenceMetrics: [reference] });
  assert.deepEqual(regions[0].box, before[0].box);
  assert.throws(() => missingReferenceRegions({ componentReferenceMetrics: [{}] }), /invalid/u);
});

test("missing-component regression is detected despite renumbering and overlapping bounds growth", () => {
  const before = [region("missing-001", 100, 100, 5)];
  assert.equal(sharedMissingComponentRegression(before, [region("missing-050", 100, 100, 7)]), 2);
  assert.equal(sharedMissingComponentRegression(before, [region("missing-050", 99, 99, 7, { box: { x: 99, y: 99, w: 12, h: 12 } })]), 2);
  assert.equal(sharedMissingComponentRegression(before, [region("missing-001", 100, 100, 7, { pageIndex: 1 })]), 0);
});

test("ambiguous overlapping evidence uses the stricter baseline and never relies on generated IDs", () => {
  const before = [region("a", 100, 100, 5), region("b", 100, 100, 8)];
  assert.equal(sharedMissingComponentRegression(before, [region("c", 100, 100, 7)]), 2);
  assert.equal(sharedMissingComponentRegression(before, [region("a", 105, 100, 10)]), 0);
});

test("missing-component matching bounds work and rejects malformed diagnostic geometry", () => {
  assert.equal(sharedMissingComponentRegression(undefined, undefined), 0);
  assert.equal(sharedMissingComponentRegression([], []), 0);
  for (const invalid of [null, {}, Array(20001).fill({}), Array(81).fill(region("a", 1, 1, 1)),
    [region("a", 1, 1, NaN)], [region("a", 1, 1, 11)], [region("a", -1, 1, 1)],
    [region("a", 1, 1, 1, { box: { x: 1, y: 1, w: 0, h: 10 } })],
    [region("a", 1, 1, 1, { box: { x: 1, y: 1, w: Infinity, h: 10 } })],
    [region("a", 1, 1, 1, { pageIndex: "0" })]]) {
    assert.equal(sharedMissingComponentRegression(invalid, []), Infinity);
    assert.equal(sharedMissingComponentRegression([], invalid), Infinity);
  }
});

test("full refinement gate permits renumbered unchanged fragments but rejects real spatial and native component regressions", () => {
  const baseline = { checks: [{ name: "quality-rendered", passed: true }], metrics: {
    "pixel-diff-ratio": 0.10, "foreground-missing-ratio": 0.05, "mean-absolute-delta": 15,
    "component-regions-attention": 5, "worst-component-normalized-severity": 9 },
    componentWorst: [region("missing-001", 100, 100, 5), region("missing-002", 200, 200, 9)] };
  const candidate = { ...baseline, metrics: { ...baseline.metrics, "pixel-diff-ratio": 0.09,
    "foreground-missing-ratio": 0.04, "mean-absolute-delta": 14 },
    componentWorst: [region("missing-001", 200, 200, 9), region("missing-002", 100, 100, 5)] };
  assert.equal(finalRefinementQualityAcceptable({ baselineQuality: baseline, candidateQuality: candidate }), true);
  candidate.componentWorst[1].severity = 6;
  assert.equal(finalRefinementQualityAcceptable({ baselineQuality: baseline, candidateQuality: candidate }), false);
  const native = { pageIndex: 0, id: "native-text", kind: "text", severity: 1 };
  const b = { ...baseline, componentWorst: [native] };
  const c = { ...candidate, componentWorst: [{ ...native, severity: 2 }] };
  assert.equal(finalRefinementQualityAcceptable({ baselineQuality: b, candidateQuality: c }), false);
});
