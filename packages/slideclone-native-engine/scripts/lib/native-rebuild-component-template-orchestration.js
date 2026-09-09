"use strict";

function createComponentTemplateOrchestration(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    arbitrateNativeObjectOwnership,
    boxCenterInside,
    boxOverlapArea,
    boxesOverlapRatio,
    classifyImageExpressionForm,
    classifyImageExpressionSubtype,
    classifyNativeRebuildFamily,
    collectDiagramTextCandidates,
    componentAssetLayersForPage,
    componentTemplateCropReplacementDecision,
    createComponentTemplateHybridResidualCrop,
    createComponentTemplatePictureResidualCrops,
    expandPtBox,
    isFidelityFirstMinimumVisualUnit,
    normalizeCjkText,
    ptBoxOverlapAreaRatio,
    recommendExpressionHandling,
    round,
    roundRatio,
    saturatedDiagramNativeTextBoxes,
    shouldObjectifySemanticCycleDiagram,
    shouldObjectifyTriangleTopology,
    unionBox
  } = dependencies;

function splitStructuredIllustrationCardShellShapesForLayering(shapes = []) {
  const backgroundShapes = [];
  const chromeShapes = [];
  for (const shape of shapes || []) {
    if (shape?.source?.detector === "structured-illustration-card-native-background") {
      backgroundShapes.push(shape);
    } else {
      chromeShapes.push(shape);
    }
  }
  return { backgroundShapes, chromeShapes };
}

function suppressVisualAtomShapesCoveredByStructuredIcons(visualAtomShapes = [], structuredIconShapes = []) {
  const iconBoxes = (structuredIconShapes || [])
    .filter((shape) => shape?.source?.detector === "structured-illustration-warning-icon-native")
    .filter((shape) => shape?.source?.iconPart === "triangle" || shape?.type === "triangle")
    .map((shape) => shape.box)
    .filter(Boolean);
  if (iconBoxes.length === 0) return visualAtomShapes || [];
  return (visualAtomShapes || []).filter((shape) => {
    const detector = String(shape?.source?.detector || "");
    if (!/^visual-atom-native-(?:ellipse|scatter-point|triangle)(?:-structured-card)?$/.test(detector)) return true;
    const box = shape.box || {};
    const area = Number(box.w || 0) * Number(box.h || 0);
    if (area <= 0 || area > 3600) return true;
    return !iconBoxes.some((iconBox) => {
      if (ptBoxOverlapAreaRatio(box, iconBox) >= 0.42) return true;
      return boxCenterInside(box, expandPtBox(iconBox, DEFAULT_SLIDE, 20, 16));
    });
  });
}

function suppressStructuredIllustrationInputCycleArrows(visualAtomShapes = [], inputChaosShapes = [], cardShellShapes = []) {
  const chaosCount = (inputChaosShapes || [])
    .filter((shape) => shape?.source?.detector === "structured-illustration-input-chaos-native")
    .filter((shape) => shape?.source?.iconPart === "chaos-zigzag")
    .length;
  if (chaosCount < 4) return visualAtomShapes || [];
  const inputCard = (cardShellShapes || [])
    .filter((shape) => shape?.source?.detector === "structured-illustration-card-native-background")
    .sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0))[0]?.box;
  if (!inputCard) return visualAtomShapes || [];
  return (visualAtomShapes || []).filter((shape) => {
    if (!/^visual-atom-native-(?:cycle-arrow|connector)(?:-structured-card)?$/.test(String(shape?.source?.detector || ""))) return true;
    const box = shape.box || {};
    const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, Number(inputCard.w || 0) * Number(inputCard.h || 0));
    if (areaRatio < 0.08) return true;
    return !boxCenterInside(box, expandPtBox(inputCard, DEFAULT_SLIDE, 12, 12));
  });
}

function annotateFidelityImageSource(image) {
  if (!image || typeof image !== "object") return image;
  const source = image.source || {};
  if (source.editable === true) return image;
  const reason = source.nonEditableReason || source.reason || "preserved-as-local-fidelity-crop";
  return {
    ...image,
    source: {
      ...source,
      editable: false,
      nativeRebuild: source.nativeRebuild !== false,
      strategy: source.strategy || "local-fidelity-crop",
      expressionForm: source.expressionForm || classifyImageExpressionForm(image),
      expressionSubtype: source.expressionSubtype || classifyImageExpressionSubtype(image),
      recommendedAction: source.recommendedAction || recommendExpressionHandling(image),
      nonEditableReason: reason
    }
  };
}

function collectObjectifiedDiagramTextBoxes(images = []) {
  return suppressGenericDiagramTextBoxesCoveredBySpecialized(collectDiagramTextCandidates(images));
}

function suppressGenericDiagramTextBoxesCoveredBySpecialized(textBoxes = []) {
  const specialized = (Array.isArray(textBoxes) ? textBoxes : []).filter((textBox) =>
    /^triangle-topology-native-/.test(String(textBox?.source?.detector || ""))
  );
  if (specialized.length === 0) return Array.isArray(textBoxes) ? textBoxes : [];
  const specializedLayerIds = new Set(specialized.map((textBox) => String(textBox?.source?.layerSourceId || "")).filter(Boolean));
  return (Array.isArray(textBoxes) ? textBoxes : []).filter((textBox) => {
    if (textBox?.source?.detector !== "generic-node-diagram-semantic-node-text") return true;
    const layerId = String(textBox?.source?.layerSourceId || "");
    if (specializedLayerIds.has(layerId) && isTriangleTopologyGenericTopFragment(textBox.text)) return false;
    const normalized = normalizeCjkText(textBox.text);
    return !specialized.some((candidate) =>
      String(candidate?.source?.layerSourceId || "") === layerId
      && normalizeCjkText(candidate.text) === normalized
      && boxesOverlapRatio(textBox.box, candidate.box) >= 0.72
    );
  });
}

function arbitrateSpecializedNativeLayerOwnership(items = []) {
  return arbitrateNativeObjectOwnership(items).items;
}

function suppressProductBrainSmartReviewWhenReviewRiskGateActive(productBrainSmartReviewRiskGate = {}, reviewRiskGateFlowShapes = []) {
  const hasReviewRiskGate = Array.isArray(reviewRiskGateFlowShapes)
    && reviewRiskGateFlowShapes.some((shape) =>
      String(shape?.source?.detector || "").startsWith("review-risk-gate-flow-native-")
    );
  if (!hasReviewRiskGate) {
    return {
      shapes: Array.isArray(productBrainSmartReviewRiskGate.shapes) ? productBrainSmartReviewRiskGate.shapes : [],
      textBoxes: Array.isArray(productBrainSmartReviewRiskGate.textBoxes) ? productBrainSmartReviewRiskGate.textBoxes : []
    };
  }
  return { shapes: [], textBoxes: [] };
}

function nativeRebuildFamily(detector = "") {
  return classifyNativeRebuildFamily(detector);
}

function boxCoverageRatio(a = {}, b = {}) {
  const ax1 = Number(a.x || 0);
  const ay1 = Number(a.y || 0);
  const ax2 = ax1 + Number(a.w || 0);
  const ay2 = ay1 + Number(a.h || 0);
  const bx1 = Number(b.x || 0);
  const by1 = Number(b.y || 0);
  const bx2 = bx1 + Number(b.w || 0);
  const by2 = by1 + Number(b.h || 0);
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
  const area = Math.max(1, Number(a.w || 0) * Number(a.h || 0));
  return (ix * iy) / area;
}

function mergeDiagramTextBoxes(textBoxes = []) {
  const result = [];
  const seen = new Set();
  for (const textBox of Array.isArray(textBoxes) ? textBoxes : []) {
    if (!textBox || typeof textBox !== "object") continue;
    const box = textBox.box || {};
    const key = `${textBox?.source?.detector || ""}:${textBox?.text || ""}:${round(box.x || 0)}:${round(box.y || 0)}:${round(box.w || 0)}:${round(box.h || 0)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(textBox);
  }
  return result;
}

function collectComponentTemplateFallbackDiagramTextBoxes(images = [], textBoxes = []) {
  const result = [];
  for (const image of Array.isArray(images) ? images : []) {
    if (!image || typeof image !== "object") continue;
    if (!shouldObjectifySemanticCycleDiagram(image, textBoxes)) continue;
    result.push(...saturatedDiagramNativeTextBoxes(image, textBoxes));
  }
  return mergeDiagramTextBoxes(result);
}

function suppressComponentTemplateShapesForSpecializedLayers(componentShapes = [], specializedObjects = []) {
  const specializedLayerIds = new Set();
  const specializedBoxes = [];
  for (const object of Array.isArray(specializedObjects) ? specializedObjects : []) {
    const coverageBox = object?.coverageBox || object?.box || null;
    if (coverageBox && Number(coverageBox.w || 0) > 0 && Number(coverageBox.h || 0) > 0) {
      specializedBoxes.push(coverageBox);
    }
    for (const shape of Array.isArray(object?.shapes) ? object.shapes : []) {
      const layerId = String(shape?.source?.layerSourceId || "");
      if (layerId) specializedLayerIds.add(layerId);
      if (shape?.box && Number(shape.box.w || 0) > 0 && Number(shape.box.h || 0) > 0) {
        specializedBoxes.push(shape.box);
      }
    }
  }
  if (specializedLayerIds.size === 0 && specializedBoxes.length === 0) return Array.isArray(componentShapes) ? componentShapes : [];
  const specializedCoverageBox = specializedBoxes.reduce((acc, box) => acc ? unionBox(acc, box) : box, null);
  return (Array.isArray(componentShapes) ? componentShapes : []).filter((shape) => {
    const detector = String(shape?.source?.detector || "");
    if (detector !== "plugin-component-template-native-shape") return true;
    const layerId = String(shape?.source?.layerSourceId || "");
    if (specializedLayerIds.has(layerId)) return false;
    if (specializedCoverageBox && boxCoverageRatio(shape?.box || {}, specializedCoverageBox) >= 0.52) return false;
    return true;
  });
}

function suppressOrphanComponentTemplateTextBoxes(textBoxes = [], retainedShapes = [], retainedImages = []) {
  const retainedGroupIds = new Set([
    ...(Array.isArray(retainedShapes) ? retainedShapes : []),
    ...(Array.isArray(retainedImages) ? retainedImages : [])
  ].map((item) => String(item?.source?.nativeComponentGroupId || "").trim()).filter(Boolean));
  return (Array.isArray(textBoxes) ? textBoxes : []).filter((textBox) => {
    if (String(textBox?.source?.detector || "") !== "plugin-component-template-native-textbox") return true;
    const groupId = String(textBox?.source?.nativeComponentGroupId || "").trim();
    return !!groupId && retainedGroupIds.has(groupId);
  });
}

function replaceComponentTemplateCropsWhenFullyNative(images = [], shapes = [], options = {}) {
  const byLayer = new Map();
  for (const shape of shapes || []) {
    const layerId = String(shape?.source?.layerSourceId || "");
    if (!layerId) continue;
    if (!byLayer.has(layerId)) byLayer.set(layerId, []);
    byLayer.get(layerId).push(shape);
  }
  const dropped = new Set();
  const split = new Set();
  const replacementDecisions = new Map();
  const nextImages = [];
  for (const image of Array.isArray(images) ? images : []) {
    const layerShapes = byLayer.get(String(image?.id || ""));
    const decision = componentTemplateCropReplacementDecision(image, layerShapes, options);
    if (decision.replace) {
      dropped.add(String(image.id || ""));
      replacementDecisions.set(String(image.id || ""), decision);
      if (image.source && typeof image.source === "object") {
        image.source.componentTemplateCropReplacedByNative = true;
        image.source.componentTemplateCropReplacementReason = decision.reason;
        image.source.componentTemplateApplicationMode = "native-component-template-replaces-fidelity-crop";
        Object.assign(image.source, componentTemplateReplacementEvidenceSource(decision));
      }
      continue;
    }
    const residuals = createComponentTemplatePictureResidualCrops(image, decision, options);
    if (residuals.length > 0) {
      dropped.add(String(image.id || ""));
      split.add(String(image.id || ""));
      if (image.source && typeof image.source === "object") {
        image.source.componentTemplateCropReplacedByNative = true;
        image.source.componentTemplateCropSplitIntoResiduals = true;
        image.source.componentTemplatePictureResiduals = residuals.length;
        image.source.componentTemplateCropReplacementReason = "component-template-picture-children-split-to-local-residuals";
        image.source.componentTemplateApplicationMode = "native-component-template-with-picture-residual-crops";
      }
      nextImages.push(...residuals);
      continue;
    }
    const hybridResidual = createComponentTemplateHybridResidualCrop(image, decision, options);
    if (hybridResidual) {
      dropped.add(String(image.id || ""));
      split.add(String(image.id || ""));
      if (image.source && typeof image.source === "object") {
        image.source.componentTemplateCropReplacedByNative = false;
        image.source.componentTemplateCropSplitIntoResiduals = true;
        image.source.componentTemplatePictureResiduals = 1;
        image.source.componentTemplateCropReplacementReason = "component-template-structural-hybrid-residual-keeps-fidelity";
        image.source.componentTemplateApplicationMode = "native-component-template-with-structural-hybrid-residual";
        Object.assign(image.source, componentTemplateReplacementEvidenceSource(decision));
      }
      nextImages.push(hybridResidual);
      continue;
    }
    if (image?.source && typeof image.source === "object" && layerShapes?.length > 0) {
      image.source.componentTemplateCropReplacedByNative = false;
      image.source.componentTemplateCropReplacementReason = decision.reason;
      Object.assign(image.source, componentTemplateReplacementEvidenceSource(decision));
    }
    nextImages.push(image);
  }
  const nextShapes = (shapes || []).map((shape) => {
    const layerId = String(shape?.source?.layerSourceId || "");
    if (!dropped.has(layerId)) return shape;
    const decision = replacementDecisions.get(layerId) || {};
    return {
      ...shape,
      source: {
        ...(shape.source || {}),
        componentTemplateCropReplacedByNative: true,
        ...(split.has(layerId) ? { componentTemplateCropSplitIntoResiduals: true } : {}),
        ...componentTemplateReplacementEvidenceSource(decision),
        componentTemplateApplicationMode: split.has(layerId)
          ? "native-component-template-with-picture-residual-crops"
          : "native-component-template-replaces-fidelity-crop"
      }
    };
  });
  return { images: nextImages, shapes: nextShapes };
}

function componentTemplateReplacementEvidenceSource(decision = {}) {
  const out = {};
  if (decision?.reason) out.componentTemplateCropReplacementReason = String(decision.reason);
  if (Number.isFinite(Number(decision?.exactChildCoverageRatio))) {
    out.componentTemplateExactChildCoverageRatio = roundRatio(decision.exactChildCoverageRatio);
  }
  if (Number.isFinite(Number(decision?.exactChildShapeCount))) {
    out.componentTemplateExactChildShapeCount = Math.max(0, Math.trunc(Number(decision.exactChildShapeCount)));
  }
  if (Number.isFinite(Number(decision?.generatedGeometryUnionAreaRatio))) {
    out.componentTemplateGeneratedGeometryUnionAreaRatio = roundRatio(decision.generatedGeometryUnionAreaRatio);
  }
  if (Number.isFinite(Number(decision?.generatedGeometryContainedShapeRatio))) {
    out.componentTemplateGeneratedGeometryContainedShapeRatio = roundRatio(decision.generatedGeometryContainedShapeRatio);
  }
  if (Number.isFinite(Number(decision?.generatedGeometryOverflowPt))) {
    out.componentTemplateGeneratedGeometryOverflowPt = roundRatio(decision.generatedGeometryOverflowPt);
  }
  return out;
}

function componentAssetLayerPseudoImages(pageIndex = 0, componentAssetIndex = null, existingImages = []) {
  const layers = componentAssetLayersForPage(componentAssetIndex, pageIndex);
  const coveredLayerKeys = new Set((Array.isArray(existingImages) ? existingImages : [])
    .map((image) => String(image?.source?.componentAssetLayerKey || ""))
    .filter(Boolean));
  return (Array.isArray(layers) ? layers : [])
    // Shape-addressed layers and explicit structural zones can feed native
    // replay. Decorative, screenshot, and banner image zones retain fidelity.
    .filter((layer) => String(layer.shapeLayerId || "").trim() || isStructuralComponentLayer(layer))
    .filter((layer) => !coveredLayerKeys.has(String(layer.layerKey || "")))
    .map((layer, index) => {
      const box = layer.box || {};
      if (![box.x, box.y, box.w, box.h].every((value) => Number.isFinite(Number(value))) || Number(box.w) <= 0 || Number(box.h) <= 0) {
        return null;
      }
      const remoteCandidate = layer.remoteCandidate || {};
      const mode = layer.strategyMode || "plugin-component-template";
      return {
        id: layer.shapeLayerId || layer.layerKey || `component-asset-layer-${pageIndex}-${index}`,
        box: {
          x: Number(box.x),
          y: Number(box.y),
          w: Number(box.w),
          h: Number(box.h)
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: layer.detector || "component-asset-layer",
          componentLocalAssets: layer.localAssets || [],
          componentAssetReadiness: layer.readiness || null,
          componentAssetLayerKey: layer.layerKey || "",
          componentRenderStrategy: {
            mode,
            applicationPlan: {
              sourceProvider: remoteCandidate.sourceProvider || "",
              componentKind: remoteCandidate.kind || "",
              componentId: remoteCandidate.id || "",
              preservesFidelityNow: false
            },
            bestCandidate: {
              sourceProvider: remoteCandidate.sourceProvider || "",
              kind: remoteCandidate.kind || "",
              id: remoteCandidate.id || "",
              title: remoteCandidate.title || "",
              candidateScore: remoteCandidate.candidateScore || 0,
              confidence: remoteCandidate.confidence || 0
            }
          },
          layer: {
            layerType: layer.layerType || "diagram-zone",
            templateFamily: layer.templateFamily || "unknown",
            detector: layer.detector || "component-asset-layer",
            componentRenderStrategy: {
              mode,
              bestCandidate: remoteCandidate
            }
          }
        }
      };
    })
    .filter(Boolean);
}

function isStructuralComponentLayer(layer) {
  return new Set([
    "chart-zone",
    "diagram-zone",
    "matrix-zone",
    "process-zone",
    "table-zone"
  ]).has(String(layer?.layerType || "").trim().toLowerCase());
}

function filterComponentTemplateShapeLayerInputs(inputs = [], existingImages = [], nativeOwnerShapes = []) {
  const protectedImages = (Array.isArray(existingImages) ? existingImages : [])
    .filter((image) => (
      image?.source?.semanticCycleDiagramObjectified === true
      || shouldSuppressComponentTemplateForTriangleTopology(image)
    ) && image.box);
  return (Array.isArray(inputs) ? inputs : []).filter((input) => {
    if (componentTemplateInputClaimedByNativeShapes(input, nativeOwnerShapes)) return false;
    if (protectedImages.length === 0) return true;
    const inputBox = input?.box || {};
    const inputArea = Math.max(1, Number(inputBox.w || 0) * Number(inputBox.h || 0));
    return !protectedImages.some((image) => {
      const overlap = boxOverlapArea(inputBox, image.box || {});
      return overlap / inputArea >= 0.58;
    });
  });
}

function filterComponentTemplateNativeInputs(inputs = [], textBoxes = [], nativeOwnerShapes = []) {
  return (Array.isArray(inputs) ? inputs : [])
    .filter((image) => !isFidelityFirstMinimumVisualUnit(image) || shouldAllowAppliedPluginTemplateReplayCandidate(image))
    .filter((image) => !shouldSuppressComponentTemplateForTriangleTopology(image, textBoxes))
    .filter((image) => !componentTemplateInputClaimedByNativeShapes(image, nativeOwnerShapes));
}

function componentTemplateInputClaimedByNativeShapes(input = {}, nativeOwnerShapes = []) {
  const inputBox = input?.box || {};
  const inputArea = Math.max(0, Number(inputBox.w || 0) * Number(inputBox.h || 0));
  if (inputArea <= 0) return false;
  const layerIds = new Set([
    String(input?.id || ""),
    String(input?.source?.layerSourceId || ""),
    String(input?.source?.componentAssetLayerKey || "")
  ].filter(Boolean));
  if (layerIds.size === 0) return false;
  const owners = (Array.isArray(nativeOwnerShapes) ? nativeOwnerShapes : [])
    .filter((shape) => layerIds.has(String(shape?.source?.layerSourceId || "")))
    .filter((shape) => shape?.box && boxOverlapArea(inputBox, shape.box) > 0);
  if (owners.length < 4) return false;
  const coveredArea = owners.reduce((sum, shape) => sum + boxOverlapArea(inputBox, shape.box || {}), 0);
  const coverageRatio = Math.min(1, coveredArea / inputArea);
  const coherentGroupParts = owners.filter((shape) => (
    shape?.source?.nativeComponentInstance === true
    && Number(shape?.source?.nativeComponentPartCount || 0) >= 4
  )).length;
  if (coverageRatio < 0.18 && coherentGroupParts < 4) return false;
  input.source = {
    ...(input.source || {}),
    componentTemplateDeferredReason: "native-layer-owner-already-covers-target",
    componentTemplateNativeOwnerShapeCount: owners.length,
    componentTemplateNativeOwnerCoverageRatio: roundRatio(coverageRatio)
  };
  return true;
}

function shouldAllowAppliedPluginTemplateReplayCandidate(image = {}) {
  const source = image?.source || {};
  const readiness = source.componentAssetReadiness || {};
  if (String(readiness.status || "").toLowerCase() !== "applied-plugin-motif-ready") return false;
  const layer = source.layer || {};
  const layerType = String(layer.layerType || "").toLowerCase();
  const expression = `${source.expressionForm || ""} ${source.expressionSubtype || ""} ${source.detector || ""} ${layerType}`.toLowerCase();
  if (/screenshot|screen|document|prototype|ui-screenshot|photo/.test(expression)) return false;
  if (/icon|illustration|插画|图标|截图|screen-capture/.test(expression)) return false;
  if (!/diagram-zone|table-zone/.test(layerType)) return false;
  const action = [
    source.recommendedAction,
    layer.recommendedAction,
    source.componentRenderStrategy?.applicationPlan?.currentStep
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  const replayPlan = [
    readiness.nextStep,
    source.componentRenderStrategy?.applicationPlan?.targetStep
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  const hasNativeAction = /rebuild-native|split-native|attempt-native-reconstruction|record-component-replacement/.test(action);
  const hasAppliedTemplateReplayPlan = /reuse-openxml-groups-from-applied-plugin-template/.test(replayPlan);
  if (!hasNativeAction && !hasAppliedTemplateReplayPlan) return false;
  const assets = Array.isArray(source.componentLocalAssets) ? source.componentLocalAssets : [];
  return assets.some((asset) => {
    if (!Array.isArray(asset?.roleTags) || !asset.roleTags.includes("applied-component")) return false;
    const groups = Array.isArray(asset?.recommendedComponentGroups) ? asset.recommendedComponentGroups : [];
    return groups.some((group) => {
      const pictureCount = Number(group?.pictureCount || 0);
      const childCount = Number(group?.childCount ?? group?.shapeCount ?? 0);
      const children = Array.isArray(group?.childLayout?.children) ? group.childLayout.children : [];
      const reusableChildren = children.filter((child) => /shape|connector/.test(String(child?.kind || "").toLowerCase())).length;
      return pictureCount === 0 && Math.max(childCount, reusableChildren) >= 4;
    });
  });
}

function shouldSuppressComponentTemplateForTriangleTopology(image = {}, textBoxes = []) {
  const source = image?.source || {};
  if (source.triangleTopologyObjectified === true || source.triangleTopologyVisualConnectorsPreservedAsCrops === true) {
    return true;
  }
  const strategy = source.componentRenderStrategy || source.layer?.componentRenderStrategy || {};
  const motifText = [
    source.componentTemplateFamilyApplied,
    source.layer?.templateFamily,
    ...(Array.isArray(source.componentTemplateTargetMotifs) ? source.componentTemplateTargetMotifs : []),
    ...(Array.isArray(source.matchedComponentTargetMotifs) ? source.matchedComponentTargetMotifs : []),
    ...(Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : []),
    strategy.templateFamily,
    strategy.bestCandidate?.title
  ].map((value) => String(value || "")).join(" ").toLowerCase();
  if (!/linear-arrow-chain|branch-card-flow|card-grid|quadrant|process|chain|workflow|流程|箭头/.test(motifText)) {
    return false;
  }
  return shouldObjectifyTriangleTopology(image, textBoxes);
}

function isTriangleTopologyGenericTopFragment(text) {
  const normalized = String(text || "").trim();
  return /^hif$/i.test(normalized)
    || (/^[a-z]{1,4}$/i.test(normalized) && !/^hifi$/i.test(normalized));
}

  return {
    splitStructuredIllustrationCardShellShapesForLayering,
    suppressVisualAtomShapesCoveredByStructuredIcons,
    suppressStructuredIllustrationInputCycleArrows,
    annotateFidelityImageSource,
    collectObjectifiedDiagramTextBoxes,
    suppressGenericDiagramTextBoxesCoveredBySpecialized,
    arbitrateSpecializedNativeLayerOwnership,
    suppressProductBrainSmartReviewWhenReviewRiskGateActive,
    nativeRebuildFamily,
    boxCoverageRatio,
    mergeDiagramTextBoxes,
    collectComponentTemplateFallbackDiagramTextBoxes,
    suppressComponentTemplateShapesForSpecializedLayers,
    suppressOrphanComponentTemplateTextBoxes,
    replaceComponentTemplateCropsWhenFullyNative,
    componentTemplateReplacementEvidenceSource,
    componentAssetLayerPseudoImages,
    isStructuralComponentLayer,
    filterComponentTemplateShapeLayerInputs,
    filterComponentTemplateNativeInputs,
    componentTemplateInputClaimedByNativeShapes,
    shouldAllowAppliedPluginTemplateReplayCandidate,
    shouldSuppressComponentTemplateForTriangleTopology,
    isTriangleTopologyGenericTopFragment
  };
}

module.exports = { createComponentTemplateOrchestration };
