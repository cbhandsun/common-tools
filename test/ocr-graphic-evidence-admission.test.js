"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { admitOcrGraphicEvidence } = require("../packages/slideclone-core/ocr/ocr-graphic-evidence-admission");

function value(overrides = {}) {
  return {
    operation: "source-geometry-graphic",
    version: 1,
    kind: "pictorial-icon",
    candidatePixelBox: { x: 20, y: 30, w: 40, h: 35 },
    tightenedPixelBox: { x: 23, y: 32, w: 31, h: 29 },
    scannedPixels: 3200,
    reasons: ["chromatic-source-ink"],
    metrics: { density: 0.25, outsideRatio: 0.08, chromaticRatio: 0.3, significantComponents: 3, largestComponentRatio: 0.7 },
    ...overrides
  };
}

const expected = { sourceWidth: 200, sourceHeight: 120, candidatePixelBox: { x: 20, y: 30, w: 40, h: 35 } };

test("graphic evidence admission snapshots bounded source geometry", () => {
  const input = value();
  const admitted = admitOcrGraphicEvidence(input, expected);
  assert.deepEqual(admitted, input);
  assert.equal(Object.isFrozen(admitted), true);
  assert.equal(Object.isFrozen(admitted.metrics), true);
  assert.equal(Object.isFrozen(admitted.reasons), true);
  assert.equal(Object.isFrozen(admitted.tightenedPixelBox), true);
});

test("stale, expanded and out-of-source crop evidence is rejected", () => {
  for (const input of [
    value({ candidatePixelBox: { x: 21, y: 30, w: 40, h: 35 } }),
    value({ tightenedPixelBox: { x: 10, y: 20, w: 80, h: 70 } }),
    value({ tightenedPixelBox: { x: 23, y: 32, w: 0, h: 29 } }),
    value({ candidatePixelBox: { x: 180, y: 100, w: 40, h: 35 } })
  ]) assert.throws(() => admitOcrGraphicEvidence(input, expected), /geometry|box/u);
});

test("unknown reasons, contradictory metrics and excessive scans fail closed", () => {
  for (const input of [
    value({ reasons: ["unknown"] }),
    value({ reasons: ["chromatic-source-ink", "chromatic-source-ink"] }),
    value({ metrics: { ...value().metrics, density: Number.NaN } }),
    value({ metrics: { ...value().metrics, significantComponents: 1.5 } }),
    value({ scannedPixels: 300000 })
  ]) assert.throws(() => admitOcrGraphicEvidence(input, expected), /evidence/u);
});

test("missing evidence is optional while malformed security boundaries are rejected", () => {
  assert.equal(admitOcrGraphicEvidence(undefined, expected), null);
  assert.equal(admitOcrGraphicEvidence(null, expected), null);
  assert.throws(() => admitOcrGraphicEvidence(new Proxy(value(), {}), expected), /invalid/u);
  let executed = false;
  const accessor = value();
  Object.defineProperty(accessor, "kind", { get() { executed = true; return "pictorial-icon"; } });
  assert.throws(() => admitOcrGraphicEvidence(accessor, expected), /invalid/u);
  assert.equal(executed, false);
  assert.throws(() => admitOcrGraphicEvidence(value(), { ...expected, sourceWidth: Infinity }), /source/u);
});
