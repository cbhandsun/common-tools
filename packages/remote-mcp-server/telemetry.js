"use strict";

const crypto = require("node:crypto");
const { TEAM_CAPABILITY_DEFINITIONS } = require("../capability-runtime");

const MAX_ENDPOINT_LENGTH = 2048;
const SERVICE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const METHOD_LABELS = new Set(["initialize", "server/discover", "tools/list", "tools/call", "resources/list", "resources/read", "tasks/get", "tasks/update", "tasks/cancel", ...Object.keys(TEAM_CAPABILITY_DEFINITIONS).map((capability) => `worker/${capability}`)]);
const SPAN_NAMES = new Set(["common-tools.mcp", "common-tools.worker"]);

function loopbackHost(hostname) { return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"; }
function parseEndpoint(value, production) {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_ENDPOINT_LENGTH) throw new Error("COMMON_TOOLS_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is invalid");
  let endpoint;
  try { endpoint = new URL(value); } catch { throw new Error("COMMON_TOOLS_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is invalid"); }
  if (endpoint.username || endpoint.password || endpoint.hash || (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && !production && loopbackHost(endpoint.hostname)))) throw new Error("COMMON_TOOLS_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is invalid");
  return endpoint.href;
}
function loadOtlpTraceConfig(environment = process.env) {
  if (!environment || typeof environment !== "object") throw new TypeError("telemetry environment is invalid");
  const rawEndpoint = environment.COMMON_TOOLS_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if (rawEndpoint === undefined || (typeof rawEndpoint === "string" && !rawEndpoint.trim())) return undefined;
  const serviceName = environment.COMMON_TOOLS_OTEL_SERVICE_NAME === undefined ? "common-tools-remote-mcp" : environment.COMMON_TOOLS_OTEL_SERVICE_NAME;
  if (typeof serviceName !== "string" || !SERVICE_NAME_PATTERN.test(serviceName)) throw new Error("COMMON_TOOLS_OTEL_SERVICE_NAME is invalid");
  const timeoutMs = Number(environment.COMMON_TOOLS_OTEL_EXPORTER_TIMEOUT_MS === undefined ? 2000 : environment.COMMON_TOOLS_OTEL_EXPORTER_TIMEOUT_MS);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000) throw new Error("COMMON_TOOLS_OTEL_EXPORTER_TIMEOUT_MS is invalid");
  return Object.freeze({ endpoint: parseEndpoint(rawEndpoint, environment.NODE_ENV === "production"), serviceName, timeoutMs });
}
function parseTraceParent(value) {
  const match = typeof value === "string" && /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(value);
  if (!match || /^0{32}$/.test(match[1]) || /^0{16}$/.test(match[2])) return undefined;
  return Object.freeze({ traceId: match[1], parentSpanId: match[2], traceFlags: match[3] });
}
function spanId(randomBytes) {
  for (let attempts = 0; attempts < 3; attempts += 1) {
    const value = randomBytes(8).toString("hex");
    if (!/^0{16}$/.test(value)) return value;
  }
  throw new Error("trace span ID generation failed");
}
function methodLabel(method) { return METHOD_LABELS.has(method) ? method : "other"; }
function unixNano(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new TypeError("trace time is invalid");
  return String(BigInt(Math.floor(milliseconds)) * 1000000n);
}
function tracePayload({ serviceName, spanName = "common-tools.mcp", method, statusCode, traceParent, startedAt, endedAt, randomBytes = crypto.randomBytes }) {
  if (typeof serviceName !== "string" || !SERVICE_NAME_PATTERN.test(serviceName) || !SPAN_NAMES.has(spanName) || !Number.isSafeInteger(statusCode) || statusCode < 100 || statusCode > 599 || typeof randomBytes !== "function") throw new TypeError("trace payload is invalid");
  const parent = parseTraceParent(traceParent);
  const traceId = parent ? parent.traceId : randomBytes(16).toString("hex");
  if (!/^[0-9a-f]{32}$/.test(traceId) || /^0{32}$/.test(traceId)) throw new Error("trace ID generation failed");
  const span = {
    traceId,
    spanId: spanId(randomBytes),
    name: spanName,
    kind: 1,
    startTimeUnixNano: unixNano(startedAt),
    endTimeUnixNano: unixNano(endedAt),
    attributes: [
      { key: "rpc.system", value: { stringValue: "mcp" } },
      { key: "mcp.method", value: { stringValue: methodLabel(method) } },
      { key: "http.response.status_code", value: { intValue: String(statusCode) } }
    ],
    status: { code: statusCode >= 500 ? 2 : 1 }
  };
  if (parent) { span.parentSpanId = parent.parentSpanId; span.flags = Number.parseInt(parent.traceFlags, 16); }
  return Object.freeze({ resourceSpans: [{ resource: { attributes: [{ key: "service.name", value: { stringValue: serviceName } }] }, scopeSpans: [{ scope: { name: "common-tools.remote-mcp" }, spans: [span] }] }] });
}
function createOtlpTraceExporter(config, { fetchImpl = globalThis.fetch, clock = () => Date.now(), randomBytes = crypto.randomBytes } = {}) {
  if (!config || typeof config.endpoint !== "string" || typeof config.serviceName !== "string" || !Number.isSafeInteger(config.timeoutMs) || typeof fetchImpl !== "function" || typeof clock !== "function" || typeof randomBytes !== "function") throw new TypeError("OTLP exporter configuration is invalid");
  return Object.freeze({
    exportSpan({ spanName, method, statusCode, traceParent, startedAt = clock(), endedAt = clock() }) {
      const payload = tracePayload({ serviceName: config.serviceName, spanName, method, statusCode, traceParent, startedAt, endedAt, randomBytes });
      const signal = AbortSignal.timeout(config.timeoutMs);
      return Promise.resolve(fetchImpl(config.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal })).then(() => undefined).catch(() => undefined);
    }
  });
}
function createTracedWorkerHandler(handler, { exporter, capability, clock = () => Date.now() } = {}) {
  if (typeof handler !== "function" || !Object.prototype.hasOwnProperty.call(TEAM_CAPABILITY_DEFINITIONS, capability) || (exporter !== undefined && (!exporter || typeof exporter.exportSpan !== "function")) || typeof clock !== "function") throw new TypeError("worker trace handler configuration is invalid");
  if (!exporter) return handler;
  return async function tracedWorkerHandler(context) {
    const startedAt = clock();
    const traceParent = context?.job?.traceParent;
    try {
      const output = await handler(context);
      try { void Promise.resolve(exporter.exportSpan({ spanName: "common-tools.worker", method: `worker/${capability}`, statusCode: 200, traceParent, startedAt, endedAt: clock() })).catch(() => {}); } catch { /* telemetry must not affect Worker execution */ }
      return output;
    } catch (error) {
      try { void Promise.resolve(exporter.exportSpan({ spanName: "common-tools.worker", method: `worker/${capability}`, statusCode: 500, traceParent, startedAt, endedAt: clock() })).catch(() => {}); } catch { /* telemetry must not affect Worker execution */ }
      throw error;
    }
  };
}

module.exports = { createOtlpTraceExporter, createTracedWorkerHandler, loadOtlpTraceConfig, methodLabel, parseTraceParent, tracePayload };
