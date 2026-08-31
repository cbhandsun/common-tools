#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { summarizeTotals } = require("./golden-set-runner");
const { runCorpusCases } = require("./lib/paddleocr-corpus-session");
const { resolveCorpusCases, summarizeCorpusCoverage } = require("./lib/real-pptx-corpus");

const skillRoot = path.resolve(__dirname, "..");
const defaultCorpus = path.join(skillRoot, "examples", "real-pptx-corpus.manifest.json");
const defaultGolden = path.join(skillRoot, "examples", "golden-set.manifest.json");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === true) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const corpusFile = path.resolve(args.manifest || defaultCorpus);
  const goldenFile = path.resolve(args["golden-manifest"] || defaultGolden);
  const corpusManifest = readJson(corpusFile);
  const goldenManifest = readJson(goldenFile);
  const selected = resolveCorpusCases(corpusManifest, goldenManifest, {
    caseIds: parseCsv(args.case),
    categories: parseCsv(args.category),
    suites: parseCsv(args.suite),
    manifestSuites: corpusManifest.suites || {},
    requireCoverage: !args.case && !args.category && !args.suite
  });
  const outputDir = path.resolve(args.out || path.join("runs", "real-pptx-corpus"));
  fs.mkdirSync(outputDir, { recursive: true });
  const executionCases = applyFreshExecution(selected.cases, truthy(args.fresh));
  const { results, ocrSession } = await runCorpusCases(executionCases, {
    sharedOcr: args["paddle-ocr-broker"],
    timeoutMs: positiveInteger(args["case-timeout-ms"], 180000),
    concurrency: resolveCorpusConcurrency(args.concurrency, args["allow-parallel-office"]),
    onStart: ({ index, total, entry }) => process.stderr.write(`[real-pptx-corpus] ${index + 1}/${total} start ${entry.id}\n`),
    onDone: ({ index, total, entry, result }) => process.stderr.write(`[real-pptx-corpus] ${index + 1}/${total} ${result.passed === true ? "passed" : "failed"} ${entry.id}\n`)
  });
  const selectedCategories = [...new Set(selected.cases.map((entry) => entry.corpusCategory))];
  const coverage = summarizeCorpusCoverage(results.map((result, index) => ({
    ...result,
    corpusCategory: selected.cases[index].corpusCategory,
    sourceDeck: selected.cases[index].sourceDeck
  })), selectedCategories);
  const totals = summarizeTotals(results);
  const reportCases = results.map((result, index) => ({
    ...result,
    metrics: { ...readTrendMetrics(result.reportFile, result.metrics), elapsedMs: result.elapsedMs },
    corpusCategory: selected.cases[index].corpusCategory,
    goldenCaseId: selected.cases[index].goldenCaseId,
    sourceDeck: selected.cases[index].sourceDeck,
    sourcePage: selected.cases[index].sourcePage
  }));
  const performance = summarizeCorpusPerformance(reportCases);
  const report = {
    provider: "real-pptx-corpus-runner",
    corpusId: selected.id,
    corpusFile,
    goldenFile,
    generatedAt: new Date().toISOString(),
    passed: totals.failingCases === 0 && coverage.passed,
    totals,
    performance,
    coverage,
    cases: reportCases,
    ocrSession
  };
  const reportFile = path.join(outputDir, "real-pptx-corpus.report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ passed: report.passed, reportFile, totals, coverage }, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) throw new Error(`Unexpected positional argument: ${item}`);
    const key = item.slice(2);
    if (key === "help") { args.help = true; continue; }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    args[key] = next;
    index += 1;
  }
  return args;
}

function parseCsv(value) {
  return value ? [...new Set(String(value).split(",").map((item) => item.trim()).filter(Boolean))] : [];
}

function positiveInteger(value, fallback) {
  if (value == null) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 10000000) throw new TypeError("numeric option is outside the supported range");
  return number;
}

function resolveCorpusConcurrency(value, allowParallelOffice) {
  const requested = positiveInteger(value, 1);
  return truthy(allowParallelOffice) ? Math.min(requested, 8) : 1;
}

function applyFreshExecution(cases, enabled) {
  if (!Array.isArray(cases) || cases.length > 512) throw new TypeError("corpus cases must be a bounded array");
  if (!enabled) return cases;
  return cases.map((entry) => {
    if (!entry || !Array.isArray(entry.command) || entry.command.length < 2 || entry.command.length > 128) {
      throw new TypeError("corpus case command is invalid");
    }
    const command = [...entry.command];
    const script = String(command[1] || "").replace(/\\/gu, "/");
    if (script.endsWith("/complex-graphic-golden-smoke.js") && !command.includes("--force")) command.push("--force");
    return Object.freeze({ ...entry, command: Object.freeze(command) });
  });
}

function truthy(value) { return value === true || String(value || "").toLowerCase() === "true"; }

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
}

function readTrendMetrics(reportFile, fallback = {}) {
  let report = null;
  try { if (reportFile) report = readJson(path.resolve(reportFile)); } catch { report = null; }
  const chartPages = Array.isArray(report?.pages) ? report.pages : [];
  const chartPixelDiffRatio = maximumMetric(chartPages, "pixelDiffRatio");
  const chartForegroundMissingRatio = maximumMetric(chartPages, "foregroundMissingRatio");
  const nativeShapeCount = nonNegativeNumber(report?.nativeShapeCount);
  const pictureCount = nonNegativeNumber(report?.pictureCount);
  const chartEditableObjectRatio = nativeShapeCount !== null && pictureCount !== null
    ? ratio(nativeShapeCount, nativeShapeCount + pictureCount)
    : null;
  return {
    pixelDiffRatio: numberOrNull(report?.deckMetrics?.pixelDiffRatio ?? chartPixelDiffRatio ?? fallback?.pixelDiffRatio),
    foregroundMissingRatio: numberOrNull(report?.deckMetrics?.foregroundMissingRatio ?? chartForegroundMissingRatio ?? fallback?.foregroundMissingRatio),
    editableObjectRatio: numberOrNull(report?.editabilityProfile?.editableObjectRatio ?? chartEditableObjectRatio ?? fallback?.editableObjectRatio),
    largestResidualAreaRatio: numberOrNull(
      report?.layerProfile?.totals?.largestUnexplainedCropAreaRatio
      ?? report?.reconstructionBudget?.maxLargestResidualAreaRatio
      ?? (pictureCount === 0 ? 0 : null)
      ?? fallback?.largestResidualAreaRatio
    )
  };
}

function summarizeCorpusPerformance(cases = []) {
  if (!Array.isArray(cases) || cases.length > 10000) throw new TypeError("corpus performance cases must be a bounded array");
  const elapsed = cases
    .map((item) => Number(item?.elapsedMs))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const totalElapsedMs = elapsed.reduce((sum, value) => sum + value, 0);
  const percentile = (ratio) => elapsed.length
    ? elapsed[Math.min(elapsed.length - 1, Math.ceil(elapsed.length * ratio) - 1)]
    : null;
  return Object.freeze({
    measuredCases: elapsed.length,
    totalElapsedMs,
    averageElapsedMs: elapsed.length ? Math.round(totalElapsedMs / elapsed.length) : null,
    p50ElapsedMs: percentile(0.5),
    p95ElapsedMs: percentile(0.95),
    maxElapsedMs: elapsed.length ? elapsed.at(-1) : null
  });
}

function maximumMetric(items, key) {
  const values = items.map((item) => numberOrNull(item?.[key])).filter((value) => value !== null);
  return values.length ? Math.max(...values) : null;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : numerator / denominator;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
}

function usage() {
  return [
    "Usage: node real-pptx-corpus-runner.js [options]",
    "  --manifest <file>        Corpus manifest",
    "  --golden-manifest <file> Golden-set manifest",
    "  --suite <id[,id]>        Named corpus suite",
    "  --category <id[,id]>     Selected categories",
    "  --case <id[,id]>         Selected corpus cases",
    "  --out <dir>              Report directory",
    "  --concurrency <n>        Requested concurrent cases (default 1)",
    "  --allow-parallel-office <true>  Allow concurrency for environments with isolated Office workers",
    "  --case-timeout-ms <ms>   Per-case timeout",
    "  --fresh <true>            Disable supported golden stage reuse",
    "  --paddle-ocr-broker <true|false>  Reuse OCR across serialized supported cases",
    "  --help                   Print help"
  ].join("\n");
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

module.exports = { applyFreshExecution, parseArgs, parseCsv, positiveInteger, readTrendMetrics, resolveCorpusConcurrency, summarizeCorpusPerformance };
