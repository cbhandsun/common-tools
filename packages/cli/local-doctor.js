"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { REGISTRATION } = require("../slideclone-core");
const { CAPABILITY: PROJECT_AUDIT_CAPABILITY } = require("../project-audit-core");
const { CAPABILITY: PPT_QUALITY_CAPABILITY } = require("../ppt-quality-core");
const { CAPABILITY: PPT_IMPROVE_CAPABILITY } = require("../ppt-improve-core");
const { CAPABILITY: PPT_CREATE_CAPABILITY } = require("../ppt-create-core");
const { effectivePluginConfig, insideRoot, readRuntimeConfig, resolveExecutionRoute } = require("../capability-runtime");
const { assertValidConfig } = require("../slideclone-core/config-validation");
const { inspectBundledSlideclone } = require("./slideclone-runner");

const REPOSITORY_ROOT = path.resolve(__dirname, "../..");

function context(args) {
  const workspaceRoot = path.resolve(args.workspace || process.cwd());
  const stateRoot = path.resolve(args.state || path.join(workspaceRoot, ".common-tools"));
  return { workspaceRoot, stateRoot, ownerId: args.owner || "local-user" };
}

function runtimeStatus(_args = {}, environment = process.env) {
  const configuration = readRuntimeConfig(environment);
  const capabilities = [PROJECT_AUDIT_CAPABILITY, REGISTRATION.capability, PPT_QUALITY_CAPABILITY, PPT_IMPROVE_CAPABILITY, PPT_CREATE_CAPABILITY];
  return Object.freeze({
    configuration,
    routes: Object.freeze(Object.fromEntries(capabilities.map((capability) => [capability, resolveExecutionRoute({ capability, executionMode: configuration.executionMode })])))
  });
}

function run(executable, args) {
  const result = childProcess.spawnSync(executable, args, { encoding: "utf8", windowsHide: true });
  return { available: !result.error && result.status === 0, status: result.status, version: (result.stdout || result.stderr || "").trim().split(/\r?\n/)[0] || null };
}

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
  const candidate = path.isAbsolute(value) ? path.resolve(value) : path.resolve(workspaceRoot, value);
  try {
    const approved = insideRoot(workspaceRoot, candidate);
    if (approved === fs.realpathSync.native(workspaceRoot)) throw new Error("root is not a child");
    return approved;
  } catch {
    throw new Error(`${label} must be inside the workspace root`);
  }
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

module.exports = {
  doctorReport,
  editableProfileConfig,
  editableProfileProvider,
  initializeEditableProfile,
  optionalLicense,
  optionalPaddleOcr,
  optionalUmiOcr,
  resolveWorkspaceChild,
  runtimeStatus,
  workspaceAccess
};
