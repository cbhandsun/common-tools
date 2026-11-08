"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { rollbackRegressedPanels } = require("../packages/slideclone-worker-adapter/panel-candidate-rollback");
function fixture() {
  const source = { editable: true, nativeRebuild: true, semanticNativeStructure: true };
  const top = { id: "top", type: "roundRect", box: { x: 10, y: 10, w: 150, h: 80 }, style: { fill: "#FAFAFA" }, source: { ...source, preserveResidualInterior: true } };
  const bottom = { ...structuredClone(top), id: "bottom", box: { x: 10, y: 120, w: 150, h: 70 } };
  const underlay = { ...structuredClone(bottom), id: "underlay", type: "rect", source: { ...source, visualFallbackPrimitive: true, retainedInVisualFallback: true, componentQualityIgnore: true } };
  const unrelated = { id: "unrelated", type: "line", box: { x: 1, y: 1, w: 0, h: 100 }, source: {} };
  const baselineDeck = { pages: [{ shapes: [top, underlay, bottom, unrelated], textBoxes: [{ id: "text", text: "Private user data" }] }] };
  const candidateDeck = structuredClone(baselineDeck);
  candidateDeck.pages[0].shapes = [
    { ...top, style: { fill: "#EEEEEE" } }, { ...bottom, style: { fill: "#EEEEEE" } }, unrelated
  ];
  const region = { pageIndex: 0, box: { x: 30, y: 140, w: 20, h: 10 }, severity: 2,
    kind: "missing", role: "missing-native-component", source: { detector: "missing-native-component-quality" } };
  return { baselineDeck, candidateDeck, baselineQuality: { componentWorst: [region] },
    candidateQuality: { componentReferenceMetrics: [{ ...structuredClone(region), severity: 3 }] } };
}
test("fixed ROI regression restores only intersecting native panels and removed underlays in original order", () => {
  const input = fixture(), before = structuredClone(input);
  const result = rollbackRegressedPanels(input);
  assert.equal(result.rolledBackPanels, 2);
  assert.equal(result.retainedChanges, 1);
  assert.deepEqual(result.deck.pages[0].shapes.map(s => s.id), ["top", "underlay", "bottom", "unrelated"]);
  assert.deepEqual(result.deck.pages[0].shapes[0], input.candidateDeck.pages[0].shapes[0]);
  assert.deepEqual(result.deck.pages[0].shapes.slice(1), input.baselineDeck.pages[0].shapes.slice(1));
  assert.deepEqual(result.deck.pages[0].textBoxes, input.baselineDeck.pages[0].textBoxes);
  assert.deepEqual(input, before);
});
test("unchanged quality, disjoint pages and unowned objects never trigger speculative rollback", () => {
  const input = fixture();
  input.candidateQuality.componentReferenceMetrics[0].severity = 2;
  assert.equal(rollbackRegressedPanels(input).rolledBackPanels, 0);
  input.candidateQuality.componentReferenceMetrics[0].severity = 3;
  input.baselineDeck.pages[0].shapes[2].source = {};
  assert.equal(rollbackRegressedPanels(input).rolledBackPanels, 1);
  const otherPage = structuredClone(input.baselineDeck.pages[0]);
  input.baselineDeck.pages.push(otherPage);
  input.candidateDeck.pages.push(structuredClone(otherPage));
  assert.deepEqual(rollbackRegressedPanels(input).deck.pages[1], otherPage);
});

test("rollback preserves a corrected foreground order even when a different panel regresses", () => {
  const input = fixture();
  const icon = { id: "measured-foreground", type: "freeform", box: { x: 40, y: 30, w: 15, h: 15 }, source: { editable: true } };
  input.baselineDeck.pages[0].shapes.unshift(icon);
  input.candidateDeck.pages[0].shapes.splice(1, 0, structuredClone(icon));
  const result = rollbackRegressedPanels(input);
  assert.deepEqual(result.deck.pages[0].shapes.map(shape => shape.id), ["top", "measured-foreground", "underlay", "bottom", "unrelated"]);
  input.candidateQuality.componentReferenceMetrics[0].severity = 2;
  assert.deepEqual(rollbackRegressedPanels(input).deck.pages[0].shapes.map(shape => shape.id), ["top", "measured-foreground", "bottom", "unrelated"]);
});
test("empty, malformed, missing, ambiguous, extreme and unmatched evidence fails closed without private content", () => {
  const valid = fixture();
  const bad = [null, {}, { ...valid, candidateQuality: {} },
    { ...valid, candidateQuality: { componentReferenceMetrics: [] } },
    { ...valid, candidateQuality: { componentReferenceMetrics: [valid.candidateQuality.componentReferenceMetrics[0], valid.candidateQuality.componentReferenceMetrics[0]] } }
  ];
  for (const input of bad) assert.throws(() => rollbackRegressedPanels(input), error => !error.message.includes("Private user data"));
  for (const field of ["severity", "pageIndex"]) {
    const input = fixture(); input.candidateQuality.componentReferenceMetrics[0][field] = Infinity;
    assert.throws(() => rollbackRegressedPanels(input));
  }
  for (const mutation of [input => input.candidateQuality.componentReferenceMetrics[0].box.x++,
    input => input.baselineDeck.pages[0].shapes.push(input.baselineDeck.pages[0].shapes[0]),
    input => input.candidateDeck.pages[0].shapes.push({ id: "added" }),
    input => { input.candidateDeck.pages[0].shapes = Array(10001).fill({ id: "oversized" }); },
    input => { input.baselineQuality.componentWorst[0].pageIndex = 2; input.candidateQuality.componentReferenceMetrics[0].pageIndex = 2; }]) {
    const input = fixture(); mutation(input); assert.throws(() => rollbackRegressedPanels(input));
  }
});
