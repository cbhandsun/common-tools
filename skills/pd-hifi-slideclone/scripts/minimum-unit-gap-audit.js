#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { resolveImageExpressionFamily } = require("./lib/expression-family-normalizer");
const { classifyGraphicExpressionPolicy } = require("./lib/graphic-expression-policy");
const { isImageObjectified } = require("./structural-native-audit");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function parseArgs(argv = process.argv) {
  const args = {
    irDir: path.join("ppt文档", "组件策略插件增强版本"),
    out: path.join("runs", "minimum-unit-gap-audit.json"),
    markdownOut: "",
    repairQueueOut: "",
    minAreaRatio: 0.18,
    maxActions: 80,
    recursive: false,
    failOnGap: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--ir-dir" && next) {
      args.irDir = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if ((arg === "--markdown-out" || arg === "--md") && next) {
      args.markdownOut = next;
      index += 1;
    } else if ((arg === "--repair-queue-out" || arg === "--queue-out") && next) {
      args.repairQueueOut = next;
      index += 1;
    } else if (arg === "--min-area-ratio" && next) {
      args.minAreaRatio = Number(next);
      index += 1;
    } else if (arg === "--max-actions" && next) {
      args.maxActions = Number(next);
      index += 1;
    } else if (arg === "--fail-on-gap") {
      args.failOnGap = true;
    } else if (arg === "--recursive") {
      args.recursive = true;
    } else if (arg === "--no-fail" || arg === "--allow-gaps") {
      args.failOnGap = false;
    } else {
      throw new Error(`Unknown minimum-unit-gap-audit argument: ${arg}`);
    }
  }
  args.minAreaRatio = clampNumber(args.minAreaRatio, 0, 1, 0.18);
  args.maxActions = clampInteger(args.maxActions, 1, 500, 80);
  return args;
}

function auditMinimumUnitGaps(options = {}) {
  const irDir = path.resolve(String(options.irDir || path.join("ppt文档", "组件策略插件增强版本")));
  const threshold = clampNumber(options.minAreaRatio, 0, 1, 0.18);
  const files = collectIrFiles(irDir, { recursive: options.recursive === true });
  const decks = files.map((file) => auditDeck(file, { minAreaRatio: threshold }));
  const gaps = decks.flatMap((deck) => deck.gaps.map((gap) => ({ deck: deck.deck, ...gap })))
    .sort((a, b) => b.priorityScore - a.priorityScore
      || b.areaRatio - a.areaRatio
      || safeString(a.deck).localeCompare(safeString(b.deck))
      || Number(a.slide || 0) - Number(b.slide || 0));
  const protectedCrops = decks.reduce((sum, deck) => sum + deck.protectedCrops, 0);
  const protectedCropExamples = decks.flatMap((deck) => safeArray(deck.protectedCropExamples)
    .map((item) => ({ deck: deck.deck, ...item }))).slice(0, 40);
  const objectifiedImages = decks.reduce((sum, deck) => sum + deck.objectifiedImages, 0);
  const report = {
    provider: "minimum-unit-gap-audit-v1",
    generatedAt: new Date().toISOString(),
    irDir,
    thresholds: { minAreaRatio: threshold },
    ok: gaps.length === 0,
    summary: {
      decks: decks.length,
      pages: decks.reduce((sum, deck) => sum + deck.pages, 0),
      images: decks.reduce((sum, deck) => sum + deck.images, 0),
      protectedCrops,
      objectifiedImages,
      minimumUnitGaps: gaps.length,
      highPriorityGaps: gaps.filter((gap) => gap.priority === "high").length,
      mediumPriorityGaps: gaps.filter((gap) => gap.priority === "medium").length,
      byRoute: countObject(gaps, (gap) => gap.recommendedRoute),
      byMotif: countMotifs(gaps)
    },
    protectedCropExamples,
    gaps,
    decks
  };
  if (options.out) writeText(options.out, `${JSON.stringify(report, null, 2)}\n`);
  if (options.markdownOut) writeText(options.markdownOut, renderMarkdown(report));
  if (options.repairQueueOut) writeText(options.repairQueueOut, `${JSON.stringify(buildRepairQueue(report, {
    maxActions: options.maxActions
  }), null, 2)}\n`);
  return report;
}

function collectIrFiles(irDir, options = {}) {
  if (!fs.statSync(irDir, { throwIfNoEntry: false })?.isDirectory()) return [];
  const recursive = options.recursive === true;
  const maxFiles = clampInteger(options.maxFiles, 1, 10000, 10000);
  const files = [];
  const pending = [irDir];
  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."))
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory() && recursive) {
        pending.push(fullPath);
        continue;
      }
      if (!entry.isFile() || !/\.native\.ir\.json$/i.test(entry.name)) continue;
      files.push(fullPath);
      if (files.length > maxFiles) throw new Error(`Minimum unit audit exceeds the ${maxFiles} file limit`);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function auditDeck(file, options = {}) {
  const ir = readJson(file);
  const deck = path.basename(file).replace(/\.native\.ir\.json$/i, "");
  const slideSize = ir.slideSize || DEFAULT_SLIDE;
  const pages = Array.isArray(ir.pages) ? ir.pages : [];
  const gaps = [];
  const protectedCropExamples = [];
  let images = 0;
  let protectedCrops = 0;
  let objectifiedImages = 0;
  pages.forEach((page, pageIndex) => {
    safeArray(page.images).forEach((image, imageIndex) => {
      images += 1;
      const policy = classifyGraphicExpressionPolicy(image);
      const objectified = isImageObjectified(image);
      if (objectified) objectifiedImages += 1;
      if (policy.protectCrop === true && policy.allowNativeRebuild !== true) {
        protectedCrops += 1;
        if (protectedCropExamples.length < 24) {
          protectedCropExamples.push({
            slide: pageIndex + 1,
            pageIndex,
            image: imageIndex + 1,
            imageIndex,
            imageId: safeString(image.id),
            detector: safeString(image.source?.detector),
            expressionForm: safeString(image.source?.expressionForm),
            expressionSubtype: safeString(image.source?.expressionSubtype),
            expressionPolicy: summarizePolicy(policy),
            box: sanitizeBox(image.box)
          });
        }
      }
      const areaRatio = imageAreaRatio(image.box, slideSize);
      if (!shouldFlagMinimumUnitGap({ image, policy, objectified, areaRatio, minAreaRatio: options.minAreaRatio })) return;
      const route = inferRecommendedRoute(image);
      gaps.push({
        slide: pageIndex + 1,
        pageIndex,
        image: imageIndex + 1,
        imageIndex,
        imageId: safeString(image.id),
        areaRatio: round(areaRatio),
        priority: priorityForArea(areaRatio),
        priorityScore: priorityScore(areaRatio, route),
        detector: safeString(image.source?.detector),
        layerType: safeString(image.source?.layer?.layerType),
        expressionFamily: safeString(imageExpressionFamily(image)),
        expressionForm: safeString(image.source?.expressionForm),
        expressionSubtype: safeString(image.source?.expressionSubtype),
        recommendedAction: safeString(image.source?.recommendedAction),
        expressionPolicy: summarizePolicy(policy),
        recommendedRoute: route.route,
        templateFamily: route.templateFamily,
        targetMotifs: route.targetMotifs,
        reason: route.reason,
        box: sanitizeBox(image.box)
      });
    });
  });
  return {
    deck,
    file,
    pages: pages.length,
    images,
    protectedCrops,
    protectedCropExamples,
    objectifiedImages,
    gaps
  };
}

function shouldFlagMinimumUnitGap({ image = {}, policy = {}, objectified = false, areaRatio = 0, minAreaRatio = 0.18 } = {}) {
  if (objectified) return false;
  if (areaRatio < minAreaRatio) return false;
  if (policy.protectCrop === true && policy.allowNativeRebuild !== true) return false;
  // Debugger, product, and document screenshots are intentional fidelity units.
  // Their layout may resemble a card grid, but forcing native reconstruction
  // would make them less faithful and conflicts with the screenshot policy.
  if (/(?:screenshot|debugger|screen-capture|screen-shot|窗口截图|截图)/i.test(imageDescriptorText(image))) return false;
  const expressionFamily = imageExpressionFamily(image);
  if (/pictorial-asset/.test(expressionFamily)) return false;
  if (/data-chart|structured-process|layout-grid|relationship-diagram|generic-structured-diagram/.test(expressionFamily)) return true;
  if (policy.allowNativeRebuild === true) return true;
  const text = imageText(image);
  if (isProtectedVisualAssetText(text)) return false;
  return /table|matrix|grid|chart|diagram|flow|process|relationship|timeline|topology|network|architecture|dense-complex|comparison|表格|矩阵|网格|图表|流程|关系|架构/.test(text)
    && !/screenshot|photo|logo|icon-or-illustration|illustration-zone|图标|截图|插画/.test(text);
}

function inferRecommendedRoute(image = {}) {
  const text = imageDescriptorText(image);
  const strategyText = imageStrategyText(image);
  const combined = `${text} ${strategyText}`;
  if (/treemap|tree.?map|矩形树图|面积占比|份额构成/.test(combined)) {
    return route("plugin-or-native-treemap-component", "treemap-chart", ["treemap-chart"], "treemap crops should use learned editable area-composition components or native tile rectangles");
  }
  if (/bubble.?scatter|bubble.?chart|气泡图|散点气泡|产品组合矩阵/.test(combined)) {
    return route("plugin-or-native-bubble-chart-component", "scatter-chart", ["bubble-scatter-chart"], "bubble chart crops should use learned editable bubble/scatter components when point marks are detectable");
  }
  if (/segmented.?donut|donut.?segment|donut.?chart|ring.?chart|分段环形|环形占比|环形图/.test(combined)) {
    return route("plugin-or-native-donut-component", "donut-chart", ["donut-segment-chart"], "segmented donut crops should use learned editable donut segment components or native donut atoms");
  }
  if (/sankey|alluvial|桑基|流向图|流量分布|能量流/.test(combined)) {
    return route("plugin-sankey-flow-component", "sankey-flow-chart", ["sankey-flow-chart"], "Sankey/alluvial crops should prefer a learned editable plugin component rather than primitive guessing");
  }
  if (/map.?chart|geo.?map|choropleth|地图图表|地图热力|区域地图|地理分布/.test(combined)) {
    return route("plugin-map-chart-component", "map-chart", ["map-chart"], "map crops should use learned editable map region components or remain an intentional fidelity crop when regions cannot be safely decomposed");
  }
  if (/word.?cloud|tag.?cloud|keyword.?cloud|词云|标签云|关键词云|文字云/.test(combined)) {
    return route("plugin-word-cloud-component", "word-cloud-chart", ["word-cloud-chart"], "word cloud crops should use learned editable text-token layouts instead of a monolithic raster");
  }
  if (/waterfall|variance.?bridge|瀑布图|差异桥|增减分析/.test(combined)) {
    return route("plugin-or-native-waterfall-chart", "waterfall-chart", ["waterfall-chart"], "waterfall crops should use editable bridge/bar components or native bar and connector atoms");
  }
  if (/gauge|speedometer|仪表盘?图|速度表|半圆仪表|进度仪表/.test(combined)) {
    return route("plugin-gauge-chart-component", "gauge-chart", ["gauge-chart"], "gauge crops should prefer learned editable dial components rather than flat raster snapshots");
  }
  if (/radar|spider.?chart|雷达图|蛛网图|蜘蛛网图|能力雷达/.test(combined)) {
    return route("plugin-radar-chart-component", "radar-chart", ["radar-chart"], "radar chart crops should use learned editable radar/spider components or native axis/mark atoms");
  }
  if (/venn|overlap|intersection|韦恩|维恩|交集|重叠/.test(combined)) {
    return route("plugin-or-native-venn-component", "venn-overlap", ["venn-overlap", "intersection-overlap"], "Venn/overlap crops should use learned editable overlap components");
  }
  if (/concentric|onion|同心圆|洋葱图|圈层|嵌套圆/.test(combined)) {
    return route("plugin-or-native-concentric-component", "concentric-circles", ["concentric-circles", "ring-node"], "concentric/onion crops should use learned editable ring components");
  }
  if (/fishbone|cause.?effect|root.?cause|ishikawa|鱼骨图|因果分析|根因分析/.test(combined)) {
    return route("plugin-fishbone-component", "fishbone-cause-effect", ["fishbone-cause"], "fishbone crops should prefer a learned editable cause-effect component");
  }
  if (/comparison|table|matrix|grid|表格|矩阵|网格|卡片/.test(text)) {
    return route("native-table-or-card-grid", "matrix-grid", ["card-grid"], "table/matrix/card-grid should be rebuilt as editable cells, cards, and separators before keeping residual crops");
  }
  if (/bar-chart|line-chart|pie-chart|donut|chart|axis|series|图表|柱状|折线|饼图|环形图|坐标轴/.test(text)) {
    return route("native-chart-or-chart-template", "chart", ["pie-share-chart"], "chart snapshots need native chart primitives or a matched editable chart template when data/marks are detectable");
  }
  if (/cycle|arc|loop|ring|循环|圆弧|环形/.test(text)) {
    return route("plugin-or-native-cycle-arrow", "cycle-arrow", ["arc-arrow"], "cycle arrows should prefer learned iSlide/OfficePLUS components or native arc-arrow atoms");
  }
  if (/flow|process|chain|arrow|timeline|collaboration|wms|route|流程|步骤|箭头|时间线/.test(text)) {
    return route("plugin-or-native-process-flow", "process-flow", ["linear-arrow-chain"], "process flows should use native nodes/connectors or a learned component template");
  }
  if (/tree|hierarchy|org|层级|树|组织/.test(text)) {
    return route("native-tree-or-hierarchy", "tree-hierarchy", ["tree-link"], "hierarchies should be rebuilt from nodes and connectors");
  }
  if (/hub|spoke|radial|中心|辐射/.test(text)) {
    return route("native-radial-relationship", "hub-spoke", ["radial-link"], "radial relationships should be rebuilt from center/peripheral nodes and connectors");
  }
  if (/bar-chart|line-chart|pie-chart|donut|chart|axis|series|图表|柱状|折线|饼图|环形图|坐标轴/.test(strategyText)
    && !/dense-complex|structured-case|foreground-graphic-crop/.test(text)) {
    return route("native-chart-or-chart-template", "chart", ["pie-share-chart"], "chart-like strategy metadata can use an editable chart template when the visible crop is not a generic dense diagram");
  }
  return route("native-visual-atom-decomposition", "generic-structure", ["whole-process-template"], "large structured crops need visual atom decomposition before preserving any residual image");
}

function buildRepairQueue(report = {}, options = {}) {
  const maxActions = clampInteger(options.maxActions, 1, 500, 80);
  const actions = safeArray(report.gaps).slice(0, maxActions).map((gap) => ({
    deck: safeString(gap.deck),
    page: clampInteger(gap.slide, 1, 10000, 1),
    image: clampInteger(gap.image, 1, 10000, 1),
    imageId: safeString(gap.imageId),
    violation: "minimum-unit-structural-crop-gap",
    layerType: safeString(gap.layerType),
    detector: safeString(gap.detector),
    expressionFamily: safeString(gap.expressionFamily),
    disposition: "large structural image remains as crop",
    currentMode: "preserve-or-defer-crop",
    candidateTitle: safeString(gap.expressionSubtype || gap.expressionForm || gap.recommendedRoute),
    areaRatio: numberOrNull(gap.areaRatio),
    box: gap.box || null,
    targetMotifs: safeArray(gap.targetMotifs),
    templateFamily: safeString(gap.templateFamily),
    repair: {
      mode: "reclassify-structural-diagram-or-component-template",
      disableComponentTemplate: false,
      forcePreserveLocalCrop: false,
      allowNativeOverlays: true,
      requireSemanticStructureEvidence: true,
      prioritizePluginTemplateReplacement: /plugin/.test(gap.recommendedRoute),
      reason: "minimum unit gap audit found a large structural crop that should be decomposed or replaced by an editable component"
    }
  }));
  return {
    provider: "expression-policy-repair-queue-v1",
    generatedAt: new Date().toISOString(),
    sourceMinimumUnitGapAudit: safeString(report.irDir),
    summary: {
      actions: actions.length,
      byRoute: countObject(actions, (action) => action.templateFamily),
      byMotif: countMotifs(actions)
    },
    actions
  };
}

function renderMarkdown(report = {}) {
  const lines = [
    "# Minimum Unit Gap Audit",
    "",
    `OK: ${report.ok ? "yes" : "no"}`,
    `Decks/pages/images: ${report.summary?.decks || 0}/${report.summary?.pages || 0}/${report.summary?.images || 0}`,
    `Minimum-unit gaps: ${report.summary?.minimumUnitGaps || 0}`,
    `High priority gaps: ${report.summary?.highPriorityGaps || 0}`,
    `Protected crops: ${report.summary?.protectedCrops || 0}`,
    "",
    "Rule: structured charts, tables, matrices, flows, and relationship diagrams should not remain as large monolithic crops. Icons, screenshots, decorative illustrations, and visual examples stay as fidelity crops.",
    ""
  ];
  if (safeArray(report.gaps).length > 0) {
    lines.push("Top gaps:");
    for (const gap of safeArray(report.gaps).slice(0, 40)) {
      lines.push(`- ${gap.priority}: ${gap.deck} p${gap.slide} ${gap.imageId} area=${gap.areaRatio} route=${gap.recommendedRoute} ${gap.expressionSubtype || gap.detector}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function route(routeName, templateFamily, targetMotifs, reason) {
  return { route: routeName, templateFamily, targetMotifs, reason };
}

function priorityForArea(areaRatio) {
  if (areaRatio >= 0.45) return "high";
  if (areaRatio >= 0.28) return "medium";
  return "low";
}

function priorityScore(areaRatio, routeInfo = {}) {
  let score = Math.round(areaRatio * 1000);
  if (/table|card|chart/.test(routeInfo.route)) score += 80;
  if (/process|cycle/.test(routeInfo.route)) score += 50;
  return score;
}

function imageText(image = {}) {
  return [imageDescriptorText(image), imageStrategyText(image)].join(" ").trim();
}

function isProtectedVisualAssetText(text = "") {
  return /visual-example|component-preview|plugin-.*(?:arrow|icon)|arrow-illustration|cycle-flow-icon|vector-arrow|mockup|demo|sample|example|pictogram|clipart|sticker|ornament|badge|素材|图形素材|素材图示|图标图示|装饰图示|图示样例|示意样例|示意图|示例|样例|示意插图|插画|图标|图示/.test(safeString(text).toLowerCase());
}

function imageDescriptorText(image = {}) {
  const source = image.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  return [
    image.id,
    source.detector,
    imageExpressionFamily(image),
    source.expressionForm,
    source.expressionSubtype,
    source.recommendedAction,
    source.reason,
    source.nonEditableReason,
    layer.layerType,
    understanding.archetype
  ].map(safeString).join(" ").toLowerCase();
}

function imageExpressionFamily(image = {}) {
  return resolveImageExpressionFamily(image).toLowerCase();
}

function imageStrategyText(image = {}) {
  const source = image.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const strategy = source.componentRenderStrategy || layer.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  return [
    understanding.componentStrategy?.templateFamily,
    ...safeArray(understanding.componentStrategy?.targetMotifs),
    strategy.templateFamily,
    ...safeArray(strategy.targetMotifs),
    strategy.applicationPlan?.componentKind,
    strategy.applicationPlan?.sourceProvider,
    candidate.title,
    candidate.description,
    candidate.structureSignature?.primaryKind,
    candidate.structureSignature?.layout,
    ...safeArray(candidate.targetMotifs),
    ...safeArray(candidate.structureSignature?.motifs)
  ].map(safeString).join(" ").toLowerCase();
}

function summarizePolicy(policy = {}) {
  return {
    kind: safeString(policy.kind),
    minimumUnitPolicy: safeString(policy.minimumUnitPolicy),
    unitDisposition: safeString(policy.unitDisposition),
    allowNativeRebuild: policy.allowNativeRebuild === true,
    protectCrop: policy.protectCrop === true,
    allowPluginTemplate: policy.allowPluginTemplate === true,
    reasons: safeArray(policy.reasons).map(safeString).filter(Boolean).slice(0, 8)
  };
}

function imageAreaRatio(box = {}, slideSize = DEFAULT_SLIDE) {
  const area = Math.max(0, Number(box?.w || 0)) * Math.max(0, Number(box?.h || 0));
  const slideArea = Math.max(1, Number(slideSize?.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize?.heightPt || DEFAULT_SLIDE.heightPt));
  return area / slideArea;
}

function sanitizeBox(box = {}) {
  return {
    x: round(box.x),
    y: round(box.y),
    w: round(box.w),
    h: round(box.h)
  };
}

function countObject(items = [], keyFn = (item) => item) {
  const counts = {};
  for (const item of safeArray(items)) {
    const key = safeString(keyFn(item) || "unknown");
    counts[key] = Number(counts[key] || 0) + 1;
  }
  return counts;
}

function countMotifs(items = []) {
  const counts = {};
  for (const item of safeArray(items)) {
    for (const motif of safeArray(item.targetMotifs)) {
      const key = safeString(motif || "unknown");
      counts[key] = Number(counts[key] || 0) + 1;
    }
  }
  return counts;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8").replace(/^\uFEFF/, ""));
}

function writeText(file, text) {
  const out = path.resolve(String(file));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text, "utf8");
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10000) / 10000 : 0;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function main() {
  try {
    const args = parseArgs(process.argv);
    const report = auditMinimumUnitGaps(args);
    console.log(JSON.stringify(report.summary, null, 2));
    if (args.failOnGap && !report.ok) process.exitCode = 1;
  } catch (error) {
    console.error(String(error?.stack || error?.message || error));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  auditDeck,
  auditMinimumUnitGaps,
  buildRepairQueue,
  collectIrFiles,
  inferRecommendedRoute,
  parseArgs,
  renderMarkdown,
  shouldFlagMinimumUnitGap
};
