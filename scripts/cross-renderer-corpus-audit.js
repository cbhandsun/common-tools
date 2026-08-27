#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const MAX_CASES = 32;
const DEFAULT_PIXEL_REGRESSION_BUDGET = 0.08;
const DEFAULT_FOREGROUND_REGRESSION_BUDGET = 0.1;

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return process.stdout.write(`${usage()}\n`);
  if (!args.current) throw new Error("--current is required");
  const currentFile = requiredJsonFile(args.current, "corpus report");
  const corpus = readJson(currentFile);
  const renderer = normalizeRenderer(args.renderer || "powerpoint");
  const maxCases = boundedInteger(args["max-cases"] ?? 4, "max cases", 1, MAX_CASES);
  const timeoutMs = boundedInteger(args["case-timeout-ms"] ?? 600000, "case timeout", 1000, 3600000);
  const outputDir = safeWorkspacePath(process.cwd(), args.out || "artifacts/ppt-office-regression/cross-renderer", "output directory");
  fs.mkdirSync(outputDir, { recursive: true });
  const plans = buildCrossRendererPlans(corpus, { renderer, maxCases, outputDir });
  const results = [];
  for (const plan of plans) {
    process.stderr.write(`[cross-renderer] start ${plan.id} ${renderer}\n`);
    const result = runCrossRendererPlan(plan, { renderer, timeoutMs });
    results.push(result);
    process.stderr.write(`[cross-renderer] ${result.passed ? "passed" : "failed"} ${plan.id} ${renderer}\n`);
  }
  const report = {
    provider: "cross-renderer-corpus-audit-v1",
    generatedAt: new Date().toISOString(),
    renderer,
    passed: results.length > 0 && results.every((item) => item.passed),
    totals: {
      cases: results.length,
      passing: results.filter((item) => item.passed).length,
      failing: results.filter((item) => !item.passed).length,
      elapsedMs: results.reduce((sum, item) => sum + item.elapsedMs, 0)
    },
    cases: results
  };
  const reportFile = path.join(outputDir, "cross-renderer-report.json");
  writeJsonAtomic(reportFile, report);
  process.stdout.write(`${JSON.stringify({ passed: report.passed, reportFile, totals: report.totals }, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

function runCrossRendererPlan(plan, options = {}) {
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.args)) throw new TypeError("cross-renderer plan is invalid");
  const renderer = normalizeRenderer(options.renderer || "powerpoint");
  const timeoutMs = boundedInteger(options.timeoutMs ?? 600000, "case timeout", 1000, 3600000);
  const spawn = options.spawn || spawnSync;
  if (typeof spawn !== "function") throw new TypeError("cross-renderer process adapter is invalid");
  const now = options.now || Date.now;
  if (typeof now !== "function") throw new TypeError("cross-renderer clock is invalid");
  const startedAt = now();
  const maximumAttempts = renderer === "powerpoint" ? 2 : 1;
  let lastRun = null;
  const reportFile = path.join(plan.outputDir, "quality-gate-report.json");
  fs.rmSync(reportFile, { force: true });
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    lastRun = spawn(process.execPath, plan.args, {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024
    });
    if (fs.statSync(reportFile, { throwIfNoEntry: false })?.isFile()) {
      return Object.freeze({
        ...evaluateCrossRendererCase(plan.primaryReport, readJson(reportFile), {
          id: plan.id, renderer, elapsedMs: now() - startedAt
        }),
        attempts: attempt
      });
    }
    if (!lastRun?.error && lastRun?.status === 0) break;
    if (attempt < maximumAttempts) process.stderr.write(`[cross-renderer] retry ${plan.id} ${renderer}\n`);
  }
  return createExecutionFailureResult(plan.id, renderer, lastRun, maximumAttempts, now() - startedAt);
}

function createExecutionFailureResult(id, renderer, run, attempts, elapsedMs) {
  const exitCode = Number.isSafeInteger(run?.status) ? run.status : null;
  const signal = typeof run?.signal === "string" && /^[A-Z0-9]{1,32}$/u.test(run.signal) ? run.signal : null;
  return Object.freeze({
    id: safeId(id),
    renderer: normalizeRenderer(renderer),
    passed: false,
    failures: ["cross-renderer-execution"],
    elapsedMs: boundedInteger(elapsedMs, "elapsed time", 0, 10000000),
    attempts: boundedInteger(attempts, "attempts", 1, 2),
    execution: Object.freeze({
      exitCode,
      signal,
      timedOut: run?.error?.code === "ETIMEDOUT"
    })
  });
}

function buildCrossRendererPlans(corpus, options = {}) {
  if (corpus?.provider !== "real-pptx-corpus-runner" || !Array.isArray(corpus.cases) || corpus.cases.length > 512) {
    throw new TypeError("real PPTX corpus report is invalid");
  }
  const renderer = normalizeRenderer(options.renderer || "powerpoint");
  const maxCases = boundedInteger(options.maxCases ?? 4, "max cases", 1, MAX_CASES);
  const outputDir = path.resolve(String(options.outputDir || ""));
  if (!options.outputDir || options.outputDir.length > 2048) throw new TypeError("cross-renderer output directory is invalid");
  const plans = [];
  for (const item of corpus.cases) {
    const id = safeId(item?.id);
    const primaryReportFile = requiredJsonFile(item?.reportFile, `primary report for ${id}`);
    const primaryReport = readJson(primaryReportFile);
    // The corpus also contains specialist cases (for example native-chart
    // golden reports) that do not expose an IR/PPTX pair. They remain valid
    // corpus evidence but cannot participate in this cross-renderer audit.
    if (primaryReport?.provider !== "quality-gate-real-pptx") continue;
    const irFile = requiredInputFile(primaryReport.irFile, ".json", `IR for ${id}`);
    const pptxFile = requiredInputFile(primaryReport.pptxFile, ".pptx", `PPTX for ${id}`);
    const caseOutputDir = path.join(outputDir, id);
    plans.push(Object.freeze({
      id,
      outputDir: caseOutputDir,
      primaryReport,
      args: Object.freeze(buildQualityArgs({ irFile, pptxFile, outputDir: caseOutputDir, renderer }))
    }));
    if (plans.length >= maxCases) break;
  }
  return plans;
}

function buildQualityArgs({ irFile, pptxFile, outputDir, renderer }) {
  return [
    "skills/pd-hifi-slideclone/scripts/quality-gate-real-pptx.js",
    "--ir", irFile,
    "--pptx", pptxFile,
    "--out", outputDir,
    "--renderer", normalizeRenderer(renderer),
    "--reuse-render", "false",
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
}

function evaluateCrossRendererCase(primary, cross, metadata = {}) {
  if (!primary || !cross || typeof primary !== "object" || typeof cross !== "object") throw new TypeError("cross-renderer reports are invalid");
  const primaryPixel = ratioMetric(primary.deckMetrics?.pixelDiffRatio, "primary pixel diff");
  const crossPixel = ratioMetric(cross.deckMetrics?.pixelDiffRatio, "cross-renderer pixel diff");
  const primaryForeground = ratioMetric(primary.deckMetrics?.foregroundMissingRatio, "primary foreground missing");
  const crossForeground = ratioMetric(cross.deckMetrics?.foregroundMissingRatio, "cross-renderer foreground missing");
  const pixelRegression = round(crossPixel - primaryPixel);
  const foregroundRegression = round(crossForeground - primaryForeground);
  const pixelBudget = ratioMetric(metadata.pixelRegressionBudget ?? DEFAULT_PIXEL_REGRESSION_BUDGET, "pixel regression budget");
  const foregroundBudget = ratioMetric(metadata.foregroundRegressionBudget ?? DEFAULT_FOREGROUND_REGRESSION_BUDGET, "foreground regression budget");
  const failures = [];
  if (cross.gate?.passed !== true) failures.push("cross-renderer-quality-gate");
  if (pixelRegression > pixelBudget) failures.push("cross-renderer-pixel-regression");
  if (foregroundRegression > foregroundBudget) failures.push("cross-renderer-foreground-regression");
  return Object.freeze({
    id: safeId(metadata.id),
    renderer: normalizeRenderer(metadata.renderer || "powerpoint"),
    passed: failures.length === 0,
    failures,
    elapsedMs: boundedInteger(metadata.elapsedMs ?? 0, "elapsed time", 0, 10000000),
    primary: { pixelDiffRatio: primaryPixel, foregroundMissingRatio: primaryForeground },
    crossRenderer: { pixelDiffRatio: crossPixel, foregroundMissingRatio: crossForeground },
    drift: { pixelDiffRatio: pixelRegression, foregroundMissingRatio: foregroundRegression },
    budgets: { pixelDiffRatio: pixelBudget, foregroundMissingRatio: foregroundBudget }
  });
}

function parseArgs(argv) {
  const allowed = new Set(["current", "out", "renderer", "max-cases", "case-timeout-ms", "help"]);
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) throw new Error(`Unexpected positional argument: ${item}`);
    const key = item.slice(2);
    if (!allowed.has(key)) throw new Error(`Unknown option: --${key}`);
    if (key === "help") { args.help = true; continue; }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args[key] = next;
    index += 1;
  }
  return args;
}

function normalizeRenderer(value) {
  const renderer = String(value || "").trim().toLowerCase();
  if (!["libreoffice", "powerpoint"].includes(renderer)) throw new TypeError("cross renderer is invalid");
  return renderer;
}
function safeId(value) {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9_.-]{1,128}$/u.test(text)) throw new TypeError("cross-renderer case id is invalid");
  return text;
}
function requiredJsonFile(value, label) { return requiredInputFile(value, ".json", label); }
function requiredInputFile(value, extension, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || value.includes("\0")) throw new TypeError(`${label} is invalid`);
  const file = path.resolve(value);
  if (path.extname(file).toLowerCase() !== extension || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) throw new Error(`${label} is unavailable`);
  return file;
}
function safeWorkspacePath(cwd, value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || value.includes("\0")) throw new TypeError(`${label} is invalid`);
  const root = path.resolve(cwd);
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} must stay inside the workspace`);
  return resolved;
}
function boundedInteger(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new TypeError(`${label} is outside the supported range`);
  return number;
}
function ratioMetric(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new TypeError(`${label} is invalid`);
  return number;
}
function round(value) { return Number(value.toFixed(6)); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, "")); }
function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
function usage() { return "Usage: node scripts/cross-renderer-corpus-audit.js --current <corpus-report.json> [--renderer powerpoint] [--max-cases 4] [--out <dir>]"; }

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = {
  buildCrossRendererPlans,
  buildQualityArgs,
  evaluateCrossRendererCase,
  createExecutionFailureResult,
  normalizeRenderer,
  parseArgs,
  runCrossRendererPlan,
  safeWorkspacePath
};
