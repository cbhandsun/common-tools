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

function projectId(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{2,63}$/.test(value)) throw new Error("remote canary project ID is invalid");
  return value;
}

function inputObjectKey(value) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9._/-]{0,511}$/.test(value) || value.includes("//") || value.includes("..") || !/^owners\/[a-f0-9]{64}\/inputs\/.+/.test(value)) throw new Error("remote canary input object key is invalid");
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
    projectId: projectId(environment.COMMON_TOOLS_CANARY_PROJECT_ID),
    inputObjectKey: inputObjectKey(environment.COMMON_TOOLS_CANARY_INPUT_OBJECT_KEY),
    tokens: Object.freeze(tokens),
    timeoutMs: 8000
  });
}

async function boundedJson(response) {
  if (typeof response?.body?.getReader !== "function") throw new Error("remote canary response is invalid");
  const reader = response.body.getReader();
  let complete = false;
  try {
    const declared = response.headers?.get?.("content-length");
    if (declared != null && !/^[0-9]{1,20}$/.test(declared)) throw new Error("remote canary response is invalid");
    if (declared != null && Number(declared) > MAX_RESPONSE_BYTES) throw new Error("remote canary response is too large");
    const bytes = Buffer.alloc(MAX_RESPONSE_BYTES);
    let length = 0; let reads = 0;
    while (true) {
      if (++reads > MAX_RESPONSE_BYTES + 1) throw new Error("remote canary response is invalid");
      const chunk = await reader.read().catch(() => { throw new Error("remote canary response is invalid"); });
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) throw new Error("remote canary response is invalid");
      if (chunk.value.byteLength > MAX_RESPONSE_BYTES - length) throw new Error("remote canary response is too large");
      bytes.set(chunk.value, length);
      length += chunk.value.byteLength;
    }
    let parsed;
    try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length))); }
    catch { throw new Error("remote canary response is invalid"); }
    complete = true;
    return parsed;
  } finally {
    // A failed read stays failed even if transport cleanup rejects or stalls.
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
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

function isCapabilityAuthorizationDenial(response) {
  return response.status === 200
    && response.body?.result?.isError === true
    && Array.isArray(response.body.result.content)
    && response.body.result.content.some((item) => item?.type === "text" && item.text === "capability is not authorized for this principal");
}

function jobArguments(options, capabilityName, idempotencyKey) {
  return { capability: capabilityName, projectId: options.projectId, inputObjectKey: options.inputObjectKey, idempotencyKey };
}

async function runRemoteAccessCanary(options, fetchImpl = globalThis.fetch) {
  if (!options || typeof options !== "object" || typeof fetchImpl !== "function" || !REQUIRED_TOKEN_NAMES.every((name) => typeof options.tokens?.[name] === "string") || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 60000) throw new TypeError("remote canary configuration is invalid");
  const validated = { ...options, origin: httpsOrigin(options.origin), capability: capability(options.capability), disabledCapability: capability(options.disabledCapability), projectId: projectId(options.projectId), inputObjectKey: inputObjectKey(options.inputObjectKey) };
  const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "common-tools-negative-canary", version: "1" } } };
  const cases = [];
  for (const [name, token] of [["anonymous", null], ["malformed", "malformed-fixed-token"], ["expired", options.tokens.expired], ["wrongIssuer", options.tokens.wrongIssuer], ["wrongAudience", options.tokens.wrongAudience]]) {
    const response = await request(fetchImpl, validated.origin, token, initialize, options.timeoutMs);
    cases.push(caseResult(name, response.status, 401, response.status === 401));
  }
  const valid = await request(fetchImpl, validated.origin, options.tokens.valid, initialize, options.timeoutMs);
  cases.push(caseResult("valid", valid.status, 200, valid.status === 200 && valid.body?.result?.serverInfo?.name === "common-tools"));
  const missingScope = await request(fetchImpl, validated.origin, options.tokens.missingScope, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_team_job", arguments: jobArguments(validated, validated.capability, "negative-canary-missing-scope") } }, options.timeoutMs);
  cases.push(caseResult("missingScope", missingScope.status, 200, isCapabilityAuthorizationDenial(missingScope)));
  const disabled = await request(fetchImpl, validated.origin, options.tokens.valid, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "create_team_job", arguments: jobArguments(validated, validated.disabledCapability, "negative-canary-disabled-capability") } }, options.timeoutMs);
  cases.push(caseResult("disabledCapability", disabled.status, 200, isCapabilityAuthorizationDenial(disabled)));
  const passed = cases.every((entry) => entry.passed);
  return Object.freeze({ schemaVersion: 1, capturedAt: new Date().toISOString(), origin: validated.origin, capability: validated.capability, disabledCapability: validated.disabledCapability, passed, cases: Object.freeze(cases) });
}

module.exports = { MAX_RESPONSE_BYTES, REQUIRED_TOKEN_NAMES, bearer, boundedJson, canaryOptions, capability, httpsOrigin, inputObjectKey, isCapabilityAuthorizationDenial, projectId, runRemoteAccessCanary };
