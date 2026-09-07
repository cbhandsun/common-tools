"use strict";
const path = require("node:path");
const { aggregateForegroundComponent } = require("./graphic-crop-generation");
const { createEntropyChallengeCrops } = require("./entropy-challenge-crops");
const { cropPng, writePng } = require("./png");
const { ensureDir, eraseMasks } = require("./residual-primitive-erasure");
const { ptToPxBox, pxToPtBox, boxCenterInside, expandPtBox, luma, pixel, saturation, unionPtBox, round, trimPxBox, clamp, rgbToHsl, averageColor, boxesNearPt } = require("./raster-native-detection");
const { cropExpressionStats, connectedColorBlockEntries, scoreDiagramCandidate, isTableBlockSeed, shouldUseGraphicUnderlay, shouldUseSegmentedGraphicUnderlay, shouldUseContentGraphicUnderlay, shouldUseVisualClusterUnderlay, shouldUseStructuredCaseUnderlay, shouldUseMixedDiagramUnderlay, shouldUseLeftIllustrationPanelUnderlay, shouldUseTwoPanelDiagramCrops, shouldUseTopComplexDiagramCrop, isAcceptableDiagramCandidate, shouldUseComparisonMatrixCrop, shouldUseLineDiagramUnderlay, shouldUseIllustrationCardUnderlay, shouldUseSaturatedDiagramUnderlay, shouldUseSparseDiagramUnderlay } = require("./graphic-crop-analysis");
const { DEFAULT_SLIDE, isCollaborationFlowInternalLabel, isSaturatedDiagramInternalLabel } = require("./page-text-rule-helpers");
const { expandPxBox, foregroundComponents, mergeGraphicComponents, significantVerticalInkRuns, trimResidualBandBox, unionBox } = require("./residual-component-analysis");
const { boxOverlapArea } = require("./prd-generation-shapes");
const { boxesNearPx, unionPxBox } = require("./structured-residual-splitting");
const { isWmsRouteInternalLabel } = require("./wms-route-reconstruction");

function classifyGraphicUnderlayExpression(image, pxBox, textBoxes = []) {
  if (!image || !pxBox) return null;
  if (looksLikeDocumentGenerationFlowUnderlay(image, pxBox, textBoxes)) {
    return {
      detector: "screenshot-process-underlay-crop",
      reason: "document-generation-flow-illustration-preserved-as-local-crop"
    };
  }
  if (looksLikeProductWorkflowUnderlay(image, pxBox, textBoxes)) {
    return {
      detector: "screenshot-process-underlay-crop",
      reason: "product-workflow-icon-process-preserved-as-local-crop"
    };
  }
  const stats = cropExpressionStats(image, pxBox);
  const rectStats = colorBlockRectStats(image, pxBox);
  if (stats.paleNeutralRatio >= 0.10 || stats.lightPanelRatio >= 0.12) {
    return {
      detector: "screenshot-process-underlay-crop",
      reason: "screenshot-like-process-illustration-preserved-as-local-crop"
    };
  }
  if (rectStats.hasDominantRectStructure) return null;
  if (stats.centerWhiteRatio >= 0.62 && stats.saturatedRatio >= 0.025) {
    return {
      detector: "cycle-illustration-underlay-crop",
      reason: "circular-icon-illustration-preserved-as-local-crop"
    };
  }
  return null;
}

function looksLikeDocumentGenerationFlowUnderlay(image, pxBox, textBoxes = []) {
  const slideBox = pxToPtBox(pxBox, image, DEFAULT_SLIDE, 0);
  const normalized = (textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(slideBox, DEFAULT_SLIDE, 8, 8)))
    .map((item) => String(item.text || "").replace(/\s+/g, ""))
    .filter(Boolean)
    .join("\n");
  if (!normalized) return false;
  const anchorSignals = ["PRD自动生成", "PRD生成", "标准PRD"].filter((signal) => normalized.includes(signal)).length;
  if (anchorSignals < 1) return false;
  let supportingSignals = 0;
  for (const signal of ["结构化需求", "业务背景", "功能说明", "异常场景", "验收口径", "字段规则", "Skill", "技能"]) {
    if (normalized.includes(signal)) supportingSignals += 1;
  }
  return supportingSignals >= 3;
}

function looksLikeProductWorkflowUnderlay(image, pxBox, textBoxes = []) {
  const slideBox = pxToPtBox(pxBox, image, DEFAULT_SLIDE, 0);
  const labels = (textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, slideBox))
    .map((item) => String(item.text || "").replace(/\s+/g, ""))
    .filter(Boolean);
  const joined = labels.join(" ");
  const signals = ["需求理解", "PRD生成", "智能评审", "原型生成", "标准资产输出"];
  return signals.filter((signal) => joined.includes(signal)).length >= 3;
}

function colorBlockRectStats(image, pxBox) {
  const cropArea = Math.max(1, pxBox.w * pxBox.h);
  const entries = connectedColorBlockEntries(image, pxBox);
  let dominantAreaRatio = 0;
  let denseBlockAreaRatio = 0;
  let denseBlockCount = 0;
  for (const entry of entries) {
    const w = Math.max(1, entry.maxX - entry.minX + 4);
    const h = Math.max(1, entry.maxY - entry.minY + 4);
    const areaRatio = (w * h) / cropArea;
    const density = (entry.count * 16) / Math.max(1, w * h);
    if (density < 0.42 || areaRatio < 0.018) continue;
    denseBlockCount += 1;
    denseBlockAreaRatio += areaRatio;
    dominantAreaRatio = Math.max(dominantAreaRatio, areaRatio);
  }
  return {
    denseBlockCount,
    denseBlockAreaRatio,
    dominantAreaRatio,
    hasDominantRectStructure: dominantAreaRatio >= 0.08 || (denseBlockCount <= 8 && denseBlockAreaRatio >= 0.2)
  };
}

function createGraphicUnderlayCrop(image, textBoxes, slideSize, options) {
  if (!options.assetDir) return [];
  const entropyChallenge = createEntropyChallengeCrops(image, textBoxes, slideSize, options);
  if (entropyChallenge.length > 0) return entropyChallenge;
  const masks = textBoxes.map((item) => ptToPxBox(item.box, image, slideSize, 8));
  const aggregate = aggregateForegroundComponent(image, masks);
  const structuralLines = options.structuralLines || [];
  const productIllustration = createProductIllustrationSegmentCrops(image, textBoxes, slideSize, options, masks, aggregate, structuralLines);
  if (productIllustration.length > 0) return productIllustration;
  const singleAggregate = fitSingleUnderlayAggregate(aggregate, image);
  if (shouldUseGraphicUnderlay({ aggregate: singleAggregate, image, structuralLines, textBoxes })) {
    ensureDir(options.assetDir);
    const underlayBox = pxToPtBox(singleAggregate.box, image, slideSize, 0);
    const crop = cropPng(image, singleAggregate.box);
    const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-underlay.png`);
    writePng(file, crop);
    const expression = classifyGraphicUnderlayExpression(image, singleAggregate.box, textBoxes);
    return [{
      id: "native-graphic-underlay",
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
      box: underlayBox,
      source: {
        editable: false,
        nativeRebuild: true,
        detector: expression?.detector || "foreground-graphic-underlay-crop",
        reason: expression?.reason || "table-or-grid-graphics-preserved-as-underlay-crop"
      }
    }];
  }
  const sparseDiagramUnderlay = createSparseDiagramUnderlayCrop(image, textBoxes, slideSize, options, masks, aggregate);
  if (sparseDiagramUnderlay.length > 0) return sparseDiagramUnderlay;
  const lineDiagramUnderlay = createLineDiagramUnderlayCrop(image, textBoxes, slideSize, options, masks);
  if (lineDiagramUnderlay.length > 0) return lineDiagramUnderlay;
  const saturatedDiagramUnderlay = createSaturatedDiagramUnderlayCrop(image, textBoxes, slideSize, options, masks, aggregate);
  if (saturatedDiagramUnderlay.length > 0) return saturatedDiagramUnderlay;
  const illustrationCardUnderlay = createIllustrationCardUnderlayCrop(image, textBoxes, slideSize, options, masks);
  if (illustrationCardUnderlay.length > 0) return illustrationCardUnderlay;
  const leftIllustrationPanel = createLeftIllustrationPanelCrops(image, textBoxes, slideSize, options, masks, aggregate);
  if (leftIllustrationPanel.length > 0) return leftIllustrationPanel;
  const comparisonMatrix = createComparisonMatrixCrop(image, textBoxes, slideSize, options);
  if (comparisonMatrix.length > 0) return comparisonMatrix;
  const topComplexDiagram = createTopComplexDiagramCrop(image, textBoxes, slideSize, options);
  if (topComplexDiagram.length > 0) return topComplexDiagram;
  const collaborationFlow = createCollaborationFlowUnderlayCrop(image, textBoxes, slideSize, options);
  if (collaborationFlow.length > 0) return collaborationFlow;
  const wmsChain = createWmsChainUnderlayCrops(image, textBoxes, slideSize, options);
  if (wmsChain.length > 0) return wmsChain;
  const twoPanelDiagram = createTwoPanelDiagramCrops(image, textBoxes, slideSize, options);
  if (twoPanelDiagram.length > 0) return twoPanelDiagram;
  const mixedDiagramUnderlay = createMixedDiagramUnderlayCrop(image, textBoxes, slideSize, options, aggregate, structuralLines, masks);
  if (mixedDiagramUnderlay.length > 0) return mixedDiagramUnderlay;
  const structuredCaseUnderlay = createStructuredCaseUnderlayCrop(image, textBoxes, slideSize, options, masks, aggregate, structuralLines);
  if (structuredCaseUnderlay.length > 0) return structuredCaseUnderlay;
  const contentUnderlay = createContentGraphicUnderlayCrop(image, textBoxes, slideSize, options, masks, aggregate, structuralLines);
  if (contentUnderlay.length > 0) return contentUnderlay;
  const visualClusterUnderlay = createVisualClusterUnderlayCrops(image, textBoxes, slideSize, options, masks, aggregate, structuralLines);
  if (visualClusterUnderlay.length > 0) return visualClusterUnderlay;
  const segmented = createSegmentedGraphicUnderlayCrops(image, textBoxes, slideSize, options, masks, aggregate, structuralLines);
  if (segmented.length > 0) return segmented;
  return [];
}

function createProductIllustrationSegmentCrops(image, textBoxes, slideSize, options, masks, aggregate, structuralLines) {
  if (!shouldUseProductIllustrationSegmentCrops({ aggregate, image, structuralLines, textBoxes })) return [];
  ensureDir(options.assetDir);
  const graphicImage = eraseMasks(image, masks);
  return productIllustrationSegmentBoxes(image, aggregate.box)
    .map((pxBox, index) => {
      const areaRatio = pxBox.w * pxBox.h / Math.max(1, image.width * image.height);
      if (areaRatio < 0.012 || areaRatio > 0.24) return null;
      const crop = cropPng(graphicImage, pxBox);
      const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-product-illustration-${String(index + 1).padStart(2, "0")}.png`);
      writePng(file, crop);
      return {
        id: `native-product-illustration-${index}`,
        type: "fidelity-crop",
        assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
        box: pxToPtBox(pxBox, image, slideSize, 0),
        source: {
          editable: false,
          nativeRebuild: true,
          detector: "product-illustration-segment-crop",
          reason: "screenshot-like-product-illustration-preserved-as-local-segments"
        }
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function createSparseDiagramUnderlayCrop(image, textBoxes, slideSize, options, masks, aggregate) {
  if (!shouldUseSparseDiagramUnderlay({
    aggregate,
    image,
    detectedLineCount: options.detectedLineCount,
    textBoxes
  })) return [];
  ensureDir(options.assetDir);
  const crop = cropPng(image, aggregate.box);
  const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-sparse-diagram-underlay.png`);
  writePng(file, crop);
  return [{
    id: "native-graphic-sparse-diagram-underlay",
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: pxToPtBox(aggregate.box, image, slideSize, 0),
    source: {
      editable: false,
      nativeRebuild: true,
      detector: "sparse-diagram-graphic-underlay-crop",
      reason: "sparse-complex-diagram-preserved-as-movable-crop"
    }
  }];
}

function createLineDiagramUnderlayCrop(image, textBoxes, slideSize, options, masks) {
  const pxBox = lineDiagramPxBounds(options.detectedLines || [], image, slideSize);
  if (!shouldUseLineDiagramUnderlay({ pxBox, image, detectedLineCount: options.detectedLineCount, textBoxes })) return [];
  ensureDir(options.assetDir);
  const graphicImage = eraseMasks(image, masks);
  const crop = cropPng(graphicImage, pxBox);
  const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-line-diagram-underlay.png`);
  writePng(file, crop);
  return [{
    id: "native-graphic-line-diagram-underlay",
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: pxToPtBox(pxBox, image, slideSize, 0),
    source: {
      editable: false,
      nativeRebuild: true,
      detector: "line-diagram-graphic-underlay-crop",
      reason: "dense-line-diagram-preserved-as-movable-crop"
    }
  }];
}

function createSaturatedDiagramUnderlayCrop(image, textBoxes, slideSize, options, masks, aggregate) {
  const pxBox = saturatedGraphicBounds(image, masks);
  if (!shouldUseSaturatedDiagramUnderlay({ aggregate, image, pxBox, detectedLineCount: options.detectedLineCount, textBoxes })) return [];
  let fitted = pxBox;
  for (let inset = 0; inset <= 32; inset += 1) {
    const candidate = inset > 0 ? trimPxBox(pxBox, image, inset) : pxBox;
    const areaRatio = candidate.w * candidate.h / Math.max(1, image.width * image.height);
    if (areaRatio <= 0.65) {
      fitted = candidate;
      break;
    }
  }
  const areaRatio = fitted.w * fitted.h / Math.max(1, image.width * image.height);
  if (areaRatio < 0.34 || areaRatio > 0.65) return [];
  ensureDir(options.assetDir);
  const fittedPtBox = pxToPtBox(fitted, image, slideSize, 0);
  const externalTextMasks = textBoxes
    .filter((textBox) => !isSaturatedDiagramInternalLabel(textBox, fittedPtBox))
    .map((item) => ptToPxBox(item.box, image, slideSize, 8));
  const graphicImage = eraseMasks(image, externalTextMasks);
  const crop = cropPng(graphicImage, fitted);
  const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-saturated-diagram-underlay.png`);
  writePng(file, crop);
  const images = [{
    id: "native-graphic-saturated-diagram-underlay",
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: fittedPtBox,
    source: {
      editable: false,
      nativeRebuild: true,
      detector: "saturated-diagram-graphic-underlay-crop",
      reason: "complex-color-flow-graphics-preserved-as-content-region-crop"
    }
  }];

  const bannerBox = bottomBannerBounds(image);
  if (bannerBox) {
    const bannerImage = eraseMasks(image, masks);
    const bannerCrop = cropPng(bannerImage, bannerBox);
    const bannerFile = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-saturated-diagram-bottom-banner.png`);
    writePng(bannerFile, bannerCrop);
    images.push({
      id: "native-graphic-saturated-diagram-bottom-banner",
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, bannerFile).replace(/\\/g, "/"),
      box: pxToPtBox(bannerBox, image, slideSize, 0),
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "saturated-diagram-bottom-banner-crop",
        reason: "bottom-value-banner-background-preserved-behind-editable-text",
        expressionForm: "value-banner",
        expressionSubtype: "value-banner-strip",
        strategy: "native-rebuild",
        recommendedAction: "attempt-native-reconstruction",
        layer: {
          layerType: "value-banner-zone",
          recommendedAction: "attempt-native-reconstruction"
        }
      }
    });
  }
  return images;
}

function createIllustrationCardUnderlayCrop(image, textBoxes, slideSize, options, masks) {
  const contentBox = illustrationCardBounds(textBoxes, slideSize);
  if (!shouldUseIllustrationCardUnderlay({ image, textBoxes, box: contentBox, slideSize })) return [];
  let pxBox = ptToPxBox(contentBox, image, slideSize, 0);
  for (let inset = 0; inset <= 12; inset += 1) {
    const candidate = inset > 0 ? trimPxBox(pxBox, image, inset) : pxBox;
    const areaRatio = candidate.w * candidate.h / Math.max(1, image.width * image.height);
    if (areaRatio <= 0.65) {
      pxBox = candidate;
      break;
    }
  }
  const areaRatio = pxBox.w * pxBox.h / Math.max(1, image.width * image.height);
  if (areaRatio < 0.45 || areaRatio > 0.65) return [];
  ensureDir(options.assetDir);
  const graphicImage = eraseMasks(image, masks);
  const crop = cropPng(graphicImage, pxBox);
  const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-illustration-card-underlay.png`);
  writePng(file, crop);
  return [{
    id: "native-graphic-illustration-card-underlay",
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: pxToPtBox(pxBox, image, slideSize, 0),
    source: {
      editable: false,
      nativeRebuild: true,
      detector: "illustration-card-graphic-underlay-crop",
      reason: "multi-card-illustrations-preserved-as-content-region-crop"
    }
  }];
}

function createLeftIllustrationPanelCrops(image, textBoxes, slideSize, options, masks, aggregate) {
  const leftBox = leftIllustrationGraphicBounds(image, masks);
  const bannerBox = bottomBannerBounds(image);
  if (!shouldUseLeftIllustrationPanelUnderlay({ aggregate, image, leftBox, bannerBox, textBoxes, slideSize })) return [];
  ensureDir(options.assetDir);
  const crops = [
    {
      id: "native-graphic-left-illustration-panel",
      box: leftBox,
      detector: "left-illustration-panel-crop",
      reason: "left-illustration-preserved-as-movable-crop"
    },
    {
      id: "native-graphic-bottom-banner",
      box: bannerBox,
      detector: "bottom-banner-crop",
      reason: "bottom-value-banner-preserved-as-movable-crop"
    }
  ];
  return crops.map((item) => {
    const crop = cropPng(image, item.box);
    const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-${item.detector}.png`);
    writePng(file, crop);
    return {
      id: item.id,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
      box: pxToPtBox(item.box, image, slideSize, 0),
      source: {
        editable: false,
        nativeRebuild: true,
        detector: item.detector,
        reason: item.reason
      }
    };
  });
}

function createTwoPanelDiagramCrops(image, textBoxes, slideSize, options) {
  const panels = twoPanelDiagramBounds(textBoxes, slideSize);
  if (!shouldUseTwoPanelDiagramCrops({ panels, textBoxes, slideSize })) return [];
  ensureDir(options.assetDir);
  return panels.map((panel, index) => {
    const pxBox = ptToPxBox(panel, image, slideSize, 0);
    const crop = cropPng(image, pxBox);
    const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-two-panel-diagram-${String(index + 1).padStart(2, "0")}.png`);
    writePng(file, crop);
    return {
      id: `native-graphic-two-panel-diagram-${index}`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
      box: panel,
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "two-panel-diagram-crop",
        reason: "complex-side-by-side-diagrams-preserved-as-crops"
      }
    };
  });
}

function createTopComplexDiagramCrop(image, textBoxes, slideSize, options) {
  const panel = topComplexDiagramBounds(textBoxes, slideSize);
  if (!shouldUseTopComplexDiagramCrop({ panel, textBoxes, slideSize })) return [];
  ensureDir(options.assetDir);
  const pxBox = ptToPxBox(panel, image, slideSize, 0);
  const crop = cropPng(image, pxBox);
  const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-top-complex-diagram.png`);
  writePng(file, crop);
  const images = [{
    id: "native-graphic-top-complex-diagram",
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: panel,
    source: {
      editable: false,
      nativeRebuild: true,
      detector: "top-complex-diagram-crop",
      reason: "top-half-complex-diagram-preserved-as-crop"
    }
  }];

  const bannerBox = bottomBannerBounds(image);
  if (bannerBox) {
    const detectedBannerPtBox = pxToPtBox(bannerBox, image, slideSize, 0);
    const bannerPtBox = refineBottomValueBannerBoxFromText(detectedBannerPtBox, textBoxes, slideSize);
    const refinedBannerBox = ptToPxBox(bannerPtBox, image, slideSize, 0);
    const bannerTextMasks = textBoxes
      .filter((textBox) => boxCenterInside(textBox.box, bannerPtBox))
      .map((textBox) => ptToPxBox(textBox.box, image, slideSize, 8));
    const bannerImage = eraseMasks(image, bannerTextMasks);
    const bannerCrop = cropPng(bannerImage, refinedBannerBox);
    const bannerFile = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-top-complex-bottom-banner.png`);
    writePng(bannerFile, bannerCrop);
    images.push({
      id: "native-graphic-top-complex-bottom-banner",
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, bannerFile).replace(/\\/g, "/"),
      box: bannerPtBox,
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "top-complex-bottom-banner-crop",
        reason: "bottom-value-banner-background-preserved-behind-editable-text"
      }
    });
  }
  return images;
}

function createCollaborationFlowUnderlayCrop(image, textBoxes, slideSize, options) {
  const panel = collaborationFlowBounds(textBoxes, slideSize);
  if (!shouldUseCollaborationFlowUnderlay({ panel, textBoxes, slideSize, structuralLines: options.structuralLines })) return [];
  ensureDir(options.assetDir);
  const masks = textBoxes
    .filter((item) => !isCollaborationFlowInternalLabel(item, panel))
    .map((item) => ptToPxBox(item.box, image, slideSize, 8));
  const erased = eraseMasks(image, masks);
  const pxBox = ptToPxBox(panel, image, slideSize, 0);
  const crop = cropPng(erased, pxBox);
  const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-collaboration-flow-underlay.png`);
  writePng(file, crop);
  const images = [{
    id: "native-graphic-collaboration-flow-underlay",
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: panel,
    source: {
      editable: false,
      nativeRebuild: true,
      detector: "collaboration-flow-underlay-crop",
      reason: "complex-flow-card-visuals-preserved-under-editable-text"
    }
  }];

  const bannerBox = bottomBannerBounds(image);
  if (bannerBox) {
    const bannerPtBox = pxToPtBox(bannerBox, image, slideSize, 0);
    const bannerCrop = cropPng(erased, bannerBox);
    const bannerFile = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-collaboration-flow-banner.png`);
    writePng(bannerFile, bannerCrop);
    images.push({
      id: "native-graphic-collaboration-flow-banner",
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, bannerFile).replace(/\\/g, "/"),
      box: bannerPtBox,
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "collaboration-flow-banner-crop",
        reason: "bottom-value-banner-background-preserved-behind-editable-text"
      }
    });
  }
  return images;
}

function createWmsChainUnderlayCrops(image, textBoxes, slideSize, options) {
  const panels = wmsChainBounds(textBoxes, slideSize);
  if (!shouldUseWmsChainUnderlay({ panels, textBoxes, slideSize, structuralLines: options.structuralLines })) return [];
  ensureDir(options.assetDir);
  return panels.map((panel, index) => {
    const panelMasks = textBoxes
      .filter((item) => !isWmsRouteInternalLabel(item, panel))
      .map((item) => ptToPxBox(item.box, image, slideSize, 8));
    const graphicImage = eraseMasks(image, panelMasks);
    const pxBox = ptToPxBox(panel, image, slideSize, 0);
    const crop = cropPng(graphicImage, pxBox);
    const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-wms-chain-underlay-${String(index + 1).padStart(2, "0")}.png`);
    writePng(file, crop);
    return {
      id: `native-graphic-wms-chain-underlay-${index}`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
      box: panel,
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "wms-chain-underlay-crop",
        reason: "complex-wms-chain-and-value-card-visuals-preserved-under-editable-text"
      }
    };
  });
}

function createComparisonMatrixCrop(image, textBoxes, slideSize, options) {
  const matrixBox = comparisonMatrixBounds(textBoxes, slideSize);
  if (!shouldUseComparisonMatrixCrop({ matrixBox, textBoxes, slideSize })) return [];
  ensureDir(options.assetDir);
  return segmentComparisonMatrix(matrixBox, slideSize).map((box, index) => {
    const pxBox = ptToPxBox(box, image, slideSize, 0);
    const crop = cropPng(image, pxBox);
    const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-comparison-matrix-${String(index + 1).padStart(2, "0")}.png`);
    writePng(file, crop);
    return {
      id: `native-graphic-comparison-matrix-${index}`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
      box,
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "comparison-matrix-crop",
        reason: "dense-comparison-matrix-preserved-as-segmented-crops"
      }
    };
  });
}

function createMixedDiagramUnderlayCrop(image, textBoxes, slideSize, options, aggregate, structuralLines, masks = []) {
  const contentBox = contentTextBounds(textBoxes, slideSize);
  if (!shouldUseMixedDiagramUnderlay({ aggregate, image, structuralLines, textBoxes, contentBox, slideSize })) return [];
  let pxBox = ptToPxBox(expandPtBox(contentBox, slideSize, 8, 8), image, slideSize, 0);
  let areaRatio = pxBox.w * pxBox.h / Math.max(1, image.width * image.height);
  if (areaRatio > 0.65) {
    pxBox = ptToPxBox(contentBox, image, slideSize, 0);
    areaRatio = pxBox.w * pxBox.h / Math.max(1, image.width * image.height);
  }
  if (areaRatio < 0.54 || areaRatio > 0.65) return [];
  ensureDir(options.assetDir);
  const graphicImage = eraseMasks(image, masks);
  const crop = cropPng(graphicImage, pxBox);
  const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-mixed-diagram-underlay.png`);
  writePng(file, crop);
  return [{
    id: "native-graphic-mixed-diagram-underlay",
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: pxToPtBox(pxBox, image, slideSize, 0),
    source: {
      editable: false,
      nativeRebuild: true,
      detector: "mixed-diagram-graphic-underlay-crop",
      reason: "mixed-diagram-pictorial-details-preserved-beneath-editable-semantic-structure",
      textErasedFromCrop: true,
      semanticSplitOwnsLayer: true,
      expressionForm: "complex-diagram",
      expressionSubtype: "mixed-diagram-hybrid",
      recommendedAction: "split-native-with-residual-crop"
    }
  }];
}

function createStructuredCaseUnderlayCrop(image, textBoxes, slideSize, options, masks, aggregate, structuralLines) {
  if (!shouldUseStructuredCaseUnderlay({ aggregate, image, structuralLines, textBoxes })) return [];
  const contentBox = contentTextBounds(textBoxes, slideSize);
  if (!contentBox) return [];
  let pxBox = ptToPxBox(expandPtBox(contentBox, slideSize, 4, 4), image, slideSize, 0);
  let areaRatio = pxBox.w * pxBox.h / Math.max(1, image.width * image.height);
  if (areaRatio > 0.65) {
    pxBox = ptToPxBox(contentBox, image, slideSize, 0);
    areaRatio = pxBox.w * pxBox.h / Math.max(1, image.width * image.height);
  }
  if (areaRatio < 0.36 || areaRatio > 0.65) return [];
  ensureDir(options.assetDir);
  const graphicImage = eraseMasks(image, masks);
  const crop = cropPng(graphicImage, pxBox);
  const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-structured-case-underlay.png`);
  writePng(file, crop);
  return [{
    id: "native-graphic-structured-case-underlay",
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: pxToPtBox(pxBox, image, slideSize, 0),
    source: {
      editable: false,
      nativeRebuild: true,
      detector: "structured-case-graphic-underlay-crop",
      reason: "case-study-diagram-graphics-preserved-as-content-region-crop"
    }
  }];
}

function createContentGraphicUnderlayCrop(image, textBoxes, slideSize, options, masks, aggregate, structuralLines) {
  if (!shouldUseContentGraphicUnderlay({
    aggregate,
    image,
    structuralLines,
    detectedLineCount: options.detectedLineCount,
    textBoxes
  })) return [];
  const contentBox = contentTextBounds(textBoxes, slideSize);
  if (!contentBox) return [];
  const pxBox = ptToPxBox(expandPtBox(contentBox, slideSize, 65, 55), image, slideSize, 0);
  const areaRatio = pxBox.w * pxBox.h / Math.max(1, image.width * image.height);
  if (areaRatio < 0.08 || areaRatio > 0.65) return [];
  ensureDir(options.assetDir);
  const graphicImage = eraseMasks(image, masks);
  const crop = cropPng(graphicImage, pxBox);
  const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-content-underlay.png`);
  writePng(file, crop);
  return [{
    id: "native-graphic-content-underlay",
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: pxToPtBox(pxBox, image, slideSize, 0),
    source: {
      editable: false,
      nativeRebuild: true,
      detector: "content-foreground-graphic-underlay-crop",
      reason: "complex-diagram-graphics-preserved-as-content-crop"
    }
  }];
}

function createSegmentedGraphicUnderlayCrops(image, textBoxes, slideSize, options, masks, aggregate, structuralLines) {
  if (!shouldUseSegmentedGraphicUnderlay({ aggregate, image, structuralLines, textBoxes })) return [];
  ensureDir(options.assetDir);
  const graphicImage = eraseMasks(image, masks);
  return segmentTextBoxesForUnderlay(textBoxes, slideSize)
    .map((box, index) => {
      const pxBox = ptToPxBox(box, image, slideSize, 0);
      const areaRatio = pxBox.w * pxBox.h / Math.max(1, image.width * image.height);
      if (areaRatio < 0.015 || areaRatio > 0.32) return null;
      const crop = cropPng(graphicImage, pxBox);
      const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-underlay-${String(index + 1).padStart(2, "0")}.png`);
      writePng(file, crop);
      return {
        id: `native-graphic-underlay-${index}`,
        type: "fidelity-crop",
        assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
        box: pxToPtBox(pxBox, image, slideSize, 0),
        source: {
          editable: false,
          nativeRebuild: true,
          detector: "segmented-foreground-graphic-underlay-crop",
          reason: "large-table-or-card-graphics-preserved-as-segmented-crops"
        }
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function createVisualClusterUnderlayCrops(image, textBoxes, slideSize, options, masks, aggregate, structuralLines) {
  const components = mergeGraphicComponents(foregroundComponents(image, masks), image);
  const cluster = visualClusterPxBounds(components, image);
  if (!shouldUseVisualClusterUnderlay({
    aggregate,
    image,
    cluster,
    components,
    structuralLines,
    detectedLineCount: options.detectedLineCount,
    textBoxes
  })) return [];
  ensureDir(options.assetDir);
  const crop = cropPng(image, cluster);
  const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-visual-cluster-underlay.png`);
  writePng(file, crop);
  return [{
    id: "native-graphic-visual-cluster-underlay",
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: pxToPtBox(cluster, image, slideSize, 0),
    source: {
      editable: false,
      nativeRebuild: true,
      detector: "visual-cluster-graphic-underlay-crop",
      reason: "multi-part-chart-or-diagram-preserved-as-movable-crop"
    }
  }];
}





function productIllustrationSegmentBoxes(image, aggregateBox) {
  const components = mergeGraphicComponents(foregroundComponents(image, []), image)
    .filter((component) => boxOverlapArea(component.box, aggregateBox) / Math.max(1, component.box.w * component.box.h) >= 0.62)
    .filter((component) => {
      const componentArea = component.box.w * component.box.h / Math.max(1, image.width * image.height);
      return componentArea >= 0.006 && componentArea <= 0.26;
    })
    .map((component) => expandProductSegmentPxBox(component.box, image, 12, 10))
    .sort((a, b) => (a.x - b.x) || (a.y - b.y));
  return mergeNearbySegmentBoxes(components, image)
    .filter((box) => {
      const areaRatio = box.w * box.h / Math.max(1, image.width * image.height);
      return areaRatio >= 0.012 && areaRatio <= 0.24;
    })
    .concat(productIllustrationBandBoxes(image, aggregateBox))
    .sort((a, b) => (a.x - b.x) || (a.y - b.y));
}

function productIllustrationBandBoxes(image, aggregateBox) {
  const crop = cropPng(image, aggregateBox);
  const runs = significantVerticalInkRuns(crop);
  const usableRuns = runs.length >= 3 ? runs : significantVerticalInkRunsWithoutHeader(crop);
  if (usableRuns.length < 3 || usableRuns.length > 8) return [];
  const selectedRuns = runs.length >= 3 ? runs : usableRuns;
  return selectedRuns
    .map((run) => trimResidualBandBox(crop, { x: run.start, y: run.y || 0, w: run.end - run.start + 1, h: run.h || crop.height }))
    .filter(Boolean)
    .map((box) => expandProductSegmentPxBox({
      x: aggregateBox.x + box.x,
      y: aggregateBox.y + box.y,
      w: box.w,
      h: box.h
    }, image, 12, 10))
    .filter((box) => {
      const areaRatio = box.w * box.h / Math.max(1, image.width * image.height);
      return areaRatio >= 0.012 && areaRatio <= 0.24;
    });
}

function significantVerticalInkRunsWithoutHeader(crop) {
  const headerBottom = detectWideHeaderBottom(crop);
  if (!headerBottom || headerBottom > crop.height * 0.32) return [];
  const body = cropPng(crop, { x: 0, y: headerBottom, w: crop.width, h: crop.height - headerBottom });
  return significantVerticalInkRuns(body).map((run) => ({
    ...run,
    y: headerBottom,
    h: body.height
  }));
}

function detectWideHeaderBottom(crop) {
  let lastWide = -1;
  for (let y = 0; y < Math.round(crop.height * 0.34); y += 2) {
    let count = 0;
    for (let x = 0; x < crop.width; x += 4) {
      if (isTableBlockSeed(pixel(crop, x, y))) count += 1;
    }
    if (count / Math.max(1, crop.width / 4) >= 0.72) lastWide = y;
  }
  return lastWide > crop.height * 0.06 ? Math.min(crop.height - 1, lastWide + 8) : null;
}

function looksLikeDenseTextMatrix(pxBox, image, textBoxes = []) {
  const slideBox = pxToPtBox(pxBox, image, DEFAULT_SLIDE, 0);
  const inside = (textBoxes || []).filter((item) => item?.box && boxCenterInside(item.box, slideBox));
  if (inside.length < 16) return false;
  const columns = clusterCenters(inside.map((item) => item.box.x + item.box.w / 2), slideBox.w * 0.08);
  const rows = clusterCenters(inside.map((item) => item.box.y + item.box.h / 2), slideBox.h * 0.08);
  return columns.length >= 3 && rows.length >= 4 && inside.length >= columns.length * rows.length * 0.48;
}

function clusterCenters(values, tolerance) {
  const clusters = [];
  for (const value of [...values].sort((a, b) => a - b)) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(value - last.center) > tolerance) {
      clusters.push({ center: value, count: 1 });
    } else {
      last.center = (last.center * last.count + value) / (last.count + 1);
      last.count += 1;
    }
  }
  return clusters;
}

function mergeNearbySegmentBoxes(boxes, image) {
  const merged = [];
  for (const box of boxes) {
    const match = merged.find((item) => boxesNearPx(item, box, Math.round(image.width * 0.035), Math.round(image.height * 0.05)));
    if (match) {
      const union = unionPxBox(match, box);
      match.x = union.x;
      match.y = union.y;
      match.w = union.w;
      match.h = union.h;
    } else {
      merged.push({ ...box });
    }
  }
  return merged;
}

function expandProductSegmentPxBox(box, image, padX, padY) {
  const x = clamp(Math.floor(box.x - padX), 0, image.width - 1);
  const y = clamp(Math.floor(box.y - padY), 0, image.height - 1);
  const x2 = clamp(Math.ceil(box.x + box.w + padX), x + 1, image.width);
  const y2 = clamp(Math.ceil(box.y + box.h + padY), y + 1, image.height);
  return { x, y, w: x2 - x, h: y2 - y };
}

function sampleComponentCenterColor(image, box) {
  const x1 = clamp(Math.round(box.x + box.w * 0.25), 0, image.width - 1);
  const y1 = clamp(Math.round(box.y + box.h * 0.25), 0, image.height - 1);
  const x2 = clamp(Math.round(box.x + box.w * 0.75), x1 + 1, image.width);
  const y2 = clamp(Math.round(box.y + box.h * 0.75), y1 + 1, image.height);
  const colors = [];
  for (let y = y1; y < y2; y += 6) {
    for (let x = x1; x < x2; x += 6) {
      const color = pixel(image, x, y);
      if (color.a < 64) continue;
      if (luma(color) > 244 && saturation(color) < 0.12) continue;
      colors.push(color);
    }
  }
  return colors.length > 0 ? averageColor(colors) : null;
}

function coarseHueBucket(color) {
  if (!color) return null;
  const hsl = rgbToHsl(color);
  if (hsl.s < 0.16 && hsl.l > 0.72) return null;
  if (hsl.s < 0.16) return "neutral";
  return String(Math.floor(hsl.h / 45));
}

























function lineDiagramPxBounds(lines, image, slideSize) {
  if (!image || !Array.isArray(lines) || lines.length === 0) return null;
  const contentTop = slideSize.heightPt * 0.22;
  const contentLines = lines
    .map((line) => line.box)
    .filter((box) => {
      const centerY = Number(box.y || 0) + Number(box.h || 0) / 2;
      const span = Math.max(Number(box.w || 0), Number(box.h || 0));
      return centerY >= contentTop && span >= 70;
    });
  if (contentLines.length < 24) return null;
  const ptBox = contentLines.reduce((acc, box) => (acc ? unionPtBox(acc, box) : { ...box }), null);
  return ptToPxBox(expandPtBox(ptBox, slideSize, 4, 4), image, slideSize, 0);
}









function illustrationCardBounds(textBoxes, slideSize) {
  const boxes = textBoxes
    .filter((item) => item.box && Number(item.box.y || 0) > 55)
    .map((item) => item.box);
  if (boxes.length < 8) return null;
  const union = boxes.reduce((acc, box) => (acc ? unionPtBox(acc, box) : { ...box }), null);
  return expandPtBox(union, slideSize, 0, 0);
}

function saturatedGraphicBounds(image, masks = []) {
  let box = null;
  let count = 0;
  const maskList = masks || [];
  const inMask = (x, y) => maskList.some((mask) =>
    x >= mask.x && x < mask.x + mask.w && y >= mask.y && y < mask.y + mask.h
  );
  for (let y = 0; y < image.height; y += 2) {
    if (y > image.height * 0.92) continue;
    for (let x = 0; x < image.width; x += 2) {
      if (inMask(x, y)) continue;
      const color = pixel(image, x, y);
      if (color.a < 64) continue;
      if (saturation(color) <= 0.28 || luma(color) >= 230) continue;
      count += 1;
      box = box
        ? {
          x: Math.min(box.x, x),
          y: Math.min(box.y, y),
          w: Math.max(box.x + box.w, x + 1) - Math.min(box.x, x),
          h: Math.max(box.y + box.h, y + 1) - Math.min(box.y, y)
        }
        : { x, y, w: 1, h: 1 };
    }
  }
  return count >= 4000 ? box : null;
}

function visualClusterPxBounds(components, image) {
  if (!image || !Array.isArray(components) || components.length < 3) return null;
  const useful = components.filter((component) => {
    const box = component?.box || {};
    const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, image.width * image.height);
    return areaRatio >= 0.004 && areaRatio <= 0.22;
  });
  if (useful.length < 3) return null;
  const union = useful.reduce((acc, component) => (acc ? unionBox(acc, component.box) : { ...component.box }), null);
  return expandPxBox(union, image, 10);
}

function leftIllustrationGraphicBounds(image, masks = []) {
  let box = null;
  let count = 0;
  const maxX = Math.floor(image.width * 0.42);
  const maxY = Math.floor(image.height * 0.86);
  const inMask = (x, y) => masks.some((mask) =>
    x >= mask.x && x < mask.x + mask.w && y >= mask.y && y < mask.y + mask.h
  );
  for (let y = 0; y < maxY; y += 2) {
    for (let x = 0; x < maxX; x += 2) {
      if (inMask(x, y)) continue;
      const color = pixel(image, x, y);
      if (color.a < 64) continue;
      if (luma(color) > 244 && saturation(color) < 0.12) continue;
      if (luma(color) > 230 && saturation(color) < 0.22) continue;
      count += 1;
      box = box
        ? {
          x: Math.min(box.x, x),
          y: Math.min(box.y, y),
          w: Math.max(box.x + box.w, x + 1) - Math.min(box.x, x),
          h: Math.max(box.y + box.h, y + 1) - Math.min(box.y, y)
        }
        : { x, y, w: 1, h: 1 };
    }
  }
  if (!box || count < 2500) return null;
  return expandPxBox(box, image, 14, 14);
}

function bottomBannerBounds(image) {
  let box = null;
  let count = 0;
  const startY = Math.floor(image.height * 0.84);
  for (let y = startY; y < image.height; y += 2) {
    for (let x = 0; x < image.width; x += 2) {
      const color = pixel(image, x, y);
      if (color.a < 64) continue;
      if (saturation(color) < 0.18 || luma(color) > 210) continue;
      count += 1;
      box = box
        ? {
          x: Math.min(box.x, x),
          y: Math.min(box.y, y),
          w: Math.max(box.x + box.w, x + 1) - Math.min(box.x, x),
          h: Math.max(box.y + box.h, y + 1) - Math.min(box.y, y)
        }
        : { x, y, w: 1, h: 1 };
    }
  }
  if (!box || count < 4000) return null;
  return expandPxBox(box, image, 0, 4);
}

function refineBottomValueBannerBoxFromText(bannerBox, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const valueText = (textBoxes || []).find((textBox) => /产出价值|核心价值|价值[:：]/.test(String(textBox?.text || "")));
  if (!valueText?.box) return bannerBox;
  const textY = Number(valueText.box.y || 0);
  if (!Number.isFinite(textY) || textY <= 0) return bannerBox;
  const refinedY = Math.max(Number(bannerBox.y || 0), Math.min(textY - 28, Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt) - 36));
  return {
    x: Math.min(Number(bannerBox.x || 0), 0),
    y: round(refinedY),
    w: Math.max(Number(bannerBox.w || 0), Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt)),
    h: round(Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt) - refinedY)
  };
}

function twoPanelDiagramBounds(textBoxes, slideSize) {
  const upperBoxes = textBoxes
    .filter((item) => {
      const box = item?.box || {};
      return Number(box.y || 0) >= slideSize.heightPt * 0.18
        && Number(box.y || 0) <= slideSize.heightPt * 0.76;
    })
    .map((item) => item.box);
  const leftBoxes = upperBoxes.filter((box) => Number(box.x || 0) < slideSize.widthPt * 0.5);
  const rightBoxes = upperBoxes.filter((box) => Number(box.x || 0) >= slideSize.widthPt * 0.5);
  if (leftBoxes.length < 8 || rightBoxes.length < 4) return [];
  const leftUnion = leftBoxes.reduce((acc, box) => (acc ? unionPtBox(acc, box) : { ...box }), null);
  const rightUnion = rightBoxes.reduce((acc, box) => (acc ? unionPtBox(acc, box) : { ...box }), null);
  return [
    fitPanelBox(expandPtBox(leftUnion, slideSize, 55, 36), slideSize, {
      minX: 18,
      maxRight: slideSize.widthPt * 0.49,
      minY: slideSize.heightPt * 0.13,
      maxBottom: slideSize.heightPt * 0.79
    }),
    fitPanelBox(expandPtBox(rightUnion, slideSize, 78, 48), slideSize, {
      minX: slideSize.widthPt * 0.5,
      maxRight: slideSize.widthPt - 22,
      minY: slideSize.heightPt * 0.13,
      maxBottom: slideSize.heightPt * 0.79
    })
  ];
}

function topComplexDiagramBounds(textBoxes, slideSize) {
  const topBoxes = textBoxes
    .filter((item) => {
      const box = item?.box || {};
      return Number(box.y || 0) >= slideSize.heightPt * 0.08
        && Number(box.y || 0) <= slideSize.heightPt * 0.72;
    })
    .map((item) => item.box);
  if (topBoxes.length < 20) return null;
  const union = topBoxes.reduce((acc, box) => (acc ? unionPtBox(acc, box) : { ...box }), null);
  const expanded = expandPtBox(union, slideSize, 88, 48);
  return fitPanelBox(expanded, slideSize, {
    minX: slideSize.widthPt * 0.04,
    maxRight: slideSize.widthPt * 0.96,
    minY: slideSize.heightPt * 0.06,
    maxBottom: slideSize.heightPt * 0.7
  });
}

function collaborationFlowBounds(textBoxes, slideSize) {
  const flowBoxes = textBoxes
    .filter((item) => {
      const box = item?.box || {};
      const y = Number(box.y || 0);
      return y >= slideSize.heightPt * 0.2 && y <= slideSize.heightPt * 0.82;
    })
    .map((item) => item.box);
  if (flowBoxes.length < 9) return null;
  const union = flowBoxes.reduce((acc, box) => (acc ? unionPtBox(acc, box) : { ...box }), null);
  const expanded = expandPtBox(union, slideSize, 118, 54);
  return fitPanelBox(expanded, slideSize, {
    minX: slideSize.widthPt * 0.02,
    maxRight: slideSize.widthPt * 0.97,
    minY: slideSize.heightPt * 0.18,
    maxBottom: slideSize.heightPt * 0.84
  });
}

function wmsChainBounds(textBoxes, slideSize) {
  const topBoxes = textBoxes
    .filter((item) => {
      const box = item?.box || {};
      const y = Number(box.y || 0);
      return y >= slideSize.heightPt * 0.2 && y <= slideSize.heightPt * 0.6;
    })
    .map((item) => item.box);
  const bottomBoxes = textBoxes
    .filter((item) => {
      const box = item?.box || {};
      const y = Number(box.y || 0);
      return y >= slideSize.heightPt * 0.64 && y <= slideSize.heightPt * 0.94;
    })
    .map((item) => item.box);
  if (topBoxes.length < 10 || bottomBoxes.length < 8) return [];
  const topUnion = topBoxes.reduce((acc, box) => (acc ? unionPtBox(acc, box) : { ...box }), null);
  const bottomUnion = bottomBoxes.reduce((acc, box) => (acc ? unionPtBox(acc, box) : { ...box }), null);
  return [
    fitPanelBox(expandPtBox(topUnion, slideSize, 34, 28), slideSize, {
      minX: slideSize.widthPt * 0.02,
      maxRight: slideSize.widthPt * 0.97,
      minY: slideSize.heightPt * 0.2,
      maxBottom: slideSize.heightPt * 0.62
    }),
    fitPanelBox(expandPtBox(bottomUnion, slideSize, 34, 24), slideSize, {
      minX: slideSize.widthPt * 0.02,
      maxRight: slideSize.widthPt * 0.97,
      minY: slideSize.heightPt * 0.62,
      maxBottom: slideSize.heightPt * 0.97
    })
  ];
}

function comparisonMatrixBounds(textBoxes, slideSize) {
  const boxes = textBoxes
    .filter((item) => item?.box)
    .map((item) => item.box);
  if (boxes.length < 12) return null;
  const union = boxes.reduce((acc, box) => (acc ? unionPtBox(acc, box) : { ...box }), null);
  return fitPanelBox(expandPtBox(union, slideSize, 28, 26), slideSize, {
    minX: slideSize.widthPt * 0.02,
    maxRight: slideSize.widthPt * 0.98,
    minY: slideSize.heightPt * 0.03,
    maxBottom: slideSize.heightPt * 0.95
  });
}

function segmentComparisonMatrix(matrixBox, slideSize) {
  const splitX = round(Math.min(
    matrixBox.x + matrixBox.w * 0.69,
    slideSize.widthPt * 0.62
  ));
  const left = {
    x: matrixBox.x,
    y: matrixBox.y,
    w: round(splitX - matrixBox.x),
    h: matrixBox.h
  };
  const right = {
    x: splitX,
    y: matrixBox.y,
    w: round(matrixBox.x + matrixBox.w - splitX),
    h: matrixBox.h
  };
  return [left, right].filter((box) => box.w > 1 && box.h > 1);
}

function fitPanelBox(box, slideSize, bounds) {
  const x = Math.max(bounds.minX, box.x);
  const y = Math.max(bounds.minY, box.y);
  const right = Math.min(bounds.maxRight, box.x + box.w);
  const bottom = Math.min(bounds.maxBottom, box.y + box.h);
  return {
    x: round(x),
    y: round(y),
    w: round(Math.max(1, right - x)),
    h: round(Math.max(1, bottom - y))
  };
}

function fitSingleUnderlayAggregate(aggregate, image) {
  if (!aggregate || !image) return null;
  const areaRatio = aggregate.box.w * aggregate.box.h / Math.max(1, image.width * image.height);
  if (areaRatio <= 0.65) return aggregate;
  if (areaRatio > 0.72) return null;
  for (let inset = 1; inset <= 80; inset += 1) {
    const box = trimPxBox(aggregate.box, image, inset);
    const fittedRatio = box.w * box.h / Math.max(1, image.width * image.height);
    if (fittedRatio <= 0.65) return { ...aggregate, box };
  }
  return null;
}

function contentTextBounds(textBoxes, slideSize) {
  const contentTop = slideSize.heightPt * 0.2;
  const boxes = textBoxes
    .filter((item) => item.box && item.box.y + item.box.h >= contentTop)
    .map((item) => item.box);
  if (boxes.length < 4) return null;
  return boxes.reduce((acc, box) => (acc ? unionPtBox(acc, box) : { ...box }), null);
}

function segmentTextBoxesForUnderlay(textBoxes, slideSize) {
  const contentTop = slideSize.heightPt * 0.2;
  const boxes = textBoxes
    .filter((item) => item.box && item.box.y + item.box.h >= contentTop)
    .map((item) => item.box)
    .sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
  const rowGroups = groupBoxesByAxis(boxes, "y", 36);
  const segments = [];
  for (const row of rowGroups) {
    const columnGroups = groupBoxesByAxis(row.boxes.sort((a, b) => a.x - b.x), "x", 42);
    for (const column of columnGroups) {
      if (column.boxes.length < 2) continue;
      segments.push(expandPtBox(column.box, slideSize, 35, 30));
    }
  }
  return mergeOverlappingPtBoxes(segments, slideSize)
    .filter((box) => box.w > 90 && box.h > 55)
    .slice(0, 8);
}

function groupBoxesByAxis(boxes, axis, gapPt) {
  const groups = [];
  for (const box of boxes) {
    const start = axis === "x" ? box.x : box.y;
    const end = axis === "x" ? box.x + box.w : box.y + box.h;
    const group = groups.find((item) => start <= item.end + gapPt && end >= item.start - gapPt);
    if (group) {
      group.boxes.push(box);
      group.start = Math.min(group.start, start);
      group.end = Math.max(group.end, end);
      group.box = unionPtBox(group.box, box);
    } else {
      groups.push({ start, end, box: { ...box }, boxes: [box] });
    }
  }
  return groups;
}

function mergeOverlappingPtBoxes(boxes, slideSize) {
  const merged = [];
  for (const box of boxes) {
    const existing = merged.find((item) => boxesNearPt(item, box, 6));
    if (existing) {
      const next = unionPtBox(existing, box);
      existing.x = next.x;
      existing.y = next.y;
      existing.w = next.w;
      existing.h = next.h;
    } else {
      merged.push({ ...box });
    }
  }
  return merged.map((box) => expandPtBox(box, slideSize, 0, 0));
}

function shouldUseProductIllustrationSegmentCrops({ aggregate, image, structuralLines = [], textBoxes = [] } = {}) {
  if (!aggregate || !image) return false;
  if (textBoxes.length < 8 || structuralLines.length < 2) return false;
  const areaRatio = aggregate.box.w * aggregate.box.h / Math.max(1, image.width * image.height);
  if (areaRatio < 0.38 || areaRatio > 0.68) return false;
  if (aggregate.box.w > image.width * 0.94 && aggregate.box.h > image.height * 0.88) return false;
  const segmentBoxes = productIllustrationSegmentBoxes(image, aggregate.box);
  if (looksLikeDenseTextMatrix(aggregate.box, image, textBoxes) && segmentBoxes.length < 3) return false;
  const components = mergeGraphicComponents(foregroundComponents(image, []), image)
    .filter((component) => boxOverlapArea(component.box, aggregate.box) / Math.max(1, component.box.w * component.box.h) >= 0.62);
  const meaningful = components.filter((component) => {
    const componentArea = component.box.w * component.box.h / Math.max(1, image.width * image.height);
    const ratio = component.box.w / Math.max(1, component.box.h);
    return componentArea >= 0.006
      && componentArea <= 0.26
      && component.box.w >= image.width * 0.07
      && component.box.h >= image.height * 0.06
      && ratio >= 0.42
      && ratio <= 4.8;
  });
  if ((meaningful.length < 3 || meaningful.length > 12) && segmentBoxes.length < 3) return false;
  const paletteSource = meaningful.length >= 3 ? meaningful.map((component) => component.box) : segmentBoxes;
  const palette = new Set(paletteSource.map((box) => coarseHueBucket(sampleComponentCenterColor(image, box))).filter(Boolean));
  if (palette.size < 2) return false;
  const layoutSource = meaningful.length >= 3 ? meaningful.map((component) => component.box) : segmentBoxes;
  const wideBands = layoutSource.filter((box) => box.w >= image.width * 0.2).length;
  const tallCards = layoutSource.filter((box) => box.h >= image.height * 0.18).length;
  return wideBands >= 1 && tallCards >= 1;
}

function shouldUseCollaborationFlowUnderlay({ panel, textBoxes = [], slideSize = DEFAULT_SLIDE, structuralLines = [] } = {}) {
  if (!panel) return false;
  if (textBoxes.length < 12 || textBoxes.length > 18) return false;
  const text = textBoxes.map((item) => String(item?.text || "")).join("\n");
  const roleSignals = [/后端研发\s*BE/i, /前端研发\s*FE/i, /测试\s*QA/i]
    .filter((pattern) => pattern.test(text)).length;
  const hasEngine = /协同倍增器/.test(text) && /PM\s*Skills|PMSkills/i.test(text);
  const hasValueBanner = /研发返工率/.test(text) && /全链路降本/.test(text);
  const rightBodyText = textBoxes.filter((item) => {
    const box = item?.box || {};
    return Number(box.x || 0) >= slideSize.widthPt * 0.55
      && Number(box.y || 0) >= slideSize.heightPt * 0.2
      && Number(box.y || 0) <= slideSize.heightPt * 0.82;
  });
  const leftEngineText = textBoxes.filter((item) => {
    const box = item?.box || {};
    return Number(box.x || 0) <= slideSize.widthPt * 0.28
      && Number(box.y || 0) >= slideSize.heightPt * 0.45
      && Number(box.y || 0) <= slideSize.heightPt * 0.64;
  });
  const areaRatio = panel.w * panel.h / Math.max(1, slideSize.widthPt * slideSize.heightPt);
  const candidate = scoreDiagramCandidate({
    panels: [panel],
    textBoxes,
    slideSize,
    structuralLines,
    semanticSignals: Number(hasEngine) + Number(hasValueBanner) + roleSignals
  });
  return hasEngine
    && hasValueBanner
    && roleSignals >= 3
    && rightBodyText.length >= 9
    && leftEngineText.length >= 1
    && isAcceptableDiagramCandidate(candidate, 5)
    && areaRatio >= 0.52
    && areaRatio <= 0.68
    && panel.x <= slideSize.widthPt * 0.05
    && panel.y >= slideSize.heightPt * 0.15
    && panel.y <= slideSize.heightPt * 0.23
    && panel.w >= slideSize.widthPt * 0.9
    && panel.h >= slideSize.heightPt * 0.58
    && panel.y + panel.h <= slideSize.heightPt * 0.86;
}

function shouldUseWmsChainUnderlay({ panels, textBoxes = [], slideSize = DEFAULT_SLIDE, structuralLines = [] } = {}) {
  if (!Array.isArray(panels) || panels.length !== 2) return false;
  if (textBoxes.length < 18 || textBoxes.length > 32) return false;
  const text = textBoxes.map((item) => String(item?.text || "")).join("\n");
  const hasWmsTitle = /WMS/i.test(text) && /复杂主链路|隐性风险|物流/i.test(text);
  const tollgateSignals = ["Tollgate1", "Tollgate2", "Tollgate3"]
    .filter((item) => new RegExp(item, "i").test(text)).length;
  const cardSignals = ["挑战", "AI介入", "价值落地"]
    .filter((item) => text.includes(item)).length;
  const hasValueBanner = /产出价值/.test(text) && /高效协同|可视化实体/.test(text);
  const totalArea = panels.reduce((sum, box) => sum + box.w * box.h, 0) / Math.max(1, slideSize.widthPt * slideSize.heightPt);
  const candidate = scoreDiagramCandidate({
    panels,
    textBoxes,
    slideSize,
    structuralLines,
    semanticSignals: Number(hasWmsTitle) + tollgateSignals + cardSignals + Number(hasValueBanner)
  });
  return hasWmsTitle
    && tollgateSignals >= 3
    && cardSignals >= 3
    && hasValueBanner
    && isAcceptableDiagramCandidate(candidate, 6)
    && totalArea >= 0.56
    && totalArea <= 0.74
    && panels[0].y >= slideSize.heightPt * 0.18
    && panels[0].y <= slideSize.heightPt * 0.26
    && panels[0].h >= slideSize.heightPt * 0.34
    && panels[1].y >= slideSize.heightPt * 0.62
    && panels[1].h >= slideSize.heightPt * 0.26;
}

module.exports = { createGraphicUnderlayCrop, classifyGraphicUnderlayExpression, colorBlockRectStats, looksLikeDocumentGenerationFlowUnderlay, looksLikeProductWorkflowUnderlay, createCollaborationFlowUnderlayCrop, bottomBannerBounds, collaborationFlowBounds, fitPanelBox, shouldUseCollaborationFlowUnderlay, isAcceptableDiagramCandidate, createComparisonMatrixCrop, comparisonMatrixBounds, segmentComparisonMatrix, shouldUseComparisonMatrixCrop, createContentGraphicUnderlayCrop, contentTextBounds, shouldUseContentGraphicUnderlay, createIllustrationCardUnderlayCrop, illustrationCardBounds, shouldUseIllustrationCardUnderlay, createLeftIllustrationPanelCrops, leftIllustrationGraphicBounds, shouldUseLeftIllustrationPanelUnderlay, createLineDiagramUnderlayCrop, lineDiagramPxBounds, shouldUseLineDiagramUnderlay, createMixedDiagramUnderlayCrop, shouldUseMixedDiagramUnderlay, createProductIllustrationSegmentCrops, productIllustrationSegmentBoxes, expandProductSegmentPxBox, mergeNearbySegmentBoxes, productIllustrationBandBoxes, significantVerticalInkRunsWithoutHeader, detectWideHeaderBottom, shouldUseProductIllustrationSegmentCrops, coarseHueBucket, looksLikeDenseTextMatrix, clusterCenters, sampleComponentCenterColor, createSaturatedDiagramUnderlayCrop, saturatedGraphicBounds, shouldUseSaturatedDiagramUnderlay, createSegmentedGraphicUnderlayCrops, segmentTextBoxesForUnderlay, groupBoxesByAxis, mergeOverlappingPtBoxes, shouldUseSegmentedGraphicUnderlay, createSparseDiagramUnderlayCrop, shouldUseSparseDiagramUnderlay, createStructuredCaseUnderlayCrop, shouldUseStructuredCaseUnderlay, createTopComplexDiagramCrop, refineBottomValueBannerBoxFromText, shouldUseTopComplexDiagramCrop, topComplexDiagramBounds, createTwoPanelDiagramCrops, shouldUseTwoPanelDiagramCrops, twoPanelDiagramBounds, createVisualClusterUnderlayCrops, shouldUseVisualClusterUnderlay, visualClusterPxBounds, createWmsChainUnderlayCrops, shouldUseWmsChainUnderlay, wmsChainBounds, fitSingleUnderlayAggregate, shouldUseGraphicUnderlay };
