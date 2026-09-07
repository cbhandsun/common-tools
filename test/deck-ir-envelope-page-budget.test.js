"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {validateDeckIrEnvelope} = require("../packages/slideclone-core/deck-ir-tree");

const makeDeck = (pages, metadata = {}) => ({
  version: "1.0",
  slideSize: {widthPt: 960, heightPt: 540},
  pages,
  ...metadata
});
const pageWithNodes = (count) => ({nodes: Array(count).fill(null)});

test("deck IR envelopes apply the existing node budget independently to each page", () => {
  const normal = makeDeck([pageWithNodes(10), pageWithNodes(20)]);
  const largeMultiPage = makeDeck([pageWithNodes(29998), pageWithNodes(29998)]);

  assert.doesNotThrow(() => validateDeckIrEnvelope(normal));
  assert.doesNotThrow(() => validateDeckIrEnvelope(largeMultiPage));
  assert.throws(() => validateDeckIrEnvelope(makeDeck([pageWithNodes(29999)])), /safe limits/u);
});

test("deck IR envelopes keep root metadata and array admission bounded without running accessors", () => {
  assert.throws(
    () => validateDeckIrEnvelope(makeDeck([{}], {metadata: Array(30000).fill(null)})),
    /safe limits/u
  );

  assert.throws(() => validateDeckIrEnvelope({...makeDeck([{}]), Pages: [{}]}), /ambiguous field casing/u);

  let calls = 0;
  const deck = makeDeck([{}]);
  Object.defineProperty(deck, "metadata", {enumerable: true, get() { calls += 1; return {}; }});
  assert.throws(() => validateDeckIrEnvelope(deck), /data properties/u);
  assert.equal(calls, 0);

  const forgedPages = [{}];
  Object.defineProperty(forgedPages, "0", {enumerable: true, get() { calls += 1; return {}; }});
  assert.throws(() => validateDeckIrEnvelope(makeDeck(forgedPages)), /data properties/u);
  assert.equal(calls, 0);
});
