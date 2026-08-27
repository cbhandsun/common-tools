"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  evaluatePromotion,
  parseArgs,
  qualitySummary,
  readThresholds
} = require("../skills/pd-hifi-slideclone/scripts/component-native-promotion-gate");

function report(overrides = {}) {
  return {
    passed: true,
    summary: { pages: 2, accepted: 1, needsReview: 1, rejected: 0, passed: true },
    deckMetrics: { pixelDiffRatio: 0.1, foregroundMissingRatio: 0.25 },
    editabilityProfile: {
      editableObjectRatio: 0.92,
      actionableEditableObjectRatio: 1,
      nonEditableImages: 20,
      actionableNonEditableImages: 0
    },
    componentStrategyProfile: {
      componentTemplateCropReplacedImages: 0,
      componentTemplateCropPreservedImages: 7
    },
    componentTemplateCropStatus: {
      retainedImages: 2,
      actionableRetainedImages: 2
    },
    ...overrides
  };
}

test("component native promotion gate rejects candidates with rejected pages", () => {
  const decision = evaluatePromotion({
    baseline: report(),
    candidate: report({
      passed: false,
      summary: { pages: 2, accepted: 0, needsReview: 1, rejected: 1, passed: false },
      deckMetrics: { pixelDiffRatio: 0.19, foregroundMissingRatio: 0.65 },
      editabilityProfile: {
        editableObjectRatio: 0.94,
        actionableEditableObjectRatio: 1,
        nonEditableImages: 17,
        actionableNonEditableImages: 0
      },
      componentStrategyProfile: {
        componentTemplateCropReplacedImages: 1,
        componentTemplateCropPreservedImages: 4
      }
    }),
    thresholds: readThresholds({})
  });

  assert.equal(decision.promoted, false);
  assert.ok(decision.reasons.includes("candidate-has-rejected-pages"));
  assert.ok(decision.reasons.includes("candidate-foreground-missing-regression"));
  assert.equal(decision.deltas.nonEditableImages, -3);
  assert.equal(decision.deltas.componentTemplateCropReplacedImages, 1);
});

test("component native promotion gate promotes editability gains without visual regressions", () => {
  const decision = evaluatePromotion({
    baseline: report(),
    candidate: report({
      deckMetrics: { pixelDiffRatio: 0.105, foregroundMissingRatio: 0.27 },
      editabilityProfile: {
        editableObjectRatio: 0.94,
        actionableEditableObjectRatio: 1,
        nonEditableImages: 17,
        actionableNonEditableImages: 0
      },
      componentStrategyProfile: {
        componentTemplateCropReplacedImages: 2,
        componentTemplateCropPreservedImages: 5
      },
      componentTemplateCropStatus: {
        retainedImages: 0,
        actionableRetainedImages: 0
      }
    }),
    thresholds: readThresholds({})
  });

  assert.equal(decision.promoted, true);
  assert.deepEqual(decision.reasons, []);
});

test("component native promotion gate can require actionable retained crop reduction", () => {
  const promoted = evaluatePromotion({
    baseline: report(),
    candidate: report({
      deckMetrics: { pixelDiffRatio: 0.101, foregroundMissingRatio: 0.251 },
      componentTemplateCropStatus: {
        retainedImages: 0,
        actionableRetainedImages: 0
      }
    }),
    thresholds: readThresholds({ "require-actionable-retained-reduction": "true" })
  });
  assert.equal(promoted.promoted, true);
  assert.equal(promoted.deltas.componentTemplateActionableRetainedImages, -2);

  const rejected = evaluatePromotion({
    baseline: report(),
    candidate: report({
      deckMetrics: { pixelDiffRatio: 0.101, foregroundMissingRatio: 0.251 },
      editabilityProfile: {
        editableObjectRatio: 0.94,
        actionableEditableObjectRatio: 1,
        nonEditableImages: 20,
        actionableNonEditableImages: 0
      },
      componentTemplateCropStatus: {
        retainedImages: 2,
        actionableRetainedImages: 2
      }
    }),
    thresholds: readThresholds({ "require-actionable-retained-reduction": "true" })
  });
  assert.equal(rejected.promoted, false);
  assert.ok(rejected.reasons.includes("candidate-does-not-reduce-actionable-retained-component-crops"));
});

test("component native promotion gate rejects candidates without editability gain", () => {
  const decision = evaluatePromotion({
    baseline: report(),
    candidate: report(),
    thresholds: readThresholds({})
  });

  assert.equal(decision.promoted, false);
  assert.deepEqual(decision.reasons, ["candidate-has-no-editability-gain"]);
});

test("component native promotion gate parses bounded threshold arguments", () => {
  const args = parseArgs([
    "--baseline", "base.json",
    "--candidate", "next.json",
    "--max-pixel-diff-regression", "0.02",
    "--max-foreground-missing-regression", "0.05",
    "--require-actionable-retained-reduction",
    "--min-actionable-retained-reduction", "2",
    "--fail-on-reject"
  ]);
  const thresholds = readThresholds(args);

  assert.equal(args.baseline, "base.json");
  assert.equal(args.candidate, "next.json");
  assert.equal(args["fail-on-reject"], "true");
  assert.deepEqual(thresholds, {
    maxPixelDiffRegression: 0.02,
    maxForegroundMissingRegression: 0.05,
    maxEditableRatioRegression: 0.01,
    requireActionableRetainedReduction: true,
    minActionableRetainedReduction: 2
  });
});

test("component native promotion gate summarizes quality reports safely", () => {
  assert.deepEqual(qualitySummary({}), {
    passed: false,
    pages: 0,
    accepted: 0,
    needsReview: 0,
    rejected: 0,
    pixelDiffRatio: null,
    foregroundMissingRatio: null,
    editableObjectRatio: null,
    actionableEditableObjectRatio: null,
    nonEditableImages: 0,
    actionableNonEditableImages: 0,
    componentTemplateCropReplacedImages: 0,
    componentTemplateCropPreservedImages: 0,
    componentTemplateRetainedImages: 0,
    componentTemplateActionableRetainedImages: 0
  });
});
