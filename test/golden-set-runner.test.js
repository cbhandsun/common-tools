"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  caseTimeoutMs,
  evaluateDeliveryExpectations,
  parsePositiveInt,
  goldenSetRunnerUsage,
  runCases,
  selectCases,
  summarizeTotals
} = require("../skills/pd-hifi-slideclone/scripts/golden-set-runner");

function deliveryReport(overrides = {}) {
  return {
    editability: { images: 1, shapes: 28, tables: 1, textBoxes: 10, rasterImageAreaRatio: 0.0678 },
    editabilityProfile: {
      physicalShapes: 28,
      logicalShapes: 28,
      physicalTextBoxes: 10,
      logicalTextBoxes: 10,
      maxRasterImageAreaRatio: 0.0678,
      detectorCounts: { "review-risk-gate-flow-residual-crop": 1 },
      imageExpressionCounts: { "screenshot-or-document": 1 }
    },
    visualUnitDecisionProfile: { intentionalMinimumUnitCrops: 1, actionableUnexplainedCrops: 0 },
    nativeComponentProfile: { groups: 4, ungroupedNativeComponentParts: 0 },
    deckMetrics: { pixelDiffRatio: 0.12, foregroundMissingRatio: 0.14, layoutMeanIoU: 0.93 },
    ...overrides
  };
}

test("golden-set runner scopes an environment to each child without mutating the parent", async () => {
  const key = "SLIDECLONE_CORPUS_TEST_SCOPE";
  const before = process.env[key];
  const entries = ["first", "second"].map((id) => ({
    id,
    mode: "command-passes",
    command: [process.execPath, "-e", `process.exit(process.env.${key} === '${id}' ? 0 : 23)`]
  }));
  const results = await runCases(entries, {
    concurrency: 1,
    timeoutMs: 5000,
    environmentForCase: (entry) => ({ ...process.env, [key]: entry.id })
  });
  assert.deepEqual(results.map((result) => result.ok), [true, true]);
  assert.equal(process.env[key], before);
  assert.equal(JSON.stringify(results).includes('"env"'), false);
});

test("golden-set runner supports per-case timeout budgets", () => {
  assert.equal(caseTimeoutMs({ timeoutMs: 360000 }, 180000), 360000);
  assert.equal(caseTimeoutMs({ timeoutMs: "450000" }, 180000), 450000);
  assert.equal(caseTimeoutMs({ timeoutMs: 0 }, 180000), 180000);
});

test("golden-set runner parses positive integers with fallback", () => {
  assert.equal(parsePositiveInt("42", 7), 42);
  assert.equal(parsePositiveInt("-1", 7), 7);
  assert.equal(parsePositiveInt("not-a-number", 7), 7);
});

test("golden-set runner documents a side-effect-free help path", () => {
  const usage = goldenSetRunnerUsage();
  assert.match(usage, /--help, -h/);
  assert.match(usage, /without running any cases/);
  assert.match(usage, /Concurrent cases \(default: 2\)/);
});

test("golden-set runner keeps report order while using bounded concurrency", async () => {
  let active = 0;
  let peak = 0;
  const results = await runCases([{ id: "one" }, { id: "two" }, { id: "three" }], {
    concurrency: 2,
    runCase: async (entry) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 8));
      active -= 1;
      return { id: entry.id, ok: true };
    }
  });

  assert.equal(peak, 2);
  assert.deepEqual(results.map((item) => item.id), ["one", "two", "three"]);
  assert.ok(results.every((item) => item.elapsedMs >= 0));
});

test("golden-set totals expose failures for process exit handling", () => {
  const totals = summarizeTotals([
    { mode: "delivery", ok: true, passed: true },
    { mode: "delivery", ok: true, passed: false },
    { mode: "command-passes", ok: false, passed: false }
  ]);
  assert.equal(totals.passingCases, 1);
  assert.equal(totals.failingCases, 2);
});

test("golden-set runner resolves named suites and explicit cases without duplicates", () => {
  const manifest = {
    suites: { strict: ["two", "three"] },
    cases: [{ id: "one" }, { id: "two" }, { id: "three" }]
  };
  assert.deepEqual(selectCases(manifest, { suite: "strict", case: "one,two" }).map((entry) => entry.id), ["one", "two", "three"]);
  assert.deepEqual(selectCases(manifest, { only: "two,three" }).map((entry) => entry.id), ["two", "three"]);
  assert.deepEqual(selectCases(manifest, { case: "one", only: "three" }).map((entry) => entry.id), ["one", "three"]);
  assert.deepEqual(selectCases(manifest, {}).map((entry) => entry.id), ["one", "two", "three"]);
});

test("golden-set runner rejects unknown suites, dangling suite cases, and duplicate case ids", () => {
  const manifest = { suites: { broken: ["missing"] }, cases: [{ id: "one" }] };
  assert.throws(() => selectCases(manifest, { suite: "unknown" }), /Unknown --suite/);
  assert.throws(() => selectCases(manifest, { suite: "broken" }), /Unknown --case/);
  assert.throws(() => selectCases({ cases: [{ id: "one" }, { id: "one" }] }, {}), /Duplicate/);
});

test("golden-set delivery expectations enforce native structure and minimum raster bounds", () => {
  const expectations = {
    maxImages: 2,
    minShapes: 28,
    maxShapes: 30,
    minTables: 1,
    minTextBoxes: 10,
    maxTextBoxes: 10,
    maxRasterImageAreaRatio: 0.07,
    maxSingleRasterImageAreaRatio: 0.07,
    maxPixelDiffRatio: 0.13,
    maxForegroundMissingRatio: 0.15,
    minLayoutMeanIoU: 0.9,
    minNativeComponentGroups: 4,
    maxNativeComponentGroups: 4,
    maxUngroupedNativeComponentParts: 0,
    allowedImageDetectors: ["review-risk-gate-flow-residual-crop"]
  };

  const result = evaluateDeliveryExpectations(deliveryReport(), expectations);

  assert.equal(result.configured, true);
  assert.equal(result.passed, true);
  assert.equal(result.checks.length, 15);
});

test("golden-set delivery expectations reject visually passing fake-editable regressions", () => {
  const report = deliveryReport({
    editability: { images: 4, shapes: 1, tables: 0, textBoxes: 10, rasterImageAreaRatio: 0.45 },
    editabilityProfile: { detectorCounts: { "product-illustration-segment-crop": 4 } }
  });

  const result = evaluateDeliveryExpectations(report, {
    maxImages: 1,
    minShapes: 28,
    minTables: 1,
    maxRasterImageAreaRatio: 0.07,
    allowedImageDetectors: ["review-risk-gate-flow-residual-crop"]
  });

  assert.equal(result.passed, false);
  assert.ok(result.checks.filter((check) => check.passed === false).length >= 4);
});

test("golden-set delivery expectations count promoted connector segments without losing legacy fallback", () => {
  const promoted = deliveryReport({
    editability: { images: 1, shapes: 16, tables: 1, textBoxes: 10, rasterImageAreaRatio: 0.0678 },
    editabilityProfile: { logicalShapes: 18 }
  });
  assert.equal(evaluateDeliveryExpectations(promoted, { minShapes: 18, maxShapes: 18 }).passed, true);

  const legacy = deliveryReport({
    editability: { images: 1, shapes: 16, tables: 1, textBoxes: 10, rasterImageAreaRatio: 0.0678 },
    editabilityProfile: {}
  });
  assert.equal(evaluateDeliveryExpectations(legacy, { minShapes: 16, maxShapes: 16 }).passed, true);
});

test("golden-set delivery expectations count labels embedded in native shapes as logical shape content", () => {
  const report = deliveryReport({
    editability: { images: 1, shapes: 28, tables: 1, textBoxes: 21, rasterImageAreaRatio: 0.0678 },
    editabilityProfile: { logicalShapes: 28, logicalTextBoxes: 19 }
  });
  assert.equal(evaluateDeliveryExpectations(report, { minTextBoxes: 19, maxTextBoxes: 19 }).passed, true);
});

test("golden-set delivery expectations distinguish intentional visual units from unresolved crops", () => {
  const expectations = {
    minIntentionalMinimumUnitCrops: 1,
    maxActionableUnexplainedCrops: 0,
    allowedImageExpressionForms: ["screenshot-or-document"]
  };

  assert.equal(evaluateDeliveryExpectations(deliveryReport(), expectations).passed, true);
  assert.equal(evaluateDeliveryExpectations(deliveryReport({
    visualUnitDecisionProfile: { intentionalMinimumUnitCrops: 0, actionableUnexplainedCrops: 1 }
  }), expectations).passed, false);
  assert.equal(evaluateDeliveryExpectations(deliveryReport({
    editabilityProfile: {
      detectorCounts: { "review-risk-gate-flow-residual-crop": 1 },
      imageExpressionCounts: { "complex-diagram": 1 }
    }
  }), expectations).passed, false);
});

test("golden-set delivery expectations fail closed for invalid configuration and missing evidence", () => {
  assert.equal(evaluateDeliveryExpectations(deliveryReport(), { maxImages: -1 }).passed, false);
  assert.equal(evaluateDeliveryExpectations(deliveryReport(), { maxShapes: 27 }).passed, false);
  assert.equal(evaluateDeliveryExpectations(deliveryReport(), { maxTextBoxes: 9 }).passed, false);
  assert.equal(evaluateDeliveryExpectations(deliveryReport(), { maxRasterImageAreaRatio: Number.NaN }).passed, false);
  assert.equal(evaluateDeliveryExpectations(deliveryReport(), { maxSingleRasterImageAreaRatio: 0.06 }).passed, false);
  assert.equal(evaluateDeliveryExpectations(deliveryReport(), { maxPixelDiffRatio: 0.11 }).passed, false);
  assert.equal(evaluateDeliveryExpectations(deliveryReport(), { maxForegroundMissingRatio: 0.13 }).passed, false);
  assert.equal(evaluateDeliveryExpectations(deliveryReport(), { minLayoutMeanIoU: 0.94 }).passed, false);
  assert.equal(evaluateDeliveryExpectations({ ...deliveryReport(), deckMetrics: {} }, { maxPixelDiffRatio: 0.2 }).passed, false);
  assert.equal(evaluateDeliveryExpectations(deliveryReport(), { minNativeComponentGroups: 5 }).passed, false);
  assert.equal(evaluateDeliveryExpectations(deliveryReport(), { maxNativeComponentGroups: 3 }).passed, false);
  assert.equal(evaluateDeliveryExpectations(deliveryReport({ nativeComponentProfile: { groups: 4, ungroupedNativeComponentParts: 1 } }), { maxUngroupedNativeComponentParts: 0 }).passed, false);
  assert.equal(evaluateDeliveryExpectations(deliveryReport(), { allowedImageDetectors: ["ok", "ok"] }).passed, false);
  assert.equal(evaluateDeliveryExpectations(deliveryReport(), { allowedImageExpressionForms: ["ok", "ok"] }).passed, false);
  assert.equal(evaluateDeliveryExpectations({}, { minShapes: 1 }).passed, false);
  assert.equal(evaluateDeliveryExpectations({}, { minTables: 1 }).passed, false);
  assert.equal(evaluateDeliveryExpectations(deliveryReport(), { unknownGate: true }).passed, false);
});

test("complex strict real cases all declare structural editability expectations", () => {
  const manifestFile = path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "golden-set.manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const caseById = new Map(manifest.cases.map((entry) => [entry.id, entry]));
  const realCases = manifest.suites["complex-strict"]
    .filter((id) => id !== "chart-native-render-golden")
    .map((id) => caseById.get(id));

  assert.equal(realCases.length, 53);
  assert.ok(realCases.every((entry) => entry && entry.mode === "delivery"));
  assert.ok(realCases.every((entry) => entry.expect && typeof entry.expect === "object"));
  assert.equal(caseById.get("complex-text-anchored-process-network-real")?.pageType, "text-anchored-branch-join-process-network");
  assert.deepEqual(caseById.get("complex-asset-hub-source-purification-real").expect, {
    maxImages: 2,
    minShapes: 22,
    maxShapes: 22,
    minTextBoxes: 13,
    maxTextBoxes: 13,
    maxRasterImageAreaRatio: 0.215,
    maxSingleRasterImageAreaRatio: 0.135,
    maxPixelDiffRatio: 0.18,
    maxForegroundMissingRatio: 0.22,
    minLayoutMeanIoU: 0.99,
    minIntentionalMinimumUnitCrops: 2,
    maxActionableUnexplainedCrops: 0,
    minNativeComponentGroups: 9,
    maxNativeComponentGroups: 9,
    maxUngroupedNativeComponentParts: 0,
    allowedImageDetectors: ["asset-hub-source-purification-minimum-unit-crop"],
    allowedImageExpressionForms: ["icon-or-illustration"]
  });
  assert.deepEqual(caseById.get("complex-collaboration-challenge-protected-real").expect, {
    maxImages: 2,
    maxShapes: 0,
    minTextBoxes: 2,
    maxTextBoxes: 2,
    maxRasterImageAreaRatio: 0.65,
    maxSingleRasterImageAreaRatio: 0.56,
    maxPixelDiffRatio: 0.05,
    maxForegroundMissingRatio: 0.095,
    minLayoutMeanIoU: 0.99,
    minIntentionalMinimumUnitCrops: 2,
    maxActionableUnexplainedCrops: 0,
    maxNativeComponentGroups: 0,
    maxUngroupedNativeComponentParts: 0,
    allowedImageDetectors: ["product-collaboration-challenge-protected-diagram-crop"],
    allowedImageExpressionForms: ["complex-diagram"]
  });
  assert.deepEqual(caseById.get("complex-wms-quality-gate-hybrid-real").expect, {
    maxImages: 1,
    minShapes: 18,
    maxShapes: 18,
    minTextBoxes: 14,
    maxTextBoxes: 14,
    maxRasterImageAreaRatio: 0.175,
    maxSingleRasterImageAreaRatio: 0.175,
    maxPixelDiffRatio: 0.112,
    maxForegroundMissingRatio: 0.21,
    minIntentionalMinimumUnitCrops: 1,
    maxActionableUnexplainedCrops: 0,
    minNativeComponentGroups: 4,
    maxNativeComponentGroups: 4,
    maxUngroupedNativeComponentParts: 0,
    allowedImageDetectors: ["product-brain-wms-quality-input-complexity-crop"],
    allowedImageExpressionForms: ["icon-or-illustration"]
  });
  assert.deepEqual(caseById.get("native-skills-ai-comparison-table-real").expect, {
    maxImages: 9,
    maxShapes: 0,
    minTables: 1,
    minTextBoxes: 1,
    maxTextBoxes: 1,
    maxRasterImageAreaRatio: 0.055,
    maxSingleRasterImageAreaRatio: 0.0071,
    maxPixelDiffRatio: 0.09,
    maxForegroundMissingRatio: 0.45,
    minLayoutMeanIoU: 0.99,
    minIntentionalMinimumUnitCrops: 9,
    maxActionableUnexplainedCrops: 0,
    minNativeComponentGroups: 1,
    maxNativeComponentGroups: 1,
    maxUngroupedNativeComponentParts: 0,
    allowedImageDetectors: ["skills-engine-ai-comparison-status-icon-crop"],
    allowedImageExpressionForms: ["icon-or-illustration"]
  });
  assert.deepEqual(caseById.get("complex-closed-loop-real").expect, {
    maxImages: 10,
    minShapes: 21,
    maxShapes: 24,
    minTextBoxes: 10,
    maxRasterImageAreaRatio: 0.08,
    maxSingleRasterImageAreaRatio: 0.022,
    maxPixelDiffRatio: 0.07,
    maxForegroundMissingRatio: 0.27,
    minLayoutMeanIoU: 0.99,
    minIntentionalMinimumUnitCrops: 10,
    maxActionableUnexplainedCrops: 0,
    minNativeComponentGroups: 7,
    maxNativeComponentGroups: 7,
    maxUngroupedNativeComponentParts: 0,
    allowedImageDetectors: ["asset-os-closed-loop-input-fidelity-crop", "asset-os-closed-loop-pictorial-atom-crop"],
    allowedImageExpressionForms: ["screenshot-or-document", "icon-or-illustration"]
  });
  assert.deepEqual(caseById.get("complex-stage-timeline-real").expect, {
    maxImages: 0,
    minShapes: 12,
    maxShapes: 14,
    minTextBoxes: 18,
    maxTextBoxes: 18,
    minNativeComponentGroups: 4,
    maxNativeComponentGroups: 4,
    maxUngroupedNativeComponentParts: 0,
    maxRasterImageAreaRatio: 0,
    allowedImageDetectors: []
  });
  assert.deepEqual(caseById.get("complex-semantic-hub-spoke-real").expect, {
    maxImages: 7,
    minShapes: 14,
    maxShapes: 14,
    minTextBoxes: 9,
    minNativeComponentGroups: 7,
    maxNativeComponentGroups: 7,
    maxUngroupedNativeComponentParts: 0,
    maxRasterImageAreaRatio: 0.24,
    maxSingleRasterImageAreaRatio: 0.121,
    minIntentionalMinimumUnitCrops: 7,
    maxActionableUnexplainedCrops: 0,
    allowedImageDetectors: ["asset-hub-cycle-residual-crop"],
    allowedImageExpressionForms: ["icon-or-illustration"]
  });
  assert.deepEqual(caseById.get("complex-quadrant-cycle-real").expect, {
    maxImages: 1,
    minShapes: 0,
    maxShapes: 0,
    minTextBoxes: 16,
    maxTextBoxes: 16,
    maxRasterImageAreaRatio: 0.4,
    maxSingleRasterImageAreaRatio: 0.4,
    maxPixelDiffRatio: 0.07,
    maxForegroundMissingRatio: 0.07,
    minIntentionalMinimumUnitCrops: 1,
    maxActionableUnexplainedCrops: 0,
    allowedImageDetectors: ["center-badge-quadrant-cycle-fidelity-crop"],
    allowedImageExpressionForms: ["screenshot-or-document"]
  });
  assert.deepEqual(caseById.get("hybrid-workflow-challenge-triad-real").expect, {
    maxImages: 3,
    minShapes: 18,
    maxShapes: 18,
    minTextBoxes: 6,
    maxTextBoxes: 6,
    maxRasterImageAreaRatio: 0.3,
    maxSingleRasterImageAreaRatio: 0.11,
    maxPixelDiffRatio: 0.085,
    maxForegroundMissingRatio: 0.11,
    minIntentionalMinimumUnitCrops: 3,
    maxActionableUnexplainedCrops: 0,
    allowedImageDetectors: ["workflow-challenge-triad-illustration-crop"],
    allowedImageExpressionForms: ["illustration"]
  });
  assert.deepEqual(caseById.get("complex-asset-hub-four-layer-real").expect, {
    maxImages: 0,
    minShapes: 20,
    maxShapes: 20,
    minTextBoxes: 10,
    maxActionableUnexplainedCrops: 0,
    minNativeComponentGroups: 6,
    maxNativeComponentGroups: 6,
    maxUngroupedNativeComponentParts: 0,
    maxRasterImageAreaRatio: 0,
    allowedImageDetectors: []
  });
  assert.deepEqual(caseById.get("complex-cli-scaffold-generator-real").expect, {
    maxImages: 0,
    minShapes: 29,
    maxShapes: 29,
    minTextBoxes: 18,
    maxActionableUnexplainedCrops: 0,
    minNativeComponentGroups: 13,
    maxNativeComponentGroups: 13,
    maxUngroupedNativeComponentParts: 0,
    maxRasterImageAreaRatio: 0,
    allowedImageDetectors: []
  });
  assert.deepEqual(caseById.get("complex-runtime-engine-hybrid-real").expect, {
    maxImages: 2,
    minShapes: 8,
    maxShapes: 8,
    minTextBoxes: 9,
    maxRasterImageAreaRatio: 0.17,
    maxSingleRasterImageAreaRatio: 0.161,
    minIntentionalMinimumUnitCrops: 2,
    maxActionableUnexplainedCrops: 0,
    minNativeComponentGroups: 5,
    maxNativeComponentGroups: 5,
    maxUngroupedNativeComponentParts: 0,
    allowedImageDetectors: ["runtime-engine-portal-screenshot-crop", "runtime-engine-catalog-icon-crop"],
    allowedImageExpressionForms: ["screenshot-or-document", "icon-or-illustration"]
  });
  assert.deepEqual(caseById.get("complex-value-transformation-table-real").expect, {
    maxImages: 1,
    maxShapes: 0,
    minTables: 1,
    minTextBoxes: 18,
    maxTextBoxes: 18,
    maxRasterImageAreaRatio: 0.002,
    maxSingleRasterImageAreaRatio: 0.0015,
    minIntentionalMinimumUnitCrops: 1,
    maxActionableUnexplainedCrops: 0,
    minNativeComponentGroups: 1,
    maxNativeComponentGroups: 1,
    maxUngroupedNativeComponentParts: 0,
    allowedImageDetectors: ["value-transformation-shield-icon-crop"],
    allowedImageExpressionForms: ["icon-or-illustration"]
  });
  assert.deepEqual(caseById.get("complex-answer-workflow-matrix-real").expect, {
    maxImages: 1,
    minShapes: 1,
    maxShapes: 1,
    minTables: 1,
    minTextBoxes: 2,
    maxRasterImageAreaRatio: 0.002,
    minIntentionalMinimumUnitCrops: 1,
    maxActionableUnexplainedCrops: 0,
    minNativeComponentGroups: 1,
    maxNativeComponentGroups: 1,
    maxUngroupedNativeComponentParts: 0,
    allowedImageDetectors: ["ocr-grid-header-icon-crop"],
    allowedImageExpressionForms: ["icon-or-illustration"]
  });
  assert.deepEqual(caseById.get("complex-demand-convergence-real").expect, {
    maxImages: 1,
    minShapes: 33,
    maxShapes: 33,
    minTextBoxes: 11,
    maxPixelDiffRatio: 0.13,
    maxForegroundMissingRatio: 0.21,
    minLayoutMeanIoU: 0.99,
    minIntentionalMinimumUnitCrops: 1,
    maxActionableUnexplainedCrops: 0,
    minNativeComponentGroups: 11,
    maxNativeComponentGroups: 11,
    maxUngroupedNativeComponentParts: 0,
    maxRasterImageAreaRatio: 0.097,
    allowedImageDetectors: ["demand-understanding-flow-illustration-crop"]
  });
  assert.deepEqual(caseById.get("complex-review-risk-gate-real").expect, {
    maxImages: 1,
    minShapes: 27,
    maxShapes: 27,
    minTextBoxes: 10,
    minIntentionalMinimumUnitCrops: 1,
    maxActionableUnexplainedCrops: 0,
    minNativeComponentGroups: 5,
    maxNativeComponentGroups: 5,
    maxUngroupedNativeComponentParts: 0,
    maxRasterImageAreaRatio: 0.069,
    allowedImageDetectors: ["review-risk-gate-flow-residual-crop"]
  });
  assert.deepEqual(caseById.get("complex-triangle-topology-real").expect, {
    maxImages: 3,
    minShapes: 7,
    maxShapes: 7,
    minTextBoxes: 12,
    maxPixelDiffRatio: 0.07,
    maxForegroundMissingRatio: 0.25,
    minLayoutMeanIoU: 0.9,
    minIntentionalMinimumUnitCrops: 3,
    maxActionableUnexplainedCrops: 0,
    minNativeComponentGroups: 7,
    maxNativeComponentGroups: 7,
    maxUngroupedNativeComponentParts: 0,
    maxRasterImageAreaRatio: 0.045,
    allowedImageDetectors: ["triangle-topology-residual-crop"]
  });
  assert.deepEqual(caseById.get("complex-value-quadrant-real").expect, {
    maxImages: 4,
    minShapes: 2,
    maxShapes: 2,
    minTextBoxes: 13,
    minIntentionalMinimumUnitCrops: 4,
    maxActionableUnexplainedCrops: 0,
    minNativeComponentGroups: 5,
    maxNativeComponentGroups: 5,
    maxUngroupedNativeComponentParts: 0,
    maxRasterImageAreaRatio: 0.064,
    maxPixelDiffRatio: 0.07,
    maxForegroundMissingRatio: 0.2,
    minLayoutMeanIoU: 0.99,
    allowedImageDetectors: ["value-quadrant-gem-crop"]
  });
  assert.deepEqual(caseById.get("complex-wms-route-hybrid-real").expect, {
    maxImages: 1,
    minShapes: 8,
    maxShapes: 8,
    minTextBoxes: 11,
    maxTextBoxes: 11,
    maxRasterImageAreaRatio: 0.4,
    maxSingleRasterImageAreaRatio: 0.4,
    maxPixelDiffRatio: 0.095,
    maxForegroundMissingRatio: 0.12,
    minLayoutMeanIoU: 0.95,
    minIntentionalMinimumUnitCrops: 1,
    maxActionableUnexplainedCrops: 0,
    allowedImageDetectors: ["wms-chain-underlay-crop"],
    allowedImageExpressionForms: ["complex-diagram"]
  });
  assert.deepEqual(caseById.get("complex-four-stage-roadmap-real").expect, {
    maxImages: 2,
    minShapes: 9,
    maxShapes: 9,
    minTextBoxes: 19,
    maxTextBoxes: 19,
    maxRasterImageAreaRatio: 0.011,
    maxSingleRasterImageAreaRatio: 0.0049,
    minIntentionalMinimumUnitCrops: 2,
    maxActionableUnexplainedCrops: 0,
    minNativeComponentGroups: 5,
    maxNativeComponentGroups: 5,
    maxUngroupedNativeComponentParts: 0,
    allowedImageDetectors: ["four-step-landing-path-badge-crop"],
    allowedImageExpressionForms: ["icon-or-illustration"]
  });
  assert.deepEqual(caseById.get("complex-organization-knowledge-network-real").expect, {
    maxImages: 0,
    minShapes: 13,
    maxShapes: 13,
    minTextBoxes: 13,
    minNativeComponentGroups: 9,
    maxNativeComponentGroups: 9,
    maxUngroupedNativeComponentParts: 0,
    maxRasterImageAreaRatio: 0,
    maxActionableUnexplainedCrops: 0,
    allowedImageDetectors: []
  });
});
