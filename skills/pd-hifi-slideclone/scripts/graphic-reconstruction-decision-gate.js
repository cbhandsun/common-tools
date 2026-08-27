"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const args = {
    report: "",
    out: "",
    maxActionableGaps: 0,
    minPluginTargets: 0,
    minProtectedCrops: 0,
    maxProtectedCropAreaRatio: 0.28,
    requireNoDefer: true,
    requireProtectedCropEvidence: true
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--report" || arg === "--decision-report") && next) {
      args.report = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--max-actionable-gaps" && next) {
      args.maxActionableGaps = Number(next);
      index += 1;
    } else if (arg === "--min-plugin-targets" && next) {
      args.minPluginTargets = Number(next);
      index += 1;
    } else if (arg === "--min-protected-crops" && next) {
      args.minProtectedCrops = Number(next);
      index += 1;
    } else if (arg === "--max-protected-crop-area-ratio" && next) {
      args.maxProtectedCropAreaRatio = Number(next);
      index += 1;
    } else if (arg === "--allow-defer") {
      args.requireNoDefer = false;
    } else if (arg === "--require-no-defer") {
      args.requireNoDefer = true;
    } else if (arg === "--allow-missing-protected-crop-evidence") {
      args.requireProtectedCropEvidence = false;
    } else if (arg === "--require-protected-crop-evidence") {
      args.requireProtectedCropEvidence = true;
    } else {
      throw new Error(`Unknown graphic-reconstruction-decision-gate argument: ${arg}`);
    }
  }
  if (!args.report) throw new Error("--report is required.");
  return args;
}

function evaluateDecisionGate(options = {}) {
  const reportInput = options.report;
  const reportFile = typeof reportInput === "string" ? path.resolve(reportInput) : "";
  if (typeof reportInput === "string" && !fs.existsSync(reportFile)) throw new Error(`Decision report was not found: ${reportFile}`);
  const report = typeof reportInput === "string" ? readJson(reportFile) : (reportInput && typeof reportInput === "object" ? reportInput : null);
  if (!report) throw new Error("--report is required.");
  const summary = report.summary || {};
  const decisions = Array.isArray(report.decisions) ? report.decisions : [];
  const maxActionableGaps = normalizeNonNegativeInt(options.maxActionableGaps, 0);
  const minPluginTargets = normalizeNonNegativeInt(options.minPluginTargets, 0);
  const minProtectedCrops = normalizeNonNegativeInt(options.minProtectedCrops, 0);
  const maxProtectedCropAreaRatio = normalizeRatio(options.maxProtectedCropAreaRatio, 0.28);
  const requireNoDefer = options.requireNoDefer !== false;
  const requireProtectedCropEvidence = options.requireProtectedCropEvidence !== false;
  const actionableGaps = Number(summary.actionableNativeGaps || 0);
  const pluginTargets = Number(summary.pluginTemplateTargets || 0);
  const protectedCrops = Number(summary.protectedCrops || 0);
  const deferredDecisions = decisions.filter((decision) => decision?.decision === "defer-low-confidence");
  const invalidDecisions = decisions.filter((decision) => !allowedDecisionKinds().has(String(decision?.decision || "")));
  const protectedCropDecisions = decisions.filter((decision) => decision?.decision === "preserve-local-crop");
  const oversizedProtectedCrops = protectedCropDecisions.filter((decision) => {
    const ratio = Number(decision?.areaRatio || 0);
    return ratio > maxProtectedCropAreaRatio && !isAllowedLargeProtectedCrop(decision);
  });
  const missingProtectedCropEvidence = protectedCropDecisions.filter((decision) => !hasProtectedCropEvidence(decision));
  const semanticProtectedCropsWithoutEvidence = protectedCropDecisions.filter((decision) => (
    isSemanticStructureCrop(decision) && !hasProtectedSemanticCropExemption(decision)
  ));
  const findings = [];

  if (report.ok !== true) findings.push("decision report did not pass its own ok flag");
  if (actionableGaps > maxActionableGaps) {
    findings.push(`actionableNativeGaps ${actionableGaps} exceeds allowed ${maxActionableGaps}`);
  }
  if (pluginTargets < minPluginTargets) {
    findings.push(`pluginTemplateTargets ${pluginTargets} is below required ${minPluginTargets}`);
  }
  if (protectedCrops < minProtectedCrops) {
    findings.push(`protectedCrops ${protectedCrops} is below required ${minProtectedCrops}`);
  }
  if (requireNoDefer && deferredDecisions.length > 0) {
    findings.push(`defer-low-confidence decisions remain: ${deferredDecisions.length}`);
  }
  if (oversizedProtectedCrops.length > 0) {
    findings.push(`oversized protected crops without screenshot/document justification: ${oversizedProtectedCrops.length}`);
  }
  if (requireProtectedCropEvidence && missingProtectedCropEvidence.length > 0) {
    findings.push(`protected crops missing explicit classifier evidence: ${missingProtectedCropEvidence.length}`);
  }
  if (semanticProtectedCropsWithoutEvidence.length > 0) {
    findings.push(`semantic protected crops missing asset/screenshot/decorative exemption: ${semanticProtectedCropsWithoutEvidence.length}`);
  }
  if (invalidDecisions.length > 0) {
    findings.push(`unknown decision kinds: ${uniqueStrings(invalidDecisions.map((decision) => decision.decision)).join(", ")}`);
  }

  const gate = {
    provider: "graphic-reconstruction-decision-gate-v1",
    createdAt: new Date().toISOString(),
    report: reportFile,
    status: findings.length === 0 ? "passed" : "failed",
    thresholds: {
      maxActionableGaps,
      minPluginTargets,
      minProtectedCrops,
      maxProtectedCropAreaRatio,
      requireNoDefer,
      requireProtectedCropEvidence
    },
    summary: {
      reportOk: report.ok === true,
      total: Number(summary.total || decisions.length || 0),
      actionableGaps,
      pluginTargets,
      protectedCrops,
      deferred: deferredDecisions.length,
      oversizedProtectedCrops: oversizedProtectedCrops.length,
      missingProtectedCropEvidence: missingProtectedCropEvidence.length,
      semanticProtectedCropsWithoutEvidence: semanticProtectedCropsWithoutEvidence.length,
      invalidDecisions: invalidDecisions.length,
      byDecision: summary.byDecision || {}
    },
    findings,
    examples: {
      oversizedProtectedCrops: summarizeDecisionExamples(oversizedProtectedCrops),
      missingProtectedCropEvidence: summarizeDecisionExamples(missingProtectedCropEvidence),
      semanticProtectedCropsWithoutEvidence: summarizeDecisionExamples(semanticProtectedCropsWithoutEvidence)
    }
  };
  if (options.out) {
    const out = path.resolve(String(options.out));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(gate, null, 2)}\n`, "utf8");
  }
  return gate;
}

function allowedDecisionKinds() {
  return new Set([
    "already-native-or-objectified",
    "native-rebuild-probe-covered",
    "harvest-or-apply-plugin-template",
    "preserve-local-crop",
    "rebuild-native-gap",
    "defer-low-confidence"
  ]);
}

function normalizeNonNegativeInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function normalizeRatio(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.min(1, number) : fallback;
}

function hasProtectedCropEvidence(decision = {}) {
  const reasons = Array.isArray(decision.reasons) ? decision.reasons : [];
  return Boolean(
    (safeString(decision.detector) || safeString(decision.expressionFamily))
    && (
      safeString(decision.expressionForm)
      || safeString(decision.expressionSubtype)
      || safeString(decision.expressionFamily)
      || safeString(decision.recommendedAction)
      || reasons.length > 0
    )
  );
}

function isAllowedLargeProtectedCrop(decision = {}) {
  const text = [
    decision.detector,
    decision.layerType,
    decision.expressionFamily,
    decision.expressionForm,
    decision.expressionSubtype,
    decision.recommendedAction
  ].map(safeString).join(" ").toLowerCase();
  return hasExplicitLargeFidelityCropExemption(decision)
    || /screenshot|screen-capture|ui-capture|product-screenshot|document|webpage|界面|截图|文档/.test(text)
    || /pictorial-asset|icon-or-illustration|visual-example|sample|example|图标|图示|示意图|样例|示例/.test(text)
    || /decorative|cover-decoration|cover-background|background|texture|brand|封面|装饰|背景/.test(text);
}

function isSemanticStructureCrop(decision = {}) {
  const text = protectedDecisionText(decision);
  return /complex-diagram|relationship-flow|linear-process-diagram|process-flow|workflow|flowchart|table-or-matrix|table-grid|matrix|grid|chart|graph|dashboard|timeline|topology|network|architecture|org-chart|mind-map|关系图|流程|工作流|矩阵|表格|图表|看板|时间线|拓扑|网络|架构|组织结构/.test(text);
}

function hasProtectedSemanticCropExemption(decision = {}) {
  const text = protectedDecisionText(decision);
  const reasons = Array.isArray(decision.reasons) ? decision.reasons.map(safeString).join(" ").toLowerCase() : "";
  return hasExplicitLargeFidelityCropExemption(decision)
    || /screenshot|screen-capture|ui-capture|product-screenshot|document|webpage|界面|截图|文档/.test(text)
    || /pictorial-asset|icon-or-illustration|visual-example|sample|example|图标|图示|示意图|样例|示例/.test(text)
    || /decorative|cover-decoration|cover-background|background|texture|brand|封面|装饰|背景/.test(text)
    || /expression-policy:standalone-visual-asset|pictorial-single-asset|asset-dominated|obvious-icon-illustration|explicit-standalone-visual-asset/.test(reasons);
}

function hasExplicitLargeFidelityCropExemption(decision = {}) {
  const exception = decision.fidelityException || {};
  return exception.approved === true
    && exception.preserveLocalCrop === true
    && safeString(exception.reason).length >= 24;
}

function protectedDecisionText(decision = {}) {
  return [
    decision.detector,
    decision.layerType,
    decision.expressionFamily,
    decision.expressionForm,
    decision.expressionSubtype,
    decision.recommendedAction,
    decision.expressionPolicy?.kind,
    decision.expressionPolicy?.minimumUnitPolicy,
    ...Array.isArray(decision.expressionPolicy?.reasons) ? decision.expressionPolicy.reasons : []
  ].map(safeString).join(" ").toLowerCase();
}

function summarizeDecisionExamples(decisions = []) {
  return decisions.slice(0, 10).map((decision) => ({
    slide: Number(decision.slide || 0),
    imageId: safeString(decision.imageId),
    detector: safeString(decision.detector),
    expressionFamily: safeString(decision.expressionFamily),
    expressionForm: safeString(decision.expressionForm),
    expressionSubtype: safeString(decision.expressionSubtype),
    areaRatio: Number(decision.areaRatio || 0)
  }));
}

function uniqueStrings(values = []) {
  return [...new Set(values.map(safeString).filter(Boolean))];
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8").replace(/^\uFEFF/, ""));
}

function main() {
  try {
    const args = parseArgs(process.argv);
    const gate = evaluateDecisionGate(args);
    console.log(JSON.stringify(gate, null, 2));
    if (gate.status !== "passed") process.exitCode = 1;
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  allowedDecisionKinds,
  evaluateDecisionGate,
  parseArgs,
  _private: {
    hasExplicitLargeFidelityCropExemption,
    isAllowedLargeProtectedCrop
  }
};
