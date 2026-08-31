"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeChangedPath, requiresOfficeRegression } = require("../scripts/office-regression-scope");

test("Office regression scope runs for manual and scheduled validation", () => {
  assert.equal(requiresOfficeRegression("workflow_dispatch", []), true);
  assert.equal(requiresOfficeRegression("schedule", []), true);
});

test("Office regression scope selects PowerPoint implementation and dependency changes", () => {
  for (const file of [
    "packages/ppt-create-core/layout.js",
    "packages/ppt-improve-core/index.js",
    "skills/pd-hifi-slideclone/dotnet/OpenXmlDeckBuilder/Program.cs",
    "scripts/ppt-create-office-smoke.js",
    "scripts/lib/ppt-create-office-corpus.js",
    "scripts/lib/ppt-create-template-archive-corpus.js",
    "scripts/lib/office-node-dependencies.js",
    "scripts/lib/office-node-local-cache.js",
    "scripts/office-node-dependencies.js",
    "packages/remote-mcp-server/bin/common-tools-team-ppt-create-worker.js",
    "package-lock.json"
  ]) {
    assert.equal(requiresOfficeRegression("pull_request", [file]), true, file);
    assert.equal(requiresOfficeRegression("push", [file]), true, file);
  }
});

test("Office regression scope leaves documentation-only changes on the stable no-op path", () => {
  assert.equal(requiresOfficeRegression("pull_request", ["docs/ppt-roadmap.md", "README.md"]), false);
  assert.equal(requiresOfficeRegression("push", []), false);
});

test("Office regression scope rejects unsafe or unsupported boundary values", () => {
  assert.equal(normalizeChangedPath(".\\packages\\ppt-create-core\\layout.js"), "packages/ppt-create-core/layout.js");
  assert.throws(() => requiresOfficeRegression("pull_request_target", []), /unsupported/u);
  assert.throws(() => requiresOfficeRegression("pull_request", ["../escape.js"]), /invalid/u);
  assert.throws(() => requiresOfficeRegression("pull_request", "package.json"), /invalid/u);
});
