"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  addDetectorCounts,
  aggregateMatrix,
  compareQualityRows,
  parseArgs,
  parseReportList,
  readComparisonManifest,
  resolveReportFiles,
  normalizeMotifTargetMinimums,
  summarizeReport,
  topDetectorCounts,
  truthyArg
} = require("../skills/pd-hifi-slideclone/scripts/real-pptx-quality-matrix");

function writeReport(dir, name, report) {
  const reportDir = path.join(dir, name);
  fs.mkdirSync(reportDir, { recursive: true });
  const file = path.join(reportDir, "quality-gate-report.json");
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return file;
}

test("quality matrix preserves quality-gate and reconstruction-budget failures", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quality-matrix-budget-"));
  const file = writeReport(root, "Deck_budget", {
    summary: { pages: 2, accepted: 2, needsReview: 0, rejected: 0, passed: true },
    gate: { passed: false, failures: ["reconstruction-budget"] },
    reconstructionBudget: {
      passed: false,
      failedPageCount: 1,
      maxResidualAreaRatio: 0.72,
      maxLargestResidualAreaRatio: 0.55
    }
  });
  const row = summarizeReport(file);
  assert.equal(row.passed, false);
  assert.deepEqual(row.qualityGateFailures, ["reconstruction-budget"]);
  assert.equal(row.reconstructionBudgetFailedPages, 1);

  const matrix = aggregateMatrix([row]);
  assert.equal(matrix.passed, false);
  assert.equal(matrix.totals.qualityGateFailedDecks, 1);
  assert.equal(matrix.totals.reconstructionBudgetFailedDecks, 1);
  assert.equal(matrix.totals.reconstructionBudgetFailedPages, 1);
  assert.equal(matrix.totals.reconstructionBudgetMaxResidualAreaRatio, 0.72);
  assert.deepEqual(matrix.totals.topQualityGateFailures, [{ detector: "reconstruction-budget", count: 1 }]);
});

test("quality matrix aggregates pass state and editability metrics", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quality-matrix-"));
  const okReport = writeReport(root, "Deck_A-baseline-powerpoint-quality", {
    summary: { pages: 2, accepted: 2, needsReview: 0, rejected: 0 },
    deckMetrics: { pixelDiffRatio: 0.1, foregroundMissingRatio: 0.2, textCoverage: 0.95, layoutMeanIoU: 1, comparedPages: 2 },
    editabilityProfile: {
      editableObjectRatio: 0.9,
      actionableEditableObjectRatio: 1,
      nonEditableImages: 2,
      intentionalRasterImages: 2,
      actionableNonEditableImages: 0,
      fullPageImages: 0,
      disallowedFullPageImages: 0,
      maxRasterImageAreaRatio: 0.4,
      detectorCounts: { "foreground-graphic-crop": 2 },
      imageExpressionCounts: { "complex-diagram": 2 },
      imageSubtypeCounts: { "route-chain-diagram": 2 },
      imageRecommendationCounts: { "preserve-fidelity-crop-until-subtype-rebuilder-is-confident": 2 },
      textOverlayRiskBoxes: 4,
      textOverlayRiskImages: 1,
      pagesWithTextOverlayRisk: 1,
      textOverlayRiskSubtypeCounts: { "route-chain-diagram": 1 },
      textOverlayRiskRecommendationCounts: { "preserve-fidelity-crop-until-subtype-rebuilder-is-confident": 1 },
      nativeOverlayRiskShapes: 2,
      nativeOverlayRiskImages: 1,
      pagesWithNativeOverlayRisk: 1,
      nativeOverlayRiskSubtypeCounts: { "top-complex-diagram": 1 },
      nativeOverlayRiskDetectorCounts: { "top-complex-diagram-crop": 1 },
      intentionalRasterDetectorCounts: { "foreground-graphic-crop": 2 },
      actionableRasterDetectorCounts: {}
    },
    visualUnitDecisionProfile: {
      nativeStructureCandidates: 2,
      intentionalMinimumUnitCrops: 2,
      actionableUnexplainedCrops: 0,
      byDecision: {
        "native-structure-candidate": 2,
        "intentional-minimum-unit-crop": 2
      },
      byReason: {
        "stacked-architecture-native-layer": 2,
        "preserve-obvious-visual-asset-crop": 2
      },
      byExpression: {
        "complex-diagram": 2,
        "icon-or-illustration": 2
      },
      byLayerType: {
        "diagram-zone": 2,
        "illustration-zone": 2
      },
      byUnitDisposition: {
        "semantic-native-structure": 2,
        "intentional-visual-crop": 2
      }
    },
    componentStrategyProfile: {
      componentStrategyImages: 3,
      pluginReferencedImages: 2,
      pluginComponentTemplateImages: 1,
      preserveCropWithComponentReferenceImages: 1,
      nativeRebuildWithComponentStyleGuideImages: 0,
      nativeVisualAtomRebuildImages: 0,
      preserveLocalCropImages: 1,
      componentTemplateRejectedByLayerEligibilityImages: 1,
      downloadRequiredImages: 1,
      fidelityPreservedImages: 3,
      componentLocalAssetImages: 1,
      componentLocalAssetMatches: 2,
      componentRecommendedGroupImages: 1,
      componentRecommendedGroupMatches: 3,
      componentHighReusableGroupMatches: 2,
      componentTemplateAppliedImages: 2,
      componentTemplateAppliedShapes: 7,
      componentTemplateAppliedTextBoxes: 3,
      componentTemplateAppliedPictures: 1,
      componentTemplateMotifReadyImages: 1,
      componentTemplateMotifReadyShapes: 5,
      componentTemplateMotifReadyTextBoxes: 2,
      componentTemplateMotifReadyPictures: 1,
      componentTemplateWholeProcessImages: 1,
      componentTemplateWholeProcessShapes: 4,
      componentTemplateWholeProcessTextBoxes: 2,
      componentTemplateWholeProcessPictures: 1,
      componentTemplateNativeShapes: 7,
      componentTemplateCropReplacedImages: 2,
      componentTemplateCropSplitImages: 1,
      componentTemplatePictureResidualImages: 1,
      componentTemplateCropPreservedImages: 1,
      visualAtomTopologyConnectors: 2,
      visualAtomContainerNodes: 1,
      visualAtomContainedNodes: 2,
      modeCounts: {
        "plugin-component-template": 1,
        "preserve-crop-with-component-reference": 1,
        "preserve-local-crop": 1
      },
      implementationModeCounts: {
        "auth-or-download-required": 1,
        "guide-only": 1,
        "native-generator-safe-fallback": 1
      },
      sourceProviderCounts: { officeplus: 1, islide: 1, unknown: 1 },
      componentKindCounts: { component: 1, diagram: 1, unknown: 1 },
      expectationCounts: {
        "candidate-editable-template-after-download": 1,
        "raster-preserved-because-component-template-is-not-layer-eligible": 1,
        "raster-diagram-with-editable-text-overlays": 1
      },
      applicationStepCounts: {
        "preserve-source-crop-and-record-component-replacement": 1,
        "preserve-source-crop-with-plugin-style-reference": 1,
        "preserve-source-crop": 1
      },
      componentAssetProviderCounts: { officeplus: 1, islide: 1 },
      componentRecommendedGroupCounts: { "slide5-group2": 2, "slide4-group4": 1 },
      componentReuseReadinessCounts: { high: 2, medium: 1 },
      componentTemplateFamilyCounts: { "process-chain": 1 },
      componentTemplateGroupCounts: { "slide5-group2": 1 },
      componentTemplateMotifReadyFamilyCounts: { "process-chain": 4 },
      componentTemplateMotifReadyGroupCounts: { "slide5-group2": 4 },
      componentTemplateMotifReadyTargetCounts: { "arc-arrow": 4, "whole-process-template": 4 },
      componentTemplateShapePartCounts: { "process-node": 4, "process-connector": 3 },
      componentTemplateStructureFitShapes: 5,
      componentTemplateStructureFitTextBoxes: 2,
      componentTemplateStructureFitPictures: 1,
      componentTemplateStructureFitReasonCounts: {
        "native-group-node-count-close": 5,
        "native-group-connector-count-close": 3
      },
      componentTemplateNativeRoleCounts: {
        "process-applied-node": 4,
        "process-applied-connector": 3,
        "process-applied-text-slot": 3,
        "process-applied-picture-shell": 1
      },
      componentTemplateStructureRoleCounts: {
        node: 4,
        connector: 3,
        "text-slot": 3,
        picture: 1
      },
      componentTemplateCropPreservedReasonCounts: { "component-template-contains-picture-children": 1 }
    },
    pluginActionQueue: {
      summary: {
        protectedNonSemanticSkips: 2
      }
    },
    pages: [
      { pageIndex: 0, status: "accepted", textCoverage: 0.96, textOcrFailedBoxes: 0 },
      { pageIndex: 1, status: "accepted", textCoverage: 0.94, textOcrFailedBoxes: 1 }
    ],
    compare: {
      textCoverage: {
        pages: [
          {
            pageIndex: 1,
            boxes: [
              {
                ok: false,
                expectedText: "DebuggerWindow",
                renderedOcrText: "Deouggervwmoow",
                textCoverage: 0.7142857142857143,
                expectedCharCount: 14,
                matchedCharCount: 10
              },
              {
                ok: true,
                expectedText: "正常文字",
                renderedOcrText: "正常文字",
                textCoverage: 1,
                expectedCharCount: 4,
                matchedCharCount: 4
              }
            ]
          }
        ]
      }
    }
  });
  writeReport(root, "Deck_B-baseline-powerpoint-quality", {
    passed: false,
    summary: { pages: 1, accepted: 0, needsReview: 0, rejected: 1 },
    deckMetrics: { pixelDiffRatio: 0.3, foregroundMissingRatio: 0.6, layoutMeanIoU: 0.8 },
    editabilityProfile: {
      editableObjectRatio: 0.5,
      actionableEditableObjectRatio: 0.5,
      nonEditableImages: 1,
      intentionalRasterImages: 0,
      actionableNonEditableImages: 1,
      fullPageImages: 1,
      disallowedFullPageImages: 1,
      maxRasterImageAreaRatio: 1,
      detectorCounts: { "unknown-full-page": 1 },
      imageExpressionCounts: { "unknown-expression": 1 },
      imageSubtypeCounts: { "unknown-subtype": 1 },
      imageRecommendationCounts: { "manual-review-before-native-rebuild": 1 },
      intentionalRasterDetectorCounts: {},
      actionableRasterDetectorCounts: { "unknown-full-page": 1 }
    },
    visualUnitDecisionProfile: {
      nativeStructureCandidates: 0,
      intentionalMinimumUnitCrops: 0,
      actionableUnexplainedCrops: 1,
      byDecision: {
        "actionable-unexplained-crop": 1
      },
      byReason: {
        "manual-review-before-native-rebuild": 1
      },
      byExpression: {
        "unknown-visual": 1
      },
      byLayerType: {
        "unknown-layer": 1
      },
      byUnitDisposition: {
        "classification-needed": 1
      },
      examplesByDecision: {
        "actionable-unexplained-crop": [{
          pageIndex: 0,
          id: "unknown-full-page-image",
          type: "image",
          detector: "unknown-full-page",
          expressionForm: "unknown-visual",
          expressionSubtype: "unknown-subtype",
          recommendedAction: "manual-review-before-native-rebuild",
          areaRatio: 0.92,
          reason: "manual-review-before-native-rebuild"
        }]
      }
    },
    pages: [
      { pageIndex: 0, status: "rejected" }
    ]
  });

  const files = resolveReportFiles({ reports: [], root });
  assert.equal(files.length, 2);
  const row = summarizeReport(okReport);
  assert.equal(row.deck, "Deck_A");
  assert.equal(row.passed, true);
  assert.equal(row.comparedPages, 2);
  assert.equal(row.accepted, 2);
  assert.equal(row.textCoverage, 0.95);
  assert.equal(row.textCoveragePages, 2);
  assert.equal(row.missingTextCoveragePages, 0);
  assert.equal(row.textCoveragePageRatio, 1);
  assert.equal(row.textOcrFailedBoxes, 1);
  assert.equal(row.actionableEditableObjectRatio, 1);
  assert.equal(row.intentionalRasterImages, 2);
  assert.equal(row.actionableNonEditableImages, 0);
  assert.equal(row.visualUnitNativeStructureCandidates, 2);
  assert.equal(row.visualUnitIntentionalMinimumUnitCrops, 2);
  assert.equal(row.visualUnitActionableUnexplainedCrops, 0);
  assert.equal(row.protectedNonSemanticSkips, 2);
  assert.deepEqual(row.visualUnitDecisionCounts, {
    "native-structure-candidate": 2,
    "intentional-minimum-unit-crop": 2
  });
  assert.deepEqual(row.visualUnitDispositionCounts, {
    "semantic-native-structure": 2,
    "intentional-visual-crop": 2
  });
  assert.deepEqual(row.worstTextOcrBoxes, [
    {
      page: 2,
      textCoverage: 0.7142857142857143,
      expectedText: "DebuggerWindow",
      renderedOcrText: "Deouggervwmoow",
      expectedCharCount: 14,
      matchedCharCount: 10
    }
  ]);
  assert.equal(row.detectorCounts["foreground-graphic-crop"], 2);
  assert.equal(row.imageSubtypeCounts["route-chain-diagram"], 2);
  assert.equal(row.imageRecommendationCounts["preserve-fidelity-crop-until-subtype-rebuilder-is-confident"], 2);
  assert.equal(row.textOverlayRiskBoxes, 4);
  assert.equal(row.pagesWithTextOverlayRisk, 1);
  assert.equal(row.nativeOverlayRiskShapes, 2);
  assert.equal(row.pagesWithNativeOverlayRisk, 1);
  assert.equal(row.componentStrategyImages, 3);
  assert.equal(row.pluginReferencedImages, 2);
  assert.equal(row.pluginComponentTemplateImages, 1);
  assert.equal(row.componentTemplateRejectedByLayerEligibilityImages, 1);
  assert.equal(row.componentStrategyDownloadRequiredImages, 1);
  assert.equal(row.componentStrategyFidelityPreservedImages, 3);
  assert.deepEqual(row.componentStrategySourceProviderCounts, { officeplus: 1, islide: 1, unknown: 1 });
  assert.deepEqual(row.componentStrategyExpectationCounts, {
    "candidate-editable-template-after-download": 1,
    "raster-preserved-because-component-template-is-not-layer-eligible": 1,
    "raster-diagram-with-editable-text-overlays": 1
  });

  const matrix = aggregateMatrix(files.map((file) => summarizeReport(file)));
  assert.equal(matrix.passed, false);
  assert.equal(matrix.totals.decks, 2);
  assert.equal(matrix.totals.pages, 3);
  assert.equal(matrix.totals.rejected, 1);
  assert.equal(matrix.totals.disallowedFullPageImages, 1);
  assert.equal(matrix.totals.textCoverageDecks, 1);
  assert.equal(matrix.totals.missingTextCoverageDecks, 1);
  assert.equal(matrix.totals.textCoveragePages, 2);
  assert.equal(matrix.totals.missingTextCoveragePages, 1);
  assert.equal(matrix.totals.textCoveragePageRatio, 0.6667);
  assert.equal(matrix.totals.textOcrFailedBoxes, 1);
  assert.deepEqual(matrix.totals.detectorCounts, {
    "foreground-graphic-crop": 2,
    "unknown-full-page": 1
  });
  assert.deepEqual(matrix.totals.imageExpressionCounts, {
    "complex-diagram": 2,
    "unknown-expression": 1
  });
  assert.deepEqual(matrix.totals.imageSubtypeCounts, {
    "route-chain-diagram": 2,
    "unknown-subtype": 1
  });
  assert.deepEqual(matrix.totals.imageRecommendationCounts, {
    "preserve-fidelity-crop-until-subtype-rebuilder-is-confident": 2,
    "manual-review-before-native-rebuild": 1
  });
  assert.equal(matrix.totals.textOverlayRiskBoxes, 4);
  assert.equal(matrix.totals.textOverlayRiskImages, 1);
  assert.equal(matrix.totals.pagesWithTextOverlayRisk, 1);
  assert.deepEqual(matrix.totals.textOverlayRiskSubtypeCounts, {
    "route-chain-diagram": 1
  });
  assert.equal(matrix.totals.nativeOverlayRiskShapes, 2);
  assert.equal(matrix.totals.nativeOverlayRiskImages, 1);
  assert.equal(matrix.totals.pagesWithNativeOverlayRisk, 1);
  assert.deepEqual(matrix.totals.nativeOverlayRiskSubtypeCounts, {
    "top-complex-diagram": 1
  });
  assert.deepEqual(matrix.totals.nativeOverlayRiskDetectorCounts, {
    "top-complex-diagram-crop": 1
  });
  assert.equal(matrix.totals.intentionalRasterImages, 2);
  assert.equal(matrix.totals.actionableNonEditableImages, 1);
  assert.equal(matrix.totals.visualUnitNativeStructureCandidates, 2);
  assert.equal(matrix.totals.visualUnitIntentionalMinimumUnitCrops, 2);
  assert.equal(matrix.totals.visualUnitActionableUnexplainedCrops, 1);
  assert.equal(matrix.totals.protectedNonSemanticSkips, 2);
  assert.deepEqual(matrix.totals.visualUnitDecisionCounts, {
    "native-structure-candidate": 2,
    "intentional-minimum-unit-crop": 2,
    "actionable-unexplained-crop": 1
  });
  assert.deepEqual(matrix.totals.visualUnitDispositionCounts, {
    "semantic-native-structure": 2,
    "intentional-visual-crop": 2,
    "classification-needed": 1
  });
  assert.deepEqual(matrix.totals.topVisualUnitDecisions, [
    { detector: "intentional-minimum-unit-crop", count: 2 },
    { detector: "native-structure-candidate", count: 2 },
    { detector: "actionable-unexplained-crop", count: 1 }
  ]);
  assert.deepEqual(matrix.totals.topVisualUnitDispositions, [
    { detector: "intentional-visual-crop", count: 2 },
    { detector: "semantic-native-structure", count: 2 },
    { detector: "classification-needed", count: 1 }
  ]);
  assert.equal(matrix.totals.visualUnitRepairCandidates.length, 1);
  assert.deepEqual(matrix.totals.topVisualUnitRepairCandidates.map((item) => ({
    deck: item.deck,
    pageIndex: item.pageIndex,
    imageId: item.imageId,
    detector: item.detector,
    areaRatio: item.areaRatio
  })), [{
    deck: "Deck_B",
    pageIndex: 0,
    imageId: "unknown-full-page-image",
    detector: "unknown-full-page",
    areaRatio: 0.92
  }]);
  assert.deepEqual(matrix.totals.intentionalRasterDetectorCounts, {
    "foreground-graphic-crop": 2
  });
  assert.deepEqual(matrix.totals.actionableRasterDetectorCounts, {
    "unknown-full-page": 1
  });
  assert.equal(matrix.totals.componentStrategyImages, 3);
  assert.equal(matrix.totals.pluginReferencedImages, 2);
  assert.equal(matrix.totals.pluginComponentTemplateImages, 1);
  assert.equal(matrix.totals.componentTemplateRejectedByLayerEligibilityImages, 1);
  assert.equal(matrix.totals.componentStrategyDownloadRequiredImages, 1);
  assert.equal(matrix.totals.componentStrategyFidelityPreservedImages, 3);
  assert.equal(matrix.totals.componentLocalAssetImages, 1);
  assert.equal(matrix.totals.componentLocalAssetMatches, 2);
  assert.equal(matrix.totals.componentRecommendedGroupImages, 1);
  assert.equal(matrix.totals.componentRecommendedGroupMatches, 3);
  assert.equal(matrix.totals.componentHighReusableGroupMatches, 2);
  assert.deepEqual(matrix.totals.componentReuseReadinessCounts, { high: 2, medium: 1 });
  assert.equal(row.componentTemplateCropReplacedImages, 2);
  assert.equal(row.componentTemplateCropSplitImages, 1);
  assert.equal(row.componentTemplatePictureResidualImages, 1);
  assert.equal(row.componentTemplateCropPreservedImages, 1);
  assert.deepEqual(row.componentTemplateCropPreservedReasonCounts, {
    "component-template-contains-picture-children": 1
  });
  assert.equal(matrix.totals.componentTemplateAppliedImages, 2);
  assert.equal(matrix.totals.componentTemplateAppliedShapes, 7);
  assert.equal(matrix.totals.componentTemplateAppliedTextBoxes, 3);
  assert.equal(matrix.totals.componentTemplateAppliedPictures, 1);
  assert.equal(matrix.totals.componentTemplateMotifReadyImages, 1);
  assert.equal(matrix.totals.componentTemplateMotifReadyShapes, 5);
  assert.equal(matrix.totals.componentTemplateMotifReadyTextBoxes, 2);
  assert.equal(matrix.totals.componentTemplateMotifReadyPictures, 1);
  assert.equal(row.componentTemplateWholeProcessImages, 1);
  assert.equal(row.componentTemplateWholeProcessShapes, 4);
  assert.equal(row.componentTemplateWholeProcessTextBoxes, 2);
  assert.equal(row.componentTemplateWholeProcessPictures, 1);
  assert.equal(matrix.totals.componentTemplateWholeProcessImages, 1);
  assert.equal(matrix.totals.componentTemplateWholeProcessShapes, 4);
  assert.equal(matrix.totals.componentTemplateWholeProcessTextBoxes, 2);
  assert.equal(matrix.totals.componentTemplateWholeProcessPictures, 1);
  assert.equal(matrix.totals.componentTemplateNativeShapes, 7);
  assert.equal(matrix.totals.componentTemplateStructureFitShapes, 5);
  assert.equal(matrix.totals.componentTemplateStructureFitTextBoxes, 2);
  assert.equal(matrix.totals.componentTemplateStructureFitPictures, 1);
  assert.equal(matrix.totals.componentTemplateStructureFitShapeRatio, 0.7143);
  assert.equal(matrix.totals.componentTemplateCropReplacedImages, 2);
  assert.equal(matrix.totals.componentTemplateCropSplitImages, 1);
  assert.equal(matrix.totals.componentTemplatePictureResidualImages, 1);
  assert.equal(matrix.totals.componentTemplateCropPreservedImages, 1);
  assert.equal(matrix.totals.visualAtomTopologyConnectors, 2);
  assert.equal(matrix.totals.visualAtomContainerNodes, 1);
  assert.equal(matrix.totals.visualAtomContainedNodes, 2);
  assert.deepEqual(matrix.totals.componentTemplateMotifReadyFamilyCounts, { "process-chain": 4 });
  assert.deepEqual(matrix.totals.componentTemplateMotifReadyGroupCounts, { "slide5-group2": 4 });
  assert.deepEqual(matrix.totals.componentTemplateMotifReadyTargetCounts, { "arc-arrow": 4, "whole-process-template": 4 });
  assert.deepEqual(matrix.totals.componentStrategyModeCounts, {
    "plugin-component-template": 1,
    "preserve-crop-with-component-reference": 1,
    "preserve-local-crop": 1
  });
  assert.deepEqual(matrix.totals.componentStrategySourceProviderCounts, {
    officeplus: 1,
    islide: 1,
    unknown: 1
  });
  assert.deepEqual(matrix.totals.topComponentStrategySources, [
    { detector: "islide", count: 1 },
    { detector: "officeplus", count: 1 },
    { detector: "unknown", count: 1 }
  ]);
  assert.deepEqual(matrix.totals.topComponentStrategyExpectations, [
    { detector: "candidate-editable-template-after-download", count: 1 },
    { detector: "raster-diagram-with-editable-text-overlays", count: 1 },
    { detector: "raster-preserved-because-component-template-is-not-layer-eligible", count: 1 }
  ]);
  assert.deepEqual(matrix.totals.topComponentRecommendedGroups, [
    { detector: "slide5-group2", count: 2 },
    { detector: "slide4-group4", count: 1 }
  ]);
  assert.deepEqual(matrix.totals.topComponentReuseReadiness, [
    { detector: "high", count: 2 },
    { detector: "medium", count: 1 }
  ]);
  assert.deepEqual(matrix.totals.topComponentTemplateShapeParts, [
    { detector: "process-node", count: 4 },
    { detector: "process-connector", count: 3 }
  ]);
  assert.deepEqual(matrix.totals.topComponentTemplateStructureFitReasons, [
    { detector: "native-group-node-count-close", count: 5 },
    { detector: "native-group-connector-count-close", count: 3 }
  ]);
  assert.deepEqual(matrix.totals.topComponentTemplateStructureRoles, [
    { detector: "node", count: 4 },
    { detector: "connector", count: 3 },
    { detector: "text-slot", count: 3 },
    { detector: "picture", count: 1 }
  ]);
  assert.deepEqual(matrix.totals.topComponentTemplateNativeRoles, [
    { detector: "process-applied-node", count: 4 },
    { detector: "process-applied-connector", count: 3 },
    { detector: "process-applied-text-slot", count: 3 },
    { detector: "process-applied-picture-shell", count: 1 }
  ]);
  assert.deepEqual(matrix.totals.topComponentTemplateCropPreservedReasons, [
    { detector: "component-template-contains-picture-children", count: 1 }
  ]);
  assert.deepEqual(matrix.totals.topDetectors, [
    { detector: "foreground-graphic-crop", count: 2 },
    { detector: "unknown-full-page", count: 1 }
  ]);
  assert.deepEqual(matrix.totals.topImageSubtypes, [
    { detector: "route-chain-diagram", count: 2 },
    { detector: "unknown-subtype", count: 1 }
  ]);
  assert.deepEqual(matrix.totals.topImageRecommendations, [
    { detector: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident", count: 2 },
    { detector: "manual-review-before-native-rebuild", count: 1 }
  ]);
  assert.deepEqual(matrix.totals.topTextOverlayRiskSubtypes, [
    { detector: "route-chain-diagram", count: 1 }
  ]);
  assert.deepEqual(matrix.totals.topNativeOverlayRiskSubtypes, [
    { detector: "top-complex-diagram", count: 1 }
  ]);
  assert.deepEqual(matrix.totals.topNativeOverlayRiskDetectors, [
    { detector: "top-complex-diagram-crop", count: 1 }
  ]);
  assert.equal(matrix.averages.pixelDiffRatio, 0.2);
  assert.equal(matrix.averages.textCoverage, 0.95);
  assert.equal(matrix.averages.actionableEditableObjectRatio, 0.75);
  assert.equal(matrix.rows[1].rejectedPages[0], 1);
});

test("quality matrix enforces visual similarity thresholds", () => {
  const rows = [
    {
      deck: "Deck_A",
      passed: true,
      pages: 2,
      comparedPages: 2,
      accepted: 2,
      needsReview: 0,
      rejected: 0,
      pixelDiffRatio: 0.06,
      foregroundMissingRatio: 0.08,
      nonEditableImages: 0,
      intentionalRasterImages: 0,
      actionableNonEditableImages: 0,
      fullPageImages: 0,
      disallowedFullPageImages: 0
    },
    {
      deck: "Deck_B",
      passed: true,
      pages: 1,
      comparedPages: 1,
      accepted: 1,
      needsReview: 0,
      rejected: 0,
      pixelDiffRatio: 0.11,
      foregroundMissingRatio: 0.13,
      nonEditableImages: 0,
      intentionalRasterImages: 0,
      actionableNonEditableImages: 0,
      fullPageImages: 0,
      disallowedFullPageImages: 0
    }
  ];

  const pass = aggregateMatrix(rows, {
    maxDeckPixelDiffRatio: 0.12,
    maxDeckForegroundMissingRatio: 0.14,
    maxAveragePixelDiffRatio: 0.09,
    maxAverageForegroundMissingRatio: 0.11,
    minComparedPages: 3
  });
  assert.equal(pass.passed, true);
  assert.equal(pass.totals.deckPixelDiffRatioMet, true);
  assert.equal(pass.totals.averageForegroundMissingRatioMet, true);
  assert.equal(pass.totals.comparedPagesMet, true);

  const fail = aggregateMatrix(rows, {
    maxDeckPixelDiffRatio: 0.1,
    maxAverageForegroundMissingRatio: 0.09,
    minComparedPages: 4
  });
  assert.equal(fail.passed, false);
  assert.equal(fail.totals.deckPixelDiffRatioMet, false);
  assert.equal(fail.totals.averageForegroundMissingRatioMet, false);
  assert.equal(fail.totals.comparedPagesMet, false);
});

test("quality matrix detector helpers merge and sort counts", () => {
  const counts = {};
  addDetectorCounts(counts, { "two-panel-diagram-crop": 2, "wms-chain-underlay-crop": 1 });
  addDetectorCounts(counts, { "wms-chain-underlay-crop": 3, "ignored": 0, "bad": "nope" });
  assert.deepEqual(counts, {
    "two-panel-diagram-crop": 2,
    "wms-chain-underlay-crop": 4
  });
  assert.deepEqual(topDetectorCounts(counts, 1), [
    { detector: "wms-chain-underlay-crop", count: 4 }
  ]);
});

test("quality matrix infers intentional raster counts for older reports", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quality-matrix-legacy-"));
  try {
    const reportFile = writeReport(root, "Legacy", {
      summary: { pages: 1, accepted: 1, rejected: 0 },
      editabilityProfile: {
        editableObjects: 4,
        editableObjectRatio: 0.67,
        nonEditableImages: 3,
        detectorCounts: {
          "foreground-graphic-crop": 1,
          "component-template-picture-residual-crop": 1,
          "unknown-full-page": 1
        }
      },
      pages: [{ pageIndex: 0, status: "accepted" }]
    });
    const row = summarizeReport(reportFile);

    assert.equal(row.intentionalRasterImages, 2);
    assert.equal(row.actionableNonEditableImages, 1);
    assert.equal(row.actionableEditableObjectRatio, 0.8);
    assert.deepEqual(row.intentionalRasterDetectorCounts, {
      "foreground-graphic-crop": 1,
      "component-template-picture-residual-crop": 1
    });
    assert.deepEqual(row.actionableRasterDetectorCounts, {
      "unknown-full-page": 1
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("quality matrix can require OCR text coverage explicitly", () => {
  const matrix = aggregateMatrix([
    {
      deck: "Deck without OCR",
      passed: true,
      pages: 1,
      accepted: 1,
      needsReview: 0,
      rejected: 0,
      nonEditableImages: 0,
      fullPageImages: 0,
      disallowedFullPageImages: 0,
      textCoverage: null,
      textCoveragePages: 0,
      missingTextCoveragePages: 1,
      textOcrFailedBoxes: 0
    }
  ], { requireTextCoverage: true });
  assert.equal(matrix.passed, false);
  assert.equal(matrix.gates.requireTextCoverage, true);
  assert.equal(matrix.totals.missingTextCoverageDecks, 1);
});

test("quality matrix distinguishes deck-level OCR from full-page OCR", () => {
  const rows = [
    {
      deck: "Sampled deck",
      passed: true,
      pages: 10,
      accepted: 10,
      needsReview: 0,
      rejected: 0,
      nonEditableImages: 0,
      fullPageImages: 0,
      disallowedFullPageImages: 0,
      textCoverage: 1,
      textCoveragePages: 1,
      missingTextCoveragePages: 9,
      textOcrFailedBoxes: 0
    }
  ];
  assert.equal(aggregateMatrix(rows, { requireTextCoverage: true }).passed, true);
  const full = aggregateMatrix(rows, { requireFullTextCoverage: true });
  assert.equal(full.passed, false);
  assert.equal(full.gates.requireFullTextCoverage, true);
  assert.equal(full.totals.textCoveragePageRatio, 0.1);
});

test("quality matrix can require no text overlay risk explicitly", () => {
  const rows = [{
    deck: "Overlay deck",
    passed: true,
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    nonEditableImages: 1,
    intentionalRasterImages: 1,
    actionableNonEditableImages: 0,
    fullPageImages: 0,
    disallowedFullPageImages: 0,
    textOverlayRiskBoxes: 3,
    textOverlayRiskImages: 1,
    pagesWithTextOverlayRisk: 1
  }];

  assert.equal(aggregateMatrix(rows).passed, true);
  const strict = aggregateMatrix(rows, { requireNoTextOverlayRisk: true });
  assert.equal(strict.passed, false);
  assert.equal(strict.gates.requireNoTextOverlayRisk, true);
  assert.equal(strict.totals.textOverlayRiskBoxes, 3);

  const nativeOnly = aggregateMatrix([{
    deck: "Native overlay deck",
    passed: true,
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    nonEditableImages: 1,
    intentionalRasterImages: 1,
    actionableNonEditableImages: 0,
    fullPageImages: 0,
    disallowedFullPageImages: 0,
    textOverlayRiskBoxes: 0,
    nativeOverlayRiskShapes: 2,
    nativeOverlayRiskImages: 1,
    pagesWithNativeOverlayRisk: 1
  }], { requireNoTextOverlayRisk: true });
  assert.equal(nativeOnly.passed, false);
  assert.equal(nativeOnly.totals.textOverlayRiskBoxes, 0);
  assert.equal(nativeOnly.totals.nativeOverlayRiskShapes, 2);
});

test("quality matrix can require no residual layer candidates explicitly", () => {
  const rows = [{
    deck: "Residual deck",
    passed: true,
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    nonEditableImages: 1,
    intentionalRasterImages: 1,
    actionableNonEditableImages: 0,
    fullPageImages: 0,
    disallowedFullPageImages: 0,
    residualLayerCandidates: 2
  }];

  assert.equal(aggregateMatrix(rows).passed, true);
  const strict = aggregateMatrix(rows, { requireNoResidualLayerCandidates: true });
  assert.equal(strict.passed, false);
  assert.equal(strict.gates.requireNoResidualLayerCandidates, true);
  assert.equal(strict.totals.residualLayerCandidates, 2);
});

test("quality matrix can require no actionable unexplained crops explicitly", () => {
  const rows = [{
    deck: "Unknown crop deck",
    passed: true,
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    nonEditableImages: 1,
    intentionalRasterImages: 0,
    actionableNonEditableImages: 1,
    fullPageImages: 0,
    disallowedFullPageImages: 0,
    visualUnitActionableUnexplainedCrops: 1
  }];

  assert.equal(aggregateMatrix(rows).passed, true);
  const strict = aggregateMatrix(rows, { requireNoActionableUnexplainedCrops: true });
  assert.equal(strict.passed, false);
  assert.equal(strict.gates.requireNoActionableUnexplainedCrops, true);
  assert.equal(strict.totals.visualUnitActionableUnexplainedCrops, 1);
});

test("quality matrix can require no classification-needed visual units explicitly", () => {
  const rows = [{
    deck: "Unclassified visual deck",
    passed: true,
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    nonEditableImages: 1,
    intentionalRasterImages: 0,
    actionableNonEditableImages: 1,
    fullPageImages: 0,
    disallowedFullPageImages: 0,
    visualUnitDispositionCounts: {
      "classification-needed": 1,
      "semantic-native-structure": 3
    }
  }];

  assert.equal(aggregateMatrix(rows).passed, true);
  const strict = aggregateMatrix(rows, { requireNoClassificationNeededVisualUnits: true });
  assert.equal(strict.passed, false);
  assert.equal(strict.gates.requireNoClassificationNeededVisualUnits, true);
  assert.equal(strict.totals.classificationNeededVisualUnits, 1);
  assert.deepEqual(strict.totals.topVisualUnitDispositions, [
    { detector: "semantic-native-structure", count: 3 },
    { detector: "classification-needed", count: 1 }
  ]);
});

test("quality matrix can require high reusable component group matches explicitly", () => {
  const rows = [{
    deck: "Component asset deck",
    passed: true,
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    nonEditableImages: 0,
    fullPageImages: 0,
    disallowedFullPageImages: 0,
    componentHighReusableGroupMatches: 1
  }];

  assert.equal(aggregateMatrix(rows, { minComponentHighReusableGroupMatches: 1 }).passed, true);
  const strict = aggregateMatrix(rows, { minComponentHighReusableGroupMatches: 2 });
  assert.equal(strict.passed, false);
  assert.equal(strict.gates.minComponentHighReusableGroupMatches, 2);
  assert.equal(strict.totals.componentHighReusableGroupMatches, 1);
  assert.equal(strict.totals.componentHighReusableGroupMatchesMet, false);
});

test("quality matrix can require motif-ready component template shapes explicitly", () => {
  const rows = [{
    deck: "Motif ready deck",
    passed: true,
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    nonEditableImages: 0,
    fullPageImages: 0,
    disallowedFullPageImages: 0,
    componentTemplateMotifReadyShapes: 3
  }];

  assert.equal(aggregateMatrix(rows, { minComponentTemplateMotifReadyShapes: 3 }).passed, true);
  const strict = aggregateMatrix(rows, { minComponentTemplateMotifReadyShapes: 4 });
  assert.equal(strict.passed, false);
  assert.equal(strict.gates.minComponentTemplateMotifReadyShapes, 4);
  assert.equal(strict.totals.componentTemplateMotifReadyShapes, 3);
  assert.equal(strict.totals.componentTemplateMotifReadyShapesMet, false);
});

test("quality matrix can require motif-ready target counts explicitly", () => {
  const rows = [{
    deck: "Motif target deck",
    passed: true,
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    nonEditableImages: 0,
    fullPageImages: 0,
    disallowedFullPageImages: 0,
    componentTemplateMotifReadyTargetCounts: { "arc-arrow": 3, "tree-link": 1, "pie-share-chart": 2 }
  }];

  assert.deepEqual(normalizeMotifTargetMinimums("arc-arrow=2,tree-link=1,whole-process-template=1,pie-share-chart=2,bad=9,card-grid=0"), {
    "arc-arrow": 2,
    "tree-link": 1,
    "whole-process-template": 1,
    "pie-share-chart": 2
  });
  assert.equal(aggregateMatrix(rows, {
    minComponentTemplateMotifReadyTargetCounts: { "arc-arrow": 3, "tree-link": 1, "pie-share-chart": 2 }
  }).passed, true);
  const strict = aggregateMatrix(rows, {
    minComponentTemplateMotifReadyTargetCounts: "arc-arrow=4,tree-link=1"
  });
  assert.equal(strict.passed, false);
  assert.deepEqual(strict.gates.minComponentTemplateMotifReadyTargetCounts, {
    "arc-arrow": 4,
    "tree-link": 1
  });
  assert.equal(strict.totals.componentTemplateMotifReadyTargetCountsMet, false);
  assert.deepEqual(strict.totals.missingComponentTemplateMotifReadyTargetCounts, {
    "arc-arrow": { expected: 4, actual: 3 }
  });
});

test("quality matrix accepts expanded diagram motif target gates", () => {
  const rows = [{
    deck: "Expanded motif target deck",
    passed: true,
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    nonEditableImages: 0,
    fullPageImages: 0,
    disallowedFullPageImages: 0,
    componentTemplateMotifReadyTargetCounts: {
      "pyramid-stack": 1,
      "venn-overlap": 1,
      "fishbone-cause": 1,
      "topology-triangle": 1,
      "gantt-roadmap": 1,
      "dashboard-card-grid": 1,
      "comparison-matrix": 1,
      "org-hierarchy": 1,
      "bubble-scatter-chart": 1,
      "heatmap-matrix": 1,
      "treemap-chart": 1,
      "sankey-flow-chart": 1,
      "map-chart": 1,
      "word-cloud-chart": 1,
      "waterfall-chart": 1,
      "gauge-chart": 1,
      "radar-chart": 1,
      "concentric-circles": 1,
      "screenshot-card-grid": 1,
      "screenshot-crop": 1,
      "visual-example-card-grid": 1,
      "visual-example-crop": 1,
      "feature-icon-card-grid": 1,
      "icon-crop": 1,
      "numbered-step-card-grid": 1,
      "step-badge": 1,
      "screenshot-zoom-callout": 1,
      "zoom-lens-overlay": 1,
      "screenshot-annotation": 1,
      "callout-overlay": 1,
      "highlight-box": 1
    }
  }];

  assert.deepEqual(normalizeMotifTargetMinimums(
    "pyramid-stack=1,venn-overlap=1,fishbone-cause=1,topology-triangle=1,gantt-roadmap=1,dashboard-card-grid=1,comparison-matrix=1,org-hierarchy=1,bubble-scatter-chart=1,heatmap-matrix=1,treemap-chart=1,sankey-flow-chart=1,map-chart=1,word-cloud-chart=1,waterfall-chart=1,gauge-chart=1,radar-chart=1,concentric-circles=1,screenshot-card-grid=1,screenshot-crop=1,visual-example-card-grid=1,visual-example-crop=1,feature-icon-card-grid=1,icon-crop=1,numbered-step-card-grid=1,step-badge=1,screenshot-zoom-callout=1,zoom-lens-overlay=1,screenshot-annotation=1,callout-overlay=1,highlight-box=1,bad=3"
  ), {
    "pyramid-stack": 1,
    "venn-overlap": 1,
    "fishbone-cause": 1,
    "topology-triangle": 1,
    "gantt-roadmap": 1,
    "dashboard-card-grid": 1,
    "comparison-matrix": 1,
    "org-hierarchy": 1,
    "bubble-scatter-chart": 1,
    "heatmap-matrix": 1,
    "treemap-chart": 1,
    "sankey-flow-chart": 1,
    "map-chart": 1,
    "word-cloud-chart": 1,
    "waterfall-chart": 1,
    "gauge-chart": 1,
    "radar-chart": 1,
    "concentric-circles": 1,
    "screenshot-card-grid": 1,
    "screenshot-crop": 1,
    "visual-example-card-grid": 1,
    "visual-example-crop": 1,
    "feature-icon-card-grid": 1,
    "icon-crop": 1,
    "numbered-step-card-grid": 1,
    "step-badge": 1,
    "screenshot-zoom-callout": 1,
    "zoom-lens-overlay": 1,
    "screenshot-annotation": 1,
    "callout-overlay": 1,
    "highlight-box": 1
  });

  assert.equal(aggregateMatrix(rows, {
    minComponentTemplateMotifReadyTargetCounts: {
      "pyramid-stack": 1,
      "venn-overlap": 1,
      "fishbone-cause": 1,
      "topology-triangle": 1,
      "gantt-roadmap": 1,
      "dashboard-card-grid": 1,
      "comparison-matrix": 1,
      "org-hierarchy": 1,
      "bubble-scatter-chart": 1,
      "heatmap-matrix": 1,
      "treemap-chart": 1,
      "sankey-flow-chart": 1,
      "map-chart": 1,
      "word-cloud-chart": 1,
      "waterfall-chart": 1,
      "gauge-chart": 1,
      "radar-chart": 1,
      "concentric-circles": 1,
      "screenshot-card-grid": 1,
      "screenshot-crop": 1,
      "visual-example-card-grid": 1,
      "visual-example-crop": 1,
      "feature-icon-card-grid": 1,
      "icon-crop": 1,
      "numbered-step-card-grid": 1,
      "step-badge": 1,
      "screenshot-zoom-callout": 1,
      "zoom-lens-overlay": 1,
      "screenshot-annotation": 1,
      "callout-overlay": 1,
      "highlight-box": 1
    }
  }).passed, true);

  const strict = aggregateMatrix(rows, {
    minComponentTemplateMotifReadyTargetCounts: "pyramid-stack=2,venn-overlap=1,topology-triangle=1"
  });
  assert.equal(strict.passed, false);
  assert.deepEqual(strict.totals.missingComponentTemplateMotifReadyTargetCounts, {
    "pyramid-stack": { expected: 2, actual: 1 }
  });
});

test("quality matrix can require component template structure fit shape ratio", () => {
  const rows = [{
    deck: "Structure fit deck",
    passed: true,
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    nonEditableImages: 0,
    fullPageImages: 0,
    disallowedFullPageImages: 0,
    componentTemplateAppliedShapes: 10,
    componentTemplateStructureFitShapes: 7
  }];

  assert.equal(aggregateMatrix(rows, {
    minComponentTemplateStructureFitShapeRatio: 0.7
  }).passed, true);
  const strict = aggregateMatrix(rows, {
    minComponentTemplateStructureFitShapeRatio: 0.8
  });
  assert.equal(strict.passed, false);
  assert.equal(strict.gates.minComponentTemplateStructureFitShapeRatio, 0.8);
  assert.equal(strict.totals.componentTemplateStructureFitShapeRatio, 0.7);
  assert.equal(strict.totals.componentTemplateStructureFitShapeRatioMet, false);
});

test("quality matrix can require visual atom topology and container hierarchy counts", () => {
  const rows = [{
    deck: "Topology deck",
    passed: true,
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    nonEditableImages: 0,
    fullPageImages: 0,
    disallowedFullPageImages: 0,
    visualAtomTopologyConnectors: 2,
    visualAtomContainerNodes: 1,
    visualAtomContainedNodes: 2
  }];

  assert.equal(aggregateMatrix(rows, {
    minVisualAtomTopologyConnectors: 2,
    minVisualAtomContainerNodes: 1,
    minVisualAtomContainedNodes: 2
  }).passed, true);
  const strict = aggregateMatrix(rows, {
    minVisualAtomTopologyConnectors: 3,
    minVisualAtomContainerNodes: 2,
    minVisualAtomContainedNodes: 3
  });
  assert.equal(strict.passed, false);
  assert.equal(strict.gates.minVisualAtomTopologyConnectors, 3);
  assert.equal(strict.gates.minVisualAtomContainerNodes, 2);
  assert.equal(strict.gates.minVisualAtomContainedNodes, 3);
  assert.equal(strict.totals.visualAtomTopologyConnectorsMet, false);
  assert.equal(strict.totals.visualAtomContainerNodesMet, false);
  assert.equal(strict.totals.visualAtomContainedNodesMet, false);
});

test("quality matrix parses repeated report arguments", () => {
  const args = parseArgs([
    "--report",
    "a.json",
    "--reports",
    "b.json;c.json",
    "--fail-on-regression",
    "--require-text-coverage",
    "--require-full-text-coverage",
    "--require-no-text-overlay-risk",
    "--require-no-residual-layer-candidates",
    "--require-no-actionable-unexplained-crops",
    "--min-component-high-reusable-group-matches",
    "2",
    "--min-component-template-motif-ready-shapes",
    "5",
    "--min-component-template-motif-ready-target-counts",
    "arc-arrow=1,tree-link=1,whole-process-template=1",
    "--min-component-template-structure-fit-shape-ratio",
    "0.75",
    "--min-visual-atom-topology-connectors",
    "2",
    "--min-visual-atom-container-nodes",
    "1",
    "--min-visual-atom-contained-nodes",
    "2",
    "--max-component-template-structure-fit-shape-ratio-drop",
    "0.02",
    "--max-component-template-eligibility-rejection-increase",
    "1"
  ]);
  assert.deepEqual(args.reports, ["a.json", "b.json", "c.json"]);
  assert.equal(args["fail-on-regression"], true);
  assert.equal(args["require-text-coverage"], true);
  assert.equal(args["require-full-text-coverage"], true);
  assert.equal(args["require-no-text-overlay-risk"], true);
  assert.equal(args["require-no-residual-layer-candidates"], true);
  assert.equal(args["require-no-actionable-unexplained-crops"], true);
  assert.equal(args["min-component-high-reusable-group-matches"], "2");
  assert.equal(args["min-component-template-motif-ready-shapes"], "5");
  assert.equal(args["min-component-template-motif-ready-target-counts"], "arc-arrow=1,tree-link=1,whole-process-template=1");
  assert.equal(args["min-component-template-structure-fit-shape-ratio"], "0.75");
  assert.equal(args["min-visual-atom-topology-connectors"], "2");
  assert.equal(args["min-visual-atom-container-nodes"], "1");
  assert.equal(args["min-visual-atom-contained-nodes"], "2");
  assert.equal(args["max-component-template-structure-fit-shape-ratio-drop"], "0.02");
  assert.equal(args["max-component-template-eligibility-rejection-increase"], "1");

  const explicit = parseArgs(["--require-text-coverage", "true", "--require-full-text-coverage", "true", "--require-no-text-overlay-risk", "true", "--require-no-residual-layer-candidates", "true", "--require-no-actionable-unexplained-crops", "true", "--min-component-high-reusable-group-matches", "3"]);
  assert.equal(explicit["require-text-coverage"], "true");
  assert.equal(explicit["require-full-text-coverage"], "true");
  assert.equal(explicit["require-no-text-overlay-risk"], "true");
  assert.equal(explicit["require-no-residual-layer-candidates"], "true");
  assert.equal(explicit["require-no-actionable-unexplained-crops"], "true");
  assert.equal(explicit["min-component-high-reusable-group-matches"], "3");
  assert.equal(truthyArg(explicit["require-text-coverage"]), true);
  assert.equal(truthyArg(explicit["require-full-text-coverage"]), true);
  assert.equal(truthyArg(explicit["require-no-text-overlay-risk"]), true);
  assert.equal(truthyArg(explicit["require-no-residual-layer-candidates"]), true);
  assert.equal(truthyArg(explicit["require-no-actionable-unexplained-crops"]), true);
});

test("quality matrix normalizes generated editable deck suffixes for baseline matching", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quality-matrix-deck-name-"));
  const report = writeReport(root, "Deck_A-component-strategy-quality", {
    pptxFile: "runs/deck/Deck_A.native-editable.pptx",
    summary: { pages: 1, accepted: 1, needsReview: 0, rejected: 0 },
    deckMetrics: { pixelDiffRatio: 0.1, foregroundMissingRatio: 0.2 },
    editabilityProfile: {}
  });

  assert.equal(summarizeReport(report).deck, "Deck_A");
});

test("quality matrix compares component asset candidates against a baseline without treating useful asset matches as regressions", () => {
  const baseline = {
    deck: "Deck_A",
    reportFile: "baseline.json",
    passed: true,
    pages: 3,
    accepted: 3,
    needsReview: 0,
    rejected: 0,
    pixelDiffRatio: 0.08,
    foregroundMissingRatio: 0.12,
    actionableEditableObjectRatio: 1,
    componentLocalAssetMatches: 12,
    componentHighReusableGroupMatches: 5,
    componentTemplateAppliedShapes: 90,
    componentTemplateRejectedByLayerEligibilityImages: 0,
    residualLayerCandidates: 0,
    protectedNonSemanticSkips: 1,
    textOverlayRiskBoxes: 0,
    nativeOverlayRiskShapes: 0
  };
  const candidate = {
    ...baseline,
    reportFile: "candidate.json",
    pixelDiffRatio: 0.075,
    foregroundMissingRatio: 0.11,
    componentLocalAssetMatches: 24,
    componentHighReusableGroupMatches: 11,
    componentTemplateAppliedShapes: 120,
    protectedNonSemanticSkips: 4
  };

  const result = compareQualityRows([baseline], [candidate]);

  assert.equal(result.passed, true);
  assert.equal(result.totals.comparedDecks, 1);
  assert.equal(result.comparisons[0].status, "passed");
  assert.equal(result.comparisons[0].deltas.componentLocalAssetMatches, 12);
  assert.equal(result.comparisons[0].deltas.componentHighReusableGroupMatches, 6);
  assert.equal(result.comparisons[0].deltas.componentTemplateAppliedShapes, 30);
  assert.equal(result.comparisons[0].deltas.componentTemplateRejectedByLayerEligibilityImages, 0);
  assert.equal(result.comparisons[0].deltas.protectedNonSemanticSkips, 3);
  assert.ok(!result.comparisons[0].reasons.includes("protected-non-semantic-skips-increased"));
});

test("quality matrix fails comparison when expected deck count is not met", () => {
  const baseline = {
    deck: "Deck_A",
    reportFile: "baseline.json",
    passed: true,
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    pixelDiffRatio: 0.01,
    foregroundMissingRatio: 0.01,
    actionableEditableObjectRatio: 1,
    componentLocalAssetMatches: 0,
    componentTemplateAppliedShapes: 0,
    residualLayerCandidates: 0,
    textOverlayRiskBoxes: 0,
    nativeOverlayRiskShapes: 0
  };
  const candidate = { ...baseline, reportFile: "candidate.json" };

  const result = compareQualityRows([baseline], [candidate], { expectedComparedDecks: 2 });

  assert.equal(result.passed, false);
  assert.equal(result.gates.expectedComparedDecks, 2);
  assert.equal(result.totals.comparedDecks, 1);
  assert.equal(result.totals.expectedDeckCountMet, false);
});

test("quality matrix fails comparison when candidate decks are duplicated", () => {
  const baselineA = {
    deck: "Deck_A",
    reportFile: "baseline-a.json",
    passed: true,
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    pixelDiffRatio: 0.01,
    foregroundMissingRatio: 0.01,
    actionableEditableObjectRatio: 1,
    componentLocalAssetMatches: 0,
    componentTemplateAppliedShapes: 0,
    residualLayerCandidates: 0,
    textOverlayRiskBoxes: 0,
    nativeOverlayRiskShapes: 0
  };
  const baselineB = { ...baselineA, deck: "Deck_B", reportFile: "baseline-b.json" };
  const candidateA1 = { ...baselineA, reportFile: "candidate-a1.json" };
  const candidateA2 = { ...baselineA, reportFile: "candidate-a2.json" };

  const result = compareQualityRows([baselineA, baselineB], [candidateA1, candidateA2], {
    expectedComparedDecks: 2
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.duplicateCandidateDecks, ["Deck_A"]);
  assert.equal(result.totals.uniqueCandidateDecks, 1);
  assert.equal(result.totals.duplicateCandidateDecks, 1);
  assert.equal(result.totals.expectedDeckCountMet, false);
});

test("quality matrix fails comparison when expected deck names do not match", () => {
  const baseline = {
    deck: "Deck_A",
    reportFile: "baseline.json",
    passed: true,
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    pixelDiffRatio: 0.01,
    foregroundMissingRatio: 0.01,
    actionableEditableObjectRatio: 1,
    componentLocalAssetMatches: 0,
    componentTemplateAppliedShapes: 0,
    residualLayerCandidates: 0,
    textOverlayRiskBoxes: 0,
    nativeOverlayRiskShapes: 0
  };
  const candidate = { ...baseline, deck: "Wrong_Deck", reportFile: "candidate.json" };

  const result = compareQualityRows([baseline, { ...baseline, deck: "Wrong_Deck" }], [candidate], {
    expectedComparedDecks: 1,
    expectedDeckNames: ["Deck_A"]
  });

  assert.equal(result.passed, false);
  assert.equal(result.totals.expectedDeckCountMet, true);
  assert.equal(result.totals.expectedDeckNamesMet, false);
  assert.deepEqual(result.missingExpectedDecks, ["Deck_A"]);
  assert.deepEqual(result.unexpectedDecks, ["Wrong_Deck"]);
});

test("quality matrix fails comparison when expected page counts do not match", () => {
  const baseline = {
    deck: "Deck_A",
    reportFile: "baseline.json",
    passed: true,
    pages: 5,
    accepted: 5,
    needsReview: 0,
    rejected: 0,
    pixelDiffRatio: 0.01,
    foregroundMissingRatio: 0.01,
    actionableEditableObjectRatio: 1,
    componentLocalAssetMatches: 0,
    componentTemplateAppliedShapes: 0,
    residualLayerCandidates: 0,
    textOverlayRiskBoxes: 0,
    nativeOverlayRiskShapes: 0
  };
  const candidate = { ...baseline, pages: 4, accepted: 4, reportFile: "candidate.json" };

  const result = compareQualityRows([baseline], [candidate], {
    expectedComparedDecks: 1,
    expectedDeckNames: ["Deck_A"],
    expectedPageCounts: { Deck_A: 5 }
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.pageCountMismatches, [
    { deck: "Deck_A", expectedPages: 5, actualPages: 4 }
  ]);
  assert.equal(result.totals.pageCountMismatches, 1);
});

test("quality matrix flags component asset visual and gate regressions", () => {
  const baseline = {
    deck: "Deck_A",
    reportFile: "baseline.json",
    passed: true,
    pages: 3,
    accepted: 3,
    needsReview: 0,
    rejected: 0,
    pixelDiffRatio: 0.08,
    foregroundMissingRatio: 0.12,
    actionableEditableObjectRatio: 1,
    componentLocalAssetMatches: 12,
    componentTemplateAppliedShapes: 90,
    componentTemplateStructureFitShapeRatio: 0.72,
    componentTemplateRejectedByLayerEligibilityImages: 0,
    residualLayerCandidates: 0,
    visualUnitActionableUnexplainedCrops: 0,
    textOverlayRiskBoxes: 0,
    nativeOverlayRiskShapes: 0
  };
  const candidate = {
    ...baseline,
    accepted: 2,
    needsReview: 1,
    pixelDiffRatio: 0.12,
    foregroundMissingRatio: 0.155,
    actionableEditableObjectRatio: 0.95,
    componentTemplateStructureFitShapeRatio: 0.6,
    componentTemplateRejectedByLayerEligibilityImages: 2,
    residualLayerCandidates: 1,
    visualUnitActionableUnexplainedCrops: 1
  };

  const result = compareQualityRows([baseline], [candidate], {
    maxPixelDiffIncrease: 0.01,
    maxForegroundMissingIncrease: 0.02,
    maxActionableEditableDrop: 0.01
  });

  assert.equal(result.passed, false);
  assert.deepEqual(result.failedDecks, ["Deck_A"]);
  assert.deepEqual(result.comparisons[0].reasons, [
    "review-pages-increased",
    "pixel-diff-regressed",
    "foreground-missing-regressed",
    "actionable-editability-regressed",
    "component-template-structure-fit-ratio-regressed",
    "component-template-eligibility-rejections-increased",
    "residual-layer-candidates-increased",
    "actionable-unexplained-crops-increased"
  ]);
  assert.equal(result.comparisons[0].deltas.componentTemplateStructureFitShapeRatio, -0.12);
  assert.equal(result.comparisons[0].deltas.componentTemplateRejectedByLayerEligibilityImages, 2);
  assert.equal(result.comparisons[0].deltas.visualUnitActionableUnexplainedCrops, 1);
  assert.equal(result.comparisons[0].candidate.visualUnitActionableUnexplainedCrops, 1);
});

test("quality matrix allows bounded component template structure fit ratio drops", () => {
  const baseline = {
    deck: "Deck_A",
    reportFile: "baseline.json",
    passed: true,
    pages: 2,
    accepted: 2,
    needsReview: 0,
    rejected: 0,
    pixelDiffRatio: 0.08,
    foregroundMissingRatio: 0.12,
    actionableEditableObjectRatio: 0.98,
    componentLocalAssetMatches: 4,
    componentHighReusableGroupMatches: 2,
    componentTemplateAppliedShapes: 20,
    componentTemplateStructureFitShapeRatio: 0.81,
    componentTemplateRejectedByLayerEligibilityImages: 0,
    residualLayerCandidates: 0,
    textOverlayRiskBoxes: 0,
    nativeOverlayRiskShapes: 0
  };
  const candidate = {
    ...baseline,
    reportFile: "candidate.json",
    componentTemplateStructureFitShapeRatio: 0.78
  };

  const result = compareQualityRows([baseline], [candidate], {
    maxComponentTemplateStructureFitShapeRatioDrop: 0.05
  });

  assert.equal(result.passed, true);
  assert.equal(result.gates.maxComponentTemplateStructureFitShapeRatioDrop, 0.05);
  assert.equal(result.comparisons[0].status, "passed");
  assert.deepEqual(result.comparisons[0].reasons, []);
  assert.equal(result.comparisons[0].deltas.componentTemplateStructureFitShapeRatio, -0.03);
});

test("quality matrix allows bounded component template eligibility rejection increases", () => {
  const baseline = {
    deck: "Deck_A",
    reportFile: "baseline.json",
    passed: true,
    pages: 2,
    accepted: 2,
    needsReview: 0,
    rejected: 0,
    pixelDiffRatio: 0.08,
    foregroundMissingRatio: 0.12,
    actionableEditableObjectRatio: 0.98,
    componentLocalAssetMatches: 4,
    componentHighReusableGroupMatches: 2,
    componentTemplateAppliedShapes: 20,
    componentTemplateRejectedByLayerEligibilityImages: 1,
    residualLayerCandidates: 0,
    textOverlayRiskBoxes: 0,
    nativeOverlayRiskShapes: 0
  };
  const candidate = {
    ...baseline,
    reportFile: "candidate.json",
    componentTemplateRejectedByLayerEligibilityImages: 2
  };

  const result = compareQualityRows([baseline], [candidate], {
    maxComponentTemplateEligibilityRejectionIncrease: 1
  });

  assert.equal(result.passed, true);
  assert.equal(result.gates.maxComponentTemplateEligibilityRejectionIncrease, 1);
  assert.equal(result.comparisons[0].status, "passed");
  assert.deepEqual(result.comparisons[0].reasons, []);
  assert.equal(result.comparisons[0].deltas.componentTemplateRejectedByLayerEligibilityImages, 1);
});

test("quality matrix parses semicolon and comma separated report lists", () => {
  assert.deepEqual(parseReportList("a.json;b.json, c.json"), ["a.json", "b.json", "c.json"]);
  assert.deepEqual(parseReportList(["a.json", "", " b.json "]), ["a.json", "b.json"]);
  assert.deepEqual(parseReportList(""), []);
});

test("quality matrix reads component asset comparison manifests", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quality-matrix-manifest-"));
  const manifestFile = path.join(root, "manifest.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify({
    id: "component-assets-smoke",
    baselineReports: ["baseline.json"],
    candidateReports: ["candidate.json"],
    gates: {
      maxPixelDiffIncrease: 0.005,
      minComponentTemplateMotifReadyTargetCounts: {
        "whole-process-template": 1
      },
      maxComponentTemplateStructureFitShapeRatioDrop: 0.02,
      maxComponentTemplateEligibilityRejectionIncrease: 1,
      requireNoClassificationNeededVisualUnits: true,
      expectedComparedDecks: 2
    }
  })}\n`, "utf8");

  const manifest = readComparisonManifest(manifestFile);

  assert.equal(manifest.id, "component-assets-smoke");
  assert.equal(manifest.manifestFile, path.resolve(manifestFile));
  assert.deepEqual(manifest.baselineReports, ["baseline.json"]);
  assert.deepEqual(manifest.candidateReports, ["candidate.json"]);
  assert.equal(manifest.gates.maxPixelDiffIncrease, 0.005);
  assert.deepEqual(manifest.gates.minComponentTemplateMotifReadyTargetCounts, {
    "whole-process-template": 1
  });
  assert.equal(manifest.gates.maxComponentTemplateStructureFitShapeRatioDrop, 0.02);
  assert.equal(manifest.gates.maxComponentTemplateEligibilityRejectionIncrease, 1);
  assert.equal(manifest.gates.requireNoClassificationNeededVisualUnits, true);
  assert.equal(manifest.gates.expectedComparedDecks, 2);
});

test("quality matrix applies aggregate gates from comparison manifests", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quality-matrix-manifest-gates-"));
  const baseline = writeReport(root, "baseline", {
    pptxFile: "Deck_A.pptx",
    passed: true,
    summary: { pages: 1, accepted: 1, needsReview: 0, rejected: 0 },
    deckMetrics: { pixelDiffRatio: 0.02, foregroundMissingRatio: 0.03 },
    editabilityProfile: {},
    componentStrategyProfile: {
      componentTemplateMotifReadyTargetCounts: { "linear-arrow-chain": 2 }
    }
  });
  const candidate = writeReport(root, "candidate", {
    pptxFile: "Deck_A.native-editable.pptx",
    passed: true,
    summary: { pages: 1, accepted: 1, needsReview: 0, rejected: 0 },
    deckMetrics: { pixelDiffRatio: 0.02, foregroundMissingRatio: 0.03 },
    editabilityProfile: {},
    componentStrategyProfile: {
      componentTemplateMotifReadyTargetCounts: { "linear-arrow-chain": 2 }
    }
  });
  const manifestFile = path.join(root, "manifest.json");
  const out = path.join(root, "matrix.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify({
    baselineReports: [baseline],
    candidateReports: [candidate],
    gates: {
      minComponentTemplateMotifReadyTargetCounts: {
        "whole-process-template": 1
      },
      expectedComparedDecks: 1,
      expectedDeckNames: ["Deck_A"]
    }
  }, null, 2)}\n`, "utf8");

  const result = spawnSync(process.execPath, [
    path.join(process.cwd(), "skills/pd-hifi-slideclone/scripts/real-pptx-quality-matrix.js"),
    "--comparison-manifest",
    manifestFile,
    "--out",
    out,
    "--fail-on-regression"
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true
  });

  assert.equal(result.status, 1);
  const matrix = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(matrix.passed, false);
  assert.deepEqual(matrix.gates.minComponentTemplateMotifReadyTargetCounts, {
    "whole-process-template": 1
  });
  assert.deepEqual(matrix.totals.missingComponentTemplateMotifReadyTargetCounts, {
    "whole-process-template": { expected: 1, actual: 0 }
  });
});
