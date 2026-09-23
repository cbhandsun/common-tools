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
const {applySystemMapNativeHybridProbeSource:applyMapProbe,removeDuplicateSystemMapFidelityUnderlays:dedupeMapFidelity} = require("@common-tools/slideclone-core/system-map-fidelity-protection");
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
const { createLinearProcessDiagramFactory } = require("./lib/native-rebuild-linear-process-diagram");
const { createDenseTextGridFactory } = require("./lib/native-rebuild-dense-text-grid");
const { createLayerVisualPrimitivesFactory } = require("./lib/native-rebuild-layer-visual-primitives");
const { createResidualCropLifecycleFactory } = require("./lib/native-rebuild-residual-crop-lifecycle");
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
  inferDenseTextGrid,
  tableGridStrokeColor
} = createDenseTextGridFactory({
  averageColor,
  luma,
  normalizeHex,
  parseHex,
  rgbToHex,
  round
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
  createLayerColorBlockShapes,
  createLayerConnectorShapes,
  createLayerContainerShapes,
  createMatrixColorBlockShapes,
  dominantRegionColor,
  hasStrongTableGridEvidence,
  inferLayerConnectors,
  inferLayerContainers,
  shouldObjectifyTableGrid
} = createLayerVisualPrimitivesFactory({
  DEFAULT_SLIDE,
  averageColor,
  boxCenterInside,
  clamp,
  colorBlockShapesForImage,
  colorDistance,
  constrainPtBox,
  expandPtBox,
  inferTableGridFromVisualAtoms,
  isProtectedFidelityDiagramDetector,
  isUsableVisualTableGrid,
  lineBox,
  luma,
  pixel,
  pointInsidePtBox,
  ptBoxOverlapAreaRatio,
  ptToPxBox,
  rgbToHex,
  round,
  sampleMaskBackgroundColor,
  saturation,
  shouldKeepFunnelHubDiagramText
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
  safeIdentifier,smartReviewPictorialRegions,temporaryAnswerWorkflowTextBox,writePng
});
const{
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
  normalizeCjkText,normalizeMatrixLabel,
  path,pixel,protectProductCollaborationChallengeCrop,
  ptToPxBox,pxToPtBox,
  round,
  roundedBox,
  roundRatio,
  readPng,
  refineGraphicCrop,resolveAssetPathForIr,rgbToHex,
  safeIdentifier,shouldObjectifyProductCollaborationChallenge,
  splitResidualLayerSource,
  temporaryAnswerWorkflowTextBox,
  unionPtBoxes,
  workflowCollaborationBranchGlowStyle,workflowCollaborationHubLayerStyle,
  workflowSupplyChainTwoPanelEvidenceText,writePng
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
  darkerHex,eraseDarkPixelsInRects,
  ensureDir,expandPtBox,
  hexToRgb,inferWeight,
  normalizeCjkText,path,
  pixel,parseHex,
  ptBoxOverlapAreaValue,
  ptToPxBox,pxToPtBox,
  rgbToHex,round,
  roundedBox,sampleInkColor,
  safeIdentifier,temporaryAnswerWorkflowTextBox,writePng
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
    const pageSemanticText = buildPageSemanticText(rawTextBoxes.length > 0 ? rawTextBoxes : textBoxes);
    pageDraft.images = enrichImagesWithPageSemanticText(pageDraft.images, pageSemanticText);
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
    nativeRebuildCandidateImages = enrichImagesWithPageSemanticText(nativeRebuildCandidateImages, pageSemanticText);
    const systemMapTopologyProbeReady = image
      ? prepareSystemMapTopologyProbe(pageDraft, rawTextBoxes, slideSize, { sourceImage: image, pageIndex })
      : false;
    const autoObjectifySystemMap = options.objectifyLayerConnectors === true || systemMapTopologyProbeReady;
    const autoObjectifyTriangleTopology = nativeRebuildCandidateImages.some((item)=>shouldDeferNativeRebuildForComponentStrategy(item)&&shouldObjectifyDeferredTriangleTopology(item, rawTextBoxes.length?rawTextBoxes:textBoxes));
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
    // Let strict semantic fidelity-first layers reach only their dedicated rebuilder.
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
      image, options, pageDraft, nativeTextBoxes, slideSize, decorativeBackground, nativeRebuildCandidateImages, rawTextBoxes, textBoxes, pageIndex, specializedNativeEligiblePageDraft, specializedNativeEligibleImages, autoObjectifySystemMap, autoObjectifyTriangleTopology, unreadableSystemMapFidelityProtected
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
  if (shouldObjectifyDeferredTriangleTopology(image, textBoxes)) return true;
  if (isFidelityFirstMinimumVisualUnit(image)) return false;
  return shouldObjectifySemanticCycleDiagram(image, textBoxes)
    || shouldObjectifyDeferredSkillChainOverview(image, textBoxes)
    || shouldObjectifyDeferredNetworkDiagram(image)
    || shouldObjectifyDeferredSparseFlowCardChain(image, textBoxes)
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

const {
  createLinearProcessDiagramShapes,
  productWorkflowEndpointShapes,
  productWorkflowStageBackplateShapes
} = createLinearProcessDiagramFactory({
  DEFAULT_SLIDE,
  boxCenterInside,
  clamp,
  constrainPtBox,
  expandPtBox,
  lineBox,
  round,
  truncateText
});
const {
  createTableMatrixResidualObjects,
  dropResidualsCoveredByNativeTableShapes,
  eraseToolGapPlatformResidualText,
  objectifyLayerTextCrops,
  shouldDropObjectifiedTableZoneResidual,
  shouldDropResidualCoveredByNativeTableShapes,
  shouldDropResidualWithNativeVisualAtomPeer,
  shouldObjectifyLayerText,
  shouldUseResidualSplit,
  splitErasedResidualCrops
} = createResidualCropLifecycleFactory({
  DEFAULT_SLIDE,
  boxCenterInside,
  cropPng,
  ensureDir,
  eraseMasks,
  expandPtBox,
  isProtectedFidelityDiagramDetector,
  localResidualPxBox,
  path,
  ptBoxOverlapAreaValue,
  ptToPxBox,
  recordResidualDropDecision,
  residualSplitDecision,
  resolveAssetPathForIr,
  resolveResidualDropDecision,
  shouldDeferNativeRebuildForComponentStrategy,
  shouldDropResidual,
  shouldDropResidualCoveredByNativeTablePeers,
  shouldKeepFunnelHubDiagramText,
  shouldKeepFunnelHubTextInResidualCrop,
  shouldKeepStructuredVisualAtomLayerText,
  shouldPreserveProtectedMinimumUnitCrop,
  shouldRemoveHighRiskInternalOverlayText,
  splitErasedResidualCrop,
  writePng
});





















































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
    if (!applyMapProbe({target,reconstructionMode,topologyProbe,decorativeGridTexture,pictorialEnclosure,targetAreaRatio})) return false;
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
  dedupeMapFidelity(page, target);
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
