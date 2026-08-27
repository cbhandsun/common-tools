"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  auditGraphicReconstructionDecisions,
  classifyImageDecision,
  indexShortlistActions,
  parseArgs,
  renderDecisionAuditMarkdown,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/graphic-reconstruction-decision-audit");

const slideSize = { widthPt: 960, heightPt: 540 };

function writeJson(dir, name, value) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

test("parseArgs accepts decision audit CLI flags", () => {
  const args = parseArgs([
    "node",
    "graphic-reconstruction-decision-audit.js",
    "--ir",
    "deck.ir.json",
    "--shortlist",
    "shortlist.json",
    "--out",
    "audit.json",
    "--markdown-out",
    "audit.md"
  ]);

  assert.equal(args.ir, "deck.ir.json");
  assert.equal(args.shortlist, "shortlist.json");
  assert.equal(args.out, "audit.json");
  assert.equal(args.markdownOut, "audit.md");
});

test("classifyImageDecision protects obvious icon and illustration crops", () => {
  const image = {
    id: "decorative-icon",
    box: { x: 120, y: 120, w: 220, h: 160 },
    source: {
      detector: "decorative-icon-crop",
      expressionFamily: "pictorial-asset",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "flow-icon",
      recommendedAction: "preserve-local-crop",
      layer: { layerType: "illustration-zone" }
    }
  };

  const decision = classifyImageDecision({ image, slideSize, pageIndex: 0, imageIndex: 0 });

  assert.equal(decision.decision, "preserve-local-crop");
  assert.equal(decision.expressionFamily, "pictorial-asset");
  assert.ok(decision.reasons.includes("protected-icon-illustration-or-screenshot"));
  assert.equal(decision.expressionPolicy.minimumUnitPolicy, "preserve-as-single-crop");
  assert.equal(decision.expressionPolicy.unitDisposition, "intentional-visual-crop");
  assert.equal(decision.expressionPolicy.protectCrop, true);
});

test("classifyImageDecision routes matching component-owner graphics to plugin template harvest", () => {
  const shortlist = indexShortlistActions({
    actions: [
      {
        status: "direct-target-candidate",
        layerId: "p6-demand-native-component",
        provider: "officeplus",
        kind: "component",
        id: "MatlComponentContent-1900",
        title: "渐变风流程箭头元素_4项",
        score: 288,
        action: { searchText: "渐变风流程箭头元素_4项" }
      }
    ]
  });
  const image = {
    id: "native-graphic",
    box: { x: 80, y: 120, w: 760, h: 240 },
    source: {
      detector: "foreground-graphic-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "process-chain",
      recommendedAction: "replace-with-native-components",
      layerSourceId: "p6-demand-native-component",
      layer: {
        layerType: "diagram-zone",
        diagramUnderstanding: {
          confidence: 0.92,
          nodes: [{ text: "步骤1" }, { text: "步骤2" }],
          visualAtoms: [{ kind: "connector-line-candidate" }]
        }
      }
    }
  };

  const decision = classifyImageDecision({ image, slideSize, pageIndex: 5, imageIndex: 0, shortlistIndex: shortlist });

  assert.equal(decision.decision, "harvest-or-apply-plugin-template");
  assert.equal(decision.pluginAction.id, "MatlComponentContent-1900");
});

test("classifyImageDecision routes embedded component render strategy targets to plugin template harvest", () => {
  const image = {
    id: "native-graphic-underlay",
    box: { x: 80, y: 120, w: 760, h: 240 },
    source: {
      detector: "foreground-graphic-underlay-crop",
      expressionForm: "table-or-matrix",
      expressionSubtype: "table-grid",
      recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
      componentRenderStrategy: {
        provider: "component-render-strategy-v1",
        mode: "plugin-component-template",
        implementationMode: "auth-or-download-required",
        bestCandidate: {
          sourceProvider: "officeplus",
          kind: "component",
          id: "MatlComponentContent-20568",
          title: "扁平3项箭头矩阵",
          candidateScore: 58
        },
        applicationPlan: {
          sourceProvider: "officeplus",
          componentKind: "component",
          componentId: "MatlComponentContent-20568"
        }
      },
      layer: {
        layerType: "table-zone",
        diagramUnderstanding: {
          confidence: 0.92,
          archetype: "matrix-or-grid",
          nodeCount: 8,
          visualAtoms: [{ kind: "grid-line-candidate" }]
        }
      }
    }
  };

  const decision = classifyImageDecision({ image, slideSize, pageIndex: 1, imageIndex: 0 });

  assert.equal(decision.decision, "harvest-or-apply-plugin-template");
  assert.equal(decision.pluginAction.id, "MatlComponentContent-20568");
  assert.equal(decision.pluginAction.status, "component-render-strategy-target");
});

test("classifyImageDecision keeps protected crops ahead of embedded component strategy targets", () => {
  const image = {
    id: "visual-example-arrow",
    box: { x: 120, y: 120, w: 320, h: 240 },
    source: {
      detector: "plugin-cycle-arrow-illustration-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "cycle-flow-icon visual-example 示意图",
      recommendedAction: "keep-local-crop-unless-exact-component-match",
      componentRenderStrategy: {
        mode: "plugin-component-template",
        bestCandidate: {
          sourceProvider: "officeplus",
          kind: "component",
          id: "MatlComponentContent-arrow",
          title: "循环箭头"
        }
      },
      layer: { layerType: "illustration-zone" }
    }
  };

  const decision = classifyImageDecision({ image, slideSize, pageIndex: 0, imageIndex: 0 });

  assert.equal(decision.decision, "preserve-local-crop");
  assert.equal(decision.pluginAction, null);
});


test("classifyImageDecision does not let plugin shortlist override protected icon diagrams", () => {
  const shortlist = indexShortlistActions({
    actions: [
      {
        status: "direct-target-candidate",
        layerId: "p3-arrow-icon",
        provider: "islide",
        kind: "component",
        id: "MatlComponentContent-arc-arrow",
        title: "圆弧箭头组件",
        score: 260,
        action: { searchText: "圆弧箭头" }
      }
    ]
  });
  const image = {
    id: "vendor-arrow-illustration",
    box: { x: 220, y: 128, w: 320, h: 240 },
    source: {
      detector: "component-preview-illustration-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "circular-arrow-示意图",
      recommendedAction: "keep-local-crop-unless-exact-component-match",
      layerSourceId: "p3-arrow-icon",
      layer: {
        layerType: "illustration-zone",
        diagramUnderstanding: {
          confidence: 0.82,
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

  const decision = classifyImageDecision({ image, slideSize, pageIndex: 2, imageIndex: 0, shortlistIndex: shortlist });

  assert.equal(decision.decision, "preserve-local-crop");
  assert.equal(decision.pluginAction, null);
  assert.ok(decision.reasons.includes("protected-icon-illustration-or-screenshot"));
  assert.equal(decision.expressionPolicy.kind, "standalone-visual-asset");
});

test("classifyImageDecision keeps structured chart and matrix graphics rebuildable despite generic diagram wording", () => {
  const image = {
    id: "native-chart-matrix",
    box: { x: 90, y: 100, w: 760, h: 300 },
    source: {
      detector: "foreground-graphic-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "dashboard 图表 矩阵 图示",
      recommendedAction: "replace-with-native-components",
      layer: {
        layerType: "chart-zone",
        diagramUnderstanding: {
          confidence: 0.9,
          nativeReadiness: "native-rebuild",
          nodeCount: 6,
          visualAtomCount: 12,
          visualAtomKindCounts: { "grid-line-candidate": 4 },
          componentStrategy: {
            templateFamily: "bar-chart",
            targetMotifs: ["card-grid"]
          }
        }
      }
    }
  };

  const decision = classifyImageDecision({ image, slideSize, pageIndex: 1, imageIndex: 0 });

  assert.equal(decision.decision, "rebuild-native-gap");
  assert.equal(decision.expressionPolicy.kind, "structured-native");
  assert.equal(decision.expressionPolicy.minimumUnitPolicy, "rebuild-semantic-structure");
  assert.equal(decision.expressionPolicy.protectCrop, false);
});

test("auditGraphicReconstructionDecisions reports uncovered native gaps", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-audit-"));
  const ir = writeJson(dir, "deck.ir.json", {
    slideSize,
    pages: [
      {
        images: [
          {
            id: "custom-spiral-process",
            box: { x: 100, y: 100, w: 420, h: 260 },
            source: {
              detector: "foreground-graphic-crop",
              expressionForm: "complex-diagram",
              expressionSubtype: "custom-spiral-process",
              recommendedAction: "replace-with-native-components",
              layer: {
                layerType: "diagram-zone",
                diagramUnderstanding: {
                  confidence: 0.93,
                  nodes: [],
                  visualAtoms: []
                }
              }
            }
          }
        ],
        textBoxes: []
      }
    ]
  });

  const report = auditGraphicReconstructionDecisions({ ir });

  assert.equal(report.ok, false);
  assert.equal(report.summary.actionableNativeGaps, 1);
  assert.equal(report.actionableGaps[0].imageId, "custom-spiral-process");
});

test("auditGraphicReconstructionDecisions combines protected crops and plugin targets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-audit-"));
  const ir = writeJson(dir, "deck.ir.json", {
    slideSize,
    pages: [
      {
        images: [
          {
            id: "protected-illustration",
            box: { x: 40, y: 120, w: 280, h: 220 },
            source: {
              detector: "illustration-crop",
              expressionForm: "icon-or-illustration",
              expressionSubtype: "screenshot-demo",
              recommendedAction: "preserve-local-crop",
              layer: { layerType: "illustration-zone" }
            }
          },
          {
            id: "process-chain",
            box: { x: 340, y: 120, w: 520, h: 220 },
            source: {
              detector: "foreground-graphic-crop",
              expressionForm: "complex-diagram",
              expressionSubtype: "process-chain",
              recommendedAction: "replace-with-native-components",
              layerSourceId: "p6-demand-native-component",
              layer: {
                layerType: "diagram-zone",
                diagramUnderstanding: {
                  confidence: 0.9,
                  nodes: [{ text: "A" }, { text: "B" }],
                  visualAtoms: [{ kind: "connector-line-candidate" }]
                }
              }
            }
          }
        ],
        textBoxes: []
      }
    ]
  });
  const shortlist = writeJson(dir, "shortlist.json", {
    actions: [{
      status: "direct-target-candidate",
      layerId: "p6-demand-native-component",
      provider: "officeplus",
      kind: "component",
      id: "MatlComponentContent-1900",
      title: "渐变风流程箭头元素_4项",
      score: 288,
      action: { searchText: "流程箭头" }
    }]
  });

  const report = auditGraphicReconstructionDecisions({ ir, shortlist });

  assert.equal(report.ok, true);
  assert.equal(report.summary.protectedCrops, 1);
  assert.equal(report.summary.pluginTemplateTargets, 1);
  assert.equal(report.protectedCrops[0].areaRatio, 0.1188);
  assert.deepEqual(report.protectedCrops[0].box, { x: 40, y: 120, w: 280, h: 220 });
});

test("auditGraphicReconstructionDecisions includes shortlist component layers without image crops", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-audit-"));
  const ir = writeJson(dir, "deck.ir.json", {
    slideSize,
    pages: [{ images: [], textBoxes: [], shapes: [] }]
  });
  const shortlist = writeJson(dir, "shortlist.json", {
    actions: [{
      status: "direct-target-candidate",
      slide: 6,
      layerId: "p6-demand-native-component",
      provider: "officeplus",
      kind: "component",
      id: "MatlComponentContent-1900",
      title: "渐变风流程箭头元素_4项",
      score: 288,
      action: { searchText: "流程箭头" }
    }]
  });

  const report = auditGraphicReconstructionDecisions({ ir, shortlist });

  assert.equal(report.ok, true);
  assert.equal(report.summary.pluginTemplateTargets, 1);
  assert.equal(report.pluginTemplateTargets[0].imageIndex, null);
  assert.equal(report.pluginTemplateTargets[0].pluginAction.id, "MatlComponentContent-1900");
});

test("componentLayerDecisionsFromShortlist skips actions already matched by image source ids", () => {
  const action = {
    layerId: "p6-demand-native-component",
    provider: "officeplus",
    kind: "component",
    id: "MatlComponentContent-1900",
    title: "渐变风流程箭头元素_4项",
    score: 288
  };
  const key = _private.actionKey(action);

  assert.equal(_private.componentLayerDecisionsFromShortlist({ actions: [action] }, new Set([key])).length, 0);
  assert.equal(_private.componentLayerDecisionsFromShortlist({ actions: [action] }, new Set()).length, 1);
});

test("renderDecisionAuditMarkdown includes counts and plugin evidence", () => {
  const markdown = renderDecisionAuditMarkdown({
    generatedAt: "2026-07-04T00:00:00.000Z",
    ok: true,
    summary: {
      total: 1,
      byDecision: { "harvest-or-apply-plugin-template": 1 }
    },
    decisions: [{
      slide: 6,
      imageIndex: 0,
      imageId: "process-chain",
      decision: "harvest-or-apply-plugin-template",
      detector: "foreground-graphic-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "process-chain",
      reasons: ["plugin-shortlist:direct-target-candidate"],
      pluginAction: {
        provider: "officeplus",
        kind: "component",
        id: "MatlComponentContent-1900",
        title: "渐变风流程箭头元素_4项"
      }
    }]
  });

  assert.match(markdown, /Graphic Reconstruction Decision Audit/);
  assert.match(markdown, /MatlComponentContent-1900/);
});

test("private source id helpers map shortlist actions to image sources", () => {
  assert.deepEqual(
    _private.actionSourceIds({ layerId: "p6-layer", id: "MatlComponentContent-1900" }),
    ["p6-layer", "MatlComponentContent-1900"]
  );
  assert.deepEqual(
    _private.candidateSourceIds({
      id: "image-1",
      source: { layerSourceId: "p6-layer", layer: { componentOwnerId: "owner" } }
    }),
    ["image-1", "p6-layer", "owner"]
  );
});
