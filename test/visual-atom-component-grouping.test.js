"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inferNativeComponentGroupForText,
  visualAtomMinimumUnitGroupId
} = require("../skills/pd-hifi-slideclone/scripts/lib/visual-atom-component-grouping");
const {
  annotateTextBoxesWithNativeComponentGroups,
  createVisualAtomNativeShapes
} = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

test("visual atom grouping keeps charts cohesive and splits relationship nodes from routing", () => {
  const common = { layerId: "source-layer", archetype: "hub-spoke" };
  assert.equal(visualAtomMinimumUnitGroupId({ ...common, atom: { id: "node-a" }, shape: { type: "rect" } }), "visual-component-source-layer-hub-spoke-node-a");
  assert.equal(visualAtomMinimumUnitGroupId({ ...common, atom: { id: "route-a", kind: "connector-arrow-candidate" }, shape: { type: "line", source: { detector: "visual-atom-native-connector" } } }), "visual-component-source-layer-hub-spoke-routing");
  assert.equal(visualAtomMinimumUnitGroupId({ ...common, atom: { id: "legend", semanticRole: "legend-marker" }, shape: { type: "ellipse" } }), "visual-component-source-layer-hub-spoke-legend");
  assert.equal(visualAtomMinimumUnitGroupId({ ...common, atom: {}, shape: { type: "rect" } }), "visual-component-source-layer-hub-spoke");
  assert.equal(visualAtomMinimumUnitGroupId({ layerId: "source-layer", archetype: "line-chart", atom: { id: "bar-a" }, shape: { type: "rect" } }), "visual-component-source-layer-line-chart");
});

test("visual atom grouping anchors text to the smallest containing native node", () => {
  const shapes = [
    { type: "rect", box: { x: 20, y: 20, w: 160, h: 100 }, source: { nativeComponentGroupId: "group-large", layerSourceId: "layer-a" } },
    { type: "rect", box: { x: 50, y: 45, w: 80, h: 40 }, source: { nativeComponentGroupId: "group-node", layerSourceId: "layer-a" } },
    { type: "line", box: { x: 0, y: 0, w: 300, h: 1 }, source: { nativeComponentGroupId: "group-routing", layerSourceId: "layer-a", detector: "visual-atom-native-connector" } }
  ];
  assert.equal(inferNativeComponentGroupForText({ box: { x: 65, y: 55, w: 30, h: 12 }, source: { layerSourceId: "layer-a" } }, shapes), "group-node");
  assert.equal(inferNativeComponentGroupForText({ box: { x: 1, y: 1, w: 5, h: 5 }, source: { nativeComponentGroupId: "explicit" } }, shapes), "explicit");
  assert.equal(inferNativeComponentGroupForText({ box: { x: 500, y: 500, w: 10, h: 10 }, source: { layerSourceId: "layer-a" } }, shapes), "");
});

test("native rebuild emits independently editable relationship nodes and routing", () => {
  const atoms = [
    { id: "node-a", kind: "native-rect-candidate", nativeCandidate: true, box: { x: 20, y: 30, w: 100, h: 50 }, color: "#1E88E5", density: 0.5 },
    { id: "node-b", kind: "native-rect-candidate", nativeCandidate: true, box: { x: 220, y: 30, w: 100, h: 50 }, color: "#1E88E5", density: 0.5 },
    { id: "route-a", kind: "connector-arrow-candidate", nativeCandidate: true, box: { x: 120, y: 55, w: 100, h: 0 }, color: "#1E88E5", density: 0.5 }
  ];
  const image = {
    id: "synthetic-layer",
    source: {
      detector: "diagram-underlay",
      layer: {
        layerType: "diagram-zone",
        recommendedAction: "attempt-native-reconstruction",
        diagramUnderstanding: { archetype: "generic-node-diagram", confidence: 0.9, nativeReadiness: "native-rebuild", visualAtoms: atoms }
      }
    }
  };
  const shapes = createVisualAtomNativeShapes([image], null, { widthPt: 960, heightPt: 540 });
  const groups = [...new Set(shapes.map((shape) => shape.source.nativeComponentGroupId))].sort();

  assert.deepEqual(groups, [
    "visual-component-synthetic-layer-generic-node-diagram-node-a",
    "visual-component-synthetic-layer-generic-node-diagram-node-b",
    "visual-component-synthetic-layer-generic-node-diagram-routing"
  ]);
  const text = annotateTextBoxesWithNativeComponentGroups([
    { text: "Node A", box: { x: 45, y: 45, w: 48, h: 18 }, source: { layerSourceId: "synthetic-layer" }, style: {} }
  ], shapes);
  assert.equal(text[0].style.nativeComponentGroupId, "visual-component-synthetic-layer-generic-node-diagram-node-a");
});
