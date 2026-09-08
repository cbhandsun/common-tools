#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const scriptFile = path.resolve(__dirname, "flow-e2e-smoke.js");
const outputRoot = path.resolve(process.cwd(), "runs", "flow-e2e-smoke-matrix");

const variants = [
  { id: "baseline", args: [], outDir: path.join(outputRoot, "baseline") },
  { id: "fontfit", args: ["--font-fit"], outDir: path.join(outputRoot, "fontfit") },
  { id: "stylefit", args: ["--container-style-fit"], outDir: path.join(outputRoot, "stylefit") },
  { id: "hifi", args: ["--font-fit", "--container-style-fit"], outDir: path.join(outputRoot, "hifi") }
];
const maxAttempts = 3;

function main() {
  ensureDir(path.join(outputRoot, "reports"));
  const results = variants.map(runVariant);
  const baseline = results.find((item) => item.id === "baseline") || null;
  const ranked = [...results].sort((a, b) => a.score - b.score);
  const report = {
    provider: "flow-e2e-matrix",
    generatedAt: new Date().toISOString(),
    baseline: baseline ? summarize(baseline) : null,
    bestVariant: ranked[0] ? summarize(ranked[0]) : null,
    variants: results.map((item) => ({
      ...summarize(item),
      deltaFromBaseline: baseline ? delta(item, baseline) : null
    }))
  };
  const reportFile = path.join(outputRoot, "reports", "flow-e2e-matrix.report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    reportFile,
    bestVariant: report.bestVariant?.id || null,
    baselineTextCoverage: report.baseline?.metrics?.textCoverage ?? null,
    bestTextCoverage: report.bestVariant?.metrics?.textCoverage ?? null
  }, null, 2)}\n`);
}

function runVariant(variant) {
  let lastFailure = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const run = spawnSync(process.execPath, [scriptFile, ...variant.args, "--out", variant.outDir], {
      cwd: process.cwd(),
      windowsHide: true,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    });
    if (run.status === 0) {
      const summaryFile = path.join(variant.outDir, "reports", "flow-e2e-smoke.summary.json");
      const summary = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
      return {
        id: variant.id,
        args: variant.args,
        outDir: variant.outDir,
        summaryFile,
        summary,
        score: score(summary.metrics || {}),
        attempt
      };
    }
    lastFailure = run;
    if (attempt < maxAttempts) sleep(2500);
  }
  throw new Error(`flow-e2e-smoke variant "${variant.id}" failed after ${maxAttempts} attempts.\nSTDOUT:\n${lastFailure?.stdout || ""}\nSTDERR:\n${lastFailure?.stderr || ""}`);
}

function summarize(result) {
  const metrics = result.summary.metrics || {};
  return {
    id: result.id,
    args: result.args,
    outDir: result.outDir,
    summaryFile: result.summaryFile,
    passed: result.summary.passed === true,
    status: result.summary.status || null,
    score: result.score,
    metrics: {
      pixelDiffRatio: metrics.pixelDiffRatio ?? null,
      foregroundMissingRatio: metrics.foregroundMissingRatio ?? null,
      layoutMeanIoU: metrics.layoutMeanIoU ?? null,
      textCoverage: metrics.textCoverage ?? null,
      editableObjects: metrics.editableObjects ?? null,
      nonEditableObjects: metrics.nonEditableObjects ?? null
    },
    selectedFont: result.summary.fontFit?.selected || null,
    selectedContainerStyle: result.summary.containerStyleFit?.selected || null
  };
}

function delta(current, baseline) {
  return {
    score: round(current.score - baseline.score),
    pixelDiffRatio: metricDelta(current.summary.metrics?.pixelDiffRatio, baseline.summary.metrics?.pixelDiffRatio),
    foregroundMissingRatio: metricDelta(current.summary.metrics?.foregroundMissingRatio, baseline.summary.metrics?.foregroundMissingRatio),
    layoutMeanIoU: metricDelta(current.summary.metrics?.layoutMeanIoU, baseline.summary.metrics?.layoutMeanIoU),
    textCoverage: metricDelta(current.summary.metrics?.textCoverage, baseline.summary.metrics?.textCoverage)
  };
}

function score(metrics = {}) {
  const pixel = typeof metrics.pixelDiffRatio === "number" ? metrics.pixelDiffRatio : 1;
  const foreground = typeof metrics.foregroundMissingRatio === "number" ? metrics.foregroundMissingRatio : 1;
  const raw = typeof metrics.foregroundMissingRatioRaw === "number" ? metrics.foregroundMissingRatioRaw : foreground;
  return round(pixel + foreground * 0.8 + raw * 0.25);
}

function metricDelta(next, base) {
  if (typeof next !== "number" || typeof base !== "number") return null;
  return round(next - base);
}

function round(value) {
  return Math.round(value * 1000000) / 1000000;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

main();
