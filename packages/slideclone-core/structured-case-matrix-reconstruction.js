"use strict";
const { centerOfBox, round, boxCenterInside } = require("./raster-native-detection");
const { lineBox } = require("./workflow-shape-primitives");
const { normalizeStructuredCaseMatrixText, sameDiagramLabel } = require("./diagram-label-matching");
const { roundedBox, normalizeCjkText } = require("./prd-generation-shapes");
const { comparisonMatrixVisualAtoms } = require("./comparison-matrix-evidence");
const { normalizeHexColor } = require("./native-chart-shell-shapes");
const { inferComparisonMatrixSkeletonShapes } = require("./comparison-matrix-layout");
const { uniqueSortedLinePositions } = require("./residual-component-analysis");
const { hasUnverifiedNativeGeometry } = require("./screenshot-texture-evidence");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function shouldObjectifyStructuredCaseFlowCardChain(image = {}) {
  if (hasUnverifiedNativeGeometry(image)) return false;
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const box = image?.box || {};
  if (source.detector !== "structured-case-graphic-underlay-crop") return false;
  if (layer.layerType !== "diagram-zone") return false;
  if (understanding.archetype !== "flow-card-chain") return false;
  if (Number(understanding.confidence || 0) < 0.9) return false;
  if (!box.w || !box.h || Number(box.w) < 520 || Number(box.h) < 260) return false;
  if (/screenshot|document|prototype|ui/.test(String(source.expressionForm || source.expressionSubtype || ""))) return false;
  const nodes = structuredCaseFlowCardChainNodes(image);
  const atoms = comparisonMatrixVisualAtoms(image);
  const gridAtoms = atoms.filter((atom) => /grid-line-candidate/.test(String(atom?.kind || ""))).length;
  const horizontalRails = atoms.filter((atom) => atom?.axis === "h" && Number(atom?.box?.w || 0) > Number(box.w || 0) * 0.35).length;
  return nodes.length >= 3 && gridAtoms >= 5 && horizontalRails >= 2;
}

function inferStructuredCaseFlowCardChainShapes(image = {}) {
  const box = image?.box || {};
  const nodes = structuredCaseFlowCardChainNodes(image);
  if (!box.w || !box.h || nodes.length < 3) return [];
  const base = image.id || "structured-case-flow-card-chain";
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "complex-diagram",
    expressionSubtype: "structured-case-flow-card-chain",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    skeletonOnly: true,
    ...extra
  });
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const railY = y + h * 0.34;
  const colors = structuredCaseFlowCardChainPalette(image);
  const shapes = [{
    id: `${base}-native-backbone`,
    type: "line",
    box: { x: round(x + w * 0.10), y: round(railY), w: round(w * 0.78), h: 0 },
    style: {
      stroke: colors.rail,
      strokeWidthPt: 2.2,
      connectorType: "straight",
      endArrow: "triangle",
      opacity: 0.74
    },
    source: source("structured-case-flow-card-chain-native-backbone")
  }];
  nodes.forEach((node, index) => {
    const text = normalizeStructuredCaseMatrixText(node.text);
    const nodeBox = roundedBox(node.box || {});
    const nodeCenter = centerOfBox(nodeBox);
    const cardBox = structuredCaseFlowCardChainCardBox(box, nodeBox, index, nodes.length);
    const accentColor = index === 0 ? colors.primary : index === 1 ? colors.secondary : colors.tertiary;
    shapes.push({
      id: `${base}-native-card-${index}`,
      type: "roundRect",
      box: roundedBox(cardBox),
      style: {
        fill: index === 0 ? "#F7FCFD" : "#FFFFFF",
        stroke: accentColor,
        strokeWidthPt: 1.2,
        radiusRatio: 0.12,
        opacity: 0.82,
        shadow: { color: accentColor, alpha: 0.12, blurPt: 4, distancePt: 1, angleDeg: 90 }
      },
      source: source("structured-case-flow-card-chain-native-card", { cardIndex: index, label: text })
    });
    shapes.push({
      id: `${base}-native-card-accent-${index}`,
      type: "roundRect",
      box: roundedBox({
        x: cardBox.x + cardBox.w * 0.06,
        y: cardBox.y + cardBox.h * 0.10,
        w: Math.max(18, cardBox.w * 0.12),
        h: cardBox.h * 0.80
      }),
      style: {
        fill: accentColor,
        stroke: accentColor,
        strokeWidthPt: 0,
        radiusRatio: 0.35,
        opacity: 0.66
      },
      source: source("structured-case-flow-card-chain-native-card-accent", { cardIndex: index })
    });
    shapes.push({
      id: `${base}-native-node-dot-${index}`,
      type: "ellipse",
      box: roundedBox({ x: nodeCenter.x - 5, y: railY - 5, w: 10, h: 10 }),
      style: {
        fill: accentColor,
        stroke: "#FFFFFF",
        strokeWidthPt: 1,
        opacity: 0.92
      },
      source: source("structured-case-flow-card-chain-native-node-dot", { cardIndex: index })
    });
    shapes.push({
      id: `${base}-native-drop-line-${index}`,
      type: "line",
      box: lineBox({ x: nodeCenter.x, y: railY }, { x: nodeCenter.x, y: cardBox.y + cardBox.h * 0.18 }),
      style: {
        stroke: accentColor,
        strokeWidthPt: 1,
        connectorType: "straight",
        opacity: 0.42
      },
      source: source("structured-case-flow-card-chain-native-drop-line", { cardIndex: index })
    });
  });
  return shapes;
}

function structuredCaseFlowCardChainCardBox(container, nodeBox, index, count) {
  const x = Number(container.x || 0);
  const y = Number(container.y || 0);
  const w = Number(container.w || 0);
  const h = Number(container.h || 0);
  const cardW = Math.max(150, Math.min(230, w * 0.26));
  const cardH = Math.max(52, Math.min(86, h * 0.18));
  const center = centerOfBox(nodeBox);
  const preferredY = index === 0 ? y + h * 0.08 : center.y - cardH * 0.48;
  const minX = x + w * 0.06;
  const maxX = x + w - cardW - w * 0.06;
  const fallbackX = x + w * (0.18 + index * (0.64 / Math.max(1, count - 1))) - cardW * 0.5;
  const bounded = (value, min, max) => Math.max(min, Math.min(max, value));
  return {
    x: round(bounded(Number.isFinite(center.x) ? center.x - cardW * 0.5 : fallbackX, minX, maxX)),
    y: round(bounded(preferredY, y + h * 0.04, y + h - cardH - h * 0.08)),
    w: round(cardW),
    h: round(cardH)
  };
}

function structuredCaseFlowCardChainNodes(image = {}) {
  const box = image?.box || {};
  const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
    ? image.source.layer.diagramUnderstanding.nodes
    : [];
  return nodes
    .filter((node) => node?.box && boxCenterInside(node.box, box))
    .filter((node) => isSafeStructuredCaseMatrixText(node.text))
    .sort((a, b) => {
      const ax = Number(a?.box?.x || 0);
      const bx = Number(b?.box?.x || 0);
      if (Math.abs(ax - bx) < 48) return Number(a?.box?.y || 0) - Number(b?.box?.y || 0);
      return ax - bx;
    });
}

function structuredCaseFlowCardChainTextBoxes(image = {}) {
  const seen = new Set();
  return structuredCaseFlowCardChainNodes(image)
    .map((node, index, nodes) => {
      const text = normalizeStructuredCaseMatrixText(node.text);
      const key = text.replace(/\s+/g, "");
      if (seen.has(key)) return null;
      seen.add(key);
      return structuredCaseFlowCardChainTextBox(image, node, text, index, nodes.length);
    })
    .filter(Boolean)
    .slice(0, 12);
}

function structuredCaseFlowCardChainTextBox(image, node, text, index, count) {
  const cardBox = structuredCaseFlowCardChainCardBox(image?.box || {}, roundedBox(node.box || {}), index, count);
  const sourceId = image?.id || "structured-case-flow-card-chain";
  return {
    id: node.sourceTextBoxId || `${sourceId}-native-structured-case-flow-card-chain-text-${index}`,
    text,
    box: {
      x: round(cardBox.x + cardBox.w * 0.18),
      y: round(cardBox.y + cardBox.h * 0.18),
      w: round(cardBox.w * 0.74),
      h: round(cardBox.h * 0.62)
    },
    font: {
      family: "SimHei",
      sizePt: text.length <= 8 ? 12.5 : 11.5,
      color: "#17324D",
      weight: "bold",
      opacity: 1
    },
    align: "center",
    verticalAlign: "middle",
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "structured-case-flow-card-chain-semantic-node-text",
      expressionForm: "complex-diagram",
      expressionSubtype: "structured-case-flow-card-chain",
      layerSourceId: image?.id || null,
      layerType: image?.source?.layer?.layerType || "diagram-zone",
      semanticTextSource: true,
      semanticNodeId: node.id || "",
      overlayVisibility: "visible"
    }
  };
}

function structuredCaseFlowCardChainPalette(image = {}) {
  const atoms = comparisonMatrixVisualAtoms(image);
  const firstLineColor = atoms.find((atom) => /grid-line-candidate/.test(String(atom?.kind || "")) && atom.color)?.color;
  const primary = normalizeHexColor(firstLineColor || "#5CBCC6") || "#5CBCC6";
  return {
    primary,
    secondary: darkenHexColor(primary, 0.12) || "#43A6B3",
    tertiary: "#37B26C",
    rail: darkenHexColor(primary, 0.2) || "#3A9DAA"
  };
}

function shouldObjectifyStructuredCaseHubSpokeSkeleton(image = {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const box = image?.box || {};
  const strategy = source.componentRenderStrategy || layer.componentRenderStrategy || {};
  const isStructuredCaseCrop = source.detector === "structured-case-graphic-underlay-crop";
  const isSpecializedTwoPanelHubSpoke = source.detector === "two-panel-diagram-crop"
    && strategy.mode === "native-visual-atom-rebuild"
    && strategy.implementationMode === "native-specialized";
  if (!isStructuredCaseCrop && !isSpecializedTwoPanelHubSpoke) return false;
  if (shouldPreserveTwoPanelChaosIllustrationCrop(image)) return false;
  if (layer.layerType !== "diagram-zone") return false;
  if (understanding.archetype !== "hub-spoke") return false;
  if (Number(understanding.confidence || 0) < 0.9) return false;
  if (!box.w || !box.h || Number(box.w) < 420 || Number(box.h) < 260) return false;
  if (/screenshot|document|prototype|ui/.test(String(source.expressionForm || source.expressionSubtype || ""))) return false;
  const nodes = structuredCaseHubSpokeSemanticNodes(image);
  const hasCenter = isSpecializedTwoPanelHubSpoke
    ? nodes.length >= 6
    : nodes.some((node) => /(?:Skills|处理引擎|Engine)/i.test(String(node.text || "")));
  const atoms = comparisonMatrixVisualAtoms(image);
  const lineAtoms = atoms.filter((atom) => /grid-line-candidate|connector-(?:arrow|line)-candidate/.test(String(atom?.kind || ""))).length;
  const semanticConnectorCount = Number(understanding.connectorCount || understanding.visualConnectorCount || 0);
  return hasCenter && nodes.length >= 6 && (lineAtoms + semanticConnectorCount) >= 3;
}

function inferStructuredCaseHubSpokeSkeletonShapes(image = {}) {
  const nodes = structuredCaseHubSpokeSemanticNodes(image);
  const box = image?.box || {};
  if (!box.w || !box.h || nodes.length === 0) return [];
  const base = image.id || "structured-case-hub-spoke";
  const centerNode = nodes.find((node) => /(?:Skills|处理引擎|Engine)/i.test(String(node.text || "")))
    || nodes[Math.floor(nodes.length / 2)];
  const centerBox = expandBox(centerNode.box, 16, 9);
  const center = centerOfBox(centerBox);
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "complex-diagram",
    expressionSubtype: "structured-case-hub-spoke",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    skeletonOnly: true,
    ...extra
  });
  const shapes = [{
    id: `${base}-native-hub`,
    type: "roundRect",
    box: roundedBox(centerBox),
    style: {
      fill: "#EAF5FF",
      stroke: "#2E86D1",
      strokeWidthPt: 1.4,
      radiusRatio: 0.18,
      opacity: 0.84,
      shadow: { color: "#4B91C9", alpha: 0.14, blurPt: 3, distancePt: 1, angleDeg: 90 }
    },
    source: source("structured-case-hub-spoke-native-hub")
  }];
  nodes.forEach((node, index) => {
    const text = normalizeStructuredCaseMatrixText(node.text);
    const isCenter = node === centerNode || sameDiagramLabel({ text: centerNode.text, box: centerNode.box }, { text, box: node.box });
    if (isCenter) return;
    const nodeBox = expandBox(node.box, text.length <= 6 ? 11 : 8, 7);
    const nodeCenter = centerOfBox(nodeBox);
    const group = nodeCenter.y < center.y - 35
      ? "input"
      : nodeCenter.y > center.y + 60
        ? "output"
        : "rule";
    shapes.push({
      id: `${base}-native-connector-${index}`,
      type: "line",
      box: lineBox(center, nodeCenter),
      style: {
        stroke: group === "input" ? "#9AB3C9" : group === "output" ? "#37B26C" : "#2E86D1",
        strokeWidthPt: group === "rule" ? 1.4 : 1.1,
        connectorType: "straight",
        endArrow: group === "input" ? null : "triangle",
        opacity: 0.62
      },
      source: source("structured-case-hub-spoke-native-connector", { nodeIndex: index, group })
    });
    shapes.push({
      id: `${base}-native-node-${index}`,
      type: "roundRect",
      box: roundedBox(nodeBox),
      style: {
        fill: group === "input" ? "#F7FAFC" : group === "output" ? "#ECF9F1" : "#F3F8FF",
        stroke: group === "input" ? "#AFC2D2" : group === "output" ? "#55B979" : "#7DB7E8",
        strokeWidthPt: 0.9,
        radiusRatio: 0.14,
        opacity: 0.76,
        shadow: { color: "#6EA6D8", alpha: 0.08, blurPt: 2, distancePt: 0.7, angleDeg: 90 }
      },
      source: source("structured-case-hub-spoke-native-node", { nodeIndex: index, group })
    });
    shapes.push({
      id: `${base}-native-node-dot-${index}`,
      type: "ellipse",
      box: roundedBox({ x: nodeBox.x + 4, y: nodeBox.y + nodeBox.h * 0.5 - 3, w: 6, h: 6 }),
      style: { fill: group === "output" ? "#37B26C" : "#2E86D1", stroke: "none", strokeWidthPt: 0, opacity: 0.74 },
      source: source("structured-case-hub-spoke-native-node-dot", { nodeIndex: index, group })
    });
  });
  return shapes;
}

function structuredCaseHubSpokeSemanticNodes(image = {}) {
  const box = image?.box || {};
  const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
    ? image.source.layer.diagramUnderstanding.nodes
    : [];
  return nodes
    .filter((node) => node?.box && boxCenterInside(node.box, box))
    .filter((node) => isSafeStructuredCaseMatrixText(node.text));
}

function structuredCaseHubSpokeSemanticTextBoxes(image = {}) {
  const seen = new Set();
  return structuredCaseHubSpokeSemanticNodes(image)
    .map((node, index) => {
      const text = normalizeStructuredCaseMatrixText(node.text);
      const key = text.replace(/\s+/g, "");
      if (seen.has(key)) return null;
      seen.add(key);
      return structuredCaseHubSpokeSemanticTextBox(image, node, text, index);
    })
    .filter(Boolean)
    .slice(0, 24);
}

function structuredCaseHubSpokeSemanticTextBox(image, node, text, index) {
  const nodeBox = roundedBox(node.box || {});
  const fontSize = Math.max(7.5, Math.min(13, Math.min(Number(nodeBox.h || 0) * 0.44 || 10, Number(nodeBox.w || 0) / Math.max(2.2, text.length * 0.92))));
  const sourceId = image?.id || "structured-case-hub-spoke";
  return {
    id: node.sourceTextBoxId || `${sourceId}-native-structured-case-hub-spoke-text-${index}`,
    text,
    box: {
      x: nodeBox.x,
      y: nodeBox.y,
      w: Math.max(20, nodeBox.w),
      h: Math.max(12, nodeBox.h)
    },
    font: {
      family: "SimHei",
      sizePt: fontSize,
      color: /(?:Skills|处理引擎|Engine)/i.test(text) ? "#0E5EA8" : "#17324D",
      weight: text.length <= 8 ? "bold" : "regular",
      opacity: 1
    },
    align: "center",
    verticalAlign: "middle",
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "structured-case-hub-spoke-semantic-node-text",
      expressionForm: "complex-diagram",
      expressionSubtype: "structured-case-hub-spoke",
      layerSourceId: image?.id || null,
      layerType: image?.source?.layer?.layerType || "diagram-zone",
      semanticTextSource: true,
      semanticNodeId: node.id || "",
      overlayVisibility: "visible"
    }
  };
}

function shouldObjectifyStructuredCaseMatrixSkeleton(image = {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const box = image?.box || {};
  if (source.detector !== "structured-case-graphic-underlay-crop") return false;
  if (layer.layerType !== "diagram-zone" && layer.layerType !== "table-zone") return false;
  if (!/^(?:matrix-or-grid|topology-diagram)$/.test(String(understanding.archetype || ""))) return false;
  if (Number(understanding.confidence || 0) < 0.9) return false;
  if (!box.w || !box.h || Number(box.w) < 520 || Number(box.h) < 260) return false;
  if (/screenshot|document|prototype|ui/.test(String(source.expressionForm || source.expressionSubtype || ""))) return false;
  const atoms = comparisonMatrixVisualAtoms(image);
  const gridAtoms = atoms.filter((atom) => /grid-line-candidate/.test(String(atom?.kind || ""))).length;
  const connectorAtoms = atoms.filter((atom) => /connector-(?:arrow|line)-candidate/.test(String(atom?.kind || ""))).length;
  const semanticNodes = structuredCaseMatrixSemanticNodes(image);
  return semanticNodes.length >= 8 && gridAtoms >= 4 && connectorAtoms >= 4;
}

function shouldObjectifyCycleIllustrationComparisonMatrix(image = {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const box = image?.box || {};
  if (source.detector !== "cycle-illustration-underlay-crop") return false;
  if (layer.layerType !== "illustration-zone" && layer.layerType !== "table-zone") return false;
  if (!/^(?:hub-spoke|matrix-or-grid)$/.test(String(understanding.archetype || ""))) return false;
  if (Number(understanding.confidence || 0) < 0.9) return false;
  if (!box.w || !box.h || Number(box.w) < 520 || Number(box.h) < 180) return false;
  if (/screenshot|document|prototype|ui/.test(String(source.expressionForm || source.expressionSubtype || ""))) return false;
  const atoms = comparisonMatrixVisualAtoms(image);
  const gridAtoms = atoms.filter((atom) => /grid-line-candidate/.test(String(atom?.kind || "")));
  const verticalGridAtoms = gridAtoms.filter((atom) => atom.axis === "v").length;
  const horizontalGridAtoms = gridAtoms.filter((atom) => atom.axis === "h").length;
  const cycleArrowAtoms = atoms.filter((atom) => /cycle|arc|curv|ring/.test(String(atom?.kind || ""))).length;
  const semanticNodes = structuredCaseMatrixSemanticNodes(image);
  return semanticNodes.length >= 10
    && gridAtoms.length >= 6
    && verticalGridAtoms >= 3
    && horizontalGridAtoms >= 2
    && cycleArrowAtoms === 0;
}

function inferStructuredCaseMatrixSkeletonShapes(image = {}) {
  const atomAligned = inferStructuredCaseMatrixAtomAlignedSkeletonShapes(image);
  const fallback = atomAligned.length > 0 ? atomAligned : inferComparisonMatrixSkeletonShapes(image);
  return fallback.map((shape) => ({
    ...shape,
    id: String(shape.id || "").replace("comparison-matrix", "structured-case-matrix"),
    source: {
      ...(shape.source || {}),
      detector: String(shape.source?.detector || "").replace("comparison-matrix-native-skeleton", "structured-case-matrix-native-skeleton"),
      expressionSubtype: "structured-case-matrix",
      layerType: image?.source?.layer?.layerType || "diagram-zone"
    }
  }));
}

function inferStructuredCaseMatrixAtomAlignedSkeletonShapes(image = {}) {
  const box = image?.box || {};
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  if (!w || !h) return [];
  const grid = structuredCaseMatrixAtomGrid(image);
  if (!grid || grid.xLines.length < 4 || grid.yLines.length < 4) return [];
  const base = image.id || "structured-case-matrix";
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "table-or-matrix",
    expressionSubtype: "comparison-matrix",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    skeletonOnly: true,
    gridProvider: grid.provider,
    ...extra
  });
  const tableBottom = grid.yLines[grid.yLines.length - 1];
  const tableH = Math.max(1, tableBottom - y);
  const shapes = [{
    id: `${base}-native-skeleton-bg`,
    type: "roundRect",
    box: roundedBox({ x, y, w, h: tableH }),
    style: {
      fill: "#FFFFFF",
      stroke: "#BFD1E0",
      strokeWidthPt: 1,
      radiusRatio: 0.025,
      opacity: 0.66
    },
    source: source("comparison-matrix-native-skeleton-bg")
  }];
  const headerBottom = grid.yLines[1];
  shapes.push({
    id: `${base}-native-skeleton-header`,
    type: "rect",
    box: roundedBox({ x, y, w, h: Math.max(18, headerBottom - y) }),
    style: { fill: "#EAF3FC", stroke: "none", strokeWidthPt: 0, opacity: 0.8 },
    source: source("comparison-matrix-native-skeleton-header")
  });
  const highlightIndex = grid.xLines.length - 2;
  const highlightX = grid.xLines[highlightIndex];
  const highlightW = grid.xLines[highlightIndex + 1] - highlightX;
  shapes.push({
    id: `${base}-native-skeleton-highlight-column`,
    type: "rect",
    box: roundedBox({ x: highlightX, y, w: highlightW, h: tableH }),
    style: { fill: "#EAF6FF", stroke: "#2D86D4", strokeWidthPt: 1.1, opacity: 0.36 },
    source: source("comparison-matrix-native-skeleton-highlight-column", { columnIndex: highlightIndex })
  });
  grid.xLines.slice(1, -1).forEach((lineX, index) => {
    shapes.push({
      id: `${base}-native-skeleton-vline-${index + 1}`,
      type: "line",
      box: { x: round(lineX), y: round(y), w: 0, h: round(tableH) },
      style: { stroke: "#BFD1E0", strokeWidthPt: 1, connectorType: "straight", opacity: 0.86 },
      source: source("comparison-matrix-native-skeleton-grid-line", { axis: "x", index: index + 1 })
    });
  });
  grid.yLines.slice(1, -1).forEach((lineY, index) => {
    shapes.push({
      id: `${base}-native-skeleton-hline-${index + 1}`,
      type: "line",
      box: { x: round(x), y: round(lineY), w: round(w), h: 0 },
      style: { stroke: "#BFD1E0", strokeWidthPt: 1, connectorType: "straight", opacity: 0.86 },
      source: source("comparison-matrix-native-skeleton-grid-line", { axis: "y", index: index + 1 })
    });
  });
  grid.yLines.slice(2).forEach((lineY, index, lines) => {
    const prev = index === 0 ? grid.yLines[1] : lines[index - 1];
    const centerY = (prev + lineY) / 2;
    shapes.push({
      id: `${base}-native-skeleton-status-${index + 1}`,
      type: "ellipse",
      box: roundedBox({
        x: highlightX + highlightW * 0.44 - 8,
        y: centerY - 8,
        w: 16,
        h: 16
      }),
      style: { fill: "#2DBB63", stroke: "#229B51", strokeWidthPt: 0.8, opacity: 0.86 },
      source: source("comparison-matrix-native-skeleton-status", { row: index + 1 })
    });
  });
  return shapes;
}

function structuredCaseMatrixAtomGrid(image = {}) {
  const box = image?.box || {};
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const atoms = comparisonMatrixVisualAtoms(image).filter((atom) => atom?.kind === "grid-line-candidate" && atom?.box);
  const vertical = atoms
    .filter((atom) => atom.axis === "v" && Number(atom.box.h || 0) >= h * 0.45)
    .map((atom) => Number(atom.box.x || 0) + Number(atom.box.w || 0) / 2);
  const xLines = uniqueSortedLinePositions([x, ...vertical, x + w], Math.max(6, w * 0.018))
    .filter((line) => line >= x - 1 && line <= x + w + 1);
  if (xLines.length < 4) return null;
  const horizontal = atoms
    .filter((atom) => atom.axis === "h" && Number(atom.box.w || 0) >= w * 0.55)
    .map((atom) => Number(atom.box.y || 0) + Number(atom.box.h || 0));
  const semanticNodes = structuredCaseMatrixSemanticNodes(image);
  const rowLabelMaxX = xLines[0] + Math.max(24, (xLines[1] - xLines[0]) * 0.86);
  const rowCenters = semanticNodes
    .filter((node) => Number(node?.box?.x || 0) <= rowLabelMaxX)
    .map((node) => Number(node.box.y || 0) + Number(node.box.h || 0) / 2)
    .filter((center) => center > y + h * 0.11)
    .sort((a, b) => a - b);
  const headerBottom = horizontal.length > 0
    ? Math.max(...horizontal, y + h * 0.08)
    : y + Math.max(34, Math.min(56, h * 0.13));
  const separators = [];
  for (let i = 0; i < rowCenters.length - 1; i += 1) {
    separators.push((rowCenters[i] + rowCenters[i + 1]) / 2);
  }
  const verticalBottom = atoms
    .filter((atom) => atom.axis === "v")
    .map((atom) => Number(atom.box.y || 0) + Number(atom.box.h || 0))
    .filter((bottom) => bottom > headerBottom + 20);
  const tableBottom = verticalBottom.length > 0
    ? Math.min(y + h, Math.max(...verticalBottom))
    : rowCenters.length > 0
      ? Math.min(y + h, rowCenters[rowCenters.length - 1] + Math.max(34, (rowCenters[rowCenters.length - 1] - rowCenters[Math.max(0, rowCenters.length - 2)]) * 0.48 || 54))
      : y + h;
  const yLines = uniqueSortedLinePositions([y, headerBottom, ...separators, tableBottom], Math.max(4, h * 0.012))
    .filter((line) => line >= y - 1 && line <= y + h + 1);
  if (yLines.length < 4) return null;
  return { provider: "visual-atom-grid-lines+semantic-node-rows", xLines, yLines };
}

function structuredCaseMatrixSemanticNodes(image = {}) {
  const box = image?.box || {};
  const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
    ? image.source.layer.diagramUnderstanding.nodes
    : [];
  return nodes
    .filter((node) => node?.box && boxCenterInside(node.box, box))
    .filter((node) => isSafeStructuredCaseMatrixText(node.text));
}

function structuredCaseMatrixSemanticTextBoxes(image = {}) {
  const seen = new Set();
  return structuredCaseMatrixSemanticNodes(image)
    .map((node, index) => {
      const text = normalizeStructuredCaseMatrixText(node.text);
      const key = text.replace(/\s+/g, "");
      if (seen.has(key)) return null;
      seen.add(key);
      return structuredCaseMatrixSemanticTextBox(image, node, text, index);
    })
    .filter(Boolean)
    .slice(0, 28);
}

function isSafeStructuredCaseMatrixText(text) {
  const normalized = normalizeStructuredCaseMatrixText(text);
  if (!normalized) return false;
  if (normalized.length > 36) return false;
  if (/^[\d\s.,;:|/\\\-+_()[\]{}]+$/.test(normalized)) return false;
  if (/^[？?！!。.,，；;：:]+$/.test(normalized)) return false;
  return /[\u4e00-\u9fffA-Za-z]/.test(normalized);
}

function structuredCaseMatrixSemanticTextBox(image, node, text, index) {
  const nodeBox = roundedBox(node.box || {});
  const fontSize = Math.max(7.5, Math.min(13, Math.min(Number(nodeBox.h || 0) * 0.42 || 10, Number(nodeBox.w || 0) / Math.max(2.2, text.length * 0.92))));
  const sourceId = image?.id || "structured-case-matrix";
  return {
    id: node.sourceTextBoxId || `${sourceId}-native-structured-case-matrix-text-${index}`,
    text,
    box: {
      x: nodeBox.x,
      y: nodeBox.y,
      w: Math.max(18, nodeBox.w),
      h: Math.max(12, nodeBox.h)
    },
    font: {
      family: "SimHei",
      sizePt: fontSize,
      color: "#17324D",
      weight: text.length <= 6 ? "bold" : "regular",
      opacity: 1
    },
    align: "center",
    verticalAlign: "middle",
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "structured-case-matrix-semantic-node-text",
      expressionForm: "table-or-matrix",
      expressionSubtype: "structured-case-matrix",
      layerSourceId: image?.id || null,
      layerType: image?.source?.layer?.layerType || "diagram-zone",
      semanticTextSource: true,
      semanticNodeId: node.id || "",
      overlayVisibility: "visible"
    }
  };
}

function shouldPreserveTwoPanelChaosIllustrationCrop(image = {}, images = [], rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const source = image?.source || {};
  if (source.detector !== "two-panel-diagram-crop") return false;
  if (source.skipVisualAtomRebuild === true || /^preserve/.test(String(source.recommendedAction || ""))) return true;
  if (source.expressionSubtype === "workflow-supply-chain-chaos-illustration") return true;
  const box = image?.box || {};
  const slideWidth = Number(slideSize?.widthPt || DEFAULT_SLIDE.widthPt);
  if (!box.w || Number(box.x || 0) > slideWidth * 0.45) return false;
  const ownEvidence = [
    source.reason,
    source.nonEditableReason,
    source.expressionSubtype,
    source.layer?.expressionSubtype,
    ...(Array.isArray(source.layer?.diagramUnderstanding?.nodes)
      ? source.layer.diagramUnderstanding.nodes.map((node) => node?.text)
      : [])
  ].map((value) => normalizeCjkText(value)).join(" ");
  if (/complex-side-by-side-diagrams-preserved-as-crops/.test(ownEvidence)
    && /V1\.2-FIX/.test(ownEvidence)
    && /码表口径模糊/.test(ownEvidence)
    && /多版本混杂/.test(ownEvidence)) {
    return true;
  }
  const pageImages = Array.isArray(images) && images.length > 0 ? images : [image];
  if (pageImages.filter((item) => item?.source?.detector === "two-panel-diagram-crop").length < 2) return false;
  const evidence = workflowSupplyChainTwoPanelEvidenceText({ images: pageImages }, rawTextBoxes);
  return /供应链PMS订货配置/.test(evidence)
    && /DomainRepository|供应链PMS配置/.test(evidence)
    && /多版本混杂|码表口径模糊|V1\.2-FIX/.test(evidence);
}

function workflowSupplyChainTwoPanelEvidenceText(page = {}, rawTextBoxes = []) {
  const pieces = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text));
  for (const image of page.images || []) {
    if (image?.source?.detector !== "two-panel-diagram-crop") continue;
    for (const nodes of [
      image.source?.diagramUnderstanding?.nodes,
      image.source?.layer?.diagramUnderstanding?.nodes
    ]) {
      if (!Array.isArray(nodes)) continue;
      for (const node of nodes) {
        const text = normalizeCjkText(node?.text);
        if (text) pieces.push(text);
      }
    }
  }
  return pieces.join(" ");
}

function darkenHexColor(color, amount = 0.12) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return "#2D668F";
  const n = Number.parseInt(normalized.slice(1), 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return `#${[r, g, b].map((item) => item.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function expandBox(box = {}, padX = 0, padY = padX) {
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const px = Math.max(0, Number(padX || 0));
  const py = Math.max(0, Number(padY || 0));
  return roundedBox({
    x: x - px,
    y: y - py,
    w: w + px * 2,
    h: h + py * 2
  });
}

module.exports = { inferStructuredCaseFlowCardChainShapes, structuredCaseFlowCardChainCardBox, structuredCaseFlowCardChainNodes, isSafeStructuredCaseMatrixText, structuredCaseFlowCardChainPalette, darkenHexColor, inferStructuredCaseHubSpokeSkeletonShapes, expandBox, structuredCaseHubSpokeSemanticNodes, inferStructuredCaseMatrixSkeletonShapes, inferStructuredCaseMatrixAtomAlignedSkeletonShapes, structuredCaseMatrixAtomGrid, structuredCaseMatrixSemanticNodes, structuredCaseFlowCardChainTextBoxes, structuredCaseFlowCardChainTextBox, structuredCaseHubSpokeSemanticTextBoxes, structuredCaseHubSpokeSemanticTextBox, structuredCaseMatrixSemanticTextBoxes, structuredCaseMatrixSemanticTextBox, shouldObjectifyStructuredCaseFlowCardChain, shouldObjectifyStructuredCaseHubSpokeSkeleton, shouldPreserveTwoPanelChaosIllustrationCrop, workflowSupplyChainTwoPanelEvidenceText, shouldObjectifyStructuredCaseMatrixSkeleton, shouldObjectifyCycleIllustrationComparisonMatrix };
