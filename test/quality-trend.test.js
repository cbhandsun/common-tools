"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  appendQualitySnapshot,
  evaluateQualityTrend,
  extractQualitySnapshot,
  validateHistory
} = require("../skills/pd-hifi-slideclone/scripts/lib/quality-trend");

function snapshot(id, values) {
  return {
    id,
    createdAt: `2026-08-${String(Number(id.replace(/\D/gu, "")) || 1).padStart(2, "0")}T00:00:00.000Z`,
    targets: {
      deck: { passed: true, metrics: values }
    }
  };
}

const healthy = { pixelDiffRatio: 0.1, foregroundMissingRatio: 0.2, editableObjectRatio: 0.9, largestResidualAreaRatio: 0.2 };
const environmentA = "a".repeat(64);
const environmentB = "b".repeat(64);

test("trend gate passes stable metrics and records a bounded history", () => {
  const history = { version: 1, snapshots: [snapshot("v1", healthy), snapshot("v2", { ...healthy, pixelDiffRatio: 0.105 })] };
  const current = snapshot("v3", { ...healthy, pixelDiffRatio: 0.11, editableObjectRatio: 0.895 });
  const result = evaluateQualityTrend(current, history, { windowSize: 2, minimumHistory: 2 });
  assert.equal(result.passed, true);
  const updated = appendQualitySnapshot(history, current, { maximumSnapshots: 2 });
  assert.deepEqual(updated.snapshots.map((item) => item.id), ["v2", "v3"]);
});

test("trend gate supports an explicit zero-history baseline bootstrap", () => {
  const result = evaluateQualityTrend(snapshot("v1", healthy), { version: 1, snapshots: [] }, {
    minimumHistory: 0,
    requiredTargetRatio: 0
  });
  assert.equal(result.passed, true);
  assert.equal(result.targets[0].status, "baseline-bootstrap");
  assert.equal(result.comparedTargets, 0);
});

test("trend gate catches single-version and slow cumulative regression", () => {
  const history = { version: 1, snapshots: [
    snapshot("v1", healthy),
    snapshot("v2", { ...healthy, pixelDiffRatio: 0.12 }),
    snapshot("v3", { ...healthy, pixelDiffRatio: 0.12 })
  ] };
  const current = snapshot("v4", { ...healthy, pixelDiffRatio: 0.132 });
  const result = evaluateQualityTrend(current, history, { windowSize: 3, minimumHistory: 3 });
  assert.equal(result.passed, false);
  const pixel = result.targets[0].checks.find((item) => item.metric === "pixelDiffRatio");
  assert.equal(pixel.reason, "cumulative-regression");
});

test("trend extraction supports complete quality gate reports", () => {
  const extracted = extractQualitySnapshot({
    generatedAt: "2026-08-25T00:00:00Z",
    pptxFile: "C:/safe/deck.pptx",
    passed: true,
    deckMetrics: { pixelDiffRatio: 0.1, foregroundMissingRatio: 0.2 },
    editabilityProfile: { editableObjectRatio: 0.9 },
    reconstructionBudget: { maxLargestResidualAreaRatio: 0.2 }
  }, { environmentFingerprint: environmentA });
  assert.equal(extracted.targets.deck.metrics.largestResidualAreaRatio, 0.2);
  assert.equal(extracted.environmentFingerprint, environmentA);
});

test("trend comparison isolates environment cohorts and reports incompatible history", () => {
  const compatible = { ...snapshot("v1", healthy), environmentFingerprint: environmentA };
  const incompatible = { ...snapshot("v2", { ...healthy, pixelDiffRatio: 0.9 }), environmentFingerprint: environmentB };
  const current = { ...snapshot("v3", { ...healthy, pixelDiffRatio: 0.11 }), environmentFingerprint: environmentA };
  const result = evaluateQualityTrend(current, { version: 1, snapshots: [compatible, incompatible] });
  assert.equal(result.passed, true);
  assert.equal(result.compatibleHistorySnapshots, 1);
  assert.equal(result.incompatibleHistorySnapshots, 1);
  assert.equal(result.environmentFingerprint, environmentA);
});

test("trend gate detects same-environment elapsed-time regression", () => {
  const baseline = { ...snapshot("v1", { ...healthy, elapsedMs: 100000 }), environmentFingerprint: environmentA };
  const current = { ...snapshot("v2", { ...healthy, elapsedMs: 170001 }), environmentFingerprint: environmentA };
  const result = evaluateQualityTrend(current, { version: 1, snapshots: [baseline] });
  assert.equal(result.passed, false);
  const elapsed = result.targets[0].checks.find((item) => item.metric === "elapsedMs");
  assert.equal(elapsed.reason, "window-regression");
  assert.equal(elapsed.threshold, 60000);
});

test("trend validation covers empty, invalid, extreme and missing evidence paths", () => {
  assert.throws(() => validateHistory({ version: 2, snapshots: [] }), /version 1/);
  assert.throws(() => validateHistory({ version: 1, snapshots: Array.from({ length: 1001 }, () => ({})) }), /bounded/);
  assert.equal(evaluateQualityTrend(snapshot("v2", healthy), { version: 1, snapshots: [] }, { minimumHistory: 2 }).passed, false);
  assert.throws(() => evaluateQualityTrend(snapshot("v2", healthy), { version: 1, snapshots: [] }, { minimumHistory: 6 }), /minimumHistory/);
  const missing = snapshot("v2", { pixelDiffRatio: 0.1 });
  const result = evaluateQualityTrend(missing, { version: 1, snapshots: [snapshot("v1", healthy)] });
  assert.equal(result.passed, false);
  assert.ok(result.targets[0].checks.some((check) => check.reason === "missing-evidence"));
  assert.throws(() => evaluateQualityTrend(snapshot("v2", healthy), { version: 1, snapshots: [snapshot("v1", healthy)] }, { thresholds: { unknown: 0.1 } }), /Unknown trend threshold/);
  assert.throws(() => validateHistory({ version: 1, snapshots: [{ ...snapshot("v1", healthy), environmentFingerprint: "unsafe" }] }), /SHA-256/);
});
