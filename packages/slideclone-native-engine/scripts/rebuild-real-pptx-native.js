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
const { createAssetOsSpecializedPagesFactory } = require("./lib/native-rebuild-asset-os-specialized-pages");
const { createCenterBadgeQuadrantCycleFactory } = require("./lib/native-rebuild-center-badge-quadrant-cycle");
const { createSemanticCycleDiagramsFactory } = require("./lib/native-rebuild-semantic-cycle-diagrams");
const { createDenseComplexScaffoldFactory } = require("./lib/native-rebuild-dense-complex-scaffold");
const { createTwoPanelDiagramTextFactory } = require("./lib/native-rebuild-two-panel-diagram-text");
const { createFunnelHubDiagramFactory } = require("./lib/native-rebuild-funnel-hub-diagram");
const { createTopComplexDiagramFactory } = require("./lib/native-rebuild-top-complex-diagram");
const { createComplexTransitionDiagramsFactory } = require("./lib/native-rebuild-complex-transition-diagrams");
const { createGenericNodeClusterFactory } = require("./lib/native-rebuild-generic-node-cluster");
const { createCollaborationStickyDiagramsFactory } = require("./lib/native-rebuild-collaboration-sticky-diagrams");
const { createStructuredIllustrationFactory } = require("./lib/native-rebuild-structured-illustration");
const { createHorizontalSparseFlowFactory } = require("./lib/native-rebuild-horizontal-sparse-flow");
const { createTraditionalCollaborationBreakdownFactory } = require("./lib/native-rebuild-traditional-collaboration-breakdown");
const { createSkillsEnginePagesFactory } = require("./lib/native-rebuild-skills-engine-pages");
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
const { detectColorComponents, detectHorizontalColorBands } = require("./lib/color-component-bounds");
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
const {
  createSaturatedDiagramTextShapes,
  saturatedDiagramNativeTextBoxes,
  saturatedDiagramTextBox,
  saturatedDiagramTextColor,
  maybeEraseSaturatedDiagramText,
  createSemanticCycleDiagramShapes,
  createSemanticCycleMinimumUnitCrop,
  createSemanticCycleIconMinimumUnitCrops,
  isHighFidelityPrdCycle,
  shouldObjectifySemanticCycleDiagram,
  inferSemanticCycleDiagramShapes,
  shouldDropSemanticCycleResidual,
  semanticCycleShapeSource
} = createSemanticCycleDiagramsFactory({
  DEFAULT_SLIDE,
  applyMinimumUnitCropRenderStrategy,
  boxCenterInside,
  clampPtBoxToSlide,
  constrainPtBox,
  cropPng,
  eraseMasks,
  ensureDir,
  isSaturatedDiagramInternalLabel,
  localResidualPxBox,
  makeEdgeConnectedBackgroundTransparent,
  normalizeCjkText,
  normalizeHex,
  normalizeMatrixLabel,
  path,
  ptToPxBox,
  pxToPtBox,
  resolveAssetPathForIr,
  round,
  roundedBox,
  safeIdentifier,
  splitResidualLayerSource,
  temporaryAnswerWorkflowTextBox,
  writePng
});
const {
  createDenseComplexDiagramScaffoldShapes,
  createDenseComplexDiagramScaffoldObjects,
  shouldObjectifyDenseComplexDiagramScaffold,
  inferDenseComplexDiagramTheme,
  inferDenseComplexDiagramScaffoldShapes,
  inferDenseComplexDiagramScaffoldTextBoxes,
  denseComplexScaffoldSource
} = createDenseComplexScaffoldFactory({
  DEFAULT_SLIDE,
  boxCenterInside,
  boxCenterY,
  centerOfBox,
  normalizeCjkText,
  round,
  roundedBox,
  safeComponentToken,
  temporaryAnswerWorkflowTextBox,
  unionPtBoxes
});
const {
  createTwoPanelDiagramTextShapes,
  inferTwoPanelDiagramSkeletonShapes,
  twoPanelDiagramShapeSource,
  twoPanelDiagramNativeTextBoxes,
  twoPanelDiagramSemanticTextBoxes,
  twoPanelDiagramTextBox,
  twoPanelDiagramTextColor,
  maybeEraseTwoPanelDiagramText
} = createTwoPanelDiagramTextFactory({
  DEFAULT_SLIDE,
  boxCenterInside,
  centerOfBox,
  clampPtBoxToSlide,
  constrainPtBox,
  cropPng,
  eraseMasks,
  ensureDir,
  expandBox,
  keepsInternalLayerText,
  localResidualPxBox,
  markTwoPanelChaosIllustrationPreserved,
  normalizeCjkText,
  normalizeHex,
  normalizeMatrixLabel,
  path,
  ptToPxBox,
  resolveAssetPathForIr,
  round,
  roundedBox,
  sameDiagramLabel,
  shouldPreserveTwoPanelChaosIllustrationCrop,
  shouldPreserveImageCropUnderNativeAssistants,
  temporaryAnswerWorkflowTextBox,
  writePng
});
const {
  createFunnelHubDiagramShapes,
  shouldObjectifyFunnelHubDiagram,
  inferFunnelHubDiagram,
  funnelHubDiagramShapes,
  funnelHubShapeSource
} = createFunnelHubDiagramFactory({
  DEFAULT_SLIDE,
  boxCenterInside,
  constrainPtBox,
  lineBox,
  normalizeCjkText,
  round,
  shouldKeepFunnelHubDiagramText,
  safeComponentToken
});
const {
  createTopComplexDiagramTextShapes,
  inferTopComplexDiagramSkeletonShapes
} = createTopComplexDiagramFactory({
  DEFAULT_SLIDE,
  boxCenterInside,
  centerOfBox,
  clampPtBoxToSlide,
  constrainPtBox,
  cropPng,
  ensureDir,
  eraseMasks,
  luma,
  normalizeHex,
  normalizeMatrixLabel,
  path,
  ptToPxBox,
  pxToPtBox,
  resolveAssetPathForIr,
  rgbToHex,
  round,
  roundedBox,
  sameDiagramLabel,
  sampleMaskBackgroundColor,
  saturation,
  shouldEmitVisibleTopComplexDiagramNativeLayer,
  writePng
});
const {
  createShiftLeftDebuggerDiagramObjects,
  createToolIslandTransitionMatrixObjects,
  isMixedDiagramSemanticResidual
} = createComplexTransitionDiagramsFactory({
  DEFAULT_SLIDE,
  boxCenterInside,
  centerOfBox,
  clampPtBoxToSlide,
  cropPng,
  ensureDir,
  path,
  ptToPxBox,
  pxToPtBox,
  round,
  roundedBox,
  safeIdentifier,
  temporaryAnswerWorkflowTextBox,
  writePng
});
const {
  createGenericNodeDiagramSkeletonShapes,
  createVisualClusterStackShapes,
  shouldObjectifyGenericNodeDiagramSkeleton,
  shouldObjectifyVisualClusterStack
} = createGenericNodeClusterFactory({
  DEFAULT_SLIDE,
  boxCenterInside,
  centerOfBox,
  comparisonMatrixVisualAtoms,
  darkenHexColor,
  detectColorComponents,
  detectHorizontalColorBands,
  expandPtBox,
  lineBox,
  normalizeGenericNodeDiagramText,
  normalizeHexColor,
  pixelBoxToSlide,
  round,
  roundedBox,
  safeComponentToken
});
const {
  createCollaborationFlowShapes,
  createStickyNoteClusterShapes,
  shouldObjectifyCollaborationFlow
} = createCollaborationStickyDiagramsFactory({
  DEFAULT_SLIDE,
  averageColor,
  boxCenterInside,
  boxOverlapRatio,
  centerOfBox,
  connectedColorComponents,
  cropPng,
  ensureDir,
  eraseMasks,
  expandPxBox,
  expandPtBox,
  isCollaborationFlowInternalLabel,
  luma,
  localPxBoxToSlidePt,
  normalizeCjkText,
  normalizeHex,
  normalizeMatrixLabel,
  path,
  pixel,
  ptToPxBox,
  resolveAssetPathForIr,
  rgbToHex,
  round,
  roundedBox,
  sameDiagramLabel,
  saturation,
  unionBox,
  writePng
});
const {
  createStructuredIllustrationCardShellShapes,
  createStructuredIllustrationCardTitleWarningShapes,
  createStructuredIllustrationProcessingWarningShapes,
  dropStructuredIllustrationCardResidualCropsWhenNativeTemplateCovers,
  createStructuredIllustrationOutputDocumentShapes,
  createStructuredIllustrationInputDocumentShapes,
  createStructuredIllustrationInputChaosGlyphObjects,
  createStructuredIllustrationResidualLineShapes,
  createStructuredIllustrationResidualIconShapes,
  createStructuredIllustrationResidualSketchLineShapes,
  createStructuredIllustrationGearPersonShapes
} = createStructuredIllustrationFactory({
  DEFAULT_SLIDE,
  averageColor,
  boxOverlapRatio,
  clamp,
  clampPtBoxToSlide,
  constrainPtBox,
  freeformBounds,
  fs,
  lineBox,
  luma,
  pixel,
  ptBoxOverlapAreaRatio,
  readPng,
  resolveAssetPathForIr,
  rgbToHex,
  round,
  roundRatio,
  shouldPreserveImageCropUnderNativeAssistants,
  structuredIllustrationCardShellBoxes,
  structuredIllustrationGearPersonGearShapes,
  structuredIllustrationGearPersonHumanShapes,
  structuredIllustrationGearPersonMotionShapes,
  structuredIllustrationSmallWarningTriangleBox,
  structuredIllustrationWarningIconShapes,
  structuredIllustrationWarningIconVariant,
  structuredIllustrationWaveWarningIconShapes,
  saturation
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
const createScaleLandingEvidenceObjects = createScaleLandingEvidenceFactory({
  materializeAssetHubSourceCrops
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
  createWorkflowDemandUnderstandingAssistantObjects,
  shouldObjectifyWorkflowDemandUnderstandingAssistant,
  isWorkflowDemandUnderstandingAssistantLeftIllustrationCrop,
  workflowDemandUnderstandingLayout,
  workflowDemandTextEvidence,
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
  refineGraphicCrop,
  resolveAssetPathForIr,
  safeIdentifier,
  shouldObjectifyProductCollaborationChallenge,
  splitResidualLayerSource,
  temporaryAnswerWorkflowTextBox,
  unionPtBoxes,
  workflowCollaborationBranchGlowStyle,
  workflowCollaborationHubLayerStyle,
  workflowSupplyChainTwoPanelEvidenceText,
  writePng
});
const {
  createCenterBadgeQuadrantCycleObjects,
  createCenterBadgeQuadrantCycleFidelityCrop,
  centerBadgeQuadrantCycleExternalTextBoxes,
  normalizeCenterBadgeCycleExternalTitle,
  normalizeCenterBadgeCycleExternalCopy,
  normalizeCenterBadgeCycleInternalLabel,
  repairCenterBadgeCycleOcrText,
  inferCenterBadgeQuadrantCycleLayout,
  centerBadgeQuadrantSegments,
  centerBadgeCycleArrowSegments,
  sampleCenterBadgeQuadrantCycleColors
} = createCenterBadgeQuadrantCycleFactory({
  DEFAULT_SLIDE,
  boxCenterInside,
  centerOfBox,
  clampPtBoxToSlide,
  constrainPtBox,
  cropPng,
  darkerHex,
  eraseDarkPixelsInRects,
  ensureDir,
  expandPtBox,
  hexToRgb,
  normalizeCjkText,
  path,
  pixel,
  parseHex,
  ptBoxOverlapAreaValue,
  ptToPxBox,
  pxToPtBox,
  rgbToHex,
  round,
  roundedBox,
  sampleInkColor,
  safeIdentifier,
  temporaryAnswerWorkflowTextBox,
  writePng
});
const {
  createAssetOsDemandUnderstandingAssistantObjects,
  shouldObjectifyAssetOsDemandUnderstandingAssistant,
  shouldAutoObjectifyAssetOsDemandUnderstandingAssistant,
  createAssetOsEntropyChallengeObjects,
  shouldObjectifyAssetOsEntropyChallenge,
  inferBoxFromTextAnchor,
  createAssetOsHighValueAssetMatrixObjects,
  shouldObjectifyAssetOsHighValueAssetMatrix,
  createAssetOsTwoDimensionalFoundationObjects,
  shouldObjectifyAssetOsTwoDimensionalFoundation
} = createAssetOsSpecializedPagesFactory({
  DEFAULT_SLIDE,
  applyMinimumUnitCropRenderStrategy,
  clamp,
  clampPtBoxToSlide,
  cropPng,
  createEntropyChallengeAnnotationObjects,
  createEntropyChallengeFooterBulletShapes,
  createEntropyChallengeFragmentShapes,
  createEntropyChallengeIslandShapes,
  ensureDir,
  findTextBoxByNormalizedText,
  markTwoPanelChaosIllustrationPreserved,
  markProtectedComplexDiagramMinimumUnit,
  normalizeCjkText,
  path,
  ptToPxBox,
  pxToPtBox,
  readPng,
  refineGraphicCrop,
  resolveAssetPathForIr,
  round,
  roundedBox,
  sampleWorkflowMatrixCellFill,
  safeIdentifier,
  shouldAutoObjectifyEntropyIsland,
  splitResidualLayerSource,
  temporaryAnswerWorkflowTextBox,
  workflowComparisonMeasuredFontSize,
  workflowComparisonMeasuredTextBox,
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
const {
  createHorizontalStepChainShapes,
  shouldUseAssetLandingTreeFlow
} = createHorizontalSparseFlowFactory({
  DEFAULT_SLIDE,
  boxCenterInside,
  centerOfBox,
  clampPtBoxToSlide,
  comparisonMatrixVisualAtoms,
  cropPng,
  darkenHexColor,
  ensureDir,
  expandBox,
  expandPtBox,
  horizontalStepChainNativeTextBoxes,
  inferHorizontalStepChainShapes,
  isHorizontalStepChainFullyObjectified,
  lineBox,
  normalizeCjkText,
  normalizeHexColor,
  path,
  ptToPxBox,
  pxToPtBox,
  round,
  roundedBox,
  safeIdentifier,
  shouldObjectifyHorizontalStepChain,
  writePng
});
const { createTraditionalCollaborationBreakdownObjects } = createTraditionalCollaborationBreakdownFactory({
  DEFAULT_SLIDE,
  boxAreaValue,
  cropPng,
  ensureDir,
  normalizeCjkText,
  path,
  ptToPxBox,
  regularPolygonPoints,
  roundedBox,
  safeComponentToken,
  safeIdentifier,
  temporaryAnswerWorkflowTextBox,
  writePng
});
const {
  createSkillsEngineAiComparisonMatrixObjects,
  createSkillsEngineCoverTriadObjects
} = createSkillsEnginePagesFactory({
  DEFAULT_SLIDE,
  clampPtBoxToSlide,
  cropPng,
  ensureDir,
  lineBox,
  normalizeCjkText,
  path,
  ptToPxBox,
  pxToPtBox,
  round,
  safeIdentifier,
  shouldObjectifySkillsEngineAiComparisonMatrix,
  skillsEngineAiComparisonMatrixTarget,
  temporaryAnswerWorkflowTextBox,
  writePng
});
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
