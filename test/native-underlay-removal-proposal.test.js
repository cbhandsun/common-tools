"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createNativeUnderlayRemovalProposal } = require("../packages/slideclone-worker-adapter/native-underlay-removal-proposal");
const { removeFullSlideResidualImages, nativeOnlyResidualQualityAcceptable } = require("../packages/slideclone-worker-adapter/team-worker");
const { largeRasterEditability } = require("../packages/slideclone-core/team-native-rebuild");
const proposeNativeUnderlayRemoval = createNativeUnderlayRemovalProposal({ largeRasterEditability });
const size = { widthPt: 200, heightPt: 100 };
function underlay() {
  return { id: "regional", box: { x: 5, y: 10, w: 160, h: 70 }, source: {
    semanticSplitOwnsLayer: true, residualCrop: true, detector: "structural-diagram-underlay-crop"
  } };
}
test("joint native candidate removes both residual layers and preserves leaf icons without mutating baseline", () => {
  const leaf = { ...underlay(), id: "leaf", box: { x: 1, y: 1, w: 4, h: 4 } };
  const deck = { slideSize: size, pages: [{ images: [
    { id: "full", box: { x: 0, y: 0, w: 200, h: 100 }, source: { fullSlideResidual: true } }, underlay(), leaf
  ], shapes: [], textBoxes: [] }] };
  const original = structuredClone(deck);
  const legacy = removeFullSlideResidualImages(deck);
  assert.equal(legacy.removed, 1);
  assert.equal(largeRasterEditability(legacy.deck).passed, false);
  const result = removeFullSlideResidualImages(deck, { includeSemanticUnderlays: true });
  assert.equal(result.removed, 2);
  assert.deepEqual(result.deck.pages[0].images, [leaf]);
  assert.equal(largeRasterEditability(result.deck).passed, true);
  assert.deepEqual(deck, original);
  const quality = passed => ({ checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed }],
    metrics: { "pixel-diff-ratio": 0.05, "foreground-missing-ratio": 0.01, "mean-absolute-delta": 5 } });
  assert.equal(nativeOnlyResidualQualityAcceptable({ baselineDeck: deck, candidateDeck: result.deck,
    baselineQuality: quality(true), candidateQuality: quality(false) }), false);
});
test("underlay proposals use the unchanged raster threshold", () => {
  const image = underlay();
  image.box.w = 16; image.box.h = 100;
  assert.equal(proposeNativeUnderlayRemoval(image, size), true);
  image.box.w = 15.99;
  assert.equal(proposeNativeUnderlayRemoval(image, size), false);
});
test("unknown, pictorial and unowned crops do not become removal proposals", () => {
  for (const value of [null, undefined, [], {}, "crop"]) assert.equal(proposeNativeUnderlayRemoval(value, size), false);
  for (const source of [{}, { ...underlay().source, semanticSplitOwnsLayer: false },
    { ...underlay().source, residualCrop: false }, { ...underlay().source, detector: "foreground-graphic-crop" },
    { ...underlay().source, detector: "../diagram-underlay-crop" }, { ...underlay().source, detector: "a".repeat(200) + "-underlay-crop" }]) {
    assert.equal(proposeNativeUnderlayRemoval({ ...underlay(), source }, size), false);
  }
});
test("invalid and extreme dimensions fail closed", () => {
  assert.throws(() => createNativeUnderlayRemovalProposal({ largeRasterEditability: null }), TypeError);
  for (const value of [0, -1, NaN, Infinity, "200", null]) {
    assert.equal(proposeNativeUnderlayRemoval(underlay(), { ...size, widthPt: value }), false);
    assert.equal(proposeNativeUnderlayRemoval({ ...underlay(), box: { ...underlay().box, w: value } }, size), false);
  }
  assert.equal(proposeNativeUnderlayRemoval({ ...underlay(), box: { ...underlay().box, x: Infinity } }, size), false);
  assert.equal(proposeNativeUnderlayRemoval(underlay(), null), false);
});
