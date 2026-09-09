"use strict";

const { hasTargetConcentricCircleEvidence } = require("./component-template-source-evidence");

function hasStructuredMatrixEvidence(image = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const atomCounts = understanding.visualAtomKindCounts || {};
  const gridAtoms = clampNumber(atomCounts["grid-line-candidate"], 0, 999, 0);
  const visualGrid = understanding.visualGrid || {};
  const visualGridLineCount = clampNumber(visualGrid.lineCount, 0, 999, 0);
  const layerText = `${layer.layerType || ""} ${understanding.archetype || ""} ${understanding.componentStrategy?.templateFamily || ""}`.toLowerCase();
  return gridAtoms >= 4 || visualGridLineCount >= 4 || /table|matrix|grid/.test(layerText);
}

function hasStructuredQuadrantEvidence(image = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const strategy = image?.source?.componentRenderStrategy || {};
  const bestCandidate = strategy.bestCandidate || {};
  const text = [
    layer.layerType,
    layer.templateFamily,
    understanding.archetype,
    understanding.structureSignature?.primaryKind,
    understanding.structureSignature?.layout,
    understanding.componentStrategy?.templateFamily,
    bestCandidate.structureSignature?.primaryKind,
    bestCandidate.structureSignature?.layout,
    bestCandidate.title,
    bestCandidate.description,
    ...(Array.isArray(bestCandidate.targetMotifs) ? bestCandidate.targetMotifs : [])
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  const nodeCount = clampNumber(understanding.visualNodeCount || understanding.nodeCount, 0, 999, 0);
  const atoms = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
  const horizontal = atoms.filter((atom) => atom?.axis === "h" || atom?.shapeHint === "grid-line-horizontal").length;
  const vertical = atoms.filter((atom) => atom?.axis === "v" || atom?.shapeHint === "grid-line-vertical").length;
  const layerType = String(layer.layerType || "").toLowerCase();
  const archetype = String(understanding.archetype || "").toLowerCase();
  const explicitQuadrant = /quadrant|2x2|four-quadrant|axis-grid|象限|四象限|二维/.test(text);
  if (/table|matrix|grid/.test(layerType) || /matrix-or-grid|table|grid/.test(archetype)) {
    return !/screenshot|document/.test(layerType)
      && nodeCount >= 4
      && explicitQuadrant;
  }
  return /diagram|table|illustration/.test(layerType)
    && !/screenshot|document/.test(layerType)
    && nodeCount >= 4
    && (explicitQuadrant || (horizontal >= 1 && vertical >= 1 && nodeCount >= 4));
}

function hasStructuredRelationshipEvidence(image = {}) {
  if (hasStructuredMatrixEvidence(image)) return false;
  if (hasStructuredCycleEvidence(image)) return true;
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const layerType = String(layer.layerType || "").toLowerCase();
  const archetype = String(understanding.archetype || "").toLowerCase();
  const nodeCount = clampNumber(understanding.nodeCount, 0, 999, 0);
  const connectorCount = clampNumber(understanding.connectorCount, 0, 999, 0);
  return /diagram|illustration/.test(layerType)
    && !/screenshot|document/.test(layerType)
    && nodeCount >= 3
    && (connectorCount >= 1 || clampNumber(understanding.visualAtomCount, 0, 999, 0) >= 3)
    && /generic-node|hub|spoke|cycle|radial|topology/.test(archetype);
}

function hasStructuredCycleEvidence(image = {}) {
  if (hasStructuredMatrixEvidence(image)) return false;
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const strategy = image?.source?.componentRenderStrategy || {};
  const bestCandidate = strategy.bestCandidate || {};
  const text = [
    layer.layerType,
    layer.templateFamily,
    understanding.archetype,
    understanding.componentStrategy?.templateFamily,
    bestCandidate.title,
    bestCandidate.description,
    bestCandidate.reuseHint
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  const nodeCount = clampNumber(understanding.nodeCount, 0, 999, 0);
  const connectorCount = clampNumber(understanding.connectorCount, 0, 999, 0);
  const visualAtomCount = clampNumber(understanding.visualAtomCount, 0, 999, 0);
  return /diagram|illustration/.test(String(layer.layerType || "").toLowerCase())
    && !/screenshot|document/.test(String(layer.layerType || "").toLowerCase())
    && /cycle-loop|闭环|循环|环形|双环|cycle|loop|radial/.test(text)
    && (nodeCount >= 2 || connectorCount >= 1 || visualAtomCount >= 3);
}

function hasStructuredLayeredStackEvidence(image = {}) {
  if (hasStructuredMatrixEvidence(image)) return false;
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const strategy = image?.source?.componentRenderStrategy || {};
  const bestCandidate = strategy.bestCandidate || {};
  const targetMotifs = [
    ...(Array.isArray(understanding.componentStrategy?.targetMotifs) ? understanding.componentStrategy.targetMotifs : []),
    ...(Array.isArray(bestCandidate.targetMotifs) ? bestCandidate.targetMotifs : [])
  ].join(" ").toLowerCase();
  const text = [
    layer.layerType,
    layer.templateFamily,
    understanding.archetype,
    understanding.structureSignature?.primaryKind,
    understanding.structureSignature?.layout,
    understanding.componentStrategy?.templateFamily,
    bestCandidate.structureSignature?.primaryKind,
    bestCandidate.structureSignature?.layout,
    bestCandidate.title,
    bestCandidate.description,
    targetMotifs
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  const visualNodeCount = clampNumber(understanding.visualNodeCount || understanding.nodeCount, 0, 999, 0);
  return /diagram|illustration|table/.test(String(layer.layerType || "").toLowerCase())
    && !/screenshot|document/.test(String(layer.layerType || "").toLowerCase())
    && visualNodeCount >= 3
    && /funnel|pyramid|layered|layer-stack|stacked-layer|stacked|层级|分层|金字塔|漏斗|架构层/.test(text);
}

function effectiveComponentGroupMinScore(image, family, baseMinScore) {
  if (family === "quadrant" && hasStructuredQuadrantEvidence(image)) return Math.min(baseMinScore, 48);
  if (family === "matrix" && hasStructuredMatrixEvidence(image)) return Math.min(baseMinScore, 50);
  if (family === "layered-stack" && hasStructuredLayeredStackEvidence(image)) return Math.min(baseMinScore, 48);
  if (family === "cycle-loop" && hasStructuredCycleEvidence(image)) return Math.min(baseMinScore, 48);
  if (family === "hub-spoke" && hasStructuredRelationshipEvidence(image)) return Math.min(baseMinScore, 48);
  if (family === "process-chain" && hasStructuredProcessEvidence(image)) return Math.min(baseMinScore, 52);
  if (family === "timeline" && hasStructuredTimelineEvidence(image)) return Math.min(baseMinScore, 50);
  return baseMinScore;
}

function hasStructuredTimelineEvidence(image = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const layerText = `${layer.layerType || ""} ${layer.templateFamily || ""} ${understanding.archetype || ""} ${understanding.componentStrategy?.templateFamily || ""}`.toLowerCase();
  return /timeline|milestone|时间轴|里程碑/.test(layerText);
}

function hasStructuredProcessEvidence(image = {}) {
  if (hasStructuredSwimlaneProcessEvidence(image)) return true;
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const layerType = String(layer.layerType || "").toLowerCase();
  const archetype = String(understanding.archetype || "").toLowerCase();
  const family = String(understanding.componentStrategy?.templateFamily || "").toLowerCase();
  const nodeCount = clampNumber(understanding.nodeCount, 0, 999, 0);
  const connectorCount = clampNumber(understanding.connectorCount, 0, 999, 0);
  return /diagram/.test(layerType)
    && !/screenshot|document/.test(layerType)
    && nodeCount >= 4
    && connectorCount >= 3
    && (/process|flow|chain|workflow/.test(archetype) || /process|flow|chain/.test(family));
}

function hasStructuredSwimlaneProcessEvidence(image = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const strategy = understanding.componentStrategy || {};
  const signature = understanding.structureSignature || strategy.structureSignature || {};
  const motifs = [
    ...(Array.isArray(understanding.targetMotifs) ? understanding.targetMotifs : []),
    ...(Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : []),
    ...(Array.isArray(image?.source?.componentRenderStrategy?.targetMotifs) ? image.source.componentRenderStrategy.targetMotifs : [])
  ].map((motif) => safeText(motif).toLowerCase());
  const text = [
    layer.layerType,
    layer.templateFamily,
    understanding.archetype,
    strategy.templateFamily,
    signature.layout,
    signature.direction,
    image?.source?.componentRenderStrategy?.bestCandidate?.title
  ].map((value) => safeText(value).toLowerCase()).join(" ");
  const nodeCount = clampNumber(understanding.nodeCount || signature.stepCount, 0, 999, 0);
  const hasProcessMotif = motifs.some((motif) => /linear-arrow-chain|whole-process-template|branch-card-flow/.test(motif));
  const hasSwimlaneLayout = /swimlane|泳道/.test(text);
  return nodeCount >= 4
    && hasProcessMotif
    && (hasSwimlaneLayout || /process-chain|flow|流程/.test(text));
}

function componentFamily(image = {}, match = {}) {
  const strategy = image?.source?.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  const candidateKind = safeText(candidate.structureSignature?.primaryKind || match.structureSignature?.primaryKind).toLowerCase();
  const chartFamily = chartFamilyFromEvidence(image, match);
  if (chartFamily) return chartFamily;
  if (/quadrant|2x2|four-quadrant/.test(candidateKind)) return "quadrant";
  if (hasStructuredSwimlaneProcessEvidence(image)) return "process-chain";
  if (/matrix|grid|table/.test(candidateKind)) return "matrix";
  if (/funnel|pyramid|layered|layer-stack|stacked-layer|stacked/.test(candidateKind)) return "layered-stack";
  if (/hub-spoke|tree|radial|topology/.test(candidateKind)) return "hub-spoke";
  if (/cycle-loop/.test(candidateKind)) return "cycle-loop";
  if (/process-chain|timeline/.test(candidateKind)) return candidateKind === "timeline" ? "timeline" : "process-chain";
  if (hasStructuredQuadrantEvidence(image)) return "quadrant";
  if (hasStructuredSwimlaneProcessEvidence(image)) return "process-chain";
  if (hasStructuredMatrixEvidence(image)) return "matrix";
  if (hasStructuredLayeredStackEvidence(image)) return "layered-stack";
  if (hasStructuredCycleEvidence(image)) return "cycle-loop";
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const direct = String(layer.templateFamily || understanding.archetype || match.templateFamily || "").toLowerCase();
  if (/quadrant|2x2|four-quadrant|象限|四象限|二维/.test(direct)) return "quadrant";
  if (/matrix|grid|table/.test(direct)) return "matrix";
  if (/funnel|pyramid|layered|layer-stack|stacked-layer|stacked|层级|分层|金字塔|漏斗/.test(direct)) return "layered-stack";
  if (/cycle-loop|闭环|循环|环形|双环/.test(direct)) return "cycle-loop";
  if (/hub|spoke|cycle|radial|generic-node|topology/.test(direct)) return "hub-spoke";
  if (/timeline/.test(direct)) return "timeline";
  return "process-chain";
}

function chartFamilyFromEvidence(image = {}, match = {}) {
  const motifs = rawComponentMotifs(image, match);
  if (motifs.includes("treemap-chart")) return "treemap-chart";
  if (motifs.includes("bubble-scatter-chart")) return "scatter-chart";
  if (motifs.includes("donut-segment-chart")) return "donut-chart";
  if (motifs.includes("pie-share-chart")) return "pie-chart";
  if (motifs.includes("venn-overlap") || motifs.includes("intersection-overlap")) return "venn-overlap";
  if (motifs.includes("concentric-circles")) return "concentric-circles";
  if (motifs.includes("ring-node") && hasTargetConcentricCircleEvidence(image)) return "concentric-circles";
  if (motifs.includes("fishbone-cause")) return "fishbone-cause-effect";
  if (motifs.includes("sankey-flow-chart")) return "sankey-flow-chart";
  if (motifs.includes("map-chart")) return "map-chart";
  if (motifs.includes("word-cloud-chart")) return "word-cloud-chart";
  if (motifs.includes("waterfall-chart")) return "waterfall-chart";
  if (motifs.includes("gauge-chart")) return "gauge-chart";
  if (motifs.includes("radar-chart")) return "radar-chart";
  const strategy = image?.source?.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const structureKind = safeText(match.structure?.kind || candidate.structureSignature?.primaryKind || match.structureSignature?.primaryKind).toLowerCase();
  const direct = [
    layer.templateFamily,
    understanding.archetype,
    understanding.componentStrategy?.templateFamily,
    strategy.templateFamily,
    match.templateFamily,
    structureKind,
    candidate.title,
    candidate.description
  ].map((value) => safeText(value).toLowerCase()).join(" ");
  if (/treemap|tree-map|area-composition|area-map|矩形树图/.test(direct)) return "treemap-chart";
  if (/bubble|scatter|气泡|散点/.test(direct)) return "scatter-chart";
  if (/donut|doughnut|segmented-donut|ring-chart|环图|圆环/.test(direct)) return "donut-chart";
  if (/pie|饼图/.test(direct)) return "pie-chart";
  if (/venn|overlap|intersection|韦恩|维恩|交集|重叠/.test(direct)) return "venn-overlap";
  if (/concentric|onion|nested.?circle|同心圆|洋葱图|圈层|嵌套圆/.test(direct)) return "concentric-circles";
  if (/fishbone|cause.?effect|root.?cause|ishikawa|鱼骨|因果|根因/.test(direct)) return "fishbone-cause-effect";
  if (/sankey|alluvial|flow.?distribution|桑基|流向|流量分布/.test(direct)) return "sankey-flow-chart";
  if (/map.?chart|geo.?map|choropleth|地图|区域分布|地理分布/.test(direct)) return "map-chart";
  if (/word.?cloud|tag.?cloud|keyword.?cloud|词云|标签云|关键词云/.test(direct)) return "word-cloud-chart";
  if (/waterfall|variance.?bridge|瀑布|差异桥|增减/.test(direct)) return "waterfall-chart";
  if (/gauge|speedometer|仪表|速度表|半圆仪表/.test(direct)) return "gauge-chart";
  if (/radar|spider|雷达|蛛网|蜘蛛网/.test(direct)) return "radar-chart";
  return "";
}

function rawComponentMotifs(image = {}, match = {}) {
  const readiness = image?.source?.componentAssetReadiness || {};
  const strategy = image?.source?.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  return [
    ...(Array.isArray(readiness.targetMotifs) ? readiness.targetMotifs : []),
    ...(Array.isArray(understanding.targetMotifs) ? understanding.targetMotifs : []),
    ...(Array.isArray(understanding.componentStrategy?.targetMotifs) ? understanding.componentStrategy.targetMotifs : []),
    ...(Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : []),
    ...(Array.isArray(match.targetMotifs) ? match.targetMotifs : []),
    ...(Array.isArray(match.structure?.motifs) ? match.structure.motifs : []),
    ...Object.keys(match.structure?.motifCounts || {}),
    ...(Array.isArray(match.structureSignature?.motifs) ? match.structureSignature.motifs : []),
    ...(Array.isArray(candidate.targetMotifs) ? candidate.targetMotifs : []),
    ...(Array.isArray(candidate.structureSignature?.motifs) ? candidate.structureSignature.motifs : [])
  ].map((motif) => safeText(motif).toLowerCase()).filter(Boolean);
}

function isChartFamily(family = "") {
  return ["treemap-chart", "scatter-chart", "donut-chart", "pie-chart"].includes(family);
}

function isLearnedReplayFamily(family = "") {
  return [
    "venn-overlap",
    "concentric-circles",
    "fishbone-cause-effect",
    "sankey-flow-chart",
    "map-chart",
    "word-cloud-chart",
    "waterfall-chart",
    "gauge-chart",
    "radar-chart"
  ].includes(family);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
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
  chartFamilyFromEvidence,
  componentFamily,
  effectiveComponentGroupMinScore,
  hasStructuredCycleEvidence,
  hasStructuredLayeredStackEvidence,
  hasStructuredMatrixEvidence,
  hasStructuredProcessEvidence,
  hasStructuredQuadrantEvidence,
  hasStructuredRelationshipEvidence,
  hasStructuredSwimlaneProcessEvidence,
  hasStructuredTimelineEvidence,
  isChartFamily,
  isLearnedReplayFamily,
  rawComponentMotifs
};
