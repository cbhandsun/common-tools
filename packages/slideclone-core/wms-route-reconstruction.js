"use strict";
const path = require("node:path");
const {boxCenterInside, centerOfBox, ptToPxBox, round, expandPtBox, median, normalizeHex} = require("./raster-native-detection");
const {cropPng, writePng} = require("./png");
const {ensureDir, isStructuredWmsRouteChainNativeCandidate, resolveAssetPathForIr, eraseMasks} = require("./residual-primitive-erasure");
const {makeEdgeConnectedBackgroundTransparent} = require("./edge-background-alpha");
const {roundedBox} = require("./prd-generation-shapes");
const {splitResidualLayerSource} = require("./structured-residual-splitting");
const {safeComponentToken} = require("./diagram-residual-crops");
const {workflowWmsRouteOutputBannerBox} = require("./workflow-wms-route-chain-scope");
const {normalizeMatrixLabel, sameDiagramLabel, nearestNumericIndex} = require("./diagram-label-matching");
const DEFAULT_SLIDE = {widthPt: 960, heightPt: 540};

function createWmsRouteChainShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null, options = {}) {
  const shapes = [];
  for (const image of images || []) {
    if (!shouldObjectifyWmsRouteChain(image, textBoxes)) continue;
    // This is an intentional fidelity escape hatch for a pictorial route
    // illustration. Its embedded labels are retained inside the crop, so no
    // editable text may be placed above it (otherwise glyph ghosting occurs).
    const preserveWholeFidelityCrop = isWmsTopRouteCrop(image, textBoxes)
      && (options.forcePreserveWholeFidelityCrop === true
        || shouldAutoPreserveWmsRouteWholeFidelityCrop(image, textBoxes));
    const preserveWmsCrop = preserveWholeFidelityCrop || shouldPreserveWmsRouteCrop(image, textBoxes);
    let localShapes = preserveWmsCrop ? [] : inferWmsRouteChainShapes(image, textBoxes);
    if (localShapes.length === 0 && !preserveWmsCrop) continue;
    const candidateTextBoxes = preserveWholeFidelityCrop
      ? []
      : wmsRouteChainNativeTextBoxes(image, textBoxes);
    const erasedTextBoxes = preserveWholeFidelityCrop
      ? []
      : maybeEraseWmsRouteChainText({
        image,
        textBoxes: candidateTextBoxes,
        sourceImage,
        slideSize,
        irDir
      });
    let nativeTextBoxes = erasedTextBoxes.length > 0
      ? erasedTextBoxes
      : candidateTextBoxes.map((textBox) => ({
        ...textBox,
        source: {
          ...(textBox.source || {}),
          textErasedFromCrop: false,
          overlayVisibility: "visible"
        }
      }));
    const minimumUnitCrops = preserveWholeFidelityCrop
      ? []
      : createWmsRouteMinimumUnitCrops({
        image,
        textBoxes,
        sourceImage,
        slideSize,
        irDir
      });
    const hasDocumentCrop = minimumUnitCrops.some((crop) => crop?.source?.detector === "wms-route-chain-document-icon-residual-crop");
    const hasShieldCrops = minimumUnitCrops.filter((crop) => crop?.source?.detector === "wms-route-chain-icon-residual-crop").length >= 3;
    if (hasDocumentCrop && hasShieldCrops) {
      const pictorialDetectors = new Set([
        "wms-route-chain-native-document",
        "wms-route-chain-native-ai-glow",
        "wms-route-chain-native-ai-base-shadow",
        "wms-route-chain-native-ai-base",
        "wms-route-chain-native-ai-shield",
        "wms-route-chain-native-ai-check",
        "wms-route-chain-native-ai-checkmark"
      ]);
      localShapes = localShapes.filter((shape) => !pictorialDetectors.has(shape?.source?.detector));
      nativeTextBoxes = nativeTextBoxes.filter((textBox) => ![
        "ai-shield-label",
        "version-chip-label"
      ].includes(textBox?.source?.role));
    }
    const dropResidual = preserveWmsCrop
      ? false
      : shouldDropWmsRouteChainResidual(localShapes, nativeTextBoxes, minimumUnitCrops);
    image.source = {
      ...(image.source || {}),
      wmsRouteChainObjectified: true,
      wmsRouteChainTopIllustrationPreserved: preserveWmsCrop && isWmsTopRouteCrop(image, textBoxes),
      wmsRouteChainWholeFidelityCrop: preserveWholeFidelityCrop,
      wmsRouteChainValuePanelPreserved: preserveWmsCrop && isWmsValuePanelCrop(image, textBoxes),
      skipVisualAtomRebuild: preserveWmsCrop ? true : image.source?.skipVisualAtomRebuild,
      expressionForm: preserveWmsCrop ? "complex-diagram" : image.source?.expressionForm,
      expressionSubtype: preserveWmsCrop ? "wms-route-chain-illustration" : image.source?.expressionSubtype,
      recommendedAction: preserveWholeFidelityCrop
        ? "keep-local-crop"
        : (preserveWmsCrop ? "keep-local-crop-and-overlay-external-text-only" : image.source?.recommendedAction),
      visualAtomOverlayOnly: dropResidual ? false : true,
      dropErasedResidualAfterNativeRebuild: dropResidual
        ? true
        : image.source?.dropErasedResidualAfterNativeRebuild,
      objectifiedWmsRouteChainShapes: localShapes.length,
      wmsRouteChainTextObjectified: nativeTextBoxes.length > 0,
      wmsRouteChainNativeTextBoxes: nativeTextBoxes,
      objectifiedWmsRouteChainTextBoxes: nativeTextBoxes.length,
      wmsRouteChainMinimumUnitCrops: minimumUnitCrops,
      nonEditableReason: preserveWholeFidelityCrop
        ? `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; high-fidelity WMS route illustration retained as one protected pictorial crop with embedded labels`
        : (preserveWmsCrop
        ? `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; complex WMS route/value illustration preserved as a local crop with OCR-backed editable labels`
        : `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; WMS route chain rebuilt as native route, gate, value-card primitives, and OCR-backed editable labels over fidelity crop`)
    };
    shapes.push(...annotateWmsRouteComponentShapes(image, localShapes));
  }
  return shapes;
}

function createWmsRouteMinimumUnitCrops({ image = {}, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null } = {}) {
  if (!sourceImage || !irDir || !isStructuredWmsRouteChainNativeCandidate(image)) return [];
  const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
  if (!assetFile) return [];
  const routeLabels = [
    ...(textBoxes || []).filter((textBox) => boxCenterInside(textBox?.box, image.box)),
    ...wmsRouteChainSemanticTextBoxes(image)
  ]
    .filter((textBox) => /Tollgate/i.test(String(textBox?.text || "")))
    .filter((textBox, index, items) => !items.slice(0, index).some((existing) => sameDiagramLabel(existing, textBox)))
    .sort((a, b) => centerOfBox(a.box).x - centerOfBox(b.box).x)
    .slice(0, 3);
  if (routeLabels.length !== 3) return [];
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  const box = image.box || {};
  const shieldW = Number(box.w || 0) * 0.07;
  const shieldH = Number(box.h || 0) * 0.34;
  ensureDir(outDir);
  const documentBox = roundedBox({
    x: Number(box.x || 0) + Number(box.w || 0) * 0.118,
    y: Number(box.y || 0) + Number(box.h || 0) * 0.335,
    w: Number(box.w || 0) * 0.102,
    h: Number(box.h || 0) * 0.305
  });
  const documentFile = path.join(outDir, `${base}-document.png`);
  writePng(documentFile, cropPng(sourceImage, ptToPxBox(documentBox, sourceImage, slideSize, 0)));
  const documentCrop = {
    id: `${image.id || "wms-route-chain"}-document-crop`,
    type: "fidelity-crop",
    assetPath: path.relative(irDir, documentFile).replace(/\\/g, "/"),
    box: documentBox,
    source: {
      ...(image.source || {}),
      layer: splitResidualLayerSource(image.source?.layer, documentBox, "wms-route-chain-document-icon-residual-crop"),
      editable: false,
      detector: "wms-route-chain-document-icon-residual-crop",
      parentDetector: image.source?.detector || null,
      parentImageId: image.id || null,
      expressionForm: "icon-or-illustration",
      expressionSubtype: "document-icon",
      recommendedAction: "keep-local-crop",
      intentionalMinimumUnitCrop: true,
      protectedMinimumUnit: true,
      residualSplit: true,
      residualSplitMode: "wms-document-icon",
      residualSplitIndex: 0,
      residualSplitCount: 4,
      nonEditableReason: "high-fidelity WMS document icon retained after native route reconstruction",
      ...wmsRouteNativeComponentMetadata(image, "inbound", "document-icon")
    }
  };
  const shieldCrops = routeLabels.map((label, index) => {
    const center = centerOfBox(label.box);
    // Keep the complete shield/pedestal but exclude the callout tail and caption.
    const cropBox = roundedBox({
      x: center.x - shieldW / 2 - 6,
      y: Number(box.y || 0) + Number(box.h || 0) * 0.35 - 5,
      w: shieldW + 12,
      h: shieldH + 10
    });
    const file = path.join(outDir, `${base}-shield-${String(index + 1).padStart(2, "0")}.png`);
    const shieldCrop = cropPng(sourceImage, ptToPxBox(cropBox, sourceImage, slideSize, 0));
    writePng(file, makeEdgeConnectedBackgroundTransparent(shieldCrop, {
      transparentDistance: 18,
      maximumDistance: 38
    }));
    return {
      id: `${image.id || "wms-route-chain"}-shield-crop-${index}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir, file).replace(/\\/g, "/"),
      box: cropBox,
      source: {
        ...(image.source || {}),
        layer: splitResidualLayerSource(image.source?.layer, cropBox, "wms-route-chain-icon-residual-crop"),
        editable: false,
        detector: "wms-route-chain-icon-residual-crop",
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        expressionForm: "icon-or-illustration",
        expressionSubtype: "icon",
        recommendedAction: "keep-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        residualSplit: true,
        residualSplitMode: "wms-shield-icon",
        residualSplitIndex: index + 1,
        residualSplitCount: 4,
        nonEditableReason: "high-fidelity WMS shield icon retained after native route reconstruction",
        ...wmsRouteNativeComponentMetadata(image, `gate-${index}`, "shield-icon")
      }
    };
  });
  return [documentCrop, ...shieldCrops];
}

function shouldDropWmsRouteChainResidual(shapes = [], nativeTextBoxes = [], minimumUnitCrops = []) {
  const detectors = new Set((shapes || []).map((shape) => shape?.source?.detector).filter(Boolean));
  const cropDetectors = new Set((minimumUnitCrops || []).map((crop) => crop?.source?.detector).filter(Boolean));
  const roles = new Set((nativeTextBoxes || []).map((textBox) => textBox?.source?.role).filter(Boolean));
  const valueCardCount = (shapes || []).filter((shape) => shape?.source?.detector === "wms-route-chain-native-value-card").length;
  const hasDocumentVisual = detectors.has("wms-route-chain-native-document")
    || cropDetectors.has("wms-route-chain-document-icon-residual-crop");
  const hasShieldVisuals = (shapes || []).filter((shape) => shape?.source?.detector === "wms-route-chain-native-ai-shield").length >= 3
    || (minimumUnitCrops || []).filter((crop) => crop?.source?.detector === "wms-route-chain-icon-residual-crop").length >= 3;
  const hasShieldLabels = roles.has("ai-shield-label")
    || (minimumUnitCrops || []).filter((crop) => crop?.source?.detector === "wms-route-chain-icon-residual-crop").length >= 3;
  const topRouteReady = detectors.has("wms-route-chain-native-backplate")
    && detectors.has("wms-route-chain-native-road")
    && hasDocumentVisual
    && detectors.has("wms-route-chain-native-callout-tail")
    && hasShieldVisuals
    && (shapes || []).filter((shape) => shape?.source?.detector === "wms-route-chain-native-intercept-pill").length >= 3
    && roles.has("route-node-label")
    && roles.has("gate-pill-label")
    && hasShieldLabels
    && nativeTextBoxes.length >= 6;
  if (topRouteReady) return true;
  return valueCardCount >= 3
    && detectors.has("wms-route-chain-native-output-banner")
    && roles.has("value-card-title")
    && roles.has("value-card-body")
    && roles.has("output-banner-label")
    && nativeTextBoxes.length >= 10;
}

function shouldObjectifyWmsRouteChain(image, textBoxes = []) {
  const source = image?.source || {};
  const box = image?.box || {};
  if (source.detector !== "wms-chain-underlay-crop") return false;
  if (!box.w || !box.h || Number(box.w) < 600) return false;
  const internal = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box));
  const texts = internal.map((item) => String(item.text || ""));
  const hasTopRoute = texts.some((text) => /WMS\s*Inbound/i.test(text))
    && texts.filter((text) => /Tollgate/i.test(text)).length >= 2;
  const hasValueCards = texts.some((text) => /挑战/.test(text))
    && texts.some((text) => /AI介入/.test(text))
    && texts.some((text) => /价值落地/.test(text));
  if (hasTopRoute || hasValueCards) return true;
  return source.expressionSubtype === "route-chain-diagram"
    || source.componentTemplateGroupApplied === true
    || source.wmsRouteChainCandidate === true;
}

function shouldPreserveWmsRouteCrop(image, textBoxes = []) {
  return isWmsTopRouteCrop(image, textBoxes) && !isStructuredWmsRouteChainNativeCandidate(image);
}

function shouldAutoPreserveWmsRouteWholeFidelityCrop(image, textBoxes = []) {
  if (!isWmsTopRouteCrop(image, textBoxes) || !isStructuredWmsRouteChainNativeCandidate(image)) return false;
  // The WMS route is structurally simple, but its shields, glow, speech
  // balloons, and road texture form one authored illustration. Rebuilding
  // only the road and labels leaves a visibly weaker hybrid, so this semantic
  // top-route unit remains intact while the surrounding value cards stay native.
  return true;
}

function isWmsTopRouteCrop(image, textBoxes = []) {
  const source = image?.source || {};
  if (source.detector !== "wms-chain-underlay-crop") return false;
  const box = image?.box || {};
  if (!box.w || !box.h) return false;
  const internal = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box));
  const texts = internal.map((item) => String(item.text || ""));
  const tollgateCount = texts.filter((text) => /Tollgate/i.test(text)).length;
  const hasRoute = texts.some((text) => /WMS\s*Inbound/i.test(text)) && tollgateCount >= 2;
  const hasValueCards = texts.some((text) => /挑战/.test(text))
    && texts.some((text) => /AI介入/.test(text))
    && texts.some((text) => /价值落地/.test(text));
  return hasRoute && !hasValueCards;
}

function isWmsValuePanelCrop(image, textBoxes = []) {
  const source = image?.source || {};
  if (source.detector !== "wms-chain-underlay-crop") return false;
  const box = image?.box || {};
  if (!box.w || !box.h) return false;
  const internal = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box));
  const texts = internal.map((item) => String(item.text || ""));
  const hasValueCards = texts.some((text) => /挑战/.test(text))
    && texts.some((text) => /AI介入/.test(text))
    && texts.some((text) => /价值落地/.test(text));
  return hasValueCards;
}

function inferWmsRouteChainShapes(image, textBoxes = []) {
  const box = image?.box || {};
  const internal = [
    ...(textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box)),
    ...wmsRouteChainSemanticTextBoxes(image)
  ];
  const routeLabels = internal.filter((item) => /WMS\s*Inbound|Tollgate/i.test(String(item.text || "")))
    // OCR labels can also be repeated as semantic nodes. Layout must consume
    // each route anchor once, or later shield positions collapse onto node one.
    .filter((item, index, items) => !items.slice(0, index).some((existing) => sameDiagramLabel(existing, item)))
    .sort((a, b) => centerOfBox(a.box).x - centerOfBox(b.box).x);
  if (routeLabels.length >= 3) return inferWmsTopRouteShapes(image, internal, routeLabels);
  const valueLabels = ["挑战", "AI介入", "价值落地"]
    .map((label) => internal.find((item) => String(item.text || "").includes(label)))
    .filter(Boolean)
    .sort((a, b) => centerOfBox(a.box).x - centerOfBox(b.box).x);
  if (valueLabels.length >= 3) return inferWmsValueCardShapes(image, internal, valueLabels);
  return inferWmsRouteChainSkeletonShapes(image);
}

function wmsRouteChainSemanticTextBoxes(image = {}) {
  const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
    ? image.source.layer.diagramUnderstanding.nodes
    : [];
  return nodes
    .filter((node) => node?.box && String(node.text || "").trim())
    .map((node, index) => ({
      id: node.sourceTextBoxId || `${image.id || "wms-route-chain"}-semantic-node-${index}`,
      text: String(node.text || ""),
      box: node.box,
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "wms-route-chain-semantic-node",
        semanticNodeId: node.id || ""
      }
    }));
}

function inferWmsRouteChainSkeletonShapes(image) {
  const box = image?.box || {};
  if (!box.w || !box.h) return [];
  const isValuePanel = Number(box.y || 0) > 300 || Number(box.h || 0) < 205;
  return isValuePanel
    ? inferWmsValueCardSkeletonShapes(image)
    : inferWmsTopRouteSkeletonShapes(image);
}

function inferWmsTopRouteSkeletonShapes(image) {
  const box = image.box || {};
  const base = image.id || "wms-route-chain";
  const railY = round(Number(box.y || 0) + Number(box.h || 0) * 0.74);
  const nodeCenters = [0.12, 0.35, 0.58, 0.81].map((ratio) => round(Number(box.x || 0) + Number(box.w || 0) * ratio));
  const shapes = [{
    id: `${base}-native-skeleton-backplate`,
    type: "rect",
    box: roundedBox(box),
    // Sampled from the source canvas: the route zone is not a separate card.
    style: { fill: "#F5F9FA", stroke: "none", strokeWidthPt: 0 },
    source: wmsRouteShapeSource(image, "wms-route-chain-native-skeleton-backplate", { skeletonOnly: true })
  }];
  shapes.push(...wmsRouteRoadShapes(image, railY));
  shapes.push(...wmsRouteDocumentShapes(image));
  shapes.push({
    id: `${base}-native-skeleton-rail`,
    type: "line",
    box: {
      x: round(Number(box.x || 0) + Number(box.w || 0) * 0.08),
      y: railY,
      w: round(Number(box.w || 0) * 0.84),
      h: 0
    },
    style: { stroke: "#5BAAE4", strokeWidthPt: 2.6, connectorType: "straight", endArrow: "triangle" },
    source: wmsRouteShapeSource(image, "wms-route-chain-native-skeleton-rail", { skeletonOnly: true })
  });
  nodeCenters.forEach((cx, index) => {
    shapes.push({
      id: `${base}-native-skeleton-node-${index}`,
      type: index === 0 ? "roundRect" : "ellipse",
      box: {
        x: round(cx - (index === 0 ? 39 : 25)),
        y: round(railY - (index === 0 ? 13 : 17)),
        w: index === 0 ? 78 : 50,
        h: index === 0 ? 26 : 34
      },
      style: {
        fill: index === 0 ? "#F4FAFF" : "#FFFFFF",
        stroke: "#4DA3DE",
        strokeWidthPt: 1.2,
        radiusRatio: index === 0 ? 0.18 : undefined,
        shadow: { color: "#4DA3DE", alpha: 0.12, blurPt: 2.4, distancePt: 0.4, angleDeg: 90 }
      },
      source: wmsRouteShapeSource(image, "wms-route-chain-native-skeleton-node", { nodeIndex: index, skeletonOnly: true })
    });
  });
  return shapes;
}

function inferWmsValueCardSkeletonShapes(image) {
  const box = image.box || {};
  const base = image.id || "wms-route-chain";
  const cardGap = Number(box.w || 0) * 0.035;
  const cardW = (Number(box.w || 0) - cardGap * 2) / 3;
  const cardY = Number(box.y || 0) + Number(box.h || 0) * 0.10;
  const cardH = Number(box.h || 0) * 0.58;
  const shapes = [];
  for (let index = 0; index < 3; index += 1) {
    const x = Number(box.x || 0) + index * (cardW + cardGap);
    shapes.push({
      id: `${base}-native-skeleton-value-card-${index}`,
      type: "roundRect",
      box: roundedBox({ x, y: cardY, w: cardW, h: cardH }),
      style: {
        fill: index === 1 ? "#F4FAFF" : "#FFFFFF",
        stroke: index === 1 ? "#5BAAE4" : "#D7E4EE",
        strokeWidthPt: 1.2,
        radiusRatio: 0.06,
        shadow: { color: "#7892A8", alpha: 0.13, blurPt: 3, distancePt: 1, angleDeg: 90 }
      },
      source: wmsRouteShapeSource(image, "wms-route-chain-native-skeleton-value-card", { cardIndex: index, skeletonOnly: true })
    });
    if (index < 2) {
      shapes.push({
        id: `${base}-native-skeleton-value-route-${index}`,
        type: "line",
        box: {
          x: round(x + cardW + 8),
          y: round(cardY + cardH * 0.5),
          w: round(cardGap - 16),
          h: 0
        },
        style: { stroke: "#5BAAE4", strokeWidthPt: 2.2, connectorType: "straight", endArrow: "triangle" },
        source: wmsRouteShapeSource(image, "wms-route-chain-native-skeleton-value-route", { routeIndex: index, skeletonOnly: true })
      });
    }
  }
  shapes.push({
    id: `${base}-native-skeleton-output-banner`,
    type: "roundRect",
    box: roundedBox({
      x: Number(box.x || 0) + Number(box.w || 0) * 0.10,
      y: Number(box.y || 0) + Number(box.h || 0) * 0.76,
      w: Number(box.w || 0) * 0.80,
      h: Number(box.h || 0) * 0.16
    }),
    style: { fill: "#0E5E9C", stroke: "#0E5E9C", strokeWidthPt: 1, radiusRatio: 0.18 },
    source: wmsRouteShapeSource(image, "wms-route-chain-native-skeleton-output-banner", { skeletonOnly: true })
  });
  return shapes;
}

function inferWmsTopRouteShapes(image, internalTextBoxes, routeLabels) {
  const box = image.box;
  const base = image.id || "wms-route-chain";
  const centers = routeLabels.map((item) => centerOfBox(item.box));
  const railY = round(median(centers.map((item) => item.y)) - 2);
  const shapes = [{
    id: `${base}-native-backplate`,
    type: "rect",
    box,
    // Keep the native reconstruction flush with the source page background.
    style: { fill: "#F5F9FA", stroke: "none", strokeWidthPt: 0 },
    source: wmsRouteShapeSource(image, "wms-route-chain-native-backplate")
  }];
  shapes.push(...wmsRouteRoadShapes(image, railY));
  shapes.push(...wmsRouteDocumentShapes(image));
  shapes.push(...wmsRouteAiShieldClusterShapes(image, routeLabels));
  internalTextBoxes
    .filter((item) => /拦截成功/.test(String(item.text || "")))
    .sort((a, b) => centerOfBox(a.box).x - centerOfBox(b.box).x)
    .slice(0, 3)
    .forEach((label, index) => {
      shapes.push({
        id: `${base}-native-intercept-pill-${index}`,
        type: "roundRect",
        box: expandPtBox(label.box, DEFAULT_SLIDE, 10, 5),
        style: {
          fill: index === 0 ? "#EDF7FC" : "#E8F8EE",
          stroke: index === 0 ? "#8BB8D8" : "#69C58B",
          strokeWidthPt: 0.9,
          radiusRatio: 0.16,
          shadow: { color: index === 0 ? "#7E9EB5" : "#68A87F", alpha: 0.14, blurPt: 3, distancePt: 0.7, angleDeg: 90 }
        },
        source: wmsRouteShapeSource(image, "wms-route-chain-native-intercept-pill", { pillText: label.text, pillIndex: index })
      });
      shapes.push(...wmsRouteCalloutTailShapes(image, label, index));
    });
  return shapes;
}

function wmsRouteRoadShapes(image, railY) {
  const box = image.box;
  const base = image.id || "wms-route-chain";
  const roadY = round(railY - box.h * 0.16);
  const roadStart = round(box.x + box.w * 0.01);
  const roadW = round(box.w * 0.96);
  const shapes = [{
    id: `${base}-native-road`,
    type: "line",
    box: { x: roadStart, y: roadY, w: roadW, h: 0 },
    style: { stroke: "#A5AAB4", strokeWidthPt: 10.5, connectorType: "straight", endArrow: "triangle" },
    source: wmsRouteShapeSource(image, "wms-route-chain-native-road")
  }];
  for (let index = 0; index < 12; index += 1) {
    shapes.push({
      id: `${base}-native-road-dash-${index}`,
      type: "line",
      box: { x: round(roadStart + 20 + index * (roadW - 80) / 11), y: roadY, w: 13, h: 0 },
      style: { stroke: "#F4F7FA", strokeWidthPt: 1.7, connectorType: "straight" },
      source: wmsRouteShapeSource(image, "wms-route-chain-native-road-dash", { dashIndex: index })
    });
  }
  return shapes;
}

function wmsRouteCalloutTailShapes(image, label, index) {
  const base = image.id || "wms-route-chain";
  const bubble = expandPtBox(label.box, DEFAULT_SLIDE, 10, 5);
  const tailW = Math.max(18, Math.min(30, bubble.w * 0.14));
  const tailH = Math.max(11, Math.min(17, bubble.h * 0.7));
  const tailBox = {
    x: round(bubble.x + bubble.w * 0.48 - tailW / 2),
    y: round(bubble.y + bubble.h - 1),
    w: round(tailW),
    h: round(tailH)
  };
  return [{
    id: `${base}-native-callout-tail-${index}`,
    type: "freeform",
    box: tailBox,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.35, y: 1 }
    ],
    style: {
      fill: index === 0 ? "#EDF7FC" : "#E8F8EE",
      stroke: index === 0 ? "#8BB8D8" : "#69C58B",
      strokeWidthPt: 0.8
    },
    source: wmsRouteShapeSource(image, "wms-route-chain-native-callout-tail", { pillIndex: index })
  }];
}

function wmsRouteDocumentShapes(image) {
  const box = image.box;
  const base = image.id || "wms-route-chain";
  const doc = { x: round(box.x + box.w * 0.12), y: round(box.y + box.h * 0.36), w: round(box.w * 0.095), h: round(box.h * 0.33) };
  const arrowY = round(doc.y + doc.h * 0.5);
  return [
    {
      id: `${base}-native-motion-a`,
      type: "line",
      box: { x: round(doc.x - 70), y: arrowY - 10, w: 46, h: 0 },
      style: { stroke: "#66A9D7", strokeWidthPt: 2.2, connectorType: "straight" },
      source: wmsRouteShapeSource(image, "wms-route-chain-native-motion-line", { lineIndex: 0 })
    },
    {
      id: `${base}-native-motion-b`,
      type: "line",
      box: { x: round(doc.x - 70), y: arrowY + 12, w: 56, h: 0 },
      style: { stroke: "#66A9D7", strokeWidthPt: 2.2, connectorType: "straight" },
      source: wmsRouteShapeSource(image, "wms-route-chain-native-motion-line", { lineIndex: 1 })
    },
    {
      id: `${base}-native-document`,
      type: "document",
      box: doc,
      style: { fill: "#E9F5FF", stroke: "#2B8ED0", strokeWidthPt: 1.5, shadow: { color: "#2B8ED0", alpha: 0.12, blurPt: 3, distancePt: 0.5, angleDeg: 90 } },
      source: wmsRouteShapeSource(image, "wms-route-chain-native-document")
    },
    {
      id: `${base}-native-forward-arrow`,
      type: "rightArrow",
      box: { x: round(doc.x + doc.w + 18), y: round(arrowY - 12), w: 52, h: 24 },
      style: { fill: "#5BAAE4", stroke: "none", strokeWidthPt: 0 },
      source: wmsRouteShapeSource(image, "wms-route-chain-native-forward-arrow")
    }
  ];
}

function wmsRouteAiShieldClusterShapes(image, routeLabels) {
  const box = image.box;
  const base = image.id || "wms-route-chain";
  return routeLabels
    .filter((label) => /Tollgate/i.test(String(label.text || "")))
    .slice(0, 3)
    .flatMap((label, index) => {
      const center = centerOfBox(label.box);
      const shieldW = round(box.w * 0.07);
      const shieldH = round(box.h * 0.34);
      const shieldBox = { x: round(center.x - shieldW / 2), y: round(box.y + box.h * 0.31), w: shieldW, h: shieldH };
      const color = index === 0 ? "#2B8ED0" : "#38B96C";
      const pale = index === 0 ? "#E7F3FF" : "#E8FAF0";
      const baseBox = {
        x: round(center.x - shieldW * 0.58),
        y: round(shieldBox.y + shieldH * 0.80),
        w: round(shieldW * 1.16),
        h: round(shieldH * 0.22)
      };
      return [
        {
          id: `${base}-native-ai-glow-${index}`,
          type: "ellipse",
          box: expandPtBox(shieldBox, DEFAULT_SLIDE, 12, 8),
          style: { fill: pale, stroke: "none", strokeWidthPt: 0, opacity: 0.65 },
          source: wmsRouteShapeSource(image, "wms-route-chain-native-ai-glow", { shieldIndex: index })
        },
        {
          id: `${base}-native-ai-base-shadow-${index}`,
          type: "ellipse",
          box: expandPtBox(baseBox, DEFAULT_SLIDE, 7, 4),
          style: { fill: index === 0 ? "#2B8ED0" : "#38B96C", stroke: "none", strokeWidthPt: 0, opacity: 0.12 },
          source: wmsRouteShapeSource(image, "wms-route-chain-native-ai-base-shadow", { shieldIndex: index })
        },
        {
          id: `${base}-native-ai-base-${index}`,
          type: "ellipse",
          box: baseBox,
          style: { fill: index === 0 ? "#DCEEFF" : "#DCF8E7", stroke: color, strokeWidthPt: 1.4, opacity: 0.92 },
          source: wmsRouteShapeSource(image, "wms-route-chain-native-ai-base", { shieldIndex: index })
        },
        {
          id: `${base}-native-ai-shield-${index}`,
          type: "freeform",
          box: shieldBox,
          points: [
            { x: 0.5, y: 0 },
            { x: 0.9, y: 0.18 },
            { x: 0.82, y: 0.66 },
            { x: 0.5, y: 1 },
            { x: 0.18, y: 0.66 },
            { x: 0.1, y: 0.18 }
          ],
          style: { fill: pale, stroke: color, strokeWidthPt: 2.4, opacity: 0.96 },
          source: wmsRouteShapeSource(image, "wms-route-chain-native-ai-shield", { shieldIndex: index })
        },
        {
          id: `${base}-native-ai-check-${index}`,
          type: "ellipse",
          box: { x: round(shieldBox.x + shieldW * 0.68), y: round(shieldBox.y - shieldH * 0.03), w: round(shieldW * 0.42), h: round(shieldW * 0.42) },
          style: { fill: "#2DBB63", stroke: "#FFFFFF", strokeWidthPt: 1.2 },
          source: wmsRouteShapeSource(image, "wms-route-chain-native-ai-check", { shieldIndex: index })
        },
        {
          id: `${base}-native-ai-checkmark-${index}`,
          type: "freeform",
          box: { x: round(shieldBox.x + shieldW * 0.78), y: round(shieldBox.y + shieldW * 0.09), w: round(shieldW * 0.22), h: round(shieldW * 0.18) },
          points: [
            { x: 0, y: 0.52 },
            { x: 0.34, y: 0.9 },
            { x: 1, y: 0 }
          ],
          style: { fill: "none", stroke: "#FFFFFF", strokeWidthPt: 1.8 },
          source: wmsRouteShapeSource(image, "wms-route-chain-native-ai-checkmark", { shieldIndex: index })
        }
      ];
    });
}

function wmsRouteAiShieldTextBoxes(image, routeLabels = []) {
  const box = image?.box || {};
  return routeLabels
    .filter((label) => /Tollgate/i.test(String(label.text || "")))
    .slice(0, 3)
    .map((label, index) => {
      const center = centerOfBox(label.box);
      const shieldW = round(box.w * 0.07);
      const shieldH = round(box.h * 0.34);
      const shieldBox = { x: round(center.x - shieldW / 2), y: round(box.y + box.h * 0.31), w: shieldW, h: shieldH };
      const component = wmsRouteNativeComponentMetadata(image, `gate-${index}`, "label");
      return {
        id: `${image.id || "wms-route-chain"}-native-ai-label-${index}`,
        text: "AI",
        box: {
          x: round(shieldBox.x + shieldBox.w * 0.24),
          y: round(shieldBox.y + shieldBox.h * 0.30),
          w: round(shieldBox.w * 0.52),
          h: round(shieldBox.h * 0.28)
        },
        font: {
          family: "Microsoft YaHei",
          sizePt: Math.max(12, Math.min(24, round(shieldBox.w * 0.36))),
          color: index === 0 ? "#2B8ED0" : "#38B96C",
          opacity: 1,
          weight: "bold",
          align: "center",
          valign: "middle"
        },
        style: { nativeComponentGroupId: component.nativeComponentGroupId },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "wms-route-chain-native-visible-label",
          expressionForm: "complex-diagram",
          expressionSubtype: "route-chain-diagram",
          layerSourceId: image.id || null,
          overlayVisibility: "visible",
          role: "ai-shield-label",
          syntheticVisualAtom: true,
          ...component
        }
      };
    });
}

function inferWmsValueCardShapes(image, internalTextBoxes, valueLabels) {
  const box = image.box;
  const base = image.id || "wms-route-chain";
  const cardTop = round(box.y + box.h * 0.06);
  const cardH = round(box.h * 0.62);
  const panel = {
    x: round(box.x + 10),
    y: cardTop,
    w: round(box.w - 20),
    h: cardH
  };
  const shapes = [{
    id: `${base}-native-value-card-panel`,
    type: "roundRect",
    box: panel,
    style: {
      fill: "#FFFFFF",
      stroke: "#E4EBF0",
      strokeWidthPt: 0.8,
      radiusRatio: 0.035,
      shadow: { color: "#2F3A45", alpha: 0.08, blurPt: 3.2, distancePt: 0.8, angleDeg: 90 }
    },
    source: wmsRouteShapeSource(image, "wms-route-chain-native-value-card-panel")
  }];
  valueLabels.forEach((label, index) => {
    const center = centerOfBox(label.box);
    const cardW = round(Math.min(box.w * 0.28, Math.max(190, label.box.w + 150)));
    const cardX = round(Math.max(box.x + 4, Math.min(center.x - cardW / 2, box.x + box.w - cardW - 4)));
    shapes.push({
      id: `${base}-native-value-card-${index}`,
      type: "roundRect",
      box: { x: cardX, y: cardTop, w: cardW, h: cardH },
      style: {
        fill: "#FFFFFF",
        stroke: "none",
        strokeWidthPt: 0,
        radiusRatio: 0
      },
      source: wmsRouteShapeSource(image, "wms-route-chain-native-value-card", { cardText: label.text, cardIndex: index })
    });
  });
  for (let index = 1; index < 3; index += 1) {
    shapes.push({
      id: `${base}-native-value-card-divider-${index - 1}`,
      type: "line",
      box: { x: round(panel.x + panel.w * index / 3), y: round(panel.y + 18), w: 0, h: round(panel.h - 36) },
      style: { stroke: "#D7E0E7", strokeWidthPt: 0.8, connectorType: "straight" },
      source: wmsRouteShapeSource(image, "wms-route-chain-native-value-card-divider", { dividerIndex: index - 1 })
    });
  }
  const output = internalTextBoxes.find((item) => /产出价值/.test(String(item.text || "")));
  const outputBannerBox = workflowWmsRouteOutputBannerBox({ panel, outputBox: output?.box });
  if (outputBannerBox) {
    shapes.push({
      id: `${base}-native-output-banner`,
      type: "roundRect",
      box: outputBannerBox,
      style: {
        fill: "#026AEF",
        stroke: "#026AEF",
        strokeWidthPt: 1,
        radiusRatio: 0.08,
        shadow: { color: "#0B3E75", alpha: 0.14, blurPt: 2.4, distancePt: 0.5, angleDeg: 90 }
      },
      source: wmsRouteShapeSource(image, "wms-route-chain-native-output-banner", { bannerText: output.text })
    });
  }
  return shapes;
}

function wmsRouteChainNativeTextBoxes(image, textBoxes = []) {
  const box = image?.box || {};
  const internalTextBoxes = (textBoxes || [])
    .filter((textBox) => boxCenterInside(textBox.box, box))
    .filter((textBox) => isWmsRouteInternalLabel(textBox, box))
    .filter((textBox) => normalizeMatrixLabel(textBox.text))
    .filter((textBox) => String(textBox.text || "").trim());
  const semanticTextBoxes = wmsRouteChainSemanticTextBoxes(image)
    .filter((textBox) => boxCenterInside(textBox.box, box))
    .filter((textBox) => !internalTextBoxes.some((existing) => sameDiagramLabel(existing, textBox)));
  const native = [
    ...internalTextBoxes,
    ...semanticTextBoxes
  ]
    .map((textBox, index) => wmsRouteChainTextBox(image, textBox, index));
  const routeLabels = (textBoxes || [])
    .filter((textBox) => boxCenterInside(textBox.box, box))
    .filter((item) => /WMS\s*Inbound|Tollgate/i.test(String(item.text || "")))
    .sort((a, b) => centerOfBox(a.box).x - centerOfBox(b.box).x);
  if (routeLabels.filter((item) => /Tollgate/i.test(String(item.text || ""))).length >= 3) {
    native.push(...wmsRouteAiShieldTextBoxes(image, routeLabels));
  }
  return native;
}

function wmsRouteChainTextBox(image, textBox, index) {
  const next = JSON.parse(JSON.stringify(textBox));
  const text = String(next.text || "");
  if (/^Tollgate\s*\d$/i.test(text.trim())) {
    next.text = text.trim().replace(/Tollgate\s*(\d)/i, "Tollgate $1");
  }
  const role = /WMS\s*Inbound|Tollgate/i.test(text)
    ? "route-node-label"
    : /拦截成功/.test(text)
      ? "gate-pill-label"
      : /^(?:越库完整性|已关闭扣减|超量公式边界)$/.test(text.trim())
        ? "gate-caption-label"
      : /^(?:V\d|增量)/i.test(text.trim())
        ? "version-chip-label"
        : /挑战|AI介入|价值落地/.test(text)
          ? "value-card-title"
          : /产出价值/.test(text)
            ? "output-banner-label"
            : "value-card-body";
  next.id = next.id || `${image.id || "wms-route-chain"}-native-text-${index}`;
  next.font = {
    ...(next.font || {}),
    // OCR often reports the visible glyph height rather than the source text
    // size. Semantic route labels need a floor to retain the source hierarchy.
    sizePt: Math.max(Number(next.font?.sizePt || 0), wmsRouteTextMinimumFontSize(role)),
    color: wmsRouteChainTextColor(role, next.font?.color),
    opacity: 1,
    weight: role === "value-card-title" || role === "gate-caption-label"
      ? "bold"
      : (next.font?.weight || "regular")
  };
  next.source = {
    ...(next.source || {}),
    editable: true,
    nativeRebuild: true,
    detector: "wms-route-chain-native-visible-label",
    expressionForm: "complex-diagram",
    expressionSubtype: "route-chain-diagram",
    layerSourceId: image.id || null,
    overlayVisibility: "visible",
    role,
    textErasedFromCrop: true
  };
  const component = wmsRouteNativeComponentMetadata(
    image,
    wmsRouteComponentRoleForText(image, next),
    "label"
  );
  next.style = { ...(next.style || {}), nativeComponentGroupId: component.nativeComponentGroupId };
  next.source = { ...next.source, ...component };
  return next;
}

function wmsRouteTextMinimumFontSize(role) {
  switch (role) {
    case "gate-pill-label": return 12.5;
    case "route-node-label": return 14.5;
    case "gate-caption-label": return 15.5;
    case "value-card-title": return 17;
    case "value-card-body": return 12.5;
    case "output-banner-label": return 14;
    default: return 11;
  }
}

function wmsRouteChainTextColor(role, fallback) {
  const normalized = normalizeHex(fallback, "");
  if (normalized) return normalized;
  if (role === "gate-pill-label") return "#16804A";
  if (role === "version-chip-label") return "#F07B16";
  if (role === "route-node-label") return "#111111";
  if (role === "value-card-title") return "#0D4F8B";
  if (role === "output-banner-label") return "#FFFFFF";
  return "#243647";
}

function maybeEraseWmsRouteChainText({ image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null }) {
  if (!sourceImage || textBoxes.length === 0) return [];
  const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
  if (!assetFile) return [];
  const masks = textBoxes.map((item) => ptToPxBox(item.box, sourceImage, slideSize, 4));
  if (masks.length === 0) return [];
  const erased = eraseMasks(sourceImage, masks);
  const crop = cropPng(erased, ptToPxBox(image.box, sourceImage, slideSize, 0));
  ensureDir(path.dirname(assetFile));
  writePng(assetFile, crop);
  return textBoxes;
}

function wmsRouteShapeSource(image, detector, extra = {}) {
  return {
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "complex-diagram",
    expressionSubtype: "route-chain-diagram",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    ...extra
  };
}

function annotateWmsRouteComponentShapes(image, shapes = []) {
  return (Array.isArray(shapes) ? shapes : []).map((shape) => {
    const role = wmsRouteComponentRoleForShape(image, shape);
    const detector = String(shape?.source?.detector || "");
    const part = detector.replace(/^wms-route-chain-native-/, "") || "detail";
    return {
      ...shape,
      source: {
        ...(shape.source || {}),
        ...wmsRouteNativeComponentMetadata(image, role, part)
      }
    };
  });
}

function wmsRouteComponentRoleForShape(image, shape = {}) {
  const detector = String(shape?.source?.detector || "");
  if (/wms-route-chain-native-(?:backplate|road|road-dash|rail)$/.test(detector)) return "route-shell";
  if (/wms-route-chain-native-value-card-(?:panel|divider)$/.test(detector)) return "value-panel-shell";
  if (detector === "wms-route-chain-native-output-banner") return "output-banner";
  if (detector === "wms-route-chain-native-value-card") {
    const explicit = Number(shape?.source?.cardIndex);
    return `value-card-${Number.isInteger(explicit) && explicit >= 0 && explicit <= 2 ? explicit : nearestWmsValueCardIndex(image, shape.box)}`;
  }
  if (/wms-route-chain-native-(?:motion-line|document|forward-arrow|version-chip)$/.test(detector)) return "inbound";
  if (detector === "wms-route-chain-native-node") {
    const nodeIndex = Number(shape?.source?.nodeIndex);
    if (nodeIndex === 0 || centerOfBox(shape.box).x < Number(image?.box?.x || 0) + Number(image?.box?.w || 0) * 0.22) return "inbound";
    if (Number.isInteger(nodeIndex) && nodeIndex >= 1 && nodeIndex <= 3) return `gate-${nodeIndex - 1}`;
  }
  if (/wms-route-chain-native-(?:ai-|intercept-pill|callout-tail)/.test(detector)) {
    return `gate-${nearestWmsGateIndex(image, shape.box)}`;
  }
  return Number(image?.box?.y || 0) > 300
    ? `value-card-${nearestWmsValueCardIndex(image, shape.box)}`
    : "route-shell";
}

function wmsRouteComponentRoleForText(image, textBox = {}) {
  const role = String(textBox?.source?.role || "");
  const text = String(textBox?.text || "");
  if (role === "output-banner-label") return "output-banner";
  if (Number(image?.box?.y || 0) > 300) return `value-card-${nearestWmsValueCardIndex(image, textBox.box)}`;
  if (role === "version-chip-label" || /WMS\s*Inbound/i.test(text)) return "inbound";
  return `gate-${nearestWmsGateIndex(image, textBox.box)}`;
}

function nearestWmsGateIndex(image, box) {
  const imageBox = image?.box || {};
  const x = centerOfBox(box || {}).x;
  const centers = [0.33, 0.58, 0.83].map((ratio) => Number(imageBox.x || 0) + Number(imageBox.w || 0) * ratio);
  return nearestNumericIndex(x, centers);
}

function nearestWmsValueCardIndex(image, box) {
  const imageBox = image?.box || {};
  const x = centerOfBox(box || {}).x;
  const centers = [1 / 6, 1 / 2, 5 / 6].map((ratio) => Number(imageBox.x || 0) + Number(imageBox.w || 0) * ratio);
  return nearestNumericIndex(x, centers);
}

function wmsRouteNativeComponentMetadata(image, role, part) {
  const base = safeComponentToken(image?.id || "wms-route-chain");
  const safeRole = safeComponentToken(role);
  return {
    nativeComponentGroupId: `${base}-wms-route-${safeRole}`,
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentArchetype: "wms-route-chain",
    nativeComponentRole: safeRole,
    nativeComponentPart: safeComponentToken(part)
  };
}

function isWmsRouteInternalLabel(textBox, underlayBox) {
  if (!underlayBox) return false;
  const text = String(textBox?.text || "").replace(/\s+/g, "");
  const isRouteText = /^(?:V39B|增量|WMSInbound|Tollgate[123]|越库完整性|已关闭扣减|超量公式边界)$/i.test(text)
    || /^拦截成功[:：]/.test(text);
  const isValueCardText = /^(?:挑战|AI介入|价值落地)$/.test(text)
    || /WMS高度依赖|历史版本|研发介入|增量边界|研发告别|FE\/BE\/QA|隐性规则|链路|审计|回归/.test(text)
    || /V49集单|改A坏B|最大可收量|核心逻辑防线|无死角任务清单|产出价值|文档思维|界面交互|可视化实体/.test(text);
  if (!isRouteText && !isValueCardText) return false;
  const box = textBox?.box || {};
  const centerX = Number(box.x || 0) + Number(box.w || 0) / 2;
  const centerY = Number(box.y || 0) + Number(box.h || 0) / 2;
  return centerX >= underlayBox.x
    && centerX <= underlayBox.x + underlayBox.w
    && centerY >= underlayBox.y
    && centerY <= underlayBox.y + underlayBox.h
    && underlayBox.y < DEFAULT_SLIDE.heightPt * 0.65;
}

module.exports = {createWmsRouteChainShapes, annotateWmsRouteComponentShapes, wmsRouteComponentRoleForShape, nearestWmsGateIndex, nearestNumericIndex, nearestWmsValueCardIndex, wmsRouteNativeComponentMetadata, createWmsRouteMinimumUnitCrops, sameDiagramLabel, normalizeMatrixLabel, wmsRouteChainSemanticTextBoxes, inferWmsRouteChainShapes, inferWmsRouteChainSkeletonShapes, inferWmsTopRouteSkeletonShapes, wmsRouteDocumentShapes, wmsRouteShapeSource, wmsRouteRoadShapes, inferWmsValueCardSkeletonShapes, inferWmsTopRouteShapes, wmsRouteAiShieldClusterShapes, wmsRouteCalloutTailShapes, inferWmsValueCardShapes, isWmsTopRouteCrop, isWmsValuePanelCrop, maybeEraseWmsRouteChainText, shouldAutoPreserveWmsRouteWholeFidelityCrop, shouldDropWmsRouteChainResidual, shouldObjectifyWmsRouteChain, shouldPreserveWmsRouteCrop, wmsRouteChainNativeTextBoxes, isWmsRouteInternalLabel, wmsRouteAiShieldTextBoxes, wmsRouteChainTextBox, wmsRouteChainTextColor, wmsRouteComponentRoleForText, wmsRouteTextMinimumFontSize};
