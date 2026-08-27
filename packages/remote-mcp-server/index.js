"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const os = require("node:os");
const { handle, settings } = require("../mcp-server/core");
const { CAPABILITY_SCOPES, handleTeamMcp } = require("./team-mcp");
const { LATEST_MCP_PROTOCOL_VERSION, TASKS_PROTOCOL_VERSIONS, supportsTasksProtocol } = require("./team-tasks");

// 2025-06-18 remains in use by current Codex Streamable HTTP clients.  It
// has the same request routing contract as the other pre-Tasks versions.
const PROTOCOL_VERSIONS = new Set(["2025-03-26", "2025-06-18", "2025-11-25", ...TASKS_PROTOCOL_VERSIONS]);
const TEAM_METHODS = new Set(["initialize", "server/discover", "tools/list", "tools/call", "resources/list", "resources/read", "tasks/get", "tasks/update", "tasks/cancel"]);
const TASK_METHODS = new Set(["tasks/get", "tasks/update", "tasks/cancel"]);
const SERVER_INFO = Object.freeze({ name: "common-tools", version: "0.1.0" });
const OIDC_REQUEST_TIMEOUT_MS = 10000;

function assertNonEmpty(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}
function parseUrl(value, name, httpHosts = []) {
  let url;
  try { url = new URL(assertNonEmpty(value, name)); } catch { throw new Error(`${name} must be an absolute URL`); }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && httpHosts.includes(url.hostname))) throw new Error(`${name} must use HTTPS`);
  if (url.username || url.password) throw new Error(`${name} must not embed credentials`);
  return url;
}
function parsePort(value) {
  const port = Number(value || 3000);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("COMMON_TOOLS_REMOTE_PORT must be a valid port");
  return port;
}
function parseBoolean(value, name, fallback) {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}
function parseBoundedInteger(value, name, fallback, minimum, maximum) {
  const parsed = Number(value === undefined ? fallback : value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  return parsed;
}
function parseOrigins(value, fallback) {
  const origins = (value || fallback || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (origins.some((origin) => origin === "*")) throw new Error("COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS must not contain wildcard origins");
  return new Set(origins.map((origin) => parseUrl(origin, "COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS", ["127.0.0.1", "localhost"]).origin));
}
function parseTeamCapabilities(value) {
  const supported = Object.keys(CAPABILITY_SCOPES);
  const source = value === undefined ? supported : typeof value === "string" ? value.split(",").map((item) => item.trim()) : [];
  if (!source.length || source.some((capability) => !supported.includes(capability)) || new Set(source).size !== source.length) throw new Error("COMMON_TOOLS_TEAM_CAPABILITIES is invalid");
  return Object.freeze([...source].sort());
}
function loadRemoteConfig(environment = process.env) {
  const production = environment.NODE_ENV === "production";
  const loopbackHttpHosts = production ? [] : ["127.0.0.1", "localhost"];
  const host = environment.COMMON_TOOLS_REMOTE_HOST || "127.0.0.1";
  if (production && ["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("production remote MCP must bind to a managed network interface");
  const publicUrl = parseUrl(environment.COMMON_TOOLS_REMOTE_PUBLIC_URL || `http://${host}:${environment.COMMON_TOOLS_REMOTE_PORT || 3000}`, "COMMON_TOOLS_REMOTE_PUBLIC_URL", loopbackHttpHosts);
  const issuer = parseUrl(environment.COMMON_TOOLS_OIDC_ISSUER, "COMMON_TOOLS_OIDC_ISSUER", loopbackHttpHosts);
  // A Docker-only JWKS endpoint is permitted in development so the API does not
  // need to route through the host loopback interface. The token issuer itself
  // remains constrained to HTTPS or loopback, and production remains HTTPS-only.
  const jwksUrl = parseUrl(environment.COMMON_TOOLS_OIDC_JWKS_URL, "COMMON_TOOLS_OIDC_JWKS_URL", production ? [] : [...loopbackHttpHosts, "keycloak"]);
  const audience = assertNonEmpty(environment.COMMON_TOOLS_OIDC_AUDIENCE, "COMMON_TOOLS_OIDC_AUDIENCE");
  const backend = environment.COMMON_TOOLS_REMOTE_BACKEND || "filesystem-development";
  if (!["filesystem-development", "postgres-redis-s3"].includes(backend)) throw new Error("COMMON_TOOLS_REMOTE_BACKEND is invalid");
  if (production && backend === "filesystem-development") throw new Error("production remote MCP requires a non-filesystem backend");
  return Object.freeze({
    host,
    port: parsePort(environment.COMMON_TOOLS_REMOTE_PORT),
    publicUrl,
    issuer: issuer.href.replace(/\/$/, ""),
    jwksUrl: jwksUrl.href,
    audience,
    backend,
    enabledCapabilities: parseTeamCapabilities(environment.COMMON_TOOLS_TEAM_CAPABILITIES),
    production,
    requireProjectRbac: parseBoolean(environment.COMMON_TOOLS_REQUIRE_PROJECT_RBAC, "COMMON_TOOLS_REQUIRE_PROJECT_RBAC", production),
    oidcRequestTimeoutMs: parseBoundedInteger(environment.COMMON_TOOLS_OIDC_REQUEST_TIMEOUT_MS, "COMMON_TOOLS_OIDC_REQUEST_TIMEOUT_MS", OIDC_REQUEST_TIMEOUT_MS, 1000, 60000),
    rateLimit: Object.freeze({ windowSeconds: parseBoundedInteger(environment.COMMON_TOOLS_RATE_LIMIT_WINDOW_SECONDS, "COMMON_TOOLS_RATE_LIMIT_WINDOW_SECONDS", 60, 1, 3600), maxRequests: parseBoundedInteger(environment.COMMON_TOOLS_RATE_LIMIT_MAX_REQUESTS, "COMMON_TOOLS_RATE_LIMIT_MAX_REQUESTS", 60, 1, 10000) }),
    allowedOrigins: parseOrigins(environment.COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS, publicUrl.origin),
    workspaceRoot: environment.COMMON_TOOLS_WORKSPACE,
    stateRoot: environment.COMMON_TOOLS_STATE
  });
}

function decodeJson(segment, name) {
  try { return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")); } catch { throw new Error(`${name} is invalid`); }
}
function audienceMatches(value, audience) { return typeof value === "string" ? value === audience : Array.isArray(value) && value.includes(audience); }
function scopesFromClaims(claims) {
  const scope = typeof claims.scope === "string" ? claims.scope.split(/\s+/) : [];
  const scp = Array.isArray(claims.scp) ? claims.scp.filter((item) => typeof item === "string") : [];
  return new Set([...scope, ...scp].filter(Boolean));
}
function capabilitiesFromScopes(scopes) {
  return new Set(Object.entries(CAPABILITY_SCOPES).filter(([, required]) => scopes.has(required)).map(([capability]) => capability));
}
function projectRolesFromClaims(claims) {
  const raw = claims.common_tools_projects;
  if (raw === undefined) return new Map();
  if (!Array.isArray(raw)) throw new Error("token project roles are invalid");
  const roles = new Map();
  for (const entry of raw) {
    const keys = entry && typeof entry === "object" && !Array.isArray(entry) ? Object.keys(entry) : [];
    if (keys.length !== 2 || !keys.includes("id") || !keys.includes("role") || typeof entry.id !== "string" || !/^[a-z][a-z0-9-]{2,63}$/.test(entry.id) || !["viewer", "editor", "admin"].includes(entry.role) || roles.has(entry.id)) throw new Error("token project roles are invalid");
    roles.set(entry.id, entry.role);
  }
  return roles;
}
function getBearerToken(header) {
  if (typeof header !== "string") throw new Error("missing bearer token");
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header);
  if (!match) throw new Error("invalid bearer token");
  return match[1];
}
function oidcRequestTimeout(value) {
  if (!Number.isSafeInteger(value) || value < 1000 || value > 60000) throw new Error("OIDC request timeout is invalid");
  return value;
}
async function fetchOidcResponse(fetchImpl, input, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("OIDC request timed out"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => fetchImpl(input, { headers: { Accept: "application/json" }, signal: controller.signal })),
      timeout
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function createOidcVerifier({ issuer, audience, jwksUrl, oidcRequestTimeoutMs = OIDC_REQUEST_TIMEOUT_MS, fetchImpl = globalThis.fetch, clock = () => Date.now() }) {
  if (typeof fetchImpl !== "function") throw new Error("a fetch implementation is required for OIDC verification");
  const requestTimeoutMs = oidcRequestTimeout(oidcRequestTimeoutMs);
  let cachedKeys = null;
  let cachedUntil = 0;
  async function keys(forceRefresh = false) {
    if (!forceRefresh && cachedKeys && cachedUntil > clock()) return cachedKeys;
    const response = await fetchOidcResponse(fetchImpl, jwksUrl, requestTimeoutMs);
    if (!response || !response.ok) throw new Error("unable to retrieve OIDC signing keys");
    const body = await response.json();
    if (!body || !Array.isArray(body.keys)) throw new Error("OIDC signing keys are invalid");
    cachedKeys = body.keys;
    cachedUntil = clock() + 5 * 60 * 1000;
    return cachedKeys;
  }
  return async function verify(authorization) {
    const token = getBearerToken(authorization);
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("invalid bearer token");
    const header = decodeJson(parts[0], "token header");
    const claims = decodeJson(parts[1], "token claims");
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("unsupported token signature");
    let jwk = (await keys()).find((candidate) => candidate && candidate.kid === header.kid && candidate.kty === "RSA" && (!candidate.use || candidate.use === "sig"));
    if (!jwk) jwk = (await keys(true)).find((candidate) => candidate && candidate.kid === header.kid && candidate.kty === "RSA" && (!candidate.use || candidate.use === "sig"));
    if (!jwk) throw new Error("token signing key is unavailable");
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    if (!verifier.verify(crypto.createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2], "base64url"))) throw new Error("invalid token signature");
    const now = Math.floor(clock() / 1000);
    if (claims.iss !== issuer || !audienceMatches(claims.aud, audience) || typeof claims.sub !== "string" || !claims.sub || !Number.isFinite(claims.exp) || claims.exp <= now || (Number.isFinite(claims.nbf) && claims.nbf > now)) throw new Error("token claims are invalid");
    return Object.freeze({ subject: claims.sub, capabilities: capabilitiesFromScopes(scopesFromClaims(claims)), projects: projectRolesFromClaims(claims) });
  };
}
function oidcDiscoveryUrl(issuer) {
  const normalized = assertNonEmpty(issuer, "OIDC issuer").replace(/\/$/, "");
  return new URL(`${normalized}/.well-known/openid-configuration`);
}
function endpointIsSecure(value, allowLocalHttp) {
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === "https:" || (allowLocalHttp && endpoint.protocol === "http:" && ["127.0.0.1", "localhost"].includes(endpoint.hostname));
  } catch { return false; }
}
async function verifyOidcDiscovery(config, fetchImpl = globalThis.fetch, timeoutMs = config?.oidcRequestTimeoutMs ?? OIDC_REQUEST_TIMEOUT_MS) {
  if (!config || typeof config.issuer !== "string" || typeof config.jwksUrl !== "string" || typeof config.production !== "boolean" || typeof fetchImpl !== "function") throw new TypeError("OIDC discovery configuration is invalid");
  const response = await fetchOidcResponse(fetchImpl, oidcDiscoveryUrl(config.issuer), oidcRequestTimeout(timeoutMs));
  if (!response || !response.ok) throw new Error("OIDC discovery endpoint is unavailable");
  const document = await response.json();
  if (!document || typeof document !== "object" || Array.isArray(document) || document.issuer !== config.issuer || !endpointIsSecure(document.jwks_uri, !config.production) || !endpointIsSecure(document.authorization_endpoint, !config.production) || !endpointIsSecure(document.token_endpoint, !config.production) || !Array.isArray(document.code_challenge_methods_supported) || !document.code_challenge_methods_supported.includes("S256")) throw new Error("OIDC discovery document is invalid");
  if (config.production && document.jwks_uri !== config.jwksUrl) throw new Error("OIDC discovery JWKS URL does not match configuration");
  return Object.freeze({ issuer: document.issuer, authorizationEndpoint: document.authorization_endpoint, tokenEndpoint: document.token_endpoint, jwksUrl: config.production ? document.jwks_uri : config.jwksUrl });
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", ...headers });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}
function text(response, status, body, headers = {}) {
  response.writeHead(status, { "Cache-Control": "no-store", "Content-Type": "text/plain; version=0.0.4; charset=utf-8", ...headers });
  response.end(body);
}
function metadata(config) {
  const enabled = Array.isArray(config.enabledCapabilities) ? new Set(config.enabledCapabilities) : new Set(Object.keys(CAPABILITY_SCOPES));
  return { resource: `${config.publicUrl.origin}/mcp`, authorization_servers: [config.issuer], scopes_supported: Object.entries(CAPABILITY_SCOPES).filter(([capability]) => enabled.has(capability)).map(([, scope]) => scope) };
}
function requestBody(request, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => { total += chunk.length; if (total > limit) { reject(new Error("request body is too large")); request.destroy(); } else chunks.push(chunk); });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}
function jsonContentType(value) {
  if (typeof value !== "string") return false;
  const mediaType = value.split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json";
}
function validOrigin(request, config) {
  const origin = request.headers.origin;
  return !origin || config.allowedOrigins.has(origin);
}
function healthStatus(environment) {
  return environment.NODE_ENV === "development" ? { status: "ok", instance: os.hostname() } : { status: "ok" };
}
async function readinessStatus(readinessCheck, timeoutMs = 2000) {
  if (readinessCheck === undefined) return true;
  if (typeof readinessCheck !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000) throw new TypeError("remote readiness configuration is invalid");
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(() => readinessCheck()),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("readiness check timed out")), timeoutMs); })
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
function metricsTokenMatches(authorization, token) {
  if (typeof authorization !== "string" || typeof token !== "string") return false;
  const expected = Buffer.from(`Bearer ${token}`);
  const received = Buffer.from(authorization);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
function metricRoute(pathname) {
  if (pathname === "/mcp") return "mcp";
  if (pathname === "/healthz") return "healthz";
  if (pathname === "/readyz") return "readyz";
  if (pathname === "/metrics") return "metrics";
  return "other";
}
function traceParentFromHeader(value) {
  if (typeof value !== "string") return undefined;
  const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/.exec(value);
  if (!match || /^0{32}$/.test(match[1]) || /^0{16}$/.test(match[2])) return undefined;
  return value;
}
function traceParentFromMeta(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return traceParentFromHeader(value.traceparent);
}
function plainObject(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function validLatestRequestMeta(body, protocolVersion) {
  if (protocolVersion !== LATEST_MCP_PROTOCOL_VERSION) return true;
  const meta = body?.params?._meta;
  if (meta === undefined) return true;
  if (!plainObject(meta)) return false;
  if (meta["io.modelcontextprotocol/protocolVersion"] !== undefined && meta["io.modelcontextprotocol/protocolVersion"] !== LATEST_MCP_PROTOCOL_VERSION) return false;
  const clientInfo = meta["io.modelcontextprotocol/clientInfo"];
  return clientInfo === undefined || (plainObject(clientInfo) && typeof clientInfo.name === "string" && clientInfo.name.length > 0 && clientInfo.name.length <= 256 && typeof clientInfo.version === "string" && clientInfo.version.length > 0 && clientInfo.version.length <= 256);
}
function requestProtocolVersion(request, body) {
  const headerVersion = request.headers["mcp-protocol-version"];
  if (headerVersion !== undefined) return headerVersion;
  // Some hosts advertise a newer capability in _meta before sending the
  // Streamable HTTP routing headers.  Only an explicit HTTP header (or the
  // initialize request) selects the stricter wire contract.
  return body?.method === "initialize" ? body.params?.protocolVersion : undefined;
}
function expectedMcpName(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || !body.params || typeof body.params !== "object" || Array.isArray(body.params)) return undefined;
  if (["tools/call", "prompts/get"].includes(body.method)) return typeof body.params.name === "string" ? body.params.name : undefined;
  if (body.method === "resources/read") return typeof body.params.uri === "string" ? body.params.uri : undefined;
  if (TASK_METHODS.has(body.method)) return typeof body.params.taskId === "string" ? body.params.taskId : undefined;
  return undefined;
}
function routingHeadersMatch(request, body, protocolVersion) {
  if (protocolVersion !== LATEST_MCP_PROTOCOL_VERSION) return true;
  if (typeof body?.method !== "string" || request.headers["mcp-method"] !== body.method) return false;
  const name = expectedMcpName(body);
  return name === undefined || request.headers["mcp-name"] === name;
}
function taskRoutingHeadersMatch(request, body) {
  const taskId = body?.params?.taskId;
  return typeof taskId === "string" && request.headers["mcp-method"] === body.method && request.headers["mcp-name"] === taskId;
}
function cacheableResult(responseBody, body, protocolVersion) {
  if (protocolVersion !== LATEST_MCP_PROTOCOL_VERSION || !["tools/list", "resources/list", "resources/read", "server/discover"].includes(body?.method) || !responseBody || typeof responseBody !== "object" || Array.isArray(responseBody) || !responseBody.result || typeof responseBody.result !== "object" || Array.isArray(responseBody.result)) return responseBody;
  return { ...responseBody, result: { ...responseBody.result, ttlMs: 30000, cacheScope: "private" } };
}
function latestResultContract(responseBody, protocolVersion) {
  if (protocolVersion !== LATEST_MCP_PROTOCOL_VERSION || !responseBody || typeof responseBody !== "object" || Array.isArray(responseBody) || !responseBody.result || typeof responseBody.result !== "object" || Array.isArray(responseBody.result)) return responseBody;
  const current = responseBody.result;
  const meta = current._meta && typeof current._meta === "object" && !Array.isArray(current._meta) ? current._meta : {};
  return { ...responseBody, result: { ...current, resultType: current.resultType === "task" ? "task" : "complete", _meta: { ...meta, "io.modelcontextprotocol/serverInfo": SERVER_INFO } } };
}
function emitTrace(traceExporter, details) {
  if (!traceExporter) return;
  try { void Promise.resolve(traceExporter.exportSpan(details)).catch(() => {}); } catch { /* telemetry must not affect MCP availability */ }
}
function createHttpMetrics(clock = () => Date.now()) {
  if (typeof clock !== "function") throw new TypeError("HTTP metrics clock is invalid");
  const entries = new Map();
  return Object.freeze({
    record(route, status, startedAt) {
      if (!["mcp", "healthz", "readyz", "metrics", "other"].includes(route) || !Number.isSafeInteger(status) || status < 100 || status > 599 || !Number.isFinite(startedAt)) return;
      const durationSeconds = Math.max(0, (clock() - startedAt) / 1000);
      const key = `${route}:${status}`;
      const entry = entries.get(key) || { route, status, count: 0, durationSeconds: 0 };
      entry.count += 1;
      entry.durationSeconds += durationSeconds;
      entries.set(key, entry);
    },
    snapshot() { return [...entries.values()].map((entry) => Object.freeze({ ...entry })).sort((left, right) => left.route.localeCompare(right.route) || left.status - right.status); }
  });
}
function prometheusMetrics(snapshot, httpSnapshot = []) {
  if (!snapshot || !Array.isArray(snapshot.jobs) || !Array.isArray(snapshot.queues)) throw new TypeError("metrics snapshot is invalid");
  const lines = ["# HELP common_tools_jobs Number of jobs by capability and status.", "# TYPE common_tools_jobs gauge"];
  for (const item of snapshot.jobs) {
    if (!item || typeof item.capability !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(item.capability) || !item.counts || typeof item.counts !== "object") throw new TypeError("job metrics are invalid");
    for (const [status, count] of Object.entries(item.counts)) {
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(status) || !Number.isSafeInteger(count) || count < 0) throw new TypeError("job metrics are invalid");
      lines.push(`common_tools_jobs{capability="${item.capability}",status="${status}"} ${count}`);
    }
  }
  lines.push("# HELP common_tools_queue_messages Number of queued or in-flight delivery messages by capability.", "# TYPE common_tools_queue_messages gauge");
  for (const item of snapshot.queues) {
    if (!item || typeof item.capability !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(item.capability) || !Number.isSafeInteger(item.ready) || item.ready < 0 || !Number.isSafeInteger(item.processing) || item.processing < 0) throw new TypeError("queue metrics are invalid");
    lines.push(`common_tools_queue_messages{capability="${item.capability}",state="ready"} ${item.ready}`);
    lines.push(`common_tools_queue_messages{capability="${item.capability}",state="processing"} ${item.processing}`);
  }
  if (snapshot.oldestQueuedSeconds !== undefined && !Array.isArray(snapshot.oldestQueuedSeconds)) throw new TypeError("oldest queued job metrics are invalid");
  const oldestQueuedSeconds = snapshot.oldestQueuedSeconds || [];
  lines.push("# HELP common_tools_oldest_queued_job_seconds Age of the oldest queued job by capability.", "# TYPE common_tools_oldest_queued_job_seconds gauge");
  for (const item of oldestQueuedSeconds) {
    if (!item || typeof item.capability !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(item.capability) || !Number.isSafeInteger(item.seconds) || item.seconds < 0) throw new TypeError("oldest queued job metrics are invalid");
    lines.push(`common_tools_oldest_queued_job_seconds{capability="${item.capability}"} ${item.seconds}`);
  }
  if (snapshot.leaseRecoveries !== undefined && !Array.isArray(snapshot.leaseRecoveries)) throw new TypeError("lease recovery metrics are invalid");
  const leaseRecoveries = snapshot.leaseRecoveries || [];
  const leaseRecoveryWindowSeconds = snapshot.leaseRecoveryWindowSeconds === undefined ? 900 : snapshot.leaseRecoveryWindowSeconds;
  if (!Number.isSafeInteger(leaseRecoveryWindowSeconds) || leaseRecoveryWindowSeconds < 1 || leaseRecoveryWindowSeconds > 3600) throw new TypeError("lease recovery metrics are invalid");
  lines.push("# HELP common_tools_lease_recovery_events Lease-expiry recovery events observed within the fixed window.", "# TYPE common_tools_lease_recovery_events gauge");
  for (const item of leaseRecoveries) {
    if (!item || typeof item.capability !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(item.capability) || !Number.isSafeInteger(item.count) || item.count < 0) throw new TypeError("lease recovery metrics are invalid");
    lines.push(`common_tools_lease_recovery_events{capability="${item.capability}",window_seconds="${leaseRecoveryWindowSeconds}"} ${item.count}`);
  }
  if (snapshot.workerHeartbeats !== undefined && !Array.isArray(snapshot.workerHeartbeats)) throw new TypeError("worker heartbeat metrics are invalid");
  const workerHeartbeats = snapshot.workerHeartbeats || [];
  lines.push("# HELP common_tools_worker_heartbeat_active Whether at least one Worker heartbeat is active for an enabled capability.", "# TYPE common_tools_worker_heartbeat_active gauge");
  for (const item of workerHeartbeats) {
    if (!item || typeof item.capability !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(item.capability) || typeof item.active !== "boolean") throw new TypeError("worker heartbeat metrics are invalid");
    lines.push(`common_tools_worker_heartbeat_active{capability="${item.capability}"} ${item.active ? 1 : 0}`);
  }
  if (snapshot.retention !== undefined) {
    const retention = snapshot.retention;
    if (!retention || typeof retention !== "object" || Array.isArray(retention) || typeof retention.healthy !== "boolean" || (retention.lastSuccessAgeSeconds !== null && (!Number.isSafeInteger(retention.lastSuccessAgeSeconds) || retention.lastSuccessAgeSeconds < 0))) throw new TypeError("retention maintenance metrics are invalid");
    lines.push("# HELP common_tools_retention_maintenance_healthy Whether the retention scheduler has completed a recent successful pass.", "# TYPE common_tools_retention_maintenance_healthy gauge", `common_tools_retention_maintenance_healthy ${retention.healthy ? 1 : 0}`);
    if (retention.lastSuccessAgeSeconds !== null) {
      lines.push("# HELP common_tools_retention_last_success_age_seconds Seconds since the retention scheduler last completed successfully.", "# TYPE common_tools_retention_last_success_age_seconds gauge", `common_tools_retention_last_success_age_seconds ${retention.lastSuccessAgeSeconds}`);
    }
  }
  if (!Array.isArray(httpSnapshot)) throw new TypeError("HTTP metrics are invalid");
  lines.push("# HELP common_tools_http_requests_total Number of completed HTTP requests by fixed route and status.", "# TYPE common_tools_http_requests_total counter", "# HELP common_tools_http_request_duration_seconds Total completed HTTP request duration by fixed route and status.", "# TYPE common_tools_http_request_duration_seconds counter");
  for (const item of httpSnapshot) {
    if (!item || !["mcp", "healthz", "readyz", "metrics", "other"].includes(item.route) || !Number.isSafeInteger(item.status) || item.status < 100 || item.status > 599 || !Number.isSafeInteger(item.count) || item.count < 0 || !Number.isFinite(item.durationSeconds) || item.durationSeconds < 0) throw new TypeError("HTTP metrics are invalid");
    const labels = `route="${item.route}",status="${item.status}"`;
    lines.push(`common_tools_http_requests_total{${labels}} ${item.count}`);
    lines.push(`common_tools_http_request_duration_seconds{${labels}} ${item.durationSeconds}`);
  }
  return `${lines.join("\n")}\n`;
}
function createRemoteMcpServer(config, verifyAuthorization, environment = process.env, options = {}) {
  if (!config || typeof verifyAuthorization !== "function") throw new Error("remote MCP configuration and authorization verifier are required");
  if (config.backend === "postgres-redis-s3" && !options.teamServices) throw new Error("team services are required for the postgres-redis-s3 backend");
  if ((options.metricsProvider === undefined) !== (options.metricsToken === undefined) || (options.metricsProvider !== undefined && (typeof options.metricsProvider !== "function" || typeof options.metricsToken !== "string" || !/^[A-Za-z0-9._~-]{16,512}$/.test(options.metricsToken)))) throw new TypeError("remote metrics configuration is invalid");
  if (options.rateLimiter !== undefined && typeof options.rateLimiter.consume !== "function") throw new TypeError("remote rate limiter is invalid");
  if (options.traceExporter !== undefined && typeof options.traceExporter.exportSpan !== "function") throw new TypeError("remote trace exporter is invalid");
  const challenge = `Bearer resource_metadata="${config.publicUrl.origin}/.well-known/oauth-protected-resource/mcp"`;
  const httpMetrics = createHttpMetrics();
  return http.createServer(async (request, response) => {
    const startedAt = Date.now();
    let route = "other";
    response.once("finish", () => { httpMetrics.record(route, response.statusCode || 500, startedAt); });
    try {
      const requestUrl = new URL(request.url || "/", config.publicUrl);
      route = metricRoute(requestUrl.pathname);
      if (request.method === "GET" && requestUrl.pathname === "/healthz") return json(response, 200, healthStatus(environment));
      if (request.method === "GET" && requestUrl.pathname === "/readyz") {
        const ready = await readinessStatus(options.readinessCheck, options.readinessTimeoutMs);
        return json(response, ready ? 200 : 503, { status: ready ? "ok" : "not_ready" });
      }
      if (request.method === "GET" && requestUrl.pathname === "/metrics") {
        if (!options.metricsProvider) return json(response, 404, { error: "not found" });
        if (!metricsTokenMatches(request.headers.authorization, options.metricsToken)) return json(response, 401, { error: "unauthorized" });
        try { return text(response, 200, prometheusMetrics(await options.metricsProvider(), httpMetrics.snapshot())); }
        catch { return text(response, 503, "# metrics unavailable\n"); }
      }
      if (request.method === "GET" && requestUrl.pathname === "/.well-known/oauth-protected-resource/mcp") return json(response, 200, metadata(config));
      if (requestUrl.pathname !== "/mcp") return json(response, 404, { error: "not found" });
      if (request.method === "GET") return json(response, 405, { error: "SSE is not enabled" }, { Allow: "POST" });
      if (request.method !== "POST") return json(response, 405, { error: "method not allowed" }, { Allow: "POST" });
      if (!jsonContentType(request.headers["content-type"])) return json(response, 415, { error: "MCP Content-Type must be application/json" });
      if (!validOrigin(request, config)) return json(response, 403, { error: "origin is not allowed" });
      const headerProtocolVersion = request.headers["mcp-protocol-version"];
      if (headerProtocolVersion && (typeof headerProtocolVersion !== "string" || !PROTOCOL_VERSIONS.has(headerProtocolVersion))) return json(response, 400, { error: "unsupported MCP protocol version" });
      const accept = request.headers.accept;
      if (typeof accept !== "string" || !accept.includes("application/json") || !accept.includes("text/event-stream")) return json(response, 406, { error: "MCP Accept header is required" });
      const principal = await verifyAuthorization(request.headers.authorization);
      if (options.rateLimiter && !await options.rateLimiter.consume(principal.subject)) return json(response, 429, { error: "rate limit exceeded" }, { "Retry-After": String(config.rateLimit?.windowSeconds || 60) });
      const rawBody = await requestBody(request);
      let body;
      try { body = JSON.parse(rawBody); } catch { return json(response, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json(response, 400, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "invalid request" } });
      const protocolVersion = requestProtocolVersion(request, body);
      if (protocolVersion !== undefined && (typeof protocolVersion !== "string" || !PROTOCOL_VERSIONS.has(protocolVersion))) return json(response, 400, { error: "unsupported MCP protocol version" });
      if (!validLatestRequestMeta(body, protocolVersion)) return json(response, 400, { jsonrpc: "2.0", id: body.id ?? null, error: { code: -32600, message: "invalid MCP request metadata" } });
      if (!routingHeadersMatch(request, body, protocolVersion)) return json(response, 400, { jsonrpc: "2.0", id: body.id ?? null, error: { code: -32001, message: "MCP routing headers do not match the request" } });
      if (TASK_METHODS.has(body.method) && !taskRoutingHeadersMatch(request, body)) return json(response, 400, { jsonrpc: "2.0", id: body.id ?? null, error: { code: -32600, message: "invalid task routing headers" } });
      const requestTraceParent = protocolVersion === LATEST_MCP_PROTOCOL_VERSION ? traceParentFromMeta(body.params?._meta) : traceParentFromHeader(request.headers.traceparent);
      const base = settings({ ...environment, COMMON_TOOLS_WORKSPACE: config.workspaceRoot || environment.COMMON_TOOLS_WORKSPACE, COMMON_TOOLS_STATE: config.stateRoot || environment.COMMON_TOOLS_STATE, COMMON_TOOLS_OWNER: principal.subject });
      const responseBody = config.backend === "postgres-redis-s3" && TEAM_METHODS.has(body.method)
        ? await handleTeamMcp(body, { principal, services: options.teamServices, requireProjectRbac: config.requireProjectRbac, enabledCapabilities: config.enabledCapabilities, traceParent: requestTraceParent, protocolVersion: protocolVersion || "2025-11-25", supportedVersions: [...PROTOCOL_VERSIONS], tasksEnabled: supportsTasksProtocol(protocolVersion) })
        : handle(body, { ...base, authorizedCapabilities: principal.capabilities, protocolVersion });
      if (body.id === undefined) {
        emitTrace(options.traceExporter, { method: body.method, statusCode: 202, traceParent: requestTraceParent, startedAt, endedAt: Date.now() });
        return json(response, 202, undefined);
      }
      emitTrace(options.traceExporter, { method: body.method, statusCode: 200, traceParent: requestTraceParent, startedAt, endedAt: Date.now() });
      return json(response, 200, latestResultContract(cacheableResult(responseBody, body, protocolVersion), protocolVersion));
    } catch (error) {
      if (!response.headersSent && error instanceof Error && /token|OIDC|authorization|claims|signing key|signature/.test(error.message)) return json(response, 401, { error: "unauthorized" }, { "WWW-Authenticate": challenge });
      if (!response.headersSent && error instanceof Error && error.message === "request body is too large") return json(response, 413, { error: error.message });
      if (!response.headersSent) return json(response, 400, { error: "invalid request" });
      response.destroy();
    }
  });
}

module.exports = { CAPABILITY_SCOPES, LATEST_MCP_PROTOCOL_VERSION, OIDC_REQUEST_TIMEOUT_MS, cacheableResult, createHttpMetrics, createOidcVerifier, createRemoteMcpServer, emitTrace, expectedMcpName, fetchOidcResponse, jsonContentType, latestResultContract, loadRemoteConfig, metadata, metricsTokenMatches, oidcDiscoveryUrl, parseTeamCapabilities, readinessStatus, prometheusMetrics, routingHeadersMatch, traceParentFromHeader, traceParentFromMeta, validLatestRequestMeta, verifyOidcDiscovery };
