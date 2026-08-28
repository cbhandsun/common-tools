"use strict";

const { RUNTIME_VERSION, TEAM_CAPABILITY_DEFINITIONS } = require("../capability-runtime");
const { TASKS_EXTENSION, clientSupportsTasks, handleTeamTask, toCreatedTask } = require("./team-tasks");
const { appServerCapabilities, clientSupportsMcpApps, listAppResources, readAppResource, withQualityReportApp } = require("../mcp-server/mcp-apps");
const { TEAM_TOOLS, validateTeamToolOutput } = require("./team-tool-contracts");
const { normalizeTeamJobOptions } = require("../team-runtime");

// Kept local to avoid a cyclic import with the HTTP transport module.
const CAPABILITY_SCOPES = Object.freeze(Object.fromEntries(Object.entries(TEAM_CAPABILITY_DEFINITIONS).map(([capability, definition]) => [capability, definition.oauthScope])));

function result(id, value) { return { jsonrpc: "2.0", id, result: value }; }
function failure(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }
function assertObject(value) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("tool arguments must be an object"); return value; }
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
function teamToolExecution(name, tasksEnabled) {
  if (typeof tasksEnabled !== "boolean") throw new TypeError("team Tasks availability is invalid");
  return tasksEnabled && name === "create_team_job" ? { taskSupport: "optional" } : undefined;
}
function toolsFor(principal, requireProjectRbac = false, enabledCapabilities = Object.keys(CAPABILITY_SCOPES), appEnabled = false, tasksEnabled = false) {
  if (!principal || typeof principal.subject !== "string" || !principal.capabilities || typeof principal.capabilities.has !== "function") throw new TypeError("principal is invalid");
  if (typeof requireProjectRbac !== "boolean") throw new TypeError("project RBAC requirement is invalid");
  if (typeof tasksEnabled !== "boolean") throw new TypeError("team Tasks availability is invalid");
  const configured = configuredCapabilities(enabledCapabilities);
  const capabilities = Object.keys(CAPABILITY_SCOPES).filter((capability) => configured.has(capability) && principal.capabilities.has(capability));
  return TEAM_TOOLS.filter((tool) => capabilities.length > 0 || !["create_team_upload_target", "create_team_job"].includes(tool.name)).map((tool) => {
    const execution = teamToolExecution(tool.name, tasksEnabled);
    return withQualityReportApp({ name: tool.name, description: tool.description, inputSchema: { type: "object", properties: teamToolProperties(tool.name, capabilities, requireProjectRbac), required: requireProjectRbac ? [...tool.required, "projectId"] : tool.required, additionalProperties: false }, outputSchema: tool.outputSchema, annotations: tool.annotations, ...(execution ? { execution } : {}) }, appEnabled);
  });
}
function teamToolProperties(name, capabilities = Object.keys(CAPABILITY_SCOPES), requireProjectRbac = false) {
  const properties = {
    capability: { type: "string", enum: capabilities },
    contentType: { type: "string" },
    contentLength: { type: "integer", minimum: 1, maximum: 104857600 },
    inputObjectKey: { type: "string" },
    idempotencyKey: { type: "string" },
    options: { type: "object", properties: { repairProfile: { type: "string", enum: ["safe-package", "layout-safe", "typography-safe", "editability-safe", "audit-only"] } }, additionalProperties: false },
    id: { type: "string" },
    name: { type: "string" },
    projectId: { type: "string", pattern: "^[a-z][a-z0-9-]{2,63}$" }
  };
  const byTool = {
    create_team_upload_target: ["capability", "contentType", "contentLength"],
    create_team_job: ["capability", "inputObjectKey", "idempotencyKey", "options"],
    get_team_job: ["id"],
    cancel_team_job: ["id"],
    get_team_artifact_target: ["id", "name"]
  };
  const keys = byTool[name];
  return Object.fromEntries((requireProjectRbac ? [...keys, "projectId"] : keys).map((key) => [key, properties[key]]));
}
function teamArgs(rawArgs, allowed, required, requireProjectRbac) {
  return requireProjectRbac ? assertKeys(rawArgs, [...allowed, "projectId"], [...required, "projectId"]) : assertKeys(rawArgs, allowed, required);
}
function teamServerCapabilities(tasksEnabled) {
  const capabilities = { tools: {}, ...appServerCapabilities() };
  return tasksEnabled ? { ...capabilities, extensions: { ...capabilities.extensions, [TASKS_EXTENSION]: {} } } : capabilities;
}
async function callTeamTool(name, rawArgs, { principal, services, now = () => Date.now(), requireProjectRbac = false, enabledCapabilities: rawEnabledCapabilities, traceParent }) {
  if (!services || typeof services !== "object") throw new TypeError("team services are required");
  if (typeof requireProjectRbac !== "boolean") throw new TypeError("project RBAC requirement is invalid");
  const enabledCapabilities = configuredCapabilities(rawEnabledCapabilities);
  if (name === "create_team_upload_target") {
    const args = teamArgs(rawArgs, ["capability", "contentType", "contentLength"], ["capability", "contentType", "contentLength"], requireProjectRbac);
    const capability = authorizedCapability(principal, args.capability, enabledCapabilities);
    if (!Number.isSafeInteger(args.contentLength)) throw new TypeError("tool argument contentLength must be an integer");
    if (requireProjectRbac) projectAccess(principal, args.projectId, ["editor", "admin"]);
    return validateTeamToolOutput(name, await services.createUploadTarget({ ownerId: principal.subject, capability, contentType: args.contentType, contentLength: args.contentLength }));
  }
  if (name === "create_team_job") {
    const args = teamArgs(rawArgs, ["capability", "inputObjectKey", "idempotencyKey", "options"], ["capability", "inputObjectKey", "idempotencyKey"], requireProjectRbac);
    const capability = authorizedCapability(principal, args.capability, enabledCapabilities);
    const options = args.options === undefined ? undefined : normalizeTeamJobOptions(capability, args.options);
    if (requireProjectRbac) projectAccess(principal, args.projectId, ["editor", "admin"]);
    return validateTeamToolOutput(name, await services.createJob({ capability, ownerId: principal.subject, projectId: requireProjectRbac ? args.projectId : undefined, inputObjectKey: args.inputObjectKey, idempotencyKey: args.idempotencyKey, options, expiresAt: new Date(now() + 24 * 60 * 60 * 1000).toISOString(), traceParent }));
  }
  if (name === "get_team_job") {
    const args = teamArgs(rawArgs, ["id"], ["id"], requireProjectRbac);
    if (!requireProjectRbac) return validateTeamToolOutput(name, await services.getJob(args.id, principal.subject));
    return validateTeamToolOutput(name, await services.getProjectJob(args.id, projectAccess(principal, args.projectId, ["viewer", "editor", "admin"])));
  }
  if (name === "cancel_team_job") {
    const args = teamArgs(rawArgs, ["id"], ["id"], requireProjectRbac);
    if (!requireProjectRbac) return validateTeamToolOutput(name, await services.cancelJob(args.id, principal.subject));
    return validateTeamToolOutput(name, await services.cancelProjectJob(args.id, projectAccess(principal, args.projectId, ["editor", "admin"]), principal.subject));
  }
  if (name === "get_team_artifact_target") {
    const args = teamArgs(rawArgs, ["id", "name"], ["id", "name"], requireProjectRbac);
    if (!requireProjectRbac) return validateTeamToolOutput(name, await services.getArtifactTarget({ id: args.id, name: args.name, ownerId: principal.subject }));
    return validateTeamToolOutput(name, await services.getProjectArtifactTarget({ id: args.id, name: args.name, projectId: projectAccess(principal, args.projectId, ["viewer", "editor", "admin"]) }));
  }
  throw new Error("tool not found");
}
async function handleTeamMcp(request, context) {
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") return failure(request?.id ?? null, -32600, "invalid request");
  if (request.method === "initialize" && context.protocolVersion === "2026-07-28") return failure(request.id, -32601, "method not found");
  if (request.method === "initialize") return result(request.id, { protocolVersion: context.protocolVersion || request.params?.protocolVersion || "2025-11-25", capabilities: teamServerCapabilities(context.tasksEnabled === true), serverInfo: { name: "common-tools", version: RUNTIME_VERSION } });
  if (request.method === "server/discover") {
    const discovered = { supportedVersions: Array.isArray(context.supportedVersions) ? context.supportedVersions : [context.protocolVersion || "2025-11-25"], capabilities: teamServerCapabilities(context.tasksEnabled === true) };
    if (context.protocolVersion !== "2026-07-28") discovered.serverInfo = { name: "common-tools", version: RUNTIME_VERSION };
    return result(request.id, discovered);
  }
  if (["tasks/get", "tasks/update", "tasks/cancel"].includes(request.method)) {
    if (context.tasksEnabled !== true) return failure(request.id, -32601, "method not found");
    try { return await handleTeamTask(request, context); }
    catch { return failure(request.id, -32602, "invalid task request"); }
  }
  if (request.method === "tools/list") return result(request.id, { tools: toolsFor(context.principal, context.requireProjectRbac === true, context.enabledCapabilities, clientSupportsMcpApps(request.params), context.tasksEnabled === true) });
  if (request.method === "resources/list") return result(request.id, { resources: listAppResources(clientSupportsMcpApps(request.params)) });
  if (request.method === "resources/read") {
    try { return result(request.id, readAppResource(request.params?.uri)); }
    catch { return failure(request.id, -32602, "resource not found"); }
  }
  if (request.method === "tools/call") {
    try {
      const value = await callTeamTool(request.params?.name, request.params?.arguments || {}, context);
      if (context.tasksEnabled === true && request.params?.name === "create_team_job" && clientSupportsTasks(request.params)) return result(request.id, toCreatedTask(value));
      return result(request.id, { structuredContent: value, content: [{ type: "text", text: JSON.stringify(value) }] });
    } catch (error) {
      return result(request.id, { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "team tool failed" }] });
    }
  }
  return failure(request.id, -32601, "method not found");
}

module.exports = { CAPABILITY_SCOPES, TEAM_TOOLS, callTeamTool, handleTeamMcp, teamServerCapabilities, toolsFor };
