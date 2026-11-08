"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { visualAtomNativeShape, nativeGearApproximationShapes } = require("../packages/slideclone-core/scene-plan/visual-atom-native-shapes");
const { createVisualAtomNativeShapes } = require("../packages/slideclone-core/scene-plan/visual-atom-native-reconstruction");
const { createStructuredIllustrationCardVisualAtomShapes } = require("../packages/slideclone-core/archetypes/structured-card-visual-reconstruction");
const { missingNativeVisualAtomShape } = require("../packages/slideclone-worker-adapter/worker-missing-graphics-2");

const portrait = { widthPt: 960, heightPt: 1280 };
const gear = { id: "gear", kind: "native-gear-candidate", nativeCandidate: true,
  box: { x: 110, y: 900, w: 40, h: 40 }, color: "#64748B", density: 0.5 };
function layer(atom = gear) {
  return { id: "layer", source: { detector: "diagram-underlay", layer: {
    layerType: "diagram-zone", recommendedAction: "attempt-native-reconstruction",
    diagramUnderstanding: { archetype: "generic-node-diagram", confidence: 0.9,
      nativeReadiness: "native-rebuild", visualAtoms: [atom] }
  } } };
}
function assertCompleteGear(shapes, atom = gear) {
  assert.equal(shapes.length, 10);
  assert.deepEqual(shapes.find(s => s.source.part === "ring").box, atom.box);
  assert.ok(shapes.every(s => s.box.h > 1 && s.box.w > 1));
  assert.ok(shapes.every(s => s.box.y > atom.box.y - 5 && s.box.x > atom.box.x - 5));
}

test("native gear dispatch preserves lower portrait and far-right wide canvas geometry", () => {
  assertCompleteGear(visualAtomNativeShape(layer(), gear, 0, {}, portrait));
  const wideGear = { ...gear, box: { x: 1400, y: 120, w: 40, h: 40 } };
  assertCompleteGear(visualAtomNativeShape(layer(wideGear), wideGear, 0, {}, { widthPt: 1800, heightPt: 600 }), wideGear);
});

test("visual-atom reconstruction propagates its actual portrait canvas to gear parts", () => {
  assertCompleteGear(createVisualAtomNativeShapes([layer()], null, portrait));
});

test("structured cards propagate the actual canvas to native gear parts", () => {
  const image = layer();
  image.source.detector = "structured-illustration-card-residual-crop";
  image.source.layer.visualAtoms = [gear];
  const cards = [0, 1].map(i => ({ box: { x: 50 + i * 400, y: 850, w: 300, h: 180 },
    source: { detector: "structured-illustration-card-native-background" } }));
  assertCompleteGear(createStructuredIllustrationCardVisualAtomShapes({ images: [image] }, cards, [], portrait));
});

test("worker missing-atom reconstruction uses the same actual canvas", () => {
  assertCompleteGear(missingNativeVisualAtomShape(layer(), gear, 0, {}, portrait));
});

test("unspecified gear canvas preserves the legacy landscape result", () => {
  const atom = { ...gear, box: { x: 110, y: 120, w: 40, h: 40 } };
  const old = visualAtomNativeShape(layer(atom), atom, 0);
  assertCompleteGear(old, atom);
  assert.deepEqual(old, visualAtomNativeShape(layer(atom), atom, 0, {}, { widthPt: 960, heightPt: 540 }));
});

function directGear(slideSize) {
  return nativeGearApproximationShapes({ id: "gear", cx: 130, cy: 920, size: 40,
    fill: "#64748B", stroke: "#334155", source: (part, partBox) => ({ part, partBox }), slideSize });
}

test("gear canvas uses existing bounded numeric normalization and rejects unusable dimensions", () => {
  assertCompleteGear(directGear({ widthPt: "960", heightPt: "1280" }));
  for (const canvas of [null, {}, [], { widthPt: 0, heightPt: 1280 }, { widthPt: 960, heightPt: NaN },
    { widthPt: Infinity, heightPt: 1280 }, { widthPt: 100001, heightPt: 1280 },
    { widthPt: true, heightPt: 1280 }, Object.create(portrait)]) {
    assert.deepEqual(directGear(canvas), []);
  }
  assert.deepEqual(directGear({ get widthPt() { throw new Error("getter executed"); }, heightPt: 1280 }), []);
  const failure = new Error("descriptor inspection failed");
  assert.throws(() => directGear(new Proxy({}, { getOwnPropertyDescriptor() { throw failure; } })), error => error === failure);
});

test("gear clipping uses actual canvas boundaries and keeps the input unchanged", () => {
  const atom = { ...gear, box: { x: 940, y: 1260, w: 40, h: 40 } };
  const before = structuredClone(atom);
  const shapes = visualAtomNativeShape(layer(atom), atom, 0, {}, portrait);
  assert.deepEqual(shapes.find(s => s.source.part === "ring").box, { x: 940, y: 1260, w: 20, h: 20 });
  assert.ok(shapes.every(s => Object.values(s.box).every(Number.isFinite)));
  assert.deepEqual(atom, before);
});

test("gear canvas accepts the existing dimension ceiling without overflowing geometry", () => {
  const shapes = directGear({ widthPt: 100000, heightPt: 100000 });
  assertCompleteGear(shapes);
  assert.ok(shapes.every(s => Object.values(s.box).every(Number.isFinite)));
});
