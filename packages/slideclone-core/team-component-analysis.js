"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_SOURCE_BYTES = 60 * 1024 * 1024;
const MAX_REPORT_BYTES = 4 * 1024 * 1024;
const MAX_IMAGES = 2000;
const MAX_COMPONENT_FAMILY_ROWS = 24;
const COMPONENT_FAMILIES = new Set([
  "cycle-loop",
  "matrix-table",
  "hierarchy-tree",
  "fishbone-cause",
  "relationship-network",
  "process-flow",
  "funnel-flow",
  "layered-architecture",
  "pyramid-stack",
  "overlap-diagram",
  "timeline-roadmap",
  "metric-card-grid",
  "specialty-chart"
]);
const COMPONENT_FAMILY_BY_MOTIF = Object.freeze({
  "arc-arrow": "cycle-loop",
  "cycle-loop": "cycle-loop",
  "card-grid": "matrix-table",
  "dashboard-card-grid": "metric-card-grid",
  "quadrant-axis": "matrix-table",
  "comparison-matrix": "matrix-table",
  "heatmap-matrix": "matrix-table",
  "tree-link": "hierarchy-tree",
  "org-hierarchy": "hierarchy-tree",
  "fishbone-cause": "fishbone-cause",
  "radial-link": "relationship-network",
  "topology-network": "relationship-network",
  "branch-card-flow": "process-flow",
  "linear-arrow-chain": "process-flow",
  "swimlane-flow": "process-flow",
  "whole-process-template": "process-flow",
  "sankey-flow-chart": "specialty-chart",
  "funnel-stack": "funnel-flow",
  "layered-stack": "layered-architecture",
  "pyramid-stack": "pyramid-stack",
  "venn-overlap": "overlap-diagram",
  "intersection-overlap": "overlap-diagram",
  "milestone-roadmap": "timeline-roadmap",
  "gantt-roadmap": "timeline-roadmap",
  "donut-segment-chart": "specialty-chart",
  "pie-share-chart": "specialty-chart",
  "treemap-chart": "specialty-chart",
  "bubble-scatter-chart": "specialty-chart",
  "map-chart": "specialty-chart",
  "word-cloud-chart": "specialty-chart",
  "waterfall-chart": "specialty-chart",
  "gauge-chart": "specialty-chart",
  "radar-chart": "specialty-chart"
});

function createTeamComponentAnalysis(dependencies = {}) {
  const required = ["rebuildDeckFromWorkDir", "searchIrComponentCandidates", "buildComponentAssetManifest", "buildComponentStrategyIndex", "buildComponentAssetIndex"];
  for (const name of required) if (typeof dependencies[name] !== "function") throw new TypeError(`component analysis ${name} is required`);
  if (!isPlainObject(dependencies.inventory)) throw new TypeError("component analysis inventory is invalid");

  return Object.freeze({
    async resolve({ workDir, root, metadata, isCancellationRequested } = {}) {
      try {
        if (typeof isCancellationRequested === "function" && await isCancellationRequested()) throw new Error("cancelled");
        const paths = resolveOwnedPaths(workDir, root);
        const source = readSourceFingerprint(metadata);
        const analysisDir = path.join(paths.root, ".component-analysis");
        fs.mkdirSync(analysisDir, { recursive: true });
        assertOwnedDirectory(analysisDir, paths.root);
        const preDeck = dependencies.rebuildDeckFromWorkDir(paths.workDir, {
          preserveGraphics: true,
          pages: "1",
          assetDir: path.join(analysisDir, "assets"),
          irDir: analysisDir,
          deckName: "component-pre"
        });
        validatePreDeck(preDeck);
        const inputDeck = readOptionalWorkDeck(paths.workDir);
        const analysisDeck = hasComponentReadyImageLayers(inputDeck) ? inputDeck : preDeck;
        validatePreDeck(analysisDeck);
        const preFile = path.join(analysisDir, "component-pre.ir.json");
        writeBoundedJson(preFile, analysisDeck, MAX_REPORT_BYTES);
        if (typeof isCancellationRequested === "function" && await isCancellationRequested()) throw new Error("cancelled");
        const report = await dependencies.searchIrComponentCandidates({ ir: preFile, dryRun: true, size: 3 });
        validateReport(report, analysisDeck.pages[0].images.length);
        assertBoundedObject(report, MAX_REPORT_BYTES);
        const manifest = dependencies.buildComponentAssetManifest({ candidateReport: report, inventory: dependencies.inventory, maxAssetsPerLayer: 4 });
        validateManifest(manifest, analysisDeck.pages[0].images.length, dependencies.inventory);
        assertBoundedObject(manifest, MAX_REPORT_BYTES);
        assertSameSource(source, metadata);
        // Unmatched offline preservation recommendations must not disable the
        // existing native detectors for a page that has no reusable component.
        const matchedLayers = manifest.layers.filter(layer => Array.isArray(layer.localAssets) && layer.localAssets.length > 0);
        const matchedKeys = new Set(matchedLayers.map(layerKey));
        const nativeModes = new Set(["native-visual-atom-rebuild", "native-rebuild-with-component-style-guide"]);
        const matchedReport = { ...report, layers: report.layers.filter(layer => matchedKeys.has(layerKey(layer)) && nativeModes.has(layer.componentRenderStrategy.mode)) };
        const matchedManifest = { ...manifest, layers: matchedLayers };
        const strategyLayers = matchedReport.layers.length;
        const assetLayers = matchedLayers.length;
        const assetMatches = manifest.layers.reduce((count, layer) => count + (Array.isArray(layer.localAssets) ? layer.localAssets.length : 0), 0);
        const componentFamilies = summarizeComponentFamilies({ report, manifest, matchedReport });
        const result = {
          evidence: Object.freeze({
            provider: "team-component-analysis-v1",
            sourceSha256: source.sha256,
            preImages: analysisDeck.pages[0].images.length,
            analysisLayers: report.layers.length,
            assetMatches,
            strategyLayers,
            assetLayers,
            componentFamilies: componentFamilies.rows,
            detectedComponentFamilyCounts: componentFamilies.detected,
            matchedComponentFamilyCounts: componentFamilies.matched,
            strategyComponentFamilyCounts: componentFamilies.strategy,
            missingComponentFamilyCounts: componentFamilies.missing
          })
        };
        if (strategyLayers > 0) result.componentStrategyIndex = dependencies.buildComponentStrategyIndex(matchedReport);
        if (assetLayers > 0) result.componentAssetIndex = dependencies.buildComponentAssetIndex(matchedManifest);
        return Object.freeze(result);
      } catch (cause) {
        throw new Error("team component analysis failed", { cause });
      }
    }
  });
}

function resolveOwnedPaths(workDir, root) {
  if (typeof workDir !== "string" || typeof root !== "string" || !path.isAbsolute(workDir) || !path.isAbsolute(root)) throw new Error("invalid root");
  const realRoot = realDirectory(root);
  const realWorkDir = realDirectory(workDir);
  if (realWorkDir === realRoot || !inside(realRoot, realWorkDir)) throw new Error("work directory escapes root");
  return { root: realRoot, workDir: realWorkDir };
}

function readSourceFingerprint(metadata) {
  const input = dataValue(metadata, "inputFile");
  if (!isPlainObject(metadata) || typeof input !== "string" || !path.isAbsolute(input)) throw new Error("invalid input");
  const stat = fs.lstatSync(input);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_SOURCE_BYTES) throw new Error("invalid input");
  return { file: fs.realpathSync(input), size: stat.size, sha256: hashFile(input) };
}

function assertSameSource(before, metadata) {
  const after = readSourceFingerprint(metadata);
  if (after.file !== before.file || after.size !== before.size || after.sha256 !== before.sha256) throw new Error("source changed");
}

function validatePreDeck(deck) {
  if (!isPlainObject(deck) || !Array.isArray(deck.pages) || deck.pages.length !== 1 || !isPlainObject(deck.pages[0]) || !Array.isArray(deck.pages[0].images) || deck.pages[0].images.length > MAX_IMAGES) throw new Error("invalid pre-analysis deck");
}

function readOptionalWorkDeck(workDir) {
  const file = path.join(workDir, "ir", "deck.json");
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_REPORT_BYTES) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function hasComponentReadyImageLayers(deck) {
  const images = Array.isArray(deck?.pages?.[0]?.images) ? deck.pages[0].images : [];
  return images.some((image) => isPlainObject(image?.source?.layer?.diagramUnderstanding?.componentStrategy));
}

function validateReport(report, imageCount) {
  if (!isPlainObject(report) || !Array.isArray(report.layers)) throw new Error("invalid component report");
  for (const layer of report.layers) {
    const imageLayer = validImageIndex(layer?.imageIndex, imageCount);
    const shapeLayer = layer?.imageIndex == null && typeof layer?.shapeLayerId === "string" && layer.shapeLayerId.length > 0 && layer.shapeLayerId.length <= 500;
    if (!isPlainObject(layer) || layer.pageIndex !== 0 || (!imageLayer && !shapeLayer) || !isPlainObject(layer.componentRenderStrategy)) throw new Error("invalid component report");
  }
}

function validateManifest(manifest, imageCount, inventory) {
  if (!isPlainObject(manifest) || !Array.isArray(manifest.layers)) throw new Error("invalid component manifest");
  const allowed = new Set((Array.isArray(inventory.candidates) ? inventory.candidates : []).map(candidate => isPlainObject(candidate) ? candidate.path : null).filter(value => typeof value === "string"));
  for (const layer of manifest.layers) {
    if (!isPlainObject(layer) || layer.pageIndex !== 0 || (layer.imageIndex != null && !validImageIndex(layer.imageIndex, imageCount))) throw new Error("invalid component manifest");
    for (const asset of Array.isArray(layer.localAssets) ? layer.localAssets : []) {
      if (!isPlainObject(asset) || typeof asset.path !== "string" || !allowed.has(asset.path)) throw new Error("untrusted component asset");
      const stat = fs.lstatSync(asset.path);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("untrusted component asset");
    }
  }
}

function layerKey(layer) { return JSON.stringify([layer.pageIndex, layer.imageIndex, layer.shapeLayerId || null]); }
function validImageIndex(value, imageCount) { return Number.isInteger(value) && value >= 0 && value < imageCount; }
function realDirectory(value) { const stat = fs.lstatSync(value); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("invalid directory"); return fs.realpathSync(value); }
function assertOwnedDirectory(value, root) { const real = realDirectory(value); if (!inside(root, real)) throw new Error("analysis directory escapes root"); }
function inside(root, target) { return target === root || target.startsWith(`${root}${path.sep}`); }
function isPlainObject(value) { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null; }
function dataValue(object, key) { if (!object || typeof object !== "object") return undefined; const descriptor = Object.getOwnPropertyDescriptor(object, key); return descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value") ? descriptor.value : undefined; }
function assertBoundedObject(value, limit) { if (Buffer.byteLength(JSON.stringify(value), "utf8") > limit) throw new Error("analysis output exceeds boundary"); }
function writeBoundedJson(file, value, limit) { assertBoundedObject(value, limit); fs.writeFileSync(file, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "w", mode: 0o600 }); }
function hashFile(file) { const hash = crypto.createHash("sha256"); const buffer = Buffer.allocUnsafe(1024 * 1024); const handle = fs.openSync(file, "r"); try { for (;;) { const bytes = fs.readSync(handle, buffer, 0, buffer.length, null); if (!bytes) break; hash.update(buffer.subarray(0, bytes)); } } finally { fs.closeSync(handle); } return hash.digest("hex"); }

function summarizeComponentFamilies({ report = {}, manifest = {}, matchedReport = {} } = {}) {
  const detected = {};
  const matched = {};
  const strategy = {};
  const assetMatches = {};
  for (const layer of Array.isArray(report.layers) ? report.layers : []) {
    for (const family of inferComponentFamiliesFromLayer(layer)) addCount(detected, family);
  }
  for (const layer of Array.isArray(manifest.layers) ? manifest.layers : []) {
    const matches = Array.isArray(layer.localAssets) ? layer.localAssets.length : 0;
    if (matches <= 0) continue;
    for (const family of inferComponentFamiliesFromLayer(layer)) {
      addCount(matched, family);
      addCount(assetMatches, family, matches);
    }
  }
  for (const layer of Array.isArray(matchedReport.layers) ? matchedReport.layers : []) {
    for (const family of inferComponentFamiliesFromLayer(layer)) addCount(strategy, family);
  }
  const missing = {};
  for (const family of Object.keys(detected)) {
    const missingLayers = safeNumber(detected[family]) - safeNumber(matched[family]);
    if (missingLayers > 0) missing[family] = missingLayers;
  }
  const rows = [...new Set([
    ...Object.keys(detected),
    ...Object.keys(matched),
    ...Object.keys(strategy)
  ])]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_COMPONENT_FAMILY_ROWS)
    .map((family) => ({
      family,
      detectedLayers: safeNumber(detected[family]),
      matchedLayers: safeNumber(matched[family]),
      assetMatches: safeNumber(assetMatches[family]),
      strategyLayers: safeNumber(strategy[family]),
      missingLayers: safeNumber(missing[family])
    }));
  return { detected, matched, strategy, missing, rows };
}

function inferComponentFamiliesFromLayer(layer = {}) {
  if (!layer || typeof layer !== "object") return [];
  const families = new Set();
  for (const motif of componentTargetMotifs(layer)) {
    const family = COMPONENT_FAMILY_BY_MOTIF[motif];
    if (family) families.add(family);
  }
  for (const family of inferComponentFamiliesFromText([
    layer.family,
    layer.layerType,
    layer.detector,
    layer.expressionForm,
    layer.expressionSubtype,
    layer.recommendedAction,
    layer.disposition,
    layer.candidateTitle,
    layer.templateFamily,
    layer.componentTemplateFamilyApplied,
    layer.strategyMode,
    layer.componentRenderStrategy?.mode,
    layer.componentRenderStrategy?.bestCandidate?.title,
    layer.componentRenderStrategy?.bestCandidate?.kind,
    layer.componentRenderStrategy?.applicationPlan?.componentKind,
    layer.componentRenderStrategy?.applicationPlan?.sourceProvider,
    layer.remoteCandidate?.title,
    layer.remoteCandidate?.kind,
    layer.diagramUnderstanding?.archetype,
    layer.diagramUnderstanding?.componentStrategy?.templateFamily
  ].map(safeString).join(" "))) {
    families.add(family);
  }
  return [...families].filter((family) => COMPONENT_FAMILIES.has(family)).sort((a, b) => a.localeCompare(b));
}

function componentTargetMotifs(layer = {}) {
  const strategy = layer.componentRenderStrategy && typeof layer.componentRenderStrategy === "object" ? layer.componentRenderStrategy : {};
  const plan = strategy.applicationPlan && typeof strategy.applicationPlan === "object" ? strategy.applicationPlan : {};
  const candidate = strategy.bestCandidate && typeof strategy.bestCandidate === "object" ? strategy.bestCandidate : {};
  return [
    ...(Array.isArray(layer.targetMotifs) ? layer.targetMotifs : []),
    ...(Array.isArray(layer.plan?.targetMotifs) ? layer.plan.targetMotifs : []),
    ...(Array.isArray(layer.diagramUnderstanding?.targetMotifs) ? layer.diagramUnderstanding.targetMotifs : []),
    ...(Array.isArray(layer.diagramUnderstanding?.componentStrategy?.targetMotifs) ? layer.diagramUnderstanding.componentStrategy.targetMotifs : []),
    ...(Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : []),
    ...(Array.isArray(plan.targetMotifs) ? plan.targetMotifs : []),
    ...(Array.isArray(candidate.targetMotifs) ? candidate.targetMotifs : []),
    ...inferredComponentTargetMotifs(layer)
  ].map(safeString).filter(Boolean).slice(0, 24);
}

function inferredComponentTargetMotifs(layer = {}) {
  const text = [
    layer.templateFamily,
    layer.layerType,
    layer.detector,
    layer.componentRenderStrategy?.mode,
    layer.componentRenderStrategy?.applicationPlan?.componentKind,
    layer.componentRenderStrategy?.bestCandidate?.kind,
    layer.componentRenderStrategy?.bestCandidate?.title,
    layer.remoteCandidate?.kind,
    layer.remoteCandidate?.title
  ].map((value) => safeString(value).toLowerCase()).join(" ");
  const motifs = [];
  if (/donut|doughnut/.test(text)) motifs.push("donut-segment-chart");
  if (/treemap/.test(text)) motifs.push("treemap-chart");
  if (/bubble|scatter/.test(text)) motifs.push("bubble-scatter-chart");
  if (/\bmap\b|geo|region/.test(text)) motifs.push("map-chart");
  if (/word-cloud|word cloud|keyword/.test(text)) motifs.push("word-cloud-chart");
  if (/waterfall/.test(text)) motifs.push("waterfall-chart");
  if (/gauge|dial|speedometer/.test(text)) motifs.push("gauge-chart");
  if (/radar|spider/.test(text)) motifs.push("radar-chart");
  if (containsAnyTextTerm(text, ["sankey", "sankey-flow-chart"])) motifs.push("sankey-flow-chart");
  if (containsAnyTextTerm(text, ["fishbone", "cause", "fishbone-cause"])) motifs.push("fishbone-cause");
  if (containsAnyTextTerm(text, ["matrix", "grid", "cell", "card-grid", "comparison-matrix", "heatmap-matrix"])) motifs.push("card-grid");
  if (containsAnyTextTerm(text, ["quadrant", "axis", "quadrant-axis"])) motifs.push("quadrant-axis");
  if (containsAnyTextTerm(text, ["process", "step", "flow", "chain", "linear-arrow-chain", "process-flow"])) motifs.push("linear-arrow-chain");
  if (containsAnyTextTerm(text, ["swimlane", "lane", "swimlane-flow"])) motifs.push("swimlane-flow");
  if (containsAnyTextTerm(text, ["whole-process", "whole-process-template"])) motifs.push("whole-process-template");
  if (containsAnyTextTerm(text, ["timeline", "milestone", "roadmap", "gantt", "timeline-roadmap", "milestone-roadmap", "gantt-roadmap"])) motifs.push("milestone-roadmap");
  if (containsAnyTextTerm(text, ["cycle", "loop", "arc", "ring", "arc-arrow", "cycle-loop", "ring-node"])) motifs.push("arc-arrow");
  if (containsAnyTextTerm(text, ["tree", "org", "hierarchy", "tree-link", "org-hierarchy"])) motifs.push("tree-link");
  if (containsAnyTextTerm(text, ["hub", "spoke", "radial", "relationship", "topology", "network", "radial-link", "topology-network"])) motifs.push("radial-link");
  if (containsAnyTextTerm(text, ["funnel", "funnel-stack", "funnel-flow", "lens-funnel-flow"])) motifs.push("funnel-stack");
  if (containsAnyTextTerm(text, ["pyramid", "pyramid-stack"])) motifs.push("pyramid-stack");
  if (containsAnyTextTerm(text, ["venn", "overlap", "intersection", "venn-overlap", "intersection-overlap"])) motifs.push("venn-overlap");
  if (containsAnyTextTerm(text, ["layered", "layer-stack", "stacked-layer", "layered-stack", "layered-architecture"])) motifs.push("layered-stack");
  return motifs;
}

function inferComponentFamiliesFromText(text = "") {
  const value = safeString(text).toLowerCase();
  const families = [];
  if (containsAnyTextTerm(value, ["cycle", "loop", "arc", "ring", "concentric", "arc-arrow", "ring-node", "cycle-loop", "concentric-circles", "循环", "圆环", "同心"])) families.push("cycle-loop");
  if (containsAnyTextTerm(value, ["matrix", "grid", "quadrant", "table", "cell", "comparison", "matrix-table", "表格", "矩阵", "象限", "对比"])) families.push("matrix-table");
  if (containsAnyTextTerm(value, ["tree", "org", "hierarchy", "hierarchy-tree", "org-hierarchy", "层级", "组织"])) families.push("hierarchy-tree");
  if (containsAnyTextTerm(value, ["fishbone", "cause", "fishbone-cause", "鱼骨", "因果"])) families.push("fishbone-cause");
  if (containsAnyTextTerm(value, ["hub", "spoke", "radial", "relationship", "topology", "network", "relationship-network", "topology-network", "关系", "网络", "拓扑"])) families.push("relationship-network");
  if (containsAnyTextTerm(value, ["process", "step", "swimlane", "flow", "chain", "branch", "workflow", "route", "process-flow", "linear-arrow-chain", "whole-process-template", "swimlane-flow", "流程", "步骤", "链路"])) families.push("process-flow");
  if (containsAnyTextTerm(value, ["funnel", "lens", "funnel-flow", "funnel-stack", "lens-funnel-flow", "漏斗"])) families.push("funnel-flow");
  if (containsAnyTextTerm(value, ["layered", "layer-stack", "stacked-layer", "architecture", "layered-architecture", "layered-stack", "分层", "架构"])) families.push("layered-architecture");
  if (containsAnyTextTerm(value, ["pyramid", "pyramid-stack", "金字塔"])) families.push("pyramid-stack");
  if (containsAnyTextTerm(value, ["venn", "overlap", "intersection", "overlap-diagram", "venn-overlap", "intersection-overlap", "交集", "重叠"])) families.push("overlap-diagram");
  if (containsAnyTextTerm(value, ["timeline", "milestone", "roadmap", "gantt", "timeline-roadmap", "milestone-roadmap", "gantt-roadmap", "时间轴", "里程碑", "路线图"])) families.push("timeline-roadmap");
  if (containsAnyTextTerm(value, ["dashboard", "kpi", "metric", "scorecard", "indicator", "dashboard-card-grid", "metric-card-grid", "数据看板", "指标看板", "仪表盘", "指标卡"])) families.push("metric-card-grid");
  if (containsAnyTextTerm(value, ["chart", "donut", "doughnut", "pie", "treemap", "bubble", "scatter", "sankey", "map-chart", "geo-map", "word-cloud", "waterfall", "gauge", "radar", "specialty-chart", "sankey-flow-chart", "图表", "词云", "地图", "仪表", "雷达"])) families.push("specialty-chart");
  return [...new Set(families)].filter((family) => COMPONENT_FAMILIES.has(family));
}

function containsAnyTextTerm(text, terms = []) {
  return terms.some((term) => {
    if (/[\u0080-\uFFFF]/.test(term)) return text.includes(term);
    return new RegExp(`(^|[^a-z0-9-])${escapeRegExp(term)}($|[^a-z0-9-])`).test(text);
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addCount(target, key, count = 1) {
  const family = safeString(key);
  if (!COMPONENT_FAMILIES.has(family)) return;
  target[family] = safeNumber(target[family]) + safeNumber(count);
}

function safeString(value) {
  return String(value ?? "")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .trim();
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

module.exports = {
  MAX_IMAGES,
  MAX_REPORT_BYTES,
  MAX_SOURCE_BYTES,
  createTeamComponentAnalysis,
  _private: {
    inferComponentFamiliesFromLayer,
    summarizeComponentFamilies
  }
};
