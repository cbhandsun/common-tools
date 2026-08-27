"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createChartFixtures, SLIDE_SIZE } = require("../skills/pd-hifi-slideclone/scripts/lib/chart-native-render-golden");
const { classifyVisualLayer } = require("../skills/pd-hifi-slideclone/scripts/lib/layer-classifier");
const { createVisualAtomNativeShapes } = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

const FULL_BOX = Object.freeze({ x: 0, y: 0, w: SLIDE_SIZE.widthPt, h: SLIDE_SIZE.heightPt });

test("metadata-free pie geometry becomes native editable sectors", () => {
  const fixture = fixtureById("native-pie-chart");
  const item = { id: "blind-pie", type: "image", box: FULL_BOX, source: { detector: "generic-visual-underlay" } };
  const layer = classifyVisualLayer(item, { textBoxes: [] }, SLIDE_SIZE, { sourceImage: fixture.image });
  assert.equal(layer.diagramUnderstanding.archetype, "pie-chart");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.visualAtomKindCounts["native-pie-segment-candidate"], 3);
  const image = { ...item, source: { ...item.source, layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  assert.equal(shapes.length, 3);
  assert.ok(shapes.every((shape) => shape.type === "freeform"));
  assert.ok(shapes.every((shape) => shape.source?.detector === "visual-chart-native-pie-segment"));
  assert.equal(image.source.objectifiedVisualAtoms, 3);
});

test("metadata-free donut and concentric diagrams remain distinct from pie charts", () => {
  for (const id of ["native-donut-chart", "native-concentric-circles"]) {
    const fixture = fixtureById(id);
    const item = { id, type: "image", box: FULL_BOX, source: { detector: "generic-visual-underlay" } };
    const layer = classifyVisualLayer(item, { textBoxes: [] }, SLIDE_SIZE, { sourceImage: fixture.image });
    assert.notEqual(layer.diagramUnderstanding.archetype, "pie-chart");
  }
});

function fixtureById(id) {
  const fixture = createChartFixtures().find((candidate) => candidate.id === id);
  assert.ok(fixture, `missing fixture ${id}`);
  return fixture;
}
