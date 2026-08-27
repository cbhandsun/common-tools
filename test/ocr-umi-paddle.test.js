"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const umiPaddleOcr = require("../skills/pd-hifi-slideclone/scripts/adapters/ocr-umi-paddle");

function item(text, x, y, w = 20, h = 10) {
  return { text, box: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] };
}

test("Paddle OCR items are ordered by row and horizontal position", () => {
  const items = [
    item("right", 80, 10),
    item("second-row", 10, 40),
    item("left", 10, 12)
  ];

  const sorted = umiPaddleOcr._private.spatiallySortOcrItems(items);

  assert.deepEqual(sorted.map((entry) => entry.text), ["left", "right", "second-row"]);
});

test("Paddle OCR parser rejects malformed unpositioned items", () => {
  assert.throws(() => umiPaddleOcr._private.parseResult([
    { text: "unpositioned", box: [] },
    item("positioned", 10, 10)
  ], "source.png", 0, { x: 1, y: 1 }), /polygon/);
});

test("Umi PaddleOCR failures never expose OCR output content", () => {
  const result = umiPaddleOcr._private.failureResult({ text: "confidential slide text" });
  assert.equal(result.ok, false);
  assert.match(result.error, /unknown/);
  assert.doesNotMatch(JSON.stringify(result), /confidential/);
});

test("Umi PaddleOCR engine identity changes when a configured model changes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "umi-model-identity-"));
  try {
    const model = path.join(tempDir, "model.bin");
    fs.writeFileSync(model, "first");
    const context = { config: { umiOcr: { paddleBin: process.execPath, modelsPath: model } } };
    const first = umiPaddleOcr._private.engineIdentity(context);
    fs.writeFileSync(model, "second-version");
    const second = umiPaddleOcr._private.engineIdentity(context);
    assert.notEqual(first, second);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
