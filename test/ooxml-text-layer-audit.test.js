"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { auditSlideTextLayers, canonicalText, extractSlideShapeTexts } = require("../skills/pd-hifi-slideclone/scripts/lib/ooxml-text-layer-audit");

test("OOXML text layer audit flags duplicate generated title shapes", () => {
  const title = "AI Skills 核心能力矩阵";
  const result = auditSlideTextLayers({
    pageIndex: 0,
    expectedTextBoxes: [{ text: title, style: {}, source: {} }],
    actualShapeTexts: [title, title]
  });

  assert.deepEqual(result.duplicateTextShapes, [{
    pageIndex: 0,
    text: canonicalText(title),
    expectedCount: 1,
    actualCount: 2,
    excessCount: 1
  }]);
});

test("OOXML text layer audit ignores hidden and short repeated labels", () => {
  const result = auditSlideTextLayers({
    expectedTextBoxes: [{ text: "AI", style: {}, source: {} }, { text: "隐藏标题", style: { visibility: "hidden" }, source: {} }],
    actualShapeTexts: ["AI", "AI", "隐藏标题"]
  });
  assert.equal(result.duplicateTextShapes.length, 0);
});

test("OOXML text layer audit reads split DrawingML runs as one shape", () => {
  const xml = "<p:sp><p:txBody><a:p><a:r><a:t>AI Skills </a:t></a:r><a:r><a:t>核心能力矩阵</a:t></a:r></a:p></p:txBody></p:sp>";
  assert.deepEqual(extractSlideShapeTexts(xml), ["AI Skills 核心能力矩阵"]);
});
