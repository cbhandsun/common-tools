"use strict";

const { TEAM_CAPABILITY_DEFINITIONS } = require("../capability-runtime");
const { REMOTE_CAPABILITY_MODULE: SIYUAN_REMOTE_CAPABILITY_MODULE } = require("../siyuan-note-core");
const { normalizeTeamJobOptions } = require("../team-runtime");
const { TEAM_TOOLS, validateTeamToolOutput } = require("./team-tool-contracts");

const CAPABILITY_SCOPES = Object.freeze(Object.fromEntries(Object.entries(TEAM_CAPABILITY_DEFINITIONS).map(([capability, definition]) => [capability, definition.oauthScope])));
const JOB_CAPABILITIES = Object.freeze(Object.keys(TEAM_CAPABILITY_DEFINITIONS).filter((capability) => TEAM_CAPABILITY_DEFINITIONS[capability].mode !== "direct"));

const COMMON_TOOL_PROPERTIES = Object.freeze({
  capability: Object.freeze({ type: "string" }),
  contentType: Object.freeze({ type: "string" }),
  contentLength: Object.freeze({ type: "integer", minimum: 1, maximum: 104857600 }),
  inputObjectKey: Object.freeze({ type: "string" }),
  idempotencyKey: Object.freeze({ type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" }),
  options: Object.freeze({ type: "object", properties: { repairProfile: { type: "string", enum: ["safe-package", "layout-safe", "typography-safe", "editability-safe", "audit-only"] } }, additionalProperties: false }),
  id: Object.freeze({ type: "string" }),
  name: Object.freeze({ type: "string" }),
  projectId: Object.freeze({ type: "string", pattern: "^[a-z][a-z0-9-]{2,63}$" }),
  notebookId: Object.freeze({ type: "string", pattern: "^[0-9]{14}-[a-z0-9]{7}$" }),
  documentId: Object.freeze({ type: "string", pattern: "^[0-9]{14}-[a-z0-9]{7}$" }),
  title: Object.freeze({ type: "string", minLength: 1, maxLength: 128 }),
  markdown: Object.freeze({ type: "string", minLength: 1, maxLength: 262144 }),
  folder: Object.freeze({ type: "string", maxLength: 256 }),
  query: Object.freeze({ type: "string", minLength: 1, maxLength: 128 }),
  limit: Object.freeze({ type: "integer", minimum: 1, maximum: 20 })
});

const TEAM_TOOL_ARGUMENTS = Object.freeze({
  create_team_upload_target: Object.freeze(["capability", "contentType", "contentLength"]),
  create_team_job: Object.freeze(["capability", "inputObjectKey", "idempotencyKey", "options"]),
  get_team_job: Object.freeze(["id"]),
  cancel_team_job: Object.freeze(["id"]),
  get_team_artifact_target: Object.freeze(["id", "name"]),
  siyuan_list_notebooks: Object.freeze([]),
  siyuan_save_note: Object.freeze(["notebookId", "title", "markdown", "folder", "idempotencyKey"]),
  siyuan_append_note: Object.freeze(["documentId", "markdown", "idempotencyKey"]),
  siyuan_search_notes: Object.freeze(["query", "limit"]),
  siyuan_get_note: Object.freeze(["documentId"])
});

const SIYUAN_CAPABILITY = SIYUAN_REMOTE_CAPABILITY_MODULE.registration.capability;
const SIYUAN_METHODS = SIYUAN_REMOTE_CAPABILITY_MODULE.directToolMethods;

function assertObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("tool arguments must be an object");
  return value;
}

function assertKeys(value, allowed, required) {
  const args = assertObject(value);
  for (const key of Object.keys(args)) if (!allowed.includes(key)) throw new TypeError(`unexpected tool argument: ${key}`);
  for (const key of required) if (args[key] === undefined || args[key] === null || args[key] === "") throw new TypeError(`tool argument ${key} is required`);
  return args;
}

function configuredCapabilities(value) {
  const capabilities = value === undefined ? Object.keys(CAPABILITY_SCOPES) : value;
  if (!Array.isArray(capabilities) || !capabilities.length || capabilities.some((capability) => typeof capability !== "string" || !Object.prototype.hasOwnProperty.call(CAPABILITY_SCOPES, capability)) || new Set(capabilities).size !== capabilities.length) throw new TypeError("team enabled capabilities are invalid");
  return new Set(capabilities);
}

function authorizedCapability(principal, capability, enabledCapabilities) {
  if (typeof capability !== "string" || !Object.prototype.hasOwnProperty.call(CAPABILITY_SCOPES, capability) || !enabledCapabilities.has(capability) || !principal.capabilities.has(capability)) throw new Error("capability is not authorized for this principal");
  return capability;
}

function projectAccess(principal, projectId, allowedRoles) {
  if (!principal || !(principal.projects instanceof Map) || typeof projectId !== "string" || !/^[a-z][a-z0-9-]{2,63}$/.test(projectId)) throw new Error("project access is invalid");
  const role = principal.projects.get(projectId);
  if (!allowedRoles.includes(role)) throw new Error("project access is not authorized for this principal");
  return projectId;
}

function teamArgs(rawArgs, allowed, required, requireProjectRbac) {
  return requireProjectRbac ? assertKeys(rawArgs, [...allowed, "projectId"], [...required, "projectId"]) : assertKeys(rawArgs, allowed, required);
}

function directSiyuanOperation(name, method) {
  return async function callDirectSiyuanTool(rawArgs, context, enabledCapabilities) {
    authorizedCapability(context.principal, SIYUAN_CAPABILITY, enabledCapabilities);
    if (!context.services.siyuan || typeof context.services.siyuan.forOwner !== "function") throw new Error("SiYuan service is unavailable");
    const siyuan = context.services.siyuan.forOwner(context.principal.subject);
    const tool = TEAM_TOOLS.find((candidate) => candidate.name === name);
    const args = assertKeys(rawArgs, teamToolArgumentKeys(name), tool?.required || []);
    if (typeof siyuan[method] !== "function") throw new Error("SiYuan service is unavailable");
    return validateTeamToolOutput(name, await siyuan[method](args));
  };
}

const TEAM_TOOL_OPERATIONS = Object.freeze({
  create_team_upload_target: async (rawArgs, context, enabledCapabilities) => {
    const args = teamArgs(rawArgs, TEAM_TOOL_ARGUMENTS.create_team_upload_target, TEAM_TOOL_ARGUMENTS.create_team_upload_target, context.requireProjectRbac === true);
    const capability = authorizedCapability(context.principal, args.capability, enabledCapabilities);
    if (!Number.isSafeInteger(args.contentLength)) throw new TypeError("tool argument contentLength must be an integer");
    if (context.requireProjectRbac === true) projectAccess(context.principal, args.projectId, ["editor", "admin"]);
    return validateTeamToolOutput("create_team_upload_target", await context.services.createUploadTarget({ ownerId: context.principal.subject, capability, contentType: args.contentType, contentLength: args.contentLength }));
  },
  create_team_job: async (rawArgs, context, enabledCapabilities) => {
    const args = teamArgs(rawArgs, TEAM_TOOL_ARGUMENTS.create_team_job, ["capability", "inputObjectKey", "idempotencyKey"], context.requireProjectRbac === true);
    const capability = authorizedCapability(context.principal, args.capability, enabledCapabilities);
    const options = args.options === undefined ? undefined : normalizeTeamJobOptions(capability, args.options);
    if (context.requireProjectRbac === true) projectAccess(context.principal, args.projectId, ["editor", "admin"]);
    return validateTeamToolOutput("create_team_job", await context.services.createJob({ capability, ownerId: context.principal.subject, projectId: context.requireProjectRbac === true ? args.projectId : undefined, inputObjectKey: args.inputObjectKey, idempotencyKey: args.idempotencyKey, options, expiresAt: new Date(context.now() + 24 * 60 * 60 * 1000).toISOString(), traceParent: context.traceParent }));
  },
  get_team_job: async (rawArgs, context) => {
    const args = teamArgs(rawArgs, TEAM_TOOL_ARGUMENTS.get_team_job, TEAM_TOOL_ARGUMENTS.get_team_job, context.requireProjectRbac === true);
    if (context.requireProjectRbac !== true) return validateTeamToolOutput("get_team_job", await context.services.getJob(args.id, context.principal.subject));
    return validateTeamToolOutput("get_team_job", await context.services.getProjectJob(args.id, projectAccess(context.principal, args.projectId, ["viewer", "editor", "admin"])));
  },
  cancel_team_job: async (rawArgs, context) => {
    const args = teamArgs(rawArgs, TEAM_TOOL_ARGUMENTS.cancel_team_job, TEAM_TOOL_ARGUMENTS.cancel_team_job, context.requireProjectRbac === true);
    if (context.requireProjectRbac !== true) return validateTeamToolOutput("cancel_team_job", await context.services.cancelJob(args.id, context.principal.subject));
    return validateTeamToolOutput("cancel_team_job", await context.services.cancelProjectJob(args.id, projectAccess(context.principal, args.projectId, ["editor", "admin"]), context.principal.subject));
  },
  get_team_artifact_target: async (rawArgs, context) => {
    const args = teamArgs(rawArgs, TEAM_TOOL_ARGUMENTS.get_team_artifact_target, TEAM_TOOL_ARGUMENTS.get_team_artifact_target, context.requireProjectRbac === true);
    if (context.requireProjectRbac !== true) return validateTeamToolOutput("get_team_artifact_target", await context.services.getArtifactTarget({ id: args.id, name: args.name, ownerId: context.principal.subject }));
    return validateTeamToolOutput("get_team_artifact_target", await context.services.getProjectArtifactTarget({ id: args.id, name: args.name, projectId: projectAccess(context.principal, args.projectId, ["viewer", "editor", "admin"]) }));
  },
  ...Object.fromEntries(Object.entries(SIYUAN_METHODS).map(([name, method]) => [name, directSiyuanOperation(name, method)]))
});

function assertDirectSiyuanModuleContracts() {
  if (SIYUAN_REMOTE_CAPABILITY_MODULE.teamMode !== "direct") throw new Error("SiYuan capability module must be direct");
  for (const name of SIYUAN_REMOTE_CAPABILITY_MODULE.registration.toolNames) {
    if (!Object.prototype.hasOwnProperty.call(SIYUAN_METHODS, name) || !Object.prototype.hasOwnProperty.call(TEAM_TOOL_ARGUMENTS, name) || !TEAM_TOOLS.some((tool) => tool.name === name && tool.capability === SIYUAN_CAPABILITY)) throw new Error("SiYuan capability module contract is incomplete");
  }
  return true;
}
assertDirectSiyuanModuleContracts();

function teamToolArgumentKeys(name) {
  const keys = TEAM_TOOL_ARGUMENTS[name];
  if (!keys) throw new Error("team tool not found");
  return keys;
}

function teamToolProperties(name, capabilities = Object.keys(CAPABILITY_SCOPES), requireProjectRbac = false) {
  const keys = teamToolArgumentKeys(name);
  const properties = { ...COMMON_TOOL_PROPERTIES, capability: { ...COMMON_TOOL_PROPERTIES.capability, enum: capabilities } };
  return Object.fromEntries((requireProjectRbac ? [...keys, "projectId"] : keys).map((key) => [key, properties[key]]));
}

async function callTeamTool(name, rawArgs, context) {
  if (!context.services || typeof context.services !== "object") throw new TypeError("team services are required");
  if (typeof context.requireProjectRbac !== "boolean" && context.requireProjectRbac !== undefined) throw new TypeError("project RBAC requirement is invalid");
  const operation = TEAM_TOOL_OPERATIONS[name];
  if (!operation) throw new Error("tool not found");
  const enabledCapabilities = configuredCapabilities(context.enabledCapabilities);
  return operation(rawArgs, { ...context, now: context.now || (() => Date.now()) }, enabledCapabilities);
}

module.exports = { CAPABILITY_SCOPES, JOB_CAPABILITIES, TEAM_TOOL_ARGUMENTS, assertDirectSiyuanModuleContracts, callTeamTool, configuredCapabilities, teamToolProperties };
