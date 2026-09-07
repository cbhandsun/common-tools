"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPageImageFinalizer } = require("../packages/slideclone-core/page-image-finalizer");

function finalizer(overrides = {}) {
  return createPageImageFinalizer({
    normalizeImageLayerMetadata: (image) => image,
    shouldPreserveTwoPanelChaosIllustrationCrop: () => false,
    markTwoPanelChaosIllustrationPreserved: (image) => image,
    ...overrides
  }).normalizePageImageMetadata;
}

test("page finalizer normalizes empty pages in place and validates required operations", () => {
  const normalize = finalizer();
  const page = {};
  assert.equal(normalize(page), page);
  assert.deepEqual(page, { images: [] });
  assert.equal(normalize(null), null);
  assert.equal(normalize(42), 42);
  for (const operations of [undefined, {}, { normalizeImageLayerMetadata: true }]) {
    assert.throws(() => createPageImageFinalizer(operations), TypeError);
  }
});

test("required fidelity crops remove only associated native overlays and stale template claims", () => {
  const source = {
    detector: "document-fidelity-crop", componentTemplateGroupApplied: true,
    componentTemplateCropReplacementReason: "requires-fidelity-crop", componentTemplateNativeShapes: 2,
    componentRenderStrategy: { mode: "plugin-component-template" }
  };
  const image = { id: "document-split-1", type: "fidelity-crop", source };
  const ownPart = { source: { detector: "plugin-component-template-native-shape", layerSourceId: "document" } };
  const unrelated = { source: { detector: "plugin-component-template-native-shape", layerSourceId: "other" } };
  const ordinary = { source: { layerSourceId: "document" } };
  const page = { images: [image], shapes: [ownPart, unrelated, ordinary], textBoxes: [ownPart, unrelated] };
  const normalize = finalizer();
  normalize(page);
  assert.deepEqual(page.shapes, [unrelated, ordinary]);
  assert.deepEqual(page.textBoxes, [unrelated]);
  assert.equal(page.images[0].source.componentRenderStrategy.mode, "preserve-local-crop");
  assert.equal(page.images[0].source.componentTemplateGroupApplied, undefined);
  assert.equal(source.componentTemplateGroupApplied, true, "input image source remains unchanged");
  const once = structuredClone(page);
  normalize(page);
  assert.deepEqual(page, once, "cache read normalization is idempotent");
});

test("verified template replacements and editable or full-slide images retain their strategy", () => {
  const images = [
    { source: { editable: true } },
    { type: "fidelity-crop", source: { componentTemplateGroupApplied: true, componentTemplateCropReplacedByNative: true } },
    { type: "full-slide-raster", source: { detector: "fidelity-document-crop" } },
    { type: "fidelity-crop", source: { componentRenderStrategy: { mode: "verified-native" } } }
  ];
  const page = { images };
  finalizer()(page);
  page.images.forEach((image, index) => assert.equal(image, images[index]));
});

test("special preservation runs after image classification and returns its domain result", () => {
  const calls = [];
  const normalize = finalizer({
    normalizeImageLayerMetadata: (image) => { calls.push("classify"); return { ...image, classified: true }; },
    shouldPreserveTwoPanelChaosIllustrationCrop: (image) => { assert.equal(image.classified, true); calls.push("select"); return true; },
    markTwoPanelChaosIllustrationPreserved: (image) => { calls.push("preserve"); return { ...image, preserved: true }; }
  });
  const page = { images: [{ source: {} }] };
  normalize(page);
  assert.deepEqual(calls, ["classify", "select", "preserve"]);
  assert.equal(page.images[0].preserved, true);
});

test("domain operation failure propagates without replacing the page image list", () => {
  const failure = new Error("synthetic domain failure");
  const images = [{ source: {} }];
  const page = { images };
  assert.throws(() => finalizer({ normalizeImageLayerMetadata: () => { throw failure; } })(page), (error) => error === failure);
  assert.equal(page.images, images);
});

test("overlay association treats special property names as exact identifiers", () => {
  const page = {
    images: [{ id: "__proto__", type: "fidelity-crop", source: { componentTemplateGroupApplied: true, componentTemplateCropReplacementReason: "source-crop" } }],
    shapes: [{ source: { componentTemplatePart: true, layerSourceId: "__proto__" } }, { source: { componentTemplatePart: true, layerSourceId: "constructor" } }]
  };
  finalizer()(page);
  assert.equal(page.shapes.length, 1);
  assert.equal(page.shapes[0].source.layerSourceId, "constructor");
  assert.equal({}.componentTemplatePart, undefined);
});

test("many unrelated native objects survive overlay suppression in source order", () => {
  const shapes = Array.from({ length: 10000 }, (_, index) => ({ id: index, source: { componentTemplatePart: true, layerSourceId: `layer-${index}` } }));
  const page = {
    images: [{ id: "layer-5000", type: "fidelity-crop", source: { componentTemplateGroupApplied: true, componentTemplateCropReplacementReason: "source-crop" } }],
    shapes
  };
  finalizer()(page);
  assert.equal(page.shapes.length, 9999);
  assert.deepEqual(page.shapes, shapes.filter((shape) => shape.id !== 5000));
});
