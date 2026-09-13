"use strict";

const path = require("node:path");

const QUALITY_REPORT_RESOURCE_URI = "ui://common-tools/quality-report.html";
const QUALITY_REPORT_RESOURCE = Object.freeze({
  uri: QUALITY_REPORT_RESOURCE_URI,
  name: "common-tools-quality-report",
  description: "Read-only quality-report view for common-tools Jobs.",
  mimeType: "text/html;profile=mcp-app",
  _meta: Object.freeze({ ui: Object.freeze({ prefersBorder: true }) })
});
const QUALITY_REPORT_UI_CONTRIBUTION = Object.freeze({
  resource: QUALITY_REPORT_RESOURCE,
  toolNames: Object.freeze(["get_job", "get_project_audit_report", "get_ppt_quality_report", "get_ppt_improve_report", "get_team_job"]),
  file: path.join(__dirname, "apps", "quality-report.html"),
  meta: Object.freeze({ ui: Object.freeze({ resourceUri: QUALITY_REPORT_RESOURCE_URI, visibility: Object.freeze(["model"]) }) }),
  contentMeta: Object.freeze({ ui: Object.freeze({ csp: Object.freeze({ connectDomains: Object.freeze([]), resourceDomains: Object.freeze([]), frameDomains: Object.freeze([]), baseUriDomains: Object.freeze([]) }), prefersBorder: true }) })
});

module.exports = {
  QUALITY_REPORT_RESOURCE,
  QUALITY_REPORT_RESOURCE_URI,
  QUALITY_REPORT_UI_CONTRIBUTION
};
