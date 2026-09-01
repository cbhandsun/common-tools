"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createValidationStagingRoot,
  isRetryableColdStartReport,
  isRetryableSessionAttachFailure,
  normalizePptxFiles,
  powerPointOpenValidationScript,
  resolveAsciiTempRoot,
  validatePowerPointOpen
} = require("../skills/pd-hifi-slideclone/scripts/adapters/validate-powerpoint-com");
const { STAGES } = require("../skills/pd-hifi-slideclone/scripts/lib/powerpoint-open-evidence");
const { URL_KEY, TOKEN_KEY } = require("../skills/pd-hifi-slideclone/scripts/lib/powerpoint-session-client");

test("PowerPoint open gate validates PPTX files at its boundary", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "powerpoint-open-gate-"));
  const pptx = path.join(tmp, "sample.pptx");
  fs.writeFileSync(pptx, "sample");

  assert.deepEqual(normalizePptxFiles([pptx]), [pptx]);
  assert.throws(() => normalizePptxFiles([]), /at least one/);
  assert.throws(() => normalizePptxFiles([path.join(tmp, "missing.pptx")]), /was not found/);
});

test("PowerPoint open gate restarts only unambiguous cold-start states", () => {
  assert.equal(isRetryableColdStartReport({
    passed: false,
    results: [{ error: "被呼叫方拒绝接收呼叫。 (RPC_E_CALL_REJECTED)" }]
  }), true);
  assert.equal(isRetryableColdStartReport({
    passed: false,
    results: [{
      opened: false,
      slideCount: 1,
      modifiedAfterOpen: true,
      repairAttempted: false,
      repairedInPlace: false,
      finalizedByPowerPoint: true,
      error: "PowerPoint modified the presentation while opening it; the package requires repair."
    }]
  }), true);
  assert.equal(isRetryableColdStartReport({
    passed: false,
    results: [{
      opened: false,
      slideCount: 1,
      modifiedAfterOpen: true,
      repairAttempted: true,
      repairedInPlace: false,
      finalizedByPowerPoint: true,
      error: "PowerPoint modified the presentation while opening it; the package requires repair."
    }]
  }), false);
  assert.equal(isRetryableColdStartReport({
    passed: false,
    results: [{ error: "PowerPoint modified the presentation while opening it; the package requires repair." }]
  }), false);
  assert.equal(isRetryableColdStartReport({ passed: false, results: [] }), false);
});

test("PowerPoint open gate retries only a completed shared-session COM attach failure", () => {
  const stages = Object.fromEntries(STAGES.map(stage => [stage, { attempts: 0, elapsedMs: 0, retries: 0, retryDelayMs: 0 }]));
  stages.lock.attempts = 1;
  stages["com-start"].attempts = 1;
  stages.finalizers.attempts = 1;
  stages.cleanup.attempts = 1;
  const evidence = { status: "valid", finished: true, activeStage: null, failedStage: "com-start", stages };
  assert.equal(isRetryableSessionAttachFailure(evidence, true), true);
  assert.equal(isRetryableSessionAttachFailure(evidence, false), false);
  for (const changes of [
    { status: "missing" },
    { status: "invalid" },
    { finished: false },
    { activeStage: "com-start" },
    { failedStage: "open" }
  ]) assert.equal(isRetryableSessionAttachFailure({ ...evidence, ...changes }, true), false);
  for (const stage of ["open", "slide-count", "saved-state", "save-copy", "close", "quit", "session-detach"]) {
    const changed = structuredClone(evidence);
    changed.stages[stage].attempts = 1;
    assert.equal(isRetryableSessionAttachFailure(changed, true), false, stage);
  }
  for (const [stage, attempts] of [["lock", 0], ["com-start", 2], ["finalizers", 0], ["cleanup", 0]]) {
    const changed = structuredClone(evidence);
    changed.stages[stage].attempts = attempts;
    assert.equal(isRetryableSessionAttachFailure(changed, true), false, stage);
  }
});

test("PowerPoint open gate rejects files that PowerPoint dirties while opening", () => {
  const script = powerPointOpenValidationScript();
  assert.match(script, /foreach \(\$file in @\(\$manifest\.files\)\)/);
  assert.match(script, /System\.Threading\.Mutex/);
  assert.match(script, /Local\\SlideclonePowerPointOpenGate/);
  assert.match(script, /\$comMutex\.WaitOne\(150000\)/);
  assert.match(script, /\$comMutex\.ReleaseMutex\(\)/);
  assert.match(script, /Get-Content -LiteralPath \$ManifestFile -Raw -Encoding UTF8/);
  assert.match(script, /\$presentations\.Open/);
  assert.match(script, /function Open-PresentationWithRetry/);
  assert.match(script, /\$openAttempt = 1; \$openAttempt -le 12/);
  assert.match(script, /catch \[System\.Runtime\.InteropServices\.COMException\]/);
  assert.match(script, /\$app\.DisplayAlerts = 1/);
  assert.match(script, /Copy-Item -LiteralPath \(\[string\]\$file\) -Destination \$stagingFile -Force/);
  assert.match(script, /\$presentations\.Open\(\$FilePath, \$msoFalse, \$msoFalse, \$msoFalse\)/);
  assert.match(script, /Read-only opens hide the dirty state/);
  assert.match(script, /function Get-SlideCountWithRetry/);
  assert.match(script, /first-run add-ins and repair services are initializing/);
  assert.match(script, /PowerPoint process can expose a null Presentations collection/);
  assert.match(script, /\$openAttempt -le 12/);
  assert.match(script, /\$maxSlideLoadAttempts = 60/);
  assert.match(script, /\$slideCount = \[int\]\$slides\.Count/);
  assert.match(script, /ReleaseComObject\(\$presentations\)/);
  assert.match(script, /ReleaseComObject\(\$slides\)/);
  assert.match(script, /function Get-PresentationModifiedWithRetry/);
  assert.match(script, /PowerPoint can reject a property call while it finalizes/);
  assert.match(script, /PowerPoint can expose a null Slides collection/);
  assert.match(script, /did not load any slides/);
  assert.match(script, /return \(\$Presentation\.Saved -ne \$msoTrue\)/);
  assert.match(script, /\$modifiedAfterOpen = Get-PresentationModifiedWithRetry \$presentation/);
  assert.match(script, /Always canonicalize generated deliveries through a/);
  assert.match(script, /\$finalizedByPowerPoint = \$true/);
  assert.match(script, /function Save-PresentationCopyWithRetry/);
  assert.match(script, /\$saveAttempt = 1; \$saveAttempt -le 12/);
  assert.match(script, /Save-PresentationCopyWithRetry \$presentation \$repairedFile/);
  assert.match(script, /repairAttempted/);
  assert.match(script, /repairedInPlace/);
  assert.match(script, /modifiedAfterOpen/);
  assert.match(script, /requires repair/);
  assert.match(script, /\$presentation\.Close/);
  assert.match(script, /\$app\.Quit/);
  assert.match(script, /\$reuseApplication/);
  assert.match(script, /Start-OpenGateStep 'session-detach'/);
  assert.match(script, /exit 1/);
});

test("PowerPoint open gate uses an ASCII-safe isolated staging root", () => {
  const root = createValidationStagingRoot(path.join(os.tmpdir(), "output"));
  assert.match(root, /slideclone-powerpoint-open-gate/);
  assert.ok(root.startsWith(resolveAsciiTempRoot()));
  fs.rmSync(root, { recursive: true, force: true });
});

test("PowerPoint open gate consumes and authorizes a shared session before launching its child", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "powerpoint-session-boundary-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pptx = path.join(root, "source.pptx");
  fs.writeFileSync(pptx, "fixture");
  const environment = { [URL_KEY]: "http://127.0.0.1:12345/", [TOKEN_KEY]: "z".repeat(43), KEEP: "yes" };
  let authorizations = 0;
  const report = await validatePowerPointOpen([pptx], { outputDir: path.join(root, "out") }, {
    sessionEnvironment: environment,
    authorizePowerPointSession: async session => {
      authorizations += 1;
      assert.equal(session[TOKEN_KEY], "z".repeat(43));
      return true;
    },
    run: async (_command, args) => {
      const argument = name => args[args.indexOf(name) + 1];
      const manifest = JSON.parse(fs.readFileSync(argument("-ManifestFile"), "utf8").replace(/^\uFEFF/u, ""));
      assert.equal(manifest.reuseApplication, true);
      fs.rmSync(manifest.stagingRoot, { recursive: true, force: true });
      fs.writeFileSync(argument("-ReportFile"), JSON.stringify({ passed: true, sessionReused: true, results: [{ opened: true }] }));
      fs.writeFileSync(argument("-EvidenceFile"), JSON.stringify({
        version: 1,
        invocationId: argument("-InvocationId"),
        finished: true,
        activeStage: null,
        failedStage: null,
        stages: Object.fromEntries(STAGES.map(stage => [stage, { attempts: 0, elapsedMs: 0, retries: 0, retryDelayMs: 0 }]))
      }));
    }
  });
  assert.equal(authorizations, 1);
  assert.equal(report.sessionReused, true);
  assert.deepEqual(environment, { KEEP: "yes" });
});

test("PowerPoint open gate restarts a completed transient shared-session attach", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "powerpoint-session-attach-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pptx = path.join(root, "source.pptx");
  fs.writeFileSync(pptx, "fixture");
  let launches = 0;
  const waits = [];
  let output = "";
  const report = await validatePowerPointOpen([pptx], { outputDir: path.join(root, "out") }, {
    sessionEnvironment: { [URL_KEY]: "http://127.0.0.1:12345/", [TOKEN_KEY]: "z".repeat(43) },
    authorizePowerPointSession: async () => true,
    evidenceStream: { write: value => { output += value; } },
    wait: async milliseconds => { waits.push(milliseconds); },
    run: async (_command, args) => {
      launches += 1;
      const argument = name => args[args.indexOf(name) + 1];
      const manifest = JSON.parse(fs.readFileSync(argument("-ManifestFile"), "utf8").replace(/^\uFEFF/u, ""));
      assert.equal(manifest.reuseApplication, true);
      fs.rmSync(manifest.stagingRoot, { recursive: true, force: true });
      const stages = Object.fromEntries(STAGES.map(stage => [stage, { attempts: 0, elapsedMs: 0, retries: 0, retryDelayMs: 0 }]));
      if (launches === 1) {
        stages.lock.attempts = 1;
        stages["com-start"].attempts = 1;
        stages.finalizers.attempts = 1;
        stages.cleanup.attempts = 1;
        fs.writeFileSync(argument("-EvidenceFile"), JSON.stringify({
          version: 1,
          invocationId: argument("-InvocationId"),
          finished: true,
          activeStage: null,
          failedStage: "com-start",
          stages
        }));
        throw new Error("PRIVATE_VALUE");
      }
      fs.writeFileSync(argument("-ReportFile"), JSON.stringify({ passed: true, sessionReused: true, results: [{ opened: true }] }));
      fs.writeFileSync(argument("-EvidenceFile"), JSON.stringify({
        version: 1,
        invocationId: argument("-InvocationId"),
        finished: true,
        activeStage: null,
        failedStage: null,
        stages
      }));
    }
  });
  assert.equal(report.passed, true);
  assert.equal(launches, 2);
  assert.deepEqual(waits, [3000]);
  assert.doesNotMatch(output, /PRIVATE_VALUE|source\.pptx/u);
  const events = output.trim().split("\n").map(line => JSON.parse(line.slice("[slideclone-progress] ".length)));
  assert.ok(events.some(event => event.launchAttempt === 1 && event.phase === "com-start" && event.status === "failed"));
  assert.ok(events.some(event => event.launchAttempt === 2 && event.phase === "attempt" && event.status === "done"));
});
