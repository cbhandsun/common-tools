"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");

const { boundedJson } = require("./remote-access-canary");

const MAX_INPUT_BYTES = 100 * 1024 * 1024;
const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled", "expired"]);

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} is invalid`);
  return value;
}

function gatewayOrigin(value, allowRemote = false) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) throw new Error("authenticated job smoke gateway URL is invalid");
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("authenticated job smoke gateway URL is invalid"); }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== "/" && parsed.pathname !== "")) throw new Error("authenticated job smoke gateway URL must be an origin");
  if (parsed.protocol === "http:" && parsed.hostname === "127.0.0.1" && parsed.port && Number(parsed.port) >= 1024 && Number(parsed.port) <= 65535) return parsed.origin;
  if (allowRemote === true && parsed.protocol === "https:") return parsed.origin;
  throw new Error("authenticated job smoke gateway URL must be a loopback HTTP origin unless --allow-remote is set for HTTPS");
}

function uploadUrl(value, allowRemote = false) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096) throw new Error("authenticated job smoke upload URL is invalid");
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("authenticated job smoke upload URL is invalid"); }
  if (parsed.username || parsed.password || !parsed.pathname || parsed.pathname === "/") throw new Error("authenticated job smoke upload URL is invalid");
  if (parsed.protocol === "http:" && parsed.hostname === "127.0.0.1" && parsed.port && Number(parsed.port) >= 1024 && Number(parsed.port) <= 65535) return parsed.href;
  if (allowRemote === true && parsed.protocol === "https:") return parsed.href;
  throw new Error("authenticated job smoke upload URL must be loopback HTTP unless --allow-remote is set for HTTPS");
}

function bearerToken(value) {
  if (typeof value !== "string" || value.length < 16 || value.length > 16384 || /[\r\n]/.test(value)) throw new Error("authenticated job smoke bearer token is invalid");
  return value;
}

function capability(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{2,63}$/.test(value)) throw new Error("authenticated job smoke capability is invalid");
  return value;
}

function projectId(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]{2,63}$/.test(value)) throw new Error("authenticated job smoke project ID is invalid");
  return value;
}

function idempotencyKey(value = `job-smoke-${crypto.randomUUID()}`) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(value)) throw new Error("authenticated job smoke idempotency key is invalid");
  return value;
}

function contentType(value = "application/gzip") {
  if (typeof value !== "string" || !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(value)) throw new Error("authenticated job smoke content type is invalid");
  return value.toLowerCase();
}

function artifactName(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(value)) throw new Error("authenticated job smoke artifact name is invalid");
  return value;
}

function timeoutMs(value = 8000) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1000 || parsed > 60000) throw new Error("authenticated job smoke timeout is invalid");
  return parsed;
}

function pollOptions(options = {}) {
  const wait = options.wait === true;
  const maxWaitMs = Number(options.maxWaitMs ?? 120000);
  const intervalMs = Number(options.pollIntervalMs ?? 3000);
  if (!Number.isSafeInteger(maxWaitMs) || maxWaitMs < 1000 || maxWaitMs > 30 * 60 * 1000) throw new Error("authenticated job smoke max wait is invalid");
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 250 || intervalMs > 30000) throw new Error("authenticated job smoke poll interval is invalid");
  return Object.freeze({ wait, maxWaitMs, intervalMs });
}

function readInputFile(inputFile, readFile = fs.readFileSync) {
  if (typeof inputFile !== "string" || !inputFile.trim()) throw new Error("authenticated job smoke input file is required");
  const body = readFile(inputFile);
  if (!Buffer.isBuffer(body) || body.length < 1 || body.length > MAX_INPUT_BYTES) throw new Error("authenticated job smoke input file is invalid");
  return body;
}

async function mcpRequest(fetchImpl, origin, token, body, requestTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetchImpl(`${origin}/mcp`, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await boundedJson(response) };
  } catch {
    throw new Error("authenticated job smoke MCP request failed");
  } finally {
    clearTimeout(timer);
  }
}

async function uploadInput(fetchImpl, targetUrl, body, type, requestTimeoutMs, allowRemote) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetchImpl(uploadUrl(targetUrl, allowRemote), {
      method: "PUT",
      redirect: "error",
      signal: controller.signal,
      headers: { "Content-Type": type, "Content-Length": String(body.length) },
      body
    });
    if (response.status < 200 || response.status >= 300) throw new Error("authenticated job smoke upload failed");
  } catch {
    throw new Error("authenticated job smoke upload failed");
  } finally {
    clearTimeout(timer);
  }
}

function assertMcpSuccess(response, label) {
  if (response.status !== 200 || response.body?.error || response.body?.result?.isError === true) throw new Error(`${label} failed`);
  return response.body?.result?.structuredContent || response.body?.result;
}

function toolCall(id, name, args) {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAuthenticatedJobSmoke(options, fetchImpl = globalThis.fetch, dependencies = {}) {
  assertPlainObject(options, "authenticated job smoke options");
  if (typeof fetchImpl !== "function") throw new TypeError("authenticated job smoke fetch implementation is invalid");
  const origin = gatewayOrigin(options.origin, options.allowRemote === true);
  const token = bearerToken(options.token);
  const selectedCapability = capability(options.capability);
  const selectedProject = projectId(options.projectId);
  const type = contentType(options.contentType);
  const requestTimeoutMs = timeoutMs(options.timeoutMs);
  const selectedArtifactName = artifactName(options.artifactName);
  const polling = pollOptions(options);
  const input = dependencies.inputBody || readInputFile(options.inputFile, dependencies.readFile);
  if (!Buffer.isBuffer(input) || input.length < 1 || input.length > MAX_INPUT_BYTES) throw new Error("authenticated job smoke input file is invalid");
  const baseArgs = selectedProject ? { projectId: selectedProject } : {};

  const initialize = assertMcpSuccess(await mcpRequest(fetchImpl, origin, token, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "common-tools-authenticated-job-smoke", version: "1" } } }, requestTimeoutMs), "initialize");
  if (initialize?.serverInfo?.name !== "common-tools") throw new Error("authenticated job smoke initialized an unexpected MCP server");

  const listed = assertMcpSuccess(await mcpRequest(fetchImpl, origin, token, { jsonrpc: "2.0", id: 2, method: "tools/list" }, requestTimeoutMs), "tools/list");
  const toolNames = Array.isArray(listed?.tools) ? listed.tools.map((tool) => tool?.name).filter((name) => typeof name === "string") : [];
  for (const required of ["create_team_upload_target", "create_team_job", "get_team_job"]) if (!toolNames.includes(required)) throw new Error(`authenticated job smoke missing tool: ${required}`);

  const upload = assertMcpSuccess(await mcpRequest(fetchImpl, origin, token, toolCall(3, "create_team_upload_target", { ...baseArgs, capability: selectedCapability, contentType: type, contentLength: input.length }), requestTimeoutMs), "create_team_upload_target");
  if (typeof upload?.objectKey !== "string" || typeof upload.uploadUrl !== "string") throw new Error("authenticated job smoke upload target is invalid");
  await uploadInput(fetchImpl, upload.uploadUrl, input, type, requestTimeoutMs, options.allowRemote === true);

  const created = assertMcpSuccess(await mcpRequest(fetchImpl, origin, token, toolCall(4, "create_team_job", { ...baseArgs, capability: selectedCapability, inputObjectKey: upload.objectKey, idempotencyKey: idempotencyKey(options.idempotencyKey), ...(options.jobOptions ? { options: assertPlainObject(options.jobOptions, "authenticated job smoke job options") } : {}) }), requestTimeoutMs), "create_team_job");
  if (typeof created?.id !== "string" || typeof created.status !== "string") throw new Error("authenticated job smoke created job is invalid");

  let job = created;
  let polls = 0;
  if (polling.wait) {
    const deadline = Date.now() + polling.maxWaitMs;
    while (!TERMINAL_STATUSES.has(job.status) && Date.now() < deadline) {
      polls += 1;
      await sleep(polling.intervalMs);
      job = assertMcpSuccess(await mcpRequest(fetchImpl, origin, token, toolCall(5 + polls, "get_team_job", { ...baseArgs, id: created.id }), requestTimeoutMs), "get_team_job");
      if (typeof job?.status !== "string") throw new Error("authenticated job smoke job response is invalid");
    }
    if (!TERMINAL_STATUSES.has(job.status)) throw new Error("authenticated job smoke timed out waiting for job completion");
  }

  let artifactTarget;
  if (selectedArtifactName && job.status === "succeeded") {
    artifactTarget = assertMcpSuccess(await mcpRequest(fetchImpl, origin, token, toolCall(1000, "get_team_artifact_target", { ...baseArgs, id: created.id, name: selectedArtifactName }), requestTimeoutMs), "get_team_artifact_target");
    if (typeof artifactTarget?.downloadUrl !== "string") throw new Error("authenticated job smoke artifact target is invalid");
  }

  return Object.freeze({
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    origin,
    capability: selectedCapability,
    projectId: selectedProject || null,
    inputBytes: input.length,
    uploadCreated: true,
    uploaded: true,
    job: Object.freeze({ id: created.id, createdStatus: created.status, finalStatus: job.status, waited: polling.wait, polls }),
    artifactTargetCreated: Boolean(artifactTarget),
    passed: !polling.wait || job.status === "succeeded"
  });
}

module.exports = {
  MAX_INPUT_BYTES,
  artifactName,
  bearerToken,
  capability,
  contentType,
  gatewayOrigin,
  idempotencyKey,
  projectId,
  readInputFile,
  runAuthenticatedJobSmoke,
  timeoutMs,
  uploadUrl
};
