"use strict";

const { centerOf, clamp, median, round } = require("./diagram-geometry");

function scoreUnderstanding({ archetype, nodes, connectors, residuals, item, visualAtoms = [], visualNodes = [], visualConnectors = [], visualGrid = null }) {
  let score = 0.18;
  const structuralNodeCount = Math.max(nodes.length, visualNodes.length);
  const structuralConnectorCount = Math.max(connectors.length, visualConnectors.length, connectorAtomCount(countBy(visualAtoms, "kind")));
  const atomKinds = countBy(visualAtoms, "kind");
  if (structuralNodeCount >= 3) score += 0.22;
  if (structuralNodeCount >= 5) score += 0.08;
  if (visualAtoms.length >= 3) score += 0.12;
  if (visualAtoms.some((atom) => atom.nativeCandidate)) score += 0.06;
  if (visualGrid) score += 0.16;
  if (structuralConnectorCount >= Math.max(1, structuralNodeCount - 2)) score += 0.18;
  if (archetype !== "unclassified-diagram") score += 0.18;
  if ((archetype === "donut-chart" || archetype === "pie-chart") && ((atomKinds["native-donut-candidate"] || 0) >= 1 || (atomKinds["native-donut-segment-candidate"] || 0) >= 2 || (atomKinds["native-pie-segment-candidate"] || 0) >= 2) && residuals.length === 0) score += 0.26;
  if (archetype === "scatter-chart" && (atomKinds["native-scatter-point-candidate"] || 0) >= 5 && connectorAtomCount(atomKinds) >= 2 && residuals.length === 0) score += 0.22;
  if (archetype === "line-chart" && visualAtoms.filter((atom) => atom.kind === "connector-line-candidate" && atom.shapeHint === "line-diagonal").length >= 2 && residuals.length === 0) score += 0.18;
  if (archetype === "gauge-chart" && (atomKinds["native-gauge-arc-candidate"] || 0) >= 1 && (atomKinds["native-gauge-needle-candidate"] || 0) >= 1 && residuals.length === 0) score += 0.18;
  if (archetype === "radar-chart" && (atomKinds["native-radar-frame-candidate"] || 0) >= 1 && (atomKinds["native-radar-score-candidate"] || 0) >= 1 && residuals.length === 0) score += 0.18;
  if (archetype === "cycle-loop" && ((atomKinds["native-arc-arrow-segment-candidate"] || 0) >= 3 || (atomKinds["native-cycle-arrow-candidate"] || 0) >= 1) && residuals.length === 0) score += 0.2;
  if (archetype === "screenshot-card-grid" && structuralNodeCount >= 2 && residuals.length > 0) score += 0.16;
  if (archetype === "visual-example-card-grid" && structuralNodeCount >= 2 && residuals.length > 0) score += 0.16;
  if (archetype === "feature-icon-card-grid" && structuralNodeCount >= 3 && residuals.length > 0) score += 0.16;
  if (archetype === "numbered-step-card-grid" && structuralNodeCount >= 3 && residuals.length === 0) score += 0.18;
  if (archetype === "quadrant-matrix" && visualGrid && Number(visualGrid.rows) === 2 && Number(visualGrid.columns) === 2) score += 0.14;
  if (archetype === "gantt-roadmap" && structuralNodeCount >= 3 && connectorAtomCount(atomKinds) >= 1 && residuals.length === 0) score += 0.18;
  if (archetype === "timeline-roadmap"
    && visualAtoms.some((atom) => atom?.kind === "native-timeline-candidate" && Array.isArray(atom.timelineMilestones) && atom.timelineMilestones.length >= 3)
    && residuals.length === 0) score += 0.12;
  if (item.source?.expressionForm === "complex-diagram" || item.source?.expressionForm === "linear-process-diagram") score += 0.08;
  if (item.source?.expressionForm === "chart-snapshot" || item.source?.expressionForm === "data-chart") score += 0.08;
  if (residuals.length > 0) score += 0.04;
  return round(clamp(score, 0, 0.95));
}

function countBy(items = [], field) {
  const result = {};
  for (const item of items) {
    const key = String(item?.[field] || "unknown");
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function nativeNodeAtomCount(atomKinds = {}) {
  return (atomKinds["native-rect-candidate"] || 0)
    + (atomKinds["native-ellipse-candidate"] || 0)
    + (atomKinds["native-diamond-candidate"] || 0)
    + (atomKinds["native-triangle-candidate"] || 0)
    + (atomKinds["native-chevron-candidate"] || 0)
    + (atomKinds["native-parallelogram-candidate"] || 0)
    + (atomKinds["native-cylinder-candidate"] || 0)
    + (atomKinds["native-cloud-candidate"] || 0)
    + (atomKinds["native-document-candidate"] || 0)
    + (atomKinds["native-screen-candidate"] || 0)
    + (atomKinds["native-phone-candidate"] || 0)
    + (atomKinds["native-person-candidate"] || 0)
    + (atomKinds["native-team-candidate"] || 0)
    + (atomKinds["native-timeline-candidate"] || 0)
    + (atomKinds["native-funnel-candidate"] || 0)
    + (atomKinds["native-donut-candidate"] || 0)
    + (atomKinds["native-donut-segment-candidate"] || 0)
    + (atomKinds["native-pie-segment-candidate"] || 0)
    + (atomKinds["native-concentric-circle-candidate"] || 0)
    + (atomKinds["native-quadrant-panel-candidate"] || 0)
    + (atomKinds["native-scatter-point-candidate"] || 0)
    + (atomKinds["native-cycle-arrow-candidate"] || 0)
    + (atomKinds["native-gauge-arc-candidate"] || 0)
    + (atomKinds["native-gauge-needle-candidate"] || 0)
    + (atomKinds["native-radar-frame-candidate"] || 0)
    + (atomKinds["native-radar-score-candidate"] || 0);
}

function connectorAtomCount(atomKinds = {}) {
  return (atomKinds["connector-line-candidate"] || 0)
    + (atomKinds["connector-arrow-candidate"] || 0)
    + (atomKinds["grid-line-candidate"] || 0);
}

function relationConnectorAtomCount(atomKinds = {}) {
  return (atomKinds["connector-line-candidate"] || 0)
    + (atomKinds["connector-arrow-candidate"] || 0);
}

function visualAtomDominance(visualAtoms = [], kind) {
  const target = visualAtoms.find((atom) => atom?.kind === kind && validBox(atom.box));
  const boxes = visualAtoms.map((atom) => atom?.box).filter(validBox);
  if (!target || boxes.length === 0) return 0;
  const left = Math.min(...boxes.map((box) => Number(box.x)));
  const top = Math.min(...boxes.map((box) => Number(box.y)));
  const right = Math.max(...boxes.map((box) => Number(box.x) + Number(box.w)));
  const bottom = Math.max(...boxes.map((box) => Number(box.y) + Number(box.h)));
  const unionArea = Math.max(1, (right - left) * (bottom - top));
  return Number(target.box.w) * Number(target.box.h) / unionArea;
}

function validBox(box = {}) {
  return [box.x, box.y, box.w, box.h].every(Number.isFinite)
    && Number(box.w) > 0 && Number(box.h) > 0;
}

function estimateVisualNodeRows(visualNodes = []) {
  const nodes = visualNodes.filter((node) => validBox(node?.box)).sort((left, right) => centerOf(left.box).y - centerOf(right.box).y);
  if (nodes.length === 0) return 0;
  const medianHeight = median(nodes.map((node) => Number(node.box.h)));
  const tolerance = Math.max(6, medianHeight * 0.65);
  const rows = [];
  for (const node of nodes) {
    const y = centerOf(node.box).y;
    const row = rows.find((candidate) => Math.abs(candidate.y - y) <= tolerance);
    if (row) {
      row.y = (row.y * row.count + y) / (row.count + 1);
      row.count += 1;
    } else {
      rows.push({ y, count: 1 });
    }
  }
  return rows.length;
}

function readinessFor({ archetype, confidence, nodes, connectors, residuals, visualAtoms = [], visualNodes = [], visualConnectors = [], visualGrid = null }) {
  const atomKinds = countBy(visualAtoms, "kind");
  const structuralNodeCount = Math.max(nodes.length, visualNodes.length);
  const structuralConnectorCount = Math.max(connectors.length, visualConnectors.length, connectorAtomCount(atomKinds));
  const measuredRelationConnectorCount = Math.max(connectors.length, visualConnectors.length, relationConnectorAtomCount(atomKinds));
  if (archetype === "machine-readable-code") return "preserve-crop";
  if (archetype === "dense-radial-line-art") return "preserve-crop";
  if (archetype === "screenshot-card-grid" && confidence >= 0.46) return "hybrid-native-plus-residual-crops";
  if (archetype === "visual-example-card-grid" && confidence >= 0.46) return "hybrid-native-plus-residual-crops";
  if (archetype === "screenshot-zoom-callout" && confidence >= 0.42) return "hybrid-native-plus-residual-crops";
  if (archetype === "screenshot-annotation" && confidence >= 0.42) return "hybrid-native-plus-residual-crops";
  if (archetype === "feature-icon-card-grid" && confidence >= 0.5 && structuralNodeCount >= 3) return "hybrid-native-plus-residual-crops";
  if (archetype === "numbered-step-card-grid" && confidence >= 0.54 && structuralNodeCount >= 3 && residuals.length === 0) return "native-rebuild";
  if (archetype === "dashboard-card-grid" && confidence >= 0.58 && structuralNodeCount >= 4 && residuals.length === 0) return "native-rebuild";
  if (archetype === "quadrant-matrix" && confidence >= 0.58 && residuals.length === 0) return "native-rebuild";
  if (archetype === "comparison-matrix" && confidence >= 0.58 && structuralNodeCount >= 4 && residuals.length === 0) return "native-rebuild";
  if (archetype === "heatmap-matrix" && confidence >= 0.58 && residuals.length === 0) return "native-rebuild";
  if (archetype === "treemap-chart" && confidence >= 0.58 && structuralNodeCount >= 3 && residuals.length === 0) return "native-rebuild";
  if (archetype === "sankey-flow-chart"
    && confidence >= 0.62
    && (atomKinds["native-sankey-band-candidate"] || 0) >= 1
    && (atomKinds["native-rect-candidate"] || 0) >= 3
    && residuals.length === 0) return "native-rebuild";
  if (archetype === "sankey-flow-chart" && confidence >= 0.48) return "preserve-crop-with-structured-metadata";
  if (archetype === "map-chart" && confidence >= 0.48) return "preserve-crop-with-structured-metadata";
  if (archetype === "word-cloud-chart" && confidence >= 0.48) return "preserve-crop-with-structured-metadata";
  if (archetype === "waterfall-chart" && confidence >= 0.62 && structuralNodeCount >= 4 && residuals.length === 0) return "native-rebuild";
  if (archetype === "gauge-chart"
    && confidence >= 0.58
    && (atomKinds["native-gauge-arc-candidate"] || 0) >= 1
    && (atomKinds["native-gauge-needle-candidate"] || 0) >= 1
    && visualAtomDominance(visualAtoms, "native-gauge-arc-candidate") >= 0.55
    && residuals.length === 0) return "native-rebuild";
  if (archetype === "radar-chart" && confidence >= 0.58 && residuals.length === 0) return "native-rebuild";
  if (archetype === "flow-card-chain"
    && confidence >= 0.72
    && residuals.length === 0
    && (nodes.length >= 3
      || (visualNodes.length >= 3 && measuredRelationConnectorCount >= visualNodes.length - 1))) return "native-rebuild";
  if ((archetype === "generic-node-diagram" || archetype === "multi-cluster-diagram")
    && confidence >= 0.72
    && structuralNodeCount >= 3
    && measuredRelationConnectorCount >= structuralNodeCount - 1
    && residuals.length === 0) return "native-rebuild";
  if (archetype === "concentric-circles" && confidence >= 0.58 && structuralNodeCount >= 2 && residuals.length === 0) return "native-rebuild";
  if (archetype === "gantt-roadmap" && confidence >= 0.58 && structuralNodeCount >= 3 && residuals.length === 0) return "native-rebuild";
  if (archetype === "matrix-or-grid" && visualGrid && visualGrid.rows >= 2 && visualGrid.columns >= 2) return "delegate-to-table-grid-parser";
  if ((archetype === "donut-chart" || archetype === "pie-chart") && confidence >= 0.68 && residuals.length === 0) return "native-rebuild";
  if (archetype === "bar-chart" && (atomKinds["native-rect-candidate"] || 0) >= 3 && structuralConnectorCount >= 1 && residuals.length === 0) return "native-rebuild";
  if (archetype === "scatter-chart" && confidence >= 0.68 && (atomKinds["native-scatter-point-candidate"] || 0) >= 5 && structuralConnectorCount >= 2 && residuals.length === 0) return "native-rebuild";
  if (archetype === "line-chart" && confidence >= 0.68 && structuralConnectorCount >= 2 && residuals.length === 0) return "native-rebuild";
  if (archetype === "cycle-loop"
    && confidence >= 0.62
    && ((atomKinds["native-cycle-arrow-candidate"] || 0) >= 2
      || (atomKinds["native-arc-arrow-segment-candidate"] || 0) >= 2)
    && residuals.length === 0) return "native-rebuild";
  if (archetype === "funnel-lens-flow" && confidence >= 0.58 && structuralNodeCount >= 3 && residuals.length === 0) return "native-rebuild";
  if (archetype === "fishbone-cause-effect" && confidence >= 0.58 && structuralConnectorCount >= 4 && residuals.length === 0) return "native-rebuild";
  if (archetype === "topology-diagram" && confidence >= 0.58 && structuralNodeCount >= 3 && structuralConnectorCount >= 2 && residuals.length === 0) return "native-rebuild";
  if (archetype === "tree-structure"
    && confidence >= 0.58
    && structuralNodeCount >= 4
    && measuredRelationConnectorCount >= structuralNodeCount - 1
    && residuals.length === 0) return "native-rebuild";
  if (archetype === "layered-stack" && confidence >= 0.58 && structuralNodeCount >= 3 && residuals.length === 0) return "native-rebuild";
  if (archetype === "venn-overlap" && confidence >= 0.58 && structuralNodeCount >= 2 && residuals.length === 0) return "native-rebuild";
  const measuredTimeline = visualAtoms.some((atom) => atom?.kind === "native-timeline-candidate"
    && Array.isArray(atom.timelineMilestones)
    && atom.timelineMilestones.length >= 3);
  if (archetype === "timeline-roadmap"
    && confidence >= 0.58
    && (nodes.length >= 3 || measuredTimeline)
    && residuals.length === 0) return "native-rebuild";
  const swimlaneRows = archetype === "swimlane-flow" ? estimateVisualNodeRows(visualNodes) : 0;
  if (archetype === "swimlane-flow"
    && confidence >= 0.58
    && swimlaneRows >= 2
    && visualNodes.length >= 6
    && measuredRelationConnectorCount >= visualNodes.length - swimlaneRows
    && residuals.length === 0) return "native-rebuild";
  if ([
    "gauge-chart",
    "flow-card-chain",
    "generic-node-diagram",
    "multi-cluster-diagram",
    "cycle-loop",
    "tree-structure",
    "swimlane-flow",
    "timeline-roadmap"
  ].includes(archetype)) {
    if (confidence >= 0.62 && structuralNodeCount >= 3 && measuredRelationConnectorCount > 0) {
      return "hybrid-native-plus-residual-crops";
    }
    return confidence >= 0.48 ? "preserve-crop-with-structured-metadata" : "preserve-crop";
  }
  if (confidence >= 0.72 && structuralConnectorCount > 0 && residuals.length === 0) return "native-rebuild";
  if (confidence >= 0.62 && structuralNodeCount >= 3 && structuralConnectorCount > 0) return "hybrid-native-plus-residual-crops";
  if (archetype === "matrix-or-grid" && nodes.length >= 4) return "delegate-to-table-grid-parser";
  if (confidence >= 0.48) return "preserve-crop-with-structured-metadata";
  return "preserve-crop";
}

module.exports = {
  scoreUnderstanding,
  countBy,
  nativeNodeAtomCount,
  connectorAtomCount,
  relationConnectorAtomCount,
  visualAtomDominance,
  validBox,
  estimateVisualNodeRows,
  readinessFor
};
