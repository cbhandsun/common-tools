#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  buildPptxBatch,
  listWorkDirs
} = require("./rebuild-real-pptx-native");
const {
  componentStrategyPptxBuildOptions,
  summarizePipelineTotals
} = require("./component-strategy-rebuild");
const {
  parseConcurrency,
  recommendResourceAwareConcurrency,
  runLimited
} = require("./real-pptx-editable-batch");
const { prepareSharedComponentInventory } = require("./lib/component-strategy-shared-inventory");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (isTruthy(args.help) || isTruthy(args.h)) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const workRoot = path.resolve(args["work-root"] || args.workRoot || path.join("ppt文档", "可编辑版本"));
  const outRoot = path.resolve(args.out || path.join("ppt文档", "组件策略可编辑版本"));
  const only = args.only || null;
  const reportDir = path.join(outRoot, ".component-strategy-parallel-reports");
  fs.mkdirSync(reportDir, { recursive: true });

  const workDirs = listWorkDirs(workRoot, only);
  const defaultConcurrency = recommendComponentStrategyConcurrency({ workDirCount: workDirs.length });
  const concurrency = parseConcurrency(args.concurrency, defaultConcurrency);
  const batchAfterWorkers = shouldBatchPptxAfterWorkers(args);
  const sharedInventory = prepareSharedComponentInventory({
    argv: process.argv.slice(2),
    outRoot,
    workerArgv: (argv) => componentStrategyWorkerArgv(argv, { batchAfterWorkers })
  });
  const jobs = workDirs.map((workDir, index) => ({ workDir, index }));
  const activeJobs = new Map();
  const heartbeatMs = parsePositiveInt(args["heartbeat-ms"] || args.heartbeatMs, 30000);
  const heartbeatTimer = heartbeatMs > 0
    ? setInterval(() => writeHeartbeat(activeJobs, heartbeatMs), heartbeatMs)
    : null;
  const results = await runLimited(jobs, concurrency, async ({ workDir, index }) => {
    const baseName = path.basename(workDir, ".work");
    process.stderr.write(`[component-strategy-parallel] ${index + 1}/${workDirs.length} start ${baseName}\n`);
    const startedAt = Date.now();
    activeJobs.set(baseName, { index, total: workDirs.length, startedAt });
    const reportFile = path.join(reportDir, `${safeFileStem(baseName)}.json`);
    try {
      const result = await runComponentStrategyWorker({
        argv: sharedInventory.argv,
        baseName,
        reportFile,
        batchAfterWorkers,
        preparedWorkerArgv: true
      });
      result.elapsedMs = Date.now() - startedAt;
      process.stderr.write(`[component-strategy-parallel] ${index + 1}/${workDirs.length} ${result.ok ? "done" : "failed"} ${baseName} ${result.elapsedMs}ms\n`);
      return result;
    } finally {
      activeJobs.delete(baseName);
    }
  });
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  const report = aggregateComponentStrategyReports({
    workRoot,
    outRoot,
    concurrency,
    requestedConcurrency: args.concurrency || null,
    reportDir,
    batchAfterWorkers,
    sharedInventory: sharedInventory.report,
    results
  });

  if (batchAfterWorkers) {
    runDeferredPptxBatch({ report, args, workDirCount: workDirs.length });
  }

  report.totals = summarizePipelineTotals(report.results);
  const reportFile = path.join(outRoot, "component-strategy-rebuild-parallel-report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...report.totals, reportFile }, null, 2)}\n`);
  if (report.totals.failed > 0) process.exitCode = 1;
}

function runComponentStrategyWorker({ argv, baseName, reportFile, batchAfterWorkers, preparedWorkerArgv = false }) {
  return new Promise((resolve) => {
    const workerArgs = [
      path.join(__dirname, "component-strategy-rebuild.js"),
      ...(preparedWorkerArgv ? argv : componentStrategyWorkerArgv(argv, { batchAfterWorkers })),
      "--only",
      baseName,
      "--report-file",
      reportFile
    ];
    const child = spawn(process.execPath, workerArgs, {
      cwd: path.resolve(__dirname, "..", "..", ".."),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        baseName,
        reportFile,
        error: summarizeWorkerFailure(error.message, stderr, stdout)
      });
    });
    child.on("close", (code) => {
      const workerReport = readWorkerReport(reportFile);
      resolve({
        ok: code === 0 && workerReport?.totals?.failed === 0,
        baseName,
        reportFile,
        exitCode: code,
        report: workerReport,
        error: code === 0 ? null : summarizeWorkerFailure(`worker exited with ${code}`, stderr, stdout)
      });
    });
  });
}

function componentStrategyWorkerArgv(argv, { batchAfterWorkers = false } = {}) {
  const result = [];
  let hasSkipPptx = false;
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--concurrency" || item === "--only" || item === "--heartbeat-ms") {
      if (argv[index + 1] && !argv[index + 1].startsWith("--")) index += 1;
      continue;
    }
    if (item === "--report-file") {
      if (argv[index + 1] && !argv[index + 1].startsWith("--")) index += 1;
      continue;
    }
    if (item === "--skip-pptx") hasSkipPptx = true;
    result.push(item);
  }
  if (batchAfterWorkers && !hasSkipPptx) result.push("--skip-pptx");
  return result;
}

function aggregateComponentStrategyReports({ workRoot, outRoot, concurrency, requestedConcurrency = null, reportDir, batchAfterWorkers, sharedInventory = null, results }) {
  const flattened = [];
  for (const result of results) {
    const report = result.report;
    if (!result.ok || !report) {
      flattened.push({
        inputWorkDir: result.baseName ? path.join(workRoot, `${result.baseName}.work`) : null,
        status: "failed",
        elapsedMs: result.elapsedMs,
        error: result.error
      });
      continue;
    }
    flattened.push(...(Array.isArray(report.results) ? report.results : []).map((item) => ({
      ...item,
      elapsedMs: result.elapsedMs,
      workerReportFile: result.reportFile
    })));
  }
  return {
    provider: "component-strategy-rebuild-parallel-v1",
    workRoot,
    outRoot,
    concurrency,
    requestedConcurrency,
    concurrencyPolicy: "resource-aware-v1",
    reportDir,
    batchAfterWorkers,
    ...(sharedInventory ? { sharedInventory } : {}),
    generatedAt: new Date().toISOString(),
    totals: summarizePipelineTotals(flattened),
    results: flattened
  };
}

function runDeferredPptxBatch({ report, args, workDirCount }) {
  const jobs = report.results
    .filter((item) => item.status === "ir-built" && item.outputIr)
    .map((item) => ({
      result: item,
      job: {
        irFile: item.outputIr,
        outFile: item.outputPptx || inferNativeEditablePptxPath(item.outputIr),
        baseName: path.basename(item.outputIr, ".native.ir.json")
      }
    }))
    .filter((item) => item.job.outFile);
  if (jobs.length === 0) return;
  try {
    const options = componentStrategyPptxBuildOptions(toComponentStrategyArgs(args), { workDirCount });
    buildPptxBatch(jobs.map((item) => item.job), options);
    for (const { result, job } of jobs) {
      if (result.status === "ir-built") result.status = "converted";
      result.outputPptx = job.outFile;
    }
    report.pptxBuild = {
      engine: options.pptxEngine,
      batch: true,
      selection: options.selection,
      jobs: jobs.length
    };
  } catch (error) {
    for (const result of report.results) {
      if (result.status === "ir-built") {
        result.status = "failed";
        result.error = summarizeWorkerFailure(error.message, "", "");
      }
    }
  }
}

function inferNativeEditablePptxPath(irFile) {
  const value = String(irFile || "");
  if (value.endsWith(".native.ir.json")) {
    return `${value.slice(0, -".native.ir.json".length)}.native-editable.pptx`;
  }
  if (value.endsWith(".ir.json")) {
    return `${value.slice(0, -".ir.json".length)}.native-editable.pptx`;
  }
  return "";
}

function toComponentStrategyArgs(args = {}) {
  return {
    python: args.python || "",
    pptxEngine: args["pptx-engine"] || args.pptxEngine || "openxml",
    openXmlBatch: true,
    openXmlBuilderExe: args["openxml-builder-exe"] || "",
    openXmlBuilderConfiguration: args["openxml-builder-configuration"] || "",
    openXmlBuilderTargetFramework: args["openxml-builder-target-framework"] || "",
    openXmlBuildConcurrency: args["openxml-build-concurrency"] || "",
  };
}

function shouldBatchPptxAfterWorkers(args = {}) {
  if (isTruthy(args["skip-pptx"]) || isTruthy(args.skipPptx)) return false;
  if (isTruthy(args.quality)) return false;
  return true;
}

function recommendComponentStrategyConcurrency({ workDirCount = 1, cpuCount, totalMemoryBytes } = {}) {
  if (Number(workDirCount) <= 1) return 1;
  return recommendResourceAwareConcurrency({
    workload: "native-rebuild",
    cpuCount,
    totalMemoryBytes
  });
}

function readWorkerReport(reportFile) {
  if (!fs.existsSync(reportFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(reportFile, "utf8"));
  } catch {
    return null;
  }
}

function summarizeWorkerFailure(message, stderr, stdout) {
  return {
    message: String(message || "worker failed").slice(0, 1000),
    stderr: String(stderr || "").slice(-2000),
    stdout: String(stdout || "").slice(-2000)
  };
}

function safeFileStem(value) {
  return String(value || "deck").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 160) || "deck";
}

function isTruthy(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function usage() {
  return [
    "Usage: node component-strategy-rebuild-parallel.js [options]",
    "  --work-root <dir>       Input .work directory root",
    "  --out <dir>             Output directory",
    "  --only <deck>           Process one deck",
    "  --concurrency <n>       Concurrent deck workers",
    "  --skip-pptx             Build IR only",
    "  --heartbeat-ms <ms>     Progress heartbeat interval",
    "  --help, -h              Show help without starting workers"
  ].join("\n");
}

function writeHeartbeat(activeJobs, heartbeatMs) {
  if (!activeJobs || activeJobs.size === 0) return;
  const now = Date.now();
  const active = Array.from(activeJobs.entries()).map(([baseName, job]) => {
    const elapsedSeconds = Math.max(0, Math.round((now - job.startedAt) / 1000));
    return `${job.index + 1}/${job.total} ${baseName} ${elapsedSeconds}s`;
  });
  process.stderr.write(`[component-strategy-parallel] heartbeat ${activeJobs.size} active every ${heartbeatMs}ms: ${active.join(" | ")}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  aggregateComponentStrategyReports,
  componentStrategyWorkerArgv,
  recommendComponentStrategyConcurrency,
  inferNativeEditablePptxPath,
  parsePositiveInt,
  safeFileStem,
  shouldBatchPptxAfterWorkers,
  summarizeWorkerFailure,
  toComponentStrategyArgs,
  usage,
  writeHeartbeat
};
