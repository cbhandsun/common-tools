"use strict";

const { resolveConnectorComponent } = require("./connector-component-library");
const {
  angleAround,
  boxCenter,
  clampBox,
  clampInteger,
  distance,
  isUsefulTemplateNodeBox,
  scaleRelativeBox
} = require("./component-template-geometry");
const { paletteFromMatch } = require("./component-template-palette");
const { safeColorOrNone, safeText } = require("./component-template-sanitizers");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function cycleLoopShapes(image = {}, match = {}, slideSize = DEFAULT_SLIDE, deps = {}) {
  const box = deps.safeBox?.(image.box, slideSize);
  if (!box) return [];
  const palette = paletteFromMatch(match, {
    accents: ["#2563EB", "#16A34A", "#F97316", "#0EA5E9"],
    neutral: "#93A4BA",
    softFills: ["#EAF3FF", "#ECFDF5", "#FFF7ED", "#E0F2FE"]
  });
  const guidedCycle = templateGuidedCycleLoopShapes(image, match, box, palette, slideSize, deps);
  if (guidedCycle.length > 0) return guidedCycle;
  const visualCycle = cycleLoopShapesFromVisualNodes(image, match, box, palette, slideSize, deps);
  if (visualCycle.length > 0) return visualCycle;
  const count = cycleLoopItemCount(image, match);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const radiusX = box.w * 0.34;
  const radiusY = box.h * 0.32;
  const arcW = Math.max(54, box.w * 0.58);
  const arcH = Math.max(54, box.h * 0.56);
  const nodeW = Math.max(46, Math.min(96, box.w * 0.18));
  const nodeH = Math.max(24, Math.min(44, box.h * 0.12));
  const fidelityOverlay = deps.isFidelityCropOverlay?.(image) === true;
  const shapes = [];

  for (let index = 0; index < count; index += 1) {
    const angleDeg = -90 + (360 * index / count);
    const angle = angleDeg * Math.PI / 180;
    const stroke = palette.accents[index % palette.accents.length];
    const connector = resolveConnectorComponent({ role: "cycle-fixed", stroke, strokeWidthPt: 2.1 });
    shapes.push(deps.nativeShape(image, match, "cycle-ring-segment", index, "arc", {
      x: cx - arcW / 2,
      y: cy - arcH / 2,
      w: arcW,
      h: arcH
    }, {
      ...connector.style,
      fill: "none",
      rotationDeg: angleDeg,
      adjustments: [0.08, 0.76]
    }, {
      ...connector.source,
      cycleLoopItemCount: count,
      cycleLoopAngleDeg: angleDeg,
      semanticConnector: {
        fromId: `cycle-node-${index}`,
        toId: `cycle-node-${(index + 1) % count}`,
        direction: "forward",
        axis: "free"
      }
    }));

    const nodeCx = cx + Math.cos(angle) * radiusX;
    const nodeCy = cy + Math.sin(angle) * radiusY;
    shapes.push(deps.nativeShape(image, match, "cycle-node", index, "roundRect", {
      x: nodeCx - nodeW / 2,
      y: nodeCy - nodeH / 2,
      w: nodeW,
      h: nodeH
    }, fidelityOverlay ? deps.fidelityOverlayShellStyle({
      fill: "none",
      stroke,
      strokeWidthPt: 1.05,
      radiusRatio: 0.42
    }) : {
      fill: palette.softFills[index % palette.softFills.length],
      stroke,
      strokeWidthPt: 1.05,
      radiusRatio: 0.42,
      shadow: { color: "#1F2937", alpha: 0.10, blurPt: 4.2, distancePt: 1.1, angleDeg: 90 }
    }, {
      cycleLoopItemCount: count,
      cycleLoopAngleDeg: angleDeg
    }));
  }

  const centerW = Math.max(80, Math.min(box.w * 0.26, arcW * 0.44));
  const centerH = Math.max(36, Math.min(box.h * 0.16, arcH * 0.30));
  shapes.push(deps.nativeShape(image, match, "cycle-center", 0, "roundRect", {
    x: cx - centerW / 2,
    y: cy - centerH / 2,
    w: centerW,
    h: centerH
  }, fidelityOverlay ? deps.fidelityOverlayShellStyle({
    fill: "none",
    stroke: palette.neutral,
    strokeWidthPt: 0.95,
    radiusRatio: 0.28
  }) : {
    fill: "#FFFFFF",
    stroke: palette.neutral,
    strokeWidthPt: 0.95,
    radiusRatio: 0.28,
    shadow: { color: "#1F2937", alpha: 0.08, blurPt: 5, distancePt: 1.2, angleDeg: 90 }
  }, {
    cycleLoopItemCount: count,
    cycleLoopAngleDeg: 0
  }));

  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function templateGuidedCycleLoopShapes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE, deps = {}) {
  const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  if (children.length === 0) return [];
  const mapped = children
    .map((child, index) => ({
      child,
      index,
      kind: String(child?.kind || ""),
      role: deps.appliedChildStructureRole(child),
      box: scaleRelativeBox(child?.box, targetBox, slideSize),
      style: child?.style || {}
    }))
    .filter((item) => item.kind === "shape" && item.box);
  const arcChildren = mapped.filter((item) => isCycleLoopTemplateArcChild(item, targetBox));
  if (arcChildren.length === 0) return [];

  const nodeChildren = mapped
    .filter((item) => item.role === "node")
    .filter((item) => !arcChildren.some((arc) => arc.index === item.index))
    .filter((item) => isUsefulTemplateNodeBox(item.box, targetBox))
    .slice(0, 8);
  const shapes = [];
  arcChildren.slice(0, 12).forEach((item, arcIndex) => {
    const stroke = safeColorOrNone(item.style.stroke) || palette.accents?.[arcIndex % Math.max(1, palette.accents.length)] || "#2563EB";
    const fill = safeColorOrNone(item.style.fill) || (deps.nativeTypeForTemplateStyle(item.style, "circularArrow") === "circulararrow" ? stroke : "none");
    shapes.push(deps.nativeShape(image, match, "cycle-ring-segment", arcIndex, deps.nativeTypeForTemplateStyle(item.style, "circularArrow"), item.box, deps.mergeTemplateStyle(item.style, {
      fill,
      stroke,
      strokeWidthPt: 2.2,
      adjustments: [0.08, 0.76]
    }), {
      appliedPluginChildIndex: item.index,
      appliedPluginStructureRole: item.role,
      appliedPluginShapeType: safeText(item.style.shapeType),
      componentTemplateExactChildShape: true,
      layoutPreservation: "component-child-layout"
    }));
  });
  nodeChildren.forEach((item, nodeIndex) => {
    const stroke = palette.accents?.[nodeIndex % Math.max(1, palette.accents.length)] || "#2563EB";
    shapes.push(deps.nativeShape(image, match, "cycle-node", nodeIndex, deps.nativeTypeForTemplateStyle(item.style, "roundRect"), item.box, deps.mergeTemplateStyle(item.style, {
      fill: palette.softFills?.[nodeIndex % Math.max(1, palette.softFills.length)] || "#EAF3FF",
      stroke,
      strokeWidthPt: 1.05,
      radiusRatio: 0.42,
      shadow: { color: "#1F2937", alpha: 0.10, blurPt: 4.2, distancePt: 1.1, angleDeg: 90 }
    }), {
      appliedPluginChildIndex: item.index,
      appliedPluginStructureRole: item.role,
      componentTemplateExactChildShape: true,
      layoutPreservation: "component-child-layout"
    }));
  });
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function isCycleLoopTemplateArcChild(item = {}, targetBox = {}) {
  const styleType = String(item.style?.shapeType || "").toLowerCase();
  if (!/arc|blockarc|circular|arrow/.test(styleType)) return false;
  const box = item.box || {};
  const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, Number(targetBox.w || 0) * Number(targetBox.h || 0));
  if (areaRatio < 0.004 || areaRatio > 0.92) return false;
  if (Number(box.w || 0) < 12 || Number(box.h || 0) < 12) return false;
  return true;
}

function cycleLoopShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE, deps = {}) {
  const nodes = deps.treeVisualNodes(image, targetBox, slideSize);
  if (nodes.length < 4) return [];
  const targetCenter = boxCenter(targetBox);
  const centerCandidate = nodes
    .map((node) => ({ node, distance: distance(boxCenter(node.box), targetCenter) }))
    .sort((a, b) => a.distance - b.distance)[0]?.node || null;
  const centerBox = centerCandidate && centerCandidate.box.w * centerCandidate.box.h <= targetBox.w * targetBox.h * 0.12
    ? centerCandidate.box
    : null;
  const centerPoint = centerBox ? boxCenter(centerBox) : targetCenter;
  const peripheralCandidates = nodes
    .filter((node) => node !== centerCandidate || !centerBox)
    .filter((node) => distance(boxCenter(node.box), centerPoint) >= Math.min(targetBox.w, targetBox.h) * 0.18)
    .slice(0, 12);
  const visualOrder = deps.visualCycleNodeOrder(image, peripheralCandidates, centerPoint);
  const peripherals = visualOrder
    ? visualOrder.nodes.slice(0, 8)
    : peripheralCandidates
      .sort((a, b) => angleAround(centerPoint, boxCenter(a.box)) - angleAround(centerPoint, boxCenter(b.box)))
      .slice(0, 8);
  if (peripherals.length < 3) return [];
  const edgeByNodeId = visualOrder?.edgeByNodeId || new Map();

  const peripheralCenters = peripherals.map((node) => boxCenter(node.box));
  const left = Math.min(...peripheralCenters.map((point) => point.x));
  const right = Math.max(...peripheralCenters.map((point) => point.x));
  const top = Math.min(...peripheralCenters.map((point) => point.y));
  const bottom = Math.max(...peripheralCenters.map((point) => point.y));
  const arcBox = clampBox({
    x: left - Math.max(18, (right - left) * 0.12),
    y: top - Math.max(18, (bottom - top) * 0.12),
    w: Math.max(54, (right - left) * 1.24),
    h: Math.max(54, (bottom - top) * 1.24)
  }, slideSize);
  const shapes = [];
  peripherals.forEach((node, index) => {
    const current = boxCenter(node.box);
    const edge = edgeByNodeId.get(node.id) || null;
    const angleDeg = angleAround(centerPoint, current) * 180 / Math.PI;
    const stroke = palette.accents?.[index % Math.max(1, palette.accents.length)] || "#2563EB";
    const connector = resolveConnectorComponent({ role: "cycle-fixed", stroke, strokeWidthPt: 2.1 });
    shapes.push(deps.nativeShape(image, match, "cycle-ring-segment", index, "arc", arcBox, {
      ...connector.style,
      fill: "none",
      rotationDeg: angleDeg,
      adjustments: [0.08, 0.76]
    }, {
      ...connector.source,
      cycleLoopItemCount: peripherals.length,
      cycleLoopAngleDeg: angleDeg,
      sourceVisualConnectorId: edge?.id,
      sourceVisualNodeId: node.id,
      semanticConnector: { fromId: node.id, toId: peripherals[(index + 1) % peripherals.length].id, direction: "forward", axis: "free" },
      layoutPreservation: "visual-node"
    }));
    shapes.push(deps.nativeShape(image, match, "cycle-node", index, "roundRect", node.box, {
      fill: palette.softFills?.[index % Math.max(1, palette.softFills.length)] || "#EAF3FF",
      stroke,
      strokeWidthPt: 1.05,
      radiusRatio: 0.42,
      shadow: { color: "#1F2937", alpha: 0.10, blurPt: 4.2, distancePt: 1.1, angleDeg: 90 }
    }, {
      cycleLoopItemCount: peripherals.length,
      cycleLoopAngleDeg: angleDeg,
      sourceVisualNodeId: node.id,
      layoutPreservation: "visual-node"
    }));
  });

  const fallbackCenterW = Math.max(70, Math.min(targetBox.w * 0.24, arcBox.w * 0.40));
  const fallbackCenterH = Math.max(32, Math.min(targetBox.h * 0.15, arcBox.h * 0.28));
  shapes.push(deps.nativeShape(image, match, "cycle-center", 0, "roundRect", centerBox || {
    x: centerPoint.x - fallbackCenterW / 2,
    y: centerPoint.y - fallbackCenterH / 2,
    w: fallbackCenterW,
    h: fallbackCenterH
  }, {
    fill: "#FFFFFF",
    stroke: palette.neutral || "#93A4BA",
    strokeWidthPt: 0.95,
    radiusRatio: 0.28,
    shadow: { color: "#1F2937", alpha: 0.08, blurPt: 5, distancePt: 1.2, angleDeg: 90 }
  }, {
    cycleLoopItemCount: peripherals.length,
    cycleLoopAngleDeg: 0,
    ...(centerCandidate ? { sourceVisualNodeId: centerCandidate.id } : {}),
    layoutPreservation: "visual-node"
  }));
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function cycleLoopItemCount(image = {}, match = {}) {
  const strategy = image?.source?.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  const text = `${candidate.title || ""} ${candidate.description || ""} ${match.id || ""} ${match.name || ""}`;
  const explicit = String(text).match(/(?:^|[^\d])([3-8])\s*(?:项|步|环|node|nodes|steps?)/i);
  if (explicit) return clampInteger(explicit[1], 3, 8);
  return clampInteger(match.itemCount || match.childCount || match.shapeCount || match.connectorCount || image?.source?.layer?.diagramUnderstanding?.nodeCount || 6, 3, 8);
}

module.exports = {
  cycleLoopItemCount,
  cycleLoopShapes,
  cycleLoopShapesFromVisualNodes,
  isCycleLoopTemplateArcChild,
  templateGuidedCycleLoopShapes
};
