"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { auditNativeComponentQuality } = require("../packages/slideclone-core/native-component-quality");

function validDeck() {
  return {
    meta: { fullSlideResidualOmitted: true },
    pages: [{
      shapes: [{ id: "cycle", type: "arc", style: { fill: "none", strokeWidthPt: 2, lineCap: "round", endArrow: "triangle", endArrowWidth: "medium", endArrowLength: "medium" }, source: { role: "relationship" } }],
      images: [{ id: "icon", source: { protectedMinimumUnit: true, cropEvidenceRequired: true, originalPixelBox: { x: 1, y: 2, w: 30, h: 40 }, coordinateReferenceSizePx: { width: 944, height: 704 }, mappedPixelBox: { x: 1, y: 2, w: 30, h: 40 }, tightenedPixelBox: { x: 3, y: 4, w: 26, h: 35 }, removedNeighborPixels: 12, retainedDetailComponents: 1 } }],
    }],
  };
}

test("native component audit accepts integrated arrows, evidenced crops, and omitted residuals", () => {
  const result = auditNativeComponentQuality(validDeck());
  assert.equal(result.passed, true);
  assert.deepEqual(result.metrics, { connectors: 1, minimumUnitCrops: 1, evidencedMinimumUnitCrops: 1, unverifiedMinimumUnitCrops: 0, residualViolations: 0, ignoredPixelPrimitives: 0, unresolvedSceneComponents: 0, findings: 0 });
});

test('a rejected raster branch cannot become an accepted native candidate by omitting the raster',()=>{
  for(const rejection of [null,{}, {code:'RESIDUAL_PIXEL_OWNERSHIP_REJECTED',pixelOwnership:{passed:false}}]){
    const deck=validDeck();deck.meta.residualBranchRejected=rejection;
    const result=auditNativeComponentQuality(deck);
    assert.equal(result.passed,false);assert.equal(result.metrics.residualViolations,1);
    assert.equal(result.checks.find(c=>c.name==='residual-omission-integrity').passed,false);
    assert.ok(result.findings.some(f=>f.code==='source-residual-ownership-rejected'));
  }
});

test("native component audit reports legacy minimum-unit crops without treating them as evidenced", () => {
  const deck = validDeck();
  deck.pages[0].images.push({ id: "legacy", source: { protectedMinimumUnit: true } });
  const result = auditNativeComponentQuality(deck);
  assert.equal(result.passed, false);
  assert.equal(result.metrics.minimumUnitCrops, 2);
  assert.equal(result.metrics.evidencedMinimumUnitCrops, 1);
  assert.equal(result.metrics.unverifiedMinimumUnitCrops, 1);
  assert.equal(result.checks.find((check) => check.name === "minimum-unit-crops-verified").passed, false);
});

test("native component audit rejects detached arrow substitutes and incomplete crop evidence", () => {
  const deck = validDeck();
  deck.pages[0].shapes.push({ id: "detached", type: "triangle", style: {}, source: { role: "relationship" } });
  delete deck.pages[0].images[0].source.tightenedPixelBox;
  const result = auditNativeComponentQuality(deck);
  assert.equal(result.passed, false);
  assert.deepEqual(result.findings.map((item) => item.code), ["standalone-relationship-arrow", "crop-tightened-pixel-box-missing"]);
});

test("native component audit rejects ignored pixel primitives as semantic native output", () => {
  const deck = validDeck();
  deck.pages[0].shapes.push(
    { id: "native-residual-pixel-1", type: "rect", box: { x: 1, y: 1, w: 1, h: 1 }, source: { componentQualityIgnore: true, detector: "native-residual-primitive-rect" } },
    { id: "text-fidelity-native-run-1-1", type: "rect", box: { x: 3, y: 1, w: 1, h: 1 }, source: { componentQualityIgnore: true, detector: "text-fidelity-native-primitive" } },
    { id: "compacted-pixel", type: "rect", box: { x: 5, y: 1, w: 1, h: 1 }, source: { componentQualityIgnore: true } }
  );
  const result = auditNativeComponentQuality(deck);
  assert.equal(result.passed, false);
  assert.equal(result.metrics.ignoredPixelPrimitives, 3);
  assert.equal(result.checks.find((check) => check.name === "semantic-native-primitive-integrity").passed, false);
  assert.deepEqual(result.findings.filter((item) => item.code === "ignored-pixel-primitive-present").map((item) => item.elementId), ["native-residual-pixel-1", "text-fidelity-native-run-1-1", "compacted-pixel"]);
});

test("native component audit rejects malformed arrow styles and residual contradictions", () => {
  const deck = validDeck();
  deck.pages[0].shapes[0].style = { fill: "#FFFFFF", startArrow: "triangle", endArrow: "triangle" };
  deck.pages[0].images.push({ id: "base", source: { strategy: "full-slide-residual" } });
  const result = auditNativeComponentQuality(deck);
  assert.equal(result.passed, false);
  assert.ok(result.findings.some((item) => item.code === "arrow-line-width-missing"));
  assert.ok(result.findings.some((item) => item.code === "arc-must-have-one-arrow-end"));
  assert.ok(result.findings.some((item) => item.code === "full-slide-residual-present-after-omission"));
});

test("native component audit fails closed for invalid and excessive input", () => {
  assert.throws(() => auditNativeComponentQuality({ pages: [] }), /deck is invalid/u);
  assert.throws(() => auditNativeComponentQuality({ pages: [{ shapes: [null] }] }), /shape/u);
  assert.throws(() => auditNativeComponentQuality({ pages: [{ shapes: Array.from({ length: 10001 }, () => ({})) }] }), /object limit/u);
});
