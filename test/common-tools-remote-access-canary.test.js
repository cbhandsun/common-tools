"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { MAX_RESPONSE_BYTES, boundedJson, canaryOptions, httpsOrigin, runRemoteAccessCanary } = require("../packages/cli/remote-access-canary");

function response(status, body) {
  const text = JSON.stringify(body);
  return new Response(text, { status, headers: { "content-length": String(Buffer.byteLength(text)) } });
}

test("remote canary stops streaming at the byte limit without trusting content length", async () => {
  for (const declared of [null, "2"]) {
    let reads = 0; let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) {
        reads += 1;
        controller.enqueue(Buffer.alloc(reads === 1 ? MAX_RESPONSE_BYTES : 1, 32));
      },
      cancel() { cancelled = true; }
    }, { highWaterMark: 0 });
    const value = new Response(stream, { headers: declared === null ? {} : { "content-length": declared } });
    value.text = async () => { throw new Error("unbounded response.text must not run"); };
    await assert.rejects(() => boundedJson(value), /response is too large/);
    assert.equal(reads, 2);
    assert.equal(cancelled, true);
    assert.equal(stream.locked, false);
  }
});

test("remote canary accepts exact byte limits and split UTF-8, rejecting invalid or empty bodies", async () => {
  const exact = "x".repeat(MAX_RESPONSE_BYTES - 2);
  assert.equal(await boundedJson(new Response(JSON.stringify(exact))), exact);
  for (const value of [{ text: "中文" }, exact]) {
    const bytes = Buffer.from(JSON.stringify(value));
    let offset = 0;
    const stream = new ReadableStream({ pull(controller) {
      if (offset === bytes.length) controller.close();
      else controller.enqueue(bytes.subarray(offset, ++offset));
    } }, { highWaterMark: 0 });
    assert.deepEqual(await boundedJson(new Response(stream)), value);
    assert.equal(stream.locked, false);
  }
  for (const body of ["", "not-json", Buffer.from([34, 255, 34])]) {
    await assert.rejects(() => boundedJson(new Response(body)), /response is invalid/);
  }
  await assert.rejects(() => boundedJson(new Response(JSON.stringify("中".repeat(MAX_RESPONSE_BYTES / 2)))), /response is too large/);
});

test("remote canary rejects declared oversized bodies before reading and preserves failure when cancellation fails", async () => {
  let reads = 0; let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { reads += 1; controller.enqueue(Buffer.from("{}")); },
    cancel() { cancelled = true; return Promise.reject(new Error("private-cancel-content")); }
  }, { highWaterMark: 0 });
  await assert.rejects(() => boundedJson(new Response(stream, { headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) } })), /response is too large/);
  assert.equal(reads, 0);
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});

test("remote canary response stream failures emit fixed diagnostics without private content", async () => {
  const fetchImpl = async () => new Response(new ReadableStream({
    pull(controller) { controller.error(new Error("private-token-and-response-content")); }
  }, { highWaterMark: 0 }));
  await assert.rejects(() => runRemoteAccessCanary(options, fetchImpl), /^Error: remote canary request failed$/);
});

test("remote canary bounds empty chunks and rejects malformed stream or length metadata", async () => {
  let reads = 0; let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) { reads += 1; controller.enqueue(new Uint8Array()); },
    cancel() { cancelled = true; }
  }, { highWaterMark: 0 });
  await assert.rejects(() => boundedJson(new Response(stream)), /response is invalid/);
  assert.equal(reads, MAX_RESPONSE_BYTES + 1);
  assert.equal(cancelled, true);
  for (const declared of ["-1", "NaN", "1e2", "1.5", "9".repeat(21)]) {
    await assert.rejects(() => boundedJson(new Response("{}", { headers: { "content-length": declared } })), /response is invalid/);
  }
  await assert.rejects(() => boundedJson(new Response(new ReadableStream({
    start(controller) { controller.enqueue("private-non-byte-content"); controller.close(); }
  }))), /^Error: remote canary response is invalid$/);
  for (const value of [null, {}, new Response(null)]) await assert.rejects(() => boundedJson(value), /response is invalid/);
});

test("remote canary failed responses do not wait for stalled transport cancellation", { timeout: 1000 }, async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() { cancelled = true; return new Promise(() => {}); }
  }, { highWaterMark: 0 });
  await assert.rejects(() => boundedJson(new Response(stream, { headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) } })), /response is too large/);
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});

test("remote canary request timeout stays active while consuming a stalled body", { timeout: 5000 }, async () => {
  let signal;
  const fetchImpl = async (_url, request) => {
    signal = request.signal;
    return new Response(new ReadableStream({
      start(controller) {
        signal.addEventListener("abort", () => controller.error(new Error("private-abort-details")), { once: true });
      }
    }, { highWaterMark: 0 }));
  };
  await assert.rejects(() => runRemoteAccessCanary(options, fetchImpl), /^Error: remote canary request failed$/);
  assert.equal(signal.aborted, true);
});

const tokens = Object.freeze({ valid: "valid-token-value", expired: "expired-token-value", wrongIssuer: "wrong-issuer-token", wrongAudience: "wrong-audience-token", missingScope: "missing-scope-token" });
const ownedInputObjectKey = `owners/${"a".repeat(64)}/inputs/canary.png`;
const options = Object.freeze({ origin: "https://plugins.example.test", capability: "image-to-editable", disabledCapability: "ppt-create", projectId: "canary-project", inputObjectKey: ownedInputObjectKey, tokens, timeoutMs: 1000 });

test("remote access canary covers all authorization boundaries and emits only redacted evidence", async () => {
  const seen = [];
  const fetchImpl = async (url, request) => {
    seen.push({ url, authorization: request.headers.Authorization, body: JSON.parse(request.body) });
    const token = request.headers.Authorization?.replace(/^Bearer /, "");
    if (!token || ["malformed-fixed-token", tokens.expired, tokens.wrongIssuer, tokens.wrongAudience].includes(token)) return response(401, { error: "unauthorized" });
    if (token === tokens.valid && seen.at(-1).body.method === "initialize") return response(200, { jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "common-tools" } } });
    return response(200, { jsonrpc: "2.0", id: 2, result: { isError: true, content: [{ type: "text", text: "capability is not authorized for this principal" }] } });
  };
  const report = await runRemoteAccessCanary(options, fetchImpl);
  assert.equal(report.passed, true);
  assert.deepEqual(report.cases.map((entry) => entry.name), ["anonymous", "malformed", "expired", "wrongIssuer", "wrongAudience", "valid", "missingScope", "disabledCapability"]);
  const serialized = JSON.stringify(report);
  for (const token of Object.values(tokens)) assert.equal(serialized.includes(token), false);
  assert.equal(serialized.includes(ownedInputObjectKey), false);
  assert.equal(seen.every((entry) => entry.url === "https://plugins.example.test/mcp"), true);
  assert.equal(seen.slice(-2).every((entry) => entry.body.params.arguments.projectId === "canary-project" && entry.body.params.arguments.inputObjectKey === ownedInputObjectKey), true);
});

test("remote access canary fails closed on status drift, unsafe origins, invalid tokens, and oversized responses", async () => {
  const report = await runRemoteAccessCanary(options, async () => response(200, { result: {} }));
  assert.equal(report.passed, false);
  assert.throws(() => httpsOrigin("http://plugins.example.test"), /HTTPS origin/);
  assert.throws(() => canaryOptions({ COMMON_TOOLS_CANARY_URL: "https://plugins.example.test", COMMON_TOOLS_CANARY_CAPABILITY: "image-to-editable", COMMON_TOOLS_CANARY_DISABLED_CAPABILITY: "ppt-create" }), /token/);
  const oversized = new Response("{}", { status: 401, headers: { "content-length": String(MAX_RESPONSE_BYTES + 1) } });
  await assert.rejects(() => runRemoteAccessCanary(options, async () => oversized), /request failed/);
});

test("remote access canary rejects generic, validation, and project authorization errors as capability evidence", async () => {
  for (const message of ["team tool failed", "tool argument projectId is required", "project access is not authorized for this principal"]) {
    const fetchImpl = async (_url, request) => {
      const body = JSON.parse(request.body);
      if (body.method === "initialize") return response(200, { jsonrpc: "2.0", id: body.id, result: { serverInfo: { name: "common-tools" } } });
      return response(200, { jsonrpc: "2.0", id: body.id, result: { isError: true, content: [{ type: "text", text: message }] } });
    };
    const report = await runRemoteAccessCanary(options, fetchImpl);
    assert.equal(report.passed, false);
    assert.equal(report.cases.find((entry) => entry.name === "missingScope").passed, false);
    assert.equal(report.cases.find((entry) => entry.name === "disabledCapability").passed, false);
  }
  await assert.rejects(() => runRemoteAccessCanary({ ...options, projectId: "INVALID" }, async () => response(401, {})), /project ID/);
  await assert.rejects(() => runRemoteAccessCanary({ ...options, inputObjectKey: "canary/not-owned" }, async () => response(401, {})), /input object key/);
});

test("committed public-surface evidence is aggregate-only and records the production health blocker", () => {
  const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "evidence", "remote-public-surface-2026-08-30.json"), "utf8"));
  assert.equal(evidence.origin, "https://plugins.iepose.cn");
  assert.equal(evidence.checks.health.status, 200);
  assert.equal(evidence.checks.health.minimalProductionResponse, false);
  assert.equal(evidence.checks.readiness.ready, true);
  assert.equal(evidence.checks.anonymousMcp.rejected, true);
  assert.deepEqual(evidence.redaction, { containsToken: false, containsCookie: false, containsHeader: false, containsUserContent: false, containsObjectUrl: false, containsInstanceIdentifier: false });
  assert.doesNotMatch(JSON.stringify(evidence), /Bearer\s+|instance\":|objectKey|https:\/\/[^\"]+\?/i);
});
