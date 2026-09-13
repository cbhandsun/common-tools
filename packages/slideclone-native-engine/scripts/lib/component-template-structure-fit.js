"use strict";

const { clampNumber } = require("./component-template-geometry");
const { safeText } = require("./component-template-sanitizers");

function hasReusableTemplateChildStyleDetails(style = {}) {
  if (!style || typeof style !== "object") return false;
  if (safeText(style.shapeType)) return true;
  if (style.freeform && typeof style.freeform === "object") return true;
  if (safeText(style.fill) || safeText(style.stroke)) return true;
  if (style.gradient && typeof style.gradient === "object") return true;
  if (style.picture && typeof style.picture === "object") return true;
  if (style.text && typeof style.text === "object") return true;
  return false;
}

function summarizeGenerationStructureSignature(summary = {}) {
  const catalog = Array.isArray(summary.componentCatalog) ? summary.componentCatalog : [];
  const motifs = new Set();
  const kinds = new Set();
  for (const group of catalog) {
    const structure = group?.structure || {};
    if (structure.primaryKind) kinds.add(safeText(structure.primaryKind));
    for (const motif of Array.isArray(structure.motifs) ? structure.motifs : []) motifs.add(safeText(motif));
  }
  return {
    provider: "component-generation-structure-signature-v1",
    primaryKind: [...kinds].filter(Boolean)[0] || "",
    motifs: [...motifs].filter(Boolean).slice(0, 8),
    catalogGroups: catalog.length
  };
}

function isBetterComponentGroupCandidate(candidate = {}, current = null) {
  if (!current) return true;
  const score = clampNumber(candidate.score, 0, 100, 0);
  const currentScore = clampNumber(current.score, 0, 100, 0);
  const scoreDelta = score - currentScore;
  if (Math.abs(scoreDelta) > 12) return scoreDelta > 0;
  const structureFit = clampNumber(candidate.structureFitScore, -100, 100, 0);
  const currentStructureFit = clampNumber(current.structureFitScore, -100, 100, 0);
  if (Math.abs(structureFit - currentStructureFit) >= 4) return structureFit > currentStructureFit;
  const styleRank = componentGroupStyleDetailRank(candidate);
  const currentStyleRank = componentGroupStyleDetailRank(current);
  if (styleRank !== currentStyleRank) return styleRank > currentStyleRank;
  const motifReady = candidate.assetMotifReady === true ? 1 : 0;
  const currentMotifReady = current.assetMotifReady === true ? 1 : 0;
  if (motifReady !== currentMotifReady) return motifReady > currentMotifReady;
  const applied = candidate.assetAppliedComponent === true ? 1 : 0;
  const currentApplied = current.assetAppliedComponent === true ? 1 : 0;
  if (applied !== currentApplied) return applied > currentApplied;
  const reuseRank = componentReuseReadinessRank(candidate);
  const currentReuseRank = componentReuseReadinessRank(current);
  if (reuseRank !== currentReuseRank) return reuseRank > currentReuseRank;
  const reuseScore = componentReuseReadinessScore(candidate);
  const currentReuseScore = componentReuseReadinessScore(current);
  if (reuseScore !== currentReuseScore) return reuseScore > currentReuseScore;
  if (structureFit !== currentStructureFit) return structureFit > currentStructureFit;
  if (score !== currentScore) return score > currentScore;
  const matchScore = clampNumber(candidate.assetMatchScore, 0, 1000, 0);
  const currentMatchScore = clampNumber(current.assetMatchScore, 0, 1000, 0);
  if (matchScore !== currentMatchScore) return matchScore > currentMatchScore;
  return safeText(candidate.id).localeCompare(safeText(current.id)) < 0;
}

function componentGroupStyleDetailRank(group = {}) {
  const children = Array.isArray(group?.childLayout?.children) ? group.childLayout.children : [];
  let rank = 0;
  for (const child of children) {
    if (!hasReusableTemplateChildStyleDetails(child?.style)) continue;
    rank += 1;
    if (child?.style?.gradient && typeof child.style.gradient === "object") rank += 3;
    if (child?.style?.shadow && typeof child.style.shadow === "object") rank += 2;
    if (safeText(child?.kind).toLowerCase() === "connector") rank += 1;
  }
  return Math.min(rank, 20);
}

function scoreComponentGroupStructureFit(image = {}, group = {}) {
  const target = summarizeTargetLayerStructure(image);
  if (!target || target.signalCount === 0) return { score: 0, reasons: [] };
  let score = 0;
  const reasons = [];
  const groupKind = normalizeComponentStructureKind(
    group?.structure?.kind || group?.structureSignature?.primaryKind || group?.primaryKind
  );
  const targetKinds = target.compatibleKinds;
  const hardMismatch = targetKinds.length > 0 && groupKind && !targetKinds.includes(groupKind);
  if (targetKinds.length > 0 && groupKind) {
    if (hardMismatch) {
      score -= 16;
      reasons.push(`native-group-kind-mismatch:${targetKinds.join("|")}!=${groupKind}`);
    } else {
      score += 12;
      reasons.push(`native-group-kind-compatible:${groupKind}`);
    }
  }
  score += countFitScore({
    expected: target.nodeCount,
    actual: semanticComponentGroupNodeCount(group),
    close: 8,
    compatible: 4,
    mismatch: -6,
    closeReason: "native-group-node-count-close",
    compatibleReason: "native-group-node-count-compatible",
    mismatchReason: "native-group-node-count-different",
    reasons
  });
  score += countFitScore({
    expected: target.connectorCount,
    actual: semanticComponentGroupConnectorCount(group),
    close: 9,
    compatible: 4,
    mismatch: -7,
    closeReason: "native-group-connector-count-close",
    compatibleReason: "native-group-connector-count-compatible",
    mismatchReason: "native-group-connector-count-different",
    reasons
  });
  const pictureCount = clampNumber(group.pictureCount, 0, 1000, 0);
  const shapeCount = clampNumber(group.shapeCount ?? group.childCount, 0, 1000, 0);
  if (target.prefersNativeShapes && pictureCount === 0) {
    score += 5;
    reasons.push("native-group-no-picture-close");
  } else if (target.prefersNativeShapes && pictureCount > Math.max(1, shapeCount * 0.35)) {
    score -= 8;
    reasons.push("native-group-picture-heavy");
  }
  return {
    score: Math.max(-36, Math.min(36, score)),
    reasons,
    hardMismatch,
    groupKind,
    targetKinds
  };
}

function summarizeTargetLayerStructure(image = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const nodeCount = Math.max(
    normalizeCount(layer.nodeCount),
    normalizeCount(understanding.nodeCount),
    normalizeCount(understanding.visualNodeCount),
    Array.isArray(understanding.nodes) ? understanding.nodes.length : 0,
    Array.isArray(understanding.visualNodes) ? understanding.visualNodes.length : 0
  );
  const connectorCount = Math.max(
    normalizeCount(layer.connectorCount),
    normalizeCount(understanding.connectorCount),
    normalizeCount(understanding.visualConnectorCount),
    Array.isArray(understanding.connectors) ? understanding.connectors.length : 0,
    Array.isArray(understanding.visualConnectors) ? understanding.visualConnectors.length : 0
  );
  const layerType = safeText(layer.layerType || "");
  const templateFamily = safeText(layer.templateFamily || understanding.templateFamily || "");
  const archetype = safeText(layer.archetype || understanding.archetype || "");
  const compatibleKinds = targetComponentStructureKinds({ templateFamily, layerType, archetype });
  const signalCount = [nodeCount, connectorCount, layerType, templateFamily, archetype]
    .filter((value) => typeof value === "number" ? value > 0 : !!value).length;
  return {
    nodeCount,
    connectorCount,
    signalCount,
    compatibleKinds,
    prefersNativeShapes: /diagram|chart|matrix|grid|table/.test(layerType)
      || /flow|hub|tree|swimlane|matrix|chart|cycle/.test(archetype)
  };
}

function countFitScore({
  expected,
  actual,
  close,
  compatible,
  mismatch,
  closeReason,
  compatibleReason,
  mismatchReason,
  reasons
}) {
  if (!Number.isFinite(expected) || expected <= 0 || !Number.isFinite(actual) || actual <= 0) return 0;
  const ratio = Math.max(expected, actual) / Math.max(1, Math.min(expected, actual));
  if (ratio <= 1.35) {
    reasons.push(closeReason);
    return close;
  }
  if (ratio <= 2.25) {
    reasons.push(compatibleReason);
    return compatible;
  }
  reasons.push(mismatchReason);
  return mismatch;
}

function componentReuseReadinessLevel(group = {}) {
  const level = safeText(group?.reuseReadiness?.level).toLowerCase();
  return ["high", "medium", "low", "avoid"].includes(level) ? level : "";
}

function componentReuseReadinessRank(group = {}) {
  const level = componentReuseReadinessLevel(group);
  if (level === "high") return 3;
  if (level === "medium") return 2;
  if (level === "low") return 1;
  return 0;
}

function componentReuseReadinessScore(group = {}) {
  return clampNumber(group?.reuseReadiness?.score, 0, 100, 0);
}

function shouldSkipLowReuseComponentGroup(group = {}) {
  return componentReuseReadinessLevel(group) === "avoid";
}

function semanticComponentGroupNodeCount(group = {}) {
  const structure = group?.structure || {};
  return Math.max(
    normalizeCount(structure.nodeCount),
    normalizeCount(structure.roles?.node),
    normalizeCount(group.nodeCount),
    clampNumber(group.shapeCount ?? group.childCount, 0, 1000, 0)
  );
}

function semanticComponentGroupConnectorCount(group = {}) {
  const structure = group?.structure || {};
  return Math.max(
    normalizeCount(structure.connectorCount),
    normalizeCount(structure.roles?.connector),
    normalizeCount(group.connectorCount)
  );
}

function targetComponentStructureKinds({ templateFamily = "", layerType = "", archetype = "" } = {}) {
  const signal = `${templateFamily} ${layerType} ${archetype}`.toLowerCase();
  const kinds = [];
  if (/matrix|grid|table|quadrant-grid/.test(signal)) kinds.push("matrix");
  if (/hub[- ]?spoke|radial|relationship|network/.test(signal)) kinds.push("hub-spoke");
  if (/timeline|roadmap|milestone|gantt/.test(signal)) kinds.push("timeline");
  if (/cycle|loop|ring/.test(signal)) kinds.push("cycle-loop");
  if (/layered|stack|pyramid|funnel/.test(signal)) kinds.push("layered-stack");
  if (/process|linear-flow|arrow-chain|workflow/.test(signal)) kinds.push("process-chain");
  if (/quadrant|four-quadrant/.test(signal)) kinds.push("quadrant");
  return kinds.filter((kind, index) => kinds.indexOf(kind) === index);
}

function normalizeComponentStructureKind(value) {
  const kind = safeText(value).toLowerCase();
  if (/^(?:matrix|grid|table|comparison-matrix|heatmap-matrix)$/.test(kind)) return "matrix";
  if (/^(?:hub-spoke|radial|relationship|network)$/.test(kind)) return "hub-spoke";
  if (/^(?:timeline|roadmap|milestone|gantt)$/.test(kind)) return "timeline";
  if (/^(?:cycle|cycle-loop|ring)$/.test(kind)) return "cycle-loop";
  if (/^(?:layered-stack|stack|pyramid|funnel)$/.test(kind)) return "layered-stack";
  if (/^(?:process|process-chain|flow|workflow)$/.test(kind)) return "process-chain";
  if (/^(?:quadrant|four-quadrant)$/.test(kind)) return "quadrant";
  return "";
}

function normalizeCount(value) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

module.exports = {
  componentGroupStyleDetailRank,
  componentReuseReadinessLevel,
  componentReuseReadinessRank,
  componentReuseReadinessScore,
  countFitScore,
  hasReusableTemplateChildStyleDetails,
  isBetterComponentGroupCandidate,
  normalizeComponentStructureKind,
  scoreComponentGroupStructureFit,
  semanticComponentGroupConnectorCount,
  semanticComponentGroupNodeCount,
  shouldSkipLowReuseComponentGroup,
  summarizeGenerationStructureSignature,
  summarizeTargetLayerStructure,
  targetComponentStructureKinds
};
