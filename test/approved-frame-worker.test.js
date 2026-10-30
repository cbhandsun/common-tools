"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { fixture } = require("./helpers/approved-frame-application.cjs");
const { createNativeRebuilder } = require("../packages/remote-mcp-server/image-native-rebuilder");
const { PRODUCTION_PROFILE_NAME } = require("../packages/slideclone-core/native-rebuild-profile");
const { issueApprovedFrameApplication } = require("../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle");
const { createApprovedFrameAssetApplication } = require("../packages/slideclone-core/scene-plan/approved-frame-reconstruction");
const { discoverTestFiles } = require("../scripts/test-sharded");

const settings = { rawImageOcrProfile: { kind: "disabled" } };
function builder(workDir) {
  const deck = JSON.parse(fs.readFileSync(path.join(workDir, "ir/deck.json"), "utf8"));
  deck.pages[0].shapes.push({ id: "native-line", type: "line", box: { x: 1, y: 1, w: 20, h: 0 }, source: { editable: true } });
  return deck;
}
function rebuildWith(dependencies = {}, configuration = settings) {
  return createNativeRebuilder(configuration, { loadImplementation: () => ({ rebuildDeckFromWorkDir: builder }), environment: {}, sceneVision: null, ...dependencies });
}
function request(f, metadata = {}) {
  return { root: f.root, metadata: { inputFile: f.context.sourceFile, assetPath: "assets/source.png", dimensions: { widthPx: 120, heightPx: 120 }, ...metadata },
    ocr: { lines: [] }, isCancellationRequested: async () => false };
}

test("Worker facade rejects invalid explicitly configured approved frame services", () => {
  for (const value of [null, true, false, 0, 1, "enabled", {}, []]) {
    assert.throws(() => rebuildWith({ applyApprovedFrames: value }), /approved frame service is invalid/u);
  }
});

test("Worker facade leaves approved frame application disabled by default", async t => {
  const f = fixture(t), result = await rebuildWith()(request(f));
  assert.equal(result.deck.meta.approvedApproximateFrames, undefined);
  assert.equal(result.metrics.connectors, 1); assert.deepEqual(f.directories(), []);
});

test("Worker job metadata cannot install a trusted approved frame service", async t => {
  const f = fixture(t); let calls = 0;
  const result = await rebuildWith()(request(f, { applyApprovedFrames: () => { calls++; }, approvedApproximateFrames: f.review, approvalId: f.review.approvalId }));
  assert.equal(calls, 0); assert.equal(result.deck.meta.approvedApproximateFrames, undefined);
  assert.equal(result.metrics.connectors, 1); assert.deepEqual(f.directories(), []);
});

test("Worker metadata cannot select or bypass semantic output policy", async t => {
  const f=fixture(t),result=await rebuildWith()(request(f,{outputPolicy:'semantic-native',nativeOutputSelection:{passed:true}}));
  assert.equal(result.deck.meta.nativeOutputSelection,undefined);assert.equal(result.metrics.connectors,1);
});

test("Worker forwards explicit semantic policy and rolls back pending approvals when scene verification fails",async t=>{
  const f=fixture(t);let commits=0,rollbacks=0;
  const rebuild=rebuildWith({outputPolicy:'semantic-native',applyApprovedFrames:async context=>
    issueApprovedFrameApplication(context,{commit(){commits++;},rollback(){rollbacks++;}})});
  await assert.rejects(rebuild(request(f)),/semantic-native-output-(?:invalid|incomplete|unverified)/);
  assert.equal(commits,0);assert.equal(rollbacks,1);
});

test("Worker facade forwards the trusted service before final audit and commits its output once", async t => {
  const f = fixture(t); let calls = 0, commits = 0, rollbacks = 0;
  const rebuild = rebuildWith({ applyApprovedFrames: async context => {
    calls++; assert.equal(context.root, f.root);
    assert.equal(context.sourceFile, path.join(f.root, "native-work", "normalized", "001.png"));
    assert.equal(f.hashFile(context.sourceFile), f.hashFile(f.context.sourceFile));
    assert.equal(context.deck.meta.nativeComponentQuality, undefined);
    assert.equal(context.deck.meta.reconstructionProfile, PRODUCTION_PROFILE_NAME);
    assert.equal(await context.isCancellationRequested(), false);
    context.deck.pages[0].shapes.push({ id: "trusted-line", type: "line", box: { x: 1, y: 2, w: 20, h: 0 }, source: { editable: true } });
    return issueApprovedFrameApplication(context, { commit() { commits++; }, rollback() { rollbacks++; } });
  } });
  const result = await rebuild(request(f));
  assert.equal(calls, 1); assert.equal(commits, 1); assert.equal(rollbacks, 0);
  assert.equal(result.metrics.connectors, 2); assert.equal(result.nativeComponentQuality.passed, true);
  assert.equal(result.deck.meta.nativeComponentQuality, result.nativeComponentQuality);
});

test("Worker facade accepts a valid empty application without creating approved assets", async t => {
  const f = fixture(t); let commits = 0;
  const result = await rebuildWith({ applyApprovedFrames: async context => issueApprovedFrameApplication(context, {
    commit() { commits++; }, rollback() { assert.fail("unexpected rollback"); }
  }) })(request(f));
  assert.equal(commits, 1); assert.equal(result.metrics.connectors, 1);
  assert.equal(result.deck.meta.approvedApproximateFrames, undefined); assert.deepEqual(f.directories(), []);
});

test("Worker facade carries its validated mode into host approval and ignores serialized mode hints", async t => {
  for (const mode of [undefined, "auto", "rounded-freeform", "reroutable-elbow"]) {
    const f = fixture(t); let observed = 0;
    const result = await rebuildWith({ connectorCornerMode: mode, applyApprovedFrames: async context => {
      observed++; assert.equal(context.connectorCornerMode, mode ?? "reroutable-elbow");
      return issueApprovedFrameApplication(context, { commit() {}, rollback() { assert.fail("unexpected rollback"); } });
    } })(request(f, { connectorCornerMode: mode === "reroutable-elbow" ? "rounded-freeform" : "reroutable-elbow" }));
    assert.equal(observed, 1); assert.equal(result.metrics.connectors, 1); assert.deepEqual(f.directories(), []);
  }
});

test("Worker facade preserves settings-only connector modes through actual rebuilds", async t => {
  for (const mode of [undefined, "auto", "rounded-freeform", "reroutable-elbow"]) {
    const f = fixture(t); let observed = 0;
    const result = await rebuildWith({ connectorCornerMode: undefined, applyApprovedFrames: async context => {
      observed++; assert.equal(context.connectorCornerMode, mode === undefined ? "reroutable-elbow" : mode);
      return issueApprovedFrameApplication(context, { commit() {}, rollback() { assert.fail("unexpected rollback"); } });
    } }, { ...settings, connectorCornerMode: mode })(request(f, { connectorCornerMode: "serialized-mode-cannot-override-host" }));
    assert.equal(observed, 1); assert.equal(result.metrics.connectors, 1); assert.deepEqual(f.directories(), []);
  }
});

test("Worker facade explicitly configured connector modes override settings", async t => {
  for (const setting of ["auto", "rounded-freeform", "reroutable-elbow", "invalid-unselected-setting"]) {
    for (const mode of ["auto", "rounded-freeform", "reroutable-elbow"]) {
      const f = fixture(t); let observed = 0;
      await rebuildWith({ connectorCornerMode: mode, applyApprovedFrames: async context => {
        observed++; assert.equal(context.connectorCornerMode, mode);
        return issueApprovedFrameApplication(context, { commit() {}, rollback() { assert.fail("unexpected rollback"); } });
      } }, { ...settings, connectorCornerMode: setting })(request(f));
      assert.equal(observed, 1); assert.deepEqual(f.directories(), []);
    }
  }
});

test("Worker facade rejects invalid selected connector modes before loader or provider access without coercion", () => {
  let accesses = 0;
  const hostile = new Proxy({}, { get() { accesses++; throw new Error("mode must not be inspected"); } });
  const coercible = { [Symbol.toPrimitive]() { accesses++; throw new Error("mode must not be coerced"); } };
  const invalid = [null, "", " ", "AUTO", "rounded-freeform ", "x".repeat(100000), true, false, 0, -1, NaN, Infinity, [], {}, hostile, coercible];
  const dependencies = {
    loadImplementation() { accesses++; throw new Error("loader must not run"); },
    environment: new Proxy({}, { get() { accesses++; throw new Error("provider must not be read"); } })
  };
  for (const mode of invalid) {
    for (const explicit of [false, true]) {
      assert.throws(() => createNativeRebuilder({ ...settings, connectorCornerMode: explicit ? "rounded-freeform" : mode },
        { ...dependencies, ...(explicit ? { connectorCornerMode: mode } : {}) }), /^TypeError: Connector corner mode is invalid$/u);
      assert.equal(accesses, 0);
    }
  }
});

test("Worker facade applies the real reviewed asset factory and retains strict failure flags and original bytes", async t => {
  const f = fixture(t); f.review.retirements = [];
  f.deck.pages[0].images.forEach((image, index) => { image.box = { x: 2 + index * 10, y: 2, w: 6, h: 6 }; });
  const result = await rebuildWith({ loadImplementation: () => ({ rebuildDeckFromWorkDir(workDir) {
    const deck = builder(workDir); deck.pages[0].images = f.deck.pages[0].images; return deck;
  } }), applyApprovedFrames: createApprovedFrameAssetApplication(f.review) })(request(f));
  const report = result.deck.meta.approvedApproximateFrames;
  assert.equal(report.frames.length, 3); assert.equal(report.assets.length, 1);
  for (const key of ["strictMeasurement", "sourceFootprint", "sourceErasure", "wholeProductAcceptance"]) assert.equal(report[key], false);
  assert.equal(f.hashFile(f.original), f.review.assets[0].beforeSha256);
  const image = result.deck.pages[0].images.find(item => item.id === "crop");
  assert.equal(image.style.assetPath, image.assetPath);
  assert.equal(f.hashFile(path.join(f.root, image.assetPath)), f.review.assets[0].afterSha256);
  assert.equal(result.deck.pages[0].shapes.filter(shape => shape.source?.approximateFrame).length, 3);
  assert.equal(f.directories().length, 1);
});

test("Worker facade propagates both synchronous and asynchronous trusted service failures", async t => {
  for (const asynchronous of [false, true]) {
    const f = fixture(t), failure = new Error("approved-frame-test-failure"); let calls = 0;
    const apply = () => { calls++; if (asynchronous) return Promise.reject(failure); throw failure; };
    await assert.rejects(rebuildWith({ applyApprovedFrames: apply })(request(f)), error => error === failure);
    assert.equal(calls, 1); assert.deepEqual(f.directories(), []);
  }
});

test("Worker facade rejects malformed and forged transaction receipts", async t => {
  let forgedActions = 0;
  for (const receipt of [undefined, null, true, "receipt", {}, [], new Proxy({}, {}), { commit() { forgedActions++; }, rollback() { forgedActions++; } }]) {
    const f = fixture(t); let calls = 0;
    await assert.rejects(rebuildWith({ applyApprovedFrames: async () => { calls++; return receipt; } })(request(f)), /^TypeError: invalid-approved-frame-application-receipt$/u);
    assert.equal(calls, 1); assert.deepEqual(f.directories(), []);
  }
  assert.equal(forgedActions, 0);
});

test("Worker facade rejects receipts issued for another invocation context", async t => {
  const f = fixture(t); let actions = 0;
  const receipt = issueApprovedFrameApplication({}, { commit() { actions++; }, rollback() { actions++; } });
  await assert.rejects(rebuildWith({ applyApprovedFrames: async () => receipt })(request(f)), /^TypeError: invalid-approved-frame-application-receipt$/u);
  assert.equal(actions, 0); assert.deepEqual(f.directories(), []);
});

test("Worker facade fails and rolls back when transaction commit fails", async t => {
  const f = fixture(t), failure = new Error("approved-frame-test-commit-failure"); let commits = 0, rollbacks = 0;
  await assert.rejects(rebuildWith({ applyApprovedFrames: async context => issueApprovedFrameApplication(context, {
    commit() { commits++; throw failure; }, rollback() { rollbacks++; }
  }) })(request(f)), error => error === failure);
  assert.equal(commits, 1); assert.equal(rollbacks, 1); assert.deepEqual(f.directories(), []);
});

test("Worker approved frame and connector mode regressions enter unified unit and all CI", () => {
  for (const suite of ["unit", "all"]) {
    const files = discoverTestFiles(path.resolve(__dirname, ".."), suite).map(row => path.basename(row.file));
    assert(files.includes("approved-frame-worker.test.js"));
  }
});
