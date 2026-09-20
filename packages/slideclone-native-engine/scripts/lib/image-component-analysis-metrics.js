"use strict";

const { COMPONENT_FAMILY_IDS } = require("./component-coverage-family");

function emptyImageComponentAnalysisMetrics() {
  return {
    pages: 0,
    preImages: 0,
    analysisLayers: 0,
    assetMatches: 0,
    strategyLayers: 0,
    assetLayers: 0,
    detectedComponentFamilyCounts: {},
    matchedComponentFamilyCounts: {},
    strategyComponentFamilyCounts: {},
    missingComponentFamilyCounts: {},
    componentFamilies: []
  };
}

function mergeImageComponentAnalysisMetrics(target, evidence = null) {
  if (!target || !evidence || typeof evidence !== "object" || Array.isArray(evidence)) return;
  if (safeString(evidence.provider) !== "team-component-analysis-v1") return;
  target.pages += 1;
  target.preImages += safeNumber(evidence.preImages);
  target.analysisLayers += safeNumber(evidence.analysisLayers);
  target.assetMatches += safeNumber(evidence.assetMatches);
  target.strategyLayers += safeNumber(evidence.strategyLayers);
  target.assetLayers += safeNumber(evidence.assetLayers);
  mergeComponentFamilyCounts(target.detectedComponentFamilyCounts, evidence.detectedComponentFamilyCounts);
  mergeComponentFamilyCounts(target.matchedComponentFamilyCounts, evidence.matchedComponentFamilyCounts);
  mergeComponentFamilyCounts(target.strategyComponentFamilyCounts, evidence.strategyComponentFamilyCounts);
  mergeComponentFamilyCounts(target.missingComponentFamilyCounts, evidence.missingComponentFamilyCounts);
  if (Array.isArray(evidence.componentFamilies)) mergeImageComponentFamilyRows(target.componentFamilies, evidence.componentFamilies);
}

function mergeComponentFamilyCounts(target, source = {}) {
  if (!target || !source || typeof source !== "object" || Array.isArray(source)) return;
  for (const [family, count] of Object.entries(source)) {
    if (!COMPONENT_FAMILY_IDS.includes(family)) continue;
    addCount(target, family, count);
  }
}

function mergeImageComponentFamilyRows(target, rows = []) {
  if (!Array.isArray(target) || !Array.isArray(rows)) return;
  const byFamily = new Map(target.map((row) => [safeString(row.family), row]));
  for (const row of rows) {
    const family = safeString(row?.family);
    if (!COMPONENT_FAMILY_IDS.includes(family)) continue;
    if (!byFamily.has(family)) {
      const entry = {
        family,
        detectedLayers: 0,
        matchedLayers: 0,
        assetMatches: 0,
        strategyLayers: 0,
        missingLayers: 0
      };
      byFamily.set(family, entry);
      target.push(entry);
    }
    const entry = byFamily.get(family);
    entry.detectedLayers += safeNumber(row.detectedLayers);
    entry.matchedLayers += safeNumber(row.matchedLayers);
    entry.assetMatches += safeNumber(row.assetMatches);
    entry.strategyLayers += safeNumber(row.strategyLayers);
    entry.missingLayers += safeNumber(row.missingLayers);
  }
  target.splice(30);
}

function addCount(target, key, count = 1) {
  const family = safeString(key);
  target[family] = safeNumber(target[family]) + safeNumber(count);
}

function safeString(value) {
  return String(value ?? "")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .trim();
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

module.exports = {
  emptyImageComponentAnalysisMetrics,
  mergeImageComponentAnalysisMetrics,
  mergeImageComponentFamilyRows
};
