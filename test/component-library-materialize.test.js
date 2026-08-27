"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  parseArgs,
  readInventory
} = require("../skills/pd-hifi-slideclone/scripts/component-library-materialize");

test("component library materialize CLI parses bounded explicit options", () => {
  const args = parseArgs([
    "node",
    "component-library-materialize.js",
    "--inventory",
    "runs/source.json",
    "--store-root",
    "runs/store",
    "--include-reference-assets",
    "--allow-failures",
    "--max-source-bytes",
    "4096"
  ]);

  assert.equal(args.inventory, "runs/source.json");
  assert.equal(args.storeRoot, "runs/store");
  assert.equal(args.includeReferenceAssets, true);
  assert.equal(args.strict, false);
  assert.equal(args.maxSourceBytes, 4096);
});

test("component library materialize CLI rejects unknown and invalid numeric arguments", () => {
  assert.throws(() => parseArgs(["node", "component-library-materialize.js", "--unknown"]), /Unknown/);
  assert.throws(() => parseArgs(["node", "component-library-materialize.js", "--max-source-bytes", "0"]), /positive integer/);
  assert.throws(() => parseArgs(["node", "component-library-materialize.js", "--max-source-bytes", "NaN"]), /positive integer/);
});

test("component library materialize CLI validates the inventory file contract", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-materialize-cli-"));
  const valid = path.join(tmp, "valid.json");
  const invalid = path.join(tmp, "invalid.json");
  const empty = path.join(tmp, "empty.json");
  fs.writeFileSync(valid, JSON.stringify({ provider: "plugin-component-registry-v1", candidates: [] }));
  fs.writeFileSync(invalid, JSON.stringify({ provider: "wrong", candidates: [] }));
  fs.writeFileSync(empty, "");

  assert.deepEqual(readInventory(valid).candidates, []);
  assert.throws(() => readInventory(invalid), /invalid contract/);
  assert.throws(() => readInventory(empty), /boundary/);
  assert.throws(() => readInventory(path.join(tmp, "missing.json")), /ENOENT/);
});
