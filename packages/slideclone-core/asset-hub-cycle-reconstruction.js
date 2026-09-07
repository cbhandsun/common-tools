"use strict";
const {boxCenterInside, round, ptToPxBox, pxToPtBox, centerOfBox} = require("./raster-native-detection");
const {createSegmentedAssetOsClosedLoopCycleObjects} = require("./asset-os-closed-loop-reconstruction");
const {shouldObjectifySkillsEngineAiComparisonMatrix, comparisonMatrixVisualAtoms, hasComparisonMatrixLayerEvidence} = require("./comparison-matrix-evidence");
const {lineBox, safeIdentifier} = require("./workflow-shape-primitives");
const {cropPng, writePng} = require("./png");
const {ensureDir} = require("./residual-primitive-erasure");
const path = require("node:path");
const {assetHubCycleNativeComponentMetadata} = require("./diagram-residual-crops");
const {roundedBox} = require("./prd-generation-shapes");
const {uniqueSortedLinePositions} = require("./residual-component-analysis");
const DEFAULT_SLIDE = {widthPt: 960, heightPt: 540};

function createAssetHubCycleIllustrationObjects(page, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!page || !Array.isArray(page.images)) return { shapes: [], textBoxes: [] };
  const hasGridLikeCycleEvidence = page.images.some((image) => shouldObjectifyGridLikeCycleHubSpoke(image, page, slideSize));
  if (!hasGridLikeCycleEvidence && shouldObjectifySkillsEngineAiComparisonMatrix(page, page.textBoxes || [], slideSize)) {
    return { shapes: [], textBoxes: [] };
  }
  const shapes = [];
  const textBoxes = [];
  const images = [];
  const segmentedAssetOsClosedLoop = createSegmentedAssetOsClosedLoopCycleObjects(page, slideSize, options);
  if (segmentedAssetOsClosedLoop.shapes.length > 0 || segmentedAssetOsClosedLoop.textBoxes.length > 0 || segmentedAssetOsClosedLoop.images?.length > 0) {
    shapes.push(...segmentedAssetOsClosedLoop.shapes);
    textBoxes.push(...segmentedAssetOsClosedLoop.textBoxes);
    images.push(...(segmentedAssetOsClosedLoop.images || []));
  }
  for (const image of page.images) {
    if (image?.source?.assetOsClosedLoopCycleObjectified === true) continue;
    if (shouldObjectifyAiSkillsClosedLoopCycle(image, page, slideSize)) {
      const objects = aiSkillsClosedLoopCycleObjectsForImage(image, options);
      if (objects.shapes.length === 0) continue;
      shapes.push(...objects.shapes);
      textBoxes.push(...objects.textBoxes);
      images.push(...(objects.images || []));
      image.source = {
        ...(image.source || {}),
        assetHubCycleObjectified: true,
        aiSkillsClosedLoopCycleObjectified: true,
        assetHubCycleInputIconsObjectified: true,
        assetHubCycleOutputGemsObjectified: true,
        assetHubCycleResidualBoxes: [],
        dropErasedResidualAfterNativeRebuild: true,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "AI Skills closed-loop cycle"}; rebuilt closed-loop engine, skill cards, input fragments, output assets, and routes as native editable objects`
      };
      continue;
    }
    if (!shouldObjectifyAssetHubCycleIllustration(image, page, slideSize)) continue;
    const preserveEndpointIcons = options.preserveEndpointIcons !== false;
    const centerTextEraseBoxes = (page.textBoxes || [])
      .filter((item) => /PM\s*Portal|Platform|A\s*Skills|ASkills|驱动引擎|分布式域仓/i.test(String(item?.text || "")))
      .filter((item) => item?.box && boxCenterInside(item.box, image.box))
      .map((item) => ({ ...item.box }));
    normalizeAssetHubEndpointLabels(page.textBoxes || [], image.box, image.id || "asset-hub-cycle");
    const objects = assetHubCycleIllustrationObjectsForImage(image, {
      objectifyInputIcons: !preserveEndpointIcons && options.objectifyInputIcons === true,
      objectifyOutputIcons: !preserveEndpointIcons && options.objectifyOutputIcons === true,
      objectifyCenterShell: options.objectifyCenterShell === true
    });
    if (objects.shapes.length === 0) continue;
    shapes.push(...objects.shapes);
    textBoxes.push(...objects.textBoxes);
    image.source = {
      ...(image.source || {}),
      assetHubCycleObjectified: true,
      assetHubCycleInputIconsObjectified: objects.inputIconsObjectified === true,
      assetHubCycleOutputGemsObjectified: objects.outputGemsObjectified === true,
      assetHubCycleCenterShellObjectified: objects.centerShellObjectified === true,
      assetHubCycleCenterTextEraseBoxes: centerTextEraseBoxes,
      assetHubCycleResidualBoxes: assetHubCycleResidualRegions(image.box),
      textObjectified: true,
      textErasedFromCrop: true,
      dropErasedResidualAfterNativeRebuild: image.source?.dropErasedResidualAfterNativeRebuild,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "asset hub cycle"}; preserved as fidelity crop under editable native helpers`
    };
  }
  for (const image of page.images) {
    if (image?.source?.assetHubCycleObjectified === true || image?.source?.aiSkillsClosedLoopCycleObjectified === true || image?.source?.assetOsClosedLoopCycleObjectified === true) continue;
    if (shouldObjectifyGridLikeCycleHubSpoke(image, page, slideSize)) {
      const localShapes = gridLikeCycleHubSpokeShapesForImage(image);
      const localTextBoxes = gridLikeCycleHubSpokeSemanticTextBoxes(image);
      if (localShapes.length === 0) continue;
      shapes.push(...localShapes);
      textBoxes.push(...localTextBoxes);
      image.source = {
        ...(image.source || {}),
        gridLikeCycleHubSpokeObjectified: true,
        gridLikeCycleHubSpokeSemanticTextObjectified: localTextBoxes.length > 0,
        gridLikeCycleHubSpokeNativeTextBoxes: localTextBoxes,
        visualAtomOverlayOnly: true,
        objectifiedGridLikeCycleHubSpokeShapes: localShapes.length,
        objectifiedGridLikeCycleHubSpokeTextBoxes: localTextBoxes.length,
        dropErasedResidualAfterNativeRebuild: image.source?.dropErasedResidualAfterNativeRebuild,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "grid-like hub-spoke illustration"}; detected grid-like comparison structure inside hub-spoke crop and rebuilt it as native grid, column highlights, and editable semantic labels while preserving decorative residuals`
      };
      continue;
    }
    if (!shouldObjectifyGenericCycleHubSpokeSkeleton(image, page, slideSize)) continue;
    const localShapes = genericCycleHubSpokeSkeletonShapesForImage(image);
    if (localShapes.length === 0) continue;
    const localTextBoxes = genericCycleHubSpokeSemanticTextBoxes(image);
    shapes.push(...localShapes);
    textBoxes.push(...localTextBoxes);
    image.source = {
      ...(image.source || {}),
      genericCycleHubSpokeSkeletonObjectified: true,
      genericCycleHubSpokeSemanticTextObjectified: localTextBoxes.length > 0,
      genericCycleHubSpokeNativeTextBoxes: localTextBoxes,
      visualAtomOverlayOnly: true,
      objectifiedGenericCycleHubSpokeShapes: localShapes.length,
      objectifiedGenericCycleHubSpokeTextBoxes: localTextBoxes.length,
      dropErasedResidualAfterNativeRebuild: image.source?.dropErasedResidualAfterNativeRebuild,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "circular hub-spoke illustration"}; circular hub-spoke diagram rebuilt as native ring, arrow, hub, spoke, and node skeleton overlays while preserving the source crop`
    };
  }
  return { shapes, textBoxes, images };
}

function shouldObjectifyAssetHubCycleIllustration(image, page = {}, slideSize = DEFAULT_SLIDE) {
  if (image?.source?.detector !== "cycle-illustration-underlay-crop") return false;
  if (hasComparisonMatrixLayerEvidence(image, page)) return false;
  const box = image.box || {};
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const areaRatio = w * h / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  if (w < 700 || h < 320 || areaRatio < 0.45 || areaRatio > 0.66) return false;
  const pageText = (page.textBoxes || []).map((item) => String(item.text || "")).join(" ");
  return /AI原生产品资产中枢|PM\s*Portal|产品资产中枢/i.test(pageText);
}

function shouldObjectifyAiSkillsClosedLoopCycle(image, page = {}, slideSize = DEFAULT_SLIDE) {
  if (image?.source?.detector !== "cycle-illustration-underlay-crop") return false;
  if (hasComparisonMatrixLayerEvidence(image, page)) return false;
  const box = image.box || {};
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const areaRatio = w * h / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  if (w < 760 || h < 320 || areaRatio < 0.45 || areaRatio > 0.70) return false;
  const pageText = (page.textBoxes || []).map((item) => String(item.text || "")).join(" ");
  const normalized = pageText.replace(/\s+/g, "");
  const assetHubSignals = [
    "AI原生产品资产中枢",
    "产品资产中枢",
    "PMPortal",
    "散落的飞书文档",
    "割裂的交互原型",
    "孤立的评审记录",
    "可检索的组织级知识",
    "标准化交付物",
    "研发一致性契约"
  ].filter((signal) => normalized.includes(signal)).length;
  if (assetHubSignals >= 1) return false;
  const closedLoopSignals = ["需求捕获", "交互交付", "闭环"]
    .filter((signal) => normalized.includes(signal)).length;
  return /A[Iil1]?\s*Skills|A[lI]skills/i.test(pageText)
    && closedLoopSignals >= 2;
}

function shouldObjectifyGenericCycleHubSpokeSkeleton(image, page = {}, slideSize = DEFAULT_SLIDE) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const box = image?.box || {};
  const reason = `${source.reason || ""} ${source.nonEditableReason || ""} ${source.expressionSubtype || ""}`;
  const semanticNodes = Array.isArray(understanding.nodes) ? understanding.nodes : [];
  const safeSemanticNodeCount = semanticNodes
    .filter((node) => node?.box && boxCenterInside(node.box, box))
    .filter((node) => isSafeGenericCycleHubSpokeNodeText(node.text))
    .length;
  if (source.detector !== "cycle-illustration-underlay-crop") return false;
  const strongHubSpokeSemanticEvidence = /circular|cycle|hub|spoke|icon/i.test(reason) && safeSemanticNodeCount >= 8;
  if (hasComparisonMatrixLayerEvidence(image, page) && !strongHubSpokeSemanticEvidence) return false;
  if (layer.layerType !== "illustration-zone") return false;
  if (understanding.archetype !== "hub-spoke") return false;
  if (Number(understanding.confidence || 0) < 0.9) return false;
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const areaRatio = w * h / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  if (w < 650 || h < 280 || areaRatio < 0.38 || areaRatio > 0.75) return false;
  const visualAtoms = comparisonMatrixVisualAtoms(image);
  const hasCircularEvidence = /circular|cycle|hub|spoke|icon/i.test(reason)
    || visualAtoms.some((atom) => /native-cycle-arrow|native-shield|connector|grid-line/.test(String(atom?.kind || "")))
    || safeSemanticNodeCount >= 4;
  const pageText = (page.textBoxes || []).map((item) => String(item.text || "")).join(" ");
  const looksLikeWorkflowExperiment = /WMS|入库单|质量前置|实验案例/.test(pageText);
  return hasCircularEvidence && !looksLikeWorkflowExperiment;
}

function shouldObjectifyGridLikeCycleHubSpoke(image, page = {}, slideSize = DEFAULT_SLIDE) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const box = image?.box || {};
  if (source.detector !== "cycle-illustration-underlay-crop") return false;
  if (layer.layerType !== "illustration-zone") return false;
  if (understanding.archetype !== "hub-spoke") return false;
  if (Number(understanding.confidence || 0) < 0.9) return false;
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const areaRatio = w * h / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  if (w < 650 || h < 280 || areaRatio < 0.38 || areaRatio > 0.75) return false;
  const nodes = gridLikeCycleHubSpokeSemanticNodes(image);
  const grid = gridLikeCycleHubSpokeGrid(image);
  const pageText = (page.textBoxes || []).map((item) => String(item.text || "")).join(" ");
  const hasComparisonWording = /对话框|普通.*AI|上下文感知|质量校验|资产落盘|全域资产/.test(`${pageText} ${nodes.map((node) => node.text).join(" ")}`);
  return nodes.length >= 8 && grid && grid.xLines.length >= 4 && grid.yLines.length >= 4 && hasComparisonWording;
}

function gridLikeCycleHubSpokeShapesForImage(image) {
  const box = image?.box || {};
  const grid = gridLikeCycleHubSpokeGrid(image);
  if (!grid || !box.w || !box.h) return [];
  const base = image.id || "grid-like-cycle-hub-spoke";
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "table-or-matrix",
    expressionSubtype: "grid-like-cycle-hub-spoke",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "illustration-zone",
    skeletonOnly: true,
    gridProvider: grid.provider,
    ...extra
  });
  const shapes = [{
    id: `${base}-native-grid-bg`,
    type: "roundRect",
    box: roundedBox({ x, y, w, h }),
    style: {
      fill: "#FFFFFF",
      stroke: "#B9CAD8",
      strokeWidthPt: 1,
      radiusRatio: 0.035,
      opacity: 0.64,
      shadow: { color: "#5B7890", alpha: 0.08, blurPt: 3, distancePt: 1, angleDeg: 90 }
    },
    source: source("grid-like-cycle-hub-spoke-native-grid-bg")
  }];
  const headerBottom = grid.yLines[1];
  shapes.push({
    id: `${base}-native-grid-header`,
    type: "rect",
    box: roundedBox({ x, y, w, h: Math.max(18, headerBottom - y) }),
    style: { fill: "#EAF2F7", stroke: "none", strokeWidthPt: 0, opacity: 0.76 },
    source: source("grid-like-cycle-hub-spoke-native-grid-header")
  });
  const lastColX = grid.xLines[grid.xLines.length - 2];
  const lastColW = grid.xLines[grid.xLines.length - 1] - lastColX;
  shapes.push({
    id: `${base}-native-grid-highlight-column`,
    type: "rect",
    box: roundedBox({ x: lastColX, y: headerBottom, w: lastColW, h: Math.max(1, y + h - headerBottom) }),
    style: { fill: "#E9F8F1", stroke: "#38A974", strokeWidthPt: 0.9, opacity: 0.32 },
    source: source("grid-like-cycle-hub-spoke-native-highlight-column", { columnIndex: grid.xLines.length - 2 })
  });
  grid.xLines.slice(1, -1).forEach((lineX, index) => {
    shapes.push({
      id: `${base}-native-grid-vline-${index + 1}`,
      type: "line",
      box: { x: round(lineX), y: round(y), w: 0, h: round(h) },
      style: { stroke: "#8EA5B6", strokeWidthPt: 1, connectorType: "straight", opacity: 0.86 },
      source: source("grid-like-cycle-hub-spoke-native-grid-line", { axis: "x", index: index + 1 })
    });
  });
  grid.yLines.slice(1, -1).forEach((lineY, index) => {
    shapes.push({
      id: `${base}-native-grid-hline-${index + 1}`,
      type: "line",
      box: { x: round(x), y: round(lineY), w: round(w), h: 0 },
      style: { stroke: "#8EA5B6", strokeWidthPt: 1, connectorType: "straight", opacity: 0.86 },
      source: source("grid-like-cycle-hub-spoke-native-grid-line", { axis: "y", index: index + 1 })
    });
  });
  const labelRows = grid.yLines.slice(1, -1);
  labelRows.forEach((lineY, index) => {
    const rowTop = index === 0 ? headerBottom : labelRows[index - 1];
    const rowBottom = lineY;
    shapes.push({
      id: `${base}-native-row-label-accent-${index + 1}`,
      type: "roundRect",
      box: roundedBox({
        x: x + 12,
        y: rowTop + Math.max(8, (rowBottom - rowTop) * 0.18),
        w: Math.max(42, grid.xLines[1] - x - 28),
        h: Math.max(18, (rowBottom - rowTop) * 0.36)
      }),
      style: {
        fill: index % 2 === 0 ? "#F3A34A" : "#2E86D1",
        stroke: "none",
        strokeWidthPt: 0,
        radiusRatio: 0.28,
        opacity: 0.22
      },
      source: source("grid-like-cycle-hub-spoke-native-row-label-accent", { row: index + 1 })
    });
  });
  return shapes;
}

function gridLikeCycleHubSpokeGrid(image = {}) {
  const box = image?.box || {};
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  if (!w || !h) return null;
  const understanding = image?.source?.layer?.diagramUnderstanding || image?.source?.diagramUnderstanding || {};
  const visualGrid = understanding.visualGrid || {};
  const atoms = comparisonMatrixVisualAtoms(image).filter((atom) => atom?.kind === "grid-line-candidate" && atom?.box);
  const fullVertical = atoms
    .filter((atom) => atom.axis === "v")
    .filter((atom) => Number(atom.box.y || 0) <= y + Math.max(8, h * 0.04))
    .filter((atom) => Number(atom.box.h || 0) >= h * 0.80)
    .map((atom) => Number(atom.box.x || 0) + Number(atom.box.w || 0) / 2);
  const xLines = uniqueSortedLinePositions([x, ...fullVertical, x + w], Math.max(5, w * 0.014))
    .filter((line) => line >= x - 1 && line <= x + w + 1);
  const fullHorizontal = atoms
    .filter((atom) => atom.axis === "h")
    .filter((atom) => Number(atom.box.w || 0) >= w * 0.65)
    .map((atom) => Number(atom.box.y || 0) + Number(atom.box.h || 0) / 2);
  const yLines = uniqueSortedLinePositions([y, ...fullHorizontal, y + h], Math.max(4, h * 0.012))
    .filter((line) => line >= y - 1 && line <= y + h + 1);
  if (xLines.length >= 4 && yLines.length >= 4) {
    return { provider: "visual-atom-grid-lines", xLines, yLines };
  }
  if (Array.isArray(visualGrid.xLines) && Array.isArray(visualGrid.yLines) && visualGrid.xLines.length >= 3 && visualGrid.yLines.length >= 3) {
    return {
      provider: "diagram-understanding-visual-grid",
      xLines: uniqueSortedLinePositions([x, ...visualGrid.xLines, x + w], Math.max(5, w * 0.014)),
      yLines: uniqueSortedLinePositions([y, ...visualGrid.yLines, y + h], Math.max(4, h * 0.012))
    };
  }
  return null;
}

function gridLikeCycleHubSpokeSemanticNodes(image = {}) {
  const box = image?.box || {};
  const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
    ? image.source.layer.diagramUnderstanding.nodes
    : Array.isArray(image?.source?.diagramUnderstanding?.nodes)
      ? image.source.diagramUnderstanding.nodes
      : [];
  return nodes
    .filter((node) => node?.box && boxCenterInside(node.box, box))
    .filter((node) => isSafeGenericCycleHubSpokeNodeText(node.text));
}

function gridLikeCycleHubSpokeSemanticTextBoxes(image = {}) {
  const seen = new Set();
  return gridLikeCycleHubSpokeSemanticNodes(image)
    .map((node, index) => {
      const text = normalizeGenericCycleHubSpokeNodeText(node.text);
      const key = text.replace(/\s+/g, "");
      if (seen.has(key)) return null;
      seen.add(key);
      const textBox = genericCycleHubSpokeTextBox(image, node, text, index);
      textBox.source = {
        ...(textBox.source || {}),
        detector: "grid-like-cycle-hub-spoke-semantic-node-text",
        expressionForm: "table-or-matrix",
        expressionSubtype: "grid-like-cycle-hub-spoke"
      };
      return textBox;
    })
    .filter(Boolean)
    .slice(0, 18);
}

function genericCycleHubSpokeSkeletonShapesForImage(image) {
  const box = image?.box || {};
  if (!box.w || !box.h) return [];
  const base = image.id || "generic-cycle-hub-spoke";
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const cx = x + w * 0.50;
  const cy = y + h * 0.50;
  const ringSize = Math.min(w * 0.52, h * 0.78);
  const ring = roundedBox({
    x: cx - ringSize / 2,
    y: cy - ringSize / 2,
    w: ringSize,
    h: ringSize
  });
  const hubSize = ringSize * 0.33;
  const hub = roundedBox({
    x: cx - hubSize / 2,
    y: cy - hubSize / 2,
    w: hubSize,
    h: hubSize
  });
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "icon-or-illustration",
    expressionSubtype: "cycle-hub-spoke-skeleton",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "illustration-zone",
    skeletonOnly: true,
    ...extra
  });
  const shapes = [
    {
      id: `${base}-native-skeleton-ring`,
      type: "ellipse",
      box: ring,
      style: {
        fill: "none",
        stroke: "#2E86D1",
        strokeWidthPt: Math.max(8, Math.min(18, ringSize * 0.035)),
        opacity: 0.72,
        shadow: { color: "#2E86D1", alpha: 0.10, blurPt: 5, distancePt: 1, angleDeg: 90 }
      },
      source: source("generic-cycle-hub-spoke-native-skeleton-ring")
    },
    {
      id: `${base}-native-skeleton-hub`,
      type: "ellipse",
      box: hub,
      style: {
        fill: "#F7FBFF",
        stroke: "#2E86D1",
        strokeWidthPt: 1.4,
        opacity: 0.84,
        shadow: { color: "#487FAE", alpha: 0.14, blurPt: 4, distancePt: 1, angleDeg: 90 }
      },
      source: source("generic-cycle-hub-spoke-native-skeleton-hub")
    }
  ];
  const routePoints = [
    { x: cx - ringSize * 0.34, y: cy - ringSize * 0.23 },
    { x: cx + ringSize * 0.18, y: cy - ringSize * 0.39 },
    { x: cx + ringSize * 0.39, y: cy + ringSize * 0.08 },
    { x: cx + ringSize * 0.04, y: cy + ringSize * 0.39 },
    { x: cx - ringSize * 0.38, y: cy + ringSize * 0.12 },
    { x: cx - ringSize * 0.34, y: cy - ringSize * 0.23 }
  ];
  for (let index = 0; index < routePoints.length - 1; index += 1) {
    const from = routePoints[index];
    const to = routePoints[index + 1];
    shapes.push({
      id: `${base}-native-skeleton-ring-arrow-${index}`,
      type: "line",
      box: lineBox(from, to),
      style: {
        stroke: index % 2 === 0 ? "#2E86D1" : "#37B26C",
        strokeWidthPt: Math.max(4, Math.min(9, ringSize * 0.018)),
        connectorType: "straight",
        endArrow: "triangle",
        lineCap: "round",
        opacity: 0.82
      },
      source: source("generic-cycle-hub-spoke-native-skeleton-ring-arrow", { segmentIndex: index })
    });
  }
  const nodeCount = Math.max(4, Math.min(6, Number(image.source?.layer?.diagramUnderstanding?.nodeCount || image.source?.diagramUnderstanding?.nodeCount || 4) >= 8 ? 6 : 4));
  const nodeRadiusX = w * 0.42;
  const nodeRadiusY = h * 0.37;
  for (let index = 0; index < nodeCount; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / nodeCount;
    const nodeW = Math.min(w * 0.16, 110);
    const nodeH = Math.min(h * 0.18, 58);
    const node = roundedBox({
      x: cx + Math.cos(angle) * nodeRadiusX - nodeW / 2,
      y: cy + Math.sin(angle) * nodeRadiusY - nodeH / 2,
      w: nodeW,
      h: nodeH
    });
    const nodeCenter = centerOfBox(node);
    shapes.push({
      id: `${base}-native-skeleton-spoke-${index}`,
      type: "line",
      box: lineBox({ x: cx, y: cy }, nodeCenter),
      style: { stroke: "#A8C7E0", strokeWidthPt: 1.1, connectorType: "straight", opacity: 0.72 },
      source: source("generic-cycle-hub-spoke-native-skeleton-spoke", { nodeIndex: index })
    });
    shapes.push({
      id: `${base}-native-skeleton-node-${index}`,
      type: "roundRect",
      box: node,
      style: {
        fill: "#FFFFFF",
        stroke: "#7DB7E8",
        strokeWidthPt: 1,
        radiusRatio: 0.12,
        opacity: 0.80,
        shadow: { color: "#6EA6D8", alpha: 0.10, blurPt: 2.5, distancePt: 0.8, angleDeg: 90 }
      },
      source: source("generic-cycle-hub-spoke-native-skeleton-node", { nodeIndex: index })
    });
    shapes.push({
      id: `${base}-native-skeleton-node-dot-${index}`,
      type: "ellipse",
      box: roundedBox({ x: node.x + node.w * 0.10, y: node.y + node.h * 0.33, w: node.h * 0.25, h: node.h * 0.25 }),
      style: { fill: index % 2 === 0 ? "#37B26C" : "#2E86D1", stroke: "none", strokeWidthPt: 0, opacity: 0.82 },
      source: source("generic-cycle-hub-spoke-native-skeleton-node-dot", { nodeIndex: index })
    });
  }
  return shapes;
}

function genericCycleHubSpokeSemanticTextBoxes(image = {}) {
  const box = image?.box || {};
  const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
    ? image.source.layer.diagramUnderstanding.nodes
    : Array.isArray(image?.source?.diagramUnderstanding?.nodes)
      ? image.source.diagramUnderstanding.nodes
      : [];
  const seen = new Set();
  return nodes
    .filter((node) => node?.box && isSafeGenericCycleHubSpokeNodeText(node.text))
    .filter((node) => boxCenterInside(node.box, box))
    .map((node, index) => {
      const text = normalizeGenericCycleHubSpokeNodeText(node.text);
      const key = text.replace(/\s+/g, "");
      if (seen.has(key)) return null;
      seen.add(key);
      return genericCycleHubSpokeTextBox(image, node, text, index);
    })
    .filter(Boolean)
    .slice(0, 16);
}

function isSafeGenericCycleHubSpokeNodeText(text) {
  const normalized = normalizeGenericCycleHubSpokeNodeText(text);
  if (!normalized) return false;
  if (normalized.length > 28) return false;
  if (/^[\d\s.,;:|/\\\-+_()[\]{}]+$/.test(normalized)) return false;
  if (/^(?:[A-Z]{1,2}|\d+)$/.test(normalized)) return false;
  return /[\u4e00-\u9fffA-Za-z]/.test(normalized);
}

function normalizeGenericCycleHubSpokeNodeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[：:，,。.;；]+$/g, "")
    .trim();
}

function genericCycleHubSpokeTextBox(image, node, text, index) {
  const nodeBox = roundedBox(node.box || {});
  const fontSize = Math.max(8, Math.min(15, Math.min(Number(nodeBox.h || 0) * 0.38 || 11, Number(nodeBox.w || 0) / Math.max(2.5, text.length * 0.95))));
  const sourceId = image?.id || "generic-cycle-hub-spoke";
  return {
    id: node.sourceTextBoxId || `${sourceId}-native-semantic-node-text-${index}`,
    text,
    box: {
      x: nodeBox.x,
      y: nodeBox.y,
      w: Math.max(28, nodeBox.w),
      h: Math.max(14, nodeBox.h)
    },
    font: {
      family: "SimHei",
      sizePt: fontSize,
      color: "#1F3447",
      weight: text.length <= 6 ? "bold" : "regular",
      opacity: 1
    },
    align: "center",
    verticalAlign: "middle",
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "generic-cycle-hub-spoke-semantic-node-text",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "cycle-hub-spoke-skeleton",
      layerSourceId: image?.id || null,
      layerType: image?.source?.layer?.layerType || "illustration-zone",
      semanticTextSource: true,
      semanticNodeId: node.id || "",
      overlayVisibility: "visible"
    }
  };
}

function aiSkillsClosedLoopCycleObjectsForImage(image, options = {}) {
  const box = image.box || {};
  const base = image.id || "ai-skills-cycle";
  const blue = "#1D63D8";
  const green = "#33C56F";
  const border = "#6F91B0";
  const src = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "illustration-zone",
    sourceDetector: image.source?.detector || null,
    confidence: 0.76,
    ...extra
  });
  const shape = (suffix, detector, type, shapeBox, style, extra = {}) => ({
    id: `${base}-ai-skills-cycle-${suffix}`,
    type,
    box: {
      x: round(shapeBox.x),
      y: round(shapeBox.y),
      w: round(shapeBox.w),
      h: round(shapeBox.h)
    },
    style,
    source: src(detector, extra)
  });
  const line = (suffix, from, to, color = green, width = 8, extra = {}) => shape(suffix, "ai-skills-cycle-native-route", "line", lineBox(from, to), {
    stroke: color,
    strokeWidthPt: width,
    connectorType: "straight",
    endArrow: extra.endArrow || undefined,
    lineCap: "round"
  }, extra);
  const textBox = (suffix, text, textBox, font = {}) => ({
    id: `${base}-ai-skills-cycle-text-${suffix}`,
    text,
    box: {
      x: round(textBox.x),
      y: round(textBox.y),
      w: round(textBox.w),
      h: round(textBox.h)
    },
    font: {
      family: "Microsoft YaHei",
      sizePt: font.sizePt || 12,
      color: font.color || "#111111",
      weight: font.weight || "regular",
      align: font.align || "left",
      valign: font.valign || "middle",
      opacity: 1
    },
    style: {
      visibility: "visible",
      opacity: 1,
      marginLeftPt: 0,
      marginRightPt: 0,
      marginTopPt: 0,
      marginBottomPt: 0,
      fit: "shrink"
    },
    source: src("ai-skills-cycle-native-text", { textRole: suffix })
  });
  const sx = (n) => Number(box.x || 0) + Number(box.w || 0) * n;
  const sy = (n) => Number(box.y || 0) + Number(box.h || 0) * n;
  const sw = (n) => Number(box.w || 0) * n;
  const sh = (n) => Number(box.h || 0) * n;
  // The source ring is a compact stroked loop; reserve room for its stroke rather than fitting it to the full illustration box.
  const ring = { x: sx(0.297), y: sy(0.064), w: sw(0.408), h: sh(0.895) };
  const cardDefs = [
    {
      key: "demand",
      title: "需求理解助手",
      body: "信息结构化 | 自动梳理业务\n目标与角色流程，提前暴\n露待确认的业务缺口。",
      x: 0.224,
      y: 0.352,
      w: 0.190,
      h: 0.236,
      color: border,
      icon: "search"
    },
    {
      key: "prd",
      title: "PRD 自动生成",
      body: "表达标准化 | 抛弃复制粘贴，\n按规范自动合成功能说明、\n字段规则与逻辑边界。",
      x: 0.405,
      y: -0.010,
      w: 0.196,
      h: 0.241,
      color: border,
      icon: "doc"
    },
    {
      key: "review",
      title: "PRD 智能评审",
      body: "风险前置化 |\n◆ 逻辑校验与拦截：\n清查前后矛盾，补齐异常\n流失路径，统一测试口径。",
      bodySizePt: 10.4,
      x: 0.593,
      y: 0.352,
      w: 0.191,
      h: 0.272,
      color: "#C99149",
      icon: "shield"
    },
    {
      key: "prototype",
      title: "原型转换闭环",
      body: "表达可视化 | 克隆线上 UI，\n将冰冷文档转化为可点击\n前端原型，路由自动接入。",
      x: 0.408,
      y: 0.757,
      w: 0.189,
      h: 0.237,
      color: border,
      icon: "prototype"
    }
  ];
  const shapes = [
    shape("blue-ring", "ai-skills-cycle-native-ring", "ellipse", ring, {
      fill: "none",
      stroke: blue,
      strokeWidthPt: 24,
      opacity: 0.96,
      shadow: { color: blue, alpha: 0.11, blurPt: 8, distancePt: 1, angle: 45 }
    }),
    ...[
      [0.36, 0.28, 0.45, 0.16],
      [0.61, 0.16, 0.70, 0.29],
      [0.71, 0.55, 0.62, 0.72],
      [0.40, 0.73, 0.31, 0.57],
      [0.30, 0.45, 0.39, 0.29]
    ].map(([x1, y1, x2, y2], index) => line(`loop-arrow-${index}`, {
      x: sx(x1),
      y: sy(y1)
    }, {
      x: sx(x2),
      y: sy(y2)
    }, green, 9, { endArrow: "triangle", routeIndex: index })),
    line("input-to-cycle", { x: sx(0.190), y: sy(0.485) }, { x: sx(0.310), y: sy(0.485) }, green, 12, { endArrow: "triangle" }),
    line("cycle-to-output", { x: sx(0.770), y: sy(0.490) }, { x: sx(0.860), y: sy(0.490) }, green, 12, { endArrow: "triangle" })
  ];
  const images = createAiSkillsCycleSideIllustrationCrops(image, options);
  const textBoxes = [
    textBox("input-label", "混沌多源输入\n(飞书长文、会议录音、\n口述反馈、零散截图)", { x: sx(0.015), y: sy(0.820), w: sw(0.210), h: sh(0.175) }, { sizePt: 13.5, weight: "bold", align: "center" }),
    textBox("output-label", "结构化产品资产入库\n(随时可检索、可复用的\n企业知识网络)", { x: sx(0.800), y: sy(0.770), w: sw(0.200), h: sh(0.185) }, { sizePt: 13.5, weight: "bold", align: "center" })
  ];
  for (const card of cardDefs) {
    const cardBox = { x: sx(card.x), y: sy(card.y), w: sw(card.w), h: sh(card.h) };
    shapes.push(shape(`card-${card.key}`, "ai-skills-cycle-native-card", "roundRect", cardBox, {
      fill: "#FFFFFF",
      stroke: card.color,
      strokeWidthPt: 1.1,
      radiusRatio: 0.065,
      shadow: { color: "#000000", alpha: 0.11, blurPt: 6, distancePt: 1.4, angle: 45 }
    }, { cardRole: card.key }));
    shapes.push(...aiSkillsCardIconShapes(base, image, cardBox, card, src, shape, line));
    textBoxes.push(
      textBox(`card-${card.key}-title`, card.title, {
        x: cardBox.x + cardBox.w * 0.065,
        y: cardBox.y + cardBox.h * 0.100,
        w: cardBox.w * 0.680,
        h: cardBox.h * 0.205
      }, { sizePt: 14.8, weight: "bold" }),
      textBox(`card-${card.key}-body`, card.body, {
        x: cardBox.x + cardBox.w * 0.065,
        y: cardBox.y + cardBox.h * 0.350,
        w: cardBox.w * 0.835,
        h: cardBox.h * 0.560
      }, { sizePt: card.bodySizePt || 11.6 })
    );
  }
  return { shapes, textBoxes, images };
}

function createAiSkillsCycleSideIllustrationCrops(image, options = {}) {
  if (!options.sourceImage || !options.assetDir) return [];
  ensureDir(options.assetDir);
  const regions = [
    { key: "input-illustration", x: 0.005, y: 0.205, w: 0.215, h: 0.460 },
    { key: "output-illustration", x: 0.790, y: 0.185, w: 0.210, h: 0.475 }
  ];
  const box = image.box || {};
  return regions.map((region) => {
    const cropBox = { x: box.x + box.w * region.x, y: box.y + box.h * region.y, w: box.w * region.w, h: box.h * region.h };
    const pxBox = ptToPxBox(cropBox, options.sourceImage, DEFAULT_SLIDE, 0);
    const file = path.join(options.assetDir, `${safeIdentifier(`${options.deckName || "deck"}-p${String(Number(options.pageIndex || 0) + 1).padStart(2, "0")}-${region.key}`)}.png`);
    writePng(file, cropPng(options.sourceImage, pxBox));
    return { id: `${image.id}-${region.key}-crop`, type: "fidelity-crop", assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"), box: pxToPtBox(pxBox, options.sourceImage, DEFAULT_SLIDE, 0), source: { editable: false, nativeRebuild: true, detector: "ai-skills-cycle-side-illustration-crop", expressionForm: "icon-or-illustration", recommendedAction: "preserve-local-crop", protectedMinimumUnit: true, intentionalMinimumUnitCrop: true, nonEditableReason: "complex input or output illustration retained as a local fidelity crop" } };
  });
}

function aiSkillsCardIconShapes(base, image, cardBox, card, src, shape, _line) {
  const blue = "#2C74D8";
  const orange = "#F39A3D";
  const x = cardBox.x + cardBox.w * 0.765;
  const y = cardBox.y + cardBox.h * 0.105;
  const w = cardBox.w * 0.140;
  const h = cardBox.h * 0.205;
  const iconLine = (suffix, from, to, color = blue, width = 1.6, extra = {}) => shape(suffix, "ai-skills-cycle-native-card-icon", "line", lineBox(from, to), {
    stroke: color,
    strokeWidthPt: width,
    connectorType: "straight",
    endArrow: extra.endArrow || undefined,
    lineCap: "round"
  }, { cardRole: card.key, ...extra });
  if (card.icon === "shield") {
    return [
      shape(`card-${card.key}-shield`, "ai-skills-cycle-native-card-icon", "pentagon", { x, y, w, h }, { fill: orange, stroke: orange, strokeWidthPt: 0.8 }, { cardRole: card.key }),
      iconLine(`card-${card.key}-check-a`, { x: x + w * 0.30, y: y + h * 0.48 }, { x: x + w * 0.45, y: y + h * 0.63 }, "#FFFFFF", 1.6),
      iconLine(`card-${card.key}-check-b`, { x: x + w * 0.45, y: y + h * 0.63 }, { x: x + w * 0.72, y: y + h * 0.34 }, "#FFFFFF", 1.6)
    ];
  }
  if (card.icon === "search") {
    return [
      shape(`card-${card.key}-search-circle`, "ai-skills-cycle-native-card-icon", "ellipse", { x, y: y + h * 0.08, w: w * 0.58, h: w * 0.58 }, { fill: "none", stroke: blue, strokeWidthPt: 1.8 }, { cardRole: card.key }),
      iconLine(`card-${card.key}-search-handle`, { x: x + w * 0.52, y: y + h * 0.55 }, { x: x + w * 0.88, y: y + h * 0.90 }, blue, 2.0),
      shape(`card-${card.key}-search-grid`, "ai-skills-cycle-native-card-icon", "rect", { x: x - w * 0.26, y: y + h * 0.28, w: w * 0.34, h: h * 0.30 }, { fill: "#CFE3F7", stroke: blue, strokeWidthPt: 0.7 }, { cardRole: card.key })
    ];
  }
  if (card.icon === "prototype") {
    return [
      shape(`card-${card.key}-wire-a`, "ai-skills-cycle-native-card-icon", "rect", { x, y: y + h * 0.10, w: w * 0.40, h: h * 0.60 }, { fill: "#FFFFFF", stroke: "#9DB8D1", strokeWidthPt: 0.8 }, { cardRole: card.key }),
      shape(`card-${card.key}-wire-b`, "ai-skills-cycle-native-card-icon", "rect", { x: x + w * 0.48, y: y + h * 0.06, w: w * 0.40, h: h * 0.68 }, { fill: "#CFE3F7", stroke: blue, strokeWidthPt: 0.8 }, { cardRole: card.key }),
      iconLine(`card-${card.key}-cursor`, { x: x + w * 0.70, y: y + h * 0.52 }, { x: x + w * 0.95, y: y + h * 0.86 }, blue, 1.8, { endArrow: "triangle" })
    ];
  }
  return [
    shape(`card-${card.key}-gear`, "ai-skills-cycle-native-card-icon", "ellipse", { x, y, w: w * 0.52, h: w * 0.52 }, { fill: blue, stroke: blue, strokeWidthPt: 0.8 }, { cardRole: card.key }),
    shape(`card-${card.key}-doc`, "ai-skills-cycle-native-card-icon", "rect", { x: x + w * 0.42, y: y + h * 0.06, w: w * 0.42, h: h * 0.72 }, { fill: "#CFE3F7", stroke: blue, strokeWidthPt: 0.8 }, { cardRole: card.key }),
    iconLine(`card-${card.key}-doc-line`, { x: x + w * 0.50, y: y + h * 0.35 }, { x: x + w * 0.78, y: y + h * 0.35 }, blue, 1.0)
  ];
}

function assetHubCycleIllustrationObjectsForImage(image, options = {}) {
  const box = image.box || {};
  const base = image.id || "asset-hub-cycle";
  const blue = "#1F6BB7";
  const shield = {
    x: Number(box.x || 0) + Number(box.w || 0) * 0.392,
    y: Number(box.y || 0) + Number(box.h || 0) * 0.171,
    w: Number(box.w || 0) * 0.25,
    h: Number(box.h || 0) * 0.799
  };
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "illustration-zone",
    sourceDetector: image.source?.detector || null,
    confidence: 0.7,
    ...extra
  });
  const connectorSegments = assetHubCycleConnectorSegments(box);
  const connectorShapes = connectorSegments.map((segment, index) => ({
    id: `${base}-native-connector-${index}`,
    type: "line",
    box: {
      x: round(segment.x),
      y: round(segment.y),
      w: round(segment.w),
      h: round(segment.h)
    },
    style: {
      stroke: segment.color,
      strokeWidthPt: 3.2,
      connectorType: "straight"
    },
    source: source("asset-hub-cycle-native-connector", {
      connectorIndex: index,
      side: segment.side,
      ...assetHubCycleNativeComponentMetadata(base, segment.side, "connector")
    })
  }));
  const textBoxes = [
    {
      id: `${base}-native-center-title`,
      text: "PM Portal\nPlatform",
      box: {
        x: round(shield.x + shield.w * 0.08),
        y: round(shield.y + shield.h * 0.20),
        w: round(shield.w * 0.76),
        h: round(shield.h * 0.24)
      },
      font: {
        family: "Microsoft YaHei",
        sizePt: 20.5,
        color: "#000000",
        opacity: 1,
        weight: "bold",
        align: "center",
        valign: "middle"
      },
      source: source("asset-hub-cycle-native-center-title", assetHubCycleNativeComponentMetadata(base, "center", "text"))
    },
    {
      id: `${base}-native-center-subtitle`,
      text: "AI Skills 驱动引擎\n+ 分布式域仓",
      box: {
        x: round(shield.x + shield.w * 0.08),
        y: round(shield.y + shield.h * 0.47),
        w: round(shield.w * 0.76),
        h: round(shield.h * 0.17)
      },
      font: {
        family: "Microsoft YaHei",
        sizePt: 14.5,
        color: "#111111",
        opacity: 1,
        weight: "bold",
        align: "center",
        valign: "middle"
      },
      source: source("asset-hub-cycle-native-center-subtitle", assetHubCycleNativeComponentMetadata(base, "center", "text"))
    }
  ];
  return {
    shapes: [
      ...connectorShapes,
      ...(options.objectifyInputIcons === true ? assetHubCycleInputIconShapes(image, box, source) : []),
      ...(options.objectifyOutputIcons === true ? assetHubCycleOutputGemShapes(image, box, source) : []),
      ...(options.objectifyCenterShell === true ? [{
        id: `${base}-native-shield`,
        type: "freeform",
        box: { x: round(shield.x), y: round(shield.y), w: round(shield.w), h: round(shield.h) },
        points: [
          { x: 0.5, y: 0 },
          { x: 1, y: 0.15 },
          { x: 1, y: 0.62 },
          { x: 0.5, y: 1 },
          { x: 0, y: 0.62 },
          { x: 0, y: 0.15 }
        ],
        style: { fill: "#FFFFFF", stroke: blue, strokeWidthPt: 11 },
        source: source("asset-hub-cycle-native-shield", assetHubCycleNativeComponentMetadata(base, "center", "visual"))
      }] : [])
    ],
    textBoxes,
    inputIconsObjectified: options.objectifyInputIcons === true,
    outputGemsObjectified: options.objectifyOutputIcons === true,
    centerShellObjectified: options.objectifyCenterShell === true
  };
}

function normalizeAssetHubEndpointLabels(textBoxes = [], illustrationBox = {}, componentBase = "asset-hub-cycle") {
  const w = Number(illustrationBox.w || 0);
  const endpointRoles = [
    { role: "left-top", side: "left", pattern: /散落的飞书文档/ },
    { role: "left-mid", side: "left", pattern: /割裂的交互原型/ },
    { role: "left-bottom", side: "left", pattern: /孤立的评审记录/ },
    { role: "right-top", side: "right", pattern: /可检索的组织级知识/ },
    { role: "right-mid", side: "right", pattern: /标准化交付物/ },
    { role: "right-bottom", side: "right", pattern: /研发一致性契约/ }
  ];
  for (const textBox of textBoxes) {
    const text = String(textBox?.text || "").replace(/\s+/g, "");
    const endpoint = endpointRoles.find((candidate) => candidate.pattern.test(text));
    if (!endpoint || !textBox?.box) continue;
    const evidenceBox = textBox.source?.evidenceBox || textBox.box;
    const normalizedWidth = round(endpoint.side === "left" ? w * 0.18 : w * 0.19);
    const evidenceCenterX = Number(evidenceBox.x || 0) + Number(evidenceBox.w || 0) / 2;
    const evidenceCenterY = Number(evidenceBox.y || 0) + Number(evidenceBox.h || 0) / 2;
    textBox.box = {
      x: round(evidenceCenterX - normalizedWidth / 2),
      y: round(evidenceCenterY - 11),
      w: normalizedWidth,
      h: 22
    };
    textBox.font = {
      ...(textBox.font || {}),
      family: "Microsoft YaHei",
      sizePt: 15.5,
      color: "#1F1F1F",
      opacity: 1,
      weight: "bold",
      align: "center",
      valign: "middle"
    };
    textBox.source = {
      ...(textBox.source || {}),
      ...assetHubCycleNativeComponentMetadata(componentBase, endpoint.role, "label")
    };
  }
}

function assetHubCycleInputIconShapes(image, box = {}, source) {
  const base = image.id || "asset-hub-cycle";
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const iconBoxes = [
    { role: "top-input-icon", box: { x: x + w * 0.01, y, w: w * 0.16, h: h * 0.29 }, layout: "scatter" },
    { role: "mid-input-icon", box: { x: x + w * 0.01, y: y + h * 0.32, w: w * 0.16, h: h * 0.27 }, layout: "magic" },
    { role: "bottom-input-icon", box: { x: x + w * 0.01, y: y + h * 0.65, w: w * 0.16, h: h * 0.28 }, layout: "stack" }
  ];
  return iconBoxes.flatMap((icon, index) => {
    const b = icon.box;
    const orange = "#F39A2E";
    const deepOrange = "#D9781E";
    const grey = "#A8A8A8";
    const shapes = [];
    const addDoc = (name, dx, dy, dw, dh, rotation = 0, fill = orange, stroke = deepOrange) => {
      shapes.push({
        id: `${base}-native-input-${index}-${name}`,
        type: "roundRect",
        box: {
          x: round(b.x + b.w * dx),
          y: round(b.y + b.h * dy),
          w: round(b.w * dw),
          h: round(b.h * dh)
        },
        rotation,
        style: {
          fill,
          stroke,
          strokeWidthPt: 1,
          radiusPt: 3,
          shadow: { color: "#000000", alpha: 0.08, blurPt: 2.5, distancePt: 1, angle: 45 }
        },
        source: source("asset-hub-cycle-native-input-icon", { iconIndex: index, iconRole: icon.role, part: name })
      });
    };
    const addChip = (name, dx, dy, dw, dh, rotation = 0, fill = orange) => {
      shapes.push({
        id: `${base}-native-input-${index}-${name}`,
        type: "rect",
        box: {
          x: round(b.x + b.w * dx),
          y: round(b.y + b.h * dy),
          w: round(b.w * dw),
          h: round(b.h * dh)
        },
        rotation,
        style: { fill, stroke: "none", strokeWidthPt: 0, opacity: 0.96 },
        source: source("asset-hub-cycle-native-input-icon-fragment", { iconIndex: index, iconRole: icon.role, part: name })
      });
    };
    const addLine = (name, from, to, color = deepOrange, width = 1.2) => {
      shapes.push({
        id: `${base}-native-input-${index}-${name}`,
        type: "line",
        box: lineBox(
          { x: b.x + b.w * from.x, y: b.y + b.h * from.y },
          { x: b.x + b.w * to.x, y: b.y + b.h * to.y }
        ),
        style: { stroke: color, strokeWidthPt: width, connectorType: "straight" },
        source: source("asset-hub-cycle-native-input-icon-line", { iconIndex: index, iconRole: icon.role, part: name })
      });
    };
    const addDot = (name, dx, dy, size, fill = orange) => {
      shapes.push({
        id: `${base}-native-input-${index}-${name}`,
        type: "ellipse",
        box: {
          x: round(b.x + b.w * dx),
          y: round(b.y + b.h * dy),
          w: round(b.w * size),
          h: round(b.w * size)
        },
        style: { fill, stroke: "none", strokeWidthPt: 0, opacity: 0.9 },
        source: source("asset-hub-cycle-native-input-icon-fragment", { iconIndex: index, iconRole: icon.role, part: name })
      });
    };

    if (icon.layout === "scatter") {
      addDoc("doc-a", 0.12, 0.14, 0.30, 0.30, -12, orange);
      addDoc("doc-b", 0.40, 0.09, 0.28, 0.28, 10, "#F7B15A");
      addDoc("doc-c", 0.26, 0.42, 0.34, 0.28, 4, orange);
      addDoc("doc-d", 0.58, 0.38, 0.22, 0.22, -8, grey, "#8F8F8F");
      addChip("chip-a", 0.06, 0.45, 0.13, 0.10, -16, "#F7B15A");
      addChip("chip-b", 0.66, 0.16, 0.12, 0.10, 14, orange);
      addChip("chip-c", 0.73, 0.56, 0.10, 0.08, 8, grey);
      addLine("link-a", { x: 0.29, y: 0.30 }, { x: 0.54, y: 0.25 }, "#B56A24", 1.3);
      addLine("link-b", { x: 0.45, y: 0.45 }, { x: 0.68, y: 0.50 }, "#B56A24", 1.2);
      addDot("spark-a", 0.77, 0.36, 0.045, "#F7B15A");
      addDot("spark-b", 0.17, 0.67, 0.04, "#F7B15A");
    } else if (icon.layout === "magic") {
      addDoc("doc-main", 0.18, 0.18, 0.40, 0.36, -6, orange);
      addDoc("doc-side", 0.48, 0.43, 0.28, 0.26, 8, "#F7B15A");
      addDoc("doc-grey", 0.62, 0.16, 0.18, 0.18, -12, grey, "#8F8F8F");
      addChip("chip-a", 0.08, 0.54, 0.11, 0.09, 12, grey);
      addChip("chip-b", 0.69, 0.55, 0.12, 0.10, -10, orange);
      addLine("wand", { x: 0.16, y: 0.76 }, { x: 0.76, y: 0.20 }, deepOrange, 2.3);
      addLine("wand-shine-a", { x: 0.65, y: 0.12 }, { x: 0.72, y: 0.03 }, "#F7B15A", 1.2);
      addLine("wand-shine-b", { x: 0.77, y: 0.18 }, { x: 0.87, y: 0.13 }, "#F7B15A", 1.2);
      addDot("spark-a", 0.16, 0.30, 0.045, "#F7B15A");
      addDot("spark-b", 0.79, 0.68, 0.04, "#F7B15A");
    } else {
      addDoc("stack-back", 0.17, 0.15, 0.40, 0.30, -8, "#F7B15A");
      addDoc("stack-front", 0.33, 0.31, 0.43, 0.32, 4, orange);
      addDoc("stack-grey", 0.57, 0.18, 0.22, 0.22, 12, grey, "#8F8F8F");
      addChip("chip-a", 0.08, 0.31, 0.10, 0.09, -10, grey);
      addChip("chip-b", 0.71, 0.52, 0.13, 0.10, 8, "#F7B15A");
      addLine("rail-a", { x: 0.16, y: 0.72 }, { x: 0.83, y: 0.72 }, "#B56A24", 1.5);
      addLine("rail-b", { x: 0.30, y: 0.80 }, { x: 0.70, y: 0.80 }, "#B56A24", 1.1);
      addDot("node-a", 0.12, 0.68, 0.055, orange);
      addDot("node-b", 0.80, 0.68, 0.055, orange);
    }
    return shapes;
  });
}

function assetHubCycleOutputGemShapes(image, box = {}, source) {
  const base = image.id || "asset-hub-cycle";
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const gemBoxes = [
    { role: "top-output-gem", box: { x: x + w * 0.875, y, w: w * 0.12, h: h * 0.28 } },
    { role: "mid-output-gem", box: { x: x + w * 0.875, y: y + h * 0.32, w: w * 0.12, h: h * 0.27 } },
    { role: "bottom-output-gem", box: { x: x + w * 0.875, y: y + h * 0.65, w: w * 0.12, h: h * 0.28 } }
  ];
  return gemBoxes.flatMap((gem, index) => {
    const b = gem.box;
    const cx = b.x + b.w * 0.50;
    const body = {
      x: b.x + b.w * 0.18,
      y: b.y + b.h * 0.12,
      w: b.w * 0.64,
      h: b.h * 0.56
    };
    const shine = {
      x: body.x + body.w * 0.22,
      y: body.y + body.h * 0.12,
      w: body.w * 0.22,
      h: body.h * 0.18
    };
    return [
      {
        id: `${base}-native-output-gem-${index}-body`,
        type: "freeform",
        box: body,
        points: [
          { x: 0.28, y: 0 },
          { x: 0.72, y: 0 },
          { x: 1, y: 0.38 },
          { x: 0.50, y: 1 },
          { x: 0, y: 0.38 }
        ],
        style: {
          fill: "#19A76A",
          stroke: "#0F8A59",
          strokeWidthPt: 1.2,
          shadow: { color: "#000000", alpha: 0.10, blurPt: 3, distancePt: 1, angle: 45 }
        },
        source: source("asset-hub-cycle-native-output-gem", { gemIndex: index, gemRole: gem.role })
      },
      {
        id: `${base}-native-output-gem-${index}-facet-left`,
        type: "line",
        box: lineBox({ x: body.x + body.w * 0.28, y: body.y }, { x: cx, y: body.y + body.h }),
        style: { stroke: "#52C98E", strokeWidthPt: 0.9, connectorType: "straight" },
        source: source("asset-hub-cycle-native-output-gem-facet", { gemIndex: index, gemRole: gem.role })
      },
      {
        id: `${base}-native-output-gem-${index}-facet-right`,
        type: "line",
        box: lineBox({ x: body.x + body.w * 0.72, y: body.y }, { x: cx, y: body.y + body.h }),
        style: { stroke: "#0B7F51", strokeWidthPt: 0.9, connectorType: "straight" },
        source: source("asset-hub-cycle-native-output-gem-facet", { gemIndex: index, gemRole: gem.role })
      },
      {
        id: `${base}-native-output-gem-${index}-shine`,
        type: "rect",
        box: shine,
        style: { fill: "#79D8A7", stroke: "none", strokeWidthPt: 0, opacity: 0.85 },
        source: source("asset-hub-cycle-native-output-gem-highlight", { gemIndex: index, gemRole: gem.role })
      }
    ];
  });
}

function assetHubCycleConnectorSegments(box = {}) {
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const blue = "#2F70C8";
  const green = "#159A68";
  const leftJoin = x + w * 0.39;
  const rightJoin = x + w * 0.64;
  const segments = [];
  const add = (side, color, x1, y1, x2, y2) => segments.push({ side, color, x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
  add("left-top", blue, x + w * 0.18, y + h * 0.15, x + w * 0.31, y + h * 0.15);
  add("left-top", blue, x + w * 0.31, y + h * 0.15, x + w * 0.31, y + h * 0.44);
  add("left-top", blue, x + w * 0.31, y + h * 0.44, leftJoin, y + h * 0.44);
  add("left-mid", blue, x + w * 0.18, y + h * 0.54, leftJoin, y + h * 0.54);
  add("left-bottom", blue, x + w * 0.18, y + h * 0.92, x + w * 0.31, y + h * 0.92);
  add("left-bottom", blue, x + w * 0.31, y + h * 0.92, x + w * 0.31, y + h * 0.63);
  add("left-bottom", blue, x + w * 0.31, y + h * 0.63, leftJoin, y + h * 0.63);
  add("right-top", green, rightJoin, y + h * 0.44, x + w * 0.77, y + h * 0.44);
  add("right-top", green, x + w * 0.77, y + h * 0.44, x + w * 0.77, y + h * 0.15);
  add("right-top", green, x + w * 0.77, y + h * 0.15, x + w * 0.91, y + h * 0.15);
  add("right-mid", green, rightJoin, y + h * 0.54, x + w * 0.91, y + h * 0.54);
  add("right-bottom", green, rightJoin, y + h * 0.63, x + w * 0.77, y + h * 0.63);
  add("right-bottom", green, x + w * 0.77, y + h * 0.63, x + w * 0.77, y + h * 0.92);
  add("right-bottom", green, x + w * 0.77, y + h * 0.92, x + w * 0.91, y + h * 0.92);
  return segments;
}

function assetHubCycleResidualRegions(box = {}) {
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const leftX = x + w * 0.01;
  const rightX = x + w * 0.875;
  return [
    { name: "left-top-input-icon", box: { x: leftX, y: y + h * 0.02, w: w * 0.16, h: h * 0.25 } },
    { name: "left-mid-input-icon", box: { x: leftX, y: y + h * 0.40, w: w * 0.16, h: h * 0.22 } },
    { name: "left-bottom-input-icon", box: { x: leftX, y: y + h * 0.73, w: w * 0.16, h: h * 0.25 } },
    { name: "right-top-output-icon", box: { x: rightX, y: y + h * 0.02, w: w * 0.12, h: h * 0.25 } },
    { name: "right-mid-output-icon", box: { x: rightX, y: y + h * 0.40, w: w * 0.12, h: h * 0.22 } },
    { name: "right-bottom-output-icon", box: { x: rightX, y: y + h * 0.73, w: w * 0.12, h: h * 0.25 } },
    { name: "center-custom-shield-shell", box: { x: x + w * 0.392, y: y + h * 0.15, w: w * 0.247, h: h * 0.84 } }
  ];
}

module.exports = {createAssetHubCycleIllustrationObjects, aiSkillsClosedLoopCycleObjectsForImage, aiSkillsCardIconShapes, createAiSkillsCycleSideIllustrationCrops, assetHubCycleIllustrationObjectsForImage, assetHubCycleConnectorSegments, assetHubCycleInputIconShapes, assetHubCycleOutputGemShapes, assetHubCycleResidualRegions, genericCycleHubSpokeSemanticTextBoxes, genericCycleHubSpokeTextBox, isSafeGenericCycleHubSpokeNodeText, normalizeGenericCycleHubSpokeNodeText, genericCycleHubSpokeSkeletonShapesForImage, gridLikeCycleHubSpokeSemanticTextBoxes, gridLikeCycleHubSpokeSemanticNodes, gridLikeCycleHubSpokeShapesForImage, gridLikeCycleHubSpokeGrid, normalizeAssetHubEndpointLabels, shouldObjectifyAiSkillsClosedLoopCycle, shouldObjectifyAssetHubCycleIllustration, shouldObjectifyGenericCycleHubSpokeSkeleton, shouldObjectifyGridLikeCycleHubSpoke};
