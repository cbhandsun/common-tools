"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createPageSemanticClaims } = require("../packages/slideclone-core/page-semantic-claims");
const names = ["createSkillsCapabilityMatrixObjects", "createDemandIntakeFunnelObjects", "createSmartReviewBranchGateObjects", "createSkillChainOrchestrationObjects", "createAssetLandingTriadObjects"];
const empty = () => ({ matched: false, sourceIds: [], shapes: [], textBoxes: [], images: [] });
function fixture(implementations = {}) {
  const calls = [];
  const run = createPageSemanticClaims(Object.fromEntries(names.map((name) => [name, (...args) => {
    calls.push({ name, images: [...args[0].images], context: args[3] });
    return implementations[name] ? implementations[name](...args) : empty();
  }]))).claimPageSemanticImages;
  const image = { id: "source" };
  const input = { page: { images: [image] }, candidateImages: [image], textBoxes: [], image: {}, slideSize: { widthPt: 960, heightPt: 540 }, pageIndex: 0, options: { objectifyLayerConnectors: true } };
  return { run, calls, input };
}

test("semantic claims preserve ordered ownership and keep generated icons out of generic candidates", () => {
  const first = { id: "first-icon" }, final = { id: "final-icon" };
  const shape = { id: "native-shape" };
  const { run, input, calls } = fixture({
    [names[0]]: (_page, _text, _size, context) => {
      context.assetDir = "detector-local";
      return { ...empty(), matched: true, sourceIds: ["source"], shapes: [shape], images: [first] };
    },
    [names[1]]: () => ({ ...empty(), matched: true, sourceIds: ["first-icon"], images: [final] })
  });
  const result = run(input);
  assert.deepEqual(calls.map(({ name }) => name), names);
  assert.deepEqual(calls[1].images, [first]);
  assert.deepEqual(calls[2].images, [final]);
  assert.deepEqual(input.page.images, [final]);
  assert.deepEqual(result.candidateImages, []);
  assert.equal(result.skillsCapabilityMatrix.shapes[0], shape);
  assert.equal(calls[1].context.assetDir, undefined);
});

test("disabled or image-free semantic stages produce independent empty results without detector calls", () => {
  for (const modification of [{ image: null }, { options: {} }]) {
    const { run, input, calls } = fixture();
    const result = run({ ...input, ...modification });
    assert.equal(calls.length, 0);
    assert.equal(result.candidateImages, input.candidateImages);
    assert.deepEqual(result.skillsCapabilityMatrix, empty());
    assert.notEqual(result.skillsCapabilityMatrix.images, result.demandIntakeFunnel.images);
  }
});

test("unmatched detectors leave ownership unchanged, and failures prevent later detectors", () => {
  const { run, input } = fixture({ [names[0]]: () => ({ ...empty(), sourceIds: ["source"], images: [{ id: "ignored" }] }) });
  assert.equal(run(input).candidateImages, input.candidateImages);
  assert.equal(input.page.images[0].id, "source");
  const failure = new Error("controlled detector failure");
  const failed = fixture({ [names[1]]: () => { throw failure; } });
  assert.throws(() => failed.run(failed.input), (error) => error === failure);
  assert.equal(failed.calls.length, 2);
});

test("semantic stage validates malformed and excessive input and detector output", () => {
  assert.throws(() => createPageSemanticClaims({}), TypeError);
  for (const patch of [{ page: null }, { candidateImages: new Array(100001) }, { textBoxes: [null] }, { slideSize: {} }, { pageIndex: -1 }, { options: { irDir: "bad\0path" } }, { image: false }]) {
    const { run, input, calls } = fixture();
    assert.throws(() => run({ ...input, ...patch }), TypeError);
    assert.equal(calls.length, 0);
  }
  for (const value of [null, { ...empty(), matched: "true" }, { ...empty(), sourceIds: [{}] }, { ...empty(), shapes: new Array(100001) }, { ...empty(), textBoxes: [null] }]) {
    const { run, input, calls } = fixture({ [names[0]]: () => value });
    assert.throws(() => run(input), TypeError);
    assert.equal(calls.length, 1);
  }
});

test("semantic image identities reject executable accessors and object coercion", () => {
  let calls = 0;
  for (const image of [{ get id() { calls += 1; return "source"; } }, { id: { toString() { calls += 1; return "source"; } } }]) {
    const fixtureValue = fixture();
    fixtureValue.input.page.images = [image];
    assert.throws(() => fixtureValue.run(fixtureValue.input), TypeError);
    assert.equal(fixtureValue.calls.length, 0);
  }
  assert.equal(calls, 0);
});

test("semantic claims bound the merged collection while accepting the maximum-sized result", () => {
  const generated = new Array(100000).fill({ id: "icon" });
  const overflow = fixture({ [names[0]]: () => ({ ...empty(), matched: true, images: generated }) });
  assert.throws(() => overflow.run(overflow.input), /merged images/);
  assert.equal(overflow.calls.length, 1);
  assert.equal(overflow.input.page.images.length, 1);
  const accepted = fixture({ [names[0]]: () => ({ ...empty(), matched: true, sourceIds: ["source"], images: generated }) });
  const result = accepted.run(accepted.input);
  assert.equal(accepted.input.page.images.length, 100000);
  assert.deepEqual(result.candidateImages, []);
});
