"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createCoverEngineCoreToolkit } = require("../skills/pd-hifi-slideclone/scripts/lib/cover-engine-core");

test("cover engine core plugin creates editable semantic components and avatar chrome", () => {
  let normalized = 0;
  const toolkit = createCoverEngineCoreToolkit(operations({
    detectAvatarBox: () => ({ x: 820, y: 20, w: 44, h: 44 }),
    normalizeChromeTextBoxes: () => { normalized += 1; }
  }));
  const image = candidate();
  const shapes = toolkit.createShapes([image], labels(), { rgba: new Uint8Array(4) });

  assert.equal(shapes.length, 7);
  assert.equal(normalized, 1);
  assert.equal(shapes.filter((shape) => shape.source.detector === "cover-engine-core-native-card").length, 3);
  assert.ok(shapes.every((shape) => shape.source.editable === true));
  assert.equal(image.source.coverEngineCoreObjectified, true);
  assert.equal(image.source.coverEngineCoreNativeTextBoxes.length, 3);
  assert.ok(image.source.coverEngineCoreNativeTextBoxes.every((item) => item.source.nativeComponentArchetype === "cover-engine-core"));
});

test("cover engine core plugin fails closed for empty, incomplete, malformed, and extreme inputs", () => {
  const toolkit = createCoverEngineCoreToolkit(operations());
  assert.deepEqual(toolkit.createShapes(null, null, null), []);
  assert.equal(toolkit.shouldObjectify(null), false);
  assert.equal(toolkit.shouldObjectify(candidate(), labels().slice(0, 2)), false);
  assert.equal(toolkit.shouldObjectify(candidate({ box: { x: 0, y: 0, w: Number.MAX_VALUE, h: Number.MAX_VALUE } }), labels()), false);
  assert.equal(toolkit.infer({ box: { x: 0, y: 0, w: -1, h: 400 } }, labels()), null);
});

test("cover engine core plugin coerces invalid detector geometry and slide sizes", () => {
  const observed = [];
  const toolkit = createCoverEngineCoreToolkit(operations({
    detectAxis(_source, slideSize) {
      observed.push(slideSize);
      return { x: 0, y: 0, w: -1, h: 20 };
    },
    detectCardBox: () => ({ x: 0, y: 0, w: Number.NaN, h: 10 })
  }));
  const diagram = toolkit.infer(candidate(), labels(), { widthPt: Number.MAX_VALUE, heightPt: -1 }, {});
  assert.ok(diagram);
  assert.deepEqual(observed, [{ widthPt: 960, heightPt: 540 }]);
  assert.ok(diagram.cards.every((card) => card.box.w > 0 && card.box.h > 0));
  assert.ok(diagram.axis.h < 0);
});

test("cover engine core plugin validates injected services and propagates failures", () => {
  const valid = operations();
  for (const name of ["boxCenterInside", "detectAvatarBox", "detectAxis", "detectCardBox", "expandPtBox", "normalizeChromeTextBoxes", "round"]) {
    assert.throws(() => createCoverEngineCoreToolkit({ ...valid, [name]: null }), new RegExp(`operation ${name}`));
  }
  assert.throws(() => createCoverEngineCoreToolkit({ ...valid, defaultSlide: { widthPt: 0, heightPt: 540 } }), /defaultSlide/);
  const failure = new Error("pixel detector unavailable");
  const toolkit = createCoverEngineCoreToolkit(operations({ detectCardBox: () => { throw failure; } }));
  assert.throws(() => toolkit.createShapes([candidate()], labels(), {}), (error) => error === failure);
});

test("native rebuild compatibility entry delegates cover engine behavior to the registry plugin", () => {
  const source = fs.readFileSync(path.join(
    __dirname, "..", "skills", "pd-hifi-slideclone", "scripts", "rebuild-real-pptx-native.js"
  ), "utf8");
  assert.match(source, /createNativeRebuilder\("cover-engine-core"/);
  assert.match(source, /return createCoverEngineCoreShapesFromRegistry\(images, textBoxes, sourceImage, slideSize\)/);
  assert.doesNotMatch(source, /createCoverEngineCoreShapesLegacy|shouldObjectifyCoverEngineCoreLegacy|inferCoverEngineCoreDiagramLegacy|coverShieldPoints|coverEngineCardBox/);
});

function candidate(overrides = {}) {
  return {
    id: "cover-source",
    box: { x: 300, y: 80, w: 380, h: 400 },
    source: {
      detector: "foreground-graphic-crop",
      layer: { layerType: "diagram-zone", recommendedAction: "split-native-with-residual-crop" }
    },
    ...overrides
  };
}

function labels() {
  return [
    { text: "文档", box: { x: 340, y: 180, w: 60, h: 24 } },
    { text: "原型", box: { x: 460, y: 220, w: 60, h: 24 } },
    { text: "代码", box: { x: 560, y: 280, w: 60, h: 24 } }
  ];
}

function operations(overrides = {}) {
  return {
    boxCenterInside(inner, outer) {
      const x = inner.x + inner.w / 2;
      const y = inner.y + inner.h / 2;
      return x >= outer.x && x <= outer.x + outer.w && y >= outer.y && y <= outer.y + outer.h;
    },
    defaultSlide: { widthPt: 960, heightPt: 540 },
    detectAvatarBox: () => null,
    detectAxis: () => null,
    detectCardBox: () => null,
    expandPtBox: (box) => ({ ...box }),
    normalizeChromeTextBoxes: () => {},
    round: (value) => Math.round(value * 1000) / 1000,
    ...overrides
  };
}
