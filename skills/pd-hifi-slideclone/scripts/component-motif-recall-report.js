"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  _private: plannerPrivate = {}
} = require("./lib/component-candidate-planner");

const DEFAULT_MOTIFS = [
  "arc-arrow",
  "ring-node",
  "card-grid",
  "tree-link",
  "fishbone-cause",
  "radial-link",
  "linear-arrow-chain",
  "whole-process-template",
  "lens-funnel-flow",
  "branch-card-flow",
  "layered-stack",
  "funnel-stack",
  "pyramid-stack",
  "venn-overlap",
  "intersection-overlap",
  "milestone-roadmap",
  "quadrant-axis",
  "pie-share-chart"
];

function parseArgs(argv) {
  const args = {
    candidateReports: [],
    assetManifests: [],
    inventories: [],
    motifs: null,
    out: path.join("runs", "plugin-component-inventory", "component-motif-recall-report.json"),
    failOnMissingReady: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--candidate-report" && next) {
      args.candidateReports.push(next);
      i += 1;
    } else if (arg === "--asset-manifest" && next) {
      args.assetManifests.push(next);
      i += 1;
    } else if (arg === "--inventory" && next) {
      args.inventories.push(next);
      i += 1;
    } else if (arg === "--motifs" && next) {
      args.motifs = splitList(next);
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if (arg === "--fail-on-missing-ready") {
      args.failOnMissingReady = true;
    } else {
      throw new Error(`Unknown component-motif-recall-report argument: ${arg}`);
    }
  }
  return args;
}

function buildMotifRecallReport(options = {}) {
  const motifs = normalizeMotifs(options.motifs);
  const rows = motifs.map((motif) => createMotifRow(motif));
  const byMotif = new Map(rows.map((row) => [row.motif, row]));

  for (const report of asArray(options.candidateReports)) {
    collectCandidateReport(report, byMotif);
  }
  for (const manifest of asArray(options.assetManifests)) {
    collectAssetManifest(manifest, byMotif);
  }
  for (const inventory of asArray(options.inventories)) {
    collectInventory(inventory, byMotif);
  }

  for (const row of rows) {
    row.status = classifyStatus(row);
    row.notes = buildNotes(row);
    row.suggestedCollectionActions = buildSuggestedCollectionActions(row);
  }

  const summary = summarizeRows(rows);
  return {
    provider: "component-motif-recall-report-v1",
    generatedAt: new Date().toISOString(),
    summary,
    rows
  };
}

function createMotifRow(motif) {
  return {
    motif,
    expectedKeywords: motifKeywords(motif),
    plannedQueries: 0,
    candidateDocuments: 0,
    candidateHits: 0,
    localAssets: 0,
    localStructureMatches: 0,
    inventoryStructureCoverage: 0,
    appliedComponentAssets: 0,
    downloadableCandidates: 0,
    sources: {
      candidateReports: [],
      assetManifests: [],
      inventories: []
    },
    sampleTitles: [],
    sampleAssets: [],
    suggestedCollectionActions: [],
    status: "missing",
    notes: []
  };
}

function collectCandidateReport(report, byMotif) {
  if (!report || typeof report !== "object") return;
  const source = sourceName(report);
  for (const layer of candidateLayers(report)) {
    const targetMotifs = motifsForCandidateLayer(layer);
    const documents = candidateDocumentsForLayer(layer);
    for (const motif of targetMotifs) {
      const row = byMotif.get(motif);
      if (!row) continue;
      row.sources.candidateReports.push(source);
      row.plannedQueries += countQueriesForMotif(layer, motif);
      row.candidateDocuments += documents.length;
      row.candidateHits += countDocumentsMatchingMotif(documents, motif);
      row.downloadableCandidates += countDownloadableDocuments(documents);
      addSamples(row.sampleTitles, documents.map((document) => document.title || document.name || document.id));
    }
  }
}

function collectAssetManifest(manifest, byMotif) {
  if (!manifest || typeof manifest !== "object") return;
  const source = sourceName(manifest);
  for (const layer of assetManifestLayers(manifest)) {
    for (const asset of localAssetsForLayer(layer)) {
      const motifs = motifsForAsset(asset);
      for (const motif of motifs) {
        const row = byMotif.get(motif);
        if (!row) continue;
        row.sources.assetManifests.push(source);
        row.localAssets += 1;
        if (hasStructureMatch(asset, motif)) row.localStructureMatches += 1;
        if (isAppliedComponentAsset(asset)) row.appliedComponentAssets += 1;
        addSamples(row.sampleAssets, [asset.title || asset.name || asset.path || asset.id]);
      }
    }
  }
}

function collectInventory(inventory, byMotif) {
  if (!inventory || typeof inventory !== "object") return;
  const source = sourceName(inventory);
  collectInventorySummaryCoverage(inventory, byMotif, source);
  for (const item of inventoryItems(inventory)) {
    const motifs = motifsForInventoryItem(item);
    for (const motif of motifs) {
      const row = byMotif.get(motif);
      if (!row) continue;
      row.sources.inventories.push(source);
      row.localAssets += 1;
      if (hasStructureMatch(item, motif)) row.localStructureMatches += 1;
      if (isAppliedComponentAsset(item)) row.appliedComponentAssets += 1;
      addSamples(row.sampleAssets, [item.title || item.name || item.path || item.id]);
    }
  }
}

function collectInventorySummaryCoverage(inventory, byMotif, source) {
  const coverage = inventory?.summary?.byStructureMotif || {};
  if (!coverage || typeof coverage !== "object") return;
  for (const [motif, rawCount] of Object.entries(coverage)) {
    const normalized = normalizeDetectedMotifs([motif])[0];
    const row = normalized ? byMotif.get(normalized) : null;
    if (!row) continue;
    const count = Math.max(1, Math.round(Number(rawCount) || 1));
    row.sources.inventories.push(source);
    row.inventoryStructureCoverage += count;
    row.localStructureMatches += count;
  }
}

function candidateLayers(report) {
  if (Array.isArray(report.layers) && report.layers.length) return report.layers;
  if (Array.isArray(report.results) && report.results.length) return report.results;
  if (Array.isArray(report.items) && report.items.length) return report.items;
  return [report];
}

function assetManifestLayers(manifest) {
  if (Array.isArray(manifest.layers)) return manifest.layers;
  if (Array.isArray(manifest.items)) return manifest.items;
  return [];
}

function inventoryItems(inventory) {
  if (Array.isArray(inventory.items)) return inventory.items;
  if (Array.isArray(inventory.assets)) return inventory.assets;
  if (Array.isArray(inventory.components)) return inventory.components;
  if (Array.isArray(inventory.candidates)) return inventory.candidates;
  return [];
}

function motifsForInventoryItem(item = {}) {
  return normalizeDetectedMotifs([
    ...asArray(item.targetMotifs),
    ...asArray(item.structureSignature?.motifs),
    ...Object.keys(item.structureSignature?.motifCounts || {}),
    ...motifsForText([
      item.title,
      item.name,
      item.id,
      item.path,
      item.assetKind,
      item.reusePolicy,
      ...asArray(item.tags),
      ...asArray(item.roleTags),
      ...asArray(item.reasonCodes)
    ].filter(Boolean).join(" "))
  ]);
}

function motifsForCandidateLayer(layer) {
  const motifs = [
    ...asArray(layer.targetMotifs),
    ...asArray(layer.plan && layer.plan.targetMotifs),
    ...asArray(layer.diagramUnderstanding && layer.diagramUnderstanding.targetMotifs),
    ...asArray(layer.diagramUnderstanding && layer.diagramUnderstanding.componentStrategy && layer.diagramUnderstanding.componentStrategy.targetMotifs),
    ...asArray(layer.componentStrategy && layer.componentStrategy.targetMotifs)
  ];
  return normalizeMotifs(motifs.length ? motifs : motifsForText(JSON.stringify(layer)));
}

function candidateDocumentsForLayer(layer) {
  return [
    ...asArray(layer.bestCandidates),
    ...asArray(layer.candidates),
    ...asArray(layer.documents),
    ...asArray(layer.results)
  ].filter(Boolean);
}

function countQueriesForMotif(layer, motif) {
  const queries = [
    ...asArray(layer.queries),
    ...asArray(layer.plan && layer.plan.queries),
    ...asArray(layer.searchQueries)
  ];
  if (!queries.length) return motifsForCandidateLayer(layer).includes(motif) ? 1 : 0;
  return queries.filter((query) => textMatchesMotif(JSON.stringify(query), motif)).length;
}

function countDocumentsMatchingMotif(documents, motif) {
  return documents.filter((document) => textMatchesMotif(JSON.stringify(document), motif)).length;
}

function countDownloadableDocuments(documents) {
  return documents.filter((document) => {
    if (!document || typeof document !== "object") return false;
    return Boolean(document.downloadUrl || document.downloadURL || document.url || document.file || document.localPath || document.path);
  }).length;
}

function localAssetsForLayer(layer) {
  return [
    ...asArray(layer.localAssets),
    ...asArray(layer.assets),
    ...asArray(layer.matches)
  ].filter(Boolean);
}

function motifsForAsset(asset) {
  const signature = asset.structureSignature || asset.structure || {};
  const motifs = [
    signature.primaryMotif,
    ...asArray(signature.motifs),
    ...Object.keys(signature.motifCounts || {}),
    ...asArray(asset.targetMotifs),
    ...motifsForText(`${asset.title || ""} ${asset.name || ""} ${asArray(asset.roleTags).join(" ")} ${asset.path || ""}`)
  ];
  return normalizeDetectedMotifs(motifs);
}

function hasStructureMatch(asset, motif) {
  const signature = asset.structureSignature || asset.structure || {};
  return signature.primaryMotif === motif || asArray(signature.motifs).includes(motif) || Boolean((signature.motifCounts || {})[motif]);
}

function isAppliedComponentAsset(asset) {
  const text = `${asset.provider || ""} ${asset.source || ""} ${asset.assetKind || ""} ${asArray(asset.roleTags).join(" ")}`.toLowerCase();
  return text.includes("applied") || text.includes("component") || text.includes("islide") || text.includes("officeplus");
}

function classifyStatus(row) {
  if (row.localStructureMatches > 0 && row.appliedComponentAssets > 0) return "ready";
  if (row.localStructureMatches > 0) return "local-structure-only";
  if (row.candidateHits > 0 && row.localAssets > 0) return "search-and-local";
  if (row.candidateHits > 0 || row.downloadableCandidates > 0) return "search-only";
  if (row.localAssets > 0) return "local-only";
  if (row.plannedQueries > 0) return "planned-only";
  return "missing";
}

function buildNotes(row) {
  const notes = [];
  if (!row.plannedQueries) notes.push("no motif-specific search query was observed");
  if (!row.candidateHits) notes.push("no candidate title/tag matched motif keywords");
  if (!row.localStructureMatches) notes.push("no harvested local asset exposes this motif in its structure signature");
  if (!row.appliedComponentAssets) notes.push("no applied OfficePLUS/iSlide component asset was identified");
  return notes;
}

function summarizeRows(rows) {
  const byStatus = {};
  for (const row of rows) byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  return {
    motifs: rows.length,
    ready: byStatus.ready || 0,
    searchable: rows.filter((row) => row.candidateHits > 0 || row.downloadableCandidates > 0).length,
    localStructured: rows.filter((row) => row.localStructureMatches > 0).length,
    appliedComponentBacked: rows.filter((row) => row.appliedComponentAssets > 0).length,
    byStatus
  };
}

function buildSuggestedCollectionActions(row) {
  if (row.status === "ready") return [];
  const keywords = row.expectedKeywords.slice(0, 4);
  const actions = [];
  if (row.localStructureMatches === 0) {
    actions.push({
      action: "search-plugin-component-library",
      providers: ["islide", "officeplus"],
      keywords,
      reason: "no local component exposes this motif in a structure signature"
    });
  }
  if (row.appliedComponentAssets === 0) {
    actions.push({
      action: "apply-and-harvest-plugin-component",
      providers: ["islide", "officeplus"],
      keywords,
      command: "node skills\\pd-hifi-slideclone\\scripts\\watch-plugin-component-downloads.js --provider all --active-powerpoint --duration-ms 30000 --poll-ms 500 --out runs\\plugin-component-inventory\\watched-plugin-components",
      reason: "the motif is not backed by an applied OfficePLUS/iSlide PPTX component"
    });
  }
  if (row.candidateHits > 0 || row.downloadableCandidates > 0) {
    actions.push({
      action: "resolve-candidate-downloads",
      keywords,
      reason: "search already found candidate documents; download/apply one matching component and refresh inventory"
    });
  } else if (row.plannedQueries > 0) {
    actions.push({
      action: "run-live-component-acquisition-search",
      keywords,
      command: `node skills\\pd-hifi-slideclone\\scripts\\component-acquisition-search.js --asset-manifest runs\\plugin-component-inventory\\component-asset-manifest.json --out runs\\plugin-component-inventory\\component-acquisition-search.json`,
      reason: "queries were planned but no matching candidate document was observed"
    });
  }
  return actions;
}

function motifKeywords(motif) {
  const fn = plannerPrivate.targetMotifKeywords;
  if (typeof fn === "function") return fn([motif]).filter(Boolean);
  return fallbackMotifKeywords(motif);
}

function fallbackMotifKeywords(motif) {
  const keywords = {
    "arc-arrow": ["圆弧箭头", "环形箭头", "循环箭头"],
    "ring-node": ["环形节点", "圆环节点"],
    "card-grid": ["卡片矩阵", "矩阵卡片", "宫格卡片"],
    "tree-link": ["树状层级", "组织结构图", "层级关系图"],
    "fishbone-cause": ["鱼骨图", "因果分析", "根因分析", "Ishikawa", "cause effect diagram"],
    "radial-link": ["中心辐射", "放射关系图", "径向关系"],
    "linear-arrow-chain": ["箭头流程", "步骤箭头", "流程箭头", "时间轴", "路线图", "roadmap", "timeline"],
    "whole-process-template": ["整组流程组件", "流程组件", "步骤组件", "一体化流程图", "process diagram"],
    "lens-funnel-flow": ["放大镜流程", "漏斗流程", "需求分析", "聚焦分析", "magnifier funnel", "lens funnel"],
    "branch-card-flow": ["分支卡片流程", "树状卡片流程", "输出卡片", "branch cards", "card branch flow"],
    "layered-stack": ["分层图", "层级图", "阶梯图", "layered stack"],
    "funnel-stack": ["漏斗图", "分层漏斗", "漏斗组件", "funnel diagram"],
    "pyramid-stack": ["金字塔", "金字塔图", "金字塔组件", "pyramid diagram"],
    "venn-overlap": ["Venn图", "韦恩图", "集合关系", "重叠关系", "venn diagram"],
    "intersection-overlap": ["交集关系", "交集图", "重叠交集", "intersection diagram"],
    "milestone-roadmap": ["时间轴", "里程碑", "路线图", "roadmap", "milestone timeline"],
    "quadrant-axis": ["四象限", "象限图", "优先级矩阵", "影响成本矩阵", "impact effort matrix"],
    "pie-share-chart": ["饼图", "扇区占比图", "份额占比图", "pie chart", "proportion chart"]
  };
  return keywords[motif] || [motif];
}

function motifsForText(text) {
  const normalized = String(text || "").toLowerCase();
  return DEFAULT_MOTIFS.filter((motif) => textMatchesMotif(normalized, motif));
}

function textMatchesMotif(text, motif) {
  const normalized = String(text || "").toLowerCase();
  if (normalized.includes(motif.toLowerCase())) return true;
  return motifKeywords(motif).some((keyword) => normalized.includes(String(keyword).toLowerCase()));
}

function normalizeMotifs(motifs) {
  const values = asArray(motifs).flatMap((value) => splitList(value));
  const normalized = values
    .map((value) => String(value || "").trim())
    .filter((value) => DEFAULT_MOTIFS.includes(value));
  return [...new Set(normalized.length ? normalized : DEFAULT_MOTIFS)];
}

function normalizeDetectedMotifs(motifs) {
  const values = asArray(motifs).flatMap((value) => splitList(value));
  return [...new Set(values
    .map((value) => String(value || "").trim())
    .filter((value) => DEFAULT_MOTIFS.includes(value)))];
}

function splitList(value) {
  if (Array.isArray(value)) return value.flatMap(splitList);
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function addSamples(target, values) {
  for (const value of values) {
    if (!value) continue;
    const text = String(value);
    if (!target.includes(text)) target.push(text);
    if (target.length >= 5) break;
  }
}

function sourceName(input) {
  return input && (input.source || input.file || input.provider || input.reportPath || "inline");
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function main() {
  const args = parseArgs(process.argv);
  const report = buildMotifRecallReport({
    motifs: args.motifs,
    candidateReports: args.candidateReports.map(readJson),
    assetManifests: args.assetManifests.map(readJson),
    inventories: args.inventories.map(readJson)
  });
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`motifs: ${report.summary.motifs}`);
  console.log(`ready: ${report.summary.ready}`);
  console.log(`report: ${path.resolve(args.out)}`);
  if (args.failOnMissingReady && report.summary.ready < report.summary.motifs) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  buildMotifRecallReport,
  _private: {
    classifyStatus,
    buildSuggestedCollectionActions,
    inventoryItems,
    motifsForCandidateLayer,
    motifsForAsset,
    motifsForInventoryItem,
    normalizeDetectedMotifs,
    textMatchesMotif
  }
};
