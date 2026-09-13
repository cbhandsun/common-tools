"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  buildComponentAssetIndex,
  buildComponentStrategyIndex
} = require("./component-strategy-annotator");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/u, ""));
}

function shouldVectorizeStatusIcons(options = {}) {
  return options.vectorizeStatusIcons === true;
}

function parseNativeRebuildArgs(argv = []) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function isFlagEnabled(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function resolveSmartNativeRebuildOptions(args = {}) {
  const smartNativeLayers = isFlagEnabled(args["smart-native-layers"]);
  const componentStrategyIndex = resolveComponentStrategyIndex(args["component-strategy-report"]);
  const componentAssetIndex = resolveComponentAssetIndex(args["component-asset-manifest"]);
  return {
    preserveGraphics: smartNativeLayers || isFlagEnabled(args["preserve-graphics"]),
    vectorizeStatusIcons: isFlagEnabled(args["vectorize-status-icons"]),
    objectifyLayerText: isFlagEnabled(args["objectify-layer-text"]),
    objectifyStructuredVisualAtomText: smartNativeLayers || isFlagEnabled(args["objectify-structured-visual-atom-text"]),
    objectifyLayerContainers: smartNativeLayers || isFlagEnabled(args["objectify-layer-containers"]),
    objectifyLayerConnectors: smartNativeLayers || isFlagEnabled(args["objectify-layer-connectors"]),
    eraseObjectifiedLayerPrimitives: smartNativeLayers || isFlagEnabled(args["erase-objectified-layer-primitives"]),
    splitErasedResidualCrops: smartNativeLayers || isFlagEnabled(args["split-erased-residual-crops"]),
    objectifyTableGrid: smartNativeLayers || isFlagEnabled(args["objectify-table-grid"]),
    objectifyValueBanners: smartNativeLayers || isFlagEnabled(args["objectify-value-banners"]),
    objectifyToolGapPlatform: isFlagEnabled(args["objectify-tool-gap-platform"]),
    objectifyAssetHubInputIcons: smartNativeLayers || isFlagEnabled(args["objectify-asset-hub-input-icons"]),
    objectifySmartReviewSegmented: isFlagEnabled(args["objectify-smart-review-segmented"]),
    ...(isFlagEnabled(args["force-preserve-wms-route-graphic"])
      ? { forcePreserveWmsRouteGraphic: true }
      : {}),
    objectifyComponentGroupMatches: isFlagEnabled(args["objectify-component-group-matches"]),
    componentGroupMatchMinScore: Number(args["component-group-match-min-score"] || 58),
    replaceSafeComponentTemplateCrops: isFlagEnabled(args["replace-safe-component-template-crops"]),
    allowUnverifiedAppliedPluginPrototypeReplay: isFlagEnabled(args["allow-unverified-applied-plugin-prototype-replay"]),
    ...(isFlagEnabled(args["hybrid-component-template-residuals"]) ? { hybridComponentTemplateResiduals: true } : {}),
    ...(isFlagEnabled(args["erase-specialized-hybrid-residual-text"]) ? { eraseSpecializedHybridResidualText: true } : {}),
    ...(isFlagEnabled(args["allow-asset-os-demand-understanding-native-approximation"])
      ? { allowAssetOsDemandUnderstandingNativeApproximation: true }
      : {}),
    objectifyProductBrainVision: isFlagEnabled(args["objectify-product-brain-vision"]),
    sampleProductBrainVisionColors: isFlagEnabled(args["sample-product-brain-vision-colors"]),
    allowEntropyChallengeNativeApproximation: isFlagEnabled(args["allow-entropy-challenge-native-approximation"]),
    allowProductCollaborationChallengeNativeApproximation: isFlagEnabled(args["allow-product-collaboration-challenge-native-approximation"]),
    ...(componentStrategyIndex ? { componentStrategyIndex } : {}),
    ...(componentAssetIndex ? { componentAssetIndex } : {})
  };
}

function resolveComponentStrategyIndex(reportFile) {
  if (!reportFile || reportFile === true) return null;
  const resolved = path.resolve(String(reportFile));
  if (!fs.existsSync(resolved)) throw new Error(`component strategy report not found: ${resolved}`);
  return buildComponentStrategyIndex(readJson(resolved));
}

function resolveComponentAssetIndex(manifestFile) {
  if (!manifestFile || manifestFile === true) return null;
  const resolved = path.resolve(String(manifestFile));
  if (!fs.existsSync(resolved)) throw new Error(`component asset manifest not found: ${resolved}`);
  return buildComponentAssetIndex(readJson(resolved));
}

function sanitizeCommandArgs(argv = []) {
  const secretPattern = /(?:token|key|secret|password|license|bearer|cookie)/i;
  const result = [];
  for (let index = 0; index < argv.length; index += 1) {
    const item = String(argv[index] || "");
    result.push(item);
    if (item.startsWith("--") && secretPattern.test(item)) {
      if (argv[index + 1] && !String(argv[index + 1]).startsWith("--")) {
        result.push("[redacted]");
        index += 1;
      }
    }
  }
  return result;
}

function rebuildRealPptxNativeUsage() {
  return [
    "Usage: node rebuild-real-pptx-native.js [options]",
    "  --work-root <dir>       Source .work directories (default: ppt文档/可编辑版本)",
    "  --only <deck>           Rebuild one deck only",
    "  --pages <selection>     Rebuild selected 1-based pages, for example: 4,8,13",
    "  --out <dir>             Output directory (default: ppt文档/真可编辑版本)",
    "  --smart-native-layers true",
    "  --force-preserve-wms-route-graphic true  Preserve matching WMS pictorial routes as protected local crops",
    "  --pptx-engine openxml",
    "  --powerpoint-open-gate true  Open every generated PPTX in PowerPoint before delivery",
    "  --final-page-cache-dir <dir>  Override the shared safe page-cache directory",
    "  --reuse-final-page-cache [true|false]  Reuse unchanged cached pages (default: true)",
    "  --no-final-page-cache         Disable writing and reading page cache",
    "  --page-cache-salt <value>      Explicitly invalidate otherwise matching cache entries",
    "  --progress false         Disable safe per-page progress events on stderr",
    "  --help, -h              Print this help without creating output"
  ].join("\n");
}

module.exports = {
  isFlagEnabled,
  parseNativeRebuildArgs,
  rebuildRealPptxNativeUsage,
  resolveComponentAssetIndex,
  resolveComponentStrategyIndex,
  resolveSmartNativeRebuildOptions,
  sanitizeCommandArgs,
  shouldVectorizeStatusIcons
};
