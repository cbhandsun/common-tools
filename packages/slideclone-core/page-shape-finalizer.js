"use strict";
// @ts-check
/** @typedef {{[key: string]: unknown, source?: {detector?: unknown}}} Item */
/** @typedef {{shapes: Item[], matched?: boolean}} Producer */
/** @typedef {{items: Item[], dropped: unknown[], claims: unknown[]}} Arbitration */
/** @typedef {Record<"titleChromeShapes"|"retainedKpiEvidenceShapes"|"retainedValueBannerBackgroundShapes"|"structuredIllustrationCardBackgroundShapes"|"matrixColorBlockShapes"|"layerColorBlockShapes"|"stickyNoteClusterShapes"|"layerConnectorShapes"|"layerContainerShapes"|"tableBackgroundShapes"|"textBackplateShapes"|"tableGridShapes"|"quadrantDividerShapes"|"networkDiagramShapes"|"pageLevelNetworkDiagramShapes"|"hierarchyDiagramShapes"|"triangleTopologyShapes"|"coverEngineCoreShapes"|"skillChainOverviewShapes"|"linearProcessShapes"|"prdGenerationFlowShapes"|"prototypeValidationFlowShapes"|"demandUnderstandingFlowShapes"|"comparisonMatrixShapes"|"saturatedDiagramTextShapes"|"semanticCycleDiagramShapes"|"denseComplexDiagramScaffoldShapes"|"twoPanelDiagramTextShapes"|"topComplexDiagramTextShapes"|"retainedKpiEvidenceTextShapes"|"valueQuadrantShapes"|"reviewRiskGateFlowShapes"|"funnelHubDiagramShapes"|"horizontalStepChainShapes"|"genericNodeDiagramSkeletonShapes"|"visualClusterStackShapes"|"wmsRouteChainShapes"|"retainedCollaborationFlowShapes"|"stickySketchResidualNativeShapes"|"funnelHubResidualNativeShapes"|"structuredIllustrationResidualLineShapes"|"structuredIllustrationResidualIconShapes"|"structuredIllustrationCardTitleWarningShapes"|"structuredIllustrationProcessingWarningShapes"|"structuredIllustrationResidualSketchLineShapes"|"structuredIllustrationGearPersonShapes"|"structuredIllustrationCardVisualAtomShapes"|"structuredIllustrationOutputDocumentShapes"|"structuredIllustrationInputDocumentShapes"|"entropyFragmentShapes"|"entropyIslandShapes"|"entropyChallengeFooterShapes"|"retainedVisualAtomNativeShapes"|"structuredIllustrationCardChromeShapes"|"retainedComponentTemplateNativeShapes"|"lines", Item[]> & Record<"documentVersionGovernanceActive"|"assetOsFlowActive"|"useUnderlay"|"portalPlatformDiagramActive"|"visualOperationSyncActive"|"embeddedExpertScreenshotActive"|"temporaryAnswerWorkflowMatrixActive"|"assetOsFragmentedAssetChainActive"|"productBrainPuzzleValueLoopActive"|"productBrainWmsQualityGateActive"|"assetHubSuperBrainPortalProtected"|"unreadableSystemMapFidelityProtected"|"workflowChallengeTriadActive", boolean> & Record<"CLI_SCAFFOLD_GENERATOR_DETECTOR_PREFIX"|"RUNTIME_ENGINE_HYBRID_DETECTOR_PREFIX"|"VISUAL_OPERATION_SYNC_DETECTOR_PREFIX"|"EMBEDDED_EXPERT_DETECTOR_PREFIX", string> & Record<"productCollaborationChallenge"|"pageLevelSkillChainOverview"|"temporaryAnswerWorkflowMatrix"|"assetHubSuperBrainPortal"|"assetHubSuperBrainPortalChrome"|"assetHubVersionTimeline"|"assetHubSourcePurification"|"assetHubWmsInboundReview"|"productBrainAssetClosureFunnel"|"productBrainWmsQualityGate"|"retainedProductBrainSmartReviewRiskGate"|"productBrainCoreValueHybrid"|"productBrainCoreValueSplit"|"productBrainPuzzleValueLoop"|"skillsEngineCoverTriad"|"skillsEngineAiComparisonMatrix"|"workflowPrdAutoGenerationFlow"|"workflowDemandUnderstandingAssistant"|"workflowChallengeTriadIllustrations"|"workflowComparisonMatrix"|"workflowCollaborationMultiplier"|"workflowSupplyChainTwoPanel"|"workflowKpiEvidence"|"workflowAssetCycleQuadrant"|"assetOsDemandUnderstandingAssistant"|"assetOsEntropyChallenge"|"assetOsHighValueAssetMatrix"|"assetOsTwoDimensionalFoundation"|"shiftLeftDebuggerDiagram"|"toolIslandTransitionMatrix"|"stackedArchitectureDiagram"|"toolGapPlatformDiagram"|"processWithScreenshotsFlow"|"textAnchoredProcessNetwork"|"documentVersionGovernance"|"documentVersionFolderFlow"|"assetOsFlow"|"prototypeGenerationLoop"|"assetOsKpiBenefit"|"scaleLandingEvidence"|"fourStepLandingPath"|"valueQuadrantGems"|"portalPlatformDiagram"|"systemMapDiagram"|"systemMapFidelityChrome"|"tableMatrixResidualObjects"|"structuredIllustrationInputChaosGlyphObjects"|"entropyChallengeAnnotations"|"assetHubCycleIllustration"|"inputOutputSplitDiagram"|"cliScaffoldGenerator"|"runtimeEngineHybrid"|"productBrainVision"|"icons"|"skillsCapabilityMatrix"|"demandIntakeFunnel"|"smartReviewBranchGate"|"skillChainOrchestration"|"assetLandingTriad"|"visualOperationSync"|"embeddedExpertScreenshot"|"productManagerFrictionNetwork"|"assetOsFragmentedAssetChain"|"traditionalCollaborationBreakdown"|"paradigmShiftMatrix"|"valueTransformationTable"|"ocrGridTable", Producer> & {slideSize: unknown}} Inputs */
/** @typedef {{shapes: Item[], images: Item[]}} Page */
/** @typedef {{
 * sanitizeNativeShapes: (...args: unknown[]) => Item[],
 * dropFalseTableOverlaysOnProtectedCollaborationDiagram: (...args: unknown[]) => Item[],
 * dropFalseTableLayersClaimedByPortalPlatform: (...args: unknown[]) => Item[],
 * filterObjectsClaimedByTemporaryAnswerWorkflowTable: (...args: unknown[]) => Item[],
 * filterShapesClaimedByToolIslandTransitionMatrix: (...args: unknown[]) => Item[],
 * suppressGenericStructuredIllustrationObjectsForSpecialist: (...args: unknown[]) => Item[],
 * arbitrateSparseFlowCardChainNativeOwnership: (...args: unknown[]) => Item[],
 * arbitrateNativeObjectOwnership: (...args: unknown[]) => Arbitration,
 * promoteOrthogonalConnectorRoutes: (...args: unknown[]) => Item[]
 * }} Operations */

/** Orders final shape production, specialist replacement and ownership.
 * Consumes internal producer results; external document parsing occurs upstream.
 * @param {Operations} operations */
function createPageShapeFinalizer(operations) {
  const {
    sanitizeNativeShapes, dropFalseTableOverlaysOnProtectedCollaborationDiagram, dropFalseTableLayersClaimedByPortalPlatform,
    filterObjectsClaimedByTemporaryAnswerWorkflowTable, filterShapesClaimedByToolIslandTransitionMatrix, suppressGenericStructuredIllustrationObjectsForSpecialist,
    arbitrateSparseFlowCardChainNativeOwnership, arbitrateNativeObjectOwnership, promoteOrthogonalConnectorRoutes
  } = operations;
  const required = [
    sanitizeNativeShapes, dropFalseTableOverlaysOnProtectedCollaborationDiagram, dropFalseTableLayersClaimedByPortalPlatform,
    filterObjectsClaimedByTemporaryAnswerWorkflowTable, filterShapesClaimedByToolIslandTransitionMatrix, suppressGenericStructuredIllustrationObjectsForSpecialist,
    arbitrateSparseFlowCardChainNativeOwnership, arbitrateNativeObjectOwnership, promoteOrthogonalConnectorRoutes
  ];
  if (required.some(operation => typeof operation !== "function")) throw new TypeError("page shape finalizer operations are incomplete");
  /** @param {Page} pageDraft @param {Inputs} inputs */
  return function finalizePageShapes(pageDraft, inputs) {
    const {
      documentVersionGovernanceActive, titleChromeShapes, retainedKpiEvidenceShapes,
      retainedValueBannerBackgroundShapes, productCollaborationChallenge, structuredIllustrationCardBackgroundShapes,
      matrixColorBlockShapes, layerColorBlockShapes, stickyNoteClusterShapes,
      layerConnectorShapes, layerContainerShapes, tableBackgroundShapes,
      textBackplateShapes, tableGridShapes, quadrantDividerShapes,
      networkDiagramShapes, pageLevelNetworkDiagramShapes, hierarchyDiagramShapes,
      triangleTopologyShapes, coverEngineCoreShapes, skillChainOverviewShapes,
      pageLevelSkillChainOverview, linearProcessShapes, prdGenerationFlowShapes,
      prototypeValidationFlowShapes, demandUnderstandingFlowShapes, comparisonMatrixShapes,
      temporaryAnswerWorkflowMatrix, assetHubSuperBrainPortal, assetHubSuperBrainPortalChrome,
      assetHubVersionTimeline, assetHubSourcePurification, assetHubWmsInboundReview,
      productBrainAssetClosureFunnel, productBrainWmsQualityGate, retainedProductBrainSmartReviewRiskGate,
      productBrainCoreValueHybrid, productBrainCoreValueSplit, productBrainPuzzleValueLoop,
      skillsEngineCoverTriad, skillsEngineAiComparisonMatrix, workflowPrdAutoGenerationFlow,
      workflowDemandUnderstandingAssistant, workflowChallengeTriadIllustrations, workflowComparisonMatrix,
      workflowCollaborationMultiplier, workflowSupplyChainTwoPanel, workflowKpiEvidence,
      workflowAssetCycleQuadrant, assetOsDemandUnderstandingAssistant, assetOsEntropyChallenge,
      assetOsHighValueAssetMatrix, assetOsTwoDimensionalFoundation, saturatedDiagramTextShapes,
      semanticCycleDiagramShapes, assetOsFlowActive, denseComplexDiagramScaffoldShapes,
      twoPanelDiagramTextShapes, topComplexDiagramTextShapes, shiftLeftDebuggerDiagram,
      toolIslandTransitionMatrix, retainedKpiEvidenceTextShapes, valueQuadrantShapes,
      reviewRiskGateFlowShapes, funnelHubDiagramShapes, horizontalStepChainShapes,
      genericNodeDiagramSkeletonShapes, visualClusterStackShapes, wmsRouteChainShapes,
      retainedCollaborationFlowShapes, stackedArchitectureDiagram, toolGapPlatformDiagram,
      processWithScreenshotsFlow, textAnchoredProcessNetwork, documentVersionGovernance,
      documentVersionFolderFlow, assetOsFlow, prototypeGenerationLoop,
      assetOsKpiBenefit, scaleLandingEvidence, fourStepLandingPath,
      valueQuadrantGems, portalPlatformDiagram, systemMapDiagram,
      systemMapFidelityChrome, stickySketchResidualNativeShapes, funnelHubResidualNativeShapes,
      structuredIllustrationResidualLineShapes, structuredIllustrationResidualIconShapes, tableMatrixResidualObjects,
      structuredIllustrationCardTitleWarningShapes, structuredIllustrationProcessingWarningShapes, structuredIllustrationResidualSketchLineShapes,
      structuredIllustrationGearPersonShapes, structuredIllustrationCardVisualAtomShapes, structuredIllustrationOutputDocumentShapes,
      structuredIllustrationInputDocumentShapes, structuredIllustrationInputChaosGlyphObjects, entropyFragmentShapes,
      entropyIslandShapes, entropyChallengeAnnotations, entropyChallengeFooterShapes,
      retainedVisualAtomNativeShapes, structuredIllustrationCardChromeShapes, retainedComponentTemplateNativeShapes,
      assetHubCycleIllustration, inputOutputSplitDiagram, cliScaffoldGenerator,
      runtimeEngineHybrid, productBrainVision, useUnderlay,
      lines, icons, slideSize,
      skillsCapabilityMatrix, demandIntakeFunnel, smartReviewBranchGate,
      skillChainOrchestration, assetLandingTriad, portalPlatformDiagramActive,
      visualOperationSyncActive, visualOperationSync, embeddedExpertScreenshotActive,
      embeddedExpertScreenshot, productManagerFrictionNetwork, temporaryAnswerWorkflowMatrixActive,
      assetOsFragmentedAssetChainActive, assetOsFragmentedAssetChain, traditionalCollaborationBreakdown,
      productBrainPuzzleValueLoopActive, productBrainWmsQualityGateActive, assetHubSuperBrainPortalProtected,
      unreadableSystemMapFidelityProtected, CLI_SCAFFOLD_GENERATOR_DETECTOR_PREFIX, RUNTIME_ENGINE_HYBRID_DETECTOR_PREFIX,
      VISUAL_OPERATION_SYNC_DETECTOR_PREFIX, EMBEDDED_EXPERT_DETECTOR_PREFIX, paradigmShiftMatrix,
      valueTransformationTable, ocrGridTable, workflowChallengeTriadActive
    } = inputs;
    pageDraft.shapes = sanitizeNativeShapes([...(documentVersionGovernanceActive ? [] : titleChromeShapes), ...retainedKpiEvidenceShapes, ...(documentVersionGovernanceActive ? [] : retainedValueBannerBackgroundShapes), ...productCollaborationChallenge.shapes, ...structuredIllustrationCardBackgroundShapes, ...(documentVersionGovernanceActive ? [] : matrixColorBlockShapes), ...(documentVersionGovernanceActive ? [] : layerColorBlockShapes), ...(documentVersionGovernanceActive ? [] : stickyNoteClusterShapes), ...(documentVersionGovernanceActive ? [] : layerConnectorShapes), ...(documentVersionGovernanceActive ? [] : layerContainerShapes), ...(documentVersionGovernanceActive ? [] : tableBackgroundShapes), ...(documentVersionGovernanceActive ? [] : textBackplateShapes), ...(documentVersionGovernanceActive ? [] : tableGridShapes), ...(documentVersionGovernanceActive ? [] : quadrantDividerShapes), ...(documentVersionGovernanceActive ? [] : networkDiagramShapes), ...(documentVersionGovernanceActive ? [] : pageLevelNetworkDiagramShapes), ...(documentVersionGovernanceActive ? [] : hierarchyDiagramShapes), ...(documentVersionGovernanceActive ? [] : triangleTopologyShapes), ...(documentVersionGovernanceActive ? [] : coverEngineCoreShapes), ...(documentVersionGovernanceActive ? [] : skillChainOverviewShapes), ...(documentVersionGovernanceActive ? [] : pageLevelSkillChainOverview.shapes), ...(documentVersionGovernanceActive ? [] : linearProcessShapes), ...(documentVersionGovernanceActive ? [] : prdGenerationFlowShapes), ...(documentVersionGovernanceActive ? [] : prototypeValidationFlowShapes), ...(documentVersionGovernanceActive ? [] : demandUnderstandingFlowShapes), ...(documentVersionGovernanceActive ? [] : comparisonMatrixShapes), ...temporaryAnswerWorkflowMatrix.shapes, ...assetHubSuperBrainPortal.shapes, ...assetHubSuperBrainPortalChrome.shapes, ...assetHubVersionTimeline.shapes, ...assetHubSourcePurification.shapes, ...assetHubWmsInboundReview.shapes, ...productBrainAssetClosureFunnel.shapes, ...productBrainWmsQualityGate.shapes, ...retainedProductBrainSmartReviewRiskGate.shapes, ...productBrainCoreValueHybrid.shapes, ...productBrainCoreValueSplit.shapes, ...productBrainPuzzleValueLoop.shapes, ...skillsEngineCoverTriad.shapes, ...skillsEngineAiComparisonMatrix.shapes, ...workflowPrdAutoGenerationFlow.shapes, ...workflowDemandUnderstandingAssistant.shapes, ...workflowChallengeTriadIllustrations.shapes, ...workflowComparisonMatrix.shapes, ...workflowCollaborationMultiplier.shapes, ...workflowSupplyChainTwoPanel.shapes, ...workflowKpiEvidence.shapes, ...workflowAssetCycleQuadrant.shapes, ...assetOsDemandUnderstandingAssistant.shapes, ...assetOsEntropyChallenge.shapes, ...assetOsHighValueAssetMatrix.shapes, ...assetOsTwoDimensionalFoundation.shapes, ...(documentVersionGovernanceActive ? [] : saturatedDiagramTextShapes), ...(documentVersionGovernanceActive ? [] : semanticCycleDiagramShapes), ...((documentVersionGovernanceActive || assetOsFlowActive) ? [] : denseComplexDiagramScaffoldShapes), ...(documentVersionGovernanceActive ? [] : twoPanelDiagramTextShapes), ...(documentVersionGovernanceActive ? [] : topComplexDiagramTextShapes), ...shiftLeftDebuggerDiagram.shapes, ...toolIslandTransitionMatrix.shapes, ...retainedKpiEvidenceTextShapes, ...(documentVersionGovernanceActive ? [] : valueQuadrantShapes), ...(documentVersionGovernanceActive ? [] : reviewRiskGateFlowShapes), ...(documentVersionGovernanceActive ? [] : funnelHubDiagramShapes), ...(documentVersionGovernanceActive ? [] : horizontalStepChainShapes), ...(documentVersionGovernanceActive ? [] : genericNodeDiagramSkeletonShapes), ...(documentVersionGovernanceActive ? [] : visualClusterStackShapes), ...(documentVersionGovernanceActive ? [] : wmsRouteChainShapes), ...retainedCollaborationFlowShapes, ...stackedArchitectureDiagram.shapes, ...toolGapPlatformDiagram.shapes, ...processWithScreenshotsFlow.shapes, ...textAnchoredProcessNetwork.shapes, ...documentVersionGovernance.shapes, ...documentVersionFolderFlow.shapes, ...assetOsFlow.shapes, ...prototypeGenerationLoop.shapes, ...assetOsKpiBenefit.shapes, ...scaleLandingEvidence.shapes, ...fourStepLandingPath.shapes, ...valueQuadrantGems.shapes, ...portalPlatformDiagram.shapes, ...systemMapDiagram.shapes, ...systemMapFidelityChrome.shapes, ...(documentVersionGovernanceActive ? [] : stickySketchResidualNativeShapes), ...(documentVersionGovernanceActive ? [] : funnelHubResidualNativeShapes), ...(documentVersionGovernanceActive ? [] : structuredIllustrationResidualLineShapes), ...(documentVersionGovernanceActive ? [] : structuredIllustrationResidualIconShapes), ...tableMatrixResidualObjects.shapes, ...structuredIllustrationCardTitleWarningShapes, ...structuredIllustrationProcessingWarningShapes, ...(documentVersionGovernanceActive ? [] : structuredIllustrationResidualSketchLineShapes), ...structuredIllustrationGearPersonShapes, ...structuredIllustrationCardVisualAtomShapes, ...structuredIllustrationOutputDocumentShapes, ...structuredIllustrationInputDocumentShapes, ...structuredIllustrationInputChaosGlyphObjects.shapes, ...entropyFragmentShapes, ...entropyIslandShapes, ...entropyChallengeAnnotations.shapes, ...entropyChallengeFooterShapes, ...(documentVersionGovernanceActive ? [] : retainedVisualAtomNativeShapes), ...structuredIllustrationCardChromeShapes, ...retainedComponentTemplateNativeShapes, ...assetHubCycleIllustration.shapes, ...inputOutputSplitDiagram.shapes, ...cliScaffoldGenerator.shapes, ...runtimeEngineHybrid.shapes, ...productBrainVision.shapes, ...(useUnderlay ? [] : lines), ...icons.shapes], slideSize);
    if (skillsCapabilityMatrix.matched) {
      pageDraft.shapes = sanitizeNativeShapes([...pageDraft.shapes, ...skillsCapabilityMatrix.shapes], slideSize);
    }
    if (demandIntakeFunnel.matched) {
      pageDraft.shapes = sanitizeNativeShapes([...pageDraft.shapes, ...demandIntakeFunnel.shapes], slideSize);
    }
    if (smartReviewBranchGate.matched) {
      pageDraft.shapes = sanitizeNativeShapes([...pageDraft.shapes, ...smartReviewBranchGate.shapes], slideSize);
    }
    if (skillChainOrchestration.matched) {
      // This page-level semantic owner replaces generic grid/atom guesses rather than layering over them.
      pageDraft.shapes = sanitizeNativeShapes(skillChainOrchestration.shapes, slideSize);
    }
    if (assetLandingTriad.matched) {
      pageDraft.shapes = sanitizeNativeShapes(assetLandingTriad.shapes, slideSize);
    }
    pageDraft.shapes = dropFalseTableOverlaysOnProtectedCollaborationDiagram(pageDraft.shapes, pageDraft.images);
    pageDraft.shapes = dropFalseTableLayersClaimedByPortalPlatform(pageDraft.shapes, portalPlatformDiagramActive);
    if (visualOperationSyncActive) {
      pageDraft.shapes = sanitizeNativeShapes([...pageDraft.shapes, ...visualOperationSync.shapes], slideSize);
    }
    if (embeddedExpertScreenshotActive) {
      pageDraft.shapes = sanitizeNativeShapes([...pageDraft.shapes, ...embeddedExpertScreenshot.shapes], slideSize);
    }
    if (productManagerFrictionNetwork.matched) {
      pageDraft.shapes = sanitizeNativeShapes([...pageDraft.shapes, ...productManagerFrictionNetwork.shapes], slideSize);
    }
    if (systemMapDiagram.shapes.length > 0) {
      pageDraft.shapes = pageDraft.shapes.filter((shape) =>
        !String(shape?.source?.detector || "").startsWith("dense-complex-diagram-native-scaffold"));
    }
    pageDraft.shapes = filterObjectsClaimedByTemporaryAnswerWorkflowTable(
      pageDraft.shapes,
      temporaryAnswerWorkflowMatrix,
      temporaryAnswerWorkflowMatrixActive
    );
    if (assetOsFragmentedAssetChainActive) {
      pageDraft.shapes = sanitizeNativeShapes(assetOsFragmentedAssetChain.shapes, slideSize);
    }
    if (traditionalCollaborationBreakdown.shapes.length > 0) {
      pageDraft.shapes = sanitizeNativeShapes([...pageDraft.shapes, ...traditionalCollaborationBreakdown.shapes], slideSize);
    }
    const productBrainCoreValueHybridActive = productBrainCoreValueHybrid.shapes.length > 0;
    const productBrainSmartReviewRiskGateActive = retainedProductBrainSmartReviewRiskGate.shapes.length > 0;
    if (productBrainSmartReviewRiskGateActive) {
      pageDraft.shapes = pageDraft.shapes.filter((shape) => !["title-accent", "sampled-text-backplate"].includes(String(shape?.source?.detector || "")));
    }
    if (productBrainCoreValueHybridActive) {
      pageDraft.shapes = pageDraft.shapes.filter((shape) => String(shape?.source?.detector || "").startsWith("product-brain-core-value-native-"));
    }
    if (productBrainPuzzleValueLoopActive) {
      pageDraft.shapes = pageDraft.shapes.filter((shape) => String(shape?.source?.detector || "").startsWith("product-brain-puzzle-value-native-"));
    }
    if (productBrainWmsQualityGateActive) {
      pageDraft.shapes = pageDraft.shapes.filter((shape) => String(shape?.source?.detector || "").startsWith("product-brain-wms-quality-native-"));
    }
    if (assetHubSuperBrainPortalProtected) {
      pageDraft.shapes = pageDraft.shapes.filter((shape) =>
        /^asset-hub-super-brain-portal-(?:chrome|callout)(?:-|$)/.test(String(shape?.source?.detector || ""))
      );
    }
    if (assetHubWmsInboundReview.shapes.length > 0) {
      pageDraft.shapes = pageDraft.shapes.filter((shape) =>
        String(shape?.source?.detector || "").startsWith("asset-hub-wms-review-native-"));
    }
    if (unreadableSystemMapFidelityProtected) {
      pageDraft.shapes = pageDraft.shapes.filter((shape) => String(shape?.source?.detector || "").startsWith("system-map-fidelity-chrome-"));
    }
    const traditionalCollaborationBreakdownActive = traditionalCollaborationBreakdown.shapes.length > 0;
    if (traditionalCollaborationBreakdownActive) {
      pageDraft.shapes = pageDraft.shapes.filter((shape) => String(shape?.source?.detector || "").startsWith("traditional-collaboration-breakdown-native-"));
    }
    pageDraft.shapes = filterShapesClaimedByToolIslandTransitionMatrix(
      pageDraft.shapes,
      toolIslandTransitionMatrix.shapes.length > 0
    );
    if (cliScaffoldGenerator.matched) {
      pageDraft.shapes = pageDraft.shapes.filter((shape) => String(shape?.source?.detector || "").startsWith(CLI_SCAFFOLD_GENERATOR_DETECTOR_PREFIX));
    }
    if (runtimeEngineHybrid.matched) {
      pageDraft.shapes = pageDraft.shapes.filter((shape) => String(shape?.source?.detector || "").startsWith(RUNTIME_ENGINE_HYBRID_DETECTOR_PREFIX));
    }
    if (visualOperationSyncActive) {
      pageDraft.shapes = pageDraft.shapes.filter((shape) => String(shape?.source?.detector || "").startsWith(VISUAL_OPERATION_SYNC_DETECTOR_PREFIX));
    }
    if (embeddedExpertScreenshotActive) {
      pageDraft.shapes = pageDraft.shapes.filter((shape) => String(shape?.source?.detector || "").startsWith(EMBEDDED_EXPERT_DETECTOR_PREFIX));
    }
    if (paradigmShiftMatrix.matched) {
      pageDraft.shapes = [...paradigmShiftMatrix.shapes];
    }
    if (valueTransformationTable.matched) {
      pageDraft.shapes = [];
    }
    if (ocrGridTable.matched) {
      pageDraft.shapes = [...ocrGridTable.shapes];
    }
    pageDraft.shapes = suppressGenericStructuredIllustrationObjectsForSpecialist(
      pageDraft.shapes,
      workflowChallengeTriadActive
    );
    pageDraft.shapes = arbitrateSparseFlowCardChainNativeOwnership(pageDraft.shapes);
    const shapeOwnershipArbitration = arbitrateNativeObjectOwnership(pageDraft.shapes);
    pageDraft.shapes = shapeOwnershipArbitration.items;
    pageDraft.shapes = promoteOrthogonalConnectorRoutes(pageDraft.shapes);
    return { shapeOwnershipArbitration, productBrainCoreValueHybridActive, traditionalCollaborationBreakdownActive };
  };
}
module.exports = { createPageShapeFinalizer };
