"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { JobStore, setCapabilityEnabled } = require("../packages/capability-runtime");
const { VISUAL_REPORT_NAME } = require("../packages/slideclone-core");
const { callTool } = require("../packages/mcp-server/core");
const cli = path.join(__dirname, "..", "packages", "cli", "bin", "common-tools.js");
const { doctorReport, optionalUmiOcr } = require("../packages/cli/bin/common-tools");

test("worker doctor does not require access to the host Docker daemon", () => {
  // The worker doctor probes the locally installed .NET runtime. On a cold
  // Windows process under the parallel suite that can legitimately exceed the
  // MCP request fixture timeout; retain a bounded process guard without
  // conflating runtime discovery with the protocol tests below.
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-worker-doctor-"));
  try {
    const result = spawnSync(process.execPath, [cli, "doctor", "--mode", "worker", "--workspace", workspace, "--state", path.join(workspace, "state")], { encoding: "utf8", timeout: 15000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    const response = JSON.parse(result.stdout);
    assert.equal(response.mode, "worker");
    assert.equal(response.docker.available, null);
    assert.equal(response.capability, null);
    assert.match(response.dotnet.version || "", /^Microsoft\.(AspNetCore|NETCore)\.App/);
    assert.equal(response.required.workspace, true);
    assert.equal(response.executable, true);
    assert.equal(typeof response.optionalAccelerators.ocr.available, "boolean");
    assert.equal(Object.hasOwn(response.optionalAccelerators, "asposeSlidesLicense"), false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("local image doctor validates the bundled engine without requiring Docker", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-local-image-doctor-"));
  try {
    const unavailableDocker = (name) => ({ available: name !== "docker", status: name === "docker" ? 1 : 0, version: name === "docker" ? null : "available" });
    const report = doctorReport({ capability: "image-to-editable", workspace }, {}, { workspace, runCommand: unavailableDocker, umiOcr: { configured: false, available: false, source: null } });
    assert.equal(report.exitCode, 0);
    assert.equal(report.info.docker.available, false);
    assert.equal(report.info.required.docker, true);
    assert.equal(report.info.required.imageToEditableEngine, true);
    assert.equal(report.info.imageToEditableEngine.available, true);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("doctor separates blocking prerequisites from optional OCR accelerators", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-doctor-"));
  try {
    const executable = (name) => ({ available: name !== "tesseract", status: name === "tesseract" ? 1 : 0, version: name === "tesseract" ? null : "available" });
    const report = doctorReport({ mode: "worker", capability: "image-to-editable", workspace }, {}, { workspace, runCommand: executable, umiOcr: { configured: false, available: false, source: null } });
    assert.equal(report.exitCode, 0);
    assert.equal(report.info.executable, true);
    assert.deepEqual(report.info.blocking, []);
    assert.equal(report.info.required.dotnet, true);
    assert.equal(report.info.required.imageToEditableEngine, true);
    assert.equal(report.info.optionalAccelerators.ocr.available, false);
    assert.deepEqual(report.info.optionalAccelerators.ocr.providers, { tesseract: false, umiPaddle: false });
    assert.deepEqual(report.info.optionalAccelerators.umiPaddleOcr, { configured: false, available: false, source: null, purpose: "local PaddleOCR JSON text extraction" });
    assert.equal(Object.hasOwn(report.info.optionalAccelerators, "asposeSlidesLicense"), false);

    const blocked = doctorReport({ mode: "worker", capability: "image-to-editable", workspace }, {}, { workspace, runCommand: (name) => ({ available: name !== "dotnet", status: name === "dotnet" ? 1 : 0, version: null }), umiOcr: { configured: false, available: false, source: null } });
    assert.equal(blocked.exitCode, 2);
    assert.deepEqual(blocked.info.blocking, ["dotnet"]);

    const incompleteRuntime = doctorReport({ mode: "worker", capability: "image-to-editable", workspace }, {}, { workspace, runCommand: executable, imageEngine: { available: false, reason: "entry-point-missing" }, umiOcr: { configured: false, available: false, source: null } });
    assert.equal(incompleteRuntime.exitCode, 2);
    assert.deepEqual(incompleteRuntime.info.blocking, ["imageToEditableEngine"]);
    assert.deepEqual(incompleteRuntime.info.imageToEditableEngine, { available: false, reason: "entry-point-missing" });
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("doctor recognizes a configured Umi PaddleOCR executable without exposing its path", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-doctor-umi-"));
  try {
    const executable = path.join(workspace, "PaddleOCR-json.exe");
    fs.writeFileSync(executable, "fixture", "utf8");
    const umiOcr = optionalUmiOcr({ "umi-ocr-bin": executable }, {}, fs, "win32");
    assert.deepEqual(umiOcr, { configured: true, available: true, source: "configured" });
    const report = doctorReport(
      { mode: "worker", capability: "image-to-editable", workspace },
      {},
      { workspace, runCommand: (name) => ({ available: name !== "tesseract", status: name === "tesseract" ? 1 : 0, version: null }), umiOcr }
    );
    assert.equal(report.info.optionalAccelerators.ocr.available, true);
    assert.deepEqual(report.info.optionalAccelerators.ocr.providers, { tesseract: false, umiPaddle: true });
    assert.deepEqual(report.info.optionalAccelerators.umiPaddleOcr, { configured: true, available: true, source: "configured", purpose: "local PaddleOCR JSON text extraction" });
    assert.equal(JSON.stringify(report.info).includes("PaddleOCR-json.exe"), false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("doctor fails closed for malformed project runtime configuration without exposing its contents", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-doctor-runtime-invalid-"));
  try {
    fs.mkdirSync(path.join(workspace, ".common-tools"));
    fs.writeFileSync(path.join(workspace, ".common-tools", "runtime.json"), "{", "utf8");
    const report = doctorReport({ mode: "worker", workspace }, {}, { workspace, runCommand: () => ({ available: true, status: 0, version: "available" }) });
    assert.equal(report.exitCode, 2);
    assert.deepEqual(report.info.runtime, { valid: false });
    assert.equal(report.info.required.runtimeConfiguration, false);
    assert.deepEqual(report.info.blocking, ["runtimeConfiguration"]);
    assert.equal(report.info.executable, false);
    assert.equal(JSON.stringify(report.info).includes("runtime.json"), false);
    assert.equal(JSON.stringify(report.info).includes("allowedCapabilities"), false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

const server = path.join(__dirname, "..", "packages", "mcp-server", "bin", "common-tools-mcp.js");
test("CLI mcp serve exposes the same newline-delimited stdio transport", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-mcp-cli-default-"));
  try {
    const request = `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`;
    const result = spawnSync(process.execPath, [cli, "mcp", "serve", "--workspace", workspace, "--state", path.join(workspace, "state")], { input: request, encoding: "utf8", timeout: 15000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).result.tools.map((tool) => tool.name), ["health_check", "create_editable_job", "get_job", "cancel_job", "list_job_artifacts"]);
    assert.equal(result.stderr, "");
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("CLI mcp serve honors its explicit Runtime state and workspace scope", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-mcp-cli-scope-"));
  const state = path.join(workspace, "state");
  try {
    setCapabilityEnabled(state, "image-to-editable", false);
    setCapabilityEnabled(state, "project-audit", true);
    const request = `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`;
    const result = spawnSync(process.execPath, [cli, "mcp", "serve", "--workspace", workspace, "--state", state, "--owner", "scoped-user"], { input: request, encoding: "utf8", timeout: 15000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).result.tools.map((tool) => tool.name), ["health_check", "create_project_audit_job", "get_project_audit_report"]);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("project runtime scope narrows local MCP tools without expanding the user state", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-mcp-project-scope-"));
  const state = path.join(workspace, "state");
  try {
    setCapabilityEnabled(state, "project-audit", true);
    fs.mkdirSync(path.join(workspace, ".common-tools"));
    fs.writeFileSync(path.join(workspace, ".common-tools", "runtime.json"), JSON.stringify({ allowedCapabilities: ["project-audit"] }), "utf8");
    const request = `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`;
    const result = spawnSync(process.execPath, [cli, "mcp", "serve", "--workspace", workspace, "--state", state], { input: request, encoding: "utf8", timeout: 15000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).result.tools.map((tool) => tool.name), ["health_check", "create_project_audit_job", "get_project_audit_report"]);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("malformed project runtime scope fails closed with a classified MCP error", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-mcp-project-scope-invalid-"));
  try {
    fs.mkdirSync(path.join(workspace, ".common-tools"));
    fs.writeFileSync(path.join(workspace, ".common-tools", "runtime.json"), "{", "utf8");
    const request = `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`;
    const result = spawnSync(process.execPath, [cli, "mcp", "serve", "--workspace", workspace, "--state", path.join(workspace, "state")], { input: request, encoding: "utf8", timeout: 15000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { jsonrpc: "2.0", id: 1, error: { code: -32603, message: "runtime configuration is invalid" } });
    assert.equal(result.stdout.includes(workspace), false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("stdio MCP supports final 2026-07 discovery without an initialize handshake", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-mcp-discovery-"));
  try {
  const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28" };
  const input = [
    { jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: meta } },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: meta } },
    { jsonrpc: "2.0", id: 3, method: "initialize", params: { protocolVersion: "2026-07-28", _meta: meta } }
  ].map(JSON.stringify).join("\n") + "\n";
  const result = spawnSync(process.execPath, [server], { input, encoding: "utf8", timeout: 15000, windowsHide: true, env: { ...process.env, COMMON_TOOLS_WORKSPACE: workspace, COMMON_TOOLS_STATE: path.join(workspace, "state") } });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  const [discovered, listed, initialized] = result.stdout.trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(discovered.result.resultType, "complete");
  assert.equal(discovered.result.supportedVersions.includes("2026-07-28"), true);
  assert.deepEqual(discovered.result._meta["io.modelcontextprotocol/serverInfo"], { name: "common-tools", version: "0.1.0" });
  assert.equal(Object.prototype.hasOwnProperty.call(discovered.result, "serverInfo"), false);
  assert.equal(listed.result.resultType, "complete");
  assert.equal(listed.result.tools.length > 0, true);
  assert.equal(initialized.error.code, -32601);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("stdio MCP exposes a negotiated read-only quality-report App with a safe local resource", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-mcp-app-"));
  try {
  const appCapability = { "io.modelcontextprotocol/clientCapabilities": { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } } };
  const input = [
    { jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: appCapability } },
    { jsonrpc: "2.0", id: 2, method: "resources/list", params: { _meta: appCapability } },
    { jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "ui://common-tools/quality-report.html", _meta: appCapability } },
    { jsonrpc: "2.0", id: 4, method: "resources/read", params: { uri: "ui://common-tools/other.html", _meta: appCapability } }
  ].map(JSON.stringify).join("\n") + "\n";
  const result = spawnSync(process.execPath, [server], { input, encoding: "utf8", timeout: 5000, windowsHide: true, env: { ...process.env, COMMON_TOOLS_WORKSPACE: workspace, COMMON_TOOLS_STATE: path.join(workspace, "state") } });
  assert.equal(result.status, 0);
  const [tools, resources, resource, missing] = result.stdout.trim().split(/\r?\n/).map(JSON.parse);
  assert.deepEqual(tools.result.tools.find((tool) => tool.name === "get_job")._meta, { ui: { resourceUri: "ui://common-tools/quality-report.html", visibility: ["model"] } });
  assert.equal(Object.hasOwn(tools.result.tools.find((tool) => tool.name === "create_editable_job"), "_meta"), false);
  assert.deepEqual(resources.result.resources.map((item) => item.uri), ["ui://common-tools/quality-report.html"]);
  const content = resource.result.contents[0];
  assert.equal(content.mimeType, "text/html;profile=mcp-app");
  assert.match(content.text, /ui\/notifications\/tool-result/);
  assert.match(content.text, /PPT structure/);
  assert.match(content.text, /Audit selection/);
  assert.match(content.text, /event\.source !== window\.parent/);
  assert.doesNotMatch(content.text, /\.innerHTML\s*=/);
  assert.doesNotMatch(content.text, /\bfetch\s*\(/);
  assert.doesNotMatch(content.text, /<iframe\b/i);
  assert.match(content.text, /PPT improvement/);
  assert.equal(content.text.includes("innerHTML"), false);
  assert.match(content.text, /Visual comparison/);
  assert.match(content.text, /Per-page comparison/);
  assert.doesNotMatch(content.text, /<script\s+src|\bfetch\s*\(|innerHTML/i);
  assert.deepEqual(content._meta.ui.csp, { connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: [] });
  assert.equal(missing.error.code, -32602);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("MCP get_job returns a verified local visual summary without raw delivery data", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-mcp-visual-"));
  const state = path.join(workspace, "state");
  try {
    const output = path.join(workspace, "output");
    const report = path.join(output, VISUAL_REPORT_NAME);
    const diff = path.join(output, "diff", "pixel-diff.iteration-0.json");
    fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.mkdirSync(path.dirname(diff), { recursive: true });
    fs.writeFileSync(diff, JSON.stringify({ metrics: [{ pageIndex: 0, ok: true, pixelDiffRatio: 0.04, error: "internal detail" }] }), "utf8");
    fs.writeFileSync(report, JSON.stringify({ pages: { count: 1, imageOnlyCount: 0 }, artifacts: { diffReport: diff }, metrics: { pixelDiffRatio: 0.04, editableObjects: 6, forbidden: "hidden" }, warnings: ["internal detail"] }), "utf8");
    const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    const artifact = { name: VISUAL_REPORT_NAME, mediaType: "application/json", uri: report, sha256: digest(report) };
    const diffArtifact = { name: path.join("diff", "pixel-diff.iteration-0.json"), mediaType: "application/json", uri: diff, sha256: digest(diff) };
    const store = new JobStore({ root: state, ownerId: "test-user" });
    const created = store.create({ id: "visual-job", capability: "image-to-editable", idempotencyKey: "visual-request", expiresAt: "2030-01-01T00:00:00.000Z" });
    store.write({ ...created, input: { path: path.join(workspace, "input.png") }, output: { path: output }, config: null });
    store.transition(created.id, "running");
    store.transition(created.id, "succeeded", { artifacts: [artifact, diffArtifact], quality: { passed: true, checks: [{ name: "slideclone-completed", passed: true }], metrics: { artifacts: 1, "pptx-artifacts": 1 } } });
    const result = callTool("get_job", { id: created.id }, { workspaceRoot: workspace, stateRoot: state, ownerId: "test-user" });
    assert.deepEqual(result.visual, { pages: { count: 1, imageOnlyCount: 0 }, metrics: { pixelDiffRatio: 0.04, editableObjects: 6 }, perPage: [{ page: 1, compared: true, pixelDiffRatio: 0.04 }], warnings: 1 });
    assert.equal(JSON.stringify(result.visual).includes("forbidden"), false);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("stdio MCP lists only the scoped local image-to-editable tools", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-mcp-stdio-default-"));
  try {
    const request = `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`;
    const result = spawnSync(process.execPath, [server], { input: request, encoding: "utf8", timeout: 5000, windowsHide: true, env: { ...process.env, COMMON_TOOLS_WORKSPACE: workspace, COMMON_TOOLS_STATE: path.join(workspace, "state") } });
    assert.equal(result.status, 0);
    const response = JSON.parse(result.stdout.trim());
    assert.deepEqual(response.result.tools.map((tool) => tool.name), ["health_check", "create_editable_job", "get_job", "cancel_job", "list_job_artifacts"]);
    assert.equal(response.result.tools.find((tool) => tool.name === "create_editable_job").inputSchema.properties.config.type, "string");
    assert.equal(response.result.tools.find((tool) => tool.name === "create_editable_job").inputSchema.properties.inputs.maxItems, 20);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("stdio MCP creates an ordered multi-image editable job and rejects mixed input modes", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-mcp-editable-batch-"));
  const state = path.join(workspace, "state");
  try {
    const fixture = path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png");
    const first = path.join(workspace, "page-02.png");
    const second = path.join(workspace, "page-01.png");
    const output = path.join(workspace, "output");
    const config = path.join(workspace, "slideclone.config.json");
    fs.copyFileSync(fixture, first);
    fs.copyFileSync(fixture, second);
    fs.writeFileSync(config, JSON.stringify({ inputDir: workspace, outputDir: output, adapters: { ocr: "scripts/adapters/ocr-placeholder.js", vision: "scripts/adapters/vision-placeholder.js", pptx: "scripts/adapters/pptx-openxml-dotnet.js", render: "scripts/adapters/render-placeholder.js", diff: "scripts/adapters/diff-placeholder.js" } }), "utf8");
    const requests = [
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_editable_job", arguments: { inputs: [first, second], output, config } } },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_editable_job", arguments: { input: first, inputs: [second], output, config } } }
    ];
    const result = spawnSync(process.execPath, [server], { input: `${requests.map(JSON.stringify).join("\n")}\n`, encoding: "utf8", timeout: 15000, windowsHide: true, env: { ...process.env, COMMON_TOOLS_WORKSPACE: workspace, COMMON_TOOLS_STATE: state } });
    assert.equal(result.status, 0, result.stderr);
    const [created, rejected] = result.stdout.trim().split(/\r?\n/).map(JSON.parse);
    assert.deepEqual(created.result.structuredContent.input.paths, [first, second]);
    assert.equal(created.result.structuredContent.input.path, first);
    assert.equal(rejected.result.isError, true);
    assert.match(rejected.result.content[0].text, /declared input schema/u);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("stdio MCP hides a disabled capability and rejects calls", () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-mcp-"));
  try {
    setCapabilityEnabled(state, "image-to-editable", false);
    const input = [
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "health_check", arguments: {} } }
    ].map(JSON.stringify).join("\n") + "\n";
    const result = spawnSync(process.execPath, [server], { input, encoding: "utf8", timeout: 5000, windowsHide: true, env: { ...process.env, COMMON_TOOLS_STATE: state } });
    assert.equal(result.status, 0);
    const [listed, called] = result.stdout.trim().split(/\r?\n/).map(JSON.parse);
    assert.deepEqual(listed.result.tools.map((tool) => tool.name), ["health_check"]);
    assert.equal(called.result.structuredContent.enabledCapabilities.includes("image-to-editable"), false);
  } finally {
    fs.rmSync(state, { recursive: true, force: true });
  }
});

test("stdio MCP exposes only the independently enabled project-audit tools", () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-mcp-audit-"));
  try {
    setCapabilityEnabled(state, "image-to-editable", false);
    setCapabilityEnabled(state, "project-audit", true);
    const input = `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })}\n`;
    const result = spawnSync(process.execPath, [server], { input, encoding: "utf8", timeout: 5000, windowsHide: true, env: { ...process.env, COMMON_TOOLS_STATE: state } });
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout).result.tools.map((tool) => tool.name), ["health_check", "create_project_audit_job", "get_project_audit_report"]);
  } finally {
    fs.rmSync(state, { recursive: true, force: true });
  }
});

test("stdio MCP creates a scoped project-audit job", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-mcp-audit-workspace-"));
  const state = path.join(workspace, "state");
  try {
    fs.writeFileSync(path.join(workspace, "package.json"), "{}");
    setCapabilityEnabled(state, "image-to-editable", false);
    setCapabilityEnabled(state, "project-audit", true);
    const request = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "create_project_audit_job", arguments: { projectRoot: workspace, output: path.join(workspace, "report"), level: "deep", scope: "3" } } };
    const result = spawnSync(process.execPath, [server], { input: `${JSON.stringify(request)}\n`, encoding: "utf8", timeout: 5000, windowsHide: true, env: { ...process.env, COMMON_TOOLS_WORKSPACE: workspace, COMMON_TOOLS_STATE: state } });
    assert.equal(result.status, 0);
    const response = JSON.parse(result.stdout);
    assert.equal(response.result.structuredContent.capability, "project-audit");
    assert.equal(response.result.structuredContent.status, "queued");
    assert.equal(response.result.structuredContent.audit.level, "deep");
    assert.deepEqual(response.result.structuredContent.audit.scopes, ["visual-interaction"]);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("stdio MCP keeps simultaneously enabled capability jobs isolated", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-mcp-isolation-"));
  const state = path.join(workspace, "state");
  try {
    fs.writeFileSync(path.join(workspace, "package.json"), "{}");
    setCapabilityEnabled(state, "project-audit", true);
    const requests = [
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_project_audit_job", arguments: { projectRoot: workspace, output: path.join(workspace, "report") } } }
    ];
    const created = spawnSync(process.execPath, [server], { input: `${requests.map(JSON.stringify).join("\n")}\n`, encoding: "utf8", timeout: 5000, windowsHide: true, env: { ...process.env, COMMON_TOOLS_WORKSPACE: workspace, COMMON_TOOLS_STATE: state } });
    assert.equal(created.status, 0);
    const [listed, audit] = created.stdout.trim().split(/\r?\n/).map(JSON.parse);
    assert.deepEqual(listed.result.tools.map((tool) => tool.name), ["health_check", "create_editable_job", "get_job", "cancel_job", "list_job_artifacts", "create_project_audit_job", "get_project_audit_report"]);
    const jobId = audit.result.structuredContent.id;
    const rejectedRequest = { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_job", arguments: { id: jobId } } };
    const rejected = spawnSync(process.execPath, [server], { input: `${JSON.stringify(rejectedRequest)}\n`, encoding: "utf8", timeout: 5000, windowsHide: true, env: { ...process.env, COMMON_TOOLS_WORKSPACE: workspace, COMMON_TOOLS_STATE: state } });
    assert.match(JSON.parse(rejected.stdout).result.content[0].text, /different capability/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("stdio MCP rejects malformed or undeclared tool arguments", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-mcp-invalid-args-"));
  try {
  const input = [
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_job", arguments: { id: "job-a", extra: "nope" } } },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_editable_job", arguments: { input: "", output: "out" } } }
  ].map(JSON.stringify).join("\n") + "\n";
  const result = spawnSync(process.execPath, [server], { input, encoding: "utf8", timeout: 5000, windowsHide: true, env: { ...process.env, COMMON_TOOLS_WORKSPACE: workspace, COMMON_TOOLS_STATE: path.join(workspace, "state") } });
  assert.equal(result.status, 0);
  const responses = result.stdout.trim().split(/\r?\n/).map(JSON.parse);
  assert.match(responses[0].result.content[0].text, /unexpected tool argument/);
  assert.match(responses[1].result.content[0].text, /must be a non-empty string/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
