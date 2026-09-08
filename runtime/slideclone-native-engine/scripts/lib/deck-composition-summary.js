"use strict";

const { summarizeLayerProfile } = require("./layer-classifier");
const { measurePageReconstructionQuality } = require("./reconstruction-quality-budget");

const DEFAULT_SLIDE = Object.freeze({ widthPt: 960, heightPt: 540 });
const REQUIRED_CLASSIFIERS = Object.freeze([
  "classifyEditableExpressionForm",
  "classifyImageExpressionForm",
  "classifyImageExpressionSubtype",
  "recommendExpressionHandling"
]);

function summarizeDeckComposition(deck = {}, operations = {}) {
  const classifiers = requireClassifiers(operations);
  const pages = Array.isArray(deck?.pages) ? deck.pages : [];
  if (pages.length > 10000) throw new TypeError("deck composition summary supports at most 10000 pages");
  const slideSize = validSlideSize(deck?.slideSize) ? deck.slideSize : DEFAULT_SLIDE;
  const detectorCounts = {};
  const imageStrategyCounts = {};
  const imageExpressionCounts = {};
  const imageSubtypeCounts = {};
  const imageRecommendationCounts = {};
  const editableExpressionCounts = {};
  let editableObjects = 0;
  let localFidelityCrops = 0;
  const pageQuality = [];
  for (const page of pages) {
    pageQuality.push(measurePageReconstructionQuality(page, slideSize));
    for (const key of ["shapes", "tables", "charts", "icons", "textBoxes"]) {
      const items = Array.isArray(page?.[key]) ? page[key] : [];
      editableObjects += items.length;
      if (key !== "textBoxes") {
        for (const item of items) {
          addCount(editableExpressionCounts, item?.source?.expressionForm || classifiers.classifyEditableExpressionForm(item, key));
        }
      }
    }
    for (const image of Array.isArray(page?.images) ? page.images : []) {
      const source = image?.source || {};
      if (source.editable === true) editableObjects += 1;
      else localFidelityCrops += 1;
      addCount(detectorCounts, source.detector || "unknown");
      addCount(imageStrategyCounts, source.strategy || "unspecified");
      addCount(imageExpressionCounts, source.expressionForm || classifiers.classifyImageExpressionForm(image));
      addCount(imageSubtypeCounts, source.expressionSubtype || classifiers.classifyImageExpressionSubtype(image));
      addCount(imageRecommendationCounts, source.recommendedAction || classifiers.recommendExpressionHandling(image));
    }
  }
  return Object.freeze({
    pages: pages.length,
    editableObjects,
    localFidelityCrops,
    detectorCounts: Object.freeze(detectorCounts),
    imageStrategyCounts: Object.freeze(imageStrategyCounts),
    imageExpressionCounts: Object.freeze(imageExpressionCounts),
    imageSubtypeCounts: Object.freeze(imageSubtypeCounts),
    imageRecommendationCounts: Object.freeze(imageRecommendationCounts),
    editableExpressionCounts: Object.freeze(editableExpressionCounts),
    reconstructionQuality: Object.freeze(summarizeReconstructionQuality(pageQuality)),
    layerProfile: summarizeLayerProfile(deck).totals
  });
}

function summarizeReconstructionQuality(pageQuality = []) {
  const slideArea = pageQuality.reduce((sum, item) => sum + finite(item?.slideAreaPt2), 0);
  const residualArea = pageQuality.reduce((sum, item) => sum + finite(item?.residualAreaPt2), 0);
  return {
    residualAreaRatio: slideArea > 0 ? round(residualArea / slideArea, 6) : 0,
    residualCount: pageQuality.reduce((sum, item) => sum + finite(item?.residualCount), 0),
    nativeObjectCount: pageQuality.reduce((sum, item) => sum + finite(item?.nativeObjectCount), 0),
    largestResidualAreaRatio: pageQuality.reduce((maximum, item) => Math.max(maximum, finite(item?.largestResidualAreaRatio)), 0)
  };
}

function requireClassifiers(operations) {
  if (!operations || typeof operations !== "object" || Array.isArray(operations)) throw new TypeError("deck composition classifiers are required");
  for (const key of REQUIRED_CLASSIFIERS) {
    if (typeof operations[key] !== "function") throw new TypeError(`deck composition classifier ${key} must be a function`);
  }
  return operations;
}

function validSlideSize(value) {
  return Number.isFinite(Number(value?.widthPt)) && Number(value.widthPt) > 0
    && Number.isFinite(Number(value?.heightPt)) && Number(value.heightPt) > 0;
}

function addCount(target, key) {
  const safeKey = String(key || "unknown").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180) || "unknown";
  target[safeKey] = (target[safeKey] || 0) + 1;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function round(value, digits) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

module.exports = {
  summarizeDeckComposition,
  summarizeReconstructionQuality
};
