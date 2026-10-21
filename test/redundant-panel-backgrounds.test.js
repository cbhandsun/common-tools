"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { planRedundantPanelBackgrounds } = require("../packages/slideclone-worker-adapter/redundant-panel-backgrounds");
const { fitDeckLightCardGeometry } = require("../packages/slideclone-worker-adapter/team-worker");

const slideSize = { widthPt: 300, heightPt: 200 };
function fixture() {
  const fallback = { id: "fallback", type: "rect", box: { x: 20, y: 30, w: 240, h: 130 }, style: { fill: "#EEEEEE", stroke: "none", strokeWidthPt: 0 },
    source: { editable: true, nativeRebuild: true, semanticNativeStructure: true, pageImage: "assets/source.png", visualFallbackPrimitive: true, retainedInVisualFallback: true, componentQualityIgnore: true } };
  const owner = { id: "panel", type: "roundRect", box: { x: 20, y: 30, w: 240, h: 130 }, style: { fill: "#F0F0F0" },
    source: { editable: true, nativeRebuild: true, semanticNativeStructure: true, pageImage: "assets/source.png", preserveResidualInterior: true,
      finalLightPanelSourceGeometryFit: { provider: "worker-source-light-panel-transition-v1", fittedEdges: 4 } } };
  return { fallback, owner };
}

test("matching source-fitted semantic ownership creates a bounded nonmutating deletion plan", () => {
  const { fallback, owner } = fixture(), input = [fallback, owner], before = structuredClone(input);
  assert.deepEqual(planRedundantPanelBackgrounds(input, slideSize), [{ removedId: "fallback", ownerId: "panel" }]);
  assert.deepEqual(input, before);
  const deck = { slideSize, pages: [{ shapes: input, textBoxes: [] }] };
  const fitted = fitDeckLightCardGeometry(deck);
  assert.equal(fitted.removedBackgrounds, 1);
  assert.equal(fitted.changedShapes, 1);
  assert.deepEqual(fitted.changedComponentKeys, ["0:panel"]);
  assert.deepEqual(fitted.deck.pages[0].shapes, [owner]);
  assert.deepEqual(deck.pages[0].shapes, before);
});

test("missing evidence, different source, unsafe asset, colors, opacity, geometry and ordering preserve backgrounds", () => {
  const { fallback, owner } = fixture();
  for (const changed of [
    { ...owner, source: { ...owner.source, finalLightPanelSourceGeometryFit: undefined } },
    { ...owner, source: { ...owner.source, pageImage: "assets/other.png" } },
    { ...owner, source: { ...owner.source, pageImage: "assets/../source.png" } },
    { ...owner, style: { fill: "#C0C0C0" } },
    { ...owner, style: { fill: "#F0F0F0", opacity: 0.5 } },
    { ...owner, box: { ...owner.box, x: 28 } },
    { ...owner, box: { ...owner.box, w: 230 } },
    { ...owner, hidden: true },
    { ...owner, box: { ...owner.box, x: NaN } }
  ]) assert.deepEqual(planRedundantPanelBackgrounds([fallback, changed], slideSize), []);
  for (const changed of [
    { ...fallback, source: { ...fallback.source, visualFallbackPrimitive: false } },
    { ...fallback, style: { ...fallback.style, stroke: "#000000" } },
    { ...fallback, style: { ...fallback.style, fill: "url(secret)" } },
    { ...fallback, style: { ...fallback.style, opacity: 0.5 } },
    { ...fallback, type: "line" }
  ]) assert.deepEqual(planRedundantPanelBackgrounds([changed, owner], slideSize), []);
  assert.deepEqual(planRedundantPanelBackgrounds([owner, fallback], slideSize), []);
});

test("ambiguous, referenced, duplicate, malformed, empty and excessive inputs fail closed", () => {
  const { fallback, owner } = fixture();
  for (const input of [null, {}, [], [null], [fallback, owner, { ...owner, id: "second" }], [fallback, owner, { ...fallback }], Array(10001).fill(fallback)]) {
    assert.deepEqual(planRedundantPanelBackgrounds(input, slideSize), []);
  }
  for (const reference of [{ fromId: "fallback" }, { to: "fallback" }, { source: { sourceShapeId: "fallback" } }]) {
    assert.deepEqual(planRedundantPanelBackgrounds([fallback, owner, reference], slideSize), []);
  }
  assert.deepEqual(planRedundantPanelBackgrounds([fallback, owner], {}), []);
  assert.deepEqual(planRedundantPanelBackgrounds([fallback, owner], slideSize, [{ source: { sourceShapeId: "fallback" } }]), []);
  assert.deepEqual(planRedundantPanelBackgrounds([fallback, owner], slideSize, null), []);
  assert.deepEqual(planRedundantPanelBackgrounds([fallback, owner, { id: "unrelated" }, { id: "unrelated" }], slideSize), [{ removedId: "fallback", ownerId: "panel" }]);
});
