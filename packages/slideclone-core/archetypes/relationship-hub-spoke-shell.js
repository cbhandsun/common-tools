"use strict";
const { validBox, boxCenter, boxArea } = require("./relationship-native-geometry");
const { hubSpokeNodeShape, hubSpokeConnectorShape } = require("./relationship-native-shapes");

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

function hubSpokeNodes(atoms = [], layerBox = {}) {
  const layerArea = boxArea(layerBox);
  return atoms.filter((atom) => ["native-rect-candidate", "native-ellipse-candidate"].includes(atom?.kind) && validBox(atom.box))
    .filter((atom) => {
      const aspect = atom.box.w / atom.box.h;
      return boxArea(atom.box) >= layerArea * 0.008 && atom.box.w >= 24 && atom.box.h >= 18 && aspect >= 0.55 && aspect <= 5;
    });
}

function radialAngle(hubBox, nodeBox) {
  const hub = boxCenter(hubBox);
  const node = boxCenter(nodeBox);
  return Math.atan2(node.y - hub.y, node.x - hub.x);
}

module.exports = {
  createHubSpokeShell,
  hubSpokeNodes,
  radialAngle
};
