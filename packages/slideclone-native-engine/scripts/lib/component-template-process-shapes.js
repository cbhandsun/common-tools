"use strict";

const {
  boxCenter,
  clampBox,
  clampInteger,
  lineBoxBetween,
  unionBox
} = require("./component-template-geometry");
const { mixColor, paletteFromMatch } = require("./component-template-palette");
const { safeColor, safeColorOrNone } = require("./component-template-sanitizers");
const {
  sanitizeTemplateGradient,
  sanitizeTemplateShadow
} = require("./component-template-style");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function processChainShapes(image = {}, match = {}, slideSize = DEFAULT_SLIDE, deps = {}) {
  const box = deps.safeBox?.(image.box, slideSize);
  if (!box) return [];
  const fidelityOverlay = deps.isFidelityCropOverlay?.(image) === true;
  const palette = paletteFromMatch(match, {
    accents: ["#2F80ED", "#27AE60"],
    neutral: "#7C8CA0",
    softFills: ["#EAF3FF", "#EAFBF2"]
  });
  if (isSwimlaneProcessLayer(image)) {
    const visualSwimlane = swimlaneProcessShapesFromVisualNodes(image, match, box, palette, slideSize, deps);
    if (visualSwimlane.length > 0) return visualSwimlane;
  }
  const visualChain = processChainShapesFromVisualNodes(image, match, box, palette, slideSize, deps);
  if (visualChain.length > 0) return visualChain;
  const guided = deps.templateGuidedProcessShapes?.(image, match, box, palette, slideSize) || [];
  if (guided.length > 0) return guided;
  if (isSwimlaneProcessLayer(image)) {
    const swimlane = swimlaneProcessShapes(image, match, box, palette, slideSize, deps);
    if (swimlane.length > 0) return swimlane;
  }
  const count = clampInteger(match.childCount || match.shapeCount || 4, 3, 6);
  const gap = Math.max(10, Math.min(24, box.w * 0.028));
  const nodeW = (box.w - gap * (count - 1)) / count;
  const nodeH = Math.min(box.h * 0.52, Math.max(34, box.h * 0.34));
  const y = box.y + (box.h - nodeH) * 0.46;
  const shapes = [];
  let previousNodeBox = null;
  for (let index = 0; index < count; index += 1) {
    const x = box.x + index * (nodeW + gap);
    const nodeBox = clampBox({ x, y, w: nodeW, h: nodeH }, slideSize);
    shapes.push(deps.nativeShape(image, match, "process-node", index, "roundRect", nodeBox, {
      fill: fidelityOverlay ? "none" : palette.softFills[index % palette.softFills.length],
      stroke: palette.accents[index % palette.accents.length],
      strokeWidthPt: 1.05,
      radiusRatio: 0.18,
      ...(fidelityOverlay ? {} : { shadow: { color: "#1F2937", alpha: 0.12, blurPt: 4.5, distancePt: 1.2, angleDeg: 90 } })
    }));
    if (index > 0) {
      const prevX = x - gap;
      shapes.push(deps.nativeShape(image, match, "process-connector", index - 1, "line", {
        x: prevX + 1.5,
        y: y + nodeH / 2,
        w: gap - 3,
        h: 0.1
      }, deps.mergeTemplateStyle(deps.firstTemplateConnectorStyle(match), {
        stroke: palette.neutral,
        strokeWidthPt: 1.4,
        connectorType: "straight",
        endArrow: "triangle"
      }), deps.processConnectorMetadata(index - 1, index, previousNodeBox, nodeBox)));
    }
    previousNodeBox = nodeBox;
  }
  return shapes;
}

function processChainShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE, deps = {}) {
  if (isSwimlaneProcessLayer(image)) return [];
  const nodes = deps.treeVisualNodes(image, targetBox, slideSize)
    .slice()
    .sort((a, b) => boxCenter(a.box).x - boxCenter(b.box).x || boxCenter(a.box).y - boxCenter(b.box).y)
    .slice(0, 12);
  if (nodes.length < 3) return [];
  const centerYs = nodes.map((node) => boxCenter(node.box).y);
  const ySpread = Math.max(...centerYs) - Math.min(...centerYs);
  const avgNodeH = nodes.reduce((sum, node) => sum + node.box.h, 0) / Math.max(1, nodes.length);
  if (ySpread > Math.max(avgNodeH * 1.8, targetBox.h * 0.22)) return [];

  const shapes = [];
  nodes.forEach((node, index) => {
    shapes.push(deps.nativeShape(image, match, "process-node", index, "roundRect", node.box, {
      fill: palette.softFills?.[index % Math.max(1, palette.softFills.length)] || "#EAF3FF",
      stroke: palette.accents?.[index % Math.max(1, palette.accents.length)] || "#2F80ED",
      strokeWidthPt: 1.05,
      radiusRatio: 0.18,
      shadow: { color: "#1F2937", alpha: 0.12, blurPt: 4.5, distancePt: 1.2, angleDeg: 90 }
    }, {
      sourceVisualNodeId: node.id,
      layoutPreservation: "visual-node"
    }));
  });
  const visualEdges = deps.visualConnectorsBetweenNodes(image, nodes, { max: 16 });
  const connectorEdges = visualEdges.length > 0
    ? visualEdges
    : nodes.slice(1).map((node, index) => ({ from: nodes[index], to: node, fromIndex: index, toIndex: index + 1 }));
  connectorEdges.forEach((edge, index) => {
    shapes.push(deps.nativeShape(image, match, "process-connector", index, "line", lineBoxBetween(edge.from.box, edge.to.box), deps.mergeTemplateStyle(deps.firstTemplateConnectorStyle(match), {
      stroke: palette.neutral || "#7C8CA0",
      strokeWidthPt: 1.4,
      connectorType: "straight",
      endArrow: "triangle"
    }), {
      ...deps.processConnectorMetadata(edge.fromIndex, edge.toIndex, edge.from.box, edge.to.box),
      connectorSemantic: "node-to-node",
      connectorKind: "process-chain",
      sourceVisualConnectorId: edge.id,
      sourceVisualNodeId: edge.to.id,
      layoutPreservation: "visual-node"
    }));
  });
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function isSwimlaneProcessLayer(image = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const signature = understanding.structureSignature || {};
  const strategy = image?.source?.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  const text = [
    layer.templateFamily,
    understanding.archetype,
    signature.layout,
    understanding.componentStrategy?.structureSignature?.layout,
    candidate.structureSignature?.layout,
    candidate.title
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return /swimlane|泳道/.test(text);
}

function swimlaneProcessShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE, deps = {}) {
  const nodes = deps.treeVisualNodes(image, targetBox, slideSize);
  if (nodes.length < 4) return [];
  const understanding = image?.source?.layer?.diagramUnderstanding || {};
  const laneGroups = splitVisualNodesIntoSwimlanes(nodes, understanding, targetBox);
  if (laneGroups.length < 2 || laneGroups.some((lane) => lane.length < 2)) return [];
  const visualEdges = deps.visualConnectorsBetweenNodes(image, nodes, { max: 32 });
  const nodeIndexById = new Map();

  const shapes = [];
  const headerW = Math.max(48, Math.min(96, targetBox.w * 0.14));
  laneGroups.forEach((laneNodes, lane) => {
    const nodeBoxes = laneNodes.map((node) => node.box);
    const laneContent = unionBox(nodeBoxes);
    const lanePadY = Math.max(8, Math.min(18, laneContent.h * 0.42));
    const laneBox = clampBox({
      x: targetBox.x,
      y: Math.max(targetBox.y, laneContent.y - lanePadY),
      w: targetBox.w,
      h: Math.min(targetBox.y + targetBox.h, laneContent.y + laneContent.h + lanePadY) - Math.max(targetBox.y, laneContent.y - lanePadY)
    }, slideSize);
    const headerBox = clampBox({
      x: targetBox.x,
      y: laneBox.y,
      w: Math.min(headerW, Math.max(28, Math.min(...nodeBoxes.map((box) => box.x)) - targetBox.x - 8)),
      h: laneBox.h
    }, slideSize);
    shapes.push(deps.nativeShape(image, match, "swimlane-lane", lane, "roundRect", laneBox, swimlaneLaneStyle(palette, lane, match, deps), {
      swimlaneIndex: lane,
      layoutPreservation: "visual-node"
    }));
    shapes.push(deps.nativeShape(image, match, "swimlane-header", lane, "roundRect", headerBox, swimlaneHeaderStyle(palette, lane, match, deps), {
      swimlaneIndex: lane,
      layoutPreservation: "visual-node"
    }));

    laneNodes
      .slice()
      .sort((a, b) => boxCenter(a.box).x - boxCenter(b.box).x)
      .forEach((node, col, orderedLaneNodes) => {
        const nodeIndex = lane * 100 + col;
        nodeIndexById.set(node.id, { node, nodeIndex, lane, col });
        shapes.push(deps.nativeShape(image, match, "swimlane-node", nodeIndex, "roundRect", node.box, swimlaneNodeStyle(palette, lane, col, match, deps), {
          swimlaneIndex: lane,
          swimlaneColumn: col,
          sourceVisualNodeId: node.id,
          layoutPreservation: "visual-node"
        }));
        if (visualEdges.length === 0 && col > 0) {
          const previous = orderedLaneNodes[col - 1];
          shapes.push(deps.nativeShape(image, match, "swimlane-connector", nodeIndex - 1, "line", lineBoxBetween(previous.box, node.box), swimlaneConnectorStyle(palette, lane, match, deps), {
            ...deps.processConnectorMetadata(nodeIndex - 1, nodeIndex, previous.box, node.box),
            connectorSemantic: "swimlane-flow",
            swimlaneIndex: lane,
            sourceVisualNodeId: node.id,
            layoutPreservation: "visual-node"
          }));
        }
      });
  });
  if (visualEdges.length > 0) {
    visualEdges.forEach((edge, index) => {
      const from = nodeIndexById.get(edge.from.id);
      const to = nodeIndexById.get(edge.to.id);
      if (!from || !to) return;
      shapes.push(deps.nativeShape(image, match, "swimlane-connector", 900 + index, "line", lineBoxBetween(from.node.box, to.node.box), {
        ...swimlaneConnectorStyle(palette, from.lane, match, deps),
        connectorType: edge.axis === "vertical" ? "elbow" : "straight",
        endArrow: edge.arrow === false ? "none" : "triangle"
      }, {
        ...deps.processConnectorMetadata(from.nodeIndex, to.nodeIndex, from.node.box, to.node.box),
        connectorSemantic: "swimlane-flow",
        swimlaneIndex: from.lane === to.lane ? from.lane : -1,
        crossSwimlaneConnector: from.lane !== to.lane,
        sourceVisualConnectorId: edge.id,
        sourceVisualNodeId: to.node.id,
        layoutPreservation: "visual-node"
      }));
    });
  }
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function splitVisualNodesIntoSwimlanes(nodes = [], understanding = {}, targetBox = {}) {
  const sorted = nodes
    .slice()
    .sort((a, b) => boxCenter(a.box).y - boxCenter(b.box).y || boxCenter(a.box).x - boxCenter(b.box).x);
  const explicitLaneCount = clampInteger(understanding?.structureSignature?.laneCount || understanding?.structureSignature?.rows || 0, 0, 8);
  const laneCount = explicitLaneCount >= 2 ? Math.min(explicitLaneCount, Math.floor(sorted.length / 2)) : 0;
  if (laneCount >= 2) {
    const gaps = [];
    for (let index = 1; index < sorted.length; index += 1) {
      gaps.push({
        index,
        gap: boxCenter(sorted[index].box).y - boxCenter(sorted[index - 1].box).y
      });
    }
    const splitIndexes = new Set(gaps
      .sort((a, b) => b.gap - a.gap)
      .slice(0, laneCount - 1)
      .map((entry) => entry.index));
    const groups = [];
    let current = [];
    sorted.forEach((node, index) => {
      if (splitIndexes.has(index) && current.length > 0) {
        groups.push(current);
        current = [];
      }
      current.push(node);
    });
    if (current.length > 0) groups.push(current);
    return groups.filter((group) => group.length > 0);
  }

  const avgNodeH = sorted.reduce((sum, node) => sum + node.box.h, 0) / Math.max(1, sorted.length);
  const threshold = Math.max(avgNodeH * 1.55, targetBox.h * 0.12);
  const groups = [];
  for (const node of sorted) {
    const centerY = boxCenter(node.box).y;
    const current = groups[groups.length - 1];
    if (!current || centerY - averageLaneCenterY(current) > threshold) {
      groups.push([node]);
    } else {
      current.push(node);
    }
  }
  return groups;
}

function averageLaneCenterY(nodes = []) {
  return nodes.reduce((sum, node) => sum + boxCenter(node.box).y, 0) / Math.max(1, nodes.length);
}

function swimlaneLaneStyle(palette = {}, lane = 0, match = {}, deps = {}) {
  const accent = paletteAccent(palette, lane);
  const soft = mixColor(accent, "#FFFFFF", lane % 2 === 0 ? 0.93 : 0.9) || (lane % 2 === 0 ? "#F8FAFC" : "#F1F5F9");
  const fallback = {
    fill: soft,
    stroke: mixColor(accent, "#FFFFFF", 0.62) || palette.neutral || "#CBD5E1",
    strokeWidthPt: 0.65,
    radiusRatio: 0.075,
    shadow: { color: "#334155", alpha: 0.045, blurPt: 2.4, distancePt: 0.45, angleDeg: 90 }
  };
  const sample = swimlaneTemplateStyleSamples(match, deps).background || null;
  return sample ? visualOnlyTemplateStyle(deps.mergeTemplateStyle(sample, fallback)) : fallback;
}

function swimlaneHeaderStyle(palette = {}, lane = 0, match = {}, deps = {}) {
  const accent = paletteAccent(palette, lane);
  const light = mixColor(accent, "#FFFFFF", 0.66) || "#EAF3FF";
  const vivid = mixColor(accent, "#FFFFFF", 0.1) || accent;
  const fallback = {
    fill: light,
    stroke: vivid,
    strokeWidthPt: 0.85,
    radiusRatio: 0.14,
    gradient: {
      type: "linear",
      angleDeg: 0,
      stops: [
        { position: 0, color: vivid },
        { position: 1, color: light }
      ]
    },
    shadow: { color: "#0F172A", alpha: 0.08, blurPt: 3.6, distancePt: 0.8, angleDeg: 90 }
  };
  const samples = swimlaneTemplateStyleSamples(match, deps);
  const sample = samples.header || samples.node || null;
  return sample ? visualOnlyTemplateStyle(deps.mergeTemplateStyle(sample, fallback)) : fallback;
}

function swimlaneNodeStyle(palette = {}, lane = 0, col = 0, match = {}, deps = {}) {
  const accent = paletteAccent(palette, lane + col);
  const tint = mixColor(accent, "#FFFFFF", 0.9) || "#FFFFFF";
  const fallback = {
    fill: "#FFFFFF",
    stroke: mixColor(accent, "#FFFFFF", 0.2) || accent,
    strokeWidthPt: 1.05,
    radiusRatio: 0.2,
    gradient: {
      type: "linear",
      angleDeg: 0,
      stops: [
        { position: 0, color: tint },
        { position: 0.32, color: "#FFFFFF" },
        { position: 1, color: "#FFFFFF" }
      ]
    },
    shadow: { color: "#1F2937", alpha: 0.12, blurPt: 5.2, distancePt: 1.15, angleDeg: 90 }
  };
  const sample = swimlaneTemplateStyleSamples(match, deps).node || null;
  return sample ? visualOnlyTemplateStyle(deps.mergeTemplateStyle(sample, fallback)) : fallback;
}

function swimlaneConnectorStyle(palette = {}, lane = 0, match = {}, deps = {}) {
  const accent = paletteAccent(palette, lane);
  const fallback = {
    stroke: mixColor(accent, "#334155", 0.18) || palette.neutral || "#64748B",
    strokeWidthPt: 1.65,
    connectorType: "straight",
    endArrow: "triangle"
  };
  const sample = swimlaneTemplateStyleSamples(match, deps).connector || null;
  return sample ? visualOnlyTemplateStyle(deps.mergeTemplateStyle(sample, fallback)) : fallback;
}

function paletteAccent(palette = {}, index = 0) {
  const accents = Array.isArray(palette.accents) && palette.accents.length ? palette.accents : ["#2F80ED", "#27AE60"];
  return safeColor(accents[Math.abs(index) % accents.length]) || "#2F80ED";
}

function swimlaneTemplateStyleSamples(match = {}, deps = {}) {
  const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  const shapeChildren = children
    .map((child, index) => ({ ...child, index, style: child?.style || {} }))
    .filter((child) => child.kind === "shape" && child.style && typeof child.style === "object");
  const connector = children.find((child) => child?.kind === "connector" && child.style && typeof child.style === "object")?.style || null;
  const background = shapeChildren
    .filter((child) => deps.appliedChildStructureRole(child) === "background")
    .sort((a, b) => templateStyleSignalScore(b.style) - templateStyleSignalScore(a.style))[0]?.style || null;
  const header = shapeChildren
    .filter((child) => deps.appliedChildStructureRole(child) !== "background")
    .filter((child) => Number(child?.box?.w || 0) <= 0.24 || Number(child?.box?.h || 0) <= 0.24)
    .sort((a, b) => templateStyleSignalScore(b.style) - templateStyleSignalScore(a.style))[0]?.style || null;
  const node = shapeChildren
    .filter((child) => deps.appliedChildStructureRole(child) === "node")
    .sort((a, b) => templateStyleSignalScore(b.style) - templateStyleSignalScore(a.style))[0]?.style || header || null;
  return { background, header, node, connector };
}

function templateStyleSignalScore(style = {}) {
  let score = 0;
  if (safeColorOrNone(style.fill)) score += 1;
  if (safeColorOrNone(style.stroke)) score += 1;
  if (Number.isFinite(Number(style.strokeWidthPt))) score += 0.5;
  if (sanitizeTemplateGradient(style.gradient)) score += 4;
  if (sanitizeTemplateShadow(style.shadow)) score += 2;
  if (Number.isFinite(Number(style.radiusRatio))) score += 0.5;
  return score;
}

function visualOnlyTemplateStyle(style = {}) {
  const out = { ...(style || {}) };
  delete out.text;
  delete out.picture;
  delete out.freeform;
  delete out.adjustments;
  delete out.rotation;
  return out;
}

function swimlaneProcessShapes(image = {}, match = {}, box = null, palette = {}, slideSize = DEFAULT_SLIDE, deps = {}) {
  const targetBox = box || deps.safeBox?.(image.box, slideSize);
  if (!targetBox) return [];
  const understanding = image?.source?.layer?.diagramUnderstanding || {};
  const nodeCount = clampInteger(understanding.visualNodeCount || understanding.nodeCount || match.childCount || 6, 4, 16);
  const laneCount = clampInteger(estimateSwimlaneCount(understanding, nodeCount), 2, 4);
  const columns = clampInteger(Math.ceil(nodeCount / laneCount), 2, 6);
  const laneGap = Math.max(6, Math.min(12, targetBox.h * 0.018));
  const laneH = (targetBox.h - laneGap * (laneCount - 1)) / laneCount;
  const headerW = Math.max(56, Math.min(96, targetBox.w * 0.14));
  const contentX = targetBox.x + headerW + Math.max(8, targetBox.w * 0.018);
  const contentW = Math.max(1, targetBox.x + targetBox.w - contentX);
  const nodeGap = Math.max(10, Math.min(22, contentW * 0.04));
  const nodeW = Math.max(42, (contentW - nodeGap * (columns - 1)) / columns);
  const nodeH = Math.max(24, Math.min(48, laneH * 0.48));
  const shapes = [];
  for (let lane = 0; lane < laneCount; lane += 1) {
    const laneY = targetBox.y + lane * (laneH + laneGap);
    const laneBox = clampBox({ x: targetBox.x, y: laneY, w: targetBox.w, h: laneH }, slideSize);
    const headerBox = clampBox({ x: targetBox.x, y: laneY, w: headerW, h: laneH }, slideSize);
    shapes.push(deps.nativeShape(image, match, "swimlane-lane", lane, "roundRect", laneBox, swimlaneLaneStyle(palette, lane, match, deps)));
    shapes.push(deps.nativeShape(image, match, "swimlane-header", lane, "roundRect", headerBox, swimlaneHeaderStyle(palette, lane, match, deps)));
    let previousNodeBox = null;
    for (let col = 0; col < columns; col += 1) {
      const nodeIndex = lane * columns + col;
      if (nodeIndex >= nodeCount) break;
      const nodeBox = clampBox({
        x: contentX + col * (nodeW + nodeGap),
        y: laneY + (laneH - nodeH) / 2,
        w: nodeW,
        h: nodeH
      }, slideSize);
      shapes.push(deps.nativeShape(image, match, "swimlane-node", nodeIndex, "roundRect", nodeBox, swimlaneNodeStyle(palette, lane, col, match, deps), {
        swimlaneIndex: lane,
        swimlaneColumn: col
      }));
      if (previousNodeBox) {
        shapes.push(deps.nativeShape(image, match, "swimlane-connector", nodeIndex - 1, "line", lineBoxBetween(previousNodeBox, nodeBox), swimlaneConnectorStyle(palette, lane, match, deps), {
          ...deps.processConnectorMetadata(nodeIndex - 1, nodeIndex, previousNodeBox, nodeBox),
          connectorSemantic: "swimlane-flow",
          swimlaneIndex: lane
        }));
      }
      previousNodeBox = nodeBox;
    }
  }
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function estimateSwimlaneCount(understanding = {}, nodeCount = 6) {
  const signature = understanding.structureSignature || {};
  const explicit = clampInteger(signature.laneCount || signature.rows || 0, 0, 8);
  if (explicit >= 2) return explicit;
  if (nodeCount >= 9) return 3;
  return 2;
}

module.exports = {
  averageLaneCenterY,
  estimateSwimlaneCount,
  isSwimlaneProcessLayer,
  paletteAccent,
  processChainShapes,
  processChainShapesFromVisualNodes,
  splitVisualNodesIntoSwimlanes,
  swimlaneConnectorStyle,
  swimlaneHeaderStyle,
  swimlaneLaneStyle,
  swimlaneNodeStyle,
  swimlaneProcessShapes,
  swimlaneProcessShapesFromVisualNodes,
  swimlaneTemplateStyleSamples,
  templateStyleSignalScore,
  visualOnlyTemplateStyle
};
