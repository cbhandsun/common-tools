"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");
const { localTestUserDriftReasons, localTestUserOptions, projectMembershipAttribute, synchronizeLocalTestUser } = require("../packages/cli/keycloak-local-test-user");

function response(body) { return { ok: true, async json() { return body; } }; }

function userFetch(initialUser = null) {
  let user = initialUser ? structuredClone(initialUser) : null;
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET", body: options.body });
    if (String(url).endsWith("/realms/master/protocol/openid-connect/token")) return response({ access_token: "temporary-admin-token" });
    if (String(url).includes("/users?username=")) return response(user ? [user] : []);
    if (String(url).endsWith("/admin/realms/common-tools/users") && options.method === "POST") {
      const body = JSON.parse(options.body);
      user = { id: "user-123", ...body };
      return { ok: true };
    }
    if (String(url).endsWith("/admin/realms/common-tools/users/user-123") && options.method === "PUT") {
      user = JSON.parse(options.body);
      return { ok: true };
    }
    if (String(url).endsWith("/admin/realms/common-tools/users/user-123/reset-password") && options.method === "PUT") return { ok: true };
    throw new Error(`unexpected Keycloak URL: ${url}`);
  };
  return { calls, fetchImpl, user: () => user };
}

const optionsEnvironment = Object.freeze({
  COMMON_TOOLS_KEYCLOAK_ADMIN: "local-admin",
  COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD: "adminpw8",
  COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD: "userpw88",
  COMMON_TOOLS_KEYCLOAK_PORT: "58080"
});

test("local Keycloak test user options reject unsafe inputs and command-line secrets", () => {
  assert.equal(localTestUserOptions({ apply: true }, optionsEnvironment).username, "local-tester");
  assert.equal(localTestUserOptions({ username: "demo.user", "project-id": "deploy", role: "viewer" }, optionsEnvironment).role, "viewer");
  assert.throws(() => localTestUserOptions({ apply: "true" }, optionsEnvironment), /--apply/);
  assert.throws(() => localTestUserOptions({ "base-url": "https://idp.example.test" }, optionsEnvironment), /loopback HTTP/);
  assert.throws(() => localTestUserOptions({ username: "../bad" }, optionsEnvironment), /username/);
  assert.throws(() => localTestUserOptions({ "project-id": "bad/project" }, optionsEnvironment), /project id/);
  assert.throws(() => localTestUserOptions({ role: "owner" }, optionsEnvironment), /role/);
  assert.throws(() => localTestUserOptions({}, { ...optionsEnvironment, COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD: "short" }), /TEST_USER_PASSWORD/);
});

test("local Keycloak test user check is read-only and redacts passwords", async () => {
  const missing = userFetch();
  const result = await synchronizeLocalTestUser({
    baseUrl: "http://127.0.0.1:58080",
    realm: "common-tools",
    adminUsername: "local-admin",
    adminPassword: "adminpw8",
    username: "local-tester",
    password: "userpw88",
    projectId: "deploy",
    role: "editor",
    fetchImpl: missing.fetchImpl
  });
  assert.deepEqual(result, { status: "missing", changed: false, username: "local-tester", projectId: "deploy", role: "editor" });
  assert.equal(missing.calls.some((call) => ["POST", "PUT"].includes(call.method) && !call.url.endsWith("/token")), false);
  assert.doesNotMatch(JSON.stringify(result), /password|long-user-password|long-admin-password/i);
});

test("local Keycloak test user apply creates user, membership claim and password", async () => {
  const keycloak = userFetch();
  const result = await synchronizeLocalTestUser({
    baseUrl: "http://127.0.0.1:58080",
    realm: "common-tools",
    adminUsername: "local-admin",
    adminPassword: "adminpw8",
    username: "local-tester",
    password: "userpw88",
    projectId: "deploy",
    role: "editor",
    apply: true,
    fetchImpl: keycloak.fetchImpl
  });
  assert.equal(result.status, "created");
  assert.equal(keycloak.user().attributes.common_tools_projects[0], projectMembershipAttribute("deploy", "editor"));
  assert.equal(keycloak.calls.some((call) => call.url.endsWith("/reset-password") && call.body.includes("userpw88")), true);
  assert.doesNotMatch(JSON.stringify(result), /userpw88|adminpw8/i);
});

test("local Keycloak test user apply repairs drift without duplicating users", async () => {
  const keycloak = userFetch({ id: "user-123", username: "local-tester", enabled: false, attributes: { other: ["kept"] } });
  const result = await synchronizeLocalTestUser({
    baseUrl: "http://127.0.0.1:58080",
    realm: "common-tools",
    adminUsername: "local-admin",
    adminPassword: "adminpw8",
    username: "local-tester",
    password: "userpw88",
    projectId: "deploy",
    role: "admin",
    apply: true,
    fetchImpl: keycloak.fetchImpl
  });
  assert.equal(result.status, "updated");
  assert.equal(keycloak.calls.filter((call) => call.method === "POST" && call.url.endsWith("/users")).length, 0);
  assert.equal(keycloak.calls.every((call) => !String(call.url).includes("/users?username=") || String(call.url).includes("briefRepresentation=false")), true);
  assert.deepEqual(keycloak.user().attributes.other, ["kept"]);
  assert.equal(keycloak.user().attributes.common_tools_projects[0], projectMembershipAttribute("deploy", "admin"));
});

test("local Keycloak test user verification failure explains sanitized drift", async () => {
  assert.deepEqual(
    localTestUserDriftReasons(
      { username: "local-tester", enabled: true, attributes: { common_tools_projects: projectMembershipAttribute("deploy", "editor") } },
      { username: "local-tester", projectId: "deploy", role: "editor" }
    ),
    []
  );
  assert.deepEqual(
    localTestUserDriftReasons({ username: "local-tester", enabled: true, attributes: {} }, { username: "local-tester", projectId: "deploy", role: "editor" }),
    ["project claim count mismatch: count=0, rawType=undefined, attributeKeys=[]"]
  );
  assert.deepEqual(
    localTestUserDriftReasons(
      { username: "local-tester", enabled: true, attributes: { common_tools_projects: [projectMembershipAttribute("other", "viewer")] } },
      { username: "local-tester", projectId: "deploy", role: "editor" }
    ),
    ["project claim value mismatch"]
  );
});

test("local Keycloak test user CLI and wrapper keep passwords out of command arguments", () => {
  const root = path.resolve(__dirname, "..");
  const cli = path.join(root, "packages", "cli", "bin", "common-tools.js");
  const script = require("node:fs").readFileSync(path.join(root, "scripts", "team-keycloak-local-test-user.ps1"), "utf8");
  const result = spawnSync(process.execPath, [cli, "team", "keycloak-local-test-user", "--apply"], {
    cwd: root,
    encoding: "utf8",
    env: { PATH: process.env.PATH || "" },
    windowsHide: true
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /COMMON_TOOLS_KEYCLOAK_ADMIN/u);
  assert.match(script, /Read-Host -Prompt \$Prompt -AsSecureString/);
  assert.match(script, /COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD/);
  assert.doesNotMatch(script, /--password|--admin-password/);
  assert.match(script, /SetEnvironmentVariable\(\$name, \$originalEnvironment\[\$name\], 'Process'\)/);
});
