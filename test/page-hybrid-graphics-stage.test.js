"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { cropPng, writePng } = require("../packages/slideclone-core/png");
const { eraseObjectifiedLayerPrimitives } = require("../packages/slideclone-core/residual-primitive-erasure");
const { filterTextBoxesForGraphicUnderlays } = require("../packages/slideclone-core/page-text-rules");

const { buildPageHybridGraphicsStage } = require("../packages/slideclone-core/page-hybrid-graphics-stage");

test("hybrid erasure returns the exact source label lost by early underlay filtering", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hybrid-erased-title-"));
  try {
    const image = { width: 420, height: 220, rgba: Buffer.alloc(420 * 220 * 4, 255) };
    const crop = { id: "crop", assetPath: path.join(root, "crop.png"), box: { x: 50, y: 50, w: 280, h: 120 }, source: { detector: "foreground-graphic-crop" } };
    writePng(crop.assetPath, cropPng(image, crop.box));
    const label = { id: "source-title", text: "Title", box: { x: 80, y: 78, w: 70, h: 26 } };
    const pageDraft = { images: [crop], shapes: [], textBoxes: [label], tables: [], charts: [] };
    const nativeTextBoxes = filterTextBoxesForGraphicUnderlays([label], pageDraft.images);
    const ocrStatusComponents = { textBoxes: nativeTextBoxes, shapes: [] };
    assert.deepEqual(nativeTextBoxes, []);
    const graphics = emptyNativeGraphics();
    graphics.visualAtomNativeShapes = [{ type: "rect", box: { x: 170, y: 90, w: 110, h: 44 }, source: { detector: "line-text-native-bordered-card", editable: true } }];
    const result = buildPageHybridGraphicsStage({
      options: { eraseObjectifiedLayerPrimitives: true, irDir: root }, pageDraft,
      slideSize: { widthPt: 420, heightPt: 220 }, image, pageIndex: 0,
      rawTextBoxes: [label], textBoxes: [label], ocrStatusComponents,
      nativeRebuildCandidateImages: [crop], productCollaborationChallenge: { shapes: [], images: [] }
    }, graphics, { ...emptyHybridDependencies(), eraseObjectifiedLayerPrimitives });
    assert.deepEqual(result.recoveredErasedCropTextBoxes, [label]);
    assert.equal(result.recoveredErasedCropTextBoxes[0], label);
    assert.deepEqual(nativeTextBoxes, [label], "the engine's retained array receives the committed counterpart");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("hybrid graphics stage resolves component asset pseudo images by page index", () => {
  const calls = [];
  const pageDraft = {
    images: [],
    shapes: [],
    textBoxes: [],
    tables: [],
    charts: []
  };
  const result = buildPageHybridGraphicsStage(
    {
      options: {
        objectifyComponentGroupMatches: true,
        objectifyLayerConnectors: false,
        eraseObjectifiedLayerPrimitives: false,
        splitErasedResidualCrops: false,
        hybridComponentTemplateResiduals: false,
        componentGroupMatchMinScore: 58
      },
      pageDraft,
      slideSize: { widthPt: 960, heightPt: 540 },
      image: null,
      pageIndex: 2,
      rawTextBoxes: [],
      imageFile: null,
      componentIndexPage: { pageIndex: 2 },
      nativeRebuildCandidateImages: [],
      textBoxes: [],
      productCollaborationChallenge: { shapes: [], images: [] }
    },
    emptyNativeGraphics(),
    {
      ...emptyHybridDependencies(),
      componentAssetLayerPseudoImages: (pageIndex, componentAssetIndex, existingImages) => {
        calls.push({ pageIndex, componentAssetIndex, existingImages });
        return [{
          id: "component-layer",
          box: { x: 10, y: 20, w: 100, h: 50 },
          source: { componentAssetLayerKey: "2:shape:component-layer" }
        }];
      },
      createComponentTemplateNativeObjects: (inputs) => ({
        shapes: inputs.map((input) => ({
          id: `${input.id}-shape`,
          type: "rect",
          box: input.box,
          source: { layerSourceId: input.id, componentTemplateGroupApplied: true }
        })),
        textBoxes: [],
        images: []
      })
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].pageIndex, 2);
  assert.equal(calls[0].componentAssetIndex, undefined);
  assert.deepEqual(calls[0].existingImages, []);
  assert.equal(result.componentTemplateNativeShapes.length, 1);
  assert.equal(result.componentTemplateNativeShapes[0].source.layerSourceId, "component-layer");
});

function emptyNativeGraphics() {
  const arrays = [
    "tableBackgroundShapes",
    "tableGridShapes",
    "comparisonMatrixShapes",
    "semanticCycleDiagramShapes",
    "visualAtomNativeShapes",
    "layerContainerShapes",
    "matrixColorBlockShapes",
    "layerColorBlockShapes",
    "stickyNoteClusterShapes",
    "layerConnectorShapes",
    "quadrantDividerShapes",
    "networkDiagramShapes",
    "pageLevelNetworkDiagramShapes",
    "hierarchyDiagramShapes",
    "triangleTopologyShapes",
    "coverEngineCoreShapes",
    "skillChainOverviewShapes",
    "linearProcessShapes",
    "prdGenerationFlowShapes",
    "prototypeValidationFlowShapes",
    "demandUnderstandingFlowShapes",
    "comparisonMatrixShapes",
    "saturatedDiagramTextShapes",
    "denseComplexDiagramScaffoldShapes",
    "twoPanelDiagramTextShapes",
    "topComplexDiagramTextShapes",
    "kpiEvidenceTextShapes",
    "valueQuadrantShapes",
    "reviewRiskGateFlowShapes",
    "funnelHubDiagramShapes",
    "horizontalStepChainShapes",
    "genericNodeDiagramSkeletonShapes",
    "visualClusterStackShapes",
    "wmsRouteChainShapes",
    "collaborationFlowShapes",
    "entropyFragmentShapes",
    "entropyIslandShapes"
  ];
  const value = Object.fromEntries(arrays.map((name) => [name, []]));
  value.stackedArchitectureDiagram = { shapes: [], textBoxes: [] };
  value.pageLevelSkillChainOverview = { shapes: [] };
  value.shiftLeftDebuggerDiagram = { shapes: [] };
  value.toolIslandTransitionMatrix = { shapes: [] };
  value.toolGapPlatformDiagram = { shapes: [] };
  value.processWithScreenshotsFlow = { shapes: [] };
  value.textAnchoredProcessNetwork = { shapes: [] };
  value.documentVersionFolderFlow = { shapes: [] };
  value.assetOsFlow = { shapes: [] };
  value.portalPlatformDiagram = { shapes: [] };
  value.systemMapDiagram = { shapes: [] };
  return value;
}

function emptyHybridDependencies() {
  const emptyObjects = {
    createAssetHubCycleIllustrationObjects: { shapes: [], textBoxes: [], images: [] },
    createInputOutputSplitDiagramObjects: { shapes: [], textBoxes: [] },
    createCliScaffoldGeneratorObjects: { matched: false, shapes: [], textBoxes: [], sourceIds: [] },
    createVisualOperationSyncModel: { matched: false, shapes: [], textBoxes: [], cropRegions: [], sourceIds: [] },
    createEmbeddedExpertScreenshotModel: { matched: false, shapes: [], textBoxes: [], screenshotRegion: null, sourceIds: [] },
    createRuntimeEngineHybridModel: { matched: false, shapes: [], cropRegions: [], sourceIds: [] },
    createParadigmShiftMatrixModel: { matched: false, table: null, shapes: [], textBoxes: [], iconRegion: null, sourceIds: [] },
    createValueTransformationTableModel: { matched: false, table: null, iconRegion: null, sourceIds: [] },
    createOcrGridTableModel: { matched: false, table: null, consumedIds: [], outsideTextBoxes: [], shapes: [] },
    createProductBrainVisionObjects: { shapes: [], textBoxes: [] },
    createAssetOsHighValueAssetMatrixObjects: { shapes: [], textBoxes: [] },
    createFragmentedAssetChainModel: { matched: false, shapes: [], textBoxes: [], cropRegions: [], images: [] },
    createWorkflowSupplyChainTwoPanelObjects: { shapes: [], textBoxes: [], images: [] }
  };
  const dependencies = {
    createStructuredIllustrationCardShellShapes: () => [],
    shouldObjectifyProductBrainWmsQualityGate: () => false,
    materializeVisualOperationSyncImages: () => [],
    materializeEmbeddedExpertScreenshot: () => null,
    materializeRuntimeEngineHybridImages: () => [],
    materializeParadigmShiftGem: () => null,
    materializeValueTransformationIcon: () => null,
    materializeOcrGridIcon: () => null,
    shouldPreferAppliedPluginComponent: () => false,
    filterComponentTemplateShapeLayerInputs: (inputs) => inputs,
    mergeDiagramTextBoxes: (groups) => groups.flat(),
    collectObjectifiedDiagramTextBoxes: () => [],
    collectComponentTemplateFallbackDiagramTextBoxes: () => [],
    filterComponentTemplateNativeInputs: (inputs) => inputs,
    createComponentTemplateNativeObjects: () => ({ shapes: [], textBoxes: [], images: [] }),
    materializeAssetOsFragmentedAssetChainCrops: () => [],
    replaceComponentTemplateCropsWhenFullyNative: (images, shapes) => ({ images, shapes }),
    createSpecializedNativeHybridResidualCropsFromNativeShapes: () => [],
    eraseObjectifiedLayerPrimitives: () => {},
    restorePrdGenerationSegmentCropsAfterPrimitiveErasure: () => {},
    migrateLegacyResidualOwnership: () => {},
    splitErasedResidualCrops: () => {}
  };
  for (const [name, result] of Object.entries(emptyObjects)) {
    dependencies[name] = () => ({ ...result });
  }
  return dependencies;
}
