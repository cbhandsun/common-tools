#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PROVIDER = "component-richness-acceptance-report-v1";
const DEFAULT_OUT = path.join("runs", "component-richness-acceptance-report.json");
const DEFAULT_COVERAGE_MATRIX = path.join("runs", "component-assets-coverage-matrix.json");
const DEFAULT_REAL_PPTX_MATRIX = path.join("runs", "component-assets-regression-matrix.json");
const DEFAULT_IMAGE_RECALL_MATRIX = path.join("runs", "image-to-editable-component-recall-matrix.json");
const DEFAULT_IMAGE_RECALL_CORPUS = path.join("runs", "image-to-editable-component-recall", "corpus-plan.json");
const DEFAULT_ADMISSION_REPORT = path.join("runs", "component-asset-admission-gate.json");
const MAX_ROWS = 128;

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = buildComponentRichnessAcceptanceReport(args);
  ensureDir(path.dirname(report.reportFile));
  fs.writeFileSync(report.reportFile, `${JSON.stringify(stripRuntimeOnlyFields(report), null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    passed: report.passed,
    gateReasons: report.gateReasons,
    evidenceSources: Object.fromEntries(Object.entries(report.evidenceSources).map(([name, source]) => [name, source.status])),
    reportFile: report.reportFile
  }, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

function parseArgs(argv = []) {
  const args = {
    coverageMatrix: DEFAULT_COVERAGE_MATRIX,
    realPptxMatrix: DEFAULT_REAL_PPTX_MATRIX,
    imageRecallMatrix: DEFAULT_IMAGE_RECALL_MATRIX,
    imageRecallCorpus: DEFAULT_IMAGE_RECALL_CORPUS,
    admissionReport: DEFAULT_ADMISSION_REPORT,
    out: DEFAULT_OUT,
    requireCoverageMatrix: false,
    requireImageRecall: false,
    requireRealPptxRegression: false,
    requireAssetAdmission: false,
    maxCriticalComponentFamilyBacklogItems: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--coverage-matrix" && next) {
      args.coverageMatrix = next;
      index += 1;
    } else if (arg === "--real-pptx-matrix" && next) {
      args.realPptxMatrix = next;
      index += 1;
    } else if (arg === "--image-recall-matrix" && next) {
      args.imageRecallMatrix = next;
      index += 1;
    } else if (arg === "--image-recall-corpus" && next) {
      args.imageRecallCorpus = next;
      index += 1;
    } else if (arg === "--admission-report" && next) {
      args.admissionReport = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--require-coverage-matrix") {
      args.requireCoverageMatrix = true;
    } else if (arg === "--require-image-recall") {
      args.requireImageRecall = true;
    } else if (arg === "--require-real-pptx-regression") {
      args.requireRealPptxRegression = true;
    } else if (arg === "--require-asset-admission") {
      args.requireAssetAdmission = true;
    } else if (arg === "--max-critical-component-family-backlog-items" && next) {
      args.maxCriticalComponentFamilyBacklogItems = optionalNonNegativeInteger(next);
      index += 1;
    } else {
      throw new Error(`Unknown component richness acceptance argument: ${arg}`);
    }
  }
  return args;
}

function buildComponentRichnessAcceptanceReport(options = {}) {
  const coverageMatrix = readOptionalJson(options.coverageMatrix || DEFAULT_COVERAGE_MATRIX);
  const realPptxMatrix = readOptionalJson(options.realPptxMatrix || DEFAULT_REAL_PPTX_MATRIX);
  const imageRecallMatrix = readOptionalJson(options.imageRecallMatrix || DEFAULT_IMAGE_RECALL_MATRIX);
  const imageRecallCorpus = readOptionalJson(options.imageRecallCorpus || DEFAULT_IMAGE_RECALL_CORPUS);
  const admissionReport = readOptionalJson(options.admissionReport || DEFAULT_ADMISSION_REPORT);
  const evidenceSources = {
    coverageMatrix: summarizeCoverageMatrixSource(coverageMatrix),
    realPptxMatrix: summarizeRealPptxMatrixSource(realPptxMatrix),
    imageRecallMatrix: summarizeImageRecallMatrixSource(imageRecallMatrix),
    imageRecallCorpus: summarizeImageRecallCorpusSource(imageRecallCorpus),
    assetAdmission: summarizeAssetAdmissionSource(admissionReport)
  };
  const componentFamilyBacklog = [
    ...sourceRows(evidenceSources.coverageMatrix.componentFamilyBacklog, "coverageMatrix"),
    ...sourceRows(evidenceSources.realPptxMatrix.componentFamilyBacklog, "realPptxMatrix"),
    ...sourceRows(evidenceSources.imageRecallMatrix.componentFamilyBacklog, "imageRecallMatrix")
  ].slice(0, MAX_ROWS);
  const componentFamilyActionPlan = [
    ...sourceRows(evidenceSources.coverageMatrix.componentFamilyActionPlan, "coverageMatrix"),
    ...sourceRows(evidenceSources.realPptxMatrix.componentFamilyActionPlan, "realPptxMatrix"),
    ...sourceRows(evidenceSources.imageRecallMatrix.componentFamilyActionPlan, "imageRecallMatrix")
  ].slice(0, MAX_ROWS);
  const criticalComponentFamilyBacklogItems = countCriticalBacklogItems(componentFamilyBacklog);
  const maxCriticalComponentFamilyBacklogItems = optionalNonNegativeInteger(options.maxCriticalComponentFamilyBacklogItems);
  const gateReasons = [];
  collectSourceGateReasons(gateReasons, "coverage-matrix", evidenceSources.coverageMatrix, options.requireCoverageMatrix === true);
  collectSourceGateReasons(gateReasons, "real-pptx-matrix", evidenceSources.realPptxMatrix, options.requireRealPptxRegression === true);
  collectSourceGateReasons(gateReasons, "image-recall-matrix", evidenceSources.imageRecallMatrix, false);
  collectSourceGateReasons(gateReasons, "image-recall-corpus", evidenceSources.imageRecallCorpus, false);
  collectSourceGateReasons(gateReasons, "asset-admission", evidenceSources.assetAdmission, options.requireAssetAdmission === true);
  if (options.requireImageRecall === true && !hasPassingImageRecallEvidence(evidenceSources)) {
    gateReasons.push(evidenceSources.imageRecallMatrix.status === "provided" ? "image-recall-matrix-not-passing" : "image-recall-evidence-not-provided");
  }
  if (options.requireRealPptxRegression === true && evidenceSources.realPptxMatrix.componentFamilyRegressionCases.length === 0) {
    gateReasons.push("real-pptx-regression-cases-missing");
  }
  if (maxCriticalComponentFamilyBacklogItems !== null && criticalComponentFamilyBacklogItems > maxCriticalComponentFamilyBacklogItems) {
    gateReasons.push("critical-component-family-backlog-limit-exceeded");
  }
  const reportFile = path.resolve(String(options.out || DEFAULT_OUT));
  return {
    provider: PROVIDER,
    generatedAt: new Date().toISOString(),
    reportFile,
    passed: gateReasons.length === 0,
    gateReasons,
    thresholds: {
      requireCoverageMatrix: options.requireCoverageMatrix === true,
      requireImageRecall: options.requireImageRecall === true,
      requireRealPptxRegression: options.requireRealPptxRegression === true,
      requireAssetAdmission: options.requireAssetAdmission === true,
      maxCriticalComponentFamilyBacklogItems
    },
    summary: {
      providedEvidenceSources: Object.values(evidenceSources).filter((source) => source.status === "provided").length,
      failedEvidenceSources: Object.values(evidenceSources).filter((source) => source.passed === false).length,
      componentFamilyBacklogItems: componentFamilyBacklog.length,
      criticalComponentFamilyBacklogItems,
      componentFamilyActionItems: componentFamilyActionPlan.length,
      componentFamilyRegressionCases: evidenceSources.realPptxMatrix.componentFamilyRegressionCases.length,
      imageRecallFamilyRows: evidenceSources.imageRecallMatrix.imageComponentFamilies.length,
      imageRecallCorpusCases: evidenceSources.imageRecallCorpus.cases.length,
      componentFamilyAdmissionPlanItems: evidenceSources.assetAdmission.componentFamilyAdmissionPlan.length
    },
    componentFamilyBacklog,
    componentFamilyActionPlan,
    componentFamilyAdmissionPlan: evidenceSources.assetAdmission.componentFamilyAdmissionPlan,
    componentFamilyRegressionCases: evidenceSources.realPptxMatrix.componentFamilyRegressionCases,
    imageRecall: {
      matrixFamilies: evidenceSources.imageRecallMatrix.imageComponentFamilies,
      corpusCases: evidenceSources.imageRecallCorpus.cases
    },
    evidenceSources
  };
}

function summarizeCoverageMatrixSource(input) {
  const matrix = input.json || {};
  const totals = matrix.totals || {};
  return {
    status: input.status,
    file: input.file,
    passed: input.status === "provided" ? booleanOrNull(matrix.passed) : null,
    decks: nonNegativeNumber(totals.uniqueDecks ?? totals.decks),
    componentFamilyAppliedTypes: nonNegativeNumber(totals.componentFamilyAppliedTypes),
    componentFamilyBacklog: boundedRows(totals.componentFamilyBacklog),
    componentFamilyActionPlan: boundedRows(totals.componentFamilyActionPlan)
  };
}

function summarizeRealPptxMatrixSource(input) {
  const matrix = input.json || {};
  const totals = matrix.totals || {};
  return {
    status: input.status,
    file: input.file,
    passed: input.status === "provided" ? booleanOrNull(matrix.passed) : null,
    decks: nonNegativeNumber(totals.uniqueDecks ?? totals.decks),
    componentFamilyAppliedTypes: nonNegativeNumber(totals.componentFamilyAppliedTypes),
    componentFamilyBacklog: boundedRows(totals.componentFamilyBacklog),
    componentFamilyActionPlan: boundedRows(totals.componentFamilyActionPlan),
    componentFamilyRegressionCases: boundedRows(totals.componentFamilyRegressionCases)
  };
}

function summarizeImageRecallMatrixSource(input) {
  const matrix = input.json || {};
  const totals = matrix.totals || {};
  return {
    status: input.status,
    file: input.file,
    passed: input.status === "provided" ? booleanOrNull(matrix.passed) : null,
    imageComponentDetectedFamilyTypes: nonNegativeNumber(totals.imageComponentDetectedFamilyTypes),
    imageComponentMatchedFamilyTypes: nonNegativeNumber(totals.imageComponentMatchedFamilyTypes),
    imageComponentStrategyFamilyTypes: nonNegativeNumber(totals.imageComponentStrategyFamilyTypes),
    imageComponentMissingFamilyTypes: nonNegativeNumber(totals.imageComponentMissingFamilyTypes),
    imageComponentFamilies: boundedRows(totals.imageComponentFamilies),
    componentFamilyBacklog: boundedRows(totals.componentFamilyBacklog),
    componentFamilyActionPlan: boundedRows(totals.componentFamilyActionPlan)
  };
}

function summarizeImageRecallCorpusSource(input) {
  const plan = input.json || {};
  const cases = Array.isArray(plan.cases) ? plan.cases : [];
  return {
    status: input.status,
    file: input.file,
    passed: null,
    cases: cases.map((item) => ({
      id: safeText(item.id),
      title: safeText(item.title),
      expectedComponentFamilies: safeStringArray(item.expectedComponentFamilies),
      observedComponentFamilies: safeStringArray(item.observedComponentFamilies),
      missingExpectedComponentFamilies: safeStringArray(item.missingExpectedComponentFamilies),
      observedComponentFamilyEvidence: boundedRows(item.observedComponentFamilyEvidence)
    })).slice(0, MAX_ROWS)
  };
}

function summarizeAssetAdmissionSource(input) {
  const report = input.json || {};
  const summary = report.summary || {};
  return {
    status: input.status,
    file: input.file,
    passed: input.status === "provided" ? booleanOrNull(report.passed) : null,
    summary: {
      candidates: nonNegativeNumber(summary.candidates),
      admitted: nonNegativeNumber(summary.admitted),
      rejected: nonNegativeNumber(summary.rejected),
      componentFamilyTypes: nonNegativeNumber(summary.componentFamilyTypes),
      componentFamilyCounts: safeNumberMap(summary.componentFamilyCounts),
      missingRequiredComponentFamilies: safeStringArray(summary.missingRequiredComponentFamilies)
    },
    componentFamilyAdmissionPlan: boundedRows(report.componentFamilyAdmissionPlan)
  };
}

function collectSourceGateReasons(reasons, label, source, required) {
  if (required && source.status !== "provided") reasons.push(`${label}-not-provided`);
  if (required && source.status === "provided" && source.passed !== true) reasons.push(`${label}-not-passing`);
  if (!required && source.status === "provided" && source.passed === false) reasons.push(`${label}-failed`);
}

function hasPassingImageRecallEvidence(sources) {
  return sources.imageRecallMatrix.status === "provided" && sources.imageRecallMatrix.passed === true;
}

function sourceRows(rows = [], source) {
  return boundedRows(rows).map((row) => ({ ...row, source }));
}

function countCriticalBacklogItems(rows = []) {
  return rows.filter((item) => safeText(item.priority) === "critical").length;
}

function readOptionalJson(file) {
  const resolved = path.resolve(String(file || ""));
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile() || stat.size <= 0) return { status: "not-provided", file: relativePath(resolved), json: null };
    return { status: "provided", file: relativePath(resolved), json: readJson(resolved) };
  } catch {
    return { status: "not-provided", file: relativePath(resolved), json: null };
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
}

function boundedRows(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => sanitizeObject(item))
    .slice(0, MAX_ROWS);
}

function sanitizeObject(value, depth = 0) {
  const out = {};
  if (depth > 4) return out;
  for (const [key, raw] of Object.entries(value || {})) {
    const safeKey = safeText(key);
    if (!safeKey) continue;
    if (Array.isArray(raw)) {
      out[safeKey] = raw.slice(0, MAX_ROWS).map((item) => sanitizeValue(item, depth + 1));
    } else {
      out[safeKey] = sanitizeValue(raw, depth + 1);
    }
  }
  return out;
}

function sanitizeValue(value, depth) {
  if (typeof value === "string") return safeText(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, MAX_ROWS).map((item) => sanitizeValue(item, depth + 1));
  if (value && typeof value === "object" && depth <= 4) return sanitizeObject(value, depth);
  return null;
}

function safeStringArray(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => safeText(item))
    .filter(Boolean)
    .slice(0, MAX_ROWS);
}

function safeNumberMap(value) {
  const out = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [key, raw] of Object.entries(value)) {
    const name = safeText(key);
    const number = nonNegativeNumber(raw);
    if (name && number > 0) out[name] = number;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])));
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function optionalNonNegativeInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function booleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function safeText(value) {
  let text = "";
  const raw = String(value ?? "");
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index);
    if (code > 0x1f && code !== 0x7f) text += raw[index];
  }
  return text.trim().slice(0, 500);
}

function relativePath(file) {
  const relative = path.relative(process.cwd(), file).replace(/\\/gu, "/");
  return relative && !relative.startsWith("../") && relative !== ".." ? relative : path.basename(file);
}

function stripRuntimeOnlyFields(report = {}) {
  const copy = { ...report };
  delete copy.reportFile;
  return copy;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
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
  buildComponentRichnessAcceptanceReport,
  parseArgs,
  summarizeAssetAdmissionSource,
  summarizeCoverageMatrixSource,
  summarizeImageRecallCorpusSource,
  summarizeImageRecallMatrixSource,
  summarizeRealPptxMatrixSource
};
