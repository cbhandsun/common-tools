"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { MAX_ITEMS, normalizeOcrItems } = require("../skills/pd-hifi-slideclone/scripts/lib/ocr-result-contract");

test("OCR result contract accepts bounded polygons and normalizes text", () => {
  const result = normalizeOcrItems([{ text: " 你好 ", score: 0.8, box: [[0, 0], [10, 0], [10, 5], [0, 5]], orientation: -1 }], { imageWidth: 20, imageHeight: 20 });
  assert.deepEqual(result, [{ text: "你好", confidence: 0.8, polygon: [[0, 0], [10, 0], [10, 5], [0, 5]], orientation: null }]);
  assert.deepEqual(normalizeOcrItems([]), []);
});

test("OCR result contract rejects malformed, unsafe, extreme, and out-of-image output", () => {
  assert.throws(() => normalizeOcrItems(null), /items are invalid/);
  assert.throws(() => normalizeOcrItems([{ text: "bad\u0000text", polygon: [[0, 0], [1, 0], [1, 1], [0, 1]] }]), /text is invalid/);
  assert.throws(() => normalizeOcrItems([{ text: "bad", confidence: 1.1, polygon: [[0, 0], [1, 0], [1, 1], [0, 1]] }]), /confidence/);
  assert.throws(() => normalizeOcrItems([{ text: "bad", polygon: [[0, 0], [1, 0], [1, 0], [0, 0]] }]), /no area/);
  assert.throws(() => normalizeOcrItems([{ text: "bad", polygon: [[0, 0], [11, 0], [11, 1], [0, 1]] }], { imageWidth: 10, imageHeight: 10 }), /outside/);
  assert.throws(() => normalizeOcrItems(Array.from({ length: MAX_ITEMS + 1 }, () => null)), /item limit/);
});
