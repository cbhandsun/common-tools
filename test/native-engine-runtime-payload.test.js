"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { isRuntimePayloadPath, validatePolicy, verifyNativeEngineRuntimePayload } = require("../scripts/native-engine-runtime-payload");

const root = path.resolve(__dirname, "..");

function policy(overrides = {}) {
  return {
    version: 1,
    packageName: "@common-tools/slideclone-native-engine",
    packageRoot: "packages/slideclone-native-engine",
    payloadRoot: "packages/slideclone-native-engine/scripts",
    entrypoint: "packages/slideclone-native-engine/index.js",
    runtimeEntrypoint: "rebuild-real-pptx-native.js",
    managedBy: ["syntax", "boundary", "release"],
    directories: ["adapters", "lib", "python"],
    rootScripts: ["rebuild-real-pptx-native.js"],
    rootScriptGroups: {
      productionEntrypoints: ["rebuild-real-pptx-native.js"]
    },
    forbiddenRepositoryPaths: ["runtime/slideclone-native-engine"],
    ...overrides
  };
}

test("native engine runtime payload policy rejects unsafe or ambiguous paths", () => {
  assert.equal(validatePolicy(policy()).payloadRoot, "packages/slideclone-native-engine/scripts");
  assert.throws(() => validatePolicy(policy({ payloadRoot: "../escape" })), /escapes repository/);
  assert.throws(() => validatePolicy(policy({ rootScripts: ["ok.js", "ok.js"] })), /duplicates/);
  assert.throws(() => validatePolicy(policy({ rootScriptGroups: { productionEntrypoints: ["other.js"] } })), /cover rootScripts exactly once/);
  assert.throws(() => validatePolicy(policy({ packageName: "@common-tools/other" })), /package is invalid/);
});

test("native engine runtime payload verifier proves the current package boundary", () => {
  const result = verifyNativeEngineRuntimePayload();
  assert.equal(result.packageRoot, "packages/slideclone-native-engine");
  assert.equal(result.payloadRoot, "packages/slideclone-native-engine/scripts");
  assert.equal(result.rootScriptGroupCount >= 3, true);
  assert.equal(result.directoryCount >= 3, true);
  assert.equal(isRuntimePayloadPath(path.join(root, "packages", "slideclone-native-engine", "scripts", "rebuild-real-pptx-native.js")), true);
  assert.equal(isRuntimePayloadPath(path.join(root, "packages", "slideclone-native-engine", "index.js")), false);
});

test("native engine runtime payload verifier fails closed on missing payload contracts", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "native-engine-payload-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, "packages", "slideclone-native-engine", "scripts", "adapters"), { recursive: true });
  fs.mkdirSync(path.join(directory, "packages", "slideclone-native-engine", "scripts", "lib"), { recursive: true });
  fs.writeFileSync(path.join(directory, "packages", "slideclone-native-engine", "index.js"), 'require("./scripts/rebuild-real-pptx-native");\n');
  const badPolicy = policy({
    rootScripts: ["missing.js"],
    rootScriptGroups: {
      productionEntrypoints: ["missing.js"]
    }
  });
  assert.throws(
    () => verifyNativeEngineRuntimePayload({ policy: badPolicy, repositoryRoot: directory }),
    /payload root script is missing/
  );
});

test("native engine runtime payload verifier rejects undeclared top-level directories", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "native-engine-payload-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const scripts = path.join(directory, "packages", "slideclone-native-engine", "scripts");
  fs.mkdirSync(path.join(scripts, "adapters"), { recursive: true });
  fs.mkdirSync(path.join(scripts, "lib"), { recursive: true });
  fs.mkdirSync(path.join(scripts, "python"), { recursive: true });
  fs.mkdirSync(path.join(scripts, "undocumented"), { recursive: true });
  fs.writeFileSync(path.join(directory, "packages", "slideclone-native-engine", "index.js"), 'require("./scripts/rebuild-real-pptx-native");\n');
  fs.writeFileSync(path.join(scripts, "rebuild-real-pptx-native.js"), "module.exports = {};\n");
  assert.throws(
    () => verifyNativeEngineRuntimePayload({ policy: policy(), repositoryRoot: directory }),
    /payload directory is not declared/
  );
});

test("native engine runtime payload verifier blocks production dependencies on acquisition tools", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "native-engine-payload-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const scripts = path.join(directory, "packages", "slideclone-native-engine", "scripts");
  fs.mkdirSync(path.join(scripts, "adapters"), { recursive: true });
  fs.mkdirSync(path.join(scripts, "lib"), { recursive: true });
  fs.writeFileSync(path.join(directory, "packages", "slideclone-native-engine", "index.js"), 'require("./scripts/rebuild-real-pptx-native");\n');
  fs.writeFileSync(path.join(scripts, "rebuild-real-pptx-native.js"), 'require("./component-candidate-search");\n');
  fs.writeFileSync(path.join(scripts, "component-candidate-search.js"), "module.exports = {};\n");
  const badPolicy = policy({
    rootScripts: ["component-candidate-search.js", "rebuild-real-pptx-native.js"],
    rootScriptGroups: {
      componentAcquisitionTools: ["component-candidate-search.js"],
      productionEntrypoints: ["rebuild-real-pptx-native.js"]
    }
  });
  assert.throws(
    () => verifyNativeEngineRuntimePayload({ policy: badPolicy, repositoryRoot: directory }),
    /must not depend on component acquisition tool/
  );
});
