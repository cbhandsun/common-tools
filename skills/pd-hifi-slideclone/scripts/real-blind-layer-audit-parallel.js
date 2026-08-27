#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  const irFiles = discoverIrFiles(args);
  if (irFiles.length === 0) throw new Error("No native IR files were selected");
  const startedAt = process.hrtime.bigint();
  const output = path.resolve(args.out || path.join("runs", "real-blind-layer-audit-parallel", "report.json"));
  const workerDir = path.join(path.dirname(output), ".workers");
  fs.mkdirSync(workerDir, { recursive: true });

  const results = await runLimited(irFiles, args.concurrency, async (irFile, index) => {
    const workerReport = path.join(workerDir, `${String(index + 1).padStart(3, "0")}-${safeStem(path.basename(irFile))}.json`);
    process.stderr.write(`[blind-audit] ${index + 1}/${irFiles.length} start ${path.basename(irFile)}\n`);
    const result = await runWorker({ irFile, workerReport, canvasScale: args.canvasScale });
    process.stderr.write(`[blind-audit] ${index + 1}/${irFiles.length} done ${path.basename(irFile)} ${result.durationMs}ms\n`);
    return result;
  });
  const reports = results.flatMap((result) => result.report?.reports || []);
  const workerFailures = results.filter((result) => !result.report).map((result) => ({
    irFile: result.irFile,
    exitCode: result.exitCode,
    error: result.error
  }));
  const report = {
    provider: "real-blind-layer-audit-parallel-v1",
    fileCount: reports.length,
    selectedFileCount: irFiles.length,
    concurrency: args.concurrency,
    layerCount: sum(reports, "layerCount"),
    protectedMinimumUnitCount: sum(reports, "protectedMinimumUnitCount"),
    issueCount: sum(reports, "issueCount"),
    workerFailureCount: workerFailures.length,
    durationMs: elapsedMs(startedAt),
    passed: workerFailures.length === 0 && reports.every((item) => item.passed),
    workerFailures,
    reports
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    fileCount: report.fileCount,
    layerCount: report.layerCount,
    protectedMinimumUnitCount: report.protectedMinimumUnitCount,
    issueCount: report.issueCount,
    workerFailureCount: report.workerFailureCount,
    concurrency: report.concurrency,
    durationMs: report.durationMs,
    passed: report.passed,
    reportFile: output
  }, null, 2)}\n`);
  return report.passed ? 0 : 1;
}

function discoverIrFiles(args = {}) {
  const files = [];
  for (const value of args.ir || []) files.push(validateIrFile(path.resolve(value)));
  for (const value of args.irDir || []) {
    const directory = path.resolve(value);
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) throw new Error(`IR directory does not exist: ${directory}`);
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".native.ir.json"))
      .map((entry) => validateIrFile(path.join(directory, entry.name)))
      .sort((left, right) => left.localeCompare(right));
    files.push(...entries);
  }
  const unique = [...new Set(files)];
  const maxFiles = args.maxFiles === undefined ? 64 : Number(args.maxFiles);
  if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 256) throw new Error("--max-files must be an integer from 1 to 256");
  if (unique.length > maxFiles) throw new Error(`Selected IR file count exceeds --max-files: ${unique.length}`);
  return unique;
}

function validateIrFile(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`IR file does not exist: ${file}`);
  if (!file.endsWith(".ir.json")) throw new Error(`IR file must end with .ir.json: ${file}`);
  return file;
}

function runWorker({ irFile, workerReport, canvasScale }) {
  return new Promise((resolve) => {
    const startedAt = process.hrtime.bigint();
    const child = spawn(process.execPath, [
      path.join(__dirname, "real-blind-layer-audit.js"),
      "--ir", irFile,
      "--out", workerReport,
      "--canvas-scale", String(canvasScale)
    ], { cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000); });
    child.on("error", (error) => resolve({ irFile, report: null, exitCode: null, durationMs: elapsedMs(startedAt), error: error.message }));
    child.on("close", (exitCode) => {
      let report = null;
      try {
        if (fs.existsSync(workerReport)) report = JSON.parse(fs.readFileSync(workerReport, "utf8"));
      } catch (error) {
        stderr = `${stderr}\n${error.message}`.trim();
      }
      resolve({ irFile, report, exitCode, durationMs: elapsedMs(startedAt), error: report ? null : stderr || `worker exited with ${exitCode}` });
    });
  });
}

async function runLimited(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function parseArgs(argv = []) {
  const result = { ir: [], irDir: [], out: null, concurrency: 4, maxFiles: 64, canvasScale: "auto", help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") result.help = true;
    else if (flag === "--ir") result.ir.push(requireValue(argv, ++index, flag));
    else if (flag === "--ir-dir") result.irDir.push(requireValue(argv, ++index, flag));
    else if (flag === "--out") result.out = requireValue(argv, ++index, flag);
    else if (flag === "--concurrency") result.concurrency = boundedInteger(requireValue(argv, ++index, flag), flag, 1, 16);
    else if (flag === "--max-files") result.maxFiles = boundedInteger(requireValue(argv, ++index, flag), flag, 1, 256);
    else if (flag === "--canvas-scale") result.canvasScale = parseCanvasScale(requireValue(argv, ++index, flag));
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return result;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function boundedInteger(value, flag, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${flag} must be an integer from ${min} to ${max}`);
  return number;
}

function parseCanvasScale(value) {
  if (value === "auto") return value;
  return boundedInteger(value, "--canvas-scale", 1, 4);
}

function safeStem(value) {
  return String(value || "ir").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 160) || "ir";
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item?.[key] || 0), 0);
}

function elapsedMs(startedAt) {
  return Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
}

function usage() {
  return "Usage: node real-blind-layer-audit-parallel.js (--ir <file> | --ir-dir <dir>) [--concurrency 4] [--out report.json]";
}

if (require.main === module) {
  main().then((exitCode) => { process.exitCode = exitCode; }).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 2;
  });
}

module.exports = { discoverIrFiles, main, parseArgs, runLimited, safeStem };
