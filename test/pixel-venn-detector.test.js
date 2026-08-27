"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createChartFixtures, SLIDE_SIZE } = require("../skills/pd-hifi-slideclone/scripts/lib/chart-native-render-golden");
const { classifyVisualLayer } = require("../skills/pd-hifi-slideclone/scripts/lib/layer-classifier");
const { detectPixelVennLobes } = require("../skills/pd-hifi-slideclone/scripts/lib/pixel-venn-detector");
const { createVisualAtomNativeShapes } = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

const FULL_BOX = Object.freeze({ x: 0, y: 0, w: SLIDE_SIZE.widthPt, h: SLIDE_SIZE.heightPt });

test("pixel Venn detector recovers overlapping ellipses without semantic hints", () => {
  const fixture = createChartFixtures().find((item) => item.id === "native-venn-overlap");
  const lobes = detectPixelVennLobes(fixture.image, FULL_BOX, SLIDE_SIZE);
  assert.equal(lobes.length, 2);
  assert.ok(lobes.every((lobe) => lobe.kind === "native-venn-ellipse-candidate"));
  assert.ok(lobes[0].box.x + lobes[0].box.w > lobes[1].box.x);
});

test("pixel Venn detector rejects ordinary side-by-side colored cards", () => {
  const image = { width: 240, height: 140, rgba: Buffer.alloc(240 * 140 * 4, 255) };
  fillRect(image, 20, 35, 82, 70, [47, 128, 237]);
  fillRect(image, 138, 35, 82, 70, [52, 211, 153]);
  assert.deepEqual(detectPixelVennLobes(image, { x: 0, y: 0, w: 240, h: 140 }, { widthPt: 240, heightPt: 140 }), []);
});

test("diagram understanding promotes a metadata-free Venn image to native reconstruction", () => {
  const fixture = createChartFixtures().find((item) => item.id === "native-venn-overlap");
  const item = { id: "blind-venn", type: "fidelity-crop", box: FULL_BOX, source: { detector: "generic-visual-underlay" } };
  const layer = classifyVisualLayer(item, { textBoxes: [] }, SLIDE_SIZE, { sourceImage: fixture.image });
  assert.equal(layer.diagramUnderstanding.archetype, "venn-overlap");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  assert.equal(layer.recommendedAction, "attempt-native-reconstruction");
  assert.equal(layer.diagramUnderstanding.visualAtoms.filter((atom) => atom.source?.detector === "pixel-venn-lobe-recovery").length, 2);
  const image = { id: item.id, box: item.box, source: { ...item.source, layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  assert.deepEqual(shapes.map((shape) => shape.type), ["ellipse", "ellipse", "rect", "rect"]);
  assert.ok(shapes.every((shape) => shape.source?.nativeComponentInstance === true));
});

test("diagram understanding recognizes a metadata-free measured timeline", () => {
  const fixture = createChartFixtures().find((item) => item.id === "native-timeline-roadmap");
  const item = { id: "blind-timeline", type: "fidelity-crop", box: FULL_BOX, source: { detector: "generic-visual-underlay" } };
  const layer = classifyVisualLayer(item, { textBoxes: [] }, SLIDE_SIZE, { sourceImage: fixture.image });
  assert.equal(layer.diagramUnderstanding.archetype, "timeline-roadmap");
  assert.equal(layer.diagramUnderstanding.visualAtoms[0].timelineMilestones.length, 4);
  const image = { id: item.id, box: item.box, source: { ...item.source, layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  assert.equal(shapes.filter((shape) => shape.source?.detector === "visual-relationship-native-timeline-axis").length, 1);
  assert.equal(shapes.filter((shape) => shape.source?.detector === "visual-relationship-native-timeline-milestone").length, 4);
});

test("diagram understanding recognizes a metadata-free measured donut", () => {
  const fixture = createChartFixtures().find((item) => item.id === "native-donut-chart");
  const item = { id: "blind-donut", type: "fidelity-crop", box: FULL_BOX, source: { detector: "generic-visual-underlay" } };
  const layer = classifyVisualLayer(item, { textBoxes: [] }, SLIDE_SIZE, { sourceImage: fixture.image });
  assert.equal(layer.diagramUnderstanding.archetype, "donut-chart");
  assert.equal(layer.diagramUnderstanding.nativeReadiness, "native-rebuild");
  const image = { id: item.id, box: item.box, source: { ...item.source, layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].type, "donut");
  assert.equal(shapes[0].source?.detector, "visual-chart-native-donut");
});

function fillRect(image, x, y, width, height, rgb) {
  for (let yy = y; yy < y + height; yy += 1) {
    for (let xx = x; xx < x + width; xx += 1) {
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}
