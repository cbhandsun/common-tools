"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs
} = require("../skills/pd-hifi-slideclone/scripts/plugin-component-inventory");

test("plugin component inventory parses explicit roots and limits", () => {
  const args = parseArgs([
    "node",
    "plugin-component-inventory.js",
    "--root",
    "runs/components",
    "--root",
    "C:\\OfficePLUS",
    "--out",
    "runs/inventory.json",
    "--max-depth",
    "7",
    "--max-files-per-root",
    "40",
    "--max-total-files",
    "100",
    "--self-fidelity-report",
    "runs/promoted.json",
    "--require-self-fidelity-promoted",
    "--include-provider-roots",
    "--asset-store-root",
    "runs/store"
  ]);

  assert.deepEqual(args.roots, ["runs/components", "C:\\OfficePLUS"]);
  assert.equal(args.out, "runs/inventory.json");
  assert.equal(args.maxDepth, 7);
  assert.equal(args.maxFilesPerRoot, 40);
  assert.equal(args.maxTotalFiles, 100);
  assert.equal(args.selfFidelityReport, "runs/promoted.json");
  assert.equal(args.requireSelfFidelityPromoted, true);
  assert.equal(args.includeProviderRoots, true);
  assert.equal(args.assetStoreRoot, "runs/store");
});

test("plugin component inventory rejects unknown arguments instead of silently scanning defaults", () => {
  assert.throws(
    () => parseArgs(["node", "plugin-component-inventory.js", "--component-root", "runs/components"]),
    /Unknown plugin-component-inventory argument/
  );
});
