"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createEmbeddedExpertScreenshotModel } = require("../skills/pd-hifi-slideclone/scripts/lib/embedded-expert-screenshot");

test("embedded expert keeps the complete UI screenshot and rebuilds the three captions", () => {
  const page = { images: [{ id: "underlay" }], textBoxes: [
    "无缝嵌入工作流的伴随式专家", "PM Portal", "场景感知", "按需自动化", "全量热插拔"
  ].map((text) => ({ text })) };
  const model = createEmbeddedExpertScreenshotModel(page, { widthPt: 960, heightPt: 540 });
  assert.equal(model.matched, true);
  assert.equal(model.shapes.length, 2);
  assert.equal(model.textBoxes.length, 4);
  assert.equal(model.screenshotRegion.box.y + model.screenshotRegion.box.h, 439);
  assert.ok(model.textBoxes.slice(1).every((item) => item.box.y >= 460));
  assert.ok([...model.shapes, ...model.textBoxes].every((item) => item.source.nativeComponentGroupId === "product-brain-embedded-expert-component"));
});

test("embedded expert fails closed without all three capability captions", () => {
  assert.equal(createEmbeddedExpertScreenshotModel({}, { widthPt: 960, heightPt: 540 }).matched, false);
  assert.equal(createEmbeddedExpertScreenshotModel({ textBoxes: [{ text: "无缝嵌入工作流" }] }, { widthPt: 960, heightPt: 540 }).matched, false);
  assert.equal(createEmbeddedExpertScreenshotModel({ textBoxes: [] }, { widthPt: 1e9, heightPt: 540 }).matched, false);
});
