"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { renameDirectoryAtomically, scaffoldPlan, writeScaffold } = require("../packages/cli/capability-scaffold");
const { validateScaffoldBundle } = require("../packages/cli/bin/common-tools");

test("capability scaffold plans without writing and produces self-contained host packages on explicit write", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-scaffold-"));
  const output = path.join(parent, "design-review");
  try {
    const plan = scaffoldPlan({ name: "design-review", output });
    assert.equal(plan.fileCount, 12);
    assert.equal(fs.existsSync(output), false);
    const written = writeScaffold(plan);
    assert.equal(written.written, true);
    validateScaffoldBundle(output, "design-review");
    assert.equal(fs.existsSync(path.join(output, "capability.manifest.draft.json")), true);
    const readme = fs.readFileSync(path.join(output, "README.md"), "utf8");
    assert.match(readme, /intentionally not registered/);
    assert.match(readme, /team\.deployment/);
    assert.match(readme, /common-tools:verify-capabilities/);
    assert.match(readme, /prerequisite capabilities/);
    assert.throws(() => writeScaffold(plan), /already exists/);
    assert.throws(() => scaffoldPlan({ name: "../../unsafe", output: path.join(parent, "unsafe") }), /name is invalid/);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("CLI scaffold is dry-run by default and requires explicit write", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-scaffold-cli-"));
  const output = path.join(parent, "release-notes");
  try {
    const cli = path.join(__dirname, "..", "packages", "cli", "bin", "common-tools.js");
    const planned = spawnSync(process.execPath, [cli, "plugin", "scaffold", "--name", "release-notes", "--out", output], { encoding: "utf8", windowsHide: true });
    assert.equal(planned.status, 0, planned.stderr);
    assert.equal(JSON.parse(planned.stdout).written, false);
    assert.equal(fs.existsSync(output), false);
    const written = spawnSync(process.execPath, [cli, "plugin", "scaffold", "--name", "release-notes", "--out", output, "--write"], { encoding: "utf8", windowsHide: true });
    assert.equal(written.status, 0, written.stderr);
    assert.equal(JSON.parse(written.stdout).written, true);
    validateScaffoldBundle(output, "release-notes");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("scaffold directory promotion retries transient Windows rename contention", () => {
  const fsModule = require("node:fs");
  const original = fsModule.renameSync;
  let calls = 0;
  try {
    fsModule.renameSync = () => {
      calls += 1;
      if (calls < 3) { const error = new Error("busy"); error.code = "EPERM"; throw error; }
    };
    renameDirectoryAtomically("temporary", "destination");
    assert.equal(calls, 3);
  } finally {
    fsModule.renameSync = original;
  }
});
