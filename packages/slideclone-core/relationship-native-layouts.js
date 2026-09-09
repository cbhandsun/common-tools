"use strict";
const { validBox, boxArea, median, containsBox } = require("./relationship-native-geometry");
const { measuredGenericNodeShape, measuredGenericConnectorShape, topologyNodeShape, topologyConnectorShape, fishboneNodeShape, fishboneSpineShape, fishboneBranchShape, flowNodeShape, flowConnectorShape, treeNodeShape, treeConnectorShape } = require("./relationship-native-shapes");
const { unresolvedCurvedBranchResult, hasUnresolvedCurvedBranchTopology, oneSidedBranchDirection, createBranchCardFlowShell, orderBranchTargets, validPixelImage, validSlideSize } = require("./relationship-branch-card-shell");
const { createVennOverlapShell, createConcentricCirclesShell, createQuadrantMatrixShell, createComparisonMatrixShell, createTimelineRoadmapShell, normalizeTimelineMilestones, validGridLines, isCompleteCellGrid, longestAxisAtom, lineAxis, isSafeConcentricLayerSequence } = require("./relationship-basic-shells");
const { createFunnelLensFlowShell, funnelLensNodes, isIgnorableFunnelLensFragment, isIgnorableFunnelLensLineArtifact, augmentFunnelLensAxisConnectors } = require("./relationship-funnel-lens-shell");
const { createHubSpokeShell, hubSpokeNodes, radialAngle } = require("./relationship-hub-spoke-shell");
const { createSwimlaneFlowShell, createLayeredStackShell, createCycleLoopShell, cycleLoopSegments, sameMeasuredParentRing, cycleSegmentAngles, cycleAngularCoverage, isCycleCompositeArtifact, intersectionBoxArea, layeredStackNodes, isSafeLayeredStack, swimlaneNodes, clusterSwimlaneNodes, isSafeSwimlaneLanes, isMeasuredInLaneConnector } = require("./relationship-layered-flow-shells");
const { createSankeyFlowShell, sankeyNodes, validSankeyBand, attachSankeyBand, nearestSankeyEndpointNode, sankeyFlowIsAcyclic } = require("./relationship-sankey-shell");
const { topologyNodes, augmentTopologyAxisConnectors, nearestTopologyNode, distancePointToBox, measuredTopologyConnector, isIgnorableTopologyLineFragment, isTopologyCompositeAggregate, topologyConnectorEndpoints, distancePointToSegment, pointInsideBox, isConnectedTopology, isSafeTopologyLayout, isIgnorableContainedFragment } = require("./relationship-topology-helpers");
const MAX_FLOW_NODES = 16;

function hasMeasuredGenericGraphEvidence(image = {}, atoms = [], understanding = {}) {
  if (!validBox(image.box)) return false;
  const nodes = topologyNodes(atoms, image.box);
  const connectors = Array.isArray(understanding.visualConnectors) ? understanding.visualConnectors : [];
  return nodes.length >= 3 && connectors.length >= 2;
}

function createMeasuredGenericGraphShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72 || !validBox(image.box)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const nodes = topologyNodes(atoms, image.box);
  if (nodes.length < 3 || nodes.length > 20) return null;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const connectors = Array.isArray(understanding.visualConnectors) ? understanding.visualConnectors : [];
  if (connectors.length < nodes.length - 1 || connectors.length > 32) return null;
  const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));
  const connectorAtoms = [];
  const edges = new Set();
  for (const connector of connectors) {
    if (!nodeById.has(connector?.fromAtomId) || !nodeById.has(connector?.toAtomId) || connector.fromAtomId === connector.toAtomId) return null;
    const edge = [connector.fromAtomId, connector.toAtomId].sort().join(":");
    if (edges.has(edge)) return null;
    const atom = atoms.find((candidate) => candidate?.id === connector.atomId && validBox(candidate.box));
    if (!atom || !["connector-line-candidate", "connector-arrow-candidate"].includes(atom.kind) || !measuredTopologyConnector(atom)) return null;
    edges.add(edge);
    connectorAtoms.push(atom);
    adjacency.get(connector.fromAtomId).add(connector.toAtomId);
    adjacency.get(connector.toAtomId).add(connector.fromAtomId);
  }
  if (!isConnectedTopology(nodes, adjacency)) return null;
  const handled = new Set([...nodes, ...connectorAtoms].map((atom) => atom.id));
  if (atoms.some((atom) => !handled.has(atom?.id)
    && !isIgnorableContainedFragment(atom, nodes, image.box)
    && !isIgnorableTopologyLineFragment(atom, connectorAtoms, image.box)
    && !isTopologyCompositeAggregate(atom, nodes, connectorAtoms, image.box))) return null;
  return {
    shapes: [
      ...connectorAtoms.map((atom, index) => measuredGenericConnectorShape(image, atom, index, understanding)),
      ...nodes.map((atom, index) => measuredGenericNodeShape(image, atom, index, understanding))
    ],
    handledAtomCount: handled.size,
    fullyObjectified: true,
    shellKind: "measured-generic-graph"
  };
}

function createTopologyDiagramShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72 || !validBox(image.box)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const nodes = topologyNodes(atoms, image.box);
  if (nodes.length < 3 || nodes.length > 12) return null;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const visualConnectors = Array.isArray(understanding.visualConnectors) ? understanding.visualConnectors : [];
  const measuredVisualConnectors = visualConnectors.filter((connector) => nodeById.has(connector?.fromAtomId) && nodeById.has(connector?.toAtomId));
  if (measuredVisualConnectors.length !== visualConnectors.length) return null;
  const connectors = augmentTopologyAxisConnectors(measuredVisualConnectors, atoms, nodes, image.box);
  if (connectors.length < nodes.length - 1 || connectors.length > 24) return null;

  const connectorAtoms = [];
  const edges = new Set();
  const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));
  for (const connector of connectors) {
    if (connector.fromAtomId === connector.toAtomId) return null;
    const edge = [connector.fromAtomId, connector.toAtomId].sort().join(":");
    if (edges.has(edge)) return null;
    const atom = atoms.find((candidate) => candidate?.id === connector.atomId && validBox(candidate.box));
    if (!atom || !["connector-line-candidate", "connector-arrow-candidate", "grid-line-candidate"].includes(atom.kind)) return null;
    if (!measuredTopologyConnector(atom)) return null;
    edges.add(edge);
    connectorAtoms.push(atom);
    adjacency.get(connector.fromAtomId).add(connector.toAtomId);
    adjacency.get(connector.toAtomId).add(connector.fromAtomId);
  }
  if (!isConnectedTopology(nodes, adjacency)) return null;
  if (!isSafeTopologyLayout(nodes, connectors, adjacency, image.box, understanding.structureSignature)) return null;

  const handledIds = new Set([...nodes, ...connectorAtoms].map((atom) => atom.id));
  if (atoms.some((atom) => !handledIds.has(atom?.id)
    && !isIgnorableContainedFragment(atom, nodes, image.box)
    && !isIgnorableTopologyLineFragment(atom, connectorAtoms, image.box)
    && !isTopologyCompositeAggregate(atom, nodes, connectorAtoms, image.box))) return null;
  return {
    shapes: [
      ...connectorAtoms.map((atom, index) => topologyConnectorShape(image, atom, index, understanding)),
      ...nodes.map((atom, index) => topologyNodeShape(image, atom, index, understanding))
    ],
    handledAtomCount: nodes.length + connectorAtoms.length,
    fullyObjectified: true,
    shellKind: "topology-diagram"
  };
}

function createFishboneShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.78) return null;
  const layerBox = validBox(image.box);
  if (!layerBox) return null;
  const nodes = dominantRectNodes(atoms, layerBox)
    .filter((atom) => atom?.source?.detector !== "dense-linked-node-visual-atom")
    .sort((left, right) => left.box.y - right.box.y || left.box.x - right.box.x);
  const spine = atoms.find((atom) => atom?.kind === "grid-line-candidate" && atom?.axis === "h" && validBox(atom.box) && atom.box.w >= layerBox.w * 0.38);
  const branches = atoms
    .filter((atom) => atom?.kind === "connector-line-candidate" && atom?.lineEndpoints?.from && atom?.lineEndpoints?.to && validBox(atom.box))
    .filter((atom) => atom.box.h >= layerBox.h * 0.12)
    .sort((left, right) => left.box.x - right.box.x || left.box.y - right.box.y);
  if (!isSafeFishbone(nodes, spine, branches, layerBox)) return null;
  const residuals = atoms.filter((atom) => atom?.residualCandidate === true);
  if (residuals.length > 0) return null;
  return {
    shapes: [
      fishboneSpineShape(image, spine, understanding),
      ...branches.map((atom, index) => fishboneBranchShape(image, atom, index, understanding)),
      ...nodes.map((atom, index) => fishboneNodeShape(image, atom, index, understanding))
    ],
    handledAtomCount: nodes.length + branches.length + 1,
    fullyObjectified: true,
    shellKind: "fishbone-cause-effect"
  };
}

function isSafeFishbone(nodes = [], spine = null, branches = [], layerBox = {}) {
  if (!spine || nodes.length < 4 || nodes.length > MAX_FLOW_NODES || branches.length < 4 || branches.length > 20) return false;
  const spineY = spine.box.y + spine.box.h / 2;
  const topNodes = nodes.filter((node) => node.box.y + node.box.h <= spineY);
  const bottomNodes = nodes.filter((node) => node.box.y >= spineY);
  if (topNodes.length === 0 || bottomNodes.length === 0) return false;
  return branches.every((branch) => {
    const from = branch.lineEndpoints.from;
    const to = branch.lineEndpoints.to;
    const nearestSpineDistance = Math.min(Math.abs(from.y - spineY), Math.abs(to.y - spineY));
    const verticalSpan = Math.abs(to.y - from.y);
    return nearestSpineDistance <= Math.max(10, spine.box.h * 1.8)
      && verticalSpan >= layerBox.h * 0.1
      && Math.abs(to.x - from.x) >= layerBox.w * 0.025;
  });
}

function createFlowCardChainShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72) return null;
  const layerBox = validBox(image.box);
  if (!layerBox) return null;
  const nodes = dominantFlowNodes(atoms, layerBox);
  if (!isSafeHorizontalFlow(nodes, layerBox, understanding)) return null;
  const residuals = atoms.filter((atom) => atom?.residualCandidate === true && validBox(atom.box));
  const bridges = matchFlowBridges(nodes, residuals);
  if (!bridges || residuals.some((atom) => !bridges.some((bridge) => bridge.atom === atom))) return null;
  const shapes = [
    ...nodes.map((atom, index) => flowNodeShape(image, atom, index, understanding)),
    ...nodes.slice(0, -1).map((atom, index) => flowConnectorShape(image, atom, nodes[index + 1], bridges[index]?.atom, index, understanding))
  ];
  return {
    shapes,
    handledAtomCount: nodes.length + residuals.length,
    fullyObjectified: true,
    shellKind: "flow-card-chain"
  };
}

function createTreeStructureShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72) return null;
  const layerBox = validBox(image.box);
  if (!layerBox) return null;
  const nodes = dominantRectNodes(atoms, layerBox).sort((left, right) => left.box.y - right.box.y || left.box.x - right.box.x);
  if (!isSafeTreeStructure(nodes, layerBox)) return null;
  const connectors = atoms
    .filter((atom) => ["grid-line-candidate", "connector-line-candidate", "connector-arrow-candidate"].includes(atom?.kind))
    .filter((atom) => validBox(atom.box))
    .filter((atom) => Math.max(atom.box.w, atom.box.h) >= Math.min(layerBox.w, layerBox.h) * 0.18)
    .slice(0, 24);
  if (connectors.length < 1) return null;
  const residuals = atoms.filter((atom) => atom?.residualCandidate === true && validBox(atom.box));
  if (residuals.length > 0) return null;
  return {
    shapes: [
      ...connectors.map((atom, index) => treeConnectorShape(image, atom, index, understanding)),
      ...nodes.map((atom, index) => treeNodeShape(image, atom, index, understanding))
    ],
    handledAtomCount: nodes.length + connectors.length,
    fullyObjectified: true,
    shellKind: "tree-structure"
  };
}

function dominantFlowNodes(atoms = [], layerBox = {}) {
  return dominantRectNodes(atoms, layerBox)
    .sort((left, right) => left.box.x - right.box.x)
    .slice(0, MAX_FLOW_NODES);
}

function dominantRectNodes(atoms = [], layerBox = {}) {
  const layerArea = boxArea(layerBox);
  const candidates = atoms
    .filter((atom) => atom?.kind === "native-rect-candidate" && validBox(atom.box))
    .filter((atom) => {
      const box = atom.box;
      const aspect = box.w / box.h;
      return boxArea(box) >= layerArea * 0.008
        && box.w >= 28
        && box.h >= 18
        && aspect >= 0.65
        && aspect <= 7;
    });
  return candidates
    .filter((atom) => !candidates.some((other) => other !== atom && containsBox(other.box, atom.box, 1) && boxArea(other.box) > boxArea(atom.box) * 1.5));
}

function isSafeTreeStructure(nodes = [], layerBox = {}) {
  if (nodes.length < 4 || nodes.length > MAX_FLOW_NODES) return false;
  const centers = nodes.map((node) => ({ x: node.box.x + node.box.w / 2, y: node.box.y + node.box.h / 2 }));
  const minY = Math.min(...centers.map((point) => point.y));
  const maxY = Math.max(...centers.map((point) => point.y));
  if (maxY - minY < layerBox.h * 0.2) return false;
  const topBand = centers.filter((point) => point.y <= minY + layerBox.h * 0.12);
  const lowerBand = centers.filter((point) => point.y >= maxY - layerBox.h * 0.12);
  return topBand.length >= 1 && topBand.length <= Math.ceil(nodes.length / 2) && lowerBand.length >= 2;
}

function isSafeHorizontalFlow(nodes = [], layerBox = {}, understanding = {}) {
  if (nodes.length < 3 || nodes.length > MAX_FLOW_NODES) return false;
  const expected = Number(understanding.structureSignature?.stepCount || 0);
  if (expected > 0 && expected !== nodes.length) return false;
  const heights = nodes.map((node) => node.box.h);
  const medianHeight = median(heights);
  const centers = nodes.map((node) => node.box.y + node.box.h / 2);
  const centerSpread = Math.max(...centers) - Math.min(...centers);
  if (centerSpread > Math.max(10, medianHeight * 0.42)) return false;
  if (nodes.some((node) => node.box.w > layerBox.w * 0.42 || node.box.h > layerBox.h * 0.5)) return false;
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const gap = nodes[index + 1].box.x - (nodes[index].box.x + nodes[index].box.w);
    if (gap < Math.max(5, medianHeight * 0.12) || gap > layerBox.w * 0.42) return false;
  }
  return true;
}

function matchFlowBridges(nodes = [], residuals = []) {
  const bridges = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const left = nodes[index].box;
    const right = nodes[index + 1].box;
    const centerY = ((left.y + left.h / 2) + (right.y + right.h / 2)) / 2;
    const gapLeft = left.x + left.w;
    const gapRight = right.x;
    const atom = residuals.find((candidate) => {
      const box = candidate.box;
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      return cx >= gapLeft - 4
        && cx <= gapRight + 4
        && Math.abs(cy - centerY) <= Math.max(left.h, right.h) * 0.45
        && box.w <= (gapRight - gapLeft) * 1.25
        && box.h <= Math.max(left.h, right.h) * 0.7;
    }) || null;
    bridges.push({ atom });
  }
  return bridges;
}

module.exports = { unresolvedCurvedBranchResult, hasUnresolvedCurvedBranchTopology, oneSidedBranchDirection, createBranchCardFlowShell, hasMeasuredGenericGraphEvidence, createMeasuredGenericGraphShell, createSankeyFlowShell, createVennOverlapShell, createConcentricCirclesShell, createQuadrantMatrixShell, createComparisonMatrixShell, createTimelineRoadmapShell, createHubSpokeShell, createTopologyDiagramShell, createFunnelLensFlowShell, funnelLensNodes, isIgnorableFunnelLensFragment, isIgnorableFunnelLensLineArtifact, augmentFunnelLensAxisConnectors, topologyNodes, augmentTopologyAxisConnectors, nearestTopologyNode, distancePointToBox, measuredTopologyConnector, isIgnorableTopologyLineFragment, isTopologyCompositeAggregate, topologyConnectorEndpoints, distancePointToSegment, pointInsideBox, isConnectedTopology, isSafeTopologyLayout, createSwimlaneFlowShell, createLayeredStackShell, createCycleLoopShell, cycleLoopSegments, sameMeasuredParentRing, cycleSegmentAngles, cycleAngularCoverage, isCycleCompositeArtifact, intersectionBoxArea, layeredStackNodes, isSafeLayeredStack, swimlaneNodes, clusterSwimlaneNodes, isSafeSwimlaneLanes, isMeasuredInLaneConnector, isIgnorableContainedFragment, hubSpokeNodes, orderBranchTargets, validPixelImage, validSlideSize, radialAngle, normalizeTimelineMilestones, validGridLines, isCompleteCellGrid, longestAxisAtom, lineAxis, isSafeConcentricLayerSequence, createFishboneShell, isSafeFishbone, createFlowCardChainShell, createTreeStructureShell, dominantFlowNodes, dominantRectNodes, isSafeTreeStructure, isSafeHorizontalFlow, matchFlowBridges, sankeyNodes, validSankeyBand, attachSankeyBand, nearestSankeyEndpointNode, sankeyFlowIsAcyclic };
