"use strict";

const { shouldSplitMixedDiagramSemanticCrops, shouldSplitProcessWithScreenshotsLayer, shouldPreserveProtectedMinimumUnitCrop, resolveAssetPathForIr } = require("./residual-primitive-erasure");
const { annotateResidualSplitRejection, splitMixedDiagramSemanticCrops, splitDenseStructuredCaseResidualCrops, splitStructuredIllustrationCardResidualCrops, slidePtBoxToLocalPxBox, localPxBoxToSlidePt, splitResidualLayerSource, isUsableVisualAtomResidualBox, residualForegroundCoverageDecision, splitSparseVisualAtomErasedResidualCrop, classifyResidualSplitComponent } = require("./structured-residual-splitting");
const fs = require("fs");
const { readPng, cropPng, writePng } = require("./png");
const { splitReviewRiskGateFlowResidualCrops, splitTriangleTopologyResidualCrops, splitPrdGenerationFlowResidualCrops, splitPrototypeValidationFlowResidualCrops, splitDemandUnderstandingFlowResidualCrops, splitFunnelHubResidualCrops, splitAssetHubCycleResidualCrops, splitInputOutputSplitResidualCrops, splitProductBrainVisionResidualCrops, splitToolGapPlatformResidualCrops, splitProcessWithScreenshotsResidualCrops, splitValueQuadrantResidualCrops, splitSkillChainOverviewResidualCrops, splitNetworkDiagramCenterCrop, splitDocumentVersionMixedParentResidualCrop, reclassifyImageSource, trimResidualRegionBox } = require("./diagram-residual-crops");
const { foregroundComponents, isGraphicForeground, residualSplitComponents, isBandSignificantPixel, mergeNearbyRuns, expandPxBox, residualSplitDecision, tableGridAwareResidualComponents, tableGridAwareResidualSplitDecision, wideResidualBandComponents, trimResidualBandBox, continuousWideResidualComponents, wideResidualBandSplitDecision } = require("./residual-component-analysis");
const { boxCenterInside, expandPtBox, pixel, clamp } = require("./raster-native-detection");
const path = require("path");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function shouldSplitDeclaredReviewGateGem(image = {}) {
  const regions = image?.source?.reviewRiskGateResidualBoxes;
  return image?.source?.reviewRiskGateFlowObjectified === true
    && image?.source?.reviewRiskGateScannerGemCropPreserved === true
    && Array.isArray(regions)
    && regions.some((region) => {
      const box = region?.box || {};
      return [box.x, box.y, box.w, box.h].every((value) => Number.isFinite(Number(value)))
        && Number(box.w) > 0
        && Number(box.h) > 0;
    });
}

function splitErasedResidualCrop(image, irDir) {
  const wmsMinimumUnitCrops = image?.source?.wmsRouteChainMinimumUnitCrops;
  if (Array.isArray(wmsMinimumUnitCrops) && wmsMinimumUnitCrops.length > 0) {
    return wmsMinimumUnitCrops;
  }
  if (!shouldSplitErasedResidualCrop(image)) {
    annotateResidualSplitRejection(image, { reason: "not-eligible" });
    return [];
  }
  if (image.source?.coverEngineCoreObjectified === true && image.source?.dropErasedResidualAfterNativeRebuild === true) {
    image.source.residualSplitDropped = true;
    image.source.residualSplitDropReason = "cover-engine-core-specialist-fully-rebuilt-native";
    return [];
  }
  const allowDeclaredReviewGemSplit = shouldSplitDeclaredReviewGateGem(image);
  const allowDeclaredAssetHubSplit = image.source?.assetHubCycleObjectified === true
    && Array.isArray(image.source?.assetHubCycleResidualBoxes)
    && image.source.assetHubCycleResidualBoxes.length > 0;
  if (shouldPreserveProtectedMinimumUnitCrop(image) && !allowDeclaredReviewGemSplit && !allowDeclaredAssetHubSplit) {
    annotateResidualSplitRejection(image, { reason: "protected-minimum-visual-unit" });
    return [];
  }
  const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
  if (!assetFile || !fs.existsSync(assetFile)) {
    annotateResidualSplitRejection(image, { reason: "missing-asset" });
    return [];
  }
  const residual = readPng(assetFile);
  if (allowDeclaredReviewGemSplit) {
    const split = splitReviewRiskGateFlowResidualCrops(image, residual, assetFile, irDir);
    image.source.reviewRiskGateGemSplitAttempted = true;
    image.source.reviewRiskGateGemSplitCandidateCount = image.source.reviewRiskGateResidualBoxes.length;
    image.source.reviewRiskGateGemSplitOutputCount = split.length;
    return split;
  }
  if (shouldSplitMixedDiagramSemanticCrops(image)) {
    const mixedResiduals = splitMixedDiagramSemanticCrops(image, residual, assetFile, irDir);
    if (mixedResiduals.length > 0) return mixedResiduals;
  }
  if (shouldSplitDenseStructuredCaseResidual(image)) {
    const denseResiduals = splitDenseStructuredCaseResidualCrops(image, residual, assetFile, irDir);
    if (denseResiduals.length > 0) return denseResiduals;
  }
  if (shouldSplitStructuredIllustrationCardResidual(image)) {
    const cardResiduals = splitStructuredIllustrationCardResidualCrops(image, residual, assetFile, irDir);
    if (cardResiduals.length > 0) return cardResiduals;
  }
  if (shouldPreserveProcessWithScreenshotsWholeCrop(image)) return [];
  if (image.source?.wmsRouteChainObjectified === true && image.source?.dropErasedResidualAfterNativeRebuild === true) {
    return [];
  }
  if (image.source?.triangleTopologyObjectified === true) {
    return splitTriangleTopologyResidualCrops(image, residual, assetFile, irDir);
  }
  if (image.source?.prdGenerationFlowObjectified === true) {
    return splitPrdGenerationFlowResidualCrops(image, residual, assetFile, irDir);
  }
  if (image.source?.prototypeValidationFlowObjectified === true) {
    return splitPrototypeValidationFlowResidualCrops(image, residual, assetFile, irDir);
  }
  if (image.source?.demandUnderstandingFlowObjectified === true) {
    if (image.source?.dropErasedResidualAfterNativeRebuild === true) return [];
    return splitDemandUnderstandingFlowResidualCrops(image, residual, assetFile, irDir);
  }
  if (image.source?.reviewRiskGateFlowObjectified === true) {
    return splitReviewRiskGateFlowResidualCrops(image, residual, assetFile, irDir);
  }
  if (image.source?.funnelHubObjectified === true) {
    return splitFunnelHubResidualCrops(image, residual, assetFile, irDir);
  }
  if (image.source?.assetHubCycleObjectified === true) {
    return splitAssetHubCycleResidualCrops(image, residual, assetFile, irDir);
  }
  if (image.source?.inputOutputSplitObjectified === true) {
    return splitInputOutputSplitResidualCrops(image, residual, assetFile, irDir);
  }
  if (image.source?.productBrainVisionObjectified === true) {
    return splitProductBrainVisionResidualCrops(image, residual, assetFile, irDir);
  }
  if (image.source?.assetOsFlowObjectified === true || image.source?.portalPlatformDiagramObjectified === true) {
    return [];
  }
  if (image.source?.stackedArchitectureObjectified === true && image.source?.dropErasedResidualAfterNativeRebuild === true) {
    return [];
  }
  if (image.source?.toolGapPlatformObjectified === true) {
    return splitToolGapPlatformResidualCrops(image, residual, assetFile, irDir);
  }
  if (shouldSplitProcessWithScreenshotsLayer(image)) {
    if (shouldPreserveProcessWithScreenshotsWholeCrop(image)) return [];
    return splitProcessWithScreenshotsResidualCrops(image, residual, assetFile, irDir);
  }
  if (image.source?.comparisonMatrixObjectified === true && image.source?.dropErasedResidualAfterNativeRebuild === true) {
    return [];
  }
  if (image.source?.valueQuadrantObjectified === true) {
    return splitValueQuadrantResidualCrops(image, residual, assetFile, irDir);
  }
  if (image.source?.skillChainOverviewObjectified === true) {
    return splitSkillChainOverviewResidualCrops(image, residual, assetFile, irDir);
  }
  if (image.source?.networkDiagramObjectified === true) {
    if (image.source?.dropErasedResidualAfterNativeRebuild === true) return [];
    return splitNetworkDiagramCenterCrop(image, residual, assetFile, irDir);
  }
  if (image.source?.documentVersionNativePeerBox) {
    const documentVersionResiduals = splitDocumentVersionMixedParentResidualCrop(image, residual, assetFile, irDir);
    if (documentVersionResiduals.length > 0) return documentVersionResiduals;
  }
  if (image.source?.stickyNoteClusterObjectified === true) {
    const stickySketchResiduals = splitStickyNoteSketchResidualCrops(image, residual, assetFile, irDir);
    if (stickySketchResiduals.length > 0) return stickySketchResiduals;
  }
  if (shouldUseDocumentNodeResidualCrops(image, image?.source?.layer?.diagramUnderstanding || {})) {
    const semanticVisualAtomResiduals = splitVisualAtomResidualCrops(image, residual, assetFile, irDir);
    if (semanticVisualAtomResiduals.length > 0) return semanticVisualAtomResiduals;
  }
  if (shouldSplitComponentTemplateVisualAtomResidual(image, image?.source?.layer?.diagramUnderstanding || {})) {
    const componentTemplateVisualAtomResiduals = splitVisualAtomResidualCrops(image, residual, assetFile, irDir);
    if (componentTemplateVisualAtomResiduals.length > 0) return componentTemplateVisualAtomResiduals;
  }
  const sparseVisualAtomResiduals = splitSparseVisualAtomErasedResidualCrop(image, residual, assetFile, irDir);
  if (sparseVisualAtomResiduals) return sparseVisualAtomResiduals;
  const focusedForegroundResiduals = splitFocusedForegroundResidualCrop(image, residual, assetFile, irDir);
  if (focusedForegroundResiduals.length > 0) return focusedForegroundResiduals;
  let components = residualSplitComponents(residual);
  let detector = "split-erased-residual-crop";
  let nonEditableReason = "remaining residual visual component after native primitive erasure";
  const decision = residualSplitDecision(components, residual, {
    allowSingleComponent: image.source?.networkDiagramObjectified === true
  });
  if (!decision.use) {
    const tableGridComponents = shouldTryTableGridAwareResidualSplit(image, residual, decision)
      ? tableGridAwareResidualComponents(image, residual, components)
      : [];
    const tableGridDecision = tableGridAwareResidualSplitDecision(tableGridComponents, residual);
    if (tableGridDecision.use) {
      components = tableGridComponents;
      detector = "split-table-grid-residual-crop";
      nonEditableReason = "table-grid residual grouped by native grid cells after primitive erasure";
    } else {
    const bandComponents = shouldTryWideResidualBandSplit(image, residual, decision)
      ? wideResidualBandComponents(residual)
      : [];
    const fallbackComponents = bandComponents.length < 2 && shouldTryContinuousWideResidualSplit(image, residual, decision)
      ? continuousWideResidualComponents(residual)
      : [];
    const candidateComponents = bandComponents.length >= 2 ? bandComponents : fallbackComponents;
    const bandDecision = wideResidualBandSplitDecision(candidateComponents, residual);
    if (!bandDecision.use) {
      const visualAtomResiduals = splitVisualAtomResidualCrops(image, residual, assetFile, irDir);
      if (visualAtomResiduals.length > 0) return visualAtomResiduals;
      if (String(image.source?.residualSplitRejected?.reason || "").startsWith("visual-atom-")) return [];
      annotateResidualSplitRejection(image, {
        ...decision,
        tableGridSplitRejected: tableGridDecision.reason,
        tableGridComponentCount: tableGridDecision.componentCount || 0,
        bandSplitRejected: bandDecision.reason,
        bandComponentCount: bandDecision.componentCount || 0
      });
      return [];
    }
    components = candidateComponents;
    detector = "split-wide-residual-crop";
    nonEditableReason = "wide mixed diagram residual split into local fidelity bands after native primitive erasure";
    }
  }
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  const splitImages = [];
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    const crop = cropPng(residual, component.box);
    const file = path.join(outDir, `${base}-residual-${String(index + 1).padStart(2, "0")}.png`);
    writePng(file, crop);
    const componentClass = classifyResidualSplitComponent(crop, component, detector);
    const componentDetector = componentClass?.detector || detector;
    const componentReason = componentClass?.nonEditableReason || nonEditableReason;
    const slideBox = localPxBoxToSlidePt(component.box, residual, image.box);
    splitImages.push({
      id: `${image.id || "residual"}-split-${index}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
      box: slideBox,
      source: {
        ...(image.source || {}),
        layer: splitResidualLayerSource(image.source?.layer, slideBox, componentDetector),
        detector: componentDetector,
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        residualSplit: true,
        residualSplitMode: component.splitMode || "component",
        residualSplitIndex: index,
        residualSplitCount: components.length,
        originalCropBox: image.box,
        nonEditableReason: componentReason
      }
    });
  }
  return splitImages;
}

function splitVisualAtomResidualCrops(image, residual, assetFile, irDir) {
  const understanding = image?.source?.layer?.diagramUnderstanding || {};
  const atoms = understanding.visualAtoms;
  if (!Array.isArray(atoms) || atoms.length === 0 || !image?.box) return [];
  const residualTargets = visualAtomResidualCropTargets(image, residual, understanding);
  if (residualTargets.length === 0) return [];
  const coverageOptions = visualAtomResidualCoverageOptions(image, understanding, residualTargets);
  const coverageDecision = residualForegroundCoverageDecision(
    residual,
    residualTargets.map(({ localBox }) => ({ box: localBox })),
    coverageOptions
  );
  if (!coverageDecision.use) {
    annotateResidualSplitRejection(image, {
      ...coverageDecision,
      reason: `visual-atom-${coverageDecision.reason}`,
      componentCount: residualTargets.length
    });
    return [];
  }
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  return residualTargets.map((target, index) => {
    const crop = cropPng(residual, target.localBox);
    const file = path.join(outDir, `${base}-visual-atom-residual-${String(index + 1).padStart(2, "0")}.png`);
    writePng(file, crop);
    const slideBox = localPxBoxToSlidePt(target.localBox, residual, image.box);
    const detector = target.detector;
    return {
      id: `${image.id || "visual"}-atom-residual-${index}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
      box: slideBox,
      source: reclassifyImageSource(image.source || {}, slideBox, {
        layer: splitResidualLayerSource(image.source?.layer, slideBox, detector),
        detector,
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        residualSplit: true,
        residualSplitMode: target.mode,
        residualSplitIndex: index,
        residualSplitCount: residualTargets.length,
        originalCropBox: image.box,
        ...(target.atom ? {
          visualAtomId: target.atom.id || null,
          visualAtomKind: target.atom.kind || null
        } : {}),
        ...(target.node ? {
          residualNodeId: target.node.id || null,
          residualNodeKind: target.node.kind || null
        } : {}),
        nonEditableReason: target.nonEditableReason
      })
    };
  });
}

function visualAtomResidualCropTargets(image, residual, understanding = {}) {
  const atoms = understanding.visualAtoms;
  const atomTargets = atoms
    .filter((atom) => atom?.residualCandidate === true && atom.box)
    .map((atom) => ({
      atom,
      localBox: slidePtBoxToLocalPxBox(expandPtBox(atom.box, DEFAULT_SLIDE, 5, 5), image.box, residual),
      detector: visualAtomResidualDetector(atom),
      mode: "visual-atom-residual",
      nonEditableReason: "unreconstructed visual atom preserved as a small local crop after native atom erasure"
    }))
    .filter((target) => isUsableVisualAtomResidualBox(target.localBox, residual));
  const nodeTargets = shouldUseDocumentNodeResidualCrops(image, understanding)
    ? (understanding.nodes || [])
      .filter((node) => /screenshot|document/i.test(String(node?.kind || "")) && node.box)
      .map((node) => ({
        node,
        localBox: slidePtBoxToLocalPxBox(expandPtBox(node.box, DEFAULT_SLIDE, 16, 14), image.box, residual),
        detector: "document-node-residual-crop",
        mode: "document-node-residual",
        nonEditableReason: "document-like diagram node preserved as a small local crop after surrounding structure was rebuilt natively"
      }))
      .filter((target) => isUsableVisualAtomResidualBox(target.localBox, residual))
    : [];
  return dedupeResidualCropTargets([...atomTargets, ...nodeTargets])
    .slice(0, 8);
}

function shouldUseDocumentNodeResidualCrops(image = {}, understanding = {}) {
  const layerType = String(image?.source?.layer?.layerType || "");
  return (image?.source?.primitiveErased === true
    && image?.source?.visualAtomObjectified === true
    && layerType === "table-zone"
    && String(understanding.archetype || "") === "matrix-or-grid"
    && Number(understanding.confidence || 0) >= 0.88
    && Array.isArray(understanding.nodes)
    && understanding.nodes.some((node) => /screenshot|document/i.test(String(node?.kind || ""))))
    || shouldSplitVisualAtomMatrixResidual(image, understanding)
    || shouldSplitComponentTemplateMatrixResidual(image, understanding);
}

function visualAtomResidualCoverageOptions(image = {}, understanding = {}, targets = []) {
  const hasDocumentTargets = targets.some((target) => target.mode === "document-node-residual");
  if (hasDocumentTargets && shouldUseDocumentNodeResidualCrops(image, understanding)) {
    return { minForegroundCoverage: 0.09 };
  }
  if (shouldSplitComponentTemplateVisualAtomResidual(image, understanding)) {
    return { minForegroundCoverage: 0.56 };
  }
  return { minForegroundCoverage: 0.82 };
}

function shouldSplitComponentTemplateVisualAtomResidual(image = {}, understanding = image?.source?.layer?.diagramUnderstanding || {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const layerType = String(layer.layerType || "");
  if (source.componentTemplateGroupApplied !== true) return false;
  if (Number(source.componentTemplateNativeShapes || 0) < 3) return false;
  if (Number(source.componentTemplateGroupScore || 0) < 58) return false;
  if (layerType !== "diagram-zone" && layerType !== "table-zone" && layerType !== "illustration-zone") return false;
  const text = `${source.detector || ""} ${source.expressionForm || ""} ${source.expressionSubtype || ""} ${source.reason || ""} ${source.nonEditableReason || ""}`.toLowerCase();
  if (/full-slide-screenshot|webpage|photo-background|chart-evidence/.test(text)) return false;
  const atoms = Array.isArray(understanding?.visualAtoms) ? understanding.visualAtoms : [];
  const residualAtoms = atoms.filter((atom) => atom?.residualCandidate === true && atom.box);
  if (residualAtoms.length === 0) return false;
  const nativeAtoms = atoms.filter((atom) => atom?.nativeCandidate === true || atom?.residualCandidate === false);
  if (nativeAtoms.length === 0 && Number(source.componentTemplateNativeShapes || 0) < 8) return false;
  return residualAtoms.length <= 8;
}

function shouldSplitComponentTemplateMatrixResidual(image = {}, understanding = image?.source?.layer?.diagramUnderstanding || {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const layerType = String(layer.layerType || "");
  const detector = String(source.detector || "");
  const family = String(source.componentTemplateFamilyApplied || layer.templateFamily || understanding?.componentStrategy?.templateFamily || "").toLowerCase();
  const expression = `${source.expressionForm || ""} ${source.expressionSubtype || ""} ${detector} ${layerType}`.toLowerCase();
  if (!/matrix|grid|table/.test(family)) return false;
  if (/screenshot|screen|prototype|ui|webpage|chart|evidence/.test(expression)) return false;
  if (layerType !== "table-zone" && layerType !== "illustration-zone" && layerType !== "diagram-zone") return false;
  if (String(understanding?.archetype || "") !== "matrix-or-grid") return false;
  if (Number(understanding?.confidence || 0) < 0.88) return false;
  if (Number(source.componentTemplateNativeShapes || 0) < 12) return false;
  if (Number(source.componentTemplateGroupScore || 0) < 64) return false;
  const atoms = Array.isArray(understanding?.visualAtoms) ? understanding.visualAtoms : [];
  const nodes = Array.isArray(understanding?.nodes) ? understanding.nodes : [];
  return atoms.some((atom) => atom?.residualCandidate === true && atom.box)
    || nodes.some((node) => /screenshot|document/i.test(String(node?.kind || "")) && node.box);
}

function shouldSplitVisualAtomMatrixResidual(image = {}, understanding = image?.source?.layer?.diagramUnderstanding || {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const layerType = String(layer.layerType || "");
  const text = `${source.detector || ""} ${source.expressionForm || ""} ${source.expressionSubtype || ""} ${source.reason || ""} ${source.nonEditableReason || ""}`.toLowerCase();
  if (source.primitiveErased !== true || source.visualAtomObjectified !== true) return false;
  if (layerType !== "table-zone" && layerType !== "illustration-zone" && layerType !== "diagram-zone") return false;
  if (/screenshot|screen|prototype|ui|webpage|chart|evidence/.test(text)) return false;
  if (String(understanding?.archetype || "") !== "matrix-or-grid") return false;
  if (Number(understanding?.confidence || 0) < 0.88) return false;
  const atoms = Array.isArray(understanding?.visualAtoms) ? understanding.visualAtoms : [];
  const nodes = Array.isArray(understanding?.nodes) ? understanding.nodes : [];
  return atoms.some((atom) => atom?.residualCandidate === true && atom.box)
    || nodes.some((node) => /screenshot|document/i.test(String(node?.kind || "")) && node.box);
}

function dedupeResidualCropTargets(targets = []) {
  const result = [];
  for (const target of targets) {
    const box = target.localBox || {};
    if (result.some((item) => ptBoxOverlapAreaRatio(box, item.localBox || {}) >= 0.72)) continue;
    result.push(target);
  }
  return result;
}

function shouldSplitStructuredIllustrationCardResidual(image = {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  return (source.primitiveErased === true || source.structuredIllustrationShellObjectified === true)
    && (source.visualAtomObjectified === true || source.structuredIllustrationShellObjectified === true)
    && layer.layerType === "illustration-zone"
    && layer.recommendedAction === "split-native-with-residual-crop"
    && String(source.detector || "") === "illustration-card-graphic-underlay-crop"
    && understanding.archetype === "process-with-screenshots"
    && Number(image?.box?.w || 0) >= Number(image?.box?.h || 0) * 1.6;
}

function shouldSplitDenseStructuredCaseResidual(image = {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const atoms = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
  const residualAtoms = atoms.filter((atom) => atom?.residualCandidate === true && atom.box);
  const nativeConnectors = atoms.filter((atom) => atom?.nativeCandidate === true && /connector|arrow|grid-line/.test(String(atom?.kind || "")));
  return source.primitiveErased === true
    && source.visualAtomObjectified === true
    && String(source.detector || "") === "structured-case-graphic-underlay-crop"
    && layer.layerType === "diagram-zone"
    && Number(understanding.confidence || 0) >= 0.88
    && residualAtoms.length >= 8
    && nativeConnectors.length >= 8;
}

function splitStickyNoteSketchResidualCrops(image, residual, assetFile, irDir) {
  if (image?.source?.primitiveErased !== true) return [];
  const allComponents = stickyNoteSketchResidualComponents(residual);
  const localRegion = image?.source?.stickyNoteClusterRegionBox
    ? slidePtBoxToLocalPxBox(image.source.stickyNoteClusterRegionBox, image.box, residual)
    : null;
  const stickyComponents = localRegion
    ? allComponents.filter((component) => boxCenterInside(component.box, localRegion))
    : allComponents;
  const adjacentComponents = localRegion
    ? allComponents.filter((component) => !boxCenterInside(component.box, localRegion))
      .filter((component) => {
        const areaRatio = component.box.w * component.box.h / Math.max(1, residual.width * residual.height);
        return areaRatio >= 0.006 && areaRatio <= 0.42;
      })
    : [];
  const components = [
    ...stickyComponents.map((component) => ({ ...component, stickySketch: true })),
    ...adjacentComponents.map((component) => ({ ...component, stickySketch: false }))
  ];
  if (stickyComponents.length < 1 || components.length > 14) {
    annotateResidualSplitRejection(image, {
      reason: "sticky-sketch-component-count-out-of-range",
      componentCount: components.length
    });
    return [];
  }
  const fullArea = Math.max(1, residual.width * residual.height);
  const totalArea = components.reduce((sum, component) => sum + component.box.w * component.box.h, 0) / fullArea;
  const maxArea = Math.max(...components.map((component) => component.box.w * component.box.h / fullArea));
  if (totalArea < 0.025 || totalArea > 0.82 || maxArea > 0.64) {
    annotateResidualSplitRejection(image, {
      reason: "sticky-sketch-area-out-of-range",
      componentCount: components.length,
      totalArea,
      maxArea
    });
    return [];
  }
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  const nativePeerBox = image.source?.documentVersionNativePeerBox || null;
  const keptComponents = components.filter((component) => {
    if (component.stickySketch !== false || !nativePeerBox) return true;
    const slideBox = localPxBoxToSlidePt(component.box, residual, image.box);
    return ptBoxOverlapAreaRatio(slideBox, nativePeerBox) < 0.35;
  });
  return keptComponents.map((component, index) => {
    const crop = cropPng(residual, component.box);
    const fileLabel = component.stickySketch === false ? "sticky-adjacent" : "sticky-sketch";
    const file = path.join(outDir, `${base}-${fileLabel}-${String(index + 1).padStart(2, "0")}.png`);
    writePng(file, crop);
    const slideBox = localPxBoxToSlidePt(component.box, residual, image.box);
    const detector = component.stickySketch === false
      ? "sticky-note-adjacent-residual-crop"
      : "sticky-note-sketch-residual-crop";
    return {
      id: `${image.id || "sticky-sketch"}-residual-${index}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
      box: slideBox,
      source: reclassifyImageSource(image.source || {}, slideBox, {
        layer: splitResidualLayerSource(image.source?.layer, slideBox, detector),
        detector,
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        residualSplit: true,
        residualSplitMode: component.stickySketch === false ? "sticky-note-adjacent-fragment" : "sticky-note-sketch-fragment",
        residualSplitIndex: index,
        residualSplitCount: components.length,
        originalCropBox: image.box,
        nonEditableReason: component.stickySketch === false
          ? "adjacent non-sticky visual preserved separately after native sticky-note reconstruction"
          : "hand-drawn sketch detail preserved as a small local crop after native sticky-note reconstruction"
      })
    };
  });
}

function stickyNoteSketchResidualComponents(residual) {
  return foregroundComponents(residual, [])
    .filter((component) => {
      const box = component.box || {};
      const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, residual.width * residual.height);
      if (areaRatio < 0.002 || areaRatio > 0.64) return false;
      if (Number(box.w || 0) < 12 || Number(box.h || 0) < 12) return false;
      if (Number(box.w || 0) > residual.width * 0.94 && Number(box.h || 0) > residual.height * 0.82) return false;
      return true;
    })
    .slice(0, 12);
}

function visualAtomResidualDetector(atom = {}) {
  if (atom.kind === "icon-crop-candidate") return "icon-residual-crop";
  if (atom.kind === "screenshot-crop-candidate") return "visual-atom-screenshot-residual-crop";
  return "visual-atom-residual-crop";
}

function splitFocusedForegroundResidualCrop(image, residual, assetFile, irDir) {
  if (!image?.box || !residual || image?.source?.detector !== "foreground-graphic-crop") return [];
  if (image?.source?.primitiveErased !== true && image?.source?.textObjectified !== true) return [];
  const areaRatio = Number(image.box.w || 0) * Number(image.box.h || 0) / Math.max(1, DEFAULT_SLIDE.widthPt * DEFAULT_SLIDE.heightPt);
  if (areaRatio < 0.32 || residual.width < 600 || residual.height < 260) return [];
  const cutX = findResidualWhitespaceCut(residual, "x", {
    minRatio: 0.42,
    maxRatio: 0.82,
    maxInkRatio: 0.018,
    minRunPx: Math.max(18, Math.round(residual.width * 0.025)),
    crossMaxRatio: 0.74
  });
  if (!cutX || cutX < residual.width * 0.35 || cutX > residual.width * 0.86) return [];
  const leftRegion = cropPng(residual, { x: 0, y: 0, w: cutX, h: residual.height });
  const cutY = findResidualWhitespaceCut(leftRegion, "y", {
    minRatio: 0.56,
    maxRatio: 0.9,
    maxInkRatio: 0.025,
    minRunPx: Math.max(14, Math.round(residual.height * 0.025)),
    preferFirst: true,
    crossMaxRatio: 0.82
  }) || Math.round(residual.height * 0.78);
  const focusedBox = trimResidualRegionBox(residual, {
    x: 0,
    y: 0,
    w: cutX,
    h: clamp(Math.min(cutY, Math.round(residual.height * 0.74)), Math.round(residual.height * 0.45), residual.height)
  });
  if (!focusedBox) return [];
  const focusedAreaRatio = focusedBox.w * focusedBox.h / Math.max(1, residual.width * residual.height);
  if (focusedAreaRatio < 0.16 || focusedAreaRatio > 0.72) return [];
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  const focusedCrop = cropPng(residual, focusedBox);
  const focusedComponents = residualSplitComponents(focusedCrop);
  const projectedComponents = focusedForegroundProjectionComponents(focusedCrop);
  const projectedDecision = residualSplitDecision(projectedComponents, focusedCrop, {
    maxUncoveredPaleStructureRatio: 0.18
  });
  const connectedDecision = residualSplitDecision(focusedComponents, focusedCrop);
  const componentCandidates = projectedDecision.use === true
    ? projectedComponents
    : focusedComponents;
  const focusedDecision = projectedDecision.use === true ? projectedDecision : connectedDecision;
  if (focusedDecision.use === true && componentCandidates.length >= 2) {
    const split = componentCandidates.map((component, index) => {
      const fullBox = {
        x: focusedBox.x + component.box.x,
        y: focusedBox.y + component.box.y,
        w: component.box.w,
        h: component.box.h
      };
      const crop = cropPng(residual, fullBox);
      const file = path.join(outDir, `${base}-focused-residual-component-${String(index + 1).padStart(2, "0")}.png`);
      writePng(file, crop);
      const slideBox = localPxBoxToSlidePt(fullBox, residual, image.box);
      return {
        id: `${image.id || "foreground"}-focused-residual-component-${index}`,
        type: "fidelity-crop",
        assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
        box: slideBox,
        source: reclassifyImageSource(image.source || {}, slideBox, {
          layer: splitResidualLayerSource(image.source?.layer, slideBox, "split-focused-foreground-residual-component-crop"),
          detector: "split-focused-foreground-residual-component-crop",
          parentDetector: image.source?.detector || null,
          parentImageId: image.id || null,
          residualSplit: true,
          residualSplitMode: component.splitMode === "foreground-projection"
            ? "focused-foreground-projection-components"
            : "focused-foreground-components",
          residualSplitIndex: index,
          residualSplitCount: componentCandidates.length,
          originalCropBox: image.box,
          focusedRegionBox: localPxBoxToSlidePt(focusedBox, residual, image.box),
          nonEditableReason: "focused foreground residual split into local component crops after native primitive erasure"
        })
      };
    });
    if (split.length >= 2) return split;
  }
  const crop = cropPng(residual, focusedBox);
  const file = path.join(outDir, `${base}-focused-residual-01.png`);
  writePng(file, crop);
  const slideBox = localPxBoxToSlidePt(focusedBox, residual, image.box);
  return [{
    id: `${image.id || "foreground"}-focused-residual-0`,
    type: "fidelity-crop",
    assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
    box: slideBox,
    source: reclassifyImageSource(image.source || {}, slideBox, {
      layer: splitResidualLayerSource(image.source?.layer, slideBox, "split-focused-foreground-residual-crop"),
      detector: "split-focused-foreground-residual-crop",
      parentDetector: image.source?.detector || null,
      parentImageId: image.id || null,
      residualSplit: true,
      residualSplitMode: "focused-foreground-region",
      residualSplitIndex: 0,
      residualSplitCount: 1,
      originalCropBox: image.box,
      nonEditableReason: "large foreground residual split to the focused local illustration region after native primitive erasure"
    })
  }];
}

function findResidualWhitespaceCut(image, axis, options = {}) {
  const length = axis === "x" ? image.width : image.height;
  const fullSpan = axis === "x" ? image.height : image.width;
  const spanStart = Math.max(0, Math.floor(fullSpan * Number(options.crossMinRatio || 0)));
  const spanEnd = Math.min(fullSpan, Math.ceil(fullSpan * Number(options.crossMaxRatio || 1)));
  const span = Math.max(1, spanEnd - spanStart);
  const start = Math.max(0, Math.floor(length * Number(options.minRatio || 0)));
  const end = Math.min(length - 1, Math.ceil(length * Number(options.maxRatio || 1)));
  const maxInk = Math.max(1, Math.floor((span / 3) * Number(options.maxInkRatio || 0.02)));
  const minRun = Math.max(1, Math.floor(Number(options.minRunPx || 12)));
  let best = null;
  let runStart = -1;
  for (let pos = start; pos <= end; pos += 1) {
    let ink = 0;
    for (let cross = spanStart; cross < spanEnd; cross += 3) {
      const color = axis === "x" ? pixel(image, pos, cross) : pixel(image, cross, pos);
      if (isGraphicForeground(color)) ink += 1;
    }
    const blank = ink <= maxInk;
    if (blank && runStart < 0) runStart = pos;
    if ((!blank || pos === end) && runStart >= 0) {
      const runEnd = blank && pos === end ? pos : pos - 1;
      const width = runEnd - runStart + 1;
      if (options.preferFirst === true && width >= minRun) return Math.round((runStart + runEnd) / 2);
      if (width >= minRun && (!best || width > best.width)) best = { start: runStart, end: runEnd, width };
      runStart = -1;
    }
  }
  return best ? Math.round((best.start + best.end) / 2) : null;
}

function shouldPreserveProcessWithScreenshotsWholeCrop(image = {}) {
  const source = image.source || {};
  if (source.processWithScreenshotsFullyObjectified === true) return false;
  if (source.productWorkflowIconProcessObjectified === true) return false;
  const text = `${source.reason || ""} ${source.nonEditableReason || ""}`.toLowerCase();
  return /case-study-diagram|work-chaos|process-with-screenshots/.test(text);
}

function shouldSplitErasedResidualCrop(image) {
  const layer = image?.source?.layer || {};
  const declaredReviewGateGem = shouldSplitDeclaredReviewGateGem(image);
  if (
    image?.source?.primitiveErased !== true
    && image?.source?.networkDiagramObjectified !== true
    && image?.source?.skillChainOverviewObjectified !== true
    && image?.source?.prototypeValidationFlowObjectified !== true
    && image?.source?.demandUnderstandingFlowObjectified !== true
    && image?.source?.reviewRiskGateFlowObjectified !== true
    && image?.source?.funnelHubObjectified !== true
    && image?.source?.assetHubCycleObjectified !== true
    && image?.source?.inputOutputSplitObjectified !== true
    && image?.source?.productBrainVisionObjectified !== true
    && image?.source?.assetOsFlowObjectified !== true
    && image?.source?.portalPlatformDiagramObjectified !== true
    && image?.source?.comparisonMatrixObjectified !== true
    && image?.source?.valueQuadrantObjectified !== true
    && image?.source?.toolGapPlatformObjectified !== true
    && !image?.source?.documentVersionNativePeerBox
    && !shouldSplitStructuredIllustrationCardResidual(image)
    && !shouldSplitMixedDiagramSemanticCrops(image)
    && !shouldSplitComponentTemplateVisualAtomResidual(image)
    && !shouldSplitComponentTemplateMatrixResidual(image)
    && !shouldSplitProcessWithScreenshotsLayer(image)
  ) return false;
  if (
    layer.layerType !== "diagram-zone"
    && layer.layerType !== "table-zone"
    && !declaredReviewGateGem
    && !shouldSplitStructuredIllustrationCardResidual(image)
    && image?.source?.valueQuadrantObjectified !== true
    && image?.source?.assetHubCycleObjectified !== true
    && image?.source?.inputOutputSplitObjectified !== true
    && image?.source?.productBrainVisionObjectified !== true
    && image?.source?.assetOsFlowObjectified !== true
    && image?.source?.portalPlatformDiagramObjectified !== true
    && image?.source?.toolGapPlatformObjectified !== true
    && !image?.source?.documentVersionNativePeerBox
    && !shouldSplitVisualAtomMatrixResidual(image)
    && !shouldSplitComponentTemplateVisualAtomResidual(image)
    && !shouldSplitComponentTemplateMatrixResidual(image)
    && !shouldSplitMixedDiagramSemanticCrops(image)
    && !shouldSplitProcessWithScreenshotsLayer(image)
  ) return false;
  if (
    layer.layerType === "table-zone"
    && image?.source?.tableGridObjectified !== true
    && image?.source?.containerObjectified !== true
    && image?.source?.quadrantDividerObjectified !== true
    && image?.source?.visualAtomObjectified !== true
    && image?.source?.demandUnderstandingFlowObjectified !== true
    && image?.source?.comparisonMatrixObjectified !== true
    && image?.source?.valueQuadrantObjectified !== true
    && image?.source?.portalPlatformDiagramObjectified !== true
    && !shouldSplitComponentTemplateVisualAtomResidual(image)
  ) return false;
  if (
    layer.layerType === "diagram-zone"
    && image?.source?.networkDiagramObjectified !== true
    && image?.source?.skillChainOverviewObjectified !== true
    && image?.source?.prototypeValidationFlowObjectified !== true
    && image?.source?.demandUnderstandingFlowObjectified !== true
    && image?.source?.reviewRiskGateFlowObjectified !== true
    && image?.source?.funnelHubObjectified !== true
    && image?.source?.assetHubCycleObjectified !== true
    && image?.source?.inputOutputSplitObjectified !== true
    && image?.source?.assetOsFlowObjectified !== true
    && image?.source?.toolGapPlatformObjectified !== true
    && image?.source?.primitiveErased !== true
    && !image?.source?.documentVersionNativePeerBox
    && !shouldSplitComponentTemplateVisualAtomResidual(image)
    && !shouldSplitMixedDiagramSemanticCrops(image)
    && !shouldSplitProcessWithScreenshotsLayer(image)
  ) return false;
  if (!declaredReviewGateGem
    && Number(image?.box?.w || 0) * Number(image?.box?.h || 0) < 960 * 540 * 0.18) return false;
  return true;
}

function focusedForegroundProjectionComponents(residual) {
  if (!residual || residual.width < 180 || residual.height < 100) return [];
  const bridgeRows = wideHorizontalBridgeRows(residual);
  if (bridgeRows.size < Math.max(6, Math.round(residual.height * 0.025))) return [];
  const densities = [];
  for (let x = 0; x < residual.width; x += 1) {
    let count = 0;
    let total = 0;
    for (let y = 0; y < residual.height; y += 3) {
      if (bridgeRows.has(y)) continue;
      total += 1;
      if (isBandSignificantPixel(pixel(residual, x, y))) count += 1;
    }
    densities.push(total > 0 ? count / total : 0);
  }
  const smoothed = densities.map((value, index) => {
    let sum = 0;
    let count = 0;
    for (let dx = -5; dx <= 5; dx += 1) {
      const at = index + dx;
      if (at < 0 || at >= densities.length) continue;
      sum += densities[at];
      count += 1;
    }
    return sum / Math.max(1, count);
  });
  const runs = [];
  let start = null;
  const threshold = 0.035;
  for (let x = 0; x < smoothed.length; x += 1) {
    if (smoothed[x] >= threshold) {
      if (start === null) start = x;
    } else if (start !== null) {
      runs.push({ start, end: x - 1 });
      start = null;
    }
  }
  if (start !== null) runs.push({ start, end: smoothed.length - 1 });
  const minWidth = Math.max(28, Math.round(residual.width * 0.045));
  return mergeNearbyRuns(runs.filter((run) => run.end - run.start + 1 >= minWidth), residual.width * 0.018)
    .map((run) => projectionRunBox(residual, run, bridgeRows))
    .filter(Boolean)
    .filter((component) => {
      const areaRatio = component.box.w * component.box.h / Math.max(1, residual.width * residual.height);
      return areaRatio >= 0.02 && areaRatio <= 0.36 && component.box.w >= 32 && component.box.h >= 32;
    })
    .slice(0, 8);
}

function wideHorizontalBridgeRows(residual) {
  const rows = new Set();
  const minRunRatio = 0.54;
  for (let y = 0; y < residual.height; y += 1) {
    let longestRun = 0;
    let run = 0;
    for (let x = 0; x < residual.width; x += 3) {
      if (isBandSignificantPixel(pixel(residual, x, y))) {
        run += 3;
        longestRun = Math.max(longestRun, run);
      } else {
        run = 0;
      }
    }
    if (longestRun / Math.max(1, residual.width) >= minRunRatio) rows.add(y);
  }
  return rows;
}

function projectionRunBox(residual, run, bridgeRows) {
  let minX = residual.width;
  let minY = residual.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < residual.height; y += 2) {
    if (bridgeRows.has(y)) continue;
    for (let x = run.start; x <= run.end && x < residual.width; x += 2) {
      if (!isBandSignificantPixel(pixel(residual, x, y))) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return {
    box: expandPxBox({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, residual, 8),
    sampledCount: Math.max(1, (maxX - minX + 1) * (maxY - minY + 1)),
    splitMode: "foreground-projection"
  };
}

function shouldTryWideResidualBandSplit(image, residual, decision = {}) {
  const layer = image?.source?.layer || {};
  const reason = decision.reason || "";
  if (layer.layerType !== "table-zone" && layer.layerType !== "diagram-zone") return false;
  if (image?.source?.primitiveErased !== true) return false;
  if (Number(image?.box?.w || 0) < Number(image?.box?.h || 0) * 1.8) return false;
  if (residual.width < residual.height * 1.8) return false;
  return reason === "too-few-components"
    || reason === "uncovered-pale-structure"
    || reason === "component-too-large"
    || reason === "component-union-too-large";
}

function shouldTryTableGridAwareResidualSplit(image, residual, decision = {}) {
  if (decision.reason !== "too-many-components") return false;
  if (image?.source?.primitiveErased !== true || image?.source?.tableGridObjectified !== true) return false;
  const grid = image?.source?.objectifiedGrid || {};
  return Array.isArray(grid.xLines) && grid.xLines.length >= 3
    && Array.isArray(grid.yLines) && grid.yLines.length >= 3
    && Number(residual?.width || 0) > 0
    && Number(residual?.height || 0) > 0;
}

function shouldTryContinuousWideResidualSplit(image, residual, decision = {}) {
  const layer = image?.source?.layer || {};
  if (layer.layerType !== "table-zone" && layer.layerType !== "diagram-zone") return false;
  if (image?.source?.primitiveErased !== true) return false;
  const reason = decision.reason || "";
  const detector = image?.source?.detector || "";
  const canFallback = reason === "too-few-components"
    || (reason === "component-area-too-low" && detector === "sparse-diagram-graphic-underlay-crop");
  if (!canFallback) return false;
  if (residual.width < residual.height * 2.4) return false;
  const bounds = trimResidualBandBox(residual, { x: 0, y: 0, w: residual.width, h: residual.height });
  if (!bounds) return false;
  if (bounds.w < residual.width * 0.78 || bounds.h < residual.height * 0.45) return false;
  return true;
}

function ptBoxOverlapAreaRatio(a, b) {
  const xOverlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const overlap = xOverlap * yOverlap;
  const smaller = Math.min(Math.max(1, a.w * a.h), Math.max(1, b.w * b.h));
  return overlap / smaller;
}

module.exports = { splitErasedResidualCrop, shouldSplitErasedResidualCrop, shouldSplitDeclaredReviewGateGem, shouldSplitStructuredIllustrationCardResidual, shouldSplitComponentTemplateVisualAtomResidual, shouldSplitComponentTemplateMatrixResidual, shouldSplitVisualAtomMatrixResidual, shouldSplitDenseStructuredCaseResidual, shouldPreserveProcessWithScreenshotsWholeCrop, splitStickyNoteSketchResidualCrops, stickyNoteSketchResidualComponents, ptBoxOverlapAreaRatio, shouldUseDocumentNodeResidualCrops, splitVisualAtomResidualCrops, visualAtomResidualCropTargets, visualAtomResidualDetector, dedupeResidualCropTargets, visualAtomResidualCoverageOptions, splitFocusedForegroundResidualCrop, findResidualWhitespaceCut, focusedForegroundProjectionComponents, wideHorizontalBridgeRows, projectionRunBox, shouldTryTableGridAwareResidualSplit, shouldTryWideResidualBandSplit, shouldTryContinuousWideResidualSplit };
