"use strict";
const {boxCenterInside, expandPtBox, unionPtBox, constrainPtBox, round} = require("./raster-native-detection");
const {lineBox} = require("./workflow-shape-primitives");
const {safeComponentToken} = require("./diagram-residual-crops");
const {normalizeCjkText} = require("./prd-generation-shapes");
const {markProtectedComplexDiagramMinimumUnit} = require("./image-layer-metadata");
const DEFAULT_SLIDE = {widthPt: 960, heightPt: 540};

function createReviewRiskGateFlowShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!sourceImage) return [];
  const shapes = [];
  const segmentedFlow = inferSegmentedReviewRiskGateFlow(images, textBoxes, slideSize, {
    allowSmartReviewAliases: options.allowSmartReviewAliases === true
  });
  if (segmentedFlow) {
    for (const image of segmentedFlow.objectifiedImages) {
      image.source = {
        ...(image.source || {}),
        reviewRiskGateFlowObjectified: true,
        objectifiedReviewRiskCards: segmentedFlow.cards.length,
        objectifiedReviewRiskConnectors: segmentedFlow.connectors.length,
        reviewRiskGateResidualBoxes: [],
        dropErasedResidualAfterNativeRebuild: true,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "segmented product illustration"}; rebuilt review risk gate diagram as native document, card and routing primitives`
      };
    }
    for (const image of segmentedFlow.preservedImages) {
      image.source = {
        ...(image.source || {}),
        ...reviewRiskGateNativeComponentMetadata(segmentedFlow.layerSourceId, "scanner-engine", "illustration"),
        reviewRiskGateFlowObjectified: true,
        reviewRiskGateScannerGemObjectified: false,
        reviewRiskGateScannerGemCropPreserved: true,
        objectifiedReviewRiskCards: segmentedFlow.cards.length,
        objectifiedReviewRiskConnectors: segmentedFlow.connectors.length,
        reviewRiskGateResidualBoxes: [{ name: "scanner-gem", box: segmentedFlow.gemBox }],
        dropErasedResidualAfterNativeRebuild: false,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "segmented product illustration"}; preserved scanner gem as the smallest faithful pictorial unit`
      };
    }
    shapes.push(...reviewRiskGateFlowPrimitiveShapes(segmentedFlow, segmentedFlow.layerSourceId, {
      preserveScannerGem: true
    }));
    return shapes;
  }
  if (shouldPreserveReviewRiskGateFlowAsMinimumUnit(images, textBoxes, slideSize)) {
    const candidates = (images || []).filter((image) => isReviewRiskGateCandidateImage(image) || image?.source?.detector === "product-illustration-segment-crop");
    markProtectedComplexDiagramMinimumUnit(candidates, {
      detector: "review-risk-gate-protected-diagram-crop",
      expressionSubtype: "smart-review-risk-gate-illustration",
      reason: "SmartReview risk-gate lacks safe segmented evidence; preserving the visual unit avoids destructive approximation"
    });
    return shapes;
  }
  const smartReviewPartial = inferSmartReviewPartialFlow(images, textBoxes, slideSize);
  if (smartReviewPartial) {
    for (const image of smartReviewPartial.objectifiedImages) {
      image.source = {
        ...(image.source || {}),
        reviewRiskGateFlowObjectified: true,
        reviewRiskGatePartialObjectified: true,
        objectifiedReviewRiskCards: 0,
        objectifiedReviewRiskConnectors: smartReviewPartial.connectors.length,
        reviewRiskGateResidualBoxes: [],
        dropErasedResidualAfterNativeRebuild: true,
        layer: {
          ...(image.source?.layer || {}),
          layerType: "diagram-zone",
          detector: "review-risk-gate-partial-native-crop",
          recommendedAction: "preserve-local-crop"
        },
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "segmented product illustration"}; rebuilt stable SmartReview document icon and input route natively`
      };
    }
    shapes.push(...smartReviewPartialPrimitiveShapes(smartReviewPartial, smartReviewPartial.layerSourceId));
    return shapes;
  }
  for (const image of images || []) {
    if (!shouldObjectifyReviewRiskGateFlow(image, textBoxes)) continue;
    const flow = inferReviewRiskGateFlow(image, textBoxes, slideSize);
    if (!flow) continue;
    image.source = {
      ...(image.source || {}),
      reviewRiskGateFlowObjectified: true,
      reviewRiskGateScannerGemObjectified: true,
      objectifiedReviewRiskCards: flow.cards.length,
      objectifiedReviewRiskConnectors: flow.connectors.length,
      reviewRiskGateResidualBoxes: flow.residualCrops,
      dropErasedResidualAfterNativeRebuild: flow.residualCrops.length === 0 ? true : image.source?.dropErasedResidualAfterNativeRebuild,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "diagram underlay"}; rebuilt review risk gate cards, routing lines and scanner gem natively`
    };
    shapes.push(...reviewRiskGateFlowPrimitiveShapes(flow, image.id || null));
  }
  return shapes;
}

function inferSmartReviewPartialFlow(images = [], textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const segments = (images || [])
    .filter((image) => image?.source?.detector === "product-illustration-segment-crop" && image?.box)
    .sort((a, b) => a.box.x - b.box.x);
  if (segments.length < 5) return null;
  const roleBoxes = inferReviewRiskRoleBoxes(textBoxes, { allowSmartReviewAliases: true });
  if (!roleBoxes.prd || !roleBoxes.scanner || !roleBoxes.approved || !roleBoxes.risk) return null;
  const prdSegment = segments.find((segment) => boxCenterInside(roleBoxes.prd, expandPtBox(segment.box, slideSize, 26, 26))) || segments[0];
  const scannerSegment = segments.find((segment) => boxCenterInside(roleBoxes.scanner, expandPtBox(segment.box, slideSize, 28, 28))) || segments[1];
  if (!prdSegment || !scannerSegment || prdSegment === scannerSegment) return null;
  if (!boxCenterInside(roleBoxes.approved, expandPtBox(segments[segments.length - 1].box, slideSize, 30, 30))) return null;
  const riskSegment = segments.find((segment) => boxCenterInside(roleBoxes.risk, expandPtBox(segment.box, slideSize, 28, 28)));
  if (!riskSegment || riskSegment === prdSegment) return null;
  const docIcon = smartReviewDocumentIconBox(prdSegment.box, roleBoxes.prd, slideSize);
  const docRight = { x: docIcon.x + docIcon.w + 4, y: docIcon.y + docIcon.h * 0.52 };
  const scannerLeft = { x: scannerSegment.box.x - 4, y: docRight.y };
  return {
    id: "smart-review-partial",
    layerSourceId: "smart-review-partial",
    objectifiedImages: [prdSegment],
    docIcon,
    connectors: [
      {
        box: lineBox(docRight, scannerLeft),
        stroke: "#2D78B9",
        strokeWidthPt: 3.2,
        endArrow: "triangle"
      }
    ].filter((connector) => Math.abs(connector.box.w) + Math.abs(connector.box.h) > 8)
  };
}

function smartReviewDocumentIconBox(segmentBox = {}, prdTextBox = {}, slideSize = DEFAULT_SLIDE) {
  const w = Math.max(24, Math.min(42, Number(segmentBox.w || 0) * 0.44));
  const h = Math.max(30, Math.min(54, Number(segmentBox.h || 0) * 0.18));
  const x = Number(segmentBox.x || 0) + Number(segmentBox.w || 0) * 0.20;
  const targetY = Number(prdTextBox.y || prdTextBox.box?.y || 0) - h - 10;
  const y = Number.isFinite(targetY) && targetY > 0
    ? targetY
    : Number(segmentBox.y || 0) + Number(segmentBox.h || 0) * 0.25;
  return constrainPtBox({ x, y, w, h }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt });
}

function smartReviewPartialPrimitiveShapes(flow, layerSourceId) {
  const prefix = layerSourceId || flow.id || "smart-review-partial";
  const b = flow.docIcon;
  const fold = {
    x: b.x + b.w * 0.68,
    y: b.y,
    w: b.w * 0.28,
    h: b.h * 0.25
  };
  const lineW = b.w * 0.56;
  const shapes = [
    {
      id: `${prefix}-doc-page`,
      type: "freeform",
      box: b,
      points: [
        { x: 0, y: 0 },
        { x: 0.70, y: 0 },
        { x: 1, y: 0.26 },
        { x: 1, y: 1 },
        { x: 0, y: 1 }
      ],
      style: { fill: "#EAF4FF", stroke: "#2D78B9", strokeWidthPt: 1.3 },
      source: { editable: true, nativeRebuild: true, detector: "smart-review-partial-native-document", layerSourceId }
    },
    {
      id: `${prefix}-doc-fold`,
      type: "freeform",
      box: fold,
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      style: { fill: "#B9DCF8", stroke: "#2D78B9", strokeWidthPt: 0.8 },
      source: { editable: true, nativeRebuild: true, detector: "smart-review-partial-native-document-fold", layerSourceId }
    }
  ];
  for (let index = 0; index < 3; index += 1) {
    shapes.push({
      id: `${prefix}-doc-line-${index}`,
      type: "rect",
      box: {
        x: round(b.x + b.w * 0.18),
        y: round(b.y + b.h * (0.34 + index * 0.17)),
        w: round(lineW * (index === 1 ? 0.82 : 1)),
        h: round(Math.max(1.4, b.h * 0.045))
      },
      style: { fill: "#6CA8D8", stroke: "none", strokeWidthPt: 0 },
      source: { editable: true, nativeRebuild: true, detector: "smart-review-partial-native-document-line", layerSourceId, lineIndex: index }
    });
  }
  for (let index = 0; index < flow.connectors.length; index += 1) {
    const connector = flow.connectors[index];
    shapes.push({
      id: `${prefix}-connector-${index}`,
      type: "line",
      box: connector.box,
      style: {
        stroke: connector.stroke,
        strokeWidthPt: connector.strokeWidthPt,
        connectorType: "straight",
        endArrow: connector.endArrow
      },
      source: { editable: true, nativeRebuild: true, detector: "smart-review-partial-native-connector", layerSourceId, connectorIndex: index }
    });
  }
  return shapes;
}

function reviewRiskGateFlowPrimitiveShapes(flow, layerSourceId, options = {}) {
  const shapes = [];
  const prefix = layerSourceId || flow.id || "review-risk-gate";
  if (flow.prd) {
    shapes.push(...reviewRiskGatePrdShapes(flow.prd, prefix, layerSourceId));
  }
  if (flow.gemBox && options.preserveScannerGem !== true) {
    shapes.push(...reviewRiskGateScannerGemShapes(flow.gemBox, prefix, layerSourceId));
  }
  for (let index = 0; index < flow.cards.length; index += 1) {
    const card = flow.cards[index];
    const cardRole = /Approved|通过|已通过/i.test(String(card.label || "")) ? "approved-asset" : "risk-problem-pool";
    shapes.push({
      id: `${prefix}-native-card-${index}`,
      type: "roundRect",
      box: card.box,
      style: {
        fill: card.fill,
        stroke: card.stroke,
        strokeWidthPt: 2.2,
        radiusRatio: 0.08,
        shadow: {
          color: "#000000",
          alpha: 0.10,
          blurPt: 8,
          distancePt: 2,
          angle: 45
        }
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "review-risk-gate-flow-native-card",
        layerSourceId,
        label: card.label,
        ...reviewRiskGateNativeComponentMetadata(layerSourceId, cardRole, "card")
      }
    });
    shapes.push({
      id: `${prefix}-native-panel-${index}`,
      type: "rect",
      box: card.panel,
      style: {
        fill: card.panelFill,
        stroke: "none",
        strokeWidthPt: 0
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "review-risk-gate-flow-native-panel",
        layerSourceId,
        label: card.label,
        ...reviewRiskGateNativeComponentMetadata(layerSourceId, cardRole, "panel")
      }
    });
    shapes.push({
      id: `${prefix}-native-icon-${index}`,
      type: card.iconType,
      box: card.icon,
      style: {
        fill: card.iconFill,
        stroke: card.iconFill,
        strokeWidthPt: 0
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "review-risk-gate-flow-native-icon",
        layerSourceId,
        label: card.label,
        ...reviewRiskGateNativeComponentMetadata(layerSourceId, cardRole, "icon")
      }
    });
  }
  for (let index = 0; index < flow.connectors.length; index += 1) {
    const connector = flow.connectors[index];
    shapes.push({
      id: `${prefix}-native-connector-${index}`,
      type: "line",
      box: connector.box,
      style: {
        stroke: connector.stroke,
        strokeWidthPt: connector.strokeWidthPt,
        connectorType: "straight",
        endArrow: connector.endArrow
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "review-risk-gate-flow-native-connector",
        layerSourceId,
        connectorIndex: index,
        jagged: connector.jagged === true,
        ...reviewRiskGateNativeComponentMetadata(layerSourceId, "routing", "connector")
      }
    });
  }
  return shapes;
}

function reviewRiskGateNativeComponentMetadata(layerSourceId, role, part) {
  const base = safeComponentToken(layerSourceId || "review-risk-gate");
  const safeRole = safeComponentToken(role || "unknown");
  return {
    nativeComponentGroupId: `${base}-review-risk-${safeRole}`,
    nativeComponentParentId: `${base}-review-risk-gate`,
    nativeComponentArchetype: "review-risk-gate",
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentRole: role || "unknown",
    nativeComponentPart: part || "detail"
  };
}

function reviewRiskGateScannerGemShapes(gemBox, prefix, layerSourceId) {
  const b = gemBox;
  const shapes = [];
  const facets = [
    { name: "left-top-cap", fill: "#0D5795", points: [{ x: 0.02, y: 0.32 }, { x: 0.22, y: 0.04 }, { x: 0.50, y: 0.04 }, { x: 0.50, y: 0.32 }] },
    { name: "left-top-light", fill: "#69A6DB", points: [{ x: 0.22, y: 0.04 }, { x: 0.38, y: 0.20 }, { x: 0.50, y: 0.04 }] },
    { name: "left-center", fill: "#1B72B8", points: [{ x: 0.02, y: 0.32 }, { x: 0.50, y: 0.32 }, { x: 0.50, y: 0.98 }, { x: 0.30, y: 0.58 }] },
    { name: "left-deep", fill: "#084A82", points: [{ x: 0.02, y: 0.32 }, { x: 0.30, y: 0.58 }, { x: 0.50, y: 0.98 }, { x: 0.18, y: 0.50 }] },
    { name: "right-top-cap", fill: "#EF6515", points: [{ x: 0.50, y: 0.04 }, { x: 0.78, y: 0.04 }, { x: 0.98, y: 0.32 }, { x: 0.50, y: 0.32 }] },
    { name: "right-top-light", fill: "#FF9B3D", points: [{ x: 0.50, y: 0.04 }, { x: 0.64, y: 0.20 }, { x: 0.78, y: 0.04 }] },
    { name: "right-center", fill: "#F36F12", points: [{ x: 0.50, y: 0.32 }, { x: 0.98, y: 0.32 }, { x: 0.70, y: 0.58 }, { x: 0.50, y: 0.98 }] },
    { name: "right-deep", fill: "#D94B00", points: [{ x: 0.98, y: 0.32 }, { x: 0.82, y: 0.50 }, { x: 0.50, y: 0.98 }, { x: 0.70, y: 0.58 }] }
  ];
  for (const facet of facets) {
    shapes.push({
      id: `${prefix}-native-scanner-gem-${facet.name}`,
      type: "freeform",
      box: b,
      points: facet.points,
      style: {
        fill: facet.fill,
        stroke: "#FFFFFF",
        strokeWidthPt: 1.0
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "review-risk-gate-flow-native-scanner-gem-facet",
        layerSourceId,
        facet: facet.name,
        ...reviewRiskGateNativeComponentMetadata(layerSourceId, "scanner-engine", "gem-facet")
      }
    });
  }
  const beamY = b.y + b.h * 0.45;
  shapes.push({
    id: `${prefix}-native-scanner-beam`,
    type: "line",
    box: lineBox({ x: Math.max(0, b.x - b.w * 0.55), y: beamY }, { x: b.x + b.w * 0.86, y: beamY }),
    style: { stroke: "#2D78B9", strokeWidthPt: 7.0, connectorType: "straight" },
    source: { editable: true, nativeRebuild: true, detector: "review-risk-gate-flow-native-scanner-beam", layerSourceId, ...reviewRiskGateNativeComponentMetadata(layerSourceId, "scanner-engine", "beam") }
  });
  const glowBox = {
    x: round(b.x + b.w * 0.42),
    y: round(b.y + b.h * 0.38),
    w: round(b.w * 0.25),
    h: round(b.h * 0.14)
  };
  shapes.push({
    id: `${prefix}-native-scanner-glow`,
    type: "rect",
    box: glowBox,
    style: { fill: "#FFFFFF", stroke: "none", strokeWidthPt: 0, opacity: 0.72 },
    source: { editable: true, nativeRebuild: true, detector: "review-risk-gate-flow-native-scanner-glow", layerSourceId, ...reviewRiskGateNativeComponentMetadata(layerSourceId, "scanner-engine", "glow") }
  });
  const markColor = "#EAF7FF";
  const markStroke = Math.max(1.6, b.w * 0.012);
  const mark = (name, from, to) => ({
    id: `${prefix}-native-scanner-mark-${name}`,
    type: "line",
    box: lineBox({ x: round(b.x + b.w * from.x), y: round(b.y + b.h * from.y) }, { x: round(b.x + b.w * to.x), y: round(b.y + b.h * to.y) }),
    style: { stroke: markColor, strokeWidthPt: markStroke, connectorType: "straight" },
    source: { editable: true, nativeRebuild: true, detector: "review-risk-gate-flow-native-scanner-mark", layerSourceId, mark: name, ...reviewRiskGateNativeComponentMetadata(layerSourceId, "scanner-engine", "scan-mark") }
  });
  shapes.push(
    mark("top-left-h", { x: 0.36, y: 0.37 }, { x: 0.43, y: 0.37 }),
    mark("top-left-v", { x: 0.36, y: 0.37 }, { x: 0.36, y: 0.45 }),
    mark("top-right-h", { x: 0.64, y: 0.37 }, { x: 0.57, y: 0.37 }),
    mark("top-right-v", { x: 0.64, y: 0.37 }, { x: 0.64, y: 0.45 }),
    mark("bottom-left-h", { x: 0.36, y: 0.57 }, { x: 0.43, y: 0.57 }),
    mark("bottom-left-v", { x: 0.36, y: 0.57 }, { x: 0.36, y: 0.49 }),
    mark("bottom-right-h", { x: 0.64, y: 0.57 }, { x: 0.57, y: 0.57 }),
    mark("bottom-right-v", { x: 0.64, y: 0.57 }, { x: 0.64, y: 0.49 })
  );
  return shapes;
}

function reviewRiskGatePrdShapes(prd, prefix, layerSourceId) {
  const shapes = [];
  shapes.push({
    id: `${prefix}-native-prd-card`,
    type: "roundRect",
    box: prd.box,
    style: {
      fill: "#D9EFFB",
      stroke: "#2B78B8",
      strokeWidthPt: 1.8,
      radiusRatio: 0.04
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "review-risk-gate-flow-native-prd-card",
      layerSourceId,
      ...reviewRiskGateNativeComponentMetadata(layerSourceId, "prd", "card")
    }
  });
  shapes.push({
    id: `${prefix}-native-prd-header`,
    type: "rect",
    box: prd.header,
    style: { fill: "#2D78B9", stroke: "none", strokeWidthPt: 0 },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "review-risk-gate-flow-native-prd-header",
      layerSourceId,
      ...reviewRiskGateNativeComponentMetadata(layerSourceId, "prd", "header")
    }
  });
  for (let index = 0; index < prd.rows.length; index += 1) {
    const row = prd.rows[index];
    shapes.push({
      id: `${prefix}-native-prd-section-${index}`,
      type: "rect",
      box: row.iconBand,
      style: { fill: "#8FD0F3", stroke: "#FFFFFF", strokeWidthPt: 0.8 },
      source: {
        editable: true,
        nativeRebuild: true,
          detector: "review-risk-gate-flow-native-prd-section",
          layerSourceId,
          rowIndex: index,
          ...reviewRiskGateNativeComponentMetadata(layerSourceId, "prd", "section")
      }
    });
    for (let lineIndex = 0; lineIndex < row.lines.length; lineIndex += 1) {
      shapes.push({
        id: `${prefix}-native-prd-line-${index}-${lineIndex}`,
        type: "rect",
        box: row.lines[lineIndex],
        style: { fill: "#2D78B9", stroke: "none", strokeWidthPt: 0 },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "review-risk-gate-flow-native-prd-line",
          layerSourceId,
          rowIndex: index,
          ...reviewRiskGateNativeComponentMetadata(layerSourceId, "prd", "line")
        }
      });
    }
  }
  return shapes;
}

function shouldObjectifyReviewRiskGateFlow(image, textBoxes = []) {
  const box = image?.box || {};
  if (!isReviewRiskGateCandidateImage(image)) return false;
  if (!box.w || !box.h || box.w < 760 || box.h < 280) return false;
  const inside = (textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, DEFAULT_SLIDE, 12, 12)))
    .map((item) => ({ ...item, normalizedText: normalizeReviewRiskLabel(item.text) }));
  return Boolean(findReviewRiskRoleBox(inside, "prd")
    && findReviewRiskRoleBox(inside, "scanner")
    && findReviewRiskRoleBox(inside, "approved")
    && findReviewRiskRoleBox(inside, "risk"));
}

function shouldPreserveReviewRiskGateFlowAsMinimumUnit(images = [], textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = normalizeCjkText((textBoxes || []).map((item) => item?.text || "").join(" "));
  if (!/(?:Skill4|Skill 4|智能评审|SmartReview|Smart Review)/i.test(labels)) return false;
  const hasRiskGateStructure = /(?:scannerengine|PRD评审Skill|评审Skill)/i.test(labels)
    && /(?:ApprovedAsset|通过项|已通过项)/i.test(labels)
    && /(?:RiskProblemPool|风险问题池|逻辑矛盾|异常路径缺失|操作体验阻塞)/i.test(labels)
    && /(?:PRD|DraftDocument|需求文档|交付文档)/i.test(labels);
  if (!hasRiskGateStructure) return false;
  const candidates = (images || []).filter((image) =>
    image?.source?.detector === "product-illustration-segment-crop"
    || isReviewRiskGateCandidateImage(image)
  );
  const areaRatio = candidates.reduce((sum, image) => sum + Number(image.box?.w || 0) * Number(image.box?.h || 0), 0)
    / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  return candidates.length >= 1 && areaRatio > 0.25;
}

function isReviewRiskGateCandidateImage(image) {
  const detector = image?.source?.detector || image?.source?.layer?.detector || "";
  if (detector === "foreground-graphic-underlay-crop") return true;
  if (detector !== "foreground-graphic-crop") return false;
  const layer = image?.source?.layer || {};
  const plan = image?.source?.reconstructionPlan || {};
  return layer.layerType === "diagram-zone"
    || layer.recommendedAction === "split-native-with-residual-crop"
    || plan.strategy === "split-native-with-residual-crop";
}

function inferSegmentedReviewRiskGateFlow(images = [], textBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  const segments = (images || [])
    .filter((image) => image?.source?.detector === "product-illustration-segment-crop" && image?.box)
    .sort((a, b) => a.box.x - b.box.x);
  if (segments.length < 3) return null;
  const roleBoxes = inferReviewRiskRoleBoxes(textBoxes, {
    allowSmartReviewAliases: options.allowSmartReviewAliases === true
  });
  const { prd, approved, risk } = roleBoxes;
  if (!roleBoxes.prd || !roleBoxes.scanner || !roleBoxes.approved || !roleBoxes.risk) return null;
  const union = segments.map((item) => item.box).reduce((acc, box) => (acc ? unionPtBox(acc, box) : { ...box }), null);
  if (!union || union.w < 700 || union.h < 250) return null;
  if (!boxCenterInside(prd, expandPtBox(segments[0].box, slideSize, 18, 18))) return null;
  if (!segments.some((item) => boxCenterInside(approved, expandPtBox(item.box, slideSize, 18, 18)))) return null;
  if (!segments.some((item) => boxCenterInside(risk, expandPtBox(item.box, slideSize, 18, 18)))) return null;

  const virtualImage = {
    id: "review-risk-gate-segmented",
    box: union,
    source: { detector: "product-illustration-segment-crop" }
  };
  const flow = inferReviewRiskGateFlow(virtualImage, textBoxes, slideSize, {
    allowSmartReviewAliases: options.allowSmartReviewAliases === true
  });
  if (!flow) return null;
  const gemCenterX = flow.gemBox.x + flow.gemBox.w / 2;
  const preservedImages = segments.filter((image) => {
    const centerX = image.box.x + image.box.w / 2;
    return centerX > gemCenterX - flow.gemBox.w * 0.65 && centerX < gemCenterX + flow.gemBox.w * 0.65;
  });
  const objectifiedImages = segments.filter((image) => !preservedImages.includes(image));
  if (objectifiedImages.length < 2 || preservedImages.length === 0) return null;
  return {
    ...flow,
    id: "review-risk-gate-segmented",
    layerSourceId: "review-risk-gate-segmented",
    residualCrops: [],
    objectifiedImages,
    preservedImages
  };
}

function inferReviewRiskGateFlow(image, textBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  const box = image.box;
  const roleBoxes = inferReviewRiskRoleBoxes((textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, slideSize, 12, 12))), {
    allowSmartReviewAliases: options.allowSmartReviewAliases === true
  });
  const { prd, scanner, approved, risk } = roleBoxes;
  if (!prd || !scanner || !approved || !risk) return null;

  const compactEnglishLayout = normalizeReviewRiskLabel(roleBoxes.prdLabel) === "prd"
    && normalizeReviewRiskLabel(roleBoxes.scannerLabel) === "scannerengine"
    && normalizeReviewRiskLabel(roleBoxes.approvedLabel) === "approvedasset"
    && normalizeReviewRiskLabel(roleBoxes.riskLabel) === "riskproblempool";
  const approvedBox = expandPtBox(compactEnglishLayout ? {
    x: approved.x - 45,
    y: approved.y - 13,
    w: 202,
    h: 116
  } : {
    x: approved.x - 48,
    y: approved.y - 24,
    w: Math.max(190, approved.w + 94),
    h: 116
  }, slideSize, 0, 0);
  const riskBox = expandPtBox(compactEnglishLayout ? {
    x: risk.x - 45,
    y: risk.y - 12,
    w: 202,
    h: 132
  } : {
    x: risk.x - 46,
    y: risk.y - 24,
    w: Math.max(200, risk.w + 76),
    h: 128
  }, slideSize, 0, 0);
  const gemBox = expandPtBox(compactEnglishLayout ? {
    x: scanner.x - 14,
    y: scanner.y + 36,
    w: 174,
    h: 162
  } : {
    x: scanner.x - 52,
    y: scanner.y + 26,
    w: box.w * 0.22,
    h: box.h * 0.54
  }, slideSize, 0, 0);
  const prdBox = expandPtBox(compactEnglishLayout ? {
    x: prd.x - 35,
    y: prd.y - 11,
    w: 140,
    h: 184
  } : {
    x: box.x,
    y: Math.max(box.y + box.h * 0.13, prd.y - 22),
    w: Math.max(220, box.w * 0.27),
    h: box.h * 0.60
  }, slideSize, 0, 0);
  const gemRight = {
    x: gemBox.x + gemBox.w + 2,
    y: gemBox.y + gemBox.h * (compactEnglishLayout ? 0.43 : 0.45)
  };
  const prdRight = { x: prdBox.x + prdBox.w, y: gemRight.y + (compactEnglishLayout ? 6 : 8) };
  const branchX = approvedBox.x - 96;
  const approvedY = approvedBox.y + approvedBox.h * 0.48;
  const riskY = riskBox.y + riskBox.h * 0.40;
  const prdNative = reviewRiskGatePrdLayout(prdBox, slideSize);
  return {
    gemBox,
    prd: prdNative,
    residualCrops: [],
    cards: [
      {
        label: roleBoxes.approvedLabel || "Approved Asset",
        box: approvedBox,
        panel: expandPtBox({ x: approvedBox.x + 18, y: approvedBox.y + 54, w: approvedBox.w - 34, h: approvedBox.h - 68 }, slideSize, 0, 0),
        fill: "#39A760",
        stroke: "#168A45",
        panelFill: "#62BF82",
        iconType: "ellipse",
        icon: expandPtBox({ x: approvedBox.x + 18, y: approvedBox.y + 17, w: 30, h: 30 }, slideSize, 0, 0),
        iconFill: "#0EAC5D"
      },
      {
        label: roleBoxes.riskLabel || "Risk ProblemPool",
        box: riskBox,
        panel: expandPtBox({ x: riskBox.x + 28, y: riskBox.y + 52, w: riskBox.w - 52, h: riskBox.h - 66 }, slideSize, 0, 0),
        fill: "#F35A03",
        stroke: "#B73700",
        panelFill: "#FF7A12",
        iconType: "triangle",
        icon: expandPtBox({ x: riskBox.x + 20, y: riskBox.y + 20, w: 32, h: 32 }, slideSize, 0, 0),
        iconFill: "#E53F00"
      }
    ],
    connectors: [
      { box: lineBox(prdRight, { x: gemBox.x - 8, y: prdRight.y }), stroke: "#2D78B9", strokeWidthPt: 8 },
      { box: lineBox(gemRight, { x: branchX, y: gemRight.y }), stroke: "#31A85A", strokeWidthPt: 8 },
      { box: lineBox({ x: branchX, y: gemRight.y }, { x: branchX, y: approvedY }), stroke: "#31A85A", strokeWidthPt: 8 },
      { box: lineBox({ x: branchX, y: approvedY }, { x: approvedBox.x - 6, y: approvedY }), stroke: "#31A85A", strokeWidthPt: 8 },
      { box: lineBox({ x: gemRight.x, y: gemRight.y + (compactEnglishLayout ? 20 : 24) }, { x: branchX + 22, y: gemRight.y + (compactEnglishLayout ? 20 : 24) }), stroke: "#F07105", strokeWidthPt: 8 },
      { box: lineBox({ x: branchX + 22, y: gemRight.y + (compactEnglishLayout ? 20 : 24) }, { x: branchX + 22, y: riskY - 26 }), stroke: "#F07105", strokeWidthPt: 8 },
      { box: lineBox({ x: branchX + 22, y: riskY - 26 }, { x: riskBox.x - 8, y: riskY }), stroke: "#F07105", strokeWidthPt: 8, endArrow: "triangle", jagged: true }
    ].filter((connector) => Math.abs(connector.box.w) + Math.abs(connector.box.h) > 8)
  };
}

function inferReviewRiskRoleBoxes(textBoxes = [], options = {}) {
  const candidates = (textBoxes || [])
    .filter((item) => item?.box)
    .map((item) => ({
      ...item,
      normalizedText: normalizeReviewRiskLabel(item.text)
    }));
  const prdItem = findReviewRiskRoleItem(candidates, "prd", options);
  const scannerItem = findReviewRiskRoleItem(candidates, "scanner", options);
  const approvedItem = findReviewRiskRoleItem(candidates, "approved", options);
  const riskItem = findReviewRiskRoleItem(candidates, "risk", options);
  return {
    prd: prdItem?.box || null,
    prdLabel: prdItem?.text || null,
    scanner: scannerItem?.box || null,
    scannerLabel: scannerItem?.text || null,
    approved: approvedItem?.box || null,
    approvedLabel: approvedItem?.text || null,
    risk: riskItem?.box || null,
    riskLabel: riskItem?.text || null
  };
}

function findReviewRiskRoleBox(textBoxes = [], role, options = {}) {
  return findReviewRiskRoleItem(textBoxes, role, options)?.box || null;
}

function findReviewRiskRoleItem(textBoxes = [], role, options = {}) {
  const allowSmartReviewAliases = options.allowSmartReviewAliases === true;
  const predicates = {
    prd: (text) => text === "prd" || (allowSmartReviewAliases && /draftdocument|需求文档|交付文档/.test(text)),
    scanner: (text) => /scannerengine/.test(text) || (allowSmartReviewAliases && /prd评审skill|评审skill/.test(text)),
    approved: (text) => /approvedasset/.test(text) || (allowSmartReviewAliases && /通过项|已通过项/.test(text)),
    risk: (text) => /riskproblempool/.test(text) || (allowSmartReviewAliases && /风险问题池|逻辑矛盾|异常路径缺失|操作体验阻塞/.test(text))
  };
  const predicate = predicates[role];
  if (!predicate) return null;
  return (textBoxes || []).find((item) => predicate(item.normalizedText || normalizeReviewRiskLabel(item.text))) || null;
}

function normalizeReviewRiskLabel(value = "") {
  return String(value || "")
    .replace(/[()[\]（）【】"'“”‘’：:；;，,\s]/g, "")
    .toLowerCase();
}

function reviewRiskGatePrdLayout(box, slideSize = DEFAULT_SLIDE) {
  const card = expandPtBox(box, slideSize, 0, 0);
  const headerH = Math.max(35, card.h * 0.22);
  const rowTop = card.y + headerH + 10;
  const rowGap = 6;
  const rowH = Math.max(36, (card.h - headerH - 24) / 3);
  const rows = [];
  for (let index = 0; index < 3; index += 1) {
    const y = rowTop + index * (rowH + rowGap);
    const iconBand = {
      x: card.x + 8,
      y,
      w: Math.max(34, card.w * 0.22),
      h: Math.min(rowH, card.y + card.h - y - 8)
    };
    const lineX = iconBand.x + iconBand.w + 12;
    const lineW = Math.max(38, card.x + card.w - lineX - 14);
    rows.push({
      iconBand,
      lines: [
        { x: lineX, y: y + rowH * 0.22, w: lineW * 0.62, h: 4.5 },
        { x: lineX, y: y + rowH * 0.43, w: lineW, h: 3.8 },
        { x: lineX, y: y + rowH * 0.62, w: lineW * 0.82, h: 3.8 }
      ].map((line) => expandPtBox(line, slideSize, 0, 0))
    });
  }
  return {
    box: card,
    header: expandPtBox({ x: card.x, y: card.y, w: card.w, h: headerH }, slideSize, 0, 0),
    rows
  };
}

module.exports = {createReviewRiskGateFlowShapes, inferReviewRiskGateFlow, inferReviewRiskRoleBoxes, findReviewRiskRoleItem, normalizeReviewRiskLabel, reviewRiskGatePrdLayout, inferSegmentedReviewRiskGateFlow, inferSmartReviewPartialFlow, smartReviewDocumentIconBox, isReviewRiskGateCandidateImage, reviewRiskGateFlowPrimitiveShapes, reviewRiskGateNativeComponentMetadata, reviewRiskGatePrdShapes, reviewRiskGateScannerGemShapes, shouldObjectifyReviewRiskGateFlow, findReviewRiskRoleBox, shouldPreserveReviewRiskGateFlowAsMinimumUnit, smartReviewPartialPrimitiveShapes};
