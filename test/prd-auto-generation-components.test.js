"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  filterPrdAutoGenerationDuplicateTextBoxes,
  prdAutoGenerationComponentMetadata
} = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

test("PRD auto generation assigns stable semantic component owners", () => {
  assert.equal(prdAutoGenerationComponentMetadata("prd-generation-flow-native-input-card", { role: "fallback-input-card" }).nativeComponentGroupId, "prd-auto-generation-input");
  assert.equal(prdAutoGenerationComponentMetadata("prd-generation-flow-native-conveyor", { role: "conveyor-body" }).nativeComponentGroupId, "prd-auto-generation-conveyor");
  assert.equal(prdAutoGenerationComponentMetadata("prd-generation-flow-native-machine", { role: "machine-layer" }).nativeComponentGroupId, "prd-auto-generation-machine");
  assert.equal(prdAutoGenerationComponentMetadata("prd-generation-flow-native-connector", { role: "machine-output-horizontal" }).nativeComponentGroupId, "prd-auto-generation-routing");
  assert.equal(prdAutoGenerationComponentMetadata("prd-generation-flow-native-doc-row", { role: "row-header" }).nativeComponentGroupId, "prd-auto-generation-document");
});

test("PRD auto generation removes OCR copies claimed by native text", () => {
  const native = { text: "异常场景", source: { detector: "prd-generation-flow-native-text" } };
  const result = filterPrdAutoGenerationDuplicateTextBoxes([{ text: "异常场景" }, { text: "页面标题" }, native]);
  assert.deepEqual(result.map((item) => item.text), ["页面标题", "异常场景"]);
});
