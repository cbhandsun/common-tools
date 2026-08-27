#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const {
  buildPptxBatch,
  listWorkDirs,
  parsePageSelection,
  shouldIncludePage
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
  const workRoot = path.resolve(args["work-root"] || args.workRoot || path.join("ppt文档", "可编辑版本"));
  const outRoot = path.resolve(args.out || path.join("ppt文档", "组件策略插件增强版本-page-shards"));
  const only = args.only || "";
  const workDirs = listWorkDirs(workRoot, only);
  if (workDirs.length !== 1) {
    throw new Error(`Page-shard rebuild expects exactly one deck. Pass --only <deck>; matched ${workDirs.length}.`);
  }

  fs.mkdirSync(outRoot, { recursive: true });
  const workDir = workDirs[0];
  const baseName = path.basename(workDir, ".work");
  const sourceIrFile = path.join(workDir, "ir", "deck.json");
  const sourceIr = readJson(sourceIrFile);
  const selectedPages = selectedPageNumbers(sourceIr, args.pages || args.page || args["only-pages"]);
  if (selectedPages.length === 0) throw new Error(`No pages selected for ${baseName}.`);

  const pageShardSize = parsePositiveInt(args["page-shard-size"] || args.pageShardSize, 1);
  const shards = chunk(selectedPages, pageShardSize);
  const defaultConcurrency = recommendPageShardConcurrency({ shardCount: shards.length });
  const concurrency = parseConcurrency(args.concurrency, defaultConcurrency);
  const sharedInventory = prepareSharedComponentInventory({
    argv: process.argv.slice(2),
    outRoot,
    workerArgv
  });
  const heartbeatMs = parsePositiveInt(args["heartbeat-ms"] || args.heartbeatMs, 15000);
  const activeJobs = new Map();
  const heartbeatTimer = heartbeatMs > 0
    ? setInterval(() => writeHeartbeat(activeJobs), heartbeatMs)
    : null;

  const shardRoot = path.join(outRoot, ".page-shards", safeFileStem(baseName));
  fs.mkdirSync(shardRoot, { recursive: true });
  const jobs = shards.map((pages, index) => ({ pages, index }));
  const results = await runLimited(jobs, concurrency, async ({ pages, index }) => {
    const shardName = pageRangeName(pages);
    const shardOut = path.join(shardRoot, shardName);
    const reportFile = path.join(shardOut, "component-strategy-rebuild-report.json");
    fs.mkdirSync(shardOut, { recursive: true });
    const startedAt = Date.now();
    activeJobs.set(shardName, { index, total: shards.length, startedAt, pages });
    process.stderr.write(`[page-shards] ${index + 1}/${shards.length} start ${baseName} pages ${pages.join(",")}\n`);
    try {
      const result = await runShardWorker({
        argv: sharedInventory.argv,
        baseName,
        pages,
        shardOut,
        reportFile,
        preparedWorkerArgv: true
      });
      result.elapsedMs = Date.now() - startedAt;
      process.stderr.write(`[page-shards] ${index + 1}/${shards.length} ${result.ok ? "done" : "failed"} ${baseName} pages ${pages.join(",")} ${result.elapsedMs}ms\n`);
      return result;
    } finally {
      activeJobs.delete(shardName);
    }
  });
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  const failed = results.filter((item) => item.ok !== true);
  const finalIrFile = path.join(outRoot, `${baseName}.native.ir.json`);
  const finalPptxFile = path.join(outRoot, `${baseName}.native-editable.pptx`);
  let mergedDeck = null;
  if (failed.length === 0) {
    mergedDeck = mergeShardDecks({
      baseName,
      sourceIr,
      outRoot,
      results
    });
    fs.writeFileSync(finalIrFile, `${JSON.stringify(mergedDeck, null, 2)}\n`, "utf8");
    if (!isTruthy(args["skip-pptx"]) && !isTruthy(args.skipPptx)) {
      const buildOptions = componentStrategyPptxBuildOptions(toComponentStrategyArgs(args), { workDirCount: 1 });
      buildPptxBatch([{ irFile: finalIrFile, outFile: finalPptxFile, baseName }], buildOptions);
    }
  }

  const flattened = results.map((item) => ({
    baseName,
    pages: item.pages,
    shardOut: item.shardOut,
    outputIr: item.outputIr,
    reportFile: item.reportFile,
    status: item.ok ? "converted" : "failed",
    elapsedMs: item.elapsedMs,
    error: item.error || null
  }));
  const report = {
    provider: "component-strategy-rebuild-page-shards-v1",
    workRoot,
    outRoot,
    baseName,
    concurrency,
    requestedConcurrency: args.concurrency || null,
    pageShardSize,
    selectedPages,
    generatedAt: new Date().toISOString(),
    sharedInventory: sharedInventory.report,
    outputIr: failed.length === 0 ? finalIrFile : null,
    outputPptx: failed.length === 0 && !isTruthy(args["skip-pptx"]) && !isTruthy(args.skipPptx) ? finalPptxFile : null,
    totals: {
      files: failed.length === 0 ? 1 : 0,
      pages: mergedDeck ? mergedDeck.pages.length : 0,
      images: mergedDeck ? mergedDeck.pages.reduce((sum, page) => sum + (page.images || []).length, 0) : 0,
      shapes: mergedDeck ? mergedDeck.pages.reduce((sum, page) => sum + (page.shapes || []).length, 0) : 0,
      textBoxes: mergedDeck ? mergedDeck.pages.reduce((sum, page) => sum + (page.textBoxes || []).length, 0) : 0,
      failed: failed.length
    },
    shardTotals: summarizePipelineTotals(results.map((item) => item.workerResult).filter(Boolean)),
    results: flattened
  };
  const reportFile = path.join(outRoot, `${baseName}.page-shards-report.json`);
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...report.totals, reportFile, outputIr: report.outputIr, outputPptx: report.outputPptx }, null, 2)}\n`);
  if (failed.length > 0) process.exitCode = 1;
}

function runShardWorker({ argv, baseName, pages, shardOut, reportFile, preparedWorkerArgv = false }) {
  return new Promise((resolve) => {
    const workerArgs = [
      path.join(__dirname, "component-strategy-rebuild.js"),
      ...(preparedWorkerArgv ? argv : workerArgv(argv)),
      "--only", baseName,
      "--pages", pages.join(","),
      "--out", shardOut,
      "--skip-pptx",
      "--report-file", reportFile
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
        pages,
        shardOut,
        reportFile,
        error: summarizeWorkerFailure(error.message, stderr, stdout)
      });
    });
    child.on("close", (code) => {
      const workerReport = readJsonIfExists(reportFile);
      const workerResult = Array.isArray(workerReport?.results) ? workerReport.results[0] : null;
      resolve({
        ok: code === 0 && workerReport?.totals?.failed === 0 && !!workerResult?.outputIr,
        pages,
        shardOut,
        reportFile,
        outputIr: workerResult?.outputIr || null,
        workerResult,
        exitCode: code,
        error: code === 0 ? null : summarizeWorkerFailure(`worker exited with ${code}`, stderr, stdout)
      });
    });
  });
}

function workerArgv(argv) {
  const result = [];
  const skipWithValue = new Set([
    "--concurrency",
    "--only",
    "--out",
    "--pages",
    "--page",
    "--only-pages",
    "--report-file",
    "--heartbeat-ms",
    "--page-shard-size"
  ]);
  const skipFlag = new Set(["--skip-pptx"]);
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (skipWithValue.has(item)) {
      if (argv[index + 1] && !argv[index + 1].startsWith("--")) index += 1;
      continue;
    }
    if (skipFlag.has(item)) continue;
    result.push(item);
  }
  return result;
}

function mergeShardDecks({ baseName, sourceIr, outRoot, results }) {
  const pagesByNumber = new Map();
  for (const result of results) {
    if (!result.outputIr) throw new Error(`Shard missing output IR for pages ${result.pages.join(",")}`);
    const deck = readJson(result.outputIr);
    const shardPages = Array.isArray(deck.pages) ? deck.pages : [];
    if (shardPages.length !== result.pages.length) {
      throw new Error(`Shard page count mismatch for pages ${result.pages.join(",")}: expected ${result.pages.length}, got ${shardPages.length}`);
    }
    copyShardAssets({
      baseName,
      fromOutRoot: result.shardOut,
      toOutRoot: outRoot
    });
    for (let index = 0; index < result.pages.length; index += 1) {
      pagesByNumber.set(result.pages[index], shardPages[index]);
    }
  }
  const pageNumbers = [...pagesByNumber.keys()].sort((a, b) => a - b);
  return {
    ...(sourceIr || {}),
    meta: {
      ...(sourceIr?.meta || {}),
      rebuildStrategy: "component-strategy-page-shards",
      pageShardMergedAt: new Date().toISOString()
    },
    pages: pageNumbers.map((pageNumber) => pagesByNumber.get(pageNumber))
  };
}

function copyShardAssets({ baseName, fromOutRoot, toOutRoot }) {
  const assetDirName = `${baseName}.assets`;
  const fromDir = path.join(fromOutRoot, assetDirName);
  if (!fs.existsSync(fromDir)) return;
  const toDir = path.join(toOutRoot, assetDirName);
  fs.mkdirSync(toDir, { recursive: true });
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    fs.copyFileSync(path.join(fromDir, entry.name), path.join(toDir, entry.name));
  }
}

function selectedPageNumbers(sourceIr, pagesValue) {
  const pages = Array.isArray(sourceIr?.pages) ? sourceIr.pages : [];
  const selection = parsePageSelection(pagesValue);
  const result = [];
  for (let index = 0; index < pages.length; index += 1) {
    if (shouldIncludePage(selection, pages[index], index)) result.push(index + 1);
  }
  return result;
}

function chunk(items, size) {
  const result = [];
  const chunkSize = Math.max(1, Number(size) || 1);
  for (let index = 0; index < items.length; index += chunkSize) {
    result.push(items.slice(index, index + chunkSize));
  }
  return result;
}

function pageRangeName(pages) {
  if (!Array.isArray(pages) || pages.length === 0) return "pages-none";
  if (pages.length === 1) return `p${String(pages[0]).padStart(3, "0")}`;
  return `p${String(pages[0]).padStart(3, "0")}-p${String(pages[pages.length - 1]).padStart(3, "0")}`;
}

function recommendPageShardConcurrency({ shardCount = 1, cpuCount, totalMemoryBytes } = {}) {
  if (Number(shardCount) <= 1) return 1;
  return Math.min(4, recommendResourceAwareConcurrency({
    workload: "native-rebuild",
    cpuCount,
    totalMemoryBytes
  }));
}

function writeHeartbeat(activeJobs) {
  const now = Date.now();
  const jobs = [...activeJobs.entries()]
    .map(([name, item]) => `${item.index + 1}/${item.total} ${name} ${Math.round((now - item.startedAt) / 1000)}s`)
    .join("; ");
  process.stderr.write(`[page-shards] active ${activeJobs.size}${jobs ? `: ${jobs}` : ""}\n`);
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
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

function safeFileStem(value) {
  return String(value || "deck").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 160) || "deck";
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return readJson(file);
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

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  chunk,
  mergeShardDecks,
  pageRangeName,
  selectedPageNumbers,
  workerArgv
};
