#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  initializeCollectionSession,
  sessionPaths
} = require("./component-isolated-collection-session");

const DEFAULT_OUT = path.join("runs", "plugin-component-inventory", "isolated-collection");
const TARGETS = [
  target("islide", "arc-arrow-cycle", "圆弧箭头", ["圆弧箭头", "环形箭头"], ["arc-arrow", "cycle-loop"]),
  target("islide", "arc-arrow-turn", "转向弧形箭头", ["转向箭头", "弧形箭头"], ["arc-arrow"]),
  target("islide", "elbow-arrow", "折线箭头", ["折线箭头", "直角箭头"], ["linear-arrow-chain"]),
  target("islide", "linear-process", "线性流程", ["流程图", "步骤流程"], ["linear-arrow-chain", "whole-process-template"]),
  target("islide", "radial-hub", "中心辐射", ["中心关系", "辐射关系"], ["radial-link"]),
  target("islide", "hierarchy-tree", "层级关系", ["组织结构", "层级关系"], ["org-hierarchy", "tree-link"]),
  target("islide", "timeline-roadmap", "时间轴路线图", ["时间轴", "路线图"], ["milestone-roadmap"]),
  target("islide", "card-grid", "卡片矩阵", ["卡片矩阵", "四项卡片"], ["card-grid"]),
  target("islide", "layered-stack", "层叠结构", ["层叠", "分层结构"], ["layered-stack"]),
  target("islide", "funnel-stack", "漏斗结构", ["漏斗图", "转化漏斗"], ["funnel-stack"]),
  target("officeplus", "arc-arrow-cycle", "圆弧循环箭头", ["圆弧箭头", "循环箭头"], ["arc-arrow", "cycle-loop"]),
  target("officeplus", "process-flow", "流程箭头", ["流程箭头", "步骤流程"], ["linear-arrow-chain", "whole-process-template"]),
  target("officeplus", "relationship-hub", "关系图", ["中心辐射", "关系图"], ["radial-link"]),
  target("officeplus", "hierarchy-tree", "组织层级", ["组织架构", "层级关系"], ["org-hierarchy", "tree-link"]),
  target("officeplus", "timeline-roadmap", "时间轴", ["时间轴", "路线图"], ["milestone-roadmap"]),
  target("officeplus", "quadrant-axis", "四象限", ["四象限", "优先级矩阵"], ["quadrant-axis"]),
  target("officeplus", "table-border", "表格边框", ["表格", "边框"], ["card-grid"]),
  target("officeplus", "title-banner", "标题横幅", ["标题", "横幅"], ["whole-process-template"]),
  target("officeplus", "funnel-stack", "漏斗图", ["漏斗", "转化漏斗"], ["funnel-stack"]),
  target("officeplus", "pie-share-chart", "占比图表", ["饼图", "占比图"], ["pie-share-chart"])
];

// Real-deck gaps need specialized component variants that are not part of the
// original general-purpose wave. They are appended only through --extend.
const GAP_TARGETS = [
  target("islide", "topology-triangle", "三元拓扑关系", ["三元关系图", "拓扑三角", "铁三角关系"], ["topology-triangle", "radial-link"]),
  target("officeplus", "topology-triangle", "三元拓扑关系", ["三元关系图", "拓扑三角", "铁三角关系"], ["topology-triangle", "radial-link"]),
  target("islide", "whole-process-flow", "整组闭环流程", ["整组流程", "闭环流程", "流程闭环"], ["whole-process-template", "linear-arrow-chain"]),
  target("officeplus", "whole-process-flow", "整组闭环流程", ["整组流程", "闭环流程", "流程闭环"], ["whole-process-template", "linear-arrow-chain"]),
  target("islide", "branch-card-flow", "分支卡片流程", ["分支流程", "树状卡片", "卡片流程"], ["branch-card-flow", "linear-arrow-chain"]),
  target("officeplus", "branch-card-flow", "分支卡片流程", ["分支流程", "树状卡片", "卡片流程"], ["branch-card-flow", "linear-arrow-chain"])
];

function target(provider, id, title, searchTerms, targetMotifs) {
  return { provider, id, title, searchTerms, targetMotifs };
}

function parseArgs(argv = process.argv) {
  const args = { init: false, refresh: false, extend: false, out: DEFAULT_OUT, provider: "all", limit: TARGETS.length };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--init") {
      args.init = true;
    } else if (arg === "--refresh") {
      args.refresh = true;
    } else if (arg === "--extend") {
      args.extend = true;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--provider" && next) {
      args.provider = next.toLowerCase();
      index += 1;
    } else if (arg === "--limit" && next) {
      args.limit = Number(next);
      index += 1;
    } else {
      throw new Error(`Unknown component-learning-wave argument: ${arg}`);
    }
  }
  if (!args.init && !args.refresh && !args.extend) throw new Error("Specify --init, --extend, or --refresh for the collection wave.");
  if ((args.init ? 1 : 0) + (args.extend ? 1 : 0) + (args.refresh ? 1 : 0) > 1) {
    throw new Error("Use only one of --init, --extend, or --refresh per command.");
  }
  if (!/^(all|islide|officeplus)$/.test(args.provider)) throw new Error("--provider must be all, islide, or officeplus.");
  args.limit = boundedInteger(args.limit, 1, TARGETS.length + GAP_TARGETS.length, TARGETS.length);
  return args;
}

function refreshLearningWave(options = {}) {
  const outDir = path.resolve(String(options.out || DEFAULT_OUT));
  const waveFile = path.join(outDir, "learning-wave.json");
  if (!fs.existsSync(waveFile)) throw new Error("Learning wave is missing. Run --init before --refresh.");
  const wave = JSON.parse(fs.readFileSync(waveFile, "utf8"));
  const manifests = readVerifiedManifests(outDir, wave.tasks || []);
  const ingestHistory = readIngestHistory(outDir);
  const indexed = indexVerifiedComponents(manifests);
  const tasks = (wave.tasks || []).map((task) => refreshTaskStatus(task, indexed));
  const refreshed = {
    ...wave,
    refreshedAt: new Date().toISOString(),
    summary: summarizeLearningStatus(tasks, indexed.components),
    tasks
  };
  const statistics = buildLearningStatistics(refreshed, indexed.components, ingestHistory);
  fs.writeFileSync(waveFile, `${JSON.stringify(refreshed, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outDir, "learning-wave.md"), renderLearningWaveGuide(refreshed), "utf8");
  fs.writeFileSync(path.join(outDir, "learning-statistics.json"), `${JSON.stringify(statistics, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outDir, "learning-statistics.md"), renderLearningStatistics(statistics), "utf8");
  return { wave: refreshed, statistics, manifests, ingestHistory };
}

function buildLearningWave({ outDir = DEFAULT_OUT, provider = "all", limit = TARGETS.length } = {}) {
  const selected = TARGETS
    .filter((item) => provider === "all" || item.provider === provider)
    .slice(0, boundedInteger(limit, 1, TARGETS.length, TARGETS.length));
  const fixtureDir = path.join(path.resolve(outDir), "fixture");
  const tasks = selected.map((item, index) => {
    const taskId = `${String(index + 1).padStart(2, "0")}-${item.provider}-${item.id}`;
    const fixturePptx = path.join(fixtureDir, `${taskId}.pptx`);
    return {
      order: index + 1,
      taskId,
      ...item,
      fixturePptx,
      status: "pending",
      acceptance: {
        nativeStructure: "shape-rich reusable group; not picture-dominated",
        selfFidelity: "required before broad promotion"
      },
      ingestCommand: collectionIngestCommand({ outDir, provider: item.provider, taskId, fixturePptx })
    };
  });
  return {
    provider: "component-learning-wave-v1",
    createdAt: new Date().toISOString(),
    outDir: path.resolve(outDir),
    fixtureDir,
    summary: {
      total: tasks.length,
      byProvider: summarizeByProvider(tasks),
      status: { pending: tasks.length, collected: 0, promoted: 0 }
    },
    tasks
  };
}

async function extendLearningWave(options = {}) {
  const outDir = path.resolve(String(options.out || DEFAULT_OUT));
  const waveFile = path.join(outDir, "learning-wave.json");
  if (!fs.existsSync(waveFile)) throw new Error("Learning wave is missing. Run --init before --extend.");
  const wave = JSON.parse(fs.readFileSync(waveFile, "utf8"));
  const existingTasks = Array.isArray(wave.tasks) ? wave.tasks : [];
  const existingKeys = new Set(existingTasks.map(taskKey));
  const provider = String(options.provider || "all").toLowerCase();
  const candidates = GAP_TARGETS
    .filter((item) => provider === "all" || item.provider === provider)
    .filter((item) => !existingKeys.has(taskKey(item)))
    .slice(0, boundedInteger(options.limit, 1, GAP_TARGETS.length, GAP_TARGETS.length));
  const fixtureDir = String(wave.fixtureDir || path.join(outDir, "fixture"));
  const templateFixture = findReusableFixture(wave, fixtureDir);
  if (candidates.length > 0 && !templateFixture) {
    throw new Error("No isolated blank fixture is available. Re-run --init before --extend.");
  }
  let order = existingTasks.reduce((max, task) => Math.max(max, Number(task.order) || 0), 0);
  const appended = candidates.map((item) => {
    order += 1;
    const task = buildLearningTask({ item, order, outDir, fixtureDir });
    fs.copyFileSync(templateFixture, task.fixturePptx);
    return task;
  });
  const manifests = readVerifiedManifests(outDir, [...existingTasks, ...appended]);
  const indexed = indexVerifiedComponents(manifests);
  const tasks = [...existingTasks, ...appended].map((task) => refreshTaskStatus(task, indexed));
  const extended = {
    ...wave,
    extendedAt: new Date().toISOString(),
    fixtureDir,
    summary: summarizeLearningStatus(tasks, indexed.components),
    tasks
  };
  const ingestHistory = readIngestHistory(outDir);
  const statistics = buildLearningStatistics(extended, indexed.components, ingestHistory);
  fs.writeFileSync(waveFile, `${JSON.stringify(extended, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outDir, "learning-wave.md"), renderLearningWaveGuide(extended), "utf8");
  fs.writeFileSync(path.join(outDir, "learning-statistics.json"), `${JSON.stringify(statistics, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outDir, "learning-statistics.md"), renderLearningStatistics(statistics), "utf8");
  return { wave: extended, statistics, appended };
}

function buildLearningTask({ item = {}, order = 1, outDir = DEFAULT_OUT, fixtureDir = "" } = {}) {
  const taskId = `${String(order).padStart(2, "0")}-${item.provider}-${item.id}`;
  const fixturePptx = path.join(fixtureDir, `${taskId}.pptx`);
  return {
    order,
    taskId,
    ...item,
    fixturePptx,
    status: "pending",
    acceptance: {
      nativeStructure: "shape-rich reusable group; not picture-dominated",
      selfFidelity: "required before broad promotion"
    },
    ingestCommand: collectionIngestCommand({ outDir, provider: item.provider, taskId, fixturePptx })
  };
}

function findReusableFixture(wave = {}, fixtureDir = "") {
  const preferred = path.join(fixtureDir, "collection-fixture.pptx");
  if (fs.existsSync(preferred)) return preferred;
  return (Array.isArray(wave.tasks) ? wave.tasks : [])
    .map((task) => String(task.fixturePptx || ""))
    .find((file) => file && fs.existsSync(file)) || "";
}

function taskKey(task = {}) {
  return `${String(task.provider || "").toLowerCase()}:${String(task.id || "").toLowerCase()}`;
}

async function initializeLearningWave(options = {}) {
  const outDir = path.resolve(String(options.out || DEFAULT_OUT));
  const provider = String(options.provider || "all").toLowerCase();
  const plan = buildLearningWave({ outDir, provider, limit: options.limit });
  const templateProvider = plan.tasks[0]?.provider || "islide";
  const paths = sessionPaths(outDir, templateProvider);
  const initialize = typeof options.initializeCollection === "function"
    ? options.initializeCollection
    : initializeCollectionSession;
  const template = await initialize({ outDir, provider: templateProvider, paths });
  for (const task of plan.tasks) {
    if (!fs.existsSync(task.fixturePptx)) fs.copyFileSync(template.fixturePptx, task.fixturePptx);
  }
  fs.writeFileSync(path.join(outDir, "learning-wave.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outDir, "learning-wave.md"), renderLearningWaveGuide(plan), "utf8");
  return { ...plan, templateFixture: template.fixturePptx };
}

function collectionIngestCommand({ outDir, provider, taskId, fixturePptx }) {
  return [
    "node skills\\pd-hifi-slideclone\\scripts\\component-isolated-collection-session.js",
    `--ingest \"${fixturePptx}\"`,
    `--provider ${provider}`,
    `--label ${taskId}`,
    `--out \"${path.resolve(outDir)}\"`,
    "--verify-fidelity"
  ].join(" ");
}

function renderLearningWaveGuide(plan = {}) {
  const lines = [
    "# High-frequency Plugin Component Learning Wave",
    "",
    "Each task has its own blank PPTX. Apply only one component, save in place, then run its ingest command.",
    "Do not use a business presentation as a collection source.",
    ""
  ];
  for (const task of plan.tasks || []) {
    lines.push(
      `## ${task.order}. ${task.provider}: ${task.title}`,
      "",
      `Search: ${task.searchTerms.join(" / ")}`,
      `Motifs: ${task.targetMotifs.join(", ")}`,
      `Status: ${task.status || "pending"}`,
      `Fixture: ${task.fixturePptx}`,
      "",
      "```powershell",
      task.ingestCommand,
      "```",
      ""
    );
  }
  return `${lines.join("\n")}\n`;
}

function readVerifiedManifests(outDir, tasks = []) {
  const providers = [...new Set(tasks.map((task) => String(task.provider || "").trim()).filter(Boolean))];
  return providers.map((provider) => {
    const file = path.join(outDir, "verified", provider, "manifest.json");
    if (!fs.existsSync(file)) return { provider, file, components: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return { provider, file, components: Array.isArray(parsed.components) ? parsed.components : [] };
    } catch {
      return { provider, file, components: [] };
    }
  });
}

function indexVerifiedComponents(manifests = []) {
  const components = manifests.flatMap((manifest) => (manifest.components || []).map((component) => ({
    ...component,
    provider: String(component.provider || manifest.provider || "unknown").toLowerCase()
  })));
  const byTaskId = new Map();
  for (const component of components) {
    const label = String(component.collection?.label || "").trim();
    if (!label) continue;
    const list = byTaskId.get(label) || [];
    list.push(component);
    byTaskId.set(label, list);
  }
  return { components, byTaskId };
}

function refreshTaskStatus(task = {}, indexed = { byTaskId: new Map() }) {
  const matches = indexed.byTaskId.get(String(task.taskId || "")) || [];
  const promoted = matches.some((component) => component.selfFidelityPromoted === true
    || (component.roleTags || []).includes("self-fidelity-promoted"));
  return {
    ...task,
    status: promoted ? "promoted" : matches.length > 0 ? "collected" : "pending",
    evidence: {
      verifiedAssets: matches.map((component) => ({
        name: component.name || "",
        path: component.path || "",
        sha256: component.sha256 || "",
        selfFidelityPromoted: component.selfFidelityPromoted === true
      }))
    }
  };
}

function summarizeLearningStatus(tasks = [], components = []) {
  const status = { pending: 0, collected: 0, promoted: 0 };
  for (const task of tasks) status[task.status] = (status[task.status] || 0) + 1;
  return {
    total: tasks.length,
    byProvider: summarizeByProvider(tasks),
    status,
    verifiedAssets: components.length,
    promotedAssets: components.filter((component) => component.selfFidelityPromoted === true
      || (component.roleTags || []).includes("self-fidelity-promoted")).length
  };
}

function buildLearningStatistics(wave = {}, components = [], ingestHistory = []) {
  const tasks = Array.isArray(wave.tasks) ? wave.tasks : [];
  const taskIds = new Set(tasks.map((task) => task.taskId));
  const byProvider = {};
  const byMotif = {};
  const assetCoverageByMotif = {};
  for (const task of tasks) {
    const provider = task.provider || "unknown";
    const providerSummary = byProvider[provider] || { total: 0, pending: 0, collected: 0, promoted: 0 };
    providerSummary.total += 1;
    providerSummary[task.status] += 1;
    byProvider[provider] = providerSummary;
    for (const motif of task.targetMotifs || []) {
      const motifSummary = byMotif[motif] || { total: 0, pending: 0, collected: 0, promoted: 0 };
      motifSummary.total += 1;
      motifSummary[task.status] += 1;
      byMotif[motif] = motifSummary;
    }
  }
  for (const component of components) {
    const promoted = component.selfFidelityPromoted === true
      || (component.roleTags || []).includes("self-fidelity-promoted");
    for (const motif of componentMotifs(component)) {
      const coverage = assetCoverageByMotif[motif] || { verifiedAssets: 0, promotedAssets: 0, providers: [] };
      coverage.verifiedAssets += 1;
      if (promoted) coverage.promotedAssets += 1;
      const provider = String(component.provider || "unknown").toLowerCase();
      if (!coverage.providers.includes(provider)) coverage.providers.push(provider);
      assetCoverageByMotif[motif] = coverage;
    }
  }
  const adoptionSuggestions = buildAdoptionSuggestions(tasks, components);
  const adoptionReady = adoptionSuggestions
    .filter((suggestion) => suggestion.taskStatus !== "promoted")
    .filter((suggestion) => suggestion.candidates.some((candidate) => candidate.directMatches.length > 0));
  const adoptionGaps = adoptionSuggestions
    .filter((suggestion) => suggestion.candidates.length === 0)
    .map((suggestion) => ({
      taskId: suggestion.taskId,
      taskStatus: suggestion.taskStatus,
      targetMotifs: suggestion.targetMotifs,
      reason: "no-fidelity-promoted-asset-for-target-motif"
    }));
  return {
    provider: "component-learning-statistics-v1",
    createdAt: new Date().toISOString(),
    waveSummary: wave.summary || summarizeLearningStatus(tasks, components),
    ingestAttempts: summarizeIngestAttempts(ingestHistory, tasks),
    byProvider,
    byMotif,
    assetCoverageByMotif,
    adoptionCoverage: summarizeAdoptionSuggestions(adoptionSuggestions, tasks.length),
    adoptionSuggestions,
    adoptionReady,
    adoptionGaps,
    unmatchedVerifiedAssets: components
      .filter((component) => !taskIds.has(String(component.collection?.label || "")))
      .map((component) => ({ name: component.name || "", provider: component.provider || "", path: component.path || "" }))
  };
}

function buildAdoptionSuggestions(tasks = [], components = []) {
  const promoted = components.filter((component) => component.selfFidelityPromoted === true
    || (component.roleTags || []).includes("self-fidelity-promoted"));
  return tasks.map((task) => {
    const targets = normalizeMotifs(task.targetMotifs);
    const candidates = promoted
      .map((component) => {
        const motifs = componentMotifs(component);
        const directMatches = targets.filter((target) => motifs.includes(target));
        const compatibleMatches = targets.filter((target) => motifs.some((motif) => motifsCompatible(target, motif)));
        if (compatibleMatches.length === 0) return null;
        const providerMatch = String(task.provider || "") === String(component.provider || "");
        const score = directMatches.length * 100 + compatibleMatches.length * 20 + (providerMatch ? 5 : 0);
        return {
          name: String(component.name || ""),
          path: String(component.path || ""),
          provider: String(component.provider || "unknown"),
          motifs,
          directMatches,
          compatibleMatches,
          providerMatch,
          score
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
      .slice(0, 3);
    return {
      taskId: String(task.taskId || ""),
      taskStatus: String(task.status || "pending"),
      targetMotifs: targets,
      candidates
    };
  });
}

function summarizeAdoptionSuggestions(suggestions = [], totalTasks = 0) {
  const withCandidate = suggestions.filter((suggestion) => suggestion.candidates.length > 0);
  const directCandidate = withCandidate.filter((suggestion) => suggestion.candidates.some((candidate) => candidate.directMatches.length > 0));
  return {
    totalTasks: Math.max(0, Number(totalTasks) || 0),
    tasksWithPromotedAsset: withCandidate.length,
    tasksWithDirectMotifAsset: directCandidate.length,
    tasksWithoutPromotedAsset: Math.max(0, (Number(totalTasks) || 0) - withCandidate.length)
  };
}

function normalizeMotifs(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || "").trim().toLowerCase())
    .filter((value) => /^[a-z0-9-]{2,60}$/.test(value)))];
}

function motifsCompatible(target, candidate) {
  if (!target || !candidate) return false;
  if (target === candidate) return true;
  const families = [
    ["arc-arrow", "cycle-loop", "ring-node"],
    ["linear-arrow-chain", "process-chain", "step-flow", "timeline"],
    ["branch-card-flow", "tree-link", "card-grid"],
    ["lens-funnel-flow", "funnel", "magnifier"],
    ["milestone-roadmap", "timeline"],
    ["quadrant-axis", "quadrant-matrix"],
    ["pie-share-chart", "pie-chart"]
  ];
  return families.some((family) => family.includes(target) && family.includes(candidate));
}

function readIngestHistory(outDir) {
  const file = path.join(outDir, "collection-ingest-history.jsonl");
  if (!fs.existsSync(file)) return [];
  try {
    return fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((record) => record && typeof record === "object");
  } catch {
    return [];
  }
}

function summarizeIngestAttempts(history = [], tasks = []) {
  const taskIds = new Set(tasks.map((task) => String(task.taskId || "")));
  const byProvider = {};
  const totals = { total: 0, accepted: 0, rejected: 0, preflightRejected: 0, unmatched: 0 };
  for (const record of history) {
    const provider = String(record.provider || "unknown").toLowerCase();
    const accepted = nonNegativeInt(record.acceptedCount);
    const rejected = nonNegativeInt(record.rejectedCount);
    const preflightRejected = (record.rejectionReasons || [])
      .some((reason) => /^pptx-file-|^invalid-pptx-zip-signature$/.test(String(reason || "")));
    const summary = byProvider[provider] || { total: 0, accepted: 0, rejected: 0, preflightRejected: 0 };
    summary.total += 1;
    if (accepted > 0) summary.accepted += 1;
    if (rejected > 0) summary.rejected += 1;
    if (preflightRejected) summary.preflightRejected += 1;
    byProvider[provider] = summary;
    totals.total += 1;
    if (accepted > 0) totals.accepted += 1;
    if (rejected > 0) totals.rejected += 1;
    if (preflightRejected) totals.preflightRejected += 1;
    if (!taskIds.has(String(record.label || ""))) totals.unmatched += 1;
  }
  return { ...totals, byProvider };
}

function componentMotifs(component = {}) {
  const summary = component.learningSummary || {};
  const catalogMotifs = (Array.isArray(summary.componentCatalog) ? summary.componentCatalog : [])
    .flatMap((group) => Array.isArray(group?.structure?.motifs) ? group.structure.motifs : []);
  const signatureMotifs = Array.isArray(component.structureSignature?.motifs)
    ? component.structureSignature.motifs
    : [];
  return [...new Set([...catalogMotifs, ...signatureMotifs]
    .map((motif) => String(motif || "").trim().toLowerCase())
    .filter((motif) => /^[a-z0-9-]{2,60}$/.test(motif)))].sort();
}

function renderLearningStatistics(statistics = {}) {
  const summary = statistics.waveSummary || {};
  const lines = [
    "# Component Learning Statistics",
    "",
    `Verified assets: ${summary.verifiedAssets || 0}`,
    `Self-fidelity promoted: ${summary.promotedAssets || 0}`,
    `Tasks: ${summary.total || 0}; pending ${summary.status?.pending || 0}; collected ${summary.status?.collected || 0}; promoted ${summary.status?.promoted || 0}`,
    "",
    "## By Provider"
  ];
  for (const [provider, counts] of Object.entries(statistics.byProvider || {})) {
    lines.push(`- ${provider}: total ${counts.total}; pending ${counts.pending}; collected ${counts.collected}; promoted ${counts.promoted}`);
  }
  const attempts = statistics.ingestAttempts || {};
  lines.push(
    "",
    "## Ingest Attempts",
    `- total ${attempts.total || 0}; accepted ${attempts.accepted || 0}; rejected ${attempts.rejected || 0}; preflight rejected ${attempts.preflightRejected || 0}; unmatched ${attempts.unmatched || 0}`
  );
  for (const [provider, counts] of Object.entries(attempts.byProvider || {})) {
    lines.push(`- ${provider}: total ${counts.total}; accepted ${counts.accepted}; rejected ${counts.rejected}; preflight rejected ${counts.preflightRejected}`);
  }
  const adoption = statistics.adoptionCoverage || {};
  lines.push(
    "",
    "## Reuse Adoption Coverage",
    `- tasks with a fidelity-promoted asset ${adoption.tasksWithPromotedAsset || 0}/${adoption.totalTasks || 0}; direct-motif matches ${adoption.tasksWithDirectMotifAsset || 0}; no promoted asset ${adoption.tasksWithoutPromotedAsset || 0}`
  );
  for (const suggestion of (statistics.adoptionSuggestions || []).filter((item) => item.candidates.length > 0)) {
    const best = suggestion.candidates[0];
    const match = best.directMatches.length > 0 ? "direct" : "compatible";
    lines.push(`- ${suggestion.taskId}: ${match} ${best.provider}:${best.name}`);
  }
  if ((statistics.adoptionReady || []).length) {
    lines.push("", "## Ready For Reuse Adoption");
    for (const suggestion of statistics.adoptionReady) {
      const best = suggestion.candidates.find((candidate) => candidate.directMatches.length > 0);
      lines.push(`- ${suggestion.taskId}: ${best.provider}:${best.name}`);
    }
  }
  if ((statistics.adoptionGaps || []).length) {
    lines.push("", "## Learning Gaps");
    for (const gap of statistics.adoptionGaps) {
      lines.push(`- ${gap.taskId}: ${gap.targetMotifs.join(", ")}`);
    }
  }
  lines.push("", "## By Motif");
  for (const [motif, counts] of Object.entries(statistics.byMotif || {})) {
    lines.push(`- ${motif}: total ${counts.total}; pending ${counts.pending}; collected ${counts.collected}; promoted ${counts.promoted}`);
  }
  const assetCoverage = Object.entries(statistics.assetCoverageByMotif || {});
  if (assetCoverage.length) {
    lines.push("", "## Verified Asset Structure Coverage");
    for (const [motif, coverage] of assetCoverage) {
      lines.push(`- ${motif}: verified assets ${coverage.verifiedAssets}; promoted assets ${coverage.promotedAssets}; providers ${coverage.providers.join(", ")}`);
    }
  }
  if ((statistics.unmatchedVerifiedAssets || []).length) {
    lines.push("", "## Unmatched Verified Assets");
    for (const asset of statistics.unmatchedVerifiedAssets) lines.push(`- ${asset.provider}: ${asset.name}`);
  }
  return `${lines.join("\n")}\n`;
}

function summarizeByProvider(tasks = []) {
  return tasks.reduce((summary, task) => {
    summary[task.provider] = (summary[task.provider] || 0) + 1;
    return summary;
  }, {});
}

function boundedInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function nonNegativeInt(value) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

async function main() {
  const args = parseArgs(process.argv);
  const result = args.init
    ? { wave: await initializeLearningWave(args) }
    : args.extend ? await extendLearningWave(args) : refreshLearningWave(args);
  const wave = result.wave;
  process.stdout.write(`${JSON.stringify({
    total: wave.summary.total,
    byProvider: wave.summary.byProvider,
    queue: path.join(wave.outDir, "learning-wave.json"),
    guide: path.join(wave.outDir, "learning-wave.md"),
    ...((args.refresh || args.extend) ? { statistics: path.join(wave.outDir, "learning-statistics.json") } : {})
  }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  GAP_TARGETS,
  TARGETS,
  buildLearningWave,
  collectionIngestCommand,
  buildLearningStatistics,
  extendLearningWave,
  initializeLearningWave,
  parseArgs,
  refreshLearningWave,
  renderLearningWaveGuide,
  renderLearningStatistics,
  _private: {
    boundedInteger,
    buildAdoptionSuggestions,
    componentMotifs,
    findReusableFixture,
    indexVerifiedComponents,
    readIngestHistory,
    readVerifiedManifests,
    refreshTaskStatus,
    summarizeAdoptionSuggestions,
    summarizeIngestAttempts,
    summarizeByProvider,
    summarizeLearningStatus
  }
};
