"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SCRIPT_DIR = __dirname;

function parseArgs(argv) {
  const args = {
    outDir: path.join("runs", "plugin-component-inventory"),
    ir: "",
    liveSearch: false,
    harvestActive: false,
    harvestISlideTemp: false,
    harvestOfficePlusLocal: false,
    watchPluginDownloads: false,
    watchProvider: "all",
    watchFiles: [],
    watchDurationMs: 30000,
    watchPollMs: 1000,
    harvestProvider: "islide",
    harvestLabel: "active-powerpoint-component",
    harvestSaveRoot: path.join("runs", "plugin-component-inventory", "manual-applied-components"),
    harvestOut: "",
    harvestDiscoverRoot: "",
    harvestDiscoverLimit: 12,
    harvestAttempts: 8,
    harvestDelayMs: 800,
    skipInventory: false,
    skipCandidates: false,
    skipAssetManifest: false,
    skipMaterialize: false,
    includeProviderRoots: false,
    includeReferenceAssets: false,
    componentStoreRoot: path.join("runs", "plugin-component-inventory"),
    failOnMissingReady: false,
    roots: [],
    motifs: [],
    maxDepth: 5,
    maxFilesPerRoot: 600,
    maxTotalFiles: 3000,
    maxAssetsPerLayer: 4,
    learnStructure: false,
    learnMaxAssets: 20,
    learnMaxSlides: 4,
    learnMaxComponentCatalogItems: 12,
    selfFidelityReport: "",
    requireSelfFidelityPromoted: false,
    size: 6
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--out-dir" && next) {
      args.outDir = next;
      i += 1;
    } else if (arg === "--ir" && next) {
      args.ir = next;
      i += 1;
    } else if (arg === "--live-search") {
      args.liveSearch = true;
    } else if (arg === "--harvest-active") {
      args.harvestActive = true;
    } else if (arg === "--harvest-islide-temp") {
      args.harvestISlideTemp = true;
      args.harvestOfficePlusLocal = true;
    } else if (arg === "--harvest-officeplus-local") {
      args.harvestOfficePlusLocal = true;
    } else if (arg === "--watch-plugin-downloads") {
      args.watchPluginDownloads = true;
    } else if (arg === "--watch-provider" && next) {
      args.watchProvider = next;
      i += 1;
    } else if ((arg === "--watch-file" || arg === "--watch-source") && next) {
      args.watchFiles.push(next);
      i += 1;
    } else if (arg === "--watch-duration-ms" && next) {
      args.watchDurationMs = Number(next);
      i += 1;
    } else if (arg === "--watch-poll-ms" && next) {
      args.watchPollMs = Number(next);
      i += 1;
    } else if (arg === "--harvest-provider" && next) {
      args.harvestProvider = next;
      i += 1;
    } else if (arg === "--harvest-label" && next) {
      args.harvestLabel = next;
      i += 1;
    } else if (arg === "--harvest-save-root" && next) {
      args.harvestSaveRoot = next;
      i += 1;
    } else if (arg === "--harvest-out" && next) {
      args.harvestOut = next;
      i += 1;
    } else if (arg === "--harvest-discover-root" && next) {
      args.harvestDiscoverRoot = next;
      i += 1;
    } else if (arg === "--harvest-discover-limit" && next) {
      args.harvestDiscoverLimit = Number(next);
      i += 1;
    } else if (arg === "--harvest-attempts" && next) {
      args.harvestAttempts = Number(next);
      i += 1;
    } else if (arg === "--harvest-delay-ms" && next) {
      args.harvestDelayMs = Number(next);
      i += 1;
    } else if (arg === "--skip-inventory") {
      args.skipInventory = true;
    } else if (arg === "--skip-candidates") {
      args.skipCandidates = true;
    } else if (arg === "--skip-asset-manifest") {
      args.skipAssetManifest = true;
    } else if (arg === "--skip-materialize") {
      args.skipMaterialize = true;
    } else if (arg === "--include-provider-roots") {
      args.includeProviderRoots = true;
    } else if (arg === "--include-reference-assets") {
      args.includeReferenceAssets = true;
    } else if (arg === "--component-store-root" && next) {
      args.componentStoreRoot = next;
      i += 1;
    } else if (arg === "--fail-on-missing-ready") {
      args.failOnMissingReady = true;
    } else if (arg === "--root" && next) {
      args.roots.push(next);
      i += 1;
    } else if (arg === "--motifs" && next) {
      args.motifs = splitList(next);
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
    } else if (arg === "--max-assets-per-layer" && next) {
      args.maxAssetsPerLayer = Number(next);
      i += 1;
    } else if (arg === "--size" && next) {
      args.size = Number(next);
      i += 1;
    } else {
      throw new Error(`Unknown component-library-refresh argument: ${arg}`);
    }
  }
  return args;
}

function buildRefreshPlan(options = {}) {
  const args = { ...parseArgs(["node", "component-library-refresh.js"]), ...options };
  if (args.harvestISlideTemp) args.harvestOfficePlusLocal = true;
  const outDir = args.outDir || path.join("runs", "plugin-component-inventory");
  const paths = {
    harvestedAppliedComponents: args.harvestOut || path.join(outDir, "harvested-active-components"),
    harvestedISlideTempComponents: path.join(outDir, "harvested-islide-temp-components"),
    harvestedOfficePlusLocalComponents: path.join(outDir, "harvested-officeplus-local-components"),
    watchedPluginComponents: path.join(outDir, "watched-plugin-components"),
    inventory: path.join(outDir, "inventory.json"),
    candidates: path.join(outDir, "component-candidates.json"),
    assetManifest: path.join(outDir, "component-asset-manifest.json"),
    motifRecall: path.join(outDir, "component-motif-recall-report.json"),
    actionQueue: path.join(outDir, "component-plugin-action-queue.json"),
    actionQueueGuide: path.join(outDir, "component-plugin-action-queue.md"),
    assetRegistry: path.join(args.componentStoreRoot, "asset-registry.json")
  };
  const steps = [];
  if (args.harvestActive) {
    steps.push({
      name: "harvest-active-powerpoint-component",
      command: process.execPath,
      args: [
        scriptPath("harvest-active-powerpoint-component.js"),
        "--provider",
        args.harvestProvider,
        "--label",
        args.harvestLabel,
        "--save-root",
        args.harvestSaveRoot,
        "--out",
        paths.harvestedAppliedComponents,
        "--attempts",
        String(args.harvestAttempts),
        "--delay-ms",
        String(args.harvestDelayMs),
        "--active-slide-only"
      ]
    });
  }
  if (args.harvestISlideTemp) {
    steps.push({
      name: "harvest-islide-temp-components",
      command: process.execPath,
      args: [
        scriptPath("harvest-applied-ppt-components.js"),
        "--provider",
        "islide",
        "--out",
        paths.harvestedISlideTempComponents,
        "--discover-islide-temp",
        "--discover-limit",
        String(args.harvestDiscoverLimit),
        ...(args.harvestDiscoverRoot ? ["--discover-root", args.harvestDiscoverRoot] : [])
      ]
    });
  }
  if (args.harvestOfficePlusLocal) {
    steps.push({
      name: "harvest-officeplus-local-components",
      command: process.execPath,
      args: [
        scriptPath("harvest-applied-ppt-components.js"),
        "--provider",
        "officeplus",
        "--out",
        paths.harvestedOfficePlusLocalComponents,
        "--discover-officeplus-local",
        "--discover-limit",
        String(args.harvestDiscoverLimit),
        ...(args.harvestDiscoverRoot ? ["--discover-root", args.harvestDiscoverRoot] : [])
      ]
    });
  }
  if (args.watchPluginDownloads) {
    steps.push({
      name: "watch-plugin-component-downloads",
      command: process.execPath,
      args: [
        scriptPath("watch-plugin-component-downloads.js"),
        "--out",
        paths.watchedPluginComponents,
        "--provider",
        args.watchProvider,
        "--duration-ms",
        String(args.watchDurationMs),
        "--poll-ms",
        String(args.watchPollMs),
        "--max-files",
        String(args.maxTotalFiles),
        ...args.watchFiles.flatMap((file) => ["--file", file])
      ]
    });
  }
  if (!args.skipInventory) {
    steps.push({
      name: "plugin-component-inventory",
      command: process.execPath,
      args: [
        scriptPath("plugin-component-inventory.js"),
        "--out",
        paths.inventory,
        "--max-depth",
        String(args.maxDepth),
        "--max-files-per-root",
        String(args.maxFilesPerRoot),
        "--max-total-files",
        String(args.maxTotalFiles),
        ...(args.learnStructure ? [
          "--learn-structure",
          "--learn-max-assets",
          String(args.learnMaxAssets),
          "--learn-max-slides",
          String(args.learnMaxSlides),
          "--learn-max-component-catalog-items",
          String(args.learnMaxComponentCatalogItems)
        ] : []),
        ...(args.selfFidelityReport ? ["--self-fidelity-report", args.selfFidelityReport] : []),
        ...(args.requireSelfFidelityPromoted ? ["--require-self-fidelity-promoted"] : []),
        ...(args.includeProviderRoots ? ["--include-provider-roots"] : []),
        "--asset-store-root",
        args.componentStoreRoot,
        ...rootArgs(refreshInventoryRoots(args, paths))
      ]
    });
  }
  if (!args.skipCandidates) {
    const candidateArgs = [
      scriptPath("component-candidate-search.js"),
      "--out",
      paths.candidates,
      "--size",
      String(args.size)
    ];
    if (args.ir) candidateArgs.push("--ir", args.ir);
    if (args.motifs && args.motifs.length) candidateArgs.push("--target-motifs", args.motifs.join(","));
    if (!args.liveSearch) candidateArgs.push("--dry-run");
    steps.push({
      name: "component-candidate-search",
      command: process.execPath,
      args: candidateArgs
    });
  }
  if (!args.skipAssetManifest) {
    steps.push({
      name: "component-asset-manifest",
      command: process.execPath,
      args: [
        scriptPath("component-asset-manifest.js"),
        "--candidates",
        paths.candidates,
        "--inventory",
        paths.inventory,
        "--out",
        paths.assetManifest,
        "--max-assets-per-layer",
        String(args.maxAssetsPerLayer)
      ]
    });
  }
  steps.push({
    name: "component-motif-recall-report",
    command: process.execPath,
    args: [
      scriptPath("component-motif-recall-report.js"),
      "--candidate-report",
      paths.candidates,
      "--asset-manifest",
      paths.assetManifest,
      "--inventory",
      paths.inventory,
      "--out",
      paths.motifRecall,
      ...(args.failOnMissingReady ? ["--fail-on-missing-ready"] : [])
    ]
  });
  steps.push({
    name: "component-plugin-action-queue",
    command: process.execPath,
    args: [
      scriptPath("component-plugin-action-queue.js"),
      "--motif-recall",
      paths.motifRecall,
      "--out",
      paths.actionQueue,
      "--markdown-out",
      paths.actionQueueGuide,
      "--max-actions",
      String(args.maxAssetsPerLayer * 4)
    ]
  });
  if (!args.skipMaterialize) {
    steps.push({
      name: "component-library-materialize",
      command: process.execPath,
      args: [
        scriptPath("component-library-materialize.js"),
        "--inventory",
        paths.inventory,
        "--store-root",
        args.componentStoreRoot,
        ...(args.includeReferenceAssets ? ["--include-reference-assets"] : [])
      ]
    });
  }
  return {
    provider: "component-library-refresh-plan-v1",
    outDir,
    mode: args.liveSearch ? "live-search" : "dry-run",
    paths,
    steps
  };
}

function runRefreshPlan(plan, runner = runStep) {
  fs.mkdirSync(plan.outDir, { recursive: true });
  const results = [];
  for (const step of plan.steps) {
    const result = runner(step);
    results.push({
      name: step.name,
      status: result.status === 0 ? "ok" : "failed",
      exitCode: result.status,
      stdout: result.stdout || "",
      stderr: result.stderr || ""
    });
    if (result.status !== 0) {
      const error = new Error(`component library refresh failed at ${step.name}`);
      error.results = results;
      throw error;
    }
  }
  return {
    provider: "component-library-refresh-result-v1",
    mode: plan.mode,
    paths: plan.paths,
    results
  };
}

function runStep(step) {
  return spawnSync(step.command, step.args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function rootArgs(roots) {
  return (roots || []).flatMap((root) => ["--root", root]);
}

function refreshInventoryRoots(args = {}, paths = {}) {
  const roots = [];
  if (args.harvestActive) roots.push(paths.harvestedAppliedComponents);
  if (args.harvestISlideTemp) roots.push(paths.harvestedISlideTempComponents);
  if (args.harvestOfficePlusLocal) roots.push(paths.harvestedOfficePlusLocalComponents);
  if (args.watchPluginDownloads) roots.push(path.join(paths.watchedPluginComponents, "islide"), path.join(paths.watchedPluginComponents, "officeplus"));
  roots.push(...(Array.isArray(args.roots) ? args.roots : []));
  return roots.filter(Boolean);
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function scriptPath(file) {
  return path.join(SCRIPT_DIR, file);
}

function main() {
  const args = parseArgs(process.argv);
  const plan = buildRefreshPlan(args);
  const result = runRefreshPlan(plan);
  console.log(`component library refresh: ${result.mode}`);
  for (const entry of result.results) {
    console.log(`- ${entry.name}: ${entry.status}`);
  }
  console.log(`motif report: ${path.resolve(result.paths.motifRecall)}`);
  console.log(`action queue: ${path.resolve(result.paths.actionQueue)}`);
  console.log(`action guide: ${path.resolve(result.paths.actionQueueGuide)}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    if (Array.isArray(error.results)) {
      for (const result of error.results) {
        process.stderr.write(`${result.name}: ${result.status}\n`);
        if (result.stderr) process.stderr.write(result.stderr);
      }
    }
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  buildRefreshPlan,
  runRefreshPlan,
  _private: {
    rootArgs,
    refreshInventoryRoots,
    scriptPath
  }
};
