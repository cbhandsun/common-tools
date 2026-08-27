"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const args = {
    batchReport: "",
    out: ""
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--batch-report" || arg === "--report") && next) {
      args.batchReport = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else {
      throw new Error(`Unknown component-replacement-sample-gap-report argument: ${arg}`);
    }
  }
  if (!args.batchReport) throw new Error("--batch-report is required.");
  return args;
}

function buildComponentReplacementSampleGapReport(options = {}) {
  const batchReportFile = path.resolve(String(options.batchReport || ""));
  if (!fs.existsSync(batchReportFile)) throw new Error(`Batch report was not found: ${batchReportFile}`);
  const batchReport = readJson(batchReportFile);
  const gaps = collectSampleGaps(batchReport);
  const report = {
    provider: "component-replacement-sample-gap-report-v1",
    createdAt: new Date().toISOString(),
    batchReport: batchReportFile,
    sourceTotals: batchReport.totals || null,
    totals: {
      missingComponents: gaps.length,
      affectedFiles: unique(gaps.flatMap((gap) => gap.affectedFiles.map((file) => file.inputPptx))).length,
      totalAnchorCount: gaps.reduce((sum, gap) => sum + gap.totalAnchorCount, 0),
      canApplyAll: gaps.length === 0 && batchReport?.totals?.failed === 0
    },
    gaps
  };
  if (options.out) {
    const out = path.resolve(String(options.out));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  return report;
}

function collectSampleGaps(batchReport) {
  const byKey = new Map();
  for (const result of Array.isArray(batchReport?.results) ? batchReport.results : []) {
    if (!result?.planOut || !fs.existsSync(result.planOut)) continue;
    const plan = readJson(result.planOut);
    for (const operation of Array.isArray(plan?.operations) ? plan.operations : []) {
      if (String(operation?.status || operation?.Status || "").toLowerCase() !== "missing_sample") continue;
      const provider = operation.provider || operation.Provider || "";
      const componentId = operation.componentId || operation.ComponentId || "";
      const kind = operation.kind || operation.Kind || "component";
      const key = [provider, kind, componentId].join(":");
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          provider,
          kind,
          componentId,
          title: operation.title || operation.Title || operation.nextAction?.requiredSample?.title || null,
          targetMotifs: sanitizeStringArray(operation.targetMotifs || operation.TargetMotifs || operation.nextAction?.requiredSample?.targetMotifs),
          searchKeywords: sanitizeStringArray(operation.nextAction?.requiredSample?.searchKeywords),
          tier: operation.tier || operation.Tier || null,
          maxScore: Number(operation.score || operation.Score || 0) || null,
          totalAnchorCount: 0,
          affectedFiles: [],
          nextAction: operation.nextAction || operation.NextAction || null
        });
      }
      const gap = byKey.get(key);
      gap.totalAnchorCount += Number(operation.anchorCount || operation.AnchorCount || 0);
      const score = Number(operation.score || operation.Score || 0);
      if (Number.isFinite(score) && (gap.maxScore === null || score > gap.maxScore)) gap.maxScore = score;
      if (!gap.title && (operation.title || operation.Title)) gap.title = operation.title || operation.Title;
      gap.targetMotifs = unique([...gap.targetMotifs, ...sanitizeStringArray(operation.targetMotifs || operation.TargetMotifs)]);
      gap.searchKeywords = unique([
        ...gap.searchKeywords,
        ...sanitizeStringArray(operation.nextAction?.requiredSample?.searchKeywords)
      ]);
      gap.affectedFiles.push({
        inputPptx: result.inputPptx || plan.pptx || null,
        planOut: result.planOut,
        reportOut: result.reportOut || null,
        outputPptx: result.outputPptx || null,
        groupKey: operation.groupKey || operation.GroupKey || null,
        layer: operation.layer || operation.Layer || null,
        anchorCount: Number(operation.anchorCount || operation.AnchorCount || 0),
        slides: operation.slides || operation.Slides || []
      });
    }
  }
  return [...byKey.values()]
    .map((gap) => ({
      ...gap,
      affectedFileCount: unique(gap.affectedFiles.map((file) => file.inputPptx)).length,
      affectedFiles: gap.affectedFiles.sort((a, b) => String(a.inputPptx).localeCompare(String(b.inputPptx)))
    }))
    .sort((a, b) => b.affectedFileCount - a.affectedFileCount || b.totalAnchorCount - a.totalAnchorCount || a.key.localeCompare(b.key));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8"));
}

function sanitizeStringArray(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").replace(/[\u0000-\u001F\u007F]/g, "_").trim().slice(0, 160))
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const report = buildComponentReplacementSampleGapReport(args);
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildComponentReplacementSampleGapReport,
  collectSampleGaps,
  parseArgs
};
