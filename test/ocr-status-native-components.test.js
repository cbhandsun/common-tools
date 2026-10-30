"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createOcrStatusNativeComponents } = require("../packages/slideclone-core/ocr/ocr-status-native-components");

const slideSize = { widthPt: 960, heightPt: 540 };

test("OCR status native components split positive and negative prefixes into editable glyphs", () => {
  const result = createOcrStatusNativeComponents([
    { id: "bad", text: "× 基本没有", box: { x: 100, y: 80, w: 80, h: 14 }, source: { detector: "ocr" } },
    { id: "good", text: "✓ 按岗位授权", box: { x: 210, y: 80, w: 92, h: 14 }, source: { detector: "ocr" } },
    { id: "plain", text: "普通文本", box: { x: 100, y: 120, w: 60, h: 14 }, source: { detector: "ocr" } }
  ], slideSize);

  assert.equal(result.shapes.length, 4);
  assert.equal(result.shapes.filter((shape) => shape.source.nativeComponentRole === "negative-status").length, 2);
  assert.equal(result.shapes.filter((shape) => shape.source.nativeComponentRole === "positive-status").length, 2);
  assert.equal(result.textBoxes.length, 3);
  assert.equal(result.textBoxes[0].text, "基本没有");
  assert.equal(result.textBoxes[1].text, "按岗位授权");
  assert.equal(result.textBoxes[2].text, "普通文本");
  assert.equal(result.textBoxes[0].source.detector, "ocr-status-native-label");
  assert.ok(result.textBoxes[0].box.x > 100);
  assert.deepEqual(result.textBoxes[0].source.componentQualityBox, result.textBoxes[0].box);
  assert.deepEqual(result.textBoxes[1].source.componentQualityBox, result.textBoxes[1].box);
});

test("OCR status native components reject ambiguous or tiny status prefixes", () => {
  const result = createOcrStatusNativeComponents([
    { id: "tiny", text: "✓ ok", box: { x: 1, y: 1, w: 6, h: 3 } },
    { id: "mark-only", text: "×", box: { x: 20, y: 20, w: 30, h: 12 } },
    { id: "unknown", text: "? maybe", box: { x: 20, y: 40, w: 50, h: 12 } }
  ], slideSize);

  assert.equal(result.shapes.length, 0);
  assert.deepEqual(result.textBoxes.map((item) => item.text), ["✓ ok", "×", "? maybe"]);
});
