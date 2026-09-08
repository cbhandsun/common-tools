"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { isKnownTargetMotif, sanitizeMotifs } = require("./component-motifs");
const { classifyGraphicExpressionPolicy } = require("./graphic-expression-policy");

function buildComponentCoverageMatrix({ reports = [] } = {}) {
  const rows = [];
  for (const reportFile of reports) {
    rows.push(...summarizeComponentRebuildReport(reportFile));
  }
  return {
    provider: "component-coverage-matrix-v1",
    generatedAt: new Date().toISOString(),
    totals: aggregateRows(rows),
    rows
  };
}

function summarizeComponentRebuildReport(reportFile) {
  const resolved = path.resolve(reportFile);
  const report = readJson(resolved);
  const results = Array.isArray(report.results) ? report.results : [];
  return results.map((result) => summarizeResult({ result, reportFile: resolved }));
}

function summarizeResult({ result = {}, reportFile = "" } = {}) {
  const candidateFile = safeString(result.componentCandidateReport || "");
  const finalIrFile = safeString(result.outputIr || "");
  const finalIr = readFinalIrForCoverage(finalIrFile);
  const finalMetrics = summarizeFinalIrMetrics(finalIr);
  const finalOpportunities = summarizeFinalIrNativeOpportunities(finalIr);
  const candidateSummary = candidateFile && fs.existsSync(candidateFile)
    ? summarizeCandidateReport(candidateFile, { finalIrFile })
    : emptyCandidateSummary();
  const expressionPolicy = candidateFile && fs.existsSync(candidateFile)
    ? summarizeExpressionPolicyReport(candidateFile, { finalIrFile })
    : emptyExpressionPolicySummary();
  const componentAssetDiagnostics = summarizeComponentAssetDiagnostics(result.componentAssetManifest);
  const deck = deckNameFromResult(result);
  return {
    deck,
    reportFile,
    outputPptx: safeString(result.outputPptx || ""),
    outputPptxExists: outputExists(result.outputPptx),
    outputPptxBytes: outputSize(result.outputPptx),
    outputPptxZipValid: outputZipValid(result.outputPptx),
    outputPptxOpenXmlValid: outputPptxOpenXmlValid(result.outputPptx),
    outputPptxMissingEntries: outputPptxMissingEntries(result.outputPptx),
    pages: finalMetrics ? finalMetrics.pages : safeNumber(result.pages),
    images: finalMetrics ? finalMetrics.images : safeNumber(result.images),
    shapes: finalMetrics ? finalMetrics.shapes : safeNumber(result.shapes),
    textBoxes: finalMetrics ? finalMetrics.textBoxes : safeNumber(result.textBoxes),
    componentStrategyLayers: finalMetrics ? finalMetrics.componentStrategyLayers : safeNumber(result.componentStrategyLayers),
    componentStrategyModeCounts: finalMetrics ? finalMetrics.componentStrategyModeCounts : result.componentStrategyModeCounts || {},
    componentTemplateAppliedImages: finalMetrics ? finalMetrics.componentTemplateAppliedImages : safeNumber(result.componentTemplateAppliedImages),
    componentTemplateAppliedShapes: finalMetrics ? finalMetrics.componentTemplateAppliedShapes : safeNumber(result.componentTemplateAppliedShapes),
    componentTemplateAppliedTextBoxes: finalMetrics ? finalMetrics.componentTemplateAppliedTextBoxes : safeNumber(result.componentTemplateAppliedTextBoxes),
    componentTemplateAppliedPictures: finalMetrics ? finalMetrics.componentTemplateAppliedPictures : safeNumber(result.componentTemplateAppliedPictures),
    componentTemplateMotifReadyImages: finalMetrics ? finalMetrics.componentTemplateMotifReadyImages : safeNumber(result.componentTemplateMotifReadyImages),
    componentTemplateMotifReadyShapes: finalMetrics ? finalMetrics.componentTemplateMotifReadyShapes : safeNumber(result.componentTemplateMotifReadyShapes),
    componentTemplateMotifReadyTextBoxes: finalMetrics ? finalMetrics.componentTemplateMotifReadyTextBoxes : safeNumber(result.componentTemplateMotifReadyTextBoxes),
    componentTemplateMotifReadyPictures: finalMetrics ? finalMetrics.componentTemplateMotifReadyPictures : safeNumber(result.componentTemplateMotifReadyPictures),
    componentTemplateWholeProcessImages: finalMetrics ? finalMetrics.componentTemplateWholeProcessImages : safeNumber(result.componentTemplateWholeProcessImages),
    componentTemplateWholeProcessShapes: finalMetrics ? finalMetrics.componentTemplateWholeProcessShapes : safeNumber(result.componentTemplateWholeProcessShapes),
    componentTemplateWholeProcessTextBoxes: finalMetrics ? finalMetrics.componentTemplateWholeProcessTextBoxes : safeNumber(result.componentTemplateWholeProcessTextBoxes),
    componentTemplateWholeProcessPictures: finalMetrics ? finalMetrics.componentTemplateWholeProcessPictures : safeNumber(result.componentTemplateWholeProcessPictures),
    componentTemplateMotifReadyTargetCounts: finalMetrics ? finalMetrics.componentTemplateMotifReadyTargetCounts : result.componentTemplateMotifReadyTargetCounts || {},
    componentTemplateStructureFitShapes: finalMetrics ? finalMetrics.componentTemplateStructureFitShapes : safeNumber(result.componentTemplateStructureFitShapes),
    componentTemplateStructureFitTextBoxes: finalMetrics ? finalMetrics.componentTemplateStructureFitTextBoxes : safeNumber(result.componentTemplateStructureFitTextBoxes),
    componentTemplateStructureFitPictures: finalMetrics ? finalMetrics.componentTemplateStructureFitPictures : safeNumber(result.componentTemplateStructureFitPictures),
    componentTemplateStructureFitReasonCounts: finalMetrics ? finalMetrics.componentTemplateStructureFitReasonCounts : result.componentTemplateStructureFitReasonCounts || {},
    componentReplacementPlanComponents: finalMetrics ? finalMetrics.componentReplacementPlanComponents : safeNumber(result.nativeComponentReplacementPlan?.components),
    componentReplacementPlanLayers: finalMetrics ? finalMetrics.componentReplacementPlanLayers : safeNumber(result.nativeComponentReplacementPlan?.layers),
    componentReplacementPlanShapes: finalMetrics ? finalMetrics.componentReplacementPlanShapes : safeNumber(result.nativeComponentReplacementPlan?.shapes),
    componentReplacementPlanTextBoxes: finalMetrics ? finalMetrics.componentReplacementPlanTextBoxes : safeNumber(result.nativeComponentReplacementPlan?.textBoxes),
    componentReplacementPlanElements: finalMetrics ? finalMetrics.componentReplacementPlanElements : safeNumber(result.nativeComponentReplacementPlan?.shapes) + safeNumber(result.nativeComponentReplacementPlan?.textBoxes),
    componentReplacementPlanProviderCounts: finalMetrics ? finalMetrics.componentReplacementPlanProviderCounts : {},
    componentReplacementPlanSuitabilityTierCounts: finalMetrics ? finalMetrics.componentReplacementPlanSuitabilityTierCounts : {},
    visualAtomTopologyConnectors: finalMetrics ? finalMetrics.visualAtomTopologyConnectors : safeNumber(result.visualAtomTopologyConnectors),
    visualAtomContainerNodes: finalMetrics ? finalMetrics.visualAtomContainerNodes : safeNumber(result.visualAtomContainerNodes),
    visualAtomContainedNodes: finalMetrics ? finalMetrics.visualAtomContainedNodes : safeNumber(result.visualAtomContainedNodes),
    componentAssetLayers: safeNumber(result.componentAssetSummary?.layers),
    componentAssetLayersWithLocalAssets: safeNumber(result.componentAssetSummary?.layersWithLocalAssets),
    componentAssetLocalMatches: safeNumber(result.componentAssetSummary?.localAssetMatches),
    componentAssetRecommendedAssets: safeNumber(result.componentAssetSummary?.assetsWithRecommendedGroups),
    componentAssetRecommendedGroups: safeNumber(result.componentAssetSummary?.recommendedGroupMatches),
    componentAssetHighReusableGroups: safeNumber(result.componentAssetSummary?.highReusableGroupMatches),
    componentAssetRejectedGroups: componentAssetDiagnostics.rejectedGroups,
    componentAssetRejectionReasonCounts: componentAssetDiagnostics.byReason,
    componentAssetRejectionTargetMotifCounts: componentAssetDiagnostics.byTargetMotif,
    componentAssetRejectionExamples: componentAssetDiagnostics.examples,
    componentAssetAcquisitionTasks: componentAssetDiagnostics.acquisitionTasks,
    componentAssetAcquisitionProviderCounts: componentAssetDiagnostics.byAcquisitionProvider,
    componentAssetAcquisitionMotifCounts: componentAssetDiagnostics.byAcquisitionMotif,
    componentAssetAcquisitionKindCounts: componentAssetDiagnostics.byAcquisitionKind,
    componentAssetAcquisitionExamples: componentAssetDiagnostics.acquisitionExamples,
    residualLayers: candidateSummary.residualLayers,
    intentionalPreserveLayers: candidateSummary.intentionalPreserveLayers,
    actionableResidualLayers: candidateSummary.actionableResidualLayers,
    residualModeCounts: candidateSummary.residualModeCounts,
    residualLayerTypeCounts: candidateSummary.residualLayerTypeCounts,
    residualDispositionCounts: candidateSummary.residualDispositionCounts,
    residualPriorityCounts: candidateSummary.residualPriorityCounts,
    actionableResiduals: candidateSummary.actionableResiduals,
    expressionPolicyLayers: expressionPolicy.layers,
    expressionPolicyDispositionCounts: expressionPolicy.dispositionCounts,
    expressionPolicyUnitDispositionCounts: expressionPolicy.unitDispositionCounts,
    expressionPolicyOutcomeCounts: expressionPolicy.outcomeCounts,
    expressionPolicyViolationCounts: expressionPolicy.violationCounts,
    expressionPolicyViolations: expressionPolicy.violations,
    nativeOpportunityLayers: finalOpportunities.nativeOpportunityLayers,
    nativeOpportunityPriorityCounts: finalOpportunities.nativeOpportunityPriorityCounts,
    nativeOpportunityDispositionCounts: finalOpportunities.nativeOpportunityDispositionCounts,
    nativeOpportunities: finalOpportunities.nativeOpportunities,
    status: safeString(result.status || "")
  };
}

function summarizeExpressionPolicyReport(candidateFile, options = {}) {
  const report = readJson(candidateFile);
  const layers = Array.isArray(report.layers) ? report.layers : [];
  const finalIr = readFinalIrForCoverage(options.finalIrFile);
  const summary = emptyExpressionPolicySummary();
  for (const layer of layers) {
    const finalImage = finalIr ? finalImageForCandidateLayer(layer, finalIr) : null;
    if (finalIr && !finalImage) continue;
    const item = summarizeExpressionPolicyLayer(layer, { finalImage });
    summary.layers += 1;
    addCount(summary.dispositionCounts, item.disposition);
    addCount(summary.unitDispositionCounts, item.unitDisposition);
    addCount(summary.outcomeCounts, item.outcome);
    if (item.violation) {
      addCount(summary.violationCounts, item.violation);
      if (summary.violations.length < 24) summary.violations.push(item);
    }
  }
  return summary;
}

function emptyExpressionPolicySummary() {
  return {
    layers: 0,
    dispositionCounts: {},
    unitDispositionCounts: {},
    outcomeCounts: {},
    violationCounts: {},
    violations: []
  };
}

function summarizeExpressionPolicyLayer(layer = {}, options = {}) {
  const effectiveLayer = mergeFinalImageExpressionPolicyLayer(layer, options.finalImage);
  const mode = safeString(effectiveLayer.componentRenderStrategy?.mode || effectiveLayer.mode || "unknown");
  const expressionPolicy = classifyGraphicExpressionPolicy(effectiveLayer);
  const unitDisposition = safeString(expressionPolicy.unitDisposition || "classification-needed");
  const disposition = classifyExpressionPolicyDisposition(effectiveLayer, expressionPolicy);
  const outcome = classifyExpressionPolicyOutcome(mode, effectiveLayer);
  const violation = expressionPolicyViolation({ layer: effectiveLayer, disposition, unitDisposition, outcome, mode, expressionPolicy });
  return {
    page: safeNumber(effectiveLayer.pageIndex) + 1,
    image: safeNumber(effectiveLayer.imageIndex) + 1,
    layerType: safeString(effectiveLayer.layerType || "unknown"),
    detector: safeString(effectiveLayer.detector || ""),
    expressionForm: safeString(effectiveLayer.expressionForm || ""),
    expressionSubtype: safeString(effectiveLayer.expressionSubtype || ""),
    family: safeString(effectiveLayer.templateFamily || effectiveLayer.diagramUnderstanding?.componentStrategy?.templateFamily || ""),
    disposition,
    unitDisposition,
    policyKind: safeString(expressionPolicy.kind || ""),
    minimumUnitPolicy: safeString(expressionPolicy.minimumUnitPolicy || ""),
    outcome,
    mode,
    violation,
    areaRatio: numberOrNull(effectiveLayer.areaRatio),
    candidateTitle: safeString((Array.isArray(effectiveLayer.bestCandidates) ? effectiveLayer.bestCandidates[0]?.title : "") || "")
  };
}

function mergeFinalImageExpressionPolicyLayer(layer = {}, finalImage = null) {
  if (!finalImage || typeof finalImage !== "object") return layer;
  const source = finalImage.source || {};
  const sourceLayer = source.layer || {};
  const finalStrategy = source.componentRenderStrategy || sourceLayer.componentRenderStrategy || {};
  return {
    ...layer,
    layerType: source.layerType || sourceLayer.layerType || finalImage.layerType || layer.layerType,
    detector: source.detector || sourceLayer.detector || finalImage.detector || layer.detector,
    expressionForm: source.expressionForm || sourceLayer.expressionForm || finalImage.expressionForm || layer.expressionForm,
    expressionSubtype: source.expressionSubtype || sourceLayer.expressionSubtype || finalImage.expressionSubtype || layer.expressionSubtype,
    recommendedAction: source.recommendedAction || sourceLayer.recommendedAction || layer.recommendedAction,
    standaloneVisualAsset: source.standaloneVisualAsset === true || sourceLayer.standaloneVisualAsset === true || layer.standaloneVisualAsset === true,
    nativeRebuild: source.nativeRebuild === true || sourceLayer.nativeRebuild === true || layer.nativeRebuild === true,
    tableGridObjectified: source.tableGridObjectified === true || sourceLayer.tableGridObjectified === true || layer.tableGridObjectified === true,
    objectifiedGrid: source.objectifiedGrid || sourceLayer.objectifiedGrid || layer.objectifiedGrid || null,
    componentRenderStrategy: Object.keys(finalStrategy).length > 0
      ? { ...(layer.componentRenderStrategy || {}), ...finalStrategy }
      : layer.componentRenderStrategy
  };
}

function classifyExpressionPolicyDisposition(layer = {}, expressionPolicy = null) {
  const policy = expressionPolicy || classifyGraphicExpressionPolicy(layer);
  const text = expressionPolicyText(layer);
  if (policy.kind === "standalone-visual-asset") return "standalone-visual-asset";
  if (policy.kind === "decorative-texture") return "decorative-or-banner";
  if (policy.unitDisposition === "intentional-visual-crop" && isStandaloneExpressionPolicyAsset(layer)) return "standalone-visual-asset";
  if (/screenshot|document|\bui\b|screen|截图|界面/.test(text)) return "screenshot-or-document";
  if (/background|decorative|banner|value-banner|brand|logo|cover|封面|装饰|背景/.test(text)) return "decorative-or-banner";
  if (/table|matrix|grid|表格|矩阵/.test(text)) return "table-or-matrix";
  if (/chart|axis|series|plot|kpi|图表/.test(text)) return "data-chart-or-evidence";
  if (/diagram|flow|process|chain|timeline|hub|spoke|radial|cycle|topology|流程|关系|循环/.test(text)) return "structured-diagram";
  return "unknown-visual";
}

function classifyExpressionPolicyOutcome(mode = "", layer = {}) {
  if (hasNativeSemanticStructure(layer)) return "native-rebuild";
  const value = safeString(mode).toLowerCase();
  if (/plugin-component-template/.test(value)) return "component-template";
  if (/native-visual-atom-rebuild|native-rebuild-with-component-style-guide/.test(value)) return "native-rebuild";
  if (/preserve-crop-with-native-overlays/.test(value)) return "fidelity-crop-with-native-overlays";
  if (/preserve-crop-with-component-reference/.test(value)) return "fidelity-crop-with-component-reference";
  if (/preserve-local-crop/.test(value)) return "fidelity-crop";
  return value || "unknown";
}

function hasNativeSemanticStructure(layer = {}) {
  return layer?.nativeRebuild === true
    && (layer?.tableGridObjectified === true || (layer?.objectifiedGrid && typeof layer.objectifiedGrid === "object"));
}

function expressionPolicyViolation({ layer = {}, disposition = "", unitDisposition = "", outcome = "" } = {}) {
  if (unitDisposition === "classification-needed") return "expression-policy-classification-needed";
  if (unitDisposition === "semantic-native-structure" && outcome === "fidelity-crop") {
    if (disposition === "table-or-matrix") return "table-or-matrix-left-as-flat-crop";
    if (disposition === "data-chart-or-evidence") return "data-chart-left-as-flat-crop";
    if (disposition === "structured-diagram") return "structured-diagram-left-as-flat-crop";
    return "semantic-structure-left-as-flat-crop";
  }
  if (disposition === "standalone-visual-asset") {
    return outcome === "fidelity-crop" || outcome === "fidelity-crop-with-component-reference"
      ? ""
      : "standalone-asset-over-objectified";
  }
  if (disposition === "screenshot-or-document") {
    return outcome === "component-template"
      ? "screenshot-replaced-by-template"
      : "";
  }
  if (disposition === "table-or-matrix") {
    return outcome === "component-template" || outcome === "native-rebuild"
      ? ""
      : "table-or-matrix-left-as-flat-crop";
  }
  if (disposition === "structured-diagram") {
    if (outcome === "component-template" || outcome === "native-rebuild" || outcome === "fidelity-crop-with-component-reference") return "";
    return isIntentionalPreserveLayer({
      layerType: layer.layerType,
      family: layer.templateFamily,
      detector: layer.detector,
      expressionForm: layer.expressionForm,
      expressionSubtype: layer.expressionSubtype,
      areaRatio: layer.areaRatio,
      box: layer.box
    }) ? "" : "structured-diagram-left-as-flat-crop";
  }
  return "";
}

function isStandaloneExpressionPolicyAsset(layer = {}) {
  if (layer.standaloneVisualAsset === true || layer.source?.layer?.standaloneVisualAsset === true) return true;
  const text = expressionPolicyText(layer);
  if (/entropy-challenge|entropy|illustration-zone|icon-or-illustration|visual-example|示意图|图示|插画/.test(text)
    && !/table-zone|chart-zone|data-chart|axis|series|plot/.test(text)) return true;
  if (/table|matrix|grid|chart|axis|series|plot|complex-diagram|linear-process-diagram/.test(text)) return false;
  return /icon-or-illustration|illustration-zone|plugin-.*(?:arrow|icon)|arrow-illustration|cycle-flow-icon|vector-arrow|visual-example|图标|插画|示意图|logo|brand/.test(text);
}

function expressionPolicyText(layer = {}) {
  const strategy = layer.diagramUnderstanding?.componentStrategy || {};
  return [
    layer.layerType,
    layer.templateFamily,
    layer.detector,
    layer.expressionForm,
    layer.expressionSubtype,
    layer.recommendedAction,
    layer.componentRenderStrategy?.mode,
    strategy.templateFamily,
    layer.diagramUnderstanding?.archetype,
    ...(Array.isArray(strategy.targetMotifs) ? strategy.targetMotifs : [])
  ].map((value) => safeString(value).toLowerCase()).filter(Boolean).join(" ");
}

function summarizeComponentAssetDiagnostics(componentAssetManifestFile = "") {
  const file = safeString(componentAssetManifestFile || "");
  const summary = {
    rejectedGroups: 0,
    byReason: {},
    byTargetMotif: {},
    examples: [],
    acquisitionTasks: 0,
    byAcquisitionProvider: {},
    byAcquisitionMotif: {},
    byAcquisitionKind: {},
    acquisitionExamples: []
  };
  if (!file || !fs.existsSync(file)) return summary;
  const manifest = safeReadJson(file);
  const layers = Array.isArray(manifest?.layers) ? manifest.layers : [];
  for (const layer of layers) {
    const layerKey = safeString(layer.layerKey || "");
    for (const task of Array.isArray(layer.componentAcquisitionTasks) ? layer.componentAcquisitionTasks : []) {
      summary.acquisitionTasks += 1;
      const provider = safeString(task.provider || "unknown");
      const kind = safeString(task.kind || "unknown");
      addCount(summary.byAcquisitionProvider, provider);
      addCount(summary.byAcquisitionKind, `${provider}:${kind}`);
      for (const motif of Array.isArray(task.targetMotifs) ? task.targetMotifs : []) {
        addCount(summary.byAcquisitionMotif, safeString(motif || "unknown"));
      }
      if (summary.acquisitionExamples.length < 16) {
        summary.acquisitionExamples.push({
          layerKey,
          provider,
          kind,
          keywords: safeString(task.keywords || ""),
          targetMotifs: (Array.isArray(task.targetMotifs) ? task.targetMotifs : [])
            .map(safeString)
            .filter(Boolean)
            .slice(0, 8),
          templateFamily: safeString(task.templateFamily || ""),
          reason: safeString(task.reason || "")
        });
      }
    }
    for (const asset of Array.isArray(layer.localAssets) ? layer.localAssets : []) {
      const diagnostics = asset?.componentGroupDiagnostics;
      if (!diagnostics || typeof diagnostics !== "object") continue;
      const rejected = safeNumber(diagnostics.rejectedGroups);
      summary.rejectedGroups += rejected;
      mergeCounts(summary.byReason, diagnostics.byReason);
      for (const motif of Array.isArray(diagnostics.targetMotifs) ? diagnostics.targetMotifs : []) {
        addCount(summary.byTargetMotif, safeString(motif));
      }
      for (const example of Array.isArray(diagnostics.examples) ? diagnostics.examples : []) {
        if (summary.examples.length >= 12) break;
        summary.examples.push({
          layerKey,
          assetId: safeString(asset.id || ""),
          assetName: safeString(asset.name || ""),
          groupId: safeString(example.id || ""),
          groupName: safeString(example.name || ""),
          matchScore: numberOrNull(example.matchScore),
          rejectionReasons: (Array.isArray(example.rejectionReasons) ? example.rejectionReasons : [])
            .map(safeString)
            .filter(Boolean)
            .slice(0, 8),
          structureKind: safeString(example.structureKind || ""),
          motifs: (Array.isArray(example.motifs) ? example.motifs : [])
            .map(safeString)
            .filter(Boolean)
            .slice(0, 8)
        });
      }
    }
  }
  return summary;
}

function summarizeCandidateReport(candidateFile, options = {}) {
  const report = readJson(candidateFile);
  const layers = Array.isArray(report.layers) ? report.layers : [];
  const finalIr = readFinalIrForCoverage(options.finalIrFile);
  const summary = emptyCandidateSummary();
  for (const layer of layers) {
    const mode = safeString(layer.componentRenderStrategy?.mode || layer.mode || "unknown");
    if (mode === "plugin-component-template") continue;
    const finalImage = finalIr ? finalImageForCandidateLayer(layer, finalIr) : null;
    if (finalIr && !finalImage) continue;
    const residual = summarizeResidualLayer(layer, mode, finalImage);
    summary.residualLayers += 1;
    addCount(summary.residualModeCounts, residual.mode);
    addCount(summary.residualLayerTypeCounts, residual.layerType);
    addCount(summary.residualDispositionCounts, residual.disposition);
    addCount(summary.residualPriorityCounts, residual.priority);
    if (isIntentionalPreserveLayer(residual)) {
      summary.intentionalPreserveLayers += 1;
    } else {
      summary.actionableResidualLayers += 1;
      summary.actionableResiduals.push(residual);
    }
  }
  return summary;
}

function readFinalIrForCoverage(file) {
  const value = safeString(file || "");
  if (!value || !fs.existsSync(value)) return null;
  const ir = safeReadJson(value);
  return Array.isArray(ir?.pages) ? ir : null;
}

function summarizeFinalIrMetrics(ir = null) {
  if (!ir || !Array.isArray(ir.pages)) return null;
  const metrics = {
    pages: ir.pages.length,
    images: 0,
    shapes: 0,
    textBoxes: 0,
    componentStrategyLayers: 0,
    componentStrategyModeCounts: {},
    componentTemplateAppliedImages: 0,
    componentTemplateAppliedShapes: 0,
    componentTemplateAppliedTextBoxes: 0,
    componentTemplateAppliedPictures: 0,
    componentTemplateMotifReadyImages: 0,
    componentTemplateMotifReadyShapes: 0,
    componentTemplateMotifReadyTextBoxes: 0,
    componentTemplateMotifReadyPictures: 0,
    componentTemplateWholeProcessImages: 0,
    componentTemplateWholeProcessShapes: 0,
    componentTemplateWholeProcessTextBoxes: 0,
    componentTemplateWholeProcessPictures: 0,
    componentTemplateMotifReadyTargetCounts: {},
    componentTemplateStructureFitShapes: 0,
    componentTemplateStructureFitTextBoxes: 0,
    componentTemplateStructureFitPictures: 0,
    componentTemplateStructureFitReasonCounts: {},
    componentReplacementPlanComponents: 0,
    componentReplacementPlanLayers: 0,
    componentReplacementPlanShapes: 0,
    componentReplacementPlanTextBoxes: 0,
    componentReplacementPlanElements: 0,
    componentReplacementPlanProviderCounts: {},
    componentReplacementPlanSuitabilityTierCounts: {},
    visualAtomTopologyConnectors: 0,
    visualAtomContainerNodes: 0,
    visualAtomContainedNodes: 0
  };
  const replacementComponents = new Set();
  const replacementLayers = new Set();
  const wholeProcessLayerKeys = new Set();
  for (const [pageIndex, page] of ir.pages.entries()) {
    const images = Array.isArray(page.images) ? page.images : [];
    const shapes = Array.isArray(page.shapes) ? page.shapes : [];
    const textBoxes = Array.isArray(page.textBoxes) ? page.textBoxes : [];
    metrics.images += images.length;
    metrics.shapes += shapes.length;
    metrics.textBoxes += textBoxes.length;
    for (const image of images) {
      if (image?.source?.componentTemplateGroupApplied === true) metrics.componentTemplateAppliedImages += 1;
      if (isComponentTemplateNativePicture(image)) metrics.componentTemplateAppliedPictures += 1;
      if (isMotifReadyComponentTemplateSource(image?.source)) {
        if (image?.source?.componentTemplateGroupApplied === true) metrics.componentTemplateMotifReadyImages += 1;
        if (isComponentTemplateNativePicture(image)) metrics.componentTemplateMotifReadyPictures += 1;
        addMotifReadyTargetCounts(metrics.componentTemplateMotifReadyTargetCounts, image.source);
      }
      if (isWholeProcessTemplateSource(image?.source)) {
        wholeProcessLayerKeys.add(componentTemplateLayerKey(image.source, pageIndex, "image", image.id || images.indexOf(image)));
        if (isComponentTemplateNativePicture(image)) metrics.componentTemplateWholeProcessPictures += 1;
      }
      if (isComponentTemplateNativePicture(image)) addStructureFitMetrics(metrics, image.source, "picture");
      const mode = componentStrategyModeFromFinalImage(image);
      if (!mode) continue;
      metrics.componentStrategyLayers += 1;
      addCount(metrics.componentStrategyModeCounts, mode);
    }
    for (const shape of shapes) {
      collectReplacementPlanMetric(metrics, replacementComponents, replacementLayers, shape?.source?.componentReplacementPlan, "shape");
      if (shape?.source?.componentTemplateGroupApplied === true) metrics.componentTemplateAppliedShapes += 1;
      if (shape?.source?.componentTemplateGroupApplied === true && isMotifReadyComponentTemplateSource(shape.source)) {
        metrics.componentTemplateMotifReadyShapes += 1;
        addMotifReadyTargetCounts(metrics.componentTemplateMotifReadyTargetCounts, shape.source);
      }
      if (shape?.source?.componentTemplateGroupApplied === true && isWholeProcessTemplateSource(shape.source)) {
        metrics.componentTemplateWholeProcessShapes += 1;
        wholeProcessLayerKeys.add(componentTemplateLayerKey(shape.source, pageIndex, "shape", shapes.indexOf(shape)));
      }
      if (shape?.source?.componentTemplateGroupApplied === true) addStructureFitMetrics(metrics, shape.source, "shape");
      if (isVisualAtomTopologyConnectorSource(shape.source)) metrics.visualAtomTopologyConnectors += 1;
      if (isVisualAtomContainerNodeSource(shape.source)) metrics.visualAtomContainerNodes += 1;
      if (isVisualAtomContainedNodeSource(shape.source)) metrics.visualAtomContainedNodes += 1;
      const mode = componentStrategyModeFromFinalShape(shape);
      if (!mode) continue;
      metrics.componentStrategyLayers += 1;
      addCount(metrics.componentStrategyModeCounts, mode);
    }
    for (const textBox of textBoxes) {
      collectReplacementPlanMetric(metrics, replacementComponents, replacementLayers, textBox?.source?.componentReplacementPlan, "textBox");
      if (textBox?.source?.componentTemplateGroupApplied === true) metrics.componentTemplateAppliedTextBoxes += 1;
      if (textBox?.source?.componentTemplateGroupApplied === true && isMotifReadyComponentTemplateSource(textBox.source)) {
        metrics.componentTemplateMotifReadyTextBoxes += 1;
        addMotifReadyTargetCounts(metrics.componentTemplateMotifReadyTargetCounts, textBox.source);
      }
      if (textBox?.source?.componentTemplateGroupApplied === true && isWholeProcessTemplateSource(textBox.source)) {
        metrics.componentTemplateWholeProcessTextBoxes += 1;
        wholeProcessLayerKeys.add(componentTemplateLayerKey(textBox.source, pageIndex, "textBox", textBoxes.indexOf(textBox)));
      }
      if (textBox?.source?.componentTemplateGroupApplied === true) addStructureFitMetrics(metrics, textBox.source, "textBox");
    }
  }
  metrics.componentReplacementPlanComponents = replacementComponents.size;
  metrics.componentReplacementPlanLayers = replacementLayers.size;
  metrics.componentTemplateWholeProcessImages = wholeProcessLayerKeys.size;
  return metrics;
}

function componentTemplateLayerKey(source = {}, pageIndex = 0, kind = "element", fallbackIndex = 0) {
  return safeString(
    source.layerSourceId
    || source.sourceLayerId
    || source.componentTemplateLayerSourceId
    || source.componentReplacementPlan?.layerKey
    || `${pageIndex}:${kind}:${fallbackIndex}`
  );
}

function addStructureFitMetrics(metrics, source = {}, kind = "") {
  const score = Number(source?.matchedComponentStructureFitScore);
  if (!Number.isFinite(score) || score <= 0) return;
  if (kind === "shape") metrics.componentTemplateStructureFitShapes += 1;
  else if (kind === "textBox") metrics.componentTemplateStructureFitTextBoxes += 1;
  else if (kind === "picture") metrics.componentTemplateStructureFitPictures += 1;
  for (const reason of Array.isArray(source.matchedComponentStructureFitReasons) ? source.matchedComponentStructureFitReasons : []) {
    addCount(metrics.componentTemplateStructureFitReasonCounts, safeString(reason || "unknown"));
  }
}

function collectReplacementPlanMetric(metrics, replacementComponents, replacementLayers, plan = null, elementType = "") {
  if (!plan || typeof plan !== "object") return;
  const componentId = safeString(plan.componentId || "");
  if (!componentId) return;
  const provider = safeString(plan.sourceProvider || "unknown");
  const kind = safeString(plan.componentKind || "component");
  const layerKey = safeString(plan.layerKey || "unknown-layer");
  replacementComponents.add(`${provider}:${kind}:${componentId}`);
  replacementLayers.add(layerKey);
  metrics.componentReplacementPlanElements += 1;
  if (elementType === "shape") metrics.componentReplacementPlanShapes += 1;
  if (elementType === "textBox") metrics.componentReplacementPlanTextBoxes += 1;
  addCount(metrics.componentReplacementPlanProviderCounts, provider);
  addCount(metrics.componentReplacementPlanSuitabilityTierCounts, safeString(plan.suitabilityTier || "unknown"));
}

function isVisualAtomTopologyConnectorSource(source = {}) {
  return source?.detector === "visual-atom-native-connector"
    && safeString(source.fromAtomId)
    && safeString(source.toAtomId);
}

function isVisualAtomContainerNodeSource(source = {}) {
  return /^visual-atom-native-/.test(safeString(source?.detector))
    && source?.topologyRole === "container"
    && Array.isArray(source.containedAtomIds)
    && source.containedAtomIds.length > 0;
}

function isVisualAtomContainedNodeSource(source = {}) {
  return /^visual-atom-native-/.test(safeString(source?.detector))
    && safeString(source?.containerAtomId);
}

function isComponentTemplateNativePicture(image = {}) {
  return image?.source?.detector === "plugin-component-template-native-picture"
    || image?.type === "plugin-component-picture";
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

function summarizeFinalIrNativeOpportunities(ir = null) {
  const summary = {
    nativeOpportunityLayers: 0,
    nativeOpportunityPriorityCounts: {},
    nativeOpportunityDispositionCounts: {},
    nativeOpportunities: []
  };
  if (!ir || !Array.isArray(ir.pages)) return summary;
  for (const [pageOffset, page] of ir.pages.entries()) {
    const images = Array.isArray(page.images) ? page.images : [];
    for (const [imageOffset, image] of images.entries()) {
      const opportunity = summarizeFinalIrImageOpportunity(image, {
        pageIndex: Number.isFinite(Number(page.pageIndex)) ? Number(page.pageIndex) : pageOffset,
        imageIndex: imageOffset
      });
      if (!opportunity || isIntentionalPreserveLayer(opportunity)) continue;
      summary.nativeOpportunityLayers += 1;
      addCount(summary.nativeOpportunityPriorityCounts, opportunity.priority);
      addCount(summary.nativeOpportunityDispositionCounts, opportunity.disposition);
      summary.nativeOpportunities.push(opportunity);
    }
  }
  summary.nativeOpportunities.sort((a, b) => (
    opportunityRank(a.priority) - opportunityRank(b.priority)
    || opportunityDispositionRank(a.disposition) - opportunityDispositionRank(b.disposition)
    || safeNumber(b.areaRatio) - safeNumber(a.areaRatio)
    || safeString(a.deck || "").localeCompare(safeString(b.deck || ""))
    || safeNumber(a.page) - safeNumber(b.page)
    || safeNumber(a.image) - safeNumber(b.image)
  ));
  return summary;
}

function summarizeFinalIrImageOpportunity(image = {}, { pageIndex = 0, imageIndex = 0 } = {}) {
  if (!image || typeof image !== "object") return null;
  const source = image.source || {};
  if (isComponentTemplateNativePicture(image)) return null;
  if (source.editable === true || source.nativeRebuild === false) return null;
  const box = sanitizeBox(image.box);
  const layerType = safeString(source.layerType || source.layer?.layerType || image.layerType || "unknown");
  const detector = safeString(source.detector || source.layer?.detector || image.detector || "");
  const expressionForm = safeString(source.expressionForm || source.layer?.expressionForm || image.expressionForm || "");
  const expressionSubtype = safeString(source.expressionSubtype || source.layer?.expressionSubtype || image.expressionSubtype || "");
  const recommendedAction = safeString(source.recommendedAction || source.layer?.recommendedAction || image.recommendedAction || "");
  const family = safeString(
    source.componentTemplateFamilyApplied
    || source.layer?.templateFamily
    || source.layer?.diagramUnderstanding?.componentStrategy?.templateFamily
    || source.layer?.diagramUnderstanding?.archetype
    || expressionSubtype
    || "unknown"
  );
  const areaRatio = numberOrNull(
    source.layer?.areaRatio
    ?? source.areaRatio
    ?? boxAreaRatio(box)
  );
  const mode = componentStrategyModeFromFinalImage(image) || safeString(source.strategy || "local-fidelity-crop");
  const residual = {
    page: safeNumber(pageIndex) + 1,
    image: safeNumber(imageIndex) + 1,
    layerType,
    family,
    mode,
    detector,
    expressionForm,
    expressionSubtype,
    recommendedAction,
    residualState: residualStateFromFinalImage(image),
    residualSplitRejectedReason: safeString(source.residualSplitRejected?.reason || ""),
    residualSplitRejectedTableGridReason: safeString(source.residualSplitRejected?.tableGridSplitRejected || ""),
    residualSplitRejectedTableGridComponentCount: numberOrNull(source.residualSplitRejected?.tableGridComponentCount),
    residualSplitRejectedBandReason: safeString(source.residualSplitRejected?.bandSplitRejected || ""),
    objectifiedGrid: source.objectifiedGrid || null,
    erasedPrimitiveCount: numberOrNull(source.erasedPrimitiveCount),
    areaRatio,
    box,
    candidateTitle: safeString(source.componentTemplateGroupTitle || source.layer?.candidateTitle || ""),
    candidateScore: numberOrNull(source.componentTemplateGroupScore)
  };
  residual.disposition = classifyResidualDisposition(residual);
  residual.priority = residualPriority(residual);
  return residual;
}

function componentStrategyModeFromFinalImage(image = {}) {
  const source = image?.source || {};
  if (hasNativeSemanticStructure(source)) return "native-visual-atom-rebuild";
  return safeString(
    source.componentRenderStrategy?.mode
    || source.layer?.componentRenderStrategy?.mode
    || source.componentStrategyMode
    || ""
  );
}

function componentStrategyModeFromFinalShape(shape = {}) {
  const source = shape?.source || {};
  if (source.nativeRebuild !== true) return "";
  if (source.detector === "component-template-native-shape") return "plugin-component-template";
  if (/asset-os-flow|portal-platform/.test(safeString(source.detector || ""))) return "native-specialized-rebuild";
  return "";
}

function candidateLayerStillExistsInFinalIr(layer = {}, finalIr = {}) {
  return Boolean(finalImageForCandidateLayer(layer, finalIr));
}

function finalImageForCandidateLayer(layer = {}, finalIr = {}) {
  const pageIndex = safeNumber(layer.pageIndex);
  const page = Array.isArray(finalIr.pages) ? finalIr.pages[pageIndex] : null;
  if (!page || !Array.isArray(page.images)) return null;
  const layerBox = sanitizeBox(layer.box);
  const detector = safeString(layer.detector || "");
  const layerType = safeString(layer.layerType || "");
  const directImage = page.images[safeNumber(layer.imageIndex)];
  if (finalImageMatchesCandidateLayer(directImage, { layerBox, detector, layerType })) return directImage;
  return page.images.find((image) => finalImageMatchesCandidateLayer(image, { layerBox, detector, layerType })) || null;
}

function finalImageMatchesCandidateLayer(image = {}, { layerBox = null, detector = "", layerType = "" } = {}) {
  if (!image || typeof image !== "object") return false;
  const source = image.source || {};
  const imageDetector = safeString(image.detector || source.detector || source.layer?.detector || "");
  const imageLayerType = safeString(image.layerType || source.layerType || source.layer?.layerType || "");
  if (detector && imageDetector && detector !== imageDetector) return false;
  if (layerType && imageLayerType && layerType !== imageLayerType) return false;
  if (!layerBox || !image.box) return detector ? imageDetector === detector : true;
  return boxOverlapRatio(layerBox, image.box) >= 0.55 || boxCenterInside(layerBox, image.box) || boxCenterInside(image.box, layerBox);
}

function summarizeResidualLayer(layer = {}, mode = "unknown", finalImage = null) {
  const best = Array.isArray(layer.bestCandidates) ? layer.bestCandidates[0] : null;
  const source = finalImage?.source || {};
  const sourceLayer = source.layer || {};
  const finalMode = componentStrategyModeFromFinalImage(finalImage) || mode;
  const residual = {
    page: safeNumber(layer.pageIndex) + 1,
    image: safeNumber(layer.imageIndex) + 1,
    layerType: safeString(source.layerType || sourceLayer.layerType || finalImage?.layerType || layer.layerType || "unknown"),
    family: safeString(source.componentTemplateFamilyApplied || sourceLayer.templateFamily || sourceLayer.diagramUnderstanding?.componentStrategy?.templateFamily || sourceLayer.diagramUnderstanding?.archetype || layer.templateFamily || "unknown"),
    mode: finalMode,
    detector: safeString(source.detector || sourceLayer.detector || finalImage?.detector || layer.detector || ""),
    expressionForm: safeString(source.expressionForm || sourceLayer.expressionForm || finalImage?.expressionForm || layer.expressionForm || ""),
    expressionSubtype: safeString(source.expressionSubtype || sourceLayer.expressionSubtype || finalImage?.expressionSubtype || layer.expressionSubtype || ""),
    recommendedAction: safeString(source.recommendedAction || sourceLayer.recommendedAction || finalImage?.recommendedAction || layer.recommendedAction || ""),
    areaRatio: numberOrNull(layer.areaRatio),
    box: sanitizeBox(finalImage?.box || layer.box),
    candidateTitle: safeString(source.componentTemplateGroupTitle || sourceLayer.candidateTitle || best?.title || ""),
    candidateScore: numberOrNull(source.componentTemplateGroupScore ?? best?.candidateScore)
  };
  residual.disposition = classifyResidualDisposition(residual);
  residual.priority = residualPriority(residual);
  return residual;
}

function emptyCandidateSummary() {
  return {
    residualLayers: 0,
    intentionalPreserveLayers: 0,
    actionableResidualLayers: 0,
    residualModeCounts: {},
    residualLayerTypeCounts: {},
    residualDispositionCounts: {},
    residualPriorityCounts: {},
    actionableResiduals: []
  };
}

function aggregateRows(rows = []) {
  const duplicateDecks = duplicateDeckNames(rows);
  const deckNames = uniqueDeckNames(rows);
  const totals = {
    decks: rows.length,
    uniqueDecks: deckNames.length,
    deckNames,
    duplicateDecks,
    pages: 0,
    images: 0,
    shapes: 0,
    textBoxes: 0,
    componentStrategyLayers: 0,
    componentTemplateAppliedImages: 0,
    componentTemplateAppliedShapes: 0,
    componentTemplateAppliedTextBoxes: 0,
    componentTemplateAppliedPictures: 0,
    componentTemplateMotifReadyImages: 0,
    componentTemplateMotifReadyShapes: 0,
    componentTemplateMotifReadyTextBoxes: 0,
    componentTemplateMotifReadyPictures: 0,
    componentTemplateWholeProcessImages: 0,
    componentTemplateWholeProcessShapes: 0,
    componentTemplateWholeProcessTextBoxes: 0,
    componentTemplateWholeProcessPictures: 0,
    componentTemplateMotifReadyTargetCounts: {},
    componentTemplateStructureFitShapes: 0,
    componentTemplateStructureFitTextBoxes: 0,
    componentTemplateStructureFitPictures: 0,
    componentTemplateStructureFitReasonCounts: {},
    componentReplacementPlanComponents: 0,
    componentReplacementPlanLayers: 0,
    componentReplacementPlanShapes: 0,
    componentReplacementPlanTextBoxes: 0,
    componentReplacementPlanElements: 0,
    componentReplacementPlanProviderCounts: {},
    componentReplacementPlanSuitabilityTierCounts: {},
    visualAtomTopologyConnectors: 0,
    visualAtomContainerNodes: 0,
    visualAtomContainedNodes: 0,
    componentAssetLayers: 0,
    componentAssetLayersWithLocalAssets: 0,
    componentAssetLocalMatches: 0,
    componentAssetRecommendedAssets: 0,
    componentAssetRecommendedGroups: 0,
    componentAssetHighReusableGroups: 0,
    componentAssetRejectedGroups: 0,
    componentAssetRejectionReasonCounts: {},
    componentAssetRejectionTargetMotifCounts: {},
    componentAssetRejectionExamples: [],
    componentAssetAcquisitionTasks: 0,
    componentAssetAcquisitionProviderCounts: {},
    componentAssetAcquisitionMotifCounts: {},
    componentAssetAcquisitionKindCounts: {},
    componentAssetAcquisitionExamples: [],
    missingOutputPptx: [],
    invalidOutputPptx: [],
    invalidOpenXmlPptx: [],
    residualLayers: 0,
    intentionalPreserveLayers: 0,
    actionableResidualLayers: 0,
    componentStrategyModeCounts: {},
    residualModeCounts: {},
    residualLayerTypeCounts: {},
    residualDispositionCounts: {},
    residualPriorityCounts: {},
    expressionPolicyLayers: 0,
    expressionPolicyDispositionCounts: {},
    expressionPolicyUnitDispositionCounts: {},
    expressionPolicyOutcomeCounts: {},
    expressionPolicyViolationCounts: {},
    expressionPolicyViolations: [],
    nativeOpportunityLayers: 0,
    nativeOpportunityPriorityCounts: {},
    nativeOpportunityDispositionCounts: {},
    nativeOpportunities: []
  };
  for (const row of rows) {
    for (const key of [
      "pages",
      "images",
      "shapes",
      "textBoxes",
      "componentStrategyLayers",
      "componentTemplateAppliedImages",
      "componentTemplateAppliedShapes",
      "componentTemplateAppliedTextBoxes",
      "componentTemplateAppliedPictures",
      "componentTemplateMotifReadyImages",
      "componentTemplateMotifReadyShapes",
      "componentTemplateMotifReadyTextBoxes",
      "componentTemplateMotifReadyPictures",
      "componentTemplateWholeProcessImages",
      "componentTemplateWholeProcessShapes",
      "componentTemplateWholeProcessTextBoxes",
      "componentTemplateWholeProcessPictures",
      "componentTemplateStructureFitShapes",
      "componentTemplateStructureFitTextBoxes",
      "componentTemplateStructureFitPictures",
      "componentReplacementPlanComponents",
      "componentReplacementPlanLayers",
      "componentReplacementPlanShapes",
      "componentReplacementPlanTextBoxes",
      "componentReplacementPlanElements",
      "visualAtomTopologyConnectors",
      "visualAtomContainerNodes",
      "visualAtomContainedNodes",
      "componentAssetLayers",
      "componentAssetLayersWithLocalAssets",
      "componentAssetLocalMatches",
      "componentAssetRecommendedAssets",
      "componentAssetRecommendedGroups",
      "componentAssetHighReusableGroups",
      "componentAssetRejectedGroups",
      "componentAssetAcquisitionTasks",
      "residualLayers",
      "intentionalPreserveLayers",
      "actionableResidualLayers",
      "expressionPolicyLayers",
      "nativeOpportunityLayers"
    ]) {
      totals[key] += safeNumber(row[key]);
    }
    if (row.outputPptx && row.outputPptxExists !== true) {
      totals.missingOutputPptx.push({ deck: row.deck, outputPptx: row.outputPptx });
    }
    if (row.outputPptx && row.outputPptxExists === true && row.outputPptxZipValid !== true) {
      totals.invalidOutputPptx.push({ deck: row.deck, outputPptx: row.outputPptx, bytes: row.outputPptxBytes });
    }
    if (row.outputPptx && row.outputPptxExists === true && row.outputPptxZipValid === true && row.outputPptxOpenXmlValid !== true) {
      totals.invalidOpenXmlPptx.push({
        deck: row.deck,
        outputPptx: row.outputPptx,
        missingEntries: row.outputPptxMissingEntries || []
      });
    }
    mergeCounts(totals.componentStrategyModeCounts, row.componentStrategyModeCounts);
    mergeCounts(totals.componentTemplateMotifReadyTargetCounts, row.componentTemplateMotifReadyTargetCounts);
    mergeCounts(totals.componentTemplateStructureFitReasonCounts, row.componentTemplateStructureFitReasonCounts);
    mergeCounts(totals.componentReplacementPlanProviderCounts, row.componentReplacementPlanProviderCounts);
    mergeCounts(totals.componentReplacementPlanSuitabilityTierCounts, row.componentReplacementPlanSuitabilityTierCounts);
    mergeCounts(totals.componentAssetRejectionReasonCounts, row.componentAssetRejectionReasonCounts);
    mergeCounts(totals.componentAssetRejectionTargetMotifCounts, row.componentAssetRejectionTargetMotifCounts);
    mergeCounts(totals.componentAssetAcquisitionProviderCounts, row.componentAssetAcquisitionProviderCounts);
    mergeCounts(totals.componentAssetAcquisitionMotifCounts, row.componentAssetAcquisitionMotifCounts);
    mergeCounts(totals.componentAssetAcquisitionKindCounts, row.componentAssetAcquisitionKindCounts);
    mergeCounts(totals.residualModeCounts, row.residualModeCounts);
    mergeCounts(totals.residualLayerTypeCounts, row.residualLayerTypeCounts);
    mergeCounts(totals.residualDispositionCounts, row.residualDispositionCounts);
    mergeCounts(totals.residualPriorityCounts, row.residualPriorityCounts);
    mergeCounts(totals.expressionPolicyDispositionCounts, row.expressionPolicyDispositionCounts);
    mergeCounts(totals.expressionPolicyUnitDispositionCounts, row.expressionPolicyUnitDispositionCounts);
    mergeCounts(totals.expressionPolicyOutcomeCounts, row.expressionPolicyOutcomeCounts);
    mergeCounts(totals.expressionPolicyViolationCounts, row.expressionPolicyViolationCounts);
    mergeCounts(totals.nativeOpportunityPriorityCounts, row.nativeOpportunityPriorityCounts);
    mergeCounts(totals.nativeOpportunityDispositionCounts, row.nativeOpportunityDispositionCounts);
    if (Array.isArray(row.nativeOpportunities)) {
      totals.nativeOpportunities.push(...row.nativeOpportunities.map((item) => ({
        ...item,
        deck: row.deck
      })));
    }
    if (Array.isArray(row.expressionPolicyViolations)) {
      for (const violation of row.expressionPolicyViolations) {
        if (totals.expressionPolicyViolations.length >= 30) break;
        totals.expressionPolicyViolations.push({
          ...violation,
          deck: row.deck
        });
      }
    }
    if (Array.isArray(row.componentAssetRejectionExamples)) {
      for (const example of row.componentAssetRejectionExamples) {
        if (totals.componentAssetRejectionExamples.length >= 20) break;
        totals.componentAssetRejectionExamples.push({
          ...example,
          deck: row.deck
        });
      }
    }
    if (Array.isArray(row.componentAssetAcquisitionExamples)) {
      for (const example of row.componentAssetAcquisitionExamples) {
        if (totals.componentAssetAcquisitionExamples.length >= 30) break;
        totals.componentAssetAcquisitionExamples.push({
          ...example,
          deck: row.deck
        });
      }
    }
  }
  totals.componentTemplateAppliedImageRatio = totals.componentStrategyLayers
    ? round(totals.componentTemplateAppliedImages / totals.componentStrategyLayers)
    : null;
  totals.componentTemplateMotifReadyShapeRatio = totals.componentTemplateAppliedShapes
    ? round(totals.componentTemplateMotifReadyShapes / totals.componentTemplateAppliedShapes)
    : null;
  totals.componentTemplateStructureFitShapeRatio = totals.componentTemplateAppliedShapes
    ? round(totals.componentTemplateStructureFitShapes / totals.componentTemplateAppliedShapes)
    : null;
  totals.componentTemplateMotifReadyTargetTypes = countKnownMotifTypes(totals.componentTemplateMotifReadyTargetCounts);
  totals.componentAssetLocalCoverageRatio = totals.componentAssetLayers
    ? round(totals.componentAssetLayersWithLocalAssets / totals.componentAssetLayers)
    : null;
  totals.actionableResidualRatio = totals.residualLayers
    ? round(totals.actionableResidualLayers / totals.residualLayers)
    : 0;
  totals.expressionPolicyViolationLayers = Object.values(totals.expressionPolicyViolationCounts)
    .reduce((sum, value) => sum + safeNumber(value), 0);
  totals.expressionPolicyViolationRatio = totals.expressionPolicyLayers
    ? round(totals.expressionPolicyViolationLayers / totals.expressionPolicyLayers)
    : 0;
  totals.nativeOpportunities.sort((a, b) => (
    opportunityRank(a.priority) - opportunityRank(b.priority)
    || opportunityDispositionRank(a.disposition) - opportunityDispositionRank(b.disposition)
    || safeNumber(b.areaRatio) - safeNumber(a.areaRatio)
    || safeString(a.deck || "").localeCompare(safeString(b.deck || ""))
    || safeNumber(a.page) - safeNumber(b.page)
    || safeNumber(a.image) - safeNumber(b.image)
  ));
  return totals;
}

function countKnownMotifTypes(counts = {}) {
  return Object.entries(counts || {})
    .filter(([motif, count]) => isKnownTargetMotif(motif) && safeNumber(count) > 0)
    .length;
}

function duplicateDeckNames(rows = []) {
  const counts = new Map();
  for (const row of rows) {
    const deck = safeString(row?.deck || "");
    if (!deck) continue;
    counts.set(deck, (counts.get(deck) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([deck]) => deck)
    .sort((a, b) => a.localeCompare(b));
}

function uniqueDeckNames(rows = []) {
  return [...new Set(rows.map((row) => safeString(row?.deck || "")).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function isIntentionalPreserveLayer(layer = {}) {
  return residualPriority(layer) === "keep";
}

function classifyResidualDisposition(layer = {}) {
  const text = residualText(layer);
  if (/preserve-fidelity-crop-until-subtype-rebuilder-is-confident/.test(text)) {
    return "keep-protected-mixed-visual-crop";
  }
  if (layer.residualState === "objectified-table-grid-large-residual") return "residual-split-needed-after-native-grid";
  if (layer.mode === "native-visual-atom-rebuild" || /primitive-erased|objectified-table-grid/.test(safeString(layer.residualState))) {
    return "native-rebuild-covered-with-fidelity-underlay";
  }
  if (/screenshot|product|document|\bui\b|screen/.test(text)) return "keep-screenshot-or-product-crop";
  if (/background|decorative/.test(text)) return "keep-decorative-crop";
  if (/value-banner|banner/.test(text)) return "keep-banner-crop";
  if (/kpi|evidence/.test(text)) return "keep-kpi-evidence-crop";
  if (/icon|illustration|图标|插图/.test(text)) return "keep-icon-or-illustration-crop";
  if (isTinyLocalDetail(layer)) return "keep-tiny-local-detail-crop";
  if (/chart/.test(text)) return "needs-chart-data-or-series-detection";
  if (/diagram|matrix|table|grid|hub|spoke|process|flow|chain|timeline|roadmap|fishbone|鱼骨/.test(text)) {
    return "native-rebuild-candidate";
  }
  return "manual-review-candidate";
}

function residualPriority(layer = {}) {
  const disposition = layer.disposition || classifyResidualDisposition(layer);
  if (disposition === "native-rebuild-covered-with-fidelity-underlay") return "keep";
  if (disposition === "residual-split-needed-after-native-grid") return "high";
  if (/^keep-/.test(disposition)) return "keep";
  if (disposition === "native-rebuild-candidate") return "high";
  if (disposition === "needs-chart-data-or-series-detection") return "medium";
  return "review";
}

function residualText(layer = {}) {
  return `${layer.layerType || ""} ${layer.family || ""} ${layer.detector || ""} ${layer.expressionForm || ""} ${layer.expressionSubtype || ""} ${layer.recommendedAction || ""} ${layer.candidateTitle || ""}`.toLowerCase();
}

function residualStateFromFinalImage(image = {}) {
  const source = image.source || {};
  const layerType = safeString(image.layerType || source.layerType || source.layer?.layerType || "");
  const areaRatio = numberOrNull(source.layer?.areaRatio ?? source.areaRatio ?? boxAreaRatio(sanitizeBox(image.box)));
  if (
    layerType === "table-zone"
    && source.tableGridObjectified === true
    && source.primitiveErased === true
    && Number(areaRatio || 0) >= 0.18
  ) {
    return "objectified-table-grid-large-residual";
  }
  if (source.tableGridObjectified === true && source.primitiveErased === true) return "objectified-table-grid-residual";
  if (source.primitiveErased === true) return "primitive-erased-residual";
  return "";
}

function isTinyLocalDetail(layer = {}) {
  const areaRatio = Number(layer.areaRatio);
  if (Number.isFinite(areaRatio) && areaRatio > 0 && areaRatio < 0.025) return true;
  const box = layer.box || {};
  const width = Number(box.w);
  const height = Number(box.h);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 && width * height < 9000;
}

function resolveLatestReports(root = "runs") {
  const files = findFiles(path.resolve(root), "component-strategy-rebuild-report.json");
  const latestByDeck = new Map();
  for (const file of files) {
    const report = safeReadJson(file);
    for (const result of Array.isArray(report?.results) ? report.results : []) {
      const deck = deckNameFromResult(result);
      const mtimeMs = fs.statSync(file).mtimeMs;
      const old = latestByDeck.get(deck);
      if (!old || mtimeMs > old.mtimeMs) latestByDeck.set(deck, { file, mtimeMs });
    }
  }
  return [...new Set([...latestByDeck.values()].map((entry) => entry.file))].sort((a, b) => a.localeCompare(b));
}

function findFiles(root, fileName, limit = 5000) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length > 0 && out.length < limit) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === fileName) out.push(full);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function deckNameFromResult(result = {}) {
  const workDir = safeString(result.inputWorkDir || "");
  if (workDir) return path.basename(workDir).replace(/\.work$/i, "");
  const pptx = safeString(result.outputPptx || "");
  return pptx ? path.basename(pptx, path.extname(pptx)).replace(/\.native-editable$/i, "") : "unknown";
}

function outputExists(file) {
  const value = safeString(file || "");
  return value ? fs.existsSync(value) : false;
}

function outputSize(file) {
  const value = safeString(file || "");
  if (!value || !fs.existsSync(value)) return 0;
  try {
    return fs.statSync(value).size;
  } catch {
    return 0;
  }
}

function outputZipValid(file) {
  const value = safeString(file || "");
  if (!value || !fs.existsSync(value)) return false;
  try {
    const fd = fs.openSync(value, "r");
    try {
      const buffer = Buffer.alloc(4);
      const bytesRead = fs.readSync(fd, buffer, 0, 4, 0);
      if (bytesRead < 4) return false;
      return buffer[0] === 0x50 && buffer[1] === 0x4b
        && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
        && (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

function outputPptxOpenXmlValid(file) {
  return outputPptxMissingEntries(file).length === 0;
}

function outputPptxMissingEntries(file) {
  const requiredEntries = ["[Content_Types].xml", "ppt/presentation.xml"];
  const entries = listZipEntries(file);
  if (entries === null) return requiredEntries;
  const entrySet = new Set(entries);
  return requiredEntries.filter((entry) => !entrySet.has(entry));
}

function listZipEntries(file) {
  const value = safeString(file || "");
  if (!value || !fs.existsSync(value) || !outputZipValid(value)) return null;
  let buffer;
  try {
    buffer = fs.readFileSync(value);
  } catch {
    return null;
  }
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0 || eocdOffset + 22 > buffer.length) return null;
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (centralDirectoryOffset < 0 || centralDirectorySize < 0 || centralDirectoryOffset + centralDirectorySize > buffer.length) return null;
  const entries = [];
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;
  while (offset + 46 <= end) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) return null;
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) return null;
    entries.push(buffer.toString("utf8", nameStart, nameEnd).replace(/\\/g, "/"));
    offset = nameEnd + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function safeReadJson(file) {
  try {
    return readJson(file);
  } catch {
    return null;
  }
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

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sanitizeBox(box = {}) {
  if (!box || typeof box !== "object") return null;
  return {
    x: numberOrNull(box.x),
    y: numberOrNull(box.y),
    w: numberOrNull(box.w),
    h: numberOrNull(box.h)
  };
}

function boxOverlapRatio(a = {}, b = {}) {
  const ax = Number(a.x);
  const ay = Number(a.y);
  const aw = Number(a.w);
  const ah = Number(a.h);
  const bx = Number(b.x);
  const by = Number(b.y);
  const bw = Number(b.w);
  const bh = Number(b.h);
  if (![ax, ay, aw, ah, bx, by, bw, bh].every(Number.isFinite) || aw <= 0 || ah <= 0 || bw <= 0 || bh <= 0) return 0;
  const left = Math.max(ax, bx);
  const top = Math.max(ay, by);
  const right = Math.min(ax + aw, bx + bw);
  const bottom = Math.min(ay + ah, by + bh);
  const overlap = Math.max(0, right - left) * Math.max(0, bottom - top);
  if (overlap <= 0) return 0;
  return overlap / Math.min(aw * ah, bw * bh);
}

function boxCenterInside(inner = {}, outer = {}) {
  const ix = Number(inner.x);
  const iy = Number(inner.y);
  const iw = Number(inner.w);
  const ih = Number(inner.h);
  const ox = Number(outer.x);
  const oy = Number(outer.y);
  const ow = Number(outer.w);
  const oh = Number(outer.h);
  if (![ix, iy, iw, ih, ox, oy, ow, oh].every(Number.isFinite) || iw <= 0 || ih <= 0 || ow <= 0 || oh <= 0) return false;
  const cx = ix + iw / 2;
  const cy = iy + ih / 2;
  return cx >= ox && cx <= ox + ow && cy >= oy && cy <= oy + oh;
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function boxAreaRatio(box = null) {
  if (!box) return null;
  const area = Number(box.w) * Number(box.h);
  return Number.isFinite(area) && area > 0 ? area / (960 * 540) : null;
}

function opportunityRank(priority = "") {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  if (priority === "review") return 2;
  return 3;
}

function opportunityDispositionRank(disposition = "") {
  if (disposition === "residual-split-needed-after-native-grid") return 0;
  if (disposition === "native-rebuild-candidate") return 1;
  if (disposition === "needs-chart-data-or-series-detection") return 2;
  return 3;
}

module.exports = {
  aggregateRows,
  buildComponentCoverageMatrix,
  classifyResidualDisposition,
  isIntentionalPreserveLayer,
  residualPriority,
  resolveLatestReports,
  summarizeCandidateReport,
  summarizeComponentRebuildReport,
  summarizeExpressionPolicyReport,
  summarizeFinalIrNativeOpportunities,
  _private: {
    deckNameFromResult,
    boxOverlapRatio,
    boxCenterInside,
    candidateLayerStillExistsInFinalIr,
    duplicateDeckNames,
    finalImageMatchesCandidateLayer,
    findFiles,
    isTinyLocalDetail,
    outputExists,
    outputPptxMissingEntries,
    outputPptxOpenXmlValid,
    outputSize,
    outputZipValid,
    listZipEntries,
    summarizeFinalIrImageOpportunity,
    residualText,
    residualStateFromFinalImage,
    opportunityDispositionRank,
    classifyExpressionPolicyDisposition,
    classifyExpressionPolicyOutcome,
    expressionPolicyViolation,
    isStandaloneExpressionPolicyAsset,
    summarizeExpressionPolicyLayer,
    summarizeResidualLayer,
    uniqueDeckNames
  }
};
