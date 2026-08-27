"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createParadigmShiftMatrixModel } = require("../skills/pd-hifi-slideclone/scripts/lib/paradigm-shift-matrix");

test("paradigm shift matrix creates independent native cards and one gem minimum unit", () => {
  const page = { images: [{ id: "underlay" }], textBoxes: [
    "从临时问答迈向专业工作流引擎的范式转移", "传统人工推进", "普通通用 AI 工具",
    "PM Portal Platform", "极度依赖个人经验", "提取结构化资产（Gems）", "无法自动落盘沉淀为组织资产"
  ].map((text) => ({ text })) };
  const model = createParadigmShiftMatrixModel(page, { widthPt: 960, heightPt: 540 });
  assert.equal(model.matched, true);
  assert.equal(model.table, null);
  assert.equal(model.shapes.length, 12);
  assert.equal(model.shapes.every((shape) => shape.type === "rect"), true);
  assert.deepEqual(model.shapes.map((shape) => shape.box.y), [182, 182, 182, 258, 258, 258, 331, 331, 331, 406, 406, 406]);
  assert.equal(model.textBoxes.length, 14);
  assert.ok(model.shapes.every((shape) => shape.source.nativeComponentGroupId === "asset-os-paradigm-shift-matrix"));
  assert.ok(model.textBoxes.every((item) => item.source.nativeComponentGroupId === "asset-os-paradigm-shift-matrix"));
  assert.ok(model.iconRegion.box.w * model.iconRegion.box.h < 960 * 540 * 0.005);
});

test("paradigm shift matrix fails closed for incomplete and invalid input", () => {
  assert.equal(createParadigmShiftMatrixModel({}, { widthPt: 960, heightPt: 540 }).matched, false);
  assert.equal(createParadigmShiftMatrixModel({ textBoxes: [{ text: "传统人工推进" }] }, { widthPt: 960, heightPt: 540 }).matched, false);
  assert.equal(createParadigmShiftMatrixModel({ textBoxes: [] }, { widthPt: 0, heightPt: 540 }).matched, false);
});
