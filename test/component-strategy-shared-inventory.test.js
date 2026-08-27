"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  injectSharedComponentInventoryArgs,
  prepareSharedComponentInventory
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-strategy-shared-inventory");

test("shared component inventory strips every worker-local discovery boundary", () => {
  const snapshot = path.resolve("snapshot.json");
  const argv = injectSharedComponentInventoryArgs([
    "--component-assets", "true",
    "--component-inventory-cache", "old.json",
    "--component-asset-root", "assets-a",
    "--component-asset-root", "assets-b",
    "--applied-component-source", "source.pptx",
    "--harvest-islide-temp",
    "--harvest-officeplus-local",
    "--reuse-analysis"
  ], snapshot);

  assert.deepEqual(argv, [
    "--component-assets", "true",
    "--reuse-analysis",
    "--component-inventory", snapshot
  ]);
});

test("parallel preparation snapshots an explicit inventory once for all workers", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-shared-inventory-"));
  const inventoryFile = path.join(root, "input.json");
  fs.writeFileSync(inventoryFile, JSON.stringify({
    provider: "test-inventory",
    candidates: [{ id: "one", path: path.join(root, "one.pptx"), roleTags: [] }]
  }), "utf8");

  const prepared = prepareSharedComponentInventory({
    argv: ["--component-assets", "true", "--component-inventory", inventoryFile],
    outRoot: path.join(root, "out"),
    workerArgv: (argv) => argv.slice()
  });

  assert.equal(prepared.enabled, true);
  assert.equal(prepared.report.mode, "parent-snapshot");
  assert.equal(prepared.report.candidates, 1);
  assert.match(prepared.report.sha256, /^[a-f0-9]{64}$/);
  assert.equal(fs.statSync(prepared.report.file).isFile(), true);
  assert.equal(prepared.argv.includes("--component-inventory-cache"), false);
  assert.equal(prepared.argv.at(-2), "--component-inventory");
  assert.equal(prepared.argv.at(-1), prepared.report.file);

  const repeated = prepareSharedComponentInventory({
    argv: ["--component-assets", "true", "--component-inventory", inventoryFile],
    outRoot: path.join(root, "out"),
    workerArgv: (argv) => argv.slice()
  });
  assert.equal(repeated.report.file, prepared.report.file);
});

test("shared component inventory is inert when component assets are disabled", () => {
  const prepared = prepareSharedComponentInventory({
    argv: ["--reuse-analysis"],
    outRoot: path.resolve("out"),
    workerArgv: (argv) => argv.slice()
  });
  assert.equal(prepared.enabled, false);
  assert.deepEqual(prepared.argv, ["--reuse-analysis"]);
});
