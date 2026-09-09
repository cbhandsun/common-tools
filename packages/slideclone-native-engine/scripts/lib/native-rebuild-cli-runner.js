"use strict";

const path = require("path");
const { shouldRunPowerPointOpenGate } = require("@common-tools/slideclone-core/pptx-build-execution");
const {
  isFlagDisabled,
  isFlagEnabled,
  parseNativeRebuildArgs,
  rebuildRealPptxNativeUsage,
  resolveSmartNativeRebuildOptions,
  sanitizeCommandArgs
} = require("./native-rebuild-options");
const { resolveDefaultFinalPageCacheDir } = require("./final-page-cache");
const { hybridRebuildStrategyProfile } = require("./native-rebuild-strategy-profile");
const { listWorkDirs } = require("./native-rebuild-workdir");
const {
  createProgressReporter,
  resolvePptxBuildMode
} = require("./native-rebuild-deck-pipeline");
const { enrichReconstructionContracts } = require("./reconstruction-contract");

async function runNativeRebuildCli(argv = [], operations = {}) {
  const buildPptx = requireFunction(operations, "buildPptx");
  const buildPptxBatch = requireFunction(operations, "buildPptxBatch");
  const ensureDir = requireFunction(operations, "ensureDir");
  const rebuildDeckFromWorkDir = requireFunction(operations, "rebuildDeckFromWorkDir");
  const summarizeDeckComposition = requireFunction(operations, "summarizeDeckComposition");
  const fs = requireObject(operations, "fs");
  const consoleObject = operations.consoleObject || console;
  const processObject = operations.processObject || process;

  const args = parseNativeRebuildArgs(argv);
  if (args.help === true || args.h === true) {
    consoleObject.log(rebuildRealPptxNativeUsage());
    return null;
  }
  const workRoot = path.resolve(args["work-root"] || "ppt文档/可编辑版本");
  const outRoot = path.resolve(args.out || "ppt文档/真可编辑版本");
  const only = args.only || null;
  ensureDir(outRoot);
  const rebuildOptions = resolveSmartNativeRebuildOptions(args);
  const finalPageCacheEnabled = !isFlagEnabled(args["no-final-page-cache"]);
  const finalPageCacheStats = { hits: 0, misses: 0, writes: 0 };
  if (finalPageCacheEnabled) {
    rebuildOptions.finalPageCacheDir = path.resolve(args["final-page-cache-dir"] || resolveDefaultFinalPageCacheDir());
    rebuildOptions.reuseFinalPageCache = String(args["reuse-final-page-cache"] ?? "true").toLowerCase() !== "false";
    rebuildOptions.pageCacheSalt = typeof args["page-cache-salt"] === "string" ? args["page-cache-salt"] : "";
    rebuildOptions.finalPageCacheStats = finalPageCacheStats;
  }
  const pptxBuildMode = resolvePptxBuildMode(args);
  rebuildOptions.preserveSourceNativeSlides = pptxBuildMode.engine === "openxml"
    && String(args["preserve-source-native-slides"] ?? "true").toLowerCase() !== "false";
  const powerPointOpenGate = shouldRunPowerPointOpenGate(args, pptxBuildMode);
  const progressReporter = createProgressReporter({
    enabled: String(args.progress ?? "true").toLowerCase() !== "false",
    context: { scope: "native-rebuild" }
  });
  const workDirs = listWorkDirs(workRoot, only);
  const deferredPptxJobs = [];
  const report = createRunReport({
    argv,
    finalPageCacheEnabled,
    finalPageCacheStats,
    outRoot,
    powerPointOpenGate,
    pptxBuildMode,
    rebuildOptions,
    workRoot
  });
  progressReporter.emit({ phase: "run", status: "start", deckTotal: workDirs.length });
  for (let workIndex = 0; workIndex < workDirs.length; workIndex += 1) {
    runDeckRebuild({
      args,
      buildPptx,
      deferredPptxJobs,
      ensureDir,
      fs,
      outRoot,
      pptxBuildMode,
      rebuildDeckFromWorkDir,
      rebuildOptions,
      report,
      summarizeDeckComposition,
      workDir: workDirs[workIndex],
      workIndex,
      workTotal: workDirs.length,
      progressReporter
    });
  }
  await finalizeDeferredPptxJobs({ deferredPptxJobs, report, args, buildPptxBatch, progressReporter });
  await runPowerPointGateIfNeeded({ powerPointOpenGate, report, outRoot, args, progressReporter });
  const reportFile = path.resolve(args["report-file"] || path.join(outRoot, "native-rebuild-report.json"));
  ensureDir(path.dirname(reportFile));
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  progressReporter.emit({ phase: "run", status: report.totals.failed > 0 ? "failed" : "done", deckTotal: workDirs.length });
  consoleObject.log(JSON.stringify(report, null, 2));
  if (report.totals.failed > 0) processObject.exitCode = 1;
  return report;
}

function createRunReport({
  argv = [],
  finalPageCacheEnabled,
  finalPageCacheStats,
  outRoot = "",
  powerPointOpenGate,
  pptxBuildMode = {},
  rebuildOptions = {},
  workRoot = ""
} = {}) {
  return {
    provider: "rebuild-real-pptx-native",
    workRoot,
    outRoot,
    generatedAt: new Date().toISOString(),
    strategy: hybridRebuildStrategyProfile(rebuildOptions),
    pptxBuild: {
      engine: pptxBuildMode.engine,
      batch: pptxBuildMode.engine === "openxml",
      powerPointSafe: pptxBuildMode.engine === "openxml" ? pptxBuildMode.powerPointSafe : null
    },
    powerPointOpenGate: {
      enabled: powerPointOpenGate,
      status: powerPointOpenGate ? "pending" : "not-requested"
    },
    command: sanitizeCommandArgs(argv),
    finalPageCache: {
      enabled: finalPageCacheEnabled,
      reuse: rebuildOptions.reuseFinalPageCache === true,
      dir: rebuildOptions.finalPageCacheDir || null,
      stats: finalPageCacheStats
    },
    totals: { files: 0, pages: 0, images: 0, shapes: 0, textBoxes: 0, failed: 0 },
    results: []
  };
}

function runDeckRebuild({
  args = {},
  buildPptx,
  deferredPptxJobs = [],
  fs,
  outRoot = "",
  pptxBuildMode = {},
  rebuildDeckFromWorkDir,
  rebuildOptions = {},
  report = {},
  summarizeDeckComposition,
  workDir = "",
  workIndex = 0,
  workTotal = 0,
  progressReporter
}) {
  const baseName = path.basename(workDir, ".work");
  const deckProgress = progressReporter.child({
    deck: baseName,
    deckIndex: workIndex + 1,
    deckTotal: workTotal
  });
  const irFile = path.join(outRoot, `${baseName}.native.ir.json`);
  const outFile = path.join(outRoot, `${baseName}.native-editable.pptx`);
  try {
    const deckStartedAt = Date.now();
    const pageTimings = [];
    deckProgress.emit({ phase: "deck", status: "start" });
    const assetDir = path.join(outRoot, `${baseName}.assets`);
    const rebuiltDeck = rebuildDeckFromWorkDir(workDir, {
      ...rebuildOptions,
      assetDir,
      irDir: outRoot,
      deckName: baseName,
      pages: args.pages || args.page || args["only-pages"] || "",
      pageTimings,
      progressReporter: deckProgress
    });
    const deck = enrichReconstructionContracts(rebuiltDeck, { baseDir: outRoot });
    const irBuildMs = Date.now() - deckStartedAt;
    fs.writeFileSync(irFile, `${JSON.stringify(deck, null, 2)}\n`, "utf8");
    if (pptxBuildMode.engine === "openxml") {
      const sourceTemplate = path.join(workDir, "input", `${baseName}.pptx`);
      deferredPptxJobs.push({
        irFile,
        outFile,
        baseName,
        templatePptx: fs.existsSync(sourceTemplate) ? sourceTemplate : ""
      });
    } else {
      buildPptx(irFile, outFile, { python: args.python });
    }
    recordSuccessfulDeck({
      deck,
      deckStartedAt,
      irBuildMs,
      outFile,
      irFile,
      pageTimings,
      pptxBuildMode,
      report,
      summarizeDeckComposition,
      workDir,
      deckProgress
    });
  } catch (error) {
    report.totals.failed += 1;
    report.results.push({
      inputWorkDir: workDir,
      status: "failed",
      error: error.message
    });
    deckProgress.emit({ phase: "deck", status: "failed" });
  }
}

function recordSuccessfulDeck({
  deck = {},
  deckStartedAt = 0,
  irBuildMs = 0,
  outFile = "",
  irFile = "",
  pageTimings = [],
  pptxBuildMode = {},
  report = {},
  summarizeDeckComposition,
  workDir = "",
  deckProgress
}) {
  const result = {
    inputWorkDir: workDir,
    outputPptx: outFile,
    outputIr: irFile,
    pages: deck.pages.length,
    images: deck.pages.reduce((sum, page) => sum + (page.images || []).length, 0),
    shapes: deck.pages.reduce((sum, page) => sum + (page.shapes || []).length, 0),
    textBoxes: deck.pages.reduce((sum, page) => sum + (page.textBoxes || []).length, 0),
    composition: summarizeDeckComposition(deck),
    timings: { irBuildMs, pageTimings },
    status: pptxBuildMode.engine === "openxml" ? "ir-built" : "converted"
  };
  report.results.push(result);
  report.totals.files += 1;
  report.totals.pages += result.pages;
  report.totals.images += result.images;
  report.totals.shapes += result.shapes;
  report.totals.textBoxes += result.textBoxes;
  deckProgress.emit({
    phase: "deck",
    status: pptxBuildMode.engine === "openxml" ? "ir-done" : "done",
    elapsedMs: Date.now() - deckStartedAt,
    images: result.images,
    shapes: result.shapes,
    textBoxes: result.textBoxes
  });
}

async function finalizeDeferredPptxJobs({ deferredPptxJobs = [], report = {}, args = {}, buildPptxBatch, progressReporter }) {
  if (deferredPptxJobs.length === 0) return;
  try {
    const pptxStartedAt = Date.now();
    progressReporter.emit({ phase: "pptx-build", status: "start", jobs: deferredPptxJobs.length });
    buildPptxBatch(deferredPptxJobs, args);
    for (const result of report.results) {
      if (result.status === "ir-built") result.status = "converted";
    }
    progressReporter.emit({
      phase: "pptx-build",
      status: "done",
      jobs: deferredPptxJobs.length,
      elapsedMs: Date.now() - pptxStartedAt
    });
    report.pptxBuild.elapsedMs = Date.now() - pptxStartedAt;
  } catch (error) {
    markDeferredPptxJobsFailed({ deferredPptxJobs, error, report });
    progressReporter.emit({ phase: "pptx-build", status: "failed", jobs: deferredPptxJobs.length });
  }
}

function markDeferredPptxJobsFailed({ deferredPptxJobs = [], error, report = {} }) {
  for (const job of deferredPptxJobs) {
    const result = report.results.find((item) => item.outputIr === job.irFile);
    if (result && result.status === "ir-built") {
      result.status = "failed";
      result.error = error.message;
      report.totals.failed += 1;
      report.totals.files = Math.max(0, report.totals.files - 1);
      report.totals.pages = Math.max(0, report.totals.pages - Number(result.pages || 0));
      report.totals.images = Math.max(0, report.totals.images - Number(result.images || 0));
      report.totals.shapes = Math.max(0, report.totals.shapes - Number(result.shapes || 0));
      report.totals.textBoxes = Math.max(0, report.totals.textBoxes - Number(result.textBoxes || 0));
    }
  }
}

async function runPowerPointGateIfNeeded({ powerPointOpenGate, report = {}, outRoot = "", args = {}, progressReporter }) {
  if (!powerPointOpenGate || report.totals.failed !== 0) return;
  try {
    const { validatePowerPointOpen } = require("../adapters/validate-powerpoint-com");
    const files = report.results.filter((result) => result.status === "converted").map((result) => result.outputPptx);
    progressReporter.emit({ phase: "powerpoint-open-gate", status: "start", jobs: files.length });
    const gateReport = await validatePowerPointOpen(files, {
      outputDir: path.join(outRoot, "powerpoint-open-gate"),
      timeoutMs: Number(args["powerpoint-open-timeout-ms"] || 170000),
      repairInPlace: !isFlagDisabled(args["powerpoint-repair-in-place"] ?? args.powerPointRepairInPlace)
    });
    report.powerPointOpenGate = { enabled: true, status: "passed", ...gateReport };
    progressReporter.emit({ phase: "powerpoint-open-gate", status: "done", jobs: files.length });
  } catch (error) {
    report.powerPointOpenGate = { enabled: true, status: "failed", error: error.message };
    for (const result of report.results) {
      if (result.status !== "converted") continue;
      result.status = "failed";
      result.error = `PowerPoint open gate failed: ${error.message}`;
      report.totals.failed += 1;
    }
    progressReporter.emit({ phase: "powerpoint-open-gate", status: "failed" });
  }
}

function requireFunction(operations = {}, name = "") {
  const value = operations[name];
  if (typeof value !== "function") throw new TypeError(`${name} operation is required`);
  return value;
}

function requireObject(operations = {}, name = "") {
  const value = operations[name];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} operation is required`);
  return value;
}

module.exports = {
  createRunReport,
  finalizeDeferredPptxJobs,
  markDeferredPptxJobsFailed,
  recordSuccessfulDeck,
  runDeckRebuild,
  runNativeRebuildCli,
  runPowerPointGateIfNeeded
};
