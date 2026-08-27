"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

test("common-tools contract test entrypoint retains complete coverage with bounded Windows concurrency", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const workflow = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
  assert.equal(packageJson.scripts["common-tools:test"], "node --test --test-concurrency=2 test/common-tools-*.test.js");
  assert.match(workflow, /name: Run common-tools contract tests\s+run: npm run common-tools:test/s);
});
