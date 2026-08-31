"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { readOpenGateEvidence, emitOpenGateEvidence, STAGES } = require("../skills/pd-hifi-slideclone/scripts/lib/powerpoint-open-evidence");
const { powerPointOpenValidationScript, validatePowerPointOpen } = require("../skills/pd-hifi-slideclone/scripts/adapters/validate-powerpoint-com");
const { createProgressLineForwarder, sanitizeEvent } = require("../skills/pd-hifi-slideclone/scripts/lib/progress-reporter");
const { discoverTestFiles } = require("../scripts/test-sharded");

const invocationId = "11111111-1111-4111-8111-111111111111";
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ct-open-evidence-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, evidenceFile: path.join(root, "evidence.json") };
}
function evidence() {
  return { version: 1, invocationId, finished: true, activeStage: null, failedStage: null, stages: Object.fromEntries(STAGES.map(stage => [stage, { attempts: 0, elapsedMs: 0, retries: 0, retryDelayMs: 0 }])) };
}

test("open-gate evidence tests belong to the unified external-process wave", () => {
  const entry = discoverTestFiles(path.resolve(__dirname, ".."), "unit").find(item => path.basename(item.file) === "powerpoint-com-open-evidence.test.js");
  assert.equal(entry?.resource, "external-process");
  const manifest = require("../package.json");
  const lintConfig = require("../eslint.config");
  for (const file of ["lib/powerpoint-open-evidence.js", "lib/progress-reporter.js", "adapters/validate-powerpoint-com.js"]) {
    const source = `skills/pd-hifi-slideclone/scripts/${file}`;
    assert.ok(manifest.scripts.lint.includes(source));
    assert.ok(lintConfig.some(config => config.files?.includes(source) && config.rules?.["no-console"] === "error"));
  }
});

test("open-gate evidence admits only bounded numeric stages for this invocation", t => {
  const { evidenceFile } = fixture(t);
  const input = evidence();
  input.token = "PRIVATE_VALUE";
  input.stages.open = { attempts: 3, elapsedMs: 17, retries: 1, retryDelayMs: 600, file: "PRIVATE_VALUE" };
  fs.writeFileSync(evidenceFile, JSON.stringify(input));
  const result = readOpenGateEvidence(evidenceFile, invocationId);
  assert.equal(result.status, "valid");
  assert.deepEqual(result.stages.open, { attempts: 3, elapsedMs: 17, retries: 1, retryDelayMs: 600 });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_VALUE|token|file/);
});

test("runtime package validation requires the complete open-gate evidence dependency chain", () => {
  const { REQUIRED_FILES, parsePackMetadata } = require("../scripts/verify-runtime-package");
  for (const source of ["adapters/validate-powerpoint-com.js", "lib/powerpoint-open-evidence.js", "lib/progress-reporter.js"]) {
    const file = `skills/pd-hifi-slideclone/scripts/${source}`;
    assert.ok(REQUIRED_FILES.includes(file));
    const metadata = [{ filename: "runtime.tgz", size: 100, files: REQUIRED_FILES.filter(item => item !== file).map(item => ({ path: item, size: 1 })) }];
    assert.throws(() => parsePackMetadata(JSON.stringify(metadata)), /missing a required file/);
  }
});

test("missing, partial, stale, malformed and excessive evidence cannot be valid", t => {
  const { evidenceFile } = fixture(t);
  assert.equal(readOpenGateEvidence(evidenceFile, invocationId).status, "missing");
  assert.equal(readOpenGateEvidence(path.dirname(evidenceFile), invocationId).status, "invalid");
  for (const input of ["", "{", "null", "[]", "x".repeat(32769), JSON.stringify({ ...evidence(), invocationId: "stale" })]) {
    fs.writeFileSync(evidenceFile, input);
    assert.equal(readOpenGateEvidence(evidenceFile, invocationId).status, "invalid");
  }
  for (const value of [-1, 1.1, "12", null, 86400001, Number.MAX_SAFE_INTEGER]) {
    const input = evidence();
    input.stages.open.elapsedMs = value;
    fs.writeFileSync(evidenceFile, JSON.stringify(input));
    assert.equal(readOpenGateEvidence(evidenceFile, invocationId).status, "invalid");
  }
  for (const changes of [{ activeStage: "PRIVATE_VALUE" }, { failedStage: "PRIVATE_VALUE" }, { finished: "true" }, { stages: {} }]) {
    fs.writeFileSync(evidenceFile, JSON.stringify({ ...evidence(), ...changes }));
    assert.equal(readOpenGateEvidence(evidenceFile, invocationId).status, "invalid");
  }
  for (const count of [-1, 1.1, "1", 100001]) {
    const input = evidence();
    input.stages.open.attempts = count;
    fs.writeFileSync(evidenceFile, JSON.stringify(input));
    assert.equal(readOpenGateEvidence(evidenceFile, invocationId).status, "invalid");
  }
  const maximum = evidence();
  maximum.stages.open = { attempts: 100000, retries: 100000, elapsedMs: 86400000, retryDelayMs: 86400000 };
  fs.writeFileSync(evidenceFile, JSON.stringify(maximum));
  assert.equal(readOpenGateEvidence(evidenceFile, invocationId).status, "valid");
  assert.equal(readOpenGateEvidence(evidenceFile, null).status, "invalid");
});

test("safe attempt and stage metrics survive the real progress forwarder", t => {
  const { evidenceFile } = fixture(t);
  const input = evidence();
  input.finished = false;
  input.activeStage = "com-start";
  input.stages.lock = { attempts: 1, elapsedMs: 123, retries: 0, retryDelayMs: 0 };
  input.stages["com-start"].attempts = 1;
  fs.writeFileSync(evidenceFile, JSON.stringify(input));
  let output = "";
  const forwarder = createProgressLineForwarder({ stream: { write: value => { output += value; } } });
  emitOpenGateEvidence(readOpenGateEvidence(evidenceFile, invocationId), { launchAttempt: 2, elapsedMs: 500, succeeded: false }, { write: value => forwarder.write(value) });
  forwarder.flush();
  const events = output.trim().split("\n").map(line => JSON.parse(line.slice("[slideclone-progress] ".length)));
  assert.ok(events.some(event => event.phase === "lock" && event.elapsedMs === 123 && event.attempts === 1 && event.launchAttempt === 2));
  assert.ok(events.some(event => event.phase === "com-start" && event.status === "interrupted"));
  assert.ok(events.some(event => event.phase === "attempt" && event.status === "failed" && event.elapsedMs === 500));
});

test("diagnostic progress fields reject strings, unsafe numbers and private values", () => {
  for (const name of ["attempts", "retries", "retryDelayMs", "launchAttempt"]) {
    for (const value of ["PRIVATE_VALUE", "1", -1, Infinity, NaN, 1.1, 86400001, null, {}]) {
      assert.deepEqual(sanitizeEvent({ [name]: value }), {});
    }
    assert.deepEqual(sanitizeEvent({ [name]: 3 }), { [name]: 3 });
  }
});

test("Node open-gate boundary preserves failure, records every launch and rejects missing evidence", async t => {
  const { root } = fixture(t);
  const source = path.join(root, "source.pptx");
  fs.writeFileSync(source, "not opened by the controlled executor");
  for (const scenario of ["success", "retry", "missing", "stale", "partial", "failure", "rejected"]) {
    const outputDir = path.join(root, scenario);
    let output = "";
    let launches = 0;
    const waits = [];
    const operation = validatePowerPointOpen([source], { outputDir }, {
      evidenceStream: { write: value => { output += value; } },
      wait: async ms => { waits.push(ms); },
      run: async (command, args, options) => {
        launches++;
        assert.equal(command, "powershell.exe");
        assert.equal(options.timeout, 170000);
        const argument = name => args[args.indexOf(name) + 1];
        const manifest = JSON.parse(fs.readFileSync(argument("-ManifestFile"), "utf8").replace(/^\uFEFF/, ""));
        // The real child owns staging cleanup; the controlled child does it too.
        fs.rmSync(manifest.stagingRoot, { recursive: true, force: true });
        const failed = scenario === "failure" || (scenario === "retry" && launches === 1);
        const report = { passed: !failed && scenario !== "rejected", results: [{ file: "PRIVATE_VALUE", opened: !failed && scenario !== "rejected", error: scenario === "retry" ? "RPC_E_CALL_REJECTED PRIVATE_VALUE" : "PRIVATE_VALUE" }] };
        fs.writeFileSync(argument("-ReportFile"), JSON.stringify(report));
        if (scenario !== "missing") {
          const payload = { ...evidence(), invocationId: scenario === "stale" ? invocationId : argument("-InvocationId") };
          if (failed) { payload.finished = false; payload.activeStage = "com-start"; payload.stages["com-start"].attempts = 1; }
          fs.writeFileSync(argument("-EvidenceFile"), scenario === "partial" ? "{" : JSON.stringify(payload));
        }
        if (failed) throw Object.assign(new Error("PRIVATE_VALUE"), { stderr: "PRIVATE_VALUE", stdout: "PRIVATE_VALUE" });
        return { stdout: "", stderr: "" };
      }
    });
    if (["success", "retry"].includes(scenario)) assert.equal((await operation).passed, true);
    else await assert.rejects(operation, error => !error.message.includes("PRIVATE_VALUE"));
    assert.equal(launches, scenario === "retry" ? 2 : 1);
    assert.deepEqual(waits, scenario === "retry" ? [3000] : []);
    assert.doesNotMatch(output, /PRIVATE_VALUE|source\.pptx/);
    const events = output.trim().split("\n").map(line => JSON.parse(line.slice("[slideclone-progress] ".length)));
    assert.equal(events.filter(event => event.phase === "attempt").length, launches);
    if (scenario === "retry") assert.ok(events.some(event => event.phase === "attempt" && event.launchAttempt === 1 && event.retryDelayMs === 3000 && event.status === "failed"));
    if (scenario === "failure") assert.ok(events.some(event => event.phase === "com-start" && event.status === "interrupted"));
  }
});

test("generated PowerShell records actual fake-COM success, retry and lock failure without Office", t => {
  const { root, evidenceFile } = fixture(t);
  const generated = path.join(root, "generated.ps1");
  const manifestFile = path.join(root, "manifest.json");
  const reportFile = path.join(root, "report.json");
  const sourceFile = path.join(root, "source.pptx");
  fs.writeFileSync(generated, powerPointOpenValidationScript());
  fs.writeFileSync(sourceFile, "fake package, never opened in Office");
  for (const scenario of ["success", "retry", "lock-failure"]) {
    fs.rmSync(evidenceFile, { force: true });
    fs.rmSync(reportFile, { force: true });
    const stagingRoot = path.join(root, scenario);
    fs.mkdirSync(stagingRoot);
    fs.writeFileSync(manifestFile, JSON.stringify({ files: [sourceFile], repairInPlace: true, stagingRoot }));
    const result = spawnSync(process.platform === "win32" ? "powershell.exe" : "pwsh", [
      "-NoProfile", "-NonInteractive", "-File", path.join(__dirname, "fixtures/powerpoint-com-open-evidence.ps1"),
      "-GeneratedScript", generated, "-ManifestFile", manifestFile, "-ReportFile", reportFile,
      "-EvidenceFile", evidenceFile, "-InvocationId", invocationId, "-Scenario", scenario
    ], { encoding: "utf8", windowsHide: true, timeout: 30000 });
    assert.equal(result.error, undefined);
    if (scenario === "lock-failure") assert.notEqual(result.status, 0);
    else assert.equal(result.status, 0, result.stderr);
    const metrics = readOpenGateEvidence(evidenceFile, invocationId);
    assert.equal(metrics.status, "valid");
    assert.equal(metrics.finished, true);
    assert.equal(metrics.stages.lock.attempts, 1);
    if (scenario === "lock-failure") {
      assert.equal(metrics.stages["com-start"].attempts, 0);
      assert.equal(metrics.failedStage, "lock");
    }
    else {
      assert.equal(metrics.stages["com-start"].attempts, 1);
      assert.equal(metrics.stages.open.attempts, scenario === "retry" ? 3 : 2);
      assert.equal(metrics.stages.open.retries, scenario === "retry" ? 1 : 0);
      assert.equal(metrics.stages.open.retryDelayMs, scenario === "retry" ? 600 : 0);
      assert.equal(metrics.stages["save-copy"].attempts, 1);
      assert.equal(metrics.stages.quit.attempts, 1);
      assert.equal(JSON.parse(fs.readFileSync(reportFile, "utf8").replace(/^\uFEFF/, "")).passed, true);
    }
    assert.doesNotMatch(fs.readFileSync(evidenceFile, "utf8"), /source\.pptx|PRIVATE_VALUE/);
  }
});
