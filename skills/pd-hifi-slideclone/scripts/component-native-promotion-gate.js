#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const baselineFile = requireFile(args.baseline || args["baseline-report"], "--baseline");
  const candidateFile = requireFile(args.candidate || args["candidate-report"], "--candidate");
  const outputFile = path.resolve(args.out || path.join("runs", "component-native-promotion-gate.json"));
  const baseline = readJson(baselineFile);
  const candidate = readJson(candidateFile);
  const decision = evaluatePromotion({
    baseline,
    candidate,
    thresholds: readThresholds(args)
  });
  const report = {
    provider: "component-native-promotion-gate-v1",
    generatedAt: new Date().toISOString(),
    baselineReport: path.resolve(baselineFile),
    candidateReport: path.resolve(candidateFile),
    decision
  };
  ensureDir(path.dirname(outputFile));
  fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ promoted: decision.promoted, reasons: decision.reasons, reportFile: outputFile }, null, 2)}\n`);
  if (!decision.promoted && isTruthy(args["fail-on-reject"])) process.exitCode = 1;
}

function evaluatePromotion({ baseline = {}, candidate = {}, thresholds = {} } = {}) {
  const base = qualitySummary(baseline);
  const next = qualitySummary(candidate);
  const deltas = {
    rejected: next.rejected - base.rejected,
    pixelDiffRatio: round(nullableDelta(next.pixelDiffRatio, base.pixelDiffRatio)),
    foregroundMissingRatio: round(nullableDelta(next.foregroundMissingRatio, base.foregroundMissingRatio)),
    editableObjectRatio: round(nullableDelta(next.editableObjectRatio, base.editableObjectRatio)),
    actionableEditableObjectRatio: round(nullableDelta(next.actionableEditableObjectRatio, base.actionableEditableObjectRatio)),
    nonEditableImages: next.nonEditableImages - base.nonEditableImages,
    componentTemplateCropReplacedImages: next.componentTemplateCropReplacedImages - base.componentTemplateCropReplacedImages,
    componentTemplateActionableRetainedImages: next.componentTemplateActionableRetainedImages - base.componentTemplateActionableRetainedImages
  };
  const reasons = [];
  if (next.rejected > 0) reasons.push("candidate-has-rejected-pages");
  if (next.rejected > base.rejected) reasons.push("candidate-increases-rejected-pages");
  if (Number.isFinite(deltas.pixelDiffRatio) && deltas.pixelDiffRatio > thresholds.maxPixelDiffRegression) {
    reasons.push("candidate-pixel-diff-regression");
  }
  if (Number.isFinite(deltas.foregroundMissingRatio) && deltas.foregroundMissingRatio > thresholds.maxForegroundMissingRegression) {
    reasons.push("candidate-foreground-missing-regression");
  }
  if (Number.isFinite(deltas.actionableEditableObjectRatio) && deltas.actionableEditableObjectRatio < -thresholds.maxEditableRatioRegression) {
    reasons.push("candidate-editability-regression");
  }
  const editabilityImproved = deltas.nonEditableImages < 0
    || deltas.componentTemplateCropReplacedImages > 0
    || deltas.componentTemplateActionableRetainedImages < 0
    || (Number.isFinite(deltas.editableObjectRatio) && deltas.editableObjectRatio > 0);
  if (!editabilityImproved) reasons.push("candidate-has-no-editability-gain");
  if (thresholds.requireActionableRetainedReduction === true
    && Math.abs(Math.min(0, deltas.componentTemplateActionableRetainedImages)) < thresholds.minActionableRetainedReduction) {
    reasons.push("candidate-does-not-reduce-actionable-retained-component-crops");
  }
  return {
    promoted: reasons.length === 0,
    reasons,
    baseline: base,
    candidate: next,
    deltas,
    thresholds
  };
}

function qualitySummary(report = {}) {
  const summary = report.summary || {};
  const metrics = report.deckMetrics || {};
  const editability = report.editabilityProfile || {};
  const strategy = report.componentStrategyProfile || {};
  const cropStatus = report.componentTemplateCropStatus || {};
  return {
    passed: report.passed === true || summary.passed === true,
    pages: numberOrZero(summary.pages || metrics.comparedPages),
    accepted: numberOrZero(summary.accepted),
    needsReview: numberOrZero(summary.needsReview),
    rejected: numberOrZero(summary.rejected),
    pixelDiffRatio: numberOrNull(metrics.pixelDiffRatio),
    foregroundMissingRatio: numberOrNull(metrics.foregroundMissingRatio),
    editableObjectRatio: numberOrNull(editability.editableObjectRatio),
    actionableEditableObjectRatio: numberOrNull(editability.actionableEditableObjectRatio),
    nonEditableImages: numberOrZero(editability.nonEditableImages),
    actionableNonEditableImages: numberOrZero(editability.actionableNonEditableImages),
    componentTemplateCropReplacedImages: numberOrZero(strategy.componentTemplateCropReplacedImages),
    componentTemplateCropPreservedImages: numberOrZero(strategy.componentTemplateCropPreservedImages),
    componentTemplateRetainedImages: numberOrZero(cropStatus.retainedImages),
    componentTemplateActionableRetainedImages: numberOrZero(cropStatus.actionableRetainedImages)
  };
}

function readThresholds(args = {}) {
  return {
    maxPixelDiffRegression: numberOrDefault(args["max-pixel-diff-regression"], 0.04),
    maxForegroundMissingRegression: numberOrDefault(args["max-foreground-missing-regression"], 0.08),
    maxEditableRatioRegression: numberOrDefault(args["max-editable-ratio-regression"], 0.01),
    requireActionableRetainedReduction: isTruthy(args["require-actionable-retained-reduction"]),
    minActionableRetainedReduction: numberOrDefault(args["min-actionable-retained-reduction"], 1)
  };
}

function parseArgs(argv = []) {
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

function requireFile(file, flagName) {
  if (!file || file === true) throw new Error(`${flagName} report is required`);
  const resolved = path.resolve(String(file));
  if (!fs.existsSync(resolved)) throw new Error(`${flagName} report not found: ${resolved}`);
  return resolved;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isTruthy(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function numberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nullableDelta(next, base) {
  return Number.isFinite(next) && Number.isFinite(base) ? next - base : null;
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  evaluatePromotion,
  parseArgs,
  qualitySummary,
  readThresholds
};
