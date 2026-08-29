"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { readZipEntry } = require("./pptx-inventory");
const { summarizeLocalComponentAsset } = require("./component-asset-learning");
const { evaluateComponentGroupsForLayer } = require("./component-template-group-matcher");
const { classifyGraphicExpressionPolicy } = require("./graphic-expression-policy");
const { resolveConnectorComponent } = require("./connector-component-library");
const {
  firstTemplateConnectorStyle,
  mergeTemplateStyle,
  nativeTypeForTemplateStyle,
  normalizeTextVertical,
  sanitizeTemplateFreeform,
  sanitizeTemplateGradient,
  sanitizeTemplateShadow,
  sanitizeTemplateTextReflection
} = require("./component-template-style");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };
const generationLearningCache = new Map();

function createComponentTemplateNativeShapes(images = [], slideSize = DEFAULT_SLIDE, options = {}) {
  return createComponentTemplateNativeObjects(images, slideSize, options).shapes;
}

function createComponentTemplateNativeObjects(images = [], slideSize = DEFAULT_SLIDE, options = {}) {
  const shapes = [];
  const textBoxes = [];
  const extractedImages = [];
  const minScore = clampNumber(options.minScore, 0, 100, 58);
  const textBackfillState = {
    sourceTextBoxes: normalizeSourceTextBoxes(options.sourceTextBoxes),
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
    const mediaImages = componentTemplateImagesFromShapes(generated, image, match, options);
    const mediaShapeIds = new Set(mediaImages.map((item) => item.source?.replacedPictureShellId).filter(Boolean));
    shapes.push(...generated.filter((shape) => !mediaShapeIds.has(shape.id)));
    textBoxes.push(...componentTemplateTextBoxesFromShapes(generated, image, match, textBackfillState, {
      preserveGenericPluginText: options.preserveGenericPluginText === true
    }));
    textBoxes.push(...componentTemplateSourceBoundTextBoxesFromShapes(generated, image, match, textBackfillState));
    textBoxes.push(...componentTemplateSupplementalTextBoxes(image, match, slideSize, textBackfillState));
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
    || (isProtectedFidelityFirstDiagram(source) && !hasTrustedLocalTemplateGroup(source))
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

function componentReuseReadinessLevel(group = {}) {
  const level = safeText(group?.reuseReadiness?.level).toLowerCase();
  return ["high", "medium", "low", "avoid"].includes(level) ? level : "";
}

function componentReuseReadinessRank(group = {}) {
  const level = componentReuseReadinessLevel(group);
  if (level === "high") return 3;
  if (level === "medium") return 2;
  if (level === "low") return 1;
  return 0;
}

function componentReuseReadinessScore(group = {}) {
  return clampNumber(group?.reuseReadiness?.score, 0, 100, 0);
}

function shouldSkipLowReuseComponentGroup(group = {}) {
  return componentReuseReadinessLevel(group) === "avoid";
}

function isProtectedFidelityFirstDiagram(source = {}) {
  const detector = String(source.detector || "").toLowerCase();
  const action = String(source.recommendedAction || source.layer?.recommendedAction || "").toLowerCase();
  const reason = `${source.reason || ""} ${source.nonEditableReason || ""} ${source.explanation || ""}`.toLowerCase();
  return /^(?:sparse-diagram-graphic-underlay-crop|foreground-graphic-crop)$/.test(detector)
    && (/preserve-fidelity-crop|preserve-local-crop/.test(action)
      || /preserved-as-movable-crop|preserving this visual until/.test(reason));
}

function isSemanticallySplitScreenshotFlowRegion(source = {}) {
  const splitMode = String(source.residualSplitMode || "").toLowerCase();
  const reason = `${source.reason || ""} ${source.nonEditableReason || ""}`.toLowerCase();
  return splitMode === "process-with-screenshots-semantic-regions"
    || /case-study-diagram|process-with-screenshots/.test(reason);
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
  const fallback = syntheticRemoteComponentMatch(image, family, effectiveMinScore);
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
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 1000);
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

function hasReusableTemplateChildStyleDetails(style = {}) {
  if (!style || typeof style !== "object") return false;
  if (safeText(style.shapeType)) return true;
  if (style.freeform && typeof style.freeform === "object") return true;
  if (safeText(style.fill) || safeText(style.stroke)) return true;
  if (style.gradient && typeof style.gradient === "object") return true;
  if (style.picture && typeof style.picture === "object") return true;
  if (style.text && typeof style.text === "object") return true;
  return false;
}

function summarizeGenerationStructureSignature(summary = {}) {
  const catalog = Array.isArray(summary.componentCatalog) ? summary.componentCatalog : [];
  const motifs = new Set();
  const kinds = new Set();
  for (const group of catalog) {
    const structure = group?.structure || {};
    if (structure.primaryKind) kinds.add(safeText(structure.primaryKind));
    for (const motif of Array.isArray(structure.motifs) ? structure.motifs : []) motifs.add(safeText(motif));
  }
  return {
    provider: "component-generation-structure-signature-v1",
    primaryKind: [...kinds].filter(Boolean)[0] || "",
    motifs: [...motifs].filter(Boolean).slice(0, 8),
    catalogGroups: catalog.length
  };
}

function isBetterComponentGroupCandidate(candidate = {}, current = null) {
  if (!current) return true;
  const score = clampNumber(candidate.score, 0, 100, 0);
  const currentScore = clampNumber(current.score, 0, 100, 0);
  const scoreDelta = score - currentScore;
  if (Math.abs(scoreDelta) > 12) return scoreDelta > 0;
  const structureFit = clampNumber(candidate.structureFitScore, -100, 100, 0);
  const currentStructureFit = clampNumber(current.structureFitScore, -100, 100, 0);
  if (Math.abs(structureFit - currentStructureFit) >= 4) return structureFit > currentStructureFit;
  const styleRank = componentGroupStyleDetailRank(candidate);
  const currentStyleRank = componentGroupStyleDetailRank(current);
  if (styleRank !== currentStyleRank) return styleRank > currentStyleRank;
  const motifReady = candidate.assetMotifReady === true ? 1 : 0;
  const currentMotifReady = current.assetMotifReady === true ? 1 : 0;
  if (motifReady !== currentMotifReady) return motifReady > currentMotifReady;
  const applied = candidate.assetAppliedComponent === true ? 1 : 0;
  const currentApplied = current.assetAppliedComponent === true ? 1 : 0;
  if (applied !== currentApplied) return applied > currentApplied;
  const reuseRank = componentReuseReadinessRank(candidate);
  const currentReuseRank = componentReuseReadinessRank(current);
  if (reuseRank !== currentReuseRank) return reuseRank > currentReuseRank;
  const reuseScore = componentReuseReadinessScore(candidate);
  const currentReuseScore = componentReuseReadinessScore(current);
  if (reuseScore !== currentReuseScore) return reuseScore > currentReuseScore;
  if (structureFit !== currentStructureFit) return structureFit > currentStructureFit;
  if (score !== currentScore) return score > currentScore;
  const matchScore = clampNumber(candidate.assetMatchScore, 0, 1000, 0);
  const currentMatchScore = clampNumber(current.assetMatchScore, 0, 1000, 0);
  if (matchScore !== currentMatchScore) return matchScore > currentMatchScore;
  return safeText(candidate.id).localeCompare(safeText(current.id)) < 0;
}

function componentGroupStyleDetailRank(group = {}) {
  const children = Array.isArray(group?.childLayout?.children) ? group.childLayout.children : [];
  let rank = 0;
  for (const child of children) {
    if (!hasReusableTemplateChildStyleDetails(child?.style)) continue;
    rank += 1;
    if (child?.style?.gradient && typeof child.style.gradient === "object") rank += 3;
    if (child?.style?.shadow && typeof child.style.shadow === "object") rank += 2;
    if (safeText(child?.kind).toLowerCase() === "connector") rank += 1;
  }
  return Math.min(rank, 20);
}

function scoreComponentGroupStructureFit(image = {}, group = {}) {
  const target = summarizeTargetLayerStructure(image);
  if (!target || target.signalCount === 0) return { score: 0, reasons: [] };
  let score = 0;
  const reasons = [];
  const groupKind = normalizeComponentStructureKind(
    group?.structure?.kind || group?.structureSignature?.primaryKind || group?.primaryKind
  );
  const targetKinds = target.compatibleKinds;
  const hardMismatch = targetKinds.length > 0 && groupKind && !targetKinds.includes(groupKind);
  if (targetKinds.length > 0 && groupKind) {
    if (hardMismatch) {
      score -= 16;
      reasons.push(`native-group-kind-mismatch:${targetKinds.join("|")}!=${groupKind}`);
    } else {
      score += 12;
      reasons.push(`native-group-kind-compatible:${groupKind}`);
    }
  }
  score += countFitScore({
    expected: target.nodeCount,
    actual: semanticComponentGroupNodeCount(group),
    close: 8,
    compatible: 4,
    mismatch: -6,
    closeReason: "native-group-node-count-close",
    compatibleReason: "native-group-node-count-compatible",
    mismatchReason: "native-group-node-count-different",
    reasons
  });
  score += countFitScore({
    expected: target.connectorCount,
    actual: semanticComponentGroupConnectorCount(group),
    close: 9,
    compatible: 4,
    mismatch: -7,
    closeReason: "native-group-connector-count-close",
    compatibleReason: "native-group-connector-count-compatible",
    mismatchReason: "native-group-connector-count-different",
    reasons
  });
  const pictureCount = clampNumber(group.pictureCount, 0, 1000, 0);
  const shapeCount = clampNumber(group.shapeCount ?? group.childCount, 0, 1000, 0);
  if (target.prefersNativeShapes && pictureCount === 0) {
    score += 5;
    reasons.push("native-group-no-picture-close");
  } else if (target.prefersNativeShapes && pictureCount > Math.max(1, shapeCount * 0.35)) {
    score -= 8;
    reasons.push("native-group-picture-heavy");
  }
  return {
    score: Math.max(-36, Math.min(36, score)),
    reasons,
    hardMismatch,
    groupKind,
    targetKinds
  };
}

function summarizeTargetLayerStructure(image = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const nodeCount = Math.max(
    normalizeCount(layer.nodeCount),
    normalizeCount(understanding.nodeCount),
    normalizeCount(understanding.visualNodeCount),
    Array.isArray(understanding.nodes) ? understanding.nodes.length : 0,
    Array.isArray(understanding.visualNodes) ? understanding.visualNodes.length : 0
  );
  const connectorCount = Math.max(
    normalizeCount(layer.connectorCount),
    normalizeCount(understanding.connectorCount),
    normalizeCount(understanding.visualConnectorCount),
    Array.isArray(understanding.connectors) ? understanding.connectors.length : 0,
    Array.isArray(understanding.visualConnectors) ? understanding.visualConnectors.length : 0
  );
  const layerType = safeText(layer.layerType || "");
  const templateFamily = safeText(layer.templateFamily || understanding.templateFamily || "");
  const archetype = safeText(layer.archetype || understanding.archetype || "");
  const compatibleKinds = targetComponentStructureKinds({ templateFamily, layerType, archetype });
  const signalCount = [nodeCount, connectorCount, layerType, templateFamily, archetype]
    .filter((value) => typeof value === "number" ? value > 0 : !!value).length;
  return {
    nodeCount,
    connectorCount,
    signalCount,
    compatibleKinds,
    prefersNativeShapes: /diagram|chart|matrix|grid|table/.test(layerType)
      || /flow|hub|tree|swimlane|matrix|chart|cycle/.test(archetype)
  };
}

function countFitScore({
  expected,
  actual,
  close,
  compatible,
  mismatch,
  closeReason,
  compatibleReason,
  mismatchReason,
  reasons
}) {
  if (!Number.isFinite(expected) || expected <= 0 || !Number.isFinite(actual) || actual <= 0) return 0;
  const ratio = Math.max(expected, actual) / Math.max(1, Math.min(expected, actual));
  if (ratio <= 1.35) {
    reasons.push(closeReason);
    return close;
  }
  if (ratio <= 2.25) {
    reasons.push(compatibleReason);
    return compatible;
  }
  reasons.push(mismatchReason);
  return mismatch;
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

function componentTemplateTargetMotifs(image = {}, match = {}) {
  if (match.assetMotifReady !== true && !hasCandidateMotifEvidence(image, match) && !hasLayerMotifEvidence(image, match)) return [];
  const readiness = image?.source?.componentAssetReadiness || {};
  const strategy = image?.source?.componentRenderStrategy || {};
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const candidate = strategy.bestCandidate || {};
  const explicit = [
    ...(Array.isArray(readiness.targetMotifs) ? readiness.targetMotifs : []),
    ...(Array.isArray(understanding.targetMotifs) ? understanding.targetMotifs : []),
    ...(Array.isArray(understanding.componentStrategy?.targetMotifs) ? understanding.componentStrategy.targetMotifs : []),
    ...(Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : []),
    ...(Array.isArray(match.targetMotifs) ? match.targetMotifs : []),
    ...(Array.isArray(match.structureSignature?.motifs) ? match.structureSignature.motifs : []),
    ...(Array.isArray(candidate.targetMotifs) ? candidate.targetMotifs : []),
    ...(Array.isArray(candidate.structureSignature?.motifs) ? candidate.structureSignature.motifs : []),
    ...fallbackTargetMotifsForComponent(image, match)
  ];
  return explicit
    .map((motif) => safeText(motif).toLowerCase())
    .filter((motif) => /^(cycle-loop|arc-arrow|ring-node|card-grid|dashboard-card-grid|comparison-matrix|heatmap-matrix|treemap-chart|sankey-flow-chart|map-chart|word-cloud-chart|waterfall-chart|gauge-chart|radar-chart|tree-link|org-hierarchy|fishbone-cause|radial-link|screenshot-card-grid|screenshot-crop|visual-example-card-grid|visual-example-crop|feature-icon-card-grid|icon-crop|numbered-step-card-grid|step-badge|screenshot-zoom-callout|zoom-lens-overlay|screenshot-annotation|callout-overlay|highlight-box|concentric-circles|linear-arrow-chain|whole-process-template|lens-funnel-flow|branch-card-flow|layered-stack|funnel-stack|pyramid-stack|venn-overlap|intersection-overlap|milestone-roadmap|gantt-roadmap|quadrant-axis|pie-share-chart|bubble-scatter-chart|donut-segment-chart|topology-triangle)$/.test(motif))
    .filter((motif, index, values) => values.indexOf(motif) === index)
    .slice(0, 8);
}

function hasCandidateMotifEvidence(image = {}, match = {}) {
  const strategy = image?.source?.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  return [
    ...(Array.isArray(match.targetMotifs) ? match.targetMotifs : []),
    ...(Array.isArray(match.structureSignature?.motifs) ? match.structureSignature.motifs : []),
    ...(Array.isArray(candidate.targetMotifs) ? candidate.targetMotifs : []),
    ...(Array.isArray(candidate.structureSignature?.motifs) ? candidate.structureSignature.motifs : [])
  ].some((motif) => /^(cycle-loop|arc-arrow|ring-node|card-grid|dashboard-card-grid|comparison-matrix|heatmap-matrix|treemap-chart|sankey-flow-chart|map-chart|word-cloud-chart|waterfall-chart|gauge-chart|radar-chart|tree-link|org-hierarchy|fishbone-cause|radial-link|screenshot-card-grid|screenshot-crop|visual-example-card-grid|visual-example-crop|feature-icon-card-grid|icon-crop|numbered-step-card-grid|step-badge|screenshot-zoom-callout|zoom-lens-overlay|screenshot-annotation|callout-overlay|highlight-box|concentric-circles|linear-arrow-chain|whole-process-template|lens-funnel-flow|branch-card-flow|layered-stack|funnel-stack|pyramid-stack|venn-overlap|intersection-overlap|milestone-roadmap|gantt-roadmap|quadrant-axis|pie-share-chart|bubble-scatter-chart|donut-segment-chart|topology-triangle)$/.test(safeText(motif).toLowerCase()));
}

function hasLayerMotifEvidence(image = {}, match = {}) {
  const strategy = image?.source?.componentRenderStrategy || {};
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const values = [
    ...(Array.isArray(understanding.targetMotifs) ? understanding.targetMotifs : []),
    ...(Array.isArray(understanding.componentStrategy?.targetMotifs) ? understanding.componentStrategy.targetMotifs : []),
    ...(Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : []),
    ...fallbackTargetMotifsForComponent(image, match)
  ];
  return values.some((motif) => /^(cycle-loop|arc-arrow|ring-node|card-grid|dashboard-card-grid|comparison-matrix|heatmap-matrix|treemap-chart|sankey-flow-chart|map-chart|word-cloud-chart|waterfall-chart|gauge-chart|radar-chart|tree-link|org-hierarchy|fishbone-cause|radial-link|screenshot-card-grid|screenshot-crop|visual-example-card-grid|visual-example-crop|feature-icon-card-grid|icon-crop|numbered-step-card-grid|step-badge|screenshot-zoom-callout|zoom-lens-overlay|screenshot-annotation|callout-overlay|highlight-box|concentric-circles|linear-arrow-chain|whole-process-template|lens-funnel-flow|branch-card-flow|layered-stack|funnel-stack|pyramid-stack|venn-overlap|intersection-overlap|milestone-roadmap|gantt-roadmap|quadrant-axis|pie-share-chart|bubble-scatter-chart|donut-segment-chart|topology-triangle)$/.test(safeText(motif).toLowerCase()));
}

function fallbackTargetMotifsForComponent(image = {}, match = {}) {
  const family = componentFamily(image, match);
  if (family === "matrix" || family === "quadrant") return family === "quadrant" ? ["card-grid", "quadrant-axis"] : ["card-grid"];
  if (family === "process-chain") return ["linear-arrow-chain"];
  if (family === "timeline") return ["milestone-roadmap"];
  if (family === "cycle-loop") return ["arc-arrow"];
  if (family === "treemap-chart") return ["treemap-chart"];
  if (family === "scatter-chart") return ["bubble-scatter-chart"];
  if (family === "donut-chart") return ["donut-segment-chart"];
  if (family === "pie-chart") return ["pie-share-chart"];
  if (family === "hub-spoke") return hasTreeLikeComponentEvidence(image, match) ? ["tree-link"] : ["radial-link"];
  if (family === "layered-stack") return [layeredStackDefaultMotif(image)];
  return [];
}

function hasTreeLikeComponentEvidence(image = {}, match = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const strategy = image?.source?.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  const text = [
    layer.templateFamily,
    understanding.archetype,
    understanding.structureSignature?.primaryKind,
    understanding.structureSignature?.layout,
    understanding.componentStrategy?.templateFamily,
    match.templateFamily,
    match.structureSignature?.primaryKind,
    candidate.structureSignature?.primaryKind,
    candidate.title
  ].map((value) => safeText(value).toLowerCase()).join(" ");
  return /tree|org|hierarchy|组织|树/.test(text);
}

function isWholeProcessTemplateMatch(image = {}, match = {}) {
  return componentTemplateTargetMotifs(image, match).includes("whole-process-template");
}

function motifSetForAssetGroup(asset = {}, group = {}) {
  const motifs = new Set();
  collectMotifs(group?.structure, motifs);
  for (const item of Array.isArray(asset.recommendedComponentGroups) ? asset.recommendedComponentGroups : []) {
    collectMotifs(item?.structure, motifs);
  }
  for (const item of Array.isArray(asset.learningSummary?.componentCatalog) ? asset.learningSummary.componentCatalog : []) {
    collectMotifs(item?.structure, motifs);
  }
  return [...motifs];
}

function collectMotifs(structure = {}, motifs) {
  if (!structure || typeof structure !== "object" || !motifs) return;
  for (const motif of Array.isArray(structure.motifs) ? structure.motifs : []) {
    const safe = safeText(motif).toLowerCase();
    if (safe) motifs.add(safe);
  }
  for (const motif of Object.keys(structure.motifCounts || {})) {
    const safe = safeText(motif).toLowerCase();
    if (safe) motifs.add(safe);
  }
}

function syntheticRemoteComponentMatch(image = {}, family = "", minScore = 58) {
  const strategy = image?.source?.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  const provider = safeText(candidate.sourceProvider || strategy.applicationPlan?.sourceProvider).toLowerCase();
  const kind = safeText(candidate.kind || strategy.applicationPlan?.componentKind).toLowerCase();
  if (strategy.mode !== "plugin-component-template") return null;
  if (!isSyntheticRemoteTemplateCandidate(provider, kind, candidate)) return null;
  const score = clampNumber(candidate.candidateScore ?? (Number(candidate.confidence) * 100), 0, 100, 0);
  const minFamilyScore = syntheticRemoteFamilyMinScore(family, minScore);
  if (score < minFamilyScore) return null;
  if (!hasSyntheticRemoteFamilyEvidence(image, family)) return null;
  const motifs = [
    ...(Array.isArray(candidate.targetMotifs) ? candidate.targetMotifs : []),
    ...(Array.isArray(candidate.structureSignature?.motifs) ? candidate.structureSignature.motifs : [])
  ].map((motif) => safeText(motif).toLowerCase()).filter(Boolean);
  if (family === "matrix" && !hasActionableRemoteMatrixEvidence(candidate, motifs)) return null;
  if (family === "quadrant" && motifs.length === 0) motifs.push("quadrant");
  if (family === "layered-stack" && motifs.length === 0) motifs.push(layeredStackDefaultMotif(image));
  const itemCount = syntheticRemoteItemCount(image, family, {
    itemCount: null,
    childCount: null,
    id: candidate.id,
    name: candidate.title
  });
  return {
    id: safeText(candidate.id || `remote-${provider}-${family}`),
    name: safeText(candidate.title || `${provider} ${family} candidate`),
    score,
    itemCount,
    childCount: itemCount,
    shapeCount: syntheticRemoteShapeCount(family, itemCount),
    connectorCount: syntheticRemoteConnectorCount(family, itemCount),
    pictureCount: 0,
    assetProvider: provider,
    assetName: `remote-${provider}-candidate`,
    assetPath: "",
    templateFamily: family,
    targetMotifs: motifs,
    structureSignature: {
      primaryKind: safeText(candidate.structureSignature?.primaryKind || syntheticRemotePrimaryKind(family)),
      motifs
    },
    assetMotifReady: syntheticRemoteMotifReady(family, motifs),
    remoteCandidateOnly: true
  };
}

function hasActionableRemoteMatrixEvidence(candidate = {}, motifs = []) {
  if (safeText(candidate.suitability?.tier).toLowerCase() === "strong") return true;
  if (safeText(candidate.structureSignature?.primaryKind)) return true;
  return (Array.isArray(motifs) ? motifs : [])
    .some((motif) => /^(card-grid|matrix|grid|table|2x2-matrix|quadrant)$/.test(safeText(motif).toLowerCase()));
}

function syntheticRemoteFamilyMinScore(family = "", minScore = 58) {
  if (family === "cycle-loop") return Math.max(48, minScore);
  if (family === "hub-spoke") return Math.max(48, Math.min(minScore, 54));
  if (family === "process-chain") return Math.max(50, Math.min(minScore, 54));
  if (family === "quadrant") return Math.max(48, Math.min(minScore, 54));
  if (family === "matrix") return Math.max(50, Math.min(minScore, 54));
  if (family === "layered-stack") return Math.max(48, Math.min(minScore, 54));
  return Math.max(52, minScore);
}

function hasSyntheticRemoteFamilyEvidence(image = {}, family = "") {
  if (family === "cycle-loop") return hasStructuredCycleEvidence(image);
  if (family === "hub-spoke") return hasStructuredRelationshipEvidence(image);
  if (family === "process-chain") return hasStructuredProcessEvidence(image);
  if (family === "quadrant") return hasStructuredQuadrantEvidence(image);
  if (family === "matrix") return hasStructuredMatrixEvidence(image);
  if (family === "layered-stack") return hasStructuredLayeredStackEvidence(image);
  return false;
}

function syntheticRemoteItemCount(image = {}, family = "", fallback = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  if (family === "cycle-loop") return cycleLoopItemCount(image, fallback);
  if (family === "process-chain") {
    return clampInteger(understanding.nodeCount || fallback.childCount || fallback.itemCount || 4, 3, 6);
  }
  if (family === "hub-spoke") {
    return clampInteger(understanding.connectorCount || understanding.nodeCount || fallback.childCount || fallback.itemCount || 6, 4, 8);
  }
  if (family === "quadrant") return 4;
  if (family === "matrix") {
    const grid = understanding.visualGrid || {};
    const cellCount = clampNumber(grid.cellCount, 0, 64, 0);
    return clampInteger(cellCount || understanding.nodeCount || understanding.visualAtomCount || fallback.childCount || 9, 4, 16);
  }
  if (family === "layered-stack") {
    return clampInteger(understanding.visualNodeCount || understanding.nodeCount || fallback.childCount || fallback.itemCount || 4, 3, 8);
  }
  return clampInteger(fallback.childCount || fallback.itemCount || 4, 3, 8);
}

function syntheticRemoteShapeCount(family = "", itemCount = 4) {
  if (family === "cycle-loop") return itemCount * 2 + 1;
  if (family === "hub-spoke") return itemCount * 2 + 1;
  if (family === "process-chain") return itemCount * 2 - 1;
  if (family === "quadrant") return 6;
  if (family === "matrix") return itemCount;
  if (family === "layered-stack") return itemCount;
  return itemCount;
}

function syntheticRemoteConnectorCount(family = "", itemCount = 4) {
  if (family === "cycle-loop") return itemCount;
  if (family === "hub-spoke") return itemCount;
  if (family === "process-chain") return Math.max(0, itemCount - 1);
  return 0;
}

function syntheticRemotePrimaryKind(family = "") {
  if (family === "matrix") return "matrix";
  if (family === "hub-spoke") return "hub-spoke";
  if (family === "process-chain") return "process-chain";
  if (family === "quadrant") return "quadrant";
  if (family === "cycle-loop") return "cycle-loop";
  if (family === "layered-stack") return "layered-stack";
  return safeText(family);
}

function syntheticRemoteMotifReady(family = "", motifs = []) {
  if (family === "cycle-loop") return motifs.includes("arc-arrow") || motifs.includes("ring-node");
  if (family === "hub-spoke") return motifs.includes("radial-link") || motifs.includes("tree-link") || motifs.includes("org-hierarchy") || motifs.includes("ring-node");
  if (family === "process-chain") return motifs.includes("linear-arrow-chain") || motifs.includes("whole-process-template") || motifs.includes("lens-funnel-flow") || motifs.includes("branch-card-flow");
  if (family === "quadrant") return motifs.includes("quadrant") || motifs.includes("2x2-matrix");
  if (family === "matrix") return motifs.includes("card-grid");
  if (family === "layered-stack") return motifs.includes("layered-stack") || motifs.includes("funnel") || motifs.includes("pyramid");
  return motifs.length > 0;
}

function isSyntheticRemoteTemplateCandidate(provider = "", kind = "", candidate = {}) {
  if (provider === "officeplus" && kind === "component") return true;
  const tags = Array.isArray(candidate.roleTags) ? candidate.roleTags.map((tag) => safeText(tag).toLowerCase()) : [];
  const primaryKind = safeText(candidate.structureSignature?.primaryKind).toLowerCase();
  return provider === "islide"
    && /presentation-template|component|vector-component|smartdiagram|diagram/.test(kind)
    && (tags.includes("applied-component") || tags.includes("editable") || /cycle-loop|process-chain|matrix|quadrant|hub-spoke|layered-stack|funnel|pyramid/.test(primaryKind));
}

function hasStructuredMatrixEvidence(image = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const atomCounts = understanding.visualAtomKindCounts || {};
  const gridAtoms = clampNumber(atomCounts["grid-line-candidate"], 0, 999, 0);
  const visualGrid = understanding.visualGrid || {};
  const visualGridLineCount = clampNumber(visualGrid.lineCount, 0, 999, 0);
  const layerText = `${layer.layerType || ""} ${understanding.archetype || ""} ${understanding.componentStrategy?.templateFamily || ""}`.toLowerCase();
  return gridAtoms >= 4 || visualGridLineCount >= 4 || /table|matrix|grid/.test(layerText);
}

function hasStructuredQuadrantEvidence(image = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const strategy = image?.source?.componentRenderStrategy || {};
  const bestCandidate = strategy.bestCandidate || {};
  const text = [
    layer.layerType,
    layer.templateFamily,
    understanding.archetype,
    understanding.structureSignature?.primaryKind,
    understanding.structureSignature?.layout,
    understanding.componentStrategy?.templateFamily,
    bestCandidate.structureSignature?.primaryKind,
    bestCandidate.structureSignature?.layout,
    bestCandidate.title,
    bestCandidate.description,
    ...(Array.isArray(bestCandidate.targetMotifs) ? bestCandidate.targetMotifs : [])
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  const nodeCount = clampNumber(understanding.visualNodeCount || understanding.nodeCount, 0, 999, 0);
  const atoms = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
  const horizontal = atoms.filter((atom) => atom?.axis === "h" || atom?.shapeHint === "grid-line-horizontal").length;
  const vertical = atoms.filter((atom) => atom?.axis === "v" || atom?.shapeHint === "grid-line-vertical").length;
  const layerType = String(layer.layerType || "").toLowerCase();
  const archetype = String(understanding.archetype || "").toLowerCase();
  const explicitQuadrant = /quadrant|2x2|four-quadrant|axis-grid|象限|四象限|二维/.test(text);
  if (/table|matrix|grid/.test(layerType) || /matrix-or-grid|table|grid/.test(archetype)) {
    return !/screenshot|document/.test(layerType)
      && nodeCount >= 4
      && explicitQuadrant;
  }
  return /diagram|table|illustration/.test(layerType)
    && !/screenshot|document/.test(layerType)
    && nodeCount >= 4
    && (explicitQuadrant || (horizontal >= 1 && vertical >= 1 && nodeCount >= 4));
}

function hasStructuredRelationshipEvidence(image = {}) {
  if (hasStructuredMatrixEvidence(image)) return false;
  if (hasStructuredCycleEvidence(image)) return true;
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const layerType = String(layer.layerType || "").toLowerCase();
  const archetype = String(understanding.archetype || "").toLowerCase();
  const nodeCount = clampNumber(understanding.nodeCount, 0, 999, 0);
  const connectorCount = clampNumber(understanding.connectorCount, 0, 999, 0);
  return /diagram|illustration/.test(layerType)
    && !/screenshot|document/.test(layerType)
    && nodeCount >= 3
    && (connectorCount >= 1 || clampNumber(understanding.visualAtomCount, 0, 999, 0) >= 3)
    && /generic-node|hub|spoke|cycle|radial|topology/.test(archetype);
}

function hasStructuredCycleEvidence(image = {}) {
  if (hasStructuredMatrixEvidence(image)) return false;
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const strategy = image?.source?.componentRenderStrategy || {};
  const bestCandidate = strategy.bestCandidate || {};
  const text = [
    layer.layerType,
    layer.templateFamily,
    understanding.archetype,
    understanding.componentStrategy?.templateFamily,
    bestCandidate.title,
    bestCandidate.description,
    bestCandidate.reuseHint
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  const nodeCount = clampNumber(understanding.nodeCount, 0, 999, 0);
  const connectorCount = clampNumber(understanding.connectorCount, 0, 999, 0);
  const visualAtomCount = clampNumber(understanding.visualAtomCount, 0, 999, 0);
  return /diagram|illustration/.test(String(layer.layerType || "").toLowerCase())
    && !/screenshot|document/.test(String(layer.layerType || "").toLowerCase())
    && /cycle-loop|闭环|循环|环形|双环|cycle|loop|radial/.test(text)
    && (nodeCount >= 2 || connectorCount >= 1 || visualAtomCount >= 3);
}

function hasStructuredLayeredStackEvidence(image = {}) {
  if (hasStructuredMatrixEvidence(image)) return false;
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const strategy = image?.source?.componentRenderStrategy || {};
  const bestCandidate = strategy.bestCandidate || {};
  const targetMotifs = [
    ...(Array.isArray(understanding.componentStrategy?.targetMotifs) ? understanding.componentStrategy.targetMotifs : []),
    ...(Array.isArray(bestCandidate.targetMotifs) ? bestCandidate.targetMotifs : [])
  ].join(" ").toLowerCase();
  const text = [
    layer.layerType,
    layer.templateFamily,
    understanding.archetype,
    understanding.structureSignature?.primaryKind,
    understanding.structureSignature?.layout,
    understanding.componentStrategy?.templateFamily,
    bestCandidate.structureSignature?.primaryKind,
    bestCandidate.structureSignature?.layout,
    bestCandidate.title,
    bestCandidate.description,
    targetMotifs
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  const visualNodeCount = clampNumber(understanding.visualNodeCount || understanding.nodeCount, 0, 999, 0);
  return /diagram|illustration|table/.test(String(layer.layerType || "").toLowerCase())
    && !/screenshot|document/.test(String(layer.layerType || "").toLowerCase())
    && visualNodeCount >= 3
    && /funnel|pyramid|layered|layer-stack|stacked-layer|stacked|层级|分层|金字塔|漏斗|架构层/.test(text);
}

function effectiveComponentGroupMinScore(image, family, baseMinScore) {
  if (family === "quadrant" && hasStructuredQuadrantEvidence(image)) return Math.min(baseMinScore, 48);
  if (family === "matrix" && hasStructuredMatrixEvidence(image)) return Math.min(baseMinScore, 50);
  if (family === "layered-stack" && hasStructuredLayeredStackEvidence(image)) return Math.min(baseMinScore, 48);
  if (family === "cycle-loop" && hasStructuredCycleEvidence(image)) return Math.min(baseMinScore, 48);
  if (family === "hub-spoke" && hasStructuredRelationshipEvidence(image)) return Math.min(baseMinScore, 48);
  if (family === "process-chain" && hasStructuredProcessEvidence(image)) return Math.min(baseMinScore, 52);
  if (family === "timeline" && hasStructuredTimelineEvidence(image)) return Math.min(baseMinScore, 50);
  return baseMinScore;
}

function hasStructuredTimelineEvidence(image = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const layerText = `${layer.layerType || ""} ${layer.templateFamily || ""} ${understanding.archetype || ""} ${understanding.componentStrategy?.templateFamily || ""}`.toLowerCase();
  return /timeline|milestone|时间轴|里程碑/.test(layerText);
}

function hasStructuredProcessEvidence(image = {}) {
  if (hasStructuredSwimlaneProcessEvidence(image)) return true;
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const layerType = String(layer.layerType || "").toLowerCase();
  const archetype = String(understanding.archetype || "").toLowerCase();
  const family = String(understanding.componentStrategy?.templateFamily || "").toLowerCase();
  const nodeCount = clampNumber(understanding.nodeCount, 0, 999, 0);
  const connectorCount = clampNumber(understanding.connectorCount, 0, 999, 0);
  return /diagram/.test(layerType)
    && !/screenshot|document/.test(layerType)
    && nodeCount >= 4
    && connectorCount >= 3
    && (/process|flow|chain|workflow/.test(archetype) || /process|flow|chain/.test(family));
}

function hasStructuredSwimlaneProcessEvidence(image = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const strategy = understanding.componentStrategy || {};
  const signature = understanding.structureSignature || strategy.structureSignature || {};
  const motifs = [
    ...(Array.isArray(understanding.targetMotifs) ? understanding.targetMotifs : []),
    ...(Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : []),
    ...(Array.isArray(image?.source?.componentRenderStrategy?.targetMotifs) ? image.source.componentRenderStrategy.targetMotifs : [])
  ].map((motif) => safeText(motif).toLowerCase());
  const text = [
    layer.layerType,
    layer.templateFamily,
    understanding.archetype,
    strategy.templateFamily,
    signature.layout,
    signature.direction,
    image?.source?.componentRenderStrategy?.bestCandidate?.title
  ].map((value) => safeText(value).toLowerCase()).join(" ");
  const nodeCount = clampNumber(understanding.nodeCount || signature.stepCount, 0, 999, 0);
  const hasProcessMotif = motifs.some((motif) => /linear-arrow-chain|whole-process-template|branch-card-flow/.test(motif));
  const hasSwimlaneLayout = /swimlane|泳道/.test(text);
  return nodeCount >= 4
    && hasProcessMotif
    && (hasSwimlaneLayout || /process-chain|flow|流程/.test(text));
}

function componentFamily(image = {}, match = {}) {
  const strategy = image?.source?.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  const candidateKind = safeText(candidate.structureSignature?.primaryKind || match.structureSignature?.primaryKind).toLowerCase();
  const chartFamily = chartFamilyFromEvidence(image, match);
  if (chartFamily) return chartFamily;
  if (/quadrant|2x2|four-quadrant/.test(candidateKind)) return "quadrant";
  if (hasStructuredSwimlaneProcessEvidence(image)) return "process-chain";
  if (/matrix|grid|table/.test(candidateKind)) return "matrix";
  if (/funnel|pyramid|layered|layer-stack|stacked-layer|stacked/.test(candidateKind)) return "layered-stack";
  if (/hub-spoke|tree|radial|topology/.test(candidateKind)) return "hub-spoke";
  if (/cycle-loop/.test(candidateKind)) return "cycle-loop";
  if (/process-chain|timeline/.test(candidateKind)) return candidateKind === "timeline" ? "timeline" : "process-chain";
  if (hasStructuredQuadrantEvidence(image)) return "quadrant";
  if (hasStructuredSwimlaneProcessEvidence(image)) return "process-chain";
  if (hasStructuredMatrixEvidence(image)) return "matrix";
  if (hasStructuredLayeredStackEvidence(image)) return "layered-stack";
  if (hasStructuredCycleEvidence(image)) return "cycle-loop";
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const direct = String(layer.templateFamily || understanding.archetype || match.templateFamily || "").toLowerCase();
  if (/quadrant|2x2|four-quadrant|象限|四象限|二维/.test(direct)) return "quadrant";
  if (/matrix|grid|table/.test(direct)) return "matrix";
  if (/funnel|pyramid|layered|layer-stack|stacked-layer|stacked|层级|分层|金字塔|漏斗/.test(direct)) return "layered-stack";
  if (/cycle-loop|闭环|循环|环形|双环/.test(direct)) return "cycle-loop";
  if (/hub|spoke|cycle|radial|generic-node|topology/.test(direct)) return "hub-spoke";
  if (/timeline/.test(direct)) return "timeline";
  return "process-chain";
}

function chartFamilyFromEvidence(image = {}, match = {}) {
  const motifs = rawComponentMotifs(image, match);
  if (motifs.includes("treemap-chart")) return "treemap-chart";
  if (motifs.includes("bubble-scatter-chart")) return "scatter-chart";
  if (motifs.includes("donut-segment-chart")) return "donut-chart";
  if (motifs.includes("pie-share-chart")) return "pie-chart";
  if (motifs.includes("venn-overlap") || motifs.includes("intersection-overlap")) return "venn-overlap";
  if (motifs.includes("concentric-circles") || motifs.includes("ring-node")) return "concentric-circles";
  if (motifs.includes("fishbone-cause")) return "fishbone-cause-effect";
  if (motifs.includes("sankey-flow-chart")) return "sankey-flow-chart";
  if (motifs.includes("map-chart")) return "map-chart";
  if (motifs.includes("word-cloud-chart")) return "word-cloud-chart";
  if (motifs.includes("waterfall-chart")) return "waterfall-chart";
  if (motifs.includes("gauge-chart")) return "gauge-chart";
  if (motifs.includes("radar-chart")) return "radar-chart";
  const strategy = image?.source?.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const structureKind = safeText(match.structure?.kind || candidate.structureSignature?.primaryKind || match.structureSignature?.primaryKind).toLowerCase();
  const direct = [
    layer.templateFamily,
    understanding.archetype,
    understanding.componentStrategy?.templateFamily,
    strategy.templateFamily,
    match.templateFamily,
    structureKind,
    candidate.title,
    candidate.description
  ].map((value) => safeText(value).toLowerCase()).join(" ");
  if (/treemap|tree-map|area-composition|area-map|矩形树图/.test(direct)) return "treemap-chart";
  if (/bubble|scatter|气泡|散点/.test(direct)) return "scatter-chart";
  if (/donut|doughnut|segmented-donut|ring-chart|环图|圆环/.test(direct)) return "donut-chart";
  if (/pie|饼图/.test(direct)) return "pie-chart";
  if (/venn|overlap|intersection|韦恩|维恩|交集|重叠/.test(direct)) return "venn-overlap";
  if (/concentric|onion|nested.?circle|同心圆|洋葱图|圈层|嵌套圆/.test(direct)) return "concentric-circles";
  if (/fishbone|cause.?effect|root.?cause|ishikawa|鱼骨|因果|根因/.test(direct)) return "fishbone-cause-effect";
  if (/sankey|alluvial|flow.?distribution|桑基|流向|流量分布/.test(direct)) return "sankey-flow-chart";
  if (/map.?chart|geo.?map|choropleth|地图|区域分布|地理分布/.test(direct)) return "map-chart";
  if (/word.?cloud|tag.?cloud|keyword.?cloud|词云|标签云|关键词云/.test(direct)) return "word-cloud-chart";
  if (/waterfall|variance.?bridge|瀑布|差异桥|增减/.test(direct)) return "waterfall-chart";
  if (/gauge|speedometer|仪表|速度表|半圆仪表/.test(direct)) return "gauge-chart";
  if (/radar|spider|雷达|蛛网|蜘蛛网/.test(direct)) return "radar-chart";
  return "";
}

function rawComponentMotifs(image = {}, match = {}) {
  const readiness = image?.source?.componentAssetReadiness || {};
  const strategy = image?.source?.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  return [
    ...(Array.isArray(readiness.targetMotifs) ? readiness.targetMotifs : []),
    ...(Array.isArray(understanding.targetMotifs) ? understanding.targetMotifs : []),
    ...(Array.isArray(understanding.componentStrategy?.targetMotifs) ? understanding.componentStrategy.targetMotifs : []),
    ...(Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : []),
    ...(Array.isArray(match.targetMotifs) ? match.targetMotifs : []),
    ...(Array.isArray(match.structure?.motifs) ? match.structure.motifs : []),
    ...Object.keys(match.structure?.motifCounts || {}),
    ...(Array.isArray(match.structureSignature?.motifs) ? match.structureSignature.motifs : []),
    ...(Array.isArray(candidate.targetMotifs) ? candidate.targetMotifs : []),
    ...(Array.isArray(candidate.structureSignature?.motifs) ? candidate.structureSignature.motifs : [])
  ].map((motif) => safeText(motif).toLowerCase()).filter(Boolean);
}

function isChartFamily(family = "") {
  return ["treemap-chart", "scatter-chart", "donut-chart", "pie-chart"].includes(family);
}

function isLearnedReplayFamily(family = "") {
  return [
    "venn-overlap",
    "concentric-circles",
    "fishbone-cause-effect",
    "sankey-flow-chart",
    "map-chart",
    "word-cloud-chart",
    "waterfall-chart",
    "gauge-chart",
    "radar-chart"
  ].includes(family);
}

function shapesForFamily(image, match, family, slideSize) {
  const directApplied = templateDirectAppliedLayoutShapes(image, match, family, slideSize);
  if (directApplied.length >= 3) {
    return [...directApplied, ...templateSupplementalAppliedLayoutShapes(image, match, family, slideSize)];
  }
  if (isChartFamily(family)) return chartShapes(image, match, family, slideSize);
  if (isLearnedReplayFamily(family)) return learnedComponentReplayShapes(image, match, family, slideSize);
  if (family === "quadrant") return quadrantShapes(image, match, slideSize);
  if (family === "matrix") return matrixShapes(image, match, slideSize);
  if (family === "layered-stack") return layeredStackShapes(image, match, slideSize);
  if (family === "cycle-loop") return cycleLoopShapes(image, match, slideSize);
  if (family === "hub-spoke") return hubSpokeShapes(image, match, slideSize);
  if (family === "timeline") return timelineShapes(image, match, slideSize);
  return processChainShapes(image, match, slideSize);
}

function templateDirectAppliedLayoutShapes(image = {}, match = {}, family = "component", slideSize = DEFAULT_SLIDE) {
  if (!isAppliedPluginComponentMatch(match)) return [];
  const box = safeBox(image.box, slideSize);
  if (!box) return [];
  const replayChildren = Array.isArray(match.replayChildLayout?.children) ? match.replayChildLayout.children : [];
  const fallbackChildren = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  const children = isSpatiallyRepresentativeReplayLayout(replayChildren, fallbackChildren)
    ? replayChildren
    : fallbackChildren;
  if (children.length < 3) return [];
  const editableChildren = children
    .map((child, index) => ({
      index,
      kind: String(child?.kind || ""),
      relativeBox: child?.box,
      box: scaleRelativeBox(child?.box, box, slideSize),
      style: child?.style || {}
    }))
    .map((child) => ({
      ...child,
      structureRole: appliedChildStructureRole(child)
    }))
    .filter((child) => child.kind === "shape" || child.kind === "connector" || child.kind === "picture")
    .filter((child) => isReusableAppliedChildBox(child.relativeBox))
    .filter((child) => child.box && child.box.w > 0 && child.box.h > 0)
    .sort(appliedChildLayerOrder)
    .slice(0, 48);
  const shapeCount = editableChildren.filter((child) => child.kind === "shape").length;
  const pictureCount = editableChildren.filter((child) => child.kind === "picture").length;
  if (editableChildren.length < 3 || shapeCount < 3 || pictureCount > Math.max(2, shapeCount)) return [];
  return editableChildren.map((child, outIndex) => {
    const isConnector = child.kind === "connector";
    const isPicture = child.kind === "picture";
    const part = `${family}-applied-${componentRolePart(child.structureRole, isPicture)}`;
    const replayStyle = appliedReplayStyle(child.style, isConnector, isPicture);
    return nativeShape(
      image,
      match,
      part,
      outIndex,
      isConnector ? "line" : nativeTypeForTemplateStyle(child.style, "rect"),
      child.box,
      replayStyle,
        {
          appliedPluginDirectReplay: true,
          appliedPluginChildIndex: child.index,
          appliedPluginChildKind: child.kind,
          appliedPluginStructureRole: child.structureRole,
          ...(isPicture ? {
            appliedPluginPictureShell: true,
            appliedPluginPictureRelId: child.style?.picture?.embedRelId || "",
            appliedPluginPictureMediaTarget: child.style?.picture?.mediaTarget || "",
            appliedPluginPictureCrop: child.style?.picture?.crop ? JSON.stringify(child.style.picture.crop) : ""
          } : {})
        }
      );
  });
}

function isAppliedPluginComponentMatch(match = {}) {
  return match.assetAppliedComponent === true
    || safeText(match.assetReusePolicy).toLowerCase() === "inspect-openxml-applied-plugin-component";
}

function isSpatiallyRepresentativeReplayLayout(children = [], fallbackChildren = []) {
  const replayBounds = normalizedLayoutBounds(children);
  if (!replayBounds || replayBounds.count < 3) return false;
  const fallbackBounds = normalizedLayoutBounds(fallbackChildren);
  if (!fallbackBounds || fallbackBounds.count < 3) return true;
  const widthCoverage = replayBounds.w / Math.max(0.001, fallbackBounds.w);
  const heightCoverage = replayBounds.h / Math.max(0.001, fallbackBounds.h);
  return widthCoverage >= 0.55 || heightCoverage >= 0.55;
}

function normalizedLayoutBounds(children = []) {
  const boxes = (Array.isArray(children) ? children : [])
    .map((child) => child?.box)
    .filter((box) => box && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0);
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.w));
  const maxY = Math.max(...boxes.map((box) => box.y + box.h));
  return { count: boxes.length, x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function templateSupplementalAppliedLayoutShapes(image = {}, match = {}, family = "component", slideSize = DEFAULT_SLIDE) {
  if (!isAppliedPluginComponentMatch(match)) return [];
  const targetBox = safeBox(image.box, slideSize);
  const primaryBounds = normalizedSourceBounds(match.boundsPt);
  if (!targetBox || !primaryBounds) return [];
  const assets = Array.isArray(image?.source?.componentLocalAssets) ? image.source.componentLocalAssets : [];
  const siblings = assets
    .filter((asset) => safeText(asset?.provider) === safeText(match.assetProvider))
    .filter((asset) => !match.assetPath || safeText(asset?.path) === safeText(match.assetPath))
    .flatMap((asset) => Array.isArray(asset?.recommendedComponentGroups) ? asset.recommendedComponentGroups : [])
    .filter((group) => safeText(group?.id) && safeText(group.id) !== safeText(match.id))
    .map((group) => ({
      group,
      bounds: normalizedSourceBounds(group?.boundsPt),
      children: Array.isArray(group?.replayChildLayout?.children) ? group.replayChildLayout.children : []
    }))
    .filter((candidate) => candidate.bounds && candidate.children.length >= 4)
    .filter((candidate) => !groupHasNoisyGenericPlaceholderText(candidate.group))
    .filter((candidate) => sourceBoundsContainedBy(candidate.bounds, primaryBounds));
  const shapes = [];
  for (const candidate of siblings.slice(0, 4)) {
    const children = candidate.children
      .map((child, index) => ({ index, child, relativeBox: sourceChildRelativeBox(child?.box, candidate.bounds, primaryBounds) }))
      .filter(({ child, relativeBox }) => (child?.kind === "shape" || child?.kind === "connector")
        && !child?.style?.text
        && hasSupplementalAppliedPaint(child?.style)
        && isReusableAppliedChildBox(relativeBox))
      .slice(0, 24);
    if (children.length < 4) continue;
    for (const item of children) {
      const isConnector = item.child.kind === "connector";
      const style = appliedReplayStyle(item.child.style, isConnector, false);
      shapes.push(nativeShape(
        image,
        match,
        `${family}-applied-supplemental-decoration`,
        shapes.length,
        isConnector ? "line" : nativeTypeForTemplateStyle(item.child.style, "rect"),
        scaleRelativeBox(item.relativeBox, targetBox, slideSize),
        style,
        {
          appliedPluginDirectReplay: true,
          appliedPluginSupplementalReplay: true,
          appliedPluginSupplementalGroupId: safeText(candidate.group.id),
          appliedPluginChildIndex: item.index,
          appliedPluginChildKind: item.child.kind,
          appliedPluginStructureRole: "decoration"
        }
      ));
    }
  }
  return shapes;
}

function normalizedSourceBounds(bounds = {}) {
  const x = Number(bounds?.x);
  const y = Number(bounds?.y);
  const w = Number(bounds?.w);
  const h = Number(bounds?.h);
  return [x, y, w, h].every(Number.isFinite) && w > 0 && h > 0 ? { x, y, w, h } : null;
}

function sourceBoundsContainedBy(inner = {}, outer = {}) {
  const toleranceX = Math.max(2, outer.w * 0.025);
  const toleranceY = Math.max(2, outer.h * 0.025);
  return inner.x >= outer.x - toleranceX
    && inner.y >= outer.y - toleranceY
    && inner.x + inner.w <= outer.x + outer.w + toleranceX
    && inner.y + inner.h <= outer.y + outer.h + toleranceY;
}

function sourceChildRelativeBox(childBox = {}, groupBounds = {}, primaryBounds = {}) {
  const child = normalizedSourceBounds({ x: childBox?.x, y: childBox?.y, w: childBox?.w, h: childBox?.h });
  if (!child) return null;
  return {
    x: (groupBounds.x + child.x * groupBounds.w - primaryBounds.x) / primaryBounds.w,
    y: (groupBounds.y + child.y * groupBounds.h - primaryBounds.y) / primaryBounds.h,
    w: child.w * groupBounds.w / primaryBounds.w,
    h: child.h * groupBounds.h / primaryBounds.h
  };
}

function semanticComponentGroupNodeCount(group = {}) {
  const structure = group?.structure || {};
  return Math.max(
    normalizeCount(structure.nodeCount),
    normalizeCount(structure.roles?.node),
    normalizeCount(group.nodeCount),
    clampNumber(group.shapeCount ?? group.childCount, 0, 1000, 0)
  );
}

function semanticComponentGroupConnectorCount(group = {}) {
  const structure = group?.structure || {};
  return Math.max(
    normalizeCount(structure.connectorCount),
    normalizeCount(structure.roles?.connector),
    normalizeCount(group.connectorCount)
  );
}

function targetComponentStructureKinds({ templateFamily = "", layerType = "", archetype = "" } = {}) {
  const signal = `${templateFamily} ${layerType} ${archetype}`.toLowerCase();
  const kinds = [];
  if (/matrix|grid|table|quadrant-grid/.test(signal)) kinds.push("matrix");
  if (/hub[- ]?spoke|radial|relationship|network/.test(signal)) kinds.push("hub-spoke");
  if (/timeline|roadmap|milestone|gantt/.test(signal)) kinds.push("timeline");
  if (/cycle|loop|ring/.test(signal)) kinds.push("cycle-loop");
  if (/layered|stack|pyramid|funnel/.test(signal)) kinds.push("layered-stack");
  if (/process|linear-flow|arrow-chain|workflow/.test(signal)) kinds.push("process-chain");
  if (/quadrant|four-quadrant/.test(signal)) kinds.push("quadrant");
  return kinds.filter((kind, index) => kinds.indexOf(kind) === index);
}

function normalizeComponentStructureKind(value) {
  const kind = safeText(value).toLowerCase();
  if (/^(?:matrix|grid|table|comparison-matrix|heatmap-matrix)$/.test(kind)) return "matrix";
  if (/^(?:hub-spoke|radial|relationship|network)$/.test(kind)) return "hub-spoke";
  if (/^(?:timeline|roadmap|milestone|gantt)$/.test(kind)) return "timeline";
  if (/^(?:cycle|cycle-loop|ring)$/.test(kind)) return "cycle-loop";
  if (/^(?:layered-stack|stack|pyramid|funnel)$/.test(kind)) return "layered-stack";
  if (/^(?:process|process-chain|flow|workflow)$/.test(kind)) return "process-chain";
  if (/^(?:quadrant|four-quadrant)$/.test(kind)) return "quadrant";
  return "";
}

function hasSupplementalAppliedPaint(style = {}) {
  const fill = safeText(style?.fill).toLowerCase();
  const stroke = safeText(style?.stroke).toLowerCase();
  return (fill && fill !== "none") || (stroke && stroke !== "none") || Boolean(style?.gradient);
}

function groupHasNoisyGenericPlaceholderText(group = {}) {
  const layouts = [group?.replayChildLayout, group?.childLayout];
  return layouts
    .flatMap((layout) => Array.isArray(layout?.children) ? layout.children : [])
    .map((child) => safeText(child?.style?.text?.placeholderText))
    .some((text) => text.length >= 40 && isGenericPluginPlaceholderText(text));
}

function appliedReplayStyle(templateStyle = {}, isConnector = false, isPicture = false) {
  const isTextOnly = Boolean(templateStyle?.text)
    && (!safeText(templateStyle?.fill) || safeText(templateStyle.fill).toLowerCase() === "none")
    && (!safeText(templateStyle?.stroke) || safeText(templateStyle.stroke).toLowerCase() === "none");
  const fallbackStyle = isConnector
    ? { stroke: "#64748B", strokeWidthPt: 1.2, connectorType: "straight" }
    : isPicture
      ? { fill: "none", stroke: "none", strokeWidthPt: 0, opacity: 0.98 }
      : isTextOnly
        ? { fill: "none", stroke: "none", strokeWidthPt: 0 }
        : { fill: "none", stroke: "#64748B", strokeWidthPt: 0.85, radiusRatio: 0.12 };
  const replayStyle = mergeTemplateStyle(templateStyle, fallbackStyle);
  const sourceExplicitlyHasNoFill = safeText(templateStyle?.fill).toLowerCase() === "none";
  if (sourceExplicitlyHasNoFill && safeText(replayStyle.fill).toLowerCase() === "none") {
    const lineGradientOpacity = maxGradientStopAlpha(replayStyle.gradient);
    if (lineGradientOpacity !== null && replayStyle.opacity === undefined) {
      replayStyle.opacity = lineGradientOpacity;
    }
    delete replayStyle.gradient;
  }
  return replayStyle;
}

function isReusableAppliedChildBox(box = {}) {
  if (!box || typeof box !== "object") return false;
  const x = Number(box.x);
  const y = Number(box.y);
  const w = Number(box.w);
  const h = Number(box.h);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return false;
  return x >= -0.18 && y >= -0.18 && x + w <= 1.18 && y + h <= 1.18;
}

function appliedChildLayerOrder(a = {}, b = {}) {
  const layerA = appliedRoleLayer(a.structureRole);
  const layerB = appliedRoleLayer(b.structureRole);
  if (layerA !== layerB) return layerA - layerB;
  return Number(a.index || 0) - Number(b.index || 0);
}

function appliedRoleLayer(role) {
  if (role === "background") return 0;
  return 1;
}

function appliedChildStructureRole(child = {}) {
  const kind = safeText(child.kind).toLowerCase();
  if (kind === "connector") return "connector";
  if (kind === "picture") return "picture";
  const style = child.style || {};
  const box = child.relativeBox || {};
  const width = Math.max(0, Number(box.w || 0));
  const height = Math.max(0, Number(box.h || 0));
  const area = width * height;
  const shapeType = safeText(style.shapeType).toLowerCase();
  const hasVisibleFill = Boolean(style.fill && String(style.fill).toLowerCase() !== "none");
  const hasVisibleStroke = Boolean(style.stroke && String(style.stroke).toLowerCase() !== "none" && Number(style.strokeWidthPt ?? 1) > 0);
  if (area >= 0.42 && width >= 0.55 && height >= 0.32) return "background";
  if (style.text && !hasVisibleFill && !hasVisibleStroke && !shapeType) return "text-slot";
  if (/line|arc|brace|bracket|triangle|chevron|circular|arrow|blockarc/.test(shapeType)) return "decoration";
  if (area <= 0.015 || width <= 0.035 || height <= 0.035) return "decoration";
  return "node";
}

function isTemplateConnectorDecorationStyle(style = {}) {
  const shapeType = safeText(style?.shapeType).toLowerCase();
  return /line|arc|brace|bracket|triangle|chevron|circular|arrow|blockarc/.test(shapeType);
}

function componentRolePart(role, isPicture = false) {
  if (isPicture) return "picture-shell";
  if (role === "background") return "background";
  if (role === "connector") return "connector";
  if (role === "decoration") return "decoration";
  if (role === "text-slot") return "text-slot";
  return "node";
}

function processChainShapes(image = {}, match = {}, slideSize = DEFAULT_SLIDE) {
  const box = safeBox(image.box, slideSize);
  if (!box) return [];
  const fidelityOverlay = isFidelityCropOverlay(image);
  const palette = paletteFromMatch(match, {
    accents: ["#2F80ED", "#27AE60"],
    neutral: "#7C8CA0",
    softFills: ["#EAF3FF", "#EAFBF2"]
  });
  if (isSwimlaneProcessLayer(image)) {
    const visualSwimlane = swimlaneProcessShapesFromVisualNodes(image, match, box, palette, slideSize);
    if (visualSwimlane.length > 0) return visualSwimlane;
  }
  const visualChain = processChainShapesFromVisualNodes(image, match, box, palette, slideSize);
  if (visualChain.length > 0) return visualChain;
  const guided = templateGuidedProcessShapes(image, match, box, palette, slideSize);
  if (guided.length > 0) return guided;
  if (isSwimlaneProcessLayer(image)) {
    const swimlane = swimlaneProcessShapes(image, match, box, palette, slideSize);
    if (swimlane.length > 0) return swimlane;
  }
  const count = clampInteger(match.childCount || match.shapeCount || 4, 3, 6);
  const gap = Math.max(10, Math.min(24, box.w * 0.028));
  const nodeW = (box.w - gap * (count - 1)) / count;
  const nodeH = Math.min(box.h * 0.52, Math.max(34, box.h * 0.34));
  const y = box.y + (box.h - nodeH) * 0.46;
  const shapes = [];
  let previousNodeBox = null;
  for (let index = 0; index < count; index += 1) {
    const x = box.x + index * (nodeW + gap);
    const nodeBox = clampBox({ x, y, w: nodeW, h: nodeH }, slideSize);
    shapes.push(nativeShape(image, match, "process-node", index, "roundRect", nodeBox, {
      fill: fidelityOverlay ? "none" : palette.softFills[index % palette.softFills.length],
      stroke: palette.accents[index % palette.accents.length],
      strokeWidthPt: 1.05,
      radiusRatio: 0.18,
      ...(fidelityOverlay ? {} : { shadow: { color: "#1F2937", alpha: 0.12, blurPt: 4.5, distancePt: 1.2, angleDeg: 90 } })
    }));
    if (index > 0) {
      const prevX = x - gap;
      shapes.push(nativeShape(image, match, "process-connector", index - 1, "line", {
        x: prevX + 1.5,
        y: y + nodeH / 2,
        w: gap - 3,
        h: 0.1
      }, mergeTemplateStyle(firstTemplateConnectorStyle(match), {
        stroke: palette.neutral,
        strokeWidthPt: 1.4,
        connectorType: "straight",
        endArrow: "triangle"
      }), processConnectorMetadata(index - 1, index, previousNodeBox, nodeBox)));
    }
    previousNodeBox = nodeBox;
  }
  return shapes;
}

function processChainShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE) {
  if (isSwimlaneProcessLayer(image)) return [];
  const nodes = treeVisualNodes(image, targetBox, slideSize)
    .slice()
    .sort((a, b) => boxCenter(a.box).x - boxCenter(b.box).x || boxCenter(a.box).y - boxCenter(b.box).y)
    .slice(0, 12);
  if (nodes.length < 3) return [];
  const centerYs = nodes.map((node) => boxCenter(node.box).y);
  const ySpread = Math.max(...centerYs) - Math.min(...centerYs);
  const avgNodeH = nodes.reduce((sum, node) => sum + node.box.h, 0) / Math.max(1, nodes.length);
  if (ySpread > Math.max(avgNodeH * 1.8, targetBox.h * 0.22)) return [];

  const shapes = [];
  nodes.forEach((node, index) => {
    shapes.push(nativeShape(image, match, "process-node", index, "roundRect", node.box, {
      fill: palette.softFills?.[index % Math.max(1, palette.softFills.length)] || "#EAF3FF",
      stroke: palette.accents?.[index % Math.max(1, palette.accents.length)] || "#2F80ED",
      strokeWidthPt: 1.05,
      radiusRatio: 0.18,
      shadow: { color: "#1F2937", alpha: 0.12, blurPt: 4.5, distancePt: 1.2, angleDeg: 90 }
    }, {
      sourceVisualNodeId: node.id,
      layoutPreservation: "visual-node"
    }));
  });
  const visualEdges = visualConnectorsBetweenNodes(image, nodes, { max: 16 });
  const connectorEdges = visualEdges.length > 0
    ? visualEdges
    : nodes.slice(1).map((node, index) => ({ from: nodes[index], to: node, fromIndex: index, toIndex: index + 1 }));
  connectorEdges.forEach((edge, index) => {
    shapes.push(nativeShape(image, match, "process-connector", index, "line", lineBoxBetween(edge.from.box, edge.to.box), mergeTemplateStyle(firstTemplateConnectorStyle(match), {
      stroke: palette.neutral || "#7C8CA0",
      strokeWidthPt: 1.4,
      connectorType: "straight",
      endArrow: "triangle"
    }), {
      ...processConnectorMetadata(edge.fromIndex, edge.toIndex, edge.from.box, edge.to.box),
      connectorSemantic: "node-to-node",
      connectorKind: "process-chain",
      sourceVisualConnectorId: edge.id,
      sourceVisualNodeId: edge.to.id,
      layoutPreservation: "visual-node"
    }));
  });
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function isSwimlaneProcessLayer(image = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const signature = understanding.structureSignature || {};
  const strategy = image?.source?.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  const text = [
    layer.templateFamily,
    understanding.archetype,
    signature.layout,
    understanding.componentStrategy?.structureSignature?.layout,
    candidate.structureSignature?.layout,
    candidate.title
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return /swimlane|泳道/.test(text);
}

function swimlaneProcessShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE) {
  const nodes = treeVisualNodes(image, targetBox, slideSize);
  if (nodes.length < 4) return [];
  const understanding = image?.source?.layer?.diagramUnderstanding || {};
  const laneGroups = splitVisualNodesIntoSwimlanes(nodes, understanding, targetBox);
  if (laneGroups.length < 2 || laneGroups.some((lane) => lane.length < 2)) return [];
  const visualEdges = visualConnectorsBetweenNodes(image, nodes, { max: 32 });
  const nodeIndexById = new Map();

  const shapes = [];
  const headerW = Math.max(48, Math.min(96, targetBox.w * 0.14));
  laneGroups.forEach((laneNodes, lane) => {
    const nodeBoxes = laneNodes.map((node) => node.box);
    const laneContent = unionBox(nodeBoxes);
    const lanePadY = Math.max(8, Math.min(18, laneContent.h * 0.42));
    const laneBox = clampBox({
      x: targetBox.x,
      y: Math.max(targetBox.y, laneContent.y - lanePadY),
      w: targetBox.w,
      h: Math.min(targetBox.y + targetBox.h, laneContent.y + laneContent.h + lanePadY) - Math.max(targetBox.y, laneContent.y - lanePadY)
    }, slideSize);
    const headerBox = clampBox({
      x: targetBox.x,
      y: laneBox.y,
      w: Math.min(headerW, Math.max(28, Math.min(...nodeBoxes.map((box) => box.x)) - targetBox.x - 8)),
      h: laneBox.h
    }, slideSize);
    shapes.push(nativeShape(image, match, "swimlane-lane", lane, "roundRect", laneBox, swimlaneLaneStyle(palette, lane, match), {
      swimlaneIndex: lane,
      layoutPreservation: "visual-node"
    }));
    shapes.push(nativeShape(image, match, "swimlane-header", lane, "roundRect", headerBox, swimlaneHeaderStyle(palette, lane, match), {
      swimlaneIndex: lane,
      layoutPreservation: "visual-node"
    }));

    laneNodes
      .slice()
      .sort((a, b) => boxCenter(a.box).x - boxCenter(b.box).x)
      .forEach((node, col, orderedLaneNodes) => {
        const nodeIndex = lane * 100 + col;
        nodeIndexById.set(node.id, { node, nodeIndex, lane, col });
        shapes.push(nativeShape(image, match, "swimlane-node", nodeIndex, "roundRect", node.box, swimlaneNodeStyle(palette, lane, col, match), {
          swimlaneIndex: lane,
          swimlaneColumn: col,
          sourceVisualNodeId: node.id,
          layoutPreservation: "visual-node"
        }));
        if (visualEdges.length === 0 && col > 0) {
          const previous = orderedLaneNodes[col - 1];
          shapes.push(nativeShape(image, match, "swimlane-connector", nodeIndex - 1, "line", lineBoxBetween(previous.box, node.box), swimlaneConnectorStyle(palette, lane, match), {
            ...processConnectorMetadata(nodeIndex - 1, nodeIndex, previous.box, node.box),
            connectorSemantic: "swimlane-flow",
            swimlaneIndex: lane,
            sourceVisualNodeId: node.id,
            layoutPreservation: "visual-node"
          }));
        }
      });
  });
  if (visualEdges.length > 0) {
    visualEdges.forEach((edge, index) => {
      const from = nodeIndexById.get(edge.from.id);
      const to = nodeIndexById.get(edge.to.id);
      if (!from || !to) return;
      shapes.push(nativeShape(image, match, "swimlane-connector", 900 + index, "line", lineBoxBetween(from.node.box, to.node.box), {
        ...swimlaneConnectorStyle(palette, from.lane, match),
        connectorType: edge.axis === "vertical" ? "elbow" : "straight",
        endArrow: edge.arrow === false ? "none" : "triangle"
      }, {
        ...processConnectorMetadata(from.nodeIndex, to.nodeIndex, from.node.box, to.node.box),
        connectorSemantic: "swimlane-flow",
        swimlaneIndex: from.lane === to.lane ? from.lane : -1,
        crossSwimlaneConnector: from.lane !== to.lane,
        sourceVisualConnectorId: edge.id,
        sourceVisualNodeId: to.node.id,
        layoutPreservation: "visual-node"
      }));
    });
  }
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function splitVisualNodesIntoSwimlanes(nodes = [], understanding = {}, targetBox = {}) {
  const sorted = nodes
    .slice()
    .sort((a, b) => boxCenter(a.box).y - boxCenter(b.box).y || boxCenter(a.box).x - boxCenter(b.box).x);
  const explicitLaneCount = clampInteger(understanding?.structureSignature?.laneCount || understanding?.structureSignature?.rows || 0, 0, 8);
  const laneCount = explicitLaneCount >= 2 ? Math.min(explicitLaneCount, Math.floor(sorted.length / 2)) : 0;
  if (laneCount >= 2) {
    const gaps = [];
    for (let index = 1; index < sorted.length; index += 1) {
      gaps.push({
        index,
        gap: boxCenter(sorted[index].box).y - boxCenter(sorted[index - 1].box).y
      });
    }
    const splitIndexes = new Set(gaps
      .sort((a, b) => b.gap - a.gap)
      .slice(0, laneCount - 1)
      .map((entry) => entry.index));
    const groups = [];
    let current = [];
    sorted.forEach((node, index) => {
      if (splitIndexes.has(index) && current.length > 0) {
        groups.push(current);
        current = [];
      }
      current.push(node);
    });
    if (current.length > 0) groups.push(current);
    return groups.filter((group) => group.length > 0);
  }

  const avgNodeH = sorted.reduce((sum, node) => sum + node.box.h, 0) / Math.max(1, sorted.length);
  const threshold = Math.max(avgNodeH * 1.55, targetBox.h * 0.12);
  const groups = [];
  for (const node of sorted) {
    const centerY = boxCenter(node.box).y;
    const current = groups[groups.length - 1];
    if (!current || centerY - averageLaneCenterY(current) > threshold) {
      groups.push([node]);
    } else {
      current.push(node);
    }
  }
  return groups;
}

function averageLaneCenterY(nodes = []) {
  return nodes.reduce((sum, node) => sum + boxCenter(node.box).y, 0) / Math.max(1, nodes.length);
}

function swimlaneLaneStyle(palette = {}, lane = 0, match = {}) {
  const accent = paletteAccent(palette, lane);
  const soft = mixColor(accent, "#FFFFFF", lane % 2 === 0 ? 0.93 : 0.9) || (lane % 2 === 0 ? "#F8FAFC" : "#F1F5F9");
  const fallback = {
    fill: soft,
    stroke: mixColor(accent, "#FFFFFF", 0.62) || palette.neutral || "#CBD5E1",
    strokeWidthPt: 0.65,
    radiusRatio: 0.075,
    shadow: { color: "#334155", alpha: 0.045, blurPt: 2.4, distancePt: 0.45, angleDeg: 90 }
  };
  const sample = swimlaneTemplateStyleSamples(match).background || null;
  return sample ? visualOnlyTemplateStyle(mergeTemplateStyle(sample, fallback)) : fallback;
}

function swimlaneHeaderStyle(palette = {}, lane = 0, match = {}) {
  const accent = paletteAccent(palette, lane);
  const light = mixColor(accent, "#FFFFFF", 0.66) || "#EAF3FF";
  const vivid = mixColor(accent, "#FFFFFF", 0.1) || accent;
  const fallback = {
    fill: light,
    stroke: vivid,
    strokeWidthPt: 0.85,
    radiusRatio: 0.14,
    gradient: {
      type: "linear",
      angleDeg: 0,
      stops: [
        { position: 0, color: vivid },
        { position: 1, color: light }
      ]
    },
    shadow: { color: "#0F172A", alpha: 0.08, blurPt: 3.6, distancePt: 0.8, angleDeg: 90 }
  };
  const sample = swimlaneTemplateStyleSamples(match).header || swimlaneTemplateStyleSamples(match).node || null;
  return sample ? visualOnlyTemplateStyle(mergeTemplateStyle(sample, fallback)) : fallback;
}

function swimlaneNodeStyle(palette = {}, lane = 0, col = 0, match = {}) {
  const accent = paletteAccent(palette, lane + col);
  const tint = mixColor(accent, "#FFFFFF", 0.9) || "#FFFFFF";
  const fallback = {
    fill: "#FFFFFF",
    stroke: mixColor(accent, "#FFFFFF", 0.2) || accent,
    strokeWidthPt: 1.05,
    radiusRatio: 0.2,
    gradient: {
      type: "linear",
      angleDeg: 0,
      stops: [
        { position: 0, color: tint },
        { position: 0.32, color: "#FFFFFF" },
        { position: 1, color: "#FFFFFF" }
      ]
    },
    shadow: { color: "#1F2937", alpha: 0.12, blurPt: 5.2, distancePt: 1.15, angleDeg: 90 }
  };
  const sample = swimlaneTemplateStyleSamples(match).node || null;
  return sample ? visualOnlyTemplateStyle(mergeTemplateStyle(sample, fallback)) : fallback;
}

function swimlaneConnectorStyle(palette = {}, lane = 0, match = {}) {
  const accent = paletteAccent(palette, lane);
  const fallback = {
    stroke: mixColor(accent, "#334155", 0.18) || palette.neutral || "#64748B",
    strokeWidthPt: 1.65,
    connectorType: "straight",
    endArrow: "triangle"
  };
  const sample = swimlaneTemplateStyleSamples(match).connector || null;
  return sample ? visualOnlyTemplateStyle(mergeTemplateStyle(sample, fallback)) : fallback;
}

function paletteAccent(palette = {}, index = 0) {
  const accents = Array.isArray(palette.accents) && palette.accents.length ? palette.accents : ["#2F80ED", "#27AE60"];
  return safeColor(accents[Math.abs(index) % accents.length]) || "#2F80ED";
}

function swimlaneTemplateStyleSamples(match = {}) {
  const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  const shapeChildren = children
    .map((child, index) => ({ ...child, index, style: child?.style || {} }))
    .filter((child) => child.kind === "shape" && child.style && typeof child.style === "object");
  const connector = children.find((child) => child?.kind === "connector" && child.style && typeof child.style === "object")?.style || null;
  const background = shapeChildren
    .filter((child) => appliedChildStructureRole(child) === "background")
    .sort((a, b) => templateStyleSignalScore(b.style) - templateStyleSignalScore(a.style))[0]?.style || null;
  const header = shapeChildren
    .filter((child) => appliedChildStructureRole(child) !== "background")
    .filter((child) => Number(child?.box?.w || 0) <= 0.24 || Number(child?.box?.h || 0) <= 0.24)
    .sort((a, b) => templateStyleSignalScore(b.style) - templateStyleSignalScore(a.style))[0]?.style || null;
  const node = shapeChildren
    .filter((child) => appliedChildStructureRole(child) === "node")
    .sort((a, b) => templateStyleSignalScore(b.style) - templateStyleSignalScore(a.style))[0]?.style || header || null;
  return { background, header, node, connector };
}

function templateStyleSignalScore(style = {}) {
  let score = 0;
  if (safeColorOrNone(style.fill)) score += 1;
  if (safeColorOrNone(style.stroke)) score += 1;
  if (Number.isFinite(Number(style.strokeWidthPt))) score += 0.5;
  if (sanitizeTemplateGradient(style.gradient)) score += 4;
  if (sanitizeTemplateShadow(style.shadow)) score += 2;
  if (Number.isFinite(Number(style.radiusRatio))) score += 0.5;
  return score;
}

function visualOnlyTemplateStyle(style = {}) {
  const out = { ...(style || {}) };
  delete out.text;
  delete out.picture;
  delete out.freeform;
  delete out.adjustments;
  delete out.rotation;
  return out;
}

function swimlaneProcessShapes(image = {}, match = {}, box = null, palette = {}, slideSize = DEFAULT_SLIDE) {
  const targetBox = box || safeBox(image.box, slideSize);
  if (!targetBox) return [];
  const understanding = image?.source?.layer?.diagramUnderstanding || {};
  const nodeCount = clampInteger(understanding.visualNodeCount || understanding.nodeCount || match.childCount || 6, 4, 16);
  const laneCount = clampInteger(estimateSwimlaneCount(understanding, nodeCount), 2, 4);
  const columns = clampInteger(Math.ceil(nodeCount / laneCount), 2, 6);
  const laneGap = Math.max(6, Math.min(12, targetBox.h * 0.018));
  const laneH = (targetBox.h - laneGap * (laneCount - 1)) / laneCount;
  const headerW = Math.max(56, Math.min(96, targetBox.w * 0.14));
  const contentX = targetBox.x + headerW + Math.max(8, targetBox.w * 0.018);
  const contentW = Math.max(1, targetBox.x + targetBox.w - contentX);
  const nodeGap = Math.max(10, Math.min(22, contentW * 0.04));
  const nodeW = Math.max(42, (contentW - nodeGap * (columns - 1)) / columns);
  const nodeH = Math.max(24, Math.min(48, laneH * 0.48));
  const shapes = [];
  for (let lane = 0; lane < laneCount; lane += 1) {
    const laneY = targetBox.y + lane * (laneH + laneGap);
    const laneBox = clampBox({ x: targetBox.x, y: laneY, w: targetBox.w, h: laneH }, slideSize);
    const headerBox = clampBox({ x: targetBox.x, y: laneY, w: headerW, h: laneH }, slideSize);
    shapes.push(nativeShape(image, match, "swimlane-lane", lane, "roundRect", laneBox, swimlaneLaneStyle(palette, lane, match)));
    shapes.push(nativeShape(image, match, "swimlane-header", lane, "roundRect", headerBox, swimlaneHeaderStyle(palette, lane, match)));
    let previousNodeBox = null;
    for (let col = 0; col < columns; col += 1) {
      const nodeIndex = lane * columns + col;
      if (nodeIndex >= nodeCount) break;
      const nodeBox = clampBox({
        x: contentX + col * (nodeW + nodeGap),
        y: laneY + (laneH - nodeH) / 2,
        w: nodeW,
        h: nodeH
      }, slideSize);
      shapes.push(nativeShape(image, match, "swimlane-node", nodeIndex, "roundRect", nodeBox, swimlaneNodeStyle(palette, lane, col, match), {
        swimlaneIndex: lane,
        swimlaneColumn: col
      }));
      if (previousNodeBox) {
        shapes.push(nativeShape(image, match, "swimlane-connector", nodeIndex - 1, "line", lineBoxBetween(previousNodeBox, nodeBox), swimlaneConnectorStyle(palette, lane, match), {
          ...processConnectorMetadata(nodeIndex - 1, nodeIndex, previousNodeBox, nodeBox),
          connectorSemantic: "swimlane-flow",
          swimlaneIndex: lane
        }));
      }
      previousNodeBox = nodeBox;
    }
  }
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function estimateSwimlaneCount(understanding = {}, nodeCount = 6) {
  const signature = understanding.structureSignature || {};
  const explicit = clampInteger(signature.laneCount || signature.rows || 0, 0, 8);
  if (explicit >= 2) return explicit;
  if (nodeCount >= 9) return 3;
  return 2;
}

function matrixShapes(image = {}, match = {}, slideSize = DEFAULT_SLIDE) {
  const box = safeBox(image.box, slideSize);
  if (!box) return [];
  const palette = paletteFromMatch(match, {
    accents: ["#2F80ED", "#B6C2D2"],
    neutral: "#B6C2D2",
    softFills: ["#F8FAFC", "#EEF6FF"]
  });
  const visualMatrix = matrixShapesFromVisualNodes(image, match, box, palette, slideSize);
  if (visualMatrix.length > 0) return visualMatrix;
  const guided = templateGuidedMatrixShapes(image, match, box, palette, slideSize);
  if (guided.length > 0) return guided;
  const fidelityOverlay = isFidelityCropOverlay(image);
  const cols = clampInteger(Math.round(Math.sqrt(match.childCount || match.shapeCount || 9)), 2, 4);
  const rows = clampInteger(Math.ceil((match.childCount || 9) / cols), 2, 4);
  const gap = Math.max(6, Math.min(14, Math.min(box.w, box.h) * 0.025));
  const cellW = (box.w - gap * (cols - 1)) / cols;
  const cellH = (box.h - gap * (rows - 1)) / rows;
  const shapes = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const fill = palette.softFills[(row + col) % palette.softFills.length];
      shapes.push(nativeShape(image, match, "matrix-cell", index, "roundRect", {
        x: box.x + col * (cellW + gap),
        y: box.y + row * (cellH + gap),
        w: cellW,
        h: cellH
      }, fidelityOverlay ? fidelityOverlayShellStyle({
        fill: "none",
        stroke: palette.neutral,
        strokeWidthPt: 0.85,
        radiusRatio: 0.06
      }) : {
        fill,
        stroke: palette.neutral,
        strokeWidthPt: 0.85,
        radiusRatio: 0.06
      }));
    }
  }
  return shapes;
}

function quadrantShapes(image = {}, match = {}, slideSize = DEFAULT_SLIDE) {
  const box = safeBox(image.box, slideSize);
  if (!box) return [];
  const palette = paletteFromMatch(match, {
    accents: ["#2F80ED", "#22A76B", "#F97316", "#64748B"],
    neutral: "#8A9AAC",
    softFills: ["#EEF6FF", "#ECFDF5", "#FFF7ED", "#F8FAFC"]
  });
  const visualQuadrant = quadrantShapesFromVisualNodes(image, match, box, palette, slideSize);
  if (visualQuadrant.length > 0) return visualQuadrant;
  const midX = box.x + box.w / 2;
  const midY = box.y + box.h / 2;
  const cellW = box.w / 2;
  const cellH = box.h / 2;
  const shapes = [];
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const index = row * 2 + col;
      shapes.push(nativeShape(image, match, "quadrant-cell", index, "roundRect", {
        x: box.x + col * cellW,
        y: box.y + row * cellH,
        w: cellW,
        h: cellH
      }, {
        fill: palette.softFills?.[index % Math.max(1, palette.softFills.length)] || "#F8FAFC",
        stroke: palette.neutral || "#8A9AAC",
        strokeWidthPt: 0.75,
        radiusRatio: 0.05
      }, {
        quadrantRow: row,
        quadrantColumn: col
      }));
    }
  }
  shapes.push(...quadrantAxisShapes(image, match, box, palette, slideSize, { x: midX, y: midY }));
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function quadrantShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE) {
  const nodes = treeVisualNodes(image, targetBox, slideSize)
    .slice()
    .sort((a, b) => boxCenter(a.box).y - boxCenter(b.box).y || boxCenter(a.box).x - boxCenter(b.box).x)
    .slice(0, 8);
  if (nodes.length < 4) return [];
  const selected = selectQuadrantNodes(nodes, targetBox);
  if (selected.length !== 4) return [];
  const centers = selected.map((node) => boxCenter(node.box));
  const midX = median(centers.map((point) => point.x));
  const midY = median(centers.map((point) => point.y));
  const shapes = selected.map((node, index) => {
    const center = boxCenter(node.box);
    return nativeShape(image, match, "quadrant-cell", index, "roundRect", node.box, {
      fill: palette.softFills?.[index % Math.max(1, palette.softFills.length)] || "#F8FAFC",
      stroke: palette.neutral || "#8A9AAC",
      strokeWidthPt: 0.75,
      radiusRatio: 0.05
    }, {
      quadrantRow: center.y < midY ? 0 : 1,
      quadrantColumn: center.x < midX ? 0 : 1,
      sourceVisualNodeId: node.id,
      layoutPreservation: "visual-node"
    });
  });
  shapes.push(...quadrantAxisShapes(image, match, targetBox, palette, slideSize, quadrantCenterFromAtoms(image, targetBox) || { x: midX, y: midY }));
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function selectQuadrantNodes(nodes = [], targetBox = {}) {
  const center = boxCenter(targetBox);
  const buckets = new Map();
  for (const node of nodes) {
    const point = boxCenter(node.box);
    const key = `${point.y < center.y ? 0 : 1}-${point.x < center.x ? 0 : 1}`;
    const current = buckets.get(key);
    const score = Math.abs(point.x - center.x) + Math.abs(point.y - center.y);
    if (!current || score > current.score) buckets.set(key, { node, score });
  }
  return ["0-0", "0-1", "1-0", "1-1"].map((key) => buckets.get(key)?.node).filter(Boolean);
}

function quadrantCenterFromAtoms(image = {}, targetBox = {}) {
  const atoms = image?.source?.layer?.diagramUnderstanding?.visualAtoms || [];
  const horizontal = atoms
    .filter((atom) => atom?.box && (atom.axis === "h" || atom.shapeHint === "grid-line-horizontal"))
    .map((atom) => atom.box)
    .sort((a, b) => Math.abs(boxCenter(a).y - boxCenter(targetBox).y) - Math.abs(boxCenter(b).y - boxCenter(targetBox).y))[0];
  const vertical = atoms
    .filter((atom) => atom?.box && (atom.axis === "v" || atom.shapeHint === "grid-line-vertical"))
    .map((atom) => atom.box)
    .sort((a, b) => Math.abs(boxCenter(a).x - boxCenter(targetBox).x) - Math.abs(boxCenter(b).x - boxCenter(targetBox).x))[0];
  if (!horizontal && !vertical) return null;
  return {
    x: vertical ? boxCenter(vertical).x : boxCenter(targetBox).x,
    y: horizontal ? boxCenter(horizontal).y : boxCenter(targetBox).y
  };
}

function quadrantAxisShapes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE, center = {}) {
  const stroke = palette.neutral || "#8A9AAC";
  return [
    nativeShape(image, match, "quadrant-axis", 0, "line", {
      x: targetBox.x,
      y: Number(center.y || boxCenter(targetBox).y),
      w: targetBox.w,
      h: 0.1
    }, {
      stroke,
      strokeWidthPt: 1.1,
      connectorType: "straight"
    }, {
      quadrantAxis: "horizontal",
      axis: "horizontal",
      layoutPreservation: "visual-node"
    }),
    nativeShape(image, match, "quadrant-axis", 1, "line", {
      x: Number(center.x || boxCenter(targetBox).x),
      y: targetBox.y,
      w: 0.1,
      h: targetBox.h
    }, {
      stroke,
      strokeWidthPt: 1.1,
      connectorType: "straight"
    }, {
      quadrantAxis: "vertical",
      axis: "vertical",
      layoutPreservation: "visual-node"
    })
  ].map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function matrixShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE) {
  const nodes = treeVisualNodes(image, targetBox, slideSize)
    .slice()
    .sort((a, b) => boxCenter(a.box).y - boxCenter(b.box).y || boxCenter(a.box).x - boxCenter(b.box).x)
    .slice(0, 36);
  if (nodes.length < 4) return [];
  const avgArea = nodes.reduce((sum, node) => sum + node.box.w * node.box.h, 0) / Math.max(1, nodes.length);
  const targetArea = Math.max(1, targetBox.w * targetBox.h);
  if (avgArea / targetArea > 0.28) return [];

  return nodes.map((node, index) => nativeShape(image, match, "matrix-cell", index, "roundRect", node.box, {
    fill: palette.softFills?.[index % Math.max(1, palette.softFills.length)] || "#F8FAFC",
    stroke: palette.neutral || "#B6C2D2",
    strokeWidthPt: 0.85,
    radiusRatio: 0.06
  }, {
    sourceVisualNodeId: node.id,
    layoutPreservation: "visual-node"
  })).map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function layeredStackShapes(image = {}, match = {}, slideSize = DEFAULT_SLIDE) {
  const box = safeBox(image.box, slideSize);
  if (!box) return [];
  const palette = paletteFromMatch(match, {
    accents: ["#2F80ED", "#22A76B", "#F97316", "#64748B"],
    neutral: "#94A3B8",
    softFills: ["#EAF3FF", "#ECFDF5", "#FFF7ED", "#F8FAFC"]
  });
  const visualStack = layeredStackShapesFromVisualNodes(image, match, box, palette, slideSize);
  if (visualStack.length > 0) return visualStack;
  const guidedStack = templateGuidedLayeredStackShapes(image, match, box, palette, slideSize);
  if (guidedStack.length > 0) return guidedStack;
  const layerCount = clampInteger(match.childCount || match.shapeCount || image?.source?.layer?.diagramUnderstanding?.nodeCount || 4, 3, 7);
  const gap = Math.max(4, Math.min(10, box.h * 0.018));
  const layerH = (box.h - gap * (layerCount - 1)) / layerCount;
  const direction = layeredStackDirection(image, []);
  const shapes = [];
  for (let index = 0; index < layerCount; index += 1) {
    const t = layerCount <= 1 ? 0 : index / (layerCount - 1);
    const widthRatio = direction === "top-wide" ? 1 - t * 0.34 : 0.66 + t * 0.34;
    const layerW = Math.max(box.w * 0.42, box.w * widthRatio);
    const layerBox = clampBox({
      x: box.x + (box.w - layerW) / 2,
      y: box.y + index * (layerH + gap),
      w: layerW,
      h: layerH
    }, slideSize);
    shapes.push(layeredStackLayerShape(image, match, "layered-stack-layer", index, layerBox, palette, direction, true));
  }
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function templateGuidedLayeredStackShapes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE) {
  const layers = selectTemplateLayeredStackBoxes(match, targetBox, slideSize);
  if (layers.length < 3) return [];
  const direction = layeredStackDirection(image, layers);
  const useTaperedFallback = layeredStackUsesTaperedLayers(image, layers);
  return layers.map((layer, index) => {
    const preferredType = nativeTypeForTemplateStyle(layer.style, useTaperedFallback ? "freeform" : "roundRect");
    const fallbackStyle = {
      fill: palette.softFills?.[index % Math.max(1, palette.softFills.length)] || "#F8FAFC",
      stroke: palette.accents?.[index % Math.max(1, palette.accents.length)] || "#2F80ED",
      strokeWidthPt: 0.95,
      radiusRatio: preferredType === "freeform" ? 0 : 0.08,
      ...(preferredType === "freeform" ? { freeform: layeredStackFreeform(direction) } : {}),
      shadow: { color: "#1F2937", alpha: 0.07, blurPt: 3.5, distancePt: 0.9, angleDeg: 90 }
    };
    return nativeShape(
      image,
      match,
      "layered-stack-layer",
      index,
      preferredType,
      layer.box,
      mergeTemplateStyle(layer.style, fallbackStyle),
      {
        ...templateGuidedChildSource(layer, "component-child-layout"),
        layeredStackIndex: index,
        layeredStackDirection: direction,
        layeredStackTapered: preferredType === "freeform",
        layeredStackSource: "plugin-child-layout"
      }
    );
  }).map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function selectTemplateLayeredStackBoxes(match = {}, targetBox = {}, slideSize = DEFAULT_SLIDE) {
  const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  const layers = children
    .map((child, index) => ({
      index,
      kind: String(child?.kind || ""),
      relativeBox: child?.box,
      box: scaleRelativeBox(child?.box, targetBox, slideSize),
      style: child?.style || {}
    }))
    .filter((child) => child.kind === "shape" && isInsideUnitBox(child.relativeBox))
    .filter((child) => !isTemplateConnectorDecorationStyle(child.style))
    .filter((child) => isUsefulLayeredStackNodeBox(child.box, targetBox))
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
    .slice(0, 10);
  if (layers.length < 3) return [];
  const centers = layers.map((layer) => boxCenter(layer.box));
  const ySpread = Math.max(...centers.map((point) => point.y)) - Math.min(...centers.map((point) => point.y));
  const xSpread = Math.max(...centers.map((point) => point.x)) - Math.min(...centers.map((point) => point.x));
  const avgHeight = layers.reduce((sum, layer) => sum + Number(layer.box.h || 0), 0) / Math.max(1, layers.length);
  const widthTrend = layeredStackWidthTrend(layers);
  if (ySpread < Math.max(avgHeight * 1.8, Number(targetBox.h || 0) * 0.22)) return [];
  if (xSpread > Number(targetBox.w || 0) * 0.36 && widthTrend === "flat") return [];
  return layers;
}

function layeredStackWidthTrend(layers = []) {
  if (!Array.isArray(layers) || layers.length < 3) return "flat";
  const widths = layers.map((layer) => Number(layer.box?.w || 0)).filter(Number.isFinite);
  if (widths.length < 3) return "flat";
  const first = widths[0];
  const last = widths[widths.length - 1];
  if (first > last * 1.14) return "narrowing";
  if (last > first * 1.14) return "widening";
  return "flat";
}

function layeredStackShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE) {
  const nodes = layeredStackVisualNodes(image, targetBox, slideSize)
    .slice()
    .sort((a, b) => boxCenter(a.box).y - boxCenter(b.box).y || boxCenter(a.box).x - boxCenter(b.box).x)
    .slice(0, 12);
  if (nodes.length < 3) return [];
  const totalNodeArea = nodes.reduce((sum, node) => sum + node.box.w * node.box.h, 0);
  const coverage = totalNodeArea / Math.max(1, targetBox.w * targetBox.h);
  if (coverage < 0.12) return [];
  const direction = layeredStackDirection(image, nodes);
  const useTapered = layeredStackUsesTaperedLayers(image, nodes);
  const shapes = nodes.map((node, index) => layeredStackLayerShape(
    image,
    match,
    "layered-stack-layer",
    index,
    node.box,
    palette,
    direction,
    useTapered,
    {
      sourceVisualNodeId: node.id,
      layoutPreservation: "visual-node"
    }
  ));
  const edges = visualConnectorsBetweenNodes(image, nodes, { max: 18 });
  edges.forEach((edge, index) => {
    shapes.push(nativeShape(image, match, "layered-stack-connector", index, "line", lineBoxBetween(edge.from.box, edge.to.box), {
      stroke: palette.neutral || "#94A3B8",
      strokeWidthPt: 1.05,
      connectorType: edge.axis === "horizontal" ? "straight" : "elbow",
      endArrow: edge.arrow === false ? "none" : "triangle"
    }, {
      ...processConnectorMetadata(edge.fromIndex, edge.toIndex, edge.from.box, edge.to.box),
      connectorSemantic: "layered-stack",
      sourceVisualConnectorId: edge.id,
      sourceVisualNodeId: edge.to.id,
      layoutPreservation: "visual-node"
    }));
  });
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function layeredStackVisualNodes(image = {}, targetBox = {}, slideSize = DEFAULT_SLIDE) {
  const understanding = image?.source?.layer?.diagramUnderstanding || {};
  const rawNodes = Array.isArray(understanding.visualNodes) ? understanding.visualNodes : [];
  const candidates = rawNodes
    .map((node, index) => {
      const box = normalizeVisualNodeBox(node, targetBox, slideSize);
      if (!box || !isUsefulLayeredStackNodeBox(box, targetBox)) return null;
      return { id: node?.id || node?.nodeId || `visual-layer-${index}`, box };
    })
    .filter(Boolean);
  const deduped = [];
  for (const node of candidates) {
    if (deduped.some((existing) => boxOverlapArea(existing.box, node.box) / Math.max(1, Math.min(existing.box.w * existing.box.h, node.box.w * node.box.h)) > 0.72)) {
      continue;
    }
    deduped.push(node);
  }
  return deduped;
}

function isUsefulLayeredStackNodeBox(box = {}, targetBox = {}) {
  if (!box || box.w <= 8 || box.h <= 8) return false;
  const areaRatio = (box.w * box.h) / Math.max(1, targetBox.w * targetBox.h);
  const widthRatio = box.w / Math.max(1, targetBox.w);
  const heightRatio = box.h / Math.max(1, targetBox.h);
  return areaRatio >= 0.012
    && areaRatio <= 0.62
    && widthRatio >= 0.12
    && widthRatio <= 1.08
    && heightRatio >= 0.045
    && heightRatio <= 0.42;
}

function layeredStackLayerShape(image, match, part, index, box, palette, direction = "stack", tapered = false, extraSource = {}) {
  const fill = palette.softFills?.[index % Math.max(1, palette.softFills.length)] || "#F8FAFC";
  const stroke = palette.accents?.[index % Math.max(1, palette.accents.length)] || "#2F80ED";
  const type = tapered ? "freeform" : "roundRect";
  return nativeShape(image, match, part, index, type, box, {
    fill,
    stroke,
    strokeWidthPt: 0.95,
    radiusRatio: tapered ? 0 : 0.08,
    ...(tapered ? { freeform: layeredStackFreeform(direction) } : {}),
    shadow: { color: "#1F2937", alpha: 0.07, blurPt: 3.5, distancePt: 0.9, angleDeg: 90 }
  }, {
    layeredStackIndex: index,
    layeredStackDirection: direction,
    layeredStackTapered: tapered,
    ...extraSource
  });
}

function layeredStackFreeform(direction = "stack") {
  if (direction === "top-wide") {
    return {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0.86, y: 1 },
        { x: 0.14, y: 1 }
      ],
      closePath: true
    };
  }
  return {
    points: [
      { x: 0.14, y: 0 },
      { x: 0.86, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ],
    closePath: true
  };
}

function layeredStackDirection(image = {}, nodes = []) {
  const text = [
    image?.source?.layer?.templateFamily,
    image?.source?.layer?.diagramUnderstanding?.archetype,
    image?.source?.componentRenderStrategy?.bestCandidate?.title,
    image?.source?.componentRenderStrategy?.bestCandidate?.description
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  if (/funnel|漏斗/.test(text)) return "top-wide";
  if (/pyramid|金字塔/.test(text)) return "bottom-wide";
  if (nodes.length >= 2) {
    const first = nodes[0].box.w;
    const last = nodes[nodes.length - 1].box.w;
    if (first > last * 1.14) return "top-wide";
    if (last > first * 1.14) return "bottom-wide";
  }
  return "stack";
}

function layeredStackUsesTaperedLayers(image = {}, nodes = []) {
  const direction = layeredStackDirection(image, nodes);
  if (direction !== "stack") return true;
  const widths = nodes.map((node) => node.box.w).filter(Number.isFinite);
  if (widths.length < 3) return false;
  return Math.max(...widths) / Math.max(1, Math.min(...widths)) >= 1.18;
}

function layeredStackDefaultMotif(image = {}) {
  const text = [
    image?.source?.layer?.templateFamily,
    image?.source?.layer?.diagramUnderstanding?.archetype,
    image?.source?.componentRenderStrategy?.bestCandidate?.title,
    image?.source?.componentRenderStrategy?.bestCandidate?.description
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  if (/funnel|漏斗/.test(text)) return "funnel";
  if (/pyramid|金字塔/.test(text)) return "pyramid";
  return "layered-stack";
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

function chartShapes(image = {}, match = {}, family = "chart", slideSize = DEFAULT_SLIDE) {
  const box = safeBox(image.box, slideSize);
  if (!box) return [];
  const palette = paletteFromMatch(match, {
    accents: ["#2563EB", "#F97316", "#22C55E", "#0EA5E9"],
    neutral: "#94A3B8",
    softFills: ["#DBEAFE", "#FFEDD5", "#DCFCE7", "#E0F2FE"]
  });
  const guided = templateGuidedChartShapes(image, match, box, family, palette, slideSize);
  if (guided.length > 0) return guided;
  return [];
}

function templateGuidedChartShapes(image = {}, match = {}, targetBox = {}, family = "chart", palette = {}, slideSize = DEFAULT_SLIDE) {
  const children = selectTemplateChartChildren(match, targetBox, family, slideSize);
  const minChildren = family === "pie-chart" ? 2 : 3;
  if (children.length < minChildren) return [];
  return children.map((child, index) => {
    const type = chartNativeTypeForChild(child, family);
    return nativeShape(
      image,
      match,
      chartPartForFamily(family),
      index,
      type,
      child.box,
      mergeTemplateStyle(child.style, chartFallbackStyle(family, index, type, palette)),
      {
        ...templateGuidedChildSource(child, "component-chart-child-layout"),
        chartTemplateFamily: family,
        chartTemplateMotif: chartMotifForFamily(family),
        chartSegmentIndex: index,
        chartTemplateSource: "plugin-child-layout"
      }
    );
  }).map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function selectTemplateChartChildren(match = {}, targetBox = {}, family = "chart", slideSize = DEFAULT_SLIDE) {
  const replayChildren = Array.isArray(match.replayChildLayout?.children) ? match.replayChildLayout.children : [];
  const children = replayChildren.length >= 4
    ? replayChildren
    : Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  return children
    .map((child, index) => ({
      index,
      kind: safeText(child?.kind).toLowerCase(),
      relativeBox: child?.box,
      box: scaleRelativeBox(child?.box, targetBox, slideSize),
      style: child?.style || {}
    }))
    .filter((child) => child.kind === "shape")
    .filter((child) => isReusableAppliedChildBox(child.relativeBox))
    .filter((child) => child.box && child.box.w > 4 && child.box.h > 4)
    .filter((child) => isChartChildForFamily(child, family, targetBox))
    .sort((a, b) => a.index - b.index)
    .slice(0, 36);
}

function isChartChildForFamily(child = {}, family = "chart", targetBox = {}) {
  const relative = child.relativeBox || {};
  const w = Math.max(0, Number(relative.w || 0));
  const h = Math.max(0, Number(relative.h || 0));
  const area = w * h;
  const shapeType = safeText(child.style?.shapeType).toLowerCase();
  const aspect = Math.max(w, h) / Math.max(0.001, Math.min(w, h));
  if (area <= 0.002 || area >= 0.82) return false;
  if (/line|connector|brace|bracket/.test(shapeType)) return false;
  if (family === "treemap-chart") {
    if (/arrow|chevron|triangle|arc|circular/.test(shapeType)) return false;
    return area >= 0.015 && child.box.w >= targetBox.w * 0.035 && child.box.h >= targetBox.h * 0.035;
  }
  if (family === "scatter-chart") {
    return /ellipse|oval/.test(shapeType) || (aspect <= 1.45 && area <= 0.18);
  }
  if (family === "donut-chart") {
    return /donut|blockarc|arc|circulararrow|ellipse|oval/.test(shapeType) || (aspect <= 1.5 && area <= 0.42);
  }
  if (family === "pie-chart") {
    return /pie|blockarc|arc|donut|circulararrow/.test(shapeType) || (aspect <= 1.7 && area <= 0.5);
  }
  return false;
}

function chartNativeTypeForChild(child = {}, family = "chart") {
  if (family === "treemap-chart") return nativeTypeForTemplateStyle(child.style, "rect");
  if (family === "scatter-chart") return nativeTypeForTemplateStyle(child.style, "ellipse");
  if (family === "donut-chart") return nativeTypeForTemplateStyle(child.style, "donut");
  if (family === "pie-chart") return nativeTypeForTemplateStyle(child.style, "blockarc");
  return nativeTypeForTemplateStyle(child.style, "rect");
}

function chartPartForFamily(family = "chart") {
  if (family === "treemap-chart") return "chart-treemap-tile";
  if (family === "scatter-chart") return "chart-bubble";
  if (family === "donut-chart") return "chart-donut-segment";
  if (family === "pie-chart") return "chart-pie-segment";
  return "chart-child";
}

function chartMotifForFamily(family = "chart") {
  if (family === "treemap-chart") return "treemap-chart";
  if (family === "scatter-chart") return "bubble-scatter-chart";
  if (family === "donut-chart") return "donut-segment-chart";
  if (family === "pie-chart") return "pie-share-chart";
  return "";
}

function chartFallbackStyle(family = "chart", index = 0, type = "rect", palette = {}) {
  const accent = palette.accents?.[index % Math.max(1, palette.accents.length)] || "#2563EB";
  const fill = palette.softFills?.[index % Math.max(1, palette.softFills.length)] || accent;
  if (family === "treemap-chart") {
    return { fill, stroke: "#FFFFFF", strokeWidthPt: 1.2, radiusRatio: type === "roundRect" ? 0.04 : 0 };
  }
  if (family === "scatter-chart") {
    return { fill: accent, stroke: "#FFFFFF", strokeWidthPt: 1, opacity: 0.88 };
  }
  if (family === "donut-chart" || family === "pie-chart") {
    return { fill: accent, stroke: "#FFFFFF", strokeWidthPt: 1, radiusRatio: 0 };
  }
  return { fill, stroke: palette.neutral || "#94A3B8", strokeWidthPt: 0.9 };
}

function learnedComponentReplayShapes(image = {}, match = {}, family = "component", slideSize = DEFAULT_SLIDE) {
  const box = safeBox(image.box, slideSize);
  if (!box) return [];
  const palette = paletteFromMatch(match, {
    accents: ["#2563EB", "#F97316", "#22C55E", "#0EA5E9"],
    neutral: "#94A3B8",
    softFills: ["#DBEAFE", "#FFEDD5", "#DCFCE7", "#E0F2FE"]
  });
  const children = selectLearnedReplayChildren(match, box, family, slideSize);
  const minChildren = family === "venn-overlap" ? 2 : 3;
  if (children.length < minChildren) return [];
  return children.map((child, index) => {
    const type = learnedReplayNativeType(child, family);
    const part = learnedReplayPartForFamily(family, child, type);
    return nativeShape(
      image,
      match,
      part,
      index,
      type,
      child.box,
      mergeTemplateStyle(child.style, learnedReplayFallbackStyle(family, index, type, palette)),
      {
        ...templateGuidedChildSource(child, "component-learned-child-layout"),
        componentTemplateFamily: family,
        componentTemplateMotif: learnedReplayMotifForFamily(family),
        learnedComponentReplay: true,
        learnedComponentReplayKind: child.kind,
        learnedComponentReplaySource: "plugin-child-layout"
      }
    );
  }).map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function selectLearnedReplayChildren(match = {}, targetBox = {}, family = "component", slideSize = DEFAULT_SLIDE) {
  const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  return children
    .map((child, index) => ({
      index,
      kind: safeText(child?.kind).toLowerCase(),
      relativeBox: child?.box,
      box: scaleRelativeBox(child?.box, targetBox, slideSize),
      style: child?.style || {}
    }))
    .filter((child) => child.kind === "shape" || child.kind === "connector" || child.kind === "text")
    .filter((child) => isReusableAppliedChildBox(child.relativeBox))
    .filter((child) => child.box && child.box.w > 3 && child.box.h > 3)
    .filter((child) => isLearnedReplayChildForFamily(child, family))
    .sort((a, b) => learnedReplayLayerOrder(a, b, family))
    .slice(0, 60);
}

function isLearnedReplayChildForFamily(child = {}, family = "component") {
  const relative = child.relativeBox || {};
  const w = Math.max(0, Number(relative.w || 0));
  const h = Math.max(0, Number(relative.h || 0));
  const area = w * h;
  const shapeType = safeText(child.style?.shapeType).toLowerCase();
  if (area <= 0.0008 || area >= 0.9) return false;
  if (family === "venn-overlap") {
    return child.kind === "shape" && (/ellipse|oval|freeform/.test(shapeType) || (area >= 0.08 && area <= 0.45));
  }
  if (family === "concentric-circles") {
    return child.kind === "shape" && (/donut|ellipse|oval|blockarc|arc|circulararrow/.test(shapeType) || (area >= 0.035 && area <= 0.65));
  }
  if (family === "fishbone-cause-effect") {
    return child.kind === "connector"
      || /line|arrow|connector|triangle|chevron/.test(shapeType)
      || (child.kind === "shape" && area >= 0.008 && area <= 0.22);
  }
  if (family === "sankey-flow-chart") {
    return /freeform|blockarc|arc|chevron|parallelogram|rect|roundrect|line/.test(shapeType) || child.kind === "connector";
  }
  if (family === "map-chart") {
    return child.kind === "shape" && (/freeform|rect|roundrect|parallelogram|hexagon|diamond/.test(shapeType) || area >= 0.01);
  }
  if (family === "word-cloud-chart") {
    return child.kind === "text"
      || Boolean(child.style?.text)
      || (child.kind === "shape" && area >= 0.002 && area <= 0.28);
  }
  if (family === "waterfall-chart") {
    return /rect|roundrect|line|connector/.test(shapeType) || child.kind === "connector";
  }
  if (family === "gauge-chart") {
    return /arc|blockarc|donut|circulararrow|line|triangle|ellipse|oval/.test(shapeType) || child.kind === "connector";
  }
  if (family === "radar-chart") {
    return /line|triangle|freeform|ellipse|oval|rect|diamond/.test(shapeType) || child.kind === "connector";
  }
  return false;
}

function learnedReplayLayerOrder(a = {}, b = {}, family = "component") {
  const layerA = learnedReplayRoleLayer(a, family);
  const layerB = learnedReplayRoleLayer(b, family);
  if (layerA !== layerB) return layerA - layerB;
  return Number(a.index || 0) - Number(b.index || 0);
}

function learnedReplayRoleLayer(child = {}, family = "component") {
  const shapeType = safeText(child.style?.shapeType).toLowerCase();
  if (family === "venn-overlap" || family === "concentric-circles") {
    if (/ellipse|oval|donut|blockarc|arc|circulararrow|freeform/.test(shapeType)) return 0;
    return 1;
  }
  if (child.kind === "connector" || /line|connector/.test(shapeType)) return 0;
  return 1;
}

function learnedReplayNativeType(child = {}, family = "component") {
  if (child.kind === "connector") return "line";
  if (family === "venn-overlap") return nativeTypeForTemplateStyle(child.style, "ellipse");
  if (family === "concentric-circles") return nativeTypeForTemplateStyle(child.style, "donut");
  if (family === "fishbone-cause-effect") return nativeTypeForTemplateStyle(child.style, /line|connector/.test(safeText(child.style?.shapeType).toLowerCase()) ? "line" : "roundRect");
  if (family === "sankey-flow-chart") return nativeTypeForTemplateStyle(child.style, "freeform");
  if (family === "map-chart") return nativeTypeForTemplateStyle(child.style, "freeform");
  if (family === "word-cloud-chart") return nativeTypeForTemplateStyle(child.style, "rect");
  if (family === "waterfall-chart") return nativeTypeForTemplateStyle(child.style, "rect");
  if (family === "gauge-chart") return nativeTypeForTemplateStyle(child.style, "blockarc");
  if (family === "radar-chart") return nativeTypeForTemplateStyle(child.style, "line");
  return nativeTypeForTemplateStyle(child.style, "rect");
}

function learnedReplayPartForFamily(family = "component", child = {}, type = "rect") {
  if (family === "venn-overlap") return "venn-lobe";
  if (family === "concentric-circles") return "concentric-ring";
  if (family === "fishbone-cause-effect") return type === "line" ? "fishbone-spine" : "fishbone-cause-node";
  if (family === "sankey-flow-chart") return type === "line" ? "sankey-link" : "sankey-flow-band";
  if (family === "map-chart") return "map-region";
  if (family === "word-cloud-chart") return "word-cloud-token";
  if (family === "waterfall-chart") return type === "line" ? "waterfall-connector" : "waterfall-bar";
  if (family === "gauge-chart") return /line|triangle/.test(type) ? "gauge-pointer" : "gauge-arc";
  if (family === "radar-chart") return type === "line" ? "radar-axis" : "radar-mark";
  return "component-child";
}

function learnedReplayMotifForFamily(family = "component") {
  if (family === "venn-overlap") return "venn-overlap";
  if (family === "concentric-circles") return "concentric-circles";
  if (family === "fishbone-cause-effect") return "fishbone-cause";
  if (family === "sankey-flow-chart") return "sankey-flow-chart";
  if (family === "map-chart") return "map-chart";
  if (family === "word-cloud-chart") return "word-cloud-chart";
  if (family === "waterfall-chart") return "waterfall-chart";
  if (family === "gauge-chart") return "gauge-chart";
  if (family === "radar-chart") return "radar-chart";
  return "";
}

function learnedReplayFallbackStyle(family = "component", index = 0, type = "rect", palette = {}) {
  const accent = palette.accents?.[index % Math.max(1, palette.accents.length)] || "#2563EB";
  const fill = palette.softFills?.[index % Math.max(1, palette.softFills.length)] || accent;
  if (type === "line") return { fill: "none", stroke: accent, strokeWidthPt: 1.2, connectorType: "straight" };
  if (family === "venn-overlap") return { fill: accent, stroke: "#FFFFFF", strokeWidthPt: 1, opacity: 0.42 };
  if (family === "concentric-circles") return { fill: "none", stroke: accent, strokeWidthPt: 2.2, opacity: 0.9 };
  if (family === "fishbone-cause-effect") return { fill, stroke: accent, strokeWidthPt: 1, radiusRatio: 0.1 };
  if (family === "sankey-flow-chart") return { fill: accent, stroke: "none", strokeWidthPt: 0, opacity: 0.72 };
  if (family === "map-chart") return { fill, stroke: "#FFFFFF", strokeWidthPt: 0.75, opacity: 0.9 };
  if (family === "word-cloud-chart") return {
    fill: "none",
    stroke: "none",
    strokeWidthPt: 0,
    text: {
      placeholderText: "关键词",
      fontSizePt: 18,
      color: accent,
      family: "Microsoft YaHei",
      align: "center",
      valign: "middle"
    }
  };
  if (family === "waterfall-chart") return { fill: accent, stroke: "#FFFFFF", strokeWidthPt: 0.8 };
  if (family === "gauge-chart") return { fill: accent, stroke: "#FFFFFF", strokeWidthPt: 1, opacity: 0.9 };
  if (family === "radar-chart") return { fill: "none", stroke: accent, strokeWidthPt: 1 };
  return { fill, stroke: palette.neutral || "#94A3B8", strokeWidthPt: 0.9 };
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

function boxOverlapArea(a = {}, b = {}) {
  const left = Math.max(Number(a.x || 0), Number(b.x || 0));
  const top = Math.max(Number(a.y || 0), Number(b.y || 0));
  const right = Math.min(Number(a.x || 0) + Number(a.w || 0), Number(b.x || 0) + Number(b.w || 0));
  const bottom = Math.min(Number(a.y || 0) + Number(a.h || 0), Number(b.y || 0) + Number(b.h || 0));
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function unionBox(boxes = []) {
  const valid = boxes.filter((box) => box && Number(box.w || 0) > 0 && Number(box.h || 0) > 0);
  if (valid.length === 0) return null;
  const left = Math.min(...valid.map((box) => Number(box.x || 0)));
  const top = Math.min(...valid.map((box) => Number(box.y || 0)));
  const right = Math.max(...valid.map((box) => Number(box.x || 0) + Number(box.w || 0)));
  const bottom = Math.max(...valid.map((box) => Number(box.y || 0) + Number(box.h || 0)));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function isInsideUnitBox(box = {}) {
  if (!box || typeof box !== "object") return false;
  const x = Number(box.x);
  const y = Number(box.y);
  const w = Number(box.w);
  const h = Number(box.h);
  if (![x, y, w, h].every(Number.isFinite)) return false;
  return w > 0 && h > 0 && x >= -0.05 && y >= -0.05 && x + w <= 1.05 && y + h <= 1.05;
}

function scaleRelativeBox(relative = {}, targetBox = {}, slideSize = DEFAULT_SLIDE) {
  if (!relative || typeof relative !== "object") return null;
  return clampBox({
    x: targetBox.x + Number(relative.x || 0) * targetBox.w,
    y: targetBox.y + Number(relative.y || 0) * targetBox.h,
    w: Number(relative.w || 0) * targetBox.w,
    h: Number(relative.h || 0) * targetBox.h
  }, slideSize);
}

function isUsefulTemplateNodeBox(box, targetBox) {
  if (!box || box.w <= 4 || box.h <= 4) return false;
  const areaRatio = (box.w * box.h) / Math.max(1, targetBox.w * targetBox.h);
  const widthRatio = box.w / Math.max(1, targetBox.w);
  const heightRatio = box.h / Math.max(1, targetBox.h);
  return areaRatio >= 0.003
    && areaRatio <= 0.22
    && widthRatio >= 0.025
    && heightRatio >= 0.025
    && widthRatio <= 0.68
    && heightRatio <= 0.68;
}

function boxCenter(box = {}) {
  return {
    x: Number(box.x || 0) + Number(box.w || 0) / 2,
    y: Number(box.y || 0) + Number(box.h || 0) / 2
  };
}

function distance(a, b) {
  return Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.y || 0) - Number(b.y || 0));
}

function angleAround(center, point) {
  return Math.atan2(Number(point.y || 0) - Number(center.y || 0), Number(point.x || 0) - Number(center.x || 0));
}

function lineBoxBetween(aBox = {}, bBox = {}) {
  const a = boxCenter(aBox);
  const b = boxCenter(bBox);
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.max(0.1, Math.abs(b.x - a.x)),
    h: Math.max(0.1, Math.abs(b.y - a.y))
  };
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

function hubSpokeConnectorMetadata(nodeIndex, centerBox = {}, nodeBox = {}) {
  const center = boxCenter(centerBox);
  const node = boxCenter(nodeBox);
  return {
    connectorSemantic: "hub-spoke",
    fromNodeIndex: "center",
    toNodeIndex: nodeIndex,
    fromAnchor: radialAnchor(center, node),
    toAnchor: radialAnchor(node, center),
    connectorAxis: "radial"
  };
}

function anchorAxisBetween(fromBox = {}, toBox = {}) {
  const from = boxCenter(fromBox);
  const to = boxCenter(toBox);
  return Math.abs(to.y - from.y) > Math.abs(to.x - from.x) * 1.2 ? "vertical" : "horizontal";
}

function radialAnchor(from = {}, to = {}) {
  const dx = Number(to.x || 0) - Number(from.x || 0);
  const dy = Number(to.y || 0) - Number(from.y || 0);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

function cycleLoopShapes(image = {}, match = {}, slideSize = DEFAULT_SLIDE) {
  const box = safeBox(image.box, slideSize);
  if (!box) return [];
  const palette = paletteFromMatch(match, {
    accents: ["#2563EB", "#16A34A", "#F97316", "#0EA5E9"],
    neutral: "#93A4BA",
    softFills: ["#EAF3FF", "#ECFDF5", "#FFF7ED", "#E0F2FE"]
  });
  const guidedCycle = templateGuidedCycleLoopShapes(image, match, box, palette, slideSize);
  if (guidedCycle.length > 0) return guidedCycle;
  const visualCycle = cycleLoopShapesFromVisualNodes(image, match, box, palette, slideSize);
  if (visualCycle.length > 0) return visualCycle;
  const count = cycleLoopItemCount(image, match);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const radiusX = box.w * 0.34;
  const radiusY = box.h * 0.32;
  const arcW = Math.max(54, box.w * 0.58);
  const arcH = Math.max(54, box.h * 0.56);
  const nodeW = Math.max(46, Math.min(96, box.w * 0.18));
  const nodeH = Math.max(24, Math.min(44, box.h * 0.12));
  const fidelityOverlay = isFidelityCropOverlay(image);
  const shapes = [];

  for (let index = 0; index < count; index += 1) {
    const angleDeg = -90 + (360 * index / count);
    const angle = angleDeg * Math.PI / 180;
    const stroke = palette.accents[index % palette.accents.length];
    const connector = resolveConnectorComponent({ role: "cycle-fixed", stroke, strokeWidthPt: 2.1 });
    shapes.push(nativeShape(image, match, "cycle-ring-segment", index, "arc", {
      x: cx - arcW / 2,
      y: cy - arcH / 2,
      w: arcW,
      h: arcH
    }, {
      ...connector.style,
      fill: "none",
      rotationDeg: angleDeg,
      adjustments: [0.08, 0.76]
    }, {
      ...connector.source,
      cycleLoopItemCount: count,
      cycleLoopAngleDeg: angleDeg,
      semanticConnector: {
        fromId: `cycle-node-${index}`,
        toId: `cycle-node-${(index + 1) % count}`,
        direction: "forward",
        axis: "free"
      }
    }));

    const nodeCx = cx + Math.cos(angle) * radiusX;
    const nodeCy = cy + Math.sin(angle) * radiusY;
    shapes.push(nativeShape(image, match, "cycle-node", index, "roundRect", {
      x: nodeCx - nodeW / 2,
      y: nodeCy - nodeH / 2,
      w: nodeW,
      h: nodeH
    }, fidelityOverlay ? fidelityOverlayShellStyle({
      fill: "none",
      stroke,
      strokeWidthPt: 1.05,
      radiusRatio: 0.42
    }) : {
      fill: palette.softFills[index % palette.softFills.length],
      stroke,
      strokeWidthPt: 1.05,
      radiusRatio: 0.42,
      shadow: { color: "#1F2937", alpha: 0.10, blurPt: 4.2, distancePt: 1.1, angleDeg: 90 }
    }, {
      cycleLoopItemCount: count,
      cycleLoopAngleDeg: angleDeg
    }));
  }

  const centerW = Math.max(80, Math.min(box.w * 0.26, arcW * 0.44));
  const centerH = Math.max(36, Math.min(box.h * 0.16, arcH * 0.30));
  shapes.push(nativeShape(image, match, "cycle-center", 0, "roundRect", {
    x: cx - centerW / 2,
    y: cy - centerH / 2,
    w: centerW,
    h: centerH
  }, fidelityOverlay ? fidelityOverlayShellStyle({
    fill: "none",
    stroke: palette.neutral,
    strokeWidthPt: 0.95,
    radiusRatio: 0.28
  }) : {
    fill: "#FFFFFF",
    stroke: palette.neutral,
    strokeWidthPt: 0.95,
    radiusRatio: 0.28,
    shadow: { color: "#1F2937", alpha: 0.08, blurPt: 5, distancePt: 1.2, angleDeg: 90 }
  }, {
    cycleLoopItemCount: count,
    cycleLoopAngleDeg: 0
  }));

  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function templateGuidedCycleLoopShapes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE) {
  const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  if (children.length === 0) return [];
  const mapped = children
    .map((child, index) => ({
      child,
      index,
      kind: String(child?.kind || ""),
      role: appliedChildStructureRole(child),
      box: scaleRelativeBox(child?.box, targetBox, slideSize),
      style: child?.style || {}
    }))
    .filter((item) => item.kind === "shape" && item.box);
  const arcChildren = mapped.filter((item) => isCycleLoopTemplateArcChild(item, targetBox));
  if (arcChildren.length === 0) return [];

  const nodeChildren = mapped
    .filter((item) => item.role === "node")
    .filter((item) => !arcChildren.some((arc) => arc.index === item.index))
    .filter((item) => isUsefulTemplateNodeBox(item.box, targetBox))
    .slice(0, 8);
  const shapes = [];
  arcChildren.slice(0, 12).forEach((item, arcIndex) => {
    const stroke = safeColorOrNone(item.style.stroke) || palette.accents?.[arcIndex % Math.max(1, palette.accents.length)] || "#2563EB";
    const fill = safeColorOrNone(item.style.fill) || (nativeTypeForTemplateStyle(item.style, "circularArrow") === "circulararrow" ? stroke : "none");
    shapes.push(nativeShape(image, match, "cycle-ring-segment", arcIndex, nativeTypeForTemplateStyle(item.style, "circularArrow"), item.box, mergeTemplateStyle(item.style, {
      fill,
      stroke,
      strokeWidthPt: 2.2,
      adjustments: [0.08, 0.76]
    }), {
      appliedPluginChildIndex: item.index,
      appliedPluginStructureRole: item.role,
      appliedPluginShapeType: safeText(item.style.shapeType),
      componentTemplateExactChildShape: true,
      layoutPreservation: "component-child-layout"
    }));
  });
  nodeChildren.forEach((item, nodeIndex) => {
    const stroke = palette.accents?.[nodeIndex % Math.max(1, palette.accents.length)] || "#2563EB";
    shapes.push(nativeShape(image, match, "cycle-node", nodeIndex, nativeTypeForTemplateStyle(item.style, "roundRect"), item.box, mergeTemplateStyle(item.style, {
      fill: palette.softFills?.[nodeIndex % Math.max(1, palette.softFills.length)] || "#EAF3FF",
      stroke,
      strokeWidthPt: 1.05,
      radiusRatio: 0.42,
      shadow: { color: "#1F2937", alpha: 0.10, blurPt: 4.2, distancePt: 1.1, angleDeg: 90 }
    }), {
      appliedPluginChildIndex: item.index,
      appliedPluginStructureRole: item.role,
      componentTemplateExactChildShape: true,
      layoutPreservation: "component-child-layout"
    }));
  });
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function isCycleLoopTemplateArcChild(item = {}, targetBox = {}) {
  const styleType = String(item.style?.shapeType || "").toLowerCase();
  if (!/arc|blockarc|circular|arrow/.test(styleType)) return false;
  const box = item.box || {};
  const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, Number(targetBox.w || 0) * Number(targetBox.h || 0));
  if (areaRatio < 0.004 || areaRatio > 0.92) return false;
  if (Number(box.w || 0) < 12 || Number(box.h || 0) < 12) return false;
  return true;
}

function cycleLoopShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE) {
  const nodes = treeVisualNodes(image, targetBox, slideSize);
  if (nodes.length < 4) return [];
  const targetCenter = boxCenter(targetBox);
  const centerCandidate = nodes
    .map((node) => ({ node, distance: distance(boxCenter(node.box), targetCenter) }))
    .sort((a, b) => a.distance - b.distance)[0]?.node || null;
  const centerBox = centerCandidate && centerCandidate.box.w * centerCandidate.box.h <= targetBox.w * targetBox.h * 0.12
    ? centerCandidate.box
    : null;
  const centerPoint = centerBox ? boxCenter(centerBox) : targetCenter;
  const peripheralCandidates = nodes
    .filter((node) => node !== centerCandidate || !centerBox)
    .filter((node) => distance(boxCenter(node.box), centerPoint) >= Math.min(targetBox.w, targetBox.h) * 0.18)
    .slice(0, 12);
  const visualOrder = visualCycleNodeOrder(image, peripheralCandidates, centerPoint);
  const peripherals = visualOrder
    ? visualOrder.nodes.slice(0, 8)
    : peripheralCandidates
      .sort((a, b) => angleAround(centerPoint, boxCenter(a.box)) - angleAround(centerPoint, boxCenter(b.box)))
      .slice(0, 8);
  if (peripherals.length < 3) return [];
  const edgeByNodeId = visualOrder?.edgeByNodeId || new Map();

  const peripheralCenters = peripherals.map((node) => boxCenter(node.box));
  const left = Math.min(...peripheralCenters.map((point) => point.x));
  const right = Math.max(...peripheralCenters.map((point) => point.x));
  const top = Math.min(...peripheralCenters.map((point) => point.y));
  const bottom = Math.max(...peripheralCenters.map((point) => point.y));
  const arcBox = clampBox({
    x: left - Math.max(18, (right - left) * 0.12),
    y: top - Math.max(18, (bottom - top) * 0.12),
    w: Math.max(54, (right - left) * 1.24),
    h: Math.max(54, (bottom - top) * 1.24)
  }, slideSize);
  const shapes = [];
  peripherals.forEach((node, index) => {
    const current = boxCenter(node.box);
    const edge = edgeByNodeId.get(node.id) || null;
    const angleDeg = angleAround(centerPoint, current) * 180 / Math.PI;
    const stroke = palette.accents?.[index % Math.max(1, palette.accents.length)] || "#2563EB";
    const connector = resolveConnectorComponent({ role: "cycle-fixed", stroke, strokeWidthPt: 2.1 });
    shapes.push(nativeShape(image, match, "cycle-ring-segment", index, "arc", arcBox, {
      ...connector.style,
      fill: "none",
      rotationDeg: angleDeg,
      adjustments: [0.08, 0.76]
    }, {
      ...connector.source,
      cycleLoopItemCount: peripherals.length,
      cycleLoopAngleDeg: angleDeg,
      sourceVisualConnectorId: edge?.id,
      sourceVisualNodeId: node.id,
      semanticConnector: { fromId: node.id, toId: peripherals[(index + 1) % peripherals.length].id, direction: "forward", axis: "free" },
      layoutPreservation: "visual-node"
    }));
    shapes.push(nativeShape(image, match, "cycle-node", index, "roundRect", node.box, {
      fill: palette.softFills?.[index % Math.max(1, palette.softFills.length)] || "#EAF3FF",
      stroke,
      strokeWidthPt: 1.05,
      radiusRatio: 0.42,
      shadow: { color: "#1F2937", alpha: 0.10, blurPt: 4.2, distancePt: 1.1, angleDeg: 90 }
    }, {
      cycleLoopItemCount: peripherals.length,
      cycleLoopAngleDeg: angleDeg,
      sourceVisualNodeId: node.id,
      layoutPreservation: "visual-node"
    }));
  });

  const fallbackCenterW = Math.max(70, Math.min(targetBox.w * 0.24, arcBox.w * 0.40));
  const fallbackCenterH = Math.max(32, Math.min(targetBox.h * 0.15, arcBox.h * 0.28));
  shapes.push(nativeShape(image, match, "cycle-center", 0, "roundRect", centerBox || {
    x: centerPoint.x - fallbackCenterW / 2,
    y: centerPoint.y - fallbackCenterH / 2,
    w: fallbackCenterW,
    h: fallbackCenterH
  }, {
    fill: "#FFFFFF",
    stroke: palette.neutral || "#93A4BA",
    strokeWidthPt: 0.95,
    radiusRatio: 0.28,
    shadow: { color: "#1F2937", alpha: 0.08, blurPt: 5, distancePt: 1.2, angleDeg: 90 }
  }, {
    cycleLoopItemCount: peripherals.length,
    cycleLoopAngleDeg: 0,
    ...(centerCandidate ? { sourceVisualNodeId: centerCandidate.id } : {}),
    layoutPreservation: "visual-node"
  }));
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function cycleLoopItemCount(image = {}, match = {}) {
  const strategy = image?.source?.componentRenderStrategy || {};
  const candidate = strategy.bestCandidate || {};
  const text = `${candidate.title || ""} ${candidate.description || ""} ${match.id || ""} ${match.name || ""}`;
  const explicit = String(text).match(/(?:^|[^\d])([3-8])\s*(?:项|步|环|node|nodes|steps?)/i);
  if (explicit) return clampInteger(explicit[1], 3, 8);
  return clampInteger(match.itemCount || match.childCount || match.shapeCount || match.connectorCount || image?.source?.layer?.diagramUnderstanding?.nodeCount || 6, 3, 8);
}

function hubSpokeShapes(image = {}, match = {}, slideSize = DEFAULT_SLIDE) {
  const box = safeBox(image.box, slideSize);
  if (!box) return [];
  const palette = paletteFromMatch(match, {
    accents: ["#2F80ED", "#22A76B", "#F97316"],
    neutral: "#94A3B8",
    softFills: ["#EAF3FF", "#F0FDF4", "#FFF7ED"]
  });
  if (componentTemplateTargetMotifs(image, match).includes("tree-link")) {
    const tree = treeLinkShapes(image, match, box, palette, slideSize);
    if (tree.length > 0) return tree;
  }
  const visualHub = hubSpokeShapesFromVisualNodes(image, match, box, palette, slideSize);
  if (visualHub.length > 0) return visualHub;
  const guided = templateGuidedHubSpokeShapes(image, match, box, palette, slideSize);
  if (guided.length > 0) return guided;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const spokeCount = clampInteger(match.connectorCount || match.childCount || 6, 4, 8);
  const radiusX = box.w * 0.36;
  const radiusY = box.h * 0.34;
  const nodeW = Math.max(34, Math.min(76, box.w * 0.16));
  const nodeH = Math.max(24, Math.min(52, box.h * 0.13));
  const centerBox = { x: cx - nodeW * 0.62, y: cy - nodeH * 0.62, w: nodeW * 1.24, h: nodeH * 1.24 };
  const shapes = [
    nativeShape(image, match, "hub-center", 0, "ellipse", centerBox, {
      fill: palette.softFills[0],
      stroke: palette.accents[0],
      strokeWidthPt: 1.2
    })
  ];
  for (let index = 0; index < spokeCount; index += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index / spokeCount);
    const nx = cx + Math.cos(angle) * radiusX;
    const ny = cy + Math.sin(angle) * radiusY;
    const nodeBox = {
      x: nx - nodeW / 2,
      y: ny - nodeH / 2,
      w: nodeW,
      h: nodeH
    };
    shapes.push(nativeShape(image, match, "hub-spoke", index, "line", {
      x: Math.min(cx, nx),
      y: Math.min(cy, ny),
      w: Math.max(0.1, Math.abs(nx - cx)),
      h: Math.max(0.1, Math.abs(ny - cy))
    }, {
      stroke: palette.neutral,
      strokeWidthPt: 1.0,
      connectorType: "straight"
    }, hubSpokeConnectorMetadata(index, centerBox, nodeBox)));
    shapes.push(nativeShape(image, match, "hub-node", index, "roundRect", nodeBox, {
      fill: palette.softFills[(index + 1) % palette.softFills.length],
      stroke: palette.accents[(index + 1) % palette.accents.length],
      strokeWidthPt: 0.95,
      radiusRatio: 0.20
    }));
  }
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function hubSpokeShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE) {
  const nodes = treeVisualNodes(image, targetBox, slideSize);
  if (nodes.length < 4) return [];
  const centerPoint = boxCenter(targetBox);
  const center = visualConnectorDegreeCenter(image, nodes) || nodes.reduce((best, node) => {
    const score = hubCenterScore(node, nodes, centerPoint);
    if (!best || score < best.score) return { node, score };
    return best;
  }, null)?.node;
  if (!center) return [];
  const visualEdges = visualConnectorsBetweenNodes(image, nodes, { max: 16 });
  const hubEdges = visualEdges
    .map((edge) => {
      if (edge.from.id === center.id) return { ...edge, hub: edge.from, node: edge.to };
      if (edge.to.id === center.id) return { ...edge, hub: edge.to, node: edge.from };
      return null;
    })
    .filter(Boolean);
  const connectedPeripheralIds = new Set(hubEdges.map((edge) => edge.node.id));
  const peripherals = (hubEdges.length >= 3
    ? hubEdges.map((edge) => edge.node)
    : nodes.filter((node) => node !== center))
    .filter((node) => node !== center)
    .sort((a, b) => angleAround(boxCenter(center.box), boxCenter(a.box)) - angleAround(boxCenter(center.box), boxCenter(b.box)))
    .slice(0, 9);
  if (peripherals.length < 3) return [];

  const shapes = [
    nativeShape(image, match, "hub-center", 0, "ellipse", center.box, {
      fill: palette.softFills?.[0] || "#EAF3FF",
      stroke: palette.accents?.[0] || "#2F80ED",
      strokeWidthPt: 1.2
    }, {
      sourceVisualNodeId: center.id,
      layoutPreservation: "visual-node"
    })
  ];
  peripherals.forEach((node, index) => {
    const edge = hubEdges.find((candidate) => candidate.node.id === node.id) || null;
    shapes.push(nativeShape(image, match, "hub-spoke", index, "line", lineBoxBetween(center.box, node.box), {
      stroke: palette.neutral || "#94A3B8",
      strokeWidthPt: 1.0,
      connectorType: "straight"
    }, {
      ...hubSpokeConnectorMetadata(index, center.box, node.box),
      sourceVisualConnectorId: edge?.id,
      sourceVisualNodeId: node.id,
      layoutPreservation: "visual-node"
    }));
    shapes.push(nativeShape(image, match, "hub-node", index, "roundRect", node.box, {
      fill: palette.softFills?.[(index + 1) % Math.max(1, palette.softFills.length)] || "#F0FDF4",
      stroke: palette.accents?.[(index + 1) % Math.max(1, palette.accents.length)] || "#22A76B",
      strokeWidthPt: 0.95,
      radiusRatio: 0.20
    }, {
      sourceVisualNodeId: node.id,
      layoutPreservation: "visual-node"
    }));
  });
  if (hubEdges.length >= 3 && connectedPeripheralIds.size !== peripherals.length) {
    image.source = {
      ...(image.source || {}),
      componentTemplateConnectorPartialReason: "visual connector graph had extra non-hub edges; hub shell kept center-linked spokes"
    };
  }
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function hubCenterScore(node = {}, nodes = [], targetCenter = {}) {
  const center = boxCenter(node.box);
  const targetDistance = distance(center, targetCenter);
  const averageDistance = nodes.reduce((sum, other) => {
    if (other === node) return sum;
    return sum + distance(center, boxCenter(other.box));
  }, 0) / Math.max(1, nodes.length - 1);
  return targetDistance * 0.65 + averageDistance * 0.35;
}

function treeLinkShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE) {
  const nodes = treeVisualNodes(image, targetBox, slideSize);
  if (nodes.length < 4) return [];
  const root = visualConnectorDegreeCenter(image, nodes) || nodes.reduce((best, node) => {
    if (!best) return node;
    const nodeCenter = boxCenter(node.box);
    const bestCenter = boxCenter(best.box);
    if (nodeCenter.y !== bestCenter.y) return nodeCenter.y < bestCenter.y ? node : best;
    return nodeCenter.x < bestCenter.x ? node : best;
  }, null);
  if (!root) return [];
  const children = nodes
    .filter((node) => node !== root)
    .sort((a, b) => boxCenter(a.box).y - boxCenter(b.box).y || boxCenter(a.box).x - boxCenter(b.box).x)
    .slice(0, 9);
  if (children.length < 3) return [];
  const visualEdges = visualConnectorsBetweenNodes(image, nodes, { max: 18 });
  const childIndexById = new Map(children.map((child, index) => [child.id, index]));
  const treeEdges = visualEdges
    .map((edge) => {
      const fromIsRoot = edge.from.id === root.id;
      const toIsRoot = edge.to.id === root.id;
      const child = fromIsRoot ? edge.to : toIsRoot ? edge.from : null;
      const childIndex = child ? childIndexById.get(child.id) : undefined;
      if (!child || childIndex === undefined) return null;
      return { ...edge, child, childIndex };
    })
    .filter(Boolean);
  const connectorChildren = treeEdges.length >= 1
    ? treeEdges
    : children.map((child, index) => ({ child, childIndex: index }));

  const shapes = [
    nativeShape(image, match, "tree-root", 0, "roundRect", root.box, {
      fill: palette.softFills?.[0] || "#EAF3FF",
      stroke: palette.accents?.[0] || "#2F80ED",
      strokeWidthPt: 1.15,
      radiusRatio: 0.2,
      shadow: { color: "#1F2937", alpha: 0.08, blurPt: 4, distancePt: 1.1, angleDeg: 90 }
    }, {
      sourceVisualNodeId: root.id,
      layoutPreservation: "visual-node"
    })
  ];

  connectorChildren.forEach((edge, index) => {
    const child = edge.child;
    const childIndex = edge.childIndex;
    const axis = anchorAxisBetween(root.box, child.box);
    shapes.push(nativeShape(image, match, "tree-connector", index, "line", lineBoxBetween(root.box, child.box), {
      stroke: palette.neutral || "#94A3B8",
      strokeWidthPt: 1.05,
      connectorType: "elbow",
      endArrow: "triangle"
    }, {
      connectorSemantic: "tree-link",
      fromNodeIndex: "root",
      toNodeIndex: childIndex,
      fromAnchor: axis === "vertical" ? "bottom" : "right",
      toAnchor: axis === "vertical" ? "top" : "left",
      connectorAxis: axis,
      sourceVisualConnectorId: edge.id,
      sourceVisualNodeId: child.id,
      layoutPreservation: "visual-node"
    }));
  });
  children.forEach((child, index) => {
    shapes.push(nativeShape(image, match, "tree-node", index, "roundRect", child.box, {
      fill: palette.softFills?.[(index + 1) % Math.max(1, palette.softFills.length)] || "#F0FDF4",
      stroke: palette.accents?.[(index + 1) % Math.max(1, palette.accents.length)] || "#22A76B",
      strokeWidthPt: 0.95,
      radiusRatio: 0.18
    }, {
      sourceVisualNodeId: child.id,
      layoutPreservation: "visual-node"
    }));
  });

  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function treeVisualNodes(image = {}, targetBox = {}, slideSize = DEFAULT_SLIDE) {
  const understanding = image?.source?.layer?.diagramUnderstanding || {};
  const rawNodes = Array.isArray(understanding.visualNodes) ? understanding.visualNodes : [];
  const candidates = rawNodes
    .map((node, index) => {
      const box = normalizeVisualNodeBox(node, targetBox, slideSize);
      if (!box || !isUsefulTemplateNodeBox(box, targetBox)) return null;
      return { id: node?.id || node?.nodeId || `visual-node-${index}`, box };
    })
    .filter(Boolean);
  const deduped = [];
  for (const node of candidates) {
    if (deduped.some((existing) => boxOverlapArea(existing.box, node.box) / Math.max(1, Math.min(existing.box.w * existing.box.h, node.box.w * node.box.h)) > 0.72)) {
      continue;
    }
    deduped.push(node);
  }
  return deduped;
}

function visualConnectorsBetweenNodes(image = {}, nodes = [], options = {}) {
  const understanding = image?.source?.layer?.diagramUnderstanding || {};
  const rawConnectors = Array.isArray(understanding.visualConnectors) ? understanding.visualConnectors : [];
  if (rawConnectors.length === 0 || nodes.length < 2) return [];
  const byId = new Map(nodes.map((node, index) => [String(node.id), { node, index }]));
  const max = clampInteger(options.max || rawConnectors.length, 1, 64);
  const result = [];
  const seen = new Set();
  for (const connector of rawConnectors) {
    const fromId = visualConnectorEndpointId(connector, ["from", "fromNodeId", "source", "sourceNodeId", "start", "startNodeId"]);
    const toId = visualConnectorEndpointId(connector, ["to", "toNodeId", "target", "targetNodeId", "end", "endNodeId"]);
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to || from.node.id === to.node.id) continue;
    const key = `${from.node.id}->${to.node.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: safeText(connector.id || connector.atomId || key),
      from: from.node,
      to: to.node,
      fromIndex: from.index,
      toIndex: to.index,
      axis: safeText(connector.axis),
      arrow: connector.arrow === true
    });
    if (result.length >= max) break;
  }
  return result;
}

function visualConnectorEndpointId(connector = {}, keys = []) {
  for (const key of keys) {
    const value = connector?.[key];
    if (value === null || value === undefined) continue;
    const text = String(value);
    if (text) return text;
  }
  return "";
}

function visualConnectorDegreeCenter(image = {}, nodes = []) {
  const edges = visualConnectorsBetweenNodes(image, nodes, { max: 64 });
  if (edges.length === 0) return null;
  const degree = new Map();
  edges.forEach((edge) => {
    degree.set(edge.from.id, (degree.get(edge.from.id) || 0) + 1);
    degree.set(edge.to.id, (degree.get(edge.to.id) || 0) + 1);
  });
  return nodes.reduce((best, node) => {
    const score = degree.get(node.id) || 0;
    if (!best || score > best.score) return { node, score };
    return best;
  }, null)?.score >= 2
    ? nodes.find((node) => node.id === Array.from(degree.entries()).sort((a, b) => b[1] - a[1])[0]?.[0])
    : null;
}

function visualCycleNodeOrder(image = {}, nodes = [], centerPoint = {}) {
  if (nodes.length < 3) return null;
  const edges = visualConnectorsBetweenNodes(image, nodes, { max: 32 });
  if (edges.length < Math.max(2, nodes.length - 1)) return null;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nextById = new Map();
  const incoming = new Map();
  for (const edge of edges) {
    if (!nodeIds.has(edge.from.id) || !nodeIds.has(edge.to.id)) continue;
    if (nextById.has(edge.from.id)) continue;
    nextById.set(edge.from.id, edge);
    incoming.set(edge.to.id, (incoming.get(edge.to.id) || 0) + 1);
  }
  if (nextById.size < Math.max(2, nodes.length - 1)) return null;
  const orderedByPosition = nodes
    .slice()
    .sort((a, b) => angleAround(centerPoint, boxCenter(a.box)) - angleAround(centerPoint, boxCenter(b.box)));
  const start = orderedByPosition.find((node) => !incoming.has(node.id)) || orderedByPosition[0];
  const ordered = [];
  const edgeByNodeId = new Map();
  const seen = new Set();
  let current = start;
  for (let guard = 0; guard < nodes.length; guard += 1) {
    if (!current || seen.has(current.id)) break;
    ordered.push(current);
    seen.add(current.id);
    const edge = nextById.get(current.id);
    if (!edge) break;
    edgeByNodeId.set(current.id, edge);
    current = edge.to;
  }
  if (ordered.length < 3) return null;
  for (const node of orderedByPosition) {
    if (!seen.has(node.id)) ordered.push(node);
  }
  return { nodes: ordered, edgeByNodeId };
}

function normalizeVisualNodeBox(node = {}, targetBox = {}, slideSize = DEFAULT_SLIDE) {
  const sourceBox = node?.box || node?.bounds || node?.rect || node?.bbox || null;
  if (!sourceBox || typeof sourceBox !== "object") return null;
  const rawBox = {
    x: Number(sourceBox.x),
    y: Number(sourceBox.y),
    w: Number(sourceBox.w ?? sourceBox.width),
    h: Number(sourceBox.h ?? sourceBox.height)
  };
  if (![rawBox.x, rawBox.y, rawBox.w, rawBox.h].every(Number.isFinite) || rawBox.w <= 0 || rawBox.h <= 0) {
    return null;
  }
  const absolute = isInsideUnitBox(rawBox) ? scaleRelativeBox(rawBox, targetBox, slideSize) : clampBox(rawBox, slideSize);
  if (!absolute) return null;
  const overlap = boxOverlapArea(absolute, targetBox);
  const area = Math.max(1, absolute.w * absolute.h);
  return overlap / area >= 0.45 ? absolute : null;
}

function treeLinkShapes(image = {}, match = {}, box = null, palette = {}, slideSize = DEFAULT_SLIDE) {
  const targetBox = box || safeBox(image.box, slideSize);
  if (!targetBox) return [];
  const visualTree = treeLinkShapesFromVisualNodes(image, match, targetBox, palette, slideSize);
  if (visualTree.length > 0) return visualTree;
  const childCount = clampInteger((match.childCount || match.connectorCount || 5) - 1, 3, 7);
  const rootW = Math.max(70, Math.min(150, targetBox.w * 0.24));
  const rootH = Math.max(30, Math.min(54, targetBox.h * 0.15));
  const childW = Math.max(54, Math.min(116, targetBox.w * 0.18));
  const childH = Math.max(26, Math.min(48, targetBox.h * 0.13));
  const rootBox = clampBox({
    x: targetBox.x + targetBox.w / 2 - rootW / 2,
    y: targetBox.y + targetBox.h * 0.08,
    w: rootW,
    h: rootH
  }, slideSize);
  const childY = targetBox.y + targetBox.h * 0.68;
  const usableW = targetBox.w * 0.88;
  const startX = targetBox.x + (targetBox.w - usableW) / 2;
  const gap = childCount <= 1 ? 0 : (usableW - childW * childCount) / (childCount - 1);
  const shapes = [
    nativeShape(image, match, "tree-root", 0, "roundRect", rootBox, {
      fill: palette.softFills?.[0] || "#EAF3FF",
      stroke: palette.accents?.[0] || "#2F80ED",
      strokeWidthPt: 1.15,
      radiusRatio: 0.2,
      shadow: { color: "#1F2937", alpha: 0.08, blurPt: 4, distancePt: 1.1, angleDeg: 90 }
    })
  ];
  for (let index = 0; index < childCount; index += 1) {
    const childBox = clampBox({
      x: startX + index * (childW + Math.max(8, gap)),
      y: childY,
      w: childW,
      h: childH
    }, slideSize);
    shapes.push(nativeShape(image, match, "tree-connector", index, "line", lineBoxBetween(rootBox, childBox), {
      stroke: palette.neutral || "#94A3B8",
      strokeWidthPt: 1.05,
      connectorType: "elbow",
      endArrow: "triangle"
    }, {
      connectorSemantic: "tree-link",
      fromNodeIndex: "root",
      toNodeIndex: index,
      fromAnchor: "bottom",
      toAnchor: "top",
      connectorAxis: "vertical"
    }));
    shapes.push(nativeShape(image, match, "tree-node", index, "roundRect", childBox, {
      fill: palette.softFills?.[(index + 1) % Math.max(1, palette.softFills.length)] || "#F0FDF4",
      stroke: palette.accents?.[(index + 1) % Math.max(1, palette.accents.length)] || "#22A76B",
      strokeWidthPt: 0.95,
      radiusRatio: 0.18
    }));
  }
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function templateGuidedHubSpokeShapes(image, match, box, palette, slideSize) {
  const nodes = selectTemplateNodeBoxes(match, box, slideSize, {
    max: 9,
    requireInsideUnit: true,
    excludeDecorations: true,
    excludeRoleDecorationsOnly: true
  });
  const radial = selectRadialTemplateNodes(nodes, box);
  if (!radial) return [];
  const templateSpokes = selectTemplateHubSpokeConnectorBoxes(match, box, radial, slideSize);
  const useTemplateSpokes = templateSpokes.length >= Math.min(3, radial.peripherals.length);
  const shapes = [
    nativeShape(image, match, "hub-center", 0, nativeTypeForTemplateStyle(radial.center.style, "ellipse"), radial.center.box, mergeTemplateStyle(radial.center.style, {
      fill: palette.softFills[0],
      stroke: palette.accents[0],
      strokeWidthPt: 1.2
    }), templateGuidedChildSource(radial.center, "component-child-layout"))
  ];
  if (useTemplateSpokes) {
    templateSpokes.forEach((spoke, index) => {
      const metadata = hubSpokeConnectorMetadata(spoke.peripheralIndex, radial.center.box, spoke.peripheral.box);
      shapes.push(nativeShape(
        image,
        match,
        "hub-spoke",
        index,
        spoke.kind === "connector" ? "line" : nativeTypeForTemplateStyle(spoke.style, "line"),
        spoke.box,
        mergeTemplateStyle(spoke.style, {
          fill: safeColorOrNone(spoke.style.fill) || "none",
          stroke: safeColorOrNone(spoke.style.stroke) || palette.neutral,
          strokeWidthPt: 1.0,
          connectorType: "straight"
        }),
        {
          ...metadata,
          ...templateGuidedChildSource(spoke, "component-child-layout"),
          connectorSource: "plugin-child-layout"
        }
      ));
    });
  }
  radial.peripherals.forEach((node, index) => {
    if (!useTemplateSpokes) {
      shapes.push(nativeShape(image, match, "hub-spoke", index, "line", lineBoxBetween(radial.center.box, node.box), {
        stroke: palette.neutral,
        strokeWidthPt: 1.0,
        connectorType: "straight"
      }, hubSpokeConnectorMetadata(index, radial.center.box, node.box)));
    }
    shapes.push(nativeShape(image, match, "hub-node", index, nativeTypeForTemplateStyle(node.style, "roundRect"), node.box, mergeTemplateStyle(node.style, {
      fill: palette.softFills[(index + 1) % palette.softFills.length],
      stroke: palette.accents[(index + 1) % palette.accents.length],
      strokeWidthPt: 0.95,
      radiusRatio: 0.20
    }), templateGuidedChildSource(node, "component-child-layout")));
  });
  return shapes;
}

function selectTemplateHubSpokeConnectorBoxes(match = {}, targetBox = {}, radial = null, slideSize = DEFAULT_SLIDE) {
  if (!radial?.center || !Array.isArray(radial.peripherals) || radial.peripherals.length < 3) return [];
  const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  const centerPoint = boxCenter(radial.center.box);
  const candidates = children
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
        && /line|arrow|chevron|arc|blockarc/.test(shapeType);
    })
    .map((child) => {
      const childCenter = boxCenter(child.box);
      const peripheral = closestRadialPeripheralForConnector(childCenter, centerPoint, radial.peripherals);
      if (!peripheral) return null;
      const radialDistance = distance(childCenter, centerPoint);
      const peripheralDistance = distance(boxCenter(peripheral.node.box), centerPoint);
      if (radialDistance < peripheralDistance * 0.14 || radialDistance > peripheralDistance * 1.10) return null;
      return {
        ...child,
        peripheral: peripheral.node,
        peripheralIndex: peripheral.index,
        angleDelta: peripheral.angleDelta,
        radialDistance
      };
    })
    .filter(Boolean)
    .filter((child) => child.angleDelta <= Math.PI / 5)
    .sort((a, b) => a.peripheralIndex - b.peripheralIndex || a.angleDelta - b.angleDelta || a.index - b.index);
  const byPeripheral = new Map();
  for (const candidate of candidates) {
    if (!byPeripheral.has(candidate.peripheralIndex)) byPeripheral.set(candidate.peripheralIndex, candidate);
  }
  return Array.from(byPeripheral.values()).slice(0, radial.peripherals.length);
}

function closestRadialPeripheralForConnector(point = {}, center = {}, peripherals = []) {
  const angle = angleAround(center, point);
  return peripherals
    .map((node, index) => {
      const peripheralAngle = angleAround(center, boxCenter(node.box));
      return {
        node,
        index,
        angleDelta: angularDistance(angle, peripheralAngle)
      };
    })
    .sort((a, b) => a.angleDelta - b.angleDelta)[0] || null;
}

function angularDistance(a, b) {
  const diff = Math.abs(Number(a || 0) - Number(b || 0)) % (Math.PI * 2);
  return Math.min(diff, Math.PI * 2 - diff);
}

function selectRadialTemplateNodes(nodes = [], targetBox = {}) {
  if (!Array.isArray(nodes) || nodes.length < 5) return null;
  const targetCenter = {
    x: targetBox.x + targetBox.w / 2,
    y: targetBox.y + targetBox.h / 2
  };
  const withCenters = nodes.map((node) => ({
    ...node,
    center: boxCenter(node.box),
    distanceToTargetCenter: distance(boxCenter(node.box), targetCenter)
  }));
  const xValues = withCenters.map((node) => node.center.x);
  const yValues = withCenters.map((node) => node.center.y);
  const spreadX = Math.max(...xValues) - Math.min(...xValues);
  const spreadY = Math.max(...yValues) - Math.min(...yValues);
  if (spreadX < targetBox.w * 0.38 || spreadY < targetBox.h * 0.30) return null;
  const center = withCenters
    .filter((node) => node.distanceToTargetCenter <= Math.max(targetBox.w, targetBox.h) * 0.18)
    .sort((a, b) => a.distanceToTargetCenter - b.distanceToTargetCenter)[0];
  if (!center) return null;
  const peripherals = withCenters
    .filter((node) => node.index !== center.index)
    .filter((node) => distance(node.center, center.center) >= Math.min(targetBox.w, targetBox.h) * 0.18)
    .sort((a, b) => angleAround(center.center, a.center) - angleAround(center.center, b.center))
    .slice(0, 8);
  if (peripherals.length < 4) return null;
  return { center, peripherals };
}

function timelineShapes(image = {}, match = {}, slideSize = DEFAULT_SLIDE) {
  const box = safeBox(image.box, slideSize);
  if (!box) return [];
  const palette = paletteFromMatch(match, {
    accents: ["#2F80ED", "#27AE60"],
    neutral: "#64748B",
    softFills: ["#EAF3FF", "#EAFBF2"]
  });
  const visualTimeline = timelineShapesFromVisualNodes(image, match, box, palette, slideSize);
  if (visualTimeline.length > 0) return visualTimeline;
  const guided = templateGuidedTimelineShapes(image, match, box, palette, slideSize);
  if (guided.length > 0) return guided;
  const count = clampInteger(match.childCount || 5, 3, 7);
  const y = box.y + box.h * 0.5;
  const left = box.x + box.w * 0.08;
  const right = box.x + box.w * 0.92;
  const shapes = [
    nativeShape(image, match, "timeline-axis", 0, "line", { x: left, y, w: right - left, h: 0.1 }, {
      stroke: palette.neutral,
      strokeWidthPt: 1.6,
      connectorType: "straight"
    })
  ];
  for (let index = 0; index < count; index += 1) {
    const x = left + ((right - left) * index / Math.max(1, count - 1));
    shapes.push(nativeShape(image, match, "timeline-dot", index, "ellipse", {
      x: x - 8,
      y: y - 8,
      w: 16,
      h: 16
    }, {
      fill: palette.accents[index % palette.accents.length],
      stroke: "#FFFFFF",
      strokeWidthPt: 1.4
    }));
  }
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function timelineShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE) {
  const nodes = treeVisualNodes(image, targetBox, slideSize)
    .slice()
    .sort((a, b) => boxCenter(a.box).x - boxCenter(b.box).x || boxCenter(a.box).y - boxCenter(b.box).y)
    .slice(0, 12);
  if (nodes.length < 3) return [];
  const centers = nodes.map((node) => boxCenter(node.box));
  const xSpread = Math.max(...centers.map((point) => point.x)) - Math.min(...centers.map((point) => point.x));
  const ySpread = Math.max(...centers.map((point) => point.y)) - Math.min(...centers.map((point) => point.y));
  const avgNodeH = nodes.reduce((sum, node) => sum + node.box.h, 0) / Math.max(1, nodes.length);
  if (xSpread < targetBox.w * 0.28 || ySpread > Math.max(avgNodeH * 1.9, targetBox.h * 0.24)) return [];

  const left = Math.min(...centers.map((point) => point.x));
  const right = Math.max(...centers.map((point) => point.x));
  const y = median(centers.map((point) => point.y));
  const shapes = [
    nativeShape(image, match, "timeline-axis", 0, "line", { x: left, y, w: Math.max(0.1, right - left), h: 0.1 }, {
      stroke: palette.neutral || "#64748B",
      strokeWidthPt: 1.6,
      connectorType: "straight"
    }, {
      layoutPreservation: "visual-node"
    })
  ];
  nodes.forEach((node, index) => {
    shapes.push(nativeShape(image, match, "timeline-dot", index, "ellipse", node.box, {
      fill: palette.accents?.[index % Math.max(1, palette.accents.length)] || "#2F80ED",
      stroke: "#FFFFFF",
      strokeWidthPt: 1.4
    }, {
      sourceVisualNodeId: node.id,
      layoutPreservation: "visual-node"
    }));
  });
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function templateGuidedTimelineShapes(image, match, box, palette, slideSize) {
  const milestones = selectTimelineMilestoneBoxes(match, box, slideSize);
  if (milestones.length < 3) return [];
  const centers = milestones.map((item) => boxCenter(item.box));
  const left = Math.min(...centers.map((point) => point.x));
  const right = Math.max(...centers.map((point) => point.x));
  const y = median(centers.map((point) => point.y));
  const axis = selectTemplateTimelineAxisBox(match, box, milestones, slideSize);
  const shapes = [
    nativeShape(image, match, "timeline-axis", 0, axis ? nativeTypeForTemplateStyle(axis.style, "line") : "line", axis?.box || { x: left, y, w: Math.max(0.1, right - left), h: 0.1 }, mergeTemplateStyle(axis?.style || {}, {
      stroke: palette.neutral,
      strokeWidthPt: 1.6,
      connectorType: "straight"
    }), axis ? {
      ...templateGuidedChildSource(axis, "component-child-layout"),
      timelineAxisSource: "plugin-child-layout"
    } : {})
  ];
  milestones.forEach((milestone, index) => {
    shapes.push(nativeShape(image, match, "timeline-dot", index, nativeTypeForTemplateStyle(milestone.style, "ellipse"), milestone.box, mergeTemplateStyle(milestone.style, {
      fill: palette.accents[index % palette.accents.length],
      stroke: "#FFFFFF",
      strokeWidthPt: 1.4
    }), templateGuidedChildSource(milestone, "component-child-layout")));
  });
  return shapes;
}

function selectTemplateTimelineAxisBox(match = {}, targetBox = {}, milestones = [], slideSize = DEFAULT_SLIDE) {
  const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  if (!Array.isArray(milestones) || milestones.length < 3) return null;
  const milestoneCenters = milestones.map((item) => boxCenter(item.box));
  const left = Math.min(...milestoneCenters.map((point) => point.x));
  const right = Math.max(...milestoneCenters.map((point) => point.x));
  const y = median(milestoneCenters.map((point) => point.y));
  return children
    .map((child, index) => ({
      index,
      kind: String(child?.kind || ""),
      relativeBox: child?.box,
      box: scaleRelativeBox(child?.box, targetBox, slideSize),
      style: child?.style || {}
    }))
    .filter((child) => child.box && child.box.w > 0 && child.box.h > 0)
    .filter((child) => child.kind === "connector" || isTemplateConnectorDecorationStyle(child.style))
    .filter((child) => isLikelyTimelineAxisBox(child.box, { left, right, y }, targetBox))
    .sort((a, b) => (b.box.w * b.box.h) - (a.box.w * a.box.h) || a.index - b.index)[0] || null;
}

function isLikelyTimelineAxisBox(box = {}, milestoneSpan = {}, targetBox = {}) {
  const center = boxCenter(box);
  const widthRatio = Number(box.w || 0) / Math.max(1, Number(targetBox.w || 0));
  const heightRatio = Number(box.h || 0) / Math.max(1, Number(targetBox.h || 0));
  const milestoneWidth = Math.max(1, Number(milestoneSpan.right || 0) - Number(milestoneSpan.left || 0));
  const coversMilestones = Number(box.x || 0) <= Number(milestoneSpan.left || 0) + milestoneWidth * 0.14
    && Number(box.x || 0) + Number(box.w || 0) >= Number(milestoneSpan.right || 0) - milestoneWidth * 0.14;
  return widthRatio >= 0.34
    && heightRatio <= 0.18
    && coversMilestones
    && Math.abs(center.y - Number(milestoneSpan.y || 0)) <= Math.max(18, Number(targetBox.h || 0) * 0.20);
}

function selectTimelineMilestoneBoxes(match = {}, targetBox = {}, slideSize = DEFAULT_SLIDE) {
  const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  const boxes = children
    .map((child, index) => ({
      index,
      kind: String(child.kind || ""),
      relativeBox: child.box,
      box: scaleRelativeBox(child.box, targetBox, slideSize),
      style: child.style || {}
    }))
    .filter((child) => child.kind === "shape" && isInsideUnitBox(child.relativeBox))
    .filter((child) => !isTemplateConnectorDecorationStyle(child.style))
    .filter((child) => isUsefulTimelineMilestoneBox(child.box, targetBox))
    .sort((a, b) => a.box.x - b.box.x || a.index - b.index)
    .slice(0, 10);
  if (boxes.length < 3) return [];
  const centers = boxes.map((item) => boxCenter(item.box));
  const spreadX = Math.max(...centers.map((point) => point.x)) - Math.min(...centers.map((point) => point.x));
  const spreadY = Math.max(...centers.map((point) => point.y)) - Math.min(...centers.map((point) => point.y));
  if (spreadX < targetBox.w * 0.45) return [];
  if (spreadY > targetBox.h * 0.55) return [];
  return boxes;
}

function isUsefulTimelineMilestoneBox(box, targetBox) {
  if (!box || box.w <= 4 || box.h <= 4) return false;
  const areaRatio = (box.w * box.h) / Math.max(1, targetBox.w * targetBox.h);
  const widthRatio = box.w / Math.max(1, targetBox.w);
  const heightRatio = box.h / Math.max(1, targetBox.h);
  return areaRatio >= 0.0008
    && areaRatio <= 0.08
    && widthRatio >= 0.012
    && widthRatio <= 0.20
    && heightRatio >= 0.025
    && heightRatio <= 0.35;
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

function componentTemplateTextBoxesFromShapes(shapes = [], image = {}, match = {}, textBackfillState = null, options = {}) {
  const result = [];
  for (const shape of Array.isArray(shapes) ? shapes : []) {
    const textStyle = shape?.style?.text;
    if (!textStyle || typeof textStyle !== "object") continue;
    const box = safeBox(shape.box, DEFAULT_SLIDE);
    if (!box) continue;
    const textBox = templateTextBoxFromStyle({
      id: `${shape.id || "component-template"}-text`,
      box,
      textStyle,
      textBackfillState,
      preserveGenericPluginText: options.preserveGenericPluginText === true,
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "plugin-component-template-native-textbox",
        componentTemplateGroupApplied: true,
        layerSourceId: image.id || null,
        matchedComponentGroupId: safeText(match.id),
        matchedComponentAssetProvider: safeText(match.assetProvider),
        matchedComponentAssetName: safeText(match.assetName),
        matchedComponentAssetMotifReady: match.assetMotifReady === true,
        matchedComponentTargetMotifs: componentTemplateTargetMotifs(image, match),
        matchedComponentWholeProcessTemplate: isWholeProcessTemplateMatch(image, match),
        matchedComponentStructureFitScore: clampNumber(match.structureFitScore, -100, 100, 0),
        matchedComponentStructureFitReasons: sanitizeStructureFitReasons(match.structureFitReasons),
        nativeComponentGroupId: shape?.source?.nativeComponentGroupId || componentTemplateNativeGroupId(image, match),
        nativeComponentAtomId: `${shape?.source?.nativeComponentAtomId || shape.id || "component-template"}-text`,
        nativeComponentRole: safeText(shape?.source?.nativeComponentRole),
        appliedPluginStructureRole: safeText(shape?.source?.appliedPluginStructureRole),
        replacedTextShellId: safeText(shape.id),
        appliedPluginDirectReplay: shape?.source?.appliedPluginDirectReplay === true,
        appliedPluginChildIndex: clampNumber(shape?.source?.appliedPluginChildIndex, 0, 9999, 0)
      }
    });
    if (textBox) result.push(textBox);
  }
  return result;
}

function componentTemplateSourceBoundTextBoxesFromShapes(shapes = [], image = {}, match = {}, textBackfillState = null) {
  if (!textBackfillState || !Array.isArray(textBackfillState.sourceTextBoxes) || textBackfillState.sourceTextBoxes.length === 0) return [];
  const result = [];
  for (const shape of Array.isArray(shapes) ? shapes : []) {
    if (shape?.style?.text) continue;
    if (shape?.source?.appliedPluginDirectReplay === true) continue;
    if (!isSourceBindableComponentPart(shape?.source?.componentTemplatePart)) continue;
    const box = safeBox(shape.box, DEFAULT_SLIDE);
    if (!box) continue;
    const part = safeText(shape?.source?.componentTemplatePart);
    const backfill = findSourceTextStrictlyInsideBox(textBindingSearchBoxForComponentPart(box, part), textBackfillState);
    if (!backfill) continue;
    result.push({
      id: `${shape.id || "component-template"}-source-text`,
      text: backfill.text,
      box: insetTextBoxForComponentPart(box, part),
      font: {
        family: "Microsoft YaHei",
        sizePt: sourceBoundTextSizePt(box, part, backfill.text),
        weight: /header|title/.test(part) ? "bold" : "regular",
        color: "#111827",
        align: "center",
        valign: "middle"
      },
      style: {
        marginLeftPt: 1.5,
        marginRightPt: 1.5,
        marginTopPt: 0,
        marginBottomPt: 0
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "plugin-component-template-source-bound-textbox",
        componentTemplateGroupApplied: true,
        componentTemplateSourceBoundText: true,
        layerSourceId: image.id || null,
        matchedComponentGroupId: safeText(match.id),
        matchedComponentAssetProvider: safeText(match.assetProvider),
        matchedComponentAssetName: safeText(match.assetName),
        matchedComponentAssetMotifReady: match.assetMotifReady === true,
        matchedComponentTargetMotifs: componentTemplateTargetMotifs(image, match),
        matchedComponentWholeProcessTemplate: isWholeProcessTemplateMatch(image, match),
        matchedComponentStructureFitScore: clampNumber(match.structureFitScore, -100, 100, 0),
        matchedComponentStructureFitReasons: sanitizeStructureFitReasons(match.structureFitReasons),
        nativeComponentGroupId: shape?.source?.nativeComponentGroupId || componentTemplateNativeGroupId(image, match),
        nativeComponentAtomId: `${shape?.source?.nativeComponentAtomId || shape.id || "component-template"}-source-text`,
        nativeComponentRole: safeText(shape?.source?.nativeComponentRole),
        appliedPluginStructureRole: safeText(shape?.source?.appliedPluginStructureRole) || "node",
        replacedTextShellId: safeText(shape.id),
        pluginPlaceholderTextBackfilled: true,
        pluginTextBackfillSourceId: backfill.id,
        pluginTextBackfillScore: backfill.score,
        componentTemplateTextBindingMode: "source-center-inside-component-node"
      }
    });
  }
  return result;
}

function isSourceBindableComponentPart(part) {
  const text = safeText(part).toLowerCase();
  return /(?:swimlane|process|timeline|quadrant|matrix|card|node|cell|header|step)/.test(text)
    && !/(?:connector|axis|decoration|background|lane$|picture|shell)/.test(text);
}

function findSourceTextStrictlyInsideBox(targetBox = {}, state = null) {
  const target = safeBox(targetBox, DEFAULT_SLIDE);
  if (!target || !state || !Array.isArray(state.sourceTextBoxes)) return null;
  let best = null;
  const targetCenter = boxCenter(target);
  for (const candidate of state.sourceTextBoxes) {
    if (state.usedSourceTextBoxIds.has(candidate.id)) continue;
    const candidateBox = safeBox(candidate.box, DEFAULT_SLIDE);
    if (!candidateBox) continue;
    const candidateCenter = boxCenter(candidateBox);
    const overlap = boxOverlapArea(target, candidateBox);
    const textArea = Math.max(1, candidateBox.w * candidateBox.h);
    const overlapRatio = overlap / textArea;
    const centerInside = pointInsideBox(candidateCenter, target);
    if (!centerInside && overlapRatio < 0.62) continue;
    const dist = distance(targetCenter, candidateCenter);
    const score = round(overlapRatio * 100 + (centerInside ? 35 : 0) - dist * 0.03);
    if (!best || score > best.score) best = { ...candidate, score };
  }
  if (!best) return null;
  state.usedSourceTextBoxIds.add(best.id);
  return best;
}

function textBindingSearchBoxForComponentPart(box = {}, part = "") {
  const safe = safeBox(box, DEFAULT_SLIDE);
  if (!safe) return box;
  if (/swimlane-header/i.test(part)) {
    return {
      x: safe.x,
      y: safe.y - Math.min(4, safe.h * 0.08),
      w: safe.w + Math.min(48, Math.max(12, safe.w * 0.55)),
      h: safe.h + Math.min(8, safe.h * 0.16)
    };
  }
  if (/swimlane-node/i.test(part)) {
    return {
      x: safe.x,
      y: safe.y - Math.min(3, safe.h * 0.08),
      w: safe.w,
      h: safe.h + Math.min(36, Math.max(10, safe.h * 1.05))
    };
  }
  return safe;
}

function pointInsideBox(point = {}, box = {}) {
  const x = Number(point.x);
  const y = Number(point.y);
  return Number.isFinite(x)
    && Number.isFinite(y)
    && x >= Number(box.x || 0)
    && x <= Number(box.x || 0) + Number(box.w || 0)
    && y >= Number(box.y || 0)
    && y <= Number(box.y || 0) + Number(box.h || 0);
}

function insetTextBoxForComponentPart(box = {}, part = "") {
  const insetX = Math.min(8, Math.max(1.5, Number(box.w || 0) * 0.04));
  const insetY = Math.min(4, Math.max(0, Number(box.h || 0) * 0.08));
  return {
    x: round(Number(box.x || 0) + insetX),
    y: round(Number(box.y || 0) + insetY),
    w: round(Math.max(1, Number(box.w || 0) - insetX * 2)),
    h: round(Math.max(1, Number(box.h || 0) - insetY * 2))
  };
}

function sourceBoundTextSizePt(box = {}, part = "", text = "") {
  const heightDriven = Number(box.h || 0) * (/header/.test(part) ? 0.36 : 0.42);
  const lengthPenalty = safeText(text).length > 10 ? 1.5 : 0;
  return round(clampNumber(heightDriven - lengthPenalty, 8, 18, 11));
}

function componentTemplateSupplementalTextBoxes(image = {}, match = {}, slideSize = DEFAULT_SLIDE, textBackfillState = null) {
  if (!isAppliedPluginComponentMatch(match)) return [];
  const targetBox = safeBox(image.box, slideSize);
  if (!targetBox) return [];
  const groups = supplementalTextGroupsForMatch(image, match);
  if (groups.length === 0) return [];
  const union = boundsUnion(groups.map((group) => group.boundsPt));
  if (!union) return [];
  const result = [];
  for (const group of groups) {
    const groupBox = mapBoundsIntoTarget(group.boundsPt, union, targetBox, slideSize);
    if (!groupBox) continue;
    const children = Array.isArray(group.childLayout?.children) ? group.childLayout.children : [];
    children.forEach((child, childIndex) => {
      const textStyle = child?.style?.text;
      if (!textStyle || typeof textStyle !== "object") return;
      const childBox = scaleRelativeBox(child.box, groupBox, slideSize);
      if (!childBox) return;
      result.push(templateTextBoxFromStyle({
        id: `${image.id || "component-template"}-${group.id || "group"}-supplemental-text-${childIndex}`,
        box: childBox,
        textStyle,
        textBackfillState,
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "plugin-component-template-supplemental-textbox",
          componentTemplateGroupApplied: true,
          componentTemplateSupplementalText: true,
          layerSourceId: image.id || null,
          matchedComponentGroupId: safeText(group.id),
          matchedComponentAssetProvider: safeText(match.assetProvider),
          matchedComponentAssetName: safeText(match.assetName),
          matchedComponentAssetMotifReady: match.assetMotifReady === true,
          matchedComponentTargetMotifs: componentTemplateTargetMotifs(image, match),
          matchedComponentWholeProcessTemplate: isWholeProcessTemplateMatch(image, match),
          matchedComponentStructureFitScore: clampNumber(match.structureFitScore, -100, 100, 0),
          matchedComponentStructureFitReasons: sanitizeStructureFitReasons(match.structureFitReasons),
          nativeComponentGroupId: componentTemplateNativeGroupId(image, { id: group.id || match.id }),
          nativeComponentAtomId: `${image.id || "component-template"}-${group.id || "group"}-supplemental-text-${childIndex}`,
          appliedPluginDirectReplay: true,
          appliedPluginChildIndex: clampNumber(childIndex, 0, 9999, 0)
        }
      }));
    });
    if (result.length >= 16) break;
  }
  return result.slice(0, 16);
}

function supplementalTextGroupsForMatch(image = {}, match = {}) {
  const assets = Array.isArray(image?.source?.componentLocalAssets) ? image.source.componentLocalAssets : [];
  const matchedPath = safeText(match.assetPath);
  const matchedName = safeText(match.assetName);
  const matchedProvider = safeText(match.assetProvider);
  const groups = [];
  const seen = new Set();
  for (const asset of assets) {
    if (matchedPath && safeText(asset.path) !== matchedPath) continue;
    if (!matchedPath && matchedName && safeText(asset.name) !== matchedName) continue;
    if (!matchedPath && !matchedName && matchedProvider && safeText(asset.provider) !== matchedProvider) continue;
    for (const group of Array.isArray(asset.recommendedComponentGroups) ? asset.recommendedComponentGroups : []) {
      if (safeText(group.id) === safeText(match.id)) continue;
      if (shouldSkipLowReuseComponentGroup(group)) continue;
      const score = clampNumber(group.score ?? group.matchScore, 0, 100, 0);
      if (score < 35) continue;
      const textChildren = (Array.isArray(group.childLayout?.children) ? group.childLayout.children : [])
        .filter((child) => child?.style?.text && child?.box);
      if (textChildren.length === 0) continue;
      if (groupHasNoisyGenericPlaceholderText(group)) continue;
      if (!validBounds(group.boundsPt)) continue;
      const key = [
        safeText(group.id),
        round(Number(group.boundsPt.x)),
        round(Number(group.boundsPt.y)),
        round(Number(group.boundsPt.w)),
        round(Number(group.boundsPt.h))
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      groups.push(group);
    }
  }
  return groups.slice(0, 8);
}

function templateTextBoxFromStyle({
  id,
  box,
  textStyle = {},
  source = {},
  textBackfillState = null,
  preserveGenericPluginText = false
} = {}) {
  const placeholder = safeText(textStyle.placeholderText).slice(0, 120);
  const genericPlaceholder = isGenericPluginPlaceholderText(placeholder);
  const backfill = genericPlaceholder ? findSourceTextBackfill(box, textBackfillState) : null;
  if (genericPlaceholder && !backfill && !preserveGenericPluginText) return null;
  const placeholderSuppressed = Boolean(backfill);
  return {
    id,
    text: backfill?.text || placeholder,
    box,
    font: {
      family: safeText(textStyle.family) || undefined,
      sizePt: clampNumber(textStyle.fontSizePt, 4, 96, 12),
      weight: safeText(textStyle.weight) === "bold" ? "bold" : "regular",
      color: safeColor(textStyle.color) || "#111111",
      align: normalizeTextAlign(textStyle.align),
      valign: normalizeTextValign(textStyle.valign),
      ...(Number.isFinite(Number(textStyle.lineHeightMultiple))
        ? { lineHeightMultiple: clampNumber(textStyle.lineHeightMultiple, 0.5, 4, 1) }
        : {})
    },
    style: {
      marginLeftPt: clampNumber(textStyle.marginLeftPt, 0, 72, 0),
      marginRightPt: clampNumber(textStyle.marginRightPt, 0, 72, 0),
      marginTopPt: clampNumber(textStyle.marginTopPt, 0, 72, 0),
      marginBottomPt: clampNumber(textStyle.marginBottomPt, 0, 72, 0),
      ...(normalizeTextVertical(textStyle.vertical) ? { vertical: normalizeTextVertical(textStyle.vertical) } : {}),
      ...(sanitizeTemplateGradient(textStyle.gradient) ? { textGradient: sanitizeTemplateGradient(textStyle.gradient) } : {}),
      ...(sanitizeTemplateTextReflection(textStyle.reflection) ? { textReflection: sanitizeTemplateTextReflection(textStyle.reflection) } : {})
    },
    source: {
      ...source,
      pluginPlaceholderTextSuppressed: placeholderSuppressed,
      ...(genericPlaceholder && !backfill && preserveGenericPluginText
        ? { pluginPlaceholderTextPreservedForLearning: true }
        : {}),
      ...(backfill ? {
        pluginPlaceholderTextBackfilled: true,
        pluginTextBackfillSourceId: backfill.id,
        pluginTextBackfillScore: backfill.score
      } : {})
    }
  };
}

function normalizeSourceTextBoxes(textBoxes = []) {
  return (Array.isArray(textBoxes) ? textBoxes : [])
    .map((item, index) => {
      const box = safeBox(item?.box, DEFAULT_SLIDE);
      const text = safeText(item?.text).slice(0, 240);
      if (!box || !text || isGenericPluginPlaceholderText(text)) return null;
      return {
        id: safeText(item.id) || `source-text-${index}`,
        text,
        box
      };
    })
    .filter(Boolean)
    .slice(0, 300);
}

function findSourceTextBackfill(targetBox = {}, state = null) {
  if (!state || !Array.isArray(state.sourceTextBoxes) || state.sourceTextBoxes.length === 0) return null;
  const target = safeBox(targetBox, DEFAULT_SLIDE);
  if (!target) return null;
  const targetArea = Math.max(1, target.w * target.h);
  const targetCenter = boxCenter(target);
  const maxDistance = Math.max(28, Math.min(160, Math.max(target.w, target.h) * 2.2));
  let best = null;
  for (const candidate of state.sourceTextBoxes) {
    if (state.usedSourceTextBoxIds.has(candidate.id)) continue;
    const overlap = boxOverlapArea(target, candidate.box);
    const overlapRatio = overlap / Math.max(1, Math.min(targetArea, candidate.box.w * candidate.box.h));
    const dist = distance(targetCenter, boxCenter(candidate.box));
    if (overlapRatio < 0.08 && dist > maxDistance) continue;
    const score = round(overlapRatio * 100 - dist * 0.05);
    if (!best || score > best.score) best = { ...candidate, score };
  }
  if (!best) return null;
  state.usedSourceTextBoxIds.add(best.id);
  return best;
}

function boundsUnion(boundsList = []) {
  const valid = (Array.isArray(boundsList) ? boundsList : []).filter(validBounds);
  if (valid.length === 0) return null;
  const left = Math.min(...valid.map((box) => Number(box.x)));
  const top = Math.min(...valid.map((box) => Number(box.y)));
  const right = Math.max(...valid.map((box) => Number(box.x) + Number(box.w)));
  const bottom = Math.max(...valid.map((box) => Number(box.y) + Number(box.h)));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function validBounds(box = {}) {
  return !!box
    && typeof box === "object"
    && [box.x, box.y, box.w, box.h].every((value) => Number.isFinite(Number(value)))
    && Number(box.w) > 0
    && Number(box.h) > 0;
}

function mapBoundsIntoTarget(bounds = {}, union = {}, targetBox = {}, slideSize = DEFAULT_SLIDE) {
  if (!validBounds(bounds) || !validBounds(union) || !validBounds(targetBox)) return null;
  return clampBox({
    x: Number(targetBox.x) + ((Number(bounds.x) - Number(union.x)) / Number(union.w)) * Number(targetBox.w),
    y: Number(targetBox.y) + ((Number(bounds.y) - Number(union.y)) / Number(union.h)) * Number(targetBox.h),
    w: (Number(bounds.w) / Number(union.w)) * Number(targetBox.w),
    h: (Number(bounds.h) / Number(union.h)) * Number(targetBox.h)
  }, slideSize);
}

function componentTemplateImagesFromShapes(shapes = [], image = {}, match = {}, options = {}) {
  const assetDir = safeOutputAssetDir(options.assetDir);
  if (!assetDir) return [];
  const assetPath = safeLocalPptxPath(match.assetPath);
  if (!assetPath) return [];
  const result = [];
  for (const shape of Array.isArray(shapes) ? shapes : []) {
    if (shape?.source?.appliedPluginPictureShell !== true) continue;
    const picture = shape?.style?.picture || {};
    const mediaTarget = safeMediaTarget(picture.mediaTarget);
    if (!mediaTarget) continue;
    const copied = extractPluginPictureMedia({ assetPath, mediaTarget, assetDir });
    if (!copied) continue;
    result.push({
      id: `${shape.id || "component-template-picture"}-image`,
      type: "plugin-component-picture",
      box: shape.box,
      assetPath: copied,
      drawAfterShapes: true,
      style: {
        opacity: Number.isFinite(Number(picture.opacity)) ? clampNumber(picture.opacity, 0, 1, 1) : undefined,
        crop: picture.crop || undefined
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "plugin-component-template-native-picture",
        layerSourceId: image.id || null,
        matchedComponentGroupId: safeText(match.id),
        matchedComponentAssetProvider: safeText(match.assetProvider),
        matchedComponentAssetName: safeText(match.assetName),
        matchedComponentAssetMotifReady: match.assetMotifReady === true,
        matchedComponentTargetMotifs: componentTemplateTargetMotifs(image, match),
        matchedComponentWholeProcessTemplate: isWholeProcessTemplateMatch(image, match),
        matchedComponentStructureFitScore: clampNumber(match.structureFitScore, -100, 100, 0),
        matchedComponentStructureFitReasons: sanitizeStructureFitReasons(match.structureFitReasons),
        matchedComponentAssetPath: assetPath,
        nativeComponentGroupId: shape?.source?.nativeComponentGroupId || componentTemplateNativeGroupId(image, match),
        nativeComponentAtomId: `${shape?.source?.nativeComponentAtomId || shape.id || "component-template"}-image`,
        nativeComponentRole: safeText(shape?.source?.nativeComponentRole),
        appliedPluginStructureRole: safeText(shape?.source?.appliedPluginStructureRole),
        replacedPictureShellId: shape.id || "",
        appliedPluginPictureRelId: safeRelationshipId(picture.embedRelId),
        appliedPluginPictureMediaTarget: mediaTarget,
        appliedPluginPictureCrop: picture.crop ? JSON.stringify(picture.crop) : ""
      }
    });
  }
  return result;
}

function extractPluginPictureMedia({ assetPath, mediaTarget, assetDir }) {
  const safeTarget = safeMediaTarget(mediaTarget);
  const safeAssetPath = safeLocalPptxPath(assetPath);
  const safeDir = safeOutputAssetDir(assetDir);
  if (!safeTarget || !safeAssetPath || !safeDir) return "";
  let data = null;
  try {
    data = readZipEntry(safeAssetPath, safeTarget, { maxBytes: 8 * 1024 * 1024 });
  } catch {
    return "";
  }
  if (!data || data.length === 0) return "";
  const ext = path.extname(safeTarget).toLowerCase();
  const hash = crypto.createHash("sha1").update(safeAssetPath).update("\0").update(safeTarget).update("\0").update(data).digest("hex").slice(0, 16);
  const dir = path.join(safeDir, "plugin-component-media");
  const out = path.join(dir, `plugin-${hash}${ext}`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(out)) fs.writeFileSync(out, data);
    return out;
  } catch {
    return "";
  }
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

function normalizeTextAlign(value) {
  const text = safeText(value).toLowerCase();
  return ["left", "center", "right", "justify"].includes(text) ? text : "center";
}

function normalizeTextValign(value) {
  const text = safeText(value).toLowerCase();
  // DrawingML text defaults to top anchoring when bodyPr omits anchor.
  return ["top", "middle", "bottom"].includes(text) ? text : "top";
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

function paletteFromMatch(match = {}, fallback = {}) {
  const colors = sanitizedPaletteColors(match.topColors);
  const neutrals = colors.filter((color) => isNearGray(color) && !isNearWhite(color) && !isNearBlack(color));
  const accents = colors.filter((color) => !isNearWhite(color) && !isNearBlack(color) && !isNearGray(color)).slice(0, 4);
  const fallbackAccents = Array.isArray(fallback.accents) ? fallback.accents : ["#2F80ED"];
  const safeAccents = accents.length ? accents : fallbackAccents;
  return {
    accents: safeAccents,
    neutral: neutrals[0] || fallback.neutral || safeAccents[0],
    softFills: deriveSoftFills(safeAccents, fallback.softFills)
  };
}

function sanitizedPaletteColors(topColors = []) {
  return (Array.isArray(topColors) ? topColors : [])
    .map((entry) => safeColor(entry?.value))
    .filter(Boolean)
    .slice(0, 8);
}

function deriveSoftFills(accents = [], fallbackFills = []) {
  const fills = accents.map((color) => mixColor(color, "#FFFFFF", 0.86)).filter(Boolean);
  const fallback = Array.isArray(fallbackFills) && fallbackFills.length ? fallbackFills : ["#F8FAFC"];
  return fills.length ? fills : fallback;
}

function paletteSummary(match = {}) {
  const colors = sanitizedPaletteColors(match.topColors);
  return colors.length ? colors : null;
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

function mixColor(color, other, otherWeight) {
  const a = hexToRgb(color);
  const b = hexToRgb(other);
  if (!a || !b) return "";
  const weight = clampNumber(otherWeight, 0, 1, 0.5);
  return rgbToHex({
    r: a.r * (1 - weight) + b.r * weight,
    g: a.g * (1 - weight) + b.g * weight,
    b: a.b * (1 - weight) + b.b * weight
  });
}

function isNearWhite(color) {
  const rgb = hexToRgb(color);
  return rgb ? rgb.r >= 238 && rgb.g >= 238 && rgb.b >= 238 : false;
}

function isNearBlack(color) {
  const rgb = hexToRgb(color);
  return rgb ? rgb.r <= 32 && rgb.g <= 32 && rgb.b <= 32 : false;
}

function isNearGray(color) {
  const rgb = hexToRgb(color);
  if (!rgb) return false;
  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) <= 18;
}

function hexToRgb(color) {
  const text = safeColor(color).slice(1);
  if (!text) return null;
  return {
    r: Number.parseInt(text.slice(0, 2), 16),
    g: Number.parseInt(text.slice(2, 4), 16),
    b: Number.parseInt(text.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((value) => {
    const number = clampInteger(Math.round(value), 0, 255);
    return number.toString(16).toUpperCase().padStart(2, "0");
  }).join("")}`;
}

function clampBox(box, slideSize = DEFAULT_SLIDE) {
  const maxW = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt);
  const maxH = Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);
  const x = clampNumber(box.x, -maxW, maxW * 2, 0);
  const y = clampNumber(box.y, -maxH, maxH * 2, 0);
  const w = clampNumber(box.w, 0.1, maxW * 2, 0.1);
  const h = clampNumber(box.h, 0.1, maxH * 2, 0.1);
  return {
    x: round(Math.max(0, Math.min(x, maxW))),
    y: round(Math.max(0, Math.min(y, maxH))),
    w: round(Math.max(0.1, Math.min(w, maxW - Math.max(0, Math.min(x, maxW))))),
    h: round(Math.max(0.1, Math.min(h, maxH - Math.max(0, Math.min(y, maxH)))))
  };
}

function clampInteger(value, min, max) {
  return Math.round(clampNumber(value, min, max, min));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeCount(value) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function safeText(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
}

function safeRelationshipId(value) {
  const text = safeText(value);
  return /^[A-Za-z_][A-Za-z0-9_.-]{0,80}$/.test(text) ? text : "";
}

function safeMediaTarget(value) {
  const text = safeText(value).replace(/\\/g, "/");
  if (!/^ppt\/media\/[^/?#]+\.(?:png|jpe?g|gif|emf|wmf|svg)$/i.test(text)) return "";
  if (text.includes("..")) return "";
  return text;
}

function safeLocalPptxPath(value) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!path.isAbsolute(text)) return "";
  if (!/\.(?:pptx|potx)$/i.test(text)) return "";
  try {
    const stat = fs.statSync(text);
    return stat.isFile() ? text : "";
  } catch {
    return "";
  }
}

function safeOutputAssetDir(value) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!text) return "";
  const resolved = path.resolve(text);
  try {
    fs.mkdirSync(resolved, { recursive: true });
    return resolved;
  } catch {
    return "";
  }
}

function safeComponentToken(value) {
  const token = safeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return token || "component";
}

function safeColor(value) {
  const text = safeText(value).toUpperCase();
  return /^#[0-9A-F]{6}$/.test(text) ? text : "";
}

function safeColorOrNone(value) {
  const text = safeText(value);
  if (text.toLowerCase() === "none") return "none";
  return safeColor(text);
}

function safeConnectorType(value) {
  const text = safeText(value).toLowerCase();
  return ["straight", "elbow", "curve"].includes(text) ? text : "";
}

function safeArrowType(value) {
  const text = safeText(value).toLowerCase();
  return ["triangle", "oval", "diamond"].includes(text) ? text : "";
}

function safeDashType(value) {
  const text = safeText(value).toLowerCase();
  return [
    "dash", "dot", "dashdot", "dashdotdot", "largedash", "largedashdot", "largedashdotdot",
    "systemdash", "systemdashdot", "systemdashdotdot"
  ].includes(text) ? text : "";
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
    hubSpokeShapes,
    nativeTypeForTemplateStyle,
    safeComponentToken,
    scoreComponentGroupStructureFit,
    normalizeComponentStructureKind,
    targetComponentStructureKinds,
    timelineShapes
  }
};
