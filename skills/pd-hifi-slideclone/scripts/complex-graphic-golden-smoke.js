#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { createProgressLineForwarder, redactSecrets } = require("./lib/progress-reporter");
const { takeBrokerEnvironment } = require("./lib/paddleocr-corpus-session");

const STAGE_CACHE_FILE = ".complex-graphic-golden-cache.json";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === "true" || args.h === "true") return process.stdout.write(`${usage()}\n`);
  const brokerEnvironment = takeBrokerEnvironment(process.env);
  const deck = normalizeDeckId(required(args.deck, "--deck"));
  const pages = normalizePages(required(args.pages, "--pages"));
  const out = path.resolve(args.out || path.join("runs", "complex-graphic-golden", deck));
  const ocrEnabled = args.ocr === "true";
  const minimumTextCoverage = ocrEnabled ? ratioArg(args["min-text-coverage"], 0.8) : null;
  const minimumLayoutIoU = ratioArg(args["min-layout-iou"], 0.8, "--min-layout-iou");
  const renderer = normalizeRenderer(args.renderer || "libreoffice");
  const workRoot = resolveWorkRoot(args["work-root"], process.env.SLIDECLONE_REAL_PPTX_WORK_ROOT);
  if (!fs.statSync(workRoot, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error("--work-root must reference an existing directory");
  }
  const timings = {};
  const ir = path.join(out, `${deck}.native.ir.json`);
  const pptx = path.join(out, `${deck}.native-editable.pptx`);
  const cacheFile = path.join(out, STAGE_CACHE_FILE);
  const stageCache = readStageCache(cacheFile);
  const rebuildSignature = JSON.stringify({ deck, pages, workRoot });
  const rebuildInputs = resolveRebuildInputs({ workRoot, deck });
  const reuseRebuild = stageReuseEnabled(args, "reuse-rebuild");
  if (
    reuseRebuild
    && stageCache.rebuild?.signature === rebuildSignature
    && outputsAreFresh([ir, pptx], rebuildInputs)
  ) {
    markStageReused("rebuild", timings);
  } else {
    await runStage("rebuild", timings, () => run("node", buildRebuildArgs({ workRoot, deck, pages, out })));
    stageCache.rebuild = { signature: rebuildSignature, completedAt: new Date().toISOString() };
    writeStageCache(cacheFile, stageCache);
  }
  if (isStructuralOnly(args)) {
    process.stdout.write(`${JSON.stringify({
      passed: true,
      mode: "structural-only",
      ir,
      pptx,
      timings
    }, null, 2)}\n`);
    return;
  }
  const qualityDir = path.join(out, "_quality");
  const reportFile = path.join(qualityDir, "quality-gate-report.json");
  const qualitySignature = JSON.stringify({ minimumTextCoverage, renderer });
  const reuseQuality = stageReuseEnabled(args, "reuse-quality");
  if (
    reuseQuality
    && stageCache.quality?.signature === qualitySignature
    && outputIsFresh(reportFile, [ir, pptx])
  ) {
    markStageReused("quality", timings);
  } else {
    await runStage("quality", timings, () => run("node", buildQualityArgs({ ir, pptx, qualityDir, minimumTextCoverage, renderer }), {
      env: { ...process.env, ...brokerEnvironment }
    }));
    stageCache.quality = { signature: qualitySignature, completedAt: new Date().toISOString() };
    writeStageCache(cacheFile, stageCache);
  }
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  const passed = qualityReportPassed(report, { minimumTextCoverage, minimumLayoutIoU });
  process.stdout.write(`${JSON.stringify({
    passed,
    mode: "visual-quality",
    timings,
    reportFile,
    metrics: report.deckMetrics,
    render: {
      provider: report.render?.provider || null,
      reused: report.render?.provider === "existing-render-dir"
    },
    thresholds: { minimumTextCoverage, minimumLayoutIoU },
    gate: {
      failures: report.gate?.failures || [],
      nativeObjectConflicts: Number(report.gate?.nativeObjectConflicts || 0),
      actionableUnexplainedCrops: Number(report.gate?.actionableUnexplainedCrops || 0),
      textOverlayRiskBoxes: Number(report.gate?.textOverlayRiskBoxes || 0)
    },
    editability: {
      editableObjectRatio: report.editabilityProfile?.editableObjectRatio ?? null,
      intentionalRasterImages: Number(report.editabilityProfile?.intentionalRasterImages || 0),
      actionableNonEditableImages: Number(report.editabilityProfile?.actionableNonEditableImages || 0)
    }
  }, null, 2)}\n`);
  if (!passed) process.exitCode = 1;
}

async function runStage(phase, timings, operation) {
  const start = Date.now();
  process.stderr.write(`[complex-graphic-golden] ${phase} start\n`);
  try {
    return await operation();
  } finally {
    const elapsedMs = Date.now() - start;
    timings[`${phase}Ms`] = elapsedMs;
    process.stderr.write(`[complex-graphic-golden] ${phase} done ${elapsedMs}ms\n`);
  }
}

function markStageReused(phase, timings) {
  timings[`${phase}Ms`] = 0;
  timings[`${phase}Reused`] = true;
  process.stderr.write(`[complex-graphic-golden] ${phase} reused\n`);
}

function outputsExist(files = []) {
  return files.length > 0 && files.every((file) => fs.statSync(file, { throwIfNoEntry: false })?.isFile());
}

function outputsAreFresh(outputs = [], inputs = []) {
  if (!outputsExist(outputs) || inputs.length === 0) return false;
  const oldestOutput = Math.min(...outputs.map((file) => fs.statSync(file).mtimeMs));
  const newestInput = Math.max(...inputs.map(newestPathMtime));
  return Number.isFinite(newestInput) && newestInput > 0 && oldestOutput >= newestInput;
}

function newestPathMtime(target) {
  const stat = fs.statSync(target, { throwIfNoEntry: false });
  if (!stat) return 0;
  if (stat.isFile()) return stat.mtimeMs;
  if (!stat.isDirectory()) return 0;
  // Directory mtimes describe entry creation, not source-content freshness.
  let newest = 0;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name === "bin" || entry.name === "obj" || entry.name === "node_modules") continue;
    newest = Math.max(newest, newestPathMtime(path.join(target, entry.name)));
  }
  return newest;
}

function resolveRebuildInputs({ workRoot, deck }) {
  return [
    path.join(workRoot, `${deck}.work`),
    path.join(__dirname, "rebuild-real-pptx-native.js"),
    path.join(__dirname, "lib"),
    path.join(__dirname, "..", "dotnet", "OpenXmlDeckBuilder")
  ].filter((target) => fs.statSync(target, { throwIfNoEntry: false }));
}

function stageReuseEnabled(args = {}, key) {
  return args.force !== "true" && String(args[key] ?? "true").toLowerCase() !== "false";
}

function readStageCache(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeStageCache(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function outputIsFresh(output, inputs = []) {
  const outputStat = fs.statSync(output, { throwIfNoEntry: false });
  if (!outputStat?.isFile() || inputs.length === 0) return false;
  return inputs.every((input) => {
    const inputStat = fs.statSync(input, { throwIfNoEntry: false });
    return inputStat?.isFile() && outputStat.mtimeMs >= inputStat.mtimeMs;
  });
}

function isStructuralOnly(args = {}) {
  return args["structural-only"] === "true" || args.quality === "false";
}

function normalizeRenderer(value) {
  const renderer = String(value || "").trim().toLowerCase();
  if (renderer === "powerpoint" || renderer === "libreoffice") return renderer;
  throw new Error("--renderer must be either powerpoint or libreoffice");
}

function resolveWorkRoot(argumentValue, environmentValue) {
  const configured = argumentValue || environmentValue || "ppt文档/可编辑版本";
  if (typeof configured !== "string" || configured.trim().length === 0 || configured.length > 2048) {
    throw new TypeError("real PPTX work root is invalid");
  }
  return path.resolve(configured);
}

function qualityReportPassed(report, options = {}) {
  const gate = report?.gate;
  const summary = report?.summary;
  if (gate?.passed !== true || summary?.passed !== true) return false;
  if (Number(summary.rejected || 0) !== 0) return false;
  if (Array.isArray(gate.failures) && gate.failures.length > 0) return false;
  const structuralPassed = [
    gate.textOverlayRiskBoxes,
    gate.residualLayerCandidates,
    gate.actionableRetainedComponentTemplateCrops,
    gate.actionableUnexplainedCrops,
    gate.nativeObjectConflicts
  ].every((value) => Number(value || 0) === 0);
  if (!structuralPassed) return false;
  if (typeof options.minimumTextCoverage === "number") {
    const coverage = Number(report?.deckMetrics?.textCoverage);
    if (!Number.isFinite(coverage) || coverage < options.minimumTextCoverage) return false;
  }
  if (typeof options.minimumLayoutIoU === "number") {
    const rawLayoutIoU = report?.deckMetrics?.layoutMeanIoU;
    const hasLayoutEvidence = rawLayoutIoU !== null && rawLayoutIoU !== undefined && rawLayoutIoU !== "";
    const layoutIoU = Number(rawLayoutIoU);
    if (hasLayoutEvidence && Number.isFinite(layoutIoU) && layoutIoU < options.minimumLayoutIoU) return false;
  }
  return true;
}

function buildRebuildArgs({ workRoot, deck, pages, out }) {
  return [
    "skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native.js",
    "--work-root", workRoot,
    "--only", deck,
    "--pages", pages,
    "--out", out,
    "--smart-native-layers", "true",
    "--pptx-engine", "openxml",
    "--progress", "true"
  ];
}

function buildQualityArgs({ ir, pptx, qualityDir, minimumTextCoverage = null, renderer = "libreoffice" }) {
  const args = [
    "skills/pd-hifi-slideclone/scripts/quality-gate-real-pptx.js",
    "--ir", ir,
    "--pptx", pptx,
    "--out", qualityDir,
    "--renderer", normalizeRenderer(renderer),
    "--reuse-render", "true",
    "--contact-pages", "0",
    "--heartbeat-ms", "10000",
    "--fail-on-rejected", "true",
    "--fail-on-text-overlay-risk", "true",
    "--fail-on-residual-layer-candidates", "true",
    "--fail-on-actionable-component-template-retained-crops", "true",
    "--fail-on-actionable-unexplained-crops", "true",
    "--fail-on-native-object-conflicts", "true",
    "--fail-on-duplicate-pptx-text", "true"
  ];
  if (typeof minimumTextCoverage === "number") {
    args.push(
      "--text-ocr", "true",
      "--text-ocr-adapter", "scripts/adapters/ocr-paddleocr-local.js",
      "--text-ocr-mode", "fullPage",
      "--min-text-coverage", String(minimumTextCoverage)
    );
  }
  return args;
}

function run(command, args, options = {}) {
  const maxOutputChars = positiveInt(options.maxOutputChars, 64 * 1024 * 1024);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), windowsHide: true, shell: false, ...(options.env ? { env: options.env } : {}) });
    const progress = createProgressLineForwarder({ stream: process.stderr });
    let stdout = "";
    let stderr = "";
    let overflow = false;
    child.stdout.on("data", (chunk) => {
      const appended = appendBounded(stdout, chunk, maxOutputChars);
      stdout = appended.value;
      overflow ||= appended.overflow;
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      const appended = appendBounded(stderr, text, maxOutputChars);
      stderr = appended.value;
      progress.write(text);
      overflow ||= appended.overflow;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      progress.flush();
      if (overflow) return reject(new Error(`${command} exceeded the bounded output limit`));
      if (status !== 0) return reject(new Error(safeChildError(stderr || stdout || `${command} failed`)));
      resolve({ stdout, stderr });
    });
  });
}
function safeChildError(value) { return redactSecrets(String(value || "")).replace(/[\r\n]+/g, " ").slice(-4000); }
function positiveInt(value, fallback) { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : fallback; }
function ratioArg(value, fallback, name = "--min-text-coverage") {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new Error(`${name} must be between 0 and 1`);
  return number;
}
function appendBounded(current, chunk, limit) {
  const combined = `${current}${String(chunk || "")}`;
  return { value: combined.slice(-limit), overflow: combined.length > limit };
}
function parseArgs(argv) { const out = {}; for (let i = 0; i < argv.length; i += 1) { const key = argv[i]; if (!key.startsWith("--")) continue; const value = argv[i + 1]; if (!value || value.startsWith("--")) out[key.slice(2)] = "true"; else { out[key.slice(2)] = value; i += 1; } } return out; }
function required(value, name) { if (!value) throw new Error(`${name} is required`); return value; }
function normalizeDeckId(value) {
  const deck = String(value || "").trim();
  const codePointLength = Array.from(deck).length;
  const windowsStem = deck.split(".", 1)[0].toUpperCase();
  const reservedWindowsName = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(windowsStem);
  const hasUnsafeCharacters = /[<>:"/\\|?*\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/u.test(deck);
  if (
    codePointLength < 1
    || codePointLength > 120
    || deck === "."
    || deck === ".."
    || deck.endsWith(".")
    || deck.endsWith(" ")
    || reservedWindowsName
    || hasUnsafeCharacters
  ) {
    throw new Error("--deck must be a safe 1-120 character file identifier");
  }
  return deck;
}
function normalizePages(value) {
  const tokens = String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 100) throw new Error("--pages must contain 1-100 page numbers");
  const pages = tokens.map((token) => {
    if (!/^\d+$/.test(token)) throw new Error("--pages accepts comma-separated positive integers only");
    const page = Number(token);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new Error("--pages values must be between 1 and 10000");
    return page;
  });
  return [...new Set(pages)].join(",");
}
function usage() { return "Usage: node complex-graphic-golden-smoke.js --deck <name> --pages <n[,n...]> [--out <dir>] [--structural-only] [--renderer <powerpoint|libreoffice>] [--reuse-rebuild <true|false>] [--reuse-quality <true|false>] [--force]"; }
if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[complex-graphic-golden] ${safeChildError(error?.message || error)}\n`);
    process.exitCode = 1;
  });
}
module.exports = {
  buildQualityArgs,
  buildRebuildArgs,
  normalizeDeckId,
  normalizePages,
  normalizeRenderer,
  newestPathMtime,
  outputIsFresh,
  outputsAreFresh,
  outputsExist,
  parseArgs,
  isStructuralOnly,
  qualityReportPassed,
  readStageCache,
  resolveRebuildInputs,
  resolveWorkRoot,
  runStage,
  ratioArg,
  stageReuseEnabled,
  usage
};
