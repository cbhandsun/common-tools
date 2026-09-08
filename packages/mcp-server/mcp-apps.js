"use strict";

const fs = require("node:fs");
const {
  QUALITY_REPORT_RESOURCE,
  QUALITY_REPORT_RESOURCE_URI,
  QUALITY_REPORT_UI_CONTRIBUTION
} = require("../ppt-quality-core/ui-contribution");

const MCP_UI_EXTENSION = "io.modelcontextprotocol/ui";
const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
const UI_CONTRIBUTIONS = Object.freeze([
  QUALITY_REPORT_UI_CONTRIBUTION
]);
const UI_CONTRIBUTIONS_BY_URI = new Map(UI_CONTRIBUTIONS.map((contribution) => [contribution.resource.uri, contribution]));

function plainObject(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function clientSupportsMcpApps(params) {
  const meta = plainObject(params?._meta) ? params._meta : undefined;
  const modern = meta?.["io.modelcontextprotocol/clientCapabilities"];
  const legacy = params?.capabilities;
  const capabilities = plainObject(modern) ? modern : plainObject(legacy) ? legacy : undefined;
  const extension = plainObject(capabilities?.extensions) ? capabilities.extensions[MCP_UI_EXTENSION] : undefined;
  return plainObject(extension) && Array.isArray(extension.mimeTypes) && extension.mimeTypes.includes(MCP_APP_MIME_TYPE);
}
function appServerCapabilities() {
  return Object.freeze({ resources: {}, extensions: Object.freeze({ [MCP_UI_EXTENSION]: Object.freeze({ mimeTypes: Object.freeze([MCP_APP_MIME_TYPE]) }) }) });
}
function withRegisteredApp(tool, enabled) {
  if (!enabled || !tool) return tool;
  const contribution = UI_CONTRIBUTIONS.find((candidate) => candidate.toolNames.includes(tool.name));
  return contribution ? Object.freeze({ ...tool, _meta: contribution.meta }) : tool;
}
function withQualityReportApp(tool, enabled) { return withRegisteredApp(tool, enabled); }
function listAppResources(enabled) { return enabled ? Object.freeze(UI_CONTRIBUTIONS.map((contribution) => contribution.resource)) : Object.freeze([]); }
function readAppResource(uri) {
  const contribution = UI_CONTRIBUTIONS_BY_URI.get(uri);
  if (!contribution) throw new Error("resource not found");
  const text = fs.readFileSync(contribution.file, "utf8");
  return Object.freeze({ contents: Object.freeze([Object.freeze({
    uri: contribution.resource.uri,
    mimeType: MCP_APP_MIME_TYPE,
    text,
    _meta: contribution.contentMeta
  })]) });
}

module.exports = { MCP_APP_MIME_TYPE, MCP_UI_EXTENSION, QUALITY_REPORT_RESOURCE, QUALITY_REPORT_RESOURCE_URI, UI_CONTRIBUTIONS, appServerCapabilities, clientSupportsMcpApps, listAppResources, readAppResource, withQualityReportApp, withRegisteredApp };
