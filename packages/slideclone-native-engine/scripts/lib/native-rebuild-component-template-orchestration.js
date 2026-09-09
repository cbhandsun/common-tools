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
    clampPtBoxToSlide,
    collectDiagramTextCandidates,
    componentAssetLayersForPage,
    cropPng,
    ensureDir,
    eraseMasks,
    expandPtBox,
    isFidelityFirstMinimumVisualUnit,
    normalizeCjkText,
    path,
    ptBoxOverlapAreaRatio,
    ptBoxOverlapAreaValue,
    ptToPxBox,
    pxToPtBox,
    recommendExpressionHandling,
    refineGraphicCrop,
    round,
    roundRatio,
    safeIdentifier,
    saturatedDiagramNativeTextBoxes,
    shouldObjectifySemanticCycleDiagram,
    shouldObjectifyTriangleTopology,
    unionBox,
    unionPtBoxes,
    writePng
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

function createComponentTemplatePictureResidualCrops(image = {}, decision = {}, options = {}) {
  if (!Array.isArray(decision.pictureChildren) || decision.pictureChildren.length === 0) return [];
  if (!options.sourceImage || !options.assetDir) return [];
  const box = image.box || {};
  if (![box.x, box.y, box.w, box.h].every((value) => Number.isFinite(Number(value))) || Number(box.w) <= 0 || Number(box.h) <= 0) return [];
  ensureDir(options.assetDir);
  const slideSize = options.slideSize || DEFAULT_SLIDE;
  const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-${image.id || "component"}-component-picture`, "component-picture");
  const residuals = [];
  decision.pictureChildren.forEach((child, index) => {
    const relative = child?.box || {};
    const ptBox = clampPtBoxToSlide({
      x: Number(box.x || 0) + Number(relative.x || 0) * Number(box.w || 0),
      y: Number(box.y || 0) + Number(relative.y || 0) * Number(box.h || 0),
      w: Number(relative.w || 0) * Number(box.w || 0),
      h: Number(relative.h || 0) * Number(box.h || 0)
    }, slideSize);
    if (ptBox.w < 4 || ptBox.h < 4) return;
    const pxBox = ptToPxBox(expandPtBox(ptBox, slideSize, 1.5, 1.5), options.sourceImage, slideSize, 0);
    const crop = cropPng(options.sourceImage, pxBox);
    const file = path.join(options.assetDir, `${base}-${String(index + 1).padStart(2, "0")}.png`);
    writePng(file, crop);
    residuals.push({
      id: `${image.id || "component"}-picture-residual-${index}`,
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
      box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),
      source: {
        editable: false,
        nativeRebuild: false,
        detector: "component-template-picture-residual-crop",
        strategy: "local-fidelity-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "component-picture-residual",
        recommendedAction: "keep-local-crop-for-picture-child-only",
        layerSourceId: image.id || null,
        componentTemplateCropSplitIntoResiduals: true,
        componentTemplatePictureResidualIndex: index,
        nonEditableReason: "picture child preserved after native component template rebuild"
      }
    });
  });
  return residuals;
}

function createComponentTemplateHybridResidualCrop(image = {}, decision = {}, options = {}) {
  if (options.hybridComponentTemplateResiduals !== true) return null;
  if (!options.sourceImage || !options.assetDir) return null;
  if (!shouldKeepHybridComponentTemplateResidual(image, decision, options)) return null;
  const box = image.box || {};
  if (![box.x, box.y, box.w, box.h].every((value) => Number.isFinite(Number(value))) || Number(box.w) <= 0 || Number(box.h) <= 0) return null;
  ensureDir(options.assetDir);
  const slideSize = options.slideSize || DEFAULT_SLIDE;
  const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-${image.id || "component"}-hybrid-residual`, "component-hybrid-residual");
  const pxBox = ptToPxBox(expandPtBox(clampPtBoxToSlide(box, slideSize), slideSize, 1, 1), options.sourceImage, slideSize, 0);
  const refinement = refineGraphicCrop(options.sourceImage, pxBox);
  const file = path.join(options.assetDir, `${base}.png`);
  writePng(file, refinement.image);
  const refinedPxBox = { x: pxBox.x + refinement.box.x, y: pxBox.y + refinement.box.y, w: refinement.box.w, h: refinement.box.h };
  return {
    id: `${image.id || "component"}-structural-hybrid-residual`,
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: pxToPtBox(refinedPxBox, options.sourceImage, slideSize, 0),
    source: {
      editable: false,
      nativeRebuild: false,
      detector: "component-template-structural-hybrid-residual-crop",
      strategy: "local-fidelity-crop",
      expressionForm: String(image.source?.expressionForm || "complex-diagram"),
      expressionSubtype: String(image.source?.expressionSubtype || "structural-hybrid-residual"),
      recommendedAction: "keep-local-crop-as-visual-fidelity-residual-over-native-structure",
      layerSourceId: image.id || null,
      componentTemplateCropSplitIntoResiduals: true,
      componentTemplateHybridResidual: true,
      componentTemplateHybridResidualReason: "structural component template replacement needs visual-fidelity guardrail",
      componentTemplateCropReplacementReason: "component-template-structural-hybrid-residual-keeps-fidelity",
      nonEditableReason: "structural diagram preserved as local fidelity residual while native editable shell is evaluated"
    }
  };
}

function createSpecializedNativeHybridResidualCrops(images = [], options = {}) {
  if (options.hybridComponentTemplateResiduals !== true) return [];
  if (!options.sourceImage || !options.assetDir) return [];
  const result = [];
  for (const image of Array.isArray(images) ? images : []) {
    const residual = createSpecializedNativeHybridResidualCrop(image, options);
    if (residual) result.push(residual);
  }
  return result;
}

function createSpecializedNativeHybridResidualCropsFromNativeShapes(shapes = [], options = {}) {
  if (options.hybridComponentTemplateResiduals !== true) return [];
  const grouped = new Map();
  for (const shape of Array.isArray(shapes) ? shapes : []) {
    const layerSourceId = String(shape?.source?.layerSourceId || "");
    if (!layerSourceId || !shape?.box) continue;
    const current = grouped.get(layerSourceId);
    grouped.set(layerSourceId, current ? unionSpecializedHybridPtBoxes(current, shape.box) : { ...shape.box });
  }
  const result = [];
  for (const [layerSourceId, box] of grouped.entries()) {
    const residual = createSpecializedNativeHybridResidualCrop({
      id: layerSourceId,
      box,
      source: {
        detector: "specialized-native-shape-bounds",
        expressionForm: "complex-diagram",
        expressionSubtype: String(options.residualKind || "specialized-structural-diagram"),
        stackedArchitectureObjectified: options.residualKind === "stacked-architecture",
        nonEditableReason: "source layer was consumed before hybrid residual generation; using native shape bounds"
      }
    }, options);
    if (residual) result.push(residual);
  }
  return result;
}

function createSpecializedNativeHybridResidualCrop(image = {}, options = {}) {
  if (!shouldKeepSpecializedNativeHybridResidual(image, options)) return null;
  const box = image.box || {};
  if (![box.x, box.y, box.w, box.h].every((value) => Number.isFinite(Number(value))) || Number(box.w) <= 0 || Number(box.h) <= 0) return null;
  ensureDir(options.assetDir);
  const slideSize = options.slideSize || DEFAULT_SLIDE;
  const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
  const kind = safeIdentifier(options.residualKind || "specialized-native", "specialized-native");
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-${image.id || kind}-${kind}-hybrid-residual`, "specialized-native-hybrid-residual");
  const pxBox = ptToPxBox(expandPtBox(clampPtBoxToSlide(box, slideSize), slideSize, 1, 1), options.sourceImage, slideSize, 0);
  const textErase = options.eraseSpecializedHybridResidualText === true
    ? eraseSpecializedNativeHybridResidualText(options.sourceImage, box, options.textBoxes, slideSize)
    : { image: options.sourceImage, erasedTextBoxes: 0 };
  const crop = cropPng(textErase.image, pxBox);
  const file = path.join(options.assetDir, `${base}.png`);
  writePng(file, crop);
  return {
    id: `${image.id || kind}-specialized-native-hybrid-residual`,
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),
    source: {
      editable: false,
      nativeRebuild: false,
      detector: "specialized-native-structural-hybrid-residual-crop",
      strategy: "local-fidelity-crop",
      expressionForm: String(image.source?.expressionForm || "complex-diagram"),
      expressionSubtype: String(image.source?.expressionSubtype || options.residualKind || "specialized-structural-diagram"),
      recommendedAction: "keep-local-crop-as-visual-fidelity-residual-over-specialized-native-structure",
      layerSourceId: image.id || null,
      specializedNativeHybridResidual: true,
      specializedNativeHybridResidualKind: String(options.residualKind || "specialized-native"),
      specializedNativeHybridResidualReason: "specialized native diagram rebuild keeps source crop as visual fidelity guardrail",
      componentTemplateCropReplacementReason: "specialized-structural-hybrid-residual-keeps-fidelity",
      protectedMinimumUnit: true,
      textErasedFromCrop: textErase.erasedTextBoxes > 0,
      erasedTextBoxCount: textErase.erasedTextBoxes,
      nonEditableReason: "specialized chart or diagram crop preserved while editable native structure is evaluated"
    }
  };
}

function eraseSpecializedNativeHybridResidualText(sourceImage, residualBox = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  if (!sourceImage || !Array.isArray(textBoxes) || textBoxes.length === 0) {
    return { image: sourceImage, erasedTextBoxes: 0 };
  }
  const residualPtBox = clampPtBoxToSlide(residualBox, slideSize);
  const masks = textBoxes
    .filter((textBox) => textBox?.box && ptBoxOverlapAreaValue(residualPtBox, textBox.box) > 0)
    .map((textBox) => ptToPxBox(expandPtBox(textBox.box, slideSize, 5, 5), sourceImage, slideSize, 0));
  if (masks.length === 0) return { image: sourceImage, erasedTextBoxes: 0 };
  return {
    image: eraseMasks(sourceImage, masks),
    erasedTextBoxes: masks.length
  };
}

function shouldKeepSpecializedNativeHybridResidual(image = {}, options = {}) {
  if (options.hybridComponentTemplateResiduals !== true) return false;
  const source = image.source || {};
  const box = image.box || {};
  const slideSize = options.slideSize || DEFAULT_SLIDE;
  const areaRatio = (Number(box.w || 0) * Number(box.h || 0))
    / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  if (!Number.isFinite(areaRatio) || areaRatio < 0.05) return false;
  const text = [
    source.detector,
    source.expressionForm,
    source.expressionSubtype,
    source.reason,
    source.nonEditableReason,
    source.layer?.layerType,
    source.layer?.diagramUnderstanding?.archetype,
    source.layer?.diagramUnderstanding?.componentStrategy?.templateFamily,
    options.residualKind
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  const objectified = source.stackedArchitectureObjectified === true
    || source.standardizedFourLayerArchitectureObjectified === true
    || source.toolGapPlatformObjectified === true
    || source.portalPlatformDiagramObjectified === true
    || source.systemMapDiagramObjectified === true
    || (Array.isArray(options.sourceLayerIds) && options.sourceLayerIds.includes(String(image.id || "")));
  const structuralText = /diagram|table|matrix|grid|chart|flow|process|architecture|topology|relationship|stacked/.test(text);
  if (/brand|logo|avatar|icon-or-illustration|decorative|pictorial/.test(text)) return false;
  if (/screenshot|screen-capture|document|photo/.test(text) && !(objectified && structuralText)) return false;
  return objectified && structuralText;
}

function unionSpecializedHybridPtBoxes(a = {}, b = {}) {
  const ax = Number(a.x || 0);
  const ay = Number(a.y || 0);
  const ar = ax + Number(a.w || 0);
  const ab = ay + Number(a.h || 0);
  const bx = Number(b.x || 0);
  const by = Number(b.y || 0);
  const br = bx + Number(b.w || 0);
  const bb = by + Number(b.h || 0);
  const x = Math.min(ax, bx);
  const y = Math.min(ay, by);
  return {
    x,
    y,
    w: Math.max(ar, br) - x,
    h: Math.max(ab, bb) - y
  };
}

function shouldKeepHybridComponentTemplateResidual(image = {}, decision = {}, options = {}) {
  const source = image.source || {};
  if (source.componentTemplateGroupApplied !== true) return false;
  if (decision?.replace === true && isVeryStrongComponentTemplateReplacementDecision(decision)) return false;
  const box = image.box || {};
  const slideSize = options.slideSize || DEFAULT_SLIDE;
  const areaRatio = (Number(box.w || 0) * Number(box.h || 0))
    / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  if (!Number.isFinite(areaRatio) || areaRatio < 0.16) return false;
  const text = [
    source.detector,
    source.expressionForm,
    source.expressionSubtype,
    source.componentTemplateFamilyApplied,
    source.layer?.layerType,
    source.layer?.diagramUnderstanding?.archetype,
    source.layer?.diagramUnderstanding?.componentStrategy?.templateFamily
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  if (/screenshot|document|photo|brand|logo|icon-or-illustration|decorative/.test(text)) return false;
  return /diagram|table|matrix|grid|chart|flow|process|architecture|topology|relationship/.test(text);
}

function isVeryStrongComponentTemplateReplacementDecision(decision = {}) {
  const reason = String(decision.reason || "");
  const exactCoverage = Number(decision.exactChildCoverageRatio);
  const contained = Number(decision.generatedGeometryContainedShapeRatio);
  const overflow = Number(decision.generatedGeometryOverflowPt);
  return /high-confidence-pure-vector-plugin-component-rebuilt-natively|exact-plugin-child-layout-rebuilt-natively/.test(reason)
    && (!Number.isFinite(exactCoverage) || exactCoverage >= 0.96)
    && (!Number.isFinite(contained) || contained >= 0.98)
    && (!Number.isFinite(overflow) || overflow <= 1);
}

function componentTemplateCropReplacementDecision(image = {}, layerShapes = [], options = {}) {
  if (!image || typeof image !== "object") return { replace: false, reason: "invalid-image" };
  if (!Array.isArray(layerShapes) || layerShapes.length < 3) return { replace: false, reason: "insufficient-native-template-shapes" };
  const source = image.source || {};
  if (source.componentTemplateGroupApplied !== true) return { replace: false, reason: "component-template-not-applied" };
  const safeTableMatrixTemplate = isSafeTableMatrixTemplateCrop(image, layerShapes);
  const safeStructuredPluginTemplate = isSafeStructuredPluginTemplateCrop(image, layerShapes);
  if (isProtectedComponentTemplateFidelityCrop(image, options, layerShapes)) {
    return { replace: false, reason: "component-template-source-layer-requires-fidelity-crop" };
  }
  const group = findAppliedComponentGroup(source);
  if (!group) return { replace: false, reason: "component-template-group-not-found" };
  const score = Number(source.componentTemplateGroupScore ?? group.score ?? group.matchScore ?? 0);
  const children = Array.isArray(group.childLayout?.children) ? group.childLayout.children : [];
  if (children.length < 3) return { replace: false, reason: "component-template-lacks-learned-child-layout" };
  const pictureChildren = children.filter((child) => String(child?.kind || "").toLowerCase() === "picture");
  if (pictureChildren.length > 0) {
    return {
      replace: false,
      reason: "component-template-child-layout-contains-picture",
      pictureChildren
    };
  }
  if (Number(group.pictureCount || 0) > 0) {
    return { replace: false, reason: "component-template-contains-picture-children" };
  }
  const family = String(source.componentTemplateFamilyApplied || source.layer?.diagramUnderstanding?.archetype || "").toLowerCase();
  const exactCoverage = componentTemplateExactChildCoverage(image, layerShapes);
  const safeExactChildTemplate = isSafeExactChildTemplateCrop(image, layerShapes, exactCoverage);
  const structurallySafeAppliedDirectReplay = isAppliedPluginDirectReplayStructurallySafe(image, layerShapes, group);
  const safeAppliedDirectReplay = isSafeAppliedPluginDirectReplayCrop(image, layerShapes, group, options);
  if ((!Number.isFinite(score) || score < 72) && !safeTableMatrixTemplate && !safeExactChildTemplate && !safeStructuredPluginTemplate) {
    return { replace: false, reason: "component-template-score-below-replacement-threshold" };
  }
  if (!/process|chain|workflow|matrix|grid|table|hub|spoke|cycle|radial|timeline|layered|stack|pyramid|funnel|quadrant/.test(family)) {
    return { replace: false, reason: "component-template-family-not-safe-for-full-replacement" };
  }
  const nativeParts = new Set(layerShapes.map((shape) => String(shape?.source?.componentTemplatePart || "")));
  const hasConnectorOrAxis = [...nativeParts].some((part) => /connector|spoke|axis/.test(part));
  const hasNodeOrCell = [...nativeParts].some((part) => /node|cell|milestone|dot|center|layer/.test(part));
  const isMatrixFamily = /matrix|grid|table/.test(family);
  const matrixCellCount = layerShapes.filter((shape) => /matrix-cell|table-cell|grid-cell/.test(String(shape?.source?.componentTemplatePart || ""))).length;
  if (structurallySafeAppliedDirectReplay && !safeAppliedDirectReplay) {
    return { replace: false, reason: "component-template-applied-plugin-replay-keeps-source-crop-until-visual-verified" };
  }
  if (isMatrixFamily) {
    if (matrixCellCount < 4 && !safeAppliedDirectReplay) return { replace: false, reason: "component-template-native-matrix-cells-incomplete" };
  } else if (!hasNodeOrCell || !hasConnectorOrAxis) {
    if (!safeExactChildTemplate && !safeStructuredPluginTemplate && !safeAppliedDirectReplay) return { replace: false, reason: "component-template-native-parts-incomplete" };
  }
  const geometrySafety = componentTemplateGeneratedGeometrySafety(image, layerShapes);
  if (!geometrySafety.safe) {
    return {
      replace: false,
      reason: geometrySafety.reason,
      ...geometrySafety
    };
  }
  if (isAppliedPluginReplayTemplate(layerShapes) && !safeExactChildTemplate && !safeAppliedDirectReplay) {
    return {
      ...geometrySafety,
      replace: false,
      reason: "component-template-applied-plugin-replay-keeps-source-crop-until-visual-verified"
    };
  }
  if (isAppliedPluginMotifReadyTemplate(image, layerShapes) && !safeExactChildTemplate && !safeAppliedDirectReplay) {
    return {
      ...geometrySafety,
      replace: false,
      reason: "component-template-applied-plugin-motif-keeps-source-crop-until-visual-verified"
    };
  }
  return {
    replace: true,
    reason: safeAppliedDirectReplay
      ? "applied-plugin-direct-layout-rebuilt-natively"
      : safeExactChildTemplate
      ? "exact-child-layout-plugin-component-rebuilt-natively"
      : safeStructuredPluginTemplate
        ? "complete-structured-plugin-component-rebuilt-natively"
      : "high-confidence-pure-vector-plugin-component-rebuilt-natively",
    ...(safeExactChildTemplate ? {
      exactChildCoverageRatio: exactCoverage.ratio,
      exactChildShapeCount: exactCoverage.count
    } : {})
  };
}

function isSafeAppliedPluginDirectReplayCrop(image = {}, layerShapes = [], group = {}, options = {}) {
  if (!isAppliedPluginDirectReplayStructurallySafe(image, layerShapes, group)) return false;
  return image?.source?.componentTemplateVisualVerified === true
    || options.allowUnverifiedAppliedPluginPrototypeReplay === true;
}

function isAppliedPluginDirectReplayStructurallySafe(image = {}, layerShapes = [], group = {}) {
  const source = image?.source || {};
  const signal = [
    source.detector,
    source.expressionForm,
    source.expressionSubtype,
    source.layer?.layerType
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  if (/screenshot|screen|document|prototype|ui-screenshot|photo|brand|logo/.test(signal)) return false;
  if (source.componentTemplateAssetMotifReady !== true || Number(source.componentTemplateGroupScore || 0) < 94) return false;
  if (String(group?.reuseReadiness?.level || "").toLowerCase() !== "high") return false;
  if (Number(group?.pictureCount || 0) > 0) return false;
  const replayChildren = Array.isArray(group?.replayChildLayout?.children) ? group.replayChildLayout.children : [];
  const directShapes = (Array.isArray(layerShapes) ? layerShapes : [])
    .filter((shape) => shape?.source?.appliedPluginDirectReplay === true);
  if (replayChildren.length < 6 || directShapes.length < 6) return false;
  return directShapes.length >= Math.ceil(layerShapes.length * 0.8);
}

function isAppliedPluginReplayTemplate(layerShapes = []) {
  return (Array.isArray(layerShapes) ? layerShapes : [])
    .some((shape) => shape?.source?.appliedPluginDirectReplay === true);
}

function isAppliedPluginMotifReadyTemplate(image = {}, layerShapes = []) {
  const source = image?.source || {};
  if (source.componentTemplateAssetMotifReady === true) return true;
  if (source.componentAssetReadiness?.status === "applied-plugin-motif-ready") return true;
  return (Array.isArray(layerShapes) ? layerShapes : [])
    .some((shape) => shape?.source?.matchedComponentAssetMotifReady === true);
}

function componentTemplateGeneratedGeometrySafety(image = {}, layerShapes = []) {
  const imageBox = image?.box || {};
  if (!validPtBox(imageBox)) {
    return { safe: false, reason: "component-template-source-crop-box-invalid" };
  }
  const boxes = (Array.isArray(layerShapes) ? layerShapes : [])
    .map((shape) => shape?.box)
    .filter(validPtBox);
  if (boxes.length === 0) {
    return { safe: false, reason: "component-template-generated-geometry-missing" };
  }
  const union = unionPtBoxes(boxes);
  if (!validPtBox(union)) {
    return { safe: false, reason: "component-template-generated-geometry-invalid" };
  }
  const tolerance = Math.max(8, Math.min(22, Math.min(Number(imageBox.w || 0), Number(imageBox.h || 0)) * 0.08));
  const expanded = expandComponentTemplatePtBox(imageBox, tolerance);
  const overflowPt = componentTemplateBoxOverflowPt(union, expanded);
  const unionAreaRatio = (Number(union.w || 0) * Number(union.h || 0))
    / Math.max(1, Number(imageBox.w || 0) * Number(imageBox.h || 0));
  const substantial = boxes.filter((box) => Number(box.w || 0) * Number(box.h || 0) >= 6);
  const insideCount = substantial.filter((box) => {
    const area = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
    return boxOverlapArea(box, expanded) / area >= 0.72;
  }).length;
  const containedShapeRatio = substantial.length > 0 ? insideCount / substantial.length : 1;
  const zeroAreaOutliers = boxes.filter((box) => Number(box.w || 0) * Number(box.h || 0) < 6)
    .filter((box) => !componentTemplateBoxCenterInside(box, expanded)).length;
  const maxAllowedOverflow = Math.max(10, tolerance * 1.35);
  if (overflowPt > maxAllowedOverflow || unionAreaRatio > 1.55 || containedShapeRatio < 0.86 || zeroAreaOutliers > 0) {
    return {
      safe: false,
      reason: "component-template-generated-geometry-outside-source-crop",
      generatedGeometryUnionAreaRatio: roundRatio(unionAreaRatio),
      generatedGeometryContainedShapeRatio: roundRatio(containedShapeRatio),
      generatedGeometryOverflowPt: roundRatio(overflowPt)
    };
  }
  return {
    safe: true,
    reason: "component-template-generated-geometry-safe",
    generatedGeometryUnionAreaRatio: roundRatio(unionAreaRatio),
    generatedGeometryContainedShapeRatio: roundRatio(containedShapeRatio),
    generatedGeometryOverflowPt: roundRatio(overflowPt)
  };
}

function validPtBox(box = {}) {
  return Number.isFinite(Number(box.x))
    && Number.isFinite(Number(box.y))
    && Number.isFinite(Number(box.w))
    && Number.isFinite(Number(box.h))
    && Number(box.w) >= 0
    && Number(box.h) >= 0
    && (Number(box.w) > 0 || Number(box.h) > 0);
}

function expandComponentTemplatePtBox(box = {}, padding = 0) {
  const pad = Math.max(0, Number(padding || 0));
  return {
    x: Number(box.x || 0) - pad,
    y: Number(box.y || 0) - pad,
    w: Number(box.w || 0) + pad * 2,
    h: Number(box.h || 0) + pad * 2
  };
}

function componentTemplateBoxOverflowPt(box = {}, bounds = {}) {
  const left = Math.max(0, Number(bounds.x || 0) - Number(box.x || 0));
  const top = Math.max(0, Number(bounds.y || 0) - Number(box.y || 0));
  const right = Math.max(0, Number(box.x || 0) + Number(box.w || 0) - (Number(bounds.x || 0) + Number(bounds.w || 0)));
  const bottom = Math.max(0, Number(box.y || 0) + Number(box.h || 0) - (Number(bounds.y || 0) + Number(bounds.h || 0)));
  return Math.max(left, top, right, bottom);
}

function componentTemplateBoxCenterInside(box = {}, bounds = {}) {
  const cx = Number(box.x || 0) + Number(box.w || 0) / 2;
  const cy = Number(box.y || 0) + Number(box.h || 0) / 2;
  return cx >= Number(bounds.x || 0)
    && cx <= Number(bounds.x || 0) + Number(bounds.w || 0)
    && cy >= Number(bounds.y || 0)
    && cy <= Number(bounds.y || 0) + Number(bounds.h || 0);
}

function componentTemplateExactChildCoverage(image = {}, layerShapes = []) {
  const imageBox = image?.box || {};
  const imageArea = Math.max(1, Number(imageBox.w || 0) * Number(imageBox.h || 0));
  const exactShapes = (Array.isArray(layerShapes) ? layerShapes : [])
    .filter((shape) => shape?.source?.componentTemplateExactChildShape === true)
    .filter((shape) => shape.box && !/connector|picture-shell|text-slot/.test(String(shape?.source?.componentTemplatePart || "")));
  const coverageArea = exactShapes.reduce((sum, shape) => {
    const overlap = boxOverlapArea(shape.box || {}, imageBox);
    return sum + Math.max(0, overlap);
  }, 0);
  return {
    count: exactShapes.length,
    ratio: coverageArea / imageArea
  };
}

function isSafeExactChildTemplateCrop(image = {}, layerShapes = [], coverage = null) {
  const source = image?.source || {};
  const detector = String(source.detector || "").toLowerCase();
  const layerType = String(source.layer?.layerType || "").toLowerCase();
  const family = String(source.componentTemplateFamilyApplied || source.layer?.templateFamily || source.layer?.diagramUnderstanding?.componentStrategy?.templateFamily || "").toLowerCase();
  if (/screenshot|screen|document|prototype|ui|webpage|chart|kpi|evidence/.test(`${detector} ${layerType}`)) return false;
  const quadrantFamily = /quadrant/.test(family);
  if (/matrix|grid|table/.test(family) && !quadrantFamily) return false;
  const stats = coverage || componentTemplateExactChildCoverage(image, layerShapes);
  if (stats.count < 3) return false;
  const layeredStackFamily = /layered|stack|pyramid|funnel/.test(family);
  const timelineFamily = /timeline/.test(family);
  const coverageThreshold = layeredStackFamily ? 0.32 : timelineFamily ? 0.08 : quadrantFamily ? 0.45 : 0.42;
  if (layeredStackFamily && stats.count < 4) return false;
  if (timelineFamily && !hasExactTimelineTemplateParts(layerShapes)) return false;
  if (quadrantFamily && !hasExactQuadrantTemplateParts(image, layerShapes)) return false;
  if (stats.ratio < coverageThreshold) return false;
  const nativeParts = new Set((Array.isArray(layerShapes) ? layerShapes : []).map((shape) => String(shape?.source?.componentTemplatePart || "")));
  const hasNodeLike = [...nativeParts].some((part) => /node|cell|milestone|dot|center|decoration|ring-segment|layer/.test(part));
  return hasNodeLike && /process|chain|workflow|hub|spoke|cycle|radial|timeline|layered|stack|pyramid|funnel|quadrant/.test(family);
}

function hasExactTimelineTemplateParts(layerShapes = []) {
  const exactShapes = (Array.isArray(layerShapes) ? layerShapes : [])
    .filter((shape) => shape?.source?.componentTemplateExactChildShape === true);
  const hasPluginAxis = exactShapes.some((shape) => {
    const part = String(shape?.source?.componentTemplatePart || "");
    if (part !== "timeline-axis") return false;
    return shape?.source?.timelineAxisSource === "plugin-child-layout"
      || shape?.source?.layoutPreservation === "component-child-layout";
  });
  const milestoneCount = exactShapes.filter((shape) => /timeline-dot|timeline-milestone|milestone/.test(String(shape?.source?.componentTemplatePart || ""))).length;
  return hasPluginAxis && milestoneCount >= 3;
}

function hasExactQuadrantTemplateParts(image = {}, layerShapes = []) {
  const source = image?.source || {};
  const detector = String(source.detector || "").toLowerCase();
  const layerType = String(source.layer?.layerType || "").toLowerCase();
  if (layerType !== "diagram-zone") return false;
  if (/screenshot|screen|document|prototype|ui|webpage|chart|kpi|evidence|table|grid|matrix|comparison/.test(detector)) return false;
  const exactShapes = (Array.isArray(layerShapes) ? layerShapes : [])
    .filter((shape) => shape?.source?.componentTemplateExactChildShape === true);
  const cellCount = exactShapes.filter((shape) => String(shape?.source?.componentTemplatePart || "") === "quadrant-cell").length;
  const axisCount = (Array.isArray(layerShapes) ? layerShapes : [])
    .filter((shape) => String(shape?.source?.componentTemplatePart || "") === "quadrant-axis").length;
  return cellCount >= 4 && axisCount >= 2;
}

function isProtectedComponentTemplateFidelityCrop(image = {}, options = {}, layerShapes = []) {
  const source = image?.source || {};
  const detector = String(source.detector || "").toLowerCase();
  const layerType = String(source.layer?.layerType || "").toLowerCase();
  const family = String(source.componentTemplateFamilyApplied || source.layer?.templateFamily || source.layer?.diagramUnderstanding?.componentStrategy?.templateFamily || "").toLowerCase();
  if (isSafeTableMatrixTemplateCrop(image, layerShapes)) return false;
  if (isSafeStructuredPluginTemplateCrop(image, layerShapes)) return false;
  if (/quadrant/.test(family) && isSafeExactChildTemplateCrop(image, layerShapes)) return false;
  if (/screenshot|table|chart/.test(layerType)) return true;
  if (/screenshot|screen|document|table|matrix|grid|comparison|kpi-evidence|chart|evidence|sparse-diagram|foreground-graphic/.test(detector)) return true;
  if (/matrix|grid|table|chart/.test(family)) return true;
  return classifyImageExpressionForm(image) === "screenshot-or-document"
    || classifyImageExpressionForm(image) === "table-or-matrix";
}

function isSafeStructuredPluginTemplateCrop(image = {}, layerShapes = []) {
  const source = image?.source || {};
  const detector = String(source.detector || "").toLowerCase();
  const layerType = String(source.layer?.layerType || "").toLowerCase();
  const family = String(source.componentTemplateFamilyApplied || source.layer?.templateFamily || source.layer?.diagramUnderstanding?.componentStrategy?.templateFamily || "").toLowerCase();
  const form = classifyImageExpressionForm(image);
  if (!/diagram-zone|illustration-zone/.test(layerType)) return false;
  const sparseDiagram = /sparse-diagram/.test(detector);
  if (/screenshot|screen|document|prototype|ui|webpage|table|matrix|grid|comparison|kpi|evidence|chart/.test(detector)) return false;
  if (/screenshot-or-document|table-or-matrix|data-chart|chart-snapshot/.test(form)) return false;
  if (!/process|chain|workflow|hub|spoke|cycle|radial|timeline/.test(family)) return false;
  const score = Number(source.componentTemplateGroupScore || 0);
  if (!Number.isFinite(score) || score < 70) return false;
  if (sparseDiagram && score < 76) return false;
  const shapes = Array.isArray(layerShapes) ? layerShapes : [];
  if (shapes.length < 7) return false;
  const parts = shapes.map((shape) => String(shape?.source?.componentTemplatePart || ""));
  const nodeLikeCount = parts.filter((part) => /node|cell|milestone|dot|center|hub-node|process-node/.test(part)).length;
  const connectorLikeCount = parts.filter((part) => /connector|spoke|axis|line/.test(part)).length;
  if (nodeLikeCount < 3 || connectorLikeCount < 2) return false;
  const rasterLikeCount = shapes.filter((shape) => /picture|image|screenshot/.test(String(shape?.source?.componentTemplatePart || ""))).length;
  return rasterLikeCount === 0;
}

function isSafeTableMatrixTemplateCrop(image = {}, layerShapes = []) {
  const source = image?.source || {};
  const detector = String(source.detector || "").toLowerCase();
  const layerType = String(source.layer?.layerType || "").toLowerCase();
  const subtype = String(source.expressionSubtype || "").toLowerCase();
  const family = String(source.componentTemplateFamilyApplied || source.layer?.templateFamily || source.layer?.diagramUnderstanding?.componentStrategy?.templateFamily || "").toLowerCase();
  if (!/matrix|grid|table/.test(family)) return false;
  if (/screenshot|screen|document|prototype|ui|chart|kpi|evidence/.test(`${detector} ${layerType}`)) return false;
  const form = classifyImageExpressionForm(image);
  if (form !== "table-or-matrix" && layerType !== "table-zone") return false;
  const score = Number(source.componentTemplateGroupScore || 0);
  if (Number.isFinite(score) && score >= 72) return true;
  const matrixCellCount = Array.isArray(layerShapes)
    ? layerShapes.filter((shape) => /matrix-cell|table-cell|grid-cell/.test(String(shape?.source?.componentTemplatePart || ""))).length
    : 0;
  return Number.isFinite(score)
    && score >= 58
    && layerType === "table-zone"
    && /table-grid|matrix/.test(subtype)
    && matrixCellCount >= 12;
}

function findAppliedComponentGroup(source = {}) {
  const groupId = String(source.componentTemplateGroupId || "");
  const assets = Array.isArray(source.componentLocalAssets) ? source.componentLocalAssets : [];
  for (const asset of assets) {
    const groups = Array.isArray(asset?.recommendedComponentGroups) ? asset.recommendedComponentGroups : [];
    for (const group of groups) {
      if (String(group?.id || "") === groupId) return group;
    }
  }
  return null;
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
    mergeDiagramTextBoxes,
    collectComponentTemplateFallbackDiagramTextBoxes,
    suppressComponentTemplateShapesForSpecializedLayers,
    suppressOrphanComponentTemplateTextBoxes,
    replaceComponentTemplateCropsWhenFullyNative,
    componentAssetLayerPseudoImages,
    filterComponentTemplateShapeLayerInputs,
    filterComponentTemplateNativeInputs,
    componentTemplateInputClaimedByNativeShapes,
    shouldAllowAppliedPluginTemplateReplayCandidate,
    shouldSuppressComponentTemplateForTriangleTopology,
    createComponentTemplateHybridResidualCrop,
    createSpecializedNativeHybridResidualCrop,
    createSpecializedNativeHybridResidualCrops,
    createSpecializedNativeHybridResidualCropsFromNativeShapes,
    shouldKeepHybridComponentTemplateResidual,
    shouldKeepSpecializedNativeHybridResidual
  };
}

module.exports = { createComponentTemplateOrchestration };
