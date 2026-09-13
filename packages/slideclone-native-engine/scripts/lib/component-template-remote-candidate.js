"use strict";

const {
  hasStructuredCycleEvidence,
  hasStructuredLayeredStackEvidence,
  hasStructuredMatrixEvidence,
  hasStructuredProcessEvidence,
  hasStructuredQuadrantEvidence,
  hasStructuredRelationshipEvidence
} = require("./component-template-family-evidence");
const { clampInteger, clampNumber } = require("./component-template-geometry");
const { layeredStackDefaultMotif } = require("./component-template-motifs");
const { safeText } = require("./component-template-sanitizers");

function syntheticRemoteComponentMatch(image = {}, family = "", minScore = 58, services = {}) {
  const strategy = image?.source?.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  const provider = safeText(candidate.sourceProvider || strategy.applicationPlan?.sourceProvider).toLowerCase();
  const kind = safeText(candidate.kind || strategy.applicationPlan?.componentKind).toLowerCase();
  if (strategy.mode !== "plugin-component-template") return null;
  if (!isSyntheticRemoteTemplateCandidate(provider, kind, candidate)) return null;
  const score = clampNumber(candidate.candidateScore ?? (Number(candidate.confidence) * 100), 0, 100, 0);
  const minFamilyScore = syntheticRemoteFamilyMinScore(family, minScore);
  if (score < minFamilyScore) return null;
  if (!hasSyntheticRemoteFamilyEvidence(image, family)) return null;
  const motifs = [
    ...(Array.isArray(candidate.targetMotifs) ? candidate.targetMotifs : []),
    ...(Array.isArray(candidate.structureSignature?.motifs) ? candidate.structureSignature.motifs : [])
  ].map((motif) => safeText(motif).toLowerCase()).filter(Boolean);
  if (family === "matrix" && !hasActionableRemoteMatrixEvidence(candidate, motifs)) return null;
  if (family === "quadrant" && motifs.length === 0) motifs.push("quadrant");
  if (family === "layered-stack" && motifs.length === 0) motifs.push(layeredStackDefaultMotif(image));
  const itemCount = syntheticRemoteItemCount(image, family, {
    itemCount: null,
    childCount: null,
    id: candidate.id,
    name: candidate.title
  }, services);
  return {
    id: safeText(candidate.id || `remote-${provider}-${family}`),
    name: safeText(candidate.title || `${provider} ${family} candidate`),
    score,
    itemCount,
    childCount: itemCount,
    shapeCount: syntheticRemoteShapeCount(family, itemCount),
    connectorCount: syntheticRemoteConnectorCount(family, itemCount),
    pictureCount: 0,
    assetProvider: provider,
    assetName: `remote-${provider}-candidate`,
    assetPath: "",
    templateFamily: family,
    targetMotifs: motifs,
    structureSignature: {
      primaryKind: safeText(candidate.structureSignature?.primaryKind || syntheticRemotePrimaryKind(family)),
      motifs
    },
    assetMotifReady: syntheticRemoteMotifReady(family, motifs),
    remoteCandidateOnly: true
  };
}

function hasActionableRemoteMatrixEvidence(candidate = {}, motifs = []) {
  if (safeText(candidate.suitability?.tier).toLowerCase() === "strong") return true;
  if (safeText(candidate.structureSignature?.primaryKind)) return true;
  return (Array.isArray(motifs) ? motifs : [])
    .some((motif) => /^(card-grid|matrix|grid|table|2x2-matrix|quadrant)$/.test(safeText(motif).toLowerCase()));
}

function syntheticRemoteFamilyMinScore(family = "", minScore = 58) {
  if (family === "cycle-loop") return Math.max(48, minScore);
  if (family === "hub-spoke") return Math.max(48, Math.min(minScore, 54));
  if (family === "process-chain") return Math.max(50, Math.min(minScore, 54));
  if (family === "quadrant") return Math.max(48, Math.min(minScore, 54));
  if (family === "matrix") return Math.max(50, Math.min(minScore, 54));
  if (family === "layered-stack") return Math.max(48, Math.min(minScore, 54));
  return Math.max(52, minScore);
}

function hasSyntheticRemoteFamilyEvidence(image = {}, family = "") {
  if (family === "cycle-loop") return hasStructuredCycleEvidence(image);
  if (family === "hub-spoke") return hasStructuredRelationshipEvidence(image);
  if (family === "process-chain") return hasStructuredProcessEvidence(image);
  if (family === "quadrant") return hasStructuredQuadrantEvidence(image);
  if (family === "matrix") return hasStructuredMatrixEvidence(image);
  if (family === "layered-stack") return hasStructuredLayeredStackEvidence(image);
  return false;
}

function syntheticRemoteItemCount(image = {}, family = "", fallback = {}, services = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  if (family === "cycle-loop" && typeof services.countCycleLoopItems === "function") {
    return services.countCycleLoopItems(image, fallback);
  }
  if (family === "process-chain") {
    return clampInteger(understanding.nodeCount || fallback.childCount || fallback.itemCount || 4, 3, 6);
  }
  if (family === "hub-spoke") {
    return clampInteger(understanding.connectorCount || understanding.nodeCount || fallback.childCount || fallback.itemCount || 6, 4, 8);
  }
  if (family === "quadrant") return 4;
  if (family === "matrix") {
    const grid = understanding.visualGrid || {};
    const cellCount = clampNumber(grid.cellCount, 0, 64, 0);
    return clampInteger(cellCount || understanding.nodeCount || understanding.visualAtomCount || fallback.childCount || 9, 4, 16);
  }
  if (family === "layered-stack") {
    return clampInteger(understanding.visualNodeCount || understanding.nodeCount || fallback.childCount || fallback.itemCount || 4, 3, 8);
  }
  return clampInteger(fallback.childCount || fallback.itemCount || 4, 3, 8);
}

function syntheticRemoteShapeCount(family = "", itemCount = 4) {
  if (family === "cycle-loop") return itemCount * 2 + 1;
  if (family === "hub-spoke") return itemCount * 2 + 1;
  if (family === "process-chain") return itemCount * 2 - 1;
  if (family === "quadrant") return 6;
  if (family === "matrix") return itemCount;
  if (family === "layered-stack") return itemCount;
  return itemCount;
}

function syntheticRemoteConnectorCount(family = "", itemCount = 4) {
  if (family === "cycle-loop") return itemCount;
  if (family === "hub-spoke") return itemCount;
  if (family === "process-chain") return Math.max(0, itemCount - 1);
  return 0;
}

function syntheticRemotePrimaryKind(family = "") {
  if (family === "matrix") return "matrix";
  if (family === "hub-spoke") return "hub-spoke";
  if (family === "process-chain") return "process-chain";
  if (family === "quadrant") return "quadrant";
  if (family === "cycle-loop") return "cycle-loop";
  if (family === "layered-stack") return "layered-stack";
  return safeText(family);
}

function syntheticRemoteMotifReady(family = "", motifs = []) {
  if (family === "cycle-loop") return motifs.includes("arc-arrow") || motifs.includes("ring-node");
  if (family === "hub-spoke") return motifs.includes("radial-link") || motifs.includes("tree-link") || motifs.includes("org-hierarchy") || motifs.includes("ring-node");
  if (family === "process-chain") return motifs.includes("linear-arrow-chain") || motifs.includes("whole-process-template") || motifs.includes("lens-funnel-flow") || motifs.includes("branch-card-flow");
  if (family === "quadrant") return motifs.includes("quadrant") || motifs.includes("2x2-matrix");
  if (family === "matrix") return motifs.includes("card-grid");
  if (family === "layered-stack") return motifs.includes("layered-stack") || motifs.includes("funnel") || motifs.includes("pyramid");
  return motifs.length > 0;
}

function isSyntheticRemoteTemplateCandidate(provider = "", kind = "", candidate = {}) {
  if (provider === "officeplus" && kind === "component") return true;
  const tags = Array.isArray(candidate.roleTags) ? candidate.roleTags.map((tag) => safeText(tag).toLowerCase()) : [];
  const primaryKind = safeText(candidate.structureSignature?.primaryKind).toLowerCase();
  return provider === "islide"
    && /presentation-template|component|vector-component|smartdiagram|diagram/.test(kind)
    && (tags.includes("applied-component") || tags.includes("editable") || /cycle-loop|process-chain|matrix|quadrant|hub-spoke|layered-stack|funnel|pyramid/.test(primaryKind));
}

module.exports = {
  hasActionableRemoteMatrixEvidence,
  hasSyntheticRemoteFamilyEvidence,
  isSyntheticRemoteTemplateCandidate,
  syntheticRemoteComponentMatch,
  syntheticRemoteConnectorCount,
  syntheticRemoteFamilyMinScore,
  syntheticRemoteItemCount,
  syntheticRemoteMotifReady,
  syntheticRemotePrimaryKind,
  syntheticRemoteShapeCount
};
