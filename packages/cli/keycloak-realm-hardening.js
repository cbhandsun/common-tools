"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { adminAccessToken, backupPath, localKeycloakBaseUrl, realmName, requestJson, requestOk } = require("./keycloak-project-mapper");

const CLOSED_REALM_POLICY = Object.freeze({
  registrationAllowed: false,
  resetPasswordAllowed: false,
  editUsernameAllowed: false,
  rememberMe: false,
  duplicateEmailsAllowed: false,
  bruteForceProtected: true,
  permanentLockout: false,
  failureFactor: 5,
  waitIncrementSeconds: 60,
  quickLoginCheckMilliSeconds: 1000,
  minimumQuickLoginWaitSeconds: 60,
  maxFailureWaitSeconds: 900,
  maxDeltaTimeSeconds: 43200,
  passwordPolicy: "length(12) and notUsername"
});

function policySnapshot(realm) {
  if (!realm || typeof realm !== "object" || Array.isArray(realm)) throw new Error("Keycloak realm response is invalid");
  return Object.freeze(Object.fromEntries(Object.keys(CLOSED_REALM_POLICY).map((key) => [key, realm[key] ?? null])));
}

function realmPolicyMatches(realm, identityProviderCount = 0) {
  if (!realm || typeof realm !== "object" || Array.isArray(realm) || !Number.isSafeInteger(identityProviderCount) || identityProviderCount < 0) return false;
  const actual = policySnapshot(realm);
  return identityProviderCount === 0 && Object.entries(CLOSED_REALM_POLICY).every(([key, value]) => actual[key] === value);
}

function safeRealmEvidence({ realm, userCount, identityProviderCount, status, changed }) {
  if (typeof realm !== "string" || !realm || !Number.isSafeInteger(userCount) || userCount < 0 || !Number.isSafeInteger(identityProviderCount) || identityProviderCount < 0 || !["current", "drift", "updated"].includes(status) || typeof changed !== "boolean") throw new Error("Keycloak realm evidence is invalid");
  return Object.freeze({ schemaVersion: 1, capturedAt: new Date().toISOString(), realm, status, changed, userCount, identityProviderCount, policy: { ...CLOSED_REALM_POLICY } });
}

function evidencePath(value, cwd = process.cwd()) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096) throw new Error("Keycloak realm evidence file is invalid");
  const target = path.resolve(cwd, value);
  if (path.extname(target).toLowerCase() !== ".json" || !fs.existsSync(path.dirname(target)) || fs.existsSync(target)) throw new Error("Keycloak realm evidence file is invalid");
  return target;
}

function writeJsonExclusive(target, value) {
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

async function synchronizeClosedRealm({ baseUrl, realm, adminUsername, adminPassword, apply = false, backupFile, evidenceFile, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== "function") throw new TypeError("Keycloak fetch implementation is invalid");
  const token = await adminAccessToken(fetchImpl, baseUrl, adminUsername, adminPassword);
  const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
  const realmUrl = `${baseUrl}/admin/realms/${encodeURIComponent(realm)}`;
  const [current, userCount, identityProviders] = await Promise.all([
    requestJson(fetchImpl, realmUrl, { headers }),
    requestJson(fetchImpl, `${realmUrl}/users/count`, { headers }),
    requestJson(fetchImpl, `${realmUrl}/identity-provider/instances`, { headers })
  ]);
  if (!Number.isSafeInteger(userCount) || userCount < 0) throw new Error("Keycloak user count response is invalid");
  if (!Array.isArray(identityProviders)) throw new Error("Keycloak identity provider response is invalid");
  const currentMatches = realmPolicyMatches(current, identityProviders.length);
  if (!currentMatches && apply) {
    if (!backupFile) throw new Error("--backup-file is required before applying a Keycloak realm change");
    writeJsonExclusive(backupFile, { schemaVersion: 1, capturedAt: new Date().toISOString(), realm, identityProviderCount: identityProviders.length, policy: policySnapshot(current) });
    if (identityProviders.length > 0) throw new Error("Keycloak external identity providers must be removed explicitly before hardening");
    await requestOk(fetchImpl, realmUrl, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ ...current, ...CLOSED_REALM_POLICY }) });
  }
  const result = currentMatches
    ? { status: "current", changed: false }
    : apply ? { status: "updated", changed: true } : { status: "drift", changed: false };
  if (apply) {
    const verified = await requestJson(fetchImpl, realmUrl, { headers });
    if (!realmPolicyMatches(verified, identityProviders.length)) throw new Error("Keycloak realm hardening verification failed");
  }
  const evidence = safeRealmEvidence({ realm, userCount, identityProviderCount: identityProviders.length, ...result });
  if (evidenceFile) writeJsonExclusive(evidenceFile, evidence);
  return evidence;
}

function keycloakRealmOptions(args = {}, environment = process.env, cwd = process.cwd()) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new TypeError("Keycloak realm arguments are invalid");
  if (args.apply !== undefined && args.apply !== true) throw new Error("--apply must not have a value");
  const port = environment.COMMON_TOOLS_KEYCLOAK_PORT || "58080";
  if (!/^[1-9][0-9]{0,4}$/.test(port) || Number(port) > 65535) throw new Error("COMMON_TOOLS_KEYCLOAK_PORT is invalid");
  return Object.freeze({
    baseUrl: localKeycloakBaseUrl(args["base-url"] || environment.COMMON_TOOLS_KEYCLOAK_BASE_URL || `http://127.0.0.1:${port}`),
    realm: realmName(args.realm || "common-tools"),
    adminUsername: String(environment.COMMON_TOOLS_KEYCLOAK_ADMIN || "").trim(),
    adminPassword: String(environment.COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD || "").trim(),
    apply: args.apply === true,
    backupFile: args["backup-file"] === undefined ? undefined : backupPath(args["backup-file"], cwd),
    evidenceFile: args["evidence-file"] === undefined ? undefined : evidencePath(args["evidence-file"], cwd)
  });
}

async function runKeycloakRealmCommand(args, environment = process.env, options = {}) {
  const input = keycloakRealmOptions(args, environment, options.cwd || process.cwd());
  if (!input.adminUsername || !input.adminPassword || input.adminUsername.length > 128 || input.adminPassword.length > 4096) throw new Error("Keycloak administrator credentials are required");
  return synchronizeClosedRealm({ ...input, fetchImpl: options.fetchImpl || globalThis.fetch });
}

module.exports = { CLOSED_REALM_POLICY, evidencePath, keycloakRealmOptions, policySnapshot, realmPolicyMatches, runKeycloakRealmCommand, safeRealmEvidence, synchronizeClosedRealm };
