"use strict";
// @ts-check
/** @typedef {{[key: string]: unknown, id?: unknown, text?: unknown, source?: {detector?: unknown}}} Item */
/** @typedef {{shapes: Item[], textBoxes: Item[], matched?: boolean, layout?: unknown}} Producer */
/** @typedef {{items: Item[], dropped: unknown[], claims: unknown[]}} Arbitration */
/** @typedef {Record<"retainedComponentBackfillFilteredNativeTextBoxes"|"retainedComponentBackfillFilteredDiagramTextBoxes"|"retainedComponentTemplateNativeTextBoxes"|"tableZoneSemanticTextBoxes"|"visualClusterStackShapes"|"coverEngineCoreShapes"|"semanticCycleFidelityCrops", Item[]> & Record<"skillChainOverviewActive"|"assetOsFlowActive"|"portalPlatformDiagramActive"|"visualOperationSyncActive"|"temporaryAnswerWorkflowMatrixActive"|"assetOsFragmentedAssetChainActive"|"productBrainAssetClosureFunnelActive"|"stackedArchitectureDiagramActive"|"documentVersionGovernanceActive"|"productBrainCoreValueHybridActive"|"productBrainPuzzleValueLoopActive"|"productBrainWmsQualityGateActive"|"assetHubSuperBrainPortalProtected"|"traditionalCollaborationBreakdownActive"|"unreadableSystemMapFidelityProtected"|"workflowChallengeTriadActive", boolean> & Record<"traditionalCollaborationBreakdown"|"productCollaborationChallenge"|"pageLevelSkillChainOverview"|"stackedArchitectureDiagram"|"toolGapPlatformDiagram"|"processWithScreenshotsFlow"|"textAnchoredProcessNetwork"|"documentVersionGovernance"|"documentVersionFolderFlow"|"assetOsFlow"|"assetOsKpiBenefit"|"scaleLandingEvidence"|"fourStepLandingPath"|"valueQuadrantGems"|"temporaryAnswerWorkflowMatrix"|"assetHubSuperBrainPortal"|"assetHubSuperBrainPortalChrome"|"assetHubVersionTimeline"|"assetHubSourcePurification"|"assetHubWmsInboundReview"|"productBrainAssetClosureFunnel"|"productBrainWmsQualityGate"|"retainedProductBrainSmartReviewRiskGate"|"productBrainCoreValueHybrid"|"productBrainCoreValueSplit"|"productBrainPuzzleValueLoop"|"skillsEngineCoverTriad"|"skillsEngineAiComparisonMatrix"|"workflowPrdAutoGeneration"|"workflowDemandUnderstandingAssistant"|"workflowChallengeTriadIllustrations"|"workflowComparisonMatrix"|"workflowCollaborationMultiplier"|"workflowSupplyChainTwoPanel"|"workflowKpiEvidence"|"workflowAssetCycleQuadrant"|"assetOsDemandUnderstandingAssistant"|"assetOsEntropyChallenge"|"assetOsHighValueAssetMatrix"|"assetOsTwoDimensionalFoundation"|"denseComplexDiagramScaffold"|"shiftLeftDebuggerDiagram"|"toolIslandTransitionMatrix"|"portalPlatformDiagram"|"systemMapDiagram"|"assetHubCycleIllustration"|"inputOutputSplitDiagram"|"cliScaffoldGenerator"|"productBrainVision"|"tableMatrixResidualObjects"|"structuredIllustrationInputChaosGlyphObjects"|"entropyChallengeAnnotations"|"icons"|"skillsCapabilityMatrix"|"demandIntakeFunnel"|"smartReviewBranchGate"|"skillChainOrchestration"|"assetLandingTriad"|"visualOperationSync"|"paradigmShiftMatrix"|"productManagerFrictionNetwork"|"prototypeGenerationLoop"|"assetOsFragmentedAssetChain"|"runtimeEngineHybrid"|"valueTransformationTable", Producer> & {slideSize: unknown, shapeOwnershipArbitration: Arbitration, ocrGridTable: Producer & {consumedIds: string[], outsideTextBoxes: Item[]}}} Inputs */
/** @typedef {{shapes: Item[], images: Item[], textBoxes: Item[], source?: Record<string, unknown>}} Page */
/** @typedef {{
 * annotateTextBoxesWithNativeComponentGroups: (...args: unknown[]) => Item[],
 * filterTextBoxesClaimedByPortalFourLayer: (...args: unknown[]) => Item[],
 * filterSkillsCapabilityMatrixTextBoxes: (...args: unknown[]) => Item[],
 * filterDemandIntakeFunnelTextBoxes: (...args: unknown[]) => Item[],
 * filterSmartReviewBranchGateTextBoxes: (...args: unknown[]) => Item[],
 * filterSkillChainOrchestrationTextBoxes: (...args: unknown[]) => Item[],
 * filterAssetLandingTriadTextBoxes: (...args: unknown[]) => Item[],
 * filterTextBoxesClaimedByCoverEngineCore: (...args: unknown[]) => Item[],
 * filterPrdAutoGenerationDuplicateTextBoxes: (...args: unknown[]) => Item[],
 * dropFalseTableLayersClaimedByPortalPlatform: (...args: unknown[]) => Item[],
 * normalizeProductManagerFrictionNarrativeTextBoxes: (...args: unknown[]) => void,
 * annotateReviewRiskGateTextComponents: (...args: unknown[]) => Item[],
 * annotateTriangleTopologyTextComponents: (...args: unknown[]) => Item[],
 * annotatePrototypeGenerationLoopTextBoxes: (...args: unknown[]) => Item[],
 * filterObjectsClaimedByTemporaryAnswerWorkflowTable: (...args: unknown[]) => Item[],
 * normalizeTemporaryAnswerWorkflowChromeText: (...args: unknown[]) => Item[],
 * normalizeCjkText: (...args: unknown[]) => string,
 * filterTextBoxesOutsideSpecializedNativeObjects: (...args: unknown[]) => Item[],
 * filterTextBoxesConsumedByComponentTemplateBackfill: (...args: unknown[]) => Item[],
 * filterTextBoxesClaimedByProductBrainAssetClosureFunnel: (...args: unknown[]) => Item[],
 * filterTextBoxesClaimedByTriangleTopology: (...args: unknown[]) => Item[],
 * filterTextBoxesClaimedByPrdSegmentCrops: (...args: unknown[]) => Item[],
 * normalizePrdSegmentCropTextBoxes: (...args: unknown[]) => Item[],
 * dedupeTextBoxesByStableId: (...args: unknown[]) => Item[],
 * normalizeCommonOcrTextBoxLabels: (...args: unknown[]) => Item[],
 * normalizeAssetOsFlowChromeTextBoxes: (...args: unknown[]) => Item[],
 * normalizeHorizontalStepChainTextBoxes: (...args: unknown[]) => Item[],
 * normalizeCliScaffoldGeneratorTextBoxes: (...args: unknown[]) => Item[],
 * normalizeRuntimeEngineHybridTextBoxes: (...args: unknown[]) => Item[],
 * normalizeValueTransformationTextBoxes: (...args: unknown[]) => Item[],
 * normalizeStackedArchitectureChromeTextBoxes: (...args: unknown[]) => Item[],
 * filterTextBoxesClaimedByDocumentVersionGovernance: (...args: unknown[]) => Item[],
 * filterTextBoxesClaimedByProductBrainCoreValueHybrid: (...args: unknown[]) => Item[],
 * filterTextBoxesClaimedByProductBrainPuzzleValueLoop: (...args: unknown[]) => Item[],
 * filterTextBoxesClaimedByProductBrainWmsQualityGate: (...args: unknown[]) => Item[],
 * filterTextBoxesClaimedByAssetHubSuperBrainPortal: (...args: unknown[]) => Item[],
 * filterTextBoxesClaimedByTraditionalCollaborationBreakdown: (...args: unknown[]) => Item[],
 * filterTextBoxesClaimedByToolIslandTransitionMatrix: (...args: unknown[]) => Item[],
 * filterTextBoxesClaimedByInputOutputSplit: (...args: unknown[]) => Item[],
 * normalizeEntropyChallengeFooterTextBoxes: (...args: unknown[]) => Item[],
 * normalizeSystemMapChromeTextBoxes: (...args: unknown[]) => Item[],
 * filterTextBoxesClaimedBySystemMapFidelityCrop: (...args: unknown[]) => Item[],
 * normalizeAssetOsKpiBenefitTextBoxes: (...args: unknown[]) => Item[],
 * normalizeAssetOsHighValueAssetMatrixTextBoxes: (...args: unknown[]) => Item[],
 * filterTextBoxesClaimedByAssetOsClosedLoop: (...args: unknown[]) => Item[],
 * filterTextBoxesForGraphicUnderlays: (...args: unknown[]) => Item[],
 * fitHighConfidenceSingleLineOcrToEvidence: (...args: unknown[]) => Item[],
 * suppressGenericStructuredIllustrationObjectsForSpecialist: (...args: unknown[]) => Item[],
 * arbitrateSparseFlowCardChainNativeOwnership: (...args: unknown[]) => Item[],
 * arbitrateNativeObjectOwnership: (...args: unknown[]) => Arbitration,
 * normalizeTextBoxFontWeights: (...args: unknown[]) => Item[],
 * normalizeTriangleTopologyFinalTypography: (...args: unknown[]) => Item[]
 * }} Operations */

/** Owns ordered final text production, filtering and ownership metadata.
 * Input documents are parsed upstream; this stage consumes internal producer results.
 * @param {Operations} operations */
function createPageTextFinalizer(operations) {
  const {
    annotateTextBoxesWithNativeComponentGroups, filterTextBoxesClaimedByPortalFourLayer, filterSkillsCapabilityMatrixTextBoxes,
    filterDemandIntakeFunnelTextBoxes, filterSmartReviewBranchGateTextBoxes, filterSkillChainOrchestrationTextBoxes,
    filterAssetLandingTriadTextBoxes, filterTextBoxesClaimedByCoverEngineCore, filterPrdAutoGenerationDuplicateTextBoxes,
    dropFalseTableLayersClaimedByPortalPlatform, normalizeProductManagerFrictionNarrativeTextBoxes, annotateReviewRiskGateTextComponents,
    annotateTriangleTopologyTextComponents, annotatePrototypeGenerationLoopTextBoxes, filterObjectsClaimedByTemporaryAnswerWorkflowTable,
    normalizeTemporaryAnswerWorkflowChromeText, normalizeCjkText, filterTextBoxesOutsideSpecializedNativeObjects,
    filterTextBoxesConsumedByComponentTemplateBackfill, filterTextBoxesClaimedByProductBrainAssetClosureFunnel, filterTextBoxesClaimedByTriangleTopology,
    filterTextBoxesClaimedByPrdSegmentCrops, normalizePrdSegmentCropTextBoxes, dedupeTextBoxesByStableId,
    normalizeCommonOcrTextBoxLabels, normalizeAssetOsFlowChromeTextBoxes, normalizeHorizontalStepChainTextBoxes,
    normalizeCliScaffoldGeneratorTextBoxes, normalizeRuntimeEngineHybridTextBoxes, normalizeValueTransformationTextBoxes,
    normalizeStackedArchitectureChromeTextBoxes, filterTextBoxesClaimedByDocumentVersionGovernance, filterTextBoxesClaimedByProductBrainCoreValueHybrid,
    filterTextBoxesClaimedByProductBrainPuzzleValueLoop, filterTextBoxesClaimedByProductBrainWmsQualityGate, filterTextBoxesClaimedByAssetHubSuperBrainPortal,
    filterTextBoxesClaimedByTraditionalCollaborationBreakdown, filterTextBoxesClaimedByToolIslandTransitionMatrix, filterTextBoxesClaimedByInputOutputSplit,
    normalizeEntropyChallengeFooterTextBoxes, normalizeSystemMapChromeTextBoxes, filterTextBoxesClaimedBySystemMapFidelityCrop,
    normalizeAssetOsKpiBenefitTextBoxes, normalizeAssetOsHighValueAssetMatrixTextBoxes, filterTextBoxesClaimedByAssetOsClosedLoop,
    filterTextBoxesForGraphicUnderlays, fitHighConfidenceSingleLineOcrToEvidence, suppressGenericStructuredIllustrationObjectsForSpecialist,
    arbitrateSparseFlowCardChainNativeOwnership, arbitrateNativeObjectOwnership, normalizeTextBoxFontWeights,
    normalizeTriangleTopologyFinalTypography
  } = operations;
  const required = [
    annotateTextBoxesWithNativeComponentGroups, filterTextBoxesClaimedByPortalFourLayer, filterSkillsCapabilityMatrixTextBoxes,
    filterDemandIntakeFunnelTextBoxes, filterSmartReviewBranchGateTextBoxes, filterSkillChainOrchestrationTextBoxes,
    filterAssetLandingTriadTextBoxes, filterTextBoxesClaimedByCoverEngineCore, filterPrdAutoGenerationDuplicateTextBoxes,
    dropFalseTableLayersClaimedByPortalPlatform, normalizeProductManagerFrictionNarrativeTextBoxes, annotateReviewRiskGateTextComponents,
    annotateTriangleTopologyTextComponents, annotatePrototypeGenerationLoopTextBoxes, filterObjectsClaimedByTemporaryAnswerWorkflowTable,
    normalizeTemporaryAnswerWorkflowChromeText, normalizeCjkText, filterTextBoxesOutsideSpecializedNativeObjects,
    filterTextBoxesConsumedByComponentTemplateBackfill, filterTextBoxesClaimedByProductBrainAssetClosureFunnel, filterTextBoxesClaimedByTriangleTopology,
    filterTextBoxesClaimedByPrdSegmentCrops, normalizePrdSegmentCropTextBoxes, dedupeTextBoxesByStableId,
    normalizeCommonOcrTextBoxLabels, normalizeAssetOsFlowChromeTextBoxes, normalizeHorizontalStepChainTextBoxes,
    normalizeCliScaffoldGeneratorTextBoxes, normalizeRuntimeEngineHybridTextBoxes, normalizeValueTransformationTextBoxes,
    normalizeStackedArchitectureChromeTextBoxes, filterTextBoxesClaimedByDocumentVersionGovernance, filterTextBoxesClaimedByProductBrainCoreValueHybrid,
    filterTextBoxesClaimedByProductBrainPuzzleValueLoop, filterTextBoxesClaimedByProductBrainWmsQualityGate, filterTextBoxesClaimedByAssetHubSuperBrainPortal,
    filterTextBoxesClaimedByTraditionalCollaborationBreakdown, filterTextBoxesClaimedByToolIslandTransitionMatrix, filterTextBoxesClaimedByInputOutputSplit,
    normalizeEntropyChallengeFooterTextBoxes, normalizeSystemMapChromeTextBoxes, filterTextBoxesClaimedBySystemMapFidelityCrop,
    normalizeAssetOsKpiBenefitTextBoxes, normalizeAssetOsHighValueAssetMatrixTextBoxes, filterTextBoxesClaimedByAssetOsClosedLoop,
    filterTextBoxesForGraphicUnderlays, fitHighConfidenceSingleLineOcrToEvidence, suppressGenericStructuredIllustrationObjectsForSpecialist,
    arbitrateSparseFlowCardChainNativeOwnership, arbitrateNativeObjectOwnership, normalizeTextBoxFontWeights,
    normalizeTriangleTopologyFinalTypography
  ];
  if (required.some(operation => typeof operation !== "function")) throw new TypeError("page text finalizer operations are incomplete");
  /** @param {Page} pageDraft @param {Inputs} inputs */
  return function finalizePageText(pageDraft, inputs) {
    const {
      retainedComponentBackfillFilteredNativeTextBoxes, retainedComponentBackfillFilteredDiagramTextBoxes, retainedComponentTemplateNativeTextBoxes,
      tableZoneSemanticTextBoxes, traditionalCollaborationBreakdown, productCollaborationChallenge,
      pageLevelSkillChainOverview, stackedArchitectureDiagram, toolGapPlatformDiagram,
      processWithScreenshotsFlow, textAnchoredProcessNetwork, documentVersionGovernance,
      documentVersionFolderFlow, assetOsFlow, assetOsKpiBenefit,
      scaleLandingEvidence, fourStepLandingPath, valueQuadrantGems,
      temporaryAnswerWorkflowMatrix, assetHubSuperBrainPortal, assetHubSuperBrainPortalChrome,
      assetHubVersionTimeline, assetHubSourcePurification, assetHubWmsInboundReview,
      productBrainAssetClosureFunnel, productBrainWmsQualityGate, retainedProductBrainSmartReviewRiskGate,
      productBrainCoreValueHybrid, productBrainCoreValueSplit, productBrainPuzzleValueLoop,
      skillsEngineCoverTriad, skillsEngineAiComparisonMatrix, workflowPrdAutoGeneration,
      workflowDemandUnderstandingAssistant, workflowChallengeTriadIllustrations, workflowComparisonMatrix,
      workflowCollaborationMultiplier, workflowSupplyChainTwoPanel, workflowKpiEvidence,
      workflowAssetCycleQuadrant, assetOsDemandUnderstandingAssistant, assetOsEntropyChallenge,
      assetOsHighValueAssetMatrix, assetOsTwoDimensionalFoundation, skillChainOverviewActive,
      assetOsFlowActive, denseComplexDiagramScaffold, shiftLeftDebuggerDiagram,
      toolIslandTransitionMatrix, portalPlatformDiagram, systemMapDiagram,
      assetHubCycleIllustration, inputOutputSplitDiagram, cliScaffoldGenerator,
      productBrainVision, tableMatrixResidualObjects, structuredIllustrationInputChaosGlyphObjects,
      entropyChallengeAnnotations, icons, skillsCapabilityMatrix,
      demandIntakeFunnel, smartReviewBranchGate, skillChainOrchestration,
      assetLandingTriad, visualClusterStackShapes, coverEngineCoreShapes,
      portalPlatformDiagramActive, visualOperationSyncActive, visualOperationSync,
      paradigmShiftMatrix, productManagerFrictionNetwork, slideSize,
      ocrGridTable, prototypeGenerationLoop, temporaryAnswerWorkflowMatrixActive,
      assetOsFragmentedAssetChainActive, assetOsFragmentedAssetChain, productBrainAssetClosureFunnelActive,
      runtimeEngineHybrid, valueTransformationTable, stackedArchitectureDiagramActive,
      documentVersionGovernanceActive, productBrainCoreValueHybridActive, productBrainPuzzleValueLoopActive,
      productBrainWmsQualityGateActive, assetHubSuperBrainPortalProtected, traditionalCollaborationBreakdownActive,
      unreadableSystemMapFidelityProtected, semanticCycleFidelityCrops, workflowChallengeTriadActive,
      shapeOwnershipArbitration
    } = inputs;
    pageDraft.textBoxes = annotateTextBoxesWithNativeComponentGroups(
      [...retainedComponentBackfillFilteredNativeTextBoxes, ...retainedComponentBackfillFilteredDiagramTextBoxes, ...retainedComponentTemplateNativeTextBoxes, ...tableZoneSemanticTextBoxes, ...traditionalCollaborationBreakdown.textBoxes, ...productCollaborationChallenge.textBoxes, ...pageLevelSkillChainOverview.textBoxes, ...stackedArchitectureDiagram.textBoxes, ...toolGapPlatformDiagram.textBoxes, ...processWithScreenshotsFlow.textBoxes, ...textAnchoredProcessNetwork.textBoxes, ...documentVersionGovernance.textBoxes, ...documentVersionFolderFlow.textBoxes, ...assetOsFlow.textBoxes, ...assetOsKpiBenefit.textBoxes, ...scaleLandingEvidence.textBoxes, ...fourStepLandingPath.textBoxes, ...valueQuadrantGems.textBoxes, ...temporaryAnswerWorkflowMatrix.textBoxes, ...assetHubSuperBrainPortal.textBoxes, ...assetHubSuperBrainPortalChrome.textBoxes, ...assetHubVersionTimeline.textBoxes, ...assetHubSourcePurification.textBoxes, ...assetHubWmsInboundReview.textBoxes, ...productBrainAssetClosureFunnel.textBoxes, ...productBrainWmsQualityGate.textBoxes, ...retainedProductBrainSmartReviewRiskGate.textBoxes, ...productBrainCoreValueHybrid.textBoxes, ...productBrainCoreValueSplit.textBoxes, ...productBrainPuzzleValueLoop.textBoxes, ...skillsEngineCoverTriad.textBoxes, ...skillsEngineAiComparisonMatrix.textBoxes, ...workflowPrdAutoGeneration.textBoxes, ...workflowDemandUnderstandingAssistant.textBoxes, ...workflowChallengeTriadIllustrations.textBoxes, ...workflowComparisonMatrix.textBoxes, ...workflowCollaborationMultiplier.textBoxes, ...workflowSupplyChainTwoPanel.textBoxes, ...workflowKpiEvidence.textBoxes, ...workflowAssetCycleQuadrant.textBoxes, ...assetOsDemandUnderstandingAssistant.textBoxes, ...assetOsEntropyChallenge.textBoxes, ...assetOsHighValueAssetMatrix.textBoxes, ...assetOsTwoDimensionalFoundation.textBoxes, ...((skillChainOverviewActive || assetOsFlowActive) ? [] : denseComplexDiagramScaffold.textBoxes), ...shiftLeftDebuggerDiagram.textBoxes, ...toolIslandTransitionMatrix.textBoxes, ...portalPlatformDiagram.textBoxes, ...systemMapDiagram.textBoxes, ...assetHubCycleIllustration.textBoxes, ...inputOutputSplitDiagram.textBoxes, ...cliScaffoldGenerator.textBoxes, ...productBrainVision.textBoxes, ...tableMatrixResidualObjects.textBoxes, ...structuredIllustrationInputChaosGlyphObjects.textBoxes, ...entropyChallengeAnnotations.textBoxes, ...icons.textBoxes],
      pageDraft.shapes
    );
    if (skillsCapabilityMatrix.matched) {
      pageDraft.textBoxes.push(...skillsCapabilityMatrix.textBoxes);
    }
    if (demandIntakeFunnel.matched) {
      pageDraft.textBoxes.push(...demandIntakeFunnel.textBoxes);
    }
    if (smartReviewBranchGate.matched) {
      pageDraft.textBoxes.push(...smartReviewBranchGate.textBoxes);
    }
    if (skillChainOrchestration.matched) {
      pageDraft.textBoxes.push(...skillChainOrchestration.textBoxes);
    }
    if (assetLandingTriad.matched) {
      pageDraft.textBoxes.push(...assetLandingTriad.textBoxes);
    }
    pageDraft.textBoxes = filterTextBoxesClaimedByPortalFourLayer(pageDraft.textBoxes, visualClusterStackShapes);
    pageDraft.textBoxes = filterSkillsCapabilityMatrixTextBoxes(pageDraft.textBoxes, skillsCapabilityMatrix.matched);
    pageDraft.textBoxes = filterDemandIntakeFunnelTextBoxes(pageDraft.textBoxes, demandIntakeFunnel.matched);
    pageDraft.textBoxes = filterSmartReviewBranchGateTextBoxes(pageDraft.textBoxes, smartReviewBranchGate.matched);
    pageDraft.textBoxes = filterSkillChainOrchestrationTextBoxes(pageDraft.textBoxes, skillChainOrchestration.matched);
    pageDraft.textBoxes = filterAssetLandingTriadTextBoxes(pageDraft.textBoxes, assetLandingTriad.matched);
    pageDraft.textBoxes = filterTextBoxesClaimedByCoverEngineCore(pageDraft.textBoxes, coverEngineCoreShapes.length > 0);
    pageDraft.textBoxes = filterPrdAutoGenerationDuplicateTextBoxes(pageDraft.textBoxes);
    pageDraft.textBoxes = dropFalseTableLayersClaimedByPortalPlatform(pageDraft.textBoxes, portalPlatformDiagramActive);
    if (visualOperationSyncActive) {
      pageDraft.textBoxes = [...visualOperationSync.textBoxes];
    }
    if (paradigmShiftMatrix.matched) {
      pageDraft.textBoxes = [...paradigmShiftMatrix.textBoxes];
    }
    if (productManagerFrictionNetwork.matched) {
      pageDraft.textBoxes.push(...productManagerFrictionNetwork.textBoxes);
      normalizeProductManagerFrictionNarrativeTextBoxes(pageDraft.textBoxes, slideSize);
    }
    if (systemMapDiagram.shapes.length > 0) {
      pageDraft.textBoxes = pageDraft.textBoxes.filter((textBox) =>
        !String(textBox?.source?.detector || "").startsWith("dense-complex-diagram-native-scaffold"));
    }
    pageDraft.textBoxes = annotateReviewRiskGateTextComponents(pageDraft.textBoxes, pageDraft.shapes, pageDraft.images);
    if (ocrGridTable.matched) {
      const consumedIds = new Set(ocrGridTable.consumedIds);
      pageDraft.textBoxes = [
        ...pageDraft.textBoxes.filter((item) => !consumedIds.has(String(item?.id || ""))),
        ...ocrGridTable.outsideTextBoxes
      ];
    }
    pageDraft.textBoxes = annotateTriangleTopologyTextComponents(pageDraft.textBoxes, pageDraft.shapes, pageDraft.images);
    pageDraft.textBoxes = annotatePrototypeGenerationLoopTextBoxes(pageDraft.textBoxes, prototypeGenerationLoop.matched);
    pageDraft.textBoxes = filterObjectsClaimedByTemporaryAnswerWorkflowTable(
      pageDraft.textBoxes,
      temporaryAnswerWorkflowMatrix,
      temporaryAnswerWorkflowMatrixActive
    );
    pageDraft.textBoxes = normalizeTemporaryAnswerWorkflowChromeText(
      pageDraft.textBoxes,
      temporaryAnswerWorkflowMatrixActive
    );
    if (assetOsFragmentedAssetChainActive) {
      const claimedFragmentedText = new Set(assetOsFragmentedAssetChain.textBoxes.map((item) => normalizeCjkText(item?.text)));
      pageDraft.textBoxes = [
        ...filterTextBoxesOutsideSpecializedNativeObjects(pageDraft.textBoxes, [assetOsFragmentedAssetChain])
          .filter((item) => !claimedFragmentedText.has(normalizeCjkText(item?.text))),
        ...assetOsFragmentedAssetChain.textBoxes
      ];
    }
    pageDraft.textBoxes = filterTextBoxesConsumedByComponentTemplateBackfill(pageDraft.textBoxes, retainedComponentTemplateNativeTextBoxes);
    pageDraft.textBoxes = filterTextBoxesClaimedByProductBrainAssetClosureFunnel(
      pageDraft.textBoxes,
      productBrainAssetClosureFunnelActive
    );
    pageDraft.textBoxes = filterTextBoxesClaimedByTriangleTopology(pageDraft.textBoxes, pageDraft.images);
    pageDraft.textBoxes = filterTextBoxesClaimedByPrdSegmentCrops(pageDraft.textBoxes, pageDraft.images);
    pageDraft.textBoxes = normalizePrdSegmentCropTextBoxes(pageDraft.textBoxes, pageDraft.images);
    pageDraft.textBoxes = dedupeTextBoxesByStableId(pageDraft.textBoxes);
    pageDraft.textBoxes = normalizeCommonOcrTextBoxLabels(pageDraft.textBoxes);
    pageDraft.textBoxes = normalizeAssetOsFlowChromeTextBoxes(pageDraft.textBoxes, assetOsFlowActive);
    pageDraft.textBoxes = normalizeHorizontalStepChainTextBoxes(pageDraft.textBoxes, pageDraft.shapes);
    pageDraft.textBoxes = normalizeCliScaffoldGeneratorTextBoxes(
      pageDraft.textBoxes,
      cliScaffoldGenerator.matched,
      cliScaffoldGenerator.layout
    );
    pageDraft.textBoxes = normalizeRuntimeEngineHybridTextBoxes(pageDraft.textBoxes, runtimeEngineHybrid.matched);
    pageDraft.textBoxes = normalizeValueTransformationTextBoxes(pageDraft.textBoxes, valueTransformationTable);
    pageDraft.textBoxes = normalizeStackedArchitectureChromeTextBoxes(pageDraft.textBoxes, stackedArchitectureDiagramActive);
    pageDraft.textBoxes = filterTextBoxesClaimedByDocumentVersionGovernance(pageDraft.textBoxes, documentVersionGovernanceActive);
    pageDraft.textBoxes = filterTextBoxesClaimedByProductBrainCoreValueHybrid(pageDraft.textBoxes, productBrainCoreValueHybridActive);
    pageDraft.textBoxes = filterTextBoxesClaimedByProductBrainPuzzleValueLoop(pageDraft.textBoxes, productBrainPuzzleValueLoopActive);
    pageDraft.textBoxes = filterTextBoxesClaimedByProductBrainWmsQualityGate(pageDraft.textBoxes, productBrainWmsQualityGateActive);
    pageDraft.textBoxes = filterTextBoxesClaimedByAssetHubSuperBrainPortal(pageDraft.textBoxes, pageDraft.images, assetHubSuperBrainPortalProtected);
    pageDraft.textBoxes = filterTextBoxesClaimedByTraditionalCollaborationBreakdown(pageDraft.textBoxes, traditionalCollaborationBreakdownActive);
    pageDraft.textBoxes = filterTextBoxesClaimedByToolIslandTransitionMatrix(
      pageDraft.textBoxes,
      toolIslandTransitionMatrix.shapes.length > 0
    );
    pageDraft.textBoxes = filterTextBoxesClaimedByInputOutputSplit(
      pageDraft.textBoxes,
      inputOutputSplitDiagram.shapes.length > 0
    );
    pageDraft.textBoxes = normalizeEntropyChallengeFooterTextBoxes(pageDraft.textBoxes, slideSize);
    pageDraft.textBoxes = normalizeSystemMapChromeTextBoxes(pageDraft.textBoxes, slideSize, {
      preserveSourceTitleBox: unreadableSystemMapFidelityProtected
    });
    pageDraft.textBoxes = filterTextBoxesClaimedBySystemMapFidelityCrop(
      pageDraft.textBoxes,
      pageDraft.images,
      unreadableSystemMapFidelityProtected
    );
    pageDraft.textBoxes = normalizeAssetOsKpiBenefitTextBoxes(pageDraft.textBoxes);
    pageDraft.textBoxes = normalizeAssetOsHighValueAssetMatrixTextBoxes(pageDraft.textBoxes);
    pageDraft.textBoxes = filterTextBoxesClaimedByAssetOsClosedLoop(pageDraft.textBoxes, assetHubCycleIllustration.shapes, slideSize, pageDraft.images);
    // Diagram-label metadata is collected before specialized diagrams are
    // materialized. Remove the late backfill only after every text producer
    // has run, while retaining labels outside the protected crop.
    pageDraft.textBoxes = filterTextBoxesForGraphicUnderlays(pageDraft.textBoxes, semanticCycleFidelityCrops);
    pageDraft.textBoxes = fitHighConfidenceSingleLineOcrToEvidence(pageDraft.textBoxes);
    pageDraft.textBoxes = suppressGenericStructuredIllustrationObjectsForSpecialist(
      pageDraft.textBoxes,
      workflowChallengeTriadActive
    );
    pageDraft.textBoxes = arbitrateSparseFlowCardChainNativeOwnership(pageDraft.textBoxes);
    const textOwnershipArbitration = arbitrateNativeObjectOwnership(pageDraft.textBoxes);
    pageDraft.textBoxes = textOwnershipArbitration.items;
    pageDraft.source = {
      ...(pageDraft.source || {}),
      nativeOwnershipArbitration: {
        droppedShapes: shapeOwnershipArbitration.dropped,
        droppedTextBoxes: textOwnershipArbitration.dropped,
        droppedShapeCount: shapeOwnershipArbitration.dropped.length,
        droppedTextBoxCount: textOwnershipArbitration.dropped.length,
        claimCount: shapeOwnershipArbitration.claims.length + textOwnershipArbitration.claims.length
      }
    };
    pageDraft.textBoxes = normalizeTextBoxFontWeights(pageDraft.textBoxes);
    pageDraft.textBoxes = normalizeTriangleTopologyFinalTypography(pageDraft.textBoxes);
    return pageDraft;
  };
}
module.exports = { createPageTextFinalizer };
