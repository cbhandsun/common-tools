"use strict";

const path = require("node:path");
const { parseSlideSize } = require("./slide-size");
const { createPageGraphicsStage } = require("./page-graphics-stage");
const { createPageProgressLifecycle } = require("./page-progress-lifecycle");
const { createPageImageFinalizer } = require("./page-image-finalizer");
const { createProgressReporter } = require("./progress-reporter");
const { parsePageSelection, planSelectedPages, shouldIncludePage } = require("./page-selection");

function createNativeRebuildPlan({ workDir, options = {}, services = {} } = {}) {
  const readJson = requiredService(services.readJson, "readJson");
  const sourceNativeSlideMetadata = requiredService(services.sourceNativeSlideMetadata, "sourceNativeSlideMetadata");
  const defaultSlide = parseSlideSize(services.defaultSlide) || { widthPt: 960, heightPt: 540 };
  if (typeof workDir !== "string" || workDir.length === 0 || workDir.length > 2048 || workDir.includes("\0")) {
    throw new TypeError("native rebuild work directory is invalid");
  }
  const sourceIr = readJson(path.join(workDir, "ir", "deck.json"));
  if (!sourceIr || typeof sourceIr !== "object" || Array.isArray(sourceIr)) throw new TypeError("native rebuild source IR is invalid");
  if (sourceIr.pages !== undefined && !Array.isArray(sourceIr.pages)) throw new TypeError("native rebuild source IR pages are invalid");
  const slideSize = parseSlideSize(sourceIr.slideSize) || defaultSlide;
  const sourcePages = Array.isArray(sourceIr.pages) ? sourceIr.pages : [];
  const pageSelection = parsePageSelection(options.pages ?? options.onlyPages ?? options.pageSelection);
  const selectedPages = planSelectedPages(sourcePages, pageSelection);
  if (!Array.isArray(selectedPages)) throw new TypeError("native rebuild page plan is invalid");
  const nativeSlides = sourceNativeSlideMetadata(workDir);
  if (!(nativeSlides instanceof Map)) throw new TypeError("native slide metadata must be a Map");
  const progressReporter = options.progressReporter && typeof options.progressReporter.emit === "function"
    ? options.progressReporter
    : createProgressReporter({ enabled: false });
  if (!progressReporter || typeof progressReporter.emit !== "function") throw new TypeError("progress reporter is invalid");
  return Object.freeze({
    sourceIr,
    slideSize,
    sourceNativeSlides: nativeSlides,
    selectedPages: Object.freeze([...selectedPages]),
    selectedPageTotal: selectedPages.length,
    progressReporter
  });
}

function createNativePassthroughPage({ page = {}, pageIndex = 0, imageFile = "", sourceNativeSlide = {} } = {}) {
  return {
    pageIndex: page.pageIndex ?? boundedIndex(pageIndex, "page index"),
    sourceImage: imageFile || undefined,
    background: null,
    shapes: [],
    images: [],
    textBoxes: [],
    tables: [],
    charts: [],
    icons: [],
    preserveTemplateSlide: true,
    source: {
      detector: "source-native-slide-passthrough",
      pageIndex: boundedIndex(pageIndex, "page index"),
      nativeObjects: nonNegativeInteger(sourceNativeSlide.nativeObjects),
      textRuns: nonNegativeInteger(sourceNativeSlide.textRuns),
      shapes: nonNegativeInteger(sourceNativeSlide.shapes),
      groups: nonNegativeInteger(sourceNativeSlide.groups),
      graphicFrames: nonNegativeInteger(sourceNativeSlide.graphicFrames),
      connectors: nonNegativeInteger(sourceNativeSlide.connectors)
    }
  };
}

function composeNativeRebuildDeck({ sourceIr, slideSize, pages, options = {}, services = {} } = {}) {
  const hybridRebuildStrategyProfile = requiredService(services.hybridRebuildStrategyProfile, "hybridRebuildStrategyProfile");
  const summarizeLayerProfile = requiredService(services.summarizeLayerProfile, "summarizeLayerProfile");
  const summarizeExpressionProfile = requiredService(services.summarizeExpressionProfile, "summarizeExpressionProfile");
  if (!sourceIr || typeof sourceIr !== "object" || Array.isArray(sourceIr)) throw new TypeError("source IR is invalid");
  const normalizedSize = parseSlideSize(slideSize);
  if (!normalizedSize || !Array.isArray(pages)) throw new TypeError("native rebuild deck inputs are invalid");
  const deck = {
    version: "1.0",
    meta: {
      ...(sourceIr.meta || {}),
      rebuildStrategy: hybridRebuildStrategyProfile(rebuildStrategyOptions(options))
    },
    slideSize: normalizedSize,
    pages
  };
  const layerProfile = summarizeLayerProfile(deck);
  if (!layerProfile || typeof layerProfile !== "object" || !layerProfile.totals) throw new TypeError("layer profile summary is invalid");
  deck.meta.layerProfile = layerProfile.totals;
  deck.meta.expressionProfile = summarizeExpressionProfile(deck);
  return deck;
}

function rebuildStrategyOptions(options = {}) {
  return Object.freeze({
    preserveGraphics: options.preserveGraphics === true,
    vectorizeStatusIcons: options.vectorizeStatusIcons === true,
    objectifyLayerText: options.objectifyLayerText === true,
    objectifyLayerContainers: options.objectifyLayerContainers === true,
    objectifyLayerConnectors: options.objectifyLayerConnectors === true,
    eraseObjectifiedLayerPrimitives: options.eraseObjectifiedLayerPrimitives === true,
    splitErasedResidualCrops: options.splitErasedResidualCrops === true,
    objectifyTableGrid: options.objectifyTableGrid === true,
    objectifyValueBanners: options.objectifyValueBanners === true,
    objectifyToolGapPlatform: options.objectifyToolGapPlatform === true,
    objectifyAssetHubInputIcons: options.objectifyAssetHubInputIcons === true,
    objectifySmartReviewSegmented: options.objectifySmartReviewSegmented === true,
    objectifyComponentGroupMatches: options.objectifyComponentGroupMatches === true
  });
}

function pagePerformanceMetadata(imageDecodeMs, visualFeatureContext, pngReadCache) {
  const stats = visualFeatureContext?.stats?.() || {};
  const pngStats = pngReadCache?.stats?.() || {};
  return {
    cached: false,
    imageDecodeMs,
    visualFeatureCacheHits: stats.hits,
    visualFeatureCacheMisses: stats.misses,
    visualFeatureCacheEntries: stats.entries,
    pngReadCacheHits: pngStats.hits,
    pngReadCacheMisses: pngStats.misses,
    pngReadCacheEntries: pngStats.entries,
    pngReadCacheBytes: pngStats.bytes
  };
}

const {resolvePptxBuildMode} = require("./pptx-build-mode");

function requiredService(value, name) {
  if (typeof value !== "function") throw new TypeError(`native rebuild pipeline service ${name} is required`);
  return value;
}
function boundedIndex(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 100000) throw new TypeError(`${label} is invalid`);
  return number;
}
function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

module.exports = {
  createPageGraphicsStage,
  createPageImageFinalizer,
  composeNativeRebuildDeck,
  createProgressReporter,
  createNativePassthroughPage,
  createNativeRebuildPlan,
  createPageProgressLifecycle,
  parsePageSelection,
  pagePerformanceMetadata,
  resolvePptxBuildMode,
  planSelectedPages,
  rebuildStrategyOptions,
  shouldIncludePage
};
