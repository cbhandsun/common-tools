"use strict";

const MAX_OBJECTS = 100000;

function annotateSystemMapSemantics(layout = {}, slideSize = {}) {
  const normalized = validateLayout(layout);
  const slide = validateSlideSize(slideSize);
  const nodes = normalized.shapes.filter(isNodeCandidate);
  const connectors = normalized.shapes.filter(isConnectorCandidate);
  const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
  const linkedEdges = connectors.map((connector) => linkConnector(connector, nodes)).filter((edge) => edge.from || edge.to);
  const groups = connectedNodeGroups(nodes, linkedEdges);
  const nodeGroups = new Map();
  groups.forEach((group, index) => group.forEach((nodeId) => nodeGroups.set(nodeId, `system-map-group-${index + 1}`)));
  const legend = detectLegendEntries(nodes, normalized.textBoxes, linkedEdges, slide);
  const legendNodeIds = new Set(legend.map((entry) => entry.nodeId));
  const legendTextIds = new Set(legend.map((entry) => entry.textBoxId));
  const edgeById = new Map(linkedEdges.map((edge) => [edge.connectorId, edge]));
  const shapes = normalized.shapes.map((shape) => {
    const id = String(shape.id || "");
    if (nodeById.has(id)) {
      return withSemanticSource(shape, {
        systemMapSemanticRole: legendNodeIds.has(id) ? "legend-swatch" : "node",
        systemMapNodeGroupId: nodeGroups.get(id) || null
      });
    }
    const edge = edgeById.get(id);
    if (edge) {
      return withSemanticSource(shape, {
        systemMapSemanticRole: "connector",
        systemMapFromNodeId: edge.from,
        systemMapToNodeId: edge.to,
        systemMapNodeGroupId: edge.from ? nodeGroups.get(edge.from) || null : null
      });
    }
    return shape;
  });
  const textBoxes = normalized.textBoxes.map((textBox) => legendTextIds.has(String(textBox.id || ""))
    ? withSemanticSource(textBox, { systemMapSemanticRole: "legend-label" })
    : textBox);
  return Object.freeze({
    shapes,
    textBoxes,
    semantics: Object.freeze({
      nodeCount: nodes.length,
      connectorCount: linkedEdges.length,
      fullyLinkedConnectorCount: linkedEdges.filter((edge) => edge.from && edge.to).length,
      nodeGroupCount: groups.length,
      groups: groups.map((nodeIds, index) => Object.freeze({ id: `system-map-group-${index + 1}`, nodeIds })),
      legendCount: legend.length,
      legend
    })
  });
}

function isNodeCandidate(shape = {}) {
  const detector = String(shape?.source?.detector || "");
  if (/background|grid|mapping-line|search|edge|connector|rail-label|native-label/u.test(detector)) return false;
  if (/system-map.*(?:node|rail-module)/u.test(detector)) return validBox(shape.box);
  return false;
}

function isConnectorCandidate(shape = {}) {
  const detector = String(shape?.source?.detector || "");
  return validBox(shape.box) && (shape.type === "line" || /system-map.*(?:edge|connector)/u.test(detector));
}

function linkConnector(connector, nodes) {
  const box = connector.box;
  const horizontal = Number(box.w) >= Number(box.h);
  const endpoints = horizontal
    ? [{ x: box.x, y: box.y + box.h / 2 }, { x: box.x + box.w, y: box.y + box.h / 2 }]
    : [{ x: box.x + box.w / 2, y: box.y }, { x: box.x + box.w / 2, y: box.y + box.h }];
  const nearest = endpoints.map((point) => nearestNode(point, nodes, 9));
  return Object.freeze({
    connectorId: String(connector.id || ""),
    from: nearest[0]?.id || null,
    to: nearest[1]?.id || null
  });
}

function nearestNode(point, nodes, tolerance) {
  let selected = null;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    const distance = pointToBoxDistance(point, node.box);
    if (distance <= tolerance && distance < selectedDistance) {
      selected = { id: String(node.id), distance };
      selectedDistance = distance;
    }
  }
  return selected;
}

function connectedNodeGroups(nodes, edges) {
  const parents = new Map(nodes.map((node) => [String(node.id), String(node.id)]));
  const find = (id) => {
    let current = id;
    while (parents.get(current) !== current) current = parents.get(current);
    let next = id;
    while (parents.get(next) !== current) { const parent = parents.get(next); parents.set(next, current); next = parent; }
    return current;
  };
  const union = (a, b) => {
    if (!a || !b || !parents.has(a) || !parents.has(b)) return;
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parents.set(rootB, rootA);
  };
  edges.forEach((edge) => union(edge.from, edge.to));
  const grouped = new Map();
  for (const id of parents.keys()) {
    const root = find(id);
    const values = grouped.get(root) || [];
    values.push(id);
    grouped.set(root, values);
  }
  return [...grouped.values()].sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

function detectLegendEntries(nodes, textBoxes, edges, slide) {
  const connected = new Set(edges.flatMap((edge) => [edge.from, edge.to]).filter(Boolean));
  const entries = [];
  for (const node of nodes) {
    const id = String(node.id || "");
    const box = node.box;
    const small = box.w <= slide.widthPt * 0.035 && box.h <= slide.heightPt * 0.055;
    const outer = box.x <= slide.widthPt * 0.24 || box.x + box.w >= slide.widthPt * 0.76 || box.y + box.h >= slide.heightPt * 0.76;
    if (!small || !outer || connected.has(id)) continue;
    const label = textBoxes
      .filter((textBox) => validBox(textBox.box) && String(textBox.text || "").trim())
      .map((textBox) => ({ textBox, distance: boxGap(box, textBox.box) }))
      .filter((item) => item.distance <= 16)
      .sort((a, b) => a.distance - b.distance)[0]?.textBox;
    if (!label) continue;
    entries.push(Object.freeze({ nodeId: id, textBoxId: String(label.id || ""), label: String(label.text).trim().slice(0, 160) }));
  }
  return entries.slice(0, 64);
}

function pointToBoxDistance(point, box) {
  const dx = Math.max(Number(box.x) - point.x, 0, point.x - (Number(box.x) + Number(box.w)));
  const dy = Math.max(Number(box.y) - point.y, 0, point.y - (Number(box.y) + Number(box.h)));
  return Math.hypot(dx, dy);
}

function boxGap(a, b) {
  const dx = Math.max(Number(a.x) - (Number(b.x) + Number(b.w)), Number(b.x) - (Number(a.x) + Number(a.w)), 0);
  const dy = Math.max(Number(a.y) - (Number(b.y) + Number(b.h)), Number(b.y) - (Number(a.y) + Number(a.h)), 0);
  return Math.hypot(dx, dy);
}

function withSemanticSource(item, metadata) {
  return { ...item, source: { ...(item.source || {}), ...metadata } };
}

function validateLayout(layout) {
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) throw new TypeError("system map semantic layout must be an object");
  if (!Array.isArray(layout.shapes) || !Array.isArray(layout.textBoxes)) throw new TypeError("system map semantic collections must be arrays");
  if (layout.shapes.length > MAX_OBJECTS || layout.textBoxes.length > MAX_OBJECTS) throw new RangeError("system map semantic collections exceed the supported limit");
  return layout;
}

function validateSlideSize(slideSize) {
  const widthPt = Number(slideSize?.widthPt);
  const heightPt = Number(slideSize?.heightPt);
  if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt) || widthPt <= 0 || heightPt <= 0 || widthPt > 100000 || heightPt > 100000) {
    throw new TypeError("slide size must contain bounded positive widthPt and heightPt");
  }
  return { widthPt, heightPt };
}

function validBox(box) {
  return box && [box.x, box.y, box.w, box.h].every((value) => Number.isFinite(Number(value))) && Number(box.w) >= 0 && Number(box.h) >= 0;
}

module.exports = {
  annotateSystemMapSemantics,
  connectedNodeGroups,
  detectLegendEntries,
  isConnectorCandidate,
  isNodeCandidate,
  linkConnector
};
