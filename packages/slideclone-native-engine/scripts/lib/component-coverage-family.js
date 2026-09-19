"use strict";

const {
  COMPONENT_FAMILY_BY_MOTIF,
  COMPONENT_FAMILY_IDS,
  componentFamilyForMotif,
  inferComponentFamiliesFromText,
  isKnownTargetMotif,
  sanitizeMotifs,
  uniqueComponentFamilies
} = require("./component-motifs");

function summarizeComponentFamilyGaps(candidateSummary = {}, finalOpportunities = {}) {
  const counts = {};
  const examples = [];
  const addGap = (item, source) => {
    const families = inferComponentFamiliesFromLayer(item);
    for (const family of families) addCount(counts, family);
    if (examples.length < 24 && families.length > 0) {
      examples.push({
        source,
        page: safeNumber(item.page),
        image: safeNumber(item.image),
        families,
        disposition: safeString(item.disposition || ""),
        priority: safeString(item.priority || ""),
        family: safeString(item.family || ""),
        layerType: safeString(item.layerType || ""),
        detector: safeString(item.detector || "")
      });
    }
  };
  const opportunities = Array.isArray(finalOpportunities.nativeOpportunities) ? finalOpportunities.nativeOpportunities : [];
  const residuals = Array.isArray(candidateSummary.actionableResiduals) ? candidateSummary.actionableResiduals : [];
  if (opportunities.length > 0) {
    for (const opportunity of opportunities) addGap(opportunity, "final-ir-opportunity");
  } else {
    for (const residual of residuals) addGap(residual, "candidate-residual");
  }
  return { counts, examples };
}

function summarizeComponentFamilyCoverage(appliedCounts = {}, gapCounts = {}) {
  const families = [...new Set([
    ...Object.keys(appliedCounts || {}),
    ...Object.keys(gapCounts || {})
  ])].sort((a, b) => a.localeCompare(b));
  return families.map((family) => {
    const appliedObjects = safeNumber(appliedCounts[family]);
    const gapLayers = safeNumber(gapCounts[family]);
    return {
      family,
      appliedObjects,
      gapLayers,
      status: appliedObjects > 0 && gapLayers > 0 ? "partial" : appliedObjects > 0 ? "covered" : "gap"
    };
  });
}

function summarizeComponentFamilyActions(totals = {}) {
  const coverage = Array.isArray(totals.componentFamilyCoverage) ? totals.componentFamilyCoverage : [];
  const examples = Array.isArray(totals.componentFamilyGapExamples) ? totals.componentFamilyGapExamples : [];
  return coverage
    .filter((item) => safeNumber(item.gapLayers) > 0)
    .map((item) => {
      const family = safeString(item.family || "unknown-family");
      const gapLayers = safeNumber(item.gapLayers);
      const appliedObjects = safeNumber(item.appliedObjects);
      const action = appliedObjects > 0 ? "expand-existing-family-coverage" : "add-first-native-family-coverage";
      const priority = appliedObjects === 0 && gapLayers >= 3 ? "critical" : appliedObjects === 0 ? "high" : "medium";
      return {
        family,
        priority,
        action,
        gapLayers,
        appliedObjects,
        status: safeString(item.status || "gap"),
        examples: examples
          .filter((example) => Array.isArray(example.families) && example.families.includes(family))
          .slice(0, 5)
          .map((example) => ({
            deck: safeString(example.deck || "unknown-deck"),
            page: safeNumber(example.page),
            image: safeNumber(example.image),
            source: safeString(example.source || "unknown-source"),
            layerType: safeString(example.layerType || "unknown-layer"),
            detector: safeString(example.detector || "unknown-detector"),
            disposition: safeString(example.disposition || "unknown-disposition"),
            priority: safeString(example.priority || "unknown-priority")
          }))
      };
    })
    .sort((a, b) => (
      componentFamilyPriorityRank(a.priority) - componentFamilyPriorityRank(b.priority)
      || b.gapLayers - a.gapLayers
      || a.appliedObjects - b.appliedObjects
      || a.family.localeCompare(b.family)
    ));
}

function componentFamilyAppliedCountsFromResult(result = {}) {
  const counts = {};
  mergeCounts(counts, result.componentFamilyAppliedCounts);
  return counts;
}

function addComponentFamilyAppliedCounts(target, source = {}, options = {}) {
  if (!source || typeof source !== "object") return;
  if (
    options.nativeEvidence !== true
    && source.componentTemplateGroupApplied !== true
    && source.nativeComponentInstance !== true
    && source.nativeRebuild !== true
    && !safeString(source.nativeComponentArchetype)
  ) {
    return;
  }
  for (const family of inferComponentFamiliesFromSource(source)) addCount(target, family);
}

function inferComponentFamiliesFromSource(source = {}) {
  const motifFamilies = componentTemplateTargetMotifs(source).map(componentFamilyForMotif).filter(Boolean);
  const textFamilies = inferComponentFamiliesFromText([
    source.componentTemplateFamilyApplied,
    source.nativeComponentArchetype,
    source.nativeComponentRole,
    source.nativeComponentPart,
    source.componentTemplatePart,
    source.detector,
    source.layer?.templateFamily,
    source.layer?.layerType,
    source.layer?.diagramUnderstanding?.archetype,
    source.layer?.diagramUnderstanding?.componentStrategy?.templateFamily
  ].map(safeString).join(" "));
  return uniqueComponentFamilies([...motifFamilies, ...textFamilies]);
}

function inferComponentFamiliesFromLayer(layer = {}) {
  const motifFamilies = componentTemplateTargetMotifs(layer).map(componentFamilyForMotif).filter(Boolean);
  const textFamilies = inferComponentFamiliesFromText([
    layer.family,
    layer.layerType,
    layer.detector,
    layer.expressionForm,
    layer.expressionSubtype,
    layer.recommendedAction,
    layer.disposition,
    layer.candidateTitle,
    layer.componentTemplateFamilyApplied,
    layer.templateFamily,
    layer.diagramUnderstanding?.archetype,
    layer.diagramUnderstanding?.componentStrategy?.templateFamily
  ].map(safeString).join(" "));
  return uniqueComponentFamilies([...motifFamilies, ...textFamilies]);
}

function isMotifReadyComponentTemplateSource(source = {}) {
  if (!source || typeof source !== "object") return false;
  return source.matchedComponentAssetMotifReady === true
    || source.componentTemplateAssetMotifReady === true
    || (source.componentTemplateGroupApplied === true && componentTemplateTargetMotifs(source).length > 0);
}

function isWholeProcessTemplateSource(source = {}) {
  if (!source || typeof source !== "object") return false;
  return source.matchedComponentWholeProcessTemplate === true
    || source.componentTemplateWholeProcessApplied === true
    || componentTemplateTargetMotifs(source).includes("whole-process-template");
}

function addMotifReadyTargetCounts(target, source = {}) {
  const motifs = componentTemplateTargetMotifs(source);
  if (motifs.length === 0) {
    addCount(target, "unknown");
  } else {
    for (const motif of motifs) addCount(target, motif);
  }
}

function componentTemplateTargetMotifs(source = {}) {
  const values = [
    ...(Array.isArray(source.matchedComponentTargetMotifs) ? source.matchedComponentTargetMotifs : []),
    ...(Array.isArray(source.componentTemplateTargetMotifs) ? source.componentTemplateTargetMotifs : []),
    ...inferredComponentTemplateTargetMotifs(source)
  ];
  return sanitizeMotifs(values);
}

function inferredComponentTemplateTargetMotifs(source = {}) {
  const text = [
    source.componentTemplatePart,
    source.componentTemplateFamilyApplied,
    source.nativeComponentArchetype,
    source.nativeComponentPart,
    source.nativeComponentRole,
    source.appliedPluginStructureRole,
    source.detector
  ].map((value) => safeString(value).toLowerCase()).join(" ");
  const specialtyMotifs = [];
  if (/donut|doughnut/.test(text)) specialtyMotifs.push("donut-segment-chart");
  if (/treemap/.test(text)) specialtyMotifs.push("treemap-chart");
  if (/bubble|scatter/.test(text)) specialtyMotifs.push("bubble-scatter-chart");
  if (/concentric/.test(text)) specialtyMotifs.push("concentric-circles");
  if (/sankey/.test(text)) specialtyMotifs.push("sankey-flow-chart");
  if (/\bmap\b|geo|region/.test(text)) specialtyMotifs.push("map-chart");
  if (/word-cloud|word cloud|keyword/.test(text)) specialtyMotifs.push("word-cloud-chart");
  if (/waterfall/.test(text)) specialtyMotifs.push("waterfall-chart");
  if (/gauge|dial|speedometer/.test(text)) specialtyMotifs.push("gauge-chart");
  if (/radar|spider/.test(text)) specialtyMotifs.push("radar-chart");
  if (/swimlane|lane/.test(text)) specialtyMotifs.push("swimlane-flow");
  if (/topology|network/.test(text)) specialtyMotifs.push("topology-network");
  if (specialtyMotifs.length > 0) return specialtyMotifs;
  const motifs = [];
  if (/matrix|grid|cell|quadrant/.test(text)) motifs.push("card-grid");
  if (/quadrant|axis/.test(text)) motifs.push("quadrant-axis");
  if (/process|step|swimlane|flow|chain/.test(text)) motifs.push("linear-arrow-chain");
  if (/whole-process/.test(text)) motifs.push("whole-process-template");
  if (/timeline|milestone/.test(text)) motifs.push("milestone-roadmap");
  if (/cycle|loop|arc/.test(text)) motifs.push("arc-arrow");
  if (/tree|org|hierarchy/.test(text)) motifs.push("tree-link");
  if (/hub|spoke|radial|relationship/.test(text)) motifs.push("radial-link");
  if (/funnel/.test(text)) motifs.push("funnel-stack");
  if (/pyramid/.test(text)) motifs.push("pyramid-stack");
  if (/layer|stack/.test(text)) motifs.push("layered-stack");
  return motifs;
}

function componentFamilyPriorityRank(priority = "") {
  if (priority === "critical") return 0;
  if (priority === "high") return 1;
  if (priority === "medium") return 2;
  return 3;
}

function countKnownMotifTypes(counts = {}) {
  return Object.entries(counts || {})
    .filter(([motif, count]) => isKnownTargetMotif(motif) && safeNumber(count) > 0)
    .length;
}

function countPositiveCounts(counts = {}) {
  return Object.values(counts || {})
    .filter((count) => safeNumber(count) > 0)
    .length;
}

function mergeCounts(target, source = {}) {
  for (const [key, value] of Object.entries(source || {})) addCount(target, key, value);
}

function addCount(target, key, count = 1) {
  const safe = safeString(key || "unknown") || "unknown";
  target[safe] = (target[safe] || 0) + safeNumber(count);
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

module.exports = {
  addComponentFamilyAppliedCounts,
  addMotifReadyTargetCounts,
  componentFamilyAppliedCountsFromResult,
  componentFamilyForMotif,
  componentFamilyPriorityRank,
  componentTemplateTargetMotifs,
  countKnownMotifTypes,
  countPositiveCounts,
  inferComponentFamiliesFromLayer,
  inferComponentFamiliesFromSource,
  isMotifReadyComponentTemplateSource,
  isWholeProcessTemplateSource,
  summarizeComponentFamilyActions,
  summarizeComponentFamilyCoverage,
  summarizeComponentFamilyGaps,
  COMPONENT_FAMILY_BY_MOTIF,
  COMPONENT_FAMILY_IDS
};
