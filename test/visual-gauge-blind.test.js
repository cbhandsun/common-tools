"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createChartFixtures, SLIDE_SIZE } = require("../skills/pd-hifi-slideclone/scripts/lib/chart-native-render-golden");
const { classifyVisualLayer } = require("../skills/pd-hifi-slideclone/scripts/lib/layer-classifier");
const { _private: { readinessFor } } = require("../skills/pd-hifi-slideclone/scripts/lib/diagram-understanding");
const { createVisualAtomNativeShapes } = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

const FULL_BOX = Object.freeze({ x: 0, y: 0, w: SLIDE_SIZE.widthPt, h: SLIDE_SIZE.heightPt });

test("metadata-free gauge geometry becomes a native arc and needle", () => {
  const fixture = fixtureById("native-gauge-chart");
  const item = { id: "blind-gauge", type: "image", box: FULL_BOX, source: { detector: "generic-visual-underlay" } };
  const layer = classifyVisualLayer(item, { textBoxes: [] }, SLIDE_SIZE, { sourceImage: fixture.image });
  assert.equal(layer.diagramUnderstanding.archetype, "gauge-chart");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  const image = { ...item, source: { ...item.source, layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  assert.deepEqual(shapes.map((shape) => shape.source?.detector), [
    "visual-chart-native-gauge-arc",
    "visual-chart-native-gauge-needle"
  ]);
  assert.deepEqual(shapes.map((shape) => shape.type), ["freeform", "line"]);
  assert.equal(image.source.objectifiedVisualAtoms, 2);
});

test("metadata-free line and funnel fixtures do not become gauges", () => {
  for (const id of ["native-line-chart", "native-funnel-lens-flow"]) {
    const fixture = fixtureById(id);
    const item = { id, type: "image", box: FULL_BOX, source: { detector: "generic-visual-underlay" } };
    const layer = classifyVisualLayer(item, { textBoxes: [] }, SLIDE_SIZE, { sourceImage: fixture.image });
    assert.notEqual(layer.diagramUnderstanding.archetype, "gauge-chart");
  }
});

test("embedded gauge-like fragments do not replace a larger complex illustration", () => {
  const visualAtoms = [
    { kind: "native-gauge-arc-candidate", box: { x: 100, y: 100, w: 100, h: 100 } },
    { kind: "native-gauge-needle-candidate", box: { x: 130, y: 140, w: 30, h: 16 } },
    { kind: "native-rect-candidate", box: { x: 10, y: 10, w: 40, h: 30 } },
    { kind: "native-rect-candidate", box: { x: 300, y: 360, w: 60, h: 40 } }
  ];
  const readiness = readinessFor({
    archetype: "gauge-chart",
    confidence: 0.95,
    nodes: [],
    connectors: [],
    residuals: [],
    visualAtoms,
    visualNodes: visualAtoms.filter((atom) => atom.kind === "native-rect-candidate"),
    visualConnectors: []
  });
  assert.equal(readiness, "preserve-crop-with-structured-metadata");
  const image = {
    id: "embedded-gauge-fragment",
    type: "image",
    box: FULL_BOX,
    source: {
      detector: "generic-visual-underlay",
      layer: {
        layerType: "diagram-zone",
        recommendedAction: "preserve-local-crop",
        diagramUnderstanding: {
          archetype: "gauge-chart",
          confidence: 0.95,
          nativeReadiness: readiness,
          residuals: [],
          visualAtoms: visualAtoms.map((atom, index) => ({ ...atom, id: `atom-${index}`, nativeCandidate: true }))
        }
      }
    }
  };
  const shapes = createVisualAtomNativeShapes([image]);
  assert.ok(shapes.every((shape) => !/^visual-chart-native-gauge-/.test(String(shape.source?.detector || ""))));
  assert.notEqual(image.source.dropErasedResidualAfterNativeRebuild, true);
});

function fixtureById(id) {
  const fixture = createChartFixtures().find((candidate) => candidate.id === id);
  assert.ok(fixture, `missing fixture ${id}`);
  return fixture;
}
