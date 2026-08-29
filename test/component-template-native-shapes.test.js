"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createComponentTemplateNativeObjects,
  createComponentTemplateNativeShapes,
  selectComponentGroupMatch,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-template-native-shapes");
const {
  evaluateComponentGroupsForLayer
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-template-group-matcher");

function templateImage(overrides = {}) {
  const sourceOverrides = overrides.source || {};
  const base = {
    id: "diagram-layer",
    box: { x: 80, y: 100, w: 500, h: 160 },
    source: {
      componentRenderStrategy: { mode: "plugin-component-template" },
      layer: {
        templateFamily: "process-chain",
        diagramUnderstanding: { archetype: "process-chain", confidence: 0.88 }
      },
      componentLocalAssets: [{
        provider: "officeplus",
        name: "officeplus.pptx",
        path: "C:\\Program Files\\Microsoft OfficePLUS\\officeplus.pptx",
        recommendedComponentGroups: [{
          id: "slide5-group2",
          score: 76,
          childCount: 4,
          connectorCount: 3,
          topColors: [
            { value: "#185ABD", count: 5 },
            { value: "#09BF5D", count: 2 }
          ]
        }]
      }],
      ...sourceOverrides,
      componentRenderStrategy: {
        mode: "plugin-component-template",
        ...(sourceOverrides.componentRenderStrategy || {})
      }
    }
  };
  return {
    ...base,
    ...overrides,
    source: base.source
  };
}

test("component template native shapes builds a process shell from high-confidence plugin groups", () => {
  const image = templateImage();
  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.equal(image.source.componentTemplateGroupApplied, true);
  assert.equal(image.source.componentTemplateGroupId, "slide5-group2");
  assert.equal(image.source.componentTemplateFamilyApplied, "process-chain");
  assert.ok(shapes.length >= 7);
  assert.equal(shapes.filter((shape) => shape.source.componentTemplatePart === "process-node").length, 4);
  assert.equal(shapes.filter((shape) => shape.source.componentTemplatePart === "process-connector").length, 3);
  assert.equal(shapes.find((shape) => shape.source.componentTemplatePart === "process-node").style.stroke, "#185ABD");
  assert.deepEqual(shapes[0].source.matchedComponentPalette, ["#185ABD", "#09BF5D"]);
  assert.deepEqual(shapes[0].source.matchedComponentTargetMotifs, ["linear-arrow-chain"]);
  assert.ok(shapes.every((shape) => shape.source.componentTemplateGroupApplied === true));
});

test("component template native objects bind OCR text into generated process nodes", () => {
  const image = templateImage();
  const objects = createComponentTemplateNativeObjects([image], { widthPt: 960, heightPt: 540 }, {
    sourceTextBoxes: [
      { id: "ocr-node-1", text: "业务目标", box: { x: 112, y: 158, w: 74, h: 18 } }
    ]
  });

  const bound = objects.textBoxes.find((item) => item.source?.componentTemplateSourceBoundText === true);

  assert.ok(bound);
  assert.equal(bound.text, "业务目标");
  assert.equal(bound.source.detector, "plugin-component-template-source-bound-textbox");
  assert.equal(bound.source.pluginPlaceholderTextBackfilled, true);
  assert.equal(bound.source.pluginTextBackfillSourceId, "ocr-node-1");
  assert.match(bound.source.replacedTextShellId, /process-node/);
});

test("component template native objects do not bind OCR text outside component nodes", () => {
  const image = templateImage();
  const objects = createComponentTemplateNativeObjects([image], { widthPt: 960, heightPt: 540 }, {
    sourceTextBoxes: [
      { id: "ocr-title", text: "页面标题", box: { x: 90, y: 54, w: 130, h: 26 } }
    ]
  });

  assert.equal(objects.textBoxes.some((item) => item.source?.componentTemplateSourceBoundText === true), false);
});

test("component template native shapes infer motif metadata from matrix component family", () => {
  const image = templateImage({
    box: { x: 60, y: 90, w: 640, h: 260 },
    source: {
      componentRenderStrategy: { mode: "plugin-component-template" },
      layer: {
        layerType: "table-zone",
        templateFamily: "matrix",
        diagramUnderstanding: {
          archetype: "matrix-or-grid",
          nodeCount: 9,
          visualGrid: { rows: 3, columns: 3 },
          componentStrategy: { templateFamily: "matrix" }
        }
      },
      componentLocalAssets: [{
        provider: "officeplus",
        name: "officeplus-matrix.pptx",
        recommendedComponentGroups: [{
          id: "legacy-matrix-group",
          score: 82,
          childCount: 9,
          shapeCount: 9,
          connectorCount: 0
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });
  const cells = shapes.filter((shape) => shape.source.componentTemplatePart === "matrix-cell");

  assert.equal(image.source.componentTemplateFamilyApplied, "matrix");
  assert.ok(cells.length >= 9);
  assert.ok(cells.every((shape) => shape.source.matchedComponentAssetMotifReady === false));
  assert.ok(cells.every((shape) => shape.source.matchedComponentTargetMotifs.includes("card-grid")));
});

test("component template native objects bind slightly overflowing OCR labels into swimlane headers", () => {
  const image = templateImage({
    source: {
      componentRenderStrategy: {
        mode: "plugin-component-template",
        targetMotifs: ["linear-arrow-chain", "whole-process-template"]
      },
      layer: {
        templateFamily: "swimlane process",
        diagramUnderstanding: {
          archetype: "process-chain",
          nodeCount: 8,
          visualNodeCount: 8,
          structureSignature: { laneCount: 4, layout: "swimlane" }
        }
      }
    }
  });
  const objects = createComponentTemplateNativeObjects([image], { widthPt: 960, heightPt: 540 }, {
    sourceTextBoxes: [
      { id: "ocr-lane-1", text: "会议纪要", box: { x: 148, y: 110, w: 76, h: 20 } }
    ]
  });

  const bound = objects.textBoxes.find((item) => item.source?.pluginTextBackfillSourceId === "ocr-lane-1");

  assert.ok(bound);
  assert.equal(bound.text, "会议纪要");
  assert.match(bound.source.replacedTextShellId, /swimlane-header/);
  assert.equal(bound.font.weight, "bold");
});

test("component template native objects bind lower-edge OCR labels into swimlane nodes", () => {
  const image = templateImage({
    source: {
      componentRenderStrategy: {
        mode: "plugin-component-template",
        targetMotifs: ["linear-arrow-chain", "whole-process-template"]
      },
      layer: {
        templateFamily: "swimlane process",
        diagramUnderstanding: {
          archetype: "process-chain",
          nodeCount: 8,
          visualNodeCount: 8,
          structureSignature: { laneCount: 4, layout: "swimlane" }
        }
      }
    }
  });
  const objects = createComponentTemplateNativeObjects([image], { widthPt: 960, heightPt: 540 }, {
    sourceTextBoxes: [
      { id: "ocr-lower-node", text: "飞书对话", box: { x: 178, y: 221, w: 76, h: 20 } }
    ]
  });

  const bound = objects.textBoxes.find((item) => item.source?.pluginTextBackfillSourceId === "ocr-lower-node");

  assert.ok(bound);
  assert.equal(bound.text, "飞书对话");
  assert.match(bound.source.replacedTextShellId, /swimlane-node/);
  assert.equal(bound.font.weight, "regular");
});

test("component template native shapes prefers applied plugin groups on equal component score", () => {
  const image = templateImage({
    source: {
      componentLocalAssets: [
        {
          provider: "officeplus",
          name: "generic-officeplus.pptx",
          path: "C:\\Program Files\\Microsoft OfficePLUS\\officeplus.pptx",
          matchScore: 95,
          roleTags: ["template-layout"],
          recommendedComponentGroups: [{
            id: "generic-group",
            score: 82,
            childCount: 4,
            connectorCount: 3
          }]
        },
        {
          provider: "officeplus",
          name: "officeplus-applied-roadmap.pptx",
          path: "E:\\runs\\officeplus-applied-roadmap.pptx",
          matchScore: 90,
          roleTags: ["applied-component", "template-layout"],
          reusePolicy: "inspect-openxml-applied-plugin-component",
          recommendedComponentGroups: [{
            id: "applied-group",
            score: 82,
            childCount: 4,
            connectorCount: 3
          }]
        }
      ]
    }
  });

  const match = selectComponentGroupMatch(image, { minScore: 58 });

  assert.equal(match.id, "applied-group");
  assert.equal(match.assetAppliedComponent, true);
  assert.equal(match.assetReusePolicy, "inspect-openxml-applied-plugin-component");
});

test("component template native shapes skips groups marked avoid reuse readiness", () => {
  const image = templateImage({
    source: {
      componentLocalAssets: [{
        provider: "islide",
        name: "islide-applied-components.pptx",
        path: "E:\\runs\\islide-applied-components.pptx",
        matchScore: 96,
        roleTags: ["applied-component", "template-layout"],
        recommendedComponentGroups: [
          {
            id: "picture-heavy-decoration",
            score: 96,
            childCount: 12,
            connectorCount: 4,
            reuseReadiness: {
              level: "avoid",
              score: 12,
              reasons: ["picture-heavy", "low-editable-structure"]
            }
          },
          {
            id: "structured-process-chain",
            score: 74,
            childCount: 4,
            connectorCount: 3,
            reuseReadiness: {
              level: "high",
              score: 88,
              reasons: ["has-child-layout", "structured-process-chain"]
            }
          }
        ]
      }]
    }
  });

  const match = selectComponentGroupMatch(image, { minScore: 58 });
  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.equal(match.id, "structured-process-chain");
  assert.equal(image.source.componentTemplateGroupId, "structured-process-chain");
  assert.ok(shapes.length >= 7);
  assert.equal(shapes.filter((shape) => shape.source.componentTemplatePart === "process-node").length, 4);
});

test("component template native shapes prefers higher reuse readiness for near-tie groups", () => {
  const image = templateImage({
    source: {
      componentLocalAssets: [{
        provider: "officeplus",
        name: "officeplus-components.pptx",
        matchScore: 90,
        recommendedComponentGroups: [
          {
            id: "slightly-higher-score-low-reuse",
            score: 82,
            childCount: 6,
            connectorCount: 3,
            reuseReadiness: {
              level: "low",
              score: 42,
              reasons: ["weak-child-layout"]
            }
          },
          {
            id: "clean-structured-component",
            score: 79,
            childCount: 4,
            connectorCount: 3,
            reuseReadiness: {
              level: "high",
              score: 91,
              reasons: ["has-child-layout", "native-shape-rich"]
            }
          }
        ]
      }]
    }
  });

  const match = selectComponentGroupMatch(image, { minScore: 58 });

  assert.equal(match.id, "clean-structured-component");
});

test("component template native shapes prefers component groups with closer source structure", () => {
  const image = templateImage({
    source: {
      layer: {
        layerType: "diagram-zone",
        templateFamily: "hub-spoke",
        diagramUnderstanding: {
          archetype: "hub-spoke",
          visualNodeCount: 5,
          visualConnectorCount: 4
        }
      },
      componentLocalAssets: [{
        provider: "islide",
        name: "islide-applied-hub-spoke.pptx",
        matchScore: 90,
        roleTags: ["applied-component", "template-layout"],
        recommendedComponentGroups: [
          {
            id: "large-hub-spoke",
            score: 82,
            childCount: 48,
            shapeCount: 30,
            connectorCount: 18,
            pictureCount: 0,
            reuseReadiness: { level: "high", score: 90 }
          },
          {
            id: "close-hub-spoke",
            score: 80,
            childCount: 9,
            shapeCount: 5,
            connectorCount: 4,
            pictureCount: 0,
            reuseReadiness: { level: "high", score: 90 }
          }
        ]
      }]
    }
  });

  const match = selectComponentGroupMatch(image, { minScore: 58 });
  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.equal(match.id, "close-hub-spoke");
  assert.ok(match.structureFitScore > 0);
  assert.ok(match.structureFitReasons.includes("native-group-node-count-close"));
  assert.ok(match.structureFitReasons.includes("native-group-connector-count-close"));
  assert.ok(shapes.some((shape) => shape.source.matchedComponentStructureFitScore > 0));
  assert.ok(shapes.some((shape) => shape.source.matchedComponentStructureFitReasons.includes("native-group-node-count-close")));
});

test("component template native shapes rejects a detailed hub-spoke for a matrix target", () => {
  const image = templateImage({
    source: {
      layer: {
        layerType: "table-zone",
        templateFamily: "grid-or-matrix",
        diagramUnderstanding: { nodeCount: 4, connectorCount: 0 }
      },
      componentAssetReadiness: {
        status: "applied-plugin-motif-ready",
        targetMotifs: ["card-grid"]
      },
      componentLocalAssets: [{
        provider: "officeplus",
        roleTags: ["applied-component", "self-fidelity-promoted"],
        recommendedComponentGroups: [{
          id: "decorated-hub-spoke",
          score: 94,
          shapeCount: 42,
          connectorCount: 6,
          pictureCount: 0,
          structure: { kind: "hub-spoke", nodeCount: 6, connectorCount: 6 },
          childLayout: { children: Array.from({ length: 42 }, () => ({ kind: "shape", style: { gradient: {} } })) }
        }]
      }, {
        provider: "islide",
        roleTags: ["applied-component", "self-fidelity-promoted"],
        recommendedComponentGroups: [{
          id: "four-card-matrix",
          score: 94,
          shapeCount: 8,
          connectorCount: 0,
          pictureCount: 0,
          structure: { kind: "matrix", nodeCount: 4, connectorCount: 0 },
          childLayout: { children: Array.from({ length: 8 }, () => ({ kind: "shape", style: { fill: "#185ABD" } })) }
        }]
      }]
    }
  });

  const match = selectComponentGroupMatch(image, { minScore: 72 });

  assert.equal(match.id, "four-card-matrix");
  assert.ok(match.structureFitReasons.includes("native-group-kind-compatible:matrix"));
});

test("component template native shapes replays a promoted local template when the readiness plan requests OpenXML reuse", () => {
  const image = templateImage({
    source: {
      componentRenderStrategy: {
        mode: "preserve-crop-with-component-reference",
        applicationPlan: {
          currentStep: "preserve-source-crop-with-plugin-style-reference",
          targetStep: "reuse-openxml-groups-from-applied-plugin-template-for-target-motif"
        }
      },
      layer: { layerType: "diagram-zone", templateFamily: "hub-spoke" },
      componentAssetReadiness: {
        status: "applied-plugin-motif-ready",
        nextStep: "reuse-openxml-groups-from-applied-plugin-template-for-target-motif",
        targetMotifs: ["hub-spoke"]
      },
      componentLocalAssets: [{
        provider: "islide",
        roleTags: ["applied-component", "self-fidelity-promoted"],
        recommendedComponentGroups: [{
          id: "promoted-hub-spoke",
          score: 94,
          childCount: 6,
          shapeCount: 6,
          pictureCount: 0,
          structure: { kind: "hub-spoke", nodeCount: 5, connectorCount: 0 },
          childLayout: { children: Array.from({ length: 6 }, () => ({ kind: "shape", style: { fill: "#185ABD" } })) }
        }]
      }]
    }
  });

  const match = selectComponentGroupMatch(image, { minScore: 72 });

  assert.equal(match.id, "promoted-hub-spoke");
  assert.ok(match.score >= 72);
});

test("component template native shapes returns no match when every promoted group conflicts with the target structure", () => {
  const image = templateImage({
    source: {
      layer: { layerType: "table-zone", templateFamily: "grid-or-matrix" },
      componentAssetReadiness: { status: "applied-plugin-motif-ready", targetMotifs: ["card-grid"] },
      componentLocalAssets: [{
        provider: "officeplus",
        roleTags: ["applied-component", "self-fidelity-promoted"],
        recommendedComponentGroups: [{
          id: "hub-spoke-only",
          score: 94,
          shapeCount: 42,
          connectorCount: 6,
          pictureCount: 0,
          structure: { kind: "hub-spoke", nodeCount: 6, connectorCount: 6 }
        }]
      }]
    }
  });

  assert.equal(selectComponentGroupMatch(image, { minScore: 72 }), null);
});

test("component template native shapes prefers native-shape groups over bitmap-heavy close ties", () => {
  const image = templateImage({
    source: {
      layer: {
        layerType: "diagram-zone",
        templateFamily: "cycle-loop",
        diagramUnderstanding: {
          archetype: "cycle-loop",
          visualNodeCount: 6,
          visualConnectorCount: 0
        }
      },
      componentLocalAssets: [{
        provider: "officeplus",
        name: "officeplus-cycle-components.pptx",
        matchScore: 90,
        roleTags: ["applied-component", "template-layout"],
        recommendedComponentGroups: [
          {
            id: "bitmap-heavy-cycle",
            score: 82,
            childCount: 8,
            shapeCount: 2,
            connectorCount: 0,
            pictureCount: 5,
            reuseReadiness: { level: "high", score: 90 }
          },
          {
            id: "native-cycle",
            score: 80,
            childCount: 8,
            shapeCount: 8,
            connectorCount: 0,
            pictureCount: 0,
            reuseReadiness: { level: "high", score: 90 }
          }
        ]
      }]
    }
  });

  const match = selectComponentGroupMatch(image, { minScore: 58 });

  assert.equal(match.id, "native-cycle");
  assert.ok(match.structureFitReasons.includes("native-group-no-picture-close"));
});

test("component template native shapes directly replays applied plugin child layouts", () => {
  const image = templateImage({
    box: { x: 80, y: 100, w: 500, h: 160 },
    source: {
      layer: { templateFamily: "timeline" },
      componentLocalAssets: [{
        provider: "officeplus",
        name: "officeplus-applied-roadmap.pptx",
        roleTags: ["applied-component", "template-layout"],
        reusePolicy: "inspect-openxml-applied-plugin-component",
        recommendedComponentGroups: [{
          id: "applied-layout",
          score: 88,
          assetAppliedComponent: true,
          assetReusePolicy: "inspect-openxml-applied-plugin-component",
          childLayout: {
            provider: "pptx-slide-ungrouped-child-layout-v1",
            children: [
                { kind: "shape", box: { x: 0.05, y: 0.18, w: 0.18, h: 0.18 }, style: { fill: "#185ABD", shapeType: "wedgeRectCallout", radiusRatio: 0.24, rotation: 12.5, flipH: true, flipV: true, adjustments: [0.12, 0.76], text: { placeholderText: "阶段一", fontSizePt: 16, color: "#FFFFFF", weight: "bold", align: "center", valign: "middle", marginLeftPt: 7.2, marginRightPt: 7.2, marginTopPt: 3.6, marginBottomPt: 3.6, family: "Microsoft YaHei" } } },
                { kind: "connector", box: { x: 0.24, y: 0.27, w: 0.14, h: 0.02 }, style: { stroke: "#185ABD", endArrow: "triangle", dash: "dash" } },
                { kind: "shape", box: { x: 0.40, y: 0.18, w: 0.18, h: 0.18 }, style: { fill: "none", shapeType: "rect", text: { placeholderText: "单击此处添加文本", fontSizePt: 12, color: "#333333" } } },
              { kind: "shape", box: { x: 0.75, y: 0.18, w: 0.18, h: 0.18 }, style: { fill: "#185ABD", shapeType: "ellipse" } },
                { kind: "picture", box: { x: 0.88, y: -0.03, w: 0.08, h: 0.18 }, style: { picture: { embedRelId: "rId7", mediaTarget: "ppt/media/image7.png", crop: { left: 0.1, top: 0.05 }, opacity: 0.65 }, shadow: { color: "#000000", alpha: 0.3, blurPt: 4, distancePt: 1, angleDeg: 90 } } }
            ]
          }
        }]
      }]
    }
  });

  const appliedGroup = image.source.componentLocalAssets[0].recommendedComponentGroups[0];
  appliedGroup.replayChildLayout = {
    provider: "pptx-group-replay-child-layout-v1",
    children: [
      ...appliedGroup.childLayout.children,
      { kind: "shape", box: { x: 0.55, y: 0.52, w: 0.16, h: 0.12 }, style: { fill: "none", gradient: { type: "linear", angleDeg: 0, stops: [{ position: 0, color: "#7E57C2", alpha: 0.45 }, { position: 1, color: "#D0DFE6", alpha: 0 }] }, freeform: { points: [{ x: 0, y: 0 }, { x: 1, y: 0.5 }, { x: 0, y: 1 }], closePath: true } } },
      { kind: "shape", box: { x: 0.73, y: 0.52, w: 0.18, h: 0.12 }, style: { gradient: { type: "linear", angleDeg: 270, stops: [{ position: 0, color: "#156082", alpha: 0.18 }, { position: 0.86, color: "#FFFFFF", alpha: 0.01 }] }, shapeType: "roundRect" } }
    ]
  };

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });
  const objects = createComponentTemplateNativeObjects([image], { widthPt: 960, heightPt: 540 }, {
    preserveGenericPluginText: true
  });

  assert.equal(image.source.componentTemplateGroupId, "applied-layout");
  assert.equal(shapes.length, 7);
  assert.equal(shapes.filter((shape) => shape.source.appliedPluginDirectReplay === true).length, 7);
  assert.equal(shapes.some((shape) => shape.source.componentTemplatePart === "timeline-axis"), false);
    assert.equal(shapes[0].type, "wedgerectcallout");
    assert.equal(shapes[0].style.fill, "#185ABD");
    assert.equal(shapes[0].style.radiusRatio, 0.24);
    assert.equal(shapes[0].style.rotation, 12.5);
    assert.equal(shapes[0].style.flipH, true);
    assert.equal(shapes[0].style.flipV, true);
    assert.deepEqual(shapes[0].style.adjustments, [0.12, 0.76]);
    assert.equal(shapes[0].style.text.marginLeftPt, 7.2);
    assert.equal(objects.textBoxes.find((textBox) => textBox.text === "阶段一")?.style.marginBottomPt, 3.6);
  assert.equal(shapes[1].type, "line");
    assert.equal(shapes[1].style.endArrow, "triangle");
    assert.equal(shapes[1].style.dash, "dash");
    assert.equal(shapes[4].source.appliedPluginPictureShell, true);
    assert.equal(shapes[4].source.appliedPluginPictureRelId, "rId7");
    assert.equal(shapes[4].source.appliedPluginPictureMediaTarget, "ppt/media/image7.png");
    assert.equal(shapes[4].source.appliedPluginPictureCrop, "{\"left\":0.1,\"top\":0.05}");
    assert.equal(shapes[4].style.picture.embedRelId, "rId7");
    assert.equal(shapes[4].style.picture.mediaTarget, "ppt/media/image7.png");
    assert.deepEqual(shapes[4].style.picture.crop, { left: 0.1, top: 0.05 });
    assert.equal(shapes[4].style.opacity, 0.65);
    assert.equal(shapes[4].style.shadow.alpha, 0.3);
    assert.equal(shapes[5].type, "freeform");
    assert.equal(shapes[5].style.gradient, undefined);
    assert.equal(shapes[5].style.opacity, 0.45);
    assert.equal(shapes[6].type, "roundRect");
    assert.equal(shapes[6].style.fill, "none");
    assert.deepEqual(shapes[6].style.gradient, {
      type: "linear",
      angleDeg: 270,
      stops: [
        { position: 0, color: "#156082", alpha: 0.18 },
        { position: 0.86, color: "#FFFFFF", alpha: 0.01 }
      ]
    });
    assert.equal(objects.textBoxes.find((textBox) => textBox.text.includes("单击此处添加文本"))?.font.valign, "top");
  });

test("component template native objects preserve generic plugin text only in explicit learning mode", () => {
  const image = templateImage({
    source: {
      layer: { templateFamily: "process-chain" },
      componentLocalAssets: [{
        provider: "officeplus",
        name: "officeplus-learning-mode.pptx",
        roleTags: ["applied-component", "template-layout"],
        reusePolicy: "inspect-openxml-applied-plugin-component",
        recommendedComponentGroups: [{
          id: "learning-layout",
          score: 90,
          assetAppliedComponent: true,
          assetReusePolicy: "inspect-openxml-applied-plugin-component",
          replayChildLayout: {
            provider: "pptx-group-replay-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.05, y: 0.1, w: 0.2, h: 0.25 }, style: { fill: "#185ABD", text: { placeholderText: "单击此处添加文本", color: "#FFFFFF" } } },
              { kind: "shape", box: { x: 0.28, y: 0.1, w: 0.2, h: 0.25 }, style: { fill: "#2E75B6" } },
              { kind: "shape", box: { x: 0.51, y: 0.1, w: 0.2, h: 0.25 }, style: { fill: "#5B9BD5" } },
              { kind: "shape", box: { x: 0.74, y: 0.1, w: 0.2, h: 0.25 }, style: { fill: "#9DC3E6" } }
            ]
          }
        }]
      }]
    }
  });

  const production = createComponentTemplateNativeObjects([structuredClone(image)], { widthPt: 960, heightPt: 540 });
  const learning = createComponentTemplateNativeObjects([structuredClone(image)], { widthPt: 960, heightPt: 540 }, {
    preserveGenericPluginText: true
  });

  assert.equal(production.textBoxes.length, 0);
  assert.equal(learning.textBoxes.length, 1);
  assert.equal(learning.textBoxes[0].text, "单击此处添加文本");
  assert.equal(learning.textBoxes[0].source.pluginPlaceholderTextPreservedForLearning, true);
});

test("component template native shapes replays painted nested applied decoration groups", () => {
  const primaryChildren = [0, 1, 2, 3].map((index) => ({
    kind: "shape",
    box: { x: index * 0.2, y: 0.32, w: 0.14, h: 0.18 },
    style: { fill: "#185ABD", shapeType: "roundRect" }
  }));
  const decorationChildren = [0, 1, 2, 3].map((index) => ({
    kind: "shape",
    box: { x: index * 0.22, y: 0.18, w: 0.12, h: 0.16 },
    style: { fill: "#1865F1", shapeType: "diamond" }
  }));
  const image = templateImage({
    box: { x: 80, y: 100, w: 500, h: 200 },
    source: {
      layer: { templateFamily: "timeline" },
      componentLocalAssets: [{
        provider: "officeplus",
        name: "officeplus-applied-roadmap.pptx",
        path: "E:\\runs\\officeplus-applied-roadmap.pptx",
        roleTags: ["applied-component", "template-layout"],
        reusePolicy: "inspect-openxml-applied-plugin-component",
        recommendedComponentGroups: [{
          id: "roadmap-primary",
          score: 96,
          boundsPt: { x: 100, y: 100, w: 400, h: 200 },
          replayChildLayout: { children: primaryChildren }
        }, {
          id: "roadmap-decoration",
          score: 64,
          boundsPt: { x: 160, y: 125, w: 220, h: 100 },
          replayChildLayout: { children: decorationChildren }
        }, {
          id: "roadmap-noisy-edit-guide",
          score: 64,
          boundsPt: { x: 170, y: 130, w: 200, h: 90 },
          replayChildLayout: {
            children: [
              ...decorationChildren,
              { kind: "shape", box: { x: 0.05, y: 0.42, w: 0.9, h: 0.18 }, style: { text: { placeholderText: "单击此处添加文本单击此处添加文本单击此处添加文本单击此处添加文本单击此处添加文本" } } }
            ]
          }
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.equal(shapes.length, 8);
  assert.equal(shapes.filter((shape) => shape.source.appliedPluginSupplementalReplay === true).length, 4);
  assert.ok(shapes.filter((shape) => shape.source.appliedPluginSupplementalReplay === true)
    .every((shape) => shape.source.appliedPluginSupplementalGroupId === "roadmap-decoration"));
});

test("component template native shapes directly replays learned iSlide arc-arrow components", () => {
  const gradient = {
    type: "linear",
    angleDeg: 0,
    stops: [
      { position: 0, color: "#FEA77C" },
      { position: 1, color: "#FD6D25" }
    ]
  };
  const arcStyle = {
    fill: "#FEA77C",
    stroke: "none",
    strokeWidthPt: 0,
    shapeType: "blockArc",
    gradient,
    shadow: { color: "#000000", alpha: 0.16, blurPt: 13, distancePt: 4, angleDeg: 90 },
    adjustments: [0.18, 0.82]
  };
  const image = templateImage({
    box: { x: 300, y: 120, w: 280, h: 240 },
    source: {
      layer: {
        templateFamily: "cycle-loop",
        diagramUnderstanding: { archetype: "cycle-loop", confidence: 0.92 }
      },
      componentAssetReadiness: {
        status: "applied-plugin-motif-ready",
        targetMotifs: ["arc-arrow"]
      },
      componentLocalAssets: [{
        provider: "islide",
        name: "islide-applied-arc-arrow.pptx",
        matchScore: 168,
        roleTags: ["applied-component", "template-layout"],
        reusePolicy: "inspect-openxml-applied-plugin-component",
        recommendedComponentGroups: [{
          id: "islide-arc-arrow-cycle-loop",
          score: 96,
          childCount: 14,
          shapeCount: 14,
          topColors: [
            { value: "#FEA77C", count: 28 },
            { value: "#FD6D25", count: 14 }
          ],
          structure: {
            primaryKind: "cycle-loop",
            primaryMotif: "arc-arrow",
            motifs: ["arc-arrow"],
            motifCounts: { "arc-arrow": 13 }
          },
          childLayout: {
            provider: "pptx-slide-ungrouped-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.18, y: 0.28, w: 0.40, h: 0.44 }, style: { ...arcStyle, rotation: 0 } },
              { kind: "shape", box: { x: 0.42, y: 0.28, w: 0.40, h: 0.44 }, style: { ...arcStyle, rotation: 180 } },
              { kind: "shape", box: { x: 0.08, y: 0.42, w: 0.20, h: 0.18 }, style: { ...arcStyle, shapeType: "bentArrow", rotation: 270 } },
              ...Array.from({ length: 11 }, (_, index) => {
                const angle = (index / 11) * Math.PI * 2;
                return {
                  kind: "shape",
                  box: {
                    x: 0.46 + Math.cos(angle) * 0.28,
                    y: 0.47 + Math.sin(angle) * 0.30,
                    w: 0.045,
                    h: 0.10
                  },
                  style: {
                    ...arcStyle,
                    rotation: Math.round((angle * 180 / Math.PI) + 90),
                    shadow: { color: "#000000", alpha: 0.10, blurPt: 8, distancePt: 2, angleDeg: 90 }
                  }
                };
              })
            ]
          }
        }]
      }]
    }
  });

  const result = createComponentTemplateNativeObjects([image], { widthPt: 960, heightPt: 540 });
  const shapes = result.shapes;

  assert.equal(image.source.componentTemplateGroupId, "islide-arc-arrow-cycle-loop");
  assert.equal(image.source.componentTemplateAssetMotifReady, true);
  assert.deepEqual(image.source.componentTemplateTargetMotifs, ["arc-arrow"]);
  assert.equal(shapes.length, 14);
  assert.equal(result.textBoxes.length, 0);
  assert.equal(shapes.filter((shape) => shape.source.appliedPluginDirectReplay === true).length, 14);
  assert.equal(shapes.filter((shape) => shape.source.matchedComponentAssetProvider === "islide").length, 14);
  assert.equal(shapes.filter((shape) => shape.style.gradient?.stops?.[1]?.color === "#FD6D25").length, 14);
  assert.equal(shapes.some((shape) => shape.source.componentTemplatePart === "cycle-node"), false);
  assert.equal(shapes[0].type, "blockarc");
  assert.equal(shapes.some((shape) => shape.type === "bentarrow"), true);
  assert.equal(shapes[0].style.gradient.stops[0].color, "#FEA77C");
  assert.equal(shapes[0].style.shadow.blurPt, 13);
  assert.deepEqual(shapes[0].style.adjustments, [0.18, 0.82]);
});

test("component template native shapes marks whole-process template replay on generated objects", () => {
  const image = templateImage({
    box: { x: 120, y: 100, w: 560, h: 180 },
    source: {
      layer: {
        templateFamily: "process-chain",
        diagramUnderstanding: {
          archetype: "flow-card-chain",
          visualNodeCount: 4,
          visualConnectorCount: 3
        }
      },
      componentAssetReadiness: {
        status: "applied-plugin-motif-ready",
        targetMotifs: ["linear-arrow-chain", "whole-process-template"]
      },
      componentLocalAssets: [{
        provider: "islide",
        name: "islide-applied-whole-process.pptx",
        roleTags: ["applied-component", "template-layout"],
        recommendedComponentGroups: [{
          id: "whole-process-template",
          score: 94,
          childCount: 4,
          shapeCount: 4,
          connectorCount: 1,
          structure: {
            kind: "process-chain",
            motifs: ["linear-arrow-chain", "whole-process-template"],
            motifCounts: { "linear-arrow-chain": 4, "whole-process-template": 5 }
          },
          childLayout: {
            provider: "pptx-slide-ungrouped-child-layout-v1",
            children: [
              {
                kind: "shape",
                box: { x: 0.02, y: 0.20, w: 0.18, h: 0.42 },
                style: {
                  fill: "#185ABD",
                  shapeType: "roundRect",
                  text: { text: "Step 1", placeholderText: true }
                }
              },
              {
                kind: "connector",
                box: { x: 0.22, y: 0.39, w: 0.16, h: 0.02 },
                style: { endArrow: "triangle", stroke: "#185ABD", connectorType: "straight" }
              },
              {
                kind: "shape",
                box: { x: 0.42, y: 0.20, w: 0.18, h: 0.42 },
                style: { fill: "#60A5FA", shapeType: "roundRect" }
              },
              {
                kind: "shape",
                box: { x: 0.70, y: 0.20, w: 0.18, h: 0.42 },
                style: { fill: "#93C5FD", shapeType: "roundRect" }
              }
            ]
          }
        }]
      }]
    }
  });

  const result = createComponentTemplateNativeObjects([image], { widthPt: 960, heightPt: 540 });

  assert.equal(image.source.componentTemplateWholeProcessApplied, true);
  assert.deepEqual(image.source.componentTemplateTargetMotifs, ["linear-arrow-chain", "whole-process-template"]);
  assert.ok(result.shapes.length >= 3);
  assert.ok(result.shapes.every((shape) => shape.source.matchedComponentWholeProcessTemplate === true));
  assert.ok(result.textBoxes.length >= 1);
  assert.ok(result.textBoxes.every((textBox) => textBox.source.matchedComponentWholeProcessTemplate === true));
});

test("component template native shapes emits applied custom geometry as editable freeforms", () => {
  const image = templateImage({
    box: { x: 120, y: 140, w: 240, h: 160 },
    source: {
      layer: { templateFamily: "cycle-loop" },
      componentLocalAssets: [{
        provider: "islide",
        roleTags: ["applied-component", "template-layout"],
        reusePolicy: "inspect-openxml-applied-plugin-component",
        recommendedComponentGroups: [{
          id: "custom-geometry",
          score: 92,
          childCount: 4,
          childLayout: {
            provider: "pptx-slide-ungrouped-child-layout-v1",
            children: [
              {
                kind: "shape",
                box: { x: 0.10, y: 0.20, w: 0.30, h: 0.36 },
                style: {
                  fill: "#FD6D25",
                  stroke: "none",
                  freeform: {
                    points: [
                      { x: 0, y: 0 },
                      { x: 1, y: 0.2 },
                      { x: 0.65, y: 1 },
                      { x: 0, y: 0 }
                    ],
                    segments: [
                      { type: "moveTo", points: [{ x: 0, y: 0 }] },
                      {
                        type: "cubicBezTo",
                        points: [
                          { x: 0.4, y: 0.05 },
                          { x: 0.8, y: 0.55 },
                          { x: 0.65, y: 1 }
                        ]
                      },
                      { type: "lnTo", points: [{ x: 0, y: 0 }] },
                      { type: "close", points: [] }
                    ],
                    closePath: true
                  }
                }
              },
              { kind: "shape", box: { x: 0.45, y: 0.20, w: 0.16, h: 0.16 }, style: { fill: "#FD6D25", shapeType: "ellipse" } },
              { kind: "shape", box: { x: 0.62, y: 0.20, w: 0.16, h: 0.16 }, style: { fill: "#FEA77C", shapeType: "ellipse" } },
              { kind: "shape", box: { x: 0.79, y: 0.20, w: 0.16, h: 0.16 }, style: { fill: "#FD6D25", shapeType: "ellipse" } }
            ]
          }
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.equal(shapes[0].type, "freeform");
  assert.deepEqual(shapes[0].points, [
    { x: 0, y: 0 },
    { x: 1, y: 0.2 },
    { x: 0.65, y: 1 },
    { x: 0, y: 0 }
  ]);
  assert.equal(shapes[0].style.closePath, true);
  assert.equal(shapes[0].style.freeformSegments[1].type, "cubicBezTo");
  assert.deepEqual(shapes[0].style.freeformSegments[1].points[2], { x: 0.65, y: 1 });
  assert.equal(shapes[0].style.freeform, undefined);
});

test("component template native shapes accepts width height boxes for applied layouts", () => {
  const image = templateImage({
    box: { x: 80, y: 100, width: 500, height: 160 },
    source: {
      layer: { templateFamily: "timeline" },
      componentLocalAssets: [{
        provider: "officeplus",
        roleTags: ["applied-component", "template-layout"],
        reusePolicy: "inspect-openxml-applied-plugin-component",
        recommendedComponentGroups: [{
          id: "applied-width-height-layout",
          score: 88,
          assetAppliedComponent: true,
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.05, y: 0.18, w: 0.18, h: 0.18 }, style: { fill: "#185ABD", shapeType: "roundRect" } },
              { kind: "shape", box: { x: 0.30, y: 0.18, w: 0.18, h: 0.18 }, style: { fill: "#09BF5D", shapeType: "rect" } },
              { kind: "shape", box: { x: 0.55, y: 0.18, w: 0.18, h: 0.18 }, style: { fill: "#185ABD", shapeType: "ellipse" } },
              { kind: "shape", box: { x: 0.80, y: 0.18, w: 0.14, h: 0.18 }, style: { fill: "#F59E0B", shapeType: "rect" } }
            ]
          }
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.equal(shapes.length, 4);
  assert.equal(shapes[0].box.w, 90);
  assert.equal(shapes[0].box.h, 28.8);
  assert.equal(image.source.componentTemplateGroupId, "applied-width-height-layout");
});

test("component template native shapes tags applied plugin child roles and keeps background behind", () => {
  const image = templateImage({
    box: { x: 100, y: 80, w: 400, h: 220 },
    source: {
      layer: { templateFamily: "process-chain" },
      componentLocalAssets: [{
        provider: "islide",
        roleTags: ["applied-component", "template-layout"],
        reusePolicy: "inspect-openxml-applied-plugin-component",
        recommendedComponentGroups: [{
          id: "applied-structured-card",
          score: 90,
          assetAppliedComponent: true,
          assetReusePolicy: "inspect-openxml-applied-plugin-component",
          childLayout: {
            provider: "pptx-slide-ungrouped-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.12, y: 0.28, w: 0.24, h: 0.32 }, style: { fill: "#185ABD", shapeType: "roundRect" } },
              { kind: "shape", box: { x: 0.02, y: 0.08, w: 0.96, h: 0.80 }, style: { fill: "#F8FAFC", shapeType: "roundRect", shadow: { color: "#111111", alpha: 0.16, blurPt: 5, distancePt: 1, angleDeg: 90 } } },
              { kind: "connector", box: { x: 0.38, y: 0.42, w: 0.18, h: 0.02 }, style: { stroke: "#185ABD", endArrow: "triangle" } },
              { kind: "shape", box: { x: 0.60, y: 0.30, w: 0.24, h: 0.28 }, style: { text: { placeholderText: "输入标题", fontSizePt: 18, align: "center" } } },
              { kind: "picture", box: { x: 0.86, y: 0.12, w: 0.08, h: 0.16 }, style: { picture: { embedRelId: "rId9", mediaTarget: "ppt/media/icon.png" } } }
            ]
          }
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.equal(shapes.length, 5);
  assert.equal(shapes[0].source.componentTemplatePart, "process-chain-applied-background");
  assert.equal(shapes[0].source.appliedPluginStructureRole, "background");
  assert.equal(shapes[1].source.componentTemplatePart, "process-chain-applied-node");
  assert.equal(shapes[1].source.appliedPluginStructureRole, "node");
  assert.equal(shapes[2].source.componentTemplatePart, "process-chain-applied-connector");
  assert.equal(shapes[2].source.appliedPluginStructureRole, "connector");
  assert.equal(shapes[3].source.componentTemplatePart, "process-chain-applied-text-slot");
  assert.equal(shapes[3].source.appliedPluginStructureRole, "text-slot");
  assert.equal(shapes[4].source.componentTemplatePart, "process-chain-applied-picture-shell");
  assert.equal(shapes[4].source.appliedPluginStructureRole, "picture");
  assert.deepEqual(shapes.map((shape) => shape.source.appliedPluginChildIndex), [1, 0, 2, 3, 4]);
});

test("component template native objects emit editable text boxes for applied plugin text children", () => {
    const image = templateImage({
      box: { x: 80, y: 100, w: 500, h: 160 },
      source: {
        layer: { templateFamily: "timeline" },
        componentLocalAssets: [{
          provider: "officeplus",
          name: "officeplus-applied-roadmap.pptx",
          roleTags: ["applied-component", "template-layout"],
          reusePolicy: "inspect-openxml-applied-plugin-component",
          recommendedComponentGroups: [{
            id: "applied-layout-text",
            score: 88,
            assetAppliedComponent: true,
            assetReusePolicy: "inspect-openxml-applied-plugin-component",
            childLayout: {
              provider: "pptx-slide-ungrouped-child-layout-v1",
              children: [
                { kind: "shape", box: { x: 0.05, y: 0.18, w: 0.18, h: 0.18 }, style: { fill: "#185ABD", shapeType: "roundRect", text: { placeholderText: "阶段一", fontSizePt: 16, color: "#FFFFFF", weight: "bold", align: "center", valign: "middle", vertical: "eavert", family: "Microsoft YaHei" } } },
                { kind: "connector", box: { x: 0.24, y: 0.27, w: 0.14, h: 0.02 }, style: { stroke: "#185ABD", endArrow: "triangle" } },
                { kind: "shape", box: { x: 0.40, y: 0.18, w: 0.18, h: 0.18 }, style: { fill: "none", shapeType: "rect", text: { placeholderText: "单击此处添加文本", fontSizePt: 12, color: "#333333" } } },
                { kind: "shape", box: { x: 0.75, y: 0.18, w: 0.18, h: 0.18 }, style: { fill: "#185ABD", shapeType: "ellipse" } }
              ]
            }
          }]
        }]
      }
    });

    const objects = createComponentTemplateNativeObjects([image], { widthPt: 960, heightPt: 540 });

    assert.equal(objects.shapes.length, 4);
    assert.equal(objects.textBoxes.length, 1);
    assert.equal(objects.textBoxes[0].text, "阶段一");
    assert.equal(objects.textBoxes[0].font.sizePt, 16);
    assert.equal(objects.textBoxes[0].font.weight, "bold");
    assert.equal(objects.textBoxes[0].font.color, "#FFFFFF");
    assert.equal(objects.textBoxes[0].style.vertical, "eavert");
    assert.equal(objects.textBoxes[0].source.detector, "plugin-component-template-native-textbox");
    assert.equal(objects.textBoxes[0].source.appliedPluginStructureRole, "node");
    assert.equal(objects.textBoxes[0].source.nativeComponentRole, "timeline-applied-node");
    assert.equal(objects.textBoxes[0].source.replacedTextShellId, "diagram-layer-timeline-applied-node-0");
    assert.equal(objects.shapes.find((shape) => shape.source.appliedPluginChildIndex === 2).style.stroke, "none");
  });

test("component template native shapes rejects spatially collapsed nested replay layouts", () => {
  const image = templateImage({
    source: {
      layer: { templateFamily: "matrix" },
      componentLocalAssets: [{
        provider: "officeplus",
        roleTags: ["applied-component"],
        reusePolicy: "inspect-openxml-applied-plugin-component",
        recommendedComponentGroups: [{
          id: "collapsed-replay",
          score: 96,
          childLayout: {
            children: [
              { kind: "shape", box: { x: 0, y: 0, w: 0.45, h: 0.28 }, style: { fill: "#185ABD" } },
              { kind: "shape", box: { x: 0.55, y: 0, w: 0.45, h: 0.28 }, style: { fill: "#F97316" } },
              { kind: "shape", box: { x: 0, y: 0.36, w: 0.45, h: 0.28 }, style: { fill: "#22C55E" } },
              { kind: "shape", box: { x: 0.55, y: 0.36, w: 0.45, h: 0.28 }, style: { fill: "#0EA5E9" } },
              { kind: "shape", box: { x: 0, y: 0.72, w: 0.45, h: 0.28 }, style: { fill: "#A855F7" } },
              { kind: "shape", box: { x: 0.55, y: 0.72, w: 0.45, h: 0.28 }, style: { fill: "#EF4444" } }
            ]
          },
          replayChildLayout: {
            children: Array.from({ length: 12 }, () => ({
              kind: "shape",
              box: { x: 0.02, y: 0.04, w: 0.12, h: 0.08 },
              style: { fill: "#F97316" }
            }))
          }
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });
  assert.equal(shapes.length, 6);
  assert.ok(shapes.every((shape) => shape.source.appliedPluginDirectReplay === true));
  assert.ok(Math.max(...shapes.map((shape) => shape.box.y + shape.box.h)) > image.box.y + image.box.h * 0.7);
});

test("component template native objects add supplemental text from sibling applied plugin groups", () => {
  const image = templateImage({
    box: { x: 100, y: 100, w: 720, h: 180 },
    source: {
      layer: { templateFamily: "process-chain" },
      componentLocalAssets: [{
        provider: "officeplus",
        name: "officeplus-applied-roadmap.pptx",
        roleTags: ["applied-component", "template-layout"],
        reusePolicy: "inspect-openxml-applied-plugin-component",
        recommendedComponentGroups: [{
          id: "decor-shell",
          score: 88,
          assetAppliedComponent: true,
          assetReusePolicy: "inspect-openxml-applied-plugin-component",
          boundsPt: { x: 200, y: 100, w: 400, h: 200 },
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.05, y: 0.10, w: 0.18, h: 0.18 }, style: { fill: "#185ABD", shapeType: "roundRect" } },
              { kind: "shape", box: { x: 0.30, y: 0.10, w: 0.18, h: 0.18 }, style: { fill: "#09BF5D", shapeType: "rect" } },
              { kind: "shape", box: { x: 0.55, y: 0.10, w: 0.18, h: 0.18 }, style: { fill: "#F59E0B", shapeType: "ellipse" } },
              { kind: "shape", box: { x: 0.80, y: 0.10, w: 0.14, h: 0.18 }, style: { fill: "#EF4444", shapeType: "diamond" } }
            ]
          }
        }, {
          id: "text-card",
          score: 52,
          matchScore: 52,
          boundsPt: { x: 100, y: 140, w: 200, h: 90 },
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.05, y: 0.10, w: 0.90, h: 0.28 }, style: { text: { placeholderText: "业务目标", fontSizePt: 18, color: "#185ABD", weight: "bold", align: "center" } } },
              { kind: "shape", box: { x: 0.05, y: 0.48, w: 0.90, h: 0.30 }, style: { text: { placeholderText: "单击此处输入相关文本内容", fontSizePt: 12, color: "#333333" } } }
            ]
          }
        }, {
          id: "text-card",
          score: 52,
          matchScore: 52,
          boundsPt: { x: 100, y: 140, w: 200, h: 90 },
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.05, y: 0.10, w: 0.90, h: 0.28 }, style: { text: { placeholderText: "业务目标", fontSizePt: 18, color: "#185ABD", weight: "bold", align: "center" } } }
            ]
          }
        }]
      }]
    }
  });

  const objects = createComponentTemplateNativeObjects([image], { widthPt: 960, heightPt: 540 }, {
    minScore: 58,
    sourceTextBoxes: [
      { id: "ocr-title", text: "增长飞轮", box: { x: 118, y: 120, w: 160, h: 28 } },
      { id: "ocr-body", text: "从线索到转化", box: { x: 150, y: 186, w: 560, h: 30 } }
    ]
  });

  assert.equal(objects.shapes.length, 4);
  assert.equal(objects.textBoxes.length, 2);
  assert.equal(objects.textBoxes[0].text, "业务目标");
  assert.equal(objects.textBoxes[0].source.detector, "plugin-component-template-supplemental-textbox");
  assert.equal(objects.textBoxes[0].source.componentTemplateSupplementalText, true);
  assert.equal(objects.textBoxes[1].text, "从线索到转化");
  assert.equal(objects.textBoxes[1].source.pluginPlaceholderTextSuppressed, true);
  assert.equal(objects.textBoxes[1].source.pluginPlaceholderTextBackfilled, true);
  assert.equal(objects.textBoxes[1].source.pluginTextBackfillSourceId, "ocr-body");
  assert.ok(objects.textBoxes[0].box.x >= 100);
  assert.ok(objects.textBoxes[0].box.x < 420);
});

test("component template native objects extract applied plugin picture media as images", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-template-media-"));
  const pptx = path.join(tmp, "officeplus-applied-media.pptx");
  const assetDir = path.join(tmp, "assets");
  writeStoredZip(pptx, {
    "[Content_Types].xml": "<Types/>",
    "ppt/slides/slide1.xml": "<p:sld/>",
    "ppt/media/image7.png": "fake-png-bytes"
  });
  const image = templateImage({
    box: { x: 80, y: 100, w: 500, h: 160 },
    source: {
      layer: { templateFamily: "timeline" },
      componentLocalAssets: [{
        provider: "officeplus",
        name: "officeplus-applied-media.pptx",
        path: pptx,
        roleTags: ["applied-component", "template-layout"],
        reusePolicy: "inspect-openxml-applied-plugin-component",
        recommendedComponentGroups: [{
          id: "applied-media-layout",
          score: 88,
          assetAppliedComponent: true,
          childLayout: {
            provider: "pptx-slide-ungrouped-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.05, y: 0.18, w: 0.18, h: 0.18 }, style: { fill: "#185ABD", shapeType: "roundRect" } },
              { kind: "shape", box: { x: 0.40, y: 0.18, w: 0.18, h: 0.18 }, style: { fill: "#09BF5D", shapeType: "rect" } },
              { kind: "shape", box: { x: 0.75, y: 0.18, w: 0.18, h: 0.18 }, style: { fill: "#185ABD", shapeType: "ellipse" } },
              { kind: "picture", box: { x: 0.88, y: -0.03, w: 0.08, h: 0.18 }, style: { picture: { embedRelId: "rId7", mediaTarget: "ppt/media/image7.png", opacity: 0.72 } } }
            ]
          }
        }]
      }]
    }
  });

  const objects = createComponentTemplateNativeObjects([image], { widthPt: 960, heightPt: 540 }, { assetDir });

  assert.equal(objects.images.length, 1);
  assert.equal(objects.images[0].source.detector, "plugin-component-template-native-picture");
  assert.equal(objects.images[0].source.appliedPluginPictureMediaTarget, "ppt/media/image7.png");
  assert.equal(objects.images[0].source.appliedPluginStructureRole, "picture");
  assert.equal(objects.images[0].source.nativeComponentRole, "timeline-applied-picture-shell");
  assert.equal(objects.images[0].style.opacity, 0.72);
  assert.equal(fs.readFileSync(objects.images[0].assetPath, "utf8"), "fake-png-bytes");
  assert.equal(objects.shapes.some((shape) => shape.source.appliedPluginPictureShell === true), false);
});

test("component template native shapes refuses low-score or non-template matches", () => {
  const lowScore = templateImage({
    source: {
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "weak", score: 20, childCount: 4 }]
      }]
    }
  });
  const wrongMode = templateImage({
    source: {
      componentRenderStrategy: { mode: "preserve-local-crop" }
    }
  });

  assert.equal(selectComponentGroupMatch(lowScore, { minScore: 58 }), null);
  assert.equal(selectComponentGroupMatch(wrongMode, { minScore: 58 }), null);
  assert.deepEqual(createComponentTemplateNativeShapes([lowScore, wrongMode]), []);
});

test("component template native shapes accepts sanitized matchScore when raw score is absent", () => {
  const image = templateImage({
    type: "fidelity-crop",
    source: {
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "sanitized-group", matchScore: 66, childCount: 3 }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.equal(image.source.componentTemplateGroupId, "sanitized-group");
  assert.ok(shapes.length > 0);
});

test("component template native shapes skips layers already handled by specialized rebuilders", () => {
  const image = templateImage({
    source: {
      assetHubCycleObjectified: true,
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "asset-hub-template", score: 90, childCount: 6, connectorCount: 4 }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.deepEqual(shapes, []);
  assert.equal(image.source.componentTemplateGroupApplied, undefined);
});

test("component template native shapes skips semantically split screenshot-flow fidelity regions", () => {
  const image = templateImage({
    source: {
      residualSplitMode: "process-with-screenshots-semantic-regions",
      reason: "case-study-diagram-graphics-preserved-as-content-region-crop",
      layer: {
        layerType: "illustration-zone",
        diagramUnderstanding: {
          archetype: "process-chain",
          visualAtomKindCounts: { "grid-line-candidate": 6 },
          visualGrid: { lineCount: 6 }
        }
      },
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "false-matrix-template", score: 88, childCount: 16, connectorCount: 0 }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.deepEqual(shapes, []);
  assert.equal(image.source.componentTemplateGroupApplied, undefined);
});

test("component template native shapes skips structured illustration card crops", () => {
  const image = templateImage({
    source: {
      detector: "illustration-card-graphic-underlay-crop",
      structuredIllustrationShellObjectified: true,
      reason: "multi-card-illustrations-preserved-as-content-region-crop",
      layer: {
        layerType: "illustration-zone",
        recommendedAction: "split-native-with-residual-crop",
        diagramUnderstanding: {
          archetype: "process-with-screenshots",
          visualAtomKindCounts: { "grid-line-candidate": 7 },
          visualGrid: { lineCount: 7 }
        }
      },
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "false-card-matrix-template", score: 92, childCount: 16, connectorCount: 0 }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.deepEqual(shapes, []);
  assert.equal(image.source.componentTemplateGroupApplied, undefined);
});

test("component template native shapes skips sparse diagrams that explicitly require fidelity crops", () => {
  const image = templateImage({
    source: {
      detector: "sparse-diagram-graphic-underlay-crop",
      recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident",
      reason: "sparse-complex-diagram-preserved-as-movable-crop",
      layer: {
        layerType: "diagram-zone",
        diagramUnderstanding: {
          archetype: "flow-card-chain",
          confidence: 0.95,
          nodeCount: 6,
          connectorCount: 5,
          componentStrategy: { templateFamily: "process-chain" }
        }
      },
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "false-process-template", score: 92, childCount: 6, connectorCount: 5 }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.deepEqual(shapes, []);
  assert.equal(image.source.componentTemplateGroupApplied, undefined);
});

test("component template native shapes can overlay trusted local template shells on protected sparse diagrams", () => {
  const image = templateImage({
    type: "fidelity-crop",
    source: {
      detector: "sparse-diagram-graphic-underlay-crop",
      recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident",
      reason: "sparse-complex-diagram-preserved-as-movable-crop",
      layer: {
        layerType: "diagram-zone",
        diagramUnderstanding: {
          archetype: "flow-card-chain",
          confidence: 0.95,
          nodeCount: 6,
          connectorCount: 5,
          componentStrategy: { templateFamily: "process-chain" }
        }
      },
      componentLocalAssets: [{
        assetKind: "presentation-template",
        recommendedComponentGroups: [{
          id: "trusted-process-template",
          score: 76,
          childCount: 8,
          shapeCount: 8,
          pictureCount: 0,
          connectorCount: 4
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.equal(image.source.componentTemplateGroupApplied, true);
  assert.equal(image.source.componentTemplateGroupId, "trusted-process-template");
  assert.ok(shapes.length > 0);
  assert.ok(shapes.every((shape) => shape.style.fill === "none" || shape.source.componentTemplatePart === "process-connector"));
});

test("component template native shapes skips foreground graphics that explicitly require fidelity crops", () => {
  const image = templateImage({
    source: {
      detector: "foreground-graphic-crop",
      recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident",
      reason: "complex-graphic-preserved-as-movable-crop",
      layer: {
        layerType: "diagram-zone",
        diagramUnderstanding: {
          archetype: "flow-card-chain",
          confidence: 0.95,
          residualCount: 12,
          componentStrategy: { templateFamily: "process-chain" }
        }
      },
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "false-foreground-template", score: 94, childCount: 8, connectorCount: 4 }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.deepEqual(shapes, []);
  assert.equal(image.source.componentTemplateGroupApplied, undefined);
});

test("component template native shapes prioritizes matrix evidence over hub-spoke guesses", () => {
  const image = templateImage({
    type: "fidelity-crop",
    box: { x: 46, y: 120, w: 865, h: 366 },
    source: {
      layer: {
        layerType: "illustration-zone",
        diagramUnderstanding: {
          archetype: "hub-spoke",
          componentStrategy: { templateFamily: "hub-spoke" },
          visualAtomKindCounts: { "grid-line-candidate": 8 },
          visualGrid: { lineCount: 8, rows: 3, columns: 4 }
        }
      },
      componentLocalAssets: [{
        recommendedComponentGroups: [{
          id: "wide-matrix-group",
          matchScore: 66,
          childCount: 14,
          shapeCount: 18,
          connectorCount: 0,
          boundsPt: { x: 0, y: 0, w: 860, h: 360 }
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.equal(image.source.componentTemplateFamilyApplied, "matrix");
  assert.ok(shapes.length > 0);
  assert.equal(shapes.some((shape) => shape.source.componentTemplatePart === "hub-spoke"), false);
  assert.ok(shapes
    .filter((shape) => shape.source.componentTemplatePart === "matrix-cell")
    .every((shape) => shape.style.fill === "none"));
});

test("component template native shapes lowers group threshold only for structured matrices", () => {
  const matrix = templateImage({
    box: { x: 30, y: 90, w: 820, h: 280 },
    source: {
      layer: {
        layerType: "table-zone",
        diagramUnderstanding: {
          archetype: "matrix-or-grid",
          visualAtomKindCounts: { "grid-line-candidate": 3 }
        }
      },
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "moderate-matrix", matchScore: 52.75, childCount: 8, shapeCount: 12 }]
      }]
    }
  });
  const weakProcess = templateImage({
    source: {
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "moderate-process", matchScore: 52.75, childCount: 4 }]
      }]
    }
  });

  assert.equal(selectComponentGroupMatch(matrix, { minScore: 58 }).id, "moderate-matrix");
  assert.equal(selectComponentGroupMatch(weakProcess, { minScore: 58 }), null);
  assert.equal(_private.hasStructuredMatrixEvidence(matrix), true);
  assert.equal(createComponentTemplateNativeShapes([matrix], { widthPt: 960, heightPt: 540 }).filter((shape) => shape.source.componentTemplatePart === "matrix-cell").length, 9);
});

test("component template native shapes does not draw remote-only matrix shells without actionable structure evidence", () => {
  const weakRemoteMatrix = templateImage({
    box: { x: 46.48, y: 148.88, w: 866.66, h: 360.75 },
    source: {
      componentLocalAssets: [],
      componentRenderStrategy: {
        mode: "plugin-component-template",
        bestCandidate: {
          sourceProvider: "officeplus",
          kind: "component",
          id: "MatlComponentContent-20568",
          title: "扁平3项箭头矩阵",
          reuseHint: "candidate-grouped-pptx-component",
          candidateScore: 58
        }
      },
      layer: {
        layerType: "table-zone",
        diagramUnderstanding: {
          archetype: "matrix-or-grid",
          visualAtomKindCounts: { "grid-line-candidate": 7 },
          visualGrid: { lineCount: 7 }
        }
      }
    }
  });
  const structuredRemoteMatrix = templateImage({
    box: { x: 46.48, y: 148.88, w: 866.66, h: 360.75 },
    source: {
      componentLocalAssets: [],
      componentRenderStrategy: {
        mode: "plugin-component-template",
        bestCandidate: {
          sourceProvider: "officeplus",
          kind: "component",
          id: "MatlComponentContent-15286",
          title: "渐变4项矩阵四象限",
          reuseHint: "candidate-grouped-pptx-component",
          candidateScore: 72,
          structureSignature: { primaryKind: "matrix", motifs: ["card-grid"] }
        }
      },
      layer: {
        layerType: "table-zone",
        diagramUnderstanding: {
          archetype: "matrix-or-grid",
          visualAtomKindCounts: { "grid-line-candidate": 7 },
          visualGrid: { lineCount: 7 }
        }
      }
    }
  });

  assert.equal(selectComponentGroupMatch(weakRemoteMatrix, { minScore: 58 }), null);
  assert.equal(createComponentTemplateNativeShapes([weakRemoteMatrix], { widthPt: 960, heightPt: 540 }).length, 0);
  assert.equal(_private.hasStructuredQuadrantEvidence(weakRemoteMatrix), false);
  assert.equal(selectComponentGroupMatch(structuredRemoteMatrix, { minScore: 58 }).id, "MatlComponentContent-15286");
});

test("component template native shapes lowers group threshold only for structured relationship diagrams", () => {
  const relationship = templateImage({
    box: { x: 260, y: 120, w: 380, h: 340 },
    source: {
      layer: {
        layerType: "diagram-zone",
        diagramUnderstanding: {
          archetype: "generic-node-diagram",
          nodeCount: 3,
          connectorCount: 2,
          visualAtomCount: 3
        }
      },
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "moderate-relationship", matchScore: 48.5, childCount: 10, connectorCount: 1 }]
      }]
    }
  });
  const screenshot = templateImage({
    source: {
      layer: {
        layerType: "screenshot-zone",
        diagramUnderstanding: {
          archetype: "generic-node-diagram",
          nodeCount: 3,
          connectorCount: 2
        }
      },
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "moderate-screenshot", matchScore: 48.5, childCount: 10, connectorCount: 1 }]
      }]
    }
  });

  assert.equal(_private.componentFamily(relationship, {}), "hub-spoke");
  assert.equal(selectComponentGroupMatch(relationship, { minScore: 58 }).id, "moderate-relationship");
  assert.equal(selectComponentGroupMatch(screenshot, { minScore: 58 }), null);
  assert.equal(_private.hasStructuredRelationshipEvidence(relationship), true);
  assert.equal(createComponentTemplateNativeShapes([relationship], { widthPt: 960, heightPt: 540 }).filter((shape) => shape.source.componentTemplatePart === "hub-node").length, 4);

  const topology = templateImage({
    source: {
      layer: {
        layerType: "diagram-zone",
        diagramUnderstanding: {
          archetype: "topology-diagram",
          nodeCount: 8,
          connectorCount: 7
        }
      },
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "moderate-topology", matchScore: 48.5, childCount: 8, connectorCount: 2 }]
      }]
    }
  });
  assert.equal(_private.componentFamily(topology, {}), "hub-spoke");
  assert.equal(selectComponentGroupMatch(topology, { minScore: 58 }).id, "moderate-topology");
});

test("component template native shapes rebuilds OfficePLUS cycle-loop candidates as loop components", () => {
  const image = templateImage({
    box: { x: 250, y: 130, w: 500, h: 320 },
    source: {
      componentRenderStrategy: {
        mode: "plugin-component-template",
        implementationMode: "auth-or-download-required",
        bestCandidate: {
          sourceProvider: "officeplus",
          kind: "component",
          id: "MatlComponentContent-13534",
          title: "扁平6项循环闭环",
          reuseHint: "candidate-grouped-pptx-component"
        }
      },
      layer: {
        layerType: "diagram-zone",
        templateFamily: "cycle-loop",
        diagramUnderstanding: {
          archetype: "generic-node-diagram",
          nodeCount: 6,
          connectorCount: 6,
          visualAtomCount: 12,
          componentStrategy: { templateFamily: "cycle-loop" }
        }
      },
      componentLocalAssets: [{
        provider: "officeplus",
        assetKind: "presentation-template",
        recommendedComponentGroups: [{
          id: "cycle-loop-template",
          matchScore: 49.5,
          childCount: 6,
          shapeCount: 14,
          connectorCount: 6,
          pictureCount: 0,
          topColors: [
            { value: "#2563EB", count: 6 },
            { value: "#16A34A", count: 4 }
          ]
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });
  const parts = shapes.map((shape) => shape.source.componentTemplatePart);

  assert.equal(_private.componentFamily(image, {}), "cycle-loop");
  assert.equal(_private.hasStructuredCycleEvidence(image), true);
  assert.equal(selectComponentGroupMatch(image, { minScore: 58 }).id, "cycle-loop-template");
  assert.equal(image.source.componentTemplateFamilyApplied, "cycle-loop");
  assert.equal(parts.filter((part) => part === "cycle-ring-segment").length, 6);
  assert.equal(parts.filter((part) => part === "cycle-arrowhead").length, 0);
  assert.equal(parts.filter((part) => part === "cycle-node").length, 6);
  assert.equal(parts.filter((part) => part === "cycle-center").length, 1);
  assert.equal(shapes.some((shape) => shape.source.componentTemplatePart === "hub-spoke"), false);
  assert.ok(shapes.filter((shape) => shape.source.componentTemplatePart === "cycle-ring-segment").every((shape) => shape.type === "arc" && shape.style.shapeType === "arc" && shape.style.endArrow === "triangle" && shape.source.routeStability === "fixed-geometry" && shape.source.semanticConnector?.direction === "forward"));
});

test("component template native shapes uses remote OfficePLUS cycle-loop candidates when download is unavailable", () => {
  const image = templateImage({
    box: { x: 250, y: 130, w: 500, h: 320 },
    source: {
      componentRenderStrategy: {
        mode: "plugin-component-template",
        implementationMode: "auth-or-download-required",
        applicationPlan: {
          sourceProvider: "officeplus",
          componentKind: "component",
          componentId: "MatlComponentContent-13534",
          requiresDownload: true
        },
        bestCandidate: {
          sourceProvider: "officeplus",
          kind: "component",
          id: "MatlComponentContent-13534",
          title: "扁平6项循环闭环",
          candidateScore: 70,
          confidence: 0.7,
          reuseHint: "candidate-grouped-pptx-component"
        }
      },
      layer: {
        layerType: "diagram-zone",
        templateFamily: "cycle-loop",
        diagramUnderstanding: {
          archetype: "generic-node-diagram",
          nodeCount: 6,
          connectorCount: 6,
          visualAtomCount: 12,
          componentStrategy: { templateFamily: "cycle-loop" }
        }
      },
      componentLocalAssets: []
    }
  });

  const match = selectComponentGroupMatch(image, { minScore: 58 });
  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.equal(match.id, "MatlComponentContent-13534");
  assert.equal(match.remoteCandidateOnly, true);
  assert.equal(image.source.componentTemplateFamilyApplied, "cycle-loop");
  assert.equal(image.source.componentTemplateGroupScore, 70);
  assert.equal(shapes.filter((shape) => shape.source.componentTemplatePart === "cycle-ring-segment").length, 6);
  assert.ok(shapes.every((shape) => shape.source.matchedComponentAssetName === "remote-officeplus-candidate"));
});

test("component template native shapes lowers group threshold only for structured process diagrams", () => {
  const process = templateImage({
    box: { x: 40, y: 150, w: 410, h: 290 },
    source: {
      layer: {
        layerType: "diagram-zone",
        diagramUnderstanding: {
          archetype: "process-with-screenshots",
          nodeCount: 10,
          connectorCount: 9
        }
      },
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "moderate-process-diagram", matchScore: 52.75, childCount: 6, connectorCount: 3 }]
      }]
    }
  });
  const screenshot = templateImage({
    source: {
      layer: {
        layerType: "screenshot-zone",
        diagramUnderstanding: {
          archetype: "process-with-screenshots",
          nodeCount: 10,
          connectorCount: 9
        }
      },
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "moderate-screenshot-process", matchScore: 52.75, childCount: 6, connectorCount: 3 }]
      }]
    }
  });

  assert.equal(_private.componentFamily(process, {}), "process-chain");
  assert.equal(selectComponentGroupMatch(process, { minScore: 58 }).id, "moderate-process-diagram");
  assert.equal(selectComponentGroupMatch(screenshot, { minScore: 58 }), null);
  assert.equal(_private.hasStructuredProcessEvidence(process), true);
  assert.ok(createComponentTemplateNativeShapes([process], { widthPt: 960, heightPt: 540 }).some((shape) => shape.source.componentTemplatePart === "process-node"));
});

test("component template native shapes lowers group threshold only for timeline evidence", () => {
  const timeline = templateImage({
    source: {
      layer: { templateFamily: "timeline", diagramUnderstanding: { archetype: "timeline" } },
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "moderate-timeline", matchScore: 52, childCount: 4 }]
      }]
    }
  });
  const process = templateImage({
    source: {
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "moderate-process", matchScore: 52, childCount: 4 }]
      }]
    }
  });

  assert.equal(selectComponentGroupMatch(timeline, { minScore: 58 }).id, "moderate-timeline");
  assert.equal(selectComponentGroupMatch(process, { minScore: 58 }), null);
  assert.equal(_private.hasStructuredTimelineEvidence(timeline), true);
});

test("component template native shapes adapts families instead of reusing one pattern", () => {
  const matrix = templateImage({
    box: { x: 10, y: 20, w: 360, h: 240 },
    source: {
      layer: { templateFamily: "matrix" },
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "matrix-group", score: 68, childCount: 9, shapeCount: 12 }]
      }]
    }
  });
  const hub = templateImage({
    source: {
      layer: { diagramUnderstanding: { archetype: "hub-spoke", confidence: 0.9 } },
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "hub-group", score: 72, connectorCount: 5 }]
      }]
    }
  });

  assert.equal(_private.componentFamily(matrix, { id: "matrix-group" }), "matrix");
  assert.equal(_private.componentFamily(hub, { id: "hub-group" }), "hub-spoke");
  assert.equal(createComponentTemplateNativeShapes([matrix]).filter((shape) => shape.source.componentTemplatePart === "matrix-cell").length, 9);
  assert.equal(createComponentTemplateNativeShapes([hub]).filter((shape) => shape.source.componentTemplatePart === "hub-node").length, 5);
});

test("component template native shapes treats swimlane grid process motifs as process components before matrix shells", () => {
  const swimlane = templateImage({
    box: { x: 36, y: 110, w: 894, h: 312 },
    source: {
      layer: {
        layerType: "table-zone",
        templateFamily: "grid-or-matrix",
        diagramUnderstanding: {
          archetype: "matrix-or-grid",
          nodeCount: 8,
          connectorCount: 0,
          targetMotifs: ["card-grid", "linear-arrow-chain", "whole-process-template", "branch-card-flow"],
          structureSignature: {
            layout: "swimlane",
            stepCount: 8,
            rows: 5,
            columns: 3,
            direction: "left-to-right-by-lane"
          },
          componentStrategy: {
            templateFamily: "process-chain",
            targetMotifs: ["card-grid", "linear-arrow-chain", "whole-process-template", "branch-card-flow"],
            structureSignature: {
              layout: "swimlane",
              stepCount: 8,
              rows: 5,
              columns: 3,
              direction: "left-to-right-by-lane"
            }
          }
        }
      },
      componentRenderStrategy: {
        mode: "plugin-component-template",
        targetMotifs: ["card-grid", "linear-arrow-chain", "whole-process-template", "branch-card-flow"],
        bestCandidate: {
          sourceProvider: "officeplus",
          kind: "component",
          id: "MatlComponentContent-3611",
          title: "渐变4项流程箭头",
          candidateScore: 72,
          structureSignature: { primaryKind: "matrix-or-grid", motifs: ["card-grid"] }
        }
      },
      componentLocalAssets: [{
        recommendedComponentGroups: [{ id: "swimlane-grid-process", score: 72, childCount: 8, shapeCount: 12 }]
      }]
    }
  });

  assert.equal(_private.componentFamily(swimlane, { id: "swimlane-grid-process", structureSignature: { primaryKind: "matrix-or-grid" } }), "process-chain");
  const shapes = createComponentTemplateNativeShapes([swimlane], { widthPt: 960, heightPt: 540 });
  assert.ok(shapes.some((shape) => shape.source.componentTemplatePart === "swimlane-lane"));
  assert.ok(shapes.some((shape) => shape.source.componentTemplatePart === "swimlane-node"));
  assert.equal(shapes.find((shape) => shape.source.componentTemplatePart === "swimlane-header").style.gradient.type, "linear");
  assert.equal(shapes.find((shape) => shape.source.componentTemplatePart === "swimlane-node").style.gradient.type, "linear");
  assert.ok(shapes.find((shape) => shape.source.componentTemplatePart === "swimlane-node").style.shadow.blurPt >= 5);
  assert.ok(shapes.find((shape) => shape.source.componentTemplatePart === "swimlane-connector").style.strokeWidthPt > 1.4);
  assert.equal(shapes.some((shape) => shape.source.componentTemplatePart === "matrix-cell"), false);
});

test("component template native shapes borrows swimlane styles from learned component child layout", () => {
  const swimlane = templateImage({
    box: { x: 36, y: 110, w: 894, h: 312 },
    source: {
      layer: {
        layerType: "table-zone",
        templateFamily: "grid-or-matrix",
        diagramUnderstanding: {
          archetype: "matrix-or-grid",
          nodeCount: 8,
          connectorCount: 0,
          targetMotifs: ["linear-arrow-chain", "whole-process-template"],
          structureSignature: { layout: "swimlane", stepCount: 8, rows: 4, columns: 3 }
        }
      },
      componentRenderStrategy: {
        mode: "plugin-component-template",
        targetMotifs: ["linear-arrow-chain", "whole-process-template"],
        bestCandidate: {
          sourceProvider: "islide",
          kind: "component",
          id: "styled-swimlane",
          title: "渐变流程组件",
          candidateScore: 82,
          structureSignature: { primaryKind: "matrix-or-grid", motifs: ["linear-arrow-chain"] }
        }
      },
      componentLocalAssets: [{
        recommendedComponentGroups: [{
          id: "styled-swimlane",
          score: 82,
          childCount: 8,
          shapeCount: 12,
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              {
                kind: "shape",
                box: { x: 0.02, y: 0.04, w: 0.94, h: 0.88 },
                style: { fill: "#F8FAFC", stroke: "#CBD5E1", shapeType: "roundRect", shadow: { color: "#111111", alpha: 0.12, blurPt: 7, distancePt: 1, angleDeg: 90 } }
              },
              {
                kind: "shape",
                box: { x: 0.08, y: 0.22, w: 0.18, h: 0.22 },
                style: {
                  fill: "#FFF7ED",
                  stroke: "#F97316",
                  strokeWidthPt: 2.4,
                  radiusRatio: 0.28,
                  gradient: {
                    type: "linear",
                    angleDeg: 25,
                    stops: [
                      { position: 0, color: "#FDBA74" },
                      { position: 1, color: "#FFF7ED" }
                    ]
                  },
                  shadow: { color: "#7C2D12", alpha: 0.22, blurPt: 9, distancePt: 2, angleDeg: 90 },
                  text: { placeholderText: "阶段一" }
                }
              },
              {
                kind: "connector",
                box: { x: 0.30, y: 0.32, w: 0.18, h: 0.02 },
                style: { stroke: "#F97316", strokeWidthPt: 2.75, endArrow: "diamond", connectorType: "curve", dash: "dash" }
              }
            ]
          }
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([swimlane], { widthPt: 960, heightPt: 540 });
  const header = shapes.find((shape) => shape.source.componentTemplatePart === "swimlane-header");
  const node = shapes.find((shape) => shape.source.componentTemplatePart === "swimlane-node");
  const connector = shapes.find((shape) => shape.source.componentTemplatePart === "swimlane-connector");

  assert.equal(header.style.gradient.angleDeg, 25);
  assert.equal(header.style.gradient.stops[0].color, "#FDBA74");
  assert.equal(header.style.text, undefined);
  assert.equal(node.style.stroke, "#F97316");
  assert.equal(node.style.strokeWidthPt, 2.4);
  assert.equal(node.style.shadow.blurPt, 9);
  assert.equal(node.style.text, undefined);
  assert.equal(connector.style.stroke, "#F97316");
  assert.equal(connector.style.strokeWidthPt, 2.75);
  assert.equal(connector.style.endArrow, "diamond");
  assert.equal(connector.style.connectorType, "curve");
  assert.equal(connector.style.dash, "dash");
});

test("component template native shapes uses remote OfficePLUS swimlane process candidates without local assets", () => {
  const swimlane = templateImage({
    box: { x: 36, y: 110, w: 894, h: 312 },
    source: {
      layer: {
        layerType: "table-zone",
        templateFamily: "grid-or-matrix",
        diagramUnderstanding: {
          archetype: "matrix-or-grid",
          nodeCount: 8,
          connectorCount: 0,
          targetMotifs: ["card-grid", "linear-arrow-chain", "whole-process-template", "branch-card-flow"],
          structureSignature: {
            layout: "swimlane",
            stepCount: 8,
            rows: 5,
            columns: 3,
            direction: "left-to-right-by-lane"
          },
          componentStrategy: {
            templateFamily: "process-chain",
            targetMotifs: ["card-grid", "linear-arrow-chain", "whole-process-template", "branch-card-flow"],
            structureSignature: {
              layout: "swimlane",
              stepCount: 8,
              rows: 5,
              columns: 3,
              direction: "left-to-right-by-lane"
            }
          }
        }
      },
      componentLocalAssets: [],
      componentRenderStrategy: {
        mode: "plugin-component-template",
        targetMotifs: ["card-grid", "linear-arrow-chain", "whole-process-template", "branch-card-flow"],
        bestCandidate: {
          sourceProvider: "officeplus",
          kind: "component",
          id: "MatlComponentContent-3611",
          title: "渐变4项流程箭头",
          candidateScore: 72,
          structureSignature: {
            primaryKind: "matrix-or-grid",
            motifs: ["card-grid", "linear-arrow-chain", "whole-process-template", "branch-card-flow"]
          }
        },
        applicationPlan: {
          sourceProvider: "officeplus",
          componentKind: "component",
          componentId: "MatlComponentContent-3611"
        }
      }
    }
  });

  assert.equal(selectComponentGroupMatch(swimlane, { minScore: 58 }).id, "MatlComponentContent-3611");
  assert.equal(_private.hasStructuredProcessEvidence(swimlane), true);
  const shapes = createComponentTemplateNativeShapes([swimlane], { widthPt: 960, heightPt: 540 });
  assert.ok(shapes.some((shape) => shape.source.componentTemplatePart === "swimlane-lane"));
  assert.equal(shapes.some((shape) => shape.source.componentTemplatePart === "matrix-cell"), false);
});

test("component template native shapes derives safe palettes from matched plugin groups", () => {
  const palette = _private.paletteFromMatch({
    topColors: [
      { value: "#FFFFFF", count: 31 },
      { value: "#000000", count: 9 },
      { value: "#185ABD", count: 5 },
      { value: "#09BF5D", count: 2 },
      { value: "url(javascript:alert(1))", count: 1 }
    ]
  }, {
    accents: ["#2F80ED"],
    neutral: "#64748B",
    softFills: ["#EAF3FF"]
  });

  assert.deepEqual(palette.accents, ["#185ABD", "#09BF5D"]);
  assert.equal(palette.softFills[0], "#DFE8F6");
  assert.match(palette.neutral, /^#[0-9A-F]{6}$/);
});

test("component template native shapes treats gray plugin colors as neutral not accents", () => {
  const palette = _private.paletteFromMatch({
    topColors: [
      { value: "#FFFFFF", count: 7 },
      { value: "#3A3A38", count: 4 },
      { value: "#107C41", count: 1 },
      { value: "#616161", count: 1 }
    ]
  }, {
    accents: ["#2F80ED"],
    neutral: "#64748B",
    softFills: ["#EAF3FF"]
  });

  assert.deepEqual(palette.accents, ["#107C41"]);
  assert.equal(palette.neutral, "#3A3A38");
});

test("component template native shapes uses learned child layout before generic process layout", () => {
  const image = templateImage({
    box: { x: 100, y: 80, w: 400, h: 200 },
    source: {
      componentLocalAssets: [{
        recommendedComponentGroups: [{
          id: "layout-guided",
          score: 80,
          childCount: 20,
          connectorCount: 3,
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              {
                kind: "shape",
                box: { x: 0.05, y: 0.2, w: 0.18, h: 0.35 },
                style: {
                  fill: "#FFF7ED",
                  stroke: "#F97316",
                  strokeWidthPt: 2,
                  shapeType: "roundrect",
                  adjustments: [0.36, 20, "bad"],
                  opacity: 0.72,
                  gradient: {
                    type: "linear",
                    angleDeg: 45,
                    stops: [
                      { position: 0, color: "#FFF7ED" },
                      { position: 1, color: "#FDBA74" }
                    ]
                  },
                  shadow: {
                    color: "#334155",
                    alpha: 0.28,
                    blurPt: 6,
                    distancePt: 2,
                    angleDeg: 135
                  }
                }
              },
              {
                kind: "connector",
                box: { x: 0.24, y: 0.36, w: 0.2, h: 0.02 },
                style: {
                  stroke: "#64748B",
                  strokeWidthPt: 2.25,
                  endArrow: "diamond",
                  connectorType: "curve",
                  dash: "dash"
                }
              },
              {
                kind: "shape",
                box: { x: 0.45, y: 0.15, w: 0.2, h: 0.4 },
                style: {
                  fill: "#ECFDF5",
                  stroke: "#10B981",
                  strokeWidthPt: 1.5,
                  shapeType: "ellipse"
                }
              },
              { kind: "shape", box: { x: 0.76, y: 0.2, w: 0.18, h: 0.35 } }
            ]
          }
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });
  const nodes = shapes.filter((shape) => shape.source.componentTemplatePart === "process-node");
  const connectors = shapes.filter((shape) => shape.source.componentTemplatePart === "process-connector");

  assert.equal(nodes.length, 3);
  assert.deepEqual(nodes[0].box, { x: 120, y: 120, w: 72, h: 70 });
  assert.deepEqual(nodes[1].box, { x: 280, y: 110, w: 80, h: 80 });
  assert.equal(nodes[0].style.fill, "#FFF7ED");
  assert.equal(nodes[0].style.stroke, "#F97316");
  assert.equal(nodes[0].style.strokeWidthPt, 2);
  assert.deepEqual(nodes[0].style.adjustments, [0.36, 10]);
  assert.equal(nodes[0].style.opacity, 0.72);
  assert.deepEqual(nodes[0].style.gradient, {
    type: "linear",
    angleDeg: 45,
    stops: [
      { position: 0, color: "#FFF7ED" },
      { position: 1, color: "#FDBA74" }
    ]
  });
  assert.deepEqual(nodes[0].style.shadow, {
    color: "#334155",
    alpha: 0.28,
    blurPt: 6,
    distancePt: 2,
    angleDeg: 135
  });
  assert.equal(nodes[1].type, "ellipse");
  assert.equal(nodes[1].style.fill, "#ECFDF5");
  assert.equal(nodes[1].style.stroke, "#10B981");
  assert.equal(nodes[1].style.strokeWidthPt, 1.5);
  assert.deepEqual(nodes[0].source.matchedComponentChildLayout, {
    provider: "pptx-group-child-layout-v1",
    boundsSource: "",
    childBoxCount: 4,
    usableNodeBoxes: 3
  });
  assert.equal(connectors.length, 2);
  assert.ok(connectors.every((connector) => connector.box.w > 0 && connector.box.h > 0));
  assert.equal(connectors[0].source.connectorSemantic, "node-to-node");
  assert.equal(connectors[0].source.fromNodeIndex, 0);
  assert.equal(connectors[0].source.toNodeIndex, 1);
  assert.equal(connectors[0].source.fromAnchor, "right");
  assert.equal(connectors[0].source.toAnchor, "left");
  assert.equal(connectors[0].source.connectorAxis, "horizontal");
  assert.equal(connectors[0].style.stroke, "#64748B");
  assert.equal(connectors[0].style.strokeWidthPt, 2.25);
  assert.equal(connectors[0].style.endArrow, "diamond");
  assert.equal(connectors[0].style.connectorType, "curve");
  assert.equal(connectors[0].style.dash, "dash");
  assert.deepEqual(connectors[0].style.startAnchor, {
    elementId: "diagram-layer-process-node-0",
    side: "right",
    position: 0.5
  });
  assert.deepEqual(connectors[0].style.endAnchor, {
    elementId: "diagram-layer-process-node-1",
    side: "left",
    position: 0.5
  });
  assert.equal(connectors[1].source.connectorSource, "plugin-child-layout-auto-gap-fill");
  assert.equal(connectors[1].source.fromNodeIndex, 1);
  assert.equal(connectors[1].source.toNodeIndex, 2);
});

test("component template native shapes reuses learned process accent bars without treating them as nodes", () => {
  const image = templateImage({
    box: { x: 100, y: 80, w: 420, h: 200 },
    source: {
      componentLocalAssets: [{
        recommendedComponentGroups: [{
          id: "layout-guided-with-accents",
          score: 80,
          topColors: [
            { value: "#0EA5E9", count: 4 },
            { value: "#22C55E", count: 4 },
            { value: "#94A3B8", count: 2 }
          ],
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.05, y: 0.2, w: 0.22, h: 0.38 } },
              { kind: "shape", box: { x: 0.07, y: 0.22, w: 0.18, h: 0.035 } },
              { kind: "shape", box: { x: 0.39, y: 0.2, w: 0.22, h: 0.38 } },
              { kind: "shape", box: { x: 0.41, y: 0.22, w: 0.18, h: 0.035 } },
              { kind: "shape", box: { x: 0.73, y: 0.2, w: 0.22, h: 0.38 } },
              { kind: "shape", box: { x: 0.75, y: 0.22, w: 0.18, h: 0.035 } }
            ]
          }
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });
  const nodes = shapes.filter((shape) => shape.source.componentTemplatePart === "process-node");
  const accents = shapes.filter((shape) => shape.source.componentTemplatePart === "process-accent");

  assert.equal(nodes.length, 3);
  assert.equal(accents.length, 3);
  assert.deepEqual(accents[0].box, { x: 129.4, y: 124, w: 75.6, h: 7 });
  assert.equal(accents[0].style.fill, "#0EA5E9");
  assert.equal(accents[1].style.fill, "#22C55E");
  assert.ok(nodes.every((node) => node.box.h > 60));
});

test("component template native shapes reuses learned side accents and badges", () => {
  const image = templateImage({
    box: { x: 100, y: 80, w: 420, h: 200 },
    source: {
      componentLocalAssets: [{
        recommendedComponentGroups: [{
          id: "layout-guided-with-side-accents-and-badges",
          score: 80,
          topColors: [
            { value: "#0EA5E9", count: 4 },
            { value: "#22C55E", count: 4 },
            { value: "#94A3B8", count: 2 }
          ],
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.05, y: 0.2, w: 0.22, h: 0.38 } },
              { kind: "shape", box: { x: 0.055, y: 0.22, w: 0.015, h: 0.34 } },
              { kind: "shape", box: { x: 0.07, y: 0.14, w: 0.05, h: 0.105 } },
              { kind: "shape", box: { x: 0.39, y: 0.2, w: 0.22, h: 0.38 } },
              { kind: "shape", box: { x: 0.395, y: 0.22, w: 0.015, h: 0.34 } },
              { kind: "shape", box: { x: 0.41, y: 0.14, w: 0.05, h: 0.105 } },
              { kind: "shape", box: { x: 0.73, y: 0.2, w: 0.22, h: 0.38 } },
              { kind: "shape", box: { x: 0.735, y: 0.22, w: 0.015, h: 0.34 } },
              { kind: "shape", box: { x: 0.75, y: 0.14, w: 0.05, h: 0.105 } }
            ]
          }
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });
  const nodes = shapes.filter((shape) => shape.source.componentTemplatePart === "process-node");
  const sideAccents = shapes.filter((shape) => shape.source.componentTemplatePart === "process-side-accent");
  const badges = shapes.filter((shape) => shape.source.componentTemplatePart === "process-badge");

  assert.equal(nodes.length, 3);
  assert.equal(sideAccents.length, 3);
  assert.equal(badges.length, 3);
  assert.deepEqual(sideAccents[0].box, { x: 123.1, y: 124, w: 6.3, h: 68 });
  assert.deepEqual(badges[0].box, { x: 129.4, y: 108, w: 21, h: 21 });
  assert.equal(sideAccents[0].style.fill, "#0EA5E9");
  assert.equal(sideAccents[1].style.fill, "#22C55E");
  assert.equal(badges[0].type, "ellipse");
  assert.equal(badges[0].style.stroke, "#FFFFFF");
});

test("component template native shapes reuses learned group backgrounds and title pills", () => {
  const image = templateImage({
    box: { x: 100, y: 80, w: 420, h: 220 },
    source: {
      componentLocalAssets: [{
        recommendedComponentGroups: [{
          id: "layout-guided-with-group-chrome",
          score: 80,
          topColors: [
            { value: "#0EA5E9", count: 4 },
            { value: "#22C55E", count: 4 },
            { value: "#94A3B8", count: 2 }
          ],
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.03, y: 0.12, w: 0.94, h: 0.72 } },
              { kind: "shape", box: { x: 0.30, y: 0.05, w: 0.40, h: 0.09 } },
              { kind: "shape", box: { x: 0.08, y: 0.28, w: 0.22, h: 0.36 } },
              { kind: "shape", box: { x: 0.39, y: 0.28, w: 0.22, h: 0.36 } },
              { kind: "shape", box: { x: 0.70, y: 0.28, w: 0.22, h: 0.36 } }
            ]
          }
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });
  const nodes = shapes.filter((shape) => shape.source.componentTemplatePart === "process-node");
  const backgrounds = shapes.filter((shape) => shape.source.componentTemplatePart === "process-group-background");
  const titlePills = shapes.filter((shape) => shape.source.componentTemplatePart === "process-title-pill");

  assert.equal(nodes.length, 3);
  assert.equal(backgrounds.length, 1);
  assert.equal(titlePills.length, 1);
  assert.deepEqual(backgrounds[0].box, { x: 112.6, y: 106.4, w: 394.8, h: 158.4 });
  assert.deepEqual(titlePills[0].box, { x: 226, y: 91, w: 168, h: 19.8 });
  assert.equal(backgrounds[0].style.shadow.alpha, 0.10);
  assert.equal(titlePills[0].style.fill, "#0EA5E9");
  assert.equal(shapes[0].source.componentTemplatePart, "process-group-background");
});

test("component template native shapes uses learned child layout for matrix cells", () => {
  const image = templateImage({
    box: { x: 20, y: 40, w: 300, h: 200 },
    source: {
      layer: { templateFamily: "matrix" },
      componentLocalAssets: [{
        recommendedComponentGroups: [{
          id: "matrix-layout-guided",
          score: 80,
          childCount: 8,
          shapeCount: 8,
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0, y: 0, w: 0.45, h: 0.4 } },
              { kind: "shape", box: { x: 0.55, y: 0, w: 0.45, h: 0.4 } },
              { kind: "shape", box: { x: 0, y: 0.6, w: 0.45, h: 0.4 } },
              { kind: "shape", box: { x: 0.55, y: 0.6, w: 0.45, h: 0.4 } }
            ]
          }
        }]
      }]
    }
  });

  const cells = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 })
    .filter((shape) => shape.source.componentTemplatePart === "matrix-cell");

  assert.equal(cells.length, 4);
  assert.deepEqual(cells[3].box, { x: 185, y: 160, w: 135, h: 80 });
});

test("component template native shapes reuses learned matrix accent bars", () => {
  const image = templateImage({
    box: { x: 20, y: 40, w: 300, h: 200 },
    source: {
      layer: { templateFamily: "matrix" },
      componentLocalAssets: [{
        recommendedComponentGroups: [{
          id: "matrix-layout-with-accents",
          score: 80,
          topColors: [
            { value: "#2563EB", count: 4 },
            { value: "#F97316", count: 4 },
            { value: "#CBD5E1", count: 2 }
          ],
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0, y: 0, w: 0.45, h: 0.4 } },
              { kind: "shape", box: { x: 0.03, y: 0.03, w: 0.38, h: 0.035 } },
              { kind: "shape", box: { x: 0.55, y: 0, w: 0.45, h: 0.4 } },
              { kind: "shape", box: { x: 0.58, y: 0.03, w: 0.38, h: 0.035 } },
              { kind: "shape", box: { x: 0, y: 0.6, w: 0.45, h: 0.4 } },
              { kind: "shape", box: { x: 0.03, y: 0.63, w: 0.38, h: 0.035 } },
              { kind: "shape", box: { x: 0.55, y: 0.6, w: 0.45, h: 0.4 } },
              { kind: "shape", box: { x: 0.58, y: 0.63, w: 0.38, h: 0.035 } }
            ]
          }
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });
  const cells = shapes.filter((shape) => shape.source.componentTemplatePart === "matrix-cell");
  const accents = shapes.filter((shape) => shape.source.componentTemplatePart === "matrix-accent");

  assert.equal(cells.length, 4);
  assert.equal(accents.length, 4);
  assert.deepEqual(accents[0].box, { x: 29, y: 46, w: 114, h: 7 });
  assert.deepEqual(accents[3].box, { x: 194, y: 166, w: 114, h: 7 });
  assert.equal(accents[0].style.fill, "#2563EB");
  assert.equal(accents[1].style.fill, "#F97316");
});

test("component template group matcher prefers exact learned chart motifs for plugin groups", () => {
  const asset = {
    learningSummary: {
      componentCatalog: [
        {
          id: "generic-chart-group",
          boundsPt: { x: 0, y: 0, w: 400, h: 220 },
          childCount: 8,
          shapeCount: 8,
          pictureCount: 0,
          componentScore: 92,
          structure: { kind: "bar-chart", motifs: ["card-grid"], motifCounts: { "card-grid": 3 } },
          childLayout: { children: [{ kind: "shape", box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }] }
        },
        {
          id: "bubble-chart-group",
          boundsPt: { x: 0, y: 0, w: 420, h: 220 },
          childCount: 10,
          shapeCount: 10,
          pictureCount: 0,
          componentScore: 76,
          structure: {
            kind: "bubble-chart",
            motifs: ["bubble-scatter-chart"],
            motifCounts: { "bubble-scatter-chart": 5 }
          },
          childLayout: {
            children: [
              { kind: "shape", box: { x: 0.12, y: 0.20, w: 0.10, h: 0.10 }, style: { shapeType: "ellipse", fill: "#60A5FA" } },
              { kind: "shape", box: { x: 0.34, y: 0.45, w: 0.16, h: 0.16 }, style: { shapeType: "ellipse", fill: "#F97316" } },
              { kind: "shape", box: { x: 0.62, y: 0.28, w: 0.12, h: 0.12 }, style: { shapeType: "ellipse", fill: "#22C55E" } }
            ]
          }
        }
      ]
    }
  };
  const evaluation = evaluateComponentGroupsForLayer({
    layer: {
      layerType: "chart-zone",
      templateFamily: "scatter-chart",
      plan: { targetMotifs: ["bubble-scatter-chart"] },
      aspectRatio: 1.9
    },
    asset
  });

  assert.equal(evaluation.recommendedGroups[0].id, "bubble-chart-group");
  assert.ok(evaluation.recommendedGroups[0].matchReasons.includes("learned-bubble-scatter-chart-motif"));
  assert.equal(evaluation.recommendedGroups[0].structure.kind, "bubble-chart");
  assert.deepEqual(evaluation.recommendedGroups[0].structure.motifs, ["bubble-scatter-chart"]);
});

test("component template group matcher preserves treemap and segmented donut motifs through sanitization", () => {
  const asset = {
    learningSummary: {
      componentCatalog: [
        {
          id: "treemap-group",
          boundsPt: { x: 0, y: 0, w: 500, h: 260 },
          childCount: 9,
          shapeCount: 9,
          pictureCount: 0,
          componentScore: 82,
          structure: {
            kind: "treemap",
            motifs: ["treemap-chart"],
            motifCounts: { "treemap-chart": 6 }
          },
          childLayout: {
            children: [
              { kind: "shape", box: { x: 0.00, y: 0.00, w: 0.50, h: 0.58 }, style: { fill: "#2563EB", shapeType: "rect" } },
              { kind: "shape", box: { x: 0.50, y: 0.00, w: 0.25, h: 0.58 }, style: { fill: "#60A5FA", shapeType: "rect" } },
              { kind: "shape", box: { x: 0.75, y: 0.00, w: 0.25, h: 0.58 }, style: { fill: "#93C5FD", shapeType: "rect" } },
              { kind: "shape", box: { x: 0.00, y: 0.58, w: 1.00, h: 0.42 }, style: { fill: "#DBEAFE", shapeType: "rect" } }
            ]
          }
        },
        {
          id: "donut-group",
          boundsPt: { x: 0, y: 0, w: 260, h: 250 },
          childCount: 7,
          shapeCount: 7,
          pictureCount: 0,
          componentScore: 80,
          structure: {
            kind: "segmented-donut",
            motifs: ["donut-segment-chart"],
            motifCounts: { "donut-segment-chart": 4 }
          },
          childLayout: {
            children: [
              { kind: "shape", box: { x: 0.10, y: 0.10, w: 0.35, h: 0.35 }, style: { fill: "#F97316", shapeType: "donut" } },
              { kind: "shape", box: { x: 0.45, y: 0.10, w: 0.35, h: 0.35 }, style: { fill: "#FDBA74", shapeType: "donut" } },
              { kind: "shape", box: { x: 0.25, y: 0.48, w: 0.35, h: 0.35 }, style: { fill: "#FED7AA", shapeType: "donut" } }
            ]
          }
        }
      ]
    }
  };

  const treemap = evaluateComponentGroupsForLayer({
    layer: {
      layerType: "chart-zone",
      templateFamily: "treemap-chart",
      plan: { targetMotifs: ["treemap-chart"] },
      aspectRatio: 1.9
    },
    asset
  }).recommendedGroups[0];
  const donut = evaluateComponentGroupsForLayer({
    layer: {
      layerType: "chart-zone",
      templateFamily: "donut-chart",
      plan: { targetMotifs: ["donut-segment-chart"] },
      aspectRatio: 1
    },
    asset
  }).recommendedGroups[0];

  assert.equal(treemap.id, "treemap-group");
  assert.equal(treemap.structure.kind, "treemap");
  assert.deepEqual(treemap.structure.motifs, ["treemap-chart"]);
  assert.ok(treemap.matchReasons.includes("learned-treemap-chart-motif"));
  assert.equal(donut.id, "donut-group");
  assert.equal(donut.structure.kind, "segmented-donut");
  assert.deepEqual(donut.structure.motifs, ["donut-segment-chart"]);
  assert.ok(donut.matchReasons.includes("learned-donut-segment-chart-motif"));
});

test("component template group matcher preserves learned specialty diagram motifs", () => {
  const asset = {
    learningSummary: {
      componentCatalog: [
        {
          id: "generic-rings",
          boundsPt: { x: 0, y: 0, w: 260, h: 240 },
          childCount: 5,
          shapeCount: 5,
          pictureCount: 0,
          componentScore: 80,
          structure: {
            kind: "concentric-circles",
            motifs: ["concentric-circles", "ring-node"],
            motifCounts: { "concentric-circles": 3, "ring-node": 3 }
          },
          childLayout: {
            children: [
              { kind: "shape", box: { x: 0.05, y: 0.05, w: 0.90, h: 0.90 }, style: { shapeType: "donut" } },
              { kind: "shape", box: { x: 0.20, y: 0.20, w: 0.60, h: 0.60 }, style: { shapeType: "donut" } },
              { kind: "shape", box: { x: 0.35, y: 0.35, w: 0.30, h: 0.30 }, style: { shapeType: "ellipse" } }
            ]
          }
        },
        {
          id: "gauge-dial",
          boundsPt: { x: 0, y: 0, w: 320, h: 180 },
          childCount: 4,
          shapeCount: 4,
          pictureCount: 0,
          componentScore: 76,
          structure: {
            kind: "gauge-chart",
            motifs: ["gauge-chart"],
            motifCounts: { "gauge-chart": 3 }
          },
          childLayout: {
            children: [
              { kind: "shape", box: { x: 0.08, y: 0.20, w: 0.84, h: 0.70 }, style: { shapeType: "blockArc" } },
              { kind: "shape", box: { x: 0.46, y: 0.55, w: 0.08, h: 0.35 }, style: { shapeType: "triangle" } },
              { kind: "shape", box: { x: 0.42, y: 0.62, w: 0.16, h: 0.16 }, style: { shapeType: "ellipse" } }
            ]
          }
        }
      ]
    }
  };

  const concentric = evaluateComponentGroupsForLayer({
    layer: {
      layerType: "diagram-zone",
      templateFamily: "concentric-circles",
      plan: { targetMotifs: ["concentric-circles", "ring-node"] },
      aspectRatio: 1
    },
    asset
  }).recommendedGroups[0];
  const gauge = evaluateComponentGroupsForLayer({
    layer: {
      layerType: "chart-zone",
      templateFamily: "gauge-chart",
      plan: { targetMotifs: ["gauge-chart"] },
      aspectRatio: 1.8
    },
    asset
  }).recommendedGroups[0];

  assert.equal(concentric.id, "generic-rings");
  assert.deepEqual(concentric.structure.motifs, ["concentric-circles", "ring-node"]);
  assert.ok(concentric.matchReasons.includes("learned-concentric-circles-motif"));
  assert.equal(gauge.id, "gauge-dial");
  assert.deepEqual(gauge.structure.motifs, ["gauge-chart"]);
  assert.ok(gauge.matchReasons.includes("learned-gauge-chart-motif"));
});

test("component template native shapes replays learned treemap chart tiles", () => {
  const image = templateImage({
    box: { x: 20, y: 40, w: 300, h: 200 },
    source: {
      layer: {
        templateFamily: "treemap-chart",
        diagramUnderstanding: {
          archetype: "treemap-chart",
          targetMotifs: ["treemap-chart"]
        }
      },
      componentLocalAssets: [{
        provider: "officeplus",
        name: "officeplus-treemap-components.pptx",
        recommendedComponentGroups: [{
          id: "treemap-layout-guided",
          score: 86,
          childCount: 4,
          shapeCount: 4,
          pictureCount: 0,
          structure: {
            kind: "treemap",
            motifs: ["treemap-chart"],
            motifCounts: { "treemap-chart": 4 }
          },
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.00, y: 0.00, w: 0.50, h: 0.58 }, style: { fill: "#2563EB", shapeType: "rect" } },
              { kind: "shape", box: { x: 0.50, y: 0.00, w: 0.25, h: 0.58 }, style: { fill: "#60A5FA", shapeType: "rect" } },
              { kind: "shape", box: { x: 0.75, y: 0.00, w: 0.25, h: 0.58 }, style: { fill: "#93C5FD", shapeType: "rect" } },
              { kind: "shape", box: { x: 0.00, y: 0.58, w: 1.00, h: 0.42 }, style: { fill: "#DBEAFE", shapeType: "rect" } }
            ]
          }
        }]
      }]
    }
  });

  const tiles = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 })
    .filter((shape) => shape.source.componentTemplatePart === "chart-treemap-tile");

  assert.equal(image.source.componentTemplateFamilyApplied, "treemap-chart");
  assert.equal(tiles.length, 4);
  assert.deepEqual(tiles[0].box, { x: 20, y: 40, w: 150, h: 116 });
  assert.deepEqual(tiles[3].box, { x: 20, y: 156, w: 300, h: 84 });
  assert.equal(tiles[0].style.fill, "#2563EB");
  assert.equal(tiles[0].source.layoutPreservation, "component-chart-child-layout");
  assert.equal(tiles[0].source.chartTemplateMotif, "treemap-chart");
});

test("component template native shapes replays learned bubble and segmented donut chart children", () => {
  const bubble = templateImage({
    box: { x: 100, y: 80, w: 320, h: 180 },
    source: {
      layer: {
        templateFamily: "scatter-chart",
        diagramUnderstanding: {
          archetype: "scatter-chart",
          targetMotifs: ["bubble-scatter-chart"]
        }
      },
      componentLocalAssets: [{
        provider: "islide",
        name: "islide-bubble-chart-components.pptx",
        recommendedComponentGroups: [{
          id: "bubble-layout-guided",
          score: 84,
          childCount: 3,
          shapeCount: 3,
          pictureCount: 0,
          structure: {
            kind: "bubble-chart",
            motifs: ["bubble-scatter-chart"],
            motifCounts: { "bubble-scatter-chart": 3 }
          },
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.12, y: 0.20, w: 0.10, h: 0.18 }, style: { shapeType: "ellipse", fill: "#60A5FA", opacity: 0.72 } },
              { kind: "shape", box: { x: 0.34, y: 0.45, w: 0.16, h: 0.28 }, style: { shapeType: "ellipse", fill: "#F97316" } },
              { kind: "shape", box: { x: 0.62, y: 0.28, w: 0.12, h: 0.22 }, style: { shapeType: "ellipse", fill: "#22C55E" } }
            ]
          }
        }]
      }]
    }
  });
  const donut = templateImage({
    id: "donut-layer",
    box: { x: 460, y: 80, w: 220, h: 200 },
    source: {
      layer: {
        templateFamily: "donut-chart",
        diagramUnderstanding: {
          archetype: "donut-chart",
          targetMotifs: ["donut-segment-chart"]
        }
      },
      componentLocalAssets: [{
        provider: "officeplus",
        name: "officeplus-donut-components.pptx",
        recommendedComponentGroups: [{
          id: "donut-layout-guided",
          score: 85,
          childCount: 3,
          shapeCount: 3,
          pictureCount: 0,
          structure: {
            kind: "segmented-donut",
            motifs: ["donut-segment-chart"],
            motifCounts: { "donut-segment-chart": 3 }
          },
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.08, y: 0.12, w: 0.38, h: 0.38 }, style: { shapeType: "donut", fill: "#F97316" } },
              { kind: "shape", box: { x: 0.48, y: 0.12, w: 0.38, h: 0.38 }, style: { shapeType: "donut", fill: "#FDBA74" } },
              { kind: "shape", box: { x: 0.28, y: 0.52, w: 0.38, h: 0.38 }, style: { shapeType: "donut", fill: "#FED7AA" } }
            ]
          }
        }]
      }]
    }
  });

  const bubbleShapes = createComponentTemplateNativeShapes([bubble], { widthPt: 960, heightPt: 540 })
    .filter((shape) => shape.source.componentTemplatePart === "chart-bubble");
  const donutShapes = createComponentTemplateNativeShapes([donut], { widthPt: 960, heightPt: 540 })
    .filter((shape) => shape.source.componentTemplatePart === "chart-donut-segment");

  assert.equal(bubble.source.componentTemplateFamilyApplied, "scatter-chart");
  assert.equal(bubbleShapes.length, 3);
  assert.equal(bubbleShapes[0].type, "ellipse");
  assert.equal(bubbleShapes[0].style.fill, "#60A5FA");
  assert.equal(bubbleShapes[0].style.opacity, 0.72);
  assert.equal(bubbleShapes[0].source.chartTemplateMotif, "bubble-scatter-chart");
  assert.equal(donut.source.componentTemplateFamilyApplied, "donut-chart");
  assert.equal(donutShapes.length, 3);
  assert.equal(donutShapes[0].type, "donut");
  assert.equal(donutShapes[0].style.fill, "#F97316");
  assert.equal(donutShapes[0].source.layoutPreservation, "component-chart-child-layout");
  assert.equal(donutShapes[0].source.chartTemplateMotif, "donut-segment-chart");
});

test("component template native shapes replays learned Venn and concentric component layouts", () => {
  const venn = templateImage({
    box: { x: 80, y: 70, w: 260, h: 200 },
    source: {
      layer: {
        templateFamily: "venn-overlap",
        diagramUnderstanding: {
          archetype: "venn-overlap",
          targetMotifs: ["venn-overlap", "intersection-overlap"]
        }
      },
      componentLocalAssets: [{
        provider: "officeplus",
        name: "officeplus-venn-components.pptx",
        recommendedComponentGroups: [{
          id: "venn-layout-guided",
          score: 87,
          childCount: 3,
          shapeCount: 3,
          pictureCount: 0,
          structure: {
            kind: "venn-overlap",
            motifs: ["venn-overlap", "intersection-overlap"],
            motifCounts: { "venn-overlap": 3, "intersection-overlap": 1 }
          },
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.08, y: 0.18, w: 0.42, h: 0.52 }, style: { shapeType: "ellipse", fill: "#2563EB", opacity: 0.45 } },
              { kind: "shape", box: { x: 0.32, y: 0.18, w: 0.42, h: 0.52 }, style: { shapeType: "ellipse", fill: "#F97316", opacity: 0.45 } },
              { kind: "shape", box: { x: 0.20, y: 0.35, w: 0.42, h: 0.52 }, style: { shapeType: "ellipse", fill: "#22C55E", opacity: 0.42 } }
            ]
          }
        }]
      }]
    }
  });
  const concentric = templateImage({
    id: "concentric-layer",
    box: { x: 380, y: 70, w: 220, h: 200 },
    source: {
      layer: {
        templateFamily: "concentric-circles",
        diagramUnderstanding: {
          archetype: "concentric-circles",
          targetMotifs: ["concentric-circles", "ring-node"]
        }
      },
      componentLocalAssets: [{
        provider: "islide",
        name: "islide-concentric-components.pptx",
        recommendedComponentGroups: [{
          id: "concentric-layout-guided",
          score: 86,
          childCount: 3,
          shapeCount: 3,
          pictureCount: 0,
          structure: {
            kind: "concentric-circles",
            motifs: ["concentric-circles", "ring-node"],
            motifCounts: { "concentric-circles": 3, "ring-node": 3 }
          },
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.05, y: 0.05, w: 0.90, h: 0.90 }, style: { shapeType: "donut", stroke: "#2563EB", fill: "none", strokeWidthPt: 2.4 } },
              { kind: "shape", box: { x: 0.20, y: 0.20, w: 0.60, h: 0.60 }, style: { shapeType: "donut", stroke: "#F97316", fill: "none", strokeWidthPt: 2.1 } },
              { kind: "shape", box: { x: 0.35, y: 0.35, w: 0.30, h: 0.30 }, style: { shapeType: "ellipse", fill: "#22C55E", stroke: "#FFFFFF" } }
            ]
          }
        }]
      }]
    }
  });

  const vennShapes = createComponentTemplateNativeShapes([venn], { widthPt: 960, heightPt: 540 })
    .filter((shape) => shape.source.componentTemplatePart === "venn-lobe");
  const rings = createComponentTemplateNativeShapes([concentric], { widthPt: 960, heightPt: 540 })
    .filter((shape) => shape.source.componentTemplatePart === "concentric-ring");

  assert.equal(venn.source.componentTemplateFamilyApplied, "venn-overlap");
  assert.equal(vennShapes.length, 3);
  assert.equal(vennShapes[0].type, "ellipse");
  assert.equal(vennShapes[0].style.fill, "#2563EB");
  assert.equal(vennShapes[0].source.layoutPreservation, "component-learned-child-layout");
  assert.equal(vennShapes[0].source.componentTemplateMotif, "venn-overlap");
  assert.equal(concentric.source.componentTemplateFamilyApplied, "concentric-circles");
  assert.equal(rings.length, 3);
  assert.equal(rings[0].type, "donut");
  assert.equal(rings[0].style.stroke, "#2563EB");
  assert.equal(rings[0].source.componentTemplateMotif, "concentric-circles");
});

test("component template native objects replay learned map regions and word cloud tokens", () => {
  const map = templateImage({
    box: { x: 60, y: 80, w: 260, h: 180 },
    source: {
      layer: {
        templateFamily: "map-chart",
        diagramUnderstanding: {
          archetype: "map-chart",
          targetMotifs: ["map-chart"]
        }
      },
      componentLocalAssets: [{
        provider: "officeplus",
        name: "officeplus-map-components.pptx",
        recommendedComponentGroups: [{
          id: "map-layout-guided",
          score: 84,
          childCount: 3,
          shapeCount: 3,
          pictureCount: 0,
          structure: {
            kind: "map-chart",
            motifs: ["map-chart"],
            motifCounts: { "map-chart": 3 }
          },
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.12, y: 0.16, w: 0.30, h: 0.34 }, style: { shapeType: "freeform", fill: "#2563EB", freeform: { points: [{ x: 0.05, y: 0.05 }, { x: 0.95, y: 0.20 }, { x: 0.80, y: 0.92 }, { x: 0.12, y: 0.78 }] } } },
              { kind: "shape", box: { x: 0.40, y: 0.22, w: 0.26, h: 0.32 }, style: { shapeType: "freeform", fill: "#60A5FA", freeform: { points: [{ x: 0.10, y: 0.10 }, { x: 0.92, y: 0.04 }, { x: 0.88, y: 0.86 }, { x: 0.18, y: 0.94 }] } } },
              { kind: "shape", box: { x: 0.25, y: 0.52, w: 0.36, h: 0.28 }, style: { shapeType: "freeform", fill: "#93C5FD", freeform: { points: [{ x: 0.00, y: 0.20 }, { x: 0.82, y: 0.00 }, { x: 0.98, y: 0.80 }, { x: 0.15, y: 0.96 }] } } }
            ]
          }
        }]
      }]
    }
  });
  const wordCloud = templateImage({
    id: "word-cloud-layer",
    box: { x: 360, y: 80, w: 300, h: 180 },
    source: {
      layer: {
        templateFamily: "word-cloud-chart",
        diagramUnderstanding: {
          archetype: "word-cloud-chart",
          targetMotifs: ["word-cloud-chart"]
        }
      },
      componentLocalAssets: [{
        provider: "islide",
        name: "islide-word-cloud-components.pptx",
        recommendedComponentGroups: [{
          id: "word-cloud-layout-guided",
          score: 86,
          childCount: 4,
          shapeCount: 4,
          pictureCount: 0,
          structure: {
            kind: "word-cloud-chart",
            motifs: ["word-cloud-chart"],
            motifCounts: { "word-cloud-chart": 4 }
          },
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "text", box: { x: 0.10, y: 0.16, w: 0.32, h: 0.18 }, style: { text: { placeholderText: "AI", fontSizePt: 32, color: "#2563EB", weight: "bold", family: "Microsoft YaHei" } } },
              { kind: "shape", box: { x: 0.42, y: 0.25, w: 0.30, h: 0.16 }, style: { fill: "none", stroke: "none", text: { placeholderText: "效率", fontSizePt: 24, color: "#F97316", family: "Microsoft YaHei" } } },
              { kind: "shape", box: { x: 0.22, y: 0.48, w: 0.36, h: 0.16 }, style: { fill: "none", stroke: "none", text: { placeholderText: "自动化", fontSizePt: 22, color: "#22C55E", family: "Microsoft YaHei" } } }
            ]
          }
        }]
      }]
    }
  });

  const mapRegions = createComponentTemplateNativeShapes([map], { widthPt: 960, heightPt: 540 })
    .filter((shape) => shape.source.componentTemplatePart === "map-region");
  const wordObjects = createComponentTemplateNativeObjects([wordCloud], { widthPt: 960, heightPt: 540 });
  const tokens = wordObjects.shapes.filter((shape) => shape.source.componentTemplatePart === "word-cloud-token");

  assert.equal(map.source.componentTemplateFamilyApplied, "map-chart");
  assert.equal(mapRegions.length, 3);
  assert.equal(mapRegions[0].type, "freeform");
  assert.equal(mapRegions[0].style.fill, "#2563EB");
  assert.equal(mapRegions[0].source.componentTemplateMotif, "map-chart");
  assert.equal(wordCloud.source.componentTemplateFamilyApplied, "word-cloud-chart");
  assert.equal(tokens.length, 3);
  assert.equal(tokens[0].source.componentTemplateMotif, "word-cloud-chart");
  assert.ok(wordObjects.textBoxes.some((box) => box.text === "AI"));
  assert.ok(wordObjects.textBoxes.some((box) => box.text === "效率"));
});

test("component template native shapes ignores oversized background boxes in learned layouts", () => {
  const image = templateImage({
    box: { x: 0, y: 0, w: 600, h: 300 },
    source: {
      componentLocalAssets: [{
        recommendedComponentGroups: [{
          id: "layout-with-background",
          score: 80,
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0, y: 0, w: 1, h: 0.9 } },
              { kind: "shape", box: { x: 0.08, y: 0.2, w: 0.18, h: 0.2 } },
              { kind: "shape", box: { x: 0.4, y: 0.2, w: 0.18, h: 0.2 } },
              { kind: "shape", box: { x: 0.72, y: 0.2, w: 0.18, h: 0.2 } }
            ]
          }
        }]
      }]
    }
  });

  const nodes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 })
    .filter((shape) => shape.source.componentTemplatePart === "process-node");

  assert.equal(nodes.length, 3);
  assert.ok(nodes.every((node) => node.box.w < 200));
});

test("component template native shapes uses learned radial layout for clear hub-spoke components", () => {
  const image = templateImage({
    box: { x: 100, y: 80, w: 300, h: 260 },
    source: {
      layer: { diagramUnderstanding: { archetype: "hub-spoke", confidence: 0.9 } },
      componentLocalAssets: [{
        recommendedComponentGroups: [{
          id: "radial-layout-guided",
          score: 80,
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.42, y: 0.42, w: 0.16, h: 0.16 } },
              { kind: "shape", box: { x: 0.42, y: 0.05, w: 0.16, h: 0.12 } },
              { kind: "shape", box: { x: 0.76, y: 0.42, w: 0.16, h: 0.12 } },
              { kind: "shape", box: { x: 0.42, y: 0.78, w: 0.16, h: 0.12 } },
              { kind: "shape", box: { x: 0.08, y: 0.42, w: 0.16, h: 0.12 } }
            ]
          }
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });
  const center = shapes.find((shape) => shape.source.componentTemplatePart === "hub-center");
  const nodes = shapes.filter((shape) => shape.source.componentTemplatePart === "hub-node");

  assert.deepEqual(center.box, { x: 226, y: 189.2, w: 48, h: 41.6 });
  assert.equal(nodes.length, 4);
  assert.ok(nodes.some((node) => JSON.stringify(node.box) === JSON.stringify({ x: 226, y: 93, w: 48, h: 31.2 })));
  const spokes = shapes.filter((shape) => shape.source.componentTemplatePart === "hub-spoke");
  assert.equal(spokes.length, 4);
  assert.ok(spokes.every((spoke) => spoke.source.connectorSemantic === "hub-spoke"));
  assert.ok(spokes.every((spoke) => spoke.source.fromNodeIndex === "center"));
  assert.ok(spokes.every((spoke) => spoke.source.connectorAxis === "radial"));
  const topSpoke = spokes.find((spoke) => spoke.source.toNodeIndex === 1);
  assert.equal(topSpoke.source.toNodeIndex, 1);
  assert.equal(topSpoke.source.fromAnchor, "top");
  assert.equal(topSpoke.source.toAnchor, "bottom");
  assert.deepEqual(topSpoke.style.startAnchor, {
    elementId: "diagram-layer-hub-center-0",
    side: "top",
    position: 0.5
  });
  assert.deepEqual(topSpoke.style.endAnchor, {
    elementId: "diagram-layer-hub-node-1",
    side: "bottom",
    position: 0.5
  });
});

test("component template native shapes rejects non-radial child layouts for hub-spoke", () => {
  const image = templateImage({
    box: { x: 100, y: 80, w: 300, h: 260 },
    source: {
      layer: { diagramUnderstanding: { archetype: "hub-spoke", confidence: 0.9 } },
      componentLocalAssets: [{
        recommendedComponentGroups: [{
          id: "wide-row-not-radial",
          score: 80,
          connectorCount: 5,
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.05, y: 0.1, w: 0.1, h: 0.1 } },
              { kind: "shape", box: { x: 0.25, y: 0.1, w: 0.1, h: 0.1 } },
              { kind: "shape", box: { x: 0.45, y: 0.1, w: 0.1, h: 0.1 } },
              { kind: "shape", box: { x: 0.65, y: 0.1, w: 0.1, h: 0.1 } },
              { kind: "shape", box: { x: 0.85, y: 0.1, w: 0.1, h: 0.1 } }
            ]
          }
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });

  assert.equal(shapes.filter((shape) => shape.source.componentTemplatePart === "hub-node").length, 5);
  assert.notDeepEqual(shapes.find((shape) => shape.source.componentTemplatePart === "hub-center").box, { x: 235, y: 189.2, w: 30, h: 26 });
});

test("component template native shapes uses learned horizontal milestone layout for timelines", () => {
  const image = templateImage({
    box: { x: 80, y: 100, w: 500, h: 160 },
    source: {
      layer: { templateFamily: "timeline" },
      componentLocalAssets: [{
        recommendedComponentGroups: [{
          id: "timeline-layout-guided",
          score: 80,
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.05, y: 0.45, w: 0.04, h: 0.12 } },
              { kind: "shape", box: { x: 0.35, y: 0.38, w: 0.04, h: 0.12 } },
              { kind: "shape", box: { x: 0.65, y: 0.50, w: 0.04, h: 0.12 } },
              { kind: "shape", box: { x: 0.92, y: 0.42, w: 0.04, h: 0.12 } }
            ]
          }
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });
  const dots = shapes.filter((shape) => shape.source.componentTemplatePart === "timeline-dot");
  const axis = shapes.find((shape) => shape.source.componentTemplatePart === "timeline-axis");

  assert.equal(dots.length, 4);
  assert.deepEqual(dots[0].box, { x: 105, y: 172, w: 20, h: 19.2 });
  assert.equal(axis.box.x, 115);
  assert.equal(axis.box.w, 435);
});

test("component template native shapes rejects non-horizontal child layouts for timelines", () => {
  const image = templateImage({
    box: { x: 80, y: 100, w: 500, h: 160 },
    source: {
      layer: { templateFamily: "timeline" },
      componentLocalAssets: [{
        recommendedComponentGroups: [{
          id: "vertical-not-timeline",
          score: 80,
          childCount: 4,
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.2, y: 0.05, w: 0.05, h: 0.08 } },
              { kind: "shape", box: { x: 0.25, y: 0.35, w: 0.05, h: 0.08 } },
              { kind: "shape", box: { x: 0.3, y: 0.65, w: 0.05, h: 0.08 } }
            ]
          }
        }]
      }]
    }
  });

  const shapes = createComponentTemplateNativeShapes([image], { widthPt: 960, heightPt: 540 });
  const dots = shapes.filter((shape) => shape.source.componentTemplatePart === "timeline-dot");

  assert.equal(dots.length, 4);
  assert.deepEqual(dots[0].box, { x: 112, y: 172, w: 16, h: 16 });
});

function writeStoredZip(file, entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralOffset = offset;
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  fs.writeFileSync(file, Buffer.concat([...localParts, central, eocd]));
}
