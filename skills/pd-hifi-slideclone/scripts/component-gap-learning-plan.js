#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_WAVE = path.join("runs", "plugin-component-inventory", "isolated-collection", "learning-wave.json");
const DEFAULT_GAP_AUDIT = path.join("runs", "minimum-unit-gap-audit-latest.json");
const DEFAULT_OUT = path.join("runs", "plugin-component-inventory", "gap-learning-plan.json");

function parseArgs(argv = process.argv) {
  const args = {
    wave: DEFAULT_WAVE,
    gapAudit: DEFAULT_GAP_AUDIT,
    collectionRoot: "",
    adoptionReports: [],
    out: DEFAULT_OUT,
    markdownOut: "",
    maxTargets: 10
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--wave" && next) {
      args.wave = next;
      index += 1;
    } else if ((arg === "--gap-audit" || arg === "--audit") && next) {
      args.gapAudit = next;
      index += 1;
    } else if (arg === "--collection-root" && next) {
      args.collectionRoot = next;
      index += 1;
    } else if (arg === "--adoption-report" && next) {
      args.adoptionReports.push(next);
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if ((arg === "--markdown-out" || arg === "--guide-out") && next) {
      args.markdownOut = next;
      index += 1;
    } else if (arg === "--max-targets" && next) {
      args.maxTargets = Number(next);
      index += 1;
    } else {
      throw new Error(`Unknown component-gap-learning-plan argument: ${arg}`);
    }
  }
  args.maxTargets = boundedInteger(args.maxTargets, 1, 100, 10);
  return args;
}

function buildGapLearningPlan({ wave = {}, gapAudit = {}, fidelityByTask = {}, adoptionByTarget = {}, maxTargets = 10 } = {}) {
  const tasks = Array.isArray(wave.tasks) ? wave.tasks : [];
  const targets = (Array.isArray(gapAudit.gaps) ? gapAudit.gaps : [])
    .filter(isPluginEligibleGap)
    .sort(compareGapPriority)
    .slice(0, boundedInteger(maxTargets, 1, 100, 10))
    .map((gap, index) => buildTargetPlan(gap, tasks, fidelityByTask, adoptionByTarget[targetKey(gap)], index + 1));
  return {
    provider: "component-gap-learning-plan-v1",
    generatedAt: new Date().toISOString(),
    sources: {
      waveTasks: tasks.length,
      auditGaps: Array.isArray(gapAudit.gaps) ? gapAudit.gaps.length : 0
    },
    summary: summarizeTargets(targets),
    targets
  };
}

function buildTargetPlan(gap = {}, tasks = [], fidelityByTask = {}, adoption = null, order = 1) {
  const motifs = normalizeMotifs(gap.targetMotifs);
  const candidates = tasks
    .map((task) => ({
      task,
      overlap: motifOverlap(motifs, task.targetMotifs),
      suitabilityScore: taskSuitabilityScore(task, gap)
    }))
    .filter((candidate) => candidate.overlap.length > 0)
    .sort(compareTaskCandidate)
    .map((candidate) => summarizeTaskCandidate(
      candidate.task,
      candidate.overlap,
      candidate.suitabilityScore,
      fidelityByTask[candidate.task.taskId],
      motifs
    ));
  const next = selectNextAction(candidates, adoption);
  return {
    order,
    deck: safeString(gap.deck),
    slide: positiveInteger(gap.slide),
    pageIndex: nonNegativeInteger(gap.pageIndex),
    imageId: safeString(gap.imageId),
    priority: safeString(gap.priority || "medium"),
    priorityScore: finiteNumber(gap.priorityScore),
    recommendedRoute: safeString(gap.recommendedRoute),
    templateFamily: safeString(gap.templateFamily),
    targetMotifs: motifs,
    candidateTasks: candidates,
    ...(adoption ? { adoption } : {}),
    next,
    acceptance: {
      requireFidelityPromotion: next.kind === "promote-collected",
      requireActualNativeAdoption: true,
      validation: buildAdoptionValidationCommand({
        deck: safeString(gap.deck),
        slide: positiveInteger(gap.slide) || 1,
        promotionReport: next.promotionReport
      })
    }
  };
}

function selectNextAction(candidates = [], adoption = null) {
  const directPromoted = candidates.filter((candidate) => candidate.directMatch
    && (candidate.selfFidelity?.passed === true || candidate.status === "promoted"));
  const primaryPromoted = directPromoted[0];
  const attemptedReports = new Set((Array.isArray(adoption?.promotionReports) ? adoption.promotionReports : [])
    .map((file) => safeString(file))
    .filter(Boolean));
  const untriedPromoted = directPromoted.find((candidate) => !attemptedReports.has(safeString(candidate.selfFidelity?.reportFile)));
  const collected = candidates.find((candidate) => candidate.status === "collected" && candidate.selfFidelity?.passed !== false);
  const rejectedCollected = candidates.find((candidate) => candidate.status === "collected" && candidate.selfFidelity?.passed === false);
  const pending = candidates.find((candidate) => candidate.status === "pending");
  if (adoption?.status === "failed-no-adoption" && adoption.preserveLocalCropImages > 0 && adoption.componentLocalAssetMatches === 0) {
    return {
      kind: "preserve-minimum-unit-crop",
      taskId: "",
      provider: "",
      reason: "Page-scoped A/B found no component-compatible structure and classified the residuals as intentional local visual assets."
    };
  }
  if (adoption?.status === "failed-no-adoption" && adoption.componentHighReusableGroupMatches > 0) {
    return {
      kind: "review-template-replay-eligibility",
      taskId: primaryPromoted?.taskId || "",
      provider: primaryPromoted?.provider || "",
      reason: "Page-scoped A/B found a reusable group but applied zero native shapes; fix template replay eligibility before collecting another similar component."
    };
  }
  if (adoption?.status === "failed-no-adoption" && attemptedReports.size > 0 && untriedPromoted) {
    return {
      kind: "validate-alternative-promoted-component",
      taskId: untriedPromoted.taskId,
      provider: untriedPromoted.provider,
      promotionReport: safeString(untriedPromoted.selfFidelity?.reportFile),
      reason: "The previously promoted component was only a local-asset match and produced no native shapes; validate an untried promoted alternative."
    };
  }
  if (rejectedCollected && primaryPromoted) {
    return {
      kind: "validate-promoted-component",
      taskId: primaryPromoted.taskId,
      provider: primaryPromoted.provider,
      promotionReport: safeString(primaryPromoted.selfFidelity?.reportFile),
      reason: `The collected alternative ${rejectedCollected.taskId} failed self-fidelity; validate the direct promoted component instead.`
    };
  }
  if (collected) {
    return {
      kind: "promote-collected",
      taskId: collected.taskId,
      provider: collected.provider,
      reason: "A structurally relevant component is collected but cannot be used until self-fidelity promotion passes."
    };
  }
  if (primaryPromoted) {
    return {
      kind: "validate-promoted-component",
      taskId: primaryPromoted.taskId,
      provider: primaryPromoted.provider,
      promotionReport: safeString(primaryPromoted.selfFidelity?.reportFile),
      reason: "A fidelity-promoted component has a direct motif match; run page-scoped adoption A/B before collecting more."
    };
  }
  if (pending) {
    return {
      kind: "collect-plugin-component",
      taskId: pending.taskId,
      provider: pending.provider,
      searchTerms: pending.searchTerms,
      reason: "No collected reusable component covers this target motif; collect this focused component next."
    };
  }
  return {
    kind: "no-component-task",
    taskId: "",
    provider: "",
    reason: "No learning-wave task matches this target; add a focused component target before attempting replacement."
  };
}

function buildAdoptionValidationCommand({ deck = "", slide = 1, promotionReport = "" } = {}) {
  const args = [
    "npm run slideclone:component-adoption-ab-gate --",
    "--deck", powershellQuote(deck),
    "--deck-pages", powershellQuote(`${deck}=${positiveInteger(slide) || 1}`)
  ];
  if (safeString(promotionReport)) {
    args.push("--component-self-fidelity-report", powershellQuote(promotionReport));
  }
  return args.join(" ");
}

function summarizeTaskCandidate(task = {}, overlap = [], suitabilityScore = 0, selfFidelity = null, requiredMotifs = []) {
  const motifs = normalizeMotifs(task.targetMotifs);
  return {
    taskId: safeString(task.taskId),
    provider: safeString(task.provider),
    title: safeString(task.title),
    status: safeString(task.status || "pending"),
    targetMotifs: motifs,
    overlap,
    suitabilityScore,
    ...(selfFidelity ? { selfFidelity } : {}),
    directMatch: overlap.length === requiredMotifs.length && requiredMotifs.length > 0,
    searchTerms: Array.isArray(task.searchTerms) ? task.searchTerms.map(safeString).filter(Boolean) : [],
    fixturePptx: safeString(task.fixturePptx),
    ingestCommand: safeString(task.ingestCommand)
  };
}

function compareGapPriority(left, right) {
  return finiteNumber(right.priorityScore) - finiteNumber(left.priorityScore)
    || priorityRank(left.priority) - priorityRank(right.priority)
    || safeString(left.deck).localeCompare(safeString(right.deck));
}

function compareTaskCandidate(left, right) {
  return Number(right.suitabilityScore) - Number(left.suitabilityScore)
    || Number(right.overlap.length) - Number(left.overlap.length)
    || taskStatusRank(left.task.status) - taskStatusRank(right.task.status)
    || safeString(left.task.taskId).localeCompare(safeString(right.task.taskId));
}

function taskSuitabilityScore(task = {}, gap = {}) {
  const motifs = new Set(normalizeMotifs(gap.targetMotifs));
  const identity = `${safeString(task.id)} ${safeString(task.title)}`.toLowerCase();
  let score = motifOverlap([...motifs], task.targetMotifs).length * 100;
  if (motifs.has("whole-process-template")) {
    if (/whole-process|整组|闭环/.test(identity)) score += 55;
    else if (/process-flow|流程箭头/.test(identity)) score += 40;
    else if (/linear-process|线性流程/.test(identity)) score += 30;
    if (/title-banner|标题横幅/.test(identity)) score -= 45;
  }
  if (motifs.has("linear-arrow-chain")) {
    if (/whole-process|整组|闭环/.test(identity)) score += 45;
    else if (/process-flow|流程箭头/.test(identity)) score += 38;
    else if (/linear-process|线性流程/.test(identity)) score += 32;
    else if (/branch-card|分支|卡片流程/.test(identity)) score += 20;
    if (/elbow-arrow|折线箭头|直角箭头/.test(identity)) score -= 55;
  }
  if (motifs.has("radial-link")) {
    if (/relationship-hub|关系图/.test(identity)) score += 45;
    else if (/radial-hub|中心辐射/.test(identity)) score += 38;
    else if (/topology|拓扑/.test(identity)) score += 18;
  }
  if (motifs.has("card-grid")) {
    if (/card-grid|卡片矩阵/.test(identity)) score += 45;
    else if (/table-border|表格边框/.test(identity)) score += 25;
  }
  if (motifs.has("pie-share-chart") && /pie-share|占比图表|饼图/.test(identity)) score += 50;
  return score;
}

function taskStatusRank(status) {
  const normalized = safeString(status).toLowerCase();
  if (normalized === "collected") return 0;
  if (normalized === "pending") return 1;
  if (normalized === "promoted") return 2;
  return 3;
}

function isPluginEligibleGap(gap = {}) {
  const recommendedAction = safeString(gap?.recommendedAction).toLowerCase();
  const isDeferredFidelityCrop = /preserve.*fidelity.*crop|fidelity.*crop.*until/.test(recommendedAction);
  const isDataInsufficientChartSnapshot = /keep.*crop.*until.*(?:source[- ]?data|axis|series)/.test(recommendedAction);
  return gap && typeof gap === "object"
    && gap.expressionPolicy?.allowPluginTemplate === true
    // A source crop explicitly held for a future subtype rebuilder must not be
    // replaced by a generic plugin template just because it contains arrows.
    && !isDeferredFidelityCrop
    // A chart snapshot without recoverable data must remain a crop. A library
    // pie component cannot restore its unknown values or segment geometry.
    && !isDataInsufficientChartSnapshot
    && normalizeMotifs(gap.targetMotifs).length > 0;
}

function summarizeTargets(targets = []) {
  const nextKinds = {};
  for (const target of targets) {
    const kind = safeString(target.next?.kind || "unknown");
    nextKinds[kind] = (nextKinds[kind] || 0) + 1;
  }
  return { targets: targets.length, nextKinds };
}

function renderPlanMarkdown(plan = {}) {
  const lines = [
    "# Component Gap Learning Plan",
    "",
    `- Targets: ${plan.summary?.targets || 0}`,
    "- Rule: only apply a component after it is self-fidelity promoted; only retain it after page-scoped A/B confirms native-shape adoption.",
    ""
  ];
  for (const target of plan.targets || []) {
    lines.push(`## ${target.order}. ${target.deck} slide ${target.slide || "?"}`);
    lines.push(`- Gap: ${target.targetMotifs.join(", ")} (${target.priority}, score ${target.priorityScore})`);
    lines.push(`- Next: ${target.next.kind}${target.next.taskId ? ` - ${target.next.taskId}` : ""}`);
    lines.push(`- Why: ${target.next.reason}`);
    if (target.next.searchTerms?.length) lines.push(`- Search: ${target.next.searchTerms.join(" / ")}`);
    lines.push(`- Validate: \`${target.acceptance.validation}\``);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs();
  const waveFile = path.resolve(args.wave);
  const gapAuditFile = path.resolve(args.gapAudit);
  const collectionRoot = path.resolve(args.collectionRoot || path.dirname(waveFile));
  const adoptionReports = args.adoptionReports.map((file) => path.resolve(file));
  const plan = buildGapLearningPlan({
    wave: readJson(waveFile),
    gapAudit: readJson(gapAuditFile),
    fidelityByTask: loadFidelityByTask(collectionRoot),
    adoptionByTarget: loadAdoptionByTarget(adoptionReports),
    maxTargets: args.maxTargets
  });
  plan.sources = { ...plan.sources, waveFile, gapAuditFile, collectionRoot, adoptionReports };
  const out = path.resolve(args.out);
  const markdownOut = path.resolve(args.markdownOut || out.replace(/\.json$/i, ".md"));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  fs.writeFileSync(markdownOut, renderPlanMarkdown(plan), "utf8");
  process.stdout.write(`component gap learning plan: ${plan.summary.targets} targets -> ${out}\n`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadFidelityByTask(collectionRoot) {
  const taskByFile = new Map();
  for (const provider of ["islide", "officeplus"]) {
    const manifestFile = path.join(collectionRoot, "verified", provider, "manifest.json");
    if (!fs.existsSync(manifestFile)) continue;
    const manifest = readJson(manifestFile);
    for (const component of Array.isArray(manifest.components) ? manifest.components : []) {
      const taskId = safeString(component.collection?.label);
      const file = safeString(component.path);
      if (taskId && file) taskByFile.set(path.resolve(file), taskId);
    }
  }
  const outcomes = {};
  for (const reportFile of findFidelityReports(path.join(collectionRoot, "self-fidelity"))) {
    let report;
    try {
      report = readJson(reportFile);
    } catch {
      continue;
    }
    const createdAt = safeString(report.createdAt);
    for (const result of Array.isArray(report.results) ? report.results : []) {
      const taskId = taskByFile.get(path.resolve(safeString(result.file)));
      if (!taskId || typeof result.passed !== "boolean") continue;
      const existing = outcomes[taskId];
      if (existing && existing.createdAt > createdAt) continue;
      outcomes[taskId] = {
        passed: result.passed,
        createdAt,
        reportFile,
        ...(result.comparison ? { comparison: result.comparison } : {}),
        ...(result.regionSummary ? { regionSummary: result.regionSummary } : {})
      };
    }
  }
  return outcomes;
}

function findFidelityReports(root) {
  if (!fs.existsSync(root)) return [];
  const found = [];
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current.dir, entry.name);
      if (entry.isDirectory() && current.depth < 3) queue.push({ dir: full, depth: current.depth + 1 });
      if (entry.isFile() && entry.name === "component-self-fidelity-batch.report.json") found.push(full);
    }
  }
  return found.sort();
}

function loadAdoptionByTarget(reportFiles = []) {
  const outcomes = {};
  for (const reportFile of reportFiles) {
    let report;
    try {
      report = readJson(reportFile);
    } catch {
      continue;
    }
    const totals = report.matrix?.totals || {};
    for (const [deck, pages] of Object.entries(report.deckPages || {})) {
      for (const page of String(pages).split(",").map(positiveInteger).filter(Boolean)) {
        const key = targetKey({ deck, slide: page });
        const current = {
          status: safeString(report.status),
          reportFile: path.resolve(reportFile),
          promotionReports: (Array.isArray(report.promotionReports) ? report.promotionReports : [])
            .map((file) => safeString(file))
            .filter((file) => file && path.isAbsolute(file))
            .map((file) => path.resolve(file)),
          componentHighReusableGroupMatches: finiteNumber(totals.componentHighReusableGroupMatches),
          componentLocalAssetMatches: finiteNumber(totals.componentLocalAssetMatches),
          componentTemplateAppliedShapes: finiteNumber(totals.componentTemplateAppliedShapes),
          preserveLocalCropImages: finiteNumber(totals.preserveLocalCropImages),
          nativeVisualAtomRebuildImages: finiteNumber(totals.nativeVisualAtomRebuildImages)
        };
        outcomes[key] = mergeAdoptionEvidence(outcomes[key], current);
      }
    }
  }
  return outcomes;
}

function mergeAdoptionEvidence(previous = null, current = {}) {
  if (!previous) return current;
  return {
    status: previous.status === "passed" || current.status === "passed" ? "passed" : current.status || previous.status,
    reportFile: current.reportFile || previous.reportFile,
    promotionReports: [...new Set([...(previous.promotionReports || []), ...(current.promotionReports || [])])],
    componentHighReusableGroupMatches: Math.max(finiteNumber(previous.componentHighReusableGroupMatches), finiteNumber(current.componentHighReusableGroupMatches)),
    componentLocalAssetMatches: Math.max(finiteNumber(previous.componentLocalAssetMatches), finiteNumber(current.componentLocalAssetMatches)),
    componentTemplateAppliedShapes: Math.max(finiteNumber(previous.componentTemplateAppliedShapes), finiteNumber(current.componentTemplateAppliedShapes)),
    preserveLocalCropImages: Math.max(finiteNumber(previous.preserveLocalCropImages), finiteNumber(current.preserveLocalCropImages)),
    nativeVisualAtomRebuildImages: Math.max(finiteNumber(previous.nativeVisualAtomRebuildImages), finiteNumber(current.nativeVisualAtomRebuildImages))
  };
}

function targetKey(value = {}) {
  return `${safeString(value.deck)}#${positiveInteger(value.slide)}`;
}

function normalizeMotifs(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(safeString).filter(Boolean))];
}

function motifOverlap(left, right) {
  const rightSet = new Set(normalizeMotifs(right));
  return normalizeMotifs(left).filter((motif) => rightSet.has(motif));
}

function priorityRank(value) {
  if (safeString(value) === "high") return 0;
  if (safeString(value) === "medium") return 1;
  return 2;
}

function boundedInteger(value, min, max, fallback) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function positiveInteger(value) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function nonNegativeInteger(value) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeString(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function powershellQuote(value) {
  return `'${safeString(value).replace(/'/g, "''")}'`;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`component-gap-learning-plan failed: ${safeString(error?.message || error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  _private: { buildAdoptionValidationCommand, findFidelityReports, isPluginEligibleGap, loadAdoptionByTarget, loadFidelityByTask, mergeAdoptionEvidence, motifOverlap, selectNextAction, targetKey, taskStatusRank, taskSuitabilityScore },
  buildGapLearningPlan,
  parseArgs,
  renderPlanMarkdown
};
