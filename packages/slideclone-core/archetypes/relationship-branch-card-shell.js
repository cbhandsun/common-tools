"use strict";

const { validBox, boxCenter } = require("./relationship-native-geometry");
const { branchCardNodeShape, branchCardCurveShape } = require("./relationship-native-shapes");
const { measureBranchCurvesFromAnchors } = require("./pixel-branch-curve-detector");
const {
  topologyNodes,
  isIgnorableContainedFragment,
  isIgnorableTopologyLineFragment,
  isTopologyCompositeAggregate
} = require("./relationship-topology-helpers");

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

module.exports = {
  unresolvedCurvedBranchResult,
  hasUnresolvedCurvedBranchTopology,
  oneSidedBranchDirection,
  createBranchCardFlowShell,
  orderBranchTargets,
  validPixelImage,
  validSlideSize
};
