"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  aggregateRows
} = require("../packages/slideclone-native-engine/scripts/lib/component-coverage-matrix");
const {
  aggregateMatrix
} = require("../packages/slideclone-native-engine/scripts/real-pptx-quality-matrix");

test("component coverage matrix emits ranked component family action plan", () => {
  const totals = aggregateRows([{
    deck: "Image deck",
    componentFamilyAppliedCounts: {},
    componentFamilyGapCounts: {},
    imageComponentDetectedFamilyCounts: {
      "process-flow": 1,
      "relationship-network": 1,
      "timeline-roadmap": 3
    },
    imageComponentMatchedFamilyCounts: {
      "process-flow": 1,
      "timeline-roadmap": 3
    },
    imageComponentStrategyFamilyCounts: {
      "process-flow": 1,
      "timeline-roadmap": 1
    },
    imageComponentMissingFamilyCounts: { "relationship-network": 1 },
    componentFamilyGapExamples: [{
      deck: "Image deck",
      page: 1,
      image: 1,
      families: ["relationship-network"],
      source: "final-ir-opportunity"
    }]
  }]);

  assert.deepEqual(actionPlanSummary(totals.componentFamilyActionPlan), [{
    rank: 1,
    family: "process-flow",
    ownerSurface: "native-editable-application",
    blockingMetric: "nativeApplicationDeficitLayers",
    deficitLayers: 1,
    strictAcceptanceBlocks: true,
    acceptanceGate: "maxCriticalComponentFamilyBacklogItems",
    evidenceMetrics: ["imageComponentStrategyFamilyCounts", "componentFamilyAppliedCounts"]
  }, {
    rank: 2,
    family: "relationship-network",
    ownerSurface: "component-asset-promotion",
    blockingMetric: "assetMatchDeficitLayers",
    deficitLayers: 1,
    strictAcceptanceBlocks: false,
    acceptanceGate: "componentFamilyBacklog",
    evidenceMetrics: ["imageComponentDetectedFamilyCounts", "imageComponentMatchedFamilyCounts", "imageComponentMissingFamilyCounts"]
  }, {
    rank: 3,
    family: "timeline-roadmap",
    ownerSurface: "component-strategy-routing",
    blockingMetric: "strategyRoutingDeficitLayers",
    deficitLayers: 2,
    strictAcceptanceBlocks: false,
    acceptanceGate: "componentFamilyBacklog",
    evidenceMetrics: ["imageComponentMatchedFamilyCounts", "imageComponentStrategyFamilyCounts"]
  }]);
});

test("real pptx quality matrix emits native coverage action plan", () => {
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
  }]);

  assert.deepEqual(actionPlanSummary(matrix.totals.componentFamilyActionPlan), [{
    rank: 1,
    family: "relationship-network",
    ownerSurface: "native-family-implementation",
    blockingMetric: "gapLayers",
    deficitLayers: 4,
    strictAcceptanceBlocks: true,
    acceptanceGate: "requiredComponentFamilies",
    evidenceMetrics: ["componentFamilyGapCounts", "componentFamilyAppliedCounts"]
  }]);
});

function actionPlanSummary(items = []) {
  return items.map(({
    rank,
    family,
    ownerSurface,
    blockingMetric,
    deficitLayers,
    strictAcceptanceBlocks,
    acceptanceGate,
    evidenceMetrics
  }) => ({
    rank,
    family,
    ownerSurface,
    blockingMetric,
    deficitLayers,
    strictAcceptanceBlocks,
    acceptanceGate,
    evidenceMetrics
  }));
}
