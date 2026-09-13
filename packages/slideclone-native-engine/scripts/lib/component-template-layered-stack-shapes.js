"use strict";

const {
  boxCenter,
  boxOverlapArea,
  clampBox,
  clampInteger,
  isInsideUnitBox,
  lineBoxBetween,
  scaleRelativeBox
} = require("./component-template-geometry");
const { paletteFromMatch } = require("./component-template-palette");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function layeredStackShapes(image = {}, match = {}, slideSize = DEFAULT_SLIDE, deps = {}) {
  const box = deps.safeBox?.(image.box, slideSize);
  if (!box) return [];
  const palette = paletteFromMatch(match, {
    accents: ["#2F80ED", "#22A76B", "#F97316", "#64748B"],
    neutral: "#94A3B8",
    softFills: ["#EAF3FF", "#ECFDF5", "#FFF7ED", "#F8FAFC"]
  });
  const visualStack = layeredStackShapesFromVisualNodes(image, match, box, palette, slideSize, deps);
  if (visualStack.length > 0) return visualStack;
  const guidedStack = templateGuidedLayeredStackShapes(image, match, box, palette, slideSize, deps);
  if (guidedStack.length > 0) return guidedStack;
  const layerCount = clampInteger(match.childCount || match.shapeCount || image?.source?.layer?.diagramUnderstanding?.nodeCount || 4, 3, 7);
  const gap = Math.max(4, Math.min(10, box.h * 0.018));
  const layerH = (box.h - gap * (layerCount - 1)) / layerCount;
  const direction = layeredStackDirection(image, []);
  const shapes = [];
  for (let index = 0; index < layerCount; index += 1) {
    const t = layerCount <= 1 ? 0 : index / (layerCount - 1);
    const widthRatio = direction === "top-wide" ? 1 - t * 0.34 : 0.66 + t * 0.34;
    const layerW = Math.max(box.w * 0.42, box.w * widthRatio);
    const layerBox = clampBox({
      x: box.x + (box.w - layerW) / 2,
      y: box.y + index * (layerH + gap),
      w: layerW,
      h: layerH
    }, slideSize);
    shapes.push(layeredStackLayerShape(image, match, "layered-stack-layer", index, layerBox, palette, direction, true, {}, deps));
  }
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function templateGuidedLayeredStackShapes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE, deps = {}) {
  const layers = selectTemplateLayeredStackBoxes(match, targetBox, slideSize, deps);
  if (layers.length < 3) return [];
  const direction = layeredStackDirection(image, layers);
  const useTaperedFallback = layeredStackUsesTaperedLayers(image, layers);
  return layers.map((layer, index) => {
    const preferredType = deps.nativeTypeForTemplateStyle(layer.style, useTaperedFallback ? "freeform" : "roundRect");
    const fallbackStyle = {
      fill: palette.softFills?.[index % Math.max(1, palette.softFills.length)] || "#F8FAFC",
      stroke: palette.accents?.[index % Math.max(1, palette.accents.length)] || "#2F80ED",
      strokeWidthPt: 0.95,
      radiusRatio: preferredType === "freeform" ? 0 : 0.08,
      ...(preferredType === "freeform" ? { freeform: layeredStackFreeform(direction) } : {}),
      shadow: { color: "#1F2937", alpha: 0.07, blurPt: 3.5, distancePt: 0.9, angleDeg: 90 }
    };
    return deps.nativeShape(
      image,
      match,
      "layered-stack-layer",
      index,
      preferredType,
      layer.box,
      deps.mergeTemplateStyle(layer.style, fallbackStyle),
      {
        ...deps.templateGuidedChildSource(layer, "component-child-layout"),
        layeredStackIndex: index,
        layeredStackDirection: direction,
        layeredStackTapered: preferredType === "freeform",
        layeredStackSource: "plugin-child-layout"
      }
    );
  }).map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function selectTemplateLayeredStackBoxes(match = {}, targetBox = {}, slideSize = DEFAULT_SLIDE, deps = {}) {
  const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  const layers = children
    .map((child, index) => ({
      index,
      kind: String(child?.kind || ""),
      relativeBox: child?.box,
      box: scaleRelativeBox(child?.box, targetBox, slideSize),
      style: child?.style || {}
    }))
    .filter((child) => child.kind === "shape" && isInsideUnitBox(child.relativeBox))
    .filter((child) => !deps.isTemplateConnectorDecorationStyle(child.style))
    .filter((child) => isUsefulLayeredStackNodeBox(child.box, targetBox))
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
    .slice(0, 10);
  if (layers.length < 3) return [];
  const centers = layers.map((layer) => boxCenter(layer.box));
  const ySpread = Math.max(...centers.map((point) => point.y)) - Math.min(...centers.map((point) => point.y));
  const xSpread = Math.max(...centers.map((point) => point.x)) - Math.min(...centers.map((point) => point.x));
  const avgHeight = layers.reduce((sum, layer) => sum + Number(layer.box.h || 0), 0) / Math.max(1, layers.length);
  const widthTrend = layeredStackWidthTrend(layers);
  if (ySpread < Math.max(avgHeight * 1.8, Number(targetBox.h || 0) * 0.22)) return [];
  if (xSpread > Number(targetBox.w || 0) * 0.36 && widthTrend === "flat") return [];
  return layers;
}

function layeredStackWidthTrend(layers = []) {
  if (!Array.isArray(layers) || layers.length < 3) return "flat";
  const widths = layers.map((layer) => Number(layer.box?.w || 0)).filter(Number.isFinite);
  if (widths.length < 3) return "flat";
  const first = widths[0];
  const last = widths[widths.length - 1];
  if (first > last * 1.14) return "narrowing";
  if (last > first * 1.14) return "widening";
  return "flat";
}

function layeredStackShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE, deps = {}) {
  const nodes = layeredStackVisualNodes(image, targetBox, slideSize, deps)
    .slice()
    .sort((a, b) => boxCenter(a.box).y - boxCenter(b.box).y || boxCenter(a.box).x - boxCenter(b.box).x)
    .slice(0, 12);
  if (nodes.length < 3) return [];
  const totalNodeArea = nodes.reduce((sum, node) => sum + node.box.w * node.box.h, 0);
  const coverage = totalNodeArea / Math.max(1, targetBox.w * targetBox.h);
  if (coverage < 0.12) return [];
  const direction = layeredStackDirection(image, nodes);
  const useTapered = layeredStackUsesTaperedLayers(image, nodes);
  const shapes = nodes.map((node, index) => layeredStackLayerShape(
    image,
    match,
    "layered-stack-layer",
    index,
    node.box,
    palette,
    direction,
    useTapered,
    {
      sourceVisualNodeId: node.id,
      layoutPreservation: "visual-node"
    },
    deps
  ));
  const edges = deps.visualConnectorsBetweenNodes(image, nodes, { max: 18 });
  edges.forEach((edge, index) => {
    shapes.push(deps.nativeShape(image, match, "layered-stack-connector", index, "line", lineBoxBetween(edge.from.box, edge.to.box), {
      stroke: palette.neutral || "#94A3B8",
      strokeWidthPt: 1.05,
      connectorType: edge.axis === "horizontal" ? "straight" : "elbow",
      endArrow: edge.arrow === false ? "none" : "triangle"
    }, {
      ...deps.processConnectorMetadata(edge.fromIndex, edge.toIndex, edge.from.box, edge.to.box),
      connectorSemantic: "layered-stack",
      sourceVisualConnectorId: edge.id,
      sourceVisualNodeId: edge.to.id,
      layoutPreservation: "visual-node"
    }));
  });
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function layeredStackVisualNodes(image = {}, targetBox = {}, slideSize = DEFAULT_SLIDE, deps = {}) {
  const understanding = image?.source?.layer?.diagramUnderstanding || {};
  const rawNodes = Array.isArray(understanding.visualNodes) ? understanding.visualNodes : [];
  const candidates = rawNodes
    .map((node, index) => {
      const box = deps.normalizeVisualNodeBox(node, targetBox, slideSize);
      if (!box || !isUsefulLayeredStackNodeBox(box, targetBox)) return null;
      return { id: node?.id || node?.nodeId || `visual-layer-${index}`, box };
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

function isUsefulLayeredStackNodeBox(box = {}, targetBox = {}) {
  if (!box || box.w <= 8 || box.h <= 8) return false;
  const areaRatio = (box.w * box.h) / Math.max(1, targetBox.w * targetBox.h);
  const widthRatio = box.w / Math.max(1, targetBox.w);
  const heightRatio = box.h / Math.max(1, targetBox.h);
  return areaRatio >= 0.012
    && areaRatio <= 0.62
    && widthRatio >= 0.12
    && widthRatio <= 1.08
    && heightRatio >= 0.045
    && heightRatio <= 0.42;
}

function layeredStackLayerShape(image, match, part, index, box, palette, direction = "stack", tapered = false, extraSource = {}, deps = {}) {
  const fill = palette.softFills?.[index % Math.max(1, palette.softFills.length)] || "#F8FAFC";
  const stroke = palette.accents?.[index % Math.max(1, palette.accents.length)] || "#2F80ED";
  const type = tapered ? "freeform" : "roundRect";
  return deps.nativeShape(image, match, part, index, type, box, {
    fill,
    stroke,
    strokeWidthPt: 0.95,
    radiusRatio: tapered ? 0 : 0.08,
    ...(tapered ? { freeform: layeredStackFreeform(direction) } : {}),
    shadow: { color: "#1F2937", alpha: 0.07, blurPt: 3.5, distancePt: 0.9, angleDeg: 90 }
  }, {
    layeredStackIndex: index,
    layeredStackDirection: direction,
    layeredStackTapered: tapered,
    ...extraSource
  });
}

function layeredStackFreeform(direction = "stack") {
  if (direction === "top-wide") {
    return {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0.86, y: 1 },
        { x: 0.14, y: 1 }
      ],
      closePath: true
    };
  }
  return {
    points: [
      { x: 0.14, y: 0 },
      { x: 0.86, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ],
    closePath: true
  };
}

function layeredStackDirection(image = {}, nodes = []) {
  const text = [
    image?.source?.layer?.templateFamily,
    image?.source?.layer?.diagramUnderstanding?.archetype,
    image?.source?.componentRenderStrategy?.bestCandidate?.title,
    image?.source?.componentRenderStrategy?.bestCandidate?.description
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  if (/funnel|漏斗/.test(text)) return "top-wide";
  if (/pyramid|金字塔/.test(text)) return "bottom-wide";
  if (nodes.length >= 2) {
    const first = nodes[0].box.w;
    const last = nodes[nodes.length - 1].box.w;
    if (first > last * 1.14) return "top-wide";
    if (last > first * 1.14) return "bottom-wide";
  }
  return "stack";
}

function layeredStackUsesTaperedLayers(image = {}, nodes = []) {
  const direction = layeredStackDirection(image, nodes);
  if (direction !== "stack") return true;
  const widths = nodes.map((node) => node.box.w).filter(Number.isFinite);
  if (widths.length < 3) return false;
  return Math.max(...widths) / Math.max(1, Math.min(...widths)) >= 1.18;
}

module.exports = {
  isUsefulLayeredStackNodeBox,
  layeredStackDirection,
  layeredStackFreeform,
  layeredStackLayerShape,
  layeredStackShapes,
  layeredStackShapesFromVisualNodes,
  layeredStackUsesTaperedLayers,
  layeredStackVisualNodes,
  layeredStackWidthTrend,
  selectTemplateLayeredStackBoxes,
  templateGuidedLayeredStackShapes
};
