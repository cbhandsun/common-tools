"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createPageGraphicsStage } = require("../packages/slideclone-core/page-graphics-stage");

function fixture(overrides = {}) {
  const calls = [];
  const defaults = {
    detectLongLines: [], createKpiEvidenceCrops: [], createKpiEvidenceShapes: [],
    shouldFullyObjectifyEntropyChallenge: false, createTitleChromeShapes: [], keepStructuralLines: [],
    createGraphicUnderlayCrop: [], decorativeBackgroundMode: null, normalizeDecorativeCoverTextBoxes: undefined,
    createDecorativeCoverBackground: [], createGraphicCrops: []
  };
  const operations = Object.fromEntries(Object.entries(defaults).map(([name, value]) => [name, (...args) => {
    calls.push({ name, args });
    return Object.hasOwn(overrides, name) ? overrides[name](...args) : value;
  }]));
  const input = { image: {}, textBoxes: [], slideSize: { widthPt: 960, heightPt: 540 }, pageIndex: 0, options: { preserveGraphics: true } };
  return { run: createPageGraphicsStage(operations).preparePageGraphics, input, calls };
}

test("page graphics preserves evidence precedence and rendering layer order", () => {
  const kpi = { id: "kpi" }, decoration = { id: "decoration" };
  const { run, input, calls } = fixture({ createKpiEvidenceCrops: () => [kpi], createDecorativeCoverBackground: () => [decoration] });
  const result = run(input);
  assert.deepEqual(result.images, [decoration, kpi]);
  assert.equal(result.useUnderlay, true);
  for (const name of ["keepStructuralLines", "createGraphicUnderlayCrop", "createGraphicCrops"]) assert.equal(calls.some((c) => c.name === name), false, name);
});

test("legacy numeric dimensions are normalized before invoking any graphics operation", () => {
  const { run, input, calls } = fixture();
  run({ ...input, slideSize: { widthPt: "960", heightPt: "540" } });
  const detector = calls.find((c) => c.name === "detectLongLines");
  assert.deepEqual(detector.args[1], { widthPt: 960, heightPt: 540 });
});

test("native evidence and entropy suppress generic chrome and structural lines", () => {
  for (const override of [{ createKpiEvidenceShapes: () => [{ id: "native" }] }, { shouldFullyObjectifyEntropyChallenge: () => true }]) {
    const { run, input, calls } = fixture(override);
    const result = run(input);
    assert.deepEqual(result.titleChromeShapes, []);
    assert.deepEqual(result.lines, []);
    assert.equal(calls.some((c) => c.name === "createTitleChromeShapes" || c.name === "keepStructuralLines"), false);
  }
});

test("underlays and decorative backgrounds each prevent generic crop fallback", () => {
  for (const name of ["createGraphicUnderlayCrop", "createDecorativeCoverBackground"]) {
    const { run, input, calls } = fixture({ [name]: () => [{ id: name }] });
    assert.equal(run(input).images[0].id, name);
    assert.equal(calls.some((c) => c.name === "createGraphicCrops"), false);
  }
});

test("unclaimed graphics fall back after cover text normalization with bounded context", () => {
  const crop = { id: "crop" };
  const { run, input, calls } = fixture({ decorativeBackgroundMode: () => "cover", normalizeDecorativeCoverTextBoxes: (text, cover) => { assert.equal(cover, true); text.push({ normalized: true }); }, createGraphicCrops: (image, text, size, context) => {
    assert.deepEqual(text, [{ normalized: true }]);
    assert.deepEqual(Object.keys(context).sort(), ["assetDir", "deckName", "irDir", "pageIndex"]);
    return [crop];
  } });
  input.options.secret = "private";
  assert.deepEqual(run(input).images, [crop]);
  assert.ok(calls.findIndex((c) => c.name === "normalizeDecorativeCoverTextBoxes") < calls.findIndex((c) => c.name === "createGraphicCrops"));
});

test("missing pixels or disabled preservation avoid pixel crop operations", () => {
  for (const change of [{ image: null }, { options: { preserveGraphics: false } }]) {
    const { run, input, calls } = fixture();
    assert.deepEqual(run({ ...input, ...change }).images, []);
    for (const name of ["createKpiEvidenceCrops", "createGraphicUnderlayCrop", "createDecorativeCoverBackground", "createGraphicCrops"]) assert.equal(calls.some((c) => c.name === name), false);
  }
});

test("invalid stage boundaries fail before invoking operations without echoing input", () => {
  for (const change of [{ textBoxes: null }, { textBoxes: [null] }, { textBoxes: new Array(100001) }, { image: "private" }, { slideSize: { widthPt: Infinity, heightPt: 1 } }, { pageIndex: -1 }, { options: { assetDir: "private\0" } }, { options: { deckName: "x".repeat(32769) } }]) {
    const { run, input, calls } = fixture();
    assert.throws(() => run({ ...input, ...change }), (error) => error instanceof TypeError && !error.message.includes("private"));
    assert.equal(calls.length, 0);
  }
  assert.throws(() => createPageGraphicsStage({}), /operation/);
  assert.throws(() => createPageGraphicsStage(null), /operations/);
});

test("invalid operation results and operation failures do not yield a successful page", () => {
  for (const override of [{ detectLongLines: () => null }, { createKpiEvidenceShapes: () => [null] }, { shouldFullyObjectifyEntropyChallenge: () => "private" }, { decorativeBackgroundMode: () => "private" }]) {
    const { run, input } = fixture(override);
    assert.throws(() => run(input), (error) => error instanceof TypeError && !error.message.includes("private"));
  }
  const failure = new Error("operation failure");
  const { run, input } = fixture({ createGraphicCrops: () => { throw failure; } });
  assert.throws(() => run(input), (error) => error === failure);
});
