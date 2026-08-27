"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeSmartReviewTextBoxes,
  smartReviewPictorialRegions
} = require("../skills/pd-hifi-slideclone/scripts/lib/smart-review-hybrid");

test("smart review hybrid keeps pictorial crops small and isolated", () => {
  const regions = smartReviewPictorialRegions();
  assert.equal(regions.length, 4);
  assert.ok(regions.every((region) => region.box.w * region.box.h < 960 * 540 * 0.04));
  regions[0].box.x = -1;
  assert.equal(smartReviewPictorialRegions()[0].box.x, 57);
});

test("smart review text normalization prevents high-impact wrapping", () => {
  const input = [
    textBox("智能生成与前置评审：构建防御型PRD交付标准", 31),
    textBox("风险拦截池", 17),
    textBox("质量前置：让评审", 20),
    textBox("从“会后补救”变为", 22)
  ];
  const result = normalizeSmartReviewTextBoxes(input);

  assert.equal(result[0].text, "智能生成与前置评审：构建防御型 PRD 交付标准");
  assert.equal(result[2].font.sizePt, 12.15);
  assert.equal(result[3].font.sizePt, 16);
  assert.equal(result[3].font.family, "SimHei");
  assert.equal(result[3].style.wrap, false);
  assert.equal(result[3].box.x, 752);
  assert.equal(input[3].font.sizePt, 22);
});

test("smart review text normalization rejects invalid input and ignores unrelated pages", () => {
  assert.deepEqual(normalizeSmartReviewTextBoxes(null), []);
  const unrelated = [textBox("普通页面", 18)];
  assert.equal(normalizeSmartReviewTextBoxes(unrelated), unrelated);
});

function textBox(text, sizePt) {
  return { text, box: { x: 0, y: 0, w: 100, h: 20 }, font: { sizePt }, style: {} };
}
