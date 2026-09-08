"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { resolveOpenXmlBuilderRoot, resolveSlidecloneRuntimeRoot } = require("../packages/slideclone-native-engine");

const ROOT = path.resolve(__dirname, "..");
const SKILL_SCRIPTS = path.join(ROOT, "skills", "pd-hifi-slideclone", "scripts");
const PACKAGE_SCRIPTS = path.join(ROOT, "packages", "slideclone-native-engine", "scripts");

function filesUnder(directory, base = directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(file, base));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(path.relative(base, file).replaceAll("\\", "/"));
  }
  return files;
}

test("production native engine package mirrors the reviewed SlideClone JavaScript implementation", () => {
  const expected = [
    "component-acquisition-search.js",
    "component-candidate-search.js",
    "component-plugin-action-queue.js",
    "component-strategy-rebuild.js",
    "golden-set-runner.js",
    "harvest-applied-ppt-components.js",
    "libreoffice-benchmark.js",
    "rebuild-real-pptx-native.js",
    "rendered-similarity-audit.js",
    "slideclone.js",
    ...filesUnder(path.join(SKILL_SCRIPTS, "adapters")).map((file) => `adapters/${file}`),
    ...filesUnder(path.join(SKILL_SCRIPTS, "lib")).map((file) => `lib/${file}`)
  ].sort();
  assert.deepEqual(filesUnder(PACKAGE_SCRIPTS).sort(), expected);
  for (const relative of expected) {
    assert.deepEqual(
      fs.readFileSync(path.join(PACKAGE_SCRIPTS, relative)),
      fs.readFileSync(path.join(SKILL_SCRIPTS, relative)),
      relative
    );
  }
});

test("production workers resolve SlideClone native roots through the native engine package", () => {
  assert.equal(resolveSlidecloneRuntimeRoot(ROOT), path.join(ROOT, "skills", "pd-hifi-slideclone"));
  assert.equal(resolveOpenXmlBuilderRoot(ROOT), path.join(ROOT, "skills", "pd-hifi-slideclone", "dotnet", "OpenXmlDeckBuilder"));
  const worker = fs.readFileSync(path.join(ROOT, "packages", "remote-mcp-server", "bin", "common-tools-team-ppt-create-worker.js"), "utf8");
  assert.doesNotMatch(worker, /skills[\\/]+pd-hifi-slideclone/);
  assert.match(worker, /resolveOpenXmlBuilderRoot|resolveSlidecloneRuntimeRoot/);
});
