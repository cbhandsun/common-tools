"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mayRecoverOcrCropText, ocrRecoveryCandidateScopes, selectNativeRebuildCandidate, selectOcrRecovery, shouldStopOcrRecoverySearch } = require("../packages/slideclone-core/team-native-rebuild");

function rebuilt(recovered, imageRatio = 0) {
  return {
    ocrCropRecovery: { recovered }, nativeComponentQuality: { passed: true },
    deck: { slideSize: { widthPt: 100, heightPt: 100 }, pages: [{
      textBoxes: Array.from({ length: recovered + 1 }, (_, index) => ({ id: `text-${index}` })),
      images: imageRatio ? [{ box: { w: imageRatio * 100, h: 100 }, source: { residualCrop: true } }] : []
    }] }
  };
}

function rebuiltWithImages(recovered, images) {
  const value = rebuilt(recovered);
  value.deck.pages[0].images = images;
  return value;
}

function quality(diff, extra = {}) {
  return { checks: [{ name: "quality-rendered", passed: true }], metrics: {
    "pixel-diff-ratio": diff, "foreground-missing-ratio": 0.02,
    "mean-absolute-delta": 8, "component-regions-attention": 0, ...extra
  } };
}

test("OCR recovery accepts more editable text only when all visual and raster measures hold", () => {
  const baseline = rebuilt(0);
  const candidate = rebuilt(4);
  assert.equal(selectOcrRecovery({ baseline, candidate, baselineQuality: quality(0.1), candidateQuality: quality(0.09) }), true);
  assert.equal(selectOcrRecovery({ baseline, candidate, baselineQuality: quality(0.1), candidateQuality: quality(0.11) }), false);
  assert.equal(selectOcrRecovery({ baseline, candidate, baselineQuality: quality(0.1), candidateQuality: quality(0.09, { "component-regions-attention": 1 }) }), false);
  assert.equal(selectOcrRecovery({ baseline, candidate: rebuilt(0), baselineQuality: quality(0.1), candidateQuality: quality(0.09) }), false);
  assert.equal(selectOcrRecovery({ baseline, candidate: rebuilt(4, 0.5), baselineQuality: quality(0.1), candidateQuality: quality(0.09) }), false);
});

test("OCR recovery allows bounded visual tolerance only for already failed baselines", () => {
  const baseline = rebuilt(0);
  const candidate = rebuilt(4);
  const failedBaseline = { ...quality(0.1), passed: false };
  const failedCandidate = { ...quality(0.103, { "foreground-missing-ratio": 0.035, "component-regions-attention": 1 }), passed: false };

  assert.equal(selectOcrRecovery({ baseline, candidate, baselineQuality: failedBaseline, candidateQuality: failedCandidate }), true);
  assert.equal(selectOcrRecovery({ baseline, candidate, baselineQuality: quality(0.1), candidateQuality: failedCandidate }), false);
  assert.equal(selectOcrRecovery({
    baseline, candidate, baselineQuality: failedBaseline,
    candidateQuality: { ...quality(0.107, { "foreground-missing-ratio": 0.035 }), passed: false }
  }), false);
});

test("OCR recovery can accept bounded visual loss for major raster editability gain", () => {
  const baseline = rebuiltWithImages(0, [
    { box: { w: 100, h: 100 }, source: { fullSlideResidual: true } },
    { box: { w: 20, h: 100 }, source: { detector: "foreground-graphic-crop" } }
  ]);
  const candidate = rebuiltWithImages(12, [
    { box: { w: 2, h: 100 }, source: { detector: "foreground-graphic-crop" } }
  ]);
  const failedBaseline = { ...quality(0.16, { "foreground-missing-ratio": 0.18, "mean-absolute-delta": 15, "component-regions-attention": 50 }), passed: false };
  const failedCandidate = { ...quality(0.20, { "foreground-missing-ratio": 0.325, "mean-absolute-delta": 19, "component-regions-attention": 75 }), passed: false };

  assert.equal(selectOcrRecovery({ baseline, candidate, baselineQuality: failedBaseline, candidateQuality: failedCandidate }), true);
  assert.equal(selectOcrRecovery({
    baseline, candidate, baselineQuality: failedBaseline,
    candidateQuality: { ...quality(0.24, { "foreground-missing-ratio": 0.25, "mean-absolute-delta": 19, "component-regions-attention": 75 }), passed: false }
  }), false);
  assert.equal(selectOcrRecovery({
    baseline, candidate, baselineQuality: failedBaseline,
    candidateQuality: { ...quality(0.20, { "foreground-missing-ratio": 0.335, "mean-absolute-delta": 19, "component-regions-attention": 75 }), passed: false }
  }), false);
});

test("OCR recovery rejects major worst-component regressions even with raster editability gain", () => {
  const baseline = rebuiltWithImages(0, [
    { box: { w: 100, h: 100 }, source: { fullSlideResidual: true } }
  ]);
  const candidate = rebuiltWithImages(12, [
    { box: { w: 2, h: 100 }, source: { detector: "foreground-graphic-crop" } }
  ]);
  const failedBaseline = { ...quality(0.153, { "foreground-missing-ratio": 0.133, "mean-absolute-delta": 12.6, "component-regions-attention": 33, "worst-component-normalized-severity": 1.89 }), passed: false };
  const failedCandidate = { ...quality(0.171, { "foreground-missing-ratio": 0.201, "mean-absolute-delta": 15.3, "component-regions-attention": 47, "worst-component-normalized-severity": 2.84 }), passed: false };

  assert.equal(selectOcrRecovery({ baseline, candidate, baselineQuality: failedBaseline, candidateQuality: failedCandidate }), false);
});

test("OCR recovery search stops after catastrophic rejected visual regressions", () => {
  const baselineQuality = { ...quality(0.135, {
    "foreground-missing-ratio": 0.128,
    "mean-absolute-delta": 11.86,
    "component-regions-attention": 35,
    "worst-component-normalized-severity": 1.44
  }), passed: false };
  const catastrophicCandidate = { ...quality(0.164, {
    "foreground-missing-ratio": 0.193,
    "mean-absolute-delta": 15.37,
    "component-regions-attention": 48,
    "worst-component-normalized-severity": 2.74
  }), passed: false };
  const smallRegression = { ...quality(0.139, {
    "foreground-missing-ratio": 0.141,
    "mean-absolute-delta": 12.1,
    "component-regions-attention": 36,
    "worst-component-normalized-severity": 1.48
  }), passed: false };

  assert.equal(shouldStopOcrRecoverySearch({ baselineQuality, candidateQuality: catastrophicCandidate }), true);
  assert.equal(shouldStopOcrRecoverySearch({ baselineQuality, candidateQuality: smallRegression }), false);
  assert.equal(shouldStopOcrRecoverySearch({ baselineQuality: quality(0.135), candidateQuality: { checks: [], metrics: catastrophicCandidate.metrics } }), false);
});

test("OCR recovery rejects visual loss without major raster editability gain", () => {
  const baseline = rebuiltWithImages(0, [
    { box: { w: 20, h: 100 }, source: { detector: "foreground-graphic-crop" } }
  ]);
  const candidate = rebuiltWithImages(12, [
    { box: { w: 20, h: 100 }, source: { detector: "foreground-graphic-crop" } }
  ]);
  const failedBaseline = { ...quality(0.16, { "foreground-missing-ratio": 0.18 }), passed: false };
  const failedCandidate = { ...quality(0.20, { "foreground-missing-ratio": 0.25 }), passed: false };

  assert.equal(selectOcrRecovery({ baseline, candidate, baselineQuality: failedBaseline, candidateQuality: failedCandidate }), false);
});


test("OCR recovery rejects absent, failed, and non-finite quality evidence", () => {
  const baseline = rebuilt(0);
  const candidate = rebuilt(2);
  assert.equal(selectOcrRecovery({ baseline, candidate, baselineQuality: null, candidateQuality: quality(0.08) }), false);
  assert.equal(selectOcrRecovery({ baseline, candidate, baselineQuality: quality(0.1), candidateQuality: { checks: [{ name: "quality-rendered", passed: false }], metrics: quality(0.08).metrics } }), false);
  assert.equal(selectOcrRecovery({ baseline, candidate, baselineQuality: quality(0.1), candidateQuality: quality(Number.NaN) }), false);
  assert.equal(selectOcrRecovery({ baseline, candidate, baselineQuality: quality(0.1, { "worst-component-normalized-severity": 1 }), candidateQuality: quality(0.08) }), false);
});

test("native rebuild candidate selector is reusable beyond OCR recovery", () => {
  const baseline = rebuilt(0, 0.2);
  const candidate = rebuilt(0, 0.2);
  candidate.deck.pages[0].shapes = [{ type: "rect", box: { x: 0, y: 0, w: 10, h: 10 } }];
  assert.equal(selectNativeRebuildCandidate({
    baseline, candidate, baselineQuality: quality(0.1), candidateQuality: quality(0.1),
    improves: ({ candidate: proposed }) => proposed.deck.pages[0].shapes.length > 0
  }), true);
  assert.equal(selectNativeRebuildCandidate({
    baseline, candidate, baselineQuality: quality(0.1), candidateQuality: quality(0.11),
    improves: ({ candidate: proposed }) => proposed.deck.pages[0].shapes.length > 0
  }), false);
  assert.equal(selectNativeRebuildCandidate({
    baseline, candidate: rebuilt(0, 0.3), baselineQuality: quality(0.1), candidateQuality: quality(0.1),
    improves: () => true
  }), false);
  assert.equal(selectNativeRebuildCandidate({
    baseline, candidate, baselineQuality: quality(0.1), candidateQuality: quality(0.1),
    improves: () => false
  }), false);
});

test("OCR recovery skips decks without a text-dense large foreground crop", () => {
  const value = rebuilt(0);
  value.ocrCropRecovery.sourceLines = 5;
  assert.equal(mayRecoverOcrCropText(value), false);
  value.deck.pages[0].images.push({ box: { w: 10, h: 100 }, source: { detector: "foreground-graphic-crop" } });
  assert.equal(mayRecoverOcrCropText(value), true);
  value.ocrCropRecovery.sourceLines = 4;
  assert.equal(mayRecoverOcrCropText(value), false);
});

test("OCR recovery candidate scopes are bounded and ordered by crop area", () => {
  const value = rebuilt(0);
  value.ocrCropRecovery.sourceLines = 10;
  value.deck.pages[0].images = [0.2, 0.3, 0.1, 0.4].map((ratio, index) => ({
    id: `crop-${index}`, box: { w: ratio * 100, h: 100 }, source: { detector: "foreground-graphic-crop" }
  }));
  assert.deepEqual(ocrRecoveryCandidateScopes(value), [null,
    { pageIndex: 0, cropId: "crop-3" }, { pageIndex: 0, cropId: "crop-1" }]);
  assert.deepEqual(ocrRecoveryCandidateScopes(null), []);
});
