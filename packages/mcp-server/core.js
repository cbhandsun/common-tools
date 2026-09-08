"use strict";

const path = require("node:path");
const readline = require("node:readline");
const { RUNTIME_VERSION, effectivePluginConfig } = require("../capability-runtime");
const { LOCAL_REGISTRATIONS, createLocalJob, readLocalJob } = require("./capability-registry");
const { appServerCapabilities, clientSupportsMcpApps, listAppResources, readAppResource, withQualityReportApp } = require("./mcp-apps");
const { TOOLS, validateToolArguments, validateToolOutput } = require("./tool-contracts");

const LATEST_MCP_PROTOCOL_VERSION = "2026-07-28";
const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze(["2025-03-26", "2025-06-18", "2025-11-25", "2026-06-30", LATEST_MCP_PROTOCOL_VERSION]);
const SERVER_INFO = Object.freeze({ name: "common-tools", version: RUNTIME_VERSION });

function settings(environment = process.env) {
  const workspaceRoot = path.resolve(environment.COMMON_TOOLS_WORKSPACE || process.cwd());
  return {
    workspaceRoot,
    stateRoot: path.resolve(environment.COMMON_TOOLS_STATE || path.join(workspaceRoot, ".common-tools")),
    ownerId: environment.COMMON_TOOLS_OWNER || "local-user"
  };
}

function result(id, value) { return { jsonrpc: "2.0", id, result: value }; }
function failure(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }
function enabledCapabilities(context) {
  const configured = effectivePluginConfig(context.stateRoot, context.workspaceRoot).effectiveCapabilities;
  if (!context.authorizedCapabilities) return configured;
  return configured.filter((capability) => context.authorizedCapabilities.has(capability));
}

function callTool(name, rawArgs, context = settings()) {
  const args = validateToolArguments(name, rawArgs);
  const definition = TOOLS.find((toolDefinition) => toolDefinition.name === name);
  const enabled = enabledCapabilities(context);
  if (definition.capability && !enabled.includes(definition.capability)) throw new Error("capability is not enabled for this principal");
  if (name === "health_check") return validateToolOutput(name, { runtime: RUNTIME_VERSION, enabledCapabilities: enabled, registrations: LOCAL_REGISTRATIONS });
  const created = createLocalJob(name, args, context);
  return validateToolOutput(name, created === undefined ? readLocalJob(name, args, context) : created);
}

function serverCapabilities() { return { tools: {}, ...appServerCapabilities() }; }
function enabledTools(context = settings(), request) {
  const enabled = new Set(enabledCapabilities(context));
  const appEnabled = clientSupportsMcpApps(request?.params);
  return TOOLS.filter((definition) => definition.capability === null || enabled.has(definition.capability)).map((definition) => withQualityReportApp(definition, appEnabled));
}

function requestProtocolVersion(request, context) {
  if (typeof context?.protocolVersion === "string") return context.protocolVersion;
  const meta = request?.params?._meta;
  return meta && typeof meta === "object" && !Array.isArray(meta) ? meta["io.modelcontextprotocol/protocolVersion"] : undefined;
}
function validLatestRequestMeta(request, protocolVersion) {
  if (protocolVersion !== LATEST_MCP_PROTOCOL_VERSION) return true;
  const meta = request?.params?._meta;
  if (meta === undefined) return true;
  if (!meta || typeof meta !== "object" || Array.isArray(meta) || (meta["io.modelcontextprotocol/protocolVersion"] !== undefined && meta["io.modelcontextprotocol/protocolVersion"] !== LATEST_MCP_PROTOCOL_VERSION)) return false;
  const clientInfo = meta["io.modelcontextprotocol/clientInfo"];
  return clientInfo === undefined || (!!clientInfo && typeof clientInfo === "object" && !Array.isArray(clientInfo) && typeof clientInfo.name === "string" && clientInfo.name.length > 0 && clientInfo.name.length <= 256 && typeof clientInfo.version === "string" && clientInfo.version.length > 0 && clientInfo.version.length <= 256);
}
function latestResult(response, protocolVersion) {
  if (protocolVersion !== LATEST_MCP_PROTOCOL_VERSION || !response?.result || typeof response.result !== "object" || Array.isArray(response.result)) return response;
  const meta = response.result._meta && typeof response.result._meta === "object" && !Array.isArray(response.result._meta) ? response.result._meta : {};
  return { ...response, result: { ...response.result, resultType: response.result.resultType === "task" ? "task" : "complete", _meta: { ...meta, "io.modelcontextprotocol/serverInfo": SERVER_INFO } } };
}
function successfulResult(id, value, protocolVersion) { return latestResult(result(id, value), protocolVersion); }

function handle(request, context = settings()) {
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") return failure(request?.id ?? null, -32600, "invalid request");
  const protocolVersion = requestProtocolVersion(request, context);
  if (protocolVersion !== undefined && !SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion)) return failure(request.id, -32600, "unsupported MCP protocol version");
  if (!validLatestRequestMeta(request, protocolVersion)) return failure(request.id, -32600, "invalid MCP request metadata");
  if (request.method === "initialize" && protocolVersion === LATEST_MCP_PROTOCOL_VERSION) return failure(request.id, -32601, "method not found");
  if (request.method === "initialize") return successfulResult(request.id, { protocolVersion: request.params?.protocolVersion || "2025-11-25", capabilities: serverCapabilities(), serverInfo: SERVER_INFO }, protocolVersion);
  if (request.method === "server/discover") {
    const discovered = { supportedVersions: SUPPORTED_PROTOCOL_VERSIONS, capabilities: serverCapabilities() };
    if (protocolVersion !== LATEST_MCP_PROTOCOL_VERSION) discovered.serverInfo = SERVER_INFO;
    return successfulResult(request.id, discovered, protocolVersion);
  }
  if (request.method === "tools/list") {
    try { return successfulResult(request.id, { tools: enabledTools(context, request) }, protocolVersion); }
    catch { return failure(request.id, -32603, "runtime configuration is invalid"); }
  }
  if (request.method === "resources/list") return successfulResult(request.id, { resources: listAppResources(clientSupportsMcpApps(request.params)) }, protocolVersion);
  if (request.method === "resources/read") {
    try { return successfulResult(request.id, readAppResource(request.params?.uri), protocolVersion); }
    catch { return failure(request.id, -32602, "resource not found"); }
  }
  if (request.method === "tools/call") {
    try {
      const value = callTool(request.params?.name, request.params?.arguments || {}, context);
      return successfulResult(request.id, { structuredContent: value, content: [{ type: "text", text: JSON.stringify(value) }] }, protocolVersion);
    } catch (error) {
      return successfulResult(request.id, { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "tool failed" }] }, protocolVersion);
    }
  }
  return failure(request.id, -32601, "method not found");
}

function serveStdio({ input = process.stdin, output = process.stdout, context } = {}) {
  if (!input || typeof input.on !== "function" || !output || typeof output.write !== "function") throw new TypeError("stdio transport is invalid");
  return readline.createInterface({ input, crlfDelay: Infinity }).on("line", (line) => {
    try { output.write(`${JSON.stringify(handle(JSON.parse(line), context))}\n`); }
    catch { output.write(`${JSON.stringify(failure(null, -32700, "parse error"))}\n`); }
  });
}

module.exports = { LATEST_MCP_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS, TOOLS, callTool, enabledTools, handle, serveStdio, serverCapabilities, settings, validLatestRequestMeta };
