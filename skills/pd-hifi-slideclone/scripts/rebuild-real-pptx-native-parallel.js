#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { listWorkDirs } = require("./rebuild-real-pptx-native");
const { parseConcurrency, recommendResourceAwareConcurrency, runLimited } = require("./real-pptx-editable-batch");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workRoot = path.resolve(args["work-root"] || "ppt文档/可编辑版本");
  const outRoot = path.resolve(args.out || "ppt文档/真可编辑版本");
  const only = args.only || null;
  const reportDir = path.join(outRoot, ".parallel-native-reports");
  fs.mkdirSync(reportDir, { recursive: true });

  const workDirs = listWorkDirs(workRoot, only);
  const defaultConcurrency = recommendNativeRebuildConcurrency({ workDirCount: workDirs.length });
  const concurrency = parseConcurrency(args.concurrency, defaultConcurrency);
  const jobs = workDirs.map((workDir, index) => ({ workDir, index }));
  const results = await runLimited(jobs, concurrency, async ({ workDir, index }) => {
    const baseName = path.basename(workDir, ".work");
    process.stderr.write(`[native-parallel] ${index + 1}/${workDirs.length} start ${baseName}\n`);
    const startedAt = Date.now();
    const reportFile = path.join(reportDir, `${safeFileStem(baseName)}.json`);
    const result = await runNativeRebuildWorker({
      argv: process.argv.slice(2),
      baseName,
      reportFile
    });
    result.elapsedMs = Date.now() - startedAt;
    process.stderr.write(`[native-parallel] ${index + 1}/${workDirs.length} ${result.ok ? "done" : "failed"} ${baseName} ${result.elapsedMs}ms\n`);
    return result;
  });

  const report = aggregateReports({ workRoot, outRoot, concurrency, requestedConcurrency: args.concurrency || null, reportDir, results });
  const reportFile = path.join(outRoot, "native-rebuild-parallel-report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...report.totals, reportFile }, null, 2)}\n`);
  if (report.totals.failed > 0) process.exitCode = 1;
}

function runNativeRebuildWorker({ argv, baseName, reportFile }) {
  return new Promise((resolve) => {
    const workerArgs = [
      path.join(__dirname, "rebuild-real-pptx-native.js"),
      ...workerArgv(argv),
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

function workerArgv(argv) {
  const result = [];
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--concurrency" || item === "--only" || item === "--report-file") {
      if (argv[index + 1] && !argv[index + 1].startsWith("--")) index += 1;
      continue;
    }
    result.push(item);
  }
  return result;
}

function aggregateReports({ workRoot, outRoot, concurrency, requestedConcurrency = null, reportDir, results }) {
  const totals = { files: 0, pages: 0, images: 0, shapes: 0, textBoxes: 0, failed: 0 };
  const flattened = [];
  for (const result of results) {
    const report = result.report;
    if (!result.ok || !report) {
      totals.failed += 1;
      flattened.push({
        baseName: result.baseName,
        status: "failed",
        elapsedMs: result.elapsedMs,
        error: result.error
      });
      continue;
    }
    totals.files += Number(report.totals?.files || 0);
    totals.pages += Number(report.totals?.pages || 0);
    totals.images += Number(report.totals?.images || 0);
    totals.shapes += Number(report.totals?.shapes || 0);
    totals.textBoxes += Number(report.totals?.textBoxes || 0);
    totals.failed += Number(report.totals?.failed || 0);
    flattened.push(...(Array.isArray(report.results) ? report.results : []).map((item) => ({
      ...item,
      elapsedMs: result.elapsedMs,
      workerReportFile: result.reportFile
    })));
  }
  return {
    provider: "rebuild-real-pptx-native-parallel",
    workRoot,
    outRoot,
    concurrency,
    requestedConcurrency,
    concurrencyPolicy: "resource-aware-v1",
    reportDir,
    generatedAt: new Date().toISOString(),
    totals,
    results: flattened
  };
}

function readWorkerReport(reportFile) {
  if (!fs.existsSync(reportFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(reportFile, "utf8"));
  } catch {
    return null;
  }
}

function recommendNativeRebuildConcurrency({ workDirCount = 1, cpuCount, totalMemoryBytes } = {}) {
  if (Number(workDirCount) <= 1) return 1;
  return recommendResourceAwareConcurrency({
    workload: "native-rebuild",
    cpuCount,
    totalMemoryBytes
  });
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

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  aggregateReports,
  recommendNativeRebuildConcurrency,
  safeFileStem,
  summarizeWorkerFailure,
  workerArgv
};
