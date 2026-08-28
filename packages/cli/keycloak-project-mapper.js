"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PROJECT_MAPPER_NAME = "common-tools-project-membership";
const PROJECT_MAPPER_CONFIG = Object.freeze({
  "user.attribute": "common_tools_projects",
  "claim.name": "common_tools_projects",
  "jsonType.label": "JSON",
  multivalued: "false",
  "access.token.claim": "true",
  "id.token.claim": "false",
  "userinfo.token.claim": "false",
  "introspection.token.claim": "true"
});
// Keycloak's special native-loopback entry accepts a random port but not a
// client-generated callback path. Codex uses both, so retain the exact native
// entry and add a trailing wildcard constrained to the 127.0.0.1 host.
const MCP_NATIVE_LOOPBACK_REDIRECT_URIS = Object.freeze(["http://127.0.0.1", "http://127.0.0.1:*"]);
// Codex validates the issuer returned by the authorization response. Keep this
// optional Keycloak parameter enabled for the public native client.
const MCP_ISSUER_RESPONSE_ATTRIBUTE = "exclude.issuer.from.auth.response";
const MCP_ISSUER_RESPONSE_VALUE = "false";
const MCP_OPTIONAL_CLIENT_SCOPE_NAMES = Object.freeze([
  "offline_access",
  "common-tools:capability:project-audit",
  "common-tools:capability:image-to-editable",
  "common-tools:capability:ppt-quality",
  "common-tools:capability:ppt-improve",
  "common-tools:capability:ppt-create"
]);

function mapperDefinition() {
  return {
    name: PROJECT_MAPPER_NAME,
    protocol: "openid-connect",
    protocolMapper: "oidc-usermodel-attribute-mapper",
    config: { ...PROJECT_MAPPER_CONFIG }
  };
}

function assertNonEmptyString(value, name, maxLength = 512) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`${name} is invalid`);
  return value.trim();
}

function localKeycloakBaseUrl(value) {
  const text = assertNonEmptyString(value, "Keycloak base URL");
  let parsed;
  try { parsed = new URL(text); } catch { throw new Error("Keycloak base URL is invalid"); }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || !["/", "", "/id", "/id/"].includes(parsed.pathname)) throw new Error("Keycloak base URL is invalid");
  const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback.has(parsed.hostname))) throw new Error("Keycloak base URL must use HTTPS or loopback HTTP");
  return parsed.href.replace(/\/$/, "");
}

function realmName(value) {
  const text = assertNonEmptyString(value, "Keycloak realm", 128);
  if (!/^[A-Za-z0-9._-]+$/.test(text)) throw new Error("Keycloak realm is invalid");
  return text;
}

function backupPath(value, cwd = process.cwd()) {
  const text = assertNonEmptyString(value, "Keycloak mapper backup file", 4096);
  const target = path.resolve(cwd, text);
  if (path.extname(target).toLowerCase() !== ".json" || !fs.existsSync(path.dirname(target)) || fs.existsSync(target)) throw new Error("Keycloak mapper backup file is invalid");
  return target;
}

function mapperMatches(mapper) {
  if (!mapper || typeof mapper !== "object" || Array.isArray(mapper)) return false;
  if (mapper.name !== PROJECT_MAPPER_NAME || mapper.protocol !== "openid-connect" || mapper.protocolMapper !== "oidc-usermodel-attribute-mapper") return false;
  const config = mapper.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return false;
  const expected = Object.entries(PROJECT_MAPPER_CONFIG);
  return Object.keys(config).length === expected.length && expected.every(([key, value]) => config[key] === value);
}

function safeMapperSnapshot(mapper) {
  if (!mapper || typeof mapper !== "object" || Array.isArray(mapper)) return null;
  const definition = mapperDefinition();
  return {
    id: typeof mapper.id === "string" && /^[A-Za-z0-9-]{1,128}$/.test(mapper.id) ? mapper.id : null,
    name: definition.name,
    protocol: definition.protocol,
    protocolMapper: definition.protocolMapper,
    config: Object.fromEntries(Object.keys(PROJECT_MAPPER_CONFIG).map((key) => [key, mapper.config?.[key] ?? null]))
  };
}

function writeSnapshot(target, { realm, clientId, mapper }) {
  const record = { schemaVersion: 1, realm, clientId, capturedAt: new Date().toISOString(), mapper: safeMapperSnapshot(mapper) };
  fs.writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

function redirectUrisMatch(client) {
  if (!client || typeof client !== "object" || Array.isArray(client) || !Array.isArray(client.redirectUris)) return false;
  const actual = client.redirectUris.slice().sort();
  return actual.length === MCP_NATIVE_LOOPBACK_REDIRECT_URIS.length && actual.every((uri, index) => uri === MCP_NATIVE_LOOPBACK_REDIRECT_URIS[index]);
}

function clientAttributes(client) {
  if (!client || typeof client !== "object" || Array.isArray(client)) return null;
  if (client.attributes === undefined) return {};
  if (!client.attributes || typeof client.attributes !== "object" || Array.isArray(client.attributes)) return null;
  return client.attributes;
}

function mcpClientConfigurationMatches(client) {
  const attributes = clientAttributes(client);
  return redirectUrisMatch(client) && attributes !== null && attributes[MCP_ISSUER_RESPONSE_ATTRIBUTE] === MCP_ISSUER_RESPONSE_VALUE;
}

function validClientScope(scope) {
  return Boolean(scope && typeof scope === "object" && !Array.isArray(scope) && typeof scope.id === "string" && /^[A-Za-z0-9-]{1,128}$/.test(scope.id) && typeof scope.name === "string" && scope.name.length > 0 && scope.name.length <= 256);
}

function scopeNames(scopes) {
  if (!Array.isArray(scopes) || scopes.some((scope) => !validClientScope(scope))) throw new Error("Keycloak client scope response is invalid");
  return new Set(scopes.map((scope) => scope.name));
}

function mcpClientScopeConfigurationMatches({ available, optional, defaults }) {
  const availableNames = scopeNames(available);
  const optionalNames = scopeNames(optional);
  const defaultNames = scopeNames(defaults);
  return MCP_OPTIONAL_CLIENT_SCOPE_NAMES.every((name) => availableNames.has(name) && (optionalNames.has(name) || defaultNames.has(name)));
}

function safeMcpScopeBindings(scopeState) {
  if (!scopeState || typeof scopeState !== "object" || Array.isArray(scopeState)) return [];
  const optional = scopeNames(scopeState.optional);
  const defaults = scopeNames(scopeState.defaults);
  return MCP_OPTIONAL_CLIENT_SCOPE_NAMES.map((name) => ({ name, binding: optional.has(name) ? "optional" : defaults.has(name) ? "default" : "none" }));
}

function safeClientRedirectSnapshot(client, scopeState) {
  if (!client || typeof client !== "object" || Array.isArray(client)) throw new Error("Keycloak MCP client is invalid");
  return {
    id: typeof client.id === "string" && /^[A-Za-z0-9-]{1,128}$/.test(client.id) ? client.id : null,
    clientId: client.clientId === "common-tools-mcp" ? client.clientId : null,
    redirectUris: Array.isArray(client.redirectUris) ? client.redirectUris.filter((uri) => typeof uri === "string" && uri.length <= 2048).sort() : [],
    issuerResponseExcluded: clientAttributes(client)?.[MCP_ISSUER_RESPONSE_ATTRIBUTE] ?? null,
    mcpScopeBindings: safeMcpScopeBindings(scopeState)
  };
}

function writeClientRedirectSnapshot(target, { realm, client, scopeState }) {
  const record = { schemaVersion: 1, realm, client: safeClientRedirectSnapshot(client, scopeState), capturedAt: new Date().toISOString() };
  fs.writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

async function readMcpClientScopeState(fetchImpl, clientUrl, headers) {
  const [available, optional, defaults] = await Promise.all([
    requestJson(fetchImpl, clientUrl.replace(/\/clients\/[^/]+$/, "/client-scopes"), { headers }),
    requestJson(fetchImpl, `${clientUrl}/optional-client-scopes`, { headers }),
    requestJson(fetchImpl, `${clientUrl}/default-client-scopes`, { headers })
  ]);
  scopeNames(available);
  scopeNames(optional);
  scopeNames(defaults);
  return Object.freeze({ available, optional, defaults });
}

async function requestJson(fetchImpl, url, options) {
  let response;
  try { response = await fetchImpl(url, options); } catch { throw new Error("Keycloak request failed"); }
  if (!response || !response.ok) throw new Error("Keycloak request failed");
  try { return await response.json(); } catch { throw new Error("Keycloak response is invalid"); }
}

async function requestOk(fetchImpl, url, options) {
  let response;
  try { response = await fetchImpl(url, options); } catch { throw new Error("Keycloak request failed"); }
  if (!response || !response.ok) throw new Error("Keycloak request failed");
}

async function adminAccessToken(fetchImpl, baseUrl, username, password) {
  const body = new URLSearchParams({ client_id: "admin-cli", grant_type: "password", username, password });
  const response = await requestJson(fetchImpl, `${baseUrl}/realms/master/protocol/openid-connect/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!response || typeof response.access_token !== "string" || !response.access_token) throw new Error("Keycloak admin authentication failed");
  return response.access_token;
}

async function readMcpClient(fetchImpl, baseUrl, realm, headers) {
  const encodedRealm = encodeURIComponent(realm);
  const clients = await requestJson(fetchImpl, `${baseUrl}/admin/realms/${encodedRealm}/clients?clientId=common-tools-mcp`, { headers });
  if (!Array.isArray(clients)) throw new Error("Keycloak client response is invalid");
  const summary = clients.find((entry) => entry && typeof entry === "object" && entry.clientId === "common-tools-mcp" && typeof entry.id === "string" && /^[A-Za-z0-9-]{1,128}$/.test(entry.id));
  if (!summary) throw new Error("Keycloak MCP client was not found");
  const clientUrl = `${baseUrl}/admin/realms/${encodedRealm}/clients/${encodeURIComponent(summary.id)}`;
  const client = await requestJson(fetchImpl, clientUrl, { headers });
  if (!client || typeof client !== "object" || Array.isArray(client) || client.id !== summary.id || client.clientId !== "common-tools-mcp") throw new Error("Keycloak MCP client is invalid");
  return Object.freeze({ clientUrl, client });
}

async function synchronizeProjectMapper({ baseUrl, realm, adminUsername, adminPassword, apply = false, backupFile, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== "function") throw new TypeError("Keycloak fetch implementation is invalid");
  const token = await adminAccessToken(fetchImpl, baseUrl, adminUsername, adminPassword);
  const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
  const encodedRealm = encodeURIComponent(realm);
  const clients = await requestJson(fetchImpl, `${baseUrl}/admin/realms/${encodedRealm}/clients?clientId=common-tools-mcp`, { headers });
  if (!Array.isArray(clients)) throw new Error("Keycloak client response is invalid");
  const client = clients.find((entry) => entry && typeof entry === "object" && entry.clientId === "common-tools-mcp" && typeof entry.id === "string");
  if (!client) throw new Error("Keycloak MCP client was not found");
  const mapperUrl = `${baseUrl}/admin/realms/${encodedRealm}/clients/${encodeURIComponent(client.id)}/protocol-mappers/models`;
  const readMappers = async () => {
    const result = await requestJson(fetchImpl, mapperUrl, { headers });
    if (!Array.isArray(result)) throw new Error("Keycloak mapper response is invalid");
    const matching = result.filter((entry) => entry && typeof entry === "object" && entry.name === PROJECT_MAPPER_NAME);
    if (matching.length > 1) throw new Error("Keycloak project mapper is duplicated");
    return matching[0] || null;
  };
  const current = await readMappers();
  if (mapperMatches(current)) return Object.freeze({ status: "current", changed: false });
  if (!apply) return Object.freeze({ status: current ? "drift" : "missing", changed: false });
  if (!backupFile) throw new Error("--backup-file is required before applying a Keycloak mapper change");
  writeSnapshot(backupFile, { realm, clientId: "common-tools-mcp", mapper: current });
  const definition = mapperDefinition();
  if (current) {
    if (typeof current.id !== "string" || !/^[A-Za-z0-9-]{1,128}$/.test(current.id)) throw new Error("Keycloak project mapper is invalid");
    await requestOk(fetchImpl, `${mapperUrl}/${encodeURIComponent(current.id)}`, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ ...definition, id: current.id }) });
  } else {
    await requestOk(fetchImpl, mapperUrl, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(definition) });
  }
  if (!mapperMatches(await readMappers())) throw new Error("Keycloak project mapper verification failed");
  return Object.freeze({ status: current ? "updated" : "created", changed: true });
}

async function synchronizeMcpClientRedirectUris({ baseUrl, realm, adminUsername, adminPassword, apply = false, backupFile, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== "function") throw new TypeError("Keycloak fetch implementation is invalid");
  const token = await adminAccessToken(fetchImpl, baseUrl, adminUsername, adminPassword);
  const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
  const current = await readMcpClient(fetchImpl, baseUrl, realm, headers);
  const scopeState = await readMcpClientScopeState(fetchImpl, current.clientUrl, headers);
  if (mcpClientConfigurationMatches(current.client) && mcpClientScopeConfigurationMatches(scopeState)) return Object.freeze({ status: "current", changed: false });
  if (!apply) return Object.freeze({ status: "drift", changed: false });
  if (!backupFile) throw new Error("--backup-file is required before applying a Keycloak MCP client change");
  const attributes = clientAttributes(current.client);
  if (attributes === null) throw new Error("Keycloak MCP client attributes are invalid");
  writeClientRedirectSnapshot(backupFile, { realm, client: current.client, scopeState });
  if (!mcpClientConfigurationMatches(current.client)) await requestOk(fetchImpl, current.clientUrl, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ ...current.client, redirectUris: [...MCP_NATIVE_LOOPBACK_REDIRECT_URIS], attributes: { ...attributes, [MCP_ISSUER_RESPONSE_ATTRIBUTE]: MCP_ISSUER_RESPONSE_VALUE } }) });
  const availableByName = new Map(scopeState.available.map((scope) => [scope.name, scope]));
  const associated = new Set([...scopeState.optional, ...scopeState.defaults].map((scope) => scope.name));
  for (const name of MCP_OPTIONAL_CLIENT_SCOPE_NAMES) {
    const scope = availableByName.get(name);
    if (!scope) throw new Error(`Keycloak MCP client scope is missing: ${name}`);
    if (!associated.has(name)) await requestOk(fetchImpl, `${current.clientUrl}/optional-client-scopes/${encodeURIComponent(scope.id)}`, { method: "PUT", headers });
  }
  const verified = await readMcpClient(fetchImpl, baseUrl, realm, headers);
  const verifiedScopeState = await readMcpClientScopeState(fetchImpl, current.clientUrl, headers);
  if (!mcpClientConfigurationMatches(verified.client) || !mcpClientScopeConfigurationMatches(verifiedScopeState)) throw new Error("Keycloak MCP client configuration verification failed");
  return Object.freeze({ status: "updated", changed: true });
}

function keycloakProjectMapperOptions(args = {}, environment = process.env, cwd = process.cwd()) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new TypeError("Keycloak mapper arguments are invalid");
  if (args.apply !== undefined && args.apply !== true) throw new Error("--apply must not have a value");
  const port = environment.COMMON_TOOLS_KEYCLOAK_PORT || "58080";
  if (!/^[1-9][0-9]{0,4}$/.test(port) || Number(port) > 65535) throw new Error("COMMON_TOOLS_KEYCLOAK_PORT is invalid");
  const baseUrl = localKeycloakBaseUrl(args["base-url"] || environment.COMMON_TOOLS_KEYCLOAK_BASE_URL || `http://127.0.0.1:${port}`);
  const backupFile = args["backup-file"] === undefined ? undefined : backupPath(args["backup-file"], cwd);
  return Object.freeze({
    baseUrl,
    realm: realmName(args.realm || "common-tools"),
    adminUsername: assertNonEmptyString(environment.COMMON_TOOLS_KEYCLOAK_ADMIN, "COMMON_TOOLS_KEYCLOAK_ADMIN", 128),
    adminPassword: assertNonEmptyString(environment.COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD, "COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD", 4096),
    apply: args.apply === true,
    backupFile
  });
}

async function runKeycloakProjectMapperCommand(args, environment = process.env, options = {}) {
  const input = keycloakProjectMapperOptions(args, environment, options.cwd || process.cwd());
  return synchronizeProjectMapper({ ...input, fetchImpl: options.fetchImpl || globalThis.fetch });
}

async function runKeycloakMcpClientCommand(args, environment = process.env, options = {}) {
  const input = keycloakProjectMapperOptions(args, environment, options.cwd || process.cwd());
  return synchronizeMcpClientRedirectUris({ ...input, fetchImpl: options.fetchImpl || globalThis.fetch });
}

module.exports = { MCP_ISSUER_RESPONSE_ATTRIBUTE, MCP_ISSUER_RESPONSE_VALUE, MCP_NATIVE_LOOPBACK_REDIRECT_URIS, MCP_OPTIONAL_CLIENT_SCOPE_NAMES, PROJECT_MAPPER_CONFIG, PROJECT_MAPPER_NAME, clientAttributes, keycloakProjectMapperOptions, mapperDefinition, mapperMatches, mcpClientConfigurationMatches, mcpClientScopeConfigurationMatches, redirectUrisMatch, runKeycloakMcpClientCommand, runKeycloakProjectMapperCommand, safeClientRedirectSnapshot, safeMapperSnapshot, safeMcpScopeBindings, synchronizeMcpClientRedirectUris, synchronizeProjectMapper };
