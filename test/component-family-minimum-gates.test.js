"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  aggregateRows
} = require("../packages/slideclone-native-engine/scripts/lib/component-coverage-matrix");
const {
  normalizeComponentFamilyMinimums
} = require("../packages/slideclone-native-engine/scripts/lib/component-family-minimums");
const {
  applyCoverageGates
} = require("../packages/slideclone-native-engine/scripts/component-coverage-matrix");
const {
  aggregateMatrix
} = require("../packages/slideclone-native-engine/scripts/real-pptx-quality-matrix");

test("component coverage matrix fails gate when component family applied counts are below minimums", () => {
  const matrix = {
    totals: {
      ...aggregateRows([{ deck: "Deck_A", pages: 1, actionableResidualLayers: 0 }]),
      componentFamilyAppliedCounts: { "matrix-table": 2, "process-flow": 5 },
      componentFamilyAppliedTypes: 2
    }
  };

  applyCoverageGates(matrix, {
    expectedDecks: 1,
    expectedDeckNames: ["Deck_A"],
    minComponentFamilyAppliedCounts: "matrix-table=3,process-flow=5,unknown-family=99"
  });

  assert.equal(matrix.passed, false);
  assert.deepEqual(matrix.gates.minComponentFamilyAppliedCounts, { "matrix-table": 3, "process-flow": 5 });
  assert.equal(matrix.totals.componentFamilyAppliedCountsMet, false);
  assert.deepEqual(matrix.totals.missingComponentFamilyAppliedCounts, {
    "matrix-table": { expected: 3, actual: 2 }
  });
  assert.deepEqual(normalizeComponentFamilyMinimums({ "matrix-table": 2, "process-flow": 0, invalid: 4 }), {
    "matrix-table": 2
  });
});

test("quality matrix can require minimum applied counts per component family", () => {
  const matrix = aggregateMatrix([{
    deck: "Component family minimum deck",
    passed: true,
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    nonEditableImages: 0,
    fullPageImages: 0,
    disallowedFullPageImages: 0,
    componentFamilyAppliedCounts: { "process-flow": 4, "specialty-chart": 2 }
  }], {
    minComponentFamilyAppliedCounts: "process-flow=4,specialty-chart=3,unknown-family=9"
  });

  assert.equal(matrix.passed, false);
  assert.deepEqual(matrix.gates.minComponentFamilyAppliedCounts, { "process-flow": 4, "specialty-chart": 3 });
  assert.equal(matrix.totals.componentFamilyAppliedCountsMet, false);
  assert.deepEqual(matrix.totals.missingComponentFamilyAppliedCounts, {
    "specialty-chart": { expected: 3, actual: 2 }
  });
});
