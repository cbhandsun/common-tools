"use strict";

const { CAPABILITY_SCOPES } = require("./team-mcp");

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

module.exports = { OIDC_REQUEST_TIMEOUT_MS, assertNonEmpty, loadRemoteConfig, parseTeamCapabilities };
