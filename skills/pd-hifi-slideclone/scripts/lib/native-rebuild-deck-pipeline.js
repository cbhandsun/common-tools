"use strict";

const path = require("node:path");
const { createProgressReporter } = require("./progress-reporter");
const { parsePageSelection, planSelectedPages, shouldIncludePage } = require("./page-selection");

function createNativeRebuildPlan({ workDir, options = {}, services = {} } = {}) {
  const readJson = requiredService(services.readJson, "readJson");
  const sourceNativeSlideMetadata = requiredService(services.sourceNativeSlideMetadata, "sourceNativeSlideMetadata");
  const defaultSlide = validSlideSize(services.defaultSlide) ? services.defaultSlide : { widthPt: 960, heightPt: 540 };
  if (typeof workDir !== "string" || workDir.length === 0 || workDir.length > 2048 || workDir.includes("\0")) {
    throw new TypeError("native rebuild work directory is invalid");
  }
  const sourceIr = readJson(path.join(workDir, "ir", "deck.json"));
  if (!sourceIr || typeof sourceIr !== "object" || Array.isArray(sourceIr)) throw new TypeError("native rebuild source IR is invalid");
  const slideSize = validSlideSize(sourceIr.slideSize) ? sourceIr.slideSize : defaultSlide;
  const sourcePages = Array.isArray(sourceIr.pages) ? sourceIr.pages : [];
  const pageSelection = parsePageSelection(options.pages || options.onlyPages || options.pageSelection);
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

function createPageProgressLifecycle({ progressReporter, pageIndex, selectedPageOrdinal, selectedPageTotal, pageTimings } = {}) {
  if (!progressReporter || typeof progressReporter.emit !== "function") throw new TypeError("progress reporter is invalid");
  const sourcePageNumber = boundedIndex(pageIndex, "page index") + 1;
  const ordinal = boundedIndex(selectedPageOrdinal, "selected page ordinal") + 1;
  const total = boundedTotal(selectedPageTotal);
  const startedAt = Date.now();
  progressReporter.emit({ phase: "page", status: "start", page: sourcePageNumber, pageIndex: ordinal, pageTotal: total });
  let completed = false;
  return Object.freeze({
    complete(pageDraft, metadata = {}) {
      if (completed) throw new Error("page progress lifecycle is already complete");
      completed = true;
      const elapsedMs = Date.now() - startedAt;
      const projection = {
        phase: "page",
        status: "done",
        page: sourcePageNumber,
        pageIndex: ordinal,
        pageTotal: total,
        elapsedMs,
        images: pageDraft?.images?.length || 0,
        shapes: pageDraft?.shapes?.length || 0,
        textBoxes: pageDraft?.textBoxes?.length || 0,
        ...safeProgressMetadata(metadata)
      };
      progressReporter.emit(projection);
      if (Array.isArray(pageTimings)) pageTimings.push({ page: sourcePageNumber, elapsedMs, ...safeProgressMetadata(metadata) });
      return pageDraft;
    }
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
  if (!validSlideSize(slideSize) || !Array.isArray(pages)) throw new TypeError("native rebuild deck inputs are invalid");
  const deck = {
    version: "1.0",
    meta: {
      ...(sourceIr.meta || {}),
      rebuildStrategy: hybridRebuildStrategyProfile(rebuildStrategyOptions(options))
    },
    slideSize,
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

function safeProgressMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const booleanFields = new Set(["cached", "nativePassthrough"]);
  const integerFields = new Set(["imageDecodeMs", "visualFeatureCacheHits", "visualFeatureCacheMisses", "visualFeatureCacheEntries", "pngReadCacheHits", "pngReadCacheMisses", "pngReadCacheEntries", "pngReadCacheBytes"]);
  return Object.fromEntries(Object.entries(value).filter(([key, item]) =>
    (booleanFields.has(key) && typeof item === "boolean")
    || (integerFields.has(key) && Number.isSafeInteger(item) && item >= 0 && item <= 1_000_000_000)
  ));
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

function resolvePptxBuildMode(options = {}) {
  const rawEngine = String(options["pptx-engine"] || options.pptxEngine || "").trim().toLowerCase();
  const openXmlBatch = enabled(options["openxml-batch"]) || enabled(options.openXmlBatch);
  return {
    engine: openXmlBatch || ["openxml", "openxml-dotnet", "dotnet"].includes(rawEngine) ? "openxml" : "python",
    openXmlBatch,
    openXmlBuilderExe: options["openxml-builder-exe"] || options.openXmlBuilderExe || process.env.OPENXML_BUILDER_EXE || "",
    openXmlBuilderConfiguration: options["openxml-builder-configuration"] || options.openXmlBuilderConfiguration || "",
    openXmlBuilderTargetFramework: options["openxml-builder-target-framework"] || options.openXmlBuilderTargetFramework || "",
    openXmlBuildConcurrency: options["openxml-build-concurrency"] || options.openXmlBuildConcurrency || "",
    openXmlBuildCache: !disabled(options["openxml-build-cache"] ?? options.openXmlBuildCache),
    openXmlBuildCacheDir: options["openxml-build-cache-dir"] || options.openXmlBuildCacheDir || path.join("runs", "slideclone-pptx-build-cache"),
    openXmlBuildCacheMaxBytes: options["openxml-build-cache-max-bytes"] || options.openXmlBuildCacheMaxBytes || "",
    powerPointSafe: !disabled(options["powerpoint-safe"] ?? options.powerPointSafe)
  };
}

function enabled(value) { return value === true || value === "true" || value === "1" || value === "yes"; }
function disabled(value) { return value === false || String(value ?? "").trim().toLowerCase() === "false" || String(value ?? "").trim() === "0"; }

function requiredService(value, name) {
  if (typeof value !== "function") throw new TypeError(`native rebuild pipeline service ${name} is required`);
  return value;
}
function boundedIndex(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > 100000) throw new TypeError(`${label} is invalid`);
  return number;
}
function boundedTotal(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 100000) throw new TypeError("page total is invalid");
  return number;
}
function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}
function validSlideSize(value) {
  return value && Number.isFinite(Number(value.widthPt)) && Number(value.widthPt) > 0
    && Number.isFinite(Number(value.heightPt)) && Number(value.heightPt) > 0;
}

module.exports = {
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
