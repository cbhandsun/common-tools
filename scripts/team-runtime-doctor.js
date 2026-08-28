#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const http = require("node:http");
const https = require("node:https");

const MAX_DOCKER_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_JSON_LINE_BYTES = 128 * 1024;
const MAX_METADATA_BYTES = 16 * 1024;
const CODEX_NATIVE_LOOPBACK_REDIRECT_URI = "http://127.0.0.1:43123/callback/common-tools-mcp";
const DEFAULT_GATEWAY_URL = "http://127.0.0.1:54000";
const CORE_SERVICES = Object.freeze(["postgres", "redis", "minio", "keycloak", "remote-mcp", "remote-mcp-gateway"]);
const ALL_SERVICES = Object.freeze([...CORE_SERVICES, "image-to-editable-worker", "ppt-create-worker", "ppt-improve-worker", "ppt-quality-worker", "project-audit-worker", "team-retention"]);
const HEALTHY_SERVICES = new Set(["postgres", "redis", "minio", "keycloak", "remote-mcp"]);

function assertProject(value) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(value)) throw new Error("project is invalid");
  return value;
}
function parsePositiveInteger(value, field) {
  if (typeof value !== "string" || !/^\d{1,5}$/.test(value)) throw new Error(`${field} is invalid`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 100 || parsed > 60000) throw new Error(`${field} is invalid`);
  return parsed;
}
function parseExpectedCapabilities(value) {
  if (value === undefined) return Object.freeze([]);
  if (typeof value !== "string" || !value) throw new Error("expected capabilities are invalid");
  const capabilities = value.split(",").map((item) => item.trim());
  if (!capabilities.length || capabilities.some((capability) => !/^[a-z][a-z0-9-]{0,63}$/.test(capability)) || new Set(capabilities).size !== capabilities.length) throw new Error("expected capabilities are invalid");
  return Object.freeze([...capabilities].sort());
}
function isLoopbackHost(hostname) { return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1"; }
function parseGatewayUrl(value, allowRemote) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("gateway URL is invalid"); }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== "/" && parsed.pathname !== "")) throw new Error("gateway URL is invalid");
  if (!isLoopbackHost(parsed.hostname) && (!allowRemote || parsed.protocol !== "https:")) throw new Error("remote gateway URL requires --allow-remote and HTTPS");
  return parsed;
}
function parseArguments(argv) {
  const options = { project: "deploy", scope: "all", gatewayUrl: DEFAULT_GATEWAY_URL, timeoutMs: 5000, allowRemote: false, expectedCapabilities: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--allow-remote") { options.allowRemote = true; continue; }
    const field = { "--project": "project", "--scope": "scope", "--gateway-url": "gatewayUrl", "--timeout-ms": "timeoutMs", "--expected-capabilities": "expectedCapabilities" }[argument];
    if (!field) throw new Error(`unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (typeof value !== "string" || !value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    options[field] = value;
    index += 1;
  }
  options.project = assertProject(options.project);
  if (options.scope !== "core" && options.scope !== "all") throw new Error("scope is invalid");
  options.timeoutMs = parsePositiveInteger(String(options.timeoutMs), "timeout");
  options.expectedCapabilities = parseExpectedCapabilities(options.expectedCapabilities);
  options.gatewayUrl = parseGatewayUrl(options.gatewayUrl, options.allowRemote).toString().replace(/\/$/, "");
  return Object.freeze(options);
}
function metadataCapabilities(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.scopes_supported) || value.scopes_supported.length > 64) return null;
  const capabilities = [];
  for (const scope of value.scopes_supported) {
    if (typeof scope !== "string" || scope.length > 128) return null;
    const match = /^common-tools:capability:([a-z][a-z0-9-]{0,63})$/.exec(scope);
    if (match) capabilities.push(match[1]);
  }
  if (new Set(capabilities).size !== capabilities.length) return null;
  return Object.freeze(capabilities.sort());
}
function metadataAuthorizationServer(value, gatewayOrigin) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.authorization_servers) || value.authorization_servers.length !== 1 || typeof gatewayOrigin !== "string") return null;
  const issuer = value.authorization_servers[0];
  if (typeof issuer !== "string" || issuer.length > 256) return null;
  try {
    const parsed = new URL(issuer);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.origin !== gatewayOrigin || !/^\/id\/realms\/[a-z0-9_-]{1,64}$/i.test(parsed.pathname)) return null;
    return parsed.toString().replace(/\/$/, "");
  } catch { return null; }
}
function runDocker(args, commandRunner = childProcess.spawnSync) {
  const result = commandRunner("docker", args, { encoding: "utf8", windowsHide: true, shell: false });
  const output = result && typeof result.stdout === "string" ? result.stdout : "";
  if (!result || result.error || result.status !== 0 || Buffer.byteLength(output, "utf8") > MAX_DOCKER_OUTPUT_BYTES) throw new Error("Docker Compose status inspection failed");
  return output;
}
function normalizeServiceRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Docker Compose status is invalid");
  const service = typeof value.Service === "string" ? value.Service : "";
  const state = typeof value.State === "string" ? value.State.toLowerCase() : "";
  const health = typeof value.Health === "string" ? value.Health.toLowerCase() : "";
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(service) || !/^[a-z-]{1,32}$/.test(state) || (health && !/^[a-z-]{1,32}$/.test(health))) throw new Error("Docker Compose status is invalid");
  return Object.freeze({ service, state, health });
}
function parseComposeServices(output) {
  if (typeof output !== "string") throw new Error("Docker Compose status is invalid");
  const lines = output.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0 || lines.length > 128) throw new Error("Docker Compose status is invalid");
  return Object.freeze(lines.map((line) => {
    if (Buffer.byteLength(line, "utf8") > MAX_JSON_LINE_BYTES) throw new Error("Docker Compose status is invalid");
    try { return normalizeServiceRecord(JSON.parse(line)); } catch (error) { if (error instanceof Error && error.message === "Docker Compose status is invalid") throw error; throw new Error("Docker Compose status is invalid", { cause: error }); }
  }));
}
function inspectComposeServices(project, { commandRunner = childProcess.spawnSync } = {}) {
  return parseComposeServices(runDocker(["compose", "-p", assertProject(project), "ps", "--format", "json"], commandRunner));
}
function probeGateway(gatewayUrl, timeoutMs) {
  const target = parseGatewayUrl(gatewayUrl, true);
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve) => {
    const request = client.request({ protocol: target.protocol, hostname: target.hostname, port: target.port || undefined, method: "GET", path: "/readyz", timeout: timeoutMs, headers: { Accept: "application/json" } }, (response) => { response.resume(); resolve(Object.freeze({ status: response.statusCode === 200 ? 200 : 0 })); });
    request.once("timeout", () => request.destroy());
    request.once("error", () => resolve(Object.freeze({ status: 0 })));
    request.end();
  });
}
function probeGatewayMetadata(gatewayUrl, timeoutMs) {
  const target = parseGatewayUrl(gatewayUrl, true);
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(Object.freeze(value)); } };
    const request = client.request({ protocol: target.protocol, hostname: target.hostname, port: target.port || undefined, method: "GET", path: "/.well-known/oauth-protected-resource/mcp", timeout: timeoutMs, headers: { Accept: "application/json" } }, (response) => {
      if (response.statusCode !== 200) { response.resume(); finish({ status: 0, capabilities: null }); return; }
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_METADATA_BYTES) { response.destroy(); finish({ status: 0, capabilities: null }); return; }
        chunks.push(chunk);
      });
      response.once("error", () => finish({ status: 0, capabilities: null }));
      response.once("end", () => {
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          finish({ status: 200, capabilities: metadataCapabilities(value), authorizationServer: metadataAuthorizationServer(value, target.origin) });
        }
        catch { finish({ status: 0, capabilities: null }); }
      });
    });
    request.once("timeout", () => request.destroy());
    request.once("error", () => finish({ status: 0, capabilities: null }));
    request.end();
  });
}
function probeNativeLoopbackAuthorization(issuer, timeoutMs) {
  let target;
  try {
    const parsed = new URL(issuer);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || !/^\/id\/realms\/[a-z0-9_-]{1,64}$/i.test(parsed.pathname)) throw new Error("issuer is invalid");
    parsed.pathname = `${parsed.pathname}/protocol/openid-connect/auth`;
    parsed.searchParams.set("client_id", "common-tools-mcp");
    parsed.searchParams.set("response_type", "code");
    parsed.searchParams.set("scope", "openid");
    parsed.searchParams.set("code_challenge", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    parsed.searchParams.set("code_challenge_method", "S256");
    parsed.searchParams.set("redirect_uri", CODEX_NATIVE_LOOPBACK_REDIRECT_URI);
    target = parsed;
  } catch { return Promise.resolve(Object.freeze({ verified: false })); }
  const client = https;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(Object.freeze(value)); } };
    const request = client.request({ protocol: target.protocol, hostname: target.hostname, port: target.port || undefined, method: "GET", path: `${target.pathname}${target.search}`, timeout: timeoutMs, headers: { Accept: "text/html" } }, (response) => {
      response.resume();
      finish({ verified: response.statusCode >= 200 && response.statusCode < 400 });
    });
    request.once("timeout", () => request.destroy());
    request.once("error", () => finish({ verified: false }));
    request.end();
  });
}
function probeMcpAuthorization(gatewayUrl, timeoutMs) {
  const target = parseGatewayUrl(gatewayUrl, true);
  const client = target.protocol === "https:" ? https : http;
  const expectedResourceMetadata = `${target.origin}/.well-known/oauth-protected-resource/mcp`;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(Object.freeze(value)); } };
    const request = client.request({ protocol: target.protocol, hostname: target.hostname, port: target.port || undefined, method: "POST", path: "/mcp", timeout: timeoutMs, headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json", "Content-Length": "2" } }, (response) => {
      response.resume();
      const header = response.headers["www-authenticate"];
      const challenge = Array.isArray(header) ? header[0] : header;
      const match = typeof challenge === "string" ? /(?:^|[, ]+)resource_metadata="([^"]+)"/.exec(challenge) : null;
      const resourceMetadata = match?.[1] || null;
      finish({ status: response.statusCode === 401 ? 401 : 0, resourceMetadata, verified: response.statusCode === 401 && resourceMetadata === expectedResourceMetadata });
    });
    request.once("timeout", () => request.destroy());
    request.once("error", () => finish({ status: 0, resourceMetadata: null, verified: false }));
    request.end("{}");
  });
}
function summarizeServices(records, expectedServices) {
  const byService = new Map();
  for (const record of records) byService.set(record.service, [...(byService.get(record.service) || []), record]);
  const expected = expectedServices.map((service) => {
    const instances = byService.get(service) || [];
    return Object.freeze({ service, instances: instances.length, running: instances.length > 0 && instances.every((record) => record.state === "running"), healthOk: !HEALTHY_SERVICES.has(service) || (instances.length > 0 && instances.every((record) => record.health === "healthy")) });
  });
  const observed = [...byService.values()].flat().map((record) => Object.freeze({ service: record.service, state: record.state, health: record.health || null })).sort((left, right) => left.service.localeCompare(right.service));
  return Object.freeze({ expected: Object.freeze(expected), observed: Object.freeze(observed) });
}
async function runTeamRuntimeDoctor(options, { commandRunner = childProcess.spawnSync, gatewayProbe = probeGateway, gatewayMetadataProbe = probeGatewayMetadata, mcpAuthorizationProbe = probeMcpAuthorization, nativeLoopbackProbe = probeNativeLoopbackAuthorization } = {}) {
  const normalized = parseArguments(["--project", options.project, "--scope", options.scope, "--gateway-url", options.gatewayUrl, "--timeout-ms", String(options.timeoutMs), ...(options.allowRemote ? ["--allow-remote"] : []), ...(options.expectedCapabilities?.length ? ["--expected-capabilities", options.expectedCapabilities.join(",")] : [])]);
  const expectedServices = normalized.scope === "all" ? ALL_SERVICES : CORE_SERVICES;
  const services = summarizeServices(inspectComposeServices(normalized.project, { commandRunner }), expectedServices);
  const gateway = await gatewayProbe(normalized.gatewayUrl, normalized.timeoutMs);
  const gatewayReady = Boolean(gateway && gateway.status === 200);
  const metadata = normalized.expectedCapabilities.length || normalized.allowRemote ? await gatewayMetadataProbe(normalized.gatewayUrl, normalized.timeoutMs) : null;
  const advertisedCapabilities = metadata?.status === 200 && Array.isArray(metadata.capabilities) ? metadata.capabilities : null;
  const expectedCapabilitiesAvailable = !normalized.expectedCapabilities.length || (advertisedCapabilities !== null && normalized.expectedCapabilities.every((capability) => advertisedCapabilities.includes(capability)));
  const authorization = normalized.allowRemote ? await mcpAuthorizationProbe(normalized.gatewayUrl, normalized.timeoutMs) : null;
  const oauthChallengeVerified = authorization === null || authorization.verified === true;
  const nativeLoopback = normalized.allowRemote ? await nativeLoopbackProbe(metadata?.authorizationServer, normalized.timeoutMs) : null;
  const nativeLoopbackRedirectVerified = nativeLoopback === null || nativeLoopback.verified === true;
  return Object.freeze({ healthy: gatewayReady && expectedCapabilitiesAvailable && oauthChallengeVerified && nativeLoopbackRedirectVerified && services.expected.every((service) => service.running && service.healthOk), project: normalized.project, scope: normalized.scope, gateway: Object.freeze({ url: normalized.gatewayUrl, ready: gatewayReady, expectedCapabilities: normalized.expectedCapabilities, advertisedCapabilities, expectedCapabilitiesAvailable, oauthChallenge: authorization ? Object.freeze({ verified: oauthChallengeVerified, resourceMetadata: authorization.resourceMetadata || null }) : null, nativeLoopbackRedirect: nativeLoopback ? Object.freeze({ verified: nativeLoopbackRedirectVerified }) : null }), services });
}
if (require.main === module) {
  (async () => {
    try { const result = await runTeamRuntimeDoctor(parseArguments(process.argv.slice(2))); process.stdout.write(`${JSON.stringify(result)}\n`); if (!result.healthy) process.exitCode = 1; }
    catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "team runtime doctor failed"}\n`); process.exitCode = 1; }
  })();
}
module.exports = { ALL_SERVICES, CODEX_NATIVE_LOOPBACK_REDIRECT_URI, CORE_SERVICES, inspectComposeServices, metadataAuthorizationServer, metadataCapabilities, parseArguments, parseComposeServices, parseExpectedCapabilities, parseGatewayUrl, probeGatewayMetadata, probeMcpAuthorization, probeNativeLoopbackAuthorization, runTeamRuntimeDoctor, summarizeServices };
