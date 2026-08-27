"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
  parseArgs,
  buildRefreshPlan,
  runRefreshPlan
} = require("../skills/pd-hifi-slideclone/scripts/component-library-refresh");

test("buildRefreshPlan wires safe dry-run component library pipeline by default", () => {
  const plan = buildRefreshPlan({
    outDir: "runs/component-refresh-test",
    ir: "deck.ir.json",
    roots: ["C:/plugin/cache"],
    motifs: ["arc-arrow", "tree-link"],
    size: 9
  });

  assert.equal(plan.mode, "dry-run");
  assert.equal(plan.steps.length, 6);
  assert.deepEqual(plan.steps.map((step) => step.name), [
    "plugin-component-inventory",
    "component-candidate-search",
    "component-asset-manifest",
    "component-motif-recall-report",
    "component-plugin-action-queue",
    "component-library-materialize"
  ]);
  assert.ok(plan.steps[0].args.includes("--root"));
  assert.ok(plan.steps[0].args.includes("C:/plugin/cache"));
  assert.ok(plan.steps[1].args.includes("--dry-run"));
  assert.ok(plan.steps[1].args.includes("--ir"));
  assert.ok(plan.steps[1].args.includes("deck.ir.json"));
  assert.ok(plan.steps[1].args.includes("--target-motifs"));
  assert.ok(plan.steps[1].args.includes("arc-arrow,tree-link"));
  assert.equal(plan.paths.motifRecall, path.join("runs/component-refresh-test", "component-motif-recall-report.json"));
  assert.equal(plan.paths.actionQueue, path.join("runs/component-refresh-test", "component-plugin-action-queue.json"));
  assert.equal(plan.paths.actionQueueGuide, path.join("runs/component-refresh-test", "component-plugin-action-queue.md"));
  assert.ok(plan.steps[4].args.includes("--motif-recall"));
  assert.ok(plan.steps[4].args.includes(path.join("runs/component-refresh-test", "component-motif-recall-report.json")));
  assert.ok(plan.steps[4].args.includes("--markdown-out"));
  assert.ok(plan.steps[4].args.includes(path.join("runs/component-refresh-test", "component-plugin-action-queue.md")));
  assert.equal(plan.steps[5].name, "component-library-materialize");
  assert.ok(plan.steps[5].args.includes(path.join("runs/component-refresh-test", "inventory.json")));
});

test("buildRefreshPlan optionally harvests the active PowerPoint slide before inventory refresh", () => {
  const plan = buildRefreshPlan({
    outDir: "runs/harvest-refresh",
    harvestActive: true,
    harvestProvider: "officeplus",
    harvestLabel: "arc-arrow",
    harvestSaveRoot: "runs/manual-save",
    harvestAttempts: 3,
    harvestDelayMs: 200,
    roots: ["C:/plugin/cache"]
  });

  assert.equal(plan.steps[0].name, "harvest-active-powerpoint-component");
  assert.ok(plan.steps[0].args.includes("--active-slide-only"));
  assert.ok(plan.steps[0].args.includes("--provider"));
  assert.ok(plan.steps[0].args.includes("officeplus"));
  assert.ok(plan.steps[0].args.includes("--label"));
  assert.ok(plan.steps[0].args.includes("arc-arrow"));
  assert.ok(plan.steps[1].args.includes("--root"));
  assert.ok(plan.steps[1].args.includes(path.join("runs/harvest-refresh", "harvested-active-components")));
  assert.ok(plan.steps[1].args.includes("C:/plugin/cache"));
});

test("buildRefreshPlan can harvest downloaded iSlide temp components before inventory refresh", () => {
  const plan = buildRefreshPlan({
    outDir: "runs/islide-temp-refresh",
    harvestISlideTemp: true,
    harvestDiscoverRoot: "C:/Users/me/AppData/Local/Temp/iSlide Tools/site/content/file",
    harvestDiscoverLimit: 5,
    roots: ["C:/plugin/cache"]
  });

  assert.equal(plan.steps[0].name, "harvest-islide-temp-components");
  assert.ok(plan.steps[0].args.includes("--discover-islide-temp"));
  assert.ok(plan.steps[0].args.includes("--discover-root"));
  assert.ok(plan.steps[0].args.includes("C:/Users/me/AppData/Local/Temp/iSlide Tools/site/content/file"));
  assert.ok(plan.steps[0].args.includes("--discover-limit"));
  assert.ok(plan.steps[0].args.includes("5"));
  assert.equal(plan.steps[1].name, "harvest-officeplus-local-components");
  assert.ok(plan.steps[1].args.includes("--discover-officeplus-local"));
  assert.ok(plan.steps[2].args.includes("--root"));
  assert.ok(plan.steps[2].args.includes(path.join("runs/islide-temp-refresh", "harvested-islide-temp-components")));
  assert.ok(plan.steps[2].args.includes(path.join("runs/islide-temp-refresh", "harvested-officeplus-local-components")));
  assert.ok(plan.steps[2].args.includes("C:/plugin/cache"));
});

test("buildRefreshPlan can harvest downloaded OfficePLUS local components before inventory refresh", () => {
  const plan = buildRefreshPlan({
    outDir: "runs/officeplus-local-refresh",
    harvestOfficePlusLocal: true,
    harvestDiscoverRoot: "C:/Users/me/AppData/Local/OfficePLUS",
    harvestDiscoverLimit: 4,
    roots: ["C:/plugin/cache"]
  });

  assert.equal(plan.steps[0].name, "harvest-officeplus-local-components");
  assert.ok(plan.steps[0].args.includes("--discover-officeplus-local"));
  assert.ok(plan.steps[0].args.includes("--provider"));
  assert.ok(plan.steps[0].args.includes("officeplus"));
  assert.ok(plan.steps[0].args.includes("--discover-root"));
  assert.ok(plan.steps[0].args.includes("C:/Users/me/AppData/Local/OfficePLUS"));
  assert.ok(plan.steps[1].args.includes("--root"));
  assert.ok(plan.steps[1].args.includes(path.join("runs/officeplus-local-refresh", "harvested-officeplus-local-components")));
  assert.ok(plan.steps[1].args.includes("C:/plugin/cache"));
});

test("buildRefreshPlan can watch plugin downloads before inventory refresh", () => {
  const plan = buildRefreshPlan({
    outDir: "runs/watch-refresh",
    watchPluginDownloads: true,
    watchProvider: "all",
    watchFiles: ["C:/Decks/active-plugin-component.pptx"],
    watchDurationMs: 5000,
    watchPollMs: 250,
    roots: ["C:/plugin/cache"]
  });

  assert.equal(plan.steps[0].name, "watch-plugin-component-downloads");
  assert.ok(plan.steps[0].args.includes("--duration-ms"));
  assert.ok(plan.steps[0].args.includes("5000"));
  assert.ok(plan.steps[0].args.includes("--poll-ms"));
  assert.ok(plan.steps[0].args.includes("250"));
  assert.ok(plan.steps[0].args.includes("--file"));
  assert.ok(plan.steps[0].args.includes("C:/Decks/active-plugin-component.pptx"));
  assert.ok(plan.steps[1].args.includes("--root"));
  assert.ok(plan.steps[1].args.includes(path.join("runs/watch-refresh", "watched-plugin-components", "islide")));
  assert.ok(plan.steps[1].args.includes(path.join("runs/watch-refresh", "watched-plugin-components", "officeplus")));
  assert.ok(plan.steps[1].args.includes("C:/plugin/cache"));
});

test("buildRefreshPlan can enable bounded plugin structure learning during inventory", () => {
  const plan = buildRefreshPlan({
    outDir: "runs/learn-refresh",
    learnStructure: true,
    learnMaxAssets: 6,
    learnMaxSlides: 2,
    learnMaxComponentCatalogItems: 8
  });

  assert.ok(plan.steps[0].args.includes("--learn-structure"));
  assert.ok(plan.steps[0].args.includes("--learn-max-assets"));
  assert.ok(plan.steps[0].args.includes("6"));
  assert.ok(plan.steps[0].args.includes("--learn-max-slides"));
  assert.ok(plan.steps[0].args.includes("2"));
  assert.ok(plan.steps[0].args.includes("--learn-max-component-catalog-items"));
  assert.ok(plan.steps[0].args.includes("8"));
});

test("buildRefreshPlan allows explicit live search and fail gate", () => {
  const plan = buildRefreshPlan({
    outDir: "runs/live",
    liveSearch: true,
    failOnMissingReady: true
  });

  assert.equal(plan.mode, "live-search");
  assert.equal(plan.steps[1].args.includes("--dry-run"), false);
  assert.ok(plan.steps[3].args.includes("--fail-on-missing-ready"));
  assert.equal(plan.steps[4].name, "component-plugin-action-queue");
});

test("parseArgs supports skip switches for existing cache reuse", () => {
  const args = parseArgs([
    "node",
    "component-library-refresh.js",
    "--skip-inventory",
    "--skip-candidates",
    "--skip-asset-manifest",
    "--skip-materialize",
    "--include-provider-roots",
    "--include-reference-assets",
    "--component-store-root",
    "runs/offline-store",
    "--harvest-active",
    "--watch-file",
    "C:/Decks/active-plugin-component.pptx",
    "--harvest-provider",
    "officeplus",
    "--harvest-label",
    "cycle",
    "--harvest-attempts",
    "2",
    "--harvest-delay-ms",
    "150",
    "--motifs",
    "arc-arrow,radial-link",
    "--out-dir",
    "runs/reuse",
    "--max-assets-per-layer",
    "7"
  ]);

  assert.equal(args.skipInventory, true);
  assert.equal(args.skipCandidates, true);
  assert.equal(args.skipAssetManifest, true);
  assert.equal(args.skipMaterialize, true);
  assert.equal(args.includeProviderRoots, true);
  assert.equal(args.includeReferenceAssets, true);
  assert.equal(args.componentStoreRoot, "runs/offline-store");
  assert.equal(args.harvestActive, true);
  assert.deepEqual(args.watchFiles, ["C:/Decks/active-plugin-component.pptx"]);
  assert.equal(args.harvestProvider, "officeplus");
  assert.equal(args.harvestLabel, "cycle");
  assert.equal(args.harvestAttempts, 2);
  assert.equal(args.harvestDelayMs, 150);
  assert.deepEqual(args.motifs, ["arc-arrow", "radial-link"]);
  assert.equal(args.outDir, "runs/reuse");
  assert.equal(args.maxAssetsPerLayer, 7);
});

test("runRefreshPlan stops at the first failed step", () => {
  const plan = {
    outDir: "runs/component-refresh-test",
    mode: "dry-run",
    paths: {},
    steps: [
      { name: "first", command: "node", args: [] },
      { name: "second", command: "node", args: [] }
    ]
  };
  assert.throws(
    () => runRefreshPlan(plan, (step) => ({
      status: step.name === "first" ? 0 : 2,
      stdout: "",
      stderr: "boom"
    })),
    /component library refresh failed at second/
  );
});
