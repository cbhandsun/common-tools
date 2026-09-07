"use strict";

function buildPageHybridGraphicsStage(context, nativeGraphics, dependencies) {
  const { options, pageDraft, slideSize, image, pageIndex, rawTextBoxes, imageFile, componentIndexPage, textBoxes, productCollaborationChallenge } = context;
  let { nativeRebuildCandidateImages } = context;
  const { tableBackgroundShapes, tableGridShapes, comparisonMatrixShapes, stackedArchitectureDiagram, semanticCycleDiagramShapes, visualAtomNativeShapes, layerContainerShapes, matrixColorBlockShapes, layerColorBlockShapes, stickyNoteClusterShapes, layerConnectorShapes, quadrantDividerShapes, networkDiagramShapes, pageLevelNetworkDiagramShapes, hierarchyDiagramShapes, triangleTopologyShapes, coverEngineCoreShapes, skillChainOverviewShapes, pageLevelSkillChainOverview, linearProcessShapes, prdGenerationFlowShapes, prototypeValidationFlowShapes, demandUnderstandingFlowShapes, saturatedDiagramTextShapes, denseComplexDiagramScaffoldShapes, twoPanelDiagramTextShapes, topComplexDiagramTextShapes, shiftLeftDebuggerDiagram, toolIslandTransitionMatrix, kpiEvidenceTextShapes, valueQuadrantShapes, reviewRiskGateFlowShapes, funnelHubDiagramShapes, horizontalStepChainShapes, genericNodeDiagramSkeletonShapes, visualClusterStackShapes, wmsRouteChainShapes, collaborationFlowShapes, toolGapPlatformDiagram, processWithScreenshotsFlow, textAnchoredProcessNetwork, documentVersionFolderFlow, assetOsFlow, portalPlatformDiagram, systemMapDiagram, entropyFragmentShapes, entropyIslandShapes } = nativeGraphics;
  const { createStructuredIllustrationCardShellShapes, createAssetHubCycleIllustrationObjects, shouldObjectifyProductBrainWmsQualityGate, createInputOutputSplitDiagramObjects, createCliScaffoldGeneratorObjects, createVisualOperationSyncModel, materializeVisualOperationSyncImages, createEmbeddedExpertScreenshotModel, materializeEmbeddedExpertScreenshot, createRuntimeEngineHybridModel, materializeRuntimeEngineHybridImages, createParadigmShiftMatrixModel, materializeParadigmShiftGem, createValueTransformationTableModel, materializeValueTransformationIcon, createOcrGridTableModel, materializeOcrGridIcon, createProductBrainVisionObjects, createAssetOsHighValueAssetMatrixObjects, componentAssetLayerPseudoImages, shouldPreferAppliedPluginComponent, createFragmentedAssetChainModel, filterComponentTemplateShapeLayerInputs, mergeDiagramTextBoxes, collectObjectifiedDiagramTextBoxes, collectComponentTemplateFallbackDiagramTextBoxes, filterComponentTemplateNativeInputs, createComponentTemplateNativeObjects, createWorkflowSupplyChainTwoPanelObjects, materializeAssetOsFragmentedAssetChainCrops, replaceComponentTemplateCropsWhenFullyNative, createSpecializedNativeHybridResidualCropsFromNativeShapes, eraseObjectifiedLayerPrimitives, restorePrdGenerationSegmentCropsAfterPrimitiveErasure, migrateLegacyResidualOwnership, splitErasedResidualCrops } = dependencies;
const structuredIllustrationCardShellShapes = options.objectifyLayerConnectors === true
      ? createStructuredIllustrationCardShellShapes(pageDraft.images, slideSize)
      : [];
    const assetHubCycleIllustration = image && options.objectifyLayerConnectors === true
      ? createAssetHubCycleIllustrationObjects(pageDraft, slideSize, {
        objectifyInputIcons: options.objectifyAssetHubInputIcons === true,
        objectifyOutputIcons: options.objectifyAssetHubOutputIcons === true,
        preserveEndpointIcons: options.preserveAssetHubEndpointIcons !== false,
        sourceImage: image,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex
      })
      : { shapes: [], textBoxes: [], images: [] };
    if (assetHubCycleIllustration.images?.length > 0) pageDraft.images.push(...assetHubCycleIllustration.images);
    const productBrainWmsQualityGatePreferred = shouldObjectifyProductBrainWmsQualityGate(pageDraft, rawTextBoxes, slideSize);
    const inputOutputSplitDiagram = image && options.objectifyLayerConnectors === true && !productBrainWmsQualityGatePreferred
      ? createInputOutputSplitDiagramObjects(pageDraft, slideSize)
      : { shapes: [], textBoxes: [] };
    // This detector requires a complete, ordered command/module/output signature.
    // It is safe to enable independently of the broader connector reconstruction mode.
    const cliScaffoldGenerator = image
      ? createCliScaffoldGeneratorObjects(pageDraft, slideSize, { sourceImage: image })
      : { matched: false, shapes: [], textBoxes: [], sourceIds: [] };
    if (cliScaffoldGenerator.matched) {
      const ownedIds = new Set(cliScaffoldGenerator.sourceIds.map(String));
      pageDraft.images = pageDraft.images.filter((item) => !ownedIds.has(String(item?.id || "")));
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => !ownedIds.has(String(item?.id || "")));
    }
    const visualOperationSyncModel = image && options.objectifyLayerConnectors === true
      ? createVisualOperationSyncModel({ ...pageDraft, textBoxes: rawTextBoxes }, slideSize)
      : { matched: false, shapes: [], textBoxes: [], cropRegions: [], sourceIds: [] };
    const visualOperationSyncImages = visualOperationSyncModel.matched
      ? materializeVisualOperationSyncImages(visualOperationSyncModel, {
        sourceImage: imageFile,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex,
        slideSize
      })
      : [];
    const visualOperationSync = visualOperationSyncModel.matched && visualOperationSyncImages.length === 7
      ? { ...visualOperationSyncModel, images: visualOperationSyncImages }
      : { matched: false, shapes: [], textBoxes: [], cropRegions: [], sourceIds: [], images: [] };
    if (visualOperationSync.matched) {
      pageDraft.images = [...visualOperationSync.images];
      nativeRebuildCandidateImages = [];
    }
    const embeddedExpertScreenshotModel = image && options.objectifyLayerConnectors === true
      ? createEmbeddedExpertScreenshotModel({ ...pageDraft, textBoxes: rawTextBoxes }, slideSize)
      : { matched: false, shapes: [], textBoxes: [], screenshotRegion: null, sourceIds: [] };
    const embeddedExpertScreenshotImage = embeddedExpertScreenshotModel.matched
      ? materializeEmbeddedExpertScreenshot(embeddedExpertScreenshotModel, {
        sourceImage: imageFile,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex,
        slideSize
      })
      : null;
    const embeddedExpertScreenshot = embeddedExpertScreenshotModel.matched && embeddedExpertScreenshotImage
      ? { ...embeddedExpertScreenshotModel, image: embeddedExpertScreenshotImage }
      : { matched: false, shapes: [], textBoxes: [], screenshotRegion: null, sourceIds: [], image: null };
    if (embeddedExpertScreenshot.matched) {
      pageDraft.images = [embeddedExpertScreenshot.image];
      pageDraft.tables = [];
      pageDraft.charts = [];
      nativeRebuildCandidateImages = [];
    }
    // The hybrid model fails closed unless its complete runtime-engine label
    // signature is present, while retaining only screenshot/icon minimum units.
    const runtimeEngineHybridModel = image
      ? createRuntimeEngineHybridModel(pageDraft, slideSize)
      : { matched: false, shapes: [], cropRegions: [], sourceIds: [] };
    const runtimeEngineHybridImages = runtimeEngineHybridModel.matched
      ? materializeRuntimeEngineHybridImages(runtimeEngineHybridModel, {
        sourceImage: imageFile,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex,
        slideSize
      })
      : [];
    const runtimeEngineHybrid = runtimeEngineHybridModel.matched && runtimeEngineHybridImages.length === 2
      ? { ...runtimeEngineHybridModel, images: runtimeEngineHybridImages }
      : { matched: false, shapes: [], cropRegions: [], sourceIds: [], images: [] };
    if (runtimeEngineHybrid.matched) {
      pageDraft.images = [...runtimeEngineHybrid.images];
      nativeRebuildCandidateImages = [];
    }
    const paradigmShiftMatrixModel = image && options.objectifyLayerConnectors === true
      ? createParadigmShiftMatrixModel({ ...pageDraft, textBoxes: rawTextBoxes }, slideSize)
      : { matched: false, table: null, shapes: [], textBoxes: [], iconRegion: null, sourceIds: [] };
    const paradigmShiftGem = paradigmShiftMatrixModel.matched
      ? materializeParadigmShiftGem(paradigmShiftMatrixModel, {
        sourceImage: imageFile,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex,
        slideSize
      })
      : null;
    const paradigmShiftMatrix = paradigmShiftMatrixModel.matched && paradigmShiftGem
      ? { ...paradigmShiftMatrixModel, icon: paradigmShiftGem }
      : { matched: false, table: null, shapes: [], textBoxes: [], iconRegion: null, sourceIds: [], icon: null };
    if (paradigmShiftMatrix.matched) {
      pageDraft.images = [paradigmShiftMatrix.icon];
      pageDraft.tables = paradigmShiftMatrix.table ? [paradigmShiftMatrix.table] : [];
      nativeRebuildCandidateImages = [];
    }
    // A complete 5x3 comparison-table signature is required by the model, so
    // it can safely produce a native table without the broad connector mode.
    const valueTransformationTableModel = image && !paradigmShiftMatrix.matched
      ? createValueTransformationTableModel(pageDraft, slideSize)
      : { matched: false, table: null, iconRegion: null, sourceIds: [] };
    const valueTransformationIcon = valueTransformationTableModel.matched
      ? materializeValueTransformationIcon(valueTransformationTableModel, {
        sourceImage: imageFile,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex,
        slideSize
      })
      : null;
    const valueTransformationTable = valueTransformationTableModel.matched && valueTransformationIcon
      ? { ...valueTransformationTableModel, icon: valueTransformationIcon }
      : { matched: false, table: null, iconRegion: null, sourceIds: [], icon: null };
    if (valueTransformationTable.matched) {
      pageDraft.images = [valueTransformationTable.icon];
      pageDraft.tables = [valueTransformationTable.table];
      nativeRebuildCandidateImages = [];
    }
    const structuredCaseImages = pageDraft.images.filter((item) =>
      item?.source?.detector === "structured-case-graphic-underlay-crop");
    const ocrGridTable = image
      && options.objectifyLayerConnectors === true
      && !valueTransformationTable.matched
      && !paradigmShiftMatrix.matched
      && pageDraft.images.length === 1
      && structuredCaseImages.length === 1
      ? createOcrGridTableModel({ ...pageDraft, textBoxes: rawTextBoxes }, image, slideSize)
      : { matched: false, table: null, consumedIds: [], outsideTextBoxes: [], shapes: [] };
    const ocrGridIcon = ocrGridTable.matched
      ? materializeOcrGridIcon(ocrGridTable, image, {
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex,
        slideSize
      })
      : null;
    if (ocrGridTable.matched) {
      pageDraft.images = ocrGridIcon ? [ocrGridIcon] : [];
      pageDraft.tables = [ocrGridTable.table];
      nativeRebuildCandidateImages = [];
    }
    const productBrainVision = image && options.objectifyLayerConnectors === true
      ? createProductBrainVisionObjects(pageDraft, slideSize, {
        allowHeuristicProductBrainVision: options.objectifyProductBrainVision === true,
        sourceImage: image,
        sampleTileFills: options.sampleProductBrainVisionColors === true
      })
      : { shapes: [], textBoxes: [] };
    const assetOsHighValueAssetMatrix = image && options.objectifyLayerConnectors === true
      ? createAssetOsHighValueAssetMatrixObjects(pageDraft, rawTextBoxes, slideSize)
      : { shapes: [], textBoxes: [] };
    if (assetOsHighValueAssetMatrix.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.assetOsHighValueAssetMatrixObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.assetOsHighValueAssetMatrixObjectified !== true);
    }
    const componentTemplatePseudoImages = options.objectifyComponentGroupMatches === true
      ? componentAssetLayerPseudoImages(componentIndexPage, options.componentAssetIndex, pageDraft.images)
      : [];
    const fragmentedAssetChainSourceImages = pageDraft.images
      .filter((item) => item?.source?.detector === "foreground-graphic-underlay-crop");
    const preferAppliedPluginForFragmentedAssetChain = shouldPreferAppliedPluginComponent({
      componentImages: [...pageDraft.images, ...componentTemplatePseudoImages],
      sourceImages: fragmentedAssetChainSourceImages,
      allowUnverifiedPrototypeReplay: options.allowUnverifiedAppliedPluginPrototypeReplay === true
    });
    // The complete fragmented-asset signature is stricter than generic diagram
    // detection, so reconstruct it even when broad connector objectification is off.
    const assetOsFragmentedAssetChain = image
      && !preferAppliedPluginForFragmentedAssetChain
      ? createFragmentedAssetChainModel(rawTextBoxes, slideSize)
      : { matched: false, shapes: [], textBoxes: [], cropRegions: [], images: [] };
    assetOsFragmentedAssetChain.images = [];
    if (assetOsFragmentedAssetChain.matched) {
      const sourceImages = pageDraft.images.filter((item) => item?.source?.detector === "foreground-graphic-underlay-crop");
      for (const sourceImage of sourceImages) {
        sourceImage.source = {
          ...(sourceImage.source || {}),
          assetOsFragmentedAssetChainObjectified: true,
          dropErasedResidualAfterNativeRebuild: true,
          nonEditableReason: `${sourceImage.source?.nonEditableReason || sourceImage.source?.reason || "fragmented asset chain"}; rebuilt semantic notes, risks, dashboard, and connectors as native objects`
        };
      }
      assetOsFragmentedAssetChain.images = materializeAssetOsFragmentedAssetChainCrops(
        sourceImages[0],
        assetOsFragmentedAssetChain.cropRegions,
        slideSize,
        {
          sourceImage: image,
          assetDir: options.assetDir,
          irDir: options.irDir,
          deckName: options.deckName,
          pageIndex
        }
      );
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.assetOsFragmentedAssetChainObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.assetOsFragmentedAssetChainObjectified !== true);
      pageDraft.images.push(...assetOsFragmentedAssetChain.images);
    }
    const componentTemplateNativeOwnerShapes = [
      ...tableBackgroundShapes,
      ...tableGridShapes,
      ...comparisonMatrixShapes,
      ...stackedArchitectureDiagram.shapes,
      ...semanticCycleDiagramShapes,
      ...visualAtomNativeShapes
    ];
    const componentTemplateShapeLayerInputs = options.objectifyComponentGroupMatches === true
      ? filterComponentTemplateShapeLayerInputs(
        componentTemplatePseudoImages,
        pageDraft.images,
        componentTemplateNativeOwnerShapes
      )
      : [];
    const preComponentTemplateDiagramTextBoxes = mergeDiagramTextBoxes([
      ...collectObjectifiedDiagramTextBoxes(nativeRebuildCandidateImages),
      ...collectObjectifiedDiagramTextBoxes(pageDraft.images),
      ...(componentTemplateShapeLayerInputs.length > 0
        ? collectComponentTemplateFallbackDiagramTextBoxes(pageDraft.images, textBoxes)
        : [])
    ]);
    const componentTemplateNativeInputs = filterComponentTemplateNativeInputs(
      [...pageDraft.images, ...componentTemplateShapeLayerInputs],
      textBoxes,
      componentTemplateNativeOwnerShapes
    );
    const componentTemplateNativeObjects = (image || componentTemplateNativeInputs.length > 0) && options.objectifyComponentGroupMatches === true
      ? createComponentTemplateNativeObjects(componentTemplateNativeInputs, slideSize, {
        minScore: options.componentGroupMatchMinScore,
        assetDir: options.assetDir,
        sourceTextBoxes: [...(textBoxes || []), ...(rawTextBoxes || [])]
      })
      : { shapes: [], textBoxes: [] };
    let componentTemplateNativeShapes = componentTemplateNativeObjects.shapes;
    const componentTemplateNativeTextBoxes = componentTemplateNativeObjects.textBoxes;
    const componentTemplateNativeImages = componentTemplateNativeObjects.images || [];
    if (componentTemplateNativeShapes.length > 0) {
      const replacement = replaceComponentTemplateCropsWhenFullyNative(pageDraft.images, componentTemplateNativeShapes, {
        sourceImage: image,
        slideSize,
        assetDir: options.assetDir,
        irDir: options.irDir,
        deckName: options.deckName,
        pageIndex,
        replaceSafeComponentTemplateCrops: options.replaceSafeComponentTemplateCrops === true,
        allowUnverifiedAppliedPluginPrototypeReplay: options.allowUnverifiedAppliedPluginPrototypeReplay === true
      });
      pageDraft.images = replacement.images;
      componentTemplateNativeShapes = replacement.shapes;
    }
    if (componentTemplateNativeImages.length > 0) {
      pageDraft.images.push(...componentTemplateNativeImages);
    }
    if (stackedArchitectureDiagram.shapes.length > 0 && options.hybridComponentTemplateResiduals === true) {
      const existingHybridLayerIds = new Set(pageDraft.images
        .filter((item) => item?.source?.specializedNativeHybridResidual === true)
        .map((item) => String(item?.source?.layerSourceId || ""))
        .filter(Boolean));
      const postReplacementHybridResiduals = createSpecializedNativeHybridResidualCropsFromNativeShapes(
        stackedArchitectureDiagram.shapes.filter((shape) => !existingHybridLayerIds.has(String(shape?.source?.layerSourceId || ""))),
        {
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
        }
      );
      if (postReplacementHybridResiduals.length > 0) pageDraft.images.push(...postReplacementHybridResiduals);
    }
    const diagramTextBoxes = mergeDiagramTextBoxes([
      ...preComponentTemplateDiagramTextBoxes,
      ...collectObjectifiedDiagramTextBoxes(pageDraft.images)
    ]);
    // Claim both source panels before generic residual splitting. Otherwise the
    // repository panel is fragmented and the semantic file-tree rebuilder loses
    // the pair it needs to distinguish the editable right side from the left illustration.
    const workflowSupplyChainTwoPanel = image && options.objectifyLayerConnectors === true
      ? createWorkflowSupplyChainTwoPanelObjects(pageDraft, rawTextBoxes, slideSize, {
        sourceImage: image,
        irDir: options.irDir
      })
      : { shapes: [], textBoxes: [], images: [] };
    if (workflowSupplyChainTwoPanel.shapes.length > 0) {
      pageDraft.images = pageDraft.images.filter((item) => item?.source?.workflowSupplyChainTwoPanelObjectified !== true);
      nativeRebuildCandidateImages = nativeRebuildCandidateImages.filter((item) => item?.source?.workflowSupplyChainTwoPanelObjectified !== true);
      if (Array.isArray(workflowSupplyChainTwoPanel.images) && workflowSupplyChainTwoPanel.images.length > 0) {
        pageDraft.images.push(...workflowSupplyChainTwoPanel.images);
      }
    }
    if (image && options.eraseObjectifiedLayerPrimitives === true) {
      eraseObjectifiedLayerPrimitives({
        page: pageDraft,
        sourceImage: image,
        textBoxes: [...textBoxes, ...(assetHubCycleIllustration.textBoxes || [])],
        primitiveShapes: [...productCollaborationChallenge.shapes, ...layerContainerShapes, ...matrixColorBlockShapes, ...layerColorBlockShapes, ...stickyNoteClusterShapes, ...layerConnectorShapes, ...tableBackgroundShapes, ...tableGridShapes, ...quadrantDividerShapes, ...networkDiagramShapes, ...pageLevelNetworkDiagramShapes, ...hierarchyDiagramShapes, ...triangleTopologyShapes, ...coverEngineCoreShapes, ...skillChainOverviewShapes, ...pageLevelSkillChainOverview.shapes, ...linearProcessShapes, ...prdGenerationFlowShapes, ...prototypeValidationFlowShapes, ...demandUnderstandingFlowShapes, ...comparisonMatrixShapes, ...saturatedDiagramTextShapes, ...semanticCycleDiagramShapes, ...denseComplexDiagramScaffoldShapes, ...twoPanelDiagramTextShapes, ...topComplexDiagramTextShapes, ...shiftLeftDebuggerDiagram.shapes, ...toolIslandTransitionMatrix.shapes, ...kpiEvidenceTextShapes, ...valueQuadrantShapes, ...reviewRiskGateFlowShapes, ...funnelHubDiagramShapes, ...horizontalStepChainShapes, ...genericNodeDiagramSkeletonShapes, ...visualClusterStackShapes, ...wmsRouteChainShapes, ...collaborationFlowShapes, ...stackedArchitectureDiagram.shapes, ...toolGapPlatformDiagram.shapes, ...processWithScreenshotsFlow.shapes, ...textAnchoredProcessNetwork.shapes, ...documentVersionFolderFlow.shapes, ...assetOsFlow.shapes, ...portalPlatformDiagram.shapes, ...systemMapDiagram.shapes, ...entropyFragmentShapes, ...entropyIslandShapes, ...visualAtomNativeShapes, ...structuredIllustrationCardShellShapes, ...componentTemplateNativeShapes, ...assetHubCycleIllustration.shapes, ...inputOutputSplitDiagram.shapes, ...productBrainVision.shapes],
        slideSize,
        irDir: options.irDir
      });
      restorePrdGenerationSegmentCropsAfterPrimitiveErasure(pageDraft, image, slideSize, textBoxes, {
        irDir: options.irDir
      });
    }
    if (options.splitErasedResidualCrops === true) {
      migrateLegacyResidualOwnership(pageDraft.images);
      splitErasedResidualCrops({
        page: pageDraft,
        irDir: options.irDir
      });
    }
    if (stackedArchitectureDiagram.shapes.length > 0 && options.hybridComponentTemplateResiduals === true) {
      const existingHybridLayerIds = new Set(pageDraft.images
        .filter((item) => item?.source?.specializedNativeHybridResidual === true)
        .map((item) => String(item?.source?.layerSourceId || ""))
        .filter(Boolean));
      const postEraseHybridResiduals = createSpecializedNativeHybridResidualCropsFromNativeShapes(
        stackedArchitectureDiagram.shapes.filter((shape) => !existingHybridLayerIds.has(String(shape?.source?.layerSourceId || ""))),
        {
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
        }
      );
      if (postEraseHybridResiduals.length > 0) pageDraft.images.push(...postEraseHybridResiduals);
    }
  return { structuredIllustrationCardShellShapes, assetHubCycleIllustration, inputOutputSplitDiagram, cliScaffoldGenerator, visualOperationSync, embeddedExpertScreenshot, runtimeEngineHybrid, paradigmShiftMatrix, valueTransformationTable, ocrGridTable, productBrainVision, assetOsHighValueAssetMatrix, assetOsFragmentedAssetChain, componentTemplateNativeShapes, componentTemplateNativeTextBoxes, componentTemplateNativeImages, diagramTextBoxes, workflowSupplyChainTwoPanel, nativeRebuildCandidateImages };
}

module.exports = { buildPageHybridGraphicsStage };
