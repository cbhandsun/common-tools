"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { TASKS_EXTENSION, clientSupportsTasks, handleTeamTask, toCreatedTask, toDetailedTask } = require("../packages/remote-mcp-server/team-tasks");

const TASK_ID = "b7f5d1be-3d34-4f20-9e0b-b45c1697b516";
function job(overrides = {}) {
  return {
    id: TASK_ID,
    capability: "project-audit",
    status: "queued",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:01.000Z",
    expiresAt: "2026-08-02T00:00:00.000Z",
    artifacts: [],
    ...overrides
  };
}
function context(currentJob = job()) {
  const calls = [];
  return {
    calls,
    principal: { subject: "member-1" },
    services: {
      async getJob(id, ownerId) { calls.push(["get", id, ownerId]); return id === TASK_ID && ownerId === "member-1" ? currentJob : null; },
      async cancelJob(id, ownerId) { calls.push(["cancel", id, ownerId]); return job({ id, status: "cancel_requested" }); }
    }
  };
}

test("Tasks projection exposes bounded task metadata and opt-in negotiation", () => {
  const created = toCreatedTask(job());
  assert.equal(created.resultType, "task");
  assert.equal(created.status, "working");
  assert.equal(created.taskId, TASK_ID);
  assert.equal(created.ttlMs, 86400000);
  assert.equal(created.pollIntervalMs, 5000);
  assert.equal(Object.hasOwn(created, "ownerId"), false);
  assert.equal(clientSupportsTasks({ _meta: { "io.modelcontextprotocol/clientCapabilities": { extensions: { [TASKS_EXTENSION]: {} } } } }), true);
  assert.equal(clientSupportsTasks({ _meta: { "io.modelcontextprotocol/clientCapabilities": { extensions: { [TASKS_EXTENSION]: [] } } } }), false);
  assert.equal(clientSupportsTasks({}), false);
});

test("Tasks projection maps terminal jobs without exposing raw failure details", () => {
  const succeeded = toDetailedTask(job({ status: "succeeded", artifacts: [{ name: "report.json" }] }));
  assert.equal(succeeded.status, "completed");
  assert.equal(succeeded.result.isError, false);
  assert.deepEqual(succeeded.result.structuredContent.artifacts, [{ name: "report.json" }]);
  const failed = toDetailedTask(job({ status: "failed", error: "database password=not-for-clients" }));
  assert.equal(failed.status, "completed");
  assert.equal(failed.result.isError, true);
  assert.doesNotMatch(JSON.stringify(failed), /password/);
  const qualityFailure = toDetailedTask(job({ status: "failed", artifacts: [{ name: "deck.pptx" }], quality: { passed: false }, error: { code: "QUALITY_GATE_FAILED", message: "sensitive internals" } }));
  assert.equal(qualityFailure.result.isError, true);
  assert.match(qualityFailure.result.content[0].text, /produced artifacts.*quality gates/i);
  assert.deepEqual(qualityFailure.result.structuredContent.artifacts, [{ name: "deck.pptx" }]);
  assert.doesNotMatch(JSON.stringify(qualityFailure), /sensitive internals/);
  assert.throws(() => toDetailedTask(job({ updatedAt: "invalid" })), /timing/);
  assert.throws(() => toDetailedTask(job({ id: "job-1" })), /taskId/);
});

test("Tasks access is creator-bound and rejects unsupported input updates", async () => {
  const ctx = context();
  const read = await handleTeamTask({ jsonrpc: "2.0", id: 1, method: "tasks/get", params: { taskId: TASK_ID } }, ctx);
  assert.equal(read.result.status, "working");
  assert.deepEqual(ctx.calls[0], ["get", TASK_ID, "member-1"]);
  const cancelled = await handleTeamTask({ jsonrpc: "2.0", id: 2, method: "tasks/cancel", params: { taskId: TASK_ID } }, ctx);
  assert.deepEqual(cancelled.result, { resultType: "complete" });
  assert.deepEqual(ctx.calls[2], ["cancel", TASK_ID, "member-1"]);
  const update = await handleTeamTask({ jsonrpc: "2.0", id: 3, method: "tasks/update", params: { taskId: TASK_ID, inputResponses: { accepted: "x" } } }, ctx);
  assert.deepEqual(update.error, { code: -32602, message: "task input updates are not supported" });
  assert.equal(ctx.calls.length, 3);
  const unknown = await handleTeamTask({ jsonrpc: "2.0", id: 4, method: "tasks/get", params: { taskId: "c7f5d1be-3d34-4f20-9e0b-b45c1697b516" } }, ctx);
  assert.equal(unknown.error.code, -32001);
});
