const { coreModulePath, copyCoreModuleClosure } = require('./helpers/isolated-core-package.cjs');
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { REQUIRED_FILES } = require("../scripts/verify-runtime-package");

test("isolated core runs real parallel pixel workers with serial-equivalent results", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pixel-diff-package-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const installed = path.join(root, "node_modules/@common-tools/slideclone-core");
  fs.mkdirSync(installed, { recursive: true });
  const modules = ["png", "component-region-quality", "native-freeform-path", "missing-native-component-quality", "diff-pixel-png", "pixel-diff-page-worker", "text-weight-evidence", "text-ink-geometry", "source-text-separator", "measured-text-fit",
    "positioned-text-reframe", "positioned-text-layout", "source-word-layout-projection", "positioned-text-font-override",
    "text-ink-joint-evidence", "typography-contract", "source-word-joint-observation", "source-row-component-ownership", "source-row-whitespace-corridor"];
  copyCoreModuleClosure(installed, modules, REQUIRED_FILES);
  for (const name of modules) assert.ok(REQUIRED_FILES.includes(`packages/slideclone-core/${coreModulePath(name)}`), name);
  const load = createRequire(path.join(root, "consumer.cjs"));
  const compare = load("@common-tools/slideclone-core/diff-pixel-png");
  const {buildComponentRegions}=load(path.join(installed,coreModulePath("component-region-quality")));
  const [surface]=buildComponentRegions({shapes:[{type:"freeform",box:{x:10,y:10,w:80,h:80},
    style:{fill:"#123456",stroke:"none",freeformPath:"[[0,0,0],[1,1,0],[1,1,1],[1,0,1],[4]]"}}]},
    {widthPt:100,heightPt:100});
  assert.equal(surface.role,"shape");assert.equal(surface.geometry,undefined);
  const { writePng } = load("@common-tools/slideclone-core/png");
  const sourceImage = path.join(root, "source.png"), renderedImage = path.join(root, "rendered.png");
  writePng(sourceImage, { width: 2, height: 2, rgba: Buffer.from([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255]) });
  writePng(renderedImage, { width: 2, height: 2, rgba: Buffer.alloc(16, 255) });
  const originalConcurrency = process.env.SLIDECLONE_DIFF_CONCURRENCY;
  t.after(() => {
    if (originalConcurrency === undefined) delete process.env.SLIDECLONE_DIFF_CONCURRENCY;
    else process.env.SLIDECLONE_DIFF_CONCURRENCY = originalConcurrency;
  });
  const input = { ir: { slideSize: { widthPt: 100, heightPt: 100 }, pages: [0, 1, 2].map((pageIndex) => ({ pageIndex, sourceImage: pageIndex === 2 ? path.join(root, "missing.png") : sourceImage })) }, render: { renderedPages: [0, 1, 2].map((pageIndex) => ({ pageIndex, image: renderedImage })) } };
  const results = [];
  for (const concurrency of [1, 2]) {
    process.env.SLIDECLONE_DIFF_CONCURRENCY = String(concurrency);
    const events = [];
    const result = await compare(input, { outputDir: root, config: {}, onProgress: (event) => events.push(event) });
    assert.equal(events[0].concurrency, concurrency);
    assert.equal(result.data.summary.comparedPages, 2);
    assert.equal(result.data.summary.failedPages, 1);
    assert.deepEqual(result.data.metrics.map((metric) => [metric.pageIndex, metric.ok]), [[0, true], [1, true], [2, false]]);
    assert.equal(events.filter((event) => event.phase === "diff-page").length, 2);
    results.push({ summary: result.data.summary, metrics: result.data.metrics.filter((metric) => metric.ok), pixels: result.data.metrics.filter((metric) => metric.ok).map((metric) => fs.readFileSync(metric.diffImage)) });
  }
  assert.deepEqual(results[1], results[0]);
  assert.equal(fs.existsSync(path.join(root, "skills")), false);
});

test("legacy comparator shares core code and Worker no longer imports the Skill comparator", () => {
  assert.equal(require("../packages/slideclone-native-engine/scripts/adapters/diff-pixel-png"), require("../packages/slideclone-core/diff-pixel-png"));
  const { verifyWorkspaceBoundaries } = require("../scripts/verify-workspace-boundaries");
  assert.equal(verifyWorkspaceBoundaries().legacyEdges.some((edge) => edge.target.endsWith("/diff-pixel-png.js")), false);
});
