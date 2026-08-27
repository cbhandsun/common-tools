"use strict";

const OUTPUT_FORMATS = new Set(["compact", "full"]);

function readQualityGateOutputFormat(args = {}) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new TypeError("quality gate arguments must be an object");
  const format = String(args["output-format"] || (args.verbose === "true" ? "full" : "compact")).trim().toLowerCase();
  if (!OUTPUT_FORMATS.has(format)) throw new TypeError("output-format must be compact or full");
  return format;
}

function buildQualityGateOutput(report = {}, options = {}) {
  if (!report || typeof report !== "object" || Array.isArray(report)) throw new TypeError("quality gate report must be an object");
  const format = String(options.format || "compact").toLowerCase();
  if (!OUTPUT_FORMATS.has(format)) throw new TypeError("quality gate output format must be compact or full");
  if (format === "full") return buildFullOutput(report);
  return {
    provider: "quality-gate-real-pptx",
    passed: report.gate?.passed === true,
    failures: safeStrings(report.gate?.failures),
    pages: {
      total: finiteNumber(report.summary?.pages),
      accepted: finiteNumber(report.summary?.accepted),
      needsReview: finiteNumber(report.summary?.needsReview),
      rejected: finiteNumber(report.summary?.rejected)
    },
    visual: {
      pixelDiffRatio: finiteOrNull(report.deckMetrics?.pixelDiffRatio),
      foregroundMissingRatio: finiteOrNull(report.deckMetrics?.foregroundMissingRatio),
      layoutMeanIoU: finiteOrNull(report.deckMetrics?.layoutMeanIoU)
    },
    editability: {
      editableObjects: finiteNumber(report.editabilityProfile?.editableObjects),
      nonEditableImages: finiteNumber(report.editabilityProfile?.nonEditableImages),
      actionableNonEditableImages: finiteNumber(report.editabilityProfile?.actionableNonEditableImages),
      editableObjectRatio: finiteOrNull(report.editabilityProfile?.editableObjectRatio)
    },
    reconstructionContract: {
      passed: report.reconstructionContract?.ok === true,
      errors: boundedLength(report.reconstructionContract?.errors),
      warnings: boundedLength(report.reconstructionContract?.warnings)
    },
    reconstructionBudget: {
      passed: report.reconstructionBudget?.passed === true,
      failedPages: finiteNumber(report.reconstructionBudget?.failedPageCount),
      maxResidualAreaRatio: finiteOrNull(report.reconstructionBudget?.maxResidualAreaRatio),
      maxLargestResidualAreaRatio: finiteOrNull(report.reconstructionBudget?.maxLargestResidualAreaRatio),
      reasonCounts: safeCountRecord(report.reconstructionBudget?.reasonCounts)
    },
    sourceMediaExclusion: {
      passed: report.sourceMediaExclusion?.passed === true,
      disallowedMatches: finiteNumber(report.sourceMediaExclusion?.disallowedMatches)
    },
    reportFile: typeof report.reportFile === "string" ? report.reportFile : null,
    contactSheet: report.contactSheet || null
  };
}

function buildFullOutput(report) {
  return {
    passed: report.gate?.passed === true,
    gate: report.gate || {},
    summary: report.summary || {},
    deckMetrics: report.deckMetrics || {},
    editabilityProfile: report.editabilityProfile || {},
    nativeComponentProfile: report.nativeComponentProfile || {},
    componentTemplateCropStatus: report.componentTemplateCropStatus || {},
    layerProfile: report.layerProfile || {},
    componentStrategyProfile: report.componentStrategyProfile || {},
    visualUnitDecisionProfile: report.visualUnitDecisionProfile || {},
    nativeObjectConflictProfile: report.nativeObjectConflictProfile || {},
    pptxTextLayerAudit: report.pptxTextLayerAudit || {},
    reconstructionContract: report.reconstructionContract || {},
    reconstructionBudget: report.reconstructionBudget || {},
    sourceMediaExclusion: report.sourceMediaExclusion || {},
    reportFile: report.reportFile || null,
    contactSheet: report.contactSheet || null
  };
}

function finiteNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedLength(value) {
  return Array.isArray(value) ? Math.min(value.length, 1000000) : 0;
}

function safeStrings(value) {
  return Array.isArray(value)
    ? value.slice(0, 100).map((item) => String(item || "").replace(/[^a-z0-9._-]/gi, "-").slice(0, 100)).filter(Boolean)
    : [];
}

function safeCountRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, count]) => [
    String(key).replace(/[^a-z0-9._-]/gi, "-").slice(0, 100),
    finiteNumber(count)
  ]));
}

module.exports = {
  OUTPUT_FORMATS,
  buildQualityGateOutput,
  readQualityGateOutputFormat
};
