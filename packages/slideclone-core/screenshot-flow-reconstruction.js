"use strict";
const path = require("node:path");
const {cropPng, writePng} = require("./png");
const {constrainPtBox, expandPtBox, ptToPxBox} = require("./raster-native-detection");
const {lineBox, safeIdentifier} = require("./workflow-shape-primitives");
const {roundedBox} = require("./prd-generation-shapes");
const {splitResidualLayerSource} = require("./structured-residual-splitting");
const {ensureDir, shouldSplitProcessWithScreenshotsLayer} = require("./residual-primitive-erasure");
const DEFAULT_SLIDE = {widthPt: 960, heightPt: 540};

function createProcessWithScreenshotsFlowObjects(images = [], sourceImage = null, slideSize = DEFAULT_SLIDE, options = {}) {
  const shapes = [];
  const textBoxes = [];
  const fidelityImages = [];
  for (const image of images || []) {
    if (image?.source?.standardizedFourLayerArchitectureObjectified === true) continue;
    if (!shouldObjectifyProcessWithScreenshotsFlow(image)) continue;
    const layout = inferProcessWithScreenshotsFlowLayout(image, slideSize);
    if (!layout) continue;
    const stageCrops = layout.productWorkflowIconProcess === true
      ? createProductWorkflowStageMinimumUnitCrops({
        image,
        layout,
        sourceImage,
        slideSize,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex: options.pageIndex
      })
      : [];
    const stageCropsPreserved = stageCrops.length === 4;
    const fullyObjectified = isProcessWithScreenshotsFlowFullyObjectified(layout);
    image.source = {
      ...(image.source || {}),
      processWithScreenshotsFlowObjectified: true,
      processWithScreenshotsLeftIllustrationObjectified: layout.leftIllustrationShapes.length > 0,
      processWithScreenshotsChaosCoreObjectified: layout.leftIllustrationShapes.length >= 35,
      processWithScreenshotsFullyObjectified: fullyObjectified,
      productWorkflowIconProcessObjectified: layout.productWorkflowIconProcess === true,
      productWorkflowStageCropsPreserved: stageCropsPreserved,
      productWorkflowStageCropCount: stageCrops.length,
      productWorkflowEndpointObjectified: layout.productWorkflowEndpointShapes?.length > 0,
      objectifiedProcessFlowCards: layout.cards.length,
      objectifiedProcessFlowConnectors: layout.connectors.length,
      objectifiedProcessLeftIllustrationShapes: layout.leftIllustrationShapes.length,
      objectifiedProductWorkflowEndpointShapes: layout.productWorkflowEndpointShapes?.length || 0,
      processWithScreenshotsNativeTextBoxes: layout.textBoxes,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "process diagram underlay"}; rebuilt process flow and left-side work-chaos illustration as native editable objects while preserving screenshot-like notes`
    };
    shapes.push(...layout.leftIllustrationShapes);
    shapes.push(...(layout.productWorkflowEndpointShapes || []));
    shapes.push(...layout.connectors.map((connector, index) => ({
      id: `${image.id || "process-screenshots"}-native-connector-${index}`,
      type: "line",
      box: connector.box,
      style: {
        stroke: "#24A867",
        strokeWidthPt: connector.strokeWidthPt,
        connectorType: "straight",
        ...(connector.endArrow ? {endArrow: connector.endArrow} : {}),
        lineCap: "round"
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "process-screenshots-native-connector",
        layerSourceId: image.id || null,
        connectorIndex: index,
        confidence: layout.confidence
      }
    })));
    const nativeCards = stageCropsPreserved
      ? layout.cards.filter((card) => card.role === "bottom-banner")
      : layout.cards;
    shapes.push(...nativeCards.map((card, index) => ({
      id: `${image.id || "process-screenshots"}-native-card-${index}`,
      type: card.type || "roundRect",
      box: card.box,
      style: {
        fill: card.fill,
        stroke: card.stroke,
        strokeWidthPt: card.strokeWidthPt,
        ...(card.type === "rect" || card.type === "hexagon" ? {} : {radiusRatio: 0.11}),
        ...(card.noShadow ? {} : {shadow: {
          color: "#000000",
          alpha: card.primary ? 0.13 : 0.08,
          blurPt: card.primary ? 9 : 5,
          distancePt: card.primary ? 2 : 1,
          angle: 45
        }})
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "process-screenshots-native-card",
        layerSourceId: image.id || null,
        cardRole: card.role,
        cardIndex: index,
        confidence: layout.confidence
      }
    })));
    if (!stageCropsPreserved) {
      shapes.push(...layout.icons.flatMap((icon, index) =>
        processWithScreenshotsIconShapes(image, icon, index, layout.confidence)
      ));
    }
    fidelityImages.push(...stageCrops);
    textBoxes.push(...layout.textBoxes);
  }
  return { shapes, textBoxes, images: fidelityImages };
}

function createProductWorkflowStageMinimumUnitCrops({ image = {}, layout = {}, sourceImage = null, slideSize = DEFAULT_SLIDE, assetDir = null, irDir = null, deckName = "deck", pageIndex = 0 } = {}) {
  if (!sourceImage || !assetDir || !irDir || layout.productWorkflowIconProcess !== true) return [];
  const stages = (layout.cards || []).filter((card) => card.role !== "bottom-banner");
  if (stages.length !== 4 || stages.some((stage) => !stage.box?.w || !stage.box?.h)) return [];
  ensureDir(assetDir);
  return stages.map((stage, index) => {
    const cropBox = roundedBox(expandPtBox(stage.box, slideSize, 2.5, 2.5));
    const file = path.join(assetDir, `${safeIdentifier(deckName, "deck")}-page-${String(Number(pageIndex || 0) + 1).padStart(3, "0")}-workflow-stage-${String(index + 1).padStart(2, "0")}.png`);
    writePng(file, cropPng(sourceImage, ptToPxBox(cropBox, sourceImage, slideSize, 0)));
    const stageLayer = splitResidualLayerSource(image.source?.layer, cropBox, "product-workflow-stage-minimum-unit-crop");
    return {
      id: `${image.id || "product-workflow"}-stage-${index + 1}-crop`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir, file).replace(/\\/g, "/"),
      box: cropBox,
      source: {
        ...(image.source || {}),
        editable: false,
        detector: "product-workflow-stage-minimum-unit-crop",
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        layer: stageLayer ? {
          ...stageLayer,
          layerType: "illustration-zone",
          expressionForm: "icon-or-illustration",
          expressionSubtype: "decorated-process-node",
          recommendedAction: "preserve-stage-node-as-minimum-unit-crop"
        } : stageLayer,
        expressionForm: "icon-or-illustration",
        expressionSubtype: "decorated-process-node",
        recommendedAction: "preserve-stage-node-as-minimum-unit-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        productWorkflowStageRole: stage.role,
        productWorkflowStageIndex: index,
        nonEditableReason: "rounded hexagon and embedded pictorial icon form one visually indivisible process-node asset"
      }
    };
  });
}

function isProcessWithScreenshotsFlowFullyObjectified(layout = {}) {
  const cards = Array.isArray(layout.cards) ? layout.cards.length : 0;
  const connectors = Array.isArray(layout.connectors) ? layout.connectors.length : 0;
  const leftIllustrationShapes = Array.isArray(layout.leftIllustrationShapes) ? layout.leftIllustrationShapes.length : 0;
  const textBoxes = Array.isArray(layout.textBoxes) ? layout.textBoxes.length : 0;
  return cards >= 4 && connectors >= 5 && leftIllustrationShapes >= 35 && textBoxes >= 8;
}

function shouldObjectifyProcessWithScreenshotsFlow(image) {
  if (!shouldSplitProcessWithScreenshotsLayer(image)) return false;
  const box = image?.box || {};
  if (Number(box.w || 0) < 720 || Number(box.h || 0) < 260) return false;
  return true;
}

function inferProcessWithScreenshotsFlowLayout(image, slideSize = DEFAULT_SLIDE) {
  const box = image?.box || {};
  if (!box.w || !box.h) return null;
  if (isProductWorkflowIconProcess(image)) {
    return inferProductWorkflowIconProcessLayout(image, slideSize);
  }
  const bounds = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
  const center = constrainPtBox({
    x: box.x + box.w * 0.535,
    y: box.y + box.h * 0.292,
    w: box.w * 0.242,
    h: box.h * 0.250
  }, bounds);
  const cards = [
    { role: "decision-maker", primary: true, box: center, fill: "#18A460", stroke: "#128A51", strokeWidthPt: 1.3 },
    { role: "prompting", box: constrainPtBox({ x: box.x + box.w * 0.755, y: box.y + box.h * 0.082, w: box.w * 0.230, h: box.h * 0.188 }, bounds), fill: "#DDF3E8", stroke: "#2CB877", strokeWidthPt: 1.0 },
    { role: "document-generation", box: constrainPtBox({ x: box.x + box.w * 0.755, y: box.y + box.h * 0.352, w: box.w * 0.230, h: box.h * 0.188 }, bounds), fill: "#DDF3E8", stroke: "#2CB877", strokeWidthPt: 1.0 },
    { role: "rule-extraction", box: constrainPtBox({ x: box.x + box.w * 0.755, y: box.y + box.h * 0.622, w: box.w * 0.230, h: box.h * 0.188 }, bounds), fill: "#DDF3E8", stroke: "#2CB877", strokeWidthPt: 1.0 }
  ];
  const rightCards = cards.slice(1);
  const hubX = center.x + center.w * 0.88;
  const hubY = center.y + center.h * 0.50;
  const midCard = rightCards[1].box;
  const connectors = [
    {
      box: lineBox({ x: hubX, y: hubY }, { x: hubX, y: rightCards[0].box.y + rightCards[0].box.h * 0.5 }),
      strokeWidthPt: 5.2
    },
    {
      box: lineBox({ x: hubX, y: rightCards[0].box.y + rightCards[0].box.h * 0.5 }, { x: rightCards[0].box.x - 7, y: rightCards[0].box.y + rightCards[0].box.h * 0.5 }),
      strokeWidthPt: 5.2,
      endArrow: "triangle"
    },
    {
      box: lineBox({ x: center.x + center.w + 4, y: midCard.y + midCard.h * 0.5 }, { x: midCard.x - 7, y: midCard.y + midCard.h * 0.5 }),
      strokeWidthPt: 5.2,
      endArrow: "triangle"
    },
    {
      box: lineBox({ x: hubX, y: hubY }, { x: hubX, y: rightCards[2].box.y + rightCards[2].box.h * 0.5 }),
      strokeWidthPt: 5.2
    },
    {
      box: lineBox({ x: hubX, y: rightCards[2].box.y + rightCards[2].box.h * 0.5 }, { x: rightCards[2].box.x - 7, y: rightCards[2].box.y + rightCards[2].box.h * 0.5 }),
      strokeWidthPt: 5.2,
      endArrow: "triangle"
    }
  ];
  const textBoxes = [
    processFlowTextBox(image, "决策者/火车头", {
      x: center.x + center.w * 0.12,
      y: center.y + center.h * 0.35,
      w: center.w * 0.76,
      h: center.h * 0.30
    }, { color: "#FFFFFF", sizePt: 14.5, weight: 700 }),
    processFlowTextBox(image, "Prompting", cardLabelBox(rightCards[0].box), { color: "#2A7050", sizePt: 11.5, weight: 700 }),
    processFlowTextBox(image, "Document\nGeneration", cardLabelBox(rightCards[1].box), { color: "#2A7050", sizePt: 10.6, weight: 700 }),
    processFlowTextBox(image, "Rule Extraction", cardLabelBox(rightCards[2].box), { color: "#2A7050", sizePt: 11.2, weight: 700 })
  ];
  const left = constrainPtBox({
    x: box.x,
    y: box.y,
    w: box.w * 0.47,
    h: box.h * 0.82
  }, bounds);
  const leftIllustration = inferProcessWithScreenshotsLeftIllustrationLayout(image, left, bounds);
  textBoxes.push(...leftIllustration.textBoxes);
  textBoxes.push(
    processFlowTextBox(image, "传统模式：管理“确定性”，深陷排版与格式\n的重复劳动。", {
      x: box.x + box.w * 0.020,
      y: box.y + box.h * 0.842,
      w: box.w * 0.425,
      h: box.h * 0.130
    }, { color: "#111111", sizePt: 17.0, weight: 700, align: "left", idSuffix: "left-explanation" }),
    processFlowTextBox(image, "AI原生模式：管理“不确定性”，专注需求洞\n察、系统边界与商业落地。", {
      x: box.x + box.w * 0.570,
      y: box.y + box.h * 0.842,
      w: box.w * 0.400,
      h: box.h * 0.130
    }, { color: "#111111", sizePt: 17.0, weight: 700, align: "left", idSuffix: "right-explanation" })
  );
  const icons = rightCards.map((card, index) => ({
    role: cards[index + 1].role,
    box: {
      x: card.box.x + card.box.w * 0.08,
      y: card.box.y + card.box.h * 0.22,
      w: card.box.w * 0.20,
      h: card.box.h * 0.46
    }
  }));
  return { cards, connectors, icons, textBoxes, leftIllustrationShapes: leftIllustration.shapes, confidence: 0.78 };
}

function isProductWorkflowIconProcess(image = {}) {
  const source = image.source || {};
  const reason = `${source.reason || ""} ${source.nonEditableReason || ""}`.toLowerCase();
  return source.detector === "screenshot-process-underlay-crop"
    && /product-workflow-icon-process/.test(reason);
}

function inferProductWorkflowIconProcessLayout(image, slideSize = DEFAULT_SLIDE) {
  const box = image?.box || {};
  if (!box.w || !box.h) return null;
  const bounds = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
  const sx = (n) => box.x + box.w * n;
  const sy = (n) => box.y + box.h * n;
  const sw = (n) => box.w * n;
  const sh = (n) => box.h * n;
  const cards = [
    { role: "requirement-understanding", label: "需求理解", detail: "(把杂乱变结构化)", cx: 0.291, icon: "search" },
    { role: "prd-generation", label: "PRD 生成", detail: "(把重复变标准化)", cx: 0.433, icon: "document" },
    { role: "smart-review", label: "智能评审", detail: "(会后补救变前置拦截)", cx: 0.563, icon: "radar" },
    { role: "prototype-generation", label: "原型生成", detail: "(文字变可验证交互)", cx: 0.717, icon: "prototype" }
  ].map((stage) => ({
    ...stage,
    type: "hexagon",
    primary: true,
    box: constrainPtBox({
      x: sx(stage.cx) - sw(0.060),
      y: sy(0.100),
      w: sw(0.108),
      h: sh(0.320)
    }, bounds),
    fill: "#0867B8",
    stroke: "#045B9F",
    strokeWidthPt: 1.4,
    noShadow: true
  }));
  const nodeMidY = cards[0].box.y + cards[0].box.h * 0.50;
  const connectors = [
    { box: lineBox({ x: sx(0.18), y: nodeMidY }, { x: cards[0].box.x, y: nodeMidY }), strokeWidthPt: 8.0 },
    ...cards.slice(0, -1).map((card, index) => ({
      box: lineBox(
        { x: card.box.x + card.box.w, y: nodeMidY },
        { x: cards[index + 1].box.x, y: nodeMidY }
      ),
      strokeWidthPt: 8.0
    })),
    { box: lineBox({ x: cards[cards.length - 1].box.x + cards[cards.length - 1].box.w, y: nodeMidY }, { x: sx(0.86), y: nodeMidY }), strokeWidthPt: 8.0 }
  ];
  const branchConnectors = [];
  const icons = cards.map((card) => ({
    role: card.icon,
    box: {
      x: card.box.x + card.box.w * 0.23,
      y: card.box.y + card.box.h * 0.22,
      w: card.box.w * 0.54,
      h: card.box.h * 0.50
    }
  }));
  const textBoxes = [
    ...cards.flatMap((card) => [
      processFlowTextBox(image, card.label, {
        x: card.box.x - sw(0.028),
        y: sy(0.500),
        w: card.box.w + sw(0.056),
        h: sh(0.072)
      }, { color: "#111111", sizePt: 18.5, weight: 700, idSuffix: `${card.role}-label` }),
      processFlowTextBox(image, card.detail, {
        x: card.box.x - sw(0.047),
        y: sy(0.570),
        w: card.box.w + sw(0.094),
        h: sh(0.060)
      }, { color: "#111111", sizePt: 12.8, weight: 400, idSuffix: `${card.role}-detail` })
    ]),
    processFlowTextBox(image, "混沌的输入", { x: sx(0.035), y: sy(0.690), w: sw(0.135), h: sh(0.085) }, { color: "#111111", sizePt: 20.5, weight: 700, idSuffix: "left-input-label" }),
    processFlowTextBox(image, "标准资产输出", { x: sx(0.875), y: sy(0.690), w: sw(0.125), h: sh(0.085) }, { color: "#111111", sizePt: 19.5, weight: 700, idSuffix: "right-output-label" }),
    processFlowTextBox(image, "底层对接分布式域仓，将全链路产出化为可检索、可复用的产品知识网络", {
      x: 0,
      y: sy(0.835),
      w: DEFAULT_SLIDE.widthPt,
      h: sh(0.120)
    }, { color: "#FFFFFF", sizePt: 21.5, weight: 700, idSuffix: "bottom-banner-text" })
  ];
  const banner = {
    type: "rect",
    role: "bottom-banner",
    box: constrainPtBox({ x: 0, y: sy(0.822), w: DEFAULT_SLIDE.widthPt, h: sh(0.145) }, bounds),
    fill: "#0867B8",
    stroke: "#0867B8",
    strokeWidthPt: 0
  };
  return {
    cards: [banner, ...cards],
    connectors: [...branchConnectors, ...connectors],
    icons,
    textBoxes,
    leftIllustrationShapes: [],
    productWorkflowEndpointShapes: [],
    confidence: 0.82,
    productWorkflowIconProcess: true
  };
}

function inferProcessWithScreenshotsLeftIllustrationLayout(image, left, bounds) {
  if (!left?.w || !left?.h) return { shapes: [], textBoxes: [] };
  const confidence = 0.70;
  const orange = "#F08B36";
  const darkOrange = "#D7751E";
  const paleOrange = "#FBE3CF";
  const textColor = "#111111";
  const src = (part, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector: "process-screenshots-native-left-illustration",
    layerSourceId: image.id || null,
    part,
    confidence,
    ...extra
  });
  const shape = (part, type, box, style, extra = {}) => {
    const shapeStyle = { ...(style || {}) };
    const item = {
      id: `${image.id || "process-screenshots"}-native-left-${part}`,
      type,
      box: constrainPtBox(box, bounds),
      style: shapeStyle,
      source: src(part, extra)
    };
    if (Array.isArray(shapeStyle.points)) {
      item.points = shapeStyle.points.map(([x, y]) => ({ x, y }));
      delete shapeStyle.points;
    }
    return item;
  };
  const line = (part, from, to, stroke = orange, width = 2.0, extra = {}) => shape(part, "line", lineBox(from, to), {
    stroke,
    strokeWidthPt: width,
    connectorType: "straight",
    lineCap: "round"
  }, extra);
  const card = (part, x, y, w, h) => shape(part, "roundRect", {
    x: left.x + left.w * x,
    y: left.y + left.h * y,
    w: left.w * w,
    h: left.h * h
  }, {
    fill: "#FFF6EE",
    stroke: darkOrange,
    strokeWidthPt: 1.1,
    radiusRatio: 0.08
  });
  const cx = left.x + left.w * 0.51;
  const cy = left.y + left.h * 0.48;
  const shapes = [
    ...[
      [0.14, 0.20, 0.40, 0.40],
      [0.23, 0.73, 0.48, 0.58],
      [0.78, 0.22, 0.62, 0.42],
      [0.76, 0.74, 0.60, 0.61],
      [0.30, 0.17, 0.59, 0.29],
      [0.28, 0.79, 0.58, 0.67],
      [0.64, 0.20, 0.36, 0.58],
      [0.64, 0.77, 0.40, 0.62],
      [0.08, 0.55, 0.35, 0.29],
      [0.18, 0.33, 0.80, 0.68],
      [0.35, 0.78, 0.84, 0.54],
      [0.30, 0.50, 0.70, 0.22],
      [0.45, 0.17, 0.74, 0.47],
      [0.16, 0.68, 0.56, 0.82],
      [0.18, 0.82, 0.70, 0.70],
      [0.70, 0.78, 0.90, 0.42]
    ].map(([x1, y1, x2, y2], index) => line(`chaos-link-${index}`, {
      x: left.x + left.w * x1,
      y: left.y + left.h * y1
    }, {
      x: left.x + left.w * x2,
      y: left.y + left.h * y2
    }, index % 2 === 0 ? "#E58A24" : "#D97918", index % 3 === 0 ? 3.3 : 2.5, { semantic: "messy-connection" })),
    ...[
      [0.16, 0.26, 0.70, 0.39],
      [0.17, 0.31, 0.79, 0.58],
      [0.23, 0.20, 0.56, 0.78],
      [0.27, 0.83, 0.66, 0.23],
      [0.34, 0.18, 0.84, 0.66],
      [0.38, 0.79, 0.88, 0.30],
      [0.47, 0.22, 0.22, 0.72],
      [0.55, 0.70, 0.18, 0.38],
      [0.58, 0.18, 0.42, 0.84],
      [0.68, 0.72, 0.30, 0.28],
      [0.75, 0.32, 0.35, 0.62],
      [0.82, 0.56, 0.48, 0.20]
    ].map(([x1, y1, x2, y2], index) => line(`chaos-cross-link-${index}`, {
      x: left.x + left.w * x1,
      y: left.y + left.h * y1
    }, {
      x: left.x + left.w * x2,
      y: left.y + left.h * y2
    }, index % 2 === 0 ? "#EA8E27" : "#C96D18", index % 3 === 0 ? 2.2 : 1.7, { semantic: "dense-messy-connection" })),
    ...[
      [0.37, 0.23, 0.30, 0.24, -18],
      [0.43, 0.25, 0.31, 0.20, 24],
      [0.49, 0.30, 0.38, 0.22, -34],
      [0.40, 0.43, 0.45, 0.27, 18],
      [0.50, 0.53, 0.42, 0.25, -24],
      [0.38, 0.62, 0.39, 0.23, 30],
      [0.55, 0.67, 0.42, 0.22, -20],
      [0.24, 0.55, 0.40, 0.21, 12]
    ].map(([x, y, w, h, rotation], index) => shape(`chaos-loop-${index}`, "ellipse", {
      x: left.x + left.w * x,
      y: left.y + left.h * y,
      w: left.w * w,
      h: left.h * h
    }, { stroke: index % 2 === 0 ? "#E58A24" : "#D97918", strokeWidthPt: 2.8, rotation })),
    ...[
      [0.18, 0.43, 0.22, 0.16, -28],
      [0.29, 0.36, 0.28, 0.18, 14],
      [0.54, 0.38, 0.35, 0.21, -10],
      [0.62, 0.54, 0.28, 0.18, 26],
      [0.30, 0.70, 0.26, 0.16, -16],
      [0.48, 0.72, 0.31, 0.19, 18]
    ].map(([x, y, w, h, rotation], index) => shape(`chaos-secondary-loop-${index}`, "ellipse", {
      x: left.x + left.w * x,
      y: left.y + left.h * y,
      w: left.w * w,
      h: left.h * h
    }, { stroke: index % 2 === 0 ? "#F0A24E" : "#D97918", strokeWidthPt: 1.9, rotation })),
    card("funnel-card", 0.06, 0.07, 0.23, 0.23),
    shape("funnel-top", "freeform", { x: left.x + left.w * 0.105, y: left.y + left.h * 0.105, w: left.w * 0.13, h: left.h * 0.09 }, {
      fill: paleOrange,
      stroke: darkOrange,
      strokeWidthPt: 1.1,
      points: [[0, 0], [1, 0], [0.62, 1], [0.38, 1]]
    }),
    shape("funnel-stem", "rect", { x: left.x + left.w * 0.158, y: left.y + left.h * 0.195, w: left.w * 0.025, h: left.h * 0.055 }, { fill: darkOrange, stroke: "none", strokeWidthPt: 0 }),
    card("prototype-card-a", 0.34, 0.07, 0.23, 0.22),
    shape("prototype-screen-a", "roundRect", { x: left.x + left.w * 0.375, y: left.y + left.h * 0.115, w: left.w * 0.15, h: left.h * 0.075 }, { fill: "#FFFFFF", stroke: darkOrange, strokeWidthPt: 0.9, radiusRatio: 0.04 }),
    line("prototype-line-a", { x: left.x + left.w * 0.39, y: left.y + left.h * 0.155 }, { x: left.x + left.w * 0.51, y: left.y + left.h * 0.155 }, darkOrange, 1.0),
    card("prototype-card-b", 0.67, 0.07, 0.23, 0.22),
    shape("prototype-screen-b", "roundRect", { x: left.x + left.w * 0.705, y: left.y + left.h * 0.115, w: left.w * 0.15, h: left.h * 0.075 }, { fill: "#FFFFFF", stroke: darkOrange, strokeWidthPt: 0.9, radiusRatio: 0.04 }),
    line("prototype-line-b", { x: left.x + left.w * 0.72, y: left.y + left.h * 0.155 }, { x: left.x + left.w * 0.84, y: left.y + left.h * 0.155 }, darkOrange, 1.0),
    card("review-card", 0.63, 0.61, 0.26, 0.22),
    shape("review-page", "roundRect", { x: left.x + left.w * 0.68, y: left.y + left.h * 0.655, w: left.w * 0.09, h: left.h * 0.09 }, { fill: "#FFFFFF", stroke: darkOrange, strokeWidthPt: 0.9, radiusRatio: 0.03 }),
    shape("review-lens", "ellipse", { x: left.x + left.w * 0.765, y: left.y + left.h * 0.675, w: left.w * 0.045, h: left.h * 0.055 }, { stroke: darkOrange, strokeWidthPt: 1.1 }),
    line("review-lens-handle", { x: left.x + left.w * 0.80, y: left.y + left.h * 0.725 }, { x: left.x + left.w * 0.84, y: left.y + left.h * 0.765 }, darkOrange, 1.1),
    shape("person-head", "ellipse", { x: cx - left.w * 0.052, y: cy - left.h * 0.145, w: left.w * 0.104, h: left.h * 0.115 }, { fill: "#F58220", stroke: "#F58220", strokeWidthPt: 1.0 }),
    shape("person-body", "roundRect", { x: cx - left.w * 0.075, y: cy - left.h * 0.030, w: left.w * 0.150, h: left.h * 0.180 }, { fill: "#F58220", stroke: "#F58220", strokeWidthPt: 1.0, radiusRatio: 0.08 }),
    line("person-left-arm", { x: cx - left.w * 0.070, y: cy + left.h * 0.020 }, { x: cx - left.w * 0.170, y: cy - left.h * 0.150 }, "#F58220", 10.0),
    line("person-right-arm", { x: cx + left.w * 0.070, y: cy + left.h * 0.020 }, { x: cx + left.w * 0.185, y: cy - left.h * 0.110 }, "#F58220", 10.0),
    line("person-left-leg", { x: cx - left.w * 0.025, y: cy + left.h * 0.110 }, { x: cx - left.w * 0.075, y: cy + left.h * 0.180 }, darkOrange, 2.0),
    line("person-right-leg", { x: cx + left.w * 0.025, y: cy + left.h * 0.110 }, { x: cx + left.w * 0.080, y: cy + left.h * 0.180 }, darkOrange, 2.0)
  ];
  const labelStyle = { color: textColor, sizePt: 13.2, weight: 700 };
  const textBoxes = [
    processFlowTextBox(image, "漏斗分析", { x: left.x + left.w * 0.075, y: left.y + left.h * 0.245, w: left.w * 0.18, h: left.h * 0.055 }, { ...labelStyle, idSuffix: "left-funnel" }),
    processFlowTextBox(image, "画原型图", { x: left.x + left.w * 0.365, y: left.y + left.h * 0.245, w: left.w * 0.18, h: left.h * 0.055 }, { ...labelStyle, idSuffix: "left-prototype-a" }),
    processFlowTextBox(image, "画原型图", { x: left.x + left.w * 0.695, y: left.y + left.h * 0.245, w: left.w * 0.18, h: left.h * 0.055 }, { ...labelStyle, idSuffix: "left-prototype-b" }),
    processFlowTextBox(image, "写复盘报告", { x: left.x + left.w * 0.655, y: left.y + left.h * 0.785, w: left.w * 0.22, h: left.h * 0.055 }, { ...labelStyle, idSuffix: "left-review" })
  ];
  return { shapes, textBoxes };
}

function cardLabelBox(cardBox) {
  return {
    x: cardBox.x + cardBox.w * 0.31,
    y: cardBox.y + cardBox.h * 0.31,
    w: cardBox.w * 0.62,
    h: cardBox.h * 0.38
  };
}

function processFlowTextBox(image, text, box, font) {
  return {
    id: `${image.id || "process-screenshots"}-native-text-${font.idSuffix || text.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
    text,
    box,
    font: {
      family: /[\u4e00-\u9fa5]/.test(text) ? "Microsoft YaHei" : "Aptos",
      sizePt: font.sizePt,
      color: font.color,
      weight: Number(font.weight || 0) >= 600 || font.weight === "bold" ? "bold" : "regular",
      align: font.align || "center",
      valign: "middle",
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
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "process-screenshots-native-text",
      layerSourceId: image.id || null,
      confidence: 0.78
    }
  };
}

function processWithScreenshotsIconShapes(image, icon, index, confidence) {
  const color = "#23A768";
  const pale = "#BFE8D2";
  const b = icon.box;
  const blueIcon = "#BFE2F4";
  const baseSource = {
    editable: true,
    nativeRebuild: true,
    detector: "process-screenshots-native-icon",
    layerSourceId: image.id || null,
    iconRole: icon.role,
    iconIndex: index,
    confidence
  };
  const rect = (suffix, box, fill = color, stroke = color, radiusRatio = 0.08) => ({
    id: `${image.id || "process-screenshots"}-native-icon-${index}-${suffix}`,
    type: "roundRect",
    box,
    style: {
      fill,
      stroke,
      strokeWidthPt: 0.8,
      radiusRatio
    },
    source: baseSource
  });
  const line = (suffix, from, to, width = 1.1) => ({
    id: `${image.id || "process-screenshots"}-native-icon-${index}-${suffix}`,
    type: "line",
    box: lineBox(from, to),
    style: {
      stroke: color,
      strokeWidthPt: width,
      connectorType: "straight",
      lineCap: "round"
    },
    source: baseSource
  });
  const blueLine = (suffix, from, to, width = 1.6) => ({
    ...line(suffix, from, to, width),
    style: {
      ...line(suffix, from, to, width).style,
      stroke: blueIcon
    }
  });
  if (icon.role === "search") {
    return [
      { ...rect("search-circle", { x: b.x + b.w * 0.12, y: b.y + b.h * 0.08, w: b.w * 0.58, h: b.w * 0.58 }, "none", blueIcon, 0.5), type: "ellipse" },
      blueLine("search-handle", { x: b.x + b.w * 0.58, y: b.y + b.h * 0.58 }, { x: b.x + b.w * 0.90, y: b.y + b.h * 0.90 }, 4.2)
    ];
  }
  if (icon.role === "document") {
    return [
      rect("doc-page", { x: b.x + b.w * 0.18, y: b.y, w: b.w * 0.64, h: b.h * 0.92 }, "#EAF6FE", blueIcon, 0.04),
      blueLine("doc-line-1", { x: b.x + b.w * 0.30, y: b.y + b.h * 0.28 }, { x: b.x + b.w * 0.68, y: b.y + b.h * 0.28 }, 1.6),
      blueLine("doc-line-2", { x: b.x + b.w * 0.30, y: b.y + b.h * 0.48 }, { x: b.x + b.w * 0.68, y: b.y + b.h * 0.48 }, 1.6),
      rect("doc-box", { x: b.x + b.w * 0.30, y: b.y + b.h * 0.62, w: b.w * 0.18, h: b.h * 0.18 }, "none", blueIcon, 0.02)
    ];
  }
  if (icon.role === "radar") {
    return [
      { ...rect("radar-ring", { x: b.x + b.w * 0.15, y: b.y + b.h * 0.10, w: b.w * 0.70, h: b.w * 0.70 }, "none", blueIcon, 0.5), type: "ellipse" },
      { ...rect("radar-inner", { x: b.x + b.w * 0.31, y: b.y + b.h * 0.26, w: b.w * 0.38, h: b.w * 0.38 }, "none", blueIcon, 0.5), type: "ellipse" },
      blueLine("radar-sweep", { x: b.x + b.w * 0.50, y: b.y + b.h * 0.48 }, { x: b.x + b.w * 0.78, y: b.y + b.h * 0.24 }, 3.0),
      { ...rect("radar-check", { x: b.x + b.w * 0.66, y: b.y + b.h * 0.58, w: b.w * 0.24, h: b.w * 0.24 }, "#BFE2F4", blueIcon, 0.5), type: "ellipse" }
    ];
  }
  if (icon.role === "prototype") {
    return [
      rect("prototype-window", { x: b.x + b.w * 0.05, y: b.y + b.h * 0.12, w: b.w * 0.82, h: b.h * 0.58 }, "#EAF6FE", blueIcon, 0.04),
      blueLine("prototype-top", { x: b.x + b.w * 0.05, y: b.y + b.h * 0.26 }, { x: b.x + b.w * 0.87, y: b.y + b.h * 0.26 }, 1.4),
      rect("prototype-img", { x: b.x + b.w * 0.13, y: b.y + b.h * 0.36, w: b.w * 0.22, h: b.h * 0.22 }, "none", blueIcon, 0.02),
      blueLine("prototype-row", { x: b.x + b.w * 0.43, y: b.y + b.h * 0.42 }, { x: b.x + b.w * 0.75, y: b.y + b.h * 0.42 }, 1.4),
      blueLine("prototype-row-2", { x: b.x + b.w * 0.43, y: b.y + b.h * 0.55 }, { x: b.x + b.w * 0.68, y: b.y + b.h * 0.55 }, 1.4)
    ];
  }
  if (icon.role === "prompting") {
    return [
      rect("bubble", { x: b.x, y: b.y, w: b.w, h: b.h * 0.68 }, "#DDF3E8", color, 0.18),
      line("tail-a", { x: b.x + b.w * 0.34, y: b.y + b.h * 0.68 }, { x: b.x + b.w * 0.22, y: b.y + b.h * 0.92 }, 1.0),
      line("tail-b", { x: b.x + b.w * 0.34, y: b.y + b.h * 0.68 }, { x: b.x + b.w * 0.52, y: b.y + b.h * 0.74 }, 1.0)
    ];
  }
  if (icon.role === "document-generation") {
    return [
      rect("sheet", { x: b.x + b.w * 0.18, y: b.y, w: b.w * 0.64, h: b.h }, "#DDF3E8", color, 0.05),
      line("row-1", { x: b.x + b.w * 0.31, y: b.y + b.h * 0.34 }, { x: b.x + b.w * 0.69, y: b.y + b.h * 0.34 }, 0.9),
      line("row-2", { x: b.x + b.w * 0.31, y: b.y + b.h * 0.52 }, { x: b.x + b.w * 0.69, y: b.y + b.h * 0.52 }, 0.9),
      line("row-3", { x: b.x + b.w * 0.31, y: b.y + b.h * 0.70 }, { x: b.x + b.w * 0.60, y: b.y + b.h * 0.70 }, 0.9)
    ];
  }
  return [
    rect("grid", { x: b.x, y: b.y + b.h * 0.10, w: b.w * 0.72, h: b.h * 0.62 }, "#DDF3E8", color, 0.04),
    line("grid-v", { x: b.x + b.w * 0.36, y: b.y + b.h * 0.10 }, { x: b.x + b.w * 0.36, y: b.y + b.h * 0.72 }, 0.8),
    line("grid-h", { x: b.x, y: b.y + b.h * 0.41 }, { x: b.x + b.w * 0.72, y: b.y + b.h * 0.41 }, 0.8),
    rect("lens", { x: b.x + b.w * 0.44, y: b.y + b.h * 0.50, w: b.w * 0.40, h: b.w * 0.40 }, "#DDF3E8", pale, 0.5),
    line("handle", { x: b.x + b.w * 0.75, y: b.y + b.h * 0.82 }, { x: b.x + b.w * 0.98, y: b.y + b.h * 1.02 }, 1.4)
  ];
}

module.exports = {createProcessWithScreenshotsFlowObjects, createProductWorkflowStageMinimumUnitCrops, inferProcessWithScreenshotsFlowLayout, cardLabelBox, inferProcessWithScreenshotsLeftIllustrationLayout, processFlowTextBox, inferProductWorkflowIconProcessLayout, isProductWorkflowIconProcess, isProcessWithScreenshotsFlowFullyObjectified, processWithScreenshotsIconShapes, shouldObjectifyProcessWithScreenshotsFlow};
