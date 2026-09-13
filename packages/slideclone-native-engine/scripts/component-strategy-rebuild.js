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
  resolvePython
} = require("./rebuild-real-pptx-native");
const { resolveSmartNativeRebuildOptions } = require("./lib/native-rebuild-options");
const { parseArgs } = require("./lib/component-strategy-cli");
const {
  buildComponentAssetIndex,
  buildComponentStrategyIndex
} = require("./lib/component-strategy-annotator");
const { searchIrComponentCandidates } = require("./component-candidate-search");
const { buildComponentAssetManifest, summarizeLayerEntries } = require("./lib/component-asset-matcher");
const { buildPluginComponentInventory } = require("./lib/plugin-component-registry");
const { _private: pluginComponentRegistryPrivate } = require("./lib/plugin-component-registry");
const { harvestAppliedPptComponents } = require("./harvest-applied-ppt-components");
const { runComponentAcquisitionSearch } = require("./component-acquisition-search");
const { buildPluginActionQueue } = require("./component-plugin-action-queue");
const {
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
} = require("./lib/component-strategy-replacement-plans");

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
  let result = "";
  for (const character of String(value ?? "")) {
    const code = character.codePointAt(0);
    if (code > 0x1f && code !== 0x7f) result += character;
  }
  return result.trim();
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

async function main() {
  const args = parseArgs(process.argv);
  const report = await runComponentStrategyRebuild(args);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.totals.failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${safeErrorMessage(error)}\n`);
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
