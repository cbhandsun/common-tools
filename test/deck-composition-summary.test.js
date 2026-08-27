"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  summarizeDeckComposition,
  summarizeReconstructionQuality
} = require("../skills/pd-hifi-slideclone/scripts/lib/deck-composition-summary");

const classifiers = Object.freeze({
  classifyEditableExpressionForm: (_item, collection) => `editable-${collection}`,
  classifyImageExpressionForm: () => "image-form",
  classifyImageExpressionSubtype: () => "image-subtype",
  recommendExpressionHandling: () => "preserve"
});

test("deck composition summary separates native objects and fidelity crops", () => {
  const summary = summarizeDeckComposition({
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      pageIndex: 0,
      shapes: [{ id: "shape", source: {} }],
      textBoxes: [{ id: "text" }],
      images: [
        { id: "native-image", source: { editable: true, detector: "native-image" } },
        { id: "crop", box: { x: 0, y: 0, w: 40, h: 40 }, source: { editable: false, detector: "residual-crop" } }
      ]
    }]
  }, classifiers);
  assert.equal(summary.pages, 1);
  assert.equal(summary.editableObjects, 3);
  assert.equal(summary.localFidelityCrops, 1);
  assert.equal(summary.detectorCounts["residual-crop"], 1);
  assert.equal(summary.reconstructionQuality.residualAreaRatio, 0.16);
  assert.equal(summary.reconstructionQuality.nativeObjectCount, 2);
});

test("deck composition summary sanitizes count keys and bounds external dependencies", () => {
  const summary = summarizeDeckComposition({ pages: [{ images: [{ source: { detector: "bad\u0000key" } }] }] }, classifiers);
  assert.equal(summary.detectorCounts.badkey, 1);
  assert.throws(() => summarizeDeckComposition({}, {}), /classifier/);
  assert.throws(() => summarizeDeckComposition({ pages: Array.from({ length: 10001 }, () => ({})) }, classifiers), /10000 pages/);
});

test("reconstruction summary handles empty and malformed metric input safely", () => {
  assert.deepEqual(summarizeReconstructionQuality([]), {
    residualAreaRatio: 0,
    residualCount: 0,
    nativeObjectCount: 0,
    largestResidualAreaRatio: 0
  });
  assert.deepEqual(summarizeReconstructionQuality([{ slideAreaPt2: 100, residualAreaPt2: 25, residualCount: -1, nativeObjectCount: "2" }]), {
    residualAreaRatio: 0.25,
    residualCount: 0,
    nativeObjectCount: 2,
    largestResidualAreaRatio: 0
  });
});
