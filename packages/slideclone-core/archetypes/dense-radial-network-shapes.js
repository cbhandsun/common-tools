"use strict";

function createDenseRadialNetworkShapeToolkit(operations = {}) {
  const ops = validateOperations(operations);

  function createDetailedShapes(image = {}, network = {}, searchBox = null) {
    if (!validPoint(network?.center)) return [];
    const base = safeId(image?.id, "dense-radial-network");
    const nodes = validNodes(network.nodes)
      .map((node) => ({ ...node, color: ops.normalizeHex(node.color, "#2378D4") }))
      .sort((left, right) => radialNodeSortKey(left, network.center) - radialNodeSortKey(right, network.center))
      .slice(0, 128);
    const source = (detector, extra = {}) => ({
      editable: true,
      nativeRebuild: true,
      detector,
      layerSourceId: typeof image?.id === "string" ? image.id : null,
      expressionForm: "complex-diagram",
      expressionSubtype: "dense-radial-network-component",
      componentOwner: "dense-radial-network",
      ...extra
    });
    const rays = nodes.map((node, index) => ({
      id: `${base}-native-dense-component-ray-${index}`,
      type: "line",
      box: {
        x: ops.round(network.center.x),
        y: ops.round(network.center.y),
        w: ops.round(node.center.x - network.center.x),
        h: ops.round(node.center.y - network.center.y)
      },
      style: { stroke: node.color, strokeWidthPt: 0.72, connectorType: "straight", opacity: 0.72 },
      source: source("network-diagram-native-dense-component-ray", { nodeIndex: index })
    }));
    const nodeShapes = nodes.map((node, index) => {
      const side = ops.clamp(Math.max(Number(node.box?.w || 7), Number(node.box?.h || 7)), 6.5, 10.5);
      return {
        id: `${base}-native-dense-component-node-${index}`,
        type: "rect",
        box: ops.roundedBox({ x: node.center.x - side / 2, y: node.center.y - side / 2, w: side, h: side }),
        style: { fill: node.color, stroke: node.color, strokeWidthPt: 0, opacity: 0.95 },
        source: source("network-diagram-native-dense-component-node", { nodeIndex: index })
      };
    });
    return [...rays, ...nodeShapes, ...optionalShapes(ops.createSearchShapes, image, searchBox), ...safeShapes(ops.createCenterShapes(image, network))];
  }

  function createSummaryShapes(image = {}, network = {}, searchBox = null) {
    const center = validPoint(network?.center) ? network.center : centerOfBox(image?.box);
    if (!center) return [];
    const base = safeId(image?.id, "dense-radial-network");
    const sectors = summarizeSectors(network?.nodes, center);
    const source = (detector, extra = {}) => ({
      editable: true,
      nativeRebuild: true,
      detector,
      layerSourceId: typeof image?.id === "string" ? image.id : null,
      expressionForm: "complex-diagram",
      expressionSubtype: "dense-radial-network-summary",
      componentSummary: true,
      ...extra
    });
    const fans = sectors.map((sector, index) => ({
      id: `${base}-native-summary-fan-${index}`,
      type: "line",
      box: { x: ops.round(center.x), y: ops.round(center.y), w: ops.round(sector.end.x - center.x), h: ops.round(sector.end.y - center.y) },
      style: {
        stroke: sector.color,
        strokeWidthPt: ops.clamp(1.1 + sector.count * 0.045, 1.6, 4.8),
        connectorType: "straight",
        lineCap: "round",
        opacity: 0.58
      },
      source: source("network-diagram-native-summary-fan", { sectorIndex: index, summarizedNodeCount: sector.count })
    }));
    const nodes = sectors.map((sector, index) => ({
      id: `${base}-native-summary-node-${index}`,
      type: "rect",
      box: { x: ops.round(sector.end.x - 5.5), y: ops.round(sector.end.y - 5.5), w: 11, h: 11 },
      style: { fill: sector.color, stroke: "#FFFFFF", strokeWidthPt: 0.7, radiusRatio: 0.18, opacity: 0.9 },
      source: source("network-diagram-native-summary-node", { sectorIndex: index, summarizedNodeCount: sector.count })
    }));
    return [...fans, ...nodes, ...optionalShapes(ops.createSearchShapes, image, searchBox), ...safeShapes(ops.createCenterShapes(image, network))];
  }

  function summarizeSectors(nodes = [], center = {}) {
    if (!validPoint(center)) return [];
    const sectors = Array.from({ length: 12 }, (_, index) => ({ index, count: 0, x: 0, y: 0, colors: [] }));
    for (const node of validNodes(nodes).slice(0, 10000)) {
      const dx = node.center.x - center.x;
      const dy = node.center.y - center.y;
      if ((Math.abs(dx) + Math.abs(dy)) <= 0) continue;
      const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
      const sector = sectors[Math.min(11, Math.floor(angle / (Math.PI * 2 / 12)))];
      sector.count += 1;
      sector.x += node.center.x;
      sector.y += node.center.y;
      sector.colors.push(ops.hexToRgb(ops.normalizeHex(node.color, "#2378D4")));
    }
    return sectors.filter((sector) => sector.count > 0).map((sector) => ({
      index: sector.index,
      count: sector.count,
      end: { x: sector.x / sector.count, y: sector.y / sector.count },
      color: ops.rgbToHex(ops.averageColor(sector.colors) || sector.colors[0] || ops.hexToRgb("#2378D4"))
    }));
  }

  return Object.freeze({ createDetailedShapes, createSummaryShapes, summarizeSectors });
}

function validateOperations(operations) {
  if (!operations || typeof operations !== "object" || Array.isArray(operations)) throw new TypeError("dense radial network shape operations must be an object");
  const required = ["averageColor", "clamp", "createCenterShapes", "createSearchShapes", "hexToRgb", "normalizeHex", "rgbToHex", "round", "roundedBox"];
  for (const name of required) {
    if (typeof operations[name] !== "function") throw new TypeError(`dense radial network shape operation ${name} must be a function`);
  }
  return Object.freeze({ ...operations });
}

function validNodes(nodes) {
  return (Array.isArray(nodes) ? nodes : [])
    .filter((node) => validPoint(node?.center))
    .map((node) => ({ ...node, color: typeof node.color === "string" ? node.color : "#2378D4" }));
}

function radialNodeSortKey(node, center) {
  const dx = node.center.x - center.x;
  const dy = node.center.y - center.y;
  return ((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) * 10000 + Math.hypot(dx, dy);
}

function optionalShapes(create, image, value) {
  return value ? safeShapes(create(image, value)) : [];
}

function safeShapes(value) {
  return Array.isArray(value) ? value : [];
}

function validPoint(point) {
  return Boolean(point) && Number.isFinite(point.x) && Number.isFinite(point.y)
    && Math.abs(point.x) <= 100000 && Math.abs(point.y) <= 100000;
}

function centerOfBox(box) {
  if (!box || ![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.w <= 0 || box.h <= 0) return null;
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

function safeId(value, fallback) {
  return typeof value === "string" && /^[\w.-]{1,160}$/.test(value) ? value : fallback;
}

module.exports = { createDenseRadialNetworkShapeToolkit };
