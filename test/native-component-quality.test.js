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
  assert.deepEqual(result.metrics, { connectors: 1, minimumUnitCrops: 1, evidencedMinimumUnitCrops: 1, unverifiedMinimumUnitCrops: 0, residualViolations: 0, findings: 0 });
});

test("native component audit reports legacy minimum-unit crops without treating them as evidenced", () => {
  const deck = validDeck();
  deck.pages[0].images.push({ id: "legacy", source: { protectedMinimumUnit: true } });
  const result = auditNativeComponentQuality(deck);
  assert.equal(result.passed, true);
  assert.equal(result.metrics.minimumUnitCrops, 2);
  assert.equal(result.metrics.evidencedMinimumUnitCrops, 1);
  assert.equal(result.metrics.unverifiedMinimumUnitCrops, 1);
});

test("native component audit rejects detached arrow substitutes and incomplete crop evidence", () => {
  const deck = validDeck();
  deck.pages[0].shapes.push({ id: "detached", type: "triangle", style: {}, source: { role: "relationship" } });
  delete deck.pages[0].images[0].source.tightenedPixelBox;
  const result = auditNativeComponentQuality(deck);
  assert.equal(result.passed, false);
  assert.deepEqual(result.findings.map((item) => item.code), ["standalone-relationship-arrow", "crop-tightened-pixel-box-missing"]);
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
