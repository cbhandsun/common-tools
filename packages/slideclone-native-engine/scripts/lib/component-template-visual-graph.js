"use strict";

const {
  angleAround,
  boxCenter,
  boxOverlapArea,
  clampBox,
  clampInteger,
  isInsideUnitBox,
  isUsefulTemplateNodeBox,
  scaleRelativeBox
} = require("./component-template-geometry");
const { safeText } = require("./component-template-sanitizers");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function treeVisualNodes(image = {}, targetBox = {}, slideSize = DEFAULT_SLIDE) {
  const understanding = image?.source?.layer?.diagramUnderstanding || {};
  const rawNodes = Array.isArray(understanding.visualNodes) ? understanding.visualNodes : [];
  const candidates = rawNodes
    .map((node, index) => {
      const box = normalizeVisualNodeBox(node, targetBox, slideSize);
      if (!box || !isUsefulTemplateNodeBox(box, targetBox)) return null;
      return { id: node?.id || node?.nodeId || `visual-node-${index}`, box };
    })
    .filter(Boolean);
  const deduped = [];
  for (const node of candidates) {
    if (deduped.some((existing) => boxOverlapArea(existing.box, node.box) / Math.max(1, Math.min(existing.box.w * existing.box.h, node.box.w * node.box.h)) > 0.72)) {
      continue;
    }
    deduped.push(node);
  }
  return deduped;
}

function visualConnectorsBetweenNodes(image = {}, nodes = [], options = {}) {
  const understanding = image?.source?.layer?.diagramUnderstanding || {};
  const rawConnectors = Array.isArray(understanding.visualConnectors) ? understanding.visualConnectors : [];
  if (rawConnectors.length === 0 || nodes.length < 2) return [];
  const byId = new Map(nodes.map((node, index) => [String(node.id), { node, index }]));
  const max = clampInteger(options.max || rawConnectors.length, 1, 64);
  const result = [];
  const seen = new Set();
  for (const connector of rawConnectors) {
    const fromId = visualConnectorEndpointId(connector, ["from", "fromNodeId", "source", "sourceNodeId", "start", "startNodeId"]);
    const toId = visualConnectorEndpointId(connector, ["to", "toNodeId", "target", "targetNodeId", "end", "endNodeId"]);
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to || from.node.id === to.node.id) continue;
    const key = `${from.node.id}->${to.node.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: safeText(connector.id || connector.atomId || key),
      from: from.node,
      to: to.node,
      fromIndex: from.index,
      toIndex: to.index,
      axis: safeText(connector.axis),
      arrow: connector.arrow === true
    });
    if (result.length >= max) break;
  }
  return result;
}

function visualConnectorEndpointId(connector = {}, keys = []) {
  for (const key of keys) {
    const value = connector?.[key];
    if (value === null || value === undefined) continue;
    const text = String(value);
    if (text) return text;
  }
  return "";
}

function visualConnectorDegreeCenter(image = {}, nodes = []) {
  const edges = visualConnectorsBetweenNodes(image, nodes, { max: 64 });
  if (edges.length === 0) return null;
  const degree = new Map();
  edges.forEach((edge) => {
    degree.set(edge.from.id, (degree.get(edge.from.id) || 0) + 1);
    degree.set(edge.to.id, (degree.get(edge.to.id) || 0) + 1);
  });
  return nodes.reduce((best, node) => {
    const score = degree.get(node.id) || 0;
    if (!best || score > best.score) return { node, score };
    return best;
  }, null)?.score >= 2
    ? nodes.find((node) => node.id === Array.from(degree.entries()).sort((a, b) => b[1] - a[1])[0]?.[0])
    : null;
}

function visualCycleNodeOrder(image = {}, nodes = [], centerPoint = {}) {
  if (nodes.length < 3) return null;
  const edges = visualConnectorsBetweenNodes(image, nodes, { max: 32 });
  if (edges.length < Math.max(2, nodes.length - 1)) return null;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nextById = new Map();
  const incoming = new Map();
  for (const edge of edges) {
    if (!nodeIds.has(edge.from.id) || !nodeIds.has(edge.to.id)) continue;
    if (nextById.has(edge.from.id)) continue;
    nextById.set(edge.from.id, edge);
    incoming.set(edge.to.id, (incoming.get(edge.to.id) || 0) + 1);
  }
  if (nextById.size < Math.max(2, nodes.length - 1)) return null;
  const orderedByPosition = nodes
    .slice()
    .sort((a, b) => angleAround(centerPoint, boxCenter(a.box)) - angleAround(centerPoint, boxCenter(b.box)));
  const start = orderedByPosition.find((node) => !incoming.has(node.id)) || orderedByPosition[0];
  const ordered = [];
  const edgeByNodeId = new Map();
  const seen = new Set();
  let current = start;
  for (let guard = 0; guard < nodes.length; guard += 1) {
    if (!current || seen.has(current.id)) break;
    ordered.push(current);
    seen.add(current.id);
    const edge = nextById.get(current.id);
    if (!edge) break;
    edgeByNodeId.set(current.id, edge);
    current = edge.to;
  }
  if (ordered.length < 3) return null;
  for (const node of orderedByPosition) {
    if (!seen.has(node.id)) ordered.push(node);
  }
  return { nodes: ordered, edgeByNodeId };
}

function normalizeVisualNodeBox(node = {}, targetBox = {}, slideSize = DEFAULT_SLIDE) {
  const sourceBox = node?.box || node?.bounds || node?.rect || node?.bbox || null;
  if (!sourceBox || typeof sourceBox !== "object") return null;
  const rawBox = {
    x: Number(sourceBox.x),
    y: Number(sourceBox.y),
    w: Number(sourceBox.w ?? sourceBox.width),
    h: Number(sourceBox.h ?? sourceBox.height)
  };
  if (![rawBox.x, rawBox.y, rawBox.w, rawBox.h].every(Number.isFinite) || rawBox.w <= 0 || rawBox.h <= 0) {
    return null;
  }
  const absolute = isInsideUnitBox(rawBox) ? scaleRelativeBox(rawBox, targetBox, slideSize) : clampBox(rawBox, slideSize);
  if (!absolute) return null;
  const overlap = boxOverlapArea(absolute, targetBox);
  const area = Math.max(1, absolute.w * absolute.h);
  return overlap / area >= 0.45 ? absolute : null;
}

module.exports = {
  normalizeVisualNodeBox,
  treeVisualNodes,
  visualConnectorDegreeCenter,
  visualConnectorEndpointId,
  visualConnectorsBetweenNodes,
  visualCycleNodeOrder
};
