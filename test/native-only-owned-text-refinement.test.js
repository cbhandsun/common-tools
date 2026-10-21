"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createNativeOnlyOwnedTextRefiner } = require("../packages/slideclone-worker-adapter/native-only-owned-text-refinement");
const { createImageToEditableArchiveHandler } = require("../packages/slideclone-worker-adapter/team-worker");

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "owned-bridge-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = name => { const value = path.join(root, name); fs.writeFileSync(value, name); return value; };
  const deck = { pages: [{ textBoxes: [{ id: "label", box: { x: 1 } }], shapes: [{ id: "glyph-fragment" }, { id: "icon" }] }] };
  const candidateDeck = { pages: [{ textBoxes: [{ id: "label", box: { x: 2 } }], shapes: [{ id: "icon" }] }] };
  const quality = { passed: false, metrics: { before: 1 } };
  const baseline = { deck, quality, deckFile: file("baseline.json"), pptxFile: file("baseline.pptx"), renderedImages: [file("baseline.png")], removed: 5 };
  const pptxFile = file("candidate.pptx"), deckFile = file("candidate.json"), rendered = file("candidate.png");
  const candidateQuality = { passed: true, metrics: { after: 1 } };
  let observed;
  const request = { root, baseline, sourceImages: [file("source.png")], runBuild: async () => {}, isCancellationRequested: async () => false,
    rawImageQualityVerifier: async input => { observed = input; input.collectRenderedPages([rendered]); return candidateQuality; } };
  const dependencies = { validateDeck: () => {}, refineOwnedTexts: async input => {
    await input.verifyCandidate({ deck, candidateDeck, pptxFile, fixedTextRois: [{ id: "label" }] });
    return { accepted: true, changedTextBoxes: 1, deck: candidateDeck, deckFile, pptxFile, quality: candidateQuality };
  } };
  return { request, dependencies, candidateDeck, deck, candidateQuality, rendered, observed: () => observed };
}
test("bridge keeps original text ROIs but audits candidate shapes without removed glyph ghosts", async t => {
  const f = setup(t), result = await createNativeOnlyOwnedTextRefiner(f.dependencies)(f.request);
  assert.deepEqual(f.observed().deck.pages[0].textBoxes, f.deck.pages[0].textBoxes);
  assert.deepEqual(f.observed().deck.pages[0].shapes, f.candidateDeck.pages[0].shapes);
  assert.equal(f.observed().deck.pages[0].shapes.some(shape => shape.id === "glyph-fragment"), false);
  assert.equal(f.observed().referenceQuality, f.request.baseline.quality);
  assert.equal(f.candidateDeck.pages[0].textBoxes[0].box.x, 2);
  assert.equal(result.deck, f.candidateDeck); assert.deepEqual(result.renderedImages, [f.rendered]);
  assert.equal(result.removed, 5); assert.equal(result.quality.metrics["native-only-owned-text-refinement-accepted"], 1);
});

test("strict recovery reaches text fitting on an absolute pass without rewriting its quality", async t => {
  const f = setup(t), raw = f.dependencies.refineOwnedTexts;
  f.request.baseline.quality.passed = true; f.request.strictRecovery = true;
  const before = structuredClone(f.request.baseline.quality);
  f.dependencies.refineOwnedTexts = async input => {
    assert.equal(input.strictRecovery, true); assert.equal(input.initialQuality.passed, true);
    return raw(input);
  };
  const result = await createNativeOnlyOwnedTextRefiner(f.dependencies)(f.request);
  assert.equal(result.deck, f.candidateDeck);
  assert.deepEqual(f.request.baseline.quality, before);
});

test("strict recovery controls reject invalid and accessor values before fitting", async t => {
  const f = setup(t); let calls = 0;
  f.dependencies.refineOwnedTexts = async () => { calls++; throw Error("unexpected"); };
  const refine = createNativeOnlyOwnedTextRefiner(f.dependencies);
  for (const value of [null, "true", 1, {}, []]) await assert.rejects(refine({ ...f.request, strictRecovery: value }), TypeError);
  await assert.rejects(refine({ ...f.request, get strictRecovery() { calls++; return true; } }), TypeError);
  assert.equal(calls, 0);
});
test("bridge rejects malformed verification decks before invoking the verifier", async t => {
  for (const candidateDeck of [{}, { pages: [] }, { pages: [null] }]) {
    const f = setup(t);
    f.dependencies.refineOwnedTexts = async input => input.verifyCandidate({ deck: f.deck, candidateDeck, pptxFile: f.request.baseline.pptxFile });
    await assert.rejects(createNativeOnlyOwnedTextRefiner(f.dependencies)(f.request), /verification/u);
    assert.equal(f.observed(), undefined);
  }
  const f = setup(t);
  f.deck.pages[0].textBoxes = null;
  await assert.rejects(createNativeOnlyOwnedTextRefiner(f.dependencies)(f.request), /verification/u);
  assert.equal(f.observed(), undefined);
});
test("bridge preserves baseline on rejected, passed and absent candidates", async t => {
  const f = setup(t); let calls = 0;
  f.dependencies.refineOwnedTexts = async () => { calls++; return { accepted: false, changedTextBoxes: 0 }; };
  const refine = createNativeOnlyOwnedTextRefiner(f.dependencies);
  assert.equal(await refine(f.request), f.request.baseline); assert.equal(calls, 1);
  f.request.baseline.quality.passed = true; assert.equal(await refine(f.request), f.request.baseline); assert.equal(calls, 1);
  assert.equal(await refine({ ...f.request, baseline: null }), null);
});
test("missing rendered pages do not start a fresh fitting pass", async t => {
  const f = setup(t); f.request.baseline.renderedImages = []; f.dependencies.refineOwnedTexts = async () => { throw new Error("unexpected"); };
  assert.equal(await createNativeOnlyOwnedTextRefiner(f.dependencies)(f.request), f.request.baseline);
});
test("foreign artifacts, malformed results and missing render verification fail closed", async t => {
  for (const result of [{ accepted: "true", changedTextBoxes: 1 }, { accepted: true, changedTextBoxes: 5 },
    { accepted: true, changedTextBoxes: 1, deck: {}, deckFile: __filename, pptxFile: __filename, quality: {} }]) {
    const f = setup(t); f.dependencies.refineOwnedTexts = async () => result;
    await assert.rejects(createNativeOnlyOwnedTextRefiner(f.dependencies)(f.request));
  }
});
test("provider errors and cancellation are not swallowed by the bridge", async t => {
  const f = setup(t), failure = new Error("cancelled provider");
  f.dependencies.refineOwnedTexts = async () => { throw failure; };
  await assert.rejects(createNativeOnlyOwnedTextRefiner(f.dependencies)(f.request), error => error === failure);
});
test("Worker rejects a malformed optional owned text dependency", () => {
  const objectStore = { readObject: async () => Buffer.alloc(0), putObject: async () => {} };
  assert.throws(() => createImageToEditableArchiveHandler({ objectStore, rawImageOwnedTextRefiner: true }), /rawImageOwnedTextRefiner/u);
});
