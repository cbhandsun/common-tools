#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { DEFAULT_OCR_ADAPTER, readPaddleOcrConfig } = require("./lib/ocr-provider-config");
const { startPaddleOcrBatchBroker } = require("./lib/paddleocr-batch-broker");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputDir = path.resolve(args.input || "ppt文档/分层可编辑版本");
  const outputDir = path.resolve(args.out || path.join("runs", "quality-gate-ocr-batch"));
  const concurrency = parseConcurrency(args.concurrency, 1);
  const textOcr = parseBooleanFlag(args["text-ocr"], true);
  const cases = discoverCases(inputDir, {
    only: args.only,
    limit: parsePositiveInt(args.limit, 0)
  });
  ensureDir(outputDir);

  if (args["dry-run"] === "true") {
    const report = makeReport({ inputDir, outputDir, cases, results: [], dryRun: true, args, concurrency });
    const reportFile = writeReport(outputDir, report);
    process.stdout.write(`${JSON.stringify({ reportFile, totalCases: cases.length, dryRun: true, concurrency, cases }, null, 2)}\n`);
    return;
  }

  const textOcrAdapter = args["text-ocr-adapter"] || DEFAULT_OCR_ADAPTER;
  const broker = await maybeStartPaddleOcrBroker({ args, textOcr, textOcrAdapter, cases, concurrency });
  let results;
  let brokerMetrics = null;
  try {
    results = await runLimited(cases, concurrency, async (entry, index) => {
      const startedAt = Date.now();
      process.stderr.write(`[ocr-batch] ${index + 1}/${cases.length} start ${entry.id}\n`);
      const result = await runQualityGate(entry, {
      outputDir,
      textOcr,
      minTextCoverage: args["min-text-coverage"] || "0.80",
      textOcrAdapter,
      textOcrMode: args["text-ocr-mode"] || "anchored",
      textOcrPages: args["text-ocr-pages"],
      autoTextOcrMaxPages: args["auto-text-ocr-max-pages"],
      textOcrPadding: args["text-ocr-padding"],
      textOcrMicroBatch: args["text-ocr-micro-batch"],
      textOcrMicroBatchSize: args["text-ocr-micro-batch-size"],
      umiBin: args["umi-bin"],
      umiModels: args["umi-models"],
      umiInitTimeoutMs: args["umi-init-timeout-ms"],
      paddleOcrPython: args["paddle-ocr-python"],
      paddleOcrLang: args["paddle-ocr-lang"],
      paddleOcrVersion: args["paddle-ocr-version"],
      paddleOcrDevice: args["paddle-ocr-device"],
      paddleOcrEngine: args["paddle-ocr-engine"],
      paddleOcrDetectionModel: args["paddle-ocr-detection-model"],
      paddleOcrRecognitionModel: args["paddle-ocr-recognition-model"],
      paddleOcrDetectionModelDir: args["paddle-ocr-detection-model-dir"],
      paddleOcrRecognitionModelDir: args["paddle-ocr-recognition-model-dir"],
      paddleOcrModelCacheDir: args["paddle-ocr-model-cache-dir"],
      paddleOcrHpi: args["paddle-ocr-hpi"],
      paddleOcrTextlineOrientation: args["paddle-ocr-textline-orientation"],
      paddleOcrInitTimeoutMs: args["paddle-ocr-init-timeout-ms"],
      paddleOcrTimeoutMs: args["paddle-ocr-timeout-ms"],
      paddleOcrCache: args["paddle-ocr-cache"],
      paddleOcrCacheDir: args["paddle-ocr-cache-dir"],
      ocrCache: args["ocr-cache"],
      ocrCacheDir: args["ocr-cache-dir"],
      renderDir: args["render-dir"],
      renderRoot: args["render-root"],
      qualityRoot: args["quality-root"],
      renderer: args.renderer || args.render,
      reuseRender: args["reuse-render"],
        timeoutMs: parsePositiveInt(args["case-timeout-ms"], 600_000),
        childEnv: broker?.env
      });
      const elapsedMs = Date.now() - startedAt;
      process.stderr.write(`[ocr-batch] ${index + 1}/${cases.length} done ${entry.id} ${result.ok ? "ok" : "failed"} ${elapsedMs}ms\n`);
      return { ...result, elapsedMs };
    });
  } finally {
    if (broker) brokerMetrics = await broker.close();
  }

  const report = makeReport({ inputDir, outputDir, cases, results, dryRun: false, args, concurrency, brokerMetrics });
  const reportFile = writeReport(outputDir, report);
  process.stdout.write(`${JSON.stringify({
    reportFile,
    concurrency,
    totalCases: report.totals.totalCases,
    passedCases: report.totals.passedCases,
    failedCases: report.totals.failedCases,
    meanTextCoverage: report.totals.meanTextCoverage,
    minTextCoverage: report.totals.minTextCoverage
  }, null, 2)}\n`);
  if (report.totals.failedCases > 0 && args["fail-on-error"] === "true") process.exitCode = 1;
}

function discoverCases(inputDir, options = {}) {
  if (!fs.existsSync(inputDir)) return [];
  const onlySet = new Set(String(options.only || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean));
  const cases = fs.readdirSync(inputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".native-editable.pptx"))
    .map((entry) => {
      const pptxFile = path.join(inputDir, entry.name);
      const id = entry.name.replace(/\.native-editable\.pptx$/, "");
      return {
        id,
        pptxFile,
        irFile: path.join(inputDir, `${id}.native.ir.json`)
      };
    })
    .filter((entry) => fs.existsSync(entry.irFile))
    .filter((entry) => onlySet.size === 0 || onlySet.has(entry.id) || onlySet.has(path.basename(entry.pptxFile)))
    .sort((a, b) => a.id.localeCompare(b.id));
  const limit = parsePositiveInt(options.limit, 0);
  return limit > 0 ? cases.slice(0, limit) : cases;
}

async function runQualityGate(entry, options = {}) {
  const caseOut = path.join(options.outputDir, entry.id);
  const qualityGateScript = path.join(__dirname, "quality-gate-real-pptx.js");
  const reusableRenderDir = resolveReusableRenderDir(entry, options);
  const selectedTextOcrPages = resolveTextOcrPages(entry, options);
  const args = buildQualityGateArgs({
    entry,
    caseOut,
    qualityGateScript,
    reusableRenderDir,
    selectedTextOcrPages,
    options
  });

  const run = await spawnBuffered(process.execPath, args, {
    cwd: process.cwd(),
    windowsHide: true,
    timeout: options.timeoutMs,
    maxBuffer: 96 * 1024 * 1024,
    env: options.childEnv
  });
  if (run.status !== 0) {
    return {
      id: entry.id,
      ok: false,
      command: [process.execPath, ...args],
      timedOut: run.error?.code === "ETIMEDOUT" || run.signal === "SIGTERM",
      error: run.error?.message || run.stderr || run.stdout || `exit ${run.status}`,
      stdout: truncate(run.stdout),
      stderr: truncate(run.stderr)
    };
  }
  const payload = parseLastJsonObject(run.stdout);
  const report = payload.reportFile && fs.existsSync(payload.reportFile)
    ? JSON.parse(fs.readFileSync(payload.reportFile, "utf8"))
    : null;
  return {
    id: entry.id,
    ok: true,
    command: [process.execPath, ...args],
    reportFile: payload.reportFile || null,
    contactSheet: payload.contactSheet || null,
    renderDir: reusableRenderDir || payload.renderDir || report?.render?.renderDir || null,
    selectedTextOcrPages,
    summary: payload.summary || null,
    textCoverage: payload.deckMetrics?.textCoverage ?? report?.deckMetrics?.textCoverage ?? null,
    failedPages: payload.deckMetrics?.failedPages ?? report?.deckMetrics?.failedPages ?? null,
    comparedPages: payload.deckMetrics?.comparedPages ?? report?.deckMetrics?.comparedPages ?? null,
    accepted: payload.summary?.accepted ?? report?.summary?.accepted ?? null,
    needsReview: payload.summary?.needsReview ?? report?.summary?.needsReview ?? null,
    rejected: payload.summary?.rejected ?? report?.summary?.rejected ?? null
  };
}

function buildQualityGateArgs({ entry, caseOut, qualityGateScript, reusableRenderDir, selectedTextOcrPages = null, options = {} }) {
  const textOcr = parseBooleanFlag(options.textOcr, true);
  const args = [
    qualityGateScript,
    "--ir", entry.irFile,
    "--pptx", entry.pptxFile,
    "--out", caseOut,
    "--text-ocr", textOcr ? "true" : "false"
  ];
  if (textOcr) {
    args.push(
      "--text-ocr-adapter", options.textOcrAdapter,
      "--text-ocr-mode", options.textOcrMode,
      "--min-text-coverage", String(options.minTextCoverage)
    );
    if (options.textOcrPadding) args.push("--text-ocr-padding", String(options.textOcrPadding));
    pushOption(args, "--text-ocr-micro-batch", options.textOcrMicroBatch);
    pushOption(args, "--text-ocr-micro-batch-size", options.textOcrMicroBatchSize);
    if (selectedTextOcrPages) args.push("--text-ocr-pages", selectedTextOcrPages);
    else if (options.textOcrPages && String(options.textOcrPages).toLowerCase() !== "auto") {
      args.push("--text-ocr-pages", String(options.textOcrPages));
    }
  }
  if (options.umiBin) args.push("--umi-bin", options.umiBin);
  if (options.umiModels) args.push("--umi-models", options.umiModels);
  if (options.umiInitTimeoutMs) args.push("--umi-init-timeout-ms", String(options.umiInitTimeoutMs));
  pushOption(args, "--paddle-ocr-python", options.paddleOcrPython);
  pushOption(args, "--paddle-ocr-lang", options.paddleOcrLang);
  pushOption(args, "--paddle-ocr-version", options.paddleOcrVersion);
  pushOption(args, "--paddle-ocr-device", options.paddleOcrDevice);
  pushOption(args, "--paddle-ocr-engine", options.paddleOcrEngine);
  pushOption(args, "--paddle-ocr-detection-model", options.paddleOcrDetectionModel);
  pushOption(args, "--paddle-ocr-recognition-model", options.paddleOcrRecognitionModel);
  pushOption(args, "--paddle-ocr-detection-model-dir", options.paddleOcrDetectionModelDir);
  pushOption(args, "--paddle-ocr-recognition-model-dir", options.paddleOcrRecognitionModelDir);
  pushOption(args, "--paddle-ocr-model-cache-dir", options.paddleOcrModelCacheDir);
  pushOption(args, "--paddle-ocr-hpi", options.paddleOcrHpi);
  pushOption(args, "--paddle-ocr-textline-orientation", options.paddleOcrTextlineOrientation);
  pushOption(args, "--paddle-ocr-init-timeout-ms", options.paddleOcrInitTimeoutMs);
  pushOption(args, "--paddle-ocr-timeout-ms", options.paddleOcrTimeoutMs);
  pushOption(args, "--paddle-ocr-cache", options.paddleOcrCache);
  pushOption(args, "--paddle-ocr-cache-dir", options.paddleOcrCacheDir);
  if (options.ocrCache) args.push("--ocr-cache", String(options.ocrCache));
  if (options.ocrCacheDir) args.push("--ocr-cache-dir", String(options.ocrCacheDir));
  if (options.renderer) args.push("--renderer", String(options.renderer));
  if (reusableRenderDir) args.push("--render-dir", reusableRenderDir);
  return args;
}

function resolveTextOcrPages(entry, options = {}) {
  if (String(options.textOcrPages || "").toLowerCase() !== "auto") return null;
  const ir = readJsonOrNull(entry.irFile);
  const pageIndexes = selectRepresentativeOcrPageIndexes(ir, {
    maxPages: parsePositiveInt(options.autoTextOcrMaxPages, 2)
  });
  return pageIndexes.length ? pageIndexes.map((index) => String(index + 1)).join(",") : null;
}

function selectRepresentativeOcrPageIndexes(ir, options = {}) {
  const pages = Array.isArray(ir?.pages) ? ir.pages : [];
  if (!pages.length) return [];
  const maxPages = Math.max(1, options.maxPages || 2);
  const scored = pages.map((page, fallbackIndex) => {
    const pageIndex = Number.isFinite(Number(page.pageIndex)) ? Number(page.pageIndex) : fallbackIndex;
    const textBoxes = Array.isArray(page.textBoxes) ? page.textBoxes : [];
    const shapes = Array.isArray(page.shapes) ? page.shapes : [];
    const images = Array.isArray(page.images) ? page.images : [];
    const tables = Array.isArray(page.tables) ? page.tables : [];
    const charts = Array.isArray(page.charts) ? page.charts : [];
    const textLength = textBoxes.reduce((sum, item) => sum + String(item?.text || "").trim().length, 0);
    const diagramSignals = [
      shapes.length,
      images.length * 1.5,
      tables.length * 2,
      charts.length * 2,
      textBoxes.filter((item) => looksLikeDiagramLabel(item?.text)).length
    ].reduce((sum, value) => sum + value, 0);
    return {
      pageIndex,
      textLength,
      diagramSignals,
      textScore: textLength + textBoxes.length * 8,
      diagramScore: diagramSignals + Math.min(textLength / 40, 20)
    };
  });
  const selected = [];
  addSelectedPage(selected, bestPage(scored, "textScore"));
  addSelectedPage(selected, bestPage(scored, "diagramScore"));
  for (const page of [...scored].sort((a, b) => b.textScore - a.textScore || a.pageIndex - b.pageIndex)) {
    addSelectedPage(selected, page);
    if (selected.length >= maxPages) break;
  }
  return selected.slice(0, maxPages).map((page) => page.pageIndex).sort((a, b) => a - b);
}

function bestPage(scored, field) {
  return [...scored].sort((a, b) => b[field] - a[field] || b.textLength - a.textLength || a.pageIndex - b.pageIndex)[0] || null;
}

function addSelectedPage(selected, page) {
  if (!page || selected.some((item) => item.pageIndex === page.pageIndex)) return;
  selected.push(page);
}

function looksLikeDiagramLabel(text) {
  const value = String(text || "").toLowerCase();
  return /->|→|↓|↑|step|api|prd|wms|input|output|flow|流程|节点|输入|输出|协作|评审|资产|技能|原型|数据/.test(value);
}

function resolveReusableRenderDir(entry, options = {}) {
  if (options.renderDir) {
    const explicitRenderDir = path.resolve(options.renderDir);
    return countRenderedPages(explicitRenderDir) > 0 ? explicitRenderDir : null;
  }
  if (String(options.reuseRender || "").toLowerCase() !== "true") return null;

  const renderRoot = path.resolve(options.renderRoot || path.join("runs", "quality-gate-render-cache"));
  const candidates = unique([
    path.join(renderRoot, entry.id, "render"),
    path.join(renderRoot, shortCacheName(entry.id), "render"),
    ...findRenderDirsFromQualityReports(entry, options),
    ...findRenderDirsByPrefix(renderRoot, entry.id)
  ]);
  return candidates.find((candidate) => countRenderedPages(candidate) > 0) || null;
}

function findRenderDirsFromQualityReports(entry, options = {}) {
  const qualityRoot = path.resolve(options.qualityRoot || path.join("runs", "quality-gate"));
  if (!fs.existsSync(qualityRoot)) return [];
  const expectedPptx = path.resolve(entry.pptxFile || "");
  const expectedPptxName = path.basename(entry.pptxFile || "");
  const result = [];
  for (const reportFile of findQualityReports(qualityRoot)) {
    const report = readJsonOrNull(reportFile);
    if (!report || !reportMatchesEntry(report, entry, expectedPptx, expectedPptxName)) continue;
    const renderDir = report.render?.renderDir;
    if (renderDir) result.push(path.resolve(renderDir));
  }
  return result;
}

function findQualityReports(root) {
  const result = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile() && entry.name === "quality-gate-report.json") result.push(file);
    }
  }
  return result;
}

function reportMatchesEntry(report, entry, expectedPptx, expectedPptxName) {
  const reportPptx = report.pptxFile || report.inputPptx || report.targetPptx || "";
  if (reportPptx && expectedPptx && path.resolve(reportPptx) === expectedPptx) return true;
  if (reportPptx && expectedPptxName && path.basename(reportPptx) === expectedPptxName) return true;
  const reportName = String(report.deck || path.basename(path.dirname(report.reportFile || "")) || "");
  return Boolean(entry.id && reportName.includes(entry.id));
}

function findRenderDirsByPrefix(renderRoot, id) {
  if (!fs.existsSync(renderRoot)) return [];
  const prefixes = unique([id, shortCacheName(id)])
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return fs.readdirSync(renderRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => prefixes.some((prefix) => entry.name.toLowerCase().startsWith(prefix)))
    .map((entry) => path.join(renderRoot, entry.name, "render"));
}

function readJsonOrNull(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function countRenderedPages(renderDir) {
  if (!renderDir || !fs.existsSync(renderDir)) return 0;
  return fs.readdirSync(renderDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^(?:lo-page-\d+|page-\d+)\.png$/i.test(entry.name))
    .length;
}

function shortCacheName(value) {
  const safeName = String(value || "deck")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return safeName || "deck";
}

function unique(values) {
  return [...new Set(values)];
}

function makeReport({ inputDir, outputDir, cases, results, dryRun, args = {}, concurrency = 1, brokerMetrics = null }) {
  return {
    provider: "quality-gate-ocr-batch",
    inputDir,
    outputDir,
    generatedAt: new Date().toISOString(),
    dryRun,
    concurrency,
    paddleOcrBroker: brokerMetrics ? { enabled: true, ...brokerMetrics } : { enabled: false },
    validationStrategy: validationStrategyProfile(args),
    totals: summarizeTotals(results, cases.length),
    cases,
    results
  };
}

function validationStrategyProfile(args = {}) {
  const textOcr = parseBooleanFlag(args["text-ocr"], true);
  return {
    name: textOcr ? "source-render-ocr-and-editability-gate" : "source-render-visual-and-editability-gate",
    renderer: args.renderer || args.render || "default",
    textOcrEnabled: textOcr,
    textOcrMode: textOcr ? (args["text-ocr-mode"] || "anchored") : null,
    textOcrPages: textOcr ? (args["text-ocr-pages"] || null) : null,
    minTextCoverage: textOcr ? (args["min-text-coverage"] || "0.80") : null,
    checks: [
      "render-source-vs-generated-pixel-diff",
      "full-slide-raster-rejection-except-decorative-backgrounds",
      "intentional-local-crop-accounting",
      "ocr-text-coverage-when-enabled"
    ],
    borrowedPatterns: [
      {
        source: "frontend-slides / huashu-design / html-ppt-skill",
        lesson: "preview and visual-quality gates should be part of the generation loop"
      },
      {
        source: "baoyu slide workflow",
        lesson: "persist batch provenance and reproducible run metadata"
      }
    ]
  };
}

function summarizeTotals(results, totalCases = results.length) {
  const coverageValues = results
    .map((item) => Number(item.textCoverage))
    .filter(Number.isFinite);
  return {
    totalCases,
    completedCases: results.length,
    passedCases: results.filter((item) => item.ok === true && Number(item.rejected || 0) === 0).length,
    failedCases: results.filter((item) => item.ok !== true || Number(item.rejected || 0) > 0).length,
    meanTextCoverage: coverageValues.length
      ? round(coverageValues.reduce((sum, value) => sum + value, 0) / coverageValues.length)
      : null,
    minTextCoverage: coverageValues.length ? round(Math.min(...coverageValues)) : null
  };
}

function writeReport(outputDir, report) {
  ensureDir(outputDir);
  const reportFile = path.join(outputDir, "ocr-batch-report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportFile;
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
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function parsePositiveInt(value, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function pushOption(args, name, value) {
  if (value !== undefined && value !== null && value !== "") args.push(name, String(value));
}

function parseConcurrency(value, fallback = 1) {
  const parsed = parsePositiveInt(value, fallback);
  return Math.max(1, Math.min(parsed, 4));
}

function parseBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

async function runLimited(items, concurrency, worker) {
  const limit = parseConcurrency(concurrency, 1);
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

function spawnBuffered(command, args, options = {}) {
  return new Promise((resolve) => {
    const maxBuffer = parsePositiveInt(options.maxBuffer, 96 * 1024 * 1024);
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: options.windowsHide !== false,
      stdio: ["ignore", "pipe", "pipe"],
      ...(options.env ? { env: { ...process.env, ...options.env } } : {})
    });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    const timeoutMs = parsePositiveInt(options.timeout, 0);
    const timer = timeoutMs > 0
      ? setTimeout(() => child.kill("SIGTERM"), timeoutMs)
      : null;
    const append = (current, chunk) => {
      if (current.length >= maxBuffer) {
        truncated = true;
        return current;
      }
      const next = current + chunk.toString();
      if (next.length <= maxBuffer) return next;
      truncated = true;
      return next.slice(0, maxBuffer);
    };
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      resolve({ status: 1, error, stdout, stderr, truncated });
    });
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ status: code, signal, stdout, stderr, truncated });
    });
  });
}

async function maybeStartPaddleOcrBroker({ args = {}, textOcr = true, textOcrAdapter = DEFAULT_OCR_ADAPTER, cases = [], concurrency = 1 } = {}) {
  if (!shouldUsePaddleOcrBroker({ args, textOcr, textOcrAdapter, caseCount: cases.length, concurrency })) return null;
  const adapterFile = path.isAbsolute(textOcrAdapter)
    ? path.normalize(textOcrAdapter)
    : path.resolve(__dirname, "..", textOcrAdapter);
  if (!fs.existsSync(adapterFile) || !fs.statSync(adapterFile).isFile()) throw new Error("PaddleOCR batch adapter is unavailable");
  const adapter = require(adapterFile);
  return startPaddleOcrBatchBroker({
    adapter,
    context: {
      skillRoot: path.resolve(__dirname, ".."),
      config: { paddleOcr: { ...readPaddleOcrConfig(args), cache: false } },
      disablePaddleOcrBroker: true
    }
  });
}

function shouldUsePaddleOcrBroker({ args = {}, textOcr = true, textOcrAdapter = DEFAULT_OCR_ADAPTER, caseCount = 0, concurrency = 1 } = {}) {
  const brokerMode = String(args["paddle-ocr-broker"] || "auto").trim().toLowerCase();
  if (!["auto", "true", "false"].includes(brokerMode)) throw new Error("paddle-ocr-broker must be auto, true, or false");
  if (!textOcr || caseCount === 0 || brokerMode === "false" || !isPaddleOcrAdapter(textOcrAdapter)) return false;
  // With multiple case workers, independent model processes provide real OCR
  // throughput. Auto-sharing is reserved for sequential batches; constrained
  // deployments can explicitly select true to trade latency for lower memory.
  if (brokerMode === "auto" && parseConcurrency(concurrency, 1) > 1) return false;
  return true;
}

function isPaddleOcrAdapter(value) {
  return path.basename(String(value || "")).toLowerCase() === "ocr-paddleocr-local.js";
}

function parseLastJsonObject(stdout) {
  const text = String(stdout || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`Unable to find JSON payload in stdout:\n${text}`);
  return JSON.parse(text.slice(start, end + 1));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function truncate(value, maxLength = 6000) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function round(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  buildQualityGateArgs,
  countRenderedPages,
  discoverCases,
  findRenderDirsByPrefix,
  findRenderDirsFromQualityReports,
  makeReport,
  maybeStartPaddleOcrBroker,
  shouldUsePaddleOcrBroker,
  isPaddleOcrAdapter,
  parseBooleanFlag,
  parseConcurrency,
  parsePositiveInt,
  resolveReusableRenderDir,
  resolveTextOcrPages,
  runLimited,
  selectRepresentativeOcrPageIndexes,
  spawnBuffered,
  summarizeTotals,
  validationStrategyProfile
};
