"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  extractVisualAtoms,
  _private: { foregroundComponentsBySeedColor, inferDiagonalLineFit, looksLikeSearchIcon, searchIconEvidence }
} = require("../skills/pd-hifi-slideclone/scripts/lib/visual-atoms");
const { classifyVisualLayer } = require("../skills/pd-hifi-slideclone/scripts/lib/layer-classifier");

test("extractVisualAtoms separates node rectangles, connector lines, and icon crops", () => {
  const image = blankImage(400, 240, "#ffffff");
  fillRect(image, 40, 80, 90, 48, "#2f80ed");
  fillRect(image, 165, 99, 70, 8, "#2f80ed");
  fillRect(image, 270, 80, 90, 48, "#27ae60");
  fillRect(image, 184, 150, 24, 24, "#f2994a");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 400, h: 240 }, { widthPt: 400, heightPt: 240 });

  assert.ok(atoms.filter((atom) => atom.kind === "native-rect-candidate").length >= 2);
  assert.ok(atoms.some((atom) => atom.kind === "connector-line-candidate"));
  assert.ok(atoms.some((atom) => atom.kind === "icon-crop-candidate"));
});

test("classifyVisualLayer reuses existing visual atoms during semantic refresh", () => {
  const existingAtoms = [{
    id: "existing-native-node",
    kind: "native-rect-candidate",
    shapeHint: "rect",
    box: { x: 40, y: 30, w: 120, h: 60 }
  }];
  const item = {
    box: { x: 0, y: 0, w: 320, h: 180 },
    source: {
      detector: "structured-diagram",
      layer: { visualAtoms: existingAtoms }
    }
  };

  const layer = classifyVisualLayer(item, { textBoxes: [] }, { widthPt: 320, heightPt: 180 }, {
    reuseExistingVisualAnalysis: true
  });

  assert.deepEqual(layer.visualAtoms, existingAtoms);
});

test("extractVisualAtoms promotes low contrast card containers to native rect atoms", () => {
  const image = blankImage(520, 300, "#ffffff");
  fillRect(image, 54, 58, 176, 116, "#f3f4f6");
  fillRect(image, 86, 198, 122, 38, "#2f80ed");
  fillRect(image, 292, 70, 150, 92, "#eef2f7");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 520, h: 300 }, { widthPt: 520, heightPt: 300 });
  const cardAtoms = atoms.filter((atom) => atom.kind === "native-rect-candidate" && atom.shapeHint === "container-card");

  assert.ok(cardAtoms.length >= 2);
  assert.ok(cardAtoms.every((atom) => atom.nativeCandidate === true));
  assert.ok(cardAtoms.some((atom) => atom.color === "#f3f4f6"));
});

test("extractVisualAtoms recognizes ellipse nodes and arrow connectors as native atoms", () => {
  const image = blankImage(420, 240, "#ffffff");
  fillEllipse(image, 46, 82, 64, 64, "#2f80ed");
  fillArrowRight(image, 145, 108, 130, 10, 28, "#2f80ed");
  fillRect(image, 315, 86, 76, 54, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 420, h: 240 }, { widthPt: 420, heightPt: 240 });

  assert.ok(atoms.some((atom) => atom.kind === "native-ellipse-candidate" && atom.shapeHint === "ellipse"));
  assert.ok(atoms.some((atom) =>
    atom.kind === "connector-arrow-candidate"
    && atom.shapeHint === "arrow-horizontal"
    && atom.arrowDirection === "right"
  ));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("extractVisualAtoms does not infer arrowheads from low-density straight connectors", () => {
  const image = blankImage(420, 240, "#ffffff");
  fillEllipse(image, 42, 88, 64, 52, "#60a5fa");
  fillEllipse(image, 310, 88, 64, 52, "#34d399");
  fillRect(image, 114, 111, 188, 5, "#64748b");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 420, h: 240 }, { widthPt: 420, heightPt: 240 });
  const connectors = atoms.filter((atom) =>
    atom.kind === "connector-line-candidate"
    || atom.kind === "grid-line-candidate"
    || atom.kind === "connector-arrow-candidate"
  );

  assert.ok(connectors.some((atom) => atom.kind === "connector-line-candidate" || atom.kind === "grid-line-candidate"));
  assert.equal(connectors.some((atom) => atom.kind === "connector-arrow-candidate"), false);
});

test("extractVisualAtoms recognizes diamond decisions and pill buttons as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillDiamond(image, 58, 70, 92, 92, "#2f80ed");
  fillPill(image, 220, 92, 154, 42, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-diamond-candidate" && atom.shapeHint === "diamond"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate" && atom.shapeHint === "pill"));
});

test("extractVisualAtoms recognizes triangle diagram markers as native atoms", () => {
  const image = blankImage(420, 240, "#ffffff");
  fillTriangleUp(image, 78, 64, 92, 92, "#f59e0b");
  fillRect(image, 230, 88, 96, 44, "#2f80ed");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 420, h: 240 }, { widthPt: 420, heightPt: 240 });

  assert.ok(atoms.some((atom) => atom.kind === "native-triangle-candidate" && atom.shapeHint === "triangle"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("extractVisualAtoms recognizes chevron direction blocks as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillChevronRight(image, 70, 82, 128, 72, "#3b82f6");
  fillRect(image, 250, 96, 104, 44, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-chevron-candidate" && atom.shapeHint === "chevron-right"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("extractVisualAtoms recognizes parallelogram flow nodes as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillParallelogramRight(image, 78, 84, 142, 64, 28, "#60a5fa");
  fillRect(image, 270, 92, 118, 52, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-parallelogram-candidate" && atom.shapeHint === "parallelogram-right"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("extractVisualAtoms recognizes database cylinders as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillCylinder(image, 92, 60, 88, 128, "#93c5fd");
  fillRect(image, 270, 96, 118, 52, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-cylinder-candidate" && atom.shapeHint === "cylinder"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("extractVisualAtoms recognizes cloud service nodes as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillCloud(image, 74, 66, 156, 96, "#dbeafe");
  fillRect(image, 292, 96, 104, 44, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-cloud-candidate" && atom.shapeHint === "cloud"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("extractVisualAtoms recognizes flowchart document nodes as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillDocument(image, 76, 72, 152, 96, 16, "#cbd5e1");
  fillRect(image, 292, 96, 104, 44, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-document-candidate" && atom.shapeHint === "document"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("extractVisualAtoms recognizes folder tab cards as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillFolder(image, 72, 72, 178, 104, "#2f80ed");
  fillRect(image, 306, 100, 92, 42, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-folder-candidate" && atom.shapeHint === "folder"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("extractVisualAtoms splits connected multicolor folder-card diagrams into native parts", () => {
  const image = blankImage(620, 360, "#ffffff");
  fillFolder(image, 90, 108, 180, 118, "#2f80ed");
  fillRect(image, 270, 164, 70, 8, "#94a3b8");
  for (const y of [72, 154, 236]) {
    fillFolder(image, 340, y, 190, 58, "#27ae60");
    fillRect(image, 334, y + 26, 8, 8, "#94a3b8");
  }
  fillRect(image, 332, 100, 6, 172, "#94a3b8");

  const atoms = extractVisualAtoms(image, { x: 40, y: 40, w: 540, h: 280 }, { widthPt: 620, heightPt: 360 });
  const nativeCards = atoms.filter((atom) => atom.kind === "native-folder-candidate" || atom.kind === "native-rect-candidate");

  assert.ok(nativeCards.length >= 4);
  assert.ok(atoms.some((atom) => atom.kind === "native-folder-candidate"));
});

test("extractVisualAtoms recognizes monitor screen nodes as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillScreen(image, 78, 62, 148, 112, "#94a3b8");
  fillRect(image, 292, 96, 104, 44, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-screen-candidate" && atom.shapeHint === "screen"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("extractVisualAtoms recognizes mobile phone device nodes as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillPhone(image, 112, 48, 64, 138, "#1f2937");
  fillRect(image, 292, 96, 104, 44, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-phone-candidate" && atom.shapeHint === "phone"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("extractVisualAtoms recognizes funnel filter nodes as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillFunnel(image, 90, 50, 118, 136, "#60a5fa");
  fillRect(image, 292, 96, 104, 44, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-funnel-candidate" && atom.shapeHint === "funnel"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("extractVisualAtoms recognizes donut ring nodes as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillDonut(image, 88, 54, 118, 118, 0.52, "#60a5fa");
  fillRect(image, 292, 96, 104, 44, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-donut-candidate" && atom.shapeHint === "donut"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("classifyVisualLayer preserves explicit icon illustration crops even when subtype mentions flow", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 120, y: 70, w: 180, h: 120 },
    source: {
      detector: "plugin-flow-arrow-icon-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "flow-arrow-illustration",
      nonEditableReason: "obvious plugin icon/illustration should stay as a movable crop"
    }
  }, {}, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "illustration-zone");
  assert.equal(layer.recommendedAction, "preserve-local-crop");
  assert.equal(layer.reconstructionPlan.status, "deferred");
});

test("classifyVisualLayer keeps large obvious diagram icons as crops unless structured atoms justify splitting", () => {
  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 80, y: 80, w: 420, h: 260 },
    source: {
      detector: "cycle-flow-icon-illustration",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "cycle-flow-icon",
      expressionRecommendation: "keep-local-crop"
    }
  }, {}, { widthPt: 960, heightPt: 540 });

  assert.equal(layer.layerType, "illustration-zone");
  assert.equal(layer.recommendedAction, "preserve-local-crop");
  assert.notEqual(layer.recommendedAction, "attempt-native-reconstruction");
});

test("classifyVisualLayer protects plugin visual examples from atom-level over-splitting", () => {
  const sourceImage = blankImage(520, 320, "#ffffff");
  fillCycleArrow(sourceImage, 110, 50, 280, 220, "#ff8a3d");
  fillRect(sourceImage, 188, 142, 120, 28, "#ffffff");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 80, y: 40, w: 360, h: 240 },
    source: {
      detector: "plugin-cycle-arrow-illustration-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "cycle-flow-icon visual-example 示意图",
      nonEditableReason: "downloaded plugin component preview should be kept as one visual asset"
    }
  }, {}, { widthPt: 520, heightPt: 320 }, { sourceImage });

  assert.equal(layer.layerType, "illustration-zone");
  assert.equal(layer.standaloneVisualAsset, true);
  assert.equal(layer.recommendedAction, "preserve-local-crop");
  assert.equal(layer.reconstructionPlan.status, "deferred");
  assert.equal(layer.visualAtoms, undefined);
  assert.match(layer.explanation, /movable crops/);
});

test("classifyVisualLayer preserves plugin diagram sample previews as single crops", () => {
  const sourceImage = blankImage(520, 320, "#ffffff");
  fillCycleArrow(sourceImage, 96, 46, 300, 230, "#38bdf8");
  fillTriangle(sourceImage, [{ x: 354, y: 72 }, { x: 384, y: 92 }, { x: 350, y: 112 }], "#38bdf8");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 72, y: 38, w: 380, h: 246 },
    source: {
      detector: "islide-component-preview-cycle-diagram",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "组件预览 图示样例 preview mockup",
      recommendedAction: "replace-with-native-components",
      diagramUnderstanding: {
        nativeReadiness: "native-rebuild",
        visualAtomCount: 14,
        connectorCount: 2,
        residualCount: 1
      }
    }
  }, {}, { widthPt: 520, heightPt: 320 }, { sourceImage });

  assert.equal(layer.layerType, "illustration-zone");
  assert.equal(layer.standaloneVisualAsset, true);
  assert.equal(layer.recommendedAction, "preserve-local-crop");
  assert.equal(layer.reconstructionPlan.status, "deferred");
  assert.equal(layer.visualAtoms, undefined);
});

test("classifyVisualLayer analyzes structured diagrams mis-tagged as illustrations", () => {
  const sourceImage = blankImage(620, 320, "#ffffff");
  fillRect(sourceImage, 70, 118, 110, 54, "#dbeafe");
  fillRect(sourceImage, 248, 118, 110, 54, "#dbeafe");
  fillRect(sourceImage, 426, 118, 110, 54, "#dbeafe");
  fillRect(sourceImage, 184, 142, 58, 6, "#64748b");
  fillTriangle(sourceImage, [{ x: 238, y: 134 }, { x: 254, y: 145 }, { x: 238, y: 156 }], "#64748b");
  fillRect(sourceImage, 362, 142, 58, 6, "#64748b");
  fillTriangle(sourceImage, [{ x: 416, y: 134 }, { x: 432, y: 145 }, { x: 416, y: 156 }], "#64748b");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 620, h: 320 },
    source: {
      detector: "foreground-graphic-underlay",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "structured multi-card process diagram node connector"
    }
  }, {
    textBoxes: [
      { id: "a", text: "输入", box: { x: 92, y: 130, w: 60, h: 22 } },
      { id: "b", text: "处理", box: { x: 270, y: 130, w: 60, h: 22 } },
      { id: "c", text: "输出", box: { x: 448, y: 130, w: 60, h: 22 } }
    ]
  }, { widthPt: 620, heightPt: 320 }, { sourceImage });

  assert.equal(layer.layerType, "illustration-zone");
  assert.equal(layer.standaloneVisualAsset, undefined);
  assert.ok(layer.diagramUnderstanding);
  assert.equal(layer.recommendedAction, "split-native-with-residual-crop");
  assert.equal(layer.diagramUnderstanding.archetype, "flow-card-chain");
  assert.equal(layer.diagramUnderstanding.nodeCount, 3);
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("whole-process-template"));
});

test("classifyVisualLayer treats matrix expressions as structured even with stale standalone flags", () => {
  const sourceImage = blankImage(520, 320, "#ffffff");
  fillRect(sourceImage, 170, 80, 80, 52, "#dbeafe");
  fillRect(sourceImage, 270, 80, 80, 52, "#dbeafe");
  fillRect(sourceImage, 370, 80, 80, 52, "#dbeafe");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 110, y: 52, w: 360, h: 180 },
    source: {
      detector: "foreground-graphic-underlay-crop",
      expressionForm: "table-or-matrix",
      expressionSubtype: "table-grid",
      recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
      layer: {
        standaloneVisualAsset: true
      }
    }
  }, {}, { widthPt: 520, heightPt: 320 }, { sourceImage });

  assert.equal(layer.layerType, "table-zone");
  assert.equal(layer.standaloneVisualAsset, undefined);
  assert.equal(layer.recommendedAction, "attempt-native-reconstruction");
  assert.equal(layer.reconstructionPlan.status, "candidate");
});

test("extractVisualAtoms recognizes gear icons as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillGear(image, 82, 48, 132, "#64748b");
  fillRect(image, 292, 96, 104, 44, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-gear-candidate" && atom.shapeHint === "gear"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("extractVisualAtoms recognizes search icons as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillMagnifier(image, 94, 54, 120, "#2563eb");
  fillRect(image, 292, 96, 104, 44, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-search-candidate" && atom.shapeHint === "search"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("extractVisualAtoms recognizes shield icons as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillShield(image, 106, 46, 96, 132, "#1d4ed8");
  fillRect(image, 292, 96, 104, 44, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-shield-candidate" && atom.shapeHint === "shield"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("classifyVisualLayer recognizes simple visual donut charts as native rebuild candidates", () => {
  const image = blankImage(360, 260, "#ffffff");
  fillDonut(image, 92, 54, 128, 128, 0.5, "#60a5fa");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 360, h: 260 },
    source: {
      detector: "donut-chart-snapshot",
      expressionForm: "chart-snapshot"
    }
  }, { textBoxes: [] }, { widthPt: 360, heightPt: 260 }, { sourceImage: image });

  assert.equal(layer.layerType, "chart-zone");
  assert.equal(layer.diagramUnderstanding.archetype, "donut-chart");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.recommendedAction, "attempt-native-reconstruction");
  assert.ok(layer.visualAtoms.some((atom) => atom.kind === "native-donut-candidate"));
});

test("classifyVisualLayer splits multicolor donut charts into native segment atoms", () => {
  const image = blankImage(360, 260, "#ffffff");
  fillDonutSegment(image, 92, 54, 128, 128, 0.5, -90, 30, "#60a5fa");
  fillDonutSegment(image, 92, 54, 128, 128, 0.5, 30, 160, "#34d399");
  fillDonutSegment(image, 92, 54, 128, 128, 0.5, 160, 270, "#f97316");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 360, h: 260 },
    source: {
      detector: "donut-chart-snapshot",
      expressionForm: "chart-snapshot"
    }
  }, { textBoxes: [] }, { widthPt: 360, heightPt: 260 }, { sourceImage: image });

  const segments = layer.visualAtoms.filter((atom) => atom.kind === "native-donut-segment-candidate");
  assert.equal(layer.diagramUnderstanding.archetype, "donut-chart");
  assert.ok(segments.length >= 3);
  assert.ok(segments.every((atom) => atom.shapeHint === "donut-segment"));
  assert.ok(segments.every((atom) => atom.donutParentBox));
});

test("classifyVisualLayer recognizes gauge charts before generic donut rings", () => {
  const image = blankImage(420, 260, "#ffffff");
  fillEllipse(image, 122, 58, 176, 176, "#bfdbfe");
  fillEllipse(image, 146, 82, 128, 128, "#ffffff");
  fillRect(image, 122, 146, 176, 88, "#ffffff");
  fillLine(image, 210, 146, 264, 104, 6, "#2563eb");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 420, h: 260 },
    source: {
      detector: "gauge-speedometer-chart-snapshot",
      expressionForm: "chart-snapshot",
      expressionSubtype: "gauge chart speedometer 半圆仪表 进度仪表"
    }
  }, { textBoxes: [] }, { widthPt: 420, heightPt: 260 }, { sourceImage: image });

  assert.equal(layer.layerType, "chart-zone");
  assert.equal(layer.diagramUnderstanding.archetype, "gauge-chart");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "data-chart");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "gauge-chart");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "semi-circular-progress-dial");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "gauge-chart");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("gauge-chart"));
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.deepEqual(
    layer.visualAtoms.map((atom) => atom.kind).sort(),
    ["native-gauge-arc-candidate", "native-gauge-needle-candidate"]
  );
});

test("classifyVisualLayer recognizes concentric onion diagrams before donut or cycle fallbacks", () => {
  const image = blankImage(440, 300, "#ffffff");
  fillEllipse(image, 96, 36, 248, 248, "#dbeafe");
  fillEllipse(image, 132, 72, 176, 176, "#bfdbfe");
  fillEllipse(image, 168, 108, 104, 104, "#60a5fa");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 440, h: 300 },
    source: {
      detector: "concentric-circles-onion-diagram-snapshot",
      expressionForm: "complex-diagram",
      expressionSubtype: "concentric circles onion diagram 同心圆 洋葱图 圈层模型"
    }
  }, { textBoxes: [] }, { widthPt: 440, heightPt: 300 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "concentric-circles");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "relationship-diagram");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "concentric-circles");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "nested-layer-rings");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "concentric-circles");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("concentric-circles"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("ring-node"));
});

test("classifyVisualLayer recognizes radar charts as semantic data charts", () => {
  const image = blankImage(420, 300, "#ffffff");
  const center = { x: 210, y: 150 };
  const axes = [
    { x: 210, y: 54 },
    { x: 302, y: 122 },
    { x: 266, y: 234 },
    { x: 154, y: 234 },
    { x: 118, y: 122 }
  ];
  const score = [
    { x: 210, y: 82 },
    { x: 276, y: 132 },
    { x: 250, y: 204 },
    { x: 172, y: 206 },
    { x: 144, y: 128 }
  ];
  for (const point of axes) fillLine(image, center.x, center.y, point.x, point.y, 2, "#bfdbfe");
  fillPolygon(image, axes, parseHex("#e0f2fe"));
  fillPolygon(image, score, parseHex("#38bdf8"));

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 420, h: 300 },
    source: {
      detector: "radar-chart-snapshot",
      expressionForm: "chart-snapshot",
      expressionSubtype: "radar chart spider chart 能力雷达 维度评分"
    }
  }, { textBoxes: [] }, { widthPt: 420, heightPt: 300 }, { sourceImage: image });

  assert.equal(layer.layerType, "chart-zone");
  assert.equal(layer.diagramUnderstanding.archetype, "radar-chart");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "data-chart");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "radar-chart");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "radial-multi-axis-score-polygon");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "radar-chart");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("radar-chart"));
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.deepEqual(
    layer.visualAtoms.map((atom) => atom.kind).sort(),
    ["native-radar-frame-candidate", "native-radar-score-candidate"]
  );
});

test("extractVisualAtoms recognizes circular arrow cycle nodes as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillCycleArrow(image, 88, 50, 128, 128, "#2f80ed");
  fillRect(image, 292, 96, 104, 44, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-cycle-arrow-candidate" && atom.shapeHint === "cycle-arrow"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("extractVisualAtoms splits segmented circular arrows into editable arc arrow atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillDonutSegment(image, 88, 50, 128, 128, 0.62, -60, 35, "#38bdf8");
  fillDonutSegment(image, 88, 50, 128, 128, 0.62, 70, 165, "#0ea5e9");
  fillDonutSegment(image, 88, 50, 128, 128, 0.62, 200, 300, "#0369a1");
  fillTriangle(image, [{ x: 196, y: 90 }, { x: 222, y: 102 }, { x: 198, y: 116 }], "#38bdf8");
  fillTriangle(image, [{ x: 98, y: 160 }, { x: 80, y: 184 }, { x: 124, y: 177 }], "#0ea5e9");
  fillTriangle(image, [{ x: 150, y: 48 }, { x: 128, y: 34 }, { x: 126, y: 62 }], "#0369a1");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });
  const segments = atoms.filter((atom) => atom.kind === "native-arc-arrow-segment-candidate");

  assert.ok(segments.length >= 3);
  assert.ok(segments.every((atom) => atom.shapeHint === "arc-arrow-segment"));
  assert.ok(segments.every((atom) => atom.donutParentBox));
  assert.ok(segments.some((atom) => atom.arcArrowHead === true));
});

test("classifyVisualLayer treats segmented cycle arrows as whole reusable loop components", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillDonutSegment(image, 88, 50, 128, 128, 0.62, -60, 35, "#38bdf8");
  fillDonutSegment(image, 88, 50, 128, 128, 0.62, 70, 165, "#0ea5e9");
  fillDonutSegment(image, 88, 50, 128, 128, 0.62, 200, 300, "#0369a1");
  fillTriangle(image, [{ x: 196, y: 90 }, { x: 222, y: 102 }, { x: 198, y: 116 }], "#38bdf8");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 460, h: 260 },
    source: {
      detector: "islide-segmented-cycle-arrow-component",
      expressionForm: "complex-diagram",
      expressionSubtype: "循环箭头 圆弧箭头 闭环流程"
    }
  }, { textBoxes: [] }, { widthPt: 460, heightPt: 260 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "cycle-loop");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "cycle-loop");
  assert.equal(layer.diagramUnderstanding.componentStrategy.mode, "component-template");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "cycle-loop");
  assert.equal(layer.diagramUnderstanding.structureSignature.wholeGroupTemplatePriority, "high");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("cycle-loop"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("arc-arrow"));
  assert.ok(layer.diagramUnderstanding.componentStrategy.sourcePreference.includes("islide-search"));
  assert.ok(layer.visualAtoms.filter((atom) => atom.kind === "native-arc-arrow-segment-candidate").length >= 3);
  assert.equal(layer.visualAtoms.some((atom) => atom.kind === "complex-shape-crop-candidate" && atom.residualCandidate === true), false);
});

test("extractVisualAtoms recognizes person avatar icons as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillPerson(image, 116, 48, 76, 128, "#1f2937");
  fillRect(image, 292, 96, 104, 44, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-person-candidate" && atom.shapeHint === "person"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("extractVisualAtoms recognizes team group icons as native atoms", () => {
  const image = blankImage(520, 280, "#ffffff");
  fillTeam(image, 88, 54, 152, 120, "#1f2937");
  fillRect(image, 332, 108, 118, 48, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 520, h: 280 }, { widthPt: 520, heightPt: 280 });

  assert.ok(atoms.some((atom) => atom.kind === "native-team-candidate" && atom.shapeHint === "team"));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("extractVisualAtoms recognizes milestone timelines as native atoms", () => {
  const image = blankImage(560, 240, "#ffffff");
  fillTimeline(image, 72, 108, 348, 32, [0.14, 0.38, 0.62, 0.86], "#2563eb");
  fillRect(image, 432, 94, 118, 48, "#27ae60");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 560, h: 240 }, { widthPt: 560, heightPt: 240 });
  const timeline = atoms.find((atom) => atom.kind === "native-timeline-candidate" && atom.shapeHint === "timeline");

  assert.ok(timeline);
  assert.equal(timeline.timelineMilestones.length, 4);
  assert.ok(timeline.timelineMilestones.every((milestone) => Number.isFinite(milestone.widthPt) && milestone.widthPt > 0));
  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate"));
});

test("classifyVisualLayer recognizes visual timeline roadmap structures", () => {
  const image = blankImage(680, 300, "#ffffff");
  fillTimeline(image, 72, 142, 536, 34, [0.1, 0.36, 0.62, 0.9], "#2563eb");
  fillRect(image, 96, 82, 92, 42, "#dbeafe");
  fillRect(image, 238, 190, 104, 44, "#bfdbfe");
  fillRect(image, 382, 82, 96, 42, "#dbeafe");
  fillRect(image, 548, 190, 92, 44, "#bfdbfe");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 680, h: 300 },
    source: {
      detector: "roadmap-underlay-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "product roadmap milestones"
    }
  }, { textBoxes: [] }, { widthPt: 680, heightPt: 300 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "timeline-roadmap");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "structured-process");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "timeline");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "left-to-right-milestones");
  assert.equal(layer.diagramUnderstanding.structureSignature.wholeGroupTemplatePriority, "high");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "timeline");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("milestone-roadmap"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("whole-process-template"));
});

test("classifyVisualLayer recognizes visual gantt roadmap structures", () => {
  const image = blankImage(680, 340, "#ffffff");
  fillRect(image, 96, 78, 500, 4, "#64748b");
  for (const x of [168, 278, 388, 498]) fillRect(image, x, 72, 3, 18, "#64748b");
  fillRect(image, 132, 118, 190, 28, "#60a5fa");
  fillRect(image, 228, 166, 250, 28, "#34d399");
  fillRect(image, 356, 214, 170, 28, "#f59e0b");
  fillRect(image, 456, 262, 118, 28, "#a78bfa");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 680, h: 340 },
    source: {
      detector: "project-schedule-underlay-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "gantt project schedule roadmap"
    }
  }, { textBoxes: [] }, { widthPt: 680, heightPt: 340 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "gantt-roadmap");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "structured-process");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "gantt-roadmap");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "left-to-right-schedule-bars");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "timeline");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("gantt-roadmap"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("milestone-roadmap"));
});

test("extractVisualAtoms recognizes low-density text-filled pills as native atoms", () => {
  const image = blankImage(460, 260, "#ffffff");
  fillPill(image, 170, 96, 158, 44, "#64b581");
  fillRect(image, 204, 109, 18, 8, "#ffffff");
  fillRect(image, 230, 109, 18, 8, "#ffffff");
  fillRect(image, 256, 109, 18, 8, "#ffffff");
  fillRect(image, 204, 123, 70, 6, "#ffffff");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 460, h: 260 }, { widthPt: 460, heightPt: 260 });

  assert.ok(atoms.some((atom) => atom.kind === "native-rect-candidate" && atom.shapeHint === "pill"));
});

test("extractVisualAtoms splits intersecting table grids into native line atoms", () => {
  const image = blankImage(420, 260, "#ffffff");
  for (const y of [60, 110, 160, 210]) fillRect(image, 42, y, 336, 3, "#8a8f98");
  for (const x of [42, 154, 266, 378]) fillRect(image, x, 60, 3, 153, "#8a8f98");

  const atoms = extractVisualAtoms(image, { x: 0, y: 0, w: 420, h: 260 }, { widthPt: 420, heightPt: 260 });
  const gridLines = atoms.filter((atom) => atom.kind === "grid-line-candidate");

  assert.ok(gridLines.filter((atom) => atom.shapeHint === "grid-line-horizontal").length >= 4);
  assert.ok(gridLines.filter((atom) => atom.shapeHint === "grid-line-vertical").length >= 4);
  assert.ok(gridLines.every((atom) => atom.nativeCandidate === true));
});

test("classifyVisualLayer promotes visual grid atoms into matrix structure metadata", () => {
  const image = blankImage(420, 260, "#ffffff");
  for (const y of [60, 110, 160, 210]) fillRect(image, 42, y, 336, 3, "#8a8f98");
  for (const x of [42, 154, 266, 378]) fillRect(image, x, 60, 3, 153, "#8a8f98");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 420, h: 260 },
    source: {
      detector: "foreground-graphic-underlay-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "table-grid"
    }
  }, { textBoxes: [] }, { widthPt: 420, heightPt: 260 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "matrix-or-grid");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "delegate-to-table-grid-parser");
  assert.ok(layer.diagramUnderstanding.visualGrid);
  assert.equal(layer.diagramUnderstanding.visualGrid.rows, 3);
  assert.equal(layer.diagramUnderstanding.visualGrid.columns, 3);
  assert.equal(layer.reconstructionPlan.diagramUnderstanding.visualGrid.rows, 3);
});

test("classifyVisualLayer recognizes visual quadrant matrix structures", () => {
  const image = blankImage(520, 360, "#ffffff");
  fillRect(image, 64, 178, 392, 4, "#64748b");
  fillRect(image, 258, 54, 4, 252, "#64748b");
  fillRect(image, 96, 82, 112, 56, "#dbeafe");
  fillRect(image, 312, 82, 112, 56, "#bfdbfe");
  fillRect(image, 96, 220, 112, 56, "#bfdbfe");
  fillRect(image, 312, 220, 112, 56, "#dbeafe");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 520, h: 360 },
    source: {
      detector: "quadrant-priority-underlay-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "impact effort quadrant matrix"
    }
  }, { textBoxes: [] }, { widthPt: 520, heightPt: 360 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "quadrant-matrix");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "layout-grid");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "quadrant");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "quadrant-matrix");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("quadrant-axis"));
});

test("classifyVisualLayer recognizes dashboard KPI card grids as semantic components", () => {
  const image = blankImage(620, 360, "#ffffff");
  const cards = [
    [70, 70], [250, 70], [430, 70],
    [70, 200], [250, 200], [430, 200]
  ];
  for (const [x, y] of cards) {
    fillRect(image, x, y, 128, 72, "#dbeafe");
    fillRect(image, x + 14, y + 46, 86, 8, "#60a5fa");
  }

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 620, h: 360 },
    source: {
      detector: "dashboard-kpi-card-grid-underlay",
      expressionForm: "complex-diagram",
      expressionSubtype: "dashboard KPI metric cards 数据看板 指标卡"
    }
  }, {
    textBoxes: cards.map(([x, y], index) => ({
      id: `kpi-${index + 1}`,
      text: index % 2 === 0 ? "收入" : "转化率",
      box: { x: x + 16, y: y + 16, w: 72, h: 22 }
    }))
  }, { widthPt: 620, heightPt: 360 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "dashboard-card-grid");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "data-chart");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "dashboard-card-grid");
  assert.equal(layer.diagramUnderstanding.structureSignature.rows, 2);
  assert.equal(layer.diagramUnderstanding.structureSignature.columns, 3);
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "grid-or-matrix");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("dashboard-card-grid"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("card-grid"));
});

test("classifyVisualLayer recognizes numbered step card grids as reusable native components", () => {
  const image = blankImage(660, 320, "#ffffff");
  const cards = [
    [54, 98], [248, 98], [442, 98]
  ];
  cards.forEach(([x, y], index) => {
    fillRect(image, x, y, 156, 116, "#f8fafc");
    fillEllipse(image, x + 18, y + 18, 34, 34, index === 0 ? "#2563eb" : index === 1 ? "#10b981" : "#f97316");
    fillRect(image, x + 66, y + 28, 58, 10, "#0f172a");
    fillRect(image, x + 28, y + 76, 92, 8, "#94a3b8");
    fillRect(image, x + 28, y + 94, 72, 8, "#cbd5e1");
  });

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 660, h: 320 },
    source: {
      detector: "numbered-step-card-grid-underlay",
      expressionForm: "complex-diagram",
      expressionSubtype: "numbered step cards process cards 步骤卡片 编号卡片 阶段卡片"
    }
  }, {
    textBoxes: cards.flatMap(([x, y], index) => [
      { id: `n-${index + 1}`, text: `0${index + 1}`, box: { x: x + 24, y: y + 24, w: 22, h: 18 } },
      { id: `t-${index + 1}`, text: ["识别", "匹配", "重建"][index], box: { x: x + 64, y: y + 24, w: 62, h: 18 } }
    ])
  }, { widthPt: 660, heightPt: 320 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "numbered-step-card-grid");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "structured-process");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "numbered-step-card-grid");
  assert.equal(layer.diagramUnderstanding.componentStrategy.mode, "component-template");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "numbered-step-card-grid");
  assert.equal(layer.diagramUnderstanding.structureSignature.stepCount, 3);
  assert.equal(layer.diagramUnderstanding.structureSignature.rows, 1);
  assert.equal(layer.diagramUnderstanding.structureSignature.columns, 3);
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("numbered-step-card-grid"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("step-badge"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("card-grid"));
  assert.equal(layer.recommendedAction, "attempt-native-reconstruction");
  assert.ok(layer.reconstructionPlan.primitives.includes("native-card-containers"));
  assert.ok(layer.reconstructionPlan.primitives.includes("editable-step-badges"));
  assert.ok(layer.reconstructionPlan.primitives.includes("editable-step-text"));
});

test("classifyVisualLayer rebuilds screenshot card grids while preserving screenshots as minimum crops", () => {
  const image = blankImage(640, 360, "#ffffff");
  const cards = [
    [70, 64], [338, 64],
    [70, 202], [338, 202]
  ];
  cards.forEach(([x, y], index) => {
    fillRect(image, x, y, 220, 96, "#f8fafc");
    fillRect(image, x + 14, y + 14, 84, 58, index % 2 === 0 ? "#dbeafe" : "#dcfce7");
    fillRect(image, x + 22, y + 24, 68, 8, "#60a5fa");
    fillRect(image, x + 22, y + 40, 52, 7, "#93c5fd");
    fillRect(image, x + 22, y + 56, 60, 7, "#bfdbfe");
    fillRect(image, x + 116, y + 22, 70, 10, "#0f172a");
    fillRect(image, x + 116, y + 48, 58, 8, "#94a3b8");
    fillRect(image, x + 116, y + 64, 66, 8, "#cbd5e1");
  });

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 640, h: 360 },
    source: {
      detector: "product-screenshot-card-grid-underlay",
      expressionForm: "complex-diagram",
      expressionSubtype: "product screenshot cards screen gallery 产品截图 界面展示 截图卡片"
    }
  }, {
    textBoxes: cards.map(([x, y], index) => ({
      id: `screen-${index + 1}`,
      text: index % 2 === 0 ? "门户首页" : "流程配置",
      box: { x: x + 114, y: y + 18, w: 82, h: 18 }
    }))
  }, { widthPt: 640, heightPt: 360 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "screenshot-card-grid");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "layout-grid");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "hybrid-native-plus-residual-crops");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "screenshot-card-grid");
  assert.equal(layer.diagramUnderstanding.componentStrategy.mode, "hybrid-template-plus-local-crops");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "screenshot-card-grid");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "screenshot-gallery-grid");
  assert.equal(layer.diagramUnderstanding.structureSignature.rows, 2);
  assert.equal(layer.diagramUnderstanding.structureSignature.columns, 2);
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("screenshot-card-grid"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("screenshot-crop"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("card-grid"));
  assert.equal(layer.recommendedAction, "split-native-with-residual-crop");
  assert.ok(layer.reconstructionPlan.primitives.includes("native-card-containers"));
  assert.ok(layer.reconstructionPlan.primitives.includes("editable-card-text"));
  assert.ok(layer.reconstructionPlan.primitives.includes("minimum-unit-screenshot-crops"));
});

test("classifyVisualLayer rebuilds visual example card grids while preserving example graphics as minimum crops", () => {
  const image = blankImage(640, 360, "#ffffff");
  const cards = [
    [72, 84], [342, 84]
  ];
  cards.forEach(([x, y], index) => {
    fillRect(image, x, y, 226, 150, "#f8fafc");
    fillRect(image, x, y, 226, 4, index === 0 ? "#38bdf8" : "#fb923c");
    fillCycleArrow(image, x + 28, y + 22, 96, 84, index === 0 ? "#38bdf8" : "#fb923c");
    fillRect(image, x + 142, y + 38, 58, 10, "#0f172a");
    fillRect(image, x + 142, y + 66, 44, 8, "#94a3b8");
    fillRect(image, x + 142, y + 84, 54, 8, "#cbd5e1");
  });

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 640, h: 360 },
    source: {
      detector: "plugin-visual-example-card-grid-underlay",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "component preview cards visual example 图示样例 组件预览 素材预览 卡片展示"
    }
  }, {
    textBoxes: cards.map(([x, y], index) => ({
      id: `example-${index + 1}`,
      text: index === 0 ? "循环箭头" : "流程图示",
      box: { x: x + 140, y: y + 34, w: 72, h: 18 }
    }))
  }, { widthPt: 640, heightPt: 360 }, { sourceImage: image });

  assert.equal(layer.layerType, "illustration-zone");
  assert.equal(layer.standaloneVisualAsset, undefined);
  assert.equal(layer.diagramUnderstanding.archetype, "visual-example-card-grid");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "layout-grid");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "hybrid-native-plus-residual-crops");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "visual-example-card-grid");
  assert.equal(layer.diagramUnderstanding.componentStrategy.mode, "hybrid-template-plus-local-crops");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "visual-example-card-grid");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "pictorial-example-card-grid");
  assert.equal(layer.diagramUnderstanding.structureSignature.rows, 1);
  assert.equal(layer.diagramUnderstanding.structureSignature.columns, 2);
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("visual-example-card-grid"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("visual-example-crop"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("card-grid"));
  assert.equal(layer.recommendedAction, "split-native-with-residual-crop");
  assert.ok(layer.reconstructionPlan.primitives.includes("native-card-containers"));
  assert.ok(layer.reconstructionPlan.primitives.includes("editable-card-text"));
  assert.ok(layer.reconstructionPlan.primitives.includes("minimum-unit-visual-example-crops"));
});

test("classifyVisualLayer rebuilds feature icon card grids while preserving icons as minimum crops", () => {
  const image = blankImage(640, 360, "#ffffff");
  const cards = [
    [54, 58], [236, 58], [418, 58],
    [54, 202], [236, 202], [418, 202]
  ];
  cards.forEach(([x, y], index) => {
    fillRect(image, x, y, 148, 104, "#f8fafc");
    fillRect(image, x, y, 148, 3, "#dbeafe");
    fillRect(image, x + 18, y + 18, 36, 36, index % 2 === 0 ? "#2563eb" : "#10b981");
    fillRect(image, x + 68, y + 24, 58, 10, "#0f172a");
    fillRect(image, x + 68, y + 48, 46, 8, "#94a3b8");
    fillRect(image, x + 68, y + 64, 54, 8, "#cbd5e1");
  });

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 640, h: 360 },
    source: {
      detector: "feature-icon-card-grid-underlay",
      expressionForm: "complex-diagram",
      expressionSubtype: "feature icon cards 功能卡片 图标卡片 能力卡片"
    }
  }, {
    textBoxes: cards.map(([x, y], index) => ({
      id: `feature-${index + 1}`,
      text: index % 2 === 0 ? "智能识别" : "自动重建",
      box: { x: x + 66, y: y + 20, w: 72, h: 18 }
    }))
  }, { widthPt: 640, heightPt: 360 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "feature-icon-card-grid");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "layout-grid");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "hybrid-native-plus-residual-crops");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "feature-icon-card-grid");
  assert.equal(layer.diagramUnderstanding.componentStrategy.mode, "hybrid-template-plus-local-crops");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "feature-icon-card-grid");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "icon-card-grid");
  assert.equal(layer.diagramUnderstanding.structureSignature.rows, 2);
  assert.equal(layer.diagramUnderstanding.structureSignature.columns, 3);
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("feature-icon-card-grid"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("icon-crop"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("card-grid"));
  assert.equal(layer.recommendedAction, "split-native-with-residual-crop");
  assert.ok(layer.reconstructionPlan.primitives.includes("native-card-containers"));
  assert.ok(layer.reconstructionPlan.primitives.includes("editable-card-text"));
  assert.ok(layer.reconstructionPlan.primitives.includes("minimum-unit-icon-crops"));
});

test("classifyVisualLayer recognizes comparison matrices as reusable component targets", () => {
  const image = blankImage(560, 320, "#ffffff");
  for (const y of [64, 128, 192, 256]) fillRect(image, 56, y, 448, 3, "#94a3b8");
  for (const x of [56, 205, 354, 503]) fillRect(image, x, 64, 3, 195, "#94a3b8");
  fillRect(image, 58, 66, 146, 60, "#eff6ff");
  fillRect(image, 207, 66, 146, 60, "#f8fafc");
  fillRect(image, 356, 66, 146, 60, "#f8fafc");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 560, h: 320 },
    source: {
      detector: "comparison-table-underlay",
      expressionForm: "complex-diagram",
      expressionSubtype: "方案对比 竞品对比 comparison matrix"
    }
  }, {
    textBoxes: [
      { id: "h1", text: "方案A", box: { x: 92, y: 84, w: 66, h: 20 } },
      { id: "h2", text: "方案B", box: { x: 242, y: 84, w: 66, h: 20 } },
      { id: "h3", text: "方案C", box: { x: 392, y: 84, w: 66, h: 20 } },
      { id: "r1", text: "成本", box: { x: 92, y: 150, w: 48, h: 18 } },
      { id: "r2", text: "收益", box: { x: 242, y: 214, w: 48, h: 18 } }
    ]
  }, { widthPt: 560, heightPt: 320 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "comparison-matrix");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "layout-grid");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "comparison-matrix");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "column-comparison");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "grid-or-matrix");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("comparison-matrix"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("card-grid"));
});

test("classifyVisualLayer recognizes heatmap matrices as color-scale component targets", () => {
  const image = blankImage(520, 320, "#ffffff");
  for (const y of [58, 108, 158, 208, 258]) fillRect(image, 72, y, 376, 3, "#94a3b8");
  for (const x of [72, 166, 260, 354, 448]) fillRect(image, x, 58, 3, 203, "#94a3b8");
  const colors = ["#dcfce7", "#bbf7d0", "#fef3c7", "#fed7aa", "#fecaca", "#fca5a5", "#fde68a", "#86efac"];
  let colorIndex = 0;
  for (const y of [61, 111, 161, 211]) {
    for (const x of [75, 169, 263, 357]) {
      fillRect(image, x + 3, y + 3, 84, 40, colors[colorIndex % colors.length]);
      colorIndex += 1;
    }
  }

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 520, h: 320 },
    source: {
      detector: "heatmap-risk-matrix-underlay",
      expressionForm: "complex-diagram",
      expressionSubtype: "热力图 风险矩阵 heatmap color scale"
    }
  }, { textBoxes: [] }, { widthPt: 520, heightPt: 320 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "heatmap-matrix");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "layout-grid");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "heatmap-matrix");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "color-scale-grid");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "grid-or-matrix");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("heatmap-matrix"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("card-grid"));
});

test("classifyVisualLayer recognizes treemap area composition diagrams", () => {
  const image = blankImage(560, 340, "#ffffff");
  fillRect(image, 70, 64, 230, 210, "#60a5fa");
  fillRect(image, 306, 64, 154, 100, "#93c5fd");
  fillRect(image, 466, 64, 40, 100, "#bfdbfe");
  fillRect(image, 306, 170, 92, 104, "#2563eb");
  fillRect(image, 404, 170, 102, 104, "#dbeafe");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 560, h: 340 },
    source: {
      detector: "treemap-area-composition-underlay",
      expressionForm: "complex-diagram",
      expressionSubtype: "treemap market share area composition 矩形树图 面积占比"
    }
  }, { textBoxes: [] }, { widthPt: 560, heightPt: 340 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "treemap-chart");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "data-chart");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "treemap");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "proportional-area-tiles");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "treemap-chart");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("treemap-chart"));
});

test("classifyVisualLayer recovers measured Sankey nodes and weighted bands", () => {
  const image = blankImage(620, 340, "#ffffff");
  fillSankeyBand(image, 76, 84, 116, 290, 116, 150, "#93c5fd");
  fillSankeyBand(image, 76, 126, 150, 290, 164, 184, "#f9a8d4");
  fillSankeyBand(image, 76, 206, 240, 290, 184, 210, "#fdba74");
  fillSankeyBand(image, 308, 116, 146, 540, 82, 112, "#86efac");
  fillSankeyBand(image, 308, 150, 184, 540, 196, 232, "#c4b5fd");
  fillSankeyBand(image, 308, 184, 210, 540, 238, 264, "#67e8f9");
  fillRect(image, 58, 68, 18, 92, "#334155");
  fillRect(image, 58, 196, 18, 56, "#475569");
  fillRect(image, 290, 108, 18, 106, "#1e293b");
  fillRect(image, 540, 70, 18, 50, "#166534");
  fillRect(image, 540, 190, 18, 80, "#166534");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 620, h: 340 },
    source: {
      detector: "sankey-flow-distribution-underlay",
      expressionForm: "data-chart",
      expressionSubtype: "sankey alluvial flow distribution 桑基图 流向分布"
    }
  }, { textBoxes: [] }, { widthPt: 620, heightPt: 340 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "sankey-flow-chart");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "data-chart");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.visualAtomKindCounts["native-rect-candidate"], 5);
  assert.equal(layer.diagramUnderstanding.visualAtomKindCounts["native-sankey-band-candidate"], 6);
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "sankey-flow");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "weighted-source-to-target-flow");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "sankey-flow-chart");
  assert.equal(layer.diagramUnderstanding.componentStrategy.mode, "component-template");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("sankey-flow-chart"));
});

test("classifyVisualLayer treats geographic map graphics as whole component or fidelity crop targets", () => {
  const image = blankImage(520, 300, "#ffffff");
  fillPolygon(image, [
    { x: 168, y: 72 },
    { x: 286, y: 58 },
    { x: 368, y: 122 },
    { x: 346, y: 216 },
    { x: 238, y: 244 },
    { x: 136, y: 184 }
  ], parseHex("#bfdbfe"));
  fillPolygon(image, [
    { x: 224, y: 102 },
    { x: 286, y: 94 },
    { x: 322, y: 142 },
    { x: 294, y: 188 },
    { x: 230, y: 178 }
  ], parseHex("#60a5fa"));
  fillEllipse(image, 298, 132, 18, 18, "#ef4444");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 520, h: 300 },
    source: {
      detector: "china-map-distribution-snapshot",
      expressionForm: "chart-snapshot",
      expressionSubtype: "map chart geo map 中国地图 区域分布 地图热力"
    }
  }, { textBoxes: [] }, { widthPt: 520, heightPt: 300 }, { sourceImage: image });

  assert.equal(layer.layerType, "chart-zone");
  assert.equal(layer.diagramUnderstanding.archetype, "map-chart");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "data-chart");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "preserve-crop-with-structured-metadata");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "geo-map");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "geographic-region-composition");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "map-chart");
  assert.equal(layer.diagramUnderstanding.componentStrategy.mode, "component-template");
  assert.ok(layer.diagramUnderstanding.componentStrategy.sourcePreference.includes("local-crop-fidelity"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("map-chart"));
});

test("classifyVisualLayer treats word clouds as whole component or fidelity crop targets", () => {
  const image = blankImage(560, 320, "#ffffff");
  fillRect(image, 138, 88, 132, 42, "#2563eb");
  fillRect(image, 286, 104, 96, 30, "#60a5fa");
  fillRect(image, 198, 154, 164, 36, "#10b981");
  fillRect(image, 110, 206, 88, 26, "#f97316");
  fillRect(image, 374, 190, 72, 24, "#8b5cf6");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 560, h: 320 },
    source: {
      detector: "keyword-word-cloud-snapshot",
      expressionForm: "chart-snapshot",
      expressionSubtype: "word cloud keyword cloud 词云 关键词云 标签云"
    }
  }, { textBoxes: [] }, { widthPt: 560, heightPt: 320 }, { sourceImage: image });

  assert.equal(layer.layerType, "chart-zone");
  assert.equal(layer.diagramUnderstanding.archetype, "word-cloud-chart");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "data-chart");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "preserve-crop-with-structured-metadata");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "word-cloud");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "weighted-keyword-size-cloud");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "word-cloud-chart");
  assert.equal(layer.diagramUnderstanding.componentStrategy.mode, "component-template");
  assert.ok(layer.diagramUnderstanding.componentStrategy.sourcePreference.includes("local-crop-fidelity"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("word-cloud-chart"));
});

test("classifyVisualLayer preserves QR codes as scan-safe raster crops", () => {
  const image = blankImage(360, 260, "#ffffff");
  const originX = 118;
  const originY = 68;
  const cell = 8;
  const pattern = [
    [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [4, 1], [0, 2], [2, 2], [4, 2], [0, 3], [4, 3], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4],
    [11, 0], [12, 0], [13, 0], [14, 0], [15, 0], [11, 1], [15, 1], [11, 2], [13, 2], [15, 2], [11, 3], [15, 3], [11, 4], [12, 4], [13, 4], [14, 4], [15, 4],
    [0, 11], [1, 11], [2, 11], [3, 11], [4, 11], [0, 12], [4, 12], [0, 13], [2, 13], [4, 13], [0, 14], [4, 14], [0, 15], [1, 15], [2, 15], [3, 15], [4, 15],
    [7, 7], [8, 7], [10, 7], [6, 8], [9, 8], [12, 8], [7, 9], [11, 9], [13, 9], [6, 10], [8, 10], [10, 10], [14, 10], [9, 11], [12, 11], [7, 12], [13, 12], [8, 13], [10, 13], [14, 13], [6, 14], [11, 14]
  ];
  for (const [x, y] of pattern) {
    fillRect(image, originX + x * cell, originY + y * cell, cell, cell, "#111827");
  }

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 360, h: 260 },
    source: {
      detector: "qr-code-fidelity-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "qr code 二维码 扫码"
    }
  }, { textBoxes: [] }, { widthPt: 360, heightPt: 260 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "machine-readable-code");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "pictorial-asset");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "preserve-crop");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "machine-readable-code");
  assert.equal(layer.diagramUnderstanding.componentStrategy.mode, "preserve-local-crop");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "machine-readable-code");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "scan-fidelity-raster");
  assert.equal(layer.recommendedAction, "preserve-local-crop");
  assert.equal(layer.reconstructionPlan.status, "deferred");
});

test("classifyVisualLayer treats annotated screenshots as base crops with editable overlays", () => {
  const image = blankImage(620, 360, "#ffffff");
  fillRect(image, 70, 58, 360, 236, "#e5e7eb");
  fillRect(image, 92, 86, 310, 32, "#cbd5e1");
  fillRect(image, 92, 138, 136, 34, "#ffffff");
  fillRect(image, 246, 138, 136, 34, "#ffffff");
  fillRect(image, 112, 196, 248, 44, "#ffffff");
  fillRect(image, 186, 132, 4, 120, "#ef4444");
  fillRect(image, 102, 132, 172, 4, "#ef4444");
  fillRect(image, 102, 248, 172, 4, "#ef4444");
  fillRect(image, 102, 132, 4, 120, "#ef4444");
  fillRect(image, 270, 132, 4, 120, "#ef4444");
  fillArrowRight(image, 438, 168, 96, 8, 28, "#ef4444");
  fillRect(image, 500, 96, 86, 42, "#fee2e2");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 620, h: 360 },
    source: {
      detector: "ui-screenshot-annotation",
      expressionForm: "screenshot-or-document",
      expressionSubtype: "annotated screenshot callout highlight box 截图标注 说明气泡 高亮框"
    }
  }, {
    textBoxes: [
      { text: "点击此处", box: { x: 506, y: 104, w: 70, h: 20 } }
    ]
  }, { widthPt: 620, heightPt: 360 }, { sourceImage: image });

  assert.equal(layer.layerType, "screenshot-zone");
  assert.equal(layer.standaloneVisualAsset, undefined);
  assert.equal(layer.diagramUnderstanding.archetype, "screenshot-annotation");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "annotated-screenshot");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "hybrid-native-plus-residual-crops");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "screenshot-annotation");
  assert.equal(layer.diagramUnderstanding.componentStrategy.mode, "hybrid-template-plus-local-crops");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "screenshot-annotation");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "base-crop-with-editable-overlays");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("screenshot-annotation"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("callout-overlay"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("highlight-box"));
  assert.equal(layer.recommendedAction, "split-native-with-residual-crop");
  assert.ok(layer.reconstructionPlan.primitives.includes("base-screenshot-crop"));
  assert.ok(layer.reconstructionPlan.primitives.includes("editable-callouts"));
});

test("classifyVisualLayer treats screenshot zoom callouts as crops plus editable zoom overlays", () => {
  const image = blankImage(680, 380, "#ffffff");
  fillRect(image, 54, 50, 392, 260, "#e2e8f0");
  fillRect(image, 82, 84, 330, 34, "#cbd5e1");
  fillRect(image, 82, 142, 128, 38, "#ffffff");
  fillRect(image, 226, 142, 150, 38, "#ffffff");
  fillRect(image, 104, 210, 260, 44, "#ffffff");
  fillRect(image, 218, 136, 160, 4, "#2563eb");
  fillRect(image, 218, 136, 4, 116, "#2563eb");
  fillRect(image, 218, 248, 160, 4, "#2563eb");
  fillRect(image, 374, 136, 4, 116, "#2563eb");
  fillLine(image, 378, 194, 490, 164, 6, "#2563eb");
  fillMagnifier(image, 480, 90, 150, "#2563eb");
  fillRect(image, 510, 130, 88, 18, "#e0f2fe");
  fillRect(image, 510, 160, 88, 18, "#e0f2fe");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 680, h: 380 },
    source: {
      detector: "ui-screenshot-zoom-callout",
      expressionForm: "screenshot-or-document",
      expressionSubtype: "screenshot zoom callout magnifier 局部放大 放大镜标注 放大框"
    }
  }, {
    textBoxes: [
      { text: "局部放大", box: { x: 506, y: 68, w: 84, h: 20 } },
      { text: "关键字段", box: { x: 518, y: 188, w: 70, h: 18 } }
    ]
  }, { widthPt: 680, heightPt: 380 }, { sourceImage: image });

  assert.equal(layer.layerType, "screenshot-zone");
  assert.equal(layer.diagramUnderstanding.archetype, "screenshot-zoom-callout");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "annotated-screenshot");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "hybrid-native-plus-residual-crops");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "screenshot-zoom-callout");
  assert.equal(layer.diagramUnderstanding.componentStrategy.mode, "hybrid-template-plus-local-crops");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "screenshot-zoom-callout");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "source-highlight-to-magnified-detail");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("screenshot-zoom-callout"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("zoom-lens-overlay"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("highlight-box"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("callout-overlay"));
  assert.equal(layer.recommendedAction, "split-native-with-residual-crop");
  assert.ok(layer.reconstructionPlan.primitives.includes("base-screenshot-crop"));
  assert.ok(layer.reconstructionPlan.primitives.includes("zoom-detail-crop"));
  assert.ok(layer.reconstructionPlan.primitives.includes("editable-zoom-connectors"));
});

test("classifyVisualLayer promotes visual convergence lens diagrams to component templates", () => {
  const image = blankImage(720, 390, "#ffffff");
  fillRect(image, 72, 58, 150, 54, "#dbeafe");
  fillRect(image, 72, 166, 150, 54, "#e0f2fe");
  fillRect(image, 72, 274, 150, 54, "#dcfce7");
  fillLine(image, 222, 85, 455, 188, 5, "#60a5fa");
  fillLine(image, 222, 193, 455, 193, 5, "#60a5fa");
  fillLine(image, 222, 301, 455, 198, 5, "#60a5fa");
  fillMagnifier(image, 438, 112, 170, "#2563eb");
  fillRect(image, 492, 160, 72, 20, "#eff6ff");
  fillRect(image, 492, 194, 72, 20, "#eff6ff");
  const colorComponents = foregroundComponentsBySeedColor(image, { x: 0, y: 0, w: 720, h: 390 }, [255, 255, 255], [], 24);
  const searchComponents = colorComponents.filter((component) => looksLikeSearchIcon(component));
  const lowerConvergenceLine = colorComponents.find((component) => component.box.w > 180 && component.box.y >= 198);

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 720, h: 390 },
    source: {
      detector: "plugin-component-diagram-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "component template visual"
    }
  }, {
    textBoxes: [
      { id: "a", text: "输入素材", box: { x: 104, y: 74, w: 70, h: 20 } },
      { id: "b", text: "业务目标", box: { x: 104, y: 182, w: 70, h: 20 } },
      { id: "c", text: "角色关系", box: { x: 104, y: 290, w: 70, h: 20 } },
      { id: "d", text: "输出蓝图", box: { x: 496, y: 226, w: 70, h: 20 } }
    ]
  }, { widthPt: 720, heightPt: 390 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "funnel-lens-flow");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "structured-process");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "funnel-lens-flow");
  assert.ok(layer.diagramUnderstanding.componentStrategy.sourcePreference.includes("officeplus-search"));
  assert.ok(layer.diagramUnderstanding.componentStrategy.sourcePreference.includes("islide-search"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("lens-funnel-flow"));
  assert.ok(layer.diagramUnderstanding.structureSignature.layout === "funnel-lens-flow");
  assert.ok(
    (layer.diagramUnderstanding.visualAtomKindCounts["native-search-candidate"] || 0) >= 1,
    JSON.stringify(colorComponents.filter((component) => component.box.w > 80).map((component) => ({
      box: component.box,
      density: component.pixelCount / (component.box.w * component.box.h),
      search: searchIconEvidence(component)
    })))
  );
  assert.equal(searchComponents.length, 1);
  assert.ok(inferDiagonalLineFit(lowerConvergenceLine), JSON.stringify(lowerConvergenceLine?.box || null));
  assert.equal(layer.diagramUnderstanding.visualAtomKindCounts["native-cycle-arrow-candidate"] || 0, 0);
  assert.ok(
    (layer.diagramUnderstanding.visualAtomKindCounts["connector-line-candidate"] || 0)
      + (layer.diagramUnderstanding.visualAtomKindCounts["grid-line-candidate"] || 0) >= 3,
    JSON.stringify(layer.diagramUnderstanding.visualAtomKindCounts)
  );
  assert.equal(layer.diagramUnderstanding.visualAtomKindCounts["screenshot-crop-candidate"] || 0, 0);
  assert.notEqual(layer.recommendedAction, "preserve-local-crop");
});

test("classifyVisualLayer feeds visual atoms into diagram understanding", () => {
  const image = blankImage(400, 240, "#ffffff");
  fillRect(image, 40, 80, 90, 48, "#2f80ed");
  fillRect(image, 165, 99, 70, 8, "#2f80ed");
  fillRect(image, 270, 80, 90, 48, "#27ae60");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 400, h: 240 },
    source: {
      detector: "sparse-diagram-graphic-underlay-crop",
      expressionForm: "complex-diagram"
    }
  }, {
    textBoxes: [
      { id: "a", text: "输入", box: { x: 58, y: 92, w: 48, h: 20 } },
      { id: "b", text: "输出", box: { x: 292, y: 92, w: 48, h: 20 } }
    ]
  }, { widthPt: 400, heightPt: 240 }, { sourceImage: image });

  assert.ok(layer.diagramUnderstanding.visualAtomCount >= 3);
  assert.ok(layer.diagramUnderstanding.visualAtomKindCounts["native-rect-candidate"] >= 2);
  assert.ok(
    (layer.diagramUnderstanding.visualAtomKindCounts["connector-line-candidate"] || 0)
    + (layer.diagramUnderstanding.visualAtomKindCounts["grid-line-candidate"] || 0) >= 1
  );
  assert.ok(layer.diagramUnderstanding.visualNodeCount >= 2);
  assert.equal(layer.reconstructionPlan.diagramUnderstanding.visualAtomCount, layer.diagramUnderstanding.visualAtomCount);
  assert.equal(layer.reconstructionPlan.diagramUnderstanding.visualNodeCount, layer.diagramUnderstanding.visualNodeCount);
});

test("classifyVisualLayer emits structure signatures for whole-group process templates", () => {
  const image = blankImage(640, 240, "#ffffff");
  for (const [x, color] of [[52, "#60a5fa"], [204, "#93c5fd"], [356, "#60a5fa"], [508, "#93c5fd"]]) {
    fillRect(image, x, 84, 92, 52, color);
  }
  for (const x of [154, 306, 458]) {
    fillArrowRight(image, x, 104, 34, 7, 18, "#94a3b8");
  }

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 640, h: 240 },
    source: {
      detector: "sparse-diagram-graphic-underlay-crop",
      expressionForm: "complex-diagram"
    }
  }, { textBoxes: [] }, { widthPt: 640, heightPt: 240 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "flow-card-chain");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "linear-process");
  assert.equal(layer.diagramUnderstanding.structureSignature.stepCount, 4);
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "left-to-right");
  assert.equal(layer.diagramUnderstanding.structureSignature.wholeGroupTemplatePriority, "high");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("whole-process-template"));
  assert.equal(layer.diagramUnderstanding.componentStrategy.structureSignature.layout, "linear-process");
});

test("classifyVisualLayer links visual arrow atoms to nearest native visual nodes", () => {
  const image = blankImage(420, 240, "#ffffff");
  fillRect(image, 40, 86, 70, 44, "#2f80ed");
  fillArrowRight(image, 138, 106, 100, 8, 28, "#27ae60");
  fillRect(image, 284, 86, 70, 44, "#2f80ed");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 420, h: 240 },
    source: {
      detector: "sparse-diagram-graphic-underlay-crop",
      expressionForm: "complex-diagram"
    }
  }, { textBoxes: [] }, { widthPt: 420, heightPt: 240 }, { sourceImage: image });

  assert.ok(layer.diagramUnderstanding.visualNodeCount >= 2);
  assert.ok(layer.diagramUnderstanding.visualConnectorCount >= 1);
  assert.ok(layer.diagramUnderstanding.visualConnectors.some((connector) => connector.fromAtomId && connector.toAtomId && connector.arrow));
  assert.equal(layer.reconstructionPlan.diagramUnderstanding.visualConnectorCount, layer.diagramUnderstanding.visualConnectorCount);
});

test("classifyVisualLayer recognizes visual hub-spoke structures from atom graph", () => {
  const image = blankImage(500, 360, "#ffffff");
  fillRect(image, 216, 148, 68, 44, "#2563eb");
  fillRect(image, 216, 40, 68, 44, "#60a5fa");
  fillRect(image, 216, 256, 68, 44, "#60a5fa");
  fillRect(image, 56, 148, 68, 44, "#60a5fa");
  fillRect(image, 376, 148, 68, 44, "#60a5fa");
  fillRect(image, 247, 84, 6, 64, "#94a3b8");
  fillRect(image, 247, 192, 6, 64, "#94a3b8");
  fillRect(image, 124, 167, 92, 6, "#94a3b8");
  fillRect(image, 284, 167, 92, 6, "#94a3b8");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 500, h: 360 },
    source: {
      detector: "sparse-diagram-graphic-underlay-crop",
      expressionForm: "complex-diagram"
    }
  }, { textBoxes: [] }, { widthPt: 500, heightPt: 360 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "hub-spoke");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.residualCount, 0);
  assert.ok(layer.diagramUnderstanding.visualNodeCount >= 5);
  assert.ok(layer.diagramUnderstanding.visualConnectorCount >= 4);
});

test("classifyVisualLayer preserves a visual tree when branch endpoints are not measured", () => {
  const image = blankImage(520, 360, "#ffffff");
  fillRect(image, 210, 36, 100, 70, "#2563eb");
  fillRect(image, 40, 210, 100, 70, "#60a5fa");
  fillRect(image, 210, 210, 100, 70, "#60a5fa");
  fillRect(image, 380, 210, 100, 70, "#60a5fa");
  fillRect(image, 90, 150, 380, 6, "#94a3b8");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 520, h: 360 },
    source: {
      detector: "sparse-diagram-graphic-underlay-crop",
      expressionForm: "complex-diagram"
    }
  }, { textBoxes: [] }, { widthPt: 520, heightPt: 360 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "tree-structure");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "preserve-crop-with-structured-metadata");
  assert.equal(layer.diagramUnderstanding.residualCount, 0);
  assert.ok(layer.diagramUnderstanding.visualNodeCount >= 4);
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "tree");
  assert.equal(layer.diagramUnderstanding.structureSignature.wholeGroupTemplatePriority, "high");
  assert.equal(layer.diagramUnderstanding.componentStrategy.mode, "hybrid-template-plus-local-crops");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "hierarchy-tree");
  assert.ok(layer.diagramUnderstanding.componentStrategy.sourcePreference.includes("officeplus-search"));
  assert.ok(layer.diagramUnderstanding.componentStrategy.sourcePreference.includes("islide-search"));
  assert.ok(layer.diagramUnderstanding.componentStrategy.sourcePreference.includes("native-hierarchy-cards"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("tree-link"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("org-hierarchy"));
  assert.ok(layer.reconstructionPlan.primitives.includes("native-connectors"));
});

test("classifyVisualLayer recognizes visual swimlane flows from row-aligned node lanes", () => {
  const image = blankImage(640, 360, "#ffffff");
  for (const y of [86, 220]) {
    fillRect(image, 56, y, 92, 48, "#60a5fa");
    fillRect(image, 274, y, 92, 48, "#60a5fa");
    fillRect(image, 492, y, 92, 48, "#60a5fa");
    fillRect(image, 164, y + 22, 92, 5, "#94a3b8");
    fillRect(image, 382, y + 22, 92, 5, "#94a3b8");
  }

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 640, h: 360 },
    source: {
      detector: "sparse-diagram-graphic-underlay-crop",
      expressionForm: "complex-diagram"
    }
  }, { textBoxes: [] }, { widthPt: 640, heightPt: 360 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "swimlane-flow");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "structured-process");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.residualCount, 0);
  assert.ok(layer.diagramUnderstanding.visualNodeCount >= 6);
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "swimlane");
  assert.equal(layer.diagramUnderstanding.structureSignature.expressionFamily, "structured-process");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "swimlane-flow");
  assert.equal(layer.diagramUnderstanding.componentStrategy.mode, "component-template");
  assert.equal(layer.diagramUnderstanding.visualConnectorCount, 4);
  assert.ok(layer.diagramUnderstanding.componentStrategy.sourcePreference.includes("officeplus-search"));
  assert.ok(layer.diagramUnderstanding.componentStrategy.sourcePreference.includes("islide-search"));
  assert.equal(layer.reconstructionPlan.diagramUnderstanding.expressionFamily, "structured-process");
  assert.equal(layer.diagramUnderstanding.structureSignature.wholeGroupTemplatePriority, "high");
  assert.ok(layer.reconstructionPlan.primitives.includes("native-connectors"));
});

test("classifyVisualLayer recognizes visual fishbone cause-effect diagrams without keyword metadata", () => {
  const image = blankImage(680, 360, "#ffffff");
  fillThickLine(image, 92, 178, 572, 178, 7, "#2563eb");
  fillTriangle(image, [
    { x: 572, y: 178 },
    { x: 540, y: 162 },
    { x: 540, y: 194 }
  ], "#2563eb");
  for (const branch of [
    [188, 178, 132, 92],
    [278, 178, 222, 92],
    [368, 178, 424, 92],
    [458, 178, 514, 92],
    [214, 178, 154, 266],
    [336, 178, 276, 266],
    [456, 178, 516, 266]
  ]) {
    fillThickLine(image, branch[0], branch[1], branch[2], branch[3], 6, "#2563eb");
  }
  fillRect(image, 82, 58, 96, 34, "#dbeafe");
  fillRect(image, 198, 58, 96, 34, "#dbeafe");
  fillRect(image, 392, 58, 96, 34, "#dbeafe");
  fillRect(image, 120, 266, 96, 34, "#dbeafe");
  fillRect(image, 242, 266, 96, 34, "#dbeafe");
  fillRect(image, 482, 266, 96, 34, "#dbeafe");

  const layer = classifyVisualLayer({
    id: "visual-cause-structure",
    box: { x: 0, y: 0, w: 680, h: 360 },
    source: {
      detector: "sparse-diagram-graphic-underlay-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "branch-analysis"
    }
  }, { textBoxes: [] }, { widthPt: 680, heightPt: 360 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "fishbone-cause-effect");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "structured-process");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "fishbone");
  assert.equal(layer.diagramUnderstanding.structureSignature.wholeGroupTemplatePriority, "high");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("branch-card-flow"));
});

test("classifyVisualLayer recognizes Venn overlap diagrams as relationship components", () => {
  const image = blankImage(460, 280, "#ffffff");
  fillEllipse(image, 92, 64, 180, 132, "#60a5fa");
  fillEllipse(image, 188, 64, 180, 132, "#34d399");
  fillRect(image, 132, 212, 76, 28, "#bfdbfe");
  fillRect(image, 252, 212, 76, 28, "#bbf7d0");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 460, h: 280 },
    source: {
      detector: "overlap-relationship-underlay-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "set-relation"
    }
  }, { textBoxes: [] }, { widthPt: 460, heightPt: 280 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "venn-overlap");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "relationship-diagram");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "venn-overlap");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "venn-overlap");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("venn-overlap"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("intersection-overlap"));
  assert.equal(layer.diagramUnderstanding.visualAtomKindCounts["native-venn-ellipse-candidate"], 2);
  const vennAtoms = layer.diagramUnderstanding.visualAtoms
    .filter((atom) => atom.kind === "native-venn-ellipse-candidate")
    .sort((left, right) => left.box.x - right.box.x);
  assert.deepEqual(vennAtoms.map((atom) => atom.box), [
    { x: 92, y: 64, w: 180, h: 132 },
    { x: 188, y: 64, w: 180, h: 132 }
  ]);
  assert.ok(vennAtoms.every((atom) => atom.vennRecoveryConfidence >= 0.72));
});

test("classifyVisualLayer routes topology triangle diagrams to relationship components", () => {
  const image = blankImage(520, 340, "#ffffff");
  fillThickLine(image, 260, 66, 102, 240, 6, "#64748b");
  fillThickLine(image, 260, 66, 418, 240, 6, "#64748b");
  fillThickLine(image, 102, 240, 418, 240, 6, "#64748b");
  fillEllipse(image, 220, 34, 80, 64, "#60a5fa");
  fillEllipse(image, 58, 214, 88, 64, "#34d399");
  fillEllipse(image, 374, 214, 88, 64, "#f97316");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 520, h: 340 },
    source: {
      detector: "topology-relationship-underlay-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "closed-loop topology triangle"
    }
  }, { textBoxes: [] }, { widthPt: 520, heightPt: 340 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "topology-diagram");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "relationship-diagram");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "topology");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "triangular-closed-loop");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "topology-diagram");
  assert.equal(layer.diagramUnderstanding.componentStrategy.mode, "component-template");
  assert.equal(layer.diagramUnderstanding.visualConnectorCount, 3);
  assert.deepEqual(layer.diagramUnderstanding.visualConnectors.map((connector) => connector.axis).sort(), ["diagonal", "diagonal", "horizontal"]);
  assert.equal(new Set(layer.diagramUnderstanding.visualConnectors.flatMap((connector) => [connector.fromAtomId, connector.toAtomId])).size, 3);
  assert.ok(layer.diagramUnderstanding.componentStrategy.sourcePreference.includes("officeplus-search"));
  assert.ok(layer.diagramUnderstanding.componentStrategy.sourcePreference.includes("islide-search"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("topology-triangle"));
});

test("classifyVisualLayer treats pyramid layered stacks as structured process components", () => {
  const image = blankImage(520, 340, "#ffffff");
  fillRect(image, 210, 54, 100, 54, "#60a5fa");
  fillRect(image, 160, 130, 200, 54, "#34d399");
  fillRect(image, 104, 206, 312, 54, "#f97316");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 520, h: 340 },
    source: {
      detector: "pyramid-layered-stack-underlay-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "pyramid layered stack"
    }
  }, { textBoxes: [] }, { widthPt: 520, heightPt: 340 }, { sourceImage: image });

  assert.equal(layer.diagramUnderstanding.archetype, "layered-stack");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "structured-process");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "layered-stack");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "pyramid-down");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "layered-stack");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("layered-stack"));
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("pyramid-stack"));
});

test("classifyVisualLayer recognizes simple visual bar charts from bars and axis", () => {
  const image = blankImage(560, 340, "#ffffff");
  fillRect(image, 76, 282, 382, 5, "#64748b");
  fillRect(image, 92, 186, 42, 96, "#2f80ed");
  fillRect(image, 168, 126, 42, 156, "#2f80ed");
  fillRect(image, 244, 214, 42, 68, "#2f80ed");
  fillRect(image, 320, 94, 42, 188, "#2f80ed");
  fillRect(image, 396, 154, 42, 128, "#2f80ed");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 560, h: 340 },
    source: {
      detector: "bar-chart-axis-snapshot",
      expressionForm: "chart-snapshot"
    }
  }, { textBoxes: [] }, { widthPt: 560, heightPt: 340 }, { sourceImage: image });

  assert.equal(layer.layerType, "chart-zone");
  assert.equal(layer.diagramUnderstanding.archetype, "bar-chart");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "data-chart");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.recommendedAction, "attempt-native-reconstruction");
  assert.ok(layer.diagramUnderstanding.visualNodeCount >= 5);
  assert.equal(layer.diagramUnderstanding.structureSignature.expressionFamily, "data-chart");
  assert.equal(layer.reconstructionPlan.diagramUnderstanding.expressionFamily, "data-chart");
  assert.ok(layer.reconstructionPlan.primitives.includes("series-marks"));
});

test("classifyVisualLayer recognizes horizontal visual bar charts from aligned bars and axis", () => {
  const image = blankImage(560, 340, "#ffffff");
  fillRect(image, 86, 70, 5, 220, "#64748b");
  fillRect(image, 92, 92, 268, 24, "#2f80ed");
  fillRect(image, 92, 132, 188, 24, "#2f80ed");
  fillRect(image, 92, 172, 318, 24, "#2f80ed");
  fillRect(image, 92, 212, 142, 24, "#2f80ed");
  fillRect(image, 92, 252, 238, 24, "#2f80ed");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 560, h: 340 },
    source: {
      detector: "ranked-horizontal-bars-axis-snapshot",
      expressionForm: "chart-snapshot"
    }
  }, { textBoxes: [] }, { widthPt: 560, heightPt: 340 }, { sourceImage: image });

  assert.equal(layer.layerType, "chart-zone");
  assert.equal(layer.diagramUnderstanding.archetype, "bar-chart");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.recommendedAction, "attempt-native-reconstruction");
  assert.ok(layer.diagramUnderstanding.visualNodeCount >= 5);
  assert.ok(layer.reconstructionPlan.primitives.includes("series-marks"));
});

test("classifyVisualLayer recognizes stacked horizontal bar charts from segmented rows", () => {
  const image = blankImage(560, 340, "#ffffff");
  fillRect(image, 86, 70, 5, 220, "#64748b");
  const rows = [
    { y: 92, segments: [96, 74, 52] },
    { y: 138, segments: [62, 112, 84] },
    { y: 184, segments: [132, 58, 76] },
    { y: 230, segments: [78, 92, 118] }
  ];
  const colors = ["#2f80ed", "#27ae60", "#f2994a"];
  for (const row of rows) {
    let x = 92;
    row.segments.forEach((width, index) => {
      fillRect(image, x, row.y, width, 24, colors[index]);
      x += width;
    });
  }

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 560, h: 340 },
    source: {
      detector: "stacked-horizontal-bar-axis-snapshot",
      expressionForm: "chart-snapshot"
    }
  }, { textBoxes: [] }, { widthPt: 560, heightPt: 340 }, { sourceImage: image });

  assert.equal(layer.layerType, "chart-zone");
  assert.equal(layer.diagramUnderstanding.archetype, "bar-chart");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.recommendedAction, "attempt-native-reconstruction");
  assert.ok(layer.visualAtoms.filter((atom) => atom.kind === "native-rect-candidate").length >= 12);
  assert.ok(layer.reconstructionPlan.primitives.includes("series-marks"));
});

test("classifyVisualLayer recognizes waterfall variance bridge charts before generic bars", () => {
  const image = blankImage(560, 340, "#ffffff");
  fillRect(image, 76, 282, 382, 5, "#64748b");
  fillRect(image, 76, 86, 5, 201, "#64748b");
  fillRect(image, 108, 198, 42, 84, "#2563eb");
  fillRect(image, 176, 146, 42, 52, "#16a34a");
  fillRect(image, 244, 198, 42, 36, "#ef4444");
  fillRect(image, 312, 122, 42, 76, "#16a34a");
  fillRect(image, 380, 172, 42, 50, "#ef4444");
  fillRect(image, 448, 118, 42, 164, "#2563eb");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 560, h: 340 },
    source: {
      detector: "waterfall-variance-bridge-chart-snapshot",
      expressionForm: "chart-snapshot",
      expressionSubtype: "waterfall chart variance bridge 瀑布图 增减分析"
    }
  }, { textBoxes: [] }, { widthPt: 560, heightPt: 340 }, { sourceImage: image });

  assert.equal(layer.layerType, "chart-zone");
  assert.equal(layer.diagramUnderstanding.archetype, "waterfall-chart");
  assert.equal(layer.diagramUnderstanding.expressionFamily, "data-chart");
  assert.match(layer.diagramUnderstanding.nativeReadiness, /native|structured/);
  assert.equal(layer.diagramUnderstanding.structureSignature.layout, "waterfall-chart");
  assert.equal(layer.diagramUnderstanding.structureSignature.direction, "cumulative-positive-negative-bridge");
  assert.equal(layer.diagramUnderstanding.componentStrategy.templateFamily, "waterfall-chart");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("waterfall-chart"));
});

test("classifyVisualLayer recognizes simple visual line charts from diagonal trend segments", () => {
  const image = blankImage(560, 340, "#ffffff");
  fillRect(image, 76, 282, 382, 5, "#64748b");
  fillRect(image, 76, 86, 5, 201, "#64748b");
  fillLine(image, 104, 236, 214, 174, 4, "#2f80ed");
  fillLine(image, 236, 168, 346, 216, 4, "#2f80ed");
  fillLine(image, 368, 206, 446, 126, 4, "#2f80ed");

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 560, h: 340 },
    source: {
      detector: "line-chart-axis-snapshot",
      expressionForm: "chart-snapshot"
    }
  }, { textBoxes: [] }, { widthPt: 560, heightPt: 340 }, { sourceImage: image });

  assert.equal(layer.layerType, "chart-zone");
  assert.equal(layer.diagramUnderstanding.archetype, "line-chart");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.recommendedAction, "attempt-native-reconstruction");
  assert.ok(layer.visualAtoms.filter((atom) => atom.kind === "connector-line-candidate" && atom.shapeHint === "line-diagonal" && atom.lineEndpoints).length >= 3);
  assert.ok(layer.reconstructionPlan.primitives.includes("series-marks"));
});

test("classifyVisualLayer recognizes simple visual scatter charts from point clouds and axes", () => {
  const image = blankImage(560, 340, "#ffffff");
  fillRect(image, 76, 282, 382, 5, "#64748b");
  fillRect(image, 76, 86, 5, 201, "#64748b");
  for (const [x, y] of [
    [112, 236],
    [154, 194],
    [198, 222],
    [236, 154],
    [282, 184],
    [324, 128],
    [366, 168],
    [418, 112]
  ]) {
    fillEllipse(image, x, y, 12, 12, "#2f80ed");
  }

  const layer = classifyVisualLayer({
    type: "fidelity-crop",
    box: { x: 0, y: 0, w: 560, h: 340 },
    source: {
      detector: "scatter-chart-axis-snapshot",
      expressionForm: "chart-snapshot"
    }
  }, { textBoxes: [] }, { widthPt: 560, heightPt: 340 }, { sourceImage: image });

  assert.equal(layer.layerType, "chart-zone");
  assert.equal(layer.diagramUnderstanding.archetype, "scatter-chart");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.recommendedAction, "attempt-native-reconstruction");
  assert.ok(layer.diagramUnderstanding.targetMotifs.includes("bubble-scatter-chart"));
  assert.ok(layer.visualAtoms.filter((atom) => atom.kind === "native-scatter-point-candidate").length >= 8);
  assert.ok(layer.reconstructionPlan.primitives.includes("series-marks"));
});

function blankImage(width, height, color) {
  const rgba = Buffer.alloc(width * height * 4);
  const rgb = parseHex(color);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = rgb[0];
    rgba[index * 4 + 1] = rgb[1];
    rgba[index * 4 + 2] = rgb[2];
    rgba[index * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

function fillRect(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillEllipse(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const dx = (xx + 0.5 - cx) / rx;
      const dy = (yy + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillPill(image, x, y, w, h, color) {
  fillRect(image, x + h / 2, y, w - h, h, color);
  fillEllipse(image, x, y, h, h, color);
  fillEllipse(image, x + w - h, y, h, h, color);
}

function fillDiamond(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const dx = Math.abs(xx + 0.5 - cx) / rx;
      const dy = Math.abs(yy + 0.5 - cy) / ry;
      if (dx + dy > 1) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillTriangleUp(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  for (let yy = y; yy < y + h; yy += 1) {
    const progress = (yy - y) / Math.max(1, h - 1);
    const halfWidth = progress * w / 2;
    for (let xx = x; xx < x + w; xx += 1) {
      if (Math.abs(xx + 0.5 - cx) > halfWidth) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillChevronRight(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  const points = [
    { x, y },
    { x: x + w * 0.72, y },
    { x: x + w, y: y + h / 2 },
    { x: x + w * 0.72, y: y + h },
    { x, y: y + h },
    { x: x + w * 0.28, y: y + h / 2 }
  ];
  fillPolygon(image, points, rgb);
}

function fillParallelogramRight(image, x, y, w, h, shift, color) {
  const rgb = parseHex(color);
  const points = [
    { x, y },
    { x: x + w - shift, y },
    { x: x + w, y: y + h },
    { x: x + shift, y: y + h }
  ];
  fillPolygon(image, points, rgb);
}

function fillCylinder(image, x, y, w, h, color) {
  const capH = Math.round(h * 0.24);
  const bodyY = y + Math.round(h * 0.12);
  const bodyH = Math.round(h * 0.76);
  fillRect(image, x, bodyY, w, bodyH, color);
  fillEllipse(image, x, y, w, capH, color);
  fillEllipse(image, x, y + h - capH, w, capH, color);
}

function fillCloud(image, x, y, w, h, color) {
  fillEllipse(image, x + Math.round(w * 0.02), y + Math.round(h * 0.36), Math.round(w * 0.42), Math.round(h * 0.48), color);
  fillEllipse(image, x + Math.round(w * 0.24), y + Math.round(h * 0.08), Math.round(w * 0.42), Math.round(h * 0.5), color);
  fillEllipse(image, x + Math.round(w * 0.52), y + Math.round(h * 0.24), Math.round(w * 0.42), Math.round(h * 0.54), color);
  fillEllipse(image, x + Math.round(w * 0.22), y + Math.round(h * 0.38), Math.round(w * 0.56), Math.round(h * 0.44), color);
  fillRect(image, x + Math.round(w * 0.18), y + Math.round(h * 0.48), Math.round(w * 0.62), Math.round(h * 0.24), color);
}

function fillDocument(image, x, y, w, h, wave, color) {
  const rgb = parseHex(color);
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const phase = (xx - x) / Math.max(1, w - 1);
      const bottom = y + h - wave * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2));
      if (yy > bottom) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillFolder(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  fillPolygon(image, [
    { x, y: y + h * 0.18 },
    { x, y: y + h * 0.08 },
    { x: x + w * 0.34, y: y + h * 0.08 },
    { x: x + w * 0.42, y: y + h * 0.18 },
    { x: x + w, y: y + h * 0.18 },
    { x: x + w, y: y + h },
    { x, y: y + h }
  ], rgb);
}

function fillScreen(image, x, y, w, h, color) {
  const panelH = Math.round(h * 0.68);
  const neckW = Math.round(w * 0.18);
  const neckH = Math.round(h * 0.16);
  const baseW = Math.round(w * 0.52);
  const baseH = Math.round(h * 0.12);
  fillRect(image, x, y, w, panelH, color);
  fillRect(image, x + Math.round((w - neckW) / 2), y + panelH, neckW, neckH, color);
  fillRect(image, x + Math.round((w - baseW) / 2), y + panelH + neckH, baseW, baseH, color);
}

function fillPhone(image, x, y, w, h, color) {
  const radius = Math.round(w * 0.22);
  fillRect(image, x, y + radius, w, h - radius * 2, color);
  fillRect(image, x + radius, y, w - radius * 2, h, color);
  fillEllipse(image, x, y, radius * 2, radius * 2, color);
  fillEllipse(image, x + w - radius * 2, y, radius * 2, radius * 2, color);
  fillEllipse(image, x, y + h - radius * 2, radius * 2, radius * 2, color);
  fillEllipse(image, x + w - radius * 2, y + h - radius * 2, radius * 2, radius * 2, color);
}

function fillFunnel(image, x, y, w, h, color) {
  const stemW = Math.round(w * 0.22);
  const neckY = y + Math.round(h * 0.58);
  for (let yy = y; yy < y + h; yy += 1) {
    const progress = yy < neckY ? (yy - y) / Math.max(1, neckY - y) : 1;
    const rowW = yy < neckY
      ? Math.round(w - (w - stemW) * progress)
      : stemW;
    fillRect(image, x + Math.round((w - rowW) / 2), yy, rowW, 1, color);
  }
}

function fillDonut(image, x, y, w, h, innerRatio, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const innerRx = rx * innerRatio;
  const innerRy = ry * innerRatio;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const outerDx = (xx + 0.5 - cx) / rx;
      const outerDy = (yy + 0.5 - cy) / ry;
      const innerDx = (xx + 0.5 - cx) / innerRx;
      const innerDy = (yy + 0.5 - cy) / innerRy;
      const inOuter = outerDx * outerDx + outerDy * outerDy <= 1;
      const inInner = innerDx * innerDx + innerDy * innerDy < 1;
      if (!inOuter || inInner) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillThickLine(image, x1, y1, x2, y2, width, color) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length * width / 2;
  const ny = dx / length * width / 2;
  fillPolygon(image, [
    { x: x1 + nx, y: y1 + ny },
    { x: x1 - nx, y: y1 - ny },
    { x: x2 - nx, y: y2 - ny },
    { x: x2 + nx, y: y2 + ny }
  ], parseHex(color));
}

function fillDonutSegment(image, x, y, w, h, innerRatio, startDeg, endDeg, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const innerRx = rx * innerRatio;
  const innerRy = ry * innerRatio;
  const start = normalizeDegrees(startDeg);
  const end = normalizeDegrees(endDeg);
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const px = xx + 0.5;
      const py = yy + 0.5;
      const outerDx = (px - cx) / rx;
      const outerDy = (py - cy) / ry;
      const innerDx = (px - cx) / innerRx;
      const innerDy = (py - cy) / innerRy;
      const inOuter = outerDx * outerDx + outerDy * outerDy <= 1;
      const inInner = innerDx * innerDx + innerDy * innerDy < 1;
      if (!inOuter || inInner) continue;
      const angle = normalizeDegrees(Math.atan2(py - cy, px - cx) * 180 / Math.PI);
      if (!angleInRange(angle, start, end)) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function normalizeDegrees(value) {
  return ((Number(value || 0) % 360) + 360) % 360;
}

function angleInRange(angle, start, end) {
  return start <= end ? angle >= start && angle <= end : angle >= start || angle <= end;
}

function fillTriangle(image, points, color) {
  const rgb = parseHex(color);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const maxX = Math.min(image.width - 1, Math.ceil(Math.max(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(image.height - 1, Math.ceil(Math.max(...ys)));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!pointInTriangle(x + 0.5, y + 0.5, points[0], points[1], points[2])) continue;
      const offset = (y * image.width + x) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function pointInTriangle(x, y, a, b, c) {
  const area = triangleArea(a, b, c);
  const area1 = triangleArea({ x, y }, b, c);
  const area2 = triangleArea(a, { x, y }, c);
  const area3 = triangleArea(a, b, { x, y });
  return Math.abs(area - area1 - area2 - area3) <= 0.6;
}

function triangleArea(a, b, c) {
  return Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2);
}

function fillGear(image, x, y, size, color) {
  const rgb = parseHex(color);
  const cx = x + size / 2;
  const cy = y + size / 2;
  const outer = size * 0.38;
  const inner = size * 0.2;
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    const tx = cx + Math.cos(angle) * size * 0.36;
    const ty = cy + Math.sin(angle) * size * 0.36;
    const toothW = size * 0.14;
    const toothH = size * 0.24;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const corners = [
      { x: -toothW / 2, y: -toothH / 2 },
      { x: toothW / 2, y: -toothH / 2 },
      { x: toothW / 2, y: toothH / 2 },
      { x: -toothW / 2, y: toothH / 2 }
    ].map((point) => ({
      x: tx + point.x * cos - point.y * sin,
      y: ty + point.x * sin + point.y * cos
    }));
    fillPolygon(image, corners, rgb);
  }
  for (let yy = y; yy < y + size; yy += 1) {
    for (let xx = x; xx < x + size; xx += 1) {
      const radius = Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy);
      if (radius > outer || radius < inner) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillMagnifier(image, x, y, size, color) {
  const rgb = parseHex(color);
  const lens = Math.round(size * 0.68);
  fillDonut(image, x, y, lens, lens, 0.58, color);
  const handleW = size * 0.12;
  const start = { x: x + lens * 0.68, y: y + lens * 0.68 };
  const end = { x: x + size * 0.94, y: y + size * 0.94 };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len * handleW / 2;
  const ny = dx / len * handleW / 2;
  fillPolygon(image, [
    { x: start.x + nx, y: start.y + ny },
    { x: start.x - nx, y: start.y - ny },
    { x: end.x - nx, y: end.y - ny },
    { x: end.x + nx, y: end.y + ny }
  ], rgb);
}

function fillShield(image, x, y, w, h, color) {
  fillPolygon(image, [
    { x: x + w * 0.5, y },
    { x: x + w * 0.92, y: y + h * 0.15 },
    { x: x + w * 0.86, y: y + h * 0.56 },
    { x: x + w * 0.72, y: y + h * 0.80 },
    { x: x + w * 0.5, y: y + h },
    { x: x + w * 0.28, y: y + h * 0.80 },
    { x: x + w * 0.14, y: y + h * 0.56 },
    { x: x + w * 0.08, y: y + h * 0.15 }
  ], parseHex(color));
}

function fillCycleArrow(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const outer = Math.min(w, h) * 0.48;
  const inner = Math.min(w, h) * 0.29;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const dx = xx + 0.5 - cx;
      const dy = yy + 0.5 - cy;
      const radius = Math.hypot(dx, dy);
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle < 0) angle += 360;
      const inArc = radius >= inner && radius <= outer && angle >= 34 && angle <= 330;
      if (!inArc) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
  fillPolygon(image, [
    { x: x + w * 0.88, y: y + h * 0.28 },
    { x: x + w * 0.62, y: y + h * 0.18 },
    { x: x + w * 0.72, y: y + h * 0.45 }
  ], rgb);
}

function fillPerson(image, x, y, w, h, color) {
  const head = Math.round(w * 0.48);
  fillEllipse(image, x + Math.round((w - head) / 2), y, head, head, color);
  const bodyY = y + Math.round(head * 0.74);
  const bodyH = y + h - bodyY;
  const radius = Math.round(w * 0.18);
  fillRect(image, x + radius, bodyY, w - radius * 2, bodyH, color);
  fillRect(image, x, bodyY + radius, w, bodyH - radius, color);
  fillEllipse(image, x, bodyY, radius * 2, radius * 2, color);
  fillEllipse(image, x + w - radius * 2, bodyY, radius * 2, radius * 2, color);
}

function fillTeam(image, x, y, w, h, color) {
  const sideW = Math.round(w * 0.36);
  const sideH = Math.round(h * 0.78);
  const centerW = Math.round(w * 0.42);
  const centerH = Math.round(h * 0.9);
  fillPerson(image, x, y + Math.round(h * 0.14), sideW, sideH, color);
  fillPerson(image, x + w - sideW, y + Math.round(h * 0.14), sideW, sideH, color);
  fillPerson(image, x + Math.round((w - centerW) / 2), y, centerW, centerH, color);
}

function fillTimeline(image, x, y, w, h, milestoneRatios, color) {
  const lineY = y + Math.round(h / 2);
  fillRect(image, x, lineY - 2, w, 4, color);
  for (const ratio of milestoneRatios) {
    const size = Math.round(h * 0.72);
    const cx = x + Math.round(w * ratio);
    fillEllipse(image, cx - Math.round(size / 2), lineY - Math.round(size / 2), size, size, color);
  }
}

function fillPolygon(image, points, rgb) {
  const minX = Math.floor(Math.min(...points.map((point) => point.x)));
  const maxX = Math.ceil(Math.max(...points.map((point) => point.x)));
  const minY = Math.floor(Math.min(...points.map((point) => point.y)));
  const maxY = Math.ceil(Math.max(...points.map((point) => point.y)));
  for (let yy = minY; yy <= maxY; yy += 1) {
    for (let xx = minX; xx <= maxX; xx += 1) {
      if (!pointInPolygon(xx + 0.5, yy + 0.5, points)) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillSankeyBand(image, x0, sourceTop, sourceBottom, x1, targetTop, targetBottom, color) {
  const points = [];
  const steps = 32;
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    points.push({ x: x0 + (x1 - x0) * t, y: cubicEase(sourceTop, targetTop, t) });
  }
  for (let index = steps; index >= 0; index -= 1) {
    const t = index / steps;
    points.push({ x: x0 + (x1 - x0) * t, y: cubicEase(sourceBottom, targetBottom, t) });
  }
  fillPolygon(image, points, parseHex(color));
}

function cubicEase(start, end, t) {
  const smooth = t * t * (3 - 2 * t);
  return start + (end - start) * smooth;
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const pi = points[i];
    const pj = points[j];
    const denominator = pj.y - pi.y || 0.0001;
    const intersects = ((pi.y > y) !== (pj.y > y))
      && x < (pj.x - pi.x) * (y - pi.y) / denominator + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function fillArrowRight(image, x, y, shaftW, shaftH, headW, color) {
  fillRect(image, x, y, shaftW, shaftH, color);
  const rgb = parseHex(color);
  const centerY = y + shaftH / 2;
  const headH = shaftH * 2.8;
  for (let yy = Math.floor(centerY - headH / 2); yy <= Math.ceil(centerY + headH / 2); yy += 1) {
    for (let xx = x + shaftW; xx < x + shaftW + headW; xx += 1) {
      const progress = (xx - (x + shaftW)) / Math.max(1, headW);
      const halfHeight = (1 - progress) * headH / 2;
      if (Math.abs(yy + 0.5 - centerY) > halfHeight) continue;
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}

function fillLine(image, x1, y1, x2, y2, thickness, color) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  let x = x1;
  let y = y1;
  const radius = Math.max(0, Math.floor(thickness / 2));
  while (true) {
    fillRect(image, x - radius, y - radius, radius * 2 + 1, radius * 2 + 1, color);
    if (x === x2 && y === y2) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function parseHex(hex) {
  const value = String(hex).replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ];
}
