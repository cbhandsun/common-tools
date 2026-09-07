"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createOtlpTraceExporter, createTracedWorkerHandler, loadOtlpTraceConfig, methodLabel, parseTraceParent, tracePayload } = require("../packages/remote-mcp-server/telemetry");

const traceParent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

test("OTLP trace exporter is opt-in and rejects insecure or credential-bearing endpoints", () => {
  assert.equal(loadOtlpTraceConfig({ NODE_ENV: "production" }), undefined);
  assert.deepEqual(loadOtlpTraceConfig({ NODE_ENV: "development", COMMON_TOOLS_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://127.0.0.1:4318/v1/traces" }), { endpoint: "http://127.0.0.1:4318/v1/traces", serviceName: "common-tools-remote-mcp", timeoutMs: 2000 });
  assert.throws(() => loadOtlpTraceConfig({ NODE_ENV: "production", COMMON_TOOLS_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://collector.example.test/v1/traces" }), /OTEL_EXPORTER/);
  assert.throws(() => loadOtlpTraceConfig({ NODE_ENV: "development", COMMON_TOOLS_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://user:password@collector.example.test/v1/traces" }), /OTEL_EXPORTER/);
  assert.throws(() => loadOtlpTraceConfig({ NODE_ENV: "production", COMMON_TOOLS_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "https://collector.example.test/v1/traces", COMMON_TOOLS_OTEL_SERVICE_NAME: "secret name" }), /OTEL_SERVICE_NAME/);
});

test("OTLP payload keeps only fixed method, status, and W3C parent fields", async () => {
  const randomBytes = (length) => Buffer.alloc(length, length === 16 ? 1 : 2);
  assert.deepEqual(parseTraceParent(traceParent), { traceId: "4bf92f3577b34da6a3ce929d0e0e4736", parentSpanId: "00f067aa0ba902b7", traceFlags: "01" });
  assert.equal(methodLabel("attacker-controlled-value"), "other");
  const payload = tracePayload({ serviceName: "common-tools-remote-mcp", method: "tools/call", statusCode: 200, traceParent, startedAt: 1000, endedAt: 1001, randomBytes });
  const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
  assert.equal(span.traceId, "4bf92f3577b34da6a3ce929d0e0e4736");
  assert.equal(span.parentSpanId, "00f067aa0ba902b7");
  assert.equal(span.spanId, "0202020202020202");
  assert.equal(span.attributes.find((attribute) => attribute.key === "mcp.method").value.stringValue, "tools/call");
  assert.doesNotMatch(JSON.stringify(payload), /user|token|object|baggage/i);
  const calls = [];
  const exporter = createOtlpTraceExporter({ endpoint: "https://collector.example.test/v1/traces", serviceName: "common-tools-remote-mcp", timeoutMs: 1000 }, { clock: () => 2000, randomBytes, fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true }; } });
  await exporter.exportSpan({ method: "attacker-controlled-value", statusCode: 503, traceParent, startedAt: 2000, endedAt: 2001 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://collector.example.test/v1/traces");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.match(calls[0].options.body, /"mcp.method"/);
  assert.match(calls[0].options.body, /"other"/);
});

test("OTLP exporter swallows collector failure instead of extending an MCP request", async () => {
  const exporter = createOtlpTraceExporter({ endpoint: "https://collector.example.test/v1/traces", serviceName: "common-tools-remote-mcp", timeoutMs: 1000 }, { fetchImpl: async () => { throw new Error("collector unavailable"); } });
  await exporter.exportSpan({ method: "tools/list", statusCode: 200, startedAt: 1, endedAt: 2 });
});

test("Worker trace wrapper retains the Job parent and cannot change handler outcomes", async () => {
  const exported = [];
  const exporter = { exportSpan(value) { exported.push(value); return Promise.resolve(); } };
  const successful = createTracedWorkerHandler(async () => ({ artifacts: [] }), { exporter, capability: "project-audit", clock: (() => { let value = 100; return () => value++; })() });
  assert.deepEqual(await successful({ job: { traceParent } }), { artifacts: [] });
  assert.deepEqual({ ...exported[0], identity: undefined }, { spanName: "common-tools.worker", method: "worker/project-audit", statusCode: 200, traceParent, startedAt: 100, endedAt: 101, identity: undefined });
  const failing = createTracedWorkerHandler(async () => { throw new Error("handler failure"); }, { exporter, capability: "image-to-editable", clock: () => 200 });
  await assert.rejects(() => failing({ job: { traceParent } }), /handler failure/);
  assert.deepEqual({ ...exported[1], identity: undefined }, { spanName: "common-tools.worker", method: "worker/image-to-editable", statusCode: 500, traceParent, startedAt: 200, endedAt: 200, identity: undefined });
  const original = async () => ({ untouched: true });
  assert.equal(createTracedWorkerHandler(original, { capability: "project-audit" }), original);
});

test("concurrent Worker stages export bounded child spans with isolated identities and safe fields", async () => {
  const { runWorkerStage } = require("../packages/team-runtime/worker-failure");
  const spans = [];
  const exporter = createOtlpTraceExporter({ endpoint: "https://collector.example.test/v1/traces", serviceName: "worker", timeoutMs: 1000 }, {
    fetchImpl: async (_url, options) => { spans.push(JSON.parse(options.body).resourceSpans[0].scopeSpans[0].spans[0]); }
  });
  const handler = createTracedWorkerHandler(async ({ fail }) => {
    return runWorkerStage(fail ? "IMAGE_BUILD_FAILED" : "IMAGE_OCR_FAILED", async () => {
      await new Promise((resolve) => setImmediate(resolve));
      if (fail) throw new Error("private-provider-token");
      return "private-result-content";
    });
  }, { exporter, capability: "image-to-editable" });
  const results = await Promise.allSettled([handler({ job: { traceParent } }), handler({ job: {}, fail: true })]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  const workers = spans.filter((span) => span.name === "common-tools.worker");
  const stages = spans.filter((span) => span.name === "common-tools.worker.stage");
  assert.equal(workers.length, 2);
  assert.equal(stages.length, 2);
  assert.notEqual(workers[0].traceId, workers[1].traceId);
  for (const stage of stages) {
    const worker = workers.find((item) => item.traceId === stage.traceId);
    assert.equal(stage.parentSpanId, worker.spanId);
    assert.equal(stage.status.code, worker.status.code);
    assert.ok(BigInt(stage.endTimeUnixNano) >= BigInt(stage.startTimeUnixNano));
  }
  assert.doesNotMatch(JSON.stringify(spans), /private-|provider-token|result-content/);
  const original = new Error("original");
  for (const exportSpan of [() => { throw new Error("collector"); }, async () => { throw new Error("collector"); }]) {
    const failed = createTracedWorkerHandler(() => runWorkerStage("IMAGE_OCR_FAILED", () => { throw original; }), { exporter: { exportSpan }, capability: "image-to-editable" });
    await assert.rejects(failed({}), (error) => error.cause === original);
  }
});

test("stage trace labels reject content and per-job span count is bounded", async () => {
  const { runWorkerStage } = require("../packages/team-runtime/worker-failure");
  const spans = [];
  const handler = createTracedWorkerHandler(async () => {
    for (let i = 0; i < 300; i++) await runWorkerStage("IMAGE_OCR_FAILED", () => i);
  }, { exporter: { exportSpan(value) { spans.push(value); } }, capability: "image-to-editable" });
  await handler({});
  assert.equal(spans.filter((span) => span.stage).length, 256);
  assert.equal(spans.length, 257);
  const payload = tracePayload({ serviceName: "worker", spanName: "common-tools.worker.stage", stage: "private-token", statusCode: 200, startedAt: 0, endedAt: 1 });
  assert.doesNotMatch(JSON.stringify(payload), /private-token/);
  assert.equal(payload.resourceSpans[0].scopeSpans[0].spans[0].attributes.at(-1).value.stringValue, "other");
  assert.throws(() => tracePayload({ serviceName: "worker", statusCode: 200, startedAt: 0, endedAt: 1, identity: { traceId: "a".repeat(32), spanId: "0".repeat(16) } }), /identity is invalid/);
  for (const identity of [null, [], {}, "private-token", { traceId: "", spanId: "a".repeat(16) }, { traceId: "a".repeat(10000), spanId: "a".repeat(16) }, { traceId: "a".repeat(32), spanId: { toString() { throw new Error("private-token"); } } }]) {
    assert.throws(() => tracePayload({ serviceName: "worker", statusCode: 200, startedAt: 0, endedAt: 1, identity }), { message: "trace identity is invalid" });
  }
});
