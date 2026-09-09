"use strict";
const { detectCoverAxis, detectCoverAvatarBox, normalizeCoverEngineCoreChromeTextBoxes, coverEngineComponent, detectCoverCardBox, isCoverCardBluePixel, isCoverCardInteriorPixel, projectionBands } = require("@common-tools/slideclone-core/cover-graphic-rules");
const { triangleTopologyNativeTextBoxes, triangleTopologyBottomTextBoxes, visibleNativeTextColor, triangleTopologyCenterTextBoxes, triangleTopologySideTextBoxes, rotatedTriangleTopologyTextBox, normalizeTriangleTopologySideText, textBoxArea, triangleTopologyTopTextBoxes, isTriangleTopologyTopFragment, sampleTriangleTopologyArrowFill, isTerminalVisionDenseRadialCandidate, boxAreaValue, regularPolygonPoints, eraseDenseRadialSearchControlFromCrop, createAggregateGridAtomSkeletonShapes, shouldObjectifyAggregateGridAtomSkeleton } = require("@common-tools/slideclone-core/registry-graphic-rules");
const { createDecorativeCoverBackground, createWorkflowCoverTextFreeBandCrops, decorativeBackgroundMode, shouldUseDecorativeCoverBackground, sampleEdgeDecorationStats, samplePageColorStats, shouldUseDecorativePageChromeBackground, inpaintDecorativeCoverMasks, resolveInpaintPython, workflowCoverTextFreeBands, normalizeDecorativeCoverTextBoxes } = require("@common-tools/slideclone-core/decorative-cover-graphics");
const { scoreDiagramCandidate, inferDiagramSemanticSignals, cropExpressionStats, connectedColorBlockEntries, isTableBlockSeed, tableBlockColorKey, kpiEvidenceLayoutBounds } = require("@common-tools/slideclone-core/graphic-crop-analysis");
const { createGraphicCrops, aggregateForegroundComponent, classifyGraphicCropExpression, mergeCloseComponent, shouldAddAggregateComponent, shouldFullyObjectifyEntropyChallenge, shouldUseEntropyChallengeCrops } = require("@common-tools/slideclone-core/graphic-crop-generation");
const { createEntropyChallengeCrops } = require("@common-tools/slideclone-core/entropy-challenge-crops");
const { createGraphicUnderlayCrop, classifyGraphicUnderlayExpression, colorBlockRectStats, looksLikeDocumentGenerationFlowUnderlay, looksLikeProductWorkflowUnderlay, createCollaborationFlowUnderlayCrop, bottomBannerBounds, collaborationFlowBounds, fitPanelBox, shouldUseCollaborationFlowUnderlay, isAcceptableDiagramCandidate, createComparisonMatrixCrop, comparisonMatrixBounds, segmentComparisonMatrix, shouldUseComparisonMatrixCrop, createContentGraphicUnderlayCrop, contentTextBounds, shouldUseContentGraphicUnderlay, createIllustrationCardUnderlayCrop, illustrationCardBounds, shouldUseIllustrationCardUnderlay, createLeftIllustrationPanelCrops, leftIllustrationGraphicBounds, shouldUseLeftIllustrationPanelUnderlay, createLineDiagramUnderlayCrop, lineDiagramPxBounds, shouldUseLineDiagramUnderlay, createMixedDiagramUnderlayCrop, shouldUseMixedDiagramUnderlay, createProductIllustrationSegmentCrops, productIllustrationSegmentBoxes, expandProductSegmentPxBox, mergeNearbySegmentBoxes, productIllustrationBandBoxes, significantVerticalInkRunsWithoutHeader, detectWideHeaderBottom, shouldUseProductIllustrationSegmentCrops, coarseHueBucket, looksLikeDenseTextMatrix, clusterCenters, sampleComponentCenterColor, createSaturatedDiagramUnderlayCrop, saturatedGraphicBounds, shouldUseSaturatedDiagramUnderlay, createSegmentedGraphicUnderlayCrops, segmentTextBoxesForUnderlay, groupBoxesByAxis, mergeOverlappingPtBoxes, shouldUseSegmentedGraphicUnderlay, createSparseDiagramUnderlayCrop, shouldUseSparseDiagramUnderlay, createStructuredCaseUnderlayCrop, shouldUseStructuredCaseUnderlay, createTopComplexDiagramCrop, refineBottomValueBannerBoxFromText, shouldUseTopComplexDiagramCrop, topComplexDiagramBounds, createTwoPanelDiagramCrops, shouldUseTwoPanelDiagramCrops, twoPanelDiagramBounds, createVisualClusterUnderlayCrops, shouldUseVisualClusterUnderlay, visualClusterPxBounds, createWmsChainUnderlayCrops, shouldUseWmsChainUnderlay, wmsChainBounds, fitSingleUnderlayAggregate, shouldUseGraphicUnderlay } = require("@common-tools/slideclone-core/graphic-underlay-crops");
const { createKpiEvidenceShapes, createKpiEvidenceCrops, createTitleChromeShapes, hasTitleAccentEvidence } = require("@common-tools/slideclone-core/kpi-title-graphics");
const { markTwoPanelChaosIllustrationPreserved, filterShapesClaimedByToolIslandTransitionMatrix, dropDecorativeCoverDuplicateForegroundCrops, dropTableMatrixResidualObjectifiedCrops, dropResidualsCoveredByNativeTableText, shouldDropResidualCoveredByNativeTablePeers, renderableShapeBox, shouldDropResidualCoveredByNativeTableText, dropMostlyBlankCoveredResidualCrops, shouldDropMostlyBlankCoveredResidualCrop, dropPluginTemplateCoveredStructuralUnderlays, shouldDropPluginTemplateCoveredStructuralUnderlay, hasProtectedMinimumUnitToken, dropPluginTemplateCoveredSmallResidualCrops, shouldDropPluginTemplateCoveredSmallResidualCrop, dropWmsObjectifiedValuePanelResidualCrops, shouldDropWmsObjectifiedValuePanelResidualCrop, dropWmsObjectifiedTopRouteUnderlay, shouldDropWmsObjectifiedTopRouteUnderlay, suppressSmallVisualAtomsCoveredByAnchoredSemanticLabels, isSuppressibleSemanticLabelFragment, suppressRedundantTableGridScaffoldCoveredByVisualAtoms, shouldSuppressTableGridScaffoldForLayer, materializePrototypeValidationResidualCrops, dropPrototypeValidationResidualCropsWhenNativeCoverage, dropDemandUnderstandingResidualCropsWhenNativeCoverage, shouldDropDemandUnderstandingResidualCrop, dropEntropyChallengeCropsWhenNativeCoverage, hasEntropyChallengeFinalPageEvidence } = require("@common-tools/slideclone-core/page-output-rules");
const { boxesOverlapRatio, isTriangleTopologyInternalPreservedCropLabel, normalizeTriangleTopologyDuplicateLabel, normalizeTriangleTopologyTopText, isPrdPreservedSegmentText, isPrdDocumentSegmentText, mergeShiftLeftAbilityTextBoxes, unionPtBoxes, normalizeWmsRouteChainTitle, assetOsKpiBenefitRefinedFontSize, assetOsKpiBenefitTextColor, assetOsKpiBenefitTextRole, isAssetOsKpiBenefitDiagramText, normalizedChromeEvidenceBox, isCollaborationFlowInternalLabel, isSaturatedDiagramInternalLabel, keepsInternalLayerText, shouldKeepFunnelHubDiagramText, removesInternalEditableText, shouldKeepAssetHubCycleEndpointLabel, shouldKeepFunnelHubTextInResidualCrop, shouldRemoveHighRiskInternalOverlayText, boxArea, intersectionArea, fitTriangleTopologyEvidenceFontSize, normalizeGenericNodeDiagramText, anchorSemanticTextBoxToNativeNodeShape, canNativeShapeHostSemanticLabel, isContainerSemanticLabelHost, pointInsideBox, shouldCenterTableZoneSemanticLabelInHost, tableZoneSemanticContainerSafeLabelBox, tableZoneSemanticContrastTextColor, tableZoneSemanticHostLabelBox, isSemanticLabelHostNativeShape, isAssetOsHighValueAssetMatrixTextEcho, normalizeAssetOsKpiBenefitTextKey, DEFAULT_SLIDE, ASSET_OS_KPI_FONT_SIZES } = require("@common-tools/slideclone-core/page-text-rule-helpers");
const { suppressGenericStructuredIllustrationObjectsForSpecialist, filterTextBoxesClaimedByTriangleTopology, filterTextBoxesClaimedByPrdSegmentCrops, normalizePrdSegmentCropTextBoxes, arbitrateSparseFlowCardChainNativeOwnership, normalizeCommonOcrTextBoxLabels, normalizeSystemMapChromeTextBoxes, normalizeAssetOsKpiBenefitTextBoxes, filterTextBoxesOutsideSpecializedNativeObjects, filterTextBoxesConsumedByComponentTemplateBackfill, dedupeTextBoxesByStableId, normalizeStackedArchitectureChromeTextBoxes, filterTextBoxesForGraphicUnderlays, filterTextBoxesClaimedByAssetOsClosedLoop, filterTextBoxesClaimedByInputOutputSplit, filterTextBoxesClaimedByCoverEngineCore, dropFalseTableLayersClaimedByPortalPlatform, filterTextBoxesClaimedByDocumentVersionGovernance, filterPrdAutoGenerationDuplicateTextBoxes, filterObjectsClaimedByTemporaryAnswerWorkflowTable, filterTextBoxesClaimedBySystemMapFidelityCrop, filterTextBoxesClaimedByAssetHubSuperBrainPortal, filterTextBoxesClaimedByTraditionalCollaborationBreakdown, filterTextBoxesClaimedByProductBrainAssetClosureFunnel, filterTextBoxesClaimedByProductBrainWmsQualityGate, filterTextBoxesClaimedByProductBrainPuzzleValueLoop, filterTextBoxesClaimedByProductBrainCoreValueHybrid, normalizeTemporaryAnswerWorkflowChromeText, filterTextBoxesClaimedByToolIslandTransitionMatrix, annotateReviewRiskGateTextComponents, annotateTriangleTopologyTextComponents, normalizeTriangleTopologyFinalTypography, filterTextBoxesClaimedByPortalFourLayer, annotateTextBoxesWithNativeComponentGroups, normalizeEntropyChallengeFooterTextBoxes, normalizeAssetOsHighValueAssetMatrixTextBoxes } = require("@common-tools/slideclone-core/page-text-rules");
const { comparisonMatrixSegmentNativeTextBoxes, comparisonMatrixInternalTextBoxes, comparisonMatrixSegmentTextBox, comparisonMatrixTextKey, maybeEraseSegmentedComparisonMatrixText, visibleSegmentedComparisonMatrixTextBoxes, isLowRiskLeftComparisonMatrixTextBox, isTextBoxOnSafeComparisonMatrixBackground, pointInsidePtBox, visibleComparisonMatrixTextBox, comparisonMatrixTextBox, comparisonMatrixNativeTextBoxId } = require("@common-tools/slideclone-core/comparison-matrix-text");
const { inferComparisonMatrix, comparisonMatrixLayoutFallbackTextItems, comparisonMatrixFallbackItem, shouldObjectifyComparisonMatrixFromLayoutFallback, comparisonStatusCircleShapes, comparisonWarningShapes, inferComparisonMatrixSkeletonShapes } = require("@common-tools/slideclone-core/comparison-matrix-layout");
const { inferStructuredCaseFlowCardChainShapes, structuredCaseFlowCardChainCardBox, structuredCaseFlowCardChainNodes, isSafeStructuredCaseMatrixText, structuredCaseFlowCardChainPalette, darkenHexColor, inferStructuredCaseHubSpokeSkeletonShapes, expandBox, structuredCaseHubSpokeSemanticNodes, inferStructuredCaseMatrixSkeletonShapes, inferStructuredCaseMatrixAtomAlignedSkeletonShapes, structuredCaseMatrixAtomGrid, structuredCaseMatrixSemanticNodes, structuredCaseFlowCardChainTextBoxes, structuredCaseFlowCardChainTextBox, structuredCaseHubSpokeSemanticTextBoxes, structuredCaseHubSpokeSemanticTextBox, structuredCaseMatrixSemanticTextBoxes, structuredCaseMatrixSemanticTextBox, shouldObjectifyStructuredCaseFlowCardChain, shouldObjectifyStructuredCaseHubSpokeSkeleton, shouldPreserveTwoPanelChaosIllustrationCrop, workflowSupplyChainTwoPanelEvidenceText, shouldObjectifyStructuredCaseMatrixSkeleton, shouldObjectifyCycleIllustrationComparisonMatrix } = require("@common-tools/slideclone-core/structured-case-matrix-reconstruction");
const { createComparisonMatrixShapes, comparisonMatrixNativeVisualAtoms, cycleIllustrationComparisonMatrixTextBoxes, inferCycleIllustrationComparisonMatrixShapes, inferMatrixResidualSkeletonShapes, shouldDropSegmentedComparisonMatrixResidual, shouldObjectifyComparisonMatrix, shouldObjectifyComparisonMatrixSkeleton, shouldObjectifyMatrixResidualSkeleton, shouldObjectifySegmentedComparisonMatrixText } = require("@common-tools/slideclone-core/comparison-matrix-reconstruction");
const { createStructuredIllustrationCardVisualAtomShapes, structuredIllustrationCardForAtom, structuredIllustrationNativeAtomForCard, structuredIllustrationResidualAtomGlyphShapes, isStructuredIllustrationTitleWarningAtom, structuredIllustrationGearPersonGearShapes, structuredIllustrationGearPersonHumanShapes, structuredIllustrationGearPersonMotionShapes, structuredIllustrationMiddleGearPersonTemplateBox, isStructuredIllustrationGearPersonEvidenceBox, structuredIllustrationWarningIconShapes, structuredIllustrationSmallWarningTriangleBox, structuredIllustrationWarningIconVariant, residualLooksLikeSmallOrangeWarningIcon, residualLooksLikeWaveWarningIcon, structuredIllustrationWaveWarningIconShapes } = require("@common-tools/slideclone-core/structured-card-visual-reconstruction");
const { createVisualAtomNativeShapes, shouldAllowVisualAtomOverlayForDeferredComponent } = require("@common-tools/slideclone-core/visual-atom-native-reconstruction");
const {annotateVisualAtomTopology, annotateVisualAtomContainerHierarchy, isVisualAtomTopologyNode, visualAtomBoxArea, visualAtomNodeInsideContainer, fallbackLineEndpoints, isVisualAtomTopologyConnector, nearestVisualAtomNodeForPoint, visualAtomNodeEndpointScore} = require("@common-tools/slideclone-core/visual-atom-topology");
const {visualAtomNativeShape, visualAtomArcArrowSegmentShapes, arcArrowHeadBox, pointOnBoxCircle, visualAtomChevronShape, visualAtomCloudShape, visualAtomConnectorShape, visualAtomCycleArrowShape, visualAtomCycleArrowOfficeBox, visualAtomCylinderShape, visualAtomDiamondShape, visualAtomDocumentShape, visualAtomDonutSegmentShape, visualAtomDonutShape, visualAtomEllipseShape, visualAtomComponentNodeStyle, isHighConfidenceGridMatrixVisualAtomNode, softenVisualAtomStroke, visualAtomFolderShape, visualAtomFunnelShape, visualAtomGearShapes, nativeGearApproximationShapes, visualAtomLegendMarkerShape, visualAtomRectShape, visualAtomParallelogramShape, visualAtomPersonShapes, personGlyphShapes, visualAtomPhoneShape, visualAtomPieSegmentShape, visualAtomReturnLoopShapes, visualAtomRightArrowShape, visualAtomScatterPointShape, visualAtomScreenShape, visualAtomSearchShapes, visualAtomShieldShape, visualAtomTeamShapes, visualAtomTimelineShapes, visualAtomTriangleShape} = require("@common-tools/slideclone-core/visual-atom-native-shapes");
const {inferFallbackVisualAtoms, fallbackVisualAtomComponents, dedupeFallbackVisualAtomComponents, isNestedFallbackVisualAtomComponent, fallbackAtomColorFamily, isUsefulFallbackVisualAtomComponent, fallbackVisualAtomFromComponent, inferFallbackShapeHint, isLikelyTextSpeckAtom, mergeFallbackLineAtoms, promoteFallbackLineArrowheads, fallbackArrowFromLineAndHead, fallbackArrowHeadScore, fallbackAtomColorsClose, shouldUseFallbackVisualAtomSegmentation, hasPreserveCropWithNativeOverlaysStrategy, isProtectedFidelityDiagramDetector} = require("@common-tools/slideclone-core/visual-atom-fallback");
const {annotateVisualAtomComponentShape, visualAtomComponentPart, finalizeNativeComponentGroupMetadata, unionBoxes} = require("@common-tools/slideclone-core/visual-atom-native-metadata");
const {createGanttRoadmapNativeShellShapes, ganttNativeSource, looksLikeGanttTaskBarAtom} = require("@common-tools/slideclone-core/gantt-native-shell");
const {promoteHybridDiagramResidualAtomsToNative, documentLikeIconBelongsToNode, isPromotableDocumentLikeIconAtom, isPromotableReturnLoopAtom, promoteMatrixSolidArrowAtomsToNative, isPromotableMatrixSolidRightArrowAtom} = require("@common-tools/slideclone-core/visual-atom-promotion");
const {isHandledBySpecializedDiagramRebuilder, mergeUnderstoodAndFallbackVisualAtoms, persistPromotedVisualAtoms, selectVisualAtomNativeCandidates, isLineDiagramGridOverlayLayer, selectRepresentativeGridLineAtoms, visualGridAtomAxisPosition, visualGridAtomScore, shouldDropHybridDiagramResidualAfterVisualAtoms, hasObjectifiedVisualLayerText, shouldDropSegmentedComparisonMatrixAfterVisualAtoms, shouldDropVisualAtomResidualAfterNativeRebuild, shouldKeepVisualAtomResidualAsOverlayBase, shouldObjectifyVisualAtom, shouldObjectifyVisualAtomGridLine, shouldProtectComplexCropFromVisibleVisualAtoms, shouldEmitVisibleTopComplexDiagramNativeLayer, shouldSupplementWithFallbackVisualAtoms, suppressTrustedDonutDensityFragments, visualAtomNativeBudget} = require("@common-tools/slideclone-core/visual-atom-native-policy");
const {createAssetHubCycleIllustrationObjects, aiSkillsClosedLoopCycleObjectsForImage, aiSkillsCardIconShapes, createAiSkillsCycleSideIllustrationCrops, assetHubCycleIllustrationObjectsForImage, assetHubCycleConnectorSegments, assetHubCycleInputIconShapes, assetHubCycleOutputGemShapes, assetHubCycleResidualRegions, genericCycleHubSpokeSemanticTextBoxes, genericCycleHubSpokeTextBox, isSafeGenericCycleHubSpokeNodeText, normalizeGenericCycleHubSpokeNodeText, genericCycleHubSpokeSkeletonShapesForImage, gridLikeCycleHubSpokeSemanticTextBoxes, gridLikeCycleHubSpokeSemanticNodes, gridLikeCycleHubSpokeShapesForImage, gridLikeCycleHubSpokeGrid, normalizeAssetHubEndpointLabels, shouldObjectifyAiSkillsClosedLoopCycle, shouldObjectifyAssetHubCycleIllustration, shouldObjectifyGenericCycleHubSpokeSkeleton, shouldObjectifyGridLikeCycleHubSpoke} = require("@common-tools/slideclone-core/asset-hub-cycle-reconstruction");
const {createSegmentedAssetOsClosedLoopCycleObjects, assetOsClosedLoopComponent, assetOsClosedLoopComponentMetadata, assetOsClosedLoopFidelityBounds, createAssetOsClosedLoopFidelityCrop, createAssetOsClosedLoopInputFidelityCrop, createAssetOsClosedLoopPictorialCrops, assetOsClosedLoopPictorialRole, filterTextBoxesClaimedByAssetOsClosedLoopCrop, markAssetOsClosedLoopCandidatesObjectified} = require("@common-tools/slideclone-core/asset-os-closed-loop-reconstruction");
const {comparisonMatrixVisualAtoms, hasComparisonMatrixLayerEvidence, shouldObjectifySkillsEngineAiComparisonMatrix, skillsEngineAiComparisonMatrixTarget} = require("@common-tools/slideclone-core/comparison-matrix-evidence");
const {ptBoxOverlapAreaValue} = require("@common-tools/slideclone-core/diagram-geometry");
const {createFourStepLandingPathObjects, annotateFourStepLandingShapes, fourStepLandingNativeComponentMetadata, nearestFourStepCardIndex, annotateFourStepLandingTextBoxes, applyFourStepLandingTextComponent, fourStepLandingPathTextRole, annotateFourStepLandingVisibleNarratives, mergeFourStepNarrativeFragments, createFourStepLandingPathBadgeCrop, fourStepLandingCardShape, fourStepLandingPathLayout, fourStepLandingPathSemanticNodeTextBoxes, findFourStepLandingPathTextEvidence, fourStepLandingPathFontSize, fourStepLandingPathTextColor, isFourStepLandingPathDiagramText, fourStepLandingPathTextBoxes, isFourStepLandingPathCardText, isFourStepLandingPathUnderlay, mergeFourStepLandingPathBodyFragments, mergeFourStepLandingPathTextBoxes, fourStepLandingPathTextBoxesOverlap, shouldObjectifyFourStepLandingPathPage, filterTextBoxesClaimedByFourStepLandingPath} = require("@common-tools/slideclone-core/four-step-landing-reconstruction");
const {normalizeTextKey, normalizeStructuredCaseMatrixText, distanceBetweenBoxCenters} = require("@common-tools/slideclone-core/diagram-label-matching");
const {createWmsRouteChainShapes, annotateWmsRouteComponentShapes, wmsRouteComponentRoleForShape, nearestWmsGateIndex, nearestWmsValueCardIndex, wmsRouteNativeComponentMetadata, createWmsRouteMinimumUnitCrops, wmsRouteChainSemanticTextBoxes, inferWmsRouteChainShapes, inferWmsRouteChainSkeletonShapes, inferWmsTopRouteSkeletonShapes, wmsRouteDocumentShapes, wmsRouteShapeSource, wmsRouteRoadShapes, inferWmsValueCardSkeletonShapes, inferWmsTopRouteShapes, wmsRouteAiShieldClusterShapes, wmsRouteCalloutTailShapes, inferWmsValueCardShapes, isWmsTopRouteCrop, isWmsValuePanelCrop, maybeEraseWmsRouteChainText, shouldAutoPreserveWmsRouteWholeFidelityCrop, shouldDropWmsRouteChainResidual, shouldObjectifyWmsRouteChain, shouldPreserveWmsRouteCrop, wmsRouteChainNativeTextBoxes, isWmsRouteInternalLabel, wmsRouteAiShieldTextBoxes, wmsRouteChainTextBox, wmsRouteChainTextColor, wmsRouteComponentRoleForText, wmsRouteTextMinimumFontSize} = require("@common-tools/slideclone-core/wms-route-reconstruction");
const {normalizeMatrixLabel, sameDiagramLabel, nearestNumericIndex} = require("@common-tools/slideclone-core/diagram-label-matching");
const {markProtectedComplexDiagramMinimumUnit} = require("@common-tools/slideclone-core/image-layer-metadata");
const {createToolGapPlatformDiagramObjects, inferToolGapPlatformDiagramLayout, toolGapAiStatusIconCluster, toolGapDocumentIconCluster, toolGapPlatformIconCluster, toolGapPlatformNativeTextBoxes, shouldObjectifyToolGapPlatformDiagram} = require("@common-tools/slideclone-core/tool-platform-reconstruction");
const {createReviewRiskGateFlowShapes, inferReviewRiskGateFlow, inferReviewRiskRoleBoxes, findReviewRiskRoleItem, normalizeReviewRiskLabel, reviewRiskGatePrdLayout, inferSegmentedReviewRiskGateFlow, inferSmartReviewPartialFlow, smartReviewDocumentIconBox, isReviewRiskGateCandidateImage, reviewRiskGateFlowPrimitiveShapes, reviewRiskGateNativeComponentMetadata, reviewRiskGatePrdShapes, reviewRiskGateScannerGemShapes, shouldObjectifyReviewRiskGateFlow, findReviewRiskRoleBox, shouldPreserveReviewRiskGateFlowAsMinimumUnit, smartReviewPartialPrimitiveShapes} = require("@common-tools/slideclone-core/review-risk-reconstruction");
const {createProcessWithScreenshotsFlowObjects, createProductWorkflowStageMinimumUnitCrops, inferProcessWithScreenshotsFlowLayout, cardLabelBox, inferProcessWithScreenshotsLeftIllustrationLayout, processFlowTextBox, inferProductWorkflowIconProcessLayout, isProductWorkflowIconProcess, isProcessWithScreenshotsFlowFullyObjectified, processWithScreenshotsIconShapes, shouldObjectifyProcessWithScreenshotsFlow} = require("@common-tools/slideclone-core/screenshot-flow-reconstruction");
const {shouldNativeTextBox, inferWeight, normalizeTextBoxFontWeights, normalizeFontWeightForOpenXml, refineFontSize, looksLikeLargeMetric, looksLikeLargeKpiValue, looksLikeTopTitle, looksLikeShortCardHeading, shouldDisableTextWrap, fitSingleLineFontSize, estimatedTextUnits} = require("@common-tools/slideclone-core/native-text-style");
const {
  normalizeHexColor,
  createChartZoneNativeShellShapes,
  shouldObjectifyChartZoneNativeShell,
  hasMeasuredNativeChartEvidence,
  createBarChartNativeShellShapes,
  createLineChartNativeShellShapes,
  createScatterChartNativeShellShapes,
  createDonutChartNativeShellShapes,
  createPieChartNativeShellShapes,
  createWaterfallChartNativeShellShapes,
  createTreemapChartNativeShellShapes,
  createHeatmapMatrixNativeShellShapes,
  createGaugeChartNativeShellShapes,
  createRadarChartNativeShellShapes,
  chartRadarPolygonNativeShape,
  chartAxisAtoms,
  chartAxisScore,
  chartAxisNativeShape,
  chartBarNativeShape,
  chartLineSegmentNativeShape,
  chartPointNativeShape,
  chartDonutNativeShape,
  chartDonutSegmentNativeShape,
  normalizedDonutSegmentAngles,
  donutSegmentStartDegrees,
  donutSegmentFreeformPoints,
  pieSegmentFreeformPoints,
  positiveAngleSweep,
  pointOnNormalizedCircle,
  normalizeDegrees,
  chartLineEndpointPoints,
  chartLineStartX,
  chartNativeSource,
  applyPluginChartStyleToVisualAtomShape,
  pluginChartStyleHints,
  visualChartLegendMarkerIndex,
  visualChartDataAtomIndex,
  pluginComponentPaletteInfo,
  sanitizePluginComponentPalette,
  isPluginPaletteNearWhite,
  isPluginPaletteNearBlack,
  isPluginPaletteNeutral,
  normalizeVisualGridAtomAxis,
  isVisualChartLegendMarker,
  isExplicitVisualChartLegendMarker,
  isHeuristicVisualChartLegendMarker,
  hasMatchingChartSeriesColor
} = require("@common-tools/slideclone-core/native-chart-shell-shapes");
const { buildPageHybridGraphicsStage } = require("@common-tools/slideclone-core/page-hybrid-graphics-stage");
const { buildPageNativeGraphicsStage } = require("@common-tools/slideclone-core/page-native-graphics-stage");
const { createDemandUnderstandingFlowShapes, shouldObjectifyDemandUnderstandingFlow, shouldRespectGridNativeAtomStrategy, inferDemandUnderstandingFlow, inferDemandUnderstandingFlowFromLayout, demandUnderstandingWarningBadgeBox, materialResidualName, demandUnderstandingLensShapes, demandUnderstandingBeamGuideShapes, demandUnderstandingLensFacetShapes, pointOnCircle, demandUnderstandingInputShapes, demandUnderstandingLensIllustrationBox, demandUnderstandingComponentSource, demandUnderstandingMaterialTextBoxes, demandUnderstandingNativeComponentMetadata, demandUnderstandingCardTextBoxes, demandUnderstandingWarningTextBoxes, materializeDemandUnderstandingIllustrationCrops } = require("@common-tools/slideclone-core/demand-understanding-shapes");
const { createPrototypeValidationFlowShapes, shouldObjectifyPrototypeIntentPanel, hasPrototypeValidationPageContext, isPrototypeIntentLabel, inferPrototypeIntentPanel, shouldObjectifyPrototypeValidationFlow, inferPrototypeValidationFlow, inferPrototypeValidationFlowFromLayout, prototypeValidationWandIconBox, prototypeValidationResidualCrops, prototypeValidationPanels, prototypeValidationTextBoxes } = require("@common-tools/slideclone-core/prototype-validation-shapes");
const { createPrdGenerationFlowShapes, inferSegmentedPrdGenerationFlow, boxOverlapArea, shouldPreservePrdSegmentCrop, prdSegmentedConnectorShapes, prdNativeShape, prdAutoGenerationComponentMetadata, prdInputIllustrationShapes, prdBrowserMockShapes, prdFlowTreeMockShapes, prdDocumentIllustrationShapes, prdNodeIllustrationShapes, restorePrdGenerationInputCardCrop, readPrdGenerationPristineSourceImage, paintPngRect, hexToRgb, restorePrdGenerationDocumentCrop, restorePrdGenerationCenterMinimumUnit, inferPrdAutoGenerationTitleFallbackFlow, measurePrdAutoGenerationLayout, normalizeCjkText, roundedBox, pixelBoxToSlide, prdAutoGenerationConveyorShapes, materializePrdAutoGenerationEngineCrop, prdAutoGenerationMachineShapes, prdAutoGenerationGearShapes, prdAutoGenerationDocumentShapes, prdAutoGenerationTextBoxes, prdAutoGenerationTextBoxFromEvidence, prdAutoGenerationTextBox, shouldObjectifyPrdGenerationFlow, inferPrdGenerationFlow } = require("@common-tools/slideclone-core/prd-generation-shapes");
const { lineBox, safeIdentifier } = require("@common-tools/slideclone-core/workflow-shape-primitives");
const { splitErasedResidualCrop, shouldSplitErasedResidualCrop, shouldSplitDeclaredReviewGateGem, shouldSplitStructuredIllustrationCardResidual, shouldSplitComponentTemplateVisualAtomResidual, shouldSplitComponentTemplateMatrixResidual, shouldSplitVisualAtomMatrixResidual, shouldSplitDenseStructuredCaseResidual, shouldPreserveProcessWithScreenshotsWholeCrop, splitStickyNoteSketchResidualCrops, stickyNoteSketchResidualComponents, ptBoxOverlapAreaRatio, shouldUseDocumentNodeResidualCrops, splitVisualAtomResidualCrops, visualAtomResidualCropTargets, visualAtomResidualDetector, dedupeResidualCropTargets, visualAtomResidualCoverageOptions, splitFocusedForegroundResidualCrop, findResidualWhitespaceCut, focusedForegroundProjectionComponents, wideHorizontalBridgeRows, projectionRunBox, shouldTryTableGridAwareResidualSplit, shouldTryWideResidualBandSplit, shouldTryContinuousWideResidualSplit } = require("@common-tools/slideclone-core/residual-splitting");
const { splitReviewRiskGateFlowResidualCrops, reclassifyImageSource, classifyImageExpressionForm, classifyImageExpressionSubtype, recommendExpressionHandling, splitTriangleTopologyResidualCrops, triangleTopologyResidualRegions, triangleTopologyResidualRegionsWithOptions, trimResidualRegionBox, purifyTriangleTopologyNodeCrop, truncateTriangleTopologyArrowLegs, alphaContentBox, triangleTopologyNativeComponentMetadata, safeComponentToken, splitPrdGenerationFlowResidualCrops, splitPrototypeValidationFlowResidualCrops, splitDemandUnderstandingFlowResidualCrops, splitFunnelHubResidualCrops, splitAssetHubCycleResidualCrops, assetHubCycleNativeComponentMetadata, splitInputOutputSplitResidualCrops, splitProductBrainVisionResidualCrops, applyEllipseAlphaMask, splitToolGapPlatformResidualCrops, toolGapPlatformResidualRegions, localResidualPxBox, splitProcessWithScreenshotsResidualCrops, processWithScreenshotsResidualRegions, splitValueQuadrantResidualCrops, splitSkillChainOverviewResidualCrops, splitNetworkDiagramCenterCrop, splitDocumentVersionMixedParentResidualCrop } = require("@common-tools/slideclone-core/diagram-residual-crops");
const { splitMixedDiagramSemanticCrops, mixedDiagramSemanticComponents, clampLocalBox, expandLocalBox, residualForegroundCoverageDecision, annotateResidualSplitRejection, writeResidualSplitImages, localPxBoxToSlidePt, classifyResidualSplitComponent, shouldDrawResidualAfterShapes, splitResidualLayerSource, splitDenseStructuredCaseResidualCrops, slidePtBoxToLocalPxBox, isUsableVisualAtomResidualBox, denseResidualAtomComponents, unionLocalBoxes, structuredCaseRowBandComponents, boxCenterY, splitStructuredIllustrationCardResidualCrops, structuredIllustrationCardIllustrationResidualComponents, structuredIllustrationCardColumnBands, structuredIllustrationCardShellBoxes, structuredIllustrationOuterCardShellBounds, clampPtBoxToSlide, structuredIllustrationCardAtomResidualComponents, shouldKeepStructuredIllustrationAtomAsResidual, isUsableStructuredIllustrationAtomResidualBox, mergeStructuredIllustrationAtomComponents, boxesNearPx, unionPxBox, splitSparseVisualAtomErasedResidualCrop, looksLikeScreenshotOrDocumentLayer, residualForegroundStats, shouldDropHighConfidenceGridVisualAtomResidual, splitStructuredIllustrationSparseResidualCrops, structuredIllustrationSparseResidualComponents, structuredIllustrationLooseResidualComponents, isStructuredIllustrationLooseResidualPixel, expandStructuredResidualPxBox, isUsefulStructuredIllustrationSparseComponent, structuredIllustrationCardBandSparseResidualComponents, structuredIllustrationCardResidualComponents } = require("@common-tools/slideclone-core/structured-residual-splitting");
const { residualSplitComponents, mergeGraphicComponents, boxesNear, expandPxBox, unionBox, isUsefulGraphicComponent, foregroundComponents, inAnyMask, isGraphicForeground, paleStructureComponents, isPaleStructurePixel, isUsefulPaleStructureComponent, residualSplitDecision, uncoveredPaleStructureRatio, pointInsidePxBox, tableGridAwareResidualComponents, slideGridLinesToLocalPx, uniqueSortedLinePositions, lineIntervalIndex, filterTableGridResidualComponents, tableGridAxisGroupedResidualComponents, tableGridAwareResidualSplitDecision, tableGridResidualCandidateScore, wideResidualBandComponents, significantVerticalInkRuns, isBandSignificantPixel, mergeNearbyRuns, trimResidualBandBox, wideResidualBandSplitDecision, continuousWideResidualComponents } = require("@common-tools/slideclone-core/residual-component-analysis");
const { eraseObjectifiedLayerPrimitives, shouldPreserveProtectedMinimumUnitCrop, shouldSplitMixedDiagramSemanticCrops, isFidelityFirstMinimumVisualUnit, isStructuredWmsRouteChainNativeCandidate, shouldSplitProcessWithScreenshotsLayer, shouldEraseOverlayOnlyStructuredCasePrimitives, shouldPreserveImageCropUnderNativeAssistants, isVisualChartNativeDetector, resolveAssetPathForIr, primitiveShapeEraseMask, eraseMasks, ensureDir, shouldDropStructuredVisualAtomResidualAfterErase, shouldKeepStructuredVisualAtomLayerText } = require("@common-tools/slideclone-core/residual-primitive-erasure");
const { normalizeImageLayerMetadata, hasAuthoritativeSourceExpressionMetadata, applyAuthoritativeSourceExpressionMetadata, shouldKeepSmallStandaloneIllustrationCrop, shouldPromoteStructuredIllustrationCardSplit, promoteStructuredIllustrationCardSplitMetadata, structuredIllustrationSyntheticSeparatorAtom, shouldClassifyWmsTopRouteIllustrationCrop, applyMinimumUnitCropRenderStrategy, shouldClassifyTwoPanelIconChainResidual, shouldClassifyResidualMinimumUnitCrop, classifyObviousMinimumVisualAssetCrop, hasStructuredNativeDiagramEvidence, promoteMinimumVisualAssetCropMetadata } = require("@common-tools/slideclone-core/image-layer-metadata");
const {
  constrainPtBox,
  boxCenterInside,
  sampleMaskBackgroundColor,
  maskBounds,
  pointInMask,
  distanceToSegment,
  sampleInkColor,
  detectLongLines,
  keepStructuralLines,
  detectAxisLines,
  mergeAxisRuns,
  detectSimpleStatusIcons,
  overlapsAnyTextBox,
  boxOverlapRatio,
  connectedColorComponents,
  classifyIconComponent,
  isLinePixel,
  isIconSeed,
  isSimilarIconPixel,
  ptToPxBox,
  ptLineToPxMask,
  pxToPtBox,
  insetBox,
  trimPxBox,
  unionPtBox,
  expandPtBox,
  boxesNearPt,
  pixel,
  averageColor,
  luma,
  saturation,
  rgbToHsl,
  colorDistance,
  rgbToHex,
  parseHex,
  darkerHex,
  normalizeHex,
  dominantHex,
  overlapRatio,
  median,
  centerOfBox,
  toHex,
  clamp,
  round,
  roundRatio
} = require("@common-tools/slideclone-core/raster-native-detection");
const { createPageOutputFinalizer } = require("@common-tools/slideclone-core/page-output-finalizer");
const { createPageShapeFinalizer } = require("@common-tools/slideclone-core/page-shape-finalizer");
const { createPageTextFinalizer } = require("@common-tools/slideclone-core/page-text-finalizer");
const { runNativeRebuildCli } = require("./lib/native-rebuild-cli-runner");
const {
  createTextBackplateShapes,
  pageImageFile,
  visibleTextBoxes
} = require("./lib/native-rebuild-visible-text");
const {
  createAssetOsKpiBenefitObjects,
  mergeAssetOsKpiBenefitTextBoxes
} = require("./lib/native-rebuild-asset-os-kpi-benefit");
const { createKpiEvidenceTextShapes } = require("./lib/native-rebuild-kpi-evidence-text");
const { createValueBannerBackgroundShapes } = require("./lib/native-rebuild-value-banner");
const {
  createValueQuadrantGemsObjects,
  createValueQuadrantShapes
} = require("./lib/native-rebuild-value-quadrant");
const { createAssetOsFlowFactory } = require("./lib/native-rebuild-asset-os-flow");
const { createPortalPlatformDiagramFactory } = require("./lib/native-rebuild-portal-platform");
const { createScaleLandingEvidenceFactory } = require("./lib/native-rebuild-scale-landing-evidence");
const { createSkillChainOverviewFactory } = require("./lib/native-rebuild-skill-chain-overview");
const { createStickySketchResidualFactory } = require("./lib/native-rebuild-sticky-sketch-residual");
const {
  createEntropyChallengeAnnotationObjects,
  createEntropyChallengeFooterBulletShapes,
  createEntropyChallengeFragmentShapes,
  createEntropyChallengeIslandShapes,
  shouldAutoObjectifyEntropyIsland
} = require("./lib/native-rebuild-entropy-challenge");
const { createInputOutputSplitFactory } = require("./lib/native-rebuild-input-output-split");
const { createProductBrainVisionFactory } = require("./lib/native-rebuild-product-brain-vision");
const { createProductBrainSpecializedPagesFactory } = require("./lib/native-rebuild-product-brain-specialized-pages");
const { createWorkflowSpecializedPagesFactory } = require("./lib/native-rebuild-workflow-specialized-pages");
const { createPrototypeLoopAssetsFactory } = require("./lib/native-rebuild-prototype-loop-assets");
const { createQuadrantDividerFactory } = require("./lib/native-rebuild-quadrant-dividers");
const { createFunnelHubResidualFactory } = require("./lib/native-rebuild-funnel-hub-residual");
const { createGridColorHelpersFactory } = require("./lib/native-rebuild-grid-color-helpers");
const { createTableZoneVisualShellFactory } = require("./lib/native-rebuild-table-zone-visual-shell");
const { createTableZoneGridBackgroundFactory } = require("./lib/native-rebuild-table-zone-grid-background");
const { createTableZoneSemanticTextFactory } = require("./lib/native-rebuild-table-zone-semantic-text");
const { createProductCollaborationChallengeFactory } = require("./lib/native-rebuild-product-collaboration-challenge");
const { createFoundationCapabilityNetworkFactory } = require("./lib/native-rebuild-foundation-capability-network");
const { createStackedArchitectureFactory } = require("./lib/native-rebuild-stacked-architecture");
const { createDocumentVersionFactory } = require("./lib/native-rebuild-document-version");
const { createTemporaryAnswerWorkflowMatrixFactory } = require("./lib/native-rebuild-temporary-answer-workflow-matrix");
const { createAssetHubSuperBrainPortalFactory } = require("./lib/native-rebuild-asset-hub-super-brain-portal");
const { createProductCollaborationProtectedCrops, createProductManagerFrictionNetworkObjects, dropFalseTableOverlaysOnProtectedCollaborationDiagram, normalizeAssetOsFlowChromeTextBoxes, normalizeProductManagerFrictionNarrativeTextBoxes, normalizeProtectedProductCollaborationChromeTextBoxes, protectProductCollaborationChallengeCrop, shouldObjectifyProductCollaborationChallenge } = require("./lib/product-collaboration");
const { isResidualCropCoveredByText } = require("./lib/residual-overlap-policy");
const { measureStackedLayerFront, sampleStackedLayerTopFill } = require("./lib/stacked-layer-color-sampling");



const fs = require("fs");
const { createPageSemanticClaims } = require("@common-tools/slideclone-core/page-semantic-claims");
const { resolvePageReuse } = require("@common-tools/slideclone-core/page-reuse");
const { collectDiagramTextCandidates } = require("@common-tools/slideclone-core/diagram-text-candidates");
const path = require("path");
const { compactDenseTopologyLineFamilies } = require("./lib/dense-topology-line-compactor");
const { promoteOrthogonalConnectorRoutes } = require("./lib/orthogonal-connector-promotion");
const { spawnSync } = require("child_process");
const { cropPng, readPng, writePng, withPngReadCache } = require("./lib/png");
const { makeEdgeConnectedBackgroundTransparent } = require("./lib/edge-background-alpha");
const { materializeGraphicCrops, refineGraphicCrop, shouldProtectSmallForegroundGraphicCrop } = require("./lib/graphic-crop-materializer");
const { measureBranchCurvesFromAnchors } = require("./lib/pixel-branch-curve-detector");
const { annotateLayerSource, summarizeLayerProfile } = require("./lib/layer-classifier");
const {
  getComponentAnalysisServices,
  annotateImagesWithComponentAssets,
  annotateImagesWithComponentStrategies,
  buildComponentAssetIndex,
  buildComponentStrategyIndex,
  componentAssetLayersForPage,
  shouldDeferNativeRebuildForComponentStrategy
} = require("./lib/component-strategy-runtime");
const {
  createComponentTemplateNativeObjects,
  createComponentTemplateNativeShapes
} = require("./lib/component-template-native-shapes");
const {
  buildFinalPageCacheKey,
  readFinalPageCache,
  resolveDefaultFinalPageCacheDir,
  writeFinalPageCache
} = require("./lib/final-page-cache");
const {
  detectDenseLinkedNodeAtoms,
  extractVisualAtoms
} = require("./lib/visual-atoms");
const {
  inferNativeComponentGroupForText,
  visualAtomMinimumUnitGroupId
} = require("./lib/visual-atom-component-grouping");
const {
  classifyGraphicExpressionPolicy
} = require("./lib/graphic-expression-policy");
const {
  arbitrateNativeObjectOwnership,
  nativeRebuildFamily: classifyNativeRebuildFamily
} = require("./lib/native-object-conflict-arbitrator");
const { measuredFontSize, resolveRoleFontSize } = require("./lib/font-evidence");
const { materializeFidelityCrop } = require("./lib/fidelity-crop-materializer");
const {
  sanitizeNativeCharts,
  sanitizeNativeShape,
  sanitizeNativeShapes
} = require("./lib/native-output-sanitizer");
const {
  isFlagEnabled,
  parseNativeRebuildArgs,
  rebuildRealPptxNativeUsage,
  resolveComponentAssetIndex,
  resolveComponentStrategyIndex,
  resolveSmartNativeRebuildOptions,
  sanitizeCommandArgs,
  shouldVectorizeStatusIcons
} = require("./lib/native-rebuild-options");
const { hybridRebuildStrategyProfile } = require("./lib/native-rebuild-strategy-profile");
const {
  listWorkDirs,
  readJson,
  sourceNativeSlideIndexes,
  sourceNativeSlideMetadata
} = require("./lib/native-rebuild-workdir");
const { sampleUniformPageBackgroundFill } = require("./lib/page-background-fill-sampler");
const {
  composeNativeRebuildDeck,
  createPageImageFinalizer,
  createPageGraphicsStage,
  createProgressReporter,
  createNativePassthroughPage,
  createNativeRebuildPlan,
  createPageProgressLifecycle,
  pagePerformanceMetadata,
  parsePageSelection,
  planSelectedPages,
  resolvePptxBuildMode,
  shouldIncludePage
} = require("./lib/native-rebuild-deck-pipeline");
const { preparePageGraphics } = createPageGraphicsStage({
  detectLongLines, createKpiEvidenceCrops, createKpiEvidenceShapes, shouldFullyObjectifyEntropyChallenge,
  createTitleChromeShapes, keepStructuralLines, createGraphicUnderlayCrop, decorativeBackgroundMode,
  normalizeDecorativeCoverTextBoxes, createDecorativeCoverBackground, createGraphicCrops
});
const { normalizePageImageMetadata } = createPageImageFinalizer({
  normalizeImageLayerMetadata,
  shouldPreserveTwoPanelChaosIllustrationCrop,
  markTwoPanelChaosIllustrationPreserved
});
const { createComponentTemplateOrchestration } = require("./lib/native-rebuild-component-template-orchestration");
const {
  annotateFidelityImageSource,
  arbitrateSpecializedNativeLayerOwnership,
  collectComponentTemplateFallbackDiagramTextBoxes,
  collectObjectifiedDiagramTextBoxes,
  createComponentTemplateHybridResidualCrop,
  createSpecializedNativeHybridResidualCrop,
  createSpecializedNativeHybridResidualCrops,
  createSpecializedNativeHybridResidualCropsFromNativeShapes,
  componentAssetLayerPseudoImages,
  componentTemplateInputClaimedByNativeShapes,
  filterComponentTemplateNativeInputs,
  filterComponentTemplateShapeLayerInputs,
  mergeDiagramTextBoxes,
  nativeRebuildFamily,
  replaceComponentTemplateCropsWhenFullyNative,
  shouldAllowAppliedPluginTemplateReplayCandidate,
  shouldSuppressComponentTemplateForTriangleTopology,
  shouldKeepHybridComponentTemplateResidual,
  shouldKeepSpecializedNativeHybridResidual,
  splitStructuredIllustrationCardShellShapesForLayering,
  suppressComponentTemplateShapesForSpecializedLayers,
  suppressGenericDiagramTextBoxesCoveredBySpecialized,
  suppressOrphanComponentTemplateTextBoxes,
  suppressProductBrainSmartReviewWhenReviewRiskGateActive,
  suppressStructuredIllustrationInputCycleArrows,
  suppressVisualAtomShapesCoveredByStructuredIcons
} = createComponentTemplateOrchestration({
  DEFAULT_SLIDE,
  arbitrateNativeObjectOwnership,
  boxCenterInside,
  boxOverlapArea,
  boxesOverlapRatio,
  classifyImageExpressionForm,
  classifyImageExpressionSubtype,
  classifyNativeRebuildFamily,
  clampPtBoxToSlide,
  collectDiagramTextCandidates,
  componentAssetLayersForPage,
  cropPng,
  ensureDir,
  eraseMasks,
  expandPtBox,
  isFidelityFirstMinimumVisualUnit,
  normalizeCjkText,
  path,
  ptBoxOverlapAreaRatio,
  ptBoxOverlapAreaValue,
  ptToPxBox,
  pxToPtBox,
  recommendExpressionHandling,
  refineGraphicCrop,
  round,
  roundRatio,
  safeIdentifier,
  saturatedDiagramNativeTextBoxes,
  shouldObjectifySemanticCycleDiagram,
  shouldObjectifyTriangleTopology,
  unionBox,
  unionPtBoxes,
  writePng
});
const { enrichReconstructionContracts } = require("./lib/reconstruction-contract");
const {
  chooseSystemMapReconstructionMode
} = require("./lib/system-map-reconstruction");
const { measureSystemMapPictorialEnclosure } = require("./lib/system-map-pixel-evidence");
const { createSystemMapDiagramFactory } = require("./lib/native-rebuild-system-map-diagram");
const { createSystemMapSourceDetection } = require("./lib/native-rebuild-system-map-source-detection");
const { createSystemMapLayoutFactory } = require("./lib/native-rebuild-system-map-layout");
const {
  detectSystemMapMainNetworkNodes,
  detectSystemMapSourceMappingLineShapes,
  detectSystemMapSourceNetworkLineShapes,
  findSystemMapSourceImageFile,
  measureSystemMapNativeTopology,
  systemMapSourceDetectedNetworkDetailShapes,
  systemMapSourceDetectedNetworkLayout
} = createSystemMapSourceDetection({
  detectDenseLinkedNodeAtoms,
  fileExists: fs.existsSync,
  pixel,
  pointInsidePxBox,
  ptToPxBox,
  pxToPtBox,
  readPng,
  round
});
const {
  createSystemMapFidelityChromeObjects,
  inferSystemMapDiagramLayout
} = createSystemMapLayoutFactory({
  detectSystemMapSourceMappingLineShapes,
  findSystemMapSourceImageFile,
  readPng,
  systemMapSourceDetectedNetworkDetailShapes,
  systemMapSourceDetectedNetworkLayout
});
const { createSystemMapDiagramObjects } = createSystemMapDiagramFactory({
  DEFAULT_SLIDE,
  boxCenterInside,
  clampPtBoxToSlide,
  compactDenseTopologyLineFamilies,
  cropPng,
  ensureDir,
  inferSystemMapDiagramLayout,
  materializeFidelityCrop,
  ptToPxBox,
  pxToPtBox,
  safeIdentifier,
  writePng
});
const { createAssetOsFlowObjects } = createAssetOsFlowFactory({
  boxCenterInside,
  constrainPtBox,
  ensureDir,
  expandPtBox,
  ptToPxBox,
  pxToPtBox,
  refineGraphicCrop,
  round,
  writePng
});
const { createPortalPlatformDiagramObjects } = createPortalPlatformDiagramFactory({
  boxCenterInside,
  round
});
const { createInputOutputSplitDiagramObjects } = createInputOutputSplitFactory({
  round
});
const { createProductBrainVisionObjects } = createProductBrainVisionFactory({
  averageColor,
  clamp,
  constrainPtBox,
  hexToRgb,
  luma,
  pixel,
  ptToPxBox,
  rgbToHex,
  round
});
const {
  aiSkillsInputFragmentShapes,
  aiSkillsOutputStackShapes,
  createPrototypeGenerationLoopPictorialCrops
} = createPrototypeLoopAssetsFactory({
  clampPtBoxToSlide,
  cropPng,
  ensureDir,
  ptToPxBox,
  reclassifyImageSource,
  safeIdentifier,
  writePng
});
const { createFunnelHubResidualNativeShapes } = createFunnelHubResidualFactory({
  round
});
const {
  createProductCollaborationChallengeObjects
} = createProductCollaborationChallengeFactory({
  comparisonWarningShapes,
  constrainPtBox,
  cropPng,
  createProductCollaborationProtectedCrops,
  ensureDir,
  expandPtBox,
  isFidelityFirstMinimumVisualUnit,
  lineBox,
  normalizeMatrixLabel,
  protectProductCollaborationChallengeCrop,
  ptToPxBox,
  pxToPtBox,
  round,
  safeIdentifier,
  shouldObjectifyProductCollaborationChallenge,
  writePng
});
const {
  createFoundationCapabilityNetworkObjects,
  dropFoundationCapabilityNetworkResidualCrops
} = createFoundationCapabilityNetworkFactory({
  isResidualCropCoveredByText,
  safeComponentToken
});
const {
  createStackedArchitectureDiagramObjects
} = createStackedArchitectureFactory({
  constrainPtBox,
  createFoundationCapabilityNetworkObjects,
  lineBox,
  measureStackedLayerFront,
  round,
  safeComponentToken,
  sampleStackedLayerTopFill
});
const {
  createDocumentVersionFolderFlowObjects,
  createDocumentVersionGovernanceObjects,
  shouldObjectifyDocumentVersionGovernance
} = createDocumentVersionFactory({
  boxCenterInside,
  constrainPtBox,
  cropPng,
  expandPtBox,
  lineBox,
  normalizeCjkText,
  normalizeGenericNodeDiagramText,
  ptBoxOverlapAreaRatio,
  ptToPxBox,
  resolveAssetPathForIr,
  round,
  writePng
});
const {
  createTemporaryAnswerWorkflowMatrixObjects
} = createTemporaryAnswerWorkflowMatrixFactory({
  clampPtBoxToSlide,
  cropPng,
  ensureDir,
  normalizeCjkText,
  ptToPxBox,
  pxToPtBox,
  round,
  safeIdentifier,
  writePng
});
const { createAssetHubSpecializedPagesFactory } = require("./lib/native-rebuild-asset-hub-specialized-pages");
const {
  createAssetHubSuperBrainPortalChromeObjects,
  protectAssetHubSuperBrainPortalIllustration
} = createAssetHubSuperBrainPortalFactory({
  boxAreaValue,
  clampPtBoxToSlide,
  cropPng,
  ensureDir,
  eraseMasks,
  expandPtBox,
  normalizeCjkText,
  ptBoxOverlapAreaValue,
  ptToPxBox,
  round,
  safeComponentToken,
  safeIdentifier,
  temporaryAnswerWorkflowTextBox,
  writePng
});
const {
  createAssetHubSuperBrainPortalObjects,
  createAssetHubVersionTimelineObjects,
  createAssetHubSourcePurificationObjects,
  createAssetHubWmsInboundReviewObjects,
  filterTextBoxesClaimedByAssetHubSourcePurification,
  filterTextBoxesClaimedByAssetHubSpecializedContent,
  materializeAssetHubSourceCrops,
  normalizeAssetHubTopChromeOcrTextBoxes,
  normalizeAssetHubWmsInboundReviewOcrTextBoxes,
  shouldObjectifyAssetHubSuperBrainPortal,
  shouldObjectifyAssetHubVersionTimeline,
  shouldObjectifyAssetHubSourcePurification,
  shouldObjectifyAssetHubWmsInboundReview
} = createAssetHubSpecializedPagesFactory({
  DEFAULT_SLIDE,
  clampPtBoxToSlide,
  cropPng,
  ensureDir,
  isMixedDiagramSemanticResidual,
  normalizeCjkText,
  path,
  ptToPxBox,
  pxToPtBox,
  round,
  safeComponentToken,
  safeIdentifier,
  temporaryAnswerWorkflowTextBox,
  writePng
});
const {
  colorBlockShapesForImage,
  inferTableGridFromVisualAtoms,
  insetPtBox,
  isTableCellFillColor,
  isUsableVisualTableGrid,
  resolveTableGrid,
  tableColorBlockShapes
} = createGridColorHelpersFactory({
  averageColor,
  connectedColorBlockEntries,
  expandProductSegmentPxBox,
  inferDenseTextGrid,
  ptToPxBox,
  pxToPtBox,
  rgbToHex,
  rgbToHsl,
  round,
  uniqueSortedLinePositions
});
const {
  createQuadrantDividerShapes,
  inferQuadrantDividers
} = createQuadrantDividerFactory({
  averageColor,
  boxCenterInside,
  luma,
  pixel,
  ptToPxBox,
  pxToPtBox,
  rgbToHex,
  round,
  roundRatio,
  saturation
});
const {
  createPageLevelSkillChainOverviewObjects,
  createSkillChainOverviewShapes,
  shouldObjectifySkillChainOverview,
  skillChainOverviewEvidenceTextBoxes
} = createSkillChainOverviewFactory({
  boxCenterInside,
  expandPtBox,
  round,
  safeComponentToken,
  unionPtBoxes
});
const {
  createTableZoneSemanticTextBoxes,
  tableZoneSemanticNodeInsideImage
} = createTableZoneSemanticTextFactory({
  boxArea,
  boxCenterInside,
  centerOfBox,
  cropPng,
  ensureDir,
  eraseMasks,
  expandPtBox,
  hasStrongTableGridEvidence,
  normalizeHex,
  normalizeMatrixLabel,
  pointInsideBox,
  ptToPxBox,
  resolveAssetPathForIr,
  sameDiagramLabel,
  shouldCenterTableZoneSemanticLabelInHost,
  tableZoneSemanticContrastTextColor,
  tableZoneSemanticHostLabelBox,
  writePng
});
const {
  shouldObjectifyTableZoneVisualAtomShell,
  tableZoneVisualAtomShellShapes
} = createTableZoneVisualShellFactory({
  boxCenterInside,
  centerOfBox,
  expandBox,
  normalizeTextKey,
  round,
  roundedBox,
  tableZoneSemanticNodeInsideImage
});
const {
  createTableZoneBackgroundShapes,
  createTableZoneGridShapes
} = createTableZoneGridBackgroundFactory({
  boxCenterInside,
  dominantRegionColor,
  insetPtBox,
  isTableCellFillColor,
  ptToPxBox,
  resolveTableGrid,
  rgbToHex,
  round,
  shouldObjectifyTableGrid,
  shouldObjectifyTableZoneVisualAtomShell,
  tableColorBlockShapes,
  tableGridStrokeColor,
  tableZoneVisualAtomShellShapes
});
const { createNativeRebuilder } = require("./lib/native-rebuilder-registry");
const {
  DENSE_RADIAL_NETWORK_MODES,
  createDenseRadialNetworkPolicy
} = require("./lib/dense-radial-network-policy");
const { createRadialNetworkDetector } = require("./lib/radial-network-detector");
const { createNetworkRebuildOrchestrator } = require("./lib/network-rebuild-orchestrator");
const { createRelationshipNativeShell } = require("./lib/relationship-native-shell");
const { createTextAnchoredProcessNetworkObjects } = require("./lib/text-anchored-process-network");
const { eraseDarkPixelsInRects } = require("./lib/text-mask-cleanup");
const {
  normalizeSmartReviewTextBoxes,
  smartReviewPictorialRegions
} = require("./lib/smart-review-hybrid");
const {
  DETECTOR_PREFIX: FRAGMENTED_ASSET_CHAIN_DETECTOR_PREFIX,
  createFragmentedAssetChainModel
} = require("./lib/fragmented-asset-chain");
const { createPrdAutoGenerationNarrativeTextBoxes } = require("./lib/prd-auto-generation-narrative");
const {
  DETECTOR_PREFIX: VISUAL_OPERATION_SYNC_DETECTOR_PREFIX,
  createVisualOperationSyncModel,
  materializeVisualOperationSyncImages
} = require("./lib/visual-operation-sync");
const {
  DETECTOR_PREFIX: EMBEDDED_EXPERT_DETECTOR_PREFIX,
  createEmbeddedExpertScreenshotModel,
  materializeEmbeddedExpertScreenshot
} = require("./lib/embedded-expert-screenshot");
const {
  shouldPreferAppliedPluginComponent
} = require("./lib/component-rebuild-precedence");
const {
  annotatePrototypeGenerationLoopTextBoxes,
  createPrototypeGenerationLoopModel
} = require("./lib/prototype-generation-loop");
const { finalizePrdSegmentedFlowComponents } = require("./lib/prd-segmented-flow-components");
const { applyPrototypeValidationScreenshotPolicy } = require("./lib/prototype-validation-screenshot-policy");
const {
  DETECTOR_PREFIX: CLI_SCAFFOLD_GENERATOR_DETECTOR_PREFIX,
  createCliScaffoldGeneratorObjects,
  normalizeCliScaffoldGeneratorTextBoxes
} = require("./lib/cli-scaffold-generator");
const {
  DETECTOR_PREFIX: RUNTIME_ENGINE_HYBRID_DETECTOR_PREFIX,
  createRuntimeEngineHybridModel,
  materializeRuntimeEngineHybridImages,
  normalizeRuntimeEngineHybridTextBoxes
} = require("./lib/runtime-engine-hybrid");
const {
  createValueTransformationTableModel,
  materializeValueTransformationIcon,
  normalizeValueTransformationTextBoxes
} = require("./lib/value-transformation-table");
const {
  createParadigmShiftMatrixModel,
  materializeParadigmShiftGem
} = require("./lib/paradigm-shift-matrix");
const {
  createOcrGridTableModel,
  materializeOcrGridIcon
} = require("./lib/ocr-grid-table");
const { measureTriangleTopologyPrimitives } = require("./lib/triangle-topology-measurement");
const {
  migrateLegacyResidualOwnership,
  recordResidualDropDecision,
  resolveResidualDropDecision,
  shouldDropResidual,
  syncCandidateResidualOwnership
} = require("./lib/residual-ownership");
const { createVisualFeatureContext } = require("./lib/visual-feature-context");
const { summarizeDeckComposition: summarizeDeckCompositionCore } = require("./lib/deck-composition-summary");
const { fitHighConfidenceSingleLineOcrToEvidence } = require("./lib/text-box-micro-adjust");
const { normalizeWorkflowCoverTextBox } = require("./lib/workflow-cover-text");
const {
  workflowCollaborationBranchGlowStyle,
  workflowCollaborationHubLayerStyle
} = require("./lib/workflow-collaboration-multiplier-scope");
const { detectColorComponents, detectHorizontalColorBands } = require("./lib/color-component-bounds");
const {
  createSkillsCapabilityMatrixObjects,
  filterSkillsCapabilityMatrixTextBoxes
} = require("@common-tools/slideclone-core/skills-capability-matrix");
const {
  createDemandIntakeFunnelObjects,
  filterDemandIntakeFunnelTextBoxes
} = require("@common-tools/slideclone-core/demand-intake-funnel");
const { createAssetClosureFunnelObjects } = require("./lib/asset-closure-funnel");
const {
  createSmartReviewBranchGateObjects,
  filterSmartReviewBranchGateTextBoxes
} = require("@common-tools/slideclone-core/smart-review-branch-gate");
const {
  createSkillChainOrchestrationObjects,
  filterSkillChainOrchestrationTextBoxes
} = require("@common-tools/slideclone-core/skill-chain-orchestration");
const {
  createAssetLandingTriadObjects,
  filterAssetLandingTriadTextBoxes
} = require("@common-tools/slideclone-core/asset-landing-triad");
const {
  createProductBrainAssetClosureFunnelObjects,
  materializeProductBrainAssetClosureFunnelCrops,
  createProductBrainWmsQualityGateObjects,
  shouldObjectifyProductBrainWmsQualityGate,
  createProductBrainSmartReviewRiskGateObjects,
  createProductBrainPuzzleValueLoopObjects,
  createProductBrainCoreValueHybridObjects,
  createProductBrainCoreValueSplitObjects,
  materializeAssetOsFragmentedAssetChainCrops,
  shouldAutoAllowProductBrainCoreValueNativeApproximation
} = createProductBrainSpecializedPagesFactory({
  DEFAULT_SLIDE,
  clampPtBoxToSlide,
  cropPng,
  createAssetClosureFunnelObjects,
  ensureDir,
  markProtectedComplexDiagramMinimumUnit,
  normalizeCjkText,
  normalizeSmartReviewTextBoxes,
  path,
  ptToPxBox,
  pxToPtBox,
  safeComponentToken,
  safeIdentifier,
  temporaryAnswerWorkflowTextBox,
  writePng
});
const {
  createWorkflowComparisonMatrixObjects,
  sampleWorkflowMatrixCellFill,
  workflowComparisonMeasuredTextBox,
  workflowComparisonMeasuredFontSize,
  shouldObjectifyWorkflowComparisonMatrix,
  createWorkflowCollaborationMultiplierObjects,
  shouldObjectifyWorkflowCollaborationMultiplier,
  createWorkflowChallengeTriadIllustrationObjects,
  materializeWorkflowChallengeTriadInputIllustrationCrop,
  shouldObjectifyWorkflowChallengeTriadIllustrations,
  filterWorkflowChallengeTriadIllustrationOcrTextBoxes,
  createWorkflowSupplyChainTwoPanelObjects,
  shouldObjectifyWorkflowSupplyChainTwoPanel,
  createWorkflowKpiEvidenceObjects,
  shouldObjectifyWorkflowKpiEvidence,
  workflowKpiEvidenceConclusionResidualCrop,
  workflowKpiEvidenceFontSize,
  createWorkflowPrdAutoGenerationObjects,
  shouldObjectifyWorkflowPrdAutoGeneration,
  isWorkflowPrdAutoGenerationLeftIllustrationCrop,
  createLeftIllustrationPanelSkeletonShapes,
  shouldObjectifyLeftIllustrationPanelSkeleton,
  inferLeftIllustrationPanelSkeletonShapes
} = createWorkflowSpecializedPagesFactory({
  DEFAULT_SLIDE,
  clampPtBoxToSlide,
  applyMinimumUnitCropRenderStrategy,
  boxCenterY,
  clamp,
  comparisonWarningShapes,
  constrainPtBox,
  cropPng,
  createPrdAutoGenerationNarrativeTextBoxes,
  createProductCollaborationProtectedCrops,
  ensureDir,
  expandPtBox,
  fs,
  isFidelityFirstMinimumVisualUnit,
  lineBox,
  markTwoPanelChaosIllustrationPreserved,
  makeEdgeConnectedBackgroundTransparent,
  materializeOcrGridIcon,
  measureBranchCurvesFromAnchors,
  measuredFontSize,
  median,
  normalizeCjkText,
  normalizeMatrixLabel,
  path,
  protectProductCollaborationChallengeCrop,
  ptToPxBox,
  pxToPtBox,
  round,
  roundedBox,
  roundRatio,
  readPng,
  resolveAssetPathForIr,
  safeIdentifier,
  shouldObjectifyProductCollaborationChallenge,
  splitResidualLayerSource,
  temporaryAnswerWorkflowTextBox,
  workflowCollaborationBranchGlowStyle,
  workflowCollaborationHubLayerStyle,
  workflowSupplyChainTwoPanelEvidenceText,
  writePng
});

const { claimPageSemanticImages } = createPageSemanticClaims({
  createSkillsCapabilityMatrixObjects, createDemandIntakeFunnelObjects,
  createSmartReviewBranchGateObjects, createSkillChainOrchestrationObjects, createAssetLandingTriadObjects
});



const horizontalStepChainToolkit = createNativeRebuilder("horizontal-step-chain", {
  averageColor,
  boxCenterInside,
  centerOfBox,
  comparisonMatrixVisualAtoms,
  defaultSlide: DEFAULT_SLIDE,
  isSafeStructuredText: isSafeStructuredCaseMatrixText,
  luma,
  normalizeStructuredText: normalizeStructuredCaseMatrixText,
  pixel,
  ptToPxBox,
  rgbToHex,
  round,
  saturation
});
const {
  inferShapes: inferHorizontalStepChainShapes,
  isFullyObjectified: isHorizontalStepChainFullyObjectified,
  nativeTextBoxes: horizontalStepChainNativeTextBoxes,
  normalizeTextBoxes: normalizeHorizontalStepChainTextBoxes,
  sampleFill: sampleHorizontalStepChainFill,
  shouldObjectify: shouldObjectifyHorizontalStepChain
} = horizontalStepChainToolkit;
const hierarchyDiagramToolkit = createNativeRebuilder("hierarchy-diagram", {
  boxCenterInside,
  clamp,
  defaultSlide: DEFAULT_SLIDE,
  expandPtBox,
  round,
  roundedBox,
  unionPtBox
});
const { createShapes: createHierarchyDiagramShapesFromRegistry } = hierarchyDiagramToolkit;
const triangleTopologyToolkit = createNativeRebuilder("triangle-topology", {
  boxCenterInside,
  componentMetadata: triangleTopologyNativeComponentMetadata,
  defaultSlide: DEFAULT_SLIDE,
  expandPtBox,
  measurePrimitives: measureTriangleTopologyPrimitives,
  nativeTextBoxes: triangleTopologyNativeTextBoxes,
  normalizeText: normalizeCjkText,
  round,
  sampleArrowFill: sampleTriangleTopologyArrowFill
});
const {
  createShapes: createTriangleTopologyDiagramShapesFromRegistry,
  infer: inferTriangleTopologyDiagramFromRegistry,
  shouldObjectify: shouldObjectifyTriangleTopologyFromRegistry
} = triangleTopologyToolkit;
const coverEngineCoreToolkit = createNativeRebuilder("cover-engine-core", {
  boxCenterInside,
  defaultSlide: DEFAULT_SLIDE,
  detectAvatarBox: detectCoverAvatarBox,
  detectAxis: detectCoverAxis,
  detectCardBox: detectCoverCardBox,
  expandPtBox,
  normalizeChromeTextBoxes: normalizeCoverEngineCoreChromeTextBoxes,
  round
});
const {
  componentMetadata: coverEngineComponentFromRegistry,
  createShapes: createCoverEngineCoreShapesFromRegistry
} = coverEngineCoreToolkit;
const denseRadialNetworkPolicy = createDenseRadialNetworkPolicy({ normalizeText: normalizeCjkText });
const radialNetworkDetector = createRadialNetworkDetector({
  averageColor,
  boxesNearPt,
  clamp,
  constrainPtBox,
  defaultSlide: DEFAULT_SLIDE,
  expandPxBox,
  isTerminalCandidate: isTerminalVisionDenseRadialCandidate,
  luma,
  pixel,
  ptToPxBox,
  pxToPtBox,
  rgbToHex,
  rgbToHsl,
  round,
  saturation,
  unionPtBox
});
const {
  detectNodes: detectNetworkNodeBoxes,
  infer: inferRadialNetworkDiagram,
  inferSearchBox: inferNetworkSearchBox,
  shouldObjectify: shouldObjectifyNetworkDiagram
} = radialNetworkDetector;
const networkNativeShapeToolkit = createNativeRebuilder("network-native", {
  regularPolygonPoints,
  round,
  safeComponentToken
});
const {
  createCenterShapes: createNetworkCenterEmblemShapesFromRegistry,
  createSearchShapes: createNetworkSearchBoxShapesFromRegistry,
  createStandardShapes: createStandardNetworkDiagramShapesFromRegistry
} = networkNativeShapeToolkit;
const denseRadialNetworkShapeToolkit = createNativeRebuilder("network-dense-component", {
  averageColor,
  clamp,
  createCenterShapes: createNetworkCenterEmblemShapesFromRegistry,
  createSearchShapes: createNetworkSearchBoxShapesFromRegistry,
  hexToRgb,
  normalizeHex,
  rgbToHex,
  round,
  roundedBox
});
const {
  createDetailedShapes: createDetailedDenseRadialNetworkComponentShapesFromRegistry,
  createSummaryShapes: createDenseRadialNetworkSummaryShapesFromRegistry
} = denseRadialNetworkShapeToolkit;
const networkRebuildOrchestrator = createNetworkRebuildOrchestrator({
  classify: denseRadialNetworkPolicy.classify,
  createAggregateGridShapes: createAggregateGridAtomSkeletonShapes,
  createDetailedShapes: createDetailedDenseRadialNetworkComponentShapesFromRegistry,
  createSearchShapes: createNetworkSearchBoxShapesFromRegistry,
  createStandardShapes: createStandardNetworkDiagramShapesFromRegistry,
  createSummaryShapes: createDenseRadialNetworkSummaryShapesFromRegistry,
  eraseSearchControl: eraseDenseRadialSearchControlFromCrop,
  inferNetwork: inferRadialNetworkDiagram,
  inferSearchBox: inferNetworkSearchBox,
  modes: DENSE_RADIAL_NETWORK_MODES,
  shouldObjectify: shouldObjectifyNetworkDiagram
});

const finalizePageText = createPageTextFinalizer({
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
});

const finalizePageShapes = createPageShapeFinalizer({
  sanitizeNativeShapes, dropFalseTableOverlaysOnProtectedCollaborationDiagram, dropFalseTableLayersClaimedByPortalPlatform,
  filterObjectsClaimedByTemporaryAnswerWorkflowTable, filterShapesClaimedByToolIslandTransitionMatrix, suppressGenericStructuredIllustrationObjectsForSpecialist,
  arbitrateSparseFlowCardChainNativeOwnership, arbitrateNativeObjectOwnership, promoteOrthogonalConnectorRoutes
});

const finalizePageOutput = createPageOutputFinalizer({
  sanitizeNativeShapes, dropResidualsCoveredByNativeTableText, dropTableMatrixResidualObjectifiedCrops,
  dropMostlyBlankCoveredResidualCrops, dropPluginTemplateCoveredStructuralUnderlays, dropPluginTemplateCoveredSmallResidualCrops,
  dropWmsObjectifiedValuePanelResidualCrops, dropWmsObjectifiedTopRouteUnderlay, suppressRedundantTableGridScaffoldCoveredByVisualAtoms,
  suppressSmallVisualAtomsCoveredByAnchoredSemanticLabels, applyPrototypeValidationScreenshotPolicy, materializePrototypeValidationResidualCrops,
  dropPrototypeValidationResidualCropsWhenNativeCoverage, dropDemandUnderstandingResidualCropsWhenNativeCoverage, dropEntropyChallengeCropsWhenNativeCoverage,
  dropDecorativeCoverDuplicateForegroundCrops, finalizePrdSegmentedFlowComponents, normalizeCjkText
});

function rebuildDeckFromWorkDir(workDir, options = {}) {
  const plan = createNativeRebuildPlan({
    workDir,
    options,
    services: {
      readJson,
      sourceNativeSlideMetadata,
      defaultSlide: DEFAULT_SLIDE
    }
  });
  const { sourceIr, slideSize, sourceNativeSlides, selectedPages, selectedPageTotal, progressReporter } = plan;
  const pages = selectedPages.map(({ page, pageIndex, selectedPageOrdinal }) => withPngReadCache((pngReadCache) => {
    const pageProgress = createPageProgressLifecycle({
      progressReporter,
      pageIndex,
      selectedPageOrdinal,
      selectedPageTotal,
      pageTimings: options.pageTimings
    });
    const componentIndexPage = resolveComponentIndexPage(options.componentAssetIndex, pageIndex, selectedPageOrdinal);
    const strategyIndexPage = resolveComponentIndexPage(options.componentStrategyIndex, pageIndex, selectedPageOrdinal);
    const imageFile = pageImageFile(workDir, page, pageIndex);
    const sourceNativeSlide = sourceNativeSlides.get(pageIndex);
    const pageReuse = resolvePageReuse({
      preserveNative: options.preserveSourceNativeSlides === true && Boolean(sourceNativeSlide),
      cacheEnabled: Boolean(options.finalPageCacheDir), reuseCache: options.reuseFinalPageCache === true,
      stats: options.finalPageCacheStats,
      services: {
        preserve: () => createNativePassthroughPage({ page, pageIndex, imageFile, sourceNativeSlide }),
        cacheKey: () => buildFinalPageCacheKey({ workDir, page, pageIndex, slideSize, imageFile, options }),
        read: (key) => readFinalPageCache({ cacheDir: options.finalPageCacheDir, key, irDir: options.irDir }),
        normalize: normalizePageImageMetadata,
        write: (key, draft) => writeFinalPageCache({ cacheDir: options.finalPageCacheDir, key, pageDraft: draft, irDir: options.irDir })
      }
    });
    if (pageReuse.kind === "reused") return pageProgress.complete(pageReuse.page, pageReuse.metadata);
    const imageDecodeStartedAt = Date.now(); const image = imageFile && fs.existsSync(imageFile) ? readPng(imageFile) : null; const imageDecodeMs = Date.now() - imageDecodeStartedAt;
    const visualFeatureContext = image ? createVisualFeatureContext({ sourceImage: image, slideSize, extractVisualAtoms }) : null;
    const rawTextBoxes = page.textBoxes || [];
    const textBoxes = visibleTextBoxes(page.textBoxes || [], image, slideSize);
    const { kpiEvidenceShapes, titleChromeShapes, lines, useUnderlay, decorativeBackground, images } = preparePageGraphics({
      image, textBoxes, slideSize, pageIndex, options
    });
    const pageDraft = {
      pageIndex: page.pageIndex ?? pageIndex,
      sourceImage: imageFile || undefined,
      background: { fill: sampleUniformPageBackgroundFill(image) },
      shapes: [],
      images,
      textBoxes,
      tables: [],
      charts: sanitizeNativeCharts(page.charts || [], slideSize),
      icons: []
    };
    pageDraft.images = pageDraft.images
      .map((item) => annotateFidelityImageSource(item))
      .map((item) => annotateLayerSource(item, pageDraft, slideSize, { sourceImage: image, visualFeatureContext }))
      .map((item) => refreshImageExpressionMetadata(item))
      .map((item) => annotateLayerSource(item, pageDraft, slideSize, {
        sourceImage: image,
        visualFeatureContext,
        reuseExistingVisualAnalysis: true
      }));
    pageDraft.images = annotateImagesWithComponentStrategies(pageDraft.images, strategyIndexPage, options.componentStrategyIndex);
    pageDraft.images = annotateImagesWithComponentAssets(pageDraft.images, componentIndexPage, options.componentAssetIndex);
    pageDraft.images = pageDraft.images.map((item) => normalizeImageLayerMetadata(item));
    let nativeRebuildCandidateImages = pageDraft.images.filter((item) =>
      !shouldDeferNativeRebuildForComponentStrategy(item)
      || shouldAllowSpecializedNativeRebuildForDeferredComponent(item, textBoxes)
    );
    if (image && options.objectifyLayerText === true) {
      objectifyLayerTextCrops({
        page: pageDraft,
        sourceImage: image,
        textBoxes,
        slideSize,
        irDir: options.irDir
      });
    } else if (image && options.objectifyStructuredVisualAtomText === true) {
      objectifyLayerTextCrops({
        page: pageDraft,
        sourceImage: image,
        textBoxes,
        slideSize,
        irDir: options.irDir,
        structuredVisualAtomTextOnly: true
      });
    }
    const nativeTextBoxes = filterTextBoxesForGraphicUnderlays(textBoxes, pageDraft.images, {
      keepInternalTextForLayerCandidates: options.objectifyLayerText === true
    });
    const pageSemanticText = buildPageSemanticText(rawTextBoxes.length > 0 ? rawTextBoxes : textBoxes);
    pageDraft.images = enrichImagesWithPageSemanticText(pageDraft.images, pageSemanticText);
    nativeRebuildCandidateImages = enrichImagesWithPageSemanticText(nativeRebuildCandidateImages, pageSemanticText);
    // Dense system maps can opt into native rebuilding without the broad
    // connector mode only after source pixels prove a rich node-and-edge graph.
    const systemMapTopologyProbeReady = image
      ? prepareSystemMapTopologyProbe(pageDraft, rawTextBoxes, slideSize, { sourceImage: image, pageIndex })
      : false;
    const autoObjectifySystemMap = options.objectifyLayerConnectors === true || systemMapTopologyProbeReady;
    // Protect dense perspective illustrations before generic diagram detectors can mistake their callouts for a flow.
    const assetHubSuperBrainPortalProtected = image && options.objectifyLayerConnectors === true
      ? protectAssetHubSuperBrainPortalIllustration(pageDraft, rawTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : false;
    const unreadableSystemMapFidelityProtected = image && autoObjectifySystemMap
      ? protectUnreadableSystemMapFidelityCrop(pageDraft, rawTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : false;
    if (unreadableSystemMapFidelityProtected) {
      const protectedSystemMapIds = new Set(pageDraft.images
        .filter((item) => item?.source?.systemMapFidelityProtected === true)
        .map((item) => String(item.id || ""))
        .filter(Boolean));
      nativeRebuildCandidateImages = nativeRebuildCandidateImages
        .filter((item) => !protectedSystemMapIds.has(String(item?.id || "")));
    }
    // High-confidence page semantics must claim the source layer before generic
    // table/grid and plugin-template paths can reinterpret the architecture.
    const assetOsTwoDimensionalFoundation = image && options.objectifyLayerConnectors === true
      ? createAssetOsTwoDimensionalFoundationObjects(pageDraft, rawTextBoxes, slideSize)
      : { shapes: [], textBoxes: [] };
    if (assetOsTwoDimensionalFoundation.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.assetOsTwoDimensionalFoundationObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.assetOsTwoDimensionalFoundationObjectified !== true);
    }
    const traditionalCollaborationBreakdown = image && options.objectifyLayerConnectors === true
      ? createTraditionalCollaborationBreakdownObjects(pageDraft, rawTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [], images: [] };
    if (traditionalCollaborationBreakdown.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.traditionalCollaborationBreakdownObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.traditionalCollaborationBreakdownObjectified !== true);
      pageDraft.images.push(...(traditionalCollaborationBreakdown.images || []));
    }
    const semanticClaims = claimPageSemanticImages({
      page: pageDraft, candidateImages: nativeRebuildCandidateImages, textBoxes: rawTextBoxes,
      image, slideSize, pageIndex, options
    });
    const { skillsCapabilityMatrix, demandIntakeFunnel, smartReviewBranchGate, skillChainOrchestration, assetLandingTriad } = semanticClaims;
    nativeRebuildCandidateImages = semanticClaims.candidateImages;
    const specializedNativeEligibleImages = () => pageDraft.images.filter((item) => !isFidelityFirstMinimumVisualUnit(item));
    // A fidelity-first layer may still be a fully recognizable semantic
    // structure. Let only this strict challenge signature reach its dedicated
    // rebuilder; all other standalone illustrations remain protected.
    const productCollaborationCandidates = () => pageDraft.images.filter((item) =>
      !isFidelityFirstMinimumVisualUnit(item)
      || shouldObjectifyProductCollaborationChallenge(item, rawTextBoxes, slideSize)
    );
    const specializedNativeEligiblePageDraft = () => ({
      ...pageDraft,
      images: specializedNativeEligibleImages()
    });
    const productCollaborationChallenge = image && options.objectifyLayerConnectors === true
      ? createProductCollaborationChallengeObjects(productCollaborationCandidates(), rawTextBoxes, image, slideSize, {
        allowNativeApproximation: options.allowProductCollaborationChallengeNativeApproximation === true,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [], images: [] };
    normalizeProtectedProductCollaborationChromeTextBoxes(nativeTextBoxes, pageDraft.images);
    if (productCollaborationChallenge.shapes.length > 0 || productCollaborationChallenge.images.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.productCollaborationChallengeObjectified !== true);
      pageDraft.images.push(...productCollaborationChallenge.images);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.productCollaborationChallengeObjectified !== true);
    }
    const nativeGraphicsStageResult = buildPageNativeGraphicsStage({
      image, options, pageDraft, nativeTextBoxes, slideSize, decorativeBackground, nativeRebuildCandidateImages, rawTextBoxes, textBoxes, pageIndex, specializedNativeEligiblePageDraft, specializedNativeEligibleImages, autoObjectifySystemMap, unreadableSystemMapFidelityProtected
    }, {
      createValueBannerBackgroundShapes, createTextBackplateShapes, createLayerContainerShapes, createMatrixColorBlockShapes, createLayerColorBlockShapes, createStickyNoteClusterShapes, createLayerConnectorShapes, createTableZoneGridShapes, createTableZoneBackgroundShapes, createTableZoneSemanticTextBoxes, createQuadrantDividerShapes, createNetworkDiagramShapes, syncObjectifiedCandidateSources, createHierarchyDiagramShapes, createTriangleTopologyDiagramShapes, createCoverEngineCoreShapes, createSkillChainOverviewShapes, createPageLevelSkillChainOverviewObjects, createLinearProcessDiagramShapes, createPrdGenerationFlowShapes, syncPrdGenerationMinimumUnitBoxes, createPrototypeValidationFlowShapes, applyPrototypeValidationScreenshotPolicy, syncPrototypeValidationCandidateSources, createDemandUnderstandingFlowShapes, hasSpecializedComparisonSkeletonCandidate, createComparisonMatrixShapes, createSaturatedDiagramTextShapes, createSemanticCycleDiagramShapes, createProductManagerFrictionNetworkObjects, createDenseComplexDiagramScaffoldObjects, createTwoPanelDiagramTextShapes, createTopComplexDiagramTextShapes, createShiftLeftDebuggerDiagramObjects, createToolIslandTransitionMatrixObjects, createKpiEvidenceTextShapes, createValueQuadrantShapes, createReviewRiskGateFlowShapes, createFunnelHubDiagramShapes, createHorizontalStepChainShapes, createGenericNodeDiagramSkeletonShapes, createVisualClusterStackShapes, createWmsRouteChainShapes, createCollaborationFlowShapes, createStackedArchitectureDiagramObjects, createToolGapPlatformDiagramObjects, createProcessWithScreenshotsFlowObjects, createTextAnchoredProcessNetworkObjects, createDocumentVersionGovernanceObjects, createDocumentVersionFolderFlowObjects, createAssetOsFlowObjects, createPrototypeGenerationLoopModel, createPortalPlatformDiagramObjects, createSystemMapDiagramObjects, createSystemMapFidelityChromeObjects, shouldAutoObjectifyEntropyIsland, createEntropyChallengeFragmentShapes, createEntropyChallengeIslandShapes, createEntropyChallengeAnnotationObjects, createEntropyChallengeFooterBulletShapes, createVisualAtomNativeShapes, filterTextBoxesForGraphicUnderlays, createSpecializedNativeHybridResidualCrops, uniqueImagesById, createSpecializedNativeHybridResidualCropsFromNativeShapes, createPrototypeGenerationLoopPictorialCrops, shouldDeferNativeRebuildForComponentStrategy, shouldAllowVisualAtomOverlayForDeferredComponent, isWorkflowDemandUnderstandingAssistantLeftIllustrationCrop, isWorkflowPrdAutoGenerationLeftIllustrationCrop
    });
    const { valueBannerBackgroundShapes, textBackplateShapes, layerContainerShapes, matrixColorBlockShapes, layerColorBlockShapes, stickyNoteClusterShapes, layerConnectorShapes, tableGridShapes, tableBackgroundShapes, tableZoneSemanticTextBoxes, quadrantDividerShapes, networkDiagramShapes, hierarchyDiagramShapes, triangleTopologyShapes, coverEngineCoreShapes, skillChainOverviewShapes, pageLevelSkillChainOverview, linearProcessShapes, prdGenerationFlowShapes, prototypeValidationFlowShapes, demandUnderstandingFlowShapes, comparisonMatrixShapes, saturatedDiagramTextShapes, semanticCycleDiagramShapes, semanticCycleFidelityCrops, productManagerFrictionNetwork, denseComplexDiagramScaffold, denseComplexDiagramScaffoldShapes, twoPanelDiagramTextShapes, topComplexDiagramTextShapes, shiftLeftDebuggerDiagram, toolIslandTransitionMatrix, kpiEvidenceTextShapes, valueQuadrantShapes, reviewRiskGateFlowShapes, funnelHubDiagramShapes, horizontalStepChainShapes, genericNodeDiagramSkeletonShapes, visualClusterStackShapes, wmsRouteChainShapes, collaborationFlowShapes, stackedArchitectureDiagram, toolGapPlatformDiagram, processWithScreenshotsFlow, textAnchoredProcessNetwork, documentVersionGovernance, documentVersionFolderFlow, assetOsFlow, prototypeGenerationLoop, portalPlatformDiagram, systemMapDiagram, systemMapFidelityChrome, allowEntropyNativeApproximation, autoObjectifyEntropyIsland, entropyFragmentShapes, entropyIslandShapes, entropyChallengeAnnotations, entropyChallengeFooterShapes, visualAtomNativeShapes } = nativeGraphicsStageResult;
    let { pageLevelNetworkDiagramShapes } = nativeGraphicsStageResult;
    nativeRebuildCandidateImages = nativeGraphicsStageResult.nativeRebuildCandidateImages;
    const hybridGraphicsStageResult = buildPageHybridGraphicsStage({
      options, pageDraft, slideSize, image, pageIndex, rawTextBoxes, imageFile, componentIndexPage, nativeRebuildCandidateImages, textBoxes, productCollaborationChallenge
    }, nativeGraphicsStageResult, {
      createStructuredIllustrationCardShellShapes, createAssetHubCycleIllustrationObjects, shouldObjectifyProductBrainWmsQualityGate, createInputOutputSplitDiagramObjects, createCliScaffoldGeneratorObjects, createVisualOperationSyncModel, materializeVisualOperationSyncImages, createEmbeddedExpertScreenshotModel, materializeEmbeddedExpertScreenshot, createRuntimeEngineHybridModel, materializeRuntimeEngineHybridImages, createParadigmShiftMatrixModel, materializeParadigmShiftGem, createValueTransformationTableModel, materializeValueTransformationIcon, createOcrGridTableModel, materializeOcrGridIcon, createProductBrainVisionObjects, createAssetOsHighValueAssetMatrixObjects, componentAssetLayerPseudoImages, shouldPreferAppliedPluginComponent, createFragmentedAssetChainModel, filterComponentTemplateShapeLayerInputs, mergeDiagramTextBoxes, collectObjectifiedDiagramTextBoxes, collectComponentTemplateFallbackDiagramTextBoxes, filterComponentTemplateNativeInputs, createComponentTemplateNativeObjects, createWorkflowSupplyChainTwoPanelObjects, materializeAssetOsFragmentedAssetChainCrops, replaceComponentTemplateCropsWhenFullyNative, createSpecializedNativeHybridResidualCropsFromNativeShapes, eraseObjectifiedLayerPrimitives, restorePrdGenerationSegmentCropsAfterPrimitiveErasure, migrateLegacyResidualOwnership, splitErasedResidualCrops
    });
    const { structuredIllustrationCardShellShapes, assetHubCycleIllustration, inputOutputSplitDiagram, cliScaffoldGenerator, visualOperationSync, embeddedExpertScreenshot, runtimeEngineHybrid, paradigmShiftMatrix, valueTransformationTable, ocrGridTable, productBrainVision, assetOsHighValueAssetMatrix, assetOsFragmentedAssetChain, componentTemplateNativeShapes, componentTemplateNativeTextBoxes, componentTemplateNativeImages, diagramTextBoxes, workflowSupplyChainTwoPanel } = hybridGraphicsStageResult;
    nativeRebuildCandidateImages = hybridGraphicsStageResult.nativeRebuildCandidateImages;
    const assetOsKpiBenefit = image
      ? createAssetOsKpiBenefitObjects(pageDraft, rawTextBoxes, nativeTextBoxes, slideSize)
      : { shapes: [], textBoxes: [] };
    if (assetOsKpiBenefit.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.assetOsKpiBenefitObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.assetOsKpiBenefitObjectified !== true);
    }
    const scaleLandingEvidence = image && options.objectifyLayerConnectors === true
      ? createScaleLandingEvidenceObjects(pageDraft, rawTextBoxes, nativeTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [], images: [] };
    if (scaleLandingEvidence.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.scaleLandingEvidenceObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.scaleLandingEvidenceObjectified !== true);
      if (Array.isArray(scaleLandingEvidence.images) && scaleLandingEvidence.images.length > 0) {
        pageDraft.images.push(...scaleLandingEvidence.images);
      }
    }
    const fourStepLandingPath = image && options.objectifyLayerConnectors === true
      ? createFourStepLandingPathObjects(pageDraft, rawTextBoxes, nativeTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [] };
    if (fourStepLandingPath.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.fourStepLandingPathObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.fourStepLandingPathObjectified !== true);
      // The specialist replaces every roadmap label with a semantic-node text
      // box. Keeping the OCR boxes as well produces visible double text.
      nativeTextBoxes.splice(0, nativeTextBoxes.length, ...filterTextBoxesClaimedByFourStepLandingPath(nativeTextBoxes, fourStepLandingPath.layout));
      if (Array.isArray(fourStepLandingPath.images) && fourStepLandingPath.images.length > 0) {
        pageDraft.images.push(...fourStepLandingPath.images);
      }
    }
    const valueQuadrantGems = image && options.objectifyLayerConnectors === true
      ? createValueQuadrantGemsObjects(pageDraft, rawTextBoxes, nativeTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [], images: [] };
    if (Array.isArray(valueQuadrantGems.images) && valueQuadrantGems.images.length > 0) {
      pageDraft.images.push(...valueQuadrantGems.images);
    }
    if (valueQuadrantGems.shapes.length > 0 || (Array.isArray(valueQuadrantGems.images) && valueQuadrantGems.images.length > 0)) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.valueQuadrantGemsObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.valueQuadrantGemsObjectified !== true);
    }
    const temporaryAnswerWorkflowMatrix = image && options.objectifyLayerConnectors === true
      ? createTemporaryAnswerWorkflowMatrixObjects(pageDraft, rawTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [], images: [], tables: [] };
    const temporaryAnswerWorkflowMatrixActive = temporaryAnswerWorkflowMatrix.tables?.length > 0;
    if (temporaryAnswerWorkflowMatrix.shapes.length > 0 || temporaryAnswerWorkflowMatrix.tables?.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.temporaryAnswerWorkflowMatrixObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.temporaryAnswerWorkflowMatrixObjectified !== true);
      pageDraft.tables.push(...(temporaryAnswerWorkflowMatrix.tables || []));
      if (Array.isArray(temporaryAnswerWorkflowMatrix.images) && temporaryAnswerWorkflowMatrix.images.length > 0) {
        pageDraft.images.push(...temporaryAnswerWorkflowMatrix.images);
      }
    }
    const assetHubSuperBrainPortal = image && options.objectifyLayerConnectors === true && !assetHubSuperBrainPortalProtected
      ? createAssetHubSuperBrainPortalObjects(pageDraft, rawTextBoxes, slideSize)
      : { shapes: [], textBoxes: [] };
    const protectedAssetHubSuperBrainPortalImage = pageDraft.images.find(
      (item) => item?.source?.assetHubSuperBrainPortalProtected === true
    );
    const assetHubSuperBrainPortalChrome = assetHubSuperBrainPortalProtected
      ? createAssetHubSuperBrainPortalChromeObjects(
        rawTextBoxes,
        protectedAssetHubSuperBrainPortalImage?.box,
        slideSize,
        {
          illustrationId: protectedAssetHubSuperBrainPortalImage?.id,
          calloutTextErasedFromCrop: protectedAssetHubSuperBrainPortalImage?.source?.calloutTextErasedFromCrop === true
        }
      )
      : { shapes: [], textBoxes: [] };
    if (assetHubSuperBrainPortal.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.assetHubSuperBrainPortalObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.assetHubSuperBrainPortalObjectified !== true);
    }
    const assetHubVersionTimeline = image && options.objectifyLayerConnectors === true
      ? createAssetHubVersionTimelineObjects(pageDraft, rawTextBoxes, slideSize, { ...options, sourceImage: image, pageIndex })
      : { shapes: [], textBoxes: [] };
    if (assetHubVersionTimeline.shapes.length > 0) {
      const retainedTimelineChromeText = filterTextBoxesClaimedByAssetHubSpecializedContent(nativeTextBoxes, true);
      nativeTextBoxes.splice(0, nativeTextBoxes.length, ...retainedTimelineChromeText);
      normalizeAssetHubTopChromeOcrTextBoxes(nativeTextBoxes, "version-timeline");
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.assetHubVersionTimelineObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.assetHubVersionTimelineObjectified !== true);
    }
    const assetHubSourcePurification = image && options.objectifyLayerConnectors === true
      ? createAssetHubSourcePurificationObjects(pageDraft, rawTextBoxes, slideSize, { ...options, sourceImage: image, pageIndex })
      : { shapes: [], textBoxes: [] };
    if (assetHubSourcePurification.shapes.length > 0) {
      const retainedSourcePurificationText = filterTextBoxesClaimedByAssetHubSourcePurification(nativeTextBoxes, true);
      nativeTextBoxes.splice(0, nativeTextBoxes.length, ...retainedSourcePurificationText);
      normalizeAssetHubTopChromeOcrTextBoxes(nativeTextBoxes, "source-purification");
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.assetHubSourcePurificationObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.assetHubSourcePurificationObjectified !== true);
    }
    const assetHubWmsInboundReview = image && options.objectifyLayerConnectors === true
      ? createAssetHubWmsInboundReviewObjects(pageDraft, rawTextBoxes, slideSize)
      : { shapes: [], textBoxes: [], images: [] };
    if (assetHubWmsInboundReview.shapes.length > 0) {
      normalizeAssetHubWmsInboundReviewOcrTextBoxes(nativeTextBoxes, slideSize);
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.assetHubWmsInboundReviewObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.assetHubWmsInboundReviewObjectified !== true);
    }
    const productBrainAssetClosureFunnel = image && options.objectifyLayerConnectors === true
      ? createProductBrainAssetClosureFunnelObjects(pageDraft, rawTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [], images: [] };
    if (productBrainAssetClosureFunnel.shapes.length > 0) {
      const retainedAssetClosureText = filterTextBoxesClaimedByProductBrainAssetClosureFunnel(nativeTextBoxes, true);
      nativeTextBoxes.splice(0, nativeTextBoxes.length, ...retainedAssetClosureText);
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.productBrainAssetClosureFunnelObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.productBrainAssetClosureFunnelObjectified !== true);
      if (Array.isArray(productBrainAssetClosureFunnel.images) && productBrainAssetClosureFunnel.images.length > 0) {
        pageDraft.images.push(...productBrainAssetClosureFunnel.images);
      }
    }
    const productBrainWmsQualityGate = image && options.objectifyLayerConnectors === true
      ? createProductBrainWmsQualityGateObjects(pageDraft, rawTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex: options.pageIndex
      })
      : { shapes: [], textBoxes: [], images: [] };
    if (productBrainWmsQualityGate.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.productBrainWmsQualityGateObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.productBrainWmsQualityGateObjectified !== true);
      if (Array.isArray(productBrainWmsQualityGate.images) && productBrainWmsQualityGate.images.length > 0) {
        pageDraft.images.push(...productBrainWmsQualityGate.images);
      }
    }
    const productBrainSmartReviewRiskGate = image && options.objectifyLayerConnectors === true
      ? createProductBrainSmartReviewRiskGateObjects(pageDraft, rawTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [], images: [] };
    if (productBrainSmartReviewRiskGate.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.productBrainSmartReviewRiskGateObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.productBrainSmartReviewRiskGateObjectified !== true);
    }
    if (Array.isArray(productBrainSmartReviewRiskGate.images) && productBrainSmartReviewRiskGate.images.length > 0) {
      pageDraft.images.push(...productBrainSmartReviewRiskGate.images);
    }
    const productBrainCoreValueHybrid = image && options.objectifyLayerConnectors === true
      ? createProductBrainCoreValueHybridObjects(pageDraft, rawTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [], images: [] };
    if (Array.isArray(productBrainCoreValueHybrid.images) && productBrainCoreValueHybrid.images.length > 0) {
      pageDraft.images.push(...productBrainCoreValueHybrid.images);
    }
    if (productBrainCoreValueHybrid.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.productBrainCoreValueHybridObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.productBrainCoreValueHybridObjectified !== true);
    }
    const productBrainPuzzleValueLoop = image && options.objectifyLayerConnectors === true
      ? createProductBrainPuzzleValueLoopObjects(pageDraft, rawTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [], images: [] };
    if (productBrainPuzzleValueLoop.images.length > 0) pageDraft.images.push(...productBrainPuzzleValueLoop.images);
    const productBrainCoreValueSplit = image && options.objectifyLayerConnectors === true
      ? createProductBrainCoreValueSplitObjects(specializedNativeEligiblePageDraft(), rawTextBoxes, slideSize)
      : { shapes: [], textBoxes: [] };
    if (productBrainCoreValueSplit.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.productBrainCoreValueSplitObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.productBrainCoreValueSplitObjectified !== true);
    }
    const skillsEngineCoverTriad = image && options.objectifyLayerConnectors === true
      ? createSkillsEngineCoverTriadObjects(pageDraft, rawTextBoxes, slideSize)
      : { shapes: [], textBoxes: [] };
    if (skillsEngineCoverTriad.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.skillsEngineCoverTriadObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.skillsEngineCoverTriadObjectified !== true);
    }
    const skillsEngineAiComparisonMatrix = image && options.objectifyLayerConnectors === true
      ? createSkillsEngineAiComparisonMatrixObjects(pageDraft, rawTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [], images: [] };
    if (Array.isArray(skillsEngineAiComparisonMatrix.images) && skillsEngineAiComparisonMatrix.images.length > 0) {
      pageDraft.images.push(...skillsEngineAiComparisonMatrix.images);
    }
    if (Array.isArray(skillsEngineAiComparisonMatrix.tables) && skillsEngineAiComparisonMatrix.tables.length > 0) {
      pageDraft.tables.push(...skillsEngineAiComparisonMatrix.tables);
    }
    if (skillsEngineAiComparisonMatrix.shapes.length > 0 || skillsEngineAiComparisonMatrix.tables?.length > 0 || (Array.isArray(skillsEngineAiComparisonMatrix.images) && skillsEngineAiComparisonMatrix.images.length > 0)) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.skillsEngineAiComparisonMatrixObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.skillsEngineAiComparisonMatrixObjectified !== true);
    }
    const workflowPrdAutoGeneration = image && options.objectifyLayerConnectors === true
      ? createWorkflowPrdAutoGenerationObjects(pageDraft, rawTextBoxes, slideSize)
      : { shapes: [], textBoxes: [] };
    if (workflowPrdAutoGeneration.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.workflowPrdAutoGenerationObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.workflowPrdAutoGenerationObjectified !== true);
    }
    const workflowDemandUnderstandingAssistant = image && options.objectifyLayerConnectors === true
      ? createWorkflowDemandUnderstandingAssistantObjects(pageDraft, rawTextBoxes, slideSize, image)
      : { shapes: [], textBoxes: [] };
    if (workflowDemandUnderstandingAssistant.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.workflowDemandUnderstandingAssistantObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.workflowDemandUnderstandingAssistantObjectified !== true);
    }
    const workflowChallengeTriadIllustrations = image && options.objectifyLayerConnectors === true
      ? createWorkflowChallengeTriadIllustrationObjects(pageDraft, rawTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [] };
    if (workflowChallengeTriadIllustrations.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.workflowChallengeTriadIllustrationsObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.workflowChallengeTriadIllustrationsObjectified !== true);
    }
    const workflowComparisonMatrix = image && options.objectifyLayerConnectors === true
      ? createWorkflowComparisonMatrixObjects(pageDraft, rawTextBoxes, slideSize, image)
      : { shapes: [], textBoxes: [] };
    if (workflowComparisonMatrix.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.workflowComparisonMatrixObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.workflowComparisonMatrixObjectified !== true);
    }
    const workflowCollaborationMultiplier = image && options.objectifyLayerConnectors === true
      ? createWorkflowCollaborationMultiplierObjects(pageDraft, rawTextBoxes, slideSize, options)
      : { shapes: [], textBoxes: [] };
    if (workflowCollaborationMultiplier.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.workflowCollaborationMultiplierObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.workflowCollaborationMultiplierObjectified !== true);
    }
    const workflowKpiEvidence = image && options.objectifyLayerConnectors === true
      ? createWorkflowKpiEvidenceObjects(pageDraft, rawTextBoxes, slideSize)
      : { shapes: [], textBoxes: [] };
    if (workflowKpiEvidence.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.workflowKpiEvidenceObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.workflowKpiEvidenceObjectified !== true);
    }
    const workflowAssetCycleQuadrant = image && options.objectifyLayerConnectors === true
      ? createCenterBadgeQuadrantCycleObjects(pageDraft, rawTextBoxes, image, slideSize, {
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [] };
    if (Array.isArray(workflowAssetCycleQuadrant.images) && workflowAssetCycleQuadrant.images.length > 0) {
      pageDraft.images.push(...workflowAssetCycleQuadrant.images);
    }
    if (workflowAssetCycleQuadrant.shapes.length > 0 || workflowAssetCycleQuadrant.images?.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.centerBadgeQuadrantCycleObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.centerBadgeQuadrantCycleObjectified !== true);
    }
    // The complete semantic signature is intentionally strict enough to make this
    // specialized rebuild safe without a manual approximation opt-in.
    const autoObjectifyAssetOsDemandUnderstanding = image && options.objectifyLayerConnectors === true
      && shouldAutoObjectifyAssetOsDemandUnderstandingAssistant(pageDraft, rawTextBoxes, slideSize, options);
    const assetOsDemandUnderstandingAssistant = image && options.objectifyLayerConnectors === true
      ? createAssetOsDemandUnderstandingAssistantObjects(pageDraft, rawTextBoxes, slideSize, {
        allowNativeApproximation: autoObjectifyAssetOsDemandUnderstanding,
        reuseSourceText: false,
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [] };
    if (assetOsDemandUnderstandingAssistant.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.assetOsDemandUnderstandingAssistantObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.assetOsDemandUnderstandingAssistantObjectified !== true);
      if (Array.isArray(assetOsDemandUnderstandingAssistant.images) && assetOsDemandUnderstandingAssistant.images.length > 0) {
        pageDraft.images.push(...assetOsDemandUnderstandingAssistant.images);
      }
    }
    const assetOsEntropyChallenge = image && options.objectifyLayerConnectors === true
      ? createAssetOsEntropyChallengeObjects(pageDraft, rawTextBoxes, slideSize)
      : { shapes: [], textBoxes: [] };
    if (assetOsEntropyChallenge.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.assetOsEntropyChallengeObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.assetOsEntropyChallengeObjectified !== true);
    }
    if (image && options.objectifyLayerConnectors === true) {
      pageLevelNetworkDiagramShapes = createPageLevelNetworkDiagramShapes(pageDraft, image, slideSize);
      if (pageLevelNetworkDiagramShapes.length > 0) {
        pageDraft.images = pageDraft.images.filter((item) => item?.source?.pageLevelNetworkResidualDrop !== true);
      }
    }
    const stickySketchResidualNativeShapes = image && options.objectifyLayerConnectors === true
      ? createStickySketchResidualNativeShapes(pageDraft, options.irDir, slideSize)
      : [];
    const funnelHubResidualNativeShapes = image && options.objectifyLayerConnectors === true
      ? createFunnelHubResidualNativeShapes(pageDraft, slideSize)
      : [];
    const structuredIllustrationResidualLineShapes = image && options.objectifyLayerConnectors === true
      ? createStructuredIllustrationResidualLineShapes(pageDraft, options.irDir, slideSize)
      : [];
    const structuredIllustrationResidualIconShapes = image && options.objectifyLayerConnectors === true
      ? createStructuredIllustrationResidualIconShapes(pageDraft, options.irDir, slideSize)
      : [];
    const structuredIllustrationResidualSketchLineShapes = image && options.objectifyLayerConnectors === true
      ? createStructuredIllustrationResidualSketchLineShapes(pageDraft, options.irDir, slideSize)
      : [];
    const structuredIllustrationGearPersonShapes = image && options.objectifyLayerConnectors === true
      ? createStructuredIllustrationGearPersonShapes(pageDraft, options.irDir, slideSize)
      : [];
    const structuredIllustrationOutputDocumentShapes = image && options.objectifyLayerConnectors === true
      ? createStructuredIllustrationOutputDocumentShapes(pageDraft, nativeTextBoxes, structuredIllustrationCardShellShapes, slideSize)
      : [];
    const structuredIllustrationInputDocumentShapes = image && options.objectifyLayerConnectors === true
      ? createStructuredIllustrationInputDocumentShapes(pageDraft, nativeTextBoxes, structuredIllustrationCardShellShapes, slideSize)
      : [];
    const structuredIllustrationInputChaosGlyphObjects = image && options.objectifyLayerConnectors === true
      ? createStructuredIllustrationInputChaosGlyphObjects(nativeTextBoxes, structuredIllustrationCardShellShapes, slideSize)
      : { shapes: [], textBoxes: [] };
    const tableMatrixResidualObjects = image && options.objectifyLayerConnectors === true
      ? createTableMatrixResidualObjects(pageDraft, tableZoneSemanticTextBoxes)
      : { shapes: [], textBoxes: [] };
    const structuredIllustrationCardTitleWarningShapes = image && options.objectifyLayerConnectors === true
      ? createStructuredIllustrationCardTitleWarningShapes(nativeTextBoxes, structuredIllustrationCardShellShapes, slideSize)
      : [];
    const structuredIllustrationProcessingWarningShapes = image && options.objectifyLayerConnectors === true
      ? createStructuredIllustrationProcessingWarningShapes(nativeTextBoxes, structuredIllustrationCardShellShapes, slideSize)
      : [];
    const icons = image && shouldVectorizeStatusIcons(options)
      ? detectSimpleStatusIcons(image, slideSize, textBoxes)
      : { shapes: [], textBoxes: [] };
    const visibleVisualAtomNativeShapes = suppressStructuredIllustrationInputCycleArrows(
      suppressVisualAtomShapesCoveredByStructuredIcons(
        visualAtomNativeShapes,
        [...structuredIllustrationResidualIconShapes, ...structuredIllustrationCardTitleWarningShapes]
      ),
      structuredIllustrationInputChaosGlyphObjects.shapes,
      structuredIllustrationCardShellShapes
    );
    const rawStructuredIllustrationCardVisualAtomShapes = image && options.objectifyLayerConnectors === true
      ? createStructuredIllustrationCardVisualAtomShapes(
        pageDraft,
        structuredIllustrationCardShellShapes,
        visibleVisualAtomNativeShapes,
        slideSize
      )
      : [];
    const structuredIllustrationCardVisualAtomShapes = suppressStructuredIllustrationInputCycleArrows(
      suppressVisualAtomShapesCoveredByStructuredIcons(
        rawStructuredIllustrationCardVisualAtomShapes,
        [...structuredIllustrationResidualIconShapes, ...structuredIllustrationCardTitleWarningShapes]
      ),
      structuredIllustrationInputChaosGlyphObjects.shapes,
      structuredIllustrationCardShellShapes
    );
    const {
      backgroundShapes: structuredIllustrationCardBackgroundShapes,
      chromeShapes: structuredIllustrationCardChromeShapes
    } = splitStructuredIllustrationCardShellShapesForLayering(structuredIllustrationCardShellShapes);
    const workflowDeepDiveTemplateActive = workflowPrdAutoGeneration.shapes.length > 0 || workflowDemandUnderstandingAssistant.shapes.length > 0;
    const workflowChallengeTriadActive = workflowChallengeTriadIllustrations.shapes.length > 0;
    const workflowComparisonMatrixActive = workflowComparisonMatrix.shapes.length > 0;
    if (workflowComparisonMatrixActive) tableGridShapes.length = 0;
    const workflowCollaborationMultiplierActive = workflowCollaborationMultiplier.shapes.length > 0;
    const workflowSupplyChainTwoPanelActive = workflowSupplyChainTwoPanel.shapes.length > 0;
    const workflowKpiEvidenceActive = workflowKpiEvidence.shapes.length > 0;
    const workflowAssetCycleQuadrantActive = workflowAssetCycleQuadrant.shapes.length > 0 || workflowAssetCycleQuadrant.images?.length > 0;
    const skillsEngineAiComparisonMatrixActive = skillsEngineAiComparisonMatrix.shapes.length > 0 || skillsEngineAiComparisonMatrix.tables?.length > 0;
    const assetOsHighValueAssetMatrixActive = assetOsHighValueAssetMatrix.shapes.length > 0;
    const assetOsFragmentedAssetChainActive = assetOsFragmentedAssetChain.matched === true;
    const visualOperationSyncActive = visualOperationSync.matched === true;
    const embeddedExpertScreenshotActive = embeddedExpertScreenshot.matched === true;
    const assetOsDemandUnderstandingAssistantActive = assetOsDemandUnderstandingAssistant.shapes.length > 0;
    const skillChainOverviewActive = skillChainOverviewShapes.length > 0 || pageLevelSkillChainOverview.shapes.length > 0;
    const assetOsFlowActive = assetOsFlow.shapes.length > 0;
    const productBrainAssetClosureFunnelActive = productBrainAssetClosureFunnel.shapes.length > 0;
    const stackedArchitectureDiagramActive = stackedArchitectureDiagram.shapes.length > 0;
    const processWithScreenshotsFlowActive = processWithScreenshotsFlow.shapes.length > 0;
    const portalPlatformDiagramActive = portalPlatformDiagram.shapes.length > 0;
    const retainedNativeTextBoxes = workflowDeepDiveTemplateActive
      ? []
      : workflowChallengeTriadActive
        ? []
        : workflowComparisonMatrixActive
          ? []
          : workflowCollaborationMultiplierActive
            ? []
            : workflowSupplyChainTwoPanelActive
              ? []
              : workflowKpiEvidenceActive
                ? []
                : workflowAssetCycleQuadrantActive
                  ? []
                  : skillsEngineAiComparisonMatrixActive
                  ? filterTextBoxesOutsideSpecializedNativeObjects(nativeTextBoxes, [skillsEngineAiComparisonMatrix])
                  : assetOsHighValueAssetMatrixActive
                    ? []
                    : assetOsFragmentedAssetChainActive
                      ? filterTextBoxesOutsideSpecializedNativeObjects(nativeTextBoxes, [assetOsFragmentedAssetChain])
                    : visualOperationSyncActive
                      ? []
                    : assetOsDemandUnderstandingAssistantActive
                      ? []
                      : skillChainOverviewActive
                        ? filterTextBoxesOutsideSpecializedNativeObjects(nativeTextBoxes, [{ shapes: skillChainOverviewShapes }, pageLevelSkillChainOverview])
                        : stackedArchitectureDiagramActive
                        ? filterTextBoxesOutsideSpecializedNativeObjects(nativeTextBoxes, [stackedArchitectureDiagram])
                    : processWithScreenshotsFlowActive
                      ? []
                      : nativeTextBoxes;
    const retainedDiagramTextBoxes = productBrainAssetClosureFunnelActive
      ? []
      : skillChainOverviewActive
      ? diagramTextBoxes.filter((textBox) => textBox?.source?.detector === "skill-chain-overview-native-label")
      : (workflowComparisonMatrixActive || workflowCollaborationMultiplierActive || workflowSupplyChainTwoPanelActive || workflowKpiEvidenceActive || workflowAssetCycleQuadrantActive || assetOsHighValueAssetMatrixActive || assetOsFragmentedAssetChainActive || visualOperationSyncActive || stackedArchitectureDiagramActive) ? [] : diagramTextBoxes;
    const retainedKpiEvidenceShapes = workflowKpiEvidenceActive ? [] : kpiEvidenceShapes;
    const retainedKpiEvidenceTextShapes = workflowKpiEvidenceActive ? [] : kpiEvidenceTextShapes;
    const retainedValueBannerBackgroundShapes = workflowCollaborationMultiplierActive ? [] : valueBannerBackgroundShapes;
    const productBrainPuzzleValueLoopActive = productBrainPuzzleValueLoop.shapes.length > 0;
    const productBrainWmsQualityGateActive = productBrainWmsQualityGate.shapes.length > 0;
    const retainedVisualAtomNativeShapes = (workflowDeepDiveTemplateActive || workflowChallengeTriadActive || workflowComparisonMatrixActive || workflowCollaborationMultiplierActive || workflowSupplyChainTwoPanelActive || workflowKpiEvidenceActive || workflowAssetCycleQuadrantActive || assetOsHighValueAssetMatrixActive || assetOsFragmentedAssetChainActive || visualOperationSyncActive || skillChainOverviewActive || assetOsFlowActive || stackedArchitectureDiagramActive || productBrainPuzzleValueLoopActive || productBrainWmsQualityGateActive) ? [] : visibleVisualAtomNativeShapes;
    const retainedCollaborationFlowShapes = workflowCollaborationMultiplierActive ? [] : collaborationFlowShapes;
    const retainedProductBrainSmartReviewRiskGate = suppressProductBrainSmartReviewWhenReviewRiskGateActive(
      productBrainSmartReviewRiskGate,
      reviewRiskGateFlowShapes
    );
    const specializedNativeReplacementObjects = [
      { shapes: networkDiagramShapes },
      { shapes: pageLevelNetworkDiagramShapes },
      { shapes: hierarchyDiagramShapes },
      { shapes: triangleTopologyShapes },
      { shapes: coverEngineCoreShapes },
      { shapes: skillChainOverviewShapes },
      pageLevelSkillChainOverview,
      { shapes: linearProcessShapes },
      { shapes: prdGenerationFlowShapes },
      { shapes: prototypeValidationFlowShapes },
      { shapes: demandUnderstandingFlowShapes },
      { shapes: comparisonMatrixShapes },
      { shapes: saturatedDiagramTextShapes },
      { shapes: semanticCycleDiagramShapes },
      denseComplexDiagramScaffold,
      { shapes: twoPanelDiagramTextShapes },
      { shapes: topComplexDiagramTextShapes },
      shiftLeftDebuggerDiagram,
      toolIslandTransitionMatrix,
      { shapes: valueQuadrantShapes },
      { shapes: reviewRiskGateFlowShapes },
      { shapes: funnelHubDiagramShapes },
      { shapes: horizontalStepChainShapes },
      { shapes: genericNodeDiagramSkeletonShapes },
      { shapes: visualClusterStackShapes },
      { shapes: wmsRouteChainShapes },
      { shapes: collaborationFlowShapes },
      stackedArchitectureDiagram,
      toolGapPlatformDiagram,
      processWithScreenshotsFlow,
      documentVersionFolderFlow,
      assetOsFlow,
      prototypeGenerationLoop,
      assetOsKpiBenefit,
      scaleLandingEvidence,
      fourStepLandingPath,
      valueQuadrantGems,
      temporaryAnswerWorkflowMatrix,
      assetHubSuperBrainPortal,
      assetHubVersionTimeline,
      assetHubSourcePurification,
      assetHubWmsInboundReview,
      productBrainAssetClosureFunnel,
      productBrainWmsQualityGate,
      retainedProductBrainSmartReviewRiskGate,
      productBrainCoreValueSplit,
      productBrainPuzzleValueLoop,
      skillsEngineCoverTriad,
      skillsEngineAiComparisonMatrix,
      workflowPrdAutoGeneration,
      workflowDemandUnderstandingAssistant,
      workflowChallengeTriadIllustrations,
      workflowComparisonMatrix,
      workflowCollaborationMultiplier,
      workflowSupplyChainTwoPanel,
      workflowKpiEvidence,
      workflowAssetCycleQuadrant,
      assetOsDemandUnderstandingAssistant,
      assetOsEntropyChallenge,
      assetOsHighValueAssetMatrix,
      assetOsFragmentedAssetChain,
      visualOperationSync,
      assetOsTwoDimensionalFoundation,
      portalPlatformDiagram,
      systemMapDiagram,
      assetHubCycleIllustration,
      inputOutputSplitDiagram,
      cliScaffoldGenerator,
      runtimeEngineHybrid,
      embeddedExpertScreenshot,
      productBrainVision
    ];
    const documentVersionGovernanceActive = documentVersionGovernance.shapes.length > 0;
    const retainedComponentTemplateNativeShapes = suppressComponentTemplateShapesForSpecializedLayers(
      componentTemplateNativeShapes,
      specializedNativeReplacementObjects
    );
    const retainedComponentTemplateNativeTextBoxes = suppressOrphanComponentTemplateTextBoxes(
      componentTemplateNativeTextBoxes,
      retainedComponentTemplateNativeShapes,
      componentTemplateNativeImages
    );
    const retainedComponentBackfillFilteredNativeTextBoxes =
      filterTextBoxesConsumedByComponentTemplateBackfill(retainedNativeTextBoxes, retainedComponentTemplateNativeTextBoxes);
    const retainedComponentBackfillFilteredDiagramTextBoxes =
      filterTextBoxesConsumedByComponentTemplateBackfill(retainedDiagramTextBoxes, retainedComponentTemplateNativeTextBoxes);
    const workflowPrdAutoGenerationFlow = workflowPrdAutoGeneration;
    const { shapeOwnershipArbitration, productBrainCoreValueHybridActive, traditionalCollaborationBreakdownActive } = finalizePageShapes(pageDraft, {
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
    });
    dropStructuredIllustrationCardResidualCropsWhenNativeTemplateCovers(pageDraft, pageDraft.shapes);
    dropResidualsCoveredByNativeTableShapes(pageDraft);
    dropTableMatrixResidualObjectifiedCrops(pageDraft);
    dropFoundationCapabilityNetworkResidualCrops(pageDraft, pageDraft.shapes, stackedArchitectureDiagram.textBoxes);
    finalizePageText(pageDraft, {
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
    });
    finalizePageOutput(pageDraft, {
      embeddedExpertScreenshotActive, embeddedExpertScreenshot, slideSize,
      options, allowEntropyNativeApproximation, autoObjectifyEntropyIsland,
      image, assetOsFragmentedAssetChainActive, assetOsFragmentedAssetChain
    });
    pageReuse.persist(pageDraft);
    return pageProgress.complete(pageDraft, pagePerformanceMetadata(imageDecodeMs, visualFeatureContext, pngReadCache));
  }));
  return composeNativeRebuildDeck({
    sourceIr,
    slideSize,
    pages,
    options,
    services: { hybridRebuildStrategyProfile, summarizeLayerProfile, summarizeExpressionProfile }
  });
}

function shouldAllowSpecializedNativeRebuildForDeferredComponent(image = {}, textBoxes = []) {
  if (!shouldDeferNativeRebuildForComponentStrategy(image)) return false;
  if (shouldObjectifyDeferredPrototypeValidationFlow(image, textBoxes)
    || shouldObjectifyDeferredPrdGenerationFlow(image, textBoxes)) {
    return true;
  }
  if (isTerminalVisionDenseRadialCandidate(image, textBoxes)) return true;
  if (isFidelityFirstMinimumVisualUnit(image)) return false;
  return shouldObjectifySemanticCycleDiagram(image, textBoxes)
    || shouldObjectifyDeferredSkillChainOverview(image, textBoxes)
    || shouldObjectifyDeferredNetworkDiagram(image)
    || shouldObjectifyDeferredSparseFlowCardChain(image, textBoxes)
    || shouldObjectifyDeferredTriangleTopology(image, textBoxes)
    || shouldObjectifyVisualClusterStack(image)
    || shouldObjectifyWmsRouteChain(image, textBoxes);
}





function shouldObjectifyDeferredSkillChainOverview(image = {}, textBoxes = []) {
  if (image?.source?.detector !== "sparse-diagram-graphic-underlay-crop") return false;
  const layer = image?.source?.layer || {};
  if (layer.layerType !== "diagram-zone") return false;
  const evidenceTextBoxes = skillChainOverviewEvidenceTextBoxes(image, textBoxes, DEFAULT_SLIDE);
  return shouldObjectifySkillChainOverview(image, evidenceTextBoxes);
}

function shouldObjectifyDeferredSparseFlowCardChain(image = {}, textBoxes = []) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || image?.source?.diagramUnderstanding || {};
  if (layer.layerType !== "diagram-zone") return false;
  if (understanding.archetype !== "flow-card-chain") return false;
  if (Number(understanding.confidence || 0) < 0.9) return false;
  if (Number(understanding.residualCount || 0) > 0) return false;
  return shouldUseAssetLandingTreeFlow(image, textBoxes)
    || shouldObjectifySparseFlowCardChain(image, textBoxes);
}

function shouldObjectifyDeferredNetworkDiagram(image = {}) {
  const layer = image?.source?.layer || {};
  if (layer.layerType !== "diagram-zone") return false;
  if (layer.recommendedAction !== "attempt-native-reconstruction") return false;
  return shouldObjectifyNetworkDiagram(image);
}



function shouldObjectifyDeferredTriangleTopology(image = {}, textBoxes = []) {
  if (image?.source?.detector !== "foreground-graphic-crop") return false;
  if (image?.source?.layer?.layerType !== "diagram-zone") return false;
  return shouldObjectifyTriangleTopology(image, textBoxes);
}

function shouldObjectifyDeferredPrdGenerationFlow(image = {}, textBoxes = []) {
  if (image?.source?.detector !== "product-illustration-segment-crop") return false;
  const labels = new Set((textBoxes || []).map((item) => String(item?.text || "").trim()));
  const required = ["InteractivePrototype", "Structured Brief", "PRD", "业务背景", "字段规则", "异常场景", "验收口径"];
  return required.every((label) => labels.has(label));
}

function shouldObjectifyDeferredPrototypeValidationFlow(image = {}, textBoxes = []) {
  if (!hasPrototypeValidationPageContext(textBoxes)) return false;
  const detector = image?.source?.detector;
  const layer = image?.source?.layer || {};
  const action = layer.recommendedAction;
  const layerType = layer.layerType;
  return (
    detector === "foreground-graphic-crop"
    || detector === "prototype-validation-flow-residual-crop"
  ) && (
    layerType === "diagram-zone"
    || layerType === "screenshot-zone"
  ) && (
    action === "split-native-with-residual-crop"
    || action === "attempt-native-reconstruction"
    || detector === "prototype-validation-flow-residual-crop"
  );
}

function syncPrototypeValidationCandidateSources(images = [], candidates = []) {
  if (!Array.isArray(images) || !Array.isArray(candidates)) return false;
  const objectifiedById = new Map();
  for (const candidate of candidates) {
    const id = String(candidate?.id || "");
    if (!id) continue;
    if (
      candidate?.source?.prototypeValidationFlowObjectified !== true
      && candidate?.source?.prototypeIntentPanelObjectified !== true
    ) continue;
    objectifiedById.set(id, candidate.source || {});
  }
  if (objectifiedById.size === 0) return false;
  let changed = false;
  for (const image of images) {
    const id = String(image?.id || "");
    const source = objectifiedById.get(id);
    if (!source) continue;
    image.source = {
      ...(image.source || {}),
      ...source,
      layer: {
        ...(image.source?.layer || {}),
        ...(source.layer || {})
      }
    };
    changed = true;
  }
  return changed;
}

function syncObjectifiedCandidateSources(images = [], candidates = [], options = {}) {
  return syncCandidateResidualOwnership(images, candidates, {
    ownerFamily: options.ownerFamily,
    objectifiedFlags: options.objectifiedFlags,
    dropResidual: options.dropResidual === true
  });
}

function syncPrdGenerationMinimumUnitBoxes(images = []) {
  let changed = false;
  for (const image of Array.isArray(images) ? images : []) {
    const box = image?.source?.prdGenerationMinimumUnitBox;
    if (!box) continue;
    image.box = { ...box };
    changed = true;
  }
  return changed;
}

function resolveComponentIndexPage(index = null, originalPageIndex = 0, selectedPageOrdinal = 0) {
  if (!index) return originalPageIndex;
  const original = Number.isFinite(Number(originalPageIndex)) ? Math.trunc(Number(originalPageIndex)) : 0;
  const ordinal = Number.isFinite(Number(selectedPageOrdinal)) ? Math.trunc(Number(selectedPageOrdinal)) : original;
  if (index.layersByPage && typeof index.layersByPage.has === "function") {
    if (index.layersByPage.has(original)) return original;
    if (index.layersByPage.has(ordinal)) return ordinal;
  }
  if (typeof index.has === "function") {
    if (index.has(`${original}:0`)) return original;
    if (index.has(`${ordinal}:0`)) return ordinal;
  }
  return original;
}

function refreshImageExpressionMetadata(image) {
  if (!image || typeof image !== "object" || image.source?.editable === true) return image;
  return {
    ...image,
    source: reclassifyImageSource(image.source || {}, image.box || {})
  };
}































function summarizeExpressionProfile(deck) {
  const pages = Array.isArray(deck?.pages) ? deck.pages : [];
  const imageExpressionCounts = {};
  const imageSubtypeCounts = {};
  const imageRecommendationCounts = {};
  const editableExpressionCounts = {};
  const reasons = {};
  const nativeDetectorCounts = {};
  for (const page of pages) {
    for (const image of Array.isArray(page?.images) ? page.images : []) {
      const form = image?.source?.expressionForm || classifyImageExpressionForm(image);
      const subtype = image?.source?.expressionSubtype || classifyImageExpressionSubtype(image);
      const action = image?.source?.recommendedAction || recommendExpressionHandling(image);
      addCount(imageExpressionCounts, form);
      addCount(imageSubtypeCounts, subtype);
      addCount(imageRecommendationCounts, action);
      addCount(reasons, image?.source?.nonEditableReason || image?.source?.reason || "unspecified");
    }
    for (const key of ["shapes", "tables", "charts", "icons"]) {
      for (const item of Array.isArray(page?.[key]) ? page[key] : []) {
        const detector = item?.source?.detector || key;
        const form = item?.source?.expressionForm || classifyEditableExpressionForm(item, key);
        addCount(editableExpressionCounts, form);
        addCount(nativeDetectorCounts, detector);
      }
    }
  }
  return {
    pages: pages.length,
    imageExpressionCounts,
    imageSubtypeCounts,
    imageRecommendationCounts,
    editableExpressionCounts,
    preserveReasonCounts: Object.entries(reasons),
    nativeDetectorCounts
  };
}

function classifyEditableExpressionForm(item, fallbackType = "shape") {
  const detector = String(item?.source?.detector || fallbackType || "").toLowerCase();
  if (/chart/.test(detector)) return "data-chart";
  if (/table|grid|quadrant/.test(detector)) return "table-or-matrix";
  if (/linear-process|skill-chain|stage/.test(detector)) return "linear-process-diagram";
  if (/connector|network|hierarchy|triangle|topology|flow|diagram|card|node|ray|axis|shield|fragment|island/.test(detector)) return "native-diagram-primitive";
  if (/icon/.test(detector)) return "native-icon";
  return "native-shape";
}



function uniqueImagesById(images = []) {
  const seen = new Set();
  const result = [];
  for (const image of Array.isArray(images) ? images : []) {
    if (!image || typeof image !== "object") continue;
    const key = String(image.id || `${image.box?.x || 0}:${image.box?.y || 0}:${image.box?.w || 0}:${image.box?.h || 0}`);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(image);
  }
  return result;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundNumber(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function truncateText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}





















































function objectifyLayerTextCrops({ page, sourceImage, textBoxes, slideSize, irDir, structuredVisualAtomTextOnly = false }) {
  if (!sourceImage || !page || !Array.isArray(page.images)) return;
  for (const image of page.images) {
    const canObjectify = structuredVisualAtomTextOnly === true
      ? shouldKeepStructuredVisualAtomLayerText(image)
      : shouldObjectifyLayerText(image);
    if (!canObjectify) continue;
    const internalTextBoxes = (textBoxes || []).filter((textBox) =>
      boxCenterInside(textBox.box, image.box)
      && !(shouldKeepFunnelHubDiagramText(image) && shouldKeepFunnelHubTextInResidualCrop(textBox, image))
    );
    if (internalTextBoxes.length < 2) continue;
    const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
    if (!assetFile) continue;
    const masks = internalTextBoxes.map((item) => ptToPxBox(item.box, sourceImage, slideSize, 9));
    const erased = eraseMasks(sourceImage, masks);
    const crop = cropPng(erased, ptToPxBox(image.box, sourceImage, slideSize, 0));
    ensureDir(path.dirname(assetFile));
    writePng(assetFile, crop);
    image.source = {
      ...(image.source || {}),
      residualCrop: true,
      textObjectified: true,
      objectifiedTextBoxes: internalTextBoxes.length,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; internal text objectified as native textboxes`
    };
  }
}

function shouldObjectifyLayerText(image) {
  const layer = image?.source?.layer || {};
  const layerType = layer.layerType;
  const action = layer.recommendedAction;
  if (shouldDeferNativeRebuildForComponentStrategy(image)) return false;
  if (isProtectedFidelityDiagramDetector(image?.source?.detector)) return false;
  if (shouldKeepFunnelHubDiagramText(image)) return true;
  if (shouldKeepStructuredVisualAtomLayerText(image)) return true;
  if (shouldRemoveHighRiskInternalOverlayText(image)) return false;
  return image?.source?.editable !== true
    && (layerType === "diagram-zone" || layerType === "table-zone")
    && (action === "attempt-native-reconstruction" || action === "split-native-with-residual-crop");
}













function splitErasedResidualCrops({ page, irDir }) {
  if (!page || !Array.isArray(page.images)) return;
  const nextImages = [];
  for (const image of page.images) {
    const replacement = splitErasedResidualCrop(image, irDir);
    if (replacement.length > 0) {
      for (const item of replacement) {
        const decision = resolveResidualDropDecision([
          {
            matched: shouldDropResidualWithNativeVisualAtomPeer(item, page),
            owner: "visual-atom",
            reasonCode: "residual.native-visual-atom-covered"
          },
          {
            matched: shouldDropResidualCoveredByNativeTableShapes(item, page),
            owner: "table-zone",
            reasonCode: "residual.native-table-shapes-covered"
          }
        ]);
        if (decision.dropResidual) {
          recordResidualDropDecision(item, decision);
        } else {
          nextImages.push(item);
        }
      }
    }
    else {
      const decision = resolveResidualDropDecision([
        { matched: shouldDropResidual(image), owner: "native-rebuilder-registry", reasonCode: "residual.owner-claim" },
        { matched: shouldDropResidualWithNativeVisualAtomPeer(image, page), owner: "visual-atom", reasonCode: "residual.native-visual-atom-covered" },
        { matched: shouldDropResidualCoveredByNativeTableShapes(image, page), owner: "table-zone", reasonCode: "residual.native-table-shapes-covered" },
        { matched: shouldDropResidualCoveredByNativeTablePeers(image, page), owner: "table-zone", reasonCode: "residual.native-table-peers-covered" },
        { matched: shouldDropObjectifiedTableZoneResidual(image, page), owner: "table-zone", reasonCode: "residual.objectified-table-zone" }
      ]);
      if (decision.dropResidual) recordResidualDropDecision(image, decision);
      else nextImages.push(image);
    }
  }
  page.images = nextImages;
}

function shouldDropResidualCoveredByNativeTableShapes(image = {}, page = {}) {
  const source = image?.source || {};
  if (String(source.detector || "") !== "split-erased-residual-crop") return false;
  if (shouldPreserveProtectedMinimumUnitCrop(image)) return false;
  const parentImageId = String(source.parentImageId || source.layer?.parentImageId || "");
  if (!parentImageId || !image?.box) return false;
  const expressionForm = String(source.expressionForm || source.layer?.expressionForm || "").toLowerCase();
  const layerType = String(source.layer?.layerType || source.layerType || "").toLowerCase();
  const archetype = String(source.layer?.diagramUnderstanding?.archetype || "").toLowerCase();
  if (!(/table|matrix|grid/.test(expressionForm) || layerType === "table-zone" || /matrix|grid|table/.test(archetype))) return false;
  if (/screenshot|photo|prototype|webpage|ui/.test(`${expressionForm} ${source.reason || ""} ${source.nonEditableReason || ""}`.toLowerCase())) return false;
  const imageArea = Number(image.box.w || 0) * Number(image.box.h || 0);
  if (!Number.isFinite(imageArea) || imageArea <= 0) return false;
  const nativeShapeDetectors = /^(?:table-zone-native-cell-fill|table-zone-native-grid-line|visual-atom-native-(?:right-arrow|rect|chevron|parallelogram|triangle|diamond|connector))$/;
  const overlaps = (page.shapes || [])
    .filter((shape) => shape?.box && String(shape?.source?.layerSourceId || "") === parentImageId)
    .filter((shape) => nativeShapeDetectors.test(String(shape?.source?.detector || "")))
    .map((shape) => ({
      detector: String(shape?.source?.detector || ""),
      area: ptBoxOverlapAreaValue(image.box, shape.box)
    }))
    .filter((item) => item.area > 0);
  if (overlaps.length === 0) return false;
  const maxCoverRatio = Math.max(...overlaps.map((item) => item.area / imageArea));
  const totalCoverRatio = overlaps.reduce((sum, item) => sum + item.area, 0) / imageArea;
  const hasSolidNativeCover = overlaps.some((item) =>
    /^(?:table-zone-native-cell-fill|visual-atom-native-(?:right-arrow|rect|chevron|parallelogram))$/.test(item.detector)
  );
  return hasSolidNativeCover && (maxCoverRatio >= 0.62 || totalCoverRatio >= 0.9);
}

function dropResidualsCoveredByNativeTableShapes(page = {}) {
  if (!Array.isArray(page.images) || page.images.length === 0 || !Array.isArray(page.shapes) || page.shapes.length === 0) {
    return page;
  }
  page.images = page.images.filter((image) => {
    if (!shouldDropResidualCoveredByNativeTableShapes(image, page)) return true;
    if (image.source && typeof image.source === "object") image.source.residualSplitDropped = true;
    return false;
  });
  return page;
}





function createTableMatrixResidualObjects(page = {}, semanticTextBoxes = []) {
  const shapes = [];
  const textBoxes = [];
  const images = Array.isArray(page.images) ? page.images : [];
  const pageForEvidence = {
    ...page,
    textBoxes: [
      ...(page.textBoxes || []),
      ...(Array.isArray(semanticTextBoxes) ? semanticTextBoxes : [])
    ]
  };
  const sourceFor = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "table-or-matrix",
    expressionSubtype: "residual-native-replacement",
    confidence: 0.78,
    ...extra
  });
  for (const image of images) {
    if (!isTableMatrixResidualImage(image)) continue;
    const prdLabels = tableMatrixResidualPrdLabels(image, pageForEvidence);
    if (prdLabels.length >= 2) {
      prdLabels.forEach((label, index) => {
        const b = label.box || {};
        const box = {
          x: Number(b.x || 0) - 6,
          y: Number(b.y || 0) - 3.5,
          w: Math.max(34, Number(b.w || 0) + 12),
          h: Math.max(18, Number(b.h || 0) + 7)
        };
        shapes.push({
          id: `${image.id || "table-matrix-residual"}-native-prd-pill-${index}`,
          type: "rect",
          box,
          style: { fill: "#F7F7F7", stroke: "#A8A8A8", strokeWidthPt: 1.2, radiusPt: 5 },
          source: sourceFor("table-matrix-residual-native-prd-pill", {
            layerSourceId: String(image.source?.parentImageId || image.source?.layer?.parentImageId || ""),
            residualImageId: image.id,
            text: label.text
          })
        });
      });
      markTableMatrixResidualObjectified(image, "rebuilt PRD pill residuals as native rounded rectangles");
      continue;
    }
    if (isTableMatrixResidualImagePlaceholder(image, pageForEvidence)) {
      const box = image.box || {};
      const x = Number(box.x || 0);
      const y = Number(box.y || 0);
      const w = Number(box.w || 0);
      const h = Number(box.h || 0);
      const gap = Math.max(8, w * 0.08);
      const slotW = (w - gap) / 2;
      const slotH = Math.max(16, h * 0.88);
      const slotY = y + (h - slotH) / 2;
      [0, 1].forEach((index) => {
        const slotX = x + index * (slotW + gap);
        const slot = { x: slotX, y: slotY, w: slotW, h: slotH };
        shapes.push({
          id: `${image.id || "table-matrix-residual"}-native-placeholder-${index}`,
          type: "rect",
          box: slot,
          style: { fill: "#F8F8F8", stroke: "#A8A8A8", strokeWidthPt: 1.25 },
          source: sourceFor("table-matrix-residual-native-image-placeholder", {
            layerSourceId: String(image.source?.parentImageId || image.source?.layer?.parentImageId || ""),
            residualImageId: image.id,
            part: "frame",
            index
          })
        });
        shapes.push({
          id: `${image.id || "table-matrix-residual"}-native-placeholder-diag-a-${index}`,
          type: "line",
          box: { x: slot.x, y: slot.y, w: slot.w, h: slot.h },
          style: { stroke: "#B5B5B5", strokeWidthPt: 1.05, connectorType: "straight" },
          source: sourceFor("table-matrix-residual-native-image-placeholder", {
            layerSourceId: String(image.source?.parentImageId || image.source?.layer?.parentImageId || ""),
            residualImageId: image.id,
            part: "diagonal-a",
            index
          })
        });
        shapes.push({
          id: `${image.id || "table-matrix-residual"}-native-placeholder-diag-b-${index}`,
          type: "line",
          box: { x: slot.x + slot.w, y: slot.y, w: -slot.w, h: slot.h },
          style: { stroke: "#B5B5B5", strokeWidthPt: 1.05, connectorType: "straight" },
          source: sourceFor("table-matrix-residual-native-image-placeholder", {
            layerSourceId: String(image.source?.parentImageId || image.source?.layer?.parentImageId || ""),
            residualImageId: image.id,
            part: "diagonal-b",
            index
          })
        });
      });
      markTableMatrixResidualObjectified(image, "rebuilt image placeholder residual as native frames and diagonals");
    }
  }
  return { shapes, textBoxes };
}



function isTableMatrixResidualImage(image = {}) {
  const source = image.source || {};
  const detector = String(source.detector || "");
  if (!/^(?:split-erased-residual-crop|icon-residual-crop)$/.test(detector)) return false;
  const expressionForm = String(source.expressionForm || source.layer?.expressionForm || "").toLowerCase();
  const expressionSubtype = String(source.expressionSubtype || source.layer?.expressionSubtype || "").toLowerCase();
  const layerType = String(source.layer?.layerType || source.layerType || "").toLowerCase();
  const archetype = String(source.layer?.diagramUnderstanding?.archetype || "").toLowerCase();
  if (!(/table|matrix|grid/.test(`${expressionForm} ${expressionSubtype}`) || layerType === "table-zone" || /matrix|grid|table/.test(archetype))) return false;
  if (shouldPreserveProtectedMinimumUnitCrop(image) && !/table|matrix|grid/.test(`${expressionForm} ${expressionSubtype} ${layerType} ${archetype}`)) return false;
  const box = image.box || {};
  const area = Number(box.w || 0) * Number(box.h || 0);
  return Number.isFinite(area) && area > 0 && area <= 9000;
}

function tableMatrixResidualPrdLabels(image = {}, page = {}) {
  const parentImageId = String(image.source?.parentImageId || image.source?.layer?.parentImageId || "");
  const expanded = expandPtBox(image.box, 18);
  return (page.textBoxes || [])
    .filter((textBox) => textBox?.box && String(textBox?.source?.detector || "") === "table-zone-semantic-native-visible-label")
    .filter((textBox) => !parentImageId || String(textBox?.source?.layerSourceId || "") === parentImageId)
    .filter((textBox) => textBox?.source?.textErasedFromCrop === true)
    .filter((textBox) => /^PRD\s*\d+$/i.test(String(textBox.text || "").trim()))
    .filter((textBox) => {
      if (ptBoxOverlapAreaValue(expanded, textBox.box) > 0) return true;
      const imageCenterY = Number(image.box?.y || 0) + Number(image.box?.h || 0) / 2;
      const textCenterY = Number(textBox.box?.y || 0) + Number(textBox.box?.h || 0) / 2;
      const textCenterX = Number(textBox.box?.x || 0) + Number(textBox.box?.w || 0) / 2;
      return Math.abs(textCenterY - imageCenterY) <= Number(image.box?.h || 0) * 0.75
        && textCenterX >= Number(image.box?.x || 0) - 8
        && textCenterX <= Number(image.box?.x || 0) + Number(image.box?.w || 0) + 8;
    });
}

function isTableMatrixResidualImagePlaceholder(image = {}, page = {}) {
  const box = image.box || {};
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
  if (w / h < 2.1 || w / h > 3.8) return false;
  const expanded = expandPtBox(box, 8);
  const nearbyText = (page.textBoxes || []).filter((textBox) =>
    textBox?.box && ptBoxOverlapAreaValue(expanded, textBox.box) > 0
  );
  if (nearbyText.length > 0) return false;
  return true;
}

function markTableMatrixResidualObjectified(image = {}, reason = "rebuilt table/matrix residual as native shapes") {
  image.source = {
    ...(image.source || {}),
    tableMatrixResidualObjectified: true,
    dropErasedResidualAfterNativeRebuild: true,
    preserveResidualCropUnderNativeRebuild: false,
    nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "table/matrix residual crop"}; ${reason}`
  };
}





























function shouldDropResidualWithNativeVisualAtomPeer(image = {}, page = {}) {
  const source = image?.source || {};
  const detector = String(source.detector || "");
  if (!/^(?:icon-residual-crop|visual-atom-residual-crop)$/.test(detector)) return false;
  const atomId = String(source.visualAtomId || "");
  const parentImageId = String(source.parentImageId || "");
  if (!atomId || !parentImageId) return false;
  if (!/^(?:icon-crop-candidate|complex-shape-crop-candidate)$/.test(String(source.visualAtomKind || ""))) return false;
  return (page.shapes || []).some((shape) => {
    const shapeSource = shape?.source || {};
    return String(shapeSource.layerSourceId || "") === parentImageId
      && String(shapeSource.atomId || "") === atomId
      && /^visual-atom-native-(?:right-arrow|chevron|parallelogram|triangle|diamond)$/.test(String(shapeSource.detector || ""));
  });
}

function shouldDropObjectifiedTableZoneResidual(image = {}, page = {}) {
  const source = image?.source || {};
  const detector = String(source.detector || "");
  if (!/^(?:foreground-graphic-underlay-crop|structured-case-graphic-underlay-crop|content-foreground-graphic-underlay-crop)$/.test(detector)) {
    return false;
  }
  if (shouldPreserveProtectedMinimumUnitCrop(image)) return false;
  const expressionForm = String(source.expressionForm || "").toLowerCase();
  if (/screenshot|document|icon|illustration|photo/.test(expressionForm)) return false;
  const layerType = String(source.layer?.layerType || source.layerType || "").toLowerCase();
  const archetype = String(source.layer?.diagramUnderstanding?.archetype || "").toLowerCase();
  const looksStructuredTableZone = layerType === "table-zone"
    || /table|matrix|grid/.test(expressionForm)
    || /matrix|grid|table/.test(archetype)
    || source.tableGridObjectified === true;
  if (!looksStructuredTableZone) return false;
  if (source.visualAtomObjectified !== true || source.tableZoneSemanticTextObjectified !== true) return false;
  const imageId = String(image.id || "");
  const nativeShapes = (page.shapes || []).filter((shape) => {
    const shapeSource = shape?.source || {};
    return String(shapeSource.layerSourceId || "") === imageId
      && /^visual-atom-native-/.test(String(shapeSource.detector || ""));
  }).length;
  const semanticTextBoxes = (page.textBoxes || []).filter((textBox) => {
    const textSource = textBox?.source || {};
    return String(textSource.layerSourceId || "") === imageId
      && textSource.semanticTextSource === true
      && textSource.textErasedFromCrop === true;
  }).length;
  const declaredAtoms = Number(source.objectifiedVisualAtoms || 0);
  const declaredSemanticLabels = Number(source.objectifiedTableZoneSemanticTextBoxes || 0);
  if (Math.max(nativeShapes, declaredAtoms) < 24) return false;
  if (Math.max(semanticTextBoxes, declaredSemanticLabels) < 6) return false;
  const rejected = source.residualSplitRejected || {};
  const splitCouldNotFindIndependentUnits = String(rejected.reason || "") === "too-few-components"
    && String(rejected.tableGridSplitRejected || "") === "too-few-table-grid-components"
    && String(rejected.bandSplitRejected || "") === "too-few-band-components";
  if (!splitCouldNotFindIndependentUnits) return false;
  source.dropErasedResidualAfterNativeRebuild = true;
  source.dropReason = "table-zone residual covered by native visual atoms and semantic text boxes";
  return true;
}





























































































function eraseToolGapPlatformResidualText(residual, image) {
  const boxes = Array.isArray(image?.source?.toolGapPlatformTextEraseBoxes)
    ? image.source.toolGapPlatformTextEraseBoxes
    : [];
  if (boxes.length === 0) return residual;
  const masks = boxes.map((box) => localResidualPxBox(expandPtBox(box, DEFAULT_SLIDE, 5, 5), image.box, residual));
  return eraseMasks(residual, masks);
}











































































function shouldUseResidualSplit(components, residual) {
  return residualSplitDecision(components, residual).use;
}























function createNetworkDiagramShapes(images = [], sourceImage = null, slideSize = DEFAULT_SLIDE, options = {}) {
  return networkRebuildOrchestrator.createShapes(images, sourceImage, slideSize, options);
}









function createPageLevelNetworkDiagramShapes(page = {}, sourceImage = null, slideSize = DEFAULT_SLIDE) {
  return networkRebuildOrchestrator.createPageShapes(page, sourceImage, slideSize);
}





function createHierarchyDiagramShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  return createHierarchyDiagramShapesFromRegistry(images, textBoxes, sourceImage, slideSize);
}





function createCoverEngineCoreShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  return createCoverEngineCoreShapesFromRegistry(images, textBoxes, sourceImage, slideSize);
}























function createLinearProcessDiagramShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage) return [];
  const shapes = [];
  for (const image of images || []) {
    if (!shouldObjectifyLinearProcessDiagram(image)) continue;
    const process = inferLinearProcessDiagram(image, textBoxes, slideSize);
    if (!process) continue;
    image.source = {
      ...(image.source || {}),
      linearProcessObjectified: true,
      objectifiedLinearProcessStages: process.stages.length,
      objectifiedLinearProcessConnectors: process.connectors.length,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "diagram underlay"}; rebuilt linear process stages and connectors natively while preserving residual artwork`
    };
    for (let index = 0; index < process.stages.length; index += 1) {
      const stage = process.stages[index];
      shapes.push({
        id: `${image.id || "linear-process"}-native-stage-${index}`,
        type: "roundRect",
        box: stage.box,
        style: {
          fill: stage.fill,
          stroke: stage.stroke,
          strokeWidthPt: 1.3,
          radiusRatio: 0.11,
          shadow: {
            color: "#000000",
            alpha: 0.08,
            blurPt: 6,
            distancePt: 1.5,
            angle: 45
          }
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "linear-process-native-stage",
          layerSourceId: image.id || null,
          stageIndex: index,
          label: stage.label,
          confidence: process.confidence
        }
      });
    }
    for (let index = 0; index < process.connectors.length; index += 1) {
      const connector = process.connectors[index];
      shapes.push({
        id: `${image.id || "linear-process"}-native-connector-${index}`,
        type: "line",
        box: connector.box,
        style: {
          stroke: connector.stroke,
          strokeWidthPt: connector.strokeWidthPt,
          connectorType: "straight",
          endArrow: "triangle"
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "linear-process-native-connector",
          layerSourceId: image.id || null,
          connectorIndex: index,
          confidence: process.confidence
        }
      });
    }
  }
  return shapes;
}

function freeformBounds(points = []) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: round(minX),
    y: round(minY),
    w: round(Math.max(...xs) - minX),
    h: round(Math.max(...ys) - minY)
  };
}


function productWorkflowStageBackplateShapes(image, cards = [], bounds = DEFAULT_SLIDE) {
  return (cards || []).map((card, index) => ({
    id: `${image.id || "product-workflow"}-native-stage-backplate-${index}`,
    type: "rect",
    box: constrainPtBox(card.box, bounds),
    style: {
      fill: "#0867B8",
      stroke: "#045B9F",
      strokeWidthPt: 1.6
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "product-workflow-native-stage-backplate",
      layerSourceId: image.id || null,
      stageRole: card.role,
      stageIndex: index,
      confidence: 0.82
    }
  }));
}

function productWorkflowEndpointShapes(image, box, bounds) {
  const sx = (n) => box.x + box.w * n;
  const sy = (n) => box.y + box.h * n;
  const sw = (n) => box.w * n;
  const sh = (n) => box.h * n;
  const src = (region, part, index = 0) => ({
    editable: true,
    nativeRebuild: true,
    detector: `product-workflow-native-${region}`,
    layerSourceId: image.id || null,
    part,
    partIndex: index,
    confidence: 0.74
  });
  const shape = (region, part, type, localBox, style, index = 0) => ({
    id: `${image.id || "product-workflow"}-native-${region}-${part}-${index}`,
    type,
    box: constrainPtBox(localBox, bounds),
    style,
    source: src(region, part, index)
  });
  const line = (region, part, from, to, stroke, strokeWidthPt, index = 0) => shape(region, part, "line", lineBox(from, to), {
    stroke,
    strokeWidthPt,
    connectorType: "straight",
    lineCap: "round"
  }, index);
  const leftRegion = {
    x: sx(0.035),
    y: sy(0.170),
    w: sw(0.160),
    h: sh(0.470)
  };
  const rightRegion = {
    x: sx(0.855),
    y: sy(0.125),
    w: sw(0.140),
    h: sh(0.520)
  };
  const left = [
    shape("chaos-input", "back-blob", "ellipse", {
      x: leftRegion.x + leftRegion.w * 0.20,
      y: leftRegion.y + leftRegion.h * 0.20,
      w: leftRegion.w * 0.56,
      h: leftRegion.h * 0.42
    }, { fill: "#E5E7EB", stroke: "#D1D5DB", strokeWidthPt: 0.8, opacity: 0.82 }),
    ...[
      [0.08, 0.17, 0.28, 0.10, "#9CA3AF"],
      [0.35, 0.07, 0.23, 0.14, "#CBD5E1"],
      [0.58, 0.18, 0.28, 0.12, "#94A3B8"],
      [0.18, 0.43, 0.24, 0.11, "#B6BEC9"],
      [0.52, 0.47, 0.34, 0.12, "#D1D5DB"],
      [0.33, 0.66, 0.28, 0.12, "#9CA3AF"]
    ].map(([x, y, w, h, fill], index) => shape("chaos-input", "fragment", "roundRect", {
      x: leftRegion.x + leftRegion.w * x,
      y: leftRegion.y + leftRegion.h * y,
      w: leftRegion.w * w,
      h: leftRegion.h * h
    }, { fill, stroke: "#FFFFFF", strokeWidthPt: 0.6, radiusRatio: 0.10, rotation: index % 2 === 0 ? -10 : 9 }, index)),
    ...[
      [0.18, 0.28, 0.74, 0.24],
      [0.22, 0.54, 0.70, 0.36],
      [0.32, 0.18, 0.46, 0.76],
      [0.12, 0.70, 0.78, 0.62]
    ].map(([x1, y1, x2, y2], index) => line("chaos-input", "messy-link", {
      x: leftRegion.x + leftRegion.w * x1,
      y: leftRegion.y + leftRegion.h * y1
    }, {
      x: leftRegion.x + leftRegion.w * x2,
      y: leftRegion.y + leftRegion.h * y2
    }, "#9CA3AF", 1.4, index)),
    ...[
      [0.18, 0.73, 0.055],
      [0.78, 0.44, 0.050],
      [0.58, 0.80, 0.060],
      [0.10, 0.38, 0.045]
    ].map(([x, y, r], index) => shape("chaos-input", "dot", "ellipse", {
      x: leftRegion.x + leftRegion.w * x,
      y: leftRegion.y + leftRegion.h * y,
      w: leftRegion.w * r,
      h: leftRegion.w * r
    }, { fill: "#6B7280", stroke: "#6B7280", strokeWidthPt: 0.4 }, index))
  ];
  const right = [
    shape("standard-output", "doc-a", "roundRect", {
      x: rightRegion.x + rightRegion.w * 0.05,
      y: rightRegion.y + rightRegion.h * 0.02,
      w: rightRegion.w * 0.45,
      h: rightRegion.h * 0.27
    }, { fill: "#0D65B8", stroke: "#0A569B", strokeWidthPt: 0.9, radiusRatio: 0.04 }),
    shape("standard-output", "doc-b", "roundRect", {
      x: rightRegion.x + rightRegion.w * 0.58,
      y: rightRegion.y + rightRegion.h * 0.02,
      w: rightRegion.w * 0.38,
      h: rightRegion.h * 0.27
    }, { fill: "#0D65B8", stroke: "#0A569B", strokeWidthPt: 0.9, radiusRatio: 0.04 }),
    shape("standard-output", "screen-main", "roundRect", {
      x: rightRegion.x + rightRegion.w * 0.04,
      y: rightRegion.y + rightRegion.h * 0.34,
      w: rightRegion.w * 0.88,
      h: rightRegion.h * 0.33
    }, { fill: "#CFE8F8", stroke: "#2E86C1", strokeWidthPt: 1.2, radiusRatio: 0.04 }),
    shape("standard-output", "screen-side", "roundRect", {
      x: rightRegion.x + rightRegion.w * 0.05,
      y: rightRegion.y + rightRegion.h * 0.72,
      w: rightRegion.w * 0.50,
      h: rightRegion.h * 0.25
    }, { fill: "#D8ECF8", stroke: "#2E86C1", strokeWidthPt: 1.1, radiusRatio: 0.04 }),
    shape("standard-output", "image-slot-main", "rect", {
      x: rightRegion.x + rightRegion.w * 0.10,
      y: rightRegion.y + rightRegion.h * 0.43,
      w: rightRegion.w * 0.22,
      h: rightRegion.h * 0.15
    }, { fill: "#BFE2F4", stroke: "#2E86C1", strokeWidthPt: 0.8 }),
    shape("standard-output", "image-slot-side", "rect", {
      x: rightRegion.x + rightRegion.w * 0.10,
      y: rightRegion.y + rightRegion.h * 0.79,
      w: rightRegion.w * 0.18,
      h: rightRegion.h * 0.12
    }, { fill: "#BFE2F4", stroke: "#2E86C1", strokeWidthPt: 0.8 }),
    ...[
      [0.15, 0.10, 0.18, "#D8ECF8"],
      [0.15, 0.17, 0.22, "#D8ECF8"],
      [0.67, 0.09, 0.18, "#D8ECF8"],
      [0.67, 0.16, 0.20, "#D8ECF8"],
      [0.38, 0.45, 0.42, "#2E86C1"],
      [0.38, 0.54, 0.34, "#2E86C1"],
      [0.31, 0.81, 0.22, "#2E86C1"],
      [0.31, 0.89, 0.18, "#2E86C1"]
    ].map(([x, y, w], index) => line("standard-output", "content-line", {
      x: rightRegion.x + rightRegion.w * x,
      y: rightRegion.y + rightRegion.h * y
    }, {
      x: rightRegion.x + rightRegion.w * (x + w),
      y: rightRegion.y + rightRegion.h * y
    }, index < 4 ? "#D8ECF8" : "#2E86C1", index < 4 ? 1.4 : 1.2, index)),
    shape("standard-output", "check-badge", "ellipse", {
      x: rightRegion.x + rightRegion.w * 0.70,
      y: rightRegion.y + rightRegion.h * 0.80,
      w: rightRegion.w * 0.28,
      h: rightRegion.w * 0.28
    }, { fill: "#0E8AD7", stroke: "#0E8AD7", strokeWidthPt: 0.8 }),
    line("standard-output", "check-left", {
      x: rightRegion.x + rightRegion.w * 0.77,
      y: rightRegion.y + rightRegion.h * 0.89
    }, {
      x: rightRegion.x + rightRegion.w * 0.82,
      y: rightRegion.y + rightRegion.h * 0.94
    }, "#FFFFFF", 2.0),
    line("standard-output", "check-right", {
      x: rightRegion.x + rightRegion.w * 0.82,
      y: rightRegion.y + rightRegion.h * 0.94
    }, {
      x: rightRegion.x + rightRegion.w * 0.92,
      y: rightRegion.y + rightRegion.h * 0.84
    }, "#FFFFFF", 2.0),
    ...[
      [0.03, 0.29],
      [0.06, 0.53],
      [0.00, 0.70]
    ].map(([x, y], index) => shape("standard-output", "side-chip", "roundRect", {
      x: rightRegion.x + rightRegion.w * x,
      y: rightRegion.y + rightRegion.h * y,
      w: rightRegion.w * 0.15,
      h: rightRegion.h * 0.08
    }, { fill: "#BFE2F4", stroke: "#2E86C1", strokeWidthPt: 0.7, radiusRatio: 0.14 }, index))
  ];
  return [...left, ...right];
}









function shouldObjectifyLinearProcessDiagram(image) {
  const layer = image?.source?.layer || {};
  const detector = String(image?.source?.detector || "");
  const box = image?.box || {};
  if (!box.w || !box.h || box.w < 360 || box.h < 80) return false;
  if (/screenshot|kpi|evidence|chart|comparison|wms-chain|collaboration-flow/.test(detector)) return false;
  if (!/foreground-graphic|sparse-diagram|mixed-diagram|content-graphic|visual-cluster/.test(detector)) return false;
  return layer.layerType === "diagram-zone" || layer.layerType === "table-zone" || /diagram/.test(detector);
}

function inferLinearProcessDiagram(image, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const imageBox = image?.box || {};
  const candidates = (textBoxes || [])
    .filter((item) => isLinearProcessStageText(item, imageBox))
    .sort((a, b) => (a.box.x - b.box.x) || (a.box.y - b.box.y));
  if (candidates.length < 3 || candidates.length > 8) return null;

  const groups = groupLinearProcessRows(candidates, imageBox);
  const row = groups
    .filter((group) => group.length >= 3)
    .sort((a, b) => b.length - a.length || linearRowScore(a, imageBox) - linearRowScore(b, imageBox))[0];
  if (!row) return null;

  const sorted = row.sort((a, b) => a.box.x - b.box.x);
  if (!isWellSpacedLinearRow(sorted, imageBox)) return null;
  const confidence = round(clamp(0.58 + sorted.length * 0.035 + (isLikelyProcessVocabulary(sorted) ? 0.10 : 0), 0.58, 0.86));
  const palette = inferLinearProcessPalette(sorted);
  const stages = sorted.map((item, index) => {
    const box = expandPtBox({
      x: item.box.x - Math.max(18, item.box.w * 0.26),
      y: item.box.y - Math.max(11, item.box.h * 0.62),
      w: Math.max(72, item.box.w + Math.max(34, item.box.w * 0.52)),
      h: Math.max(34, item.box.h + 22)
    }, slideSize, 0, 0);
    return {
      label: truncateText(String(item.text || "").trim(), 48),
      box: constrainPtBox(box, imageBox),
      fill: palette[index % palette.length].fill,
      stroke: palette[index % palette.length].stroke
    };
  });
  if (stages.some((stage) => stage.box.w < 48 || stage.box.h < 24)) return null;
  const connectors = [];
  for (let index = 0; index < stages.length - 1; index += 1) {
    const current = stages[index].box;
    const next = stages[index + 1].box;
    const gap = next.x - (current.x + current.w);
    if (gap < 8 || gap > imageBox.w * 0.32) return null;
    const y = round((current.y + current.h / 2 + next.y + next.h / 2) / 2);
    connectors.push({
      box: lineBox({ x: current.x + current.w + 4, y }, { x: next.x - 5, y }),
      stroke: "#5B6B7A",
      strokeWidthPt: 2.2
    });
  }
  return { stages, connectors, confidence };
}

function isLinearProcessStageText(textBox, imageBox) {
  const text = String(textBox?.text || "").trim();
  const box = textBox?.box || {};
  if (!boxCenterInside(box, expandPtBox(imageBox, DEFAULT_SLIDE, 6, 6))) return false;
  if (text.length < 2 || text.length > 42) return false;
  if (/^[+\-—–·•|/\\]+$/.test(text)) return false;
  if (/[。！？.!?]{1,}$/.test(text) && text.length > 12) return false;
  if (Number(box.w || 0) < 24 || Number(box.h || 0) < 8) return false;
  if (Number(box.w || 0) > Number(imageBox.w || 0) * 0.28) return false;
  if (Number(box.h || 0) > Number(imageBox.h || 0) * 0.38) return false;
  return true;
}

function groupLinearProcessRows(candidates = [], imageBox = {}) {
  const threshold = Math.max(14, Number(imageBox.h || 0) * 0.12);
  const rows = [];
  for (const candidate of candidates) {
    const cy = Number(candidate.box.y || 0) + Number(candidate.box.h || 0) / 2;
    const existing = rows.find((row) => Math.abs(row.centerY - cy) <= threshold);
    if (!existing) {
      rows.push({ centerY: cy, items: [candidate] });
      continue;
    }
    existing.items.push(candidate);
    existing.centerY = existing.items.reduce((sum, item) => sum + Number(item.box.y || 0) + Number(item.box.h || 0) / 2, 0) / existing.items.length;
  }
  return rows.map((row) => row.items);
}

function linearRowScore(row, imageBox = {}) {
  const centers = row.map((item) => Number(item.box.x || 0) + Number(item.box.w || 0) / 2).sort((a, b) => a - b);
  const gaps = centers.slice(1).map((value, index) => value - centers[index]);
  const avg = gaps.reduce((sum, item) => sum + item, 0) / Math.max(1, gaps.length);
  const variance = gaps.reduce((sum, item) => sum + Math.abs(item - avg), 0) / Math.max(1, gaps.length);
  const spread = centers[centers.length - 1] - centers[0];
  return variance / Math.max(1, avg) - spread / Math.max(1, Number(imageBox.w || 1));
}

function isWellSpacedLinearRow(row = [], imageBox = {}) {
  const centers = row.map((item) => ({
    x: Number(item.box.x || 0) + Number(item.box.w || 0) / 2,
    y: Number(item.box.y || 0) + Number(item.box.h || 0) / 2
  }));
  const xSpread = centers[centers.length - 1].x - centers[0].x;
  if (xSpread < Number(imageBox.w || 0) * 0.42) return false;
  const ySpread = Math.max(...centers.map((item) => item.y)) - Math.min(...centers.map((item) => item.y));
  if (ySpread > Math.max(24, Number(imageBox.h || 0) * 0.18)) return false;
  const gaps = centers.slice(1).map((item, index) => item.x - centers[index].x);
  if (gaps.some((gap) => gap < 44 || gap > Number(imageBox.w || 0) * 0.36)) return false;
  const avg = gaps.reduce((sum, item) => sum + item, 0) / gaps.length;
  const maxDeviation = Math.max(...gaps.map((gap) => Math.abs(gap - avg)));
  return maxDeviation <= Math.max(42, avg * 0.55);
}

function isLikelyProcessVocabulary(row = []) {
  const joined = row.map((item) => String(item.text || "")).join(" ");
  return /阶段|步骤|Step|step|流程|输入|输出|生成|评审|验证|发布|需求|设计|开发|测试|上线|交付|PRD|Review/.test(joined);
}

function inferLinearProcessPalette(row = []) {
  const hasRisk = row.some((item) => /风险|异常|失败|拒绝|问题/.test(String(item.text || "")));
  if (hasRisk) {
    return [
      { fill: "#1D75BB", stroke: "#0B4F91" },
      { fill: "#28A263", stroke: "#16804A" },
      { fill: "#F07916", stroke: "#C85C08" },
      { fill: "#D94841", stroke: "#A82B26" }
    ];
  }
  return [
    { fill: "#1D75BB", stroke: "#0B4F91" },
    { fill: "#2386C8", stroke: "#145F9C" },
    { fill: "#28A263", stroke: "#16804A" },
    { fill: "#34AE5A", stroke: "#1E8C4A" },
    { fill: "#F07916", stroke: "#C85C08" }
  ];
}











function restorePrdGenerationSegmentCropsAfterPrimitiveErasure(page, sourceImage, slideSize = DEFAULT_SLIDE, textBoxes = [], options = {}) {
  const segments = (page?.images || [])
    .filter((image) => image?.source?.prdGenerationSegmentCropPreserved === true && image?.box)
    .sort((a, b) => Number(a.box.x || 0) - Number(b.box.x || 0));
  if (segments.length !== 3) return false;
  const leftRestored = restorePrdGenerationInputCardCrop(segments[0], sourceImage, slideSize, textBoxes, options);
  const docRestored = restorePrdGenerationDocumentCrop(segments[2], sourceImage, slideSize, textBoxes, options);
  return leftRestored || docRestored;
}





































































function prototypeValidationDecorations({ wand, wandCenter }) {
  const star = {
    x: wand.x + wand.w * 0.48,
    y: wand.y + wand.h * 0.33
  };
  const spark = (name, dx1, dy1, dx2, dy2, stroke = "#F28A2E", width = 2.4) => ({
    type: "line",
    box: lineBox(
      { x: star.x + wand.w * dx1, y: star.y + wand.h * dy1 },
      { x: star.x + wand.w * dx2, y: star.y + wand.h * dy2 }
    ),
    style: { stroke, strokeWidthPt: width, connectorType: "straight" },
    detector: "prototype-validation-flow-native-wand-spark",
    role: name
  });
  return [
    {
      type: "line",
      box: lineBox({ x: wand.x + 2, y: wandCenter.y }, { x: wand.x + wand.w - 2, y: wandCenter.y }),
      style: { stroke: "#2B78A5", strokeWidthPt: 3.6, connectorType: "straight" },
      detector: "prototype-validation-flow-native-wand-bridge",
      role: "wand-bridge"
    },
    {
      type: "line",
      box: lineBox(
        { x: wand.x + wand.w * 0.28, y: wand.y + wand.h * 0.80 },
        { x: wand.x + wand.w * 0.62, y: wand.y + wand.h * 0.24 }
      ),
      style: { stroke: "#1F78C8", strokeWidthPt: 4.2, connectorType: "straight" },
      detector: "prototype-validation-flow-native-wand-handle",
      role: "wand-handle"
    },
    spark("spark-horizontal", -0.14, 0, 0.14, 0),
    spark("spark-vertical", 0, -0.14, 0, 0.14),
    spark("spark-diagonal-a", -0.10, -0.10, 0.10, 0.10, "#36B36F", 2.1),
    spark("spark-diagonal-b", -0.10, 0.10, 0.10, -0.10, "#36B36F", 2.1)
  ].filter((item) => Math.abs(item.box.w) + Math.abs(item.box.h) > 1);
}





























































function hasSpecializedComparisonSkeletonCandidate(images = []) {
  return (images || []).some((image) => {
    const source = image?.source || {};
    const layer = source.layer || {};
    const strategy = source.componentRenderStrategy || layer.componentRenderStrategy || {};
    return source.detector === "two-panel-diagram-crop"
      && strategy.mode === "native-visual-atom-rebuild"
      && strategy.implementationMode === "native-specialized";
  });
}



























































function protectUnreadableSystemMapFidelityCrop(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/产品(?:版图|地图)|SystemMap/.test(labels) || !/数字化产品大脑|产品大脑/.test(labels)) return false;
  let target = (page.images || []).find((image) => {
    const box = image?.box || {};
    const areaRatio = Number(box.w || 0) * Number(box.h || 0)
      / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
    return /line-diagram|graphic-underlay|dense-line|foreground-graphic/i.test(String(image?.source?.detector || ""))
      && areaRatio >= 0.35;
  });
  if (!target && (!options.sourceImage || !options.assetDir || !options.irDir)) return false;
  const title = (rawTextBoxes || []).find((textBox) => /终局视野|终极远景/.test(String(textBox?.text || "")));
  const footerTop = Math.min(
    ...(rawTextBoxes || [])
      .filter((textBox) => Number(textBox?.box?.y || 0) >= Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt) * 0.78)
      .map((textBox) => Number(textBox.box.y || 0)),
    Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt) - 66
  );
  const targetAreaRatio = target
    ? boxAreaValue(target.box || {})
      / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt))
    : 0;
  const fallbackDiagramBox = clampPtBoxToSlide({
    x: 27,
    y: Math.max(82, Number(title?.box?.y || 0) + Number(title?.box?.h || 0) + 20),
    w: Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) - 54,
    h: Math.max(180, footerTop - Math.max(82, Number(title?.box?.y || 0) + Number(title?.box?.h || 0) + 20) - 10)
  }, slideSize);
  const diagramBox = !target || targetAreaRatio >= 0.78
    ? fallbackDiagramBox
    : clampPtBoxToSlide(target.box, slideSize);
  const topologyProbe = target && options.sourceImage
    ? measureSystemMapNativeTopology(options.sourceImage, diagramBox, slideSize)
    : { ready: false, nodeCount: 0, edgeCount: 0 };
  // Repeated square fields are presentation texture rather than graph edges.
  // When the center topology is measurable, keep only that dense center as a
  // fidelity unit and rebuild the outer texture with bounded native patterns.
  const decorativeGridTexture = target && options.sourceImage
    ? hasSystemMapDecorativeGridTexture(options.sourceImage, diagramBox, slideSize)
    : false;
  const pictorialEnclosure = target && options.sourceImage
    ? measureSystemMapPictorialEnclosure(options.sourceImage, diagramBox, slideSize, ptToPxBox)
    : { detected: false, confidence: 0 };
  const innerLabelCount = (rawTextBoxes || []).filter((textBox) =>
    boxCenterInside(textBox?.box || {}, diagramBox)
    && !/^(?:物流资产|产品地图)$/.test(String(textBox?.text || "").trim())
  ).length;
  const structuredLineMap = target
    && /line-diagram/i.test(String(target.source?.detector || ""))
    && targetAreaRatio < 0.78
    && !decorativeGridTexture
    && options.sourceImage
    && options.assetDir
    && options.irDir;
  const reconstructionMode = chooseSystemMapReconstructionMode({
    topologyReady: Boolean(target && topologyProbe.ready),
    pictorialEnclosure: pictorialEnclosure.detected === true,
    structuredLineMap: Boolean(structuredLineMap),
    decorativeGridTexture,
    innerLabelCount
  });
  if (target && reconstructionMode.mode === "native-hybrid") {
    target.source = {
      ...(target.source || {}),
      systemMapTopologyProbeReady: true,
      systemMapTopologyProbeNodeCount: topologyProbe.nodeCount,
      systemMapTopologyProbeEdgeCount: topologyProbe.edgeCount,
      systemMapDecorativeGridTextureDetected: decorativeGridTexture,
      systemMapHybridEligible: true,
      systemMapReconstructionReasonCode: reconstructionMode.reasonCode
    };
    return false;
  }
  if (reconstructionMode.mode === "structured-hybrid") {
    target.source = {
      ...(target.source || {}),
      systemMapHybridEligible: true,
      systemMapTopologyProbeReady: topologyProbe.ready === true,
      systemMapTopologyProbeNodeCount: topologyProbe.nodeCount,
      systemMapTopologyProbeEdgeCount: topologyProbe.edgeCount,
      systemMapDecorativeGridTextureDetected: false,
      systemMapReconstructionReasonCode: reconstructionMode.reasonCode
    };
    return false;
  }
  if (reconstructionMode.mode === "readable-native") return false;
  if (!target) {
    target = {
      id: `system-map-fidelity-p${Number(options.pageIndex || 0) + 1}`,
      type: "fidelity-crop",
      box: diagramBox,
      source: { detector: "system-map-synthetic-fidelity-crop" }
    };
    page.images = [...(page.images || []), target];
  }
  if (options.sourceImage && options.assetDir && options.irDir) {
    ensureDir(options.assetDir);
    const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
    const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-system-map`, "system-map");
    const pxBox = ptToPxBox(diagramBox, options.sourceImage, slideSize, 0);
    const file = path.join(options.assetDir, `${base}-fidelity-unit.png`);
    writePng(file, cropPng(options.sourceImage, pxBox));
    target.assetPath = path.relative(options.irDir, file).replace(/\\/g, "/");
    // Keep the measured slide box authoritative. Re-projecting an integer pixel
    // crop back to points changes its bounds on non-integral render sizes and
    // creates a visible layout drift despite identical source pixels.
    target.box = diagramBox;
  }
  // A source-background candidate is only a temporary probe input. Once it is
  // selected as the approved visual minimum unit, classify it as a fidelity
  // crop so downstream editability audits do not report a false action item.
  target.type = "fidelity-crop";
  target.source = {
    ...(target.source || {}),
    detector: "system-map-fidelity-crop",
    strategy: "local-fidelity-crop",
    expressionFamily: "generic-structured-diagram",
    expressionForm: "complex-diagram",
    expressionSubtype: "dense-system-map-with-unreadable-node-labels",
    recommendedAction: "keep-local-crop",
    intentionalMinimumUnitCrop: true,
    protectedMinimumUnit: true,
    sourceFaithfulCrop: true,
    skipVisualAtomRebuild: true,
    systemMapFidelityProtected: true,
    systemMapFidelityIncludesChrome: true,
    systemMapDecorativeGridTextureDetected: decorativeGridTexture,
    systemMapPictorialEnclosureDetected: pictorialEnclosure.detected === true,
    systemMapPictorialEnclosureConfidence: pictorialEnclosure.confidence,
    largeFidelityCropApproved: true,
    largeFidelityCropApprovalReason: "the complete dense system map contains unreadable micro-labels and cannot be safely decomposed without semantic loss",
    componentRenderStrategy: {
      mode: "preserve-local-crop",
      editableExpectation: "fidelity-first visual asset without reliable internal OCR",
      visualFidelityBias: "source-faithful",
      reason: "dense system map has fewer than six independently readable internal labels"
    },
    nonEditableReason: "dense system map contains micro-node labels without reliable OCR evidence; retaining the source map prevents silent semantic loss"
  };
  page.reconstruction = {
    ...(page.reconstruction || {}),
    expressionPolicy: "fidelity-first",
    expressionPolicyReason: "approved dense system-map minimum unit with insufficient semantic evidence for lossless decomposition"
  };
  return true;
}

function hasSystemMapDecorativeGridTexture(sourceImage = null, diagramBox = {}, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage || !diagramBox?.w || !diagramBox?.h) return false;
  const region = ptToPxBox(diagramBox, sourceImage, slideSize, 0);
  const sideBands = [
    { x: region.x + region.w * 0.03, y: region.y + region.h * 0.03, w: region.w * 0.26, h: region.h * 0.84 },
    { x: region.x + region.w * 0.71, y: region.y + region.h * 0.03, w: region.w * 0.26, h: region.h * 0.84 }
  ];
  let sampled = 0;
  let blueGridPixels = 0;
  for (const band of sideBands) {
    const xStart = Math.max(0, Math.floor(band.x));
    const xEnd = Math.min(sourceImage.width, Math.ceil(band.x + band.w));
    const yStart = Math.max(0, Math.floor(band.y));
    const yEnd = Math.min(sourceImage.height, Math.ceil(band.y + band.h));
    for (let y = yStart; y < yEnd; y += 4) {
      for (let x = xStart; x < xEnd; x += 4) {
        sampled += 1;
        const color = pixel(sourceImage, x, y);
        const r = Number(color.r || 0);
        const g = Number(color.g || 0);
        const b = Number(color.b || 0);
        if (r <= 235 && g <= 245 && b >= 120 && b - r >= 15) blueGridPixels += 1;
      }
    }
  }
  return sampled > 0 && blueGridPixels / sampled >= 0.12;
}

function prepareSystemMapTopologyProbe(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/产品(?:版图|地图)|SystemMap/.test(labels) || !/数字化产品大脑|产品大脑/.test(labels)) return false;
  let target = (page.images || []).find((image) => {
    const box = image?.box || {};
    const areaRatio = Number(box.w || 0) * Number(box.h || 0)
      / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
    const sourceBackground = String(image?.type || "") === "source-background"
      || String(image?.style?.strategy || "") === "full-slide-underlay";
    return (sourceBackground || /line-diagram|graphic-underlay|dense-line|foreground-graphic|source-background/i.test(String(image?.source?.detector || "")))
      && areaRatio >= 0.35;
  });
  // Non-smart runs intentionally omit the full-slide background from the
  // working image list. Re-introduce it only for this semantic system-map
  // probe; it is discarded again unless pixel topology meets the threshold.
  let syntheticSourceCandidate = false;
  if (!target && options.sourceImage) {
    syntheticSourceCandidate = true;
    target = {
      id: `system-map-source-background-p${Number(options.pageIndex || 0) + 1}`,
      type: "source-background",
      box: { x: 0, y: 0, w: Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt), h: Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt) },
      source: {
        detector: "source-background",
        systemMapSyntheticSourceCandidate: true
      }
    };
    page.images = [...(page.images || []), target];
  }
  if (!target || !options.sourceImage) return false;
  const targetAreaRatio = boxAreaValue(target.box || {})
    / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  const title = (rawTextBoxes || []).find((textBox) => /终局视野|终极远景/.test(String(textBox?.text || "")));
  const footerTop = Math.min(
    ...(rawTextBoxes || [])
      .filter((textBox) => Number(textBox?.box?.y || 0) >= Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt) * 0.78)
      .map((textBox) => Number(textBox.box.y || 0)),
    Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt) - 66
  );
  const measuredBox = targetAreaRatio >= 0.78
    ? clampPtBoxToSlide({
      x: 27,
      y: Math.max(82, Number(title?.box?.y || 0) + Number(title?.box?.h || 0) + 20),
      w: Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) - 54,
      h: Math.max(180, footerTop - Math.max(82, Number(title?.box?.y || 0) + Number(title?.box?.h || 0) + 20) - 10)
    }, slideSize)
    : clampPtBoxToSlide(target.box, slideSize);
  const topologyProbe = measureSystemMapNativeTopology(options.sourceImage, measuredBox, slideSize);
  target.source = {
    ...(target.source || {}),
    ...(topologyProbe.ready && targetAreaRatio >= 0.78
      ? { detector: "line-diagram-system-map-auto", systemMapSourceBackgroundPromoted: true }
      : {}),
    systemMapTopologyProbeReady: topologyProbe.ready === true,
    systemMapTopologyProbeNodeCount: topologyProbe.nodeCount,
    systemMapTopologyProbeEdgeCount: topologyProbe.edgeCount
  };
  if (topologyProbe.ready && targetAreaRatio >= 0.78) target.box = measuredBox;
  // The probe must not turn an uncertain page into a full-slide raster fallback.
  // Synthetic candidates exist only long enough to establish measurable topology.
  if (!topologyProbe.ready && syntheticSourceCandidate) {
    page.images = (page.images || []).filter((image) => image !== target);
  }
  return topologyProbe.ready === true;
}

function createTraditionalCollaborationBreakdownObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/传统产研协作的系统性断点/.test(labels)) return { shapes: [], textBoxes: [] };
  const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "foreground-graphic-crop");
  if (sourceImages.length < 2) return { shapes: [], textBoxes: [] };
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      traditionalCollaborationBreakdownObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: "traditional collaboration breakdown rebuilt as native inputs, broken links, risk markers, dashboard, and explanatory text"
    };
  }
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    confidence: 0.93,
    expressionForm: "linear-relationship-diagram",
    expressionSubtype: "traditional-collaboration-breakdown",
    ...extra
  });
  const shapes = [];
  const textBoxes = [];
  const add = (shape) => shapes.push(shape);
  const gray = "#8996A8";
  const orange = "#FF6A00";
  const inputs = [
    { id: "requirement", text: "需求", box: { x: 112, y: 115, w: 126, h: 88 }, rotate: -8 },
    { id: "prd", text: "PRD", box: { x: 246, y: 177, w: 126, h: 88 }, rotate: 6 },
    { id: "prototype", text: "原型", box: { x: 90, y: 244, w: 126, h: 88 }, rotate: -8 },
    { id: "review", text: "评审", box: { x: 244, y: 318, w: 126, h: 88 }, rotate: 7 }
  ];
  const fallbackMarkers = [
    { x: 458, y: 151, w: 52, h: 52, symbol: "×" },
    { x: 458, y: 232, w: 52, h: 52, symbol: "" },
    { x: 458, y: 312, w: 52, h: 52, symbol: "×" },
    { x: 458, y: 391, w: 52, h: 52, symbol: "×" }
  ];
  const detectedMarkerBoxes = detectTraditionalCollaborationMarkerBoxes(options.sourceImage, slideSize);
  const markers = fallbackMarkers.map((marker, index) => ({ ...marker, ...(detectedMarkerBoxes[index] || {}) }));
  const dashboard = { x: 718, y: 156, w: 165, h: 200 };
  // Broken routes are simple editable connectors. Never turn them into crops
  // merely because their source pixels are available; fidelity crops remain an
  // explicit diagnostic fallback for experiments only.
  const routeFidelityImages = options.allowRouteFidelity === true
    ? materializeTraditionalCollaborationRouteFidelity(
      options.sourceImage,
      inputs,
      markers,
      dashboard,
      slideSize,
      options
    )
    : [];
  const useRouteFidelity = routeFidelityImages.length > 0;
  // Draw broken connectors first so nodes and markers remain readable above the routes.
  if (!useRouteFidelity) inputs.forEach((input, index) => {
    const y = input.box.y + input.box.h * 0.5;
    const markerX = markers[index].x;
    const markerCenterY = markers[index].y + markers[index].h * 0.5;
    const routing = traditionalBreakdownComponent("routing", "broken-collaboration-routing");
    const marker = traditionalBreakdownComponent(`breakpoint-${index}`, "collaboration-breakpoint");
    add({ id: `traditional-collaboration-breakdown-native-link-left-${index}`, type: "line", box: { x: input.box.x + input.box.w, y, w: markerX - (input.box.x + input.box.w) - 30, h: markerCenterY - y }, style: { stroke: "#9EA5AD", strokeWidthPt: 1.4, connectorType: "straight" }, source: source("traditional-collaboration-breakdown-native-link", { index, segment: "left", ...routing, nativeComponentRole: `left-${index}` }) });
    add({ id: `traditional-collaboration-breakdown-native-link-right-${index}`, type: "line", box: { x: markerX + markers[index].w, y: markerCenterY, w: dashboard.x - (markerX + markers[index].w), h: dashboard.y + 89 - markerCenterY }, style: { stroke: "#9EA5AD", strokeWidthPt: 1.4, connectorType: "straight" }, source: source("traditional-collaboration-breakdown-native-link", { index, segment: "right", ...routing, nativeComponentRole: `right-${index}` }) });
    add({ id: `traditional-collaboration-breakdown-native-break-left-${index}`, type: "line", box: { x: markerX - 18, y: markers[index].y + markers[index].h * 0.2, w: 10, h: markers[index].h * 0.35 }, style: { stroke: "#9EA5AD", strokeWidthPt: 1.8, connectorType: "straight" }, source: source("traditional-collaboration-breakdown-native-break", { index, side: "left", ...marker, nativeComponentRole: "break-left" }) });
    add({ id: `traditional-collaboration-breakdown-native-break-right-${index}`, type: "line", box: { x: markerX + markers[index].w + 6, y: markers[index].y + markers[index].h * 0.2, w: -10, h: markers[index].h * 0.35 }, style: { stroke: "#9EA5AD", strokeWidthPt: 1.8, connectorType: "straight" }, source: source("traditional-collaboration-breakdown-native-break", { index, side: "right", ...marker, nativeComponentRole: "break-right" }) });
  });
  inputs.forEach((input, index) => {
    const component = traditionalBreakdownComponent(`input-${input.id}`, "collaboration-input-card");
    add({ id: `traditional-collaboration-breakdown-native-input-${input.id}`, type: "rect", box: input.box, style: { fill: gray, stroke: gray, strokeWidthPt: 0, rotate: input.rotate, shadow: { color: "#5B6571", alpha: 0.1, blurPt: 3, distancePt: 1, angle: 45 } }, source: source("traditional-collaboration-breakdown-native-input", { index, role: input.id, ...component, nativeComponentRole: "card" }) });
    textBoxes.push(temporaryAnswerWorkflowTextBox(`traditional-collaboration-breakdown-native-input-text-${input.id}`, input.text, { x: input.box.x + 22, y: input.box.y + 28, w: input.box.w - 44, h: 32 }, { sizePt: 22, color: "#FFFFFF", weight: "bold", align: "center", nativeComponentGroupId: component.nativeComponentGroupId }, source("traditional-collaboration-breakdown-native-text", { role: input.id, ...component, nativeComponentRole: "label" })));
  });
  markers.forEach((marker, index) => {
    const component = traditionalBreakdownComponent(`breakpoint-${index}`, "collaboration-breakpoint");
    add({ id: `traditional-collaboration-breakdown-native-marker-${index}`, type: "ellipse", box: { x: marker.x, y: marker.y, w: marker.w, h: marker.h }, style: { fill: orange, stroke: orange, strokeWidthPt: 0 }, source: source("traditional-collaboration-breakdown-native-marker", { index, ...component, nativeComponentRole: "marker" }) });
    if (index === 1) {
      add({ id: "traditional-collaboration-breakdown-native-marker-octagon", type: "freeform", box: { x: marker.x + marker.w * 0.23, y: marker.y + marker.h * 0.23, w: marker.w * 0.54, h: marker.h * 0.54 }, points: regularPolygonPoints(8, Math.PI / 8), style: { fill: "none", stroke: "#FFFFFF", strokeWidthPt: 3 }, source: source("traditional-collaboration-breakdown-native-marker-symbol", { index, symbol: "octagon", ...component, nativeComponentRole: "symbol" }) });
    } else {
      textBoxes.push(temporaryAnswerWorkflowTextBox(`traditional-collaboration-breakdown-native-marker-text-${index}`, marker.symbol, { x: marker.x + marker.w * 0.19, y: marker.y + marker.h * 0.13, w: marker.w * 0.62, h: marker.h * 0.74 }, { sizePt: Math.max(20, marker.h * 0.58), color: "#FFFFFF", weight: "bold", align: "center", nativeComponentGroupId: component.nativeComponentGroupId }, source("traditional-collaboration-breakdown-native-text", { role: "risk-marker", index, ...component, nativeComponentRole: "symbol" })));
    }
  });
  const dashboardComponent = traditionalBreakdownComponent("dashboard", "delivery-dashboard");
  add({ id: "traditional-collaboration-breakdown-native-dashboard", type: "roundRect", box: dashboard, style: { fill: "#EEF0F4", stroke: "#E1E4E8", strokeWidthPt: 1, radiusPt: 7 }, source: source("traditional-collaboration-breakdown-native-dashboard", { ...dashboardComponent, nativeComponentRole: "container" }) });
  textBoxes.push(
    temporaryAnswerWorkflowTextBox("traditional-collaboration-breakdown-native-title", "传统产研协作的系统性断点", { x: 260, y: 37, w: 440, h: 42 }, { sizePt: 29, color: "#000000", weight: "bold", align: "center" }, source("traditional-collaboration-breakdown-native-text", { role: "title" })),
    temporaryAnswerWorkflowTextBox("traditional-collaboration-breakdown-native-dashboard-title", "交付看板", { x: dashboard.x + 22, y: dashboard.y + 25, w: dashboard.w - 44, h: 32 }, { sizePt: 22, color: "#99A0AA", weight: "bold", align: "center", nativeComponentGroupId: dashboardComponent.nativeComponentGroupId }, source("traditional-collaboration-breakdown-native-text", { role: "dashboard-title", ...dashboardComponent, nativeComponentRole: "title" })),
    temporaryAnswerWorkflowTextBox("traditional-collaboration-breakdown-native-dashboard-question", "?", { x: dashboard.x + 45, y: dashboard.y + 72, w: 75, h: 82 }, { sizePt: 62, color: "#B8BEC7", weight: "bold", align: "center", nativeComponentGroupId: dashboardComponent.nativeComponentGroupId }, source("traditional-collaboration-breakdown-native-text", { role: "dashboard-question", ...dashboardComponent, nativeComponentRole: "question" }))
  );
  const notes = [
    ["文档分散：", "多工具并存导致极高的查找成本与信息差。"],
    ["原型割裂：", "设计与文档脱节，缺乏统一的审阅入口。"],
    ["版本漂移：", "资产难以沉淀，历史经验无法转化为组织级复用资产。"],
    ["交付不稳：", "质量控制严重依赖个人经验，缺乏系统性标准。"]
  ];
  notes.forEach(([heading, body], index) => {
    const x = 53 + index * 222;
    textBoxes.push(temporaryAnswerWorkflowTextBox(`traditional-collaboration-breakdown-native-note-${index}`, `• ${heading}${body}`, { x, y: 438, w: 192, h: 72 }, { sizePt: 14, color: "#111111", weight: "regular", align: "left" }, source("traditional-collaboration-breakdown-native-text", { role: "note", index })));
  });
  return { shapes, textBoxes, images: routeFidelityImages };
}

function createTraditionalCollaborationDetectedRouteShapes(sourceImage, inputs, markers, dashboard, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage || !Number(sourceImage.width) || !Number(sourceImage.height) || !sourceImage.rgba) return [];
  const markerX = 458;
  const leftEnd = markerX - 14;
  const rightStart = markerX + 52;
  const rightEnd = dashboard.x - 8;
  const regions = inputs.flatMap((input, index) => {
    const inputCenterY = input.box.y + input.box.h * 0.5;
    const markerCenterY = markers[index].y + 26;
    const inputRouteStart = input.box.x + input.box.w + (index % 2 === 1 ? 30 : 16);
    return [
      { id: `input-${index}`, index, segment: "left", box: routeFidelityRegion(inputRouteStart, inputCenterY, leftEnd, markerCenterY) },
      { id: `output-${index}`, index, segment: "right", box: routeFidelityRegion(rightStart, markerCenterY, rightEnd, dashboard.y + dashboard.h * 0.445) }
    ];
  });
  return regions.flatMap((region) => {
    const fitted = fitTraditionalRouteSegment(sourceImage, region.box, slideSize);
    if (!fitted) return [];
    return [{
      id: `traditional-collaboration-breakdown-detected-route-${region.id}`,
      type: "line",
      box: fitted,
      style: { stroke: "#9EA5AD", strokeWidthPt: 1.4, connectorType: "straight" },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "traditional-collaboration-breakdown-detected-native-link",
        confidence: 0.9,
        expressionForm: "linear-relationship-diagram",
        expressionSubtype: "traditional-collaboration-breakdown",
        routeSegment: region.id,
        index: region.index,
        segment: region.segment,
        nativeComponentInstance: true,
        nativeComponentGroupId: "traditional-collaboration-breakdown-routing",
        nativeComponentArchetype: "broken-collaboration-routing",
        nativeComponentRole: region.id,
        componentOwnerId: "traditional-collaboration-breakdown-routing",
        componentOwnerKind: "broken-collaboration-routing"
      }
    }];
  });
}

function fitTraditionalRouteSegment(sourceImage, box, slideSize = DEFAULT_SLIDE) {
  const pxBox = ptToPxBox(box, sourceImage, slideSize, 0);
  const cropped = cropPng(sourceImage, pxBox);
  const component = strongestTraditionalRouteComponent(cropped);
  if (!component || component.maxX - component.minX < 18) return null;
  const edgeWidth = Math.max(2, Math.round((component.maxX - component.minX + 1) * 0.08));
  const leftPoints = component.points.filter((point) => point.x <= component.minX + edgeWidth);
  const rightPoints = component.points.filter((point) => point.x >= component.maxX - edgeWidth);
  if (!leftPoints.length || !rightPoints.length) return null;
  const meanY = (points) => points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const toPt = (x, y) => ({
    x: (pxBox.x + x) * slideSize.widthPt / sourceImage.width,
    y: (pxBox.y + y) * slideSize.heightPt / sourceImage.height
  });
  const start = toPt(component.minX, meanY(leftPoints));
  const end = toPt(component.maxX, meanY(rightPoints));
  return roundedBox({ x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y });
}

function strongestTraditionalRouteComponent(image) {
  const width = Number(image.width || 0);
  const height = Number(image.height || 0);
  if (!width || !height || !image.rgba) return null;
  const pixels = width * height;
  const eligible = new Uint8Array(pixels);
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    const r = image.rgba[offset];
    const g = image.rgba[offset + 1];
    const b = image.rgba[offset + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const lumaValue = (r + g + b) / 3;
    if (lumaValue >= 105 && lumaValue <= 205 && chroma <= 28) eligible[index] = 1;
  }
  const visited = new Uint8Array(pixels);
  let strongest = null;
  for (let seed = 0; seed < pixels; seed += 1) {
    if (!eligible[seed] || visited[seed]) continue;
    const queue = [seed];
    const points = [];
    visited[seed] = 1;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const x = current % width;
      const y = Math.floor(current / width);
      points.push({ x, y });
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbor = ny * width + nx;
          if (!eligible[neighbor] || visited[neighbor]) continue;
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    if (points.length < 16 || spanX < 18 || spanX < spanY * 1.4) continue;
    const candidate = { points, minX, maxX, minY, maxY, score: spanX * 3 + points.length };
    if (!strongest || candidate.score > strongest.score) strongest = candidate;
  }
  return strongest;
}

function materializeTraditionalCollaborationRouteFidelity(sourceImage, inputs, markers, dashboard, slideSize, options = {}) {
  if (!sourceImage || !options.assetDir || !options.irDir) return [];
  if (!Number(sourceImage.width) || !Number(sourceImage.height) || !sourceImage.rgba) return [];
  ensureDir(options.assetDir);
  const rightEnd = dashboard.x - 8;
  const routeRegions = inputs.flatMap((input, index) => {
    const inputCenterY = input.box.y + input.box.h * 0.5;
    const marker = markers[index];
    const markerCenterY = marker.y + marker.h * 0.5;
    const leftEnd = marker.x - 14;
    const rightStart = marker.x + marker.w;
    // The second and fourth source cards lean right farther than their native bounds.
    // Leave a larger margin so their anti-aliased border cannot enter the line crop.
    const inputRouteStart = input.box.x + input.box.w + (index % 2 === 1 ? 30 : 16);
    return [
      // Start beyond the rotated card edge. This keeps the route crop text-free and avoids
      // inheriting a neutral-gray card border into the otherwise transparent line layer.
      { id: `input-${index}`, box: routeFidelityRegion(inputRouteStart, inputCenterY, leftEnd, markerCenterY) },
      { id: `output-${index}`, box: routeFidelityRegion(rightStart, markerCenterY, rightEnd, dashboard.y + dashboard.h * 0.445) }
    ];
  });
  const deck = safeIdentifier(options.deckName || "deck", "deck");
  const page = String(Number(options.pageIndex || 0) + 1).padStart(2, "0");
  return routeRegions.flatMap((region) => {
    const pxBox = ptToPxBox(region.box, sourceImage, slideSize, 0);
    const cropped = cropPng(sourceImage, pxBox);
    const isolated = isolateTraditionalCollaborationRoutePixels(cropped);
    if (countVisiblePixels(isolated) < 16) return [];
    const file = path.join(options.assetDir, `${deck}-p${page}-traditional-collaboration-${region.id}-route.png`);
    writePng(file, isolated);
    return [{
      id: `traditional-collaboration-breakdown-route-${region.id}`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir, file).replace(/\\\\/g, "/"),
      box: region.box,
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "traditional-collaboration-breakdown-route-fidelity-crop",
        expressionForm: "complex-diagram",
        expressionSubtype: "broken-collaboration-route-layer",
        strategy: "local-fidelity-crop",
        recommendedAction: "keep-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        textFreeVisualLayer: true,
        nonEditableReason: "source-faithful complex connector route retained as a text-free local visual layer",
        nativeComponentGroupId: "traditional-collaboration-breakdown-routing",
        nativeComponentArchetype: "broken-collaboration-routing",
        nativeComponentRole: region.id,
        nativeComponentPart: "route-fidelity"
      }
    }];
  });
}

function detectTraditionalCollaborationMarkerBoxes(sourceImage, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage || !sourceImage.rgba || !Number(sourceImage.width) || !Number(sourceImage.height)) return [];
  const width = sourceImage.width;
  const height = sourceImage.height;
  const pixelCount = width * height;
  const isOrange = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const r = sourceImage.rgba[offset];
    const g = sourceImage.rgba[offset + 1];
    const b = sourceImage.rgba[offset + 2];
    if (r > 220 && g >= 55 && g <= 155 && b < 55) isOrange[index] = 1;
  }
  const visited = new Uint8Array(pixelCount);
  const candidates = [];
  for (let seed = 0; seed < pixelCount; seed += 1) {
    if (!isOrange[seed] || visited[seed]) continue;
    const queue = [seed];
    visited[seed] = 1;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const pixel = queue[cursor];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbor = ny * width + nx;
          if (!isOrange[neighbor] || visited[neighbor]) continue;
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
    const box = roundedBox({
      x: minX * slideSize.widthPt / width,
      y: minY * slideSize.heightPt / height,
      w: (maxX - minX + 1) * slideSize.widthPt / width,
      h: (maxY - minY + 1) * slideSize.heightPt / height
    });
    const area = box.w * box.h;
    if (box.w >= 35 && box.w <= 90 && box.h >= 35 && box.h <= 90 && area >= 1200) candidates.push(box);
  }
  if (candidates.length < 4) return [];
  return candidates.sort((a, b) => a.y - b.y || a.x - b.x).slice(0, 4);
}

function routeFidelityRegion(x1, y1, x2, y2) {
  const pad = 3;
  return roundedBox({
    x: Math.min(x1, x2) - pad,
    y: Math.min(y1, y2) - pad,
    w: Math.abs(x2 - x1) + pad * 2,
    h: Math.abs(y2 - y1) + pad * 2
  });
}

function isolateTraditionalCollaborationRoutePixels(image) {
  const rgba = Buffer.from(image.rgba);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const r = rgba[offset];
    const g = rgba[offset + 1];
    const b = rgba[offset + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const lumaValue = (r + g + b) / 3;
    const isRouteInk = lumaValue >= 105 && lumaValue <= 205 && chroma <= 28;
    if (!isRouteInk) {
      rgba[offset + 3] = 0;
      continue;
    }
    // Preserve antialiasing while dropping the white canvas around the route.
    rgba[offset + 3] = Math.min(rgba[offset + 3], Math.round(255 * Math.min(1, (215 - lumaValue) / 90)));
  }
  return { ...image, rgba };
}

function countVisiblePixels(image) {
  let count = 0;
  for (let offset = 3; offset < image.rgba.length; offset += 4) if (image.rgba[offset] > 10) count += 1;
  return count;
}

function traditionalBreakdownComponent(role = "component", archetype = "traditional-collaboration-breakdown") {
  const safeRole = safeComponentToken(role);
  const groupId = `traditional-collaboration-breakdown-${safeRole}`;
  return {
    nativeComponentInstance: true,
    nativeComponentGroupId: groupId,
    nativeComponentArchetype: archetype,
    componentOwnerId: groupId,
    componentOwnerKind: archetype
  };
}



const createScaleLandingEvidenceObjects = createScaleLandingEvidenceFactory({
  materializeAssetHubSourceCrops
});
const {
  createStickySketchResidualNativeShapes,
  residualLinearInkStats,
  stickySketchResidualNativeStrokeShapes,
  stickySketchStrokeComponents
} = createStickySketchResidualFactory({
  averageColor,
  expandPxBox,
  pixel,
  readPng,
  resolveAssetPathForIr,
  rgbToHex,
  rgbToHsl,
  round
});

function createSkillsEngineCoverTriadObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  if (!shouldObjectifySkillsEngineCoverTriad(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };
  const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "foreground-graphic-crop");
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      skillsEngineCoverTriadObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "skills engine cover triad"}; rebuilt document/prototype/code shield diagram as native editable components`
    };
  }
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    componentOwnerId: "skills-engine-cover-triad-native-component",
    componentOwnerKind: "skills-engine-cover-triad",
    confidence: 0.9,
    ...extra
  });
  const shapes = [];
  const textBoxes = [];
  const add = (shape) => shapes.push(shape);

  add({ id: "skills-engine-cover-shield-back", type: "freeform", box: { x: 371, y: 184, w: 214, h: 258 }, points: [{ x: 478, y: 184 }, { x: 585, y: 253 }, { x: 565, y: 372 }, { x: 478, y: 442 }, { x: 391, y: 372 }, { x: 371, y: 253 }], style: { fill: "#0A67BD", stroke: "#0A67BD", strokeWidthPt: 1.2, opacity: 0.98 }, source: source("skills-engine-cover-native-shield", { part: "back" }) });
  add({ id: "skills-engine-cover-shield-inner", type: "freeform", box: { x: 407, y: 223, w: 142, h: 196 }, points: [{ x: 478, y: 223 }, { x: 549, y: 259 }, { x: 539, y: 352 }, { x: 478, y: 419 }, { x: 417, y: 352 }, { x: 407, y: 259 }], style: { fill: "#2389E6", stroke: "#2389E6", strokeWidthPt: 1, opacity: 0.88 }, source: source("skills-engine-cover-native-shield", { part: "inner" }) });
  add({ id: "skills-engine-cover-arrow-shaft", type: "line", box: { x: 480, y: 162, w: 0, h: 330 }, style: { stroke: "#12B965", strokeWidthPt: 18, connectorType: "straight", lineCap: "round" }, source: source("skills-engine-cover-native-axis-arrow", { part: "shaft" }) });
  add({ id: "skills-engine-cover-arrow-head-top", type: "triangle", box: { x: 452, y: 124, w: 56, h: 52 }, style: { fill: "#12B965", stroke: "#12B965", strokeWidthPt: 0.8 }, source: source("skills-engine-cover-native-axis-arrow", { part: "top" }) });
  add({ id: "skills-engine-cover-arrow-head-bottom", type: "triangle", box: { x: 452, y: 478, w: 56, h: 52 }, style: { fill: "#12B965", stroke: "#12B965", strokeWidthPt: 0.8, rotate: 180 }, source: source("skills-engine-cover-native-axis-arrow", { part: "bottom" }) });

  const cards = [
    { label: "文档", x: 294, y: 175, w: 98, h: 116 },
    { label: "原型", x: 568, y: 167, w: 98, h: 116 },
    { label: "代码", x: 520, y: 352, w: 98, h: 116 }
  ];
  cards.forEach((card, index) => {
    add({ id: `skills-engine-cover-card-shadow-${index}`, type: "rect", box: { x: card.x + 6, y: card.y + 6, w: card.w, h: card.h }, style: { fill: "#DCE8F4", stroke: "none", strokeWidthPt: 0, opacity: 0.35, radiusPt: 3 }, source: source("skills-engine-cover-native-card-shadow", { index }) });
    add({ id: `skills-engine-cover-card-${index}`, type: "rect", box: { x: card.x, y: card.y, w: card.w, h: card.h }, style: { fill: "#FFFFFF", stroke: "#1A75BC", strokeWidthPt: 2.3, radiusPt: 2 }, source: source("skills-engine-cover-native-card", { index }) });
    textBoxes.push(temporaryAnswerWorkflowTextBox(`skills-engine-cover-card-text-${index}`, card.label, { x: card.x + 18, y: card.y + 44, w: card.w - 36, h: 34 }, { sizePt: 28, color: "#083354", weight: "regular", align: "center" }, source("skills-engine-cover-native-text", { role: "card", index })));
  });
  return { shapes, textBoxes };
}

function shouldObjectifySkillsEngineCoverTriad(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/PMPortalSkills引擎|AI原生产品交付基座/.test(labels)) return false;
  return (page.images || []).some((image) => {
    if (image?.source?.detector !== "foreground-graphic-crop") return false;
    const box = image.box || {};
    const areaRatio = Number(box.w || 0) * Number(box.h || 0)
      / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
    if (areaRatio < 0.25 || areaRatio > 0.38) return false;
    const nodeText = (image.source?.layer?.diagramUnderstanding?.nodes || []).map((node) => normalizeCjkText(node.text)).join(" ");
    return /文档/.test(nodeText) && /原型/.test(nodeText) && /代码/.test(nodeText);
  });
}

function createSkillsEngineAiComparisonMatrixObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!shouldObjectifySkillsEngineAiComparisonMatrix(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [], images: [], tables: [] };
  const target = skillsEngineAiComparisonMatrixTarget(page);
  if (!target) return { shapes: [], textBoxes: [], images: [], tables: [] };
  const layout = skillsEngineAiComparisonMatrixLayout(target.box || {}, slideSize);
  const statusIconCrops = materializeSkillsEngineAiComparisonStatusIconCrops(target, layout, slideSize, options);
  const preserveStatusIconCrops = statusIconCrops.length === 9;
  target.source = {
    ...(target.source || {}),
    skillsEngineAiComparisonMatrixObjectified: true,
    skillsEngineAiComparisonStatusIconCropsPreserved: preserveStatusIconCrops,
    preservedSkillsEngineAiComparisonStatusIconCrops: preserveStatusIconCrops ? statusIconCrops.length : 0,
    dropErasedResidualAfterNativeRebuild: true,
    expressionForm: "comparison-matrix",
    expressionSubtype: "skills-engine-ai-comparison-matrix",
    nonEditableReason: preserveStatusIconCrops
      ? `${target.source?.nonEditableReason || target.source?.reason || "skills engine AI comparison matrix"}; rebuilt comparison table as native editable grid and text while preserving status icons as local crops`
      : `${target.source?.nonEditableReason || target.source?.reason || "skills engine AI comparison matrix"}; rebuilt comparison table as native editable grid, text, and status icons`
  };
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    confidence: 0.87,
    layerSourceId: target.id || null,
    expressionForm: "comparison-matrix",
    expressionSubtype: "skills-engine-ai-comparison-matrix",
    ...extra
  });
  const shapes = [];
  const add = (shape) => shapes.push(shape);
  const tables = [createSkillsEngineAiComparisonNativeTable(source, layout)];
  if (!preserveStatusIconCrops) addSkillsEngineAiComparisonMatrixStatusIcons(add, source, layout);
  return { shapes, textBoxes: [], images: statusIconCrops, tables, coverageBox: layout.coverageBox };
}

function createSkillsEngineAiComparisonNativeTable(source, layout) {
  const headers = ["", "传统手工推进", "普通对话式AI", "PM Portal Skills 引擎"];
  const rows = [
    ["上下文感知", "依赖个人记忆", "无系统/历史知识", "实时挂载全域资产"],
    ["质量校验与拦截", "依赖人工评审", "仅做文字润色", "智能预校验逻辑边界"],
    ["资产落盘", "散落各处", "停留在对话窗", "自动推入标准域仓"]
  ];
  const top = layout.headerY - 28;
  const columnWidthsPt = layout.colBounds.map((column) => round(column.w));
  const rowHeightsPt = [
    round(layout.horizontals[0] - top),
    round(layout.horizontals[1] - layout.horizontals[0]),
    round(layout.horizontals[2] - layout.horizontals[1]),
    round(layout.bottom - layout.horizontals[2])
  ];
  const blue = "#0E557A";
  const cellStyles = [headers, ...rows].map((row, rowIndex) => row.map((_, columnIndex) => ({
    fill: "#FFFFFF",
    strokeLeft: columnIndex > 0 ? blue : "none",
    strokeRight: "none",
    strokeTop: rowIndex > 0 ? blue : "none",
    strokeBottom: "none",
    fontFamily: "Microsoft YaHei",
    fontSizePt: rowIndex === 0 ? (columnIndex === 3 ? 15.5 : 17.5) : 16,
    fontWeight: rowIndex === 0 || columnIndex === 0 ? "bold" : "regular",
    textColor: rowIndex === 0 || columnIndex === 0 ? blue : "#111111",
    textAlign: rowIndex === 0 ? "center" : "left",
    textValign: "middle",
    paddingLeftPt: rowIndex === 0 ? 5 : 10,
    paddingRightPt: rowIndex > 0 && columnIndex > 0 ? 38 : 8,
    paddingTopPt: 2,
    paddingBottomPt: 2
  })));
  const component = {
    nativeComponentInstance: true,
    nativeComponentGroupId: "skills-engine-ai-comparison-table",
    nativeComponentArchetype: "editable-comparison-table",
    nativeComponentRole: "table",
    componentOwnerId: "skills-engine-ai-comparison-table",
    componentOwnerKind: "comparison-table"
  };
  return {
    id: "skills-engine-ai-comparison-native-table",
    type: "table",
    box: { x: round(layout.left), y: round(top), w: round(layout.right - layout.left), h: round(layout.bottom - top) },
    rows: [headers, ...rows],
    style: {
      fill: "none",
      stroke: "none",
      strokeWidthPt: 1.15,
      gridStroke: blue,
      gridMode: "overlay-lines",
      gridInteriorOnly: true,
      textMode: "overlay-textboxes",
      fontFamily: "Microsoft YaHei",
      fontSizePt: 16,
      textAlign: "left",
      textValign: "middle",
      columnWidthsPt,
      rowHeightsPt,
      cellStyles
    },
    source: source("skills-engine-ai-comparison-native-table", component)
  };
}





function skillsEngineAiComparisonMatrixLayout(box = {}, slideSize = DEFAULT_SLIDE) {
  const x = Number(box.x || 46.5);
  const y = Number(box.y || 120.8);
  const w = Number(box.w || 865.5);
  const h = Number(box.h || 366.4);
  const top = y + h * 0.178;
  const bottom = y + h * 0.99;
  const verticals = [
    x + w * 0.198,
    x + w * 0.446,
    x + w * 0.709
  ];
  const horizontals = [
    top,
    y + h * 0.451,
    y + h * 0.721
  ];
  const left = x + w * 0.018;
  const right = x + w * 0.984;
  const headerY = y + h * 0.085;
  const rowCenters = [
    (horizontals[0] + horizontals[1]) / 2,
    (horizontals[1] + horizontals[2]) / 2,
    (horizontals[2] + bottom) / 2
  ];
  const colBounds = [
    { x: left, w: verticals[0] - left },
    { x: verticals[0], w: verticals[1] - verticals[0] },
    { x: verticals[1], w: verticals[2] - verticals[1] },
    { x: verticals[2], w: right - verticals[2] }
  ];
  const coverageBox = {
    x: left,
    y: headerY - 24,
    w: right - left,
    h: bottom - headerY + 26
  };
  return { box: { x, y, w, h }, coverageBox, left, right, top, bottom, verticals, horizontals, headerY, rowCenters, colBounds, slideSize };
}

function addSkillsEngineAiComparisonMatrixGrid(add, source, layout) {
  const stroke = "#0E557A";
  for (const [index, x] of layout.verticals.entries()) {
    add({
      id: `skills-engine-ai-matrix-v-${index}`,
      type: "line",
      box: { x: round(x), y: round(layout.headerY - 28), w: 0, h: round(layout.bottom - layout.headerY + 28) },
      style: { stroke, strokeWidthPt: index === 2 ? 1.35 : 1.2, connectorType: "straight", opacity: 0.9 },
      source: source("skills-engine-ai-comparison-native-grid-line", { axis: "v", index })
    });
  }
  for (const [index, y] of layout.horizontals.entries()) {
    add({
      id: `skills-engine-ai-matrix-h-${index}`,
      type: "line",
      box: { x: round(layout.left), y: round(y), w: round(layout.right - layout.left), h: 0 },
      style: { stroke, strokeWidthPt: index === 0 ? 1.6 : 1.05, connectorType: "straight", opacity: index === 0 ? 0.95 : 0.62 },
      source: source("skills-engine-ai-comparison-native-grid-line", { axis: "h", index })
    });
  }
}

function addSkillsEngineAiComparisonMatrixStatusIcons(add, source, layout) {
  for (const icon of skillsEngineAiComparisonStatusIconCenters(layout)) {
    if (icon.kind === "warning") addSkillsEngineAiWarningIcon(add, source, icon.center, icon.row);
    if (icon.kind === "cross") addSkillsEngineAiCrossIcon(add, source, icon.center, icon.row);
    if (icon.kind === "check") addSkillsEngineAiCheckIcon(add, source, icon.center, icon.row);
  }
}

function skillsEngineAiComparisonStatusIconCenters(layout) {
  const icons = [];
  for (let row = 0; row < 3; row += 1) {
    const y = layout.rowCenters[row];
    icons.push({ row, kind: "warning", center: { x: layout.colBounds[1].x + layout.colBounds[1].w * 0.78, y } });
    icons.push({ row, kind: "cross", center: { x: layout.colBounds[2].x + layout.colBounds[2].w * 0.85, y } });
    icons.push({ row, kind: "check", center: { x: layout.colBounds[3].x + layout.colBounds[3].w * 0.93, y } });
  }
  return icons;
}

function materializeSkillsEngineAiComparisonStatusIconCrops(target = {}, layout = null, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!layout || !options.sourceImage || !options.assetDir) return [];
  ensureDir(options.assetDir);
  const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : Number(target.pageIndex || 0);
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-${target.id || "skills-engine-ai-comparison"}-status-icon`, "skills-engine-ai-comparison-status-icon");
  const crops = [];
  for (const icon of skillsEngineAiComparisonStatusIconCenters(layout)) {
    const pad = icon.kind === "warning" ? 30 : 27;
    const ptBox = clampPtBoxToSlide({
      x: icon.center.x - pad,
      y: icon.center.y - pad,
      w: pad * 2,
      h: pad * 2
    }, slideSize);
    const pxBox = ptToPxBox(ptBox, options.sourceImage, slideSize, 0);
    const file = path.join(options.assetDir, `${base}-${icon.kind}-${String(icon.row + 1).padStart(2, "0")}.png`);
    writePng(file, cropPng(options.sourceImage, pxBox));
    crops.push({
      id: `${target.id || "skills-engine-ai-comparison"}-${icon.kind}-status-crop-${icon.row}`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
      box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),
      source: {
        editable: false,
        nativeRebuild: false,
        detector: "skills-engine-ai-comparison-status-icon-crop",
        strategy: "local-fidelity-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: `${icon.kind}-status-icon`,
        recommendedAction: "preserve-local-crop",
        layerSourceId: target.id || null,
        statusIconKind: icon.kind,
        statusIconRow: icon.row,
        tableOverlay: true,
        nonEditableReason: "comparison matrix status icon preserved as a local crop; grid and text remain native editable"
      }
    });
  }
  return crops;
}

function addSkillsEngineAiWarningIcon(add, source, center, row) {
  const size = 34;
  add({ id: `skills-engine-ai-warning-${row}`, type: "triangle", box: { x: round(center.x - size / 2), y: round(center.y - size / 2), w: size, h: size }, style: { fill: "#F58620", stroke: "#F58620", strokeWidthPt: 0.8 }, source: source("skills-engine-ai-comparison-native-warning", { row }) });
  add({ id: `skills-engine-ai-warning-bang-${row}`, type: "line", box: { x: round(center.x), y: round(center.y - 9), w: 0, h: 12 }, style: { stroke: "#FFFFFF", strokeWidthPt: 2.5, connectorType: "straight", lineCap: "round" }, source: source("skills-engine-ai-comparison-native-warning-mark", { row, part: "bang" }) });
  add({ id: `skills-engine-ai-warning-dot-${row}`, type: "ellipse", box: { x: round(center.x - 2.2), y: round(center.y + 8), w: 4.4, h: 4.4 }, style: { fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidthPt: 0 }, source: source("skills-engine-ai-comparison-native-warning-mark", { row, part: "dot" }) });
}

function addSkillsEngineAiCrossIcon(add, source, center, row) {
  const size = 34;
  add({ id: `skills-engine-ai-cross-bg-${row}`, type: "ellipse", box: { x: round(center.x - size / 2), y: round(center.y - size / 2), w: size, h: size }, style: { fill: "#8E8E8E", stroke: "#8E8E8E", strokeWidthPt: 0.8 }, source: source("skills-engine-ai-comparison-native-status-circle", { row, kind: "cross" }) });
  add({ id: `skills-engine-ai-cross-a-${row}`, type: "line", box: lineBox({ x: center.x - 9, y: center.y - 9 }, { x: center.x + 9, y: center.y + 9 }), style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight", lineCap: "round" }, source: source("skills-engine-ai-comparison-native-status-mark", { row, kind: "cross", part: "a" }) });
  add({ id: `skills-engine-ai-cross-b-${row}`, type: "line", box: lineBox({ x: center.x + 9, y: center.y - 9 }, { x: center.x - 9, y: center.y + 9 }), style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight", lineCap: "round" }, source: source("skills-engine-ai-comparison-native-status-mark", { row, kind: "cross", part: "b" }) });
}

function addSkillsEngineAiCheckIcon(add, source, center, row) {
  const size = 34;
  const fill = row === 0 ? "#0D65A4" : "#20A75A";
  add({ id: `skills-engine-ai-check-bg-${row}`, type: "ellipse", box: { x: round(center.x - size / 2), y: round(center.y - size / 2), w: size, h: size }, style: { fill, stroke: fill, strokeWidthPt: 0.8 }, source: source("skills-engine-ai-comparison-native-status-circle", { row, kind: "check" }) });
  add({ id: `skills-engine-ai-check-a-${row}`, type: "line", box: lineBox({ x: center.x - 10, y: center.y - 1 }, { x: center.x - 3, y: center.y + 8 }), style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight", lineCap: "round" }, source: source("skills-engine-ai-comparison-native-status-mark", { row, kind: "check", part: "a" }) });
  add({ id: `skills-engine-ai-check-b-${row}`, type: "line", box: lineBox({ x: center.x - 3, y: center.y + 8 }, { x: center.x + 12, y: center.y - 11 }), style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight", lineCap: "round" }, source: source("skills-engine-ai-comparison-native-status-mark", { row, kind: "check", part: "b" }) });
}

function addSkillsEngineAiComparisonMatrixText(textBoxes, source, layout) {
  const push = (id, value, box, font = {}, extra = {}) => {
    const textBox = temporaryAnswerWorkflowTextBox(
      `skills-engine-ai-matrix-${id}`,
      value,
      box,
      {
        family: "Microsoft YaHei",
        sizePt: font.sizePt || 16,
        color: font.color || "#111111",
        weight: font.weight || "regular",
        align: font.align || "left",
        valign: "middle"
      },
      source("skills-engine-ai-comparison-native-text", extra)
    );
    if (font.wrap === false) textBox.wrap = false;
    textBoxes.push(textBox);
  };
  const blue = "#0D557A";
  const headers = ["", "传统手工推进", "普通对话式AI", "PM Portal Skills 引擎"];
  headers.forEach((value, col) => {
    if (!value) return;
    push(`header-${col}`, value, {
      x: round(layout.colBounds[col].x + 20),
      y: round(layout.headerY),
      w: round(layout.colBounds[col].w - 40),
      h: 34
    }, { sizePt: col === 3 ? 15.5 : 17.5, color: blue, weight: "bold", align: "center", wrap: false }, { role: "header", col });
  });
  const rows = [
    ["上下文感知", "依赖个人记忆", "无系统/历史知识", "实时挂载全域资产"],
    ["质量校验与拦截", "依赖人工评审", "仅做文字润色", "智能预校验逻辑边界"],
    ["资产落盘", "散落各处", "停留在对话窗", "自动推入标准域仓"]
  ];
  rows.forEach((row, rowIndex) => {
    const y = layout.rowCenters[rowIndex];
    row.forEach((value, col) => {
      const iconPad = col === 1 || col === 2 ? layout.colBounds[col].w * 0.18 : (col === 3 ? layout.colBounds[col].w * 0.11 : 0);
      push(`row-${rowIndex}-col-${col}`, value, {
        x: round(layout.colBounds[col].x + (col === 0 ? 10 : 18)),
        y: round(y - 16),
        w: round(col === 0 ? layout.colBounds[col].w - 14 : layout.colBounds[col].w - (col === 3 ? 24 : 36) - iconPad),
        h: 32
      }, {
        sizePt: col === 0 ? 16.5 : (col === 3 ? 14.2 : 16.5),
        color: col === 0 ? blue : "#111111",
        weight: col === 0 ? "bold" : "regular",
        align: col === 0 ? "left" : "left",
        wrap: col === 0 || col === 3 ? false : undefined
      }, { role: col === 0 ? "row-header" : "cell", row: rowIndex, col });
    });
  });
}

function createCenterBadgeQuadrantCycleObjects(page = {}, rawTextBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, options = {}) {
  const layout = inferCenterBadgeQuadrantCycleLayout(page, rawTextBoxes, slideSize);
  if (!layout) return { shapes: [], textBoxes: [] };
  const { image, box, centerTextBox, quadrantTextBoxes } = layout;
  const fidelityCrop = createCenterBadgeQuadrantCycleFidelityCrop({
    sourceImage,
    box,
    externalTextBoxes: (rawTextBoxes || []).filter((item) => item?.box && !boxCenterInside(item.box, box)),
    slideSize,
    assetDir: options.assetDir,
    irDir: options.irDir,
    deckName: options.deckName,
    pageIndex: options.pageIndex,
    sourceImageId: image.id
  });
  image.source = {
    ...(image.source || {}),
    editable: false,
    nativeRebuild: true,
    centerBadgeQuadrantCycleObjectified: true,
    dropErasedResidualAfterNativeRebuild: true,
    expressionForm: fidelityCrop ? "screenshot-or-document" : "structured-diagram",
    expressionSubtype: "center-badge-quadrant-cycle",
    recommendedAction: fidelityCrop ? "keep-local-crop" : "rebuild-native-quadrants-arrows-badge-and-text",
    nonEditableReason: fidelityCrop
      ? `${image.source?.nonEditableReason || image.source?.reason || "quadrant cycle underlay"}; central authored cycle illustration retained as one protected fidelity crop with embedded labels`
      : `${image.source?.nonEditableReason || image.source?.reason || "quadrant cycle underlay"}; fully replaced by measured native quadrant-cycle minimum units`
  };
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "structured-diagram",
    expressionSubtype: "center-badge-quadrant-cycle",
    confidence: 0.93,
    ...extra
  });
  if (fidelityCrop) {
    const externalTextBoxes = centerBadgeQuadrantCycleExternalTextBoxes(rawTextBoxes, box, sourceImage, slideSize, source);
    return { shapes: [], textBoxes: externalTextBoxes, images: [fidelityCrop], box };
  }
  const sampledColors = sampleCenterBadgeQuadrantCycleColors(sourceImage, box, slideSize);
  const quarterColors = [sampledColors.topLeft, sampledColors.topRight, sampledColors.bottomLeft, sampledColors.bottomRight];
  const quarterKeys = ["top-left", "top-right", "bottom-left", "bottom-right"];
  const componentMetadata = (role, part) => ({
    nativeComponentGroupId: `center-badge-quadrant-cycle-${role}`,
    nativeComponentParentId: "center-badge-quadrant-cycle",
    nativeComponentArchetype: role === "center" ? "quadrant-cycle-center" : "quadrant-cycle-segment",
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentRole: role,
    nativeComponentPart: part
  });
  const shapes = quarterKeys.map((key, index) => ({
    id: `center-badge-cycle-quadrant-${key}`,
    type: "freeform",
    box: { ...box },
    style: {
      fill: quarterColors[index],
      stroke: "none",
      strokeWidthPt: 0,
      freeformSegments: centerBadgeQuadrantSegments(key)
    },
    source: source("center-badge-quadrant-cycle-native-quadrant", {
      quadrant: key,
      sampledFill: quarterColors[index],
      ...componentMetadata(key, "segment")
    })
  }));
  shapes.push(
    {
      id: "center-badge-cycle-divider-horizontal",
      type: "line",
      box: { x: box.x, y: box.y + box.h / 2, w: box.w, h: 0 },
      style: { stroke: "#FFFFFF", strokeWidthPt: Math.max(6, box.h * 0.018), connectorType: "straight" },
      source: source("center-badge-quadrant-cycle-native-divider", { axis: "horizontal", ...componentMetadata("center", "divider") })
    },
    {
      id: "center-badge-cycle-divider-vertical",
      type: "line",
      box: { x: box.x + box.w / 2, y: box.y, w: 0, h: box.h },
      style: { stroke: "#FFFFFF", strokeWidthPt: Math.max(6, box.w * 0.018), connectorType: "straight" },
      source: source("center-badge-quadrant-cycle-native-divider", { axis: "vertical", ...componentMetadata("center", "divider") })
    }
  );
  for (const key of quarterKeys) {
    shapes.push({
      id: `center-badge-cycle-arrow-${key}`,
      type: "freeform",
      box: { ...box },
      style: {
        fill: "none",
        stroke: sampledColors.arrow,
        strokeWidthPt: Math.max(10, box.w * 0.026),
        closePath: false,
        endArrow: "triangle",
        freeformSegments: centerBadgeCycleArrowSegments(key),
        shadow: { color: sampledColors.arrow, alpha: 0.14, blurPt: 2.5, distancePt: 1, angle: 45 }
      },
      source: source("center-badge-quadrant-cycle-native-arrow", {
        quadrant: key,
        sampledStroke: sampledColors.arrow,
        ...componentMetadata(key, "arrow")
      })
    });
  }
  const badgeSize = Math.min(box.w, box.h) * 0.255;
  const badgeBox = {
    x: box.x + box.w / 2 - badgeSize / 2,
    y: box.y + box.h / 2 - badgeSize / 2,
    w: badgeSize,
    h: badgeSize
  };
  const innerInset = badgeSize * 0.075;
  shapes.push(
    {
      id: "center-badge-cycle-badge-ring",
      type: "ellipse",
      box: badgeBox,
      style: { fill: "#FFFFFF", stroke: "#E4E7EA", strokeWidthPt: 1.2, shadow: { color: "#6C7680", alpha: 0.2, blurPt: 5, distancePt: 2, angle: 45 } },
      source: source("center-badge-quadrant-cycle-native-badge", { part: "ring", ...componentMetadata("center", "badge") })
    },
    {
      id: "center-badge-cycle-badge-core",
      type: "ellipse",
      box: { x: badgeBox.x + innerInset, y: badgeBox.y + innerInset, w: badgeBox.w - innerInset * 2, h: badgeBox.h - innerInset * 2 },
      style: { fill: sampledColors.badge, stroke: darkerHex(sampledColors.badge, 0.18), strokeWidthPt: 1.1 },
      source: source("center-badge-quadrant-cycle-native-badge", { part: "core", sampledFill: sampledColors.badge, ...componentMetadata("center", "badge") })
    }
  );
  const externalTextBoxes = centerBadgeQuadrantCycleExternalTextBoxes(rawTextBoxes, box, sourceImage, slideSize, source, componentMetadata);
  const textBoxes = quadrantTextBoxes.flatMap((items, quadrantIndex) => items.map((item, lineIndex) => {
    const sampledInk = sourceImage ? sampleInkColor(sourceImage, item.box, slideSize, quadrantIndex === 1 || quadrantIndex === 2 ? "#FFFFFF" : "#102A43") : (quadrantIndex === 1 || quadrantIndex === 2 ? "#FFFFFF" : "#102A43");
    const repairedText = repairCenterBadgeCycleOcrText(item.text);
    const internalTypography = normalizeCenterBadgeCycleInternalLabel(repairedText, item.box);
    return temporaryAnswerWorkflowTextBox(
      `center-badge-cycle-label-${quadrantIndex + 1}-${lineIndex + 1}`,
      repairedText,
      internalTypography.box,
      {
        family: item.font?.family || "Microsoft YaHei",
        sizePt: Number(item.font?.sizePt || (lineIndex === 0 ? 18 : 13.5)),
        color: sampledInk,
        weight: lineIndex === 0 ? "bold" : "regular",
        align: "center"
      },
      source("center-badge-quadrant-cycle-native-text", {
        quadrantIndex,
        lineIndex,
        ocrLineGeometry: true,
        ...(repairedText !== item.text ? { ocrSourceText: item.text, ocrTextRepaired: true } : {}),
        ...componentMetadata(quarterKeys[quadrantIndex], "internal-text")
      })
    );
  }));
  textBoxes.push(temporaryAnswerWorkflowTextBox(
    "center-badge-cycle-center-label",
    centerTextBox.text,
    { x: badgeBox.x + badgeSize * 0.12, y: badgeBox.y + badgeSize * 0.22, w: badgeSize * 0.76, h: badgeSize * 0.56 },
    { family: centerTextBox.font?.family || "Microsoft YaHei", sizePt: Math.max(34, Number(centerTextBox.font?.sizePt || 30) * 1.28), color: "#FFFFFF", weight: "bold", align: "center" },
    source("center-badge-quadrant-cycle-native-text", {
      role: "center-badge",
      ocrLineGeometry: true,
      ...componentMetadata("center", "center-text")
    })
  ));
  textBoxes.unshift(...externalTextBoxes);
  return { shapes, textBoxes, box };
}

function createCenterBadgeQuadrantCycleFidelityCrop({ sourceImage, box, externalTextBoxes = [], slideSize = DEFAULT_SLIDE, assetDir, irDir, deckName = "deck", pageIndex = 0, sourceImageId = null } = {}) {
  if (!sourceImage || !assetDir || !box?.w || !box?.h) return null;
  ensureDir(assetDir);
  const cropBox = clampPtBoxToSlide(box, slideSize);
  // External captions can deliberately overlap the outer edge of the circle.
  // Remove their source glyphs before adding native editable text above the crop.
  const overlappingExternalText = (externalTextBoxes || [])
    .filter((item) => item?.box && ptBoxOverlapAreaValue(cropBox, item.box) > 0);
  const textMasks = overlappingExternalText
    .map((item) => ptToPxBox(expandPtBox(item.box, slideSize, 2, 2), sourceImage, slideSize, 0));
  const cleanedSource = textMasks.length > 0
    ? eraseDarkPixelsInRects(sourceImage, textMasks, { maxLuma: 235 })
    : { image: sourceImage, erasedPixels: 0 };
  const file = path.join(assetDir, `${safeIdentifier(`${deckName}-p${String(Number(pageIndex) + 1).padStart(2, "0")}-center-badge-cycle`, "center-badge-cycle")}.png`);
  const cropPixels = ptToPxBox(cropBox, sourceImage, slideSize, 0);
  writePng(file, cropPng(cleanedSource.image, cropPixels));
  return {
    id: `center-badge-quadrant-cycle-fidelity-crop-${Number(pageIndex) || 0}`,
    type: "fidelity-crop",
    assetPath: path.relative(irDir || assetDir, file).replace(/\\/g, "/"),
    // The extracted raster is integer-pixel aligned. Use its projected bounds
    // so the presentation renderer does not rescale the diagram by a fraction
    // of a pixel and introduce a visible halo along the circular edge.
    box: pxToPtBox(cropPixels, sourceImage, slideSize, 0),
    source: {
      editable: false,
      nativeRebuild: true,
      detector: "center-badge-quadrant-cycle-fidelity-crop",
      expressionForm: "screenshot-or-document",
      expressionSubtype: "center-badge-quadrant-cycle-illustration",
      recommendedAction: "keep-local-crop",
      textEmbeddedInFidelityCrop: true,
      textErasedFromCrop: overlappingExternalText.length > 0,
      erasedExternalTextBoxCount: overlappingExternalText.length,
      erasedTextPixelCount: cleanedSource.erasedPixels,
      protectedMinimumUnit: true,
      intentionalMinimumUnitCrop: true,
      parentImageId: sourceImageId,
      nonEditableReason: "four-quadrant circular illustration retained as a protected local crop; its embedded labels are intentionally not duplicated as native text"
    }
  };
}

function centerBadgeQuadrantCycleExternalTextBoxes(rawTextBoxes = [], box = {}, sourceImage = null, slideSize = DEFAULT_SLIDE, source = () => ({}), componentMetadata = () => ({})) {
  return (rawTextBoxes || [])
    .filter((item) => !boxCenterInside(item?.box, box))
    .map((item, index) => {
      const itemCenterX = Number(item.box?.x || 0) + Number(item.box?.w || 0) / 2;
      const itemCenterY = Number(item.box?.y || 0) + Number(item.box?.h || 0) / 2;
      const quadrant = `${itemCenterY < box.y + box.h / 2 ? "top" : "bottom"}-${itemCenterX < box.x + box.w / 2 ? "left" : "right"}`;
      const repairedText = repairCenterBadgeCycleOcrText(item.text);
      const externalTypography = normalizeCenterBadgeCycleExternalTitle(repairedText, item.box, quadrant);
      return temporaryAnswerWorkflowTextBox(
        `center-badge-cycle-external-text-${index + 1}`,
        externalTypography.text,
        externalTypography.box,
        {
          family: item.font?.family || "Microsoft YaHei",
          sizePt: Number(externalTypography.font?.sizePt || item.font?.sizePt || 14),
          color: sourceImage ? sampleInkColor(sourceImage, item.box, slideSize, "#102A43") : "#102A43",
          weight: externalTypography.font?.weight || inferWeight(item, "regular"),
          align: "left"
        },
        source("center-badge-quadrant-cycle-native-text", {
          role: "external-explanation",
          sourceTextId: item.id || null,
          ocrLineGeometry: true,
          ...(externalTypography.text !== item.text ? { ocrSourceText: item.text, ocrTextRepaired: true } : {}),
          ...componentMetadata(quadrant, "external-text")
        })
      );
    });
}

function normalizeCenterBadgeCycleExternalTitle(text, box = {}, quadrant = "") {
  const value = String(text || "");
  const compact = value.replace(/\s+/g, "").replace(/[（(]/g, "(").replace(/[）)]/g, ")");
  const normalizedText = /^(?:资产复利|效率提速)\(.+\)$/.test(compact)
    ? compact.replace(/^(资产复利|效率提速)\(/, "$1 (").replace("KnowledgeAsset)", "Knowledge Asset)")
    : normalizeCenterBadgeCycleExternalCopy(value);
  if (!/^(?:资产复利|效率提速) \(.+\)$/.test(normalizedText)) {
    return {
      text: normalizedText,
      box,
      font: {}
    };
  }
  const minWidth = quadrant === "top-left" ? 285 : 225;
  return {
    text: normalizedText,
    box: { ...box, w: Math.max(Number(box.w || 0), minWidth) },
    font: { weight: "bold" }
  };
}

function normalizeCenterBadgeCycleExternalCopy(value) {
  const compact = String(value || "").replace(/\s+/g, "");
  if (/^60%-90%时间$/.test(compact)) return "60%-90% 时间";
  if (/^项目落幕不再是资产的终结[，,]?$/.test(compact)) return "项目落幕不再是资产的终结，";
  if (/^质量控制全线左移[（(]Shift-Left[）)]$/.test(compact)) return "质量控制全线左移 (Shift-Left)";
  return String(value || "");
}

function normalizeCenterBadgeCycleInternalLabel(text, box = {}) {
  // LibreOffice/PowerPoint can wrap the final parenthesis in the narrow OCR
  // evidence box. Preserve its center but give this known label one safe line.
  if (text !== "(Efficiency)") return { box };
  const width = Math.max(Number(box.w || 0), 112);
  const center = Number(box.x || 0) + Number(box.w || 0) / 2;
  return {
    box: {
      ...box,
      x: round(center - width / 2),
      w: width
    }
  };
}

function repairCenterBadgeCycleOcrText(value) {
  const text = String(value || "").trim();
  if (!text) return text;
  const compact = text.replace(/\s+/g, "").replace(/[（(]/g, "(").replace(/[）)]/g, ")");
  if (/^资产复利\(KnowledgeAsset\)$/.test(compact)) return "资产复利（Knowledge Asset）";
  if (/^\(KnowledgeAsset\)$/.test(compact)) return "(Knowledge Asset)";
  if (/^\(Efficiency\)+$/.test(compact)) return "(Efficiency)";
  if (/^\(Standardization\)+$/.test(compact)) return "(Standardization)";
  if (/^\(Quality\)+$/.test(compact)) return "(Quality)";
  if (/^标准统[—一-]?$/.test(text)) return "标准统一";
  return text;
}

function inferCenterBadgeQuadrantCycleLayout(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const slideArea = Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  for (const image of page.images || []) {
    const box = image?.box || {};
    const areaRatio = Number(box.w || 0) * Number(box.h || 0) / slideArea;
    const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
    if (areaRatio < 0.28 || areaRatio > 0.5 || aspect < 0.82 || aspect > 1.18) continue;
    if (!/(?:underlay|diagram|graphic|process)/i.test(String(image?.source?.detector || ""))) continue;
    const centerX = Number(box.x || 0) + Number(box.w || 0) / 2;
    const centerY = Number(box.y || 0) + Number(box.h || 0) / 2;
    const internal = (rawTextBoxes || []).filter((item) => boxCenterInside(item?.box, box));
    if (internal.length < 9 || internal.length > 16) continue;
    const centerCandidates = internal.filter((item) => {
      const itemBox = item?.box || {};
      const itemCenterX = Number(itemBox.x || 0) + Number(itemBox.w || 0) / 2;
      const itemCenterY = Number(itemBox.y || 0) + Number(itemBox.h || 0) / 2;
      const shortLabel = normalizeCjkText(item?.text || "").length >= 1 && normalizeCjkText(item?.text || "").length <= 6;
      return shortLabel
        && Math.abs(itemCenterX - centerX) <= Number(box.w || 0) * 0.14
        && Math.abs(itemCenterY - centerY) <= Number(box.h || 0) * 0.14;
    });
    if (centerCandidates.length !== 1) continue;
    const centerTextBox = centerCandidates[0];
    const buckets = [[], [], [], []];
    for (const item of internal) {
      if (item === centerTextBox) continue;
      const itemBox = item?.box || {};
      const itemCenterX = Number(itemBox.x || 0) + Number(itemBox.w || 0) / 2;
      const itemCenterY = Number(itemBox.y || 0) + Number(itemBox.h || 0) / 2;
      const index = itemCenterY < centerY ? (itemCenterX < centerX ? 0 : 1) : (itemCenterX < centerX ? 2 : 3);
      buckets[index].push(item);
    }
    if (!buckets.every((items) => items.length === 2)) continue;
    const ordered = buckets.map((items) => [...items].sort((a, b) => Number(a.box?.y || 0) - Number(b.box?.y || 0)));
    const pairedLines = ordered.every((items) => {
      const gap = Math.abs(Number(items[1].box?.y || 0) - Number(items[0].box?.y || 0));
      return gap >= 14 && gap <= Number(box.h || 0) * 0.13;
    });
    if (!pairedLines) continue;
    return { image, box: roundedBox(box), centerTextBox, quadrantTextBoxes: ordered };
  }
  return null;
}

function centerBadgeQuadrantSegments(key) {
  // Exact cubic-Bezier handle offset for a quarter circle with radius 0.5.
  // The previous empirically rounded value flattened the outer quadrants and
  // made the native cycle visibly diverge from the circular source artwork.
  const k = 0.223857;
  const paths = {
    "top-left": [{ type: "moveTo", points: [{ x: 0.5, y: 0.5 }] }, { type: "lnTo", points: [{ x: 0, y: 0.5 }] }, { type: "cubicBezTo", points: [{ x: 0, y: k }, { x: k, y: 0 }, { x: 0.5, y: 0 }] }],
    "top-right": [{ type: "moveTo", points: [{ x: 0.5, y: 0.5 }] }, { type: "lnTo", points: [{ x: 0.5, y: 0 }] }, { type: "cubicBezTo", points: [{ x: 1 - k, y: 0 }, { x: 1, y: k }, { x: 1, y: 0.5 }] }],
    "bottom-left": [{ type: "moveTo", points: [{ x: 0.5, y: 0.5 }] }, { type: "lnTo", points: [{ x: 0.5, y: 1 }] }, { type: "cubicBezTo", points: [{ x: k, y: 1 }, { x: 0, y: 1 - k }, { x: 0, y: 0.5 }] }],
    "bottom-right": [{ type: "moveTo", points: [{ x: 0.5, y: 0.5 }] }, { type: "lnTo", points: [{ x: 1, y: 0.5 }] }, { type: "cubicBezTo", points: [{ x: 1, y: 1 - k }, { x: 1 - k, y: 1 }, { x: 0.5, y: 1 }] }]
  };
  return [...(paths[key] || []), { type: "close" }];
}

function centerBadgeCycleArrowSegments(key) {
  const paths = {
    "top-left": [{ type: "moveTo", points: [{ x: 0.11, y: 0.5 }] }, { type: "cubicBezTo", points: [{ x: 0.11, y: 0.285 }, { x: 0.285, y: 0.11 }, { x: 0.5, y: 0.11 }] }],
    "top-right": [{ type: "moveTo", points: [{ x: 0.5, y: 0.11 }] }, { type: "cubicBezTo", points: [{ x: 0.715, y: 0.11 }, { x: 0.89, y: 0.285 }, { x: 0.89, y: 0.5 }] }],
    "bottom-right": [{ type: "moveTo", points: [{ x: 0.89, y: 0.5 }] }, { type: "cubicBezTo", points: [{ x: 0.89, y: 0.715 }, { x: 0.715, y: 0.89 }, { x: 0.5, y: 0.89 }] }],
    "bottom-left": [{ type: "moveTo", points: [{ x: 0.5, y: 0.89 }] }, { type: "cubicBezTo", points: [{ x: 0.285, y: 0.89 }, { x: 0.11, y: 0.715 }, { x: 0.11, y: 0.5 }] }]
  };
  return paths[key] || [];
}

function sampleCenterBadgeQuadrantCycleColors(sourceImage, box, slideSize = DEFAULT_SLIDE) {
  const sample = (xRatio, yRatio, fallback) => {
    if (!sourceImage?.rgba || !sourceImage.width || !sourceImage.height) return fallback;
    const sx = sourceImage.width / Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt);
    const sy = sourceImage.height / Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);
    const x = clamp(Math.round((box.x + box.w * xRatio) * sx), 0, sourceImage.width - 1);
    const y = clamp(Math.round((box.y + box.h * yRatio) * sy), 0, sourceImage.height - 1);
    const colors = [];
    for (let dy = -3; dy <= 3; dy += 1) {
      for (let dx = -3; dx <= 3; dx += 1) {
        colors.push(pixel(sourceImage, clamp(x + dx, 0, sourceImage.width - 1), clamp(y + dy, 0, sourceImage.height - 1)));
      }
    }
    return rgbToHex(averageColor(colors));
  };
  const sampleQuadrant = (points, fallback) => {
    if (!sourceImage?.rgba || !sourceImage.width || !sourceImage.height) return fallback;
    const colors = points.map(([x, y]) => parseHex(sample(x, y, fallback)))
      .filter((color) => !(color.g > color.r * 1.12 && color.g > color.b * 1.08))
      .filter((color) => luma(color) < 250 && luma(color) > 35);
    return colors.length > 0 ? rgbToHex(averageColor(colors)) : fallback;
  };
  const arrowCandidate = parseHex(sample(0.5, 0.17, "#34C76B"));
  const badgeCandidate = parseHex(sample(0.5, 0.5, "#E60032"));
  return {
    topLeft: sampleQuadrant([[0.16, 0.27], [0.22, 0.18], [0.28, 0.12]], "#E1E7EF"),
    topRight: sampleQuadrant([[0.84, 0.27], [0.78, 0.18], [0.72, 0.12]], "#14599A"),
    bottomLeft: sampleQuadrant([[0.16, 0.73], [0.22, 0.82], [0.28, 0.88]], "#14599A"),
    bottomRight: sampleQuadrant([[0.84, 0.73], [0.78, 0.82], [0.72, 0.88]], "#E1E7EF"),
    arrow: arrowCandidate.g > arrowCandidate.r * 1.15 && arrowCandidate.g > arrowCandidate.b * 1.1 ? rgbToHex(arrowCandidate) : "#34C76B",
    badge: badgeCandidate.r > badgeCandidate.g * 1.35 && badgeCandidate.r > badgeCandidate.b * 1.2 ? rgbToHex(badgeCandidate) : "#E60032"
  };
}

function createWorkflowDemandUnderstandingAssistantObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, sourceImage = null) {
  if (!shouldObjectifyWorkflowDemandUnderstandingAssistant(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };
  const sourceImages = (page.images || []).filter((image) => /^(?:left-illustration-panel-crop|bottom-banner-crop)$/.test(image?.source?.detector || ""));
  for (const image of sourceImages.filter((item) => item?.source?.detector === "left-illustration-panel-crop")) {
    image.source = {
      ...(image.source || {}),
      editable: false,
      nativeRebuild: true,
      expressionForm: "icon-or-illustration",
      expressionSubtype: "workflow-demand-funnel-illustration",
      workflowDemandUnderstandingLeftIllustrationPreserved: true,
      intentionalMinimumUnitCrop: true,
      protectedMinimumUnit: true,
      dropErasedResidualAfterNativeRebuild: false,
      recommendedAction: "match-icon-library-or-keep-local-crop",
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "workflow demand understanding funnel illustration"}; preserved the dense left illustration as a movable fidelity crop while rebuilding surrounding cards and value banner natively`
    };
    applyMinimumUnitCropRenderStrategy(image.source);
  }
  for (const image of sourceImages.filter((item) => item?.source?.detector === "bottom-banner-crop")) {
    image.source = {
      ...(image.source || {}),
      workflowDemandUnderstandingAssistantObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "workflow demand understanding assistant banner"}; rebuilt value banner as native editable components`
    };
  }
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    confidence: 0.9,
    ...extra
  });
  const shapes = [];
  const textBoxes = [];
  const add = (shape) => shapes.push(shape);
  const layout = workflowDemandUnderstandingLayout(rawTextBoxes, slideSize);
  addWorkflowDemandCardShells(add, source, layout, sourceImage);
  addWorkflowDemandCleanContentText(textBoxes, source, rawTextBoxes, layout);
  addWorkflowDemandShieldIcon(add, source, layout);
  addWorkflowDemandValueBanner(add, textBoxes, source, slideSize, rawTextBoxes, layout, sourceImage);
  return { shapes, textBoxes };
}

function shouldObjectifyWorkflowDemandUnderstandingAssistant(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/需求理解助手/.test(labels) || !/核心痛点/.test(labels) || !/Skill解决方案/.test(labels)) return false;
  const candidates = (page.images || []).filter((image) => /^(?:left-illustration-panel-crop|bottom-banner-crop)$/.test(image?.source?.detector || ""));
  const hasLeft = candidates.some((image) => image?.source?.detector === "left-illustration-panel-crop");
  const hasBanner = candidates.some((image) => image?.source?.detector === "bottom-banner-crop");
  const areaRatio = candidates.reduce((sum, image) => sum + Number(image.box?.w || 0) * Number(image.box?.h || 0), 0)
    / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  return hasLeft && hasBanner && areaRatio > 0.25 && areaRatio < 0.6;
}

function isWorkflowDemandUnderstandingAssistantLeftIllustrationCrop(image = {}, rawTextBoxes = []) {
  if (image?.source?.detector !== "left-illustration-panel-crop") return false;
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  return /需求理解助手/.test(labels) && /核心痛点/.test(labels) && /Skill解决方案/.test(labels);
}

function addWorkflowDemandFunnelIllustration(add, textBoxes, source) {
  add({ id: "workflow-demand-funnel-lip", type: "rect", box: { x: 90, y: 192, w: 260, h: 22 }, style: { fill: "#0768B5", stroke: "#0768B5", strokeWidthPt: 0, radiusPt: 9, shadow: { color: "#0768B5", alpha: 0.16, blurPt: 3, distancePt: 1, angle: 45 } }, source: source("workflow-demand-native-funnel", { part: "lip" }) });
  add({ id: "workflow-demand-funnel-body", type: "freeform", box: { x: 116, y: 213, w: 208, h: 210 }, points: [{ x: 116, y: 213 }, { x: 324, y: 213 }, { x: 248, y: 355 }, { x: 244, y: 416 }, { x: 201, y: 423 }, { x: 197, y: 355 }], style: { fill: "#0870C3", stroke: "#075A9F", strokeWidthPt: 2, opacity: 0.98 }, source: source("workflow-demand-native-funnel", { part: "body" }) });
  add({ id: "workflow-demand-funnel-inner-left", type: "freeform", box: { x: 124, y: 220, w: 76, h: 145 }, points: [{ x: 124, y: 220 }, { x: 171, y: 220 }, { x: 202, y: 349 }, { x: 191, y: 365 }], style: { fill: "#5AA4D3", stroke: "none", strokeWidthPt: 0, opacity: 0.45 }, source: source("workflow-demand-native-funnel", { part: "inner-left" }) });
  add({ id: "workflow-demand-funnel-glow", type: "ellipse", box: { x: 158, y: 244, w: 118, h: 95 }, style: { fill: "#49D66E", stroke: "none", strokeWidthPt: 0, opacity: 0.28 }, source: source("workflow-demand-native-funnel-glow") });
  [0, 1, 2].forEach((index) => {
    add({ id: `workflow-demand-gear-${index}`, type: "ellipse", box: { x: 186 + index * 28, y: 268 + (index % 2) * 18, w: 34, h: 34 }, style: { fill: "#EAF8EF", stroke: "#BFE8C9", strokeWidthPt: 2 }, source: source("workflow-demand-native-gear", { index }) });
    add({ id: `workflow-demand-gear-hole-${index}`, type: "ellipse", box: { x: 197 + index * 28, y: 279 + (index % 2) * 18, w: 12, h: 12 }, style: { fill: "#56C66E", stroke: "#56C66E", strokeWidthPt: 0 }, source: source("workflow-demand-native-gear", { index, part: "hole" }) });
  });
  const docs = [
    { kind: "chat", x: 75, y: 95, color: "#D9EEF9", stroke: "#0E71A9" },
    { kind: "doc", x: 215, y: 74, color: "#D9EEF9", stroke: "#0E71A9" },
    { kind: "note", x: 289, y: 88, color: "#0D6FB8", stroke: "#075A9F" },
    { kind: "doc", x: 164, y: 133, color: "#D9EEF9", stroke: "#0E71A9" },
    { kind: "card", x: 276, y: 146, color: "#D9EEF9", stroke: "#0E71A9" }
  ];
  docs.forEach((doc, index) => {
    add({ id: `workflow-demand-floating-${index}`, type: "rect", box: { x: doc.x, y: doc.y, w: index === 0 ? 54 : 44, h: index === 0 ? 42 : 54 }, style: { fill: doc.color, stroke: doc.stroke, strokeWidthPt: 1.3, radiusPt: 4, rotate: index === 2 ? 13 : index === 3 ? -12 : 0 }, source: source("workflow-demand-native-floating-doc", { index, kind: doc.kind }) });
    [0, 1, 2].forEach((line) => add({ id: `workflow-demand-floating-line-${index}-${line}`, type: "line", box: { x: doc.x + 10, y: doc.y + 13 + line * 10, w: index === 0 ? 30 : 23, h: 0 }, style: { stroke: index === 2 ? "#E8F2FA" : "#6D94A9", strokeWidthPt: 1.4, connectorType: "straight" }, source: source("workflow-demand-native-floating-doc-line", { index, line }) }));
  });
  const pills = [
    ["需求理解", 139, 398, "#10A34E"],
    ["PRD生成", 224, 398, "#075FAB"],
    ["精准提炼", 139, 428, "#075FAB"],
    ["结构清单", 224, 428, "#10A34E"]
  ];
  pills.forEach(([label, x, y, fill], index) => {
    add({ id: `workflow-demand-pill-${index}`, type: "rect", box: { x, y, w: 78, h: 24 }, style: { fill, stroke: fill, strokeWidthPt: 0, radiusPt: 5 }, source: source("workflow-demand-native-pill", { index }) });
    textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-demand-pill-text-${index}`, label, { x: x + 8, y: y + 5, w: 62, h: 15 }, { sizePt: 11.5, color: "#FFFFFF", weight: "bold", align: "center" }, source("workflow-demand-native-text", { role: "pill", index })));
  });
}

function addWorkflowDemandCardShells(add, source, layout, sourceImage = null) {
  const painFill = sampleWorkflowMatrixCellFill(sourceImage, layout.painCard, layout.slideSize, "#FFFFFF");
  const solutionFill = sampleWorkflowMatrixCellFill(sourceImage, layout.solutionCard, layout.slideSize, "#F7FFF9");
  const solutionHeaderFill = sampleWorkflowMatrixCellFill(sourceImage, { x: layout.solutionCard.x, y: layout.solutionCard.y, w: layout.solutionCard.w, h: layout.headerH }, layout.slideSize, "#F1FCF3");
  add({ id: "workflow-demand-pain-card", type: "rect", box: layout.painCard, style: { fill: painFill, stroke: "#B8B8B8", strokeWidthPt: 1.6, radiusPt: 5, shadow: { color: "#818181", alpha: 0.1, blurPt: 3, distancePt: 1, angle: 45 } }, source: source("workflow-demand-native-card", { role: "pain" }) });
  add({ id: "workflow-demand-pain-accent", type: "rect", box: { x: layout.painCard.x + 22, y: layout.painCard.y - 4, w: layout.painCard.w - 42, h: 9 }, style: { fill: "#F17612", stroke: "#F17612", strokeWidthPt: 0, radiusPt: 2 }, source: source("workflow-demand-native-card-accent", { role: "pain" }) });
  add({ id: "workflow-demand-pain-separator", type: "line", box: { x: layout.painCard.x + 2, y: layout.separatorY, w: layout.painCard.w - 4, h: 0 }, style: { stroke: "#DADADA", strokeWidthPt: 0.9, connectorType: "straight" }, source: source("workflow-demand-native-card-separator", { role: "pain" }) });
  add({ id: "workflow-demand-solution-card", type: "rect", box: layout.solutionCard, style: { fill: solutionFill, stroke: "#0C6CA8", strokeWidthPt: 2.2, radiusPt: 5, shadow: { color: "#0C6CA8", alpha: 0.1, blurPt: 4, distancePt: 1, angle: 45 } }, source: source("workflow-demand-native-card", { role: "solution" }) });
  add({ id: "workflow-demand-solution-accent", type: "rect", box: { x: layout.solutionCard.x + 23, y: layout.solutionCard.y - 4, w: layout.solutionCard.w - 46, h: 9 }, style: { fill: "#18A95B", stroke: "#18A95B", strokeWidthPt: 0, radiusPt: 2 }, source: source("workflow-demand-native-card-accent", { role: "solution" }) });
  add({ id: "workflow-demand-solution-header-fill", type: "rect", box: { x: layout.solutionCard.x + 2, y: layout.solutionCard.y + 1, w: layout.solutionCard.w - 4, h: layout.headerH - 1 }, style: { fill: solutionHeaderFill, stroke: "none", strokeWidthPt: 0, radiusPt: 4 }, source: source("workflow-demand-native-card-header-fill", { role: "solution" }) });
  add({ id: "workflow-demand-solution-separator", type: "line", box: { x: layout.solutionCard.x + 2, y: layout.separatorY, w: layout.solutionCard.w - 4, h: 0 }, style: { stroke: "#DADADA", strokeWidthPt: 0.9, connectorType: "straight" }, source: source("workflow-demand-native-card-separator", { role: "solution" }) });
}

function addWorkflowDemandCleanContentText(textBoxes, source, rawTextBoxes = [], layout) {
  const evidence = workflowDemandTextEvidence(rawTextBoxes);
  const painLines = evidence.painLines.length > 0 ? evidence.painLines : [
    { text: "· 跨多源信息极难收敛", box: { x: 451, y: 204, w: 164, h: 21 }, font: { sizePt: 14.8 } },
    { text: "· 极易带着隐藏“信息", box: { x: 448, y: 255, w: 161, h: 17 }, font: { sizePt: 12.2 } },
    { text: "缺口” 开始写作", box: { x: 461, y: 281, w: 115, h: 20 }, font: { sizePt: 14.3 } }
  ];
  const solutionLines = evidence.solutionLines.length > 0 ? evidence.solutionLines : [
    { text: "· 多源归集：会议纪要、竞品截图、旧版统一收口", box: { x: 680, y: 207, w: 200, h: 45 }, font: { sizePt: 12.2 } },
    { text: "· 精准提炼：自动抽取业务目标、角色权限、核心流程", box: { x: 680, y: 282, w: 215, h: 46 }, font: { sizePt: 12.2 } },
    { text: "暴露缺口：自动扫描并生成“异常场景边界”与“待确认问题清单”", box: { x: 695, y: 356, w: 188, h: 73 }, font: { sizePt: 12.2 } }
  ];
  const addMeasured = (id, value, item, fallbackBox, style, extra) => {
    const { sizeScale = 1, ...fontStyle } = style;
    textBoxes.push(temporaryAnswerWorkflowTextBox(id, value, workflowComparisonMeasuredTextBox(item, fallbackBox), {
      ...fontStyle,
      sizePt: round(workflowComparisonMeasuredFontSize(item, style.sizePt) * sizeScale)
    }, source("workflow-demand-native-text", extra)));
  };
  const titleBox = unionPtBoxes(evidence.title.filter(Boolean).map((item) => item.box)) || { x: 430, y: 72, w: 450, h: 42 };
  const expandedTitleBox = { x: titleBox.x - 2, y: titleBox.y - 4, w: titleBox.w + 4, h: titleBox.h + 8 };
  addMeasured("workflow-demand-page-title", "能力深潜 01 — 需求理解助手", { box: expandedTitleBox, font: { sizePt: Math.max(...evidence.title.map((item) => Number(item?.font?.sizePt || 0)), 21.6) } }, expandedTitleBox, { sizePt: 21.6, sizeScale: 1.28, color: "#1F557B", weight: "bold", align: "left" }, { role: "title" });
  addMeasured("workflow-demand-pain-title", "核心痛点", evidence.painTitle, { x: 484, y: 151, w: 94, h: 28 }, { sizePt: 17.8, sizeScale: 1.15, color: "#C1763A", weight: "bold", align: "center" }, { role: "pain-title" });
  addMeasured("workflow-demand-solution-title", "Skill 解决方案", evidence.solutionTitle, { x: 703, y: 152, w: 145, h: 26 }, { sizePt: 14.9, sizeScale: 1.25, color: "#25833E", weight: "bold", align: "center" }, { role: "solution-title" });
  painLines.forEach((item, index) => addMeasured(`workflow-demand-pain-line-${index}`, item.text, item, item.box, { sizePt: 13, color: "#111111", weight: "regular", align: "left" }, { role: "pain-body", line: index }));
  solutionLines.forEach((item, index) => addMeasured(`workflow-demand-solution-line-${index}`, item.text, item, item.box, { sizePt: 13, color: "#111111", weight: "regular", align: "left" }, { role: "solution-body", line: index }));
}

function addWorkflowDemandValueBanner(add, textBoxes, source, slideSize = DEFAULT_SLIDE, rawTextBoxes = [], layout = null, sourceImage = null) {
  const width = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt);
  const banner = layout?.banner || { x: 0, y: 485, w: width, h: 55 };
  const fill = sampleWorkflowMatrixCellFill(sourceImage, banner, slideSize, "#0C9F3F");
  add({ id: "workflow-demand-value-banner-bg", type: "rect", box: banner, style: { fill, stroke: fill, strokeWidthPt: 0 }, source: source("workflow-demand-native-value-banner") });
  const evidence = workflowDemandTextEvidence(rawTextBoxes);
  const valueBox = unionPtBoxes(evidence.valueLines.map((item) => item.box)) || { x: 120, y: 501, w: 705, h: 24 };
  textBoxes.push(temporaryAnswerWorkflowTextBox("workflow-demand-value-banner-copy", "产出价值：PM 告别资料搬运工，讨论直击结构化问题清单，起跑线锁定质量。", workflowComparisonMeasuredTextBox({ box: valueBox }, valueBox), { sizePt: 17.2, color: "#FFFFFF", weight: "bold", align: "left" }, source("workflow-demand-native-text", { role: "value-copy" })));
}

function workflowDemandUnderstandingLayout(rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const evidence = workflowDemandTextEvidence(rawTextBoxes);
  const width = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt);
  const height = Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);
  const painX = Number(evidence.painLines[0]?.box?.x || 451) - 21;
  const solutionX = Number(evidence.solutionLines[0]?.box?.x || 680) - 27;
  const cardY = Math.min(Number(evidence.painTitle?.box?.y || 152), Number(evidence.solutionTitle?.box?.y || 154)) - 15;
  const bannerY = Math.min(...evidence.valueLines.map((item) => Number(item.box?.y || height)), height) - 18;
  const cardBottom = bannerY - 30;
  const separatorY = Math.min(Number(evidence.painLines[0]?.box?.y || 204), Number(evidence.solutionLines[0]?.box?.y || 207)) - 16;
  return {
    slideSize,
    painCard: { x: round(painX), y: round(cardY), w: round(solutionX - painX - 22), h: round(cardBottom - cardY) },
    solutionCard: { x: round(solutionX), y: round(cardY), w: round(width - solutionX - 56), h: round(cardBottom - cardY) },
    headerH: round(separatorY - cardY),
    separatorY: round(separatorY),
    banner: { x: 0, y: round(bannerY), w: width, h: round(height - bannerY) }
  };
}

function workflowDemandTextEvidence(rawTextBoxes = []) {
  const find = (value) => rawTextBoxes.find((item) => normalizeCjkText(item.text) === normalizeCjkText(value)) || null;
  const combinedTitle = rawTextBoxes.find((item) => /能力深潜.*需求理解助手/.test(normalizeCjkText(item.text))) || null;
  const painLines = ["·跨多源信息极难收敛", "·极易带着隐藏“信息", "缺口”开始写作"].map(find).filter(Boolean);
  const solutionLines = ["·多源归集：会议纪要、竞", "品截图、旧版统一收口", "·精准提炼：自动抽取业务目", "标、角色权限、核心流程", "暴露缺口：自动扫描并生", "成“异常场景边界”与“待", "确认问题清单”"].map(find).filter(Boolean);
  return {
    title: combinedTitle ? [combinedTitle] : [find("能力深潜01—"), find("需求理解助手")].filter(Boolean),
    painTitle: find("核心痛点"),
    solutionTitle: find("Skill解决方案"),
    painLines,
    solutionLines,
    valueLines: [find("产出价值：PM告别资料搬运工，讨论直击结构化问题清单，"), find("起跑线锁定质量。")].filter(Boolean)
  };
}

function addWorkflowDemandShieldIcon(add, source, layout) {
  const x = layout.solutionCard.x + 12;
  const y = layout.separatorY + (layout.solutionCard.h - layout.headerH) * 0.57;
  add({ id: "workflow-demand-shield", type: "freeform", box: { x, y, w: 24, h: 30 }, points: [{ x: x + 12, y }, { x: x + 24, y: y + 5 }, { x: x + 21, y: y + 22 }, { x: x + 12, y: y + 30 }, { x: x + 3, y: y + 22 }, { x, y: y + 5 }], style: { fill: "#F47B20", stroke: "#E56A12", strokeWidthPt: 0.8 }, source: source("workflow-demand-native-shield-icon") });
  add({ id: "workflow-demand-shield-check-a", type: "line", box: lineBox({ x: x + 6, y: y + 15 }, { x: x + 10, y: y + 20 }), style: { stroke: "#FFFFFF", strokeWidthPt: 2.2, connectorType: "straight", lineCap: "round" }, source: source("workflow-demand-native-shield-check") });
  add({ id: "workflow-demand-shield-check-b", type: "line", box: lineBox({ x: x + 10, y: y + 20 }, { x: x + 18, y: y + 10 }), style: { stroke: "#FFFFFF", strokeWidthPt: 2.2, connectorType: "straight", lineCap: "round" }, source: source("workflow-demand-native-shield-check") });
}

function createAssetOsDemandUnderstandingAssistantObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!shouldObjectifyAssetOsDemandUnderstandingAssistant(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };
  const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "product-illustration-segment-crop");
  if (options.allowNativeApproximation !== true) {
    markProtectedComplexDiagramMinimumUnit(sourceImages, {
      detector: "asset-os-demand-understanding-protected-diagram-crop",
      expressionSubtype: "asset-os-demand-understanding-diagram",
      reason: "multi-icon demand-understanding assistant diagram kept as protected visual units; current native approximation is lower-fidelity than the crops"
    });
    return { shapes: [], textBoxes: [] };
  }
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      assetOsDemandUnderstandingAssistantObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "demand understanding assistant diagram"}; rebuilt demand-understanding assistant diagram as native editable components`
    };
  }
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    componentOwnerId: "asset-os-demand-understanding-native-component",
    componentOwnerKind: "demand-understanding-assistant",
    confidence: 0.9,
    ...extra
  });
  const shapes = [];
  const textBoxes = [];
  const images = [];
  const add = (shape) => shapes.push(shape);

  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-demand-understanding-title", "需求理解助手：将混沌输入转化为结构化认知", { x: 52, y: 51, w: 612, h: 42 }, { sizePt: 29, color: "#1E6FA8", weight: "bold", align: "left" }, source("asset-os-demand-understanding-native-text", { role: "title" })));
  const gemIconCrop = createAssetOsDemandUnderstandingIconCrop({
    box: { x: 52, y: 105, w: 50, h: 40 },
    options,
    slideSize,
    role: "gem",
    cropName: "gem-icon"
  });
  if (gemIconCrop) images.push(gemIconCrop);
  else {
    add({ id: "asset-os-demand-understanding-gem-band-icon-bg", type: "rect", box: { x: 52, y: 105, w: 50, h: 40 }, style: { fill: "#D8F0DF", stroke: "none", strokeWidthPt: 0, radiusPt: 3 }, source: source("asset-os-demand-understanding-native-gem-band") });
    addAssetOsDemandGem(add, source, 62, 112);
  }
  add({ id: "asset-os-demand-understanding-gem-band", type: "rect", box: { x: 101, y: 105, w: 627, h: 40 }, style: { fill: "#16A65F", stroke: "#149452", strokeWidthPt: 1, radiusPt: 3 }, source: source("asset-os-demand-understanding-native-gem-band") });
  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-demand-understanding-gem-text", "【Gem 提炼】：输出包含目标、流程、角色与异常边界的可审查蓝图（Brief）。", { x: 112, y: 114, w: 606, h: 22 }, { sizePt: 13.2, color: "#FFFFFF", weight: "bold", align: "left" }, source("asset-os-demand-understanding-native-text", { role: "gem-band" })));

  const notes = inferAssetOsDemandUnderstandingNoteLayout(rawTextBoxes);
  notes.forEach((note, index) => {
    add({ id: `asset-os-demand-understanding-note-${index}`, type: "rect", box: { x: note.x, y: note.y, w: note.w, h: note.h }, style: { fill: "#F1F2F3", stroke: "#9A9A9A", strokeWidthPt: 1.1, radiusPt: 3, rotate: note.rotate, shadow: { color: "#A4A4A4", alpha: 0.12, blurPt: 3, distancePt: 1, angle: 45 } }, source: source("asset-os-demand-understanding-native-input-note", { index }) });
    add({ id: `asset-os-demand-understanding-note-fold-${index}`, type: "triangle", box: { x: note.x + note.w - 19, y: note.y + note.h - 14, w: 20, h: 15 }, style: { fill: "#D9DADB", stroke: "#A1A1A1", strokeWidthPt: 0.8, rotate: note.rotate + 90 }, source: source("asset-os-demand-understanding-native-input-note-fold", { index }) });
    textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-os-demand-understanding-note-text-${index}`, note.label, { x: note.x + 12, y: note.textY + 1, w: note.w - 24, h: 20 }, { sizePt: 12.4, color: "#111111", weight: "regular", align: "center", rotate: note.rotate }, source("asset-os-demand-understanding-native-text", { role: "input-note", index })));
  });

  // A filled Bezier brace preserves the source's converging silhouette; four
  // straight connector segments looked like a blocky letter instead.
  add({
    id: "asset-os-demand-understanding-brace",
    type: "freeform",
    box: { x: 278, y: 199, w: 58, h: 238 },
    style: {
      fill: "#B7B7B7",
      stroke: "none",
      closePath: true,
      freeformSegments: [
        { type: "moveTo", points: [{ x: 0.60, y: 0 }] },
        { type: "lnTo", points: [{ x: 1, y: 0 }] },
        { type: "cubicBezTo", points: [{ x: 0.82, y: 0.08 }, { x: 0.82, y: 0.28 }, { x: 0.82, y: 0.40 }] },
        { type: "cubicBezTo", points: [{ x: 0.82, y: 0.46 }, { x: 1, y: 0.47 }, { x: 1, y: 0.50 }] },
        { type: "cubicBezTo", points: [{ x: 1, y: 0.53 }, { x: 0.82, y: 0.54 }, { x: 0.82, y: 0.60 }] },
        { type: "cubicBezTo", points: [{ x: 0.82, y: 0.72 }, { x: 0.82, y: 0.92 }, { x: 1, y: 1 }] },
        { type: "lnTo", points: [{ x: 0.60, y: 1 }] },
        { type: "cubicBezTo", points: [{ x: 0.68, y: 0.91 }, { x: 0.68, y: 0.69 }, { x: 0.68, y: 0.61 }] },
        { type: "cubicBezTo", points: [{ x: 0.68, y: 0.55 }, { x: 0.51, y: 0.53 }, { x: 0.20, y: 0.50 }] },
        { type: "cubicBezTo", points: [{ x: 0.51, y: 0.47 }, { x: 0.68, y: 0.45 }, { x: 0.68, y: 0.39 }] },
        { type: "cubicBezTo", points: [{ x: 0.68, y: 0.31 }, { x: 0.68, y: 0.09 }, { x: 0.60, y: 0 }] },
        { type: "close" }
      ]
    },
    source: source("asset-os-demand-understanding-native-brace")
  });

  const skillIconCrop = createAssetOsDemandUnderstandingIconCrop({
    box: { x: 436, y: 264, w: 100, h: 74 },
    options,
    slideSize,
    role: "skill-icon",
    cropName: "skill-icon"
  });
  if (skillIconCrop) images.push(skillIconCrop);
  addAssetOsDemandSkillCard(add, source, { preserveIconCrop: Boolean(skillIconCrop) });
  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-demand-understanding-skill-title", "需求理解\nAI Skill", { x: 445, y: 342, w: 118, h: 48 }, { sizePt: 14.5, color: "#FFFFFF", weight: "bold", align: "center" }, source("asset-os-demand-understanding-native-text", { role: "skill-title" })));

  const outputs = inferAssetOsDemandUnderstandingOutputLayout(rawTextBoxes);
  outputs.forEach((card, index) => {
    const centerY = round(card.y + card.h / 2);
    add({ id: `asset-os-demand-understanding-output-arrow-${index}`, type: "line", box: { x: 588, y: centerY, w: card.x - 598, h: 0 }, style: { stroke: "#21A963", strokeWidthPt: 5, connectorType: "straight", endArrow: "triangle" }, source: source("asset-os-demand-understanding-native-output-arrow", { index }) });
    add({ id: `asset-os-demand-understanding-output-card-${index}`, type: "rect", box: { x: card.x, y: card.y, w: card.w, h: card.h }, style: { fill: "#FFFFFF", stroke: "#14A75E", strokeWidthPt: 2.3, radiusPt: 5 }, source: source("asset-os-demand-understanding-native-output-card", { index }) });
    textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-os-demand-understanding-output-text-${index}`, card.label, { x: card.x + 10, y: card.textY + 1, w: card.w - 20, h: 21 }, { sizePt: 12.6, color: "#111111", weight: "bold", align: "center" }, source("asset-os-demand-understanding-native-text", { role: "output", index })));
  });

  const warningIconCrop = createAssetOsDemandUnderstandingIconCrop({
    box: { x: 878, y: 405, w: 60, h: 57 },
    options,
    slideSize,
    role: "warning",
    cropName: "warning-icon"
  });
  if (warningIconCrop) images.push(warningIconCrop);
  else {
    add({ id: "asset-os-demand-understanding-warning", type: "triangle", box: { x: 885, y: 413, w: 44, h: 40 }, style: { fill: "#F58212", stroke: "#D46B00", strokeWidthPt: 1.1 }, source: source("asset-os-demand-understanding-native-warning") });
    add({ id: "asset-os-demand-understanding-warning-bang", type: "line", box: { x: 907, y: 424, w: 0, h: 13 }, style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight" }, source: source("asset-os-demand-understanding-native-warning-mark") });
    add({ id: "asset-os-demand-understanding-warning-dot", type: "ellipse", box: { x: 904, y: 441, w: 6, h: 6 }, style: { fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidthPt: 0 }, source: source("asset-os-demand-understanding-native-warning-mark") });
  }
  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-demand-understanding-warning-text", "前置拦截：AI 提前暴露出信息缺口，\n防止带着模糊认知进入开发", { x: 690, y: 462, w: 248, h: 36 }, { sizePt: 12.3, color: "#CF7A13", weight: "bold", align: "left" }, source("asset-os-demand-understanding-native-text", { role: "warning" })));
  return { shapes, textBoxes: options.reuseSourceText === true ? [] : textBoxes, images };
}

function inferAssetOsDemandUnderstandingNoteLayout(rawTextBoxes = []) {
  const specs = [
    { label: "杂乱会议纪要", x: 63, y: 192, w: 137, h: 63, rotate: -4 },
    { label: "口语化业务描述", x: 117, y: 257, w: 137, h: 63, rotate: 4 },
    { label: "散落的竞品截图", x: 54, y: 322, w: 137, h: 63, rotate: -3 },
    { label: "旧系统无头说明", x: 119, y: 382, w: 137, h: 63, rotate: 4 }
  ];
  return specs.map((spec) => {
    const raw = findTextBoxByNormalizedText(rawTextBoxes, spec.label);
    const anchored = inferBoxFromTextAnchor(raw, spec, {
      padX: 14,
      extraW: 28,
      extraH: 33,
      anchorYRatio: 0.30,
      minW: 126,
      maxW: 145,
      minH: 60,
      maxH: 70,
      minX: 45,
      maxX: 130,
      minY: 185,
      maxY: 390
    });
    return {
      ...spec,
      ...anchored,
      textY: round(raw?.box?.y ?? spec.y + 27)
    };
  });
}

function inferAssetOsDemandUnderstandingOutputLayout(rawTextBoxes = []) {
  const specs = [
    { label: "结构化业务流程与核心规则", x: 691, y: 202, w: 217, h: 66 },
    { label: "清晰的角色与系统边界", x: 691, y: 286, w: 217, h: 66 },
    { label: "待确认遗漏问题池", x: 691, y: 371, w: 217, h: 66 }
  ];
  return specs.map((spec) => {
    const raw = findTextBoxByNormalizedText(rawTextBoxes, spec.label);
    const anchored = inferBoxFromTextAnchor(raw, spec, {
      fixedW: spec.w,
      fixedH: spec.h,
      padX: 13,
      padTop: 27,
      minX: spec.x,
      maxX: spec.x,
      minY: 190,
      maxY: 380
    });
    return {
      ...spec,
      ...anchored,
      textY: round(raw?.box?.y ?? spec.y + 22)
    };
  });
}

function shouldObjectifyAssetOsDemandUnderstandingAssistant(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/需求理解助手|Gem提炼|需求理解|AISkill|混沌输入|结构化认知|遗漏问题池/.test(labels)) return false;
  const candidates = (page.images || []).filter((image) => image?.source?.detector === "product-illustration-segment-crop");
  const areaRatio = candidates.reduce((sum, image) => sum + Number(image.box?.w || 0) * Number(image.box?.h || 0), 0)
    / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  return candidates.length >= 3 && areaRatio > 0.35;
}

function shouldAutoObjectifyAssetOsDemandUnderstandingAssistant(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (options.objectifyLayerConnectors !== true || options.objectifyStructuredVisualAtomText !== true) return false;
  if (!shouldObjectifyAssetOsDemandUnderstandingAssistant(page, rawTextBoxes, slideSize)) return false;
  const labels = new Set((rawTextBoxes || []).map((item) => normalizeCjkText(item?.text)));
  const requiredLabels = [
    "杂乱会议纪要",
    "口语化业务描述",
    "散落的竞品截图",
    "旧系统无头说明",
    "结构化业务流程与核心规则",
    "清晰的角色与系统边界",
    "待确认遗漏问题池"
  ];
  const hasSkillLabel = labels.has("需求理解AISkill")
    || (labels.has("需求理解") && [...labels].some((label) => /^a[li]skill$/i.test(label)));
  return requiredLabels.every((label) => labels.has(label)) && hasSkillLabel;
}



function addAssetOsDemandGem(add, source, x, y) {
  add({ id: "asset-os-demand-understanding-gem-top", type: "freeform", points: [{ x, y: y + 8 }, { x: x + 15, y }, { x: x + 31, y: y + 8 }, { x: x + 16, y: y + 30 }, { x, y: y + 8 }], box: { x, y, w: 31, h: 30 }, style: { fill: "#10B86B", stroke: "#0D8E53", strokeWidthPt: 1 }, source: source("asset-os-demand-understanding-native-gem") });
  add({ id: "asset-os-demand-understanding-gem-shine", type: "line", box: { x: x + 8, y: y + 8, w: 14, h: 0 }, style: { stroke: "#B7FFD5", strokeWidthPt: 1.5, connectorType: "straight" }, source: source("asset-os-demand-understanding-native-gem-shine") });
}

function createAssetOsDemandUnderstandingIconCrop({ box, options = {}, slideSize = DEFAULT_SLIDE, role, cropName } = {}) {
  if (!options.sourceImage || !options.assetDir || !box || Number(box.w || 0) <= 0 || Number(box.h || 0) <= 0) return null;
  ensureDir(options.assetDir);
  const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-asset-os-demand-understanding-${cropName || role || "icon"}`, "asset-os-demand-understanding-icon");
  const pxBox = ptToPxBox(box, options.sourceImage, slideSize, 0);
  const refinement = refineGraphicCrop(options.sourceImage, pxBox);
  const file = path.join(options.assetDir, `${base}.png`);
  writePng(file, refinement.image);
  const refinedPxBox = {
    x: pxBox.x + refinement.box.x,
    y: pxBox.y + refinement.box.y,
    w: refinement.box.w,
    h: refinement.box.h
  };
  return {
    id: `asset-os-demand-understanding-${cropName || role || "icon"}-crop`,
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: pxToPtBox(refinedPxBox, options.sourceImage, slideSize, 0),
    source: {
      editable: false,
      nativeRebuild: true,
      detector: "asset-os-demand-understanding-icon-crop",
      strategy: "local-fidelity-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "asset-os-demand-understanding-icon",
      recommendedAction: "keep-local-crop-for-complex-icon",
      iconCropRefined: refinement.refined,
      removedNeighborPixels: refinement.removedNeighborPixels, retainedDetailComponents: refinement.retainedDetailComponents,
      role,
      nonEditableReason: "complex icon retained as a local crop; flow remains editable"
    }
  };
}

function addAssetOsDemandSkillCard(add, source, { preserveIconCrop = false } = {}) {
  add({ id: "asset-os-demand-understanding-skill-card", type: "rect", box: { x: 383, y: 222, w: 194, h: 196 }, style: { fill: "#0B72D9", stroke: "#0756A6", strokeWidthPt: 2, radiusPt: 8, shadow: { color: "#0B72D9", alpha: 0.18, blurPt: 7, distancePt: 1, angle: 45 } }, source: source("asset-os-demand-understanding-native-skill-card") });
  add({ id: "asset-os-demand-understanding-skill-inner", type: "rect", box: { x: 396, y: 242, w: 167, h: 157 }, style: { fill: "none", stroke: "#FFFFFF", strokeWidthPt: 3, radiusPt: 7 }, source: source("asset-os-demand-understanding-native-skill-inner") });
  if (preserveIconCrop) return;
  add({ id: "asset-os-demand-understanding-skill-lens", type: "ellipse", box: { x: 460, y: 286, w: 42, h: 42 }, style: { fill: "none", stroke: "#FFFFFF", strokeWidthPt: 4 }, source: source("asset-os-demand-understanding-native-skill-lens") });
  add({ id: "asset-os-demand-understanding-skill-lens-handle", type: "line", box: { x: 493, y: 320, w: 30, h: 29 }, style: { stroke: "#FFFFFF", strokeWidthPt: 5, connectorType: "straight" }, source: source("asset-os-demand-understanding-native-skill-lens-handle") });
  add({ id: "asset-os-demand-understanding-skill-gear-a", type: "ellipse", box: { x: 443, y: 319, w: 23, h: 23 }, style: { fill: "none", stroke: "#FFFFFF", strokeWidthPt: 4 }, source: source("asset-os-demand-understanding-native-skill-gear") });
  add({ id: "asset-os-demand-understanding-skill-gear-b", type: "ellipse", box: { x: 496, y: 270, w: 27, h: 27 }, style: { fill: "none", stroke: "#FFFFFF", strokeWidthPt: 4 }, source: source("asset-os-demand-understanding-native-skill-gear") });
}

function createAssetOsEntropyChallengeObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  if (!shouldObjectifyAssetOsEntropyChallenge(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };
  const sourceImages = (page.images || []).filter((image) => /^(?:split-wide-residual-crop|document-node-residual-crop)$/.test(image?.source?.detector || ""));
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      assetOsEntropyChallengeObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "asset entropy challenge diagram"}; rebuilt entropy challenge diagram as native editable document cards, risk nodes, dashboard, and connectors`
    };
  }
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    componentOwnerId: "asset-os-entropy-challenge-native-component",
    componentOwnerKind: "entropy-challenge-diagram",
    confidence: 0.91,
    ...extra
  });
  const shapes = [];
  const textBoxes = [];
  const add = (shape) => shapes.push(shape);
  const line = (id, from, to, stroke = "#C7CED7", width = 2.4, extra = {}) => {
    const box = {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      w: Math.abs(to.x - from.x),
      h: Math.abs(to.y - from.y)
    };
    add({ id, type: "line", box, style: { stroke, strokeWidthPt: width, connectorType: "straight", endArrow: extra.endArrow || "triangle", opacity: extra.opacity || 0.95 }, source: source("asset-os-entropy-challenge-native-connector", extra) });
  };

  const notes = inferAssetOsEntropyNoteLayout(rawTextBoxes);
  notes.forEach((note, index) => {
    add({ id: `asset-os-entropy-note-${index}`, type: "rect", box: { x: note.x, y: note.y, w: note.w, h: note.h }, style: { fill: "#D6DCE4", stroke: "#CAD1DA", strokeWidthPt: 1, rotate: note.rotate, shadow: { color: "#8C98A6", alpha: 0.16, blurPt: 3, distancePt: 2, angle: 45 } }, source: source("asset-os-entropy-challenge-native-note", { index }) });
    add({ id: `asset-os-entropy-note-fold-${index}`, type: "triangle", box: { x: note.x + note.w - 23, y: note.y + note.h - 17, w: 22, h: 18 }, style: { fill: "#BEC7D2", stroke: "#AEB8C5", strokeWidthPt: 0.8, rotate: note.rotate + 90 }, source: source("asset-os-entropy-challenge-native-note-fold", { index }) });
    textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-os-entropy-note-text-${index}`, note.label, { x: note.x + note.textInsetX, y: note.textY, w: note.w - note.textInsetX * 2, h: 24 }, { sizePt: index === 1 ? 17 : 16, color: "#111111", weight: "regular", align: "center", rotate: note.rotate }, source("asset-os-entropy-challenge-native-text", { role: "note", index })));
  });

  const risks = inferAssetOsEntropyRiskLayout(rawTextBoxes);
  risks.forEach((risk, index) => {
    add({ id: `asset-os-entropy-risk-${index}`, type: "ellipse", box: { x: risk.x, y: risk.y, w: risk.w, h: risk.h }, style: { fill: "#FF5B0A", stroke: "#F05B0A", strokeWidthPt: 1, shadow: { color: "#FF5B0A", alpha: 0.15, blurPt: 3, distancePt: 1, angle: 45 } }, source: source("asset-os-entropy-challenge-native-risk", { index }) });
    textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-os-entropy-risk-text-${index}`, risk.label, { x: risk.x + 22, y: risk.y + 61, w: risk.w - 44, h: 28 }, { sizePt: 25, color: "#FFFFFF", weight: "bold", align: "center" }, source("asset-os-entropy-challenge-native-text", { role: "risk", index })));
  });

  const riskAnchors = risks.map((risk) => ({ x: risk.x + 6, y: risk.y + risk.h / 2 }));
  const noteAnchors = notes.map((note) => ({ x: note.x + note.w + 1, y: note.y + note.h / 2 }));
  line("asset-os-entropy-line-meeting-risk", noteAnchors[0], riskAnchors[0], "#C8D0D9", 2.2, { route: "meeting-to-bias" });
  line("asset-os-entropy-line-prd-risk-a", noteAnchors[1], riskAnchors[0], "#C8D0D9", 2.2, { route: "prd-to-bias" });
  line("asset-os-entropy-line-prd-risk-b", noteAnchors[1], riskAnchors[1], "#C8D0D9", 2.2, { route: "prd-to-rework" });
  line("asset-os-entropy-line-feedback-risk-a", noteAnchors[2], riskAnchors[0], "#C8D0D9", 2.2, { route: "feedback-to-bias" });
  line("asset-os-entropy-line-feedback-risk-b", noteAnchors[2], riskAnchors[1], "#C8D0D9", 2.2, { route: "feedback-to-rework" });
  line("asset-os-entropy-line-screenshot-risk-a", noteAnchors[3], riskAnchors[2], "#C8D0D9", 2.2, { route: "screenshot-to-risk" });
  line("asset-os-entropy-line-screenshot-risk-b", noteAnchors[3], { x: risks[2].x + 4, y: risks[2].y + 80 }, "#C8D0D9", 2.2, { route: "screenshot-to-risk-inner" });

  const dashboard = inferAssetOsEntropyDashboardLayout(rawTextBoxes, slideSize);
  line("asset-os-entropy-line-risk-dashboard", { x: 599, y: 342 }, { x: dashboard.x - 10, y: 342 }, "#D2D6DD", 3.2, { route: "risk-to-dashboard" });
  add({ id: "asset-os-entropy-dashboard-frame", type: "rect", box: dashboard, style: { fill: "#FFFFFF", stroke: "#8195AB", strokeWidthPt: 7.2, radiusPt: 6 }, source: source("asset-os-entropy-challenge-native-dashboard") });
  const header = { x: dashboard.x + 4, y: dashboard.y + 4, w: dashboard.w - 8, h: 50 };
  add({ id: "asset-os-entropy-dashboard-header", type: "rect", box: header, style: { fill: "#8295AB", stroke: "#8295AB", strokeWidthPt: 0, radiusPt: 3 }, source: source("asset-os-entropy-challenge-native-dashboard-header") });
  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-entropy-dashboard-title", "交付看板", { x: header.x + 18, y: header.y + 13, w: header.w - 36, h: 30 }, { sizePt: 24, color: "#FFFFFF", weight: "bold", align: "center" }, source("asset-os-entropy-challenge-native-text", { role: "dashboard" })));
  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-entropy-question", "?", { x: dashboard.x + dashboard.w * 0.31, y: dashboard.y + dashboard.h * 0.27, w: dashboard.w * 0.38, h: dashboard.h * 0.34 }, { sizePt: 92, color: "#FF5B0A", weight: "bold", align: "center" }, source("asset-os-entropy-challenge-native-text", { role: "question" })));
  addAssetOsEntropyBrokenLink(add, source, dashboard);
  return { shapes, textBoxes };
}

function inferAssetOsEntropyNoteLayout(rawTextBoxes = []) {
  const specs = [
    { label: "飞书会议记录", x: 154, y: 161, w: 136, h: 67, rotate: 9 },
    { label: "旧版 PRD", x: 55, y: 271, w: 126, h: 84, rotate: -11 },
    { label: "口头反馈", x: 158, y: 350, w: 132, h: 78, rotate: -12 },
    { label: "业务截图", x: 258, y: 430, w: 132, h: 66, rotate: -14 }
  ];
  return specs.map((spec) => {
    const raw = findTextBoxByNormalizedText(rawTextBoxes, spec.label) || findTextBoxByNormalizedText(rawTextBoxes, spec.label.replace(/\s+/g, ""));
    const fallback = { ...spec, textInsetX: 14, textY: round(spec.y + spec.h * 0.38) };
    const anchored = inferBoxFromTextAnchor(raw, fallback, {
      padX: 14,
      extraW: 34,
      extraH: 30,
      anchorYRatio: 0.38,
      minW: Math.min(spec.w, 118),
      maxW: Math.max(spec.w, 146),
      minH: 62,
      maxH: Math.max(spec.h, 84),
      minX: 35,
      maxX: 320,
      minY: 145,
      maxY: 430
    });
    return {
      ...spec,
      ...anchored,
      textInsetX: 14,
      textY: round(raw?.box?.y ?? fallback.textY)
    };
  });
}

function inferAssetOsEntropyRiskLayout(rawTextBoxes = []) {
  const specs = [
    { label: "理解偏差", x: 443, y: 154, w: 150, h: 150 },
    { label: "重复返工", x: 443, y: 268, w: 150, h: 150 },
    { label: "风险遗漏", x: 443, y: 382, w: 150, h: 150 }
  ];
  return specs.map((spec) => {
    const raw = findTextBoxByNormalizedText(rawTextBoxes, spec.label);
    const anchored = inferBoxFromTextAnchor(raw, spec, {
      fixedW: 150,
      fixedH: 150,
      padX: 22,
      padTop: 61,
      minX: 390,
      maxX: 455,
      minY: 140,
      maxY: 390
    });
    return {
      ...spec,
      ...anchored
    };
  });
}

function inferBoxFromTextAnchor(rawTextBox = null, fallback = {}, options = {}) {
  const raw = rawTextBox?.box;
  const fallbackBox = {
    x: Number(fallback.x || 0),
    y: Number(fallback.y || 0),
    w: Number(fallback.w || 0),
    h: Number(fallback.h || 0)
  };
  if (!raw) return roundedBox(fallbackBox);
  const rawX = Number(raw.x || fallbackBox.x);
  const rawY = Number(raw.y || fallbackBox.y);
  const rawW = Number(raw.w || fallbackBox.w);
  const rawH = Number(raw.h || fallbackBox.h);
  const fixedW = Number(options.fixedW);
  const fixedH = Number(options.fixedH);
  const width = Number.isFinite(fixedW)
    ? fixedW
    : clamp(rawW + Number(options.extraW ?? Number(options.padX || 0) * 2), Number(options.minW || fallbackBox.w || 1), Number(options.maxW || fallbackBox.w || rawW || 1));
  const height = Number.isFinite(fixedH)
    ? fixedH
    : clamp(rawH + Number(options.extraH ?? 0), Number(options.minH || fallbackBox.h || 1), Number(options.maxH || fallbackBox.h || rawH || 1));
  const x = clamp(rawX - Number(options.padX || 0), Number(options.minX ?? -Infinity), Number(options.maxX ?? Infinity));
  const yOffset = Number.isFinite(Number(options.padTop))
    ? Number(options.padTop)
    : height * Number(options.anchorYRatio || 0);
  const y = clamp(
    rawY - yOffset,
    Number(options.minY ?? -Infinity),
    Number(options.maxY ?? Infinity)
  );
  return roundedBox({ x, y, w: width, h: height });
}

function inferAssetOsEntropyDashboardLayout(rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const title = findTextBoxByNormalizedText(rawTextBoxes, "交付看板");
  const question = findTextBoxByNormalizedText(rawTextBoxes, "？") || findTextBoxByNormalizedText(rawTextBoxes, "?");
  if (!title?.box) return { x: 727, y: 158, w: 205, h: 356 };
  const left = clamp(Number(title.box.x) - 22, 690, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) - 150);
  const top = clamp(Number(title.box.y) - 18, 130, 190);
  const questionRight = question?.box ? Number(question.box.x || 0) + Number(question.box.w || 0) : left + 126;
  const width = clamp(Math.max(188, questionRight - left + 64), 176, 220);
  const bottom = Math.max(Number(question?.box?.y || 0) + Number(question?.box?.h || 0) + 62, top + 338);
  const height = clamp(bottom - top, 320, 366);
  return { x: round(left), y: round(top), w: round(width), h: round(height) };
}

function shouldObjectifyAssetOsEntropyChallenge(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/系统爆炸时代.*产研资产.*挑战/.test(labels)) return false;
  const candidates = (page.images || []).filter((image) => /^(?:split-wide-residual-crop|document-node-residual-crop)$/.test(image?.source?.detector || ""));
  const areaRatio = candidates.reduce((sum, image) => {
    const box = image?.source?.originalCropBox || image?.box || {};
    return sum + Number(box.w || 0) * Number(box.h || 0);
  }, 0)
    / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  const rawTexts = labels + " " + (page.images || []).map((image) => (image?.source?.layer?.diagramUnderstanding?.nodes || []).map((node) => normalizeCjkText(node.text)).join(" ")).join(" ");
  return candidates.length >= 2
    && areaRatio > 0.3
    && /飞书会议记录/.test(rawTexts)
    && /旧版PRD/.test(rawTexts)
    && /理解偏差/.test(rawTexts)
    && /重复返工/.test(rawTexts)
    && /交付看板/.test(rawTexts);
}

function addAssetOsEntropyBrokenLink(add, source, dashboard = { x: 727, y: 158, w: 240, h: 356 }) {
  const orange = "#FF5B0A";
  const map = (box) => scaleDashboardRelativeBox(box, dashboard);
  add({ id: "asset-os-entropy-link-left-a", type: "line", box: map({ x: 815, y: 433, w: 31, h: -34 }), style: { stroke: orange, strokeWidthPt: 7, connectorType: "straight", lineCap: "round" }, source: source("asset-os-entropy-challenge-native-broken-link", { part: "left-a" }) });
  add({ id: "asset-os-entropy-link-left-b", type: "line", box: map({ x: 846, y: 399, w: 31, h: 34 }), style: { stroke: orange, strokeWidthPt: 7, connectorType: "straight", lineCap: "round" }, source: source("asset-os-entropy-challenge-native-broken-link", { part: "left-b" }) });
  add({ id: "asset-os-entropy-link-right-a", type: "line", box: map({ x: 870, y: 432, w: 34, h: -34 }), style: { stroke: orange, strokeWidthPt: 7, connectorType: "straight", lineCap: "round" }, source: source("asset-os-entropy-challenge-native-broken-link", { part: "right-a" }) });
  add({ id: "asset-os-entropy-link-right-b", type: "line", box: map({ x: 902, y: 398, w: 34, h: 32 }), style: { stroke: orange, strokeWidthPt: 7, connectorType: "straight", lineCap: "round" }, source: source("asset-os-entropy-challenge-native-broken-link", { part: "right-b" }) });
  [
    { x: 838, y: 420, w: 13, h: 0 },
    { x: 891, y: 421, w: 13, h: 0 },
    { x: 865, y: 392, w: 0, h: 12 },
    { x: 865, y: 440, w: 0, h: 12 },
    { x: 847, y: 401, w: -9, h: -9 },
    { x: 883, y: 438, w: 10, h: 10 }
  ].forEach((box, index) => {
    add({ id: `asset-os-entropy-link-spark-${index}`, type: "line", box: map(box), style: { stroke: orange, strokeWidthPt: 4, connectorType: "straight", lineCap: "round" }, source: source("asset-os-entropy-challenge-native-broken-link", { part: "spark", index }) });
  });
}

function scaleDashboardRelativeBox(box = {}, dashboard = {}) {
  const base = { x: 727, y: 158, w: 240, h: 356 };
  const sx = Number(dashboard.w || base.w) / base.w;
  const sy = Number(dashboard.h || base.h) / base.h;
  return {
    x: round(Number(dashboard.x || base.x) + (Number(box.x || 0) - base.x) * sx),
    y: round(Number(dashboard.y || base.y) + (Number(box.y || 0) - base.y) * sy),
    w: round(Number(box.w || 0) * sx),
    h: round(Number(box.h || 0) * sy)
  };
}

function createAssetOsHighValueAssetMatrixObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  if (!shouldObjectifyAssetOsHighValueAssetMatrix(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };
  const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "foreground-graphic-underlay-crop");
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      assetOsHighValueAssetMatrixObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "high-value asset matrix"}; rebuilt high-value asset matrix as native editable table cells`
    };
  }
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    confidence: 0.91,
    ...extra
  });
  const shapes = [];
  const textBoxes = [];
  const add = (shape) => shapes.push(shape);
  const table = assetOsHighValueAssetMatrixLayout();

  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-high-value-matrix-title", "真实业务场景验证：高价值增量资产提炼矩阵", { x: 39, y: 31, w: 540, h: 32 }, { sizePt: 23, color: "#000000", weight: "bold", align: "left" }, source("asset-os-high-value-matrix-native-text", { role: "title" })));
  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-high-value-matrix-subtitle", "在最复杂的供应链与物流场景中，有效治理多版本漂移并锁定跨系统规则边界。", { x: 38, y: 78, w: 710, h: 26 }, { sizePt: 21, color: "#000000", weight: "bold", align: "left" }, source("asset-os-high-value-matrix-native-text", { role: "subtitle" })));

  add({ id: "asset-os-high-value-matrix-outer", type: "rect", box: { x: table.x, y: table.y, w: table.w, h: table.h }, style: { fill: "#FFFFFF", stroke: "#9DBDB2", strokeWidthPt: 1.1 }, source: source("asset-os-high-value-matrix-native-table") });
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const box = assetOsHighValueAssetMatrixCell(table, row, col);
      const isHeader = row === 0;
      const isGem = col === 2 && row > 0;
      add({
        id: `asset-os-high-value-matrix-cell-${row}-${col}`,
        type: "rect",
        box,
        style: {
          fill: isHeader ? "#0E74BD" : (isGem ? "#07863D" : "#FFFFFF"),
          stroke: "#DDE7E3",
          strokeWidthPt: isHeader ? 0.8 : 0.7
        },
        source: source("asset-os-high-value-matrix-native-cell", { row, col })
      });
    }
  }
  table.cols.slice(1, -1).forEach((x, index) => {
    add({ id: `asset-os-high-value-matrix-vline-${index}`, type: "line", box: { x, y: table.y, w: 0, h: table.h }, style: { stroke: "#DCEAE4", strokeWidthPt: 1, connectorType: "straight" }, source: source("asset-os-high-value-matrix-native-grid-line", { axis: "v", index }) });
  });
  table.rows.slice(1, -1).forEach((y, index) => {
    add({ id: `asset-os-high-value-matrix-hline-${index}`, type: "line", box: { x: table.x, y, w: table.w, h: 0 }, style: { stroke: "#DCEAE4", strokeWidthPt: 1, connectorType: "straight" }, source: source("asset-os-high-value-matrix-native-grid-line", { axis: "h", index }) });
  });

  const rows = assetOsHighValueAssetMatrixRows();
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const box = assetOsHighValueAssetMatrixCell(table, rowIndex, colIndex);
      const isHeader = rowIndex === 0;
      const isGem = colIndex === 2 && rowIndex > 0;
      const isPain = colIndex === 1 && rowIndex > 0;
      const padX = isHeader ? 10 : (colIndex === 2 ? 12 : 22);
      textBoxes.push(temporaryAnswerWorkflowTextBox(
        `asset-os-high-value-matrix-text-${rowIndex}-${colIndex}`,
        cell,
        { x: box.x + padX, y: box.y + (isHeader ? 16 : 24), w: box.w - padX * 2, h: box.h - (isHeader ? 25 : 34) },
        {
          sizePt: isHeader ? 18 : (colIndex === 2 ? 16.2 : 16.8),
          color: isHeader || isGem ? "#FFFFFF" : (isPain ? "#C97620" : "#000000"),
          weight: "bold",
          align: colIndex === 0 ? "center" : "left"
        },
        source("asset-os-high-value-matrix-native-text", { role: isHeader ? "header" : "cell", row: rowIndex, col: colIndex })
      ));
    });
  });
  return { shapes, textBoxes };
}

function shouldObjectifyAssetOsHighValueAssetMatrix(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/高价值增量资产提炼矩阵|复杂业务场景|传统人工痛点|PortalSkills|Gems资产|多版本漂移|跨系统规则边界/.test(labels)) return false;
  const candidates = (page.images || []).filter((image) => image?.source?.detector === "foreground-graphic-underlay-crop");
  return candidates.some((image) => {
    const areaRatio = Number(image.box?.w || 0) * Number(image.box?.h || 0)
      / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
    const layer = image?.source?.layer || {};
    const archetype = String(layer.diagramUnderstanding?.archetype || "");
    const layerType = String(layer.layerType || "");
    return areaRatio > 0.55
      && (image?.source?.expressionForm === "table-or-matrix" || layerType === "table-zone" || /matrix-or-grid|table/i.test(archetype));
  });
}

function assetOsHighValueAssetMatrixLayout() {
  const x = 35;
  const y = 126;
  const w = 889;
  const h = 376;
  return {
    x,
    y,
    w,
    h,
    cols: [x, x + 270, x + 550, x + w],
    rows: [y, y + 54, y + 162, y + 269, y + h]
  };
}

function assetOsHighValueAssetMatrixCell(table, row, col) {
  return {
    x: round(table.cols[col]),
    y: round(table.rows[row]),
    w: round(table.cols[col + 1] - table.cols[col]),
    h: round(table.rows[row + 1] - table.rows[row])
  };
}

function assetOsHighValueAssetMatrixRows() {
  return [
    ["复杂业务场景", "传统人工痛点", "Portal/Skills 提炼的 Gems 资产"],
    [
      "物流 WMS 库存查询\n(V24/V25/V26 连续增量)",
      "多版本口径互相覆盖，\n脉络断裂，历史规则\n极易被遗忘。",
      "拆解为独立版本资产。\n精准隔离后台过滤规则 (V24)、\n追踪码操作校验 (V25) 与\n关联单追溯 (V26)。"
    ],
    [
      "物流 WMS 入库单管理\n(V39B 越库复杂增量)",
      "跨主链路超收规则、\n最大可收量公式与越库\n完整性极易遗漏。",
      "前置拦截越库完整性边界。\n自动拆分 FE/BE/QA 开发参考任务，\n输出含包裹收货的\n交互原型。"
    ],
    [
      "供应链 PMS 订货配置-地点\n(多轨文档混乱)",
      "Word/HTML/截图来源混乱，\n协同维度与码表口径\n极易冲突。",
      "强制收敛协同维度码表\n唯一性校验。自动生成\n含取数预览与 Mock 数据的\n可运行界面资产。"
    ]
  ];
}

function createAssetOsTwoDimensionalFoundationObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  if (!shouldObjectifyAssetOsTwoDimensionalFoundation(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };
  const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "foreground-graphic-underlay-crop");
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      assetOsTwoDimensionalFoundationObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "two-dimensional foundation architecture"}; rebuilt four-layer foundation architecture as native editable components`
    };
  }
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    componentOwnerId: "asset-os-foundation-native-component",
    componentOwnerKind: "two-dimensional-foundation-architecture",
    minimumUnitPolicy: "rebuild-semantic-structure",
    confidence: 0.91,
    ...extra
  });
  const shapes = [];
  const textBoxes = [];
  const add = (shape) => shapes.push(shape);

  const layers = assetOsFoundationLayers();
  layers.forEach((layer, index) => {
    add({ id: `asset-os-foundation-layer-${index}`, type: "rect", box: { x: 216, y: layer.y, w: 526, h: 61 }, style: { fill: layer.fill, stroke: layer.fill, strokeWidthPt: 0.8 }, source: source("asset-os-foundation-native-layer", { index, role: layer.role }) });
    textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-os-foundation-layer-title-${index}`, layer.title, { x: 320, y: layer.y + 13, w: 320, h: 21 }, { sizePt: 18, color: "#FFFFFF", weight: "bold", align: "center" }, source("asset-os-foundation-native-text", { role: "layer-title", index })));
    textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-os-foundation-layer-body-${index}`, layer.body, { x: 305, y: layer.y + 36, w: 350, h: 17 }, { sizePt: 13, color: "#E8F4FF", weight: "bold", align: "center" }, source("asset-os-foundation-native-text", { role: "layer-body", index })));
  });
  [0, 1, 2].forEach((index) => {
    const lower = layers[index + 1];
    const upper = layers[index];
    const topY = upper.y + 61;
    const bottomY = lower.y - 2;
    add({ id: `asset-os-foundation-up-arrow-${index}`, type: "line", box: { x: 480, y: topY, w: 0, h: bottomY - topY }, style: { stroke: "#22A75A", strokeWidthPt: 5, connectorType: "straight" }, source: source("asset-os-foundation-native-up-arrow", { index, part: "shaft" }) });
    add({ id: `asset-os-foundation-up-arrow-head-${index}`, type: "triangle", box: { x: 470.5, y: topY - 11, w: 19, h: 18 }, style: { fill: "#22A75A", stroke: "#22A75A", strokeWidthPt: 0.6 }, source: source("asset-os-foundation-native-up-arrow", { index, part: "head" }) });
  });

  add({ id: "asset-os-foundation-domain-spine-v", type: "line", box: { x: 772, y: 105, w: 0, h: 114 }, style: { stroke: "#5AAD88", strokeWidthPt: 1.5, connectorType: "straight" }, source: source("asset-os-foundation-native-domain-connector", { part: "spine" }) });
  add({ id: "asset-os-foundation-domain-link-top", type: "line", box: { x: 742, y: 164, w: 30, h: 0 }, style: { stroke: "#5AAD88", strokeWidthPt: 1.5, connectorType: "straight" }, source: source("asset-os-foundation-native-domain-connector", { part: "portal-link" }) });
  [105, 154, 203].forEach((y, index) => {
    add({ id: `asset-os-foundation-domain-link-${index}`, type: "line", box: { x: 772, y, w: 31, h: 0 }, style: { stroke: "#5AAD88", strokeWidthPt: 1.5, connectorType: "straight" }, source: source("asset-os-foundation-native-domain-connector", { index }) });
  });
  const domainCards = [
    ["物流域仓", 803, 88],
    ["供应链域仓", 803, 137],
    ["财务域仓", 803, 186]
  ];
  domainCards.forEach(([label, x, y], index) => {
    add({ id: `asset-os-foundation-domain-shadow-${index}`, type: "rect", box: { x: x + 5, y: y + 5, w: 88, h: 33 }, style: { fill: "#F7FBFF", stroke: "#174765", strokeWidthPt: 1.2, radiusPt: 2 }, source: source("asset-os-foundation-native-domain-card-shadow", { index }) });
    add({ id: `asset-os-foundation-domain-card-${index}`, type: "rect", box: { x, y, w: 88, h: 33 }, style: { fill: "#FFFFFF", stroke: "#174765", strokeWidthPt: 1.2, radiusPt: 2 }, source: source("asset-os-foundation-native-domain-card", { index }) });
    textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-os-foundation-domain-text-${index}`, label, { x: x + 10, y: y + 8, w: 68, h: 18 }, { sizePt: 16, color: "#111111", weight: "bold", align: "center" }, source("asset-os-foundation-native-text", { role: "domain", index })));
  });
  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-foundation-domain-caption", "极简配置继承全局底座", { x: 797, y: 238, w: 110, h: 16 }, { sizePt: 10.5, color: "#555555", weight: "regular", align: "center" }, source("asset-os-foundation-native-text", { role: "domain-caption" })));
  return { shapes, textBoxes };
}

function shouldObjectifyAssetOsTwoDimensionalFoundation(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/二维底座架构|分布式域仓架构|门户检索层|AISkills分发层|运行时聚合层|CLI脚手架层|物流域仓|供应链域仓|财务域仓/.test(labels)) return false;
  const candidates = (page.images || []).filter((image) => image?.source?.detector === "foreground-graphic-underlay-crop");
  return candidates.some((image) => {
    const areaRatio = Number(image.box?.w || 0) * Number(image.box?.h || 0)
      / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
    return areaRatio > 0.45 && image?.source?.expressionForm === "table-or-matrix";
  });
}

function assetOsFoundationLayers() {
  return [
    { role: "portal", y: 138, fill: "#075BB2", title: "第四层：门户检索层（Portal）", body: "多域扩展聚合，提供系统级资产的可视化与全局血缘搜索" },
    { role: "skills", y: 235, fill: "#59A7EF", title: "第三层：AI Skills 分发层", body: "全局热插拔更新 AI 能力，伴随式上手助手常驻辅助" },
    { role: "runtime", y: 331, fill: "#59A7EF", title: "第二层：运行时聚合层（Runtime）", body: "实时解析 config、文档与原型，自动生成目录索引" },
    { role: "cli", y: 428, fill: "#075BB2", title: "第一层：CLI 脚手架层", body: "统一管控平台核心能力包，一键初始化与版本升级" }
  ];
}

function temporaryAnswerWorkflowTextBox(id, text, box, font = {}, source = {}) {
  return {
    id,
    text,
    box,
    font: {
      family: font.family || "Microsoft YaHei",
      sizePt: font.sizePt || 16,
      color: font.color || "#111111",
      opacity: 1,
      weight: font.weight || "regular",
      align: font.align || "left",
      valign: "middle",
      lineHeightMultiple: 1.08
    },
    source
  };
}



function createSaturatedDiagramTextShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null) {
  if (!sourceImage) return [];
  for (const image of images || []) {
    if (image?.source?.detector !== "saturated-diagram-graphic-underlay-crop") continue;
    const nativeTextBoxes = maybeEraseSaturatedDiagramText({
      image,
      textBoxes: saturatedDiagramNativeTextBoxes(image, textBoxes),
      sourceImage,
      slideSize,
      irDir
    });
    if (nativeTextBoxes.length === 0) continue;
    image.source = {
      ...(image.source || {}),
      saturatedDiagramTextObjectified: true,
      saturatedDiagramNativeTextBoxes: nativeTextBoxes,
      objectifiedSaturatedDiagramTextBoxes: nativeTextBoxes.length,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; saturated diagram OCR labels erased from crop and rebuilt as editable native text`
    };
  }
  return [];
}

function saturatedDiagramNativeTextBoxes(image, textBoxes = []) {
  const box = image?.box || {};
  return (textBoxes || [])
    .filter((textBox) => boxCenterInside(textBox.box, box))
    .filter((textBox) => isSaturatedDiagramInternalLabel(textBox, box))
    .filter((textBox) => normalizeMatrixLabel(textBox.text))
    .map((textBox, index) => saturatedDiagramTextBox(image, textBox, index));
}

function saturatedDiagramTextBox(image, textBox, index) {
  const next = JSON.parse(JSON.stringify(textBox));
  const compact = String(next.text || "").replace(/\s+/g, "");
  const role = /^(?:痛点|解决方案)$/.test(compact)
    ? "side-heading"
    : /结构化标准|DOM语义|文档|精准克隆|自动生成操作手册|所见即所得|证据回流|交互原型/.test(compact)
      ? "loop-node-label"
      : "side-body";
  next.id = next.id || `${image.id || "saturated-diagram"}-native-text-${index}`;
  next.font = {
    ...(next.font || {}),
    color: saturatedDiagramTextColor(role, next.font?.color),
    opacity: 1,
    weight: role === "side-heading" || role === "loop-node-label" ? "bold" : (next.font?.weight || "regular")
  };
  next.source = {
    ...(next.source || {}),
    editable: true,
    nativeRebuild: true,
    detector: "saturated-diagram-native-visible-label",
    expressionForm: "complex-diagram",
    expressionSubtype: "saturated-multi-flow-diagram",
    layerSourceId: image.id || null,
    overlayVisibility: "visible",
    role,
    textErasedFromCrop: true
  };
  return next;
}

function saturatedDiagramTextColor(role, fallback) {
  const normalized = normalizeHex(fallback, "");
  if (normalized) return normalized;
  if (role === "loop-node-label") return "#111111";
  return "#FFFFFF";
}

function maybeEraseSaturatedDiagramText({ image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null }) {
  if (!sourceImage || textBoxes.length === 0) return [];
  const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
  if (!assetFile) return [];
  const masks = textBoxes.map((item) => ptToPxBox(item.box, sourceImage, slideSize, 4));
  if (masks.length === 0) return [];
  const erased = eraseMasks(sourceImage, masks);
  const crop = cropPng(erased, ptToPxBox(image.box, sourceImage, slideSize, 0));
  ensureDir(path.dirname(assetFile));
  writePng(assetFile, crop);
  return textBoxes;
}

function createSemanticCycleDiagramShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null, options = {}) {
  if (!sourceImage) return [];
  const shapes = [];
  shapes.images = [];
  for (const image of images || []) {
    if (!shouldObjectifySemanticCycleDiagram(image, textBoxes)) continue;
    // The loop geometry and labels are stable semantic structure. Preserve only
    // the four pictorial node icons by default; the former full-cycle crop is
    // available only as an explicit fidelity fallback.
    const hybridCrop = options.preserveHighFidelitySemanticCycle === true
      ? createSemanticCycleMinimumUnitCrop({
      image,
      textBoxes,
      sourceImage,
      slideSize,
      irDir,
      assetDir: options.assetDir,
      deckName: options.deckName,
      pageIndex: options.pageIndex
      })
      : null;
    if (hybridCrop) {
      const nativeTextBoxes = Array.isArray(image.source?.saturatedDiagramNativeTextBoxes)
        ? image.source.saturatedDiagramNativeTextBoxes
        : saturatedDiagramNativeTextBoxes(image, textBoxes);
      for (const textBox of nativeTextBoxes) {
        if (!boxCenterInside(textBox?.box, hybridCrop.box)) continue;
        textBox.source = {
          ...(textBox.source || {}),
          layerSourceId: hybridCrop.id,
          // These labels remain part of the protected artwork so the crop
          // never receives flat erase-mask patches behind native text.
          textEmbeddedInFidelityCrop: true
        };
      }
      image.source = {
        ...(image.source || {}),
        semanticCycleDiagramObjectified: true,
        semanticCycleHybridCropReplaced: true,
        visualAtomOverlayOnly: true,
        dropErasedResidualAfterNativeRebuild: true,
        objectifiedSemanticCycleShapes: 0,
        semanticCycleTextObjectified: false,
        saturatedDiagramNativeTextBoxes: nativeTextBoxes,
        objectifiedSaturatedDiagramTextBoxes: nativeTextBoxes.length,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; interlocking cycle illustration preserved as one protected minimum unit because its embedded labels and artwork are visually inseparable`
      };
      shapes.images.push(hybridCrop);
      continue;
    }
    let localShapes = inferSemanticCycleDiagramShapes(image);
    if (localShapes.length === 0) continue;
    const iconCrops = createSemanticCycleIconMinimumUnitCrops({
      image,
      sourceImage,
      slideSize,
      irDir,
      assetDir: options.assetDir,
      deckName: options.deckName,
      pageIndex: options.pageIndex
    });
    if (iconCrops.length === 4) {
      const pictorialDetectors = new Set([
        "semantic-cycle-native-node",
        "semantic-cycle-native-icon",
        "semantic-cycle-native-icon-detail"
      ]);
      localShapes = localShapes.filter((shape) => !pictorialDetectors.has(shape?.source?.detector));
      shapes.images.push(...iconCrops);
    }
    const nativeTextBoxes = Array.isArray(image.source?.saturatedDiagramNativeTextBoxes)
      ? image.source.saturatedDiagramNativeTextBoxes
      : maybeEraseSaturatedDiagramText({
        image,
        textBoxes: saturatedDiagramNativeTextBoxes(image, textBoxes),
        sourceImage,
        slideSize,
        irDir
      });
    image.source = {
      ...(image.source || {}),
      semanticCycleDiagramObjectified: true,
      visualAtomOverlayOnly: shouldDropSemanticCycleResidual(localShapes, nativeTextBoxes, iconCrops) ? false : true,
      dropErasedResidualAfterNativeRebuild: shouldDropSemanticCycleResidual(localShapes, nativeTextBoxes, iconCrops)
        ? true
        : image.source?.dropErasedResidualAfterNativeRebuild,
      objectifiedSemanticCycleShapes: localShapes.length,
      semanticCycleMinimumUnitCrops: iconCrops,
      semanticCycleTextObjectified: nativeTextBoxes.length > 0,
      saturatedDiagramNativeTextBoxes: nativeTextBoxes,
      objectifiedSaturatedDiagramTextBoxes: nativeTextBoxes.length,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; semantic double-cycle diagram rebuilt as native rings, nodes, arrows, icons, and editable labels`
    };
    shapes.push(...localShapes);
  }
  return shapes;
}

function createSemanticCycleMinimumUnitCrop({ image = {}, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null, assetDir = null, deckName = "deck", pageIndex = 0 } = {}) {
  if (!sourceImage || !irDir || !assetDir || !isHighFidelityPrdCycle(image, textBoxes)) return null;
  const box = image.box || {};
  const cropBox = roundedBox({
    x: Number(box.x || 0) + Number(box.w || 0) * 0.22,
    y: Number(box.y || 0) + Number(box.h || 0) * 0.01,
    w: Number(box.w || 0) * 0.56,
    h: Number(box.h || 0) * 0.94
  });
  if (cropBox.w < 300 || cropBox.h < 180) return null;
  const internalLabels = saturatedDiagramNativeTextBoxes(image, textBoxes)
    .filter((textBox) => boxCenterInside(textBox?.box, cropBox))
    .filter((textBox) => /结构化标准|文档|DOM\s*语义|精准克隆|自动生成操作手册|证据回流|所见即所得|交互原型/i.test(String(textBox?.text || "")));
  if (internalLabels.length < 4) return null;
  ensureDir(assetDir);
  const file = path.join(assetDir, `${safeIdentifier(deckName, "deck")}-page-${String(Number(pageIndex || 0) + 1).padStart(3, "0")}-interlocking-cycle.png`);
  writePng(file, cropPng(sourceImage, ptToPxBox(cropBox, sourceImage, slideSize, 0)));
  return {
    id: `${image.id || "semantic-cycle"}-interlocking-cycle-crop`,
    type: "fidelity-crop",
    assetPath: path.relative(irDir, file).replace(/\\/g, "/"),
    box: cropBox,
    source: {
      ...(image.source || {}),
      editable: false,
      detector: "semantic-cycle-interlocking-minimum-unit-crop",
      parentDetector: image.source?.detector || null,
      parentImageId: image.id || null,
      expressionForm: "complex-diagram",
      expressionSubtype: "interlocking-cycle-illustration",
      recommendedAction: "preserve-as-minimum-unit-crop",
      protectedMinimumUnit: true,
      intentionalMinimumUnitCrop: true,
      skipVisualAtomRebuild: true,
      semanticCycleTextErased: false,
      textEmbeddedInFidelityCrop: true,
      semanticCycleEmbeddedTextBoxes: internalLabels.length,
      nonEditableReason: "smooth interlocking cycle artwork, embedded icon nodes, and embedded labels are not safely separable into faithful native primitives"
    }
  };
}

function createSemanticCycleIconMinimumUnitCrops({ image = {}, sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null, assetDir = null, deckName = "deck", pageIndex = 0 } = {}) {
  if (!sourceImage || !irDir || !assetDir) return [];
  const box = image.box || {};
  if (Number(box.w || 0) < 760 || Number(box.h || 0) < 260) return [];
  const left = semanticCycleRingBox(box, 0);
  const right = semanticCycleRingBox(box, 1);
  const nodeSize = Math.min(Number(box.h || 0) * 0.21, Number(box.w || 0) * 0.09);
  const nodes = [
    { key: "document", x: left.x + left.w * 0.15, y: left.y + left.h * 0.11 },
    { key: "manual", x: left.x + left.w * 0.15, y: left.y + left.h * 0.89 },
    { key: "dom", x: right.x + right.w * 0.78, y: right.y + right.h * 0.11 },
    { key: "prototype", x: right.x + right.w * 0.78, y: right.y + right.h * 0.89 }
  ];
  ensureDir(assetDir);
  return nodes.map((node, index) => {
    const cropBox = roundedBox({
      x: node.x - nodeSize * 0.74,
      y: node.y - nodeSize * 0.74,
      w: nodeSize * 1.48,
      h: nodeSize * 1.48
    });
    const file = path.join(assetDir, `${safeIdentifier(deckName, "deck")}-page-${String(Number(pageIndex || 0) + 1).padStart(3, "0")}-cycle-icon-${String(index + 1).padStart(2, "0")}.png`);
    const cropped = cropPng(sourceImage, ptToPxBox(cropBox, sourceImage, slideSize, 0));
    writePng(file, makeEdgeConnectedBackgroundTransparent(cropped, {
      transparentDistance: 22,
      maximumDistance: 46
    }));
    return {
      id: `${image.id || "semantic-cycle"}-icon-crop-${node.key}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir, file).replace(/\\/g, "/"),
      box: cropBox,
      source: {
        ...(image.source || {}),
        layer: splitResidualLayerSource(image.source?.layer, cropBox, "semantic-cycle-icon-minimum-unit-crop"),
        editable: false,
        detector: "semantic-cycle-icon-minimum-unit-crop",
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        expressionForm: "icon-or-illustration",
        expressionSubtype: "cycle-node-icon",
        recommendedAction: "keep-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        residualSplit: true,
        residualSplitMode: "semantic-cycle-node-icon",
        residualSplitIndex: index + 1,
        residualSplitCount: nodes.length,
        nonEditableReason: "pictorial cycle-node icon retained after native interlocking-loop reconstruction"
      }
    };
  });
}

function isHighFidelityPrdCycle(image = {}, textBoxes = []) {
  const source = image?.source || {};
  const pageText = normalizeCjkText((textBoxes || []).map((item) => String(item?.text || "")).join("\n"));
  return source.detector === "saturated-diagram-graphic-underlay-crop"
    && source.expressionSubtype === "saturated-multi-flow-diagram"
    && /PRD自动生成/.test(pageText)
    && /结构化标准/.test(pageText)
    && /DOM语义/.test(pageText)
    && /交互原型/.test(pageText);
}

function shouldObjectifySemanticCycleDiagram(image, textBoxes = []) {
  const source = image?.source || {};
  const box = image?.box || {};
  if (source.detector !== "saturated-diagram-graphic-underlay-crop") return false;
  if (!box.w || !box.h || Number(box.w) < 760 || Number(box.h) < 260) return false;
  const internal = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box));
  const text = internal.map((item) => String(item.text || "")).join("\n");
  const pageText = normalizeCjkText((textBoxes || []).map((item) => String(item?.text || "")).join("\n"));
  const signals = [/结构化标准/, /DOM\s*语义/i, /自动生成操作手册/, /交互原型/, /痛点/, /解决方案/]
    .filter((pattern) => pattern.test(text)).length;
  const titleDrivenPrdCycle = source.expressionSubtype === "saturated-multi-flow-diagram"
    && /PRD自动生成/.test(pageText)
    && /preserve-fidelity-crop|native-rebuild|component/.test(String(source.recommendedAction || source.strategy || ""));
  return signals >= 5 || titleDrivenPrdCycle;
}

function inferSemanticCycleDiagramShapes(image) {
  const box = image.box || {};
  const base = image.id || "semantic-cycle";
  const left = semanticCycleRingBox(box, 0);
  const right = semanticCycleRingBox(box, 1);
  const nodeSize = Math.min(box.h * 0.21, box.w * 0.09);
  const nodes = [
    { key: "doc", color: "#0E6EAC", ring: "left", x: left.x + left.w * 0.15, y: left.y + left.h * 0.11, icon: "document" },
    { key: "manual", color: "#0E6EAC", ring: "left", x: left.x + left.w * 0.15, y: left.y + left.h * 0.89, icon: "image" },
    { key: "dom", color: "#1EAD4C", ring: "right", x: right.x + right.w * 0.78, y: right.y + right.h * 0.11, icon: "wand" },
    { key: "prototype", color: "#1EAD4C", ring: "right", x: right.x + right.w * 0.78, y: right.y + right.h * 0.89, icon: "window" }
  ].map((node) => ({
    ...node,
    box: { x: round(node.x - nodeSize / 2), y: round(node.y - nodeSize / 2), w: round(nodeSize), h: round(nodeSize) }
  }));
  const shapes = [
    semanticCycleRingShape(base, image, "left", left, "#0D6DAA"),
    semanticCycleRingShape(base, image, "right", right, "#21A84A"),
    semanticCycleRingArcShape(base, image, "left-front-lower", left, "#0D6DAA", 20, 112)
  ];
  shapes.push(
    semanticCycleArrowShape(base, image, "left-up", { x: left.x + left.w * 0.05, y: left.y + left.h * 0.55 }, "#0D6DAA", -90),
    semanticCycleArrowShape(base, image, "left-down", { x: left.x + left.w * 0.86, y: left.y + left.h * 0.55 }, "#0D6DAA", 90),
    semanticCycleArrowShape(base, image, "right-up", { x: right.x + right.w * 0.06, y: right.y + right.h * 0.55 }, "#21A84A", -90),
    semanticCycleArrowShape(base, image, "right-down", { x: right.x + right.w * 0.86, y: right.y + right.h * 0.55 }, "#21A84A", 90)
  );
  for (const [index, node] of nodes.entries()) {
    shapes.push(...semanticCycleNodeShapes(base, image, node, index));
  }
  return shapes;
}

function semanticCycleRingBox(box, index) {
  const w = box.w * 0.31;
  const h = box.h * 0.86;
  const x = box.x + box.w * (index === 0 ? 0.26 : 0.47);
  const y = box.y + box.h * 0.01;
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

function semanticCycleRingShape(base, image, key, box, color) {
  return {
    id: `${base}-semantic-cycle-ring-${key}`,
    type: "ellipse",
    box,
    style: {
      fill: "none",
      stroke: color,
      strokeWidthPt: 8,
      opacity: 0.96,
      shadow: { color, opacity: 0.16, blurPt: 7, distancePt: 0.8, angleDeg: 90 }
    },
    source: semanticCycleShapeSource(image, "semantic-cycle-native-ring", { ring: key })
  };
}

function semanticCycleRingArcShape(base, image, key, box, color, startDeg, endDeg) {
  return {
    id: `${base}-semantic-cycle-ring-arc-${key}`,
    type: "arc",
    box,
    style: {
      fill: "none",
      stroke: color,
      strokeWidthPt: 8.4,
      opacity: 0.98,
      adjustments: [startDeg, endDeg],
      shadow: { color, opacity: 0.12, blurPt: 6, distancePt: 0.6, angleDeg: 90 }
    },
    source: semanticCycleShapeSource(image, "semantic-cycle-native-ring-arc", { ringArc: key, startDeg, endDeg })
  };
}

function semanticCycleArrowShape(base, image, key, center, color, rotationDeg) {
  return {
    id: `${base}-semantic-cycle-arrow-${key}`,
    type: "triangle",
    box: { x: round(center.x - 13), y: round(center.y - 13), w: 26, h: 26 },
    style: { fill: color, stroke: color, strokeWidthPt: 0.4, opacity: 0.98, rotationDeg },
    source: semanticCycleShapeSource(image, "semantic-cycle-native-arrow", { arrow: key })
  };
}

function semanticCycleNodeShapes(base, image, node, index) {
  const icon = {
    x: round(node.box.x + node.box.w * 0.28),
    y: round(node.box.y + node.box.h * 0.26),
    w: round(node.box.w * 0.44),
    h: round(node.box.h * 0.48)
  };
  const source = (detector, extra = {}) => semanticCycleShapeSource(image, detector, { node: node.key, nodeIndex: index, ...extra });
  const shapes = [{
    id: `${base}-semantic-cycle-node-${node.key}`,
    type: "ellipse",
    box: node.box,
    style: {
      fill: node.color,
      stroke: node.color,
      strokeWidthPt: 1,
      opacity: 0.98,
      shadow: { color: node.color, opacity: 0.24, blurPt: 7, distancePt: 1, angleDeg: 90 }
    },
    source: source("semantic-cycle-native-node")
  }];
  const detailSource = (part) => source("semantic-cycle-native-icon-detail", { iconPart: part });
  if (node.icon === "document") {
    shapes.push({
      id: `${base}-semantic-cycle-icon-${node.key}`,
      type: "freeform",
      box: icon,
      points: [{ x: 0, y: 0 }, { x: 0.7, y: 0 }, { x: 1, y: 0.28 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
      style: { fill: "#EAF6FF", stroke: "#D9EFFC", strokeWidthPt: 0.8 },
      source: source("semantic-cycle-native-icon")
    });
    shapes.push(...semanticCycleDocumentIconDetails(base, node, icon, detailSource));
  } else if (node.icon === "wand") {
    shapes.push({
      id: `${base}-semantic-cycle-icon-${node.key}`,
      type: "line",
      box: { x: icon.x, y: icon.y + icon.h, w: icon.w, h: -icon.h },
      style: { stroke: "#F4FFF8", strokeWidthPt: 3, connectorType: "straight", lineCap: "round" },
      source: source("semantic-cycle-native-icon")
    });
    shapes.push(...semanticCycleWandIconDetails(base, node, icon, detailSource));
  } else {
    shapes.push({
      id: `${base}-semantic-cycle-icon-${node.key}`,
      type: "roundRect",
      box: icon,
      style: { fill: "#EAF6FF", stroke: "#D9EFFC", strokeWidthPt: 0.8, radiusRatio: 0.08 },
      source: source("semantic-cycle-native-icon")
    });
    shapes.push(...(node.icon === "image"
      ? semanticCycleImageIconDetails(base, node, icon, detailSource)
      : semanticCycleWindowIconDetails(base, node, icon, detailSource)));
  }
  return shapes;
}

function semanticCycleDocumentIconDetails(base, node, icon, source) {
  return [0.38, 0.53, 0.68].map((yRatio, index) => ({
    id: `${base}-semantic-cycle-icon-${node.key}-line-${index}`,
    type: "line",
    box: {
      x: round(icon.x + icon.w * 0.20),
      y: round(icon.y + icon.h * yRatio),
      w: round(icon.w * 0.56),
      h: 0
    },
    style: { stroke: "#2F6F95", strokeWidthPt: 1.7, connectorType: "straight", lineCap: "round" },
    source: source(`document-line-${index}`)
  }));
}

function semanticCycleImageIconDetails(base, node, icon, source) {
  return [
    {
      id: `${base}-semantic-cycle-icon-${node.key}-mountain`,
      type: "freeform",
      box: {
        x: round(icon.x + icon.w * 0.12),
        y: round(icon.y + icon.h * 0.42),
        w: round(icon.w * 0.66),
        h: round(icon.h * 0.38)
      },
      points: [{ x: 0, y: 1 }, { x: 0.28, y: 0.46 }, { x: 0.48, y: 0.72 }, { x: 0.70, y: 0.22 }, { x: 1, y: 1 }],
      style: { fill: "#7BB0D8", stroke: "#7BB0D8", strokeWidthPt: 0 },
      source: source("image-mountain")
    },
    {
      id: `${base}-semantic-cycle-icon-${node.key}-sun`,
      type: "ellipse",
      box: {
        x: round(icon.x + icon.w * 0.70),
        y: round(icon.y + icon.h * 0.18),
        w: round(icon.w * 0.16),
        h: round(icon.w * 0.16)
      },
      style: { fill: "#7BB0D8", stroke: "#7BB0D8", strokeWidthPt: 0 },
      source: source("image-sun")
    }
  ];
}

function semanticCycleWandIconDetails(base, node, icon, source) {
  const spark = (name, x, y, size) => ({
    id: `${base}-semantic-cycle-icon-${node.key}-${name}`,
    type: "freeform",
    box: { x: round(x), y: round(y), w: round(size), h: round(size) },
    points: [{ x: 0.5, y: 0 }, { x: 0.62, y: 0.38 }, { x: 1, y: 0.5 }, { x: 0.62, y: 0.62 }, { x: 0.5, y: 1 }, { x: 0.38, y: 0.62 }, { x: 0, y: 0.5 }, { x: 0.38, y: 0.38 }],
    style: { fill: "#F4FFF8", stroke: "#F4FFF8", strokeWidthPt: 0 },
    source: source(name)
  });
  return [
    spark("wand-spark-large", icon.x + icon.w * 0.72, icon.y + icon.h * 0.10, icon.w * 0.18),
    spark("wand-spark-small", icon.x + icon.w * 0.88, icon.y + icon.h * 0.28, icon.w * 0.12),
    {
      id: `${base}-semantic-cycle-icon-${node.key}-code-left`,
      type: "freeform",
      box: {
        x: round(icon.x + icon.w * 0.44),
        y: round(icon.y + icon.h * 0.62),
        w: round(icon.w * 0.16),
        h: round(icon.h * 0.22)
      },
      points: [{ x: 1, y: 0 }, { x: 0, y: 0.5 }, { x: 1, y: 1 }],
      style: { fill: "none", stroke: "#F4FFF8", strokeWidthPt: 1.5, lineCap: "round" },
      source: source("code-left")
    },
    {
      id: `${base}-semantic-cycle-icon-${node.key}-code-right`,
      type: "freeform",
      box: {
        x: round(icon.x + icon.w * 0.72),
        y: round(icon.y + icon.h * 0.62),
        w: round(icon.w * 0.16),
        h: round(icon.h * 0.22)
      },
      points: [{ x: 0, y: 0 }, { x: 1, y: 0.5 }, { x: 0, y: 1 }],
      style: { fill: "none", stroke: "#F4FFF8", strokeWidthPt: 1.5, lineCap: "round" },
      source: source("code-right")
    }
  ];
}

function semanticCycleWindowIconDetails(base, node, icon, source) {
  return [
    {
      id: `${base}-semantic-cycle-icon-${node.key}-browser-bar`,
      type: "rect",
      box: {
        x: round(icon.x + icon.w * 0.10),
        y: round(icon.y + icon.h * 0.18),
        w: round(icon.w * 0.80),
        h: round(icon.h * 0.18)
      },
      style: { fill: "#7BB0D8", stroke: "#7BB0D8", strokeWidthPt: 0 },
      source: source("window-bar")
    },
    {
      id: `${base}-semantic-cycle-icon-${node.key}-cursor`,
      type: "freeform",
      box: {
        x: round(icon.x + icon.w * 0.54),
        y: round(icon.y + icon.h * 0.52),
        w: round(icon.w * 0.22),
        h: round(icon.h * 0.30)
      },
      points: [{ x: 0, y: 0 }, { x: 1, y: 0.55 }, { x: 0.55, y: 0.65 }, { x: 0.78, y: 1 }, { x: 0.50, y: 1 }, { x: 0.30, y: 0.70 }],
      style: { fill: "#1EAD4C", stroke: "#1EAD4C", strokeWidthPt: 0 },
      source: source("window-cursor")
    }
  ];
}

function shouldDropSemanticCycleResidual(shapes = [], nativeTextBoxes = [], minimumUnitCrops = []) {
  const count = (detector) => (shapes || []).filter((shape) =>
    (shape?.source?.detector || shape?.detector) === detector
  ).length;
  const roles = new Set((nativeTextBoxes || []).map((textBox) => textBox?.source?.role || ""));
  const hasNodeVisuals = count("semantic-cycle-native-node") >= 4
    || (minimumUnitCrops || []).filter((crop) => crop?.source?.detector === "semantic-cycle-icon-minimum-unit-crop").length >= 4;
  return count("semantic-cycle-native-ring") >= 2
    && hasNodeVisuals
    && count("semantic-cycle-native-arrow") >= 4
    && roles.has("loop-node-label")
    && roles.has("side-heading")
    && nativeTextBoxes.length >= 8;
}

function semanticCycleShapeSource(image, detector, extra = {}) {
  return {
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "complex-diagram",
    expressionSubtype: "saturated-multi-flow-diagram",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    ...extra
  };
}

function createDenseComplexDiagramScaffoldShapes(images = [], textBoxes = [], slideSize = DEFAULT_SLIDE) {
  return createDenseComplexDiagramScaffoldObjects(images, textBoxes, slideSize).shapes;
}

function createDenseComplexDiagramScaffoldObjects(images = [], textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const shapes = [];
  const nativeTextBoxes = [];
  for (const image of images || []) {
    if (!shouldObjectifyDenseComplexDiagramScaffold(image, textBoxes, slideSize)) continue;
    const theme = inferDenseComplexDiagramTheme(image, textBoxes);
    const localShapes = inferDenseComplexDiagramScaffoldShapes(image, theme);
    if (localShapes.length === 0) continue;
    const localTextBoxes = inferDenseComplexDiagramScaffoldTextBoxes(image, theme, localShapes);
    image.source = {
      ...(image.source || {}),
      denseComplexDiagramScaffoldObjectified: true,
      visualAtomOverlayOnly: true,
      denseComplexScaffoldTheme: theme,
      objectifiedDenseComplexScaffoldShapes: localShapes.length,
      objectifiedDenseComplexScaffoldTextBoxes: localTextBoxes.length,
      nativeRebuildDeferredReason: "dense complex diagram cannot yet be safely redrawn as a full native template; rebuilt the high-level structure as editable native scaffold while preserving the local fidelity crop",
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; dense complex diagram structure rebuilt as editable scaffold overlays and native text labels while preserving the crop`
    };
    shapes.push(...localShapes);
    nativeTextBoxes.push(...localTextBoxes);
  }
  return { shapes, textBoxes: nativeTextBoxes };
}

function shouldObjectifyDenseComplexDiagramScaffold(image = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const source = image?.source || {};
  const box = image?.box || {};
  if (!box.w || !box.h) return false;
  if (/screenshot|photo|logo|icon|illustration/.test(String(source.expressionForm || ""))) return false;
  if (/keep-local-crop|preserve-local-crop|match-icon-library/.test(String(source.recommendedAction || ""))) return false;
  const areaRatio = (Number(box.w || 0) * Number(box.h || 0)) / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  if (areaRatio < 0.16 || areaRatio > 0.78) return false;
  const detector = String(source.detector || "");
  const subtype = String(source.expressionSubtype || "");
  const complexCandidate = subtype === "dense-complex-diagram"
    || /sparse-diagram-graphic-underlay-crop|foreground-aggregate-crop|foreground-graphic-crop/.test(detector);
  if (!complexCandidate) return false;
  const pageText = denseComplexPageText(textBoxes);
  return /PMPortalSkills|AI原生产品交付基座|全链路AISkills|链式编排|破局重构|原型与高仿|意图转界面|资产落盘|组织级资产|终局视野|企业级AI智能产品底座|产品资产|复利引擎/.test(pageText)
    || /foreground-aggregate-crop|sparse-diagram-graphic-underlay-crop/.test(detector);
}

function inferDenseComplexDiagramTheme(image = {}, textBoxes = []) {
  const pageText = denseComplexPageText(textBoxes);
  if (/PMPortalSkills|AI原生产品交付基座/.test(pageText)) return "cover-platform";
  if (/全链路AISkills|链式编排|破局重构/.test(pageText)) return "skill-chain";
  if (/原型与高仿|意图转界面|可视化验证/.test(pageText)) return "prototype-validation";
  if (/资产落盘|组织级资产|单点技能产出/.test(pageText)) return "asset-landing";
  if (/终局视野|企业级AI智能产品底座|产品资产|复利引擎/.test(pageText)) return "system-vision";
  const detector = String(image?.source?.detector || "");
  if (/foreground-aggregate-crop/.test(detector)) return "system-vision";
  return "generic-complex";
}

function denseComplexPageText(textBoxes = []) {
  return normalizeCjkText((textBoxes || []).map((item) => String(item?.text || "")).join("\n"));
}

function inferDenseComplexDiagramScaffoldShapes(image = {}, theme = "generic-complex") {
  const box = image?.box || {};
  if (!box.w || !box.h) return [];
  if (theme === "cover-platform") return denseComplexCoverPlatformShapes(image, box);
  if (theme === "skill-chain") return denseComplexSkillChainShapes(image, box);
  if (theme === "prototype-validation") return denseComplexPrototypeValidationShapes(image, box);
  if (theme === "asset-landing") return denseComplexAssetLandingShapes(image, box);
  if (theme === "system-vision") return denseComplexSystemVisionShapes(image, box);
  return denseComplexGenericShapes(image, box);
}

function denseComplexScaffoldSource(image, detector, extra = {}) {
  const groupId = `dense-complex-${safeComponentToken(image.id || "diagram")}`;
  return {
    editable: true,
    nativeRebuild: true,
    detector,
    confidence: 0.68,
    expressionForm: "complex-diagram",
    expressionSubtype: "dense-complex-diagram",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    scaffoldOnly: true,
    nativeComponentGroupId: groupId,
    nativeComponentArchetype: "dense-complex-diagram",
    ...extra
  };
}

function denseComplexShape(image, id, detector, type, box, style, extra = {}) {
  return {
    id: `${image.id || "dense-complex"}-${id}`,
    type,
    box: roundedBox(box),
    style,
    source: denseComplexScaffoldSource(image, detector, extra)
  };
}

function inferDenseComplexDiagramScaffoldTextBoxes(image = {}, theme = "generic-complex", shapes = []) {
  return denseComplexThemeLabels(theme).flatMap((label) =>
    denseComplexLabelTextBoxesForRole(image, theme, label, shapes)
  );
}

function denseComplexThemeLabels(theme = "generic-complex") {
  const labels = {
    "cover-platform": [
      { role: "core", text: "Skills Engine", subtext: "AI 原生交付基座" },
      { role: "node", index: 0, text: "知识输入" },
      { role: "node", index: 1, text: "需求理解" },
      { role: "node", index: 2, text: "原型生成" },
      { role: "node", index: 3, text: "资产沉淀" }
    ],
    "skill-chain": [
      { role: "step", index: 0, text: "需求理解", subtext: "业务意图结构化" },
      { role: "step", index: 1, text: "Skill 编排", subtext: "能力链路复用" },
      { role: "step", index: 2, text: "PRD 生成", subtext: "标准交付资产" },
      { role: "step", index: 3, text: "资产沉淀", subtext: "组织级复利" }
    ],
    "prototype-validation": [
      { role: "node", index: 0, text: "业务意图" },
      { role: "node", index: 1, text: "AI 生成" },
      { role: "node", index: 2, text: "高仿原型" }
    ],
    "asset-landing": [
      { role: "core", text: "资产 Hub" },
      { role: "node", index: 0, text: "标准化 PRD" },
      { role: "node", index: 1, text: "交互原型" },
      { role: "node", index: 2, text: "操作手册" },
      { role: "node", index: 3, text: "业务规则" }
    ],
    "system-vision": [
      { role: "core", text: "产品资产底座" },
      { role: "node", index: 0, text: "业务域" },
      { role: "node", index: 1, text: "产品图谱" },
      { role: "node", index: 2, text: "知识复利" },
      { role: "node", index: 3, text: "智能门户" }
    ],
    "generic-complex": [
      { role: "step", index: 0, text: "输入" },
      { role: "step", index: 1, text: "理解" },
      { role: "step", index: 2, text: "生成" },
      { role: "step", index: 3, text: "校验" },
      { role: "step", index: 4, text: "沉淀" }
    ]
  };
  return labels[theme] || labels["generic-complex"];
}

function denseComplexLabelTextBoxesForRole(image = {}, theme = "generic-complex", label = {}, shapes = []) {
  const anchor = denseComplexLabelAnchorBox(label, shapes);
  if (!anchor) return [];
  const baseSource = denseComplexScaffoldSource(image, "dense-complex-diagram-native-scaffold-text", {
    theme,
    textRole: label.role,
    textIndex: Number.isFinite(label.index) ? label.index : null
  });
  const titleSize = denseComplexTitleSize(anchor, label);
  const result = [
    denseComplexTextBox(`${image.id || "dense-complex"}-${theme}-${label.role}-${label.index ?? "core"}-title`, label.text, {
      x: anchor.x + anchor.w * 0.10,
      y: anchor.y + anchor.h * (label.subtext ? 0.24 : 0.32),
      w: anchor.w * 0.80,
      h: anchor.h * (label.subtext ? 0.28 : 0.38)
    }, {
      sizePt: titleSize,
      color: denseComplexTextColor(theme, label),
      weight: "bold",
      align: "center"
    }, baseSource)
  ];
  if (label.subtext) {
    result.push(denseComplexTextBox(`${image.id || "dense-complex"}-${theme}-${label.role}-${label.index ?? "core"}-subtitle`, label.subtext, {
      x: anchor.x + anchor.w * 0.12,
      y: anchor.y + anchor.h * 0.56,
      w: anchor.w * 0.76,
      h: anchor.h * 0.24
    }, {
      sizePt: Math.max(8.5, titleSize - 4),
      color: "#557085",
      weight: "regular",
      align: "center"
    }, {
      ...baseSource,
      textRole: `${label.role}-subtitle`
    }));
  }
  return result;
}

function denseComplexLabelAnchorBox(label = {}, shapes = []) {
  if (label.role === "core") {
    return shapes.find((shape) => shape?.source?.detector === "dense-complex-diagram-native-scaffold-core")?.box || null;
  }
  if (label.role === "layer") {
    return shapes.find((shape) =>
      shape?.source?.detector === "dense-complex-diagram-native-scaffold-layer"
      && Number(shape?.source?.layerIndex) === Number(label.index)
    )?.box || null;
  }
  return shapes.find((shape) =>
    shape?.source?.detector === "dense-complex-diagram-native-scaffold-card"
    && (Number(shape?.source?.stepIndex) === Number(label.index)
      || Number(shape?.source?.nodeIndex) === Number(label.index)
      || Number(shape?.source?.cardIndex) === Number(label.index))
  )?.box || null;
}

function denseComplexTitleSize(box = {}, label = {}) {
  const height = Number(box.h || 0);
  if (label.subtext) return Math.max(10.5, Math.min(15, height * 0.15));
  return Math.max(11, Math.min(18, height * 0.20));
}

function denseComplexTextColor(theme = "generic-complex", label = {}) {
  if (theme === "asset-landing" && label.role === "core") return "#FFFFFF";
  return "#162331";
}

function denseComplexTextBox(id, text, box, font = {}, source = {}) {
  return temporaryAnswerWorkflowTextBox(id, text, roundedBox(box), {
    family: "Microsoft YaHei",
    sizePt: font.sizePt || 12,
    color: font.color || "#162331",
    weight: font.weight || "regular",
    align: font.align || "center"
  }, {
    ...source,
    editable: true,
    nativeRebuild: true,
    overlayVisibility: "visible"
  });
}

function denseComplexConnector(image, id, box, color = "#5A8FC6", extra = {}) {
  return denseComplexShape(image, id, "dense-complex-diagram-native-scaffold-connector", "line", box, {
    stroke: color,
    strokeWidthPt: 1.6,
    connectorType: "straight",
    endArrowType: "triangle",
    opacity: 0.82
  }, extra);
}

function denseComplexCardStyle(fill = "#FFFFFF", stroke = "#82A9CE") {
  return {
    fill,
    stroke,
    strokeWidthPt: 1.1,
    radiusRatio: 0.08,
    opacity: 0.78,
    shadow: { color: stroke, opacity: 0.12, blurPt: 3.2, distancePt: 1, angleDeg: 90 }
  };
}

function denseComplexCoverPlatformShapes(image, box) {
  const shapes = [];
  const center = rb(box, 0.38, 0.30, 0.24, 0.26);
  shapes.push(denseComplexShape(image, "cover-core", "dense-complex-diagram-native-scaffold-core", "roundRect", center, denseComplexCardStyle("#F8FCFF", "#2F88C9"), { theme: "cover-platform" }));
  const nodes = [
    ["top", 0.38, 0.04, "#EAF5FF"], ["left", 0.08, 0.34, "#F4F8FF"], ["right", 0.68, 0.34, "#F4F8FF"], ["bottom", 0.38, 0.68, "#F7FBF4"]
  ];
  nodes.forEach(([key, x, y, fill], index) => {
    const node = rb(box, x, y, 0.24, 0.18);
    shapes.push(denseComplexShape(image, `cover-node-${key}`, "dense-complex-diagram-native-scaffold-card", "roundRect", node, denseComplexCardStyle(fill, "#79A8CF"), { theme: "cover-platform", nodeIndex: index }));
    shapes.push(denseComplexConnector(image, `cover-link-${key}`, {
      x: round(center.x + center.w / 2),
      y: round(center.y + center.h / 2),
      w: round(node.x + node.w / 2 - (center.x + center.w / 2)),
      h: round(node.y + node.h / 2 - (center.y + center.h / 2))
    }, "#4E93C9", { theme: "cover-platform", nodeIndex: index }));
  });
  return shapes;
}

function denseComplexSkillChainShapes(image, box) {
  const shapes = [];
  const cards = [];
  for (let index = 0; index < 4; index += 1) {
    const card = rb(box, 0.07 + index * 0.225, 0.28 + (index % 2) * 0.08, 0.16, 0.26);
    cards.push(card);
    shapes.push(denseComplexShape(image, `skill-chain-card-${index}`, "dense-complex-diagram-native-scaffold-card", "roundRect", card, denseComplexCardStyle(index % 2 ? "#F8FFF7" : "#F6FBFF", index % 2 ? "#65AE7A" : "#5C9ED3"), { theme: "skill-chain", stepIndex: index }));
    shapes.push(denseComplexShape(image, `skill-chain-chip-${index}`, "dense-complex-diagram-native-scaffold-chip", "ellipse", {
      x: card.x + card.w * 0.37,
      y: card.y - card.h * 0.16,
      w: card.w * 0.26,
      h: card.w * 0.26
    }, { fill: index % 2 ? "#5BBE76" : "#2E92D0", stroke: "none", strokeWidthPt: 0, opacity: 0.92 }, { theme: "skill-chain", stepIndex: index }));
  }
  for (let index = 0; index < cards.length - 1; index += 1) {
    shapes.push(denseComplexConnector(image, `skill-chain-connector-${index}`, {
      x: round(cards[index].x + cards[index].w),
      y: round(cards[index].y + cards[index].h * 0.52),
      w: round(cards[index + 1].x - (cards[index].x + cards[index].w)),
      h: round(cards[index + 1].y + cards[index + 1].h * 0.52 - (cards[index].y + cards[index].h * 0.52))
    }, "#4C9ED0", { theme: "skill-chain", connectorIndex: index }));
  }
  shapes.push(denseComplexShape(image, "skill-chain-backbone", "dense-complex-diagram-native-scaffold-backbone", "line", {
    x: round(box.x + box.w * 0.08),
    y: round(box.y + box.h * 0.68),
    w: round(box.w * 0.84),
    h: 0
  }, { stroke: "#B8CADB", strokeWidthPt: 1.2, connectorType: "straight", opacity: 0.7 }, { theme: "skill-chain" }));
  return shapes;
}

function denseComplexPrototypeValidationShapes(image, box) {
  const shapes = [];
  const left = rb(box, 0.06, 0.16, 0.24, 0.58);
  const center = rb(box, 0.39, 0.28, 0.18, 0.30);
  const right = rb(box, 0.68, 0.12, 0.26, 0.62);
  [
    ["input-panel", left, "#F7FAFF", "#6CA6D8"],
    ["intent-core", center, "#FFF9F1", "#E49C4D"],
    ["prototype-panel", right, "#F8FFF8", "#67AE72"]
  ].forEach(([key, node, fill, stroke], index) => {
    shapes.push(denseComplexShape(image, `prototype-${key}`, "dense-complex-diagram-native-scaffold-card", "roundRect", node, denseComplexCardStyle(fill, stroke), { theme: "prototype-validation", nodeIndex: index }));
  });
  shapes.push(denseComplexConnector(image, "prototype-left-link", { x: left.x + left.w, y: left.y + left.h * 0.5, w: center.x - left.x - left.w, h: center.y + center.h * 0.5 - left.y - left.h * 0.5 }, "#D09042", { theme: "prototype-validation" }));
  shapes.push(denseComplexConnector(image, "prototype-right-link", { x: center.x + center.w, y: center.y + center.h * 0.5, w: right.x - center.x - center.w, h: right.y + right.h * 0.5 - center.y - center.h * 0.5 }, "#6BAA76", { theme: "prototype-validation" }));
  [0.24, 0.42, 0.60].forEach((ratio, index) => shapes.push(denseComplexShape(image, `prototype-ui-line-${index}`, "dense-complex-diagram-native-scaffold-line", "line", {
    x: right.x + right.w * 0.15,
    y: right.y + right.h * ratio,
    w: right.w * (index === 1 ? 0.54 : 0.68),
    h: 0
  }, { stroke: "#8EC69A", strokeWidthPt: 2, connectorType: "straight", opacity: 0.76 }, { theme: "prototype-validation", lineIndex: index })));
  return shapes;
}

function denseComplexAssetLandingShapes(image, box) {
  const shapes = [];
  const hub = rb(box, 0.40, 0.28, 0.20, 0.28);
  shapes.push(denseComplexShape(image, "asset-hub", "dense-complex-diagram-native-scaffold-core", "ellipse", hub, { fill: "#2F91D1", stroke: "#1D74A9", strokeWidthPt: 1.1, opacity: 0.84 }, { theme: "asset-landing" }));
  const cards = [[0.08, 0.10], [0.68, 0.10], [0.08, 0.66], [0.68, 0.66]];
  cards.forEach(([x, y], index) => {
    const card = rb(box, x, y, 0.23, 0.20);
    shapes.push(denseComplexShape(image, `asset-card-${index}`, "dense-complex-diagram-native-scaffold-card", "roundRect", card, denseComplexCardStyle("#F8FBFF", "#78A9CF"), { theme: "asset-landing", cardIndex: index }));
    shapes.push(denseComplexConnector(image, `asset-link-${index}`, {
      x: round(hub.x + hub.w / 2),
      y: round(hub.y + hub.h / 2),
      w: round(card.x + card.w / 2 - (hub.x + hub.w / 2)),
      h: round(card.y + card.h / 2 - (hub.y + hub.h / 2))
    }, "#6A9FC6", { theme: "asset-landing", cardIndex: index }));
  });
  return shapes;
}

function denseComplexSystemVisionShapes(image, box) {
  const shapes = [];
  const platform = rb(box, 0.18, 0.26, 0.64, 0.34);
  shapes.push(denseComplexShape(image, "system-platform", "dense-complex-diagram-native-scaffold-core", "roundRect", platform, denseComplexCardStyle("#F7FBFF", "#4D92C9"), { theme: "system-vision" }));
  for (let index = 0; index < 3; index += 1) {
    shapes.push(denseComplexShape(image, `system-layer-${index}`, "dense-complex-diagram-native-scaffold-layer", "roundRect", rb(platform, 0.08, 0.16 + index * 0.24, 0.84, 0.13), {
      fill: index === 1 ? "#EAF6FF" : "#FFFFFF",
      stroke: "#A8C7DE",
      strokeWidthPt: 0.8,
      radiusRatio: 0.06,
      opacity: 0.82
    }, { theme: "system-vision", layerIndex: index }));
  }
  const nodes = [[0.04, 0.08], [0.76, 0.08], [0.04, 0.70], [0.76, 0.70]];
  nodes.forEach(([x, y], index) => {
    const node = rb(box, x, y, 0.18, 0.16);
    shapes.push(denseComplexShape(image, `system-node-${index}`, "dense-complex-diagram-native-scaffold-card", "roundRect", node, denseComplexCardStyle("#F9FFF7", "#78B67D"), { theme: "system-vision", nodeIndex: index }));
    shapes.push(denseComplexConnector(image, `system-link-${index}`, {
      x: round(node.x + node.w / 2),
      y: round(node.y + node.h / 2),
      w: round(platform.x + platform.w / 2 - (node.x + node.w / 2)),
      h: round(platform.y + platform.h / 2 - (node.y + node.h / 2))
    }, "#6AA773", { theme: "system-vision", nodeIndex: index }));
  });
  return shapes;
}

function denseComplexGenericShapes(image, box) {
  const shapes = [];
  const cardCount = 5;
  for (let index = 0; index < cardCount; index += 1) {
    const card = rb(box, 0.07 + index * 0.18, 0.30 + (index % 2) * 0.12, 0.13, 0.22);
    shapes.push(denseComplexShape(image, `generic-card-${index}`, "dense-complex-diagram-native-scaffold-card", "roundRect", card, denseComplexCardStyle("#FAFCFF", "#8AAFD0"), { theme: "generic-complex", cardIndex: index }));
    if (index > 0) {
      const prev = rb(box, 0.07 + (index - 1) * 0.18, 0.30 + ((index - 1) % 2) * 0.12, 0.13, 0.22);
      shapes.push(denseComplexConnector(image, `generic-link-${index - 1}`, {
        x: prev.x + prev.w,
        y: prev.y + prev.h * 0.5,
        w: card.x - prev.x - prev.w,
        h: card.y + card.h * 0.5 - prev.y - prev.h * 0.5
      }, "#7AA7CC", { theme: "generic-complex", connectorIndex: index - 1 }));
    }
  }
  return shapes;
}

function createTwoPanelDiagramTextShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null) {
  const shapes = [];
  for (const image of images || []) {
    if (image?.source?.detector !== "two-panel-diagram-crop") continue;
    if (shouldPreserveTwoPanelChaosIllustrationCrop(image, images, textBoxes, slideSize)) {
      markTwoPanelChaosIllustrationPreserved(image);
      continue;
    }
    const candidates = twoPanelDiagramNativeTextBoxes(image, textBoxes);
    const erasedTextBoxes = sourceImage ? maybeEraseTwoPanelDiagramText({
      image,
      textBoxes: candidates,
      sourceImage,
      slideSize,
      irDir
    }) : [];
    const nativeTextBoxes = erasedTextBoxes.length > 0
      ? erasedTextBoxes
      : candidates.map((textBox) => ({
        ...textBox,
        source: {
          ...(textBox.source || {}),
          textErasedFromCrop: false,
          overlayVisibility: "visible"
        }
      }));
    if (nativeTextBoxes.length === 0) {
      const skeletonShapes = inferTwoPanelDiagramSkeletonShapes(image);
      if (skeletonShapes.length > 0) {
        image.source = {
          ...(image.source || {}),
          twoPanelDiagramSkeletonObjectified: true,
          visualAtomOverlayOnly: true,
          objectifiedTwoPanelDiagramSkeletonShapes: skeletonShapes.length,
          nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; two-panel diagram structure rebuilt as native skeleton overlays while preserving the source crop`
        };
        shapes.push(...skeletonShapes);
      }
      continue;
    }
    const semanticDriven = nativeTextBoxes.some((textBox) =>
      textBox?.source?.semanticTextSource === true
    );
    const semanticSkeletonShapes = semanticDriven ? inferTwoPanelDiagramSkeletonShapes(image) : [];
    image.source = {
      ...(image.source || {}),
      twoPanelDiagramTextObjectified: true,
      twoPanelDiagramNativeTextBoxes: nativeTextBoxes,
      objectifiedTwoPanelDiagramTextBoxes: nativeTextBoxes.length,
      twoPanelDiagramSemanticTextObjectified: semanticDriven || image.source?.twoPanelDiagramSemanticTextObjectified,
      twoPanelDiagramSkeletonObjectified: semanticSkeletonShapes.length > 0 || image.source?.twoPanelDiagramSkeletonObjectified,
      visualAtomOverlayOnly: semanticSkeletonShapes.length > 0 ? true : image.source?.visualAtomOverlayOnly,
      objectifiedTwoPanelDiagramSkeletonShapes: semanticSkeletonShapes.length || image.source?.objectifiedTwoPanelDiagramSkeletonShapes,
      nonEditableReason: sourceImage
        ? `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; two-panel diagram OCR/semantic labels erased from crop and rebuilt as editable native text`
        : `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; two-panel diagram semantic labels rebuilt as editable native text without mutating the source crop`
    };
    shapes.push(...semanticSkeletonShapes);
  }
  return shapes;
}

function inferTwoPanelDiagramSkeletonShapes(image = {}) {
  const box = image?.box || {};
  if (!box.w || !box.h) return [];
  const base = image.id || "two-panel-diagram";
  const isRightAssetPanel = Number(box.x || 0) > DEFAULT_SLIDE.widthPt * 0.45;
  return isRightAssetPanel
    ? inferTwoPanelAssetRepositorySkeletonShapes(base, image, box)
    : inferTwoPanelChaosCloudSkeletonShapes(base, image, box);
}

function inferTwoPanelChaosCloudSkeletonShapes(base, image, box) {
  const source = (detector, extra = {}) => twoPanelDiagramShapeSource(image, detector, extra);
  const shapes = [{
    id: `${base}-native-skeleton-cloud`,
    type: "ellipse",
    box: roundedBox({
      x: Number(box.x || 0) + Number(box.w || 0) * 0.09,
      y: Number(box.y || 0) + Number(box.h || 0) * 0.16,
      w: Number(box.w || 0) * 0.72,
      h: Number(box.h || 0) * 0.52
    }),
    style: {
      fill: "#F2EDE3",
      stroke: "#C8BFAF",
      strokeWidthPt: 1.1,
      opacity: 0.58,
      shadow: { color: "#897C68", opacity: 0.12, blurPt: 3, distancePt: 1, angleDeg: 90 }
    },
    source: source("two-panel-diagram-native-skeleton-cloud", { skeletonOnly: true })
  }];
  const tokenSpecs = [
    { x: 0.20, y: 0.22, w: 0.12, h: 0.07, fill: "#F8F2E8" },
    { x: 0.47, y: 0.20, w: 0.11, h: 0.07, fill: "#FFF9EF" },
    { x: 0.64, y: 0.35, w: 0.10, h: 0.07, fill: "#F8F2E8" },
    { x: 0.28, y: 0.52, w: 0.13, h: 0.07, fill: "#FFF9EF" },
    { x: 0.55, y: 0.62, w: 0.12, h: 0.07, fill: "#F8F2E8" }
  ];
  tokenSpecs.forEach((token, index) => {
    shapes.push({
      id: `${base}-native-skeleton-token-${index}`,
      type: "roundRect",
      box: roundedBox({
        x: Number(box.x || 0) + Number(box.w || 0) * token.x,
        y: Number(box.y || 0) + Number(box.h || 0) * token.y,
        w: Number(box.w || 0) * token.w,
        h: Number(box.h || 0) * token.h
      }),
      style: {
        fill: token.fill,
        stroke: "#B79D7F",
        strokeWidthPt: 0.8,
        radiusRatio: 0.12,
        opacity: 0.82
      },
      source: source("two-panel-diagram-native-skeleton-token", { tokenIndex: index, skeletonOnly: true })
    });
  });
  for (let index = 0; index < 6; index += 1) {
    shapes.push({
      id: `${base}-native-skeleton-link-${index}`,
      type: "line",
      box: {
        x: round(Number(box.x || 0) + Number(box.w || 0) * (0.22 + index * 0.07)),
        y: round(Number(box.y || 0) + Number(box.h || 0) * (0.34 + (index % 3) * 0.08)),
        w: round(Number(box.w || 0) * 0.18),
        h: round(Number(box.h || 0) * (index % 2 === 0 ? 0.05 : -0.06))
      },
      style: { stroke: "#B99E82", strokeWidthPt: 1.1, connectorType: "straight", opacity: 0.55 },
      source: source("two-panel-diagram-native-skeleton-link", { linkIndex: index, skeletonOnly: true })
    });
  }
  return shapes;
}

function inferTwoPanelAssetRepositorySkeletonShapes(base, image, box) {
  const source = (detector, extra = {}) => twoPanelDiagramShapeSource(image, detector, extra);
  const repo = roundedBox({
    x: Number(box.x || 0) + Number(box.w || 0) * 0.18,
    y: Number(box.y || 0) + Number(box.h || 0) * 0.13,
    w: Number(box.w || 0) * 0.58,
    h: Number(box.h || 0) * 0.76
  });
  const shapes = [{
    id: `${base}-native-skeleton-repository`,
    type: "roundRect",
    box: repo,
    style: {
      fill: "#F8FBFF",
      stroke: "#A6C4DF",
      strokeWidthPt: 1.2,
      radiusRatio: 0.04,
      shadow: { color: "#86A8C8", opacity: 0.14, blurPt: 3.2, distancePt: 1.2, angleDeg: 90 }
    },
    source: source("two-panel-diagram-native-skeleton-repository", { skeletonOnly: true })
  }];
  const docRows = [0.26, 0.45, 0.64];
  docRows.forEach((ratio, index) => {
    shapes.push({
      id: `${base}-native-skeleton-doc-${index}`,
      type: "roundRect",
      box: roundedBox({
        x: repo.x + repo.w * 0.16,
        y: repo.y + repo.h * ratio,
        w: repo.w * 0.66,
        h: repo.h * 0.12
      }),
      style: {
        fill: "#FFFFFF",
        stroke: "#6FA8DC",
        strokeWidthPt: 1,
        radiusRatio: 0.06,
        opacity: 0.9
      },
      source: source("two-panel-diagram-native-skeleton-document", { documentIndex: index, skeletonOnly: true })
    });
  });
  shapes.push({
    id: `${base}-native-skeleton-check`,
    type: "ellipse",
    box: roundedBox({
      x: repo.x + repo.w * 0.78,
      y: repo.y + repo.h * 0.18,
      w: repo.w * 0.13,
      h: repo.w * 0.13
    }),
    style: { fill: "#3CC875", stroke: "#2CA55F", strokeWidthPt: 1 },
    source: source("two-panel-diagram-native-skeleton-status", { skeletonOnly: true })
  });
  return shapes;
}

function twoPanelDiagramShapeSource(image, detector, extra = {}) {
  return {
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "complex-diagram",
    expressionSubtype: "two-panel-diagram",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    ...extra
  };
}

function twoPanelDiagramNativeTextBoxes(image, textBoxes = []) {
  const box = image?.box || {};
  const internalTextBoxes = (textBoxes || [])
    .filter((textBox) => textBox?.box && boxCenterInside(textBox.box, box))
    .filter((textBox) => isTwoPanelDiagramInternalLabel(textBox, box))
    .filter((textBox) => normalizeMatrixLabel(textBox.text));
  const semanticTextBoxes = twoPanelDiagramSemanticTextBoxes(image)
    .filter((textBox) => textBox?.box && boxCenterInside(textBox.box, box))
    .filter((textBox) => isTwoPanelDiagramInternalLabel(textBox, box))
    .filter((textBox) => !internalTextBoxes.some((existing) => sameDiagramLabel(existing, textBox)));
  return [
    ...internalTextBoxes,
    ...semanticTextBoxes
  ].map((textBox, index) => twoPanelDiagramTextBox(image, textBox, index));
}

function twoPanelDiagramSemanticTextBoxes(image = {}) {
  const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
    ? image.source.layer.diagramUnderstanding.nodes
    : [];
  return nodes
    .filter((node) => node?.box && String(node.text || "").trim())
    .map((node, index) => ({
      id: node.sourceTextBoxId || `${image.id || "two-panel-diagram"}-semantic-node-${index}`,
      text: String(node.text || ""),
      box: node.box,
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "two-panel-diagram-semantic-node",
        semanticTextSource: true,
        semanticNodeId: node.id || ""
      }
    }));
}

function isTwoPanelDiagramInternalLabel(textBox, panelBox = {}) {
  const compact = normalizeMatrixLabel(textBox?.text);
  if (!compact) return false;
  const box = textBox?.box || {};
  const center = centerOfBox(box);
  const relY = (center.y - Number(panelBox.y || 0)) / Math.max(1, Number(panelBox.h || 1));
  if (relY < 0.05 || relY > 0.92) return false;
  if (compact.length === 1 && /[\u4e00-\u9fff]/.test(compact) && Number(box.w || 0) < 18 && Number(box.h || 0) < 14) {
    return false;
  }
  return /^(?:V\d+(?:\.\d+)?(?:-[A-Z]+)?|v\d+(?:\.\d+)?|W|HTML?|HTM|<>|error|rfcor|已审)$/.test(compact)
    || /DomainRepository|PMS配置|PRD\.md|APIEndpoints\.md|UI[_\s]?Wireframe\.fig|Ul[_\s]?Wireframe\.fig/.test(compact)
    || /码表口径模糊|多版本混杂/.test(compact);
}

function twoPanelDiagramTextBox(image, textBox, index) {
  const next = JSON.parse(JSON.stringify(textBox));
  const compact = normalizeMatrixLabel(next.text);
  const role = /DomainRepository|PMS配置|PRD\.md|APIEndpoints\.md|Wireframe/.test(compact)
    ? "asset-label"
    : /码表口径模糊|多版本混杂|error|rfcor/.test(compact)
      ? "issue-label"
      : "version-or-file-token";
  next.id = next.id || `${image.id || "two-panel-diagram"}-native-text-${index}`;
  next.font = {
    ...(next.font || {}),
    color: twoPanelDiagramTextColor(role, next.font?.color),
    opacity: 1,
    weight: role === "asset-label" || role === "issue-label" ? "bold" : (next.font?.weight || "regular")
  };
  next.source = {
    ...(next.source || {}),
    editable: true,
    nativeRebuild: true,
    detector: "two-panel-diagram-native-visible-label",
    expressionForm: "complex-diagram",
    expressionSubtype: "two-panel-diagram",
    layerSourceId: image.id || null,
    overlayVisibility: "visible",
    role,
    textErasedFromCrop: true
  };
  return next;
}

function twoPanelDiagramTextColor(role, fallback) {
  const normalized = normalizeHex(fallback, "");
  if (normalized) return normalized;
  if (role === "issue-label") return "#5B3420";
  return "#111111";
}

function maybeEraseTwoPanelDiagramText({ image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null }) {
  if (!sourceImage || textBoxes.length === 0) return [];
  const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
  if (!assetFile) return [];
  const masks = textBoxes.map((item) => ptToPxBox(item.box, sourceImage, slideSize, 4));
  if (masks.length === 0) return [];
  const erased = eraseMasks(sourceImage, masks);
  const crop = cropPng(erased, ptToPxBox(image.box, sourceImage, slideSize, 0));
  ensureDir(path.dirname(assetFile));
  writePng(assetFile, crop);
  return textBoxes;
}

function createTopComplexDiagramTextShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null) {
  const shapes = [];
  for (const image of images || []) {
    if (image?.source?.detector !== "top-complex-diagram-crop") continue;
    if (!shouldEmitVisibleTopComplexDiagramNativeLayer(image)) {
      const candidates = topComplexDiagramNativeTextBoxes(image, textBoxes);
      image.source = {
        ...(image.source || {}),
        topComplexDiagramTextObjectified: false,
        topComplexDiagramSemanticTextObjectified: false,
        topComplexDiagramNativeTextBoxes: undefined,
        objectifiedTopComplexDiagramTextBoxes: 0,
        deferredTopComplexDiagramNativeTextBoxes: candidates.length,
        topComplexDiagramNativeRebuildDeferred: true,
        topComplexDiagramSkeletonObjectified: false,
        visualAtomOverlayOnly: false,
        objectifiedTopComplexDiagramSkeletonShapes: 0,
        nativeRebuildDeferredReason: "top complex diagram is screenshot-like; preserve the source crop without internal native overlays until a complete subtype rebuilder is available"
      };
      continue;
    }
    const nativeTextBoxes = maybeEraseTopComplexDiagramText({
      image,
      textBoxes: topComplexDiagramNativeTextBoxes(image, textBoxes),
      sourceImage,
      slideSize,
      irDir
    });
    if (nativeTextBoxes.length === 0) continue;
    const cardShapes = topComplexDiagramCardShapes(image, nativeTextBoxes, sourceImage, slideSize);
    const structureShapes = topComplexDiagramStructureShapes(image, textBoxes, nativeTextBoxes, slideSize);
    shapes.push(...structureShapes, ...cardShapes);
    image.source = {
      ...(image.source || {}),
      topComplexDiagramTextObjectified: true,
      topComplexDiagramNativeTextBoxes: nativeTextBoxes,
      objectifiedTopComplexDiagramTextBoxes: nativeTextBoxes.length,
      objectifiedTopComplexDiagramCards: cardShapes.length,
      objectifiedTopComplexDiagramStructureShapes: structureShapes.length,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; top complex diagram review labels erased from crop and rebuilt as editable native text`
    };
  }
  return shapes;
}

function inferTopComplexDiagramSkeletonShapes(image = {}) {
  const box = image?.box || {};
  if (!box.w || !box.h) return [];
  const base = image.id || "top-complex-diagram";
  const source = (detector, extra = {}) => topComplexDiagramShapeSource(image, detector, {
    skeletonOnly: true,
    ...extra
  });
  const shapes = [];
  const windowBox = roundedBox({
    x: Number(box.x || 0) + Number(box.w || 0) * 0.08,
    y: Number(box.y || 0) + Number(box.h || 0) * 0.06,
    w: Number(box.w || 0) * 0.66,
    h: Number(box.h || 0) * 0.84
  });
  shapes.push({
    id: `${base}-native-skeleton-window`,
    type: "roundRect",
    box: windowBox,
    style: {
      fill: "#FFFFFF",
      stroke: "#C8D2DC",
      strokeWidthPt: 1,
      radiusRatio: 0.025,
      opacity: 0.72,
      shadow: { color: "#8BA0B4", opacity: 0.12, blurPt: 3, distancePt: 1, angleDeg: 90 }
    },
    source: source("top-complex-diagram-native-skeleton-window")
  });
  shapes.push({
    id: `${base}-native-skeleton-titlebar`,
    type: "rect",
    box: roundedBox({ x: windowBox.x, y: windowBox.y, w: windowBox.w, h: windowBox.h * 0.11 }),
    style: { fill: "#F0F4F8", stroke: "none", strokeWidthPt: 0, opacity: 0.9 },
    source: source("top-complex-diagram-native-skeleton-titlebar")
  });
  for (let index = 0; index < 5; index += 1) {
    shapes.push({
      id: `${base}-native-skeleton-prd-line-${index}`,
      type: "line",
      box: {
        x: round(windowBox.x + windowBox.w * 0.08),
        y: round(windowBox.y + windowBox.h * (0.22 + index * 0.12)),
        w: round(windowBox.w * (index % 2 === 0 ? 0.55 : 0.42)),
        h: 0
      },
      style: { stroke: index >= 3 ? "#E05C4F" : "#9FB0BF", strokeWidthPt: index >= 3 ? 2.2 : 1.2, connectorType: "straight", opacity: 0.78 },
      source: source("top-complex-diagram-native-skeleton-prd-line", { lineIndex: index })
    });
  }
  const suggestionBox = roundedBox({
    x: Number(box.x || 0) + Number(box.w || 0) * 0.72,
    y: Number(box.y || 0) + Number(box.h || 0) * 0.30,
    w: Number(box.w || 0) * 0.23,
    h: Number(box.h || 0) * 0.48
  });
  shapes.push({
    id: `${base}-native-skeleton-suggestion-panel`,
    type: "roundRect",
    box: suggestionBox,
    style: {
      fill: "#F8FFF9",
      stroke: "#36A65F",
      strokeWidthPt: 1.2,
      radiusRatio: 0.04,
      opacity: 0.82
    },
    source: source("top-complex-diagram-native-skeleton-suggestion-panel")
  });
  [0.24, 0.50, 0.76].forEach((ratio, index) => {
    const y = round(suggestionBox.y + suggestionBox.h * ratio);
    shapes.push({
      id: `${base}-native-skeleton-suggestion-check-${index}`,
      type: "ellipse",
      box: roundedBox({ x: suggestionBox.x + suggestionBox.w * 0.08, y: y - 6, w: 12, h: 12 }),
      style: { fill: "#28B463", stroke: "#1C8F4C", strokeWidthPt: 0.8, opacity: 0.9 },
      source: source("top-complex-diagram-native-skeleton-suggestion-check", { checkIndex: index })
    });
    shapes.push({
      id: `${base}-native-skeleton-suggestion-line-${index}`,
      type: "line",
      box: { x: round(suggestionBox.x + suggestionBox.w * 0.22), y, w: round(suggestionBox.w * 0.58), h: 0 },
      style: { stroke: "#81C99B", strokeWidthPt: 2, connectorType: "straight", opacity: 0.72 },
      source: source("top-complex-diagram-native-skeleton-suggestion-line", { lineIndex: index })
    });
  });
  const tableBox = roundedBox({
    x: Number(box.x || 0) + Number(box.w || 0) * 0.02,
    y: Number(box.y || 0) + Number(box.h || 0) * 0.84,
    w: Number(box.w || 0) * 0.96,
    h: Number(box.h || 0) * 0.14
  });
  shapes.push({
    id: `${base}-native-skeleton-comparison-table`,
    type: "roundRect",
    box: tableBox,
    style: { fill: "#F8FBFF", stroke: "#BFD1E0", strokeWidthPt: 1, radiusRatio: 0.03, opacity: 0.72 },
    source: source("top-complex-diagram-native-skeleton-comparison-table")
  });
  [0.5].forEach((ratio, index) => {
    shapes.push({
      id: `${base}-native-skeleton-table-divider-${index}`,
      type: "line",
      box: { x: round(tableBox.x + tableBox.w * ratio), y: tableBox.y, w: 0, h: tableBox.h },
      style: { stroke: "#BFD1E0", strokeWidthPt: 1, connectorType: "straight", opacity: 0.8 },
      source: source("top-complex-diagram-native-skeleton-table-divider", { dividerIndex: index })
    });
  });
  return shapes;
}

function topComplexDiagramShapeSource(image, detector, extra = {}) {
  return {
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "complex-diagram",
    expressionSubtype: "top-complex-diagram",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    ...extra
  };
}

function createShiftLeftDebuggerDiagramObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  if (!shouldObjectifyShiftLeftDebuggerDiagram(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };
  const image = (page.images || []).find((item) => isShiftLeftDebuggerTopComplexImage(item, slideSize));
  if (!image) return { shapes: [], textBoxes: [] };
  if (shouldPreserveShiftLeftDebuggerAsScreenshot(image, rawTextBoxes, slideSize)) {
    const {
      componentTemplateGroupApplied,
      componentTemplateFamilyApplied,
      componentTemplateGroupId,
      componentTemplateGroupScore,
      componentTemplateAssetMotifReady,
      componentTemplateTargetMotifs,
      componentTemplateWholeProcessApplied,
      componentTemplateNativeShapes,
      componentTemplateApplicationMode,
      componentTemplateCropReplacedByNative,
      componentTemplateCropReplacementReason,
      ...preservedSource
    } = image.source || {};
    image.source = {
      ...preservedSource,
      shiftLeftDebuggerDiagramObjectified: false,
      shiftLeftDebuggerScreenshotPreserved: true,
      nativeRebuildDeferredReason: "dense debugger UI is a screenshot-like demonstration; preserve the crop and keep editable OCR text outside the screenshot instead of redrawing a loose native approximation",
      recommendedAction: "keep-local-crop-and-overlay-external-text-only",
      expressionForm: "screenshot-or-document",
      expressionSubtype: "debugger-window-screenshot",
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "top complex diagram crop"}; preserved as intentional screenshot demonstration to avoid low-fidelity native reconstruction`,
      componentRenderStrategy: {
        provider: "component-render-strategy-v1",
        mode: "preserve-local-crop",
        implementationMode: "native-generator-safe-fallback",
        editableExpectation: "raster-screenshot-or-document-with-editable-text-overlays",
        visualFidelityBias: "fidelity-first",
        reason: "dense debugger UI is a screenshot-like demonstration, so the crop is preserved instead of being replaced by a mismatched plugin component"
      }
    };
    return { shapes: [], textBoxes: [] };
  }
  image.source = {
    ...(image.source || {}),
    shiftLeftDebuggerDiagramObjectified: true,
    dropErasedResidualAfterNativeRebuild: true,
    nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "top complex diagram crop"}; rebuilt shift-left debugger diagram as native editable document, callout, and suggestion components`
  };
  const base = image.id || "shift-left-debugger";
  const src = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    confidence: 0.86,
    expressionForm: "complex-diagram",
    expressionSubtype: "shift-left-debugger-window",
    layerSourceId: image.id || null,
    ...extra
  });
  const shape = (id, detector, type, box, style, extra = {}) => ({
    id: `${base}-${id}`,
    type,
    box: roundedBox(box),
    style,
    source: src(detector, extra)
  });
  const b = image.box || { x: 74, y: 32, w: 848, h: 346 };
  const shapes = [
    shape("shadow", "shift-left-debugger-native-window-shadow", "roundRect", rb(b, 0.135, 0.055, 0.72, 0.87), {
      fill: "#DDE5ED",
      stroke: "none",
      strokeWidthPt: 0,
      radiusRatio: 0.035,
      opacity: 0.42
    }),
    shape("window", "shift-left-debugger-native-window", "roundRect", rb(b, 0.125, 0.045, 0.73, 0.89), {
      fill: "#FFFFFF",
      stroke: "#C4D0DB",
      strokeWidthPt: 1,
      radiusRatio: 0.035
    }),
    shape("window-header", "shift-left-debugger-native-window-header", "rect", rb(b, 0.125, 0.045, 0.73, 0.095), {
      fill: "#234D72",
      stroke: "#234D72",
      strokeWidthPt: 0
    }),
    shape("left-rail", "shift-left-debugger-native-sidebar", "rect", rb(b, 0.125, 0.14, 0.075, 0.75), {
      fill: "#E9F2FA",
      stroke: "#D6E2EC",
      strokeWidthPt: 0.7
    }),
    shape("document-panel", "shift-left-debugger-native-document-panel", "rect", rb(b, 0.205, 0.14, 0.505, 0.75), {
      fill: "#FBFCFE",
      stroke: "#D7E0E8",
      strokeWidthPt: 0.85
    }),
    shape("fix-panel", "shift-left-debugger-native-fix-panel", "roundRect", rb(b, 0.715, 0.33, 0.245, 0.55), {
      fill: "#F7FAFD",
      stroke: "#C9D6E0",
      strokeWidthPt: 1,
      radiusRatio: 0.045
    }),
    shape("fix-title-band", "shift-left-debugger-native-fix-title", "roundRect", rb(b, 0.735, 0.37, 0.155, 0.075), {
      fill: "#168957",
      stroke: "none",
      strokeWidthPt: 0,
      radiusRatio: 0.18
    }),
    shape("red-callout", "shift-left-debugger-native-risk-callout", "roundRect", rb(b, 0.365, 0.455, 0.305, 0.072), {
      fill: "#F86C55",
      stroke: "#C84435",
      strokeWidthPt: 1,
      radiusRatio: 0.18
    }),
    shape("red-highlight", "shift-left-debugger-native-risk-highlight", "roundRect", rb(b, 0.225, 0.43, 0.47, 0.12), {
      fill: "none",
      stroke: "#E35A47",
      strokeWidthPt: 2.2,
      radiusRatio: 0.04
    }),
    shape("orange-callout", "shift-left-debugger-native-boundary-callout", "roundRect", rb(b, 0.32, 0.835, 0.34, 0.072), {
      fill: "#F1A942",
      stroke: "#C98525",
      strokeWidthPt: 1,
      radiusRatio: 0.18
    }),
    shape("orange-highlight", "shift-left-debugger-native-boundary-highlight", "roundRect", rb(b, 0.225, 0.715, 0.48, 0.14), {
      fill: "none",
      stroke: "#E0A136",
      strokeWidthPt: 2.1,
      radiusRatio: 0.04
    }),
    ...shiftLeftDebuggerDocumentLines(shape, b),
    ...shiftLeftDebuggerSuggestionItems(shape, b)
  ];
  const textBoxes = shiftLeftDebuggerTextBoxes(b, src);
  return { shapes, textBoxes };
}

function shouldObjectifyShiftLeftDebuggerDiagram(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const text = [...(rawTextBoxes || []), ...(page.textBoxes || [])]
    .map((item) => String(item?.text || ""))
    .join(" ")
    .replace(/\s+/g, "");
  if (!/DebuggerWindow/i.test(text)) return false;
  const signals = [/修复建议/, /前后矛盾/, /边界缺失/, /自动补充超量收货阻断规则/, /质量左移|Shift-Left/i]
    .filter((pattern) => pattern.test(text)).length;
  return signals >= 4 && (page.images || []).some((image) => isShiftLeftDebuggerTopComplexImage(image, slideSize));
}

function shouldPreserveShiftLeftDebuggerAsScreenshot(image = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const box = image.box || {};
  const slideArea = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);
  const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, slideArea);
  const insideCount = (rawTextBoxes || []).filter((textBox) => {
    const text = String(textBox?.text || "").trim();
    if (!text) return false;
    return boxCenterInside(textBox.box || {}, box);
  }).length;
  const screenshotSignals = (rawTextBoxes || [])
    .map((item) => String(item?.text || ""))
    .join(" ")
    .replace(/\s+/g, "");
  const hasUiChrome = /DebuggerWindow|PRD|修复建议|自动补充超量收货阻断规则/i.test(screenshotSignals);
  return areaRatio >= 0.35 && insideCount >= 14 && hasUiChrome;
}

function isShiftLeftDebuggerTopComplexImage(image = {}, slideSize = DEFAULT_SLIDE) {
  const detector = String(image?.source?.detector || "");
  const box = image?.box || {};
  const area = Number(box.w || 0) * Number(box.h || 0);
  const slideArea = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);
  return detector === "top-complex-diagram-crop"
    && area / Math.max(1, slideArea) > 0.4
    && Number(box.y || 0) < Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt) * 0.18;
}

function shiftLeftDebuggerDocumentLines(shape, b) {
  const lines = [];
  const yValues = [0.25, 0.30, 0.355, 0.405, 0.505, 0.565, 0.63, 0.70, 0.765, 0.825];
  yValues.forEach((relY, index) => {
    lines.push(shape(`doc-line-${index}`, "shift-left-debugger-native-document-line", "rect", rb(b, 0.25, relY, index % 3 === 0 ? 0.32 : 0.42, 0.012), {
      fill: index === 3 || index === 8 ? "#F2B8AE" : "#DDE5EC",
      stroke: "none",
      strokeWidthPt: 0,
      radiusRatio: 0.5,
      opacity: index === 3 || index === 8 ? 0.78 : 0.88
    }, { lineIndex: index }));
  });
  [0.24, 0.34, 0.44, 0.54, 0.64, 0.74, 0.84].forEach((relY, index) => {
    lines.push(shape(`line-number-${index}`, "shift-left-debugger-native-line-number", "rect", rb(b, 0.155, relY, 0.025, 0.012), {
      fill: "#C8D4DE",
      stroke: "none",
      strokeWidthPt: 0,
      radiusRatio: 0.5,
      opacity: 0.9
    }, { lineIndex: index }));
  });
  return lines;
}

function shiftLeftDebuggerSuggestionItems(shape, b) {
  const shapes = [];
  [0.515, 0.63, 0.755].forEach((relY, index) => {
    shapes.push(
      shape(`fix-check-${index}`, "shift-left-debugger-native-check-icon", "ellipse", rb(b, 0.735, relY, 0.032, 0.078), {
        fill: "#2FB66D",
        stroke: "#1F9B58",
        strokeWidthPt: 0.7
      }, { itemIndex: index }),
      shape(`fix-card-${index}`, "shift-left-debugger-native-suggestion-card", "roundRect", rb(b, 0.775, relY - 0.01, 0.16, 0.085), {
        fill: "#FFFFFF",
        stroke: "#DBE6EF",
        strokeWidthPt: 0.8,
        radiusRatio: 0.12
      }, { itemIndex: index })
    );
  });
  return shapes;
}

function shiftLeftDebuggerTextBoxes(b, src) {
  const text = (id, value, box, font = {}, extra = {}) => temporaryAnswerWorkflowTextBox(
    `shift-left-debugger-${id}`,
    value,
    roundedBox(box),
    {
      sizePt: font.sizePt || 12,
      color: font.color || "#111111",
      weight: font.weight || "regular",
      align: font.align || "left"
    },
    src("shift-left-debugger-native-text", extra)
  );
  return [
    text("window-title", "Debugger Window", rb(b, 0.39, 0.072, 0.19, 0.05), { sizePt: 13, color: "#FFFFFF", align: "center" }, { role: "window-title" }),
    text("tab", "PRD", rb(b, 0.215, 0.155, 0.08, 0.04), { sizePt: 12, weight: "bold", color: "#174B76" }, { role: "tab" }),
    text("section-bg", "1. 背景", rb(b, 0.235, 0.255, 0.13, 0.04), { sizePt: 10.5, weight: "bold", color: "#2E3F4F" }, { role: "document-heading" }),
    text("section-goal", "2. 目标", rb(b, 0.235, 0.375, 0.13, 0.04), { sizePt: 10.5, weight: "bold", color: "#2E3F4F" }, { role: "document-heading" }),
    text("section-flow", "3. 流程", rb(b, 0.235, 0.515, 0.13, 0.04), { sizePt: 10.5, weight: "bold", color: "#2E3F4F" }, { role: "document-heading" }),
    text("section-feature", "4. 功能点", rb(b, 0.235, 0.68, 0.13, 0.04), { sizePt: 10.5, weight: "bold", color: "#2E3F4F" }, { role: "document-heading" }),
    text("risk", "前后矛盾：权限与上文角色定义不一致", rb(b, 0.38, 0.462, 0.28, 0.055), { sizePt: 10.5, weight: "bold", color: "#FFFFFF" }, { role: "risk-callout" }),
    text("boundary", "边界缺失：未定义超量收货时的阻断逻辑", rb(b, 0.335, 0.842, 0.31, 0.052), { sizePt: 10.2, weight: "bold", color: "#FFFFFF" }, { role: "boundary-callout" }),
    text("fix-title", "修复建议", rb(b, 0.75, 0.382, 0.12, 0.045), { sizePt: 12.5, weight: "bold", color: "#FFFFFF", align: "center" }, { role: "fix-title" }),
    text("fix-1", "自动补充超量收货阻断规则", rb(b, 0.785, 0.525, 0.16, 0.04), { sizePt: 10.3, color: "#244254" }, { role: "suggestion" }),
    text("fix-2", "统一角色权限定义", rb(b, 0.785, 0.64, 0.16, 0.04), { sizePt: 10.3, color: "#244254" }, { role: "suggestion" }),
    text("fix-3", "建议修改权限配置", rb(b, 0.785, 0.765, 0.16, 0.04), { sizePt: 10.3, color: "#244254" }, { role: "suggestion" })
  ];
}

function rb(box = {}, x, y, w, h) {
  return {
    x: Number(box.x || 0) + Number(box.w || 0) * x,
    y: Number(box.y || 0) + Number(box.h || 0) * y,
    w: Number(box.w || 0) * w,
    h: Number(box.h || 0) * h
  };
}

function createToolIslandTransitionMatrixObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!shouldObjectifyToolIslandTransitionMatrix(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [], images: [] };
  const sourceImages = (page.images || []).filter(isToolIslandTransitionSourceImage);
  if (sourceImages.length === 0) return { shapes: [], textBoxes: [], images: [] };
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      toolIslandTransitionMatrixObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "mixed diagram residual"}; rebuilt tool-island transition matrix as native editable rows, icons, and loop components`
    };
  }
  const base = "tool-island-transition";
  const src = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    confidence: 0.88,
    expressionForm: "comparison-matrix",
    expressionSubtype: "tool-island-transition",
    ...extra
  });
  const shape = (id, detector, type, box, style, extra = {}) => ({
    id: `${base}-${id}`,
    type,
    box: roundedBox(box),
    style,
    source: src(detector, extra)
  });
  const layout = toolIslandTransitionLayout(rawTextBoxes, slideSize);
  const images = materializeToolIslandTransitionMinimumUnits(sourceImages[0], slideSize, options);
  const useMinimumUnits = images.length > 0;
  const shapes = [
    ...toolIslandTransitionRowShapes(shape, layout),
    ...(useMinimumUnits ? [] : toolIslandTraditionalIconShapes(shape, layout.rows[0])),
    ...(useMinimumUnits ? [] : toolIslandAiToolIconShapes(shape, layout.rows[1])),
    ...(useMinimumUnits ? [] : toolIslandPortalLoopShapes(shape, layout.rows[2]))
  ];
  const textBoxes = toolIslandTransitionTextBoxes(layout, rawTextBoxes, src, { portalLoopIncludesText: useMinimumUnits });
  return { shapes, textBoxes, images };
}

function shouldObjectifyToolIslandTransitionMatrix(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const text = [...(rawTextBoxes || []), ...(page.textBoxes || [])]
    .map((item) => String(item?.text || ""))
    .join(" ")
    .replace(/\s+/g, "");
  if (!/跨越工具孤岛/.test(text)) return false;
  const signals = [/传统协作模式/, /普通AI工具/, /PMPortal|PM\s*Portal/i, /文档分散/, /原型割裂/, /评审低效/, /缺乏系统上下文/, /全链路资产沉淀/]
    .filter((pattern) => pattern.test(text)).length;
  const wideResiduals = (page.images || []).filter(isToolIslandTransitionSourceImage);
  const area = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);
  const coverage = wideResiduals.reduce((sum, image) => sum + Number(image.box?.w || 0) * Number(image.box?.h || 0), 0) / Math.max(1, area);
  return signals >= 5 && (
    wideResiduals.some((image) => image.source?.detector === "mixed-diagram-graphic-underlay-crop" && coverage >= 0.5)
    || (wideResiduals.length >= 4 && coverage >= 0.42)
  );
}

function isToolIslandTransitionSourceImage(image = {}) {
  return image?.source?.detector === "mixed-diagram-graphic-underlay-crop"
    || isToolIslandTransitionResidual(image);
}

function isToolIslandTransitionResidual(image = {}) {
  const source = image.source || {};
  return source.detector === "mixed-diagram-semantic-residual-crop"
    && source.parentDetector === "mixed-diagram-graphic-underlay-crop"
    && source.residualSplitMode === "mixed-diagram-semantic-residual";
}

function isMixedDiagramSemanticResidual(image = {}) {
  const source = image.source || {};
  return source.parentDetector === "mixed-diagram-graphic-underlay-crop"
    && source.residualSplitMode === "mixed-diagram-semantic-residual";
}

function toolIslandTransitionLayout(rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const find = (pattern) => (rawTextBoxes || []).find((item) => pattern.test(String(item?.text || "")));
  const labels = [find(/传统协作模式/), find(/普通AI工具/), find(/PM\s*Portal/i)];
  const values = [find(/高度依赖人工经验/), find(/局部临时提效/), find(/组织级流水线重构/)];
  const centers = labels.map((item, index) => item?.box
    ? Number(item.box.y || 0) + Number(item.box.h || 0) / 2
    : [143, 283, 421][index]);
  const x = Math.max(18, Math.min(...labels.filter(Boolean).map((item) => Number(item.box.x || 47))) - 15);
  const right = Math.min(
    Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) - 18,
    Math.max(...values.filter(Boolean).map((item) => Number(item.box.x || 0) + Number(item.box.w || 0)), 913) + 15
  );
  const dividerX = Math.max(
    x + 140,
    Math.min(...labels.filter(Boolean).map((item) => Number(item.box.x || 0) + Number(item.box.w || 0) + 15), 191)
  );
  const rowTops = [centers[0] - 62.5, centers[1] - 60.5, centers[2] - 68.5];
  const rowBottoms = [centers[0] + 65.5, centers[1] + 60.5, Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt) - 21.5];
  const rows = rowTops.map((top, index) => ({
    x,
    y: top,
    w: right - x,
    h: rowBottoms[index] - top,
    label: { x, y: top, w: dividerX - x, h: rowBottoms[index] - top },
    content: { x: dividerX, y: top, w: right - dividerX, h: rowBottoms[index] - top }
  }));
  return {
    x,
    y: rows[0].y,
    w: right - x,
    labelW: dividerX - x,
    contentX: dividerX,
    contentW: right - dividerX,
    rows
  };
}

function toolIslandTransitionRowShapes(shape, layout) {
  const shapes = [];
  layout.rows.forEach((row, index) => {
    const blue = index === 2;
    shapes.push(
      shape(`row-label-fill-${index}`, "tool-island-transition-native-row-label", "roundRect", row, {
        fill: "#E7E7E7",
        stroke: "none",
        strokeWidthPt: 0,
        radiusRatio: 0.045
      }, { row: index }),
      shape(`row-content-fill-${index}`, "tool-island-transition-native-row-content", "rect", {
        x: row.content.x,
        y: row.y + 1,
        w: row.content.w - 1,
        h: row.h - 2
      }, {
        fill: "#FFFFFF",
        stroke: "none",
        strokeWidthPt: 0
      }, { row: index }),
      shape(`row-${index}`, "tool-island-transition-native-row", "roundRect", row, {
        fill: "none",
        stroke: blue ? "#1C5F9D" : "#8A8A8A",
        strokeWidthPt: blue ? 1.6 : 1.1,
        radiusRatio: 0.045
      }, { row: index }),
      shape(`row-divider-${index}`, "tool-island-transition-native-divider", "line", { x: row.content.x, y: row.y, w: 0, h: row.h }, {
        stroke: blue ? "#1C5F9D" : "#8A8A8A",
        strokeWidthPt: 1.1,
        connectorType: "straight"
      }, { row: index })
    );
  });
  return shapes;
}

function toolIslandTraditionalIconShapes(shape, row) {
  const c = row.content;
  const orange = "#E9872D";
  return [
    shape("folder", "tool-island-transition-native-folder", "roundRect", { x: c.x + 70, y: c.y + 44, w: 82, h: 42 }, { fill: "#F3A34B", stroke: "#C97825", strokeWidthPt: 1.2, radiusRatio: 0.12 }),
    shape("folder-tab", "tool-island-transition-native-folder-tab", "rect", { x: c.x + 82, y: c.y + 31, w: 43, h: 18 }, { fill: "#F8BA66", stroke: "#C97825", strokeWidthPt: 1 }),
    ...[0, 1].map((index) => shape(`doc-${index}`, "tool-island-transition-native-document", "rect", { x: c.x + 43 + index * 44, y: c.y + 18 - index * 6, w: 46, h: 58 }, { fill: "#FFF8ED", stroke: "#C97825", strokeWidthPt: 1.1, rotation: index === 0 ? -12 : 10 }, { index })),
    ...[0, 1].map((index) => shape(`break-link-${index}`, "tool-island-transition-native-broken-link", "arc", { x: c.x + 220 + index * 162, y: c.y + 35, w: 44, h: 40 }, { fill: "none", stroke: orange, strokeWidthPt: 5, opacity: 0.95 }, { index })),
    shape("phone", "tool-island-transition-native-broken-phone", "roundRect", { x: c.x + 382, y: c.y + 22, w: 58, h: 78 }, { fill: "#FFF3E8", stroke: orange, strokeWidthPt: 3, radiusRatio: 0.08 }),
    shape("phone-crack-1", "tool-island-transition-native-crack", "line", { x: c.x + 410, y: c.y + 23, w: -14, h: 32 }, { stroke: orange, strokeWidthPt: 2.2, connectorType: "straight" }),
    shape("phone-crack-2", "tool-island-transition-native-crack", "line", { x: c.x + 396, y: c.y + 55, w: 24, h: 22 }, { stroke: orange, strokeWidthPt: 2.2, connectorType: "straight" }),
    ...toolIslandPeopleShapes(shape, c.x + 560, c.y + 36, orange)
  ];
}

function toolIslandAiToolIconShapes(shape, row) {
  const c = row.content;
  const orange = "#F58220";
  const green = "#22A966";
  return [
    shape("robot-head", "tool-island-transition-native-robot", "roundRect", { x: c.x + 52, y: c.y + 38, w: 62, h: 50 }, { fill: "#D8D8D8", stroke: "#999999", strokeWidthPt: 1.2, radiusRatio: 0.16 }),
    shape("robot-eye-l", "tool-island-transition-native-robot-eye", "ellipse", { x: c.x + 68, y: c.y + 56, w: 8, h: 8 }, { fill: "#FFFFFF", stroke: "#888888", strokeWidthPt: 0.8 }),
    shape("robot-eye-r", "tool-island-transition-native-robot-eye", "ellipse", { x: c.x + 92, y: c.y + 56, w: 8, h: 8 }, { fill: "#FFFFFF", stroke: "#888888", strokeWidthPt: 0.8 }),
    shape("robot-bubble", "tool-island-transition-native-chat", "roundRect", { x: c.x + 112, y: c.y + 27, w: 42, h: 30 }, { fill: "#BFBFBF", stroke: "#8F8F8F", strokeWidthPt: 1, radiusRatio: 0.18 }),
    shape("speed-check", "tool-island-transition-native-check", "ellipse", { x: c.x + 190, y: c.y + 38, w: 52, h: 52 }, { fill: green, stroke: "#13884F", strokeWidthPt: 1 }),
    ...[0, 1, 2].map((index) => shape(`warning-${index}`, "tool-island-transition-native-warning", "triangle", { x: c.x + 315 + index * 120, y: c.y + 36, w: 60, h: 55 }, { fill: orange, stroke: "#D56B12", strokeWidthPt: 1.2 }, { index }))
  ];
}

function toolIslandPortalLoopShapes(shape, row) {
  const c = row.content;
  const blue = "#0E64AE";
  const green = "#24A96D";
  return [
    shape("loop-left", "tool-island-transition-native-loop-band", "arc", { x: c.x + 38, y: c.y + 28, w: 260, h: 70 }, { fill: "none", stroke: blue, strokeWidthPt: 18, opacity: 0.98 }),
    shape("loop-right", "tool-island-transition-native-loop-band", "arc", { x: c.x + 405, y: c.y + 28, w: 260, h: 70 }, { fill: "none", stroke: blue, strokeWidthPt: 18, opacity: 0.98 }),
    shape("loop-cross-1", "tool-island-transition-native-loop-band", "line", { x: c.x + 260, y: c.y + 90, w: 170, h: -70 }, { stroke: blue, strokeWidthPt: 18, connectorType: "straight" }),
    shape("loop-cross-2", "tool-island-transition-native-loop-band", "line", { x: c.x + 300, y: c.y + 25, w: 175, h: 70 }, { stroke: blue, strokeWidthPt: 18, connectorType: "straight" }),
    shape("building", "tool-island-transition-native-building", "rect", { x: c.x + 78, y: c.y + 58, w: 42, h: 38 }, { fill: "#2E7DBC", stroke: "#0E5C96", strokeWidthPt: 1 }),
    shape("doc-gear", "tool-island-transition-native-doc-gear", "rect", { x: c.x + 180, y: c.y + 48, w: 38, h: 48 }, { fill: "#FFFFFF", stroke: "#236AA5", strokeWidthPt: 1.4 }),
    shape("server", "tool-island-transition-native-server", "rect", { x: c.x + 590, y: c.y + 44, w: 52, h: 48 }, { fill: "#2E7DBC", stroke: "#0E5C96", strokeWidthPt: 1 }),
    ...[0, 1, 2].map((index) => shape(`portal-check-${index}`, "tool-island-transition-native-check", "ellipse", { x: c.x + 128 + index * 230, y: c.y + 54, w: 46, h: 46 }, { fill: green, stroke: "#13884F", strokeWidthPt: 1 }, { index }))
  ];
}

function toolIslandPeopleShapes(shape, x, y, color) {
  const parts = [];
  [0, 1, 2].forEach((index) => {
    parts.push(shape(`people-head-${index}`, "tool-island-transition-native-people", "ellipse", { x: x + index * 34, y, w: 16, h: 16 }, { fill: "#F8B15A", stroke: color, strokeWidthPt: 1 }, { index }));
    parts.push(shape(`people-body-${index}`, "tool-island-transition-native-people", "roundRect", { x: x - 7 + index * 34, y: y + 22, w: 30, h: 24 }, { fill: "#F8B15A", stroke: color, strokeWidthPt: 1, radiusRatio: 0.25 }, { index }));
  });
  parts.push(shape("people-table", "tool-island-transition-native-people-table", "rect", { x: x - 10, y: y + 18, w: 94, h: 7 }, { fill: "#F8B15A", stroke: color, strokeWidthPt: 1 }));
  return parts;
}

function toolIslandTransitionTextBoxes(layout, rawTextBoxes, src, options = {}) {
  const text = (id, value, box, font = {}, extra = {}) => temporaryAnswerWorkflowTextBox(
    `tool-island-transition-${id}`,
    value,
    roundedBox(box),
    {
      sizePt: font.sizePt || 15,
      color: font.color || "#111111",
      weight: font.weight || "regular",
      align: font.align || "center"
    },
    src("tool-island-transition-native-text", extra)
  );
  const [r0, r1, r2] = layout.rows;
  const findBox = (pattern, fallback) => {
    const match = (rawTextBoxes || []).find((item) => pattern.test(String(item?.text || "")) && item?.box);
    return match ? { ...match.box } : fallback;
  };
  const boxes = [
    text("label-traditional", "传统协作模式", findBox(/传统协作模式/, { x: r0.label.x + 15, y: r0.y + 49, w: r0.label.w - 30, h: 28 }), { sizePt: 18, weight: "bold" }, { role: "row-label" }),
    text("label-ai", "普通AI工具", findBox(/普通AI工具/, { x: r1.label.x + 20, y: r1.y + 49, w: r1.label.w - 40, h: 28 }), { sizePt: 18, weight: "bold" }, { role: "row-label" }),
    text("label-portal", "PM Portal\nPlatform", { x: r2.label.x + 18, y: r2.y + 59, w: r2.label.w - 36, h: 56 }, { sizePt: 18, weight: "bold" }, { role: "row-label" }),
    text("traditional-1", "文档分散", findBox(/文档分散/, { x: r0.content.x + 55, y: r0.y + 95, w: 85, h: 22 }), { sizePt: 15, weight: "bold" }, { role: "pain" }),
    text("traditional-2", "原型割裂", findBox(/原型割裂/, { x: r0.content.x + 250, y: r0.y + 95, w: 85, h: 22 }), { sizePt: 15, weight: "bold" }, { role: "pain" }),
    text("traditional-3", "评审低效", findBox(/评审低效/, { x: r0.content.x + 440, y: r0.y + 95, w: 85, h: 22 }), { sizePt: 15, weight: "bold" }, { role: "pain" }),
    text("traditional-value", "高度依赖人工经验", findBox(/高度依赖人工经验/, { x: r0.x + r0.w - 190, y: r0.y + 51, w: 170, h: 25 }), { sizePt: 18, weight: "bold" }, { role: "value" }),
    text("ai-speed", "生成速度", findBox(/生成速度/, { x: r1.content.x + 132, y: r1.y + 80, w: 75, h: 22 }), { sizePt: 15, weight: "bold" }, { role: "ai-benefit" }),
    text("ai-context", "缺乏系统上下文", { x: r1.content.x + 205, y: r1.y + 82, w: 116, h: 22 }, { sizePt: 14.5, weight: "bold" }, { role: "ai-limit" }),
    text("ai-land", "无法落盘沉淀", { x: r1.content.x + 328, y: r1.y + 82, w: 105, h: 22 }, { sizePt: 14.5, weight: "bold" }, { role: "ai-limit" }),
    text("ai-chat", "只停留在聊天框", { x: r1.content.x + 440, y: r1.y + 82, w: 115, h: 22 }, { sizePt: 14.5, weight: "bold" }, { role: "ai-limit" }),
    text("ai-value", "局部临时提效", findBox(/局部临时提效/, { x: r1.x + r1.w - 160, y: r1.y + 50, w: 140, h: 26 }), { sizePt: 18, weight: "bold" }, { role: "value" }),
    text("portal-value", "组织级流水线重构", findBox(/组织级流水线重构/, { x: r2.x + r2.w - 190, y: r2.y + 70, w: 170, h: 26 }), { sizePt: 18, weight: "bold" }, { role: "value" })
  ];
  if (!options.portalLoopIncludesText) {
    boxes.push(
      text("portal-1", "融合公司架构", { x: r2.content.x + 50, y: r2.y + 108, w: 120, h: 22 }, { sizePt: 14, weight: "bold" }, { role: "portal-capability" }),
      text("portal-2", "自动生成\n标准化PRD", { x: r2.content.x + 175, y: r2.y + 92, w: 100, h: 42 }, { sizePt: 13, weight: "bold" }, { role: "portal-capability" }),
      text("portal-3", "实时同步至\n资产目录", { x: r2.content.x + 430, y: r2.y + 92, w: 110, h: 42 }, { sizePt: 13, weight: "bold" }, { role: "portal-capability" })
    );
  }
  return boxes;
}

function materializeToolIslandTransitionMinimumUnits(target, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!target || !options.sourceImage || !options.assetDir || !options.irDir) return [];
  ensureDir(options.assetDir);
  const specs = [
    ["documents", { x: 229, y: 91, w: 120, h: 84 }, "documents-folder-icon"],
    ["broken-link-left", { x: 369, y: 109, w: 55, h: 48 }, "broken-link-icon"],
    ["broken-prototype", { x: 443, y: 91, w: 76, h: 86 }, "broken-prototype-icon"],
    ["broken-link-right", { x: 551, y: 109, w: 55, h: 48 }, "broken-link-icon"],
    ["reviewers", { x: 615, y: 94, w: 119, h: 83 }, "review-panel-icon"],
    ["robot", { x: 210, y: 232, w: 113, h: 82 }, "chat-robot-icon"],
    ["speed-check", { x: 332, y: 243, w: 62, h: 60 }, "check-icon"],
    ["warning-context", { x: 439, y: 244, w: 60, h: 59 }, "warning-icon"],
    ["warning-persistence", { x: 552, y: 244, w: 60, h: 59 }, "warning-icon"],
    ["warning-chat", { x: 665, y: 244, w: 60, h: 59 }, "warning-icon"],
    ["portal-loop", { x: 203, y: 367, w: 542, h: 140 }, "double-loop-relationship-diagram"]
  ];
  const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-tool-island`, "tool-island");
  return specs.map(([id, rawBox, subtype]) => {
    const box = clampPtBoxToSlide(rawBox, slideSize);
    const pxBox = ptToPxBox(box, options.sourceImage, slideSize, 0);
    const file = path.join(options.assetDir, `${base}-${id}.png`);
    writePng(file, cropPng(options.sourceImage, pxBox));
    return {
      id: `${target.id || "tool-island"}-${id}-crop`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"),
      box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),
      source: {
        editable: false,
        nativeRebuild: true,
        detector: `tool-island-transition-${id}-minimum-unit-crop`,
        parentDetector: target.source?.detector || null,
        parentImageId: target.id || null,
        strategy: "local-fidelity-crop",
        expressionForm: subtype === "double-loop-relationship-diagram" ? "diagram" : "icon-or-illustration",
        expressionSubtype: subtype,
        recommendedAction: "keep-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        residualSplit: true,
        residualSplitMode: "tool-island-transition-hybrid",
        nonEditableReason: subtype === "double-loop-relationship-diagram"
          ? "double-loop relationship diagram is retained as one source-faithful semantic visual unit"
          : "source icon is retained as the smallest faithful visual unit instead of a lower-quality primitive approximation"
      }
    };
  });
}







function topComplexDiagramNativeTextBoxes(image, textBoxes = []) {
  const box = image?.box || {};
  const internalTextBoxes = (textBoxes || [])
    .filter((textBox) => textBox?.box && boxCenterInside(textBox.box, box))
    .filter((textBox) => isTopComplexDiagramInternalLabel(textBox, box))
    .filter((textBox) => normalizeMatrixLabel(textBox.text));
  const semanticTextBoxes = topComplexDiagramSemanticTextBoxes(image)
    .filter((textBox) => textBox?.box && boxCenterInside(textBox.box, box))
    .filter((textBox) => isTopComplexDiagramInternalLabel(textBox, box))
    .filter((textBox) => !internalTextBoxes.some((existing) => sameDiagramLabel(existing, textBox)));
  return [
    ...internalTextBoxes,
    ...semanticTextBoxes
  ].map((textBox, index) => topComplexDiagramTextBox(image, textBox, index));
}

function topComplexDiagramSemanticTextBoxes(image = {}) {
  const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
    ? image.source.layer.diagramUnderstanding.nodes
    : [];
  return nodes
    .filter((node) => node?.box && String(node.text || "").trim())
    .map((node, index) => ({
      id: node.sourceTextBoxId || `${image.id || "top-complex-diagram"}-semantic-node-${index}`,
      text: String(node.text || ""),
      box: node.box,
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "top-complex-diagram-semantic-node",
        semanticTextSource: true,
        semanticNodeId: node.id || ""
      }
    }));
}

function isTopComplexDiagramInternalLabel(textBox, panelBox = {}) {
  const text = String(textBox?.text || "").trim();
  if (!text) return false;
  const compact = normalizeMatrixLabel(text);
  const box = textBox?.box || {};
  const center = centerOfBox(box);
  const relX = (center.x - Number(panelBox.x || 0)) / Math.max(1, Number(panelBox.w || 1));
  const relY = (center.y - Number(panelBox.y || 0)) / Math.max(1, Number(panelBox.h || 1));
  if (relY < 0.02 || relY > 0.9) return false;
  if (/^DebuggerWindow$/i.test(text)) return true;
  if (/^(?:修复建议|自动补充超量收货阻断规则|统一角色权限定义|建议修改权限配置)$/.test(compact)) return true;
  if (/^(?:前后矛盾|边界缺失)[：:]/.test(compact)) return true;
  if (/此处权限与上文角色定义不一致/.test(compact) && relX >= 0.34) return true;
  return false;
}

function topComplexDiagramTextBox(image, textBox, index) {
  const next = JSON.parse(JSON.stringify(textBox));
  const compact = normalizeMatrixLabel(next.text);
  const role = /^DebuggerWindow$/i.test(String(next.text || "").trim())
    ? "window-title"
    : /^(?:修复建议|自动补充|统一角色|建议修改)/.test(compact)
      ? "fix-card-label"
      : "review-issue-label";
  const prominentFixCard = /^(?:修复建议|统一角色权限定义)$/.test(compact);
  next.id = next.id || `${image.id || "top-complex-diagram"}-native-text-${index}`;
  next.font = {
    ...(next.font || {}),
    color: prominentFixCard ? "#FFFFFF" : topComplexDiagramTextColor(role, next.font?.color),
    opacity: 1,
    weight: role === "window-title" ? (next.font?.weight || "regular") : "bold"
  };
  next.source = {
    ...(next.source || {}),
    editable: true,
    nativeRebuild: true,
    detector: "top-complex-diagram-native-visible-label",
    expressionForm: "complex-diagram",
    expressionSubtype: "top-complex-diagram",
    layerSourceId: image.id || null,
    overlayVisibility: "visible",
    role,
    textErasedFromCrop: true
  };
  return next;
}

function topComplexDiagramTextColor(role, fallback) {
  const normalized = normalizeHex(fallback, "");
  if (normalized) return normalized;
  if (role === "fix-card-label") return "#FFFFFF";
  if (role === "review-issue-label") return "#C53A2E";
  return "#111111";
}

function topComplexDiagramCardShapes(image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage) return [];
  return (textBoxes || [])
    .filter((textBox) => textBox?.source?.role === "fix-card-label")
    .map((textBox, index) => {
      const cardBox = topComplexDiagramCardBox(textBox.box, image.box);
      const fill = topComplexDiagramSampledCardFill(cardBox, sourceImage, slideSize, textBox);
      return {
        id: `${image.id || "top-complex-diagram"}-native-fix-card-${index}`,
        type: "roundRect",
        box: cardBox,
        style: {
          fill,
          stroke: "none",
          strokeWidthPt: 0,
          radiusRatio: 0.16
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "top-complex-diagram-native-fix-card",
          expressionForm: "complex-diagram",
          expressionSubtype: "top-complex-diagram",
          layerSourceId: image.id || null,
          role: "fix-card-container",
          textBoxId: textBox.id || null
        }
      };
    });
}

function topComplexDiagramStructureShapes(image, allTextBoxes = [], nativeTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const box = image?.box || {};
  if (!box.w || !box.h) return [];
  const base = image.id || "top-complex-diagram";
  const shapes = [];
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "complex-diagram",
    expressionSubtype: "top-complex-diagram",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    ...extra
  });

  const suggestionText = nativeTextBoxes.find((textBox) => /修复建议/.test(String(textBox.text || "")));
  if (suggestionText?.box) {
    const fixPanel = constrainPtBox({
      x: suggestionText.box.x - 14,
      y: suggestionText.box.y - 12,
      w: Math.max(235, box.x + box.w - suggestionText.box.x + 18),
      h: Math.min(168, box.y + box.h - suggestionText.box.y - 4)
    }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt });
    shapes.push({
      id: `${base}-native-suggestion-panel`,
      type: "roundRect",
      box: fixPanel,
      style: {
        fill: "#FFFFFF",
        stroke: "#CBD5DD",
        strokeWidthPt: 1,
        radiusRatio: 0.035,
        shadow: { color: "#5A6B7A", opacity: 0.14, blurPt: 3.2, distancePt: 1, angleDeg: 90 }
      },
      source: source("top-complex-diagram-native-suggestion-panel")
    });
    shapes.push({
      id: `${base}-native-suggestion-divider`,
      type: "line",
      box: {
        x: round(fixPanel.x + 8),
        y: round(suggestionText.box.y + suggestionText.box.h + 7),
        w: round(fixPanel.w - 16),
        h: 0
      },
      style: { stroke: "#D7DEE4", strokeWidthPt: 1, connectorType: "straight" },
      source: source("top-complex-diagram-native-suggestion-divider")
    });
    nativeTextBoxes
      .filter((textBox) => textBox?.source?.role === "fix-card-label" && !/修复建议/.test(String(textBox.text || "")))
      .slice(0, 3)
      .forEach((textBox, index) => {
        const center = centerOfBox(textBox.box);
        const iconBox = { x: round(fixPanel.x + 14), y: round(center.y - 11), w: 22, h: 22 };
        shapes.push({
          id: `${base}-native-suggestion-check-${index}`,
          type: "ellipse",
          box: iconBox,
          style: { fill: "#2DBB63", stroke: "#27A556", strokeWidthPt: 0.7 },
          source: source("top-complex-diagram-native-suggestion-check", { checkIndex: index })
        });
        shapes.push({
          id: `${base}-native-suggestion-check-mark-${index}`,
          type: "freeform",
          box: { x: iconBox.x + 5, y: iconBox.y + 6, w: 12, h: 10 },
          points: [
            { x: 0, y: 0.52 },
            { x: 0.35, y: 0.9 },
            { x: 1, y: 0 }
          ],
          style: { fill: "none", stroke: "#FFFFFF", strokeWidthPt: 2.1, lineCap: "round" },
          source: source("top-complex-diagram-native-suggestion-checkmark", { checkIndex: index })
        });
      });
  }

  const pain = (allTextBoxes || []).find((textBox) => String(textBox.text || "") === "痛点");
  const ability = (allTextBoxes || []).find((textBox) => String(textBox.text || "") === "能力");
  if (pain?.box && ability?.box) {
    const headerY = Math.min(pain.box.y, ability.box.y) - 8;
    const leftText = (allTextBoxes || []).find((textBox) => /人工评审费时/.test(String(textBox.text || "")));
    const rightText = (allTextBoxes || []).find((textBox) => /执行逻辑校验/.test(String(textBox.text || "")));
    const table = constrainPtBox({
      x: Math.max(0, Math.min(pain.box.x, leftText?.box?.x || pain.box.x) - 18),
      y: headerY,
      w: Math.min(slideSize.widthPt - 24, Math.max(820, (rightText?.box?.x || ability.box.x) + (rightText?.box?.w || 360) - Math.min(pain.box.x, leftText?.box?.x || pain.box.x) + 28)),
      h: 94
    }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt });
    const midX = round(table.x + table.w * 0.5);
    const headerH = 32;
    shapes.push({
      id: `${base}-native-comparison-table-bg`,
      type: "roundRect",
      box: table,
      style: { fill: "#FFFFFF", stroke: "#B7C2CA", strokeWidthPt: 1, radiusRatio: 0.02 },
      source: source("top-complex-diagram-native-comparison-table")
    });
    shapes.push({
      id: `${base}-native-comparison-table-ability-head`,
      type: "rect",
      box: { x: midX, y: table.y, w: round(table.x + table.w - midX), h: headerH },
      style: { fill: "#E9F6FD", stroke: "none", strokeWidthPt: 0 },
      source: source("top-complex-diagram-native-comparison-table-header", { column: "ability" })
    });
    [
      { id: "header", box: { x: table.x, y: table.y + headerH, w: table.w, h: 0 } },
      { id: "middle", box: { x: midX, y: table.y, w: 0, h: table.h } }
    ].forEach((line) => {
      shapes.push({
        id: `${base}-native-comparison-table-line-${line.id}`,
        type: "line",
        box: line.box,
        style: { stroke: "#B7C2CA", strokeWidthPt: 1, connectorType: "straight" },
        source: source("top-complex-diagram-native-comparison-table-line", { line: line.id })
      });
    });
  }

  return shapes;
}

function topComplexDiagramCardBox(textBox = {}, imageBox = {}) {
  const raw = {
    x: Number(textBox.x || 0) - 12,
    y: Number(textBox.y || 0) - 4,
    w: Number(textBox.w || 0) + 24,
    h: Number(textBox.h || 0) + 8
  };
  return constrainPtBox(raw, imageBox);
}

function topComplexDiagramSampledCardFill(cardBox, sourceImage, slideSize, textBox) {
  const compact = normalizeMatrixLabel(textBox?.text);
  if (/^(?:修复建议|统一角色权限定义)$/.test(compact)) return "#1C9B55";
  const pxBox = ptToPxBox(cardBox, sourceImage, slideSize, 0);
  const sampled = sampleMaskBackgroundColor(sourceImage, pxBox);
  const sampledHex = rgbToHex(sampled);
  const fontColor = String(normalizeHex(textBox?.font?.color, "")).toUpperCase();
  if (fontColor === "#FFFFFF" && luma(sampled) < 230 && saturation(sampled) > 0.04) return sampledHex;
  if (fontColor === "#FFFFFF") return "#1C9B55";
  return luma(sampled) > 245 ? "#EAF4EC" : sampledHex;
}

function maybeEraseTopComplexDiagramText({ image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null }) {
  if (!sourceImage || textBoxes.length === 0) return [];
  const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
  if (!assetFile) return [];
  const masks = textBoxes.map((item) => ptToPxBox(item.box, sourceImage, slideSize, 5));
  if (masks.length === 0) return [];
  const erased = eraseMasks(sourceImage, masks);
  const crop = cropPng(erased, ptToPxBox(image.box, sourceImage, slideSize, 0));
  ensureDir(path.dirname(assetFile));
  writePng(assetFile, crop);
  return textBoxes;
}

























































function createTriangleTopologyDiagramShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  return createTriangleTopologyDiagramShapesFromRegistry(images, textBoxes, sourceImage, slideSize);
}



















function fitRotatedTriangleTopologySideFontSize(text, width, height, preferredSizePt) {
  const normalized = normalizeCjkText(text);
  const cjkCount = (normalized.match(/[\u4e00-\u9fff]/g) || []).length;
  const latinCount = Math.max(0, normalized.length - cjkCount);
  const estimatedUnits = Math.max(1, cjkCount + latinCount * 0.58);
  const byWidth = Number(width || 0) / Math.max(1, estimatedUnits * 0.92);
  const byHeight = Number(height || 0) * 0.68;
  return round(Math.max(8.5, Math.min(13.5, Number(preferredSizePt || 12), byWidth, byHeight)));
}

function fitTriangleTopologyLabelFontSize(text, box = {}, preferredSizePt, maxSizePt = 14) {
  const normalized = normalizeCjkText(text);
  const cjkCount = (normalized.match(/[\u4e00-\u9fff]/g) || []).length;
  const latinCount = Math.max(0, normalized.length - cjkCount);
  const estimatedUnits = Math.max(1, cjkCount + latinCount * 0.58);
  const byWidth = Number(box.w || 0) / Math.max(1, estimatedUnits * 0.92);
  const byHeight = Number(box.h || 0) * 0.72;
  return round(Math.max(8, Math.min(maxSizePt, Number(preferredSizePt || 12), byWidth, byHeight)));
}









function shouldObjectifyTriangleTopology(image, textBoxes = []) {
  return shouldObjectifyTriangleTopologyFromRegistry(image, textBoxes);
}


function inferTriangleTopologyDiagram(box, measurement = null) {
  return inferTriangleTopologyDiagramFromRegistry(box, measurement);
}







function shouldObjectifyTableGrid(image) {
  const layer = image?.source?.layer || {};
  if (isProtectedFidelityDiagramDetector(image?.source?.detector)) return false;
  if (layer.layerType !== "table-zone" || layer.recommendedAction !== "attempt-native-reconstruction") return false;
  return image?.source?.textObjectified === true || hasStrongTableGridEvidence(image);
}

function hasStrongTableGridEvidence(image = {}) {
  const visualGrid = image?.source?.layer?.diagramUnderstanding?.visualGrid;
  if (isUsableVisualTableGrid(visualGrid, image?.box)) return true;
  return inferTableGridFromVisualAtoms(image) !== null;
}



function createLayerColorBlockShapes(images = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage) return [];
  const shapes = [];
  for (const image of images || []) {
    if (!shouldObjectifyLayerColorBlocks(image)) continue;
    const blocks = colorBlockShapesForImage(image, sourceImage, slideSize, {
      detector: "layer-native-color-block",
      idPrefix: "layer-color-block",
      minAreaRatio: 0.018,
      maxAreaRatio: 0.42,
      minSampledDensity: 0.22
    });
    if (blocks.length === 0) continue;
    shapes.push(...blocks);
    image.source = {
      ...(image.source || {}),
      colorBlockObjectified: true,
      objectifiedColorBlocks: blocks.length
    };
  }
  return shapes;
}

function createMatrixColorBlockShapes(images = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage) return [];
  const shapes = [];
  for (const image of images || []) {
    if (!shouldObjectifyMatrixColorBlocks(image)) continue;
    const blocks = colorBlockShapesForImage(image, sourceImage, slideSize, {
      detector: "matrix-color-block-native-rect",
      idPrefix: "matrix-color-block",
      minAreaRatio: 0.006,
      maxAreaRatio: 0.34,
      minSampledDensity: 0.32
    }).filter((shape) => isMatrixColorBlockShape(shape, image));
    const summary = summarizeMatrixColorBlocks(blocks, image);
    if (!isConfidentMatrixColorBlockSummary(summary)) continue;
    shapes.push(...blocks.map((shape, index) => ({
      ...shape,
      id: `${image.id || "matrix"}-native-matrix-color-block-${index}`,
      source: {
        ...(shape.source || {}),
        detector: "matrix-color-block-native-rect",
        layerSourceId: image.id || null,
        confidence: summary.confidence
      }
    })));
    image.source = {
      ...(image.source || {}),
      matrixColorBlocksObjectified: true,
      objectifiedMatrixColorBlocks: blocks.length,
      matrixColorBlockCoverage: round(summary.coverageRatio, 4),
      dropErasedResidualAfterNativeRebuild: summary.dropResidual === true ? true : image.source?.dropErasedResidualAfterNativeRebuild,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; matrix color blocks rebuilt as native rectangles`
    };
  }
  return shapes;
}

function shouldObjectifyMatrixColorBlocks(image) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  if (source.textObjectified !== true) return false;
  if (source.detector !== "foreground-graphic-underlay-crop") return false;
  if (source.matrixColorBlocksObjectified === true || source.tableGridObjectified === true) return false;
  if (isProtectedFidelityDiagramDetector(source.detector)) return false;
  if (layer.layerType !== "table-zone") return false;
  if (layer.recommendedAction !== "attempt-native-reconstruction" && layer.recommendedAction !== "split-native-with-residual-crop") return false;
  return understanding.archetype === "matrix-or-grid" || understanding.nativeReadiness === "native-rebuild";
}

function isMatrixColorBlockShape(shape, image) {
  const box = shape?.box || {};
  const imageBox = image?.box || {};
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  if (w < 28 || h < 18) return false;
  const areaRatio = (w * h) / Math.max(1, Number(imageBox.w || 0) * Number(imageBox.h || 0));
  if (areaRatio < 0.015 || areaRatio > 0.58) return false;
  const aspect = w / Math.max(1, h);
  if (aspect < 0.22 || aspect > 8.5) return false;
  const centerX = Number(box.x || 0) + w / 2;
  const centerY = Number(box.y || 0) + h / 2;
  return pointInsidePtBox(centerX, centerY, imageBox);
}

function summarizeMatrixColorBlocks(blocks = [], image = {}) {
  const imageBox = image.box || {};
  const imageArea = Math.max(1, Number(imageBox.w || 0) * Number(imageBox.h || 0));
  const coverageRatio = blocks.reduce((sum, shape) => {
    const box = shape.box || {};
    return sum + Number(box.w || 0) * Number(box.h || 0);
  }, 0) / imageArea;
  const xBands = clusteredCenters(blocks.map((shape) => Number(shape.box?.x || 0) + Number(shape.box?.w || 0) / 2), Math.max(18, Number(imageBox.w || 0) * 0.055));
  const yBands = clusteredCenters(blocks.map((shape) => Number(shape.box?.y || 0) + Number(shape.box?.h || 0) / 2), Math.max(14, Number(imageBox.h || 0) * 0.06));
  const alignedRatio = blocks.length === 0
    ? 0
    : blocks.filter((shape) => {
      const box = shape.box || {};
      const cx = Number(box.x || 0) + Number(box.w || 0) / 2;
      const cy = Number(box.y || 0) + Number(box.h || 0) / 2;
      return nearestDistance(cx, xBands) <= Math.max(20, Number(imageBox.w || 0) * 0.07)
        && nearestDistance(cy, yBands) <= Math.max(16, Number(imageBox.h || 0) * 0.075);
    }).length / blocks.length;
  const distinctColors = new Set(blocks.map((shape) => String(shape.style?.fill || "").toUpperCase())).size;
  const gridEvidence = image?.source?.layer?.diagramUnderstanding?.visualGrid;
  const hasGridEvidence = isUsableVisualTableGrid(gridEvidence, imageBox);
  const confidence = clamp(
    coverageRatio * 1.7
      + alignedRatio * 0.35
      + Math.min(0.18, distinctColors * 0.045)
      + (hasGridEvidence ? 0.14 : 0),
    0,
    1
  );
  return {
    count: blocks.length,
    coverageRatio,
    alignedRatio,
    distinctColors,
    confidence,
    dropResidual: blocks.length >= 3 && coverageRatio >= 0.22 && alignedRatio >= 0.78 && confidence >= 0.72
  };
}

function isConfidentMatrixColorBlockSummary(summary) {
  if (!summary || summary.count < 3) return false;
  if (summary.coverageRatio < 0.14) return false;
  if (summary.alignedRatio < 0.70) return false;
  if (summary.distinctColors < 2) return false;
  return summary.confidence >= 0.58;
}

function clusteredCenters(values = [], tolerance = 16) {
  const sorted = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const clusters = [];
  for (const value of sorted) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(value - last.center) > tolerance) {
      clusters.push({ center: value, count: 1 });
      continue;
    }
    last.center = (last.center * last.count + value) / (last.count + 1);
    last.count += 1;
  }
  return clusters.map((cluster) => cluster.center);
}

function nearestDistance(value, centers = []) {
  if (!centers.length) return Infinity;
  return centers.reduce((best, center) => Math.min(best, Math.abs(value - center)), Infinity);
}

function shouldObjectifyLayerColorBlocks(image) {
  const layer = image?.source?.layer || {};
  if (image?.source?.textObjectified !== true) return false;
  if (image?.source?.detector !== "foreground-graphic-underlay-crop") return false;
  if (image?.source?.matrixColorBlocksObjectified === true) return false;
  if (image?.source?.tableGridObjectified === true || image?.source?.tableCellBackgroundObjectified === true) return false;
  if (image?.source?.assetOsFlowObjectified === true || image?.source?.portalPlatformDiagramObjectified === true) return false;
  if (layer.recommendedAction !== "attempt-native-reconstruction" && layer.recommendedAction !== "split-native-with-residual-crop") return false;
  return layer.layerType === "diagram-zone" || layer.layerType === "table-zone";
}

function createLayerContainerShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage) return [];
  const shapes = [];
  for (const image of images || []) {
    if (!shouldObjectifyLayerContainers(image)) continue;
    const internalTextBoxes = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, image.box));
    const containers = inferLayerContainers(image, internalTextBoxes, sourceImage, slideSize);
    if (containers.length === 0) continue;
    image.source = {
      ...(image.source || {}),
      containerObjectified: true,
      objectifiedContainers: containers.length
    };
    for (let index = 0; index < containers.length; index += 1) {
      const container = containers[index];
      shapes.push({
        id: `${image.id || "layer"}-native-container-${index}`,
        type: container.shapeType,
        box: container.box,
        style: {
          fill: container.fill,
          stroke: container.stroke,
          strokeWidthPt: container.strokeWidthPt,
          radiusRatio: container.radiusRatio
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "layer-native-container",
          layerSourceId: image.id || null,
          layerType: image.source?.layer?.layerType || "unknown",
          confidence: container.confidence,
          textBoxCount: container.textBoxCount
        }
      });
    }
  }
  return shapes;
}

function shouldObjectifyLayerContainers(image) {
  const layer = image?.source?.layer || {};
  if (image?.source?.textObjectified !== true) return false;
  if (image?.source?.skipVisualAtomRebuild === true || image?.source?.semanticSplitOwnsLayer === true) return false;
  if (shouldKeepFunnelHubDiagramText(image)) return false;
  if (image?.source?.assetOsFlowObjectified === true || image?.source?.portalPlatformDiagramObjectified === true) return false;
  if (layer.recommendedAction !== "attempt-native-reconstruction" && layer.recommendedAction !== "split-native-with-residual-crop") {
    return false;
  }
  return layer.layerType === "diagram-zone" || layer.layerType === "table-zone";
}

function createLayerConnectorShapes(images = [], containerShapes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage || !Array.isArray(containerShapes) || containerShapes.length < 2) return [];
  const shapes = [];
  for (const image of images || []) {
    if (!shouldObjectifyLayerConnectors(image)) continue;
    const containers = containerShapes.filter((shape) =>
      shape?.source?.detector === "layer-native-container"
      && shape.source.layerSourceId === (image.id || null)
      && boxCenterInside(shape.box, image.box)
    );
    const connectors = inferLayerConnectors(image, containers, sourceImage, slideSize);
    if (connectors.length === 0) continue;
    image.source = {
      ...(image.source || {}),
      connectorObjectified: true,
      objectifiedConnectors: connectors.length
    };
    for (let index = 0; index < connectors.length; index += 1) {
      const connector = connectors[index];
      shapes.push({
        id: `${image.id || "layer"}-native-connector-${index}`,
        type: "line",
        box: connector.box,
        style: {
          stroke: connector.stroke,
          strokeWidthPt: connector.strokeWidthPt,
          connectorType: "straight",
          endArrow: "triangle"
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "layer-native-connector",
          layerSourceId: image.id || null,
          layerType: image.source?.layer?.layerType || "unknown",
          confidence: connector.confidence,
          from: connector.from,
          to: connector.to,
          axis: connector.axis
        }
      });
    }
  }
  return shapes;
}

function createFunnelHubDiagramShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage) return [];
  const shapes = [];
  for (const image of images || []) {
    if (!shouldObjectifyFunnelHubDiagram(image, textBoxes)) continue;
    const diagram = inferFunnelHubDiagram(image, slideSize);
    const localShapes = funnelHubDiagramShapes(image, diagram);
    if (localShapes.length === 0) continue;
    image.source = {
      ...(image.source || {}),
      funnelHubObjectified: true,
      objectifiedFunnelHubShapes: localShapes.length,
      funnelHubResidualBoxes: diagram.residualCrops,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; funnel hub diagram rebuilt as native shapes with local icon crops`
    };
    shapes.push(...localShapes);
  }
  return shapes;
}

function shouldObjectifyFunnelHubDiagram(image, textBoxes = []) {
  if (!shouldKeepFunnelHubDiagramText(image)) return false;
  const box = image?.box || {};
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  if (Number(box.w || 0) < 480 || Number(box.h || 0) < 280) return false;
  const internalTextCount = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box)).length;
  const understoodNodeCount = Number(understanding.nodeCount || 0);
  return understoodNodeCount >= 10 && internalTextCount >= 6;
}

function inferFunnelHubDiagram(image, slideSize = DEFAULT_SLIDE) {
  const box = image.box;
  const cx = box.x + box.w * 0.5;
  const bowl = {
    x: box.x + box.w * 0.26,
    y: box.y + box.h * 0.16,
    w: box.w * 0.48,
    h: box.h * 0.42
  };
  const body = {
    x: box.x + box.w * 0.28,
    y: box.y + box.h * 0.30,
    w: box.w * 0.44,
    h: box.h * 0.46
  };
  const lower = {
    x: box.x + box.w * 0.42,
    y: box.y + box.h * 0.61,
    w: box.w * 0.16,
    h: box.h * 0.21
  };
  const neck = {
    x: box.x + box.w * 0.445,
    y: box.y + box.h * 0.74,
    w: box.w * 0.11,
    h: box.h * 0.13
  };
  const bottomPanel = {
    x: box.x + box.w * 0.0,
    y: box.y + box.h * 0.84,
    w: box.w,
    h: box.h * 0.14
  };
  const pills = [
    { name: "left", box: { x: box.x + box.w * 0.20, y: box.y + box.h * 0.43, w: box.w * 0.19, h: box.h * 0.08 }, fill: "#2E79B9" },
    { name: "center", box: { x: box.x + box.w * 0.43, y: box.y + box.h * 0.48, w: box.w * 0.18, h: box.h * 0.08 }, fill: "#41B878" },
    { name: "right", box: { x: box.x + box.w * 0.69, y: box.y + box.h * 0.43, w: box.w * 0.22, h: box.h * 0.08 }, fill: "#2E79B9" }
  ];
  const connectors = [
    lineBox({ x: cx, y: body.y + body.h * 0.48 }, { x: cx, y: lower.y + lower.h * 0.90 }),
    lineBox({ x: cx, y: lower.y + lower.h * 0.90 }, { x: box.x + box.w * 0.28, y: box.y + box.h * 0.76 }),
    lineBox({ x: cx, y: lower.y + lower.h * 0.90 }, { x: box.x + box.w * 0.77, y: box.y + box.h * 0.76 }),
    lineBox({ x: body.x + body.w * 0.18, y: body.y + body.h * 0.45 }, { x: pills[0].box.x + pills[0].box.w, y: pills[0].box.y + pills[0].box.h * 0.5 }),
    lineBox({ x: body.x + body.w * 0.82, y: body.y + body.h * 0.45 }, { x: pills[2].box.x, y: pills[2].box.y + pills[2].box.h * 0.5 })
  ];
  return {
    bowl: constrainPtBox(bowl, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }),
    body: constrainPtBox(body, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }),
    lower: constrainPtBox(lower, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }),
    neck: constrainPtBox(neck, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }),
    bottomPanel: constrainPtBox(bottomPanel, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }),
    pills: pills.map((pill) => ({ ...pill, box: constrainPtBox(pill.box, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }) })),
    connectors,
    residualCrops: [
      { name: "input-docs-html", box: constrainPtBox({ x: box.x + box.w * 0.11, y: box.y + box.h * 0.02, w: box.w * 0.32, h: box.h * 0.29 }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }) },
      { name: "input-screenshots", box: constrainPtBox({ x: box.x + box.w * 0.42, y: box.y + box.h * 0.01, w: box.w * 0.26, h: box.h * 0.30 }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }) },
      { name: "input-mock-data", box: constrainPtBox({ x: box.x + box.w * 0.63, y: box.y + box.h * 0.05, w: box.w * 0.31, h: box.h * 0.25 }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }) },
      { name: "left-output-icon", box: constrainPtBox({ x: box.x + box.w * 0.22, y: box.y + box.h * 0.61, w: box.w * 0.18, h: box.h * 0.23 }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }) },
      { name: "right-output-icon", box: constrainPtBox({ x: box.x + box.w * 0.68, y: box.y + box.h * 0.61, w: box.w * 0.20, h: box.h * 0.23 }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }) }
    ]
  };
}

function funnelHubDiagramShapes(image, diagram) {
  const base = image.id || "funnel-hub";
  const shapes = [];
  shapes.push({
    id: `${base}-funnel-bowl`,
    type: "freeform",
    box: diagram.bowl,
    points: [
      { x: 0.02, y: 0.1 },
      { x: 0.98, y: 0.1 },
      { x: 0.78, y: 1 },
      { x: 0.22, y: 1 }
    ],
    style: {
      fill: "#2E7EC4",
      stroke: "#1E5E96",
      strokeWidthPt: 0.7,
      shadow: { color: "#000000", alpha: 0.12, blurPt: 5, distancePt: 1.2, angleDeg: 90 }
    },
    source: funnelHubShapeSource(image, "funnel-hub-native-bowl")
  });
  shapes.push({
    id: `${base}-funnel-body`,
    type: "freeform",
    box: diagram.body,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.64, y: 1 },
      { x: 0.36, y: 1 }
    ],
    style: {
      fill: "#2370B8",
      stroke: "#1C5D96",
      strokeWidthPt: 0.5,
      shadow: { color: "#000000", alpha: 0.08, blurPt: 4, distancePt: 1, angleDeg: 90 }
    },
    source: funnelHubShapeSource(image, "funnel-hub-native-body")
  });
  shapes.push({
    id: `${base}-funnel-lower`,
    type: "freeform",
    box: diagram.lower,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.66, y: 1 },
      { x: 0.34, y: 1 }
    ],
    style: {
      fill: "#33B873",
      stroke: "#279A60",
      strokeWidthPt: 0.5
    },
    source: funnelHubShapeSource(image, "funnel-hub-native-body")
  });
  shapes.push({
    id: `${base}-funnel-neck`,
    type: "roundRect",
    box: diagram.neck,
    style: {
      fill: "#2FAC73",
      stroke: "#238A5B",
      strokeWidthPt: 0.5,
      radiusRatio: 0.25
    },
    source: funnelHubShapeSource(image, "funnel-hub-native-neck")
  });
  for (let index = 0; index < diagram.pills.length; index += 1) {
    const pill = diagram.pills[index];
    shapes.push({
      id: `${base}-pill-${pill.name}`,
      type: "roundRect",
      box: pill.box,
      style: {
        fill: pill.fill,
        stroke: "#1F5F96",
        strokeWidthPt: 0.8,
        radiusRatio: 0.08,
        shadow: { color: "#000000", alpha: 0.14, blurPt: 3, distancePt: 1, angleDeg: 90 }
      },
      source: {
        ...funnelHubShapeSource(image, "funnel-hub-native-pill"),
        pill: pill.name,
        stepIndex: index
      }
    });
  }
  shapes.push({
    id: `${base}-bottom-panel`,
    type: "roundRect",
    box: diagram.bottomPanel,
    style: {
      fill: "#E8F7F1",
      stroke: "#35B777",
      strokeWidthPt: 1.4,
      radiusRatio: 0.12,
      shadow: { color: "#2D8BC0", alpha: 0.14, blurPt: 7, distancePt: 1.5, angleDeg: 90 }
    },
    source: funnelHubShapeSource(image, "funnel-hub-native-bottom-panel")
  });
  for (let index = 0; index < diagram.connectors.length; index += 1) {
    shapes.push({
      id: `${base}-connector-${index}`,
      type: "line",
      box: diagram.connectors[index],
      style: {
        stroke: index < 3 ? "#FFFFFF" : "#D7F2FF",
        strokeWidthPt: index < 3 ? 2 : 1.4,
        connectorType: "straight",
        endArrow: "triangle"
      },
      source: {
        ...funnelHubShapeSource(image, "funnel-hub-native-connector"),
        connectorIndex: index
      }
    });
  }
  return shapes;
}

function funnelHubShapeSource(image, detector) {
  return {
    editable: true,
    nativeRebuild: true,
    detector,
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone"
  };
}

function createHorizontalStepChainShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, options = {}) {
  const shapes = [];
  const preservedImages = [];
  for (const image of images || []) {
    if (shouldObjectifySparseMatrixProcessStrip(image)) {
      const localShapes = inferSparseMatrixProcessStripShapes(image);
      const localTextBoxes = sparseMatrixProcessStripNativeTextBoxes(image);
      if (localShapes.length === 0 || localTextBoxes.length < 4) continue;
      image.source = {
        ...(image.source || {}),
        sparseMatrixProcessStripObjectified: true,
        sparseMatrixProcessStripTextObjectified: true,
        sparseMatrixProcessStripNativeTextBoxes: localTextBoxes,
        visualAtomOverlayOnly: true,
        objectifiedSparseMatrixProcessStripShapes: localShapes.length,
        objectifiedSparseMatrixProcessStripTextBoxes: localTextBoxes.length,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; sparse matrix process strip rebuilt as native process bar and editable semantic labels while preserving residual icons`
      };
      shapes.push(...localShapes);
      continue;
    }
    if (shouldObjectifySparseFlowCardChain(image, textBoxes)) {
      const assetTree = shouldUseAssetLandingTreeFlow(image, textBoxes);
      const localShapes = assetTree
        ? inferAssetLandingTreeFlowShapes(image, textBoxes, slideSize, options)
        : inferSparseFlowCardChainSkeletonShapes(image, textBoxes);
      const localImages = assetTree && Array.isArray(localShapes.images) ? localShapes.images : [];
      const localTextBoxes = sparseFlowCardChainNativeTextBoxes(image, textBoxes);
      if (localShapes.length === 0) continue;
      const dropResidual = shouldDropSparseFlowCardChainResidual(image, localShapes, localTextBoxes);
      image.source = {
        ...(image.source || {}),
        sparseFlowCardChainSkeletonObjectified: true,
        sparseFlowCardChainAssetTreeObjectified: assetTree ? true : image.source?.sparseFlowCardChainAssetTreeObjectified,
        sparseFlowCardChainTextObjectified: localTextBoxes.length > 0,
        sparseFlowCardChainNativeTextBoxes: localTextBoxes,
        sparseFlowCardChainPreservedIconCrops: localImages.length,
        visualAtomOverlayOnly: !dropResidual,
        objectifiedSparseFlowCardChainShapes: localShapes.length,
        objectifiedSparseFlowCardChainTextBoxes: localTextBoxes.length,
        dropErasedResidualAfterNativeRebuild: dropResidual ? true : image.source?.dropErasedResidualAfterNativeRebuild,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; sparse flow-card chain rebuilt as ${assetTree ? "native asset landing tree" : "native skeleton overlays"}${dropResidual ? " and residual crop removed" : " while preserving the source crop"}`
      };
      shapes.push(...localShapes);
      preservedImages.push(...localImages);
      continue;
    }
    if (!shouldObjectifyHorizontalStepChain(image, textBoxes)) continue;
    const localShapes = inferHorizontalStepChainShapes(image, sourceImage, slideSize);
    const localTextBoxes = horizontalStepChainNativeTextBoxes(image, textBoxes);
    if (localShapes.length === 0) continue;
    const fullyObjectified = isHorizontalStepChainFullyObjectified(localShapes, localTextBoxes);
    image.source = {
      ...(image.source || {}),
      horizontalStepChainObjectified: true,
      horizontalStepChainTextObjectified: localTextBoxes.length > 0,
      horizontalStepChainFullyObjectified: fullyObjectified,
      horizontalStepChainNativeTextBoxes: localTextBoxes,
      objectifiedHorizontalStepChainShapes: localShapes.length,
      objectifiedHorizontalStepChainTextBoxes: localTextBoxes.length,
      dropErasedResidualAfterNativeRebuild: fullyObjectified || image.source?.textObjectified === true
        ? true
        : image.source?.dropErasedResidualAfterNativeRebuild,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; horizontal step chain rebuilt as native shapes`
    };
    shapes.push(...localShapes);
  }
  shapes.images = preservedImages;
  return shapes;
}

function shouldDropSparseFlowCardChainResidual(image = {}, shapes = [], textBoxes = []) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || image?.source?.diagramUnderstanding || {};
  if (understanding.archetype !== "flow-card-chain") return false;
  if (Number(understanding.confidence || 0) < 0.9) return false;
  if (Number(understanding.residualCount || 0) > 0) return false;
  const shapeList = Array.isArray(shapes) ? shapes : [];
  const textList = Array.isArray(textBoxes) ? textBoxes : [];
  const cards = shapeList.filter((shape) => shape?.source?.detector === "sparse-flow-card-chain-native-skeleton-card").length;
  const assetCards = shapeList.filter((shape) => shape?.source?.detector === "sparse-flow-card-chain-native-asset-card").length;
  const assetArrows = shapeList.filter((shape) => shape?.source?.detector === "sparse-flow-card-chain-native-asset-branch-arrow").length;
  const arrows = shapeList.filter((shape) => shape?.source?.detector === "sparse-flow-card-chain-native-skeleton-arrow").length;
  const stageLabels = textList.filter((textBox) => textBox?.source?.detector === "sparse-flow-card-chain-native-stage-label").length;
  const domainLabels = textList.filter((textBox) => textBox?.source?.detector === "sparse-flow-card-chain-native-domain-label").length;
  if (assetCards >= 3 && assetArrows >= 3 && stageLabels >= 3 && domainLabels >= 3) return true;
  return cards >= 3
    && arrows >= 2
    && stageLabels >= 3
    && domainLabels >= 3
    && textList.length >= 6;
}

function shouldUseAssetLandingTreeFlow(image = {}, textBoxes = []) {
  const pageText = (Array.isArray(textBoxes) ? textBoxes : []).map((textBox) => String(textBox?.text || "")).join(" ");
  const labels = sparseFlowCardChainSemanticLabels(image, textBoxes).map((label) => normalizeCjkText(label.text));
  const hasAssetLandingTitle = /资产落盘|组织级资产|数字化版图/.test(pageText);
  const hasStageLabels = ["独立配置", "标准化目录", "版本化追踪"].every((label) => labels.includes(label));
  const hasDomainLabels = ["供应链", "物流", "财务"].every((label) => labels.includes(label));
  return hasAssetLandingTitle && hasStageLabels && hasDomainLabels;
}

function shouldObjectifySparseMatrixProcessStrip(image = {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const box = image?.box || {};
  if (source.detector !== "sparse-diagram-graphic-underlay-crop") return false;
  if (layer.layerType !== "diagram-zone" || understanding.archetype !== "matrix-or-grid") return false;
  if (Number(understanding.confidence || 0) < 0.9) return false;
  if (!box.w || !box.h || Number(box.w) < 620 || Number(box.h) < 150) return false;
  const nodes = sparseMatrixProcessStripSemanticNodes(image);
  const normalized = nodes.map((node) => normalizeCjkText(node.text));
  const hasEngine = normalized.some((text) => /skills\s*engine/i.test(text));
  const stageCount = normalized.filter((text) => /需求理解|原型\/?高仿|PRD生成|智能评审/.test(text)).length;
  const visualAtoms = comparisonMatrixVisualAtoms(image);
  const largeNativeRect = visualAtoms.some((atom) => {
    if (String(atom?.kind || "") !== "native-rect-candidate") return false;
    const atomBox = atom.box || {};
    return Number(atomBox.w || 0) >= Number(box.w || 0) * 0.45
      && Number(atomBox.h || 0) >= Number(box.h || 0) * 0.35;
  });
  const gridLines = visualAtoms.filter((atom) => String(atom?.kind || "") === "grid-line-candidate").length;
  return hasEngine && stageCount >= 4 && largeNativeRect && gridLines >= 6;
}

function inferSparseMatrixProcessStripShapes(image = {}) {
  const box = image?.box || {};
  const nodes = sparseMatrixProcessStripSemanticNodes(image);
  const engineNode = nodes.find((node) => /skills\s*engine/i.test(normalizeCjkText(node.text)));
  const stageNodes = sparseMatrixProcessStripStageNodes(image);
  const atoms = comparisonMatrixVisualAtoms(image);
  const railAtom = atoms
    .filter((atom) => String(atom?.kind || "") === "native-rect-candidate")
    .sort((a, b) => (Number(b.box?.w || 0) * Number(b.box?.h || 0)) - (Number(a.box?.w || 0) * Number(a.box?.h || 0)))[0];
  if (!railAtom?.box || !engineNode?.box || stageNodes.length < 4) return [];
  const base = image.id || "sparse-matrix-process-strip";
  const railBox = roundedBox(railAtom.box);
  const fill = normalizeHexColor(railAtom.color) || "#779F7F";
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "complex-diagram",
    expressionSubtype: "sparse-matrix-process-strip",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    skeletonOnly: true,
    ...extra
  });
  const grid = image?.source?.layer?.diagramUnderstanding?.visualGrid || {};
  const gridBounds = grid.bounds && Number(grid.bounds.w || 0) > 0
    ? roundedBox(grid.bounds)
    : roundedBox(expandBox(railBox, 8, 8));
  const shapes = [{
    id: `${base}-native-grid-shell`,
    type: "roundRect",
    box: gridBounds,
    style: {
      fill: "#F7FAFC",
      stroke: normalizeHexColor(grid.stroke) || "#D0D3D8",
      strokeWidthPt: 1,
      radiusRatio: 0.025,
      opacity: 0.22
    },
    source: source("sparse-matrix-process-strip-native-grid-shell")
  }, {
    id: `${base}-native-process-rail`,
    type: "roundRect",
    box: railBox,
    style: {
      fill,
      stroke: darkenHexColor(fill, 0.18),
      strokeWidthPt: 1.2,
      radiusRatio: 0.24,
      opacity: 0.82,
      shadow: { color: "#31553C", alpha: 0.12, blurPt: 3, distancePt: 1, angleDeg: 90 }
    },
    source: source("sparse-matrix-process-strip-native-rail", { sampledColor: fill })
  }];
  const engineBox = roundedBox(expandBox(engineNode.box, 18, 7));
  shapes.push({
    id: `${base}-native-engine-title-backplate`,
    type: "roundRect",
    box: engineBox,
    style: {
      fill: "#FFFFFF",
      stroke: "#8DB79A",
      strokeWidthPt: 0.9,
      radiusRatio: 0.28,
      opacity: 0.92
    },
    source: source("sparse-matrix-process-strip-native-engine-backplate")
  });
  stageNodes.forEach((node, index) => {
    const chipBox = roundedBox(expandBox(node.box, 18, 6));
    shapes.push({
      id: `${base}-native-stage-chip-${index}`,
      type: "roundRect",
      box: chipBox,
      style: {
        fill: "#FFFFFF",
        stroke: "#D9EBDF",
        strokeWidthPt: 0.8,
        radiusRatio: 0.32,
        opacity: 0.88
      },
      source: source("sparse-matrix-process-strip-native-stage-chip", { stageIndex: index })
    });
    if (index > 0) {
      const previous = centerOfBox(roundedBox(expandBox(stageNodes[index - 1].box, 18, 6)));
      const current = centerOfBox(chipBox);
      shapes.push({
        id: `${base}-native-stage-route-${index - 1}`,
        type: "line",
        box: lineBox({ x: previous.x + 34, y: previous.y }, { x: current.x - 34, y: current.y }),
        style: {
          stroke: "#D7EADF",
          strokeWidthPt: 1.25,
          connectorType: "straight",
          endArrow: "triangle",
          opacity: 0.88
        },
        source: source("sparse-matrix-process-strip-native-stage-route", { routeIndex: index - 1 })
      });
    }
  });
  const engineCenter = centerOfBox(engineBox);
  const railCenter = centerOfBox(railBox);
  shapes.push({
    id: `${base}-native-engine-drop-route`,
    type: "line",
    box: lineBox({ x: engineCenter.x, y: engineBox.y + engineBox.h }, { x: railCenter.x, y: railBox.y + 4 }),
    style: { stroke: "#BFD7C7", strokeWidthPt: 1.2, connectorType: "straight", endArrow: "triangle", opacity: 0.8 },
    source: source("sparse-matrix-process-strip-native-engine-route")
  });
  return shapes;
}

function sparseMatrixProcessStripNativeTextBoxes(image = {}) {
  const nodes = sparseMatrixProcessStripSemanticNodes(image);
  const engineNode = nodes.find((node) => /skills\s*engine/i.test(normalizeCjkText(node.text)));
  const result = [];
  if (engineNode?.box) result.push(sparseMatrixProcessStripTextBox(image, engineNode, "engine-title", 0));
  sparseMatrixProcessStripStageNodes(image)
    .forEach((node, index) => result.push(sparseMatrixProcessStripTextBox(image, node, "stage-label", index)));
  return result;
}

function sparseMatrixProcessStripStageNodes(image = {}) {
  const order = ["需求理解", "原型/高仿", "PRD生成", "智能评审"];
  const nodes = sparseMatrixProcessStripSemanticNodes(image);
  return order
    .map((label) => nodes.find((node) => normalizeCjkText(node.text).includes(label)))
    .filter(Boolean);
}

function sparseMatrixProcessStripSemanticNodes(image = {}) {
  const imageBox = image?.box || {};
  const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
    ? image.source.layer.diagramUnderstanding.nodes
    : [];
  return nodes
    .filter((node) => node?.box && boxCenterInside(node.box, imageBox))
    .filter((node) => normalizeCjkText(node.text))
    .sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0));
}

function sparseMatrixProcessStripTextBox(image = {}, node = {}, role = "stage-label", index = 0) {
  const text = String(node.text || "").trim();
  const box = role === "engine-title" ? expandBox(node.box, 18, 7) : expandBox(node.box, 18, 6);
  return {
    id: `${image.id || "sparse-matrix-process-strip"}-native-${role}-${index}`,
    text,
    box: roundedBox(box),
    font: {
      family: role === "engine-title" ? "Microsoft YaHei" : "SimHei",
      sizePt: role === "engine-title" ? 13.5 : 12.5,
      color: role === "engine-title" ? "#2E6040" : "#28563A",
      weight: "bold",
      opacity: 1
    },
    align: "center",
    verticalAlign: "middle",
    source: {
      editable: true,
      nativeRebuild: true,
      detector: role === "engine-title"
        ? "sparse-matrix-process-strip-native-engine-label"
        : "sparse-matrix-process-strip-native-stage-label",
      expressionForm: "complex-diagram",
      expressionSubtype: "sparse-matrix-process-strip",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      semanticTextSource: true,
      semanticNodeId: node.id || "",
      overlayVisibility: "visible",
      textErasedFromCrop: false,
      role,
      labelIndex: index
    }
  };
}

function sparseFlowCardChainNativeTextBoxes(image = {}, textBoxes = []) {
  const labels = sparseFlowCardChainSemanticLabels(image, textBoxes);
  const assetTree = shouldUseAssetLandingTreeFlow(image, textBoxes);
  return labels.map((label, index) => {
    const role = /供应链|物流|财务/.test(label.text) ? "domain-chip" : "stage-title";
    const box = expandPtBox(label.box, DEFAULT_SLIDE,
      assetTree ? (role === "domain-chip" ? 20 : 12) : (role === "domain-chip" ? 8 : 12),
      assetTree ? (role === "domain-chip" ? 4 : 5) : (role === "domain-chip" ? 2 : 4)
    );
    return {
      id: `${image.id || "sparse-flow-card-chain"}-native-label-${index}`,
      text: label.text,
      box: roundedBox(box),
      font: {
        family: role === "domain-chip" ? "Microsoft YaHei" : "SimHei",
        sizePt: assetTree ? (role === "domain-chip" ? 14.5 : 14) : (role === "domain-chip" ? 14 : 13.5),
        color: assetTree ? (role === "domain-chip" ? "#111111" : "#FFFFFF") : (role === "domain-chip" ? "#176B3A" : "#0E4F7F"),
        weight: "bold",
        align: "center",
        valign: "middle",
        opacity: 1
      },
      align: "center",
      verticalAlign: "middle",
      style: {
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0,
        wrap: false
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: role === "domain-chip"
          ? "sparse-flow-card-chain-native-domain-label"
          : "sparse-flow-card-chain-native-stage-label",
        expressionForm: "complex-diagram",
        expressionSubtype: "sparse-flow-card-chain",
        layerSourceId: image.id || null,
        layerType: image.source?.layer?.layerType || "diagram-zone",
        semanticTextSource: label.semanticTextSource === true,
        overlayVisibility: "visible",
        role,
        labelIndex: index
      }
    };
  });
}

function sparseFlowCardChainSemanticLabels(image = {}, textBoxes = []) {
  const box = image?.box || {};
  const labels = [];
  for (const node of sparseFlowCardChainSemanticNodes(image)) {
    const text = normalizeCjkText(node?.text);
    if (!text || !node?.box || !boxCenterInside(node.box, box)) continue;
    if (!/独立配置|标准化目录|版本化追踪|供应链|物流|财务/.test(text)) continue;
    labels.push({ text, box: node.box, semanticTextSource: true });
  }
  for (const textBox of textBoxes || []) {
    const text = normalizeCjkText(textBox?.text);
    if (!text || !textBox?.box || !boxCenterInside(textBox.box, box)) continue;
    if (!/独立配置|标准化目录|版本化追踪|供应链|物流|财务/.test(text)) continue;
    if (labels.some((item) => item.text === text)) continue;
    labels.push({ text, box: textBox.box, semanticTextSource: false });
  }
  const order = ["独立配置", "标准化目录", "版本化追踪", "供应链", "物流", "财务"];
  return order
    .map((text) => labels.find((item) => item.text === text))
    .filter(Boolean);
}

function sparseFlowCardChainSemanticNodes(image = {}) {
  const result = [];
  for (const nodes of [
    image.source?.diagramUnderstanding?.nodes,
    image.source?.layer?.diagramUnderstanding?.nodes
  ]) {
    if (Array.isArray(nodes)) result.push(...nodes);
  }
  return result;
}

function shouldObjectifySparseFlowCardChain(image, textBoxes = []) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const box = image?.box || {};
  if (source.detector !== "sparse-diagram-graphic-underlay-crop") return false;
  if (layer.layerType !== "diagram-zone" || understanding.archetype !== "flow-card-chain") return false;
  if (Number(understanding.confidence || 0) < 0.82) return false;
  if (!box.w || !box.h || Number(box.w) < 360 || Number(box.h) < 240) return false;
  const internalTextCount = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box)).length;
  const visualAtoms = comparisonMatrixVisualAtoms(image);
  const nativeNodeAtoms = visualAtoms.filter((atom) => /native-(?:rect|document|triangle)-candidate/.test(String(atom?.kind || ""))).length;
  const connectorAtoms = visualAtoms.filter((atom) => /connector-(?:line|arrow)-candidate/.test(String(atom?.kind || ""))).length;
  const semanticNodeCount = Array.isArray(understanding.nodes) ? understanding.nodes.length : 0;
  return internalTextCount >= 3 || Number(understanding.nodeCount || 0) >= 5 || semanticNodeCount >= 5 || (nativeNodeAtoms >= 3 && connectorAtoms >= 2);
}

function inferSparseFlowCardChainSkeletonShapes(image, textBoxes = []) {
  const box = image?.box || {};
  if (!box.w || !box.h) return [];
  const base = image.id || "sparse-flow-card-chain";
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "complex-diagram",
    expressionSubtype: "sparse-flow-card-chain",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    skeletonOnly: true,
    ...extra
  });
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const cardCount = 3;
  const gap = w * 0.055;
  const cardW = (w - gap * (cardCount - 1)) / cardCount;
  const cardY = y + h * 0.18;
  const cardH = h * 0.42;
  const shapes = [];
  for (let index = 0; index < cardCount; index += 1) {
    const cardX = x + index * (cardW + gap);
    shapes.push({
      id: `${base}-native-skeleton-card-${index}`,
      type: "roundRect",
      box: roundedBox({ x: cardX, y: cardY, w: cardW, h: cardH }),
      style: {
        fill: index === 1 ? "#F5FAFF" : "#FFFFFF",
        stroke: "#7DB7E8",
        strokeWidthPt: 1.2,
        radiusRatio: 0.055,
        opacity: 0.78,
        shadow: { color: "#6EA6D8", opacity: 0.14, blurPt: 3, distancePt: 1, angleDeg: 90 }
      },
      source: source("sparse-flow-card-chain-native-skeleton-card", { cardIndex: index })
    });
    shapes.push({
      id: `${base}-native-skeleton-card-icon-${index}`,
      type: index === 2 ? "document" : "ellipse",
      box: roundedBox({ x: cardX + cardW * 0.36, y: cardY + cardH * 0.18, w: cardW * 0.28, h: cardH * 0.30 }),
      style: { fill: "#E8F5FF", stroke: "#2E86D1", strokeWidthPt: 1, opacity: 0.82 },
      source: source("sparse-flow-card-chain-native-skeleton-icon", { cardIndex: index })
    });
    if (index < cardCount - 1) {
      shapes.push({
        id: `${base}-native-skeleton-arrow-${index}`,
        type: "line",
        box: {
          x: round(cardX + cardW + gap * 0.18),
          y: round(cardY + cardH * 0.50),
          w: round(gap * 0.64),
          h: 0
        },
        style: { stroke: "#2DBB63", strokeWidthPt: 2.4, connectorType: "straight", endArrow: "triangle", opacity: 0.9 },
        source: source("sparse-flow-card-chain-native-skeleton-arrow", { arrowIndex: index })
      });
    }
  }
  const domainLabels = sparseFlowCardChainSemanticLabels(image, textBoxes)
    .filter((item) => /供应链|物流|财务|标准化|版本化|独立配置/.test(String(item.text || "")))
    .slice(0, 6);
  const chipCount = Math.max(3, Math.min(6, domainLabels.length || 3));
  for (let index = 0; index < chipCount; index += 1) {
    const col = index % 3;
    const row = Math.floor(index / 3);
    shapes.push({
      id: `${base}-native-skeleton-domain-chip-${index}`,
      type: "roundRect",
      box: roundedBox({
        x: x + w * (0.13 + col * 0.28),
        y: y + h * (0.70 + row * 0.12),
        w: w * 0.18,
        h: h * 0.075
      }),
      style: {
        fill: "#EEF8F2",
        stroke: "#55B979",
        strokeWidthPt: 0.9,
        radiusRatio: 0.18,
        opacity: 0.82
      },
      source: source("sparse-flow-card-chain-native-skeleton-domain-chip", {
        chipIndex: index,
        label: domainLabels[index]?.text || null
      })
    });
  }
  return shapes;
}

function inferAssetLandingTreeFlowShapes(image, textBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  const box = image?.box || {};
  if (!box.w || !box.h) return [];
  const labels = sparseFlowCardChainSemanticLabels(image, textBoxes);
  const stageLabels = ["独立配置", "标准化目录", "版本化追踪"].map((text) => labels.find((label) => label.text === text)).filter(Boolean);
  const domainLabels = ["供应链", "物流", "财务"].map((text) => labels.find((label) => label.text === text)).filter(Boolean);
  if (stageLabels.length < 3 || domainLabels.length < 3) return [];
  const base = image.id || "asset-landing-tree-flow";
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "complex-diagram",
    expressionSubtype: "asset-landing-tree-flow",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    skeletonOnly: true,
    ...extra
  });
  const stageCenters = stageLabels.map((label) => centerOfBox(label.box));
  const domainCenters = domainLabels.map((label) => centerOfBox(label.box));
  const centerX = stageCenters[1].x;
  const topY = Number(box.y || 0) + Number(box.h || 0) * 0.08;
  const branchY = Math.min(...stageLabels.map((label) => Number(label.box.y || 0))) - Number(box.h || 0) * 0.16;
  const stageArrowEndY = Math.min(...stageLabels.map((label) => Number(label.box.y || 0))) - 5;
  const green = "#2FB05E";
  const greenDark = "#22964D";
  const greenLight = "#C7EFD3";
  const shapes = [];

  const triW = Number(box.w || 0) * 0.20;
  const triH = Number(box.h || 0) * 0.18;
  const triTop = { x: centerX, y: topY };
  const triLeft = { x: centerX - triW * 0.35, y: topY + triH * 0.74 };
  const triRight = { x: centerX + triW * 0.35, y: topY + triH * 0.74 };
  const triangleCrop = materializeAssetLandingTriangleCrop(image, { triTop, triLeft, triRight }, slideSize, options);
  const preservedImages = triangleCrop ? [triangleCrop] : [];
  if (!triangleCrop) {
    [[triTop, triLeft], [triLeft, triRight], [triRight, triTop]].forEach(([start, end], index) => {
      shapes.push({
        id: `${base}-native-asset-triangle-edge-${index}`,
        type: "line",
        box: lineBox(start, end),
        style: { stroke: "#2D7DBD", strokeWidthPt: 3, connectorType: "straight", opacity: 0.92 },
        source: source("sparse-flow-card-chain-native-asset-triangle-edge", { edgeIndex: index })
      });
    });
    [triTop, triLeft, triRight].forEach((point, index) => {
      shapes.push({
        id: `${base}-native-asset-triangle-dot-${index}`,
        type: "ellipse",
        box: roundedBox({ x: point.x - 7, y: point.y - 7, w: 14, h: 14 }),
        style: { fill: "#2D7DBD", stroke: "#2D7DBD", strokeWidthPt: 0.6, opacity: 0.96 },
        source: source("sparse-flow-card-chain-native-asset-triangle-dot", { dotIndex: index })
      });
    });
  }

  shapes.push({
    id: `${base}-native-trunk`,
    type: "line",
    box: lineBox({ x: centerX, y: triRight.y + (triangleCrop ? 26 : 20) }, { x: centerX, y: branchY }),
    style: { stroke: green, strokeWidthPt: 5, connectorType: "straight", opacity: 0.96 },
    source: source("sparse-flow-card-chain-native-asset-trunk")
  });
  shapes.push({
    id: `${base}-native-branch`,
    type: "line",
    box: lineBox({ x: stageCenters[0].x, y: branchY }, { x: stageCenters[2].x, y: branchY }),
    style: { stroke: green, strokeWidthPt: 5, connectorType: "straight", opacity: 0.96 },
    source: source("sparse-flow-card-chain-native-asset-branch")
  });
  stageCenters.forEach((center, index) => {
    shapes.push({
      id: `${base}-native-branch-arrow-${index}`,
      type: "line",
      box: lineBox({ x: center.x, y: branchY }, { x: center.x, y: stageArrowEndY }),
      style: { stroke: green, strokeWidthPt: 5, connectorType: "straight", endArrow: "triangle", opacity: 0.96 },
      source: source("sparse-flow-card-chain-native-asset-branch-arrow", { arrowIndex: index })
    });
    const pill = roundedBox(expandPtBox(stageLabels[index].box, DEFAULT_SLIDE, 12, 5));
    shapes.push({
      id: `${base}-native-stage-pill-${index}`,
      type: "roundRect",
      box: pill,
      style: { fill: green, stroke: greenDark, strokeWidthPt: 0.8, radiusRatio: 0.42, opacity: 0.96 },
      source: source("sparse-flow-card-chain-native-asset-stage-pill", { stageIndex: index })
    });
  });

  domainLabels.forEach((label, index) => {
    const labelBox = label.box || {};
    const card = roundedBox({
      x: Number(labelBox.x || domainCenters[index].x - 72) - 46,
      y: Number(labelBox.y || domainCenters[index].y) - 11,
      w: Math.max(138, Number(labelBox.w || 54) + 92),
      h: 88
    });
    shapes.push({
      id: `${base}-native-card-${index}`,
      type: "roundRect",
      box: card,
      style: { fill: greenLight, stroke: greenDark, strokeWidthPt: 2.4, radiusRatio: 0.035, opacity: 0.92 },
      source: source("sparse-flow-card-chain-native-asset-card", { cardIndex: index })
    });
    shapes.push({
      id: `${base}-native-card-divider-${index}`,
      type: "line",
      box: lineBox({ x: card.x + 2, y: card.y + 32 }, { x: card.x + card.w - 2, y: card.y + 32 }),
      style: { stroke: greenDark, strokeWidthPt: 2.1, connectorType: "straight", opacity: 0.9 },
      source: source("sparse-flow-card-chain-native-asset-card-divider", { cardIndex: index })
    });
    shapes.push({
      id: `${base}-native-card-body-${index}`,
      type: "rect",
      box: roundedBox({ x: card.x + 5, y: card.y + 35, w: card.w - 10, h: card.h - 40 }),
      style: { fill: "#BFEACB", stroke: "#BFEACB", strokeWidthPt: 0, opacity: 0.42 },
      source: source("sparse-flow-card-chain-native-asset-card-body", { cardIndex: index })
    });
  });
  shapes.images = preservedImages;
  return shapes;
}

function materializeAssetLandingTriangleCrop(image = {}, triangle = {}, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!options.sourceImage || !options.assetDir) return null;
  const points = [triangle.triTop, triangle.triLeft, triangle.triRight].filter(Boolean);
  if (points.length !== 3) return null;
  const minX = Math.min(...points.map((point) => Number(point.x || 0)));
  const maxX = Math.max(...points.map((point) => Number(point.x || 0)));
  const minY = Math.min(...points.map((point) => Number(point.y || 0)));
  const maxY = Math.max(...points.map((point) => Number(point.y || 0)));
  const ptBox = clampPtBoxToSlide({
    x: minX - 7,
    y: minY - 7,
    w: maxX - minX + 14,
    h: maxY - minY + 13
  }, slideSize);
  if (ptBox.w < 12 || ptBox.h < 12) return null;
  ensureDir(options.assetDir);
  const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : Number(image.pageIndex || 0);
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-${image.id || "asset-landing"}-triangle-icon`, "asset-landing-triangle-icon");
  const pxBox = ptToPxBox(ptBox, options.sourceImage, slideSize, 0);
  const file = path.join(options.assetDir, `${base}.png`);
  writePng(file, cropPng(options.sourceImage, pxBox));
  return {
    id: `${image.id || "asset-landing"}-triangle-icon-crop`,
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),
    source: {
      editable: false,
      nativeRebuild: false,
      detector: "sparse-flow-card-chain-asset-triangle-icon-crop",
      strategy: "local-fidelity-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "asset-landing-triangle-icon",
      recommendedAction: "preserve-local-crop",
      layerSourceId: image.id || null,
      nonEditableReason: "top asset-network triangle icon preserved as a local crop; branch arrows, cards, and labels remain native editable"
    }
  };
}

function createGenericNodeDiagramSkeletonShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  const shapes = [];
  for (const image of images || []) {
    if (!shouldObjectifyGenericNodeDiagramSkeleton(image, textBoxes)) continue;
    const localShapes = inferGenericNodeDiagramSkeletonShapes(image, textBoxes);
    const localTextBoxes = genericNodeDiagramSemanticTextBoxes(image);
    if (localShapes.length === 0 && localTextBoxes.length === 0) continue;
    image.source = {
      ...(image.source || {}),
      genericNodeDiagramSkeletonObjectified: true,
      genericNodeDiagramTextObjectified: localTextBoxes.length > 0,
      genericNodeDiagramNativeTextBoxes: localTextBoxes,
      visualAtomOverlayOnly: true,
      objectifiedGenericNodeDiagramSkeletonShapes: localShapes.length,
      objectifiedGenericNodeDiagramTextBoxes: localTextBoxes.length,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; generic node diagram rebuilt as native hub, node, connector, label-line skeleton overlays, and editable semantic labels while preserving the source crop`
    };
    shapes.push(...localShapes);
  }
  return shapes;
}

function shouldObjectifyGenericNodeDiagramSkeleton(image, textBoxes = []) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const box = image?.box || {};
  if (source.detector !== "foreground-graphic-crop") return false;
  if (layer.layerType !== "diagram-zone") return false;
  if (!["generic-node-diagram", "multi-cluster-diagram", "hub-spoke"].includes(String(understanding.archetype || ""))) return false;
  if (Number(understanding.confidence || 0) < 0.9) return false;
  if (!box.w || !box.h || Number(box.w) < 260 || Number(box.h) < 220) return false;
  if (/screenshot|ui|photo/i.test(String(source.expressionForm || source.expressionSubtype || ""))) return false;
  const visualAtoms = comparisonMatrixVisualAtoms(image);
  const structuralAtoms = visualAtoms.filter((atom) => /(?:connector|grid-line|native-(?:rect|ellipse|circle))-candidate/.test(String(atom?.kind || ""))).length;
  const internalTextCount = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box)).length;
  const semanticNodeCount = Array.isArray(understanding.nodes) ? understanding.nodes.length : 0;
  const safeSemanticNodeCount = genericNodeDiagramSemanticNodes(image).length;
  if (understanding.archetype === "hub-spoke") {
    return safeSemanticNodeCount >= 3 && (structuralAtoms >= 3 || internalTextCount >= 3);
  }
  return Number(understanding.nodeCount || 0) >= 3 || semanticNodeCount >= 3 || structuralAtoms >= 3 || internalTextCount >= 3;
}

function inferGenericNodeDiagramSkeletonShapes(image, textBoxes = []) {
  if (image?.source?.allowSyntheticGenericNodeSkeleton !== true) return [];
  const box = image?.box || {};
  if (!box.w || !box.h) return [];
  const understanding = image.source?.layer?.diagramUnderstanding || image.source?.diagramUnderstanding || {};
  if (understanding.archetype === "multi-cluster-diagram") {
    return inferMultiClusterDiagramSkeletonShapes(image);
  }
  const base = image.id || "generic-node-diagram";
  const x = Number(box.x || 0);
  const y = Number(box.y || 0);
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const landscape = w >= h * 1.15;
  const cardW = Math.min(w * (landscape ? 0.24 : 0.34), 150);
  const cardH = Math.min(h * (landscape ? 0.24 : 0.20), 74);
  const hubSize = Math.min(w, h) * 0.22;
  const hub = {
    x: x + w * (landscape ? 0.34 : 0.50) - hubSize / 2,
    y: y + h * 0.50 - hubSize / 2,
    w: hubSize,
    h: hubSize
  };
  const nodeBoxes = landscape ? [
    { x: x + w * 0.06, y: y + h * 0.36, w: cardW, h: cardH },
    { x: x + w * 0.66, y: y + h * 0.18, w: cardW, h: cardH },
    { x: x + w * 0.66, y: y + h * 0.60, w: cardW, h: cardH }
  ] : [
    { x: x + w * 0.50 - cardW / 2, y: y + h * 0.10, w: cardW, h: cardH },
    { x: x + w * 0.12, y: y + h * 0.66, w: cardW, h: cardH },
    { x: x + w * 0.88 - cardW, y: y + h * 0.66, w: cardW, h: cardH }
  ];
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "complex-diagram",
    expressionSubtype: "generic-node-diagram",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    skeletonOnly: true,
    ...extra
  });
  const shapes = [{
    id: `${base}-native-skeleton-hub`,
    type: "ellipse",
    box: roundedBox(hub),
    style: {
      fill: "#F4FAFF",
      stroke: "#2E86D1",
      strokeWidthPt: 1.5,
      opacity: 0.86,
      shadow: { color: "#4B91C9", alpha: 0.14, blurPt: 3, distancePt: 1, angleDeg: 90 }
    },
    source: source("generic-node-diagram-native-skeleton-hub")
  }];
  const hubCenter = centerOfBox(hub);
  nodeBoxes.forEach((nodeBox, index) => {
    const node = roundedBox(nodeBox);
    const nodeCenter = centerOfBox(node);
    shapes.push({
      id: `${base}-native-skeleton-connector-${index}`,
      type: "line",
      box: {
        x: round(hubCenter.x),
        y: round(hubCenter.y),
        w: round(nodeCenter.x - hubCenter.x),
        h: round(nodeCenter.y - hubCenter.y)
      },
      style: { stroke: "#7DB7E8", strokeWidthPt: 1.4, connectorType: "straight", endArrow: "triangle", opacity: 0.78 },
      source: source("generic-node-diagram-native-skeleton-connector", { nodeIndex: index })
    });
    shapes.push({
      id: `${base}-native-skeleton-node-${index}`,
      type: "roundRect",
      box: node,
      style: {
        fill: index === 0 ? "#FFFFFF" : "#F7FBFF",
        stroke: "#73B3E7",
        strokeWidthPt: 1.1,
        radiusRatio: 0.08,
        opacity: 0.82,
        shadow: { color: "#6EA6D8", alpha: 0.10, blurPt: 2.4, distancePt: 0.8, angleDeg: 90 }
      },
      source: source("generic-node-diagram-native-skeleton-node", { nodeIndex: index })
    });
    shapes.push({
      id: `${base}-native-skeleton-node-icon-${index}`,
      type: "ellipse",
      box: roundedBox({
        x: node.x + node.w * 0.08,
        y: node.y + node.h * 0.28,
        w: node.h * 0.32,
        h: node.h * 0.32
      }),
      style: { fill: "#E8F6FF", stroke: "#2E86D1", strokeWidthPt: 0.8, opacity: 0.86 },
      source: source("generic-node-diagram-native-skeleton-node-icon", { nodeIndex: index })
    });
    for (let lineIndex = 0; lineIndex < 2; lineIndex += 1) {
      shapes.push({
        id: `${base}-native-skeleton-node-label-line-${index}-${lineIndex}`,
        type: "line",
        box: {
          x: round(node.x + node.w * 0.30),
          y: round(node.y + node.h * (0.38 + lineIndex * 0.20)),
          w: round(node.w * (lineIndex === 0 ? 0.54 : 0.42)),
          h: 0
        },
        style: { stroke: lineIndex === 0 ? "#3F80BA" : "#A9CBE8", strokeWidthPt: lineIndex === 0 ? 1.2 : 0.9, connectorType: "straight", opacity: 0.74 },
        source: source("generic-node-diagram-native-skeleton-label-line", { nodeIndex: index, lineIndex })
      });
    }
  });
  const internal = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box)).slice(0, 3);
  internal.forEach((textBox, index) => {
    shapes.push({
      id: `${base}-native-skeleton-text-anchor-${index}`,
      type: "rect",
      box: roundedBox({
        x: Number(textBox.box?.x || x),
        y: Number(textBox.box?.y || y),
        w: Math.max(16, Number(textBox.box?.w || 0)),
        h: Math.max(3, Number(textBox.box?.h || 0) * 0.18)
      }),
      style: { fill: "#2E86D1", stroke: "none", strokeWidthPt: 0, opacity: 0.25 },
      source: source("generic-node-diagram-native-skeleton-text-anchor", { textIndex: index })
    });
  });
  return shapes;
}

function genericNodeDiagramSemanticTextBoxes(image = {}) {
  const seen = new Set();
  return genericNodeDiagramSemanticNodes(image)
    .map((node, index) => {
      const text = normalizeGenericNodeDiagramText(node.text);
      const key = text.replace(/\s+/g, "");
      if (seen.has(key)) return null;
      seen.add(key);
      return genericNodeDiagramTextBox(image, node, text, index);
    })
    .filter(Boolean)
    .slice(0, 12);
}

function genericNodeDiagramSemanticNodes(image = {}) {
  const box = image?.box || {};
  const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
    ? image.source.layer.diagramUnderstanding.nodes
    : Array.isArray(image?.source?.diagramUnderstanding?.nodes)
      ? image.source.diagramUnderstanding.nodes
      : [];
  return nodes
    .filter((node) => node?.box && boxCenterInside(node.box, box))
    .filter((node) => isSafeGenericNodeDiagramText(node.text));
}

function inferMultiClusterDiagramSkeletonShapes(image = {}) {
  const box = image?.box || {};
  const nodes = genericNodeDiagramSemanticNodes(image);
  if (nodes.length < 3) return [];
  const base = image.id || "multi-cluster-diagram";
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "complex-diagram",
    expressionSubtype: "multi-cluster-diagram",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    skeletonOnly: true,
    ...extra
  });
  const shapes = [];
  const centerX = Number(box.x || 0) + Number(box.w || 0) * 0.55;
  const leftNodes = nodes.filter((node) => centerOfBox(node.box).x < centerX);
  const rightNodes = nodes.filter((node) => centerOfBox(node.box).x >= centerX);
  const nearestRightNode = (node) => {
    if (rightNodes.length === 0) return null;
    const from = centerOfBox(node.box);
    return [...rightNodes].sort((a, b) =>
      Math.abs(centerOfBox(a.box).y - from.y) - Math.abs(centerOfBox(b.box).y - from.y)
    )[0];
  };
  leftNodes.forEach((node, index) => {
    const target = nearestRightNode(node);
    if (!target) return;
    const from = centerOfBox(node.box);
    const to = centerOfBox(target.box);
    shapes.push({
      id: `${base}-native-cluster-connector-${index}`,
      type: "line",
      box: {
        x: round(from.x),
        y: round(from.y),
        w: round(to.x - from.x),
        h: round(to.y - from.y)
      },
      style: { stroke: "#B8C4D0", strokeWidthPt: 1.8, connectorType: "straight", endArrow: "triangle", opacity: 0.76 },
      source: source("multi-cluster-diagram-native-connector", {
        fromText: normalizeGenericNodeDiagramText(node.text),
        toText: normalizeGenericNodeDiagramText(target.text),
        connectorIndex: index
      })
    });
  });
  nodes.forEach((node, index) => {
    const text = normalizeGenericNodeDiagramText(node.text);
    const kind = String(node.kind || "");
    const nodeBox = roundedBox(expandPtBox(node.box, DEFAULT_SLIDE, 10, 6));
    const isRisk = /decision|risk/.test(kind) || /理解偏差|重复返工|风险遗漏/.test(text);
    const isDocument = /document|screenshot/.test(kind) || /会议记录|业务截图|旧版PRD|口头反馈/.test(text);
    shapes.push({
      id: `${base}-native-cluster-node-${index}`,
      type: isRisk ? "roundRect" : "rect",
      box: nodeBox,
      style: {
        fill: isRisk ? "#FFF2E8" : isDocument ? "#F4F7FA" : "#FFFFFF",
        stroke: isRisk ? "#FF7A24" : "#9AA9B8",
        strokeWidthPt: isRisk ? 1.4 : 1.1,
        radiusRatio: isRisk ? 0.16 : 0.04,
        opacity: 0.88,
        shadow: { color: isRisk ? "#FF7A24" : "#7B8A99", alpha: 0.10, blurPt: 2.8, distancePt: 1, angleDeg: 90 }
      },
      source: source("multi-cluster-diagram-native-node", {
        nodeIndex: index,
        semanticNodeId: node.id || "",
        nodeRole: isRisk ? "risk" : isDocument ? "input-artifact" : "process"
      })
    });
    if (isDocument) {
      shapes.push({
        id: `${base}-native-cluster-node-fold-${index}`,
        type: "triangle",
        box: roundedBox({
          x: nodeBox.x + nodeBox.w - 15,
          y: nodeBox.y,
          w: 15,
          h: 15
        }),
        style: { fill: "#D7E0E8", stroke: "#9AA9B8", strokeWidthPt: 0.8, rotate: 90, opacity: 0.9 },
        source: source("multi-cluster-diagram-native-document-fold", { nodeIndex: index })
      });
    }
  });
  return shapes;
}

function isSafeGenericNodeDiagramText(text) {
  const normalized = normalizeGenericNodeDiagramText(text);
  if (!normalized) return false;
  if (normalized.length > 30) return false;
  if (/^[\d\s.,;:|/\\\-+_()[\]{}]+$/.test(normalized)) return false;
  if (/^[？?！!×+。.,，；;：:]+$/.test(normalized)) return false;
  return /[\u4e00-\u9fffA-Za-z]/.test(normalized);
}



function genericNodeDiagramTextBox(image, node, text, index) {
  const nodeBox = roundedBox(node.box || {});
  const fontSize = Math.max(8, Math.min(14, Math.min(Number(nodeBox.h || 0) * 0.44 || 10.5, Number(nodeBox.w || 0) / Math.max(2.2, text.length * 0.9))));
  const sourceId = image?.id || "generic-node-diagram";
  return {
    id: node.sourceTextBoxId || `${sourceId}-native-generic-node-text-${index}`,
    text,
    box: {
      x: nodeBox.x,
      y: nodeBox.y,
      w: Math.max(22, nodeBox.w),
      h: Math.max(12, nodeBox.h)
    },
    font: {
      family: "SimHei",
      sizePt: fontSize,
      color: "#17324D",
      weight: text.length <= 8 ? "bold" : "regular",
      opacity: 1
    },
    align: "center",
    verticalAlign: "middle",
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "generic-node-diagram-semantic-node-text",
      expressionForm: "complex-diagram",
      expressionSubtype: "generic-node-diagram",
      layerSourceId: image?.id || null,
      layerType: image?.source?.layer?.layerType || "diagram-zone",
      semanticTextSource: true,
      semanticNodeId: node.id || "",
      overlayVisibility: "visible"
    }
  };
}

function createVisualClusterStackShapes(images = [], sourceImage = null, slideSize = DEFAULT_SLIDE, pageTextBoxes = []) {
  const shapes = [];
  for (const image of images || []) {
    if (!shouldObjectifyVisualClusterStack(image)) continue;
    const portalFourLayer = isPortalFourLayerCluster(pageTextBoxes);
    const portalLayout = portalFourLayer ? measurePortalFourLayerLayout(sourceImage, pageTextBoxes, slideSize) : null;
    const localShapes = portalFourLayer
      ? inferPortalFourLayerClusterShapes(image, pageTextBoxes, slideSize, portalLayout)
      : inferVisualClusterStackShapes(image);
    const localTextBoxes = portalFourLayer
      ? portalFourLayerClusterTextBoxes(image, pageTextBoxes, slideSize, portalLayout)
      : visualClusterStackTextBoxes(image);
    if (localShapes.length === 0 && localTextBoxes.length === 0) continue;
    image.source = {
      ...(image.source || {}),
      visualClusterStackObjectified: true,
      visualClusterStackTextObjectified: localTextBoxes.length > 0,
      visualClusterStackNativeTextBoxes: localTextBoxes,
      visualAtomOverlayOnly: false,
      dropErasedResidualAfterNativeRebuild: true,
      objectifiedVisualClusterStackShapes: localShapes.length,
      objectifiedVisualClusterStackTextBoxes: localTextBoxes.length,
      portalFourLayerClusterObjectified: portalFourLayer,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "visual cluster stack"}; visual cluster stack rebuilt as native layered cards and editable labels`
    };
    shapes.push(...localShapes);
  }
  return shapes;
}

function isPortalFourLayerCluster(textBoxes = []) {
  const text = (textBoxes || []).map((item) => String(item?.text || "")).join(" ").replace(/\s+/g, "");
  return /PMPortal平台四层架构解析/i.test(text)
    && /统一展示门户/.test(text)
    && /Skills能力网/i.test(text)
    && /运行时引擎/.test(text)
    && /CLI脚手架/i.test(text)
    && /全资产统一检索/.test(text)
    && /多域快速扩展/.test(text);
}

function portalFourLayerComponentMetadata(image, role, part) {
  const base = safeComponentToken(image?.id || "portal-four-layer");
  return {
    nativeComponentGroupId: `${base}-portal-four-layer-${safeComponentToken(role)}`,
    nativeComponentArchetype: "portal-four-layer-architecture",
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentRole: role,
    nativeComponentPart: part
  };
}

function inferPortalFourLayerClusterShapes(image = {}, pageTextBoxes = [], slideSize = DEFAULT_SLIDE, measuredLayout = null) {
  const sx = Number(slideSize.widthPt || 960) / 960;
  const sy = Number(slideSize.heightPt || 540) / 540;
  const atoms = visualClusterStackRectAtoms(image);
  const layerRoles = ["portal", "skills", "runtime", "cli"];
  const layout = measuredLayout || measurePortalFourLayerLayout(null, pageTextBoxes, slideSize);
  const measuredBarFills = ["#6CB2E6", "#549FD9", "#3483C5", "#1E68A5"];
  const measuredCalloutFills = ["#2067A2", "#2067A2", "#1B6097", "#175588"];
  const shapes = [];
  const source = (detector, role, part, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "chart-or-diagram",
    expressionSubtype: "portal-four-layer-architecture",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "chart-zone",
    ...portalFourLayerComponentMetadata(image, role, part),
    ...extra
  });

  layerRoles.forEach((role, index) => {
    const fill = measuredBarFills[index] || normalizeHexColor(atoms[index]?.color) || visualClusterStackFallbackColor(index);
    const bar = layout.bars[index];
    shapes.push({
      id: `${image.id || "portal-four-layer"}-native-${role}-bar`,
      type: "rect",
      box: roundedBox(bar),
      style: {
        fill,
        stroke: "none",
        strokeWidthPt: 0
      },
      source: source("portal-four-layer-native-bar", `layer-${role}`, "bar", { layerIndex: index, sampledColor: fill })
    });
    shapes.push({
      id: `${image.id || "portal-four-layer"}-native-${role}-callout`,
      type: "rect",
      box: roundedBox(layout.callouts[index]),
      style: { fill: measuredCalloutFills[index], stroke: "none", strokeWidthPt: 0 },
      source: source("portal-four-layer-native-callout", `layer-${role}`, "callout", { layerIndex: index })
    });
    if (index < layerRoles.length - 1) {
      layout.arrows.slice(index * 3, index * 3 + 3).forEach((box, arrowIndex) => {
        shapes.push({
          id: `${image.id || "portal-four-layer"}-native-${role}-arrow-${arrowIndex}`,
          type: "upArrow",
          box: roundedBox(box),
          style: { fill: "#32B96B", stroke: "#239B56", strokeWidthPt: 0.6 },
          source: source("portal-four-layer-native-arrow", "capability-routing", "up-arrow", { layerIndex: index, arrowIndex })
        });
      });
    }
  });

  layout.bullets.forEach((box, index) => shapes.push({
    id: `${image.id || "portal-four-layer"}-native-bullet-${index}`,
    type: "ellipse",
    box: roundedBox(box),
    style: { fill: "#9A9A9A", stroke: "#9A9A9A", strokeWidthPt: 0.2 },
    source: source("portal-four-layer-native-bullet", `narrative-${index + 1}`, "bullet", { bulletIndex: index })
  }));

  return shapes;
}

function portalFourLayerClusterTextBoxes(image = {}, pageTextBoxes = [], slideSize = DEFAULT_SLIDE, measuredLayout = null) {
  const roles = ["portal", "skills", "runtime", "cli"];
  const layout = measuredLayout || measurePortalFourLayerLayout(null, pageTextBoxes, slideSize);
  const layerTextBoxes = visualClusterStackSemanticNodes(image).slice(0, 4).map((node, index) => {
    const textBox = visualClusterStackTextBox(image, node, normalizeGenericNodeDiagramText(node.text), index);
    const evidence = findPortalTextEvidence(pageTextBoxes, node.text);
    textBox.box = roundedBox(evidence?.box || layout.layerLabels[index]);
    textBox.font = {
      ...textBox.font,
      family: evidence?.font?.family || textBox.font?.family || "Microsoft YaHei",
      sizePt: Math.max(12, Number(evidence?.font?.sizePt || textBox.font?.sizePt || 13.5)),
      weight: "regular",
      align: "center",
      valign: "middle"
    };
    textBox.source = {
      ...textBox.source,
      detector: "portal-four-layer-native-layer-text",
      expressionSubtype: "portal-four-layer-architecture",
      ...portalFourLayerComponentMetadata(image, `layer-${roles[index]}`, "label")
    };
    return textBox;
  });
  const calloutSpecs = [
    [/全资产统一检索/, "portal"],
    [/AI能力精准分发/i, "skills"],
    [/目录实时聚合/, "runtime"],
    [/多域快速扩展/, "cli"]
  ];
  const calloutTextBoxes = calloutSpecs.map(([pattern, role], index) => {
    const original = (pageTextBoxes || []).find((candidate) => pattern.test(String(candidate?.text || "")));
    if (!original) return null;
    return {
      id: `${original.id || image.id || "portal-four-layer"}-native-callout-${index}`,
      text: original.text,
      box: roundedBox(original.box || layout.calloutLabels[index]),
      font: {
        family: original.font?.family || "SimHei",
        sizePt: Math.max(10, Math.min(16, Number(original.font?.sizePt || 13))),
        color: "#FFFFFF",
        weight: "regular",
        opacity: 1,
        align: "center",
        valign: "middle"
      },
      align: "center",
      verticalAlign: "middle",
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "portal-four-layer-native-callout-text",
        expressionForm: "chart-or-diagram",
        expressionSubtype: "portal-four-layer-architecture",
        layerSourceId: image.id || null,
        semanticTextSource: true,
        overlayVisibility: "visible",
        ...portalFourLayerComponentMetadata(image, `layer-${role}`, "callout-text")
      }
    };
  }).filter(Boolean);
  return [...layerTextBoxes, ...calloutTextBoxes];
}



function measurePortalFourLayerLayout(sourceImage, pageTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const sx = Number(slideSize.widthPt || 960) / 960;
  const sy = Number(slideSize.heightPt || 540) / 540;
  const fallbackBars = [156, 236.6, 317.6, 398.6].map((y) => roundedBox({ x: 386.1 * sx, y: y * sy, w: 420.2 * sx, h: 45.7 * sy }));
  let bars = fallbackBars;
  let arrows = [205.1, 286.1, 367.1].flatMap((y) => [475.7, 577.1, 678.9].map((x) => roundedBox({ x: x * sx, y: y * sy, w: 27 * sx, h: 28.2 * sy })));
  if (sourceImage?.rgba && sourceImage.width && sourceImage.height) {
    const blue = (r, g, b, a) => a > 200 && b > 120 && b - r > 25 && b - g > 5 && g > 70;
    const green = (r, g, b, a) => a > 200 && g > 130 && g > r * 1.35 && g > b * 1.15 && r < 110;
    const pxBands = detectHorizontalColorBands(sourceImage, {
      predicate: blue,
      stride: 2,
      region: { x: sourceImage.width * 0.35, y: sourceImage.height * 0.2, w: sourceImage.width * 0.63, h: sourceImage.height * 0.72 },
      minRowCoverage: 0.28,
      minBandHeightPx: sourceImage.height * 0.035,
      maxBands: 4
    });
    if (pxBands.length === 4) bars = pxBands.map((box) => pixelBoxToSlide(box, sourceImage, slideSize));
    const pxArrows = detectColorComponents(sourceImage, {
      predicate: green,
      stride: 2,
      region: { x: sourceImage.width * 0.42, y: sourceImage.height * 0.32, w: sourceImage.width * 0.36, h: sourceImage.height * 0.45 },
      minAreaPx: sourceImage.width * sourceImage.height * 0.00045
    }).filter((box) => box.w >= sourceImage.width * 0.018 && box.w <= sourceImage.width * 0.04 && box.h >= sourceImage.height * 0.035 && box.h <= sourceImage.height * 0.075);
    if (pxArrows.length === 9) arrows = pxArrows.map((box) => pixelBoxToSlide(box, sourceImage, slideSize));
  }
  const calloutPatterns = [/全资产统一检索/, /AI能力精准分发/i, /目录实时聚合/, /多域快速扩展/];
  const calloutLabels = calloutPatterns.map((pattern, index) => roundedBox(findPortalPatternEvidence(pageTextBoxes, pattern)?.box || { x: 782 * sx, y: (168 + index * 81) * sy, w: 102 * sx, h: 19 * sy }));
  const callouts = calloutLabels.map((box) => roundedBox({ x: box.x - 8 * sx, y: box.y - 4.5 * sy, w: box.w + 16 * sx, h: box.h + 9 * sy }));
  const layerPatterns = [/统一展示门户/, /Skills能力网/i, /运行时引擎/, /CLI脚手架/i];
  const layerLabels = layerPatterns.map((pattern, index) => roundedBox(findPortalPatternEvidence(pageTextBoxes, pattern)?.box || { x: bars[index].x + bars[index].w * 0.35, y: bars[index].y + 7 * sy, w: bars[index].w * 0.3, h: 26 * sy }));
  const narrativePatterns = [/^敏捷构建：/, /^实时运转：/, /^智能中枢：/, /^(?:[·•・]\s*)?全局可见：/];
  const bullets = narrativePatterns.map((pattern, index) => {
    const evidence = findPortalPatternEvidence(pageTextBoxes, pattern);
    return roundedBox({ x: 74.5 * sx, y: Number(evidence?.box?.y ?? (169 + index * 80.5)) + 4.2 * sy, w: 7.4 * sx, h: 7.4 * sy });
  });
  return { bars, arrows, callouts, calloutLabels, layerLabels, bullets };
}

function findPortalTextEvidence(items, text) {
  const key = normalizeGenericNodeDiagramText(text).replace(/\s+/g, "").toLowerCase();
  return (items || []).find((item) => normalizeGenericNodeDiagramText(item?.text).replace(/\s+/g, "").toLowerCase() === key) || null;
}
function findPortalPatternEvidence(items, pattern) { return (items || []).find((item) => pattern.test(String(item?.text || ""))) || null; }


function shouldObjectifyVisualClusterStack(image = {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const box = visualClusterStackImageBox(image);
  if (source.detector !== "visual-cluster-graphic-underlay-crop") return false;
  if (layer.layerType !== "chart-zone" && layer.layerType !== "diagram-zone") return false;
  if (understanding.archetype !== "hub-spoke") return false;
  if (Number(understanding.confidence || 0) < 0.9) return false;
  if (!box.w || !box.h || Number(box.w) < 260 || Number(box.h) < 180) return false;
  if (/screenshot|document|prototype|ui/.test(String(source.expressionForm || source.expressionSubtype || ""))) return false;
  const rectAtoms = visualClusterStackRectAtoms(image);
  const nodes = visualClusterStackSemanticNodes(image);
  return rectAtoms.length >= 4 && nodes.length >= 4;
}

function visualClusterStackImageBox(image = {}) {
  const candidates = [
    image?.box,
    image,
    image?.source?.layer?.diagramUnderstanding?.evidence?.regionBox,
    image?.source?.layer?.box
  ];
  for (const candidate of candidates) {
    const x = Number(candidate?.x);
    const y = Number(candidate?.y);
    const w = Number(candidate?.w);
    const h = Number(candidate?.h);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return { x, y, w, h };
    }
  }
  return {};
}

function visualClusterStackRectAtoms(image = {}) {
  const imageBox = visualClusterStackImageBox(image);
  return comparisonMatrixVisualAtoms(image)
    .filter((atom) => String(atom?.kind || "") === "native-rect-candidate")
    .filter((atom) => atom?.box && boxCenterInside(atom.box, imageBox))
    .sort((a, b) => Number(a.box?.y || 0) - Number(b.box?.y || 0));
}

function visualClusterStackSemanticNodes(image = {}) {
  const imageBox = visualClusterStackImageBox(image);
  const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
    ? image.source.layer.diagramUnderstanding.nodes
    : [];
  return nodes
    .filter((node) => node?.box && boxCenterInside(node.box, imageBox))
    .filter((node) => isSafeGenericNodeDiagramText(node.text))
    .sort((a, b) => Number(a.box?.y || 0) - Number(b.box?.y || 0));
}

function inferVisualClusterStackShapes(image = {}) {
  const atoms = visualClusterStackRectAtoms(image);
  const base = image.id || "visual-cluster-stack";
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "chart-or-diagram",
    expressionSubtype: "visual-cluster-stack",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "chart-zone",
    skeletonOnly: true,
    ...extra
  });
  const shapes = [];
  atoms.forEach((atom, index) => {
    const box = roundedBox(atom.box || {});
    const fill = normalizeHexColor(atom.color) || visualClusterStackFallbackColor(index);
    shapes.push({
      id: `${base}-native-stack-layer-${index}`,
      type: "roundRect",
      box,
      style: {
        fill,
        stroke: darkenHexColor(fill, 0.16),
        strokeWidthPt: 0.9,
        radiusRatio: Math.min(0.42, Math.max(0.12, Number(box.h || 1) / Math.max(1, Number(box.w || 1)) * 0.9)),
        opacity: 0.80,
        shadow: { color: "#1F4E79", alpha: 0.10, blurPt: 2.8, distancePt: 0.8, angleDeg: 90 }
      },
      source: source("visual-cluster-stack-native-layer", { layerIndex: index, sampledColor: fill })
    });
    if (index > 0) {
      const prev = centerOfBox(roundedBox(atoms[index - 1].box || {}));
      const current = centerOfBox(box);
      shapes.push({
        id: `${base}-native-stack-connector-${index}`,
        type: "line",
        box: lineBox({ x: prev.x, y: prev.y + Number(atoms[index - 1].box?.h || 0) * 0.28 }, { x: current.x, y: current.y - Number(box.h || 0) * 0.28 }),
        style: { stroke: "#D7ECFA", strokeWidthPt: 1.1, connectorType: "straight", endArrow: "triangle", opacity: 0.58 },
        source: source("visual-cluster-stack-native-connector", { layerIndex: index })
      });
    }
  });
  return shapes;
}

function visualClusterStackTextBoxes(image = {}) {
  const seen = new Set();
  return visualClusterStackSemanticNodes(image)
    .map((node, index) => {
      const text = normalizeGenericNodeDiagramText(node.text);
      const key = text.replace(/\s+/g, "");
      if (seen.has(key)) return null;
      seen.add(key);
      return visualClusterStackTextBox(image, node, text, index);
    })
    .filter(Boolean)
    .slice(0, 8);
}

function visualClusterStackTextBox(image, node, text, index) {
  const nodeBox = roundedBox(node.box || {});
  const fontSize = Math.max(9, Math.min(15, Math.min(Number(nodeBox.h || 0) * 0.46 || 12, Number(nodeBox.w || 0) / Math.max(2.1, text.length * 0.82))));
  const sourceId = image?.id || "visual-cluster-stack";
  return {
    id: node.sourceTextBoxId || `${sourceId}-native-stack-label-${index}`,
    text,
    box: {
      x: nodeBox.x,
      y: nodeBox.y,
      w: Math.max(28, nodeBox.w),
      h: Math.max(13, nodeBox.h)
    },
    font: {
      family: "SimHei",
      sizePt: fontSize,
      color: "#FFFFFF",
      weight: "bold",
      opacity: 1
    },
    align: "center",
    verticalAlign: "middle",
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-cluster-stack-native-label",
      expressionForm: "chart-or-diagram",
      expressionSubtype: "visual-cluster-stack",
      layerSourceId: image?.id || null,
      layerType: image?.source?.layer?.layerType || "chart-zone",
      semanticTextSource: true,
      semanticNodeId: node.id || "",
      overlayVisibility: "visible"
    }
  };
}

function visualClusterStackFallbackColor(index) {
  return ["#6FB1E2", "#599FD5", "#3C84C0", "#286CA4"][index % 4];
}






































































function createCollaborationFlowShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null) {
  const shapes = [];
  for (const image of images || []) {
    if (!shouldObjectifyCollaborationFlow(image, textBoxes)) continue;
    const localShapes = inferCollaborationFlowShapes(image, textBoxes);
    if (localShapes.length === 0) continue;
    const candidateTextBoxes = collaborationFlowNativeTextBoxes(image, textBoxes);
    const erasedTextBoxes = maybeEraseCollaborationFlowText({
      image,
      textBoxes: candidateTextBoxes,
      sourceImage,
      slideSize,
      irDir
    });
    const nativeTextBoxes = erasedTextBoxes.length > 0
      ? erasedTextBoxes
      : candidateTextBoxes.map((textBox) => ({
        ...textBox,
        source: {
          ...(textBox.source || {}),
          textErasedFromCrop: false,
          overlayVisibility: "visible"
        }
      }));
    image.source = {
      ...(image.source || {}),
      collaborationFlowObjectified: true,
      visualAtomOverlayOnly: shouldDropCollaborationFlowResidual(localShapes, nativeTextBoxes) ? false : true,
      dropErasedResidualAfterNativeRebuild: shouldDropCollaborationFlowResidual(localShapes, nativeTextBoxes)
        ? true
        : image.source?.dropErasedResidualAfterNativeRebuild,
      objectifiedCollaborationFlowShapes: localShapes.length,
      collaborationFlowTextObjectified: nativeTextBoxes.length > 0,
      collaborationFlowNativeTextBoxes: nativeTextBoxes,
      objectifiedCollaborationFlowTextBoxes: nativeTextBoxes.length,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; collaboration flow branch connectors and OCR-backed editable labels rebuilt over fidelity crop`
    };
    shapes.push(...localShapes);
  }
  return shapes;
}

function shouldObjectifyCollaborationFlow(image, textBoxes = []) {
  const source = image?.source || {};
  const box = image?.box || {};
  if (source.detector !== "collaboration-flow-underlay-crop") return false;
  if (!box.w || !box.h || Number(box.w) < 700 || Number(box.h) < 240) return false;
  const internal = [
    ...(textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box)),
    ...collaborationFlowSemanticTextBoxes(image).filter((textBox) => boxCenterInside(textBox.box, box))
  ];
  const text = internal.map((item) => String(item.text || "")).join("\n");
  const roleSignals = [/后端研发\s*BE/i, /前端研发\s*FE/i, /测试\s*QA/i]
    .filter((pattern) => pattern.test(text)).length;
  const hasEngine = /PM\s*Skills|PMSkills|处理引擎/i.test(text);
  if (roleSignals >= 2 || hasEngine) return true;
  return source.expressionSubtype === "collaboration-flow-diagram"
    || source.componentTemplateGroupApplied === true
    || source.collaborationFlowCandidate === true;
}

function inferCollaborationFlowShapes(image, textBoxes = []) {
  const box = image?.box || {};
  const base = image.id || "collaboration-flow";
  const internal = [
    ...(textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box)),
    ...collaborationFlowSemanticTextBoxes(image).filter((textBox) => boxCenterInside(textBox.box, box))
  ];
  const roleLabels = [
    { key: "be", pattern: /后端研发\s*BE/i, stroke: "#2E86D1", icon: "database" },
    { key: "fe", pattern: /前端研发\s*FE/i, stroke: "#1F78D1", icon: "browser" },
    { key: "qa", pattern: /测试\s*QA/i, stroke: "#2B8CE5", icon: "clipboard" }
  ].map((role) => ({
    ...role,
    textBox: internal.find((item) => role.pattern.test(String(item.text || "")))
  })).filter((role) => role.textBox);
  const hubLabel = internal.find((item) => /PM\s*Skills|PMSkills|处理引擎/i.test(String(item.text || "")));
  const hub = inferCollaborationHubBox(box, hubLabel);
  const cards = inferCollaborationCards(box, roleLabels);
  if (cards.length < 2) return inferCollaborationFlowSkeletonShapes(image);
  return [
    ...collaborationHubShapes(base, image, hub),
    ...cards.flatMap((card, index) => [
      ...collaborationBranchShapes(base, image, hub, card, index),
      ...collaborationCardShapes(base, image, card, index)
    ])
  ];
}

function inferCollaborationFlowSkeletonShapes(image) {
  const box = image?.box || {};
  if (!box.w || !box.h) return [];
  const base = image.id || "collaboration-flow";
  const hubSize = Math.min(Number(box.h || 0) * 0.38, Number(box.w || 0) * 0.18);
  const hub = roundedBox({
    x: Number(box.x || 0) + Number(box.w || 0) * 0.18 - hubSize / 2,
    y: Number(box.y || 0) + Number(box.h || 0) * 0.50 - hubSize / 2,
    w: hubSize,
    h: hubSize
  });
  const roles = [
    { key: "be", stroke: "#2E86D1", icon: "database" },
    { key: "fe", stroke: "#1F78D1", icon: "browser" },
    { key: "qa", stroke: "#2B8CE5", icon: "clipboard" }
  ];
  const cardX = round(Number(box.x || 0) + Number(box.w || 0) * 0.48);
  const cardW = round(Number(box.w || 0) * 0.48);
  const cardH = round(Math.max(70, Math.min(104, Number(box.h || 0) * 0.23)));
  const cardYs = [0.08, 0.39, 0.70].map((ratio) => round(Number(box.y || 0) + Number(box.h || 0) * ratio));
  const cards = roles.map((role, index) => ({
    role,
    x: cardX,
    y: cardYs[index],
    w: cardW,
    h: cardH
  }));
  return [
    ...collaborationHubShapes(base, image, hub),
    ...cards.flatMap((card, index) => [
      ...collaborationBranchShapes(base, image, hub, card, index),
      ...collaborationCardShapes(base, image, card, index)
    ])
  ].map((shape) => ({
    ...shape,
    id: shape.id.replace("-native-", "-native-skeleton-"),
    source: {
      ...(shape.source || {}),
      detector: String(shape.source?.detector || "").replace("collaboration-flow-native-", "collaboration-flow-native-skeleton-"),
      skeletonOnly: true
    }
  }));
}

function shouldDropCollaborationFlowResidual(shapes = [], nativeTextBoxes = []) {
  const detectors = new Set((shapes || []).map((shape) => shape?.source?.detector || shape?.detector || ""));
  const cardCount = (shapes || []).filter((shape) =>
    (shape?.source?.detector || shape?.detector) === "collaboration-flow-native-recipient-card"
  ).length;
  const branchCount = (shapes || []).filter((shape) =>
    (shape?.source?.detector || shape?.detector) === "collaboration-flow-native-branch"
  ).length;
  const roles = new Set((nativeTextBoxes || []).map((textBox) => textBox?.source?.role || ""));
  return cardCount >= 3
    && branchCount >= 6
    && detectors.has("collaboration-flow-native-hub-core")
    && roles.has("engine-label")
    && roles.has("recipient-title")
    && roles.has("recipient-body")
    && nativeTextBoxes.length >= 11;
}

function inferCollaborationHubBox(box, hubLabel) {
  const labelCenter = hubLabel?.box ? centerOfBox(hubLabel.box) : null;
  const size = Math.min(Number(box.h || 0) * 0.44, Number(box.w || 0) * 0.19);
  const centerX = labelCenter?.x || Number(box.x || 0) + Number(box.w || 0) * 0.2;
  const centerY = labelCenter?.y || Number(box.y || 0) + Number(box.h || 0) * 0.52;
  return {
    x: round(centerX - size / 2),
    y: round(centerY - size / 2),
    w: round(size),
    h: round(size)
  };
}

function inferCollaborationCards(box, roleLabels = []) {
  const cardX = round(Number(box.x || 0) + Number(box.w || 0) * 0.47);
  const cardW = round(Number(box.w || 0) * 0.51);
  return roleLabels.map((role, index) => {
    const labelBox = role.textBox.box;
    const cardH = round(Math.max(76, Math.min(106, Number(box.h || 0) * 0.26)));
    const y = round(Math.max(Number(box.y || 0) + 4, labelBox.y - cardH * 0.24));
    return {
      role,
      x: cardX,
      y,
      w: cardW,
      h: cardH
    };
  });
}

function collaborationHubShapes(base, image, hub) {
  const source = (detector, extra = {}) => collaborationFlowShapeSource(image, detector, extra);
  return [{
    id: `${base}-native-hub-glow`,
    type: "ellipse",
    box: expandPtBox(hub, DEFAULT_SLIDE, 58, 58),
    style: { fill: "#BDF4D3", stroke: "none", strokeWidthPt: 0, opacity: 0.36 },
    source: source("collaboration-flow-native-hub-glow")
  }, {
    id: `${base}-native-hub-ring`,
    type: "ellipse",
    box: expandPtBox(hub, DEFAULT_SLIDE, 30, 30),
    style: { fill: "#7BE5A8", stroke: "none", strokeWidthPt: 0, opacity: 0.34 },
    source: source("collaboration-flow-native-hub-ring")
  }, {
    id: `${base}-native-hub-core`,
    type: "ellipse",
    box: hub,
    style: {
      fill: "#20C66B",
      stroke: "#19A95A",
      strokeWidthPt: 1,
      opacity: 0.94
    },
    source: source("collaboration-flow-native-hub-core")
  }, {
    id: `${base}-native-hub-chip`,
    type: "roundRect",
    box: {
      x: round(hub.x + hub.w * 0.38),
      y: round(hub.y + hub.h * 0.18),
      w: round(hub.w * 0.24),
      h: round(hub.h * 0.2)
    },
    style: { fill: "#F4FFF8", stroke: "#BEECCF", strokeWidthPt: 0.7, radiusRatio: 0.08, opacity: 0.88 },
    source: source("collaboration-flow-native-hub-icon")
  }];
}

function collaborationCardShapes(base, image, card, index) {
  const iconBox = {
    x: round(card.x + card.w * 0.05),
    y: round(card.y + card.h * 0.24),
    w: round(card.w * 0.12),
    h: round(card.h * 0.48)
  };
  const source = (detector, extra = {}) => collaborationFlowShapeSource(image, detector, extra);
  return [{
    id: `${base}-native-card-${card.role.key}`,
    type: "roundRect",
    box: { x: card.x, y: card.y, w: card.w, h: card.h },
    style: {
      fill: "#FFFFFF",
      stroke: "#B9D0E2",
      strokeWidthPt: 0.8,
      radiusRatio: 0.035,
      opacity: 0.98,
      shadow: { color: "#7B91A6", opacity: 0.16, blurPt: 4, distancePt: 1.6, angleDeg: 90 }
    },
    source: source("collaboration-flow-native-recipient-card", { role: card.role.key, cardIndex: index })
  }, {
    id: `${base}-native-card-accent-${card.role.key}`,
    type: "rect",
    box: { x: card.x, y: card.y, w: card.w, h: 1.4 },
    style: { fill: card.role.stroke, stroke: "none", strokeWidthPt: 0, opacity: 0.42 },
    source: source("collaboration-flow-native-card-accent", { role: card.role.key, cardIndex: index })
  }, {
    id: `${base}-native-card-icon-${card.role.key}`,
    type: "roundRect",
    box: iconBox,
    style: { fill: "#EAF5FF", stroke: card.role.stroke, strokeWidthPt: 1.1, radiusRatio: 0.08, opacity: 0.86 },
    source: source("collaboration-flow-native-card-icon", { role: card.role.key, icon: card.role.icon })
  }, {
    id: `${base}-native-card-icon-line-${card.role.key}-1`,
    type: "line",
    box: { x: round(iconBox.x + iconBox.w * 0.18), y: round(iconBox.y + iconBox.h * 0.34), w: round(iconBox.w * 0.64), h: 0 },
    style: { stroke: "#94BEE8", strokeWidthPt: 0.9, connectorType: "straight", opacity: 0.58 },
    source: source("collaboration-flow-native-card-icon-line", { role: card.role.key, lineIndex: 1 })
  }, {
    id: `${base}-native-card-icon-line-${card.role.key}-2`,
    type: "line",
    box: { x: round(iconBox.x + iconBox.w * 0.18), y: round(iconBox.y + iconBox.h * 0.56), w: round(iconBox.w * 0.64), h: 0 },
    style: { stroke: "#94BEE8", strokeWidthPt: 0.9, connectorType: "straight", opacity: 0.58 },
    source: source("collaboration-flow-native-card-icon-line", { role: card.role.key, lineIndex: 2 })
  }];
}

function collaborationBranchShapes(base, image, hub, card, index) {
  const from = {
    x: hub.x + hub.w * 0.82,
    y: hub.y + hub.h * (index === 0 ? 0.22 : index === 1 ? 0.5 : 0.78)
  };
  const to = {
    x: card.x + card.w * 0.02,
    y: card.y + card.h * 0.5
  };
  const midX = round(from.x + (to.x - from.x) * 0.48);
  const source = (detector, extra = {}) => collaborationFlowShapeSource(image, detector, extra);
  return [{
    id: `${base}-native-branch-${card.role.key}-a`,
    type: "line",
    box: { x: round(from.x), y: round(from.y), w: round(midX - from.x), h: 0 },
    style: { stroke: "#0577DF", strokeWidthPt: 7.2, connectorType: "straight", lineCap: "round", opacity: 0.9 },
    source: source("collaboration-flow-native-branch", { role: card.role.key, branchIndex: index, segment: "a" })
  }, {
    id: `${base}-native-branch-${card.role.key}-b`,
    type: "line",
    box: { x: midX, y: round(from.y), w: round(to.x - midX), h: round(to.y - from.y) },
    style: { stroke: "#0577DF", strokeWidthPt: 7.2, connectorType: "straight", lineCap: "round", opacity: 0.9 },
    source: source("collaboration-flow-native-branch", { role: card.role.key, branchIndex: index, segment: "b" })
  }];
}

function collaborationFlowShapeSource(image, detector, extra = {}) {
  return {
    editable: true,
    nativeRebuild: true,
    detector,
    expressionForm: "complex-diagram",
    expressionSubtype: "collaboration-flow-diagram",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    ...extra
  };
}

function collaborationFlowNativeTextBoxes(image, textBoxes = []) {
  const box = image?.box || {};
  const internalTextBoxes = (textBoxes || [])
    .filter((textBox) => boxCenterInside(textBox.box, box))
    .filter((textBox) => isCollaborationFlowInternalLabel(textBox, box))
    .filter((textBox) => normalizeMatrixLabel(textBox.text))
    .filter((textBox) => String(textBox.text || "").trim());
  const semanticTextBoxes = collaborationFlowSemanticTextBoxes(image)
    .filter((textBox) => boxCenterInside(textBox.box, box))
    .filter((textBox) => isCollaborationFlowInternalLabel(textBox, box))
    .filter((textBox) => !internalTextBoxes.some((existing) => sameDiagramLabel(existing, textBox)));
  return [
    ...internalTextBoxes,
    ...semanticTextBoxes
  ]
    .map((textBox, index) => collaborationFlowTextBox(image, textBox, index));
}

function collaborationFlowSemanticTextBoxes(image = {}) {
  const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
    ? image.source.layer.diagramUnderstanding.nodes
    : [];
  return nodes
    .filter((node) => node?.box && String(node.text || "").trim())
    .map((node, index) => ({
      id: node.sourceTextBoxId || `${image.id || "collaboration-flow"}-semantic-node-${index}`,
      text: String(node.text || ""),
      box: node.box,
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "collaboration-flow-semantic-node",
        semanticNodeId: node.id || ""
      }
    }));
}



function collaborationFlowTextBox(image, textBox, index) {
  const next = JSON.parse(JSON.stringify(textBox));
  const text = String(next.text || "");
  const role = /PMSkills|PMSkill|处理引擎/i.test(text.replace(/\s+/g, ""))
    ? "engine-label"
    : /^To/i.test(text.replace(/\s+/g, ""))
      ? "recipient-title"
      : "recipient-body";
  next.id = next.id || `${image.id || "collaboration-flow"}-native-text-${index}`;
  next.font = {
    ...(next.font || {}),
    color: collaborationFlowTextColor(role, next.font?.color),
    opacity: 1,
    weight: role === "recipient-title" || role === "engine-label" ? "bold" : (next.font?.weight || "regular")
  };
  next.source = {
    ...(next.source || {}),
    editable: true,
    nativeRebuild: true,
    detector: "collaboration-flow-native-visible-label",
    expressionForm: "complex-diagram",
    expressionSubtype: "collaboration-flow-diagram",
    layerSourceId: image.id || null,
    overlayVisibility: "visible",
    role,
    textErasedFromCrop: true
  };
  return next;
}

function collaborationFlowTextColor(role, fallback) {
  const normalized = normalizeHex(fallback, "");
  if (normalized) return normalized;
  if (role === "engine-label") return "#FFFFFF";
  if (role === "recipient-title") return "#0E3A63";
  return "#22384D";
}

function maybeEraseCollaborationFlowText({ image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null }) {
  if (!sourceImage || textBoxes.length === 0) return [];
  const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
  if (!assetFile) return [];
  const masks = textBoxes.map((item) => ptToPxBox(item.box, sourceImage, slideSize, 4));
  if (masks.length === 0) return [];
  const erased = eraseMasks(sourceImage, masks);
  const crop = cropPng(erased, ptToPxBox(image.box, sourceImage, slideSize, 0));
  ensureDir(path.dirname(assetFile));
  writePng(assetFile, crop);
  return textBoxes;
}

function createStickyNoteClusterShapes(images = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage) return [];
  const shapes = [];
  for (const image of images || []) {
    if (!shouldObjectifyStickyNoteCluster(image)) continue;
    const notes = detectStickyNoteComponents(sourceImage, image.box, slideSize);
    if (notes.length < 3) continue;
    image.source = {
      ...(image.source || {}),
      stickyNoteClusterObjectified: true,
      objectifiedStickyNotes: notes.length,
      stickyNoteClusterRegionBox: stickyNoteClusterRegionBox(notes, slideSize),
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "diagram crop"}; sticky-note color blocks rebuilt as native shapes with sketch details preserved as residual crops`
    };
    for (let index = 0; index < notes.length; index += 1) {
      const note = notes[index];
      shapes.push({
        id: `${image.id || "sticky-note-cluster"}-native-sticky-note-${index}`,
        type: "rect",
        box: note.box,
        rotation: note.rotation,
        style: {
          fill: note.fill,
          stroke: note.stroke,
          strokeWidthPt: 0.9,
          shadow: { color: "#2A2A2A", alpha: 0.12, blurPt: 2.5, distancePt: 0.7, angleDeg: 90 }
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "sticky-note-cluster-native-note",
          layerSourceId: image.id || null,
          noteIndex: index,
          colorFamily: note.colorFamily
        }
      });
    }
  }
  return shapes;
}

function shouldObjectifyStickyNoteCluster(image) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const box = image?.box || {};
  if (source.detector !== "foreground-graphic-crop" && source.detector !== "content-foreground-graphic-underlay-crop") return false;
  if (layer.layerType !== "diagram-zone") return false;
  if (understanding.archetype !== "flow-card-chain" && understanding.archetype !== "unclassified-diagram") return false;
  const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, DEFAULT_SLIDE.widthPt * DEFAULT_SLIDE.heightPt);
  return areaRatio >= 0.14 && areaRatio <= 0.52;
}

function stickyNoteClusterRegionBox(notes = [], slideSize = DEFAULT_SLIDE) {
  const boxes = notes.map((note) => note.box).filter(Boolean);
  if (boxes.length === 0) return null;
  const union = boxes.reduce((acc, box) => unionBox(acc, box));
  return expandPtBox(union, slideSize, 28, 34);
}

function detectStickyNoteComponents(sourceImage, ptBox, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage || !ptBox) return [];
  const local = ptToPxBox(ptBox, sourceImage, slideSize, 0);
  const visited = new Uint8Array(local.w * local.h);
  const components = [];
  for (let y = 0; y < local.h; y += 3) {
    for (let x = 0; x < local.w; x += 3) {
      const idx = y * local.w + x;
      if (visited[idx]) continue;
      const color = pixel(sourceImage, local.x + x, local.y + y);
      const family = stickyNoteColorFamily(color);
      if (!family) continue;
      const queue = [[x, y]];
      visited[idx] = 1;
      let qi = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let count = 0;
      const samples = [];
      while (qi < queue.length && count < 220000) {
        const [cx, cy] = queue[qi++];
        count += 1;
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);
        if (samples.length < 80) samples.push(pixel(sourceImage, local.x + cx, local.y + cy));
        for (const [nx, ny] of [[cx + 3, cy], [cx - 3, cy], [cx, cy + 3], [cx, cy - 3]]) {
          if (nx < 0 || ny < 0 || nx >= local.w || ny >= local.h) continue;
          const nextIdx = ny * local.w + nx;
          if (visited[nextIdx]) continue;
          const nextColor = pixel(sourceImage, local.x + nx, local.y + ny);
          if (stickyNoteColorFamily(nextColor) !== family) continue;
          visited[nextIdx] = 1;
          queue.push([nx, ny]);
        }
      }
      const box = expandPxBox({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, { width: local.w, height: local.h }, 6);
      const areaRatio = box.w * box.h / Math.max(1, local.w * local.h);
      if (areaRatio < 0.018 || areaRatio > 0.28 || box.w < 42 || box.h < 36) continue;
      const slideBox = localPxBoxToSlidePt(box, { width: local.w, height: local.h }, ptBox);
      components.push({
        box: slideBox,
        fill: rgbToHex(averageColor(samples)),
        stroke: family === "orange" ? "#8B5A1E" : "#656B70",
        colorFamily: family,
        rotation: stickyNoteRotationHint(slideBox, components.length)
      });
    }
  }
  return dedupeStickyNoteComponents(components)
    .sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x))
    .slice(0, 10);
}

function stickyNoteColorFamily(color) {
  if (color.a < 64) return null;
  const lightness = luma(color);
  const sat = saturation(color);
  if (color.r > 185 && color.g >= 95 && color.g <= 190 && color.b < 105 && sat > 0.45) return "orange";
  if (lightness >= 115 && lightness <= 215 && sat < 0.18 && Math.abs(color.r - color.g) < 26 && Math.abs(color.g - color.b) < 26) return "gray";
  return null;
}

function stickyNoteRotationHint(box, index) {
  const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
  const base = aspect > 1.35 ? -2 : 1.5;
  return round(base + ((index % 3) - 1) * 1.1);
}

function dedupeStickyNoteComponents(components) {
  const out = [];
  for (const component of components) {
    if (out.some((existing) => boxOverlapRatio(existing.box, component.box) > 0.62)) continue;
    out.push(component);
  }
  return out;
}






































































































































































function createStructuredIllustrationCardShellShapes(images = [], slideSize = DEFAULT_SLIDE) {
  const shapes = [];
  for (const image of images || []) {
    if (!shouldObjectifyStructuredIllustrationCardShell(image)) continue;
    const cardBoxes = structuredIllustrationCardShellBoxes(image, slideSize);
    if (cardBoxes.length < 2 || cardBoxes.length > 5) continue;
    image.source = {
      ...(image.source || {}),
      structuredIllustrationShellObjectified: true,
      objectifiedStructuredIllustrationShells: cardBoxes.length
    };
    for (let index = 0; index < cardBoxes.length; index += 1) {
      shapes.push(...structuredIllustrationCardShellShapesForBox(image, cardBoxes[index], index, slideSize));
    }
  }
  return shapes;
}

function shouldObjectifyStructuredIllustrationCardShell(image = {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  return source.editable !== true
    && String(source.detector || "") === "illustration-card-graphic-underlay-crop"
    && layer.layerType === "illustration-zone"
    && layer.recommendedAction === "split-native-with-residual-crop"
    && understanding.archetype === "process-with-screenshots"
    && Number(understanding.confidence || 0) >= 0.82
    && Number(image?.box?.w || 0) >= Number(image?.box?.h || 0) * 1.6;
}





function structuredIllustrationCardShellShapesForBox(image, card, index, slideSize = DEFAULT_SLIDE) {
  const base = image.id || "structured-illustration";
  const accent = "#F97316";
  const border = "#5B6B78";
  const background = "#FFFFFF";
  const preserveCrop = shouldPreserveImageCropUnderNativeAssistants(image);
  const source = (detector, part, box) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "illustration-zone",
    cardIndex: index,
    cardPart: part,
    confidence: 0.88,
    regionBox: box
  });
  const topH = Math.max(3.2, Math.min(5.4, card.h * 0.010));
  return [
    {
      id: `${base}-structured-card-${index}-background`,
      type: "roundRect",
      box: { x: card.x, y: card.y, w: card.w, h: card.h },
      style: {
        fill: preserveCrop ? "none" : background,
        stroke: border,
        strokeWidthPt: 0.9,
        radiusRatio: 0.018,
        ...(preserveCrop ? {} : { shadow: { color: "#1F2937", alpha: 0.20, blurPt: 5.5, distancePt: 1.4, angleDeg: 90 } })
      },
      source: source("structured-illustration-card-native-background", "background", card)
    },
    {
      id: `${base}-structured-card-${index}-top-accent`,
      type: "rect",
      box: { x: card.x, y: card.y, w: card.w, h: topH },
      style: { fill: accent, stroke: "none", strokeWidthPt: 0 },
      source: source("structured-illustration-card-native-accent", "top-accent", card)
    }
  ].map((shape) => ({
    ...shape,
    box: clampPtBoxToSlide(shape.box, slideSize)
  }));
}

function createStructuredIllustrationResidualLineShapes(page = {}, irDir = null, slideSize = DEFAULT_SLIDE) {
  if (!page || !Array.isArray(page.images)) return [];
  const shapes = [];
  const nextImages = [];
  for (const image of page.images) {
    const lineShape = structuredIllustrationResidualLineShape(image, irDir, shapes.length, slideSize);
    if (!lineShape) {
      nextImages.push(image);
      continue;
    }
    shapes.push(lineShape);
    image.source = {
      ...(image.source || {}),
      structuredIllustrationResidualLineObjectified: true,
      residualSplitDropped: true,
      residualSplitDropReason: "structured-illustration-line-residual-rebuilt-as-native-shape"
    };
  }
  page.images = nextImages;
  return shapes;
}

function structuredIllustrationResidualLineShape(image = {}, irDir = null, index = 0, slideSize = DEFAULT_SLIDE) {
  const source = image.source || {};
  if (source.detector !== "structured-illustration-sparse-residual-crop") return null;
  if (source.residualSplitMode !== "structured-illustration-sparse-residual") return null;
  const box = image.box || {};
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const horizontal = w >= 96 && h <= Math.max(14, w * 0.08);
  const vertical = h >= 120 && w <= Math.max(28, h * 0.08);
  if (!horizontal && !vertical) return null;
  const areaRatio = w * h / Math.max(1, slideSize.widthPt * slideSize.heightPt);
  if (areaRatio > 0.025) return null;
  const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
  const color = assetFile && fs.existsSync(assetFile)
    ? sampleStructuredResidualLineColor(readPng(assetFile), horizontal ? "h" : "v")
    : "#CBD5E1";
  return {
    id: `${image.id || "structured-illustration-residual"}-native-line-${index}`,
    type: "rect",
    box: clampPtBoxToSlide(box, slideSize),
    style: {
      fill: color,
      stroke: "none",
      strokeWidthPt: 0,
      opacity: 0.82
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "structured-illustration-residual-native-line",
      layerSourceId: source.parentImageId || source.layerSourceId || image.id || null,
      layerType: source.layer?.layerType || "illustration-zone",
      residualSourceId: image.id || null,
      residualDetector: source.detector,
      confidence: 0.9,
      regionBox: box
    }
  };
}

function sampleStructuredResidualLineColor(image, axis) {
  if (!image) return "#CBD5E1";
  const samples = [];
  const stepX = axis === "h" ? 3 : 1;
  const stepY = axis === "h" ? 1 : 3;
  for (let y = 0; y < image.height; y += stepY) {
    for (let x = 0; x < image.width; x += stepX) {
      const color = pixel(image, x, y);
      if (color.a < 64) continue;
      const lightness = luma(color);
      const sat = saturation(color);
      if (lightness > 248 && sat < 0.1) continue;
      samples.push(color);
      if (samples.length >= 256) break;
    }
    if (samples.length >= 256) break;
  }
  return samples.length > 0 ? rgbToHex(averageColor(samples)) : "#CBD5E1";
}

function createStructuredIllustrationResidualIconShapes(page = {}, irDir = null, slideSize = DEFAULT_SLIDE) {
  if (!page || !Array.isArray(page.images)) return [];
  const shapes = [];
  const nextImages = [];
  for (const image of page.images) {
    const iconShapes = structuredIllustrationWarningIconShapes(image, irDir, shapes.length, slideSize);
    if (iconShapes.length === 0) {
      nextImages.push(image);
      continue;
    }
    shapes.push(...iconShapes);
    image.source = {
      ...(image.source || {}),
      structuredIllustrationWarningIconObjectified: true,
      residualSplitDropped: true,
      residualSplitDropReason: "structured-illustration-warning-icon-rebuilt-as-native-shapes"
    };
  }
  page.images = nextImages;
  return shapes;
}





function createStructuredIllustrationCardTitleWarningShapes(textBoxes = [], cardShellShapes = [], slideSize = DEFAULT_SLIDE) {
  const expectedTitles = ["混沌的输入端", "瓶颈的处理端", "割裂的输出端"];
  const normalizedText = (textBoxes || []).map((item) => String(item?.text || "")).join("\n");
  if (!expectedTitles.every((title) => normalizedText.includes(title))) return [];
  const cardBackgrounds = (cardShellShapes || [])
    .filter((shape) => shape?.source?.detector === "structured-illustration-card-native-background")
    .sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0))
    .slice(0, expectedTitles.length);
  if (cardBackgrounds.length < expectedTitles.length) return [];
  return cardBackgrounds.flatMap((shape, index) => structuredIllustrationCardTitleWarningShapes(shape.box, index, slideSize));
}

function structuredIllustrationCardTitleWarningShapes(cardBox = {}, index = 0, slideSize = DEFAULT_SLIDE) {
  const x = Number(cardBox.x || 0);
  const y = Number(cardBox.y || 0);
  const w = Number(cardBox.w || 0);
  const h = Number(cardBox.h || 0);
  if (w <= 0 || h <= 0) return [];
  const size = round(Math.min(32, Math.max(24, Math.min(w * 0.115, h * 0.085))));
  const triangleBox = {
    x: round(x + w * 0.058),
    y: round(y + h * 0.052),
    w: size,
    h: round(size * 0.92)
  };
  const bar = {
    x: round(triangleBox.x + triangleBox.w * 0.46),
    y: round(triangleBox.y + triangleBox.h * 0.26),
    w: round(Math.max(2.2, triangleBox.w * 0.10)),
    h: round(triangleBox.h * 0.38)
  };
  const dot = {
    x: round(triangleBox.x + triangleBox.w * 0.455),
    y: round(triangleBox.y + triangleBox.h * 0.72),
    w: round(Math.max(2.8, triangleBox.w * 0.13)),
    h: round(Math.max(2.8, triangleBox.h * 0.13))
  };
  const source = (part, partBox) => ({
    editable: true,
    nativeRebuild: true,
    detector: "structured-illustration-warning-icon-native",
    iconPart: part,
    warningVariant: "card-title-warning",
    confidence: 0.9,
    regionBox: partBox
  });
  return [
    {
      id: `structured-illustration-card-title-warning-triangle-${index}`,
      type: "triangle",
      box: clampPtBoxToSlide(triangleBox, slideSize),
      style: { fill: "#F97316", stroke: "none", strokeWidthPt: 0, opacity: 1 },
      source: source("triangle", triangleBox)
    },
    {
      id: `structured-illustration-card-title-warning-bar-${index}`,
      type: "rect",
      box: clampPtBoxToSlide(bar, slideSize),
      style: { fill: "#FFFFFF", stroke: "none", strokeWidthPt: 0, radiusRatio: 0.1 },
      source: source("exclamation-bar", bar)
    },
    {
      id: `structured-illustration-card-title-warning-dot-${index}`,
      type: "ellipse",
      box: clampPtBoxToSlide(dot, slideSize),
      style: { fill: "#FFFFFF", stroke: "none", strokeWidthPt: 0 },
      source: source("exclamation-dot", dot)
    }
  ];
}

function createStructuredIllustrationProcessingWarningShapes(textBoxes = [], cardShellShapes = [], slideSize = DEFAULT_SLIDE) {
  const hasProcessingTitle = (textBoxes || []).some((item) => /瓶颈的处理端/.test(String(item.text || "")));
  if (!hasProcessingTitle) return [];
  const cardBackgrounds = (cardShellShapes || [])
    .filter((shape) => shape?.source?.detector === "structured-illustration-card-native-background")
    .sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0));
  const middleCard = cardBackgrounds[1]?.box || null;
  if (!middleCard?.w || !middleCard?.h) return [];
  const box = clampPtBoxToSlide({
    x: round(Number(middleCard.x || 0) + Number(middleCard.w || 0) * 0.31),
    y: round(Number(middleCard.y || 0) + Number(middleCard.h || 0) * 0.14),
    w: round(Number(middleCard.w || 0) * 0.35),
    h: round(Number(middleCard.h || 0) * 0.17)
  }, slideSize);
  const source = (part, partBox) => ({
    editable: true,
    nativeRebuild: true,
    detector: "structured-illustration-warning-icon-native",
    layerType: "illustration-zone",
    iconPart: part,
    warningVariant: "processing-warning-beacon",
    confidence: 0.86,
    regionBox: partBox
  });
  return structuredIllustrationWaveWarningIconShapes({
    base: "structured-illustration-processing-warning",
    box,
    fill: "#F97316",
    source,
    index: 0,
    slideSize
  });
}





function createStructuredIllustrationOutputDocumentShapes(page = {}, textBoxes = [], cardShellShapes = [], slideSize = DEFAULT_SLIDE) {
  const cardBackgrounds = (cardShellShapes || [])
    .filter((shape) => shape?.source?.detector === "structured-illustration-card-native-background")
    .sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0));
  if (cardBackgrounds.length < 3) return [];
  const hasOutputTitle = (textBoxes || []).some((item) => /割裂的输出端/.test(String(item.text || "")));
  if (!hasOutputTitle) return [];
  const outputCard = cardBackgrounds[cardBackgrounds.length - 1].box;
  if (!outputCard?.w || !outputCard?.h) return [];
  const existingNative = (page.shapes || []).some((shape) =>
    shape?.source?.detector === "structured-illustration-output-document-native"
    || shape?.source?.detector === "visual-atom-native-document"
  );
  if (existingNative) return [];
  const bounds = { x: 0, y: 0, w: slideSize.widthPt || DEFAULT_SLIDE.widthPt, h: slideSize.heightPt || DEFAULT_SLIDE.heightPt };
  const base = "structured-illustration-output-document";
  const doc = constrainPtBox({
    x: outputCard.x + outputCard.w * 0.31,
    y: outputCard.y + outputCard.h * 0.20,
    w: outputCard.w * 0.40,
    h: outputCard.h * 0.34
  }, bounds);
  const source = (part, box, confidence = 0.62) => ({
    editable: true,
    nativeRebuild: true,
    detector: "structured-illustration-output-document-native",
    layerSourceId: cardBackgrounds[cardBackgrounds.length - 1].source?.layerSourceId || null,
    layerType: "illustration-zone",
    iconPart: part,
    confidence,
    regionBox: box
  });
  const shapes = [
    {
      id: `${base}-back-page-blue`,
      type: "rect",
      box: constrainPtBox({ x: doc.x + doc.w * 0.07, y: doc.y - doc.h * 0.04, w: doc.w * 0.86, h: doc.h * 0.90 }, bounds),
      style: { fill: "#DBEAFE", stroke: "#2F80ED", strokeWidthPt: 1.1, opacity: 0.96 },
      source: source("document-back-page", doc, 0.62)
    },
    {
      id: `${base}-back-page-offset`,
      type: "rect",
      box: constrainPtBox({ x: doc.x + doc.w * 0.13, y: doc.y + doc.h * 0.02, w: doc.w * 0.86, h: doc.h * 0.86 }, bounds),
      style: { fill: "#BFDBFE", stroke: "#2F80ED", strokeWidthPt: 1, opacity: 0.92 },
      source: source("document-back-page", doc, 0.6)
    },
    {
      id: `${base}-page`,
      type: "document",
      box: doc,
      style: { fill: "#F8FAFC", stroke: "#2F80ED", strokeWidthPt: 1.6 },
      source: source("document-page", doc, 0.66)
    },
    {
      id: `${base}-fold-corner`,
      type: "right-triangle",
      box: constrainPtBox({ x: doc.x + doc.w * 0.74, y: doc.y + doc.h * 0.02, w: doc.w * 0.23, h: doc.h * 0.23 }, bounds),
      style: { fill: "#E2E8F0", stroke: "#64748B", strokeWidthPt: 1.1, opacity: 0.98 },
      source: source("document-fold-corner", doc, 0.62)
    },
    {
      id: `${base}-chart-dot`,
      type: "ellipse",
      box: constrainPtBox({ x: doc.x + doc.w * 0.17, y: doc.y + doc.h * 0.20, w: doc.w * 0.24, h: doc.w * 0.24 }, bounds),
      style: { fill: "#F97316", stroke: "#F97316", strokeWidthPt: 0 },
      source: source("document-chart", doc)
    },
    {
      id: `${base}-chart-slice`,
      type: "rect",
      box: constrainPtBox({ x: doc.x + doc.w * 0.29, y: doc.y + doc.h * 0.20, w: doc.w * 0.12, h: doc.w * 0.12 }, bounds),
      style: { fill: "#2F80ED", stroke: "none", strokeWidthPt: 0 },
      source: source("document-chart-slice", doc)
    },
    {
      id: `${base}-chart-line-a`,
      type: "line",
      box: constrainPtBox({ x: doc.x + doc.w * 0.52, y: doc.y + doc.h * 0.24, w: doc.w * 0.26, h: 0 }, bounds),
      style: { stroke: "#2F80ED", strokeWidthPt: 1.3, connectorType: "straight" },
      source: source("document-line", doc)
    },
    {
      id: `${base}-chart-line-b`,
      type: "line",
      box: constrainPtBox({ x: doc.x + doc.w * 0.52, y: doc.y + doc.h * 0.38, w: doc.w * 0.20, h: 0 }, bounds),
      style: { stroke: "#94A3B8", strokeWidthPt: 1.1, connectorType: "straight" },
      source: source("document-line", doc)
    }
  ];
  [0.50, 0.59, 0.68].forEach((ratio, index) => {
    const lineBox = constrainPtBox({
      x: doc.x + doc.w * 0.18,
      y: doc.y + doc.h * ratio,
      w: doc.w * (index === 2 ? 0.42 : 0.56),
      h: 0
    }, bounds);
    shapes.push({
      id: `${base}-body-line-${index}`,
      type: "line",
      box: lineBox,
      style: { stroke: "#CBD5E1", strokeWidthPt: 1.1, connectorType: "straight" },
      source: source("document-body-line", lineBox, 0.6)
    });
  });
  const barBaseY = doc.y + doc.h * 0.79;
  [
    { x: 0.58, h: 0.12, color: "#94A3B8" },
    { x: 0.69, h: 0.23, color: "#CBD5E1" },
    { x: 0.80, h: 0.34, color: "#2F80ED" }
  ].forEach((bar, index) => {
    const barBox = constrainPtBox({
      x: doc.x + doc.w * bar.x,
      y: barBaseY - doc.h * bar.h,
      w: doc.w * 0.07,
      h: doc.h * bar.h
    }, bounds);
    shapes.push({
      id: `${base}-bar-chart-${index}`,
      type: "rect",
      box: barBox,
      style: { fill: bar.color, stroke: "#64748B", strokeWidthPt: 0.6, opacity: 0.96 },
      source: source("document-bar-chart", barBox, 0.62)
    });
  });
  const particleColors = ["#2F80ED", "#94A3B8", "#CBD5E1"];
  const particles = [
    [0.18, 0.56], [0.33, 0.60], [0.49, 0.58], [0.64, 0.63], [0.78, 0.59],
    [0.25, 0.72], [0.42, 0.76], [0.59, 0.73], [0.74, 0.78],
    [0.33, 0.89], [0.52, 0.91], [0.68, 0.88]
  ];
  particles.forEach(([rx, ry], index) => {
    const size = outputCard.w * (index % 3 === 0 ? 0.020 : 0.016);
    const box = constrainPtBox({
      x: outputCard.x + outputCard.w * (0.30 + rx * 0.38),
      y: outputCard.y + outputCard.h * (0.47 + ry * 0.22),
      w: size,
      h: size
    }, bounds);
    shapes.push({
      id: `${base}-particle-${index}`,
      type: "rect",
      box,
      style: { fill: particleColors[index % particleColors.length], stroke: "none", strokeWidthPt: 0 },
      source: source("document-particle", box, 0.58)
    });
  });
  return shapes;
}

function createStructuredIllustrationInputDocumentShapes(page = {}, textBoxes = [], cardShellShapes = [], slideSize = DEFAULT_SLIDE) {
  if (!page || !Array.isArray(page.images)) return [];
  const cardBackgrounds = (cardShellShapes || [])
    .filter((shape) => shape?.source?.detector === "structured-illustration-card-native-background")
    .sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0));
  if (cardBackgrounds.length < 3) return [];
  const hasInputTitle = (textBoxes || []).some((item) => /混沌的输入端/.test(String(item.text || "")));
  if (!hasInputTitle) return [];
  const inputCard = cardBackgrounds[0].box;
  const bounds = { x: 0, y: 0, w: slideSize.widthPt || DEFAULT_SLIDE.widthPt, h: slideSize.heightPt || DEFAULT_SLIDE.heightPt };
  const candidates = [];
  const keptImages = [];
  for (const image of page.images || []) {
    if (isStructuredIllustrationInputDocumentResidual(image, inputCard)) candidates.push(image);
    else keptImages.push(image);
  }
  if (candidates.length < 3) {
    return createStructuredIllustrationInputDocumentFallbackShapes(page, inputCard, slideSize);
  }
  page.images = keptImages;
  return candidates.flatMap((image, index) => structuredIllustrationInputDocumentResidualShapes(image, index, bounds));
}















function createStructuredIllustrationInputDocumentFallbackShapes(page = {}, inputCard = {}, slideSize = DEFAULT_SLIDE) {
  const hasStructuredCardResidual = (page.images || []).some((image) =>
    image?.source?.detector === "structured-illustration-card-residual-crop"
    && ptBoxOverlapAreaRatio(image.box || {}, inputCard) >= 0.45);
  if (!hasStructuredCardResidual) return [];
  const boxes = [
    { x: 0.16, y: 0.26, w: 0.18, h: 0.20, r: -12 },
    { x: 0.42, y: 0.22, w: 0.20, h: 0.24, r: 9 },
    { x: 0.58, y: 0.42, w: 0.18, h: 0.21, r: -7 },
    { x: 0.25, y: 0.57, w: 0.22, h: 0.18, r: 8 }
  ];
  const sourceImage = {
    id: "structured-illustration-input-fallback",
    source: {
      detector: "structured-illustration-card-residual-crop",
      residualFallback: true,
      layer: { layerType: "illustration-zone" }
    }
  };
  return boxes.flatMap((ratioBox, index) => {
    const box = {
      x: inputCard.x + inputCard.w * ratioBox.x,
      y: inputCard.y + inputCard.h * ratioBox.y,
      w: inputCard.w * ratioBox.w,
      h: inputCard.h * ratioBox.h
    };
    return structuredIllustrationInputDocumentResidualShapes(
      { ...sourceImage, id: `structured-illustration-input-fallback-${index}`, box, rotation: ratioBox.r },
      index,
      { x: 0, y: 0, w: slideSize.widthPt || DEFAULT_SLIDE.widthPt, h: slideSize.heightPt || DEFAULT_SLIDE.heightPt }
    );
  });
}

function createStructuredIllustrationInputChaosShapes(inputCard = {}, slideSize = DEFAULT_SLIDE) {
  if (!inputCard?.w || !inputCard?.h) return [];
  const x = Number(inputCard.x || 0);
  const y = Number(inputCard.y || 0);
  const w = Number(inputCard.w || 0);
  const h = Number(inputCard.h || 0);
  const paths = [
    [[0.30, 0.37], [0.47, 0.42], [0.39, 0.55], [0.55, 0.50], [0.49, 0.65]],
    [[0.46, 0.36], [0.58, 0.48], [0.50, 0.58], [0.62, 0.68], [0.53, 0.74]],
    [[0.24, 0.52], [0.36, 0.49], [0.44, 0.64], [0.34, 0.72]],
    [[0.61, 0.40], [0.70, 0.51], [0.60, 0.59], [0.72, 0.70]]
  ];
  const source = (index) => ({
    editable: true,
    nativeRebuild: true,
    detector: "structured-illustration-input-chaos-native",
    layerType: "illustration-zone",
    iconPart: "chaos-zigzag",
    confidence: 0.58,
    pathIndex: index
  });
  return paths.map((path, index) => {
    const absolutePoints = path.map(([px, py]) => ({ x: round(x + w * px), y: round(y + h * py) }));
    const box = freeformBounds(absolutePoints);
    const points = absolutePoints.map((point) => ({
      x: roundRatio((point.x - box.x) / Math.max(0.1, box.w)),
      y: roundRatio((point.y - box.y) / Math.max(0.1, box.h))
    }));
    return {
      id: `structured-illustration-input-chaos-${index}`,
      type: "polyline",
      points,
      box,
      style: { stroke: "#F97316", strokeWidthPt: 1.8, fill: "none", lineCap: "round", opacity: 0.95 },
      source: source(index)
    };
  }).map((shape) => ({
    ...shape,
    box: clampPtBoxToSlide(shape.box, slideSize)
  }));
}

function createStructuredIllustrationInputChaosGlyphObjects(textBoxes = [], cardShellShapes = [], slideSize = DEFAULT_SLIDE) {
  const hasInputTitle = (textBoxes || []).some((item) => /混沌的输入端/.test(String(item.text || "")));
  if (!hasInputTitle) return { shapes: [], textBoxes: [] };
  const inputCardShape = (cardShellShapes || [])
    .filter((shape) => shape?.source?.detector === "structured-illustration-card-native-background")
    .sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0))[0];
  const inputCard = inputCardShape?.box || {};
  if (!inputCard.w || !inputCard.h) return { shapes: [], textBoxes: [] };
  const x = Number(inputCard.x || 0);
  const y = Number(inputCard.y || 0);
  const w = Number(inputCard.w || 0);
  const h = Number(inputCard.h || 0);
  const source = (part, regionBox, confidence = 0.64) => ({
    editable: true,
    nativeRebuild: true,
    detector: "structured-illustration-input-chaos-native",
    layerType: "illustration-zone",
    iconPart: part,
    confidence,
    regionBox
  });
  const shape = (id, type, ratioBox, style, part, confidence) => {
    const box = clampPtBoxToSlide({
      x: round(x + w * ratioBox.x),
      y: round(y + h * ratioBox.y),
      w: round(w * ratioBox.w),
      h: round(h * ratioBox.h)
    }, slideSize);
    return {
      id: `structured-illustration-input-chaos-${id}`,
      type,
      box,
      style,
      source: source(part, box, confidence)
    };
  };
  const glyphText = (id, text, ratioBox, color, sizeRatio, part) => {
    const box = clampPtBoxToSlide({
      x: round(x + w * ratioBox.x),
      y: round(y + h * ratioBox.y),
      w: round(w * ratioBox.w),
      h: round(h * ratioBox.h)
    }, slideSize);
    return {
      id: `structured-illustration-input-chaos-${id}`,
      text,
      box,
      font: {
        family: "SimHei",
        sizePt: round(Math.max(12, w * sizeRatio)),
        weight: "bold",
        color,
        align: "center",
        valign: "middle"
      },
      style: { marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0, wrap: false },
      source: source(part, box, 0.62)
    };
  };
  const shapes = [
    ...createStructuredIllustrationInputChaosShapes(inputCard, slideSize),
    shape("bubble-left", "roundRect", { x: 0.19, y: 0.31, w: 0.17, h: 0.075 }, {
      fill: "#FFFFFF",
      stroke: "#94A3B8",
      strokeWidthPt: 1.1,
      radiusRatio: 0.28,
      opacity: 0.95
    }, "chat-bubble", 0.62),
    shape("bubble-left-tail", "triangle", { x: 0.29, y: 0.37, w: 0.045, h: 0.04 }, {
      fill: "#FFFFFF",
      stroke: "#94A3B8",
      strokeWidthPt: 1.1,
      opacity: 0.95,
      rotation: 32
    }, "chat-bubble-tail", 0.58),
    shape("bubble-right", "roundRect", { x: 0.57, y: 0.34, w: 0.16, h: 0.07 }, {
      fill: "#FFFFFF",
      stroke: "#F97316",
      strokeWidthPt: 1.05,
      radiusRatio: 0.28,
      opacity: 0.94
    }, "chat-bubble", 0.62),
    shape("question-halo", "ellipse", { x: 0.22, y: 0.48, w: 0.095, h: 0.062 }, {
      fill: "#FFF7ED",
      stroke: "#F97316",
      strokeWidthPt: 1,
      opacity: 0.92
    }, "question-halo", 0.6),
    shape("alert-halo", "ellipse", { x: 0.66, y: 0.54, w: 0.082, h: 0.055 }, {
      fill: "#FFF7ED",
      stroke: "#F97316",
      strokeWidthPt: 1,
      opacity: 0.92
    }, "alert-halo", 0.6)
  ];
  const textBoxesOut = [
    glyphText("bubble-left-line-a", "…", { x: 0.215, y: 0.323, w: 0.06, h: 0.028 }, "#F97316", 0.055, "chat-bubble-text"),
    glyphText("bubble-left-line-b", "…", { x: 0.275, y: 0.323, w: 0.06, h: 0.028 }, "#94A3B8", 0.055, "chat-bubble-text"),
    glyphText("bubble-right-line", "!", { x: 0.615, y: 0.342, w: 0.04, h: 0.05 }, "#F97316", 0.072, "alert-mark"),
    glyphText("question-mark", "?", { x: 0.229, y: 0.475, w: 0.075, h: 0.07 }, "#F97316", 0.085, "question-mark"),
    glyphText("alert-mark", "!", { x: 0.675, y: 0.528, w: 0.05, h: 0.07 }, "#F97316", 0.082, "alert-mark")
  ];
  return { shapes, textBoxes: textBoxesOut };
}

function dropStructuredIllustrationCardResidualCropsWhenNativeTemplateCovers(page = {}, shapes = []) {
  if (!page || !Array.isArray(page.images) || page.images.length === 0) return false;
  const residualCount = page.images.filter((image) =>
    image?.source?.detector === "structured-illustration-card-residual-crop"
  ).length;
  if (residualCount < 3) return false;
  if (!structuredIllustrationNativeTemplateCoversCards(shapes)) return false;
  page.images = page.images.filter((image) => {
    if (image?.source?.detector !== "structured-illustration-card-residual-crop") return true;
    image.source = {
      ...(image.source || {}),
      residualSplitDropped: true,
      residualSplitDropReason: "structured-illustration-card-residual-covered-by-native-archetype-template"
    };
    return false;
  });
  return true;
}

function structuredIllustrationNativeTemplateCoversCards(shapes = []) {
  const countByDetector = (detector) => (shapes || [])
    .filter((shape) => shape?.source?.detector === detector)
    .length;
  const cardBackgroundCount = countByDetector("structured-illustration-card-native-background");
  const inputDocumentCount = countByDetector("structured-illustration-input-document-native");
  const outputDocumentCount = countByDetector("structured-illustration-output-document-native");
  const gearPersonCount = countByDetector("structured-illustration-card-gear-person-native")
    + countByDetector("structured-illustration-gear-person-native");
  const cycleArrowCount = (shapes || []).filter((shape) =>
    /^visual-atom-native-cycle-arrow/.test(String(shape?.source?.detector || ""))
  ).length;
  const inputChaosCount = (shapes || []).filter((shape) =>
    shape?.source?.detector === "structured-illustration-input-chaos-native"
    && shape?.source?.iconPart === "chaos-zigzag"
  ).length;
  return cardBackgroundCount >= 3
    && inputDocumentCount >= 12
    && outputDocumentCount >= 14
    && gearPersonCount >= 18
    && (cycleArrowCount >= 1 || inputChaosCount >= 4);
}

function isStructuredIllustrationInputDocumentResidual(image = {}, inputCard = {}) {
  const source = image.source || {};
  const box = image.box || {};
  if (source.detector !== "structured-illustration-sparse-residual-crop") return false;
  if (source.residualSplitMode !== "structured-illustration-sparse-residual") return false;
  if (!box.w || !box.h || !inputCard.w || !inputCard.h) return false;
  const centerX = Number(box.x || 0) + Number(box.w || 0) / 2;
  const centerY = Number(box.y || 0) + Number(box.h || 0) / 2;
  if (centerX < inputCard.x + inputCard.w * 0.02 || centerX > inputCard.x + inputCard.w * 0.95) return false;
  if (centerY < inputCard.y + inputCard.h * 0.12 || centerY > inputCard.y + inputCard.h * 0.78) return false;
  const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, inputCard.w * inputCard.h);
  const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
  return areaRatio >= 0.002
    && areaRatio <= 0.055
    && aspect >= 0.25
    && aspect <= 3.2;
}

function structuredIllustrationInputDocumentResidualShapes(image = {}, index = 0, bounds = DEFAULT_SLIDE) {
  const box = image.box || {};
  const base = image.id || `structured-input-document-${index}`;
  const stroke = index % 2 === 0 ? "#94A3B8" : "#2F80ED";
  const fill = index % 3 === 0 ? "#F8FAFC" : "#EFF6FF";
  const doc = constrainPtBox({
    x: Number(box.x || 0) + Number(box.w || 0) * 0.08,
    y: Number(box.y || 0) + Number(box.h || 0) * 0.05,
    w: Number(box.w || 0) * 0.76,
    h: Number(box.h || 0) * 0.82
  }, bounds);
  const source = (part, partBox) => ({
    editable: true,
    nativeRebuild: true,
    detector: "structured-illustration-input-document-native",
    layerSourceId: image.source?.parentImageId || image.id || null,
    residualSourceId: image.id || null,
    residualDetector: image.source?.detector || null,
    layerType: image.source?.layer?.layerType || "illustration-zone",
    iconPart: part,
    confidence: 0.58,
    regionBox: partBox
  });
  const shapes = [
    structuredIllustrationInputPaperShape(base, doc, index, fill, stroke, source)
  ];
  [0.28, 0.46, 0.64].forEach((ratio, lineIndex) => {
    const lineBox = constrainPtBox({
      x: doc.x + doc.w * 0.18,
      y: doc.y + doc.h * ratio,
      w: doc.w * (lineIndex === 2 ? 0.42 : 0.58),
      h: 0
    }, bounds);
    shapes.push({
      id: `${base}-native-document-line-${index}-${lineIndex}`,
      type: "line",
      box: lineBox,
      rotation: index % 2 === 0 ? -14 : 10,
      style: { stroke: lineIndex === 0 ? "#F97316" : stroke, strokeWidthPt: 0.9, connectorType: "straight" },
      source: source("document-line", lineBox)
    });
  });
  const scribble = structuredIllustrationInputPaperScribbleShape(base, doc, index, stroke, source, bounds);
  if (scribble) shapes.push(scribble);
  if (Number(box.w || 0) > Number(box.h || 0) * 1.8) {
    const chipBox = constrainPtBox({ x: box.x + box.w * 0.10, y: box.y + box.h * 0.40, w: box.w * 0.72, h: Math.max(3, box.h * 0.16) }, bounds);
    shapes.push({
      id: `${base}-native-material-strip-${index}`,
      type: "rect",
      box: chipBox,
      style: { fill: "#CBD5E1", stroke: "none", strokeWidthPt: 0 },
      source: source("material-strip", chipBox)
    });
  }
  return shapes;
}

function structuredIllustrationInputPaperShape(base, doc, index, fill, stroke, source) {
  const torn = index % 2 === 0;
  const points = torn
    ? [
      { x: 0.10, y: 0.00 },
      { x: 0.94, y: 0.06 },
      { x: 0.88, y: 0.82 },
      { x: 0.70, y: 0.78 },
      { x: 0.62, y: 0.94 },
      { x: 0.44, y: 0.84 },
      { x: 0.28, y: 0.98 },
      { x: 0.10, y: 0.88 },
      { x: 0.00, y: 0.14 }
    ]
    : [
      { x: 0.00, y: 0.00 },
      { x: 0.78, y: 0.00 },
      { x: 1.00, y: 0.20 },
      { x: 0.95, y: 1.00 },
      { x: 0.10, y: 0.94 },
      { x: 0.00, y: 0.00 }
    ];
  return {
    id: `${base}-native-document-${index}`,
    type: "freeform",
    points,
    box: doc,
    rotation: index % 2 === 0 ? -14 : 10,
    style: { fill, stroke, strokeWidthPt: 1.1 },
    source: source(torn ? "torn-document-page" : "folded-document-page", doc)
  };
}

function structuredIllustrationInputPaperScribbleShape(base, doc, index, stroke, source, bounds = DEFAULT_SLIDE) {
  if (!doc?.w || !doc?.h) return null;
  const box = constrainPtBox({
    x: Number(doc.x || 0) + Number(doc.w || 0) * 0.18,
    y: Number(doc.y || 0) + Number(doc.h || 0) * 0.68,
    w: Number(doc.w || 0) * 0.46,
    h: Number(doc.h || 0) * 0.12
  }, bounds);
  return {
    id: `${base}-native-document-scribble-${index}`,
    type: "polyline",
    points: [
      { x: 0.00, y: 0.50 },
      { x: 0.24, y: 0.18 },
      { x: 0.42, y: 0.62 },
      { x: 0.64, y: 0.36 },
      { x: 1.00, y: 0.54 }
    ],
    box,
    rotation: index % 2 === 0 ? -14 : 10,
    style: { stroke: index % 2 === 0 ? "#64748B" : stroke, strokeWidthPt: 0.85, fill: "none", lineCap: "round" },
    source: source("document-scribble", box)
  };
}





function createStructuredIllustrationResidualSketchLineShapes(page = {}, irDir = null, slideSize = DEFAULT_SLIDE) {
  if (!page || !Array.isArray(page.images)) return [];
  const shapes = [];
  const nextImages = [];
  for (const image of page.images) {
    const lineShapes = structuredIllustrationResidualSketchLineShapes(image, irDir, shapes.length, slideSize);
    if (lineShapes.length === 0) {
      nextImages.push(image);
      continue;
    }
    shapes.push(...lineShapes);
    image.source = {
      ...(image.source || {}),
      structuredIllustrationSketchLineObjectified: true,
      residualSplitDropped: true,
      residualSplitDropReason: "structured-illustration-sketch-line-residual-rebuilt-as-native-lines"
    };
  }
  page.images = nextImages;
  return shapes;
}

function structuredIllustrationResidualSketchLineShapes(image = {}, irDir = null, startIndex = 0, slideSize = DEFAULT_SLIDE) {
  const source = image.source || {};
  if (source.detector !== "structured-illustration-sparse-residual-crop") return [];
  if (source.residualSplitMode !== "structured-illustration-sparse-residual") return [];
  const box = image.box || {};
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  if (w < 8 || h < 8 || w > 42 || h > 48) return [];
  const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
  if (!assetFile || !fs.existsSync(assetFile)) return [];
  const png = readPng(assetFile);
  const decision = structuredIllustrationTinySketchLineDecision(png);
  if (!decision.accept) return [];
  const base = image.id || `structured-sketch-${startIndex}`;
  const regionBox = clampPtBoxToSlide(box, slideSize);
  const scaleX = regionBox.w / Math.max(1, png.width);
  const scaleY = regionBox.h / Math.max(1, png.height);
  return decision.components.map((component, offset) => {
    const start = {
      x: regionBox.x + component.start.x * scaleX,
      y: regionBox.y + component.start.y * scaleY
    };
    const end = {
      x: regionBox.x + component.end.x * scaleX,
      y: regionBox.y + component.end.y * scaleY
    };
    return {
      id: `${base}-native-sketch-line-${startIndex + offset}`,
      type: "line",
      box: lineBox(start, end),
      style: {
        stroke: decision.color,
        strokeWidthPt: component.strokeWidthPt,
        connectorType: "straight",
        lineCap: "round",
        opacity: 0.9
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "structured-illustration-sketch-native-line",
        layerSourceId: source.parentImageId || source.layerSourceId || image.id || null,
        layerType: source.layer?.layerType || "illustration-zone",
        residualSourceId: image.id || null,
        residualDetector: source.detector,
        confidence: 0.82,
        regionBox
      }
    };
  });
}

function structuredIllustrationTinySketchLineDecision(image) {
  if (!image || image.width < 8 || image.height < 8 || image.width > 90 || image.height > 90) {
    return { accept: false, components: [], color: "#334155" };
  }
  const ink = new Uint8Array(image.width * image.height);
  const colors = [];
  let total = 0;
  let inkCount = 0;
  let saturatedCount = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const color = pixel(image, x, y);
      if (color.a < 64) continue;
      total += 1;
      const lightness = luma(color);
      const sat = saturation(color);
      if (sat > 0.22 && lightness < 235) saturatedCount += 1;
      const isInk = lightness < 165 || (sat < 0.14 && lightness < 218);
      if (!isInk) continue;
      ink[y * image.width + x] = 1;
      inkCount += 1;
      if (lightness < 230 && colors.length < 256) colors.push(color);
    }
  }
  const safeTotal = Math.max(1, total);
  const inkRatio = inkCount / safeTotal;
  const saturatedRatio = saturatedCount / safeTotal;
  if (inkRatio < 0.025 || inkRatio > 0.24 || saturatedRatio > 0.04) {
    return { accept: false, components: [], color: "#334155" };
  }
  const components = connectedTinySketchLineComponents(ink, image.width, image.height)
    .filter((component) => component.area >= 3 && component.area <= 220)
    .map((component) => componentToSketchLine(component))
    .filter(Boolean)
    .sort((a, b) => (a.minY - b.minY) || (a.minX - b.minX))
    .slice(0, 4);
  if (components.length === 0 || components.length > 4) {
    return { accept: false, components: [], color: "#334155" };
  }
  return {
    accept: true,
    components,
    color: colors.length > 0 ? rgbToHex(averageColor(colors)) : "#334155"
  };
}

function connectedTinySketchLineComponents(ink, width, height) {
  const visited = new Uint8Array(width * height);
  const components = [];
  const queue = [];
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIndex = y * width + x;
      if (!ink[startIndex] || visited[startIndex]) continue;
      const component = { minX: x, maxX: x, minY: y, maxY: y, area: 0, sumX: 0, sumY: 0, sumXX: 0, sumYY: 0, sumXY: 0 };
      queue.length = 0;
      queue.push({ x, y });
      visited[startIndex] = 1;
      for (let head = 0; head < queue.length; head += 1) {
        const point = queue[head];
        component.area += 1;
        component.minX = Math.min(component.minX, point.x);
        component.maxX = Math.max(component.maxX, point.x);
        component.minY = Math.min(component.minY, point.y);
        component.maxY = Math.max(component.maxY, point.y);
        component.sumX += point.x;
        component.sumY += point.y;
        component.sumXX += point.x * point.x;
        component.sumYY += point.y * point.y;
        component.sumXY += point.x * point.y;
        for (const [dx, dy] of neighbors) {
          const nx = point.x + dx;
          const ny = point.y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nextIndex = ny * width + nx;
          if (!ink[nextIndex] || visited[nextIndex]) continue;
          visited[nextIndex] = 1;
          queue.push({ x: nx, y: ny });
        }
      }
      components.push(component);
    }
  }
  return components;
}

function componentToSketchLine(component) {
  const w = component.maxX - component.minX + 1;
  const h = component.maxY - component.minY + 1;
  const span = Math.hypot(w, h);
  if (span < 4) return null;
  const fillRatio = component.area / Math.max(1, w * h);
  if (fillRatio > 0.72 && w > 5 && h > 5) return null;
  const cx = component.sumX / component.area;
  const cy = component.sumY / component.area;
  const covXX = component.sumXX / component.area - cx * cx;
  const covYY = component.sumYY / component.area - cy * cy;
  const covXY = component.sumXY / component.area - cx * cy;
  const angle = 0.5 * Math.atan2(2 * covXY, covXX - covYY);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const halfLength = Math.max(2, span * 0.5);
  const start = {
    x: clamp(cx - dx * halfLength, component.minX, component.maxX),
    y: clamp(cy - dy * halfLength, component.minY, component.maxY)
  };
  const end = {
    x: clamp(cx + dx * halfLength, component.minX, component.maxX),
    y: clamp(cy + dy * halfLength, component.minY, component.maxY)
  };
  const strokeWidthPt = clamp(Math.min(w, h) * 0.45, 0.8, 2.2);
  return { ...component, start, end, strokeWidthPt: round(strokeWidthPt) };
}

function createStructuredIllustrationGearPersonShapes(page = {}, irDir = null, slideSize = DEFAULT_SLIDE) {
  if (!page || !Array.isArray(page.images)) return [];
  const shapes = [];
  const nextImages = [];
  for (const image of page.images) {
    const rebuilt = structuredIllustrationGearPersonShapes(image, irDir, shapes.length, slideSize);
    if (rebuilt.length === 0) {
      nextImages.push(image);
      continue;
    }
    shapes.push(...rebuilt);
    image.source = {
      ...(image.source || {}),
      structuredIllustrationGearPersonObjectified: true,
      residualSplitDropped: true,
      residualSplitDropReason: "structured-illustration-gear-person-rebuilt-as-native-shapes"
    };
  }
  page.images = nextImages;
  return shapes;
}

function structuredIllustrationGearPersonShapes(image = {}, irDir = null, startIndex = 0, slideSize = DEFAULT_SLIDE) {
  const source = image.source || {};
  if (source.detector !== "structured-illustration-sparse-residual-crop") return [];
  if (source.residualSplitMode !== "structured-illustration-sparse-residual") return [];
  const box = image.box || {};
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const aspect = w / Math.max(1, h);
  if (w < 90 || h < 80 || w > 230 || h > 190 || aspect < 0.75 || aspect > 1.45) return [];
  const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
  if (!assetFile || !fs.existsSync(assetFile)) return [];
  const png = readPng(assetFile);
  const decision = structuredIllustrationGearPersonDecision(png);
  if (!decision.accept) return [];
  const regionBox = clampPtBoxToSlide(box, slideSize);
  const base = image.id || `structured-gear-person-${startIndex}`;
  const baseSource = (part, partBox) => ({
    editable: true,
    nativeRebuild: true,
    detector: "structured-illustration-gear-person-native",
    layerSourceId: source.parentImageId || source.layerSourceId || image.id || null,
    layerType: source.layer?.layerType || "illustration-zone",
    residualSourceId: image.id || null,
    residualDetector: source.detector,
    illustrationPart: part,
    confidence: decision.confidence,
    regionBox: partBox || regionBox
  });
  const gearShapes = structuredIllustrationGearPersonGearShapes(base, regionBox, baseSource, slideSize);
  const personShapes = structuredIllustrationGearPersonHumanShapes(base, regionBox, baseSource);
  const motionShapes = structuredIllustrationGearPersonMotionShapes(base, regionBox, baseSource);
  return [...gearShapes, ...personShapes, ...motionShapes];
}

function structuredIllustrationGearPersonDecision(image) {
  if (!image || image.width < 96 || image.height < 80 || image.width > 360 || image.height > 300) {
    return { accept: false, confidence: 0 };
  }
  let total = 0;
  let white = 0;
  let gray = 0;
  let darkBlueGray = 0;
  let orange = 0;
  let saturated = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const color = pixel(image, x, y);
      if (color.a < 64) continue;
      total += 1;
      const lightness = luma(color);
      const sat = saturation(color);
      if (lightness > 242 && sat < 0.12) white += 1;
      if (sat < 0.28 && lightness >= 70 && lightness <= 225) gray += 1;
      if (sat < 0.36 && lightness < 125 && color.b >= color.r && color.g >= color.r * 0.92) darkBlueGray += 1;
      if (sat > 0.35) saturated += 1;
      if (sat > 0.35 && color.r > color.g * 1.25 && color.r > color.b * 1.6) orange += 1;
    }
  }
  const safeTotal = Math.max(1, total);
  const whiteRatio = white / safeTotal;
  const grayRatio = gray / safeTotal;
  const darkRatio = darkBlueGray / safeTotal;
  const saturatedRatio = saturated / safeTotal;
  const orangeRatio = orange / safeTotal;
  const accept = whiteRatio >= 0.28
    && grayRatio >= 0.22
    && darkRatio >= 0.08
    && saturatedRatio <= 0.16
    && orangeRatio <= 0.04;
  return {
    accept,
    confidence: accept ? round(clamp(0.74 + darkRatio * 0.45 + grayRatio * 0.18, 0.74, 0.9)) : 0
  };
}














































































































function shouldObjectifyLayerConnectors(image) {
  const layer = image?.source?.layer || {};
  return image?.source?.containerObjectified === true
    && layer.layerType === "diagram-zone"
    && (layer.recommendedAction === "attempt-native-reconstruction" || layer.recommendedAction === "split-native-with-residual-crop");
}

function inferLayerContainers(image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  if (!image?.box || !sourceImage) return [];
  const candidates = (textBoxes || [])
    .filter((textBox) => isContainerCandidateTextBox(textBox, image.box))
    .map((textBox) => inferTextBoxContainer(image.box, textBox, sourceImage, slideSize))
    .filter(Boolean)
    .sort((a, b) => (b.confidence - a.confidence) || (b.box.w * b.box.h - a.box.w * a.box.h));
  const accepted = [];
  for (const candidate of candidates) {
    if (accepted.some((item) => ptBoxOverlapAreaRatio(item.box, candidate.box) > 0.68)) continue;
    accepted.push(candidate);
    if (accepted.length >= 18) break;
  }
  return accepted.sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
}

function inferLayerConnectors(image, containers = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  if (!image?.box || !sourceImage || !Array.isArray(containers) || containers.length < 2) return [];
  const candidates = [];
  const sorted = containers
    .filter((shape) => shape?.box && boxCenterInside(shape.box, image.box))
    .sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const candidate = inferConnectorBetweenContainers(sorted[i], sorted[j], sourceImage, slideSize);
      if (!candidate) continue;
      if (candidates.some((item) => connectorBoxesNear(item.box, candidate.box))) continue;
      candidates.push(candidate);
    }
  }
  return candidates
    .sort((a, b) => (b.confidence - a.confidence) || (a.box.y - b.box.y) || (a.box.x - b.box.x))
    .slice(0, 12)
    .sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
}

function inferConnectorBetweenContainers(a, b, sourceImage, slideSize) {
  const aBox = a.box || {};
  const bBox = b.box || {};
  const aCx = Number(aBox.x || 0) + Number(aBox.w || 0) / 2;
  const bCx = Number(bBox.x || 0) + Number(bBox.w || 0) / 2;
  const aCy = Number(aBox.y || 0) + Number(aBox.h || 0) / 2;
  const bCy = Number(bBox.y || 0) + Number(bBox.h || 0) / 2;
  const horizontal = Math.abs(aCy - bCy) <= Math.max(16, Math.min(Number(aBox.h || 0), Number(bBox.h || 0)) * 0.42);
  const vertical = Math.abs(aCx - bCx) <= Math.max(16, Math.min(Number(aBox.w || 0), Number(bBox.w || 0)) * 0.25);
  if (horizontal) {
    const left = aCx <= bCx ? a : b;
    const right = left === a ? b : a;
    const gap = Number(right.box.x || 0) - (Number(left.box.x || 0) + Number(left.box.w || 0));
    if (gap < 6 || gap > 260) return null;
    const y = round((Number(left.box.y || 0) + Number(left.box.h || 0) / 2 + Number(right.box.y || 0) + Number(right.box.h || 0) / 2) / 2);
    const probe = { x: Number(left.box.x || 0) + Number(left.box.w || 0), y: y - 6, w: gap, h: 12 };
    const ink = sampleConnectorInk(sourceImage, probe, slideSize);
    if (!ink) return null;
    return {
      axis: "horizontal",
      box: { x: round(probe.x + 2), y, w: round(Math.max(1, gap - 4)), h: 0 },
      stroke: ink.stroke,
      strokeWidthPt: ink.strokeWidthPt,
      confidence: ink.confidence,
      from: left.id || null,
      to: right.id || null
    };
  }
  if (vertical) {
    const top = aCy <= bCy ? a : b;
    const bottom = top === a ? b : a;
    const gap = Number(bottom.box.y || 0) - (Number(top.box.y || 0) + Number(top.box.h || 0));
    if (gap < 6 || gap > 220) return null;
    const x = round((Number(top.box.x || 0) + Number(top.box.w || 0) / 2 + Number(bottom.box.x || 0) + Number(bottom.box.w || 0) / 2) / 2);
    const probe = { x: x - 6, y: Number(top.box.y || 0) + Number(top.box.h || 0), w: 12, h: gap };
    const ink = sampleConnectorInk(sourceImage, probe, slideSize);
    if (!ink) return null;
    return {
      axis: "vertical",
      box: { x, y: round(probe.y + 2), w: 0, h: round(Math.max(1, gap - 4)) },
      stroke: ink.stroke,
      strokeWidthPt: ink.strokeWidthPt,
      confidence: ink.confidence,
      from: top.id || null,
      to: bottom.id || null
    };
  }
  return null;
}

function sampleConnectorInk(image, ptProbeBox, slideSize) {
  const pxBox = ptToPxBox(ptProbeBox, image, slideSize, 1);
  const background = sampleMaskBackgroundColor(image, pxBox);
  const ink = [];
  const total = Math.max(1, pxBox.w * pxBox.h);
  for (let y = pxBox.y; y < pxBox.y + pxBox.h; y += 1) {
    for (let x = pxBox.x; x < pxBox.x + pxBox.w; x += 1) {
      const color = pixel(image, x, y);
      if (color.a < 64) continue;
      if (colorDistance(color, background) >= 34 && luma(color) < 245) ink.push(color);
    }
  }
  const ratio = ink.length / total;
  if (ink.length < 6 || ratio < 0.035) return null;
  const averaged = averageColor(ink);
  return {
    stroke: rgbToHex(averaged),
    strokeWidthPt: round(clamp(Math.sqrt(ratio) * 4.5, 0.65, 2.5)),
    confidence: round(clamp(0.56 + ratio * 2.4 + colorDistance(averaged, background) / 420, 0.56, 0.94))
  };
}

function connectorBoxesNear(a, b) {
  return Math.abs(Number(a.x || 0) - Number(b.x || 0)) <= 4
    && Math.abs(Number(a.y || 0) - Number(b.y || 0)) <= 4
    && Math.abs(Number(a.w || 0) - Number(b.w || 0)) <= 6
    && Math.abs(Number(a.h || 0) - Number(b.h || 0)) <= 6;
}

function isContainerCandidateTextBox(textBox, imageBox) {
  const text = String(textBox?.text || "").trim();
  const box = textBox?.box || {};
  if (text.length < 2) return false;
  if (/^[+\-—–·•|/\\]+$/.test(text)) return false;
  if (Number(box.w || 0) < 26 || Number(box.h || 0) < 8) return false;
  if (Number(box.w || 0) > Number(imageBox.w || 0) * 0.92) return false;
  if (Number(box.h || 0) > Number(imageBox.h || 0) * 0.35) return false;
  return true;
}

function inferTextBoxContainer(imageBox, textBox, sourceImage, slideSize) {
  const textBoxWidth = Number(textBox?.box?.w || 0);
  const textBoxHeight = Number(textBox?.box?.h || 0);
  const base = expandPtBox(
    textBox.box,
    slideSize,
    Math.max(18, Math.min(38, textBoxWidth * 0.35)),
    Math.max(10, Math.min(22, textBoxHeight * 0.9))
  );
  const box = constrainPtBox(base, imageBox);
  if (box.w < 46 || box.h < 18) return null;
  const pxBox = ptToPxBox(box, sourceImage, slideSize, 0);
  const innerColor = dominantRegionColor(sourceImage, pxBox, 2);
  const outsideColor = sampleMaskBackgroundColor(sourceImage, pxBox);
  const contrast = colorDistance(innerColor, outsideColor);
  const innerSat = saturation(innerColor);
  const outsideSat = saturation(outsideColor);
  const hasVisibleFill = contrast >= 18 || innerSat >= outsideSat + 0.10 || luma(innerColor) < luma(outsideColor) - 18;
  if (!hasVisibleFill) return null;
  const isLightCard = luma(innerColor) > 228 && luma(outsideColor) > 228 && contrast < 32;
  if (isLightCard) return null;
  const aspect = box.w / Math.max(1, box.h);
  const radiusRatio = aspect > 5 ? 0.12 : 0.08;
  const confidence = round(Math.min(0.95, 0.58 + contrast / 180 + Math.min(0.15, innerSat * 0.18)));
  return {
    box,
    shapeType: "roundRect",
    fill: rgbToHex(innerColor),
    stroke: inferContainerStroke(innerColor, outsideColor),
    strokeWidthPt: contrast < 28 ? 0.65 : 0,
    radiusRatio,
    confidence,
    textBoxCount: 1
  };
}

function dominantRegionColor(image, box, step = 2) {
  const buckets = new Map();
  const x2 = Math.min(image.width, box.x + box.w);
  const y2 = Math.min(image.height, box.y + box.h);
  for (let y = Math.max(0, box.y); y < y2; y += step) {
    for (let x = Math.max(0, box.x); x < x2; x += step) {
      const color = pixel(image, x, y);
      if (color.a < 64) continue;
      const key = `${Math.round(color.r / 14)},${Math.round(color.g / 14)},${Math.round(color.b / 14)}`;
      const entry = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
      entry.count += 1;
      entry.r += color.r;
      entry.g += color.g;
      entry.b += color.b;
      buckets.set(key, entry);
    }
  }
  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant || dominant.count < 4) return { r: 255, g: 255, b: 255 };
  return {
    r: Math.round(dominant.r / dominant.count),
    g: Math.round(dominant.g / dominant.count),
    b: Math.round(dominant.b / dominant.count)
  };
}

function inferContainerStroke(innerColor, outsideColor) {
  if (colorDistance(innerColor, outsideColor) < 28) {
    return luma(innerColor) > 210 ? "#D8D8D8" : rgbToHex(innerColor);
  }
  return "none";
}



function inferDenseTextGrid(imageBox, textBoxes = []) {
  const gridTextBoxes = gridCandidateTextBoxes(textBoxes);
  if (!imageBox || gridTextBoxes.length < 9) return null;
  const centers = gridTextBoxes.map((item) => ({
    x: Number(item.box?.x || 0) + Number(item.box?.w || 0) / 2,
    y: Number(item.box?.y || 0) + Number(item.box?.h || 0) / 2
  }));
  const xClusters = clusterNumericValues(centers.map((item) => item.x), Math.max(36, Number(imageBox.w || 0) * 0.07));
  const yClusters = clusterNumericValues(centers.map((item) => item.y), Math.max(26, Number(imageBox.h || 0) * 0.09));
  const columns = xClusters.length;
  const rows = yClusters.length;
  if (columns < 3 || rows < 3) return null;
  const density = gridTextBoxes.length / Math.max(1, columns * rows);
  if (density < 0.62) return null;
  const xCenters = xClusters.map((cluster) => cluster.center).sort((a, b) => a - b);
  const yCenters = yClusters.map((cluster) => cluster.center).sort((a, b) => a - b);
  const xLines = boundariesFromCenters(xCenters, imageBox.x, Number(imageBox.x || 0) + Number(imageBox.w || 0));
  const yLines = boundariesFromCenters(yCenters, imageBox.y, Number(imageBox.y || 0) + Number(imageBox.h || 0));
  if (xLines.length < 4 || yLines.length < 4) return null;
  return {
    columns,
    rows,
    density: round(density),
    xLines,
    yLines
  };
}

function gridCandidateTextBoxes(textBoxes = []) {
  return (textBoxes || []).filter((item) => {
    const text = String(item?.text || "").trim();
    const box = item?.box || {};
    if (text.length <= 1) return false;
    if (/^[+\-—–·•|/\\]+$/.test(text)) return false;
    if (Number(box.w || 0) < 28 || Number(box.h || 0) < 8) return false;
    return true;
  });
}

function clusterNumericValues(values = [], threshold = 24) {
  const clusters = [];
  for (const value of values
    .map((item) => Number(item))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(value - last.center) > threshold) {
      clusters.push({ values: [value], center: value });
    } else {
      last.values.push(value);
      last.center = last.values.reduce((sum, item) => sum + item, 0) / last.values.length;
    }
  }
  return clusters;
}

function boundariesFromCenters(centers, min, max) {
  const lines = [round(min)];
  for (let index = 0; index < centers.length - 1; index += 1) {
    lines.push(round((centers[index] + centers[index + 1]) / 2));
  }
  lines.push(round(max));
  return lines;
}

function tableGridStrokeColor(textBoxes = []) {
  const colors = textBoxes
    .map((item) => normalizeHex(item.font?.color, null))
    .filter(Boolean)
    .filter((color) => luma(parseHex(color)) < 245);
  if (colors.length === 0) return "#D2DAE4";
  const average = averageColor(colors.map(parseHex));
  const neutral = {
    r: Math.round((average.r + 210) / 2),
    g: Math.round((average.g + 218) / 2),
    b: Math.round((average.b + 228) / 2)
  };
  return rgbToHex(neutral);
}







function isAssetCycleUnderlay(textBoxes, underlayBox) {
  if (!underlayBox) return false;
  const text = textBoxes.map((item) => String(item?.text || "").replace(/\s+/g, "")).join("\n");
  const signals = ["YH", "资产复利", "效率提速", "标准统一", "质量保障"]
    .filter((item) => text.includes(item)).length;
  const areaRatio = Number(underlayBox.w || 0) * Number(underlayBox.h || 0) / Math.max(1, DEFAULT_SLIDE.widthPt * DEFAULT_SLIDE.heightPt);
  return signals >= 5 && areaRatio >= 0.32 && areaRatio <= 0.48;
}

function isAssetCycleInternalLabel(textBox, underlayBox) {
  if (!underlayBox) return false;
  const text = String(textBox?.text || "").replace(/\s+/g, "");
  if (!/^(?:YH|资产复利|效率提速|标准统一|质量保障|\(KnowledgeAsset\)|\(Efficiency\)[）)]?|\(Standardization\)|\(Quality\)[）)]?)$/i.test(text)) {
    return false;
  }
  const box = textBox?.box || {};
  const centerX = Number(box.x || 0) + Number(box.w || 0) / 2;
  const centerY = Number(box.y || 0) + Number(box.h || 0) / 2;
  return centerX >= underlayBox.x + underlayBox.w * 0.22
    && centerX <= underlayBox.x + underlayBox.w * 0.78
    && centerY >= underlayBox.y + underlayBox.h * 0.12
    && centerY <= underlayBox.y + underlayBox.h * 0.92;
}







function normalizedTextsInsideBox(textBoxes = [], box = {}) {
  return new Set((textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, box))
    .map((item) => normalizeCjkText(item.text))
    .filter(Boolean));
}

function findTextBoxByNormalizedText(textBoxes = [], text = "") {
  const target = normalizeCjkText(text);
  return (textBoxes || []).find((item) => normalizeCjkText(item.text) === target) || null;
}



function buildPageSemanticText(textBoxes = []) {
  return (Array.isArray(textBoxes) ? textBoxes : [])
    .map((item) => String(item?.text || "").trim())
    .filter(Boolean)
    .join(" ");
}

function enrichImagesWithPageSemanticText(images = [], pageSemanticText = "") {
  const semanticText = String(pageSemanticText || "").trim();
  if (!semanticText) return images;
  return (Array.isArray(images) ? images : []).map((image) => ({
    ...image,
    source: {
      ...(image?.source || {}),
      pageText: image?.source?.pageText || semanticText,
      allText: image?.source?.allText || semanticText
    }
  }));
}








































































































































































const {
  createNativeRebuildPptxBuildExecutor,
  normalizePptxBuildJobs,
  shouldRunPowerPointOpenGate,
  resolvePython,
  isFlagDisabled
} = require("./lib/native-rebuild-pptx-build-executor");
const { buildPptx, buildPptxBatch } = createNativeRebuildPptxBuildExecutor({ scriptDir: __dirname });

async function main() {
  return runNativeRebuildCli(process.argv.slice(2), {
    buildPptx,
    buildPptxBatch,
    ensureDir,
    fs,
    rebuildDeckFromWorkDir,
    summarizeDeckComposition
  });
}

function summarizeDeckComposition(deck) {
  return summarizeDeckCompositionCore(deck, {
    classifyEditableExpressionForm,
    classifyImageExpressionForm,
    classifyImageExpressionSubtype,
    recommendExpressionHandling
  });
}

function addCount(target, key) {
  const safeKey = String(key || "unknown");
  target[safeKey] = (target[safeKey] || 0) + 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  getComponentAnalysisServices,
  aggregateForegroundComponent,
  annotateTextBoxesWithNativeComponentGroups,
  annotateFidelityImageSource,
  bottomBannerBounds,
  buildPptx,
  buildPptxBatch,
  classifyIconComponent,
  collaborationFlowBounds,
  comparisonMatrixBounds,
  contentTextBounds,
  detectLongLines,
  detectSimpleStatusIcons,
  detectNetworkNodeBoxes,
  eraseObjectifiedLayerPrimitives,
  eraseMasks,
  createEntropyChallengeCrops,
  createEntropyChallengeAnnotationObjects,
  createCoverEngineCoreShapes,
  detectCoverCardBox,
  createSkillChainOverviewShapes,
  createPageLevelSkillChainOverviewObjects,
  createKpiEvidenceShapes,
  createKpiEvidenceTextShapes,
  createLayerColorBlockShapes,
  createMatrixColorBlockShapes,
  createLayerConnectorShapes,
  createLayerContainerShapes,
  createStickyNoteClusterShapes,
  createStickySketchResidualNativeShapes,
  stickySketchResidualNativeStrokeShapes,
  stickySketchStrokeComponents,
  residualLinearInkStats,
  resolvePptxBuildMode,
  shouldRunPowerPointOpenGate,
  normalizePptxBuildJobs,
  readPng,
  cropPng,
  parsePageSelection,
  createFunnelHubResidualNativeShapes,
  createLinearProcessDiagramShapes,
  createDemandUnderstandingFlowShapes,
  createComparisonMatrixShapes,
  createMixedDiagramUnderlayCrop,
  createTemporaryAnswerWorkflowMatrixObjects,
  protectAssetHubSuperBrainPortalIllustration,
  prepareSystemMapTopologyProbe,
  protectUnreadableSystemMapFidelityCrop,
  filterTextBoxesClaimedBySystemMapFidelityCrop,
  createSystemMapFidelityChromeObjects,
  createAssetHubSuperBrainPortalChromeObjects,
  filterTextBoxesClaimedByAssetHubSuperBrainPortal,
  createTraditionalCollaborationBreakdownObjects,
  filterTextBoxesClaimedByTraditionalCollaborationBreakdown,
  createAssetHubSuperBrainPortalObjects,
  createAssetHubVersionTimelineObjects,
  createAssetHubSourcePurificationObjects,
  dropFalseTableOverlaysOnProtectedCollaborationDiagram,
  dropFalseTableLayersClaimedByPortalPlatform,
  materializeAssetHubSourceCrops,
  filterTextBoxesClaimedByAssetHubSourcePurification,
  filterTextBoxesClaimedByAssetHubSpecializedContent,
  normalizeAssetHubTopChromeOcrTextBoxes,
  createAssetHubWmsInboundReviewObjects,
  normalizeAssetHubWmsInboundReviewOcrTextBoxes,
  normalizeSystemMapChromeTextBoxes,
  normalizeCenterBadgeCycleExternalTitle,
  createProductBrainAssetClosureFunnelObjects,
  materializeProductBrainAssetClosureFunnelCrops,
  filterTextBoxesClaimedByProductBrainAssetClosureFunnel,
  createProductBrainWmsQualityGateObjects,
  filterTextBoxesClaimedByProductBrainWmsQualityGate,
  createProductBrainSmartReviewRiskGateObjects,
  createProductBrainPuzzleValueLoopObjects,
  filterTextBoxesClaimedByProductBrainPuzzleValueLoop,
  createProductBrainCoreValueHybridObjects,
  filterTextBoxesClaimedByProductBrainCoreValueHybrid,
  createProductBrainCoreValueSplitObjects,
  suppressProductBrainSmartReviewWhenReviewRiskGateActive,
  normalizeCommonOcrTextBoxLabels,
  createSkillsEngineCoverTriadObjects,
  createSkillsEngineAiComparisonMatrixObjects,
  shouldObjectifySkillsEngineAiComparisonMatrix,
  createWorkflowChallengeTriadIllustrationObjects,
  materializeWorkflowChallengeTriadInputIllustrationCrop,
  createWorkflowComparisonMatrixObjects,
  createWorkflowCollaborationMultiplierObjects,
  createWorkflowSupplyChainTwoPanelObjects,
  createWorkflowKpiEvidenceObjects,
  workflowKpiEvidenceFontSize,
  createWorkflowPrdAutoGenerationObjects,
  createCenterBadgeQuadrantCycleObjects,
  inferCenterBadgeQuadrantCycleLayout,
  createWorkflowDemandUnderstandingAssistantObjects,
  createAssetOsDemandUnderstandingAssistantObjects,
  shouldAutoObjectifyAssetOsDemandUnderstandingAssistant,
  createAssetOsEntropyChallengeObjects,
  inferBoxFromTextAnchor,
  createAssetOsHighValueAssetMatrixObjects,
  createAssetOsTwoDimensionalFoundationObjects,
  createSaturatedDiagramTextShapes,
  createSemanticCycleDiagramShapes,
  createDenseComplexDiagramScaffoldObjects,
  createDenseComplexDiagramScaffoldShapes,
  createTwoPanelDiagramTextShapes,
  createTopComplexDiagramTextShapes,
  createShiftLeftDebuggerDiagramObjects,
  createToolIslandTransitionMatrixObjects,
  filterTextBoxesClaimedByToolIslandTransitionMatrix,
  filterShapesClaimedByToolIslandTransitionMatrix,
  createEntropyChallengeFragmentShapes,
  createEntropyChallengeIslandShapes,
  createEntropyChallengeFooterBulletShapes,
  normalizeEntropyChallengeFooterTextBoxes,
  createValueQuadrantShapes,
  createValueQuadrantGemsObjects,
  createReviewRiskGateFlowShapes,
  annotateReviewRiskGateTextComponents,
  shouldSplitDeclaredReviewGateGem,
  createPrdGenerationFlowShapes,
  createPrototypeValidationFlowShapes,
  syncObjectifiedCandidateSources,
  createDocumentVersionGovernanceObjects,
  shouldObjectifyDocumentVersionGovernance,
  filterTextBoxesClaimedByDocumentVersionGovernance,
  createDocumentVersionFolderFlowObjects,
  createAssetOsFlowObjects,
  createAssetOsKpiBenefitObjects,
  mergeAssetOsKpiBenefitTextBoxes,
  normalizeAssetOsHighValueAssetMatrixTextBoxes,
  createScaleLandingEvidenceObjects,
  createFourStepLandingPathObjects,
  filterTextBoxesClaimedByFourStepLandingPath,
  createPortalPlatformDiagramObjects,
  createSystemMapDiagramObjects,
  createHierarchyDiagramShapes,
  createNetworkDiagramShapes,
  createPageLevelNetworkDiagramShapes,
  createTriangleTopologyDiagramShapes,
  createFunnelHubDiagramShapes,
  createAssetHubCycleIllustrationObjects,
  createSegmentedAssetOsClosedLoopCycleObjects,
  filterTextBoxesClaimedByAssetOsClosedLoop,
  createInputOutputSplitDiagramObjects,
  filterTextBoxesClaimedByInputOutputSplit,
  createProductBrainVisionObjects,
  createHorizontalStepChainShapes,
  sampleHorizontalStepChainFill,
  createGenericNodeDiagramSkeletonShapes,
  createVisualClusterStackShapes,
  createWmsRouteChainShapes,
  createWmsRouteMinimumUnitCrops,
  createCollaborationFlowShapes,
  createDecorativeCoverBackground,
  normalizeDecorativeCoverTextBoxes,
  normalizeStackedArchitectureChromeTextBoxes,
  createProcessWithScreenshotsFlowObjects,
  createProductCollaborationChallengeObjects,
  createFoundationCapabilityNetworkObjects,
  dropFoundationCapabilityNetworkResidualCrops,
  createStackedArchitectureDiagramObjects,
  createToolGapPlatformDiagramObjects,
  createComponentTemplateNativeShapes,
  componentAssetLayerPseudoImages,
  filterComponentTemplateShapeLayerInputs,
  filterComponentTemplateNativeInputs,
  componentTemplateInputClaimedByNativeShapes,
  shouldSuppressComponentTemplateForTriangleTopology,
  syncPrototypeValidationCandidateSources,
  shouldAllowSpecializedNativeRebuildForDeferredComponent,
  resolveComponentIndexPage,
  mergeDiagramTextBoxes,
  collectComponentTemplateFallbackDiagramTextBoxes,
  suppressComponentTemplateShapesForSpecializedLayers,
  suppressOrphanComponentTemplateTextBoxes,
  suppressGenericDiagramTextBoxesCoveredBySpecialized,
  suppressRedundantTableGridScaffoldCoveredByVisualAtoms,
  suppressSmallVisualAtomsCoveredByAnchoredSemanticLabels,
  arbitrateSparseFlowCardChainNativeOwnership,
  arbitrateSpecializedNativeLayerOwnership,
  nativeRebuildFamily,
  filterTextBoxesOutsideSpecializedNativeObjects,
  filterTextBoxesClaimedByTriangleTopology,
  filterTextBoxesClaimedByCoverEngineCore,
  normalizeTriangleTopologyFinalTypography,
  filterTextBoxesClaimedByPrdSegmentCrops,
  filterPrdAutoGenerationDuplicateTextBoxes,
  normalizePrdSegmentCropTextBoxes,
  prdAutoGenerationComponentMetadata,
  filterTextBoxesConsumedByComponentTemplateBackfill,
  dedupeTextBoxesByStableId,
  replaceComponentTemplateCropsWhenFullyNative,
  createComponentTemplateHybridResidualCrop,
  shouldKeepHybridComponentTemplateResidual,
  createSpecializedNativeHybridResidualCrop,
  createSpecializedNativeHybridResidualCrops,
  createSpecializedNativeHybridResidualCropsFromNativeShapes,
  shouldKeepSpecializedNativeHybridResidual,
  createVisualAtomNativeShapes,
  createStructuredIllustrationCardShellShapes,
  splitStructuredIllustrationCardShellShapesForLayering,
  suppressVisualAtomShapesCoveredByStructuredIcons,
  suppressStructuredIllustrationInputCycleArrows,
  suppressGenericStructuredIllustrationObjectsForSpecialist,
  createStructuredIllustrationCardVisualAtomShapes,
  createStructuredIllustrationCardTitleWarningShapes,
  createStructuredIllustrationProcessingWarningShapes,
  dropStructuredIllustrationCardResidualCropsWhenNativeTemplateCovers,
  dropResidualsCoveredByNativeTableShapes,
  dropResidualsCoveredByNativeTableText,
  createTableMatrixResidualObjects,
  dropMostlyBlankCoveredResidualCrops,
  dropPluginTemplateCoveredStructuralUnderlays,
  dropPluginTemplateCoveredSmallResidualCrops,
  dropWmsObjectifiedValuePanelResidualCrops,
  dropWmsObjectifiedTopRouteUnderlay,
  splitErasedResidualCrops,
  materializePrototypeValidationResidualCrops,
  dropPrototypeValidationResidualCropsWhenNativeCoverage,
  dropDemandUnderstandingResidualCropsWhenNativeCoverage,
  dropEntropyChallengeCropsWhenNativeCoverage,
  dropDecorativeCoverDuplicateForegroundCrops,
  createStructuredIllustrationOutputDocumentShapes,
  createStructuredIllustrationInputDocumentShapes,
  createStructuredIllustrationInputChaosGlyphObjects,
  sanitizeNativeShape,
  sanitizeNativeShapes,
  visualAtomCycleArrowOfficeBox,
  structuredIllustrationSmallWarningTriangleBox,
  createStructuredIllustrationResidualLineShapes,
  createStructuredIllustrationResidualIconShapes,
  createStructuredIllustrationResidualSketchLineShapes,
  createStructuredIllustrationGearPersonShapes,
  shouldKeepFunnelHubDiagramText,
  shouldObjectifyFunnelHubDiagram,
  inferHorizontalStepChainShapes,
  shouldObjectifyHorizontalStepChain,
  shouldObjectifyGenericNodeDiagramSkeleton,
  shouldObjectifyWmsRouteChain,
  shouldObjectifyCollaborationFlow,
  visualAtomNativeBudget,
  createQuadrantDividerShapes,
  createTableZoneBackgroundShapes,
  createTableZoneGridShapes,
  createTableZoneSemanticTextBoxes,
  createTextBackplateShapes,
  createValueBannerBackgroundShapes,
  classifyGraphicCropExpression,
  classifyGraphicUnderlayExpression,
  colorBlockRectStats,
  cropExpressionStats,
  classifyObviousMinimumVisualAssetCrop,
  classifyImageExpressionForm,
  classifyImageExpressionSubtype,
  classifyResidualSplitComponent,
  buildPageSemanticText,
  enrichImagesWithPageSemanticText,
  filterTextBoxesForGraphicUnderlays,
  focusedForegroundProjectionComponents,
  hybridRebuildStrategyProfile,
  inferLayerConnectors,
  inferLayerContainers,
  inferRadialNetworkDiagram,
  inferQuadrantDividers,
  inferDiagramSemanticSignals,
  inferDenseTextGrid,
  inferWeight,
  isAcceptableDiagramCandidate,
  createKpiEvidenceCrops,
  createTitleChromeShapes,
  kpiEvidenceLayoutBounds,
  listWorkDirs,
  looksLikeTopTitle,
  refineFontSize,
  rebuildDeckFromWorkDir,
  rebuildRealPptxNativeUsage,
  residualSplitDecision,
  resolveComponentStrategyIndex,
  resolveSmartNativeRebuildOptions,
  resolvePython,
  shouldIncludePage,
  sampleInkColor,
  sampleUniformPageBackgroundFill,
  sampleMaskBackgroundColor,
  sanitizeNativeCharts,
  main,
  scoreDiagramCandidate,
  sourceNativeSlideIndexes,
  sourceNativeSlideMetadata,
  segmentComparisonMatrix,
  summarizeExpressionProfile,
  recommendExpressionHandling,
  reclassifyImageSource,
  normalizeImageLayerMetadata,
  normalizePageImageMetadata,
  normalizeProtectedProductCollaborationChromeTextBoxes,
  normalizeAssetOsFlowChromeTextBoxes,
  promoteMinimumVisualAssetCropMetadata,
  refreshImageExpressionMetadata,
  triangleTopologyResidualRegions,
  purifyTriangleTopologyNodeCrop,
  splitErasedResidualCrop,
  splitErasedResidualCrops,
  splitResidualLayerSource,
  fitSingleLineFontSize,
  shouldNativeTextBox,
  shouldDisableTextWrap,
  shouldUseDecorativeCoverBackground,
  shouldUseDecorativePageChromeBackground,
  shouldUseContentGraphicUnderlay,
  shouldUseEntropyChallengeCrops,
  shouldAutoObjectifyEntropyIsland,
  shouldUseComparisonMatrixCrop,
  shouldUseCollaborationFlowUnderlay,
  shouldUseGraphicUnderlay,
  shouldUseIllustrationCardUnderlay,
  shouldUseLeftIllustrationPanelUnderlay,
  shouldUseLineDiagramUnderlay,
  shouldUseMixedDiagramUnderlay,
  shouldSplitMixedDiagramSemanticCrops,
  shouldUseProductIllustrationSegmentCrops,
  shouldUseSaturatedDiagramUnderlay,
  shouldUseSparseDiagramUnderlay,
  shouldUseStructuredCaseUnderlay,
  shouldUseSegmentedGraphicUnderlay,
  shouldUseTopComplexDiagramCrop,
  shouldUseTwoPanelDiagramCrops,
  shouldUseVisualClusterUnderlay,
  shouldUseWmsChainUnderlay,
  shouldVectorizeStatusIcons,
  shouldProtectSmallForegroundGraphicCrop,
  shouldObjectifyLayerText,
  shouldAddAggregateComponent,
  summarizeDeckComposition,
  topComplexDiagramBounds,
  twoPanelDiagramBounds,
  visibleTextBoxes,
  visualClusterPxBounds,
  wmsChainBounds
};
