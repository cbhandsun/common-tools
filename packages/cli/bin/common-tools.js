#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { REGISTRATION, cancelJob, createEditableJob, getJob, runEditableJob } = require("../../slideclone-core");
const { CAPABILITY: PROJECT_AUDIT_CAPABILITY, createExperienceEvidenceTemplate, createProjectAuditJob, runProjectAuditJob } = require("../../project-audit-core");
const { auditLevelPlan, parseAuditLevel, promptAuditLevel, renderAuditLevelMenu } = require("../../project-audit-core/audit-level");
const { auditIntentPlan } = require("../../project-audit-core/audit-mode");
const { parseAuditScope, promptAuditScope, renderAuditScopeMenu } = require("../../project-audit-core/audit-scope");
const { collectBrowserExperience } = require("../../project-audit-core/browser-experience");
const { CAPABILITY: PPT_QUALITY_CAPABILITY, REPORT_JSON_NAME: PPT_QUALITY_REPORT_JSON_NAME, createPptQualityJob, runPptQualityJob } = require("../../ppt-quality-core");
const { CAPABILITY: PPT_IMPROVE_CAPABILITY, createPptImproveJob, runPptImproveJob } = require("../../ppt-improve-core");
const { CAPABILITY: PPT_CREATE_CAPABILITY, createPptCreateJob, runPptCreateJob } = require("../../ppt-create-core");
const { persistEditorPatch, writeEditorPreview } = require("../../ppt-create-core/editor");
const { createImageDeliveryArtifacts } = require("../../ppt-create-core/image-delivery");
const { applyAndExportIrArtifacts, exportEditedIrArtifacts, persistIrEditorPatch } = require("../../ppt-create-core/ir-editor");
const { startIrEditorSession } = require("../../ppt-create-core/ir-editor-session");
const { loadContentProviderConfig } = require("../../ppt-create-core/content-provider-config");
const { buildPdfWithLibreOffice } = require("../../ppt-create-core/libreoffice-pdf");
const { persistPresentationPlan } = require("../../ppt-create-core/planner");
const { persistPromptPlan, persistPromptPlanAsync, promptToPresentation, promptToPresentationAsync } = require("../../ppt-create-core/prompt");
const { persistDocumentPlan } = require("../../ppt-create-core/document-ingest");
const { extractPdfLayout, extractPdfText } = require("../../ppt-create-core/pdf-text");
const { createPptCreateArchive } = require("../../ppt-create-core/team-archive");
const { buildOpenXmlDecksSync } = require("../../../skills/pd-hifi-slideclone/scripts/adapters/pptx-openxml-dotnet");
const { CAPABILITY_MANIFESTS, effectivePluginConfig, readPluginConfig, readRuntimeConfig, resolveExecutionRoute, rollbackPluginConfig, setCapabilityEnabled, setEnabledCapabilities, upgradePluginConfig } = require("../../capability-runtime");
const { TEAM_DEFAULT_CAPABILITIES, TEAM_DEPLOYMENT_CAPABILITIES, loadTeamConfig, teamDeploymentPlan } = require("../../team-runtime");
const { runKeycloakMcpClientCommand, runKeycloakProjectMapperCommand } = require("../keycloak-project-mapper");
const { serveStdio } = require("../../mcp-server/core");
const { assertMirroredPackage, assertPluginPackage, verifyPluginPackaging } = require("../../../scripts/verify-plugins");
const { verifyCapabilityToolContracts } = require("../../../scripts/verify-capability-contracts");
const { scaffoldPlan, writeScaffold } = require("../capability-scaffold");
const { assertValidConfig } = require("../../slideclone-core/config-validation");
const { createRawImageArchive } = require("../../slideclone-core/team-raw-image-archive");
const { createBundledSlidecloneRunner, inspectBundledSlideclone } = require("../slideclone-runner");

const REPOSITORY_ROOT = path.resolve(__dirname, "../../..");
let executeBundledSlideclone;
function bundledSlidecloneRunner() {
  if (!executeBundledSlideclone) executeBundledSlideclone = createBundledSlidecloneRunner({ repositoryRoot: REPOSITORY_ROOT });
  return executeBundledSlideclone;
}
const COMMAND_USAGE = [
  "usage: common-tools <command>",
  "  doctor | runtime status | runtime resolve --capability <id> [--execution local|remote] | mcp serve",
  "  team doctor [--runtime] [--project <compose-project>] | team runtime [--project <compose-project>] [--capabilities <csv>] [--require-gateway] | team local-config [--project <compose-project>] | team deployment-plan [--capabilities <csv>] | team raw-image-archive (--input <png|jpg> | --inputs <ordered,csv>) --out <archive.tar.gz> | team production-preflight | team keycloak-mcp-client [--apply --backup-file <new.json>]",
  "  plugin list | plugin verify | plugin status | plugin set --capabilities <id,...> | plugin enable --capability <id> [--only] | plugin disable --capability <id> | plugin rollback | plugin upgrade [--capability <id>]",
  "  editable init|create|run|batch|apply-edit | editable batch --inputs <ordered,csv> --out <directory> --config <json> | audit levels|scopes|interactive|plan|evidence-template|experience-collect|create|run [--level 1|2|3|quick|standard|deep] [--scope 1|2,3|scope-ids] [--mode code|enhanced|gates|experience|full] [--instruction <text>] [--run-gates --gate-timeout-ms <1000..600000>] [--experience-evidence <json>] | ppt draft|compose [--provider-config <json> --provider-id <id>]|ingest [--deck-variants 1|2|3]|plan|archive|create|enqueue|preview|edit-session|apply-edit|apply-ir-edit|finalize-ir-edit|export-ir | ppt-quality create|run | ppt-improve create|run|pipeline [--profile safe-package|layout-safe|typography-safe|editability-safe|audit-only] | job get|run|cancel"
].join("\n");

function parse(argv) { const result = { _: [] }; for (let index = 0; index < argv.length; index += 1) { const item = argv[index]; if (!item.startsWith("--")) { result._.push(item); continue; } const next = argv[index + 1]; if (next && !next.startsWith("--")) { result[item.slice(2)] = next; index += 1; } else result[item.slice(2)] = true; } return result; }
function parseCapabilityList(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("--capabilities must be a non-empty comma-separated list");
  const capabilities = value.split(",").map((capability) => capability.trim());
  if (capabilities.some((capability) => !capability) || new Set(capabilities).size !== capabilities.length) throw new Error("--capabilities must not contain empty or duplicate capability IDs");
  return capabilities;
}
function context(args) { const workspaceRoot = path.resolve(args.workspace || process.cwd()); const stateRoot = path.resolve(args.state || path.join(workspaceRoot, ".common-tools")); return { workspaceRoot, stateRoot, ownerId: args.owner || "local-user" }; }
function runtimeStatus(args = {}, environment = process.env) {
  const configuration = readRuntimeConfig(environment);
  const capabilities = [PROJECT_AUDIT_CAPABILITY, REGISTRATION.capability, PPT_QUALITY_CAPABILITY, PPT_IMPROVE_CAPABILITY, PPT_CREATE_CAPABILITY];
  return Object.freeze({
    configuration,
    routes: Object.freeze(Object.fromEntries(capabilities.map((capability) => [capability, resolveExecutionRoute({ capability, executionMode: configuration.executionMode })])))
  });
}
function requireEnabledCapability(ctx, capability) {
  let config;
  try {
    config = effectivePluginConfig(ctx.stateRoot, ctx.workspaceRoot);
  } catch {
    throw new Error("runtime configuration is invalid");
  }
  if (!config.effectiveCapabilities.includes(capability)) throw new Error(`capability is not enabled: ${capability}`);
}
function newPipelineOutputRoot(workspaceRoot, output) {
  if (typeof output !== "string" || !output.trim()) throw new Error("ppt-improve pipeline requires --out");
  const workspace = fs.realpathSync.native(workspaceRoot);
  const root = path.resolve(workspace, output);
  const relative = path.relative(workspace, root);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("PPT improvement pipeline output must be a new child directory of the workspace");
  if (fs.existsSync(root)) throw new Error("PPT improvement pipeline output already exists");
  return root;
}
function runPptImprovePipeline(ctx, args) {
  if (!args.input) throw new Error("ppt-improve pipeline requires --input and --out");
  requireEnabledCapability(ctx, PPT_QUALITY_CAPABILITY);
  requireEnabledCapability(ctx, PPT_IMPROVE_CAPABILITY);
  const root = newPipelineOutputRoot(ctx.workspaceRoot, args.out);
  const qualityOutput = path.join(root, "quality");
  const improveOutput = path.join(root, "improve");
  const quality = runCreatedLocalJob(ctx, createPptQualityJob({ ...ctx, input: args.input, output: qualityOutput }));
  if (quality.status !== "succeeded") return Object.freeze({ quality, improvement: null, outputs: Object.freeze({ root, qualityOutput, improveOutput }) });
  const report = path.join(qualityOutput, PPT_QUALITY_REPORT_JSON_NAME);
  const improvement = runCreatedLocalJob(ctx, createPptImproveJob({ ...ctx, input: args.input, report, output: improveOutput, profile: args.profile }));
  return Object.freeze({ quality, improvement, outputs: Object.freeze({ root, qualityOutput, improveOutput }) });
}
function run(executable, args) { const result = childProcess.spawnSync(executable, args, { encoding: "utf8", windowsHide: true }); return { available: !result.error && result.status === 0, status: result.status, version: (result.stdout || result.stderr || "").trim().split(/\r?\n/)[0] || null }; }
function workspaceAccess(workspace, fileSystem = fs) {
  try {
    const stat = fileSystem.statSync(workspace);
    if (!stat.isDirectory()) return Object.freeze({ available: false, readable: false, writable: false, reason: "workspace is not a directory" });
    try { fileSystem.accessSync(workspace, fileSystem.constants.R_OK); } catch { return Object.freeze({ available: false, readable: false, writable: false, reason: "workspace is not readable" }); }
    try { fileSystem.accessSync(workspace, fileSystem.constants.W_OK); } catch { return Object.freeze({ available: false, readable: true, writable: false, reason: "workspace is not writable" }); }
    return Object.freeze({ available: true, readable: true, writable: true, reason: null });
  } catch {
    return Object.freeze({ available: false, readable: false, writable: false, reason: "workspace does not exist or is inaccessible" });
  }
}
function optionalLicense(value, fileSystem = fs) {
  if (value === undefined) return Object.freeze({ configured: false, available: false });
  if (typeof value !== "string" || !value.trim()) return Object.freeze({ configured: true, available: false, reason: "license path is invalid" });
  try {
    const stat = fileSystem.statSync(path.resolve(value));
    return stat.isFile() ? Object.freeze({ configured: true, available: true }) : Object.freeze({ configured: true, available: false, reason: "license path is not a file" });
  } catch {
    return Object.freeze({ configured: true, available: false, reason: "license file is unavailable" });
  }
}
function optionalUmiOcr(args = {}, environment = process.env, fileSystem = fs, platform = process.platform) {
  const explicit = args["umi-ocr-bin"] ?? environment.COMMON_TOOLS_UMI_OCR_BIN;
  const defaultPath = platform === "win32"
    ? "C:\\Program Files\\Umi-OCR_Paddle_v2.1.5\\UmiOCR-data\\plugins\\win7_x64_PaddleOCR-json\\PaddleOCR-json.exe"
    : null;
  const candidate = explicit === undefined ? defaultPath : explicit;
  if (candidate === null) return Object.freeze({ configured: false, available: false, source: null });
  if (typeof candidate !== "string" || !candidate.trim()) {
    return Object.freeze({ configured: explicit !== undefined, available: false, source: null, reason: "OCR executable path is invalid" });
  }
  try {
    const stat = fileSystem.statSync(path.resolve(candidate));
    return Object.freeze({ configured: explicit !== undefined, available: stat.isFile(), source: explicit !== undefined ? "configured" : "default", ...(stat.isFile() ? {} : { reason: "OCR executable is unavailable" }) });
  } catch {
    return Object.freeze({ configured: explicit !== undefined, available: false, source: explicit !== undefined ? "configured" : "default", reason: "OCR executable is unavailable" });
  }
}
function optionalPaddleOcr(args = {}, environment = process.env, fileSystem = fs, platform = process.platform, workspaceRoot = process.cwd()) {
  const explicit = args["paddle-ocr-python"] ?? environment.COMMON_TOOLS_PADDLEOCR_PYTHON;
  const managedPython = path.join(
    workspaceRoot,
    ".tools",
    "paddleocr-venv",
    platform === "win32" ? "Scripts" : "bin",
    platform === "win32" ? "python.exe" : "python"
  );
  const candidate = explicit === undefined ? managedPython : explicit;
  if (typeof candidate !== "string" || !candidate.trim()) {
    return Object.freeze({ configured: explicit !== undefined, available: false, source: null, reason: "PaddleOCR Python path is invalid" });
  }
  try {
    const stat = fileSystem.statSync(path.resolve(candidate));
    return Object.freeze({
      configured: explicit !== undefined,
      available: stat.isFile(),
      source: explicit !== undefined ? "configured" : "managed",
      ...(stat.isFile() ? {} : { reason: "PaddleOCR Python runtime is unavailable" })
    });
  } catch {
    return Object.freeze({
      configured: explicit !== undefined,
      available: false,
      source: explicit !== undefined ? "configured" : "managed",
      reason: "PaddleOCR Python runtime is unavailable"
    });
  }
}
function resolveWorkspaceChild(workspaceRoot, value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  const root = fs.realpathSync.native(workspaceRoot);
  const candidate = path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
  const relative = path.relative(root, candidate);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} must be inside the workspace root`);
  }
  return candidate;
}
function editableProfileProvider(value) {
  const provider = typeof value === "string" && value.trim() ? value.trim() : "paddleocr-local";
  if (!new Set(["paddleocr-local", "umi-paddle", "tesseract"]).has(provider)) {
    throw new Error("--ocr-provider must be paddleocr-local, umi-paddle, or tesseract");
  }
  return provider;
}
function editableProfileConfig(input, output, provider, options = {}) {
  const verifyRender = options.verifyRender === true;
  const selectedProvider = editableProfileProvider(provider);
  const ocrAdapter = {
    "paddleocr-local": "scripts/adapters/ocr-paddleocr-local.js",
    "umi-paddle": "scripts/adapters/ocr-umi-paddle.js",
    tesseract: "scripts/adapters/ocr-tesseract-cli.js"
  }[selectedProvider];
  return Object.freeze({
    inputDir: path.dirname(input),
    outputDir: output,
    pagePattern: `*${path.extname(input).toLowerCase() || ".png"}`,
    slide: { widthPt: 960, heightPt: 540 },
    pageConcurrency: 1,
    adapters: {
      normalize: "scripts/adapters/normalize-cli.js",
      ocr: ocrAdapter,
      vision: "scripts/adapters/vision-editable-overlay.js",
      pptx: "scripts/adapters/pptx-openxml-dotnet.js",
      render: verifyRender ? "scripts/adapters/render-powerpoint-com.js" : "scripts/adapters/render-placeholder.js",
      diff: verifyRender ? "scripts/adapters/diff-pixel-png.js" : "scripts/adapters/diff-placeholder.js",
      compare: "scripts/adapters/compare-placeholder.js",
      polish: "scripts/adapters/polish-placeholder.js",
      compress: "scripts/adapters/compress-placeholder.js"
    },
    thresholds: {
      pixelDiffRatio: 0.08,
      foregroundMissingRatio: 0.12,
      layoutMeanIoU: 0.86,
      textCoverage: 0.95,
      maxCriticalOffsetPt: 8,
      maxOutOfBoundsPt: 1,
      maxImageAspectRatioDelta: 0.03,
      maxRasterImageAreaRatio: 0.25
    },
    ...(selectedProvider === "paddleocr-local"
      ? { paddleOcr: { cache: true, cacheDir: path.join(output, "ocr-cache", "paddleocr-local") } }
      : {}),
    ...(selectedProvider === "umi-paddle" ? { umiOcr: { cacheDir: path.join(output, "ocr-cache", "umi-paddle") } } : {}),
    ...(verifyRender ? {
      textOcr: { enabled: true, adapter: ocrAdapter, mode: "fullPage", paddingPt: 12, upscale: 1, preprocess: false },
      powerPoint: { exportTimeoutMs: 120000 }
    } : {}),
    openXmlBuilder: { configuration: "Release", targetFramework: "net8.0-windows", powerPointSafe: true },
    postprocess: { compare: verifyRender, polish: false, compress: false }
  });
}
function initializeEditableProfile(ctx, args, diagnostics = {}) {
  if (!args.input || !args.out) throw new Error("editable init requires --input and --out");
  const input = resolveWorkspaceChild(ctx.workspaceRoot, args.input, "--input");
  const inputInfo = fs.lstatSync(input);
  if (!inputInfo.isFile() || inputInfo.isSymbolicLink()) throw new Error("--input must be an existing non-symbolic file");
  const output = resolveWorkspaceChild(ctx.workspaceRoot, args.out, "--out");
  const provider = editableProfileProvider(args["ocr-provider"]);
  const verifyRender = args["verify-render"] === true;
  if (verifyRender && path.extname(input).toLowerCase() !== ".png") {
    throw new Error("--verify-render currently requires a PNG input");
  }
  if (verifyRender && process.platform !== "win32") {
    throw new Error("--verify-render requires Windows PowerPoint COM automation");
  }
  if (provider === "umi-paddle" && !(diagnostics.umiOcr || optionalUmiOcr(args)).available) {
    throw new Error("Umi PaddleOCR is unavailable; configure COMMON_TOOLS_UMI_OCR_BIN or install it before initializing this profile");
  }
  if (provider === "paddleocr-local"
    && !(diagnostics.paddleOcr || optionalPaddleOcr(args, process.env, fs, process.platform, ctx.workspaceRoot)).available) {
    throw new Error("PaddleOCR local runtime is unavailable; run npm run slideclone:bootstrap-paddleocr before initializing this profile");
  }
  if (provider === "tesseract" && !(diagnostics.runCommand || run)("tesseract", ["--version"]).available) {
    throw new Error("Tesseract is unavailable; install it before initializing this profile");
  }
  const safeBase = path.basename(input, path.extname(input)).replace(/[^A-Za-z0-9_-]+/g, "-") || "image";
  const config = args.config
    ? resolveWorkspaceChild(ctx.workspaceRoot, args.config, "--config")
    : path.join(path.dirname(input), `.common-tools-editable-${safeBase}.config.json`);
  const profile = editableProfileConfig(input, output, provider, { verifyRender });
  assertValidConfig(profile);
  fs.mkdirSync(path.dirname(config), { recursive: true });
  fs.writeFileSync(config, `${JSON.stringify(profile, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return Object.freeze({ profile: verifyRender ? "editable-text-overlay-verified-v1" : "editable-text-overlay-v1", ocrProvider: provider, qualityVerification: verifyRender, config });
}
function doctorReport(args = {}, environment = process.env, diagnostics = {}) {
  const workerMode = args.mode === "worker";
  const capability = typeof args.capability === "string" && args.capability ? args.capability : null;
  const commandContext = context(args);
  const workspace = diagnostics.workspace || commandContext.workspaceRoot;
  const stateRoot = diagnostics.stateRoot || commandContext.stateRoot;
  const runCommand = diagnostics.runCommand || run;
  const fileSystem = diagnostics.fileSystem || fs;
  const dotnet = runCommand("dotnet", workerMode ? ["--list-runtimes"] : ["--version"]);
  const python = runCommand("python", ["--version"]);
  const ocr = runCommand("tesseract", ["--version"]);
  const umiOcr = diagnostics.umiOcr || optionalUmiOcr(args, environment, fileSystem, diagnostics.platform || process.platform);
  const docker = workerMode ? Object.freeze({ available: null, status: null, version: null, skipped: "Docker daemon is intentionally unavailable inside workers" }) : runCommand("docker", ["version", "--format", "{{.Server.Version}}"]);
  const workspaceAccessReport = workspaceAccess(workspace, fileSystem);
  const imageEngine = capability === "image-to-editable"
    ? (diagnostics.imageEngine || inspectBundledSlideclone({ repositoryRoot: REPOSITORY_ROOT }))
    : Object.freeze({ available: true, reason: null });
  let runtime;
  try {
    const config = effectivePluginConfig(stateRoot, workspace);
    runtime = Object.freeze({ valid: true, enabledCapabilities: config.enabledCapabilities, effectiveCapabilities: config.effectiveCapabilities, projectScope: config.projectScope });
  } catch {
    runtime = Object.freeze({ valid: false });
  }
  const required = Object.freeze({
    workspace: workspaceAccessReport.available,
    // Docker belongs to the explicit `team doctor`/deployment boundary. The
    // local Runtime can execute its supported capabilities without a daemon.
    docker: true,
    dotnet: capability === "image-to-editable" ? dotnet.available : true,
    imageToEditableEngine: imageEngine.available === true,
    runtimeConfiguration: runtime.valid
  });
  const optionalAccelerators = Object.freeze({
    python: Object.freeze({ available: python.available, purpose: "capability-specific processing" }),
    dotnet: Object.freeze({ available: dotnet.available, purpose: "OpenXML image-to-editable engine" }),
    ocr: Object.freeze({ available: ocr.available || umiOcr.available, purpose: "high-fidelity text extraction", providers: Object.freeze({ tesseract: ocr.available, umiPaddle: umiOcr.available }) }),
    umiPaddleOcr: Object.freeze({ ...umiOcr, purpose: "local PaddleOCR JSON text extraction" })
  });
  const blocking = Object.entries(required).filter(([, available]) => !available).map(([name]) => name);
  const notes = [
    ...(workerMode ? ["Docker daemon is intentionally unavailable inside workers."] : []),
    ...(optionalAccelerators.ocr.available ? [] : ["OCR is optional; image-to-editable falls back to the OpenXML baseline."])
  ];
  const info = Object.freeze({ node: process.version, workspace, workspaceAccess: workspaceAccessReport, mode: workerMode ? "worker" : "host", capability, runtime, imageToEditableEngine: Object.freeze({ available: imageEngine.available === true, reason: imageEngine.available === true ? null : imageEngine.reason || "unavailable" }), dotnet, python, ocr, docker, optionalAccelerators, required, blocking, executable: blocking.length === 0, notes: Object.freeze(notes) });
  return Object.freeze({ exitCode: info.executable ? 0 : 2, info });
}
function doctor(args = {}) { const report = doctorReport(args); process.stdout.write(`${JSON.stringify(report.info, null, 2)}\n`); return report.exitCode; }
function metricsState(environment) { const token = typeof environment.COMMON_TOOLS_METRICS_TOKEN === "string" ? environment.COMMON_TOOLS_METRICS_TOKEN.trim() : ""; const file = environment.COMMON_TOOLS_METRICS_TOKEN_FILE; if (file !== undefined && token) throw new Error("COMMON_TOOLS_METRICS_TOKEN and COMMON_TOOLS_METRICS_TOKEN_FILE are mutually exclusive"); if (file !== undefined) { if (typeof file !== "string" || !file.trim()) throw new Error("COMMON_TOOLS_METRICS_TOKEN_FILE is invalid"); return Object.freeze({ enabled: true }); } if (!token) return Object.freeze({ enabled: false }); if (!/^[A-Za-z0-9._~-]{16,512}$/.test(token)) throw new Error("COMMON_TOOLS_METRICS_TOKEN must be a 16-512 character URL-safe secret"); return Object.freeze({ enabled: true }); }
function composeProjectName(value) { const project = value || "deploy"; if (typeof project !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(project)) throw new Error("compose project name is invalid"); return project; }
function summarizeContainerStatus(status) {
  const source = typeof status === "string" ? status : "";
  return Object.freeze({ running: /^Up\b/.test(source), healthy: /\(healthy\)/.test(source), unhealthy: /\(unhealthy\)/.test(source), completed: /^Exited \(0\)/.test(source) });
}
function composeServiceName(row) {
  if (!row || typeof row !== "object") return undefined;
  if (typeof row.Service === "string" && row.Service) return row.Service;
  if (typeof row.Labels !== "string") return undefined;
  return /(?:^|,)com\.docker\.compose\.service=([^,]+)/.exec(row.Labels)?.[1];
}
function composeRows(project) {
  const result = childProcess.spawnSync("docker", ["ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{json .}}"], { encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) return Object.freeze({ available: false, rows: Object.freeze([]) });
  const rows = String(result.stdout || "").split(/\r?\n/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  return Object.freeze({ available: true, rows: Object.freeze(rows) });
}
function loopbackTcpPort(value, containerPort) {
  if (typeof value !== "string" || !Number.isSafeInteger(containerPort) || containerPort < 1 || containerPort > 65535) return undefined;
  const pattern = new RegExp(`(?:^|,\\s*)(?:127\\.0\\.0\\.1|localhost|\\[::1\\]):(\\d+)->${containerPort}/tcp(?:,|$)`);
  const match = pattern.exec(value);
  if (!match) return undefined;
  const port = Number(match[1]);
  return Number.isSafeInteger(port) && port >= 1024 && port <= 65535 ? port : undefined;
}
function probeReadyEndpoint(endpoint) {
  if (typeof endpoint !== "string" || !/^http:\/\/127\.0\.0\.1:\d{4,5}\/readyz$/.test(endpoint)) throw new TypeError("gateway ready endpoint is invalid");
  const source = "const http=require('node:http');const request=http.get(process.argv[1],{timeout:5000},(response)=>{response.resume();response.on('end',()=>process.exit(response.statusCode===200?0:1));});request.on('timeout',()=>request.destroy());request.on('error',()=>process.exit(1));";
  const result = childProcess.spawnSync(process.execPath, ["-e", source, endpoint], { encoding: "utf8", windowsHide: true, timeout: 6000 });
  return result.status === 0;
}
function gatewayReadiness(rows, probe = probeReadyEndpoint) {
  if (!Array.isArray(rows) || typeof probe !== "function") throw new TypeError("gateway readiness input is invalid");
  const gateway = rows.find((row) => composeServiceName(row) === "remote-mcp-gateway");
  const port = loopbackTcpPort(gateway?.Ports, 8080);
  if (port === undefined) return Object.freeze({ checked: true, ready: false, endpoint: null });
  const endpoint = `http://127.0.0.1:${port}/readyz`;
  return Object.freeze({ checked: true, ready: probe(endpoint) === true, endpoint });
}
function localTeamConfigReport(args = {}, diagnostics = {}) {
  const project = composeProjectName(args.project);
  const inventory = diagnostics.inventory || composeRows(project);
  if (!inventory || inventory.available !== true || !Array.isArray(inventory.rows)) return Object.freeze({ exitCode: 2, info: Object.freeze({ project, available: false, missing: Object.freeze(["Docker Compose runtime"]) }) });
  const byService = new Map();
  for (const row of inventory.rows) {
    const service = composeServiceName(row);
    if (service && !byService.has(service)) byService.set(service, row);
  }
  const gatewayPort = loopbackTcpPort(byService.get("remote-mcp-gateway")?.Ports, 8080);
  const keycloakPort = loopbackTcpPort(byService.get("keycloak")?.Ports, 8080);
  const missing = [
    ...(gatewayPort === undefined ? ["remote-mcp-gateway loopback port 8080"] : []),
    ...(keycloakPort === undefined ? ["keycloak loopback port 8080"] : [])
  ];
  if (missing.length) return Object.freeze({ exitCode: 2, info: Object.freeze({ project, available: true, missing: Object.freeze(missing) }) });
  const remotePublicUrl = `http://127.0.0.1:${gatewayPort}`;
  return Object.freeze({
    exitCode: 0,
    info: Object.freeze({
      project,
      available: true,
      configuration: Object.freeze({
        COMMON_TOOLS_REMOTE_PUBLIC_URL: remotePublicUrl,
        COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS: remotePublicUrl,
        COMMON_TOOLS_OIDC_ISSUER: `http://127.0.0.1:${keycloakPort}/realms/common-tools`,
        COMMON_TOOLS_OIDC_JWKS_URL: "http://keycloak:8080/realms/common-tools/protocol/openid-connect/certs",
        COMMON_TOOLS_OIDC_AUDIENCE: "common-tools-mcp"
      })
    })
  });
}
function composeRuntimeSnapshot(rows, enabledCapabilities, options = {}) {
  if (!Array.isArray(rows) || !Array.isArray(enabledCapabilities) || !options || typeof options !== "object" || Array.isArray(options) || (options.requireGateway !== undefined && typeof options.requireGateway !== "boolean") || (options.gatewayReady !== undefined && typeof options.gatewayReady !== "boolean")) throw new TypeError("Compose runtime snapshot input is invalid");
  const requireGateway = options.requireGateway === true;
  const services = new Map();
  for (const row of rows) {
    const service = composeServiceName(row);
    if (!row || typeof row !== "object" || !service || typeof row.Status !== "string") continue;
    const state = summarizeContainerStatus(row.Status);
    const current = services.get(service) || { count: 0, running: 0, healthy: 0, unhealthy: 0, completed: 0 };
    current.count += 1;
    current.running += state.running ? 1 : 0;
    current.healthy += state.healthy ? 1 : 0;
    current.unhealthy += state.unhealthy ? 1 : 0;
    current.completed += state.completed ? 1 : 0;
    services.set(service, current);
  }
  const report = Object.fromEntries([...services].sort(([left], [right]) => left.localeCompare(right)));
  const active = (name) => report[name]?.running > 0 && report[name]?.unhealthy === 0;
  const requiredActiveServices = ["postgres", "redis", "minio", "remote-mcp", "team-retention"];
  const workers = enabledCapabilities.map((capability) => TEAM_DEPLOYMENT_CAPABILITIES[capability]?.workerService).filter(Boolean);
  const requiredServices = Object.freeze([...new Set([...requiredActiveServices, ...workers, ...(requireGateway ? ["remote-mcp-gateway"] : []), "team-migrate"])]);
  const missingServices = Object.freeze(requiredServices.filter((name) => !report[name]));
  const inactiveServices = Object.freeze(requiredServices.filter((name) => {
    if (!report[name]) return false;
    if (name === "team-migrate") return report[name].completed === 0;
    if (name === "remote-mcp-gateway" && requireGateway) return !active(name) || (options.gatewayReady === undefined ? report[name].healthy === 0 : options.gatewayReady !== true);
    return !active(name);
  }));
  const ok = missingServices.length === 0 && inactiveServices.length === 0;
  return Object.freeze({ ok, requiredServices, missingServices, inactiveServices, services: report });
}
function dockerComposeRuntime(project, enabledCapabilities, options = {}) {
  const inventory = composeRows(project);
  if (!inventory.available) return Object.freeze({ available: false, ok: false, services: {} });
  const gateway = options.requireGateway === true ? gatewayReadiness(inventory.rows) : Object.freeze({ checked: false, ready: null, endpoint: null });
  const snapshotOptions = options.requireGateway === true ? { ...options, gatewayReady: gateway.ready } : options;
  return Object.freeze({ available: true, ...composeRuntimeSnapshot(inventory.rows, enabledCapabilities, snapshotOptions), gateway });
}
function teamDoctorReport(args = {}, environment = process.env, diagnostics = {}) {
  const docker = diagnostics.docker || run("docker", ["version", "--format", "{{.Server.Version}}"]);
  let config;
  let configurationError;
  try {
    config = loadTeamConfig(environment);
  } catch (error) {
    configurationError = error instanceof Error ? error.message : "team configuration is invalid";
  }
  let metrics;
  if (config) {
    try {
      metrics = metricsState(environment);
    } catch (error) {
      configurationError = error instanceof Error ? error.message : "team configuration is invalid";
    }
  }
  const runtimeRequested = args.runtime === true || args.runtime === "true";
  const runtime = runtimeRequested ? (diagnostics.runtime || dockerComposeRuntime)(composeProjectName(args.project), config?.enabledCapabilities || TEAM_DEFAULT_CAPABILITIES) : undefined;
  if (!config || configurationError) {
    // Runtime troubleshooting must remain useful after a Docker/Desktop restart,
    // even when this shell has no team credentials or deployment configuration.
    // The bounded configuration parser never includes supplied configuration values.
    const info = Object.freeze({ valid: false, error: configurationError || "team configuration is invalid", docker: { available: docker.available, version: docker.version }, ...(runtime ? { runtime } : {}) });
    return Object.freeze({ exitCode: 2, info });
  }
  const info = Object.freeze({ valid: true, docker: { available: docker.available, version: docker.version }, databaseHost: new URL(config.databaseUrl).host, redisHost: new URL(config.redisUrl).host, objectStoreHost: new URL(config.objectStoreEndpoint).host, objectStoreBucket: config.objectStoreBucket, enabledCapabilities: config.enabledCapabilities, workerLeaseSeconds: config.workerLeaseSeconds, artifactRetentionDays: config.artifactRetentionDays, projectActiveJobLimit: config.projectActiveJobLimit, metrics, ...(runtime ? { runtime } : {}) });
  return Object.freeze({ exitCode: docker.available && (!runtime || runtime.ok) ? 0 : 2, info });
}
function teamDoctor(args = {}) {
  const report = teamDoctorReport(args);
  process.stdout.write(`${JSON.stringify(report.info, null, 2)}\n`);
  return report.exitCode;
}
function teamRuntimeReport(args = {}, diagnostics = {}) {
  const docker = diagnostics.docker || run("docker", ["version", "--format", "{{.Server.Version}}"]);
  const plan = teamDeploymentPlan(args.capabilities);
  const project = composeProjectName(args.project);
  const requireGateway = args["require-gateway"] === true || args["require-gateway"] === "true";
  const runtime = (diagnostics.runtime || dockerComposeRuntime)(project, plan.capabilities, { requireGateway });
  const info = Object.freeze({ project, enabledCapabilities: plan.capabilities, requireGateway, docker: Object.freeze({ available: docker.available, version: docker.version }), runtime });
  return Object.freeze({ exitCode: docker.available && runtime.ok ? 0 : 2, info });
}
function teamRuntime(args = {}) {
  const report = teamRuntimeReport(args);
  process.stdout.write(`${JSON.stringify(report.info, null, 2)}\n`);
  return report.exitCode;
}
function pluginCatalog(stateRoot, workspaceRoot = path.dirname(stateRoot)) {
  verifyCapabilityToolContracts(REPOSITORY_ROOT);
  const packaging = verifyPluginPackaging(REPOSITORY_ROOT);
  const enabled = new Set(effectivePluginConfig(stateRoot, workspaceRoot).effectiveCapabilities);
  return Object.freeze({
    distributionVerified: true,
    capabilities: Object.freeze(packaging.capabilities.map((capability) => {
      const manifest = CAPABILITY_MANIFESTS.get(capability);
      if (!manifest) throw new Error(`capability manifest is missing: ${capability}`);
      return Object.freeze({
        capability,
        version: manifest.version,
        toolNames: manifest.toolNames,
        requiredWorkerProfile: manifest.requiredWorkerProfile,
        dependencies: manifest.dependencies,
        lifecycle: Object.freeze(manifest.deprecation ? Object.freeze({ status: "deprecated", ...manifest.deprecation }) : Object.freeze({ status: "active" })),
        team: manifest.team,
        runtimeEnabled: enabled.has(capability),
        install: Object.freeze({
          codex: Object.freeze({ marketplace: "common-tools-codex", plugin: `${capability}@common-tools-codex` }),
          claude: Object.freeze({ marketplace: "common-tools", plugin: `${capability}@common-tools` })
        })
      });
    }))
  });
}
function validateScaffoldBundle(root, capability) {
  for (const host of ["codex", "claude"]) {
    const source = path.join(root, "plugins", host, capability);
    const mirror = path.join(root, "marketplaces", host, "plugins", capability);
    assertPluginPackage(source, capability, host);
    assertPluginPackage(mirror, capability, host);
    assertMirroredPackage(source, mirror);
  }
}
function runCreatedLocalJob(ctx, job) {
  if (!job || typeof job !== "object" || typeof job.id !== "string" || typeof job.capability !== "string") throw new TypeError("created job is invalid");
  if (job.status !== "queued") return job;
  if (job.capability === PROJECT_AUDIT_CAPABILITY) return runProjectAuditJob({ ...ctx, id: job.id });
  if (job.capability === PPT_QUALITY_CAPABILITY) return runPptQualityJob({ ...ctx, id: job.id });
  if (job.capability === PPT_IMPROVE_CAPABILITY) return runPptImproveJob({ ...ctx, id: job.id });
  if (job.capability === PPT_CREATE_CAPABILITY) return runPptCreateJob({ ...ctx, id: job.id, buildPptx: buildCreatedPptx, buildPdf: buildPdfWithLibreOffice });
  if (job.capability === REGISTRATION.capability) return runEditableJob({ ...ctx, id: job.id, executeSlideclone: bundledSlidecloneRunner(), enhanceArtifacts: ({ outputDir }) => createImageDeliveryArtifacts({ outputDir, buildPdf: buildPdfWithLibreOffice }) });
  throw new Error("job capability cannot be run locally");
}
function buildCreatedPptx({ irFile, outFile, templatePptx }) {
  const skillRoot = path.join(REPOSITORY_ROOT, "skills", "pd-hifi-slideclone");
  buildOpenXmlDecksSync([{ irFile, outFile, templatePptx }], { skillRoot, config: { openXmlBuilder: { cache: false, configuration: "Release", targetFramework: "net8.0" } }, metrics: {} }, path.join(skillRoot, "dotnet", "OpenXmlDeckBuilder"), { powerPointSafe: true });
}
async function main() {
  const args = parse(process.argv.slice(2));
  const [area, action] = args._;
  const ctx = context(args);
  if (area === "doctor") return doctor(args);
  if (area === "runtime" && action === "status") {
    process.stdout.write(`${JSON.stringify(runtimeStatus(args), null, 2)}\n`);
    return 0;
  }
  if (area === "runtime" && action === "resolve") {
    if (typeof args.capability !== "string" || !args.capability.trim()) throw new Error("runtime resolve requires --capability");
    const configuration = readRuntimeConfig();
    const route = resolveExecutionRoute({ capability: args.capability, executionMode: configuration.executionMode, requestedExecution: args.execution });
    process.stdout.write(`${JSON.stringify({ capability: args.capability, ...route, configuration }, null, 2)}\n`);
    return 0;
  }
  if (area === "mcp" && action === "serve") {
    serveStdio({ context: ctx });
    return 0;
  }
  if (area === "team" && action === "doctor") return teamDoctor(args);
  if (area === "team" && action === "deployment-plan") {
    const result = teamDeploymentPlan(args.capabilities === undefined ? process.env.COMMON_TOOLS_TEAM_CAPABILITIES : args.capabilities);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "team" && action === "local-config") {
    const report = localTeamConfigReport(args);
    process.stdout.write(`${JSON.stringify(report.info, null, 2)}\n`);
    return report.exitCode;
  }
  if (area === "team" && action === "raw-image-archive") {
    if ((!args.input && !args.inputs) || (args.input && args.inputs) || !args.out) throw new Error("team raw-image-archive requires exactly one of --input or --inputs, plus --out");
    const listedInputs = args.inputs === undefined ? undefined : String(args.inputs).split(",").map((item) => item.trim());
    if (listedInputs && (listedInputs.some((item) => !item) || new Set(listedInputs).size !== listedInputs.length)) throw new Error("--inputs must be an ordered comma-separated list without empty or duplicate paths");
    const result = createRawImageArchive({
      ...(listedInputs ? { inputFiles: listedInputs.map((item) => resolveWorkspaceChild(ctx.workspaceRoot, item, "raw image archive input")) } : { inputFile: resolveWorkspaceChild(ctx.workspaceRoot, args.input, "raw image archive input") }),
      outputFile: resolveWorkspaceChild(ctx.workspaceRoot, args.out, "raw image archive output")
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "team" && action === "production-preflight") {
    const { runProductionPreflight } = require("../production-preflight");
    const result = runProductionPreflight(process.env, { repositoryRoot: REPOSITORY_ROOT });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "team" && action === "keycloak-project-mapper") {
    const result = await runKeycloakProjectMapperCommand(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "team" && action === "keycloak-mcp-client") {
    const result = await runKeycloakMcpClientCommand(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "plugin" && action === "scaffold") {
    if (!args.name || !args.out) throw new Error("plugin scaffold requires --name and --out");
    const plan = scaffoldPlan({ name: args.name, output: args.out });
    if (args.write !== true) {
      process.stdout.write(`${JSON.stringify({ ...plan, written: false }, null, 2)}\n`);
      return 0;
    }
    const result = writeScaffold(plan);
    try {
      validateScaffoldBundle(plan.output, plan.capability);
    } catch (error) {
      fs.rmSync(plan.output, { recursive: true, force: true });
      throw error;
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "plugin" && action === "list") {
    process.stdout.write(`${JSON.stringify(pluginCatalog(ctx.stateRoot), null, 2)}\n`);
    return 0;
  }
  if (area === "plugin" && action === "verify") {
    const capabilityContracts = verifyCapabilityToolContracts(REPOSITORY_ROOT);
    process.stdout.write(`${JSON.stringify({ ...verifyPluginPackaging(REPOSITORY_ROOT), capabilityContracts }, null, 2)}\n`);
    return 0;
  }
  if (area === "plugin" && ["status", "enable", "disable", "rollback", "upgrade"].includes(action)) {
    if (action === "upgrade") {
      verifyCapabilityToolContracts(REPOSITORY_ROOT);
      verifyPluginPackaging(REPOSITORY_ROOT);
    }
    if (args.only === true && action !== "enable") throw new Error("--only is valid only with plugin enable");
    const config = action === "status" ? readPluginConfig(ctx.stateRoot)
      : action === "rollback" ? rollbackPluginConfig(ctx.stateRoot)
        : action === "upgrade" ? upgradePluginConfig(ctx.stateRoot, args.capability)
          : setCapabilityEnabled(ctx.stateRoot, args.capability, action === "enable", { exclusive: args.only === true });
    process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
    return 0;
  }
  if (area === "editable" && action === "run") {
    if (!args.input || !args.out || !args.config) throw new Error("editable run requires --input, --out, and --config");
    requireEnabledCapability(ctx, REGISTRATION.capability);
    const job = runCreatedLocalJob(ctx, createEditableJob({ ...ctx, input: args.input, output: args.out, config: args.config, idempotencyKey: args.idempotencyKey }));
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "editable" && action === "batch") {
    if (!args.inputs || !args.out || !args.config) throw new Error("editable batch requires --inputs, --out, and --config");
    const inputs = String(args.inputs).split(",").map((item) => item.trim());
    if (inputs.length < 2 || inputs.length > 20 || inputs.some((item) => !item) || new Set(inputs).size !== inputs.length) throw new Error("editable batch --inputs must contain two to twenty ordered, unique paths");
    requireEnabledCapability(ctx, REGISTRATION.capability);
    const job = runCreatedLocalJob(ctx, createEditableJob({ ...ctx, inputs: inputs.map((item) => resolveWorkspaceChild(ctx.workspaceRoot, item, "editable batch input")), output: args.out, config: args.config, idempotencyKey: args.idempotencyKey }));
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "editable" && action === "create") {
    if (!args.input || !args.out || !args.config) throw new Error("editable create requires --input, --out, and --config");
    requireEnabledCapability(ctx, REGISTRATION.capability);
    process.stdout.write(`${JSON.stringify(createEditableJob({ ...ctx, input: args.input, output: args.out, config: args.config, idempotencyKey: args.idempotencyKey }), null, 2)}\n`);
    return 0;
  }
  if (area === "editable" && action === "apply-edit") {
    if (!args.input || !args.patch || !args.out) throw new Error("editable apply-edit requires --input, --patch and --out");
    requireEnabledCapability(ctx, REGISTRATION.capability);
    process.stdout.write(`${JSON.stringify(persistIrEditorPatch({ workspaceRoot: ctx.workspaceRoot, input: args.input, patch: args.patch, output: args.out }), null, 2)}\n`);
    return 0;
  }
  if (area === "audit" && action === "plan") {
    process.stdout.write(`${JSON.stringify({ ...auditLevelPlan(args.level), ...auditIntentPlan({ mode: args.mode, instruction: args.instruction }), auditDomains: parseAuditScope(args.scope) }, null, 2)}\n`);
    return 0;
  }
  if (area === "audit" && action === "levels") {
    process.stdout.write(`${renderAuditLevelMenu()}\n`);
    return 0;
  }
  if (area === "audit" && action === "scopes") {
    process.stdout.write(`${renderAuditScopeMenu()}\n`);
    return 0;
  }
  if (area === "audit" && action === "evidence-template") {
    if (!args.out) throw new Error("audit evidence-template requires --out");
    requireEnabledCapability(ctx, PROJECT_AUDIT_CAPABILITY);
    process.stdout.write(`${JSON.stringify(createExperienceEvidenceTemplate(args.root || ctx.workspaceRoot, args.out), null, 2)}\n`);
    return 0;
  }
  if (area === "audit" && action === "experience-collect") {
    if (!args.plan || !args.out) throw new Error("audit experience-collect requires --plan and --out");
    if (args["run-browser"] !== true) throw new Error("audit experience-collect requires explicit --run-browser");
    requireEnabledCapability(ctx, PROJECT_AUDIT_CAPABILITY);
    const result = await collectBrowserExperience({ projectRoot: args.root || ctx.workspaceRoot, planFile: args.plan, output: args.out, browser: args.browser, timeoutMs: args["browser-timeout-ms"], allowExternalUrl: args["allow-external-url"] === true });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "audit" && action === "run") {
    if (!args.out) throw new Error("audit run requires --out");
    requireEnabledCapability(ctx, PROJECT_AUDIT_CAPABILITY);
    const job = runCreatedLocalJob(ctx, createProjectAuditJob({ ...ctx, projectRoot: args.root || ctx.workspaceRoot, output: args.out, idempotencyKey: args.idempotencyKey, level: args.level, mode: args.mode, instruction: args.instruction, scope: args.scope, experienceEvidence: args["experience-evidence"], runGates: args["run-gates"] === true, gateTimeoutMs: args["gate-timeout-ms"] }));
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "audit" && action === "interactive") {
    requireEnabledCapability(ctx, PROJECT_AUDIT_CAPABILITY);
    const selectedLevel = args.level === undefined ? await promptAuditLevel() : parseAuditLevel(args.level).id;
    const selectedScope = args.scope === undefined ? await promptAuditScope() : parseAuditScope(args.scope).join(",");
    const output = args.out || path.join(ctx.workspaceRoot, ".common-tools", "reports", "project-audit");
    const job = runCreatedLocalJob(ctx, createProjectAuditJob({ ...ctx, projectRoot: args.root || ctx.workspaceRoot, output, idempotencyKey: args.idempotencyKey, level: selectedLevel, mode: args.mode, instruction: args.instruction, scope: selectedScope, experienceEvidence: args["experience-evidence"], runGates: args["run-gates"] === true, gateTimeoutMs: args["gate-timeout-ms"] }));
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "audit" && action === "create") {
    if (!args.out) throw new Error("audit create requires --out");
    requireEnabledCapability(ctx, PROJECT_AUDIT_CAPABILITY);
    process.stdout.write(`${JSON.stringify(createProjectAuditJob({ ...ctx, projectRoot: args.root || ctx.workspaceRoot, output: args.out, idempotencyKey: args.idempotencyKey, level: args.level, mode: args.mode, instruction: args.instruction, scope: args.scope, experienceEvidence: args["experience-evidence"], runGates: args["run-gates"] === true, gateTimeoutMs: args["gate-timeout-ms"] }), null, 2)}\n`);
    return 0;
  }
  if (area === "job" && ["get", "cancel", "run"].includes(action)) {
    if (!args.id) throw new Error(`job ${action} requires --id`);
    const current = getJob({ ...ctx, id: args.id });
    if (!current) return 3;
    if (action === "run") requireEnabledCapability(ctx, current.capability);
    const job = action === "get" ? current : action === "cancel" ? cancelJob({ ...ctx, id: args.id }) : runCreatedLocalJob(ctx, current);
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  throw new Error(COMMAND_USAGE);
}
async function mainWithPptQuality() {
  const args = parse(process.argv.slice(2));
  const [area, action] = args._;
  const ctx = context(args);
  if (area === "help" || args.help === true) {
    process.stdout.write(`${COMMAND_USAGE}\n`);
    return 0;
  }
  if (area === "plugin" && action === "list") {
    process.stdout.write(`${JSON.stringify(pluginCatalog(ctx.stateRoot, ctx.workspaceRoot), null, 2)}\n`);
    return 0;
  }
  if (area === "plugin" && action === "status") {
    process.stdout.write(`${JSON.stringify(effectivePluginConfig(ctx.stateRoot, ctx.workspaceRoot), null, 2)}\n`);
    return 0;
  }
  if (area === "plugin" && action === "set") {
    const config = setEnabledCapabilities(ctx.stateRoot, parseCapabilityList(args.capabilities));
    process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
    return 0;
  }
  if (area === "editable" && action === "init") {
    requireEnabledCapability(ctx, REGISTRATION.capability);
    process.stdout.write(`${JSON.stringify(initializeEditableProfile(ctx, args), null, 2)}\n`);
    return 0;
  }
  if (area === "team" && action === "runtime") return teamRuntime(args);
  if (area === "ppt" && ["draft", "compose"].includes(action)) {
    if (!args.input || !args.out || !args.audience || !args.purpose) throw new Error(`ppt ${action} requires --input, --out, --audience and --purpose`);
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    const promptOptions = {
      audience: args.audience,
      purpose: args.purpose,
      language: args.language,
      theme: args.theme,
      maxSlides: args["max-slides"] === undefined ? undefined : Number(args["max-slides"]),
      deckVariantCount: args["deck-variants"] === undefined ? undefined : Number(args["deck-variants"]),
      closing: args.closing === undefined ? [] : String(args.closing).split("|").map((item) => item.trim()).filter(Boolean)
    };
    if ((args["provider-config"] === undefined) !== (args["provider-id"] === undefined)) throw new Error("ppt content provider requires both --provider-config and --provider-id");
    if (args["provider-config"] !== undefined) {
      promptOptions.contentProviderId = args["provider-id"];
      promptOptions.contentProviderRegistry = loadContentProviderConfig({ configFile: args["provider-config"], allowedRoot: ctx.workspaceRoot });
    }
    if (action === "draft") {
      const result = args["provider-config"] === undefined
        ? persistPromptPlan({ workspaceRoot: ctx.workspaceRoot, input: args.input, output: args.out, outputFormat: args["output-format"], ...promptOptions })
        : await persistPromptPlanAsync({ workspaceRoot: ctx.workspaceRoot, input: args.input, output: args.out, outputFormat: args["output-format"], ...promptOptions });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }
    const source = resolveWorkspaceChild(ctx.workspaceRoot, args.input, "--input");
    const info = fs.lstatSync(source);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > 256 * 1024 || ![".md", ".markdown", ".txt"].includes(path.extname(source).toLowerCase())) throw new Error("ppt compose input must be a bounded, non-symbolic text or Markdown file");
    const generated = args["provider-config"] === undefined ? promptToPresentation(fs.readFileSync(source, "utf8"), promptOptions) : await promptToPresentationAsync(fs.readFileSync(source, "utf8"), promptOptions);
    const temporarySpec = path.join(ctx.workspaceRoot, `.common-tools-compose-${crypto.randomUUID()}.json`);
    try {
      fs.writeFileSync(temporarySpec, `${JSON.stringify(generated.spec, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      const created = createPptCreateJob({ ...ctx, input: temporarySpec, output: args.out, idempotencyKey: args.idempotencyKey, generationManifest: generated.manifest });
      const job = runCreatedLocalJob(ctx, created);
      process.stdout.write(`${JSON.stringify({ job, generation: generated.report }, null, 2)}\n`);
      return job.status === "succeeded" ? 0 : 2;
    } finally {
      fs.rmSync(temporarySpec, { force: true });
    }
  }
  if (area === "ppt" && action === "plan") {
    if (!args.input || !args.out) throw new Error("ppt plan requires --input and --out");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    process.stdout.write(`${JSON.stringify(persistPresentationPlan({ workspaceRoot: ctx.workspaceRoot, input: args.input, output: args.out }), null, 2)}\n`);
    return 0;
  }
  if (area === "ppt" && action === "ingest") {
    if (!args.input || !args.out || !args.audience || !args.purpose) throw new Error("ppt ingest requires --input, --out, --audience and --purpose");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    const maxSlides = args["max-slides"] === undefined ? undefined : Number(args["max-slides"]);
    const deckVariantCount = args["deck-variants"] === undefined ? undefined : Number(args["deck-variants"]);
    const closing = args.closing === undefined ? [] : String(args.closing).split("|").map((item) => item.trim()).filter(Boolean);
    const result = persistDocumentPlan({ workspaceRoot: ctx.workspaceRoot, input: args.input, output: args.out, audience: args.audience, purpose: args.purpose, language: args.language, theme: args.theme, maxSlides, deckVariantCount, closing, outputFormat: args["output-format"], extractPdfLayout, extractPdfText });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt" && action === "archive") {
    if (!args.input || !args.out) throw new Error("ppt archive requires --input and --out");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    const result = createPptCreateArchive({ specFile: resolveWorkspaceChild(ctx.workspaceRoot, args.input, "--input"), outputFile: resolveWorkspaceChild(ctx.workspaceRoot, args.out, "--out") });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt" && action === "preview") {
    if (!args.input || !args.out) throw new Error("ppt preview requires --input and --out");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    process.stdout.write(`${JSON.stringify(writeEditorPreview({ workspaceRoot: ctx.workspaceRoot, input: args.input, output: args.out }), null, 2)}\n`);
    return 0;
  }
  if (area === "ppt" && action === "apply-edit") {
    if (!args.input || !args.patch || !args.out) throw new Error("ppt apply-edit requires --input, --patch and --out");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    process.stdout.write(`${JSON.stringify(persistEditorPatch({ workspaceRoot: ctx.workspaceRoot, input: args.input, patch: args.patch, output: args.out }), null, 2)}\n`);
    return 0;
  }
  if (area === "ppt" && action === "apply-ir-edit") {
    if (!args.input || !args.patch || !args.out) throw new Error("ppt apply-ir-edit requires --input, --patch and --out");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    process.stdout.write(`${JSON.stringify(persistIrEditorPatch({ workspaceRoot: ctx.workspaceRoot, input: args.input, patch: args.patch, output: args.out }), null, 2)}\n`);
    return 0;
  }
  if (area === "ppt" && action === "export-ir") {
    if (!args.input || !args.out) throw new Error("ppt export-ir requires --input and --out");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    const result = exportEditedIrArtifacts({ workspaceRoot: ctx.workspaceRoot, input: args.input, output: args.out, template: args.template, buildPptx: buildCreatedPptx, buildPdf: buildPdfWithLibreOffice });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt" && action === "finalize-ir-edit") {
    if (!args.input || !args.patch || !args.out) throw new Error("ppt finalize-ir-edit requires --input, --patch and --out");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    const result = applyAndExportIrArtifacts({ workspaceRoot: ctx.workspaceRoot, input: args.input, patch: args.patch, output: args.out, template: args.template, buildPptx: buildCreatedPptx, buildPdf: buildPdfWithLibreOffice });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt" && action === "edit-session") {
    if (!args.input || !args.out) throw new Error("ppt edit-session requires --input and --out");
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    const session = await startIrEditorSession({ workspaceRoot: ctx.workspaceRoot, input: args.input, output: args.out, template: args.template, buildPptx: buildCreatedPptx, buildPdf: buildPdfWithLibreOffice, openBrowser: args["no-open"] !== true });
    process.stdout.write(`${JSON.stringify({ status: "ready", url: session.url }, null, 2)}\n`);
    const completion = await session.completion;
    process.stdout.write(`${JSON.stringify({ status: completion.status, ...(completion.result ? { output: completion.result.output, revision: completion.result.revision } : {}) }, null, 2)}\n`);
    return completion.status === "completed" ? 0 : 1;
  }
  if (area === "ppt" && ["create", "enqueue"].includes(action)) {
    if (!args.input || !args.out) throw new Error(`ppt ${action} requires --input and --out`);
    requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
    const created = createPptCreateJob({ ...ctx, input: args.input, output: args.out, idempotencyKey: args.idempotencyKey });
    const job = action === "create" ? runCreatedLocalJob(ctx, created) : created;
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt-quality" && action === "run") {
    if (!args.input || !args.out) throw new Error("ppt-quality run requires --input and --out");
    requireEnabledCapability(ctx, PPT_QUALITY_CAPABILITY);
    const job = runCreatedLocalJob(ctx, createPptQualityJob({ ...ctx, input: args.input, output: args.out, idempotencyKey: args.idempotencyKey }));
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt-quality" && action === "create") {
    if (!args.input || !args.out) throw new Error("ppt-quality create requires --input and --out");
    requireEnabledCapability(ctx, PPT_QUALITY_CAPABILITY);
    const job = createPptQualityJob({ ...ctx, input: args.input, output: args.out, idempotencyKey: args.idempotencyKey });
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt-improve" && action === "run") {
    if (!args.input || !args.report || !args.out) throw new Error("ppt-improve run requires --input, --report and --out");
    requireEnabledCapability(ctx, PPT_IMPROVE_CAPABILITY);
    const job = runCreatedLocalJob(ctx, createPptImproveJob({ ...ctx, input: args.input, report: args.report, output: args.out, idempotencyKey: args.idempotencyKey, profile: args.profile }));
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt-improve" && action === "pipeline") {
    const result = runPptImprovePipeline(ctx, args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  if (area === "ppt-improve" && action === "create") {
    if (!args.input || !args.report || !args.out) throw new Error("ppt-improve create requires --input, --report and --out");
    requireEnabledCapability(ctx, PPT_IMPROVE_CAPABILITY);
    const job = createPptImproveJob({ ...ctx, input: args.input, report: args.report, output: args.out, idempotencyKey: args.idempotencyKey, profile: args.profile });
    process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
    return 0;
  }
  if (area === "job" && action === "run" && args.id) {
    const current = getJob({ ...ctx, id: args.id });
    if (current?.capability === PPT_QUALITY_CAPABILITY) {
      requireEnabledCapability(ctx, PPT_QUALITY_CAPABILITY);
      const job = runPptQualityJob({ ...ctx, id: args.id });
      process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
      return 0;
    }
    if (current?.capability === PPT_IMPROVE_CAPABILITY) {
      requireEnabledCapability(ctx, PPT_IMPROVE_CAPABILITY);
      const job = runPptImproveJob({ ...ctx, id: args.id });
      process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
      return 0;
    }
    if (current?.capability === PPT_CREATE_CAPABILITY) {
      requireEnabledCapability(ctx, PPT_CREATE_CAPABILITY);
      const job = runPptCreateJob({ ...ctx, id: args.id, buildPptx: buildCreatedPptx, buildPdf: buildPdfWithLibreOffice });
      process.stdout.write(`${JSON.stringify(job, null, 2)}\n`);
      return 0;
    }
  }
  return main();
}

if (require.main === module) mainWithPptQuality().then((code) => { process.exitCode = code; }).catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });

module.exports = { COMMAND_USAGE, composeProjectName, composeRuntimeSnapshot, doctorReport, editableProfileConfig, editableProfileProvider, gatewayReadiness, initializeEditableProfile, localTeamConfigReport, loopbackTcpPort, main: mainWithPptQuality, newPipelineOutputRoot, optionalLicense, optionalPaddleOcr, optionalUmiOcr, parse, pluginCatalog, probeReadyEndpoint, requireEnabledCapability, resolveWorkspaceChild, runPptImprovePipeline, runtimeStatus, summarizeContainerStatus, teamDoctor, teamDoctorReport, teamRuntime, teamRuntimeReport, validateScaffoldBundle, workspaceAccess };
