"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DETECTOR_PREFIX,
  createFragmentedAssetChainModel
} = require("../skills/pd-hifi-slideclone/scripts/lib/fragmented-asset-chain");

test("fragmented asset chain rebuilds semantic minimum units in ten component groups and preserves one icon", () => {
  const model = createFragmentedAssetChainModel([
    "系统爆炸时代", "飞书会议记录", "旧版PRD", "口头反馈", "业务截图",
    "理解偏差", "重复返工", "风险遗漏", "交付看板"
  ].map((text) => ({ text })), { widthPt: 960, heightPt: 540 });

  assert.equal(model.matched, true);
  assert.equal(model.shapes.filter((shape) => shape.source.detector === `${DETECTOR_PREFIX}source-note`).length, 4);
  assert.equal(model.shapes.filter((shape) => shape.source.detector === `${DETECTOR_PREFIX}risk-node`).length, 3);
  assert.equal(model.shapes.filter((shape) => shape.source.detector === `${DETECTOR_PREFIX}input-route`).length, 7);
  assert.equal(model.cropRegions.length, 1);
  assert.ok(model.cropRegions.every((region) => region.box.w * region.box.h < 960 * 540 * 0.025));
  assert.ok(model.textBoxes.every((item) => item.style.wrap === false));
  assert.equal(model.textBoxes.find((item) => item.source.role === "title").font.sizePt, 38);
  assert.equal(model.textBoxes.find((item) => item.source.role === "subtitle").font.sizePt, 22);
  assert.ok(model.shapes.filter((shape) => shape.source.detector === `${DETECTOR_PREFIX}source-note`).every((shape) => shape.style.gradient?.stops?.length === 2));
  assert.deepEqual(model.shapes.filter((shape) => shape.source.detector === `${DETECTOR_PREFIX}source-note`).map((shape) => shape.style.rotation), [8, -11, -8, -10]);
  assert.deepEqual(model.textBoxes.filter((item) => ["飞书会议记录", "旧版 PRD", "口头反馈", "业务截图"].includes(item.text)).map((item) => item.style.rotation), [8, -11, -8, -10]);
  assert.ok(model.shapes.filter((shape) => shape.source.detector === `${DETECTOR_PREFIX}risk-node`).every((shape) => shape.style.gradient?.stops?.length === 3));
  assert.deepEqual(model.textBoxes.filter((item) => /^(理解偏差|重复返工|风险遗漏)$/.test(item.text)).map((item) => item.font.sizePt), [17.28, 17.01, 18.09]);
  assert.equal(model.textBoxes.find((item) => item.text === "交付看板").font.sizePt, 19.17);
  assert.equal(model.textBoxes.find((item) => item.text === "?").source.role, "dashboard-question");
  assert.ok(model.shapes.every((shape) => shape.source.nativeComponentInstance === true));
  const expectedGroups = [
    "asset-os-fragmented-chain-chrome",
    "asset-os-fragmented-chain-note-meeting",
    "asset-os-fragmented-chain-note-legacy-prd",
    "asset-os-fragmented-chain-note-verbal",
    "asset-os-fragmented-chain-note-screenshot",
    "asset-os-fragmented-chain-risk-understanding",
    "asset-os-fragmented-chain-risk-rework",
    "asset-os-fragmented-chain-risk-omission",
    "asset-os-fragmented-chain-dashboard",
    "asset-os-fragmented-chain-routing"
  ];
  const actualGroups = new Set([...model.shapes, ...model.textBoxes].map((item) => item.source.nativeComponentGroupId));
  assert.deepEqual([...actualGroups].sort(), [...expectedGroups].sort());
  assert.ok(model.textBoxes.every((item) => item.style.nativeComponentGroupId === item.source.nativeComponentGroupId));
  assert.equal(model.cropRegions[0].component.nativeComponentGroupId, "asset-os-fragmented-chain-dashboard");

  const meeting = model.shapes.find((item) => item.id === "asset-os-fragmented-chain-note-meeting");
  const meetingFold = model.shapes.find((item) => item.id === "asset-os-fragmented-chain-fold-meeting");
  assert.equal(meeting.type, "rect");
  assert.deepEqual(meeting.box, { x: 153, y: 170, w: 137, h: 89 });
  assert.equal(meetingFold.type, "triangle");
});

test("fragmented asset chain fails closed for incomplete, malformed, and extreme input", () => {
  assert.equal(createFragmentedAssetChainModel([], { widthPt: 960, heightPt: 540 }).matched, false);
  assert.equal(createFragmentedAssetChainModel("bad", { widthPt: 960, heightPt: 540 }).matched, false);
  assert.equal(createFragmentedAssetChainModel([{ text: "系统爆炸时代" }], { widthPt: 1e12, heightPt: 540 }).matched, false);
});

test("fragmented asset chain carries only matched OCR boxes into layout evidence", () => {
  const labels = [
    "系统爆炸时代的“产研资产熵增”挑战", "问题的本质不是缺乏工具，而是缺少一条贯穿需求、文档与原型的标准化资产链路。",
    "飞书会议记录", "旧版PRD", "口头反馈", "业务截图", "理解偏差", "重复返工", "风险遗漏", "交付看板"
  ].map((text, index) => ({ text, box: { x: 10 + index, y: 20 + index, w: 80, h: 24 } }));
  labels.push({ text: "?", box: { x: 775, y: 246, w: 130, h: 150 } });

  const model = createFragmentedAssetChainModel(labels, { widthPt: 960, heightPt: 540 });
  const title = model.textBoxes.find((item) => item.source.role === "title");
  const oldPrd = model.textBoxes.find((item) => item.source.role === "legacy-prd");

  assert.deepEqual(title.source.evidenceBox, labels[0].box);
  assert.deepEqual(title.box, labels[0].box);
  assert.deepEqual(oldPrd.source.evidenceBox, labels[3].box);
  assert.deepEqual(oldPrd.box, labels[3].box);
  assert.ok(model.textBoxes.every((item) => item.source.evidenceBox));

  labels[0].box = { x: 0, y: 0, w: -1, h: 10 };
  const invalidEvidence = createFragmentedAssetChainModel(labels, { widthPt: 960, heightPt: 540 });
  assert.equal(invalidEvidence.textBoxes.find((item) => item.source.role === "title").source.evidenceBox, undefined);
});
