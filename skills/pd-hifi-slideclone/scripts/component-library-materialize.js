"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  assetRegistryPath,
  defaultComponentAssetStoreRoot,
  materializeComponentInventory
} = require("./lib/component-asset-store");

function parseArgs(argv) {
  const args = {
    inventory: path.join("runs", "plugin-component-inventory", "inventory.json"),
    storeRoot: defaultComponentAssetStoreRoot(),
    includeReferenceAssets: false,
    strict: true,
    maxSourceBytes: 250 * 1024 * 1024
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--inventory" && next) {
      args.inventory = next;
      index += 1;
    } else if (arg === "--store-root" && next) {
      args.storeRoot = next;
      index += 1;
    } else if (arg === "--include-reference-assets") {
      args.includeReferenceAssets = true;
    } else if (arg === "--allow-failures") {
      args.strict = false;
    } else if (arg === "--max-source-bytes" && next) {
      args.maxSourceBytes = positiveInteger(next, "--max-source-bytes");
      index += 1;
    } else {
      throw new Error(`Unknown component-library-materialize argument: ${arg}`);
    }
  }
  return args;
}

function readInventory(file) {
  const resolved = path.resolve(String(file || ""));
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || stat.size <= 0 || stat.size > 64 * 1024 * 1024) throw new Error("component inventory exceeds the materialization boundary");
  const inventory = JSON.parse(fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/, ""));
  if (inventory?.provider !== "plugin-component-registry-v1" || !Array.isArray(inventory.candidates)) {
    throw new Error("component inventory has an invalid contract");
  }
  return inventory;
}

function main() {
  const args = parseArgs(process.argv);
  const result = materializeComponentInventory(readInventory(args.inventory), args);
  const summary = result.registry.summary;
  process.stdout.write([
    `component assets stored: ${summary.storedAssets}`,
    `materialized: ${summary.materialized}`,
    `deduplicated: ${summary.deduplicated}`,
    `skipped: ${summary.skipped}`,
    `failed: ${summary.failed}`,
    `registry: ${assetRegistryPath(args.storeRoot)}`
  ].join("\n") + "\n");
}

function positiveInteger(value, label) {
  const number = Math.trunc(Number(value));
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`);
  return number;
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  readInventory
};
