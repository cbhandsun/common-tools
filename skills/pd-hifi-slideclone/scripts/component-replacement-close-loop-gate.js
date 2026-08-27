"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const args = {
    report: "",
    qualityMatrix: "",
    applyQualityGate: "",
    out: "",
    allowNeedsHarvest: false,
    allowDecisionGateFailure: false,
    minAppliedCount: 0
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--report" || arg === "--close-loop-report") && next) {
      args.report = next;
      index += 1;
    } else if ((arg === "--quality-matrix" || arg === "--regression-matrix") && next) {
      args.qualityMatrix = next;
      index += 1;
    } else if ((arg === "--apply-quality-gate" || arg === "--replacement-quality-gate") && next) {
      args.applyQualityGate = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--allow-needs-harvest") {
      args.allowNeedsHarvest = true;
    } else if (arg === "--allow-decision-gate-failure") {
      args.allowDecisionGateFailure = true;
    } else if (arg === "--min-applied-count" && next) {
      args.minAppliedCount = Number(next);
      index += 1;
    } else {
      throw new Error(`Unknown component-replacement-close-loop-gate argument: ${arg}`);
    }
  }
  if (!args.report) throw new Error("--report is required.");
  return args;
}

function evaluateCloseLoopGate(options = {}) {
  const reportFile = path.resolve(String(options.report || ""));
  if (!fs.existsSync(reportFile)) throw new Error(`Close-loop report was not found: ${reportFile}`);
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  const missingComponents = Number(report?.totals?.gaps?.missingComponents || 0);
  const failed = Number(report?.totals?.batch?.failed || 0);
  const appliedCount = Number(report?.totals?.batch?.appliedCount || 0);
  const protectedNonSemanticTargets = Number(
    report?.totals?.irPlan?.blockedNonSemanticTarget
    || report?.totals?.applyManifest?.blockedNonSemanticSourceOperations
    || 0
  );
  const protectedOnly = report?.status === "protected_non_semantic_targets"
    && protectedNonSemanticTargets > 0
    && missingComponents === 0
    && failed === 0;
  const canApplyAll = report?.totals?.batch?.canApplyAll === true
    || report?.totals?.gaps?.canApplyAll === true
    || protectedOnly;
  const minAppliedCount = normalizeNonNegativeInt(options.minAppliedCount, 0);
  const qualityMatrix = readOptionalQualityMatrix(options.qualityMatrix);
  const qualityMatrixProtectedNonSemanticSkips = Number(qualityMatrix?.totals?.protectedNonSemanticSkips || 0);
  const applyQualityGate = readOptionalApplyQualityGate(options.applyQualityGate);
  const decisionGate = normalizeEmbeddedDecisionGate(report);
  const findings = [];

  if (failed > 0) findings.push(`batch has ${failed} failed file(s)`);
  if (missingComponents > 0 && options.allowNeedsHarvest !== true) {
    findings.push(`missing ${missingComponents} component sample(s)`);
  }
  if (minAppliedCount > 0 && appliedCount < minAppliedCount) {
    findings.push(`appliedCount ${appliedCount} is below required ${minAppliedCount}`);
  }
  if (missingComponents === 0 && failed === 0 && !canApplyAll && minAppliedCount === 0) {
    findings.push("report does not prove canApplyAll");
  }
  if (decisionGate.present && decisionGate.status !== "passed" && options.allowDecisionGateFailure !== true) {
    const suffix = decisionGate.findings.length > 0 ? `: ${decisionGate.findings.join("; ")}` : "";
    findings.push(`graphic reconstruction decision gate ${decisionGate.status || "unknown"}${suffix}`);
  }
  if (qualityMatrix && qualityMatrix.passed !== true) {
    const failedDecks = Array.isArray(qualityMatrix.regression?.failedDecks)
      ? qualityMatrix.regression.failedDecks.filter(Boolean)
      : [];
    const suffix = failedDecks.length > 0 ? `: ${failedDecks.join(", ")}` : "";
    findings.push(`quality matrix failed${suffix}`);
  }
  if (qualityMatrix?.regression && qualityMatrix.regression.passed !== true) {
    const reasons = collectRegressionReasons(qualityMatrix.regression);
    const suffix = reasons.length > 0 ? `: ${reasons.join(", ")}` : "";
    findings.push(`quality regression failed${suffix}`);
  }
  if (applyQualityGate && applyQualityGate.status !== "passed") {
    const reasons = Array.isArray(applyQualityGate.findings)
      ? applyQualityGate.findings.map((item) => item?.message || item?.code || item).filter(Boolean)
      : [];
    const suffix = reasons.length > 0 ? `: ${reasons.join("; ")}` : "";
    findings.push(`component replacement apply quality gate ${applyQualityGate.status || "unknown"}${suffix}`);
  }

  const status = findings.length === 0 ? "passed" : "failed";
  const gate = {
    provider: "component-replacement-close-loop-gate-v1",
    createdAt: new Date().toISOString(),
    report: reportFile,
    status,
    allowNeedsHarvest: options.allowNeedsHarvest === true,
    allowDecisionGateFailure: options.allowDecisionGateFailure === true,
    minAppliedCount,
    qualityMatrix: qualityMatrix?.matrixFile || null,
    applyQualityGate: applyQualityGate?.gateFile || null,
    summary: {
      closeLoopStatus: report.status || null,
      failed,
      missingComponents,
      protectedNonSemanticTargets,
      qualityMatrixProtectedNonSemanticSkips,
      protectedOnly,
      appliedCount,
      canApplyAll,
      decisionGateStatus: decisionGate.present ? decisionGate.status : null,
      decisionGatePassed: decisionGate.present ? decisionGate.status === "passed" : null,
      qualityMatrixPassed: qualityMatrix ? qualityMatrix.passed === true : null,
      qualityRegressionPassed: qualityMatrix?.regression ? qualityMatrix.regression.passed === true : null,
      applyQualityGateStatus: applyQualityGate ? applyQualityGate.status : null,
      applyQualityGatePassed: applyQualityGate ? applyQualityGate.status === "passed" : null
    },
    findings
  };
  if (options.out) {
    const out = path.resolve(String(options.out));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(gate, null, 2)}\n`, "utf8");
  }
  return gate;
}

function readOptionalApplyQualityGate(value) {
  if (!value) return null;
  const gateFile = path.resolve(String(value));
  if (!fs.existsSync(gateFile)) throw new Error(`Apply quality gate was not found: ${gateFile}`);
  const gate = JSON.parse(fs.readFileSync(gateFile, "utf8").replace(/^\uFEFF/, ""));
  return {
    ...gate,
    gateFile
  };
}

function normalizeEmbeddedDecisionGate(report = {}) {
  const embedded = report?.decisionGate || null;
  const summary = report?.totals?.decisionGate || report?.summary?.decisionGate || null;
  const status = String(embedded?.status || summary?.status || summary || "").trim();
  const findings = [
    ...(Array.isArray(embedded?.gate?.findings) ? embedded.gate.findings : []),
    ...(Array.isArray(embedded?.findings) ? embedded.findings : []),
    ...(Array.isArray(summary?.findings) ? summary.findings : [])
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return {
    present: Boolean(embedded || summary || status),
    status,
    findings: [...new Set(findings)]
  };
}

function readOptionalQualityMatrix(value) {
  if (!value) return null;
  const matrixFile = path.resolve(String(value));
  if (!fs.existsSync(matrixFile)) throw new Error(`Quality matrix was not found: ${matrixFile}`);
  const matrix = JSON.parse(fs.readFileSync(matrixFile, "utf8").replace(/^\uFEFF/, ""));
  return {
    ...matrix,
    matrixFile
  };
}

function collectRegressionReasons(regression) {
  const reasons = new Set();
  for (const comparison of regression?.comparisons || []) {
    for (const reason of comparison?.reasons || []) {
      if (reason) reasons.add(String(reason));
    }
  }
  return [...reasons].sort((a, b) => a.localeCompare(b));
}

function normalizeNonNegativeInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const gate = evaluateCloseLoopGate(args);
    console.log(JSON.stringify(gate, null, 2));
    if (gate.status !== "passed") process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  collectRegressionReasons,
  evaluateCloseLoopGate,
  normalizeEmbeddedDecisionGate,
  parseArgs
};
