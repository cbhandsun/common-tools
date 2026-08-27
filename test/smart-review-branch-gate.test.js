"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { branchLayout, createSmartReviewBranchGateObjects, deriveSmartReviewBranchPalette, filterSmartReviewBranchGateTextBoxes, isolateLightReviewIcon, shouldObjectifySmartReviewBranchGate } = require("../skills/pd-hifi-slideclone/scripts/lib/smart-review-branch-gate");

function fixture() {
  const labels = ["PRD智能评审：将交付风险拦截在研发之前", "待评审", "PRD", "PRD评审Skill", "风险归档", "逻辑矛盾", "边界缺失", "体验阻塞"].map((text) => ({ text }));
  const images = [
    { id: "input", box: { x: 58, y: 182, w: 130, h: 321 }, source: { detector: "product-brain-smart-review-protected-diagram-crop" } },
    { id: "skill", box: { x: 263, y: 177, w: 242, h: 326 }, source: { detector: "product-brain-smart-review-protected-diagram-crop" } },
    { id: "routes", box: { x: 533, y: 167, w: 60, h: 249 }, source: { detector: "product-brain-smart-review-protected-diagram-crop" } },
    { id: "outputs", box: { x: 643, y: 106, w: 254, h: 400 }, source: { detector: "product-brain-smart-review-protected-diagram-crop" } }
  ];
  return { page: { images }, labels };
}

test("smart review branch gate requires complete semantics and four structural segments", () => {
  const { page, labels } = fixture();
  assert.equal(shouldObjectifySmartReviewBranchGate(page, labels), true);
  assert.equal(shouldObjectifySmartReviewBranchGate({ images: page.images.slice(0, 3) }, labels), false);
  assert.equal(shouldObjectifySmartReviewBranchGate(page, labels.filter((item) => item.text !== "体验阻塞")), false);
});

test("smart review branch gate rebuilds the two route branches and output structures", () => {
  const { page, labels } = fixture();
  const result = createSmartReviewBranchGateObjects(page, labels);
  assert.equal(result.matched, true);
  assert.equal(result.sourceIds.length, 4);
  assert.equal(result.shapes.filter((shape) => shape.source.detector.endsWith("pass-route")).length, 3);
  assert.equal(result.shapes.filter((shape) => shape.source.detector.endsWith("risk-route")).length, 3);
  assert.equal(result.shapes.length, 21);
  assert.equal(result.textBoxes.length, 13);
});

test("smart review icon mask removes blue pixels and retains light icon pixels", () => {
  const result = isolateLightReviewIcon({ width: 2, height: 1, rgba: Buffer.from([45, 125, 210, 255, 220, 235, 245, 255]) });
  assert.equal(result.rgba[3], 0);
  assert.equal(result.rgba[7], 255);
});

test("smart review branch gate removes split OCR copies", () => {
  const native = [{ text: "待评审", source: { detector: "smart-review-branch-gate-native-text" } }, { text: "PRD", source: { detector: "smart-review-branch-gate-native-text" } }];
  assert.deepEqual(filterSmartReviewBranchGateTextBoxes([{ text: "待评审" }, { text: "PRD" }, ...native], true).map((item) => item.text), ["待评审", "PRD"]);
});

test("smart review layout derives panel bounds from OCR evidence", () => {
  const evidence = [
    { text: "待评审", box: { x: 89.96, y: 240, w: 58.85, h: 21.75 } },
    { text: "PRD", box: { x: 97.84, y: 265.88, w: 43.11, h: 18.75 } },
    { text: "PRD评审Skill", box: { x: 318.63, y: 277.88, w: 129.32, h: 19.88 } },
    { text: "修订建议/通过项清单", box: { x: 681.86, y: 126.75, w: 163.06, h: 19.13 } },
    { text: "风险归档", box: { x: 729.84, y: 283.88, w: 80.97, h: 23.63 } },
    { text: "逻辑矛盾", box: { x: 732.84, y: 341.25, w: 74.97, h: 21 } },
    { text: "边界缺失", box: { x: 731.71, y: 382.88, w: 76.1, h: 21 } },
    { text: "体验阻塞", box: { x: 732.84, y: 425.63, w: 74.97, h: 21 } }
  ];
  const layout = branchLayout({ widthPt: 960, heightPt: 540 }, evidence);
  assert.deepEqual(layout.input, { x: 69.96, y: 196, w: 116, h: 132.63 });
  assert.deepEqual(layout.document, { x: 665.86, y: 112.75, w: 197.06, h: 140.13 });
  assert.deepEqual(layout.riskItems[0], { x: 670.83, y: 335.25, w: 199, h: 33 });
});

test("smart review palette samples only a credible neutral input-card surface", () => {
  const width = 960;
  const height = 540;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let index = 3; index < rgba.length; index += 4) rgba[index] = 255;
  for (let y = 220; y < 315; y += 1) {
    for (let x = 84; x < 110; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 206;
      rgba[offset + 1] = 206;
      rgba[offset + 2] = 206;
    }
  }
  const palette = deriveSmartReviewBranchPalette(branchLayout(), { widthPt: 960, heightPt: 540 }, { width, height, rgba });
  assert.deepEqual(palette, { inputFill: "#CECECE" });
  assert.deepEqual(deriveSmartReviewBranchPalette(branchLayout(), { widthPt: 960, heightPt: 540 }), {});
});
