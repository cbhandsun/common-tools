"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { buildComponentAssetManifest } = require("./lib/component-asset-matcher");
const { buildPluginComponentInventory } = require("./lib/plugin-component-registry");

function parseArgs(argv) {
  const args = {
    candidates: "",
    inventory: "",
    out: path.join("runs", "plugin-component-inventory", "component-asset-manifest.json"),
    maxAssetsPerLayer: 4,
    maxDepth: 5,
    maxFilesPerRoot: 600,
    maxTotalFiles: 3000,
    roots: null
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--candidates" && next) {
      args.candidates = next;
      i += 1;
    } else if (arg === "--inventory" && next) {
      args.inventory = next;
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if (arg === "--max-assets-per-layer" && next) {
      args.maxAssetsPerLayer = Number(next);
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
    } else if (arg === "--root" && next) {
      args.roots = [...(args.roots || []), next];
      i += 1;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.candidates) throw new Error("--candidates is required");
  const candidateReport = readJson(args.candidates);
  const inventory = args.inventory
    ? readJson(args.inventory)
    : buildPluginComponentInventory({
      roots: args.roots,
      maxDepth: args.maxDepth,
      maxFilesPerRoot: args.maxFilesPerRoot,
      maxTotalFiles: args.maxTotalFiles
    });
  const manifest = buildComponentAssetManifest({
    candidateReport,
    inventory,
    maxAssetsPerLayer: args.maxAssetsPerLayer
  });
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`component asset layers: ${manifest.summary.layers}`);
  console.log(`layersWithLocalAssets: ${manifest.summary.layersWithLocalAssets}`);
  console.log(`localAssetMatches: ${manifest.summary.localAssetMatches}`);
  console.log(`report: ${path.resolve(args.out)}`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs
};
