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

function parseArgs(argv) {
  const args = {
    input: "",
    manifest: "",
    inventory: "",
    out: path.join("runs", "component-replacement-apply-batch"),
    concurrency: 1,
    engine: "openxml",
    allowMissing: false,
    dryRun: false,
    failOnMissingSamples: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--input" || arg === "--pptx-root") && next) {
      args.input = next;
      index += 1;
    } else if (arg === "--manifest" && next) {
      args.manifest = next;
      index += 1;
    } else if ((arg === "--inventory" || arg === "--component-inventory") && next) {
      args.inventory = next;
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
    } else if (arg === "--fail-on-missing-samples") {
      args.failOnMissingSamples = true;
    } else {
      throw new Error(`Unknown component-replacement-apply-batch argument: ${arg}`);
    }
  }
  if (!args.input && !args.manifest) throw new Error("Either --input or --manifest is required.");
  if (!args.inventory) throw new Error("--inventory is required.");
  return args;
}

async function runComponentReplacementApplyBatch(options = {}) {
  const args = normalizeOptions(options);
  const jobs = buildBatchJobs(args);
  const concurrency = parseConcurrency(args.concurrency, 1);
  fs.mkdirSync(args.out, { recursive: true });
  const results = await runLimited(jobs, concurrency, async (job, index) => {
    const startedAt = Date.now();
    try {
      const result = await runComponentReplacementApply({
        pptx: job.pptx,
        inventory: args.inventory,
        out: job.outPptx,
        planOut: job.planOut,
        reportOut: job.reportOut,
        engine: args.engine,
        allowMissing: args.allowMissing,
        dryRun: args.dryRun,
        failOnMissingSamples: args.failOnMissingSamples,
        runner: args.runner,
        skillRoot: args.skillRoot
      });
      return summarizeJobResult(job, result, Date.now() - startedAt);
    } catch (error) {
      return {
        inputPptx: job.pptx,
        outputPptx: job.outPptx,
        planOut: job.planOut,
        reportOut: job.reportOut,
        status: "failed",
        elapsedMs: Date.now() - startedAt,
        error: sanitizeError(error)
      };
    }
  });
  const report = {
    provider: "component-replacement-apply-batch-v1",
    createdAt: new Date().toISOString(),
    input: args.input || null,
    manifest: args.manifest || null,
    inventory: args.inventory,
    out: args.out,
    concurrency,
    engine: args.engine,
    allowMissing: args.allowMissing,
    dryRun: args.dryRun,
    totals: summarizeBatchResults(results),
    results
  };
  const reportFile = path.join(args.out, "component-replacement-apply-batch-report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return {
    ...report,
    reportFile
  };
}

function normalizeOptions(options) {
  const args = {
    input: options.input ? path.resolve(String(options.input)) : "",
    manifest: options.manifest ? path.resolve(String(options.manifest)) : "",
    inventory: options.inventory ? path.resolve(String(options.inventory)) : "",
    out: path.resolve(String(options.out || path.join("runs", "component-replacement-apply-batch"))),
    concurrency: options.concurrency,
    engine: normalizeEngine(options.engine),
    allowMissing: options.allowMissing === true,
    dryRun: options.dryRun === true,
    failOnMissingSamples: options.failOnMissingSamples === true,
    runner: options.runner,
    skillRoot: options.skillRoot
  };
  if (!args.input && !args.manifest) throw new Error("Either input or manifest is required.");
  if (!args.inventory) throw new Error("inventory is required.");
  return args;
}

function normalizeEngine(value) {
  const engine = String(value || "openxml").trim().toLowerCase();
  if (engine !== "openxml" && engine !== "powerpoint") throw new Error(`Unsupported component replacement engine: ${value}`);
  return engine;
}

function buildBatchJobs(args) {
  const pptxFiles = args.manifest
    ? readManifestPptxFiles(args.manifest)
    : discoverPptxFiles(args.input);
  return pptxFiles.map((pptx) => {
    const stem = safeFileStem(path.basename(pptx, path.extname(pptx)));
    const deckOut = path.join(args.out, stem);
    return {
      pptx,
      outPptx: path.join(deckOut, `${stem}.component-replaced.pptx`),
      planOut: path.join(deckOut, `${stem}.component-replacement-apply-plan.json`),
      reportOut: path.join(deckOut, `${stem}.component-replacement-apply-report.json`)
    };
  });
}

function discoverPptxFiles(input) {
  const root = path.resolve(String(input || ""));
  if (!fs.existsSync(root)) throw new Error(`Input path was not found: ${root}`);
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    if (path.extname(root).toLowerCase() !== ".pptx") throw new Error(`Input file must be .pptx: ${root}`);
    return [root];
  }
  const files = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".pptx")
    .map((entry) => path.join(root, entry.name))
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0) throw new Error(`No .pptx files found in ${root}`);
  return files;
}

function readManifestPptxFiles(manifestFile) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const root = path.dirname(path.resolve(manifestFile));
  const items = Array.isArray(manifest?.pptxFiles)
    ? manifest.pptxFiles
    : Array.isArray(manifest?.files)
      ? manifest.files
      : Array.isArray(manifest?.jobs)
        ? manifest.jobs.map((job) => job.pptx || job.inputPptx || job.file)
        : [];
  const files = items
    .filter(Boolean)
    .map((item) => path.isAbsolute(String(item)) ? String(item) : path.resolve(root, String(item)));
  if (files.length === 0) throw new Error(`Manifest has no pptx files: ${manifestFile}`);
  for (const file of files) {
    if (!fs.existsSync(file)) throw new Error(`Manifest PPTX file was not found: ${file}`);
    if (path.extname(file).toLowerCase() !== ".pptx") throw new Error(`Manifest file must be .pptx: ${file}`);
  }
  return files;
}

function summarizeJobResult(job, result, elapsedMs) {
  const summary = result.report?.summary || {};
  const applied = Number(summary.appliedCount || 0);
  const skipped = Number(summary.skippedCount || 0);
  return {
    inputPptx: job.pptx,
    outputPptx: job.outPptx,
    planOut: job.planOut,
    reportOut: job.reportOut,
    status: applied > 0 ? "applied" : skipped > 0 ? "skipped" : "no_replacements",
    elapsedMs,
    appliedCount: applied,
    skippedCount: skipped,
    missingSample: hasMissingSample(result.report),
    removedShapeCount: Number(summary.removedShapeCount || 0),
    clonedShapeCount: Number(summary.clonedShapeCount || 0),
    generatedPlan: result.generatedPlan === true
  };
}

function hasMissingSample(report) {
  return Array.isArray(report?.operations)
    && report.operations.some((operation) => String(operation?.Reason || operation?.reason || "").includes("not_ready")
      || String(operation?.Status || operation?.status || "").toLowerCase() === "missing_sample");
}

function summarizeBatchResults(results) {
  return {
    files: results.length,
    appliedFiles: results.filter((item) => item.status === "applied").length,
    skippedFiles: results.filter((item) => item.status === "skipped").length,
    missingSampleFiles: results.filter((item) => item.missingSample === true).length,
    noReplacementFiles: results.filter((item) => item.status === "no_replacements").length,
    failed: results.filter((item) => item.status === "failed").length,
    appliedCount: results.reduce((sum, item) => sum + Number(item.appliedCount || 0), 0),
    skippedCount: results.reduce((sum, item) => sum + Number(item.skippedCount || 0), 0),
    removedShapeCount: results.reduce((sum, item) => sum + Number(item.removedShapeCount || 0), 0),
    clonedShapeCount: results.reduce((sum, item) => sum + Number(item.clonedShapeCount || 0), 0),
    canApplyAll: results.length > 0
      && results.every((item) => item.status !== "failed" && item.missingSample !== true)
  };
}

function safeFileStem(value) {
  return String(value || "deck")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "deck";
}

function sanitizeError(error) {
  return {
    message: String(error?.message || error || "unknown error").slice(0, 1000)
  };
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const report = await runComponentReplacementApplyBatch(args);
    console.log(JSON.stringify({
      ...report.totals,
      reportFile: report.reportFile
    }, null, 2));
    if (report.totals.failed > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildBatchJobs,
  discoverPptxFiles,
  parseArgs,
  readManifestPptxFiles,
  runComponentReplacementApplyBatch,
  summarizeBatchResults
};
