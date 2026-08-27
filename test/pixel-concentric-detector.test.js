"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createChartFixtures, SLIDE_SIZE } = require("../skills/pd-hifi-slideclone/scripts/lib/chart-native-render-golden");
const { classifyVisualLayer } = require("../skills/pd-hifi-slideclone/scripts/lib/layer-classifier");
const { detectPixelConcentricCircles } = require("../skills/pd-hifi-slideclone/scripts/lib/pixel-concentric-detector");
const { createVisualAtomNativeShapes } = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

const FULL_BOX = Object.freeze({ x: 0, y: 0, w: SLIDE_SIZE.widthPt, h: SLIDE_SIZE.heightPt });

test("pixel concentric detector recovers centered nested color layers without semantic hints", () => {
  const fixture = fixtureById("native-concentric-circles");
  const circles = detectPixelConcentricCircles(fixture.image, FULL_BOX, SLIDE_SIZE);
  assert.equal(circles.length, 3);
  assert.deepEqual(circles.map((circle) => Math.round(circle.box.w)), [248, 176, 104]);
  assert.ok(circles.every((circle) => circle.source.detector === "pixel-concentric-circle-recovery"));
});

test("pixel concentric detector rejects a donut and overlapping Venn circles", () => {
  for (const id of ["native-donut-chart", "native-venn-overlap"]) {
    assert.deepEqual(detectPixelConcentricCircles(fixtureById(id).image, FULL_BOX, SLIDE_SIZE), []);
  }
});

test("diagram understanding promotes metadata-free concentric circles to one native component", () => {
  const fixture = fixtureById("native-concentric-circles");
  const item = {
    id: "metadata-free-concentric",
    type: "image",
    box: FULL_BOX,
    source: { detector: "generic-visual-underlay" }
  };
  const layer = classifyVisualLayer(item, { textBoxes: [] }, SLIDE_SIZE, { sourceImage: fixture.image });
  assert.equal(layer.diagramUnderstanding.archetype, "concentric-circles");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.diagramUnderstanding.visualAtoms.length, 3);
  const image = { ...item, source: { ...item.source, layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  assert.equal(shapes.length, 3);
  assert.ok(shapes.every((shape) => shape.type === "ellipse"));
  assert.ok(shapes.every((shape) => shape.source?.detector === "visual-relationship-native-concentric-layer"));
});

function fixtureById(id) {
  const fixture = createChartFixtures().find((candidate) => candidate.id === id);
  assert.ok(fixture, `missing fixture ${id}`);
  return fixture;
}
