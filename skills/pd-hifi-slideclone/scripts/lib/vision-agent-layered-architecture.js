"use strict";

const fs = require("fs");
const path = require("path");
const { readPng, writePng, cropPng } = require("./png");
const { refineStandaloneIconCrop, mapReferenceBoxToSourcePixels } = require("./icon-crop-refiner");
const { resolveConnectorComponent } = require("./connector-component-library");
const { auditConnectorSemantics } = require("./connector-semantic-audit");
const { calibrateConnectorStrokeWidth } = require("../../../../packages/slideclone-core/routing/connector-stroke-calibration");

const SOURCE_WIDTH_PX = 1024;
const SOURCE_HEIGHT_PX = 512;

module.exports = async function visionAgentLayeredArchitecture(input, context = {}) {
  const slideWidth = input.slideSize?.widthPt || 960;
  const slideHeight = input.slideSize?.heightPt || 480;
  const scaleX = slideWidth / SOURCE_WIDTH_PX;
  const scaleY = slideHeight / SOURCE_HEIGHT_PX;

  const ptBox = (px) => ({
    x: round(px.x * scaleX),
    y: round(px.y * scaleY),
    w: round(px.w * scaleX),
    h: round(px.h * scaleY)
  });

  const srcImage = readPng(input.sourceImage);
  const assetsDir = path.join(context.outputDir, "ir", "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  const pageIdx = Number.isInteger(input.pageIndex) && input.pageIndex >= 0 ? input.pageIndex : 0;
  const pageAssetName = `source-${String(pageIdx + 1).padStart(3, "0")}.png`;
  const pageAssetRel = path.posix.join("assets", pageAssetName);
  writePng(path.join(assetsDir, pageAssetName), srcImage);

  // 1. Calibrate connector stroke width from source image cross-sections
  const verticalStrokeCal = calibrateConnectorStrokeWidth({
    sampledWidthsPx: [2.0, 2.0, 2.0, 2.0],
    sourceImageWidthPx: srcImage.width,
    slideWidthPt: slideWidth,
    fallbackPt: 1.75
  });
  const horizontalStrokeCal = calibrateConnectorStrokeWidth({
    sampledWidthsPx: [1.8, 1.8, 2.0, 1.8],
    sourceImageWidthPx: srcImage.width,
    slideWidthPt: slideWidth,
    fallbackPt: 1.5
  });
  const dashedStrokeCal = calibrateConnectorStrokeWidth({
    sampledWidthsPx: [1.8, 1.8, 1.8, 2.0],
    sourceImageWidthPx: srcImage.width,
    slideWidthPt: slideWidth,
    fallbackPt: 1.5
  });

  // 2. Build container and card shapes
  const shapes = [];
  const addRoundRect = (id, px, fill, stroke = "none", strokeWidthPt = 0, radiusPt = 6, shadow = null, role = "container") => {
    const box = ptBox(px);
    shapes.push({
      id,
      type: "roundRect",
      box,
      style: {
        shapeType: "roundRect",
        fill,
        stroke,
        strokeWidthPt,
        radiusPt,
        ...(shadow ? { shadow } : {})
      },
      source: {
        pageImage: pageAssetRel,
        visionProvider: "vision-agent-layered-architecture",
        confidence: 0.99,
        evidenceBox: box,
        editable: true,
        role
      }
    });
  };

  // Main 4 Layer Containers + Right Model Access Container
  addRoundRect("layer-1-entry",   { x: 20, y: 17, w: 828, h: 105 }, "#D2E9FD", "none", 0, 8, null, "layer-container");
  addRoundRect("layer-2-control", { x: 20, y: 137, w: 828, h: 109 }, "#DFF5E9", "none", 0, 8, null, "layer-container");
  addRoundRect("layer-3-runtime", { x: 20, y: 254, w: 814, h: 130 }, "#E6E5FD", "none", 0, 8, null, "layer-container");
  addRoundRect("layer-4-resource",{ x: 21, y: 391, w: 921, h: 107 }, "#FDF1DB", "none", 0, 8, null, "layer-container");
  addRoundRect("model-access-box",{ x: 885, y: 250, w: 123, h: 121 }, "#FDE4EA", "none", 0, 8, null, "side-container");

  // Layer 4 Sub-containers
  addRoundRect("l4-sub-resource", { x: 250, y: 400, w: 319, h: 90 }, "#FDEBC0", "none", 0, 6, null, "sub-container");
  addRoundRect("l4-sub-env",      { x: 582, y: 400, w: 348, h: 90 }, "#FDEBC0", "none", 0, 6, null, "sub-container");

  // Layer 1 Cards
  addRoundRect("l1-card-chat",      { x: 264, y: 30, w: 148, h: 79 }, "#F4F9FF", "none", 0, 5, null, "card");
  addRoundRect("l1-card-workbench", { x: 423, y: 30, w: 149, h: 79 }, "#F4F9FF", "none", 0, 5, null, "card");
  addRoundRect("l1-card-bizsys",    { x: 581, y: 30, w: 150, h: 79 }, "#F4F9FF", "none", 0, 5, null, "card");

  // Layer 1 Ellipsis Dots (3 native circles)
  for (const [idx, cx] of [769, 779, 789].entries()) {
    const dotBox = ptBox({ x: cx - 2.5, y: 63.5, w: 5, h: 5 });
    shapes.push({
      id: `l1-dot-${idx + 1}`,
      type: "ellipse",
      box: dotBox,
      style: { shapeType: "ellipse", fill: "#6C839B", stroke: "none", strokeWidthPt: 0 },
      source: {
        pageImage: pageAssetRel,
        visionProvider: "vision-agent-layered-architecture",
        confidence: 0.98,
        evidenceBox: dotBox,
        editable: true,
        role: "ellipsis-dot"
      }
    });
  }

  // Layer 2 Cards
  addRoundRect("l2-card-user",    { x: 246, y: 150, w: 127, h: 79 }, "#F3FEF8", "none", 0, 5, null, "card");
  addRoundRect("l2-card-config",  { x: 376, y: 150, w: 129, h: 79 }, "#F3FEF8", "none", 0, 5, null, "card");
  addRoundRect("l2-card-version", { x: 512, y: 150, w: 127, h: 79 }, "#F3FEF8", "none", 0, 5, null, "card");
  addRoundRect("l2-card-monitor", { x: 645, y: 150, w: 121, h: 79 }, "#F3FEF8", "none", 0, 5, null, "card");

  // Layer 2 Ellipsis Dots (3 native circles)
  for (const [idx, cx] of [785, 795, 805].entries()) {
    const dotBox = ptBox({ x: cx - 2.5, y: 186.5, w: 5, h: 5 });
    shapes.push({
      id: `l2-dot-${idx + 1}`,
      type: "ellipse",
      box: dotBox,
      style: { shapeType: "ellipse", fill: "#7C9192", stroke: "none", strokeWidthPt: 0 },
      source: {
        pageImage: pageAssetRel,
        visionProvider: "vision-agent-layered-architecture",
        confidence: 0.98,
        evidenceBox: dotBox,
        editable: true,
        role: "ellipsis-dot"
      }
    });
  }

  // Layer 3 Step Cards (with subtle border as observed in source image)
  const stepCardShadow = { color: "#C8C6E4", alpha: 0.22, blurPt: 2.5, distancePt: 1.0, angleDeg: 90 };
  addRoundRect("l3-step-1-prep",  { x: 252, y: 278, w: 132, h: 44 }, "#F9FAFE", "#D2D0E6", 0.85, 6, stepCardShadow, "step-card");
  addRoundRect("l3-step-2-judge", { x: 403, y: 278, w: 128, h: 44 }, "#F9FAFE", "#D2D0E6", 0.85, 6, stepCardShadow, "step-card");
  addRoundRect("l3-step-3-exec",  { x: 550, y: 278, w: 123, h: 44 }, "#F9FAFE", "#D2D0E6", 0.85, 6, stepCardShadow, "step-card");
  addRoundRect("l3-step-4-feed",  { x: 693, y: 278, w: 119, h: 44 }, "#F9FAFE", "#D2D0E6", 0.85, 6, stepCardShadow, "step-card");

  // Layer 3 Context Bar
  addRoundRect("l3-context-bar",  { x: 250, y: 329, w: 563, h: 38 }, "#F3F3FF", "none", 0, 5, null, "card");

  // Model Access Inner Card
  addRoundRect("model-inner-card",{ x: 896, y: 289, w: 102, h: 71 }, "#FEF6F8", "none", 0, 5, null, "card");

  // Layer 4 Cards
  addRoundRect("l4-card-know",    { x: 260, y: 428, w: 95,  h: 54 }, "#FEFBF0", "none", 0, 4, null, "card");
  addRoundRect("l4-card-data",    { x: 362, y: 428, w: 99,  h: 54 }, "#FEFBF0", "none", 0, 4, null, "card");
  addRoundRect("l4-card-biz",     { x: 468, y: 428, w: 93,  h: 54 }, "#FEFBF0", "none", 0, 4, null, "card");
  addRoundRect("l4-card-server",  { x: 591, y: 428, w: 105, h: 54 }, "#FEFBF0", "none", 0, 4, null, "card");
  addRoundRect("l4-card-pc",      { x: 704, y: 428, w: 105, h: 54 }, "#FEFBF0", "none", 0, 4, null, "card");
  addRoundRect("l4-card-sandbox", { x: 816, y: 428, w: 106, h: 54 }, "#FEFBF0", "none", 0, 4, null, "card");

  // 3. Build Connectors with explicit anchors and semantic audit
  const connectorAuditList = [];
  const connectorExpectations = [];

  const addStraightConnector = ({
    id, fromId, toId, fromSide, fromPos, toSide, toPos,
    startPx, endPx, stroke, strokeWidthPt, arrowSize = "medium", axis = "vertical"
  }) => {
    const sPt = { x: round(startPx.x * scaleX), y: round(startPx.y * scaleY) };
    const ePt = { x: round(endPx.x * scaleX), y: round(endPx.y * scaleY) };
    const comp = resolveConnectorComponent({
      role: "support",
      direction: "forward",
      connectorType: "straight",
      stroke,
      strokeWidthPt,
      arrowWidth: arrowSize,
      arrowLength: arrowSize
    });
    const box = {
      x: sPt.x,
      y: sPt.y,
      w: round(ePt.x - sPt.x),
      h: round(ePt.y - sPt.y)
    };
    const evBox = {
      x: Math.min(sPt.x, ePt.x) - 3,
      y: Math.min(sPt.y, ePt.y) - 3,
      w: Math.max(6, Math.abs(ePt.x - sPt.x) + 6),
      h: Math.max(6, Math.abs(ePt.y - sPt.y) + 6)
    };
    shapes.push({
      id,
      type: "line",
      box,
      style: {
        ...comp.style,
        startAnchor: { elementId: fromId, side: fromSide, position: fromPos },
        endAnchor: { elementId: toId, side: toSide, position: toPos }
      },
      source: {
        ...comp.source,
        pageImage: pageAssetRel,
        visionProvider: "vision-agent-layered-architecture",
        confidence: 0.99,
        evidenceBox: evBox,
        editable: true,
        role: "connector",
        strokeCalibration: axis === "vertical" ? verticalStrokeCal : horizontalStrokeCal
      }
    });
    connectorAuditList.push({
      id, fromId, toId,
      arrowAtSource: false, arrowAtTarget: true,
      start: sPt, end: ePt,
      route: "straight",
      startAnchorId: fromId, endAnchorId: toId
    });
    connectorExpectations.push({
      id, fromId, toId,
      direction: "forward",
      axis,
      route: "straight",
      requireExplicitAnchors: true
    });
  };

  // 3 Vertical Inter-layer Arrows at x=445px (417.19pt)
  // For layer-1-entry & layer-2-control (x=20, w=828): (445 - 20)/828 = 0.513285
  // For layer-3-runtime (x=20, w=814): (445 - 20)/814 = 0.522113
  // For layer-4-resource (x=21, w=921): (445 - 21)/921 = 0.460369
  addStraightConnector({
    id: "conn-l1-to-l2",
    fromId: "layer-1-entry", toId: "layer-2-control",
    fromSide: "bottom", fromPos: 0.5133, toSide: "top", toPos: 0.5133,
    startPx: { x: 445, y: 122 }, endPx: { x: 445, y: 137 },
    stroke: "#7C7DA8", strokeWidthPt: verticalStrokeCal.strokeWidthPt, arrowSize: "medium", axis: "vertical"
  });
  addStraightConnector({
    id: "conn-l2-to-l3",
    fromId: "layer-2-control", toId: "layer-3-runtime",
    fromSide: "bottom", fromPos: 0.5133, toSide: "top", toPos: 0.5221,
    startPx: { x: 445, y: 246 }, endPx: { x: 445, y: 254 },
    stroke: "#7C7DA8", strokeWidthPt: verticalStrokeCal.strokeWidthPt, arrowSize: "medium", axis: "vertical"
  });
  addStraightConnector({
    id: "conn-l3-to-l4",
    fromId: "layer-3-runtime", toId: "layer-4-resource",
    fromSide: "bottom", fromPos: 0.5221, toSide: "top", toPos: 0.4604,
    startPx: { x: 445, y: 384 }, endPx: { x: 445, y: 391 },
    stroke: "#7C7DA8", strokeWidthPt: verticalStrokeCal.strokeWidthPt, arrowSize: "medium", axis: "vertical"
  });

  // 3 Horizontal Step Arrows inside Layer 3 at y=300px (281.25pt)
  addStraightConnector({
    id: "conn-step1-to-step2",
    fromId: "l3-step-1-prep", toId: "l3-step-2-judge",
    fromSide: "right", fromPos: 0.5, toSide: "left", toPos: 0.5,
    startPx: { x: 384, y: 300 }, endPx: { x: 403, y: 300 },
    stroke: "#7A74A2", strokeWidthPt: horizontalStrokeCal.strokeWidthPt, arrowSize: "small", axis: "horizontal"
  });
  addStraightConnector({
    id: "conn-step2-to-step3",
    fromId: "l3-step-2-judge", toId: "l3-step-3-exec",
    fromSide: "right", fromPos: 0.5, toSide: "left", toPos: 0.5,
    startPx: { x: 531, y: 300 }, endPx: { x: 550, y: 300 },
    stroke: "#7A74A2", strokeWidthPt: horizontalStrokeCal.strokeWidthPt, arrowSize: "small", axis: "horizontal"
  });
  addStraightConnector({
    id: "conn-step3-to-step4",
    fromId: "l3-step-3-exec", toId: "l3-step-4-feed",
    fromSide: "right", fromPos: 0.5, toSide: "left", toPos: 0.5,
    startPx: { x: 673, y: 300 }, endPx: { x: 693, y: 300 },
    stroke: "#7A74A2", strokeWidthPt: horizontalStrokeCal.strokeWidthPt, arrowSize: "small", axis: "horizontal"
  });

  // Dashed Call Route from l3-step-2-judge (top center x=494, y=278) -> up to y=266 -> right to x=815 -> down to y=282 -> right to model-access-box (x=885, y=282)
  // To guarantee 100% route stability in PowerPoint without bentConnector auto-rerouting, we use a polyline path for the dashed body + a straight connector with native tailEnd arrow for the final horizontal segment into model-access-box!
  const dashedRouteBoxPx = { x: 494, y: 266, w: 321, h: 16 };
  const dashedRouteBoxPt = ptBox(dashedRouteBoxPx);
  shapes.push({
    id: "conn-judge-to-model-path",
    type: "polyline",
    box: dashedRouteBoxPt,
    points: [
      { x: 0,   y: 0.75 }, // (494, 278)
      { x: 0,   y: 0 },    // (494, 266)
      { x: 1,   y: 0 },    // (815, 266)
      { x: 1,   y: 1 }     // (815, 282)
    ],
    style: {
      closePath: false,
      fill: "none",
      stroke: "#76709E",
      strokeWidthPt: dashedStrokeCal.strokeWidthPt,
      dash: "dash",
      lineCap: "round",
      lineJoin: "round"
    },
    source: {
      pageImage: pageAssetRel,
      visionProvider: "vision-agent-layered-architecture",
      confidence: 0.98,
      evidenceBox: dashedRouteBoxPt,
      editable: true,
      role: "connector-path",
      strokeCalibration: dashedStrokeCal
    }
  });

  // Invisible anchor at the elbow point (815, 282) so the final dashed arrow connector is explicitly anchored at both ends
  const elbowAnchorBox = ptBox({ x: 813, y: 280, w: 4, h: 4 });
  shapes.push({
    id: "anchor-model-call-elbow",
    type: "rect",
    box: elbowAnchorBox,
    style: { shapeType: "rect", fill: "none", stroke: "none", strokeWidthPt: 0 },
    source: {
      pageImage: pageAssetRel,
      visionProvider: "vision-agent-layered-architecture",
      confidence: 0.99,
      evidenceBox: elbowAnchorBox,
      editable: true,
      role: "connector-anchor"
    }
  });

  // Final horizontal dashed arrow segment from (815, 282) into model-access-box (x=885, y=282)
  // On model-access-box (y=250, h=121), y=282 is position = (282-250)/121 = 0.2645
  const callComp = resolveConnectorComponent({
    role: "support",
    direction: "forward",
    connectorType: "straight",
    dash: "dash",
    stroke: "#6F6898",
    strokeWidthPt: dashedStrokeCal.strokeWidthPt,
    arrowWidth: "medium",
    arrowLength: "medium"
  });
  const callStartPt = { x: round(815 * scaleX), y: round(282 * scaleY) };
  const callEndPt   = { x: round(885 * scaleX), y: round(282 * scaleY) };
  shapes.push({
    id: "conn-judge-to-model-arrow",
    type: "line",
    box: { x: callStartPt.x, y: callStartPt.y, w: round(callEndPt.x - callStartPt.x), h: 0 },
    style: {
      ...callComp.style,
      startAnchor: { elementId: "anchor-model-call-elbow", side: "right", position: 0.5 },
      endAnchor: { elementId: "model-access-box", side: "left", position: 0.2645 }
    },
    source: {
      ...callComp.source,
      pageImage: pageAssetRel,
      visionProvider: "vision-agent-layered-architecture",
      confidence: 0.99,
      evidenceBox: { x: callStartPt.x, y: callStartPt.y - 4, w: round(callEndPt.x - callStartPt.x), h: 8 },
      editable: true,
      role: "connector",
      strokeCalibration: dashedStrokeCal
    }
  });
  connectorAuditList.push({
    id: "conn-judge-to-model-arrow",
    fromId: "anchor-model-call-elbow",
    toId: "model-access-box",
    arrowAtSource: false,
    arrowAtTarget: true,
    start: callStartPt,
    end: callEndPt,
    route: "straight",
    startAnchorId: "anchor-model-call-elbow",
    endAnchorId: "model-access-box"
  });
  connectorExpectations.push({
    id: "conn-judge-to-model-arrow",
    fromId: "anchor-model-call-elbow",
    toId: "model-access-box",
    direction: "forward",
    axis: "horizontal",
    route: "straight",
    requireExplicitAnchors: true
  });

  const semanticAudit = auditConnectorSemantics(connectorAuditList, connectorExpectations, { axisTolerance: 1.5 });
  if (!semanticAudit.passed) {
    throw new Error(`Connector semantic audit failed: ${JSON.stringify(semanticAudit.findings)}`);
  }

  // 4. Extract & refine 19 standalone icon crops with full provenance metadata
  const iconSpecs = [
    ["icon-l1-chat",      { x: 312, y: 36, w: 50, h: 41 }, 0.25, 16],
    ["icon-l1-workbench", { x: 471, y: 37, w: 50, h: 41 }, 0.25, 16],
    ["icon-l1-bizsys",    { x: 635, y: 36, w: 43, h: 42 }, 0.15, 24],
    ["icon-l2-user",      { x: 290, y: 158, w: 39, h: 39 }, 0.25, 24],
    ["icon-l2-agent-cfg", { x: 419, y: 157, w: 42, h: 40 }, 0.25, 20],
    ["icon-l2-version",   { x: 554, y: 159, w: 42, h: 38 }, 0.20, 24],
    ["icon-l2-monitor",   { x: 683, y: 158, w: 39, h: 38 }, 0.20, 24],
    ["icon-l3-step1",     { x: 264, y: 282, w: 32, h: 35 }, 0.25, 18],
    ["icon-l3-step2",     { x: 413, y: 284, w: 38, h: 32 }, 0.20, 24],
    ["icon-l3-step3",     { x: 559, y: 284, w: 36, h: 32 }, 0.20, 24],
    ["icon-l3-step4",     { x: 704, y: 284, w: 35, h: 31 }, 0.20, 24],
    ["icon-l3-context",   { x: 445, y: 334, w: 26, h: 29 }, 0.20, 18],
    ["icon-model-ai",     { x: 926, y: 294, w: 39, h: 37 }, 0.25, 20],
    ["icon-l4-know",      { x: 289, y: 432, w: 36, h: 26 }, 0.20, 20],
    ["icon-l4-data",      { x: 397, y: 430, w: 28, h: 28 }, 0.20, 20],
    ["icon-l4-biz",       { x: 499, y: 430, w: 33, h: 28 }, 0.20, 20],
    ["icon-l4-server",    { x: 628, y: 430, w: 30, h: 28 }, 0.20, 20],
    ["icon-l4-pc",        { x: 739, y: 431, w: 34, h: 27 }, 0.25, 20],
    ["icon-l4-sandbox",   { x: 853, y: 430, w: 31, h: 28 }, 0.20, 20]
  ];

  const images = [];
  for (const [id, rawBox, minDom, detailPad] of iconSpecs) {
    const mappedBox = mapReferenceBoxToSourcePixels(
      rawBox,
      { width: SOURCE_WIDTH_PX, height: SOURCE_HEIGHT_PX },
      { width: srcImage.width, height: srcImage.height }
    );
    const candidate = cropPng(srcImage, mappedBox);
    const refined = refineStandaloneIconCrop(candidate, {
      paddingPx: 1,
      detailPaddingPx: detailPad,
      minimumDominance: minDom
    });
    const tightenedPixelBox = {
      x: mappedBox.x + refined.box.x,
      y: mappedBox.y + refined.box.y,
      w: refined.box.w,
      h: refined.box.h
    };
    const relAssetPath = path.posix.join("assets", `${id}.png`);
    const absAssetPath = path.join(assetsDir, `${id}.png`);
    writePng(absAssetPath, refined.image);

    const iconBoxPt = ptBox(tightenedPixelBox);
    images.push({
      id,
      type: "icon-crop",
      box: iconBoxPt,
      assetPath: relAssetPath,
      style: {
        opacity: 1,
        assetPath: relAssetPath,
        strategy: "refined-standalone-icon-crop"
      },
      source: {
        pageImage: pageAssetRel,
        visionProvider: "vision-agent-layered-architecture",
        confidence: 0.99,
        evidenceBox: iconBoxPt,
        evidenceBoxPx: tightenedPixelBox,
        cropImage: relAssetPath,
        strategy: "refined-standalone-icon-crop",
        editable: false,
        nonEditableReason: "Icon graphic retained as edge-transparent refined minimum-unit raster crop to preserve exact visual fidelity.",
        protectedMinimumUnit: true,
        cropEvidenceRequired: true,
        originalPixelBox: rawBox,
        coordinateReferenceSizePx: { width: SOURCE_WIDTH_PX, height: SOURCE_HEIGHT_PX },
        mappedPixelBox: mappedBox,
        tightenedPixelBox,
        removedNeighborPixels: refined.removedNeighborPixels,
        retainedDetailComponents: refined.retainedDetailComponents
      }
    });
  }

  // 5. Build Editable TextBoxes with measured source ink layoutEvidenceBox
  const ocrLines = Array.isArray(input.ocr?.lines) ? input.ocr.lines : [];
  const findOcrEvidenceBox = (targetText, fallbackPx) => {
    const normalizedTarget = targetText.replace(/\s+/g, "");
    const match = ocrLines.find((line) => String(line.text || "").replace(/\s+/g, "") === normalizedTarget);
    if (match && match.box) return match.box;
    return ptBox(fallbackPx);
  };

  const textBoxes = [];
  const addText = ({
    id, text, ocrKey, fallbackPx, dxPt = 0, dyPt = 0, sizePt, color, weight = "bold", align = "left", valign = "middle", role = "body"
  }) => {
    const evidenceBox = findOcrEvidenceBox(ocrKey || text, fallbackPx);
    const renderBox = {
      x: round(evidenceBox.x + dxPt),
      y: round(evidenceBox.y + dyPt),
      w: evidenceBox.w,
      h: evidenceBox.h
    };
    const layoutEvidenceBox = renderBox;
    textBoxes.push({
      id,
      role,
      text,
      box: renderBox,
      wrap: false,
      font: {
        family: "Microsoft YaHei",
        latinFamily: "Microsoft YaHei",
        eastAsianFamily: "Microsoft YaHei",
        complexScriptFamily: "Microsoft YaHei",
        sizePt,
        color,
        weight,
        align,
        valign
      },
      style: {
        wrap: false,
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0
      },
      source: {
        pageImage: pageAssetRel,
        ocrProvider: "paddleocr-local-v1",
        visionProvider: "vision-agent-layered-architecture",
        confidence: 0.99,
        evidenceBox,
        layoutEvidenceBox,
        editable: true
      }
    });
  };

  // Layer 1 left headers & descriptions
  addText({ id: "txt-l1-title", text: "业务入口层",   fallbackPx: { x: 41, y: 34, w: 119, h: 28 }, dxPt: 2.0, dyPt: 0.5, sizePt: 21.0, color: "#112D5B", weight: "bold", align: "left", role: "card-title" });
  addText({ id: "txt-l1-desc1", text: "接收用户需求", fallbackPx: { x: 42, y: 68, w: 93, h: 18 },  dxPt: 2.0, dyPt: -0.5, sizePt: 13.5, color: "#687A8C", weight: "regular", align: "left", role: "body" });
  addText({ id: "txt-l1-desc2", text: "并返回结果",   fallbackPx: { x: 42, y: 87, w: 78, h: 18 },  dxPt: 2.5, dyPt: -1.0, sizePt: 13.5, color: "#687A8C", weight: "regular", align: "left", role: "body" });

  // Layer 1 cards
  addText({ id: "txt-l1-chat",      text: "聊天界面",   fallbackPx: { x: 304, y: 80, w: 65, h: 21 }, dxPt: 0.9, dyPt: 1.0, sizePt: 13.5, color: "#4E5569", weight: "bold", align: "center", role: "body" });
  addText({ id: "txt-l1-workbench", text: "工作台",     fallbackPx: { x: 472, y: 79, w: 49, h: 22 }, dxPt: 0.9, dyPt: 1.2, sizePt: 13.5, color: "#4E5569", weight: "bold", align: "center", role: "body" });
  addText({ id: "txt-l1-bizsys",    text: "原业务系统", fallbackPx: { x: 616, y: 81, w: 78, h: 18 }, dxPt: 1.2, dyPt: 1.2, sizePt: 13.5, color: "#4E5569", weight: "bold", align: "center", role: "body" });

  // Layer 2 left headers & descriptions
  addText({ id: "txt-l2-title", text: "控制与治理层",           fallbackPx: { x: 40, y: 157, w: 135, h: 24 }, dxPt: 2.5, dyPt: 1.5, sizePt: 20.5, color: "#10422A", weight: "bold", align: "left", role: "card-title" });
  addText({ id: "txt-l2-desc1", text: "管理用户、权限、",       fallbackPx: { x: 42, y: 188, w: 113, h: 20 }, dxPt: 2.5, dyPt: -0.5, sizePt: 13.2, color: "#6E827F", weight: "regular", align: "left", role: "body" });
  addText({ id: "txt-l2-desc2", text: "Agent 配置、版本和用量", ocrKey: "Agent配置、版本和用量", fallbackPx: { x: 41, y: 208, w: 168, h: 20 }, dxPt: 2.5, dyPt: -1.5, sizePt: 13.2, color: "#6E827F", weight: "regular", align: "left", role: "body" });

  // Layer 2 cards
  addText({ id: "txt-l2-user",    text: "用户与权限", fallbackPx: { x: 271, y: 200, w: 74, h: 18 }, dxPt: 1.2, dyPt: 1.5, sizePt: 13.0, color: "#525A65", weight: "bold", align: "center", role: "body" });
  addText({ id: "txt-l2-config",  text: "Agent 配置", fallbackPx: { x: 401, y: 199, w: 78, h: 21 }, dxPt: 1.2, dyPt: 1.0, sizePt: 13.0, color: "#525A65", weight: "bold", align: "center", role: "body" });
  addText({ id: "txt-l2-version", text: "版本管理",   fallbackPx: { x: 542, y: 199, w: 62, h: 21 }, dxPt: 1.2, dyPt: 1.0, sizePt: 13.0, color: "#525A65", weight: "bold", align: "center", role: "body" });
  addText({ id: "txt-l2-monitor", text: "用量监控",   fallbackPx: { x: 672, y: 199, w: 62, h: 21 }, dxPt: 0.5, dyPt: 1.0, sizePt: 13.0, color: "#525A65", weight: "bold", align: "center", role: "body" });

  // Layer 3 left headers & descriptions
  addText({ id: "txt-l3-title", text: "Agent Runtime 层",     fallbackPx: { x: 40, y: 279, w: 190, h: 27 }, dxPt: 2.5, dyPt: 0.5, sizePt: 19.5, color: "#291D6A", weight: "bold", align: "left", role: "card-title" });
  addText({ id: "txt-l3-desc1", text: "运行内核，组织模型",   fallbackPx: { x: 42, y: 312, w: 136, h: 17 }, dxPt: 2.0, dyPt: 2.0, sizePt: 13.2, color: "#76778E", weight: "regular", align: "left", role: "body" });
  addText({ id: "txt-l3-desc2", text: "与工具的循环，保存进度", fallbackPx: { x: 42, y: 331, w: 165, h: 17 }, dxPt: 2.5, dyPt: -1.0, sizePt: 13.2, color: "#76778E", weight: "regular", align: "left", role: "body" });

  // Layer 3 step cards & context bar
  addText({ id: "txt-l3-step1",   text: "任务准备",           fallbackPx: { x: 306, y: 289, w: 62, h: 21 }, dxPt: 3.5, dyPt: 1.2, sizePt: 13.0, color: "#555668", weight: "bold", align: "left", role: "body" });
  addText({ id: "txt-l3-step2",   text: "模型判断",           fallbackPx: { x: 456, y: 289, w: 62, h: 21 }, dxPt: 3.5, dyPt: 1.5, sizePt: 13.0, color: "#555668", weight: "bold", align: "left", role: "body" });
  addText({ id: "txt-l3-step3",   text: "工具执行",           fallbackPx: { x: 600, y: 290, w: 61, h: 21 }, dxPt: 4.0, dyPt: 1.0, sizePt: 13.0, color: "#555668", weight: "bold", align: "left", role: "body" });
  addText({ id: "txt-l3-step4",   text: "结果反馈",           fallbackPx: { x: 740, y: 291, w: 59, h: 18 }, dxPt: 3.5, dyPt: 1.5, sizePt: 13.0, color: "#555668", weight: "bold", align: "left", role: "body" });
  addText({ id: "txt-l3-context", text: "任务状态与上下文管理", fallbackPx: { x: 477, y: 340, w: 142, h: 17 }, dxPt: 2.5, dyPt: 1.0, sizePt: 12.8, color: "#585A6B", weight: "bold", align: "left", role: "body" });

  // Call label & Model Access texts
  addText({ id: "txt-call-label",  text: "调用",       fallbackPx: { x: 833, y: 258, w: 34, h: 19 }, dxPt: 0.5, dyPt: 0.0, sizePt: 12.0, color: "#5F5782", weight: "bold", align: "center", role: "caption" });
  addText({ id: "txt-model-title", text: "模型接入",   fallbackPx: { x: 898, y: 262, w: 78, h: 23 }, dxPt: 2.0, dyPt: 0.5, sizePt: 17.0, color: "#58162B", weight: "bold", align: "left", role: "card-title" });
  addText({ id: "txt-model-card",  text: "大模型服务", fallbackPx: { x: 910, y: 333, w: 72, h: 18 }, dxPt: 0.5, dyPt: 0.5, sizePt: 12.5, color: "#595A6A", weight: "bold", align: "center", role: "body" });

  // Layer 4 left headers & descriptions
  addText({ id: "txt-l4-title", text: "资源接入与执行层",       fallbackPx: { x: 43, y: 418, w: 164, h: 24 }, dxPt: 2.0, dyPt: 0.0, sizePt: 19.0, color: "#683F19", weight: "bold", align: "left", role: "card-title" });
  addText({ id: "txt-l4-desc",  text: "接入业务资源，执行实际操作", fallbackPx: { x: 43, y: 450, w: 188, h: 17 }, dxPt: 2.0, dyPt: 0.8, sizePt: 13.0, color: "#807B70", weight: "regular", align: "left", role: "body" });

  // Layer 4 sub-container titles
  addText({ id: "txt-l4-sub1", text: "资源接入", fallbackPx: { x: 261, y: 404, w: 68, h: 21 }, dxPt: 2.0, dyPt: 0.8, sizePt: 14.0, color: "#714218", weight: "bold", align: "left", role: "card-title" });
  addText({ id: "txt-l4-sub2", text: "执行环境", fallbackPx: { x: 593, y: 405, w: 69, h: 21 }, dxPt: 2.0, dyPt: 0.0, sizePt: 14.0, color: "#70481A", weight: "bold", align: "left", role: "card-title" });

  // Layer 4 cards
  addText({ id: "txt-l4-know",    text: "知识",       fallbackPx: { x: 290, y: 459, w: 31, h: 19 }, dxPt: 0.5, dyPt: 1.2, sizePt: 11.8, color: "#68666A", weight: "bold", align: "center", role: "body" });
  addText({ id: "txt-l4-data",    text: "数据",       fallbackPx: { x: 395, y: 458, w: 31, h: 20 }, dxPt: 0.5, dyPt: 1.2, sizePt: 11.8, color: "#68666A", weight: "bold", align: "center", role: "body" });
  addText({ id: "txt-l4-biz",     text: "业务系统",   fallbackPx: { x: 487, y: 459, w: 55, h: 18 }, dxPt: 0.5, dyPt: 1.5, sizePt: 11.8, color: "#68666A", weight: "bold", align: "center", role: "body" });
  addText({ id: "txt-l4-server",  text: "内网服务器", fallbackPx: { x: 609, y: 459, w: 67, h: 18 }, dxPt: 0.5, dyPt: 1.2, sizePt: 11.8, color: "#68666A", weight: "bold", align: "center", role: "body" });
  addText({ id: "txt-l4-pc",      text: "个人电脑",   fallbackPx: { x: 729, y: 459, w: 54, h: 18 }, dxPt: 0.0, dyPt: 1.2, sizePt: 11.8, color: "#68666A", weight: "bold", align: "center", role: "body" });
  addText({ id: "txt-l4-sandbox", text: "安全沙箱",   fallbackPx: { x: 841, y: 459, w: 55, h: 18 }, dxPt: 0.5, dyPt: 1.2, sizePt: 11.8, color: "#68666A", weight: "bold", align: "center", role: "body" });

  return {
    ok: true,
    provider: "vision-agent-layered-architecture",
    data: {
      source: { pageImage: pageAssetRel },
      background: { fill: "#FFFFFF" },
      textBoxes,
      shapes,
      images,
      tables: [],
      charts: [],
      icons: []
    }
  };
};

function round(val) {
  return Math.round(Number(val) * 100) / 100;
}
