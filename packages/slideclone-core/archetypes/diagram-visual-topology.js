"use strict";

const { average, boxArea, centerOf, distance, distanceToCentroid, overlapRatio } = require("./diagram-geometry");

function textBoxesInside(textBoxes, regionBox = {}) {
  return (textBoxes || [])
    .filter((item) => item?.box && overlapRatio(item.box, regionBox) >= 0.55)
    .map((item, index) => ({
      id: item.id || `text-${index}`,
      text: String(item.text || "").trim(),
      box: item.box,
      role: item.role || null
    }))
    .filter((item) => item.text);
}

function inferNodes(textBoxes, regionBox = {}) {
  const regionArea = Math.max(1, Number(regionBox.w || 0) * Number(regionBox.h || 0));
  return textBoxes
    .filter((item) => {
      const box = item.box || {};
      const areaRatio = Number(box.w || 0) * Number(box.h || 0) / regionArea;
      const aspect = Number(box.h || 0) ? Number(box.w || 0) / Number(box.h || 1) : 1;
      return areaRatio >= 0.002 && areaRatio <= 0.22 && aspect >= 0.35 && aspect <= 8;
    })
    .map((item, index) => ({
      id: `node-${index + 1}`,
      text: item.text,
      sourceTextBoxId: item.id,
      box: item.box,
      center: centerOf(item.box),
      kind: inferNodeKind(item)
    }));
}

function inferNodeKind(item) {
  const text = String(item.text || "").toLowerCase();
  if (/截图|页面|界面|screen|ui|web|app|prd|文档/.test(text)) return "screenshot-or-document-node";
  if (/输入|输出|input|output|产出|生成/.test(text)) return "io-node";
  if (/审批|风险|通过|驳回|检查|评审|review|risk|approved/.test(text)) return "decision-node";
  return "process-node";
}

function inferVisualAtomNodes(visualAtoms = []) {
  const candidates = (visualAtoms || [])
    .filter((atom) => [
      "native-rect-candidate",
      "native-ellipse-candidate",
      "native-diamond-candidate",
      "native-triangle-candidate",
      "native-chevron-candidate",
      "native-parallelogram-candidate",
      "native-cylinder-candidate",
      "native-cloud-candidate",
      "native-document-candidate",
      "native-screen-candidate",
      "native-phone-candidate",
      "native-person-candidate",
      "native-team-candidate",
      "native-search-candidate",
      "native-timeline-candidate",
      "native-funnel-candidate",
      "native-donut-candidate",
      "native-donut-segment-candidate",
      "native-pie-segment-candidate",
      "native-concentric-circle-candidate",
      "native-quadrant-panel-candidate",
      "native-venn-ellipse-candidate",
      "native-scatter-point-candidate",
      "native-cycle-arrow-candidate"
    ].includes(atom?.kind) && atom.box);
  return candidates
    .filter((atom) => !isContainedDensityPeakAtom(atom, candidates))
    .map((atom, index) => ({
      id: `visual-node-${index + 1}`,
      atomId: atom.id || null,
      kind: atom.kind === "native-diamond-candidate" ? "decision-node" : "process-node",
      shapeHint: atom.shapeHint || null,
      box: atom.box,
      center: centerOf(atom.box),
      color: atom.color || null,
      confidence: atom.density ?? null
    }))
    .sort((a, b) => a.center.y - b.center.y || a.center.x - b.center.x);
}

function isContainedDensityPeakAtom(atom, candidates = []) {
  if (String(atom?.source?.detector || "") !== "dense-linked-node-visual-atom" || !atom?.box) return false;
  const atomArea = boxArea(atom.box);
  return candidates.some((candidate) => candidate !== atom
    && candidate?.box
    && boxArea(candidate.box) >= atomArea * 4
    && containsBox(candidate.box, atom.box, 1));
}

function inferVisualAtomConnectors(visualAtoms = [], visualNodes = []) {
  if (visualNodes.length < 2) return [];
  const connectors = (visualAtoms || [])
    .filter((atom) => (atom?.kind === "connector-line-candidate" || atom?.kind === "connector-arrow-candidate") && atom.box)
    .map((atom, index) => inferVisualAtomConnector(atom, visualNodes, index))
    .filter(Boolean);
  const byEdge = new Map();
  for (const connector of connectors) {
    const edge = [connector.fromAtomId || connector.from, connector.toAtomId || connector.to].sort().join(":");
    const current = byEdge.get(edge);
    if (!current || visualConnectorEvidenceScore(connector, visualAtoms) > visualConnectorEvidenceScore(current, visualAtoms)) byEdge.set(edge, connector);
  }
  return [...byEdge.values()];
}

function visualConnectorEvidenceScore(connector, visualAtoms = []) {
  const atom = visualAtoms.find((candidate) => candidate?.id === connector?.atomId) || {};
  const length = Math.hypot(Number(atom.box?.w || 0), Number(atom.box?.h || 0));
  return (connector?.arrow ? 1000 : 0)
    + (connector?.axis === "diagonal" ? 100 : 0)
    + Math.min(90, length)
    + Math.max(0, Math.min(1, Number(connector?.confidence || 0)));
}

function inferVisualAtomConnector(atom, visualNodes, index) {
  const box = atom.box || {};
  if (isCompositeConnectorAggregate(atom, visualNodes)) return null;
  const measuredFrom = validPoint(atom?.lineEndpoints?.from);
  const measuredTo = validPoint(atom?.lineEndpoints?.to);
  const measuredDx = measuredFrom && measuredTo ? Math.abs(measuredTo.x - measuredFrom.x) : 0;
  const measuredDy = measuredFrom && measuredTo ? Math.abs(measuredTo.y - measuredFrom.y) : 0;
  const measuredLength = Math.hypot(measuredDx, measuredDy);
  if (measuredFrom && measuredTo
    && String(atom?.shapeHint || "") === "line-diagonal"
    && measuredDx >= Math.max(3, measuredLength * 0.12)
    && measuredDy >= Math.max(3, measuredLength * 0.12)) {
    const from = nearestVisualNodeToEndpoint(measuredFrom, visualNodes);
    const to = nearestVisualNodeToEndpoint(measuredTo, visualNodes, from?.id);
    if (!from || !to || from.id === to.id) return null;
    const dx = Math.abs(measuredTo.x - measuredFrom.x);
    const dy = Math.abs(measuredTo.y - measuredFrom.y);
    return {
      id: `visual-connector-${index + 1}`,
      atomId: atom.id || null,
      from: from.id,
      to: to.id,
      fromAtomId: from.atomId,
      toAtomId: to.atomId,
      axis: dx > dy * 2.5 ? "horizontal" : dy > dx * 2.5 ? "vertical" : "diagonal",
      arrow: atom.kind === "connector-arrow-candidate" || /^arrow-/.test(String(atom.shapeHint || "")),
      confidence: atom.density ?? null
    };
  }
  const horizontal = Number(box.w || 0) >= Number(box.h || 0);
  const fromPoint = horizontal
    ? { x: Number(box.x || 0), y: Number(box.y || 0) + Number(box.h || 0) / 2 }
    : { x: Number(box.x || 0) + Number(box.w || 0) / 2, y: Number(box.y || 0) };
  const toPoint = horizontal
    ? { x: Number(box.x || 0) + Number(box.w || 0), y: Number(box.y || 0) + Number(box.h || 0) / 2 }
    : { x: Number(box.x || 0) + Number(box.w || 0) / 2, y: Number(box.y || 0) + Number(box.h || 0) };
  const from = nearestVisualNode(fromPoint, visualNodes, horizontal ? "right" : "down");
  const to = nearestVisualNode(toPoint, visualNodes, horizontal ? "left" : "up");
  if (!from || !to || from.id === to.id) return null;
  return {
    id: `visual-connector-${index + 1}`,
    atomId: atom.id || null,
    from: from.id,
    to: to.id,
    fromAtomId: from.atomId,
    toAtomId: to.atomId,
    axis: horizontal ? "horizontal" : "vertical",
    arrow: atom.kind === "connector-arrow-candidate" || /^arrow-/.test(String(atom.shapeHint || "")),
    confidence: atom.density ?? null
  };
}

function isCompositeConnectorAggregate(atom, visualNodes = []) {
  if (!atom?.box || Number(atom.density || 0) < 0.1) return false;
  const containedCenters = visualNodes.filter((node) => node?.center && pointInsideBox(node.center, atom.box, 1)).length;
  return containedCenters >= 2 && Number(atom.box.w || 0) >= 40 && Number(atom.box.h || 0) >= 40;
}

function pointInsideBox(point, box, padding = 0) {
  return Number(point.x || 0) >= Number(box.x || 0) - padding
    && Number(point.y || 0) >= Number(box.y || 0) - padding
    && Number(point.x || 0) <= Number(box.x || 0) + Number(box.w || 0) + padding
    && Number(point.y || 0) <= Number(box.y || 0) + Number(box.h || 0) + padding;
}

function containsBox(outer, inner, padding = 0) {
  return Number(inner.x || 0) >= Number(outer.x || 0) - padding
    && Number(inner.y || 0) >= Number(outer.y || 0) - padding
    && Number(inner.x || 0) + Number(inner.w || 0) <= Number(outer.x || 0) + Number(outer.w || 0) + padding
    && Number(inner.y || 0) + Number(inner.h || 0) <= Number(outer.y || 0) + Number(outer.h || 0) + padding;
}

function nearestVisualNodeToEndpoint(point, visualNodes, excludedId = null) {
  const scored = visualNodes
    .filter((node) => node?.id !== excludedId && node?.box)
    .map((node) => ({ node, distance: distancePointToBox(point, node.box) }))
    .sort((left, right) => left.distance - right.distance);
  const best = scored[0];
  return best && best.distance <= 140 ? best.node : null;
}

function distancePointToBox(point, box) {
  const x = Math.max(Number(box.x || 0), Math.min(Number(point.x || 0), Number(box.x || 0) + Number(box.w || 0)));
  const y = Math.max(Number(box.y || 0), Math.min(Number(point.y || 0), Number(box.y || 0) + Number(box.h || 0)));
  return Math.hypot(Number(point.x || 0) - x, Number(point.y || 0) - y);
}

function validPoint(value) {
  if (!value || typeof value !== "object") return null;
  const point = { x: Number(value.x), y: Number(value.y) };
  return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
}

function nearestVisualNode(point, visualNodes, side) {
  const scored = visualNodes
    .map((node) => {
      const box = node.box || {};
      const target = side === "right"
        ? { x: Number(box.x || 0) + Number(box.w || 0), y: node.center.y }
        : side === "left"
          ? { x: Number(box.x || 0), y: node.center.y }
          : side === "down"
            ? { x: node.center.x, y: Number(box.y || 0) + Number(box.h || 0) }
            : { x: node.center.x, y: Number(box.y || 0) };
      return { node, distance: distance(point, target) };
    })
    .sort((a, b) => a.distance - b.distance);
  const best = scored[0];
  return best && best.distance <= 140 ? best.node : null;
}

function clusterVisualNodesByAxis(nodes = [], axis, tolerance) {
  const coordinate = axis === "x" ? "x" : "y";
  const clusters = [];
  for (const node of [...nodes].sort((a, b) => a.center[coordinate] - b.center[coordinate])) {
    const value = node.center[coordinate];
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(value - last.center) > tolerance) {
      clusters.push({ nodes: [node], center: value });
    } else {
      last.nodes.push(node);
      last.center = average(last.nodes.map((item) => item.center[coordinate]));
    }
  }
  return clusters;
}

function clusterNumbers(values = [], tolerance = 1) {
  const clusters = [];
  for (const value of values.map(Number).filter(Number.isFinite).sort((a, b) => a - b)) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(value - last.center) > tolerance) {
      clusters.push({ values: [value], center: value });
    } else {
      last.values.push(value);
      last.center = average(last.values);
    }
  }
  return clusters;
}

function inferConnectors(archetype, nodes, visualAtoms = []) {
  const lineAtoms = visualAtoms.filter((atom) => atom.kind === "connector-line-candidate" || atom.kind === "connector-arrow-candidate");
  if (nodes.length < 2) return [];
  if (archetype === "flow-card-chain" || archetype === "process-with-screenshots") {
    const sorted = [...nodes].sort((a, b) => a.center.x - b.center.x || a.center.y - b.center.y);
    return sorted.slice(0, -1).map((node, index) => ({
      ...connector(node, sorted[index + 1], "sequence"),
      visualEvidence: lineAtoms[index]?.id || null
    }));
  }
  if (archetype === "hub-spoke") {
    const hub = [...nodes].sort((a, b) => distanceToCentroid(a, nodes) - distanceToCentroid(b, nodes))[0];
    return nodes.filter((node) => node !== hub).map((node) => connector(hub, node, "radial"));
  }
  if (archetype === "tree-structure" || archetype === "swimlane-flow" || archetype === "bar-chart" || archetype === "scatter-chart") return [];
  if (archetype === "matrix-or-grid" || archetype === "comparison-matrix") return [];
  return nearestNeighborConnectors(nodes).slice(0, Math.max(0, nodes.length - 1));
}

function nearestNeighborConnectors(nodes) {
  const result = [];
  const sorted = [...nodes].sort((a, b) => a.center.x - b.center.x || a.center.y - b.center.y);
  for (let index = 0; index < sorted.length - 1; index += 1) {
    result.push(connector(sorted[index], sorted[index + 1], "proximity"));
  }
  return result;
}

function connector(from, to, kind) {
  return {
    id: `${from.id}->${to.id}`,
    from: from.id,
    to: to.id,
    kind,
    fromPoint: from.center,
    toPoint: to.center,
    direction: Math.abs(to.center.x - from.center.x) >= Math.abs(to.center.y - from.center.y)
      ? (to.center.x >= from.center.x ? "right" : "left")
      : (to.center.y >= from.center.y ? "down" : "up")
  };
}

module.exports = {
  textBoxesInside,
  inferNodes,
  inferNodeKind,
  inferVisualAtomNodes,
  isContainedDensityPeakAtom,
  inferVisualAtomConnectors,
  visualConnectorEvidenceScore,
  inferVisualAtomConnector,
  isCompositeConnectorAggregate,
  pointInsideBox,
  containsBox,
  nearestVisualNodeToEndpoint,
  distancePointToBox,
  validPoint,
  nearestVisualNode,
  clusterVisualNodesByAxis,
  clusterNumbers,
  inferConnectors,
  nearestNeighborConnectors,
  connector
};
