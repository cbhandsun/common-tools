"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { recordRoundTripEvidence, summarizeRoundTripReport } = require("../skills/pd-hifi-slideclone/scripts/lib/powerpoint-roundtrip-evidence");
const { validatePowerPointEditableRoundTrip } = require("../skills/pd-hifi-slideclone/scripts/adapters/validate-powerpoint-editable-roundtrip");

function report(verified = true) {
  return { provider: "powerpoint-editable-roundtrip-v1", passed: verified, failed: verified ? 0 : 1,
    results: [{ file: "private/source.pptx", mode: "auto", opened: true, saved: true, reopened: verified, verified,
      stage: verified ? "complete" : "reopen", hresult: verified ? null : "0x80004005", error: "private-content-secret" }] };
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ct-roundtrip-evidence-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, reportFile: path.join(root, "powerpoint-editable-roundtrip-report.json"), summaryFile: path.join(root, "powerpoint-editable-roundtrip-summary.json") };
}

test("round-trip evidence accepts only a complete consistent pass and a successful process", () => {
  const result = summarizeRoundTripReport(report(), 1, "succeeded");
  assert.equal(result.passed, true);
  assert.equal(result.reportStatus, "valid");
  for (const processStatus of ["failed", "terminated"]) assert.equal(summarizeRoundTripReport(report(), 1, processStatus).passed, false);
  for (const value of [null, {}, { ...report(), results: [] }, { ...report(), failed: 1 }, { ...report(), results: [report().results[0], report().results[0]] }]) {
    assert.equal(summarizeRoundTripReport(value, 1, "succeeded").reportStatus, "invalid");
  }
  assert.throws(() => summarizeRoundTripReport(report(), 0, "succeeded"), /invalid/);
  assert.throws(() => summarizeRoundTripReport(report(), 65, "succeeded"), /invalid/);
  assert.throws(() => summarizeRoundTripReport(report(), 1, "secret-value"), /invalid/);
});

test("failure summaries preserve stage, booleans and HRESULT but never source paths or error content", () => {
  const summary = summarizeRoundTripReport(report(false), 1, "failed");
  assert.equal(summary.passed, false);
  assert.equal(summary.failedCases, 1);
  assert.equal(summary.results[0].stage, "reopen");
  assert.equal(summary.results[0].hresult, "0x80004005");
  assert.doesNotMatch(JSON.stringify(summary), /private|secret|source[.]pptx/);
  const malformed = report(false);
  malformed.results[0].stage = "private-stage";
  malformed.results[0].hresult = "private-hresult";
  const safe = summarizeRoundTripReport(malformed, 1, "failed");
  assert.equal(safe.results[0].stage, "unknown");
  assert.equal(safe.results[0].hresult, null);
  assert.doesNotMatch(JSON.stringify(safe), /private/);
});

test("global and partial failures remain failed and cannot impersonate complete verification", () => {
  const global = { provider: "powerpoint-editable-roundtrip-v1", passed: false, failed: 1,
    results: [{ opened: false, saved: false, reopened: false, verified: false, stage: "application" }] };
  assert.equal(summarizeRoundTripReport(global, 5, "failed").passed, false);
  const inconsistent = report(); inconsistent.results[0].opened = false;
  assert.equal(summarizeRoundTripReport(inconsistent, 1, "succeeded").reportStatus, "invalid");
  const extreme = report(); extreme.results = Array(66).fill(report().results[0]);
  assert.equal(summarizeRoundTripReport(extreme, 64, "succeeded").reportStatus, "invalid");
  extreme.results = Array(64).fill(report().results[0]);
  assert.equal(summarizeRoundTripReport(extreme, 64, "succeeded").passed, true);
  const wrongType = report(); wrongType.results[0].verified = "true";
  assert.equal(summarizeRoundTripReport(wrongType, 1, "succeeded").reportStatus, "invalid");
});

test("missing, malformed, oversized and linked reports produce bounded failing evidence", (t) => {
  const f = fixture(t);
  assert.equal(recordRoundTripEvidence(f.reportFile, 1, "failed").summary.reportStatus, "missing");
  fs.writeFileSync(f.reportFile, "invalid-json");
  assert.equal(recordRoundTripEvidence(f.reportFile, 1, "succeeded").summary.reportStatus, "invalid");
  const validJson = JSON.stringify(report());
  fs.writeFileSync(f.reportFile, validJson + " ".repeat(262144 - Buffer.byteLength(validJson)));
  assert.equal(recordRoundTripEvidence(f.reportFile, 1, "succeeded").summary.passed, true);
  fs.writeFileSync(f.reportFile, Buffer.alloc(262145));
  assert.equal(recordRoundTripEvidence(f.reportFile, 1, "succeeded").summary.reportStatus, "invalid");
  fs.writeFileSync(f.reportFile, JSON.stringify(report()));
  fs.linkSync(f.reportFile, path.join(f.root, "hard-link.json"));
  assert.equal(recordRoundTripEvidence(f.reportFile, 1, "succeeded").summary.reportStatus, "invalid");
  assert.ok(fs.statSync(f.summaryFile).size < 2048);
});

test("read and publication I/O failures remain safe failures", (t) => {
  const f = fixture(t); fs.writeFileSync(f.reportFile, JSON.stringify(report()));
  const originalOpen = fs.openSync; const originalRename = fs.renameSync;
  try {
    fs.openSync = (file, ...args) => { if (file === f.reportFile) throw new Error("private-read-error"); return originalOpen(file, ...args); };
    const result = recordRoundTripEvidence(f.reportFile, 1, "succeeded");
    assert.equal(result.summary.reportStatus, "unavailable");
    assert.equal(result.summary.passed, false);
    assert.doesNotMatch(JSON.stringify(result.summary), /private/);
    fs.openSync = originalOpen;
    fs.renameSync = () => { throw new Error("private-publication-error"); };
    assert.throws(() => recordRoundTripEvidence(f.reportFile, 1, "succeeded"), /^Error: PowerPoint round-trip evidence could not be saved[.]$/);
    assert.equal(fs.readdirSync(f.root).some((name) => name.endsWith(".tmp")), false);
  } finally { fs.openSync = originalOpen; fs.renameSync = originalRename; }
});

test("round-trip evidence helpers are included in the unified lint entry", () => {
  const manifest = require("../package.json");
  assert.match(manifest.scripts.lint, /skills\/pd-hifi-slideclone\/scripts\/lib\/powerpoint-roundtrip-evidence[.]js/);
  assert.match(manifest.scripts.lint, /skills\/pd-hifi-slideclone\/scripts\/adapters\/validate-powerpoint-editable-roundtrip[.]js/);
});

test("evidence is saved before returning failure and can safely replace its previous regular file", (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.reportFile, JSON.stringify(report(false)));
  const failed = recordRoundTripEvidence(f.reportFile, 1, "failed");
  assert.deepEqual(JSON.parse(fs.readFileSync(f.summaryFile, "utf8")), failed.summary);
  fs.writeFileSync(f.reportFile, `\uFEFF${JSON.stringify(report())}`);
  assert.equal(recordRoundTripEvidence(f.reportFile, 1, "succeeded").summary.passed, true);
  fs.linkSync(f.summaryFile, path.join(f.root, "summary-link.json"));
  assert.throws(() => recordRoundTripEvidence(f.reportFile, 1, "succeeded"), /^Error: PowerPoint round-trip evidence could not be saved[.]$/);
  assert.equal(fs.readdirSync(f.root).some((name) => name.endsWith(".tmp")), false);
});

test("invocation identity rejects stale passing reports", () => {
  const invocationId = "00000000-0000-4000-8000-000000000001";
  assert.equal(summarizeRoundTripReport(report(), 1, "succeeded", invocationId).passed, false);
  assert.equal(summarizeRoundTripReport({ ...report(), invocationId }, 1, "succeeded", invocationId).passed, true);
  assert.throws(() => summarizeRoundTripReport(report(), 1, "succeeded", "secret-id"), /invalid/);
});

for (const scenario of ["success", "failed-report", "missing-report", "terminated", "false-process-success", "stale-pass"]) {
  test(`adapter archives bounded evidence and fails closed: ${scenario}`, async (t) => {
    const f = fixture(t); const deck = path.join(f.root, "deck.pptx"); fs.writeFileSync(deck, "fixture");
    if (scenario === "stale-pass") fs.writeFileSync(f.reportFile, JSON.stringify(report()));
    const runCommand = async (command, args) => {
      assert.equal(command, "powershell.exe");
      const manifest = JSON.parse(fs.readFileSync(args[args.indexOf("-ManifestFile") + 1], "utf8").replace(/^\uFEFF/u, ""));
      assert.equal(path.basename(path.dirname(manifest.stagingRoot)), "slideclone-powerpoint-editable-roundtrip");
      t.after(() => fs.rmSync(manifest.stagingRoot, { recursive: true, force: true }));
      if (["success", "failed-report", "false-process-success"].includes(scenario)) {
        fs.writeFileSync(f.reportFile, JSON.stringify({ ...report(scenario !== "failed-report"), invocationId: args[args.indexOf("-InvocationId") + 1] }));
      }
      if (["failed-report", "missing-report", "terminated", "false-process-success"].includes(scenario)) {
        const error = new Error("Command failed: private-path user-content secret-value");
        error.killed = scenario === "terminated";
        throw error;
      }
    };
    const execution = validatePowerPointEditableRoundTrip([{ file: deck }], { outputDir: f.root, runCommand });
    if (scenario === "success") assert.equal((await execution).passed, true);
    else await assert.rejects(execution, (error) => {
      assert.match(error.message, /^PowerPoint editable round-trip failed:/);
      assert.doesNotMatch(error.message, /private|secret|user-content/);
      return true;
    });
    const summary = JSON.parse(fs.readFileSync(f.summaryFile, "utf8"));
    assert.equal(summary.passed, scenario === "success");
    if (scenario === "terminated") assert.equal(summary.processStatus, "terminated");
    if (scenario === "stale-pass") assert.equal(summary.reportStatus, "invalid");
    assert.doesNotMatch(JSON.stringify(summary), /private|secret|source[.]pptx/);
  });
}
