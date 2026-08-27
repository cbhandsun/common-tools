#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  parseConcurrency,
  runLimited
} = require("./real-pptx-editable-batch");
const {
  runComponentReplacementApply
} = require("./component-replacement-apply");
const {
  evaluateApplyQualityGate
} = require("./component-replacement-apply-quality-gate");
const {
  runComponentIrReplacementObjectAudit
} = require("./component-ir-replacement-object-audit");

function parseArgs(argv = process.argv) {
  const args = {
    manifest: "",
    out: path.join("runs", "component-ir-replacement-apply-batch"),
    concurrency: 1,
    engine: "openxml",
    allowMissing: false,
    dryRun: false,
    minAppliedCount: 0,
    minRemovedShapeCount: 0,
    maxFallbackWithoutRemoval: 0,
    minBoundsIoU: null,
    maxCenterOffsetPt: null,
    objectAudit: false,
    minObjectPictureReduction: 1,
    minObjectNativeIncrease: 1
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--manifest" && next) {
      args.manifest = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--concurrency" && next) {
      args.concurrency = Number(next);
      index += 1;
    } else if (arg === "--engine" && next) {
      args.engine = next;
      index += 1;
    } else if (arg === "--allow-missing") {
      args.allowMissing = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--min-applied-count" && next) {
      args.minAppliedCount = Number(next);
      index += 1;
    } else if (arg === "--min-removed-shape-count" && next) {
      args.minRemovedShapeCount = Number(next);
      index += 1;
    } else if (arg === "--max-fallback-without-removal" && next) {
      args.maxFallbackWithoutRemoval = Number(next);
      index += 1;
    } else if (arg === "--min-bounds-iou" && next) {
      args.minBoundsIoU = Number(next);
      index += 1;
    } else if (arg === "--max-center-offset-pt" && next) {
      args.maxCenterOffsetPt = Number(next);
      index += 1;
    } else if (arg === "--object-audit") {
      args.objectAudit = true;
    } else if (arg === "--min-object-picture-reduction" && next) {
      args.minObjectPictureReduction = Number(next);
      index += 1;
    } else if (arg === "--min-object-native-increase" && next) {
      args.minObjectNativeIncrease = Number(next);
      index += 1;
    } else {
      throw new Error(`Unknown component-ir-replacement-apply-batch argument: ${arg}`);
    }
  }
  if (!args.manifest) throw new Error("--manifest is required.");
  return args;
}

async function runComponentIrReplacementApplyBatch(options = {}) {
  const args = normalizeOptions(options);
  const manifest = readJson(args.manifest);
  const jobs = buildJobsFromManifest(manifest, args);
  const concurrency = parseConcurrency(args.concurrency, 1);
  fs.mkdirSync(args.out, { recursive: true });

  const results = await runLimited(jobs, concurrency, async (job) => {
    const startedAt = Date.now();
    try {
      const result = await runComponentReplacementApply({
        plan: job.planFile,
        out: job.outPptx,
        reportOut: job.reportOut,
        engine: args.engine,
        allowMissing: args.allowMissing,
        dryRun: args.dryRun,
        runner: args.runner,
        skillRoot: args.skillRoot
      });
      const summary = summarizeJob(job, result, Date.now() - startedAt);
      if (args.objectAudit && !args.dryRun && summary.status === "applied") {
        return attachObjectAudit(summary, job, args);
      }
      return summary;
    } catch (error) {
      return {
        deck: job.deck,
        planFile: job.planFile,
        inputPptx: job.pptx,
        outputPptx: job.outPptx,
        reportOut: job.reportOut,
        status: "failed",
        elapsedMs: Date.now() - startedAt,
        expectedOperations: job.expectedOperations,
        operationCount: 0,
        appliedCount: 0,
        skippedCount: 0,
        removedShapeCount: 0,
        clonedShapeCount: 0,
        error: sanitizeError(error),
        operations: []
      };
    }
  });

  const aggregateReport = {
    provider: "component-ir-replacement-apply-batch-v1",
    createdAt: new Date().toISOString(),
    manifest: args.manifest,
    out: args.out,
    concurrency,
    engine: args.engine,
    dryRun: args.dryRun,
    allowMissing: args.allowMissing,
    totals: summarizeResults(results),
    results
  };
  const reportFile = path.join(args.out, "component-ir-replacement-apply-batch-report.json");
  writeJson(reportFile, aggregateReport);
  const applyQualityGateFile = path.join(args.out, "component-replacement-apply-quality-gate.json");
  const applyQualityGate = evaluateApplyQualityGate({
    report: reportFile,
    out: applyQualityGateFile,
    minAppliedCount: args.minAppliedCount,
    minRemovedShapeCount: args.minRemovedShapeCount,
    maxFallbackWithoutRemoval: args.maxFallbackWithoutRemoval,
    minBoundsIoU: args.minBoundsIoU,
    maxCenterOffsetPt: args.maxCenterOffsetPt
  });
  return {
    ...aggregateReport,
    reportFile,
    applyQualityGateFile,
    applyQualityGate
  };
}

function normalizeOptions(options = {}) {
  const args = {
    manifest: options.manifest ? path.resolve(String(options.manifest)) : "",
    out: path.resolve(String(options.out || path.join("runs", "component-ir-replacement-apply-batch"))),
    concurrency: options.concurrency,
    engine: normalizeEngine(options.engine),
    allowMissing: options.allowMissing === true,
    dryRun: options.dryRun === true,
    minAppliedCount: normalizeNonNegativeInt(options.minAppliedCount, 0),
    minRemovedShapeCount: normalizeNonNegativeInt(options.minRemovedShapeCount, 0),
    maxFallbackWithoutRemoval: normalizeNonNegativeInt(options.maxFallbackWithoutRemoval, 0),
    minBoundsIoU: normalizeOptionalNonNegativeNumber(options.minBoundsIoU),
    maxCenterOffsetPt: normalizeOptionalNonNegativeNumber(options.maxCenterOffsetPt),
    objectAudit: options.objectAudit === true,
    minObjectPictureReduction: normalizeNonNegativeInt(options.minObjectPictureReduction, 1),
    minObjectNativeIncrease: normalizeNonNegativeInt(options.minObjectNativeIncrease, 1),
    objectAuditRunner: options.objectAuditRunner,
    runner: options.runner,
    skillRoot: options.skillRoot
  };
  if (!args.manifest) throw new Error("manifest is required.");
  if (!fs.existsSync(args.manifest)) throw new Error(`Manifest was not found: ${args.manifest}`);
  return args;
}

function normalizeEngine(value) {
  const engine = String(value || "openxml").trim().toLowerCase();
  if (engine !== "openxml" && engine !== "powerpoint") throw new Error(`Unsupported component replacement engine: ${value}`);
  return engine;
}

function buildJobsFromManifest(manifest = {}, args = {}) {
  if (manifest.status && manifest.status !== "ready") {
    throw new Error(`IR apply manifest is not ready: ${manifest.status}`);
  }
  const decks = Array.isArray(manifest.decks) ? manifest.decks : [];
  if (decks.length === 0) throw new Error("IR apply manifest has no decks.");
  return decks.map((deck) => {
    const name = safeFileStem(deck.deck || path.basename(deck.planFile || "deck"));
    const deckOut = path.join(args.out, name);
    return {
      deck: safeString(deck.deck),
      pptx: safeString(deck.pptx),
      planFile: path.resolve(String(deck.planFile || "")),
      outPptx: path.join(deckOut, `${name}.ir-component-replaced.pptx`),
      reportOut: path.join(deckOut, `${name}.ir-component-apply-report.json`),
      objectAuditOut: path.join(deckOut, `${name}.ir-component-object-audit.json`),
      expectedOperations: Number(deck.operationCount || 0)
    };
  }).map((job) => {
    if (!job.planFile || !fs.existsSync(job.planFile)) {
      throw new Error(`Apply plan was not found for ${job.deck || "deck"}: ${job.planFile}`);
    }
    return job;
  });
}

function summarizeJob(job, result, elapsedMs) {
  const report = result.report || {};
  const summary = report.summary || {};
  const operations = Array.isArray(report.operations) ? report.operations : [];
  const appliedCount = Number(summary.appliedCount || 0);
  const skippedCount = Number(summary.skippedCount || 0);
  return {
    deck: job.deck,
    planFile: job.planFile,
    inputPptx: report.sourcePptx || job.pptx,
    outputPptx: result.outFile || job.outPptx,
    reportOut: job.reportOut,
    status: appliedCount > 0 ? "applied" : skippedCount > 0 ? "skipped" : "no_replacements",
    elapsedMs,
    expectedOperations: job.expectedOperations,
    operationCount: Number(summary.operationCount || operations.length || 0),
    appliedCount,
    skippedCount,
    removedShapeCount: Number(summary.removedShapeCount || 0),
    clonedShapeCount: Number(summary.clonedShapeCount || 0),
    operations
  };
}

function attachObjectAudit(summary, job, args) {
  const objectAuditRunner = typeof args.objectAuditRunner === "function"
    ? args.objectAuditRunner
    : runComponentIrReplacementObjectAudit;
  const audit = objectAuditRunner({
    before: summary.inputPptx || job.pptx,
    after: summary.outputPptx || job.outPptx,
    plan: job.planFile,
    out: job.objectAuditOut,
    minPictureReduction: args.minObjectPictureReduction,
    minNativeIncrease: args.minObjectNativeIncrease
  });
  return {
    ...summary,
    objectAuditOut: job.objectAuditOut,
    objectAudit: summarizeObjectAudit(audit),
    status: audit.passed ? summary.status : "failed"
  };
}

function summarizeObjectAudit(audit = {}) {
  return {
    passed: audit.passed === true,
    targetSlideCount: Number(audit.targetSlideCount || 0),
    totals: audit.totals || {},
    findings: Array.isArray(audit.findings) ? audit.findings : []
  };
}

function summarizeResults(results = []) {
  return {
    decks: results.length,
    appliedDecks: results.filter((item) => item.status === "applied").length,
    skippedDecks: results.filter((item) => item.status === "skipped").length,
    failedDecks: results.filter((item) => item.status === "failed").length,
    operationCount: results.reduce((sum, item) => sum + Number(item.operationCount || 0), 0),
    expectedOperations: results.reduce((sum, item) => sum + Number(item.expectedOperations || 0), 0),
    appliedCount: results.reduce((sum, item) => sum + Number(item.appliedCount || 0), 0),
    skippedCount: results.reduce((sum, item) => sum + Number(item.skippedCount || 0), 0),
    removedShapeCount: results.reduce((sum, item) => sum + Number(item.removedShapeCount || 0), 0),
    clonedShapeCount: results.reduce((sum, item) => sum + Number(item.clonedShapeCount || 0), 0),
    objectAuditDecks: results.filter((item) => item.objectAudit).length,
    objectAuditPassedDecks: results.filter((item) => item.objectAudit?.passed === true).length,
    objectAuditFailedDecks: results.filter((item) => item.objectAudit && item.objectAudit.passed !== true).length,
    objectAuditPictureReduction: results.reduce((sum, item) => {
      return sum + Number(item.objectAudit?.totals?.pictureReduction || 0);
    }, 0),
    objectAuditNativeIncrease: results.reduce((sum, item) => {
      return sum + Number(item.objectAudit?.totals?.nativeIncrease || 0);
    }, 0),
    canApplyAll: results.length > 0
      && results.every((item) => item.status !== "failed" && item.skippedCount === 0)
  };
}

function sanitizeError(error) {
  return {
    message: String(error?.message || error || "unknown error").slice(0, 1000)
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(file, payload) {
  const out = path.resolve(String(file));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function normalizeNonNegativeInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function normalizeOptionalNonNegativeNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function safeFileStem(value) {
  return safeString(value)
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "deck";
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const report = await runComponentIrReplacementApplyBatch(args);
    console.log(JSON.stringify({
      ...report.totals,
      reportFile: report.reportFile,
      applyQualityGate: report.applyQualityGate.status,
      applyQualityGateFile: report.applyQualityGateFile,
      objectAuditDecks: report.totals.objectAuditDecks,
      objectAuditFailedDecks: report.totals.objectAuditFailedDecks
    }, null, 2));
    if (report.totals.failedDecks > 0 || report.applyQualityGate.status !== "passed") process.exitCode = 1;
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  buildJobsFromManifest,
  parseArgs,
  runComponentIrReplacementApplyBatch,
  summarizeJob,
  summarizeResults,
  attachObjectAudit
};
