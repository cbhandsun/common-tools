"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { brokerEnabled, eligibleForBroker, runCorpusCases, takeBrokerEnvironment } = require("../skills/pd-hifi-slideclone/scripts/lib/paddleocr-corpus-session");
const { runCases } = require("../skills/pd-hifi-slideclone/scripts/golden-set-runner");
const { startPaddleOcrBatchBroker } = require("../skills/pd-hifi-slideclone/scripts/lib/paddleocr-batch-broker");
const adapter = require("../skills/pd-hifi-slideclone/scripts/adapters/ocr-paddleocr-local");
const root = path.resolve(__dirname, "..");
const urlKey = "SLIDECLONE_PADDLE_OCR_BROKER_URL";
const tokenKey = "SLIDECLONE_PADDLE_OCR_BROKER_TOKEN";
const env = { [urlKey]: "http://127.0.0.1:12345", [tokenKey]: "z".repeat(43) };
const metrics = { requests: 2, completed: 2, failed: 0, queueWaitMs: 0, serviceMs: 1 };
const entry = (id = "case") => ({ id, timeoutMs: 180000, mode: "command-passes", command: [process.execPath, path.join(root, "skills/pd-hifi-slideclone/scripts/complex-graphic-golden-smoke.js"), "--ocr", "true"] });

test("corpus broker selection rejects unsupported modes and only routes approved OCR scripts", async () => {
  for (const value of [undefined, false, "false"]) assert.equal(brokerEnabled(value), false);
  for (const value of [true, "true"]) assert.equal(brokerEnabled(value), true);
  for (const value of [null, 1, "auto", "", {}, []]) assert.throws(() => brokerEnabled(value), /true or false/);
  assert.equal(eligibleForBroker(entry()), true);
  for (const item of [null, {}, { command: [] }, { command: [1] }, { command: ["other", ...entry().command.slice(1)] }, { command: [process.execPath, "unrelated.js", "--ocr", "true"] }, { command: [...entry().command, "--ocr", "false"] }]) {
    assert.equal(eligibleForBroker(item), false);
  }
  await assert.rejects(runCorpusCases(null), /bounded/);
  await assert.rejects(runCorpusCases(Array(513).fill(entry())), /bounded/);
  await assert.rejects(runCorpusCases([entry()], { sharedOcr: true, concurrency: 2 }), /serialized/);
});

test("corpus credentials are consumed before unrelated tools and malformed endpoints fail closed", () => {
  const environment = { ...env, KEEP: "value" };
  assert.deepEqual(takeBrokerEnvironment(environment), env);
  assert.deepEqual(environment, { KEEP: "value" });
  assert.deepEqual(takeBrokerEnvironment({}), {});
  for (const bad of [
    { [urlKey]: env[urlKey] }, { [tokenKey]: env[tokenKey] }, { [urlKey]: "", [tokenKey]: "" },
    { ...env, [urlKey]: "https://example.com/" }, { ...env, [urlKey]: "http://127.0.0.1:12345/?private=secret" },
    { ...env, [urlKey]: "http://private:secret@127.0.0.1:12345" }, { ...env, [tokenKey]: "private token\n" }
  ]) {
    assert.throws(() => takeBrokerEnvironment(bad), (error) => {
      assert.doesNotMatch(error.message, /private|secret|z{43}/);
      return true;
    });
    assert.equal(bad[urlKey], undefined);
    assert.equal(bad[tokenKey], undefined);
  }
});

test("one scoped broker preserves timeout/results, isolates other cases, and reports only safe metrics", async () => {
  let starts = 0;
  let closes = 0;
  const cases = [entry(), entry("second"), { id: "other", command: [process.execPath, "other.js"] }];
  const results = [{ passed: true }, { passed: true }, { passed: false }];
  const inherited = { ...env, KEEP: "value" };
  const outcome = await runCorpusCases(cases, { sharedOcr: true, concurrency: 1, timeoutMs: 600000, environment: inherited }, {
    startBroker: async () => { starts += 1; return { env, close: async () => { closes += 1; return { ...metrics, token: env[tokenKey] }; } }; },
    runCases: async (actual, options) => {
      assert.equal(actual, cases);
      assert.equal(options.timeoutMs, 600000);
      assert.equal(actual[0].timeoutMs, 180000);
      assert.deepEqual(options.environmentForCase(cases[0]), { ...env, KEEP: "value" });
      assert.deepEqual(options.environmentForCase(cases[1]), { ...env, KEEP: "value" });
      assert.deepEqual(options.environmentForCase(cases[2]), { KEEP: "value" });
      return results;
    }
  });
  assert.equal(starts, 1);
  assert.equal(closes, 1);
  assert.equal(outcome.results, results);
  assert.deepEqual(outcome.ocrSession, { enabled: true, eligibleCases: 2, ...metrics });
  assert.doesNotMatch(JSON.stringify(outcome), /z{43}|127\.0\.0\.1/);
  assert.deepEqual(inherited, { ...env, KEEP: "value" });
});

test("disabled, empty, single-eligible and ineligible corpora start no broker or inherit a stale one", async () => {
  for (const [cases, sharedOcr] of [[[entry()], false], [[entry()], true], [[], true], [[{ command: [process.execPath, "other.js"] }], true]]) {
    const result = await runCorpusCases(cases, { sharedOcr, concurrency: 1, environment: env }, {
      startBroker: async () => assert.fail("must not start"),
      runCases: async (items, options) => { assert.deepEqual(options.environmentForCase(items[0]), {}); return []; }
    });
    assert.equal(result.ocrSession.enabled, false);
  }
});

test("actual full corpus reports OCR eligibility without claiming cross-case reuse for one client", async () => {
  const { resolveCorpusCases } = require("../skills/pd-hifi-slideclone/scripts/lib/real-pptx-corpus");
  const corpus = require("../skills/pd-hifi-slideclone/examples/real-pptx-corpus.manifest.json");
  const golden = require("../skills/pd-hifi-slideclone/examples/golden-set.manifest.json");
  const selected = resolveCorpusCases(corpus, golden, { suites: ["full"], manifestSuites: corpus.suites, requireCoverage: false });
  assert.equal(selected.cases.length, 31);
  assert.deepEqual(selected.cases.filter(eligibleForBroker).map((item) => item.id), ["triangle-topology"]);
  const outcome = await runCorpusCases(selected.cases, { sharedOcr: true, concurrency: 1 }, {
    startBroker: async () => assert.fail("one eligible client cannot reuse across cases"),
    runCases: async (items, options) => {
      assert.equal(items, selected.cases);
      for (const item of items) assert.equal(options.environmentForCase(item)[tokenKey], undefined);
      return [];
    }
  });
  assert.deepEqual(outcome.ocrSession, { enabled: false, eligibleCases: 1 });
});

test("corpus execution/start/cleanup failures are never converted to passing results", async () => {
  const primary = new Error("execution failed");
  let closes = 0;
  const options = { sharedOcr: true, concurrency: 1 };
  const cases = [entry(), entry("second")];
  await assert.rejects(runCorpusCases(cases, options, { startBroker: async () => { throw primary; } }), (error) => error === primary);
  await assert.rejects(runCorpusCases(cases, options, {
    startBroker: async () => ({ env, close: async () => { closes += 1; return metrics; } }),
    runCases: async () => { throw primary; }
  }), (error) => error === primary);
  assert.equal(closes, 1);
  const secondary = new Error("private cleanup error");
  for (const failExecution of [false, true]) {
    await assert.rejects(runCorpusCases(cases, options, {
      startBroker: async () => ({ env, close: async () => { throw secondary; } }),
      runCases: async () => { if (failExecution) throw primary; return []; }
    }), (error) => {
      assert.doesNotMatch(error.message, /private/);
      if (failExecution) assert.deepEqual(error.errors, [primary, secondary]);
      else assert.equal(error.cause, secondary);
      return true;
    });
  }
});

test("invalid broker credentials and metrics fail after closing the session", async () => {
  let closes = 0;
  for (const broker of [
    { env: { [urlKey]: "invalid" }, metrics },
    { env, metrics: { ...metrics, requests: Number.MAX_SAFE_INTEGER + 1 } },
    { env, metrics: { ...metrics, completed: -1 } }
  ]) {
    await assert.rejects(runCorpusCases([entry(), entry("second")], { sharedOcr: true, concurrency: 1 }, {
      startBroker: async () => ({ env: broker.env, close: async () => { closes += 1; return broker.metrics; } }),
      runCases: async () => []
    }), /invalid/);
  }
  assert.equal(closes, 3);
});

test("separate corpus clients reuse one worker instead of initializing once per case", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-ocr-session-"));
  const workerScript = path.join(directory, "worker.js");
  const startsFile = path.join(directory, "starts.txt");
  const client = path.join(__dirname, "fixtures/paddleocr-corpus-client.js");
  fs.writeFileSync(workerScript, `require('node:fs').appendFileSync(${JSON.stringify(startsFile)}, 'start\\n');\n` + fs.readFileSync(path.join(__dirname, "fixtures/fake-paddleocr-worker.js"), "utf8"));
  const context = { skillRoot: path.join(root, "skills/pd-hifi-slideclone"), config: { paddleOcr: { pythonBin: process.execPath, workerScript, cache: false, cacheDir: path.join(directory, "cache"), initTimeoutMs: 5000, timeoutMs: 5000 } } };
  const cases = [entry("first"), entry("second")];
  try {
    for (const sharedOcr of [false, true]) {
      const result = await runCorpusCases(cases, { sharedOcr, concurrency: 1, environment: { ...process.env, CORPUS_TEST_CONTEXT: JSON.stringify(context) } }, {
        startBroker: () => startPaddleOcrBatchBroker({ adapter, context: { ...context, disablePaddleOcrBroker: true } }),
        runCases: (items, options) => runCases(items.map((item) => ({ ...item, timeoutMs: 10000, command: [process.execPath, client] })), {
          ...options,
          environmentForCase: (item) => options.environmentForCase(cases.find((original) => original.id === item.id))
        })
      });
      assert.deepEqual(result.results.map((item) => item.ok), [true, true]);
      if (sharedOcr) assert.equal(result.ocrSession.completed, 2);
      assert.equal(fs.readFileSync(startsFile, "utf8").split("start").length - 1, sharedOcr ? 3 : 2);
    }
  } finally {
    await adapter.closeActiveEngineAndWait();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
