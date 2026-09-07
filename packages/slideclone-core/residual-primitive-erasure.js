"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { classifyObviousMinimumVisualAssetCrop } = require("./image-layer-metadata");
const { boxCenterInside, ptToPxBox, expandPtBox, ptLineToPxMask, sampleMaskBackgroundColor, maskBounds, pointInMask } = require("./raster-native-detection");
const { cropPng, writePng } = require("./png");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isFidelityFirstMinimumVisualUnit(image = {}) {
  const source = image?.source || {};
  // A high-confidence WMS route chain is a semantic process, not a standalone icon.
  // Let its dedicated rebuilder replace the chain; it will still retain any unresolved icon detail locally.
  if (isStructuredWmsRouteChainNativeCandidate(image)) return false;
  const strategy = source.componentRenderStrategy || source.layer?.componentRenderStrategy || {};
  if (String(strategy.mode || "") !== "preserve-local-crop") return false;
  const signal = [
    strategy.editableExpectation,
    strategy.visualFidelityBias,
    strategy.reason,
    source.editableExpectation,
    source.reason,
    source.nonEditableReason,
    source.nativeRebuildDeferredReason,
    source.expressionForm,
    source.expressionSubtype,
    source.detector,
    source.layer?.layerType,
    source.layer?.expressionForm,
    source.layer?.expressionSubtype,
    source.layer?.recommendedAction
  ].map((value) => String(value || "")).join(" ").toLowerCase();
  const hasVerifiedEditableComponent = /verified editable component/.test(signal)
    && !/without a verified editable component/.test(signal);
  if (/native-overlays/.test(signal) || hasVerifiedEditableComponent) return false;
  return /fidelity-first|standalone-visual-asset|preserved visual unit|screenshot|document|screen-capture|illustration|icon|图标|图示|截图|插画/.test(signal);
}

function isStructuredWmsRouteChainNativeCandidate(image = {}) {
  const source = image?.source || {};
  if (source.detector !== "wms-chain-underlay-crop") return false;
  const understanding = source.layer?.diagramUnderstanding || source.diagramUnderstanding || {};
  const evidence = [
    source.layer?.evidence?.semanticText,
    source.layer?.evidence?.pageText,
    source.layer?.evidence?.allText,
    source.semanticText,
    source.pageText,
    source.allText,
    understanding.semanticText,
    understanding.evidence?.semanticText,
    understanding.evidence
  ].map((value) => Array.isArray(value) ? value.join(" ") : String(value || "")).join(" ");
  const tollgateIds = new Set(
    [...evidence.matchAll(/Tollgate\s*([1-9]\d*)/gi)].map((match) => match[1])
  );
  const hasExplicitWmsRouteSemantics = /WMS\s*Inbound/i.test(evidence) && tollgateIds.size >= 2;
  const supportedArchetype = understanding.archetype === "flow-card-chain"
    || (understanding.archetype === "timeline-roadmap" && hasExplicitWmsRouteSemantics);
  // This runs before the later policy annotation pass. Use direct structural
  // evidence here instead of relying on a policy field that may not exist yet.
  return supportedArchetype
    && Number(understanding.confidence || 0) >= 0.85
    && understanding.nativeReadiness === "native-rebuild"
    && Number(understanding.nodeCount || understanding.visualNodeCount || 0) >= 4
    && Number(understanding.connectorCount || understanding.visualConnectorCount || 0) >= 2;
}

function shouldKeepStructuredVisualAtomLayerText(image) {
  const source = image?.source || {};
  if (source.detector === "wms-chain-underlay-crop") return false;
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  if (source.detector === "illustration-card-graphic-underlay-crop"
    && layer.layerType === "illustration-zone"
    && layer.recommendedAction === "split-native-with-residual-crop"
    && understanding.archetype === "process-with-screenshots"
    && Number(understanding.confidence || 0) >= 0.82
    && Number(understanding.nodeCount || 0) >= 3) {
    return true;
  }
  const counts = understanding.visualAtomKindCounts || {};
  const nativeNodeAtomCount = Number(counts["native-rect-candidate"] || 0)
    + Number(counts["native-ellipse-candidate"] || 0)
    + Number(counts["native-diamond-candidate"] || 0)
    + Number(counts["native-triangle-candidate"] || 0)
    + Number(counts["native-chevron-candidate"] || 0)
    + Number(counts["native-parallelogram-candidate"] || 0)
    + Number(counts["native-cylinder-candidate"] || 0)
    + Number(counts["native-cloud-candidate"] || 0)
    + Number(counts["native-document-candidate"] || 0)
    + Number(counts["native-screen-candidate"] || 0)
    + Number(counts["native-phone-candidate"] || 0)
    + Number(counts["native-person-candidate"] || 0)
    + Number(counts["native-team-candidate"] || 0)
    + Number(counts["native-timeline-candidate"] || 0)
    + Number(counts["native-funnel-candidate"] || 0)
    + Number(counts["native-donut-candidate"] || 0)
    + Number(counts["native-cycle-arrow-candidate"] || 0);
  const visualNodeCount = Number(understanding.visualNodeCount || 0);
  const textNodeCount = Number(understanding.nodeCount || 0);
  return layer.layerType === "diagram-zone"
    && understanding.archetype === "flow-card-chain"
    && (nativeNodeAtomCount >= 3 || Number(understanding.confidence || 0) >= 0.88)
    && (visualNodeCount >= 3 || textNodeCount >= 8)
    && textNodeCount >= 3;
}

function eraseObjectifiedLayerPrimitives({ page, sourceImage, textBoxes = [], primitiveShapes = [], slideSize, irDir }) {
  if (!sourceImage || !page || !Array.isArray(page.images) || !Array.isArray(primitiveShapes) || primitiveShapes.length === 0) return;
  for (const image of page.images) {
    if (shouldPreserveProtectedMinimumUnitCrop(image) && image?.source?.assetHubCycleObjectified !== true) continue;
    if (image?.source?.visualAtomOverlayOnly === true && !shouldEraseOverlayOnlyStructuredCasePrimitives(image)) continue;
    if (shouldPreserveImageCropUnderNativeAssistants(image)) continue;
    const shapes = primitiveShapes.filter((shape) =>
      shape?.source?.layerSourceId === (image.id || null)
      && (
        shape.source.detector === "layer-native-container"
        || shape.source.detector === "layer-native-connector"
        || shape.source.detector === "layer-native-color-block"
        || shape.source.detector === "sticky-note-cluster-native-note"
        || shape.source.detector === "table-zone-native-cell-fill"
        || shape.source.detector === "table-zone-native-grid-line"
        || shape.source.detector === "table-zone-native-quadrant-divider"
        || shape.source.detector === "network-diagram-native-ray"
        || shape.source.detector === "network-diagram-native-node"
        || shape.source.detector === "network-diagram-native-search-box"
        || shape.source.detector === "network-diagram-native-search-icon"
        || shape.source.detector === "network-diagram-native-search-handle"
        || shape.source.detector === "network-diagram-native-search-cursor"
        || shape.source.detector === "network-diagram-native-center-emblem"
        || shape.source.detector === "hierarchy-diagram-native-card"
        || shape.source.detector === "hierarchy-diagram-native-divider"
        || shape.source.detector === "hierarchy-diagram-native-connector"
        || shape.source.detector === "hierarchy-diagram-native-root"
        || shape.source.detector === "hierarchy-diagram-native-root-dot"
        || shape.source.detector === "triangle-topology-native-edge"
        || shape.source.detector === "triangle-topology-native-arrow"
        || shape.source.detector === "triangle-topology-native-center"
        || shape.source.detector === "cover-engine-core-native-shield"
        || shape.source.detector === "cover-engine-core-native-inner"
        || shape.source.detector === "cover-engine-core-native-axis"
        || shape.source.detector === "cover-engine-core-native-card"
        || shape.source.detector === "skill-chain-overview-native-rail-bg"
        || shape.source.detector === "skill-chain-overview-native-rail-line"
        || shape.source.detector === "skill-chain-overview-native-input-fragment"
        || shape.source.detector === "skill-chain-overview-native-document"
        || shape.source.detector === "skill-chain-overview-native-document-line"
        || shape.source.detector === "skill-chain-overview-native-document-block"
        || shape.source.detector === "skill-chain-overview-native-card-body"
        || shape.source.detector === "skill-chain-overview-native-card-head"
        || shape.source.detector === "skill-chain-overview-native-connector"
        || shape.source.detector === "prd-generation-flow-native-card"
        || shape.source.detector === "prd-generation-flow-native-header"
        || shape.source.detector === "prd-generation-flow-native-divider"
        || shape.source.detector === "prd-generation-flow-native-node"
        || shape.source.detector === "prd-generation-flow-native-connector"
        || shape.source.detector === "prd-generation-flow-native-input-card"
        || shape.source.detector === "prd-generation-flow-native-input-header"
        || shape.source.detector === "prd-generation-flow-native-ui-placeholder"
        || shape.source.detector === "prd-generation-flow-native-doc-row"
        || shape.source.detector === "prototype-validation-flow-native-connector"
        || shape.source.detector === "prototype-validation-flow-native-label"
        || shape.source.detector === "prototype-validation-flow-native-panel"
        || shape.source.detector === "prototype-validation-flow-native-live-card"
        || shape.source.detector === "prototype-validation-flow-native-live-card-header"
        || shape.source.detector === "prototype-validation-flow-native-webpage"
        || shape.source.detector === "prototype-validation-flow-native-webpage-header"
        || shape.source.detector === "prototype-validation-flow-native-webpage-sidebar"
        || shape.source.detector === "prototype-validation-flow-native-webpage-header-icon"
        || shape.source.detector === "prototype-validation-flow-native-webpage-top-line"
        || shape.source.detector === "prototype-validation-flow-native-webpage-side-icon"
        || shape.source.detector === "prototype-validation-flow-native-webpage-content-card"
        || shape.source.detector === "prototype-validation-flow-native-webpage-content-thumb"
        || shape.source.detector === "prototype-validation-flow-native-webpage-content-line"
        || shape.source.detector === "prototype-validation-flow-native-ui-placeholder"
        || shape.source.detector === "prototype-validation-flow-native-intent-card"
        || shape.source.detector === "prototype-validation-flow-native-intent-header"
        || shape.source.detector === "prototype-validation-flow-native-intent-title-line"
        || shape.source.detector === "prototype-validation-flow-native-intent-body-line"
        || shape.source.detector === "demand-understanding-flow-native-card"
        || shape.source.detector === "demand-understanding-flow-native-tab"
        || shape.source.detector === "demand-understanding-flow-native-connector"
        || shape.source.detector === "demand-understanding-flow-native-material-card"
        || shape.source.detector === "demand-understanding-flow-native-material-header"
        || shape.source.detector === "demand-understanding-flow-native-backplate"
        || shape.source.detector === "demand-understanding-flow-native-beam"
        || shape.source.detector === "demand-understanding-flow-native-lens"
        || shape.source.detector === "demand-understanding-flow-native-lens-highlight"
        || shape.source.detector === "demand-understanding-flow-native-handle"
        || shape.source.detector === "comparison-matrix-native-grid-line"
        || shape.source.detector === "comparison-matrix-native-warning"
        || shape.source.detector === "comparison-matrix-native-status-circle"
        || shape.source.detector === "comparison-matrix-native-status-mark"
        || shape.source.detector === "value-quadrant-native-divider"
        || shape.source.detector === "review-risk-gate-flow-native-card"
        || shape.source.detector === "review-risk-gate-flow-native-panel"
        || shape.source.detector === "review-risk-gate-flow-native-icon"
        || shape.source.detector === "review-risk-gate-flow-native-connector"
        || shape.source.detector === "review-risk-gate-flow-native-prd-card"
        || shape.source.detector === "review-risk-gate-flow-native-prd-header"
        || shape.source.detector === "review-risk-gate-flow-native-prd-section"
        || shape.source.detector === "review-risk-gate-flow-native-prd-line"
        || shape.source.detector === "funnel-hub-native-bowl"
        || shape.source.detector === "funnel-hub-native-body"
        || shape.source.detector === "funnel-hub-native-neck"
        || shape.source.detector === "funnel-hub-native-pill"
        || shape.source.detector === "funnel-hub-native-connector"
        || shape.source.detector === "funnel-hub-native-bottom-panel"
        || shape.source.detector === "horizontal-step-chain-native-top"
        || shape.source.detector === "horizontal-step-chain-native-body"
        || shape.source.detector === "horizontal-step-chain-native-green-rail"
        || shape.source.detector === "wms-route-chain-native-backplate"
        || shape.source.detector === "wms-route-chain-native-road"
        || shape.source.detector === "wms-route-chain-native-road-dash"
        || shape.source.detector === "wms-route-chain-native-motion-line"
        || shape.source.detector === "wms-route-chain-native-document"
        || shape.source.detector === "wms-route-chain-native-forward-arrow"
        || shape.source.detector === "wms-route-chain-native-ai-glow"
        || shape.source.detector === "wms-route-chain-native-ai-base-shadow"
        || shape.source.detector === "wms-route-chain-native-ai-base"
        || shape.source.detector === "wms-route-chain-native-ai-shield"
        || shape.source.detector === "wms-route-chain-native-ai-check"
        || shape.source.detector === "wms-route-chain-native-ai-checkmark"
        || shape.source.detector === "wms-route-chain-native-rail"
        || shape.source.detector === "wms-route-chain-native-node"
        || shape.source.detector === "wms-route-chain-native-intercept-pill"
        || shape.source.detector === "wms-route-chain-native-callout-tail"
        || shape.source.detector === "wms-route-chain-native-version-chip"
        || shape.source.detector === "wms-route-chain-native-value-card"
        || shape.source.detector === "wms-route-chain-native-value-route"
        || shape.source.detector === "wms-route-chain-native-output-banner"
        || shape.source.detector === "top-complex-diagram-native-suggestion-panel"
        || shape.source.detector === "top-complex-diagram-native-suggestion-divider"
        || shape.source.detector === "top-complex-diagram-native-suggestion-check"
        || shape.source.detector === "top-complex-diagram-native-suggestion-checkmark"
        || shape.source.detector === "top-complex-diagram-native-comparison-table"
        || shape.source.detector === "top-complex-diagram-native-comparison-table-header"
        || shape.source.detector === "top-complex-diagram-native-comparison-table-line"
        || shape.source.detector === "top-complex-diagram-native-fix-card"
        || shape.source.detector === "stacked-architecture-native-layer"
        || shape.source.detector === "stacked-architecture-native-arrow"
        || shape.source.detector === "stacked-architecture-native-brace"
        || shape.source.detector === "stacked-architecture-native-icon"
        || shape.source.detector === "input-output-split-native-input-title-underline"
        || shape.source.detector === "input-output-split-native-input-edge"
        || shape.source.detector === "input-output-split-native-input-node"
        || shape.source.detector === "visual-atom-native-rect"
        || shape.source.detector === "visual-atom-native-ellipse"
        || shape.source.detector === "visual-atom-native-diamond"
        || shape.source.detector === "visual-atom-native-cylinder"
        || shape.source.detector === "visual-atom-native-cloud"
        || shape.source.detector === "visual-atom-native-document"
        || shape.source.detector === "visual-atom-native-folder"
        || shape.source.detector === "visual-atom-native-screen"
        || shape.source.detector === "visual-atom-native-phone"
        || shape.source.detector === "visual-atom-native-person"
        || shape.source.detector === "visual-atom-native-team"
        || shape.source.detector === "visual-atom-native-timeline"
        || shape.source.detector === "visual-atom-native-funnel"
        || shape.source.detector === "visual-atom-native-donut"
        || shape.source.detector === "visual-atom-native-donut-segment"
        || shape.source.detector === "visual-atom-native-pie-segment"
        || shape.source.detector === "visual-atom-native-arc-arrow-segment"
        || shape.source.detector === "visual-atom-native-cycle-arrow"
        || shape.source.detector === "visual-atom-native-right-arrow"
        || shape.source.detector === "visual-atom-native-connector"
        || isVisualChartNativeDetector(shape.source.detector)
        || shape.source.detector === "structured-illustration-card-native-accent"
        || shape.source.detector === "structured-illustration-card-native-border"
      )
    );
    if (shapes.length === 0) continue;
    const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
    if (!assetFile) continue;
    const masks = [];
    if (image?.source?.textObjectified === true || image?.source?.textErasedFromCrop === true) {
      for (const textBox of textBoxes || []) {
        if (boxCenterInside(textBox.box, image.box)) masks.push(ptToPxBox(textBox.box, sourceImage, slideSize, 9));
      }
    }
    for (const shape of shapes) {
      const mask = primitiveShapeEraseMask(shape, sourceImage, slideSize);
      if (mask) masks.push(mask);
    }
    if (masks.length === 0) continue;
    const erased = eraseMasks(sourceImage, masks);
    const crop = cropPng(erased, ptToPxBox(image.box, sourceImage, slideSize, 0));
    ensureDir(path.dirname(assetFile));
    writePng(assetFile, crop);
    image.source = {
      ...(image.source || {}),
      residualCrop: true,
      primitiveErased: true,
      erasedPrimitiveCount: shapes.length,
      erasedMaskCount: masks.length,
      dropErasedResidualAfterNativeRebuild: shouldDropStructuredVisualAtomResidualAfterErase(image) || image.source?.dropErasedResidualAfterNativeRebuild,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; objectified primitives erased from residual crop`
    };
  }
}

function shouldEraseOverlayOnlyStructuredCasePrimitives(image = {}) {
  const source = image.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  if (String(source.detector || "") !== "structured-case-graphic-underlay-crop") return false;
  if (layer.layerType !== "diagram-zone") return false;
  if (source.visualAtomObjectified !== true) return false;
  if (Number(understanding.confidence || 0) < 0.88) return false;
  const atoms = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
  const nativeAtoms = atoms.filter((atom) => atom?.nativeCandidate === true && /connector|arrow|grid-line/.test(String(atom?.kind || "")));
  const residualAtoms = atoms.filter((atom) => atom?.residualCandidate === true && atom.box);
  return nativeAtoms.length >= 6 && residualAtoms.length >= 2;
}

function shouldPreserveImageCropUnderNativeAssistants(image = {}) {
  const source = image.source || {};
  return (String(source.detector || "") === "illustration-card-graphic-underlay-crop"
    && /multi-card-illustrations/.test(String(source.reason || "")))
    || source.inputOutputSplitPreserveCropUnderNativeAssistants === true;
}

function shouldDropStructuredVisualAtomResidualAfterErase(image) {
  if (!shouldKeepStructuredVisualAtomLayerText(image)) return false;
  const atoms = image?.source?.layer?.diagramUnderstanding?.visualAtoms || [];
  return Array.isArray(atoms) && atoms.every((atom) => atom?.residualCandidate !== true);
}

function primitiveShapeEraseMask(shape, sourceImage, slideSize) {
  const detector = shape?.source?.detector;
  const box = shape?.box;
  if (!box) return null;
  if (detector === "layer-native-container") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "layer-native-connector") return ptToPxBox(box, sourceImage, slideSize, 6);
  if (detector === "matrix-color-block-native-rect") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "layer-native-color-block") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "sticky-note-cluster-native-note") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "table-zone-native-cell-fill") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "table-zone-native-grid-line") return ptToPxBox(box, sourceImage, slideSize, 3);
  if (detector === "table-zone-native-quadrant-divider") return ptToPxBox(box, sourceImage, slideSize, 3);
  if (detector === "hierarchy-diagram-native-card") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "hierarchy-diagram-native-divider") return ptToPxBox(box, sourceImage, slideSize, 4);
  if (detector === "hierarchy-diagram-native-connector") return ptToPxBox(box, sourceImage, slideSize, 7);
  if (detector === "hierarchy-diagram-native-root") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "hierarchy-diagram-native-root-dot") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "triangle-topology-native-edge") return ptLineToPxMask(box, sourceImage, slideSize, 9);
  if (detector === "triangle-topology-native-arrow") return ptLineToPxMask(box, sourceImage, slideSize, 18);
  if (detector === "triangle-topology-native-center") return ptToPxBox(expandPtBox(box, slideSize, 8, 8), sourceImage, slideSize, 0);
  if (detector === "cover-engine-core-native-shield") return ptToPxBox(expandPtBox(box, slideSize, 6, 6), sourceImage, slideSize, 0);
  if (detector === "cover-engine-core-native-inner") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "cover-engine-core-native-axis") return ptLineToPxMask(box, sourceImage, slideSize, 34);
  if (detector === "cover-engine-core-native-card") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "network-diagram-native-ray") return ptLineToPxMask(box, sourceImage, slideSize, 9);
  if (detector === "network-diagram-native-node") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "network-diagram-native-search-box") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "network-diagram-native-search-icon") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "network-diagram-native-search-handle") return ptLineToPxMask(box, sourceImage, slideSize, 4);
  if (detector === "network-diagram-native-search-cursor") return ptLineToPxMask(box, sourceImage, slideSize, 4);
  if (detector === "network-diagram-native-center-emblem") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-rect") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-ellipse") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-diamond") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-cylinder") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-cloud") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-document") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-folder") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-screen") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-phone") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-person") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-team") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-timeline") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-funnel") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-donut") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-arc-arrow-segment") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-cycle-arrow") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-right-arrow") return ptToPxBox(expandPtBox(box, slideSize, 6, 6), sourceImage, slideSize, 0);
  if (detector === "visual-atom-native-connector") return ptLineToPxMask(box, sourceImage, slideSize, 7);
  if (detector === "visual-chart-native-axis") return ptLineToPxMask(box, sourceImage, slideSize, 6);
  if (detector === "visual-chart-native-line-segment") return ptLineToPxMask(box, sourceImage, slideSize, 8);
  if (detector === "visual-chart-native-bar") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "visual-chart-native-line-point") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "visual-chart-native-scatter-point") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "visual-chart-native-donut") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "visual-chart-native-donut-segment" || detector === "visual-atom-native-donut-segment") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "visual-chart-native-pie-segment" || detector === "visual-atom-native-pie-segment") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "structured-illustration-card-native-accent") return ptToPxBox(expandPtBox(box, slideSize, 1, 1), sourceImage, slideSize, 0);
  if (detector === "structured-illustration-card-native-border") return ptToPxBox(expandPtBox(box, slideSize, 1, 1), sourceImage, slideSize, 0);
  if (detector === "stacked-architecture-native-layer") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "stacked-architecture-native-arrow") return ptLineToPxMask(box, sourceImage, slideSize, 18);
  if (detector === "stacked-architecture-native-brace") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "stacked-architecture-native-icon") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "skill-chain-overview-native-card") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "skill-chain-overview-native-rail-bg") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "skill-chain-overview-native-rail-line") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "skill-chain-overview-native-input-fragment") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "skill-chain-overview-native-document") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "skill-chain-overview-native-document-line") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "skill-chain-overview-native-document-block") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "skill-chain-overview-native-card-body") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "skill-chain-overview-native-card-head") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "skill-chain-overview-native-connector") return ptLineToPxMask(box, sourceImage, slideSize, 10);
  if (detector === "prd-generation-flow-native-card") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "prd-generation-flow-native-header") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "prd-generation-flow-native-divider") return ptToPxBox(box, sourceImage, slideSize, 3);
  if (detector === "prd-generation-flow-native-node") return ptToPxBox(expandPtBox(box, slideSize, 6, 6), sourceImage, slideSize, 0);
  if (detector === "prd-generation-flow-native-connector") return ptLineToPxMask(box, sourceImage, slideSize, 7);
  if (detector === "prd-generation-flow-native-input-card") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "prd-generation-flow-native-input-header") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "prd-generation-flow-native-ui-placeholder") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "prd-generation-flow-native-doc-row") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-connector") return ptLineToPxMask(box, sourceImage, slideSize, shape?.source?.dashed ? 8 : 7);
  if (detector === "prototype-validation-flow-native-label") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-panel") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-live-card") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-live-card-header") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-webpage") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-webpage-header") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-webpage-sidebar") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-webpage-header-icon") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-webpage-top-line") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-webpage-side-icon") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-webpage-content-card") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-webpage-content-thumb") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-webpage-content-line") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-ui-placeholder") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-intent-card") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-intent-header") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-intent-title-line") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "prototype-validation-flow-native-intent-body-line") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "document-version-flow-native-folder-frame") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "document-version-flow-native-folder-tab") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "document-version-flow-native-folder-rail") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "document-version-flow-native-main-folder") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "document-version-flow-native-version-card") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "document-version-flow-native-version-tab") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "document-version-flow-native-connector") return ptLineToPxMask(box, sourceImage, slideSize, 8);
  if (detector === "demand-understanding-flow-native-card") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "demand-understanding-flow-native-tab") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "demand-understanding-flow-native-connector") return ptLineToPxMask(box, sourceImage, slideSize, 7);
  if (detector === "demand-understanding-flow-native-material-card") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "demand-understanding-flow-native-material-header") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "demand-understanding-flow-native-backplate") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "demand-understanding-flow-native-beam") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "demand-understanding-flow-native-lens") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "demand-understanding-flow-native-lens-highlight") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "demand-understanding-flow-native-handle") return ptLineToPxMask(box, sourceImage, slideSize, 10);
  if (detector === "comparison-matrix-native-grid-line") return ptLineToPxMask(box, sourceImage, slideSize, 5);
  if (detector === "comparison-matrix-native-warning") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "comparison-matrix-native-status-circle") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "comparison-matrix-native-status-mark") return ptLineToPxMask(box, sourceImage, slideSize, 7);
  if (detector === "value-quadrant-native-divider") return ptLineToPxMask(box, sourceImage, slideSize, 5);
  if (detector === "review-risk-gate-flow-native-card") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "review-risk-gate-flow-native-panel") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "review-risk-gate-flow-native-icon") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "review-risk-gate-flow-native-connector") return ptLineToPxMask(box, sourceImage, slideSize, shape?.source?.jagged ? 13 : 9);
  if (detector === "review-risk-gate-flow-native-prd-card") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "review-risk-gate-flow-native-prd-header") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "review-risk-gate-flow-native-prd-section") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "review-risk-gate-flow-native-prd-line") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "funnel-hub-native-bowl") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "funnel-hub-native-body") return ptToPxBox(expandPtBox(box, slideSize, 6, 6), sourceImage, slideSize, 0);
  if (detector === "funnel-hub-native-neck") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "funnel-hub-native-pill") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "funnel-hub-native-connector") return ptLineToPxMask(box, sourceImage, slideSize, 8);
  if (detector === "funnel-hub-native-bottom-panel") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "horizontal-step-chain-native-top") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "horizontal-step-chain-native-body") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "horizontal-step-chain-native-green-rail") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "wms-route-chain-native-backplate") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "wms-route-chain-native-road") return ptLineToPxMask(box, sourceImage, slideSize, 18);
  if (detector === "wms-route-chain-native-road-dash") return ptLineToPxMask(box, sourceImage, slideSize, 4);
  if (detector === "wms-route-chain-native-motion-line") return ptLineToPxMask(box, sourceImage, slideSize, 5);
  if (detector === "wms-route-chain-native-document") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "wms-route-chain-native-forward-arrow") return ptLineToPxMask(box, sourceImage, slideSize, 14);
  if (detector === "wms-route-chain-native-ai-glow") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "wms-route-chain-native-ai-base-shadow") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "wms-route-chain-native-ai-base") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "wms-route-chain-native-ai-shield") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "wms-route-chain-native-ai-check") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "wms-route-chain-native-ai-checkmark") return ptLineToPxMask(box, sourceImage, slideSize, 5);
  if (detector === "wms-route-chain-native-rail") return ptLineToPxMask(box, sourceImage, slideSize, 8);
  if (detector === "wms-route-chain-native-node") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "wms-route-chain-native-intercept-pill") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "wms-route-chain-native-callout-tail") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "wms-route-chain-native-version-chip") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "wms-route-chain-native-value-card") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "wms-route-chain-native-value-route") return ptLineToPxMask(box, sourceImage, slideSize, 7);
  if (detector === "wms-route-chain-native-output-banner") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "asset-hub-cycle-native-shield") return ptToPxBox(expandPtBox(box, slideSize, 8, 8), sourceImage, slideSize, 0);
  if (detector === "asset-hub-cycle-native-connector") return ptLineToPxMask(box, sourceImage, slideSize, 10);
  if (detector === "asset-hub-cycle-native-center-text-mask") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "input-output-split-native-output-card") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "input-output-split-native-output-label") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "input-output-split-native-output-text") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "input-output-split-native-title-underline") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "input-output-split-native-divider") return ptLineToPxMask(box, sourceImage, slideSize, 5);
  if (detector === "input-output-split-native-arrow") return ptLineToPxMask(box, sourceImage, slideSize, 8);
  if (detector === "input-output-split-native-bottom-rail") return ptLineToPxMask(box, sourceImage, slideSize, 6);
  if (detector === "input-output-split-native-input-title-underline") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  if (detector === "input-output-split-native-input-edge") return ptLineToPxMask(box, sourceImage, slideSize, 8);
  if (detector === "input-output-split-native-input-node") return ptToPxBox(expandPtBox(box, slideSize, 4, 4), sourceImage, slideSize, 0);
  if (detector === "product-brain-vision-native-tile") return ptToPxBox(expandPtBox(box, slideSize, 1, 1), sourceImage, slideSize, 0);
  if (detector === "product-brain-vision-native-lens") return null;
  if (detector === "product-brain-vision-native-search") return ptToPxBox(expandPtBox(box, slideSize, 5, 5), sourceImage, slideSize, 0);
  if (detector === "product-brain-vision-native-search-icon") return ptLineToPxMask(box, sourceImage, slideSize, 5);
  if (detector === "product-brain-vision-native-search-icon-circle") return ptToPxBox(expandPtBox(box, slideSize, 3, 3), sourceImage, slideSize, 0);
  if (detector === "product-brain-vision-native-cursor") return ptToPxBox(expandPtBox(box, slideSize, 2, 2), sourceImage, slideSize, 0);
  return null;
}

function isVisualChartNativeDetector(detector) {
  return /^visual-chart-native-(?:axis|bar|line-segment|line-point|scatter-point|donut|donut-segment|pie-segment)$/.test(String(detector || ""));
}

function shouldPreserveProtectedMinimumUnitCrop(image = {}) {
  const source = image?.source || {};
  // These routes have already been classified as hybrid diagrams: native
  // structure is rebuilt first and only the unresolved local visual regions
  // may remain as crops. Do not let generic screenshot/icon wording bypass
  // that reconstruction path.
  if (shouldSplitMixedDiagramSemanticCrops(image) || shouldSplitProcessWithScreenshotsLayer(image)) return false;
  if (source.protectedMinimumUnit === true) return true;
  if (source.productCollaborationChallengeProtected === true) return true;
  if (classifyObviousMinimumVisualAssetCrop(image)) return true;
  const expressionForm = String(source.expressionForm || "").toLowerCase();
  const recommendedAction = String(source.recommendedAction || "").toLowerCase();
  return source.skipVisualAtomRebuild === true
    && /complex-diagram|icon-or-illustration|screenshot-or-document/.test(expressionForm)
    && /preserve-local-crop|keep-local-crop|match-icon-library-or-keep-local-crop/.test(recommendedAction);
}

function shouldSplitMixedDiagramSemanticCrops(image = {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const box = image?.box || {};
  const text = `${source.detector || ""} ${source.reason || ""} ${source.nonEditableReason || ""} ${source.expressionSubtype || ""}`.toLowerCase();
  const action = String(layer.recommendedAction || source.recommendedAction || "").toLowerCase();
  if ((source.semanticSplitOwnsLayer !== true && isFidelityFirstMinimumVisualUnit(image))
    || /preserve-local-crop|keep-local-crop/.test(action)) return false;
  const legacyScreenshotLayer = layer.layerType === "screenshot-zone";
  const textErasedHybridLayer = layer.layerType === "diagram-zone"
    && source.textErasedFromCrop === true
    && String(source.expressionSubtype || "").toLowerCase() === "mixed-diagram-hybrid";
  return String(source.detector || "") === "mixed-diagram-graphic-underlay-crop"
    && (legacyScreenshotLayer || textErasedHybridLayer)
    && Number(box.w || 0) >= DEFAULT_SLIDE.widthPt * 0.76
    && Number(box.h || 0) >= DEFAULT_SLIDE.heightPt * 0.54
    && /complex|screenshot|flow|diagram|icon/.test(text);
}

function shouldSplitProcessWithScreenshotsLayer(image) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const reason = `${source.reason || ""} ${source.nonEditableReason || ""}`.toLowerCase();
  return (source.detector === "structured-case-graphic-underlay-crop"
    && layer.layerType === "diagram-zone"
    && understanding.archetype === "process-with-screenshots"
    && Number(layer.areaRatio || 0) >= 0.45)
    || (source.detector === "screenshot-process-underlay-crop"
      && layer.layerType === "screenshot-zone"
      && /product-workflow-icon-process/.test(reason)
      && Number(image?.box?.w || 0) >= DEFAULT_SLIDE.widthPt * 0.82
      && Number(image?.box?.h || 0) >= DEFAULT_SLIDE.heightPt * 0.50);
}

function resolveAssetPathForIr(assetPath, irDir) {
  if (!assetPath || !irDir) return null;
  return path.isAbsolute(assetPath) ? assetPath : path.resolve(irDir, assetPath);
}

function eraseMasks(image, masks) {
  const next = { width: image.width, height: image.height, rgba: Buffer.from(image.rgba) };
  for (const mask of masks) {
    const fill = sampleMaskBackgroundColor(image, mask);
    const bounds = maskBounds(mask, image);
    for (let y = bounds.y; y < bounds.y + bounds.h; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.w; x += 1) {
        if (!pointInMask(x, y, mask)) continue;
        const offset = (y * image.width + x) * 4;
        next.rgba[offset] = fill.r;
        next.rgba[offset + 1] = fill.g;
        next.rgba[offset + 2] = fill.b;
        next.rgba[offset + 3] = 255;
      }
    }
  }
  return next;
}

module.exports = { eraseObjectifiedLayerPrimitives, shouldPreserveProtectedMinimumUnitCrop, shouldSplitMixedDiagramSemanticCrops, isFidelityFirstMinimumVisualUnit, isStructuredWmsRouteChainNativeCandidate, shouldSplitProcessWithScreenshotsLayer, shouldEraseOverlayOnlyStructuredCasePrimitives, shouldPreserveImageCropUnderNativeAssistants, isVisualChartNativeDetector, resolveAssetPathForIr, primitiveShapeEraseMask, eraseMasks, ensureDir, shouldDropStructuredVisualAtomResidualAfterErase, shouldKeepStructuredVisualAtomLayerText };
