"use strict";

const { COMPONENT_FAMILY_IDS, componentFamilyForMotif } = require("./component-motifs");

function componentFamilyAppliedCountsFromProfile(componentStrategyProfile = {}) {
  const direct = componentStrategyProfile.componentFamilyAppliedCounts || {};
  if (Object.keys(direct).length > 0) return direct;
  const counts = {};
  for (const [motif, rawCount] of Object.entries(componentStrategyProfile.componentTemplateMotifReadyTargetCounts || {})) {
    const family = componentFamilyForMotif(motif);
    if (!family) continue;
    addCount(counts, family, rawCount);
  }
  return counts;
}

function componentFamilyCountsFromProfile(componentStrategyProfile = {}, keys = []) {
  for (const key of keys) {
    const counts = componentStrategyProfile?.[key];
    if (counts && typeof counts === "object" && !Array.isArray(counts) && Object.keys(counts).length > 0) {
      return normalizeComponentFamilyCounts(counts);
    }
  }
  return {};
}

function normalizeRequiredComponentFamilyRegressionCases(value) {
  if (value === undefined || value === null || value === "") return [];
  const entries = Array.isArray(value) ? value : String(value).split(/[;,]/);
  const cases = [];
  const seen = new Set();
  for (const entry of entries) {
    const normalized = normalizeRequiredComponentFamilyRegressionCase(entry);
    if (!normalized) continue;
    const key = `${normalized.deck}\u0000${normalized.family}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cases.push(normalized);
  }
  return cases.sort((a, b) => a.deck.localeCompare(b.deck) || a.family.localeCompare(b.family));
}

function normalizeComponentFamilyGapExamples(examples = [], context = {}) {
  return (Array.isArray(examples) ? examples : [])
    .map((example) => ({
      deck: safeString(context.deck || example?.deck || "unknown-deck"),
      reportFile: safeString(context.reportFile || example?.reportFile || ""),
      page: safeNumber(example?.page),
      image: safeNumber(example?.image),
      families: (Array.isArray(example?.families) ? example.families : [])
        .map((family) => safeString(family))
        .filter(Boolean)
        .slice(0, 8),
      mode: safeString(example?.mode || "unknown-mode"),
      detector: safeString(example?.detector || "unknown-detector"),
      layerType: safeString(example?.layerType || "unknown-layer"),
      family: safeString(example?.family || "unknown-family"),
      reason: safeString(example?.reason || "unknown-reason")
    }))
    .filter((example) => example.families.length > 0);
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

function missingComponentFamilyRegressionCases(actualCases = [], requiredCases = []) {
  const actual = new Map((Array.isArray(actualCases) ? actualCases : [])
    .filter((item) => safeNumber(item?.appliedObjects) > 0)
    .map((item) => [`${safeString(item.deck)}\u0000${safeString(item.family)}`, item]));
  return (Array.isArray(requiredCases) ? requiredCases : [])
    .filter((item) => !actual.has(`${safeString(item.deck)}\u0000${safeString(item.family)}`))
    .map((item) => {
      const observed = (Array.isArray(actualCases) ? actualCases : [])
        .find((candidate) => safeString(candidate?.deck) === item.deck && safeString(candidate?.family) === item.family);
      return {
        deck: item.deck,
        family: item.family,
        requiredEvidence: "native-applied-component-family",
        observedStatus: safeString(observed?.status || "missing"),
        observedAppliedObjects: safeNumber(observed?.appliedObjects),
        observedGapLayers: safeNumber(observed?.gapLayers),
        observedDetectedLayers: safeNumber(observed?.detectedLayers),
        observedStrategyLayers: safeNumber(observed?.strategyLayers)
      };
    });
}

function summarizeComponentFamilyRegressionCases(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .flatMap((row) => componentFamilyRegressionCasesForRow(row))
    .sort((a, b) => (
      a.deck.localeCompare(b.deck)
      || componentFamilyRegressionStatusRank(a.status) - componentFamilyRegressionStatusRank(b.status)
      || a.family.localeCompare(b.family)
    ));
}

function componentFamilyRegressionCasesForRow(row = {}) {
  const families = [...new Set([
    ...Object.keys(row.componentFamilyAppliedCounts || {}),
    ...Object.keys(row.componentFamilyGapCounts || {}),
    ...Object.keys(row.imageComponentDetectedFamilyCounts || {}),
    ...Object.keys(row.imageComponentMatchedFamilyCounts || {}),
    ...Object.keys(row.imageComponentStrategyFamilyCounts || {}),
    ...Object.keys(row.imageComponentMissingFamilyCounts || {})
  ])]
    .filter((family) => COMPONENT_FAMILY_IDS.includes(family))
    .sort((a, b) => a.localeCompare(b));
  return families.map((family) => {
    const appliedObjects = safeNumber(row.componentFamilyAppliedCounts?.[family]);
    const gapLayers = safeNumber(row.componentFamilyGapCounts?.[family]);
    const detectedLayers = safeNumber(row.imageComponentDetectedFamilyCounts?.[family]);
    const matchedLayers = safeNumber(row.imageComponentMatchedFamilyCounts?.[family]);
    const strategyLayers = safeNumber(row.imageComponentStrategyFamilyCounts?.[family]);
    const missingLayers = safeNumber(row.imageComponentMissingFamilyCounts?.[family]);
    return {
      deck: safeString(row.deck || "unknown-deck"),
      family,
      status: componentFamilyRegressionStatus({
        appliedObjects,
        gapLayers,
        detectedLayers,
        matchedLayers,
        strategyLayers,
        missingLayers
      }),
      appliedObjects,
      gapLayers,
      detectedLayers,
      matchedLayers,
      strategyLayers,
      missingLayers,
      reportFile: safeString(row.reportFile || "")
    };
  });
}

function normalizeComponentFamilyCounts(counts = {}) {
  const out = {};
  for (const [family, rawValue] of Object.entries(counts || {})) {
    if (!COMPONENT_FAMILY_IDS.includes(family)) continue;
    const value = safeNumber(rawValue);
    if (value > 0) out[family] = value;
  }
  return out;
}

function normalizeRequiredComponentFamilyRegressionCase(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const deck = safeString(value.deck || "");
    const family = safeString(value.family || "");
    if (!deck || !COMPONENT_FAMILY_IDS.includes(family)) return null;
    return { deck, family };
  }
  const text = String(value || "").trim();
  const separator = text.lastIndexOf(":");
  if (separator <= 0 || separator === text.length - 1) return null;
  const deck = safeString(text.slice(0, separator));
  const family = safeString(text.slice(separator + 1));
  if (!deck || !COMPONENT_FAMILY_IDS.includes(family)) return null;
  return { deck, family };
}

function componentFamilyRegressionStatus({
  appliedObjects = 0,
  gapLayers = 0,
  detectedLayers = 0,
  matchedLayers = 0,
  strategyLayers = 0,
  missingLayers = 0
} = {}) {
  if (appliedObjects > 0 && gapLayers > 0) return "partial-native-coverage";
  if (appliedObjects > 0) return "native-covered";
  if (gapLayers > 0) return "native-gap";
  if (strategyLayers > 0) return "strategy-ready";
  if (matchedLayers > 0) return "asset-matched";
  if (detectedLayers > 0) return "detected-only";
  if (missingLayers > 0) return "missing-after-detection";
  return "unknown";
}

function componentFamilyRegressionStatusRank(status = "") {
  if (status === "native-gap") return 0;
  if (status === "missing-after-detection") return 1;
  if (status === "detected-only") return 2;
  if (status === "asset-matched") return 3;
  if (status === "strategy-ready") return 4;
  if (status === "partial-native-coverage") return 5;
  if (status === "native-covered") return 6;
  return 7;
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function addCount(target, key, count = 1) {
  const safe = safeString(key || "unknown") || "unknown";
  target[safe] = (target[safe] || 0) + safeNumber(count);
}

module.exports = {
  componentFamilyAppliedCountsFromProfile,
  componentFamilyCountsFromProfile,
  missingComponentFamilyRegressionCases,
  normalizeComponentFamilyGapExamples,
  normalizeRequiredComponentFamilyRegressionCases,
  summarizeComponentFamilyCoverage,
  summarizeComponentFamilyRegressionCases
};
