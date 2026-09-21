"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyCoverageGates
} = require("../packages/slideclone-native-engine/scripts/component-coverage-matrix");
const {
  aggregateMatrix
} = require("../packages/slideclone-native-engine/scripts/real-pptx-quality-matrix");

test("component coverage gate can cap critical component family backlog items", () => {
  const matrix = {
    totals: {
      decks: 1,
      uniqueDecks: 1,
      duplicateDecks: [],
      actionableResidualLayers: 0,
      componentFamilyBacklog: [
        { family: "process-flow", priority: "critical" },
        { family: "matrix-table", priority: "medium" }
      ]
    }
  };

  applyCoverageGates(matrix, { maxCriticalComponentFamilyBacklogItems: 0 });

  assert.equal(matrix.passed, false);
  assert.equal(matrix.gates.maxCriticalComponentFamilyBacklogItems, 0);
  assert.equal(matrix.totals.criticalComponentFamilyBacklogItems, 1);
  assert.equal(matrix.totals.criticalComponentFamilyBacklogItemsMet, false);
});

test("real pptx quality matrix can cap critical component family backlog items", () => {
  const matrix = aggregateMatrix([{
    deck: "Backlog deck",
    passed: true,
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    nonEditableImages: 0,
    fullPageImages: 0,
    disallowedFullPageImages: 0,
    componentFamilyAppliedCounts: { "process-flow": 1 },
    componentFamilyGapCounts: { "relationship-network": 4 }
  }], { maxCriticalComponentFamilyBacklogItems: 0 });

  assert.equal(matrix.passed, false);
  assert.equal(matrix.gates.maxCriticalComponentFamilyBacklogItems, 0);
  assert.equal(matrix.totals.criticalComponentFamilyBacklogItems, 1);
  assert.equal(matrix.totals.criticalComponentFamilyBacklogItemsMet, false);
  assert.deepEqual(matrix.totals.componentFamilyActionPlan.map(({ family, ownerSurface, acceptanceGate }) => ({
    family,
    ownerSurface,
    acceptanceGate
  })), [{
    family: "relationship-network",
    ownerSurface: "native-family-implementation",
    acceptanceGate: "requiredComponentFamilies"
  }]);
});
