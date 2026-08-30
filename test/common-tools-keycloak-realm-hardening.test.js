"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { CLOSED_REALM_POLICY, keycloakRealmOptions, policySnapshot, realmPolicyMatches, safeRealmEvidence, synchronizeClosedRealm } = require("../packages/cli/keycloak-realm-hardening");

function response(body) { return { ok: true, async json() { return structuredClone(body); } }; }

function keycloakRealmFetch({ realm = {}, userCount = 1, identityProviders = [] } = {}) {
  let current = { realm: "common-tools", ...realm };
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    const method = options.method || "GET";
    calls.push({ url: target, method, body: options.body });
    if (target.endsWith("/realms/master/protocol/openid-connect/token")) return response({ access_token: "temporary-test-token" });
    if (target.endsWith("/users/count")) return response(userCount);
    if (target.endsWith("/identity-provider/instances")) return response(identityProviders);
    if (target.endsWith("/admin/realms/common-tools")) {
      if (method === "GET") return response(current);
      if (method === "PUT") { current = JSON.parse(options.body); return { ok: true }; }
    }
    throw new Error("unexpected Keycloak URL");
  };
  return { calls, fetchImpl, current: () => current };
}

const credentials = { baseUrl: "http://127.0.0.1:58080", realm: "common-tools", adminUsername: "local-admin", adminPassword: "not-logged" };

test("closed Keycloak realm policy is exact and rejects empty, invalid, and provider-enabled states", () => {
  assert.equal(realmPolicyMatches(CLOSED_REALM_POLICY, 0), true);
  assert.equal(realmPolicyMatches({ ...CLOSED_REALM_POLICY, registrationAllowed: true }, 0), false);
  assert.equal(realmPolicyMatches(CLOSED_REALM_POLICY, 1), false);
  assert.equal(realmPolicyMatches(null, 0), false);
  assert.deepEqual(policySnapshot(CLOSED_REALM_POLICY), CLOSED_REALM_POLICY);
});

test("Keycloak realm check is read-only and returns only redacted aggregate evidence", async () => {
  const mock = keycloakRealmFetch({ realm: { ...CLOSED_REALM_POLICY }, userCount: 2 });
  const result = await synchronizeClosedRealm({ ...credentials, fetchImpl: mock.fetchImpl });
  assert.equal(result.status, "current");
  assert.equal(result.userCount, 2);
  assert.equal(result.identityProviderCount, 0);
  assert.deepEqual(Object.keys(result).sort(), ["capturedAt", "changed", "identityProviderCount", "policy", "realm", "schemaVersion", "status", "userCount"]);
  assert.equal(mock.calls.some((call) => call.method === "PUT"), false);
  assert.doesNotMatch(JSON.stringify(result), /temporary-test-token|not-logged|authorization/i);
});

test("Keycloak realm apply snapshots bounded fields, hardens drift, verifies, and writes exclusive evidence", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-keycloak-realm-"));
  try {
    const backupFile = path.join(temporary, "before.json");
    const evidenceFile = path.join(temporary, "evidence.json");
    const mock = keycloakRealmFetch({ realm: { registrationAllowed: true, smtpServer: { password: "must-not-leak" } }, userCount: 3 });
    const result = await synchronizeClosedRealm({ ...credentials, apply: true, backupFile, evidenceFile, fetchImpl: mock.fetchImpl });
    assert.equal(result.status, "updated");
    assert.equal(realmPolicyMatches(mock.current(), 0), true);
    const backup = JSON.parse(fs.readFileSync(backupFile, "utf8"));
    assert.equal(backup.policy.registrationAllowed, true);
    assert.equal(Object.prototype.hasOwnProperty.call(backup, "smtpServer"), false);
    assert.doesNotMatch(fs.readFileSync(backupFile, "utf8"), /must-not-leak/);
    assert.deepEqual(JSON.parse(fs.readFileSync(evidenceFile, "utf8")), result);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test("Keycloak realm apply refuses destructive identity-provider removal and missing backup", async () => {
  const withProvider = keycloakRealmFetch({ realm: { ...CLOSED_REALM_POLICY }, identityProviders: [{ alias: "external" }] });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-keycloak-realm-"));
  try {
    await assert.rejects(() => synchronizeClosedRealm({ ...credentials, apply: true, backupFile: path.join(temporary, "before.json"), fetchImpl: withProvider.fetchImpl }), /removed explicitly/);
    assert.equal(withProvider.calls.some((call) => call.method === "PUT"), false);
    const drift = keycloakRealmFetch({ realm: { registrationAllowed: true } });
    await assert.rejects(() => synchronizeClosedRealm({ ...credentials, apply: true, fetchImpl: drift.fetchImpl }), /backup-file/);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test("Keycloak realm options validate destinations and never accept missing credentials as evidence input", () => {
  const environment = { COMMON_TOOLS_KEYCLOAK_ADMIN: "local-admin", COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD: "not-logged", COMMON_TOOLS_KEYCLOAK_PORT: "58080" };
  assert.equal(keycloakRealmOptions({}, environment).realm, "common-tools");
  assert.throws(() => keycloakRealmOptions({ apply: "true" }, environment), /--apply/);
  assert.throws(() => keycloakRealmOptions({ "evidence-file": "evidence.txt" }, environment), /evidence/);
  assert.throws(() => safeRealmEvidence({ realm: "common-tools", userCount: -1, identityProviderCount: 0, status: "current", changed: false }), /evidence/);
});
