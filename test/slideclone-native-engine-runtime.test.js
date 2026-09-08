"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const nativeEngine = require("../packages/slideclone-native-engine");

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
  assert.equal(nativeEngine.resolveSlidecloneRuntimeRoot(ROOT), path.join(ROOT, "skills", "pd-hifi-slideclone"));
  assert.equal(nativeEngine.resolveOpenXmlBuilderRoot(ROOT), path.join(ROOT, "packages", "slideclone-native-engine", "dotnet", "OpenXmlDeckBuilder"));
  const worker = fs.readFileSync(path.join(ROOT, "packages", "remote-mcp-server", "bin", "common-tools-team-ppt-create-worker.js"), "utf8");
  assert.doesNotMatch(worker, /skills[\\/]+pd-hifi-slideclone/);
  assert.doesNotMatch(worker, /slideclone-core[\\/]pptx-openxml-dotnet|resolveOpenXmlBuilderRoot|resolveSlidecloneRuntimeRoot/);
  assert.match(worker, /slideclone-native-engine/);
});

test("native engine package owns OpenXML builder execution roots", () => {
  const calls = [];
  const builderPath = require.resolve("../packages/slideclone-core/pptx-openxml-dotnet");
  const original = require.cache[builderPath];
  require.cache[builderPath] = {
    id: builderPath,
    filename: builderPath,
    loaded: true,
    exports: { buildOpenXmlDecksSync(jobs, context, builderRoot, options) { calls.push({ jobs, context, builderRoot, options }); return ["deck.pptx"]; } }
  };
  try {
    assert.deepEqual(nativeEngine.buildOpenXmlDecksSync([{ irFile: "deck.ir.json", outFile: "deck.pptx" }], { config: { openXmlBuilder: { cache: false } } }, { powerPointSafe: true }), ["deck.pptx"]);
  } finally {
    if (original) require.cache[builderPath] = original;
    else delete require.cache[builderPath];
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].context.skillRoot, path.join(ROOT, "skills", "pd-hifi-slideclone"));
  assert.equal(calls[0].builderRoot, path.join(ROOT, "packages", "slideclone-native-engine", "dotnet", "OpenXmlDeckBuilder"));
  assert.deepEqual(calls[0].options, { powerPointSafe: true });
});
