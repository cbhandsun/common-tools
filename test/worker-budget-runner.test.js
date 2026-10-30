"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createTemporaryTestDirectory: createTemp, removeTemporaryTestDirectory: removeTemp } = require("./helpers/temporary-directory.cjs");
const { performance } = require("node:perf_hooks");
const { WorkerFailure, storedWorkerFailure } = require("../packages/team-runtime/worker-failure");
const { createBudgetedWorkerHandler, budgetedQualityVerifier, remainingWorkerTimeout, runWorkerStage } = require("../packages/slideclone-worker-adapter/worker-budget-runner");
const { createImageToEditableArchiveHandler } = require("../packages/slideclone-worker-adapter/team-worker");
const { run } = require("../packages/slideclone-core/renderer-process");
const { writeStoredZipAtomic } = require("../packages/ooxml-core/pptx-zip");
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
function setup(t) {
  const temporaryRoot = createTemp("worker-budget-runner-test-");
  const root = fs.mkdtempSync(path.join(temporaryRoot, "job-")), pptxFile = path.join(root, "candidate.pptx");
  writeStoredZipAtomic(pptxFile, [{ name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
    { name: "ppt/presentation.xml", data: Buffer.from("<presentation/>") }]);
  t.after(() => removeTemp(temporaryRoot));
  return { temporaryRoot, root, pptxFile };
}
test("budget runner fixture cleanup retries a transient failure in its nested job directory", t => {
  const f = setup(t), rmdir = fs.rmdirSync;
  let attempts = 0;
  try {
    t.mock.method(fs, "rmdirSync", (target, ...args) => {
      if ((Buffer.isBuffer(target) ? target.toString() : target) === f.root && ++attempts <= 2)
        throw Object.assign(new Error("controlled transient scan"), { code: "ENOTEMPTY" });
      return rmdir(target, ...args);
    });
    removeTemp(f.temporaryRoot);
    assert.ok(attempts >= 3);
    assert.equal(fs.existsSync(f.temporaryRoot), false);
  } finally { t.mock.restoreAll(); }
});
function quality(ratio) {
  return { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    metrics: { "pixel-diff-ratio": ratio, "foreground-missing-ratio": ratio, "mean-absolute-delta": ratio * 100 } };
}

test('scene capacity conflicts retain a distinct nonretryable public failure while forged provider codes remain generic',async()=>{
 const {sceneInventoryCapacityError}=require('../packages/slideclone-core/scene-plan/source-scene-capacity');
 const {readStoredWorkerFailure}=require('../packages/team-runtime/worker-failure');
 const expected={code:'IMAGE_SCENE_CAPACITY_CONFLICT',message:'observed image relationships exceed reconstruction capacity',retryable:false};
 await assert.rejects(runWorkerStage('IMAGE_REBUILD_FAILED',()=>{throw sceneInventoryCapacityError();}),error=>{
  assert.deepEqual(storedWorkerFailure(error),expected);assert.deepEqual(readStoredWorkerFailure({...expected,message:'private-token',retryable:true}),expected);return true;
 });
 for(const code of ['IMAGE_REBUILD_FAILED','IMAGE_OCR_FAILED']){
  let calls=0;const error=code==='IMAGE_REBUILD_FAILED'?Object.assign(new Error('private-token'),{code:'SCENE_INVENTORY_CAPACITY_CONFLICT'}):sceneInventoryCapacityError();
  await assert.rejects(runWorkerStage(code,()=>{calls++;throw error;}),failure=>{
   assert.equal(storedWorkerFailure(failure).code,code);assert.equal(storedWorkerFailure(failure).retryable,false);
   assert.equal(JSON.stringify(storedWorkerFailure(failure)).includes('private-token'),false);return true;
  });assert.equal(calls,1);
 }
 assert.equal(await runWorkerStage('IMAGE_REBUILD_FAILED',()=>42),42);
});

test("many individually short quality stages exhaust one total budget and retain verified failure diagnostics", async t => {
  const f = setup(t); let attempts = 0, uploaded = false;
  const verify = budgetedQualityVerifier(async () => { attempts++; await delay(30); return quality(0.5 - attempts / 100); });
  const handler = createBudgetedWorkerHandler(async ({ isCancellationRequested }) => {
    for (let index = 0; index < 20; index++)
      await runWorkerStage("IMAGE_QUALITY_FAILED", () => verify({ root: f.root, pptxFile: f.pptxFile, isCancellationRequested }));
    uploaded = true;
    return { passed: true };
  }, { timeoutMs: 170, temporaryRoot: f.temporaryRoot });
  let failure;
  await assert.rejects(handler({ job: {}, isCancellationRequested: () => false }), error => { failure = error; return error instanceof WorkerFailure; });
  assert.equal(failure.code, "IMAGE_QUALITY_FAILED");
  assert.equal(failure.executionBudget.timedOut, true);
  assert.ok(attempts < 20);
  assert.equal(uploaded, false);
  const diagnostic = failure.executionBudget.diagnosticCandidate;
  assert.ok(diagnostic.verifiedCandidates >= 1);
  assert.equal(diagnostic.publishable, false);
  assert.equal(diagnostic.visualFidelityPassed, false);
  assert.equal(Object.keys(failure).includes("executionBudget"), false);
  assert.deepEqual(storedWorkerFailure(failure), { code: "IMAGE_QUALITY_FAILED", message: "image quality verification failed", retryable: false });
  assert.equal(fs.existsSync(path.join(diagnostic.directory, "candidate.pptx")), true);
});

test("success and non-timeout failure remove diagnostic snapshots and preserve stage failure identity", async t => {
  for (const fails of [false, true]) {
    const f = setup(t), expected = new WorkerFailure("IMAGE_REBUILD_FAILED");
    const verify = budgetedQualityVerifier(() => quality(0.2));
    const handler = createBudgetedWorkerHandler(async () => {
      await verify({ root: f.root, pptxFile: f.pptxFile });
      if (fails) throw expected;
      return { passed: false };
    }, { timeoutMs: 5000, temporaryRoot: f.temporaryRoot });
    if (fails) await assert.rejects(handler({ job: {}, isCancellationRequested: () => false }), error => error === expected);
    else assert.deepEqual(await handler({ job: {}, isCancellationRequested: () => false }), { passed: false });
    assert.equal(fs.readdirSync(f.temporaryRoot).some(name => name.startsWith("common-tools-editable-diagnostic-")), false);
  }
});

test("concurrent invocations isolate budgets and diagnostics", async t => {
  const f = setup(t);
  let now = 0, enterSlow, releaseSlow, enterFast, releaseFast, fastRemaining;
  const slowEntered = new Promise(resolve => { enterSlow = resolve; });
  const fastEntered = new Promise(resolve => { enterFast = resolve; });
  const slowGate = new Promise(resolve => { releaseSlow = resolve; });
  const fastGate = new Promise(resolve => { releaseFast = resolve; });
  const handler = createBudgetedWorkerHandler(async ({ job }) => {
    if (job.id === "slow") enterSlow(); else enterFast();
    await runWorkerStage("IMAGE_QUALITY_FAILED", () => job.id === "slow" ? slowGate : fastGate);
    if (job.id === "fast") fastRemaining = remainingWorkerTimeout(140);
    return job.id;
  }, { timeoutMs: 140, temporaryRoot: f.temporaryRoot, now: () => now });
  const slow = handler({ job: { id: "slow" }, isCancellationRequested: () => false });
  await slowEntered;
  now = 100;
  const fast = handler({ job: { id: "fast" }, isCancellationRequested: () => false });
  const pending = Promise.allSettled([slow, fast]);
  await fastEntered;
  now = 150;
  releaseSlow(); releaseFast();
  const outcomes = await pending;
  assert.equal(outcomes[0].status, "rejected");
  assert.equal(outcomes[0].reason.executionBudget.timeoutMs, 140);
  assert.equal(outcomes[0].reason.executionBudget.elapsedMs, 150);
  assert.equal(outcomes[0].reason.executionBudget.timedOut, true);
  assert.deepEqual(outcomes[1], { status: "fulfilled", value: "fast" });
  assert.equal(fastRemaining, 90);
});

test("handler clock injection retains the execution budget's clock validation", async t => {
  const f = setup(t);
  for (const now of [true, () => NaN, () => Infinity, () => -1]) {
    const handler = createBudgetedWorkerHandler(async () => assert.fail("invalid clock must not start work"),
      { timeoutMs: 140, temporaryRoot: f.temporaryRoot, now });
    await assert.rejects(handler({ job: {}, isCancellationRequested: () => false }), /worker execution (?:budget|clock) is invalid/u);
  }
});

test("total deadline kills a running renderer process tree before the handler returns", { timeout: 15000 }, async t => {
  const f = setup(t), ready = path.join(f.root, "ready.json"), finished = path.join(f.root, "finished");
  const script = path.join(f.root, "renderer.cjs");
  fs.writeFileSync(script, `const fs=require('node:fs'); const {spawn}=require('node:child_process');
const descendant=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
fs.writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:process.pid,descendant:descendant.pid}));
setTimeout(()=>fs.writeFileSync(${JSON.stringify(finished)},'late'),40000);`, "utf8");
  const handler = createBudgetedWorkerHandler(async ({ isCancellationRequested }) => {
    await runWorkerStage("IMAGE_BUILD_FAILED", () => run(process.execPath, [script], {
      timeout: remainingWorkerTimeout(540000), isCancellationRequested
    }));
  }, { timeoutMs: 2500, temporaryRoot: f.temporaryRoot });
  const started = performance.now();
  await assert.rejects(handler({ job: {}, isCancellationRequested: () => false }), error => error.code === "IMAGE_BUILD_FAILED" && error.executionBudget.timedOut);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 9000, `elapsed ${elapsed}`);
  const pids = JSON.parse(fs.readFileSync(ready, "utf8"));
  for (const pid of [pids.pid, pids.descendant]) assert.throws(() => process.kill(pid, 0), error => error.code === "ESRCH");
  assert.equal(fs.existsSync(finished), false);
  assert.equal(remainingWorkerTimeout(540000), 540000);
});

test("provider rejection at stage preflight uses the same safe cancellation cause as active-process polling", async t => {
  const f = setup(t); let check = 0, ran = false;
  const handler = createBudgetedWorkerHandler(async () => {
    await runWorkerStage("IMAGE_BUILD_FAILED", () => { ran = true; });
  }, { timeoutMs: 1000, temporaryRoot: f.temporaryRoot });
  await assert.rejects(handler({ job: {}, isCancellationRequested: () => {
    if (++check >= 2) throw new Error("private-cancellation-provider-content");
    return false;
  } }), error => error.code === "IMAGE_BUILD_FAILED" && error.cause?.message === "editable job was cancelled" && error.cause.cause === undefined);
  assert.equal(ran, false);
});

test("the real archive handler spends input-read time from the total budget before any builder starts", async t => {
  const f = setup(t); let now = 100, read = false, uploaded = false;
  t.mock.method(performance, "now", () => now);
  const handler = createImageToEditableArchiveHandler({ temporaryRoot: f.temporaryRoot, timeoutMs: 30000,
    objectStore: { readObject: async () => { read = true; now += 30000; return Buffer.alloc(0); }, putObject: async () => { uploaded = true; } } });
  await assert.rejects(handler({ job: { capability: "image-to-editable", inputObjectKey: "fixture", outputPrefix: "fixture/" }, isCancellationRequested: () => false }),
    error => error.code === "IMAGE_INPUT_READ_FAILED" && error.executionBudget.timeoutMs === 30000 && error.executionBudget.timedOut);
  assert.equal(read, true);
  assert.equal(uploaded, false);
  assert.equal(fs.readdirSync(f.temporaryRoot).some(name => name.startsWith("common-tools-editable-")), false);
});
