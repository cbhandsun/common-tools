"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { motifTokens, sanitizeMotifs } = require("./lib/component-motifs");
const { getOfficePlusDownloadUrl, searchOfficePlusComponents } = require("./lib/officeplus-search");
const { searchIslideContents } = require("./lib/islide-search");

function parseArgs(argv) {
  const args = {
    manifest: "",
    coverageMatrix: "",
    repairCoverage: "",
    out: path.join("runs", "plugin-component-inventory", "component-acquisition-search.json"),
    size: 6,
    maxTasks: 20,
    maxKeywordsPerTask: 3,
    maxDownloadUrls: 6,
    resolveOfficePlusDownloads: false,
    dryRun: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--manifest" || arg === "--in") && next) {
      args.manifest = next;
      i += 1;
    } else if ((arg === "--coverage-matrix" || arg === "--coverage") && next) {
      args.coverageMatrix = next;
      i += 1;
    } else if ((arg === "--repair-coverage" || arg === "--expression-policy-coverage") && next) {
      args.repairCoverage = next;
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if (arg === "--size" && next) {
      args.size = Number(next);
      i += 1;
    } else if (arg === "--max-tasks" && next) {
      args.maxTasks = Number(next);
      i += 1;
    } else if (arg === "--max-keywords-per-task" && next) {
      args.maxKeywordsPerTask = Number(next);
      i += 1;
    } else if (arg === "--max-download-urls" && next) {
      args.maxDownloadUrls = Number(next);
      i += 1;
    } else if (arg === "--resolve-officeplus-downloads") {
      args.resolveOfficePlusDownloads = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else {
      throw new Error(`Unknown component-acquisition-search argument: ${arg}`);
    }
  }
  if (!args.manifest && !args.coverageMatrix && !args.repairCoverage) {
    throw new Error("--manifest, --coverage-matrix, or --repair-coverage is required");
  }
  return args;
}

async function runComponentAcquisitionSearch(options = {}) {
  const source = loadAcquisitionTaskSource(options);
  const tasks = source.tasks
    .slice(0, normalizePositiveInt(options.maxTasks, 20));
  const fetchImpl = options.fetchImpl;
  const results = [];
  for (const task of tasks) {
    const keywordRuns = [];
    for (const keywords of taskKeywords(task).slice(0, normalizePositiveInt(options.maxKeywordsPerTask, 3))) {
      if (options.dryRun === true) {
        keywordRuns.push({
          keywords,
          status: "planned",
          total: 0,
          documents: []
        });
        continue;
      }
      try {
        const result = await searchForTask({ task, keywords, size: options.size, fetchImpl });
        keywordRuns.push({
          keywords,
          status: "ok",
          total: result.total,
          hasMore: result.hasMore,
          documents: result.documents.map((document) => scoreAcquisitionDocument(document, task)).slice(0, normalizePositiveInt(options.size, 6))
        });
      } catch (error) {
        keywordRuns.push({
          keywords,
          status: "error",
          error: safeErrorMessage(error)
        });
      }
    }
    const bestDocuments = keywordRuns
      .flatMap((run) => (run.documents || []).map((document) => ({ ...document, matchedKeywords: run.keywords })))
      .sort((a, b) => Number(b.acquisitionScore || 0) - Number(a.acquisitionScore || 0) || safeString(a.id).localeCompare(safeString(b.id)))
      .slice(0, normalizePositiveInt(options.size, 6));
    const resolvedBestDocuments = options.resolveOfficePlusDownloads === true
      ? await resolveDownloadUrlsForDocuments(bestDocuments, {
        fetchImpl,
        maxDownloadUrls: options.maxDownloadUrls
      })
      : bestDocuments;
    results.push({
      task,
      status: keywordRuns.some((run) => run.status === "ok") ? "ok" : keywordRuns.some((run) => run.status === "planned") ? "planned" : "error",
      keywordRuns,
      bestDocuments: resolvedBestDocuments
    });
  }
  return {
    provider: "component-acquisition-search-v1",
    ...source.metadata,
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun === true,
    summary: summarizeResults(results),
    results
  };
}

function loadAcquisitionTaskSource(options = {}) {
  const manifestValue = safeString(options.manifest);
  if (manifestValue) {
    const manifestFile = path.resolve(manifestValue);
    return {
      tasks: collectAcquisitionTasks(readJson(manifestFile)),
      metadata: {
        sourceType: "component-asset-manifest",
        manifest: manifestFile
      }
    };
  }
  const coverageValue = safeString(options.coverageMatrix || options.coverage);
  if (coverageValue) {
    const coverageMatrixFile = path.resolve(coverageValue);
    return {
      tasks: collectCoverageAcquisitionTasks(readJson(coverageMatrixFile)),
      metadata: {
        sourceType: "component-coverage-matrix",
        coverageMatrix: coverageMatrixFile
      }
    };
  }
  const repairCoverageValue = safeString(options.repairCoverage || options.expressionPolicyCoverage);
  if (repairCoverageValue) {
    const repairCoverageFile = path.resolve(repairCoverageValue);
    return {
      tasks: collectRepairCoverageAcquisitionTasks(readJson(repairCoverageFile)),
      metadata: {
        sourceType: "expression-policy-repair-coverage",
        repairCoverage: repairCoverageFile
      }
    };
  }
  throw new Error("--manifest, --coverage-matrix, or --repair-coverage is required");
}

function collectAcquisitionTasks(manifest = {}) {
  const tasks = [];
  const seen = new Set();
  for (const layer of Array.isArray(manifest.layers) ? manifest.layers : []) {
    const layerKey = safeString(layer.layerKey);
    for (const task of Array.isArray(layer.componentAcquisitionTasks) ? layer.componentAcquisitionTasks : []) {
      const normalized = normalizeTask(task, layerKey);
      const key = [
        normalized.layerKey,
        normalized.provider,
        normalized.kind,
        normalized.keywords,
        normalized.targetMotifs.join(",")
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      tasks.push(normalized);
    }
  }
  return tasks;
}

function collectCoverageAcquisitionTasks(coverageMatrix = {}) {
  const tasks = [];
  const seen = new Set();
  const examples = [
    ...safeArray(coverageMatrix?.totals?.componentAssetAcquisitionExamples),
    ...safeArray(coverageMatrix?.rows).flatMap((row) => safeArray(row?.componentAssetAcquisitionExamples))
  ];
  for (const example of examples) {
    const layerKey = safeString(example?.layerKey);
    const deck = safeString(example?.deck);
    const normalized = normalizeTask(example, layerKey);
    const key = [
      deck,
      normalized.layerKey,
      normalized.provider,
      normalized.kind,
      normalized.keywords,
      normalized.targetMotifs.join(",")
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    tasks.push({
      ...normalized,
      deck
    });
  }
  return tasks;
}

function collectRepairCoverageAcquisitionTasks(repairCoverage = {}) {
  const tasks = [];
  const seen = new Set();
  const dispositions = Array.isArray(repairCoverage?.decks)
    ? repairCoverage.decks.flatMap((deck) => safeArray(deck.finalDeckDispositions).map((item) => ({ ...item, deck: safeString(deck.deck || item.deck) })))
    : [];
  for (const disposition of dispositions) {
    if (safeString(disposition.action) !== "replacement-candidate") continue;
    for (const task of acquisitionTasksFromRepairDisposition(disposition)) {
      const key = [
        task.deck,
        task.layerKey,
        task.provider,
        task.kind,
        task.keywords,
        task.targetMotifs.join(",")
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      tasks.push(task);
    }
  }
  return tasks;
}

function acquisitionTasksFromRepairDisposition(disposition = {}) {
  if (!isRepairDispositionSemanticStructure(disposition)) return [];
  if (shouldPreserveRepairDispositionAsSingleCrop(disposition)) return [];
  const deck = safeString(disposition.deck);
  const layerKey = [
    deck,
    `p${Number(disposition.page || 0) || 0}`,
    safeString(disposition.imageId || `image-${Number(disposition.image || 0) || 0}`)
  ].filter(Boolean).join(":");
  const profile = repairDispositionSearchProfile(disposition);
  return [
    normalizeTask({
      provider: "officeplus",
      kind: "component",
      keywords: profile.keywords,
      alternateKeywords: profile.alternateKeywords,
      targetMotifs: profile.targetMotifs,
      templateFamily: profile.templateFamily,
      reason: profile.reason
    }, layerKey),
    normalizeTask({
      provider: "islide",
      kind: "smartdiagram",
      keywords: profile.keywords,
      alternateKeywords: profile.alternateKeywords,
      targetMotifs: profile.targetMotifs,
      templateFamily: profile.templateFamily,
      reason: profile.reason
    }, layerKey)
  ].map((task) => ({ ...task, deck }));
}

function shouldPreserveRepairDispositionAsSingleCrop(disposition = {}) {
  const unitDisposition = safeString(disposition.unitDisposition).toLowerCase();
  if (unitDisposition === "intentional-visual-crop"
    || unitDisposition === "intentional-decorative-crop"
    || unitDisposition === "hybrid-crop-with-native-overlays") return true;
  const policy = safeString(disposition.minimumUnitPolicy).toLowerCase();
  if (policy !== "preserve-as-single-crop") return false;
  const text = [
    disposition.detector,
    disposition.expressionKind,
    disposition.expressionForm,
    disposition.expressionSubtype,
    disposition.violation,
    disposition.reason,
    disposition.imageId
  ].map(safeString).join(" ").toLowerCase();
  return /icon|logo|illustration|visual-example|component-preview|screenshot|screen|photo|mockup|demo|sample|example|pictogram|clipart|sticker|ornament|badge|图标|插画|图示|示意图|截图|样例|示例|素材/.test(text);
}

function isRepairDispositionSemanticStructure(disposition = {}) {
  const unitDisposition = safeString(disposition.unitDisposition).toLowerCase();
  if (unitDisposition) return unitDisposition === "semantic-native-structure";
  return safeString(disposition.minimumUnitPolicy).toLowerCase() !== "preserve-as-single-crop";
}

function repairDispositionSearchProfile(disposition = {}) {
  const text = [
    disposition.detector,
    disposition.expressionKind,
    disposition.expressionForm,
    disposition.expressionSubtype,
    disposition.minimumUnitPolicy,
    disposition.recommendedRoute,
    disposition.recommendedFamily,
    disposition.recommendedMotif,
    disposition.family,
    disposition.motif,
    disposition.violation,
    disposition.reason,
    disposition.imageId
  ].map(safeString).join(" ").toLowerCase();
  if (/table|matrix|grid|表格|矩阵/.test(text)) {
    return searchProfile("矩阵卡片表格图示", ["卡片矩阵", "表格流程图"], ["card-grid"], "matrix-grid", disposition);
  }
  if (/arc|cycle|circular|loop|ring|循环|圆弧|环形/.test(text)) {
    return searchProfile("循环箭头流程图", ["圆弧箭头", "环形流程"], ["arc-arrow"], "cycle-arrow", disposition);
  }
  if (/tree(?!map)|hierarchy|org|层级|树状/.test(text)) {
    return searchProfile("树状层级关系图", ["组织结构图", "层级关系"], ["tree-link"], "tree-hierarchy", disposition);
  }
  if (/hub|spoke|radial|中心|辐射/.test(text)) {
    return searchProfile("中心辐射关系图", ["放射关系图", "径向关系"], ["radial-link"], "hub-spoke", disposition);
  }
  if (/pie|share|donut|doughnut|饼图|环形图|圆环图/.test(text)) {
    return searchProfile("占比图表组件", ["饼图图示", "环形图"], ["pie-share-chart", "donut-segment-chart"], "chart", disposition);
  }
  if (/treemap|矩形树图|树图|面积图/.test(text)) {
    return searchProfile("矩形树图图表组件", ["树图图表", "面积占比图"], ["treemap-chart"], "treemap-chart", disposition);
  }
  if (/bubble|scatter|气泡|散点/.test(text)) {
    return searchProfile("气泡散点图组件", ["气泡图", "散点图"], ["bubble-scatter-chart"], "scatter-chart", disposition);
  }
  if (/sankey|桑基|流向|能流/.test(text)) {
    return searchProfile("桑基流向图组件", ["桑基图", "流向图"], ["sankey-flow-chart"], "sankey-flow-chart", disposition);
  }
  if (/map|geo|region|地图|地理|区域/.test(text)) {
    return searchProfile("地图区域图表组件", ["区域地图", "地图图表"], ["map-chart"], "map-chart", disposition);
  }
  if (/word.?cloud|keyword|词云|关键词|标签云/.test(text)) {
    return searchProfile("词云关键词图组件", ["词云图", "关键词云"], ["word-cloud-chart"], "word-cloud-chart", disposition);
  }
  if (/waterfall|瀑布/.test(text)) {
    return searchProfile("瀑布图表组件", ["瀑布图", "增减分析图"], ["waterfall-chart"], "waterfall-chart", disposition);
  }
  if (/gauge|dial|speedometer|仪表盘|仪表|进度仪表/.test(text)) {
    return searchProfile("仪表盘进度图组件", ["仪表盘", "进度仪表"], ["gauge-chart"], "gauge-chart", disposition);
  }
  if (/radar|spider|雷达|蛛网/.test(text)) {
    return searchProfile("雷达图表组件", ["雷达图", "蛛网图"], ["radar-chart"], "radar-chart", disposition);
  }
  if (/flow|process|chain|arrow|collaboration|wms|流程|箭头/.test(text)) {
    return searchProfile("流程箭头组件", ["步骤流程图", "线性流程"], ["linear-arrow-chain", "whole-process-template"], "process-flow", disposition);
  }
  return searchProfile("结构关系图组件", ["流程图组件", "关系图"], ["whole-process-template"], "generic-structure", disposition);
}

function searchProfile(keywords, alternateKeywords, targetMotifs, templateFamily, disposition = {}) {
  return {
    keywords,
    alternateKeywords,
    targetMotifs,
    templateFamily,
    reason: [
      "expression-policy-final-disposition:replacement-candidate",
      safeString(disposition.detector),
      safeString(disposition.minimumUnitPolicy)
    ].filter(Boolean).join("; ")
  };
}

function normalizeTask(task = {}, layerKey = "") {
  return {
    layerKey,
    provider: normalizeProvider(task.provider),
    kind: safeString(task.kind || "component").toLowerCase(),
    keywords: safeString(task.keywords || "关系图").slice(0, 80),
    alternateKeywords: sanitizeStringArray(task.alternateKeywords).slice(0, 8),
    targetMotifs: sanitizeMotifs(task.targetMotifs),
    templateFamily: safeString(task.templateFamily || "generic"),
    reason: safeString(task.reason).slice(0, 300)
  };
}

function taskKeywords(task = {}) {
  return [...new Set([task.keywords, ...(task.alternateKeywords || [])].map(safeString).filter(Boolean))];
}

async function searchForTask({ task, keywords, size, fetchImpl }) {
  if (task.provider === "islide") {
    return searchIslideContents({
      kind: task.kind,
      keywords,
      size,
      fetchImpl
    });
  }
  return searchOfficePlusComponents({
    kind: task.kind,
    keywords,
    size,
    fetchImpl
  });
}

function scoreAcquisitionDocument(document = {}, task = {}) {
  const text = `${document.title || ""} ${document.description || ""} ${(document.tags || []).join(" ")}`.toLowerCase();
  let score = Number(document.candidateScore || document.score || 0);
  for (const keyword of taskKeywords(task)) {
    if (keyword && text.includes(keyword.toLowerCase())) score += 18;
  }
  for (const token of motifTokens(task.targetMotifs)) {
    if (token && text.includes(token.toLowerCase())) score += 12;
  }
  if (task.provider === "officeplus" && task.kind === "component" && document.reuseHint === "candidate-grouped-pptx-component") score += 34;
  if (task.provider === "islide" && task.kind === "smartdiagram") score += 30;
  if (task.provider === "islide" && task.kind === "diagram") score += 24;
  if (document.downloadable === true) score += 12;
  if (document.coverUrl) score += 4;
  return {
    ...document,
    acquisitionScore: round(score),
    acquisitionProvider: task.provider,
    acquisitionKind: task.kind,
    targetMotifs: task.targetMotifs
  };
}

async function resolveDownloadUrlsForDocuments(documents = [], options = {}) {
  const limit = normalizePositiveInt(options.maxDownloadUrls, 6);
  let attempted = 0;
  const resolved = [];
  for (const document of documents) {
    if (!shouldResolveOfficePlusDownload(document) || attempted >= limit) {
      resolved.push(document);
      continue;
    }
    attempted += 1;
    try {
      const download = await getOfficePlusDownloadUrl(document.id, {
        kind: document.kind || document.acquisitionKind,
        anonymous: true,
        fetchImpl: options.fetchImpl
      });
      resolved.push({
        ...document,
        downloadLookup: {
          status: download.downloadUrl ? "ok" : "empty",
          endpoint: download.endpoint,
          downloadUrl: download.downloadUrl
        }
      });
    } catch (error) {
      resolved.push({
        ...document,
        downloadLookup: {
          status: "error",
          error: safeErrorMessage(error)
        }
      });
    }
  }
  return resolved;
}

function shouldResolveOfficePlusDownload(document = {}) {
  return document.acquisitionProvider === "officeplus"
    && /^[A-Za-z]+Content-\d+$/.test(safeString(document.id))
    && /^(component|shape|vector|icon|textbox|ppt)$/.test(safeString(document.kind || document.acquisitionKind));
}

function summarizeResults(results = []) {
  const summary = {
    tasks: results.length,
    ok: 0,
    planned: 0,
    error: 0,
    documents: 0,
    downloadableDocuments: 0,
    downloadUrlResolved: 0,
    downloadUrlErrors: 0,
    byProvider: {},
    byMotif: {}
  };
  for (const result of results) {
    if (result.status === "ok") summary.ok += 1;
    else if (result.status === "planned") summary.planned += 1;
    else summary.error += 1;
    addCount(summary.byProvider, result.task?.provider || "unknown");
    for (const motif of result.task?.targetMotifs || []) addCount(summary.byMotif, motif);
    const docs = result.bestDocuments || [];
    summary.documents += docs.length;
    summary.downloadableDocuments += docs.filter((doc) => doc.downloadable === true || doc.reuseHint === "candidate-grouped-pptx-component").length;
    summary.downloadUrlResolved += docs.filter((doc) => doc.downloadLookup?.status === "ok" && doc.downloadLookup?.downloadUrl).length;
    summary.downloadUrlErrors += docs.filter((doc) => doc.downloadLookup?.status === "error").length;
  }
  return summary;
}

function sanitizeStringArray(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => safeString(value).slice(0, 80))
    .filter(Boolean);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeProvider(value) {
  const provider = safeString(value).toLowerCase();
  return provider === "islide" ? "islide" : "officeplus";
}

function addCount(target, key) {
  const safeKey = safeString(key || "unknown");
  if (!safeKey) return;
  target[safeKey] = (target[safeKey] || 0) + 1;
}

function normalizePositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8"));
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function safeErrorMessage(error) {
  return safeString(error?.message || error).slice(0, 500);
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function main() {
  const args = parseArgs(process.argv);
  const report = await runComponentAcquisitionSearch(args);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`component acquisition tasks: ${report.summary.tasks}`);
  console.log(`ok/planned/error: ${report.summary.ok}/${report.summary.planned}/${report.summary.error}`);
  console.log(`documents: ${report.summary.documents}`);
  console.log(`report: ${path.resolve(args.out)}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}

module.exports = {
  collectAcquisitionTasks,
  collectCoverageAcquisitionTasks,
  collectRepairCoverageAcquisitionTasks,
  parseArgs,
  runComponentAcquisitionSearch,
  scoreAcquisitionDocument,
  shouldResolveOfficePlusDownload,
  _private: {
    acquisitionTasksFromRepairDisposition,
    isRepairDispositionSemanticStructure,
    motifTokens,
    normalizeTask,
    repairDispositionSearchProfile,
    shouldPreserveRepairDispositionAsSingleCrop,
    resolveDownloadUrlsForDocuments,
    summarizeResults,
    taskKeywords
  }
};
