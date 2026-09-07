"use strict";
const {safeComponentToken} = require("./diagram-residual-crops");
const {visualAtomMinimumUnitGroupId} = require("./visual-atom-component-grouping");

function annotateVisualAtomComponentShape(shape = {}, image = {}, atom = {}, understanding = {}) {
  if (!shape?.source) return shape;
  const archetype = safeComponentToken(understanding.archetype || image?.source?.layer?.diagramUnderstanding?.archetype || "visual-atom");
  const layerId = safeComponentToken(image.id || shape.source.layerSourceId || "layer");
  const groupId = visualAtomMinimumUnitGroupId({ layerId, archetype, atom, shape });
  const part = visualAtomComponentPart(shape, atom, understanding);
  return {
    ...shape,
    source: {
      ...shape.source,
      nativeComponentGroupId: groupId,
      nativeComponentArchetype: archetype,
      nativeComponentPart: part,
      nativeComponentRole: part,
      nativeComponentAtomId: atom.id || shape.source.atomId || null
    }
  };
}

function finalizeNativeComponentGroupMetadata(shapes = []) {
  const groups = new Map();
  for (const shape of Array.isArray(shapes) ? shapes : []) {
    const groupId = String(shape?.source?.nativeComponentGroupId || "");
    if (!groupId || !shape?.box) continue;
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(shape);
  }
  if (groups.size === 0) return shapes;
  const groupMeta = new Map();
  for (const [groupId, groupShapes] of groups.entries()) {
    const bounds = unionBoxes(groupShapes.map((shape) => shape.box));
    groupMeta.set(groupId, {
      bounds,
      partCount: groupShapes.length,
      archetype: safeComponentToken(groupShapes[0]?.source?.nativeComponentArchetype || "visual-component")
    });
  }
  const groupIndexes = new Map();
  return shapes.map((shape) => {
    const groupId = String(shape?.source?.nativeComponentGroupId || "");
    const meta = groupMeta.get(groupId);
    if (!meta || !shape?.source) return shape;
    const index = (groupIndexes.get(groupId) || 0) + 1;
    groupIndexes.set(groupId, index);
    return {
      ...shape,
      source: {
        ...shape.source,
        nativeComponentInstance: true,
        nativeComponentMinimumUnit: "semantic-component",
        nativeComponentBounds: meta.bounds,
        nativeComponentPartIndex: index,
        nativeComponentPartCount: meta.partCount,
        nativeComponentReplacementEligible: meta.partCount > 1,
        nativeComponentReplacementKey: `${groupId}:${meta.archetype}:${meta.partCount}`
      }
    };
  });
}

function visualAtomComponentPart(shape = {}, atom = {}, understanding = {}) {
  const detector = String(shape?.source?.detector || "");
  const archetype = String(understanding?.archetype || "");
  const shapePart = String(shape?.source?.part || "");
  const semanticRole = String(atom?.semanticRole || "");
  if (semanticRole === "legend-marker" || detector === "visual-atom-native-legend-marker") return "legend-marker";
  if (/chart/.test(archetype)) {
    if (detector === "visual-atom-native-connector") {
      if (shape?.source?.axis === "diagonal" || /line-chart/.test(archetype)) return "series-line";
      return "axis-line";
    }
    if (detector === "visual-chart-native-axis") return "axis-line";
    if (detector === "visual-chart-native-line-segment") return "series-line";
    if (detector === "visual-chart-native-line-point") return "series-point";
    if (detector === "visual-chart-native-scatter-point") return "series-point";
    if (detector === "visual-chart-native-bar") return "series-bar";
    if (detector === "visual-chart-native-donut") return "series-ring";
    if (detector === "visual-chart-native-donut-segment") return "series-ring-segment";
    if (detector === "visual-chart-native-pie-segment") return "series-pie-segment";
    if (detector === "visual-atom-native-scatter-point") return "series-point";
    if (detector === "visual-atom-native-rect") return "series-bar";
    if (detector === "visual-atom-native-donut") return "series-ring";
    if (detector === "visual-atom-native-donut-segment") return "series-ring-segment";
    if (detector === "visual-atom-native-pie-segment") return "series-pie-segment";
  }
  if (detector === "visual-atom-native-timeline") {
    if (shapePart === "axis") return "timeline-axis";
    if (shapePart === "milestone") return "timeline-milestone";
  }
  if (detector === "visual-atom-native-arc-arrow-segment") {
    if (shapePart === "arrowhead") return "cycle-arrowhead";
    return "cycle-arc";
  }
  if (detector === "visual-atom-native-connector") return "connector";
  if (/visual-atom-native-(?:rect|ellipse|diamond|triangle|chevron|parallelogram|cylinder|cloud|document|screen|phone|funnel|cycle-arrow|return-loop)/.test(detector)) {
    return "node";
  }
  return "detail";
}

function unionBoxes(boxes = []) {
  const valid = boxes
    .filter(Boolean)
    .map((box) => ({
      x: Number(box.x || 0),
      y: Number(box.y || 0),
      w: Math.max(0, Number(box.w || 0)),
      h: Math.max(0, Number(box.h || 0))
    }))
    .filter((box) => box.w > 0 || box.h > 0);
  if (valid.length === 0) return null;
  const minX = Math.min(...valid.map((box) => box.x));
  const minY = Math.min(...valid.map((box) => box.y));
  const maxX = Math.max(...valid.map((box) => box.x + box.w));
  const maxY = Math.max(...valid.map((box) => box.y + box.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

module.exports = { annotateVisualAtomComponentShape, visualAtomComponentPart, finalizeNativeComponentGroupMetadata, unionBoxes };
