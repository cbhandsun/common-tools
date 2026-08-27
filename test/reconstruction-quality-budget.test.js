"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  evaluateDeckReconstructionBudget,
  evaluatePageReconstructionBudget,
  isProtectedResidualImage,
  measurePageReconstructionQuality,
  unionArea
} = require("../skills/pd-hifi-slideclone/scripts/lib/reconstruction-quality-budget");

test("quality budget measures native objects and de-duplicates overlapping residual area", () => {
  const page = {
    textBoxes: [{ id: "title" }],
    shapes: [{ id: "shape" }],
    images: [
      { box: { x: 0, y: 0, w: 50, h: 50 }, source: { detector: "residual-crop" } },
      { box: { x: 25, y: 0, w: 50, h: 50 }, source: { editable: false } }
    ]
  };
  const metrics = measurePageReconstructionQuality(page, { widthPt: 100, heightPt: 100 });
  assert.equal(metrics.residualAreaPt2, 3750);
  assert.equal(metrics.residualAreaRatio, 0.375);
  assert.equal(metrics.nativeObjectCount, 2);
  assert.equal(unionArea([]), 0);
});

test("quality policies make editable, hybrid, and fidelity tradeoffs explicit", () => {
  const page = { images: [{ box: { x: 0, y: 0, w: 90, h: 90 }, source: { editable: false } }] };
  const slide = { widthPt: 100, heightPt: 100 };
  const editable = evaluatePageReconstructionBudget(page, slide, { policy: "editable-first" });
  assert.equal(editable.passed, false);
  assert.ok(editable.reasonCodes.includes("quality.residual-area-exceeded"));
  assert.equal(evaluatePageReconstructionBudget(page, slide, { policy: "fidelity-first" }).passed, true);
  assert.equal(evaluatePageReconstructionBudget(page, slide, { policy: "unknown" }).policy, "hybrid");
});

test("quality budget reports protected minimum units but gates only actionable residuals", () => {
  const protectedImage = {
    box: { x: 0, y: 0, w: 90, h: 90 },
    source: {
      editable: false,
      intentionalMinimumUnitCrop: true,
      protectedMinimumUnit: true,
      recommendedAction: "preserve-local-crop",
      graphicExpressionPolicy: { kind: "fidelity-crop" },
      componentRenderStrategy: { expressionPolicy: {
        kind: "fidelity-crop",
        minimumUnitPolicy: "preserve-as-single-crop",
        unitDisposition: "intentional-visual-crop",
        allowNativeRebuild: false,
        protectCrop: true
      } }
    }
  };
  const page = { images: [protectedImage], textBoxes: [{ id: "title" }] };
  const result = evaluatePageReconstructionBudget(page, { widthPt: 100, heightPt: 100 });
  assert.equal(result.passed, true);
  assert.equal(result.metrics.residualAreaRatio, 0.81);
  assert.equal(result.metrics.protectedResidualAreaRatio, 0.81);
  assert.equal(result.metrics.actionableResidualAreaRatio, 0);
  assert.equal(result.metrics.largestActionableResidualAreaRatio, 0);
  assert.equal(isProtectedResidualImage(protectedImage), true);
});

test("quality budget fails closed when protected-crop evidence is incomplete or inconsistent", () => {
  const base = {
    editable: false,
    intentionalMinimumUnitCrop: true,
    protectedMinimumUnit: true,
    recommendedAction: "preserve-local-crop",
    graphicExpressionPolicy: { kind: "fidelity-crop" },
    componentRenderStrategy: { expressionPolicy: {
      kind: "fidelity-crop",
      minimumUnitPolicy: "preserve-as-single-crop",
      unitDisposition: "intentional-visual-crop",
      allowNativeRebuild: false,
      protectCrop: true
    } }
  };
  const variants = [
    { ...base, protectedMinimumUnit: false },
    { ...base, recommendedAction: "delete-source" },
    { ...base, graphicExpressionPolicy: { kind: "native-shape" } },
    { ...base, componentRenderStrategy: { expressionPolicy: { ...base.componentRenderStrategy.expressionPolicy, protectCrop: false } } }
  ];
  for (const source of variants) {
    const page = { images: [{ box: { x: 0, y: 0, w: 90, h: 90 }, source }], shapes: [{ id: "native" }] };
    assert.equal(isProtectedResidualImage(page.images[0]), false);
    assert.equal(evaluatePageReconstructionBudget(page, { widthPt: 100, heightPt: 100 }).passed, false);
  }
});

test("quality budget rejects invalid canvas boundaries and ignores malformed crops", () => {
  assert.throws(() => measurePageReconstructionQuality({}, { widthPt: 0, heightPt: 100 }), /slideSize/);
  const metrics = measurePageReconstructionQuality({ images: [{ box: { x: 0, y: 0, w: Infinity, h: 4 }, source: { editable: false } }] }, { widthPt: 100, heightPt: 100 });
  assert.equal(metrics.residualAreaPt2, 0);
  assert.equal(metrics.residualCount, 1);
});

test("deck quality budget honors page policies and reports bounded failure evidence", () => {
  const result = evaluateDeckReconstructionBudget({
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [
      {
        pageIndex: 4,
        reconstruction: { qualityBudget: { policy: "fidelity-first" } },
        images: [{ box: { x: 0, y: 0, w: 90, h: 90 }, source: { editable: false } }]
      },
      { pageIndex: 5, images: [], shapes: [] }
    ]
  });
  assert.equal(result.passed, false);
  assert.equal(result.failedPageCount, 1);
  assert.equal(result.pages[0].passed, true);
  assert.deepEqual(result.pages[1].reasonCodes, ["quality.native-object-count-low"]);
  assert.equal(result.reasonCounts["quality.native-object-count-low"], 1);
});

test("deck quality budget applies strict overrides without trusting stored pass state", () => {
  const result = evaluateDeckReconstructionBudget({
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      pageIndex: 0,
      reconstruction: { qualityBudget: { policy: "fidelity-first", passed: true } },
      images: [{ box: { x: 0, y: 0, w: 60, h: 60 }, source: { editable: false } }],
      shapes: [{ id: "native" }]
    }]
  }, { policy: "editable-first", maxResidualAreaRatio: 0.2 });
  assert.equal(result.passed, false);
  assert.equal(result.policyOverride, "editable-first");
  assert.equal(result.pages[0].thresholds.maxResidualAreaRatio, 0.2);
  assert.ok(result.pages[0].reasonCodes.includes("quality.residual-area-exceeded"));
});

test("deck quality budget rejects empty, malformed, and extreme external options", () => {
  assert.throws(() => evaluateDeckReconstructionBudget({ pages: [] }), /1 to 10000 pages/);
  const ir = { slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, shapes: [{ id: "x" }] }] };
  for (const policy of ["", "unknown", null]) assert.throws(() => evaluateDeckReconstructionBudget(ir, { policy }), /policy/);
  for (const value of [-0.1, 1.1, Infinity, "bad"]) {
    assert.throws(() => evaluateDeckReconstructionBudget(ir, { maxResidualAreaRatio: value }), /maxResidualAreaRatio/);
  }
  assert.throws(() => evaluateDeckReconstructionBudget(ir, { minNativeObjectCount: 100001 }), /minNativeObjectCount/);
});
