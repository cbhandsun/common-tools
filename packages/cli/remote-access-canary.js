"use strict";

const REQUIRED_TOKEN_NAMES = Object.freeze(["valid", "expired", "wrongIssuer", "wrongAudience", "missingScope"]);
const MAX_RESPONSE_BYTES = 16 * 1024;

function httpsOrigin(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) throw new Error("remote canary URL is invalid");
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("remote canary URL is invalid"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== "/" && parsed.pathname !== "")) throw new Error("remote canary URL must be an HTTPS origin");
  return parsed.origin;
}

function bearer(value, name) {
  if (typeof value !== "string" || value.length < 16 || value.length > 16384 || /[\r\n]/.test(value)) throw new Error(`remote canary ${name} token is invalid`);
  return value;
}

function capability(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{2,63}$/.test(value)) throw new Error("remote canary capability is invalid");
  return value;
}

function canaryOptions(environment = process.env) {
  const tokens = {
    valid: bearer(environment.COMMON_TOOLS_CANARY_VALID_TOKEN, "valid"),
    expired: bearer(environment.COMMON_TOOLS_CANARY_EXPIRED_TOKEN, "expired"),
    wrongIssuer: bearer(environment.COMMON_TOOLS_CANARY_WRONG_ISSUER_TOKEN, "wrong issuer"),
    wrongAudience: bearer(environment.COMMON_TOOLS_CANARY_WRONG_AUDIENCE_TOKEN, "wrong audience"),
    missingScope: bearer(environment.COMMON_TOOLS_CANARY_MISSING_SCOPE_TOKEN, "missing scope")
  };
  return Object.freeze({
    origin: httpsOrigin(environment.COMMON_TOOLS_CANARY_URL),
    capability: capability(environment.COMMON_TOOLS_CANARY_CAPABILITY),
    disabledCapability: capability(environment.COMMON_TOOLS_CANARY_DISABLED_CAPABILITY),
    tokens: Object.freeze(tokens),
    timeoutMs: 8000
  });
}

async function boundedJson(response) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error("remote canary response is too large");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) throw new Error("remote canary response is too large");
  try { return JSON.parse(text); } catch { throw new Error("remote canary response is invalid"); }
}

async function request(fetchImpl, origin, token, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${origin}/mcp`, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await boundedJson(response) };
  } catch { throw new Error("remote canary request failed"); }
  finally { clearTimeout(timer); }
}

function caseResult(name, actualStatus, expectedStatus, passed) {
  return Object.freeze({ name, expectedStatus, actualStatus, passed });
}

async function runRemoteAccessCanary(options, fetchImpl = globalThis.fetch) {
  if (!options || typeof options !== "object" || typeof fetchImpl !== "function" || !REQUIRED_TOKEN_NAMES.every((name) => typeof options.tokens?.[name] === "string") || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 60000) throw new TypeError("remote canary configuration is invalid");
  const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "common-tools-negative-canary", version: "1" } } };
  const cases = [];
  for (const [name, token] of [["anonymous", null], ["malformed", "malformed-fixed-token"], ["expired", options.tokens.expired], ["wrongIssuer", options.tokens.wrongIssuer], ["wrongAudience", options.tokens.wrongAudience]]) {
    const response = await request(fetchImpl, options.origin, token, initialize, options.timeoutMs);
    cases.push(caseResult(name, response.status, 401, response.status === 401));
  }
  const valid = await request(fetchImpl, options.origin, options.tokens.valid, initialize, options.timeoutMs);
  cases.push(caseResult("valid", valid.status, 200, valid.status === 200 && valid.body?.result?.serverInfo?.name === "common-tools"));
  const missingScope = await request(fetchImpl, options.origin, options.tokens.missingScope, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_team_job", arguments: { capability: options.capability, inputObjectKey: "canary/not-used", idempotencyKey: "negative-canary-missing-scope" } } }, options.timeoutMs);
  cases.push(caseResult("missingScope", missingScope.status, 200, missingScope.status === 200 && missingScope.body?.result?.isError === true));
  const disabled = await request(fetchImpl, options.origin, options.tokens.valid, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "create_team_job", arguments: { capability: options.disabledCapability, inputObjectKey: "canary/not-used", idempotencyKey: "negative-canary-disabled-capability" } } }, options.timeoutMs);
  cases.push(caseResult("disabledCapability", disabled.status, 200, disabled.status === 200 && disabled.body?.result?.isError === true));
  const passed = cases.every((entry) => entry.passed);
  return Object.freeze({ schemaVersion: 1, capturedAt: new Date().toISOString(), origin: options.origin, capability: options.capability, disabledCapability: options.disabledCapability, passed, cases: Object.freeze(cases) });
}

module.exports = { MAX_RESPONSE_BYTES, REQUIRED_TOKEN_NAMES, bearer, boundedJson, canaryOptions, capability, httpsOrigin, runRemoteAccessCanary };
