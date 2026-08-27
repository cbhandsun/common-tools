"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createVisualOperationSyncModel } = require("../skills/pd-hifi-slideclone/scripts/lib/visual-operation-sync");

test("visual operation sync decomposes the flow and preserves only pictorial minimum units", () => {
  const page = {
    images: [{ id: "underlay" }],
    textBoxes: [
      "视觉还原与操作同步", "Gem 提炼", "形态转换引擎", "可点击交互原型",
      "自动截屏操作手册", "PM Portal", "门户展示"
    ].map((text) => ({ text }))
  };
  const model = createVisualOperationSyncModel(page, { widthPt: 960, heightPt: 540 });
  assert.equal(model.matched, true);
  assert.equal(model.shapes.length, 13);
  assert.equal(model.textBoxes.length, 9);
  assert.equal(model.cropRegions.length, 7);
  assert.equal(model.cropRegions.filter((item) => item.expressionForm === "screenshot-or-document").length, 2);
  assert.ok(model.cropRegions.every((item) => item.box.w * item.box.h < 960 * 540 * 0.035));
  const expectedGroups = ["chrome", "banner", "input-prd", "input-dom", "engine", "prototype", "manual", "portal", "routing"]
    .map((role) => `asset-os-visual-operation-sync-${role}`);
  const actualGroups = new Set([...model.shapes, ...model.textBoxes].map((item) => item.source.nativeComponentGroupId));
  assert.deepEqual([...actualGroups].sort(), expectedGroups.sort());
  assert.deepEqual(model.cropRegions.filter((item) => item.expressionForm === "screenshot-or-document").map((item) => item.componentRole), ["prototype", "manual"]);
  assert.deepEqual(model.cropRegions.filter((item) => /magic-wand|camera/.test(item.id)).map((item) => item.componentRole), ["engine", "engine"]);
});

test("visual operation sync fails closed for incomplete and malformed input", () => {
  assert.equal(createVisualOperationSyncModel({}, { widthPt: 960, heightPt: 540 }).matched, false);
  assert.equal(createVisualOperationSyncModel({ textBoxes: [{ text: "视觉还原与操作同步" }] }, { widthPt: 960, heightPt: 540 }).matched, false);
  assert.equal(createVisualOperationSyncModel({ textBoxes: [] }, { widthPt: Number.POSITIVE_INFINITY, heightPt: 540 }).matched, false);
});
