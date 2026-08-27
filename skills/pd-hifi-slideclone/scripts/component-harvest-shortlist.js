"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { _private: plannerPrivate } = require("./lib/component-candidate-planner");

function parseArgs(argv) {
  const args = {
    candidates: "",
    queue: "",
    out: path.join("runs", "plugin-component-inventory", "component-harvest-shortlist.json"),
    markdownOut: "",
    maxActions: 12,
    maxActionsPerTask: 4
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--candidates" || arg === "--candidate-report" || arg === "--in") && next) {
      args.candidates = next;
      i += 1;
    } else if ((arg === "--queue" || arg === "--harvest-queue") && next) {
      args.queue = next;
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if ((arg === "--markdown-out" || arg === "--guide-out") && next) {
      args.markdownOut = next;
      i += 1;
    } else if (arg === "--max-actions" && next) {
      args.maxActions = Number(next);
      i += 1;
    } else if (arg === "--max-actions-per-task" && next) {
      args.maxActionsPerTask = Number(next);
      i += 1;
    } else {
      throw new Error(`Unknown component-harvest-shortlist argument: ${arg}`);
    }
  }
  if (!args.candidates) throw new Error("--candidates is required");
  if (!args.queue) throw new Error("--queue is required");
  return args;
}

function buildHarvestShortlist(options = {}) {
  const candidateFile = path.resolve(String(options.candidates || ""));
  const queueFile = path.resolve(String(options.queue || ""));
  const candidateReport = readJson(candidateFile);
  const harvestQueue = readJson(queueFile);
  const maxActions = normalizePositiveInt(options.maxActions, 12);
  const maxActionsPerTask = normalizePositiveInt(options.maxActionsPerTask, 4);
  const candidateIndex = collectCandidateDocuments(candidateReport);
  const tasks = safeArray(harvestQueue.tasks).map((task) => buildTaskShortlist(task, candidateIndex, { maxActionsPerTask }));
  const flattened = tasks
    .flatMap((task) => task.actions.map((action) => ({ ...action, taskId: task.id, taskTitle: task.title })))
    .sort(compareActions)
    .slice(0, maxActions);
  return {
    provider: "component-harvest-shortlist-v1",
    generatedAt: new Date().toISOString(),
    candidates: candidateFile,
    queue: queueFile,
    summary: summarize(tasks, flattened),
    tasks,
    actions: flattened.map((action, index) => ({ ...action, order: index + 1 }))
  };
}

function buildTaskShortlist(task = {}, candidateIndex = [], options = {}) {
  const directMatches = candidateIndex.filter((candidate) => candidateMatchesTaskId(candidate, task));
  const layerSlides = taskSlides(task);
  const scored = candidateIndex
    .map((candidate) => scoreCandidateForTask(candidate, task, layerSlides))
    .filter((candidate) => candidate.score >= 45)
    .sort(compareActions);
  const directSearch = directMatches.length === 0 ? [directTargetSearchAction(task)] : [];
  const actions = dedupeActions([
    ...directMatches.map((candidate) => scoreCandidateForTask(candidate, task, layerSlides, { forceDirect: true })),
    ...scored,
    ...directSearch
  ]).slice(0, normalizePositiveInt(options.maxActionsPerTask, 4))
    .map((action) => ({
      ...action,
      affectedSlides: layerSlides,
      slide: positiveNumberOrNull(action.slide) || layerSlides[0] || null
    }));
  return {
    id: safeString(task.id),
    provider: safeString(task.provider),
    kind: safeString(task.kind),
    componentId: safeString(task.componentId),
    title: safeString(task.title),
    targetMotifs: sanitizeMotifs(task.targetMotifs),
    affectedSlides: layerSlides,
    anchorCount: Number(task.totalAnchorCount || 0),
    status: directMatches.length ? "target-found-in-candidates" : "target-not-found-use-direct-search-or-structural-alternate",
    actions
  };
}

function collectCandidateDocuments(candidateReport = {}) {
  const result = [];
  for (const layer of safeArray(candidateReport.layers)) {
    if (isProtectedCropLayer(layer)) continue;
    const slide = slideNumberFromLayer(layer);
    const plan = layer.plan || {};
    const structureSignature = plan.structureSignature || layer.structureSignature || null;
    const layerMotifs = sanitizeMotifs(plan.targetMotifs || layer.targetMotifs);
    for (const document of safeArray(layer.bestCandidates)) {
      const provider = normalizeProvider(document.sourceProvider || document.queryProvider || document.acquisitionProvider);
      const kind = safeString(document.kind || document.queryKind || document.acquisitionKind).toLowerCase();
      const id = safeString(document.id);
      const title = safeString(document.title);
      if (!provider || !kind || !id || !title) continue;
      result.push({
        provider,
        kind,
        id,
        title,
        candidateScore: round(document.candidateScore ?? document.acquisitionScore),
        matchedKeywords: safeString(document.matchedKeywords || document.queryKeywords),
        coverUrl: safeString(document.coverUrl),
        paymentType: document.paymentType ?? null,
        price: numberOrNull(document.price),
        layerId: safeString(layer.shapeLayerId || layer.id),
        componentOwnerId: safeString(layer.componentOwnerId),
        slide,
        layerMotifs,
        structureSignature,
        templateFamily: safeString(layer.templateFamily || plan.templateFamily),
        mode: safeString(layer.mode || plan.mode)
      });
    }
  }
  return dedupeCandidateDocuments(result);
}

function scoreCandidateForTask(candidate = {}, task = {}, taskSlides = [], options = {}) {
  const targetMotifs = sanitizeMotifs(task.targetMotifs);
  const overlap = motifOverlap(candidate.layerMotifs, targetMotifs);
  const exact = candidateMatchesTaskId(candidate, task);
  const slideOverlap = taskSlides.includes(candidate.slide);
  const candidateCount = itemCountFromText(candidate.title);
  const taskCount = itemCountFromText(task.title);
  const structureCount = Number(candidate.structureSignature?.stepCount || 0) || null;
  let score = Number(candidate.candidateScore || 0);
  const reasons = [];
  if (exact || options.forceDirect) {
    score += 100;
    reasons.push("exact-component-id");
  }
  if (candidate.provider === safeString(task.provider)) {
    score += 14;
    reasons.push("provider-match");
  }
  if (candidate.kind === safeString(task.kind).toLowerCase()) {
    score += 16;
    reasons.push("kind-match");
  }
  if (slideOverlap) {
    score += 26;
    reasons.push(`same-slide:p${candidate.slide}`);
  }
  if (overlap > 0) {
    score += overlap * 10;
    reasons.push(`motif-overlap:${overlap}`);
  }
  if (structureCount && candidateCount && structureCount === candidateCount) {
    score += 12;
    reasons.push(`step-count-match:${structureCount}`);
  } else if (taskCount && candidateCount && taskCount !== candidateCount) {
    score -= 8;
    reasons.push(`queue-title-count-diff:${taskCount}->${candidateCount}`);
  }
  const status = exact
    ? "direct-target-candidate"
    : slideOverlap || overlap > 0
      ? "structural-alternate"
      : "low-context-candidate";
  return {
    status,
    provider: candidate.provider,
    kind: candidate.kind,
    id: candidate.id,
    title: candidate.title,
    score: round(score),
    candidateScore: candidate.candidateScore,
    layerId: candidate.layerId,
    slide: candidate.slide,
    matchedKeywords: candidate.matchedKeywords,
    targetMotifs,
    layerMotifs: candidate.layerMotifs,
    structureSignature: candidate.structureSignature || null,
    reasons,
    action: pluginActionInstruction(candidate)
  };
}

function directTargetSearchAction(task = {}) {
  const provider = normalizeProvider(task.provider);
  const kind = safeString(task.kind).toLowerCase();
  const id = safeString(task.componentId);
  const title = safeString(task.title);
  const keywords = safeArray(task.searchKeywords).map(safeString).filter(Boolean);
  const searchText = keywords[0] || title || id;
  return {
    status: "direct-target-search",
    provider,
    kind,
    id,
    title,
    score: 120,
    candidateScore: 0,
    layerId: "",
    slide: null,
    matchedKeywords: searchText,
    targetMotifs: sanitizeMotifs(task.targetMotifs),
    layerMotifs: [],
    structureSignature: null,
    reasons: ["queue-target-not-found-in-live-candidates", "manual-plugin-search-required"],
    action: {
      mode: "plugin-ui-direct-search",
      tab: provider === "officeplus" ? "OfficePLUS" : "iSlide",
      library: kind,
      searchText,
      expectedCandidateId: id,
      expectedTitle: title,
      instruction: `${provider === "officeplus" ? "Open OfficePLUS" : "Open iSlide"}, search "${searchText}", apply/download "${title}" (${id}) into a blank active slide, then run the harvest command from the queue.`
    }
  };
}

function pluginActionInstruction(candidate = {}) {
  return {
    mode: "plugin-ui-apply-and-harvest",
    tab: candidate.provider === "officeplus" ? "OfficePLUS" : "iSlide",
    library: candidate.kind,
    searchText: candidate.matchedKeywords || candidate.title || candidate.id,
    expectedCandidateId: candidate.id,
    expectedTitle: candidate.title,
    instruction: `${candidate.provider === "officeplus" ? "Open OfficePLUS" : "Open iSlide"}, search "${candidate.matchedKeywords || candidate.title}", apply/download "${candidate.title}" (${candidate.id}) into a blank active slide, then harvest the active PowerPoint component.`
  };
}

function dedupeActions(actions = []) {
  const byKey = new Map();
  for (const action of actions) {
    const key = [action.status === "direct-target-search" ? "direct" : action.provider, action.kind, action.id].join("|");
    const previous = byKey.get(key);
    if (!previous || Number(action.score || 0) > Number(previous.score || 0)) byKey.set(key, action);
  }
  return [...byKey.values()].sort(compareActions);
}

function dedupeCandidateDocuments(candidates = []) {
  const byKey = new Map();
  for (const candidate of candidates) {
    const key = [candidate.provider, candidate.kind, candidate.id, candidate.layerId].join("|");
    const previous = byKey.get(key);
    if (!previous || Number(candidate.candidateScore || 0) > Number(previous.candidateScore || 0)) byKey.set(key, candidate);
  }
  return [...byKey.values()];
}

function compareActions(a = {}, b = {}) {
  return statusRank(b.status) - statusRank(a.status)
    || Number(b.score || 0) - Number(a.score || 0)
    || safeString(a.title).localeCompare(safeString(b.title));
}

function statusRank(status) {
  if (status === "direct-target-candidate") return 4;
  if (status === "direct-target-search") return 3;
  if (status === "structural-alternate") return 2;
  return 1;
}

function candidateMatchesTaskId(candidate = {}, task = {}) {
  return normalizeProvider(candidate.provider) === normalizeProvider(task.provider)
    && safeString(candidate.kind).toLowerCase() === safeString(task.kind).toLowerCase()
    && safeString(candidate.id) === safeString(task.componentId);
}

function taskSlides(task = {}) {
  const slides = new Set();
  for (const file of safeArray(task.affectedFiles)) {
    for (const slide of safeArray(file.slides)) {
      const number = Number(slide);
      if (Number.isFinite(number) && number > 0) slides.add(number);
    }
  }
  return [...slides].sort((a, b) => a - b);
}

function slideNumberFromLayer(layer = {}) {
  const text = [layer.shapeLayerId, layer.id, layer.componentOwnerId].map(safeString).join(" ");
  const match = /\bp(\d+)[-_]/i.exec(text);
  return match ? Number(match[1]) : null;
}

function isProtectedCropLayer(layer = {}) {
  const text = [
    layer.layerType,
    layer.templateFamily,
    layer.mode,
    layer.componentRenderStrategy?.mode,
    layer.componentRenderStrategy?.templateFamily,
    layer.plan?.templateFamily,
    layer.plan?.mode
  ].map(safeString).join(" ").toLowerCase();
  return /icon-or-illustration|illustration-zone|preserve-local-crop|match-icon-library/.test(text);
}

function motifOverlap(a = [], b = []) {
  const right = new Set(sanitizeMotifs(b));
  return sanitizeMotifs(a).filter((motif) => right.has(motif)).length;
}

function sanitizeMotifs(values = []) {
  return [...new Set(safeArray(values).map(safeString).filter(Boolean))];
}

function normalizeProvider(value) {
  const text = safeString(value).toLowerCase();
  if (text === "officeplus") return "officeplus";
  if (text === "islide") return "islide";
  return "";
}

function itemCountFromText(text) {
  if (plannerPrivate && typeof plannerPrivate.itemCountFromText === "function") return plannerPrivate.itemCountFromText(text);
  return null;
}

function summarize(tasks = [], flattened = []) {
  const statusCounts = {};
  for (const action of flattened) statusCounts[action.status] = (statusCounts[action.status] || 0) + 1;
  return {
    taskCount: tasks.length,
    actionCount: flattened.length,
    statusCounts,
    targetFoundTasks: tasks.filter((task) => task.status === "target-found-in-candidates").length,
    targetMissingTasks: tasks.filter((task) => task.status !== "target-found-in-candidates").length
  };
}

function renderHarvestShortlistMarkdown(report = {}) {
  const lines = [
    "# Component Harvest Shortlist",
    "",
    `Generated: ${safeString(report.generatedAt || new Date().toISOString())}`,
    `Tasks: ${Number(report.summary?.taskCount || 0)}`,
    `Actions: ${Number(report.summary?.actionCount || 0)}`,
    "",
    "Before applying a component, start the watcher:",
    "",
    "```powershell",
    "node skills\\pd-hifi-slideclone\\scripts\\watch-plugin-component-downloads.js --provider all --active-powerpoint --duration-ms 30000 --poll-ms 500 --out runs\\plugin-component-inventory\\watched-plugin-components",
    "```",
    ""
  ];
  for (const action of safeArray(report.actions)) {
    lines.push(`## ${Number(action.order || 0)}. ${safeString(action.action?.tab || action.provider)} ${safeString(action.kind)} ${safeString(action.id)}`);
    lines.push("");
    lines.push(`- Status: ${safeString(action.status)}`);
    lines.push(`- Title: ${safeString(action.title)}`);
    lines.push(`- Score: ${Number(action.score || 0)}`);
    lines.push(`- Search: ${safeString(action.action?.searchText || action.matchedKeywords)}`);
    lines.push(`- Task: ${safeString(action.taskTitle || action.taskId)}`);
    lines.push(`- Reasons: ${safeArray(action.reasons).map(safeString).join(", ")}`);
    lines.push("");
    lines.push(safeString(action.action?.instruction));
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function normalizePositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8"));
}

function main() {
  const args = parseArgs(process.argv);
  const report = buildHarvestShortlist(args);
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (args.markdownOut) {
    fs.mkdirSync(path.dirname(path.resolve(args.markdownOut)), { recursive: true });
    fs.writeFileSync(path.resolve(args.markdownOut), renderHarvestShortlistMarkdown(report), "utf8");
  }
  console.log(`harvest shortlist actions: ${report.summary.actionCount}`);
  console.log(`report: ${path.resolve(args.out)}`);
  if (args.markdownOut) console.log(`guide: ${path.resolve(args.markdownOut)}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}

module.exports = {
  buildHarvestShortlist,
  collectCandidateDocuments,
  parseArgs,
  renderHarvestShortlistMarkdown,
  _private: {
    candidateMatchesTaskId,
    directTargetSearchAction,
    isProtectedCropLayer,
    scoreCandidateForTask,
    slideNumberFromLayer
  }
};
