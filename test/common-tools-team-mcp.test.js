"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { TEAM_TOOLS, callTeamTool, handleTeamMcp } = require("../packages/remote-mcp-server/team-mcp");

function context() {
  const calls = [];
  return {
    calls,
    principal: { subject: "member-1", capabilities: new Set(["project-audit"]) },
    services: {
      async createUploadTarget(value) { calls.push(["upload", value]); return { objectKey: "owners/hash/inputs/one", uploadUrl: "https://objects.example.test/one" }; },
      async createJob(value) { calls.push(["job", value]); return { id: "job-1", status: "queued", ...value }; },
      async getJob(id, ownerId) { calls.push(["get", { id, ownerId }]); return { id, ownerId, capability: "project-audit", status: "queued" }; },
      async cancelJob(id, ownerId) { calls.push(["cancel", { id, ownerId }]); return { id, ownerId, capability: "project-audit", status: "cancel_requested" }; },
      async getArtifactTarget(value) { calls.push(["artifact", value]); return { downloadUrl: "https://objects.example.test/artifact" }; },
      async getProjectJob(id, projectId) { calls.push(["project-get", { id, projectId }]); return { id, projectId, capability: "project-audit", status: "queued" }; },
      async cancelProjectJob(id, projectId, actorId) { calls.push(["project-cancel", { id, projectId, actorId }]); return { id, projectId, capability: "project-audit", status: "cancel_requested" }; },
      async getProjectArtifactTarget(value) { calls.push(["project-artifact", value]); return { downloadUrl: "https://objects.example.test/project-artifact" }; }
    },
    now: () => Date.UTC(2026, 7, 1)
  };
}

test("team MCP exposes a fixed tool surface and scopes input capability", async () => {
  const ctx = context();
  const listed = await handleTeamMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx);
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ["create_team_upload_target", "create_team_job", "get_team_job", "cancel_team_job", "get_team_artifact_target"]);
  assert.deepEqual(listed.result.tools.find((tool) => tool.name === "create_team_upload_target").inputSchema.properties.capability.enum, ["project-audit"]);
  for (const tool of listed.result.tools) {
    assert.equal(tool.outputSchema.type, "object");
    assert.deepEqual(Object.keys(tool.annotations).sort(), ["destructiveHint", "idempotentHint", "openWorldHint", "readOnlyHint"]);
  }
  const upload = await callTeamTool("create_team_upload_target", { capability: "project-audit", contentType: "application/gzip", contentLength: 12 }, ctx);
  assert.match(upload.objectKey, /^owners\//);
  await assert.rejects(() => callTeamTool("create_team_upload_target", { capability: "image-to-editable", contentType: "image/png", contentLength: 12 }, ctx), /not authorized/);
  assert.equal(ctx.calls[0][1].ownerId, "member-1");
});

test("team MCP fails closed when a service violates its declared tool output", async () => {
  const ctx = context();
  ctx.services.getJob = async () => ({ id: "job-1" });
  await assert.rejects(() => callTeamTool("get_team_job", { id: "job-1" }, ctx), /output does not match/);
  assert.equal(TEAM_TOOLS.every((tool) => tool.outputSchema && tool.annotations), true);
});

test("team MCP exposes the quality-report App only to a UI-capable host", async () => {
  const ctx = context();
  const appMeta = { "io.modelcontextprotocol/clientCapabilities": { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } } };
  const plain = await handleTeamMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx);
  const app = await handleTeamMcp({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: appMeta } }, ctx);
  const resources = await handleTeamMcp({ jsonrpc: "2.0", id: 3, method: "resources/list", params: { _meta: appMeta } }, ctx);
  const resource = await handleTeamMcp({ jsonrpc: "2.0", id: 4, method: "resources/read", params: { uri: "ui://common-tools/quality-report.html" } }, ctx);
  assert.equal(Object.hasOwn(plain.result.tools.find((tool) => tool.name === "get_team_job"), "_meta"), false);
  assert.equal(app.result.tools.find((tool) => tool.name === "get_team_job")._meta.ui.resourceUri, "ui://common-tools/quality-report.html");
  assert.deepEqual(resources.result.resources.map((item) => item.mimeType), ["text/html;profile=mcp-app"]);
  assert.match(resource.result.contents[0].text, /Quality report/);
});

test("team MCP hides disabled capability creation and rejects disabled jobs", async () => {
  const ctx = context();
  ctx.principal.capabilities = new Set(["project-audit", "image-to-editable"]);
  ctx.enabledCapabilities = ["project-audit"];
  const listed = await handleTeamMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx);
  assert.deepEqual(listed.result.tools.find((tool) => tool.name === "create_team_job").inputSchema.properties.capability.enum, ["project-audit"]);
  const response = await handleTeamMcp({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_team_job", arguments: { capability: "image-to-editable", inputObjectKey: "owners/hash/inputs/one", idempotencyKey: "disabled-capability" } } }, ctx);
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /not authorized/);
  assert.equal(ctx.calls.length, 0);
});

test("team MCP validates unknown input and never forwards owner identifiers from callers", async () => {
  const ctx = context();
  const response = await handleTeamMcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_team_job", arguments: { capability: "project-audit", inputObjectKey: "owners/hash/inputs/one", idempotencyKey: "request-1", ownerId: "attacker" } } }, ctx);
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /unexpected tool argument/);
  const job = await callTeamTool("create_team_job", { capability: "project-audit", inputObjectKey: "owners/hash/inputs/one", idempotencyKey: "request-1" }, ctx);
  assert.equal(job.ownerId, "member-1");
});

test("team MCP forwards only bounded PPT improvement options", async () => {
  const ctx = context();
  ctx.principal.capabilities = new Set(["ppt-improve"]);
  ctx.enabledCapabilities = ["ppt-improve"];
  const listed = await handleTeamMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx);
  const createJob = listed.result.tools.find((tool) => tool.name === "create_team_job");
  assert.deepEqual(createJob.inputSchema.properties.options.properties.repairProfile.enum, ["safe-package", "layout-safe", "typography-safe", "editability-safe", "audit-only"]);
  await callTeamTool("create_team_job", { capability: "ppt-improve", inputObjectKey: "owners/hash/inputs/deck.pptx", idempotencyKey: "audit-only", options: { repairProfile: "audit-only" } }, ctx);
  assert.deepEqual(ctx.calls[0][1].options, { repairProfile: "audit-only" });
  await assert.rejects(() => callTeamTool("create_team_job", { capability: "project-audit", inputObjectKey: "owners/hash/inputs/deck", idempotencyKey: "bad", options: { repairProfile: "audit-only" } }, context()), /options/);
});

test("team MCP accepts trace parent only from its trusted transport context", async () => {
  const ctx = context();
  ctx.traceParent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
  await callTeamTool("create_team_job", { capability: "project-audit", inputObjectKey: "owners/hash/inputs/one", idempotencyKey: "request-1" }, ctx);
  assert.equal(ctx.calls[0][1].traceParent, ctx.traceParent);
  await assert.rejects(() => callTeamTool("create_team_job", { capability: "project-audit", inputObjectKey: "owners/hash/inputs/one", idempotencyKey: "request-2", traceParent: "attacker-controlled" }, ctx), /unexpected tool argument/);
});

test("team MCP returns a Tasks result only after protocol and client opt-in", async () => {
  const ctx = context();
  ctx.tasksEnabled = true;
  ctx.protocolVersion = "2026-06-30";
  ctx.services.createJob = async (value) => ({ id: "b7f5d1be-3d34-4f20-9e0b-b45c1697b516", status: "queued", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:01.000Z", expiresAt: "2026-08-02T00:00:00.000Z", artifacts: [], ...value });
  const initialized = await handleTeamMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2026-06-30" } }, ctx);
  assert.deepEqual(initialized.result.capabilities.extensions, { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] }, "io.modelcontextprotocol/tasks": {} });
  const discovered = await handleTeamMcp({ jsonrpc: "2.0", id: 2, method: "server/discover" }, ctx);
  assert.deepEqual(discovered.result.capabilities.extensions, { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] }, "io.modelcontextprotocol/tasks": {} });
  const listed = await handleTeamMcp({ jsonrpc: "2.0", id: 3, method: "tools/list" }, ctx);
  const createJob = listed.result.tools.find((tool) => tool.name === "create_team_job");
  assert.deepEqual(createJob.execution, { taskSupport: "optional" });
  assert.deepEqual(createJob.annotations, { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  const created = await handleTeamMcp({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "create_team_job", arguments: { capability: "project-audit", inputObjectKey: "owners/hash/inputs/one", idempotencyKey: "tasks-request" }, _meta: { "io.modelcontextprotocol/clientCapabilities": { extensions: { "io.modelcontextprotocol/tasks": {} } } } } }, ctx);
  assert.equal(created.result.resultType, "task");
  assert.equal(created.result.status, "working");
  const fallback = await handleTeamMcp({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "create_team_job", arguments: { capability: "project-audit", inputObjectKey: "owners/hash/inputs/two", idempotencyKey: "fallback-request" } } }, ctx);
  assert.equal(fallback.result.structuredContent.id, "b7f5d1be-3d34-4f20-9e0b-b45c1697b516");
});

test("team MCP requires project roles before exposing project-scoped Jobs", async () => {
  const ctx = context();
  ctx.requireProjectRbac = true;
  ctx.principal.projects = new Map([["product-core", "editor"]]);
  const listed = await handleTeamMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx);
  assert.equal(listed.result.tools.find((tool) => tool.name === "create_team_job").inputSchema.required.includes("projectId"), true);
  const created = await callTeamTool("create_team_job", { capability: "project-audit", projectId: "product-core", inputObjectKey: "owners/hash/inputs/one", idempotencyKey: "project-request" }, ctx);
  assert.equal(created.projectId, "product-core");
  assert.equal(ctx.calls[0][1].projectId, "product-core");
  await assert.rejects(() => callTeamTool("get_team_job", { id: "job-1" }, ctx), /projectId/);
  await assert.rejects(() => callTeamTool("get_team_job", { id: "job-1", projectId: "other-project" }, ctx), /not authorized/);
  const viewed = await callTeamTool("get_team_job", { id: "job-1", projectId: "product-core" }, ctx);
  assert.equal(viewed.projectId, "product-core");
  ctx.principal.projects = new Map([["product-core", "viewer"]]);
  await assert.rejects(() => callTeamTool("cancel_team_job", { id: "job-1", projectId: "product-core" }, ctx), /not authorized/);
});
