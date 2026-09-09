"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createSystemMapLayoutFactory
} = require("../packages/slideclone-native-engine/scripts/lib/native-rebuild-system-map-layout");

const DEFAULT_SLIDE = Object.freeze({ widthPt: 960, heightPt: 540 });

function createDependencies(overrides = {}) {
  return {
    detectSystemMapSourceMappingLineShapes: () => [],
    findSystemMapSourceImageFile: () => null,
    readPng: () => null,
    systemMapSourceDetectedNetworkDetailShapes: () => [],
    systemMapSourceDetectedNetworkLayout: () => null,
    ...overrides
  };
}

test("system map layout factory fails closed when dependencies are missing", () => {
  assert.throws(
    () => createSystemMapLayoutFactory({ ...createDependencies(), readPng: null }),
    /system map layout dependency readPng must be a function/
  );
});

test("system map fidelity chrome exposes editable search chrome without text boxes", () => {
  const { createSystemMapFidelityChromeObjects } = createSystemMapLayoutFactory(createDependencies());
  const result = createSystemMapFidelityChromeObjects([
    { text: "多域资产全景搜索", box: { x: 700, y: 45, w: 120, h: 18 } }
  ], DEFAULT_SLIDE);
  assert.equal(result.textBoxes.length, 0);
  assert.ok(result.shapes.length >= 3);
  assert.ok(result.shapes.every((shape) => shape.source.detector === "system-map-fidelity-chrome-search"));
});

test("system map layout composes fallback native network, rails, labels, and texture", () => {
  const { inferSystemMapDiagramLayout } = createSystemMapLayoutFactory(createDependencies());
  const result = inferSystemMapDiagramLayout({
    id: "system-map",
    box: { x: 20, y: 70, w: 860, h: 360 }
  }, [
    { text: "全景搜索", box: { x: 700, y: 42, w: 100, h: 18 } }
  ], DEFAULT_SLIDE);
  assert.ok(result.shapes.some((shape) => shape.source.detector === "system-map-native-background-dot"));
  assert.ok(result.shapes.some((shape) => shape.source.detector === "system-map-native-network-node"));
  assert.ok(result.shapes.some((shape) => shape.source.detector === "system-map-native-network-rail-module"));
  assert.ok(result.textBoxes.some((textBox) => textBox.source.detector === "system-map-native-network-rail-label"));
  assert.ok(result.textBoxes.some((textBox) => textBox.source.role === "bottom-domain-label"));
});

test("system map layout prefers source-detected network and detail shapes when available", () => {
  const { inferSystemMapDiagramLayout } = createSystemMapLayoutFactory(createDependencies({
    systemMapSourceDetectedNetworkLayout: () => ({
      edgeShapes: [{
        id: "detected-edge",
        type: "line",
        box: { x: 10, y: 10, w: 20, h: 0 },
        source: { detector: "system-map-native-network-edge", sourceImageDetected: true }
      }],
      nodes: [{ x: 100, y: 120, size: 12, kind: "circle", sourceImageDetected: true }]
    }),
    systemMapSourceDetectedNetworkDetailShapes: () => [{
      id: "detected-detail",
      type: "rect",
      box: { x: 140, y: 160, w: 10, h: 10 },
      source: { detector: "system-map-native-network-detail-node", sourceImageDetected: true }
    }]
  }));
  const result = inferSystemMapDiagramLayout({
    id: "system-map",
    box: { x: 20, y: 70, w: 860, h: 360 }
  }, [], DEFAULT_SLIDE);
  assert.ok(result.shapes.some((shape) => shape.id === "detected-edge"));
  assert.ok(result.shapes.some((shape) => shape.id === "detected-detail"));
  assert.ok(result.shapes.some((shape) => shape.source.detector === "system-map-native-network-node" && shape.source.sourceImageDetected === true));
});
