"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const {
  buildPptxBatch,
  buildPptx,
  listWorkDirs,
  rebuildDeckFromWorkDir,
  resolvePptxBuildMode,
  resolvePython,
  resolveSmartNativeRebuildOptions
} = require("./rebuild-real-pptx-native");
const {
  buildComponentAssetIndex,
  buildComponentStrategyIndex
} = require("./lib/component-strategy-annotator");
const { recommendComponentRenderStrategy } = require("./lib/component-render-strategy");
const { classifyGraphicExpressionPolicy } = require("./lib/graphic-expression-policy");
const { searchIrComponentCandidates } = require("./component-candidate-search");
const { buildComponentAssetManifest, summarizeLayerEntries } = require("./lib/component-asset-matcher");
const { buildPluginComponentInventory } = require("./lib/plugin-component-registry");
const { _private: pluginComponentRegistryPrivate } = require("./lib/plugin-component-registry");
const { harvestAppliedPptComponents } = require("./harvest-applied-ppt-components");
const { runComponentAcquisitionSearch } = require("./component-acquisition-search");
const { buildPluginActionQueue } = require("./component-plugin-action-queue");

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

async function runComponentStrategyRebuild(args = {}) {
  const workRoot = path.resolve(args.workRoot || path.join("ppt文档", "可编辑版本"));
  const outRoot = path.resolve(args.out || path.join("ppt文档", "组件策略可编辑版本"));
  const analysisRoot = path.join(outRoot, "_component-strategy-analysis");
  ensureDir(outRoot);
  ensureDir(analysisRoot);
  const report = {
    provider: "component-strategy-rebuild-v1",
    workRoot,
    outRoot,
    generatedAt: new Date().toISOString(),
    mode: args.dryRun ? "dry-run" : "build",
    totals: emptyTotals(),
    results: []
  };
  const componentInventoryResult = args.componentAssets
    ? resolveComponentInventory(withAppliedComponentHarvestDefaults(args, { analysisRoot }))
    : { inventory: null, source: "disabled" };
  const componentInventory = componentInventoryResult.inventory;
  const componentLearningCache = args.componentLearningCache ? readLearningSummaryCache(args.componentLearningCache) : null;
  const expressionPolicyRepairQueue = args.expressionPolicyRepairQueue
    ? readExpressionPolicyRepairQueue(args.expressionPolicyRepairQueue)
    : null;
  report.componentInventory = componentInventoryResult.source;
  if (args.componentLearningCache) report.componentLearningCache = { file: path.resolve(String(args.componentLearningCache)) };
  if (expressionPolicyRepairQueue) report.expressionPolicyRepairQueue = {
    file: path.resolve(String(args.expressionPolicyRepairQueue)),
    actions: Array.isArray(expressionPolicyRepairQueue.actions) ? expressionPolicyRepairQueue.actions.length : 0
  };
  const workDirs = listWorkDirs(workRoot, args.only || null);
  const finalPageCachePolicy = resolveComponentStrategyFinalPageCachePolicy(args, { analysisRoot });
  report.finalPageCache = finalPageCachePolicy.report;
  const pptxBuildOptions = componentStrategyPptxBuildOptions(args, { workDirCount: workDirs.length });
  const deferPptxBuild = shouldDeferComponentStrategyPptxBuild(args, pptxBuildOptions);
  const deferredPptxJobs = [];
  report.pptxBuild = {
    engine: pptxBuildOptions.pptxEngine || "python",
    batch: deferPptxBuild,
    selection: pptxBuildOptions.selection
  };
  for (const workDir of workDirs) {
    const baseName = path.basename(workDir, ".work");
    try {
      const result = await rebuildOneWorkDir({
        workDir,
        baseName,
        outRoot,
        analysisRoot,
        size: args.size,
        dryRun: args.dryRun,
        skipPptx: args.skipPptx,
        python: args.python,
        quality: args.quality,
        qualityRenderer: args.qualityRenderer,
        qualityRoot: args.qualityRoot,
        qualityMaxPages: args.qualityMaxPages,
        reuseRender: args.reuseRender,
        reuseAnalysis: args.reuseAnalysis,
        reuseFinalIr: args.reuseFinalIr,
        componentInventory,
        componentLearningCache,
        componentAssetMaxPerLayer: args.componentAssetMaxPerLayer,
        componentAcquisitionSearch: args.componentAcquisitionSearch,
        componentAcquisitionSearchDryRun: args.componentAcquisitionSearchDryRun,
        componentAcquisitionSearchMaxTasks: args.componentAcquisitionSearchMaxTasks,
        componentAcquisitionSearchMaxKeywords: args.componentAcquisitionSearchMaxKeywords,
        componentAcquisitionSearchSize: args.componentAcquisitionSearchSize,
        componentAcquisitionResolveOfficePlusDownloads: args.componentAcquisitionResolveOfficePlusDownloads,
        componentAcquisitionMaxDownloadUrls: args.componentAcquisitionMaxDownloadUrls,
        componentQueryCacheDir: args.componentQueryCacheDir,
        componentQueryConcurrency: args.componentQueryConcurrency,
        componentOwnerCandidateSearch: args.componentOwnerCandidateSearch,
        componentOwnerCandidateSearchDryRun: args.componentOwnerCandidateSearchDryRun,
        expressionPolicyRepairQueue,
        expressionPolicyRepairQueueFile: args.expressionPolicyRepairQueue,
        finalPageCacheDir: finalPageCachePolicy.dir,
        reuseFinalPageCache: finalPageCachePolicy.reuse,
        objectifyComponentGroupMatches: args.objectifyComponentGroupMatches,
        componentGroupMatchMinScore: args.componentGroupMatchMinScore,
        replaceSafeComponentTemplateCrops: args.replaceSafeComponentTemplateCrops,
        hybridComponentTemplateResiduals: args.hybridComponentTemplateResiduals,
        eraseSpecializedHybridResidualText: args.eraseSpecializedHybridResidualText,
        allowAssetOsDemandUnderstandingNativeApproximation: args.allowAssetOsDemandUnderstandingNativeApproximation,
        pages: args.pages,
        pptxBuildOptions,
        deferPptxBuild,
        deferredPptxJobs
      });
      report.results.push(result);
      report.totals = summarizePipelineTotals(report.results);
    } catch (error) {
      report.totals.failed += 1;
      report.results.push({
        inputWorkDir: workDir,
        status: "failed",
        error: safeErrorMessage(error)
      });
      report.totals = summarizePipelineTotals(report.results);
    }
  }
  if (deferredPptxJobs.length > 0) {
    try {
      buildPptxBatch(deferredPptxJobs, pptxBuildOptions);
      for (const result of report.results) {
        if (result.status === "ir-built") result.status = "converted";
      }
      report.totals = summarizePipelineTotals(report.results);
    } catch (error) {
      for (const job of deferredPptxJobs) {
        const result = report.results.find((item) => item.outputIr === job.irFile);
        if (result && result.status === "ir-built") {
          result.status = "failed";
          result.error = safeErrorMessage(error);
        }
      }
      report.totals = summarizePipelineTotals(report.results);
    }
  }
  const reportFile = args.reportFile
    ? path.resolve(String(args.reportFile))
    : path.join(outRoot, "component-strategy-rebuild-report.json");
  ensureDir(path.dirname(reportFile));
  if (args.componentLearningCache && componentLearningCache) writeLearningSummaryCache(args.componentLearningCache, componentLearningCache);
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function rebuildOneWorkDir({ workDir, baseName, outRoot, analysisRoot, size, dryRun, skipPptx, python, quality, qualityRenderer, qualityRoot, qualityMaxPages, reuseRender, reuseAnalysis, reuseFinalIr, componentInventory, componentLearningCache, componentAssetMaxPerLayer, componentAcquisitionSearch, componentAcquisitionSearchDryRun, componentAcquisitionSearchMaxTasks, componentAcquisitionSearchMaxKeywords, componentAcquisitionSearchSize, componentAcquisitionResolveOfficePlusDownloads, componentAcquisitionMaxDownloadUrls, componentQueryCacheDir, componentQueryConcurrency, componentOwnerCandidateSearch, componentOwnerCandidateSearchDryRun, expressionPolicyRepairQueue, expressionPolicyRepairQueueFile, finalPageCacheDir, reuseFinalPageCache, objectifyComponentGroupMatches, componentGroupMatchMinScore, replaceSafeComponentTemplateCrops, hybridComponentTemplateResiduals, eraseSpecializedHybridResidualText, allowAssetOsDemandUnderstandingNativeApproximation, pages, pptxBuildOptions, deferPptxBuild, deferredPptxJobs }) {
  const timings = {};
  const preAssetDir = path.join(analysisRoot, `${baseName}.pre.assets`);
  const preIrFile = path.join(analysisRoot, `${baseName}.pre-native.ir.json`);
  const preMetaFile = path.join(analysisRoot, `${baseName}.pre-native.meta.json`);
  const candidateFile = path.join(analysisRoot, `${baseName}.component-candidates.json`);
  const candidateMetaFile = path.join(analysisRoot, `${baseName}.component-candidates.meta.json`);
  const componentAssetManifestFile = path.join(analysisRoot, `${baseName}.component-assets.json`);
  const componentAcquisitionSearchFile = path.join(analysisRoot, `${baseName}.component-acquisition-search.json`);
  const componentPluginActionQueueFile = path.join(analysisRoot, `${baseName}.component-plugin-action-queue.json`);
  const ownerCandidateFile = path.join(analysisRoot, `${baseName}.owner-component-candidates.json`);
  const finalAssetDir = path.join(outRoot, `${baseName}.assets`);
  const finalIrFile = path.join(outRoot, `${baseName}.native.ir.json`);
  const finalPptxFile = path.join(outRoot, `${baseName}.native-editable.pptx`);
  const preAnalysisCacheKey = buildPreAnalysisCacheKey({ workDir, pages });
  const reusePreAnalysis = shouldReuseAnalysisArtifact({
    artifactFile: preIrFile,
    metaFile: preMetaFile,
    cacheKey: preAnalysisCacheKey,
    reuseAnalysis
  });
  const preDeck = reusePreAnalysis
    ? measureStage(timings, "preRebuildMs", () => readJson(preIrFile))
    : measureStage(timings, "preRebuildMs", () => rebuildDeckFromWorkDir(workDir, {
      preserveGraphics: true,
      assetDir: preAssetDir,
      irDir: analysisRoot,
      deckName: `${baseName}.pre`,
      pages
    }));
  if (!reusePreAnalysis) {
    fs.writeFileSync(preIrFile, `${JSON.stringify(preDeck, null, 2)}\n`, "utf8");
    writeAnalysisArtifactMeta(preMetaFile, preAnalysisCacheKey, {
      type: "pre-native-ir",
      source: path.join(workDir, "ir", "deck.json")
    });
  }
  const candidateCacheKey = buildCandidateSearchCacheKey({ preIrFile, size, dryRun });
  const reuseCandidateSearch = shouldReuseAnalysisArtifact({
    artifactFile: candidateFile,
    metaFile: candidateMetaFile,
    cacheKey: candidateCacheKey,
    reuseAnalysis
  });
  const candidateReport = reuseCandidateSearch
    ? measureStage(timings, "componentCandidateSearchMs", () => readJson(candidateFile))
    : await measureStageAsync(timings, "componentCandidateSearchMs", () => searchIrComponentCandidates({
      ir: preIrFile,
      out: candidateFile,
      size,
      dryRun,
      queryCacheDir: componentQueryCacheDir ? path.resolve(String(componentQueryCacheDir)) : "",
      queryConcurrency: componentQueryConcurrency
    }));
  if (!reuseCandidateSearch) {
    fs.writeFileSync(candidateFile, `${JSON.stringify(candidateReport, null, 2)}\n`, "utf8");
    writeAnalysisArtifactMeta(candidateMetaFile, candidateCacheKey, {
      type: "component-candidate-report",
      source: preIrFile,
      size: normalizePositiveInt(size, 3),
      dryRun: dryRun === true
    });
  }
  let componentAssetManifest = measureStage(timings, "componentAssetManifestMs", () => componentInventory
    ? reuseAnalysis && fs.existsSync(componentAssetManifestFile)
      ? readJson(componentAssetManifestFile)
      : buildComponentAssetManifest({
      candidateReport,
      inventory: componentInventory,
      maxAssetsPerLayer: componentAssetMaxPerLayer,
      learningSummaryCache: componentLearningCache
    })
    : null);
  if (componentAssetManifest && !(reuseAnalysis && fs.existsSync(componentAssetManifestFile))) fs.writeFileSync(componentAssetManifestFile, `${JSON.stringify(componentAssetManifest, null, 2)}\n`, "utf8");
  const componentAcquisitionReport = componentAssetManifest && componentAcquisitionSearch === true
    ? await measureStageAsync(timings, "componentAcquisitionSearchMs", () => runComponentAcquisitionSearch({
      manifest: componentAssetManifestFile,
      out: componentAcquisitionSearchFile,
      dryRun: componentAcquisitionSearchDryRun === true,
      maxTasks: componentAcquisitionSearchMaxTasks,
      maxKeywordsPerTask: componentAcquisitionSearchMaxKeywords,
      size: componentAcquisitionSearchSize,
      resolveOfficePlusDownloads: componentAcquisitionResolveOfficePlusDownloads === true,
      maxDownloadUrls: componentAcquisitionMaxDownloadUrls
    }))
    : null;
  if (componentAcquisitionReport) fs.writeFileSync(componentAcquisitionSearchFile, `${JSON.stringify(componentAcquisitionReport, null, 2)}\n`, "utf8");
  const componentPluginActionQueue = componentAcquisitionReport
    ? measureStage(timings, "componentPluginActionQueueMs", () => buildPluginActionQueue({
      search: componentAcquisitionSearchFile,
      maxActions: 10,
      minScore: 50
    }))
    : null;
  if (componentPluginActionQueue) fs.writeFileSync(componentPluginActionQueueFile, `${JSON.stringify(componentPluginActionQueue, null, 2)}\n`, "utf8");
  timings.reusedAnalysis = reusePreAnalysis && reuseCandidateSearch;
  timings.analysisCache = {
    preRebuildHit: reusePreAnalysis,
    componentCandidateSearchHit: reuseCandidateSearch
  };
  const candidateReportWithPluginActions = componentPluginActionQueue
    ? injectPluginActionCandidatesIntoReport(candidateReport, componentPluginActionQueue)
    : candidateReport;
  const pluginActionCandidateInjection = candidateReportWithPluginActions?.pluginActionCandidateInjection || null;
  const candidateReportWithExpressionPolicyRepairs = expressionPolicyRepairQueue
    ? applyExpressionPolicyRepairsToReport(candidateReportWithPluginActions, expressionPolicyRepairQueue, { deck: baseName })
    : candidateReportWithPluginActions;
  const expressionPolicyRepairSummary = candidateReportWithExpressionPolicyRepairs?.expressionPolicyRepairSummary || null;
  if ((componentPluginActionQueue && candidateReportWithPluginActions !== candidateReport)
    || candidateReportWithExpressionPolicyRepairs !== candidateReportWithPluginActions) {
    fs.writeFileSync(candidateFile, `${JSON.stringify(candidateReportWithExpressionPolicyRepairs, null, 2)}\n`, "utf8");
  }
  const componentStrategyIndex = buildComponentStrategyIndex(candidateReportWithExpressionPolicyRepairs);
  const componentAssetIndex = componentAssetManifest ? buildComponentAssetIndex(componentAssetManifest) : null;
  const finalPageCacheStats = { hits: 0, misses: 0, writes: 0 };
  const resolvedFinalPageCacheDir = finalPageCacheDir ? path.resolve(String(finalPageCacheDir)) : "";
  const pageCacheSalt = buildFinalPageCacheSalt({
    candidateFile,
    expressionPolicyRepairQueueFile: expressionPolicyRepairQueue ? expressionPolicyRepairQueueFile : "",
    componentAssetManifestFile: componentAssetManifest ? componentAssetManifestFile : "",
    objectifyComponentGroupMatches,
    componentGroupMatchMinScore,
    replaceSafeComponentTemplateCrops,
    hybridComponentTemplateResiduals,
    eraseSpecializedHybridResidualText,
    allowAssetOsDemandUnderstandingNativeApproximation,
    pages
  });
  const finalDeck = reuseFinalIr && fs.existsSync(finalIrFile)
    ? measureStage(timings, "finalRebuildMs", () => readJson(finalIrFile))
    : measureStage(timings, "finalRebuildMs", () => rebuildDeckFromWorkDir(workDir, {
      ...resolveSmartNativeRebuildOptions({ "smart-native-layers": true }),
      objectifyComponentGroupMatches: objectifyComponentGroupMatches === true,
      componentGroupMatchMinScore,
      replaceSafeComponentTemplateCrops: replaceSafeComponentTemplateCrops === true,
      hybridComponentTemplateResiduals: hybridComponentTemplateResiduals === true,
      eraseSpecializedHybridResidualText: eraseSpecializedHybridResidualText === true,
      allowAssetOsDemandUnderstandingNativeApproximation: allowAssetOsDemandUnderstandingNativeApproximation === true,
      componentStrategyIndex,
      ...(componentAssetIndex ? { componentAssetIndex } : {}),
      assetDir: finalAssetDir,
      irDir: outRoot,
      deckName: baseName,
      pages,
      ...(resolvedFinalPageCacheDir ? {
        finalPageCacheDir: resolvedFinalPageCacheDir,
        reuseFinalPageCache: reuseFinalPageCache === true,
        finalPageCacheStats,
        pageCacheSalt
      } : {})
    }));
  if (componentAssetManifest) {
    componentAssetManifest = measureStage(timings, "componentAssetFinalReconcileMs", () =>
      reconcileComponentAssetManifestWithFinalDeck(componentAssetManifest, finalDeck));
    fs.writeFileSync(componentAssetManifestFile, `${JSON.stringify(componentAssetManifest, null, 2)}\n`, "utf8");
  }
  const ownerCandidateReport = componentOwnerCandidateSearch === true
    ? await measureStageAsync(timings, "componentOwnerCandidateSearchMs", async () => {
      fs.writeFileSync(finalIrFile, `${JSON.stringify(finalDeck, null, 2)}\n`, "utf8");
      const report = await searchIrComponentCandidates({
        ir: finalIrFile,
        out: ownerCandidateFile,
        size,
        dryRun: componentOwnerCandidateSearchDryRun === true || dryRun === true,
        queryCacheDir: componentQueryCacheDir ? path.resolve(String(componentQueryCacheDir)) : "",
        queryConcurrency: componentQueryConcurrency
      });
      fs.writeFileSync(ownerCandidateFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      return report;
    })
    : null;
  const replacementCandidateReportRaw = ownerCandidateReport
    ? mergeCandidateReports(candidateReportWithExpressionPolicyRepairs, ownerCandidateReport)
    : candidateReportWithExpressionPolicyRepairs;
  const replacementCandidateReport = expressionPolicyRepairQueue
    ? applyExpressionPolicyRepairsToReport(replacementCandidateReportRaw, expressionPolicyRepairQueue, { deck: baseName })
    : replacementCandidateReportRaw;
  const replacementExpressionPolicyRepairSummary = replacementCandidateReport?.expressionPolicyRepairSummary || expressionPolicyRepairSummary;
  const nativeComponentReplacementPlan = annotateNativeElementsWithPluginReplacementPlans(finalDeck, replacementCandidateReport);
  const finalDeckExpressionPolicyRepairSummary = expressionPolicyRepairQueue
    ? applyExpressionPolicyRepairsToDeckImages(finalDeck, expressionPolicyRepairQueue, { deck: baseName })
    : null;
  timings.reusedFinalIr = reuseFinalIr === true && fs.existsSync(finalIrFile);
  timings.finalPageCache = finalPageCacheDir ? finalPageCacheStats : null;
  if (!timings.reusedFinalIr || nativeComponentReplacementPlan.changed === true || finalDeckExpressionPolicyRepairSummary?.changed === true) fs.writeFileSync(finalIrFile, `${JSON.stringify(finalDeck, null, 2)}\n`, "utf8");
  if (!skipPptx && deferPptxBuild) {
    deferredPptxJobs.push({ irFile: finalIrFile, outFile: finalPptxFile, baseName });
    timings.pptxBuildDeferred = true;
  } else if (!skipPptx) {
    measureStage(timings, "pptxBuildMs", () => buildPptx(finalIrFile, finalPptxFile, {
      python: resolvePython(python),
      ...pptxBuildOptions
    }));
  }
  const qualityResult = quality && !skipPptx
    ? measureStage(timings, "qualityGateMs", () => runQualityGate({
      id: baseName,
      irFile: finalIrFile,
      pptxFile: finalPptxFile,
      qualityRoot: qualityRoot || path.join(outRoot, "_quality"),
      renderer: qualityRenderer || "libreoffice",
      maxPages: qualityMaxPages,
      reuseRender
    }))
    : null;
  timings.totalMeasuredMs = Object.values(timings).reduce((sum, value) =>
    sum + (typeof value === "number" && Number.isFinite(value) ? value : 0), 0);
  return {
    inputWorkDir: workDir,
    preAnalysisIr: preIrFile,
    componentCandidateReport: candidateFile,
    outputIr: finalIrFile,
    outputPptx: skipPptx ? null : finalPptxFile,
    pages: finalDeck.pages.length,
    images: finalDeck.pages.reduce((sum, page) => sum + (page.images || []).length, 0),
    shapes: finalDeck.pages.reduce((sum, page) => sum + (page.shapes || []).length, 0),
    textBoxes: finalDeck.pages.reduce((sum, page) => sum + (page.textBoxes || []).length, 0),
    componentStrategyLayers: countComponentStrategyLayers(finalDeck),
    componentStrategyModeCounts: countComponentStrategyModes(finalDeck),
    componentTemplateAppliedImages: countComponentTemplateAppliedImages(finalDeck),
    componentTemplateAppliedShapes: countComponentTemplateAppliedShapes(finalDeck),
    componentTemplateAppliedTextBoxes: countComponentTemplateAppliedTextBoxes(finalDeck),
    componentTemplateAppliedPictures: countComponentTemplateAppliedPictures(finalDeck),
    componentTemplateMotifReadyImages: countComponentTemplateMotifReadyImages(finalDeck),
    componentTemplateMotifReadyShapes: countComponentTemplateMotifReadyShapes(finalDeck),
    componentTemplateMotifReadyTextBoxes: countComponentTemplateMotifReadyTextBoxes(finalDeck),
    componentTemplateMotifReadyPictures: countComponentTemplateMotifReadyPictures(finalDeck),
    componentTemplateMotifReadyTargetCounts: countComponentTemplateMotifReadyTargets(finalDeck),
    nativeComponentReplacementPlan,
    timings,
    ...(replacementExpressionPolicyRepairSummary ? { expressionPolicyRepairSummary: replacementExpressionPolicyRepairSummary } : {}),
    ...(finalDeckExpressionPolicyRepairSummary ? { finalDeckExpressionPolicyRepairSummary } : {}),
    ...(ownerCandidateReport ? {
      ownerComponentCandidateReport: ownerCandidateFile,
      ownerComponentCandidateSummary: summarizeOwnerCandidateReport(ownerCandidateReport)
    } : {}),
    ...(componentAssetManifest ? {
      componentAssetManifest: componentAssetManifestFile,
      componentAssetSummary: componentAssetManifest.summary
    } : {}),
    ...(componentAcquisitionReport ? {
      componentAcquisitionSearch: componentAcquisitionSearchFile,
      componentAcquisitionSummary: componentAcquisitionReport.summary
    } : {}),
    ...(componentPluginActionQueue ? {
      componentPluginActionQueue: componentPluginActionQueueFile,
      componentPluginActionQueueSummary: componentPluginActionQueue.summary,
      ...(pluginActionCandidateInjection ? { pluginActionCandidateInjection } : {})
    } : {}),
    ...(qualityResult ? { quality: qualityResult } : {}),
    status: skipPptx || deferPptxBuild ? "ir-built" : "converted"
  };
}

function componentStrategyPptxBuildOptions(args = {}, context = {}) {
  const selection = selectComponentStrategyPptxEngine(args, context);
  return {
    python: args.python || "",
    pptxEngine: selection.engine,
    openXmlBatch: selection.batch,
    selection,
    openXmlBuilderExe: args.openXmlBuilderExe || "",
    openXmlBuilderConfiguration: args.openXmlBuilderConfiguration || "",
    openXmlBuilderTargetFramework: args.openXmlBuilderTargetFramework || "",
    openXmlBuildConcurrency: args.openXmlBuildConcurrency || ""
  };
}
function selectComponentStrategyPptxEngine(args = {}, context = {}) {
  const explicit = String(args.pptxEngine || "").trim().toLowerCase();
  if (["python", "python-pptx"].includes(explicit)) {
    return { engine: "python", batch: false, reason: "explicit-python" };
  }
  if (["openxml", "openxml-dotnet", "dotnet"].includes(explicit)) {
    return { engine: "openxml", batch: args.openXmlBatch !== false, reason: "explicit-openxml" };
  }
  if (args.openXmlBatch === true) {
    return { engine: "openxml", batch: true, reason: "explicit-openxml-batch" };
  }
  if (args.quality === true) {
    return { engine: "python", batch: false, reason: "quality-needs-immediate-pptx" };
  }
  if (args.skipPptx === true || args.dryRun === true) {
    return { engine: "python", batch: false, reason: "pptx-build-disabled" };
  }
  const workDirCount = Number(context.workDirCount || 0);
  if (workDirCount > 1) {
    return { engine: "openxml", batch: true, reason: "auto-batch-real-samples-fastest" };
  }
  return { engine: "python", batch: false, reason: "auto-single-file-compatibility" };
}

function shouldDeferComponentStrategyPptxBuild(args = {}, pptxBuildOptions = componentStrategyPptxBuildOptions(args)) {
  if (args.skipPptx === true || args.quality === true) return false;
  return resolvePptxBuildMode(pptxBuildOptions).engine === "openxml" && pptxBuildOptions.openXmlBatch === true;
}

function resolveComponentStrategyFinalPageCachePolicy(args = {}, context = {}) {
  const raw = args.finalPageCacheDir;
  if (raw === false || raw === null || raw === "") {
    return {
      dir: "",
      reuse: false,
      report: { enabled: false, reuse: false, source: "disabled" }
    };
  }
  const analysisRoot = context.analysisRoot ? path.resolve(String(context.analysisRoot)) : path.resolve("runs", "component-strategy-analysis");
  const dir = raw && raw !== "auto"
    ? path.resolve(String(raw))
    : path.join(analysisRoot, "_final-page-cache");
  return {
    dir,
    reuse: args.reuseFinalPageCache !== false,
    report: {
      enabled: true,
      reuse: args.reuseFinalPageCache !== false,
      source: raw && raw !== "auto" ? "explicit" : "auto",
      dir
    }
  };
}

function buildQualityGateArgs({ irFile, pptxFile, outDir, renderer = "libreoffice", maxPages = 999, reuseRender = false }) {
  return [
    path.join(__dirname, "quality-gate-real-pptx.js"),
    "--ir", irFile,
    "--pptx", pptxFile,
    "--out", outDir,
    "--renderer", renderer,
    "--max-pages", String(normalizePositiveInt(maxPages, 999)),
    "--reuse-render", reuseRender ? "true" : "false"
  ];
}

function runQualityGate({ id, irFile, pptxFile, qualityRoot, renderer, maxPages, reuseRender }) {
  const outDir = path.resolve(qualityRoot, `${id}-component-strategy-quality`);
  const result = spawnSync(process.execPath, buildQualityGateArgs({
    irFile,
    pptxFile,
    outDir,
    renderer,
    maxPages,
    reuseRender
  }), {
    cwd: path.resolve(__dirname, "..", "..", ".."),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 50 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`quality gate failed: ${safeErrorMessage(result.stderr || result.stdout || result.error)}`);
  }
  const stdout = JSON.parse(result.stdout);
  return {
    passed: stdout.passed === true,
    reportFile: stdout.reportFile || path.join(outDir, "quality-gate-report.json"),
    accepted: Number(stdout.summary?.accepted || 0),
    needsReview: Number(stdout.summary?.needsReview || 0),
    rejected: Number(stdout.summary?.rejected || 0),
    pixelDiffRatio: numberOrNull(stdout.deckMetrics?.pixelDiffRatio),
    foregroundMissingRatio: numberOrNull(stdout.deckMetrics?.foregroundMissingRatio),
    actionableEditableObjectRatio: numberOrNull(stdout.editabilityProfile?.actionableEditableObjectRatio),
    residualLayerCandidates: Number(stdout.layerProfile?.totals?.residualCandidates || 0),
    failures: stdout.gate?.failures || []
  };
}

function countComponentStrategyLayers(deck = {}) {
  return Object.values(countComponentStrategyModes(deck)).reduce((sum, value) => sum + value, 0);
}

function countComponentStrategyModes(deck = {}) {
  const counts = {};
  for (const page of deck.pages || []) {
    for (const image of page.images || []) {
      const mode = image.source?.componentRenderStrategy?.mode || image.source?.layer?.componentRenderStrategy?.mode;
      if (!mode) continue;
      counts[mode] = (counts[mode] || 0) + 1;
    }
  }
  return counts;
}

function countComponentTemplateAppliedImages(deck = {}) {
  return (deck.pages || []).reduce((sum, page) => sum + (page.images || []).filter((image) =>
    image?.source?.componentTemplateGroupApplied === true).length, 0);
}

function countComponentTemplateAppliedShapes(deck = {}) {
  return (deck.pages || []).reduce((sum, page) => sum + (page.shapes || []).filter((shape) =>
    shape?.source?.componentTemplateGroupApplied === true).length, 0);
}

function countComponentTemplateAppliedTextBoxes(deck = {}) {
  return (deck.pages || []).reduce((sum, page) => sum + (page.textBoxes || []).filter((textBox) =>
    textBox?.source?.componentTemplateGroupApplied === true).length, 0);
}

function countComponentTemplateAppliedPictures(deck = {}) {
  return (deck.pages || []).reduce((sum, page) => sum + (page.images || []).filter((image) =>
    image?.source?.detector === "plugin-component-template-native-picture"
    || image?.type === "plugin-component-picture").length, 0);
}

function countComponentTemplateMotifReadyImages(deck = {}) {
  return (deck.pages || []).reduce((sum, page) => sum + (page.images || []).filter((image) =>
    image?.source?.componentTemplateGroupApplied === true
    && isMotifReadyComponentTemplateSource(image.source)).length, 0);
}

function countComponentTemplateMotifReadyShapes(deck = {}) {
  return (deck.pages || []).reduce((sum, page) => sum + (page.shapes || []).filter((shape) =>
    shape?.source?.componentTemplateGroupApplied === true
    && isMotifReadyComponentTemplateSource(shape.source)).length, 0);
}

function countComponentTemplateMotifReadyTextBoxes(deck = {}) {
  return (deck.pages || []).reduce((sum, page) => sum + (page.textBoxes || []).filter((textBox) =>
    textBox?.source?.componentTemplateGroupApplied === true
    && isMotifReadyComponentTemplateSource(textBox.source)).length, 0);
}

function countComponentTemplateMotifReadyPictures(deck = {}) {
  return (deck.pages || []).reduce((sum, page) => sum + (page.images || []).filter((image) =>
    (image?.source?.detector === "plugin-component-template-native-picture"
      || image?.type === "plugin-component-picture")
    && isMotifReadyComponentTemplateSource(image.source)).length, 0);
}

function reconcileComponentAssetManifestWithFinalDeck(manifest = {}, finalDeck = {}) {
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.layers)) return manifest;
  const layers = manifest.layers.map((layer) => reconcileComponentAssetLayerWithFinalDeck(layer, finalDeck));
  return {
    ...manifest,
    summary: summarizeLayerEntries(layers),
    layers
  };
}

function reconcileComponentAssetLayerWithFinalDeck(layer = {}, finalDeck = {}) {
  if (!Array.isArray(layer.componentAcquisitionTasks) || layer.componentAcquisitionTasks.length === 0) return layer;
  const page = (finalDeck.pages || [])[normalizeNonNegativeIndex(layer.pageIndex)];
  if (!page || !isComponentAssetLayerCompletedByNativeObjects(layer, page)) return layer;
  const { componentAcquisitionTasks, ...rest } = layer;
  return {
    ...rest,
    readiness: {
      ...(layer.readiness || {}),
      finalDisposition: "native-rebuild-completed",
      nextStep: "none-final-ir-already-contains-native-editable-objects"
    },
    componentAcquisitionTasksSuppressedByFinalNativeRebuild: componentAcquisitionTasks.length
  };
}

function isComponentAssetLayerCompletedByNativeObjects(layer = {}, page = {}) {
  const box = normalizePtBox(layer.box);
  if (!box) return false;
  const nativeObjects = [
    ...(page.shapes || []),
    ...(page.textBoxes || [])
  ].filter((item) => isNativeEditableObjectForComponentLayer(item, box));
  if (nativeObjects.length < 4) return false;
  const actionableResiduals = (page.images || []).filter((image) =>
    imageOverlapsLayerBox(image, box) && !isProtectedResidualImage(image));
  return actionableResiduals.length === 0;
}

function isNativeEditableObjectForComponentLayer(item = {}, box = {}) {
  const itemBox = normalizePtBox(item.box || item);
  if (!itemBox || overlapAreaRatio(itemBox, box) < 0.08) return false;
  const source = item.source || {};
  const detector = safeString(source.detector).toLowerCase();
  return source.nativeRebuild === true
    || source.componentTemplateGroupApplied === true
    || source.nativeComponentReplacement === true
    || Boolean(safeString(source.componentTemplatePart))
    || Boolean(safeString(source.nativeComponentPart))
    || /native-|native_|-native/.test(detector);
}

function imageOverlapsLayerBox(image = {}, box = {}) {
  const imageBox = normalizePtBox(image.box || image);
  return imageBox ? overlapAreaRatio(imageBox, box) >= 0.08 : false;
}

function isProtectedResidualImage(image = {}) {
  const source = image.source || {};
  const strategy = source.componentRenderStrategy || source.layer?.componentRenderStrategy || {};
  const text = [
    source.detector,
    source.layer?.layerType,
    source.layer?.templateFamily,
    source.recommendedAction,
    source.layer?.recommendedAction,
    strategy.mode,
    strategy.editableExpectation,
    strategy.reason
  ].map((value) => safeString(value).toLowerCase()).join(" ");
  return /preserve-local-crop|keep-local-crop|match-icon-library/.test(text)
    && /icon|illustration|decorative|screenshot|product|cloud|图标|图示|插画|截图/.test(text);
}

function isMotifReadyComponentTemplateSource(source = {}) {
  if (!source || typeof source !== "object") return false;
  return source.matchedComponentAssetMotifReady === true
    || source.componentTemplateAssetMotifReady === true;
}

function countComponentTemplateMotifReadyTargets(deck = {}) {
  const counts = {};
  for (const page of deck.pages || []) {
    for (const item of [
      ...(page.images || []),
      ...(page.shapes || []),
      ...(page.textBoxes || [])
    ]) {
      const source = item?.source || {};
      if (!isMotifReadyComponentTemplateSource(source)) continue;
      const motifs = componentTemplateTargetMotifs(source);
      if (motifs.length === 0) {
        counts.unknown = (counts.unknown || 0) + 1;
      } else {
        for (const motif of motifs) counts[motif] = (counts[motif] || 0) + 1;
      }
    }
  }
  return counts;
}

function componentTemplateTargetMotifs(source = {}) {
  const values = [
    ...(Array.isArray(source.matchedComponentTargetMotifs) ? source.matchedComponentTargetMotifs : []),
    ...(Array.isArray(source.componentTemplateTargetMotifs) ? source.componentTemplateTargetMotifs : [])
  ];
  return [...new Set(values
    .map((motif) => String(motif || "").trim().toLowerCase())
    .filter((motif) => /^(arc-arrow|ring-node|card-grid|tree-link|fishbone-cause|radial-link|linear-arrow-chain|whole-process-template|lens-funnel-flow|branch-card-flow|layered-stack|funnel-stack|pyramid-stack|venn-overlap|intersection-overlap|milestone-roadmap|quadrant-axis|pie-share-chart)$/.test(motif)))];
}

function summarizePipelineTotals(results = []) {
  return (Array.isArray(results) ? results : []).reduce((totals, result) => {
    if (result?.status === "failed") {
      totals.failed += 1;
      return totals;
    }
    totals.files += 1;
    totals.pages += Number(result.pages || 0);
    totals.images += Number(result.images || 0);
    totals.shapes += Number(result.shapes || 0);
    totals.textBoxes += Number(result.textBoxes || 0);
    totals.componentStrategyLayers += Number(result.componentStrategyLayers || 0);
    totals.componentAssetLayers += Number(result.componentAssetSummary?.layers || 0);
    totals.componentAssetLayersWithLocalAssets += Number(result.componentAssetSummary?.layersWithLocalAssets || 0);
    totals.componentAssetLocalMatches += Number(result.componentAssetSummary?.localAssetMatches || 0);
    totals.componentAssetRecommendedAssets += Number(result.componentAssetSummary?.assetsWithRecommendedGroups || 0);
    totals.componentAssetRecommendedGroups += Number(result.componentAssetSummary?.recommendedGroupMatches || 0);
    totals.componentAssetHighReusableGroups += Number(result.componentAssetSummary?.highReusableGroupMatches || 0);
    totals.componentAssetAcquisitionTasks += Number(result.componentAssetSummary?.acquisitionTasks || 0);
    totals.ownerComponentCandidateLayers += Number(result.ownerComponentCandidateSummary?.layers || 0);
    totals.ownerComponentCandidatePluginLayers += Number(result.ownerComponentCandidateSummary?.pluginComponentTemplateLayers || 0);
    totals.ownerComponentCandidateBestCandidates += Number(result.ownerComponentCandidateSummary?.bestCandidates || 0);
    totals.pluginActionInjectedLayers += Number(result.pluginActionCandidateInjection?.injectedLayers || 0);
    totals.pluginActionInjectedCandidates += Number(result.pluginActionCandidateInjection?.injectedCandidates || 0);
    totals.nativeComponentReplacementPlanLayers += Number(result.nativeComponentReplacementPlan?.layers || 0);
    totals.nativeComponentReplacementPlanShapes += Number(result.nativeComponentReplacementPlan?.shapes || 0);
    totals.nativeComponentReplacementPlanTextBoxes += Number(result.nativeComponentReplacementPlan?.textBoxes || 0);
    totals.finalDeckExpressionPolicyRepairedImages += Number(result.finalDeckExpressionPolicyRepairSummary?.repairedImages || 0);
    mergeCounts(totals.finalDeckExpressionPolicyRepairActions, result.finalDeckExpressionPolicyRepairSummary?.byAction);
    totals.componentTemplateAppliedImages += Number(result.componentTemplateAppliedImages || 0);
    totals.componentTemplateAppliedShapes += Number(result.componentTemplateAppliedShapes || 0);
    totals.componentTemplateAppliedTextBoxes += Number(result.componentTemplateAppliedTextBoxes || 0);
    totals.componentTemplateAppliedPictures += Number(result.componentTemplateAppliedPictures || 0);
    totals.componentTemplateMotifReadyImages += Number(result.componentTemplateMotifReadyImages || 0);
    totals.componentTemplateMotifReadyShapes += Number(result.componentTemplateMotifReadyShapes || 0);
    totals.componentTemplateMotifReadyTextBoxes += Number(result.componentTemplateMotifReadyTextBoxes || 0);
    totals.componentTemplateMotifReadyPictures += Number(result.componentTemplateMotifReadyPictures || 0);
    mergeCounts(totals.componentTemplateMotifReadyTargetCounts, result.componentTemplateMotifReadyTargetCounts);
    if (result.quality) {
      if (result.quality.passed === true) totals.qualityPassed += 1;
      else totals.qualityFailed += 1;
    }
    return totals;
  }, emptyTotals());
}

function emptyTotals() {
  return {
    files: 0,
    pages: 0,
    images: 0,
    shapes: 0,
    textBoxes: 0,
    componentStrategyLayers: 0,
    componentAssetLayers: 0,
    componentAssetLayersWithLocalAssets: 0,
    componentAssetLocalMatches: 0,
    componentAssetRecommendedAssets: 0,
    componentAssetRecommendedGroups: 0,
    componentAssetHighReusableGroups: 0,
    componentAssetAcquisitionTasks: 0,
    ownerComponentCandidateLayers: 0,
    ownerComponentCandidatePluginLayers: 0,
    ownerComponentCandidateBestCandidates: 0,
    pluginActionInjectedLayers: 0,
    pluginActionInjectedCandidates: 0,
    nativeComponentReplacementPlanLayers: 0,
    nativeComponentReplacementPlanShapes: 0,
    nativeComponentReplacementPlanTextBoxes: 0,
    finalDeckExpressionPolicyRepairedImages: 0,
    finalDeckExpressionPolicyRepairActions: {},
    componentTemplateAppliedImages: 0,
    componentTemplateAppliedShapes: 0,
    componentTemplateAppliedTextBoxes: 0,
    componentTemplateAppliedPictures: 0,
    componentTemplateMotifReadyImages: 0,
    componentTemplateMotifReadyShapes: 0,
    componentTemplateMotifReadyTextBoxes: 0,
    componentTemplateMotifReadyPictures: 0,
    componentTemplateMotifReadyTargetCounts: {},
    qualityPassed: 0,
    qualityFailed: 0,
    failed: 0
  };
}

function mergeCounts(target, source = {}) {
  if (!target || !source || typeof source !== "object") return target;
  for (const [key, value] of Object.entries(source)) {
    const safeKey = String(key || "").trim();
    const number = Number(value);
    if (!safeKey || !Number.isFinite(number)) continue;
    target[safeKey] = (target[safeKey] || 0) + number;
  }
  return target;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function readExpressionPolicyRepairQueue(file) {
  const resolved = path.resolve(String(file));
  if (!fs.existsSync(resolved)) throw new Error(`Expression policy repair queue not found: ${resolved}`);
  const queue = readJson(resolved);
  if (!queue || typeof queue !== "object" || !Array.isArray(queue.actions)) {
    throw new Error(`Invalid expression policy repair queue: ${resolved}`);
  }
  return queue;
}

function readLearningSummaryCache(file) {
  const resolved = path.resolve(String(file));
  if (!fs.existsSync(resolved)) return new Map();
  const parsed = readJson(resolved);
  const entries = parsed && typeof parsed === "object" && parsed.entries && typeof parsed.entries === "object"
    ? parsed.entries
    : parsed;
  const cache = new Map();
  for (const [key, value] of Object.entries(entries || {})) {
    if (typeof key !== "string" || !value || typeof value !== "object") continue;
    cache.set(key.slice(0, 1000), value);
  }
  return cache;
}

function writeLearningSummaryCache(file, cache) {
  if (!(cache instanceof Map)) return;
  const resolved = path.resolve(String(file));
  ensureDir(path.dirname(resolved));
  const entries = {};
  for (const [key, value] of cache.entries()) {
    if (typeof key !== "string" || !value || typeof value !== "object") continue;
    entries[key.slice(0, 1000)] = value;
  }
  fs.writeFileSync(resolved, `${JSON.stringify({
    provider: "component-learning-summary-cache-v1",
    updatedAt: new Date().toISOString(),
    entries
  }, null, 2)}\n`, "utf8");
}

function buildFinalPageCacheSalt({
  candidateFile = "",
  expressionPolicyRepairQueueFile = "",
  componentAssetManifestFile = "",
  objectifyComponentGroupMatches = false,
  componentGroupMatchMinScore = 58,
  replaceSafeComponentTemplateCrops = false,
  hybridComponentTemplateResiduals = false,
  eraseSpecializedHybridResidualText = true,
  allowAssetOsDemandUnderstandingNativeApproximation = false,
  pages = ""
} = {}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    provider: "component-strategy-final-page-cache-salt-v2",
    candidateHash: hashFileOrEmpty(candidateFile),
    expressionPolicyRepairQueueHash: hashFileOrEmpty(expressionPolicyRepairQueueFile),
    componentAssetManifestHash: hashFileOrEmpty(componentAssetManifestFile),
    strategyCodeHash: componentStrategyCodeHash(),
    nativeRebuildCodeHash: nativeRebuildCodeHash(),
    objectifyComponentGroupMatches: objectifyComponentGroupMatches === true,
    componentGroupMatchMinScore: numberOrNull(componentGroupMatchMinScore),
    replaceSafeComponentTemplateCrops: replaceSafeComponentTemplateCrops === true,
    hybridComponentTemplateResiduals: hybridComponentTemplateResiduals === true,
    eraseSpecializedHybridResidualText: eraseSpecializedHybridResidualText !== false,
    allowAssetOsDemandUnderstandingNativeApproximation: allowAssetOsDemandUnderstandingNativeApproximation === true,
    pages: normalizePageSelectionForCache(pages),
    componentTemplateCropReplacementPolicy: "safe-table-grid-structural-coverage-v79-product-workflow-process-fidelity"
  })).digest("hex");
}

function buildPreAnalysisCacheKey({ workDir = "", pages = "" } = {}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    provider: "component-strategy-pre-analysis-cache-v1",
    sourceIr: hashFileOrEmpty(path.join(String(workDir || ""), "ir", "deck.json")),
    preserveGraphics: true,
    pages: normalizePageSelectionForCache(pages)
  })).digest("hex");
}

function normalizePageSelectionForCache(value) {
  if (value == null || value === "" || value === false) return "";
  return String(value).split(/[,\s]+/).filter(Boolean).join(",");
}

function normalizeNonNegativeIndex(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0;
}

function normalizePtBox(box = {}) {
  if (!box || typeof box !== "object") return null;
  const out = {
    x: Number(box.x),
    y: Number(box.y),
    w: Number(box.w ?? box.width),
    h: Number(box.h ?? box.height)
  };
  return [out.x, out.y, out.w, out.h].every(Number.isFinite) && out.w > 0 && out.h > 0 ? out : null;
}

function overlapAreaRatio(a = {}, b = {}) {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const w = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const area = w * h;
  const minArea = Math.max(1, Math.min(a.w * a.h, b.w * b.h));
  return area / minArea;
}

function buildCandidateSearchCacheKey({ preIrFile = "", size = 3, dryRun = false } = {}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    provider: "component-strategy-candidate-search-cache-v1",
    preIrHash: hashFileOrEmpty(preIrFile),
    strategyCodeHash: componentStrategyCodeHash(),
    size: normalizePositiveInt(size, 3),
    dryRun: dryRun === true
  })).digest("hex");
}

function componentStrategyCodeHash() {
  return crypto.createHash("sha256").update(JSON.stringify({
    componentRenderStrategy: hashFileOrEmpty(path.join(__dirname, "lib", "component-render-strategy.js")),
    graphicExpressionPolicy: hashFileOrEmpty(path.join(__dirname, "lib", "graphic-expression-policy.js")),
    componentStrategyProfile: hashFileOrEmpty(path.join(__dirname, "lib", "component-strategy-profile.js")),
    componentCandidatePlanner: hashFileOrEmpty(path.join(__dirname, "lib", "component-candidate-planner.js"))
  })).digest("hex");
}

function nativeRebuildCodeHash() {
  return crypto.createHash("sha256").update(JSON.stringify({
    rebuildRealPptxNative: hashFileOrEmpty(path.join(__dirname, "rebuild-real-pptx-native.js")),
    componentStrategyAnnotator: hashFileOrEmpty(path.join(__dirname, "lib", "component-strategy-annotator.js")),
    componentTemplateNativeShapes: hashFileOrEmpty(path.join(__dirname, "lib", "component-template-native-shapes.js")),
    diagramUnderstanding: hashFileOrEmpty(path.join(__dirname, "lib", "diagram-understanding.js")),
    layerClassifier: hashFileOrEmpty(path.join(__dirname, "lib", "layer-classifier.js")),
    relationshipNativeShell: hashFileOrEmpty(path.join(__dirname, "lib", "relationship-native-shell.js")),
    visualAtoms: hashFileOrEmpty(path.join(__dirname, "lib", "visual-atoms.js"))
  })).digest("hex");
}

function shouldReuseAnalysisArtifact({ artifactFile = "", metaFile = "", cacheKey = "", reuseAnalysis = false } = {}) {
  if (!artifactFile || !fs.existsSync(artifactFile)) return false;
  const meta = readAnalysisArtifactMeta(metaFile);
  if (meta?.cacheKey && meta.cacheKey === cacheKey) return true;
  return reuseAnalysis === true && !meta?.cacheKey;
}

function readAnalysisArtifactMeta(file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    const parsed = readJson(file);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeAnalysisArtifactMeta(file, cacheKey, extra = {}) {
  if (!file || !cacheKey) return;
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify({
    provider: "component-strategy-analysis-artifact-cache-v1",
    cacheKey,
    writtenAt: new Date().toISOString(),
    ...extra
  }, null, 2)}\n`, "utf8");
}

function hashFileOrEmpty(file) {
  if (!file) return "";
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return "";
  }
}

function safeErrorMessage(error) {
  return String(error?.message || error || "unknown error")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer <redacted>")
    .replace(/([?&](?:token|key|secret|session|cookie)=)[^&\s]+/gi, "$1<redacted>");
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function normalizePositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function measureStage(timings, key, fn) {
  const start = Date.now();
  try {
    return fn();
  } finally {
    timings[key] = Date.now() - start;
  }
}

async function measureStageAsync(timings, key, fn) {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    timings[key] = Date.now() - start;
  }
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function resolveComponentInventory(args = {}) {
  const harvest = resolveAppliedComponentHarvest(args);
  // A persisted explicit registry has already carried the self-fidelity state
  // through its strict inventory gate. Fresh scans still require source
  // reports, because they have no durable verification boundary to trust.
  const promotionReport = resolveComponentSelfFidelityPromotionReport({
    ...args,
    allowPersistedInventory: Boolean(args.componentInventory || args.componentInventoryCache)
  });
  const componentAssetRoots = normalizeComponentAssetRoots([
    ...(Array.isArray(args.componentAssetRoots) ? args.componentAssetRoots : [args.componentAssetRoots]),
    ...(harvest ? (harvest.outRoots || [harvest.outRoot]) : [])
  ]);
  if (args.componentInventory) {
    return {
      inventory: applyComponentInventoryPromotionPolicy(
        readJson(path.resolve(String(args.componentInventory))),
        promotionReport,
        args.componentAssetsPromotedOnly === true
      ),
      source: {
        mode: "explicit-file",
        file: path.resolve(String(args.componentInventory)),
        ...promotionPolicySource(promotionReport, args.componentAssetsPromotedOnly === true),
        ...(harvest ? { appliedComponentHarvest: harvest.summary } : {}),
        ...(componentAssetRoots.length ? { componentAssetRoots } : {})
      }
    };
  }
  if (args.componentInventoryCache) {
    const cacheFile = path.resolve(String(args.componentInventoryCache));
    const shouldBypassCache = shouldRefreshComponentInventoryCacheForHarvest(harvest);
    if (fs.existsSync(cacheFile) && !shouldBypassCache) {
      return {
        inventory: applyComponentInventoryPromotionPolicy(
          readJson(cacheFile),
          promotionReport,
          args.componentAssetsPromotedOnly === true
        ),
        source: {
          mode: "cache-hit",
          file: cacheFile,
          ...promotionPolicySource(promotionReport, args.componentAssetsPromotedOnly === true),
          ...(harvest ? { appliedComponentHarvest: harvest.summary } : {}),
          ...(componentAssetRoots.length ? { componentAssetRoots } : {})
        }
      };
    }
    const inventory = buildPluginComponentInventory({
      ...(componentAssetRoots.length ? { roots: componentAssetRoots } : {}),
      maxTotalFiles: args.componentAssetMaxFiles,
      maxFilesPerRoot: Math.min(Number(args.componentAssetMaxFiles || 3000), 600),
      maxDepth: 5,
      ...(promotionReport ? { selfFidelityPromotionReport: promotionReport } : {}),
      requireSelfFidelityPromoted: args.componentAssetsPromotedOnly === true
    });
    ensureDir(path.dirname(cacheFile));
    fs.writeFileSync(cacheFile, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
    return {
      inventory,
      source: {
        mode: fs.existsSync(cacheFile) && shouldBypassCache ? "cache-refreshed-after-harvest" : "cache-created",
        file: cacheFile,
        ...promotionPolicySource(promotionReport, args.componentAssetsPromotedOnly === true),
        ...(harvest ? { appliedComponentHarvest: harvest.summary } : {}),
        ...(componentAssetRoots.length ? { componentAssetRoots } : {})
      }
    };
  }
  return {
    inventory: buildPluginComponentInventory({
      ...(componentAssetRoots.length ? { roots: componentAssetRoots } : {}),
      maxTotalFiles: args.componentAssetMaxFiles,
      maxFilesPerRoot: Math.min(Number(args.componentAssetMaxFiles || 3000), 600),
      maxDepth: 5,
      ...(promotionReport ? { selfFidelityPromotionReport: promotionReport } : {}),
      requireSelfFidelityPromoted: args.componentAssetsPromotedOnly === true
    }),
    source: {
      mode: "fresh-scan",
      ...promotionPolicySource(promotionReport, args.componentAssetsPromotedOnly === true),
      ...(harvest ? { appliedComponentHarvest: harvest.summary } : {}),
      ...(componentAssetRoots.length ? { componentAssetRoots } : {})
    }
  };
}

function resolveComponentSelfFidelityPromotionReport(args = {}) {
  const configured = Array.isArray(args.componentSelfFidelityReports) ? args.componentSelfFidelityReports : [];
  const files = configured
    .map((file) => path.resolve(String(file || "")))
    .filter((file) => file && fs.existsSync(file));
  if (args.componentAssetsPromotedOnly === true && files.length === 0 && args.allowPersistedInventory !== true) {
    throw new Error("--component-assets-promoted-only requires at least one existing --component-self-fidelity-report.");
  }
  if (files.length === 0) return null;
  const results = files.flatMap((file) => {
    const report = readJson(file);
    return Array.isArray(report.results) ? report.results : [];
  });
  return {
    provider: "component-self-fidelity-promotion-merge-v1",
    sourceReports: files,
    results
  };
}

function applyComponentInventoryPromotionPolicy(inventory = {}, promotionReport = null, promotedOnly = false) {
  const candidates = Array.isArray(inventory.candidates) ? inventory.candidates : [];
  const applyPromotions = pluginComponentRegistryPrivate?.applySelfFidelityPromotions;
  const promotedCandidates = typeof applyPromotions === "function"
    ? applyPromotions(candidates, promotionReport, { requirePromoted: promotedOnly })
    : candidates.filter((candidate) => !promotedOnly || candidate?.selfFidelityPromoted === true);
  return {
    ...inventory,
    candidates: promotedCandidates,
    summary: {
      ...(inventory.summary || {}),
      candidates: promotedCandidates.length,
      selfFidelityPromoted: promotedCandidates.filter((candidate) => candidate?.selfFidelityPromoted === true).length,
      promotionPolicy: promotedOnly ? "self-fidelity-promoted-only" : "all-assets"
    }
  };
}

function promotionPolicySource(promotionReport, promotedOnly) {
  return {
    promotionPolicy: promotedOnly ? "self-fidelity-promoted-only" : "all-assets",
    selfFidelityPromotionReports: promotionReport?.sourceReports || []
  };
}

function withAppliedComponentHarvestDefaults(args = {}, context = {}) {
  const sources = Array.isArray(args.appliedComponentSources) ? args.appliedComponentSources : [];
  if ((sources.length === 0 && args.harvestISlideTempComponents !== true && args.harvestOfficePlusLocalComponents !== true) || args.appliedComponentHarvestRoot) return args;
  const provider = String(args.appliedComponentProvider || "islide").trim().toLowerCase() || "islide";
  const analysisRoot = context.analysisRoot ? path.resolve(String(context.analysisRoot)) : path.resolve("runs", "plugin-component-inventory");
  return {
    ...args,
    appliedComponentHarvestRoot: path.join(analysisRoot, `${provider}-applied-components`)
  };
}

function resolveAppliedComponentHarvest(args = {}) {
  const sources = Array.isArray(args.appliedComponentSources)
    ? args.appliedComponentSources.filter((source) => String(source || "").trim())
    : [];
  const discoverISlideTemp = args.harvestISlideTempComponents === true;
  const discoverOfficePlusLocal = args.harvestOfficePlusLocalComponents === true;
  if (sources.length === 0 && !discoverISlideTemp && !discoverOfficePlusLocal) return null;
  const baseOutRoot = path.resolve(String(args.appliedComponentHarvestRoot || path.join("runs", "plugin-component-inventory", "applied-components")));
  const harvests = [];
  if (sources.length > 0 || discoverISlideTemp) {
    const outRoot = path.join(baseOutRoot, "islide");
    const manifest = harvestAppliedPptComponents({
      sources,
      out: outRoot,
      provider: args.appliedComponentProvider || "islide",
      discoverISlideTemp,
      discoverRoot: args.harvestDiscoverRoot || "",
      discoverLimit: args.harvestDiscoverLimit,
      recursive: args.appliedComponentHarvestRecursive === true,
      maxFiles: args.componentAssetMaxFiles
    });
    harvests.push({ provider: manifest.provider, outRoot, manifest });
  }
  if (discoverOfficePlusLocal) {
    const outRoot = path.join(baseOutRoot, "officeplus");
    const manifest = harvestAppliedPptComponents({
      out: outRoot,
      provider: "officeplus",
      discoverOfficePlusLocal: true,
      discoverRoot: args.harvestDiscoverRoot || "",
      discoverLimit: args.harvestDiscoverLimit,
      maxFiles: args.componentAssetMaxFiles
    });
    harvests.push({ provider: manifest.provider, outRoot, manifest });
  }
  const manifest = mergeAppliedComponentHarvestManifests(harvests, baseOutRoot);
  const outRoot = baseOutRoot;
  return {
    outRoot,
    outRoots: harvests
      .filter((harvest) => Number(harvest.manifest?.copiedCount || 0) > 0)
      .map((harvest) => harvest.outRoot),
    manifest,
    summary: {
      provider: manifest.provider,
      outRoot,
      outRoots: harvests
        .filter((harvest) => Number(harvest.manifest?.copiedCount || 0) > 0)
        .map((harvest) => harvest.outRoot),
      sourceCount: manifest.sourceCount,
      discoveredCount: manifest.discoveredCount || 0,
      copiedCount: manifest.copiedCount,
      componentNames: (manifest.components || []).map((component) => component.name).slice(0, 20)
    }
  };
}

function mergeAppliedComponentHarvestManifests(harvests = [], outRoot = "") {
  const components = harvests.flatMap((harvest) => Array.isArray(harvest.manifest?.components) ? harvest.manifest.components : []);
  return {
    provider: "applied-ppt-component-harvest-v1",
    createdAt: new Date().toISOString(),
    outRoot,
    sourceCount: harvests.reduce((sum, harvest) => sum + Number(harvest.manifest?.sourceCount || 0), 0),
    discoveredCount: harvests.reduce((sum, harvest) => sum + Number(harvest.manifest?.discoveredCount || 0), 0),
    copiedCount: components.length,
    components
  };
}

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

async function main() {
  const args = parseArgs(process.argv);
  const report = await runComponentStrategyRebuild(args);
  console.log(JSON.stringify(report, null, 2));
  if (report.totals.failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(safeErrorMessage(error));
    process.exitCode = 1;
  });
}

module.exports = {
  buildQualityGateArgs,
  buildFinalPageCacheSalt,
  buildCandidateSearchCacheKey,
  buildPreAnalysisCacheKey,
  componentStrategyPptxBuildOptions,
  countComponentTemplateAppliedImages,
  countComponentTemplateAppliedPictures,
  countComponentTemplateAppliedShapes,
  countComponentTemplateAppliedTextBoxes,
  countComponentStrategyModes,
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
  normalizeComponentAssetRoots,
  parseArgs,
  readLearningSummaryCache,
  rebuildOneWorkDir,
  reconcileComponentAssetManifestWithFinalDeck,
  resolveComponentSelfFidelityPromotionReport,
  resolveAppliedComponentHarvest,
  resolveComponentStrategyFinalPageCachePolicy,
  resolveComponentInventory,
  runComponentStrategyRebuild,
  selectComponentStrategyPptxEngine,
  shouldDeferComponentStrategyPptxBuild,
  shouldRefreshComponentInventoryCacheForHarvest,
  shouldReuseAnalysisArtifact,
  writeLearningSummaryCache,
  withAppliedComponentHarvestDefaults,
  measureStage,
  measureStageAsync,
  summarizePipelineTotals
};
