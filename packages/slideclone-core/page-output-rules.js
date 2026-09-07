"use strict";
const fs = require("node:fs");
const { DEFAULT_SLIDE, boxArea, intersectionArea } = require("./page-text-rule-helpers");
const { ptBoxOverlapAreaValue } = require("./diagram-geometry");
const { shouldPreserveProtectedMinimumUnitCrop, resolveAssetPathForIr } = require("./residual-primitive-erasure");
const { readPng } = require("./png");
const { residualForegroundStats, annotateResidualSplitRejection } = require("./structured-residual-splitting");
const { boxCenterInside, expandPtBox } = require("./raster-native-detection");
const { unionBoxes } = require("./visual-atom-native-metadata");
const { splitPrototypeValidationFlowResidualCrops } = require("./diagram-residual-crops");
const { boxOverlapArea } = require("./prd-generation-shapes");

function dropDecorativeCoverDuplicateForegroundCrops(page = {}, slideSize = DEFAULT_SLIDE) {
  const images = Array.isArray(page.images) ? page.images : [];
  const hasFullDecorativeBackground = images.some((image) => {
    const box = image?.box || {};
    const areaRatio = Number(box.w || 0) * Number(box.h || 0)
      / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
    return image?.source?.detector === "decorative-cover-background-underlay"
      && areaRatio >= 0.95
      && Number(box.x || 0) <= 1
      && Number(box.y || 0) <= 1;
  });
  if (!hasFullDecorativeBackground) return false;
  let dropped = false;
  page.images = images.filter((image) => {
    if (image?.source?.detector !== "foreground-graphic-crop") return true;
    const box = image.box || {};
    const areaRatio = Number(box.w || 0) * Number(box.h || 0)
      / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
    const x = Number(box.x || 0);
    const y = Number(box.y || 0);
    const right = x + Number(box.w || 0);
    const bottom = y + Number(box.h || 0);
    const nearEdge = x <= slideSize.widthPt * 0.08
      || y <= slideSize.heightPt * 0.08
      || right >= slideSize.widthPt * 0.92
      || bottom >= slideSize.heightPt * 0.9;
    const smallDecorative = areaRatio <= 0.025 && nearEdge;
    const source = image.source || {};
    const layer = source.layer || {};
    const coverDecoration = source.expressionSubtype === "cover-decoration"
      || source.expressionForm === "decorative-cover-visual"
      || (layer.layerType === "decorative-zone" && areaRatio >= 0.18 && nearEdge);
    if (!smallDecorative && !coverDecoration) return true;
    image.source = {
      ...(image.source || {}),
      decorativeCoverDuplicateForegroundCrop: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "foreground crop"}; removed because full decorative cover background already contains this decoration`
    };
    dropped = true;
    return false;
  });
  return dropped;
}

function shouldDropResidualCoveredByNativeTableText(image = {}, page = {}) {
  const source = image?.source || {};
  if (!/^(?:split-erased-residual-crop|icon-residual-crop)$/.test(String(source.detector || ""))) return false;
  if (shouldPreserveProtectedMinimumUnitCrop(image)) return false;
  const parentImageId = String(source.parentImageId || source.layer?.parentImageId || "");
  if (!parentImageId || !image?.box) return false;
  const expressionForm = String(source.expressionForm || source.layer?.expressionForm || "").toLowerCase();
  const layerType = String(source.layer?.layerType || source.layerType || "").toLowerCase();
  const archetype = String(source.layer?.diagramUnderstanding?.archetype || "").toLowerCase();
  if (!(/table|matrix|grid/.test(expressionForm) || layerType === "table-zone" || /matrix|grid|table/.test(archetype))) return false;
  if (/screenshot|photo|prototype|webpage|ui|icon|illustration/.test(`${expressionForm} ${source.reason || ""} ${source.nonEditableReason || ""}`.toLowerCase())) return false;
  const imageArea = Number(image.box.w || 0) * Number(image.box.h || 0);
  if (!Number.isFinite(imageArea) || imageArea <= 0) return false;
  const overlaps = (page.textBoxes || [])
    .filter((textBox) => textBox?.box && String(textBox?.source?.layerSourceId || "") === parentImageId)
    .filter((textBox) => String(textBox?.source?.detector || "") === "table-zone-semantic-native-visible-label")
    .filter((textBox) => textBox?.source?.textErasedFromCrop === true)
    .map((textBox) => ptBoxOverlapAreaValue(image.box, textBox.box))
    .filter((area) => area > 0);
  if (overlaps.length === 0) return false;
  const maxTextCoverRatio = Math.max(...overlaps) / imageArea;
  const totalTextCoverRatio = overlaps.reduce((sum, area) => sum + area, 0) / imageArea;
  return maxTextCoverRatio >= 0.6 || totalTextCoverRatio >= 0.68;
}

function shouldDropResidualCoveredByNativeTablePeers(image = {}, page = {}) {
  const source = image?.source || {};
  if (!/^(?:split-erased-residual-crop|icon-residual-crop)$/.test(String(source.detector || ""))) return false;
  if (shouldPreserveProtectedMinimumUnitCrop(image)) return false;
  const parentImageId = String(source.parentImageId || source.layer?.parentImageId || "");
  if (!parentImageId || !image?.box) return false;
  const expressionForm = String(source.expressionForm || source.layer?.expressionForm || "").toLowerCase();
  const layerType = String(source.layer?.layerType || source.layerType || "").toLowerCase();
  const archetype = String(source.layer?.diagramUnderstanding?.archetype || "").toLowerCase();
  if (!(/table|matrix|grid/.test(expressionForm) || layerType === "table-zone" || /matrix|grid|table/.test(archetype))) return false;
  const sourceText = `${expressionForm} ${source.reason || ""} ${source.nonEditableReason || ""}`.toLowerCase();
  if (/screenshot|photo|prototype|webpage|ui|icon|illustration/.test(sourceText)) return false;
  const imageArea = Number(image.box.w || 0) * Number(image.box.h || 0);
  if (!Number.isFinite(imageArea) || imageArea <= 0 || imageArea > 14000) return false;
  const semanticTextOverlaps = (page.textBoxes || [])
    .filter((textBox) => textBox?.box && String(textBox?.source?.layerSourceId || "") === parentImageId)
    .filter((textBox) => String(textBox?.source?.detector || "") === "table-zone-semantic-native-visible-label")
    .filter((textBox) => textBox?.source?.textErasedFromCrop === true)
    .map((textBox) => ptBoxOverlapAreaValue(image.box, textBox.box))
    .filter((area) => area > 0);
  if (semanticTextOverlaps.length === 0) return false;
  const nativeShapeDetectors = /^(?:table-zone-native-cell-fill|table-zone-native-grid-line|visual-atom-native-(?:right-arrow|rect|chevron|parallelogram|triangle|diamond|connector))$/;
  const nativeShapeOverlaps = (page.shapes || [])
    .filter((shape) => shape?.box && String(shape?.source?.layerSourceId || "") === parentImageId)
    .filter((shape) => nativeShapeDetectors.test(String(shape?.source?.detector || "")))
    .map((shape) => ({
      detector: String(shape?.source?.detector || ""),
      area: ptBoxOverlapAreaValue(image.box, renderableShapeBox(shape))
    }))
    .filter((item) => item.area > 0);
  const connectorLikeCount = nativeShapeOverlaps.filter((item) =>
    /(?:grid-line|connector|right-arrow)/.test(item.detector)
  ).length;
  if (connectorLikeCount < 2) return false;
  const textCoverRatio = semanticTextOverlaps.reduce((sum, area) => sum + area, 0) / imageArea;
  const shapeCoverRatio = nativeShapeOverlaps.reduce((sum, item) => sum + item.area, 0) / imageArea;
  const combinedCoverRatio = textCoverRatio + shapeCoverRatio;
  return connectorLikeCount >= 2
    && shapeCoverRatio >= 0.04
    && (
      (textCoverRatio >= 0.08 && combinedCoverRatio >= 0.12)
      || (nativeShapeOverlaps.length >= 4 && textCoverRatio >= 0.045 && combinedCoverRatio >= 0.085)
    );
}

function dropTableMatrixResidualObjectifiedCrops(page = {}) {
  if (!Array.isArray(page.images) || page.images.length === 0) return page;
  page.images = page.images.filter((image) => {
    if (image?.source?.tableMatrixResidualObjectified === true && image?.source?.dropErasedResidualAfterNativeRebuild === true) {
      image.source.tableMatrixResidualDropped = true;
      return false;
    }
    return true;
  });
  return page;
}

function dropResidualsCoveredByNativeTableText(page = {}) {
  if (!Array.isArray(page.images) || page.images.length === 0 || !Array.isArray(page.textBoxes) || page.textBoxes.length === 0) {
    return page;
  }
  page.images = page.images.filter((image) => {
    if (!shouldDropResidualCoveredByNativeTableText(image, page) && !shouldDropResidualCoveredByNativeTablePeers(image, page)) return true;
    if (image.source && typeof image.source === "object") image.source.residualSplitDropped = true;
    return false;
  });
  return page;
}

function shouldDropMostlyBlankCoveredResidualCrop(image = {}, page = {}, irDir = null) {
  const source = image?.source || {};
  const detector = String(source.detector || "");
  if (!/residual|split/.test(detector)) return false;
  const parentImageId = String(source.parentImageId || source.layer?.parentImageId || "");
  if (!parentImageId || !image?.box) return false;
  const imageArea = Number(image.box.w || 0) * Number(image.box.h || 0);
  if (!Number.isFinite(imageArea) || imageArea <= 0) return false;
  const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
  if (!assetFile || !fs.existsSync(assetFile)) return false;
  let stats;
  try {
    stats = residualForegroundStats(readPng(assetFile));
  } catch {
    return false;
  }
  if (Number(stats.foregroundRatio || 0) > 0.004) return false;
  // An entirely blank residual has no visual minimum unit to preserve. Once
  // native peers cover its parent region, retaining it only creates a raster
  // underlay behind already-editable content.
  const shapeCover = (page.shapes || [])
    .filter((shape) => shape?.box && String(shape?.source?.layerSourceId || "") === parentImageId)
    .reduce((sum, shape) => sum + ptBoxOverlapAreaValue(image.box, shape.box), 0);
  const textCover = (page.textBoxes || [])
    .filter((textBox) => textBox?.box && String(textBox?.source?.layerSourceId || "") === parentImageId)
    .reduce((sum, textBox) => sum + ptBoxOverlapAreaValue(image.box, textBox.box), 0);
  const coverRatio = (shapeCover + textCover) / imageArea;
  return coverRatio >= 0.6;
}

function hasProtectedMinimumUnitToken(text = "") {
  const normalized = String(text || "").toLowerCase();
  return /\b(?:screenshot|photo|prototype|webpage|ui|icon|illustration|sketch|sticky|decorative|brand)\b/.test(normalized);
}

function dropMostlyBlankCoveredResidualCrops(page = {}, irDir = null) {
  if (!Array.isArray(page.images) || page.images.length === 0) return page;
  page.images = page.images.filter((image) => {
    if (!shouldDropMostlyBlankCoveredResidualCrop(image, page, irDir)) return true;
    if (image.source && typeof image.source === "object") {
      image.source.residualSplitDropped = true;
      image.source.residualSplitDropReason = "mostly-blank-residual-covered-by-native-peers";
    }
    return false;
  });
  return page;
}

function shouldDropPluginTemplateCoveredStructuralUnderlay(image = {}, page = {}) {
  const source = image?.source || {};
  const strategy = source.componentRenderStrategy || {};
  const readiness = source.componentAssetReadiness || {};
  const expressionForm = String(source.expressionForm || source.layer?.expressionForm || "").toLowerCase();
  const expressionSubtype = String(source.expressionSubtype || source.layer?.expressionSubtype || "").toLowerCase();
  const expressionText = `${expressionForm} ${expressionSubtype} ${source.layerType || source.layer?.layerType || ""} ${source.reason || ""} ${source.nonEditableReason || ""}`.toLowerCase();
  if (hasProtectedMinimumUnitToken(expressionText)) return false;
  if (expressionForm !== "complex-diagram") return false;
  if (expressionSubtype !== "dense-complex-diagram") return false;
  if (String(strategy.mode || "") !== "plugin-component-template") return false;
  if (String(readiness.status || "") !== "applied-plugin-motif-ready") return false;
  const candidateScore = Number(strategy.bestCandidate?.candidateScore || strategy.bestCandidate?.confidence * 100 || 0);
  if (!Number.isFinite(candidateScore) || candidateScore < 72) return false;
  if (!image?.box) return false;
  const imageArea = Number(image.box.w || 0) * Number(image.box.h || 0);
  if (!Number.isFinite(imageArea) || imageArea <= 0) return false;
  const layerId = String(image.id || "");
  if (!layerId) return false;
  const coveringShapes = (page.shapes || []).filter((shape) => (
    shape?.box
    && String(shape?.source?.layerSourceId || "") === layerId
    && String(shape?.source?.detector || "") === "plugin-component-template-native-shape"
  ));
  if (coveringShapes.length < 10) return false;
  const coveredArea = coveringShapes.reduce((sum, shape) => sum + ptBoxOverlapAreaValue(image.box, shape.box), 0);
  const coverRatio = Math.min(1, coveredArea / imageArea);
  return coverRatio >= 0.78;
}

function dropPluginTemplateCoveredStructuralUnderlays(page = {}) {
  if (!Array.isArray(page.images) || page.images.length === 0) return page;
  page.images = page.images.filter((image) => {
    if (!shouldDropPluginTemplateCoveredStructuralUnderlay(image, page)) return true;
    if (image.source && typeof image.source === "object") {
      image.source.pluginTemplateUnderlayDropped = true;
      image.source.pluginTemplateUnderlayDropReason = "dense-structural-diagram-covered-by-applied-plugin-native-shapes";
    }
    return false;
  });
  return page;
}

function shouldDropPluginTemplateCoveredSmallResidualCrop(image = {}, page = {}) {
  const source = image?.source || {};
  const detector = String(source.detector || "");
  if (!/split-erased-residual-crop|split-focused-foreground-residual-crop/.test(detector)) return false;
  const expressionForm = String(source.expressionForm || source.layer?.expressionForm || "").toLowerCase();
  const expressionSubtype = String(source.expressionSubtype || source.layer?.expressionSubtype || "").toLowerCase();
  const expressionText = `${expressionForm} ${expressionSubtype} ${source.layerType || source.layer?.layerType || ""} ${source.reason || ""} ${source.nonEditableReason || ""}`.toLowerCase();
  if (hasProtectedMinimumUnitToken(expressionText)) return false;
  if (expressionForm !== "complex-diagram") return false;
  if (!image?.box) return false;
  const imageArea = Number(image.box.w || 0) * Number(image.box.h || 0);
  if (!Number.isFinite(imageArea) || imageArea <= 0 || imageArea > 8000) return false;
  const parentImageId = String(source.parentImageId || source.layer?.parentImageId || "");
  if (!parentImageId) return false;
  const pluginShapes = (page.shapes || []).filter((shape) => (
    shape?.box
    && String(shape?.source?.layerSourceId || "") === parentImageId
    && String(shape?.source?.detector || "") === "plugin-component-template-native-shape"
  ));
  if (pluginShapes.length === 0) return false;
  const coverArea = pluginShapes.reduce((sum, shape) => sum + ptBoxOverlapAreaValue(image.box, shape.box), 0);
  return Math.min(1, coverArea / imageArea) >= 0.98;
}

function dropPluginTemplateCoveredSmallResidualCrops(page = {}) {
  if (!Array.isArray(page.images) || page.images.length === 0) return page;
  page.images = page.images.filter((image) => {
    if (!shouldDropPluginTemplateCoveredSmallResidualCrop(image, page)) return true;
    if (image.source && typeof image.source === "object") {
      image.source.pluginTemplateResidualDropped = true;
      image.source.pluginTemplateResidualDropReason = "small-residual-fully-covered-by-applied-plugin-native-shape";
    }
    return false;
  });
  return page;
}

function shouldDropWmsObjectifiedValuePanelResidualCrop(image = {}, page = {}) {
  const source = image?.source || {};
  const detector = String(source.detector || "");
  if (!/icon-residual-crop|split-erased-residual-crop|split-focused-foreground-residual-crop/.test(detector)) return false;
  const parentImageId = String(source.parentImageId || source.layer?.parentImageId || "");
  if (!/wms-chain-underlay/.test(parentImageId)) return false;
  const box = image.box || {};
  const area = Number(box.w || 0) * Number(box.h || 0);
  if (!Number.isFinite(area) || area <= 0 || area > 9000) return false;
  const sameParentShapes = (page.shapes || []).filter((shape) =>
    shape?.box && String(shape?.source?.layerSourceId || "") === parentImageId
  );
  const hasValuePanelNative = sameParentShapes.some((shape) =>
    /wms-route-chain-native-value-card|wms-route-chain-native-value-route|wms-route-chain-native-output-banner/.test(String(shape?.source?.detector || ""))
  );
  if (!hasValuePanelNative) return false;
  const hasTopRouteOnlyNative = sameParentShapes.some((shape) =>
    /wms-route-chain-native-road|wms-route-chain-native-ai-shield|wms-route-chain-native-intercept-pill/.test(String(shape?.source?.detector || ""))
  );
  if (hasTopRouteOnlyNative && !hasValuePanelNative) return false;
  return true;
}

function dropWmsObjectifiedValuePanelResidualCrops(page = {}) {
  if (!Array.isArray(page.images) || page.images.length === 0) return page;
  page.images = page.images.filter((image) => {
    if (!shouldDropWmsObjectifiedValuePanelResidualCrop(image, page)) return true;
    if (image.source && typeof image.source === "object") {
      image.source.wmsResidualDropped = true;
      image.source.wmsResidualDropReason = "wms-value-panel-residual-covered-by-native-value-cards-and-labels";
    }
    return false;
  });
  return page;
}

function shouldDropWmsObjectifiedTopRouteUnderlay(image = {}, page = {}) {
  const source = image?.source || {};
  if (String(source.detector || "") !== "wms-chain-underlay-crop") return false;
  // Native-only WMS output is useful for controlled experiments, but it still
  // loses fidelity versus the retained visual layer. Keep fidelity-first as the
  // default until the smallest icon residuals are materialized.
  if (source.strictNativeRebuild !== true) return false;
  const box = image.box || {};
  // The WMS extractor produces separate crops for the route and the value cards.
  // Only the shallow top crop can be removed by this route-specific coverage check.
  if (Number(box.y || 0) > 180 || Number(box.h || 0) > 250) return false;
  const nativeShapes = (page.shapes || []).filter((shape) => (
    shape?.box && String(shape?.source?.layerSourceId || "") === String(image.id || "")
  ));
  const detectors = new Set(nativeShapes.map((shape) => String(shape?.source?.detector || "")));
  const count = (detector) => nativeShapes.filter((shape) => shape?.source?.detector === detector).length;
  const nativeText = (page.textBoxes || []).filter((textBox) => boxCenterInside(textBox?.box, box));
  const roles = new Set(nativeText.map((textBox) => String(textBox?.source?.role || "")));
  return detectors.has("wms-route-chain-native-backplate")
    && detectors.has("wms-route-chain-native-road")
    && detectors.has("wms-route-chain-native-document")
    && detectors.has("wms-route-chain-native-rail")
    && count("wms-route-chain-native-ai-shield") >= 3
    && count("wms-route-chain-native-node") >= 4
    && count("wms-route-chain-native-intercept-pill") >= 3
    && roles.has("route-node-label")
    && roles.has("gate-pill-label")
    && roles.has("version-chip-label")
    && roles.has("ai-shield-label");
}

function dropWmsObjectifiedTopRouteUnderlay(page = {}) {
  if (!Array.isArray(page.images) || page.images.length === 0) return page;
  page.images = page.images.filter((image) => {
    if (!shouldDropWmsObjectifiedTopRouteUnderlay(image, page)) return true;
    return false;
  });
  return page;
}

function renderableShapeBox(shape = {}) {
  const box = shape.box || {};
  const strokeWidth = Math.max(1, Number(shape.style?.strokeWidthPt || 0));
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  if (String(shape.type || "") === "line") {
    const left = Math.min(x, x + w);
    const top = Math.min(y, y + h);
    return {
      x: left - strokeWidth / 2,
      y: top - strokeWidth / 2,
      w: Math.max(Math.abs(w), strokeWidth),
      h: Math.max(Math.abs(h), strokeWidth)
    };
  }
  return box;
}

function markTwoPanelChaosIllustrationPreserved(image = {}) {
  const previousStrategy = image.source?.componentRenderStrategy || image.source?.layer?.componentRenderStrategy || {};
  const componentRenderStrategy = {
    ...previousStrategy,
    mode: "preserve-local-crop",
    implementationMode: "native-generator-safe-fallback",
    editableExpectation: "standalone-illustrative-diagram-preserved-as-movable-crop",
    visualFidelityBias: "fidelity-first",
    reason: "dense chaotic source illustration is treated as an intentional minimum visual unit"
  };
  const previousLayer = image.source?.layer && typeof image.source.layer === "object" ? image.source.layer : {};
  const nextLayer = {
    ...previousLayer,
    layerType: previousLayer.layerType || image.source?.layerType || "illustration-zone",
    standaloneVisualAsset: true,
    expressionFamily: "pictorial-asset",
    expressionForm: "icon-or-illustration",
    expressionSubtype: "workflow-supply-chain-chaos-illustration",
    componentRenderStrategy: {
      ...(previousLayer.componentRenderStrategy || {}),
      ...componentRenderStrategy
    }
  };
  image.source = {
    ...(image.source || {}),
    editable: false,
    standaloneVisualAsset: true,
    expressionFamily: "pictorial-asset",
    expressionForm: "icon-or-illustration",
    expressionSubtype: "workflow-supply-chain-chaos-illustration",
    recommendedAction: "preserve-local-crop",
    skipVisualAtomRebuild: true,
    componentRenderStrategy,
    layer: nextLayer,
    twoPanelDiagramTextObjectified: undefined,
    twoPanelDiagramSkeletonObjectified: undefined,
    visualAtomOverlayOnly: undefined,
    nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "supply-chain chaotic source panel"}; preserved as an intentional fidelity crop because it is a dense illustrative diagram unit, not a reliable editable structure`
  };
  return image;
}

function filterShapesClaimedByToolIslandTransitionMatrix(shapes = [], active = false) {
  if (!active) return shapes;
  return (shapes || []).filter((shape) => String(shape?.source?.detector || "").startsWith("tool-island-transition-native-"));
}

function suppressSmallVisualAtomsCoveredByAnchoredSemanticLabels(shapes = [], textBoxes = []) {
  const anchoredLabels = (Array.isArray(textBoxes) ? textBoxes : [])
    .filter((textBox) => textBox?.source?.detector === "table-zone-semantic-native-visible-label")
    .filter((textBox) => textBox?.source?.labelAnchoredToNativeAtom === true)
    .filter((textBox) => textBox?.box);
  if (anchoredLabels.length === 0) return shapes;
  return (Array.isArray(shapes) ? shapes : []).filter((shape) => {
    if (!isSuppressibleSemanticLabelFragment(shape)) return true;
    const atomId = String(shape?.source?.atomId || "");
    const shapeArea = boxArea(shape.box);
    for (const label of anchoredLabels) {
      if (String(label?.source?.labelHostAtomId || "") === atomId) continue;
      if (String(label?.source?.layerSourceId || "") && String(shape?.source?.layerSourceId || "") !== String(label.source.layerSourceId)) continue;
      const overlap = intersectionArea(shape.box, label.box);
      if (overlap <= 0) continue;
      const labelArea = boxArea(label.box);
      const overlapLabelRatio = overlap / Math.max(1, labelArea);
      const overlapShapeRatio = overlap / Math.max(1, shapeArea);
      if (shapeArea <= labelArea * 0.45 && overlapLabelRatio >= 0.045 && overlapShapeRatio >= 0.45) {
        return false;
      }
    }
    return true;
  });
}

function suppressRedundantTableGridScaffoldCoveredByVisualAtoms(shapes = [], slideSize = {}) {
  if (!Array.isArray(shapes) || shapes.length === 0) return shapes;
  const byLayer = new Map();
  for (const shape of shapes) {
    const layerSourceId = String(shape?.source?.layerSourceId || "");
    if (!layerSourceId) continue;
    if (!byLayer.has(layerSourceId)) byLayer.set(layerSourceId, []);
    byLayer.get(layerSourceId).push(shape);
  }
  const suppressedLayerIds = new Set();
  for (const [layerSourceId, layerShapes] of byLayer.entries()) {
    if (shouldSuppressTableGridScaffoldForLayer(layerShapes, slideSize)) {
      suppressedLayerIds.add(layerSourceId);
    }
  }
  if (suppressedLayerIds.size === 0) return shapes;
  return shapes.filter((shape) => {
    if (shape?.source?.detector !== "table-zone-native-grid-line") return true;
    return !suppressedLayerIds.has(String(shape?.source?.layerSourceId || ""));
  });
}

function shouldSuppressTableGridScaffoldForLayer(layerShapes = [], slideSize = {}) {
  const gridLines = layerShapes.filter((shape) => shape?.source?.detector === "table-zone-native-grid-line" && shape?.box);
  if (gridLines.length < 3 || gridLines.length > 12) return false;
  const visualAtoms = layerShapes.filter((shape) => /^visual-atom-native-/.test(String(shape?.source?.detector || "")) && shape?.box);
  const connectors = visualAtoms.filter((shape) => String(shape?.source?.detector || "") === "visual-atom-native-connector");
  const nodeAtoms = visualAtoms.filter((shape) => /visual-atom-native-(?:rect|ellipse|text-pill|donut|donut-segment)/.test(String(shape?.source?.detector || "")));
  if (visualAtoms.length < 14 || connectors.length < 6 || nodeAtoms.length < 6) return false;
  const gridBounds = unionBoxes(gridLines.map((shape) => shape.box));
  const atomBounds = unionBoxes(visualAtoms.map((shape) => shape.box));
  if (!gridBounds || !atomBounds) return false;
  const pageW = Math.max(Number(slideSize?.width || slideSize?.w || 0), gridBounds.w, atomBounds.w, 1);
  const pageH = Math.max(Number(slideSize?.height || slideSize?.h || 0), gridBounds.h, atomBounds.h, 1);
  const horizontal = gridLines.filter((shape) => Number(shape.box.w || 0) >= Number(shape.box.h || 0) * 4);
  const vertical = gridLines.filter((shape) => Number(shape.box.h || 0) >= Number(shape.box.w || 0) * 4);
  const hasWideHorizontal = horizontal.some((shape) => Number(shape.box.w || 0) >= pageW * 0.55);
  const hasTallVertical = vertical.some((shape) => Number(shape.box.h || 0) >= pageH * 0.45);
  const gridCoversAtoms =
    intersectionArea(gridBounds, atomBounds) >= boxArea(atomBounds) * 0.72
    || intersectionArea(atomBounds, gridBounds) >= boxArea(gridBounds) * 0.35;
  return hasWideHorizontal && hasTallVertical && gridCoversAtoms;
}

function isSuppressibleSemanticLabelFragment(shape = {}) {
  const detector = String(shape?.source?.detector || "");
  if (!/^visual-atom-native-(?:rect|ellipse)$/.test(detector)) return false;
  if (!shape?.box) return false;
  if (shape.source?.topologyRole === "container") return false;
  if (Array.isArray(shape.source?.containedAtomIds) && shape.source.containedAtomIds.length > 0) return false;
  return boxArea(shape.box) <= 900;
}

function materializePrototypeValidationResidualCrops(page = {}, irDir = null) {
  if (!page || !Array.isArray(page.images)) return false;
  const existingParents = new Set(page.images
    .map((image) => String(image?.source?.parentImageId || ""))
    .filter(Boolean));
  const additions = [];
  for (const image of page.images) {
    const regions = image?.source?.prototypeValidationResidualBoxes;
    if (
      image?.source?.prototypeValidationFlowObjectified !== true
      || image?.source?.residualSplit === true
      || !Array.isArray(regions)
      || regions.length === 0
      || existingParents.has(String(image.id || ""))
    ) continue;
    const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
    if (!assetFile || !fs.existsSync(assetFile)) {
      annotateResidualSplitRejection(image, { reason: "missing-prototype-validation-residual-asset" });
      continue;
    }
    const residual = readPng(assetFile);
    additions.push(...splitPrototypeValidationFlowResidualCrops(image, residual, assetFile, irDir));
  }
  if (additions.length === 0) return false;
  page.images.push(...additions);
  return true;
}

function dropPrototypeValidationResidualCropsWhenNativeCoverage(page = {}, shapes = []) {
  const images = Array.isArray(page.images) ? page.images : [];
  const dropIds = new Set();
  for (const shape of Array.isArray(shapes) ? shapes : []) {
    if (/^prototype-validation-flow-native-/.test(String(shape?.source?.detector || ""))) {
      const layerId = String(shape?.source?.layerSourceId || "");
      if (layerId) dropIds.add(layerId);
    }
  }
  for (const image of images) {
    if (
      image?.source?.prototypeValidationFlowObjectified === true
      && image?.source?.dropErasedResidualAfterNativeRebuild === true
    ) {
      dropIds.add(String(image.id || ""));
    }
  }
  if (dropIds.size === 0) return false;
  page.images = images.filter((image) => {
    const id = String(image?.id || "");
    const detector = String(image?.source?.detector || "");
    if (dropIds.has(id) && detector !== "foreground-graphic-crop" && image?.source?.prototypeValidationFlowObjectified !== true) {
      return true;
    }
    if (!dropIds.has(id)) return true;
    image.source = {
      ...(image.source || {}),
      prototypeValidationResidualCoveredByNative: true,
      residualSplitDropped: true,
      residualSplitDropReason: "prototype-validation-flow-covered-by-native-rebuild",
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "prototype validation residual"}; removed after native prototype-validation flow coverage`
    };
    return false;
  });
  return true;
}

function dropDemandUnderstandingResidualCropsWhenNativeCoverage(page = {}, shapes = []) {
  const images = page.images || [];
  const demandShapes = (shapes || []).filter((shape) =>
    /^demand-understanding-flow-native-/.test(String(shape?.source?.detector || ""))
    && shape?.box
  );
  const cards = demandShapes.filter((shape) => shape.source?.detector === "demand-understanding-flow-native-card");
  const materialCards = demandShapes.filter((shape) => shape.source?.detector === "demand-understanding-flow-native-material-card");
  const convergenceParts = demandShapes.filter((shape) =>
    /^demand-understanding-flow-native-(?:beam|beam-guide)$/.test(String(shape.source?.detector || ""))
  );
  const connectors = demandShapes.filter((shape) => shape.source?.detector === "demand-understanding-flow-native-connector");
  if (cards.length < 4 || materialCards.length < 3 || convergenceParts.length < 4 || connectors.length < 4) return false;

  const demandLayerIds = new Set(demandShapes.map((shape) => String(shape.source?.layerSourceId || "")).filter(Boolean));
  const coverageBoxes = demandShapes.map((shape) => expandPtBox(shape.box, DEFAULT_SLIDE, 10, 10));
  let dropped = 0;
  for (const image of images) {
    if (!shouldDropDemandUnderstandingResidualCrop(image, coverageBoxes, demandLayerIds)) continue;
    image.source = {
      ...(image.source || {}),
      demandUnderstandingResidualCoveredByNative: true,
      residualSplitDropped: true,
      residualSplitDropReason: "demand-understanding-flow-covered-by-native-rebuild",
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "demand understanding residual"}; removed after native demand-understanding flow coverage passed threshold`
    };
    dropped += 1;
  }
  if (dropped === 0) return false;
  page.images = images.filter((image) => image?.source?.demandUnderstandingResidualCoveredByNative !== true);
  return true;
}

function shouldDropDemandUnderstandingResidualCrop(image, coverageBoxes = [], demandLayerIds = new Set()) {
  const detector = String(image?.source?.detector || "");
  if (!/^(?:split-wide-residual-crop|split-erased-residual-crop|foreground-graphic-underlay-crop)$/.test(detector)) return false;
  const parentDetector = String(image?.source?.parentDetector || "");
  if (parentDetector && parentDetector !== "foreground-graphic-underlay-crop") return false;
  const sourceIds = [
    image?.id,
    image?.source?.layerSourceId,
    image?.source?.parentImageId,
    image?.source?.originalImageId,
    image?.source?.originalCropId
  ].map((value) => String(value || "")).filter(Boolean);
  if (demandLayerIds.size > 0 && sourceIds.length > 0 && !sourceIds.some((id) =>
    demandLayerIds.has(id) || [...demandLayerIds].some((layerId) => id.startsWith(`${layerId}-split-`))
  )) return false;
  const box = image?.box || {};
  if (!box.w || !box.h) return false;
  const imageArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const overlapArea = coverageBoxes.reduce((sum, nativeBox) => sum + boxOverlapArea(box, nativeBox), 0);
  if (overlapArea / imageArea >= 0.18) return true;
  const centerBox = {
    x: Number(box.x || 0) + Number(box.w || 0) / 2,
    y: Number(box.y || 0) + Number(box.h || 0) / 2,
    w: 1,
    h: 1
  };
  return coverageBoxes.some((nativeBox) => boxCenterInside(centerBox, nativeBox));
}

function dropEntropyChallengeCropsWhenNativeCoverage(page = {}, shapes = [], options = {}) {
  const allowFullNativeApproximation = options.allowNativeApproximation === true;
  const allowIslandOnly = options.allowIslandOnly === true;
  if (!allowFullNativeApproximation && !allowIslandOnly) return false;
  const images = page.images || [];
  const entropyImages = images.filter((image) => /^(?:entropy-challenge-crop|entropy-challenge-island-crop)$/.test(image?.source?.detector || ""));
  if (entropyImages.length === 0) return false;
  if (!hasEntropyChallengeFinalPageEvidence(page.textBoxes || [])) return false;
  const detectorCounts = new Map();
  for (const shape of shapes || []) {
    const detector = shape?.source?.detector || "";
    detectorCounts.set(detector, (detectorCounts.get(detector) || 0) + 1);
  }
  const fragmentCount = (detectorCounts.get("entropy-fragment-cloud-native-shard") || 0)
    + (detectorCounts.get("entropy-fragment-cloud-native-chip") || 0)
    + (detectorCounts.get("entropy-fragment-cloud-native-dust") || 0);
  const islandCount = (detectorCounts.get("entropy-island-native-frame") || 0)
    + (detectorCounts.get("entropy-island-native-grid") || 0)
    + (detectorCounts.get("entropy-island-native-fine-grid") || 0)
    + (detectorCounts.get("entropy-island-native-micro-mark") || 0)
    + (detectorCounts.get("entropy-island-native-route") || 0);
  const hasEnoughFragmentCoverage = fragmentCount >= 22;
  const hasEnoughIslandCoverage = islandCount >= 34
    && (detectorCounts.get("entropy-island-native-route") || 0) >= 8
    && (detectorCounts.get("entropy-island-native-frame") || 0) >= 2;
  if (allowFullNativeApproximation && (!hasEnoughFragmentCoverage || !hasEnoughIslandCoverage)) return false;
  if (allowIslandOnly && !hasEnoughIslandCoverage) return false;
  const replaceableImages = allowFullNativeApproximation
    ? entropyImages
    : entropyImages.filter((image) => image?.source?.detector === "entropy-challenge-island-crop");
  if (replaceableImages.length === 0) return false;
  for (const image of replaceableImages) {
    image.source = {
      ...(image.source || {}),
      entropyChallengeCropReplacedByNative: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "entropy challenge crop"}; removed after native entropy island/frame coverage passed threshold`
    };
  }
  page.images = images.filter((image) => image?.source?.entropyChallengeCropReplacedByNative !== true);
  return true;
}

function hasEntropyChallengeFinalPageEvidence(textBoxes = []) {
  const normalized = textBoxes.map((item) => String(item?.text || "").replace(/\s+/g, "")).join("\n");
  const hasTitle = /产品资产的?[“"]?(?:熵增|摘增)[”"]?挑战/.test(normalized);
  const bottomSignals = ["资产碎片化", "技能孤岛", "协作断层", "维护高"]
    .filter((signal) => normalized.includes(signal)).length;
  return hasTitle && bottomSignals >= 3;
}

module.exports = { markTwoPanelChaosIllustrationPreserved, filterShapesClaimedByToolIslandTransitionMatrix, dropDecorativeCoverDuplicateForegroundCrops, dropTableMatrixResidualObjectifiedCrops, dropResidualsCoveredByNativeTableText, shouldDropResidualCoveredByNativeTablePeers, renderableShapeBox, shouldDropResidualCoveredByNativeTableText, dropMostlyBlankCoveredResidualCrops, shouldDropMostlyBlankCoveredResidualCrop, dropPluginTemplateCoveredStructuralUnderlays, shouldDropPluginTemplateCoveredStructuralUnderlay, hasProtectedMinimumUnitToken, dropPluginTemplateCoveredSmallResidualCrops, shouldDropPluginTemplateCoveredSmallResidualCrop, dropWmsObjectifiedValuePanelResidualCrops, shouldDropWmsObjectifiedValuePanelResidualCrop, dropWmsObjectifiedTopRouteUnderlay, shouldDropWmsObjectifiedTopRouteUnderlay, suppressSmallVisualAtomsCoveredByAnchoredSemanticLabels, isSuppressibleSemanticLabelFragment, suppressRedundantTableGridScaffoldCoveredByVisualAtoms, shouldSuppressTableGridScaffoldForLayer, materializePrototypeValidationResidualCrops, dropPrototypeValidationResidualCropsWhenNativeCoverage, dropDemandUnderstandingResidualCropsWhenNativeCoverage, shouldDropDemandUnderstandingResidualCrop, dropEntropyChallengeCropsWhenNativeCoverage, hasEntropyChallengeFinalPageEvidence };
