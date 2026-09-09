"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { recommendComponentRenderStrategy } = require("./component-render-strategy");
const { classifyGraphicExpressionPolicy } = require("./graphic-expression-policy");

function injectPluginActionCandidatesIntoReport(candidateReport = {}, actionQueue = {}) {
  const layers = Array.isArray(candidateReport.layers) ? candidateReport.layers : [];
  const actionsByLayer = buildPluginActionsByLayer(actionQueue);
  if (layers.length === 0 || actionsByLayer.size === 0) return candidateReport;
  let changed = false;
  const nextLayers = layers.map((layer) => {
    const layerKey = componentCandidateLayerKey(layer);
    const actions = actionsByLayer.get(layerKey) || [];
    if (actions.length === 0) return layer;
    const existingCandidates = Array.isArray(layer.bestCandidates) ? layer.bestCandidates : [];
    const mergedCandidates = mergePluginActionCandidates(existingCandidates, actions);
    if (mergedCandidates === existingCandidates) return layer;
    changed = true;
    const renderLayer = {
      ...layer,
      diagramUnderstanding: layer.diagramUnderstanding || layer.plan ? {
        ...(layer.diagramUnderstanding || {}),
        componentStrategy: {
          ...(layer.diagramUnderstanding?.componentStrategy || {}),
          templateFamily: layer.templateFamily || layer.plan?.templateFamily || layer.diagramUnderstanding?.componentStrategy?.templateFamily,
          targetMotifs: layer.plan?.targetMotifs || layer.diagramUnderstanding?.componentStrategy?.targetMotifs || []
        },
        targetMotifs: layer.plan?.targetMotifs || layer.diagramUnderstanding?.targetMotifs || []
      } : layer.diagramUnderstanding
    };
    return {
      ...layer,
      bestCandidates: mergedCandidates,
      componentRenderStrategy: recommendComponentRenderStrategy(renderLayer, mergedCandidates)
    };
  });
  return changed
    ? {
      ...candidateReport,
      pluginActionCandidateInjection: summarizePluginActionCandidateInjection({ before: layers, after: nextLayers }),
      layers: nextLayers
    }
    : candidateReport;
}

function applyExpressionPolicyRepairsToReport(candidateReport = {}, repairQueue = {}, context = {}) {
  const layers = Array.isArray(candidateReport.layers) ? candidateReport.layers : [];
  const repairsByLayer = buildExpressionPolicyRepairsByLayer(repairQueue, context);
  if (layers.length === 0 || repairsByLayer.size === 0) return candidateReport;
  let repairedLayers = 0;
  const nextLayers = layers.map((layer) => {
    const repair = findExpressionPolicyRepairForLayer(repairsByLayer, layer);
    if (!repair) return layer;
    repairedLayers += 1;
    const bestCandidates = Array.isArray(layer.bestCandidates) ? layer.bestCandidates : [];
    return {
      ...layer,
      expressionPolicyRepairApplied: true,
      expressionPolicyRepair: repair,
      componentRenderStrategy: recommendComponentRenderStrategy(
        buildRenderLayerForStrategy(layer),
        bestCandidates,
        { expressionPolicyRepair: repair }
      )
    };
  });
  return repairedLayers > 0
    ? {
      ...candidateReport,
      expressionPolicyRepairSummary: {
        provider: "expression-policy-repair-application-v1",
        deck: safeString(context.deck),
        repairedLayers,
        queuedActions: Array.isArray(repairQueue.actions) ? repairQueue.actions.length : 0
      },
      layers: nextLayers
    }
    : candidateReport;
}

function applyExpressionPolicyRepairsToDeckImages(deck = {}, repairQueue = {}, context = {}) {
  const pages = Array.isArray(deck.pages) ? deck.pages : [];
  const repairsByLayer = buildExpressionPolicyRepairsByLayer(repairQueue, context);
  const summary = {
    provider: "expression-policy-final-deck-image-repair-v1",
    deck: safeString(context.deck),
    changed: false,
    repairedImages: 0,
    queuedActions: Array.isArray(repairQueue.actions) ? repairQueue.actions.length : 0,
    byDetector: {},
    byAction: {}
  };
  if (pages.length === 0 || repairsByLayer.size === 0) return summary;
  for (const [pageIndex, page] of pages.entries()) {
    const images = Array.isArray(page?.images) ? page.images : [];
    for (const [imageIndex, image] of images.entries()) {
      const repair = findExpressionPolicyRepairForLayer(repairsByLayer, deckImageRepairLayer(image, pageIndex, imageIndex));
      if (!repair) continue;
      const source = image.source && typeof image.source === "object" ? image.source : {};
      const sourceLayer = source.layer && typeof source.layer === "object" ? source.layer : {};
      const detector = safeString(source.detector || sourceLayer.detector || "unknown");
      const disposition = expressionPolicyRepairDispositionForImage(image, repair, { pageIndex, imageIndex });
      image.source = {
        ...source,
        expressionPolicyRepairApplied: true,
        expressionPolicyRepair: repair,
        expressionPolicyRepairMode: safeString(repair.repair?.mode || repair.mode),
        expressionPolicyRepairViolation: safeString(repair.violation),
        expressionPolicyRepairDisposition: disposition,
        layer: {
          ...sourceLayer,
          expressionPolicyRepairApplied: true,
          expressionPolicyRepair: repair,
          expressionPolicyRepairDisposition: disposition
        }
      };
      summary.changed = true;
      summary.repairedImages += 1;
      incrementCount(summary.byDetector, detector);
      incrementCount(summary.byAction, disposition.action || "unknown");
    }
  }
  return summary;
}

function expressionPolicyRepairDispositionForImage(image = {}, repair = {}, context = {}) {
  const source = image.source && typeof image.source === "object" ? image.source : {};
  const layer = source.layer && typeof source.layer === "object" ? source.layer : {};
  const mode = safeString(repair.repair?.mode || repair.mode);
  const policy = classifyGraphicExpressionPolicy({
    ...layer,
    detector: source.detector || layer.detector,
    expressionForm: source.expressionForm || layer.expressionForm,
    expressionSubtype: source.expressionSubtype || layer.expressionSubtype,
    recommendedAction: layer.recommendedAction || source.recommendedAction,
    diagramUnderstanding: layer.diagramUnderstanding || source.diagramUnderstanding,
    source
  });
  const detectorText = [
    source.detector,
    layer.detector,
    source.expressionForm,
    source.expressionSubtype,
    layer.expressionForm,
    layer.expressionSubtype,
    layer.layerType
  ].map(safeString).join(" ").toLowerCase();
  const repairWantsStructure = /^(reclassify-structural-diagram-or-component-template|classify-visual-unit-then-rebuild-or-protect|apply-real-plugin-component-or-specialized-native-rebuilder)$/.test(mode);
  const protectedVisualAsset = policy.protectCrop && !policy.allowPluginTemplate;
  const screenshotOrAsset = /screenshot|screen|document|ui-capture|photo|icon|logo|brand|visual-example|示意图|图标|截图|素材/.test(detectorText);
  const residualStructuralCandidate = /split-(?:wide|erased|table-grid)-residual-crop|sparse-diagram|graphic-underlay|component-template/.test(detectorText)
    && !screenshotOrAsset;
  const action = repairWantsStructure && (policy.allowPluginTemplate || policy.allowNativeRebuild || residualStructuralCandidate) && !protectedVisualAsset
    ? "replacement-candidate"
    : "preserve-fidelity-crop";
  return {
    provider: "expression-policy-repair-disposition-v1",
    action,
    repairMode: mode,
    pageIndex: Number.isFinite(Number(context.pageIndex)) ? Number(context.pageIndex) : null,
    imageIndex: Number.isFinite(Number(context.imageIndex)) ? Number(context.imageIndex) : null,
    minimumUnitPolicy: safeString(policy.minimumUnitPolicy),
    unitDisposition: safeString(policy.unitDisposition),
    expressionKind: safeString(policy.kind),
    reason: action === "replacement-candidate"
      ? "repair requests semantic structure and the final image looks like a structural residual/component candidate"
      : "final image is protected as a fidelity crop because it looks like a screenshot/icon/visual asset or lacks safe structural evidence"
  };
}

function deckImageRepairLayer(image = {}, pageIndex = 0, imageIndex = 0) {
  const source = image.source && typeof image.source === "object" ? image.source : {};
  const layer = source.layer && typeof source.layer === "object" ? source.layer : {};
  return {
    ...layer,
    pageIndex,
    imageIndex,
    imageId: image.id || source.imageId || source.id,
    sourceImageId: source.parentImageId || source.layerSourceId || layer.sourceImageId,
    box: image.box || layer.box,
    source: {
      ...source,
      imageId: image.id || source.imageId || source.id,
      id: image.id || source.id
    }
  };
}

function buildExpressionPolicyRepairsByLayer(repairQueue = {}, context = {}) {
  const repairs = new Map();
  const deck = safeString(context.deck);
  for (const action of Array.isArray(repairQueue.actions) ? repairQueue.actions : []) {
    const actionDeck = safeString(action.deck);
    if (actionDeck && deck && actionDeck !== deck) continue;
    const pageIndex = Math.max(0, Math.trunc(Number(action.page || 1)) - 1);
    const imageIndex = Math.max(0, Math.trunc(Number(action.image || 1)) - 1);
    const imageId = safeString(action.imageId);
    const keys = imageId
      ? [`${pageIndex}:imageId:${imageId}`]
      : [`${pageIndex}:${imageIndex}`];
    const boxKey = componentCandidateBoxKey(pageIndex, action.box);
    if (boxKey) keys.push(boxKey);
    for (const key of keys) {
      if (!repairs.has(key)) repairs.set(key, action);
    }
  }
  return repairs;
}

function findExpressionPolicyRepairForLayer(repairsByLayer = new Map(), layer = {}) {
  for (const key of componentCandidateLayerKeys(layer)) {
    const repair = repairsByLayer.get(key);
    if (repair) return repair;
  }
  return null;
}

function buildRenderLayerForStrategy(layer = {}) {
  return {
    ...layer,
    diagramUnderstanding: layer.diagramUnderstanding || layer.plan ? {
      ...(layer.diagramUnderstanding || {}),
      componentStrategy: {
        ...(layer.diagramUnderstanding?.componentStrategy || {}),
        templateFamily: layer.templateFamily || layer.plan?.templateFamily || layer.diagramUnderstanding?.componentStrategy?.templateFamily,
        targetMotifs: layer.plan?.targetMotifs || layer.diagramUnderstanding?.componentStrategy?.targetMotifs || []
      },
      targetMotifs: layer.plan?.targetMotifs || layer.diagramUnderstanding?.targetMotifs || []
    } : layer.diagramUnderstanding
  };
}

function mergeCandidateReports(primary = {}, secondary = {}) {
  const primaryLayers = Array.isArray(primary.layers) ? primary.layers : [];
  const secondaryLayers = Array.isArray(secondary.layers) ? secondary.layers : [];
  if (secondaryLayers.length === 0) return primary;
  return {
    ...(primary || {}),
    provider: "merged-component-candidate-report-v1",
    mergedReports: [
      primary?.provider || "primary",
      secondary?.provider || "secondary"
    ],
    layers: [...primaryLayers, ...secondaryLayers]
  };
}

function summarizeOwnerCandidateReport(report = {}) {
  const layers = Array.isArray(report.layers) ? report.layers : [];
  const summary = {
    provider: "owner-component-candidate-summary-v1",
    layers: layers.length,
    ownerShapeGroupLayers: 0,
    pluginComponentTemplateLayers: 0,
    bestCandidates: 0,
    byOwnerKind: {},
    byTemplateFamily: {},
    byMode: {}
  };
  for (const layer of layers) {
    if (layer.componentOwnerId) summary.ownerShapeGroupLayers += 1;
    if (layer.componentRenderStrategy?.mode === "plugin-component-template") summary.pluginComponentTemplateLayers += 1;
    summary.bestCandidates += Array.isArray(layer.bestCandidates) ? layer.bestCandidates.length : 0;
    incrementCount(summary.byOwnerKind, layer.componentOwnerKind || "none");
    incrementCount(summary.byTemplateFamily, layer.templateFamily || "unknown");
    incrementCount(summary.byMode, layer.componentRenderStrategy?.mode || layer.mode || "unknown");
  }
  return summary;
}

function buildPluginActionsByLayer(actionQueue = {}) {
  const map = new Map();
  for (const action of Array.isArray(actionQueue.actions) ? actionQueue.actions : []) {
    const layerKey = safeString(action.layerKey);
    if (!layerKey) continue;
    const candidate = pluginActionToCandidate(action);
    if (!candidate) continue;
    if (!map.has(layerKey)) map.set(layerKey, []);
    map.get(layerKey).push(candidate);
  }
  for (const [key, actions] of map.entries()) {
    map.set(key, actions.sort((a, b) => pluginCandidatePriority(b) - pluginCandidatePriority(a) || safeString(a.id).localeCompare(safeString(b.id))));
  }
  return map;
}

function mergePluginActionCandidates(existingCandidates = [], pluginCandidates = []) {
  const existing = Array.isArray(existingCandidates) ? existingCandidates : [];
  const byKey = new Map(existing.map((candidate) => [pluginCandidateKey(candidate), candidate]));
  let changed = false;
  for (const candidate of pluginCandidates) {
    const key = pluginCandidateKey(candidate);
    const current = byKey.get(key);
    if (!current || pluginCandidatePriority(candidate) > pluginCandidatePriority(current)) {
      byKey.set(key, candidate);
      changed = true;
    }
  }
  if (!changed) return existingCandidates;
  return [...byKey.values()]
    .sort((a, b) => pluginCandidatePriority(b) - pluginCandidatePriority(a) || safeString(a.id).localeCompare(safeString(b.id)))
    .slice(0, 12);
}

function pluginActionToCandidate(action = {}) {
  const provider = safeString(action.provider);
  const kind = safeString(action.kind);
  const id = safeString(action.id);
  const title = safeString(action.title);
  if (!provider || !kind || !id || !title) return null;
  const targetMotifs = sanitizePluginActionList(action.targetMotifs);
  const templateFamily = safeString(action.templateFamily || inferTemplateFamilyFromMotifs(targetMotifs));
  const roleTags = pluginActionRoleTags(action);
  return {
    sourceProvider: provider,
    queryProvider: provider,
    kind,
    queryKind: kind,
    id,
    title,
    reuseHint: safeString(action.reuseHint),
    roleTags,
    targetMotifs,
    templateFamily,
    structureSignature: sanitizePluginActionStructureSignature(action.structureSignature, {
      kind,
      targetMotifs,
      templateFamily
    }),
    learningSummary: sanitizePluginActionLearningSummary(action.learningSummary, {
      targetMotifs,
      templateFamily
    }),
    candidateScore: Number.isFinite(Number(action.score)) ? Number(action.score) : 0,
    score: Number.isFinite(Number(action.score)) ? Number(action.score) : 0,
    coverUrl: safeString(action.coverUrl),
    downloadable: action.downloadLookup?.status === "ok" && !!action.downloadLookup?.downloadUrl,
    downloadUrl: safeString(action.downloadLookup?.downloadUrl),
    permission: safeString(action.paymentType),
    suitability: sanitizePluginActionSuitability(action.suitability),
    pluginActionOrder: Number.isFinite(Number(action.order)) ? Number(action.order) : null,
    pluginActionSource: "component-plugin-action-queue"
  };
}

function pluginActionRoleTags(action = {}) {
  const tags = new Set(sanitizePluginActionList(action.roleTags));
  tags.add("plugin-action-candidate");
  if (/apply-and-harvest-plugin-component|applied-component/.test(safeString(action.actionType || action.type))) tags.add("applied-component");
  if (/applied-component/.test(safeString(action.reuseHint))) tags.add("applied-component");
  if (action.downloadLookup?.status === "ok" && action.downloadLookup?.downloadUrl) tags.add("downloadable");
  if (/component|template|presentation-template|vector-component/.test(safeString(action.kind))) tags.add("editable");
  return [...tags].filter(Boolean);
}

function sanitizePluginActionStructureSignature(value = {}, fallback = {}) {
  const source = value && typeof value === "object" ? value : {};
  const motifs = sanitizePluginActionList(source.motifs).length
    ? sanitizePluginActionList(source.motifs)
    : sanitizePluginActionList(fallback.targetMotifs);
  return {
    primaryKind: safeString(source.primaryKind || inferStructureKindFromTemplateFamily(fallback.templateFamily, motifs, fallback.kind)),
    motifs,
    shapeCount: nonNegativeNumber(source.shapeCount),
    textBoxCount: nonNegativeNumber(source.textBoxCount),
    connectorCount: nonNegativeNumber(source.connectorCount),
    pictureCount: nonNegativeNumber(source.pictureCount)
  };
}

function sanitizePluginActionLearningSummary(value = {}, fallback = {}) {
  const source = value && typeof value === "object" ? value : {};
  const signals = [
    ...sanitizePluginActionList(source.signals),
    ...sanitizePluginActionList(fallback.targetMotifs),
    safeString(fallback.templateFamily)
  ].filter(Boolean);
  return {
    primaryKind: safeString(source.primaryKind || inferStructureKindFromTemplateFamily(fallback.templateFamily, fallback.targetMotifs)),
    signals: [...new Set(signals)]
  };
}

function inferTemplateFamilyFromMotifs(motifs = []) {
  const text = sanitizePluginActionList(motifs).join(" ");
  if (/linear-arrow-chain|whole-process-template/.test(text)) return "process-chain";
  if (/card-grid/.test(text)) return "grid-or-matrix";
  if (/ring-node|radial-link/.test(text)) return "hub-spoke";
  if (/arc-arrow/.test(text)) return "cycle-loop";
  if (/tree-link/.test(text)) return "hub-spoke";
  return "";
}

function inferStructureKindFromTemplateFamily(templateFamily = "", motifs = [], kind = "") {
  const family = safeString(templateFamily);
  const text = `${family} ${sanitizePluginActionList(motifs).join(" ")} ${safeString(kind)}`;
  if (/whole-process-template|linear-arrow-chain|process-chain/.test(text)) return "process-chain";
  if (/card-grid|grid-or-matrix|matrix/.test(text)) return "matrix";
  if (/ring-node|radial-link|hub-spoke|tree-link/.test(text)) return "hub-spoke";
  if (/arc-arrow|cycle-loop/.test(text)) return "cycle-loop";
  if (/timeline/.test(text)) return "timeline";
  return "";
}

function sanitizePluginActionList(values = []) {
  const source = Array.isArray(values) ? values : String(values || "").split(",");
  return [...new Set(source.map((value) => safeString(value)).filter(Boolean))];
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : 0;
}

function sanitizePluginActionSuitability(value = {}) {
  if (!value || typeof value !== "object") return null;
  const tier = /^(strong|weak|rejected)$/.test(safeString(value.tier)) ? safeString(value.tier) : "";
  const score = Number(value.score);
  return {
    tier,
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score * 100) / 100)) : 0
  };
}

function pluginCandidatePriority(candidate = {}) {
  const suitability = sanitizePluginActionSuitability(candidate.suitability);
  const tierRank = suitability.tier === "strong" ? 300 : suitability.tier === "weak" ? 200 : suitability.tier === "rejected" ? 0 : 100;
  return tierRank + Number(suitability.score || 0) + Math.min(99, Number(candidate.candidateScore ?? candidate.score ?? 0));
}

function pluginCandidateKey(candidate = {}) {
  return [
    safeString(candidate.sourceProvider || candidate.queryProvider || candidate.provider),
    safeString(candidate.kind || candidate.queryKind),
    safeString(candidate.id)
  ].join("|");
}

function componentCandidateLayerKey(layer = {}) {
  return componentCandidateLayerKeys(layer)[0] || "";
}

function componentCandidateLayerKeys(layer = {}) {
  const keys = [];
  const explicitKey = safeString(layer.layerKey);
  if (explicitKey) keys.push(explicitKey);
  const pageIndex = Number.isFinite(Number(layer.pageIndex)) ? Number(layer.pageIndex) : -1;
  const imageIndex = Number.isFinite(Number(layer.imageIndex)) ? Number(layer.imageIndex) : null;
  if (pageIndex < 0) return keys;
  const imageId = safeString(layer.imageId || layer.id || layer.sourceImageId || layer.source?.imageId || layer.source?.id);
  if (imageId) keys.push(`${pageIndex}:imageId:${imageId}`);
  const boxKey = componentCandidateBoxKey(pageIndex, layer.box);
  if (boxKey && !keys.includes(boxKey)) keys.push(boxKey);
  if (imageIndex === null || imageIndex < 0) {
    const shapeKey = `${pageIndex}:shape:${safeString(layer.shapeLayerId)}`;
    if (!keys.includes(shapeKey)) keys.push(shapeKey);
  } else {
    const indexKey = `${pageIndex}:${imageIndex}`;
    if (!keys.includes(indexKey)) keys.push(indexKey);
  }
  return keys;
}

function componentCandidateBoxKey(pageIndex, box = {}) {
  if (!box || typeof box !== "object") return "";
  const values = ["x", "y", "w", "h"].map((key) => Number(box[key]));
  if (!values.every(Number.isFinite)) return "";
  return `${pageIndex}:box:${values.map((value) => Math.round(value * 10) / 10).join(",")}`;
}

function summarizePluginActionCandidateInjection({ before = [], after = [] } = {}) {
  let injectedLayers = 0;
  let injectedCandidates = 0;
  for (let index = 0; index < after.length; index += 1) {
    const beforeCount = Array.isArray(before[index]?.bestCandidates) ? before[index].bestCandidates.length : 0;
    const afterCount = Array.isArray(after[index]?.bestCandidates) ? after[index].bestCandidates.length : 0;
    if (afterCount > beforeCount) {
      injectedLayers += 1;
      injectedCandidates += afterCount - beforeCount;
    }
  }
  return {
    provider: "plugin-action-candidate-injection-v1",
    injectedLayers,
    injectedCandidates
  };
}

function annotateNativeElementsWithPluginReplacementPlans(deck = {}, candidateReport = {}) {
  const plansByPage = buildPluginReplacementPlansByPage(candidateReport);
  mergeReplacementPlanMaps(plansByPage, buildNativeElementReplacementPlansByPage(deck));
  const pages = Array.isArray(deck.pages) ? deck.pages : [];
  const summary = {
    provider: "native-component-replacement-plan-v1",
    changed: false,
    layers: 0,
    shapes: 0,
    textBoxes: 0,
    byComponentId: {}
  };
  if (plansByPage.size === 0 || pages.length === 0) return summary;
  for (const [pageIndex, page] of pages.entries()) {
    const plans = plansByPage.get(pageIndex) || [];
    if (plans.length === 0 || !page || typeof page !== "object") continue;
    const appliedLayerKeys = new Set();
    for (const collectionName of ["shapes", "textBoxes"]) {
      const items = Array.isArray(page[collectionName]) ? page[collectionName] : [];
      for (const item of items) {
        const plan = bestReplacementPlanForItem(item, plans);
        if (!plan) continue;
        if (!isReplacementPlanCompatibleWithNativeItem(item, plan)) continue;
        item.source = {
          ...(item.source || {}),
          componentReplacementPlan: summarizeReplacementPlan(plan),
          componentReplacementLayerKey: plan.layerKey,
          componentReplacementCandidateId: plan.componentId,
          componentReplacementSuitabilityTier: plan.suitabilityTier,
          componentReplacementSuitabilityScore: plan.suitabilityScore
        };
        appliedLayerKeys.add(plan.layerKey);
        summary.changed = true;
        if (collectionName === "shapes") summary.shapes += 1;
        else summary.textBoxes += 1;
        incrementCount(summary.byComponentId, plan.componentId || "unknown");
      }
    }
    summary.layers += appliedLayerKeys.size;
  }
  return summary;
}

function isReplacementPlanCompatibleWithNativeItem(item = {}, plan = {}) {
  const detector = safeString(item?.source?.detector).toLowerCase();
  if (!detector) return true;
  if (!detector.startsWith("triangle-topology-native-")) return true;
  const signal = [
    plan.title,
    plan.componentKind,
    plan.templateFamily,
    plan.structureSignature?.layout,
    ...(Array.isArray(plan.targetMotifs) ? plan.targetMotifs : [])
  ].map(safeString).join(" ").toLowerCase();
  if (!signal) return false;
  return /triangle|topology|cycle|loop|circular|三角|拓扑|循环|环形|闭环/.test(signal);
}

function buildPluginReplacementPlansByPage(candidateReport = {}) {
  const map = new Map();
  for (const layer of Array.isArray(candidateReport.layers) ? candidateReport.layers : []) {
    const strategy = layer.componentRenderStrategy || {};
    if (strategy.mode !== "plugin-component-template") continue;
    const box = normalizeReplacementBox(layer.box);
    if (!box) continue;
    const plan = {
      provider: "plugin-component-template-replacement-plan-v1",
      pageIndex: Number.isFinite(Number(layer.pageIndex)) ? Math.trunc(Number(layer.pageIndex)) : -1,
      layerKey: componentCandidateLayerKey(layer),
      box,
      strategyMode: safeString(strategy.mode),
      componentId: safeString(strategy.applicationPlan?.componentId || strategy.bestCandidate?.id),
      componentKind: safeString(strategy.applicationPlan?.componentKind || strategy.bestCandidate?.kind),
      sourceProvider: safeString(strategy.applicationPlan?.sourceProvider || strategy.bestCandidate?.sourceProvider),
      title: safeString(strategy.bestCandidate?.title).slice(0, 200),
      templateFamily: safeString(strategy.templateFamily || layer.templateFamily || layer.plan?.templateFamily),
      structureSignature: layer.structureSignature || layer.plan?.structureSignature || layer.diagramUnderstanding?.structureSignature || null,
      targetMotifs: [
        ...(Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : []),
        ...(Array.isArray(strategy.applicationPlan?.targetMotifs) ? strategy.applicationPlan.targetMotifs : []),
        ...(Array.isArray(layer.diagramUnderstanding?.targetMotifs) ? layer.diagramUnderstanding.targetMotifs : []),
        ...(Array.isArray(layer.diagramUnderstanding?.componentStrategy?.targetMotifs) ? layer.diagramUnderstanding.componentStrategy.targetMotifs : [])
      ].map(safeString).filter(Boolean).slice(0, 8),
      suitabilityTier: replacementPlanSuitabilityTier(strategy),
      suitabilityScore: replacementPlanSuitabilityScore(strategy)
    };
    if (plan.pageIndex < 0 || !plan.layerKey || !plan.componentId) continue;
    if (!isActionableReplacementPlan(plan)) continue;
    if (!map.has(plan.pageIndex)) map.set(plan.pageIndex, []);
    map.get(plan.pageIndex).push(plan);
  }
  return map;
}

function isActionableReplacementPlan(plan = {}) {
  const tier = safeString(plan.suitabilityTier).toLowerCase();
  const score = Number(plan.suitabilityScore);
  if (tier === "strong" || tier === "native-signal") return true;
  if (tier === "candidate") return Number.isFinite(score) && score >= 68;
  return Number.isFinite(score) && score >= 80;
}

function replacementPlanSuitabilityTier(strategy = {}) {
  const explicit = safeString(strategy.applicationPlan?.suitabilityTier || strategy.bestCandidate?.suitability?.tier);
  if (explicit) return explicit;
  if (strategy.bestCandidate || strategy.applicationPlan?.componentId) return "candidate";
  return "";
}

function replacementPlanSuitabilityScore(strategy = {}) {
  const explicit = Number(strategy.applicationPlan?.suitabilityScore ?? strategy.bestCandidate?.suitability?.score);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const candidateScore = Number(strategy.bestCandidate?.candidateScore ?? strategy.bestCandidate?.score);
  if (Number.isFinite(candidateScore) && candidateScore > 0) return Math.max(1, Math.min(100, candidateScore));
  const confidence = Number(strategy.bestCandidate?.confidence);
  if (Number.isFinite(confidence) && confidence > 0) return Math.max(1, Math.min(100, confidence <= 1 ? confidence * 100 : confidence));
  return 0;
}

function buildNativeElementReplacementPlansByPage(deck = {}) {
  const map = new Map();
  const pages = Array.isArray(deck.pages) ? deck.pages : [];
  for (const [pageIndex, page] of pages.entries()) {
    if (!page || typeof page !== "object") continue;
    const groups = new Map();
    for (const collectionName of ["shapes", "textBoxes"]) {
      const items = Array.isArray(page[collectionName]) ? page[collectionName] : [];
      for (const item of items) {
        const source = item?.source || {};
        const strategy = source.componentRenderStrategy || {};
        if (strategy.mode !== "plugin-component-template") continue;
        const box = normalizeReplacementBox(item.box);
        if (!box) continue;
        const groupKey = nativeElementComponentGroupKey(source, strategy, pageIndex);
        if (!groupKey) continue;
        const group = groups.get(groupKey) || {
          provider: "native-specialized-component-replacement-plan-v1",
          pageIndex,
          layerKey: groupKey,
          box: null,
          strategyMode: safeString(strategy.mode),
          componentId: nativeElementComponentId(source, strategy, groupKey),
          componentKind: safeString(strategy.bestCandidate?.kind || strategy.applicationPlan?.componentKind || "native-specialized-component"),
          sourceProvider: safeString(strategy.bestCandidate?.sourceProvider || strategy.applicationPlan?.sourceProvider || "native-specialized-rebuild"),
          title: safeString(strategy.bestCandidate?.title || `${strategy.templateFamily || source.componentTemplateFamilyApplied || "component"} native component group`).slice(0, 200),
          suitabilityTier: safeString(strategy.bestCandidate?.suitability?.tier || strategy.applicationPlan?.suitabilityTier || "native-signal"),
          suitabilityScore: Number.isFinite(Number(strategy.bestCandidate?.suitability?.score ?? strategy.applicationPlan?.suitabilityScore))
            ? Number(strategy.bestCandidate?.suitability?.score ?? strategy.applicationPlan?.suitabilityScore)
            : 72,
          targetMotifs: Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs.map(safeString).filter(Boolean) : [],
          nativeElementIds: new Set()
        };
        if (!isActionableReplacementPlan(group)) continue;
        group.box = unionReplacementBox(group.box, box);
        group.nativeElementIds.add(safeString(item.id));
        groups.set(groupKey, group);
      }
    }
    const plans = [...groups.values()]
      .filter((plan) => plan.box && plan.nativeElementIds.size > 0)
      .map((plan) => ({
        ...plan,
        nativeElementIds: plan.nativeElementIds
      }));
    if (plans.length > 0) map.set(pageIndex, plans);
  }
  return map;
}

function mergeReplacementPlanMaps(target, source) {
  for (const [pageIndex, plans] of source.entries()) {
    if (!target.has(pageIndex)) target.set(pageIndex, []);
    target.get(pageIndex).push(...plans);
  }
  return target;
}

function nativeElementComponentGroupKey(source = {}, strategy = {}, pageIndex = 0) {
  return safeString(source.componentReplacementLayerKey)
    || safeString(source.componentAssetLayerKey)
    || safeString(source.nativeComponentGroupId)
    || [
      pageIndex,
      "native",
      safeString(strategy.templateFamily || source.componentTemplateFamilyApplied || "component"),
      (Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : source.componentTemplateTargetMotifs || [])
        .map(safeString)
        .filter(Boolean)
        .slice(0, 4)
        .join("+")
    ].join(":");
}

function nativeElementComponentId(source = {}, strategy = {}, groupKey = "") {
  return safeString(strategy.applicationPlan?.componentId || strategy.bestCandidate?.id)
    || safeString(source.componentReplacementCandidateId)
    || `native:${safeString(strategy.templateFamily || source.componentTemplateFamilyApplied || "component")}:${crypto.createHash("sha1").update(groupKey).digest("hex").slice(0, 12)}`;
}

function bestReplacementPlanForItem(item = {}, plans = []) {
  const box = normalizeReplacementBox(item.box);
  if (!box) return null;
  let best = null;
  for (const plan of plans) {
    if (plan.nativeElementIds instanceof Set && !plan.nativeElementIds.has(safeString(item.id))) continue;
    const overlap = boxOverlapArea(box, plan.box);
    if (overlap <= 0) continue;
    const itemArea = Math.max(1, box.w * box.h);
    const planArea = Math.max(1, plan.box.w * plan.box.h);
    const itemOverlap = overlap / itemArea;
    const planOverlap = overlap / planArea;
    const centerInside = pointInBox({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, plan.box);
    if (!centerInside && itemOverlap < 0.35 && planOverlap < 0.04) continue;
    const score = itemOverlap * 100 + planOverlap * 25 + (centerInside ? 20 : 0) + Number(plan.suitabilityScore || 0) / 5;
    if (!best || score > best.score) best = { plan, score };
  }
  return best?.plan || null;
}

function summarizeReplacementPlan(plan = {}) {
  return {
    provider: safeString(plan.provider || "plugin-component-template-replacement-plan-v1"),
    layerKey: safeString(plan.layerKey),
    sourceProvider: safeString(plan.sourceProvider),
    componentKind: safeString(plan.componentKind),
    componentId: safeString(plan.componentId),
    title: safeString(plan.title).slice(0, 200),
    ...(Array.isArray(plan.targetMotifs) && plan.targetMotifs.length ? { targetMotifs: plan.targetMotifs.map(safeString).filter(Boolean).slice(0, 8) } : {}),
    suitabilityTier: safeString(plan.suitabilityTier),
    suitabilityScore: Number.isFinite(Number(plan.suitabilityScore)) ? Math.max(0, Math.min(100, Math.round(Number(plan.suitabilityScore) * 100) / 100)) : 0
  };
}

function normalizeReplacementBox(box = {}) {
  const x = Number(box?.x);
  const y = Number(box?.y);
  const w = Number(box?.w);
  const h = Number(box?.h);
  if (![x, y, w, h].every(Number.isFinite) || w < 0 || h < 0 || (w === 0 && h === 0)) return null;
  return { x, y, w: Math.max(0.1, w), h: Math.max(0.1, h) };
}

function boxOverlapArea(a = {}, b = {}) {
  const left = Math.max(Number(a.x || 0), Number(b.x || 0));
  const top = Math.max(Number(a.y || 0), Number(b.y || 0));
  const right = Math.min(Number(a.x || 0) + Number(a.w || 0), Number(b.x || 0) + Number(b.w || 0));
  const bottom = Math.min(Number(a.y || 0) + Number(a.h || 0), Number(b.y || 0) + Number(b.h || 0));
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function unionReplacementBox(a, b) {
  const boxA = normalizeReplacementBox(a);
  const boxB = normalizeReplacementBox(b);
  if (!boxA) return boxB;
  if (!boxB) return boxA;
  const left = Math.min(boxA.x, boxB.x);
  const top = Math.min(boxA.y, boxB.y);
  const right = Math.max(boxA.x + boxA.w, boxB.x + boxB.w);
  const bottom = Math.max(boxA.y + boxA.h, boxB.y + boxB.h);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function pointInBox(point = {}, box = {}) {
  const x = Number(point.x);
  const y = Number(point.y);
  return Number.isFinite(x) && Number.isFinite(y)
    && x >= Number(box.x || 0)
    && y >= Number(box.y || 0)
    && x <= Number(box.x || 0) + Number(box.w || 0)
    && y <= Number(box.y || 0) + Number(box.h || 0);
}

function incrementCount(target, key) {
  const safeKey = safeString(key || "unknown");
  if (!safeKey) return;
  target[safeKey] = (target[safeKey] || 0) + 1;
}

function safeString(value) {
  let result = "";
  for (const character of String(value ?? "")) {
    const code = character.codePointAt(0);
    if (code > 0x1f && code !== 0x7f) result += character;
  }
  return result.trim();
}

function shouldRefreshComponentInventoryCacheForHarvest(harvest) {
  const summary = harvest && harvest.summary ? harvest.summary : harvest;
  if (!summary) return false;
  return Number(summary.copiedCount || 0) > 0 || Number(summary.discoveredCount || 0) > 0;
}

function normalizeComponentAssetRoots(roots = []) {
  const values = Array.isArray(roots) ? roots : [roots];
  const seen = new Set();
  const normalized = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const resolved = path.resolve(text);
    const key = resolved.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(resolved);
  }
  return normalized;
}


module.exports = {
  annotateNativeElementsWithPluginReplacementPlans,
  applyExpressionPolicyRepairsToDeckImages,
  applyExpressionPolicyRepairsToReport,
  buildExpressionPolicyRepairsByLayer,
  componentCandidateBoxKey,
  componentCandidateLayerKeys,
  expressionPolicyRepairDispositionForImage,
  findExpressionPolicyRepairForLayer,
  injectPluginActionCandidatesIntoReport,
  isReplacementPlanCompatibleWithNativeItem,
  mergeCandidateReports,
  normalizeComponentAssetRoots,
  shouldRefreshComponentInventoryCacheForHarvest,
  summarizeOwnerCandidateReport
};
