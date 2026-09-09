"use strict";
const { validBox, boxCenter, boxArea, intersectionArea, safeColor, containsBox, spread } = require("./relationship-native-geometry");
const { funnelLensNodeShape, funnelLensConnectorShape, funnelLensFocusShapes } = require("./relationship-native-shapes");
const { distancePointToBox, measuredTopologyConnector, topologyConnectorEndpoints } = require("./relationship-topology-helpers");

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

module.exports = {
  createFunnelLensFlowShell,
  funnelLensNodes,
  isIgnorableFunnelLensFragment,
  isIgnorableFunnelLensLineArtifact,
  augmentFunnelLensAxisConnectors
};
