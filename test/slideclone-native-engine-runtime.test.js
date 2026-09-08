"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const nativeEngine = require("../packages/slideclone-native-engine");

const ROOT = path.resolve(__dirname, "..");
const PACKAGE_SCRIPTS = path.join(ROOT, "packages", "slideclone-native-engine", "scripts");
const payloadPolicy = require("../config/native-engine-runtime-payload.json");

function filesUnder(directory, base = directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(file, base));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(path.relative(base, file).replaceAll("\\", "/"));
  }
  return files;
}

test("production native engine package bundles reviewed SlideClone JavaScript support modules", () => {
  const expected = [
    ...payloadPolicy.rootScripts,
    ...payloadPolicy.directories.flatMap((directory) => filesUnder(path.join(PACKAGE_SCRIPTS, directory)).map((file) => `${directory}/${file}`))
  ].sort();
  assert.deepEqual(filesUnder(PACKAGE_SCRIPTS).sort(), expected);
  const entrypoint = fs.readFileSync(path.join(PACKAGE_SCRIPTS, "rebuild-real-pptx-native.js"), "utf8");
  assert.match(entrypoint, /openXmlBuilderRoot: path\.resolve\(__dirname, "\.\.", "dotnet", "OpenXmlDeckBuilder"\)/);
  assert.doesNotMatch(entrypoint, /openXmlBuilderRoot: path\.resolve\(__dirname, "\.\.", "\.\.", "\.\.", "skills"/);
});

test("production workers resolve SlideClone native roots through the native engine package", () => {
  assert.equal(nativeEngine.resolveSlidecloneRuntimeRoot(ROOT), path.join(ROOT, "packages", "slideclone-native-engine"));
  assert.equal(nativeEngine.resolveSlidecloneResourceRoot(ROOT), path.join(ROOT, "skills", "pd-hifi-slideclone"));
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
  assert.equal(calls[0].context.skillRoot, path.join(ROOT, "packages", "slideclone-native-engine"));
  assert.equal(calls[0].builderRoot, path.join(ROOT, "packages", "slideclone-native-engine", "dotnet", "OpenXmlDeckBuilder"));
  assert.deepEqual(calls[0].options, { powerPointSafe: true });
});
