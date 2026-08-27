"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  auditStructuralNativeReadiness,
  isImageObjectified,
  isProtectedIntentionalCrop,
  scoreStructuralImageCandidate
} = require("../skills/pd-hifi-slideclone/scripts/structural-native-audit");

const slideSize = { widthPt: 960, heightPt: 540 };

test("structural native audit treats objectified generic diagrams as covered", () => {
  const ir = {
    slideSize,
    pages: [{
      images: [{
        id: "native-graphic-0",
        box: { x: 348.99, y: 116.25, w: 563.03, h: 298.88 },
        source: {
          detector: "foreground-graphic-crop",
          expressionForm: "complex-diagram",
          expressionSubtype: "generic-node-diagram",
          genericNodeDiagramSkeletonObjectified: true,
          genericNodeDiagramTextObjectified: true,
          visualAtomOverlayOnly: true,
          layer: {
            layerType: "diagram-zone",
            diagramUnderstanding: {
              archetype: "generic-node-diagram",
              confidence: 0.95,
              nodes: [
                { id: "n1", text: "节点一", box: { x: 390, y: 160, w: 48, h: 18 } },
                { id: "n2", text: "节点二", box: { x: 620, y: 195, w: 48, h: 18 } },
                { id: "n3", text: "节点三", box: { x: 620, y: 325, w: 48, h: 18 } }
              ],
              visualAtoms: [
                { kind: "connector-line-candidate" },
                { kind: "connector-line-candidate" },
                { kind: "grid-line-candidate" },
                { kind: "grid-line-candidate" }
              ]
            }
          }
        }
      }]
    }]
  };

  const report = auditStructuralNativeReadiness(ir);

  assert.equal(report.ok, true);
  assert.equal(report.totals.candidates, 1);
  assert.equal(report.totals.objectified, 1);
  assert.equal(report.candidates[0].status, "objectified");
  assert.equal(isImageObjectified(ir.pages[0].images[0]), true);
});

test("structural native audit probes visual cluster stacks with the correct signature", () => {
  const image = {
    id: "native-graphic-visual-cluster-underlay",
    box: { x: 378.98, y: 149.63, w: 434.46, h: 300.75 },
    source: {
      detector: "visual-cluster-graphic-underlay-crop",
      reason: "multi-part-chart-or-diagram-preserved-as-movable-crop",
      layer: {
        layerType: "chart-zone",
        diagramUnderstanding: {
          archetype: "hub-spoke",
          confidence: 0.95,
          nodes: [
            { id: "portal", text: "统一展示门户", box: { x: 532.67, y: 165.75, w: 111.33, h: 25.5 } },
            { id: "skills", text: "Skills能力网", box: { x: 536.79, y: 247.88, w: 106.08, h: 22.88 } },
            { id: "runtime", text: "运行时引擎", box: { x: 542.79, y: 328.5, w: 92.96, h: 23.63 } },
            { id: "cli", text: "CLI脚手架", box: { x: 542.79, y: 407.63, w: 94.09, h: 25.88 } }
          ],
          visualAtoms: [
            { kind: "native-rect-candidate", box: { x: 385.72, y: 155.63, w: 428.08, h: 46.13 }, color: "#6fb1e2" },
            { kind: "native-rect-candidate", box: { x: 385.72, y: 203.63, w: 428.08, h: 112.13 }, color: "#599fd5" },
            { kind: "native-rect-candidate", box: { x: 385.72, y: 317.25, w: 428.08, h: 46.5 }, color: "#3c84c0" },
            { kind: "native-rect-candidate", box: { x: 385.72, y: 365.63, w: 428.08, h: 79.13 }, color: "#286ca4" }
          ]
        }
      }
    }
  };

  const report = auditStructuralNativeReadiness({ slideSize, pages: [{ images: [image], textBoxes: [] }] });

  assert.equal(report.ok, true);
  assert.equal(report.totals.coveredByProbe, 1);
  assert.equal(report.candidates[0].status, "covered-by-probe");
  assert.ok(report.candidates[0].probe.detectors.includes("visual-cluster-stack"));
  assert.ok(report.candidates[0].probe.shapeCount >= 7);
});

test("structural native audit probes document version fallback instead of flagging it as unsupported", () => {
  const image = {
    id: "version-flow-context-only",
    box: { x: 526, y: 180, w: 376, h: 246 },
    source: {
      detector: "foreground-graphic-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "document-version-folder-flow",
      layer: {
        layerType: "diagram-zone",
        diagramUnderstanding: {
          confidence: 0.66,
          archetype: "unclassified-diagram",
          nodes: [{
            id: "doc",
            text: "库存查询主文档",
            box: { x: 546, y: 301, w: 100, h: 17 },
            kind: "screenshot-or-document-node"
          }]
        }
      }
    }
  };
  const textBoxes = [
    { text: "实战案例：物流WMS「库存查询」", box: { x: 126, y: 71, w: 475, h: 27 } },
    { text: "多增量版本治理", box: { x: 610, y: 73, w: 217, h: 24 } },
    { text: "版本口径漂移", box: { x: 110, y: 210, w: 108, h: 41 } },
    { text: "需求误覆盖", box: { x: 202, y: 293, w: 90, h: 32 } },
    { text: "成效：将连续增量拆分为独立、可追溯的结构化资产，避免需求漂移", box: { x: 205, y: 465, w: 538, h: 17 } }
  ];

  const report = auditStructuralNativeReadiness({ slideSize, pages: [{ images: [image], textBoxes }] });

  assert.equal(report.ok, true);
  assert.equal(report.totals.coveredByProbe, 1);
  assert.equal(report.candidates[0].status, "covered-by-probe");
  assert.ok(report.candidates[0].probe.detectors.includes("document-version-folder-flow"));
  assert.equal(report.candidates[0].probe.textBoxCount, 4);
});

test("structural native audit protects intentional illustration fragments", () => {
  const image = {
    id: "native-entropy-challenge-crop-fragment-cloud",
    box: { x: 120, y: 140, w: 220, h: 180 },
    source: {
      detector: "native-entropy-challenge-crop-fragment-cloud",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "entropy-challenge-illustration-fragment",
      recommendedAction: "preserve-local-crop",
      layer: { layerType: "illustration-zone" }
    }
  };

  const report = auditStructuralNativeReadiness({ slideSize, pages: [{ images: [image], textBoxes: [] }] });

  assert.equal(scoreStructuralImageCandidate(image, slideSize).isCandidate, true);
  assert.equal(isProtectedIntentionalCrop(image), true);
  assert.equal(report.ok, true);
  assert.equal(report.totals.protectedCrops, 1);
  assert.equal(report.candidates[0].status, "protected-crop");
});

test("structural native audit protects icon-library illustration crops without structural evidence", () => {
  const image = {
    id: "native-entropy-challenge-crop-0",
    box: { x: 40, y: 118, w: 330, h: 294 },
    source: {
      detector: "entropy-challenge-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "illustration",
      recommendedAction: "match-icon-library-or-keep-local-crop",
      reason: "complex-fragment-and-island-illustration-preserved-as-local-crops",
      layer: { layerType: "illustration-zone" }
    }
  };

  const report = auditStructuralNativeReadiness({ slideSize, pages: [{ images: [image], textBoxes: [] }] });

  assert.equal(isProtectedIntentionalCrop(image), true);
  assert.equal(report.ok, true);
  assert.equal(report.totals.protectedCrops, 1);
  assert.equal(report.candidates[0].status, "protected-crop");
});

test("structural native audit protects obvious illustration diagrams even with detected atoms", () => {
  const image = {
    id: "vendor-arrow-illustration",
    box: { x: 220, y: 128, w: 320, h: 240 },
    source: {
      detector: "component-preview-illustration-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "circular-arrow-示意图",
      recommendedAction: "keep-local-crop-unless-exact-component-match",
      layer: {
        layerType: "illustration-zone",
        diagramUnderstanding: {
          confidence: 0.82,
          nodeCount: 2,
          connectorCount: 1,
          nodes: [{ text: "A" }, { text: "B" }],
          visualAtoms: [
            { kind: "native-arc-candidate" },
            { kind: "connector-arrow-candidate" },
            { kind: "native-rect-candidate" },
            { kind: "native-ellipse-candidate" }
          ]
        }
      }
    }
  };

  const report = auditStructuralNativeReadiness({ slideSize, pages: [{ images: [image], textBoxes: [] }] });

  assert.equal(scoreStructuralImageCandidate(image, slideSize).isCandidate, true);
  assert.equal(isProtectedIntentionalCrop(image), true);
  assert.equal(report.ok, true);
  assert.equal(report.totals.protectedCrops, 1);
  assert.equal(report.candidates[0].status, "protected-crop");
});

test("structural native audit treats decorative textures as protected non-semantic units", () => {
  const image = {
    id: "dot-pattern-background",
    box: { x: 40, y: 92, w: 860, h: 380 },
    source: {
      detector: "dotted-background-texture",
      expressionForm: "decorative-texture",
      expressionSubtype: "background-pattern",
      recommendedAction: "preserve-local-crop",
      decorativeTexture: true,
      layer: {
        layerType: "decorative-zone",
        diagramUnderstanding: {
          visualAtomCount: 120,
          visualAtoms: Array.from({ length: 8 }, () => ({ kind: "native-ellipse-candidate" }))
        }
      }
    }
  };

  const report = auditStructuralNativeReadiness({ slideSize, pages: [{ images: [image], textBoxes: [] }] });

  assert.equal(isProtectedIntentionalCrop(image), true);
  assert.equal(report.ok, true);
  assert.equal(report.totals.protectedCrops, 1);
  assert.equal(report.totals.actionableGaps, 0);
  assert.equal(report.candidates[0].status, "protected-crop");
  assert.ok(report.candidates[0].reasons.includes("minimum-unit:sample-or-merge-decorative-texture"));
});

test("structural native audit protects low-confidence tiny dense crops with preserve intent", () => {
  const image = {
    id: "small-footer-emblem",
    box: { x: 876.41, y: 453.75, w: 83.59, h: 86.25 },
    source: {
      detector: "foreground-graphic-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "dense-complex-diagram",
      recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident",
      nativeRebuild: true,
      reason: "complex-graphic-preserved-as-movable-crop",
      layer: {
        layerType: "diagram-zone",
        diagramUnderstanding: {
          confidence: 0.26,
          nativeReadiness: "preserve-crop",
          archetype: "unclassified-diagram",
          nodeCount: 0,
          connectorCount: 0,
          visualAtomCount: 0,
          nodes: [],
          visualAtoms: []
        }
      }
    }
  };

  const report = auditStructuralNativeReadiness({ slideSize, pages: [{ images: [image], textBoxes: [] }] });

  assert.equal(isProtectedIntentionalCrop(image), true);
  assert.equal(report.ok, true);
  assert.equal(report.totals.protectedCrops, 1);
  assert.equal(report.totals.actionableGaps, 0);
  assert.equal(report.candidates[0].status, "protected-crop");
});

test("structural native audit flags high-confidence native-intended diagrams without reusable structure", () => {
  const image = {
    id: "uncovered-structure",
    box: { x: 110, y: 120, w: 420, h: 260 },
    source: {
      detector: "foreground-graphic-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "custom-spiral-process",
      recommendedAction: "replace-with-native-components",
      layer: {
        layerType: "diagram-zone",
        diagramUnderstanding: {
          archetype: "custom-spiral-process",
          confidence: 0.93,
          nodeCount: 0,
          connectorCount: 0,
          nodes: [],
          visualAtoms: []
        }
      }
    }
  };

  const report = auditStructuralNativeReadiness({ slideSize, pages: [{ images: [image], textBoxes: [] }] });

  assert.equal(report.ok, false);
  assert.equal(report.totals.actionableGaps, 1);
  assert.equal(report.actionableCandidates[0].status, "actionable-gap");
  assert.equal(report.actionableCandidates[0].imageId, "uncovered-structure");
});

test("structural native audit covers PRD semantic cycle crops with title-driven probe", () => {
  const image = {
    id: "native-graphic-saturated-diagram-underlay",
    box: { x: 68, y: 142, w: 824, h: 286 },
    source: {
      detector: "saturated-diagram-graphic-underlay-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "saturated-multi-flow-diagram",
      recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident",
      layer: { layerType: "diagram-zone" }
    }
  };
  const textBoxes = [
    { text: "能力深潜04一PRD自动生成", box: { x: 40, y: 36, w: 360, h: 32 } }
  ];

  const report = auditStructuralNativeReadiness({ slideSize, pages: [{ images: [image], textBoxes }] });

  assert.equal(report.ok, true);
  assert.equal(report.totals.coveredByProbe, 1);
  assert.equal(report.candidates[0].status, "covered-by-probe");
  assert.ok(report.candidates[0].probe.detectors.includes("semantic-cycle-diagram"));
});

test("structural native audit covers dense complex diagrams with scaffold probe", () => {
  const image = {
    id: "native-graphic-sparse-diagram-underlay",
    box: { x: 58, y: 132, w: 842, h: 302 },
    source: {
      detector: "sparse-diagram-graphic-underlay-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "dense-complex-diagram",
      recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident",
      layer: { layerType: "diagram-zone" }
    }
  };
  const textBoxes = [
    { text: "破局重构：全链路AI Skills工作流", box: { x: 34, y: 36, w: 430, h: 34 } },
    { text: "链式编排，把能力沉淀为可复用组件", box: { x: 36, y: 82, w: 360, h: 20 } }
  ];

  const report = auditStructuralNativeReadiness({ slideSize, pages: [{ images: [image], textBoxes }] });

  assert.equal(report.ok, true);
  assert.equal(report.totals.coveredByProbe, 1);
  assert.equal(report.candidates[0].status, "covered-by-probe");
  assert.ok(report.candidates[0].probe.detectors.includes("dense-complex-scaffold"));
});
