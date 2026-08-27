"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  annotatePrototypeGenerationLoopTextBoxes,
  createPrototypeGenerationLoopModel
} = require("../skills/pd-hifi-slideclone/scripts/lib/prototype-generation-loop");

test("prototype generation loop emits five semantic component groups", () => {
  const textBoxes = ["原型生成闭环", "标准PRD", "原型生成", "可点击原型", "门户展示", "Skill"]
    .map((text) => ({ text, box: { x: 0, y: 0, w: 20, h: 10 } }));
  const page = {
    textBoxes,
    images: Array.from({ length: 5 }, (_, index) => ({
      id: `source-${index}`,
      source: { detector: "product-illustration-segment-crop" }
    }))
  };

  const model = createPrototypeGenerationLoopModel(page, { widthPt: 960, heightPt: 540 });
  const annotatedText = annotatePrototypeGenerationLoopTextBoxes(textBoxes, model.matched);
  const parts = [...model.shapes, ...model.pictorialRegions.map((item) => ({ source: item.component })), ...annotatedText];
  const groups = [...new Set(parts.map((item) => item.source?.nativeComponentGroupId).filter(Boolean))].sort();

  assert.equal(model.matched, true);
  assert.deepEqual(groups, [
    "prototype-generation-loop-document",
    "prototype-generation-loop-feedback",
    "prototype-generation-loop-portal",
    "prototype-generation-loop-prototype",
    "prototype-generation-loop-skill"
  ]);
  assert.ok(model.shapes.every((item) => item.source.nativeComponentGroupId));
  assert.ok(model.pictorialRegions.every((item) => item.component.nativeComponentGroupId));
});

test("prototype generation loop text annotation fails closed when the model does not match", () => {
  const input = [{ text: "标准PRD", source: { detector: "ocr" } }];
  assert.equal(annotatePrototypeGenerationLoopTextBoxes(input, false), input);
});
