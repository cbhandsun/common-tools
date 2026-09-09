"use strict";
const { validBox, boxCenter, boxArea, intersectionArea, median, safeColor, containsBox, spread, normalizeDegrees } = require("./relationship-native-geometry");
const { measuredGenericNodeShape, measuredGenericConnectorShape, topologyNodeShape, topologyConnectorShape, funnelLensNodeShape, funnelLensConnectorShape, funnelLensFocusShapes, swimlaneNodeShape, swimlaneConnectorShape, layeredStackShape, cycleLoopSegmentShapes, fishboneNodeShape, fishboneSpineShape, fishboneBranchShape, flowNodeShape, flowConnectorShape, treeNodeShape, treeConnectorShape } = require("./relationship-native-shapes");
const { unresolvedCurvedBranchResult, hasUnresolvedCurvedBranchTopology, oneSidedBranchDirection, createBranchCardFlowShell, orderBranchTargets, validPixelImage, validSlideSize } = require("./relationship-branch-card-shell");
const { createVennOverlapShell, createConcentricCirclesShell, createQuadrantMatrixShell, createComparisonMatrixShell, createTimelineRoadmapShell, normalizeTimelineMilestones, validGridLines, isCompleteCellGrid, longestAxisAtom, lineAxis, isSafeConcentricLayerSequence } = require("./relationship-basic-shells");
const { createHubSpokeShell, hubSpokeNodes, radialAngle } = require("./relationship-hub-spoke-shell");
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

function createFunnelLensFlowShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72 || !validBox(image.box)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const focusCandidates = atoms
    .filter((atom) => ["native-search-candidate", "native-funnel-candidate", "native-donut-candidate"].includes(atom?.kind) && validBox(atom.box))
    .sort((left, right) => boxArea(right.box) - boxArea(left.box));
  if (focusCandidates.length !== 1) return null;
  const focus = focusCandidates[0];
  const nodes = funnelLensNodes(atoms, image.box, focus);
  const externalNodes = nodes.filter((node) => !containsBox(focus.box, node.box, 1));
  const internalNodes = nodes.filter((node) => containsBox(focus.box, node.box, 1));
  if (externalNodes.length < 2 || externalNodes.length > 6 || internalNodes.length > 4) return null;

  const focusCenter = boxCenter(focus.box);
  const leftNodes = externalNodes.filter((node) => boxCenter(node.box).x < focusCenter.x - focus.box.w * 0.18);
  const rightNodes = externalNodes.filter((node) => boxCenter(node.box).x > focusCenter.x + focus.box.w * 0.18);
  if (Math.max(leftNodes.length, rightNodes.length) < 2 || (leftNodes.length > 0 && rightNodes.length > 0)) return null;
  const inputNodes = leftNodes.length ? leftNodes : rightNodes;
  if (spread(inputNodes.map((node) => boxCenter(node.box).y)) < Math.max(16, image.box.h * 0.12)) return null;

  const visualConnectors = Array.isArray(understanding.visualConnectors) ? understanding.visualConnectors : [];
  const connectors = augmentFunnelLensAxisConnectors(visualConnectors, atoms, inputNodes, focus, image.box);
  if (connectors.length !== inputNodes.length) return null;
  const connectorAtoms = [];
  const connectedInputs = new Set();
  const usedConnectorIds = new Set();
  for (const connector of connectors) {
    const endpointIds = new Set([connector?.fromAtomId, connector?.toAtomId]);
    if (!endpointIds.has(focus.id)) return null;
    const input = inputNodes.find((node) => endpointIds.has(node.id));
    if (!input || connectedInputs.has(input.id) || usedConnectorIds.has(connector.atomId)) return null;
    const connectorAtom = atoms.find((atom) => atom?.id === connector.atomId && validBox(atom.box));
    if (!connectorAtom || !["connector-line-candidate", "connector-arrow-candidate", "grid-line-candidate"].includes(connectorAtom.kind)) return null;
    if (!measuredTopologyConnector(connectorAtom)) return null;
    connectedInputs.add(input.id);
    usedConnectorIds.add(connector.atomId);
    connectorAtoms.push(connectorAtom);
  }
  if (connectedInputs.size !== inputNodes.length) return null;

  const handled = new Set([focus.id, ...nodes.map((node) => node.id), ...connectorAtoms.map((atom) => atom.id)]);
  if (atoms.some((atom) => !handled.has(atom?.id)
    && !isIgnorableFunnelLensFragment(atom, focus, nodes, image.box)
    && !isIgnorableFunnelLensLineArtifact(atom, focus, inputNodes, connectorAtoms, image.box))) return null;
  return {
    shapes: [
      ...connectorAtoms.map((atom, index) => funnelLensConnectorShape(image, atom, index, understanding)),
      ...inputNodes.map((atom, index) => funnelLensNodeShape(image, atom, index, "input", understanding)),
      ...funnelLensFocusShapes(image, focus, understanding),
      ...internalNodes.map((atom, index) => funnelLensNodeShape(image, atom, index, "focus-content", understanding))
    ],
    handledAtomCount: handled.size,
    fullyObjectified: true,
    shellKind: "funnel-lens-flow"
  };
}

function funnelLensNodes(atoms = [], layerBox = {}, focus = {}) {
  const allowed = new Set([
    "native-rect-candidate", "native-ellipse-candidate", "native-diamond-candidate",
    "native-chevron-candidate", "native-parallelogram-candidate", "native-document-candidate"
  ]);
  const layerArea = Math.max(1, boxArea(layerBox));
  const candidates = atoms
    .filter((atom) => atom?.id !== focus.id && allowed.has(atom?.kind) && validBox(atom.box))
    .filter((atom) => !(containsBox(focus.box, atom.box, 1)
      && safeColor(atom.color, "") === safeColor(focus.color, "")
      && boxArea(atom.box) <= boxArea(focus.box) * 0.18))
    .filter((atom) => {
      const areaRatio = boxArea(atom.box) / layerArea;
      const focusContent = containsBox(focus.box, atom.box, 1);
      return atom.box.w >= 14
        && atom.box.h >= 8
        && areaRatio >= (focusContent ? 0.001 : 0.004)
        && areaRatio <= 0.2;
    })
    .sort((left, right) => boxArea(right.box) - boxArea(left.box));
  const nodes = [];
  for (const candidate of candidates) {
    if (nodes.some((node) => {
      const overlap = intersectionArea(node.box, candidate.box) / Math.max(1, Math.min(boxArea(node.box), boxArea(candidate.box)));
      return overlap >= 0.9
        || (containsBox(node.box, candidate.box, 1) && boxArea(candidate.box) <= boxArea(node.box) * 0.55);
    })) continue;
    nodes.push(candidate);
  }
  return nodes.slice(0, 10);
}

function isIgnorableFunnelLensFragment(atom = {}, focus = {}, nodes = [], layerBox = {}) {
  if (!validBox(atom.box) || atom.residualCandidate === true) return false;
  const containers = [focus, ...nodes].filter((node) => validBox(node?.box));
  return containers.some((container) => {
    const sameColor = safeColor(atom.color, "") === safeColor(container.color, "");
    const overlap = intersectionArea(container.box, atom.box) / Math.max(1, Math.min(boxArea(container.box), boxArea(atom.box)));
    return (overlap >= 0.9 && sameColor)
      || (containsBox(container.box, atom.box, 2)
        && boxArea(atom.box) <= boxArea(container.box) * 0.55
        && (sameColor || boxArea(atom.box) <= boxArea(layerBox) * 0.003));
  });
}

function isIgnorableFunnelLensLineArtifact(atom = {}, focus = {}, inputNodes = [], connectorAtoms = [], layerBox = {}) {
  if (!["grid-line-candidate", "connector-line-candidate"].includes(atom?.kind) || !validBox(atom.box)) return false;
  if (Number(atom.box.h || 0) > Number(layerBox.h || 0) * 0.06 && Number(atom.box.w || 0) > Number(layerBox.w || 0) * 0.06) return false;
  if (connectorAtoms.some((connector) => containsBox(atom.box, connector.box, 4) || containsBox(connector.box, atom.box, 4))) return true;
  const touchesFocus = distancePointToBox(topologyConnectorEndpoints(atom)?.to || boxCenter(atom.box), focus.box) <= 18
    || distancePointToBox(topologyConnectorEndpoints(atom)?.from || boxCenter(atom.box), focus.box) <= 18;
  const overlapsInput = inputNodes.some((node) => intersectionArea(atom.box, node.box) >= Math.min(boxArea(atom.box), boxArea(node.box)) * 0.2);
  return touchesFocus && overlapsInput;
}

function augmentFunnelLensAxisConnectors(connectors = [], atoms = [], inputNodes = [], focus = {}, layerBox = {}) {
  const validNodeIds = new Set([focus.id, ...inputNodes.map((node) => node.id)]);
  const result = connectors.filter((connector) => validNodeIds.has(connector?.fromAtomId) && validNodeIds.has(connector?.toAtomId));
  const usedAtoms = new Set(result.map((connector) => connector.atomId));
  const connectedInputs = new Set(result.flatMap((connector) => [connector.fromAtomId, connector.toAtomId]).filter((id) => id !== focus.id));
  for (const atom of atoms) {
    if (!["grid-line-candidate", "connector-line-candidate", "connector-arrow-candidate"].includes(atom?.kind)
      || usedAtoms.has(atom.id)
      || !validBox(atom.box)) continue;
    if (Math.max(atom.box.w, atom.box.h) < Math.min(layerBox.w, layerBox.h) * 0.12) continue;
    const endpoints = topologyConnectorEndpoints(atom);
    if (!endpoints) continue;
    const input = inputNodes
      .filter((node) => !connectedInputs.has(node.id))
      .map((node) => ({
        node,
        distance: Math.min(distancePointToBox(endpoints.from, node.box), distancePointToBox(endpoints.to, node.box))
      }))
      .sort((left, right) => left.distance - right.distance)[0];
    if (!input || input.distance > Math.max(22, Math.min(input.node.box.w, input.node.box.h) * 0.9)) continue;
    const focusDistance = Math.min(distancePointToBox(endpoints.from, focus.box), distancePointToBox(endpoints.to, focus.box));
    if (focusDistance > Math.max(24, Math.min(focus.box.w, focus.box.h) * 0.28)) continue;
    result.push({
      atomId: atom.id,
      fromAtomId: input.node.id,
      toAtomId: focus.id,
      axis: atom.box.w >= atom.box.h ? "horizontal" : "diagonal",
      arrow: atom.kind === "connector-arrow-candidate",
      inferredFromMeasuredGeometry: true
    });
    usedAtoms.add(atom.id);
    connectedInputs.add(input.node.id);
  }
  return result;
}

function createSwimlaneFlowShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72 || !validBox(image.box)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const nodes = swimlaneNodes(atoms, image.box);
  const lanes = clusterSwimlaneNodes(nodes, image.box);
  if (!isSafeSwimlaneLanes(lanes, nodes, image.box)) return null;

  const nodePosition = new Map();
  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
    lanes[laneIndex].forEach((node, laneColumn) => nodePosition.set(node.id, { laneIndex, laneColumn }));
  }

  const allConnectors = Array.isArray(understanding.visualConnectors) ? understanding.visualConnectors : [];
  const connectors = allConnectors.filter((connector) => nodePosition.has(connector?.fromAtomId) && nodePosition.has(connector?.toAtomId));
  const expectedConnectorCount = nodes.length - lanes.length;
  if (connectors.length !== expectedConnectorCount || allConnectors.length !== connectors.length) return null;

  const connectorAtoms = [];
  const coveredEdges = new Set();
  for (const connector of connectors) {
    const from = nodePosition.get(connector.fromAtomId);
    const to = nodePosition.get(connector.toAtomId);
    if (!from || !to || connector.axis !== "horizontal" || from.laneIndex !== to.laneIndex) return null;
    if (Math.abs(from.laneColumn - to.laneColumn) !== 1) return null;
    const edgeKey = `${from.laneIndex}:${Math.min(from.laneColumn, to.laneColumn)}`;
    if (coveredEdges.has(edgeKey)) return null;
    const atom = atoms.find((candidate) => candidate?.id === connector.atomId && validBox(candidate.box));
    if (!atom || !["connector-line-candidate", "connector-arrow-candidate"].includes(atom.kind)) return null;
    if (!isMeasuredInLaneConnector(atom, lanes[from.laneIndex][from.laneColumn], lanes[to.laneIndex][to.laneColumn])) return null;
    coveredEdges.add(edgeKey);
    connectorAtoms.push(atom);
  }
  if (coveredEdges.size !== expectedConnectorCount) return null;

  const handledIds = new Set([...nodes, ...connectorAtoms].map((atom) => atom.id));
  if (atoms.some((atom) => !handledIds.has(atom?.id) && !isIgnorableContainedFragment(atom, nodes, image.box))) return null;

  return {
    shapes: [
      ...connectorAtoms.map((atom, index) => swimlaneConnectorShape(image, atom, index, understanding)),
      ...lanes.flatMap((lane, laneIndex) => lane.map((atom, laneColumn) => swimlaneNodeShape(image, atom, laneIndex, laneColumn, understanding)))
    ],
    handledAtomCount: nodes.length + connectorAtoms.length,
    fullyObjectified: true,
    shellKind: "swimlane-flow"
  };
}

function createLayeredStackShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72 || !validBox(image.box)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const layers = layeredStackNodes(atoms, image.box)
    .sort((left, right) => left.box.y - right.box.y || left.box.x - right.box.x);
  if (!isSafeLayeredStack(layers, image.box, understanding.structureSignature)) return null;
  const handledIds = new Set(layers.map((atom) => atom.id));
  if (atoms.some((atom) => !handledIds.has(atom?.id) && !isIgnorableContainedFragment(atom, layers, image.box))) return null;
  return {
    shapes: layers.map((atom, index) => layeredStackShape(image, atom, index, understanding)),
    handledAtomCount: layers.length,
    fullyObjectified: true,
    shellKind: "layered-stack"
  };
}

function createCycleLoopShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72 || !validBox(image.box)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const segments = cycleLoopSegments(atoms);
  if (segments.length < 3 || segments.length > 8) return null;
  const parentBox = validBox(segments[0].donutParentBox);
  if (!parentBox || parentBox.w / parentBox.h < 0.72 || parentBox.w / parentBox.h > 1.38) return null;
  if (Math.min(parentBox.w, parentBox.h) < 54) return null;
  if (segments.some((segment) => !sameMeasuredParentRing(parentBox, segment.donutParentBox))) return null;
  const angles = segments.map(cycleSegmentAngles);
  if (angles.some((angle) => !angle)) return null;
  const coverage = cycleAngularCoverage(angles);
  const totalSweep = angles.reduce((sum, angle) => sum + angle.sweep, 0);
  if (coverage < 235 || totalSweep > 560 || coverage / Math.max(1, totalSweep) < 0.52) return null;

  const handledIds = new Set(segments.map((atom) => atom.id));
  if (atoms.some((atom) => !handledIds.has(atom?.id) && !isCycleCompositeArtifact(atom, parentBox))) return null;
  const ordered = segments
    .map((atom) => ({ atom, angle: cycleSegmentAngles(atom) }))
    .sort((left, right) => left.angle.startDeg - right.angle.startDeg);
  return {
    shapes: ordered.flatMap(({ atom, angle }, index) => cycleLoopSegmentShapes(image, atom, angle, index, understanding)),
    handledAtomCount: segments.length,
    fullyObjectified: true,
    shellKind: "cycle-loop"
  };
}

function cycleLoopSegments(atoms = []) {
  return atoms.filter((atom) => atom?.kind === "native-arc-arrow-segment-candidate"
    && validBox(atom.box)
    && validBox(atom.donutParentBox));
}

function sameMeasuredParentRing(expected = {}, value = {}) {
  const actual = validBox(value);
  if (!actual) return false;
  const tolerance = Math.max(3, Math.max(expected.w, expected.h) * 0.035);
  return Math.abs(actual.x - expected.x) <= tolerance
    && Math.abs(actual.y - expected.y) <= tolerance
    && Math.abs(actual.w - expected.w) <= tolerance
    && Math.abs(actual.h - expected.h) <= tolerance;
}

function cycleSegmentAngles(atom = {}) {
  const startDeg = normalizeDegrees(atom.donutSegmentAngles?.startDeg);
  const endDeg = normalizeDegrees(atom.donutSegmentAngles?.endDeg);
  if (startDeg === null || endDeg === null) return null;
  const sweep = (endDeg - startDeg + 360) % 360;
  if (sweep < 18 || sweep > 178) return null;
  return { startDeg, endDeg, sweep };
}

function cycleAngularCoverage(angles = []) {
  const covered = new Uint8Array(360);
  for (const angle of angles) {
    const steps = Math.max(1, Math.ceil(angle.sweep));
    for (let offset = 0; offset < steps; offset += 1) covered[Math.floor((angle.startDeg + offset) % 360)] = 1;
  }
  return covered.reduce((sum, value) => sum + value, 0);
}

function isCycleCompositeArtifact(atom = {}, parentBox = {}) {
  if (!validBox(atom.box) || atom.residualCandidate === true) return false;
  const atomArea = boxArea(atom.box);
  const overlap = intersectionBoxArea(atom.box, parentBox) / Math.max(1, atomArea);
  if (overlap < 0.82) return false;
  if (["connector-line-candidate", "connector-arrow-candidate", "grid-line-candidate"].includes(atom.kind)) return true;
  if (atom.kind !== "native-triangle-candidate" || atomArea > boxArea(parentBox) * 0.12) return false;
  const center = boxCenter(atom.box);
  const parentCenter = boxCenter(parentBox);
  const radius = Math.max(parentBox.w, parentBox.h) / 2;
  return Math.hypot(center.x - parentCenter.x, center.y - parentCenter.y) >= radius * 0.48;
}

function intersectionBoxArea(first = {}, second = {}) {
  const left = Math.max(Number(first.x || 0), Number(second.x || 0));
  const top = Math.max(Number(first.y || 0), Number(second.y || 0));
  const right = Math.min(Number(first.x || 0) + Number(first.w || 0), Number(second.x || 0) + Number(second.w || 0));
  const bottom = Math.min(Number(first.y || 0) + Number(first.h || 0), Number(second.y || 0) + Number(second.h || 0));
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function layeredStackNodes(atoms = [], layerBox = {}) {
  const layerArea = boxArea(layerBox);
  const candidates = atoms
    .filter((atom) => ["native-rect-candidate", "native-funnel-candidate"].includes(atom?.kind) && validBox(atom.box))
    .filter((atom) => {
      const aspect = atom.box.w / atom.box.h;
      return boxArea(atom.box) >= layerArea * 0.008
        && atom.box.w >= 28
        && atom.box.h >= 18
        && aspect >= 0.45
        && aspect <= 9;
    });
  return candidates.filter((atom) => !candidates.some((other) => other !== atom
    && containsBox(other.box, atom.box, 1)
    && boxArea(other.box) > boxArea(atom.box) * 1.5));
}

function isSafeLayeredStack(layers = [], layerBox = {}, signature = {}) {
  if (layers.length < 3 || layers.length > 8) return false;
  const centers = layers.map((layer) => boxCenter(layer.box).x);
  const centerSpread = Math.max(...centers) - Math.min(...centers);
  if (centerSpread > Math.max(9, Number(layerBox.w || 0) * 0.045)) return false;
  const heights = layers.map((layer) => layer.box.h);
  const medianHeight = median(heights);
  if (layers.some((layer) => layer.box.h < medianHeight * 0.48 || layer.box.h > medianHeight * 2.1)) return false;
  for (let index = 0; index < layers.length - 1; index += 1) {
    const gap = layers[index + 1].box.y - (layers[index].box.y + layers[index].box.h);
    if (gap < -2 || gap > Math.max(medianHeight * 1.25, Number(layerBox.h || 0) * 0.2)) return false;
  }
  const widths = layers.map((layer) => layer.box.w);
  const tolerance = Math.max(4, median(widths) * 0.04);
  const nondecreasing = widths.every((width, index) => index === 0 || width >= widths[index - 1] - tolerance);
  const nonincreasing = widths.every((width, index) => index === 0 || width <= widths[index - 1] + tolerance);
  if (!nondecreasing && !nonincreasing) return false;
  const direction = String(signature?.direction || "");
  if (direction === "pyramid-down" && !nondecreasing) return false;
  if (direction === "funnel-down" && !nonincreasing) return false;
  return Math.max(...widths) - Math.min(...widths) >= Math.max(10, Number(layerBox.w || 0) * 0.08)
    || widths.every((width) => Math.abs(width - median(widths)) <= tolerance);
}

function swimlaneNodes(atoms = [], layerBox = {}) {
  return dominantRectNodes(atoms, layerBox).slice(0, MAX_FLOW_NODES);
}

function clusterSwimlaneNodes(nodes = [], layerBox = {}) {
  if (nodes.length === 0) return [];
  const tolerance = Math.max(12, median(nodes.map((node) => node.box.h)) * 0.62, Number(layerBox.h || 0) * 0.045);
  const lanes = [];
  for (const node of [...nodes].sort((left, right) => boxCenter(left.box).y - boxCenter(right.box).y || left.box.x - right.box.x)) {
    const centerY = boxCenter(node.box).y;
    const lane = lanes.find((candidate) => Math.abs(candidate.centerY - centerY) <= tolerance);
    if (lane) {
      lane.nodes.push(node);
      lane.centerY = lane.nodes.reduce((sum, item) => sum + boxCenter(item.box).y, 0) / lane.nodes.length;
    } else {
      lanes.push({ centerY, nodes: [node] });
    }
  }
  return lanes.sort((left, right) => left.centerY - right.centerY)
    .map((lane) => lane.nodes.sort((left, right) => left.box.x - right.box.x));
}

function isSafeSwimlaneLanes(lanes = [], nodes = [], layerBox = {}) {
  if (lanes.length < 2 || lanes.length > 5 || nodes.length < 4 || nodes.length > MAX_FLOW_NODES) return false;
  if (lanes.some((lane) => lane.length < 2 || lane.length > 8)) return false;
  const medianHeight = median(nodes.map((node) => node.box.h));
  const laneCenters = lanes.map((lane) => median(lane.map((node) => boxCenter(node.box).y)));
  for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
    const lane = lanes[laneIndex];
    const centerSpread = Math.max(...lane.map((node) => boxCenter(node.box).y)) - Math.min(...lane.map((node) => boxCenter(node.box).y));
    if (centerSpread > Math.max(10, medianHeight * 0.42)) return false;
    const horizontalSpan = lane[lane.length - 1].box.x + lane[lane.length - 1].box.w - lane[0].box.x;
    if (horizontalSpan < Number(layerBox.w || 0) * 0.28) return false;
    for (let column = 0; column < lane.length - 1; column += 1) {
      const gap = lane[column + 1].box.x - (lane[column].box.x + lane[column].box.w);
      if (gap < Math.max(4, medianHeight * 0.08) || gap > Number(layerBox.w || 0) * 0.48) return false;
    }
    if (laneIndex > 0 && laneCenters[laneIndex] - laneCenters[laneIndex - 1] < Math.max(medianHeight * 1.35, Number(layerBox.h || 0) * 0.16)) return false;
  }
  return true;
}

function isMeasuredInLaneConnector(atom = {}, firstNode = {}, secondNode = {}) {
  const box = atom.box;
  if (!validBox(box) || box.w < box.h * 4) return false;
  const left = firstNode.box.x <= secondNode.box.x ? firstNode.box : secondNode.box;
  const right = firstNode.box.x <= secondNode.box.x ? secondNode.box : firstNode.box;
  const gapLeft = left.x + left.w;
  const gapRight = right.x;
  const centerY = box.y + box.h / 2;
  const laneCenterY = (boxCenter(left).y + boxCenter(right).y) / 2;
  return box.x >= gapLeft - 8
    && box.x + box.w <= gapRight + 8
    && Math.abs(centerY - laneCenterY) <= Math.max(8, Math.max(left.h, right.h) * 0.28);
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
