"use strict";

const {
  componentFamilyForMotif,
  inferComponentFamiliesFromText,
  sanitizeMotifs,
  uniqueComponentFamilies
} = require("./component-motifs");

function summarizeComponentStrategyProfile(ir = {}) {
  const profile = emptyProfile();
  const appliedImageKeys = new Set();
  const motifReadyImageKeys = new Set();
  const wholeProcessImageKeys = new Set();
  const replacedImageKeys = new Set();
  const splitImageKeys = new Set();
  for (const [pageOffset, page] of (Array.isArray(ir.pages) ? ir.pages : []).entries()) {
    const pageIndex = Number.isFinite(Number(page?.pageIndex)) ? Number(page.pageIndex) : pageOffset;
    for (const [imageOffset, image] of (Array.isArray(page.images) ? page.images : []).entries()) {
      const strategy = readStrategy(image);
      if (strategy) {
        const mode = safeKey(strategy.mode, "unknown");
        const implementationMode = safeKey(strategy.implementationMode, "unknown");
        const plan = strategy.applicationPlan && typeof strategy.applicationPlan === "object"
          ? strategy.applicationPlan
          : {};
        const currentStep = safeKey(plan.currentStep, "unknown");
        const provider = safeKey(
          plan.sourceProvider || strategy.bestCandidate?.sourceProvider,
          "unknown"
        );
        const kind = safeKey(
          plan.componentKind || strategy.bestCandidate?.kind,
          "unknown"
        );

        profile.componentStrategyImages += 1;
        addCount(profile.modeCounts, mode);
        addCount(profile.implementationModeCounts, implementationMode);
        addCount(profile.sourceProviderCounts, provider);
        addCount(profile.componentKindCounts, kind);
        addCount(profile.applicationStepCounts, currentStep);

        if (mode === "plugin-component-template") profile.pluginComponentTemplateImages += 1;
        if (mode === "preserve-crop-with-component-reference") profile.preserveCropWithComponentReferenceImages += 1;
        if (mode === "native-rebuild-with-component-style-guide") profile.nativeRebuildWithComponentStyleGuideImages += 1;
        if (mode === "native-visual-atom-rebuild") profile.nativeVisualAtomRebuildImages += 1;
        if (mode === "preserve-local-crop") profile.preserveLocalCropImages += 1;
        if (plan.requiresDownload === true) profile.downloadRequiredImages += 1;
        if (plan.preservesFidelityNow === true) profile.fidelityPreservedImages += 1;
        addCount(profile.expectationCounts, strategy.editableExpectation || "unknown");
        if (isComponentTemplateRejectedByLayerEligibility(strategy)) {
          profile.componentTemplateRejectedByLayerEligibilityImages += 1;
        }
        collectLocalAssetMatches(profile, image);
      }
      addComponentFamilyAppliedCounts(profile.componentFamilyAppliedCounts, image?.source);
      addComponentFamilyGapCounts(profile, image, { pageIndex, imageIndex: imageOffset });
      if (image?.source?.componentTemplateGroupApplied === true) {
        appliedImageKeys.add(componentTemplateLayerKey(image, image?.id));
        if (isMotifReadyComponentTemplateSource(image.source)) {
          motifReadyImageKeys.add(componentTemplateLayerKey(image, image?.id));
          addMotifReadyTemplateCounts(profile, image.source);
        }
        if (isWholeProcessTemplateSource(image.source)) {
          wholeProcessImageKeys.add(componentTemplateLayerKey(image, image?.id));
        }
        profile.componentTemplateNativeShapes += Number(image.source.componentTemplateNativeShapes || 0);
        addCount(profile.componentTemplateFamilyCounts, image.source.componentTemplateFamilyApplied || "unknown");
        addCount(profile.componentTemplateGroupCounts, image.source.componentTemplateGroupId || "unknown");
        if (image.source.componentTemplateCropReplacedByNative === false) {
          profile.componentTemplateCropPreservedImages += 1;
          addCount(profile.componentTemplateCropPreservedReasonCounts, image.source.componentTemplateCropReplacementReason || "unknown");
        }
      }
      if (image?.source?.componentTemplateCropSplitIntoResiduals === true) {
        splitImageKeys.add(componentTemplateLayerKey(image, image.source.layerSourceId));
        if (image.source.detector === "component-template-picture-residual-crop") {
          profile.componentTemplatePictureResidualImages += 1;
        }
      }
      if (isComponentTemplateNativePicture(image)) {
        profile.componentTemplateAppliedPictures += 1;
        appliedImageKeys.add(componentTemplateLayerKey(image, image.source.layerSourceId));
        if (isMotifReadyComponentTemplateSource(image.source)) {
          profile.componentTemplateMotifReadyPictures += 1;
          motifReadyImageKeys.add(componentTemplateLayerKey(image, image.source.layerSourceId));
          addMotifReadyTemplateCounts(profile, image.source);
        }
        if (isWholeProcessTemplateSource(image.source)) {
          profile.componentTemplateWholeProcessPictures += 1;
          wholeProcessImageKeys.add(componentTemplateLayerKey(image, image.source.layerSourceId));
        }
        addComponentTemplateStructureFitCounts(profile, image.source, "picture");
        addComponentTemplateRoleCounts(profile, image.source);
      }
    }
    for (const shape of Array.isArray(page.shapes) ? page.shapes : []) {
      if (isVisualAtomTopologyConnectorSource(shape.source)) profile.visualAtomTopologyConnectors += 1;
      if (isVisualAtomContainerNodeSource(shape.source)) profile.visualAtomContainerNodes += 1;
      if (isVisualAtomContainedNodeSource(shape.source)) profile.visualAtomContainedNodes += 1;
      addComponentFamilyAppliedCounts(profile.componentFamilyAppliedCounts, shape?.source);
      if (shape?.source?.componentTemplateGroupApplied !== true) continue;
      profile.componentTemplateAppliedShapes += 1;
      appliedImageKeys.add(componentTemplateLayerKey(shape, shape.source.layerSourceId));
      if (isMotifReadyComponentTemplateSource(shape.source)) {
        profile.componentTemplateMotifReadyShapes += 1;
        motifReadyImageKeys.add(componentTemplateLayerKey(shape, shape.source.layerSourceId));
        addMotifReadyTemplateCounts(profile, shape.source);
      }
      if (isWholeProcessTemplateSource(shape.source)) {
        profile.componentTemplateWholeProcessShapes += 1;
        wholeProcessImageKeys.add(componentTemplateLayerKey(shape, shape.source.layerSourceId));
      }
      addCount(profile.componentTemplateShapePartCounts, shape.source.componentTemplatePart || "unknown");
      addComponentTemplateStructureFitCounts(profile, shape.source, "shape");
      addComponentTemplateRoleCounts(profile, shape.source);
      if (shape.source.componentTemplateCropReplacedByNative === true) {
        replacedImageKeys.add(componentTemplateLayerKey(shape, shape.source.layerSourceId));
      }
      if (shape.source.componentTemplateCropSplitIntoResiduals === true) {
        splitImageKeys.add(componentTemplateLayerKey(shape, shape.source.layerSourceId));
      }
    }
    for (const textBox of Array.isArray(page.textBoxes) ? page.textBoxes : []) {
      addComponentFamilyAppliedCounts(profile.componentFamilyAppliedCounts, textBox?.source);
      if (textBox?.source?.componentTemplateGroupApplied !== true) continue;
      profile.componentTemplateAppliedTextBoxes += 1;
      appliedImageKeys.add(componentTemplateLayerKey(textBox, textBox.source.layerSourceId));
      if (isMotifReadyComponentTemplateSource(textBox.source)) {
        profile.componentTemplateMotifReadyTextBoxes += 1;
        motifReadyImageKeys.add(componentTemplateLayerKey(textBox, textBox.source.layerSourceId));
        addMotifReadyTemplateCounts(profile, textBox.source);
      }
      if (isWholeProcessTemplateSource(textBox.source)) {
        profile.componentTemplateWholeProcessTextBoxes += 1;
        wholeProcessImageKeys.add(componentTemplateLayerKey(textBox, textBox.source.layerSourceId));
      }
      addComponentTemplateStructureFitCounts(profile, textBox.source, "textbox");
      addComponentTemplateRoleCounts(profile, textBox.source);
    }
  }
  profile.componentTemplateAppliedImages = appliedImageKeys.size;
  profile.componentTemplateMotifReadyImages = motifReadyImageKeys.size;
  profile.componentTemplateWholeProcessImages = wholeProcessImageKeys.size;
  profile.componentTemplateCropReplacedImages = replacedImageKeys.size;
  profile.componentTemplateCropSplitImages = splitImageKeys.size;
  profile.pluginReferencedImages = profile.pluginComponentTemplateImages
    + profile.preserveCropWithComponentReferenceImages
    + profile.nativeRebuildWithComponentStyleGuideImages;
  profile.componentFamilyAppliedTypes = countPositiveCounts(profile.componentFamilyAppliedCounts);
  profile.componentFamilyGapTypes = countPositiveCounts(profile.componentFamilyGapCounts);
  return profile;
}

function emptyProfile() {
  return {
    componentStrategyImages: 0,
    pluginReferencedImages: 0,
    pluginComponentTemplateImages: 0,
    preserveCropWithComponentReferenceImages: 0,
    nativeRebuildWithComponentStyleGuideImages: 0,
    nativeVisualAtomRebuildImages: 0,
    preserveLocalCropImages: 0,
    componentTemplateRejectedByLayerEligibilityImages: 0,
    downloadRequiredImages: 0,
    fidelityPreservedImages: 0,
    componentLocalAssetImages: 0,
    componentLocalAssetMatches: 0,
    componentRecommendedGroupImages: 0,
    componentRecommendedGroupMatches: 0,
    componentHighReusableGroupMatches: 0,
    componentTemplateAppliedImages: 0,
    componentTemplateAppliedShapes: 0,
    componentTemplateAppliedTextBoxes: 0,
    componentTemplateAppliedPictures: 0,
    componentTemplateMotifReadyImages: 0,
    componentTemplateMotifReadyShapes: 0,
    componentTemplateMotifReadyTextBoxes: 0,
    componentTemplateMotifReadyPictures: 0,
    componentTemplateWholeProcessImages: 0,
    componentTemplateWholeProcessShapes: 0,
    componentTemplateWholeProcessTextBoxes: 0,
    componentTemplateWholeProcessPictures: 0,
    componentTemplateNativeShapes: 0,
    componentTemplateCropReplacedImages: 0,
    componentTemplateCropSplitImages: 0,
    componentTemplatePictureResidualImages: 0,
    componentTemplateCropPreservedImages: 0,
    componentFamilyAppliedCounts: {},
    componentFamilyAppliedTypes: 0,
    componentFamilyGapCounts: {},
    componentFamilyGapTypes: 0,
    componentFamilyGapExamples: [],
    visualAtomTopologyConnectors: 0,
    visualAtomContainerNodes: 0,
    visualAtomContainedNodes: 0,
    modeCounts: {},
    implementationModeCounts: {},
    sourceProviderCounts: {},
    componentKindCounts: {},
    applicationStepCounts: {},
    componentAssetProviderCounts: {},
    componentRecommendedGroupCounts: {},
    componentReuseReadinessCounts: {},
    componentTemplateFamilyCounts: {},
    componentTemplateGroupCounts: {},
    componentTemplateMotifReadyFamilyCounts: {},
    componentTemplateMotifReadyGroupCounts: {},
    componentTemplateMotifReadyTargetCounts: {},
    componentTemplateShapePartCounts: {},
    componentTemplateStructureFitShapes: 0,
    componentTemplateStructureFitTextBoxes: 0,
    componentTemplateStructureFitPictures: 0,
    componentTemplateStructureFitReasonCounts: {},
    componentTemplateNativeRoleCounts: {},
    componentTemplateStructureRoleCounts: {},
    expectationCounts: {},
    componentTemplateCropPreservedReasonCounts: {}
  };
}

function componentTemplateLayerKey(item = {}, fallback = "") {
  const source = item?.source || {};
  return safeKey(source.layerSourceId || item.id || fallback || "unknown", "unknown");
}

function collectLocalAssetMatches(profile, image = {}) {
  const assets = Array.isArray(image?.source?.componentLocalAssets) ? image.source.componentLocalAssets : [];
  if (assets.length === 0) return;
  profile.componentLocalAssetImages += 1;
  profile.componentLocalAssetMatches += assets.length;
  let imageHasRecommendedGroup = false;
  for (const asset of assets) {
    addCount(profile.componentAssetProviderCounts, asset.provider || "unknown");
    const groups = Array.isArray(asset.recommendedComponentGroups) ? asset.recommendedComponentGroups : [];
    if (groups.length === 0) continue;
    imageHasRecommendedGroup = true;
    profile.componentRecommendedGroupMatches += groups.length;
    for (const group of groups) {
      addCount(profile.componentRecommendedGroupCounts, group?.id || "unknown");
      const readiness = safeKey(group?.reuseReadiness?.level || "", "");
      if (readiness) {
        addCount(profile.componentReuseReadinessCounts, readiness);
        if (readiness === "high") profile.componentHighReusableGroupMatches += 1;
      }
    }
  }
  if (imageHasRecommendedGroup) profile.componentRecommendedGroupImages += 1;
}

function isVisualAtomTopologyConnectorSource(source = {}) {
  return source?.detector === "visual-atom-native-connector"
    && safeKey(source.fromAtomId || "", "")
    && safeKey(source.toAtomId || "", "");
}

function isVisualAtomContainerNodeSource(source = {}) {
  return /^visual-atom-native-/.test(safeKey(source?.detector || "", ""))
    && source?.topologyRole === "container"
    && Array.isArray(source.containedAtomIds)
    && source.containedAtomIds.length > 0;
}

function isVisualAtomContainedNodeSource(source = {}) {
  return /^visual-atom-native-/.test(safeKey(source?.detector || "", ""))
    && safeKey(source?.containerAtomId || "", "");
}

function isComponentTemplateNativePicture(image = {}) {
  return image?.source?.detector === "plugin-component-template-native-picture"
    || image?.type === "plugin-component-picture";
}

function addComponentTemplateRoleCounts(profile, source = {}) {
  if (!source || typeof source !== "object") return;
  const nativeRole = safeKey(source.nativeComponentRole || "", "");
  if (nativeRole) addCount(profile.componentTemplateNativeRoleCounts, nativeRole);
  const structureRole = safeKey(source.appliedPluginStructureRole || "", "");
  if (structureRole) addCount(profile.componentTemplateStructureRoleCounts, structureRole);
}

function addComponentTemplateStructureFitCounts(profile, source = {}, kind = "") {
  const score = Number(source.matchedComponentStructureFitScore);
  if (!Number.isFinite(score) || score <= 0) return;
  if (kind === "shape") profile.componentTemplateStructureFitShapes += 1;
  else if (kind === "textbox") profile.componentTemplateStructureFitTextBoxes += 1;
  else if (kind === "picture") profile.componentTemplateStructureFitPictures += 1;
  const reasons = Array.isArray(source.matchedComponentStructureFitReasons)
    ? source.matchedComponentStructureFitReasons
    : [];
  for (const reason of reasons) addCount(profile.componentTemplateStructureFitReasonCounts, reason || "unknown");
}

function isMotifReadyComponentTemplateSource(source = {}) {
  if (!source || typeof source !== "object") return false;
  return source.matchedComponentAssetMotifReady === true
    || source.componentTemplateAssetMotifReady === true;
}

function isWholeProcessTemplateSource(source = {}) {
  if (!source || typeof source !== "object") return false;
  return source.matchedComponentWholeProcessTemplate === true
    || source.componentTemplateWholeProcessApplied === true
    || componentTemplateTargetMotifs(source).includes("whole-process-template");
}

function addMotifReadyTemplateCounts(profile, source = {}) {
  addCount(profile.componentTemplateMotifReadyFamilyCounts, source.componentTemplateFamilyApplied || source.nativeComponentArchetype || "unknown");
  addCount(profile.componentTemplateMotifReadyGroupCounts, source.matchedComponentGroupId || source.componentTemplateGroupId || "unknown");
  const motifs = componentTemplateTargetMotifs(source);
  if (motifs.length === 0) {
    addCount(profile.componentTemplateMotifReadyTargetCounts, "unknown");
  } else {
    for (const motif of motifs) addCount(profile.componentTemplateMotifReadyTargetCounts, motif);
  }
}

function componentTemplateTargetMotifs(source = {}) {
  const values = [
    ...(Array.isArray(source.matchedComponentTargetMotifs) ? source.matchedComponentTargetMotifs : []),
    ...(Array.isArray(source.componentTemplateTargetMotifs) ? source.componentTemplateTargetMotifs : [])
  ];
  return sanitizeMotifs(values);
}

function addComponentFamilyAppliedCounts(target, source = {}) {
  if (!source || typeof source !== "object") return;
  if (
    source.componentTemplateGroupApplied !== true
    && source.nativeComponentInstance !== true
    && source.nativeRebuild !== true
    && !safeKey(source.nativeComponentArchetype || "", "")
  ) {
    return;
  }
  const families = inferComponentFamiliesFromSource(source);
  for (const family of families) addCount(target, family);
}

function inferComponentFamiliesFromSource(source = {}) {
  const motifFamilies = componentTemplateTargetMotifs(source).map(componentFamilyForMotif).filter(Boolean);
  const textFamilies = inferComponentFamiliesFromText([
    source.componentTemplateFamilyApplied,
    source.nativeComponentArchetype,
    source.nativeComponentRole,
    source.nativeComponentPart,
    source.componentTemplatePart,
    source.expressionForm,
    source.expressionSubtype,
    source.recommendedAction,
    source.detector,
    source.layer?.templateFamily,
    source.layer?.layerType,
    source.layer?.expressionForm,
    source.layer?.expressionSubtype,
    source.layer?.recommendedAction,
    source.layer?.detector,
    source.layer?.diagramUnderstanding?.archetype,
    source.layer?.diagramUnderstanding?.componentStrategy?.templateFamily
  ].map((value) => safeKey(value, "")).join(" "));
  return uniqueComponentFamilies([...motifFamilies, ...textFamilies]);
}

function addComponentFamilyGapCounts(profile, image = {}, context = {}) {
  const source = image?.source || {};
  if (!source || typeof source !== "object") return;
  if (!isComponentFamilyGapImage(image)) return;
  const families = inferComponentFamiliesFromSource(source);
  if (families.length === 0) return;
  for (const family of families) addCount(profile.componentFamilyGapCounts, family);
  if (profile.componentFamilyGapExamples.length >= 24) return;
  const layer = source.layer || {};
  const strategy = readStrategy(image) || {};
  profile.componentFamilyGapExamples.push({
    page: Number(context.pageIndex || 0) + 1,
    image: Number(context.imageIndex || 0) + 1,
    families,
    mode: safeKey(strategy.mode || source.componentStrategyMode || "", ""),
    detector: safeKey(source.detector || layer.detector || "", ""),
    layerType: safeKey(source.layerType || layer.layerType || "", ""),
    family: safeKey(
      source.componentTemplateFamilyApplied
      || layer.templateFamily
      || layer.diagramUnderstanding?.componentStrategy?.templateFamily
      || layer.diagramUnderstanding?.archetype
      || source.expressionSubtype
      || layer.expressionSubtype
      || "",
      ""
    ),
    reason: componentFamilyGapReason(source, strategy)
  });
}

function isComponentFamilyGapImage(image = {}) {
  const source = image?.source || {};
  if (!source || typeof source !== "object") return false;
  if (isComponentTemplateNativePicture(image)) return false;
  if (source.editable === true || source.nativeRebuild === true || source.nativeComponentInstance === true) return false;
  const strategy = readStrategy(image) || {};
  const mode = safeKey(strategy.mode || source.componentStrategyMode || "", "");
  if (source.componentTemplateCropReplacedByNative === false) return true;
  if (source.residualSplitRejected && typeof source.residualSplitRejected === "object") return true;
  return /^(preserve-local-crop|preserve-crop-with-component-reference)$/u.test(mode);
}

function componentFamilyGapReason(source = {}, strategy = {}) {
  if (source.componentTemplateCropReplacedByNative === false) {
    return safeKey(source.componentTemplateCropReplacementReason || "component-template-crop-retained", "component-template-crop-retained");
  }
  if (source.residualSplitRejected && typeof source.residualSplitRejected === "object") return "residual-split-rejected";
  return safeKey(strategy.mode || source.componentStrategyMode || "preserve-local-crop", "preserve-local-crop");
}

function readStrategy(image = {}) {
  const direct = image?.source?.componentRenderStrategy;
  if (direct && typeof direct === "object") return direct;
  const nested = image?.source?.layer?.componentRenderStrategy;
  return nested && typeof nested === "object" ? nested : null;
}

function isComponentTemplateRejectedByLayerEligibility(strategy = {}) {
  return strategy.mode === "preserve-local-crop"
    && strategy.editableExpectation === "raster-preserved-because-component-template-is-not-layer-eligible";
}

function addCount(target, key, count = 1) {
  const safe = safeKey(key, "unknown");
  const value = Number(count);
  target[safe] = (target[safe] || 0) + (Number.isFinite(value) ? value : 0);
}

function countPositiveCounts(counts = {}) {
  return Object.values(counts || {})
    .filter((count) => Number(count || 0) > 0)
    .length;
}

function safeKey(value, fallback) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);
  return text || fallback;
}

module.exports = {
  addCount,
  collectLocalAssetMatches,
  summarizeComponentStrategyProfile,
  _private: {
    emptyProfile,
    componentFamilyGapReason,
    inferComponentFamiliesFromSource,
    isComponentFamilyGapImage,
    readStrategy,
    safeKey
  }
};
