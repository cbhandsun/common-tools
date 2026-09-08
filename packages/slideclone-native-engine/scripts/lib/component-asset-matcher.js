"use strict";

const path = require("node:path");
const { summarizeLocalComponentAsset } = require("./component-asset-learning");
const { _private: componentCandidatePlannerPrivate } = require("./component-candidate-planner");
const {
  evaluateComponentGroupsForLayer
} = require("./component-template-group-matcher");

function buildComponentAssetManifest({ candidateReport = {}, inventory = {}, maxAssetsPerLayer = 4, learningSummaryCache = null } = {}) {
  const inventoryCandidates = Array.isArray(inventory.candidates) ? inventory.candidates : [];
  const learningCache = learningSummaryCache instanceof Map ? learningSummaryCache : new Map();
  const layers = (Array.isArray(candidateReport.layers) ? candidateReport.layers : [])
    .map((layer) => buildLayerAssetEntry(layer, inventoryCandidates, {
      maxAssetsPerLayer,
      includeLearningSummary: true,
      learningCache
    }))
    .filter(Boolean);
  return {
    provider: "component-asset-manifest-v1",
    candidateReport: safeString(candidateReport.ir),
    inventoryProvider: safeString(inventory.provider),
    summary: summarizeLayerEntries(layers),
    layers
  };
}

function buildLayerAssetEntry(layer = {}, inventoryCandidates = [], options = {}) {
  const maxAssetsPerLayer = typeof options === "object" ? options.maxAssetsPerLayer : options;
  const normalizedLayer = normalizeLayerForAssetMatching(layer);
  const strategy = layer.componentRenderStrategy || {};
  const bestCandidate = strategy.bestCandidate || (Array.isArray(layer.bestCandidates) ? layer.bestCandidates[0] : null) || {};
  const matches = matchLocalComponentAssets({
    layer: normalizedLayer,
    strategy,
    remoteCandidate: bestCandidate,
    inventoryCandidates,
    maxAssets: maxAssetsPerLayer,
    includeLearningSummary: options.includeLearningSummary === true,
    learningCache: options.learningCache
  });
  if (!strategy.mode && matches.length === 0) return null;
  const readiness = summarizeReadiness({ layer: normalizedLayer, strategy, matches });
  const acquisitionTasks = buildComponentAcquisitionTasks({
    layer: normalizedLayer,
    strategy,
    readiness,
    remoteCandidate: bestCandidate
  });
  return {
    layerKey: layerKey(layer),
    pageIndex: normalizeIndex(layer.pageIndex),
    imageIndex: normalizeOptionalIndex(layer.imageIndex),
    shapeLayerId: safeString(layer.shapeLayerId),
    box: normalizeBox(layer.box || normalizedLayer.box),
    layerType: safeString(normalizedLayer.layerType || "unknown"),
    detector: safeString(layer.detector || "unknown"),
    templateFamily: safeString(normalizedLayer.templateFamily || "unknown"),
    strategyMode: safeString(strategy.mode || "unknown"),
    applicationStep: safeString(strategy.applicationPlan?.currentStep || ""),
    targetStep: safeString(strategy.applicationPlan?.targetStep || ""),
    remoteCandidate: summarizeRemoteCandidate(bestCandidate),
    localAssets: matches,
    readiness,
    ...(acquisitionTasks.length ? { componentAcquisitionTasks: acquisitionTasks } : {})
  };
}

function matchLocalComponentAssets({
  layer = {},
  strategy = {},
  remoteCandidate = {},
  inventoryCandidates = [],
  maxAssets = 4,
  includeLearningSummary = false,
  learningCache = null
} = {}) {
  return (Array.isArray(inventoryCandidates) ? inventoryCandidates : [])
    .map((asset) => scoreLocalAsset({ asset, layer, strategy, remoteCandidate }))
    .filter((asset) => asset.matchScore >= 40)
    .sort((a, b) => b.matchScore - a.matchScore || a.path.localeCompare(b.path))
    .slice(0, normalizePositiveInt(maxAssets, 4))
    .map((asset) => buildMatchedAsset({ asset, layer, includeLearningSummary, learningCache }));
}

function summarizeAssetWithCache(asset, cache) {
  if (asset.learningSummary && typeof asset.learningSummary === "object" && isReusableLearningSummaryFresh(asset.learningSummary, asset)) {
    return asset.learningSummary;
  }
  const key = assetLearningCacheKey(asset);
  if (cache && cache.has(key)) return cache.get(key);
  const summary = summarizeLocalComponentAsset(asset);
  if (cache) cache.set(key, summary);
  return summary;
}

function isReusableLearningSummaryFresh(summary = {}, asset = {}) {
  const kind = safeString(asset.assetKind).toLowerCase();
  if (kind !== "presentation-template") return true;
  if (safeString(summary.status).toLowerCase() !== "ok") return true;
  const catalog = Array.isArray(summary.componentCatalog) ? summary.componentCatalog : [];
  if (catalog.length === 0) return true;
  const richChildCount = catalog.reduce((count, group) => {
    const children = Array.isArray(group?.childLayout?.children) ? group.childLayout.children : [];
    return count + children.filter((child) => hasReusableChildStyleDetails(child?.style)).length;
  }, 0);
  if (richChildCount > 0) return true;
  const reusableChildCount = catalog.reduce((count, group) => {
    const children = Array.isArray(group?.childLayout?.children) ? group.childLayout.children : [];
    return count + children.filter((child) => safeString(child?.kind) === "shape").length;
  }, 0);
  return reusableChildCount === 0;
}

function hasReusableChildStyleDetails(style = {}) {
  if (!style || typeof style !== "object") return false;
  if (safeString(style.shapeType)) return true;
  if (style.freeform && typeof style.freeform === "object") return true;
  if (safeString(style.fill) || safeString(style.stroke)) return true;
  if (style.gradient && typeof style.gradient === "object") return true;
  if (style.picture && typeof style.picture === "object") return true;
  if (style.text && typeof style.text === "object") return true;
  return false;
}

function assetLearningCacheKey(asset = {}) {
  return [
    "component-learning-layout-v2",
    safeString(asset.path || asset.id || "unknown"),
    safeString(asset.modifiedAt || ""),
    safeString(asset.sizeBytes || "")
  ].join("|");
}

function buildMatchedAsset({ asset, layer, includeLearningSummary, learningCache }) {
  const learningSummary = includeLearningSummary ? summarizeAssetWithCache(asset, learningCache) : null;
  const matched = {
    id: asset.id,
    provider: asset.provider,
    path: asset.path,
    name: asset.name,
    assetKind: asset.assetKind,
    roleTags: asset.roleTags,
    reusePolicy: asset.reusePolicy,
    matchScore: asset.matchScore,
    suggestedUse: asset.suggestedUse,
    reasonCodes: asset.reasonCodes,
    selfFidelityPromoted: asset.selfFidelityPromoted === true,
    ...(asset.selfFidelity ? { selfFidelity: asset.selfFidelity } : {}),
    ...(learningSummary ? { structureSignature: summarizeAssetStructureSignature(learningSummary) } : {}),
    ...(learningSummary ? { learningSummary } : {})
  };
  const groupEvaluation = learningSummary
    ? evaluateComponentGroupsForLayer({ layer, asset: matched, limit: 3, rejectedLimit: 6 })
    : null;
  const recommendedGroups = groupEvaluation?.recommendedGroups || [];
  const diagnostics = componentGroupDiagnostics(groupEvaluation);
  return {
    ...matched,
    ...(recommendedGroups.length > 0 ? { recommendedComponentGroups: recommendedGroups } : {}),
    ...(diagnostics ? { componentGroupDiagnostics: diagnostics } : {})
  };
}

function componentGroupDiagnostics(groupEvaluation = null) {
  if (!groupEvaluation || typeof groupEvaluation !== "object") return null;
  const rejected = Array.isArray(groupEvaluation.rejectedGroups) ? groupEvaluation.rejectedGroups : [];
  if (rejected.length === 0) return null;
  const byReason = {};
  for (const group of rejected) {
    for (const reason of Array.isArray(group.rejectionReasons) ? group.rejectionReasons : []) {
      const safe = safeString(reason);
      if (!safe) continue;
      byReason[safe] = (byReason[safe] || 0) + 1;
    }
  }
  return {
    provider: safeString(groupEvaluation.provider || "component-template-group-evaluation-v1"),
    targetMotifs: sanitizeMotifList(groupEvaluation.targetMotifs),
    rejectedGroups: rejected.length,
    byReason,
    examples: rejected.slice(0, 4).map((group) => ({
      id: safeString(group.id),
      name: safeString(group.name),
      matchScore: normalizeNumber(group.matchScore),
      rejectionReasons: (Array.isArray(group.rejectionReasons) ? group.rejectionReasons : [])
        .map(safeString)
        .filter(Boolean)
        .slice(0, 8),
      structureKind: safeString(group.structure?.kind || ""),
      motifs: sanitizeMotifList(group.structure?.motifs)
    }))
  };
}

function scoreLocalAsset({ asset = {}, layer = {}, strategy = {}, remoteCandidate = {} }) {
  const provider = safeString(asset.provider || "unknown-plugin");
  const assetKind = safeString(asset.assetKind);
  const roleTags = Array.isArray(asset.roleTags) ? asset.roleTags.map(safeString) : [];
  const candidateProvider = safeString(
    remoteCandidate.sourceProvider
      || strategy.applicationPlan?.sourceProvider
      || remoteCandidate.queryProvider
  );
  const candidateKind = safeString(
    remoteCandidate.kind
      || strategy.applicationPlan?.componentKind
      || remoteCandidate.queryKind
  );
  const family = safeString(normalizeLayerForAssetMatching(layer).templateFamily);
  const layerType = safeString(layer.layerType);
  const structuredLayer = isStructuredLayerType(layerType);
  const haystack = `${asset.name || ""} ${asset.path || ""} ${roleTags.join(" ")}`.toLowerCase();
  const reasons = [];
  let score = 0;

  if (provider === "office-timeline" && family !== "timeline") {
    return scoredZero("office-timeline-non-timeline-layer");
  }

  if (candidateProvider && provider === candidateProvider) add(34, "provider-match");
  if (candidateProvider && provider !== candidateProvider) add(-24, "provider-mismatch");
  if (candidateKind && isKindCompatible(candidateKind, assetKind, roleTags)) add(28, "kind-compatible");
  if (!candidateProvider && structuredLayer && provider === "officeplus" && isTemplateLike(assetKind, roleTags)) add(12, "structured-layer-provider-fallback");
  if (!candidateKind && structuredLayer && isStructuredTemplateAsset(assetKind, roleTags)) add(24, "structured-layer-kind-fallback");
  if (strategy.mode === "plugin-component-template" && isEditableTemplateLike(assetKind)) add(24, "template-ready");
  if ((candidateKind === "component" || strategy.mode === "plugin-component-template") && assetKind === "bitmap-reference") add(-30, "bitmap-is-style-reference-only");
  if (strategy.mode === "preserve-crop-with-component-reference" && isReferenceLike(assetKind)) add(18, "style-reference");
  for (const token of familyTokens(family)) {
    if (token && haystack.includes(token.toLowerCase())) add(8, `family-token:${token}`);
  }
  const learnedStructure = scoreLearnedStructureCompatibility(asset.learningSummary, {
    family,
    layerType,
    layer,
    appliedComponent: roleTags.includes("applied-component"),
    targetMotifs: inferTargetMotifs({ layer, remoteCandidate, strategy })
  });
  if (learnedStructure.score !== 0) addMany(learnedStructure.score, learnedStructure.reasons || [learnedStructure.reason]);
  if (roleTags.includes("diagram")) add(10, "diagram-tag");
  if (roleTags.includes("template-layout")) add(8, "template-layout-tag");
  if (roleTags.includes("downloaded-component")) add(18, "downloaded-component");
  if (roleTags.includes("applied-component")) add(30, "applied-component");
  if (roleTags.includes("self-fidelity-promoted") && asset.selfFidelity?.passed === true) add(24, "self-fidelity-promoted");
  if (roleTags.includes("generic-installed-template")) add(-18, "generic-installed-template");
  if (roleTags.includes("vector")) add(6, "vector-tag");
  if (assetKind === "embedded-template-store") add(4, "inspect-only-store");
  if (!safeString(asset.path) || !path.isAbsolute(asset.path)) add(-20, "non-absolute-path");

  score = Math.max(0, score);
  return {
    id: safeString(asset.id),
    provider,
    path: safeString(asset.path),
    name: safeString(asset.name),
    modifiedAt: safeString(asset.modifiedAt),
    sizeBytes: Number.isFinite(Number(asset.sizeBytes)) ? Number(asset.sizeBytes) : null,
    assetKind,
    roleTags,
    reusePolicy: safeString(asset.reusePolicy),
    matchScore: round(score),
    suggestedUse: suggestedUseFor({ assetKind, roleTags }),
    reasonCodes: reasons,
    learningSummary: asset.learningSummary && typeof asset.learningSummary === "object" ? asset.learningSummary : null,
    selfFidelityPromoted: asset.selfFidelityPromoted === true,
    selfFidelity: asset.selfFidelity && typeof asset.selfFidelity === "object" ? asset.selfFidelity : null
  };

  function add(value, code) {
    score += value;
    if (value > 0) reasons.push(code);
  }

  function addMany(value, codes = []) {
    score += value;
    if (value <= 0) return;
    for (const code of codes.map(safeString).filter(Boolean)) reasons.push(code);
  }

  function scoredZero(code) {
    return {
      id: safeString(asset.id),
      provider,
      path: safeString(asset.path),
      name: safeString(asset.name),
      assetKind,
      roleTags,
      reusePolicy: safeString(asset.reusePolicy),
      matchScore: 0,
      suggestedUse: suggestedUseFor({ assetKind, roleTags }),
      reasonCodes: [code],
      learningSummary: asset.learningSummary && typeof asset.learningSummary === "object" ? asset.learningSummary : null,
      selfFidelityPromoted: asset.selfFidelityPromoted === true,
      selfFidelity: asset.selfFidelity && typeof asset.selfFidelity === "object" ? asset.selfFidelity : null
    };
  }
}

function normalizeLayerForAssetMatching(layer = {}) {
  const nativeComponent = nativeComponentSignature(layer);
  const archetype = layer.archetype || layer.diagramUnderstanding?.archetype || nativeComponent.archetype || "";
  const normalizeTemplateFamily = componentCandidatePlannerPrivate?.normalizeTemplateFamily;
  const templateFamily = typeof normalizeTemplateFamily === "function"
    ? normalizeTemplateFamily(layer.templateFamily, archetype, { layerType: layer.layerType })
    : safeString(layer.templateFamily || "unknown");
  return {
    ...layer,
    templateFamily,
    ...(nativeComponent.present ? { nativeComponent } : {})
  };
}

function isStructuredLayerType(layerType) {
  return /table|matrix|grid|diagram|chart/.test(safeString(layerType));
}

function isStructuredTemplateAsset(assetKind, roleTags = []) {
  return isEditableTemplateLike(assetKind)
    || assetKind === "vector-component"
    || roleTags.includes("diagram")
    || roleTags.includes("template-layout");
}

function isKindCompatible(kind, assetKind, roleTags = []) {
  if (kind === "component") return isEditableTemplateLike(assetKind) || assetKind === "vector-component";
  if (kind === "diagram" || kind === "smartdiagram") return roleTags.includes("diagram") || isTemplateLike(assetKind, roleTags);
  if (kind === "vector" || kind === "icon") return assetKind === "vector-component" || roleTags.includes("icon");
  if (kind === "shape") return assetKind === "vector-component" || roleTags.includes("diagram");
  if (kind === "ppt" || kind === "template") return assetKind === "presentation-template";
  return false;
}

function isTemplateLike(assetKind, roleTags = []) {
  return assetKind === "presentation-template" || roleTags.includes("template-layout");
}

function isEditableTemplateLike(assetKind) {
  return assetKind === "presentation-template" || assetKind === "component-metadata";
}

function isReferenceLike(assetKind) {
  return assetKind === "presentation-template"
    || assetKind === "vector-component"
    || assetKind === "bitmap-reference"
    || assetKind === "component-metadata";
}

function suggestedUseFor({ assetKind, roleTags = [] }) {
  if (assetKind === "presentation-template" && roleTags.includes("applied-component")) {
    return "extract-openxml-groups-from-applied-plugin-component";
  }
  if (assetKind === "presentation-template" && roleTags.includes("downloaded-component")) {
    return "inspect-downloaded-plugin-component-openxml";
  }
  if (assetKind === "presentation-template") return "inspect-openxml-groups-and-learn-editable-component";
  if (assetKind === "vector-component") return "reuse-vector-style-or-convert-to-native-freeform-after-license-review";
  if (assetKind === "bitmap-reference") return "sample-visual-style-only";
  if (assetKind === "component-metadata") return "inspect-component-metadata";
  if (assetKind === "embedded-template-store") return "inspect-private-store-only";
  if (roleTags.includes("template-layout")) return "learn-template-layout";
  return "manual-review";
}

function summarizeReadiness({ layer = {}, strategy = {}, matches = [] }) {
  const directEditableAssets = matches.filter((asset) => asset.assetKind === "presentation-template").length;
  const appliedEditableAssets = matches.filter((asset) =>
    asset.assetKind === "presentation-template"
    && Array.isArray(asset.roleTags)
    && asset.roleTags.includes("applied-component")).length;
  const targetMotifs = inferTargetMotifs({ layer, strategy });
  const appliedMotifReadyAssets = matches.filter((asset) =>
    asset.assetKind === "presentation-template"
    && Array.isArray(asset.roleTags)
    && asset.roleTags.includes("applied-component")
    && assetMatchesTargetMotif(asset, targetMotifs)).length;
  const appliedKnownMotifAssets = matches.filter((asset) =>
    asset.assetKind === "presentation-template"
    && Array.isArray(asset.roleTags)
    && asset.roleTags.includes("applied-component")
    && assetHasLearnedMotifs(asset)).length;
  const vectorAssets = matches.filter((asset) => asset.assetKind === "vector-component").length;
  const currentStep = safeString(strategy.applicationPlan?.currentStep || "");
  if (appliedMotifReadyAssets > 0) {
    return {
      status: "applied-plugin-motif-ready",
      nextStep: "reuse-openxml-groups-from-applied-plugin-template-for-target-motif",
      currentStep,
      targetMotifs,
      appliedMotifReadyAssets
    };
  }
  if (appliedKnownMotifAssets > 0 && targetMotifs.length > 0) {
    return {
      status: "applied-plugin-template-motif-mismatch",
      nextStep: "find-or-download-applied-plugin-template-with-matching-target-motif",
      currentStep,
      targetMotifs,
      appliedMotifReadyAssets
    };
  }
  if (appliedEditableAssets > 0) {
    return {
      status: "applied-plugin-template-learning-ready",
      nextStep: "extract-openxml-grouped-shapes-from-applied-plugin-template",
      currentStep,
      targetMotifs
    };
  }
  if (directEditableAssets > 0) {
    return {
      status: "local-template-learning-ready",
      nextStep: "extract-openxml-grouped-shapes-from-local-template",
      currentStep,
      targetMotifs
    };
  }
  if (vectorAssets > 0) {
    return {
      status: "local-vector-style-ready",
      nextStep: "convert-or-match-vector-assets-for-icons-and-shape-style",
      currentStep,
      targetMotifs
    };
  }
  return {
    status: matches.length > 0 ? "local-reference-only" : "remote-candidate-only",
    nextStep: matches.length > 0 ? "inspect-local-reference-before-native-rebuild" : "download-or-auth-required-before-template-import",
    currentStep,
    targetMotifs
  };
}

function buildComponentAcquisitionTasks({ layer = {}, strategy = {}, readiness = {}, remoteCandidate = {} } = {}) {
  const status = safeString(readiness.status);
  if (shouldSuppressAcquisitionForProtectedPreserveLayer({ layer, strategy })) return [];
  if (shouldSuppressAcquisitionForDeferredUncertainPreserveLayer({ layer, strategy })) return [];
  if (shouldSuppressAcquisitionForCompletedNativeStyleGuideLayer({ strategy })) return [];
  const targetMotifs = inferTargetMotifs({ layer, strategy, remoteCandidate });
  if (targetMotifs.length === 0) return [];
  const needsAcquisition = status === "applied-plugin-template-motif-mismatch"
    || status === "remote-candidate-only"
    || status === "local-reference-only";
  if (!needsAcquisition) return [];
  const family = safeString(normalizeLayerForAssetMatching(layer).templateFamily || layer.templateFamily || "generic");
  const providers = providerPreferenceForAcquisition({ strategy, remoteCandidate });
  const keywords = targetMotifKeywords(targetMotifs, family);
  const tasks = [];
  for (const provider of providers) {
    for (const kind of acquisitionKindsFor({ provider, family, targetMotifs })) {
      tasks.push({
        provider,
        kind,
        keywords: keywords[0] || family || "关系图",
        alternateKeywords: keywords.slice(1, 6),
        targetMotifs,
        templateFamily: family,
        reason: acquisitionReasonFor({ status, provider, kind, targetMotifs })
      });
    }
  }
  return tasks.slice(0, 6);
}

function shouldSuppressAcquisitionForProtectedPreserveLayer({ layer = {}, strategy = {} } = {}) {
  const mode = safeString(strategy.mode || layer.componentRenderStrategy?.mode).toLowerCase();
  if (mode !== "preserve-local-crop") return false;
  const text = [
    layer.layerType,
    layer.detector,
    layer.templateFamily,
    layer.expressionForm,
    layer.expressionSubtype,
    layer.recommendedAction,
    layer.reason,
    layer.nonEditableReason,
    strategy.editableExpectation,
    strategy.reason,
    strategy.applicationPlan?.currentStep,
    strategy.applicationPlan?.targetStep
  ].map((value) => safeString(value).toLowerCase()).join(" ");
  if (/replace-with-native-components|plugin-component-template|local-match|apply-component/.test(text)) return false;
  return /preserve|keep|crop|fidelity|minimum/.test(text)
    && /screenshot|document|ui|prototype|decorative|cover|brand|logo|icon|illustration|photo|sketch|图标|图示|插画|截图/.test(text);
}

function shouldSuppressAcquisitionForDeferredUncertainPreserveLayer({ layer = {}, strategy = {} } = {}) {
  const mode = safeString(strategy.mode || layer.componentRenderStrategy?.mode).toLowerCase();
  if (mode !== "preserve-local-crop") return false;
  const plan = strategy.applicationPlan || {};
  const explicitMotifs = [
    ...(Array.isArray(layer.targetMotifs) ? layer.targetMotifs : []),
    ...(Array.isArray(layer.plan?.targetMotifs) ? layer.plan.targetMotifs : []),
    ...(Array.isArray(layer.diagramUnderstanding?.targetMotifs) ? layer.diagramUnderstanding.targetMotifs : []),
    ...(Array.isArray(layer.diagramUnderstanding?.componentStrategy?.targetMotifs) ? layer.diagramUnderstanding.componentStrategy.targetMotifs : []),
    ...(Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : []),
    ...(Array.isArray(plan.targetMotifs) ? plan.targetMotifs : [])
  ].map(normalizeMotif).filter(Boolean);
  if (explicitMotifs.length > 0) return false;
  const targetStep = safeString(plan.targetStep).toLowerCase();
  const currentStep = safeString(plan.currentStep).toLowerCase();
  const reason = safeString(strategy.reason || layer.reason || layer.nonEditableReason).toLowerCase();
  const requiresDownload = plan.requiresDownload === true;
  return !requiresDownload
    && /preserve-source-crop/.test(currentStep)
    && /retry-component-search-after-better-layer-understanding/.test(targetStep)
    && /no reliable reusable component|more evidence|uncertain|unclassified|no reliable/.test(reason);
}

function shouldSuppressAcquisitionForCompletedNativeStyleGuideLayer({ strategy = {} } = {}) {
  const mode = safeString(strategy.mode).toLowerCase();
  if (mode !== "native-rebuild-with-component-style-guide") return false;
  const plan = strategy.applicationPlan || {};
  const currentStep = safeString(plan.currentStep).toLowerCase();
  const targetStep = safeString(plan.targetStep).toLowerCase();
  return /rebuild-native-primitives-guided-by-component-style/.test(currentStep)
    && /replace-low-confidence-primitives-with-plugin-components-when-match-confidence-improves/.test(targetStep);
}

function providerPreferenceForAcquisition({ strategy = {}, remoteCandidate = {} } = {}) {
  const preferred = [
    safeString(remoteCandidate.sourceProvider || remoteCandidate.queryProvider),
    safeString(strategy.applicationPlan?.sourceProvider)
  ].filter(Boolean);
  const fallback = ["officeplus", "islide"];
  return [...new Set([...preferred, ...fallback])]
    .filter((provider) => /^(officeplus|islide)$/.test(provider));
}

function acquisitionKindsFor({ provider, family, targetMotifs = [] } = {}) {
  if (provider === "islide") {
    if (family === "hub-spoke" || targetMotifs.includes("radial-link")) return ["diagram", "smartdiagram"];
    if (family === "cycle-loop" || targetMotifs.includes("cycle-loop") || targetMotifs.includes("arc-arrow")) return ["diagram", "smartdiagram", "vector"];
    if (family === "screenshot-card-grid" || targetMotifs.includes("screenshot-card-grid") || targetMotifs.includes("screenshot-crop")) return ["diagram", "smartdiagram", "template"];
    if (family === "visual-example-card-grid" || targetMotifs.includes("visual-example-card-grid") || targetMotifs.includes("visual-example-crop")) return ["diagram", "smartdiagram", "template"];
    if (family === "feature-icon-card-grid" || targetMotifs.includes("feature-icon-card-grid") || targetMotifs.includes("icon-crop")) return ["diagram", "smartdiagram", "template", "icon", "vector"];
    if (family === "numbered-step-card-grid" || targetMotifs.includes("numbered-step-card-grid") || targetMotifs.includes("step-badge")) return ["diagram", "smartdiagram", "template", "vector"];
    if (family === "screenshot-zoom-callout" || targetMotifs.includes("screenshot-zoom-callout") || targetMotifs.includes("zoom-lens-overlay")) return ["diagram", "smartdiagram", "template", "vector"];
    if (family === "screenshot-annotation" || targetMotifs.includes("screenshot-annotation") || targetMotifs.includes("callout-overlay")) return ["diagram", "smartdiagram", "template", "vector"];
    if (family === "concentric-circles" || targetMotifs.includes("concentric-circles")) return ["diagram", "smartdiagram", "template"];
    if (family === "grid-or-matrix" || targetMotifs.includes("card-grid")) return ["diagram", "smartdiagram"];
    if (family === "pie-chart" || targetMotifs.includes("pie-share-chart")) return ["smartdiagram", "template"];
    if (family === "sankey-flow-chart" || targetMotifs.includes("sankey-flow-chart")) return ["diagram", "smartdiagram", "template"];
    if (family === "map-chart" || targetMotifs.includes("map-chart")) return ["diagram", "smartdiagram", "template"];
    if (family === "word-cloud-chart" || targetMotifs.includes("word-cloud-chart")) return ["diagram", "smartdiagram", "template"];
    if (family === "waterfall-chart" || targetMotifs.includes("waterfall-chart")) return ["smartdiagram", "template"];
    if (family === "gauge-chart" || targetMotifs.includes("gauge-chart")) return ["diagram", "smartdiagram", "template"];
    if (family === "radar-chart" || targetMotifs.includes("radar-chart")) return ["smartdiagram", "template"];
    if (family === "treemap-chart" || targetMotifs.includes("treemap-chart")) return ["diagram", "smartdiagram", "template"];
    if (family === "scatter-chart" || targetMotifs.includes("bubble-scatter-chart")) return ["diagram", "smartdiagram", "template"];
    if (family === "donut-chart" || targetMotifs.includes("donut-segment-chart")) return ["smartdiagram", "template"];
    if (family === "fishbone-cause-effect" || targetMotifs.includes("fishbone-cause")) return ["diagram", "smartdiagram", "template"];
    if (family === "swimlane-flow" || targetMotifs.includes("swimlane-flow")) return ["diagram", "smartdiagram", "template"];
    if (family === "hierarchy-tree" || targetMotifs.includes("org-hierarchy") || targetMotifs.includes("tree-link")) return ["diagram", "smartdiagram", "template"];
    if (family === "quadrant-matrix" || targetMotifs.includes("quadrant-axis")) return ["diagram", "smartdiagram", "template"];
    if (targetMotifs.includes("comparison-matrix") || targetMotifs.includes("heatmap-matrix")) return ["diagram", "smartdiagram", "template"];
    if (family === "timeline" || targetMotifs.includes("linear-arrow-chain") || targetMotifs.includes("whole-process-template")) return ["diagram", "smartdiagram", "template"];
    return ["diagram"];
  }
  if (family === "hub-spoke" || targetMotifs.includes("radial-link")) return ["component", "shape", "vector"];
  if (family === "cycle-loop" || targetMotifs.includes("cycle-loop") || targetMotifs.includes("arc-arrow")) return ["component", "shape", "vector"];
  if (family === "screenshot-card-grid" || targetMotifs.includes("screenshot-card-grid") || targetMotifs.includes("screenshot-crop")) return ["component", "shape", "ppt"];
  if (family === "visual-example-card-grid" || targetMotifs.includes("visual-example-card-grid") || targetMotifs.includes("visual-example-crop")) return ["component", "shape", "ppt"];
  if (family === "feature-icon-card-grid" || targetMotifs.includes("feature-icon-card-grid") || targetMotifs.includes("icon-crop")) return ["component", "shape", "icon", "vector", "ppt"];
  if (family === "numbered-step-card-grid" || targetMotifs.includes("numbered-step-card-grid") || targetMotifs.includes("step-badge")) return ["component", "shape", "vector", "ppt"];
  if (family === "screenshot-zoom-callout" || targetMotifs.includes("screenshot-zoom-callout") || targetMotifs.includes("zoom-lens-overlay")) return ["component", "shape", "vector", "ppt"];
  if (family === "screenshot-annotation" || targetMotifs.includes("screenshot-annotation") || targetMotifs.includes("callout-overlay")) return ["component", "shape", "vector", "ppt"];
  if (family === "concentric-circles" || targetMotifs.includes("concentric-circles")) return ["component", "shape", "ppt"];
  if (family === "venn-overlap" || targetMotifs.includes("venn-overlap") || targetMotifs.includes("intersection-overlap")) return ["component", "shape", "vector", "ppt"];
  if (family === "layered-stack" || targetMotifs.includes("layered-stack") || targetMotifs.includes("pyramid-stack") || targetMotifs.includes("funnel-stack")) return ["component", "shape", "vector", "ppt"];
  if (family === "grid-or-matrix" || targetMotifs.includes("card-grid")) return ["component", "shape"];
  if (family === "pie-chart" || targetMotifs.includes("pie-share-chart")) return ["component", "ppt"];
  if (family === "sankey-flow-chart" || targetMotifs.includes("sankey-flow-chart")) return ["component", "ppt"];
  if (family === "map-chart" || targetMotifs.includes("map-chart")) return ["component", "shape", "ppt"];
  if (family === "word-cloud-chart" || targetMotifs.includes("word-cloud-chart")) return ["component", "shape", "ppt"];
  if (family === "waterfall-chart" || targetMotifs.includes("waterfall-chart")) return ["component", "ppt"];
  if (family === "gauge-chart" || targetMotifs.includes("gauge-chart")) return ["component", "shape", "ppt"];
  if (family === "radar-chart" || targetMotifs.includes("radar-chart")) return ["component", "ppt"];
  if (family === "treemap-chart" || targetMotifs.includes("treemap-chart")) return ["component", "shape", "ppt"];
  if (family === "scatter-chart" || targetMotifs.includes("bubble-scatter-chart")) return ["component", "shape", "ppt"];
  if (family === "donut-chart" || targetMotifs.includes("donut-segment-chart")) return ["component", "shape", "ppt"];
  if (family === "fishbone-cause-effect" || targetMotifs.includes("fishbone-cause")) return ["component", "shape", "vector", "ppt"];
  if (family === "swimlane-flow" || targetMotifs.includes("swimlane-flow")) return ["component", "shape", "ppt"];
  if (family === "hierarchy-tree" || targetMotifs.includes("org-hierarchy") || targetMotifs.includes("tree-link")) return ["component", "shape", "ppt"];
  if (family === "quadrant-matrix" || targetMotifs.includes("quadrant-axis")) return ["component", "shape", "ppt"];
  if (targetMotifs.includes("comparison-matrix") || targetMotifs.includes("heatmap-matrix")) return ["component", "shape", "ppt"];
  if (family === "timeline" || targetMotifs.includes("linear-arrow-chain") || targetMotifs.includes("whole-process-template") || targetMotifs.includes("milestone-roadmap") || targetMotifs.includes("gantt-roadmap")) return ["component", "ppt", "vector"];
  return ["component"];
}

function targetMotifKeywords(targetMotifs = [], family = "") {
  const keywords = [];
  for (const motif of targetMotifs) {
    if (motif === "cycle-loop") keywords.push("循环流程", "闭环流程", "循环箭头组件", "环形箭头组件", "旋转箭头");
    else if (motif === "arc-arrow") keywords.push("圆弧箭头", "环形箭头", "循环箭头", "弧形箭头", "旋转箭头");
    else if (motif === "ring-node") keywords.push("环形节点", "圆环节点");
    else if (motif === "card-grid") keywords.push("卡片矩阵", "矩阵卡片", "宫格卡片");
    else if (motif === "tree-link") keywords.push("树状层级", "组织结构图", "层级关系图");
    else if (motif === "radial-link") keywords.push("中心辐射", "放射关系图", "径向关系", "中心关系图");
    else if (motif === "screenshot-card-grid") keywords.push("产品截图展示", "界面展示", "截图卡片", "截图宫格", "多屏展示", "mockup cards", "screen gallery");
    else if (motif === "screenshot-crop") keywords.push("产品截图", "界面截图", "截图占位", "screen placeholder", "mockup placeholder");
    else if (motif === "visual-example-card-grid") keywords.push("图示样例卡片", "组件预览卡片", "素材预览卡片", "示例图示卡片", "diagram sample cards", "component preview cards");
    else if (motif === "visual-example-crop") keywords.push("图示样例", "组件预览", "插件预览", "素材预览", "示例图示", "diagram sample", "component preview");
    else if (motif === "feature-icon-card-grid") keywords.push("功能卡片", "图标卡片", "特性卡片", "能力卡片", "亮点卡片", "feature cards", "icon cards");
    else if (motif === "icon-crop") keywords.push("图标组件", "线性图标", "扁平图标", "icon set", "pictogram");
    else if (motif === "numbered-step-card-grid") keywords.push("步骤卡片", "编号流程", "序号卡片", "阶段卡片", "流程卡片", "step cards", "numbered process cards");
    else if (motif === "step-badge") keywords.push("编号圆点", "步骤编号", "序号圆点", "数字角标", "number badge", "step badge");
    else if (motif === "screenshot-zoom-callout") keywords.push("局部放大", "放大镜标注", "截图局部放大", "细节放大", "zoom callout", "magnifier callout");
    else if (motif === "zoom-lens-overlay") keywords.push("放大镜", "放大框", "局部放大框", "zoom lens", "magnifier lens", "loupe");
    else if (motif === "screenshot-annotation") keywords.push("截图标注", "界面标注", "页面标注", "截图说明", "annotated screenshot");
    else if (motif === "callout-overlay") keywords.push("说明气泡", "标注气泡", "注释框", "callout");
    else if (motif === "highlight-box") keywords.push("高亮框", "框选", "圈选", "重点标记");
    else if (motif === "concentric-circles") keywords.push("同心圆", "洋葱图", "圈层模型", "层级圆", "嵌套圆");
    else if (motif === "venn-overlap") keywords.push("维恩图", "交集关系图", "重叠关系", "集合关系图", "venn diagram", "overlap diagram");
    else if (motif === "intersection-overlap") keywords.push("交集关系", "交叉关系图", "重叠区域", "关系交集", "intersection diagram");
    else if (motif === "layered-stack") keywords.push("层叠结构", "分层架构", "堆叠层级", "层级堆叠", "layered stack", "stacked layers");
    else if (motif === "pyramid-stack") keywords.push("金字塔模型", "金字塔结构", "三角层级", "分层金字塔", "pyramid diagram");
    else if (motif === "funnel-stack") keywords.push("漏斗模型", "漏斗流程", "转化漏斗", "分层漏斗", "funnel diagram");
    else if (motif === "linear-arrow-chain") keywords.push("箭头流程", "步骤箭头", "流程箭头", "时间轴", "路线图");
    else if (motif === "milestone-roadmap") keywords.push("里程碑路线图", "时间轴路线图", "项目路线图", "路线图组件", "milestone roadmap");
    else if (motif === "gantt-roadmap") keywords.push("甘特路线图", "项目排期", "时间计划图", "项目时间轴", "gantt roadmap");
    else if (motif === "whole-process-template") keywords.push("整组流程组件", "流程组件", "步骤组件", "一体化流程图");
    else if (motif === "pie-share-chart") keywords.push("饼图", "扇区占比图", "份额占比图", "比例饼图", "分段饼图", "多扇区饼图");
    else if (motif === "sankey-flow-chart") keywords.push("桑基图", "流向图", "流量分布图", "流转分布图", "能量流图");
    else if (motif === "map-chart") keywords.push("地图图表", "中国地图", "区域地图", "地理分布图", "地图热力图");
    else if (motif === "word-cloud-chart") keywords.push("词云", "词云组件", "关键词云", "标签云", "文字云");
    else if (motif === "waterfall-chart") keywords.push("瀑布图", "增减分析图", "差异桥图");
    else if (motif === "gauge-chart") keywords.push("仪表图", "仪表盘图", "速度表", "半圆仪表", "进度仪表");
    else if (motif === "radar-chart") keywords.push("雷达图", "蛛网图", "能力雷达", "维度评分图");
    else if (motif === "treemap-chart") keywords.push("矩形树图", "面积占比图", "构成分布图", "份额构成图", "treemap");
    else if (motif === "bubble-scatter-chart") keywords.push("气泡图", "气泡矩阵", "散点气泡图", "组合分布图", "产品组合矩阵", "bubble chart");
    else if (motif === "donut-segment-chart") keywords.push("分段环形图", "多段占比图", "环形占比图", "segment donut", "donut chart");
    else if (motif === "fishbone-cause") keywords.push("鱼骨图", "因果分析", "根因分析", "Ishikawa", "cause effect diagram");
    else if (motif === "org-hierarchy") keywords.push("组织架构", "组织结构图", "部门架构", "岗位层级", "汇报关系图", "org chart");
    else if (motif === "swimlane-flow") keywords.push("泳道流程", "跨部门流程", "泳道图", "分栏流程", "多角色流程", "swimlane process");
    else if (motif === "quadrant-axis") keywords.push("四象限", "象限图", "优先级矩阵", "影响成本矩阵", "价值难度矩阵", "impact effort matrix");
    else if (motif === "comparison-matrix") keywords.push("对比矩阵", "方案对比", "竞品对比", "优劣对比", "优缺点对比", "comparison table");
    else if (motif === "heatmap-matrix") keywords.push("热力图", "热力矩阵", "风险矩阵", "色阶矩阵", "色块矩阵", "heatmap");
    else if (motif === "topology-triangle") keywords.push("拓扑三角", "铁三角关系", "三角关系图", "三元关系", "triangle topology", "relationship triangle");
  }
  if (family === "hub-spoke") keywords.push("关系图", "中心总分");
  if (family === "topology-diagram") keywords.push("拓扑关系图", "铁三角关系", "三角关系图", "闭环关系图");
  if (family === "cycle-loop") keywords.push("循环流程", "闭环流程", "循环箭头组件", "环形箭头组件", "弧形箭头组件", "旋转箭头");
  if (family === "venn-overlap") keywords.push("维恩图组件", "交集关系组件", "重叠关系组件");
  if (family === "layered-stack") keywords.push("层叠结构组件", "分层结构组件", "金字塔模型组件", "漏斗模型组件");
  if (family === "treemap-chart") keywords.push("矩形树图组件", "面积占比组件", "构成分布组件");
  if (family === "scatter-chart") keywords.push("气泡图组件", "散点图组件", "组合分布图组件");
  if (family === "donut-chart") keywords.push("环形图组件", "分段环形图组件", "占比图组件");
  if (family === "fishbone-cause-effect") keywords.push("鱼骨图组件", "因果分析组件", "根因分析组件");
  if (family === "swimlane-flow") keywords.push("泳道流程组件", "跨部门流程组件", "多角色流程组件");
  if (family === "hierarchy-tree") keywords.push("组织架构组件", "层级结构组件", "树状关系组件");
  if (family === "quadrant-matrix") keywords.push("四象限组件", "象限图组件", "优先级矩阵组件");
  if (family === "grid-or-matrix") keywords.push("矩阵组件", "对比矩阵组件", "热力矩阵组件");
  if (family === "timeline") keywords.push("路线图组件", "里程碑组件", "项目排期组件");
  if (family === "screenshot-card-grid") keywords.push("产品截图展示", "界面展示组件", "截图卡片组件", "多屏展示组件");
  if (family === "visual-example-card-grid") keywords.push("图示样例卡片", "组件预览卡片", "素材预览卡片", "示例图示卡片");
  if (family === "feature-icon-card-grid") keywords.push("功能卡片组件", "图标卡片组件", "特性卡片组件", "能力卡片组件");
  if (family === "numbered-step-card-grid") keywords.push("步骤卡片组件", "编号流程组件", "序号卡片组件", "阶段卡片组件");
  if (family === "screenshot-zoom-callout") keywords.push("局部放大组件", "放大镜标注组件", "放大框组件");
  if (family === "screenshot-annotation") keywords.push("截图标注组件", "说明气泡组件", "高亮框组件");
  return [...new Set(keywords.map(safeString).filter(Boolean))];
}

function acquisitionReasonFor({ status, provider, kind, targetMotifs = [] } = {}) {
  const motifText = targetMotifs.join(",");
  if (status === "applied-plugin-template-motif-mismatch") {
    return `download ${provider} ${kind} matching ${motifText}; current applied plugin components have a different learned motif`;
  }
  return `download ${provider} ${kind} matching ${motifText} before replacing preserved crop with editable plugin component`;
}

function assetMatchesTargetMotif(asset = {}, targetMotifs = []) {
  const targets = (Array.isArray(targetMotifs) ? targetMotifs : []).map(normalizeMotif).filter(Boolean);
  if (targets.length === 0) return false;
  const signature = asset.structureSignature || summarizeAssetStructureSignature(asset.learningSummary);
  if (!signature) return false;
  const motifs = new Set([
    normalizeMotif(signature.primaryMotif),
    ...(Array.isArray(signature.motifs) ? signature.motifs.map(normalizeMotif) : []),
    ...Object.keys(signature.motifCounts || {}).map(normalizeMotif)
  ].filter(Boolean));
  return targets.some((motif) => motifs.has(motif));
}

function assetHasLearnedMotifs(asset = {}) {
  const signature = asset.structureSignature || summarizeAssetStructureSignature(asset.learningSummary);
  if (!signature) return false;
  return !!normalizeMotif(signature.primaryMotif)
    || (Array.isArray(signature.motifs) && signature.motifs.some(normalizeMotif))
    || Object.keys(signature.motifCounts || {}).some(normalizeMotif);
}

function summarizeRemoteCandidate(candidate = {}) {
  return {
    sourceProvider: safeString(candidate.sourceProvider || candidate.queryProvider),
    kind: safeString(candidate.kind || candidate.queryKind),
    id: safeString(candidate.id),
    title: safeString(candidate.title),
    reuseHint: safeString(candidate.reuseHint),
    confidence: numberOrNull(candidate.confidence),
    candidateScore: numberOrNull(candidate.candidateScore)
  };
}

function summarizeLayerEntries(layers = []) {
  const summary = {
    layers: layers.length,
    layersWithLocalAssets: 0,
    localAssetMatches: 0,
    assetsWithRecommendedGroups: 0,
    recommendedGroupMatches: 0,
    highReusableGroupMatches: 0,
    byReadiness: {},
    byProvider: {},
    byAssetKind: {},
    byRecommendedGroup: {},
    byStructureSignature: {},
    byReuseReadiness: {},
    acquisitionTasks: 0,
    byAcquisitionProvider: {},
    byAcquisitionMotif: {}
  };
  for (const layer of layers) {
    if ((layer.localAssets || []).length > 0) summary.layersWithLocalAssets += 1;
    summary.localAssetMatches += (layer.localAssets || []).length;
    addCount(summary.byReadiness, layer.readiness?.status || "unknown");
    for (const asset of layer.localAssets || []) {
      addCount(summary.byProvider, asset.provider || "unknown");
      addCount(summary.byAssetKind, asset.assetKind || "unknown");
      addCount(summary.byStructureSignature, asset.structureSignature?.primaryKind || "unknown");
      const groups = Array.isArray(asset.recommendedComponentGroups) ? asset.recommendedComponentGroups : [];
      if (groups.length > 0) summary.assetsWithRecommendedGroups += 1;
      summary.recommendedGroupMatches += groups.length;
      for (const group of groups) {
        addCount(summary.byRecommendedGroup, group.id || "unknown");
        const level = group.reuseReadiness?.level || "unknown";
        addCount(summary.byReuseReadiness, level);
        if (level === "high") summary.highReusableGroupMatches += 1;
      }
    }
    const tasks = Array.isArray(layer.componentAcquisitionTasks) ? layer.componentAcquisitionTasks : [];
    summary.acquisitionTasks += tasks.length;
    for (const task of tasks) {
      addCount(summary.byAcquisitionProvider, task.provider || "unknown");
      for (const motif of task.targetMotifs || []) addCount(summary.byAcquisitionMotif, motif || "unknown");
    }
  }
  return summary;
}

function layerKey(layer = {}) {
  const pageIndex = normalizeIndex(layer.pageIndex);
  const imageIndex = normalizeOptionalIndex(layer.imageIndex);
  if (imageIndex === null) {
    const shapeLayerId = safeString(layer.shapeLayerId || layer.detector || "shape-layer");
    return `${pageIndex}:shape:${shapeLayerId}`;
  }
  return `${pageIndex}:${imageIndex}`;
}

function addCount(target, key) {
  const safe = safeString(key || "unknown") || "unknown";
  target[safe] = (target[safe] || 0) + 1;
}

function familyTokens(family) {
  if (family === "process-chain") return ["流程", "process", "flow", "step"];
  if (family === "timeline") return ["时间轴", "timeline", "milestone"];
  if (family === "hub-spoke") return ["关系", "hub", "spoke", "center"];
  if (family === "screenshot-card-grid") return ["产品截图", "界面展示", "screenshot", "mockup", "gallery", "showcase"];
  if (family === "visual-example-card-grid") return ["图示样例", "组件预览", "素材预览", "示例图示", "sample", "preview", "example"];
  if (family === "feature-icon-card-grid") return ["功能卡片", "图标卡片", "feature", "icon", "card", "capability"];
  if (family === "numbered-step-card-grid") return ["步骤卡片", "编号流程", "序号卡片", "阶段卡片", "step", "numbered", "badge"];
  if (family === "screenshot-zoom-callout") return ["局部放大", "放大镜", "zoom", "magnifier", "detail"];
  if (family === "screenshot-annotation") return ["截图", "标注", "callout", "annotation", "highlight"];
  if (family === "grid-or-matrix") return ["矩阵", "matrix", "grid"];
  if (family === "venn-overlap") return ["维恩", "交集", "重叠", "venn", "overlap", "intersection"];
  if (family === "layered-stack") return ["层叠", "分层", "堆叠", "金字塔", "漏斗", "layer", "stack", "pyramid", "funnel"];
  if (family === "fishbone-cause-effect") return ["鱼骨", "因果", "根因", "fishbone", "cause", "effect", "ishikawa"];
  if (family === "swimlane-flow") return ["泳道", "跨部门", "多角色", "swimlane", "cross functional", "lane"];
  if (family === "hierarchy-tree") return ["组织架构", "层级", "树状", "上下级", "org", "hierarchy", "tree"];
  if (family === "quadrant-matrix") return ["四象限", "象限", "优先级", "影响成本", "quadrant", "impact", "effort"];
  if (family === "comparison-matrix") return ["对比", "比较", "竞品", "优劣", "comparison", "compare", "versus"];
  if (family === "heatmap-matrix") return ["热力", "风险矩阵", "色阶", "heatmap", "risk", "color"];
  if (family === "treemap-chart") return ["矩形树图", "面积", "构成", "份额", "treemap", "area", "composition"];
  if (family === "scatter-chart") return ["散点", "气泡", "分布", "scatter", "bubble", "portfolio"];
  if (family === "donut-chart") return ["环形", "占比", "分段", "donut", "ring", "segment"];
  if (family === "pie-chart") return ["饼图", "pie", "share"];
  if (family === "icon-or-illustration") return ["图标", "icon", "illustration"];
  return [family].filter(Boolean);
}

function scoreLearnedStructureCompatibility(learningSummary = null, context = {}) {
  const signature = summarizeAssetStructureSignature(learningSummary);
  if (!signature || signature.catalogGroups === 0) return { score: 0, reason: "" };
  const family = normalizeStructureFamily(context.family);
  if (!family || family === "generic") return { score: 0, reason: "" };
  const primary = normalizeStructureFamily(signature.primaryKind);
  const kinds = new Set((signature.kinds || []).map(normalizeStructureFamily).filter(Boolean));
  const exact = primary === family || kinds.has(family);
  const similarity = scoreStructureSignatureSimilarity(signature, context.layer);
  const nativeComponent = scoreNativeComponentCompatibility(signature, context.layer);
  if (exact) {
    const readinessBonus = signature.highReusableGroups > 0 ? 8 : 0;
    const appliedBonus = context.appliedComponent ? 4 : 0;
    const motifBonus = scoreTargetMotifCompatibility(signature, context.targetMotifs);
    return {
      score: 22 + readinessBonus + appliedBonus + motifBonus.score + similarity.score + nativeComponent.score,
      reason: nativeComponent.reason || motifBonus.reason || similarity.reason || `learned-structure:${family}`,
      reasons: [
        ...(nativeComponent.reasons || []),
        ...((motifBonus.reasons && motifBonus.reasons.length) ? motifBonus.reasons : [motifBonus.reason || `learned-structure:${family}`]),
        ...(similarity.reasons || [])
      ].filter(Boolean)
    };
  }
  const motifOnly = scoreTargetMotifCompatibility(signature, context.targetMotifs);
  if (motifOnly.score > 0) {
    return {
      score: motifOnly.score,
      reason: motifOnly.reason,
      reasons: (motifOnly.reasons && motifOnly.reasons.length ? motifOnly.reasons : [motifOnly.reason]).filter(Boolean)
    };
  }
  if (areCompatibleStructureFamilies(family, primary) || [...kinds].some((kind) => areCompatibleStructureFamilies(family, kind))) {
    return {
      score: 10 + Math.max(0, similarity.score) + nativeComponent.score,
      reason: nativeComponent.reason || similarity.reason || `learned-compatible-structure:${family}`,
      reasons: [
        ...(nativeComponent.reasons || []),
        `learned-compatible-structure:${family}`,
        ...(similarity.reasons || [])
      ].filter(Boolean)
    };
  }
  if (isStructuredLayerType(context.layerType) && signature.highReusableGroups > 0) {
    return {
      score: -14,
      reason: `learned-structure-mismatch:${family}`,
      reasons: [`learned-structure-mismatch:${family}`]
    };
  }
  return { score: 0, reason: "" };
}

function scoreNativeComponentCompatibility(signature = {}, layer = {}) {
  const native = nativeComponentSignature(layer);
  if (!native.present) return { score: 0, reason: "", reasons: [] };
  const reasons = [];
  let score = 0;
  const nativeArchetype = normalizeStructureFamily(native.archetype);
  const primary = normalizeStructureFamily(signature.primaryKind);
  const kinds = new Set((signature.kinds || []).map(normalizeStructureFamily).filter(Boolean));
  if (nativeArchetype && (primary === nativeArchetype || kinds.has(nativeArchetype) || areCompatibleStructureFamilies(nativeArchetype, primary))) {
    score += 16;
    reasons.push(`native-component-archetype:${nativeArchetype}`);
  }
  const actualParts = Number(signature.totals?.shapeCount || signature.totals?.childCount || 0);
  if (native.partCount > 1 && actualParts > 0) {
    const ratio = Math.max(native.partCount, actualParts) / Math.max(1, Math.min(native.partCount, actualParts));
    if (ratio <= 1.5) {
      score += 12;
      reasons.push("native-component-part-count-close");
    } else if (ratio <= 2.5) {
      score += 5;
      reasons.push("native-component-part-count-compatible");
    } else {
      score -= 8;
      reasons.push("native-component-part-count-different");
    }
  }
  if (native.replacementKey && Number(signature.totals?.pictureCount || 0) === 0) {
    score += 6;
    reasons.push("native-component-editable-template");
  }
  return {
    score: Math.max(-10, Math.min(34, score)),
    reason: reasons[0] || "",
    reasons
  };
}

function summarizeAssetStructureSignature(learningSummary = null) {
  const catalog = Array.isArray(learningSummary?.componentCatalog) ? learningSummary.componentCatalog : [];
  if (catalog.length === 0) return null;
  const counts = {};
  const kindScores = {};
  const motifCounts = {};
  let highReusableGroups = 0;
  let reusableGroups = 0;
  const totals = {
    childCount: 0,
    shapeCount: 0,
    connectorCount: 0,
    pictureCount: 0,
    textRuns: 0
  };
  for (const group of catalog) {
    const kind = normalizeStructureFamily(group?.structure?.kind || "unknown") || "unknown";
    counts[kind] = (counts[kind] || 0) + 1;
    kindScores[kind] = (kindScores[kind] || 0) + structureKindEvidenceScore(group, kind);
    const structureMotifs = Array.isArray(group?.structure?.motifs) ? group.structure.motifs : [];
    for (const motif of structureMotifs) {
      const safeMotif = normalizeMotif(motif);
      if (!safeMotif) continue;
      motifCounts[safeMotif] = (motifCounts[safeMotif] || 0) + 1;
    }
    for (const [motif, rawCount] of Object.entries(group?.structure?.motifCounts || {})) {
      const safeMotif = normalizeMotif(motif);
      if (!safeMotif) continue;
      motifCounts[safeMotif] = (motifCounts[safeMotif] || 0) + Math.max(1, Math.round(Number(rawCount) || 1));
    }
    const readiness = safeString(group?.reuseReadiness?.level).toLowerCase();
    if (readiness && readiness !== "avoid") reusableGroups += 1;
    if (readiness === "high") highReusableGroups += 1;
    for (const key of Object.keys(totals)) {
      totals[key] += Math.max(0, Math.round(Number(group?.[key]) || 0));
    }
  }
  // A component can contain a low-value decorative group alongside its reusable
  // timeline/diagram group. Choose the structural signature from the strongest
  // editable group instead of letting raw group count vote it down to "mixed".
  const kinds = Object.keys(counts).sort((a, b) =>
    kindScores[b] - kindScores[a]
    || counts[b] - counts[a]
    || a.localeCompare(b)
  );
  const motifs = Object.keys(motifCounts).sort((a, b) => motifCounts[b] - motifCounts[a] || a.localeCompare(b));
  return {
    provider: "component-structure-signature-v1",
    primaryKind: kinds[0] || "unknown",
    primaryMotif: motifs[0] || "",
    kinds: kinds.slice(0, 6),
    motifs: motifs.slice(0, 8),
    counts,
    kindScores,
    motifCounts,
    catalogGroups: catalog.length,
    reusableGroups,
    highReusableGroups,
    totals
  };
}

function structureKindEvidenceScore(group = {}, kind = "") {
  const normalizedKind = normalizeStructureFamily(kind);
  const readiness = safeString(group?.reuseReadiness?.level).toLowerCase();
  const readinessScore = readiness === "high" ? 60 : readiness === "medium" ? 28 : readiness === "low" ? 8 : 0;
  const explicitKindScore = normalizedKind && !["unknown", "mixed"].includes(normalizedKind) ? 18 : 0;
  const componentScore = Math.max(0, Math.min(20, Number(group?.componentScore || 0) * 0.1));
  return readinessScore + explicitKindScore + componentScore;
}

function scoreStructureSignatureSimilarity(signature = {}, layer = {}) {
  const target = summarizeLayerStructureSignature(layer);
  if (!target || target.signalCount === 0) return { score: 0, reason: "" };
  const totals = signature.totals || {};
  let score = 0;
  const reasons = [];
  score += closenessScore({
    expected: target.nodeCount,
    actual: Number(totals.shapeCount || totals.childCount || 0),
    good: 6,
    ok: 3,
    mismatch: -4,
    reason: "structure-node-count-close",
    mismatchReason: "structure-node-count-different",
    reasons
  });
  score += closenessScore({
    expected: target.connectorCount,
    actual: Number(totals.connectorCount || 0),
    good: 7,
    ok: 3,
    mismatch: -5,
    reason: "structure-connector-count-close",
    mismatchReason: "structure-connector-count-different",
    reasons
  });
  if (target.prefersLowPictureCount && Number(totals.pictureCount || 0) === 0) {
    score += 4;
    reasons.push("structure-native-no-picture-close");
  } else if (target.prefersLowPictureCount && Number(totals.pictureCount || 0) > Math.max(1, Number(totals.shapeCount || 0) * 0.35)) {
    score -= 6;
  }
  return {
    score: Math.max(-10, Math.min(18, score)),
    reason: reasons.find((reason) => reason.includes("-close")) || reasons[0] || "",
    reasons
  };
}

function summarizeLayerStructureSignature(layer = {}) {
  if (!layer || typeof layer !== "object") return null;
  const understanding = layer.diagramUnderstanding || {};
  const native = nativeComponentSignature(layer);
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
  const residualCount = Math.max(
    normalizeCount(layer.residualCount),
    normalizeCount(understanding.residualCount),
    Array.isArray(understanding.residuals) ? understanding.residuals.length : 0
  );
  const layerType = safeString(layer.layerType || "");
  const archetype = safeString(layer.archetype || understanding.archetype || "");
  const signalCount = [nodeCount, connectorCount, residualCount, layerType, archetype]
    .filter((value) => typeof value === "number" ? value > 0 : !!value).length;
  return {
    provider: "layer-structure-signature-v1",
    archetype: archetype || native.archetype,
    nodeCount,
    connectorCount,
    residualCount,
    signalCount: signalCount + (native.present ? 1 : 0),
    ...(native.present ? { nativeComponent: native } : {}),
    prefersLowPictureCount: /diagram|chart|matrix|grid|table/.test(layerType)
      || /flow|hub|tree|swimlane|matrix|chart|cycle/.test(archetype || native.archetype)
  };
}

function closenessScore({ expected, actual, good, ok, mismatch, reason, mismatchReason, reasons }) {
  if (!Number.isFinite(expected) || expected <= 0 || !Number.isFinite(actual) || actual <= 0) return 0;
  const ratio = Math.max(expected, actual) / Math.max(1, Math.min(expected, actual));
  if (ratio <= 1.35) {
    reasons.push(reason);
    return good;
  }
  if (ratio <= 2.25) {
    reasons.push(reason.replace("-close", "-compatible"));
    return ok;
  }
  reasons.push(mismatchReason);
  return mismatch;
}

function normalizeCount(value) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeStructureFamily(value) {
  const family = safeString(value).toLowerCase();
  if (!family) return "";
  if (family === "grid-or-matrix") return "matrix";
  if (family === "process") return "process-chain";
  if (family === "cycle" || family === "loop") return "cycle-loop";
  if (family === "hub" || family === "spoke" || family === "radial") return "hub-spoke";
  if (family === "org-chart" || family === "organization-chart" || family === "tree-structure") return "hierarchy-tree";
  if (family === "fishbone" || family === "cause-effect" || family === "ishikawa") return "fishbone-cause-effect";
  if (family === "swimlane" || family === "cross-functional-flow") return "swimlane-flow";
  if (family === "quadrant" || family === "quadrant-axis") return "quadrant-matrix";
  if (family === "comparison" || family === "comparison-table") return "comparison-matrix";
  if (family === "heatmap" || family === "risk-matrix") return "heatmap-matrix";
  if (family === "treemap" || family === "area-composition" || family === "area-map") return "treemap-chart";
  if (family === "bubble-chart" || family === "bubble-scatter" || family === "portfolio-bubble") return "scatter-chart";
  if (family === "segmented-donut" || family === "donut-segment" || family === "ring-chart") return "donut-chart";
  if (family === "segmented-pie" || family === "pie-segment") return "pie-chart";
  if (/^(bar|line|scatter|donut|pie)-chart$/.test(family)) return family;
  return family;
}

function areCompatibleStructureFamilies(target, learned) {
  if (!target || !learned) return false;
  if (target === learned) return true;
  const compatible = new Set([
    "process-chain:timeline",
    "timeline:process-chain",
    "process-chain:card-group",
    "card-group:process-chain",
    "matrix:card-group",
    "card-group:matrix",
    "hub-spoke:cycle-loop",
    "cycle-loop:hub-spoke",
    "bar-chart:chart",
    "line-chart:chart",
    "scatter-chart:chart",
    "donut-chart:chart",
    "pie-chart:chart",
    "pie-chart:donut-chart",
    "donut-chart:pie-chart"
  ]);
  return compatible.has(`${target}:${learned}`);
}

function nativeComponentSignature(layer = {}) {
  const source = layer.source || {};
  const style = layer.style || {};
  const archetype = safeString(
    layer.nativeComponentArchetype
    || source.nativeComponentArchetype
    || style.nativeComponentArchetype
    || layer.diagramUnderstanding?.nativeComponentArchetype
  );
  const replacementKey = safeString(
    layer.nativeComponentReplacementKey
    || source.nativeComponentReplacementKey
    || style.nativeComponentReplacementKey
  );
  const minimumUnit = safeString(
    layer.nativeComponentMinimumUnit
    || source.nativeComponentMinimumUnit
    || style.nativeComponentMinimumUnit
  );
  const partCount = normalizeCount(
    layer.nativeComponentPartCount
    || source.nativeComponentPartCount
    || style.nativeComponentPartCount
  );
  const bounds = normalizeBox(
    layer.nativeComponentBounds
    || source.nativeComponentBounds
    || style.nativeComponentBounds
    || layer.box
  );
  return {
    present: !!(archetype || replacementKey || minimumUnit || partCount > 0),
    archetype,
    replacementKey,
    minimumUnit,
    partCount,
    bounds
  };
}

function inferTargetMotifs({ layer = {}, remoteCandidate = {}, strategy = {} } = {}) {
  const explicit = [
    ...(Array.isArray(layer.targetMotifs) ? layer.targetMotifs : []),
    ...(Array.isArray(layer.plan?.targetMotifs) ? layer.plan.targetMotifs : []),
    ...(Array.isArray(layer.diagramUnderstanding?.targetMotifs) ? layer.diagramUnderstanding.targetMotifs : []),
    ...(Array.isArray(layer.diagramUnderstanding?.componentStrategy?.targetMotifs) ? layer.diagramUnderstanding.componentStrategy.targetMotifs : []),
    ...(Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : [])
  ].map(normalizeMotif).filter(Boolean);
  if (explicit.length > 0) return [...new Set(explicit)];
  const text = [
    layer.detector,
    layer.templateFamily,
    layer.archetype,
    layer.diagramUnderstanding?.archetype,
    remoteCandidate.title,
    remoteCandidate.reuseHint,
    strategy.bestCandidate?.title
  ].map(safeString).join(" ").toLowerCase();
  const motifs = new Set();
  if (/arc|circular|cycle|loop|圆弧|弧形|环形|循环|闭环|旋转箭头/.test(text)) {
    motifs.add("cycle-loop");
    motifs.add("arc-arrow");
  }
  if (/ring|donut|node|节点|圆环/.test(text)) motifs.add("ring-node");
  if (/pie|share|ratio|proportion|饼图|扇区|份额|占比|比例/.test(text) && !/donut|ring|环形|圆环/.test(text)) motifs.add("pie-share-chart");
  if (/matrix|grid|table|矩阵|宫格|卡片|表格/.test(text)) motifs.add("card-grid");
  if (/screenshot[-_\s]?card|screen[-_\s]?gallery|ui[-_\s]?showcase|mockup[-_\s]?card|product[-_\s]?screenshot|产品截图|界面截图|截图卡片|截图展示|界面展示|多屏展示/.test(text)) {
    motifs.add("screenshot-card-grid");
    motifs.add("screenshot-crop");
  }
  if (/visual[-_\s]?example[-_\s]?card|sample[-_\s]?(?:preview|card)|component[-_\s]?preview|plugin[-_\s]?preview|diagram[-_\s]?sample|illustration[-_\s]?sample|asset[-_\s]?preview|图示样例|图示示例|示意图样例|组件预览|插件预览|素材预览|素材样例|示例图示|图形示例|样例图|示例图/.test(text)) {
    motifs.add("visual-example-card-grid");
    motifs.add("visual-example-crop");
  }
  if (/feature|capability|icon[-_\s]?card|feature[-_\s]?card|功能卡片|特性卡片|能力卡片|图标卡片|亮点卡片/.test(text)) {
    motifs.add("feature-icon-card-grid");
    motifs.add("icon-crop");
  }
  if (/numbered[-_\s]?(?:step|card)|step[-_\s]?cards?|process[-_\s]?cards?|sequence[-_\s]?cards?|phase[-_\s]?cards?|步骤卡片|编号卡片|序号卡片|阶段卡片|流程卡片|步骤宫格|分步说明/.test(text)) {
    motifs.add("numbered-step-card-grid");
    motifs.add("step-badge");
  }
  if (/venn|overlap|intersection|set[-_\s]?relation|维恩|交集|重叠|集合关系|交叉关系/.test(text)) {
    motifs.add("venn-overlap");
    motifs.add("intersection-overlap");
  }
  if (/layer(?:ed)?[-_\s]?stack|stacked[-_\s]?layers?|architecture[-_\s]?layers?|层叠|分层|堆叠层级|层级堆叠/.test(text)) motifs.add("layered-stack");
  if (/pyramid|金字塔|三角层级|塔型结构/.test(text)) {
    motifs.add("layered-stack");
    motifs.add("pyramid-stack");
  }
  if (/funnel|漏斗|转化漏斗|分层漏斗/.test(text)) {
    motifs.add("layered-stack");
    motifs.add("funnel-stack");
  }
  if (/roadmap|milestone|里程碑|路线图|路线规划|阶段规划/.test(text)) motifs.add("milestone-roadmap");
  if (/gantt|甘特|排期|项目计划|时间计划/.test(text)) motifs.add("gantt-roadmap");
  if (/fishbone|cause[-_\s]?effect|root[-_\s]?cause|ishikawa|鱼骨图|因果分析|根因分析/.test(text)) motifs.add("fishbone-cause");
  if (/org[-_\s]?chart|organization[-_\s]?chart|hierarchy|组织架构|组织结构|部门架构|岗位层级|汇报关系|上下级/.test(text)) {
    motifs.add("org-hierarchy");
    motifs.add("tree-link");
  }
  if (/swimlane|cross[-_\s]?functional|lane[-_\s]?based|泳道|跨部门流程|分栏流程|多角色流程/.test(text)) motifs.add("swimlane-flow");
  if (/quadrant|impact[-_\s]?effort|priority[-_\s]?matrix|四象限|象限图|优先级矩阵|影响成本|价值难度/.test(text)) motifs.add("quadrant-axis");
  if (/comparison|compare|versus|\bvs\b|before[-_\s]?after|pros[-_\s]?cons|对比矩阵|方案对比|竞品对比|优劣对比|优缺点/.test(text)) motifs.add("comparison-matrix");
  if (/heat[-_\s]?map|risk[-_\s]?matrix|color[-_\s]?scale|热力图|热力矩阵|风险矩阵|色阶矩阵|色块矩阵/.test(text)) motifs.add("heatmap-matrix");
  if (/tree[-_\s]?map|area[-_\s]?composition|area[-_\s]?map|market[-_\s]?share|矩形树图|面积占比|构成分布|份额构成/.test(text)) motifs.add("treemap-chart");
  if (/bubble[-_\s]?chart|bubble[-_\s]?scatter|portfolio[-_\s]?bubble|气泡图|气泡矩阵|散点气泡|组合分布图|产品组合矩阵/.test(text)) motifs.add("bubble-scatter-chart");
  if (/segmented[-_\s]?donut|donut[-_\s]?segment|donut[-_\s]?chart|ring[-_\s]?chart|分段环形图|多段占比图|环形占比图|环形图/.test(text)) motifs.add("donut-segment-chart");
  if (/segmented[-_\s]?pie|pie[-_\s]?segment|分段饼图|多扇区饼图/.test(text)) motifs.add("pie-share-chart");
  if (/tree|hierarchy|org|branch|层级|树状|组织|分支/.test(text)) motifs.add("tree-link");
  if (/radial|hub|spoke|关系|辐射|中心/.test(text)) motifs.add("radial-link");
  if (/process|flow|timeline|step|流程|箭头|步骤|时间轴/.test(text)) motifs.add("linear-arrow-chain");
  if (/whole|template|component|整组|组件|一体化流程/.test(text)) motifs.add("whole-process-template");
  return [...motifs];
}

function scoreTargetMotifCompatibility(signature = {}, targetMotifs = []) {
  const targets = (Array.isArray(targetMotifs) ? targetMotifs : []).map(normalizeMotif).filter(Boolean);
  if (targets.length === 0) return { score: 0, reason: "", reasons: [] };
  const available = new Set((signature.motifs || []).map(normalizeMotif).filter(Boolean));
  const matches = targets.filter((motif) => available.has(motif));
  if (matches.length > 0) {
    const score = matches.reduce((sum, motif, index) => {
      const strength = Math.min(8, Math.max(1, Number(signature.motifCounts?.[motif] || 1)));
      return sum + (index === 0 ? 10 + strength : 6 + strength);
    }, 0);
    const reasons = matches.map((motif) => `learned-motif:${motif}`);
    return {
      score,
      reason: reasons[0],
      reasons
    };
  }
  return { score: 0, reason: "", reasons: [] };
}

function normalizeMotif(value) {
  const motif = safeString(value).toLowerCase();
  return /^(cycle-loop|arc-arrow|ring-node|card-grid|dashboard-card-grid|comparison-matrix|heatmap-matrix|tree-link|org-hierarchy|fishbone-cause|swimlane-flow|quadrant-axis|radial-link|screenshot-card-grid|screenshot-crop|visual-example-card-grid|visual-example-crop|feature-icon-card-grid|icon-crop|numbered-step-card-grid|step-badge|screenshot-zoom-callout|zoom-lens-overlay|screenshot-annotation|callout-overlay|highlight-box|concentric-circles|venn-overlap|intersection-overlap|layered-stack|pyramid-stack|funnel-stack|linear-arrow-chain|milestone-roadmap|gantt-roadmap|whole-process-template|lens-funnel-flow|branch-card-flow|pie-share-chart|sankey-flow-chart|map-chart|word-cloud-chart|waterfall-chart|gauge-chart|radar-chart|treemap-chart|bubble-scatter-chart|donut-segment-chart|topology-triangle)$/.test(motif) ? motif : "";
}

function sanitizeMotifList(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(normalizeMotif)
    .filter(Boolean))]
    .slice(0, 8);
}

function normalizeIndex(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

function normalizeOptionalIndex(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : null;
}

function normalizeBox(box = {}) {
  if (!box || typeof box !== "object") return null;
  const out = {
    x: Number(box.x),
    y: Number(box.y),
    w: Number(box.w ?? box.width),
    h: Number(box.h ?? box.height)
  };
  return [out.x, out.y, out.w, out.h].every(Number.isFinite) && out.w > 0 && out.h > 0 ? out : null;
}

function normalizePositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? round(number) : 0;
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 500);
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

module.exports = {
  buildComponentAssetManifest,
  buildLayerAssetEntry,
  matchLocalComponentAssets,
  scoreLocalAsset,
  summarizeLayerEntries,
  assetLearningCacheKey,
  _private: {
    assetLearningCacheKey,
    familyTokens,
    scoreLearnedStructureCompatibility,
    scoreNativeComponentCompatibility,
    summarizeAssetStructureSignature,
    nativeComponentSignature,
    isReusableLearningSummaryFresh,
    isKindCompatible,
    layerKey,
    normalizeBox,
    normalizeOptionalIndex,
    shouldSuppressAcquisitionForProtectedPreserveLayer,
    suggestedUseFor
  }
};
