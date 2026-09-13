"use strict";

const fs = require("node:fs");
const path = require("node:path");

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeDeliverySummary({ config, outputDir, pages, normalize, postprocess, pipeline }) {
  const compare = postprocess.compare || {};
  const delivery = postprocess.delivery || {};
  const compress = postprocess.compress || {};
  const failedChecks = (compare.checks || []).filter((check) => check.passed !== true);
  const requiredFailedChecks = failedChecks.filter((check) => check.required);
  const overallPassed = pipeline.ok === true
    && compare.passed === true
    && delivery.verified !== false
    && requiredFailedChecks.length === 0;
  const summary = {
    schemaVersion: 1,
    provider: "slideclone-delivery-summary",
    generatedAt: new Date().toISOString(),
    status: overallPassed ? "passed" : "failed",
    passed: overallPassed,
    pages: {
      count: pages.length,
      imageOnlyCount: countImageOnlyPages(normalize)
    },
    adapters: summarizeDeliveryAdapters(config),
    artifacts: {
      irFile: deliveryArtifactPath(postprocess.irFile, outputDir),
      pptxFile: deliveryArtifactPath(postprocess.pptx?.pptxFile, outputDir),
      deliveryPptxFile: deliveryArtifactPath(delivery.pptxFile, outputDir),
      compressedPptxFile: deliveryArtifactPath(compress.compressedPptxFile, outputDir),
      postprocessReport: "reports/postprocess-result.json",
      pipelineReport: "reports/pipeline-result.json",
      diffReport: deliveryArtifactPath(latestDiffReport(postprocess.iterations), outputDir),
      textCoverageReport: deliveryArtifactPath(compare.textCoverage?.reportFile, outputDir),
      compressionReport: deliveryArtifactPath(compress.reportFile, outputDir),
      renderedDeliveryPages: (delivery.verification?.renderedPages || [])
        .map((file) => deliveryArtifactPath(file, outputDir))
        .filter(Boolean)
    },
    metrics: {
      ...(compare.summary || {}),
      rasterImageAreaRatio: compare.editability?.rasterImageAreaRatio ?? null,
      editableObjects: compare.editability?.editableObjects ?? null,
      nonEditableObjects: compare.editability?.nonEditableObjects ?? null
    },
    checks: compare.checks || [],
    failedChecks,
    editability: compare.editability || null,
    nonEditableByReason: compare.editability?.nonEditableByReason || {},
    compression: summarizeCompression(compress),
    delivery: {
      source: delivery.source || null,
      verified: delivery.verified === true,
      renderDir: deliveryArtifactPath(delivery.verification?.renderDir, outputDir),
      renderedPageCount: Array.isArray(delivery.verification?.renderedPages)
        ? delivery.verification.renderedPages.length
        : 0
    },
    fontFit: postprocess.fontFit
      ? {
        selected: postprocess.fontFit.selected?.family || postprocess.fontFit.selected?.label || null,
        changed: postprocess.fontFit.changed === true,
        trials: (postprocess.fontFit.trials || []).map((trial) => ({
          family: trial.family || null,
          label: trial.label || null,
          role: trial.role || null,
          score: trial.score,
          pixelDiffRatio: trial.pixelDiffRatio,
          foregroundMissingRatio: trial.foregroundMissingRatio
        }))
      }
      : null,
    containerStyleFit: postprocess.containerStyleFit
      ? {
        selected: postprocess.containerStyleFit.selected?.label || null,
        changed: postprocess.containerStyleFit.changed === true,
        trials: (postprocess.containerStyleFit.trials || []).map((trial) => ({
          elementId: trial.elementId || null,
          kind: trial.kind || null,
          label: trial.label || null,
          score: trial.score,
          pixelDiffRatio: trial.pixelDiffRatio,
          foregroundMissingRatio: trial.foregroundMissingRatio
        }))
      }
      : null,
    warnings: collectDeliveryWarnings({ compare, delivery, compress, requiredFailedChecks })
  };
  const jsonFile = path.join(outputDir, "reports", "delivery-summary.json");
  const markdownFile = path.join(outputDir, "reports", "delivery-summary.md");
  writeJson(jsonFile, summary);
  fs.writeFileSync(markdownFile, renderDeliverySummaryMarkdown(summary), "utf8");
}

function summarizeDeliveryAdapters(config = {}) {
  const adapters = {};
  for (const [name, value] of Object.entries(config.adapters || {})) {
    adapters[name] = deliveryAdapterId(value);
  }
  adapters.textOcr = config.textOcr?.enabled === true ? deliveryAdapterId(config.textOcr.adapter) : null;
  return adapters;
}

function deliveryAdapterId(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  return path.basename(value.trim(), path.extname(value.trim())).slice(0, 128) || null;
}

function deliveryArtifactPath(value, outputDir) {
  if (typeof value !== "string" || !value.trim()) return null;
  const root = path.resolve(outputDir);
  const absolute = path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
  const relative = path.relative(root, absolute);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
}

function countImageOnlyPages(normalize) {
  let count = 0;
  for (const report of normalize?.reports || []) {
    count += Number(report.imageOnlySlideCount || 0);
  }
  if (count > 0) return count;
  return (normalize?.pageImages || []).filter((page) => page.imageOnly === true).length;
}

function latestDiffReport(iterations = []) {
  const last = iterations.length ? iterations[iterations.length - 1] : null;
  return last?.diff?.reportFile || null;
}

function summarizeCompression(compress = {}) {
  return {
    skipped: compress.skipped === true,
    originalBytes: compress.originalBytes ?? null,
    compressedBytes: compress.compressedBytes ?? null,
    savedBytes: compress.savedBytes ?? null,
    savedRatio: compress.savedRatio ?? null,
    mediaCount: compress.mediaCount ?? null,
    changedMediaCount: compress.changedMediaCount ?? null
  };
}

function collectDeliveryWarnings({ compare, delivery, compress, requiredFailedChecks }) {
  const warnings = [];
  if (compare.warning) warnings.push(compare.warning);
  if (requiredFailedChecks.length > 0) {
    warnings.push(`Required check(s) failed: ${requiredFailedChecks.map((check) => check.name).join(", ")}.`);
  }
  if (delivery.verified !== true) warnings.push("Delivery PPTX was not verified by render adapter.");
  if (compress.skipped === true) warnings.push("Compression was skipped.");
  return warnings;
}

function renderDeliverySummaryMarkdown(summary) {
  const lines = [];
  lines.push("# Slide Clone Delivery Summary");
  lines.push("");
  lines.push(`- Status: ${summary.passed ? "passed" : "failed"}`);
  lines.push(`- Pages: ${summary.pages.count} (image-only: ${summary.pages.imageOnlyCount})`);
  lines.push(`- Delivery PPTX: ${summary.artifacts.deliveryPptxFile || ""}`);
  lines.push(`- IR: ${summary.artifacts.irFile || ""}`);
  lines.push(`- Verified: ${summary.delivery.verified ? "true" : "false"}`);
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  lines.push("| Metric | Actual | Threshold | Required | Passed |");
  lines.push("| --- | ---: | ---: | --- | --- |");
  for (const check of summary.checks || []) {
    lines.push(`| ${check.name} | ${formatMetric(check.actual)} | ${formatMetric(check.threshold)} | ${Boolean(check.required)} | ${Boolean(check.passed)} |`);
  }
  lines.push("");
  lines.push("## Editability");
  lines.push("");
  lines.push(`- Editable objects: ${summary.metrics.editableObjects ?? ""}`);
  lines.push(`- Non-editable objects: ${summary.metrics.nonEditableObjects ?? ""}`);
  lines.push(`- Raster image area ratio: ${formatMetric(summary.metrics.rasterImageAreaRatio)}`);
  for (const [reason, count] of Object.entries(summary.nonEditableByReason || {})) {
    lines.push(`- ${reason}: ${count}`);
  }
  lines.push("");
  lines.push("## Compression");
  lines.push("");
  lines.push(`- Original bytes: ${summary.compression.originalBytes ?? ""}`);
  lines.push(`- Compressed bytes: ${summary.compression.compressedBytes ?? ""}`);
  lines.push(`- Saved bytes: ${summary.compression.savedBytes ?? ""}`);
  lines.push(`- Changed media: ${summary.compression.changedMediaCount ?? ""}/${summary.compression.mediaCount ?? ""}`);
  if ((summary.warnings || []).length > 0) {
    lines.push("");
    lines.push("## Warnings");
    lines.push("");
    for (const warning of summary.warnings) lines.push(`- ${warning}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function formatMetric(value) {
  if (typeof value !== "number") return "";
  return Math.round(value * 1000000) / 1000000;
}

module.exports = {
  collectDeliveryWarnings,
  countImageOnlyPages,
  deliveryAdapterId,
  deliveryArtifactPath,
  formatMetric,
  latestDiffReport,
  renderDeliverySummaryMarkdown,
  summarizeCompression,
  summarizeDeliveryAdapters,
  writeDeliverySummary
};
