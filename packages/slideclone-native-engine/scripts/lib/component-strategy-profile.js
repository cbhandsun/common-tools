"use strict";

function summarizeComponentStrategyProfile(ir = {}) {
  const profile = emptyProfile();
  const appliedImageKeys = new Set();
  const motifReadyImageKeys = new Set();
  const wholeProcessImageKeys = new Set();
  const replacedImageKeys = new Set();
  const splitImageKeys = new Set();
  for (const page of Array.isArray(ir.pages) ? ir.pages : []) {
    for (const image of Array.isArray(page.images) ? page.images : []) {
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
  return [...new Set(values
    .map((motif) => safeKey(motif, "").toLowerCase())
    .filter((motif) => /^(arc-arrow|ring-node|card-grid|tree-link|radial-link|linear-arrow-chain|whole-process-template|lens-funnel-flow|branch-card-flow|pie-share-chart)$/.test(motif)))];
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
    readStrategy,
    safeKey
  }
};
