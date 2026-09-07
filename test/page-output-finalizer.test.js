"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { fixture } = require("./helpers/page-output-fixture.cjs");
const { createPageOutputFinalizer } = require("../packages/slideclone-core/page-output-finalizer");

test("output cleanup applies screenshot policy before and after crop materialization", () => {
  const f = fixture();
  const steps = [];
  const generated = { id: "materialized" };
  f.operations.applyPrototypeValidationScreenshotPolicy = page => { assert.equal(page, f.page); steps.push(["policy", page.images.length]); };
  f.operations.materializePrototypeValidationResidualCrops = (page, directory) => { assert.equal(directory, f.inputs.options.irDir); steps.push(["materialize", page.images.length]); page.images.push(generated); };
  f.operations.finalizePrdSegmentedFlowComponents = (page, options) => {
    assert.equal(page.images[0], generated);
    assert.equal(options.sourceImage, f.inputs.image);
    assert.equal(options.slideSize, f.inputs.slideSize);
    assert.equal(options.irDir, f.inputs.options.irDir);
    steps.push(["prd", page.images.length]);
  };
  assert.equal(f.run(), f.page);
  assert.deepEqual(steps, [["policy", 0], ["materialize", 0], ["policy", 1], ["prd", 1]]);
  const entropy = f.calls.find(call => call.name === "dropEntropyChallengeCropsWhenNativeCoverage");
  assert.deepEqual(entropy.args[2], { allowNativeApproximation: false, allowIslandOnly: false });
});

test("embedded screenshot replacement precedes cleanup and preserves element identity", () => {
  const f = fixture();
  const shape = { id: "expert-shape" }, text = { id: "expert-text" };
  f.page.textBoxes = [{ id: "old" }];
  f.inputs.embeddedExpertScreenshotActive = true;
  f.inputs.embeddedExpertScreenshot = { shapes: [shape], textBoxes: [text] };
  let observed;
  f.operations.dropResidualsCoveredByNativeTableText = page => { observed = page.textBoxes[0]; assert.equal(page.shapes[0], shape); };
  f.run();
  assert.equal(observed, text);
  assert.notEqual(f.page.textBoxes, f.inputs.embeddedExpertScreenshot.textBoxes);
  assert.deepEqual(f.page.source, { kept: true });
});

test("fragmented chain deduplication runs after late PRD production and preserves specialist labels", () => {
  const f = fixture();
  f.inputs.assetOsFragmentedAssetChainActive = true;
  f.inputs.assetOsFragmentedAssetChain.textBoxes = [{ text: "MATCH" }];
  const specialist = { text: "match", source: { detector: "asset-os-fragmented-chain-native-label" } };
  const other = { text: "keep", id: "__proto__" };
  f.operations.finalizePrdSegmentedFlowComponents = page => { page.textBoxes = [{ text: "match" }, specialist, other]; };
  f.run();
  assert.deepEqual(f.page.textBoxes, [specialist, other]);
});

test("materialization failure stops later cleanup and escapes before persistence", () => {
  const f = fixture();
  const failure = new Error("controlled materialization failure");
  f.operations.materializePrototypeValidationResidualCrops = () => { throw failure; };
  let persisted = false;
  assert.throws(() => { f.run(); persisted = true; }, error => error === failure);
  assert.equal(persisted, false);
  assert.equal(f.calls.filter(call => call.name === "applyPrototypeValidationScreenshotPolicy").length, 1);
  assert.equal(f.calls.some(call => call.name === "finalizePrdSegmentedFlowComponents"), false);
  assert.throws(() => createPageOutputFinalizer({}), /operations are incomplete/);
});
