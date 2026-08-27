"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  buildQualityGateOutput,
  readQualityGateOutputFormat
} = require("../skills/pd-hifi-slideclone/scripts/lib/quality-gate-output");

function report() {
  return {
    gate: { passed: false, failures: ["reconstruction-budget"] },
    summary: { pages: 4, accepted: 4, needsReview: 0, rejected: 0 },
    deckMetrics: { pixelDiffRatio: 0.1, foregroundMissingRatio: 0.2, layoutMeanIoU: 0.97 },
    editabilityProfile: { editableObjects: 123, nonEditableImages: 1, actionableNonEditableImages: 0, editableObjectRatio: 0.99 },
    reconstructionContract: { ok: true, errors: [], warnings: [] },
    reconstructionBudget: {
      passed: false,
      failedPageCount: 1,
      maxResidualAreaRatio: 0.64,
      maxLargestResidualAreaRatio: 0.64,
      reasonCounts: { "quality.largest-residual-exceeded": 1 },
      pages: [{ large: "intentionally omitted from compact output" }]
    },
    sourceMediaExclusion: { passed: true, disallowedMatches: 0 },
    reportFile: "quality-gate-report.json",
    contactSheet: null,
    layerProfile: { large: "full-only" }
  };
}

test("quality gate output defaults to compact bounded delivery evidence", () => {
  assert.equal(readQualityGateOutputFormat({}), "compact");
  const output = buildQualityGateOutput(report(), { format: "compact" });
  assert.equal(output.passed, false);
  assert.deepEqual(output.failures, ["reconstruction-budget"]);
  assert.equal(output.pages.accepted, 4);
  assert.equal(output.reconstructionBudget.failedPages, 1);
  assert.equal(output.reconstructionBudget.reasonCounts["quality.largest-residual-exceeded"], 1);
  assert.equal(output.reconstructionBudget.pages, undefined);
  assert.equal(output.layerProfile, undefined);
});

test("quality gate full output remains explicitly available", () => {
  assert.equal(readQualityGateOutputFormat({ "output-format": "full" }), "full");
  assert.equal(readQualityGateOutputFormat({ verbose: "true" }), "full");
  const output = buildQualityGateOutput(report(), { format: "full" });
  assert.deepEqual(output.reconstructionBudget.pages, [{ large: "intentionally omitted from compact output" }]);
  assert.deepEqual(output.layerProfile, { large: "full-only" });
});

test("quality gate output rejects invalid, empty, and extreme boundary data safely", () => {
  assert.throws(() => readQualityGateOutputFormat({ "output-format": "xml" }), /compact or full/);
  assert.throws(() => readQualityGateOutputFormat([]), /must be an object/);
  assert.throws(() => buildQualityGateOutput([], { format: "compact" }), /must be an object/);
  assert.throws(() => buildQualityGateOutput({}, { format: "xml" }), /compact or full/);
  const output = buildQualityGateOutput({
    gate: { failures: Array.from({ length: 1000 }, (_, index) => `failure-${index}`) },
    reconstructionBudget: { reasonCounts: Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [`reason-${index}`, index])) }
  });
  assert.equal(output.failures.length, 100);
  assert.equal(Object.keys(output.reconstructionBudget.reasonCounts).length, 100);
});

test("quality gate rejects an invalid output format before file or renderer work", () => {
  const script = path.resolve(__dirname, "../skills/pd-hifi-slideclone/scripts/quality-gate-real-pptx.js");
  const result = spawnSync(process.execPath, [script, "--output-format", "xml"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /output-format must be compact or full/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /--ir is required|phase.*render/);
});
