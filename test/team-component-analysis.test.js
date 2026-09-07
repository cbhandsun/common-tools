"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createTeamComponentAnalysis } = require("../packages/slideclone-core/team-component-analysis");

function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "team-component-analysis-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workDir = path.join(root, "native-work"); fs.mkdirSync(path.join(workDir, "ir"), { recursive: true });
  const inputFile = path.join(root, "source.png"); fs.writeFileSync(inputFile, "source");
  const asset = path.join(root, "component.pptx"); fs.writeFileSync(asset, "component");
  const inventory = { provider: "plugin-component-registry-v1", candidates: [{ path: asset }] };
  const preDeck = { pages: [{ images: [{ id: "crop" }] }] };
  const report = { layers: [{ pageIndex: 0, imageIndex: 0, componentRenderStrategy: { mode: "native-visual-atom-rebuild" } }] };
  const manifest = { layers: [{ pageIndex: 0, imageIndex: 0, localAssets: [{ path: asset }] }] };
  const calls = [];
  const dependencies = {
    inventory,
    rebuildDeckFromWorkDir(work, options) { calls.push(["rebuild", work, options]); return preDeck; },
    async searchIrComponentCandidates(options) { calls.push(["search", options]); return report; },
    buildComponentAssetManifest(options) { calls.push(["manifest", options]); return manifest; },
    buildComponentStrategyIndex(value) { return new Map([["strategy", value.layers.length]]); },
    buildComponentAssetIndex(value) { return new Map([["asset", value.layers.length]]); },
    ...overrides
  };
  return { root, workDir, inputFile, dependencies, calls };
}

test("component analysis builds per-source indexes offline with bounded pre-analysis", async t => {
  const f = fixture(t); const resolver = createTeamComponentAnalysis(f.dependencies);
  const result = await resolver.resolve({ workDir: f.workDir, root: f.root, metadata: { inputFile: f.inputFile } });
  assert.equal(result.componentStrategyIndex.get("strategy"), 1); assert.equal(result.componentAssetIndex.get("asset"), 1);
  assert.equal(f.calls[0][2].preserveGraphics, true); assert.equal(f.calls[0][2].pages, "1");
  assert.deepEqual(f.calls[1][1].dryRun, true); assert.deepEqual(f.calls[1][1].size, 3);
  assert.equal(f.calls[2][1].maxAssetsPerLayer, 4); assert.equal(result.evidence.preImages, 1);
});

test("component analysis returns no fake maps when reports and manifests are empty", async t => {
  const f = fixture(t, { searchIrComponentCandidates: async () => ({ layers: [] }), buildComponentAssetManifest: () => ({ layers: [] }) });
  const result = await createTeamComponentAnalysis(f.dependencies).resolve({ workDir: f.workDir, root: f.root, metadata: { inputFile: f.inputFile } });
  assert.equal("componentStrategyIndex" in result, false); assert.equal("componentAssetIndex" in result, false);
});

test("component evidence from a multi-megabyte source passes the unchanged IR numeric boundary", async t => {
  const f = fixture(t);
  fs.writeFileSync(f.inputFile, Buffer.alloc(2 * 1024 * 1024));
  const result = await createTeamComponentAnalysis(f.dependencies).resolve({ workDir: f.workDir, root: f.root, metadata: { inputFile: f.inputFile } });
  const { validateDeckIrTree } = require("../packages/slideclone-core/deck-ir-tree");
  assert.doesNotThrow(() => validateDeckIrTree({ pages: [{ source: { componentAnalysis: result.evidence } }] }));
  assert.match(result.evidence.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(result.evidence, "sourceBytes"), false);
});

test("component analysis rejects invalid layer references and asset paths", async t => {
  const f = fixture(t, { searchIrComponentCandidates: async () => ({ layers: [{ pageIndex: 0, imageIndex: 9, componentRenderStrategy: {} }] }) });
  await assert.rejects(createTeamComponentAnalysis(f.dependencies).resolve({ workDir: f.workDir, root: f.root, metadata: { inputFile: f.inputFile } }), /team component analysis failed/);
  const g = fixture(t, { buildComponentAssetManifest: () => ({ layers: [{ pageIndex: 0, imageIndex: 0, localAssets: [{ path: __filename }] }] }) });
  await assert.rejects(createTeamComponentAnalysis(g.dependencies).resolve({ workDir: g.workDir, root: g.root, metadata: { inputFile: g.inputFile } }), /team component analysis failed/);
});

test("component analysis rejects source changes and dependency failures without exposing details", async t => {
  const f = fixture(t, { async searchIrComponentCandidates() { fs.writeFileSync(f.inputFile, "changed"); return { layers: [] }; } });
  await assert.rejects(createTeamComponentAnalysis(f.dependencies).resolve({ workDir: f.workDir, root: f.root, metadata: { inputFile: f.inputFile } }), /team component analysis failed/);
  const g = fixture(t, { rebuildDeckFromWorkDir() { throw new Error("secret detail"); } });
  await assert.rejects(createTeamComponentAnalysis(g.dependencies).resolve({ workDir: g.workDir, root: g.root, metadata: { inputFile: g.inputFile } }), error => error.message === "team component analysis failed");
});

test("component analysis does not evaluate metadata accessors", async t => {
  const f = fixture(t); let reads = 0;
  const metadata = {};
  Object.defineProperty(metadata, "inputFile", { get() { reads += 1; return f.inputFile; } });
  await assert.rejects(createTeamComponentAnalysis(f.dependencies).resolve({ workDir: f.workDir, root: f.root, metadata }), /team component analysis failed/);
  assert.equal(reads, 0);
});

test("component analysis accepts real offline search image and semantic shape layers", async t => {
  const f = fixture(t);
  const { searchIrComponentCandidates } = require("../skills/pd-hifi-slideclone/scripts/component-candidate-search");
  const { buildComponentAssetManifest } = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-matcher");
  const { buildComponentAssetIndex, buildComponentStrategyIndex } = require("../packages/slideclone-core/component-strategy-annotator");
  f.dependencies.rebuildDeckFromWorkDir = () => ({ pages: [{
    images: [{ id: "layer", box: { x: 10, y: 10, w: 300, h: 200 }, source: { layer: { areaRatio: 0.2, layerType: "diagram", detector: "fixture" } } }],
    shapes: [{ id: "cycle", type: "arc", box: { x: 0, y: 0, w: 100, h: 100 } }], textBoxes: []
  }] });
  f.dependencies.searchIrComponentCandidates = searchIrComponentCandidates;
  f.dependencies.buildComponentAssetManifest = buildComponentAssetManifest;
  f.dependencies.buildComponentStrategyIndex = buildComponentStrategyIndex;
  f.dependencies.buildComponentAssetIndex = buildComponentAssetIndex;
  const result = await createTeamComponentAnalysis(f.dependencies).resolve({ workDir: f.workDir, root: f.root, metadata: { inputFile: f.inputFile } });
  assert.ok(result.evidence.analysisLayers >= 1);
  assert.equal(result.evidence.assetMatches, 0);
  assert.equal(result.componentStrategyIndex, undefined);
  assert.equal(result.componentAssetIndex, undefined);
});

test("unmatched offline preservation plans never override native detector defaults", async t => {
  const f = fixture(t, {
    buildComponentAssetManifest: () => ({ layers: [{ pageIndex: 0, imageIndex: 0, localAssets: [] }] }),
    buildComponentStrategyIndex: () => { throw new Error("unmatched strategy must not be applied"); },
    buildComponentAssetIndex: () => { throw new Error("unmatched asset must not be applied"); }
  });
  const result = await createTeamComponentAnalysis(f.dependencies).resolve({ workDir: f.workDir, root: f.root, metadata: { inputFile: f.inputFile } });
  assert.equal(result.evidence.analysisLayers, 1);
  assert.equal(result.evidence.strategyLayers, 0);
  assert.equal(result.evidence.assetLayers, 0);
  assert.equal(result.componentStrategyIndex, undefined);
  assert.equal(result.componentAssetIndex, undefined);
});

test("a candidate asset does not promote a raster-preservation strategy over native detectors", async t => {
  const f = fixture(t, {
    searchIrComponentCandidates: async () => ({ layers: [{ pageIndex: 0, imageIndex: 0, componentRenderStrategy: { mode: "preserve-local-crop" } }] })
  });
  const result = await createTeamComponentAnalysis(f.dependencies).resolve({ workDir: f.workDir, root: f.root, metadata: { inputFile: f.inputFile } });
  assert.equal(result.evidence.assetMatches, 1);
  assert.equal(result.componentStrategyIndex, undefined);
  assert.ok(result.componentAssetIndex instanceof Map);
});
