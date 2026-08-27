"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  recommendComponentRenderStrategy,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-render-strategy");

test("component render strategy prefers grouped editable component candidates", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.28,
    recommendedAction: "split-native-with-residual-crop",
    diagramUnderstanding: { nativeReadiness: "hybrid-native-plus-residual-crops" }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-11617",
    title: "渐变6项流程",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 72,
    coverUrl: "https://image-prod.officeplus.cn/demo.png"
  }]);

  assert.equal(result.mode, "plugin-component-template");
  assert.equal(result.implementationMode, "auth-or-download-required");
  assert.equal(result.bestCandidate.sourceProvider, "officeplus");
  assert.equal(result.bestCandidate.confidence, 0.72);
  assert.equal(result.applicationPlan.currentStep, "preserve-source-crop-and-record-component-replacement");
  assert.equal(result.applicationPlan.targetStep, "replace-fidelity-crop-with-editable-plugin-component-when-download-is-available");
  assert.equal(result.applicationPlan.requiresDownload, true);
});

test("component render strategy protects dense radial line art without semantic units", () => {
  const layer = {
    areaRatio: 0.6018,
    layerType: "diagram-zone",
    detector: "foreground-aggregate-crop",
    expressionForm: "complex-diagram",
    expressionSubtype: "dense-complex-diagram",
    recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident",
    diagramUnderstanding: {
      archetype: "dense-radial-line-art",
      expressionFamily: "layout-grid",
      confidence: 0.95,
      nativeReadiness: "preserve-crop",
      visualAtomCount: 117,
      nodeCount: 0,
      visualNodeCount: 24,
      connectorCount: 0,
      visualAtomKindCounts: {
        "grid-line-candidate": 11,
        "native-rect-candidate": 106
      },
      evidence: { textBoxCount: 0 }
    }
  };
  const candidate = {
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-3218",
    title: "扁平6项流程路线",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 72
  };

  const policy = _private.classifyGraphicExpressionPolicy(layer);
  const result = recommendComponentRenderStrategy(layer, [candidate]);

  assert.equal(policy.kind, "standalone-visual-asset");
  assert.equal(policy.minimumUnitPolicy, "preserve-as-single-crop");
  assert.deepEqual(policy.reasons, ["dense-radial-line-art-without-semantic-units"]);
  assert.equal(result.mode, "preserve-local-crop");
  assert.equal(result.expressionPolicy.protectCrop, true);
});

test("dense radial diagrams with semantic nodes remain eligible for native reconstruction", () => {
  const policy = _private.classifyGraphicExpressionPolicy({
    layerType: "diagram-zone",
    expressionForm: "complex-diagram",
    diagramUnderstanding: {
      archetype: "dense-radial-line-art",
      nativeReadiness: "native-rebuild",
      visualAtomCount: 30,
      nodeCount: 4,
      connectorCount: 3,
      evidence: { textBoxCount: 4 }
    }
  });

  assert.equal(policy.kind, "structured-native");
  assert.equal(policy.allowNativeRebuild, true);
});

test("approved complete dense diagrams remain one fidelity unit only with explicit safety evidence", () => {
  const approved = _private.classifyGraphicExpressionPolicy({
    source: {
      expressionFamily: "generic-structured-diagram",
      expressionForm: "complex-diagram",
      sourceFaithfulCrop: true,
      protectedMinimumUnit: true,
      largeFidelityCropApproved: true,
      largeFidelityCropApprovalReason: "the complete dense system map has unreadable micro-labels and cannot be decomposed without semantic loss",
      componentRenderStrategy: { mode: "preserve-local-crop" }
    }
  });
  const missingEvidence = _private.classifyGraphicExpressionPolicy({
    source: {
      expressionForm: "complex-diagram",
      largeFidelityCropApproved: true,
      largeFidelityCropApprovalReason: "too vague",
      componentRenderStrategy: { mode: "preserve-local-crop" }
    }
  });

  assert.equal(approved.kind, "fidelity-crop");
  assert.equal(approved.protectCrop, true);
  assert.equal(approved.allowNativeRebuild, false);
  assert.deepEqual(approved.reasons, ["authoritative-complete-diagram-fidelity-exception"]);
  assert.equal(missingEvidence.kind, "native-intended-gap");
  assert.equal(missingEvidence.allowNativeRebuild, true);
});

test("component render strategy ranks suitability strong candidates over higher raw weak candidates", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.28,
    layerType: "diagram-zone",
    recommendedAction: "split-native-with-residual-crop",
    diagramUnderstanding: {
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 8,
      residualCount: 1,
      componentStrategy: { templateFamily: "relationship" }
    }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "weak-raw-high",
    title: "泛关系组件",
    reuseHint: "candidate-grouped-pptx-component",
    score: 94,
    suitability: { tier: "weak", score: 42 }
  }, {
    sourceProvider: "officeplus",
    kind: "component",
    id: "strong-raw-lower",
    title: "渐变4项中心",
    reuseHint: "candidate-grouped-pptx-component",
    score: 45,
    suitability: { tier: "strong", score: 96 }
  }]);

  assert.equal(result.mode, "plugin-component-template");
  assert.equal(result.bestCandidate.id, "strong-raw-lower");
  assert.equal(result.bestCandidate.suitability.tier, "strong");
  assert.equal(result.applicationPlan.suitabilityTier, "strong");
  assert.equal(result.applicationPlan.suitabilityScore, 96);
});

test("component render strategy suppresses rejected suitability candidates", () => {
  const rejected = {
    sourceProvider: "officeplus",
    kind: "component",
    id: "rejected-chart",
    title: "多色插画PPT柱状图",
    reuseHint: "candidate-grouped-pptx-component",
    score: 99,
    suitability: { tier: "rejected", score: 2 }
  };

  const result = recommendComponentRenderStrategy({
    areaRatio: 0.28,
    layerType: "diagram-zone",
    diagramUnderstanding: {
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 8,
      residualCount: 1,
      componentStrategy: { templateFamily: "relationship" }
    }
  }, [rejected]);

  assert.notEqual(result.mode, "plugin-component-template");
  assert.equal(_private.candidateConfidence(rejected), 0.12);
});

test("component render strategy keeps screenshot/document layers as fidelity crops despite high component matches", () => {
  const candidate = {
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-11617",
    title: "渐变6项流程",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 83,
    coverUrl: "https://image-prod.officeplus.cn/demo.png"
  };
  const screenshot = recommendComponentRenderStrategy({
    areaRatio: 0.24,
    layerType: "screenshot-zone",
    detector: "product-illustration-segment-crop",
    expressionForm: "screenshot-or-document",
    expressionSubtype: "ui-screenshot",
    recommendedAction: "preserve-local-crop",
    diagramUnderstanding: {
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 9,
      residualCount: 3
    }
  }, [candidate]);
  const nativeDiagram = recommendComponentRenderStrategy({
    areaRatio: 0.24,
    layerType: "diagram-zone",
    detector: "sparse-diagram-graphic-underlay-crop",
    expressionForm: "complex-diagram",
    diagramUnderstanding: {
      nativeReadiness: "native-rebuild",
      visualAtomCount: 9,
      residualCount: 0
    }
  }, [candidate]);

  assert.equal(screenshot.mode, "preserve-local-crop");
  assert.equal(screenshot.editableExpectation, "raster-screenshot-or-document-with-editable-text-overlays");
  assert.equal(screenshot.visualFidelityBias, "fidelity-first");
  assert.equal(screenshot.applicationPlan.currentStep, "preserve-source-crop");
  assert.equal(nativeDiagram.mode, "plugin-component-template");
  assert.equal(_private.isFidelityLockedRasterLayer({
    layerType: "screenshot-zone",
    expressionForm: "screenshot-or-document"
  }), true);
  assert.equal(_private.isFidelityLockedRasterLayer({
    layerType: "diagram-zone",
    expressionForm: "complex-diagram",
    diagramUnderstanding: { nativeReadiness: "native-rebuild" }
  }), false);
});

test("component render strategy preserves screenshot process underlays instead of replacing them with workflow components", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.641,
    layerType: "screenshot-zone",
    detector: "screenshot-process-underlay-crop",
    templateFamily: "process-chain",
    diagramUnderstanding: {
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 10,
      residualCount: 4,
      componentStrategy: { templateFamily: "process-chain" }
    }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-11617",
    title: "渐变6项流程",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 92,
    suitability: { tier: "strong", score: 96 }
  }]);

  assert.equal(result.mode, "preserve-local-crop");
  assert.equal(result.visualFidelityBias, "fidelity-first");
  assert.equal(result.bestCandidate.id, "MatlComponentContent-11617");
  assert.equal(_private.isComponentTemplateEligibleLayer({
    layerType: "screenshot-zone",
    detector: "screenshot-process-underlay-crop",
    diagramUnderstanding: {
      nativeReadiness: "hybrid-native-plus-residual-crops",
      componentStrategy: { templateFamily: "process-chain" }
    }
  }), false);
});

test("component render strategy preserves standalone illustration panels despite high hub-spoke component matches", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.2294,
    layerType: "illustration-zone",
    detector: "left-illustration-panel-crop",
    templateFamily: "hub-spoke",
    recommendedAction: "preserve-local-crop",
    diagramUnderstanding: {
      nativeReadiness: "preserve-crop",
      visualAtomCount: 8,
      residualCount: 5,
      componentStrategy: { templateFamily: "hub-spoke" }
    }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-hub",
    title: "扁平6项总分图表关系图",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 91,
    suitability: { tier: "strong", score: 94 }
  }]);

  assert.equal(result.mode, "preserve-local-crop");
  assert.equal(result.expressionPolicy.kind, "standalone-visual-asset");
  assert.equal(result.visualFidelityBias, "fidelity-first");
  assert.equal(_private.isComponentTemplateEligibleLayer({
    layerType: "illustration-zone",
    detector: "left-illustration-panel-crop",
    recommendedAction: "preserve-local-crop",
    diagramUnderstanding: {
      nativeReadiness: "preserve-crop",
      componentStrategy: { templateFamily: "hub-spoke" }
    }
  }), false);
});

test("component render strategy protects decorative textures from primitive rebuild", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.18,
    layerType: "decorative-zone",
    detector: "dotted-background-texture",
    expressionForm: "decorative-texture",
    expressionSubtype: "background-pattern",
    diagramUnderstanding: {
      visualAtomCount: 80,
      nativeReadiness: ""
    }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "decorative-match",
    title: "点阵背景",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 91
  }]);

  assert.equal(result.mode, "preserve-local-crop");
  assert.equal(result.expressionPolicy.kind, "decorative-texture");
  assert.equal(result.expressionPolicy.minimumUnitPolicy, "sample-or-merge-decorative-texture");
  assert.match(result.reason, /decorative texture/i);
});

test("component render strategy keeps obvious visual-example icons as crops without structure", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.08,
    layerType: "illustration-zone",
    detector: "plugin-cycle-arrow-illustration-crop",
    expressionForm: "icon-or-illustration",
    expressionSubtype: "cycle-flow-icon visual-example 示意图",
    recommendedAction: "keep-local-crop-unless-exact-component-match",
    diagramUnderstanding: {
      visualAtomCount: 2,
      residualCount: 2
    }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "weak-cycle",
    title: "循环箭头",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 88
  }]);

  assert.equal(result.mode, "preserve-local-crop");
  assert.equal(result.expressionPolicy.kind, "standalone-visual-asset");
  assert.equal(result.expressionPolicy.minimumUnitPolicy, "preserve-as-single-crop");
  assert.equal(result.expressionPolicy.unitDisposition, "intentional-visual-crop");
});

test("component render strategy keeps pictorial arrow assets as crops despite atom-like connector evidence", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.12,
    layerType: "illustration-zone",
    detector: "plugin-cycle-arrow-illustration-crop",
    expressionForm: "icon-or-illustration",
    expressionSubtype: "cycle-flow-icon vector-arrow",
    recommendedAction: "replace-with-native-components",
    diagramUnderstanding: {
      nativeReadiness: "native-rebuild",
      visualAtomCount: 14,
      connectorCount: 2,
      residualCount: 1,
      visualAtomKindCounts: {
        "native-arc-arrow-segment-candidate": 10,
        "connector-line-candidate": 2
      }
    }
  }, [{
    sourceProvider: "islide",
    kind: "smartdiagram",
    id: "segmented-cycle-arrow",
    title: "圆弧循环箭头",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 93
  }]);

  assert.equal(result.mode, "preserve-local-crop");
  assert.equal(result.expressionPolicy.kind, "standalone-visual-asset");
  assert.equal(result.expressionPolicy.allowNativeRebuild, false);
  assert.ok(result.expressionPolicy.reasons.includes("pictorial-single-asset-preserved"));
});

test("component render strategy keeps plain pictorial diagrams as crops despite mistaken native readiness", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.18,
    layerType: "illustration-zone",
    detector: "product-pictorial-diagram-crop",
    expressionForm: "icon-or-illustration",
    expressionSubtype: "产品示意图 pictorial-example",
    recommendedAction: "replace-with-native-components",
    diagramUnderstanding: {
      nativeReadiness: "native-rebuild",
      visualAtomCount: 10,
      nodeCount: 0,
      connectorCount: 0,
      residualCount: 1
    }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "high-score-product-illustration",
    title: "产品示意组件",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 96
  }]);

  assert.equal(result.mode, "preserve-local-crop");
  assert.equal(result.expressionPolicy.kind, "standalone-visual-asset");
  assert.equal(result.expressionPolicy.allowNativeRebuild, false);
  assert.ok(result.expressionPolicy.reasons.includes("pictorial-single-asset-preserved"));
});

test("component render strategy keeps screenshot examples as single movable crops", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.24,
    layerType: "illustration-zone",
    detector: "ui-screenshot-demo-crop",
    expressionForm: "icon-or-illustration",
    expressionSubtype: "界面截图示意 sample mockup",
    recommendedAction: "replace-with-native-components",
    diagramUnderstanding: {
      nativeReadiness: "native-rebuild",
      visualAtomCount: 12,
      nodeCount: 0,
      connectorCount: 0,
      residualCount: 2
    }
  }, []);

  assert.equal(result.mode, "preserve-local-crop");
  assert.equal(result.expressionPolicy.kind, "standalone-visual-asset");
  assert.equal(result.expressionPolicy.minimumUnitPolicy, "preserve-as-single-crop");
  assert.ok(result.expressionPolicy.reasons.includes("pictorial-single-asset-preserved"));
});

test("component render strategy keeps plugin diagram sample previews as fidelity crops", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.19,
    layerType: "illustration-zone",
    detector: "islide-component-preview-cycle-diagram",
    expressionForm: "icon-or-illustration",
    expressionSubtype: "组件预览 图示样例 preview mockup",
    recommendedAction: "replace-with-native-components",
    diagramUnderstanding: {
      nativeReadiness: "native-rebuild",
      visualAtomCount: 16,
      connectorCount: 3,
      residualCount: 1
    }
  }, [{
    sourceProvider: "islide",
    kind: "smartdiagram",
    id: "cycle-preview",
    title: "圆弧循环箭头图示",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 94
  }]);

  assert.equal(result.mode, "preserve-local-crop");
  assert.equal(result.expressionPolicy.kind, "standalone-visual-asset");
  assert.equal(result.expressionPolicy.minimumUnitPolicy, "preserve-as-single-crop");
  assert.ok(result.expressionPolicy.reasons.includes("pictorial-single-asset-preserved"));
});

test("component render strategy still rebuilds structured chart diagrams despite pictorial wording", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.22,
    layerType: "diagram-zone",
    detector: "chart-diagram-sample-crop",
    expressionForm: "complex-diagram",
    expressionSubtype: "图表示意图 chart matrix",
    recommendedAction: "replace-with-native-components",
    diagramUnderstanding: {
      nativeReadiness: "native-rebuild",
      visualAtomCount: 8,
      nodeCount: 3,
      connectorCount: 1,
      residualCount: 0
    }
  }, []);

  assert.equal(result.mode, "native-visual-atom-rebuild");
  assert.equal(result.expressionPolicy.kind, "structured-native");
  assert.equal(result.expressionPolicy.minimumUnitPolicy, "rebuild-semantic-structure");
  assert.equal(result.expressionPolicy.unitDisposition, "semantic-native-structure");
});

test("component render strategy allows semantic structure to use native/component paths", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.2,
    layerType: "diagram-zone",
    expressionForm: "complex-diagram",
    expressionSubtype: "linear-process-diagram",
    diagramUnderstanding: {
      nativeReadiness: "native-rebuild",
      visualAtomCount: 6,
      residualCount: 0,
      nodeCount: 4,
      connectorCount: 3,
      componentStrategy: { templateFamily: "process" }
    }
  }, []);

  assert.equal(result.mode, "native-visual-atom-rebuild");
  assert.equal(result.expressionPolicy.kind, "structured-native");
  assert.equal(result.expressionPolicy.minimumUnitPolicy, "rebuild-semantic-structure");
});

test("component render strategy preserves screenshot bases while rebuilding detected native overlays", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.31,
    layerType: "screenshot-zone",
    detector: "product-illustration-segment-crop",
    expressionForm: "screenshot-or-document",
    expressionSubtype: "ui-screenshot",
    recommendedAction: "split-native-with-residual-crop",
    diagramUnderstanding: {
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 7,
      residualCount: 3,
      connectorCount: 2,
      nodeCount: 3,
      visualAtomKindCounts: {
        "arrow-candidate": 2,
        "label-candidate": 2
      }
    }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-overlay",
    title: "流程标注组件",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 78
  }]);
  const pureScreenshot = recommendComponentRenderStrategy({
    areaRatio: 0.31,
    layerType: "screenshot-zone",
    expressionForm: "screenshot-or-document",
    recommendedAction: "preserve-local-crop",
    diagramUnderstanding: {
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 1,
      residualCount: 6
    }
  }, []);

  assert.equal(result.mode, "preserve-crop-with-native-overlays");
  assert.equal(result.implementationMode, "hybrid-native-overlay");
  assert.equal(result.editableExpectation, "fidelity-screenshot-with-editable-native-diagram-overlays");
  assert.equal(result.applicationPlan.currentStep, "preserve-source-crop-and-rebuild-detected-overlays-as-native");
  assert.equal(result.applicationPlan.preservesFidelityNow, true);
  assert.equal(pureScreenshot.mode, "preserve-local-crop");
  assert.equal(_private.isFidelityCropWithNativeOverlayEligibleLayer({
    layerType: "screenshot-zone",
    expressionForm: "screenshot-or-document",
    recommendedAction: "split-native-with-residual-crop",
    diagramUnderstanding: {
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 4,
      residualCount: 2,
      visualAtomKindCounts: { "arrow-candidate": 1, "label-candidate": 2 }
    }
  }), true);
  assert.equal(_private.isFidelityCropWithNativeOverlayEligibleLayer({
    layerType: "screenshot-zone",
    expressionForm: "screenshot-or-document",
    recommendedAction: "preserve-local-crop",
    diagramUnderstanding: {
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 1,
      residualCount: 5
    }
  }), false);
});

test("component render strategy blocks decorative and plain illustration layers from high-score component templates", () => {
  const candidate = {
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-9090",
    title: "精美装饰流程组件",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 88,
    coverUrl: "https://image-prod.officeplus.cn/decorative.png"
  };
  const decorative = recommendComponentRenderStrategy({
    areaRatio: 0.18,
    layerType: "decorative-zone",
    expressionForm: "icon-or-illustration",
    recommendedAction: "preserve-local-crop",
    diagramUnderstanding: {
      visualAtomCount: 2,
      residualCount: 1
    }
  }, [candidate]);
  const plainIllustration = recommendComponentRenderStrategy({
    areaRatio: 0.16,
    layerType: "illustration-zone",
    expressionForm: "icon-or-illustration",
    diagramUnderstanding: {
      componentStrategy: { templateFamily: "generic" },
      visualAtomCount: 2,
      residualCount: 1
    }
  }, [candidate]);
  const structuredIllustration = recommendComponentRenderStrategy({
    areaRatio: 0.16,
    layerType: "illustration-zone",
    expressionForm: "icon-or-illustration",
    diagramUnderstanding: {
      nativeReadiness: "hybrid-native-plus-residual-crops",
      componentStrategy: { templateFamily: "relationship" },
      visualAtomCount: 5,
      residualCount: 1
    }
  }, [candidate]);

  assert.equal(decorative.mode, "preserve-local-crop");
  assert.equal(decorative.editableExpectation, "standalone-visual-asset-preserved-as-movable-crop");
  assert.match(decorative.reason, /standalone icon/);
  assert.equal(plainIllustration.mode, "preserve-local-crop");
  assert.equal(plainIllustration.bestCandidate.id, "MatlComponentContent-9090");
  assert.equal(plainIllustration.editableExpectation, "standalone-visual-asset-preserved-as-movable-crop");
  assert.equal(structuredIllustration.mode, "plugin-component-template");
  assert.equal(_private.isComponentTemplateEligibleLayer({
    layerType: "decorative-zone",
    expressionForm: "icon-or-illustration"
  }), false);
  assert.equal(_private.isComponentTemplateEligibleLayer({
    layerType: "illustration-zone",
    expressionForm: "icon-or-illustration",
    diagramUnderstanding: {
      nativeReadiness: "hybrid-native-plus-residual-crops",
      componentStrategy: { templateFamily: "relationship" }
    }
  }), true);
});

test("component render strategy preserves standalone plugin visual assets before high-score editable candidates", () => {
  const candidate = {
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-16000",
    title: "简约渐变3项向上箭头循环",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 94,
    suitability: { tier: "strong", score: 93 }
  };

  const explicitStandalone = recommendComponentRenderStrategy({
    areaRatio: 0.2,
    layerType: "illustration-zone",
    expressionForm: "icon-or-illustration",
    expressionSubtype: "cycle-flow-icon visual-example 示意图",
    detector: "plugin-cycle-arrow-illustration-crop",
    standaloneVisualAsset: true,
    recommendedAction: "preserve-local-crop",
    diagramUnderstanding: {
      nativeReadiness: "native-rebuild",
      visualAtomCount: 9,
      residualCount: 0,
      componentStrategy: { templateFamily: "relationship" }
    }
  }, [candidate]);
  const structuredRelationship = recommendComponentRenderStrategy({
    areaRatio: 0.2,
    layerType: "illustration-zone",
    expressionForm: "icon-or-illustration",
    detector: "relationship-diagram-underlay-crop",
    recommendedAction: "split-native-with-residual-crop",
    diagramUnderstanding: {
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 9,
      residualCount: 1,
      componentStrategy: { templateFamily: "relationship" }
    }
  }, [candidate]);

  assert.equal(explicitStandalone.mode, "preserve-local-crop");
  assert.equal(explicitStandalone.editableExpectation, "standalone-visual-asset-preserved-as-movable-crop");
  assert.equal(explicitStandalone.applicationPlan.preservesFidelityNow, true);
  assert.equal(structuredRelationship.mode, "plugin-component-template");
  assert.equal(_private.isStandaloneVisualAssetLayer({
    layerType: "illustration-zone",
    expressionForm: "icon-or-illustration",
    expressionSubtype: "cycle-flow-icon visual-example"
  }), true);
});

test("component render strategy lets structured matrix expressions override stale standalone crop flags", () => {
  const candidate = {
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-20568",
    title: "扁平3项箭头矩阵",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 94,
    confidence: 0.94,
    suitability: { tier: "strong", score: 94 },
    structureSignature: {
      primaryKind: "grid-or-matrix",
      motifs: ["card-grid", "linear-arrow-chain"]
    }
  };
  const layer = {
    areaRatio: 0.3824,
    layerType: "table-zone",
    detector: "foreground-graphic-underlay-crop",
    expressionForm: "table-or-matrix",
    expressionSubtype: "table-grid",
    standaloneVisualAsset: true,
    recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
    diagramUnderstanding: {
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 6,
      residualCount: 1,
      componentStrategy: { templateFamily: "matrix" }
    }
  };

  const result = recommendComponentRenderStrategy(layer, [candidate]);

  assert.equal(_private.isStandaloneVisualAssetLayer(layer), false);
  assert.equal(_private.isComponentTemplateEligibleLayer(layer), true);
  assert.equal(result.mode, "plugin-component-template");
  assert.equal(result.bestCandidate.id, "MatlComponentContent-20568");
});

test("component render strategy does not native-rebuild plain illustrations solely from atom counts", () => {
  const plainIllustration = recommendComponentRenderStrategy({
    areaRatio: 0.18,
    layerType: "illustration-zone",
    expressionForm: "icon-or-illustration",
    diagramUnderstanding: {
      visualAtomCount: 8,
      residualCount: 0,
      componentStrategy: { templateFamily: "generic" }
    }
  }, []);
  const structuredDiagram = recommendComponentRenderStrategy({
    areaRatio: 0.18,
    layerType: "diagram-zone",
    expressionForm: "complex-diagram",
    diagramUnderstanding: {
      visualAtomCount: 8,
      residualCount: 0,
      componentStrategy: { templateFamily: "process-chain" }
    }
  }, []);
  const nativeIllustration = recommendComponentRenderStrategy({
    areaRatio: 0.18,
    layerType: "illustration-zone",
    expressionForm: "icon-or-illustration",
    diagramUnderstanding: {
      nativeReadiness: "native-rebuild",
      visualAtomCount: 8,
      residualCount: 0
    }
  }, []);

  assert.equal(plainIllustration.mode, "preserve-local-crop");
  assert.equal(structuredDiagram.mode, "native-visual-atom-rebuild");
  assert.equal(nativeIllustration.mode, "native-visual-atom-rebuild");
  assert.equal(_private.isNativeVisualAtomEligibleLayer({
    layerType: "illustration-zone",
    expressionForm: "icon-or-illustration",
    diagramUnderstanding: {
      visualAtomCount: 8,
      residualCount: 0,
      componentStrategy: { templateFamily: "generic" }
    }
  }), false);
});

test("component render strategy preserves complex crops when only iSlide references are available", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.34,
    recommendedAction: "split-native-with-residual-crop",
    diagramUnderstanding: {
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 2,
      residualCount: 3
    }
  }, [{
    sourceProvider: "islide",
    kind: "diagram",
    id: "5114996",
    title: "创意风教育答辩课件流程图PPT流程",
    reuseHint: "candidate-polished-diagram-reference",
    candidateScore: 62,
    coverUrl: "https://static.islide.cc/site/content/demo.png"
  }]);

  assert.equal(result.mode, "preserve-crop-with-component-reference");
  assert.equal(result.implementationMode, "guide-only");
  assert.equal(result.editableExpectation, "raster-diagram-with-editable-text-overlays");
  assert.equal(result.visualFidelityBias, "fidelity-first");
  assert.equal(result.applicationPlan.currentStep, "preserve-source-crop-with-plugin-style-reference");
  assert.equal(result.applicationPlan.sourceProvider, "islide");
});

test("component render strategy rebuilds structured matrix layers despite guide-only iSlide references", () => {
  const matrixLayer = {
    areaRatio: 0.18,
    layerType: "table-zone",
    detector: "split-erased-residual-crop",
    recommendedAction: "split-native-with-residual-crop",
    diagramUnderstanding: {
      archetype: "matrix-or-grid",
      visualAtomCount: 2,
      residualCount: 3,
      visualAtomKindCounts: { "grid-line-candidate": 1 },
      componentStrategy: {
        layout: "swimlane",
        targetMotifs: ["card-grid", "linear-arrow-chain", "whole-process-template", "branch-card-flow"]
      }
    }
  };
  const reference = {
    sourceProvider: "islide",
    kind: "diagram",
    id: "473319",
    title: "多色线条渐变8项PPT流程",
    reuseHint: "candidate-polished-diagram-reference",
    candidateScore: 62,
    targetMotifs: ["card-grid", "linear-arrow-chain", "whole-process-template", "branch-card-flow"],
    structureSignature: {
      primaryKind: "matrix-or-grid",
      layout: "swimlane",
      motifs: ["card-grid", "linear-arrow-chain", "whole-process-template", "branch-card-flow"]
    }
  };

  const result = recommendComponentRenderStrategy(matrixLayer, [reference]);

  assert.equal(result.mode, "native-visual-atom-rebuild");
  assert.equal(result.implementationMode, "native-matrix");
  assert.equal(result.editableExpectation, "mostly-editable-native-grid-or-matrix-primitives");
  assert.equal(result.applicationPlan.currentStep, "rebuild-native-visual-atoms");
  assert.equal(_private.isMatrixNativeRebuildReadyWithReference(matrixLayer, reference), true);
  assert.equal(_private.isMatrixNativeRebuildReadyWithReference({
    ...matrixLayer,
    layerType: "screenshot-zone",
    expressionForm: "screenshot-or-document"
  }, reference), false);
});

test("component render strategy allows moderate OfficePLUS matrix components with grid evidence", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.53,
    layerType: "table-zone",
    recommendedAction: "attempt-native-reconstruction",
    diagramUnderstanding: {
      archetype: "matrix-or-grid",
      visualAtomKindCounts: { "grid-line-candidate": 3 },
      nativeReadiness: "hybrid-native-plus-residual-crops"
    }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-20568",
    title: "扁平3项箭头矩阵",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 46,
    coverUrl: "https://image-prod.officeplus.cn/matrix.png"
  }]);

  assert.equal(result.mode, "plugin-component-template");
  assert.equal(result.editableExpectation, "matrix-native-shell-over-fidelity-crop");
  assert.equal(_private.isStructuredMatrixLayer({
    diagramUnderstanding: { visualAtomKindCounts: { "grid-line-candidate": 2 } }
  }), true);
});

test("component render strategy rejects high scoring process arrows for table-zone grids", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.53,
    layerType: "table-zone",
    recommendedAction: "attempt-native-reconstruction",
    diagramUnderstanding: {
      archetype: "matrix-or-grid",
      visualAtomKindCounts: { "grid-line-candidate": 3 },
      nativeReadiness: "hybrid-native-plus-residual-crops",
      componentStrategy: {
        templateFamily: "grid-or-matrix",
        targetMotifs: ["card-grid"]
      }
    }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-3611",
    title: "渐变4项流程箭头",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 72,
    coverUrl: "https://image-prod.officeplus.cn/process-arrow.png"
  }]);

  assert.notEqual(result.mode, "plugin-component-template");
  assert.equal(result.mode, "native-visual-atom-rebuild");
  assert.equal(result.editableExpectation, "mostly-editable-native-grid-or-matrix-primitives");
});

test("component render strategy still allows high scoring process arrows for process layers", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.24,
    layerType: "diagram-zone",
    recommendedAction: "attempt-native-reconstruction",
    diagramUnderstanding: {
      archetype: "process-chain",
      nodeCount: 4,
      connectorCount: 3,
      visualAtomCount: 8,
      nativeReadiness: "hybrid-native-plus-residual-crops",
      componentStrategy: {
        templateFamily: "process-chain",
        targetMotifs: ["linear-arrow-chain"]
      }
    }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-3611",
    title: "渐变4项流程箭头",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 72,
    coverUrl: "https://image-prod.officeplus.cn/process-arrow.png"
  }]);

  assert.equal(result.mode, "plugin-component-template");
});

test("component render strategy allows moderate relationship components only for structured diagrams", () => {
  const candidate = {
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-3897",
    title: "扁平6项总分图表关系图",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 46
  };
  const diagram = recommendComponentRenderStrategy({
    areaRatio: 0.31,
    layerType: "diagram-zone",
    diagramUnderstanding: {
      archetype: "generic-node-diagram",
      nodeCount: 3,
      connectorCount: 2,
      visualAtomCount: 3
    }
  }, [candidate]);
  const screenshot = recommendComponentRenderStrategy({
    areaRatio: 0.22,
    layerType: "screenshot-zone",
    diagramUnderstanding: {
      archetype: "generic-node-diagram",
      nodeCount: 3,
      connectorCount: 2
    }
  }, [candidate]);

  assert.equal(diagram.mode, "plugin-component-template");
  assert.equal(diagram.editableExpectation, "relationship-native-shell-over-fidelity-crop");
  assert.equal(screenshot.mode, "preserve-local-crop");
  assert.equal(_private.isStructuredRelationshipLayer({
    layerType: "diagram-zone",
    diagramUnderstanding: { archetype: "generic-node-diagram", nodeCount: 3, connectorCount: 1 }
  }), true);
  assert.equal(_private.isStructuredRelationshipLayer({
    layerType: "illustration-zone",
    diagramUnderstanding: { archetype: "topology-diagram", nodeCount: 8, connectorCount: 7 }
  }), true);
});

test("component render strategy allows compact relationship components only with normalized family evidence", () => {
  const candidate = {
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-3897",
    title: "扁平6项总分图表关系图",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 46
  };
  const compactDiagram = recommendComponentRenderStrategy({
    areaRatio: 0.063,
    layerType: "diagram-zone",
    diagramUnderstanding: {
      archetype: "unclassified-diagram",
      nodeCount: 1,
      visualAtomCount: 1,
      componentStrategy: { templateFamily: "hub-spoke" }
    }
  }, [candidate]);
  const screenshot = recommendComponentRenderStrategy({
    areaRatio: 0.063,
    layerType: "screenshot-zone",
    diagramUnderstanding: {
      archetype: "unclassified-diagram",
      nodeCount: 1,
      visualAtomCount: 1,
      componentStrategy: { templateFamily: "hub-spoke" }
    }
  }, [candidate]);
  const unnormalized = recommendComponentRenderStrategy({
    areaRatio: 0.063,
    layerType: "diagram-zone",
    diagramUnderstanding: {
      archetype: "unclassified-diagram",
      nodeCount: 1,
      visualAtomCount: 1,
      componentStrategy: { templateFamily: "generic" }
    }
  }, [candidate]);

  assert.equal(compactDiagram.mode, "plugin-component-template");
  assert.equal(compactDiagram.editableExpectation, "compact-relationship-native-shell-over-fidelity-crop");
  assert.equal(screenshot.mode, "preserve-local-crop");
  assert.equal(unnormalized.mode, "preserve-local-crop");
  assert.equal(_private.isCompactRelationshipLayer({
    areaRatio: 0.063,
    layerType: "diagram-zone",
    diagramUnderstanding: {
      archetype: "unclassified-diagram",
      nodeCount: 1,
      visualAtomCount: 1,
      componentStrategy: { templateFamily: "hub-spoke" }
    }
  }), true);
});

test("component render strategy allows moderate process components only for structured diagram flows", () => {
  const candidate = {
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-11617",
    title: "渐变6项流程",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 46
  };
  const diagram = recommendComponentRenderStrategy({
    areaRatio: 0.23,
    layerType: "diagram-zone",
    diagramUnderstanding: {
      archetype: "process-with-screenshots",
      nodeCount: 10,
      connectorCount: 9
    }
  }, [candidate]);
  const screenshot = recommendComponentRenderStrategy({
    areaRatio: 0.23,
    layerType: "screenshot-zone",
    diagramUnderstanding: {
      archetype: "process-with-screenshots",
      nodeCount: 10,
      connectorCount: 9
    }
  }, [candidate]);

  assert.equal(diagram.mode, "plugin-component-template");
  assert.equal(diagram.editableExpectation, "process-native-shell-over-fidelity-crop");
  assert.equal(screenshot.mode, "preserve-local-crop");
  assert.equal(_private.isStructuredProcessLayer({
    layerType: "diagram-zone",
    diagramUnderstanding: { archetype: "flow-card-chain", nodeCount: 4, connectorCount: 3 }
  }), true);
});

test("component render strategy allows native rebuild when atoms are strong and component reference is moderate", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.16,
    recommendedAction: "attempt-native-reconstruction",
    diagramUnderstanding: {
      nativeReadiness: "native-rebuild",
      visualAtomCount: 8,
      residualCount: 0
    }
  }, [{
    sourceProvider: "islide",
    kind: "diagram",
    id: "774611",
    title: "红色简约4项PPT流程关系图",
    reuseHint: "candidate-polished-diagram-reference",
    candidateScore: 52
  }]);

  assert.equal(result.mode, "native-rebuild-with-component-style-guide");
  assert.equal(result.visualFidelityBias, "balanced");
});

test("component render strategy avoids primitive rebuild for high-risk radial relationship diagrams", () => {
  const radialLayer = {
    areaRatio: 0.28,
    layerType: "diagram-zone",
    recommendedAction: "attempt-native-reconstruction",
    diagramUnderstanding: {
      archetype: "hub-spoke",
      nativeReadiness: "native-rebuild",
      nodeCount: 5,
      connectorCount: 4,
      visualAtomCount: 9,
      componentStrategy: {
        templateFamily: "hub-spoke",
        targetMotifs: ["radial-link"]
      }
    }
  };
  const withReference = recommendComponentRenderStrategy(radialLayer, [{
    sourceProvider: "islide",
    kind: "smartdiagram",
    id: "islide-radial-1",
    title: "中心辐射关系图",
    reuseHint: "candidate-smart-diagram-reference",
    candidateScore: 58
  }]);
  const withoutReference = recommendComponentRenderStrategy(radialLayer, []);
  const withEditableOfficePlus = recommendComponentRenderStrategy(radialLayer, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-11189",
    title: "蓝色简约圆通用4项中心总分PPT组件",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 58
  }]);
  const plainFlow = recommendComponentRenderStrategy({
    areaRatio: 0.18,
    layerType: "diagram-zone",
    recommendedAction: "attempt-native-reconstruction",
    diagramUnderstanding: {
      archetype: "flow-card-chain",
      nativeReadiness: "native-rebuild",
      nodeCount: 5,
      connectorCount: 4,
      visualAtomCount: 9,
      componentStrategy: { templateFamily: "process-chain" }
    }
  }, []);

  assert.equal(withReference.mode, "preserve-crop-with-component-reference");
  assert.equal(withReference.editableExpectation, "raster-diagram-until-polished-plugin-component-is-applied");
  assert.equal(withReference.visualFidelityBias, "fidelity-first");
  assert.equal(withReference.applicationPlan.currentStep, "preserve-source-crop-with-plugin-style-reference");
  assert.equal(withoutReference.mode, "preserve-local-crop");
  assert.equal(withoutReference.editableExpectation, "raster-diagram-until-polished-plugin-component-is-applied");
  assert.equal(withEditableOfficePlus.mode, "plugin-component-template");
  assert.equal(withEditableOfficePlus.editableExpectation, "candidate-editable-template-after-download");
  assert.equal(plainFlow.mode, "native-visual-atom-rebuild");
  assert.equal(_private.isHighCompositionRiskRelationshipLayer(radialLayer), true);
  assert.equal(_private.isHighCompositionRiskRelationshipLayer({
    layerType: "screenshot-zone",
    diagramUnderstanding: {
      archetype: "hub-spoke",
      nodeCount: 5,
      connectorCount: 4,
      componentStrategy: { targetMotifs: ["radial-link"] }
    }
  }), false);
});

test("component render strategy uses specialized native rebuild for dense two-panel radial relationship diagrams", () => {
  const denseRadialLayer = {
    areaRatio: 0.31,
    detector: "two-panel-diagram-crop",
    layerType: "diagram-zone",
    recommendedAction: "attempt-native-reconstruction",
    templateFamily: "hub-spoke",
    plan: {
      targetMotifs: ["radial-link", "linear-arrow-chain"],
      structureSignature: {
        layout: "radial",
        stepCount: 24,
        rows: 3,
        columns: 3,
        direction: "center-out"
      }
    },
    diagramUnderstanding: {
      archetype: "hub-spoke",
      nativeReadiness: "native-rebuild",
      nodeCount: 8,
      connectorCount: 6,
      visualAtomCount: 12,
      residualCount: 1,
      componentStrategy: {
        templateFamily: "hub-spoke",
        targetMotifs: ["radial-link", "linear-arrow-chain"]
      }
    }
  };

  const result = recommendComponentRenderStrategy(denseRadialLayer, [{
    sourceProvider: "islide",
    kind: "smartdiagram",
    id: "4935985",
    title: "扁平PPT关系",
    reuseHint: "candidate-smart-diagram-reference",
    candidateScore: 58
  }]);

  assert.equal(result.mode, "native-visual-atom-rebuild");
  assert.equal(result.implementationMode, "native-specialized");
  assert.equal(result.editableExpectation, "mostly-editable-specialized-relationship-diagram");
  assert.equal(result.applicationPlan.currentStep, "rebuild-specialized-native-visual-atoms");
  assert.equal(_private.isHighCompositionRiskRelationshipLayer(denseRadialLayer), true);
  assert.equal(_private.isSpecializedRelationshipNativeRebuildReady(
    denseRadialLayer,
    _private.componentLayerStructureSignature(denseRadialLayer)
  ), true);
  assert.equal(_private.isSpecializedRelationshipNativeRebuildReady({
    ...denseRadialLayer,
    detector: "screenshot-diagram-crop"
  }), false);
});

test("component render strategy sanitizes unsafe candidate metadata", () => {
  const result = recommendComponentRenderStrategy({}, [{
    sourceProvider: "islide",
    kind: "diagram",
    id: "5114996",
    title: "demo\u0000",
    reuseHint: "candidate-polished-diagram-reference",
    candidateScore: 60,
    coverUrl: "file:///unsafe.png"
  }]);

  assert.equal(result.bestCandidate.title, "demo");
  assert.equal(result.bestCandidate.coverUrl, "");
});

test("component render strategy promotes structure-aligned iSlide applied components", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.19,
    layerType: "diagram-zone",
    recommendedAction: "split-native-with-residual-crop",
    diagramUnderstanding: {
      archetype: "cycle-loop",
      nativeReadiness: "hybrid-native-plus-residual-crops",
      nodeCount: 4,
      connectorCount: 2,
      visualAtomCount: 8,
      targetMotifs: ["arc-arrow"],
      componentStrategy: {
        templateFamily: "relationship",
        targetMotifs: ["arc-arrow"]
      }
    }
  }, [{
    sourceProvider: "islide",
    kind: "presentation-template",
    id: "islide-applied-arc-arrow",
    title: "圆弧箭头循环组件",
    reuseHint: "applied-component",
    candidateScore: 43,
    roleTags: ["applied-component", "editable"],
    structureSignature: {
      primaryKind: "cycle-loop",
      motifs: ["arc-arrow"],
      shapeCount: 14,
      connectorCount: 2,
      textBoxCount: 0
    },
    learningSummary: {
      signals: ["multi-part-component-groups"]
    }
  }]);

  assert.equal(result.mode, "plugin-component-template");
  assert.equal(result.bestCandidate.sourceProvider, "islide");
  assert.equal(result.bestCandidate.structureSignature.primaryKind, "cycle-loop");
  assert.ok(result.bestCandidate.structureAlignmentScore >= 0.9);
  assert.equal(result.editableExpectation, "structure-matched-plugin-template-after-download");
  assert.match(result.reason, /structure signature aligns/);
  assert.equal(_private.isEditableComponentCandidate(result.bestCandidate), true);
});

test("component render strategy does not promote unaligned iSlide components as templates", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.18,
    layerType: "diagram-zone",
    recommendedAction: "split-native-with-residual-crop",
    diagramUnderstanding: {
      archetype: "flow-card-chain",
      nativeReadiness: "hybrid-native-plus-residual-crops",
      nodeCount: 5,
      connectorCount: 4,
      visualAtomCount: 9,
      targetMotifs: ["linear-arrow-chain"],
      componentStrategy: {
        templateFamily: "process-chain",
        targetMotifs: ["linear-arrow-chain"]
      }
    }
  }, [{
    sourceProvider: "islide",
    kind: "presentation-template",
    id: "islide-radial-mismatch",
    title: "中心辐射关系图",
    reuseHint: "applied-component",
    candidateScore: 44,
    roleTags: ["applied-component", "editable"],
    structureSignature: {
      primaryKind: "hub-spoke",
      motifs: ["radial-link"],
      shapeCount: 12,
      connectorCount: 6
    }
  }]);

  assert.notEqual(result.mode, "plugin-component-template");
  assert.equal(_private.componentStructureAlignmentScore({
    layerType: "diagram-zone",
    diagramUnderstanding: {
      archetype: "flow-card-chain",
      targetMotifs: ["linear-arrow-chain"],
      componentStrategy: { templateFamily: "process-chain" }
    }
  }, {
    sourceProvider: "islide",
    kind: "presentation-template",
    reuseHint: "applied-component",
    roleTags: ["applied-component"],
    structureSignature: { primaryKind: "hub-spoke", motifs: ["radial-link"] }
  }), 0);
});

test("component render strategy carries layer target motifs into OfficePLUS component candidates", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.24,
    layerType: "diagram-zone",
    templateFamily: "process-chain",
    plan: {
      targetMotifs: ["linear-arrow-chain"],
      structureSignature: { primaryKind: "process-chain" }
    },
    diagramUnderstanding: {
      archetype: "process-chain",
      nativeReadiness: "hybrid-native-plus-residual-crops",
      nodeCount: 4,
      connectorCount: 3,
      visualAtomCount: 8,
      componentStrategy: {
        templateFamily: "process-chain",
        targetMotifs: ["linear-arrow-chain"]
      }
    }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-3611",
    title: "渐变4项流程箭头",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 72,
    structureSignature: { primaryKind: "", motifs: [] }
  }]);

  assert.equal(result.mode, "plugin-component-template");
  assert.deepEqual(result.targetMotifs, ["linear-arrow-chain"]);
  assert.deepEqual(result.applicationPlan.targetMotifs, ["linear-arrow-chain"]);
  assert.deepEqual(result.bestCandidate.targetMotifs, ["linear-arrow-chain"]);
  assert.deepEqual(result.bestCandidate.structureSignature.motifs, ["linear-arrow-chain"]);
});

test("component render strategy prefers structure-aligned components with matching scale", () => {
  const layer = {
    areaRatio: 0.26,
    layerType: "diagram-zone",
    templateFamily: "process-chain",
    targetMotifs: ["linear-arrow-chain"],
    diagramUnderstanding: {
      archetype: "process-chain",
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 8,
      nodeCount: 4,
      connectorCount: 3,
      targetMotifs: ["linear-arrow-chain"],
      componentStrategy: {
        templateFamily: "process-chain",
        targetMotifs: ["linear-arrow-chain"]
      }
    }
  };
  const result = recommendComponentRenderStrategy(layer, [
    {
      sourceProvider: "officeplus",
      kind: "component",
      id: "two-step-process-too-small",
      title: "2项流程箭头",
      reuseHint: "candidate-grouped-pptx-component",
      candidateScore: 94,
      structureSignature: {
        primaryKind: "process-chain",
        motifs: ["linear-arrow-chain"],
        shapeCount: 3,
        connectorCount: 1
      }
    },
    {
      sourceProvider: "officeplus",
      kind: "component",
      id: "four-step-process-fit",
      title: "4项流程箭头",
      reuseHint: "candidate-grouped-pptx-component",
      candidateScore: 76,
      structureSignature: {
        primaryKind: "process-chain",
        motifs: ["linear-arrow-chain"],
        shapeCount: 8,
        connectorCount: 3
      }
    }
  ]);

  assert.equal(result.mode, "plugin-component-template");
  assert.equal(result.bestCandidate.id, "four-step-process-fit");
  assert.ok(result.bestCandidate.structureAlignmentScore > 0.9);
  assert.ok(_private.componentStructureAlignmentScore(layer, {
    sourceProvider: "officeplus",
    kind: "component",
    reuseHint: "candidate-grouped-pptx-component",
    structureSignature: {
      primaryKind: "process-chain",
      motifs: ["linear-arrow-chain"],
      shapeCount: 3,
      connectorCount: 1
    }
  }) < result.bestCandidate.structureAlignmentScore);
  assert.equal(_private.componentStructureScaleScore(
    _private.componentLayerStructureSignature(layer),
    result.bestCandidate.structureSignature
  ), 1);
});

test("component render strategy prefers components with matching text slot scale", () => {
  const layer = {
    areaRatio: 0.28,
    layerType: "diagram-zone",
    templateFamily: "process-chain",
    targetMotifs: ["linear-arrow-chain"],
    diagramUnderstanding: {
      archetype: "process-chain",
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 8,
      nodeCount: 4,
      connectorCount: 3,
      textSlotCount: 4,
      targetMotifs: ["linear-arrow-chain"],
      componentStrategy: {
        templateFamily: "process-chain",
        targetMotifs: ["linear-arrow-chain"]
      }
    }
  };
  const result = recommendComponentRenderStrategy(layer, [
    {
      sourceProvider: "islide",
      kind: "presentation-template",
      id: "one-caption-flow",
      title: "4项流程箭头装饰",
      reuseHint: "applied-component",
      candidateScore: 93,
      roleTags: ["applied-component", "editable"],
      structureSignature: {
        primaryKind: "process-chain",
        motifs: ["linear-arrow-chain"],
        shapeCount: 8,
        connectorCount: 3,
        textSlotCount: 1
      }
    },
    {
      sourceProvider: "islide",
      kind: "presentation-template",
      id: "four-caption-flow",
      title: "4项流程箭头带说明",
      reuseHint: "applied-component",
      candidateScore: 78,
      roleTags: ["applied-component", "editable"],
      structureSignature: {
        primaryKind: "process-chain",
        motifs: ["linear-arrow-chain"],
        shapeCount: 8,
        connectorCount: 3,
        textSlotCount: 4
      }
    }
  ]);

  assert.equal(result.mode, "plugin-component-template");
  assert.equal(result.bestCandidate.id, "four-caption-flow");
  assert.equal(result.bestCandidate.structureSignature.textBoxCount, 4);
  assert.equal(_private.componentLayerStructureSignature(layer).textBoxCount, 4);
  assert.equal(_private.componentStructureScaleScore(
    _private.componentLayerStructureSignature(layer),
    result.bestCandidate.structureSignature
  ), 1);
});

test("component render strategy prefers matrix components with matching rows and columns", () => {
  const layer = {
    areaRatio: 0.34,
    layerType: "diagram-zone",
    templateFamily: "matrix",
    targetMotifs: ["card-grid"],
    diagramUnderstanding: {
      archetype: "matrix-or-grid",
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 9,
      nodeCount: 9,
      connectorCount: 0,
      textSlotCount: 9,
      targetMotifs: ["card-grid"],
      structureSignature: {
        layout: "grid",
        stepCount: 9,
        rows: 3,
        columns: 3
      },
      componentStrategy: {
        templateFamily: "matrix",
        targetMotifs: ["card-grid"]
      }
    }
  };
  const result = recommendComponentRenderStrategy(layer, [
    {
      sourceProvider: "officeplus",
      kind: "component",
      id: "two-by-two-matrix-too-small",
      title: "2x2卡片矩阵",
      reuseHint: "candidate-grouped-pptx-component",
      candidateScore: 94,
      structureSignature: {
        primaryKind: "matrix",
        layout: "grid",
        motifs: ["card-grid"],
        shapeCount: 4,
        textSlotCount: 4,
        stepCount: 4,
        rows: 2,
        columns: 2
      }
    },
    {
      sourceProvider: "officeplus",
      kind: "component",
      id: "three-by-three-matrix-fit",
      title: "3x3卡片矩阵",
      reuseHint: "candidate-grouped-pptx-component",
      candidateScore: 74,
      structureSignature: {
        primaryKind: "matrix",
        layout: "grid",
        motifs: ["card-grid"],
        shapeCount: 9,
        textSlotCount: 9,
        stepCount: 9,
        rows: 3,
        columns: 3
      }
    }
  ]);

  assert.equal(result.mode, "plugin-component-template");
  assert.equal(result.bestCandidate.id, "three-by-three-matrix-fit");
  assert.equal(result.bestCandidate.structureSignature.rows, 3);
  assert.equal(result.bestCandidate.structureSignature.columns, 3);
  assert.equal(result.bestCandidate.structureSignature.stepCount, 9);
  assert.equal(_private.componentStructureScaleScore(
    _private.componentLayerStructureSignature(layer),
    result.bestCandidate.structureSignature
  ), 1);
});

test("component render strategy prefers components with matching layout direction", () => {
  const layer = {
    areaRatio: 0.28,
    layerType: "diagram-zone",
    templateFamily: "process-chain",
    targetMotifs: ["linear-arrow-chain"],
    diagramUnderstanding: {
      archetype: "process-chain",
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 8,
      nodeCount: 4,
      connectorCount: 3,
      textSlotCount: 4,
      targetMotifs: ["linear-arrow-chain"],
      structureSignature: {
        layout: "vertical-process",
        direction: "top-to-bottom",
        stepCount: 4,
        rows: 4,
        columns: 1
      },
      componentStrategy: {
        templateFamily: "process-chain",
        targetMotifs: ["linear-arrow-chain"]
      }
    }
  };
  const result = recommendComponentRenderStrategy(layer, [
    {
      sourceProvider: "islide",
      kind: "presentation-template",
      id: "horizontal-process-wrong-direction",
      title: "4项横向流程箭头",
      reuseHint: "applied-component",
      candidateScore: 94,
      roleTags: ["applied-component", "editable"],
      structureSignature: {
        primaryKind: "process-chain",
        layout: "linear-process",
        direction: "left-to-right",
        motifs: ["linear-arrow-chain"],
        shapeCount: 8,
        connectorCount: 3,
        textSlotCount: 4,
        stepCount: 4,
        rows: 1,
        columns: 4
      }
    },
    {
      sourceProvider: "islide",
      kind: "presentation-template",
      id: "vertical-process-fit",
      title: "4项纵向流程箭头",
      reuseHint: "applied-component",
      candidateScore: 76,
      roleTags: ["applied-component", "editable"],
      structureSignature: {
        primaryKind: "process-chain",
        layout: "vertical-process",
        direction: "top-to-bottom",
        motifs: ["linear-arrow-chain"],
        shapeCount: 8,
        connectorCount: 3,
        textSlotCount: 4,
        stepCount: 4,
        rows: 4,
        columns: 1
      }
    }
  ]);

  assert.equal(result.mode, "plugin-component-template");
  assert.equal(result.bestCandidate.id, "vertical-process-fit");
  assert.equal(result.bestCandidate.structureSignature.layout, "vertical-process");
  assert.equal(result.bestCandidate.structureSignature.direction, "top-to-bottom");
  assert.equal(_private.componentStructureLayoutScore(
    _private.componentLayerStructureSignature(layer),
    result.bestCandidate.structureSignature
  ), 1);
  assert.ok(_private.componentStructureAlignmentScore(layer, {
    sourceProvider: "islide",
    kind: "presentation-template",
    reuseHint: "applied-component",
    roleTags: ["applied-component", "editable"],
    structureSignature: {
      primaryKind: "process-chain",
      layout: "linear-process",
      direction: "left-to-right",
      motifs: ["linear-arrow-chain"],
      shapeCount: 8,
      connectorCount: 3,
      textSlotCount: 4,
      stepCount: 4,
      rows: 1,
      columns: 4
    }
  }) < result.bestCandidate.structureAlignmentScore);
});

test("component render strategy helper confidence clamps scores", () => {
  assert.equal(_private.candidateConfidence({ candidateScore: 120 }), 0.95);
  assert.equal(_private.candidateConfidence({ candidateScore: -10 }), 0);
  assert.equal(_private.candidateConfidence(null), 0);
});

test("component render strategy lets expression policy repair preserve visual assets over strong templates", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.24,
    layerType: "diagram-zone",
    recommendedAction: "split-native-with-residual-crop",
    diagramUnderstanding: {
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 9,
      componentStrategy: { templateFamily: "process-chain", targetMotifs: ["linear-arrow-chain"] }
    }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-3611",
    title: "渐变4项流程箭头",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 92
  }], {
    expressionPolicyRepair: {
      violation: "standalone-asset-over-objectified",
      repair: {
        mode: "preserve-local-crop",
        disableComponentTemplate: true,
        forcePreserveLocalCrop: true,
        reason: "Standalone icon/illustration/example assets should remain one movable crop."
      }
    }
  });

  assert.equal(result.mode, "preserve-local-crop");
  assert.equal(result.expressionPolicyRepairApplied, true);
  assert.equal(result.componentTemplateDisabledByExpressionPolicy, true);
  assert.equal(result.bestCandidate.id, "MatlComponentContent-3611");
  assert.match(result.reason, /Standalone/);
});

test("component render strategy keeps obvious infographic icon diagrams as single crops", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.18,
    layerType: "diagram-zone",
    expressionSubtype: "infographic 图标图示 素材图示",
    recommendedAction: "split-native-with-residual-crop",
    diagramUnderstanding: {
      nativeReadiness: "preserve-crop",
      visualAtomCount: 6,
      residualCount: 5
    }
  }, [{
    sourceProvider: "islide",
    kind: "component",
    id: "icon-diagram-asset",
    title: "图标图示信息图",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 94
  }]);

  assert.equal(result.mode, "preserve-local-crop");
  assert.equal(result.expressionPolicy.kind, "standalone-visual-asset");
  assert.equal(result.expressionPolicy.minimumUnitPolicy, "preserve-as-single-crop");
});

test("component render strategy preserves asset-dominated flow examples instead of over-splitting atoms", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.22,
    layerType: "diagram-zone",
    expressionForm: "icon-or-illustration",
    expressionSubtype: "iSlide 组件预览 图示样例 流程 箭头 素材图示",
    detector: "plugin-cycle-arrow-component-preview",
    recommendedAction: "split-native-with-residual-crop",
    diagramUnderstanding: {
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 9,
      nodeCount: 2,
      connectorCount: 2,
      residualCount: 5,
      componentStrategy: {
        templateFamily: "process-chain",
        targetMotifs: ["linear-arrow-chain"]
      }
    }
  }, [{
    sourceProvider: "islide",
    kind: "component",
    id: "flow-example-preview",
    title: "流程箭头素材图示",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 96,
    structureSignature: {
      primaryKind: "process-chain",
      motifs: ["linear-arrow-chain"]
    }
  }]);

  assert.equal(result.mode, "preserve-local-crop");
  assert.equal(result.expressionPolicy.kind, "standalone-visual-asset");
  assert.equal(result.expressionPolicy.minimumUnitPolicy, "preserve-as-single-crop");
  assert.ok(result.expressionPolicy.reasons.includes("asset-dominated-diagram-example-preserved"));
  assert.equal(result.applicationPlan.preservesFidelityNow, true);
});

test("component render strategy still rebuilds structured dashboard charts", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.36,
    layerType: "diagram-zone",
    expressionSubtype: "dashboard bar-chart 看板 图表",
    recommendedAction: "replace-with-native-components",
    diagramUnderstanding: {
      nativeReadiness: "native-rebuild",
      visualAtomCount: 14,
      nodeCount: 4,
      connectorCount: 2,
      componentStrategy: { templateFamily: "matrix", targetMotifs: ["dashboard-card-grid"] }
    }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "dashboard-grid-template",
    title: "数据看板图表",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 76
  }]);

  assert.notEqual(result.mode, "preserve-local-crop");
  assert.equal(result.expressionPolicy.kind, "structured-native");
  assert.equal(result.expressionPolicy.minimumUnitPolicy, "rebuild-semantic-structure");
});

test("component render strategy accepts structure-aligned pie chart components", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.24,
    layerType: "chart-zone",
    expressionForm: "chart-snapshot",
    expressionSubtype: "pie chart 饼图 扇区占比",
    recommendedAction: "replace-with-native-components",
    targetMotifs: ["pie-share-chart"],
    diagramUnderstanding: {
      archetype: "pie-chart",
      nativeReadiness: "native-rebuild",
      visualAtomCount: 4,
      targetMotifs: ["pie-share-chart"],
      componentStrategy: { templateFamily: "pie-chart", targetMotifs: ["pie-share-chart"] }
    }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "pie-chart-component",
    title: "四扇区饼图组件",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 74,
    structureSignature: {
      primaryKind: "pie-chart",
      motifs: ["pie-share-chart"]
    }
  }]);

  assert.equal(result.mode, "plugin-component-template");
  assert.equal(result.bestCandidate.id, "pie-chart-component");
  assert.deepEqual(result.targetMotifs, ["pie-share-chart"]);
  assert.deepEqual(result.bestCandidate.targetMotifs, ["pie-share-chart"]);
});

test("component render strategy prefers candidates from the same expression family", () => {
  const layer = {
    areaRatio: 0.24,
    layerType: "chart-zone",
    expressionForm: "chart-snapshot",
    expressionSubtype: "pie chart 饼图 扇区占比",
    recommendedAction: "replace-with-native-components",
    targetMotifs: ["pie-share-chart"],
    diagramUnderstanding: {
      archetype: "pie-chart",
      expressionFamily: "data-chart",
      nativeReadiness: "native-rebuild",
      visualAtomCount: 4,
      targetMotifs: ["pie-share-chart"],
      componentStrategy: { templateFamily: "pie-chart", targetMotifs: ["pie-share-chart"] },
      structureSignature: {
        primaryKind: "pie-chart",
        expressionFamily: "data-chart",
        layout: "pie-chart"
      }
    }
  };
  const result = recommendComponentRenderStrategy(layer, [
    {
      sourceProvider: "islide",
      kind: "presentation-template",
      id: "decorative-process-pie-lookalike",
      title: "饼图环形流程装饰组件",
      reuseHint: "applied-component",
      candidateScore: 94,
      roleTags: ["applied-component", "editable"],
      structureSignature: {
        primaryKind: "pie-chart",
        expressionFamily: "structured-process",
        layout: "pie-chart",
        motifs: ["pie-share-chart"]
      }
    },
    {
      sourceProvider: "officeplus",
      kind: "component",
      id: "data-chart-pie-fit",
      title: "四扇区饼图数据组件",
      reuseHint: "candidate-grouped-pptx-component",
      candidateScore: 76,
      structureSignature: {
        primaryKind: "pie-chart",
        expressionFamily: "data-chart",
        layout: "pie-chart",
        motifs: ["pie-share-chart"]
      }
    }
  ]);

  assert.equal(result.mode, "plugin-component-template");
  assert.equal(result.bestCandidate.id, "data-chart-pie-fit");
  assert.equal(result.bestCandidate.structureSignature.expressionFamily, "data-chart");
  assert.equal(_private.componentLayerStructureSignature(layer).expressionFamily, "data-chart");
  assert.ok(_private.componentStructureAlignmentScore(layer, {
    sourceProvider: "islide",
    kind: "presentation-template",
    reuseHint: "applied-component",
    roleTags: ["applied-component", "editable"],
    structureSignature: {
      primaryKind: "pie-chart",
      expressionFamily: "structured-process",
      layout: "pie-chart",
      motifs: ["pie-share-chart"]
    }
  }) < result.bestCandidate.structureAlignmentScore);
});

test("component render strategy lets repair reclassify oversized protected diagrams into plugin templates", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.42,
    layerType: "diagram-zone",
    expressionForm: "icon-or-illustration",
    expressionSubtype: "infographic 图标图示 process diagram",
    recommendedAction: "preserve-local-crop",
    targetMotifs: ["linear-arrow-chain"],
    diagramUnderstanding: {
      archetype: "process-chain",
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 8,
      nodeCount: 4,
      connectorCount: 3,
      targetMotifs: ["linear-arrow-chain"],
      componentStrategy: {
        templateFamily: "process-chain",
        targetMotifs: ["linear-arrow-chain"]
      }
    }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "repair-process-template",
    title: "流程箭头组件",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 76,
    structureSignature: {
      primaryKind: "process-chain",
      motifs: ["linear-arrow-chain"]
    }
  }], {
    expressionPolicyRepair: {
      violation: "oversized-protected-diagram-crop",
      repair: {
        mode: "reclassify-structural-diagram-or-component-template",
        disableComponentTemplate: false,
        forcePreserveLocalCrop: false,
        allowNativeOverlays: true,
        requireSemanticStructureEvidence: true,
        reason: "Large protected crop should be parsed into semantic components."
      }
    }
  });

  assert.equal(result.mode, "plugin-component-template");
  assert.equal(result.expressionPolicyRepairApplied, true);
  assert.equal(result.componentTemplateDisabledByExpressionPolicy, false);
  assert.equal(result.expressionPolicyRepair.mode, "reclassify-structural-diagram-or-component-template");
  assert.equal(result.bestCandidate.id, "repair-process-template");
});

test("component render strategy applies actionable visual unit repair only through structure evidence", () => {
  const structural = recommendComponentRenderStrategy({
    areaRatio: 0.38,
    layerType: "diagram-zone",
    expressionForm: "unknown",
    expressionSubtype: "cycle-arrow visual unit",
    detector: "unknown-large-visual-unit-crop",
    recommendedAction: "preserve-local-crop",
    targetMotifs: ["arc-arrow"],
    diagramUnderstanding: {
      archetype: "cycle-loop",
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 9,
      nodeCount: 4,
      connectorCount: 2,
      targetMotifs: ["arc-arrow"],
      componentStrategy: {
        templateFamily: "cycle-loop",
        targetMotifs: ["arc-arrow"]
      }
    }
  }, [{
    sourceProvider: "islide",
    kind: "presentation-template",
    id: "visual-unit-cycle-template",
    title: "圆弧箭头循环组件",
    reuseHint: "applied-component",
    candidateScore: 78,
    structureSignature: {
      primaryKind: "cycle-loop",
      motifs: ["arc-arrow"]
    }
  }], {
    expressionPolicyRepair: {
      violation: "actionable-unexplained-visual-unit-crop",
      repair: {
        mode: "classify-visual-unit-then-rebuild-or-protect",
        disableComponentTemplate: false,
        forcePreserveLocalCrop: false,
        allowNativeOverlays: true,
        requireSemanticStructureEvidence: true,
        reason: "Unknown visual unit should be classified before preserving a large crop."
      }
    }
  });

  const icon = recommendComponentRenderStrategy({
    areaRatio: 0.2,
    layerType: "illustration-zone",
    expressionForm: "icon-or-illustration",
    expressionSubtype: "图标图示 素材图示",
    detector: "plugin-icon-visual-unit-crop",
    recommendedAction: "preserve-local-crop",
    diagramUnderstanding: {
      archetype: "cycle-loop",
      nativeReadiness: "preserve-crop",
      visualAtomCount: 2,
      nodeCount: 0,
      connectorCount: 0
    }
  }, [{
    sourceProvider: "islide",
    kind: "presentation-template",
    id: "unsafe-icon-template",
    title: "图标图示组件",
    reuseHint: "applied-component",
    candidateScore: 90
  }], {
    expressionPolicyRepair: {
      violation: "actionable-unexplained-visual-unit-crop",
      repair: {
        mode: "classify-visual-unit-then-rebuild-or-protect",
        disableComponentTemplate: false,
        forcePreserveLocalCrop: false,
        requireSemanticStructureEvidence: true
      }
    }
  });

  assert.equal(structural.mode, "plugin-component-template");
  assert.equal(structural.expressionPolicyRepairApplied, true);
  assert.equal(structural.expressionPolicyRepair.mode, "classify-visual-unit-then-rebuild-or-protect");
  assert.equal(structural.bestCandidate.id, "visual-unit-cycle-template");
  assert.equal(icon.mode, "preserve-local-crop");
  assert.equal(icon.editableExpectation, "standalone-visual-asset-preserved-as-movable-crop");
  assert.equal(icon.expressionPolicyRepairApplied, true);
});

test("component render strategy accepts unresolved plugin reference repair without bypassing asset protection", () => {
  const structural = recommendComponentRenderStrategy({
    areaRatio: 0.36,
    layerType: "diagram-zone",
    expressionForm: "complex-diagram",
    expressionSubtype: "cycle relationship diagram",
    detector: "component-reference-crop",
    recommendedAction: "preserve-crop-with-component-reference",
    targetMotifs: ["arc-arrow"],
    diagramUnderstanding: {
      archetype: "cycle-loop",
      nativeReadiness: "hybrid-native-plus-residual-crops",
      visualAtomCount: 8,
      nodeCount: 4,
      connectorCount: 2,
      componentStrategy: {
        templateFamily: "cycle-loop",
        targetMotifs: ["arc-arrow"]
      }
    }
  }, [{
    sourceProvider: "islide",
    kind: "presentation-template",
    id: "applied-cycle-reference",
    title: "圆弧箭头循环组件",
    reuseHint: "applied-component",
    candidateScore: 82,
    structureSignature: {
      primaryKind: "cycle-loop",
      motifs: ["arc-arrow"]
    }
  }], {
    expressionPolicyRepair: {
      violation: "unresolved-component-reference-crop",
      repair: {
        mode: "apply-real-plugin-component-or-specialized-native-rebuilder",
        disableComponentTemplate: false,
        forcePreserveLocalCrop: false,
        allowNativeOverlays: true,
        requireSemanticStructureEvidence: true,
        prioritizePluginTemplateReplacement: true
      }
    }
  });

  const icon = recommendComponentRenderStrategy({
    areaRatio: 0.18,
    layerType: "illustration-zone",
    expressionForm: "icon-or-illustration",
    expressionSubtype: "plugin arrow icon 图标图示",
    detector: "plugin-arrow-icon-reference-crop",
    recommendedAction: "preserve-crop-with-component-reference",
    diagramUnderstanding: {
      archetype: "cycle-loop",
      nativeReadiness: "preserve-crop",
      visualAtomCount: 2,
      nodeCount: 0,
      connectorCount: 0
    }
  }, [{
    sourceProvider: "islide",
    kind: "presentation-template",
    id: "unsafe-icon-reference",
    title: "箭头图标素材",
    reuseHint: "applied-component",
    candidateScore: 92
  }], {
    expressionPolicyRepair: {
      violation: "unresolved-component-reference-crop",
      repair: {
        mode: "apply-real-plugin-component-or-specialized-native-rebuilder",
        disableComponentTemplate: false,
        forcePreserveLocalCrop: false,
        requireSemanticStructureEvidence: true,
        prioritizePluginTemplateReplacement: true
      }
    }
  });

  assert.equal(structural.mode, "plugin-component-template");
  assert.equal(structural.expressionPolicyRepairApplied, true);
  assert.equal(structural.expressionPolicyRepair.mode, "apply-real-plugin-component-or-specialized-native-rebuilder");
  assert.equal(structural.bestCandidate.id, "applied-cycle-reference");
  assert.equal(icon.mode, "preserve-local-crop");
  assert.equal(icon.expressionPolicyRepairApplied, true);
  assert.equal(icon.editableExpectation, "standalone-visual-asset-preserved-as-movable-crop");
});

test("component render strategy does not let repair reclassify screenshots into plugin templates", () => {
  const result = recommendComponentRenderStrategy({
    areaRatio: 0.48,
    layerType: "screenshot-zone",
    expressionForm: "screenshot-or-document",
    expressionSubtype: "ui-screenshot",
    detector: "product-screenshot-crop",
    recommendedAction: "preserve-local-crop",
    diagramUnderstanding: {
      archetype: "process-chain",
      nativeReadiness: "preserve-crop",
      visualAtomCount: 8,
      nodeCount: 4,
      connectorCount: 3,
      componentStrategy: {
        templateFamily: "process-chain",
        targetMotifs: ["linear-arrow-chain"]
      }
    }
  }, [{
    sourceProvider: "officeplus",
    kind: "component",
    id: "unsafe-screenshot-template",
    title: "流程箭头组件",
    reuseHint: "candidate-grouped-pptx-component",
    candidateScore: 96,
    structureSignature: {
      primaryKind: "process-chain",
      motifs: ["linear-arrow-chain"]
    }
  }], {
    expressionPolicyRepair: {
      violation: "oversized-protected-diagram-crop",
      repair: {
        mode: "reclassify-structural-diagram-or-component-template",
        disableComponentTemplate: false,
        forcePreserveLocalCrop: false,
        reason: "Large protected crop should be parsed into semantic components."
      }
    }
  });

  assert.notEqual(result.mode, "plugin-component-template");
  assert.equal(result.expressionPolicyRepairApplied, true);
  assert.equal(result.componentTemplateDisabledByExpressionPolicy, false);
  assert.match(result.editableExpectation, /screenshot|raster/);
});
