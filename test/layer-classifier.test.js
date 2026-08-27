"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildReconstructionPlan,
  classifyVisualLayer,
  summarizeLayerProfile
} = require("../skills/pd-hifi-slideclone/scripts/lib/layer-classifier");

test("classifyVisualLayer marks large diagram crops as split reconstruction candidates", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 80, y: 80, w: 640, h: 320 },
    source: {
      detector: "workflow-chain-underlay-crop",
      reason: "route diagram preserved as crop"
    }
  }, {
    textBoxes: new Array(12).fill(0).map((_, index) => ({ id: `t${index}`, text: "节点" }))
  }, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "diagram-zone");
  assert.equal(layer.recommendedAction, "split-native-with-residual-crop");
  assert.equal(layer.reconstructionPlan.status, "candidate");
  assert.equal(layer.reconstructionPlan.residualCrop, true);
  assert.ok(layer.reconstructionPlan.primitives.includes("native-connectors"));
  assert.ok(layer.reconstructionPlan.primitives.includes("arrowheads"));
});

test("classifyVisualLayer treats text-erased mixed underlays as hybrid diagrams, not screenshots", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 52, y: 134, w: 845, h: 378 },
    source: {
      detector: "mixed-diagram-graphic-underlay-crop",
      reason: "mixed-diagram-pictorial-details-preserved-beneath-editable-semantic-structure",
      textErasedFromCrop: true,
      standaloneVisualAsset: true,
      expressionForm: "complex-diagram",
      expressionSubtype: "mixed-diagram-hybrid",
      recommendedAction: "split-native-with-residual-crop"
    }
  }, {
    textBoxes: new Array(24).fill(0).map((_, index) => ({
      id: `t${index}`,
      text: `节点 ${index}`,
      box: { x: 60 + (index % 3) * 290, y: 140 + Math.floor(index / 3) * 42, w: 180, h: 24 }
    }))
  }, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "diagram-zone");
  assert.equal(layer.standaloneVisualAsset, undefined);
  assert.notEqual(layer.recommendedAction, "preserve-local-crop");
  assert.equal(layer.reconstructionPlan.status, "candidate");
  assert.equal(layer.reconstructionPlan.residualCrop, true);
});

test("classifyVisualLayer preserves large diagrams when expression metadata asks for fidelity", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 64, y: 180, w: 729, h: 333 },
    source: {
      detector: "foreground-graphic-crop",
      reason: "complex-graphic-preserved-as-movable-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "dense-complex-diagram",
      recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident"
    }
  }, {
    textBoxes: new Array(12).fill(0).map((_, index) => ({ id: `t${index}`, text: "节点" }))
  }, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "diagram-zone");
  assert.equal(layer.recommendedAction, "preserve-local-crop");
  assert.equal(layer.reconstructionPlan.status, "deferred");
});

test("classifyVisualLayer adds diagram understanding for flow card chains", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 80, y: 120, w: 760, h: 220 },
    source: {
      detector: "sparse-diagram-graphic-underlay-crop",
      expressionForm: "linear-process-diagram",
      expressionSubtype: "linear-process"
    }
  }, {
    textBoxes: [
      { id: "a", text: "输入需求", box: { x: 110, y: 190, w: 120, h: 36 } },
      { id: "b", text: "AI 分析", box: { x: 310, y: 188, w: 120, h: 38 } },
      { id: "c", text: "生成 PRD", box: { x: 510, y: 190, w: 130, h: 36 } },
      { id: "d", text: "输出资产", box: { x: 700, y: 190, w: 120, h: 36 } }
    ]
  }, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "diagram-zone");
  assert.equal(layer.diagramUnderstanding.archetype, "flow-card-chain");
  assert.equal(layer.diagramUnderstanding.nodeCount, 4);
  assert.equal(layer.diagramUnderstanding.connectorCount, 3);
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "hybrid-native-plus-residual-crops");
  assert.equal(layer.recommendedAction, "split-native-with-residual-crop");
  assert.equal(layer.reconstructionPlan.diagramUnderstanding.archetype, "flow-card-chain");
  assert.ok(layer.reconstructionPlan.primitives.includes("native-connectors"));
});

test("classifyVisualLayer passes page semantics into demand-flow component motifs", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 70, y: 90, w: 820, h: 330 },
    source: {
      detector: "foreground-aggregate-crop",
      reason: "dense diagram preserved as crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "dense-complex-diagram"
    }
  }, {
    textBoxes: [
      { id: "title", text: "Skill1需求理解：化乱为治，结构化收敛", box: { x: 90, y: 96, w: 520, h: 34 } },
      { id: "a", text: "业务目标", box: { x: 110, y: 170, w: 98, h: 30 } },
      { id: "b", text: "会议纪要", box: { x: 110, y: 220, w: 98, h: 30 } },
      { id: "c", text: "业务截图", box: { x: 110, y: 270, w: 98, h: 30 } },
      { id: "d", text: "核心流程", box: { x: 110, y: 320, w: 98, h: 30 } },
      { id: "out", text: "输出结构化蓝图", box: { x: 650, y: 210, w: 170, h: 36 } }
    ]
  }, { widthPt: 960, heightPt: 540 }, {
    sourceImage: {
      width: 960,
      height: 540,
      rgba: new Uint8ClampedArray(960 * 540 * 4).fill(255)
    }
  });

  assert.equal(layer.layerType, "diagram-zone");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "process-chain");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("lens-funnel-flow"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("branch-card-flow"));
  assert.match(layer.diagramUnderstanding.evidence.semanticText, /skill1需求理解/);
});

test("classifyVisualLayer keeps WMS route diagrams as fidelity crops", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 19, y: 108, w: 912, h: 226 },
    source: {
      detector: "wms-chain-underlay-crop",
      reason: "complex WMS route and value cards preserved"
    }
  }, {
    textBoxes: new Array(24).fill(0).map((_, index) => ({ id: `t${index}`, text: "节点" }))
  }, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "diagram-zone");
  assert.equal(layer.recommendedAction, "preserve-local-crop");
  assert.equal(layer.reconstructionPlan.status, "deferred");
  assert.match(layer.explanation, /route diagrams/);
});

test("classifyVisualLayer keeps collaboration flow diagrams as fidelity crops", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 19, y: 97, w: 912, h: 356 },
    source: {
      detector: "collaboration-flow-underlay-crop",
      reason: "complex-flow-card-visuals-preserved-under-editable-text"
    }
  }, {
    textBoxes: new Array(14).fill(0).map((_, index) => ({ id: `t${index}`, text: "协同节点" }))
  }, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "diagram-zone");
  assert.equal(layer.recommendedAction, "preserve-local-crop");
  assert.equal(layer.reconstructionPlan.status, "deferred");
  assert.match(layer.explanation, /collaboration flow/);
});

test("classifyVisualLayer recognizes value banners as background strips", () => {
  for (const detector of ["bottom-banner-crop", "collaboration-flow-banner-crop"]) {
    const layer = classifyVisualLayer({
      type: "fidelity-crop",
      box: { x: 48, y: 456, w: 864, h: 84 },
      source: {
        detector,
        reason: "bottom-value-banner-background-preserved-behind-editable-text"
      }
    }, {}, { widthPt: 960, heightPt: 540 });

    assert.equal(layer.layerType, "value-banner-zone");
    assert.equal(layer.recommendedAction, "preserve-local-crop");
    assert.equal(layer.reconstructionPlan.status, "deferred");
    assert.match(layer.explanation, /value banners/);
  }
});


test("classifyVisualLayer keeps screenshot zones as local crops", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 120, y: 90, w: 500, h: 300 },
    source: {
      detector: "embedded-ui-screenshot",
      reason: "screenshot preserved"
    }
  }, {}, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "screenshot-zone");
  assert.equal(layer.recommendedAction, "preserve-local-crop");
  assert.equal(layer.reconstructionPlan.status, "deferred");
});

test("classifyVisualLayer does not mistake generic graphic crops for charts", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 50, y: 60, w: 420, h: 260 },
    source: {
      detector: "foreground-graphic-crop",
      reason: "complex-graphic-preserved-as-movable-crop"
    }
  }, {}, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "diagram-zone");
});

test("classifyVisualLayer uses expression form to keep cover decoration out of diagram residuals", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 960, h: 540 },
    source: {
      detector: "foreground-graphic-crop",
      reason: "complex-graphic-preserved-as-movable-crop",
      expressionForm: "decorative-cover-visual",
      expressionSubtype: "cover-decoration"
    }
  }, {}, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "decorative-zone");
  assert.equal(layer.recommendedAction, "preserve-local-crop");
  assert.equal(layer.reconstructionPlan.status, "deferred");
  assert.match(layer.explanation, /decorative\/brand imagery/);
});

test("classifyVisualLayer keeps brand marks as decorative local crops", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 790, y: 28, w: 96, h: 48 },
    source: {
      detector: "foreground-graphic-crop",
      expressionForm: "brand-mark",
      expressionSubtype: "logo"
    }
  }, {}, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "decorative-zone");
  assert.equal(layer.recommendedAction, "preserve-local-crop");
  assert.equal(layer.reconstructionPlan.status, "deferred");
});

test("classifyVisualLayer analyzes structured illustration cards as visual atom split candidates", () => {
  const image = blankImage(620, 360, "#ffffff");
  fillRect(image, 72, 80, 150, 92, "#f3f4f6");
  fillRect(image, 256, 80, 150, 92, "#eef2f7");
  fillRect(image, 440, 80, 120, 92, "#f3f4f6");
  fillRect(image, 124, 216, 150, 72, "#eef2f7");
  fillRect(image, 344, 216, 150, 72, "#f3f4f6");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 620, h: 360 },
    source: {
      detector: "illustration-card-graphic-underlay-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "illustration"
    }
  }, { textBoxes: [] }, { widthPt: 620, heightPt: 360 }, { sourceImage: image });

  assert.equal(layer.layerType, "illustration-zone");
  assert.equal(layer.recommendedAction, "split-native-with-residual-crop");
  assert.ok(layer.diagramUnderstanding.visualAtomKindCounts["native-rect-candidate"] >= 5);
  assert.ok(layer.reconstructionPlan.diagramUnderstanding.visualAtomCount >= 5);
  assert.match(layer.explanation, /structured illustration/);
});

test("classifyVisualLayer treats grid-heavy illustrations with residuals as split candidates", () => {
  const image = blankImage(620, 360, "#ffffff");
  for (const x of [72, 132, 192, 252, 312, 372, 432, 492]) fillRect(image, x, 70, 4, 230, "#d1d5db");
  for (const y of [70, 126, 182, 238, 294]) fillRect(image, 72, y, 420, 4, "#d1d5db");
  fillRect(image, 520, 94, 48, 40, "#f97316");
  fillRect(image, 512, 180, 66, 84, "#8fb4e8");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 620, h: 360 },
    source: {
      detector: "illustration-card-graphic-underlay-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "illustration"
    }
  }, { textBoxes: [] }, { widthPt: 620, heightPt: 360 }, { sourceImage: image });

  assert.equal(layer.layerType, "illustration-zone");
  assert.equal(layer.recommendedAction, "split-native-with-residual-crop");
  assert.equal(layer.reconstructionPlan.status, "candidate");
  assert.ok(layer.diagramUnderstanding.visualAtomKindCounts["grid-line-candidate"] >= 8);
  assert.ok(layer.reconstructionPlan.diagramUnderstanding.visualAtomKindCounts["grid-line-candidate"] >= 8);
});

test("classifyVisualLayer keeps small illustration icons as local crops", () => {
  const image = blankImage(180, 120, "#ffffff");
  fillRect(image, 62, 36, 54, 48, "#f3f4f6");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 180, h: 120 },
    source: {
      detector: "small-icon-illustration-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "icon"
    }
  }, { textBoxes: [] }, { widthPt: 620, heightPt: 360 }, { sourceImage: image });

  assert.equal(layer.layerType, "illustration-zone");
  assert.equal(layer.recommendedAction, "preserve-local-crop");
  assert.equal(layer.diagramUnderstanding, undefined);
});

test("classifyVisualLayer recognizes explicit chart and KPI evidence crops", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 50, y: 60, w: 420, h: 260 },
    source: {
      detector: "kpi-evidence-crop",
      reason: "chart-like KPI figure preserved"
    }
  }, {}, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "chart-zone");
  assert.equal(layer.chartProfile.chartKind, "evidence-snapshot");
  assert.equal(layer.chartProfile.reconstructionReadiness, "defer-until-data-series-detected");
  assert.equal(layer.chartProfile.dataSeriesAvailable, false);
  assert.equal(layer.recommendedAction, "preserve-local-crop");
  assert.equal(layer.reconstructionPlan.status, "deferred");
  assert.equal(layer.reconstructionPlan.chartProfile.chartKind, "evidence-snapshot");
  assert.match(layer.explanation, /data series reconstruction/);
});

test("classifyVisualLayer promotes explicit axis or series charts to native candidates", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 80, y: 80, w: 640, h: 330 },
    source: {
      detector: "bar-chart-axis-series-crop",
      reason: "axis and series marks detected"
    }
  }, {
    textBoxes: [
      { id: "x", text: "Q1" },
      { id: "y", text: "收入" },
      { id: "l", text: "Series A" }
    ]
  }, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "chart-zone");
  assert.equal(layer.chartProfile.chartKind, "bar-or-column-chart");
  assert.equal(layer.chartProfile.reconstructionReadiness, "data-chart-candidate");
  assert.equal(layer.chartProfile.evidence, "axis-or-series-detector");
  assert.equal(layer.recommendedAction, "attempt-native-reconstruction");
  assert.equal(layer.reconstructionPlan.status, "candidate");
  assert.deepEqual(layer.reconstructionPlan.primitives, ["chart-area", "axis-lines", "series-marks", "labels", "residual-legend-icons"]);
  assert.match(layer.explanation, /native data-chart reconstruction/);
});

test("classifyVisualLayer promotes structured chart data even without detector hints", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 80, y: 80, w: 640, h: 330 },
    source: {
      detector: "chart-crop",
      data: [{ category: "A", value: 10 }]
    }
  }, {}, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "chart-zone");
  assert.equal(layer.chartProfile.reconstructionReadiness, "data-chart-candidate");
  assert.equal(layer.chartProfile.dataSeriesAvailable, true);
  assert.equal(layer.chartProfile.evidence, "structured-series");
  assert.equal(layer.recommendedAction, "attempt-native-reconstruction");
});

test("classifyVisualLayer keeps dense line diagrams as fidelity crops until topology is rebuilt", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 34, y: 139, w: 890, h: 375 },
    source: {
      detector: "line-diagram-graphic-underlay-crop",
      reason: "dense-line-diagram-preserved-as-movable-crop"
    }
  }, {
    textBoxes: new Array(4).fill(0).map((_, index) => ({ id: `t${index}`, text: "节点" }))
  }, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "diagram-zone");
  assert.equal(layer.recommendedAction, "preserve-local-crop");
  assert.equal(layer.reconstructionPlan.status, "deferred");
});

test("classifyVisualLayer honors complex diagram expression recommendations before split residuals", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 74, y: 32, w: 848, h: 346 },
    source: {
      detector: "top-complex-diagram-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "top-complex-diagram",
      recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident"
    }
  }, {
    textBoxes: new Array(12).fill(0).map((_, index) => ({ id: `t${index}`, text: "节点" }))
  }, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "diagram-zone");
  assert.equal(layer.recommendedAction, "preserve-local-crop");
  assert.equal(layer.reconstructionPlan.status, "deferred");
  assert.match(layer.explanation, /expression classifier recommends preserving/);
});

test("summarizeLayerProfile reports largest unexplained crop and layer action counts", () => {
  const profile = summarizeLayerProfile({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      textBoxes: new Array(10).fill(0).map((_, index) => ({ id: `t${index}` })),
      images: [{
        type: "fidelity-crop",
        box: { x: 60, y: 70, w: 700, h: 330 },
        source: { detector: "comparison-matrix-crop" }
      }]
    }]
  });

  assert.equal(profile.totals.visualLayers, 1);
  assert.equal(profile.totals.nativeCandidates, 1);
  assert.ok(profile.totals.largestUnexplainedCropAreaRatio > 0.4);
  assert.equal(profile.totals.layerTypeCounts["table-zone"], 1);
  assert.equal(profile.totals.recommendedActionCounts["attempt-native-reconstruction"], 1);
});

test("summarizeLayerProfile aggregates diagram understanding archetypes", () => {
  const profile = summarizeLayerProfile({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      textBoxes: [
        { id: "a", text: "Brief 输入", box: { x: 100, y: 200, w: 110, h: 32 } },
        { id: "b", text: "生成节点", box: { x: 300, y: 200, w: 110, h: 32 } },
        { id: "c", text: "PRD 文档", box: { x: 500, y: 200, w: 110, h: 32 } },
        { id: "d", text: "资产输出", box: { x: 700, y: 200, w: 110, h: 32 } }
      ],
      images: [{
        type: "fidelity-crop",
        box: { x: 80, y: 150, w: 760, h: 170 },
        source: {
          detector: "sparse-diagram-graphic-underlay-crop",
          expressionForm: "linear-process-diagram"
        }
      }]
    }]
  });

  assert.equal(profile.totals.diagramArchetypeCounts["process-with-screenshots"], 1);
  assert.equal(profile.totals.diagramReadinessCounts["hybrid-native-plus-residual-crops"], 1);
});

test("summarizeLayerProfile does not block on allowed icon and screenshot residual crops", () => {
  const profile = summarizeLayerProfile({
    pages: [{
      images: [{
        type: "fidelity-crop",
        box: { x: 80, y: 80, w: 400, h: 240 },
        source: {
          layer: {
            layerType: "diagram-zone",
            recommendedAction: "split-native-with-residual-crop",
            diagramUnderstanding: {
              residuals: [
                { kind: "icon-crop-candidate", reason: "icons need library/SVG confidence before native rebuild" },
                { kind: "screenshot-crop", reason: "screenshots should remain fidelity crops unless UI structure is parsed" },
                { kind: "complex-shape-crop-candidate", reason: "visual atom is safer as a local crop" }
              ]
            }
          }
        }
      }]
    }]
  });

  assert.equal(profile.totals.recommendedActionCounts["split-native-with-residual-crop"], 1);
  assert.equal(profile.totals.residualCandidates, 0);
});

test("summarizeLayerProfile still blocks on actionable structural residuals", () => {
  const profile = summarizeLayerProfile({
    pages: [{
      images: [{
        type: "fidelity-crop",
        box: { x: 80, y: 80, w: 400, h: 240 },
        source: {
          layer: {
            layerType: "diagram-zone",
            recommendedAction: "split-native-with-residual-crop",
            diagramUnderstanding: {
              residuals: [
                { kind: "unparsed-node", reason: "node could be rebuilt as a native shape" }
              ]
            }
          }
        }
      }]
    }]
  });

  assert.equal(profile.totals.residualCandidates, 1);
});

test("buildReconstructionPlan describes table primitives", () => {
  const plan = buildReconstructionPlan({
    layerType: "table-zone",
    detector: "comparison-matrix-crop",
    item: { box: { x: 1, y: 2, w: 3, h: 4 } },
    page: {},
    areaRatio: 0.4,
    nativeConfidence: 0.72,
    editBenefit: 0.7,
    recommendedAction: "attempt-native-reconstruction"
  });

  assert.equal(plan.status, "candidate");
  assert.deepEqual(plan.primitives, ["table-grid", "cell-text", "header-fill", "residual-icons"]);
  assert.equal(plan.regionBox.w, 3);
});

test("classifyVisualLayer does not split a tiny solid crop into fake dense nodes", () => {
  const sourceImage = blankImage(960, 540, "#ffffff");
  fillRect(sourceImage, 548, 215, 34, 38, "#2763a9");

  const layer = classifyVisualLayer({
    type: "image",
    box: { x: 548, y: 215, w: 34, h: 38 },
    source: { detector: "generic-visual-underlay" }
  }, { textBoxes: [] }, { widthPt: 960, heightPt: 540 }, { sourceImage });

  assert.equal(layer.recommendedAction, "preserve-local-crop");
  assert.notEqual(layer.diagramUnderstanding?.nativeReadiness, "native-rebuild");
  assert.equal(
    (layer.diagramUnderstanding?.visualAtoms || []).some((atom) => atom.source?.detector === "dense-linked-node-visual-atom"),
    false
  );
});

function blankImage(width, height, color) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const rgb = hexToRgb(color);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = rgb[0];
    rgba[index * 4 + 1] = rgb[1];
    rgba[index * 4 + 2] = rgb[2];
    rgba[index * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

function fillRect(image, x, y, w, h, color) {
  const rgb = hexToRgb(color);
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (xx < 0 || yy < 0 || xx >= image.width || yy >= image.height) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function hexToRgb(hex) {
  const value = String(hex || "").replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}
