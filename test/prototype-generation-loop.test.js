"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { annotatePrototypeGenerationLoopTextBoxes, createPrototypeGenerationLoopModel } = require("../skills/pd-hifi-slideclone/scripts/lib/prototype-generation-loop");

test("prototype generation loop rebuilds structure and preserves screenshot-like atoms", () => {
  const page = {
    textBoxes: [
      { text: "原型生成闭环：让抽象文档转化为可视资产" },
      { text: "标准 PRD" },
      { text: "原型生成" },
      { text: "可点击原型" },
      { text: "门户展示" }
    ],
    images: Array.from({ length: 5 }, (_, index) => ({
      id: `segment-${index}`,
      source: { detector: "product-illustration-segment-crop" }
    }))
  };

  const model = createPrototypeGenerationLoopModel(page, { widthPt: 960, heightPt: 540 });

  assert.equal(model.matched, true);
  assert.equal(model.pictorialRegions.length, 4);
  assert.equal(model.sourceIds.length, 5);
  assert.ok(model.shapes.some((shape) => shape.source.detector === "prototype-generation-loop-native-document"));
  assert.equal(model.shapes.some((shape) => shape.source.detector === "prototype-generation-loop-native-browser"), false);
  assert.ok(model.shapes.some((shape) => shape.source.detector === "prototype-generation-loop-native-portal"));
  assert.equal(model.shapes.filter((shape) => shape.source.detector === "prototype-generation-loop-native-feedback").length, 6);
  assert.equal(model.shapes.every((shape) => shape.source.componentOwnerId === "prototype-generation-loop-native-component"), true);
});

test("prototype generation loop can use a fully native browser fallback when no screenshot is retained", () => {
  const page = {
    textBoxes: [
      { text: "原型生成闭环" },
      { text: "标准 PRD" },
      { text: "原型生成" },
      { text: "可点击原型" },
      { text: "门户展示" }
    ],
    images: Array.from({ length: 4 }, (_, index) => ({ id: `segment-${index}`, source: { detector: "product-illustration-segment-crop" } }))
  };

  const model = createPrototypeGenerationLoopModel(page, { widthPt: 960, heightPt: 540 }, { preservePrototypeScreenshot: false });

  assert.equal(model.matched, true);
  assert.equal(model.pictorialRegions.length, 3);
  assert.ok(model.shapes.some((shape) => shape.source.detector === "prototype-generation-loop-native-browser"));
});

test("prototype generation loop rejects incomplete semantics and malformed slide sizes safely", () => {
  const incomplete = createPrototypeGenerationLoopModel({
    textBoxes: [{ text: "原型生成" }],
    images: Array.from({ length: 5 }, () => ({ source: { detector: "product-illustration-segment-crop" } }))
  }, { widthPt: NaN, heightPt: -1 });

  assert.equal(incomplete.matched, false);
  assert.deepEqual(incomplete.shapes, []);
  assert.deepEqual(incomplete.pictorialRegions, []);
});

test("prototype generation loop normalizes document labels without changing unrelated text", () => {
  const input = [
    { text: "标准 PRD", box: { y: 190 }, font: { sizePt: 14, weight: "regular" } },
    { text: "标准PRD", box: { y: 339 }, font: { sizePt: 17, weight: "regular" } },
    { text: "说明", box: { y: 420 }, font: { sizePt: 12, weight: "regular" } }
  ];
  const output = annotatePrototypeGenerationLoopTextBoxes(input, true);

  assert.deepEqual(output.slice(0, 2).map((item) => [item.font.sizePt, item.font.weight]), [[17.5, "bold"], [18, "bold"]]);
  assert.equal(output[2], input[2]);
});

test("prototype generation loop measures native frames and emits whole feedback paths", () => {
  const image = syntheticPrototypeLoopImage();
  const page = {
    textBoxes: ["原型生成闭环", "标准 PRD", "原型生成", "可点击原型", "门户展示"].map((text) => ({ text })),
    images: Array.from({ length: 5 }, (_, index) => ({
      id: `segment-${index}`,
      source: { detector: "product-illustration-segment-crop" }
    }))
  };

  const model = createPrototypeGenerationLoopModel(page, { widthPt: 960, heightPt: 540 }, { sourceImage: image });
  const feedback = model.shapes.filter((shape) => shape.source.detector === "prototype-generation-loop-native-feedback");

  assert.equal(model.measurement?.measured, true);
  assert.ok(model.measurement?.skillBox);
  assert.equal(model.shapes.length, 12);
  assert.equal(feedback.length, 2);
  assert.equal(feedback.every((shape) => shape.type === "polyline" && shape.source.measuredGeometry), true);
  assert.deepEqual(model.pictorialRegions.find((region) => region.key === "prototype-screenshot").box, model.measurement.screenshotBox);
});

function syntheticPrototypeLoopImage() {
  const width = 960;
  const height = 540;
  const rgba = Buffer.alloc(width * height * 4, 255);
  const green = [58, 184, 115, 255];
  const fillRect = (x, y, w, h, color = green) => {
    for (let row = y; row < y + h; row += 1) {
      for (let column = x; column < x + w; column += 1) {
        const offset = (row * width + column) * 4;
        for (let channel = 0; channel < 4; channel += 1) rgba[offset + channel] = color[channel];
      }
    }
  };
  const frame = (x, y, w, h, stroke = 4) => {
    fillRect(x, y, w, stroke);
    fillRect(x, y + h - stroke, w, stroke);
    fillRect(x, y, stroke, h);
    fillRect(x + w - stroke, y, stroke, h);
  };
  frame(499, 185, 235, 166);
  frame(806, 184, 95, 168);
  fillRect(580, 120, 250, 10);
  fillRect(580, 120, 10, 65);
  fillRect(820, 120, 10, 64);
  fillRect(580, 390, 250, 10);
  fillRect(580, 351, 10, 49);
  fillRect(820, 352, 10, 48);
  fillRect(258, 181, 141, 141, [35, 123, 214, 255]);
  return { width, height, rgba };
}
