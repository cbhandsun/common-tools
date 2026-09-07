"use strict";
const { unresolvedCurvedBranchResult, hasUnresolvedCurvedBranchTopology, createBranchCardFlowShell, hasMeasuredGenericGraphEvidence, createMeasuredGenericGraphShell, createSankeyFlowShell, createVennOverlapShell, createConcentricCirclesShell, createQuadrantMatrixShell, createComparisonMatrixShell, createTimelineRoadmapShell, createHubSpokeShell, createTopologyDiagramShell, createFunnelLensFlowShell, topologyNodes, createSwimlaneFlowShell, createLayeredStackShell, createCycleLoopShell, cycleLoopSegments, layeredStackNodes, swimlaneNodes, hubSpokeNodes, createFishboneShell, createFlowCardChainShell, createTreeStructureShell, funnelLensNodes, isSafeTopologyLayout, cycleAngularCoverage, isSafeLayeredStack, clusterSwimlaneNodes, isSafeSwimlaneLanes, isSafeConcentricLayerSequence, isSafeFishbone, dominantFlowNodes, dominantRectNodes, isSafeTreeStructure, isSafeHorizontalFlow, matchFlowBridges, sankeyNodes, validSankeyBand, attachSankeyBand } = require("./relationship-native-layouts");
const { validBox } = require("./relationship-native-geometry");

function createRelationshipNativeShell(image = {}, atoms = [], layer = {}, understanding = {}, context = {}) {
  const archetype = String(understanding.archetype || "");
  const layerType = String(layer.layerType || "");
  if (layerType !== "diagram-zone" && !(layerType === "chart-zone" && archetype === "sankey-flow-chart")) return null;
  if (archetype === "flow-card-chain") return createFlowCardChainShell(image, atoms, understanding);
  if (archetype === "tree-structure") return createTreeStructureShell(image, atoms, understanding);
  if (archetype === "fishbone-cause-effect") return createFishboneShell(image, atoms, understanding);
  if (archetype === "concentric-circles") {
    return createConcentricCirclesShell(image, atoms, understanding) || {
      shapes: [],
      preserveWhole: true,
      shellKind: "concentric-circles",
      reason: "concentric circles require at least two validated, center-aligned native layers; partial rings are preserved instead of fragmented"
    };
  }
  if (archetype === "quadrant-matrix") {
    return createQuadrantMatrixShell(image, atoms, understanding) || {
      shapes: [],
      preserveWhole: true,
      shellKind: "quadrant-matrix",
      reason: "quadrant matrices require four validated panels and both measured axes; partial quadrant fragments are preserved"
    };
  }
  if (archetype === "comparison-matrix") {
    return createComparisonMatrixShell(image, atoms, understanding) || {
      shapes: [],
      preserveWhole: true,
      shellKind: "comparison-matrix",
      reason: "comparison matrices require complete measured boundaries, sampled cells, and editable text evidence; incomplete structures are preserved"
    };
  }
  if (archetype === "timeline-roadmap") {
    return createTimelineRoadmapShell(image, atoms, understanding) || {
      shapes: [],
      preserveWhole: true,
      shellKind: "timeline-roadmap",
      reason: "timelines require a validated continuous axis and at least three measured milestones; missing geometry is preserved rather than replaced with synthetic nodes"
    };
  }
  if (archetype === "hub-spoke") {
    const branchCardShell = createBranchCardFlowShell(image, atoms, understanding, context);
    if (branchCardShell) return branchCardShell;
    if (hasUnresolvedCurvedBranchTopology(image, atoms, understanding)) return unresolvedCurvedBranchResult();
    if (hubSpokeNodes(atoms, image.box).length < 5) return null;
    return createHubSpokeShell(image, atoms, understanding) || {
      shapes: [],
      preserveWhole: true,
      shellKind: "hub-spoke",
      reason: "hub-spoke diagrams require one verified N-1 degree center, degree-one endpoints, and measured connector atoms; ambiguous radial groups are preserved"
    };
  }
  if (archetype === "topology-diagram") {
    if (topologyNodes(atoms, image.box).length < 3) return null;
    return createTopologyDiagramShell(image, atoms, understanding) || {
      shapes: [],
      preserveWhole: true,
      shellKind: "topology-diagram",
      reason: "topology diagrams require a complete connected graph of measured native nodes and measured connector endpoints; incomplete, duplicated, or ambiguous networks are preserved"
    };
  }
  if (archetype === "funnel-lens-flow") {
    return createFunnelLensFlowShell(image, atoms, understanding) || {
      shapes: [],
      preserveWhole: true,
      protectWhole: true,
      shellKind: "funnel-lens-flow",
      reason: "funnel and magnifier flows require one validated focus unit, measured convergence connectors, and no unexplained decoration; complex focus artwork is preserved as a minimum visual unit"
    };
  }
  if (archetype === "swimlane-flow") {
    if (swimlaneNodes(atoms, image.box).length < 4) return null;
    return createSwimlaneFlowShell(image, atoms, understanding) || {
      shapes: [],
      preserveWhole: true,
      shellKind: "swimlane-flow",
      reason: "swimlane flows require complete measured row lanes, adjacent in-lane topology, and measured connectors; ambiguous or cross-lane structures are preserved"
    };
  }
  if (archetype === "layered-stack") {
    if (layeredStackNodes(atoms, image.box).length < 3) return null;
    return createLayeredStackShell(image, atoms, understanding) || {
      shapes: [],
      preserveWhole: true,
      shellKind: "layered-stack",
      reason: "layered stacks require three to eight measured, center-aligned layers with a consistent width progression; incomplete or irregular stacks are preserved"
    };
  }
  if (archetype === "cycle-loop") {
    if (cycleLoopSegments(atoms).length < 3) return null;
    return createCycleLoopShell(image, atoms, understanding) || {
      shapes: [],
      preserveWhole: true,
      shellKind: "cycle-loop",
      reason: "cycle loops require three to eight measured arc-arrow segments sharing one parent ring with sufficient angular coverage; incomplete loops are preserved"
    };
  }
  if (archetype === "dense-radial-line-art") {
    return {
      shapes: [],
      preserveWhole: true,
      protectWhole: true,
      shellKind: "dense-radial-line-art",
      reason: "dense radial line art is an intentional pictorial unit; generic node and connector fragments would create false editability"
    };
  }
  if (archetype === "venn-overlap") {
    return createVennOverlapShell(image, atoms, understanding) || {
      shapes: [],
      preserveWhole: true,
      shellKind: "venn-overlap",
      reason: "overlap pixels do not preserve enough independent ellipse geometry for a safe native replacement"
    };
  }
  if (archetype === "sankey-flow-chart") {
    return createSankeyFlowShell(image, atoms, understanding) || {
      shapes: [],
      preserveWhole: true,
      protectWhole: true,
      shellKind: "sankey-flow-chart",
      reason: "Sankey reconstruction requires measured vertical nodes and continuous weighted bands whose endpoints attach to those nodes; incomplete flow geometry remains a minimum visual crop"
    };
  }
  if (archetype === "generic-node-diagram" || archetype === "multi-cluster-diagram") {
    const branchCardShell = createBranchCardFlowShell(image, atoms, understanding, context);
    if (branchCardShell) return branchCardShell;
    if (hasUnresolvedCurvedBranchTopology(image, atoms, understanding)) return unresolvedCurvedBranchResult();
    const measuredShell = createMeasuredGenericGraphShell(image, atoms, understanding);
    if (measuredShell) return measuredShell;
    if (!hasMeasuredGenericGraphEvidence(image, atoms, understanding)) return null;
    return {
      shapes: [],
      preserveWhole: true,
      shellKind: "measured-generic-graph",
      reason: "generic relationship diagrams require a complete connected graph of measured nodes and measured connector endpoints; synthetic hub and nearest-neighbor links are not emitted"
    };
  }
  return null;
}

module.exports = {
  createRelationshipNativeShell,
  _private: { attachSankeyBand, clusterSwimlaneNodes, cycleAngularCoverage, cycleLoopSegments, dominantFlowNodes, dominantRectNodes, funnelLensNodes, isSafeConcentricLayerSequence, isSafeFishbone, isSafeHorizontalFlow, isSafeLayeredStack, isSafeSwimlaneLanes, isSafeTopologyLayout, isSafeTreeStructure, layeredStackNodes, matchFlowBridges, sankeyNodes, topologyNodes, validBox, validSankeyBand }
};
