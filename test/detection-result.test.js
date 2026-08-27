"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createDetectionResult,
  unmatchedDetectionResult,
  validateDetectionResult
} = require("../skills/pd-hifi-slideclone/scripts/lib/detection-result");

test("detection results normalize evidence, claims, diagnostics, and confidence", () => {
  const result = createDetectionResult({
    matched: true,
    confidence: 0.91,
    bounds: { x: 1, y: 2, w: 30, h: 40 },
    evidence: [{ code: "pixel.radial", score: 0.9, box: { x: 1, y: 2, w: 3, h: 4 } }],
    reasonCodes: ["network.radial", "network.radial"],
    claimedRegions: [{ id: "network-core", box: { x: 1, y: 2, w: 30, h: 40 }, purpose: "native-rebuild", dropResidual: true }],
    diagnostics: { rayCount: 12, dense: true, policy: "editable-first" }
  });
  assert.equal(result.failureMode, "none");
  assert.equal(result.reasonCodes.length, 1);
  assert.equal(result.claimedRegions[0].dropResidual, true);
  assert.deepEqual(validateDetectionResult(result), { ok: true, errors: [] });
  assert.equal(Object.isFrozen(result.claimedRegions[0]), true);
});

test("unmatched detection results are explicit and safe", () => {
  const result = unmatchedDetectionResult("network.no-rays");
  assert.equal(result.matched, false);
  assert.equal(result.confidence, 0);
  assert.equal(result.failureMode, "insufficient-evidence");
  assert.deepEqual(validateDetectionResult(result), { ok: true, errors: [] });
});

test("detection result boundary coercion rejects invalid, extreme, and unsafe values", () => {
  const result = createDetectionResult({
    matched: false,
    confidence: 99,
    bounds: { x: 0, y: 0, w: Number.NaN, h: 1 },
    reasonCodes: ["unsafe\nuser-content"],
    claimedRegions: [{ id: "../../escape", box: { x: 0, y: 0, w: 1e20, h: 2 } }],
    diagnostics: { payload: "raw user content with spaces", count: Infinity }
  });
  assert.equal(result.confidence, 0);
  assert.equal(result.bounds, null);
  assert.deepEqual(result.reasonCodes, ["detector.unspecified"]);
  assert.deepEqual(result.claimedRegions, []);
  assert.deepEqual(result.diagnostics, {});
  assert.deepEqual(validateDetectionResult(result), { ok: true, errors: [] });
  assert.equal(validateDetectionResult(null).ok, false);
});

test("detection validation fails closed for contradictory external objects", () => {
  const result = validateDetectionResult({
    contractVersion: "9",
    matched: true,
    confidence: -1,
    bounds: null,
    evidence: [],
    reasonCodes: [],
    claimedRegions: [],
    diagnostics: {},
    failureMode: "internal-failure"
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.includes("matched results")));
});
