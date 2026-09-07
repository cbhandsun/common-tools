"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { collectImports, verifyWorkspaceBoundaries } = require("../scripts/verify-workspace-boundaries");

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
  return { root, write, add, verify: () => verifyWorkspaceBoundaries(root) };
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

test("boundary gate detects cycles created by non-index modules", (t) => {
  const f = workspace(t);
  f.add("one", { "@fixture/two": "1.0.0" }); f.add("two", { "@fixture/one": "1.0.0" });
  f.write("packages/one/extra.js", 'require("../two");');
  f.write("packages/two/extra.js", 'require("../one");');
  assert.throws(f.verify, /dependency cycle: one -> two -> one/);
});

test("only the existing Worker-to-native-engine composition edge is permitted", (t) => {
  const f = workspace(t); f.add("remote-mcp-server");
  const target = "skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native.js";
  const file = "packages/remote-mcp-server/bin/common-tools-team-image-worker.js";
  f.write(target, "module.exports = {};");
  f.write(file, `require("../../../${target}");`);
  assert.deepEqual(f.verify().legacyEdges, [{ file, line: 1, target }]);
  f.write("skills/other.js", "module.exports = {};");
  f.write(file, 'require("../../../skills/other.js");');
  assert.throws(f.verify, /imports outside workspace packages/);
});

test("composition exceptions cannot expand to CLI, other Workers or domain modules", (t) => {
  const f = workspace(t);
  const target = "skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native.js";
  f.write(target, "module.exports = {};");
  for (const folder of ["cli", "remote-mcp-server", "feature-core"]) f.add(folder);
  for (const file of [
    "packages/cli/index.js",
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
