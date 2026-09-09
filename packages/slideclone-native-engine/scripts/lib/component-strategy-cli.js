"use strict";

const path = require("node:path");

function parseArgs(argv) {
  const args = {
    workRoot: path.join("ppt文档", "可编辑版本"),
    out: path.join("ppt文档", "组件策略可编辑版本"),
    only: "",
    size: 3,
    dryRun: false,
    python: "",
    skipPptx: false,
    quality: false, qualityRenderer: "libreoffice",
    qualityRoot: "",
    qualityMaxPages: 999,
    reuseRender: false, reuseAnalysis: false,
    reuseFinalIr: false,
    componentAssets: false,
    componentAssetMaxFiles: 3000, componentAssetMaxPerLayer: 4,
    componentAssetRoots: [],
    componentAssetsPromotedOnly: false,
    componentSelfFidelityReports: [],
    appliedComponentSources: [],
    appliedComponentProvider: "islide", appliedComponentHarvestRoot: "",
    appliedComponentHarvestRecursive: false,
    harvestISlideTempComponents: false,
    harvestOfficePlusLocalComponents: false,
    harvestDiscoverRoot: "",
    harvestDiscoverLimit: 12,
    componentInventory: "",
    componentInventoryCache: "",
    componentLearningCache: "",
    componentAcquisitionSearch: false,
    componentAcquisitionSearchDryRun: false,
    componentAcquisitionSearchMaxTasks: 20, componentAcquisitionSearchMaxKeywords: 2,
    componentAcquisitionSearchSize: 4, componentAcquisitionResolveOfficePlusDownloads: false,
    componentAcquisitionMaxDownloadUrls: 6,
    componentQueryCacheDir: path.join("runs", "slideclone-component-query-cache"), componentQueryConcurrency: 3,
    componentOwnerCandidateSearch: false, componentOwnerCandidateSearchDryRun: false,
    expressionPolicyRepairQueue: "",
    finalPageCacheDir: "auto", reuseFinalPageCache: true,
    objectifyComponentGroupMatches: true,
    componentGroupMatchMinScore: 58,
    replaceSafeComponentTemplateCrops: false,
    allowAssetOsDemandUnderstandingNativeApproximation: false,
    pptxEngine: "auto",
    openXmlBatch: false,
    openXmlBuilderExe: "",
    openXmlBuilderConfiguration: "", openXmlBuilderTargetFramework: "",
    pages: "",
    reportFile: ""
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--work-root" && next) {
      args.workRoot = next;
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      i += 1;
    } else if (arg === "--only" && next) {
      args.only = next;
      i += 1;
    } else if (arg === "--size" && next) {
      args.size = Number(next);
      i += 1;
    } else if (arg === "--python" && next) {
      args.python = next;
      i += 1;
    } else if (arg === "--quality" && next) {
      args.quality = next === "true" || next === "1" || next === "yes";
      i += 1;
    } else if (arg === "--quality-renderer" && next) {
      args.qualityRenderer = next;
      i += 1;
    } else if (arg === "--quality-root" && next) {
      args.qualityRoot = next;
      i += 1;
    } else if (arg === "--quality-max-pages" && next) {
      args.qualityMaxPages = Number(next);
      i += 1;
    } else if (arg === "--component-assets" && next) {
      args.componentAssets = next === "true" || next === "1" || next === "yes";
      i += 1;
    } else if (arg === "--component-asset-max-files" && next) {
      args.componentAssetMaxFiles = Number(next);
      i += 1;
    } else if (arg === "--component-asset-max-per-layer" && next) {
      args.componentAssetMaxPerLayer = Number(next);
      i += 1;
    } else if (arg === "--component-asset-root" && next) {
      args.componentAssetRoots.push(next);
      i += 1;
    } else if (arg === "--component-assets-promoted-only") {
      args.componentAssets = true;
      args.componentAssetsPromotedOnly = true;
    } else if (arg === "--component-self-fidelity-report" && next) {
      args.componentSelfFidelityReports.push(next);
      i += 1;
    } else if ((arg === "--applied-component-source" || arg === "--applied-component-input") && next) {
      args.appliedComponentSources.push(next);
      args.componentAssets = true;
      i += 1;
    } else if (arg === "--applied-component-provider" && next) {
      args.appliedComponentProvider = next;
      i += 1;
    } else if (arg === "--applied-component-harvest-root" && next) {
      args.appliedComponentHarvestRoot = next;
      i += 1;
    } else if (arg === "--applied-component-harvest-recursive") {
      args.appliedComponentHarvestRecursive = true;
    } else if (arg === "--harvest-islide-temp" || arg === "--discover-islide-temp-components") {
      args.harvestISlideTempComponents = true;
      args.harvestOfficePlusLocalComponents = true;
      args.componentAssets = true;
    } else if (arg === "--harvest-officeplus-local" || arg === "--discover-officeplus-local-components") {
      args.harvestOfficePlusLocalComponents = true;
      args.componentAssets = true;
    } else if (arg === "--harvest-discover-root" && next) {
      args.harvestDiscoverRoot = next;
      i += 1;
    } else if (arg === "--harvest-discover-limit" && next) {
      args.harvestDiscoverLimit = Number(next);
      i += 1;
    } else if (arg === "--component-inventory" && next) {
      args.componentInventory = next;
      i += 1;
    } else if (arg === "--component-inventory-cache" && next) {
      args.componentInventoryCache = next;
      i += 1;
    } else if (arg === "--component-learning-cache" && next) {
      args.componentLearningCache = next;
      i += 1;
    } else if (arg === "--component-acquisition-search" && next) {
      args.componentAcquisitionSearch = next === "true" || next === "1" || next === "yes";
      i += 1;
    } else if (arg === "--component-acquisition-search-dry-run") {
      args.componentAcquisitionSearch = true;
      args.componentAcquisitionSearchDryRun = true;
    } else if (arg === "--component-acquisition-search-max-tasks" && next) {
      args.componentAcquisitionSearchMaxTasks = Number(next);
      i += 1;
    } else if (arg === "--component-acquisition-search-max-keywords" && next) {
      args.componentAcquisitionSearchMaxKeywords = Number(next);
      i += 1;
    } else if (arg === "--component-acquisition-search-size" && next) {
      args.componentAcquisitionSearchSize = Number(next);
      i += 1;
    } else if (arg === "--component-acquisition-resolve-officeplus-downloads") {
      args.componentAcquisitionResolveOfficePlusDownloads = true;
    } else if (arg === "--component-acquisition-max-download-urls" && next) {
      args.componentAcquisitionMaxDownloadUrls = Number(next);
      i += 1;
    } else if (arg === "--component-query-cache-dir" && next) { args.componentQueryCacheDir = next; i += 1;
    } else if (arg === "--component-query-concurrency" && next) { args.componentQueryConcurrency = Number(next); i += 1;
    } else if (arg === "--component-owner-candidate-search" && next) {
      args.componentOwnerCandidateSearch = next === "true" || next === "1" || next === "yes";
      i += 1;
    } else if (arg === "--component-owner-candidate-search-dry-run") {
      args.componentOwnerCandidateSearch = true;
      args.componentOwnerCandidateSearchDryRun = true;
    } else if ((arg === "--expression-policy-repair-queue" || arg === "--expression-policy-repairs") && next) {
      args.expressionPolicyRepairQueue = next;
      i += 1;
    } else if (arg === "--final-page-cache-dir" && next) {
      args.finalPageCacheDir = next;
      i += 1;
    } else if (arg === "--no-final-page-cache") {
      args.finalPageCacheDir = "";
      args.reuseFinalPageCache = false;
    } else if (arg === "--objectify-component-group-matches" && next) {
      args.objectifyComponentGroupMatches = next === "true" || next === "1" || next === "yes";
      i += 1;
    } else if (arg === "--no-objectify-component-group-matches") {
      args.objectifyComponentGroupMatches = false;
    } else if (arg === "--component-group-match-min-score" && next) {
      args.componentGroupMatchMinScore = Number(next);
      i += 1;
    } else if (arg === "--replace-safe-component-template-crops" && next) {
      args.replaceSafeComponentTemplateCrops = next === "true" || next === "1" || next === "yes";
      i += 1;
    } else if (arg === "--hybrid-component-template-residuals" && next) {
      args.hybridComponentTemplateResiduals = next === "true" || next === "1" || next === "yes";
      i += 1;
    } else if (arg === "--erase-specialized-hybrid-residual-text" && next) {
      args.eraseSpecializedHybridResidualText = next === "true" || next === "1" || next === "yes";
      i += 1;
    } else if (arg === "--allow-asset-os-demand-understanding-native-approximation" && next) {
      args.allowAssetOsDemandUnderstandingNativeApproximation = next === "true" || next === "1" || next === "yes";
      i += 1;
    } else if (arg === "--pptx-engine" && next) {
      args.pptxEngine = next;
      i += 1;
    } else if (arg === "--openxml-builder-exe" && next) {
      args.openXmlBuilderExe = next;
      i += 1;
    } else if (arg === "--openxml-builder-configuration" && next) {
      args.openXmlBuilderConfiguration = next;
      i += 1;
    } else if (arg === "--openxml-builder-target-framework" && next) {
      args.openXmlBuilderTargetFramework = next;
      i += 1;
    } else if (arg === "--openxml-build-concurrency" && next) { args.openXmlBuildConcurrency = next; i += 1;
    } else if ((arg === "--pages" || arg === "--page" || arg === "--only-pages") && next) {
      args.pages = next;
      i += 1;
    } else if (arg === "--report-file" && next) {
      args.reportFile = next;
      i += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--skip-pptx") {
      args.skipPptx = true;
    } else if (arg === "--openxml-batch") {
      args.openXmlBatch = true;
    } else if (arg === "--reuse-render") {
      args.reuseRender = true;
    } else if (arg === "--reuse-analysis") {
      args.reuseAnalysis = true;
    } else if (arg === "--reuse-final-ir") {
      args.reuseFinalIr = true;
    } else if (arg === "--reuse-final-page-cache") {
      args.reuseFinalPageCache = true;
    } else {
      throw new Error(`Unknown component-strategy-rebuild argument: ${arg}`);
    }
  } return args;
}


module.exports = {
  parseArgs
};
