"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  understandDiagramLayer,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/lib/diagram-understanding");
const {
  summarizeLayerProfile
} = require("../skills/pd-hifi-slideclone/scripts/lib/layer-classifier");

test("diagram understanding protects screenshot texture clusters from stale cycle and timeline hints", () => {
  const box = { x: 40, y: 148, w: 277, h: 252 };
  const densityPeaks = Array.from({ length: 10 }, (_, index) => ({
    id: `peak-${index}`,
    kind: "native-rect-candidate",
    box: { x: 52 + (index % 5) * 28, y: 166 + Math.floor(index / 5) * 34, w: 13.5, h: 13.5 },
    color: "#3488e9",
    density: 0.9,
    nativeCandidate: true,
    source: { detector: "dense-linked-node-visual-atom" }
  }));
  const visualAtoms = [
    { id: "container", kind: "native-rect-candidate", box: { x: 40, y: 148, w: 116, h: 102 }, nativeCandidate: true },
    { id: "row-1", kind: "grid-line-candidate", box: { x: 170, y: 252, w: 147, h: 7 }, nativeCandidate: true },
    { id: "row-2", kind: "grid-line-candidate", box: { x: 170, y: 261, w: 147, h: 7 }, nativeCandidate: true },
    { id: "stale-cycle", kind: "native-cycle-arrow-candidate", box: { x: 40, y: 311, w: 53, h: 26 }, density: 0.38, nativeCandidate: true },
    ...densityPeaks
  ];

  const result = understandDiagramLayer({ box, source: {} }, { textBoxes: [] }, undefined, { visualAtoms });

  assert.equal(result.archetype, "screenshot-card-grid");
  assert.equal(result.nativeReadiness, "hybrid-native-plus-residual-crops");
  assert.equal(result.visualAtomKindCounts["screenshot-crop-candidate"], 1);
  assert.equal(result.visualAtomKindCounts["native-cycle-arrow-candidate"] || 0, 0);
  assert.equal(result.visualAtoms.some((atom) => atom.source?.detector === "dense-linked-node-visual-atom"), false);
});

test("diagram understanding recommends component templates for flow card chains", () => {
  const item = {
    box: { x: 100, y: 120, w: 720, h: 160 },
    source: { expressionForm: "linear-process-diagram" }
  };
  const page = {
    textBoxes: [
      { id: "a", text: "输入", box: { x: 120, y: 150, w: 100, h: 40 } },
      { id: "b", text: "处理", box: { x: 350, y: 150, w: 100, h: 40 } },
      { id: "c", text: "输出", box: { x: 590, y: 150, w: 100, h: 40 } }
    ]
  };
  const visualAtoms = [
    { id: "n1", kind: "native-rect-candidate", box: { x: 120, y: 140, w: 120, h: 60 }, nativeCandidate: true },
    { id: "n2", kind: "native-rect-candidate", box: { x: 350, y: 140, w: 120, h: 60 }, nativeCandidate: true },
    { id: "n3", kind: "native-rect-candidate", box: { x: 590, y: 140, w: 120, h: 60 }, nativeCandidate: true },
    { id: "c1", kind: "connector-arrow-candidate", box: { x: 245, y: 166, w: 90, h: 6 } },
    { id: "c2", kind: "connector-arrow-candidate", box: { x: 475, y: 166, w: 90, h: 6 } }
  ];

  const result = understandDiagramLayer(item, page, undefined, { visualAtoms });

  assert.equal(result.archetype, "flow-card-chain");
  assert.equal(result.componentStrategy.mode, "component-template");
  assert.equal(result.componentStrategy.templateFamily, "process-chain");
  assert.ok(result.targetMotifs.includes("linear-arrow-chain"));
  assert.ok(result.componentStrategy.targetMotifs.includes("linear-arrow-chain"));
  assert.ok(result.componentStrategy.sourcePreference.includes("officeplus-polished-card-style"));
  assert.equal(result.detectionResult.contractVersion, "1.0");
  assert.equal(result.detectionResult.matched, true);
  assert.equal(result.detectionResult.claimedRegions[0].purpose, "native-rebuild");
  assert.equal(result.detectionResult.diagnostics["node-count"] >= 3, true);
});

test("diagram understanding does not misclassify a measured ellipse network as a funnel lens flow", () => {
  const visualAtoms = [
    { id: "a", kind: "native-ellipse-candidate", shapeHint: "ellipse", box: { x: 60, y: 72, w: 72, h: 56 } },
    { id: "b", kind: "native-ellipse-candidate", shapeHint: "ellipse", box: { x: 248, y: 42, w: 84, h: 60 } },
    { id: "c", kind: "native-ellipse-candidate", shapeHint: "ellipse", box: { x: 428, y: 112, w: 76, h: 62 } },
    { id: "d", kind: "native-ellipse-candidate", shapeHint: "ellipse", box: { x: 306, y: 234, w: 82, h: 60 } },
    { id: "e", kind: "native-rect-candidate", shapeHint: "rect", box: { x: 58, y: 224, w: 76, h: 58 } },
    { id: "ab", kind: "connector-line-candidate", box: { x: 116, y: 72, w: 148, h: 28 } },
    { id: "bc", kind: "connector-line-candidate", box: { x: 316, y: 72, w: 128, h: 64 } },
    { id: "cd", kind: "connector-line-candidate", box: { x: 358, y: 166, w: 104, h: 86 } },
    { id: "de", kind: "connector-line-candidate", box: { x: 126, y: 254, w: 188, h: 10 } },
    { id: "ea", kind: "connector-line-candidate", box: { x: 96, y: 126, w: 5, h: 100 } }
  ];
  const visualNodes = _private.inferVisualAtomNodes(visualAtoms);
  const visualConnectors = [
    { atomId: "ab", fromAtomId: "a", toAtomId: "b" },
    { atomId: "bc", fromAtomId: "b", toAtomId: "c" },
    { atomId: "cd", fromAtomId: "c", toAtomId: "d" },
    { atomId: "de", fromAtomId: "d", toAtomId: "e" },
    { atomId: "ea", fromAtomId: "e", toAtomId: "a" }
  ];

  const archetype = _private.inferArchetype({
    item: {
      source: {
        detector: "sparse-diagram-graphic-underlay-crop",
        expressionForm: "complex-diagram",
        expressionSubtype: "irregular relationship graph"
      }
    },
    nodes: [],
    textBoxes: [],
    visualAtoms,
    visualNodes,
    visualConnectors,
    visualGrid: null,
    box: { x: 0, y: 0, w: 560, h: 340 },
    slideSize: { widthPt: 560, heightPt: 340 }
  });

  assert.equal(archetype, "generic-node-diagram");
});

test("diagram understanding routes timeline atoms to Office Timeline pattern learning", () => {
  const strategy = _private.inferComponentStrategy({
    archetype: "generic-node-diagram",
    confidence: 0.7,
    nativeReadiness: "native-rebuild",
    visualAtoms: [
      { id: "t1", kind: "native-timeline-candidate", box: { x: 100, y: 220, w: 600, h: 40 }, nativeCandidate: true }
    ],
    residuals: []
  });

  assert.equal(strategy.mode, "component-template");
  assert.equal(strategy.templateFamily, "timeline");
  assert.ok(strategy.sourcePreference.includes("office-timeline-demo-openxml-patterns"));
});

test("diagram understanding promotes visual milestone timelines to reusable roadmap components", () => {
  const result = understandDiagramLayer(
    {
      box: { x: 0, y: 0, w: 720, h: 260 },
      source: {
        detector: "timeline-roadmap-underlay",
        expressionForm: "complex-diagram",
        expressionSubtype: "roadmap milestone diagram"
      }
    },
    {
      textBoxes: [
        { id: "y1", text: "2024", box: { x: 78, y: 70, w: 60, h: 24 } },
        { id: "y2", text: "2025", box: { x: 250, y: 160, w: 60, h: 24 } },
        { id: "y3", text: "2026", box: { x: 422, y: 70, w: 60, h: 24 } },
        { id: "y4", text: "上线", box: { x: 594, y: 160, w: 60, h: 24 } }
      ]
    },
    undefined,
    {
      visualAtoms: [
        { id: "axis", kind: "connector-line-candidate", shapeHint: "timeline-horizontal-axis", box: { x: 90, y: 126, w: 540, h: 5 } },
        { id: "m1", kind: "native-ellipse-candidate", shapeHint: "circle milestone", box: { x: 88, y: 112, w: 32, h: 32 }, nativeCandidate: true },
        { id: "m2", kind: "native-ellipse-candidate", shapeHint: "circle milestone", box: { x: 260, y: 112, w: 32, h: 32 }, nativeCandidate: true },
        { id: "m3", kind: "native-ellipse-candidate", shapeHint: "circle milestone", box: { x: 432, y: 112, w: 32, h: 32 }, nativeCandidate: true },
        { id: "m4", kind: "native-ellipse-candidate", shapeHint: "circle milestone", box: { x: 604, y: 112, w: 32, h: 32 }, nativeCandidate: true }
      ]
    }
  );

  assert.equal(result.archetype, "timeline-roadmap");
  assert.equal(result.nativeReadiness, "native-rebuild");
  assert.equal(result.componentStrategy.templateFamily, "timeline");
  assert.equal(result.componentStrategy.mode, "component-template");
  assert.equal(result.structureSignature.layout, "timeline");
  assert.equal(result.structureSignature.stepCount, 4);
  assert.equal(result.structureSignature.direction, "left-to-right-milestones");
  assert.equal(result.structureSignature.wholeGroupTemplatePriority, "high");
  assert.ok(result.targetMotifs.includes("milestone-roadmap"));
  assert.ok(result.targetMotifs.includes("linear-arrow-chain"));
  assert.ok(result.componentStrategy.sourcePreference.includes("officeplus-search"));
  assert.ok(result.componentStrategy.sourcePreference.includes("islide-search"));
});

test("diagram understanding preserves quadrant semantics instead of generic grid reconstruction", () => {
  const result = understandDiagramLayer(
    {
      box: { x: 0, y: 0, w: 520, h: 360 },
      source: {
        detector: "quadrant-priority-matrix-underlay",
        expressionForm: "complex-diagram",
        expressionSubtype: "四象限 优先级矩阵 impact effort"
      }
    },
    {
      textBoxes: [
        { id: "a", text: "高影响", box: { x: 230, y: 18, w: 70, h: 20 } },
        { id: "b", text: "低成本", box: { x: 14, y: 170, w: 70, h: 20 } },
        { id: "q1", text: "Quick wins", box: { x: 80, y: 70, w: 120, h: 48 } },
        { id: "q2", text: "Major projects", box: { x: 320, y: 70, w: 130, h: 48 } },
        { id: "q3", text: "Fill-ins", box: { x: 80, y: 230, w: 120, h: 48 } },
        { id: "q4", text: "Avoid", box: { x: 320, y: 230, w: 120, h: 48 } }
      ]
    },
    undefined,
    {
      visualAtoms: [
        { id: "h1", kind: "grid-line-candidate", axis: "h", shapeHint: "grid-line-horizontal", box: { x: 40, y: 40, w: 440, h: 4 } },
        { id: "h2", kind: "grid-line-candidate", axis: "h", shapeHint: "grid-line-horizontal", box: { x: 40, y: 180, w: 440, h: 4 } },
        { id: "h3", kind: "grid-line-candidate", axis: "h", shapeHint: "grid-line-horizontal", box: { x: 40, y: 320, w: 440, h: 4 } },
        { id: "v1", kind: "grid-line-candidate", axis: "v", shapeHint: "grid-line-vertical", box: { x: 40, y: 40, w: 4, h: 280 } },
        { id: "v2", kind: "grid-line-candidate", axis: "v", shapeHint: "grid-line-vertical", box: { x: 260, y: 40, w: 4, h: 280 } },
        { id: "v3", kind: "grid-line-candidate", axis: "v", shapeHint: "grid-line-vertical", box: { x: 480, y: 40, w: 4, h: 280 } }
      ]
    }
  );

  assert.equal(result.archetype, "quadrant-matrix");
  assert.equal(result.nativeReadiness, "native-rebuild");
  assert.equal(result.componentStrategy.templateFamily, "quadrant-matrix");
  assert.equal(result.componentStrategy.mode, "component-template");
  assert.equal(result.structureSignature.layout, "quadrant");
  assert.equal(result.structureSignature.rows, 2);
  assert.equal(result.structureSignature.columns, 2);
  assert.equal(result.structureSignature.direction, "two-axis-positioning");
  assert.ok(result.targetMotifs.includes("quadrant-axis"));
  assert.ok(result.targetMotifs.includes("card-grid"));
});

test("diagram understanding promotes convergence lens flows to reusable analysis components", () => {
  const result = understandDiagramLayer(
    {
      box: { x: 0, y: 0, w: 760, h: 300 },
      source: {
        detector: "analysis-funnel-lens-underlay",
        expressionForm: "complex-diagram",
        expressionSubtype: "lens funnel convergence 需求分析 收敛流程"
      }
    },
    {
      textBoxes: [
        { id: "a", text: "业务截图", box: { x: 40, y: 84, w: 100, h: 34 } },
        { id: "b", text: "会议纪要", box: { x: 40, y: 154, w: 100, h: 34 } },
        { id: "c", text: "聚焦分析", box: { x: 315, y: 116, w: 110, h: 34 } },
        { id: "d", text: "结构化蓝图", box: { x: 590, y: 124, w: 120, h: 34 } }
      ]
    },
    undefined,
    {
      visualAtoms: [
        { id: "input-a", kind: "native-rect-candidate", shapeHint: "rect input card", box: { x: 40, y: 70, w: 130, h: 58 }, nativeCandidate: true },
        { id: "input-b", kind: "native-rect-candidate", shapeHint: "rect input card", box: { x: 40, y: 144, w: 130, h: 58 }, nativeCandidate: true },
        { id: "lens", kind: "native-ellipse-candidate", shapeHint: "ellipse lens magnifier", box: { x: 300, y: 78, w: 140, h: 140 }, nativeCandidate: true },
        { id: "output", kind: "native-rect-candidate", shapeHint: "rect output card", box: { x: 578, y: 102, w: 148, h: 74 }, nativeCandidate: true },
        { id: "arrow-a", kind: "connector-arrow-candidate", box: { x: 172, y: 98, w: 120, h: 8 } },
        { id: "arrow-b", kind: "connector-arrow-candidate", box: { x: 172, y: 168, w: 120, h: 8 } },
        { id: "arrow-c", kind: "connector-arrow-candidate", box: { x: 442, y: 143, w: 120, h: 8 } }
      ]
    }
  );

  assert.equal(result.archetype, "funnel-lens-flow");
  assert.equal(result.nativeReadiness, "native-rebuild");
  assert.equal(result.componentStrategy.templateFamily, "funnel-lens-flow");
  assert.equal(result.componentStrategy.mode, "component-template");
  assert.equal(result.structureSignature.layout, "funnel-lens-flow");
  assert.equal(result.structureSignature.direction, "converge-focus-output");
  assert.equal(result.structureSignature.wholeGroupTemplatePriority, "high");
  assert.ok(result.targetMotifs.includes("lens-funnel-flow"));
  assert.ok(result.targetMotifs.includes("branch-card-flow"));
  assert.ok(result.componentStrategy.sourcePreference.includes("officeplus-search"));
  assert.ok(result.componentStrategy.sourcePreference.includes("islide-search"));
});

test("diagram understanding keeps explicit screenshot annotations above process input mentions", () => {
  const result = understandDiagramLayer(
    {
      box: { x: 0, y: 0, w: 640, h: 320 },
      source: {
        detector: "annotated-product-screenshot",
        expressionForm: "screenshot-or-document",
        expressionSubtype: "product screenshot with callout annotations"
      }
    },
    { textBoxes: [{ text: "截图标注：重点功能" }] },
    undefined,
    {
      visualAtoms: [
        { id: "screen", kind: "screenshot-crop-candidate", box: { x: 80, y: 50, w: 380, h: 220 }, residualCandidate: true },
        { id: "callout", kind: "connector-arrow-candidate", box: { x: 470, y: 110, w: 90, h: 8 } },
        { id: "highlight", kind: "native-rect-candidate", box: { x: 210, y: 116, w: 100, h: 48 }, nativeCandidate: true }
      ]
    }
  );

  assert.equal(result.archetype, "screenshot-annotation");
});

test("diagram understanding promotes fishbone cause-effect diagrams to reusable root-cause components", () => {
  const result = understandDiagramLayer(
    {
      box: { x: 0, y: 0, w: 760, h: 320 },
      source: {
        detector: "fishbone-cause-effect-underlay",
        expressionForm: "complex-diagram",
        expressionSubtype: "fishbone root cause 因果分析 鱼骨图"
      }
    },
    {
      textBoxes: [
        { id: "effect", text: "问题结果", box: { x: 650, y: 136, w: 88, h: 34 } },
        { id: "m1", text: "人员", box: { x: 150, y: 42, w: 72, h: 26 } },
        { id: "m2", text: "流程", box: { x: 330, y: 42, w: 72, h: 26 } },
        { id: "m3", text: "系统", box: { x: 510, y: 42, w: 72, h: 26 } },
        { id: "m4", text: "数据", box: { x: 150, y: 246, w: 72, h: 26 } },
        { id: "m5", text: "环境", box: { x: 330, y: 246, w: 72, h: 26 } },
        { id: "m6", text: "管理", box: { x: 510, y: 246, w: 72, h: 26 } }
      ]
    },
    undefined,
    {
      visualAtoms: [
        { id: "spine", kind: "connector-arrow-candidate", shapeHint: "fishbone-spine-horizontal", box: { x: 80, y: 158, w: 560, h: 6 } },
        { id: "b1", kind: "connector-line-candidate", shapeHint: "line-diagonal fishbone-branch", box: { x: 150, y: 72, w: 86, h: 82 } },
        { id: "b2", kind: "connector-line-candidate", shapeHint: "line-diagonal fishbone-branch", box: { x: 330, y: 72, w: 86, h: 82 } },
        { id: "b3", kind: "connector-line-candidate", shapeHint: "line-diagonal fishbone-branch", box: { x: 510, y: 72, w: 86, h: 82 } },
        { id: "b4", kind: "connector-line-candidate", shapeHint: "line-diagonal fishbone-branch", box: { x: 150, y: 164, w: 86, h: 82 } },
        { id: "b5", kind: "connector-line-candidate", shapeHint: "line-diagonal fishbone-branch", box: { x: 330, y: 164, w: 86, h: 82 } },
        { id: "b6", kind: "connector-line-candidate", shapeHint: "line-diagonal fishbone-branch", box: { x: 510, y: 164, w: 86, h: 82 } },
        { id: "effect-box", kind: "native-rect-candidate", shapeHint: "rect effect", box: { x: 646, y: 126, w: 96, h: 54 }, nativeCandidate: true }
      ]
    }
  );

  assert.equal(result.archetype, "fishbone-cause-effect");
  assert.equal(result.nativeReadiness, "native-rebuild");
  assert.equal(result.componentStrategy.templateFamily, "fishbone-cause-effect");
  assert.equal(result.componentStrategy.mode, "component-template");
  assert.equal(result.structureSignature.layout, "fishbone");
  assert.equal(result.structureSignature.direction, "spine-with-diagonal-causes");
  assert.equal(result.structureSignature.wholeGroupTemplatePriority, "high");
  assert.ok(result.targetMotifs.includes("fishbone-cause"));
  assert.ok(result.componentStrategy.sourcePreference.includes("officeplus-search"));
  assert.ok(result.componentStrategy.sourcePreference.includes("islide-search"));
});

test("diagram understanding exposes target motifs for cycle, grid, and tree component search", () => {
  const cycle = understandDiagramLayer(
    { box: { x: 0, y: 0, w: 320, h: 220 }, source: { expressionForm: "complex-diagram" } },
    { textBoxes: [] },
    undefined,
    {
      visualAtoms: [
        { id: "a1", kind: "native-cycle-arrow-candidate", box: { x: 40, y: 40, w: 120, h: 120 }, nativeCandidate: true },
        { id: "n1", kind: "native-ellipse-candidate", box: { x: 80, y: 60, w: 30, h: 30 }, nativeCandidate: true },
        { id: "n2", kind: "native-ellipse-candidate", box: { x: 150, y: 120, w: 30, h: 30 }, nativeCandidate: true }
      ]
    }
  );
  const grid = _private.inferTargetMotifs({
    archetype: "matrix-or-grid",
    visualGrid: { rows: 2, columns: 3 },
    componentStrategy: { templateFamily: "grid-or-matrix" }
  });
  const tree = _private.inferTargetMotifs({
    archetype: "tree-structure",
    visualNodes: [{}, {}, {}, {}],
    visualConnectors: [{}, {}, {}],
    componentStrategy: { templateFamily: "hub-spoke" }
  });

  assert.ok(cycle.targetMotifs.includes("arc-arrow"));
  assert.ok(grid.includes("card-grid"));
  assert.ok(tree.includes("tree-link"));
});

test("diagram understanding promotes segmented arc arrows to cycle-loop component templates", () => {
  const result = understandDiagramLayer(
    {
      box: { x: 0, y: 0, w: 360, h: 280 },
      source: {
        detector: "plugin-cycle-arrow-diagram-underlay",
        expressionForm: "complex-diagram",
        expressionSubtype: "circular arc-arrow loop 闭环流程"
      }
    },
    { textBoxes: [] },
    undefined,
    {
      visualAtoms: [
        { id: "arc1", kind: "native-arc-arrow-segment-candidate", box: { x: 150, y: 32, w: 76, h: 34 }, nativeCandidate: true },
        { id: "arc2", kind: "native-arc-arrow-segment-candidate", box: { x: 238, y: 86, w: 52, h: 72 }, nativeCandidate: true },
        { id: "arc3", kind: "native-arc-arrow-segment-candidate", box: { x: 218, y: 178, w: 76, h: 42 }, nativeCandidate: true },
        { id: "arc4", kind: "native-arc-arrow-segment-candidate", box: { x: 76, y: 180, w: 82, h: 38 }, nativeCandidate: true },
        { id: "arc5", kind: "native-arc-arrow-segment-candidate", box: { x: 54, y: 82, w: 54, h: 72 }, nativeCandidate: true }
      ]
    }
  );

  assert.equal(result.archetype, "cycle-loop");
  assert.equal(result.nativeReadiness, "native-rebuild");
  assert.equal(result.componentStrategy.templateFamily, "cycle-loop");
  assert.equal(result.componentStrategy.mode, "component-template");
  assert.equal(result.structureSignature.layout, "cycle-loop");
  assert.equal(result.structureSignature.wholeGroupTemplatePriority, "high");
  assert.ok(result.targetMotifs.includes("arc-arrow"));
  assert.ok(result.targetMotifs.includes("whole-process-template"));
  assert.ok(result.componentStrategy.sourcePreference.includes("islide-search"));
});

test("diagram understanding keeps icons hybrid until a confident vector match exists", () => {
  const strategy = _private.inferComponentStrategy({
    archetype: "hub-spoke",
    confidence: 0.61,
    nativeReadiness: "hybrid-native-plus-residual-crops",
    nodes: [{}, {}, {}, {}],
    residuals: [{ kind: "icon-or-illustration-crop" }]
  });

  assert.equal(strategy.mode, "hybrid-template-plus-local-crops");
  assert.equal(strategy.templateFamily, "hub-spoke");
  assert.ok(strategy.sourcePreference.includes("officeplus-icon-vector-style"));
});

test("diagram understanding marks radial hub-spoke diagrams as whole-group reusable components", () => {
  const result = understandDiagramLayer(
    {
      box: { x: 0, y: 0, w: 520, h: 360 },
      source: {
        detector: "relationship-diagram-underlay",
        expressionForm: "complex-diagram",
        expressionSubtype: "hub-spoke radial relationship"
      }
    },
    { textBoxes: [] },
    undefined,
    {
      visualAtoms: [
        { id: "center", kind: "native-rect-candidate", box: { x: 220, y: 145, w: 80, h: 60 }, nativeCandidate: true },
        { id: "top", kind: "native-rect-candidate", box: { x: 220, y: 36, w: 80, h: 52 }, nativeCandidate: true },
        { id: "right", kind: "native-rect-candidate", box: { x: 390, y: 154, w: 80, h: 52 }, nativeCandidate: true },
        { id: "bottom", kind: "native-rect-candidate", box: { x: 220, y: 272, w: 80, h: 52 }, nativeCandidate: true },
        { id: "left", kind: "native-rect-candidate", box: { x: 50, y: 154, w: 80, h: 52 }, nativeCandidate: true },
        { id: "line-top", kind: "connector-line-candidate", box: { x: 258, y: 88, w: 5, h: 57 } },
        { id: "line-right", kind: "connector-line-candidate", box: { x: 300, y: 176, w: 90, h: 5 } },
        { id: "line-bottom", kind: "connector-line-candidate", box: { x: 258, y: 205, w: 5, h: 67 } },
        { id: "line-left", kind: "connector-line-candidate", box: { x: 130, y: 176, w: 90, h: 5 } }
      ]
    }
  );

  assert.equal(result.archetype, "hub-spoke");
  assert.equal(result.structureSignature.layout, "radial");
  assert.equal(result.structureSignature.direction, "center-out");
  assert.equal(result.structureSignature.wholeGroupTemplatePriority, "high");
  assert.equal(result.componentStrategy.templateFamily, "hub-spoke");
  assert.ok(result.targetMotifs.includes("radial-link"));
});

test("diagram understanding emits semantic structure signatures for chart zones", () => {
  const result = understandDiagramLayer(
    {
      box: { x: 0, y: 0, w: 560, h: 340 },
      source: {
        detector: "bar-chart-axis-series-crop",
        expressionForm: "chart-snapshot",
        expressionSubtype: "dashboard bar-chart 数据图表"
      }
    },
    { textBoxes: [] },
    undefined,
    {
      visualAtoms: [
        { id: "axis-x", kind: "grid-line-candidate", axis: "h", shapeHint: "grid-line-horizontal", box: { x: 70, y: 280, w: 380, h: 4 } },
        { id: "axis-y", kind: "grid-line-candidate", axis: "v", shapeHint: "grid-line-vertical", box: { x: 70, y: 80, w: 4, h: 204 } },
        { id: "bar-a", kind: "native-rect-candidate", shapeHint: "rect", box: { x: 100, y: 206, w: 34, h: 74 }, nativeCandidate: true },
        { id: "bar-b", kind: "native-rect-candidate", shapeHint: "rect", box: { x: 160, y: 170, w: 34, h: 110 }, nativeCandidate: true },
        { id: "bar-c", kind: "native-rect-candidate", shapeHint: "rect", box: { x: 220, y: 132, w: 34, h: 148 }, nativeCandidate: true },
        { id: "bar-d", kind: "native-rect-candidate", shapeHint: "rect", box: { x: 280, y: 190, w: 34, h: 90 }, nativeCandidate: true },
        { id: "bar-e", kind: "native-rect-candidate", shapeHint: "rect", box: { x: 340, y: 116, w: 34, h: 164 }, nativeCandidate: true }
      ]
    }
  );

  assert.equal(result.archetype, "bar-chart");
  assert.equal(result.componentStrategy.templateFamily, "bar-chart");
  assert.equal(result.componentStrategy.mode, "native-chart-template");
  assert.equal(result.structureSignature.layout, "bar-chart");
  assert.equal(result.structureSignature.stepCount, 5);
  assert.equal(result.structureSignature.direction, "vertical-bars");
  assert.equal(result.structureSignature.wholeGroupTemplatePriority, "high");
  assert.ok(result.structureSignature.evidence.includes("chart-bars"));
});

test("diagram understanding separates pie charts from donut chart templates", () => {
  const result = understandDiagramLayer(
    {
      box: { x: 0, y: 0, w: 420, h: 320 },
      source: {
        detector: "pie-chart-snapshot",
        expressionForm: "chart-snapshot",
        expressionSubtype: "market share 饼图 扇区占比"
      }
    },
    { textBoxes: [{ text: "渠道份额饼图" }] },
    undefined,
    {
      visualAtoms: [
        { id: "slice-a", kind: "native-donut-segment-candidate", shapeHint: "donut-segment", box: { x: 118, y: 62, w: 98, h: 112 }, nativeCandidate: true },
        { id: "slice-b", kind: "native-donut-segment-candidate", shapeHint: "donut-segment", box: { x: 194, y: 68, w: 104, h: 96 }, nativeCandidate: true },
        { id: "slice-c", kind: "native-donut-segment-candidate", shapeHint: "donut-segment", box: { x: 146, y: 150, w: 118, h: 92 }, nativeCandidate: true }
      ]
    }
  );

  assert.equal(result.archetype, "pie-chart");
  assert.equal(result.componentStrategy.templateFamily, "pie-chart");
  assert.equal(result.componentStrategy.mode, "native-chart-template");
  assert.equal(result.structureSignature.layout, "pie-chart");
  assert.equal(result.structureSignature.stepCount, 3);
  assert.equal(result.structureSignature.direction, "segmented-pie");
  assert.ok(result.targetMotifs.includes("pie-share-chart"));
  assert.ok(result.structureSignature.evidence.includes("chart-pie-segments"));
});

test("diagram understanding promotes pyramid and funnel stacks to layered reusable components", () => {
  const result = understandDiagramLayer(
    {
      box: { x: 0, y: 0, w: 520, h: 360 },
      source: {
        detector: "pyramid-diagram-underlay-crop",
        expressionForm: "complex-diagram",
        expressionSubtype: "4 layer pyramid 金字塔 分层图"
      }
    },
    { textBoxes: [] },
    undefined,
    {
      visualAtoms: [
        { id: "l1", kind: "native-rect-candidate", shapeHint: "rect", box: { x: 210, y: 44, w: 100, h: 44 }, nativeCandidate: true },
        { id: "l2", kind: "native-rect-candidate", shapeHint: "rect", box: { x: 180, y: 100, w: 160, h: 44 }, nativeCandidate: true },
        { id: "l3", kind: "native-rect-candidate", shapeHint: "rect", box: { x: 150, y: 156, w: 220, h: 44 }, nativeCandidate: true },
        { id: "l4", kind: "native-rect-candidate", shapeHint: "rect", box: { x: 120, y: 212, w: 280, h: 44 }, nativeCandidate: true }
      ]
    }
  );

  assert.equal(result.archetype, "layered-stack");
  assert.equal(result.nativeReadiness, "native-rebuild");
  assert.equal(result.componentStrategy.templateFamily, "layered-stack");
  assert.equal(result.componentStrategy.mode, "component-template");
  assert.equal(result.structureSignature.layout, "layered-stack");
  assert.equal(result.structureSignature.stepCount, 4);
  assert.equal(result.structureSignature.direction, "pyramid-down");
  assert.ok(result.targetMotifs.includes("layered-stack"));
  assert.ok(result.targetMotifs.includes("pyramid-stack"));
});

test("diagram understanding promotes overlapping ellipses to Venn reusable components", () => {
  const result = understandDiagramLayer(
    {
      box: { x: 0, y: 0, w: 520, h: 320 },
      source: {
        detector: "venn-overlap-underlay-crop",
        expressionForm: "complex-diagram",
        expressionSubtype: "3 circle Venn 集合 交集 重叠关系"
      }
    },
    { textBoxes: [] },
    undefined,
    {
      visualAtoms: [
        { id: "a", kind: "native-ellipse-candidate", shapeHint: "ellipse", box: { x: 120, y: 88, w: 160, h: 160 }, nativeCandidate: true },
        { id: "b", kind: "native-ellipse-candidate", shapeHint: "ellipse", box: { x: 220, y: 88, w: 160, h: 160 }, nativeCandidate: true },
        { id: "c", kind: "native-ellipse-candidate", shapeHint: "ellipse", box: { x: 170, y: 150, w: 160, h: 160 }, nativeCandidate: true }
      ]
    }
  );

  assert.equal(result.archetype, "venn-overlap");
  assert.equal(result.nativeReadiness, "native-rebuild");
  assert.equal(result.componentStrategy.templateFamily, "venn-overlap");
  assert.equal(result.componentStrategy.mode, "component-template");
  assert.equal(result.structureSignature.layout, "venn-overlap");
  assert.equal(result.structureSignature.stepCount, 3);
  assert.equal(result.structureSignature.direction, "overlapping-sets");
  assert.ok(result.targetMotifs.includes("venn-overlap"));
  assert.ok(result.targetMotifs.includes("intersection-overlap"));
});

test("diagram understanding maps generic node diagrams to relationship component groups", () => {
  const strategy = _private.inferComponentStrategy({
    archetype: "generic-node-diagram",
    confidence: 0.66,
    nativeReadiness: "hybrid-native-plus-residual-crops",
    nodes: [{}, {}, {}],
    connectors: [{}],
    residuals: []
  });

  assert.equal(strategy.mode, "hybrid-template-plus-local-crops");
  assert.equal(strategy.templateFamily, "hub-spoke");
  assert.ok(strategy.sourcePreference.includes("officeplus-search"));
});

test("diagram understanding maps swimlane and screenshot processes to process components", () => {
  const swimlane = _private.inferComponentStrategy({
    archetype: "swimlane-flow",
    confidence: 0.74,
    nativeReadiness: "native-rebuild",
    visualNodes: [{}, {}, {}, {}],
    visualConnectors: [{}, {}],
    residuals: []
  });
  const screenshotProcess = _private.inferComponentStrategy({
    archetype: "process-with-screenshots",
    confidence: 0.64,
    nativeReadiness: "hybrid-native-plus-residual-crops",
    nodes: [{}, {}, {}],
    residuals: [{ kind: "screenshot-crop-candidate" }]
  });

  assert.equal(swimlane.templateFamily, "process-chain");
  assert.equal(screenshotProcess.templateFamily, "process-chain");
  assert.equal(screenshotProcess.mode, "hybrid-template-plus-local-crops");
});

test("diagram understanding uses demand semantics to target lens funnel branch process components", () => {
  const result = understandDiagramLayer(
    {
      box: { x: 70, y: 90, w: 820, h: 330 },
      source: {
        expressionForm: "complex-diagram",
        expressionSubtype: "dense-complex-diagram"
      }
    },
    {
      textBoxes: [
        { id: "title", text: "Skill1需求理解：化乱为治，结构化收敛", box: { x: 90, y: 96, w: 520, h: 34 } },
        { id: "a", text: "业务目标", box: { x: 110, y: 170, w: 98, h: 30 } },
        { id: "b", text: "会议纪要", box: { x: 110, y: 220, w: 98, h: 30 } },
        { id: "c", text: "业务截图", box: { x: 110, y: 270, w: 98, h: 30 } },
        { id: "d", text: "核心流程", box: { x: 110, y: 320, w: 98, h: 30 } },
        { id: "out", text: "输出结构化蓝图", box: { x: 650, y: 210, w: 170, h: 36 } }
      ]
    },
    undefined,
    {
      semanticText: "需求理解 输入素材 输出结构化蓝图 漏斗 分支流程",
      visualAtoms: [
        { id: "n1", kind: "native-rect-candidate", box: { x: 100, y: 160, w: 120, h: 46 }, nativeCandidate: true },
        { id: "n2", kind: "native-rect-candidate", box: { x: 100, y: 214, w: 120, h: 46 }, nativeCandidate: true },
        { id: "n3", kind: "native-rect-candidate", box: { x: 100, y: 268, w: 120, h: 46 }, nativeCandidate: true },
        { id: "n4", kind: "native-rect-candidate", box: { x: 620, y: 170, w: 180, h: 56 }, nativeCandidate: true },
        { id: "n5", kind: "native-rect-candidate", box: { x: 620, y: 246, w: 180, h: 56 }, nativeCandidate: true },
        { id: "lens", kind: "native-ellipse-candidate", box: { x: 360, y: 180, w: 120, h: 120 }, nativeCandidate: true },
        { id: "arrow", kind: "connector-arrow-candidate", box: { x: 480, y: 230, w: 110, h: 8 } }
      ]
    }
  );

  assert.equal(result.componentStrategy.templateFamily, "process-chain");
  assert.match(result.componentStrategy.mode, /component-template|hybrid-template-plus-local-crops/);
  assert.ok(result.targetMotifs.includes("lens-funnel-flow"));
  assert.ok(result.targetMotifs.includes("branch-card-flow"));
  assert.ok(result.componentStrategy.targetMotifs.includes("lens-funnel-flow"));
  assert.ok(result.componentStrategy.targetMotifs.includes("branch-card-flow"));
});

test("layer profile summarizes component strategy modes and template families", () => {
  const summary = summarizeLayerProfile({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      images: [{
        box: { x: 100, y: 100, w: 600, h: 160 },
        source: {
          editable: false,
          layer: {
            layerType: "diagram-zone",
            areaRatio: 0.1852,
            recommendedAction: "split-native-with-residual-crop",
            diagramUnderstanding: {
              archetype: "flow-card-chain",
              nativeReadiness: "hybrid-native-plus-residual-crops",
              componentStrategy: {
                mode: "component-template",
                templateFamily: "process-chain",
                targetMotifs: ["linear-arrow-chain"]
              },
              targetMotifs: ["linear-arrow-chain"],
              visualAtomKindCounts: { "native-rect-candidate": 3 }
            }
          }
        }
      }]
    }]
  });

  assert.equal(summary.totals.componentStrategyModeCounts["component-template"], 1);
  assert.equal(summary.totals.componentTemplateFamilyCounts["process-chain"], 1);
  assert.equal(summary.totals.componentTargetMotifCounts["linear-arrow-chain"], 1);
  assert.equal(summary.pages[0].componentTemplateFamilyCounts["process-chain"], 1);
  assert.equal(summary.pages[0].componentTargetMotifCounts["linear-arrow-chain"], 1);
});
