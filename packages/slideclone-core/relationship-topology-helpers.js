"use strict";

const { validBox, boxCenter, boxArea, containsBox } = require("./relationship-native-geometry");

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

function isIgnorableContainedFragment(atom = {}, nodes = [], layerBox = {}) {
  if (!validBox(atom.box) || atom.residualCandidate === true) return false;
  const layerArea = boxArea(layerBox);
  return boxArea(atom.box) <= layerArea * 0.0015
    && nodes.some((node) => containsBox(node.box, atom.box, 2) && boxArea(atom.box) <= boxArea(node.box) * 0.22);
}

module.exports = {
  topologyNodes,
  augmentTopologyAxisConnectors,
  nearestTopologyNode,
  distancePointToBox,
  measuredTopologyConnector,
  isIgnorableTopologyLineFragment,
  isTopologyCompositeAggregate,
  topologyConnectorEndpoints,
  distancePointToSegment,
  pointInsideBox,
  isConnectedTopology,
  isSafeTopologyLayout,
  isIgnorableContainedFragment
};
