"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const { IMAGE_EDITABLE_RELEASE_FILES } = require("../scripts/verify-runtime-package");

test("isolated core runs real parallel pixel workers with serial-equivalent results", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pixel-diff-package-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const installed = path.join(root, "node_modules/@common-tools/slideclone-core");
  fs.mkdirSync(installed, { recursive: true });
  const modules = ["png", "component-region-quality", "diff-pixel-png", "pixel-diff-page-worker"];
  for (const file of ["package.json", ...modules.map((name) => `${name}.js`)]) fs.copyFileSync(path.join(__dirname, "../packages/slideclone-core", file), path.join(installed, file));
  for (const name of ["diff-pixel-png", "pixel-diff-page-worker"]) assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes(`packages/slideclone-core/${name}.js`));
  const load = createRequire(path.join(root, "consumer.cjs"));
  const compare = load("@common-tools/slideclone-core/diff-pixel-png");
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
  assert.equal(require("../skills/pd-hifi-slideclone/scripts/adapters/diff-pixel-png"), require("../packages/slideclone-core/diff-pixel-png"));
  const { verifyWorkspaceBoundaries } = require("../scripts/verify-workspace-boundaries");
  assert.equal(verifyWorkspaceBoundaries().legacyEdges.some((edge) => edge.target.endsWith("/diff-pixel-png.js")), false);
});
