"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { SLIDECLONE_TIMEOUT_MS, createBundledSlidecloneRunner, inspectBundledSlideclone } = require("../packages/cli/slideclone-runner");

test("slideclone core depends on an execution port instead of the skill or process layer", () => {
  const core = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-core", "index.js"), "utf8");
  assert.doesNotMatch(core, /node:child_process|skills[\\/]pd-hifi-slideclone/);
  assert.match(core, /typeof executeSlideclone !== "function"/);
});

test("bundled slideclone runner executes a fixed entry point with bounded arguments", (t) => {
  const fixture = makeFixture(t);
  const inspection = inspectBundledSlideclone({ repositoryRoot: path.join(fixture.root, ".") });
  assert.equal(inspection.root, fs.realpathSync.native(fixture.root));
  let invocation;
  const execute = createBundledSlidecloneRunner({
    repositoryRoot: fixture.root,
    spawn(command, args, options) {
      invocation = { command, args, options };
      return { status: 0, stdout: "", stderr: "" };
    }
  });

  assert.equal(execute({ configPath: fixture.config, inputPath: fixture.input }).status, 0);
  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.args, [fixture.script, "run", "--config", fixture.config, "--input-file", fixture.input]);
  assert.equal(invocation.options.timeout, SLIDECLONE_TIMEOUT_MS);
  assert.equal(invocation.options.windowsHide, true);
});

test("bundled slideclone runner rejects malformed, relative, missing, and excessive paths", (t) => {
  const fixture = makeFixture(t);
  const execute = createBundledSlidecloneRunner({ repositoryRoot: fixture.root, spawn: () => ({ status: 0 }) });
  assert.throws(() => execute(null), /request is invalid/);
  assert.throws(() => execute({ configPath: "relative.json", inputPath: fixture.input }), /bounded absolute path/);
  assert.throws(() => execute({ configPath: path.join(fixture.root, "missing.json"), inputPath: fixture.input }), /must identify a file/);
  assert.throws(() => execute({ configPath: `${path.parse(fixture.root).root}${"x".repeat(5000)}`, inputPath: fixture.input }), /bounded absolute path/);
  assert.throws(() => createBundledSlidecloneRunner({ repositoryRoot: fixture.root, spawn: null }), /process adapter/);
});

test("bundled slideclone runner fails closed when its fixed entry point is absent", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-runner-missing-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(inspectBundledSlideclone({ repositoryRoot: root }), { available: false, reason: "entry-point-missing" });
  assert.throws(() => createBundledSlidecloneRunner({ repositoryRoot: root }), /install or upgrade the complete Common Tools Runtime/);
});

function makeFixture(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-runner-test-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = path.join(root, "skills", "pd-hifi-slideclone", "scripts", "slideclone.js");
  const config = path.join(root, "slideclone.config.json");
  const input = path.join(root, "page.png");
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.writeFileSync(script, "#!/usr/bin/env node\n", "utf8");
  fs.writeFileSync(config, "{}", "utf8");
  fs.writeFileSync(input, "image", "utf8");
  return { root, script: fs.realpathSync.native(script), config: path.resolve(config), input: path.resolve(input) };
}
