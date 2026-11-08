"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWorkerDiagnosticCandidate } = require("../packages/slideclone-worker-adapter/worker-diagnostic-candidate");
const { writeStoredZipAtomic } = require("../packages/ooxml-core/pptx-zip");
const { discoverTestFiles } = require("../scripts/test-sharded");

function quality(ratio) {
  return { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    metrics: { "pixel-diff-ratio": ratio, "foreground-missing-ratio": ratio / 2, "mean-absolute-delta": ratio * 100 },
    text: "private-user-content", headers: "private-token" };
}
function fixture(t) {
  const temporaryRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "worker-diagnostic-test-")));
  const root = fs.mkdtempSync(path.join(temporaryRoot, "job-")), pptxFile = path.join(root, "candidate.pptx");
  const write = value => writeStoredZipAtomic(pptxFile, [{ name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
    { name: "ppt/presentation.xml", data: Buffer.from(value) }]);
  write("initial");
  const diagnostic = createWorkerDiagnosticCandidate(temporaryRoot);
  t.after(() => { diagnostic.close(); fs.rmSync(temporaryRoot, { recursive: true, force: true }); });
  return { temporaryRoot, root, pptxFile, write, diagnostic, request: { root, pptxFile } };
}
const budget = { timeoutMs: 100, elapsedMs: 110, timedOut: true, privateText: "private-token" };

test("timeout diagnostics retain the best verified artifact despite candidate overwrites and scratch cleanup", t => {
  const f = fixture(t);
  assert.equal(f.diagnostic.remember(f.request, quality(0.2)), true);
  f.write("best");
  const best = fs.readFileSync(f.pptxFile);
  assert.equal(f.diagnostic.remember(f.request, quality(0.1)), true);
  f.write("regressed");
  assert.equal(f.diagnostic.remember(f.request, quality(0.15)), false);
  assert.equal(f.diagnostic.remember(f.request, quality(0.1)), false);
  assert.equal(f.diagnostic.remember(f.request, { ...quality(0.09), metrics: { ...quality(0.09).metrics, "foreground-missing-ratio": 0.3 } }), false);
  fs.rmSync(f.root, { recursive: true });
  const retained = f.diagnostic.retain(budget);
  assert.deepEqual(fs.readFileSync(path.join(retained.directory, "candidate.pptx")), best);
  const summary = fs.readFileSync(path.join(retained.directory, "diagnostic.json"), "utf8");
  assert.equal(summary.includes("private"), false);
  assert.equal(retained.publishable, false);
  assert.equal(retained.visualFidelityPassed, false);
  assert.equal(retained.verifiedCandidates, 5);
  assert.equal(retained.metrics["pixel-diff-ratio"], 0.1);
});

test("empty, unrendered, invalid, contradictory or hostile quality never creates a diagnostic snapshot", t => {
  const f = fixture(t);
  assert.equal(f.diagnostic.retain(budget), null);
  let invoked = false;
  const getter = { get checks() { invoked = true; return []; } };
  const proxy = new Proxy({}, { get() { invoked = true; } });
  const sparse = { ...quality(0.1), checks: new Array(1) };
  for (const value of [null, {}, [], getter, proxy, sparse, { ...quality(0.1), checks: [] },
    { ...quality(0.1), checks: [...quality(0.1).checks, { name: "quality-rendered", passed: false }] }])
    assert.equal(f.diagnostic.remember(f.request, value), false);
  for (const value of [NaN, Infinity, -1, "0.1", null, 1.1])
    assert.equal(f.diagnostic.remember(f.request, { ...quality(0.1), metrics: { ...quality(0.1).metrics, "pixel-diff-ratio": value } }), false);
  assert.equal(invoked, false);
  assert.equal(fs.readdirSync(f.temporaryRoot).length, 1);
});

test("outside paths, symlinks, corrupt presentations and snapshot tampering fail closed", t => {
  const f = fixture(t);
  assert.throws(() => f.diagnostic.remember({ ...f.request, pptxFile: __filename }, quality(0.1)), /invalid/);
  assert.throws(() => f.diagnostic.remember({ ...f.request, root: f.temporaryRoot }, quality(0.1)), /invalid/);
  // Junctions require no Windows symlink privilege and must not admit artifacts outside the job.
  const junction = path.join(f.root, "escape");
  fs.symlinkSync(path.dirname(__filename), junction, "junction");
  assert.throws(() => f.diagnostic.remember({ ...f.request, pptxFile: path.join(junction, path.basename(__filename)) }, quality(0.1)), /invalid/);
  fs.writeFileSync(f.pptxFile, "broken");
  assert.throws(() => f.diagnostic.remember(f.request, quality(0.1)));
  f.write("best"); f.diagnostic.remember(f.request, quality(0.1));
  const retained = f.diagnostic.retain(budget);
  fs.writeFileSync(path.join(retained.directory, "candidate.pptx"), "tampered");
  assert.throws(() => f.diagnostic.retain(budget), /changed/);
});

test("passing render evidence stays diagnostic-only and close removes its snapshot", t => {
  const f = fixture(t), q = quality(0.01); q.checks[1].passed = true; q.passed = true;
  f.diagnostic.remember(f.request, q);
  assert.throws(() => f.diagnostic.retain({ ...budget, timedOut: false }), /invalid/);
  const retained = f.diagnostic.retain(budget);
  assert.equal(retained.visualFidelityPassed, true);
  assert.equal(retained.publishable, false);
  f.diagnostic.close(); f.diagnostic.close();
  assert.equal(fs.existsSync(retained.directory), false);
});

test("worker budget regressions are discovered by the unified CI suites", () => {
  const root = path.resolve(__dirname, "..");
  const unit = discoverTestFiles(root, "unit").map(item => item.file);
  const integration = discoverTestFiles(root, "integration");
  assert.ok(unit.includes(path.join("test", "worker-execution-budget.test.js")));
  assert.ok(unit.includes(path.join("test", "worker-diagnostic-candidate.test.js")));
  assert.equal(integration.find(item => item.file.endsWith("worker-budget-runner.test.js"))?.resource, "external-process");
});
