"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  buildPluginComponentInventory
} = require("./lib/plugin-component-registry");

function parseArgs(argv) {
  const args = {
    out: path.join("runs", "plugin-component-inventory", "inventory.json"),
    maxDepth: 5,
    maxFilesPerRoot: 600,
    maxTotalFiles: 3000,
    learnStructure: false,
    learnMaxAssets: 20,
    learnMaxSlides: 4,
    learnMaxComponentCatalogItems: 12,
    selfFidelityReport: "",
    requireSelfFidelityPromoted: false,
    includeProviderRoots: false,
    assetStoreRoot: "",
    roots: null
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if (arg === "--max-depth" && next) {
      args.maxDepth = Number(next);
      i += 1;
    } else if (arg === "--max-files-per-root" && next) {
      args.maxFilesPerRoot = Number(next);
      i += 1;
    } else if (arg === "--max-total-files" && next) {
      args.maxTotalFiles = Number(next);
      i += 1;
    } else if (arg === "--learn-structure") {
      args.learnStructure = true;
    } else if (arg === "--learn-max-assets" && next) {
      args.learnMaxAssets = Number(next);
      i += 1;
    } else if (arg === "--learn-max-slides" && next) {
      args.learnMaxSlides = Number(next);
      i += 1;
    } else if (arg === "--learn-max-component-catalog-items" && next) {
      args.learnMaxComponentCatalogItems = Number(next);
      i += 1;
    } else if (arg === "--self-fidelity-report" && next) {
      args.selfFidelityReport = next;
      i += 1;
    } else if (arg === "--require-self-fidelity-promoted") {
      args.requireSelfFidelityPromoted = true;
    } else if (arg === "--include-provider-roots") {
      args.includeProviderRoots = true;
    } else if (arg === "--asset-store-root" && next) {
      args.assetStoreRoot = next;
      i += 1;
    } else if (arg === "--root" && next) {
      args.roots = [...(args.roots || []), next];
      i += 1;
    } else {
      throw new Error(`Unknown plugin-component-inventory argument: ${arg}`);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const inventory = buildPluginComponentInventory({
    ...args,
    selfFidelityPromotionReport: args.selfFidelityReport ? readBoundedPromotionReport(args.selfFidelityReport) : null
  });
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(inventory, null, 2)}\n`);
  const summary = inventory.summary || {};
  console.log(`plugin component candidates: ${summary.total || 0}`);
  console.log(`providers: ${JSON.stringify(summary.byProvider || {})}`);
  console.log(`assetKinds: ${JSON.stringify(summary.byAssetKind || {})}`);
  console.log(`mode: ${inventory.mode || "offline-local"}`);
  if (args.learnStructure) {
    console.log(`learnedStructures: ${summary.learnedStructures || 0}`);
    console.log(`structureSignatures: ${summary.structureSignatures || 0}`);
  }
  console.log(`report: ${path.resolve(args.out)}`);
}

function readBoundedPromotionReport(file) {
  const resolved = path.resolve(String(file || ""));
  const stat = fs.statSync(resolved);
  if (!stat.isFile() || stat.size <= 0 || stat.size > 8 * 1024 * 1024) throw new Error("self-fidelity report exceeds the inventory boundary");
  const report = JSON.parse(fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/, ""));
  if (report?.provider !== "component-asset-self-fidelity-batch-v1" || !Array.isArray(report.results)) {
    throw new Error("self-fidelity report has an invalid contract");
  }
  return report;
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  readBoundedPromotionReport
};
