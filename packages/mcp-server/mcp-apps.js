"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MCP_UI_EXTENSION = "io.modelcontextprotocol/ui";
const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
const QUALITY_REPORT_RESOURCE_URI = "ui://common-tools/quality-report.html";
const QUALITY_REPORT_TOOL_NAMES = new Set(["get_job", "get_project_audit_report", "get_ppt_quality_report", "get_ppt_improve_report", "get_team_job"]);
const QUALITY_REPORT_RESOURCE = Object.freeze({
  uri: QUALITY_REPORT_RESOURCE_URI,
  name: "common-tools-quality-report",
  description: "Read-only quality-report view for common-tools Jobs.",
  mimeType: MCP_APP_MIME_TYPE,
  _meta: Object.freeze({ ui: Object.freeze({ prefersBorder: true }) })
});

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
function withQualityReportApp(tool, enabled) {
  if (!enabled || !tool || !QUALITY_REPORT_TOOL_NAMES.has(tool.name)) return tool;
  return Object.freeze({ ...tool, _meta: Object.freeze({ ui: Object.freeze({ resourceUri: QUALITY_REPORT_RESOURCE_URI, visibility: Object.freeze(["model"]) }) }) });
}
function listAppResources(enabled) { return enabled ? Object.freeze([QUALITY_REPORT_RESOURCE]) : Object.freeze([]); }
function readAppResource(uri) {
  if (uri !== QUALITY_REPORT_RESOURCE_URI) throw new Error("resource not found");
  const text = fs.readFileSync(path.join(__dirname, "apps", "quality-report.html"), "utf8");
  return Object.freeze({ contents: Object.freeze([Object.freeze({
    uri: QUALITY_REPORT_RESOURCE_URI,
    mimeType: MCP_APP_MIME_TYPE,
    text,
    _meta: Object.freeze({ ui: Object.freeze({ csp: Object.freeze({ connectDomains: Object.freeze([]), resourceDomains: Object.freeze([]), frameDomains: Object.freeze([]), baseUriDomains: Object.freeze([]) }), prefersBorder: true }) })
  })]) });
}

module.exports = { MCP_APP_MIME_TYPE, MCP_UI_EXTENSION, QUALITY_REPORT_RESOURCE, QUALITY_REPORT_RESOURCE_URI, appServerCapabilities, clientSupportsMcpApps, listAppResources, readAppResource, withQualityReportApp };
