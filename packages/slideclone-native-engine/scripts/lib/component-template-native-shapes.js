"use strict";

const { isProtectedFidelityFirstDiagram, isSemanticallySplitScreenshotFlowRegion } = require("./component-template-source-evidence");
const fs = require("node:fs");
const path = require("node:path");
const { summarizeLocalComponentAsset } = require("./component-asset-learning");
const { evaluateComponentGroupsForLayer } = require("./component-template-group-matcher");
const { classifyGraphicExpressionPolicy } = require("./graphic-expression-policy");
const {
  firstTemplateConnectorStyle,
  mergeTemplateStyle,
  nativeTypeForTemplateStyle,
  sanitizeTemplateFreeform
} = require("./component-template-style");
const {
  paletteFromMatch,
  paletteSummary
} = require("./component-template-palette");
const {
  anchorAxisBetween,
  boxCenter,
  boxOverlapArea,
  clampBox,
  clampInteger,
  clampNumber,
  isInsideUnitBox,
  isUsefulTemplateNodeBox,
  scaleRelativeBox,
  unionBox
} = require("./component-template-geometry");
const {
  componentFamily,
  effectiveComponentGroupMinScore,
  hasStructuredCycleEvidence,
  hasStructuredMatrixEvidence,
  hasStructuredProcessEvidence,
  hasStructuredQuadrantEvidence,
  hasStructuredRelationshipEvidence,
  hasStructuredTimelineEvidence,
  isChartFamily,
  isLearnedReplayFamily
} = require("./component-template-family-evidence");
const {
  safeColorOrNone,
  safeComponentToken,
  safeText
} = require("./component-template-sanitizers");
const {
  componentTemplateTargetMotifs,
  isWholeProcessTemplateMatch,
  motifSetForAssetGroup
} = require("./component-template-motifs");
const { chartShapes } = require("./component-template-chart-shapes");
const { learnedComponentReplayShapes } = require("./component-template-learned-replay-shapes");
const { syntheticRemoteComponentMatch } = require("./component-template-remote-candidate");
const {
  appliedChildStructureRole,
  groupHasNoisyGenericPlaceholderText,
  isReusableAppliedChildBox,
  isTemplateConnectorDecorationStyle,
  templateDirectAppliedLayoutShapes,
  templateSupplementalAppliedLayoutShapes
} = require("./component-template-applied-layout-replay");
const {
  hasReusableTemplateChildStyleDetails,
  isBetterComponentGroupCandidate,
  normalizeComponentStructureKind,
  scoreComponentGroupStructureFit,
  shouldSkipLowReuseComponentGroup,
  summarizeGenerationStructureSignature,
  targetComponentStructureKinds
} = require("./component-template-structure-fit");
const {
  matrixShapes,
  quadrantShapes
} = require("./component-template-matrix-quadrant-shapes");
const { processChainShapes } = require("./component-template-process-shapes");
const { layeredStackShapes } = require("./component-template-layered-stack-shapes");
const {
  cycleLoopItemCount,
  cycleLoopShapes
} = require("./component-template-cycle-shapes");
const { createHubTreeTimelineShapeGenerators } = require("./component-template-hub-tree-timeline-shapes");
const {
  normalizeVisualNodeBox,
  treeVisualNodes,
  visualConnectorsBetweenNodes,
  visualCycleNodeOrder
} = require("./component-template-visual-graph");
const { createComponentTemplateOutputProjection } = require("./component-template-output-projection");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };
const generationLearningCache = new Map();
const hubTreeTimelineShapes = createHubTreeTimelineShapeGenerators({
  median,
  nativeShape,
  safeBox,
  selectTemplateNodeBoxes,
  templateGuidedChildSource
});
const componentTemplateOutputProjection = createComponentTemplateOutputProjection({
  componentTemplateNativeGroupId,
  groupHasNoisyGenericPlaceholderText,
  isGenericPluginPlaceholderText,
  safeBox,
  sanitizeStructureFitReasons,
  shouldSkipLowReuseComponentGroup
});

function createComponentTemplateNativeShapes(images = [], slideSize = DEFAULT_SLIDE, options = {}) {
  return createComponentTemplateNativeObjects(images, slideSize, options).shapes;
}

function createComponentTemplateNativeObjects(images = [], slideSize = DEFAULT_SLIDE, options = {}) {
  const shapes = [];
  const textBoxes = [];
  const extractedImages = [];
  const minScore = clampNumber(options.minScore, 0, 100, 58);
  const textBackfillState = {
    sourceTextBoxes: componentTemplateOutputProjection.normalizeSourceTextBoxes(options.sourceTextBoxes),
    usedSourceTextBoxIds: new Set()
  };
  for (const image of Array.isArray(images) ? images : []) {
    if (shouldSkipComponentTemplateNativeShapes(image)) continue;
    const match = selectComponentGroupMatch(image, { minScore });
    if (!match) continue;
    const family = componentFamily(image, match);
    const generated = shapesForFamily(image, match, family, slideSize);
    if (generated.length === 0) continue;
    markImageApplied(image, match, family, generated.length);
    const mediaImages = componentTemplateOutputProjection.componentTemplateImagesFromShapes(generated, image, match, options);
    const mediaShapeIds = new Set(mediaImages.map((item) => item.source?.replacedPictureShellId).filter(Boolean));
    shapes.push(...generated.filter((shape) => !mediaShapeIds.has(shape.id)));
    textBoxes.push(...componentTemplateOutputProjection.componentTemplateTextBoxesFromShapes(generated, image, match, textBackfillState, {
      preserveGenericPluginText: options.preserveGenericPluginText === true
    }));
    textBoxes.push(...componentTemplateOutputProjection.componentTemplateSourceBoundTextBoxesFromShapes(generated, image, match, textBackfillState));
    textBoxes.push(...componentTemplateOutputProjection.componentTemplateSupplementalTextBoxes(image, match, slideSize, textBackfillState));
    extractedImages.push(...mediaImages);
  }
  return { shapes, textBoxes, images: extractedImages };
}

function shouldSkipComponentTemplateNativeShapes(image = {}) {
  const source = image?.source || {};
  return source.assetHubCycleObjectified === true
    || source.inputOutputSplitObjectified === true
    || source.productBrainVisionObjectified === true
    || source.toolGapPlatformObjectified === true
    || source.stackedArchitectureObjectified === true
    || source.skillChainOverviewObjectified === true
    || source.semanticCycleDiagramObjectified === true
    || source.structuredIllustrationShellObjectified === true
    || source.intentionalMinimumUnitCrop === true
    || isResidualIllustrationVisualUnit(source)
    || String(source.detector || "") === "illustration-card-graphic-underlay-crop"
    || isProtectedGraphicExpressionForNativeTemplate(source, image)
    || (hasRasterResidualDominance(source, image) && !hasAnyLocalTemplateGroup(source))
    || isProtectedFidelityFirstDiagram(source, hasTrustedLocalTemplateGroup(source))
    || isSemanticallySplitScreenshotFlowRegion(source);
}

function isResidualIllustrationVisualUnit(source = {}) {
  const detector = String(source.detector || source.layer?.detector || "").toLowerCase();
  const layerType = String(source.layerType || source.layer?.layerType || "").toLowerCase();
  const expressionForm = String(source.expressionForm || source.layer?.expressionForm || "").toLowerCase();
  const expressionSubtype = String(source.expressionSubtype || source.layer?.expressionSubtype || "").toLowerCase();
  const reason = `${source.reason || ""} ${source.nonEditableReason || ""} ${source.nativeRebuildDeferredReason || ""}`.toLowerCase();
  const residual = /residual|icon-crop|sketch|wand-icon|protected-diagram|product-illustration-segment/.test(detector)
    || /residual|preserved after native|preserved as a local|kept as protected|remaining residual/.test(reason);
  if (!residual) return false;
  if (/screenshot|document|ui-screenshot|product-screenshot/.test(`${layerType} ${expressionForm} ${expressionSubtype}`)) return true;
  if (/illustration|icon|sketch|brand|logo/.test(`${layerType} ${expressionForm} ${expressionSubtype} ${detector}`)) return true;
  return false;
}

function isProtectedGraphicExpressionForNativeTemplate(source = {}, image = {}) {
  if (isAppliedPluginMotifReady(source)) return false;
  const policy = classifyGraphicExpressionPolicy({
    image,
    source,
    layer: source.layer,
    detector: source.detector,
    layerType: source.layer?.layerType,
    expressionForm: source.expressionForm,
    expressionSubtype: source.expressionSubtype,
    recommendedAction: source.recommendedAction || source.layer?.recommendedAction,
    reason: `${source.reason || ""} ${source.nonEditableReason || ""}`,
    diagramUnderstanding: source.layer?.diagramUnderstanding,
    standaloneVisualAsset: source.standaloneVisualAsset === true || source.layer?.standaloneVisualAsset === true
  });
  if (!policy.protectCrop || policy.allowNativeRebuild) return false;
  if (!/^(standalone-visual-asset|decorative-texture)$/.test(policy.kind)) return false;
  image.source = {
    ...source,
    nativeRebuildDeferredReason: source.nativeRebuildDeferredReason
      || `protected graphic expression is preserved as a local crop: ${policy.reasons.join(", ")}`
  };
  return true;
}

function hasTrustedLocalTemplateGroup(source = {}) {
  if (isAppliedPluginMotifReady(source)) return true;
  const assets = Array.isArray(source.componentLocalAssets) ? source.componentLocalAssets : [];
  return assets.some((asset) => {
    const kind = String(asset?.assetKind || "").toLowerCase();
    if (kind !== "presentation-template") return false;
    const groups = Array.isArray(asset.recommendedComponentGroups) ? asset.recommendedComponentGroups : [];
    return groups.some((group) => {
      if (shouldSkipLowReuseComponentGroup(group)) return false;
      const score = clampNumber(group?.score ?? group?.matchScore ?? group?.componentScore, 0, 100, 0);
      const shapeCount = clampNumber(group?.shapeCount ?? group?.childCount, 0, 999, 0);
      const pictureCount = clampNumber(group?.pictureCount, 0, 999, 0);
      return score >= 68 && shapeCount >= 6 && pictureCount === 0;
    });
  });
}

function hasAnyLocalTemplateGroup(source = {}) {
  const assets = Array.isArray(source.componentLocalAssets) ? source.componentLocalAssets : [];
  return assets.some((asset) => {
    const groups = Array.isArray(asset.recommendedComponentGroups) ? asset.recommendedComponentGroups : [];
    return groups.some((group) => {
      if (shouldSkipLowReuseComponentGroup(group)) return false;
      const score = clampNumber(group?.score ?? group?.matchScore ?? group?.componentScore, 0, 100, 0);
      const pictureCount = clampNumber(group?.pictureCount, 0, 999, 0);
      const childCount = clampNumber(group?.childCount ?? group?.shapeCount, 0, 999, 0);
      return score >= 58 && childCount >= 2 && pictureCount === 0;
    });
  });
}

function hasRasterResidualDominance(source = {}, image = {}) {
  if (isAppliedPluginMotifReady(source)) return false;
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const layerType = String(layer.layerType || "").toLowerCase();
  const action = String(source.recommendedAction || layer.recommendedAction || "").toLowerCase();
  const expressionForm = String(source.expressionForm || "").toLowerCase();
  const expressionSubtype = String(source.expressionSubtype || "").toLowerCase();
  const detector = String(source.detector || "").toLowerCase();
  if (/screenshot|document/.test(layerType) || expressionForm === "screenshot-or-document") return true;
  if (/ui-screenshot|product-screenshot|document-snapshot|screen-capture/.test(expressionSubtype)) return true;
  if (/screenshot|document|screen-capture/.test(detector) && /preserve-local-crop|preserve-fidelity-crop|keep-local-crop/.test(action)) return true;

  const atoms = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
  const rasterAtoms = atoms.filter((atom) => isRasterResidualAtom(atom));
  const nodeCount = clampNumber(understanding.visualNodeCount || understanding.nodeCount, 0, 999, 0);
  if (rasterAtoms.length === 0) return false;
  if (rasterAtoms.length >= Math.max(2, Math.ceil(nodeCount * 0.5))) return true;
  const rasterArea = rasterAtoms.reduce((sum, atom) => sum + atomBoxArea(atom?.box), 0);
  const nativeAtoms = atoms.filter((atom) => atom?.nativeCandidate === true || atom?.residualCandidate === false);
  const nativeArea = nativeAtoms.reduce((sum, atom) => sum + atomBoxArea(atom?.box), 0);
  if (rasterArea > 0 && nativeArea > 0 && rasterArea >= nativeArea * 0.72) return true;
  return rasterArea >= clampNumber(image.box?.w || source.box?.w || layer.box?.w, 0, 10000, 0)
    * clampNumber(image.box?.h || source.box?.h || layer.box?.h, 0, 10000, 0)
    * 0.18;
}

function isRasterResidualAtom(atom = {}) {
  const kind = String(atom?.kind || "").toLowerCase();
  const hint = String(atom?.shapeHint || "").toLowerCase();
  const detector = String(atom?.detector || "").toLowerCase();
  return atom?.residualCandidate === true
    && /screenshot|document|screen|image|photo|complex-shape|icon-crop/.test(`${kind} ${hint} ${detector}`);
}

function atomBoxArea(box = {}) {
  return Math.max(0, Number(box?.w || 0)) * Math.max(0, Number(box?.h || 0));
}

function selectComponentGroupMatch(image = {}, options = {}) {
  const strategy = image?.source?.componentRenderStrategy || {};
  const allowAppliedReplay = shouldAllowAppliedPluginTemplateReplayCandidate(image);
  if (strategy.mode !== "plugin-component-template" && !allowAppliedReplay) return null;
  if (strategy.applicationPlan?.preservesFidelityNow === true && !allowAppliedReplay) return null;
  const family = componentFamily(image, {});
  const baseMinScore = clampNumber(options.minScore, 0, 100, 58);
  const effectiveMinScore = effectiveComponentGroupMinScore(image, family, baseMinScore);
  const assets = generationReadyComponentAssets(image, family);
  const readiness = image?.source?.componentAssetReadiness || {};
  let best = null;
  for (const asset of assets) {
    const groups = Array.isArray(asset.recommendedComponentGroups) ? asset.recommendedComponentGroups : [];
    for (const group of groups) {
      if (shouldSkipLowReuseComponentGroup(group)) continue;
      const assetMotifReady = isAppliedAssetMotifReady(asset, group, readiness);
      const rawScore = clampNumber(group?.score ?? group?.matchScore, 0, 100, 0);
      const score = assetMotifReady ? Math.max(rawScore, 94) : rawScore;
      if (score < effectiveMinScore) continue;
      const structureFit = scoreComponentGroupStructureFit(image, group);
      if (structureFit.hardMismatch === true) continue;
      const candidate = {
        ...group,
        score,
        structureFitScore: structureFit.score,
        structureFitReasons: structureFit.reasons,
        assetProvider: asset.provider,
        assetName: asset.name,
        assetPath: asset.path,
        assetMatchScore: clampNumber(asset.matchScore, 0, 1000, 0),
        assetReusePolicy: safeText(asset.reusePolicy),
        assetAppliedComponent: Array.isArray(asset.roleTags) && asset.roleTags.includes("applied-component"),
        assetMotifReady
      };
      if (isBetterComponentGroupCandidate(candidate, best)) best = candidate;
    }
  }
  const fallback = syntheticRemoteComponentMatch(image, family, effectiveMinScore, {
    countCycleLoopItems: cycleLoopItemCount
  });
  if (fallback && isBetterComponentGroupCandidate(fallback, best)) return fallback;
  return best;
}

function generationReadyComponentAssets(image = {}, family = "") {
  const assets = Array.isArray(image?.source?.componentLocalAssets) ? image.source.componentLocalAssets : [];
  if (assets.length === 0) return [];
  const layer = generationLayerForComponentAsset(image, family);
  return assets.map((asset) => refreshStaleGenerationComponentAsset(asset, layer));
}

function shouldAllowAppliedPluginTemplateReplayCandidate(image = {}) {
  const source = image?.source || {};
  const readiness = source.componentAssetReadiness || {};
  if (safeText(readiness.status).toLowerCase() !== "applied-plugin-motif-ready") return false;
  const layer = source.layer || {};
  const strategy = source.componentRenderStrategy || {};
  const layerType = safeText(layer.layerType).toLowerCase();
  if (!/diagram-zone|table-zone/.test(layerType)) return false;
  const signal = [
    source.expressionForm,
    source.expressionSubtype,
    source.detector,
    layerType,
    layer.expressionForm,
    layer.expressionSubtype
  ].map((value) => safeText(value).toLowerCase()).join(" ");
  if (/screenshot|screen|document|prototype|ui-screenshot|photo|icon|illustration|插画|图标|截图/.test(signal)) return false;
  const action = [
    source.recommendedAction,
    layer.recommendedAction,
    strategy.applicationPlan?.currentStep
  ].map((value) => safeText(value).toLowerCase()).join(" ");
  const replayPlan = [
    readiness.nextStep,
    strategy.applicationPlan?.targetStep
  ].map((value) => safeText(value).toLowerCase()).join(" ");
  const hasNativeAction = /rebuild-native|split-native|attempt-native-reconstruction|record-component-replacement/.test(action);
  const hasAppliedTemplateReplayPlan = /reuse-openxml-groups-from-applied-plugin-template/.test(replayPlan);
  if (!hasNativeAction && !hasAppliedTemplateReplayPlan) return false;
  const assets = Array.isArray(source.componentLocalAssets) ? source.componentLocalAssets : [];
  return assets.some((asset) => {
    if (!Array.isArray(asset?.roleTags) || !asset.roleTags.includes("applied-component")) return false;
    const groups = Array.isArray(asset?.recommendedComponentGroups) ? asset.recommendedComponentGroups : [];
    return groups.some((group) => {
      if (Number(group?.pictureCount || 0) > 0) return false;
      const childCount = clampNumber(group?.childCount ?? group?.shapeCount, 0, 999, 0);
      const children = Array.isArray(group?.childLayout?.children) ? group.childLayout.children : [];
      const reusableChildren = children.filter((child) => /shape|connector/.test(safeText(child?.kind).toLowerCase())).length;
      return Math.max(childCount, reusableChildren) >= 4;
    });
  });
}

function refreshStaleGenerationComponentAsset(asset = {}, layer = {}) {
  if (!isGenerationComponentAssetStale(asset)) return asset;
  const file = safeLocalAssetPath(asset.path);
  if (!file || !fs.existsSync(file)) return asset;
  const ext = path.extname(file).toLowerCase();
  if (ext !== ".pptx" && ext !== ".potx" && ext !== ".ppt") return asset;
  const key = [
    "component-template-generation-refresh-v1",
    file,
    safeText(asset.modifiedAt),
    safeText(asset.sizeBytes)
  ].join("|");
  let learningSummary = generationLearningCache.get(key);
  if (!learningSummary) {
    learningSummary = summarizeLocalComponentAsset(asset);
    generationLearningCache.set(key, learningSummary);
  }
  if (!learningSummary || learningSummary.status !== "ok") return asset;
  const refreshed = {
    ...asset,
    learningSummary,
    structureSignature: asset.structureSignature || summarizeGenerationStructureSignature(learningSummary)
  };
  const catalogGroups = richGenerationCatalogGroups(learningSummary);
  if (catalogGroups.length > 0) {
    const appliedComponent = Array.isArray(asset.roleTags) && asset.roleTags.includes("applied-component");
    refreshed.recommendedComponentGroups = appliedComponent
      ? catalogGroups.map((group) => ({
        ...group,
        score: Math.max(clampNumber(group.score, 0, 100, 0), 94),
        matchScore: Math.max(clampNumber(group.matchScore, 0, 100, 0), 94)
      }))
      : catalogGroups;
    return refreshed;
  }
  const evaluation = evaluateComponentGroupsForLayer({ layer, asset: refreshed, limit: 3, rejectedLimit: 6 });
  if (Array.isArray(evaluation.recommendedGroups) && evaluation.recommendedGroups.length > 0) {
    refreshed.recommendedComponentGroups = evaluation.recommendedGroups;
  }
  return refreshed;
}

function generationLayerForComponentAsset(image = {}, family = "") {
  const source = image?.source || {};
  const layer = source.layer && typeof source.layer === "object" ? source.layer : {};
  const box = image?.box || layer.box || {};
  const understanding = layer.diagramUnderstanding || {};
  return {
    ...layer,
    detector: source.detector || layer.detector || "",
    layerType: layer.layerType || "",
    templateFamily: layer.templateFamily || understanding.componentStrategy?.templateFamily || family,
    box,
    aspectRatio: Number(box.w || 0) > 0 && Number(box.h || 0) > 0 ? Number(box.w) / Number(box.h) : layer.aspectRatio,
    componentRenderStrategy: source.componentRenderStrategy || layer.componentRenderStrategy || {}
  };
}

function safeLocalAssetPath(value) {
  return String(value ?? "")
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, 1000);
}

function isGenerationComponentAssetStale(asset = {}) {
  const kind = safeText(asset.assetKind).toLowerCase();
  if (kind !== "presentation-template") return false;
  const groups = Array.isArray(asset.recommendedComponentGroups) ? asset.recommendedComponentGroups : [];
  const summary = asset.learningSummary && typeof asset.learningSummary === "object" ? asset.learningSummary : null;
  if (groups.length === 0 && summary?.status === "ok") return true;
  if (groups.length === 0) return false;
  const shapeChildren = groups.flatMap((group) => Array.isArray(group?.childLayout?.children) ? group.childLayout.children : [])
    .filter((child) => safeText(child?.kind).toLowerCase() === "shape");
  if (shapeChildren.length === 0) return false;
  return !shapeChildren.some((child) => hasReusableTemplateChildStyleDetails(child?.style));
}

function richGenerationCatalogGroups(summary = {}) {
  return (Array.isArray(summary.componentCatalog) ? summary.componentCatalog : [])
    .filter((group) => {
      const children = Array.isArray(group?.childLayout?.children) ? group.childLayout.children : [];
      return children.some((child) => safeText(child?.kind).toLowerCase() === "shape"
        && hasReusableTemplateChildStyleDetails(child?.style));
    })
    .map((group) => ({
      ...group,
      score: clampNumber(group.score ?? group.matchScore ?? group.componentScore, 0, 100, 72),
      matchScore: clampNumber(group.matchScore ?? group.score ?? group.componentScore, 0, 100, 72)
    }))
    .sort((a, b) => clampNumber(b.matchScore ?? b.score, 0, 100, 0) - clampNumber(a.matchScore ?? a.score, 0, 100, 0))
    .slice(0, 3);
}

function isAppliedPluginMotifReady(source = {}) {
  return safeText(source?.componentAssetReadiness?.status).toLowerCase() === "applied-plugin-motif-ready";
}

function isAppliedAssetMotifReady(asset = {}, group = {}, readiness = {}) {
  if (safeText(readiness?.status).toLowerCase() !== "applied-plugin-motif-ready") return false;
  if (!Array.isArray(asset.roleTags) || !asset.roleTags.includes("applied-component")) return false;
  const targets = new Set((Array.isArray(readiness.targetMotifs) ? readiness.targetMotifs : [])
    .map((motif) => safeText(motif).toLowerCase())
    .filter(Boolean));
  if (targets.size === 0) return true;
  return motifSetForAssetGroup(asset, group).some((motif) => targets.has(motif));
}

function shapesForFamily(image, match, family, slideSize) {
  const appliedLayoutReplayDeps = {
    isGenericPluginPlaceholderText,
    maxGradientStopAlpha,
    mergeTemplateStyle,
    nativeShape,
    nativeTypeForTemplateStyle,
    safeBox
  };
  const directApplied = templateDirectAppliedLayoutShapes(image, match, family, slideSize, appliedLayoutReplayDeps);
  if (directApplied.length >= 3) {
    return [
      ...directApplied,
      ...templateSupplementalAppliedLayoutShapes(image, match, family, slideSize, appliedLayoutReplayDeps)
    ];
  }
  if (isChartFamily(family)) return chartShapes(image, match, family, slideSize, {
    isReusableAppliedChildBox,
    mergeTemplateStyle,
    nativeShape,
    nativeTypeForTemplateStyle,
    safeBox,
    templateGuidedChildSource
  });
  if (isLearnedReplayFamily(family)) return learnedComponentReplayShapes(image, match, family, slideSize, {
    isReusableAppliedChildBox,
    mergeTemplateStyle,
    nativeShape,
    nativeTypeForTemplateStyle,
    safeBox,
    templateGuidedChildSource
  });
  const matrixQuadrantDeps = {
    fidelityOverlayShellStyle,
    isFidelityCropOverlay,
    median,
    nativeShape,
    safeBox,
    templateGuidedMatrixShapes,
    treeVisualNodes
  };
  if (family === "quadrant") return quadrantShapes(image, match, slideSize, matrixQuadrantDeps);
  if (family === "matrix") return matrixShapes(image, match, slideSize, matrixQuadrantDeps);
  if (family === "layered-stack") {
    return layeredStackShapes(image, match, slideSize, {
      isFidelityCropOverlay,
      isTemplateConnectorDecorationStyle,
      mergeTemplateStyle,
      nativeShape,
      nativeTypeForTemplateStyle,
      normalizeVisualNodeBox,
      processConnectorMetadata,
      safeBox,
      templateGuidedChildSource,
      visualConnectorsBetweenNodes
    });
  }
  if (family === "cycle-loop") {
    return cycleLoopShapes(image, match, slideSize, {
      appliedChildStructureRole,
      fidelityOverlayShellStyle,
      isFidelityCropOverlay,
      mergeTemplateStyle,
      nativeShape,
      nativeTypeForTemplateStyle,
      safeBox,
      treeVisualNodes,
      visualCycleNodeOrder
    });
  }
  if (family === "hub-spoke") return hubTreeTimelineShapes.hubSpokeShapes(image, match, slideSize);
  if (family === "timeline") return hubTreeTimelineShapes.timelineShapes(image, match, slideSize);
  return processChainShapes(image, match, slideSize, {
    appliedChildStructureRole,
    firstTemplateConnectorStyle,
    isFidelityCropOverlay,
    mergeTemplateStyle,
    nativeShape,
    processConnectorMetadata,
    safeBox,
    templateGuidedProcessShapes,
    treeVisualNodes,
    visualConnectorsBetweenNodes
  });
}

function templateGuidedProcessShapes(image, match, box, palette, slideSize) {
  const nodes = selectTemplateNodeBoxes(match, box, slideSize, { max: 8, excludeDecorations: true });
  if (nodes.length < 2) return [];
  const ordered = nodes.slice().sort((a, b) => a.box.x - b.box.x || a.box.y - b.box.y);
  const fidelityOverlay = isFidelityCropOverlay(image);
  const shapes = fidelityOverlay ? [] : templateGuidedGroupChromeShapes(image, match, box, ordered, "process", palette, slideSize);
  const templateConnectors = selectTemplateProcessConnectorBoxes(match, box, ordered, slideSize);
  const useTemplateConnectors = templateConnectors.length >= Math.min(ordered.length - 1, 1);
  ordered.forEach((node, index) => {
    const fallbackStyle = fidelityOverlay ? {
      fill: "none",
      stroke: palette.accents[index % palette.accents.length],
      strokeWidthPt: 1.05,
      radiusRatio: 0.18
    } : {
      fill: palette.softFills[index % palette.softFills.length],
      stroke: palette.accents[index % palette.accents.length],
      strokeWidthPt: 1.05,
      radiusRatio: 0.18,
      shadow: { color: "#1F2937", alpha: 0.12, blurPt: 4.5, distancePt: 1.2, angleDeg: 90 }
    };
    shapes.push(nativeShape(
      image,
      match,
      "process-node",
      index,
      nativeTypeForTemplateStyle(node.style, "roundRect"),
      node.box,
      mergeTemplateStyle(node.style, fallbackStyle),
      templateGuidedChildSource(node, "component-child-layout")
    ));
    if (!useTemplateConnectors && index > 0) {
      const previous = ordered[index - 1].box;
      const current = node.box;
      const startX = previous.x + previous.w;
      const endX = current.x;
      if (endX - startX >= 4) {
        const startY = previous.y + previous.h / 2;
        const endY = current.y + current.h / 2;
        shapes.push(nativeShape(image, match, "process-connector", index - 1, "line", {
          x: startX + 1,
          y: Math.min(startY, endY),
          w: Math.max(0.1, endX - startX - 2),
          h: Math.max(0.1, Math.abs(endY - startY))
        }, mergeTemplateStyle(firstTemplateConnectorStyle(match), {
          stroke: palette.neutral,
          strokeWidthPt: 1.4,
          connectorType: "straight",
          endArrow: "triangle"
        }), processConnectorMetadata(index - 1, index, previous, current)));
      }
    }
  });
  if (useTemplateConnectors) {
    const coveredConnectorPairs = new Set();
    templateConnectors.forEach((connector, index) => {
      const metadata = processConnectorNodeMetadataForChild(connector.box, ordered, index);
      if (Number.isFinite(metadata.fromNodeIndex) && Number.isFinite(metadata.toNodeIndex)) {
        coveredConnectorPairs.add(`${metadata.fromNodeIndex}:${metadata.toNodeIndex}`);
      }
      const connectorType = connector.kind === "connector" ? "line" : nativeTypeForTemplateStyle(connector.style, "line");
      const fallbackStyle = connector.kind === "connector"
        ? {
          stroke: palette.neutral,
          strokeWidthPt: 1.4,
          connectorType: "straight",
          endArrow: "triangle"
        }
        : {
          fill: safeColorOrNone(connector.style.fill) || palette.neutral,
          stroke: safeColorOrNone(connector.style.stroke) || palette.neutral,
          strokeWidthPt: 0.8
        };
      shapes.push(nativeShape(
        image,
        match,
        "process-connector",
        index,
        connectorType,
        connector.box,
        mergeTemplateStyle(connector.style, fallbackStyle),
        {
          ...metadata,
          ...templateGuidedChildSource(connector, "component-child-layout")
        }
      ));
    });
    shapes.push(...missingTemplateGuidedProcessConnectors(image, match, ordered, coveredConnectorPairs, palette));
  }
  shapes.push(...templateGuidedDecorationShapes(image, match, box, ordered, "process", palette, slideSize));
  return shapes;
}

function missingTemplateGuidedProcessConnectors(image = {}, match = {}, ordered = [], coveredPairs = new Set(), palette = {}) {
  const shapes = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const fromIndex = index - 1;
    const toIndex = index;
    if (coveredPairs.has(`${fromIndex}:${toIndex}`)) continue;
    const previous = ordered[fromIndex]?.box || {};
    const current = ordered[toIndex]?.box || {};
    const startX = Number(previous.x || 0) + Number(previous.w || 0);
    const endX = Number(current.x || 0);
    if (endX - startX < 4) continue;
    const startY = Number(previous.y || 0) + Number(previous.h || 0) / 2;
    const endY = Number(current.y || 0) + Number(current.h || 0) / 2;
    shapes.push(nativeShape(image, match, "process-connector", shapes.length, "line", {
      x: startX + 1,
      y: Math.min(startY, endY),
      w: Math.max(0.1, endX - startX - 2),
      h: Math.max(0.1, Math.abs(endY - startY))
    }, mergeTemplateStyle(firstTemplateConnectorStyle(match), {
      stroke: palette.neutral || "#7C8CA0",
      strokeWidthPt: 1.4,
      connectorType: "straight",
      endArrow: "triangle"
    }), {
      ...processConnectorMetadata(fromIndex, toIndex, previous, current),
      connectorSource: "plugin-child-layout-auto-gap-fill"
    }));
  }
  return shapes;
}

function selectTemplateProcessConnectorBoxes(match = {}, targetBox = {}, nodes = [], slideSize = DEFAULT_SLIDE) {
  const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  if (children.length === 0 || !Array.isArray(nodes) || nodes.length < 2) return [];
  return children
    .map((child, index) => ({
      index,
      kind: String(child?.kind || ""),
      relativeBox: child?.box,
      box: scaleRelativeBox(child?.box, targetBox, slideSize),
      style: child?.style || {},
      structureRole: appliedChildStructureRole({
        kind: child?.kind,
        relativeBox: child?.box,
        style: child?.style || {}
      })
    }))
    .filter((child) => child.box && child.box.w > 0 && child.box.h > 0)
    .filter((child) => {
      if (child.kind === "connector") return true;
      const shapeType = safeText(child.style?.shapeType).toLowerCase();
      return child.kind === "shape"
        && child.structureRole === "decoration"
        && /arrow|chevron|line|arc|brace|bracket/.test(shapeType);
    })
    .filter((child) => templateConnectorFallsBetweenProcessNodes(child.box, nodes))
    .sort((a, b) => a.box.x - b.box.x || a.box.y - b.box.y || a.index - b.index)
    .slice(0, Math.max(1, nodes.length + 2));
}

function templateConnectorFallsBetweenProcessNodes(connectorBox = {}, nodes = []) {
  if (!connectorBox || !Array.isArray(nodes) || nodes.length < 2) return false;
  const center = boxCenter(connectorBox);
  const nodeCenters = nodes.map((node, index) => ({ index, center: boxCenter(node.box), box: node.box }));
  const left = nodeCenters.filter((node) => node.center.x <= center.x).sort((a, b) => b.center.x - a.center.x)[0];
  const right = nodeCenters.filter((node) => node.center.x >= center.x).sort((a, b) => a.center.x - b.center.x)[0];
  if (!left || !right || left.index === right.index) return false;
  const verticalBandTop = Math.min(left.box.y, right.box.y) - Math.max(left.box.h, right.box.h) * 0.65;
  const verticalBandBottom = Math.max(left.box.y + left.box.h, right.box.y + right.box.h) + Math.max(left.box.h, right.box.h) * 0.65;
  return center.y >= verticalBandTop && center.y <= verticalBandBottom;
}

function processConnectorNodeMetadataForChild(connectorBox = {}, nodes = [], fallbackIndex = 0) {
  const center = boxCenter(connectorBox);
  const before = nodes
    .map((node, index) => ({ node, index, center: boxCenter(node.box) }))
    .filter((entry) => entry.center.x <= center.x)
    .sort((a, b) => b.center.x - a.center.x)[0];
  const after = nodes
    .map((node, index) => ({ node, index, center: boxCenter(node.box) }))
    .filter((entry) => entry.center.x >= center.x)
    .sort((a, b) => a.center.x - b.center.x)[0];
  const from = before && after && before.index !== after.index ? before : { index: fallbackIndex, node: nodes[fallbackIndex]?.box || {} };
  const to = before && after && before.index !== after.index ? after : { index: fallbackIndex + 1, node: nodes[fallbackIndex + 1]?.box || {} };
  const fromBox = from.node?.box || from.node || {};
  const toBox = to.node?.box || to.node || {};
  return {
    ...processConnectorMetadata(from.index, to.index, fromBox, toBox),
    connectorSemantic: "node-to-node",
    connectorKind: "process-chain",
    connectorSource: "plugin-child-layout"
  };
}

function templateGuidedMatrixShapes(image, match, box, palette, slideSize) {
  const cells = selectTemplateNodeBoxes(match, box, slideSize, { max: 16, excludeDecorations: true });
  if (cells.length < 4) return [];
  const ordered = cells.slice().sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const fidelityOverlay = isFidelityCropOverlay(image);
  const chromeShapes = fidelityOverlay
    ? []
    : templateGuidedGroupChromeShapes(image, match, box, ordered, "matrix", palette, slideSize);
  const cellsShapes = ordered.map((cell, index) => nativeShape(
    image,
    match,
    "matrix-cell",
    index,
    nativeTypeForTemplateStyle(cell.style, "roundRect"),
    cell.box,
    fidelityOverlay ? fidelityOverlayShellStyle(mergeTemplateStyle(cell.style, {
      fill: "none",
      stroke: palette.neutral,
      strokeWidthPt: 0.85,
      radiusRatio: 0.06
    })) : mergeTemplateStyle(cell.style, {
      fill: palette.softFills[index % palette.softFills.length],
      stroke: palette.neutral,
      strokeWidthPt: 0.85,
      radiusRatio: 0.06
    }),
    templateGuidedChildSource(cell, "component-child-layout")
  ));
  return [
    ...chromeShapes,
    ...cellsShapes,
    ...templateGuidedDecorationShapes(image, match, box, ordered, "matrix", palette, slideSize)
  ];
}

function templateGuidedChildSource(child = {}, layoutPreservation = "component-child-layout") {
  return {
    componentTemplateExactChildShape: true,
    appliedPluginChildIndex: child.index,
    appliedPluginChildKind: child.kind || "shape",
    appliedPluginStructureRole: appliedChildStructureRole(child),
    appliedPluginShapeType: safeText(child.style?.shapeType),
    layoutPreservation
  };
}

function maxGradientStopAlpha(gradient = {}) {
  const alphas = (Array.isArray(gradient?.stops) ? gradient.stops : [])
    .map((stop) => Number(stop?.alpha))
    .filter(Number.isFinite)
    .map((alpha) => clampNumber(alpha, 0, 1, 1));
  return alphas.length > 0 ? Math.max(...alphas) : null;
}

function isFidelityCropOverlay(image = {}) {
  return image?.type === "fidelity-crop"
    || image?.source?.strategy === "local-fidelity-crop"
    || image?.source?.editable === false;
}

function fidelityOverlayShellStyle(style = {}) {
  const out = { ...(style || {}) };
  out.fill = "none";
  delete out.gradient;
  delete out.shadow;
  if (!out.stroke || String(out.stroke).toLowerCase() === "none") out.stroke = "#7C8CA0";
  out.strokeWidthPt = clampNumber(out.strokeWidthPt, 0.35, 2.2, 0.85);
  return out;
}

function selectTemplateNodeBoxes(match = {}, targetBox = {}, slideSize = DEFAULT_SLIDE, options = {}) {
  const max = clampInteger(options.max, 2, 32);
  const requireInsideUnit = options.requireInsideUnit === true;
  const excludeDecorations = options.excludeDecorations === true;
  const excludeRoleDecorationsOnly = options.excludeRoleDecorationsOnly === true;
  const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  return children
    .map((child, index) => ({
      index,
      kind: String(child.kind || ""),
      relativeBox: child.box,
      box: scaleRelativeBox(child.box, targetBox, slideSize),
      style: child.style || {}
    }))
    .filter((child) => child.kind === "shape" && (!requireInsideUnit || isInsideUnitBox(child.relativeBox)))
    .filter((child) => !excludeDecorations || excludeRoleDecorationsOnly || !isLikelyTemplateDecorationBox(child.box, targetBox))
    .filter((child) => {
      if (!excludeDecorations) return true;
      if (excludeRoleDecorationsOnly) return !isTemplateConnectorDecorationStyle(child.style);
      return appliedChildStructureRole(child) !== "decoration";
    })
    .filter((child) => isUsefulTemplateNodeBox(child.box, targetBox))
    .sort((a, b) => (b.box.w * b.box.h) - (a.box.w * a.box.h) || a.index - b.index)
    .slice(0, max)
    .sort((a, b) => a.index - b.index);
}

function templateGuidedDecorationShapes(image, match, targetBox, nodes = [], family, palette, slideSize = DEFAULT_SLIDE) {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];
  const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  const decorations = [];
  const emittedByKind = {};
  for (const child of children) {
    if (String(child.kind || "") !== "shape") continue;
    const decorationBox = scaleRelativeBox(child.box, targetBox, slideSize);
    const decorationKind = templateDecorationKind(decorationBox, targetBox);
    if (!decorationKind) continue;
    const nodeIndex = nodes.findIndex((node) => decorationBelongsToNode(decorationBox, node.box, decorationKind));
    if (nodeIndex < 0) continue;
    emittedByKind[decorationKind] = Number(emittedByKind[decorationKind] || 0) + 1;
    if (emittedByKind[decorationKind] > nodes.length) continue;
    decorations.push(nativeShape(
      image,
      match,
      componentDecorationPart(family, decorationKind),
      decorations.length,
      decorationKind === "badge" ? "ellipse" : "rect",
      decorationBox,
      mergeTemplateStyle(child.style, componentDecorationStyle(decorationKind, nodeIndex, palette))
    ));
  }
  return decorations;
}

function templateGuidedGroupChromeShapes(image, match, targetBox, nodes = [], family, palette, slideSize = DEFAULT_SLIDE) {
  if (!Array.isArray(nodes) || nodes.length < 2) return [];
  const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  const chrome = [];
  for (const child of children) {
    if (String(child.kind || "") === "connector") continue;
    const chromeBox = scaleRelativeBox(child.box, targetBox, slideSize);
    const kind = templateDecorationKind(chromeBox, targetBox);
    if (kind === "group-background" && groupBackgroundCoversNodes(chromeBox, nodes)) {
      chrome.push(nativeShape(image, match, `${family}-group-background`, chrome.length, nativeTypeForTemplateStyle(child.style, "roundRect"), chromeBox, mergeTemplateStyle(child.style, {
        fill: palette.softFills[0] || "#F8FAFC",
        stroke: palette.neutral,
        strokeWidthPt: 0.75,
        radiusRatio: 0.05,
        shadow: { color: "#1F2937", alpha: 0.10, blurPt: 5, distancePt: 1.2, angleDeg: 90 }
      })));
    } else if (kind === "title-pill" && titlePillAlignsWithNodeGroup(chromeBox, nodes)) {
      chrome.push(nativeShape(image, match, `${family}-title-pill`, chrome.length, nativeTypeForTemplateStyle(child.style, "roundRect"), chromeBox, mergeTemplateStyle(child.style, {
        fill: palette.accents[0],
        stroke: "none",
        strokeWidthPt: 0,
        radiusRatio: 0.5,
        opacity: 0.96
      })));
    }
  }
  const backgrounds = chrome.filter((shape) => /group-background$/.test(shape.source.componentTemplatePart)).slice(0, 1);
  const titlePills = chrome.filter((shape) => /title-pill$/.test(shape.source.componentTemplatePart)).slice(0, 2);
  return [...backgrounds, ...titlePills];
}

function groupBackgroundCoversNodes(background = {}, nodes = []) {
  const covered = nodes.filter((node) => boxOverlapArea(background, node.box) / Math.max(1, Number(node.box?.w || 0) * Number(node.box?.h || 0)) >= 0.62);
  return covered.length >= Math.min(2, nodes.length);
}

function titlePillAlignsWithNodeGroup(pill = {}, nodes = []) {
  const union = unionBox(nodes.map((node) => node.box));
  if (!union) return false;
  const pillCenter = boxCenter(pill);
  const unionCenter = boxCenter(union);
  return Math.abs(pillCenter.x - unionCenter.x) <= Math.max(24, Number(union.w || 0) * 0.32)
    && Number(pill.y || 0) <= Number(union.y || 0) + Number(union.h || 0) * 0.22
    && Number(pill.y || 0) + Number(pill.h || 0) >= Number(union.y || 0) - Number(union.h || 0) * 0.45;
}

function componentDecorationPart(family, decorationKind) {
  if (decorationKind === "top-accent") return `${family}-accent`;
  if (decorationKind === "side-accent") return `${family}-side-accent`;
  return `${family}-badge`;
}

function componentDecorationStyle(decorationKind, nodeIndex, palette) {
  const fill = palette.accents[nodeIndex % palette.accents.length];
  if (decorationKind === "badge") {
    return {
      fill,
      stroke: "#FFFFFF",
      strokeWidthPt: 0.9,
      opacity: 0.98
    };
  }
  return {
    fill,
    stroke: "none",
    strokeWidthPt: 0,
    opacity: 0.94
  };
}

function decorationBelongsToNode(decoration = {}, node = {}, decorationKind = "top-accent") {
  if (!decoration || !node) return false;
  const decorationCenter = boxCenter(decoration);
  const nodeLeft = Number(node.x || 0);
  const nodeRight = nodeLeft + Number(node.w || 0);
  const nodeTop = Number(node.y || 0);
  const nodeBottom = nodeTop + Number(node.h || 0);
  const horizontalOverlap = Math.min(nodeRight, Number(decoration.x || 0) + Number(decoration.w || 0)) - Math.max(nodeLeft, Number(decoration.x || 0));
  const verticalOverlap = Math.min(nodeBottom, Number(decoration.y || 0) + Number(decoration.h || 0)) - Math.max(nodeTop, Number(decoration.y || 0));
  const horizontalOverlapRatio = horizontalOverlap / Math.max(1, Number(decoration.w || 0));
  const verticalOverlapRatio = verticalOverlap / Math.max(1, Number(decoration.h || 0));
  if (decorationKind === "side-accent") {
    return verticalOverlapRatio >= 0.62
      && decorationCenter.x >= nodeLeft - Number(node.w || 0) * 0.08
      && decorationCenter.x <= nodeLeft + Number(node.w || 0) * 0.24;
  }
  if (decorationKind === "badge") {
    return decorationCenter.x >= nodeLeft - Number(node.w || 0) * 0.12
      && decorationCenter.x <= nodeLeft + Number(node.w || 0) * 0.34
      && decorationCenter.y >= nodeTop - Number(node.h || 0) * 0.18
      && decorationCenter.y <= nodeTop + Number(node.h || 0) * 0.38;
  }
  return horizontalOverlapRatio >= 0.62
    && decorationCenter.y >= nodeTop - Number(node.h || 0) * 0.08
    && decorationCenter.y <= nodeBottom
    && decorationCenter.y <= nodeTop + Number(node.h || 0) * 0.32;
}

function isLikelyTemplateDecorationBox(box, targetBox) {
  return Boolean(templateDecorationKind(box, targetBox));
}

function templateDecorationKind(box, targetBox) {
  if (!box || !targetBox) return false;
  const widthRatio = Number(box.w || 0) / Math.max(1, Number(targetBox.w || 0));
  const heightRatio = Number(box.h || 0) / Math.max(1, Number(targetBox.h || 0));
  const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
  const groupBackground = widthRatio >= 0.58
    && widthRatio <= 1.04
    && heightRatio >= 0.34
    && heightRatio <= 1.04;
  if (groupBackground) return "group-background";
  const titlePill = widthRatio >= 0.14
    && widthRatio <= 0.72
    && heightRatio >= 0.045
    && heightRatio <= 0.18
    && aspect >= 2.1;
  if (titlePill) return "title-pill";
  const topAccent = widthRatio >= 0.045
    && widthRatio <= 0.7
    && heightRatio >= 0.006
    && heightRatio <= 0.075
    && aspect >= 3.2;
  if (topAccent) return "top-accent";
  const sideAccent = widthRatio >= 0.004
    && widthRatio <= 0.055
    && heightRatio >= 0.045
    && heightRatio <= 0.7
    && aspect <= 0.35;
  if (sideAccent) return "side-accent";
  const badge = widthRatio >= 0.018
    && widthRatio <= 0.12
    && heightRatio >= 0.025
    && heightRatio <= 0.16
    && aspect >= 0.65
    && aspect <= 1.45;
  return badge ? "badge" : "";
}

function processConnectorMetadata(fromNodeIndex, toNodeIndex, fromBox = {}, toBox = {}) {
  const axis = anchorAxisBetween(fromBox, toBox);
  return {
    connectorSemantic: "node-to-node",
    fromNodeIndex,
    toNodeIndex,
    fromAnchor: axis === "vertical" ? "bottom" : "right",
    toAnchor: axis === "vertical" ? "top" : "left",
    connectorAxis: axis
  };
}

function median(values = []) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}


function nativeShape(image, match, part, index, type, box, style, extraSource = {}) {
  const source = sanitizeExtraSource(extraSource);
  const enrichedStyle = enrichedConnectorStyle(image, part, type, style, source);
  const freeform = sanitizeTemplateFreeform(enrichedStyle.freeform);
  if (freeform) delete enrichedStyle.freeform;
  const nativeComponentGroupId = componentTemplateNativeGroupId(image, match);
  const nativeComponentArchetype = safeComponentToken(
    image?.source?.layer?.templateFamily
    || image?.source?.layer?.diagramUnderstanding?.archetype
    || match.templateFamily
    || "component-template"
  );
  const nativeComponentPart = safeComponentToken(part || "part");
  return {
    id: `${image.id || "component-template"}-${part}-${index}`,
    type,
    box,
    ...(freeform ? { points: freeform.points } : {}),
    style: {
      ...enrichedStyle,
      ...(freeform ? { closePath: freeform.closePath } : {}),
      ...(freeform?.segments?.length ? { freeformSegments: freeform.segments } : {})
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "plugin-component-template-native-shape",
      componentTemplateGroupApplied: true,
      componentTemplatePart: part,
      componentTemplatePartIndex: index,
      layerSourceId: image.id || null,
      nativeComponentGroupId,
      nativeComponentArchetype,
      nativeComponentPart,
      nativeComponentRole: nativeComponentPart,
      nativeComponentAtomId: `${nativeComponentGroupId}-${nativeComponentPart}-${clampInteger(index, 0, 9999)}`,
      matchedComponentGroupId: safeText(match.id),
      matchedComponentGroupScore: clampNumber(match.score, 0, 100, 0),
      matchedComponentAssetProvider: safeText(match.assetProvider),
      matchedComponentAssetName: safeText(match.assetName),
      matchedComponentAssetMotifReady: match.assetMotifReady === true,
      matchedComponentTargetMotifs: componentTemplateTargetMotifs(image, match),
      matchedComponentWholeProcessTemplate: isWholeProcessTemplateMatch(image, match),
      matchedComponentStructureFitScore: clampNumber(match.structureFitScore, -100, 100, 0),
      matchedComponentStructureFitReasons: sanitizeStructureFitReasons(match.structureFitReasons),
      matchedComponentPalette: paletteSummary(match),
      matchedComponentChildLayout: childLayoutSummary(match),
      ...source
    }
  };
}

function sanitizeStructureFitReasons(reasons = []) {
  return [...new Set((Array.isArray(reasons) ? reasons : [])
    .map((reason) => safeComponentToken(reason))
    .filter(Boolean))]
    .slice(0, 8);
}

function isGenericPluginPlaceholderText(value) {
  const text = safeText(value).replace(/\s+/g, "");
  if (!text) return true;
  return /单击此处|点击此处|添加文本|输入标题|输入内容|placeholder|clicktoadd|text here/i.test(text);
}

function componentTemplateNativeGroupId(image = {}, match = {}) {
  const layerId = safeComponentToken(image.id || "layer");
  const groupId = safeComponentToken(match.id || "matched-group");
  return `component-template-${layerId}-${groupId}`;
}

function enrichedConnectorStyle(image = {}, part = "", type = "", style = {}, source = {}) {
  const out = { ...(style || {}) };
  if (String(type).toLowerCase() !== "line") return out;
  if (source.connectorSemantic === "node-to-node") {
    out.startAnchor = connectorAnchor(image, "process-node", source.fromNodeIndex, source.fromAnchor);
    out.endAnchor = connectorAnchor(image, "process-node", source.toNodeIndex, source.toAnchor);
  } else if (source.connectorSemantic === "hub-spoke") {
    out.startAnchor = connectorAnchor(image, "hub-center", 0, source.fromAnchor);
    out.endAnchor = connectorAnchor(image, "hub-node", source.toNodeIndex, source.toAnchor);
  }
  if (part === "process-connector" || part === "hub-spoke") out.connectorType = out.connectorType || "straight";
  return out;
}

function connectorAnchor(image = {}, part = "", index = 0, side = "center") {
  const safePart = /^[a-z0-9-]+$/i.test(String(part || "")) ? String(part) : "node";
  const safeIndex = typeof index === "number" && Number.isFinite(index) ? Math.round(index) : 0;
  return {
    elementId: `${image.id || "component-template"}-${safePart}-${safeIndex}`,
    side: normalizedAnchorSide(side),
    position: 0.5
  };
}

function normalizedAnchorSide(value) {
  const side = String(value || "").toLowerCase();
  return ["left", "right", "top", "bottom", "center"].includes(side) ? side : "center";
}

function sanitizeExtraSource(source = {}) {
  const out = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) continue;
    if (key === "semanticConnector") {
      const semanticConnector = sanitizeSemanticConnector(value);
      if (semanticConnector) out.semanticConnector = semanticConnector;
      continue;
    }
    if (typeof value === "number") out[key] = clampNumber(value, -10000, 10000, 0);
    else if (typeof value === "string") out[key] = safeText(value);
    else if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

function sanitizeSemanticConnector(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fromId = safeText(value.fromId);
  const toId = safeText(value.toId);
  const direction = safeText(value.direction);
  const axis = safeText(value.axis);
  if (!fromId || !toId || !["forward", "bidirectional", "undirected"].includes(direction)) return null;
  if (!["horizontal", "vertical", "free"].includes(axis)) return null;
  return { fromId, toId, direction, axis };
}

function markImageApplied(image, match, family, shapeCount) {
  const residualSummary = componentTemplateResidualSplitSummary(image);
  image.source = {
    ...(image.source || {}),
    componentTemplateGroupApplied: true,
    componentTemplateFamilyApplied: family,
    componentTemplateGroupId: safeText(match.id),
    componentTemplateGroupScore: clampNumber(match.score, 0, 100, 0),
    componentTemplateAssetMotifReady: match.assetMotifReady === true,
    componentTemplateTargetMotifs: componentTemplateTargetMotifs(image, match),
    componentTemplateWholeProcessApplied: isWholeProcessTemplateMatch(image, match),
    componentTemplateNativeShapes: shapeCount,
    ...(residualSummary.eligible ? {
      componentTemplateResidualSplitEligible: true,
      componentTemplateResidualAtomCount: residualSummary.atomCount,
      componentTemplateResidualSplitMode: "visual-atom-residual"
    } : {}),
    componentTemplateApplicationMode: "native-shell-over-fidelity-crop",
    nativeRebuildDeferredReason: image.source?.nativeRebuildDeferredReason
      || "plugin component group matched; generated editable native shell while preserving source crop for fidelity"
  };
}

function componentTemplateResidualSplitSummary(image = {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const layerType = String(layer.layerType || "");
  if (layerType !== "diagram-zone" && layerType !== "table-zone" && layerType !== "illustration-zone") {
    return { eligible: false, atomCount: 0 };
  }
  const atoms = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
  const atomCount = atoms.filter((atom) => atom?.residualCandidate === true && atom.box).length;
  if (atomCount === 0 || atomCount > 8) return { eligible: false, atomCount };
  const nativeCount = atoms.filter((atom) => atom?.nativeCandidate === true || atom?.residualCandidate === false).length;
  return { eligible: nativeCount > 0, atomCount };
}

function safeBox(box, slideSize = DEFAULT_SLIDE) {
  if (!box || typeof box !== "object") return null;
  const out = {
    x: Number(box.x),
    y: Number(box.y),
    w: Number(box.w ?? box.width),
    h: Number(box.h ?? box.height)
  };
  if (!Number.isFinite(out.x) || !Number.isFinite(out.y) || !Number.isFinite(out.w) || !Number.isFinite(out.h)) return null;
  if (out.w <= 8 || out.h <= 8) return null;
  return clampBox(out, slideSize);
}

function childLayoutSummary(match = {}) {
  const layout = match.childLayout;
  if (!layout || typeof layout !== "object") return null;
  const children = Array.isArray(layout.children) ? layout.children : [];
  if (children.length === 0) return null;
  return {
    provider: safeText(layout.provider || "pptx-group-child-layout-v1"),
    boundsSource: safeText(layout.boundsSource),
    childBoxCount: clampInteger(layout.childBoxCount || children.length, 0, 1000),
    usableNodeBoxes: children.filter((child) => String(child.kind || "") !== "connector").length
  };
}

module.exports = {
  createComponentTemplateNativeObjects,
  createComponentTemplateNativeShapes,
  selectComponentGroupMatch,
  _private: {
    clampBox,
    componentFamily,
    effectiveComponentGroupMinScore,
    hasStructuredTimelineEvidence,
    hasStructuredProcessEvidence,
    hasStructuredCycleEvidence,
    hasStructuredRelationshipEvidence,
    hasStructuredQuadrantEvidence,
    hasStructuredMatrixEvidence,
    paletteFromMatch,
    firstTemplateConnectorStyle,
    generationReadyComponentAssets,
    isGenerationComponentAssetStale,
    refreshStaleGenerationComponentAsset,
    selectTemplateNodeBoxes,
    processChainShapes,
    cycleLoopShapes,
    matrixShapes,
    mergeTemplateStyle,
    hubSpokeShapes: hubTreeTimelineShapes.hubSpokeShapes,
    nativeTypeForTemplateStyle,
    safeComponentToken,
    scoreComponentGroupStructureFit,
    normalizeComponentStructureKind,
    targetComponentStructureKinds,
    timelineShapes: hubTreeTimelineShapes.timelineShapes
  }
};
