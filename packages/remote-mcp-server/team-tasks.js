"use strict";

const TASKS_EXTENSION = "io.modelcontextprotocol/tasks";
const TASKS_PROTOCOL_VERSION = "2026-06-30";
const LATEST_MCP_PROTOCOL_VERSION = "2026-07-28";
const TASKS_PROTOCOL_VERSIONS = Object.freeze([TASKS_PROTOCOL_VERSION, LATEST_MCP_PROTOCOL_VERSION]);
const TASK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainObject(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function result(id, value) { return { jsonrpc: "2.0", id, result: value }; }
function failure(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }
function clientSupportsTasks(params) {
  const meta = params?._meta;
  const capabilities = isPlainObject(meta) ? meta["io.modelcontextprotocol/clientCapabilities"] : undefined;
  return isPlainObject(capabilities) && isPlainObject(capabilities.extensions) && isPlainObject(capabilities.extensions[TASKS_EXTENSION]);
}
function supportsTasksProtocol(value) { return typeof value === "string" && TASKS_PROTOCOL_VERSIONS.includes(value); }
function assertTaskId(value) {
  if (typeof value !== "string" || !TASK_ID_PATTERN.test(value)) throw new TypeError("taskId is invalid");
  return value;
}
function taskTiming(job) {
  const createdAt = new Date(job.createdAt);
  const updatedAt = new Date(job.updatedAt);
  const expiresAt = new Date(job.expiresAt);
  const ttlMs = expiresAt.getTime() - createdAt.getTime();
  if (Number.isNaN(createdAt.getTime()) || Number.isNaN(updatedAt.getTime()) || Number.isNaN(expiresAt.getTime()) || !Number.isSafeInteger(ttlMs) || ttlMs < 0) throw new Error("team job task timing is invalid");
  return { createdAt: createdAt.toISOString(), lastUpdatedAt: updatedAt.toISOString(), ttlMs, pollIntervalMs: 5000 };
}
function taskToolResult(job, message, isError = false) {
  const structuredContent = { id: job.id, capability: job.capability, status: job.status, artifacts: Array.isArray(job.artifacts) ? job.artifacts : [], quality: job.quality || null };
  return { structuredContent, isError, content: [{ type: "text", text: message }] };
}
function toDetailedTask(job) {
  if (!job || typeof job !== "object" || typeof job.id !== "string" || typeof job.status !== "string") throw new TypeError("team job task is invalid");
  const task = { resultType: "complete", taskId: assertTaskId(job.id), ...taskTiming(job) };
  if (["queued", "running", "cancel_requested"].includes(job.status)) return { ...task, status: "working", statusMessage: "Team job is in progress." };
  if (job.status === "succeeded") return { ...task, status: "completed", result: taskToolResult(job, "Team job completed.") };
  if (["failed", "expired"].includes(job.status)) {
    const qualityFailure = job.error?.code === "QUALITY_GATE_FAILED";
    return { ...task, status: "completed", result: taskToolResult(job, qualityFailure ? "Team job produced artifacts but did not pass required quality gates." : "Team job did not complete.", true) };
  }
  if (job.status === "cancelled") return { ...task, status: "cancelled", statusMessage: "Team job was cancelled." };
  if (job.status === "input_required") return { ...task, status: "failed", error: { code: -32603, message: "task input state is not supported" } };
  throw new Error("team job task status is invalid");
}
function toCreatedTask(job) {
  const task = toDetailedTask(job);
  if (task.status !== "working") throw new Error("new team job task is not working");
  return { ...task, resultType: "task" };
}
async function handleTeamTask(request, { services, principal }) {
  if (!services || typeof services.getJob !== "function" || typeof services.cancelJob !== "function" || !principal || typeof principal.subject !== "string") throw new TypeError("team task context is invalid");
  const taskId = assertTaskId(request.params?.taskId);
  if (request.method === "tasks/update") return failure(request.id, -32602, "task input updates are not supported");
  const job = await services.getJob(taskId, principal.subject);
  if (!job) return failure(request.id, -32001, "task not found");
  if (request.method === "tasks/get") return result(request.id, toDetailedTask(job));
  if (request.method === "tasks/cancel") {
    await services.cancelJob(taskId, principal.subject);
    return result(request.id, { resultType: "complete" });
  }
  return failure(request.id, -32601, "method not found");
}

module.exports = { LATEST_MCP_PROTOCOL_VERSION, TASKS_EXTENSION, TASKS_PROTOCOL_VERSION, TASKS_PROTOCOL_VERSIONS, clientSupportsTasks, handleTeamTask, supportsTasksProtocol, toCreatedTask, toDetailedTask };
