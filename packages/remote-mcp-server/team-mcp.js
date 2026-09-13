"use strict";

const { RUNTIME_VERSION } = require("../capability-runtime");
const { TASKS_EXTENSION, clientSupportsTasks, handleTeamTask, toCreatedTask } = require("./team-tasks");
const { appServerCapabilities, clientSupportsMcpApps, listAppResources, readAppResource, withQualityReportApp } = require("../mcp-server/mcp-apps");
const { TEAM_TOOLS } = require("./team-tool-contracts");
const { CAPABILITY_SCOPES, JOB_CAPABILITIES, callTeamTool, configuredCapabilities, teamToolProperties } = require("./team-tool-registry");

function result(id, value) { return { jsonrpc: "2.0", id, result: value }; }
function failure(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }
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
  const jobCapabilities = capabilities.filter((capability) => JOB_CAPABILITIES.includes(capability));
  return TEAM_TOOLS.filter((tool) => tool.capability ? capabilities.includes(tool.capability) : jobCapabilities.length > 0 || !["create_team_upload_target", "create_team_job"].includes(tool.name)).map((tool) => {
    const execution = teamToolExecution(tool.name, tasksEnabled);
    const needsProject = requireProjectRbac && tool.capability === null;
    return withQualityReportApp({ name: tool.name, description: tool.description, inputSchema: { type: "object", properties: teamToolProperties(tool.name, tool.capability ? capabilities : jobCapabilities, needsProject), required: needsProject ? [...tool.required, "projectId"] : tool.required, additionalProperties: false }, outputSchema: tool.outputSchema, annotations: tool.annotations, ...(execution ? { execution } : {}) }, appEnabled);
  });
}
function teamServerCapabilities(tasksEnabled) {
  const capabilities = { tools: {}, ...appServerCapabilities() };
  return tasksEnabled ? { ...capabilities, extensions: { ...capabilities.extensions, [TASKS_EXTENSION]: {} } } : capabilities;
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

module.exports = { CAPABILITY_SCOPES, TEAM_TOOLS, callTeamTool, handleTeamMcp, teamServerCapabilities, teamToolProperties, toolsFor };
