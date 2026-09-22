"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  aggregateMatrix
} = require("../packages/slideclone-native-engine/scripts/real-pptx-quality-matrix");
const {
  normalizeRequiredComponentFamilyRegressionCases,
  summarizeComponentFamilyRegressionCases
} = require("../packages/slideclone-native-engine/scripts/lib/component-family-regression");

test("component family regression cases capture per-deck native and image evidence", () => {
  const rows = [
    {
      deck: "Deck_A",
      reportFile: "a.json",
      componentFamilyAppliedCounts: { "process-flow": 2 },
      componentFamilyGapCounts: {},
      imageComponentDetectedFamilyCounts: { "process-flow": 3 },
      imageComponentMatchedFamilyCounts: { "process-flow": 2 },
      imageComponentStrategyFamilyCounts: { "process-flow": 2 },
      imageComponentMissingFamilyCounts: {}
    },
    {
      deck: "Deck_B",
      reportFile: "b.json",
      componentFamilyAppliedCounts: {},
      componentFamilyGapCounts: {},
      imageComponentDetectedFamilyCounts: { "matrix-table": 4 },
      imageComponentMatchedFamilyCounts: { "matrix-table": 4 },
      imageComponentStrategyFamilyCounts: { "matrix-table": 4 },
      imageComponentMissingFamilyCounts: {}
    }
  ];

  assert.deepEqual(summarizeComponentFamilyRegressionCases(rows).map((item) => ({
    deck: item.deck,
    family: item.family,
    status: item.status,
    appliedObjects: item.appliedObjects,
    strategyLayers: item.strategyLayers
  })), [
    {
      deck: "Deck_A",
      family: "process-flow",
      status: "native-covered",
      appliedObjects: 2,
      strategyLayers: 2
    },
    {
      deck: "Deck_B",
      family: "matrix-table",
      status: "strategy-ready",
      appliedObjects: 0,
      strategyLayers: 4
    }
  ]);
});

test("quality matrix gates required per-deck component family regression cases", () => {
  assert.deepEqual(normalizeRequiredComponentFamilyRegressionCases([
    { deck: "Deck_A", family: "process-flow" },
    "Deck_B:matrix-table",
    "Deck_B:not-a-family",
    "missing-separator"
  ]), [
    { deck: "Deck_A", family: "process-flow" },
    { deck: "Deck_B", family: "matrix-table" }
  ]);

  const rows = [{
    deck: "Deck_A",
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    passed: true,
    disallowedFullPageImages: 0,
    qualityGatePassed: true,
    componentFamilyAppliedCounts: { "process-flow": 2 },
    imageComponentDetectedFamilyCounts: { "process-flow": 3 },
    imageComponentMatchedFamilyCounts: { "process-flow": 2 },
    imageComponentStrategyFamilyCounts: { "process-flow": 2 }
  }, {
    deck: "Deck_B",
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    passed: true,
    disallowedFullPageImages: 0,
    qualityGatePassed: true,
    componentFamilyAppliedCounts: {},
    imageComponentDetectedFamilyCounts: { "matrix-table": 4 },
    imageComponentMatchedFamilyCounts: { "matrix-table": 4 },
    imageComponentStrategyFamilyCounts: { "matrix-table": 4 }
  }];

  const matrix = aggregateMatrix(rows, {
    requiredComponentFamilyRegressionCases: [
      { deck: "Deck_A", family: "process-flow" },
      { deck: "Deck_B", family: "matrix-table" }
    ]
  });

  assert.equal(matrix.passed, false);
  assert.equal(matrix.totals.requiredComponentFamilyRegressionCasesMet, false);
  assert.deepEqual(matrix.totals.missingRequiredComponentFamilyRegressionCases, [{
    deck: "Deck_B",
    family: "matrix-table",
    requiredEvidence: "native-applied-component-family",
    observedStatus: "strategy-ready",
    observedAppliedObjects: 0,
    observedGapLayers: 0,
    observedDetectedLayers: 4,
    observedStrategyLayers: 4
  }]);
});
