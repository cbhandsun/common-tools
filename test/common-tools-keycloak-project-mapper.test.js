"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { MCP_CAPABILITY_CLIENT_SCOPE_NAMES, MCP_ISSUER_RESPONSE_ATTRIBUTE, MCP_ISSUER_RESPONSE_VALUE, MCP_NATIVE_LOOPBACK_REDIRECT_URIS, MCP_OPTIONAL_CLIENT_SCOPE_NAMES, PROJECT_MAPPER_CONFIG, PROJECT_MAPPER_NAME, capabilityClientScopeDefinition, keycloakProjectMapperOptions, mapperDefinition, mapperMatches, mcpClientConfigurationMatches, mcpClientScopeConfigurationMatches, redirectUrisMatch, synchronizeMcpClientRedirectUris, synchronizeProjectMapper } = require("../packages/cli/keycloak-project-mapper");

function response(body) { return { ok: true, async json() { return body; } }; }

function keycloakFetch(initial = []) {
  const mappers = initial.map((entry) => structuredClone(entry));
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET", body: options.body });
    if (String(url).endsWith("/realms/master/protocol/openid-connect/token")) return response({ access_token: "temporary-test-token" });
    if (String(url).includes("/clients?clientId=common-tools-mcp")) return response([{ id: "client-123", clientId: "common-tools-mcp" }]);
    const mapperRoot = "/clients/client-123/protocol-mappers/models";
    if (!String(url).includes(mapperRoot)) throw new Error("unexpected Keycloak URL");
    if ((options.method || "GET") === "GET") return response(mappers);
    if ((options.method || "GET") === "POST") { mappers.push(JSON.parse(options.body)); return { ok: true }; }
    if ((options.method || "GET") === "PUT") { const replacement = JSON.parse(options.body); const index = mappers.findIndex((entry) => entry.id === replacement.id); if (index < 0) return { ok: false }; mappers[index] = replacement; return { ok: true }; }
    return { ok: false };
  };
  return { calls, fetchImpl, mappers };
}

function mcpClientFetch(redirectUris = ["http://127.0.0.1:54000/*"], attributes = {}, optionalScopeNames = MCP_OPTIONAL_CLIENT_SCOPE_NAMES, availableScopeNames = MCP_OPTIONAL_CLIENT_SCOPE_NAMES) {
  let client = { id: "client-123", clientId: "common-tools-mcp", redirectUris: [...redirectUris], attributes: { ...attributes }, publicClient: true };
  const availableScopes = availableScopeNames.map((name, index) => ({ id: `scope-${index + 1}`, name }));
  let optionalScopes = availableScopes.filter((scope) => optionalScopeNames.includes(scope.name));
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET", body: options.body });
    if (String(url).endsWith("/realms/master/protocol/openid-connect/token")) return response({ access_token: "temporary-test-token" });
    if (String(url).includes("/clients?clientId=common-tools-mcp")) return response([{ id: client.id, clientId: client.clientId }]);
    if (String(url).endsWith("/client-scopes")) {
      if ((options.method || "GET") === "GET") return response(availableScopes);
      if (options.method === "POST") {
        const definition = JSON.parse(options.body);
        if (definition.protocol !== "openid-connect" || typeof definition.name !== "string" || availableScopes.some((scope) => scope.name === definition.name)) return { ok: false };
        availableScopes.push({ id: `scope-${availableScopes.length + 1}`, name: definition.name });
        return { ok: true };
      }
    }
    if (String(url).endsWith(`/clients/${client.id}/optional-client-scopes`)) return response(optionalScopes);
    if (String(url).endsWith(`/clients/${client.id}/default-client-scopes`)) return response([]);
    if (String(url).includes(`/clients/${client.id}/optional-client-scopes/`) && options.method === "PUT") {
      const id = String(url).split("/").pop();
      const scope = availableScopes.find((entry) => entry.id === id);
      if (!scope) return { ok: false };
      optionalScopes = [...optionalScopes, scope];
      return { ok: true };
    }
    if (String(url).endsWith(`/clients/${client.id}`)) {
      if ((options.method || "GET") === "GET") return response(client);
      if ((options.method || "GET") === "PUT") { client = JSON.parse(options.body); return { ok: true }; }
    }
    throw new Error("unexpected Keycloak URL");
  };
  return { calls, fetchImpl, client: () => client, scopeState: () => ({ available: availableScopes, optional: optionalScopes, defaults: [] }) };
}

const credentials = { baseUrl: "http://127.0.0.1:58080", realm: "common-tools", adminUsername: "local-admin", adminPassword: "not-logged" };

test("Keycloak mapper options permit only safe local administration inputs", () => {
  const environment = { COMMON_TOOLS_KEYCLOAK_ADMIN: "local-admin", COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD: "not-logged", COMMON_TOOLS_KEYCLOAK_PORT: "58080" };
  assert.equal(keycloakProjectMapperOptions({}, environment).baseUrl, "http://127.0.0.1:58080");
  assert.equal(keycloakProjectMapperOptions({ "base-url": "http://127.0.0.1:58080/id" }, environment).baseUrl, "http://127.0.0.1:58080/id");
  assert.equal(keycloakProjectMapperOptions({ "base-url": "https://idp.example.test", realm: "team_1" }, environment).realm, "team_1");
  assert.throws(() => keycloakProjectMapperOptions({ "base-url": "http://idp.example.test" }, environment), /loopback HTTP/);
  assert.throws(() => keycloakProjectMapperOptions({ apply: "true" }, environment), /--apply/);
  assert.throws(() => keycloakProjectMapperOptions({ realm: "not a realm" }, environment), /realm/);
  assert.throws(() => keycloakProjectMapperOptions({}, { ...environment, COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD: "" }), /PASSWORD/);
});

test("Keycloak mapper check is read-only and distinguishes missing from drift", async () => {
  const missing = keycloakFetch();
  assert.deepEqual(await synchronizeProjectMapper({ ...credentials, fetchImpl: missing.fetchImpl }), { status: "missing", changed: false });
  assert.equal(missing.calls.some((call) => call.method !== "GET" && !call.url.endsWith("token")), false);
  const drift = keycloakFetch([{ ...mapperDefinition(), id: "mapper-123", config: { ...PROJECT_MAPPER_CONFIG, "access.token.claim": "false" } }]);
  assert.deepEqual(await synchronizeProjectMapper({ ...credentials, fetchImpl: drift.fetchImpl }), { status: "drift", changed: false });
  assert.equal(drift.calls.some((call) => (call.method === "PUT" || call.method === "POST") && call.url.includes("/protocol-mappers/models")), false);
});

test("Keycloak mapper apply writes a non-overwriting snapshot before creating and verifies the result", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-keycloak-mapper-"));
  try {
    const backupFile = path.join(temporary, "mapper-before.json");
    const mock = keycloakFetch();
    assert.deepEqual(await synchronizeProjectMapper({ ...credentials, apply: true, backupFile, fetchImpl: mock.fetchImpl }), { status: "created", changed: true });
    const snapshot = JSON.parse(fs.readFileSync(backupFile, "utf8"));
    assert.equal(snapshot.realm, "common-tools");
    assert.equal(snapshot.clientId, "common-tools-mcp");
    assert.equal(snapshot.mapper, null);
    assert.equal(mock.calls.filter((call) => call.method === "POST" && call.url.includes("/protocol-mappers/models")).length, 1);
    assert.equal(mapperMatches(mock.mappers[0]), true);
    assert.deepEqual(JSON.parse(mock.calls.find((call) => call.method === "POST" && call.url.includes("/protocol-mappers/models")).body), mapperDefinition());
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test("Keycloak mapper apply snapshots drift, updates only the fixed mapper, and rejects duplicates", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-keycloak-mapper-"));
  try {
    const oldMapper = { ...mapperDefinition(), id: "mapper-123", config: { ...PROJECT_MAPPER_CONFIG, "access.token.claim": "false", ignored: "value" } };
    const backupFile = path.join(temporary, "mapper-before.json");
    const mock = keycloakFetch([oldMapper]);
    assert.deepEqual(await synchronizeProjectMapper({ ...credentials, apply: true, backupFile, fetchImpl: mock.fetchImpl }), { status: "updated", changed: true });
    const snapshot = JSON.parse(fs.readFileSync(backupFile, "utf8"));
    assert.equal(snapshot.mapper.config["access.token.claim"], "false");
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot.mapper.config, "ignored"), false);
    const put = mock.calls.find((call) => call.method === "PUT");
    assert.ok(put);
    assert.match(put.url, /mapper-123$/);
    assert.deepEqual(JSON.parse(put.body), { ...mapperDefinition(), id: "mapper-123" });
    const duplicate = keycloakFetch([{ ...mapperDefinition(), id: "mapper-1" }, { ...mapperDefinition(), id: "mapper-2" }]);
    await assert.rejects(() => synchronizeProjectMapper({ ...credentials, fetchImpl: duplicate.fetchImpl }), /duplicated/);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test("Keycloak mapper apply refuses to mutate without a fresh snapshot path", async () => {
  const mock = keycloakFetch();
  await assert.rejects(() => synchronizeProjectMapper({ ...credentials, apply: true, fetchImpl: mock.fetchImpl }), /backup-file/);
  assert.equal(mock.calls.some((call) => (call.method === "POST" || call.method === "PUT") && call.url.includes("/protocol-mappers/models")), false);
  assert.equal(PROJECT_MAPPER_NAME, "common-tools-project-membership");
});

test("Keycloak MCP client configuration check is read-only and permits the OAuth native loopback redirect", async () => {
  assert.deepEqual(MCP_NATIVE_LOOPBACK_REDIRECT_URIS, ["http://127.0.0.1", "http://127.0.0.1:*"]);
  const current = mcpClientFetch(MCP_NATIVE_LOOPBACK_REDIRECT_URIS, { [MCP_ISSUER_RESPONSE_ATTRIBUTE]: MCP_ISSUER_RESPONSE_VALUE });
  assert.deepEqual(await synchronizeMcpClientRedirectUris({ ...credentials, fetchImpl: current.fetchImpl }), { status: "current", changed: false });
  assert.equal(current.calls.some((call) => call.method !== "GET" && !call.url.endsWith("token")), false);
  assert.equal(redirectUrisMatch(current.client()), true);
  assert.equal(mcpClientConfigurationMatches(current.client()), true);
  assert.equal(mcpClientScopeConfigurationMatches(current.scopeState()), true);
  const drift = mcpClientFetch();
  assert.deepEqual(await synchronizeMcpClientRedirectUris({ ...credentials, fetchImpl: drift.fetchImpl }), { status: "drift", changed: false });
  assert.equal(drift.calls.some((call) => call.method === "PUT"), false);
});

test("Keycloak MCP client configuration apply snapshots the old state and preserves unrelated attributes", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-keycloak-client-"));
  try {
    const backupFile = path.join(temporary, "client-before.json");
    const mock = mcpClientFetch(undefined, { "pkce.code.challenge.method": "S256", unrelated: "preserved" });
    assert.deepEqual(await synchronizeMcpClientRedirectUris({ ...credentials, apply: true, backupFile, fetchImpl: mock.fetchImpl }), { status: "updated", changed: true });
    const snapshot = JSON.parse(fs.readFileSync(backupFile, "utf8"));
    assert.deepEqual(snapshot.client, { id: "client-123", clientId: "common-tools-mcp", redirectUris: ["http://127.0.0.1:54000/*"], issuerResponseExcluded: null, mcpScopeBindings: MCP_OPTIONAL_CLIENT_SCOPE_NAMES.map((name) => ({ name, binding: "optional" })) });
    assert.deepEqual(mock.client().redirectUris, MCP_NATIVE_LOOPBACK_REDIRECT_URIS);
    assert.equal(mock.client().attributes[MCP_ISSUER_RESPONSE_ATTRIBUTE], MCP_ISSUER_RESPONSE_VALUE);
    assert.equal(mock.client().attributes.unrelated, "preserved");
    assert.equal(mock.client().publicClient, true);
    assert.equal(redirectUrisMatch(mock.client()), true);
    assert.equal(mcpClientConfigurationMatches(mock.client()), true);
    assert.equal(mcpClientScopeConfigurationMatches(mock.scopeState()), true);
    await assert.rejects(() => synchronizeMcpClientRedirectUris({ ...credentials, apply: true, fetchImpl: mcpClientFetch().fetchImpl }), /backup-file/);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test("Keycloak MCP client scope apply associates missing capability scopes without rewriting an otherwise current client", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-keycloak-client-scopes-"));
  try {
    const backupFile = path.join(temporary, "client-before.json");
    const mock = mcpClientFetch(MCP_NATIVE_LOOPBACK_REDIRECT_URIS, { [MCP_ISSUER_RESPONSE_ATTRIBUTE]: MCP_ISSUER_RESPONSE_VALUE }, []);
    assert.deepEqual(await synchronizeMcpClientRedirectUris({ ...credentials, apply: true, backupFile, fetchImpl: mock.fetchImpl }), { status: "updated", changed: true });
    assert.equal(mock.calls.some((call) => call.method === "PUT" && call.url.endsWith(`/clients/${mock.client().id}`)), false);
    assert.equal(mock.calls.filter((call) => call.method === "PUT" && call.url.includes("/optional-client-scopes/")).length, MCP_OPTIONAL_CLIENT_SCOPE_NAMES.length);
    assert.equal(mcpClientScopeConfigurationMatches(mock.scopeState()), true);
    const snapshot = JSON.parse(fs.readFileSync(backupFile, "utf8"));
    assert.deepEqual(snapshot.client.mcpScopeBindings, MCP_OPTIONAL_CLIENT_SCOPE_NAMES.map((name) => ({ name, binding: "none" })));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test("Keycloak MCP client scope apply creates only fixed missing capability scopes before association", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-keycloak-client-scope-create-"));
  try {
    const missing = "common-tools:capability:ppt-create";
    const available = MCP_OPTIONAL_CLIENT_SCOPE_NAMES.filter((name) => name !== missing);
    const backupFile = path.join(temporary, "client-before.json");
    const mock = mcpClientFetch(MCP_NATIVE_LOOPBACK_REDIRECT_URIS, { [MCP_ISSUER_RESPONSE_ATTRIBUTE]: MCP_ISSUER_RESPONSE_VALUE }, available, available);
    assert.deepEqual(await synchronizeMcpClientRedirectUris({ ...credentials, apply: true, backupFile, fetchImpl: mock.fetchImpl }), { status: "updated", changed: true });
    const creates = mock.calls.filter((call) => call.method === "POST" && call.url.endsWith("/client-scopes"));
    assert.equal(creates.length, 1);
    assert.deepEqual(JSON.parse(creates[0].body), capabilityClientScopeDefinition(missing));
    assert.equal(mcpClientScopeConfigurationMatches(mock.scopeState()), true);
    assert.equal(MCP_CAPABILITY_CLIENT_SCOPE_NAMES.includes("common-tools:capability:siyuan-note"), true);
    assert.throws(() => capabilityClientScopeDefinition("offline_access"), /invalid/);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test("Keycloak mapper CLI never prints the supplied administrator password", () => {
  const cli = path.join(__dirname, "..", "packages", "cli", "bin", "common-tools.js");
  const password = "do-not-print-this-keycloak-password";
  const result = spawnSync(process.execPath, [cli, "team", "keycloak-project-mapper", "--base-url", "http://not-loopback.example.test"], {
    encoding: "utf8",
    env: { ...process.env, COMMON_TOOLS_KEYCLOAK_ADMIN: "local-admin", COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD: password },
    windowsHide: true
  });
  assert.equal(result.status, 1);
  assert.equal(`${result.stdout}${result.stderr}`.includes(password), false);
  assert.match(result.stderr, /loopback HTTP/);
});
