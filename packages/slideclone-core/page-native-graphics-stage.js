"use strict";
const { hasUnverifiedNativeGeometry } = require("./screenshot-texture-evidence");

// Keep the native generation order and shared object references from the page pipeline.
function buildPageNativeGraphicsStage(context, dependencies) {
  const { image, options, pageDraft, nativeTextBoxes, slideSize, decorativeBackground, rawTextBoxes, textBoxes, pageIndex, specializedNativeEligiblePageDraft, specializedNativeEligibleImages, autoObjectifySystemMap, unreadableSystemMapFidelityProtected } = context;
  let { nativeRebuildCandidateImages } = context;
  nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter(item => !hasUnverifiedNativeGeometry(item));
  const { createValueBannerBackgroundShapes, createTextBackplateShapes, createLayerContainerShapes, createMatrixColorBlockShapes, createLayerColorBlockShapes, createStickyNoteClusterShapes, createLayerConnectorShapes, createTableZoneGridShapes, createTableZoneBackgroundShapes, createTableZoneSemanticTextBoxes, createQuadrantDividerShapes, createNetworkDiagramShapes, syncObjectifiedCandidateSources, createHierarchyDiagramShapes, createTriangleTopologyDiagramShapes, createCoverEngineCoreShapes, createSkillChainOverviewShapes, createPageLevelSkillChainOverviewObjects, createLinearProcessDiagramShapes, createPrdGenerationFlowShapes, syncPrdGenerationMinimumUnitBoxes, createPrototypeValidationFlowShapes, applyPrototypeValidationScreenshotPolicy, syncPrototypeValidationCandidateSources, createDemandUnderstandingFlowShapes, hasSpecializedComparisonSkeletonCandidate, createComparisonMatrixShapes, createSaturatedDiagramTextShapes, createSemanticCycleDiagramShapes, createProductManagerFrictionNetworkObjects, createDenseComplexDiagramScaffoldObjects, createTwoPanelDiagramTextShapes, createTopComplexDiagramTextShapes, createShiftLeftDebuggerDiagramObjects, createToolIslandTransitionMatrixObjects, createKpiEvidenceTextShapes, createValueQuadrantShapes, createReviewRiskGateFlowShapes, createFunnelHubDiagramShapes, createHorizontalStepChainShapes, createGenericNodeDiagramSkeletonShapes, createVisualClusterStackShapes, createWmsRouteChainShapes, createCollaborationFlowShapes, createStackedArchitectureDiagramObjects, createToolGapPlatformDiagramObjects, createProcessWithScreenshotsFlowObjects, createTextAnchoredProcessNetworkObjects, createDocumentVersionGovernanceObjects, createDocumentVersionFolderFlowObjects, createAssetOsFlowObjects, createPrototypeGenerationLoopModel, createPortalPlatformDiagramObjects, createSystemMapDiagramObjects, createSystemMapFidelityChromeObjects, shouldAutoObjectifyEntropyIsland, createEntropyChallengeFragmentShapes, createEntropyChallengeIslandShapes, createEntropyChallengeAnnotationObjects, createEntropyChallengeFooterBulletShapes, createVisualAtomNativeShapes, filterTextBoxesForGraphicUnderlays, createSpecializedNativeHybridResidualCrops, uniqueImagesById, createSpecializedNativeHybridResidualCropsFromNativeShapes, createPrototypeGenerationLoopPictorialCrops, shouldDeferNativeRebuildForComponentStrategy, shouldAllowVisualAtomOverlayForDeferredComponent, isWorkflowDemandUnderstandingAssistantLeftIllustrationCrop, isWorkflowPrdAutoGenerationLeftIllustrationCrop } = dependencies;
const valueBannerBackgroundShapes = image && options.objectifyValueBanners === true
      ? createValueBannerBackgroundShapes(pageDraft.images, nativeTextBoxes, image, slideSize, options.irDir)
      : [];
    if (valueBannerBackgroundShapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.valueBannerObjectified !== true);
    }
    const textBackplateShapes = image && decorativeBackground.length === 0
      ? createTextBackplateShapes(image, nativeTextBoxes, slideSize)
      : [];
    const layerContainerShapes = image && options.objectifyLayerContainers === true
      ? createLayerContainerShapes(nativeRebuildCandidateImages, nativeTextBoxes, image, slideSize)
      : [];
    const matrixColorBlockShapes = image && options.objectifyLayerContainers === true
      ? createMatrixColorBlockShapes(nativeRebuildCandidateImages, image, slideSize)
      : [];
    const layerColorBlockShapes = image && options.objectifyLayerContainers === true
      ? createLayerColorBlockShapes(nativeRebuildCandidateImages, image, slideSize)
      : [];
    const stickyNoteClusterShapes = image && options.objectifyLayerContainers === true
      ? createStickyNoteClusterShapes(nativeRebuildCandidateImages, image, slideSize)
      : [];
    const layerConnectorShapes = image && options.objectifyLayerConnectors === true
      ? createLayerConnectorShapes(nativeRebuildCandidateImages, layerContainerShapes, image, slideSize)
      : [];
    const tableGridShapes = options.objectifyTableGrid === true
      ? createTableZoneGridShapes(pageDraft.images, nativeTextBoxes)
      : [];
    const tableBackgroundShapes = image && options.objectifyTableGrid === true
      ? createTableZoneBackgroundShapes(pageDraft.images, nativeTextBoxes, image, slideSize)
      : [];
    const tableZoneSemanticTextBoxes = image && options.objectifyTableGrid === true
      ? createTableZoneSemanticTextBoxes(pageDraft.images, nativeTextBoxes, image, slideSize, options.irDir)
      : [];
    const quadrantDividerShapes = image && options.objectifyTableGrid === true
      ? createQuadrantDividerShapes(pageDraft.images, nativeTextBoxes, image, slideSize)
      : [];
    const networkDiagramShapes = image && options.objectifyLayerConnectors === true
      ? createNetworkDiagramShapes(nativeRebuildCandidateImages, image, slideSize, { irDir: options.irDir })
      : [];
    syncObjectifiedCandidateSources(pageDraft.images, nativeRebuildCandidateImages, {
      objectifiedFlags: ["networkDiagramObjectified", "denseRadialNetworkPreservedAsCrop"],
      dropResidual: nativeRebuildCandidateImages.some(
        (item) => item?.source?.networkDiagramObjectified === true
          && item?.source?.denseRadialNetworkPreservedAsCrop !== true
      )
    });
    let pageLevelNetworkDiagramShapes = [];
    const hierarchyDiagramShapes = image && options.objectifyLayerConnectors === true
      ? createHierarchyDiagramShapes(nativeRebuildCandidateImages, nativeTextBoxes, image, slideSize)
      : [];
    const triangleTopologyShapes = image && options.objectifyLayerConnectors === true
      ? createTriangleTopologyDiagramShapes(nativeRebuildCandidateImages, rawTextBoxes, image, slideSize)
      : [];
    syncObjectifiedCandidateSources(pageDraft.images, nativeRebuildCandidateImages, {
      objectifiedFlags: ["triangleTopologyObjectified"],
      dropResidual: triangleTopologyShapes.length > 0
    });
    const coverEngineCoreShapes = image && options.objectifyLayerConnectors === true
      ? createCoverEngineCoreShapes(nativeRebuildCandidateImages, textBoxes, image, slideSize)
      : [];
    syncObjectifiedCandidateSources(pageDraft.images, nativeRebuildCandidateImages, {
      objectifiedFlags: ["coverEngineCoreObjectified"],
      dropResidual: coverEngineCoreShapes.length > 0
    });
    const skillChainOverviewShapes = image && options.objectifyLayerConnectors === true
      ? createSkillChainOverviewShapes(nativeRebuildCandidateImages, textBoxes, image, slideSize)
      : [];
    syncObjectifiedCandidateSources(pageDraft.images, nativeRebuildCandidateImages, {
      objectifiedFlags: ["skillChainOverviewObjectified"]
    });
    const pageLevelSkillChainOverview = image && options.objectifyLayerConnectors === true && skillChainOverviewShapes.length === 0
      ? createPageLevelSkillChainOverviewObjects(pageDraft, textBoxes, image, slideSize)
      : { shapes: [], textBoxes: [] };
    if (pageLevelSkillChainOverview.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.pageLevelSkillChainResidualDrop !== true);
    }
    const linearProcessShapes = image && options.objectifyLayerConnectors === true
      ? createLinearProcessDiagramShapes(nativeRebuildCandidateImages, nativeTextBoxes, image, slideSize)
      : [];
    const prdGenerationFlowImages = [];
    const prdGenerationFlowShapes = image && options.objectifyLayerConnectors === true
      ? createPrdGenerationFlowShapes(nativeRebuildCandidateImages, textBoxes, image, slideSize, {
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex,
        rawTextBoxes,
        generatedImages: prdGenerationFlowImages
      })
      : [];
    if (prdGenerationFlowImages.length > 0) pageDraft.images.push(...prdGenerationFlowImages);
    syncObjectifiedCandidateSources(pageDraft.images, nativeRebuildCandidateImages, {
      objectifiedFlags: ["prdGenerationFlowObjectified"],
      dropResidual: prdGenerationFlowShapes.length > 0
    });
    syncObjectifiedCandidateSources(pageDraft.images, nativeRebuildCandidateImages, {
      objectifiedFlags: ["prdGenerationSegmentCropPreserved"]
    });
    syncPrdGenerationMinimumUnitBoxes(pageDraft.images);
    const prototypeValidationFlowShapes = image && options.objectifyLayerConnectors === true
      ? createPrototypeValidationFlowShapes(nativeRebuildCandidateImages, textBoxes, image, slideSize)
      : [];
    const prototypeValidationPolicyDraft = {
      shapes: prototypeValidationFlowShapes,
      images: nativeRebuildCandidateImages,
      textBoxes: []
    };
    applyPrototypeValidationScreenshotPolicy(prototypeValidationPolicyDraft);
    prototypeValidationFlowShapes.splice(0, prototypeValidationFlowShapes.length, ...prototypeValidationPolicyDraft.shapes);
    syncPrototypeValidationCandidateSources(pageDraft.images, nativeRebuildCandidateImages);
    const demandUnderstandingFlowShapes = image && options.objectifyLayerConnectors === true
      ? createDemandUnderstandingFlowShapes(nativeRebuildCandidateImages, textBoxes, image, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : [];
    if (Array.isArray(demandUnderstandingFlowShapes.images) && demandUnderstandingFlowShapes.images.length > 0) {
      pageDraft.images.push(...demandUnderstandingFlowShapes.images);
    }
    const comparisonMatrixShapes = image && (options.objectifyLayerConnectors === true || hasSpecializedComparisonSkeletonCandidate(nativeRebuildCandidateImages))
      ? createComparisonMatrixShapes(nativeRebuildCandidateImages, textBoxes, image, slideSize, options.irDir)
      : [];
    const saturatedDiagramTextShapes = image && options.objectifyLayerConnectors === true
      ? createSaturatedDiagramTextShapes(nativeRebuildCandidateImages, textBoxes, image, slideSize, options.irDir)
      : [];
    const semanticCycleDiagramShapes = image && options.objectifyLayerConnectors === true
      ? createSemanticCycleDiagramShapes(nativeRebuildCandidateImages, textBoxes, image, slideSize, options.irDir, {
        assetDir: options.assetDir,
        deckName: options.deckName,
        pageIndex,
        // Interlocking rings with glow, arrows, and embedded pictorial nodes
        // read as one authored graphic. Preserve them as a single crop in the
        // fidelity-first path rather than exposing a visibly assembled loop.
        preserveHighFidelitySemanticCycle: options.preserveGraphics === true
      })
      : [];
    if (Array.isArray(semanticCycleDiagramShapes.images) && semanticCycleDiagramShapes.images.length > 0) {
      const replacedIds = new Set(semanticCycleDiagramShapes.images
        .map((item) => String(item?.source?.parentImageId || ""))
        .filter(Boolean));
      pageDraft.images = pageDraft.images.filter((item) => !replacedIds.has(String(item?.id || "")));
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => !replacedIds.has(String(item?.id || "")));
      pageDraft.images.push(...semanticCycleDiagramShapes.images);
    }
    syncObjectifiedCandidateSources(pageDraft.images, nativeRebuildCandidateImages, {
      objectifiedFlags: ["semanticCycleDiagramObjectified"]
    });
    const semanticCycleFidelityCrops = pageDraft.images.filter((item) =>
      item?.source?.detector === "semantic-cycle-interlocking-minimum-unit-crop"
      && item?.source?.textEmbeddedInFidelityCrop === true
    );
    if (semanticCycleFidelityCrops.length > 0) {
      // Native text is normally selected before specialized diagrams are
      // materialized. Remove only labels already retained inside this crop.
      const retained = filterTextBoxesForGraphicUnderlays(nativeTextBoxes, semanticCycleFidelityCrops);
      nativeTextBoxes.splice(0, nativeTextBoxes.length, ...retained);
    }
    const productManagerFrictionNetwork = image && options.objectifyLayerConnectors === true
      ? createProductManagerFrictionNetworkObjects(nativeRebuildCandidateImages, rawTextBoxes, slideSize, { sourceImage: image, pageIndex })
      : { matched: false, shapes: [], textBoxes: [], sourceIds: [] };
    if (productManagerFrictionNetwork.matched) {
      const sourceIds = new Set(productManagerFrictionNetwork.sourceIds.map(String));
      pageDraft.images = pageDraft.images.filter((item) => !sourceIds.has(String(item?.id || "")));
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => !sourceIds.has(String(item?.id || "")));
    }
    const denseComplexDiagramScaffold = image && options.objectifyLayerConnectors === true
      ? createDenseComplexDiagramScaffoldObjects(nativeRebuildCandidateImages, rawTextBoxes, slideSize)
      : { shapes: [], textBoxes: [] };
    const denseComplexDiagramScaffoldShapes = denseComplexDiagramScaffold.shapes;
    const twoPanelDiagramTextShapes = image && options.objectifyLayerConnectors === true
      ? createTwoPanelDiagramTextShapes(nativeRebuildCandidateImages, textBoxes, image, slideSize, options.irDir)
      : [];
    const topComplexDiagramTextShapes = image && options.objectifyLayerConnectors === true
      ? createTopComplexDiagramTextShapes(nativeRebuildCandidateImages, textBoxes, image, slideSize, options.irDir)
      : [];
    const shiftLeftDebuggerDiagram = image && options.objectifyLayerConnectors === true
      ? createShiftLeftDebuggerDiagramObjects(pageDraft, rawTextBoxes, slideSize)
      : { shapes: [], textBoxes: [] };
    if (shiftLeftDebuggerDiagram.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.shiftLeftDebuggerDiagramObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.shiftLeftDebuggerDiagramObjectified !== true);
    }
    const toolIslandTransitionMatrix = image && options.objectifyLayerConnectors === true
      ? createToolIslandTransitionMatrixObjects(specializedNativeEligiblePageDraft(), rawTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [], images: [], tables: [] };
    if (toolIslandTransitionMatrix.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.toolIslandTransitionMatrixObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.toolIslandTransitionMatrixObjectified !== true);
      if (Array.isArray(toolIslandTransitionMatrix.images) && toolIslandTransitionMatrix.images.length > 0) {
        pageDraft.images.push(...toolIslandTransitionMatrix.images);
      }
    }
    const kpiEvidenceTextShapes = image && options.objectifyLayerConnectors === true
      ? createKpiEvidenceTextShapes(pageDraft.images, textBoxes, image, slideSize, options.irDir)
      : [];
    const valueQuadrantShapes = image && options.objectifyLayerConnectors === true
      ? createValueQuadrantShapes(nativeRebuildCandidateImages, textBoxes, image, slideSize)
      : [];
    const reviewRiskGateFlowShapes = image && options.objectifyLayerConnectors === true
      ? createReviewRiskGateFlowShapes(nativeRebuildCandidateImages, rawTextBoxes, image, slideSize, {
        allowSmartReviewAliases: options.objectifySmartReviewSegmented === true
      })
      : [];
    syncObjectifiedCandidateSources(pageDraft.images, nativeRebuildCandidateImages, {
      objectifiedFlags: ["reviewRiskGateFlowObjectified"]
    });
    const funnelHubDiagramShapes = image && options.objectifyLayerConnectors === true
      ? createFunnelHubDiagramShapes(nativeRebuildCandidateImages, nativeTextBoxes, image, slideSize)
      : [];
    const horizontalStepChainShapes = image && options.objectifyLayerConnectors === true
      ? createHorizontalStepChainShapes(nativeRebuildCandidateImages, nativeTextBoxes, image, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : [];
    if (Array.isArray(horizontalStepChainShapes.images) && horizontalStepChainShapes.images.length > 0) {
      pageDraft.images.push(...horizontalStepChainShapes.images);
    }
    syncObjectifiedCandidateSources(pageDraft.images, nativeRebuildCandidateImages, {
      objectifiedFlags: ["sparseFlowCardChainSkeletonObjectified", "horizontalStepChainObjectified"],
      dropResidual: horizontalStepChainShapes.length > 0
    });
    const genericNodeDiagramSkeletonShapes = image && options.objectifyLayerConnectors === true
      ? createGenericNodeDiagramSkeletonShapes(nativeRebuildCandidateImages, nativeTextBoxes, image, slideSize)
      : [];
    const visualClusterStackShapes = image && options.objectifyLayerConnectors === true
      ? createVisualClusterStackShapes(nativeRebuildCandidateImages, image, slideSize, rawTextBoxes)
      : [];
    syncObjectifiedCandidateSources(pageDraft.images, nativeRebuildCandidateImages, {
      objectifiedFlags: ["visualClusterStackObjectified"],
      dropResidual: visualClusterStackShapes.length > 0
    });
    const wmsRouteChainShapes = image && options.objectifyLayerConnectors === true
      ? createWmsRouteChainShapes(nativeRebuildCandidateImages, textBoxes, image, slideSize, options.irDir, {
        forcePreserveWholeFidelityCrop: options.forcePreserveWmsRouteGraphic === true
      })
      : [];
    // WMS reconstruction writes residual-icon metadata to the enriched candidate.
    // Mirror it back before residual splitting operates on the final page images.
    syncObjectifiedCandidateSources(pageDraft.images, nativeRebuildCandidateImages, {
      objectifiedFlags: ["wmsRouteChainObjectified"]
    });
    const collaborationFlowShapes = image && options.objectifyLayerConnectors === true
      ? createCollaborationFlowShapes(nativeRebuildCandidateImages, textBoxes, image, slideSize, options.irDir)
      : [];
    const stackedArchitectureDiagram = image && options.objectifyLayerConnectors === true
      ? createStackedArchitectureDiagramObjects(specializedNativeEligibleImages(), rawTextBoxes, image, slideSize)
      : { shapes: [], textBoxes: [] };
    if (stackedArchitectureDiagram.shapes.length > 0) {
      const sourceLayerIds = [...new Set(stackedArchitectureDiagram.shapes
        .map((shape) => shape?.source?.layerSourceId)
        .filter(Boolean))];
      let hybridResiduals = createSpecializedNativeHybridResidualCrops(uniqueImagesById([
        ...pageDraft.images,
        ...nativeRebuildCandidateImages
      ]), {
        hybridComponentTemplateResiduals: options.hybridComponentTemplateResiduals === true,
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex,
        slideSize,
        residualKind: "stacked-architecture",
        sourceLayerIds,
        textBoxes: stackedArchitectureDiagram.textBoxes,
        eraseSpecializedHybridResidualText: options.eraseSpecializedHybridResidualText === true
      });
      if (hybridResiduals.length === 0) {
        hybridResiduals = createSpecializedNativeHybridResidualCropsFromNativeShapes(stackedArchitectureDiagram.shapes, {
          hybridComponentTemplateResiduals: options.hybridComponentTemplateResiduals === true,
          sourceImage: image,
          assetDir: options.assetDir,
          irDir: options.irDir,
          deckName: options.deckName,
          pageIndex,
          slideSize,
          residualKind: "stacked-architecture",
          textBoxes: stackedArchitectureDiagram.textBoxes,
          eraseSpecializedHybridResidualText: options.eraseSpecializedHybridResidualText === true
        });
      }
      if (hybridResiduals.length > 0) pageDraft.images.push(...hybridResiduals);
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.standardizedFourLayerArchitectureObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.standardizedFourLayerArchitectureObjectified !== true);
    }
    const toolGapPlatformDiagram = image && options.objectifyLayerConnectors === true && options.objectifyToolGapPlatform === true
      ? createToolGapPlatformDiagramObjects(nativeRebuildCandidateImages, rawTextBoxes, image, slideSize)
      : { shapes: [], textBoxes: [] };
    const processWithScreenshotsFlow = options.objectifyLayerConnectors === true && stackedArchitectureDiagram.shapes.length === 0
      ? createProcessWithScreenshotsFlowObjects(nativeRebuildCandidateImages, image, slideSize, {
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [], images: [] };
    if (Array.isArray(processWithScreenshotsFlow.images) && processWithScreenshotsFlow.images.length > 0) {
      pageDraft.images.push(...processWithScreenshotsFlow.images);
    }
    // The flow builder works on candidate copies. Mirror its classification to the final layer so residual splitting keeps only endpoint illustrations.
    syncObjectifiedCandidateSources(pageDraft.images, nativeRebuildCandidateImages, {
      objectifiedFlags: [
        "processWithScreenshotsFlowObjectified",
        "processWithScreenshotsLeftIllustrationObjectified",
        "processWithScreenshotsChaosCoreObjectified",
        "processWithScreenshotsFullyObjectified",
        "productWorkflowIconProcessObjectified",
        "productWorkflowEndpointObjectified",
        "productWorkflowStageCropsPreserved"
      ]
    });
    const textAnchoredProcessNetwork = image && options.objectifyLayerConnectors === true
      ? createTextAnchoredProcessNetworkObjects(pageDraft.images, rawTextBoxes, image, slideSize, {
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { matched: false, targetId: null, shapes: [], textBoxes: [], images: [] };
    if (textAnchoredProcessNetwork.matched) {
      pageDraft.images = pageDraft.images.filter((item) => String(item?.id || "") !== String(textAnchoredProcessNetwork.targetId || ""));
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => String(item?.id || "") !== String(textAnchoredProcessNetwork.targetId || ""));
      pageDraft.images.push(...textAnchoredProcessNetwork.images);
    }
    const documentVersionGovernance = image && options.objectifyLayerConnectors === true
      ? createDocumentVersionGovernanceObjects(pageDraft, rawTextBoxes, slideSize, {
        sourceImage: image,
        irDir: options.irDir
      })
      : { shapes: [], textBoxes: [], images: [] };
    if (documentVersionGovernance.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.documentVersionGovernanceObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.documentVersionGovernanceObjectified !== true);
      if (documentVersionGovernance.images.length > 0) pageDraft.images.push(...documentVersionGovernance.images);
    }
    const documentVersionFolderFlow = image && options.objectifyLayerConnectors === true && documentVersionGovernance.shapes.length === 0
      ? createDocumentVersionFolderFlowObjects(pageDraft.images, rawTextBoxes, image, slideSize)
      : { shapes: [], textBoxes: [] };
    const assetOsFlow = image && options.objectifyLayerConnectors === true
      ? createAssetOsFlowObjects(pageDraft.images, rawTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [] };
    if (Array.isArray(assetOsFlow.images) && assetOsFlow.images.length > 0) {
      pageDraft.images.push(...assetOsFlow.images);
    }
    const prototypeGenerationLoop = image && options.objectifyLayerConnectors === true
      ? createPrototypeGenerationLoopModel(pageDraft, slideSize, { sourceImage: image })
      : { matched: false, shapes: [], pictorialRegions: [], sourceIds: [] };
    if (prototypeGenerationLoop.matched) {
      const ownedIds = new Set(prototypeGenerationLoop.sourceIds.map(String));
      const ownedImages = pageDraft.images.filter((item) => ownedIds.has(String(item?.id || "")));
      const pictorialCrops = createPrototypeGenerationLoopPictorialCrops({
        sourceImage: image,
        regions: prototypeGenerationLoop.pictorialRegions,
        slideSize,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex,
        source: ownedImages[0]?.source
      });
      pageDraft.images = pageDraft.images.filter((item) => !ownedIds.has(String(item?.id || "")));
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => !ownedIds.has(String(item?.id || "")));
      pageDraft.images.push(...pictorialCrops);
    }
    const portalPlatformDiagram = image && options.objectifyLayerConnectors === true
      ? createPortalPlatformDiagramObjects(specializedNativeEligibleImages(), rawTextBoxes, slideSize)
      : { shapes: [], textBoxes: [] };
    const systemMapDiagram = image && autoObjectifySystemMap && !unreadableSystemMapFidelityProtected
      ? createSystemMapDiagramObjects(pageDraft.images, rawTextBoxes, slideSize, {
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex,
        preserveDenseNetworkCrop: true
      })
      : { shapes: [], textBoxes: [], images: [] };
    const systemMapFidelityIncludesChrome = pageDraft.images.some((item) =>
      item?.source?.systemMapFidelityProtected === true && item?.source?.systemMapFidelityIncludesChrome === true
    );
    const systemMapFidelityChrome = unreadableSystemMapFidelityProtected && !systemMapFidelityIncludesChrome
      ? createSystemMapFidelityChromeObjects(rawTextBoxes, slideSize)
      : { shapes: [], textBoxes: [] };
    if (systemMapDiagram.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.systemMapDiagramObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.systemMapDiagramObjectified !== true);
      if (Array.isArray(systemMapDiagram.images) && systemMapDiagram.images.length > 0) {
        pageDraft.images.push(...systemMapDiagram.images);
      }
    }
    const allowEntropyNativeApproximation = options.allowEntropyChallengeNativeApproximation === true;
    const autoObjectifyEntropyIsland = shouldAutoObjectifyEntropyIsland(pageDraft.images);
    const entropyFragmentShapes = image && options.objectifyLayerConnectors === true && allowEntropyNativeApproximation
      ? createEntropyChallengeFragmentShapes(textBoxes, slideSize, image)
      : [];
    const entropyIslandShapes = image && options.objectifyLayerConnectors === true && (allowEntropyNativeApproximation || autoObjectifyEntropyIsland)
      ? createEntropyChallengeIslandShapes(textBoxes, slideSize, image)
      : [];
    const entropyChallengeAnnotations = createEntropyChallengeAnnotationObjects(rawTextBoxes, pageDraft.images, slideSize);
    const entropyChallengeFooterShapes = createEntropyChallengeFooterBulletShapes(textBoxes, slideSize);
    const visualAtomSourceImages = pageDraft.images.filter((item) =>
      !hasUnverifiedNativeGeometry(item) && (!shouldDeferNativeRebuildForComponentStrategy(item)
      || shouldAllowVisualAtomOverlayForDeferredComponent(item))
    );
    const visualAtomNativeShapes = image && options.objectifyLayerConnectors === true
      ? createVisualAtomNativeShapes(visualAtomSourceImages.filter((item) =>
        item?.source?.demandUnderstandingFlowObjectified !== true
        && item?.source?.comparisonMatrixObjectified !== true
        && item?.source?.valueQuadrantObjectified !== true
        && item?.source?.skillChainOverviewObjectified !== true
        && item?.source?.stackedArchitectureObjectified !== true
        && item?.source?.toolGapPlatformObjectified !== true
        && item?.source?.inputOutputSplitObjectified !== true
        && item?.source?.wmsRouteChainObjectified !== true
        && item?.source?.collaborationFlowObjectified !== true
        && item?.source?.semanticCycleDiagramObjectified !== true
        && item?.source?.assetOsFlowObjectified !== true
        && item?.source?.portalPlatformDiagramObjectified !== true
        && item?.source?.systemMapDiagramObjectified !== true
        && item?.source?.triangleTopologyObjectified !== true
        && item?.source?.shiftLeftDebuggerDiagramObjectified !== true
        && item?.source?.toolIslandTransitionMatrixObjectified !== true
        && item?.source?.visualClusterStackObjectified !== true
        && item?.source?.skipVisualAtomRebuild !== true
        && item?.source?.semanticSplitOwnsLayer !== true
        && !isWorkflowDemandUnderstandingAssistantLeftIllustrationCrop(item, rawTextBoxes)
        && !isWorkflowPrdAutoGenerationLeftIllustrationCrop(item, rawTextBoxes)
      ), image, slideSize)
      : [];
  return { valueBannerBackgroundShapes, textBackplateShapes, layerContainerShapes, matrixColorBlockShapes, layerColorBlockShapes, stickyNoteClusterShapes, layerConnectorShapes, tableGridShapes, tableBackgroundShapes, tableZoneSemanticTextBoxes, quadrantDividerShapes, networkDiagramShapes, pageLevelNetworkDiagramShapes, hierarchyDiagramShapes, triangleTopologyShapes, coverEngineCoreShapes, skillChainOverviewShapes, pageLevelSkillChainOverview, linearProcessShapes, prdGenerationFlowShapes, prototypeValidationFlowShapes, demandUnderstandingFlowShapes, comparisonMatrixShapes, saturatedDiagramTextShapes, semanticCycleDiagramShapes, semanticCycleFidelityCrops, productManagerFrictionNetwork, denseComplexDiagramScaffold, denseComplexDiagramScaffoldShapes, twoPanelDiagramTextShapes, topComplexDiagramTextShapes, shiftLeftDebuggerDiagram, toolIslandTransitionMatrix, kpiEvidenceTextShapes, valueQuadrantShapes, reviewRiskGateFlowShapes, funnelHubDiagramShapes, horizontalStepChainShapes, genericNodeDiagramSkeletonShapes, visualClusterStackShapes, wmsRouteChainShapes, collaborationFlowShapes, stackedArchitectureDiagram, toolGapPlatformDiagram, processWithScreenshotsFlow, textAnchoredProcessNetwork, documentVersionGovernance, documentVersionFolderFlow, assetOsFlow, prototypeGenerationLoop, portalPlatformDiagram, systemMapDiagram, systemMapFidelityChrome, allowEntropyNativeApproximation, autoObjectifyEntropyIsland, entropyFragmentShapes, entropyIslandShapes, entropyChallengeAnnotations, entropyChallengeFooterShapes, visualAtomNativeShapes, nativeRebuildCandidateImages };
}

module.exports = { buildPageNativeGraphicsStage };
