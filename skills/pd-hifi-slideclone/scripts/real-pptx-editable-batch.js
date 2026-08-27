#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { countPptxSlides, findEndOfCentralDirectory } = require("./lib/pptx-inventory");
const { classifyPptxEditability } = require("./lib/pptx-editability-classifier");

const skillRoot = path.resolve(__dirname, "..");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputDir = path.resolve(args.input || path.join(process.cwd(), "ppt文档"));
  const outputRoot = path.resolve(args.out || path.join(inputDir, "可编辑版本"));
  const maxPages = parseNonNegativeInt(args["max-pages"], 0);
  const maxFiles = parseNonNegativeInt(args["max-files"], 0);
  const pptxFiles = collectPptxFiles({ inputDir, pptx: args.pptx });
  if (pptxFiles.length === 0) {
    throw new Error(`No PPTX files found in ${inputDir}`);
  }
  const sampleStrategy = normalizeSampleStrategy(args["sample-strategy"] || args.sampleStrategy);
  const selectedFileEntries = selectPptxFileEntries(pptxFiles, { maxFiles, sampleStrategy });
  const selectedFiles = selectedFileEntries.map((entry) => entry.file);
  fs.mkdirSync(outputRoot, { recursive: true });

  if (isFlagEnabled(args["dry-run"])) {
    const report = dryRunReport({ inputDir, outputRoot, pptxFiles: selectedFiles, selectedFileEntries, maxPages, sampleStrategy });
    const reportFile = path.join(outputRoot, "batch-dry-run-report.json");
    fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({ ...report.totals, reportFile }, null, 2)}\n`);
    return;
  }

  const normalizer = normalizeNormalizer(args.normalizer || args.normalize || "libreoffice");
  const textOverlayVisibility = normalizeTextOverlayVisibility(args["text-overlay"] || args.textOverlay || args["editable-text"]);
  const defaultConcurrency = recommendBatchConcurrency({ normalizer, fileCount: selectedFiles.length });
  const concurrency = parseConcurrency(args.concurrency, defaultConcurrency);
  const activeJobs = new Map();
  const heartbeatMs = parsePositiveInt(args["heartbeat-ms"] || args.heartbeatMs, 0);
  const heartbeatTimer = heartbeatMs > 0
    ? setInterval(() => writeEditableBatchHeartbeat(activeJobs, heartbeatMs), heartbeatMs)
    : null;
  const convertOptions = {
    outputRoot,
    maxPages,
    normalizer,
    textOverlayVisibility,
    pageConcurrency: parsePageConcurrency(args["page-concurrency"] || args.pageConcurrency, 1),
    progress: !isFlagEnabled(args["quiet-progress"]),
    exportWidthPx: parsePositiveInt(args.width, 1280),
    exportHeightPx: parsePositiveInt(args.height, 720),
    preserveNative: String(args["preserve-native"] ?? "true").toLowerCase() !== "false"
  };
  const jobs = selectedFiles.map((file, index) => ({ file, index }));
  const results = await runLimited(jobs, concurrency, async ({ file, index }) => {
    const deckName = path.basename(file);
    process.stderr.write(`[editable-batch] ${index + 1}/${selectedFiles.length} start ${deckName}\n`);
    const startedAt = Date.now();
    activeJobs.set(deckName, { index, total: selectedFiles.length, startedAt, stage: "normalize" });
    let result;
    try {
      result = await convertOne(file, {
        ...convertOptions,
        onProgress: (event) => {
          activeJobs.set(deckName, {
            index,
            total: selectedFiles.length,
            startedAt,
            stage: event.stage || "working",
            pageIndex: Number.isFinite(Number(event.pageIndex)) ? Number(event.pageIndex) : null,
            pageCount: Number.isFinite(Number(event.pageCount)) ? Number(event.pageCount) : null
          });
          if (convertOptions.progress) {
            process.stderr.write(formatEditableBatchProgress({
              deckName,
              stage: event.stage,
              pageIndex: event.pageIndex,
              pageCount: event.pageCount,
              elapsedMs: event.elapsedMs
            }));
          }
        }
      });
    } catch (error) {
      result = {
        ok: false,
        sourcePptx: file,
        outputPptx: null,
        workDir: path.join(outputRoot, `${path.basename(file, path.extname(file))}.work`),
        normalizer,
        textOverlayVisibility,
        pageCount: 0,
        editableTextBoxes: 0,
        error: summarizeError(error)
      };
    }
    result.elapsedMs = Date.now() - startedAt;
    const status = result.ok ? "done" : "failed";
    process.stderr.write(`[editable-batch] ${index + 1}/${selectedFiles.length} ${status} ${deckName} ${result.elapsedMs}ms\n`);
    activeJobs.delete(deckName);
    return result;
  });
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  const report = {
    provider: "real-pptx-editable-batch",
    inputDir,
    outputRoot,
    concurrency,
    requestedConcurrency: args.concurrency || null,
    concurrencyPolicy: "resource-aware-v1",
    generatedAt: new Date().toISOString(),
    totals: {
      totalFiles: results.length,
      convertedFiles: results.filter((item) => item.ok === true).length,
      failedFiles: results.filter((item) => item.ok !== true).length,
      totalPages: results.reduce((sum, item) => sum + Number(item.pageCount || 0), 0),
      totalEditableTextBoxes: results.reduce((sum, item) => sum + Number(item.editableTextBoxes || 0), 0)
    },
    results
  };
  const reportFile = path.join(outputRoot, "batch-report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...report.totals, reportFile }, null, 2)}\n`);
  if (report.totals.failedFiles > 0) {
    process.exitCode = 1;
  }
}

function dryRunReport({ inputDir, outputRoot, pptxFiles, selectedFileEntries = null, maxPages, sampleStrategy }) {
  const entryByFile = new Map((Array.isArray(selectedFileEntries) ? selectedFileEntries : []).map((entry) => [entry.file, entry]));
  const files = pptxFiles.map((file) => {
    const entry = entryByFile.get(file) || {};
    const slideCount = Number.isFinite(Number(entry.slideCount)) ? Number(entry.slideCount) : countPptxSlides(file);
    const sizeBytes = Number.isFinite(Number(entry.sizeBytes)) ? Number(entry.sizeBytes) : fs.statSync(file).size;
    const selectedPages = maxPages > 0 ? Math.min(slideCount, maxPages) : slideCount;
    return {
      file,
      name: path.basename(file),
      sizeBytes,
      slideCount,
      selectedPages,
      selectionReasons: Array.isArray(entry.selectionReasons) ? entry.selectionReasons : [],
      outputPptx: path.join(outputRoot, `${path.basename(file, path.extname(file))}.editable.pptx`)
    };
  });
  return {
    provider: "real-pptx-editable-batch-dry-run",
    inputDir,
    outputRoot,
    maxPages,
    sampleStrategy: normalizeSampleStrategy(sampleStrategy),
    generatedAt: new Date().toISOString(),
    totals: {
      totalFiles: files.length,
      totalSlides: files.reduce((sum, item) => sum + item.slideCount, 0),
      selectedPages: files.reduce((sum, item) => sum + item.selectedPages, 0)
    },
    files
  };
}

function selectPptxFiles(files = [], options = {}) {
  return selectPptxFileEntries(files, options).map((entry) => entry.file);
}

function selectPptxFileEntries(files = [], options = {}) {
  const maxFiles = parseNonNegativeInt(options.maxFiles, 0);
  if (maxFiles <= 0 || files.length <= maxFiles) {
    return files.map((file, index) => ({
      file,
      index,
      ...pptxInventoryForSelection(file),
      selectionReasons: ["included"]
    }));
  }
  const strategy = normalizeSampleStrategy(options.sampleStrategy);
  if (strategy === "ordered") {
    return files.slice(0, maxFiles).map((file, index) => ({
      file,
      index,
      ...pptxInventoryForSelection(file),
      selectionReasons: ["ordered"]
    }));
  }
  const inventoryProvider = typeof options.inventoryProvider === "function" ? options.inventoryProvider : pptxInventoryForSelection;
  const inventory = files.map((file, index) => ({
    file,
    index,
    ...inventoryProvider(file, index)
  }));
  const selected = [];
  const add = (item, reason) => {
    if (!item) return;
    const existing = selected.find((entry) => entry.file === item.file);
    if (existing) {
      if (reason && !existing.selectionReasons.includes(reason)) existing.selectionReasons.push(reason);
      return;
    }
    if (selected.length < maxFiles) {
      selected.push({
        ...item,
        selectionReasons: [reason].filter(Boolean)
      });
      return;
    }
  };
  const bySlidesAsc = inventory.slice().sort((a, b) => Number(a.slideCount || 0) - Number(b.slideCount || 0) || a.index - b.index);
  const bySlidesDesc = inventory.slice().sort((a, b) => Number(b.slideCount || 0) - Number(a.slideCount || 0) || a.index - b.index);
  const bySizeAsc = inventory.slice().sort((a, b) => Number(a.sizeBytes || 0) - Number(b.sizeBytes || 0) || a.index - b.index);
  const bySizeDesc = inventory.slice().sort((a, b) => Number(b.sizeBytes || 0) - Number(a.sizeBytes || 0) || a.index - b.index);
  add(bySlidesAsc[0], "fewest-slides");
  add(bySlidesDesc[0], "most-slides");
  add(bySizeDesc[0], "largest-file");
  add(bySizeAsc[0], "smallest-file");
  for (const item of bySlidesDesc) add(item, "slide-count-backfill");
  return selected
    .sort((a, b) => a.index - b.index)
    .map((item) => ({
      file: item.file,
      index: item.index,
      slideCount: Number(item.slideCount || 0),
      sizeBytes: Number(item.sizeBytes || 0),
      selectionReasons: item.selectionReasons || []
    }));
}

function normalizeSampleStrategy(value) {
  const text = String(value || "ordered").trim().toLowerCase();
  if (["diverse", "representative", "balanced"].includes(text)) return "diverse";
  return "ordered";
}

function pptxInventoryForSelection(file) {
  let slideCount = 0;
  try {
    slideCount = countPptxSlides(file);
  } catch {
    slideCount = 0;
  }
  let sizeBytes = 0;
  try {
    sizeBytes = fs.statSync(file).size;
  } catch {
    sizeBytes = 0;
  }
  return { slideCount, sizeBytes };
}

function collectPptxFiles({ inputDir, pptx }) {
  if (pptx) {
    const file = path.resolve(pptx);
    return /\.pptx$/i.test(file) && fs.existsSync(file) && fs.statSync(file).isFile() ? [file] : [];
  }
  return fs.readdirSync(inputDir)
    .filter((name) => /\.pptx$/i.test(name))
    .map((name) => path.join(inputDir, name))
    .filter((file) => fs.statSync(file).isFile())
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true }));
}

async function convertOne(pptxFile, options) {
  const baseName = path.basename(pptxFile, path.extname(pptxFile));
  const workDir = path.join(options.outputRoot, `${baseName}.work`);
  const inputDir = path.join(workDir, "input");
  const pptxDir = path.join(workDir, "pptx");
  const reportsDir = path.join(workDir, "reports");
  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(pptxDir, { recursive: true });
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.copyFileSync(pptxFile, path.join(inputDir, path.basename(pptxFile)));

  const sourceEditability = classifyPptxEditability(pptxFile);
  fs.writeFileSync(
    path.join(reportsDir, "source-editability-report.json"),
    `${JSON.stringify(sourceEditability, null, 2)}\n`,
    "utf8"
  );
  if (options.preserveNative !== false && sourceEditability.route === "native-passthrough") {
    const finalPptx = path.join(options.outputRoot, `${baseName}.editable.pptx`);
    fs.copyFileSync(pptxFile, finalPptx);
    const report = {
      ok: true,
      sourcePptx: pptxFile,
      outputPptx: finalPptx,
      workDir,
      conversionMode: "native-passthrough",
      normalizer: null,
      textOverlayVisibility: "not-applicable",
      pageConcurrency: 0,
      pageCount: sourceEditability.slideCount,
      editableTextBoxes: sourceEditability.slides.reduce((sum, slide) => sum + slide.textRuns, 0),
      maxPagesIgnoredToPreserveNativeDeck: Number(options.maxPages || 0) > 0,
      sourceEditability,
      normalizeReport: null,
      irFile: null
    };
    fs.writeFileSync(path.join(reportsDir, "editable-conversion-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    emitProgress(options, { stage: "native-passthrough:done", pageCount: sourceEditability.slideCount });
    return report;
  }

  const context = {
    skillRoot,
    outputDir: workDir,
    config: {
      normalize: {
        exportWidthPx: options.exportWidthPx,
        exportHeightPx: options.exportHeightPx,
        maxPages: options.maxPages
      },
      powerPoint: { cleanupHidden: true },
      regionProposal: {
        includeFullPage: true,
        emitRegionPages: false,
        cropContainer: false,
        minConfidence: 0.45,
        minAreaRatio: 0.035,
        maxAreaRatio: 0.72,
        paddingPx: 4,
        innerPaddingPx: 4,
        innerHeaderSkipRatio: 0.18
      },
      umiOcr: {
        paddleBin: "C:/Program Files/Umi-OCR_Paddle_v2.1.5/UmiOCR-data/plugins/win7_x64_PaddleOCR-json/PaddleOCR-json.exe",
        initTimeoutMs: 60000
      }
    }
  };

  const normalizer = options.normalizer || "libreoffice";
  const normalize = loadNormalizer(normalizer);
  const ocr = require(path.join(skillRoot, "scripts", "adapters", "ocr-paddleocr-local.js"));
  const vision = require(path.join(skillRoot, "scripts", "adapters", "vision-editable-overlay.js"));
  const pptx = require(path.join(skillRoot, "scripts", "adapters", "pptx-python-pptx.js"));

  emitProgress(options, { stage: "normalize:start" });
  const normalizeStartedAt = Date.now();
  const normalizeResult = assertOk("normalize", await normalize({ inputDir, outputDir: workDir }, context));
  emitProgress(options, { stage: "normalize:done", elapsedMs: Date.now() - normalizeStartedAt });
  const pages = normalizeResult.data.pageImages || [];
  const ir = {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: []
  };
  const pageJobs = pages.map((page, pageIndex) => ({ page, pageIndex }));
  const pageResults = await runLimited(pageJobs, options.pageConcurrency || 1, async ({ page, pageIndex }) => {
    const pageStartedAt = Date.now();
    emitProgress(options, { stage: "page:ocr:start", pageIndex, pageCount: pages.length });
    const ocrResult = assertOk("ocr", await ocr({
      pageIndex,
      sourceImage: page.sourceImage,
      page,
      slideSize: ir.slideSize
    }, context));
    emitProgress(options, { stage: "page:vision:start", pageIndex, pageCount: pages.length, elapsedMs: Date.now() - pageStartedAt });
    const visionResult = assertOk("vision", await vision({
      pageIndex,
      sourceImage: page.sourceImage,
      page,
      slideSize: ir.slideSize,
      ocr: ocrResult.data,
      textOverlayVisibility: options.textOverlayVisibility
    }, context));
    emitProgress(options, { stage: "page:done", pageIndex, pageCount: pages.length, elapsedMs: Date.now() - pageStartedAt });
    return {
      pageIndex,
      sourceImage: page.sourceImage,
      background: visionResult.data.background || {},
      textBoxes: visionResult.data.textBoxes || [],
      shapes: visionResult.data.shapes || [],
      images: visionResult.data.images || [],
      tables: visionResult.data.tables || [],
      charts: visionResult.data.charts || [],
      icons: visionResult.data.icons || []
    };
  });
  ir.pages = pageResults;
  const editableTextBoxes = pageResults.reduce((sum, page) => sum + (page.textBoxes || []).length, 0);

  const irFile = path.join(workDir, "ir", "deck.json");
  fs.mkdirSync(path.dirname(irFile), { recursive: true });
  fs.writeFileSync(irFile, `${JSON.stringify(ir, null, 2)}\n`, "utf8");
  emitProgress(options, { stage: "pptx:start", pageCount: pages.length });
  const pptxStartedAt = Date.now();
  const pptxResult = assertOk("pptx", await pptx({ irFile, ir, iteration: 0 }, context));
  emitProgress(options, { stage: "pptx:done", pageCount: pages.length, elapsedMs: Date.now() - pptxStartedAt });
  const finalPptx = path.join(options.outputRoot, `${baseName}.editable.pptx`);
  fs.copyFileSync(pptxResult.data.pptxFile, finalPptx);
  const report = {
    ok: true,
    sourcePptx: pptxFile,
    outputPptx: finalPptx,
    workDir,
    conversionMode: "raster-rebuild",
    sourceEditability,
    normalizer,
    textOverlayVisibility: options.textOverlayVisibility || "hidden",
    pageConcurrency: options.pageConcurrency || 1,
    pageCount: pages.length,
    editableTextBoxes,
    normalizeReport: normalizeResult.data.reportFile,
    irFile
  };
  fs.writeFileSync(path.join(reportsDir, "editable-conversion-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function assertOk(stage, result) {
  if (result?.ok !== true) {
    throw new Error(`${stage} failed: ${result?.error || "unknown error"}`);
  }
  return result;
}

function loadNormalizer(normalizer) {
  if (normalizer === "libreoffice") {
    return require(path.join(skillRoot, "scripts", "adapters", "normalize-cli.js"));
  }
  if (normalizer === "powerpoint-com") {
    return require(path.join(skillRoot, "scripts", "adapters", "normalize-powerpoint-com.js"));
  }
  throw new Error(`Unsupported normalizer: ${normalizer}`);
}

function normalizeNormalizer(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["lo", "libreoffice", "libre-office", "headless"].includes(normalized)) return "libreoffice";
  if (["ppt", "ppt-com", "powerpoint", "powerpoint-com", "com"].includes(normalized)) return "powerpoint-com";
  if (!normalized) return "libreoffice";
  throw new TypeError(`Unsupported normalizer: ${normalized}`);
}

function normalizeTextOverlayVisibility(value) {
  const normalized = String(value || "hidden").trim().toLowerCase();
  if (["visible", "show", "debug"].includes(normalized)) return "visible";
  if (["hidden", "hide", "transparent", "invisible"].includes(normalized)) return "hidden";
  return "hidden";
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseConcurrency(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 8);
}

function parsePageConcurrency(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 4);
}

function emitProgress(options = {}, event = {}) {
  if (typeof options.onProgress !== "function") return;
  options.onProgress(event);
}

function formatEditableBatchProgress({ deckName = "deck", stage = "working", pageIndex = null, pageCount = null, elapsedMs = null } = {}) {
  const pagePart = Number.isFinite(Number(pageIndex)) && Number.isFinite(Number(pageCount))
    ? ` p${Number(pageIndex) + 1}/${Number(pageCount)}`
    : "";
  const elapsedPart = Number.isFinite(Number(elapsedMs)) ? ` ${Math.max(0, Math.round(Number(elapsedMs)))}ms` : "";
  return `[editable-batch] progress ${safeProgressName(deckName)} ${stage || "working"}${pagePart}${elapsedPart}\n`;
}

function writeEditableBatchHeartbeat(activeJobs, heartbeatMs) {
  if (!activeJobs || activeJobs.size === 0) return;
  const now = Date.now();
  const active = Array.from(activeJobs.entries()).map(([deckName, job]) => {
    const elapsedSeconds = Math.max(0, Math.round((now - Number(job.startedAt || now)) / 1000));
    const pagePart = Number.isFinite(Number(job.pageIndex)) && Number.isFinite(Number(job.pageCount))
      ? ` p${Number(job.pageIndex) + 1}/${Number(job.pageCount)}`
      : "";
    return `${Number(job.index || 0) + 1}/${Number(job.total || 1)} ${safeProgressName(deckName)} ${job.stage || "working"}${pagePart} ${elapsedSeconds}s`;
  });
  process.stderr.write(`[editable-batch] heartbeat ${activeJobs.size} active every ${heartbeatMs}ms: ${active.join(" | ")}\n`);
}

function safeProgressName(value) {
  return path.basename(String(value || "deck")).replace(/[\r\n\t]/g, " ").slice(0, 180) || "deck";
}

function recommendPageConcurrency({ pageCount = 1, cpuCount = os.cpus().length, totalMemoryBytes = os.totalmem() } = {}) {
  if (Number(pageCount) <= 1) return 1;
  return recommendResourceAwareConcurrency({
    workload: "page-ocr-vision",
    cpuCount,
    totalMemoryBytes
  });
}

function recommendBatchConcurrency({ normalizer = "libreoffice", fileCount = 1, cpuCount = os.cpus().length, totalMemoryBytes = os.totalmem() } = {}) {
  if (Number(fileCount) <= 1) return 1;
  const normalized = normalizeNormalizer(normalizer);
  const workload = normalized === "powerpoint-com" ? "office-com" : "office-render";
  return recommendResourceAwareConcurrency({ workload, cpuCount, totalMemoryBytes });
}

function recommendResourceAwareConcurrency({ workload = "office-render", cpuCount = os.cpus().length, totalMemoryBytes = os.totalmem() } = {}) {
  const cpus = Math.max(1, Number(cpuCount) || 1);
  const memoryGb = Math.max(0, Number(totalMemoryBytes) || 0) / (1024 ** 3);
  const cpuBound = cpus >= 16 ? 4 : cpus >= 10 ? 3 : cpus >= 6 ? 2 : 1;
  const memoryBound = memoryGb >= 32 ? 4 : memoryGb >= 20 ? 3 : memoryGb >= 10 ? 2 : 1;
  const nativeRebuildBound = cpus >= 16 && memoryGb >= 64 ? 4 : 3;
  const workloadBound = workload === "office-com"
    ? 1
    : workload === "native-rebuild"
      ? nativeRebuildBound
      : workload === "page-ocr-vision"
        ? 4
        : 2;
  return Math.max(1, Math.min(cpuBound, memoryBound, workloadBound, 8));
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

function isFlagEnabled(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function summarizeError(error) {
  return {
    message: String(error?.message || error || "unknown error").slice(0, 4000),
    stderr: error?.stderr ? String(error.stderr).slice(0, 2000) : "",
    stdout: error?.stdout ? String(error.stdout).slice(0, 2000) : ""
  };
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  collectPptxFiles,
  countPptxSlides,
  dryRunReport,
  findEndOfCentralDirectory,
  isFlagEnabled,
  normalizeNormalizer,
  normalizeSampleStrategy,
  normalizeTextOverlayVisibility,
  formatEditableBatchProgress,
  parseConcurrency,
  parsePageConcurrency,
  recommendBatchConcurrency,
  recommendPageConcurrency,
  recommendResourceAwareConcurrency,
  runLimited,
  safeProgressName,
  selectPptxFileEntries,
  selectPptxFiles,
  summarizeError
};
