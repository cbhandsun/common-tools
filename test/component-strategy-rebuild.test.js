"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildCandidateSearchCacheKey,
  buildFinalPageCacheSalt,
  buildPreAnalysisCacheKey,
  buildQualityGateArgs,
  annotateNativeElementsWithPluginReplacementPlans,
  applyExpressionPolicyRepairsToDeckImages,
  applyExpressionPolicyRepairsToReport,
  componentStrategyPptxBuildOptions,
  countComponentTemplateAppliedImages,
  countComponentTemplateAppliedPictures,
  countComponentTemplateAppliedShapes,
  countComponentTemplateAppliedTextBoxes,
  countComponentStrategyModes,
  buildExpressionPolicyRepairsByLayer,
  componentCandidateBoxKey,
  componentCandidateLayerKeys,
  expressionPolicyRepairDispositionForImage,
  findExpressionPolicyRepairForLayer,
  injectPluginActionCandidatesIntoReport,
  measureStage,
  parseArgs,
  readLearningSummaryCache,
  reconcileComponentAssetManifestWithFinalDeck,
  resolveComponentSelfFidelityPromotionReport,
  resolveComponentStrategyFinalPageCachePolicy,
  resolveAppliedComponentHarvest,
  resolveComponentInventory,
  selectComponentStrategyPptxEngine,
  shouldDeferComponentStrategyPptxBuild,
  shouldRefreshComponentInventoryCacheForHarvest,
  shouldReuseAnalysisArtifact,
  writeLearningSummaryCache,
  normalizeComponentAssetRoots,
  summarizePipelineTotals,
  withAppliedComponentHarvestDefaults
} = require("../skills/pd-hifi-slideclone/scripts/component-strategy-rebuild");

test("component strategy rebuild promoted-only inventory filters explicit assets using self-fidelity reports", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-promoted-inventory-"));
  const promoted = path.join(root, "promoted.pptx");
  const unpromoted = path.join(root, "unpromoted.pptx");
  const inventoryFile = path.join(root, "inventory.json");
  const reportFile = path.join(root, "self-fidelity.json");
  fs.writeFileSync(inventoryFile, JSON.stringify({
    candidates: [
      { id: "promoted", path: promoted, roleTags: [], score: 1 },
      { id: "unpromoted", path: unpromoted, roleTags: [], score: 1 }
    ]
  }), "utf8");
  fs.writeFileSync(reportFile, JSON.stringify({
    results: [{ file: promoted, passed: true, sha256: "a".repeat(64), comparison: {}, regionSummary: {} }]
  }), "utf8");

  const inventory = resolveComponentInventory({
    componentInventory: inventoryFile,
    componentAssetsPromotedOnly: true,
    componentSelfFidelityReports: [reportFile],
    componentAssetRoots: []
  });

  assert.equal(inventory.inventory.candidates.length, 1);
  assert.equal(inventory.inventory.candidates[0].id, "promoted");
  assert.equal(inventory.inventory.candidates[0].selfFidelityPromoted, true);
  assert.equal(inventory.source.promotionPolicy, "self-fidelity-promoted-only");
  assert.throws(
    () => resolveComponentSelfFidelityPromotionReport({ componentAssetsPromotedOnly: true, componentSelfFidelityReports: [] }),
    /requires at least one existing/
  );
});

test("component strategy rebuild accepts persisted promotion state from an explicit strict inventory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-persisted-promoted-inventory-"));
  const promoted = path.join(root, "promoted.pptx");
  const pending = path.join(root, "pending.pptx");
  const inventoryFile = path.join(root, "inventory.json");
  fs.writeFileSync(inventoryFile, JSON.stringify({
    candidates: [
      { id: "promoted", path: promoted, selfFidelityPromoted: true, roleTags: ["self-fidelity-promoted"] },
      { id: "pending", path: pending, selfFidelityPromoted: false, roleTags: ["self-fidelity-promoted"] }
    ]
  }), "utf8");

  const resolved = resolveComponentInventory({
    componentInventory: inventoryFile,
    componentAssetsPromotedOnly: true,
    componentSelfFidelityReports: [],
    componentAssetRoots: []
  });

  assert.equal(resolved.inventory.candidates.length, 1);
  assert.equal(resolved.inventory.candidates[0].id, "promoted");
  assert.equal(resolved.source.promotionPolicy, "self-fidelity-promoted-only");
  assert.deepEqual(resolved.source.selfFidelityPromotionReports, []);
});
const {
  aggregateComponentStrategyReports,
  componentStrategyWorkerArgv,
  inferNativeEditablePptxPath,
  parsePositiveInt,
  recommendComponentStrategyConcurrency,
  shouldBatchPptxAfterWorkers,
  toComponentStrategyArgs,
  writeHeartbeat
} = require("../skills/pd-hifi-slideclone/scripts/component-strategy-rebuild-parallel");
const {
  chunk: chunkPageShards,
  mergeShardDecks,
  pageRangeName,
  selectedPageNumbers,
  workerArgv: pageShardWorkerArgv
} = require("../skills/pd-hifi-slideclone/scripts/component-strategy-rebuild-page-shards");

test("component strategy rebuild injects gated plugin action candidates back into report layers", () => {
  const report = {
    provider: "ir-component-candidate-report-v1",
    layers: [{
      pageIndex: 0,
      imageIndex: 0,
      layerType: "diagram-zone",
      areaRatio: 0.28,
      templateFamily: "relationship",
      plan: { templateFamily: "relationship", targetMotifs: ["radial-link"] },
      diagramUnderstanding: {
        nativeReadiness: "hybrid-native-plus-residual-crops",
        visualAtomCount: 8,
        residualCount: 1,
        componentStrategy: { templateFamily: "relationship", targetMotifs: ["radial-link"] }
      },
      bestCandidates: [{
        sourceProvider: "islide",
        kind: "diagram",
        id: "weak-relationship",
        title: "多色圆形扁平3项PPT关系",
        reuseHint: "candidate-polished-diagram-reference",
        candidateScore: 95,
        suitability: { tier: "weak", score: 62 }
      }]
    }]
  };
  const queue = {
    actions: [{
      order: 1,
      provider: "officeplus",
      kind: "component",
      id: "MatlComponentContent-11189",
      title: "蓝色简约圆通用4项中心总分PPT组件",
      layerKey: "0:0",
      score: 62,
      reuseHint: "candidate-grouped-pptx-component",
      suitability: { tier: "strong", score: 96 }
    }]
  };

  const injected = injectPluginActionCandidatesIntoReport(report, queue);

  assert.notEqual(injected, report);
  assert.equal(injected.pluginActionCandidateInjection.injectedLayers, 1);
  assert.equal(injected.layers[0].bestCandidates[0].id, "MatlComponentContent-11189");
  assert.equal(injected.layers[0].componentRenderStrategy.mode, "plugin-component-template");
  assert.equal(injected.layers[0].componentRenderStrategy.bestCandidate.suitability.tier, "strong");
  assert.equal(injected.layers[0].componentRenderStrategy.applicationPlan.componentId, "MatlComponentContent-11189");
});

test("component strategy rebuild suppresses acquisition tasks once final IR has native editable coverage", () => {
  const manifest = {
    provider: "component-asset-manifest-v1",
    summary: {},
    layers: [{
      layerKey: "0:1",
      pageIndex: 0,
      imageIndex: 1,
      box: { x: 100, y: 80, w: 400, h: 260 },
      layerType: "table-zone",
      detector: "comparison-matrix-crop",
      templateFamily: "grid-or-matrix",
      readiness: {
        status: "applied-plugin-template-motif-mismatch",
        targetMotifs: ["card-grid"],
        nextStep: "find-or-download-applied-plugin-template-with-matching-target-motif"
      },
      componentAcquisitionTasks: [
        { provider: "officeplus", kind: "component", targetMotifs: ["card-grid"] },
        { provider: "islide", kind: "diagram", targetMotifs: ["card-grid"] }
      ]
    }]
  };
  const finalDeck = {
    pages: [{
      images: [],
      shapes: Array.from({ length: 6 }, (_, index) => ({
        box: { x: 120 + index * 40, y: 100, w: 36, h: 28 },
        source: { nativeRebuild: true, detector: "comparison-matrix-native-cell" }
      })),
      textBoxes: []
    }]
  };

  const reconciled = reconcileComponentAssetManifestWithFinalDeck(manifest, finalDeck);

  assert.equal(reconciled.layers[0].componentAcquisitionTasks, undefined);
  assert.equal(reconciled.layers[0].componentAcquisitionTasksSuppressedByFinalNativeRebuild, 2);
  assert.equal(reconciled.layers[0].readiness.finalDisposition, "native-rebuild-completed");
  assert.equal(reconciled.summary.acquisitionTasks, 0);
});

test("component strategy rebuild keeps acquisition tasks when final IR still has actionable residual image", () => {
  const manifest = {
    provider: "component-asset-manifest-v1",
    summary: {},
    layers: [{
      layerKey: "0:1",
      pageIndex: 0,
      imageIndex: 1,
      box: { x: 100, y: 80, w: 400, h: 260 },
      layerType: "diagram-zone",
      detector: "line-diagram-graphic-underlay-crop",
      templateFamily: "hub-spoke",
      readiness: {
        status: "applied-plugin-template-motif-mismatch",
        targetMotifs: ["radial-link"]
      },
      componentAcquisitionTasks: [
        { provider: "officeplus", kind: "component", targetMotifs: ["radial-link"] }
      ]
    }]
  };
  const finalDeck = {
    pages: [{
      images: [{
        box: { x: 120, y: 100, w: 300, h: 180 },
        source: { detector: "line-diagram-graphic-underlay-crop" }
      }],
      shapes: Array.from({ length: 6 }, (_, index) => ({
        box: { x: 120 + index * 40, y: 100, w: 36, h: 28 },
        source: { nativeRebuild: true, detector: "hub-spoke-native-node" }
      })),
      textBoxes: []
    }]
  };

  const reconciled = reconcileComponentAssetManifestWithFinalDeck(manifest, finalDeck);

  assert.equal(reconciled.layers[0].componentAcquisitionTasks.length, 1);
  assert.equal(reconciled.summary.acquisitionTasks, 1);
});

test("component strategy rebuild applies expression policy repair queue before replacement plans", () => {
  const report = {
    provider: "ir-component-candidate-report-v1",
    layers: [{
      pageIndex: 2,
      imageIndex: 0,
      layerType: "illustration-card",
      areaRatio: 0.22,
      box: { x: 10, y: 20, w: 300, h: 160 },
      templateFamily: "process-chain",
      plan: { templateFamily: "process-chain", targetMotifs: ["linear-arrow-chain"] },
      diagramUnderstanding: {
        nativeReadiness: "hybrid-native-plus-residual-crops",
        visualAtomCount: 8,
        componentStrategy: { templateFamily: "process-chain", targetMotifs: ["linear-arrow-chain"] }
      },
      componentRenderStrategy: { mode: "plugin-component-template" },
      bestCandidates: [{
        sourceProvider: "officeplus",
        kind: "component",
        id: "MatlComponentContent-3611",
        title: "渐变4项流程箭头",
        reuseHint: "candidate-grouped-pptx-component",
        candidateScore: 90
      }]
    }]
  };
  const queue = {
    provider: "expression-policy-repair-queue-v1",
    actions: [{
      deck: "AI_Product_Asset_OS",
      page: 3,
      image: 1,
      violation: "standalone-asset-over-objectified",
      repair: {
        mode: "preserve-local-crop",
        disableComponentTemplate: true,
        forcePreserveLocalCrop: true,
        reason: "Standalone visual examples should remain crop assets."
      }
    }]
  };

  const repaired = applyExpressionPolicyRepairsToReport(report, queue, { deck: "AI_Product_Asset_OS" });
  assert.equal(repaired.expressionPolicyRepairSummary.repairedLayers, 1);
  assert.equal(repaired.layers[0].componentRenderStrategy.mode, "preserve-local-crop");
  assert.equal(repaired.layers[0].componentRenderStrategy.expressionPolicyRepairApplied, true);

  const plan = annotateNativeElementsWithPluginReplacementPlans({ pages: [{ images: [] }, { images: [] }, { images: [] }] }, repaired);
  assert.equal(plan.layers, 0);
  assert.equal(plan.shapes, 0);
});

test("component strategy rebuild indexes expression policy repairs by deck page and image", () => {
  const repairs = buildExpressionPolicyRepairsByLayer({
    actions: [
      { deck: "deck-a", page: 1, image: 2, repair: { mode: "preserve-local-crop" } },
      { deck: "deck-a", page: 2, image: 1, imageId: "native-graphic-sparse-diagram-underlay", box: { x: 38.61, y: 183.75, w: 876.78, h: 222.38 }, repair: { mode: "reclassify-structural-diagram-or-component-template" } },
      { deck: "deck-b", page: 1, image: 1, repair: { mode: "preserve-local-crop" } }
    ]
  }, { deck: "deck-a" });

  assert.equal(repairs.has("0:1"), true);
  assert.equal(repairs.has("0:0"), false);
  assert.equal(repairs.has("1:imageId:native-graphic-sparse-diagram-underlay"), true);
  assert.equal(repairs.has("1:box:38.6,183.8,876.8,222.4"), true);
  assert.equal(repairs.has("1:0"), false);
  assert.deepEqual(componentCandidateLayerKeys({
    pageIndex: 1,
    imageIndex: 0,
    imageId: "native-graphic-sparse-diagram-underlay",
    box: { x: 38.61, y: 183.75, w: 876.78, h: 222.38 }
  }), [
    "1:imageId:native-graphic-sparse-diagram-underlay",
    "1:box:38.6,183.8,876.8,222.4",
    "1:0"
  ]);
  assert.equal(componentCandidateBoxKey(1, { x: 38.61, y: 183.75, w: 876.78, h: 222.38 }), "1:box:38.6,183.8,876.8,222.4");
  assert.equal(findExpressionPolicyRepairForLayer(repairs, {
    pageIndex: 1,
    imageIndex: 7,
    imageId: "native-graphic-sparse-diagram-underlay"
  })?.repair?.mode, "reclassify-structural-diagram-or-component-template");
  assert.equal(findExpressionPolicyRepairForLayer(repairs, {
    pageIndex: 1,
    imageIndex: 7,
    box: { x: 38.61, y: 183.75, w: 876.78, h: 222.38 }
  })?.repair?.mode, "reclassify-structural-diagram-or-component-template");
});

test("component strategy rebuild applies expression policy repairs by image id before index fallback", () => {
  const report = {
    provider: "ir-component-candidate-report-v1",
    layers: [
      {
        pageIndex: 1,
        imageIndex: 0,
        imageId: "native-graphic-other",
        box: { x: 1, y: 1, w: 20, h: 20 },
        layerType: "diagram-zone",
        bestCandidates: []
      },
      {
        pageIndex: 1,
        imageIndex: 5,
        box: { x: 38.61, y: 183.75, w: 876.78, h: 222.38 },
        layerType: "diagram-zone",
        expressionForm: "complex-diagram",
        expressionSubtype: "sparse-process-flow",
        recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident",
        areaRatio: 0.34,
        templateFamily: "process-chain",
        plan: { templateFamily: "process-chain", targetMotifs: ["process-chain"] },
        diagramUnderstanding: {
          archetype: "process-chain",
          nativeReadiness: "hybrid-native-plus-residual-crops",
          visualAtomCount: 8,
          connectorCount: 3,
          containerCount: 4
        },
        bestCandidates: []
      }
    ]
  };
  const queue = {
    actions: [{
      deck: "Deck_A",
      page: 2,
      image: 1,
      imageId: "native-graphic-sparse-diagram-underlay",
      box: { x: 38.61, y: 183.75, w: 876.78, h: 222.38 },
      repair: {
        mode: "reclassify-structural-diagram-or-component-template",
        disableComponentTemplate: false,
        forcePreserveLocalCrop: false,
        allowNativeOverlays: true,
        requireSemanticStructureEvidence: true,
        reason: "Retained component crop should be structurally rebuilt."
      }
    }]
  };

  const repaired = applyExpressionPolicyRepairsToReport(report, queue, { deck: "Deck_A" });

  assert.equal(repaired.expressionPolicyRepairSummary.repairedLayers, 1);
  assert.equal(repaired.layers[0].expressionPolicyRepairApplied, undefined);
  assert.equal(repaired.layers[1].expressionPolicyRepairApplied, true);
  assert.equal(
    repaired.layers[1].componentRenderStrategy.expressionPolicyRepair.mode,
    "reclassify-structural-diagram-or-component-template"
  );
  assert.notEqual(repaired.layers[1].componentRenderStrategy.mode, "preserve-local-crop");
});

test("component strategy rebuild marks final residual deck images with expression policy repairs", () => {
  const deck = {
    pages: [
      { images: [] },
      {
        images: [
          {
            id: "native-graphic-other-split-0",
            box: { x: 1, y: 1, w: 20, h: 20 },
            source: { detector: "split-erased-residual-crop", layer: { layerType: "diagram-zone" } }
          },
          {
            id: "native-graphic-underlay-split-0",
            box: { x: 46.48, y: 153.76, w: 303.63, h: 347.63 },
            source: {
              detector: "split-wide-residual-crop",
              layer: {
                layerType: "diagram-zone",
                recommendedAction: "preserve-local-crop"
              }
            }
          },
          {
            id: "generated-without-id",
            box: { x: 672.11, y: 148.88, w: 241.03, h: 360.75 },
            source: { detector: "split-wide-residual-crop", layer: { layerType: "diagram-zone" } }
          }
        ]
      }
    ]
  };
  const queue = {
    actions: [
      {
        deck: "AI_Product_Asset_OS",
        page: 2,
        image: 1,
        imageId: "native-graphic-underlay-split-0",
        box: { x: 46.48, y: 153.76, w: 303.63, h: 347.63 },
        violation: "actionable-component-template-retained-crop",
        repair: { mode: "reclassify-structural-diagram-or-component-template" }
      },
      {
        deck: "AI_Product_Asset_OS",
        page: 2,
        image: 2,
        box: { x: 672.11, y: 148.88, w: 241.03, h: 360.75 },
        violation: "actionable-component-template-retained-crop",
        repair: { mode: "reclassify-structural-diagram-or-component-template" }
      }
    ]
  };

  const summary = applyExpressionPolicyRepairsToDeckImages(deck, queue, { deck: "AI_Product_Asset_OS" });

  assert.equal(summary.changed, true);
  assert.equal(summary.repairedImages, 2);
  assert.equal(summary.byDetector["split-wide-residual-crop"], 2);
  assert.equal(summary.byAction["replacement-candidate"], 2);
  assert.equal(deck.pages[1].images[0].source.expressionPolicyRepairApplied, undefined);
  assert.equal(deck.pages[1].images[1].source.expressionPolicyRepairApplied, true);
  assert.equal(deck.pages[1].images[1].source.layer.expressionPolicyRepairApplied, true);
  assert.equal(deck.pages[1].images[1].source.expressionPolicyRepairMode, "reclassify-structural-diagram-or-component-template");
  assert.equal(deck.pages[1].images[1].source.expressionPolicyRepairDisposition.action, "replacement-candidate");
  assert.equal(deck.pages[1].images[2].source.expressionPolicyRepairApplied, true);
});

test("component strategy rebuild preserves final screenshot or icon repair targets as fidelity crops", () => {
  const repair = {
    violation: "actionable-component-template-retained-crop",
    repair: { mode: "reclassify-structural-diagram-or-component-template" }
  };
  const classifyRepair = {
    violation: "actionable-unexplained-visual-unit-crop",
    repair: { mode: "classify-visual-unit-then-rebuild-or-protect" }
  };
  const pluginReferenceRepair = {
    violation: "unresolved-component-reference-crop",
    repair: { mode: "apply-real-plugin-component-or-specialized-native-rebuilder" }
  };

  const structural = expressionPolicyRepairDispositionForImage({
    id: "native-graphic-underlay-split-0",
    box: { x: 40, y: 120, w: 300, h: 200 },
    source: {
      detector: "split-erased-residual-crop",
      layer: {
        layerType: "diagram-zone",
        expressionForm: "complex-diagram",
        diagramUnderstanding: {
          nativeReadiness: "hybrid-native-plus-residual-crops",
          visualAtomCount: 8,
          nodeCount: 3,
          connectorCount: 2
        }
      }
    }
  }, repair, { pageIndex: 0, imageIndex: 0 });

  const classifiedStructural = expressionPolicyRepairDispositionForImage({
    id: "native-graphic-underlay-split-1",
    box: { x: 40, y: 120, w: 300, h: 200 },
    source: {
      detector: "split-erased-residual-crop",
      layer: {
        layerType: "diagram-zone",
        diagramUnderstanding: {
          nativeReadiness: "hybrid-native-plus-residual-crops",
          visualAtomCount: 7,
          nodeCount: 3,
          connectorCount: 2
        }
      }
    }
  }, classifyRepair, { pageIndex: 0, imageIndex: 3 });

  const pluginReferencedStructural = expressionPolicyRepairDispositionForImage({
    id: "native-graphic-underlay-split-2",
    box: { x: 42, y: 118, w: 300, h: 200 },
    source: {
      detector: "component-template-reference-crop",
      recommendedAction: "preserve-crop-with-component-reference",
      expressionForm: "complex-diagram",
      expressionSubtype: "cycle relationship diagram",
      layer: {
        layerType: "diagram-zone",
        recommendedAction: "preserve-crop-with-component-reference",
        diagramUnderstanding: {
          nativeReadiness: "hybrid-native-plus-residual-crops",
          visualAtomCount: 8,
          nodeCount: 4,
          connectorCount: 2
        }
      }
    }
  }, pluginReferenceRepair, { pageIndex: 0, imageIndex: 4 });

  const screenshot = expressionPolicyRepairDispositionForImage({
    id: "product-screen",
    box: { x: 40, y: 120, w: 300, h: 200 },
    source: {
      detector: "ui-screenshot-demo-crop",
      expressionForm: "screenshot-or-document",
      expressionSubtype: "ui-screenshot",
      layer: { layerType: "screenshot-zone" }
    }
  }, repair, { pageIndex: 0, imageIndex: 1 });

  const icon = expressionPolicyRepairDispositionForImage({
    id: "flow-icon",
    box: { x: 40, y: 120, w: 180, h: 160 },
    source: {
      detector: "plugin-cycle-arrow-component-preview",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "图标图示 素材图示 流程箭头",
      layer: { layerType: "diagram-zone" }
    }
  }, repair, { pageIndex: 0, imageIndex: 2 });

  assert.equal(structural.action, "replacement-candidate");
  assert.equal(structural.expressionKind, "structured-native");
  assert.equal(structural.unitDisposition, "semantic-native-structure");
  assert.equal(classifiedStructural.action, "replacement-candidate");
  assert.equal(classifiedStructural.repairMode, "classify-visual-unit-then-rebuild-or-protect");
  assert.equal(classifiedStructural.unitDisposition, "semantic-native-structure");
  assert.equal(pluginReferencedStructural.action, "replacement-candidate");
  assert.equal(pluginReferencedStructural.repairMode, "apply-real-plugin-component-or-specialized-native-rebuilder");
  assert.equal(pluginReferencedStructural.unitDisposition, "semantic-native-structure");
  assert.equal(screenshot.action, "preserve-fidelity-crop");
  assert.equal(icon.action, "preserve-fidelity-crop");
  assert.equal(icon.unitDisposition, "intentional-visual-crop");
});

test("component strategy rebuild applies structural reclassify repairs before replacement plans", () => {
  const report = {
    provider: "ir-component-candidate-report-v1",
    layers: [{
      pageIndex: 1,
      imageIndex: 0,
      layerType: "diagram-zone",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "图标图示 process diagram",
      recommendedAction: "preserve-local-crop",
      areaRatio: 0.38,
      box: { x: 20, y: 30, w: 360, h: 210 },
      templateFamily: "process-chain",
      plan: { templateFamily: "process-chain", targetMotifs: ["linear-arrow-chain"] },
      diagramUnderstanding: {
        archetype: "process-chain",
        nativeReadiness: "hybrid-native-plus-residual-crops",
        visualAtomCount: 8,
        nodeCount: 4,
        connectorCount: 3,
        componentStrategy: { templateFamily: "process-chain", targetMotifs: ["linear-arrow-chain"] }
      },
      componentRenderStrategy: { mode: "preserve-local-crop" },
      bestCandidates: [{
        sourceProvider: "officeplus",
        kind: "component",
        id: "repair-process-template",
        title: "流程箭头组件",
        reuseHint: "candidate-grouped-pptx-component",
        candidateScore: 78,
        structureSignature: {
          primaryKind: "process-chain",
          motifs: ["linear-arrow-chain"]
        }
      }]
    }]
  };
  const queue = {
    provider: "expression-policy-repair-queue-v1",
    actions: [{
      deck: "Deck_Reclassify",
      page: 2,
      image: 1,
      violation: "oversized-protected-diagram-crop",
      repair: {
        mode: "reclassify-structural-diagram-or-component-template",
        disableComponentTemplate: false,
        forcePreserveLocalCrop: false,
        allowNativeOverlays: true,
        requireSemanticStructureEvidence: true,
        reason: "Large protected diagram crop should be parsed into semantic components."
      }
    }]
  };

  const repaired = applyExpressionPolicyRepairsToReport(report, queue, { deck: "Deck_Reclassify" });

  assert.equal(repaired.expressionPolicyRepairSummary.repairedLayers, 1);
  assert.equal(repaired.layers[0].expressionPolicyRepairApplied, true);
  assert.equal(repaired.layers[0].componentRenderStrategy.expressionPolicyRepairApplied, true);
  assert.equal(repaired.layers[0].componentRenderStrategy.mode, "plugin-component-template");
  assert.equal(repaired.layers[0].componentRenderStrategy.bestCandidate.id, "repair-process-template");
  assert.equal(repaired.layers[0].componentRenderStrategy.componentTemplateDisabledByExpressionPolicy, false);
});

test("component strategy rebuild repairs owner-candidate layers after report merge", () => {
  const report = {
    provider: "merged-component-candidate-report-v1",
    layers: [{
      pageIndex: 4,
      imageIndex: 1,
      layerType: "screenshot-panel",
      areaRatio: 0.3,
      box: { x: 40, y: 50, w: 320, h: 180 },
      componentRenderStrategy: { mode: "plugin-component-template" },
      bestCandidates: [{
        sourceProvider: "islide",
        kind: "presentation-template",
        id: "owner-template",
        title: "截图流程组件",
        reuseHint: "applied-component",
        candidateScore: 88,
        roleTags: ["editable"]
      }]
    }]
  };
  const repaired = applyExpressionPolicyRepairsToReport(report, {
    actions: [{
      deck: "owner-deck",
      page: 5,
      image: 2,
      violation: "screenshot-replaced-by-template",
      repair: {
        mode: "preserve-crop-with-native-overlays",
        disableComponentTemplate: true,
        allowNativeOverlays: true,
        reason: "Screenshots keep crop fidelity."
      }
    }]
  }, { deck: "owner-deck" });

  assert.equal(repaired.layers[0].componentRenderStrategy.mode, "preserve-crop-with-native-overlays");
  assert.equal(repaired.layers[0].componentRenderStrategy.componentTemplateDisabledByExpressionPolicy, true);
  assert.equal(annotateNativeElementsWithPluginReplacementPlans({ pages: [{}, {}, {}, {}, {}] }, repaired).layers, 0);
});

test("component strategy rebuild preserves plugin action structure signals during candidate injection", () => {
  const report = {
    provider: "ir-component-candidate-report-v1",
    layers: [{
      pageIndex: 0,
      imageIndex: 2,
      layerType: "diagram-zone",
      areaRatio: 0.19,
      templateFamily: "cycle-loop",
      plan: { templateFamily: "cycle-loop", targetMotifs: ["arc-arrow"] },
      diagramUnderstanding: {
        archetype: "cycle-loop",
        nativeReadiness: "hybrid-native-plus-residual-crops",
        visualAtomCount: 8,
        nodeCount: 4,
        connectorCount: 2,
        componentStrategy: { templateFamily: "cycle-loop", targetMotifs: ["arc-arrow"] }
      },
      bestCandidates: []
    }]
  };
  const queue = {
    actions: [{
      order: 1,
      provider: "islide",
      kind: "presentation-template",
      id: "islide-applied-arc-arrow",
      title: "圆弧箭头循环组件",
      layerKey: "0:2",
      score: 42,
      reuseHint: "applied-component",
      actionType: "apply-and-harvest-plugin-component",
      targetMotifs: ["arc-arrow"],
      templateFamily: "cycle-loop",
      suitability: { tier: "weak", score: 60 }
    }]
  };

  const injected = injectPluginActionCandidatesIntoReport(report, queue);

  assert.equal(injected.layers[0].bestCandidates[0].sourceProvider, "islide");
  assert.deepEqual(injected.layers[0].bestCandidates[0].targetMotifs, ["arc-arrow"]);
  assert.equal(injected.layers[0].bestCandidates[0].structureSignature.primaryKind, "cycle-loop");
  assert.deepEqual(injected.layers[0].bestCandidates[0].structureSignature.motifs, ["arc-arrow"]);
  assert.ok(injected.layers[0].bestCandidates[0].roleTags.includes("applied-component"));
  assert.equal(injected.layers[0].componentRenderStrategy.mode, "plugin-component-template");
  assert.equal(injected.layers[0].componentRenderStrategy.bestCandidate.structureAlignmentScore, 1);
});

test("component strategy rebuild annotates native shapes with plugin replacement plans", () => {
  const deck = {
    pages: [{
      shapes: [{
        id: "inside-shape",
        box: { x: 320, y: 180, w: 80, h: 70 },
        source: { detector: "native-card" }
      }, {
        id: "outside-shape",
        box: { x: 20, y: 20, w: 40, h: 30 },
        source: { detector: "page-title-accent" }
      }],
      textBoxes: [{
        id: "inside-text",
        text: "文档",
        box: { x: 330, y: 190, w: 60, h: 24 },
        source: { detector: "native-label" }
      }, {
        id: "title",
        text: "PM Portal",
        box: { x: 50, y: 50, w: 200, h: 40 },
        source: { detector: "title" }
      }]
    }]
  };
  const report = {
    layers: [{
      pageIndex: 0,
      imageIndex: 0,
      box: { x: 287.14, y: 121.88, w: 385.35, h: 418.13 },
      componentRenderStrategy: {
        mode: "plugin-component-template",
        applicationPlan: {
          sourceProvider: "officeplus",
          componentKind: "component",
          componentId: "MatlComponentContent-11189",
          suitabilityTier: "strong",
          suitabilityScore: 96
        },
        bestCandidate: {
          title: "蓝色简约圆通用4项中心总分PPT组件"
        }
      }
    }]
  };

  const summary = annotateNativeElementsWithPluginReplacementPlans(deck, report);

  assert.equal(summary.changed, true);
  assert.equal(summary.layers, 1);
  assert.equal(summary.shapes, 1);
  assert.equal(summary.textBoxes, 1);
  assert.equal(deck.pages[0].shapes[0].source.componentReplacementCandidateId, "MatlComponentContent-11189");
  assert.equal(deck.pages[0].textBoxes[0].source.componentReplacementPlan.suitabilityTier, "strong");
  assert.equal(deck.pages[0].shapes[1].source.componentReplacementPlan, undefined);
  assert.equal(deck.pages[0].textBoxes[1].source.componentReplacementPlan, undefined);
});

test("component strategy rebuild self-plans specialized native component groups", () => {
  const strategy = {
    provider: "specialized-native-component-signal-v1",
    mode: "plugin-component-template",
    templateFamily: "process-chain",
    targetMotifs: ["lens-funnel-flow", "branch-card-flow", "linear-arrow-chain"],
    sourcePreference: ["islide-search", "officeplus-search"]
  };
  const deck = {
    pages: [{
      shapes: [{
        id: "demand-lens",
        box: { x: 350, y: 180, w: 140, h: 120 },
        source: {
          detector: "demand-understanding-flow-native-lens",
          componentTemplateFamilyApplied: "process-chain",
          componentAssetLayerKey: "demand-flow",
          componentRenderStrategy: strategy
        }
      }, {
        id: "demand-card",
        box: { x: 700, y: 180, w: 150, h: 52 },
        source: {
          detector: "demand-understanding-flow-native-card",
          componentTemplateFamilyApplied: "process-chain",
          componentAssetLayerKey: "demand-flow",
          componentRenderStrategy: strategy
        }
      }, {
        id: "demand-connector",
        box: { x: 490, y: 210, w: 210, h: 0 },
        source: {
          detector: "demand-understanding-flow-native-connector",
          componentTemplateFamilyApplied: "process-chain",
          componentAssetLayerKey: "demand-flow",
          componentRenderStrategy: strategy
        }
      }, {
        id: "title-accent",
        box: { x: 40, y: 40, w: 220, h: 26 },
        source: { detector: "title-accent" }
      }],
      textBoxes: [{
        id: "demand-label",
        text: "业务目标",
        box: { x: 720, y: 195, w: 110, h: 22 },
        source: {
          detector: "demand-understanding-flow-native-label",
          componentTemplateFamilyApplied: "process-chain",
          componentAssetLayerKey: "demand-flow",
          componentRenderStrategy: strategy
        }
      }, {
        id: "page-title",
        text: "Skill1需求理解",
        box: { x: 60, y: 60, w: 240, h: 32 },
        source: { detector: "title" }
      }]
    }]
  };

  const summary = annotateNativeElementsWithPluginReplacementPlans(deck, { layers: [] });

  assert.equal(summary.changed, true);
  assert.equal(summary.layers, 1);
  assert.equal(summary.shapes, 3);
  assert.equal(summary.textBoxes, 1);
  assert.equal(deck.pages[0].shapes[0].source.componentReplacementLayerKey, "demand-flow");
  assert.equal(deck.pages[0].shapes[1].source.componentReplacementPlan.sourceProvider, "native-specialized-rebuild");
  assert.deepEqual(deck.pages[0].textBoxes[0].source.componentReplacementPlan.targetMotifs, ["lens-funnel-flow", "branch-card-flow", "linear-arrow-chain"]);
  assert.equal(deck.pages[0].shapes[2].source.componentReplacementPlan.layerKey, "demand-flow");
  assert.equal(deck.pages[0].shapes[3].source.componentReplacementPlan, undefined);
  assert.equal(deck.pages[0].textBoxes[1].source.componentReplacementPlan, undefined);
});

test("component strategy rebuild falls back to candidate score for replacement plan priority", () => {
  const deck = {
    pages: [{
      shapes: [{
        id: "candidate-shape",
        box: { x: 100, y: 100, w: 80, h: 60 },
        source: { detector: "native-card" }
      }],
      textBoxes: []
    }]
  };
  const report = {
    layers: [{
      pageIndex: 0,
      imageIndex: 0,
      box: { x: 90, y: 90, w: 120, h: 100 },
      componentRenderStrategy: {
        mode: "plugin-component-template",
        applicationPlan: {
          sourceProvider: "officeplus",
          componentKind: "component",
          componentId: "MatlComponentContent-3611",
          suitabilityTier: "",
          suitabilityScore: 0
        },
        bestCandidate: {
          id: "MatlComponentContent-3611",
          sourceProvider: "officeplus",
          kind: "component",
          title: "渐变4项流程箭头",
          candidateScore: 72,
          suitability: { tier: "", score: 0 }
        }
      }
    }]
  };

  annotateNativeElementsWithPluginReplacementPlans(deck, report);

  assert.equal(deck.pages[0].shapes[0].source.componentReplacementPlan.suitabilityTier, "candidate");
  assert.equal(deck.pages[0].shapes[0].source.componentReplacementPlan.suitabilityScore, 72);
});

test("component strategy rebuild rejects low-score candidate replacement plans", () => {
  const deck = {
    pages: [{
      shapes: [{
        id: "weak-candidate-shape",
        box: { x: 100, y: 100, w: 80, h: 60 },
        source: { detector: "native-card" }
      }],
      textBoxes: []
    }]
  };
  const report = {
    layers: [{
      pageIndex: 0,
      imageIndex: 0,
      box: { x: 90, y: 90, w: 120, h: 100 },
      componentRenderStrategy: {
        mode: "plugin-component-template",
        applicationPlan: {
          sourceProvider: "officeplus",
          componentKind: "component",
          componentId: "MatlComponentContent-3897",
          suitabilityTier: "",
          suitabilityScore: 0
        },
        bestCandidate: {
          id: "MatlComponentContent-3897",
          sourceProvider: "officeplus",
          kind: "component",
          title: "弱匹配关系图",
          candidateScore: 46,
          suitability: { tier: "", score: 0 }
        }
      }
    }]
  };

  const summary = annotateNativeElementsWithPluginReplacementPlans(deck, report);

  assert.equal(summary.changed, false);
  assert.equal(summary.layers, 0);
  assert.equal(deck.pages[0].shapes[0].source.componentReplacementPlan, undefined);
});

test("component strategy rebuild parses bounded batch arguments", () => {
  const args = parseArgs([
    "node",
    "component-strategy-rebuild.js",
    "--work-root",
    "ppt文档/可编辑版本",
    "--out",
    "runs/component-strategy",
    "--only",
    "PM_Portal_AI_Skills_Engine",
    "--size",
    "5",
    "--quality",
    "true",
    "--quality-renderer",
    "powerpoint",
    "--quality-max-pages",
    "2",
    "--component-assets",
    "true",
    "--component-asset-max-files",
    "25",
    "--component-asset-max-per-layer",
    "2",
    "--component-asset-root",
    "runs/islide-harvest",
    "--component-asset-root",
    "runs/officeplus-harvest",
    "--applied-component-source",
    "runs/islide-samples",
    "--applied-component-provider",
    "islide",
    "--applied-component-harvest-root",
    "runs/islide-applied-components",
    "--applied-component-harvest-recursive",
    "--harvest-islide-temp",
    "--harvest-officeplus-local",
    "--harvest-discover-root",
    "runs/islide-temp",
    "--harvest-discover-limit",
    "3",
    "--component-inventory",
    "runs/plugin-component-inventory/inventory.json",
    "--component-inventory-cache",
    "runs/plugin-component-inventory/cache.json",
    "--component-learning-cache",
    "runs/plugin-component-inventory/learning-cache.json",
    "--component-acquisition-search",
    "true",
    "--component-acquisition-search-dry-run",
    "--component-acquisition-search-max-tasks",
    "6",
    "--component-acquisition-search-max-keywords",
    "2",
    "--component-acquisition-search-size",
    "5",
    "--component-acquisition-resolve-officeplus-downloads",
    "--component-acquisition-max-download-urls",
    "3",
    "--final-page-cache-dir",
    "runs/component-strategy/page-cache",
    "--objectify-component-group-matches",
    "true",
    "--component-group-match-min-score",
    "72",
    "--replace-safe-component-template-crops",
    "true",
    "--hybrid-component-template-residuals",
    "true",
    "--erase-specialized-hybrid-residual-text",
    "true",
    "--allow-asset-os-demand-understanding-native-approximation",
    "true",
    "--pptx-engine",
    "openxml",
    "--openxml-builder-exe",
    "OpenXmlDeckBuilder.exe",
    "--openxml-builder-configuration",
    "Release",
    "--openxml-builder-target-framework",
    "net8.0-windows",
    "--reuse-render",
    "--reuse-analysis",
    "--reuse-final-ir",
    "--reuse-final-page-cache",
    "--no-final-page-cache",
    "--openxml-batch",
    "--skip-pptx"
  ]);

  assert.equal(args.workRoot, "ppt文档/可编辑版本");
  assert.equal(args.out, "runs/component-strategy");
  assert.equal(args.only, "PM_Portal_AI_Skills_Engine");
  assert.equal(args.size, 5);
  assert.equal(args.skipPptx, true);
  assert.equal(args.quality, true);
  assert.equal(args.qualityRenderer, "powerpoint");
  assert.equal(args.qualityMaxPages, 2);
  assert.equal(args.componentAssets, true);
  assert.equal(args.componentAssetMaxFiles, 25);
  assert.equal(args.componentAssetMaxPerLayer, 2);
  assert.deepEqual(args.componentAssetRoots, ["runs/islide-harvest", "runs/officeplus-harvest"]);
  assert.deepEqual(args.appliedComponentSources, ["runs/islide-samples"]);
  assert.equal(args.appliedComponentProvider, "islide");
  assert.equal(args.appliedComponentHarvestRoot, "runs/islide-applied-components");
  assert.equal(args.appliedComponentHarvestRecursive, true);
  assert.equal(args.harvestISlideTempComponents, true);
  assert.equal(args.harvestOfficePlusLocalComponents, true);
  assert.equal(args.harvestDiscoverRoot, "runs/islide-temp");
  assert.equal(args.harvestDiscoverLimit, 3);
  assert.equal(args.componentInventory, "runs/plugin-component-inventory/inventory.json");
  assert.equal(args.componentInventoryCache, "runs/plugin-component-inventory/cache.json");
  assert.equal(args.componentLearningCache, "runs/plugin-component-inventory/learning-cache.json");
  assert.equal(args.componentAcquisitionSearch, true);
  assert.equal(args.componentAcquisitionSearchDryRun, true);
  assert.equal(args.componentAcquisitionSearchMaxTasks, 6);
  assert.equal(args.componentAcquisitionSearchMaxKeywords, 2);
  assert.equal(args.componentAcquisitionSearchSize, 5);
  assert.equal(args.componentAcquisitionResolveOfficePlusDownloads, true);
  assert.equal(args.componentAcquisitionMaxDownloadUrls, 3);
  assert.equal(args.finalPageCacheDir, "");
  assert.equal(args.objectifyComponentGroupMatches, true);
  assert.equal(args.componentGroupMatchMinScore, 72);
  assert.equal(args.replaceSafeComponentTemplateCrops, true);
  assert.equal(args.hybridComponentTemplateResiduals, true);
  assert.equal(args.eraseSpecializedHybridResidualText, true);
  assert.equal(args.allowAssetOsDemandUnderstandingNativeApproximation, true);
  assert.equal(args.pptxEngine, "openxml");
  assert.equal(args.openXmlBuilderExe, "OpenXmlDeckBuilder.exe");
  assert.equal(args.openXmlBuilderConfiguration, "Release");
  assert.equal(args.openXmlBuilderTargetFramework, "net8.0-windows");
  assert.equal(args.openXmlBatch, true);
  assert.equal(args.reuseRender, true);
  assert.equal(args.reuseAnalysis, true);
  assert.equal(args.reuseFinalIr, true);
  assert.equal(args.reuseFinalPageCache, false);
});

test("component strategy rebuild objectifies component group matches by default with explicit opt-out", () => {
  assert.equal(parseArgs(["node", "component-strategy-rebuild.js"]).objectifyComponentGroupMatches, true);
  assert.equal(parseArgs([
    "node",
    "component-strategy-rebuild.js",
    "--no-objectify-component-group-matches"
  ]).objectifyComponentGroupMatches, false);
  assert.equal(parseArgs([
    "node",
    "component-strategy-rebuild.js",
    "--objectify-component-group-matches",
    "false"
  ]).objectifyComponentGroupMatches, false);
});

test("component strategy rebuild scans explicit component asset roots for iSlide applied harvest decks", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-component-root-"));
  const harvest = path.join(tmp, "islide-harvest");
  const other = path.join(tmp, "unused");
  fs.mkdirSync(harvest, { recursive: true });
  fs.mkdirSync(other, { recursive: true });
  const sample = path.join(harvest, "applied-islide-component.pptx");
  fs.writeFileSync(sample, "PK mock applied iSlide component");
  fs.writeFileSync(path.join(other, "ignored.pptx"), "PK mock ignored component");

  const roots = normalizeComponentAssetRoots([harvest, harvest, ""]);
  assert.deepEqual(roots, [harvest]);

  const result = resolveComponentInventory({
    componentAssetRoots: [harvest],
    componentAssetMaxFiles: 10
  });

  assert.equal(result.source.mode, "fresh-scan");
  assert.deepEqual(result.source.componentAssetRoots, [harvest]);
  assert.equal(result.inventory.summary.total, 1);
  assert.equal(result.inventory.candidates[0].path, sample);
});

test("component strategy rebuild harvests applied component sources before scanning inventory", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-applied-source-"));
  const source = path.join(tmp, "source");
  const out = path.join(tmp, "out");
  fs.mkdirSync(source, { recursive: true });
  const pptx = path.join(source, "applied-cycle.pptx");
  fs.writeFileSync(pptx, "PK mock applied component");

  const args = withAppliedComponentHarvestDefaults({
    componentAssetMaxFiles: 10,
    componentAssetRoots: [],
    appliedComponentSources: [source],
    appliedComponentProvider: "islide",
    appliedComponentHarvestRecursive: false
  }, {
    analysisRoot: out
  });
  const harvest = resolveAppliedComponentHarvest(args);
  assert.equal(harvest.summary.copiedCount, 1);
  assert.ok(harvest.summary.componentNames[0].startsWith("islide-applied-cycle-"));
  assert.equal(harvest.summary.outRoots.length, 1);

  const result = resolveComponentInventory(args);
  assert.equal(result.source.mode, "fresh-scan");
  assert.equal(result.source.appliedComponentHarvest.copiedCount, 1);
  const islideCandidate = result.inventory.candidates.find((candidate) => candidate.provider === "islide");
  assert.ok(islideCandidate);
  assert.ok(islideCandidate.roleTags.includes("applied-component"));
});

test("component strategy rebuild discovers iSlide temp downloads and refreshes stale inventory cache", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-islide-temp-"));
  const tempRoot = path.join(tmp, "iSlide Tools", "site", "content", "file", "2026-03-10", "142556");
  const out = path.join(tmp, "out");
  const cache = path.join(tmp, "cache.json");
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.writeFileSync(path.join(tempRoot, "09d45b35.source.default.zh-Hans.pptx"), "PK mock iSlide component");
  fs.writeFileSync(cache, `${JSON.stringify({
    provider: "plugin-component-registry-v1",
    candidates: [{ id: "stale-cache-entry", provider: "officeplus" }]
  })}\n`, "utf8");

  const args = withAppliedComponentHarvestDefaults({
    componentAssetMaxFiles: 10,
    componentInventoryCache: cache,
    harvestISlideTempComponents: true,
    harvestDiscoverRoot: path.join(tmp, "iSlide Tools"),
    harvestDiscoverLimit: 2
  }, {
    analysisRoot: out
  });

  const result = resolveComponentInventory(args);
  assert.equal(result.source.mode, "cache-refreshed-after-harvest");
  assert.equal(result.source.appliedComponentHarvest.discoveredCount, 1);
  assert.equal(result.source.appliedComponentHarvest.copiedCount, 1);
  assert.notEqual(result.inventory.candidates[0].id, "stale-cache-entry");
  assert.equal(result.inventory.candidates[0].provider, "islide");
  assert.equal(shouldRefreshComponentInventoryCacheForHarvest(result.source.appliedComponentHarvest), true);
});

test("component strategy rebuild discovers OfficePLUS local downloads as separate component roots", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-officeplus-local-rebuild-"));
  const tempRoot = path.join(tmp, "OfficePLUS", "Temp", "component-download");
  const out = path.join(tmp, "out");
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.writeFileSync(path.join(tempRoot, "MatlComponentContent-11189.pptx"), "PK mock OfficePLUS component");

  const args = withAppliedComponentHarvestDefaults({
    componentAssetMaxFiles: 10,
    componentAssetRoots: [],
    harvestOfficePlusLocalComponents: true,
    harvestDiscoverRoot: tmp,
    harvestDiscoverLimit: 2
  }, {
    analysisRoot: out
  });

  const harvest = resolveAppliedComponentHarvest(args);
  assert.equal(harvest.summary.discoveredCount, 1);
  assert.equal(harvest.summary.copiedCount, 1);
  assert.equal(harvest.summary.outRoots.length, 1);
  assert.ok(harvest.summary.componentNames[0].startsWith("officeplus-applied-MatlComponentContent-11189-"));

  const result = resolveComponentInventory(args);
  assert.equal(result.source.mode, "fresh-scan");
  const officePlusCandidate = result.inventory.candidates.find((candidate) => candidate.provider === "officeplus");
  assert.ok(officePlusCandidate);
  assert.ok(result.source.componentAssetRoots[0].endsWith(`${path.sep}officeplus`));
});

test("page-shard rebuild helpers split pages and strip conflicting worker args", () => {
  assert.deepEqual(chunkPageShards([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.equal(pageRangeName([3]), "p003");
  assert.equal(pageRangeName([3, 4, 5]), "p003-p005");
  assert.deepEqual(
    selectedPageNumbers({ pages: [{ id: "a" }, { id: "b" }, { id: "c" }] }, "1,3"),
    [1, 3]
  );
  assert.deepEqual(
    pageShardWorkerArgv([
      "--work-root", "ppt文档/可编辑版本",
      "--out", "runs/page-shards",
      "--only", "Deck",
      "--pages", "1-3",
      "--concurrency", "4",
      "--page-shard-size", "1",
      "--skip-pptx",
      "--component-assets", "true",
      "--pptx-engine", "openxml"
    ]),
    [
      "--work-root", "ppt文档/可编辑版本",
      "--component-assets", "true",
      "--pptx-engine", "openxml"
    ]
  );
});

test("page-shard rebuild merges shard IR pages and copies assets", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-page-shards-"));
  const outRoot = path.join(tmp, "out");
  const shardA = path.join(tmp, "shard-a");
  const shardB = path.join(tmp, "shard-b");
  const baseName = "Deck";
  fs.mkdirSync(path.join(shardA, `${baseName}.assets`), { recursive: true });
  fs.mkdirSync(path.join(shardB, `${baseName}.assets`), { recursive: true });
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(path.join(shardA, `${baseName}.assets`, "p01.png"), "a");
  fs.writeFileSync(path.join(shardB, `${baseName}.assets`, "p02.png"), "b");
  const shardAIr = path.join(shardA, `${baseName}.native.ir.json`);
  const shardBIr = path.join(shardB, `${baseName}.native.ir.json`);
  fs.writeFileSync(shardAIr, JSON.stringify({ pages: [{ id: "page-2" }] }));
  fs.writeFileSync(shardBIr, JSON.stringify({ pages: [{ id: "page-1" }] }));

  const deck = mergeShardDecks({
    baseName,
    sourceIr: { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{}, {}] },
    outRoot,
    results: [
      { pages: [2], shardOut: shardA, outputIr: shardAIr },
      { pages: [1], shardOut: shardB, outputIr: shardBIr }
    ]
  });

  assert.deepEqual(deck.pages.map((page) => page.id), ["page-1", "page-2"]);
  assert.equal(fs.readFileSync(path.join(outRoot, `${baseName}.assets`, "p01.png"), "utf8"), "a");
  assert.equal(fs.readFileSync(path.join(outRoot, `${baseName}.assets`, "p02.png"), "utf8"), "b");
});

test("component strategy rebuild defers OpenXML PPTX generation only when quality does not need immediate output", () => {
  const openxml = componentStrategyPptxBuildOptions({ pptxEngine: "openxml", openXmlBatch: true });

  assert.equal(openxml.pptxEngine, "openxml");
  assert.equal(openxml.openXmlBatch, true);
  assert.equal(shouldDeferComponentStrategyPptxBuild({ quality: false, skipPptx: false }, openxml), true);
  assert.equal(shouldDeferComponentStrategyPptxBuild({ quality: true, skipPptx: false }, openxml), false);
  assert.equal(shouldDeferComponentStrategyPptxBuild({ quality: false, skipPptx: true }, openxml), false);
  assert.equal(shouldDeferComponentStrategyPptxBuild({ quality: false, skipPptx: false }, componentStrategyPptxBuildOptions({})), false);
});

test("component strategy rebuild enables safe automatic final page cache by default", () => {
  const policy = resolveComponentStrategyFinalPageCachePolicy({}, {
    analysisRoot: path.join("runs", "component-strategy", "_analysis")
  });
  assert.equal(policy.report.enabled, true);
  assert.equal(policy.report.reuse, true);
  assert.equal(policy.report.source, "auto");
  assert.ok(policy.dir.endsWith(path.join("_analysis", "_final-page-cache")));

  const explicit = resolveComponentStrategyFinalPageCachePolicy({
    finalPageCacheDir: "runs/custom-cache",
    reuseFinalPageCache: false
  }, {
    analysisRoot: path.join("runs", "component-strategy", "_analysis")
  });
  assert.equal(explicit.report.enabled, true);
  assert.equal(explicit.report.reuse, false);
  assert.equal(explicit.report.source, "explicit");
  assert.ok(explicit.dir.endsWith(path.join("runs", "custom-cache")));

  const disabled = resolveComponentStrategyFinalPageCachePolicy({
    finalPageCacheDir: "",
    reuseFinalPageCache: false
  });
  assert.deepEqual(disabled.report, { enabled: false, reuse: false, source: "disabled" });
});

test("component strategy rebuild reuses analysis artifacts only with matching cache metadata", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-analysis-cache-"));
  const workDir = path.join(tmp, "deck.work");
  const irDir = path.join(workDir, "ir");
  fs.mkdirSync(irDir, { recursive: true });
  fs.writeFileSync(path.join(irDir, "deck.json"), "{\"pages\":[{\"textBoxes\":[]}]}\n", "utf8");
  const preKey = buildPreAnalysisCacheKey({ workDir });
  assert.match(preKey, /^[a-f0-9]{64}$/);

  const preFile = path.join(tmp, "deck.pre-native.ir.json");
  const preMeta = path.join(tmp, "deck.pre-native.meta.json");
  fs.writeFileSync(preFile, "{\"pages\":[]}\n", "utf8");
  assert.equal(shouldReuseAnalysisArtifact({ artifactFile: preFile, metaFile: preMeta, cacheKey: preKey }), false);
  assert.equal(shouldReuseAnalysisArtifact({ artifactFile: preFile, metaFile: preMeta, cacheKey: preKey, reuseAnalysis: true }), true);
  fs.writeFileSync(preMeta, `${JSON.stringify({ provider: "component-strategy-analysis-artifact-cache-v1", cacheKey: preKey })}\n`, "utf8");
  assert.equal(shouldReuseAnalysisArtifact({ artifactFile: preFile, metaFile: preMeta, cacheKey: preKey }), true);
  assert.equal(shouldReuseAnalysisArtifact({ artifactFile: preFile, metaFile: preMeta, cacheKey: "0".repeat(64), reuseAnalysis: true }), false);

  const candidateKey = buildCandidateSearchCacheKey({ preIrFile: preFile, size: 3, dryRun: false });
  const candidateDryRunKey = buildCandidateSearchCacheKey({ preIrFile: preFile, size: 3, dryRun: true });
  const candidateSizeKey = buildCandidateSearchCacheKey({ preIrFile: preFile, size: 5, dryRun: false });
  assert.match(candidateKey, /^[a-f0-9]{64}$/);
  assert.notEqual(candidateDryRunKey, candidateKey);
  assert.notEqual(candidateSizeKey, candidateKey);
});

test("component strategy rebuild auto-selects OpenXML batch only for safe multi-file builds", () => {
  assert.deepEqual(selectComponentStrategyPptxEngine({ pptxEngine: "python" }, { workDirCount: 5 }), {
    engine: "python",
    batch: false,
    reason: "explicit-python"
  });
  assert.deepEqual(selectComponentStrategyPptxEngine({ pptxEngine: "openxml" }, { workDirCount: 1 }), {
    engine: "openxml",
    batch: true,
    reason: "explicit-openxml"
  });
  assert.deepEqual(selectComponentStrategyPptxEngine({ quality: true }, { workDirCount: 5 }), {
    engine: "python",
    batch: false,
    reason: "quality-needs-immediate-pptx"
  });
  assert.deepEqual(selectComponentStrategyPptxEngine({ skipPptx: true }, { workDirCount: 5 }), {
    engine: "python",
    batch: false,
    reason: "pptx-build-disabled"
  });
  assert.deepEqual(selectComponentStrategyPptxEngine({}, { workDirCount: 1 }), {
    engine: "python",
    batch: false,
    reason: "auto-single-file-compatibility"
  });
  assert.deepEqual(selectComponentStrategyPptxEngine({}, { workDirCount: 3 }), {
    engine: "openxml",
    batch: true,
    reason: "auto-batch-real-samples-fastest"
  });

  const options = componentStrategyPptxBuildOptions({}, { workDirCount: 3 });
  assert.equal(options.pptxEngine, "openxml");
  assert.equal(options.openXmlBatch, true);
  assert.equal(options.selection.reason, "auto-batch-real-samples-fastest");
});

test("component strategy rebuild rejects unknown CLI arguments instead of falling back to full batch", () => {
  assert.throws(
    () => parseArgs([
      "node",
      "component-strategy-rebuild.js",
      "--input",
      "ppt文档/Intelligent_R_D_Asset_Blueprint.pptx"
    ]),
    /Unknown component-strategy-rebuild argument: --input/
  );
});

test("component strategy parallel wrapper strips wrapper args and defers PPTX safely", () => {
  assert.equal(shouldBatchPptxAfterWorkers({}), true);
  assert.equal(shouldBatchPptxAfterWorkers({ quality: "true" }), false);
  assert.equal(shouldBatchPptxAfterWorkers({ "skip-pptx": "true" }), false);

  assert.deepEqual(
    componentStrategyWorkerArgv([
      "--work-root", "work",
      "--out", "out",
      "--concurrency", "4",
      "--heartbeat-ms", "10000",
      "--only", "deck",
      "--report-file", "x.json",
      "--component-assets", "true"
    ], { batchAfterWorkers: true }),
    ["--work-root", "work", "--out", "out", "--component-assets", "true", "--skip-pptx"]
  );

  const componentArgs = toComponentStrategyArgs({
    "pptx-engine": "openxml",
    "openxml-builder-exe": "OpenXmlDeckBuilder.exe"
  });
  assert.equal(componentArgs.pptxEngine, "openxml");
  assert.equal(componentArgs.openXmlBatch, true);
  assert.equal(componentArgs.openXmlBuilderExe, "OpenXmlDeckBuilder.exe");
});

test("component strategy parallel wrapper infers deferred PPTX output from worker IR", () => {
  assert.equal(
    inferNativeEditablePptxPath("out/deck.native.ir.json"),
    "out/deck.native-editable.pptx"
  );
  assert.equal(
    inferNativeEditablePptxPath("out/deck.ir.json"),
    "out/deck.native-editable.pptx"
  );
  assert.equal(inferNativeEditablePptxPath("out/deck.json"), "");
});

test("component strategy parallel wrapper aggregates successes and worker failures", () => {
  const report = aggregateComponentStrategyReports({
    workRoot: "work",
    outRoot: "out",
    concurrency: 2,
    reportDir: "reports",
    batchAfterWorkers: true,
    results: [
      {
        ok: true,
        reportFile: "a.json",
        elapsedMs: 10,
        report: {
          results: [{
            inputWorkDir: "work/a.work",
            status: "ir-built",
            outputIr: "out/a.native.ir.json",
            outputPptx: "out/a.native-editable.pptx",
            pages: 1,
            images: 2,
            shapes: 3,
            textBoxes: 4
          }]
        }
      },
      {
        ok: false,
        baseName: "b",
        elapsedMs: 20,
        error: { message: "boom" }
      }
    ]
  });

  assert.equal(report.provider, "component-strategy-rebuild-parallel-v1");
  assert.equal(report.batchAfterWorkers, true);
  assert.equal(report.totals.files, 1);
  assert.equal(report.totals.failed, 1);
  assert.equal(report.results[0].workerReportFile, "a.json");
  assert.equal(report.results[1].status, "failed");
});

test("component strategy parallel wrapper recommends bounded resource-aware concurrency", () => {
  assert.equal(recommendComponentStrategyConcurrency({ workDirCount: 1, cpuCount: 16, totalMemoryBytes: 64 * 1024 ** 3 }), 1);
  assert.equal(recommendComponentStrategyConcurrency({ workDirCount: 8, cpuCount: 8, totalMemoryBytes: 16 * 1024 ** 3 }), 2);
  assert.equal(recommendComponentStrategyConcurrency({ workDirCount: 8, cpuCount: 16, totalMemoryBytes: 32 * 1024 ** 3 }), 3);
  assert.equal(recommendComponentStrategyConcurrency({ workDirCount: 8, cpuCount: 16, totalMemoryBytes: 64 * 1024 ** 3 }), 4);
});

test("component strategy parallel wrapper parses heartbeat interval safely", () => {
  assert.equal(parsePositiveInt("15000", 30000), 15000);
  assert.equal(parsePositiveInt("0", 30000), 30000);
  assert.equal(parsePositiveInt("-1", 30000), 30000);
  assert.equal(parsePositiveInt("abc", 30000), 30000);
});

test("component strategy parallel wrapper heartbeat reports active workers", () => {
  const originalWrite = process.stderr.write;
  const chunks = [];
  process.stderr.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  try {
    writeHeartbeat(new Map([
      ["deck-a", { index: 0, total: 2, startedAt: Date.now() - 1250 }],
      ["deck-b", { index: 1, total: 2, startedAt: Date.now() - 2250 }]
    ]), 30000);
  } finally {
    process.stderr.write = originalWrite;
  }

  assert.equal(chunks.length, 1);
  assert.match(chunks[0], /heartbeat 2 active/);
  assert.match(chunks[0], /1\/2 deck-a/);
  assert.match(chunks[0], /2\/2 deck-b/);
});

test("component strategy rebuild roundtrips learning summary cache", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-learning-cache-"));
  const file = path.join(tmp, "learning-cache.json");
  const cache = new Map([
    ["C:\\asset.pptx|2026-01-01T00:00:00.000Z|123", { assetType: "pptx-template", slideCount: 2 }]
  ]);

  writeLearningSummaryCache(file, cache);
  const restored = readLearningSummaryCache(file);

  assert.equal(restored.size, 1);
  assert.equal(restored.get("C:\\asset.pptx|2026-01-01T00:00:00.000Z|123").assetType, "pptx-template");
});

test("component strategy rebuild records measured stage timings", () => {
  const timings = {};
  const value = measureStage(timings, "sampleMs", () => 42);

  assert.equal(value, 42);
  assert.equal(Number.isFinite(timings.sampleMs), true);
});

test("component strategy rebuild final page cache salt changes with component inputs", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-page-cache-salt-"));
  const candidate = path.join(tmp, "candidate.json");
  const asset = path.join(tmp, "asset.json");
  const repairs = path.join(tmp, "repairs.json");
  fs.writeFileSync(candidate, "{\"layers\":[]}\n", "utf8");
  fs.writeFileSync(asset, "{\"summary\":{\"localAssetMatches\":1}}\n", "utf8");
  fs.writeFileSync(repairs, "{\"actions\":[]}\n", "utf8");

  const baseline = buildFinalPageCacheSalt({
    candidateFile: candidate,
    expressionPolicyRepairQueueFile: repairs,
    componentAssetManifestFile: asset,
    objectifyComponentGroupMatches: true,
    componentGroupMatchMinScore: 58
  });
  fs.writeFileSync(asset, "{\"summary\":{\"localAssetMatches\":2}}\n", "utf8");
  const changed = buildFinalPageCacheSalt({
    candidateFile: candidate,
    expressionPolicyRepairQueueFile: repairs,
    componentAssetManifestFile: asset,
    objectifyComponentGroupMatches: true,
    componentGroupMatchMinScore: 58
  });
  const thresholdChanged = buildFinalPageCacheSalt({
    candidateFile: candidate,
    componentAssetManifestFile: asset,
    objectifyComponentGroupMatches: true,
    componentGroupMatchMinScore: 72
  });
  const replacementChanged = buildFinalPageCacheSalt({
    candidateFile: candidate,
    componentAssetManifestFile: asset,
    objectifyComponentGroupMatches: true,
    componentGroupMatchMinScore: 72,
    replaceSafeComponentTemplateCrops: true
  });
  fs.writeFileSync(repairs, "{\"actions\":[{\"page\":1,\"image\":1}]}\n", "utf8");
  const repairsChanged = buildFinalPageCacheSalt({
    candidateFile: candidate,
    expressionPolicyRepairQueueFile: repairs,
    componentAssetManifestFile: asset,
    objectifyComponentGroupMatches: true,
    componentGroupMatchMinScore: 72,
    replaceSafeComponentTemplateCrops: true
  });
  const hybridPolicyChanged = buildFinalPageCacheSalt({
    candidateFile: candidate,
    expressionPolicyRepairQueueFile: repairs,
    componentAssetManifestFile: asset,
    objectifyComponentGroupMatches: true,
    componentGroupMatchMinScore: 72,
    replaceSafeComponentTemplateCrops: true,
    hybridComponentTemplateResiduals: true,
    eraseSpecializedHybridResidualText: false,
    allowAssetOsDemandUnderstandingNativeApproximation: true
  });

  assert.match(baseline, /^[a-f0-9]{64}$/);
  assert.notEqual(changed, baseline);
  assert.notEqual(thresholdChanged, changed);
  assert.notEqual(replacementChanged, thresholdChanged);
  assert.notEqual(repairsChanged, replacementChanged);
  assert.notEqual(hybridPolicyChanged, repairsChanged);
});

test("component strategy rebuild reads explicit or cached component inventory", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-inventory-cache-"));
  const explicit = path.join(tmp, "explicit.json");
  const cache = path.join(tmp, "cache.json");
  const inventory = {
    provider: "plugin-component-registry-v1",
    candidates: [{ id: "asset-a", provider: "officeplus", path: "C:\\asset.pptx" }]
  };
  fs.writeFileSync(explicit, `${JSON.stringify(inventory)}\n`, "utf8");
  fs.writeFileSync(cache, `${JSON.stringify({ ...inventory, candidates: [{ id: "cached" }] })}\n`, "utf8");

  const explicitResult = resolveComponentInventory({ componentInventory: explicit });
  const cacheResult = resolveComponentInventory({ componentInventoryCache: cache });

  assert.equal(explicitResult.source.mode, "explicit-file");
  assert.equal(explicitResult.inventory.candidates[0].id, "asset-a");
  assert.equal(cacheResult.source.mode, "cache-hit");
  assert.equal(cacheResult.inventory.candidates[0].id, "cached");
});

test("component strategy rebuild summarizes applied strategy modes", () => {
  const counts = countComponentStrategyModes({
    pages: [{
      images: [
        { source: { componentRenderStrategy: { mode: "plugin-component-template" } } },
        { source: { layer: { componentRenderStrategy: { mode: "preserve-local-crop" } } } },
        { source: {} }
      ]
    }]
  });

  assert.deepEqual(counts, {
    "plugin-component-template": 1,
    "preserve-local-crop": 1
  });
});

test("component strategy rebuild counts applied component template shells", () => {
  const deck = {
    pages: [{
      images: [
        { source: { componentTemplateGroupApplied: true } },
        { type: "plugin-component-picture", source: { detector: "plugin-component-template-native-picture" } },
        { source: {} }
      ],
      shapes: [
        { source: { componentTemplateGroupApplied: true } },
        { source: { componentTemplateGroupApplied: true } },
        { source: {} }
      ],
      textBoxes: [
        { source: { componentTemplateGroupApplied: true } },
        { source: {} }
      ]
    }]
  };

  assert.equal(countComponentTemplateAppliedImages(deck), 1);
  assert.equal(countComponentTemplateAppliedShapes(deck), 2);
  assert.equal(countComponentTemplateAppliedTextBoxes(deck), 1);
  assert.equal(countComponentTemplateAppliedPictures(deck), 1);
});

test("component strategy rebuild builds safe quality gate arguments", () => {
  const args = buildQualityGateArgs({
    irFile: "deck.native.ir.json",
    pptxFile: "deck.native-editable.pptx",
    outDir: "quality/deck",
    renderer: "powerpoint",
    maxPages: 2,
    reuseRender: true
  });

  assert.ok(args[0].endsWith("quality-gate-real-pptx.js"));
  assert.deepEqual(args.slice(1), [
    "--ir", "deck.native.ir.json",
    "--pptx", "deck.native-editable.pptx",
    "--out", "quality/deck",
    "--renderer", "powerpoint",
    "--max-pages", "2",
    "--reuse-render", "true"
  ]);
});

test("component strategy rebuild summarizes quality pass counts", () => {
  const totals = summarizePipelineTotals([
    {
      pages: 2,
      images: 1,
      shapes: 3,
      textBoxes: 4,
      componentStrategyLayers: 2,
      componentTemplateAppliedImages: 1,
      componentTemplateAppliedShapes: 7,
      componentTemplateAppliedTextBoxes: 2,
      componentTemplateAppliedPictures: 1,
      componentTemplateMotifReadyImages: 1,
      componentTemplateMotifReadyShapes: 5,
      componentTemplateMotifReadyTextBoxes: 1,
      componentTemplateMotifReadyPictures: 1,
      componentTemplateMotifReadyTargetCounts: { "arc-arrow": 7 },
      componentAssetSummary: { layers: 2, layersWithLocalAssets: 1, localAssetMatches: 3, assetsWithRecommendedGroups: 1, recommendedGroupMatches: 2, highReusableGroupMatches: 1, acquisitionTasks: 4 },
      pluginActionCandidateInjection: { injectedLayers: 1, injectedCandidates: 3 },
      nativeComponentReplacementPlan: { layers: 1, shapes: 4, textBoxes: 2 },
      finalDeckExpressionPolicyRepairSummary: { repairedImages: 4, byAction: { "replacement-candidate": 3, "preserve-fidelity-crop": 1 } },
      quality: { passed: true }
    },
    {
      pages: 1,
      images: 2,
      shapes: 5,
      textBoxes: 6,
      componentStrategyLayers: 1,
      componentTemplateAppliedImages: 2,
      componentTemplateAppliedShapes: 9,
      componentTemplateAppliedTextBoxes: 3,
      componentTemplateAppliedPictures: 2,
      componentTemplateMotifReadyImages: 1,
      componentTemplateMotifReadyShapes: 4,
      componentTemplateMotifReadyTextBoxes: 2,
      componentTemplateMotifReadyPictures: 1,
      componentTemplateMotifReadyTargetCounts: { "arc-arrow": 3, "tree-link": 4 },
      componentAssetSummary: { layers: 1, layersWithLocalAssets: 1, localAssetMatches: 1, assetsWithRecommendedGroups: 1, recommendedGroupMatches: 3, highReusableGroupMatches: 2, acquisitionTasks: 5 },
      pluginActionCandidateInjection: { injectedLayers: 2, injectedCandidates: 4 },
      nativeComponentReplacementPlan: { layers: 1, shapes: 5, textBoxes: 3 },
      finalDeckExpressionPolicyRepairSummary: { repairedImages: 6, byAction: { "replacement-candidate": 5, "preserve-fidelity-crop": 1 } },
      quality: { passed: false }
    }
  ]);

  assert.equal(totals.files, 2);
  assert.equal(totals.qualityPassed, 1);
  assert.equal(totals.qualityFailed, 1);
  assert.equal(totals.componentStrategyLayers, 3);
  assert.equal(totals.componentAssetLayers, 3);
  assert.equal(totals.componentAssetLayersWithLocalAssets, 2);
  assert.equal(totals.componentAssetLocalMatches, 4);
  assert.equal(totals.componentAssetRecommendedAssets, 2);
  assert.equal(totals.componentAssetRecommendedGroups, 5);
  assert.equal(totals.componentAssetHighReusableGroups, 3);
  assert.equal(totals.componentAssetAcquisitionTasks, 9);
  assert.equal(totals.pluginActionInjectedLayers, 3);
  assert.equal(totals.pluginActionInjectedCandidates, 7);
  assert.equal(totals.nativeComponentReplacementPlanLayers, 2);
  assert.equal(totals.nativeComponentReplacementPlanShapes, 9);
  assert.equal(totals.nativeComponentReplacementPlanTextBoxes, 5);
  assert.equal(totals.finalDeckExpressionPolicyRepairedImages, 10);
  assert.deepEqual(totals.finalDeckExpressionPolicyRepairActions, { "replacement-candidate": 8, "preserve-fidelity-crop": 2 });
  assert.equal(totals.componentTemplateAppliedImages, 3);
  assert.equal(totals.componentTemplateAppliedShapes, 16);
  assert.equal(totals.componentTemplateAppliedTextBoxes, 5);
  assert.equal(totals.componentTemplateAppliedPictures, 3);
  assert.equal(totals.componentTemplateMotifReadyImages, 2);
  assert.equal(totals.componentTemplateMotifReadyShapes, 9);
  assert.equal(totals.componentTemplateMotifReadyTextBoxes, 3);
  assert.equal(totals.componentTemplateMotifReadyPictures, 2);
  assert.deepEqual(totals.componentTemplateMotifReadyTargetCounts, { "arc-arrow": 10, "tree-link": 4 });
});
