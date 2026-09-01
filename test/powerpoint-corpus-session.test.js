"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const {
  URL_KEY,
  TOKEN_KEY,
  authorizePowerPointSession,
  cleanPowerPointSessionEnvironment,
  takePowerPointSessionEnvironment
} = require("../skills/pd-hifi-slideclone/scripts/lib/powerpoint-session-client");
const { keeperCleanupError, keeperScript, startPowerPointSessionBroker } = require("../skills/pd-hifi-slideclone/scripts/lib/powerpoint-session-broker");
const {
  eligibleForPowerPointSession,
  powerPointSessionEnabled,
  runPowerPointCorpusSession,
  safeCleanupDiagnostic
} = require("../skills/pd-hifi-slideclone/scripts/lib/powerpoint-corpus-session");

const root = path.resolve(__dirname, "..");
const token = "z".repeat(43);
const sessionEnvironment = { [URL_KEY]: "http://127.0.0.1:12345/", [TOKEN_KEY]: token };
const keeperMetrics = { createMs: 10, quitMs: 11, collectMs: 1, waitMs: 2, exitMs: 3, releaseRemaining: 0, stderrBytes: 0 };
const entry = (id = "case") => ({
  id,
  command: [process.execPath, path.join(root, "skills/pd-hifi-slideclone/scripts/complex-graphic-golden-smoke.js"), "--deck", id]
});

test("PowerPoint session selection and credentials fail closed", async () => {
  for (const value of [undefined, false, "false"]) assert.equal(powerPointSessionEnabled(value), false);
  for (const value of [true, "true"]) assert.equal(powerPointSessionEnabled(value), true);
  for (const value of [null, 1, "", "auto", {}, []]) assert.throws(() => powerPointSessionEnabled(value), /true or false/);
  assert.equal(eligibleForPowerPointSession(entry()), true);
  for (const value of [null, {}, { command: [] }, { command: [1] }, { command: ["other", entry().command[1]] }, { command: [process.execPath, "other.js"] }]) {
    assert.equal(eligibleForPowerPointSession(value), false);
  }
  assert.deepEqual(cleanPowerPointSessionEnvironment({ ...sessionEnvironment, KEEP: "yes" }), { KEEP: "yes" });
  const consumed = { ...sessionEnvironment, KEEP: "yes" };
  assert.deepEqual(takePowerPointSessionEnvironment(consumed), sessionEnvironment);
  assert.deepEqual(consumed, { KEEP: "yes" });
  assert.equal(await authorizePowerPointSession({}), false);
  for (const invalid of [
    { [URL_KEY]: sessionEnvironment[URL_KEY] },
    { [TOKEN_KEY]: token },
    { ...sessionEnvironment, [URL_KEY]: "https://127.0.0.1:12345/" },
    { ...sessionEnvironment, [URL_KEY]: "http://private:secret@127.0.0.1:12345/" },
    { ...sessionEnvironment, [URL_KEY]: "http://127.0.0.1:12345/?token=private" },
    { ...sessionEnvironment, [TOKEN_KEY]: "private" }
  ]) {
    assert.throws(() => takePowerPointSessionEnvironment(invalid), (error) => {
      assert.doesNotMatch(error.message, /private|secret|z{43}/u);
      return true;
    });
    assert.equal(invalid[URL_KEY], undefined);
    assert.equal(invalid[TOKEN_KEY], undefined);
  }
});

test("loopback broker authenticates leases, exposes safe metrics, and closes once", async () => {
  let closes = 0;
  const broker = await startPowerPointSessionBroker({}, {
    startKeeper: async () => ({ close: async () => { closes += 1; return keeperMetrics; } })
  });
  const wrong = { ...broker.env, [TOKEN_KEY]: "x".repeat(43) };
  await assert.rejects(authorizePowerPointSession(wrong), (error) => {
    assert.doesNotMatch(error.message, /x{43}|127\.0\.0\.1/u);
    return true;
  });
  assert.equal(await authorizePowerPointSession(broker.env), true);
  const first = await broker.close();
  const second = await broker.close();
  assert.deepEqual(first, { requests: 1, rejected: 1, ...keeperMetrics });
  assert.equal(second, first);
  assert.equal(closes, 1);
  assert.doesNotMatch(JSON.stringify(first), /127\.0\.0\.1|[A-Za-z0-9_-]{43}/u);
});

test("keeper refuses existing Office ownership and waits for its process to exit", () => {
  const script = keeperScript();
  assert.match(script, /Get-Process -Name POWERPNT/);
  assert.match(script, /PowerPoint is already running/);
  assert.match(script, /process ownership is ambiguous/);
  assert.match(script, /WaitForExit\(30000\)/);
  assert.match(script, /PowerPoint process did not exit/);
  assert.match(script, /Quit-PowerPointWithRetry \$app/);
  assert.match(script, /0x80010001/);
  assert.match(script, /0x8001010A/);
});

test("keeper retries only transient Quit failures in generated PowerShell", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ct-powerpoint-keeper-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const generated = path.join(directory, "keeper.ps1");
  fs.writeFileSync(generated, keeperScript());
  const result = spawnSync(process.platform === "win32" ? "powershell.exe" : "pwsh", [
    "-NoProfile", "-NonInteractive", "-File", path.join(__dirname, "fixtures", "powerpoint-keeper-quit.ps1"), "-GeneratedScript", generated
  ], { encoding: "utf8", windowsHide: true, timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { passed: true, checks: 6 });
});

test("keeper cleanup diagnostics admit only safe phase and HRESULT fields", () => {
  const error = keeperCleanupError({ phase: "quit", hresult: "0x80010001", private: "secret" });
  assert.deepEqual(safeCleanupDiagnostic(error), { phase: "quit", hresult: "0x80010001" });
  assert.doesNotMatch(JSON.stringify(error.diagnostic), /secret/u);
  assert.equal(safeCleanupDiagnostic(keeperCleanupError({ phase: "PRIVATE", hresult: "secret" })).phase, "unknown");
  assert.equal(safeCleanupDiagnostic(new Error("private")), null);
});

test("one serialized PowerPoint session scopes credentials to supported corpus cases", async () => {
  const cases = [entry("first"), { id: "other", command: [process.execPath, "other.js"] }, entry("second")];
  const inherited = { ...sessionEnvironment, KEEP: "yes" };
  let closes = 0;
  const outcome = await runPowerPointCorpusSession(cases, {
    sharedPowerPoint: true,
    concurrency: 1,
    environment: inherited
  }, {
    startBroker: async () => ({
      env: sessionEnvironment,
      close: async () => { closes += 1; return { requests: 2, rejected: 0, ...keeperMetrics }; }
    }),
    runCorpusCases: async (actual, options) => {
      assert.equal(actual, cases);
      assert.equal(options.environmentForCase(cases[0])[TOKEN_KEY], token);
      assert.deepEqual(options.environmentForCase(cases[1]), { KEEP: "yes" });
      assert.equal(options.environmentForCase(cases[2])[TOKEN_KEY], token);
      return { results: [{ passed: true }], ocrSession: { enabled: false } };
    }
  });
  assert.equal(closes, 1);
  assert.deepEqual(inherited, { ...sessionEnvironment, KEEP: "yes" });
  assert.deepEqual(outcome.officeSession, { enabled: true, eligibleCases: 2, requests: 2, rejected: 0, ...keeperMetrics });
  assert.doesNotMatch(JSON.stringify(outcome), /z{43}|127\.0\.0\.1/u);
});

test("disabled, ineligible and failed sessions preserve behavior and cleanup failures", async () => {
  await assert.rejects(runPowerPointCorpusSession(null), /bounded/);
  await assert.rejects(runPowerPointCorpusSession(Array(513).fill(entry()), { sharedPowerPoint: true, concurrency: 1 }), /bounded/);
  await assert.rejects(runPowerPointCorpusSession([entry(), entry("two")], { sharedPowerPoint: true, concurrency: 2 }), /serialized/);
  for (const cases of [[], [entry()], [{ command: [process.execPath, "other.js"] }]]) {
    const outcome = await runPowerPointCorpusSession(cases, { sharedPowerPoint: true, concurrency: 1, environment: sessionEnvironment }, {
      startBroker: async () => assert.fail("must not start"),
      runCorpusCases: async (_items, options) => {
        assert.equal(options.environment[TOKEN_KEY], undefined);
        return { results: [], ocrSession: { enabled: false } };
      }
    });
    assert.equal(outcome.officeSession.enabled, false);
  }
  const primary = new Error("execution failed");
  const cleanup = new Error("private cleanup failed");
  await assert.rejects(runPowerPointCorpusSession([entry(), entry("two")], { sharedPowerPoint: true, concurrency: 1 }, {
    startBroker: async () => ({ env: sessionEnvironment, close: async () => keeperMetrics }),
    runCorpusCases: async () => { throw primary; }
  }), (error) => error === primary);
  await assert.rejects(runPowerPointCorpusSession([entry(), entry("two")], { sharedPowerPoint: true, concurrency: 1 }, {
    startBroker: async () => ({ env: sessionEnvironment, close: async () => { throw cleanup; } }),
    runCorpusCases: async () => { throw primary; }
  }), (error) => {
    assert.deepEqual(error.errors, [primary, cleanup]);
    assert.doesNotMatch(error.message, /private/u);
    return true;
  });
});
