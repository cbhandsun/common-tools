"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { validateDeckIrTree } = require("../packages/slideclone-core/deck-ir-tree");
const { compactTeamComponentEvidence } = require("../packages/slideclone-core/team-component-evidence");

function nested(depth) {
  let value = { terminal: "private-learning-data" };
  for (let index = 0; index < depth; index += 1) value = { child: value };
  return value;
}

function deckWithAssets(assets) {
  return {
    pages: [{
      images: [{
        id: "component-image",
        box: { x: 12, y: 18, w: 240, h: 120 },
        source: { componentLocalAssets: assets }
      }]
    }]
  };
}

test("component evidence removes nested matcher metadata while preserving compact references and geometry", () => {
  const geometry = { x: 12, y: 18, w: 240, h: 120 };
  const deck = deckWithAssets([{
    id: "asset-1",
    provider: "officeplus",
    assetKind: "presentation-template",
    matchScore: 88,
    selfFidelityPromoted: true,
    suggestedUse: "editable-template",
    path: "C:\\private\\component.pptx",
    learningSummary: nested(17),
    recommendedComponentGroups: [{ id: "private-group", geometry: nested(17) }]
  }]);

  compactTeamComponentEvidence(deck);
  const published = deck.pages[0].images[0];
  assert.deepEqual(published.box, geometry);
  assert.deepEqual(published.source.componentLocalAssets, [{
    id: "asset-1",
    provider: "officeplus",
    assetKind: "presentation-template",
    matchScore: 88,
    selfFidelityPromoted: true,
    suggestedUse: "editable-template"
  }]);
  const serialized = JSON.stringify(deck);
  assert.equal(serialized.includes("private-learning-data"), false);
  assert.equal(serialized.includes("private-group"), false);
  assert.equal(serialized.includes("component.pptx"), false);
  assert.doesNotThrow(() => validateDeckIrTree(deck));
});

test("component evidence handles empty local asset lists", () => {
  const deck = deckWithAssets([]);
  assert.equal(compactTeamComponentEvidence(deck), deck);
  assert.deepEqual(deck.pages[0].images[0].source.componentLocalAssets, []);
  assert.doesNotThrow(() => validateDeckIrTree(deck));
});

test("component evidence rejects non-array, oversized, and accessor-backed assets without invoking getters", () => {
  assert.throws(() => compactTeamComponentEvidence(deckWithAssets({})), /assets are invalid/);
  const tooManyAssets = Array.from({ length: 101 }, () => ({}));
  assert.throws(() => compactTeamComponentEvidence(deckWithAssets(tooManyAssets)), /assets are invalid/);
  let getterCalled = false;
  const asset = {};
  Object.defineProperty(asset, "id", { enumerable: true, get() { getterCalled = true; return "must-not-read"; } });
  assert.throws(() => compactTeamComponentEvidence(deckWithAssets([asset])), /accessors are invalid/);
  assert.equal(getterCalled, false);
});
