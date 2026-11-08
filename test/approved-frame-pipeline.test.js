"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { fixture } = require("./helpers/approved-frame-application.cjs");
const { createRawImageNativeRebuilder } = require("../packages/slideclone-core/team-native-rebuild");
const { PRODUCTION_PROFILE_NAME } = require("../packages/slideclone-core/native-rebuild-profile");
const { issueApprovedFrameApplication } = require("../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle");
const { discoverTestFiles } = require("../scripts/test-sharded");

function builder(workDir) {
  const deck = JSON.parse(fs.readFileSync(path.join(workDir, "ir/deck.json"), "utf8"));
  deck.pages[0].shapes.push({ id: "native-line", type: "line", box: { x: 1, y: 1, w: 20, h: 0 }, source: { editable: true } });
  return deck;
}
function request(f, metadata = {}) {
  return { root: f.root, metadata: { inputFile: f.context.sourceFile, assetPath: "assets/source.png", dimensions: { widthPx: 120, heightPx: 120 }, ...metadata },
    ocr: { lines: [] }, isCancellationRequested: async () => false };
}

test("constructor rejects invalid trusted services", () => {
  for (const value of [null, true, "enabled", {}, []]) assert.throws(() => createRawImageNativeRebuilder({ rebuildDeckFromWorkDir: builder, applyApprovedFrames: value }), /approved frame service is invalid/u);
});

test("job metadata and approval markers cannot install the service", async t => {
  const f = fixture(t); let calls = 0;
  const rebuild = createRawImageNativeRebuilder({ rebuildDeckFromWorkDir: builder });
  const result = await rebuild(request(f, { applyApprovedFrames: () => { calls++; }, approvedApproximateFrames: f.review, approvalId: f.review.approvalId }));
  assert.equal(calls, 0); assert.equal(result.deck.meta.approvedApproximateFrames, undefined);
  assert.equal(result.metrics.connectors, 1); assert.deepEqual(f.directories(), []);
});

test("the trusted service runs after compaction and before final audit and metrics", async t => {
  const f = fixture(t); let calls = 0, commits = 0, rollbacks = 0;
  const rebuild = createRawImageNativeRebuilder({ rebuildDeckFromWorkDir: builder, applyApprovedFrames: async context => {
    calls++; assert.equal(context.root, f.root); assert.equal(context.deck.meta.nativeComponentQuality, undefined);
    assert.equal(fs.existsSync(context.sourceFile), true); assert.equal(await context.isCancellationRequested(), false);
    assert.equal(context.deck.meta.reconstructionProfile, PRODUCTION_PROFILE_NAME);
    context.deck.pages[0].shapes.push({ id: "trusted-line", type: "line", box: { x: 1, y: 2, w: 20, h: 0 }, source: { editable: true } });
    return issueApprovedFrameApplication(context, { commit() { commits++; }, rollback() { rollbacks++; } });
  } });
  const result = await rebuild(request(f));
  assert.equal(calls, 1); assert.equal(commits, 1); assert.equal(rollbacks, 0);
  assert.equal(result.metrics.connectors, 2); assert.equal(result.nativeComponentQuality.passed, true);
});

test("new regression files are discovered by the unified CI in their resource suites", () => {
  const files = discoverTestFiles(path.resolve(__dirname, ".."), "unit").map(row => path.basename(row.file));
  // Application/receipt behavior now lives in the API, pipeline and actual
  // Worker tests; the removed monolithic filename is not executable coverage.
  for (const name of ["approved-frame-api.test.js", "approved-frame-application-input.test.js", "approved-frame-application-files.test.js", "approved-frame-pipeline.test.js", "approved-frame-worker.test.js"]) assert(files.includes(name), name);
  for (const suite of ["contract", "all"]) assert(discoverTestFiles(path.resolve(__dirname, ".."), suite)
    .some(row => path.basename(row.file) === "approved-frame-package.test.js"));
});
