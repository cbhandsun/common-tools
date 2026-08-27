"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { validateIr } = require("../skills/pd-hifi-slideclone/scripts/slideclone");

test("bundled SlideClone sample deck remains valid at the documented demo entry point", () => {
  const file = path.resolve(
    __dirname,
    "..",
    "skills",
    "pd-hifi-slideclone",
    "examples",
    "sample-deck.json"
  );
  const ir = JSON.parse(fs.readFileSync(file, "utf8"));
  const result = validateIr(ir, { baseDir: path.dirname(file), checkFiles: true });
  assert.equal(result.ok, true, result.errors.join("\n"));
});
