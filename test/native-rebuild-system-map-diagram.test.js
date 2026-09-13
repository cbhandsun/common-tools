"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createSystemMapDiagramFactory
} = require("../packages/slideclone-native-engine/scripts/lib/native-rebuild-system-map-diagram");

const DEFAULT_SLIDE = Object.freeze({ widthPt: 960, heightPt: 540 });

function createDependencies(overrides = {}) {
  return {
    DEFAULT_SLIDE,
    boxCenterInside: () => false,
    clampPtBoxToSlide: (box) => box,
    compactDenseTopologyLineFamilies: (shapes) => shapes,
    cropPng: () => null,
    ensureDir: () => {},
    inferSystemMapDiagramLayout: () => ({
      shapes: [{
        id: "system-map-shape",
        type: "rect",
        box: { x: 10, y: 10, w: 20, h: 20 },
        source: { detector: "system-map-native-network-edge" }
      }],
      textBoxes: [{
        id: "system-map-label",
        text: "物流域",
        box: { x: 10, y: 35, w: 40, h: 10 }
      }]
    }),
    materializeFidelityCrop: (input) => ({
      id: input.id,
      box: input.cropBox,
      source: input.source
    }),
    ptToPxBox: (box) => box,
    pxToPtBox: (box) => box,
    safeIdentifier: (value) => String(value).replace(/[^a-z0-9-]+/gi, "-"),
    writePng: () => {},
    ...overrides
  };
}

test("system map diagram factory fails closed when dependencies are missing", () => {
  assert.throws(
    () => createSystemMapDiagramFactory({ ...createDependencies(), materializeFidelityCrop: null }),
    /system map dependency materializeFidelityCrop is required/
  );
});

test("system map diagram factory returns empty objects when no target matches", () => {
  const { createSystemMapDiagramObjects } = createSystemMapDiagramFactory(createDependencies());
  const result = createSystemMapDiagramObjects([{
    id: "image-1",
    box: { x: 0, y: 0, w: 100, h: 80 },
    source: { detector: "photo" }
  }], [{ text: "unrelated", box: { x: 1, y: 1, w: 10, h: 8 } }]);
  assert.deepEqual(result, { shapes: [], textBoxes: [], images: [] });
});

test("system map diagram factory composes native objects for matching system map targets", () => {
  const { createSystemMapDiagramObjects } = createSystemMapDiagramFactory(createDependencies());
  const image = {
    id: "system-map-source",
    box: { x: 0, y: 0, w: 820, h: 330 },
    source: { detector: "line-diagram" }
  };
  const result = createSystemMapDiagramObjects([image], [
    { text: "产品版图", box: { x: 10, y: 10, w: 60, h: 20 } },
    { text: "数字化产品大脑", box: { x: 90, y: 10, w: 120, h: 20 } }
  ]);
  assert.equal(result.shapes.length, 1);
  assert.equal(result.textBoxes.length, 1);
  assert.equal(result.images.length, 0);
  assert.equal(image.source.systemMapDiagramObjectified, true);
  assert.equal(image.source.objectifiedSystemMapShapes, 1);
});

test("system map diagram factory can preserve the dense network as a fidelity unit", () => {
  const { createSystemMapDiagramObjects } = createSystemMapDiagramFactory(createDependencies());
  const result = createSystemMapDiagramObjects([{
    id: "system-map-source",
    box: { x: 0, y: 0, w: 820, h: 330 },
    source: { detector: "graphic-underlay" }
  }], [
    { text: "System Map", box: { x: 10, y: 10, w: 60, h: 20 } },
    { text: "产品大脑", box: { x: 90, y: 10, w: 80, h: 20 } }
  ], DEFAULT_SLIDE, {
    preserveDenseNetworkCrop: true,
    sourceImage: { width: 100, height: 100, rgba: new Uint8Array(40000) },
    assetDir: "assets",
    irDir: "ir",
    deckName: "demo",
    pageIndex: 0
  });
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].source.detector, "system-map-network-fidelity-crop");
  assert.equal(result.images[0].source.protectedMinimumUnit, true);
});
