"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const paddleOcr = require("../skills/pd-hifi-slideclone/scripts/adapters/ocr-paddleocr-local");
const { startPaddleOcrBatchBroker } = require("../skills/pd-hifi-slideclone/scripts/lib/paddleocr-batch-broker");
const { consumePaddleOcrBrokerEnvironment } = require("../skills/pd-hifi-slideclone/scripts/lib/quality-gate-policy");

const workspaceRoot = path.resolve(__dirname, "..");
const skillRoot = path.join(workspaceRoot, "skills", "pd-hifi-slideclone");
const sourceImage = path.join(skillRoot, "examples", "ocr-text-smoke.source.png");
const fakeWorker = path.join(__dirname, "fixtures", "fake-paddleocr-worker.js");

function context(tempDir, overrides = {}) {
  return {
    skillRoot,
    config: {
      paddleOcr: {
        pythonBin: process.execPath,
        workerScript: fakeWorker,
        lang: "ch",
        cacheDir: path.join(tempDir, "cache"),
        initTimeoutMs: 5000,
        timeoutMs: 5000,
        idleTimeoutMs: 5000,
        ...overrides
      }
    }
  };
}

function input() {
  return {
    sourceImage,
    pageIndex: 0,
    page: { widthPx: 200, heightPx: 100 },
    slideSize: { widthPt: 100, heightPt: 50 }
  };
}

test.afterEach(() => paddleOcr.closeActiveEngine());

test("PaddleOCR protocol failure recovery cannot orphan the replacement worker", () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, "fixtures/paddleocr-worker-lifecycle.js")], {
    encoding: "utf8", windowsHide: true, timeout: 15000, maxBuffer: 64 * 1024
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "worker-lifecycle-passed");
});

test("PaddleOCR cache identity includes helper contents even when size and timestamps match", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paddleocr-identity-"));
  try {
    const workerScript = path.join(tempDir, "worker.js");
    const helper = path.join(tempDir, "paddleocr_protocol.py");
    fs.copyFileSync(fakeWorker, workerScript);
    const resolve = () => paddleOcr._private.resolveSettings(context(tempDir, { workerScript })).identity;
    const absent = resolve();
    fs.writeFileSync(helper, "# revision A\n");
    const timestamp = fs.statSync(helper).mtime;
    const first = resolve();
    assert.notEqual(first, absent);
    assert.equal(resolve(), first);
    fs.writeFileSync(helper, "# revision B\n");
    fs.utimesSync(helper, timestamp, timestamp);
    assert.notEqual(resolve(), first);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("official PaddleOCR adapter returns sorted editable boxes, polygons, and pinned metadata", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paddleocr-adapter-"));
  try {
    const result = await paddleOcr(input(), context(tempDir));
    assert.equal(result.ok, true);
    assert.equal(result.provider, "paddleocr-local-v1");
    assert.deepEqual(result.data.lines.map((line) => line.text), ["左侧", "右侧"]);
    assert.deepEqual(result.data.lines[0].box, { x: 5, y: 5, w: 10, h: 5 });
    assert.deepEqual(result.data.lines[0].polygon, [[5, 5], [15, 5], [15, 10], [5, 10]]);
    assert.deepEqual(result.data.model, {
      ocrVersion: "PP-OCRv6",
      lang: "ch",
      engine: process.platform === "win32" ? "paddle_dynamic" : null,
      textDetectionModel: "PP-OCRv6_small_det",
      textRecognitionModel: "PP-OCRv6_small_rec",
      paddleocrVersion: "3.7.0-test",
      paddlepaddleVersion: "3.3.1-test"
    });
    assert.equal(result.performance.broker, false);
    assert.equal(Number.isSafeInteger(result.performance.totalMs), true);
    paddleOcr.closeActiveEngine();
    const cached = await paddleOcr(input(), context(tempDir));
    assert.equal(cached.cached, true);
    assert.equal(cached.performance.inferenceMs, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("official PaddleOCR adapter accepts an empty result and invalidates cache by model identity", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paddleocr-adapter-"));
  try {
    const empty = await paddleOcr(input(), context(tempDir, { lang: "empty" }));
    assert.deepEqual(empty.data.lines, []);
    paddleOcr.closeActiveEngine();
    const changed = await paddleOcr(input(), context(tempDir, { lang: "ch" }));
    assert.equal(changed.cached, undefined);
    assert.equal(changed.data.lines.length, 2);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("official PaddleOCR adapter micro-batches inputs while preserving order and per-image cache", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paddleocr-batch-"));
  try {
    const inputs = [input(), { ...input(), pageIndex: 1 }];
    const first = await paddleOcr.runBatch(inputs, context(tempDir));
    assert.equal(first.length, 2);
    assert.equal(first[0].data.lines[0].id, "p0-l0");
    assert.equal(first[1].data.lines[0].id, "p1-l0");
    const second = await paddleOcr.runBatch(inputs, context(tempDir));
    assert.deepEqual(second.map((item) => item.cached), [true, true]);
    await assert.rejects(() => paddleOcr.runBatch([], context(tempDir)), /batch size/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("official PaddleOCR adapter rejects malformed output and exposes no worker detail", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paddleocr-adapter-"));
  try {
    await assert.rejects(() => paddleOcr(input(), context(tempDir, { lang: "protocol-noise", cache: false })), {
      message: "PaddleOCR worker returned invalid output"
    });
    await assert.rejects(() => paddleOcr(input(), context(tempDir, { lang: "malformed", cache: false })), /polygon|confidence/);
    paddleOcr.closeActiveEngine();
    await assert.rejects(() => paddleOcr(input(), context(tempDir, { lang: "fail", cache: false })), (error) => {
      assert.match(error.message, /inference failed/);
      assert.doesNotMatch(error.message, /secret OCR text/);
      return true;
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("official PaddleOCR adapter validates config, input, timeout, cancellation, and environment boundaries", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paddleocr-adapter-"));
  try {
    assert.throws(() => paddleOcr._private.resolveSettings(context(tempDir, { lang: "../bad" })), /language is invalid/);
    assert.throws(() => paddleOcr._private.resolveSettings(context(tempDir, { engine: "shell" })), /engine is invalid/);
    await assert.rejects(() => paddleOcr({ ...input(), sourceImage: path.join(tempDir, "missing.png") }, context(tempDir)), /unavailable/);
    await assert.rejects(() => paddleOcr(input(), context(tempDir, { lang: "hang", cache: false, timeoutMs: 1000 })), /timed out/);
    paddleOcr.closeActiveEngine();
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() => paddleOcr(input(), { ...context(tempDir, { cache: false }), signal: controller.signal }), /cancelled/);
    process.env.TEST_PADDLEOCR_SECRET = "must-not-leak";
    const settings = paddleOcr._private.resolveSettings(context(tempDir));
    assert.equal(paddleOcr._private.safeWorkerEnvironment(settings).TEST_PADDLEOCR_SECRET, undefined);
    delete process.env.TEST_PADDLEOCR_SECRET;
  } finally {
    paddleOcr.closeActiveEngine();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("PaddleOCR adapter consumes only an available absolute cached runtime path", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paddleocr-runtime-env-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const cachedPython = path.join(tempDir, "python.exe");
  fs.writeFileSync(cachedPython, "runtime");
  const previous = process.env.SLIDECLONE_PADDLEOCR_PYTHON;
  try {
    process.env.SLIDECLONE_PADDLEOCR_PYTHON = cachedPython;
    assert.equal(paddleOcr._private.resolveSettings(context(tempDir, { pythonBin: undefined })).pythonBin, cachedPython);
    process.env.SLIDECLONE_PADDLEOCR_PYTHON = "relative-python";
    assert.throws(
      () => paddleOcr._private.resolveSettings(context(tempDir, { pythonBin: undefined })),
      /absolute executable/u
    );
    process.env.SLIDECLONE_PADDLEOCR_PYTHON = path.join(tempDir, "missing.exe");
    assert.throws(
      () => paddleOcr._private.resolveSettings(context(tempDir, { pythonBin: undefined })),
      /unavailable/u
    );
  } finally {
    if (previous === undefined) delete process.env.SLIDECLONE_PADDLEOCR_PYTHON;
    else process.env.SLIDECLONE_PADDLEOCR_PYTHON = previous;
  }
});

test("PaddleOCR batch broker reuses one local engine and preserves the adapter result contract", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "paddleocr-broker-"));
  let broker;
  try {
    const localContext = context(tempDir, { cache: false, idleTimeoutMs: 60_000 });
    broker = await startPaddleOcrBatchBroker({
      adapter: paddleOcr,
      context: { ...localContext, disablePaddleOcrBroker: true }
    });
    const brokerContext = context(tempDir, {
      cache: false,
      brokerUrl: broker.url,
      brokerToken: broker.token
    });
    const first = await paddleOcr(input(), brokerContext);
    const second = await paddleOcr(input(), brokerContext);
    const batched = await paddleOcr.runBatch([input(), { ...input(), pageIndex: 1 }], brokerContext);
    assert.equal(batched[1].data.lines[0].id, "p1-l0");
    assert.deepEqual(second.data, first.data);
    assert.equal(first.provider, "paddleocr-local-v1");
    assert.equal(first.performance.broker, true);
    const metrics = await broker.close();
    broker = null;
    assert.deepEqual({ requests: metrics.requests, completed: metrics.completed, failed: metrics.failed }, {
      requests: 3,
      completed: 3,
      failed: 0
    });
  } finally {
    if (broker) await broker.close();
    paddleOcr.closeActiveEngine();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("PaddleOCR broker rejects non-loopback and incomplete broker settings", () => {
  assert.throws(
    () => paddleOcr._private.resolveBroker({ config: { paddleOcr: { brokerUrl: "http://example.com", brokerToken: "a".repeat(32) } } }),
    /loopback/
  );
  assert.throws(
    () => paddleOcr._private.resolveBroker({ config: { paddleOcr: { brokerUrl: "http://127.0.0.1:1234" } } }),
    /configuration is invalid/
  );
});

test("quality gate consumes the ephemeral broker secret before spawning downstream tools", () => {
  const environment = {
    SLIDECLONE_PADDLE_OCR_BROKER_URL: "http://127.0.0.1:1234",
    SLIDECLONE_PADDLE_OCR_BROKER_TOKEN: "a".repeat(43),
    KEEP_ME: "safe"
  };
  assert.deepEqual(consumePaddleOcrBrokerEnvironment(environment), {
    brokerUrl: "http://127.0.0.1:1234",
    brokerToken: "a".repeat(43)
  });
  assert.equal(environment.SLIDECLONE_PADDLE_OCR_BROKER_URL, undefined);
  assert.equal(environment.SLIDECLONE_PADDLE_OCR_BROKER_TOKEN, undefined);
  assert.equal(environment.KEEP_ME, "safe");
});
