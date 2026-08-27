"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildPluginComponentInventory,
  classifyComponentCandidate,
  discoverInstalledPptComponentSources,
  inferProvider,
  inferReusePolicy,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/lib/plugin-component-registry");

test("plugin component registry classifies installed PPT component assets", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-components-"));
  const officePlus = path.join(tmp, "Microsoft OfficePLUS", "4.0.0", "Pages", "assets", "images");
  const timeline = path.join(tmp, "Office Timeline", "Current", "Demos");
  fs.mkdirSync(officePlus, { recursive: true });
  fs.mkdirSync(timeline, { recursive: true });
  const svg = path.join(officePlus, "icon2-10.c28fc613.svg");
  const pptx = path.join(timeline, "Demo Timeline Expert Edition.pptx");
  fs.writeFileSync(svg, "<svg><path d=\"M0 0h10v10z\"/></svg>");
  fs.writeFileSync(pptx, "PK mock pptx");

  const candidates = discoverInstalledPptComponentSources({
    roots: [tmp],
    maxDepth: 6,
    maxFilesPerRoot: 50,
    maxTotalFiles: 50
  });

  assert.equal(candidates.length, 2);
  const timelineCandidate = candidates.find((item) => item.provider === "office-timeline");
  const officePlusCandidate = candidates.find((item) => item.provider === "officeplus");
  assert.equal(timelineCandidate.assetKind, "presentation-template");
  assert.ok(timelineCandidate.roleTags.includes("timeline"));
  assert.equal(timelineCandidate.reusePolicy, "learn-layout-patterns-from-installed-demo");
  assert.equal(officePlusCandidate.assetKind, "vector-component");
  assert.ok(officePlusCandidate.roleTags.includes("icon"));
  assert.equal(officePlusCandidate.reusePolicy, "learn-vector-style-or-use-after-license-review");
});

test("plugin component registry skips browser and webview caches while scanning", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-components-cache-"));
  const useful = path.join(tmp, "Microsoft OfficePLUS", "Pages", "assets", "images");
  const cache = path.join(tmp, "Microsoft OfficePLUS", "webview2", "EBWebView", "Default");
  fs.mkdirSync(useful, { recursive: true });
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(useful, "banner.66002961.png"), "png");
  fs.writeFileSync(path.join(cache, "Favicons"), "sqlite");

  const inventory = buildPluginComponentInventory({
    roots: [tmp],
    maxDepth: 8,
    maxFilesPerRoot: 50,
    maxTotalFiles: 50
  });

  assert.equal(inventory.summary.total, 1);
  assert.equal(inventory.candidates[0].name, "banner.66002961.png");
  assert.equal(inventory.summary.byProvider.officeplus, 1);
  assert.ok(inventory.recommendations.actions.some((action) => action.target === "polished-card-icon-and-banner-styles"));
});

test("plugin component registry can strictly retain and prioritize self-fidelity promoted assets", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-components-promoted-"));
  const root = path.join(tmp, "islide-applied-components");
  fs.mkdirSync(root, { recursive: true });
  const promoted = path.join(root, "islide-applied-cycle.pptx");
  const rejected = path.join(root, "islide-applied-noise.pptx");
  fs.writeFileSync(promoted, "PK promoted component");
  fs.writeFileSync(rejected, "PK rejected component");
  const sha256 = "a".repeat(64);

  const inventory = buildPluginComponentInventory({
    roots: [root],
    maxDepth: 2,
    maxFilesPerRoot: 20,
    maxTotalFiles: 20,
    requireSelfFidelityPromoted: true,
    selfFidelityPromotionReport: {
      provider: "component-asset-self-fidelity-batch-v1",
      results: [{
        file: promoted,
        sha256,
        passed: true,
        reportFile: path.join(tmp, "report.json"),
        comparison: { ok: true, pixelDiffRatio: 0.03, foregroundMissingRatio: 0.08, meanAbsoluteDelta: 5 },
        regionSummary: { regions: 4, passed: 4, maxPixelDiffRatio: 0.05, maxForegroundMissingRatio: 0.1, maxMeanAbsoluteDelta: 8 }
      }, { file: rejected, passed: false }]
    }
  });

  assert.equal(inventory.summary.total, 1);
  assert.equal(inventory.summary.selfFidelityPromoted, 1);
  assert.equal(inventory.candidates[0].path, promoted);
  assert.equal(inventory.candidates[0].selfFidelity.sha256, sha256);
  assert.equal(inventory.candidates[0].selfFidelity.comparison.pixelDiffRatio, 0.03);
  assert.ok(inventory.candidates[0].roleTags.includes("self-fidelity-promoted"));
  assert.ok(inventory.candidates[0].score >= 32);
});

test("plugin component registry keeps only persisted fidelity-promoted assets during a later strict refresh", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-components-persisted-promotion-"));
  const root = path.join(tmp, "verified", "officeplus");
  fs.mkdirSync(root, { recursive: true });
  const promoted = path.join(root, "officeplus-promoted.pptx");
  const pending = path.join(root, "officeplus-pending.pptx");
  fs.writeFileSync(promoted, "PK promoted component");
  fs.writeFileSync(pending, "PK pending component");
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify({
    components: [{
      path: promoted,
      name: path.basename(promoted),
      provider: "officeplus",
      selfFidelityPromoted: true,
      selfFidelity: { passed: true },
      roleTags: ["applied-component", "self-fidelity-promoted"]
    }, {
      path: pending,
      name: path.basename(pending),
      provider: "officeplus",
      selfFidelityPromoted: false,
      roleTags: ["applied-component"]
    }]
  }));

  const inventory = buildPluginComponentInventory({
    roots: [root],
    maxDepth: 2,
    maxFilesPerRoot: 20,
    maxTotalFiles: 20,
    requireSelfFidelityPromoted: true
  });

  assert.equal(inventory.summary.total, 1);
  assert.equal(inventory.candidates[0].path, promoted);
  assert.equal(inventory.candidates[0].selfFidelityPromoted, true);
});

test("plugin component registry accepts legacy persisted promotion only with replay evidence", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-components-legacy-promotion-"));
  const root = path.join(tmp, "islide-applied-components");
  fs.mkdirSync(root, { recursive: true });
  const promoted = path.join(root, "islide-applied-arc-arrow.pptx");
  const unsafe = path.join(root, "islide-applied-empty.pptx");
  fs.writeFileSync(promoted, "legacy-promoted");
  fs.writeFileSync(unsafe, "legacy-empty");
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify({
    components: [{
      path: promoted,
      name: path.basename(promoted),
      provider: "islide",
      selfFidelityPromoted: true,
      selfFidelity: { reportFile: path.join(tmp, "legacy-report.json") }
    }, {
      path: unsafe,
      name: path.basename(unsafe),
      provider: "islide",
      selfFidelityPromoted: true,
      selfFidelity: {}
    }]
  }));

  const inventory = buildPluginComponentInventory({
    roots: [root],
    maxDepth: 2,
    maxFilesPerRoot: 20,
    maxTotalFiles: 20,
    requireSelfFidelityPromoted: true
  });

  assert.equal(inventory.summary.total, 1);
  assert.equal(inventory.candidates[0].path, promoted);
  assert.equal(inventory.candidates[0].selfFidelity.passed, true);
});

test("plugin component registry includes OfficePLUS downloaded component packages from temp files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-components-officeplus-temp-"));
  const downloaded = path.join(tmp, "OfficePLUS", "Temp", "OPPowerPNTAddin", "Files");
  const otherTemp = path.join(tmp, "OfficePLUS", "Temp", "OtherCache");
  fs.mkdirSync(downloaded, { recursive: true });
  fs.mkdirSync(otherTemp, { recursive: true });
  const component = path.join(downloaded, "8eeb6747-49fe-e661-1399-3a19c1153bac.pptx");
  fs.writeFileSync(component, "PK mock downloaded component");
  fs.writeFileSync(path.join(otherTemp, "ignored.pptx"), "PK ignored temp");

  const inventory = buildPluginComponentInventory({
    roots: [path.join(tmp, "OfficePLUS")],
    maxDepth: 8,
    maxFilesPerRoot: 50,
    maxTotalFiles: 50
  });

  assert.equal(inventory.summary.total, 1);
  assert.equal(inventory.candidates[0].path, component);
  assert.equal(inventory.candidates[0].provider, "officeplus");
  assert.equal(inventory.candidates[0].assetKind, "presentation-template");
  assert.equal(inventory.candidates[0].reusePolicy, "inspect-openxml-downloaded-plugin-component");
  assert.ok(inventory.candidates[0].roleTags.includes("downloaded-component"));
  assert.equal(_private.shouldSkipDirectory(path.join(tmp, "OfficePLUS", "Temp")), false);
  assert.equal(_private.shouldSkipDirectory(downloaded), false);
});

test("plugin component registry recognizes component-like OfficePLUS temp downloads outside legacy Files folder", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-components-officeplus-modern-temp-"));
  const modernTemp = path.join(tmp, "OfficePLUS", "Temp", "component-download");
  const cacheTemp = path.join(tmp, "OfficePLUS", "Temp", "OtherCache");
  fs.mkdirSync(modernTemp, { recursive: true });
  fs.mkdirSync(cacheTemp, { recursive: true });
  const component = path.join(modernTemp, "MatlComponentContent-11189.pptx");
  const ignored = path.join(cacheTemp, "random-cache-export.pptx");
  fs.writeFileSync(component, "PK mock modern downloaded component");
  fs.writeFileSync(ignored, "PK ignored cache deck");

  const inventory = buildPluginComponentInventory({
    roots: [path.join(tmp, "OfficePLUS")],
    maxDepth: 8,
    maxFilesPerRoot: 50,
    maxTotalFiles: 50
  });

  assert.equal(inventory.summary.total, 1);
  assert.equal(inventory.candidates[0].path, component);
  assert.equal(inventory.candidates[0].provider, "officeplus");
  assert.equal(inventory.candidates[0].reusePolicy, "inspect-openxml-downloaded-plugin-component");
  assert.ok(inventory.candidates[0].roleTags.includes("downloaded-component"));
});

test("plugin component registry keeps provider folders out of default roots and exposes explicit acquisition roots", () => {
  const registry = require("../skills/pd-hifi-slideclone/scripts/lib/plugin-component-registry");
  const environment = {
      APPDATA: "C:\\Users\\demo\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\demo\\AppData\\Local",
      TEMP: "C:\\Users\\demo\\AppData\\Local\\Temp",
      ProgramFiles: "C:\\Program Files",
      "ProgramFiles(x86)": "C:\\Program Files (x86)",
      SLIDECLONE_WORKSPACE_ROOT: "E:\\workspace"
  };
  const roots = registry.defaultPluginComponentRoots(environment);

  assert.equal(roots[0], "E:\\workspace\\runs\\plugin-component-inventory\\officeplus-applied-components");
  assert.equal(roots[1], "E:\\workspace\\runs\\plugin-component-inventory\\islide-applied-components");
  assert.equal(roots[2], "E:\\workspace\\runs\\plugin-component-inventory\\manual-applied-components");
  assert.equal(roots[3], "E:\\workspace\\runs\\plugin-component-inventory\\watched-plugin-components\\officeplus");
  assert.equal(roots[4], "E:\\workspace\\runs\\plugin-component-inventory\\watched-plugin-components\\islide");
  assert.ok(roots.includes("E:\\workspace\\runs\\plugin-component-inventory\\isolated-collection\\verified"));
  assert.equal(roots.some((root) => root.startsWith("C:\\Users\\demo\\AppData")), false);

  const acquisitionRoots = registry.defaultPluginComponentRoots(environment, { includeProviderRoots: true });
  assert.ok(acquisitionRoots.includes("C:\\Users\\demo\\AppData\\Local\\OfficePLUS\\Temp\\OPPowerPNTAddin\\Files"));
  assert.ok(acquisitionRoots.includes("C:\\Users\\demo\\AppData\\Local\\Temp\\iSlide Tools\\site\\content\\file"));
});

test("plugin component registry loads a materialized asset offline without provider directories", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-components-offline-store-"));
  const providerRoot = path.join(tmp, "provider-that-will-be-removed");
  const storeRoot = path.join(tmp, "workspace", "runs", "plugin-component-inventory");
  fs.mkdirSync(providerRoot, { recursive: true });
  const source = path.join(providerRoot, "islide-applied-cycle.pptx");
  fs.writeFileSync(source, "offline component");
  const { materializeComponentInventory } = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-store");
  materializeComponentInventory({
    provider: "plugin-component-registry-v1",
    candidates: [{
      id: "islide-offline-cycle",
      provider: "islide",
      path: source,
      name: path.basename(source),
      extension: ".pptx",
      assetKind: "presentation-template",
      roleTags: ["applied-component"],
      reusePolicy: "inspect-openxml-applied-plugin-component"
    }]
  }, { storeRoot });
  fs.rmSync(providerRoot, { recursive: true, force: true });

  const offline = buildPluginComponentInventory({
    env: { SLIDECLONE_WORKSPACE_ROOT: path.join(tmp, "workspace") },
    assetStoreRoot: storeRoot,
    maxDepth: 2,
    maxFilesPerRoot: 20,
    maxTotalFiles: 20
  });

  assert.equal(offline.mode, "offline-local");
  assert.equal(offline.summary.total, 1);
  assert.equal(offline.candidates[0].provider, "islide");
  assert.equal(offline.candidates[0].contentSha256.length, 64);
  assert.ok(offline.candidates[0].roleTags.includes("local-materialized"));
  assert.equal(offline.roots.some((root) => root.path.includes("provider-that-will-be-removed")), false);
});

test("plugin component registry recognizes iSlide temp downloaded component packages", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-components-islide-temp-"));
  const downloaded = path.join(tmp, "iSlide Tools", "site", "content", "file", "2026-03-10", "142556");
  fs.mkdirSync(downloaded, { recursive: true });
  const component = path.join(downloaded, "09d45b35-3740-400e-9150-25942b5e93fb.source.default.zh-Hans.pptx");
  fs.writeFileSync(component, "PK mock iSlide downloaded component");

  const inventory = buildPluginComponentInventory({
    roots: [path.join(tmp, "iSlide Tools", "site", "content", "file")],
    maxDepth: 6,
    maxFilesPerRoot: 50,
    maxTotalFiles: 50
  });

  assert.equal(inventory.summary.total, 1);
  assert.equal(inventory.candidates[0].path, component);
  assert.equal(inventory.candidates[0].provider, "islide");
  assert.equal(inventory.candidates[0].reusePolicy, "inspect-openxml-downloaded-plugin-component");
  assert.ok(inventory.candidates[0].roleTags.includes("downloaded-component"));
  assert.equal(inferProvider(component.toLowerCase()), "islide");
  assert.equal(_private.isIslideDownloadedComponentPath(component.toLowerCase()), true);
});

test("plugin component registry learns applied iSlide components before generic demos", () => {
  const islideApplied = {
    provider: "islide",
    assetKind: "presentation-template",
    path: path.join(process.cwd(), "runs", "plugin-component-inventory", "islide-applied-components", "arc-arrow.pptx"),
    roleTags: ["applied-component", "openxml-inspectable", "template-layout"]
  };
  const timelineDemo = {
    provider: "office-timeline",
    assetKind: "presentation-template",
    path: path.join(process.cwd(), "Office Timeline", "Demo Timeline.pptx"),
    roleTags: ["openxml-inspectable", "template-layout", "timeline"]
  };

  assert.equal(_private.shouldLearnCandidateStructure(islideApplied), true);
  assert.ok(_private.learningPriority(islideApplied) > _private.learningPriority(timelineDemo));
});

test("plugin component registry deduplicates downloaded files across overlapping default roots", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-components-officeplus-dedupe-"));
  const officePlus = path.join(tmp, "OfficePLUS");
  const downloaded = path.join(officePlus, "Temp", "OPPowerPNTAddin", "Files");
  fs.mkdirSync(downloaded, { recursive: true });
  const component = path.join(downloaded, "cycle.pptx");
  fs.writeFileSync(component, "PK mock downloaded component");

  const inventory = buildPluginComponentInventory({
    roots: [officePlus, downloaded],
    maxDepth: 8,
    maxFilesPerRoot: 50,
    maxTotalFiles: 50
  });

  assert.equal(inventory.candidates.filter((candidate) => candidate.path === component).length, 1);
});

test("plugin component registry ranks downloaded OfficePLUS components ahead of generic addin templates", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-components-officeplus-rank-"));
  const officePlus = path.join(tmp, "OfficePLUS");
  const addin = path.join(officePlus, "addin");
  const downloaded = path.join(officePlus, "Temp", "OPPowerPNTAddin", "Files");
  fs.mkdirSync(addin, { recursive: true });
  fs.mkdirSync(downloaded, { recursive: true });
  const genericTemplate = path.join(addin, "officeplus.pptx");
  const downloadedComponent = path.join(downloaded, "cycle-loop.pptx");
  fs.writeFileSync(genericTemplate, "PK mock generic addin template");
  fs.writeFileSync(downloadedComponent, "PK mock downloaded component");

  const inventory = buildPluginComponentInventory({
    roots: [officePlus],
    maxDepth: 8,
    maxFilesPerRoot: 50,
    maxTotalFiles: 50
  });

  assert.equal(inventory.candidates[0].path, downloadedComponent);
  assert.ok(inventory.candidates[0].roleTags.includes("downloaded-component"));
  const generic = inventory.candidates.find((candidate) => candidate.path === genericTemplate);
  assert.ok(generic.roleTags.includes("generic-installed-template"));
  assert.ok(inventory.candidates[0].score > generic.score);
});

test("plugin component registry recognizes applied iSlide component harvest decks", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-components-islide-applied-"));
  const harvest = path.join(tmp, "islide-applied-components");
  fs.mkdirSync(harvest, { recursive: true });
  const component = path.join(harvest, "islide-applied-cycle-loop.pptx");
  fs.writeFileSync(component, "PK mock applied iSlide component");
  fs.writeFileSync(path.join(harvest, "manifest.json"), JSON.stringify({ provider: "applied-ppt-component-harvest-v1" }));

  const inventory = buildPluginComponentInventory({
    roots: [harvest],
    maxDepth: 2,
    maxFilesPerRoot: 20,
    maxTotalFiles: 20
  });

  assert.equal(inventory.summary.total, 1);
  assert.equal(inventory.candidates[0].provider, "islide");
  assert.ok(inventory.candidates[0].roleTags.includes("applied-component"));
  assert.equal(inventory.candidates[0].reusePolicy, "inspect-openxml-applied-plugin-component");
  assert.equal(_private.isAppliedPluginComponentPath(component.toLowerCase()), true);
  assert.equal(_private.isAppliedPluginComponentManifestPath(path.join(harvest, "manifest.json").toLowerCase()), true);
});

test("plugin component registry reuses harvested structural metadata from manifest files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-components-manifest-structure-"));
  const harvest = path.join(tmp, "watched-plugin-components", "islide");
  fs.mkdirSync(harvest, { recursive: true });
  const component = path.join(harvest, "islide-applied-cycle-loop.pptx");
  fs.writeFileSync(component, "PK mock applied iSlide component");
  fs.writeFileSync(path.join(harvest, "manifest.json"), JSON.stringify({
    provider: "applied-ppt-component-harvest-v1",
    components: [{
      path: component,
      roleTags: ["applied-component", "openxml-inspectable", "process-library"],
      learningSummary: {
        status: "ok",
        componentCatalog: [{
          id: "slide1-ungrouped-component",
          structure: {
            kind: "process-chain",
            motifs: ["whole-process-template"],
            motifCounts: { "whole-process-template": 5 }
          }
        }]
      },
      structureSignature: {
        provider: "component-structure-signature-v1",
        primaryKind: "process-chain",
        motifs: ["whole-process-template"],
        motifCounts: { "whole-process-template": 5 }
      },
      selfFidelityPromoted: true,
      selfFidelity: { passed: true, reportFile: path.join(tmp, "fidelity-report.json") }
    }]
  }));

  const inventory = buildPluginComponentInventory({
    roots: [harvest],
    maxDepth: 2,
    maxFilesPerRoot: 20,
    maxTotalFiles: 20
  });

  assert.equal(inventory.summary.learnedStructures, 1);
  assert.equal(inventory.summary.structureSignatures, 1);
  assert.deepEqual(inventory.summary.byStructureKind, { "process-chain": 1 });
  assert.deepEqual(inventory.summary.byStructureMotif, { "whole-process-template": 5 });
  assert.deepEqual(inventory.candidates[0].structureSignature.motifs, ["whole-process-template"]);
  assert.ok(inventory.candidates[0].roleTags.includes("process-library"));
  assert.equal(inventory.candidates[0].selfFidelityPromoted, true);
  assert.equal(inventory.candidates[0].selfFidelity.passed, true);
});

test("plugin component registry treats applied OfficePLUS harvest decks as reusable components", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-components-officeplus-applied-"));
  const harvest = path.join(tmp, "officeplus-applied-components");
  fs.mkdirSync(harvest, { recursive: true });
  const component = path.join(harvest, "officeplus-applied-current-roadmap-abcdef123456.pptx");
  fs.writeFileSync(component, "PK mock applied OfficePLUS component");
  fs.writeFileSync(path.join(harvest, "manifest.json"), JSON.stringify({ provider: "applied-ppt-component-harvest-v1" }));

  const inventory = buildPluginComponentInventory({
    roots: [harvest],
    maxDepth: 2,
    maxFilesPerRoot: 20,
    maxTotalFiles: 20
  });

  assert.equal(inventory.summary.total, 1);
  assert.equal(inventory.candidates[0].provider, "officeplus");
  assert.ok(inventory.candidates[0].roleTags.includes("applied-component"));
  assert.equal(inventory.candidates[0].reusePolicy, "inspect-openxml-applied-plugin-component");
});

test("plugin component registry models reuse policy instead of directly depending on plugin runtimes", () => {
  assert.equal(inferProvider("c:\\program files (x86)\\office timeline\\current\\demos\\demo timeline.pptx"), "office-timeline");
  assert.equal(inferProvider("c:\\program files\\microsoft officeplus\\pages\\assets\\images\\icon.svg"), "officeplus");
  assert.equal(inferReusePolicy({
    provider: "think-cell",
    assetKind: "component-metadata",
    ext: ".xml",
    normalized: "c:\\users\\demo\\think-cell\\settings.xml",
    base: "settings.xml"
  }), "runtime-chart-engine-not-direct-template-source");
  assert.equal(_private.shouldSkipDirectory("c:\\demo\\OfficePLUS\\webview2\\EBWebView"), true);
  assert.equal(_private.shouldSkipDirectory("c:\\demo\\Office Timeline\\Current\\Demos"), false);
});

test("plugin component registry can classify a single concrete file candidate", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-components-single-"));
  const file = path.join(tmp, "Office Timeline", "Current", "Demos", "Plus Edition Demo Timeline.pptx");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "PK mock pptx");

  const candidate = classifyComponentCandidate(file, tmp);

  assert.equal(candidate.provider, "office-timeline");
  assert.equal(candidate.assetKind, "presentation-template");
  assert.ok(candidate.score > 80);
  assert.match(candidate.id, /^office-timeline-[0-9a-f]{8}$/);
});

test("plugin component registry resolves relative roots before returning candidates", () => {
  const tmp = fs.mkdtempSync(path.join(process.cwd(), "runs", "plugin-components-relative-root-"));
  const relativeRoot = path.relative(process.cwd(), tmp);
  const file = path.join(tmp, "officeplus-applied-components", "officeplus-applied-roadmap.pptx");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "PK mock pptx");

  const inventory = buildPluginComponentInventory({
    roots: [relativeRoot],
    maxDepth: 3,
    maxFilesPerRoot: 20,
    maxTotalFiles: 20
  });

  assert.equal(path.isAbsolute(inventory.roots[0].path), true);
  assert.equal(path.isAbsolute(inventory.candidates[0].path), true);
  assert.ok(inventory.candidates[0].path.endsWith("officeplus-applied-roadmap.pptx"));
  fs.rmSync(tmp, { recursive: true, force: true });
});
