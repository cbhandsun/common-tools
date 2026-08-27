"use strict";

const { measureBranchCurvesFromAnchors } = require("./pixel-branch-curve-detector");

const MAX_FLOW_NODES = 16;

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

function unresolvedCurvedBranchResult() {
  return {
    shapes: [],
    preserveWhole: true,
    protectWhole: true,
    shellKind: "branch-card-flow",
    reason: "one-sided branch topology contains curved connector evidence, but complete pixel centerlines could not be measured; the source is preserved instead of flattened into false straight connectors"
  };
}

function hasUnresolvedCurvedBranchTopology(image = {}, atoms = [], understanding = {}) {
  if (!validBox(image.box)) return false;
  const nodes = topologyNodes(atoms, image.box);
  const connectors = Array.isArray(understanding.visualConnectors) ? understanding.visualConnectors : [];
  if (nodes.length < 3 || nodes.length > 12 || connectors.length !== nodes.length - 1) return false;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const degrees = new Map(nodes.map((node) => [node.id, 0]));
  const connectorAtoms = [];
  for (const connector of connectors) {
    if (!nodeIds.has(connector?.fromAtomId) || !nodeIds.has(connector?.toAtomId) || connector.fromAtomId === connector.toAtomId) return false;
    const atom = atoms.find((candidate) => candidate?.id === connector.atomId && validBox(candidate.box));
    if (!atom) return false;
    connectorAtoms.push(atom);
    degrees.set(connector.fromAtomId, degrees.get(connector.fromAtomId) + 1);
    degrees.set(connector.toAtomId, degrees.get(connector.toAtomId) + 1);
  }
  const sources = nodes.filter((node) => degrees.get(node.id) === nodes.length - 1);
  if (sources.length !== 1 || nodes.some((node) => node !== sources[0] && degrees.get(node.id) !== 1)) return false;
  if (!oneSidedBranchDirection(sources[0].box, nodes.filter((node) => node !== sources[0]))) return false;
  const curved = connectorAtoms.filter((atom) => {
    const endpoints = atom?.lineEndpoints;
    const hasMeasuredLine = [endpoints?.from?.x, endpoints?.from?.y, endpoints?.to?.x, endpoints?.to?.y]
      .every((value) => Number.isFinite(Number(value)));
    return !hasMeasuredLine && Number(atom.box?.w || 0) >= 30 && Number(atom.box?.h || 0) >= 16;
  });
  return curved.length >= Math.max(1, Math.ceil(connectorAtoms.length / 3));
}

function oneSidedBranchDirection(sourceBox, targets = []) {
  if (!validBox(sourceBox) || targets.length === 0 || targets.some((target) => !validBox(target?.box))) return null;
  if (targets.every((target) => target.box.x >= sourceBox.x + sourceBox.w)) return "right";
  if (targets.every((target) => target.box.x + target.box.w <= sourceBox.x)) return "left";
  if (targets.every((target) => target.box.y >= sourceBox.y + sourceBox.h)) return "down";
  if (targets.every((target) => target.box.y + target.box.h <= sourceBox.y)) return "up";
  return null;
}

function createBranchCardFlowShell(image = {}, atoms = [], understanding = {}, context = {}) {
  if (Number(understanding.confidence || 0) < 0.72 || !validBox(image.box)) return null;
  if (!validPixelImage(context.sourceImage) || !validSlideSize(context.slideSize)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const nodes = topologyNodes(atoms, image.box);
  if (nodes.length < 3 || nodes.length > 12) return null;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const visualConnectors = Array.isArray(understanding.visualConnectors) ? understanding.visualConnectors : [];
  if (visualConnectors.length !== nodes.length - 1) return null;
  const degrees = new Map(nodes.map((node) => [node.id, 0]));
  const connectorAtoms = [];
  const edges = new Set();
  for (const connector of visualConnectors) {
    if (!nodeById.has(connector?.fromAtomId) || !nodeById.has(connector?.toAtomId) || connector.fromAtomId === connector.toAtomId) return null;
    const edge = [connector.fromAtomId, connector.toAtomId].sort().join(":");
    if (edges.has(edge)) return null;
    const atom = atoms.find((candidate) => candidate?.id === connector.atomId && validBox(candidate.box));
    if (!atom || !["connector-line-candidate", "connector-arrow-candidate"].includes(atom.kind)) return null;
    edges.add(edge);
    connectorAtoms.push({ connector, atom });
    degrees.set(connector.fromAtomId, degrees.get(connector.fromAtomId) + 1);
    degrees.set(connector.toAtomId, degrees.get(connector.toAtomId) + 1);
  }
  const sources = nodes.filter((node) => degrees.get(node.id) === nodes.length - 1);
  if (sources.length !== 1) return null;
  const sourceNode = sources[0];
  const targets = nodes.filter((node) => node !== sourceNode);
  if (targets.some((node) => degrees.get(node.id) !== 1)) return null;
  const orderedTargets = orderBranchTargets(sourceNode, targets);
  const measured = measureBranchCurvesFromAnchors(context.sourceImage, {
    slideSize: context.slideSize,
    sourceBox: sourceNode.box,
    targetBoxes: orderedTargets.map((node) => node.box),
    sampleCount: 11,
    searchRadiusPt: Math.max(18, Math.min(58, Math.max(image.box.w, image.box.h) * 0.12)),
    minimumCoverage: 0.72
  });
  if (!measured.ok || measured.confidence < 0.72 || measured.curves.length !== orderedTargets.length) return null;
  const connectorByTarget = new Map(connectorAtoms.map((item) => {
    const targetId = item.connector.fromAtomId === sourceNode.id ? item.connector.toAtomId : item.connector.fromAtomId;
    return [targetId, item.atom];
  }));
  const orderedConnectors = orderedTargets.map((target) => connectorByTarget.get(target.id));
  if (orderedConnectors.some((atom) => !atom)) return null;
  const handled = new Set([...nodes, ...orderedConnectors].map((atom) => atom.id));
  if (atoms.some((atom) => !handled.has(atom?.id)
    && !isIgnorableContainedFragment(atom, nodes, image.box)
    && !isIgnorableTopologyLineFragment(atom, orderedConnectors, image.box)
    && !isTopologyCompositeAggregate(atom, nodes, orderedConnectors, image.box))) return null;
  return {
    shapes: [
      ...measured.curves.map((curve, index) => branchCardCurveShape(
        image, orderedConnectors[index], curve, index, measured, understanding
      )),
      branchCardNodeShape(image, sourceNode, 0, true, understanding),
      ...orderedTargets.map((node, index) => branchCardNodeShape(image, node, index + 1, false, understanding))
    ],
    handledAtomCount: handled.size,
    fullyObjectified: true,
    shellKind: "branch-card-flow"
  };
}

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

function createSankeyFlowShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.62 || !validBox(image.box)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const nodes = sankeyNodes(atoms, image.box);
  const bands = atoms.filter((atom) =>
    atom?.kind === "native-sankey-band-candidate"
    && validBox(atom.box)
    && validSankeyBand(atom.sankeyBand)
    && Number(atom.sankeyBand.confidence || 0) >= 0.68);
  if (nodes.length < 3 || nodes.length > 24 || bands.length < 1 || bands.length > 32) return null;
  const columns = clusterByCoordinate(nodes, (node) => boxCenter(node.box).x, Math.max(8, image.box.w * 0.035));
  if (columns.length < 2 || columns.length > 8) return null;
  const attachments = bands.map((band) => attachSankeyBand(band, nodes, image.box));
  if (attachments.some((attachment) => !attachment)) return null;
  const attachedNodeIds = new Set(attachments.flatMap((attachment) => [attachment.source.id, attachment.target.id]));
  if (attachedNodeIds.size < 3) return null;
  if (!sankeyFlowIsAcyclic(attachments)) return null;
  const handled = new Set([...nodes, ...bands].map((atom) => atom.id));
  if (atoms.some((atom) => !handled.has(atom?.id) && !isIgnorableContainedFragment(atom, [...nodes, ...bands], image.box))) return null;
  return {
    shapes: [
      ...bands.map((band, index) => sankeyBandShape(image, band, attachments[index], index, understanding)),
      ...nodes.map((node, index) => sankeyNodeShape(image, node, index, understanding))
    ],
    handledAtomCount: handled.size,
    fullyObjectified: true,
    shellKind: "sankey-flow-chart"
  };
}

function createVennOverlapShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72 || !validBox(image.box)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const ellipses = atoms
    .filter((atom) => atom?.kind === "native-venn-ellipse-candidate" && validBox(atom.box))
    .sort((left, right) => boxCenter(left.box).x - boxCenter(right.box).x);
  if (ellipses.length < 2 || ellipses.length > 5) return null;
  if (ellipses.some((atom) => Number(atom.vennRecoveryConfidence || 0) < 0.72 || !validBox(atom.vennObservedBox))) return null;
  const widths = ellipses.map((atom) => atom.box.w);
  const heights = ellipses.map((atom) => atom.box.h);
  const medianWidth = median(widths);
  const medianHeight = median(heights);
  if (ellipses.some((atom) => Math.abs(atom.box.w - medianWidth) > medianWidth * 0.12
    || Math.abs(atom.box.h - medianHeight) > medianHeight * 0.12)) return null;
  const adjacency = new Map(ellipses.map((atom) => [atom.id, new Set()]));
  for (let i = 0; i < ellipses.length; i += 1) {
    for (let j = i + 1; j < ellipses.length; j += 1) {
      const overlap = intersectionArea(ellipses[i].box, ellipses[j].box);
      const ratio = overlap / Math.max(1, Math.min(boxArea(ellipses[i].box), boxArea(ellipses[j].box)));
      if (ratio < 0.05 || ratio > 0.72) continue;
      adjacency.get(ellipses[i].id).add(ellipses[j].id);
      adjacency.get(ellipses[j].id).add(ellipses[i].id);
    }
  }
  if (!isConnectedTopology(ellipses, adjacency)) return null;
  const layerArea = boxArea(image.box);
  const supplementary = atoms.filter((atom) => atom?.kind === "native-rect-candidate"
    && validBox(atom.box)
    && boxArea(atom.box) >= layerArea * 0.004
    && !ellipses.some((ellipse) => intersectionArea(ellipse.box, atom.box) / Math.max(1, boxArea(atom.box)) >= 0.5));
  if (supplementary.length > ellipses.length * 2) return null;
  const handled = new Set([...ellipses, ...supplementary].map((atom) => atom.id));
  if (atoms.some((atom) => !handled.has(atom?.id)
    && !isIgnorableContainedFragment(atom, [...ellipses, ...supplementary], image.box))) return null;
  return {
    shapes: [
      ...ellipses.map((atom, index) => vennEllipseShape(image, atom, index, understanding)),
      ...supplementary.map((atom, index) => vennSupplementaryShape(image, atom, index, understanding))
    ],
    handledAtomCount: handled.size,
    fullyObjectified: true,
    shellKind: "venn-overlap"
  };
}

function createConcentricCirclesShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72) return null;
  const layerBox = validBox(image.box);
  if (!layerBox) return null;
  const layers = atoms
    .filter((atom) => atom?.kind === "native-concentric-circle-candidate" && validBox(atom.box))
    .sort((left, right) => Number(left.concentricLayerIndex ?? 99) - Number(right.concentricLayerIndex ?? 99));
  if (layers.length < 2 || layers.length > 8) return null;
  if (!isSafeConcentricLayerSequence(layers)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  return {
    shapes: layers.map((atom, index) => concentricLayerShape(image, atom, index, understanding)),
    handledAtomCount: layers.length,
    fullyObjectified: true,
    shellKind: "concentric-circles"
  };
}

function createQuadrantMatrixShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72) return null;
  const layerBox = validBox(image.box);
  if (!layerBox) return null;
  const panels = atoms
    .filter((atom) => atom?.kind === "native-quadrant-panel-candidate" && validBox(atom.box))
    .sort((left, right) => Number(left.quadrantRow ?? 99) - Number(right.quadrantRow ?? 99) || Number(left.quadrantColumn ?? 99) - Number(right.quadrantColumn ?? 99));
  if (panels.length !== 4 || new Set(panels.map((panel) => `${panel.quadrantRow}:${panel.quadrantColumn}`)).size !== 4) return null;
  const lineAtoms = atoms
    .filter((atom) => ["grid-line-candidate", "connector-line-candidate"].includes(atom?.kind) && validBox(atom.box));
  const horizontal = longestAxisAtom(lineAtoms, "h", layerBox);
  const vertical = longestAxisAtom(lineAtoms, "v", layerBox);
  if (!horizontal || !vertical) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  return {
    shapes: [
      ...panels.map((atom, index) => quadrantPanelShape(image, atom, index, understanding)),
      quadrantAxisShape(image, horizontal, "h", understanding),
      quadrantAxisShape(image, vertical, "v", understanding)
    ],
    handledAtomCount: panels.length + 2,
    fullyObjectified: true,
    shellKind: "quadrant-matrix"
  };
}

function createComparisonMatrixShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72 || !validBox(image.box)) return null;
  const grid = understanding.visualGrid;
  const xLines = validGridLines(grid?.xLines);
  const yLines = validGridLines(grid?.yLines);
  if (xLines.length < 3 || yLines.length < 3 || xLines.length > 17 || yLines.length > 17) return null;
  const rows = yLines.length - 1;
  const columns = xLines.length - 1;
  if (Number(grid?.rows) !== rows || Number(grid?.columns) !== columns) return null;
  if (Number(understanding.nodeCount || 0) < columns) return null;
  const cells = Array.isArray(grid?.cells) ? grid.cells : [];
  if (cells.length !== rows * columns || !isCompleteCellGrid(cells, xLines, yLines)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const stroke = safeColor(grid?.stroke, "#64748B");
  return {
    shapes: [
      ...cells.map((cell, index) => comparisonCellShape(image, cell, index, understanding)),
      ...yLines.map((y, index) => comparisonGridLineShape(image, { x: xLines[0], y, w: xLines[xLines.length - 1] - xLines[0], h: 0 }, "h", index, stroke, understanding)),
      ...xLines.map((x, index) => comparisonGridLineShape(image, { x, y: yLines[0], w: 0, h: yLines[yLines.length - 1] - yLines[0] }, "v", index, stroke, understanding))
    ],
    handledAtomCount: atoms.length,
    fullyObjectified: true,
    shellKind: "comparison-matrix"
  };
}

function createTimelineRoadmapShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.66 || !validBox(image.box)) return null;
  const candidates = atoms.filter((atom) => atom?.kind === "native-timeline-candidate" && validBox(atom.box));
  if (candidates.length !== 1 || atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const timeline = candidates[0];
  const milestones = normalizeTimelineMilestones(timeline.timelineMilestones, timeline.box);
  if (milestones.length < 3 || milestones.length > 12) return null;
  const diameter = Math.max(median(milestones.map((item) => item.widthPt)), Number(timeline.box.h || 0));
  if (!Number.isFinite(diameter) || diameter < 5 || diameter > timeline.box.h * 1.15) return null;
  const centerY = timeline.box.y + timeline.box.h / 2;
  const strokeWidth = Math.max(1.5, Math.min(5, diameter * 0.16));
  const color = safeColor(timeline.color, "#2563EB");
  return {
    shapes: [
      timelineAxisShape(image, timeline, centerY, strokeWidth, color, understanding),
      ...milestones.map((milestone, index) => timelineMilestoneShape(image, timeline, milestone, centerY, color, index, understanding))
    ],
    handledAtomCount: 1,
    fullyObjectified: true,
    shellKind: "timeline-roadmap"
  };
}

function createHubSpokeShell(image = {}, atoms = [], understanding = {}) {
  if (Number(understanding.confidence || 0) < 0.72 || !validBox(image.box)) return null;
  if (atoms.some((atom) => atom?.residualCandidate === true)) return null;
  const nodes = hubSpokeNodes(atoms, image.box);
  const allConnectors = Array.isArray(understanding.visualConnectors) ? understanding.visualConnectors : [];
  if (nodes.length < 5 || nodes.length > 12) return null;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const connectors = allConnectors.filter((connector) => nodeById.has(connector?.fromAtomId) && nodeById.has(connector?.toAtomId));
  if (connectors.length !== nodes.length - 1) return null;
  const connectorAtoms = [];
  const degrees = new Map(nodes.map((node) => [node.id, 0]));
  for (const connector of connectors) {
    if (!nodeById.has(connector?.fromAtomId) || !nodeById.has(connector?.toAtomId) || connector.fromAtomId === connector.toAtomId) return null;
    const connectorAtom = atoms.find((atom) => atom?.id === connector.atomId && validBox(atom.box));
    if (!connectorAtom || !["connector-line-candidate", "connector-arrow-candidate"].includes(connectorAtom.kind)) return null;
    connectorAtoms.push(connectorAtom);
    degrees.set(connector.fromAtomId, degrees.get(connector.fromAtomId) + 1);
    degrees.set(connector.toAtomId, degrees.get(connector.toAtomId) + 1);
  }
  const hubs = nodes.filter((node) => degrees.get(node.id) === nodes.length - 1);
  if (hubs.length !== 1 || nodes.some((node) => node !== hubs[0] && degrees.get(node.id) !== 1)) return null;
  const hub = hubs[0];
  const orderedNodes = [hub, ...nodes.filter((node) => node !== hub).sort((left, right) => radialAngle(hub.box, left.box) - radialAngle(hub.box, right.box))];
  return {
    shapes: [
      ...connectorAtoms.map((atom, index) => hubSpokeConnectorShape(image, atom, index, understanding)),
      ...orderedNodes.map((atom, index) => hubSpokeNodeShape(image, atom, index, atom === hub, understanding))
    ],
    handledAtomCount: nodes.length + connectorAtoms.length,
    fullyObjectified: true,
    shellKind: "hub-spoke"
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

function topologyNodes(atoms = [], layerBox = {}) {
  const allowed = new Set([
    "native-rect-candidate", "native-ellipse-candidate", "native-diamond-candidate", "native-triangle-candidate",
    "native-chevron-candidate", "native-parallelogram-candidate", "native-cylinder-candidate", "native-cloud-candidate",
    "native-document-candidate", "native-screen-candidate", "native-phone-candidate"
  ]);
  const layerArea = boxArea(layerBox);
  return atoms
    .filter((atom) => allowed.has(atom?.kind) && validBox(atom.box))
    .filter((atom) => {
      const aspect = atom.box.w / atom.box.h;
      return boxArea(atom.box) >= layerArea * 0.0035 && atom.box.w >= 18 && atom.box.h >= 16 && aspect >= 0.35 && aspect <= 7;
    })
    .slice(0, 12);
}

function augmentTopologyAxisConnectors(connectors = [], atoms = [], nodes = [], layerBox = {}) {
  const result = [...connectors];
  const edges = new Set(result.map((connector) => [connector.fromAtomId, connector.toAtomId].sort().join(":")));
  const usedAtoms = new Set(result.map((connector) => connector.atomId));
  for (const atom of atoms) {
    if (atom?.kind !== "grid-line-candidate" || usedAtoms.has(atom.id) || !validBox(atom.box)) continue;
    if (Math.max(atom.box.w, atom.box.h) < Math.min(layerBox.w, layerBox.h) * 0.18) continue;
    const endpoints = topologyConnectorEndpoints(atom);
    if (!endpoints) continue;
    const from = nearestTopologyNode(endpoints.from, nodes);
    const to = nearestTopologyNode(endpoints.to, nodes, from?.id);
    if (!from || !to || from.id === to.id) continue;
    const edge = [from.id, to.id].sort().join(":");
    if (edges.has(edge)) continue;
    edges.add(edge);
    usedAtoms.add(atom.id);
    result.push({
      atomId: atom.id,
      fromAtomId: from.id,
      toAtomId: to.id,
      axis: atom.box.w >= atom.box.h ? "horizontal" : "vertical",
      arrow: false,
      inferredFromMeasuredAxis: true
    });
  }
  return result;
}

function nearestTopologyNode(point = {}, nodes = [], excludedId = null) {
  const candidates = nodes
    .filter((node) => node?.id !== excludedId && validBox(node?.box))
    .map((node) => ({ node, distance: distancePointToBox(point, node.box) }))
    .sort((left, right) => left.distance - right.distance);
  const best = candidates[0];
  const maxDistance = best ? Math.max(18, Math.min(best.node.box.w, best.node.box.h) * 0.8) : 0;
  return best && best.distance <= maxDistance ? best.node : null;
}

function distancePointToBox(point = {}, box = {}) {
  const x = Math.max(Number(box.x || 0), Math.min(Number(point.x || 0), Number(box.x || 0) + Number(box.w || 0)));
  const y = Math.max(Number(box.y || 0), Math.min(Number(point.y || 0), Number(box.y || 0) + Number(box.h || 0)));
  return Math.hypot(Number(point.x || 0) - x, Number(point.y || 0) - y);
}

function measuredTopologyConnector(atom = {}) {
  const from = atom?.lineEndpoints?.from;
  const to = atom?.lineEndpoints?.to;
  if (Number.isFinite(Number(from?.x)) && Number.isFinite(Number(from?.y)) && Number.isFinite(Number(to?.x)) && Number.isFinite(Number(to?.y))) {
    return Math.hypot(Number(to.x) - Number(from.x), Number(to.y) - Number(from.y)) >= 12;
  }
  return Math.max(Number(atom.box?.w || 0), Number(atom.box?.h || 0)) >= 12
    && (Number(atom.box?.w || 0) >= Number(atom.box?.h || 0) * 3 || Number(atom.box?.h || 0) >= Number(atom.box?.w || 0) * 3);
}

function isIgnorableTopologyLineFragment(atom = {}, connectorAtoms = [], layerBox = {}) {
  if (String(atom?.source?.detector || "") !== "dense-linked-node-visual-atom" || !validBox(atom.box)) return false;
  if (boxArea(atom.box) > boxArea(layerBox) * 0.002) return false;
  const point = boxCenter(atom.box);
  return connectorAtoms.some((connector) => {
    const segment = topologyConnectorEndpoints(connector);
    if (!segment) return false;
    return distancePointToSegment(point, segment.from, segment.to) <= Math.max(9, Math.max(atom.box.w, atom.box.h) * 0.85);
  });
}

function isTopologyCompositeAggregate(atom = {}, nodes = [], connectorAtoms = [], layerBox = {}) {
  if (atom?.kind !== "connector-line-candidate" || !validBox(atom.box)) return false;
  const areaRatio = boxArea(atom.box) / Math.max(1, boxArea(layerBox));
  if (areaRatio < 0.22 || areaRatio > 0.92 || Number(atom.density || 0) > 0.32) return false;
  return nodes.every((node) => pointInsideBox(boxCenter(node.box), atom.box, 2))
    && connectorAtoms.every((connector) => containsBox(atom.box, connector.box, 4));
}

function topologyConnectorEndpoints(atom = {}) {
  const from = atom?.lineEndpoints?.from;
  const to = atom?.lineEndpoints?.to;
  if ([from?.x, from?.y, to?.x, to?.y].every((value) => Number.isFinite(Number(value)))) {
    return { from: { x: Number(from.x), y: Number(from.y) }, to: { x: Number(to.x), y: Number(to.y) } };
  }
  if (!validBox(atom.box)) return null;
  const horizontal = atom.box.w >= atom.box.h;
  return horizontal
    ? { from: { x: atom.box.x, y: atom.box.y + atom.box.h / 2 }, to: { x: atom.box.x + atom.box.w, y: atom.box.y + atom.box.h / 2 } }
    : { from: { x: atom.box.x + atom.box.w / 2, y: atom.box.y }, to: { x: atom.box.x + atom.box.w / 2, y: atom.box.y + atom.box.h } };
}

function distancePointToSegment(point = {}, from = {}, to = {}) {
  const dx = Number(to.x || 0) - Number(from.x || 0);
  const dy = Number(to.y || 0) - Number(from.y || 0);
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-9) return Math.hypot(Number(point.x || 0) - Number(from.x || 0), Number(point.y || 0) - Number(from.y || 0));
  const projection = Math.max(0, Math.min(1, ((Number(point.x || 0) - Number(from.x || 0)) * dx + (Number(point.y || 0) - Number(from.y || 0)) * dy) / lengthSquared));
  return Math.hypot(Number(point.x || 0) - (Number(from.x || 0) + projection * dx), Number(point.y || 0) - (Number(from.y || 0) + projection * dy));
}

function pointInsideBox(point = {}, box = {}, padding = 0) {
  return Number(point.x || 0) >= Number(box.x || 0) - padding
    && Number(point.y || 0) >= Number(box.y || 0) - padding
    && Number(point.x || 0) <= Number(box.x || 0) + Number(box.w || 0) + padding
    && Number(point.y || 0) <= Number(box.y || 0) + Number(box.h || 0) + padding;
}

function isConnectedTopology(nodes = [], adjacency = new Map()) {
  if (nodes.length === 0) return false;
  const visited = new Set();
  const queue = [nodes[0].id];
  while (queue.length > 0) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    for (const neighbor of adjacency.get(id) || []) if (!visited.has(neighbor)) queue.push(neighbor);
  }
  return visited.size === nodes.length && nodes.every((node) => (adjacency.get(node.id)?.size || 0) >= 1);
}

function isSafeTopologyLayout(nodes = [], connectors = [], adjacency = new Map(), layerBox = {}, signature = {}) {
  const direction = String(signature?.direction || "");
  if (direction !== "triangular-closed-loop") return true;
  if (nodes.length !== 3 || connectors.length !== 3 || nodes.some((node) => adjacency.get(node.id)?.size !== 2)) return false;
  const centers = nodes.map((node) => boxCenter(node.box));
  const area = Math.abs(
    centers[0].x * (centers[1].y - centers[2].y)
      + centers[1].x * (centers[2].y - centers[0].y)
      + centers[2].x * (centers[0].y - centers[1].y)
  ) / 2;
  return area >= boxArea(layerBox) * 0.035;
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

function isIgnorableContainedFragment(atom = {}, nodes = [], layerBox = {}) {
  if (!validBox(atom.box) || atom.residualCandidate === true) return false;
  const layerArea = boxArea(layerBox);
  return boxArea(atom.box) <= layerArea * 0.0015
    && nodes.some((node) => containsBox(node.box, atom.box, 2) && boxArea(atom.box) <= boxArea(node.box) * 0.22);
}

function hubSpokeNodes(atoms = [], layerBox = {}) {
  const layerArea = boxArea(layerBox);
  return atoms.filter((atom) => ["native-rect-candidate", "native-ellipse-candidate"].includes(atom?.kind) && validBox(atom.box))
    .filter((atom) => {
      const aspect = atom.box.w / atom.box.h;
      return boxArea(atom.box) >= layerArea * 0.008 && atom.box.w >= 24 && atom.box.h >= 18 && aspect >= 0.55 && aspect <= 5;
    });
}

function orderBranchTargets(sourceNode, targets = []) {
  const sourceCenter = boxCenter(sourceNode.box);
  const centers = targets.map((node) => ({ node, center: boxCenter(node.box) }));
  const meanDx = centers.reduce((sum, item) => sum + item.center.x - sourceCenter.x, 0) / Math.max(1, centers.length);
  const meanDy = centers.reduce((sum, item) => sum + item.center.y - sourceCenter.y, 0) / Math.max(1, centers.length);
  return centers
    .sort((left, right) => Math.abs(meanDx) >= Math.abs(meanDy)
      ? left.center.y - right.center.y || left.center.x - right.center.x
      : left.center.x - right.center.x || left.center.y - right.center.y)
    .map((item) => item.node);
}

function validPixelImage(image) {
  return Number.isInteger(image?.width) && image.width > 0
    && Number.isInteger(image?.height) && image.height > 0
    && Buffer.isBuffer(image?.rgba) && image.rgba.length === image.width * image.height * 4;
}

function validSlideSize(slide) {
  return Number.isFinite(Number(slide?.widthPt)) && Number(slide.widthPt) > 0
    && Number.isFinite(Number(slide?.heightPt)) && Number(slide.heightPt) > 0;
}

function radialAngle(hubBox, nodeBox) {
  const hub = boxCenter(hubBox);
  const node = boxCenter(nodeBox);
  return Math.atan2(node.y - hub.y, node.x - hub.x);
}

function normalizeTimelineMilestones(values, box) {
  if (!Array.isArray(values) || !validBox(box)) return [];
  const normalized = values.map((item) => ({ x: Number(item?.x), widthPt: Number(item?.widthPt) }));
  if (normalized.some((item) => !Number.isFinite(item.x) || !Number.isFinite(item.widthPt) || item.widthPt <= 0)) return [];
  if (normalized.some((item) => item.x < box.x - 1 || item.x > box.x + box.w + 1)) return [];
  const sorted = [...normalized].sort((left, right) => left.x - right.x);
  if (sorted.some((item, index) => index > 0 && item.x - sorted[index - 1].x < Math.max(4, Math.min(item.widthPt, sorted[index - 1].widthPt) * 0.55))) return [];
  return sorted;
}

function validGridLines(values) {
  if (!Array.isArray(values) || values.length < 2 || values.length > 17) return [];
  const lines = values.map(Number);
  if (lines.some((value) => !Number.isFinite(value) || value < 0 || value > 100000)) return [];
  return lines.every((value, index) => index === 0 || value > lines[index - 1]) ? lines : [];
}

function isCompleteCellGrid(cells, xLines, yLines) {
  const expected = new Set();
  for (let row = 0; row < yLines.length - 1; row += 1) {
    for (let column = 0; column < xLines.length - 1; column += 1) expected.add(`${row}:${column}`);
  }
  for (const cell of cells) {
    const key = `${cell?.row}:${cell?.column}`;
    if (!expected.delete(key) || !validBox(cell?.box)) return false;
  }
  return expected.size === 0;
}

function longestAxisAtom(atoms = [], axis, layerBox = {}) {
  return atoms
    .filter((atom) => lineAxis(atom) === axis)
    .filter((atom) => (axis === "h" ? atom.box.w : atom.box.h) >= (axis === "h" ? layerBox.w : layerBox.h) * 0.42)
    .sort((left, right) => (axis === "h" ? right.box.w - left.box.w : right.box.h - left.box.h))[0] || null;
}

function lineAxis(atom = {}) {
  const raw = String(atom.axis || atom.shapeHint || "").toLowerCase();
  if (raw === "h" || raw.includes("horizontal")) return "h";
  if (raw === "v" || raw.includes("vertical")) return "v";
  return Number(atom.box?.w || 0) >= Number(atom.box?.h || 0) ? "h" : "v";
}

function isSafeConcentricLayerSequence(layers = []) {
  const outerCenter = boxCenter(layers[0].box);
  for (let index = 0; index < layers.length; index += 1) {
    const current = layers[index].box;
    const aspect = current.w / current.h;
    if (aspect < 0.72 || aspect > 1.38) return false;
    const center = boxCenter(current);
    if (Math.hypot(center.x - outerCenter.x, center.y - outerCenter.y) > Math.max(5, layers[0].box.w * 0.055)) return false;
    if (index === 0) continue;
    const previous = layers[index - 1].box;
    if (!containsBox(previous, current, 3)) return false;
    if (current.w / previous.w > 0.9 || current.h / previous.h > 0.9) return false;
  }
  return true;
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

function flowNodeShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const color = safeColor(atom.color, "#60A5FA");
  return {
    id: `${safeId(image.id)}-relationship-flow-node-${index}`,
    type: "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-flow-node", { nodeIndex: index })
  };
}

function concentricLayerShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const color = safeColor(atom.color, index === 0 ? "#DBEAFE" : "#60A5FA");
  return {
    id: `${safeId(image.id)}-relationship-concentric-layer-${index}`,
    type: "ellipse",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-concentric-layer", {
      layerIndex: index,
      layerCount: atom.concentricLayerCount || null
    })
  };
}

function quadrantPanelShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const color = safeColor(atom.color, index % 3 === 0 ? "#DBEAFE" : "#BFDBFE");
  return {
    id: `${safeId(image.id)}-relationship-quadrant-panel-${index}`,
    type: "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-quadrant-panel", {
      row: atom.quadrantRow,
      column: atom.quadrantColumn
    })
  };
}

function quadrantAxisShape(image = {}, atom = {}, axis, understanding = {}) {
  const box = atom.box;
  const line = axis === "h"
    ? { x: box.x, y: box.y + box.h / 2, w: box.w, h: 0 }
    : { x: box.x + box.w / 2, y: box.y, w: 0, h: box.h };
  return {
    id: `${safeId(image.id)}-relationship-quadrant-axis-${axis}`,
    type: "line",
    box: roundedBox(line),
    style: {
      stroke: safeColor(atom.color, "#64748B"),
      strokeWidthPt: round(Math.max(1, Math.min(5, axis === "h" ? box.h : box.w))),
      connectorType: "straight"
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-quadrant-axis", { axis })
  };
}

function comparisonCellShape(image = {}, cell = {}, index = 0, understanding = {}) {
  return {
    id: `${safeId(image.id)}-relationship-comparison-cell-${index}`,
    type: "rect",
    box: roundedBox(cell.box),
    style: { fill: safeColor(cell.fill, "#FFFFFF"), stroke: safeColor(cell.fill, "#FFFFFF"), strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, cell, understanding, "visual-relationship-native-comparison-cell", { row: cell.row, column: cell.column })
  };
}

function comparisonGridLineShape(image = {}, box = {}, axis, index, stroke, understanding = {}) {
  return {
    id: `${safeId(image.id)}-relationship-comparison-grid-${axis}-${index}`,
    type: "line",
    box: roundedBox(box),
    style: { stroke, strokeWidthPt: 1.5, connectorType: "straight" },
    source: nativeSource(image, {}, understanding, "visual-relationship-native-comparison-grid-line", { axis, lineIndex: index })
  };
}

function timelineAxisShape(image = {}, atom = {}, centerY, strokeWidth, color, understanding = {}) {
  return {
    id: `${safeId(image.id)}-relationship-timeline-axis`,
    type: "line",
    box: roundedBox({ x: atom.box.x, y: centerY, w: atom.box.w, h: 0 }),
    style: { stroke: color, strokeWidthPt: round(strokeWidth), connectorType: "straight" },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-timeline-axis", { part: "axis" })
  };
}

function timelineMilestoneShape(image = {}, atom = {}, milestone = {}, centerY, color, index, understanding = {}) {
  const size = Math.min(Number(atom.box?.h || milestone.widthPt), Number(milestone.widthPt) + 2);
  return {
    id: `${safeId(image.id)}-relationship-timeline-milestone-${index}`,
    type: "ellipse",
    box: roundedBox({ x: milestone.x - size / 2, y: centerY - size / 2, w: size, h: size }),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-timeline-milestone", { part: "milestone", milestoneIndex: index })
  };
}

function branchCardNodeShape(image = {}, atom = {}, index, isSource, understanding = {}) {
  const shape = topologyNodeShape(image, atom, index, understanding);
  return {
    ...shape,
    id: `${safeId(image.id)}-relationship-branch-card-node-${index}`,
    source: nativeSource(image, atom, understanding, "visual-relationship-native-branch-card-node", {
      nodeIndex: index,
      role: isSource ? "source" : "target",
      nodeKind: atom.kind
    })
  };
}

function branchCardCurveShape(image = {}, atom = {}, curve = {}, index, measured = {}, understanding = {}) {
  const points = Array.isArray(curve.points) ? curve.points.map((point) => ({ x: Number(point.x), y: Number(point.y) })) : [];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const box = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    h: Math.max(1, Math.max(...ys) - Math.min(...ys))
  };
  const normalize = (point) => ({
    x: round((point.x - box.x) / box.w),
    y: round((point.y - box.y) / box.h)
  });
  const segments = [{ type: "moveTo", points: [normalize(points[0])] }];
  for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
    const p0 = points[Math.max(0, pointIndex - 1)];
    const p1 = points[pointIndex];
    const p2 = points[pointIndex + 1];
    const p3 = points[Math.min(points.length - 1, pointIndex + 2)];
    segments.push({
      type: "cubicBezTo",
      points: [
        normalize({ x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }),
        normalize({ x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }),
        normalize(p2)
      ]
    });
  }
  const horizontal = Number(atom.box?.w || 0) >= Number(atom.box?.h || 0);
  const thickness = Math.max(1.2, Math.min(8, horizontal ? Number(atom.box?.h || 2) : Number(atom.box?.w || 2)));
  return {
    id: `${safeId(image.id)}-relationship-branch-card-connector-${index}`,
    type: "freeform",
    box: roundedBox(box),
    points: points.map(normalize),
    style: {
      fill: "none",
      stroke: safeColor(measured.routeColor || atom.color, "#2563EB"),
      strokeWidthPt: round(thickness),
      lineCap: "round",
      freeformSegments: segments,
      ...connectorArrowStyle(atom)
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-branch-card-connector", {
      connectorIndex: index,
      measurementMode: "pixel-anchor-centerline",
      measurementConfidence: round(curve.confidence),
      routeColor: measured.routeColor || null,
      routeColorMode: measured.routeColorMode || null,
      routeColorConfidence: Number.isFinite(Number(measured.routeColorConfidence)) ? round(measured.routeColorConfidence) : null,
      branchDirection: measured.direction || null
    })
  };
}

function hubSpokeNodeShape(image = {}, atom = {}, index, isHub, understanding = {}) {
  const color = safeColor(atom.color, isHub ? "#2563EB" : "#60A5FA");
  return {
    id: `${safeId(image.id)}-relationship-hub-spoke-node-${index}`,
    type: atom.kind === "native-ellipse-candidate" ? "ellipse" : "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-hub-spoke-node", { nodeIndex: index, role: isHub ? "hub" : "spoke" })
  };
}

function hubSpokeConnectorShape(image = {}, atom = {}, index, understanding = {}) {
  const horizontal = atom.box.w >= atom.box.h;
  const box = horizontal
    ? { x: atom.box.x, y: atom.box.y + atom.box.h / 2, w: atom.box.w, h: 0 }
    : { x: atom.box.x + atom.box.w / 2, y: atom.box.y, w: 0, h: atom.box.h };
  return {
    id: `${safeId(image.id)}-relationship-hub-spoke-connector-${index}`,
    type: "line",
    box: roundedBox(box),
    style: {
      stroke: safeColor(atom.color, "#94A3B8"),
      strokeWidthPt: round(Math.max(1, Math.min(6, horizontal ? atom.box.h : atom.box.w))),
      connectorType: "straight",
      ...(atom.kind === "connector-arrow-candidate" ? { endArrow: "triangle" } : {})
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-hub-spoke-connector", { connectorIndex: index })
  };
}

function topologyNodeShape(image = {}, atom = {}, index, understanding = {}) {
  const typeByKind = {
    "native-ellipse-candidate": "ellipse",
    "native-diamond-candidate": "diamond",
    "native-triangle-candidate": "triangle",
    "native-chevron-candidate": "chevron",
    "native-parallelogram-candidate": "parallelogram",
    "native-cylinder-candidate": "cylinder",
    "native-cloud-candidate": "cloud",
    "native-document-candidate": "document",
    "native-screen-candidate": "rect",
    "native-phone-candidate": "roundRect"
  };
  const color = safeColor(atom.color, "#60A5FA");
  return {
    id: `${safeId(image.id)}-relationship-topology-node-${index}`,
    type: typeByKind[atom.kind] || "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-topology-node", { nodeIndex: index, nodeKind: atom.kind })
  };
}

function topologyConnectorShape(image = {}, atom = {}, index, understanding = {}) {
  const measuredFrom = atom?.lineEndpoints?.from;
  const measuredTo = atom?.lineEndpoints?.to;
  const hasMeasuredEndpoints = [measuredFrom?.x, measuredFrom?.y, measuredTo?.x, measuredTo?.y].every((value) => Number.isFinite(Number(value)));
  const horizontal = Number(atom.box?.w || 0) >= Number(atom.box?.h || 0);
  const box = hasMeasuredEndpoints
    ? lineBox(measuredFrom, measuredTo)
    : horizontal
      ? { x: atom.box.x, y: atom.box.y + atom.box.h / 2, w: atom.box.w, h: 0 }
      : { x: atom.box.x + atom.box.w / 2, y: atom.box.y, w: 0, h: atom.box.h };
  const thickness = hasMeasuredEndpoints
    ? Math.max(1.2, Math.min(6, Math.min(Number(atom.box?.w || 0), Number(atom.box?.h || 0)) * 0.42))
    : Math.max(1.2, Math.min(6, horizontal ? Number(atom.box?.h || 0) : Number(atom.box?.w || 0)));
  return {
    id: `${safeId(image.id)}-relationship-topology-connector-${index}`,
    type: "line",
    box: roundedBox(box),
    style: {
      stroke: safeColor(atom.color, "#94A3B8"),
      strokeWidthPt: round(thickness),
      connectorType: "straight",
      lineCap: "round",
      ...connectorArrowStyle(atom)
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-topology-connector", { connectorIndex: index, measuredEndpoints: hasMeasuredEndpoints })
  };
}

function connectorArrowStyle(atom = {}) {
  if (atom.kind !== "connector-arrow-candidate") return {};
  return atom.arrowDirection === "left" || atom.arrowDirection === "up"
    ? { startArrow: "triangle" }
    : { endArrow: "triangle" };
}

function measuredGenericNodeShape(image = {}, atom = {}, index, understanding = {}) {
  const shape = topologyNodeShape(image, atom, index, understanding);
  return {
    ...shape,
    id: `${safeId(image.id)}-relationship-generic-node-${index}`,
    source: nativeSource(image, atom, understanding, "visual-relationship-native-generic-node", {
      nodeIndex: index,
      nodeKind: atom.kind
    })
  };
}

function measuredGenericConnectorShape(image = {}, atom = {}, index, understanding = {}) {
  const shape = topologyConnectorShape(image, atom, index, understanding);
  return {
    ...shape,
    id: `${safeId(image.id)}-relationship-generic-connector-${index}`,
    source: nativeSource(image, atom, understanding, "visual-relationship-native-generic-connector", {
      connectorIndex: index,
      measuredEndpoints: true
    })
  };
}

function funnelLensNodeShape(image = {}, atom = {}, index, role, understanding = {}) {
  const typeByKind = {
    "native-ellipse-candidate": "ellipse",
    "native-diamond-candidate": "diamond",
    "native-chevron-candidate": "chevron",
    "native-parallelogram-candidate": "parallelogram",
    "native-document-candidate": "document"
  };
  const color = safeColor(atom.color, role === "focus-content" ? "#EFF6FF" : "#DBEAFE");
  return {
    id: `${safeId(image.id)}-relationship-funnel-lens-${role}-${index}`,
    type: typeByKind[atom.kind] || "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-funnel-lens-node", {
      nodeIndex: index,
      role
    })
  };
}

function funnelLensConnectorShape(image = {}, atom = {}, index, understanding = {}) {
  const from = atom?.lineEndpoints?.from;
  const to = atom?.lineEndpoints?.to;
  const measured = [from?.x, from?.y, to?.x, to?.y].every((value) => Number.isFinite(Number(value)));
  const horizontal = Number(atom.box?.w || 0) >= Number(atom.box?.h || 0);
  const box = measured
    ? lineBox(from, to)
    : horizontal
      ? { x: atom.box.x, y: atom.box.y + atom.box.h / 2, w: atom.box.w, h: 0 }
      : { x: atom.box.x + atom.box.w / 2, y: atom.box.y, w: 0, h: atom.box.h };
  const thickness = measured
    ? Math.max(1.2, Math.min(6, Math.min(Number(atom.box?.w || 0), Number(atom.box?.h || 0)) * 0.42))
    : Math.max(1.2, Math.min(6, horizontal ? Number(atom.box?.h || 0) : Number(atom.box?.w || 0)));
  return {
    id: `${safeId(image.id)}-relationship-funnel-lens-connector-${index}`,
    type: "line",
    box: roundedBox(box),
    style: {
      stroke: safeColor(atom.color, "#60A5FA"),
      strokeWidthPt: round(thickness),
      connectorType: "straight",
      lineCap: "round",
      ...(atom.kind === "connector-arrow-candidate" ? { endArrow: "triangle" } : {})
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-funnel-lens-connector", {
      connectorIndex: index,
      measuredEndpoints: measured
    })
  };
}

function funnelLensFocusShapes(image = {}, atom = {}, understanding = {}) {
  const color = safeColor(atom.color, "#2563EB");
  if (atom.kind === "native-funnel-candidate") {
    return [{
      id: `${safeId(image.id)}-relationship-funnel-lens-focus`,
      type: "funnel",
      box: roundedBox(atom.box),
      style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
      source: nativeSource(image, atom, understanding, "visual-relationship-native-funnel-lens-focus", { role: "focus", part: "funnel" })
    }];
  }
  if (atom.kind === "native-donut-candidate") {
    return [{
      id: `${safeId(image.id)}-relationship-funnel-lens-focus`,
      type: "donut",
      box: roundedBox(atom.box),
      style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
      source: nativeSource(image, atom, understanding, "visual-relationship-native-funnel-lens-focus", { role: "focus", part: "lens" })
    }];
  }
  const box = atom.box;
  const lensSize = Math.min(Number(box.w || 0) * 0.7, Number(box.h || 0) * 0.7);
  const lensBox = {
    x: Number(box.x || 0),
    y: Number(box.y || 0),
    w: lensSize,
    h: lensSize
  };
  const handleStart = { x: lensBox.x + lensBox.w * 0.68, y: lensBox.y + lensBox.h * 0.68 };
  const handleEnd = {
    x: Number(box.x || 0) + Number(box.w || 0) * 0.96,
    y: Number(box.y || 0) + Number(box.h || 0) * 0.96
  };
  const strokeWidth = round(Math.max(2, Math.min(24, Math.min(Number(box.w || 0), Number(box.h || 0)) * 0.12)));
  return [
    {
      id: `${safeId(image.id)}-relationship-funnel-lens-focus-lens`,
      type: "donut",
      box: roundedBox(lensBox),
      style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 0.98 },
      source: nativeSource(image, atom, understanding, "visual-relationship-native-funnel-lens-focus", { role: "focus", part: "lens" })
    },
    {
      id: `${safeId(image.id)}-relationship-funnel-lens-focus-handle`,
      type: "line",
      box: roundedBox(lineBox(handleStart, handleEnd)),
      style: { stroke: color, strokeWidthPt: strokeWidth, connectorType: "straight", lineCap: "round", opacity: 0.98 },
      source: nativeSource(image, atom, understanding, "visual-relationship-native-funnel-lens-focus", { role: "focus", part: "handle" })
    }
  ];
}

function vennEllipseShape(image = {}, atom = {}, index, understanding = {}) {
  const color = safeColor(atom.color, index % 2 === 0 ? "#60A5FA" : "#34D399");
  return {
    id: `${safeId(image.id)}-relationship-venn-ellipse-${index}`,
    type: "ellipse",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-venn-ellipse", {
      setIndex: index,
      observedBox: roundedBox(atom.vennObservedBox),
      recoveryConfidence: round(atom.vennRecoveryConfidence)
    })
  };
}

function vennSupplementaryShape(image = {}, atom = {}, index, understanding = {}) {
  const color = safeColor(atom.color, "#DBEAFE");
  return {
    id: `${safeId(image.id)}-relationship-venn-supplementary-${index}`,
    type: "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-venn-supplementary", {
      supplementaryIndex: index
    })
  };
}

function sankeyNodeShape(image = {}, atom = {}, index, understanding = {}) {
  const color = safeColor(atom.color, "#334155");
  return {
    id: `${safeId(image.id)}-relationship-sankey-node-${index}`,
    type: "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-sankey-node", {
      nodeIndex: index
    })
  };
}

function sankeyBandShape(image = {}, atom = {}, attachment = {}, index, understanding = {}) {
  const band = atom.sankeyBand;
  const box = {
    x: band.sourceX,
    y: Math.min(band.sourceTop, band.targetTop),
    w: band.targetX - band.sourceX,
    h: Math.max(band.sourceBottom, band.targetBottom) - Math.min(band.sourceTop, band.targetTop)
  };
  const safeHeight = Math.max(0.1, box.h);
  const y = (value) => round((Number(value || 0) - box.y) / safeHeight);
  const sourceTop = y(band.sourceTop);
  const sourceBottom = y(band.sourceBottom);
  const targetTop = y(band.targetTop);
  const targetBottom = y(band.targetBottom);
  const freeformSegments = [
    { type: "moveTo", points: [{ x: 0, y: sourceTop }] },
    { type: "cubicBezTo", points: [{ x: 0.42, y: sourceTop }, { x: 0.58, y: targetTop }, { x: 1, y: targetTop }] },
    { type: "lnTo", points: [{ x: 1, y: targetBottom }] },
    { type: "cubicBezTo", points: [{ x: 0.58, y: targetBottom }, { x: 0.42, y: sourceBottom }, { x: 0, y: sourceBottom }] },
    { type: "close", points: [] }
  ];
  const color = safeColor(atom.color, "#93C5FD");
  return {
    id: `${safeId(image.id)}-relationship-sankey-band-${index}`,
    type: "freeform",
    box: roundedBox(box),
    points: [{ x: 0, y: sourceTop }, { x: 1, y: targetTop }, { x: 1, y: targetBottom }, { x: 0, y: sourceBottom }],
    style: {
      fill: color,
      stroke: color,
      strokeWidthPt: 0,
      opacity: 1,
      closePath: true,
      freeformSegments
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-sankey-band", {
      bandIndex: index,
      sourceNodeId: attachment.source.id,
      targetNodeId: attachment.target.id,
      sourceThickness: round(band.sourceThickness),
      targetThickness: round(band.targetThickness),
      geometryConfidence: round(band.confidence)
    })
  };
}

function swimlaneNodeShape(image = {}, atom = {}, laneIndex, laneColumn, understanding = {}) {
  const color = safeColor(atom.color, "#60A5FA");
  return {
    id: `${safeId(image.id)}-relationship-swimlane-node-${laneIndex}-${laneColumn}`,
    type: "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-swimlane-node", { laneIndex, laneColumn })
  };
}

function layeredStackShape(image = {}, atom = {}, index, understanding = {}) {
  const color = safeColor(atom.color, "#60A5FA");
  return {
    id: `${safeId(image.id)}-relationship-layered-stack-${index}`,
    type: atom.kind === "native-funnel-candidate" ? "funnel" : "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-layered-stack-layer", {
      layerIndex: index,
      layerCount: Number(understanding.structureSignature?.stepCount || 0) || null
    })
  };
}

function cycleLoopSegmentShapes(image = {}, atom = {}, angle = {}, index, understanding = {}) {
  const parentBox = roundedBox(atom.donutParentBox);
  const color = safeColor(atom.color, "#38BDF8");
  const source = nativeSource(image, atom, understanding, "visual-relationship-native-cycle-loop-segment", {
    segmentIndex: index,
    startDeg: angle.startDeg,
    endDeg: angle.endDeg
  });
  const shapes = [{
    id: `${safeId(image.id)}-relationship-cycle-loop-segment-${index}`,
    type: "freeform",
    box: parentBox,
    points: cycleDonutSegmentPoints(angle.startDeg, angle.endDeg, 0.62),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: { ...source, part: "arc" }
  }];
  if (atom.arcArrowHead !== true) return shapes;
  const headSize = Math.max(10, Math.min(28, Math.max(parentBox.w, parentBox.h) * 0.16));
  const endpoint = cyclePointOnBox(parentBox, angle.endDeg, Math.max(parentBox.w, parentBox.h) * 0.48);
  shapes.push({
    id: `${safeId(image.id)}-relationship-cycle-loop-head-${index}`,
    type: "freeform",
    box: roundedBox({ x: endpoint.x - headSize / 2, y: endpoint.y - headSize / 2, w: headSize, h: headSize }),
    points: [{ x: 1, y: 0.5 }, { x: 0, y: 0 }, { x: 0, y: 1 }],
    style: { fill: color, stroke: color, strokeWidthPt: 0, rotation: round(angle.endDeg), opacity: 1 },
    source: { ...source, part: "arrowhead" }
  });
  return shapes;
}

function cycleDonutSegmentPoints(startDeg, endDeg, holeRatio) {
  const sweep = (endDeg - startDeg + 360) % 360;
  const steps = Math.max(4, Math.min(20, Math.ceil(sweep / 16)));
  const innerRadius = Math.max(0.18, Math.min(0.78, Number(holeRatio || 0.62))) * 0.5;
  const outer = [];
  const inner = [];
  for (let index = 0; index <= steps; index += 1) outer.push(cyclePointOnUnitCircle(startDeg + sweep * index / steps, 0.5));
  for (let index = steps; index >= 0; index -= 1) inner.push(cyclePointOnUnitCircle(startDeg + sweep * index / steps, innerRadius));
  return [...outer, ...inner];
}

function cyclePointOnUnitCircle(degrees, radius) {
  const radians = normalizeDegrees(degrees) * Math.PI / 180;
  return { x: round(0.5 + Math.cos(radians) * radius), y: round(0.5 + Math.sin(radians) * radius) };
}

function cyclePointOnBox(box = {}, degrees, radius) {
  const radians = normalizeDegrees(degrees) * Math.PI / 180;
  return {
    x: Number(box.x || 0) + Number(box.w || 0) / 2 + Math.cos(radians) * radius,
    y: Number(box.y || 0) + Number(box.h || 0) / 2 + Math.sin(radians) * radius
  };
}

function normalizeDegrees(value) {
  const number = Number(value);
  return Number.isFinite(number) ? ((number % 360) + 360) % 360 : null;
}

function swimlaneConnectorShape(image = {}, atom = {}, index, understanding = {}) {
  const centerY = atom.box.y + atom.box.h / 2;
  return {
    id: `${safeId(image.id)}-relationship-swimlane-connector-${index}`,
    type: "line",
    box: roundedBox({ x: atom.box.x, y: centerY, w: atom.box.w, h: 0 }),
    style: {
      stroke: safeColor(atom.color, "#94A3B8"),
      strokeWidthPt: round(Math.max(1, Math.min(6, atom.box.h))),
      connectorType: "straight",
      ...(atom.kind === "connector-arrow-candidate" ? { endArrow: "triangle" } : {})
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-swimlane-connector", { connectorIndex: index })
  };
}

function flowConnectorShape(image = {}, fromAtom = {}, toAtom = {}, bridgeAtom = null, index = 0, understanding = {}) {
  const from = fromAtom.box;
  const to = toAtom.box;
  const y = ((from.y + from.h / 2) + (to.y + to.h / 2)) / 2;
  const stroke = safeColor(bridgeAtom?.color, "#94A3B8");
  const thickness = bridgeAtom?.box
    ? Math.max(1.2, Math.min(5, Number(bridgeAtom.box.h || 2) * 0.42))
    : 1.8;
  return {
    id: `${safeId(image.id)}-relationship-flow-connector-${index}`,
    type: "line",
    box: roundedBox({ x: from.x + from.w, y, w: to.x - (from.x + from.w), h: 0 }),
    style: { stroke, strokeWidthPt: round(thickness), connectorType: "straight", endArrow: "triangle", lineCap: "round" },
    source: nativeSource(image, bridgeAtom || fromAtom, understanding, "visual-relationship-native-flow-connector", { connectorIndex: index })
  };
}

function treeNodeShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const color = safeColor(atom.color, index === 0 ? "#2563EB" : "#60A5FA");
  return {
    id: `${safeId(image.id)}-relationship-tree-node-${index}`,
    type: "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-tree-node", { nodeIndex: index })
  };
}

function treeConnectorShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const box = atom.box;
  const horizontal = box.w >= box.h;
  const lineBox = horizontal
    ? { x: box.x, y: box.y + box.h / 2, w: box.w, h: 0 }
    : { x: box.x + box.w / 2, y: box.y, w: 0, h: box.h };
  return {
    id: `${safeId(image.id)}-relationship-tree-connector-${index}`,
    type: "line",
    box: roundedBox(lineBox),
    style: {
      stroke: safeColor(atom.color, "#94A3B8"),
      strokeWidthPt: round(Math.max(1, Math.min(6, horizontal ? box.h : box.w))),
      connectorType: "straight"
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-tree-connector", { connectorIndex: index })
  };
}

function fishboneNodeShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const color = safeColor(atom.color, "#DBEAFE");
  return {
    id: `${safeId(image.id)}-relationship-fishbone-node-${index}`,
    type: "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-fishbone-node", { nodeIndex: index })
  };
}

function fishboneSpineShape(image = {}, atom = {}, understanding = {}) {
  const from = atom.lineEndpoints?.from || { x: atom.box.x, y: atom.box.y + atom.box.h / 2 };
  const to = atom.lineEndpoints?.to || { x: atom.box.x + atom.box.w, y: atom.box.y + atom.box.h / 2 };
  return {
    id: `${safeId(image.id)}-relationship-fishbone-spine`,
    type: "line",
    box: lineBox(from, to),
    style: {
      stroke: safeColor(atom.color, "#2563EB"),
      strokeWidthPt: round(Math.max(1.5, Math.min(8, atom.box.h))),
      connectorType: "straight",
      endArrow: "triangle",
      lineCap: "round"
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-fishbone-spine")
  };
}

function fishboneBranchShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const from = atom.lineEndpoints.from;
  const to = atom.lineEndpoints.to;
  const thickness = Number(atom.pixelBox?.w || 0) > 0
    ? Math.min(Number(atom.pixelBox.w || 1), Number(atom.pixelBox.h || 1))
    : Math.min(Number(atom.box.w || 1), Number(atom.box.h || 1));
  return {
    id: `${safeId(image.id)}-relationship-fishbone-branch-${index}`,
    type: "line",
    box: lineBox(from, to),
    style: {
      stroke: safeColor(atom.color, "#2563EB"),
      strokeWidthPt: round(Math.max(1.5, Math.min(7, thickness * 0.11))),
      connectorType: "straight",
      lineCap: "round"
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-fishbone-connector", { connectorIndex: index })
  };
}

function lineBox(from = {}, to = {}) {
  return {
    x: round(from.x),
    y: round(from.y),
    w: round(Number(to.x || 0) - Number(from.x || 0)),
    h: round(Number(to.y || 0) - Number(from.y || 0))
  };
}

function boxCenter(box = {}) {
  return { x: Number(box.x || 0) + Number(box.w || 0) / 2, y: Number(box.y || 0) + Number(box.h || 0) / 2 };
}

function sankeyNodes(atoms = [], layerBox = {}) {
  const layerArea = boxArea(layerBox);
  return (atoms || [])
    .filter((atom) => atom?.kind === "native-rect-candidate" && validBox(atom.box))
    .filter((atom) => {
      const width = Number(atom.box.w || 0);
      const height = Number(atom.box.h || 0);
      const areaRatio = boxArea(atom.box) / Math.max(1, layerArea);
      const density = Number(atom.density || 0);
      return width <= Math.max(34, Number(layerBox.w || 0) * 0.075)
        && height >= Math.max(18, Number(layerBox.h || 0) * 0.07)
        && height >= width * 1.35
        && areaRatio >= 0.001
        && areaRatio <= 0.09
        && density >= 0.72;
    })
    .sort((left, right) => boxCenter(left.box).x - boxCenter(right.box).x || left.box.y - right.box.y);
}

function validSankeyBand(band = {}) {
  return [
    band.sourceX,
    band.targetX,
    band.sourceTop,
    band.sourceBottom,
    band.targetTop,
    band.targetBottom,
    band.sourceThickness,
    band.targetThickness
  ].every((value) => Number.isFinite(Number(value)))
    && Number(band.targetX) > Number(band.sourceX)
    && Number(band.sourceBottom) > Number(band.sourceTop)
    && Number(band.targetBottom) > Number(band.targetTop);
}

function attachSankeyBand(bandAtom = {}, nodes = [], layerBox = {}) {
  const band = bandAtom.sankeyBand;
  const tolerance = Math.max(7, Number(layerBox.w || 0) * 0.025);
  const source = nearestSankeyEndpointNode(nodes, band.sourceX, band.sourceTop, band.sourceBottom, "source", tolerance);
  const target = nearestSankeyEndpointNode(nodes, band.targetX, band.targetTop, band.targetBottom, "target", tolerance);
  if (!source || !target || source.id === target.id) return null;
  if (boxCenter(source.box).x >= boxCenter(target.box).x) return null;
  return { source, target };
}

function nearestSankeyEndpointNode(nodes = [], x, top, bottom, side, tolerance) {
  const thickness = Math.max(1, Number(bottom || 0) - Number(top || 0));
  return nodes
    .map((node) => {
      const edgeX = side === "source" ? node.box.x + node.box.w : node.box.x;
      const xDistance = Math.abs(edgeX - Number(x || 0));
      const overlap = Math.max(0, Math.min(node.box.y + node.box.h, bottom) - Math.max(node.box.y, top));
      return { node, xDistance, overlapRatio: overlap / thickness };
    })
    .filter((candidate) => candidate.xDistance <= tolerance && candidate.overlapRatio >= 0.62)
    .sort((left, right) => left.xDistance - right.xDistance || right.overlapRatio - left.overlapRatio)[0]?.node || null;
}

function sankeyFlowIsAcyclic(attachments = []) {
  return attachments.every((attachment) => boxCenter(attachment.source.box).x < boxCenter(attachment.target.box).x);
}

function clusterByCoordinate(items = [], coordinate, tolerance = 1) {
  const clusters = [];
  for (const item of [...items].sort((left, right) => coordinate(left) - coordinate(right))) {
    const value = coordinate(item);
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(value - last.center) > tolerance) {
      clusters.push({ center: value, items: [item] });
    } else {
      last.items.push(item);
      last.center = last.items.reduce((sum, candidate) => sum + coordinate(candidate), 0) / last.items.length;
    }
  }
  return clusters;
}

function nativeSource(image = {}, atom = {}, understanding = {}, detector, extra = {}) {
  return {
    editable: true,
    nativeRebuild: true,
    detector,
    layerSourceId: image.id || null,
    layerType: "diagram-zone",
    atomId: atom.id || null,
    atomKind: atom.kind || null,
    relationshipArchetype: understanding.archetype || null,
    confidence: atom.density ?? understanding.confidence ?? null,
    ...extra
  };
}

function validBox(value) {
  if (!value || typeof value !== "object") return null;
  const box = { x: Number(value.x), y: Number(value.y), w: Number(value.w), h: Number(value.h) };
  if (![box.x, box.y, box.w, box.h].every(Number.isFinite)) return null;
  if (box.w <= 0 || box.h <= 0 || Math.max(Math.abs(box.x), Math.abs(box.y), box.w, box.h) > 1e7) return null;
  return box;
}

function containsBox(outer = {}, inner = {}, padding = 0) {
  return inner.x >= outer.x - padding
    && inner.y >= outer.y - padding
    && inner.x + inner.w <= outer.x + outer.w + padding
    && inner.y + inner.h <= outer.y + outer.h + padding;
}

function boxArea(box = {}) {
  return Math.max(0, Number(box.w || 0)) * Math.max(0, Number(box.h || 0));
}

function intersectionArea(left = {}, right = {}) {
  const width = Math.max(0, Math.min(Number(left.x || 0) + Number(left.w || 0), Number(right.x || 0) + Number(right.w || 0))
    - Math.max(Number(left.x || 0), Number(right.x || 0)));
  const height = Math.max(0, Math.min(Number(left.y || 0) + Number(left.h || 0), Number(right.y || 0) + Number(right.h || 0))
    - Math.max(Number(left.y || 0), Number(right.y || 0)));
  return width * height;
}

function median(values = []) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function spread(values = []) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length > 1 ? Math.max(...finite) - Math.min(...finite) : 0;
}

function roundedBox(box = {}) {
  return { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) };
}

function safeColor(value, fallback) {
  const text = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toUpperCase() : fallback;
}

function safeId(value) {
  const text = String(value || "layer").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
  return text.slice(0, 96) || "layer";
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

module.exports = {
  createRelationshipNativeShell,
  _private: { attachSankeyBand, clusterSwimlaneNodes, cycleAngularCoverage, cycleLoopSegments, dominantFlowNodes, dominantRectNodes, funnelLensNodes, isSafeConcentricLayerSequence, isSafeFishbone, isSafeHorizontalFlow, isSafeLayeredStack, isSafeSwimlaneLanes, isSafeTopologyLayout, isSafeTreeStructure, layeredStackNodes, matchFlowBridges, sankeyNodes, topologyNodes, validBox, validSankeyBand }
};
