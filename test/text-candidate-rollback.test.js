"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { rollbackRegressedNativeTexts } = require("../packages/slideclone-worker-adapter/text-candidate-rollback");
const deck = () => ({ pages: [{ textBoxes: ["good", "bad"].map(id => ({ id, text: id, font: { weight: "bold" }, source: { editable: true } })), shapes: [{ id: "container" }] }] });
const quality = severity => ({ componentLocalMetrics: ["good", "bad"].map((id, i) => ({ id, kind: "text", role: "text", pageIndex: 0, severity: severity[i] })) });
function request() {
  const baselineDeck = deck(), candidateDeck = deck();
  for (const text of candidateDeck.pages[0].textBoxes) text.font.weight = "regular";
  return { baselineDeck, candidateDeck, baselineQuality: quality([1, 1]), candidateQuality: quality([0.8, 1.2]) };
}
test("rollback restores whole regressed native text objects and preserves unrelated improvements", () => {
  const input = request(), before = structuredClone(input);
  const result = rollbackRegressedNativeTexts(input);
  assert.equal(result.rolledBackTextBoxes, 1);
  assert.equal(result.deck.pages[0].textBoxes[0].font.weight, "regular");
  assert.deepEqual(result.deck.pages[0].textBoxes[1], input.baselineDeck.pages[0].textBoxes[1]);
  assert.deepEqual(result.deck.pages[0].shapes, input.candidateDeck.pages[0].shapes);
  assert.deepEqual(input, before);
});
test("rollback rejects malformed, incomplete, duplicate and extreme evidence without guessing", () => {
  for (const severity of [NaN, Infinity, -1, 11]) {
    const input = request(); input.candidateQuality.componentLocalMetrics[0].severity = severity;
    assert.throws(() => rollbackRegressedNativeTexts(input));
  }
  const missing = request(); missing.candidateQuality.componentLocalMetrics = [];
  assert.throws(() => rollbackRegressedNativeTexts(missing), /incomplete/u);
  const duplicate = request(); duplicate.candidateQuality.componentLocalMetrics.push(duplicate.candidateQuality.componentLocalMetrics[0]);
  assert.throws(() => rollbackRegressedNativeTexts(duplicate), /ambiguous/u);
  const duplicateId = request(); duplicateId.baselineDeck.pages[0].textBoxes.push(duplicateId.baselineDeck.pages[0].textBoxes[0]);
  assert.throws(() => rollbackRegressedNativeTexts(duplicateId), /ids/u);
  for (const input of [null, {}, { ...request(), candidateDeck: { pages: new Array(21) } },
    { ...request(), candidateQuality: { componentLocalMetrics: new Array(5001) } }]) assert.throws(() => rollbackRegressedNativeTexts(input));
});
test("rollback uses page-aware identity and never replaces changed wording with old text", () => {
  const input = request(); input.candidateDeck.pages[0].textBoxes[1].text = "Corrected wording";
  assert.equal(rollbackRegressedNativeTexts(input).rolledBackTextBoxes, 0);
  const empty = { baselineDeck: { pages: [{ textBoxes: [] }] }, candidateDeck: { pages: [{ textBoxes: [] }] },
    baselineQuality: quality([]), candidateQuality: quality([]) };
  empty.baselineQuality.componentLocalMetrics = []; empty.candidateQuality.componentLocalMetrics = [];
  assert.equal(rollbackRegressedNativeTexts(empty).rolledBackTextBoxes, 0);
});

test("strict pixel rollback restores increased missing ink even when aggregate severity improves", () => {
  const input = request(); input.strictMetrics = true;
  for (const row of input.baselineQuality.componentLocalMetrics) Object.assign(row,{pixelDiffRatio:0.2,foregroundMissingRatio:0.05});
  for (const row of input.candidateQuality.componentLocalMetrics) Object.assign(row,{severity:0.8,pixelDiffRatio:0.18,foregroundMissingRatio:0.04});
  input.candidateQuality.componentLocalMetrics[1].foregroundMissingRatio = 0.051;
  const result=rollbackRegressedNativeTexts(input);
  assert.equal(result.rolledBackTextBoxes,1);
  assert.equal(result.deck.pages[0].textBoxes[0].font.weight,"regular");
  assert.deepEqual(result.deck.pages[0].textBoxes[1],input.baselineDeck.pages[0].textBoxes[1]);
  for (const value of [undefined,null,-1,1.1,NaN,Infinity,"0.1"]) {
    input.candidateQuality.componentLocalMetrics[0].pixelDiffRatio=value;
    assert.throws(()=>rollbackRegressedNativeTexts(input),/pixel evidence/u);
  }
  assert.throws(()=>rollbackRegressedNativeTexts({...request(),strictMetrics:"true"}),/policy/u);
});
