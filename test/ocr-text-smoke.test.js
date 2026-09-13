"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const ocrTextSmoke = require("../packages/slideclone-native-engine/scripts/ocr-text-smoke");

test("OCR text smoke is safe to load as a module", () => {
  assert.equal(typeof ocrTextSmoke.main, "function");
  assert.equal(typeof ocrTextSmoke.parseArgs, "function");
  assert.deepEqual(ocrTextSmoke.parseArgs(["--out", "runs/ocr", "--preprocess"]), { out: "runs/ocr", preprocess: "true" });
});
