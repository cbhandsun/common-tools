"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHorizontalStepChainToolkit } = require("../skills/pd-hifi-slideclone/scripts/lib/horizontal-step-chain");

function operations() {
  return {
    averageColor: () => ({ r: 0, g: 0, b: 0 }),
    boxCenterInside: () => true,
    centerOfBox: (box) => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 }),
    comparisonMatrixVisualAtoms: () => [],
    isSafeStructuredText: (value) => Boolean(String(value || "").trim()),
    luma: () => 100,
    normalizeStructuredText: (value) => String(value || "").trim(),
    pixel: () => ({ r: 0, g: 100, b: 200, a: 255 }),
    ptToPxBox: (box) => box,
    rgbToHex: () => "#000000",
    round: (value) => Math.round(value * 10000) / 10000,
    saturation: () => 1
  };
}

test("horizontal step chain validates every injected image operation", () => {
  assert.throws(() => createHorizontalStepChainToolkit({}), /averageColor/);
});

test("horizontal step chain reports full objectification only with all native parts", () => {
  const toolkit = createHorizontalStepChainToolkit(operations());
  const shapes = [
    ...Array.from({ length: 4 }, () => ({ source: { detector: "horizontal-step-chain-native-top" } })),
    ...Array.from({ length: 4 }, () => ({ source: { detector: "horizontal-step-chain-native-body" } })),
    ...Array.from({ length: 4 }, () => ({ source: { detector: "horizontal-step-chain-native-green-rail" } }))
  ];
  const textBoxes = Array.from({ length: 8 }, () => ({ source: { nativeRebuild: true } }));

  assert.equal(toolkit.isFullyObjectified(shapes, textBoxes), true);
  assert.equal(toolkit.isFullyObjectified(shapes.slice(1), textBoxes), false);
  assert.equal(toolkit.isFullyObjectified(null, null), false);
});

test("horizontal step chain skips pixel atom scans when semantic evidence is already sufficient", () => {
  const ops = operations();
  let atomScans = 0;
  ops.comparisonMatrixVisualAtoms = () => {
    atomScans += 1;
    return [];
  };
  const toolkit = createHorizontalStepChainToolkit(ops);
  const image = {
    box: { x: 0, y: 0, w: 800, h: 300 },
    source: {
      detector: "foreground-graphic-crop",
      layer: {
        layerType: "diagram-zone",
        diagramUnderstanding: { archetype: "flow-card-chain", confidence: 0.9, nodeCount: 8 }
      }
    }
  };

  assert.equal(toolkit.shouldObjectify(image, []), true);
  assert.equal(atomScans, 0);
});

test("horizontal step chain sampling preserves fallback without source pixels", () => {
  const toolkit = createHorizontalStepChainToolkit(operations());
  assert.equal(toolkit.sampleFill(null, { x: 0, y: 0, w: 10, h: 10 }, null, "#236DAD", "blue"), "#236DAD");
});

test("horizontal step chain measures opposing blue slants from source pixels", () => {
  const ops = operations();
  ops.pixel = (_image, x, y) => {
    const left = y < 50 ? 5 : 15;
    const right = y < 50 ? 90 : 95;
    return x >= left && x < right ? { r: 20, g: 90, b: 180, a: 255 } : { r: 255, g: 255, b: 255, a: 255 };
  };
  const toolkit = createHorizontalStepChainToolkit(ops);
  assert.deepEqual(toolkit.measureSlantPoints(
    { width: 100, height: 100 },
    { x: 0, y: 0, w: 100, h: 100 },
    { widthPt: 100, heightPt: 100 },
    []
  ), [
    { x: 0.05, y: 0 }, { x: 0.9, y: 0 }, { x: 0.95, y: 1 }, { x: 0.15, y: 1 }
  ]);
});

test("horizontal step chain measures distinct green rails instead of using a fixed arrow box", () => {
  const ops = operations();
  ops.pixel = (_image, x, y) => x >= 45 && x < 65 && y >= 30 && y < 75
    ? { r: 48, g: 184, b: 120, a: 255 }
    : { r: 30, g: 90, b: 160, a: 255 };
  const toolkit = createHorizontalStepChainToolkit(ops);

  assert.deepEqual(toolkit.measureGreenRailBox(
    { width: 100, height: 100 },
    { x: 40, y: 35, w: 30, h: 30 },
    { x: 35, y: 20, w: 40, h: 65 },
    { widthPt: 100, heightPt: 100 }
  ), { x: 45, y: 30, w: 20, h: 45 });
});

test("horizontal step chain groups each stage as one native semantic component", () => {
  const toolkit = createHorizontalStepChainToolkit(operations());
  const image = { id: "roadmap-layer", box: { x: 40, y: 100, w: 880, h: 360 }, source: { layer: { layerType: "diagram-zone" } } };
  const shapes = toolkit.inferShapes(image);
  const xPositions = [90, 120, 310, 340, 530, 560, 750, 780];
  const textBoxes = toolkit.nativeTextBoxes(image, Array.from({ length: 8 }, (_, index) => ({
    id: `text-${index}`,
    text: `stage ${index}`,
    box: { x: xPositions[index], y: 180, w: 70, h: 24 }
  })));

  const groups = new Set(shapes.map((shape) => shape.source.nativeComponentGroupId));
  assert.deepEqual([...groups].sort(), [
    "roadmap-layer-stage-1",
    "roadmap-layer-stage-2",
    "roadmap-layer-stage-3",
    "roadmap-layer-stage-4"
  ]);
  assert.equal(shapes.every((shape) => shape.source.nativeComponentMinimumUnit === "semantic-component"), true);
  assert.equal(shapes.filter((shape) => /native-(?:top|body)$/.test(shape.source.detector)).every((shape) => shape.type === "freeform"), true);
  assert.deepEqual(shapes.find((shape) => shape.source.detector === "horizontal-step-chain-native-top").points, [
    { x: 0, y: 0 }, { x: 0.82, y: 0 }, { x: 1, y: 1 }, { x: 0.16, y: 1 }
  ]);
  assert.deepEqual([...new Set(textBoxes.map((textBox) => textBox.source.nativeComponentGroupId))].sort(), [...groups].sort());
  assert.equal(textBoxes.every((textBox) => textBox.source.nativeComponentArchetype === "horizontal-step-chain-stage"), true);
});

test("horizontal step chain preserves OCR text and only fills missing semantic roles", () => {
  const toolkit = createHorizontalStepChainToolkit(operations());
  const image = {
    id: "roadmap-layer",
    box: { x: 0, y: 0, w: 800, h: 300 },
    source: {
      layer: {
        diagramUnderstanding: {
          nodes: Array.from({ length: 4 }, (_, index) => ([
            { text: String(index + 1).padStart(2, "0"), box: { x: index * 200 + 20, y: 30, w: 30, h: 20 } },
            { text: `inferred ${index + 1}`, box: { x: index * 200 + 20, y: 160, w: 130, h: 30 } }
          ])).flat()
        }
      }
    }
  };
  const ocrText = Array.from({ length: 4 }, (_, index) => ([
    { id: `ocr-number-${index}`, text: String(index + 1).padStart(2, "0"), box: { x: index * 200 + 20, y: 30, w: 30, h: 20 } },
    { id: `ocr-title-${index}`, text: `source ${index + 1}`, box: { x: index * 200 + 20, y: 160, w: 130, h: 30 } }
  ])).flat();

  const complete = toolkit.nativeTextBoxes(image, ocrText);
  assert.equal(complete.length, 8);
  assert.deepEqual(complete.map((textBox) => textBox.text), ocrText.map((textBox) => textBox.text));

  const partial = toolkit.nativeTextBoxes(image, ocrText.filter((textBox) => textBox.id !== "ocr-title-2"));
  assert.equal(partial.length, 8);
  assert.equal(partial.some((textBox) => textBox.text === "inferred 3"), true);
  assert.equal(partial.filter((textBox) => textBox.source.stepIndex === 2).length, 2);

  const fallback = toolkit.nativeTextBoxes(image, []);
  assert.equal(fallback.length, 8);
  assert.equal(fallback.some((textBox) => textBox.text === "inferred 3"), true);
});

test("horizontal step chain merges a scale landing timeline into semantic stage text boxes", () => {
  const ops = operations();
  ops.boxCenterInside = (inner, outer) => {
    const x = inner.x + inner.w / 2;
    const y = inner.y + inner.h / 2;
    return x >= outer.x && x <= outer.x + outer.w && y >= outer.y && y <= outer.y + outer.h;
  };
  const toolkit = createHorizontalStepChainToolkit(ops);
  const image = { id: "scale-roadmap", box: { x: 28, y: 130, w: 904, h: 344 }, source: {} };
  const evidence = ["建域仓", "接系统", "固流程", "升平台", "一键初始化", "集中演进升级"]
    .map((text, index) => ({ text, box: { x: 80 + index * 120, y: 300, w: 90, h: 20 } }));
  const semantic = toolkit.nativeTextBoxes(image, evidence);

  assert.equal(semantic.length, 16);
  assert.deepEqual(semantic.filter((item) => item.source.horizontalStepChainTextRole === "number").map((item) => item.text), ["01", "02", "03", "04"]);
  assert.equal(semantic.filter((item) => item.source.horizontalStepChainTextRole === "body").length, 4);
  assert.equal(semantic.every((item) => item.source.mergedSemanticStageText === true), true);
  assert.equal(semantic.find((item) => item.text === "固化 AI 链路").font.sizePt, 15);

  const shapes = toolkit.inferShapes(image);
  const normalized = toolkit.normalizeTextBoxes([
    { text: "规模化落地路径", box: { x: 150, y: 60, w: 600, h: 40 }, source: {} },
    { text: "旧 OCR 行碎片", box: { x: 80, y: 360, w: 120, h: 20 }, source: {} },
    ...semantic
  ], shapes);
  assert.equal(normalized.some((item) => item.text === "旧 OCR 行碎片"), false);
  assert.equal(normalized.some((item) => item.text === "规模化落地路径"), true);
  assert.equal(normalized.length, 17);
});

test("horizontal step chain keeps rails at card edges and normalizes text hierarchy", () => {
  const ops = operations();
  ops.boxCenterInside = (inner, outer) => {
    const centerX = inner.x + inner.w / 2;
    const centerY = inner.y + inner.h / 2;
    return centerX >= outer.x && centerX <= outer.x + outer.w
      && centerY >= outer.y && centerY <= outer.y + outer.h;
  };
  const toolkit = createHorizontalStepChainToolkit(ops);
  const image = { id: "roadmap", box: { x: 40, y: 100, w: 880, h: 360 }, source: {} };
  const shapes = toolkit.inferShapes(image);
  const tops = shapes.filter((shape) => shape.source.detector === "horizontal-step-chain-native-top");
  const rails = shapes.filter((shape) => shape.source.detector === "horizontal-step-chain-native-green-rail");
  assert.ok(rails.every((rail, index) => rail.box.x >= tops[index].box.x + tops[index].box.w * 0.88));
  assert.ok(rails.every((rail) => rail.type === "rightArrow"));

  const normalized = toolkit.normalizeTextBoxes([
    { text: "01", box: { x: 80, y: 150, w: 45, h: 35 }, font: {}, style: {} },
    { text: "建域仓 (Init)", box: { x: 80, y: 270, w: 120, h: 22 }, font: {}, style: {} },
    { text: "一键初始化", box: { x: 80, y: 305, w: 100, h: 22 }, font: {}, style: {} },
    { text: "选择高价值试点领域", box: { x: 80, y: 350, w: 140, h: 18 }, font: { sizePt: 19 }, style: {} },
    { text: "outside", box: { x: 10, y: 10, w: 50, h: 15 }, font: { sizePt: 9 }, style: {} }
  ], shapes);
  assert.deepEqual(normalized.slice(0, 4).map((item) => item.source.horizontalStepChainTextRole), ["number", "heading", "subheading", "body"]);
  assert.deepEqual(normalized.slice(0, 4).map((item) => item.font.sizePt), [30, 17, 15, 12.2]);
  assert.ok(normalized.slice(0, 4).every((item) => item.wrap === false && item.style.preserveTypography === true));
  assert.equal(normalized[4].font.sizePt, 9);
});
