"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createAssetLandingTriadObjects,
  filterAssetLandingTriadTextBoxes,
  isolateBlueAssetMark,
  shouldObjectifyAssetLandingTriad
} = require("../skills/pd-hifi-slideclone/scripts/lib/asset-landing-triad");

function fixture() {
  const labels = ["资产落盘：单点技能产出，化为组织级资产", "独立配置", "标准化目录", "版本化追踪", "供应链", "物流", "财务"].map((text) => ({ text }));
  return { page: { images: [{ id: "diagram", box: { x: 230, y: 120, w: 500, h: 320 } }] }, labels };
}

test("asset landing triad requires complete semantics and visual evidence", () => {
  const { page, labels } = fixture();
  assert.equal(shouldObjectifyAssetLandingTriad(page, labels), true);
  assert.equal(shouldObjectifyAssetLandingTriad({ images: [] }, labels), false);
  assert.equal(shouldObjectifyAssetLandingTriad(page, labels.filter((item) => item.text !== "财务")), false);
});

test("asset landing triad rebuilds three complete native columns and one route", () => {
  const { page, labels } = fixture();
  const result = createAssetLandingTriadObjects(page, labels);
  assert.equal(result.matched, true);
  assert.equal(result.shapes.length, 14);
  assert.equal(result.shapes.filter((item) => item.source.detector.endsWith("domain-card")).length, 3);
  assert.equal(result.shapes.filter((item) => item.source.detector.endsWith("connector")).length, 5);
  assert.equal(result.textBoxes.length, 8);
});

test("blue mark isolation removes white background", () => {
  const image = { width: 2, height: 1, rgba: Buffer.from([45, 120, 190, 255, 255, 255, 255, 255]) };
  const result = isolateBlueAssetMark(image);
  assert.equal(result.rgba[3], 255);
  assert.equal(result.rgba[7], 0);
});

test("asset landing ownership removes duplicate OCR labels", () => {
  const native = { text: "供应链", source: { detector: "asset-landing-triad-native-text" } };
  assert.deepEqual(filterAssetLandingTriadTextBoxes([{ text: "供应链" }, native], true), [native]);
});
