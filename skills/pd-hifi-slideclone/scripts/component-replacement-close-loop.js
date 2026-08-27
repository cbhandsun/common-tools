"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  runComponentReplacementApplyBatch
} = require("./component-replacement-apply-batch");
const {
  buildComponentReplacementSampleGapReport
} = require("./component-replacement-sample-gap-report");
const {
  buildComponentReplacementHarvestQueue
} = require("./component-replacement-harvest-queue");
const {
  evaluateDecisionGate
} = require("./graphic-reconstruction-decision-gate");
const {
  auditGraphicReconstructionDecisions,
  renderDecisionAuditMarkdown
} = require("./graphic-reconstruction-decision-audit");
const {
  buildHarvestShortlist,
  renderHarvestShortlistMarkdown
} = require("./component-harvest-shortlist");
const {
  searchIrComponentCandidates
} = require("./component-candidate-search");

function parseArgs(argv) {
  const args = {
    input: "",
    manifest: "",
    inventory: "",
    out: path.join("runs", "component-replacement-close-loop"),
    concurrency: 1,
    engine: "openxml",
    allowMissing: true,
    failOnMissingSamples: false,
    decisionReport: "",
    decisionIr: "",
    decisionShortlist: "",
    decisionCandidates: "",
    decisionSearchCandidates: false,
    decisionCandidateDryRun: false,
    decisionCandidateSize: 6,
    decisionShortlistMaxActions: 12,
    decisionShortlistMaxActionsPerTask: 4,
    failOnDecisionGate: false,
    maxDecisionActionableGaps: 0,
    minDecisionPluginTargets: 0,
    minDecisionProtectedCrops: 0,
    allowDecisionDefer: false
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
    } else if (arg === "--disallow-missing") {
      args.allowMissing = false;
    } else if (arg === "--fail-on-missing-samples") {
      args.failOnMissingSamples = true;
    } else if ((arg === "--decision-report" || arg === "--graphic-decision-report") && next) {
      args.decisionReport = next;
      index += 1;
    } else if ((arg === "--decision-ir" || arg === "--graphic-decision-ir") && next) {
      args.decisionIr = next;
      index += 1;
    } else if ((arg === "--decision-shortlist" || arg === "--graphic-decision-shortlist") && next) {
      args.decisionShortlist = next;
      index += 1;
    } else if ((arg === "--decision-candidates" || arg === "--graphic-decision-candidates") && next) {
      args.decisionCandidates = next;
      index += 1;
    } else if (arg === "--decision-search-candidates") {
      args.decisionSearchCandidates = true;
    } else if (arg === "--decision-candidate-dry-run") {
      args.decisionCandidateDryRun = true;
    } else if (arg === "--decision-candidate-size" && next) {
      args.decisionCandidateSize = Number(next);
      index += 1;
    } else if (arg === "--decision-shortlist-max-actions" && next) {
      args.decisionShortlistMaxActions = Number(next);
      index += 1;
    } else if (arg === "--decision-shortlist-max-actions-per-task" && next) {
      args.decisionShortlistMaxActionsPerTask = Number(next);
      index += 1;
    } else if (arg === "--fail-on-decision-gate") {
      args.failOnDecisionGate = true;
    } else if (arg === "--max-decision-actionable-gaps" && next) {
      args.maxDecisionActionableGaps = Number(next);
      index += 1;
    } else if (arg === "--min-decision-plugin-targets" && next) {
      args.minDecisionPluginTargets = Number(next);
      index += 1;
    } else if (arg === "--min-decision-protected-crops" && next) {
      args.minDecisionProtectedCrops = Number(next);
      index += 1;
    } else if (arg === "--allow-decision-defer") {
      args.allowDecisionDefer = true;
    } else {
      throw new Error(`Unknown component-replacement-close-loop argument: ${arg}`);
    }
  }
  if (!args.input && !args.manifest) throw new Error("Either --input or --manifest is required.");
  if (!args.inventory) throw new Error("--inventory is required.");
  return args;
}

async function runComponentReplacementCloseLoop(options = {}) {
  const args = normalizeOptions(options);
  fs.mkdirSync(args.out, { recursive: true });
  const batchOut = path.join(args.out, "batch");
  const batchReport = await runComponentReplacementApplyBatch({
    input: args.input,
    manifest: args.manifest,
    inventory: args.inventory,
    engine: args.engine,
    out: batchOut,
    concurrency: args.concurrency,
    engine: args.engine,
    allowMissing: args.allowMissing,
    failOnMissingSamples: args.failOnMissingSamples,
    runner: args.runner,
    skillRoot: args.skillRoot
  });
  const gapReportFile = path.join(args.out, "component-replacement-sample-gap-report.json");
  const gapReport = buildComponentReplacementSampleGapReport({
    batchReport: batchReport.reportFile,
    out: gapReportFile
  });
  const harvestQueueFile = path.join(args.out, "component-replacement-harvest-queue.json");
  const harvestGuideFile = path.join(args.out, "component-replacement-harvest-queue.md");
  const harvestQueue = buildComponentReplacementHarvestQueue({
    gapReport: gapReportFile,
    out: harvestQueueFile,
    markdownOut: harvestGuideFile
  });
  const decisionGate = await runOptionalDecisionGate({
    ...args,
    generatedHarvestQueue: harvestQueueFile
  });
  const status = determineCloseLoopStatus(batchReport, gapReport);
  const report = {
    provider: "component-replacement-close-loop-v1",
    createdAt: new Date().toISOString(),
    input: args.input || null,
    manifest: args.manifest || null,
    inventory: args.inventory,
    out: args.out,
    status,
    artifacts: {
      batchReport: batchReport.reportFile,
      sampleGapReport: gapReportFile,
      harvestQueue: harvestQueueFile,
      harvestGuide: harvestGuideFile,
      ...(decisionGate?.candidateFile ? { decisionCandidates: decisionGate.candidateFile } : {}),
      ...(decisionGate?.shortlistFile ? { decisionShortlist: decisionGate.shortlistFile } : {}),
      ...(decisionGate?.shortlistGuide ? { decisionShortlistGuide: decisionGate.shortlistGuide } : {}),
      ...(decisionGate?.auditFile ? { decisionAudit: decisionGate.auditFile } : {}),
      ...(decisionGate?.auditGuide ? { decisionAuditGuide: decisionGate.auditGuide } : {}),
      ...(decisionGate ? { decisionGate: decisionGate.gateFile } : {})
    },
    totals: {
      batch: batchReport.totals,
      gaps: gapReport.totals,
      harvestQueue: harvestQueue.summary,
      ...(decisionGate ? { decisionGate: decisionGate.summary } : {})
    },
    ...(decisionGate ? { decisionGate } : {})
  };
  const reportFile = path.join(args.out, "component-replacement-close-loop-report.json");
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
    out: path.resolve(String(options.out || path.join("runs", "component-replacement-close-loop"))),
    concurrency: options.concurrency,
    engine: normalizeEngine(options.engine),
    allowMissing: options.allowMissing !== false,
    failOnMissingSamples: options.failOnMissingSamples === true,
    decisionReport: options.decisionReport ? path.resolve(String(options.decisionReport)) : "",
    decisionIr: options.decisionIr ? path.resolve(String(options.decisionIr)) : "",
    decisionShortlist: options.decisionShortlist ? path.resolve(String(options.decisionShortlist)) : "",
    decisionCandidates: options.decisionCandidates ? path.resolve(String(options.decisionCandidates)) : "",
    decisionSearchCandidates: options.decisionSearchCandidates === true,
    decisionCandidateDryRun: options.decisionCandidateDryRun === true,
    decisionCandidateSize: options.decisionCandidateSize,
    decisionShortlistMaxActions: options.decisionShortlistMaxActions,
    decisionShortlistMaxActionsPerTask: options.decisionShortlistMaxActionsPerTask,
    failOnDecisionGate: options.failOnDecisionGate === true,
    maxDecisionActionableGaps: options.maxDecisionActionableGaps,
    minDecisionPluginTargets: options.minDecisionPluginTargets,
    minDecisionProtectedCrops: options.minDecisionProtectedCrops,
    allowDecisionDefer: options.allowDecisionDefer === true,
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

async function runOptionalDecisionGate(args = {}) {
  const decisionReport = await ensureDecisionReport(args);
  if (!decisionReport) return null;
  const gateFile = path.join(args.out, "graphic-reconstruction-decision-gate.json");
  const gate = evaluateDecisionGate({
    report: decisionReport.reportFile,
    out: gateFile,
    maxActionableGaps: args.maxDecisionActionableGaps,
    minPluginTargets: args.minDecisionPluginTargets,
    minProtectedCrops: args.minDecisionProtectedCrops,
    requireNoDefer: args.allowDecisionDefer !== true
  });
  if (args.failOnDecisionGate && gate.status !== "passed") {
    const reason = gate.findings?.join("; ") || "decision gate failed";
    throw new Error(`Graphic reconstruction decision gate failed: ${reason}`);
  }
  return {
    ...(decisionReport.generated ? {
      ...(decisionReport.shortlist?.candidates?.generated ? {
        candidateFile: decisionReport.shortlist.candidates.reportFile
      } : {}),
      ...(decisionReport.shortlist?.generated ? {
        shortlistFile: decisionReport.shortlist.reportFile,
        shortlistGuide: decisionReport.shortlist.markdownFile
      } : {}),
      auditFile: decisionReport.reportFile,
      auditGuide: decisionReport.markdownFile
    } : {}),
    gateFile,
    status: gate.status,
    thresholds: gate.thresholds,
    summary: gate.summary,
    findings: gate.findings
  };
}

async function ensureDecisionReport(args = {}) {
  if (args.decisionReport) {
    return {
      generated: false,
      reportFile: args.decisionReport,
      markdownFile: ""
    };
  }
  if (!args.decisionIr) return null;
  const shortlist = await ensureDecisionShortlist(args);
  const auditFile = path.join(args.out, "graphic-reconstruction-decision-audit.json");
  const markdownFile = path.join(args.out, "graphic-reconstruction-decision-audit.md");
  const audit = auditGraphicReconstructionDecisions({
    ir: args.decisionIr,
    shortlist: shortlist?.reportFile || args.decisionShortlist
  });
  fs.mkdirSync(path.dirname(auditFile), { recursive: true });
  fs.writeFileSync(auditFile, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownFile, renderDecisionAuditMarkdown(audit), "utf8");
  return {
    generated: true,
    reportFile: auditFile,
    markdownFile,
    shortlist
  };
}

async function ensureDecisionShortlist(args = {}) {
  if (args.decisionShortlist) {
    return {
      generated: false,
      reportFile: args.decisionShortlist,
      markdownFile: ""
    };
  }
  const candidates = await ensureDecisionCandidates(args);
  const candidatesFile = candidates?.reportFile || args.decisionCandidates;
  if (!candidatesFile || !args.generatedHarvestQueue) return null;
  const shortlistFile = path.join(args.out, "component-harvest-shortlist.json");
  const markdownFile = path.join(args.out, "component-harvest-shortlist.md");
  const shortlist = buildHarvestShortlist({
    candidates: candidatesFile,
    queue: args.generatedHarvestQueue,
    maxActions: args.decisionShortlistMaxActions,
    maxActionsPerTask: args.decisionShortlistMaxActionsPerTask
  });
  fs.mkdirSync(path.dirname(shortlistFile), { recursive: true });
  fs.writeFileSync(shortlistFile, `${JSON.stringify(shortlist, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownFile, renderHarvestShortlistMarkdown(shortlist), "utf8");
  return {
    generated: true,
    reportFile: shortlistFile,
    markdownFile,
    candidates
  };
}

async function ensureDecisionCandidates(args = {}) {
  if (args.decisionCandidates) {
    return {
      generated: false,
      reportFile: args.decisionCandidates
    };
  }
  if (!args.decisionSearchCandidates || !args.decisionIr) return null;
  const candidateFile = path.join(args.out, "component-candidates.json");
  const report = await searchIrComponentCandidates({
    ir: args.decisionIr,
    size: normalizePositiveInt(args.decisionCandidateSize, 6),
    dryRun: args.decisionCandidateDryRun === true
  });
  fs.mkdirSync(path.dirname(candidateFile), { recursive: true });
  fs.writeFileSync(candidateFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return {
    generated: true,
    reportFile: candidateFile
  };
}

function normalizePositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function determineCloseLoopStatus(batchReport, gapReport) {
  if (Number(batchReport?.totals?.failed || 0) > 0) return "failed";
  if (Number(gapReport?.totals?.missingComponents || 0) > 0) return "needs_harvest";
  if (Number(batchReport?.totals?.appliedCount || 0) > 0) return "applied";
  return "ready_to_apply";
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const report = await runComponentReplacementCloseLoop(args);
    console.log(JSON.stringify({
      status: report.status,
      ...report.totals.batch,
      missingComponents: report.totals.gaps.missingComponents,
      harvestTasks: report.totals.harvestQueue.taskCount,
      decisionGate: report.decisionGate?.status || null,
      reportFile: report.reportFile
    }, null, 2));
    if (report.status === "failed") process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  determineCloseLoopStatus,
  ensureDecisionReport,
  ensureDecisionCandidates,
  ensureDecisionShortlist,
  parseArgs,
  runOptionalDecisionGate,
  runComponentReplacementCloseLoop
};
