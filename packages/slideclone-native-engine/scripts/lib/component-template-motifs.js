"use strict";

const { componentFamily } = require("./component-template-family-evidence");

const ALLOWED_COMPONENT_MOTIF_PATTERN = /^(cycle-loop|arc-arrow|ring-node|card-grid|dashboard-card-grid|comparison-matrix|heatmap-matrix|treemap-chart|sankey-flow-chart|map-chart|word-cloud-chart|waterfall-chart|gauge-chart|radar-chart|tree-link|org-hierarchy|fishbone-cause|radial-link|screenshot-card-grid|screenshot-crop|visual-example-card-grid|visual-example-crop|feature-icon-card-grid|icon-crop|numbered-step-card-grid|step-badge|screenshot-zoom-callout|zoom-lens-overlay|screenshot-annotation|callout-overlay|highlight-box|concentric-circles|linear-arrow-chain|whole-process-template|lens-funnel-flow|branch-card-flow|layered-stack|funnel-stack|pyramid-stack|venn-overlap|intersection-overlap|milestone-roadmap|gantt-roadmap|quadrant-axis|pie-share-chart|bubble-scatter-chart|donut-segment-chart|topology-triangle)$/;

function componentTemplateTargetMotifs(image = {}, match = {}) {
  if (match.assetMotifReady !== true && !hasCandidateMotifEvidence(image, match) && !hasLayerMotifEvidence(image, match)) return [];
  const readiness = image?.source?.componentAssetReadiness || {};
  const strategy = image?.source?.componentRenderStrategy || {};
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const candidate = strategy.bestCandidate || {};
  const explicit = [
    ...(Array.isArray(readiness.targetMotifs) ? readiness.targetMotifs : []),
    ...(Array.isArray(understanding.targetMotifs) ? understanding.targetMotifs : []),
    ...(Array.isArray(understanding.componentStrategy?.targetMotifs) ? understanding.componentStrategy.targetMotifs : []),
    ...(Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : []),
    ...(Array.isArray(match.targetMotifs) ? match.targetMotifs : []),
    ...(Array.isArray(match.structureSignature?.motifs) ? match.structureSignature.motifs : []),
    ...(Array.isArray(candidate.targetMotifs) ? candidate.targetMotifs : []),
    ...(Array.isArray(candidate.structureSignature?.motifs) ? candidate.structureSignature.motifs : []),
    ...fallbackTargetMotifsForComponent(image, match)
  ];
  return explicit
    .map((motif) => safeText(motif).toLowerCase())
    .filter((motif) => ALLOWED_COMPONENT_MOTIF_PATTERN.test(motif))
    .filter((motif, index, values) => values.indexOf(motif) === index)
    .slice(0, 8);
}

function hasCandidateMotifEvidence(image = {}, match = {}) {
  const strategy = image?.source?.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  return [
    ...(Array.isArray(match.targetMotifs) ? match.targetMotifs : []),
    ...(Array.isArray(match.structureSignature?.motifs) ? match.structureSignature.motifs : []),
    ...(Array.isArray(candidate.targetMotifs) ? candidate.targetMotifs : []),
    ...(Array.isArray(candidate.structureSignature?.motifs) ? candidate.structureSignature.motifs : [])
  ].some((motif) => ALLOWED_COMPONENT_MOTIF_PATTERN.test(safeText(motif).toLowerCase()));
}

function hasLayerMotifEvidence(image = {}, match = {}) {
  const strategy = image?.source?.componentRenderStrategy || {};
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const values = [
    ...(Array.isArray(understanding.targetMotifs) ? understanding.targetMotifs : []),
    ...(Array.isArray(understanding.componentStrategy?.targetMotifs) ? understanding.componentStrategy.targetMotifs : []),
    ...(Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : []),
    ...fallbackTargetMotifsForComponent(image, match)
  ];
  return values.some((motif) => ALLOWED_COMPONENT_MOTIF_PATTERN.test(safeText(motif).toLowerCase()));
}

function fallbackTargetMotifsForComponent(image = {}, match = {}) {
  const family = componentFamily(image, match);
  if (family === "matrix" || family === "quadrant") return family === "quadrant" ? ["card-grid", "quadrant-axis"] : ["card-grid"];
  if (family === "process-chain") return ["linear-arrow-chain"];
  if (family === "timeline") return ["milestone-roadmap"];
  if (family === "cycle-loop") return ["arc-arrow"];
  if (family === "treemap-chart") return ["treemap-chart"];
  if (family === "scatter-chart") return ["bubble-scatter-chart"];
  if (family === "donut-chart") return ["donut-segment-chart"];
  if (family === "pie-chart") return ["pie-share-chart"];
  if (family === "hub-spoke") return hasTreeLikeComponentEvidence(image, match) ? ["tree-link"] : ["radial-link"];
  if (family === "layered-stack") return [layeredStackDefaultMotif(image)];
  return [];
}

function hasTreeLikeComponentEvidence(image = {}, match = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const strategy = image?.source?.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  const text = [
    layer.templateFamily,
    understanding.archetype,
    understanding.structureSignature?.primaryKind,
    understanding.structureSignature?.layout,
    understanding.componentStrategy?.templateFamily,
    match.templateFamily,
    match.structureSignature?.primaryKind,
    candidate.structureSignature?.primaryKind,
    candidate.title
  ].map((value) => safeText(value).toLowerCase()).join(" ");
  return /tree|org|hierarchy|组织|树/.test(text);
}

function isWholeProcessTemplateMatch(image = {}, match = {}) {
  return componentTemplateTargetMotifs(image, match).includes("whole-process-template");
}

function motifSetForAssetGroup(asset = {}, group = {}) {
  const motifs = new Set();
  collectMotifs(group?.structure, motifs);
  for (const item of Array.isArray(asset.recommendedComponentGroups) ? asset.recommendedComponentGroups : []) {
    collectMotifs(item?.structure, motifs);
  }
  for (const item of Array.isArray(asset.learningSummary?.componentCatalog) ? asset.learningSummary.componentCatalog : []) {
    collectMotifs(item?.structure, motifs);
  }
  return [...motifs];
}

function collectMotifs(structure = {}, motifs) {
  if (!structure || typeof structure !== "object" || !motifs) return;
  for (const motif of Array.isArray(structure.motifs) ? structure.motifs : []) {
    const safe = safeText(motif).toLowerCase();
    if (safe) motifs.add(safe);
  }
  for (const motif of Object.keys(structure.motifCounts || {})) {
    const safe = safeText(motif).toLowerCase();
    if (safe) motifs.add(safe);
  }
}

function layeredStackDefaultMotif(image = {}) {
  const text = [
    image?.source?.layer?.templateFamily,
    image?.source?.layer?.diagramUnderstanding?.archetype,
    image?.source?.componentRenderStrategy?.bestCandidate?.title,
    image?.source?.componentRenderStrategy?.bestCandidate?.description
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  if (/funnel|漏斗/.test(text)) return "funnel";
  if (/pyramid|金字塔/.test(text)) return "pyramid";
  return "layered-stack";
}

function safeText(value) {
  return String(value ?? "")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return (code >= 32 && code !== 127) || code > 127;
    })
    .join("")
    .trim()
    .slice(0, 120);
}

module.exports = {
  componentTemplateTargetMotifs,
  fallbackTargetMotifsForComponent,
  hasCandidateMotifEvidence,
  hasLayerMotifEvidence,
  hasTreeLikeComponentEvidence,
  isWholeProcessTemplateMatch,
  layeredStackDefaultMotif,
  motifSetForAssetGroup
};
