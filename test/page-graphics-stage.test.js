"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createPageGraphicsStage } = require("../packages/slideclone-core/scene-plan/page-graphics-stage");

function fixture(overrides = {}) {
  const calls = [];
  const defaults = {
    detectLongLines: [], createKpiEvidenceCrops: [], createKpiEvidenceShapes: [],
    shouldFullyObjectifyEntropyChallenge: false, createTitleChromeShapes: [], keepStructuralLines: [],
    createGraphicUnderlayCrop: [], decorativeBackgroundMode: null, normalizeDecorativeCoverTextBoxes: undefined,
    createDecorativeCoverBackground: [], createGraphicCrops: [], createLeadingIconCrops: []
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
    assert.deepEqual(result.lineTextComponentShapes, []);
    assert.equal(calls.some((c) => c.name === "createTitleChromeShapes" || c.name === "keepStructuralLines"), false);
  }
});

test("line and text evidence emits generic native layout components before crop fallback", () => {
  const { run, input } = fixture({
    keepStructuralLines: () => [
      { type: "line", box: { x: 700, y: 100, w: 220, h: 0 }, style: { stroke: "#D0D7E2" } },
      { type: "line", box: { x: 700, y: 160, w: 220, h: 0 }, style: { stroke: "#D0D7E2" } },
      { type: "line", box: { x: 700, y: 240, w: 220, h: 0 }, style: { stroke: "#D0D7E2" } },
      { type: "line", box: { x: 700, y: 100, w: 0, h: 140 }, style: { stroke: "#D0D7E2" } },
      { type: "line", box: { x: 920, y: 100, w: 0, h: 140 }, style: { stroke: "#D0D7E2" } }
    ]
  });
  input.textBoxes = [
    { text: "A", box: { x: 720, y: 118, w: 40, h: 12 } },
    { text: "B", box: { x: 805, y: 118, w: 40, h: 12 } },
    { text: "C", box: { x: 875, y: 118, w: 40, h: 12 } },
    { text: "D", box: { x: 720, y: 184, w: 40, h: 12 } },
    { text: "E", box: { x: 805, y: 184, w: 40, h: 12 } }
  ];
  const result = run(input);
  assert.equal(result.lineTextComponentShapes.filter((shape) => shape.source.detector === "line-text-native-grid-cell").length, 2);
  assert.equal(result.lines.length, 5);
});

test("line and text evidence exposes inferred native timeline text boxes", () => {
  const { run, input } = fixture({
    keepStructuralLines: () => [
      { type: "line", box: { x: 20, y: 20, w: 220, h: 0 }, style: { stroke: "#D0D7E2" } },
      { type: "line", box: { x: 20, y: 44, w: 220, h: 0 }, style: { stroke: "#D0D7E2" } }
    ]
  });
  input.slideSize = { widthPt: 960, heightPt: 540 };
  input.textBoxes = [
    { text: "选场景", box: { x: 62, y: 482, w: 34, h: 12 } },
    { text: "盘系统资料", box: { x: 156, y: 482, w: 50, h: 12 } },
    { text: "连接与治理", box: { x: 258, y: 482, w: 50, h: 12 } },
    { text: "设权限", box: { x: 366, y: 482, w: 34, h: 12 } },
    { text: "配岗位能力", box: { x: 456, y: 482, w: 50, h: 12 } },
    { text: "真实数据试跑", box: { x: 552, y: 482, w: 58, h: 12 } },
    { text: "上岗运行", box: { x: 662, y: 482, w: 42, h: 12 } },
    { text: "看运行账本", box: { x: 758, y: 482, w: 50, h: 12 } },
    { text: "复制到下一岗", box: { x: 850, y: 482, w: 58, h: 12 } },
    { text: "02", box: { x: 171, y: 470, w: 18, h: 12 }, font: { color: "#3259E1" } },
    { text: "03", box: { x: 271, y: 470, w: 17, h: 12 }, font: { color: "#2D55E1" } },
    { text: "05", box: { x: 471, y: 470, w: 18, h: 12 }, font: { color: "#2A53E0" } },
    { text: "06", box: { x: 570, y: 470, w: 18, h: 12 }, font: { color: "#2F57E1" } },
    { text: "08", box: { x: 772, y: 470, w: 16, h: 12 }, font: { color: "#355CE2" } }
  ];
  const result = run(input);
  assert.deepEqual(result.lineTextComponentTextBoxes.map((item) => item.text).sort(), ["01", "02", "03", "04", "05", "06", "07", "08", "09"]);
  assert.equal(result.lineTextComponentShapes.filter((shape) => shape.source.inferredFromRegularTimeline === true).length, 4);
});

test("underlays and decorative backgrounds each prevent generic crop fallback", () => {
  for (const name of ["createGraphicUnderlayCrop", "createDecorativeCoverBackground"]) {
    const { run, input, calls } = fixture({ [name]: () => [{ id: name }] });
    assert.equal(run(input).images[0].id, name);
    assert.equal(calls.some((c) => c.name === "createGraphicCrops"), false);
  }
});

test("isolated leading icons are materialized even when a large underlay owns the page", () => {
  const underlay = { id: "underlay" }, icon = { id: "tight-icon", source: { protectedMinimumUnit: true } };
  const { run, input, calls } = fixture({ createGraphicUnderlayCrop: () => [underlay], createLeadingIconCrops: (image, text, size, context) => {
    assert.deepEqual(context.existingShapes, []);
    return [icon];
  } });
  const result = run(input);
  assert.deepEqual(result.images, [underlay, icon]);
  assert.equal(calls.some(call => call.name === "createGraphicCrops"), false);
});

test("native KPI, entropy, decorative backgrounds and disabled preservation suppress leading icon crops", () => {
  for (const overrides of [{ createKpiEvidenceShapes: () => [{ id: "kpi" }] },
    { shouldFullyObjectifyEntropyChallenge: () => true }, { createDecorativeCoverBackground: () => [{ id: "decoration" }] }]) {
    const { run, input, calls } = fixture(overrides);
    run(input);
    assert.equal(calls.some(call => call.name === "createLeadingIconCrops"), false);
  }
  const { run, input, calls } = fixture();
  run({ ...input, options: { preserveGraphics: false } });
  assert.equal(calls.some(call => call.name === "createLeadingIconCrops"), false);
});

test("leading icon materialization failures fail the page rather than declaring a successful crop", () => {
  for (const createLeadingIconCrops of [() => null, () => [null], () => { throw new Error("crop failed"); }]) {
    const { run, input } = fixture({ createLeadingIconCrops });
    assert.throws(() => run(input));
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
