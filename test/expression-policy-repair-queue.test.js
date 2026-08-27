"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildExpressionPolicyRepairQueue,
  collectBatchNativeAuditRepairActions,
  collectExpressionPolicyRepairActions,
  collectQualityMatrixRepairActions,
  inferImageOrdinal,
  parseArgs,
  renderRepairQueueMarkdown
} = require("../skills/pd-hifi-slideclone/scripts/expression-policy-repair-queue");

test("expression policy repair queue parses bounded CLI args", () => {
  const args = parseArgs([
    "node",
    "expression-policy-repair-queue.js",
    "--coverage-matrix",
    "coverage.json",
    "--quality-matrix",
    "quality.json",
    "--out",
    "repair.json",
    "--markdown-out",
    "repair.md",
    "--max-actions",
    "3"
  ]);

  assert.equal(args.coverageMatrix, "coverage.json");
  assert.equal(args.batchNativeAudit, "");
  assert.equal(args.qualityMatrix, "quality.json");
  assert.equal(args.out, "repair.json");
  assert.equal(args.markdownOut, "repair.md");
  assert.equal(args.maxActions, 3);
});

test("expression policy repair queue converts quality matrix actionable retained crops into repair actions", () => {
  const qualityMatrix = {
    rows: [{
      deck: "Deck_Q",
      componentTemplateCropStatusTopActionableReasons: [{
        reason: "component-template-crop-no-decision",
        count: 2,
        examples: [{
          pageIndex: 2,
          imageId: "native-graphic-0",
          detector: "structured-case-graphic-underlay-crop",
          reason: "component-template-crop-no-decision",
          family: "matrix",
          box: { x: 40, y: 100, w: 780, h: 300 }
        }, {
          pageIndex: 4,
          imageId: "native-graphic-sparse-diagram-underlay",
          detector: "sparse-diagram-graphic-underlay-crop",
          reason: "component-template-crop-no-decision",
          family: "process-chain"
        }]
      }]
    }]
  };

  const actions = collectQualityMatrixRepairActions(qualityMatrix);
  const queue = buildExpressionPolicyRepairQueue({}, {
    qualityMatrix,
    sourceQualityMatrix: "quality.json"
  });

  assert.equal(actions.length, 2);
  assert.equal(actions[0].deck, "Deck_Q");
  assert.equal(actions[0].page, 3);
  assert.equal(actions[0].image, 1);
  assert.equal(actions[0].imageId, "native-graphic-0");
  assert.equal(actions[0].violation, "actionable-component-template-retained-crop");
  assert.equal(actions[0].repair.mode, "reclassify-structural-diagram-or-component-template");
  assert.equal(actions[0].repair.prioritizePluginTemplateReplacement, true);
  assert.equal(actions[1].image, 1);
  assert.equal(queue.sourceQualityMatrix, "quality.json");
  assert.deepEqual(queue.summary.byViolation, {
    "actionable-component-template-retained-crop": 2
  });
});

test("expression policy repair queue prefers structured repair candidates from quality matrix", () => {
  const qualityMatrix = {
    totals: {
      topComponentTemplateRepairCandidates: [{
        deck: "Deck_Q",
        pageIndex: 3,
        imageId: "native-graphic-underlay",
        priority: 88,
        detector: "foreground-graphic-underlay-crop",
        reason: "component-template-overlay-suppressed-because-source-crop-remains-required",
        expressionForm: "table-or-matrix",
        expressionSubtype: "table-grid",
        layerType: "table-zone",
        recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
        family: "matrix",
        componentId: "MatlComponentContent-20568",
        componentTitle: "扁平3项箭头矩阵",
        sourceProvider: "officeplus",
        targetMotifs: ["card-grid", "linear-arrow-chain"],
        box: { x: 247.78, y: 85.88, w: 464.07, h: 427.13 },
        areaRatio: 0.3824
      }]
    },
    rows: [{
      deck: "Deck_Q",
      componentTemplateCropStatusTopActionableReasons: [{
        reason: "component-template-overlay-suppressed-because-source-crop-remains-required",
        count: 1,
        examples: [{
          pageIndex: 3,
          imageId: "native-graphic-underlay",
          detector: "foreground-graphic-underlay-crop",
          reason: "component-template-overlay-suppressed-because-source-crop-remains-required",
          family: "matrix"
        }]
      }]
    }]
  };

  const actions = collectQualityMatrixRepairActions(qualityMatrix);
  const queue = buildExpressionPolicyRepairQueue({}, { qualityMatrix });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].page, 4);
  assert.equal(actions[0].priority, 88);
  assert.equal(actions[0].componentId, "MatlComponentContent-20568");
  assert.equal(actions[0].componentTitle, "扁平3项箭头矩阵");
  assert.equal(actions[0].candidateTitle, "扁平3项箭头矩阵");
  assert.equal(actions[0].sourceProvider, "officeplus");
  assert.equal(actions[0].templateFamily, "matrix");
  assert.deepEqual(actions[0].targetMotifs, ["card-grid", "linear-arrow-chain"]);
  assert.equal(actions[0].repair.componentId, "MatlComponentContent-20568");
  assert.deepEqual(actions[0].repair.targetMotifs, ["card-grid", "linear-arrow-chain"]);
  assert.equal(queue.summary.actions, 1);
});

test("expression policy repair queue converts actionable visual unit candidates from quality matrix", () => {
  const qualityMatrix = {
    totals: {
      topVisualUnitRepairCandidates: [{
        deck: "Deck_U",
        pageIndex: 4,
        imageId: "unknown-cycle-arrow-crop",
        detector: "unknown-full-page",
        reason: "manual-review-before-native-rebuild",
        expressionForm: "unknown-visual",
        expressionSubtype: "cycle arrow diagram",
        recommendedAction: "manual-review-before-native-rebuild",
        areaRatio: 0.41
      }]
    }
  };

  const actions = collectQualityMatrixRepairActions(qualityMatrix);
  const queue = buildExpressionPolicyRepairQueue({}, {
    qualityMatrix,
    sourceQualityMatrix: "quality-matrix.json"
  });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].deck, "Deck_U");
  assert.equal(actions[0].page, 5);
  assert.equal(actions[0].imageId, "unknown-cycle-arrow-crop");
  assert.equal(actions[0].violation, "actionable-unexplained-visual-unit-crop");
  assert.equal(actions[0].templateFamily, "cycle-arrow");
  assert.deepEqual(actions[0].targetMotifs, ["arc-arrow"]);
  assert.equal(actions[0].repair.mode, "classify-visual-unit-then-rebuild-or-protect");
  assert.equal(actions[0].repair.requireSemanticStructureEvidence, true);
  assert.equal(actions[0].repair.forcePreserveLocalCrop, false);
  assert.deepEqual(queue.summary.byViolation, {
    "actionable-unexplained-visual-unit-crop": 1
  });
});

test("expression policy repair queue does not requeue protected non-semantic visual assets", () => {
  const qualityMatrix = {
    totals: {
      protectedNonSemanticSkips: 3,
      topComponentTemplateRepairCandidates: [{
        deck: "Deck_P",
        pageIndex: 1,
        imageId: "plugin-icon-preview-crop",
        reason: "preserve-local-crop",
        expressionPolicy: {
          kind: "standalone-visual-asset",
          unitDisposition: "intentional-visual-crop"
        },
        componentTitle: "icon preview"
      }, {
        deck: "Deck_P",
        pageIndex: 1,
        imageId: "native-process-underlay",
        reason: "component-template-overlay-suppressed-because-source-crop-remains-required",
        expressionPolicy: {
          kind: "semantic-diagram",
          unitDisposition: "semantic-native-structure"
        },
        family: "process"
      }],
      topVisualUnitRepairCandidates: [{
        deck: "Deck_P",
        pageIndex: 2,
        imageId: "decorative-shape-crop",
        reason: "protected-non-semantic-crop",
        expressionPolicy: {
          kind: "decorative-texture",
          unitDisposition: "intentional-decorative-crop"
        },
        expressionSubtype: "soft blob"
      }, {
        deck: "Deck_P",
        pageIndex: 3,
        imageId: "unknown-cycle-arrow-crop",
        reason: "manual-review-before-native-rebuild",
        expressionSubtype: "cycle arrow diagram"
      }]
    },
    rows: [{
      deck: "Deck_P",
      componentTemplateCropStatusTopActionableReasons: [{
        reason: "preserve-local-crop",
        count: 1,
        examples: [{
          pageIndex: 4,
          imageId: "standalone-badge-crop",
          expressionPolicy: {
            kind: "standalone-visual-asset",
            unitDisposition: "intentional-visual-crop"
          }
        }]
      }]
    }]
  };

  const actions = collectQualityMatrixRepairActions(qualityMatrix);
  const queue = buildExpressionPolicyRepairQueue({}, { qualityMatrix });

  assert.equal(actions.length, 2);
  assert.deepEqual(actions.map((action) => action.imageId), [
    "native-process-underlay",
    "unknown-cycle-arrow-crop"
  ]);
  assert.deepEqual(queue.summary.byViolation, {
    "actionable-component-template-retained-crop": 1,
    "actionable-unexplained-visual-unit-crop": 1
  });
});

test("expression policy repair queue infers image ordinals from native graphic ids", () => {
  assert.equal(inferImageOrdinal("native-graphic-0"), 1);
  assert.equal(inferImageOrdinal("native-graphic-12"), 13);
  assert.equal(inferImageOrdinal("native-graphic-sparse-diagram-underlay"), 1);
  assert.equal(inferImageOrdinal(3), 3);
});

test("expression policy repair queue accepts batch audit as an input source", () => {
  const args = parseArgs([
    "node",
    "expression-policy-repair-queue.js",
    "--batch-native-audit",
    "batch.json",
    "--out",
    "repair.json"
  ]);

  assert.equal(args.coverageMatrix, "");
  assert.equal(args.batchNativeAudit, "batch.json");
  assert.equal(args.out, "repair.json");
});

test("expression policy repair queue converts coverage violations into repair actions", () => {
  const matrix = {
    totals: {
      expressionPolicyViolations: [{
        deck: "Deck_A",
        page: 4,
        image: 1,
        violation: "screenshot-replaced-by-template",
        layerType: "screenshot-zone",
        detector: "screenshot-process-underlay-crop",
        mode: "plugin-component-template",
        candidateTitle: "渐变6项流程",
        areaRatio: 0.64
      }]
    },
    rows: [{
      deck: "Deck_A",
      expressionPolicyViolations: [{
        page: 4,
        image: 1,
        violation: "screenshot-replaced-by-template",
        layerType: "screenshot-zone",
        detector: "screenshot-process-underlay-crop",
        mode: "plugin-component-template",
        candidateTitle: "渐变6项流程",
        areaRatio: 0.64
      }, {
        page: 5,
        image: 1,
        violation: "standalone-asset-over-objectified",
        layerType: "illustration-zone",
        detector: "cycle-illustration-underlay-crop",
        mode: "plugin-component-template",
        candidateTitle: "扁平6项总分图表关系图",
        areaRatio: 0.61
      }]
    }]
  };

  const actions = collectExpressionPolicyRepairActions(matrix);
  const queue = buildExpressionPolicyRepairQueue(matrix);

  assert.equal(actions.length, 2);
  assert.equal(actions[0].violation, "screenshot-replaced-by-template");
  assert.equal(actions[0].repair.mode, "preserve-crop-with-native-overlays");
  assert.equal(actions[0].repair.allowNativeOverlays, true);
  assert.equal(actions[1].repair.mode, "preserve-local-crop");
  assert.equal(actions[1].repair.disableComponentTemplate, true);
  assert.deepEqual(queue.summary.byViolation, {
    "screenshot-replaced-by-template": 1,
    "standalone-asset-over-objectified": 1
  });
});

test("expression policy repair queue converts actionable residuals into component repair actions", () => {
  const matrix = {
    rows: [{
      deck: "Deck_R",
      actionableResiduals: [{
        page: 9,
        image: 1,
        layerType: "diagram-zone",
        detector: "two-panel-diagram-crop",
        family: "hub-spoke",
        mode: "preserve-crop-with-component-reference",
        candidateTitle: "扁平6项流程图",
        disposition: "native-rebuild-candidate",
        areaRatio: 0.3058,
        box: { x: 18, y: 76, w: 452, h: 350 }
      }]
    }]
  };

  const actions = collectExpressionPolicyRepairActions(matrix);
  const queue = buildExpressionPolicyRepairQueue(matrix);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].violation, "unresolved-component-reference-crop");
  assert.equal(actions[0].repair.mode, "apply-real-plugin-component-or-specialized-native-rebuilder");
  assert.equal(actions[0].repair.prioritizePluginTemplateReplacement, true);
  assert.deepEqual(actions[0].box, { x: 18, y: 76, w: 452, h: 350 });
  assert.deepEqual(queue.summary.byViolation, {
    "unresolved-component-reference-crop": 1
  });
});

test("expression policy repair queue converts batch decision risks into repair actions", () => {
  const batchAudit = {
    decks: [{
      deck: "Deck_C",
      oversizedProtectedCrops: [{
        page: 3,
        image: 2,
        detector: "diagram-cluster-crop",
        expressionForm: "process-diagram",
        expressionSubtype: "cycle-arrow",
        areaRatio: 0.42
      }],
      missingProtectedCropEvidence: [{
        page: 5,
        image: 1,
        detector: "",
        areaRatio: 0.08
      }]
    }]
  };

  const actions = collectBatchNativeAuditRepairActions(batchAudit);
  const queue = buildExpressionPolicyRepairQueue({}, {
    batchNativeAudit: batchAudit,
    sourceBatchAudit: "batch.json"
  });

  assert.equal(actions.length, 2);
  assert.equal(actions[0].violation, "oversized-protected-diagram-crop");
  assert.equal(actions[0].repair.mode, "reclassify-structural-diagram-or-component-template");
  assert.equal(actions[0].repair.forcePreserveLocalCrop, false);
  assert.equal(actions[0].repair.requireSemanticStructureEvidence, true);
  assert.equal(actions[1].violation, "protected-crop-missing-evidence");
  assert.equal(actions[1].repair.mode, "add-expression-policy-evidence");
  assert.equal(queue.sourceBatchAudit, "batch.json");
  assert.deepEqual(queue.summary.byViolation, {
    "oversized-protected-diagram-crop": 1,
    "protected-crop-missing-evidence": 1
  });
});

test("expression policy repair queue preserves slide numbers from batch audit examples", () => {
  const actions = collectBatchNativeAuditRepairActions({
    decks: [{
      deck: "Deck_E",
      oversizedProtectedCrops: [{
        slide: 1,
        imageId: "native-graphic-0",
        detector: "foreground-graphic-crop",
        expressionSubtype: "process-flow",
        areaRatio: 0.42
      }, {
        slide: 14,
        imageId: "native-graphic-0",
        detector: "foreground-graphic-crop",
        expressionSubtype: "process-flow",
        areaRatio: 0.41
      }]
    }]
  });

  assert.equal(actions.length, 2);
  assert.deepEqual(actions.map((action) => action.page), [1, 14]);
});

test("expression policy repair queue combines coverage and batch audit actions by priority", () => {
  const queue = buildExpressionPolicyRepairQueue({
    totals: {
      expressionPolicyViolations: [{
        deck: "Deck_D",
        page: 7,
        image: 1,
        violation: "standalone-asset-over-objectified",
        detector: "decorative-icon-crop"
      }]
    }
  }, {
    batchNativeAudit: {
      decks: [{
        deck: "Deck_D",
        oversizedProtectedCrops: [{
          page: 2,
          image: 1,
          detector: "large-diagram-crop",
          areaRatio: 0.35
        }]
      }]
    }
  });

  assert.equal(queue.actions.length, 2);
  assert.equal(queue.actions[0].violation, "oversized-protected-diagram-crop");
  assert.equal(queue.actions[1].violation, "standalone-asset-over-objectified");
});

test("expression policy repair queue markdown is actionable and bounded", () => {
  const queue = buildExpressionPolicyRepairQueue({
    totals: {
      expressionPolicyViolations: [{
        deck: "Deck_B",
        page: 2,
        image: 1,
        violation: "standalone-asset-over-objectified",
        detector: "plugin-cycle-arrow-illustration-crop",
        mode: "plugin-component-template",
        candidateTitle: "循环箭头"
      }]
    }
  });
  const markdown = renderRepairQueueMarkdown(queue);

  assert.match(markdown, /Expression Policy Repair Queue/);
  assert.match(markdown, /Deck_B p2 image 1/);
  assert.match(markdown, /Repair mode: preserve-local-crop/);
  assert.match(markdown, /Standalone icon\/illustration/);
});
