"use strict";

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = { reports: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--report") {
      args.reports.push(argv[++index]);
    } else if (item === "--reports") {
      const value = argv[++index] || "";
      args.reports.push(...value.split(/[;,]/).map((part) => part.trim()).filter(Boolean));
    } else if (item.startsWith("--")) {
      const key = item.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        index += 1;
      }
    }
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function resolveReportFiles(args) {
  if (args.reports.length > 0) {
    return args.reports.map((file) => path.resolve(file));
  }
  const root = path.resolve(args.root || path.join("runs", "quality-gate"));
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, "quality-gate-report.json"))
    .filter((file) => fs.existsSync(file))
    .sort((a, b) => a.localeCompare(b));
}

function deckNameFromReport(file, report) {
  const pptx = report?.pptxFile || report?.inputPptx || report?.targetPptx;
  if (pptx) return normalizeDeckName(path.basename(pptx, path.extname(pptx)));
  return normalizeDeckName(path.basename(path.dirname(file)).replace(/-(?:baseline|kpi-crop|entropy-crop|wms-route-label).*$/i, ""));
}

function normalizeDeckName(name) {
  return String(name || "").replace(/\.(?:native-editable|editable)$/i, "");
}

function summarizeReport(file) {
  const report = readJson(file);
  const summary = report.summary || {};
  const metrics = report.deckMetrics || {};
  const profile = report.editabilityProfile || {};
  const componentStrategyProfile = report.componentStrategyProfile || {};
  const componentTemplateCropStatus = report.componentTemplateCropStatus || {};
  const visualUnitDecisionProfile = report.visualUnitDecisionProfile || {};
  const qualityGate = report.gate || {};
  const reconstructionBudget = report.reconstructionBudget || {};
  const protectedNonSemanticSkips = protectedNonSemanticSkipCount(report);
  const layerTotals = report.layerProfile?.totals || {};
  const pages = report.pages || [];
  const rejected = Number(summary.rejected || 0);
  const disallowedFullPageImages = Number(profile.disallowedFullPageImages || 0);
  const rejectedPages = pages.filter((page) => page.status === "rejected").map((page) => page.pageIndex + 1);
  const reviewPages = pages.filter((page) => page.status === "needs-review").map((page) => page.pageIndex + 1);
  const textCoverage = numberOrNull(metrics.textCoverage);
  const textCoveragePages = pages.filter((page) => numberOrNull(page.textCoverage) !== null).length;
  const textOcrFailedBoxes = pages.reduce((sum, page) => {
    const value = Number(page.textOcrFailedBoxes || 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const worstTextOcrBoxes = collectWorstTextOcrBoxes(report);
  const comparedPages = Number.isFinite(Number(metrics.comparedPages)) ? Number(metrics.comparedPages) : null;
  const pageCount = Number(summary.pages || comparedPages || pages.length || 0);
  const detectorCounts = profile.detectorCounts || {};
  const imageExpressionCounts = profile.imageExpressionCounts || {};
  const imageSubtypeCounts = profile.imageSubtypeCounts || {};
  const imageRecommendationCounts = profile.imageRecommendationCounts || {};
  const textOverlayRiskSubtypeCounts = profile.textOverlayRiskSubtypeCounts || {};
  const textOverlayRiskRecommendationCounts = profile.textOverlayRiskRecommendationCounts || {};
  const nativeOverlayRiskSubtypeCounts = profile.nativeOverlayRiskSubtypeCounts || {};
  const nativeOverlayRiskDetectorCounts = profile.nativeOverlayRiskDetectorCounts || {};
  const intentionalRasterDetectorCounts = profile.intentionalRasterDetectorCounts
    || filterDetectorCounts(detectorCounts, isIntentionalRasterDetector);
  const intentionalRasterImages = Number.isFinite(Number(profile.intentionalRasterImages))
    ? Number(profile.intentionalRasterImages)
    : sumDetectorCounts(intentionalRasterDetectorCounts);
  const actionableRasterDetectorCounts = profile.actionableRasterDetectorCounts
    || filterDetectorCounts(detectorCounts, (detector) => !isIntentionalRasterDetector(detector));
  const nonEditableImages = Number(profile.nonEditableImages || 0);
  const actionableNonEditableImages = Number.isFinite(Number(profile.actionableNonEditableImages))
    ? Number(profile.actionableNonEditableImages)
    : Math.max(0, nonEditableImages - intentionalRasterImages);
  const editableObjectRatio = numberOrNull(profile.editableObjectRatio);
  const actionableEditableObjectRatio = numberOrNull(profile.actionableEditableObjectRatio)
    ?? inferActionableEditableRatio(profile, actionableNonEditableImages);
  const largestUnexplainedCropAreaRatio = numberOrNull(layerTotals.largestUnexplainedCropAreaRatio);
  const deck = deckNameFromReport(file, report);
  const fallbackPassed = report.passed === true || summary.passed === true || (rejected === 0 && disallowedFullPageImages === 0);
  const passed = typeof qualityGate.passed === "boolean" ? qualityGate.passed : fallbackPassed;
  return {
    deck,
    reportFile: file,
    passed,
    qualityGatePassed: typeof qualityGate.passed === "boolean" ? qualityGate.passed : null,
    qualityGateFailures: (Array.isArray(qualityGate.failures) ? qualityGate.failures : [])
      .map((item) => safeMatrixText(item))
      .filter(Boolean)
      .slice(0, 32),
    reconstructionBudgetPassed: typeof reconstructionBudget.passed === "boolean" ? reconstructionBudget.passed : null,
    reconstructionBudgetFailedPages: normalizeNonNegativeNumber(reconstructionBudget.failedPageCount),
    reconstructionBudgetMaxResidualAreaRatio: numberOrNull(reconstructionBudget.maxResidualAreaRatio),
    reconstructionBudgetMaxLargestResidualAreaRatio: numberOrNull(reconstructionBudget.maxLargestResidualAreaRatio),
    pages: pageCount,
    comparedPages,
    accepted: Number(summary.accepted || 0),
    needsReview: Number(summary.needsReview || 0),
    rejected,
    rejectedPages,
    reviewPages,
    pixelDiffRatio: numberOrNull(metrics.pixelDiffRatio),
    foregroundMissingRatio: numberOrNull(metrics.foregroundMissingRatio),
    textCoverage,
    textCoveragePages,
    missingTextCoveragePages: Math.max(0, pageCount - textCoveragePages),
    textCoveragePageRatio: pageCount ? round(textCoveragePages / pageCount) : null,
    textOcrFailedBoxes,
    worstTextOcrBoxes,
    layoutMeanIoU: numberOrNull(metrics.layoutMeanIoU),
    editableObjectRatio,
    actionableEditableObjectRatio,
    nonEditableImages,
    intentionalRasterImages,
    actionableNonEditableImages,
    fullPageImages: Number(profile.fullPageImages || 0),
    disallowedFullPageImages,
    maxRasterImageAreaRatio: numberOrNull(profile.maxRasterImageAreaRatio),
    detectorCounts,
    imageExpressionCounts,
    imageSubtypeCounts,
    imageRecommendationCounts,
    textOverlayRiskBoxes: Number(profile.textOverlayRiskBoxes || 0),
    textOverlayRiskImages: Number(profile.textOverlayRiskImages || 0),
    pagesWithTextOverlayRisk: Number(profile.pagesWithTextOverlayRisk || 0),
    textOverlayRiskSubtypeCounts,
    textOverlayRiskRecommendationCounts,
    nativeOverlayRiskShapes: Number(profile.nativeOverlayRiskShapes || 0),
    nativeOverlayRiskImages: Number(profile.nativeOverlayRiskImages || 0),
    pagesWithNativeOverlayRisk: Number(profile.pagesWithNativeOverlayRisk || 0),
    nativeOverlayRiskSubtypeCounts,
    nativeOverlayRiskDetectorCounts,
    intentionalRasterDetectorCounts,
    actionableRasterDetectorCounts,
    largestUnexplainedCropAreaRatio,
    largeVisualLayers: Number(layerTotals.largeVisualLayers || 0),
    nativeLayerCandidates: Number(layerTotals.nativeCandidates || 0),
    residualLayerCandidates: Number(layerTotals.residualCandidates || 0),
    visualUnitNativeStructureCandidates: Number(visualUnitDecisionProfile.nativeStructureCandidates || 0),
    visualUnitIntentionalMinimumUnitCrops: Number(visualUnitDecisionProfile.intentionalMinimumUnitCrops || 0),
    visualUnitActionableUnexplainedCrops: Number(visualUnitDecisionProfile.actionableUnexplainedCrops || 0),
    visualUnitDecisionCounts: visualUnitDecisionProfile.byDecision || {},
    visualUnitReasonCounts: visualUnitDecisionProfile.byReason || {},
    visualUnitExpressionCounts: visualUnitDecisionProfile.byExpression || {},
    visualUnitLayerTypeCounts: visualUnitDecisionProfile.byLayerType || {},
    visualUnitDispositionCounts: visualUnitDecisionProfile.byUnitDisposition || {},
    visualUnitRepairCandidates: normalizeVisualUnitRepairCandidates(
      visualUnitDecisionProfile.examplesByDecision?.["actionable-unexplained-crop"],
      { deck, reportFile: file }
    ),
    layerTypeCounts: layerTotals.layerTypeCounts || {},
    recommendedLayerActionCounts: layerTotals.recommendedActionCounts || {},
    componentStrategyImages: Number(componentStrategyProfile.componentStrategyImages || 0),
    pluginReferencedImages: Number(componentStrategyProfile.pluginReferencedImages || 0),
    pluginComponentTemplateImages: Number(componentStrategyProfile.pluginComponentTemplateImages || 0),
    preserveCropWithComponentReferenceImages: Number(componentStrategyProfile.preserveCropWithComponentReferenceImages || 0),
    nativeRebuildWithComponentStyleGuideImages: Number(componentStrategyProfile.nativeRebuildWithComponentStyleGuideImages || 0),
    nativeVisualAtomRebuildImages: Number(componentStrategyProfile.nativeVisualAtomRebuildImages || 0),
    preserveLocalCropImages: Number(componentStrategyProfile.preserveLocalCropImages || 0),
    componentTemplateRejectedByLayerEligibilityImages: Number(componentStrategyProfile.componentTemplateRejectedByLayerEligibilityImages || 0),
    componentStrategyDownloadRequiredImages: Number(componentStrategyProfile.downloadRequiredImages || 0),
    componentStrategyFidelityPreservedImages: Number(componentStrategyProfile.fidelityPreservedImages || 0),
    componentLocalAssetImages: Number(componentStrategyProfile.componentLocalAssetImages || 0),
    componentLocalAssetMatches: Number(componentStrategyProfile.componentLocalAssetMatches || 0),
    componentRecommendedGroupImages: Number(componentStrategyProfile.componentRecommendedGroupImages || 0),
    componentRecommendedGroupMatches: Number(componentStrategyProfile.componentRecommendedGroupMatches || 0),
    componentHighReusableGroupMatches: Number(componentStrategyProfile.componentHighReusableGroupMatches || 0),
    componentTemplateAppliedImages: Number(componentStrategyProfile.componentTemplateAppliedImages || 0),
    componentTemplateAppliedShapes: Number(componentStrategyProfile.componentTemplateAppliedShapes || 0),
    componentTemplateAppliedTextBoxes: Number(componentStrategyProfile.componentTemplateAppliedTextBoxes || 0),
    componentTemplateAppliedPictures: Number(componentStrategyProfile.componentTemplateAppliedPictures || 0),
    componentTemplateMotifReadyImages: Number(componentStrategyProfile.componentTemplateMotifReadyImages || 0),
    componentTemplateMotifReadyShapes: Number(componentStrategyProfile.componentTemplateMotifReadyShapes || 0),
    componentTemplateMotifReadyTextBoxes: Number(componentStrategyProfile.componentTemplateMotifReadyTextBoxes || 0),
    componentTemplateMotifReadyPictures: Number(componentStrategyProfile.componentTemplateMotifReadyPictures || 0),
    componentTemplateWholeProcessImages: Number(componentStrategyProfile.componentTemplateWholeProcessImages || 0),
    componentTemplateWholeProcessShapes: Number(componentStrategyProfile.componentTemplateWholeProcessShapes || 0),
    componentTemplateWholeProcessTextBoxes: Number(componentStrategyProfile.componentTemplateWholeProcessTextBoxes || 0),
    componentTemplateWholeProcessPictures: Number(componentStrategyProfile.componentTemplateWholeProcessPictures || 0),
    componentTemplateNativeShapes: Number(componentStrategyProfile.componentTemplateNativeShapes || 0),
    componentTemplateCropReplacedImages: Number(componentStrategyProfile.componentTemplateCropReplacedImages || 0),
    componentTemplateCropSplitImages: Number(componentStrategyProfile.componentTemplateCropSplitImages || 0),
    componentTemplatePictureResidualImages: Number(componentStrategyProfile.componentTemplatePictureResidualImages || 0),
    componentTemplateCropPreservedImages: Number(componentStrategyProfile.componentTemplateCropPreservedImages || 0),
    componentTemplateCropStatusImages: Number(componentTemplateCropStatus.templateImages || 0),
    componentTemplateCropStatusReplacedImages: Number(componentTemplateCropStatus.replacedImages || 0),
    componentTemplateCropStatusRetainedImages: Number(componentTemplateCropStatus.retainedImages || 0),
    componentTemplateCropStatusProtectedRetainedImages: Number(componentTemplateCropStatus.protectedRetainedImages || 0),
    componentTemplateCropStatusActionableRetainedImages: Number(componentTemplateCropStatus.actionableRetainedImages || 0),
    componentTemplateCropStatusSplitImages: Number(componentTemplateCropStatus.splitImages || 0),
    componentTemplateCropStatusNativeShapesReplacingCrops: Number(componentTemplateCropStatus.nativeShapesReplacingCrops || 0),
    componentTemplateCropStatusReplacementRate: numberOrNull(componentTemplateCropStatus.replacementRate),
    componentTemplateCropStatusByReason: componentTemplateCropStatus.byReason || {},
    componentTemplateCropStatusByDetector: componentTemplateCropStatus.byDetector || {},
    componentTemplateCropStatusProtectedByReason: componentTemplateCropStatus.protectedByReason || {},
    componentTemplateCropStatusActionableByReason: componentTemplateCropStatus.actionableByReason || {},
    componentTemplateCropStatusTopActionableReasons: componentTemplateCropStatus.topActionableReasons || [],
    protectedNonSemanticSkips,
    componentTemplateRepairCandidates: normalizeComponentTemplateRepairCandidates(componentTemplateCropStatus.repairCandidates, {
      deck,
      reportFile: file
    }),
    visualAtomTopologyConnectors: Number(componentStrategyProfile.visualAtomTopologyConnectors || 0),
    visualAtomContainerNodes: Number(componentStrategyProfile.visualAtomContainerNodes || 0),
    visualAtomContainedNodes: Number(componentStrategyProfile.visualAtomContainedNodes || 0),
    componentStrategyModeCounts: componentStrategyProfile.modeCounts || {},
    componentStrategyImplementationModeCounts: componentStrategyProfile.implementationModeCounts || {},
    componentStrategySourceProviderCounts: componentStrategyProfile.sourceProviderCounts || {},
    componentStrategyKindCounts: componentStrategyProfile.componentKindCounts || {},
    componentStrategyExpectationCounts: componentStrategyProfile.expectationCounts || {},
    componentStrategyApplicationStepCounts: componentStrategyProfile.applicationStepCounts || {},
    componentAssetProviderCounts: componentStrategyProfile.componentAssetProviderCounts || {},
    componentRecommendedGroupCounts: componentStrategyProfile.componentRecommendedGroupCounts || {},
    componentReuseReadinessCounts: componentStrategyProfile.componentReuseReadinessCounts || {},
    componentTemplateFamilyCounts: componentStrategyProfile.componentTemplateFamilyCounts || {},
    componentTemplateGroupCounts: componentStrategyProfile.componentTemplateGroupCounts || {},
    componentTemplateMotifReadyFamilyCounts: componentStrategyProfile.componentTemplateMotifReadyFamilyCounts || {},
    componentTemplateMotifReadyGroupCounts: componentStrategyProfile.componentTemplateMotifReadyGroupCounts || {},
    componentTemplateMotifReadyTargetCounts: componentStrategyProfile.componentTemplateMotifReadyTargetCounts || {},
    componentTemplateShapePartCounts: componentStrategyProfile.componentTemplateShapePartCounts || {},
    componentTemplateStructureFitShapes: Number(componentStrategyProfile.componentTemplateStructureFitShapes || 0),
    componentTemplateStructureFitTextBoxes: Number(componentStrategyProfile.componentTemplateStructureFitTextBoxes || 0),
    componentTemplateStructureFitPictures: Number(componentStrategyProfile.componentTemplateStructureFitPictures || 0),
    componentTemplateStructureFitReasonCounts: componentStrategyProfile.componentTemplateStructureFitReasonCounts || {},
    componentTemplateNativeRoleCounts: componentStrategyProfile.componentTemplateNativeRoleCounts || {},
    componentTemplateStructureRoleCounts: componentStrategyProfile.componentTemplateStructureRoleCounts || {},
    componentTemplateCropPreservedReasonCounts: componentStrategyProfile.componentTemplateCropPreservedReasonCounts || {}
  };
}

function filterDetectorCounts(counts = {}, predicate) {
  return Object.fromEntries(Object.entries(counts || {}).filter(([detector]) => predicate(detector)));
}

function sumDetectorCounts(counts = {}) {
  return Object.values(counts || {}).reduce((sum, value) => {
    const number = Number(value || 0);
    return sum + (Number.isFinite(number) ? number : 0);
  }, 0);
}

function inferActionableEditableRatio(profile = {}, actionableNonEditableImages = 0) {
  const editableObjects = Number(profile.editableObjects);
  if (!Number.isFinite(editableObjects)) return null;
  const total = editableObjects + actionableNonEditableImages;
  return total > 0 ? round(editableObjects / total) : 1;
}

function normalizeComponentTemplateRepairCandidates(candidates = [], context = {}) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => ({
      deck: safeMatrixText(context.deck || candidate?.deck || "unknown-deck"),
      reportFile: safeMatrixText(context.reportFile || candidate?.reportFile || ""),
      pageIndex: normalizeNonNegativeNumber(candidate?.pageIndex),
      imageId: safeMatrixText(candidate?.imageId || "unknown-image"),
      priority: normalizeNonNegativeNumber(candidate?.priority),
      detector: safeMatrixText(candidate?.detector || "unknown-detector"),
      reason: safeMatrixText(candidate?.reason || "unknown-reason"),
      expressionForm: safeMatrixText(candidate?.expressionForm || "unknown-expression"),
      expressionSubtype: safeMatrixText(candidate?.expressionSubtype || "unknown-subtype"),
      layerType: safeMatrixText(candidate?.layerType || "unknown-layer"),
      recommendedAction: safeMatrixText(candidate?.recommendedAction || "manual-component-rebuild-review"),
      family: safeMatrixText(candidate?.family || "unknown-family"),
      componentId: safeMatrixText(candidate?.componentId || "unknown-component"),
      componentTitle: safeMatrixText(candidate?.componentTitle || "unknown-title"),
      sourceProvider: safeMatrixText(candidate?.sourceProvider || "unknown-provider"),
      targetMotifs: (Array.isArray(candidate?.targetMotifs) ? candidate.targetMotifs : [])
        .map((item) => safeMatrixText(item))
        .filter(Boolean)
        .slice(0, 12),
      box: normalizeMatrixBox(candidate?.box),
      areaRatio: numberOrNull(candidate?.areaRatio)
    }))
    .filter((candidate) => candidate.priority > 0 || candidate.areaRatio !== null);
}

function normalizeVisualUnitRepairCandidates(candidates = [], context = {}) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => {
      const areaRatio = numberOrNull(candidate?.areaRatio);
      return {
        deck: safeMatrixText(context.deck || candidate?.deck || "unknown-deck"),
        reportFile: safeMatrixText(context.reportFile || candidate?.reportFile || ""),
        pageIndex: normalizeNonNegativeNumber(candidate?.pageIndex),
        imageId: safeMatrixText(candidate?.id || candidate?.imageId || "unknown-image"),
        priority: normalizeNonNegativeNumber(candidate?.priority ?? ((areaRatio || 0) * 1000)),
        detector: safeMatrixText(candidate?.detector || "unknown-detector"),
        reason: safeMatrixText(candidate?.reason || "actionable-unexplained-crop"),
        expressionForm: safeMatrixText(candidate?.expressionForm || "unknown-expression"),
        expressionSubtype: safeMatrixText(candidate?.expressionSubtype || "unknown-subtype"),
        layerType: safeMatrixText(candidate?.layerType || "unknown-layer"),
        recommendedAction: safeMatrixText(candidate?.recommendedAction || "manual-review-before-native-rebuild"),
        areaRatio
      };
    })
    .filter((candidate) => candidate.priority > 0 || candidate.areaRatio !== null);
}

function protectedNonSemanticSkipCount(report = {}) {
  const candidates = [
    report.protectedNonSemanticSkips,
    report.summary?.protectedNonSemanticSkips,
    report.pluginActionQueue?.summary?.protectedNonSemanticSkips,
    report.componentPluginActionQueue?.summary?.protectedNonSemanticSkips,
    report.pluginComponentActionQueue?.summary?.protectedNonSemanticSkips,
    report.repairCoverageActionQueue?.summary?.protectedNonSemanticSkips,
    report.targetAuditActionQueue?.summary?.protectedNonSemanticSkips
  ];
  return candidates.reduce((sum, value) => {
    const number = Number(value || 0);
    return sum + (Number.isFinite(number) && number > 0 ? number : 0);
  }, 0);
}

function safeMatrixText(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180);
}

function normalizeNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? round(number) : 0;
}

function normalizeMatrixBox(box = {}) {
  const x = numberOrNull(box?.x);
  const y = numberOrNull(box?.y);
  const w = numberOrNull(box?.w);
  const h = numberOrNull(box?.h);
  return [x, y, w, h].every((value) => value !== null) ? { x, y, w, h } : null;
}

function isIntentionalRasterDetector(detector) {
  const value = String(detector || "");
  if (/component-template-picture-residual/i.test(value)) return true;
  return /(?:graphic|diagram|underlay|crop|aggregate|screenshot|illustration|foreground|structured-case|mixed-diagram|sparse-diagram|decorative-cover-background)/i.test(value);
}

function collectWorstTextOcrBoxes(report, limit = 8) {
  const pages = report?.compare?.textCoverage?.pages || [];
  const boxes = [];
  for (const page of pages) {
    for (const box of page.boxes || []) {
      const coverage = numberOrNull(box.textCoverage);
      const isWeak = box.ok === false || (coverage !== null && coverage < 0.9);
      if (!isWeak) continue;
      boxes.push({
        page: Number(page.pageIndex) + 1,
        textCoverage: coverage,
        expectedText: truncateText(box.expectedText),
        renderedOcrText: truncateText(box.renderedOcrText),
        expectedCharCount: numberOrNull(box.expectedCharCount),
        matchedCharCount: numberOrNull(box.matchedCharCount)
      });
    }
  }
  return boxes
    .sort((a, b) => coverageSortValue(a.textCoverage) - coverageSortValue(b.textCoverage)
      || (b.expectedCharCount || 0) - (a.expectedCharCount || 0)
      || a.page - b.page)
    .slice(0, limit);
}

function coverageSortValue(value) {
  return value === null ? -1 : value;
}

function truncateText(value, maxLength = 80) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function aggregateMatrix(rows, options = {}) {
  const totals = rows.reduce((acc, row) => {
    acc.decks += 1;
    acc.pages += row.pages;
    acc.accepted += row.accepted;
    acc.needsReview += row.needsReview;
    acc.rejected += row.rejected;
    acc.nonEditableImages += row.nonEditableImages;
    acc.intentionalRasterImages += row.intentionalRasterImages || 0;
    acc.actionableNonEditableImages += row.actionableNonEditableImages || 0;
    acc.fullPageImages += row.fullPageImages;
    acc.textOverlayRiskBoxes += row.textOverlayRiskBoxes || 0;
    acc.textOverlayRiskImages += row.textOverlayRiskImages || 0;
    acc.pagesWithTextOverlayRisk += row.pagesWithTextOverlayRisk || 0;
    acc.nativeOverlayRiskShapes += row.nativeOverlayRiskShapes || 0;
    acc.nativeOverlayRiskImages += row.nativeOverlayRiskImages || 0;
    acc.pagesWithNativeOverlayRisk += row.pagesWithNativeOverlayRisk || 0;
    acc.largeVisualLayers += row.largeVisualLayers || 0;
    acc.nativeLayerCandidates += row.nativeLayerCandidates || 0;
    acc.residualLayerCandidates += row.residualLayerCandidates || 0;
    acc.visualUnitNativeStructureCandidates += row.visualUnitNativeStructureCandidates || 0;
    acc.visualUnitIntentionalMinimumUnitCrops += row.visualUnitIntentionalMinimumUnitCrops || 0;
    acc.visualUnitActionableUnexplainedCrops += row.visualUnitActionableUnexplainedCrops || 0;
    acc.qualityGateFailedDecks += row.qualityGatePassed === false ? 1 : 0;
    acc.reconstructionBudgetFailedDecks += row.reconstructionBudgetPassed === false ? 1 : 0;
    acc.reconstructionBudgetFailedPages += row.reconstructionBudgetFailedPages || 0;
    if (Number.isFinite(row.reconstructionBudgetMaxResidualAreaRatio)) {
      acc.reconstructionBudgetMaxResidualAreaRatio = Math.max(acc.reconstructionBudgetMaxResidualAreaRatio, row.reconstructionBudgetMaxResidualAreaRatio);
    }
    if (Number.isFinite(row.reconstructionBudgetMaxLargestResidualAreaRatio)) {
      acc.reconstructionBudgetMaxLargestResidualAreaRatio = Math.max(
        acc.reconstructionBudgetMaxLargestResidualAreaRatio,
        row.reconstructionBudgetMaxLargestResidualAreaRatio
      );
    }
    for (const failure of row.qualityGateFailures || []) acc.qualityGateFailureCounts[failure] = (acc.qualityGateFailureCounts[failure] || 0) + 1;
    acc.componentStrategyImages += row.componentStrategyImages || 0;
    acc.pluginReferencedImages += row.pluginReferencedImages || 0;
    acc.pluginComponentTemplateImages += row.pluginComponentTemplateImages || 0;
    acc.preserveCropWithComponentReferenceImages += row.preserveCropWithComponentReferenceImages || 0;
    acc.nativeRebuildWithComponentStyleGuideImages += row.nativeRebuildWithComponentStyleGuideImages || 0;
    acc.nativeVisualAtomRebuildImages += row.nativeVisualAtomRebuildImages || 0;
    acc.preserveLocalCropImages += row.preserveLocalCropImages || 0;
    acc.componentTemplateRejectedByLayerEligibilityImages += row.componentTemplateRejectedByLayerEligibilityImages || 0;
    acc.componentStrategyDownloadRequiredImages += row.componentStrategyDownloadRequiredImages || 0;
    acc.componentStrategyFidelityPreservedImages += row.componentStrategyFidelityPreservedImages || 0;
    acc.componentLocalAssetImages += row.componentLocalAssetImages || 0;
    acc.componentLocalAssetMatches += row.componentLocalAssetMatches || 0;
    acc.componentRecommendedGroupImages += row.componentRecommendedGroupImages || 0;
    acc.componentRecommendedGroupMatches += row.componentRecommendedGroupMatches || 0;
    acc.componentHighReusableGroupMatches += row.componentHighReusableGroupMatches || 0;
    acc.componentTemplateAppliedImages += row.componentTemplateAppliedImages || 0;
    acc.componentTemplateAppliedShapes += row.componentTemplateAppliedShapes || 0;
    acc.componentTemplateAppliedTextBoxes += row.componentTemplateAppliedTextBoxes || 0;
    acc.componentTemplateAppliedPictures += row.componentTemplateAppliedPictures || 0;
    acc.componentTemplateMotifReadyImages += row.componentTemplateMotifReadyImages || 0;
    acc.componentTemplateMotifReadyShapes += row.componentTemplateMotifReadyShapes || 0;
    acc.componentTemplateMotifReadyTextBoxes += row.componentTemplateMotifReadyTextBoxes || 0;
    acc.componentTemplateMotifReadyPictures += row.componentTemplateMotifReadyPictures || 0;
    acc.componentTemplateWholeProcessImages += row.componentTemplateWholeProcessImages || 0;
    acc.componentTemplateWholeProcessShapes += row.componentTemplateWholeProcessShapes || 0;
    acc.componentTemplateWholeProcessTextBoxes += row.componentTemplateWholeProcessTextBoxes || 0;
    acc.componentTemplateWholeProcessPictures += row.componentTemplateWholeProcessPictures || 0;
    acc.componentTemplateNativeShapes += row.componentTemplateNativeShapes || 0;
    acc.componentTemplateStructureFitShapes += row.componentTemplateStructureFitShapes || 0;
    acc.componentTemplateStructureFitTextBoxes += row.componentTemplateStructureFitTextBoxes || 0;
    acc.componentTemplateStructureFitPictures += row.componentTemplateStructureFitPictures || 0;
    acc.componentTemplateCropReplacedImages += row.componentTemplateCropReplacedImages || 0;
    acc.componentTemplateCropSplitImages += row.componentTemplateCropSplitImages || 0;
    acc.componentTemplatePictureResidualImages += row.componentTemplatePictureResidualImages || 0;
    acc.componentTemplateCropPreservedImages += row.componentTemplateCropPreservedImages || 0;
    acc.componentTemplateCropStatusImages += row.componentTemplateCropStatusImages || 0;
    acc.componentTemplateCropStatusReplacedImages += row.componentTemplateCropStatusReplacedImages || 0;
    acc.componentTemplateCropStatusRetainedImages += row.componentTemplateCropStatusRetainedImages || 0;
    acc.componentTemplateCropStatusProtectedRetainedImages += row.componentTemplateCropStatusProtectedRetainedImages || 0;
    acc.componentTemplateCropStatusActionableRetainedImages += row.componentTemplateCropStatusActionableRetainedImages || 0;
    acc.componentTemplateCropStatusSplitImages += row.componentTemplateCropStatusSplitImages || 0;
    acc.componentTemplateCropStatusNativeShapesReplacingCrops += row.componentTemplateCropStatusNativeShapesReplacingCrops || 0;
    acc.protectedNonSemanticSkips += row.protectedNonSemanticSkips || 0;
    acc.visualAtomTopologyConnectors += row.visualAtomTopologyConnectors || 0;
    acc.visualAtomContainerNodes += row.visualAtomContainerNodes || 0;
    acc.visualAtomContainedNodes += row.visualAtomContainedNodes || 0;
    if (Number.isFinite(row.largestUnexplainedCropAreaRatio)) {
      acc.largestUnexplainedCropAreaRatio = Math.max(
        acc.largestUnexplainedCropAreaRatio,
        row.largestUnexplainedCropAreaRatio
      );
    }
    acc.disallowedFullPageImages += row.disallowedFullPageImages;
    if (Number.isFinite(row.textCoverage)) acc.textCoverageDecks += 1;
    acc.textCoveragePages += row.textCoveragePages || 0;
    acc.missingTextCoveragePages += row.missingTextCoveragePages || Math.max(0, row.pages - (row.textCoveragePages || 0));
    acc.textOcrFailedBoxes += row.textOcrFailedBoxes || 0;
    addDetectorCounts(acc.detectorCounts, row.detectorCounts);
    addDetectorCounts(acc.imageExpressionCounts, row.imageExpressionCounts);
    addDetectorCounts(acc.imageSubtypeCounts, row.imageSubtypeCounts);
    addDetectorCounts(acc.imageRecommendationCounts, row.imageRecommendationCounts);
    addDetectorCounts(acc.textOverlayRiskSubtypeCounts, row.textOverlayRiskSubtypeCounts);
    addDetectorCounts(acc.textOverlayRiskRecommendationCounts, row.textOverlayRiskRecommendationCounts);
    addDetectorCounts(acc.nativeOverlayRiskSubtypeCounts, row.nativeOverlayRiskSubtypeCounts);
    addDetectorCounts(acc.nativeOverlayRiskDetectorCounts, row.nativeOverlayRiskDetectorCounts);
    addDetectorCounts(acc.layerTypeCounts, row.layerTypeCounts);
    addDetectorCounts(acc.recommendedLayerActionCounts, row.recommendedLayerActionCounts);
    addDetectorCounts(acc.visualUnitDecisionCounts, row.visualUnitDecisionCounts);
    addDetectorCounts(acc.visualUnitReasonCounts, row.visualUnitReasonCounts);
    addDetectorCounts(acc.visualUnitExpressionCounts, row.visualUnitExpressionCounts);
    addDetectorCounts(acc.visualUnitLayerTypeCounts, row.visualUnitLayerTypeCounts);
    addDetectorCounts(acc.visualUnitDispositionCounts, row.visualUnitDispositionCounts);
    addDetectorCounts(acc.intentionalRasterDetectorCounts, row.intentionalRasterDetectorCounts);
    addDetectorCounts(acc.actionableRasterDetectorCounts, row.actionableRasterDetectorCounts);
    addDetectorCounts(acc.componentStrategyModeCounts, row.componentStrategyModeCounts);
    addDetectorCounts(acc.componentStrategyImplementationModeCounts, row.componentStrategyImplementationModeCounts);
    addDetectorCounts(acc.componentStrategySourceProviderCounts, row.componentStrategySourceProviderCounts);
    addDetectorCounts(acc.componentStrategyKindCounts, row.componentStrategyKindCounts);
    addDetectorCounts(acc.componentStrategyExpectationCounts, row.componentStrategyExpectationCounts);
    addDetectorCounts(acc.componentStrategyApplicationStepCounts, row.componentStrategyApplicationStepCounts);
    addDetectorCounts(acc.componentAssetProviderCounts, row.componentAssetProviderCounts);
    addDetectorCounts(acc.componentRecommendedGroupCounts, row.componentRecommendedGroupCounts);
    addDetectorCounts(acc.componentReuseReadinessCounts, row.componentReuseReadinessCounts);
    addDetectorCounts(acc.componentTemplateFamilyCounts, row.componentTemplateFamilyCounts);
    addDetectorCounts(acc.componentTemplateGroupCounts, row.componentTemplateGroupCounts);
    addDetectorCounts(acc.componentTemplateMotifReadyFamilyCounts, row.componentTemplateMotifReadyFamilyCounts);
    addDetectorCounts(acc.componentTemplateMotifReadyGroupCounts, row.componentTemplateMotifReadyGroupCounts);
    addDetectorCounts(acc.componentTemplateMotifReadyTargetCounts, row.componentTemplateMotifReadyTargetCounts);
    addDetectorCounts(acc.componentTemplateShapePartCounts, row.componentTemplateShapePartCounts);
    addDetectorCounts(acc.componentTemplateStructureFitReasonCounts, row.componentTemplateStructureFitReasonCounts);
    addDetectorCounts(acc.componentTemplateNativeRoleCounts, row.componentTemplateNativeRoleCounts);
    addDetectorCounts(acc.componentTemplateStructureRoleCounts, row.componentTemplateStructureRoleCounts);
    addDetectorCounts(acc.componentTemplateCropPreservedReasonCounts, row.componentTemplateCropPreservedReasonCounts);
    addDetectorCounts(acc.componentTemplateCropStatusByReason, row.componentTemplateCropStatusByReason);
    addDetectorCounts(acc.componentTemplateCropStatusByDetector, row.componentTemplateCropStatusByDetector);
    addDetectorCounts(acc.componentTemplateCropStatusProtectedByReason, row.componentTemplateCropStatusProtectedByReason);
    addDetectorCounts(acc.componentTemplateCropStatusActionableByReason, row.componentTemplateCropStatusActionableByReason);
    acc.componentTemplateRepairCandidates.push(...(Array.isArray(row.componentTemplateRepairCandidates)
      ? row.componentTemplateRepairCandidates
      : []));
    acc.visualUnitRepairCandidates.push(...(Array.isArray(row.visualUnitRepairCandidates)
      ? row.visualUnitRepairCandidates
      : []));
    return acc;
  }, {
    decks: 0,
    pages: 0,
    accepted: 0,
    needsReview: 0,
    rejected: 0,
    nonEditableImages: 0,
    intentionalRasterImages: 0,
    actionableNonEditableImages: 0,
    fullPageImages: 0,
    textOverlayRiskBoxes: 0,
    textOverlayRiskImages: 0,
    pagesWithTextOverlayRisk: 0,
    nativeOverlayRiskShapes: 0,
    nativeOverlayRiskImages: 0,
    pagesWithNativeOverlayRisk: 0,
    largeVisualLayers: 0,
    nativeLayerCandidates: 0,
    residualLayerCandidates: 0,
    visualUnitNativeStructureCandidates: 0,
    visualUnitIntentionalMinimumUnitCrops: 0,
    visualUnitActionableUnexplainedCrops: 0,
    qualityGateFailedDecks: 0,
    qualityGateFailureCounts: {},
    reconstructionBudgetFailedDecks: 0,
    reconstructionBudgetFailedPages: 0,
    reconstructionBudgetMaxResidualAreaRatio: 0,
    reconstructionBudgetMaxLargestResidualAreaRatio: 0,
    componentStrategyImages: 0,
    pluginReferencedImages: 0,
    pluginComponentTemplateImages: 0,
    preserveCropWithComponentReferenceImages: 0,
    nativeRebuildWithComponentStyleGuideImages: 0,
    nativeVisualAtomRebuildImages: 0,
    preserveLocalCropImages: 0,
    componentTemplateRejectedByLayerEligibilityImages: 0,
    componentStrategyDownloadRequiredImages: 0,
    componentStrategyFidelityPreservedImages: 0,
    componentLocalAssetImages: 0,
    componentLocalAssetMatches: 0,
    componentRecommendedGroupImages: 0,
    componentRecommendedGroupMatches: 0,
    componentHighReusableGroupMatches: 0,
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
    componentTemplateNativeShapes: 0,
    componentTemplateStructureFitShapes: 0,
    componentTemplateStructureFitTextBoxes: 0,
    componentTemplateStructureFitPictures: 0,
    componentTemplateCropReplacedImages: 0,
    componentTemplateCropSplitImages: 0,
    componentTemplatePictureResidualImages: 0,
    componentTemplateCropPreservedImages: 0,
    componentTemplateCropStatusImages: 0,
    componentTemplateCropStatusReplacedImages: 0,
    componentTemplateCropStatusRetainedImages: 0,
    componentTemplateCropStatusProtectedRetainedImages: 0,
    componentTemplateCropStatusActionableRetainedImages: 0,
    componentTemplateCropStatusSplitImages: 0,
    componentTemplateCropStatusNativeShapesReplacingCrops: 0,
    protectedNonSemanticSkips: 0,
    visualAtomTopologyConnectors: 0,
    visualAtomContainerNodes: 0,
    visualAtomContainedNodes: 0,
    largestUnexplainedCropAreaRatio: 0,
    disallowedFullPageImages: 0,
    textCoverageDecks: 0,
    missingTextCoverageDecks: 0,
    textCoveragePages: 0,
    missingTextCoveragePages: 0,
    textCoveragePageRatio: null,
    textOcrFailedBoxes: 0,
    detectorCounts: {},
    imageExpressionCounts: {},
    imageSubtypeCounts: {},
    imageRecommendationCounts: {},
    textOverlayRiskSubtypeCounts: {},
    textOverlayRiskRecommendationCounts: {},
    nativeOverlayRiskSubtypeCounts: {},
    nativeOverlayRiskDetectorCounts: {},
    layerTypeCounts: {},
    recommendedLayerActionCounts: {},
    visualUnitDecisionCounts: {},
    visualUnitReasonCounts: {},
    visualUnitExpressionCounts: {},
    visualUnitLayerTypeCounts: {},
    visualUnitDispositionCounts: {},
    intentionalRasterDetectorCounts: {},
    actionableRasterDetectorCounts: {},
    componentStrategyModeCounts: {},
    componentStrategyImplementationModeCounts: {},
    componentStrategySourceProviderCounts: {},
    componentStrategyKindCounts: {},
    componentStrategyExpectationCounts: {},
    componentStrategyApplicationStepCounts: {},
    componentAssetProviderCounts: {},
    componentRecommendedGroupCounts: {},
    componentReuseReadinessCounts: {},
    componentTemplateFamilyCounts: {},
    componentTemplateGroupCounts: {},
    componentTemplateMotifReadyFamilyCounts: {},
    componentTemplateMotifReadyGroupCounts: {},
    componentTemplateMotifReadyTargetCounts: {},
    componentTemplateShapePartCounts: {},
    componentTemplateStructureFitReasonCounts: {},
    componentTemplateNativeRoleCounts: {},
    componentTemplateStructureRoleCounts: {},
    componentTemplateCropPreservedReasonCounts: {},
    componentTemplateCropStatusByReason: {},
    componentTemplateCropStatusByDetector: {},
    componentTemplateCropStatusProtectedByReason: {},
    componentTemplateCropStatusActionableByReason: {},
    componentTemplateRepairCandidates: [],
    visualUnitRepairCandidates: []
  });
  totals.missingTextCoverageDecks = Math.max(0, totals.decks - totals.textCoverageDecks);
  totals.missingTextCoveragePages = Math.max(0, totals.pages - totals.textCoveragePages);
  totals.textCoveragePageRatio = totals.pages ? round(totals.textCoveragePages / totals.pages) : null;
  totals.componentTemplateStructureFitShapeRatio = totals.componentTemplateAppliedShapes
    ? round(totals.componentTemplateStructureFitShapes / totals.componentTemplateAppliedShapes)
    : null;
  totals.componentTemplateCropStatusReplacementRate = totals.componentTemplateCropStatusImages
    ? round(totals.componentTemplateCropStatusReplacedImages / totals.componentTemplateCropStatusImages)
    : null;
  totals.largestUnexplainedCropAreaRatio = round(totals.largestUnexplainedCropAreaRatio);
  totals.topDetectors = topDetectorCounts(totals.detectorCounts);
  totals.topImageExpressions = topDetectorCounts(totals.imageExpressionCounts);
  totals.topImageSubtypes = topDetectorCounts(totals.imageSubtypeCounts);
  totals.topImageRecommendations = topDetectorCounts(totals.imageRecommendationCounts);
  totals.topTextOverlayRiskSubtypes = topDetectorCounts(totals.textOverlayRiskSubtypeCounts);
  totals.topTextOverlayRiskRecommendations = topDetectorCounts(totals.textOverlayRiskRecommendationCounts);
  totals.topNativeOverlayRiskSubtypes = topDetectorCounts(totals.nativeOverlayRiskSubtypeCounts);
  totals.topNativeOverlayRiskDetectors = topDetectorCounts(totals.nativeOverlayRiskDetectorCounts);
  totals.topLayerTypes = topDetectorCounts(totals.layerTypeCounts);
  totals.topRecommendedLayerActions = topDetectorCounts(totals.recommendedLayerActionCounts);
  totals.topVisualUnitDecisions = topDetectorCounts(totals.visualUnitDecisionCounts);
  totals.topVisualUnitReasons = topDetectorCounts(totals.visualUnitReasonCounts);
  totals.topVisualUnitExpressions = topDetectorCounts(totals.visualUnitExpressionCounts);
  totals.topVisualUnitLayerTypes = topDetectorCounts(totals.visualUnitLayerTypeCounts);
  totals.topVisualUnitDispositions = topDetectorCounts(totals.visualUnitDispositionCounts);
  totals.topIntentionalRasterDetectors = topDetectorCounts(totals.intentionalRasterDetectorCounts);
  totals.topActionableRasterDetectors = topDetectorCounts(totals.actionableRasterDetectorCounts);
  totals.topComponentStrategyModes = topDetectorCounts(totals.componentStrategyModeCounts);
  totals.topComponentStrategySources = topDetectorCounts(totals.componentStrategySourceProviderCounts);
  totals.topComponentStrategyKinds = topDetectorCounts(totals.componentStrategyKindCounts);
  totals.topComponentStrategyExpectations = topDetectorCounts(totals.componentStrategyExpectationCounts);
  totals.topComponentStrategyApplicationSteps = topDetectorCounts(totals.componentStrategyApplicationStepCounts);
  totals.topComponentAssetProviders = topDetectorCounts(totals.componentAssetProviderCounts);
  totals.topComponentRecommendedGroups = topDetectorCounts(totals.componentRecommendedGroupCounts);
  totals.topComponentReuseReadiness = topDetectorCounts(totals.componentReuseReadinessCounts);
  totals.topComponentTemplateFamilies = topDetectorCounts(totals.componentTemplateFamilyCounts);
  totals.topComponentTemplateGroups = topDetectorCounts(totals.componentTemplateGroupCounts);
  totals.topComponentTemplateShapeParts = topDetectorCounts(totals.componentTemplateShapePartCounts);
  totals.topComponentTemplateStructureFitReasons = topDetectorCounts(totals.componentTemplateStructureFitReasonCounts);
  totals.topComponentTemplateNativeRoles = topDetectorCounts(totals.componentTemplateNativeRoleCounts);
  totals.topComponentTemplateStructureRoles = topDetectorCounts(totals.componentTemplateStructureRoleCounts);
  totals.topComponentTemplateCropPreservedReasons = topDetectorCounts(totals.componentTemplateCropPreservedReasonCounts);
  totals.topComponentTemplateCropStatusReasons = topDetectorCounts(totals.componentTemplateCropStatusByReason);
  totals.topComponentTemplateCropStatusDetectors = topDetectorCounts(totals.componentTemplateCropStatusByDetector);
  totals.topComponentTemplateCropStatusProtectedReasons = topDetectorCounts(totals.componentTemplateCropStatusProtectedByReason);
  totals.topComponentTemplateCropStatusActionableReasons = topDetectorCounts(totals.componentTemplateCropStatusActionableByReason);
  totals.topComponentTemplateRepairCandidates = totals.componentTemplateRepairCandidates
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0)
      || String(a.deck || "").localeCompare(String(b.deck || ""))
      || Number(a.pageIndex || 0) - Number(b.pageIndex || 0)
      || String(a.imageId || "").localeCompare(String(b.imageId || "")))
    .slice(0, 25);
  totals.topVisualUnitRepairCandidates = totals.visualUnitRepairCandidates
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0)
      || Number(b.areaRatio || 0) - Number(a.areaRatio || 0)
      || String(a.deck || "").localeCompare(String(b.deck || ""))
      || Number(a.pageIndex || 0) - Number(b.pageIndex || 0)
      || String(a.imageId || "").localeCompare(String(b.imageId || "")))
    .slice(0, 25);
  totals.topQualityGateFailures = topDetectorCounts(totals.qualityGateFailureCounts);
  const averages = {
    pixelDiffRatio: average(rows.map((row) => row.pixelDiffRatio)),
    foregroundMissingRatio: average(rows.map((row) => row.foregroundMissingRatio)),
    textCoverage: average(rows.map((row) => row.textCoverage)),
    editableObjectRatio: average(rows.map((row) => row.editableObjectRatio)),
    actionableEditableObjectRatio: average(rows.map((row) => row.actionableEditableObjectRatio))
  };
  const requireTextCoverage = options.requireTextCoverage === true;
  const requireFullTextCoverage = options.requireFullTextCoverage === true;
  const requireNoTextOverlayRisk = options.requireNoTextOverlayRisk === true;
  const requireNoResidualLayerCandidates = options.requireNoResidualLayerCandidates === true;
  const requireNoActionableUnexplainedCrops = options.requireNoActionableUnexplainedCrops === true;
  const requireNoClassificationNeededVisualUnits = options.requireNoClassificationNeededVisualUnits === true;
  const classificationNeededVisualUnits = Number(totals.visualUnitDispositionCounts?.["classification-needed"] || 0);
  const minComponentHighReusableGroupMatches = optionalPositiveInteger(options.minComponentHighReusableGroupMatches);
  const componentHighReusableGroupMatchesMet = minComponentHighReusableGroupMatches === null
    || totals.componentHighReusableGroupMatches >= minComponentHighReusableGroupMatches;
  const minComponentTemplateMotifReadyShapes = optionalPositiveInteger(options.minComponentTemplateMotifReadyShapes);
  const componentTemplateMotifReadyShapesMet = minComponentTemplateMotifReadyShapes === null
    || totals.componentTemplateMotifReadyShapes >= minComponentTemplateMotifReadyShapes;
  const minComponentTemplateMotifReadyTargetCounts = normalizeMotifTargetMinimums(options.minComponentTemplateMotifReadyTargetCounts);
  const componentTemplateMotifReadyTargetCountsMet = Object.entries(minComponentTemplateMotifReadyTargetCounts)
    .every(([motif, minimum]) => Number(totals.componentTemplateMotifReadyTargetCounts?.[motif] || 0) >= minimum);
  const minComponentTemplateStructureFitShapeRatio = optionalNonNegativeNumber(options.minComponentTemplateStructureFitShapeRatio);
  const componentTemplateStructureFitShapeRatioMet = minComponentTemplateStructureFitShapeRatio === null
    || Number(totals.componentTemplateStructureFitShapeRatio || 0) >= minComponentTemplateStructureFitShapeRatio;
  const minVisualAtomTopologyConnectors = optionalPositiveInteger(options.minVisualAtomTopologyConnectors);
  const visualAtomTopologyConnectorsMet = minVisualAtomTopologyConnectors === null
    || totals.visualAtomTopologyConnectors >= minVisualAtomTopologyConnectors;
  const minVisualAtomContainerNodes = optionalPositiveInteger(options.minVisualAtomContainerNodes);
  const visualAtomContainerNodesMet = minVisualAtomContainerNodes === null
    || totals.visualAtomContainerNodes >= minVisualAtomContainerNodes;
  const minVisualAtomContainedNodes = optionalPositiveInteger(options.minVisualAtomContainedNodes);
  const visualAtomContainedNodesMet = minVisualAtomContainedNodes === null
    || totals.visualAtomContainedNodes >= minVisualAtomContainedNodes;
  const maxDeckPixelDiffRatio = optionalNonNegativeNumber(options.maxDeckPixelDiffRatio);
  const maxDeckForegroundMissingRatio = optionalNonNegativeNumber(options.maxDeckForegroundMissingRatio);
  const maxAveragePixelDiffRatio = optionalNonNegativeNumber(options.maxAveragePixelDiffRatio);
  const maxAverageForegroundMissingRatio = optionalNonNegativeNumber(options.maxAverageForegroundMissingRatio);
  const minComparedPages = optionalPositiveInteger(options.minComparedPages);
  const deckPixelDiffRatioMet = maxDeckPixelDiffRatio === null
    || rows.every((row) => row.pixelDiffRatio === null || Number(row.pixelDiffRatio) <= maxDeckPixelDiffRatio);
  const deckForegroundMissingRatioMet = maxDeckForegroundMissingRatio === null
    || rows.every((row) => row.foregroundMissingRatio === null || Number(row.foregroundMissingRatio) <= maxDeckForegroundMissingRatio);
  const averagePixelDiffRatioMet = maxAveragePixelDiffRatio === null
    || averages.pixelDiffRatio === null
    || Number(averages.pixelDiffRatio) <= maxAveragePixelDiffRatio;
  const averageForegroundMissingRatioMet = maxAverageForegroundMissingRatio === null
    || averages.foregroundMissingRatio === null
    || Number(averages.foregroundMissingRatio) <= maxAverageForegroundMissingRatio;
  const comparedPages = sumComparedPages(rows);
  const comparedPagesMet = minComparedPages === null || comparedPages >= minComparedPages;
  return {
    provider: "real-pptx-quality-matrix",
    generatedAt: new Date().toISOString(),
    passed: totals.rejected === 0
      && totals.disallowedFullPageImages === 0
      && rows.every((row) => row.passed)
      && (!requireTextCoverage || totals.missingTextCoverageDecks === 0)
      && (!requireFullTextCoverage || totals.missingTextCoveragePages === 0)
      && (!requireNoTextOverlayRisk || (totals.textOverlayRiskBoxes === 0 && totals.nativeOverlayRiskShapes === 0))
      && (!requireNoResidualLayerCandidates || totals.residualLayerCandidates === 0)
      && (!requireNoActionableUnexplainedCrops || totals.visualUnitActionableUnexplainedCrops === 0)
      && (!requireNoClassificationNeededVisualUnits || classificationNeededVisualUnits === 0)
      && componentHighReusableGroupMatchesMet
      && componentTemplateMotifReadyShapesMet
      && componentTemplateMotifReadyTargetCountsMet
      && componentTemplateStructureFitShapeRatioMet
      && visualAtomTopologyConnectorsMet
      && visualAtomContainerNodesMet
      && visualAtomContainedNodesMet
      && deckPixelDiffRatioMet
      && deckForegroundMissingRatioMet
      && averagePixelDiffRatioMet
      && averageForegroundMissingRatioMet
      && comparedPagesMet,
    gates: {
      requireTextCoverage,
      requireFullTextCoverage,
      requireNoTextOverlayRisk,
      requireNoResidualLayerCandidates,
      requireNoActionableUnexplainedCrops,
      requireNoClassificationNeededVisualUnits,
      minComponentHighReusableGroupMatches,
      minComponentTemplateMotifReadyShapes,
      minComponentTemplateMotifReadyTargetCounts,
      minComponentTemplateStructureFitShapeRatio,
      minVisualAtomTopologyConnectors,
      minVisualAtomContainerNodes,
      minVisualAtomContainedNodes,
      maxDeckPixelDiffRatio,
      maxDeckForegroundMissingRatio,
      maxAveragePixelDiffRatio,
      maxAverageForegroundMissingRatio,
      minComparedPages
    },
    totals: {
      ...totals,
      comparedPages,
      classificationNeededVisualUnits,
      componentHighReusableGroupMatchesMet,
      componentTemplateMotifReadyShapesMet,
      componentTemplateMotifReadyTargetCountsMet,
      componentTemplateStructureFitShapeRatioMet,
      visualAtomTopologyConnectorsMet,
      visualAtomContainerNodesMet,
      visualAtomContainedNodesMet,
      deckPixelDiffRatioMet,
      deckForegroundMissingRatioMet,
      averagePixelDiffRatioMet,
      averageForegroundMissingRatioMet,
      comparedPagesMet,
      missingComponentTemplateMotifReadyTargetCounts: missingMotifTargetMinimums(
        totals.componentTemplateMotifReadyTargetCounts,
        minComponentTemplateMotifReadyTargetCounts
      )
    },
    averages,
    rows
  };
}

function sumComparedPages(rows = []) {
  return rows.reduce((sum, row) => {
    const explicitComparedPages = Number(row.comparedPages);
    if (Number.isFinite(explicitComparedPages) && explicitComparedPages >= 0) {
      return sum + explicitComparedPages;
    }
    const pages = Number(row.pages || 0);
    const rejected = Number(row.rejected || 0);
    const needsReview = Number(row.needsReview || 0);
    return sum + Math.max(0, pages - rejected - needsReview);
  }, 0);
}

function compareQualityRows(baselineRows = [], candidateRows = [], options = {}) {
  const maxPixelDiffIncrease = numberOrDefault(options.maxPixelDiffIncrease, 0.01);
  const maxForegroundMissingIncrease = numberOrDefault(options.maxForegroundMissingIncrease, 0.02);
  const maxActionableEditableDrop = numberOrDefault(options.maxActionableEditableDrop, 0.01);
  const maxComponentTemplateStructureFitShapeRatioDrop = numberOrDefault(
    options.maxComponentTemplateStructureFitShapeRatioDrop,
    0.01
  );
  const maxComponentTemplateEligibilityRejectionIncrease = numberOrDefault(
    options.maxComponentTemplateEligibilityRejectionIncrease,
    0
  );
  const expectedComparedDecks = optionalPositiveInteger(options.expectedComparedDecks);
  const expectedDeckNames = normalizeExpectedDeckNames(options.expectedDeckNames);
  const expectedPageCounts = normalizeExpectedPageCounts(options.expectedPageCounts);
  const duplicateBaselineDecks = duplicateDeckNames(baselineRows);
  const duplicateCandidateDecks = duplicateDeckNames(candidateRows);
  const uniqueCandidateDecks = new Set(candidateRows.map((row) => row.deck).filter(Boolean));
  const deckSetComparison = compareDeckNameSets(uniqueCandidateDecks, expectedDeckNames);
  const pageCountMismatches = comparePageCounts(candidateRows, expectedPageCounts);
  const baselineByDeck = new Map(baselineRows.map((row) => [row.deck, row]));
  const comparisons = [];
  const missingBaselineDecks = [];
  for (const candidate of candidateRows) {
    const baseline = baselineByDeck.get(candidate.deck);
    if (!baseline) {
      missingBaselineDecks.push(candidate.deck);
      continue;
    }
    const comparison = compareQualityRowPair(baseline, candidate, {
      maxPixelDiffIncrease,
      maxForegroundMissingIncrease,
      maxActionableEditableDrop,
      maxComponentTemplateStructureFitShapeRatioDrop,
      maxComponentTemplateEligibilityRejectionIncrease
    });
    comparisons.push(comparison);
  }
  const failed = comparisons.filter((item) => item.status === "regressed");
  const expectedDeckCountMet = expectedComparedDecks === null || uniqueCandidateDecks.size === expectedComparedDecks;
  const expectedDeckNamesMet = deckSetComparison === null
    || (deckSetComparison.missing.length === 0 && deckSetComparison.unexpected.length === 0);
  return {
    provider: "real-pptx-quality-regression-matrix",
    generatedAt: new Date().toISOString(),
    passed: failed.length === 0
      && missingBaselineDecks.length === 0
      && duplicateBaselineDecks.length === 0
      && duplicateCandidateDecks.length === 0
      && expectedDeckCountMet
      && expectedDeckNamesMet
      && pageCountMismatches.length === 0,
    gates: {
      maxPixelDiffIncrease,
      maxForegroundMissingIncrease,
      maxActionableEditableDrop,
      maxComponentTemplateStructureFitShapeRatioDrop,
      maxComponentTemplateEligibilityRejectionIncrease,
      expectedComparedDecks,
      expectedDeckNames,
      expectedPageCounts
    },
    totals: {
      comparedDecks: comparisons.length,
      uniqueCandidateDecks: uniqueCandidateDecks.size,
      regressedDecks: failed.length,
      missingBaselineDecks: missingBaselineDecks.length,
      duplicateBaselineDecks: duplicateBaselineDecks.length,
      duplicateCandidateDecks: duplicateCandidateDecks.length,
      expectedDeckCountMet,
      expectedDeckNamesMet,
      pageCountMismatches: pageCountMismatches.length
    },
    missingBaselineDecks,
    missingExpectedDecks: deckSetComparison?.missing || [],
    unexpectedDecks: deckSetComparison?.unexpected || [],
    pageCountMismatches,
    duplicateBaselineDecks,
    duplicateCandidateDecks,
    failedDecks: failed.map((item) => item.deck),
    comparisons
  };
}

function duplicateDeckNames(rows = []) {
  const counts = new Map();
  for (const row of rows) {
    const deck = String(row?.deck || "").trim();
    if (!deck) continue;
    counts.set(deck, (counts.get(deck) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([deck]) => deck)
    .sort((a, b) => a.localeCompare(b));
}

function normalizeExpectedDeckNames(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : String(value).split(/[;,]/);
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function compareDeckNameSets(actualSet, expectedDeckNames = []) {
  if (!Array.isArray(expectedDeckNames) || expectedDeckNames.length === 0) return null;
  const actual = new Set([...actualSet].map((item) => String(item || "").trim()).filter(Boolean));
  return {
    missing: expectedDeckNames.filter((deck) => !actual.has(deck)),
    unexpected: [...actual].filter((deck) => !expectedDeckNames.includes(deck)).sort((a, b) => a.localeCompare(b))
  };
}

function normalizeExpectedPageCounts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [deck, rawPages] of Object.entries(value)) {
    const name = String(deck || "").trim();
    const pages = Number(rawPages);
    if (!name || !Number.isInteger(pages) || pages <= 0) continue;
    out[name] = pages;
  }
  return out;
}

function comparePageCounts(rows = [], expectedPageCounts = {}) {
  const expectedEntries = Object.entries(expectedPageCounts || {});
  if (expectedEntries.length === 0) return [];
  const byDeck = new Map(rows.map((row) => [row.deck, row]));
  const mismatches = [];
  for (const [deck, expectedPages] of expectedEntries) {
    const row = byDeck.get(deck);
    if (!row) continue;
    const actualPages = Number(row.pages);
    if (actualPages !== expectedPages) {
      mismatches.push({
        deck,
        expectedPages,
        actualPages: Number.isFinite(actualPages) ? actualPages : null
      });
    }
  }
  return mismatches;
}

function compareQualityRowPair(baseline, candidate, gates) {
  const deltas = {
    accepted: candidate.accepted - baseline.accepted,
    needsReview: candidate.needsReview - baseline.needsReview,
    rejected: candidate.rejected - baseline.rejected,
    pixelDiffRatio: diffOrNull(candidate.pixelDiffRatio, baseline.pixelDiffRatio),
    foregroundMissingRatio: diffOrNull(candidate.foregroundMissingRatio, baseline.foregroundMissingRatio),
    actionableEditableObjectRatio: diffOrNull(candidate.actionableEditableObjectRatio, baseline.actionableEditableObjectRatio),
    componentLocalAssetMatches: candidate.componentLocalAssetMatches - baseline.componentLocalAssetMatches,
    componentHighReusableGroupMatches: candidate.componentHighReusableGroupMatches - baseline.componentHighReusableGroupMatches,
    componentTemplateAppliedShapes: candidate.componentTemplateAppliedShapes - baseline.componentTemplateAppliedShapes,
    componentTemplateStructureFitShapeRatio: diffOrNull(
      candidate.componentTemplateStructureFitShapeRatio,
      baseline.componentTemplateStructureFitShapeRatio
    ),
    componentTemplateRejectedByLayerEligibilityImages: candidate.componentTemplateRejectedByLayerEligibilityImages - baseline.componentTemplateRejectedByLayerEligibilityImages,
    residualLayerCandidates: candidate.residualLayerCandidates - baseline.residualLayerCandidates,
    visualUnitActionableUnexplainedCrops: numberOrDefault(candidate.visualUnitActionableUnexplainedCrops, 0) - numberOrDefault(baseline.visualUnitActionableUnexplainedCrops, 0),
    protectedNonSemanticSkips: numberOrDefault(candidate.protectedNonSemanticSkips, 0) - numberOrDefault(baseline.protectedNonSemanticSkips, 0),
    textOverlayRiskBoxes: candidate.textOverlayRiskBoxes - baseline.textOverlayRiskBoxes,
    nativeOverlayRiskShapes: candidate.nativeOverlayRiskShapes - baseline.nativeOverlayRiskShapes
  };
  const reasons = [];
  if (!candidate.passed) reasons.push("candidate-quality-gate-failed");
  if (deltas.rejected > 0) reasons.push("rejected-pages-increased");
  if (deltas.needsReview > 0) reasons.push("review-pages-increased");
  if (Number.isFinite(deltas.pixelDiffRatio) && deltas.pixelDiffRatio > gates.maxPixelDiffIncrease) reasons.push("pixel-diff-regressed");
  if (Number.isFinite(deltas.foregroundMissingRatio) && deltas.foregroundMissingRatio > gates.maxForegroundMissingIncrease) reasons.push("foreground-missing-regressed");
  if (Number.isFinite(deltas.actionableEditableObjectRatio) && deltas.actionableEditableObjectRatio < -gates.maxActionableEditableDrop) reasons.push("actionable-editability-regressed");
  if (
    Number.isFinite(deltas.componentTemplateStructureFitShapeRatio)
    && deltas.componentTemplateStructureFitShapeRatio < -gates.maxComponentTemplateStructureFitShapeRatioDrop
  ) {
    reasons.push("component-template-structure-fit-ratio-regressed");
  }
  if (deltas.componentTemplateRejectedByLayerEligibilityImages > gates.maxComponentTemplateEligibilityRejectionIncrease) {
    reasons.push("component-template-eligibility-rejections-increased");
  }
  if (deltas.residualLayerCandidates > 0) reasons.push("residual-layer-candidates-increased");
  if (deltas.visualUnitActionableUnexplainedCrops > 0) reasons.push("actionable-unexplained-crops-increased");
  if (deltas.textOverlayRiskBoxes > 0) reasons.push("text-overlay-risk-increased");
  if (deltas.nativeOverlayRiskShapes > 0) reasons.push("native-overlay-risk-increased");
  return {
    deck: candidate.deck,
    status: reasons.length > 0 ? "regressed" : "passed",
    reasons,
    baseline: compactQualityRow(baseline),
    candidate: compactQualityRow(candidate),
    deltas: roundDeltas(deltas)
  };
}

function compactQualityRow(row) {
  return {
    reportFile: row.reportFile,
    pages: row.pages,
    accepted: row.accepted,
    needsReview: row.needsReview,
    rejected: row.rejected,
    pixelDiffRatio: row.pixelDiffRatio,
    foregroundMissingRatio: row.foregroundMissingRatio,
    actionableEditableObjectRatio: row.actionableEditableObjectRatio,
    componentLocalAssetMatches: row.componentLocalAssetMatches,
    componentHighReusableGroupMatches: row.componentHighReusableGroupMatches,
    componentTemplateAppliedShapes: row.componentTemplateAppliedShapes,
    componentTemplateStructureFitShapeRatio: row.componentTemplateStructureFitShapeRatio,
    componentTemplateRejectedByLayerEligibilityImages: row.componentTemplateRejectedByLayerEligibilityImages,
    residualLayerCandidates: row.residualLayerCandidates,
    visualUnitActionableUnexplainedCrops: row.visualUnitActionableUnexplainedCrops,
    protectedNonSemanticSkips: row.protectedNonSemanticSkips,
    textOverlayRiskBoxes: row.textOverlayRiskBoxes,
    nativeOverlayRiskShapes: row.nativeOverlayRiskShapes
  };
}

function diffOrNull(candidate, baseline) {
  if (!Number.isFinite(candidate) || !Number.isFinite(baseline)) return null;
  return candidate - baseline;
}

function roundDeltas(deltas) {
  return Object.fromEntries(Object.entries(deltas).map(([key, value]) => [
    key,
    Number.isFinite(value) ? Number(value.toFixed(6)) : value
  ]));
}

function numberOrDefault(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalPositiveInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function optionalNonNegativeNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
}

function normalizeMotifTargetMinimums(value) {
  if (value === undefined || value === null || value === "") return {};
  const entries = typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value)
    : String(value).split(/[;,]/).map((part) => {
      const [key, raw] = part.split("=");
      return [key, raw];
    });
  const out = {};
  for (const [key, rawValue] of entries) {
    const motif = normalizeTargetMotif(key);
    const number = Number(rawValue);
    if (!motif || !Number.isInteger(number) || number <= 0) continue;
    out[motif] = number;
  }
  return out;
}

function missingMotifTargetMinimums(actual = {}, minimums = {}) {
  const missing = {};
  for (const [motif, minimum] of Object.entries(minimums || {})) {
    const current = Number(actual?.[motif] || 0);
    if (!Number.isFinite(current) || current < minimum) {
      missing[motif] = { expected: minimum, actual: Number.isFinite(current) ? current : 0 };
    }
  }
  return missing;
}

function normalizeTargetMotif(value) {
  const motif = String(value || "").trim().toLowerCase();
  return /^(cycle-loop|arc-arrow|ring-node|card-grid|dashboard-card-grid|comparison-matrix|heatmap-matrix|treemap-chart|sankey-flow-chart|map-chart|word-cloud-chart|waterfall-chart|gauge-chart|radar-chart|tree-link|org-hierarchy|radial-link|screenshot-card-grid|screenshot-crop|visual-example-card-grid|visual-example-crop|feature-icon-card-grid|icon-crop|numbered-step-card-grid|step-badge|screenshot-zoom-callout|zoom-lens-overlay|screenshot-annotation|callout-overlay|highlight-box|concentric-circles|linear-arrow-chain|whole-process-template|lens-funnel-flow|branch-card-flow|pie-share-chart|bubble-scatter-chart|quadrant-axis|layered-stack|funnel-stack|pyramid-stack|venn-overlap|intersection-overlap|milestone-roadmap|gantt-roadmap|fishbone-cause|topology-triangle)$/.test(motif) ? motif : "";
}

function addDetectorCounts(target, counts = {}) {
  for (const [detector, rawValue] of Object.entries(counts || {})) {
    const value = Number(rawValue || 0);
    if (!detector || !Number.isFinite(value) || value <= 0) continue;
    target[detector] = (target[detector] || 0) + value;
  }
}

function topDetectorCounts(counts = {}, limit = 12) {
  return Object.entries(counts || {})
    .map(([detector, count]) => ({ detector, count }))
    .sort((a, b) => (b.count - a.count) || a.detector.localeCompare(b.detector))
    .slice(0, limit);
}

function average(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  return Number((finite.reduce((sum, value) => sum + value, 0) / finite.length).toFixed(6));
}

function round(value) {
  return Number(Number(value).toFixed(4));
}

function writeMatrix(matrix, outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(matrix, null, 2)}\n`, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const comparisonManifest = args["comparison-manifest"] ? readComparisonManifest(args["comparison-manifest"]) : null;
  const baselineFiles = parseReportList(args["baseline-reports"] || comparisonManifest?.baselineReports);
  const candidateFiles = parseReportList(args["candidate-reports"] || comparisonManifest?.candidateReports);
  const files = candidateFiles.length > 0 ? candidateFiles.map((file) => path.resolve(file)) : resolveReportFiles(args);
  const rows = files.map((file) => summarizeReport(file));
  const matrix = aggregateMatrix(rows, {
    requireTextCoverage: truthyArg(args["require-text-coverage"] ?? comparisonManifest?.gates?.requireTextCoverage),
    requireFullTextCoverage: truthyArg(args["require-full-text-coverage"] ?? comparisonManifest?.gates?.requireFullTextCoverage),
    requireNoTextOverlayRisk: truthyArg(args["require-no-text-overlay-risk"] ?? comparisonManifest?.gates?.requireNoTextOverlayRisk),
    requireNoResidualLayerCandidates: truthyArg(args["require-no-residual-layer-candidates"] ?? comparisonManifest?.gates?.requireNoResidualLayerCandidates),
    requireNoActionableUnexplainedCrops: truthyArg(args["require-no-actionable-unexplained-crops"] ?? comparisonManifest?.gates?.requireNoActionableUnexplainedCrops),
    requireNoClassificationNeededVisualUnits: truthyArg(args["require-no-classification-needed-visual-units"] ?? comparisonManifest?.gates?.requireNoClassificationNeededVisualUnits),
    minComponentHighReusableGroupMatches: args["min-component-high-reusable-group-matches"] ?? comparisonManifest?.gates?.minComponentHighReusableGroupMatches,
    minComponentTemplateMotifReadyShapes: args["min-component-template-motif-ready-shapes"] ?? comparisonManifest?.gates?.minComponentTemplateMotifReadyShapes,
    minComponentTemplateMotifReadyTargetCounts: args["min-component-template-motif-ready-target-counts"] ?? comparisonManifest?.gates?.minComponentTemplateMotifReadyTargetCounts,
    minComponentTemplateStructureFitShapeRatio: args["min-component-template-structure-fit-shape-ratio"] ?? comparisonManifest?.gates?.minComponentTemplateStructureFitShapeRatio,
    minVisualAtomTopologyConnectors: args["min-visual-atom-topology-connectors"] ?? comparisonManifest?.gates?.minVisualAtomTopologyConnectors,
    minVisualAtomContainerNodes: args["min-visual-atom-container-nodes"] ?? comparisonManifest?.gates?.minVisualAtomContainerNodes,
    minVisualAtomContainedNodes: args["min-visual-atom-contained-nodes"] ?? comparisonManifest?.gates?.minVisualAtomContainedNodes,
    maxDeckPixelDiffRatio: args["max-deck-pixel-diff-ratio"] ?? comparisonManifest?.gates?.maxDeckPixelDiffRatio,
    maxDeckForegroundMissingRatio: args["max-deck-foreground-missing-ratio"] ?? comparisonManifest?.gates?.maxDeckForegroundMissingRatio,
    maxAveragePixelDiffRatio: args["max-average-pixel-diff-ratio"] ?? comparisonManifest?.gates?.maxAveragePixelDiffRatio,
    maxAverageForegroundMissingRatio: args["max-average-foreground-missing-ratio"] ?? comparisonManifest?.gates?.maxAverageForegroundMissingRatio,
    minComparedPages: args["min-compared-pages"] ?? comparisonManifest?.gates?.minComparedPages
  });
  if (baselineFiles.length > 0 || candidateFiles.length > 0) {
    const baselineRows = baselineFiles.map((file) => summarizeReport(path.resolve(file)));
    const regression = compareQualityRows(baselineRows, rows, {
      maxPixelDiffIncrease: args["max-pixel-diff-increase"] ?? comparisonManifest?.gates?.maxPixelDiffIncrease,
      maxForegroundMissingIncrease: args["max-foreground-missing-increase"] ?? comparisonManifest?.gates?.maxForegroundMissingIncrease,
      maxActionableEditableDrop: args["max-actionable-editable-drop"] ?? comparisonManifest?.gates?.maxActionableEditableDrop,
      maxComponentTemplateStructureFitShapeRatioDrop: args["max-component-template-structure-fit-shape-ratio-drop"]
        ?? comparisonManifest?.gates?.maxComponentTemplateStructureFitShapeRatioDrop,
      maxComponentTemplateEligibilityRejectionIncrease: args["max-component-template-eligibility-rejection-increase"]
        ?? comparisonManifest?.gates?.maxComponentTemplateEligibilityRejectionIncrease,
      expectedComparedDecks: args["expected-compared-decks"] ?? comparisonManifest?.gates?.expectedComparedDecks,
      expectedDeckNames: args["expected-deck-names"] ?? comparisonManifest?.gates?.expectedDeckNames,
      expectedPageCounts: comparisonManifest?.gates?.expectedPageCounts
    });
    if (comparisonManifest?.id) regression.manifestId = comparisonManifest.id;
    if (comparisonManifest?.description) regression.description = comparisonManifest.description;
    matrix.regression = regression;
    matrix.passed = matrix.passed && regression.passed;
  }
  const outFile = path.resolve(args.out || path.join("runs", "quality-gate", "real-pptx-quality-matrix.json"));
  writeMatrix(matrix, outFile);
  console.log(JSON.stringify({ ...matrix, reportFile: outFile }, null, 2));
  if (args["fail-on-regression"] && !matrix.passed) {
    process.exitCode = 1;
  }
}

function truthyArg(value) {
  return value === true || String(value || "").toLowerCase() === "true";
}

function parseReportList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value).split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function readComparisonManifest(file) {
  const manifestFile = path.resolve(file);
  const manifest = readJson(manifestFile);
  return {
    ...manifest,
    manifestFile
  };
}

if (require.main === module) {
  main();
}

module.exports = {
  addDetectorCounts,
  aggregateMatrix,
  compareQualityRows,
  parseArgs,
  parseReportList,
  readComparisonManifest,
  resolveReportFiles,
  normalizeMotifTargetMinimums,
  summarizeReport,
  topDetectorCounts,
  truthyArg
};
