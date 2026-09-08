"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { collectImports, forbiddenLayer, loadLayerPolicy, packageSurfaceTargets, policyPackageReferences, validateLayerPolicy, verifyWorkspaceBoundaries } = require("../scripts/verify-workspace-boundaries");

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-boundary-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "packages"));
  function write(relative, content) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  function add(name, dependencies = {}) {
    write(`packages/${name}/package.json`, JSON.stringify({ name: `@fixture/${name}`, version: "1.0.0", dependencies }));
    write(`packages/${name}/index.js`, '"use strict";\n');
  }
  function packagePolicy() {
    const packages = {};
    for (const entry of fs.readdirSync(path.join(root, "packages"), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(root, "packages", entry.name, "package.json");
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      packages[entry.name] = Object.keys(manifest.dependencies || {}).filter((dependency) => dependency.startsWith("@fixture/")).sort();
    }
    return { version: 1, workspaceDependencyVersion: "1.0.0", packages };
  }
  return { root, write, add, verify: () => verifyWorkspaceBoundaries({ workspaceRoot: root, packagePolicy: packagePolicy() }) };
}

test("boundary parser distinguishes imports from strings/comments and inspects ESM and dynamic imports", () => {
  const imports = collectImports(`// require("./ignored")
const text = 'require("./also-ignored")';
const module = require("node:fs");
import item from "./esm.js";
export { x } from "./reexport.js";
import("./lazy.js");
require(variable);
void text; void module; void item;
`);
  assert.deepEqual(imports.map((item) => item.specifier), ["node:fs", "./esm.js", "./reexport.js", "./lazy.js", null]);
  assert.equal(imports[0].line, 3);
  assert.deepEqual(collectImports(""), []);
  assert.throws(() => collectImports(null), /bounded text/);
  assert.throws(() => collectImports("x".repeat(4 * 1024 * 1024 + 1)), /bounded text/);
  assert.throws(() => collectImports("require("), /cannot be parsed/);
});

test("boundary parser accepts CommonJS source files with legacy function redeclarations", () => {
  const imports = collectImports(`
function duplicate() { return 1; }
function duplicate() { return 2; }
const dependency = require("./dependency");
`);
  assert.deepEqual(imports.map((entry) => entry.specifier), ["./dependency"]);
});

test("boundary gate scans non-index and bin files and detects undeclared deep sibling dependencies", (t) => {
  const f = workspace(t);
  f.add("feature"); f.add("dependency");
  f.write("packages/dependency/submodule.js", "module.exports = {};\n");
  f.write("packages/feature/bin/worker.js", 'require("../../dependency/submodule");\n');
  assert.throws(f.verify, /feature\/bin\/worker.js:1 missing direct runtime dependency @fixture\/dependency/);
  f.add("feature", { "@fixture/dependency": "1.0.0" });
  assert.equal(f.verify().fileCount, 4);
});

test("boundary gate rejects dev-only external imports, dynamic requires, escapes and unresolved files", (t) => {
  const f = workspace(t); f.add("feature");
  f.write("packages/feature/package.json", JSON.stringify({ name: "@fixture/feature", devDependencies: { external: "1.0.0" } }));
  for (const [source, expected] of [
    ['require("external/submodule");', /missing direct runtime dependency external/],
    ["require(variable);", /literal, non-empty/],
    ['require("../../../outside");', /escapes the workspace/],
    ['require("./missing");', /cannot be resolved/]
  ]) {
    f.write("packages/feature/non-index.js", source);
    assert.throws(f.verify, expected);
  }
});

test("boundary gate rejects upward domain dependencies even when explicitly declared", (t) => {
  const f = workspace(t);
  f.add("feature-core", { "@fixture/cli": "1.0.0" }); f.add("cli");
  f.write("packages/feature-core/deep.js", 'require("../cli");');
  assert.throws(f.verify, /forbidden layer dependency feature-core -> cli/);
});

test("layer policy is declarative and fails closed on malformed rules", () => {
  const policy = loadLayerPolicy(path.resolve(__dirname, "..", "config", "layer-policy.json"));
  assert.equal(forbiddenLayer("feature-core", "mcp-server", policy), true);
  assert.equal(forbiddenLayer("mcp-server", "feature-core", policy), false);
  assert.equal(forbiddenLayer("capability-runtime", "capability-contracts", policy), false);
  assert.equal(forbiddenLayer("capability-runtime", "ppt-quality-core", policy), true);
  assert.equal(forbiddenLayer("slideclone-core", "team-runtime", policy), true);
  assert.equal(forbiddenLayer("slideclone-core", "slideclone-native-engine", policy), true);
  assert.equal(forbiddenLayer("slideclone-worker-adapter", "slideclone-native-engine", policy), true);
  assert.ok(policyPackageReferences(policy).includes("remote-mcp-server"));
  assert.ok(policyPackageReferences(policy).includes("slideclone-core"));
  assert.throws(() => validateLayerPolicy({ version: 1, transports: ["cli"], forbiddenSources: [], allowedDependencies: {}, forbiddenDependencies: {}, extra: true }), /layer policy/);
  assert.throws(() => validateLayerPolicy({ version: 1, transports: ["cli", "cli"], forbiddenSources: [], allowedDependencies: {}, forbiddenDependencies: {} }), /transports/);
});

test("boundary gate validates package main and exports as package-owned files", (t) => {
  assert.deepEqual(packageSurfaceTargets({ main: "index.js", exports: { ".": "./index.js", "./feature": { require: "./feature.js" } } }), [
    { label: "main", target: "index.js" },
    { label: "exports[.]", target: "./index.js" },
    { label: "exports[./feature].require", target: "./feature.js" }
  ]);
  assert.throws(() => packageSurfaceTargets({ exports: ["./index.js"] }), /package surface/);

  const f = workspace(t);
  f.add("feature");
  f.write("packages/feature/package.json", JSON.stringify({ name: "@fixture/feature", version: "1.0.0", main: "../outside.js" }));
  assert.throws(f.verify, /feature package main escapes the package/);

  f.write("packages/feature/package.json", JSON.stringify({ name: "@fixture/feature", version: "1.0.0", main: "index.js", exports: { ".": "./missing.js" } }));
  assert.throws(f.verify, /feature package exports\[.\] references a missing file/);

  f.write("packages/feature/package.json", JSON.stringify({ name: "@fixture/feature", version: "1.0.0", main: "index.js", exports: { ".": "../outside.js" } }));
  assert.throws(f.verify, /feature package exports\[.\] must target a relative package export file/);
});

test("boundary gate validates strict layer policy references against workspace packages", (t) => {
  const f = workspace(t);
  f.add("feature-core");
  assert.throws(() => verifyWorkspaceBoundaries({
    workspaceRoot: f.root,
    packagePolicy: { version: 1, workspaceDependencyVersion: "1.0.0", packages: { "feature-core": [] } },
    policy: { version: 1, transports: [], forbiddenSources: [], allowedDependencies: { "feature-core": ["missing-core"] }, forbiddenDependencies: {} },
    strictPolicyReferences: true
  }), /layer policy references unknown workspace package missing-core/);
});

test("boundary gate keeps slideclone core below worker orchestration, native engine, and unrelated capabilities", (t) => {
  const f = workspace(t);
  for (const target of ["team-runtime", "project-audit-core", "slideclone-native-engine", "slideclone-worker-adapter"]) {
    f.add("slideclone-core", { [`@fixture/${target}`]: "1.0.0" });
    f.add(target);
    f.write("packages/slideclone-core/deep.js", `require("../${target}");`);
    assert.throws(f.verify, new RegExp(`forbidden layer dependency slideclone-core -> ${target}`));
  }
});

test("boundary gate keeps worker adapter independent from the native engine payload", (t) => {
  const f = workspace(t);
  f.add("slideclone-worker-adapter", { "@fixture/slideclone-native-engine": "1.0.0" });
  f.add("slideclone-native-engine");
  f.write("packages/slideclone-worker-adapter/deep.js", 'require("../slideclone-native-engine");');
  assert.throws(f.verify, /forbidden layer dependency slideclone-worker-adapter -> slideclone-native-engine/);
});

test("boundary gate detects cycles created by non-index modules", (t) => {
  const f = workspace(t);
  f.add("one", { "@fixture/two": "1.0.0" }); f.add("two", { "@fixture/one": "1.0.0" });
  f.write("packages/one/extra.js", 'require("../two");');
  f.write("packages/two/extra.js", 'require("../one");');
  assert.throws(f.verify, /dependency cycle: one -> two -> one/);
});

test("native-engine package must not import bundled runtime assets outside workspace packages", (t) => {
  const f = workspace(t); f.add("slideclone-native-engine");
  const target = "runtime/slideclone-native-engine/scripts/rebuild-real-pptx-native.js";
  const file = "packages/slideclone-native-engine/index.js";
  f.write(target, "module.exports = {};");
  f.write(file, `require("../../${target}");`);
  assert.throws(f.verify, /imports outside workspace packages/);
});

test("native-engine runtime import cannot expand to CLI, Workers or other domain modules", (t) => {
  const f = workspace(t);
  const target = "runtime/slideclone-native-engine/scripts/rebuild-real-pptx-native.js";
  f.write(target, "module.exports = {};");
  for (const folder of ["cli", "remote-mcp-server", "feature-core", "slideclone-core"]) f.add(folder);
  for (const file of [
    "packages/cli/index.js",
    "packages/slideclone-core/index.js",
    "packages/remote-mcp-server/bin/other-worker.js",
    "packages/remote-mcp-server/bin/nested/common-tools-team-image-worker.js",
    "packages/remote-mcp-server/common-tools-team-image-worker.js",
    "packages/feature-core/index.js"
  ]) {
    const specifier = path.relative(path.dirname(path.join(f.root, file)), path.join(f.root, target)).replaceAll("\\", "/");
    f.write(file, `require(${JSON.stringify(specifier)});`);
    assert.throws(f.verify, /imports outside workspace packages/, file);
    f.write(file, '"use strict";');
  }
});

test("boundary gate fails closed on empty and duplicate package inventories", (t) => {
  const f = workspace(t);
  assert.throws(f.verify, /no workspace packages/);
  f.add("one"); f.add("two");
  f.write("packages/two/package.json", JSON.stringify({ name: "@fixture/one" }));
  assert.throws(f.verify, /unique non-empty/);
});

test("actual repository passes the whole-package boundary gate", () => {
  const result = verifyWorkspaceBoundaries(path.resolve(__dirname, ".."));
  assert.ok(result.packageCount > 0);
  assert.ok(result.fileCount > result.packageCount);
});
