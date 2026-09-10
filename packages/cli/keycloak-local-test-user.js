"use strict";

const { adminAccessToken, localKeycloakBaseUrl, realmName, requestJson, requestOk } = require("./keycloak-project-mapper");

const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@-]{2,127}$/;
const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ROLE_PATTERN = /^(viewer|editor|admin)$/;
const PROJECT_ATTRIBUTE = "common_tools_projects";
const LOCAL_TEST_USER_EMAIL_DOMAIN = "example.invalid";

function localOnlyKeycloakBaseUrl(value) {
  const baseUrl = localKeycloakBaseUrl(value);
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new Error("local Keycloak base URL is invalid"); }
  const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (parsed.protocol !== "http:" || !loopback.has(parsed.hostname)) throw new Error("local Keycloak test user helper requires loopback HTTP");
  return baseUrl;
}

function assertSafeUsername(value) {
  if (typeof value !== "string" || !USERNAME_PATTERN.test(value)) throw new Error("local Keycloak test username is invalid");
  return value;
}

function assertSafeProjectId(value) {
  if (typeof value !== "string" || !PROJECT_ID_PATTERN.test(value)) throw new Error("local Keycloak test project id is invalid");
  return value;
}

function assertSafeRole(value) {
  if (typeof value !== "string" || !ROLE_PATTERN.test(value)) throw new Error("local Keycloak test role is invalid");
  return value;
}

function assertPassword(value, name) {
  if (typeof value !== "string" || value.length < 8 || value.length > 4096 || value.includes("\0")) throw new Error(`${name} is invalid`);
  return value;
}

function assertEnvironmentUsername(value, name) {
  if (typeof value !== "string" || !USERNAME_PATTERN.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

function projectMembershipAttribute(projectId, role) {
  return JSON.stringify([{ id: projectId, role }]);
}

function localTestUserEmail(username) {
  return `${username.replace(/[^A-Za-z0-9._-]/g, "_")}@${LOCAL_TEST_USER_EMAIL_DOMAIN}`;
}

function projectAttributeDefinition() {
  return Object.freeze({
    name: PROJECT_ATTRIBUTE,
    displayName: "Common Tools project memberships",
    permissions: { view: ["admin"], edit: ["admin"] },
    multivalued: false
  });
}

function localTestUserSnapshot(user) {
  if (!user || typeof user !== "object" || Array.isArray(user)) throw new Error("Keycloak user response is invalid");
  const attributes = user.attributes && typeof user.attributes === "object" && !Array.isArray(user.attributes) ? user.attributes : {};
  const rawProjects = attributes[PROJECT_ATTRIBUTE];
  const projects = Array.isArray(rawProjects)
    ? rawProjects.filter((entry) => typeof entry === "string" && entry.length <= 4096)
    : typeof rawProjects === "string" && rawProjects.length <= 4096
      ? [rawProjects]
      : [];
  const attributeKeys = Object.keys(attributes).filter((key) => /^[A-Za-z0-9_.-]{1,128}$/u.test(key)).sort();
  const projectClaimRawType = Array.isArray(rawProjects) ? "array" : rawProjects === null ? "null" : typeof rawProjects;
  return Object.freeze({
    id: typeof user.id === "string" && /^[A-Za-z0-9-]{1,128}$/.test(user.id) ? user.id : null,
    username: typeof user.username === "string" && user.username.length <= 128 ? user.username : null,
    enabled: typeof user.enabled === "boolean" ? user.enabled : null,
    email: typeof user.email === "string" && user.email.length <= 320 ? user.email : null,
    firstName: typeof user.firstName === "string" && user.firstName.length <= 128 ? user.firstName : null,
    lastName: typeof user.lastName === "string" && user.lastName.length <= 128 ? user.lastName : null,
    emailVerified: typeof user.emailVerified === "boolean" ? user.emailVerified : null,
    requiredActions: Array.isArray(user.requiredActions) ? user.requiredActions.filter((entry) => typeof entry === "string" && entry.length <= 128).sort() : [],
    commonToolsProjects: projects,
    projectClaimRawType,
    attributeKeys
  });
}

function localTestUserMatches(user, { username, projectId, role }) {
  return localTestUserDriftReasons(user, { username, projectId, role }).length === 0;
}

function localTestUserDriftReasons(user, { username, projectId, role }) {
  const snapshot = localTestUserSnapshot(user);
  const expectedProject = projectMembershipAttribute(projectId, role);
  const expectedEmail = localTestUserEmail(username);
  const reasons = [];
  if (snapshot.username !== username) reasons.push("username mismatch");
  if (snapshot.enabled !== true) reasons.push("user is not enabled");
  if (snapshot.email !== expectedEmail) reasons.push("email mismatch");
  if (snapshot.firstName !== "Common") reasons.push("first name mismatch");
  if (snapshot.lastName !== "Tools") reasons.push("last name mismatch");
  if (snapshot.emailVerified !== true) reasons.push("email is not verified");
  if (snapshot.requiredActions.length > 0) reasons.push(`required actions are pending: count=${snapshot.requiredActions.length}`);
  if (snapshot.commonToolsProjects.length !== 1) reasons.push(`project claim count mismatch: count=${snapshot.commonToolsProjects.length}, rawType=${snapshot.projectClaimRawType}, attributeKeys=[${snapshot.attributeKeys.join(",")}]`);
  if (snapshot.commonToolsProjects.length === 1 && snapshot.commonToolsProjects[0] !== expectedProject) reasons.push("project claim value mismatch");
  return reasons;
}

function keycloakUserId(user) {
  const id = user && typeof user === "object" && !Array.isArray(user) && typeof user.id === "string" && /^[A-Za-z0-9-]{1,128}$/.test(user.id) ? user.id : null;
  if (!id) throw new Error("Keycloak local test user id is invalid");
  return id;
}

function userProfileHasProjectAttribute(profile) {
  return Boolean(
    profile
    && typeof profile === "object"
    && !Array.isArray(profile)
    && Array.isArray(profile.attributes)
    && profile.attributes.some((attribute) => attribute && typeof attribute === "object" && !Array.isArray(attribute) && attribute.name === PROJECT_ATTRIBUTE)
  );
}

async function ensureProjectUserProfileAttribute(fetchImpl, baseUrl, realm, headers) {
  const profileUrl = `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users/profile`;
  const profile = await requestJson(fetchImpl, profileUrl, { headers });
  if (!profile || typeof profile !== "object" || Array.isArray(profile) || !Array.isArray(profile.attributes)) throw new Error("Keycloak user profile response is invalid");
  if (userProfileHasProjectAttribute(profile)) return Object.freeze({ changed: false });
  await requestOk(fetchImpl, profileUrl, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ ...profile, attributes: [...profile.attributes, projectAttributeDefinition()] }) });
  return Object.freeze({ changed: true });
}

async function readUserByUsername(fetchImpl, usersUrl, headers, username) {
  const users = await requestJson(fetchImpl, `${usersUrl}?username=${encodeURIComponent(username)}&exact=true&briefRepresentation=false`, { headers });
  if (!Array.isArray(users)) throw new Error("Keycloak user search response is invalid");
  const matching = users.filter((entry) => entry && typeof entry === "object" && entry.username === username);
  if (matching.length > 1) throw new Error("Keycloak local test user is duplicated");
  if (!matching[0]) return null;
  return requestJson(fetchImpl, `${usersUrl}/${encodeURIComponent(keycloakUserId(matching[0]))}`, { headers });
}

async function synchronizeLocalTestUser({ baseUrl, realm, adminUsername, adminPassword, username, password, projectId, role, apply = false, fetchImpl = globalThis.fetch }) {
  if (typeof fetchImpl !== "function") throw new TypeError("Keycloak fetch implementation is invalid");
  const safeUsername = assertSafeUsername(username);
  const safePassword = assertPassword(password, "COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD");
  const safeProjectId = assertSafeProjectId(projectId);
  const safeRole = assertSafeRole(role);
  const token = await adminAccessToken(fetchImpl, baseUrl, adminUsername, adminPassword);
  const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
  if (apply) await ensureProjectUserProfileAttribute(fetchImpl, baseUrl, realm, headers);
  const usersUrl = `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users`;
  let user = await readUserByUsername(fetchImpl, usersUrl, headers, safeUsername);
  if (user && localTestUserMatches(user, { username: safeUsername, projectId: safeProjectId, role: safeRole })) {
    return Object.freeze({ status: "current", changed: false, username: safeUsername, projectId: safeProjectId, role: safeRole });
  }
  if (!apply) return Object.freeze({ status: user ? "drift" : "missing", changed: false, username: safeUsername, projectId: safeProjectId, role: safeRole });
  const created = !user;
  const attributes = { [PROJECT_ATTRIBUTE]: [projectMembershipAttribute(safeProjectId, safeRole)] };
  const desiredUser = { username: safeUsername, enabled: true, email: localTestUserEmail(safeUsername), firstName: "Common", lastName: "Tools", emailVerified: true, requiredActions: [] };
  if (!user) {
    await requestOk(fetchImpl, usersUrl, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ ...desiredUser, attributes }) });
    user = await readUserByUsername(fetchImpl, usersUrl, headers, safeUsername);
    if (!user) throw new Error("Keycloak local test user creation verification failed");
  }
  const snapshot = localTestUserSnapshot(user);
  const userId = keycloakUserId(snapshot);
  if (!localTestUserMatches(user, { username: safeUsername, projectId: safeProjectId, role: safeRole })) {
    await requestOk(fetchImpl, `${usersUrl}/${encodeURIComponent(userId)}`, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ ...user, ...desiredUser, attributes: { ...(user.attributes || {}), ...attributes } }) });
  }
  await requestOk(fetchImpl, `${usersUrl}/${encodeURIComponent(userId)}/reset-password`, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ type: "password", value: safePassword, temporary: false }) });
  const verified = await readUserByUsername(fetchImpl, usersUrl, headers, safeUsername);
  if (!verified) throw new Error("Keycloak local test user verification failed: user missing after update");
  const verificationDrift = localTestUserDriftReasons(verified, { username: safeUsername, projectId: safeProjectId, role: safeRole });
  if (verificationDrift.length > 0) throw new Error(`Keycloak local test user verification failed: ${verificationDrift.join(", ")}`);
  return Object.freeze({ status: created ? "created" : "updated", changed: true, username: safeUsername, projectId: safeProjectId, role: safeRole });
}

function localTestUserOptions(args = {}, environment = process.env) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new TypeError("Keycloak local test user arguments are invalid");
  if (args.apply !== undefined && args.apply !== true) throw new Error("--apply must not have a value");
  const port = environment.COMMON_TOOLS_KEYCLOAK_PORT || "58080";
  if (!/^[1-9][0-9]{0,4}$/.test(port) || Number(port) > 65535) throw new Error("COMMON_TOOLS_KEYCLOAK_PORT is invalid");
  return Object.freeze({
    baseUrl: localOnlyKeycloakBaseUrl(args["base-url"] || environment.COMMON_TOOLS_KEYCLOAK_BASE_URL || `http://127.0.0.1:${port}`),
    realm: realmName(args.realm || "common-tools"),
    adminUsername: assertEnvironmentUsername(environment.COMMON_TOOLS_KEYCLOAK_ADMIN || "", "COMMON_TOOLS_KEYCLOAK_ADMIN"),
    adminPassword: assertPassword(environment.COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD || "", "COMMON_TOOLS_KEYCLOAK_ADMIN_PASSWORD"),
    username: assertSafeUsername(args.username || environment.COMMON_TOOLS_KEYCLOAK_TEST_USERNAME || "local-tester"),
    password: assertPassword(environment.COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD || "", "COMMON_TOOLS_KEYCLOAK_TEST_USER_PASSWORD"),
    projectId: assertSafeProjectId(args["project-id"] || environment.COMMON_TOOLS_KEYCLOAK_TEST_PROJECT_ID || "deploy"),
    role: assertSafeRole(args.role || environment.COMMON_TOOLS_KEYCLOAK_TEST_ROLE || "editor"),
    apply: args.apply === true
  });
}

async function runKeycloakLocalTestUserCommand(args, environment = process.env, options = {}) {
  const input = localTestUserOptions(args, environment);
  return synchronizeLocalTestUser({ ...input, fetchImpl: options.fetchImpl || globalThis.fetch });
}

module.exports = {
  assertSafeProjectId,
  assertSafeRole,
  assertSafeUsername,
  ensureProjectUserProfileAttribute,
  localOnlyKeycloakBaseUrl,
  localTestUserDriftReasons,
  localTestUserMatches,
  localTestUserOptions,
  localTestUserSnapshot,
  projectMembershipAttribute,
  runKeycloakLocalTestUserCommand,
  synchronizeLocalTestUser
};
