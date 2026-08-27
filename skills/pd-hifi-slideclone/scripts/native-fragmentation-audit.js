#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_THRESHOLDS = {
  denseNetworkAtomCount: 96,
  denseVisualAtomCount: 80,
  pageShapeCount: 180,
  maxShapesPerComponentOwner: 180,
  minimumComponentRatioForDensePage: 0.12,
  competingFamiliesPerLayer: 3
};

function auditNativeFragmentation(ir, options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const pages = Array.isArray(ir?.pages) ? ir.pages : [];
  const pageReports = [];
  const risks = [];
  const totals = {
    pages: pages.length,
    shapes: 0,
    textBoxes: 0,
    images: 0,
    layers: 0,
    summarizedLayers: 0,
    componentLayers: 0,
    highAtomLayers: 0,
    fragmentationRisks: 0
  };

  pages.forEach((page, pageIndex) => {
    const shapes = safeArray(page?.shapes);
    const textBoxes = safeArray(page?.textBoxes);
    const images = safeArray(page?.images);
    const groups = groupPageShapesByLayer(shapes);
    const layerReports = [];
    let pageSummaryObjects = 0;
    let pageComponentObjects = 0;
    let pageAtomObjects = 0;
    let pageComponentOwnerObjects = 0;
    const pagePrimaryBuilderIds = new Set();

    totals.shapes += shapes.length;
    totals.textBoxes += textBoxes.length;
    totals.images += images.length;
    totals.layers += groups.length;

    for (const group of groups) {
      const report = summarizeLayerGroup(group);
      layerReports.push(report);
      pageSummaryObjects += report.summaryObjects;
      pageComponentObjects += report.componentObjects;
      pageAtomObjects += report.atomObjects;
      pageComponentOwnerObjects += report.componentOwnerObjects;
      for (const builderId of report.primaryBuilderIds) pagePrimaryBuilderIds.add(builderId);
      if (report.summaryObjects > 0) totals.summarizedLayers += 1;
      if (report.componentObjects > 0) totals.componentLayers += 1;
      if (report.atomObjects >= thresholds.denseVisualAtomCount) totals.highAtomLayers += 1;

      const layerRisks = scoreLayerFragmentationRisk(report, pageIndex, thresholds);
      risks.push(...layerRisks);
    }

    const pageRisk = scorePageFragmentationRisk({
      pageIndex,
      shapeCount: shapes.length,
      imageCount: images.length,
      summaryObjects: pageSummaryObjects,
      componentObjects: pageComponentObjects,
      componentOwnerObjects: pageComponentOwnerObjects,
      atomObjects: pageAtomObjects,
      primaryBuilderIds: Array.from(pagePrimaryBuilderIds).sort()
    }, thresholds);
    if (pageRisk) risks.push(pageRisk);

    pageReports.push({
      pageIndex,
      shapeCount: shapes.length,
      textBoxCount: textBoxes.length,
      imageCount: images.length,
      layerCount: groups.length,
      summaryObjects: pageSummaryObjects,
      componentObjects: pageComponentObjects,
      componentOwnerObjects: pageComponentOwnerObjects,
      atomObjects: pageAtomObjects,
      primaryBuilderIds: Array.from(pagePrimaryBuilderIds).sort(),
      layers: layerReports
    });
  });

  totals.fragmentationRisks = risks.length;
  return {
    ok: risks.length === 0,
    totals,
    fragmentationRisks: risks,
    pages: pageReports
  };
}

function groupPageShapesByLayer(shapes) {
  const groups = new Map();
  shapes.forEach((shape, shapeIndex) => {
    const source = shape?.source || {};
    const layerId = String(source.layerSourceId || source.layerId || source.imageId || "__page__");
    const key = `${layerId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        layerId,
        shapes: [],
        shapeIndices: []
      });
    }
    groups.get(key).shapes.push(shape);
    groups.get(key).shapeIndices.push(shapeIndex);
  });
  return Array.from(groups.values());
}

function summarizeLayerGroup(group) {
  const detectorCounts = {};
  const familyCounts = {};
  const builderCounts = {};
  let atomObjects = 0;
  let networkAtomObjects = 0;
  let summaryObjects = 0;
  let componentObjects = 0;
  const componentOwnerIds = new Set();
  const componentOwnerShapeCounts = {};

  group.shapes.forEach((shape) => {
    const source = shape?.source || {};
    const detector = String(source.detector || source.kind || shape?.type || "unknown");
    const family = detectorFamily(detector);
    const builderId = nativeBuilderRoot(detector);
    detectorCounts[detector] = (detectorCounts[detector] || 0) + 1;
    familyCounts[family] = (familyCounts[family] || 0) + 1;
    if (builderId) builderCounts[builderId] = (builderCounts[builderId] || 0) + 1;
    if (isAtomFamily(family)) atomObjects += 1;
    if (family === "network-atom") networkAtomObjects += 1;
    if (isSummaryFamily(family)) summaryObjects += 1;
    if (isComponentFamily(family)) componentObjects += 1;
    if (source.componentOwnerId) {
      const ownerId = String(source.componentOwnerId);
      componentOwnerIds.add(ownerId);
      componentOwnerShapeCounts[ownerId] = Number(componentOwnerShapeCounts[ownerId] || 0) + 1;
    }
  });
  const componentOwnerObjects = componentOwnerIds.size;
  summaryObjects += componentOwnerObjects;
  const primaryBuilderIds = Object.entries(builderCounts)
    .filter(([, count]) => count >= 3)
    .map(([builderId]) => builderId)
    .sort();

  return {
    layerId: group.layerId,
    shapeCount: group.shapes.length,
    atomObjects,
    networkAtomObjects,
    summaryObjects,
    componentObjects,
    componentOwnerObjects,
    componentOwnerIds: Array.from(componentOwnerIds).sort(),
    componentOwnerShapeCounts,
    primaryBuilderIds,
    builderCounts,
    detectorCounts,
    familyCounts,
    dominantFamilies: Object.entries(familyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([family, count]) => ({ family, count }))
  };
}

function scoreLayerFragmentationRisk(report, pageIndex, thresholds) {
  const risks = [];
  const largestOwner = Object.entries(report.componentOwnerShapeCounts || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]))[0] || null;
  if (largestOwner && Number(largestOwner[1]) > thresholds.maxShapesPerComponentOwner) {
    risks.push({
      type: "oversized-native-component-owner",
      severity: "medium",
      pageIndex,
      layerId: report.layerId,
      componentOwnerId: largestOwner[0],
      shapeCount: Number(largestOwner[1]),
      message: "One semantic component still contains too many independently selectable shapes and should be compacted into higher-level native paths or groups."
    });
  }
  if (report.networkAtomObjects >= thresholds.denseNetworkAtomCount && report.summaryObjects === 0) {
    risks.push({
      type: "dense-native-network-fragmentation",
      severity: "high",
      pageIndex,
      layerId: report.layerId,
      shapeCount: report.shapeCount,
      atomObjects: report.atomObjects,
      networkAtomObjects: report.networkAtomObjects,
      message: "Dense network was rebuilt as many native atom shapes without a summary/component owner."
    });
  }

  if (report.atomObjects >= thresholds.denseVisualAtomCount && report.componentObjects === 0 && report.summaryObjects === 0) {
    risks.push({
      type: "native-atom-pile-without-component-owner",
      severity: "medium",
      pageIndex,
      layerId: report.layerId,
      shapeCount: report.shapeCount,
      atomObjects: report.atomObjects,
      message: "Layer contains many low-level native atoms but no higher-level component or summary owner."
    });
  }

  // A specialized builder normally emits cards, icons, connectors, and
  // shadows. Only distinct builder roots represent competing rebuilders.
  const competingBuilders = Object.entries(report.builderCounts || {})
    .filter(([, count]) => count >= 3)
    .filter(([builderId]) => builderId !== "visual-atom" && builderId !== "layer");
  if (report.layerId !== "__page__"
    && competingBuilders.length >= 2
    && report.summaryObjects === 0
    && report.componentOwnerObjects === 0) {
    risks.push({
      type: "competing-native-rebuilders",
      severity: "medium",
      pageIndex,
      layerId: report.layerId,
      builders: competingBuilders.map(([builderId, count]) => ({ builderId, count })),
      message: "Multiple native rebuild families appear to own the same layer, which often produces a patched-together look."
    });
  }

  return risks;
}

function scorePageFragmentationRisk(page, thresholds) {
  if (page.shapeCount < thresholds.pageShapeCount || page.imageCount > 0) return null;
  if (page.componentOwnerObjects > 0) return null;
  if (safeArray(page.primaryBuilderIds).length === 1) return null;
  const ownerObjects = page.summaryObjects + page.componentObjects;
  const ownerRatio = ownerObjects / Math.max(1, page.shapeCount);
  if (ownerRatio >= thresholds.minimumComponentRatioForDensePage) return null;
  return {
    type: "dense-native-page-without-component-owners",
    severity: "medium",
    pageIndex: page.pageIndex,
    shapeCount: page.shapeCount,
    atomObjects: page.atomObjects,
    summaryObjects: page.summaryObjects,
    componentObjects: page.componentObjects,
    ownerRatio: Number(ownerRatio.toFixed(4)),
    message: "Page has a high native shape count but too few component/summary owners."
  };
}

function detectorFamily(detector) {
  const value = String(detector || "");
  if (/^network-diagram-native-summary-/.test(value)) return "network-summary";
  if (/^network-diagram-native-dense-component-/.test(value)) return "network-dense-component";
  if (/^network-diagram-native-(?:ray|node|link|label)/.test(value)) return "network-atom";
  if (/^visual-atom-native-/.test(value)) return "visual-atom";
  if (/^cover-engine-core-native-/.test(value)) return "cover-engine-core";
  if (/^generic-node-diagram-native-skeleton-/.test(value)) return "generic-node-skeleton";
  if (/^entropy-fragment-cloud-native-/.test(value)) return "entropy-fragment-cloud";
  if (/^entropy-island-native-/.test(value)) return "entropy-island";
  if (/^cycle-illustration-comparison-matrix-native-/.test(value)) return "comparison-matrix";
  if (/^skills-engine-ai-comparison-native-/.test(value)) return "skills-engine-ai-comparison";
  if (/^grid-like-cycle-hub-spoke-native-/.test(value)) return "cycle-hub-spoke";
  if (/^skill-chain-overview-native-/.test(value)) return "skill-chain-overview";
  if (/^structured-illustration-(?:card|output-document|input-chaos|warning-icon)-native/.test(value)) return "structured-illustration";
  if (/^asset-hub-cycle-native-/.test(value)) return "asset-hub-cycle";
  if (/^asset-os-flow-native-/.test(value)) return "asset-os-flow";
  if (/^input-output-split-native-/.test(value)) return "input-output-split";
  if (/^matrix-residual-native-skeleton-/.test(value)) return "matrix-residual";
  if (/^sparse-matrix-process-strip-native-/.test(value)) return "sparse-matrix-process-strip";
  if (/^table-zone-native-/.test(value)) return "table-zone";
  if (/^demand-understanding-flow-native-/.test(value)) return "demand-understanding-flow";
  if (/^prototype-validation-flow-native-/.test(value)) return "prototype-validation-flow";
  if (/^product-brain-asset-closure-native-/.test(value)) return "product-brain-asset-closure";
  if (/^product-brain-core-value-native-/.test(value)) return "product-brain-core-value";
  if (/^portal-platform-native-component/.test(value)) return "portal-platform-component";
  if (/^review-risk-gate-flow-native-/.test(value)) return "review-risk-gate-flow";
  if (/^triangle-topology-native-/.test(value)) return "triangle-topology";
  if (/^dense-complex-diagram-native-scaffold/.test(value)) return "dense-scaffold";
  if (/^sparse-flow-card-chain-native-/.test(value)) return "sparse-flow-chain";
  if (/component-template|plugin-component|officeplus|islide/i.test(value)) return "component-template";
  if (/native-summary|summary-/i.test(value)) return "generic-summary";
  if (/native-(?:connector|arrow|line|rect|ellipse|circle|polygon|arc|chevron|diamond)/i.test(value)) return "visual-atom";
  if (/textbox|text-box|native-text/i.test(value)) return "text";
  return value || "unknown";
}

function nativeBuilderRoot(detector) {
  const value = String(detector || "").toLowerCase();
  const match = value.match(/^(.+?)-native(?:-|$)/);
  if (!match) return "";
  const root = match[1];
  // These names are part renderers of a single composite, not independent
  // rebuilders: generic scaffolds and table grids support a specialized owner.
  if (/^structured-illustration-(?:card|output-document|input-chaos|warning-icon)$/.test(root)) {
    return "structured-illustration";
  }
  return /^(?:visual-atom|layer|native|dense-complex-diagram|table-zone)$/.test(root) ? "" : root;
}

function isAtomFamily(family) {
  return family === "network-atom" || family === "visual-atom";
}

function isSummaryFamily(family) {
  return family === "network-summary" || family === "generic-summary";
}

function isComponentFamily(family) {
  return [
    "component-template",
    "comparison-matrix",
    "cover-engine-core",
    "cycle-hub-spoke",
    "demand-understanding-flow",
    "dense-scaffold",
    "entropy-fragment-cloud",
    "entropy-island",
    "generic-node-skeleton",
    "asset-hub-cycle",
    "asset-os-flow",
    "input-output-split",
    "matrix-residual",
    "network-dense-component",
    "product-brain-asset-closure",
    "product-brain-core-value",
    "prototype-validation-flow",
    "portal-platform-component",
    "review-risk-gate-flow",
    "skill-chain-overview",
    "skills-engine-ai-comparison",
    "sparse-flow-chain",
    "sparse-matrix-process-strip",
    "structured-illustration",
    "table-zone",
    "triangle-topology"
  ].includes(family);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function parseArgs(argv = []) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.ir || args.input;
  if (!input) {
    process.stderr.write("Usage: node native-fragmentation-audit.js --ir <deck.native.ir.json> [--out report.json] [--fail-on-risk]\n");
    process.exit(2);
  }
  const report = auditNativeFragmentation(readJson(path.resolve(input)));
  if (args.out) {
    const outFile = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify(report.totals, null, 2)}\n`);
  if (args["fail-on-risk"] && !report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  auditNativeFragmentation,
  detectorFamily,
  nativeBuilderRoot,
  scoreLayerFragmentationRisk,
  scorePageFragmentationRisk
};
