"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { setCapabilityEnabled } = require("../packages/capability-runtime");
const { CAPABILITY_SCOPES, LATEST_MCP_PROTOCOL_VERSION, cacheableResult, createHttpMetrics, createOidcVerifier, createRemoteMcpServer, jsonContentType, latestResultContract, loadRemoteConfig, metadata, oidcDiscoveryUrl, prometheusMetrics, readinessStatus, routingHeadersMatch, traceParentFromHeader, traceParentFromMeta, validLatestRequestMeta, verifyOidcDiscovery } = require("../packages/remote-mcp-server");
const { startupFailureCode } = require("../packages/remote-mcp-server/bin/common-tools-remote-mcp");

function base64url(value) { return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url"); }
function signedToken(privateKey, header, claims) {
  const encodedHeader = base64url(header);
  const encodedClaims = base64url(claims);
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${encodedHeader}.${encodedClaims}`);
  signer.end();
  return `${encodedHeader}.${encodedClaims}.${signer.sign(privateKey).toString("base64url")}`;
}

test("remote MCP accepts only a parsed application/json request media type", () => {
  assert.equal(jsonContentType("application/json"), true);
  assert.equal(jsonContentType("Application/Json; charset=utf-8"), true);
  assert.equal(jsonContentType("text/plain; value=application/json"), false);
  assert.equal(jsonContentType("application/json-seq"), false);
  assert.equal(jsonContentType(undefined), false);
});
function listen(server) { return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port))); }
function close(server) { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }

test("remote configuration refuses a filesystem backend in production", () => {
  assert.throws(() => loadRemoteConfig({
    NODE_ENV: "production",
    COMMON_TOOLS_REMOTE_HOST: "0.0.0.0",
    COMMON_TOOLS_REMOTE_PORT: "443",
    COMMON_TOOLS_REMOTE_PUBLIC_URL: "https://tools.example.test",
    COMMON_TOOLS_OIDC_ISSUER: "https://issuer.example.test",
    COMMON_TOOLS_OIDC_JWKS_URL: "https://issuer.example.test/jwks",
    COMMON_TOOLS_OIDC_AUDIENCE: "https://tools.example.test/mcp"
  }), /non-filesystem backend/);
});

test("remote startup diagnostics classify errors without echoing their text", () => {
  assert.equal(startupFailureCode(new Error("COMMON_TOOLS_DATABASE_URL is invalid")), "invalid-configuration");
  assert.equal(startupFailureCode(new Error("OIDC issuer is invalid")), "invalid-identity-configuration");
  assert.equal(startupFailureCode(new Error("Redis password=sensitive")), "provider-initialization");
});

test("development configuration permits only the Docker-internal Keycloak JWKS endpoint", () => {
  const environment = {
    NODE_ENV: "development",
    COMMON_TOOLS_REMOTE_HOST: "0.0.0.0",
    COMMON_TOOLS_REMOTE_PUBLIC_URL: "http://127.0.0.1:54000",
    COMMON_TOOLS_OIDC_ISSUER: "http://127.0.0.1:58080/realms/common-tools",
    COMMON_TOOLS_OIDC_JWKS_URL: "http://keycloak:8080/realms/common-tools/protocol/openid-connect/certs",
    COMMON_TOOLS_OIDC_AUDIENCE: "common-tools-mcp",
    COMMON_TOOLS_REMOTE_BACKEND: "postgres-redis-s3"
  };
  const config = loadRemoteConfig(environment);
  assert.equal(config.jwksUrl, "http://keycloak:8080/realms/common-tools/protocol/openid-connect/certs");
  assert.equal(config.oidcRequestTimeoutMs, 10000);
  assert.equal(loadRemoteConfig({ ...environment, COMMON_TOOLS_OIDC_REQUEST_TIMEOUT_MS: "1500" }).oidcRequestTimeoutMs, 1500);
  assert.throws(() => loadRemoteConfig({ ...environment, COMMON_TOOLS_OIDC_REQUEST_TIMEOUT_MS: "999" }), /OIDC_REQUEST_TIMEOUT/);
  assert.deepEqual(loadRemoteConfig({
    NODE_ENV: "development",
    COMMON_TOOLS_REMOTE_HOST: "0.0.0.0",
    COMMON_TOOLS_REMOTE_PUBLIC_URL: "http://127.0.0.1:54000",
    COMMON_TOOLS_OIDC_ISSUER: "http://127.0.0.1:58080/realms/common-tools",
    COMMON_TOOLS_OIDC_JWKS_URL: "http://keycloak:8080/realms/common-tools/protocol/openid-connect/certs",
    COMMON_TOOLS_OIDC_AUDIENCE: "common-tools-mcp",
    COMMON_TOOLS_REMOTE_BACKEND: "postgres-redis-s3",
    COMMON_TOOLS_TEAM_CAPABILITIES: "project-audit"
  }).enabledCapabilities, ["project-audit"]);
  assert.throws(() => loadRemoteConfig({ ...config, COMMON_TOOLS_REMOTE_PUBLIC_URL: "http://127.0.0.1:54000", COMMON_TOOLS_OIDC_ISSUER: "http://127.0.0.1:58080/realms/common-tools", COMMON_TOOLS_OIDC_JWKS_URL: "http://keycloak:8080/realms/common-tools/protocol/openid-connect/certs", COMMON_TOOLS_OIDC_AUDIENCE: "common-tools-mcp", COMMON_TOOLS_TEAM_CAPABILITIES: "project-audit,project-audit" }), /TEAM_CAPABILITIES/);
  assert.throws(() => loadRemoteConfig({
    ...config,
    COMMON_TOOLS_REMOTE_PUBLIC_URL: "http://127.0.0.1:54000",
    COMMON_TOOLS_OIDC_ISSUER: "http://127.0.0.1:58080/realms/common-tools",
    COMMON_TOOLS_OIDC_JWKS_URL: "http://untrusted.example.test/jwks",
    COMMON_TOOLS_OIDC_AUDIENCE: "common-tools-mcp"
  }), /must use HTTPS/);
});

test("OAuth metadata exposes only team capabilities enabled for this API", () => {
  const config = { publicUrl: new URL("https://tools.example.test"), issuer: "https://issuer.example.test", enabledCapabilities: ["project-audit"] };
  assert.deepEqual(metadata(config).scopes_supported, [CAPABILITY_SCOPES["project-audit"]]);
});

test("remote transport retains only a valid W3C trace parent", () => {
  const valid = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
  assert.equal(traceParentFromHeader(valid), valid);
  assert.equal(traceParentFromMeta({ traceparent: valid }), valid);
  assert.equal(traceParentFromMeta({ traceparent: valid, baggage: "user=private" }), valid);
  assert.equal(traceParentFromMeta({ traceparent: [valid] }), undefined);
  assert.equal(traceParentFromMeta(null), undefined);
  assert.equal(traceParentFromHeader([valid]), undefined);
  assert.equal(traceParentFromHeader("00-00000000000000000000000000000000-00f067aa0ba902b7-01"), undefined);
  assert.equal(traceParentFromHeader("00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01"), undefined);
});

test("MCP 2026-07-28 requires matched routing headers and private cache hints", () => {
  const list = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  assert.equal(routingHeadersMatch({ headers: { "mcp-method": "tools/list" } }, list, LATEST_MCP_PROTOCOL_VERSION), true);
  assert.equal(routingHeadersMatch({ headers: {} }, list, LATEST_MCP_PROTOCOL_VERSION), false);
  assert.equal(routingHeadersMatch({ headers: { "mcp-method": "tools/call", "mcp-name": "project-audit" } }, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "project-audit" } }, LATEST_MCP_PROTOCOL_VERSION), true);
  assert.equal(routingHeadersMatch({ headers: { "mcp-method": "tools/call", "mcp-name": "other" } }, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "project-audit" } }, LATEST_MCP_PROTOCOL_VERSION), false);
  assert.deepEqual(cacheableResult({ jsonrpc: "2.0", id: 1, result: { tools: [] } }, list, LATEST_MCP_PROTOCOL_VERSION), { jsonrpc: "2.0", id: 1, result: { tools: [], ttlMs: 30000, cacheScope: "private" } });
  assert.deepEqual(cacheableResult({ jsonrpc: "2.0", id: 1, result: { tools: [] } }, list, "2025-11-25"), { jsonrpc: "2.0", id: 1, result: { tools: [] } });
});

test("MCP 2026-07-28 stamps successful results with final result metadata", () => {
  const response = latestResultContract(cacheableResult({ jsonrpc: "2.0", id: 1, result: { tools: [] } }, { method: "tools/list" }, LATEST_MCP_PROTOCOL_VERSION), LATEST_MCP_PROTOCOL_VERSION);
  assert.equal(response.result.resultType, "complete");
  assert.deepEqual(response.result._meta["io.modelcontextprotocol/serverInfo"], { name: "common-tools", version: "0.1.0" });
  assert.equal(response.result.ttlMs, 30000);
  assert.equal(response.result.cacheScope, "private");
  assert.deepEqual(latestResultContract({ jsonrpc: "2.0", id: 1, result: { resultType: "task", taskId: "task" } }, LATEST_MCP_PROTOCOL_VERSION).result.resultType, "task");
});

test("MCP 2026-07-28 validates optional request metadata when it is supplied", () => {
  const valid = { params: { _meta: { "io.modelcontextprotocol/protocolVersion": LATEST_MCP_PROTOCOL_VERSION, "io.modelcontextprotocol/clientInfo": { name: "host", version: "1.0" } } } };
  assert.equal(validLatestRequestMeta(valid, LATEST_MCP_PROTOCOL_VERSION), true);
  assert.equal(validLatestRequestMeta({ params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2025-11-25" } } }, LATEST_MCP_PROTOCOL_VERSION), false);
  assert.equal(validLatestRequestMeta({ params: { _meta: { "io.modelcontextprotocol/clientInfo": { name: "host" } } } }, LATEST_MCP_PROTOCOL_VERSION), false);
  assert.equal(validLatestRequestMeta({ params: { _meta: "invalid" } }, LATEST_MCP_PROTOCOL_VERSION), false);
});

test("OIDC verifier accepts a valid audience-bound RS256 token and scopes capabilities", async () => {
  const pair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = pair.publicKey.export({ format: "jwk" });
  const now = Math.floor(Date.now() / 1000);
  const verifier = createOidcVerifier({
    issuer: "https://issuer.example.test",
    audience: "https://tools.example.test/mcp",
    jwksUrl: "https://issuer.example.test/jwks",
    fetchImpl: async () => ({ ok: true, json: async () => ({ keys: [{ ...jwk, kid: "test-key", use: "sig" }] }) })
  });
  const token = signedToken(pair.privateKey, { alg: "RS256", kid: "test-key" }, { iss: "https://issuer.example.test", aud: "https://tools.example.test/mcp", sub: "user-1", exp: now + 60, scope: `${CAPABILITY_SCOPES["project-audit"]} unrelated`, common_tools_projects: [{ id: "product-core", role: "editor" }] });
  const principal = await verifier(`Bearer ${token}`);
  assert.equal(principal.subject, "user-1");
  assert.deepEqual([...principal.capabilities], ["project-audit"]);
  assert.equal(principal.projects.get("product-core"), "editor");
  const malformed = signedToken(pair.privateKey, { alg: "RS256", kid: "test-key" }, { iss: "https://issuer.example.test", aud: "https://tools.example.test/mcp", sub: "user-1", exp: now + 60, common_tools_projects: [{ id: "product-core", role: "editor", injected: true }] });
  await assert.rejects(() => verifier(`Bearer ${malformed}`), /project roles/);
});

test("OIDC verifier refreshes cached signing keys once for an unknown key ID", async () => {
  const oldPair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const newPair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const now = Math.floor(Date.now() / 1000);
  let requests = 0;
  const verifier = createOidcVerifier({
    issuer: "https://issuer.example.test",
    audience: "https://tools.example.test/mcp",
    jwksUrl: "https://issuer.example.test/jwks",
    fetchImpl: async () => ({ ok: true, json: async () => ({ keys: requests++ === 0 ? [{ ...oldPair.publicKey.export({ format: "jwk" }), kid: "old", use: "sig" }] : [{ ...newPair.publicKey.export({ format: "jwk" }), kid: "new", use: "sig" }] }) })
  });
  const token = signedToken(newPair.privateKey, { alg: "RS256", kid: "new" }, { iss: "https://issuer.example.test", aud: "https://tools.example.test/mcp", sub: "user-1", exp: now + 60 });
  assert.equal((await verifier(`Bearer ${token}`)).subject, "user-1");
  assert.equal(requests, 2);
});

test("production remote configuration requires project RBAC unless explicitly disabled", () => {
  const base = { NODE_ENV: "production", COMMON_TOOLS_REMOTE_HOST: "0.0.0.0", COMMON_TOOLS_REMOTE_PORT: "443", COMMON_TOOLS_REMOTE_PUBLIC_URL: "https://tools.example.test", COMMON_TOOLS_OIDC_ISSUER: "https://issuer.example.test", COMMON_TOOLS_OIDC_JWKS_URL: "https://issuer.example.test/jwks", COMMON_TOOLS_OIDC_AUDIENCE: "tools", COMMON_TOOLS_REMOTE_BACKEND: "postgres-redis-s3" };
  assert.equal(loadRemoteConfig(base).requireProjectRbac, true);
  assert.equal(loadRemoteConfig({ ...base, COMMON_TOOLS_REQUIRE_PROJECT_RBAC: "false" }).requireProjectRbac, false);
  assert.throws(() => loadRemoteConfig({ ...base, COMMON_TOOLS_REQUIRE_PROJECT_RBAC: "yes" }), /true or false/);
});

test("OIDC discovery preflight verifies issuer, endpoints, S256, and configured JWKS", async () => {
  const config = { issuer: "https://issuer.example.test/tenant", jwksUrl: "https://issuer.example.test/tenant/keys", production: true };
  assert.equal(oidcDiscoveryUrl(config.issuer).href, "https://issuer.example.test/tenant/.well-known/openid-configuration");
  const document = { issuer: config.issuer, jwks_uri: config.jwksUrl, authorization_endpoint: "https://issuer.example.test/tenant/authorize", token_endpoint: "https://issuer.example.test/tenant/token", code_challenge_methods_supported: ["S256"] };
  assert.equal((await verifyOidcDiscovery(config, async () => ({ ok: true, json: async () => document }))).jwksUrl, config.jwksUrl);
  await assert.rejects(() => verifyOidcDiscovery(config, async () => ({ ok: true, json: async () => ({ ...document, code_challenge_methods_supported: ["plain"] }) })), /discovery document/);
  await assert.rejects(() => verifyOidcDiscovery(config, async () => ({ ok: true, json: async () => ({ ...document, jwks_uri: "https://issuer.example.test/other" }) })), /JWKS URL/);
  await assert.rejects(() => verifyOidcDiscovery(config, () => new Promise(() => {}), 1), /request timeout is invalid/);
  await assert.rejects(() => verifyOidcDiscovery(config, () => new Promise(() => {}), 1000), /request timed out/);
});

test("OIDC verifier bounds stalled JWKS requests", async () => {
  const verifier = createOidcVerifier({
    issuer: "https://issuer.example.test",
    audience: "https://tools.example.test/mcp",
    jwksUrl: "https://issuer.example.test/jwks",
    oidcRequestTimeoutMs: 1000,
    fetchImpl: () => new Promise(() => {})
  });
  const now = Math.floor(Date.now() / 1000);
  const token = `${base64url({ alg: "RS256", kid: "missing" })}.${base64url({ iss: "https://issuer.example.test", aud: "https://tools.example.test/mcp", sub: "user-1", exp: now + 60 })}.signature`;
  await assert.rejects(() => verifier(`Bearer ${token}`), /request timed out/);
});

test("remote MCP enforces OAuth, Origin and Streamable HTTP request boundaries", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-remote-mcp-"));
  const config = {
    publicUrl: new URL("https://tools.example.test"),
    issuer: "https://issuer.example.test",
    allowedOrigins: new Set(["https://client.example.test"]),
    workspaceRoot: root,
    stateRoot: path.join(root, "state")
  };
  const verify = async (header) => {
    if (header !== "Bearer accepted") throw new Error("missing bearer token");
    return { subject: "user-1", capabilities: new Set(["project-audit"]) };
  };
  setCapabilityEnabled(config.stateRoot, "image-to-editable", false);
  setCapabilityEnabled(config.stateRoot, "project-audit", true);
  const traces = [];
  const server = createRemoteMcpServer(config, verify, { NODE_ENV: "production" }, { traceExporter: { exportSpan(details) { traces.push(details); return Promise.resolve(); } } });
  try {
    const port = await listen(server);
    const request = (options, body) => new Promise((resolve, reject) => {
      const connection = http.request({ hostname: "127.0.0.1", port, ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } }, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
      });
      connection.on("error", reject);
      connection.end(body);
    });
    const metadata = await request({ method: "GET", path: "/.well-known/oauth-protected-resource/mcp" });
    assert.equal(metadata.status, 200);
    assert.deepEqual(JSON.parse(metadata.body).authorization_servers, [config.issuer]);
    const health = await request({ method: "GET", path: "/healthz" });
    assert.deepEqual(JSON.parse(health.body), { status: "ok" });
    const missingContentType = await request({ method: "POST", path: "/mcp", headers: { "Content-Type": "text/plain", Accept: "application/json, text/event-stream" } }, "{}");
    assert.equal(missingContentType.status, 415);
    assert.deepEqual(JSON.parse(missingContentType.body), { error: "MCP Content-Type must be application/json" });
    const unauthorized = await request({ method: "POST", path: "/mcp", headers: { Accept: "application/json, text/event-stream" } }, "{}");
    assert.equal(unauthorized.status, 401);
    assert.match(unauthorized.headers["www-authenticate"], /resource_metadata/);
    const blockedOrigin = await request({ method: "POST", path: "/mcp", headers: { Accept: "application/json, text/event-stream", Authorization: "Bearer accepted", Origin: "https://bad.example.test" } }, "{}");
    assert.equal(blockedOrigin.status, 403);
    const listed = await request({ method: "POST", path: "/mcp", headers: { Accept: "application/json, text/event-stream", Authorization: "Bearer accepted", Origin: "https://client.example.test", "MCP-Protocol-Version": "2025-11-25" } }, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    assert.equal(listed.status, 200);
    assert.deepEqual(JSON.parse(listed.body).result.tools.map((tool) => tool.name), ["health_check", "create_project_audit_job", "get_project_audit_report"]);
    const codexCompatibility = await request({ method: "POST", path: "/mcp", headers: { Accept: "application/json, text/event-stream", Authorization: "Bearer accepted", Origin: "https://client.example.test", "MCP-Protocol-Version": "2025-06-18" } }, JSON.stringify({ jsonrpc: "2.0", id: 21, method: "tools/list" }));
    assert.equal(codexCompatibility.status, 200);
    assert.deepEqual(JSON.parse(codexCompatibility.body).result.tools.map((tool) => tool.name), ["health_check", "create_project_audit_job", "get_project_audit_report"]);
    const unsupportedDraft = await request({ method: "POST", path: "/mcp", headers: { Accept: "application/json, text/event-stream", Authorization: "Bearer accepted", Origin: "https://client.example.test", "MCP-Protocol-Version": "DRAFT-2026-v1" } }, JSON.stringify({ jsonrpc: "2.0", id: 19, method: "server/discover" }));
    assert.equal(unsupportedDraft.status, 400);
    assert.deepEqual(JSON.parse(unsupportedDraft.body), { error: "unsupported MCP protocol version" });
    assert.doesNotMatch(unsupportedDraft.body, /DRAFT-2026-v1/);
    const current = await request({ method: "POST", path: "/mcp", headers: { Accept: "application/json, text/event-stream", Authorization: "Bearer accepted", Origin: "https://client.example.test", "MCP-Protocol-Version": LATEST_MCP_PROTOCOL_VERSION, "MCP-Method": "tools/list" } }, JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    assert.equal(current.status, 200);
    assert.deepEqual(JSON.parse(current.body).result.ttlMs, 30000);
    assert.equal(JSON.parse(current.body).result.cacheScope, "private");
    const unheaderedLatestAdvertisement = await request({ method: "POST", path: "/mcp", headers: { Accept: "application/json, text/event-stream", Authorization: "Bearer accepted", Origin: "https://client.example.test" } }, JSON.stringify({ jsonrpc: "2.0", id: 22, method: "tools/list", params: { _meta: { "io.modelcontextprotocol/protocolVersion": LATEST_MCP_PROTOCOL_VERSION } } }));
    assert.equal(unheaderedLatestAdvertisement.status, 200);
    assert.deepEqual(JSON.parse(unheaderedLatestAdvertisement.body).result.tools.map((tool) => tool.name), ["health_check", "create_project_audit_job", "get_project_audit_report"]);
    const missingRoutingHeader = await request({ method: "POST", path: "/mcp", headers: { Accept: "application/json, text/event-stream", Authorization: "Bearer accepted", Origin: "https://client.example.test", "MCP-Protocol-Version": LATEST_MCP_PROTOCOL_VERSION } }, JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }));
    assert.equal(missingRoutingHeader.status, 400);
    assert.equal(JSON.parse(missingRoutingHeader.body).error.code, -32001);
    assert.deepEqual(traces.map((trace) => ({ method: trace.method, statusCode: trace.statusCode })), [{ method: "tools/list", statusCode: 200 }, { method: "tools/list", statusCode: 200 }, { method: "tools/list", statusCode: 200 }, { method: "tools/list", statusCode: 200 }]);
  } finally {
    await close(server);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("remote readiness reports only a bounded safe status", async () => {
  assert.equal(await readinessStatus(async () => {}), true);
  assert.equal(await readinessStatus(async () => { throw new Error("postgres password=secret"); }), false);
  assert.equal(await readinessStatus(() => new Promise(() => {}), 100), false);
  const config = { publicUrl: new URL("https://tools.example.test"), issuer: "https://issuer.example.test", allowedOrigins: new Set() };
  const server = createRemoteMcpServer(config, async () => ({ subject: "user-1", capabilities: new Set() }), { NODE_ENV: "production" }, { readinessCheck: async () => { throw new Error("storage endpoint is unavailable"); } });
  try {
    const port = await listen(server);
    const response = await new Promise((resolve, reject) => {
      const request = http.get({ hostname: "127.0.0.1", port, path: "/readyz" }, (incoming) => { const chunks = []; incoming.on("data", (chunk) => chunks.push(chunk)); incoming.on("end", () => resolve({ status: incoming.statusCode, body: Buffer.concat(chunks).toString("utf8") })); });
      request.on("error", reject);
    });
    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(response.body), { status: "not_ready" });
    assert.doesNotMatch(response.body, /storage|endpoint/);
  } finally { await close(server); }
});

test("remote metrics are opt-in, bearer protected, and aggregate only", async () => {
  const config = { publicUrl: new URL("https://tools.example.test"), issuer: "https://issuer.example.test", allowedOrigins: new Set() };
  const snapshot = { jobs: [{ capability: "project-audit", counts: { queued: 2, running: 0 } }], queues: [{ capability: "project-audit", ready: 2, processing: 0 }] };
  assert.throws(() => prometheusMetrics({ jobs: [{ capability: 'x"bad', counts: { queued: 1 } }], queues: [] }), /job metrics/);
  const server = createRemoteMcpServer(config, async () => ({ subject: "user-1", capabilities: new Set() }), { NODE_ENV: "production" }, { metricsToken: "a-very-long-metrics-token", metricsProvider: async () => snapshot });
  try {
    const port = await listen(server);
    const request = (authorization) => new Promise((resolve, reject) => {
      const incomingRequest = http.get({ hostname: "127.0.0.1", port, path: "/metrics", headers: authorization ? { Authorization: authorization } : {} }, (incoming) => { const chunks = []; incoming.on("data", (chunk) => chunks.push(chunk)); incoming.on("end", () => resolve({ status: incoming.statusCode, body: Buffer.concat(chunks).toString("utf8") })); });
      incomingRequest.on("error", reject);
    });
    assert.equal((await request()).status, 401);
    const allowed = await request("Bearer a-very-long-metrics-token");
    assert.equal(allowed.status, 200);
    assert.match(allowed.body, /common_tools_jobs\{capability="project-audit",status="queued"\} 2/);
    assert.doesNotMatch(allowed.body, /user-1|owner|object/i);
  } finally { await close(server); }
});

test("Prometheus job latency and lease recovery metrics retain only fixed dimensions", () => {
  const rendered = prometheusMetrics({
    jobs: [],
    queues: [],
    oldestQueuedSeconds: [{ capability: "project-audit", seconds: 901 }],
    leaseRecoveries: [{ capability: "project-audit", count: 1 }],
    leaseRecoveryWindowSeconds: 900,
    workerHeartbeats: [{ capability: "project-audit", active: true }, { capability: "image-to-editable", active: false }],
    retention: { healthy: true, lastSuccessAgeSeconds: 12 }
  });
  assert.match(rendered, /common_tools_oldest_queued_job_seconds\{capability="project-audit"\} 901/);
  assert.match(rendered, /common_tools_lease_recovery_events\{capability="project-audit",window_seconds="900"\} 1/);
  assert.match(rendered, /common_tools_worker_heartbeat_active\{capability="project-audit"\} 1/);
  assert.match(rendered, /common_tools_worker_heartbeat_active\{capability="image-to-editable"\} 0/);
  assert.match(rendered, /common_tools_retention_maintenance_healthy 1/);
  assert.match(rendered, /common_tools_retention_last_success_age_seconds 12/);
  assert.throws(() => prometheusMetrics({ jobs: [], queues: [], oldestQueuedSeconds: [{ capability: "x\"bad", seconds: 1 }] }), /oldest queued job metrics/);
  assert.throws(() => prometheusMetrics({ jobs: [], queues: [], leaseRecoveries: [{ capability: "project-audit", count: -1 }] }), /lease recovery metrics/);
  assert.throws(() => prometheusMetrics({ jobs: [], queues: [], workerHeartbeats: [{ capability: "project-audit", active: "yes" }] }), /worker heartbeat metrics/);
  assert.throws(() => prometheusMetrics({ jobs: [], queues: [], retention: { healthy: true, lastSuccessAgeSeconds: -1 } }), /retention maintenance metrics/);
});

test("HTTP telemetry uses only fixed route and status dimensions", () => {
  let now = 1000;
  const metrics = createHttpMetrics(() => now);
  metrics.record("mcp", 401, 500);
  now = 1500;
  metrics.record("mcp", 401, 1000);
  metrics.record("attacker-controlled", 200, 1000);
  const rendered = prometheusMetrics({ jobs: [], queues: [] }, metrics.snapshot());
  assert.match(rendered, /common_tools_http_requests_total\{route="mcp",status="401"\} 2/);
  assert.match(rendered, /common_tools_http_request_duration_seconds\{route="mcp",status="401"\} 1/);
  assert.doesNotMatch(rendered, /attacker-controlled/);
});

test("remote MCP rejects authenticated calls above the configured rate limit", async () => {
  const config = { publicUrl: new URL("https://tools.example.test"), issuer: "https://issuer.example.test", allowedOrigins: new Set(), rateLimit: { windowSeconds: 17 } };
  const server = createRemoteMcpServer(config, async () => ({ subject: "user-1", capabilities: new Set() }), { NODE_ENV: "production" }, { rateLimiter: { consume: async () => false } });
  try {
    const port = await listen(server);
    const response = await new Promise((resolve, reject) => {
      const request = http.request({ hostname: "127.0.0.1", port, method: "POST", path: "/mcp", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer accepted" } }, (incoming) => { const chunks = []; incoming.on("data", (chunk) => chunks.push(chunk)); incoming.on("end", () => resolve({ status: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(chunks).toString("utf8") })); });
      request.on("error", reject);
      request.end("{}");
    });
    assert.equal(response.status, 429);
    assert.equal(response.headers["retry-after"], "17");
    assert.deepEqual(JSON.parse(response.body), { error: "rate limit exceeded" });
  } finally { await close(server); }
});

test("team backend refuses local fallback and exposes only team tools", async () => {
  const config = { publicUrl: new URL("https://tools.example.test"), issuer: "https://issuer.example.test", backend: "postgres-redis-s3", allowedOrigins: new Set(["https://client.example.test"]) };
  const verify = async () => ({ subject: "user-1", capabilities: new Set(["project-audit"]) });
  assert.throws(() => createRemoteMcpServer(config, verify), /team services/);
  const services = { createUploadTarget: async () => ({}), createJob: async () => ({}), getJob: async () => null, cancelJob: async () => null, getArtifactTarget: async () => ({}) };
  const server = createRemoteMcpServer(config, verify, process.env, { teamServices: services });
  try {
    const port = await listen(server);
    const response = await new Promise((resolve, reject) => {
      const request = http.request({ hostname: "127.0.0.1", port, method: "POST", path: "/mcp", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer accepted", Origin: "https://client.example.test", "MCP-Protocol-Version": "2025-11-25" } }, (incoming) => { const chunks = []; incoming.on("data", (chunk) => chunks.push(chunk)); incoming.on("end", () => resolve({ status: incoming.statusCode, body: Buffer.concat(chunks).toString("utf8") })); });
      request.on("error", reject);
      request.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body).result.tools.map((tool) => tool.name), ["create_team_upload_target", "create_team_job", "get_team_job", "cancel_team_job", "get_team_artifact_target"]);
  } finally { await close(server); }
});

test("team remote MCP negotiates Tasks and enforces task routing headers", async () => {
  const taskId = "b7f5d1be-3d34-4f20-9e0b-b45c1697b516";
  const traceParent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
  const currentJob = { id: taskId, capability: "project-audit", status: "queued", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:01.000Z", expiresAt: "2026-08-02T00:00:00.000Z", artifacts: [] };
  const config = { publicUrl: new URL("https://tools.example.test"), issuer: "https://issuer.example.test", backend: "postgres-redis-s3", allowedOrigins: new Set() };
  let persistedTraceParent;
  const services = {
    async createUploadTarget() { return {}; },
    async createJob(input) { persistedTraceParent = input.traceParent; return currentJob; },
    async getJob(id, ownerId) { return id === taskId && ownerId === "user-1" ? currentJob : null; },
    async cancelJob() { return { ...currentJob, status: "cancel_requested" }; },
    async getArtifactTarget() { return {}; }
  };
  const server = createRemoteMcpServer(config, async () => ({ subject: "user-1", capabilities: new Set(["project-audit"]), projects: new Map() }), process.env, { teamServices: services });
  try {
    const port = await listen(server);
    const request = (headers, body) => new Promise((resolve, reject) => {
      const outgoing = http.request({ hostname: "127.0.0.1", port, method: "POST", path: "/mcp", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer accepted", ...headers } }, (incoming) => { const chunks = []; incoming.on("data", (chunk) => chunks.push(chunk)); incoming.on("end", () => resolve({ status: incoming.statusCode, body: Buffer.concat(chunks).toString("utf8") })); });
      outgoing.on("error", reject);
      outgoing.end(JSON.stringify(body));
    });
    const initialized = await request({}, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2026-06-30" } });
    assert.equal(initialized.status, 200);
    assert.deepEqual(JSON.parse(initialized.body).result.capabilities.extensions, { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] }, "io.modelcontextprotocol/tasks": {} });
    const created = await request({ "MCP-Protocol-Version": "2026-06-30" }, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_team_job", arguments: { capability: "project-audit", inputObjectKey: "owners/hash/inputs/one", idempotencyKey: "tasks-request" }, _meta: { "io.modelcontextprotocol/clientCapabilities": { extensions: { "io.modelcontextprotocol/tasks": {} } } } } });
    const createdBody = JSON.parse(created.body);
    assert.equal(createdBody.result.resultType, "task");
    assert.equal(createdBody.result.taskId, taskId);
    const missingHeaders = await request({ "MCP-Protocol-Version": "2026-06-30" }, { jsonrpc: "2.0", id: 3, method: "tasks/get", params: { taskId } });
    assert.equal(missingHeaders.status, 400);
    assert.equal(JSON.parse(missingHeaders.body).error.message, "invalid task routing headers");
    const read = await request({ "MCP-Protocol-Version": "2026-06-30", "MCP-Method": "tasks/get", "MCP-Name": taskId }, { jsonrpc: "2.0", id: 4, method: "tasks/get", params: { taskId } });
    assert.equal(read.status, 200);
    assert.equal(JSON.parse(read.body).result.status, "working");
    const currentCreated = await request({ "MCP-Protocol-Version": LATEST_MCP_PROTOCOL_VERSION, "MCP-Method": "tools/call", "MCP-Name": "create_team_job" }, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "create_team_job", arguments: { capability: "project-audit", inputObjectKey: "owners/hash/inputs/two", idempotencyKey: "latest-tasks-request" }, _meta: { traceparent: traceParent, "io.modelcontextprotocol/clientCapabilities": { extensions: { "io.modelcontextprotocol/tasks": {} } } } } });
    assert.equal(currentCreated.status, 200);
    assert.equal(JSON.parse(currentCreated.body).result.resultType, "task");
    assert.equal(persistedTraceParent, traceParent);
    const currentRead = await request({ "MCP-Protocol-Version": LATEST_MCP_PROTOCOL_VERSION, "MCP-Method": "tasks/get", "MCP-Name": taskId }, { jsonrpc: "2.0", id: 6, method: "tasks/get", params: { taskId } });
    assert.equal(currentRead.status, 200);
    assert.equal(JSON.parse(currentRead.body).result.status, "working");
    const appMeta = { "io.modelcontextprotocol/clientCapabilities": { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } } };
    const resources = await request({ "MCP-Protocol-Version": LATEST_MCP_PROTOCOL_VERSION, "MCP-Method": "resources/list" }, { jsonrpc: "2.0", id: 7, method: "resources/list", params: { _meta: appMeta } });
    assert.equal(resources.status, 200);
    assert.deepEqual(JSON.parse(resources.body).result.resources.map((item) => item.uri), ["ui://common-tools/quality-report.html"]);
    const resource = await request({ "MCP-Protocol-Version": LATEST_MCP_PROTOCOL_VERSION, "MCP-Method": "resources/read", "MCP-Name": "ui://common-tools/quality-report.html" }, { jsonrpc: "2.0", id: 8, method: "resources/read", params: { uri: "ui://common-tools/quality-report.html", _meta: appMeta } });
    assert.equal(resource.status, 200);
    assert.equal(JSON.parse(resource.body).result.contents[0].mimeType, "text/html;profile=mcp-app");
  } finally { await close(server); }
});
