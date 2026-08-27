"use strict";

const { inferVisualGridCells } = require("./visual-grid-cells");
const { inferSemanticMatrixGrid } = require("./semantic-matrix-grid");
const { detectPixelVennLobes } = require("./pixel-venn-detector");
const { detectPixelConcentricCircles } = require("./pixel-concentric-detector");
const { createDetectionResult } = require("./detection-result");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function understandDiagramLayer(item = {}, page = {}, slideSize = DEFAULT_SLIDE, options = {}) {
  const box = item.box || {};
  const textBoxes = textBoxesInside(page.textBoxes || [], box);
  const semanticText = semanticTextForDiagram({ item, textBoxes, options });
  const inputVisualAtoms = Array.isArray(options.visualAtoms) ? options.visualAtoms : [];
  const recoveredVennLobes = inputVisualAtoms.filter((atom) => atom?.kind === "native-venn-ellipse-candidate").length >= 2
    ? []
    : detectPixelVennLobes(options.sourceImage, box, slideSize);
  const recoveredConcentricCircles = inputVisualAtoms.filter((atom) => atom?.kind === "native-concentric-circle-candidate").length >= 3
    ? []
    : detectPixelConcentricCircles(options.sourceImage, box, slideSize);
  const retainedAfterVenn = recoveredVennLobes.length > 0
    ? inputVisualAtoms.filter((atom) => !isRecoveredVennMergeArtifact(atom, recoveredVennLobes))
    : inputVisualAtoms;
  const retainedInputAtoms = recoveredConcentricCircles.length >= 3
    ? retainedAfterVenn.filter((atom) => !isRecoveredConcentricArtifact(atom, recoveredConcentricCircles))
    : retainedAfterVenn;
  const visualAtoms = protectScreenshotTextureCluster(
    [...retainedInputAtoms, ...recoveredVennLobes, ...recoveredConcentricCircles],
    box
  );
  const atomVisualGrid = inferVisualGridStructure(visualAtoms, box);
  const semanticVisualGrid = inferSemanticMatrixGrid(options.sourceImage, box, slideSize, semanticText);
  const inferredVisualGrid = preferSemanticMatrixGrid(semanticVisualGrid, atomVisualGrid);
  const visualGridCells = inferVisualGridCells(inferredVisualGrid, options.sourceImage, slideSize);
  const visualGrid = inferredVisualGrid && visualGridCells.length > 0
    ? { ...inferredVisualGrid, cells: visualGridCells }
    : inferredVisualGrid;
  const visualNodes = inferVisualAtomNodes(visualAtoms);
  const visualConnectors = inferVisualAtomConnectors(visualAtoms, visualNodes);
  const nodes = inferNodes(textBoxes, box);
  const archetype = inferArchetype({ item, nodes, textBoxes, visualAtoms, visualNodes, visualConnectors, visualGrid, box, slideSize });
  const connectors = inferConnectors(archetype, nodes, visualAtoms);
  const residuals = inferResiduals({ item, archetype, nodes, visualAtoms, visualNodes, visualConnectors, box });
  const confidence = scoreUnderstanding({ archetype, nodes, connectors, residuals, item, visualAtoms, visualNodes, visualConnectors, visualGrid });
  const nativeReadiness = readinessFor({ archetype, confidence, nodes, connectors, residuals, visualAtoms, visualNodes, visualConnectors, visualGrid });
  const structureSignature = inferStructureSignature({ archetype, nodes, visualAtoms, visualNodes, visualConnectors, visualGrid, box });
  const expressionFamily = inferExpressionFamily({ archetype, nativeReadiness, structureSignature, item, visualAtoms, visualNodes, visualConnectors, visualGrid, semanticText });
  const componentStrategy = inferComponentStrategy({
    archetype,
    confidence,
    nativeReadiness,
    nodes,
    connectors,
    residuals,
    visualAtoms,
    visualNodes,
    visualConnectors,
    visualGrid,
    structureSignature,
    semanticText,
    expressionSubtype: item.source?.expressionSubtype || ""
  });
  const targetMotifs = inferTargetMotifs({ archetype, nodes, visualAtoms, visualNodes, visualConnectors, visualGrid, componentStrategy, structureSignature, semanticText });
  const detectionResult = createDetectionResult({
    matched: archetype !== "unknown",
    confidence,
    bounds: box,
    evidence: [
      { code: "diagram.text-boxes", score: clamp(textBoxes.length / 12, 0, 1), box },
      { code: "diagram.visual-atoms", score: clamp(visualAtoms.length / 24, 0, 1), box },
      { code: "diagram.connectors", score: clamp((connectors.length + visualConnectors.length) / 12, 0, 1), box }
    ],
    reasonCodes: [`diagram.${archetype || "unknown"}`],
    claimedRegions: archetype !== "unknown" ? [{
      id: `${archetype}-region`,
      box,
      purpose: nativeReadiness === "native-rebuild" ? "native-rebuild" : "hybrid-rebuild",
      dropResidual: nativeReadiness === "native-rebuild"
    }] : [],
    diagnostics: {
      "node-count": nodes.length + visualNodes.length,
      "connector-count": connectors.length + visualConnectors.length,
      "residual-count": residuals.length,
      readiness: String(nativeReadiness || "unknown").toLowerCase()
    }
  });
  return {
    provider: "diagram-understanding-v1",
    archetype,
    expressionFamily,
    confidence,
    nativeReadiness,
    componentStrategy: {
      ...componentStrategy,
      ...(targetMotifs.length ? { targetMotifs } : {})
    },
    ...(targetMotifs.length ? { targetMotifs } : {}),
    ...(structureSignature ? { structureSignature: { expressionFamily, ...structureSignature } } : {}),
    nodeCount: nodes.length,
    connectorCount: connectors.length,
    residualCount: residuals.length,
    visualAtomCount: visualAtoms.length,
    visualAtomKindCounts: countBy(visualAtoms, "kind"),
    visualNodeCount: visualNodes.length,
    visualConnectorCount: visualConnectors.length,
    visualGrid,
    nodes,
    connectors,
    residuals,
    visualNodes,
    visualConnectors,
    visualAtoms: visualAtoms.slice(0, 40),
    evidence: {
      textBoxCount: textBoxes.length,
      detector: item.source?.detector || "unknown",
      expressionSubtype: item.source?.expressionSubtype || null,
      ...(semanticText ? { semanticText } : {}),
      regionBox: box
    },
    detectionResult
  };
}

function isRecoveredVennMergeArtifact(atom = {}, lobes = []) {
  if (atom?.kind !== "native-rect-candidate" || !atom?.box || lobes.length < 2) return false;
  const union = lobes.reduce((result, lobe) => {
    const lobeBox = lobe.box || {};
    if (!result) return { ...lobeBox };
    const left = Math.min(Number(result.x || 0), Number(lobeBox.x || 0));
    const top = Math.min(Number(result.y || 0), Number(lobeBox.y || 0));
    const right = Math.max(Number(result.x || 0) + Number(result.w || 0), Number(lobeBox.x || 0) + Number(lobeBox.w || 0));
    const bottom = Math.max(Number(result.y || 0) + Number(result.h || 0), Number(lobeBox.y || 0) + Number(lobeBox.h || 0));
    return { x: left, y: top, w: right - left, h: bottom - top };
  }, null);
  return overlapRatio(atom.box, union) >= 0.86 && overlapRatio(union, atom.box) >= 0.86;
}

function isRecoveredConcentricArtifact(atom = {}, circles = []) {
  if (!atom?.box || circles.length < 3) return false;
  const outer = circles[0]?.box;
  if (!outer) return false;
  if (String(atom?.source?.detector || "") === "dense-linked-node-visual-atom") {
    const centerX = Number(atom.box.x || 0) + Number(atom.box.w || 0) / 2;
    const centerY = Number(atom.box.y || 0) + Number(atom.box.h || 0) / 2;
    return centerX >= Number(outer.x || 0) && centerX <= Number(outer.x || 0) + Number(outer.w || 0)
      && centerY >= Number(outer.y || 0) && centerY <= Number(outer.y || 0) + Number(outer.h || 0);
  }
  return atom.kind === "native-ellipse-candidate"
    && overlapRatio(atom.box, outer) >= 0.9
    && overlapRatio(outer, atom.box) >= 0.9;
}

function protectScreenshotTextureCluster(visualAtoms = [], box = {}) {
  const densityPeaks = visualAtoms.filter((atom) => String(atom?.source?.detector || "") === "dense-linked-node-visual-atom" && atom?.box);
  if (densityPeaks.length < 8 || densityPeaks.length < visualAtoms.length * 0.45) return visualAtoms;
  const colorCounts = countBy(densityPeaks.map((atom) => ({ color: String(atom.color || "").toLowerCase() })), "color");
  const dominantColorCount = Math.max(0, ...Object.values(colorCounts));
  if (dominantColorCount < densityPeaks.length * 0.72) return visualAtoms;
  const horizontalLines = visualAtoms
    .filter((atom) => atom?.kind === "grid-line-candidate" && atom?.box)
    .filter((atom) => Number(atom.box.w || 0) >= Number(box.w || 0) * 0.38 && Number(atom.box.h || 0) <= Number(box.h || 0) * 0.06)
    .sort((left, right) => Number(left.box.y || 0) - Number(right.box.y || 0));
  const hasCloseLinePair = horizontalLines.some((line, index) => horizontalLines.slice(index + 1).some((peer) =>
    Math.abs(Number(peer.box.y || 0) - Number(line.box.y || 0)) <= Number(box.h || 0) * 0.08
  ));
  if (!hasCloseLinePair) return visualAtoms;
  const trueConnectors = visualAtoms.filter((atom) => ["connector-line-candidate", "connector-arrow-candidate"].includes(atom?.kind));
  if (trueConnectors.length > 2) return visualAtoms;
  return [
    ...visualAtoms.filter((atom) => String(atom?.source?.detector || "") !== "dense-linked-node-visual-atom" && atom?.kind !== "native-cycle-arrow-candidate"),
    {
      id: "pixel-screenshot-texture-cluster",
      kind: "screenshot-crop-candidate",
      shapeHint: "complex",
      box: { ...box },
      nativeCandidate: false,
      residualCandidate: true,
      source: {
        detector: "pixel-screenshot-texture-cluster",
        sourceImageDetected: true,
        method: "repeated-density-peaks-with-adjacent-ui-rows"
      }
    }
  ];
}

function preferSemanticMatrixGrid(semanticGrid, atomGrid) {
  if (!semanticGrid) return atomGrid;
  if (!atomGrid) return semanticGrid;
  if (Number(semanticGrid.lineCount || 0) >= Number(atomGrid.lineCount || 0)) return semanticGrid;
  if (Number(semanticGrid.rows || 0) * Number(semanticGrid.columns || 0) > Number(atomGrid.rows || 0) * Number(atomGrid.columns || 0)) return semanticGrid;
  return atomGrid;
}

function semanticTextForDiagram({ item = {}, textBoxes = [], options = {} } = {}) {
  return [
    options.semanticText,
    item.source?.pageSemanticText,
    item.source?.semanticText,
    item.source?.reason,
    item.source?.expressionSubtype,
    ...textBoxes.map((textBox) => textBox?.text)
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 500)
    .toLowerCase();
}

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

function inferArchetype({ item, nodes, textBoxes, visualAtoms, visualNodes = [], visualConnectors = [], visualGrid, box, slideSize }) {
  const detector = String(item.source?.detector || "").toLowerCase();
  const form = String(item.source?.expressionForm || "").toLowerCase();
  const subtype = String(item.source?.expressionSubtype || "").toLowerCase();
  const text = `${detector} ${form} ${subtype} ${textBoxes.map((entry) => entry.text).join(" ")}`.toLowerCase();
  const atomKinds = countBy(visualAtoms, "kind");
  if (visualAtoms.some((atom) => String(atom?.source?.detector || "") === "pixel-screenshot-texture-cluster")) return "screenshot-card-grid";
  if (/qr[-_\s]?code|quick[-_\s]?response|barcode|bar[-_\s]?code|data[-_\s]?matrix|machine[-_\s]?readable|二维码|条形码|条码|机器码|扫码/.test(text)) return "machine-readable-code";
  if (looksLikeScreenshotCardGrid(text, atomKinds, visualNodes, visualGrid, nodes, box)) return "screenshot-card-grid";
  if (looksLikeScreenshotZoomCallout(text, atomKinds)) return "screenshot-zoom-callout";
  if (looksLikeAnnotatedScreenshot(text, atomKinds)) return "screenshot-annotation";
  if (looksLikeVisualExampleCardGrid(visualNodes, visualGrid, nodes, visualAtoms, box, text)) return "visual-example-card-grid";
  if (looksLikeFeatureIconCardGrid(visualNodes, visualGrid, nodes, visualAtoms, box, text)) return "feature-icon-card-grid";
  if (looksLikeNumberedStepCardGrid(visualNodes, visualGrid, nodes, visualAtoms, box, text)) return "numbered-step-card-grid";
  if (looksLikeDashboardCardGrid(visualNodes, visualGrid, nodes, box, text)) return "dashboard-card-grid";
  if (looksLikeQuadrantMatrix(visualGrid, visualAtoms, visualNodes, box, text)) return "quadrant-matrix";
  if (looksLikeComparisonMatrix(visualGrid, visualNodes, nodes, box, text)) return "comparison-matrix";
  if (looksLikeHeatmapMatrix(visualGrid, visualNodes, nodes, box, text)) return "heatmap-matrix";
  // Segmented circular primitives are stronger evidence than generic words
  // such as "market share", which occur in both pie and treemap captions.
  if (looksLikeVisualPieChart(visualAtoms, box, text)) return "pie-chart";
  if (looksLikeVisualDonutChart(visualAtoms, box, text)) return "donut-chart";
  if (looksLikeTreemapDiagram(visualGrid, visualNodes, nodes, box, text)) return "treemap-chart";
  if (looksLikeSankeyFlowDiagram(visualNodes, nodes, box, text)) return "sankey-flow-chart";
  if (visualGrid && visualGrid.rows >= 2 && visualGrid.columns >= 2 && visualGrid.coverageRatio >= 0.45) return "matrix-or-grid";
  if (/quadrant|四象限|象限图|优先级矩阵|影响.?成本|价值.?难度|重要.?紧急/.test(text)) return "quadrant-matrix";
  if (/comparison|compare|versus|\bvs\b|before.?after|pros.?cons|竞品|对比|比较|方案对照|优劣|优缺点|前后对比/.test(text)) return "comparison-matrix";
  if (/heat[-_\s]?map|risk.?matrix|color[-_\s]?scale|热力图|热力矩阵|风险矩阵|色阶|色块矩阵|分布矩阵/.test(text)) return "heatmap-matrix";
  if (/tree[-_\s]?map|area[-_\s]?map|market.?share|composition|矩形树图|树图|面积占比|面积分布|构成占比|份额构成/.test(text)) return "treemap-chart";
  if (/sankey|alluvial|flow.?distribution|flow.?composition|energy.?flow|user.?journey.?flow|桑基图|流向图|流量分布|流转分布|流向分布|能量流|用户流转|路径流转/.test(text)) return "sankey-flow-chart";
  if (/map[-_\s]?chart|geo[-_\s]?map|choropleth|regional[-_\s]?map|china[-_\s]?map|world[-_\s]?map|地图图表|地图图示|区域地图|中国地图|世界地图|地理分布|区域分布|地图热力/.test(text)) return "map-chart";
  if (/word[-_\s]?cloud|tag[-_\s]?cloud|keyword[-_\s]?cloud|关键词云|标签云|文字云|词云|热词云|词频云/.test(text)) return "word-cloud-chart";
  if (/matrix|table|grid/.test(text)) return "matrix-or-grid";
  if (/gauge[-_\s]?chart|speedometer|dial[-_\s]?chart|semi[-_\s]?circle[-_\s]?gauge|仪表图|仪表盘图|速度表|半圆仪表|进度仪表|评分仪表/.test(text) || looksLikeVisualGaugeChart(visualAtoms)) return "gauge-chart";
  if (/radar[-_\s]?chart|spider[-_\s]?chart|web[-_\s]?chart|polar[-_\s]?chart|雷达图|蛛网图|蜘蛛网图|能力雷达|维度评分|多维评分|能力模型/.test(text)) return "radar-chart";
  if (/concentric[-_\s]?circles?|onion[-_\s]?diagram|nested[-_\s]?circles?|layered[-_\s]?circles?|同心圆|洋葱图|嵌套圆|层级圆|圈层模型|圈层结构/.test(text) || looksLikeVisualConcentricCircles(visualAtoms)) return "concentric-circles";
  if (/gantt|schedule|project[-_\s]?plan|项目排期|甘特|排期图|计划表/.test(text) || looksLikeVisualGanttRoadmap(visualNodes, visualAtoms, box, text)) return "gantt-roadmap";
  if (/waterfall|bridge[-_\s]?chart|variance[-_\s]?bridge|瀑布图|桥图|增减分析|增减桥|差异桥/.test(text) || looksLikeVisualWaterfallChart(visualNodes, visualAtoms, box, text)) return "waterfall-chart";
  if (looksLikeVisualBarChart(visualNodes, visualAtoms, box) || /bar[-_\s]?chart|column[-_\s]?chart|柱状图|条形图/.test(text)) return "bar-chart";
  if (looksLikeVisualScatterChart(visualAtoms, box, text)) return "scatter-chart";
  if (looksLikeVisualLineChart(visualAtoms, box, text)) return "line-chart";
  // A magnifier can resemble an asymmetric ring. Resolve the stronger
  // handle-plus-convergence evidence before the generic cycle heuristic.
  if (/lens[-_\s]?funnel|funnel[-_\s]?flow|converge|convergence|magnifier[-_\s]?flow|放大镜流程|漏斗流程|收敛流程|聚焦分析|需求分析/.test(text) || looksLikeVisualFunnelLensFlow(visualAtoms, visualNodes, visualConnectors, box, text)) return "funnel-lens-flow";
  if (looksLikeVisualCycleLoop(visualAtoms, visualNodes, box, text)) return "cycle-loop";
  if (/timeline|roadmap|milestone|时间轴|里程碑|路线图/.test(text) || looksLikeVisualTimelineRoadmap(visualAtoms, visualNodes, box, text)) return "timeline-roadmap";
  if (/venn|overlap|intersection|set[-_\s]?relation|集合|交集|重叠关系|重叠图/.test(text) || looksLikeVisualVennDiagram(visualNodes, box, text)) return "venn-overlap";
  if (/fishbone|cause[-_\s]?effect|root[-_\s]?cause|ishikawa|branch[-_\s]?analysis|causal[-_\s]?branch|鱼骨图|因果分析|根因分析|分支分析/.test(text) || looksLikeVisualFishboneDiagram(visualAtoms, visualNodes, box, text)) return "fishbone-cause-effect";
  if (/pyramid|layered[-_\s]?stack|funnel[-_\s]?diagram|金字塔|分层|层级漏斗|阶梯图|漏斗图/.test(text) || looksLikeVisualLayeredStack(visualNodes, box, text)) return "layered-stack";
  if (/triangle|topology|铁三角|闭环/.test(text)) return "topology-diagram";
  if (looksLikeDenseRadialLineArt(visualAtoms, visualNodes, box, text)) return "dense-radial-line-art";
  if (/screenshot|ui|screen|截图|界面|文档/.test(text) && /flow|流程|->|→|输入|输出|生成/.test(text)) return "process-with-screenshots";
  if (/flow|chain|stage|linear|流程|步骤|阶段|->|→/.test(text) || looksLikeLinearFlow(nodes)) return "flow-card-chain";
  if (looksLikeVisualLinearFlow(visualNodes, box)) return "flow-card-chain";
  if (looksLikeVisualHubSpoke(visualNodes, visualConnectors, box)) return "hub-spoke";
  if (looksLikeVisualTreeStructure(visualNodes, visualAtoms, box)) return "tree-structure";
  if (looksLikeVisualSwimlaneFlow(visualNodes, visualAtoms, box)) return "swimlane-flow";
  if (nativeNodeAtomCount(atomKinds) >= 3 && connectorAtomCount(atomKinds) >= 2) return "generic-node-diagram";
  if ((atomKinds["screenshot-crop-candidate"] || 0) >= 1 && nodes.length >= 2) return "process-with-screenshots";
  if (/hub|spoke|network|radial|中心|核心|引擎/.test(text) || looksLikeHubSpoke(nodes, box)) return "hub-spoke";
  if (nodes.length >= 6 && dispersion(nodes, slideSize) > 0.35) return "multi-cluster-diagram";
  if (nativeNodeAtomCount(atomKinds) >= 2) return "generic-node-diagram";
  return nodes.length >= 3 ? "generic-node-diagram" : "unclassified-diagram";
}

function looksLikeDenseRadialLineArt(visualAtoms = [], visualNodes = [], box = {}, text = "") {
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const semantic = /dense[-_\s]?complex[-_\s]?diagram|foreground[-_\s]?aggregate|dispersed[-_\s]?thin[-_\s]?graphics|radial[-_\s]?(?:network|line[-_\s]?art)|放射线网|密集放射|同心多边形/.test(String(text || ""));
  const tinyNodes = (visualNodes || []).filter((node) => {
    const nodeBox = node?.box || {};
    const areaRatio = boxArea(nodeBox) / regionArea;
    const aspect = Number(nodeBox.w || 0) / Math.max(1, Number(nodeBox.h || 0));
    return areaRatio >= 0.00008 && areaRatio <= 0.0035 && aspect >= 0.55 && aspect <= 1.8;
  });
  const cardNodes = (visualNodes || []).filter((node) => boxArea(node?.box || {}) / regionArea >= 0.008);
  const longLineAtoms = (visualAtoms || []).filter((atom) => {
    if (!["grid-line-candidate", "connector-line-candidate"].includes(String(atom?.kind || ""))) return false;
    const atomBox = atom?.box || {};
    return Number(atomBox.w || 0) >= Number(box.w || 0) * 0.5
      || Number(atomBox.h || 0) >= Number(box.h || 0) * 0.62;
  });
  const explicitConnectors = (visualAtoms || []).filter((atom) => atom?.kind === "connector-arrow-candidate" || atom?.lineEndpoints?.from && atom?.lineEndpoints?.to);
  if (cardNodes.length > 0 || explicitConnectors.length > 2) return false;
  return tinyNodes.length >= 16
    && longLineAtoms.length >= 6
    && (semantic || tinyNodes.length >= 24 && longLineAtoms.length >= 8);
}

function looksLikeLinearFlow(nodes) {
  if (nodes.length < 3) return false;
  const sorted = [...nodes].sort((a, b) => a.center.x - b.center.x);
  const width = Math.max(1, sorted[sorted.length - 1].center.x - sorted[0].center.x);
  const yValues = sorted.map((node) => node.center.y);
  const ySpread = Math.max(...yValues) - Math.min(...yValues);
  const xMonotonic = sorted.every((node, index) => index === 0 || node.center.x >= sorted[index - 1].center.x);
  return xMonotonic && width > 160 && ySpread < 120;
}

function looksLikeAnnotatedScreenshot(text = "", atomKinds = {}) {
  const value = String(text || "").toLowerCase();
  const screenshotEvidence = /screenshot|screen[-_\s]?capture|ui[-_\s]?capture|mockup|interface|web[-_\s]?page|app[-_\s]?screen|截图|界面|页面截图|产品截图|系统截图|网页截图/.test(value);
  if (!screenshotEvidence) return false;
  const annotationEvidence = /annotation|annotated|callout|highlight|markup|redline|spotlight|magnifier|zoom[-_\s]?in|numbered|labelled|labeled|arrow[-_\s]?callout|截图标注|界面标注|页面标注|标注|批注|注释|说明气泡|气泡说明|框选|圈选|高亮|箭头说明|编号|放大镜|局部放大|重点标记/.test(value);
  const overlayAtomEvidence = (atomKinds["connector-arrow-candidate"] || 0) >= 1
    || (atomKinds["connector-line-candidate"] || 0) >= 1
    || (atomKinds["native-rect-candidate"] || 0) >= 1
    || (atomKinds["native-ellipse-candidate"] || 0) >= 1
    || (atomKinds["native-search-candidate"] || 0) >= 1;
  const screenshotAtomEvidence = (atomKinds["screenshot-crop-candidate"] || 0) >= 1
    || (atomKinds["document-crop-candidate"] || 0) >= 1;
  // A screenshot mentioned as an input to a process must not turn the entire
  // process into an annotated screenshot. Without explicit annotation wording,
  // require an actual screenshot/document visual atom as the annotation base.
  return annotationEvidence || (screenshotAtomEvidence && overlayAtomEvidence);
}

function looksLikeScreenshotZoomCallout(text = "", atomKinds = {}) {
  const value = String(text || "").toLowerCase();
  const screenshotEvidence = /screenshot|screen[-_\s]?capture|ui[-_\s]?capture|mockup|interface|web[-_\s]?page|app[-_\s]?screen|截图|界面|页面截图|产品截图|系统截图|网页截图/.test(value);
  if (!screenshotEvidence) return false;
  const zoomEvidence = /zoom[-_\s]?(?:in|callout|lens|detail|window)|magnifier|magnifying[-_\s]?glass|loupe|detail[-_\s]?view|enlarged[-_\s]?view|局部放大|放大镜|放大框|放大区域|细节放大|重点放大|局部细节|局部展示/.test(value);
  const zoomAtomEvidence = (atomKinds["native-search-candidate"] || 0) >= 1
    || ((atomKinds["native-ellipse-candidate"] || 0) >= 1 && (atomKinds["connector-line-candidate"] || 0) >= 1)
    || ((atomKinds["native-rect-candidate"] || 0) >= 2 && (atomKinds["connector-line-candidate"] || 0) >= 1);
  return zoomEvidence || zoomAtomEvidence;
}

function looksLikeScreenshotCardGrid(text = "", atomKinds = {}, visualNodes = [], visualGrid = null, nodes = [], box = {}) {
  const value = String(text || "").toLowerCase();
  const screenshotEvidence = /screenshot|screen[-_\s]?capture|ui[-_\s]?capture|mockup|interface|web[-_\s]?page|app[-_\s]?screen|product[-_\s]?shot|产品截图|页面截图|系统截图|界面截图|网页截图|截图展示|界面展示|产品展示/.test(value);
  if (!screenshotEvidence) return false;
  if (/annotation|annotated|callout|highlight|markup|redline|spotlight|zoom[-_\s]?(?:in|callout|lens|detail)|magnifier|loupe|标注|批注|注释|说明气泡|高亮|框选|圈选|局部放大|放大镜|放大框/.test(value)) return false;
  const galleryEvidence = /card|grid|gallery|showcase|portfolio|case[-_\s]?study|screens?|mockups?|卡片|宫格|矩阵|展示|合集|案例|样例|示例|多屏|多页面/.test(value);
  if (!galleryEvidence) return false;
  const screenshotAtomCount = (atomKinds["screenshot-crop-candidate"] || 0)
    + (atomKinds["native-screen-candidate"] || 0)
    + (atomKinds["native-phone-candidate"] || 0);
  const structuralCount = Math.max(nodes.length, visualNodes.length);
  const gridLike = Boolean(visualGrid && Number(visualGrid.columns || 0) >= 2);
  return screenshotAtomCount >= 2 || structuralCount >= 2 || gridLike || Number(box.w || 0) > 0;
}

function looksLikeFeatureIconCardGrid(visualNodes = [], visualGrid = null, nodes = [], visualAtoms = [], box = {}, text = "") {
  const value = String(text || "").toLowerCase();
  const semantic = /feature|capability|benefit|service|solution|module|function|功能|特性|能力|亮点|优势|服务|模块|方案|卖点|应用场景|场景/.test(value)
    && /icon|illustration|pictogram|card|grid|图标|插图|图示|卡片|宫格|矩阵|清单/.test(value);
  const candidates = visualNodes.length >= 3 ? visualNodes : nodes;
  if (!semantic || candidates.length < 3) return false;
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const cardLike = candidates.filter((node) => {
    const nodeBox = node?.box || {};
    const width = Number(nodeBox.w || 0);
    const height = Number(nodeBox.h || 0);
    const aspect = width / Math.max(1, height);
    const areaRatio = width * height / regionArea;
    return areaRatio >= 0.01 && areaRatio <= 0.28 && aspect >= 0.55 && aspect <= 4.5;
  });
  const iconLikeAtoms = (visualAtoms || []).filter((atom) => {
    const kind = String(atom?.kind || "");
    const hint = String(atom?.shapeHint || "");
    const atomBox = atom?.box || {};
    const areaRatio = boxArea(atomBox) / regionArea;
    return /icon|illustration|complex-shape-crop|native-(?:gear|search|shield|person|team)/.test(`${kind} ${hint}`)
      && areaRatio > 0.0008
      && areaRatio <= 0.08;
  });
  if (semantic && iconLikeAtoms.length >= 3 && candidates.length >= 3) return true;
  const rows = visualGrid?.rows || clusterVisualNodesByAxis(cardLike, "y", Math.max(28, Number(box.h || 0) * 0.11)).length;
  const columns = visualGrid?.columns || clusterVisualNodesByAxis(cardLike, "x", Math.max(38, Number(box.w || 0) * 0.09)).length;
  const gridLike = Boolean(visualGrid && Number(visualGrid.rows || 0) >= 1 && Number(visualGrid.columns || 0) >= 2 && Number(visualGrid.coverageRatio || 0) >= 0.08);
  return (cardLike.length >= 3 || gridLike) && rows >= 1 && columns >= 2 && (iconLikeAtoms.length >= 2 || /图标|icon|插图|图示/.test(value));
}

function looksLikeVisualExampleCardGrid(visualNodes = [], visualGrid = null, nodes = [], visualAtoms = [], box = {}, text = "") {
  const value = String(text || "").toLowerCase();
  const visualExampleEvidence = /visual[-_\s]?example|sample[-_\s]?(?:preview|card)|component[-_\s]?preview|plugin[-_\s]?preview|diagram[-_\s]?sample|illustration[-_\s]?sample|asset[-_\s]?preview|图示样例|图示示例|示意图样例|组件预览|插件预览|素材预览|素材样例|示例图示|图形示例|样例图|示例图/.test(value);
  const cardEvidence = /card|grid|gallery|showcase|list|panel|tile|卡片|宫格|矩阵|展示|合集|清单|面板/.test(value);
  if (!visualExampleEvidence || !cardEvidence) return false;
  const candidates = visualNodes.length >= 2 ? visualNodes : nodes;
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const cardLike = candidates.filter((node) => {
    const nodeBox = node?.box || {};
    const width = Number(nodeBox.w || 0);
    const height = Number(nodeBox.h || 0);
    const aspect = width / Math.max(1, height);
    const areaRatio = width * height / regionArea;
    return areaRatio >= 0.012 && areaRatio <= 0.36 && aspect >= 0.45 && aspect <= 5.4;
  });
  const pictorialAtoms = (visualAtoms || []).filter((atom) => {
    const kind = String(atom?.kind || "");
    const hint = String(atom?.shapeHint || "");
    const atomBox = atom?.box || {};
    const areaRatio = boxArea(atomBox) / regionArea;
    return /complex-shape-crop|icon-crop|screenshot-crop|native-(?:cycle|donut|gear|search|shield|screen|phone|person|team)/.test(`${kind} ${hint}`)
      && areaRatio >= 0.001
      && areaRatio <= 0.18;
  });
  const rows = visualGrid?.rows || clusterVisualNodesByAxis(cardLike, "y", Math.max(30, Number(box.h || 0) * 0.12)).length;
  const columns = visualGrid?.columns || clusterVisualNodesByAxis(cardLike, "x", Math.max(42, Number(box.w || 0) * 0.1)).length;
  const gridLike = Boolean(visualGrid && Number(visualGrid.columns || 0) >= 2 && Number(visualGrid.coverageRatio || 0) >= 0.08);
  return (cardLike.length >= 2 || gridLike) && columns >= 1 && rows >= 1 && (pictorialAtoms.length >= 1 || /图示|示意图|preview|sample|example/.test(value));
}

function looksLikeNumberedStepCardGrid(visualNodes = [], visualGrid = null, nodes = [], visualAtoms = [], box = {}, text = "") {
  const value = String(text || "").toLowerCase();
  const stepEvidence = /numbered[-_\s]*(?:step|card)|step[-_\s]*cards?|process[-_\s]*cards?|sequence[-_\s]*cards?|phase[-_\s]*cards?|milestone[-_\s]*cards?|步骤卡片|编号卡片|序号卡片|阶段卡片|流程卡片|步骤宫格|步骤矩阵|分步说明/.test(value);
  const cardEvidence = /card|grid|tile|panel|sequence|cards?|卡片|宫格|矩阵|序列|面板/.test(value);
  const numberedTextCount = (nodes || []).filter((node) => /^(?:0?[1-9]|1[0-9]|[一二三四五六七八九十]+)[\.、:]?$/.test(String(node?.text || "").trim())).length;
  const badgeAtoms = (visualAtoms || []).filter((atom) => /native-(?:ellipse|rect)-candidate/.test(String(atom?.kind || "")) && isSmallBadgeAtom(atom, box));
  const candidates = visualNodes.length >= 3 ? visualNodes : nodes;
  if (!(stepEvidence && cardEvidence) && !(numberedTextCount >= 3 && cardEvidence)) return false;
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const cardLike = candidates.filter((node) => {
    const nodeBox = node?.box || {};
    const width = Number(nodeBox.w || 0);
    const height = Number(nodeBox.h || 0);
    const aspect = width / Math.max(1, height);
    const areaRatio = width * height / regionArea;
    return areaRatio >= 0.01 && areaRatio <= 0.32 && aspect >= 0.5 && aspect <= 5.2;
  });
  const layoutEvidence = cardLike.length >= 3 ? cardLike : candidates;
  const rows = visualGrid?.rows || clusterVisualNodesByAxis(layoutEvidence, "y", Math.max(30, Number(box.h || 0) * 0.11)).length;
  const columns = visualGrid?.columns || clusterVisualNodesByAxis(layoutEvidence, "x", Math.max(42, Number(box.w || 0) * 0.09)).length;
  const gridLike = Boolean(visualGrid && Number(visualGrid.columns || 0) >= 2 && Number(visualGrid.coverageRatio || 0) >= 0.08);
  const semanticStepCards = stepEvidence && cardEvidence && candidates.length >= 3 && columns >= 2;
  return (semanticStepCards || cardLike.length >= 3 || gridLike || numberedTextCount >= 3 || badgeAtoms.length >= 3) && rows >= 1 && columns >= 2;
}

function isSmallBadgeAtom(atom = {}, box = {}) {
  const atomBox = atom.box || {};
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const width = Number(atomBox.w || 0);
  const height = Number(atomBox.h || 0);
  const aspect = width / Math.max(1, height);
  const areaRatio = width * height / regionArea;
  return areaRatio >= 0.0008 && areaRatio <= 0.035 && aspect >= 0.55 && aspect <= 1.85;
}

function looksLikeVisualLinearFlow(visualNodes = [], box = {}) {
  if (visualNodes.length < 3) return false;
  const sorted = [...visualNodes].sort((a, b) => a.center.x - b.center.x);
  const xs = sorted.map((node) => node.center.x);
  const ys = sorted.map((node) => node.center.y);
  const xSpread = Math.max(...xs) - Math.min(...xs);
  const ySpread = Math.max(...ys) - Math.min(...ys);
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  if (xSpread < regionWidth * 0.36 || ySpread > Math.max(52, regionHeight * 0.24)) return false;
  const spacing = spacingProfile(xs);
  return spacing.regular || sorted.length >= 4;
}

function looksLikeDashboardCardGrid(visualNodes = [], visualGrid = null, nodes = [], box = {}, text = "") {
  const semantic = /dashboard|kpi|metric|scorecard|indicator|数据看板|业务看板|指标看板|仪表盘|指标卡|数据卡片|经营分析|运营看板/.test(String(text || ""));
  const candidates = visualNodes.length >= 4 ? visualNodes : nodes;
  if (!semantic || candidates.length < 4) return false;
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const cardLike = candidates.filter((node) => {
    const nodeBox = node?.box || {};
    const width = Number(nodeBox.w || 0);
    const height = Number(nodeBox.h || 0);
    const aspect = width / Math.max(1, height);
    const areaRatio = width * height / regionArea;
    return areaRatio >= 0.008 && areaRatio <= 0.22 && aspect >= 0.75 && aspect <= 5.5;
  });
  if (cardLike.length < 4) return false;
  const rows = clusterVisualNodesByAxis(cardLike, "y", Math.max(30, Number(box.h || 0) * 0.11)).length;
  const columns = clusterVisualNodesByAxis(cardLike, "x", Math.max(42, Number(box.w || 0) * 0.09)).length;
  const visualGridLike = visualGrid && Number(visualGrid.rows || 0) >= 2 && Number(visualGrid.columns || 0) >= 2;
  return (rows >= 2 && columns >= 2) || visualGridLike;
}

function looksLikeComparisonMatrix(visualGrid = null, visualNodes = [], nodes = [], box = {}, text = "") {
  const semantic = /comparison|compare|versus|\bvs\b|before.?after|pros.?cons|competitor|竞品|对比|比较|方案对照|方案比较|优劣|优缺点|前后对比|差异分析/.test(String(text || ""));
  if (!semantic) return false;
  const rows = Number(visualGrid?.rows || 0);
  const columns = Number(visualGrid?.columns || 0);
  if (rows >= 2 && columns >= 2) return true;
  const candidates = (visualNodes.length >= 3 ? visualNodes : nodes).filter((node) => node?.box && node?.center);
  if (candidates.length < 4) return false;
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const rowClusters = clusterVisualNodesByAxis(candidates, "y", Math.max(26, regionHeight * 0.09));
  const columnClusters = clusterVisualNodesByAxis(candidates, "x", Math.max(36, regionWidth * 0.08));
  return rowClusters.length >= 2 && columnClusters.length >= 2;
}

function looksLikeHeatmapMatrix(visualGrid = null, visualNodes = [], nodes = [], box = {}, text = "") {
  const semantic = /heat[-_\s]?map|risk.?matrix|color[-_\s]?scale|intensity|热力图|热力矩阵|风险矩阵|色阶|色块矩阵|分布矩阵|强弱分布|浓度分布/.test(String(text || ""));
  if (!semantic) return false;
  const rows = Number(visualGrid?.rows || 0);
  const columns = Number(visualGrid?.columns || 0);
  if (rows >= 2 && columns >= 2) return true;
  const candidates = (visualNodes.length >= 4 ? visualNodes : nodes).filter((node) => node?.box && node?.center);
  if (candidates.length < 6) return false;
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const rowClusters = clusterVisualNodesByAxis(candidates, "y", Math.max(24, regionHeight * 0.08));
  const columnClusters = clusterVisualNodesByAxis(candidates, "x", Math.max(30, regionWidth * 0.07));
  return rowClusters.length >= 2 && columnClusters.length >= 3;
}

function looksLikeTreemapDiagram(visualGrid = null, visualNodes = [], nodes = [], box = {}, text = "") {
  const semantic = /tree[-_\s]?map|area[-_\s]?map|market.?share|composition|矩形树图|树图|面积占比|面积分布|构成占比|份额构成|规模构成/.test(String(text || ""));
  if (!semantic) return false;
  const candidates = (visualNodes.length >= 3 ? visualNodes : nodes).filter((node) => node?.box && node?.center);
  if (candidates.length < 3) return Boolean(visualGrid && Number(visualGrid.rows || 0) >= 2 && Number(visualGrid.columns || 0) >= 2);
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const areas = candidates.map((node) => boxArea(node.box || {})).filter((value) => value > 0);
  const maxArea = Math.max(...areas);
  const minArea = Math.min(...areas);
  const areaSpread = maxArea / Math.max(1, minArea);
  const coverage = areas.reduce((sum, value) => sum + value, 0) / regionArea;
  return coverage >= 0.22 && areaSpread >= 1.6;
}

function looksLikeSankeyFlowDiagram(visualNodes = [], nodes = [], box = {}, text = "") {
  const semantic = /sankey|alluvial|flow.?distribution|flow.?composition|energy.?flow|user.?journey.?flow|桑基图|流向图|流量分布|流转分布|流向分布|能量流|用户流转|路径流转/.test(String(text || ""));
  if (!semantic) return false;
  const candidates = (visualNodes.length >= 3 ? visualNodes : nodes).filter((node) => node?.box && node?.center);
  if (candidates.length < 3) return true;
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const columns = clusterVisualNodesByAxis(candidates, "x", Math.max(42, regionWidth * 0.11)).length;
  const rows = clusterVisualNodesByAxis(candidates, "y", Math.max(28, regionHeight * 0.09)).length;
  return columns >= 2 && rows >= 2;
}

function looksLikeVisualTimelineRoadmap(visualAtoms = [], visualNodes = [], box = {}, text = "") {
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const measuredTimeline = (visualAtoms || []).find((atom) => {
    if (atom?.kind !== "native-timeline-candidate" || !atom?.box) return false;
    const milestones = Array.isArray(atom.timelineMilestones) ? atom.timelineMilestones : [];
    if (milestones.length < 3 || milestones.length > 16) return false;
    const xs = milestones.map((milestone) => Number(milestone.x)).filter(Number.isFinite).sort((a, b) => a - b);
    if (xs.length !== milestones.length || spread(xs) < regionWidth * 0.38) return false;
    const spacing = spacingProfile(xs);
    const width = Number(atom.box.w || 0);
    const height = Number(atom.box.h || 0);
    return width >= regionWidth * 0.42
      && height <= regionHeight * 0.16
      && width > height * 7
      && (spacing.regular || milestones.length >= 4);
  });
  if (measuredTimeline) return true;
  const nodes = (visualNodes || [])
    .filter((node) => node?.box && node?.center)
    .filter((node) => {
      const kind = String(node.kind || "");
      const hint = String(node.shapeHint || "").toLowerCase();
      const areaRatio = boxArea(node.box) / Math.max(1, regionWidth * regionHeight);
      if (/line|connector|axis/.test(kind) || /line|axis/.test(hint)) return false;
      return areaRatio >= 0.0015 && areaRatio <= 0.12;
    })
    .sort((a, b) => a.center.x - b.center.x);
  if (nodes.length < 3) return false;

  const xs = nodes.map((node) => node.center.x);
  const ys = nodes.map((node) => node.center.y);
  const xSpread = Math.max(...xs) - Math.min(...xs);
  const ySpread = Math.max(...ys) - Math.min(...ys);
  if (xSpread < regionWidth * 0.42 || ySpread > Math.max(96, regionHeight * 0.42)) return false;

  const spacing = spacingProfile(xs);
  const horizontalAxis = (visualAtoms || []).some((atom) => {
    const atomBox = atom?.box || {};
    const kind = String(atom?.kind || "");
    const hint = String(atom?.shapeHint || "").toLowerCase();
    const w = Number(atomBox.w || 0);
    const h = Number(atomBox.h || 0);
    return /connector|grid-line|timeline|axis/.test(kind)
      && (w >= regionWidth * 0.34 || /horizontal|axis|timeline/.test(hint))
      && w > h * 5;
  });
  const hasTemporalText = /(?:20\d{2}|19\d{2}|q[1-4]|h[12]|阶段|里程碑|时间|路线|版本|规划|上线|发布|roadmap|milestone|timeline)/i.test(text);
  return (spacing.regular || nodes.length >= 4) && (horizontalAxis || hasTemporalText);
}

function looksLikeVisualGanttRoadmap(visualNodes = [], visualAtoms = [], box = {}, text = "") {
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const bars = (visualNodes || []).filter((node) => {
    const nodeBox = node?.box || {};
    const width = Number(nodeBox.w || 0);
    const height = Number(nodeBox.h || 0);
    const aspect = width / Math.max(1, height);
    const areaRatio = boxArea(nodeBox) / Math.max(1, regionWidth * regionHeight);
    const hint = String(node?.shapeHint || "").toLowerCase();
    return node?.box
      && (/rect|bar|pill/.test(hint) || node.kind === "native-rect-candidate")
      && aspect >= 2.2
      && width >= regionWidth * 0.12
      && height <= regionHeight * 0.18
      && areaRatio >= 0.002
      && areaRatio <= 0.12;
  }).sort((a, b) => a.center.y - b.center.y);
  if (bars.length < 3) return false;
  const rowClusters = clusterVisualNodesByAxis(bars, "y", Math.max(20, regionHeight * 0.07));
  if (rowClusters.length < 3) return false;
  const starts = bars.map((node) => Number(node.box.x || 0));
  const widths = bars.map((node) => Number(node.box.w || 0));
  const startSpread = spread(starts);
  const widthSpread = spread(widths);
  const axisEvidence = (visualAtoms || []).some((atom) => {
    const atomBox = atom?.box || {};
    const width = Number(atomBox.w || 0);
    const height = Number(atomBox.h || 0);
    const hint = String(atom?.shapeHint || "").toLowerCase();
    return /connector|grid-line|axis|timeline/.test(String(atom?.kind || ""))
      && width >= regionWidth * 0.42
      && width > height * 5
      && /horizontal|axis|timeline|grid-line/.test(hint);
  });
  const semantic = /gantt|schedule|project[-_\s]?plan|roadmap|timeline|milestone|甘特|排期|计划|路线图|时间轴/.test(String(text || ""));
  return (semantic || axisEvidence) && (startSpread >= regionWidth * 0.16 || widthSpread >= regionWidth * 0.12);
}

function looksLikeQuadrantMatrix(visualGrid = null, visualAtoms = [], visualNodes = [], box = {}, text = "") {
  const semantic = /quadrant|四象限|象限图|优先级矩阵|影响.?成本|价值.?难度|重要.?紧急|impact.?effort|value.?complexity|urgent.?important/i.test(text);
  const hasTwoByTwoGrid = visualGrid && Number(visualGrid.rows) === 2 && Number(visualGrid.columns) === 2 && Number(visualGrid.coverageRatio || 0) >= 0.38;
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const longHorizontal = (visualAtoms || []).filter((atom) => {
    const atomBox = atom?.box || {};
    const w = Number(atomBox.w || 0);
    const h = Number(atomBox.h || 0);
    return atom?.kind === "grid-line-candidate" && w >= regionWidth * 0.55 && w > h * 6;
  }).length;
  const longVertical = (visualAtoms || []).filter((atom) => {
    const atomBox = atom?.box || {};
    const w = Number(atomBox.w || 0);
    const h = Number(atomBox.h || 0);
    return atom?.kind === "grid-line-candidate" && h >= regionHeight * 0.55 && h > w * 6;
  }).length;
  const quadrantNodes = (visualNodes || []).filter((node) => node?.box && node?.center).length;
  return (semantic && (hasTwoByTwoGrid || (longHorizontal >= 1 && longVertical >= 1)))
    || (hasTwoByTwoGrid && quadrantNodes >= 3 && /高|低|强|弱|成本|价值|难度|紧急|重要|impact|effort|value|complexity/i.test(text));
}

function looksLikeVisualFunnelLensFlow(visualAtoms = [], visualNodes = [], visualConnectors = [], box = {}, text = "") {
  const atomKinds = countBy(visualAtoms, "kind");
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const explicit = /lens|funnel|converge|focus|analysis|需求|结构化|收敛|漏斗|放大镜|聚焦|分析/.test(text);
  const lensAtomNodes = (visualAtoms || [])
    .filter((atom) => {
      if (!atom?.box) return false;
      if (/native-(ellipse|donut|funnel|search)-candidate/.test(String(atom.kind || ""))) return true;
      if (atom.kind !== "screenshot-crop-candidate") return false;
      const atomBox = atom.box || {};
      const aspect = Number(atomBox.w || 0) / Math.max(1, Number(atomBox.h || 0));
      const areaRatio = boxArea(atomBox) / Math.max(1, regionWidth * regionHeight);
      return aspect >= 0.62 && aspect <= 1.62 && areaRatio >= 0.025 && areaRatio <= 0.18;
    })
    .map((atom) => ({
      ...atom,
      center: atom.center || {
        x: Number(atom.box.x || 0) + Number(atom.box.w || 0) / 2,
        y: Number(atom.box.y || 0) + Number(atom.box.h || 0) / 2
      }
    }));
  const lensNodes = [...(visualNodes || []), ...lensAtomNodes].filter((node) => {
    const hint = String(node?.shapeHint || "").toLowerCase();
    const nodeBox = node?.box || {};
    const aspect = Number(nodeBox.w || 0) / Math.max(1, Number(nodeBox.h || 0));
    const areaRatio = boxArea(nodeBox) / Math.max(1, regionWidth * regionHeight);
    return node?.box
      && (
        node.kind === "native-ellipse-candidate"
        || node.kind === "native-donut-candidate"
        || node.kind === "native-funnel-candidate"
        || node.kind === "screenshot-crop-candidate"
        || /ellipse|circle|donut|funnel|lens|loupe|magnifier|search/.test(hint)
      )
      && aspect >= 0.45 && aspect <= 1.9
      && areaRatio >= 0.025;
  });
  const sideNodes = (visualNodes || []).filter((node) => {
    if (!node?.box || !node?.center) return false;
    if (lensNodes.includes(node)) return false;
    const areaRatio = boxArea(node.box) / Math.max(1, regionWidth * regionHeight);
    return areaRatio >= 0.004;
  });
  const connectorCount = Math.max(visualConnectors.length, connectorAtomCount(atomKinds));
  const hasDistinctFocusAtom = (atomKinds["native-search-candidate"] || 0) >= 1
    || (atomKinds["native-funnel-candidate"] || 0) >= 1
    || (atomKinds["native-donut-candidate"] || 0) >= 1
    || lensNodes.some((node) => /funnel|lens|loupe|magnifier|search/.test(String(node?.shapeHint || "").toLowerCase()));
  const hasLensAtom = (atomKinds["native-ellipse-candidate"] || 0) >= 1
    || (atomKinds["native-donut-candidate"] || 0) >= 1
    || (atomKinds["native-funnel-candidate"] || 0) >= 1
    || (atomKinds["native-search-candidate"] || 0) >= 1
    || lensNodes.length >= 1;
  const sideCenters = sideNodes.map((node) => node.center).filter(Boolean);
  const sideSpreadX = spread(sideCenters.map((center) => center.x));
  const sideSpreadY = spread(sideCenters.map((center) => center.y));
  const directionalConvergence = lensNodes.some((lens) => {
    if (!lens?.center) return false;
    const leftInputs = sideNodes.filter((node) => node?.center && node.center.x < lens.center.x - regionWidth * 0.08).length;
    const rightInputs = sideNodes.filter((node) => node?.center && node.center.x > lens.center.x + regionWidth * 0.08).length;
    const aboveInputs = sideNodes.filter((node) => node?.center && node.center.y < lens.center.y - regionHeight * 0.08).length;
    return leftInputs >= 2 || rightInputs >= 2 || aboveInputs >= 2;
  });
  // Plain circle nodes are common in relationship graphs. Require a distinct
  // focus primitive before inferring an unlabeled funnel or magnifier flow.
  const visualConvergence = hasDistinctFocusAtom
    && lensNodes.length >= 1
    && sideNodes.length >= 3
    && directionalConvergence
    && (sideSpreadX >= regionWidth * 0.12 || sideSpreadY >= regionHeight * 0.16);
  return hasLensAtom
    && lensNodes.length >= 1
    && sideNodes.length >= 2
    && (explicit || visualConvergence)
    && (connectorCount >= 1 || visualConvergence);
}

function looksLikeVisualFishboneDiagram(visualAtoms = [], visualNodes = [], box = {}, text = "") {
  const explicit = /fishbone|cause[-_\s]?effect|root[-_\s]?cause|ishikawa|branch[-_\s]?analysis|causal[-_\s]?branch|鱼骨图|因果分析|根因分析|分支分析/.test(text);
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const lineAtoms = (visualAtoms || []).filter((atom) => {
    if (!atom?.box || !/connector-line-candidate|connector-arrow-candidate/.test(String(atom.kind || ""))) return false;
    const atomBox = atom.box || {};
    return Number(atomBox.w || 0) >= 8 || Number(atomBox.h || 0) >= 8;
  });
  const horizontalSpines = lineAtoms.filter((atom) => {
    const atomBox = atom.box || {};
    const w = Number(atomBox.w || 0);
    const h = Number(atomBox.h || 0);
    return w >= regionWidth * 0.45 && w > h * 5;
  });
  const diagonalBranches = lineAtoms.filter((atom) => {
    const hint = String(atom.shapeHint || "").toLowerCase();
    const atomBox = atom.box || {};
    const w = Number(atomBox.w || 0);
    const h = Number(atomBox.h || 0);
    return /diagonal|branch/.test(hint) || (w >= regionWidth * 0.06 && h >= regionHeight * 0.06 && w / Math.max(1, h) >= 0.35 && w / Math.max(1, h) <= 3.2);
  });
  const nodeCount = (visualNodes || []).filter((node) => node?.box && node?.center).length;
  const strongVisualFishbone = horizontalSpines.length >= 1 && diagonalBranches.length >= 4 && nodeCount >= 3;
  return (explicit && horizontalSpines.length >= 1 && diagonalBranches.length >= 3)
    || (explicit && diagonalBranches.length >= 4 && nodeCount >= 3)
    || strongVisualFishbone;
}

function looksLikeHubSpoke(nodes, box = {}) {
  if (nodes.length < 4) return false;
  const center = centerOf(box);
  const distances = nodes.map((node) => distance(node.center, center)).sort((a, b) => a - b);
  return distances[0] < Math.max(Number(box.w || 0), Number(box.h || 0)) * 0.18
    && distances[distances.length - 1] > Math.max(Number(box.w || 0), Number(box.h || 0)) * 0.28;
}

function looksLikeVisualHubSpoke(visualNodes = [], visualConnectors = [], box = {}) {
  if (visualNodes.length < 4 || visualConnectors.length < 3) return false;
  const byId = new Map(visualNodes.map((node) => [node.id, node]));
  const degree = new Map();
  for (const connector of visualConnectors) {
    if (!byId.has(connector.from) || !byId.has(connector.to)) continue;
    degree.set(connector.from, (degree.get(connector.from) || 0) + 1);
    degree.set(connector.to, (degree.get(connector.to) || 0) + 1);
  }
  const hubEntry = [...degree.entries()]
    .filter(([, count]) => count >= 3)
    .map(([id, count]) => ({ node: byId.get(id), count }))
    .filter((entry) => entry.node)
    .sort((a, b) => b.count - a.count || distance(a.node.center, centerOf(box)) - distance(b.node.center, centerOf(box)))[0];
  if (!hubEntry) return false;
  const hub = hubEntry.node;
  const connected = visualConnectors
    .flatMap((connector) => connector.from === hub.id ? [connector.to] : connector.to === hub.id ? [connector.from] : [])
    .map((id) => byId.get(id))
    .filter(Boolean);
  if (connected.length < 3) return false;
  const maxExtent = Math.max(Number(box.w || 0), Number(box.h || 0), 1);
  const centerDistance = distance(hub.center, centerOf(box));
  const outerDistances = connected.map((node) => distance(node.center, hub.center));
  const directions = new Set(connected.map((node) => {
    const dx = node.center.x - hub.center.x;
    const dy = node.center.y - hub.center.y;
    return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "down" : "up");
  }));
  return centerDistance <= maxExtent * 0.26
    && Math.max(...outerDistances) >= maxExtent * 0.22
    && directions.size >= 3;
}

function looksLikeVisualTreeStructure(visualNodes = [], visualAtoms = [], box = {}) {
  if (visualNodes.length < 4 || connectorAtomCount(countBy(visualAtoms, "kind")) < 1) return false;
  const sorted = [...visualNodes].sort((a, b) => a.center.y - b.center.y);
  const root = sorted[0];
  const lowerNodes = sorted.filter((node) => node.id !== root.id && node.center.y > root.center.y + Math.max(48, Number(root.box?.h || 0) * 1.4));
  if (lowerNodes.length < 3) return false;
  const lowerXs = lowerNodes.map((node) => node.center.x).sort((a, b) => a - b);
  const lowerSpread = lowerXs[lowerXs.length - 1] - lowerXs[0];
  const regionWidth = Math.max(1, Number(box.w || 0));
  const rootCenterOffset = Math.abs(root.center.x - average(lowerXs));
  const rootIsAbove = root.center.y <= Number(box.y || 0) + Number(box.h || 0) * 0.42;
  const childrenAligned = (Math.max(...lowerNodes.map((node) => node.center.y)) - Math.min(...lowerNodes.map((node) => node.center.y))) <= Math.max(72, Number(box.h || 0) * 0.22);
  return rootIsAbove
    && lowerSpread >= regionWidth * 0.35
    && rootCenterOffset <= regionWidth * 0.18
    && childrenAligned;
}

function looksLikeVisualSwimlaneFlow(visualNodes = [], visualAtoms = [], box = {}) {
  if (visualNodes.length < 4 || connectorAtomCount(countBy(visualAtoms, "kind")) < 2) return false;
  const laneNodes = visualNodes.filter((node) => /rect|card|document|screen|process/.test(String(node?.shapeHint || "").toLowerCase()));
  if (laneNodes.length < Math.max(4, Math.ceil(visualNodes.length * 0.75))) return false;
  const rowClusters = clusterVisualNodesByAxis(laneNodes, "y", Math.max(34, Number(box.h || 0) * 0.11));
  const lanes = rowClusters.filter((cluster) => cluster.nodes.length >= 2);
  if (lanes.length < 2 || lanes.length > 5) return false;
  const regionWidth = Math.max(1, Number(box.w || 0));
  const laneSpreads = lanes.map((lane) => {
    const xs = lane.nodes.map((node) => node.center.x).sort((a, b) => a - b);
    return xs[xs.length - 1] - xs[0];
  });
  const wideLanes = laneSpreads.filter((spread) => spread >= regionWidth * 0.28).length;
  if (wideLanes < 2) return false;
  const centers = lanes.map((lane) => lane.center).sort((a, b) => a - b);
  const laneGap = centers[centers.length - 1] - centers[0];
  if (laneGap < Math.max(70, Number(box.h || 0) * 0.24)) return false;
  const columnClusters = clusterVisualNodesByAxis(laneNodes, "x", Math.max(44, Number(box.w || 0) * 0.09));
  const columnsWithMultipleRows = columnClusters.filter((cluster) => cluster.nodes.length >= 2).length;
  return columnsWithMultipleRows >= 1 || laneNodes.length >= lanes.length * 3;
}

function looksLikeVisualConcentricCircles(visualAtoms = []) {
  const layers = (visualAtoms || [])
    .filter((atom) => atom?.kind === "native-concentric-circle-candidate" && atom?.box)
    .sort((left, right) => boxArea(right.box) - boxArea(left.box));
  if (layers.length < 3 || layers.length > 8) return false;
  const outer = layers[0].box;
  const outerCenter = {
    x: Number(outer.x || 0) + Number(outer.w || 0) / 2,
    y: Number(outer.y || 0) + Number(outer.h || 0) / 2
  };
  for (let index = 0; index < layers.length; index += 1) {
    const layerBox = layers[index].box;
    const width = Number(layerBox.w || 0);
    const height = Number(layerBox.h || 0);
    const centerDelta = Math.hypot(
      Number(layerBox.x || 0) + width / 2 - outerCenter.x,
      Number(layerBox.y || 0) + height / 2 - outerCenter.y
    );
    if (width / Math.max(1, height) < 0.75 || width / Math.max(1, height) > 1.33) return false;
    if (centerDelta > Math.max(Number(outer.w || 0), Number(outer.h || 0)) * 0.055) return false;
    if (index > 0) {
      const previous = layers[index - 1].box;
      const ratio = Math.max(width, height) / Math.max(1, Math.max(Number(previous.w || 0), Number(previous.h || 0)));
      if (ratio < 0.28 || ratio > 0.88) return false;
    }
  }
  return true;
}

function looksLikeVisualGaugeChart(visualAtoms = []) {
  const arcs = (visualAtoms || []).filter((atom) => atom?.kind === "native-gauge-arc-candidate" && atom?.box);
  const needles = (visualAtoms || []).filter((atom) => atom?.kind === "native-gauge-needle-candidate" && atom?.box);
  return arcs.length === 1 && needles.length === 1;
}

function looksLikeVisualDonutChart(visualAtoms = [], box = {}, text = "") {
  const donutAtoms = (visualAtoms || []).filter((atom) =>
    (atom?.kind === "native-donut-candidate" || atom?.kind === "native-donut-segment-candidate") && atom.box
  );
  const segmentAtoms = donutAtoms.filter((atom) => atom?.kind === "native-donut-segment-candidate");
  if (donutAtoms.length < 1 || donutAtoms.length > 8) return false;
  const explicitDonut = /(^|[^a-z])(chart|plot|kpi|donut|ring|ratio|share)([^a-z]|$)|环形图|甜甜圈图|占比|比例/.test(String(text || ""));
  if (segmentAtoms.length >= 2) return true;
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const completeDonuts = donutAtoms.filter((atom) => {
    const atomBox = atom.box || {};
    const width = Number(atomBox.w || 0);
    const height = Number(atomBox.h || 0);
    const aspect = width / Math.max(1, height);
    const areaRatio = width * height / regionArea;
    return aspect >= 0.72 && aspect <= 1.38 && areaRatio >= 0.02 && areaRatio <= 0.55;
  });
  if (completeDonuts.length === 0) return false;
  if (explicitDonut) return true;
  const unrelatedLargeAtoms = (visualAtoms || []).filter((atom) => {
    if (!atom?.box || donutAtoms.includes(atom)) return false;
    if (atom?.source?.detector === "dense-linked-node-visual-atom") return false;
    return boxArea(atom.box) / regionArea >= 0.012;
  });
  return completeDonuts.length === 1 && unrelatedLargeAtoms.length === 0;
}

function looksLikeVisualPieChart(visualAtoms = [], box = {}, text = "") {
  const safeText = String(text || "").toLowerCase();
  const pieSemantic = /(^|[^a-z])(pie|share|ratio|proportion|percentage)([^a-z]|$)|饼图|扇区|占比|比例|份额/.test(safeText);
  if (/(^|[^a-z])(donut|ring)([^a-z]|$)|环形图|甜甜圈图|圆环/.test(safeText)) return false;
  const segmentAtoms = (visualAtoms || []).filter((atom) => ["native-donut-segment-candidate", "native-pie-segment-candidate"].includes(atom?.kind) && atom.box);
  if (segmentAtoms.length >= 2 && segmentAtoms.length <= 8) return true;
  if (!pieSemantic) return false;
  const roundAtoms = (visualAtoms || []).filter((atom) => {
    if (!atom?.box) return false;
    const hint = String(atom.shapeHint || "").toLowerCase();
    const kind = String(atom.kind || "");
    const atomBox = atom.box || {};
    const aspect = Number(atomBox.w || 0) / Math.max(1, Number(atomBox.h || 0));
    const areaRatio = boxArea(atomBox) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
    return (kind === "native-ellipse-candidate" || kind === "native-donut-candidate" || /ellipse|circle|pie|sector/.test(hint))
      && aspect >= 0.72 && aspect <= 1.38
      && areaRatio >= 0.035 && areaRatio <= 0.62;
  });
  return roundAtoms.length >= 1;
}

function looksLikeVisualLineChart(visualAtoms = [], box = {}, text = "") {
  if (!/(^|[^a-z])(chart|plot|trend|line|series|axis)([^a-z]|$)|折线图|趋势图|走势图|曲线图/.test(String(text || ""))) return false;
  const lineSegments = (visualAtoms || []).filter((atom) => atom?.kind === "connector-line-candidate" && atom?.shapeHint === "line-diagonal" && atom.lineEndpoints);
  if (lineSegments.length < 2 || lineSegments.length > 24) return false;
  const axes = (visualAtoms || []).filter((atom) => {
    if (atom?.kind !== "grid-line-candidate" && atom?.kind !== "connector-line-candidate") return false;
    const atomBox = atom.box || {};
    const horizontalOrVertical = Number(atomBox.w || 0) >= Number(atomBox.h || 0) * 6 || Number(atomBox.h || 0) >= Number(atomBox.w || 0) * 6;
    const longEnough = Math.max(Number(atomBox.w || 0), Number(atomBox.h || 0)) >= Math.max(70, Math.max(Number(box.w || 0), Number(box.h || 0)) * 0.25);
    return horizontalOrVertical && longEnough;
  });
  if (axes.length < 1) return false;
  const endpoints = lineSegments.flatMap((atom) => [atom.lineEndpoints.from, atom.lineEndpoints.to]);
  const xs = endpoints.map((point) => Number(point.x || 0)).sort((a, b) => a - b);
  const ys = endpoints.map((point) => Number(point.y || 0)).sort((a, b) => a - b);
  const xSpread = xs[xs.length - 1] - xs[0];
  const ySpread = ys[ys.length - 1] - ys[0];
  return xSpread >= Number(box.w || 0) * 0.22 && ySpread >= Number(box.h || 0) * 0.12;
}

function looksLikeVisualScatterChart(visualAtoms = [], box = {}, text = "") {
  if (!/(^|[^a-z])(chart|plot|scatter|bubble|axis|distribution)([^a-z]|$)|散点图|气泡图|分布图|坐标轴/.test(String(text || ""))) return false;
  const points = (visualAtoms || []).filter((atom) => atom?.kind === "native-scatter-point-candidate" && atom.box);
  if (points.length < 5 || points.length > 80) return false;
  const axes = (visualAtoms || []).filter((atom) => {
    if (atom?.kind !== "grid-line-candidate" && atom?.kind !== "connector-line-candidate") return false;
    const atomBox = atom.box || {};
    const horizontalOrVertical = Number(atomBox.w || 0) >= Number(atomBox.h || 0) * 6 || Number(atomBox.h || 0) >= Number(atomBox.w || 0) * 6;
    const longEnough = Math.max(Number(atomBox.w || 0), Number(atomBox.h || 0)) >= Math.max(70, Math.max(Number(box.w || 0), Number(box.h || 0)) * 0.25);
    return horizontalOrVertical && longEnough;
  });
  if (axes.length < 2) return false;
  const centers = points.map((atom) => centerOf(atom.box));
  const xs = centers.map((point) => point.x).sort((a, b) => a - b);
  const ys = centers.map((point) => point.y).sort((a, b) => a - b);
  const xSpread = xs[xs.length - 1] - xs[0];
  const ySpread = ys[ys.length - 1] - ys[0];
  const sizeValues = points.map((atom) => Math.max(Number(atom.box.w || 0), Number(atom.box.h || 0)));
  const medianSize = median(sizeValues);
  const oversized = points.filter((atom) => Math.max(Number(atom.box.w || 0), Number(atom.box.h || 0)) > medianSize * 2.2).length;
  return xSpread >= Number(box.w || 0) * 0.26
    && ySpread >= Number(box.h || 0) * 0.18
    && oversized <= Math.max(1, points.length * 0.18);
}

function looksLikeVisualWaterfallChart(visualNodes = [], visualAtoms = [], box = {}, text = "") {
  if (!/waterfall|bridge[-_\s]?chart|variance[-_\s]?bridge|瀑布图|桥图|增减分析|增减桥|差异桥/.test(String(text || ""))) return false;
  const bars = (visualNodes || []).filter((node) => {
    const hint = String(node?.shapeHint || "").toLowerCase();
    const nodeBox = node?.box || {};
    const width = Number(nodeBox.w || 0);
    const height = Number(nodeBox.h || 0);
    const aspect = width / Math.max(1, height);
    return node?.box && /rect|bar|column/.test(hint || "rect") && aspect >= 0.12 && aspect <= 3.5 && height >= Math.max(10, Number(box.h || 0) * 0.08);
  });
  if (bars.length < 4 || bars.length > 14) return false;
  const centers = bars.map((node) => centerOf(node.box)).sort((a, b) => a.x - b.x);
  const xSpread = centers[centers.length - 1].x - centers[0].x;
  if (xSpread < Number(box.w || 0) * 0.3) return false;
  const tops = bars.map((node) => Number(node.box.y || 0));
  const bottoms = bars.map((node) => Number(node.box.y || 0) + Number(node.box.h || 0));
  const variedTops = clusterNumbers(tops, Math.max(12, Number(box.h || 0) * 0.04)).length >= 3;
  const variedBottoms = clusterNumbers(bottoms, Math.max(12, Number(box.h || 0) * 0.04)).length >= 2;
  const hasAxis = (visualAtoms || []).some((atom) => {
    const atomBox = atom?.box || {};
    return /grid-line|connector-line/.test(String(atom?.kind || ""))
      && Number(atomBox.w || 0) >= Number(box.w || 0) * 0.3
      && Number(atomBox.w || 0) > Number(atomBox.h || 0) * 6;
  });
  return variedTops && variedBottoms && hasAxis;
}

function looksLikeVisualBarChart(visualNodes = [], visualAtoms = [], box = {}) {
  if (visualNodes.length < 3 || connectorAtomCount(countBy(visualAtoms, "kind")) < 1) return false;
  const bars = visualNodes.filter((node) => {
    const hint = String(node.shapeHint || "");
    const nodeBox = node.box || {};
    const aspect = Number(nodeBox.w || 0) / Math.max(1, Number(nodeBox.h || 0));
    return (hint === "rect" || hint === "line") && aspect >= 0.18 && aspect <= 16;
  });
  if (bars.length < 3 || bars.length > 16) return false;
  return looksLikeVerticalBarSeries(bars, visualAtoms, box)
    || looksLikeHorizontalBarSeries(bars, visualAtoms, box)
    || looksLikeHorizontalStackedBarSeries(bars, visualAtoms, box);
}

function looksLikeVisualCycleLoop(visualAtoms = [], visualNodes = [], box = {}, text = "") {
  const atomKinds = countBy(visualAtoms, "kind");
  const arcSegments = (atomKinds["native-arc-arrow-segment-candidate"] || 0);
  const cycleArrows = (atomKinds["native-cycle-arrow-candidate"] || 0);
  const ringSegments = (atomKinds["native-donut-segment-candidate"] || 0);
  const ringShapes = (atomKinds["native-donut-candidate"] || 0) + ringSegments;
  const cycleText = /cycle|loop|circular|arc[-_\s]?arrow|闭环|循环|环形|圆弧|弧形|环状/.test(String(text || ""));
  if (cycleText && (arcSegments >= 2 || ringSegments >= 2 || ringShapes >= 1)) return true;
  const measuredCycleArrows = visualAtoms.filter((atom) => {
    if (atom?.kind !== "native-cycle-arrow-candidate" || !atom?.box) return false;
    const width = Number(atom.box.w || 0);
    const height = Number(atom.box.h || 0);
    const aspect = width / Math.max(1, height);
    const density = Number(atom.density || 0);
    return aspect >= 0.72 && aspect <= 1.38 && density >= 0.18 && density <= 0.58;
  });
  if (cycleArrows >= 1 && (cycleText || ringShapes >= 1 || measuredCycleArrows.length >= 1)) return true;
  if (arcSegments < 3) return false;
  const arcAtoms = visualAtoms.filter((atom) => atom.kind === "native-arc-arrow-segment-candidate" && atom.box);
  if (arcAtoms.length < 3) return false;
  const sharedParent = arcAtoms[0]?.donutParentBox;
  if (sharedParent && arcAtoms.every((atom) => atom?.donutParentBox && overlapRatio(atom.donutParentBox, sharedParent) >= 0.92)) {
    const parentAspect = Number(sharedParent.w || 0) / Math.max(1, Number(sharedParent.h || 0));
    if (parentAspect >= 0.72 && parentAspect <= 1.38) return true;
  }
  const centers = arcAtoms.map((atom) => centerOf(atom.box));
  const xSpread = spread(centers.map((point) => point.x));
  const ySpread = spread(centers.map((point) => point.y));
  const regionW = Math.max(1, Number(box.w || 0));
  const regionH = Math.max(1, Number(box.h || 0));
  const regionArea = regionW * regionH;
  const arcAreaRatio = arcAtoms.reduce((sum, atom) => sum + boxArea(atom.box), 0) / Math.max(1, regionArea);
  const circularSpread = xSpread >= regionW * 0.18 && ySpread >= regionH * 0.18;
  const enoughInk = arcAreaRatio >= 0.018 || arcAtoms.length >= 5;
  return circularSpread && enoughInk && (cycleText || ringShapes >= 1 || arcAtoms.length >= 4);
}

function looksLikeVisualLayeredStack(visualNodes = [], box = {}, text = "") {
  const stackNodes = (visualNodes || []).filter((node) => {
    const hint = String(node?.shapeHint || "").toLowerCase();
    return node?.box && (/funnel|triangle|trapezoid|chevron|parallelogram|rect/.test(hint) || node.kind === "native-funnel-candidate");
  });
  if (stackNodes.length < 3 || stackNodes.length > 9) return false;
  const yClusters = clusterVisualNodesByAxis(stackNodes, "y", Math.max(18, Number(box.h || 0) * 0.08));
  if (yClusters.length < 3) return false;
  const layerNodes = yClusters
    .map((cluster) => cluster.nodes.sort((a, b) => boxArea(b.box || {}) - boxArea(a.box || {}))[0])
    .filter(Boolean)
    .sort((a, b) => centerOf(a.box).y - centerOf(b.box).y);
  const centerSpread = spread(layerNodes.map((node) => centerOf(node.box).x));
  const stackText = String(text || "");
  if (centerSpread > Math.max(48, Number(box.w || 0) * 0.16) && !/ladder|step|阶梯/.test(stackText)) return false;
  const widths = layerNodes.map((node) => Number(node.box?.w || 0));
  const variedEnough = spread(widths) >= Math.max(24, Number(box.w || 0) * 0.08);
  const explicitStackSemantics = /pyramid|layered|funnel|ladder|金字塔|分层|层级|漏斗|阶梯/.test(stackText);
  return explicitStackSemantics || variedEnough;
}

function looksLikeVisualVennDiagram(visualNodes = [], box = {}, text = "") {
  const ellipseNodes = (visualNodes || []).filter((node) => {
    const hint = String(node?.shapeHint || "").toLowerCase();
    const nodeBox = node?.box || {};
    const aspect = Number(nodeBox.w || 0) / Math.max(1, Number(nodeBox.h || 0));
    return node?.box && (node.kind === "native-ellipse-candidate" || /ellipse|circle/.test(hint))
      && aspect >= 0.55 && aspect <= 1.8;
  });
  if (ellipseNodes.length < 2 || ellipseNodes.length > 5) return false;
  const explicitVenn = /venn|overlap|intersection|set[-_\s]?relation|集合|交集|重叠关系|重叠图/.test(String(text || ""));
  let overlapPairs = 0;
  for (let i = 0; i < ellipseNodes.length; i += 1) {
    for (let j = i + 1; j < ellipseNodes.length; j += 1) {
      const a = ellipseNodes[i].box;
      const b = ellipseNodes[j].box;
      const mutualOverlap = Math.min(overlapRatio(a, b), overlapRatio(b, a));
      const centerDistance = distance(centerOf(a), centerOf(b));
      const maxRadius = Math.max(Number(a.w || 0), Number(a.h || 0), Number(b.w || 0), Number(b.h || 0)) / 2;
      const recoveredPixelPair = [ellipseNodes[i], ellipseNodes[j]]
        .every((node) => String(node?.atomId || "").startsWith("pixel-venn-lobe-"));
      const minimumOverlap = recoveredPixelPair ? 0.04 : 0.12;
      const maximumCenterDistance = maxRadius * (recoveredPixelPair ? 1.95 : 1.65);
      if (mutualOverlap >= minimumOverlap && centerDistance <= maximumCenterDistance) overlapPairs += 1;
    }
  }
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const ellipseAreaRatio = ellipseNodes.reduce((sum, node) => sum + boxArea(node.box || {}), 0) / regionArea;
  return overlapPairs >= 1 && (explicitVenn || ellipseAreaRatio >= 0.18);
}

function looksLikeVerticalBarSeries(bars = [], visualAtoms = [], box = {}) {
  const verticalBars = bars.filter((node) => {
    const nodeBox = node.box || {};
    const aspect = Number(nodeBox.w || 0) / Math.max(1, Number(nodeBox.h || 0));
    return aspect >= 0.18 && aspect <= 1.25;
  });
  if (verticalBars.length < 3) return false;
  const bottoms = verticalBars.map((node) => Number(node.box.y || 0) + Number(node.box.h || 0));
  const baselineSpread = Math.max(...bottoms) - Math.min(...bottoms);
  if (baselineSpread > Math.max(12, Number(box.h || 0) * 0.04)) return false;
  const heights = verticalBars.map((node) => Number(node.box.h || 0));
  const widths = verticalBars.map((node) => Number(node.box.w || 0));
  const heightRange = Math.max(...heights) - Math.min(...heights);
  const widthRange = Math.max(...widths) - Math.min(...widths);
  if (heightRange < Math.max(18, Number(box.h || 0) * 0.08)) return false;
  if (widthRange > Math.max(18, median(widths) * 0.65)) return false;
  const xs = verticalBars.map((node) => node.center.x).sort((a, b) => a - b);
  const xSpread = xs[xs.length - 1] - xs[0];
  if (xSpread < Number(box.w || 0) * 0.24) return false;
  const axisEvidence = visualAtoms.some((atom) => {
    if (atom.kind !== "grid-line-candidate" && atom.kind !== "connector-line-candidate") return false;
    const atomBox = atom.box || {};
    const horizontal = Number(atomBox.w || 0) >= Number(atomBox.h || 0);
    if (!horizontal) return false;
    const y = Number(atomBox.y || 0) + Number(atomBox.h || 0) / 2;
    return Math.abs(y - median(bottoms)) <= Math.max(14, Number(box.h || 0) * 0.05)
      && Number(atomBox.w || 0) >= xSpread * 0.75;
  });
  return axisEvidence;
}

function looksLikeHorizontalBarSeries(bars = [], visualAtoms = [], box = {}) {
  const horizontalBars = bars.filter((node) => {
    const nodeBox = node.box || {};
    const aspect = Number(nodeBox.w || 0) / Math.max(1, Number(nodeBox.h || 0));
    return aspect >= 1.35 && aspect <= 16;
  });
  if (horizontalBars.length < 3) return false;
  const lefts = horizontalBars.map((node) => Number(node.box.x || 0));
  const baselineSpread = Math.max(...lefts) - Math.min(...lefts);
  if (baselineSpread > Math.max(12, Number(box.w || 0) * 0.035)) return false;
  const widths = horizontalBars.map((node) => Number(node.box.w || 0));
  const heights = horizontalBars.map((node) => Number(node.box.h || 0));
  const widthRange = Math.max(...widths) - Math.min(...widths);
  const heightRange = Math.max(...heights) - Math.min(...heights);
  if (widthRange < Math.max(32, Number(box.w || 0) * 0.12)) return false;
  if (heightRange > Math.max(14, median(heights) * 0.7)) return false;
  const ys = horizontalBars.map((node) => node.center.y).sort((a, b) => a - b);
  const ySpread = ys[ys.length - 1] - ys[0];
  if (ySpread < Number(box.h || 0) * 0.22) return false;
  const leftEdge = median(lefts);
  const axisEvidence = visualAtoms.some((atom) => {
    if (atom.kind !== "grid-line-candidate" && atom.kind !== "connector-line-candidate") return false;
    const atomBox = atom.box || {};
    const vertical = Number(atomBox.h || 0) >= Number(atomBox.w || 0) * 6;
    if (!vertical) return false;
    const x = Number(atomBox.x || 0) + Number(atomBox.w || 0) / 2;
    return Math.abs(x - leftEdge) <= Math.max(14, Number(box.w || 0) * 0.045)
      && Number(atomBox.h || 0) >= ySpread * 0.75;
  });
  return axisEvidence;
}

function looksLikeHorizontalStackedBarSeries(bars = [], visualAtoms = [], box = {}) {
  const segments = bars.filter((node) => {
    const nodeBox = node.box || {};
    const width = Number(nodeBox.w || 0);
    const height = Number(nodeBox.h || 0);
    const aspect = width / Math.max(1, height);
    return aspect >= 0.8 && aspect <= 8 && width >= Math.max(18, Number(box.w || 0) * 0.035);
  });
  if (segments.length < 6 || segments.length > 24) return false;
  const medianHeight = median(segments.map((node) => Number(node.box?.h || 0)));
  const rowClusters = clusterVisualNodesByAxis(segments, "y", Math.max(10, medianHeight * 0.9));
  const rows = rowClusters
    .map((cluster) => ({
      ...cluster,
      nodes: [...cluster.nodes].sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0))
    }))
    .filter((cluster) => cluster.nodes.length >= 2);
  if (rows.length < 3 || rows.length > 8) return false;
  const rowLefts = rows.map((row) => Number(row.nodes[0].box?.x || 0));
  const rowRights = rows.map((row) => Math.max(...row.nodes.map((node) => Number(node.box?.x || 0) + Number(node.box?.w || 0))));
  const leftEdge = median(rowLefts);
  if (Math.max(...rowLefts) - Math.min(...rowLefts) > Math.max(16, Number(box.w || 0) * 0.045)) return false;
  const rowWidths = rowRights.map((right, index) => right - rowLefts[index]);
  if (Math.max(...rowWidths) < Number(box.w || 0) * 0.24) return false;
  const rowCenters = rows.map((row) => row.center).sort((a, b) => a - b);
  const ySpread = rowCenters[rowCenters.length - 1] - rowCenters[0];
  if (ySpread < Number(box.h || 0) * 0.22) return false;
  const adjacentEnough = rows.every((row) => {
    for (let index = 0; index < row.nodes.length - 1; index += 1) {
      const current = row.nodes[index].box || {};
      const next = row.nodes[index + 1].box || {};
      const gap = Number(next.x || 0) - (Number(current.x || 0) + Number(current.w || 0));
      if (gap > Math.max(8, medianHeight * 0.55)) return false;
    }
    return true;
  });
  if (!adjacentEnough) return false;
  return visualAtoms.some((atom) => {
    if (atom.kind !== "grid-line-candidate" && atom.kind !== "connector-line-candidate") return false;
    const atomBox = atom.box || {};
    const vertical = Number(atomBox.h || 0) >= Number(atomBox.w || 0) * 6;
    if (!vertical) return false;
    const x = Number(atomBox.x || 0) + Number(atomBox.w || 0) / 2;
    return Math.abs(x - leftEdge) <= Math.max(14, Number(box.w || 0) * 0.045)
      && Number(atomBox.h || 0) >= ySpread * 0.75;
  });
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

function inferResiduals({ item, archetype, nodes, visualAtoms = [], visualNodes = [], visualConnectors = [], box = {} }) {
  const residuals = [];
  const detector = String(item.source?.detector || "").toLowerCase();
  if (archetype === "screenshot-annotation" || archetype === "screenshot-zoom-callout") {
    residuals.push({ kind: "screenshot-crop", reason: "annotated screenshots should preserve the base UI/image crop while rebuilding callouts and markers as editable overlays" });
  }
  if (archetype === "screenshot-zoom-callout") {
    residuals.push({ kind: "zoom-detail-crop", reason: "zoom callouts should preserve the magnified detail crop while rebuilding source highlight and connector overlays" });
  }
  if (archetype === "screenshot-card-grid") {
    residuals.push({ kind: "screenshot-crop", reason: "screenshot card grids should preserve each embedded UI/product screenshot as a local crop while rebuilding cards and captions natively" });
  }
  if (archetype === "visual-example-card-grid") {
    residuals.push({ kind: "visual-example-crop", reason: "visual example card grids should keep each pictorial/plugin preview as a minimum-unit crop while rebuilding card containers and explanatory text natively" });
  }
  if (archetype === "feature-icon-card-grid") {
    residuals.push({ kind: "icon-or-illustration-crop", reason: "feature-card icons and pictorial marks should stay as local crops unless a matching vector/plugin icon component is found" });
  }
  if (/screenshot|document|ui[-_\s]?screenshot|user[-_\s]?interface/.test(detector) || archetype === "process-with-screenshots") {
    residuals.push({ kind: "screenshot-crop", reason: "screenshots should remain fidelity crops unless UI structure is parsed" });
  }
  const safeNativeHubSpoke = archetype === "hub-spoke" && looksLikeVisualHubSpoke(visualNodes, visualConnectors, box);
  if (/icon|illustration|entropy|gem|scanner|engine/.test(detector) || (archetype === "hub-spoke" && !safeNativeHubSpoke)) {
    residuals.push({ kind: "icon-or-illustration-crop", reason: "icons and decorative marks need library/SVG confidence before native rebuild" });
  }
  if (!["quadrant-matrix", "funnel-lens-flow"].includes(archetype) && nodes.some((node) => node.kind === "screenshot-or-document-node")) {
    residuals.push({ kind: "document-node-crop", reason: "document-like nodes are safer as local crops with native surrounding structure" });
  }
  for (const atom of visualAtoms) {
    if (!atom.residualCandidate) continue;
    if (archetype === "gantt-roadmap" && looksLikeGanttScheduleBarAtom(atom, box)) continue;
    if (archetype === "numbered-step-card-grid" && looksLikeStepCardBadgeFragmentAtom(atom, box)) continue;
    if (archetype === "cycle-loop" && looksLikeCycleArcResidualAtom(atom, box)) continue;
    residuals.push({ kind: atom.kind, atomId: atom.id, reason: "visual atom is safer as a local crop until a native/vector matcher is confident" });
  }
  return residuals;
}

function looksLikeCycleArcResidualAtom(atom = {}, box = {}) {
  const atomBox = atom.box || {};
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const width = Number(atomBox.w || 0);
  const height = Number(atomBox.h || 0);
  const aspect = width / Math.max(1, height);
  const areaRatio = width * height / regionArea;
  const density = Number(atom.density || 0);
  return atom.kind === "complex-shape-crop-candidate"
    && areaRatio >= 0.006
    && areaRatio <= 0.09
    && aspect >= 0.35
    && aspect <= 3.2
    && density >= 0.16
    && density <= 0.86;
}

function looksLikeStepCardBadgeFragmentAtom(atom = {}, box = {}) {
  const atomBox = atom.box || {};
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const width = Number(atomBox.w || 0);
  const height = Number(atomBox.h || 0);
  const areaRatio = width * height / regionArea;
  return atom.kind === "complex-shape-crop-candidate"
    && areaRatio <= 0.0012
    && width <= Math.max(28, Number(box.w || 0) * 0.05)
    && height <= Math.max(8, Number(box.h || 0) * 0.035);
}

function looksLikeGanttScheduleBarAtom(atom = {}, box = {}) {
  const atomBox = atom.box || {};
  const width = Number(atomBox.w || 0);
  const height = Number(atomBox.h || 0);
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const aspect = width / Math.max(1, height);
  const areaRatio = boxArea(atomBox) / Math.max(1, regionWidth * regionHeight);
  return atom.kind === "complex-shape-crop-candidate"
    && aspect >= 2.2
    && width >= regionWidth * 0.12
    && height <= regionHeight * 0.18
    && areaRatio >= 0.002
    && areaRatio <= 0.12;
}

function scoreUnderstanding({ archetype, nodes, connectors, residuals, item, visualAtoms = [], visualNodes = [], visualConnectors = [], visualGrid = null }) {
  let score = 0.18;
  const structuralNodeCount = Math.max(nodes.length, visualNodes.length);
  const structuralConnectorCount = Math.max(connectors.length, visualConnectors.length, connectorAtomCount(countBy(visualAtoms, "kind")));
  const atomKinds = countBy(visualAtoms, "kind");
  if (structuralNodeCount >= 3) score += 0.22;
  if (structuralNodeCount >= 5) score += 0.08;
  if (visualAtoms.length >= 3) score += 0.12;
  if (visualAtoms.some((atom) => atom.nativeCandidate)) score += 0.06;
  if (visualGrid) score += 0.16;
  if (structuralConnectorCount >= Math.max(1, structuralNodeCount - 2)) score += 0.18;
  if (archetype !== "unclassified-diagram") score += 0.18;
  if ((archetype === "donut-chart" || archetype === "pie-chart") && ((atomKinds["native-donut-candidate"] || 0) >= 1 || (atomKinds["native-donut-segment-candidate"] || 0) >= 2 || (atomKinds["native-pie-segment-candidate"] || 0) >= 2) && residuals.length === 0) score += 0.26;
  if (archetype === "scatter-chart" && (atomKinds["native-scatter-point-candidate"] || 0) >= 5 && connectorAtomCount(atomKinds) >= 2 && residuals.length === 0) score += 0.22;
  if (archetype === "line-chart" && visualAtoms.filter((atom) => atom.kind === "connector-line-candidate" && atom.shapeHint === "line-diagonal").length >= 2 && residuals.length === 0) score += 0.18;
  if (archetype === "gauge-chart" && (atomKinds["native-gauge-arc-candidate"] || 0) >= 1 && (atomKinds["native-gauge-needle-candidate"] || 0) >= 1 && residuals.length === 0) score += 0.18;
  if (archetype === "radar-chart" && (atomKinds["native-radar-frame-candidate"] || 0) >= 1 && (atomKinds["native-radar-score-candidate"] || 0) >= 1 && residuals.length === 0) score += 0.18;
  if (archetype === "cycle-loop" && ((atomKinds["native-arc-arrow-segment-candidate"] || 0) >= 3 || (atomKinds["native-cycle-arrow-candidate"] || 0) >= 1) && residuals.length === 0) score += 0.2;
  if (archetype === "screenshot-card-grid" && structuralNodeCount >= 2 && residuals.length > 0) score += 0.16;
  if (archetype === "visual-example-card-grid" && structuralNodeCount >= 2 && residuals.length > 0) score += 0.16;
  if (archetype === "feature-icon-card-grid" && structuralNodeCount >= 3 && residuals.length > 0) score += 0.16;
  if (archetype === "numbered-step-card-grid" && structuralNodeCount >= 3 && residuals.length === 0) score += 0.18;
  if (archetype === "quadrant-matrix" && visualGrid && Number(visualGrid.rows) === 2 && Number(visualGrid.columns) === 2) score += 0.14;
  if (archetype === "gantt-roadmap" && structuralNodeCount >= 3 && connectorAtomCount(atomKinds) >= 1 && residuals.length === 0) score += 0.18;
  if (archetype === "timeline-roadmap"
    && visualAtoms.some((atom) => atom?.kind === "native-timeline-candidate" && Array.isArray(atom.timelineMilestones) && atom.timelineMilestones.length >= 3)
    && residuals.length === 0) score += 0.12;
  if (item.source?.expressionForm === "complex-diagram" || item.source?.expressionForm === "linear-process-diagram") score += 0.08;
  if (item.source?.expressionForm === "chart-snapshot" || item.source?.expressionForm === "data-chart") score += 0.08;
  if (residuals.length > 0) score += 0.04;
  return round(clamp(score, 0, 0.95));
}

function countBy(items = [], field) {
  const result = {};
  for (const item of items) {
    const key = String(item?.[field] || "unknown");
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function nativeNodeAtomCount(atomKinds = {}) {
  return (atomKinds["native-rect-candidate"] || 0)
    + (atomKinds["native-ellipse-candidate"] || 0)
    + (atomKinds["native-diamond-candidate"] || 0)
    + (atomKinds["native-triangle-candidate"] || 0)
    + (atomKinds["native-chevron-candidate"] || 0)
    + (atomKinds["native-parallelogram-candidate"] || 0)
    + (atomKinds["native-cylinder-candidate"] || 0)
    + (atomKinds["native-cloud-candidate"] || 0)
    + (atomKinds["native-document-candidate"] || 0)
    + (atomKinds["native-screen-candidate"] || 0)
    + (atomKinds["native-phone-candidate"] || 0)
    + (atomKinds["native-person-candidate"] || 0)
    + (atomKinds["native-team-candidate"] || 0)
    + (atomKinds["native-timeline-candidate"] || 0)
    + (atomKinds["native-funnel-candidate"] || 0)
    + (atomKinds["native-donut-candidate"] || 0)
    + (atomKinds["native-donut-segment-candidate"] || 0)
    + (atomKinds["native-pie-segment-candidate"] || 0)
    + (atomKinds["native-concentric-circle-candidate"] || 0)
    + (atomKinds["native-quadrant-panel-candidate"] || 0)
    + (atomKinds["native-scatter-point-candidate"] || 0)
    + (atomKinds["native-cycle-arrow-candidate"] || 0)
    + (atomKinds["native-gauge-arc-candidate"] || 0)
    + (atomKinds["native-gauge-needle-candidate"] || 0)
    + (atomKinds["native-radar-frame-candidate"] || 0)
    + (atomKinds["native-radar-score-candidate"] || 0);
}

function connectorAtomCount(atomKinds = {}) {
  return (atomKinds["connector-line-candidate"] || 0)
    + (atomKinds["connector-arrow-candidate"] || 0)
    + (atomKinds["grid-line-candidate"] || 0);
}

function relationConnectorAtomCount(atomKinds = {}) {
  return (atomKinds["connector-line-candidate"] || 0)
    + (atomKinds["connector-arrow-candidate"] || 0);
}

function visualAtomDominance(visualAtoms = [], kind) {
  const target = visualAtoms.find((atom) => atom?.kind === kind && validBox(atom.box));
  const boxes = visualAtoms.map((atom) => atom?.box).filter(validBox);
  if (!target || boxes.length === 0) return 0;
  const left = Math.min(...boxes.map((box) => Number(box.x)));
  const top = Math.min(...boxes.map((box) => Number(box.y)));
  const right = Math.max(...boxes.map((box) => Number(box.x) + Number(box.w)));
  const bottom = Math.max(...boxes.map((box) => Number(box.y) + Number(box.h)));
  const unionArea = Math.max(1, (right - left) * (bottom - top));
  return Number(target.box.w) * Number(target.box.h) / unionArea;
}

function validBox(box = {}) {
  return [box.x, box.y, box.w, box.h].every(Number.isFinite)
    && Number(box.w) > 0 && Number(box.h) > 0;
}

function estimateVisualNodeRows(visualNodes = []) {
  const nodes = visualNodes.filter((node) => validBox(node?.box)).sort((left, right) => centerOf(left.box).y - centerOf(right.box).y);
  if (nodes.length === 0) return 0;
  const medianHeight = median(nodes.map((node) => Number(node.box.h)));
  const tolerance = Math.max(6, medianHeight * 0.65);
  const rows = [];
  for (const node of nodes) {
    const y = centerOf(node.box).y;
    const row = rows.find((candidate) => Math.abs(candidate.y - y) <= tolerance);
    if (row) {
      row.y = (row.y * row.count + y) / (row.count + 1);
      row.count += 1;
    } else {
      rows.push({ y, count: 1 });
    }
  }
  return rows.length;
}

function readinessFor({ archetype, confidence, nodes, connectors, residuals, visualAtoms = [], visualNodes = [], visualConnectors = [], visualGrid = null }) {
  const atomKinds = countBy(visualAtoms, "kind");
  const structuralNodeCount = Math.max(nodes.length, visualNodes.length);
  const structuralConnectorCount = Math.max(connectors.length, visualConnectors.length, connectorAtomCount(atomKinds));
  const measuredRelationConnectorCount = Math.max(connectors.length, visualConnectors.length, relationConnectorAtomCount(atomKinds));
  if (archetype === "machine-readable-code") return "preserve-crop";
  if (archetype === "dense-radial-line-art") return "preserve-crop";
  if (archetype === "screenshot-card-grid" && confidence >= 0.46) return "hybrid-native-plus-residual-crops";
  if (archetype === "visual-example-card-grid" && confidence >= 0.46) return "hybrid-native-plus-residual-crops";
  if (archetype === "screenshot-zoom-callout" && confidence >= 0.42) return "hybrid-native-plus-residual-crops";
  if (archetype === "screenshot-annotation" && confidence >= 0.42) return "hybrid-native-plus-residual-crops";
  if (archetype === "feature-icon-card-grid" && confidence >= 0.5 && structuralNodeCount >= 3) return "hybrid-native-plus-residual-crops";
  if (archetype === "numbered-step-card-grid" && confidence >= 0.54 && structuralNodeCount >= 3 && residuals.length === 0) return "native-rebuild";
  if (archetype === "dashboard-card-grid" && confidence >= 0.58 && structuralNodeCount >= 4 && residuals.length === 0) return "native-rebuild";
  if (archetype === "quadrant-matrix" && confidence >= 0.58 && residuals.length === 0) return "native-rebuild";
  if (archetype === "comparison-matrix" && confidence >= 0.58 && structuralNodeCount >= 4 && residuals.length === 0) return "native-rebuild";
  if (archetype === "heatmap-matrix" && confidence >= 0.58 && residuals.length === 0) return "native-rebuild";
  if (archetype === "treemap-chart" && confidence >= 0.58 && structuralNodeCount >= 3 && residuals.length === 0) return "native-rebuild";
  if (archetype === "sankey-flow-chart"
    && confidence >= 0.62
    && (atomKinds["native-sankey-band-candidate"] || 0) >= 1
    && (atomKinds["native-rect-candidate"] || 0) >= 3
    && residuals.length === 0) return "native-rebuild";
  if (archetype === "sankey-flow-chart" && confidence >= 0.48) return "preserve-crop-with-structured-metadata";
  if (archetype === "map-chart" && confidence >= 0.48) return "preserve-crop-with-structured-metadata";
  if (archetype === "word-cloud-chart" && confidence >= 0.48) return "preserve-crop-with-structured-metadata";
  if (archetype === "waterfall-chart" && confidence >= 0.62 && structuralNodeCount >= 4 && residuals.length === 0) return "native-rebuild";
  if (archetype === "gauge-chart"
    && confidence >= 0.58
    && (atomKinds["native-gauge-arc-candidate"] || 0) >= 1
    && (atomKinds["native-gauge-needle-candidate"] || 0) >= 1
    && visualAtomDominance(visualAtoms, "native-gauge-arc-candidate") >= 0.55
    && residuals.length === 0) return "native-rebuild";
  if (archetype === "radar-chart" && confidence >= 0.58 && residuals.length === 0) return "native-rebuild";
  if (archetype === "flow-card-chain"
    && confidence >= 0.72
    && residuals.length === 0
    && (nodes.length >= 3
      || (visualNodes.length >= 3 && measuredRelationConnectorCount >= visualNodes.length - 1))) return "native-rebuild";
  if ((archetype === "generic-node-diagram" || archetype === "multi-cluster-diagram")
    && confidence >= 0.72
    && structuralNodeCount >= 3
    && measuredRelationConnectorCount >= structuralNodeCount - 1
    && residuals.length === 0) return "native-rebuild";
  if (archetype === "concentric-circles" && confidence >= 0.58 && structuralNodeCount >= 2 && residuals.length === 0) return "native-rebuild";
  if (archetype === "gantt-roadmap" && confidence >= 0.58 && structuralNodeCount >= 3 && residuals.length === 0) return "native-rebuild";
  if (archetype === "matrix-or-grid" && visualGrid && visualGrid.rows >= 2 && visualGrid.columns >= 2) return "delegate-to-table-grid-parser";
  if ((archetype === "donut-chart" || archetype === "pie-chart") && confidence >= 0.68 && residuals.length === 0) return "native-rebuild";
  if (archetype === "bar-chart" && (atomKinds["native-rect-candidate"] || 0) >= 3 && structuralConnectorCount >= 1 && residuals.length === 0) return "native-rebuild";
  if (archetype === "scatter-chart" && confidence >= 0.68 && (atomKinds["native-scatter-point-candidate"] || 0) >= 5 && structuralConnectorCount >= 2 && residuals.length === 0) return "native-rebuild";
  if (archetype === "line-chart" && confidence >= 0.68 && structuralConnectorCount >= 2 && residuals.length === 0) return "native-rebuild";
  if (archetype === "cycle-loop"
    && confidence >= 0.62
    && ((atomKinds["native-cycle-arrow-candidate"] || 0) >= 2
      || (atomKinds["native-arc-arrow-segment-candidate"] || 0) >= 2)
    && residuals.length === 0) return "native-rebuild";
  if (archetype === "funnel-lens-flow" && confidence >= 0.58 && structuralNodeCount >= 3 && residuals.length === 0) return "native-rebuild";
  if (archetype === "fishbone-cause-effect" && confidence >= 0.58 && structuralConnectorCount >= 4 && residuals.length === 0) return "native-rebuild";
  if (archetype === "topology-diagram" && confidence >= 0.58 && structuralNodeCount >= 3 && structuralConnectorCount >= 2 && residuals.length === 0) return "native-rebuild";
  if (archetype === "tree-structure"
    && confidence >= 0.58
    && structuralNodeCount >= 4
    && measuredRelationConnectorCount >= structuralNodeCount - 1
    && residuals.length === 0) return "native-rebuild";
  if (archetype === "layered-stack" && confidence >= 0.58 && structuralNodeCount >= 3 && residuals.length === 0) return "native-rebuild";
  if (archetype === "venn-overlap" && confidence >= 0.58 && structuralNodeCount >= 2 && residuals.length === 0) return "native-rebuild";
  const measuredTimeline = visualAtoms.some((atom) => atom?.kind === "native-timeline-candidate"
    && Array.isArray(atom.timelineMilestones)
    && atom.timelineMilestones.length >= 3);
  if (archetype === "timeline-roadmap"
    && confidence >= 0.58
    && (nodes.length >= 3 || measuredTimeline)
    && residuals.length === 0) return "native-rebuild";
  const swimlaneRows = archetype === "swimlane-flow" ? estimateVisualNodeRows(visualNodes) : 0;
  if (archetype === "swimlane-flow"
    && confidence >= 0.58
    && swimlaneRows >= 2
    && visualNodes.length >= 6
    && measuredRelationConnectorCount >= visualNodes.length - swimlaneRows
    && residuals.length === 0) return "native-rebuild";
  if ([
    "gauge-chart",
    "flow-card-chain",
    "generic-node-diagram",
    "multi-cluster-diagram",
    "cycle-loop",
    "tree-structure",
    "swimlane-flow",
    "timeline-roadmap"
  ].includes(archetype)) {
    if (confidence >= 0.62 && structuralNodeCount >= 3 && measuredRelationConnectorCount > 0) {
      return "hybrid-native-plus-residual-crops";
    }
    return confidence >= 0.48 ? "preserve-crop-with-structured-metadata" : "preserve-crop";
  }
  if (confidence >= 0.72 && structuralConnectorCount > 0 && residuals.length === 0) return "native-rebuild";
  if (confidence >= 0.62 && structuralNodeCount >= 3 && structuralConnectorCount > 0) return "hybrid-native-plus-residual-crops";
  if (archetype === "matrix-or-grid" && nodes.length >= 4) return "delegate-to-table-grid-parser";
  if (confidence >= 0.48) return "preserve-crop-with-structured-metadata";
  return "preserve-crop";
}

function inferComponentStrategy({ archetype, confidence, nativeReadiness, nodes = [], connectors = [], residuals = [], visualAtoms = [], visualNodes = [], visualConnectors = [], visualGrid = null, structureSignature = null, semanticText = "", expressionSubtype = "" }) {
  const atomKinds = countBy(visualAtoms, "kind");
  const structuralNodeCount = Math.max(nodes.length, visualNodes.length);
  const structuralConnectorCount = Math.max(connectors.length, visualConnectors.length, connectorAtomCount(atomKinds));
  const residualKinds = new Set(residuals.map((item) => item.kind));
  const semantic = String(semanticText || "").toLowerCase();
  if (archetype === "machine-readable-code") {
    return {
      provider: "component-strategy-v1",
      mode: "preserve-local-crop",
      templateFamily: "machine-readable-code",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["local-crop-fidelity"],
      reason: "QR codes, barcodes, and data-matrix graphics must stay as exact raster crops so scan reliability is not broken by native shape reconstruction"
    };
  }
  if (archetype === "screenshot-card-grid") {
    return {
      provider: "component-strategy-v1",
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "screenshot-card-grid",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["local-screenshot-crops", "native-card-containers", "officeplus-search", "islide-search"],
      reason: "screenshot card grids should rebuild card containers, captions, and layout natively while preserving embedded UI/product screenshots as minimum-unit crops"
    };
  }
  if (archetype === "visual-example-card-grid") {
    return {
      provider: "component-strategy-v1",
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "visual-example-card-grid",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["local-visual-example-crops", "native-card-containers", "officeplus-search", "islide-search"],
      reason: "visual example card grids should rebuild card shells, titles, and descriptions natively while preserving each pictorial/plugin preview as a minimum-unit crop"
    };
  }
  if (archetype === "screenshot-annotation") {
    return {
      provider: "component-strategy-v1",
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "screenshot-annotation",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["local-crop-fidelity", "native-callout-overlays", "officeplus-search", "islide-search"],
      reason: "annotated screenshots should keep the base screenshot as a precise crop while rebuilding callouts, arrows, highlight boxes, labels, and zoom markers as editable overlays"
    };
  }
  if (archetype === "screenshot-zoom-callout") {
    return {
      provider: "component-strategy-v1",
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "screenshot-zoom-callout",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["local-crop-fidelity", "native-zoom-callout-overlays", "officeplus-search", "islide-search"],
      reason: "screenshot zoom callouts should keep the base screenshot and magnified detail as fidelity crops while rebuilding source highlight, connector lines, and zoom labels as editable overlays"
    };
  }
  if (archetype === "feature-icon-card-grid") {
    return {
      provider: "component-strategy-v1",
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "feature-icon-card-grid",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-card-containers", "local-icon-crops"],
      reason: "feature icon card grids should rebuild card containers and text natively while preserving pictorial icons as minimum-unit crops unless a matching vector or plugin component is available"
    };
  }
  if (archetype === "numbered-step-card-grid") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "numbered-step-card-grid",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-step-card-grid"],
      reason: "numbered step card grids should use polished reusable step-card components so badges, card shells, and explanatory text stay editable without looking like loose primitives"
    };
  }
  if (archetype === "dashboard-card-grid") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "grid-or-matrix",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-kpi-card-grid"],
      reason: "dashboard and KPI card grids should be rebuilt as reusable metric-card components instead of a flat raster crop"
    };
  }
  if (archetype === "quadrant-matrix") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "quadrant-matrix",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-axis-grid"],
      reason: "quadrant and prioritization matrices should prefer reusable 2x2 axis components over generic table/grid reconstruction"
    };
  }
  if (archetype === "comparison-matrix") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "grid-or-matrix",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-comparison-table"],
      reason: "comparison, versus, and before-after matrices should search polished comparison components instead of generic card grids"
    };
  }
  if (archetype === "heatmap-matrix") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "grid-or-matrix",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-heatmap-grid"],
      reason: "heatmap, color-scale, and risk matrices should preserve cell-level color semantics instead of generic table reconstruction"
    };
  }
  if (archetype === "treemap-chart") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "treemap-chart",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-treemap-rectangles"],
      reason: "treemap and area-composition diagrams should preserve proportional rectangle semantics instead of generic grid reconstruction"
    };
  }
  if (archetype === "sankey-flow-chart") {
    return {
      provider: "component-strategy-v1",
      mode: "component-template",
      templateFamily: "sankey-flow-chart",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "local-crop-fidelity"],
      reason: "Sankey and alluvial flow diagrams are high 拼凑感 risk, so prefer reusable whole-group flow components over primitive line patches"
    };
  }
  if (archetype === "map-chart") {
    return {
      provider: "component-strategy-v1",
      mode: "component-template",
      templateFamily: "map-chart",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "local-crop-fidelity"],
      reason: "map and geographic distribution graphics are high 拼凑感 risk, so prefer reusable map components or preserve the map crop instead of tracing region fragments"
    };
  }
  if (archetype === "word-cloud-chart") {
    return {
      provider: "component-strategy-v1",
      mode: "component-template",
      templateFamily: "word-cloud-chart",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "local-crop-fidelity"],
      reason: "word clouds are high 拼凑感 risk, so prefer reusable word-cloud components or preserve the crop instead of exploding keywords into loose text boxes"
    };
  }
  if (archetype === "waterfall-chart") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "native-chart-template" : "hybrid-chart-template",
      templateFamily: "waterfall-chart",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["native-chart-primitives", "officeplus-search", "islide-search"],
      reason: "waterfall and variance bridge charts should preserve cumulative increase/decrease semantics instead of generic bar reconstruction"
    };
  }
  if (archetype === "gauge-chart") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "native-chart-template" : "hybrid-chart-template",
      templateFamily: "gauge-chart",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-gauge-arc"],
      reason: "gauge and speedometer charts should prefer reusable dial/progress components over loose arc fragments"
    };
  }
  if (archetype === "radar-chart") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "native-chart-template" : "hybrid-chart-template",
      templateFamily: "radar-chart",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["native-chart-primitives", "officeplus-search", "islide-search"],
      reason: "radar and spider charts should preserve multi-axis score semantics instead of rebuilding polygon grids from loose lines"
    };
  }
  if (archetype === "matrix-or-grid" && visualGrid) {
    return {
      provider: "component-strategy-v1",
      mode: "component-template",
      templateFamily: "grid-or-matrix",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["native-table-grid", "officeplus-card-grid-style"],
      reason: "visual grid structure is explicit enough for a table/matrix component"
    };
  }
  if (
    archetype === "flow-card-chain"
    && structuralNodeCount >= 3
    && (structuralConnectorCount >= 2 || structureSignature?.wholeGroupTemplatePriority === "high")
  ) {
    return {
      provider: "component-strategy-v1",
      mode: "component-template",
      templateFamily: "process-chain",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-polished-card-style", "native-connectors"],
      reason: "flow/card chain should be rebuilt as grouped card components instead of loose primitive patches"
    };
  }
  if (archetype === "swimlane-flow" && structuralNodeCount >= 3) {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: structureSignature?.layout === "swimlane" ? "swimlane-flow" : "process-chain",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-lane-containers", "native-connectors"],
      reason: "swimlane and cross-lane process diagrams should use reusable process components with lane containers instead of freeform primitive patches"
    };
  }
  if (archetype === "process-with-screenshots" && structuralNodeCount >= 3) {
    return {
      provider: "component-strategy-v1",
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "process-chain",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-polished-card-style", "native-connectors", "local-crop-fidelity"],
      reason: "process-like diagram layers should use reusable process components while preserving unsafe screenshot details"
    };
  }
  if (hasExplicitDemandIntakeProcessEvidence(semantic) && !hasExplicitFunnelLensMetadata(expressionSubtype) && structuralNodeCount >= 4) {
    return {
      provider: "component-strategy-v1",
      mode: residualKinds.has("screenshot-crop-candidate") ? "hybrid-template-plus-local-crops" : "component-template",
      templateFamily: "process-chain",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-connectors", "local-crop-fidelity"],
      reason: "demand-intake convergence diagrams should use reusable branch process components while keeping lens/funnel styling as a motif"
    };
  }
  if (archetype === "funnel-lens-flow") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "funnel-lens-flow",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-funnel-lens-shapes", "native-connectors"],
      reason: "convergence, magnifier, and funnel flows should prefer reusable analysis/focusing components over generic process chains"
    };
  }
  if (archetype === "fishbone-cause-effect") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "fishbone-cause-effect",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-spine-branch-connectors"],
      reason: "fishbone and cause-effect diagrams should prefer whole-group root-cause templates over generic tree or branch layouts"
    };
  }
  if (archetype === "topology-diagram") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "topology-diagram",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-triangle-network-connectors"],
      reason: "topology, iron-triangle, and closed-loop diagrams should use reusable relationship components instead of generic node clusters"
    };
  }
  if (archetype === "tree-structure") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "hierarchy-tree",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-tree-connectors", "native-hierarchy-cards"],
      reason: "tree and organization hierarchy diagrams should search hierarchy/org-chart components instead of radial hub-spoke groups"
    };
  }
  if (archetype === "concentric-circles") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "concentric-circles",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-concentric-ellipses"],
      reason: "onion and concentric-circle diagrams should be rebuilt as reusable layered ring components instead of loose donut or ellipse patches"
    };
  }
  if (isDemandOrBranchProcessSemantic(semantic) && structuralNodeCount >= 4) {
    return {
      provider: "component-strategy-v1",
      mode: residualKinds.has("screenshot-crop-candidate") ? "hybrid-template-plus-local-crops" : "component-template",
      templateFamily: "process-chain",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-connectors", "local-crop-fidelity"],
      reason: "semantic demand/input-output branching diagram should search reusable process components before falling back to primitive patches"
    };
  }
  if (archetype === "hub-spoke" && structuralNodeCount >= 4) {
    return {
      provider: "component-strategy-v1",
      mode: residualKinds.has("icon-or-illustration-crop") ? "hybrid-template-plus-local-crops" : "component-template",
      templateFamily: "hub-spoke",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-icon-vector-style", "native-radial-connectors"],
      reason: "hub-spoke diagrams benefit from reusable center/endpoint component groups"
    };
  }
  if (archetype === "cycle-loop") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "cycle-loop",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["islide-search", "officeplus-search", "native-arc-arrow-shapes"],
      reason: "cycle-loop and arc-arrow diagrams should prefer reusable polished loop components over loose primitive patches"
    };
  }
  if (archetype === "layered-stack") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "layered-stack",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-layered-shapes"],
      reason: "pyramid, funnel, and ladder diagrams should prefer reusable layered-stack components over loose primitive patches"
    };
  }
  if (archetype === "venn-overlap") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "venn-overlap",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-transparent-ellipses"],
      reason: "overlapping set diagrams should prefer reusable Venn/intersection components over loose ellipse patches"
    };
  }
  if (archetype === "timeline-roadmap" || archetype === "gantt-roadmap" || (atomKinds["native-timeline-candidate"] || 0) >= 1 || /timeline/.test(archetype)) {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "timeline",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "office-timeline-demo-openxml-patterns", "native-milestone-connectors"],
      reason: archetype === "gantt-roadmap"
        ? "gantt and project roadmap diagrams should prefer reusable schedule timeline components over generic bar-chart reconstruction"
        : "timeline and roadmap diagrams should prefer reusable milestone components over loose line, dot, and label patches"
    };
  }
  if (["generic-node-diagram", "multi-cluster-diagram", "tree-structure"].includes(archetype) && structuralNodeCount >= 2) {
    return {
      provider: "component-strategy-v1",
      mode: residualKinds.has("icon-or-illustration-crop") || residualKinds.has("complex-shape-crop-candidate")
        ? "hybrid-template-plus-local-crops"
        : nativeReadiness === "native-rebuild"
          ? "component-template"
          : "hybrid-template-plus-local-crops",
      templateFamily: "hub-spoke",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-icon-vector-style", "native-radial-connectors", "officeplus-search", "islide-search"],
      reason: "generic node diagrams still map to reusable relationship component groups better than freeform primitive patches"
    };
  }
  if (archetype === "donut-chart" || archetype === "pie-chart" || archetype === "bar-chart" || archetype === "scatter-chart" || archetype === "line-chart") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "native-chart-template" : "hybrid-chart-template",
      templateFamily: archetype,
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["native-chart-primitives", "officeplus-chart-style-reference"],
      reason: "chart-like regions should use chart component templates when data is recoverable"
    };
  }
  if ((atomKinds["native-timeline-candidate"] || 0) >= 1 || /timeline/.test(archetype)) {
    return {
      provider: "component-strategy-v1",
      mode: "component-template",
      templateFamily: "timeline",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["office-timeline-demo-openxml-patterns", "native-milestone-connectors"],
      reason: "timeline candidates should learn milestone spacing and grouping from installed Office Timeline examples"
    };
  }
  if (residualKinds.has("icon-or-illustration-crop") || residualKinds.has("icon-crop-candidate") || residualKinds.has("complex-shape-crop-candidate")) {
    return {
      provider: "component-strategy-v1",
      mode: confidence >= 0.55 ? "hybrid-template-plus-local-crops" : "preserve-local-crop",
      templateFamily: "icon-or-illustration",
      sourcePreference: ["officeplus-vector-icon-style", "local-crop-fidelity"],
      reason: "icons and illustrations need a confident vector/library match before replacing crops"
    };
  }
  return {
    provider: "component-strategy-v1",
    mode: nativeReadiness === "native-rebuild" ? "native-primitives" : "preserve-or-hybrid",
    templateFamily: "generic",
    sourcePreference: ["existing-native-rules"],
    reason: "no installed component family is confidently matched"
  };
}

function inferTargetMotifs({ archetype = "", nodes = [], visualAtoms = [], visualNodes = [], visualConnectors = [], visualGrid = null, componentStrategy = {}, structureSignature = null, semanticText = "" } = {}) {
  const atomKinds = countBy(visualAtoms, "kind");
  const motifs = new Set();
  const family = String(componentStrategy.templateFamily || "").toLowerCase();
  const semantic = String(semanticText || "").toLowerCase();
  const text = `${archetype} ${family} ${semantic}`.toLowerCase();
  const connectorCount = Math.max(visualConnectors.length, connectorAtomCount(atomKinds));
  const nodeCount = Math.max(visualNodes.length, nodes.length);
  const semanticProcess = isDemandOrBranchProcessSemantic(semantic);
  const lensLikeAtomCount = (atomKinds["native-ellipse-candidate"] || 0)
    + (atomKinds["native-funnel-candidate"] || 0)
    + (atomKinds["native-search-candidate"] || 0);

  if ((atomKinds["native-cycle-arrow-candidate"] || 0) >= 1 || (atomKinds["native-arc-arrow-segment-candidate"] || 0) >= 3 || /cycle|loop|donut|闭环|循环|环形|圆弧|弧形/.test(text) || structureSignature?.layout === "cycle-loop") {
    motifs.add("cycle-loop");
    motifs.add("arc-arrow");
  }
  if (/screenshot[-_\s]?zoom[-_\s]?callout|zoom[-_\s]?callout|zoom[-_\s]?lens|magnifier|loupe|局部放大|放大镜|放大框|放大区域|细节放大|局部细节/.test(text) || structureSignature?.layout === "screenshot-zoom-callout") {
    motifs.add("screenshot-zoom-callout");
    motifs.add("zoom-lens-overlay");
    motifs.add("highlight-box");
    motifs.add("callout-overlay");
  }
  if (/screenshot[-_\s]?annotation|annotated[-_\s]?screenshot|截图标注|界面标注|页面标注|标注|批注|callout|highlight|框选|圈选|放大镜/.test(text) || structureSignature?.layout === "screenshot-annotation") {
    motifs.add("screenshot-annotation");
    motifs.add("callout-overlay");
    motifs.add("highlight-box");
  }
  if (/screenshot[-_\s]?card[-_\s]?grid|screen[-_\s]?gallery|ui[-_\s]?showcase|mockup[-_\s]?cards?|product[-_\s]?screenshot|产品截图|界面截图|截图卡片|截图宫格|截图展示|界面展示|产品展示|多屏展示/.test(text) || structureSignature?.layout === "screenshot-card-grid") {
    motifs.add("screenshot-card-grid");
    motifs.add("screenshot-crop");
    motifs.add("card-grid");
  }
  if (/visual[-_\s]?example[-_\s]?card|sample[-_\s]?(?:preview|card)|component[-_\s]?preview|plugin[-_\s]?preview|diagram[-_\s]?sample|illustration[-_\s]?sample|asset[-_\s]?preview|图示样例|图示示例|示意图样例|组件预览|插件预览|素材预览|素材样例|示例图示|图形示例|样例图|示例图/.test(text) || structureSignature?.layout === "visual-example-card-grid") {
    motifs.add("visual-example-card-grid");
    motifs.add("visual-example-crop");
    motifs.add("card-grid");
  }
  if (/feature[-_\s]?icon[-_\s]?card[-_\s]?grid|feature[-_\s]?cards?|icon[-_\s]?cards?|capability[-_\s]?cards?|功能卡片|特性卡片|能力卡片|图标卡片|图标宫格|功能宫格|亮点卡片/.test(text) || structureSignature?.layout === "feature-icon-card-grid") {
    motifs.add("feature-icon-card-grid");
    motifs.add("card-grid");
    motifs.add("icon-crop");
  }
  if (/numbered[-_\s]?(?:step|card)|step[-_\s]?cards?|process[-_\s]?cards?|sequence[-_\s]?cards?|phase[-_\s]?cards?|步骤卡片|编号卡片|序号卡片|阶段卡片|流程卡片|步骤宫格|步骤矩阵|分步说明/.test(text) || structureSignature?.layout === "numbered-step-card-grid") {
    motifs.add("numbered-step-card-grid");
    motifs.add("step-badge");
    motifs.add("card-grid");
    motifs.add("linear-arrow-chain");
  }
  if ((atomKinds["native-donut-candidate"] || 0) >= 1 || (atomKinds["native-donut-segment-candidate"] || 0) >= 2 || ((atomKinds["native-ellipse-candidate"] || 0) >= 2 && /cycle|hub|spoke/.test(text))) motifs.add("ring-node");
  if (/concentric[-_\s]?circles?|onion[-_\s]?diagram|nested[-_\s]?circles?|layered[-_\s]?circles?|同心圆|洋葱图|嵌套圆|层级圆|圈层模型|圈层结构/.test(text) || structureSignature?.layout === "concentric-circles") {
    motifs.add("concentric-circles");
    motifs.add("ring-node");
  }
  if (/pie-chart|饼图|扇区|份额|proportion|percentage/.test(text) || structureSignature?.layout === "pie-chart") motifs.add("pie-share-chart");
  if (/dashboard|kpi|metric|scorecard|indicator|数据看板|指标看板|仪表盘|指标卡/.test(text) || structureSignature?.layout === "dashboard-card-grid") {
    motifs.add("dashboard-card-grid");
    motifs.add("card-grid");
  }
  if (/comparison|compare|versus|\bvs\b|before.?after|pros.?cons|竞品|对比|比较|方案对照|优劣|优缺点|前后对比/.test(text) || structureSignature?.layout === "comparison-matrix") {
    motifs.add("comparison-matrix");
    motifs.add("card-grid");
  }
  if (/heat[-_\s]?map|risk.?matrix|color[-_\s]?scale|热力图|热力矩阵|风险矩阵|色阶|色块矩阵|分布矩阵/.test(text) || structureSignature?.layout === "heatmap-matrix") {
    motifs.add("heatmap-matrix");
    motifs.add("card-grid");
  }
  if (/tree[-_\s]?map|area[-_\s]?map|market.?share|composition|矩形树图|树图|面积占比|面积分布|构成占比|份额构成/.test(text) || structureSignature?.layout === "treemap") {
    motifs.add("treemap-chart");
  }
  if (/sankey|alluvial|flow.?distribution|flow.?composition|energy.?flow|user.?journey.?flow|桑基图|流向图|流量分布|流转分布|流向分布|能量流|用户流转|路径流转/.test(text) || structureSignature?.layout === "sankey-flow") {
    motifs.add("sankey-flow-chart");
  }
  if (/map[-_\s]?chart|geo[-_\s]?map|choropleth|regional[-_\s]?map|china[-_\s]?map|world[-_\s]?map|地图图表|地图图示|区域地图|中国地图|世界地图|地理分布|区域分布|地图热力/.test(text) || structureSignature?.layout === "geo-map") {
    motifs.add("map-chart");
  }
  if (/word[-_\s]?cloud|tag[-_\s]?cloud|keyword[-_\s]?cloud|关键词云|标签云|文字云|词云|热词云|词频云/.test(text) || structureSignature?.layout === "word-cloud") {
    motifs.add("word-cloud-chart");
  }
  if (/waterfall|bridge[-_\s]?chart|variance[-_\s]?bridge|瀑布图|桥图|增减分析|增减桥|差异桥/.test(text) || structureSignature?.layout === "waterfall-chart") {
    motifs.add("waterfall-chart");
  }
  if (/gauge[-_\s]?chart|speedometer|dial[-_\s]?chart|semi[-_\s]?circle[-_\s]?gauge|仪表图|仪表盘图|速度表|半圆仪表|进度仪表|评分仪表/.test(text) || structureSignature?.layout === "gauge-chart") {
    motifs.add("gauge-chart");
  }
  if (/radar[-_\s]?chart|spider[-_\s]?chart|web[-_\s]?chart|polar[-_\s]?chart|雷达图|蛛网图|蜘蛛网图|能力雷达|维度评分|多维评分|能力模型/.test(text) || structureSignature?.layout === "radar-chart") {
    motifs.add("radar-chart");
  }
  if (visualGrid || /matrix|grid|table/.test(text)) motifs.add("card-grid");
  if (/quadrant|四象限|象限|优先级|impact|effort|value|complexity/.test(text) || structureSignature?.layout === "quadrant") motifs.add("quadrant-axis");
  if (
    archetype === "scatter-chart"
    && (/bubble|portfolio|distribution|positioning|scatter|气泡|组合分布|分布图|定位图|散点/.test(text) || structureSignature?.layout === "scatter-chart")
  ) motifs.add("bubble-scatter-chart");
  if (/layered|pyramid|funnel|ladder|金字塔|分层|漏斗|阶梯/.test(text) || structureSignature?.layout === "layered-stack") motifs.add("layered-stack");
  if (/funnel|漏斗/.test(text) || (structureSignature?.layout === "layered-stack" && structureSignature?.direction === "funnel-down")) motifs.add("funnel-stack");
  if (/pyramid|金字塔/.test(text) || (structureSignature?.layout === "layered-stack" && structureSignature?.direction === "pyramid-down")) motifs.add("pyramid-stack");
  if (/venn|overlap|intersection|集合|交集|重叠/.test(text) || structureSignature?.layout === "venn-overlap") motifs.add("venn-overlap");
  if (/intersection|交集|重叠/.test(text) || structureSignature?.layout === "venn-overlap") motifs.add("intersection-overlap");
  if (archetype !== "cycle-loop" && (/topology|triangle|closed[-_\s]?loop|network|铁三角|闭环|拓扑/.test(text) || structureSignature?.layout === "topology")) motifs.add("topology-triangle");
  if (/timeline|roadmap|milestone|时间轴|里程碑|路线图/.test(text) || structureSignature?.layout === "timeline") motifs.add("milestone-roadmap");
  if (/gantt|schedule|project[-_\s]?plan|甘特|排期|计划表/.test(text) || structureSignature?.layout === "gantt-roadmap") motifs.add("gantt-roadmap");
  if (/tree|hierarchy|org|组织|部门|岗位|汇报|层级/.test(text) || (archetype === "tree-structure" && nodeCount >= 4)) motifs.add("tree-link");
  if (/org[-_\s]?chart|organization|hierarchy|department|role|reporting|组织架构|组织结构|部门架构|岗位层级|汇报关系|上下级/.test(text) || (archetype === "tree-structure" && structureSignature?.layout === "tree" && nodeCount >= 4)) {
    motifs.add("org-hierarchy");
  }
  if (/fishbone|cause|effect|root|ishikawa|鱼骨|因果|根因/.test(text) || structureSignature?.layout === "fishbone") motifs.add("fishbone-cause");
  if (/hub|spoke|radial/.test(text) || (archetype === "hub-spoke" && connectorCount >= 3)) motifs.add("radial-link");
  if (/flow|process|timeline|swimlane/.test(text) || (nodeCount >= 3 && connectorCount >= 1)) motifs.add("linear-arrow-chain");
  if (structureSignature?.wholeGroupTemplatePriority === "high" && /linear|swimlane|timeline|cycle/.test(String(structureSignature.layout || ""))) motifs.add("whole-process-template");
  if (
    (lensLikeAtomCount >= 1 && (/flow|process|funnel|lens|demand|需求|漏斗|放大镜|聚焦/.test(text) || connectorCount >= 1 || semanticProcess))
    || (semanticProcess && nodeCount >= 4 && /需求|理解|结构化|收敛|蓝图|漏斗|放大镜|聚焦|funnel|lens|analysis/.test(text))
    || structureSignature?.layout === "funnel-lens-flow"
  ) motifs.add("lens-funnel-flow");
  if (Math.max(nodeCount, nativeNodeAtomCount(atomKinds)) >= 4 && (connectorCount >= 1 || semanticProcess) && (/flow|process|tree|branch|demand|需求|输入|输出|素材|流程/.test(text) || structureSignature?.layout === "tree")) motifs.add("branch-card-flow");
  return [...motifs];
}

function isDemandOrBranchProcessSemantic(text = "") {
  const value = String(text || "").toLowerCase();
  if (!value) return false;
  const hasDemand = /需求|理解|业务目标|会议纪要|旧版说明|角色关系|业务截图|核心流程|飞书对话|异常|蓝图|demand|requirement/.test(value);
  const hasInputOutput = /输入|输出|产出|素材|材料|input|output|material/.test(value);
  const hasProcess = /流程|分支|结构化|收敛|漏斗|放大镜|聚焦|flow|branch|funnel|lens|process/.test(value);
  return (hasDemand && (hasInputOutput || hasProcess)) || (hasInputOutput && hasProcess);
}

function hasExplicitDemandIntakeProcessEvidence(text = "") {
  const value = String(text || "").toLowerCase();
  const intakeTerms = new Set(value.match(/需求理解|业务目标|会议纪要|核心流程|结构化蓝图|需求收敛|requirement intake|meeting notes|structured blueprint/g) || []);
  return intakeTerms.size >= 2 && isDemandOrBranchProcessSemantic(value);
}

function hasExplicitFunnelLensMetadata(expressionSubtype = "") {
  return /lens[-_\s]?funnel|funnel[-_\s]?lens|convergence|magnifier[-_\s]?flow|放大镜流程|漏斗流程|收敛流程/.test(String(expressionSubtype || "").toLowerCase());
}

function inferExpressionFamily({ archetype = "", nativeReadiness = "", structureSignature = null, item = {}, visualAtoms = [], visualNodes = [], visualConnectors = [], visualGrid = null, semanticText = "" } = {}) {
  const text = [
    archetype,
    nativeReadiness,
    structureSignature?.layout,
    item.source?.expressionForm,
    item.source?.expressionSubtype,
    item.source?.detector,
    semanticText
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  const atomKinds = countBy(visualAtoms, "kind");
  const semanticStructureEvidence = (visualNodes || []).length >= 2
    || (visualConnectors || []).length >= 1
    || connectorAtomCount(atomKinds) >= 1
    || Boolean(visualGrid);
  if (/machine-readable-code|qr[-_\s]?code|quick[-_\s]?response|barcode|bar[-_\s]?code|data[-_\s]?matrix|二维码|条形码|条码|扫码/.test(text)) {
    return "pictorial-asset";
  }
  if (/screenshot[-_\s]?zoom[-_\s]?callout|zoom[-_\s]?callout|zoom[-_\s]?lens|magnifier|loupe|局部放大|放大镜|放大框|放大区域|细节放大|局部细节/.test(text)) {
    return "annotated-screenshot";
  }
  if (/screenshot[-_\s]?annotation|annotated[-_\s]?screenshot|截图标注|界面标注|页面标注|标注|批注|callout|highlight|框选|圈选|放大镜/.test(text)) {
    return "annotated-screenshot";
  }
  if (/screenshot[-_\s]?card[-_\s]?grid|screen[-_\s]?gallery|ui[-_\s]?showcase|mockup[-_\s]?cards?|product[-_\s]?screenshot|产品截图|界面截图|截图卡片|截图宫格|截图展示|界面展示|产品展示|多屏展示/.test(text)) {
    return "layout-grid";
  }
  if (/visual[-_\s]?example[-_\s]?card|sample[-_\s]?(?:preview|card)|component[-_\s]?preview|plugin[-_\s]?preview|diagram[-_\s]?sample|illustration[-_\s]?sample|asset[-_\s]?preview|图示样例|图示示例|示意图样例|组件预览|插件预览|素材预览|素材样例|示例图示|图形示例|样例图|示例图/.test(text)) {
    return "layout-grid";
  }
  if (/feature[-_\s]?icon[-_\s]?card[-_\s]?grid|feature[-_\s]?cards?|icon[-_\s]?cards?|capability[-_\s]?cards?|功能卡片|特性卡片|能力卡片|图标卡片|图标宫格|功能宫格|亮点卡片/.test(text)) {
    return "layout-grid";
  }
  if (/numbered[-_\s]?(?:step|card)|step[-_\s]?cards?|process[-_\s]?cards?|sequence[-_\s]?cards?|phase[-_\s]?cards?|步骤卡片|编号卡片|序号卡片|阶段卡片|流程卡片|步骤宫格|步骤矩阵|分步说明/.test(text)) {
    return "structured-process";
  }
  if (/screenshot|screen-capture|ui-capture|mockup|demo|sample|example|icon|illustration|pictogram|clipart|sticker|截图|样例|示例|图标|插画|示意图|图示/.test(text) && !semanticStructureEvidence) {
    return "pictorial-asset";
  }
  if (/bar-chart|line-chart|scatter-chart|pie-chart|donut-chart|sankey-flow-chart|map-chart|word-cloud-chart|waterfall-chart|gauge-chart|radar-chart|\bchart\b|dashboard|\bplot\b|\bgraph\b|sankey|alluvial|geo[-_\s]?map|choropleth|regional[-_\s]?map|china[-_\s]?map|world[-_\s]?map|word[-_\s]?cloud|tag[-_\s]?cloud|keyword[-_\s]?cloud|waterfall|gauge|speedometer|radar|spider|图表|柱状图|折线图|散点图|饼图|环形图|桑基图|流向图|地图|词云|关键词云|瀑布图|仪表图|雷达图|蛛网图|看板|仪表盘/.test(text)) {
    return "data-chart";
  }
  if (/table|grid|matrix|quadrant|表格|网格|矩阵|象限/.test(text) || visualGrid) {
    return "layout-grid";
  }
  if (/timeline|roadmap|milestone|gantt|schedule|project[-_\s]?plan|process|workflow|flowchart|linear|funnel|fishbone|swimlane|tree|layered-stack|pyramid|layered|ladder|流程|时间线|路线图|里程碑|甘特|排期|计划表|泳道|树状|鱼骨|金字塔|分层|阶梯/.test(text)) {
    return "structured-process";
  }
  if (/relationship|hub|spoke|radial|cycle|ring|topology|network|venn|overlap|intersection|set[-_\s]?relation|关系|循环|圆环|拓扑|网络|集合|交集|重叠/.test(text)) {
    return "relationship-diagram";
  }
  if (/concentric[-_\s]?circles?|onion[-_\s]?diagram|nested[-_\s]?circles?|layered[-_\s]?circles?|同心圆|洋葱图|嵌套圆|层级圆|圈层模型|圈层结构/.test(text)) {
    return "relationship-diagram";
  }
  if (/screenshot|screen-capture|ui-capture|mockup|demo|sample|example|icon|illustration|pictogram|clipart|sticker|截图|样例|示例|图标|插画|示意图|图示/.test(text)) {
    return "pictorial-asset";
  }
  if (semanticStructureEvidence) {
    return "generic-structured-diagram";
  }
  return "unknown";
}

function inferStructureSignature({ archetype = "", nodes = [], visualAtoms = [], visualNodes = [], visualConnectors = [], visualGrid = null, box = {} } = {}) {
  const chartSignature = inferChartStructureSignature({ archetype, visualAtoms, visualNodes, box });
  if (chartSignature) return chartSignature;
  const visualStructuralNodes = compactVisualStructureNodes(visualNodes, box);
  const structuralNodes = (visualStructuralNodes.length >= 2 ? visualStructuralNodes : nodes)
    .filter((node) => node?.box && node?.center)
    .sort((a, b) => a.center.x - b.center.x || a.center.y - b.center.y);
  if (archetype === "dashboard-card-grid") {
    const dashboardNodes = structuralNodes.length >= 4 ? structuralNodes : (visualNodes || []).filter((node) => node?.box && node?.center);
    const rows = Math.max(clusterVisualNodesByAxis(dashboardNodes, "y", Math.max(30, Number(box.h || 0) * 0.11)).length, visualGrid?.rows || 0, 2);
    const columns = Math.max(clusterVisualNodesByAxis(dashboardNodes, "x", Math.max(42, Number(box.w || 0) * 0.09)).length, visualGrid?.columns || 0, 2);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "dashboard-card-grid",
      stepCount: Math.max(dashboardNodes.length, rows * columns, 4),
      rows,
      columns,
      direction: "metric-card-grid",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "metric-cards",
        ...(visualGrid ? ["visual-grid"] : []),
        ...(dashboardNodes.length ? ["dashboard-card-nodes"] : [])
      ]
    };
  }
  if (archetype === "screenshot-card-grid") {
    const cardNodes = structuralNodes.length >= 2 ? structuralNodes : (visualNodes || []).filter((node) => node?.box && node?.center);
    const rows = Math.max(clusterVisualNodesByAxis(cardNodes, "y", Math.max(30, Number(box.h || 0) * 0.11)).length, visualGrid?.rows || 0, 1);
    const columns = Math.max(clusterVisualNodesByAxis(cardNodes, "x", Math.max(42, Number(box.w || 0) * 0.09)).length, visualGrid?.columns || 0, 2);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "screenshot-card-grid",
      stepCount: Math.max(cardNodes.length, rows * columns, 2),
      rows,
      columns,
      direction: "screenshot-gallery-grid",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "medium",
      evidence: [
        "editable-card-containers",
        "minimum-unit-screenshot-crops",
        ...(visualGrid ? ["visual-grid"] : []),
        ...(cardNodes.length ? ["screenshot-card-nodes"] : [])
      ]
    };
  }
  if (archetype === "visual-example-card-grid") {
    const cardNodes = structuralNodes.length >= 2 ? structuralNodes : (visualNodes || []).filter((node) => node?.box && node?.center);
    const rows = Math.max(clusterVisualNodesByAxis(cardNodes, "y", Math.max(30, Number(box.h || 0) * 0.12)).length, visualGrid?.rows || 0, 1);
    const columns = Math.max(clusterVisualNodesByAxis(cardNodes, "x", Math.max(42, Number(box.w || 0) * 0.1)).length, visualGrid?.columns || 0, 1);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "visual-example-card-grid",
      stepCount: Math.max(cardNodes.length, rows * columns, 2),
      rows,
      columns,
      direction: "pictorial-example-card-grid",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "medium",
      evidence: [
        "editable-card-containers",
        "minimum-unit-visual-example-crops",
        ...(visualGrid ? ["visual-grid"] : []),
        ...(cardNodes.length ? ["visual-example-card-nodes"] : [])
      ]
    };
  }
  if (archetype === "feature-icon-card-grid") {
    const cardNodes = structuralNodes.length >= 3 ? structuralNodes : (visualNodes || []).filter((node) => node?.box && node?.center);
    const rows = Math.max(clusterVisualNodesByAxis(cardNodes, "y", Math.max(30, Number(box.h || 0) * 0.11)).length, visualGrid?.rows || 0, 1);
    const columns = Math.max(clusterVisualNodesByAxis(cardNodes, "x", Math.max(42, Number(box.w || 0) * 0.09)).length, visualGrid?.columns || 0, 2);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "feature-icon-card-grid",
      stepCount: Math.max(cardNodes.length, rows * columns, 3),
      rows,
      columns,
      direction: "icon-card-grid",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "medium",
      evidence: [
        "editable-card-containers",
        "minimum-unit-icon-crops",
        ...(visualGrid ? ["visual-grid"] : []),
        ...(cardNodes.length ? ["feature-card-nodes"] : [])
      ]
    };
  }
  if (archetype === "numbered-step-card-grid") {
    const cardNodes = structuralNodes.length >= 3 ? structuralNodes : (visualNodes || []).filter((node) => node?.box && node?.center);
    const rows = Math.max(clusterVisualNodesByAxis(cardNodes, "y", Math.max(30, Number(box.h || 0) * 0.11)).length, visualGrid?.rows || 0, 1);
    const columns = Math.max(clusterVisualNodesByAxis(cardNodes, "x", Math.max(42, Number(box.w || 0) * 0.09)).length, visualGrid?.columns || 0, 2);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "numbered-step-card-grid",
      stepCount: Math.max(cardNodes.length, rows * columns, 3),
      rows,
      columns,
      direction: columns >= rows ? "horizontal-numbered-steps" : "vertical-numbered-steps",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "editable-card-containers",
        "editable-step-badges",
        "editable-step-text",
        ...(visualGrid ? ["visual-grid"] : []),
        ...(cardNodes.length ? ["numbered-step-card-nodes"] : [])
      ]
    };
  }
  if (archetype === "quadrant-matrix") {
    const rows = visualGrid?.rows || 2;
    const columns = visualGrid?.columns || 2;
    return {
      provider: "diagram-structure-signature-v1",
      layout: "quadrant",
      stepCount: 4,
      rows,
      columns,
      direction: "two-axis-positioning",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        ...(visualGrid ? ["visual-grid"] : []),
        "two-axis-quadrants",
        ...(structuralNodes.length ? ["quadrant-content-nodes"] : [])
      ]
    };
  }
  if (archetype === "comparison-matrix") {
    const rows = Math.max(visualGrid?.rows || 0, clusterVisualNodesByAxis(structuralNodes, "y", Math.max(26, Number(box.h || 0) * 0.09)).length, 2);
    const columns = Math.max(visualGrid?.columns || 0, clusterVisualNodesByAxis(structuralNodes, "x", Math.max(36, Number(box.w || 0) * 0.08)).length, 2);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "comparison-matrix",
      stepCount: Math.max(structuralNodes.length, rows * columns, 4),
      rows,
      columns,
      direction: "column-comparison",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        ...(visualGrid ? ["visual-grid"] : []),
        "comparison-columns",
        ...(structuralNodes.length ? ["comparison-content-nodes"] : [])
      ]
    };
  }
  if (archetype === "heatmap-matrix") {
    const rows = Math.max(visualGrid?.rows || 0, clusterVisualNodesByAxis(structuralNodes, "y", Math.max(24, Number(box.h || 0) * 0.08)).length, 2);
    const columns = Math.max(visualGrid?.columns || 0, clusterVisualNodesByAxis(structuralNodes, "x", Math.max(30, Number(box.w || 0) * 0.07)).length, 2);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "heatmap-matrix",
      stepCount: Math.max(rows * columns, structuralNodes.length, 4),
      rows,
      columns,
      direction: "color-scale-grid",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        ...(visualGrid ? ["visual-grid"] : []),
        "color-scale-cells",
        ...(structuralNodes.length ? ["heatmap-cell-nodes"] : [])
      ]
    };
  }
  if (archetype === "treemap-chart") {
    const treemapNodes = structuralNodes.length >= 3 ? structuralNodes : (visualNodes || []).filter((node) => node?.box && node?.center);
    const areas = treemapNodes.map((node) => boxArea(node.box || {})).filter((value) => value > 0);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "treemap",
      stepCount: Math.max(treemapNodes.length, 3),
      rows: Math.max(clusterVisualNodesByAxis(treemapNodes, "y", Math.max(28, Number(box.h || 0) * 0.09)).length, 1),
      columns: Math.max(clusterVisualNodesByAxis(treemapNodes, "x", Math.max(32, Number(box.w || 0) * 0.08)).length, 1),
      direction: "proportional-area-tiles",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "area-proportional-rectangles",
        ...(areas.length ? ["variable-area-tiles"] : [])
      ]
    };
  }
  if (archetype === "sankey-flow-chart") {
    const sankeyNodes = structuralNodes.length >= 3 ? structuralNodes : (visualNodes || []).filter((node) => node?.box && node?.center);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "sankey-flow",
      stepCount: Math.max(sankeyNodes.length, 3),
      rows: Math.max(clusterVisualNodesByAxis(sankeyNodes, "y", Math.max(28, Number(box.h || 0) * 0.09)).length, 1),
      columns: Math.max(clusterVisualNodesByAxis(sankeyNodes, "x", Math.max(42, Number(box.w || 0) * 0.11)).length, 2),
      direction: "weighted-source-to-target-flow",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "weighted-flow-bands",
        ...(sankeyNodes.length ? ["source-target-flow-nodes"] : [])
      ]
    };
  }
  if (archetype === "map-chart") {
    return {
      provider: "diagram-structure-signature-v1",
      layout: "geo-map",
      stepCount: Math.max((visualNodes || []).filter((node) => node?.box).length, nodes.length, 1),
      rows: 1,
      columns: 1,
      direction: "geographic-region-composition",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "geographic-region-silhouette",
        "map-component-or-fidelity-crop"
      ]
    };
  }
  if (archetype === "word-cloud-chart") {
    return {
      provider: "diagram-structure-signature-v1",
      layout: "word-cloud",
      stepCount: Math.max((visualNodes || []).filter((node) => node?.box).length, nodes.length, 1),
      rows: 1,
      columns: 1,
      direction: "weighted-keyword-size-cloud",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "weighted-keyword-cluster",
        "word-cloud-component-or-fidelity-crop"
      ]
    };
  }
  if (archetype === "machine-readable-code") {
    return {
      provider: "diagram-structure-signature-v1",
      layout: "machine-readable-code",
      stepCount: 1,
      rows: 1,
      columns: 1,
      direction: "scan-fidelity-raster",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "machine-readable-pattern",
        "preserve-exact-crop-for-scanability"
      ]
    };
  }
  if (archetype === "screenshot-annotation") {
    const atomKinds = countBy(visualAtoms, "kind");
    const overlayCount = connectorAtomCount(atomKinds)
      + (atomKinds["native-rect-candidate"] || 0)
      + (atomKinds["native-ellipse-candidate"] || 0)
      + (atomKinds["native-search-candidate"] || 0)
      + nodes.length;
    return {
      provider: "diagram-structure-signature-v1",
      layout: "screenshot-annotation",
      stepCount: Math.max(overlayCount, 1),
      rows: 1,
      columns: Math.max(Math.min(overlayCount, 6), 1),
      direction: "base-crop-with-editable-overlays",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "medium",
      evidence: [
        "base-screenshot-fidelity-crop",
        "editable-annotation-overlays"
      ]
    };
  }
  if (archetype === "screenshot-zoom-callout") {
    const atomKinds = countBy(visualAtoms, "kind");
    const overlayCount = connectorAtomCount(atomKinds)
      + (atomKinds["native-rect-candidate"] || 0)
      + (atomKinds["native-ellipse-candidate"] || 0)
      + (atomKinds["native-search-candidate"] || 0)
      + nodes.length;
    return {
      provider: "diagram-structure-signature-v1",
      layout: "screenshot-zoom-callout",
      stepCount: Math.max(overlayCount, 2),
      rows: 1,
      columns: 2,
      direction: "source-highlight-to-magnified-detail",
      connectorCount: Math.max(visualConnectors.length, connectorAtomCount(atomKinds)),
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "medium",
      evidence: [
        "base-screenshot-fidelity-crop",
        "source-highlight-region",
        "magnified-detail-crop",
        "editable-zoom-connectors"
      ]
    };
  }
  if (archetype === "waterfall-chart") {
    const bars = (visualNodes || []).filter((node) => node?.box && node?.center);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "waterfall-chart",
      stepCount: Math.max(bars.length, 4),
      rows: 1,
      columns: Math.max(bars.length, 4),
      direction: "cumulative-positive-negative-bridge",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "floating-variance-bars",
        ...(bars.length ? ["cumulative-step-bars"] : [])
      ]
    };
  }
  if (archetype === "gauge-chart") {
    return {
      provider: "diagram-structure-signature-v1",
      layout: "gauge-chart",
      stepCount: Math.max((visualNodes || []).filter((node) => node?.box).length, 1),
      rows: 1,
      columns: 1,
      direction: "semi-circular-progress-dial",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "dial-progress-arc",
        "center-value-indicator"
      ]
    };
  }
  if (archetype === "radar-chart") {
    const axes = Math.max((visualNodes || []).filter((node) => node?.box).length, nodes.length, 5);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "radar-chart",
      stepCount: axes,
      rows: 1,
      columns: axes,
      direction: "radial-multi-axis-score-polygon",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "radial-score-axes",
        "multi-dimensional-score-polygon"
      ]
    };
  }
  if (archetype === "concentric-circles") {
    const rings = Math.max((visualNodes || []).filter((node) => node?.box).length, nodes.length, 3);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "concentric-circles",
      stepCount: rings,
      rows: 1,
      columns: rings,
      direction: "nested-layer-rings",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "nested-concentric-rings",
        "layered-onion-model"
      ]
    };
  }
  if (visualGrid) {
    return {
      provider: "diagram-structure-signature-v1",
      layout: "grid",
      stepCount: Number(visualGrid.rows || 0) * Number(visualGrid.columns || 0),
      rows: visualGrid.rows,
      columns: visualGrid.columns,
      direction: "grid",
      wholeGroupTemplatePriority: "high",
      evidence: ["visual-grid"]
    };
  }
  if (archetype === "cycle-loop") {
    const atomKinds = countBy(visualAtoms, "kind");
    const arcSegmentCount = atomKinds["native-arc-arrow-segment-candidate"] || 0;
    const cycleArrowCount = atomKinds["native-cycle-arrow-candidate"] || 0;
    return {
      provider: "diagram-structure-signature-v1",
      layout: "cycle-loop",
      stepCount: Math.max(arcSegmentCount, cycleArrowCount, structuralNodes.length, 1),
      rows: 1,
      columns: 1,
      direction: "circular",
      connectorCount: Math.max(arcSegmentCount, cycleArrowCount, visualConnectors.length),
      regularSpacing: arcSegmentCount >= 4,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        ...(arcSegmentCount ? ["arc-arrow-segments"] : []),
        ...(cycleArrowCount ? ["cycle-arrow-shape"] : []),
        ...(structuralNodes.length ? ["cycle-nodes"] : [])
      ]
    };
  }
  if (archetype === "funnel-lens-flow") {
    const atomKinds = countBy(visualAtoms, "kind");
    const lensNodeCount = (visualNodes || []).filter((node) => {
      const hint = String(node?.shapeHint || "").toLowerCase();
      return node?.box && (node.kind === "native-ellipse-candidate" || node.kind === "native-funnel-candidate" || /ellipse|circle|funnel|lens|search/.test(hint));
    }).length;
    const stepCount = Math.max(structuralNodes.length, lensNodeCount + Math.max(2, visualConnectors.length), 3);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "funnel-lens-flow",
      stepCount,
      rows: 1,
      columns: Math.max(3, Math.min(8, stepCount)),
      direction: "converge-focus-output",
      connectorCount: Math.max(visualConnectors.length, connectorAtomCount(atomKinds)),
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        ...(lensNodeCount ? ["lens-or-funnel-node"] : []),
        ...(visualConnectors.length ? ["convergence-connectors"] : []),
        "analysis-flow"
      ]
    };
  }
  if (archetype === "fishbone-cause-effect") {
    const atomKinds = countBy(visualAtoms, "kind");
    const lineAtoms = (visualAtoms || []).filter((atom) => atom?.box && /connector-line-candidate|connector-arrow-candidate/.test(String(atom.kind || "")));
    const branchCount = lineAtoms.filter((atom) => {
      const hint = String(atom.shapeHint || "").toLowerCase();
      const atomBox = atom.box || {};
      const w = Number(atomBox.w || 0);
      const h = Number(atomBox.h || 0);
      return /diagonal|branch/.test(hint) || (w >= Number(box.w || 0) * 0.06 && h >= Number(box.h || 0) * 0.06 && w / Math.max(1, h) >= 0.35 && w / Math.max(1, h) <= 3.2);
    }).length;
    return {
      provider: "diagram-structure-signature-v1",
      layout: "fishbone",
      stepCount: Math.max(branchCount, structuralNodes.length, 4),
      rows: 2,
      columns: Math.max(2, Math.ceil(Math.max(branchCount, 4) / 2)),
      direction: "spine-with-diagonal-causes",
      connectorCount: Math.max(lineAtoms.length, connectorAtomCount(atomKinds)),
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: ["main-spine", "diagonal-cause-branches", ...(structuralNodes.length ? ["cause-label-nodes"] : [])]
    };
  }
  if (archetype === "topology-diagram") {
    const atomKinds = countBy(visualAtoms, "kind");
    const topologyNodes = structuralNodes.length >= 3
      ? structuralNodes
      : (visualNodes || []).filter((node) => node?.box && node?.center);
    const xSpread = spread(topologyNodes.map((node) => node.center.x));
    const ySpread = spread(topologyNodes.map((node) => node.center.y));
    const compactTriangle = topologyNodes.length === 3
      && xSpread > Number(box.w || 0) * 0.22
      && ySpread > Number(box.h || 0) * 0.18;
    return {
      provider: "diagram-structure-signature-v1",
      layout: "topology",
      stepCount: Math.max(topologyNodes.length, 3),
      rows: ySpread > Number(box.h || 0) * 0.24 ? 2 : 1,
      columns: Math.max(3, clusterVisualNodesByAxis(topologyNodes, "x", Math.max(24, Number(box.w || 0) * 0.08)).length),
      direction: compactTriangle ? "triangular-closed-loop" : "network-links",
      connectorCount: Math.max(visualConnectors.length, connectorAtomCount(atomKinds)),
      regularSpacing: compactTriangle,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "topology-nodes",
        ...(compactTriangle ? ["triangle-layout"] : []),
        ...(visualConnectors.length || connectorAtomCount(atomKinds) ? ["topology-connectors"] : [])
      ]
    };
  }
  if (archetype === "layered-stack") {
    const layerNodeSource = structuralNodes.length >= 2 ? structuralNodes : (visualNodes || []);
    const layerNodes = layerNodeSource
      .filter((node) => node?.box)
      .filter((node) => /funnel|triangle|trapezoid|chevron|parallelogram|rect/.test(String(node.shapeHint || "").toLowerCase()) || node.kind === "native-funnel-candidate");
    const yClusters = clusterVisualNodesByAxis(layerNodes, "y", Math.max(18, Number(box.h || 0) * 0.08));
    const representativeLayers = yClusters.length >= 2
      ? yClusters.map((cluster) => cluster.nodes.sort((a, b) => Number(b.box?.w || 0) - Number(a.box?.w || 0))[0]).filter(Boolean)
      : layerNodes;
    const widths = representativeLayers
      .sort((a, b) => centerOf(a.box).y - centerOf(b.box).y)
      .map((node) => Number(node.box?.w || 0))
      .filter((value) => value > 0);
    const topW = widths[0] || 0;
    const bottomW = widths[widths.length - 1] || 0;
    const direction = bottomW > topW * 1.12 ? "pyramid-down"
      : topW > bottomW * 1.12 ? "funnel-down"
        : "layered";
    const layers = Math.max(yClusters.length, representativeLayers.length, structuralNodes.length, 1);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "layered-stack",
      stepCount: layers,
      rows: layers,
      columns: 1,
      direction,
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: ["stacked-layers", ...(layerNodes.some((node) => node.kind === "native-funnel-candidate") ? ["funnel-shapes"] : [])]
    };
  }
  if (archetype === "venn-overlap") {
    const ellipseNodes = (visualNodes || [])
      .filter((node) => node?.box)
      .filter((node) => node.kind === "native-ellipse-candidate" || /ellipse|circle/.test(String(node.shapeHint || "").toLowerCase()));
    let overlapPairs = 0;
    for (let i = 0; i < ellipseNodes.length; i += 1) {
      for (let j = i + 1; j < ellipseNodes.length; j += 1) {
        if (Math.min(overlapRatio(ellipseNodes[i].box, ellipseNodes[j].box), overlapRatio(ellipseNodes[j].box, ellipseNodes[i].box)) >= 0.12) overlapPairs += 1;
      }
    }
    return {
      provider: "diagram-structure-signature-v1",
      layout: "venn-overlap",
      stepCount: Math.max(ellipseNodes.length, structuralNodes.length, 2),
      rows: 1,
      columns: Math.max(ellipseNodes.length, 2),
      direction: "overlapping-sets",
      connectorCount: overlapPairs,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: ["overlapping-ellipses", ...(overlapPairs ? ["set-intersections"] : [])]
    };
  }
  if (archetype === "timeline-roadmap") {
    const timelineNodes = structuralNodes.length >= 3 ? structuralNodes : (visualNodes || [])
      .filter((node) => node?.box && node?.center)
      .sort((a, b) => a.center.x - b.center.x);
    const spacing = spacingProfile(timelineNodes.map((node) => node.center.x));
    const ySpread = spread(timelineNodes.map((node) => node.center.y));
    return {
      provider: "diagram-structure-signature-v1",
      layout: "timeline",
      stepCount: Math.max(timelineNodes.length, structuralNodes.length, 3),
      rows: ySpread > Math.max(58, Number(box.h || 0) * 0.18) ? 2 : 1,
      columns: Math.max(timelineNodes.length, structuralNodes.length, 3),
      direction: "left-to-right-milestones",
      connectorCount: visualConnectors.length,
      regularSpacing: spacing.regular,
      spacingVariance: spacing.variance,
      wholeGroupTemplatePriority: "high",
      evidence: ["milestone-nodes", ...(spacing.regular ? ["regular-spacing"] : []), ...(visualConnectors.length ? ["timeline-axis-or-connectors"] : [])]
    };
  }
  if (archetype === "gantt-roadmap") {
    const bars = (visualNodes || []).filter((node) => {
      const nodeBox = node?.box || {};
      const width = Number(nodeBox.w || 0);
      const height = Number(nodeBox.h || 0);
      return node?.box && width > height * 2;
    }).sort((a, b) => a.center.y - b.center.y);
    const rowClusters = clusterVisualNodesByAxis(bars, "y", Math.max(20, Number(box.h || 0) * 0.07));
    const xStarts = bars.map((node) => Number(node.box.x || 0));
    const widths = bars.map((node) => Number(node.box.w || 0));
    return {
      provider: "diagram-structure-signature-v1",
      layout: "gantt-roadmap",
      stepCount: Math.max(bars.length, rowClusters.length, 3),
      rows: Math.max(rowClusters.length, 3),
      columns: Math.max(clusterNodeCenters(bars, "x", Math.max(36, Number(box.w || 0) * 0.08)).length, 3),
      direction: "left-to-right-schedule-bars",
      connectorCount: visualConnectors.length,
      regularSpacing: spacingProfile(bars.map((node) => node.center.y)).regular,
      spacingVariance: spacingProfile(bars.map((node) => node.center.y)).variance,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "schedule-bars",
        ...(spread(xStarts) ? ["staggered-starts"] : []),
        ...(spread(widths) ? ["variable-duration-bars"] : []),
        ...(visualConnectors.length ? ["timeline-axis-or-connectors"] : [])
      ]
    };
  }
  if (structuralNodes.length < 2) return null;
  const clustersX = clusterNodeCenters(structuralNodes, "x", Math.max(42, Number(box.w || 0) * 0.08));
  const clustersY = clusterNodeCenters(structuralNodes, "y", Math.max(34, Number(box.h || 0) * 0.11));
  const xSpread = spread(structuralNodes.map((node) => node.center.x));
  const ySpread = spread(structuralNodes.map((node) => node.center.y));
  const layout = inferSignatureLayout(archetype, structuralNodes, clustersX, clustersY, xSpread, ySpread);
  const direction = layout === "vertical-process" ? "top-to-bottom"
    : layout === "swimlane" ? "left-to-right-by-lane"
      : layout === "tree" ? "top-down-branching"
        : layout === "radial" ? "center-out"
          : "left-to-right";
  const spacing = layout === "vertical-process"
    ? spacingProfile(structuralNodes.map((node) => node.center.y))
    : spacingProfile(structuralNodes.map((node) => node.center.x));
  const connectorCount = visualConnectors.length;
  const stepCount = structuralNodes.length;
  const evidence = [];
  if (connectorCount > 0) evidence.push("visual-connectors");
  if (spacing.regular) evidence.push("regular-spacing");
  if (clustersY.length > 1) evidence.push("row-clusters");
  if (clustersX.length > 1) evidence.push("column-clusters");
  const wholeGroupTemplatePriority = ["linear-process", "vertical-process", "swimlane", "timeline", "tree", "radial"].includes(layout)
    && stepCount >= 3
    ? "high"
    : stepCount >= 3 ? "medium" : "low";
  return {
    provider: "diagram-structure-signature-v1",
    layout,
    stepCount,
    rows: clustersY.length,
    columns: clustersX.length,
    direction,
    connectorCount,
    regularSpacing: spacing.regular,
    spacingVariance: spacing.variance,
    wholeGroupTemplatePriority,
    evidence
  };
}

function compactVisualStructureNodes(visualNodes = [], regionBox = {}) {
  if (!Array.isArray(visualNodes) || visualNodes.length === 0) return [];
  const regionArea = Math.max(1, Number(regionBox.w || 0) * Number(regionBox.h || 0));
  const stepLike = visualNodes
    .filter((node) => node?.box && node?.center)
    .filter((node) => isStructureStepVisualNode(node, regionArea));
  const source = stepLike.length >= 2 ? stepLike : visualNodes.filter((node) => node?.box && node?.center);
  return source.filter((node) => !source.some((other) => {
    if (other === node || !other?.box || !node?.box) return false;
    const nodeArea = boxArea(node.box);
    const otherArea = boxArea(other.box);
    if (otherArea < nodeArea * 2.5) return false;
    return overlapRatio(node.box, other.box) >= 0.78 || boxCenterInside(node.box, other.box);
  }));
}

function isStructureStepVisualNode(node = {}, regionArea = 1) {
  const kind = String(node.kind || "");
  const shapeHint = String(node.shapeHint || "").toLowerCase();
  if (/scatter|donut-segment|pie-segment|cycle-arrow/.test(kind)) return false;
  if (/triangle|chevron|arc-arrow|line/.test(shapeHint)) return false;
  const areaRatio = boxArea(node.box || {}) / Math.max(1, regionArea);
  if (areaRatio >= 0.006) return true;
  return /screen|phone|document|cloud|cylinder|timeline|funnel|person|team/.test(shapeHint)
    && areaRatio >= 0.0025;
}

function inferSignatureLayout(archetype, nodes, clustersX, clustersY, xSpread, ySpread) {
  if (archetype === "tree-structure") return "tree";
  if (archetype === "cycle-loop") return "cycle-loop";
  if (archetype === "hub-spoke") return "radial";
  if (archetype === "swimlane-flow") return "swimlane";
  if (/timeline/.test(String(archetype || ""))) return "timeline";
  if (clustersY.length >= 2 && clustersY.some((cluster) => cluster.nodes.length >= 2)) return "swimlane";
  if (ySpread > xSpread * 1.15 && clustersX.length <= 2) return "vertical-process";
  if (nodes.length >= 3 && xSpread >= ySpread) return "linear-process";
  return "node-cluster";
}

function inferChartStructureSignature({ archetype = "", visualAtoms = [], visualNodes = [], box = {} } = {}) {
  const chartType = String(archetype || "");
  if (!/^(bar-chart|line-chart|scatter-chart|donut-chart|pie-chart)$/.test(chartType)) return null;
  const atomKinds = countBy(visualAtoms, "kind");
  const rectNodes = (visualNodes || []).filter((node) => {
    const kind = String(node?.kind || "");
    const hint = String(node?.shapeHint || "");
    return node?.box && (kind === "native-rect-candidate" || /rect|bar/.test(hint));
  });
  if (chartType === "bar-chart") {
    const verticalBars = rectNodes.filter((node) => {
      const nodeBox = node.box || {};
      const aspect = Number(nodeBox.w || 0) / Math.max(1, Number(nodeBox.h || 0));
      return aspect >= 0.18 && aspect <= 1.25;
    });
    const horizontalBars = rectNodes.filter((node) => {
      const nodeBox = node.box || {};
      const aspect = Number(nodeBox.w || 0) / Math.max(1, Number(nodeBox.h || 0));
      return aspect >= 1.35 && aspect <= 16;
    });
    const stacked = horizontalBars.length >= 6 && clusterNodeCenters(horizontalBars, "y", Math.max(18, Number(box.h || 0) * 0.07)).length >= 2;
    const direction = stacked ? "stacked-horizontal-bars"
      : horizontalBars.length > verticalBars.length ? "horizontal-bars"
        : "vertical-bars";
    const stepCount = Math.max(verticalBars.length, horizontalBars.length, rectNodes.length);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "bar-chart",
      stepCount,
      rows: direction === "stacked-horizontal-bars" ? clusterNodeCenters(horizontalBars, "y", Math.max(18, Number(box.h || 0) * 0.07)).length : 1,
      columns: stepCount,
      direction,
      connectorCount: connectorAtomCount(atomKinds),
      regularSpacing: stepCount >= 3,
      wholeGroupTemplatePriority: "high",
      evidence: ["chart-bars", ...(connectorAtomCount(atomKinds) ? ["chart-axis"] : [])]
    };
  }
  if (chartType === "line-chart") {
    const lineSegments = (visualAtoms || []).filter((atom) => atom?.kind === "connector-line-candidate" && atom?.shapeHint === "line-diagonal" && atom.lineEndpoints);
    const points = (visualAtoms || []).filter((atom) => atom?.kind === "native-scatter-point-candidate" && atom.box);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "line-chart",
      stepCount: Math.max(points.length, lineSegments.length + 1),
      rows: 1,
      columns: Math.max(points.length, lineSegments.length + 1),
      direction: "trend-line",
      connectorCount: lineSegments.length,
      regularSpacing: false,
      wholeGroupTemplatePriority: "high",
      evidence: ["chart-line-segments", ...(points.length ? ["chart-points"] : [])]
    };
  }
  if (chartType === "scatter-chart") {
    const points = (visualAtoms || []).filter((atom) => atom?.kind === "native-scatter-point-candidate" && atom.box);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "scatter-chart",
      stepCount: points.length,
      rows: 1,
      columns: points.length,
      direction: "point-cloud",
      connectorCount: connectorAtomCount(atomKinds),
      regularSpacing: false,
      wholeGroupTemplatePriority: "high",
      evidence: ["chart-points", ...(connectorAtomCount(atomKinds) ? ["chart-axis"] : [])]
    };
  }
  const donutSegments = (visualAtoms || []).filter((atom) => ["native-donut-segment-candidate", "native-pie-segment-candidate"].includes(atom?.kind) && atom.box);
  const donutRings = (visualAtoms || []).filter((atom) => atom?.kind === "native-donut-candidate" && atom.box);
  const stepCount = Math.max(donutSegments.length, donutRings.length);
  if (chartType === "pie-chart") {
    return {
      provider: "diagram-structure-signature-v1",
      layout: "pie-chart",
      stepCount,
      rows: 1,
      columns: stepCount,
      direction: donutSegments.length >= 2 ? "segmented-pie" : "pie",
      connectorCount: 0,
      regularSpacing: false,
      wholeGroupTemplatePriority: "high",
      evidence: [donutSegments.length >= 2 ? "chart-pie-segments" : "chart-pie"]
    };
  }
  return {
    provider: "diagram-structure-signature-v1",
    layout: "donut-chart",
    stepCount,
    rows: 1,
    columns: stepCount,
    direction: donutSegments.length >= 2 ? "segmented-ring" : "ring",
    connectorCount: 0,
    regularSpacing: false,
    wholeGroupTemplatePriority: "high",
    evidence: [donutSegments.length >= 2 ? "chart-donut-segments" : "chart-donut-rings"]
  };
}

function clusterNodeCenters(nodes = [], axis = "x", tolerance = 40) {
  const entries = nodes
    .map((node) => ({ node, value: Number(node.center?.[axis] || 0) }))
    .sort((a, b) => a.value - b.value);
  const clusters = [];
  for (const entry of entries) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(entry.value - last.center) > tolerance) {
      clusters.push({ center: entry.value, nodes: [entry.node] });
    } else {
      last.nodes.push(entry.node);
      last.center = average(last.nodes.map((node) => Number(node.center?.[axis] || 0)));
    }
  }
  return clusters;
}

function spacingProfile(values = []) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length < 3) return { regular: false, variance: null };
  const gaps = [];
  for (let index = 1; index < sorted.length; index += 1) gaps.push(sorted[index] - sorted[index - 1]);
  const avg = average(gaps);
  const variance = average(gaps.map((gap) => Math.abs(gap - avg))) / Math.max(1, avg);
  return {
    regular: variance <= 0.18,
    variance: round(variance)
  };
}

function spread(values = []) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return 0;
  return Math.max(...finite) - Math.min(...finite);
}

function inferVisualGridStructure(visualAtoms = [], regionBox = {}) {
  const gridLines = (visualAtoms || []).filter((atom) => atom?.kind === "grid-line-candidate" && atom.box);
  if (gridLines.length < 4) return null;
  const horizontal = clusterGridLines(gridLines.filter((atom) => atom.axis === "h" || atom.shapeHint === "grid-line-horizontal"), "h");
  const vertical = clusterGridLines(gridLines.filter((atom) => atom.axis === "v" || atom.shapeHint === "grid-line-vertical"), "v");
  if (horizontal.length < 2 || vertical.length < 2) return null;
  const xLines = vertical.map((line) => line.position).sort((a, b) => a - b);
  const yLines = horizontal.map((line) => line.position).sort((a, b) => a - b);
  const bounds = {
    x: round(Math.min(...xLines)),
    y: round(Math.min(...yLines)),
    w: round(Math.max(...xLines) - Math.min(...xLines)),
    h: round(Math.max(...yLines) - Math.min(...yLines))
  };
  if (bounds.w < Math.max(80, Number(regionBox.w || 0) * 0.22) || bounds.h < Math.max(50, Number(regionBox.h || 0) * 0.18)) return null;
  const coverageRatio = round((bounds.w * bounds.h) / Math.max(1, Number(regionBox.w || 0) * Number(regionBox.h || 0)));
  if (coverageRatio < 0.12) return null;
  const stroke = dominantValue(gridLines.map((atom) => atom.color).filter(Boolean)) || "#8A8F98";
  return {
    provider: "visual-grid-structure-v1",
    rows: Math.max(1, yLines.length - 1),
    columns: Math.max(1, xLines.length - 1),
    xLines: xLines.map(round),
    yLines: yLines.map(round),
    bounds,
    coverageRatio,
    lineCount: horizontal.length + vertical.length,
    stroke
  };
}

function clusterGridLines(lines = [], axis) {
  const tolerance = axis === "h" ? 5 : 5;
  const entries = lines
    .map((atom) => {
      const box = atom.box || {};
      const position = axis === "h"
        ? Number(box.y || 0) + Number(box.h || 0) / 2
        : Number(box.x || 0) + Number(box.w || 0) / 2;
      const span = axis === "h" ? Number(box.w || 0) : Number(box.h || 0);
      return { atom, position, span };
    })
    .filter((entry) => Number.isFinite(entry.position) && entry.span > 0)
    .sort((a, b) => a.position - b.position);
  const clusters = [];
  for (const entry of entries) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(entry.position - last.position) > tolerance) {
      clusters.push({ entries: [entry], position: entry.position, span: entry.span });
    } else {
      last.entries.push(entry);
      const totalSpan = last.entries.reduce((sum, item) => sum + item.span, 0);
      last.position = last.entries.reduce((sum, item) => sum + item.position * item.span, 0) / Math.max(1, totalSpan);
      last.span = Math.max(last.span, entry.span);
    }
  }
  return clusters.map((cluster) => ({
    position: round(cluster.position),
    span: round(cluster.span),
    atoms: cluster.entries.map((entry) => entry.atom.id).filter(Boolean)
  }));
}

function dominantValue(values = []) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function distanceToCentroid(node, nodes) {
  const centroid = {
    x: nodes.reduce((sum, item) => sum + item.center.x, 0) / Math.max(1, nodes.length),
    y: nodes.reduce((sum, item) => sum + item.center.y, 0) / Math.max(1, nodes.length)
  };
  return distance(node.center, centroid);
}

function dispersion(nodes, slideSize = DEFAULT_SLIDE) {
  if (nodes.length < 2) return 0;
  const xs = nodes.map((node) => node.center.x);
  const ys = nodes.map((node) => node.center.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return Math.max(width / Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt), height / Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt));
}

function overlapRatio(a = {}, b = {}) {
  const x1 = Math.max(Number(a.x || 0), Number(b.x || 0));
  const y1 = Math.max(Number(a.y || 0), Number(b.y || 0));
  const x2 = Math.min(Number(a.x || 0) + Number(a.w || 0), Number(b.x || 0) + Number(b.w || 0));
  const y2 = Math.min(Number(a.y || 0) + Number(a.h || 0), Number(b.y || 0) + Number(b.h || 0));
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area = Math.max(1, Number(a.w || 0) * Number(a.h || 0));
  return intersection / area;
}

function boxArea(box = {}) {
  return Math.max(0, Number(box.w || 0)) * Math.max(0, Number(box.h || 0));
}

function boxCenterInside(inner = {}, outer = {}) {
  const center = centerOf(inner);
  return center.x >= Number(outer.x || 0)
    && center.x <= Number(outer.x || 0) + Number(outer.w || 0)
    && center.y >= Number(outer.y || 0)
    && center.y <= Number(outer.y || 0) + Number(outer.h || 0);
}

function centerOf(box = {}) {
  return {
    x: Number(box.x || 0) + Number(box.w || 0) / 2,
    y: Number(box.y || 0) + Number(box.h || 0) / 2
  };
}

function distance(a, b) {
  return Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.y || 0) - Number(b.y || 0));
}

function average(values = []) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, values.length);
}

function median(values = []) {
  const sorted = values.map((value) => Number(value || 0)).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

module.exports = {
  understandDiagramLayer,
  _private: {
    inferArchetype,
    inferConnectors,
    inferNodes,
    inferVisualAtomConnectors,
    inferVisualAtomNodes,
    inferVisualGridStructure,
    inferComponentStrategy,
    inferExpressionFamily,
    inferTargetMotifs,
    readinessFor,
    textBoxesInside
  }
};
