"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { parseArgs, positiveInteger } = require("../scripts/powerpoint-editable-roundtrip");

test("PowerPoint editable round-trip CLI accepts bounded repeatable files and modes", () => {
  assert.deepEqual(parseArgs(["--file", "one.pptx", "--file", "two.pptx", "--mode", "smartart-text", "--out", "artifacts/check"]), {
    file: ["one.pptx", "two.pptx"], mode: ["smartart-text"], out: "artifacts/check"
  });
  assert.throws(() => parseArgs(["--token", "secret"]), /Unknown option/);
  assert.throws(() => parseArgs(["--out", "one", "--out", "two"]), /Duplicate option/);
  assert.equal(positiveInteger(undefined, 42), 42);
  assert.throws(() => positiveInteger(999, 42), /outside/);
});
