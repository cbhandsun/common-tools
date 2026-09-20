"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ReadableStream } = require("node:stream/web");
const test = require("node:test");
const { admitPptCreateArchive } = require("../packages/ppt-create-core/team-archive");
const { inspectPptx } = require("../packages/ppt-quality-core");
const {
  bearerToken,
  gatewayOrigin,
  runAuthenticatedJobSmoke,
  uploadUrl
} = require("../packages/cli/team-job-smoke");
const { main } = require("../scripts/team-runtime-authenticated-job-smoke");
const { prepareLocalJobSmokeInput } = require("../scripts/team-runtime-local-job-smoke-input");

function jsonResponse(status, value) {
  const text = JSON.stringify(value);
  return {
    status,
    headers: { get: (name) => name.toLowerCase() === "content-length" ? String(Buffer.byteLength(text)) : null },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.from(text));
        controller.close();
      }
    })
  };
}

test("authenticated job smoke performs MCP upload, Job creation, polling, and artifact target lookup without echoing the token", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "PUT") return { status: 200 };
    const body = JSON.parse(options.body);
    if (body.method === "initialize") return jsonResponse(200, { jsonrpc: "2.0", id: body.id, result: { serverInfo: { name: "common-tools" } } });
    if (body.method === "tools/list") return jsonResponse(200, { jsonrpc: "2.0", id: body.id, result: { tools: ["create_team_upload_target", "create_team_job", "get_team_job"].map((name) => ({ name })) } });
    if (body.params?.name === "create_team_upload_target") return jsonResponse(200, { jsonrpc: "2.0", id: body.id, result: { structuredContent: { objectKey: "owners/hash/inputs/smoke.tar.gz", uploadUrl: "http://127.0.0.1:59000/common-tools-artifacts/owners/hash/inputs/smoke.tar.gz" } } });
    if (body.params?.name === "create_team_job") return jsonResponse(200, { jsonrpc: "2.0", id: body.id, result: { structuredContent: { id: "job-1", status: "queued" } } });
    if (body.params?.name === "get_team_job") return jsonResponse(200, { jsonrpc: "2.0", id: body.id, result: { structuredContent: { id: "job-1", status: "succeeded" } } });
    if (body.params?.name === "get_team_artifact_target") return jsonResponse(200, { jsonrpc: "2.0", id: body.id, result: { structuredContent: { downloadUrl: "http://127.0.0.1:59000/common-tools-artifacts/owners/hash/jobs/job-1/deck.pptx" } } });
    throw new Error("unexpected request");
  };
  const report = await runAuthenticatedJobSmoke({
    origin: "http://127.0.0.1:37684",
    token: "valid-token-1234567890",
    capability: "image-to-editable",
    inputFile: "unused.tar.gz",
    contentType: "application/gzip",
    idempotencyKey: "smoke-1",
    artifactName: "deck.pptx",
    wait: true,
    pollIntervalMs: 250
  }, fetchImpl, { inputBody: Buffer.from("archive") });
  assert.equal(report.passed, true);
  assert.equal(report.job.finalStatus, "succeeded");
  assert.equal(report.artifactTargetCreated, true);
  assert.equal(JSON.stringify(report).includes("valid-token"), false);
  assert.deepEqual(calls.map((call) => call.options.method), ["POST", "POST", "POST", "PUT", "POST", "POST", "POST"]);
  assert.equal(JSON.parse(calls[4].options.body).params.arguments.inputObjectKey, "owners/hash/inputs/smoke.tar.gz");
});

test("authenticated job smoke fails closed for missing credentials and unsafe remote origins", async () => {
  assert.throws(() => bearerToken("short"), /bearer token/);
  assert.throws(() => gatewayOrigin("http://mcp.example.test"), /loopback/);
  assert.equal(gatewayOrigin("http://localhost:37684"), "http://localhost:37684");
  assert.equal(gatewayOrigin("https://mcp.example.test", true), "https://mcp.example.test");
  assert.throws(() => uploadUrl("http://mcp.example.test/bucket/key"), /loopback/);
  assert.equal(uploadUrl("http://localhost:59000/bucket/key?signature=value"), "http://localhost:59000/bucket/key?signature=value");
  assert.equal(uploadUrl("https://mcp.example.test/bucket/key?signature=value", true), "https://mcp.example.test/bucket/key?signature=value");
  await assert.rejects(() => main(["--gateway-url", "http://127.0.0.1:37684", "--input-file", __filename], {}), /COMMON_TOOLS_JOB_SMOKE_TOKEN/);
});

test("local job smoke input helper prepares capability-specific upload archives", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-local-job-smoke-input-"));
  try {
    const image = prepareLocalJobSmokeInput({ capability: "image-to-editable", temporaryRoot: root });
    assert.equal(image.contentType, "application/gzip");
    assert.equal(image.defaultArtifactName, "deck.pptx");
    assert.equal(fs.readFileSync(image.inputFile)[0], 0x1f);

    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root);
    const ppt = prepareLocalJobSmokeInput({ capability: "ppt-create", temporaryRoot: root });
    assert.equal(ppt.contentType, "application/gzip");
    assert.equal(ppt.defaultArtifactName, "deck.pptx");
    const admittedRoot = path.join(root, "admitted");
    fs.mkdirSync(admittedRoot);
    const admitted = admitPptCreateArchive(fs.readFileSync(ppt.inputFile), admittedRoot);
    assert.equal(admitted.spec.title, "Common Tools remote PPT create smoke");
    assert.equal(admitted.assets.length, 0);
    assert.equal(admitted.template, undefined);

    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root);
    const quality = prepareLocalJobSmokeInput({ capability: "ppt-quality", temporaryRoot: root });
    assert.equal(quality.contentType, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    assert.equal(quality.defaultArtifactName, "ppt-quality-report.json");
    assert.equal(quality.defaultJobOptions, undefined);
    assert.equal(path.basename(quality.inputFile), "deck.pptx");
    assert.equal(inspectPptx(quality.inputFile).unusedMediaCount, 1);

    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root);
    const improve = prepareLocalJobSmokeInput({ capability: "ppt-improve", temporaryRoot: root });
    assert.equal(improve.contentType, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    assert.equal(improve.defaultArtifactName, "ppt-improve-report.json");
    assert.deepEqual(improve.defaultJobOptions, { repairProfile: "safe-package" });
    assert.equal(inspectPptx(improve.inputFile).textShapeCount, 1);

    assert.throws(() => prepareLocalJobSmokeInput({ capability: "project-audit", temporaryRoot: root }), /not defined/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
