"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyVisualLayer } = require("../skills/pd-hifi-slideclone/scripts/lib/layer-classifier");
const {
  understandDiagramLayer,
  _private: { inferArchetype }
} = require("../skills/pd-hifi-slideclone/scripts/lib/diagram-understanding");
const {
  createRelationshipNativeShell,
  _private: { dominantFlowNodes, validBox }
} = require("../skills/pd-hifi-slideclone/scripts/lib/relationship-native-shell");
const { createVisualAtomNativeShapes } = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

const SLIDE = { widthPt: 640, heightPt: 240 };

test("reconstructs a pixel flow chain as four native cards and three connectors", () => {
  const sourceImage = blankImage(SLIDE.widthPt, SLIDE.heightPt, "#ffffff");
  for (const [x, color] of [[52, "#60a5fa"], [204, "#93c5fd"], [356, "#60a5fa"], [508, "#93c5fd"]]) {
    fillRect(sourceImage, x, 84, 92, 52, color);
  }
  for (const x of [154, 306, 458]) fillArrowRight(sourceImage, x, 104, 34, 7, 18, "#94a3b8");

  const box = { x: 0, y: 0, w: SLIDE.widthPt, h: SLIDE.heightPt };
  const layer = classifyVisualLayer({
    id: "flow-chain",
    type: "fidelity-crop",
    box,
    source: { detector: "sparse-diagram-graphic-underlay-crop", expressionForm: "complex-diagram" }
  }, { textBoxes: [] }, SLIDE, { sourceImage });
  const image = { id: "flow-chain", box, source: { layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  const nodeShapes = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-flow-node");

  assert.equal(layer.diagramUnderstanding.archetype, "flow-card-chain");
  assert.equal(nodeShapes.length, 4);
  assert.deepEqual(nodeShapes.map((shape) => shape.box.w), [92, 92, 92, 92]);
  assert.deepEqual(nodeShapes.map((shape) => shape.box.x), [52, 204, 356, 508]);
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-relationship-native-flow-connector").length, 3);
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-atom-native-rect").length, 0);
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
  assert.ok(shapes.every((shape) => shape.source.editable === true));
});

test("reconstructs measured swimlane rows as native minimum units without inventing lane backgrounds", () => {
  const sourceImage = blankImage(640, 360, "#ffffff");
  for (const y of [86, 220]) {
    for (const x of [56, 274, 492]) fillRect(sourceImage, x, y, 92, 48, "#60a5fa");
    for (const x of [164, 382]) fillRect(sourceImage, x, y + 22, 92, 5, "#94a3b8");
  }
  const box = { x: 0, y: 0, w: 640, h: 360 };
  const layer = classifyVisualLayer({
    id: "swimlane-flow",
    type: "fidelity-crop",
    box,
    source: { detector: "sparse-diagram-graphic-underlay-crop", expressionForm: "complex-diagram" }
  }, { textBoxes: [] }, { widthPt: 640, heightPt: 360 }, { sourceImage });
  const image = { id: "swimlane-flow", box, source: { layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  const nodes = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-swimlane-node");
  const connectors = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-swimlane-connector");

  assert.equal(layer.diagramUnderstanding.archetype, "swimlane-flow");
  assert.equal(nodes.length, 6);
  assert.equal(connectors.length, 4);
  assert.deepEqual(nodes.map((shape) => [shape.source.laneIndex, shape.source.laneColumn]), [
    [0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]
  ]);
  assert.equal(shapes.some((shape) => /lane-(?:background|header)/.test(shape.source.detector)), false);
  assert.equal(shapes.some((shape) => shape.source.detector === "visual-atom-native-rect"), false);
  assert.equal(image.source.relationshipShellKind, "swimlane-flow");
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
});

test("preserves ambiguous swimlane evidence with a cross-lane connector", () => {
  const nodes = [
    atom("a1", "native-rect-candidate", { x: 40, y: 50, w: 90, h: 44 }),
    atom("a2", "native-rect-candidate", { x: 250, y: 50, w: 90, h: 44 }),
    atom("a3", "native-rect-candidate", { x: 460, y: 50, w: 90, h: 44 }),
    atom("b1", "native-rect-candidate", { x: 40, y: 210, w: 90, h: 44 }),
    atom("b2", "native-rect-candidate", { x: 250, y: 210, w: 90, h: 44 }),
    atom("b3", "native-rect-candidate", { x: 460, y: 210, w: 90, h: 44 })
  ];
  const connectorAtoms = [
    atom("c1", "connector-line-candidate", { x: 138, y: 70, w: 104, h: 4 }),
    atom("c2", "connector-line-candidate", { x: 348, y: 70, w: 104, h: 4 }),
    atom("c3", "connector-line-candidate", { x: 138, y: 230, w: 104, h: 4 }),
    atom("cross", "connector-line-candidate", { x: 348, y: 150, w: 104, h: 4 })
  ];
  const visualConnectors = [
    { atomId: "c1", fromAtomId: "a1", toAtomId: "a2", axis: "horizontal" },
    { atomId: "c2", fromAtomId: "a2", toAtomId: "a3", axis: "horizontal" },
    { atomId: "c3", fromAtomId: "b1", toAtomId: "b2", axis: "horizontal" },
    { atomId: "cross", fromAtomId: "a3", toAtomId: "b3", axis: "horizontal" }
  ];
  const result = createRelationshipNativeShell(
    { id: "ambiguous-swimlane", box: { x: 0, y: 0, w: 640, h: 320 } },
    [...nodes, ...connectorAtoms],
    { layerType: "diagram-zone" },
    { archetype: "swimlane-flow", confidence: 0.95, visualConnectors }
  );

  assert.equal(result.preserveWhole, true);
  assert.equal(result.shellKind, "swimlane-flow");
  assert.equal(result.shapes.length, 0);
  assert.match(result.reason, /cross-lane structures are preserved/);
});

test("reconstructs a measured layered stack as ordered native layers", () => {
  const sourceImage = blankImage(520, 340, "#ffffff");
  fillRect(sourceImage, 210, 54, 100, 54, "#60a5fa");
  fillRect(sourceImage, 160, 130, 200, 54, "#34d399");
  fillRect(sourceImage, 104, 206, 312, 54, "#f97316");
  const box = { x: 0, y: 0, w: 520, h: 340 };
  const layer = classifyVisualLayer({
    id: "layered-stack",
    type: "fidelity-crop",
    box,
    source: {
      detector: "pyramid-layered-stack-underlay-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "pyramid layered stack"
    }
  }, { textBoxes: [] }, { widthPt: 520, heightPt: 340 }, { sourceImage });
  const image = { id: "layered-stack", box, source: { layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  const layers = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-layered-stack-layer");

  assert.equal(layer.diagramUnderstanding.archetype, "layered-stack");
  assert.equal(layers.length, 3);
  assert.deepEqual(layers.map((shape) => shape.box), [
    { x: 210, y: 54, w: 100, h: 54 },
    { x: 160, y: 130, w: 200, h: 54 },
    { x: 104, y: 206, w: 312, h: 54 }
  ]);
  assert.deepEqual(layers.map((shape) => shape.style.fill), ["#60A5FA", "#34D399", "#F97316"]);
  assert.equal(shapes.some((shape) => shape.source.detector === "visual-atom-native-rect"), false);
  assert.equal(image.source.relationshipShellKind, "layered-stack");
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
});

test("preserves a layered stack when measured widths reverse direction", () => {
  const atoms = [
    atom("layer-1", "native-rect-candidate", { x: 220, y: 44, w: 100, h: 52 }),
    atom("layer-2", "native-rect-candidate", { x: 150, y: 124, w: 240, h: 52 }),
    atom("layer-3", "native-rect-candidate", { x: 190, y: 204, w: 160, h: 52 })
  ];
  const result = createRelationshipNativeShell(
    { id: "irregular-stack", box: { x: 0, y: 0, w: 540, h: 320 } },
    atoms,
    { layerType: "diagram-zone" },
    { archetype: "layered-stack", confidence: 0.94, structureSignature: { direction: "pyramid-down", stepCount: 3 } }
  );

  assert.equal(result.preserveWhole, true);
  assert.equal(result.shellKind, "layered-stack");
  assert.equal(result.shapes.length, 0);
  assert.match(result.reason, /consistent width progression/);
});

test("reconstructs a complete segmented cycle as native arc-arrow minimum units", () => {
  const sourceImage = blankImage(460, 260, "#ffffff");
  fillDonutSegment(sourceImage, 88, 50, 128, 128, 0.62, -60, 35, "#38bdf8");
  fillDonutSegment(sourceImage, 88, 50, 128, 128, 0.62, 70, 165, "#0ea5e9");
  fillDonutSegment(sourceImage, 88, 50, 128, 128, 0.62, 200, 300, "#0369a1");
  fillTriangle(sourceImage, [{ x: 196, y: 90 }, { x: 222, y: 102 }, { x: 198, y: 116 }], "#38bdf8");
  const box = { x: 0, y: 0, w: 460, h: 260 };
  const layer = classifyVisualLayer({
    id: "segmented-cycle",
    type: "fidelity-crop",
    box,
    source: {
      detector: "islide-segmented-cycle-arrow-component",
      expressionForm: "complex-diagram",
      expressionSubtype: "循环箭头 圆弧箭头 闭环流程"
    }
  }, { textBoxes: [] }, { widthPt: 460, heightPt: 260 }, { sourceImage });
  const image = { id: "segmented-cycle", box, source: { layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  const segments = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-cycle-loop-segment" && shape.source.part === "arc");

  assert.equal(layer.diagramUnderstanding.archetype, "cycle-loop");
  assert.equal(segments.length, 3);
  assert.ok(segments.every((shape) => shape.type === "freeform" && shape.points.length >= 10));
  assert.equal(shapes.some((shape) => shape.source.detector === "visual-atom-native-connector"), false);
  assert.equal(image.source.relationshipShellKind, "cycle-loop");
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
});

test("preserves segmented cycle evidence when measured arcs do not cover a loop", () => {
  const parent = { x: 80, y: 40, w: 160, h: 160 };
  const segments = [
    { startDeg: 0, endDeg: 45, box: { x: 170, y: 70, w: 58, h: 46 } },
    { startDeg: 120, endDeg: 165, box: { x: 90, y: 60, w: 62, h: 52 } },
    { startDeg: 240, endDeg: 285, box: { x: 92, y: 140, w: 64, h: 50 } }
  ].map((item, index) => ({
    ...atom(`arc-${index}`, "native-arc-arrow-segment-candidate", item.box),
    donutParentBox: parent,
    donutSegmentAngles: { startDeg: item.startDeg, endDeg: item.endDeg },
    arcArrowHead: index === 0
  }));
  const result = createRelationshipNativeShell(
    { id: "incomplete-cycle", box: { x: 0, y: 0, w: 320, h: 240 } },
    segments,
    { layerType: "diagram-zone" },
    { archetype: "cycle-loop", confidence: 0.9 }
  );

  assert.equal(result.preserveWhole, true);
  assert.equal(result.shellKind, "cycle-loop");
  assert.equal(result.shapes.length, 0);
  assert.match(result.reason, /sufficient angular coverage/);
});

test("reconstructs a measured magnifier convergence flow as native minimum units", () => {
  const inputs = [
    atom("input-1", "native-rect-candidate", { x: 48, y: 36, w: 112, h: 42 }),
    atom("input-2", "native-rect-candidate", { x: 48, y: 118, w: 112, h: 42 }),
    atom("input-3", "native-rect-candidate", { x: 48, y: 200, w: 112, h: 42 })
  ];
  const focus = atom("focus", "native-search-candidate", { x: 390, y: 66, w: 170, h: 170 });
  focus.shapeHint = "search";
  const focusContent = atom("focus-content", "native-rect-candidate", { x: 430, y: 122, w: 64, h: 22 });
  focusContent.color = "#EFF6FF";
  const connectors = [
    {
      ...atom("line-1", "connector-line-candidate", { x: 160, y: 57, w: 232, h: 72 }),
      shapeHint: "line-diagonal",
      lineEndpoints: { from: { x: 160, y: 57 }, to: { x: 392, y: 129 } }
    },
    {
      ...atom("line-2", "connector-line-candidate", { x: 160, y: 137, w: 232, h: 4 }),
      shapeHint: "line",
      lineEndpoints: { from: { x: 160, y: 139 }, to: { x: 392, y: 139 } }
    },
    {
      ...atom("line-3", "connector-line-candidate", { x: 160, y: 149, w: 232, h: 72 }),
      shapeHint: "line-diagonal",
      lineEndpoints: { from: { x: 160, y: 221 }, to: { x: 392, y: 149 } }
    }
  ];
  const visualConnectors = connectors.map((connector, index) => ({
    atomId: connector.id,
    fromAtomId: inputs[index].id,
    toAtomId: focus.id,
    axis: index === 1 ? "horizontal" : "diagonal"
  }));
  const result = createRelationshipNativeShell(
    { id: "magnifier-flow", box: { x: 0, y: 0, w: 640, h: 300 } },
    [...inputs, focus, focusContent, ...connectors],
    { layerType: "diagram-zone" },
    { archetype: "funnel-lens-flow", confidence: 0.94, visualConnectors }
  );

  assert.equal(result.shellKind, "funnel-lens-flow");
  assert.equal(result.fullyObjectified, true);
  assert.equal(result.shapes.filter((shape) => shape.source.detector === "visual-relationship-native-funnel-lens-connector").length, 3);
  assert.equal(result.shapes.filter((shape) => shape.source.detector === "visual-relationship-native-funnel-lens-node").length, 4);
  assert.deepEqual(result.shapes
    .filter((shape) => shape.source.detector === "visual-relationship-native-funnel-lens-focus")
    .map((shape) => shape.source.part), ["lens", "handle"]);
});

test("reconstructs a pixel magnifier convergence flow end to end", () => {
  const sourceImage = blankImage(720, 390, "#ffffff");
  fillRect(sourceImage, 72, 58, 150, 54, "#dbeafe");
  fillRect(sourceImage, 72, 166, 150, 54, "#e0f2fe");
  fillRect(sourceImage, 72, 274, 150, 54, "#dcfce7");
  fillThickLine(sourceImage, 222, 85, 455, 188, 5, "#60a5fa");
  fillThickLine(sourceImage, 222, 193, 455, 193, 5, "#60a5fa");
  fillThickLine(sourceImage, 222, 301, 455, 198, 5, "#60a5fa");
  fillMagnifier(sourceImage, 438, 112, 170, "#2563eb");
  fillRect(sourceImage, 492, 160, 72, 20, "#eff6ff");
  fillRect(sourceImage, 492, 194, 72, 20, "#eff6ff");
  const box = { x: 0, y: 0, w: 720, h: 390 };
  const layer = classifyVisualLayer({
    id: "pixel-magnifier-flow",
    type: "fidelity-crop",
    box,
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
  }, { widthPt: 720, heightPt: 390 }, { sourceImage });
  const image = { id: "pixel-magnifier-flow", box, source: { layer } };
  const shapes = createVisualAtomNativeShapes([image]);

  assert.equal(layer.diagramUnderstanding.archetype, "funnel-lens-flow");
  assert.equal(image.source.relationshipShellKind, "funnel-lens-flow");
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-relationship-native-funnel-lens-connector").length, 3);
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-relationship-native-funnel-lens-node" && shape.source.role === "input").length, 3);
  assert.deepEqual(shapes
    .filter((shape) => shape.source.detector === "visual-relationship-native-funnel-lens-focus")
    .map((shape) => shape.source.part), ["lens", "handle"]);
});

test("protects a complex decorated magnifier as a minimum visual unit", () => {
  const inputs = [
    atom("input-1", "native-rect-candidate", { x: 48, y: 36, w: 112, h: 42 }),
    atom("input-2", "native-rect-candidate", { x: 48, y: 150, w: 112, h: 42 })
  ];
  const focus = atom("focus", "native-search-candidate", { x: 390, y: 54, w: 170, h: 170 });
  const residual = { ...atom("focus-decoration", "complex-shape-crop-candidate", { x: 428, y: 92, w: 72, h: 64 }), nativeCandidate: false, residualCandidate: true };
  const connectors = inputs.map((input, index) => ({
    ...atom(`line-${index + 1}`, "connector-line-candidate", { x: 160, y: 58 + index * 88, w: 232, h: 54 }),
    shapeHint: "line-diagonal",
    lineEndpoints: {
      from: { x: 160, y: input.box.y + input.box.h / 2 },
      to: { x: 392, y: 116 + index * 28 }
    }
  }));
  const result = createRelationshipNativeShell(
    { id: "decorated-magnifier-flow", box: { x: 0, y: 0, w: 640, h: 280 } },
    [...inputs, focus, residual, ...connectors],
    { layerType: "diagram-zone" },
    {
      archetype: "funnel-lens-flow",
      confidence: 0.94,
      visualConnectors: connectors.map((connector, index) => ({
        atomId: connector.id,
        fromAtomId: inputs[index].id,
        toAtomId: focus.id,
        axis: "diagonal"
      }))
    }
  );

  assert.equal(result.preserveWhole, true);
  assert.equal(result.protectWhole, true);
  assert.equal(result.shellKind, "funnel-lens-flow");
  assert.equal(result.shapes.length, 0);
  assert.match(result.reason, /minimum visual unit/);
});

test("reconstructs a complete measured topology triangle as native nodes and diagonal connectors", () => {
  const nodes = [
    atom("top", "native-ellipse-candidate", { x: 220, y: 34, w: 80, h: 64 }),
    atom("left", "native-ellipse-candidate", { x: 58, y: 214, w: 88, h: 64 }),
    atom("right", "native-ellipse-candidate", { x: 374, y: 214, w: 88, h: 64 })
  ];
  const connectors = [
    { ...atom("edge-left", "connector-line-candidate", { x: 102, y: 66, w: 158, h: 174 }), lineEndpoints: { from: { x: 260, y: 66 }, to: { x: 102, y: 240 } } },
    { ...atom("edge-right", "connector-line-candidate", { x: 260, y: 66, w: 158, h: 174 }), lineEndpoints: { from: { x: 260, y: 66 }, to: { x: 418, y: 240 } } },
    { ...atom("edge-bottom", "connector-line-candidate", { x: 102, y: 237, w: 316, h: 6 }), lineEndpoints: { from: { x: 102, y: 240 }, to: { x: 418, y: 240 } } }
  ];
  const visualConnectors = [
    { atomId: "edge-left", fromAtomId: "top", toAtomId: "left", axis: "diagonal" },
    { atomId: "edge-right", fromAtomId: "top", toAtomId: "right", axis: "diagonal" },
    { atomId: "edge-bottom", fromAtomId: "left", toAtomId: "right", axis: "horizontal" }
  ];
  const result = createRelationshipNativeShell(
    { id: "triangle-topology", box: { x: 0, y: 0, w: 520, h: 340 } },
    [...nodes, ...connectors],
    { layerType: "diagram-zone" },
    { archetype: "topology-diagram", confidence: 0.96, visualConnectors, structureSignature: { direction: "triangular-closed-loop" } }
  );

  assert.equal(result.shellKind, "topology-diagram");
  assert.equal(result.fullyObjectified, true);
  assert.equal(result.shapes.filter((shape) => shape.source.detector === "visual-relationship-native-topology-node").length, 3);
  const edges = result.shapes.filter((shape) => shape.source.detector === "visual-relationship-native-topology-connector");
  assert.equal(edges.length, 3);
  assert.ok(edges.every((shape) => shape.type === "line" && shape.source.measuredEndpoints === true));
  assert.deepEqual(edges[0].box, { x: 260, y: 66, w: -158, h: 174 });
});

test("reconstructs a pixel topology triangle into six measured native minimum units", () => {
  const sourceImage = blankImage(520, 340, "#ffffff");
  fillThickLine(sourceImage, 260, 66, 102, 240, 6, "#64748b");
  fillThickLine(sourceImage, 260, 66, 418, 240, 6, "#64748b");
  fillRect(sourceImage, 102, 237, 316, 6, "#64748b");
  fillEllipse(sourceImage, 220, 34, 80, 64, "#60a5fa");
  fillEllipse(sourceImage, 58, 214, 88, 64, "#34d399");
  fillEllipse(sourceImage, 374, 214, 88, 64, "#f97316");
  const box = { x: 0, y: 0, w: 520, h: 340 };
  const layer = classifyVisualLayer({
    id: "pixel-topology",
    type: "fidelity-crop",
    box,
    source: {
      detector: "topology-relationship-underlay-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "closed-loop topology triangle"
    }
  }, { textBoxes: [] }, { widthPt: 520, heightPt: 340 }, { sourceImage });
  const image = { id: "pixel-topology", box, source: { layer } };
  const shapes = createVisualAtomNativeShapes([image], sourceImage, { widthPt: 520, heightPt: 340 });

  assert.ok(layer.diagramUnderstanding.visualNodeCount >= 3);
  assert.equal(layer.diagramUnderstanding.visualConnectorCount, 3);
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-relationship-native-topology-node").length, 3);
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-relationship-native-topology-connector").length, 3);
  assert.equal(shapes.some((shape) => shape.source.detector === "visual-atom-native-rect"), false);
  assert.equal(image.source.relationshipShellKind, "topology-diagram");
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
});

test("preserves a topology network when one measured node is isolated", () => {
  const nodes = [
    atom("top", "native-ellipse-candidate", { x: 220, y: 34, w: 80, h: 64 }),
    atom("left", "native-ellipse-candidate", { x: 58, y: 214, w: 88, h: 64 }),
    atom("right", "native-ellipse-candidate", { x: 374, y: 214, w: 88, h: 64 })
  ];
  const edge = { ...atom("edge-left", "connector-line-candidate", { x: 102, y: 66, w: 158, h: 174 }), lineEndpoints: { from: { x: 260, y: 66 }, to: { x: 102, y: 240 } } };
  const result = createRelationshipNativeShell(
    { id: "incomplete-topology", box: { x: 0, y: 0, w: 520, h: 340 } },
    [...nodes, edge],
    { layerType: "diagram-zone" },
    {
      archetype: "topology-diagram",
      confidence: 0.96,
      visualConnectors: [{ atomId: "edge-left", fromAtomId: "top", toAtomId: "left", axis: "diagonal" }],
      structureSignature: { direction: "triangular-closed-loop" }
    }
  );

  assert.equal(result.preserveWhole, true);
  assert.equal(result.shellKind, "topology-diagram");
  assert.equal(result.shapes.length, 0);
  assert.match(result.reason, /complete connected graph/);
});

test("reconstructs concentric onion layers as whole ordered native ellipses", () => {
  const sourceImage = blankImage(440, 300, "#ffffff");
  fillEllipse(sourceImage, 96, 36, 248, 248, "#dbeafe");
  fillEllipse(sourceImage, 132, 72, 176, 176, "#bfdbfe");
  fillEllipse(sourceImage, 168, 108, 104, 104, "#60a5fa");
  const box = { x: 0, y: 0, w: 440, h: 300 };
  const layer = classifyVisualLayer({
    id: "concentric-onion",
    type: "fidelity-crop",
    box,
    source: {
      detector: "concentric-circles-onion-diagram-snapshot",
      expressionForm: "complex-diagram",
      expressionSubtype: "concentric circles onion diagram 同心圆 洋葱图 圈层模型"
    }
  }, { textBoxes: [] }, { widthPt: 440, heightPt: 300 }, { sourceImage });
  const image = { id: "concentric-onion", box, source: { layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  const circles = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-concentric-layer");

  assert.equal(layer.diagramUnderstanding.archetype, "concentric-circles");
  assert.equal(circles.length, 3);
  assert.deepEqual(circles.map((shape) => shape.box.w), [248, 176, 104]);
  assert.deepEqual(circles.map((shape) => shape.style.fill), ["#DBEAFE", "#BFDBFE", "#60A5FA"]);
  assert.equal(shapes.some((shape) => shape.source.detector === "visual-atom-native-rect"), false);
  assert.equal(image.source.relationshipShellKind, "concentric-circles");
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
});

test("preserves partial concentric evidence instead of emitting generic fragments", () => {
  const result = createRelationshipNativeShell(
    { id: "partial-onion", box: { x: 0, y: 0, w: 400, h: 260 } },
    [atom("fragment", "native-rect-candidate", { x: 40, y: 40, w: 14, h: 14 })],
    { layerType: "diagram-zone" },
    { archetype: "concentric-circles", confidence: 0.9 }
  );
  assert.equal(result.preserveWhole, true);
  assert.equal(result.shellKind, "concentric-circles");
  assert.equal(result.shapes.length, 0);
});

test("reconstructs a quadrant matrix as four native panels and two measured axes", () => {
  const sourceImage = blankImage(520, 360, "#ffffff");
  fillRect(sourceImage, 64, 178, 392, 4, "#64748b");
  fillRect(sourceImage, 258, 54, 4, 252, "#64748b");
  for (const [x, y, color] of [[96, 82, "#dbeafe"], [312, 82, "#bfdbfe"], [96, 220, "#bfdbfe"], [312, 220, "#dbeafe"]]) {
    fillRect(sourceImage, x, y, 112, 56, color);
  }
  const box = { x: 0, y: 0, w: 520, h: 360 };
  const layer = classifyVisualLayer({
    id: "quadrant-matrix",
    type: "fidelity-crop",
    box,
    source: { detector: "quadrant-priority-underlay-crop", expressionForm: "complex-diagram", expressionSubtype: "impact effort quadrant matrix" }
  }, { textBoxes: [] }, { widthPt: 520, heightPt: 360 }, { sourceImage });
  const image = { id: "quadrant-matrix", box, source: { layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  const panels = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-quadrant-panel");
  const axes = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-quadrant-axis");

  assert.equal(layer.diagramUnderstanding.archetype, "quadrant-matrix");
  assert.equal(panels.length, 4);
  assert.equal(axes.length, 2);
  assert.deepEqual(panels.map((shape) => [shape.source.row, shape.source.column]), [[0, 0], [0, 1], [1, 0], [1, 1]]);
  assert.deepEqual(axes.map((shape) => shape.source.axis).sort(), ["h", "v"]);
  assert.equal(shapes.some((shape) => shape.source.detector === "visual-atom-native-rect"), false);
  assert.equal(image.source.relationshipShellKind, "quadrant-matrix");
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
});

test("preserves incomplete quadrant evidence instead of deleting the source", () => {
  const panels = [
    { ...atom("q1", "native-quadrant-panel-candidate", { x: 40, y: 40, w: 90, h: 48 }), quadrantRow: 0, quadrantColumn: 0 },
    { ...atom("q2", "native-quadrant-panel-candidate", { x: 180, y: 40, w: 90, h: 48 }), quadrantRow: 0, quadrantColumn: 1 }
  ];
  const result = createRelationshipNativeShell(
    { id: "partial-quadrant", box: { x: 0, y: 0, w: 360, h: 240 } },
    panels,
    { layerType: "diagram-zone" },
    { archetype: "quadrant-matrix", confidence: 0.9 }
  );
  assert.equal(result.preserveWhole, true);
  assert.equal(result.shellKind, "quadrant-matrix");
});

test("reconstructs a complete comparison matrix as native cells and measured grid lines", () => {
  const sourceImage = blankImage(560, 320, "#ffffff");
  fillRect(sourceImage, 58, 66, 147, 62, "#eff6ff");
  fillRect(sourceImage, 207, 66, 147, 62, "#f8fafc");
  fillRect(sourceImage, 356, 66, 147, 62, "#f8fafc");
  for (const y of [64, 128, 192, 256]) fillRect(sourceImage, 56, y, 448, 3, "#64748b");
  for (const x of [56, 205, 354, 503]) fillRect(sourceImage, x, 64, 3, 195, "#64748b");
  const box = { x: 0, y: 0, w: 560, h: 320 };
  const textBoxes = [
    { id: "h1", text: "方案 A", box: { x: 72, y: 82, w: 92, h: 24 } },
    { id: "h2", text: "方案 B", box: { x: 221, y: 82, w: 92, h: 24 } },
    { id: "h3", text: "方案 C", box: { x: 370, y: 82, w: 92, h: 24 } }
  ];
  const layer = classifyVisualLayer({
    id: "comparison-matrix",
    type: "fidelity-crop",
    box,
    source: { detector: "comparison-matrix-underlay", expressionForm: "complex-diagram", expressionSubtype: "comparison matrix 方案对比" }
  }, { textBoxes }, { widthPt: 560, heightPt: 320 }, { sourceImage });
  const image = { id: "comparison-matrix", box, source: { layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  const cells = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-comparison-cell");
  const lines = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-comparison-grid-line");

  assert.equal(layer.diagramUnderstanding.archetype, "comparison-matrix");
  assert.equal(layer.diagramUnderstanding.visualGrid.provider, "semantic-matrix-grid-v1");
  assert.equal(cells.length, 9);
  assert.equal(lines.length, 8);
  assert.deepEqual(cells.slice(0, 3).map((shape) => shape.style.fill), ["#F0F8FF", "#F8FCFC", "#F8FCFC"]);
  assert.equal(shapes.some((shape) => shape.source.detector === "visual-atom-native-rect"), false);
  assert.equal(image.source.relationshipShellKind, "comparison-matrix");
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
});

test("preserves a comparison matrix when editable text evidence is missing", () => {
  const result = createRelationshipNativeShell(
    { id: "comparison-without-text", box: { x: 0, y: 0, w: 320, h: 220 } },
    [],
    { layerType: "diagram-zone" },
    {
      archetype: "comparison-matrix",
      confidence: 0.9,
      nodeCount: 0,
      visualGrid: {
        rows: 2,
        columns: 2,
        xLines: [40, 160, 280],
        yLines: [40, 110, 180],
        cells: [
          { row: 0, column: 0, box: { x: 40, y: 40, w: 120, h: 70 }, fill: "#FFFFFF" },
          { row: 0, column: 1, box: { x: 160, y: 40, w: 120, h: 70 }, fill: "#FFFFFF" },
          { row: 1, column: 0, box: { x: 40, y: 110, w: 120, h: 70 }, fill: "#FFFFFF" },
          { row: 1, column: 1, box: { x: 160, y: 110, w: 120, h: 70 }, fill: "#FFFFFF" }
        ]
      }
    }
  );
  assert.equal(result.preserveWhole, true);
  assert.equal(result.shellKind, "comparison-matrix");
  assert.equal(result.shapes.length, 0);
});

test("reconstructs a measured timeline as one native axis and four native milestones", () => {
  const sourceImage = blankImage(560, 240, "#ffffff");
  const x = 72;
  const y = 108;
  const width = 416;
  const height = 32;
  const centerY = y + height / 2;
  fillRect(sourceImage, x, centerY - 2, width, 4, "#2563eb");
  for (const ratio of [0.12, 0.38, 0.64, 0.9]) {
    const size = 23;
    const centerX = x + Math.round(width * ratio);
    fillEllipse(sourceImage, centerX - Math.round(size / 2), centerY - Math.round(size / 2), size, size, "#2563eb");
  }
  const box = { x: 0, y: 0, w: 560, h: 240 };
  const layer = classifyVisualLayer({
    id: "timeline-roadmap",
    type: "fidelity-crop",
    box,
    source: { detector: "timeline-roadmap-underlay", expressionForm: "complex-diagram", expressionSubtype: "timeline roadmap milestones" }
  }, { textBoxes: [] }, { widthPt: 560, heightPt: 240 }, { sourceImage });
  const image = { id: "timeline-roadmap", box, source: { layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  const axes = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-timeline-axis");
  const milestones = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-timeline-milestone");

  assert.equal(layer.diagramUnderstanding.archetype, "timeline-roadmap");
  assert.equal(axes.length, 1);
  assert.equal(milestones.length, 4);
  assert.ok(milestones.every((shape) => shape.box.w >= 22 && shape.box.w <= 24));
  assert.equal(shapes.some((shape) => shape.source.detector === "visual-atom-native-timeline"), false);
  assert.equal(image.source.relationshipShellKind, "timeline-roadmap");
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
});

test("preserves a timeline when measured milestone sizes are incomplete", () => {
  const result = createRelationshipNativeShell(
    { id: "timeline-incomplete", box: { x: 0, y: 0, w: 420, h: 220 } },
    [{
      ...atom("timeline", "native-timeline-candidate", { x: 40, y: 90, w: 340, h: 30 }),
      timelineMilestones: [{ x: 80 }, { x: 180 }, { x: 280 }]
    }],
    { layerType: "diagram-zone" },
    { archetype: "timeline-roadmap", confidence: 0.9 }
  );
  assert.equal(result.preserveWhole, true);
  assert.equal(result.shellKind, "timeline-roadmap");
  assert.equal(result.shapes.length, 0);
});

test("reconstructs a verified hub-spoke graph as one editable native component", () => {
  const sourceImage = blankImage(500, 360, "#ffffff");
  fillRect(sourceImage, 216, 148, 68, 44, "#2563eb");
  for (const [x, y] of [[216, 40], [216, 256], [56, 148], [376, 148]]) fillRect(sourceImage, x, y, 68, 44, "#60a5fa");
  fillRect(sourceImage, 247, 84, 6, 64, "#94a3b8");
  fillRect(sourceImage, 247, 192, 6, 64, "#94a3b8");
  fillRect(sourceImage, 124, 167, 92, 6, "#94a3b8");
  fillRect(sourceImage, 284, 167, 92, 6, "#94a3b8");
  const box = { x: 0, y: 0, w: 500, h: 360 };
  const layer = classifyVisualLayer({
    id: "hub-spoke",
    type: "fidelity-crop",
    box,
    source: { detector: "sparse-diagram-graphic-underlay-crop", expressionForm: "complex-diagram", expressionSubtype: "hub spoke relationship" }
  }, { textBoxes: [] }, { widthPt: 500, heightPt: 360 }, { sourceImage });
  const image = { id: "hub-spoke", box, source: { layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  const nodes = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-hub-spoke-node");
  const connectors = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-hub-spoke-connector");

  assert.equal(layer.diagramUnderstanding.archetype, "hub-spoke");
  assert.equal(nodes.length, 5);
  assert.equal(connectors.length, 4);
  assert.equal(nodes.filter((shape) => shape.source.role === "hub").length, 1);
  assert.deepEqual(nodes.find((shape) => shape.source.role === "hub").box, { x: 216, y: 148, w: 68, h: 44 });
  assert.equal(shapes.some((shape) => shape.source.detector === "visual-atom-native-rect"), false);
  assert.equal(image.source.relationshipShellKind, "hub-spoke");
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
});

test("reconstructs a generic one-sided colored branch graph as measured native curves", () => {
  const sourceImage = blankImage(720, 390, "#ffffff");
  const sourceNode = atom("source", "native-ellipse-candidate", { x: 70, y: 145, w: 100, h: 100 });
  const targets = [
    atom("target-a", "native-rect-candidate", { x: 440, y: 38, w: 220, h: 72 }),
    atom("target-b", "native-rect-candidate", { x: 440, y: 159, w: 220, h: 72 }),
    atom("target-c", "native-rect-candidate", { x: 440, y: 280, w: 220, h: 72 })
  ];
  const starts = [{ x: 162, y: 164 }, { x: 162, y: 195 }, { x: 162, y: 226 }];
  const ends = [{ x: 448, y: 74 }, { x: 448, y: 195 }, { x: 448, y: 316 }];
  const color = "#ee702a";
  fillBezierStroke(sourceImage, starts[0], { x: 280, y: 164 }, { x: 320, y: 74 }, ends[0], 10, color);
  fillBezierStroke(sourceImage, starts[1], { x: 280, y: 195 }, { x: 340, y: 195 }, ends[1], 10, color);
  fillBezierStroke(sourceImage, starts[2], { x: 280, y: 226 }, { x: 320, y: 316 }, ends[2], 10, color);
  const connectors = starts.map((start, index) => ({
    ...atom(`route-${index}`, "connector-line-candidate", {
      x: start.x,
      y: Math.min(start.y, ends[index].y),
      w: ends[index].x - start.x,
      h: Math.max(6, Math.abs(ends[index].y - start.y))
    }),
    color,
    nativeCandidate: true,
    residualCandidate: false
  }));
  const visualConnectors = connectors.map((connector, index) => visualConnector(connector.id, sourceNode.id, targets[index].id));
  const result = createRelationshipNativeShell(
    { id: "generic-orange-branch", box: { x: 0, y: 0, w: 720, h: 390 } },
    [sourceNode, ...targets, ...connectors],
    { layerType: "diagram-zone" },
    { archetype: "generic-node-diagram", confidence: 0.94, visualConnectors },
    { sourceImage, slideSize: { widthPt: 720, heightPt: 390 } }
  );

  assert.equal(result.shellKind, "branch-card-flow");
  assert.equal(result.fullyObjectified, true);
  assert.equal(result.shapes.filter((shape) => shape.source.detector === "visual-relationship-native-branch-card-node").length, 4);
  const curves = result.shapes.filter((shape) => shape.source.detector === "visual-relationship-native-branch-card-connector");
  assert.equal(curves.length, 3);
  assert.ok(curves.every((shape) => shape.type === "freeform"));
  assert.ok(curves.every((shape) => shape.source.routeColorMode === "auto-corridor-cluster"));
  assert.ok(curves.every((shape) => shape.source.branchDirection === "right"));
  assert.ok(curves.every((shape) => shape.style.freeformSegments.filter((segment) => segment.type === "cubicBezTo").length >= 5));

  const image = {
    id: "generic-orange-branch-integrated",
    box: { x: 0, y: 0, w: 720, h: 390 },
    source: {
      layer: {
        layerType: "diagram-zone",
        diagramUnderstanding: {
          archetype: "generic-node-diagram",
          confidence: 0.94,
          visualAtoms: [sourceNode, ...targets, ...connectors],
          visualConnectors
        }
      }
    }
  };
  const integratedShapes = createVisualAtomNativeShapes([image], sourceImage, { widthPt: 720, heightPt: 390 });
  assert.equal(image.source.relationshipShellKind, "branch-card-flow");
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
  assert.equal(integratedShapes.filter((shape) => shape.source.detector === "visual-relationship-native-branch-card-connector").length, 3);
  assert.equal(integratedShapes.filter((shape) => shape.source.detector === "visual-relationship-native-branch-card-node").length, 4);

  const blankResult = createRelationshipNativeShell(
    { id: "generic-blank-branch", box: { x: 0, y: 0, w: 720, h: 390 } },
    [sourceNode, ...targets, ...connectors],
    { layerType: "diagram-zone" },
    { archetype: "generic-node-diagram", confidence: 0.94, visualConnectors },
    { sourceImage: blankImage(720, 390, "#ffffff"), slideSize: { widthPt: 720, heightPt: 390 } }
  );
  assert.equal(blankResult.preserveWhole, true);
  assert.equal(blankResult.shapes.length, 0);
});

test("preserves an ambiguous radial graph without a unique N-1 degree hub", () => {
  const nodes = [
    atom("a", "native-rect-candidate", { x: 40, y: 80, w: 60, h: 40 }),
    atom("b", "native-rect-candidate", { x: 150, y: 80, w: 60, h: 40 }),
    atom("c", "native-rect-candidate", { x: 260, y: 30, w: 60, h: 40 }),
    atom("d", "native-rect-candidate", { x: 260, y: 130, w: 60, h: 40 }),
    atom("e", "native-rect-candidate", { x: 370, y: 80, w: 60, h: 40 })
  ];
  const links = [
    atom("ab", "connector-line-candidate", { x: 100, y: 98, w: 50, h: 4 }),
    atom("bc", "connector-line-candidate", { x: 210, y: 68, w: 50, h: 4 }),
    atom("bd", "connector-line-candidate", { x: 210, y: 148, w: 50, h: 4 }),
    atom("de", "connector-line-candidate", { x: 320, y: 98, w: 50, h: 4 })
  ];
  const result = createRelationshipNativeShell(
    { id: "ambiguous-radial", box: { x: 0, y: 0, w: 470, h: 220 } },
    [...nodes, ...links],
    { layerType: "diagram-zone" },
    {
      archetype: "hub-spoke",
      confidence: 0.9,
      visualConnectors: [
        { atomId: "ab", fromAtomId: "a", toAtomId: "b" },
        { atomId: "bc", fromAtomId: "b", toAtomId: "c" },
        { atomId: "bd", fromAtomId: "b", toAtomId: "d" },
        { atomId: "de", fromAtomId: "d", toAtomId: "e" }
      ]
    }
  );
  assert.equal(result.preserveWhole, true);
  assert.equal(result.shellKind, "hub-spoke");
  assert.equal(result.shapes.length, 0);
});

test("relationship shell rejects unexplained residuals instead of deleting the source crop", () => {
  const nodes = [40, 160, 280].map((x, index) => atom(`node-${index}`, "native-rect-candidate", { x, y: 80, w: 80, h: 44 }));
  const unexplained = { ...atom("residual", "complex-shape-crop-candidate", { x: 12, y: 12, w: 30, h: 30 }), residualCandidate: true };
  const result = createRelationshipNativeShell(
    { id: "unsafe", box: { x: 0, y: 0, w: 400, h: 220 } },
    [...nodes, unexplained],
    { layerType: "diagram-zone" },
    { archetype: "flow-card-chain", confidence: 0.9, structureSignature: { stepCount: 3 } }
  );
  assert.equal(result, null);
});

test("relationship shell boundary helpers reject empty, malformed, and extreme boxes", () => {
  assert.equal(validBox(null), null);
  assert.equal(validBox({ x: 0, y: 0, w: "bad", h: 10 }), null);
  assert.equal(validBox({ x: 0, y: 0, w: -1, h: 10 }), null);
  assert.equal(validBox({ x: 0, y: 0, w: 1e9, h: 10 }), null);
  assert.deepEqual(dominantFlowNodes([], { x: 0, y: 0, w: 400, h: 220 }), []);
});

test("relationship shell ignores small fragments contained by dominant cards", () => {
  const atoms = [
    atom("left", "native-rect-candidate", { x: 40, y: 80, w: 90, h: 48 }),
    atom("middle", "native-rect-candidate", { x: 170, y: 80, w: 90, h: 48 }),
    atom("right", "native-rect-candidate", { x: 300, y: 80, w: 90, h: 48 }),
    atom("fragment", "native-rect-candidate", { x: 48, y: 88, w: 18, h: 18 })
  ];
  assert.deepEqual(dominantFlowNodes(atoms, { x: 0, y: 0, w: 430, h: 220 }).map((item) => item.id), ["left", "middle", "right"]);
});

test("reconstructs a pixel hierarchy as four native nodes and its detected trunk", () => {
  const sourceImage = blankImage(520, 360, "#ffffff");
  fillRect(sourceImage, 210, 36, 100, 70, "#2563eb");
  fillRect(sourceImage, 40, 210, 100, 70, "#60a5fa");
  fillRect(sourceImage, 210, 210, 100, 70, "#60a5fa");
  fillRect(sourceImage, 380, 210, 100, 70, "#60a5fa");
  fillRect(sourceImage, 90, 150, 380, 6, "#94a3b8");

  const slide = { widthPt: 520, heightPt: 360 };
  const box = { x: 0, y: 0, w: 520, h: 360 };
  const layer = classifyVisualLayer({
    id: "tree",
    type: "fidelity-crop",
    box,
    source: { detector: "sparse-diagram-graphic-underlay-crop", expressionForm: "complex-diagram" }
  }, { textBoxes: [] }, slide, { sourceImage });
  const image = { id: "tree", box, source: { layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  const nodes = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-tree-node");
  const connectors = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-tree-connector");

  assert.equal(layer.diagramUnderstanding.archetype, "tree-structure");
  assert.equal(nodes.length, 4);
  assert.equal(connectors.length, 1);
  assert.deepEqual(nodes.map((shape) => shape.box), [
    { x: 210, y: 36, w: 100, h: 70 },
    { x: 40, y: 210, w: 100, h: 70 },
    { x: 210, y: 210, w: 100, h: 70 },
    { x: 380, y: 210, w: 100, h: 70 }
  ]);
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
});

test("reconstructs color-overwritten Venn sets as complete native ellipses", () => {
  const sourceImage = blankImage(460, 280, "#ffffff");
  fillEllipse(sourceImage, 92, 64, 180, 132, "#60a5fa");
  fillEllipse(sourceImage, 188, 64, 180, 132, "#34d399");
  fillRect(sourceImage, 132, 212, 76, 28, "#bfdbfe");
  fillRect(sourceImage, 252, 212, 76, 28, "#bbf7d0");
  const box = { x: 0, y: 0, w: 460, h: 280 };
  const layer = classifyVisualLayer({
    id: "venn",
    type: "fidelity-crop",
    box,
    source: { detector: "overlap-relationship-underlay-crop", expressionForm: "complex-diagram", expressionSubtype: "set-relation" }
  }, { textBoxes: [] }, { widthPt: 460, heightPt: 280 }, { sourceImage });
  const image = { id: "venn", box, source: { layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  const ellipses = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-venn-ellipse");
  const supplementary = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-venn-supplementary");

  assert.equal(layer.diagramUnderstanding.archetype, "venn-overlap");
  assert.equal(ellipses.length, 2);
  assert.deepEqual(ellipses.map((shape) => shape.box), [
    { x: 92, y: 64, w: 180, h: 132 },
    { x: 188, y: 64, w: 180, h: 132 }
  ]);
  assert.equal(supplementary.length, 2);
  assert.equal(image.source.relationshipShellKind, "venn-overlap");
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
});

test("reconstructs measured Sankey bands as editable cubic freeforms", () => {
  const sourceImage = blankImage(620, 340, "#ffffff");
  fillSankeyBand(sourceImage, 76, 84, 116, 290, 116, 150, "#93c5fd");
  fillSankeyBand(sourceImage, 76, 126, 150, 290, 164, 184, "#f9a8d4");
  fillSankeyBand(sourceImage, 76, 206, 240, 290, 184, 210, "#fdba74");
  fillSankeyBand(sourceImage, 308, 116, 146, 540, 82, 112, "#86efac");
  fillSankeyBand(sourceImage, 308, 150, 184, 540, 196, 232, "#c4b5fd");
  fillSankeyBand(sourceImage, 308, 184, 210, 540, 238, 264, "#67e8f9");
  fillRect(sourceImage, 58, 68, 18, 92, "#334155");
  fillRect(sourceImage, 58, 196, 18, 56, "#475569");
  fillRect(sourceImage, 290, 108, 18, 106, "#1e293b");
  fillRect(sourceImage, 540, 70, 18, 50, "#166534");
  fillRect(sourceImage, 540, 190, 18, 80, "#166534");
  const box = { x: 0, y: 0, w: 620, h: 340 };
  const layer = classifyVisualLayer({
    id: "sankey",
    type: "fidelity-crop",
    box,
    source: {
      detector: "sankey-flow-distribution-underlay",
      expressionForm: "data-chart",
      expressionSubtype: "sankey alluvial flow distribution"
    }
  }, { textBoxes: [] }, { widthPt: 620, heightPt: 340 }, { sourceImage });
  const image = { id: "sankey", box, source: { layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  const nodes = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-sankey-node");
  const bands = shapes.filter((shape) => shape.source.detector === "visual-relationship-native-sankey-band");

  assert.equal(layer.diagramUnderstanding.archetype, "sankey-flow-chart");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(nodes.length, 5);
  assert.equal(bands.length, 6);
  assert.ok(bands.every((shape) => shape.type === "freeform"));
  assert.ok(bands.every((shape) => shape.style.freeformSegments.filter((segment) => segment.type === "cubicBezTo").length === 2));
  assert.equal(image.source.relationshipShellKind, "sankey-flow-chart");
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
});

test("preserves Sankey-like nodes when no weighted bands are measurable", () => {
  const atoms = [
    atom("left-a", "native-rect-candidate", { x: 40, y: 50, w: 16, h: 70 }),
    atom("left-b", "native-rect-candidate", { x: 40, y: 170, w: 16, h: 60 }),
    atom("right", "native-rect-candidate", { x: 420, y: 90, w: 16, h: 100 })
  ].map((item) => ({ ...item, density: 1 }));
  const result = createRelationshipNativeShell(
    { id: "ambiguous-sankey", box: { x: 0, y: 0, w: 480, h: 280 } },
    atoms,
    { layerType: "diagram-zone" },
    { archetype: "sankey-flow-chart", confidence: 0.9 }
  );

  assert.equal(result.preserveWhole, true);
  assert.equal(result.protectWhole, true);
  assert.equal(result.shapes.length, 0);
  assert.match(result.reason, /measured vertical nodes and continuous weighted bands/);
});

test("reconstructs a generic relationship graph only from measured nodes and endpoints", () => {
  const nodes = [
    atom("a", "native-rect-candidate", { x: 48, y: 118, w: 84, h: 48 }),
    atom("b", "native-ellipse-candidate", { x: 246, y: 42, w: 82, h: 58 }),
    atom("c", "native-diamond-candidate", { x: 438, y: 118, w: 76, h: 58 }),
    atom("d", "native-rect-candidate", { x: 246, y: 224, w: 82, h: 48 })
  ];
  const connectorAtoms = [
    measuredLineAtom("ab", { x: 132, y: 136 }, { x: 246, y: 80 }),
    measuredLineAtom("bc", { x: 328, y: 80 }, { x: 438, y: 136 }),
    measuredLineAtom("cd", { x: 438, y: 154 }, { x: 328, y: 244 }),
    measuredLineAtom("da", { x: 246, y: 244 }, { x: 132, y: 154 })
  ];
  const visualConnectors = [
    visualConnector("ab", "a", "b"),
    visualConnector("bc", "b", "c"),
    visualConnector("cd", "c", "d"),
    visualConnector("da", "d", "a")
  ];
  const result = createRelationshipNativeShell(
    { id: "measured-generic", box: { x: 0, y: 0, w: 560, h: 320 } },
    [...nodes, ...connectorAtoms],
    { layerType: "diagram-zone" },
    { archetype: "generic-node-diagram", confidence: 0.92, visualConnectors }
  );

  assert.equal(result.preserveWhole, undefined);
  assert.equal(result.shellKind, "measured-generic-graph");
  assert.equal(result.fullyObjectified, true);
  assert.equal(result.shapes.filter((shape) => shape.source.detector === "visual-relationship-native-generic-node").length, 4);
  assert.equal(result.shapes.filter((shape) => shape.source.detector === "visual-relationship-native-generic-connector").length, 4);
});

test("preserves a generic relationship graph when one connector is inferred rather than measured", () => {
  const nodes = [
    atom("a", "native-rect-candidate", { x: 40, y: 80, w: 80, h: 48 }),
    atom("b", "native-rect-candidate", { x: 240, y: 40, w: 80, h: 48 }),
    atom("c", "native-rect-candidate", { x: 420, y: 140, w: 80, h: 48 })
  ];
  const measured = measuredLineAtom("ab", { x: 120, y: 104 }, { x: 240, y: 64 });
  const inferred = { ...atom("bc", "connector-line-candidate", { x: 320, y: 64, w: 100, h: 100 }), lineEndpoints: null };
  const result = createRelationshipNativeShell(
    { id: "unsafe-generic", box: { x: 0, y: 0, w: 540, h: 260 } },
    [...nodes, measured, inferred],
    { layerType: "diagram-zone" },
    {
      archetype: "generic-node-diagram",
      confidence: 0.92,
      visualConnectors: [visualConnector("ab", "a", "b"), visualConnector("bc", "b", "c")]
    }
  );

  assert.equal(result.preserveWhole, true);
  assert.equal(result.shellKind, "measured-generic-graph");
  assert.equal(result.shapes.length, 0);
});

test("preserves ambiguous Venn evidence with inconsistent recovered geometry", () => {
  const atoms = [
    {
      ...atom("left", "native-venn-ellipse-candidate", { x: 60, y: 50, w: 180, h: 132 }),
      vennObservedBox: { x: 60, y: 50, w: 136, h: 132 },
      vennRecoveryConfidence: 0.9
    },
    {
      ...atom("right", "native-venn-ellipse-candidate", { x: 166, y: 42, w: 230, h: 168 }),
      vennObservedBox: { x: 166, y: 42, w: 230, h: 168 },
      vennRecoveryConfidence: 0.96
    }
  ];
  const result = createRelationshipNativeShell(
    { id: "ambiguous-venn", box: { x: 0, y: 0, w: 460, h: 280 } },
    atoms,
    { layerType: "diagram-zone" },
    { archetype: "venn-overlap", confidence: 0.94 }
  );

  assert.equal(result.preserveWhole, true);
  assert.equal(result.shellKind, "venn-overlap");
  assert.equal(result.shapes.length, 0);
  assert.match(result.reason, /independent ellipse geometry/);
});

test("reconstructs a pixel fishbone as native cards, spine, and measured branches", () => {
  const sourceImage = blankImage(680, 360, "#ffffff");
  fillThickLine(sourceImage, 92, 178, 572, 178, 7, "#2563eb");
  fillTriangle(sourceImage, [
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
  ]) fillThickLine(sourceImage, ...branch, 6, "#2563eb");
  for (const [x, y] of [[82, 58], [198, 58], [402, 58], [114, 266], [238, 266], [482, 266]]) {
    fillRect(sourceImage, x, y, 96, 34, "#dbeafe");
  }

  const box = { x: 0, y: 0, w: 680, h: 360 };
  const layer = classifyVisualLayer({
    id: "fishbone",
    type: "fidelity-crop",
    box,
    source: {
      detector: "sparse-diagram-graphic-underlay-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "branch-analysis"
    }
  }, { textBoxes: [] }, { widthPt: 680, heightPt: 360 }, { sourceImage });
  const image = { id: "fishbone", box, source: { layer } };
  const shapes = createVisualAtomNativeShapes([image]);

  assert.equal(layer.diagramUnderstanding.archetype, "fishbone-cause-effect");
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-relationship-native-fishbone-node").length, 6);
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-relationship-native-fishbone-spine").length, 1);
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-relationship-native-fishbone-connector").length, 7);
  assert.equal(shapes.filter((shape) => shape.source.detector === "visual-atom-native-rect").length, 0);
  assert.equal(image.source.relationshipShellKind, "fishbone-cause-effect");
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, true);
});

test("protects dense radial line art as one pictorial unit instead of fake editable nodes", () => {
  const box = { x: 64, y: 88, w: 826, h: 378 };
  const visualAtoms = [
    ...Array.from({ length: 24 }, (_, index) => ({
      id: `endpoint-${index}`,
      kind: "native-rect-candidate",
      shapeHint: "ellipse",
      box: { x: 76 + index * 32, y: 98 + (index % 5) * 11, w: 12, h: 12 },
      nativeCandidate: true,
      residualCandidate: false,
      color: "#036ff2"
    })),
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `radial-${index}`,
      kind: "grid-line-candidate",
      shapeHint: "grid-line-vertical",
      axis: "v",
      box: { x: 180 + index * 62, y: 92 + index, w: 8, h: 330 - index * 3 },
      nativeCandidate: true,
      residualCandidate: false,
      color: "#5ea0cd"
    }))
  ];
  const understanding = understandDiagramLayer({
    id: "radial-art",
    box,
    source: {
      detector: "foreground-aggregate-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "dense-complex-diagram"
    }
  }, { textBoxes: [] }, { widthPt: 960, heightPt: 540 }, { visualAtoms, semanticText: "dispersed-thin-graphics dense-complex-diagram" });
  const image = {
    id: "radial-art",
    box,
    source: { layer: { layerType: "diagram-zone", visualAtoms, diagramUnderstanding: understanding } }
  };
  const shapes = createVisualAtomNativeShapes([image]);

  assert.equal(understanding.archetype, "dense-radial-line-art");
  assert.equal(understanding.nativeReadiness, "preserve-crop");
  assert.equal(shapes.length, 0);
  assert.equal(image.source.relationshipShellKind, "dense-radial-line-art");
  assert.equal(image.source.protectedMinimumUnit, true);
  assert.equal(image.source.skipVisualAtomRebuild, true);
  assert.equal(image.source.dropErasedResidualAfterNativeRebuild, false);
});

test("dense radial guard does not swallow diagrams with real card-sized nodes", () => {
  const box = { x: 0, y: 0, w: 640, h: 360 };
  const visualAtoms = [
    ...Array.from({ length: 16 }, (_, index) => atom(`tiny-${index}`, "native-rect-candidate", { x: 20 + index * 34, y: 26, w: 10, h: 10 })),
    ...Array.from({ length: 7 }, (_, index) => atom(`line-${index}`, "grid-line-candidate", { x: 70 + index * 70, y: 10, w: 7, h: 300 })),
    ...Array.from({ length: 4 }, (_, index) => atom(`card-${index}`, "native-rect-candidate", { x: 40 + index * 145, y: 150, w: 96, h: 52 }))
  ];
  const understanding = understandDiagramLayer({
    id: "cards-with-lines",
    box,
    source: { detector: "sparse-diagram-graphic-underlay-crop", expressionForm: "complex-diagram" }
  }, { textBoxes: [] }, { widthPt: 640, heightPt: 360 }, { visualAtoms, semanticText: "structured process cards" });

  assert.notEqual(understanding.archetype, "dense-radial-line-art");
});

test("explicit triangle topology semantics take priority over dense radial line evidence", () => {
  const box = { x: 0, y: 0, w: 640, h: 360 };
  const visualNodes = Array.from({ length: 20 }, (_, index) => atom(`tiny-${index}`, "native-rect-candidate", {
    x: 40 + (index % 10) * 52,
    y: 50 + Math.floor(index / 10) * 220,
    w: 12,
    h: 12
  }));
  const visualAtoms = [
    ...visualNodes,
    ...Array.from({ length: 7 }, (_, index) => atom(`line-${index}`, "connector-line-candidate", {
      x: 60 + index * 25,
      y: 30,
      w: 280,
      h: 250
    }))
  ];

  const archetype = inferArchetype({
    item: { source: { detector: "foreground-graphic-crop", expressionSubtype: "triangle-topology" } },
    nodes: [],
    textBoxes: [{ text: "原型、PRD 与智能评审铁三角" }],
    visualAtoms,
    visualNodes,
    visualConnectors: [],
    visualGrid: null,
    box,
    slideSize: { widthPt: 640, heightPt: 360 }
  });

  assert.equal(archetype, "topology-diagram");
});

function atom(id, kind, box) {
  return { id, kind, box, nativeCandidate: kind.startsWith("native-"), density: 1, color: "#60A5FA" };
}

function measuredLineAtom(id, from, to) {
  return {
    id,
    kind: "connector-line-candidate",
    shapeHint: "line-diagonal",
    box: {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      w: Math.abs(to.x - from.x),
      h: Math.abs(to.y - from.y)
    },
    lineEndpoints: { from, to },
    nativeCandidate: true,
    residualCandidate: false,
    density: 0.3,
    color: "#64748B"
  };
}

function visualConnector(atomId, fromAtomId, toAtomId) {
  return { atomId, fromAtomId, toAtomId };
}

function blankImage(width, height, color) {
  const image = { width, height, rgba: Buffer.alloc(width * height * 4) };
  fillRect(image, 0, 0, width, height, color);
  return image;
}

function fillRect(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  for (let yy = Math.max(0, y); yy < Math.min(image.height, y + h); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(image.width, x + w); xx += 1) setPixel(image, xx, yy, rgb);
  }
}

function fillEllipse(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (((xx + 0.5 - cx) / (w / 2)) ** 2 + ((yy + 0.5 - cy) / (h / 2)) ** 2 <= 1) setPixel(image, xx, yy, rgb);
    }
  }
}

function fillDonutSegment(image, x, y, w, h, innerRatio, startDeg, endDeg, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const start = ((startDeg % 360) + 360) % 360;
  const end = ((endDeg % 360) + 360) % 360;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const dx = (xx + 0.5 - cx) / rx;
      const dy = (yy + 0.5 - cy) / ry;
      const radiusSquared = dx * dx + dy * dy;
      if (radiusSquared > 1 || radiusSquared < innerRatio * innerRatio) continue;
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle < 0) angle += 360;
      const inSweep = start <= end ? angle >= start && angle <= end : angle >= start || angle <= end;
      if (inSweep) setPixel(image, xx, yy, rgb);
    }
  }
}

function fillMagnifier(image, x, y, size, color) {
  const lens = Math.round(size * 0.68);
  fillDonut(image, x, y, lens, lens, 0.58, color);
  const handleWidth = size * 0.12;
  const start = { x: x + lens * 0.68, y: y + lens * 0.68 };
  const end = { x: x + size * 0.94, y: y + size * 0.94 };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length * handleWidth / 2;
  const ny = dx / length * handleWidth / 2;
  fillPolygon(image, [
    { x: start.x + nx, y: start.y + ny },
    { x: start.x - nx, y: start.y - ny },
    { x: end.x - nx, y: end.y - ny },
    { x: end.x + nx, y: end.y + ny }
  ], color);
}

function fillDonut(image, x, y, w, h, innerRatio, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const outer = Math.min(w, h) / 2;
  const inner = outer * innerRatio;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const radius = Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy);
      if (radius <= outer && radius >= inner) setPixel(image, xx, yy, rgb);
    }
  }
}

function fillPolygon(image, points, color) {
  const rgb = parseHex(color);
  const minX = Math.floor(Math.min(...points.map((point) => point.x)));
  const maxX = Math.ceil(Math.max(...points.map((point) => point.x)));
  const minY = Math.floor(Math.min(...points.map((point) => point.y)));
  const maxY = Math.ceil(Math.max(...points.map((point) => point.y)));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      let inside = false;
      for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
        const currentPoint = points[index];
        const previousPoint = points[previous];
        if (((currentPoint.y > y + 0.5) !== (previousPoint.y > y + 0.5))
          && (x + 0.5 < (previousPoint.x - currentPoint.x) * (y + 0.5 - currentPoint.y)
            / (previousPoint.y - currentPoint.y) + currentPoint.x)) inside = !inside;
      }
      if (inside) setPixel(image, x, y, rgb);
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
  fillPolygon(image, points, color);
}

function cubicEase(start, end, t) {
  const smooth = t * t * (3 - 2 * t);
  return start + (end - start) * smooth;
}

function fillArrowRight(image, x, y, shaftWidth, shaftHeight, headSize, color) {
  fillRect(image, x, y - Math.floor(shaftHeight / 2), shaftWidth, shaftHeight, color);
  const rgb = parseHex(color);
  const tipX = x + shaftWidth + headSize;
  for (let dx = 0; dx <= headSize; dx += 1) {
    const halfHeight = Math.round(headSize * (1 - dx / Math.max(1, headSize)) / 2);
    for (let yy = y - halfHeight; yy <= y + halfHeight; yy += 1) setPixel(image, tipX - dx, yy, rgb);
  }
}

function fillThickLine(image, x0, y0, x1, y1, thickness, color) {
  const rgb = parseHex(color);
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const radius = Math.floor(thickness / 2);
  for (let index = 0; index <= steps; index += 1) {
    const x = Math.round(x0 + (x1 - x0) * index / Math.max(1, steps));
    const y = Math.round(y0 + (y1 - y0) * index / Math.max(1, steps));
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) setPixel(image, x + dx, y + dy, rgb);
    }
  }
}

function fillBezierStroke(image, start, control1, control2, end, thickness, color) {
  const rgb = parseHex(color);
  const radius = Math.max(1, Math.floor(thickness / 2));
  for (let index = 0; index <= 400; index += 1) {
    const t = index / 400;
    const u = 1 - t;
    const x = Math.round(u ** 3 * start.x + 3 * u ** 2 * t * control1.x + 3 * u * t ** 2 * control2.x + t ** 3 * end.x);
    const y = Math.round(u ** 3 * start.y + 3 * u ** 2 * t * control1.y + 3 * u * t ** 2 * control2.y + t ** 3 * end.y);
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) setPixel(image, x + dx, y + dy, rgb);
    }
  }
}

function fillTriangle(image, points, color) {
  const rgb = parseHex(color);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const signs = [signedArea({ x, y }, points[0], points[1]), signedArea({ x, y }, points[1], points[2]), signedArea({ x, y }, points[2], points[0])];
      if (!(signs.some((value) => value < 0) && signs.some((value) => value > 0))) setPixel(image, x, y, rgb);
    }
  }
}

function signedArea(first, second, third) {
  return (first.x - third.x) * (second.y - third.y) - (second.x - third.x) * (first.y - third.y);
}

function setPixel(image, x, y, rgb) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const offset = (y * image.width + x) * 4;
  image.rgba[offset] = rgb[0];
  image.rgba[offset + 1] = rgb[1];
  image.rgba[offset + 2] = rgb[2];
  image.rgba[offset + 3] = 255;
}

function parseHex(value) {
  const hex = String(value).replace(/^#/, "");
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}
