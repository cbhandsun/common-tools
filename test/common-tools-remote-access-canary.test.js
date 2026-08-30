"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { MAX_RESPONSE_BYTES, canaryOptions, httpsOrigin, runRemoteAccessCanary } = require("../packages/cli/remote-access-canary");

function response(status, body) {
  const text = JSON.stringify(body);
  return { status, headers: { get(name) { return name.toLowerCase() === "content-length" ? String(Buffer.byteLength(text)) : null; } }, async text() { return text; } };
}

const tokens = Object.freeze({ valid: "valid-token-value", expired: "expired-token-value", wrongIssuer: "wrong-issuer-token", wrongAudience: "wrong-audience-token", missingScope: "missing-scope-token" });
const options = Object.freeze({ origin: "https://plugins.example.test", capability: "image-to-editable", disabledCapability: "ppt-create", tokens, timeoutMs: 1000 });

test("remote access canary covers all authorization boundaries and emits only redacted evidence", async () => {
  const seen = [];
  const fetchImpl = async (url, request) => {
    seen.push({ url, authorization: request.headers.Authorization, body: JSON.parse(request.body) });
    const token = request.headers.Authorization?.replace(/^Bearer /, "");
    if (!token || ["malformed-fixed-token", tokens.expired, tokens.wrongIssuer, tokens.wrongAudience].includes(token)) return response(401, { error: "unauthorized" });
    if (token === tokens.valid && seen.at(-1).body.method === "initialize") return response(200, { jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "common-tools" } } });
    return response(200, { jsonrpc: "2.0", id: 2, result: { isError: true, content: [{ type: "text", text: "not authorized" }] } });
  };
  const report = await runRemoteAccessCanary(options, fetchImpl);
  assert.equal(report.passed, true);
  assert.deepEqual(report.cases.map((entry) => entry.name), ["anonymous", "malformed", "expired", "wrongIssuer", "wrongAudience", "valid", "missingScope", "disabledCapability"]);
  const serialized = JSON.stringify(report);
  for (const token of Object.values(tokens)) assert.equal(serialized.includes(token), false);
  assert.equal(serialized.includes("canary/not-used"), false);
  assert.equal(seen.every((entry) => entry.url === "https://plugins.example.test/mcp"), true);
});

test("remote access canary fails closed on status drift, unsafe origins, invalid tokens, and oversized responses", async () => {
  const report = await runRemoteAccessCanary(options, async () => response(200, { result: {} }));
  assert.equal(report.passed, false);
  assert.throws(() => httpsOrigin("http://plugins.example.test"), /HTTPS origin/);
  assert.throws(() => canaryOptions({ COMMON_TOOLS_CANARY_URL: "https://plugins.example.test", COMMON_TOOLS_CANARY_CAPABILITY: "image-to-editable", COMMON_TOOLS_CANARY_DISABLED_CAPABILITY: "ppt-create" }), /token/);
  const oversized = { status: 401, headers: { get() { return String(MAX_RESPONSE_BYTES + 1); } }, async text() { return "{}"; } };
  await assert.rejects(() => runRemoteAccessCanary(options, async () => oversized), /request failed/);
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
