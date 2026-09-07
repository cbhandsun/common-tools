"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");
const test = require("node:test");
const { IMAGE_EDITABLE_RELEASE_FILES } = require("../scripts/verify-runtime-package");

const root = path.resolve(__dirname, "..");
const modules = ["page-hybrid-graphics-stage", "page-native-graphics-stage", "demand-understanding-shapes", "workflow-shape-primitives", "prd-generation-shapes", "prototype-validation-shapes", "prd-auto-generation-narrative", "color-component-bounds", "diagram-residual-crops", "residual-splitting", "structured-residual-splitting", "residual-component-analysis", "residual-primitive-erasure", "image-layer-metadata", "graphic-expression-policy", "raster-native-detection", "page-semantic-claims", "skills-capability-matrix", "demand-intake-funnel", "smart-review-branch-gate", "skill-chain-orchestration", "asset-landing-triad", "edge-background-alpha", "icon-crop-refiner", "knowledge-graph-icon-crops", "residual-publication", "png", "arc-residual-masks", "full-slide-native-residual", "diagram-text-candidates", "page-reuse", "page-selection", "progress-reporter", "native-rebuild-deck-pipeline", "ocr-source-deck", "graphic-crop-policy", "page-image-finalizer", "page-progress-lifecycle", "page-graphics-stage", "slide-size"];

modules.push("native-output-sanitizer");
modules.push("source-horizontal-connector-fit");
modules.push("source-border-fit", "knowledge-graph-gray-node-fit", "gray-border-pixels", "gray-border-residual");
modules.push("text-ink-geometry", "measured-text-fit");
modules.push("text-refinement-coordinator");
modules.push("deck-ir-tree");
modules.push("chart-native-payload");
modules.push("knowledge-graph-relation-fit");
modules.push("deck-template-context", "template-build-admission", "renderer-process");
modules.push("pptx-build-execution", "pptx-build-mode", "openxml-build-jobs");
modules.push("native-text-style");
modules.push("screenshot-flow-reconstruction");
modules.push("tool-platform-reconstruction", "review-risk-reconstruction");
modules.push("workflow-wms-route-chain-scope", "diagram-label-matching", "wms-route-reconstruction");
modules.push("four-step-landing-reconstruction");
modules.push("component-strategy-annotator");
modules.push("structured-card-visual-reconstruction");
modules.push("diagram-geometry", "diagram-constants", "comparison-matrix-evidence", "closed-loop-hybrid", "text-mask-cleanup", "asset-os-closed-loop-reconstruction", "asset-hub-cycle-reconstruction");
modules.push("native-chart-shell-shapes", "visual-atom-native-metadata", "visual-atom-native-policy", "visual-atom-component-grouping", "visual-atom-fallback", "visual-atom-topology", "visual-atom-promotion", "gantt-native-shell", "visual-atom-native-shapes");
modules.push("relationship-native-layouts", "relationship-native-shapes", "relationship-native-geometry", "pixel-branch-curve-detector", "relationship-native-shell", "visual-atom-native-reconstruction");
modules.push("comparison-matrix-text", "comparison-matrix-layout", "structured-case-matrix-reconstruction", "comparison-matrix-reconstruction");
modules.push("page-text-rule-helpers", "page-text-rules", "font-evidence");
modules.push("page-output-rules");
modules.push("semantic-matrix-grid", "detection-result");
modules.push("asset-closure-funnel", "cli-scaffold-generator", "component-rebuild-precedence", "component-template-group-matcher", "component-template-style", "connector-component-library", "dense-radial-network-policy", "dense-topology-line-compactor", "embedded-expert-screenshot", "fidelity-crop-materializer", "fragmented-asset-chain", "network-rebuild-orchestrator", "ocr-grid-table", "orthogonal-connector-promotion", "paradigm-shift-matrix", "pptx-inventory", "prd-segmented-flow-components", "product-collaboration-protection", "product-manager-friction-network", "prototype-generation-loop", "prototype-loop-measurement", "prototype-validation-screenshot-policy", "radial-network-detector", "residual-overlap-policy", "residual-ownership", "runtime-engine-hybrid", "smart-review-hybrid", "stacked-layer-color-sampling", "system-map-pixel-evidence", "system-map-reconstruction", "system-map-semantics", "text-anchored-process-network", "text-box-micro-adjust", "triangle-topology-measurement", "value-transformation-table", "visual-feature-context", "visual-operation-sync", "workflow-collaboration-multiplier-scope");
modules.push("registry-graphic-rules", "cover-graphic-rules", "cover-engine-core");
modules.push("decorative-cover-graphics", "graphic-crop-analysis", "graphic-crop-generation", "entropy-challenge-crops", "graphic-underlay-crops", "kpi-title-graphics", "graphic-crop-materializer", "workflow-cover-text");

test("rebuild planning, pixel IO and residual generation run from package exports without Skill sources", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "engine-core-package-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const installed = path.join(directory, "node_modules", "@common-tools", "slideclone-core");
  fs.mkdirSync(installed, { recursive: true });
  for (const name of ["package.json", "screenshot-texture-evidence.js", ...modules.map((module) => `${module}.js`)]) fs.copyFileSync(path.join(root, "packages", "slideclone-core", name), path.join(installed, name));
  const load = createRequire(path.join(directory, "consumer.cjs"));
  const api = Object.fromEntries(modules.map((name) => [name, load(`@common-tools/slideclone-core/${name}`)]));
  const textRules = api["page-text-rules"];
  const outputRules = api["page-output-rules"];
  const background = {id:"background",box:{x:0,y:0,w:960,h:540},source:{detector:"decorative-cover-background-underlay"}};
  const decoration = {id:"duplicate",box:{x:0,y:0,w:20,h:20},source:{detector:"foreground-graphic-crop"}};
  const content = {id:"content",box:{x:300,y:200,w:200,h:120},source:{detector:"foreground-graphic-crop"}};
  const coverPage = {images:[background,decoration,content]};
  assert.equal(outputRules.dropDecorativeCoverDuplicateForegroundCrops(coverPage),true);
  assert.deepEqual(coverPage.images,[background,content]);
  assert.equal(decoration.source.decorativeCoverDuplicateForegroundCrop,true);
  assert.equal(outputRules.dropDecorativeCoverDuplicateForegroundCrops(coverPage),false);
  const firstText = {id:"stable",text:"保留正文"};
  const textInputs = [firstText,{id:"stable",text:"重复"},{text:"无标识正文"}];
  const textBefore = structuredClone(textInputs);
  assert.deepEqual(textRules.dedupeTextBoxesByStableId(textInputs),[firstText,textInputs[2]]);
  assert.deepEqual(textInputs,textBefore);
  assert.equal(api["font-evidence"].resolveRoleFontSize("heading",12,{heading:19}),19);
  const specialistInputs = [{source:{detector:"structured-illustration-card"}},{source:{detector:"native-text"}}];
  assert.deepEqual(textRules.suppressGenericStructuredIllustrationObjectsForSpecialist(specialistInputs,true),[specialistInputs[1]]);
  const strategyApi = api["component-strategy-annotator"];
  const structuredCards = api["structured-card-visual-reconstruction"];
  const cardShells = [0, 1].map(index => ({box: {x: index * 300, y: 50, w: 300, h: 400}, source: {detector: "structured-illustration-card-native-background"}}));
  const cardAtom = {id: "card-arrow", kind: "connector-line-candidate", nativeCandidate: true, box: {x: 350, y: 140, w: 60, h: 40}, color: "#939192", lineEndpoints: {from: {x: 350, y: 140}, to: {x: 410, y: 180}}};
  const cardPage = {images: [{id: "card-residual", box: {x: 0, y: 50, w: 600, h: 400}, source: {detector: "structured-illustration-card-residual-crop", layer: {visualAtoms: [cardAtom, structuredClone(cardAtom)]}}}]};
  const cardOriginal = structuredClone(cardPage);
  const cardShapes = structuredCards.createStructuredIllustrationCardVisualAtomShapes(cardPage, cardShells, []);
  assert.equal(cardShapes.length, 1);
  assert.equal(cardShapes[0].source.detector, "visual-atom-native-connector-structured-card");
  assert.equal(cardShapes[0].source.cardIndex, 1);
  assert.equal(cardShapes[0].source.structuredCardAtomObjectified, true);
  assert.deepEqual(cardShapes[0].box, cardAtom.box);
  assert.deepEqual(cardPage, cardOriginal);
  assert.deepEqual(structuredCards.createStructuredIllustrationCardVisualAtomShapes(cardPage, cardShells, cardShapes), []);
  assert.deepEqual(structuredCards.createStructuredIllustrationCardVisualAtomShapes(cardPage, cardShells.slice(0, 1), []), []);
  const strategyInput = [{id: "strategy-image", source: {layer: {layerType: "diagram-zone"}}}];
  const strategyOriginal = structuredClone(strategyInput);
  const strategyIndex = strategyApi.buildComponentStrategyIndex({layers: [{pageIndex: 2, imageIndex: 0, componentRenderStrategy: {mode: "preserve-local-crop", reason: "keep\u0000 source"}}]});
  const strategyImages = strategyApi.annotateImagesWithComponentStrategies(strategyInput, 2, strategyIndex);
  assert.equal(strategyImages[0].source.componentRenderStrategy.reason, "keep source");
  assert.equal(strategyImages[0].source.layer.componentRenderStrategy.mode, "preserve-local-crop");
  assert.equal(strategyApi.shouldDeferNativeRebuildForComponentStrategy(strategyImages[0]), true);
  assert.deepEqual(strategyInput, strategyOriginal);
  assert.equal(strategyApi.shouldDeferNativeRebuildForComponentStrategy(strategyInput[0]), false);
  const assetIndex = strategyApi.buildComponentAssetIndex({layers: [{pageIndex: 2, imageIndex: 0, layerKey: "2:0", localAssets: [{id: "local-template", path: "assets/template.pptx"}]}]});
  const assetImages = strategyApi.annotateImagesWithComponentAssets(strategyInput, 2, assetIndex);
  assert.equal(assetImages[0].source.componentAssetLayerKey, "2:0");
  assert.equal(assetImages[0].source.componentLocalAssets[0].path, "assets/template.pptx");
  assert.deepEqual(strategyInput, strategyOriginal);
  const reviewImage = {id: "isolated-review", box: {x: 50.98, y: 107.25, w: 857.66, h: 339.38}, source: {detector: "foreground-graphic-underlay-crop", layer: {layerType: "table-zone", recommendedAction: "split-native-with-residual-crop"}}};
  const reviewText = [
    {text: "Approved Asset", box: {x: 749.71, y: 124.88, w: 122.2, h: 18.75}},
    {text: "scannerengine", box: {x: 353.86, y: 165.75, w: 145.82, h: 19.88}},
    {text: "PRD", box: {x: 90.71, y: 185.63, w: 38.24, h: 18.75}},
    {text: "Risk ProblemPool", box: {x: 748.96, y: 324.38, w: 141.69, h: 18}}
  ];
  const reviewRaster = {width: 960, height: 540, rgba: Buffer.alloc(960 * 540 * 4, 255)};
  const reviewShapes = api["review-risk-reconstruction"].createReviewRiskGateFlowShapes([reviewImage], reviewText, reviewRaster, {widthPt: 960, heightPt: 540});
  assert.equal(reviewShapes.filter(shape => shape.source.detector === "review-risk-gate-flow-native-card").length, 2);
  assert.equal(reviewImage.source.reviewRiskGateFlowObjectified, true);
  const protectedImage = {source: {detector: "keep", privateTag: "retained"}};
  api["image-layer-metadata"].markProtectedComplexDiagramMinimumUnit([protectedImage]);
  assert.equal(protectedImage.source.protectedMinimumUnit, true);
  assert.equal(protectedImage.source.privateTag, "retained");
  assert.deepEqual(api["tool-platform-reconstruction"].createToolGapPlatformDiagramObjects([]), {shapes: [], textBoxes: []});
  assert.equal(api["native-text-style"].normalizeFontWeightForOpenXml(700), "bold");
  const flowInput = {id: "isolated-flow", box: {x: 44, y: 154, w: 865, h: 357}, source: {detector: "structured-case-graphic-underlay-crop", layer: {layerType: "diagram-zone", areaRatio: 0.5, diagramUnderstanding: {archetype: "process-with-screenshots"}}}};
  const flowResult = api["screenshot-flow-reconstruction"].createProcessWithScreenshotsFlowObjects([flowInput], null, {widthPt: 960, heightPt: 540});
  assert.equal(flowResult.shapes.filter(shape => shape.source.detector === "process-screenshots-native-card").length, 4);
  assert.ok(flowResult.textBoxes.length >= 8);
  assert.equal(flowInput.source.processWithScreenshotsFullyObjectified, true);
  assert.deepEqual(api["screenshot-flow-reconstruction"].createProcessWithScreenshotsFlowObjects([]), {shapes: [], textBoxes: [], images: []});
  assert.equal(api["native-text-style"].shouldDisableTextWrap({text: "Editable title", box: {w: 300, h: 20}, font: {sizePt: 16}}), true);
  let isolatedBuildCalls = 0;
  const isolatedBuilder = api["pptx-build-execution"].createPptxBuildExecutor({
    skillRoot: directory, projectRoot: directory,
    buildOpenXmlDecksSync(jobs, context) {
      isolatedBuildCalls++;
      assert.equal(context.skillRoot, directory);
      return jobs.map(job => job.outFile);
    }
  });
  assert.deepEqual(isolatedBuilder.buildPptxBatch([{irFile: path.join(directory, "deck.json"), outFile: path.join(directory, "deck.pptx")}], {pptxEngine: "openxml"}), [path.join(directory, "deck.pptx")]);
  assert.equal(isolatedBuildCalls, 1);
  api["deck-template-context"].validateDeckTemplateContext([{preserveTemplateSlide: true}], {layoutIds: ["layout1"], slideIndices: [0]});
  assert.throws(() => api["deck-template-context"].validateDeckTemplateContext([{preserveTemplateSlide: true}]), /source slide is unavailable/);
  const standaloneDeck = path.join(directory, "template-free-deck.json");
  fs.writeFileSync(standaloneDeck, JSON.stringify({pages: [{}]}));
  await api["template-build-admission"].admitTemplateBuild({executable: process.execPath, builderArgs: [], deckFile: standaloneDeck, cwd: directory, timeoutMs: 1000, isCancellationRequested: () => false});
  const candidates = [];
  const emptyFit = api["source-horizontal-connector-fit"].fitSourceHorizontalConnectors({ shapes: [], slideSize: { widthPt: 1, heightPt: 1 }, image: { width: 1, height: 1, rgba: Buffer.alloc(4, 255) } });
  assert.equal(emptyFit.evidence.accepted, 0);
  assert.deepEqual(emptyFit.shapes, []);
  const emptyImage = { width: 1, height: 1, rgba: Buffer.alloc(4, 255) };
  const emptyRelations = api["knowledge-graph-relation-fit"].fitKnowledgeGraphRelations({ shapes: [], slideSize: { widthPt: 1, heightPt: 1 }, image: emptyImage });
  assert.equal(emptyRelations.evidence.upperAccepted, false);
  assert.equal(emptyRelations.evidence.lowerAccepted, false);
  assert.deepEqual(emptyRelations.shapes, []);
  const emptyTextRequest = { textBoxes: [], slideSize: { widthPt: 1, heightPt: 1 }, sourceImage: emptyImage, renderedImage: emptyImage };
  await assert.rejects(api["text-refinement-coordinator"].refineRenderedTextOnce(null), /request is invalid/u);
  assert.doesNotThrow(() => api["deck-ir-tree"].validateDeckIrTree({text:"中文 😀"}));
  const isolatedEnvelope = {version:"1.0",slideSize:{widthPt:960,heightPt:540},pages:[{}]};
  assert.equal(api["deck-ir-tree"].validateDeckIrEnvelope(isolatedEnvelope).pages, isolatedEnvelope.pages);
  assert.throws(() => api["deck-ir-tree"].validateDeckIrEnvelope({...isolatedEnvelope,pages:[]}), /bounded deck/u);
  assert.throws(() => api["deck-ir-tree"].validateDeckIrTree({text:"invalid\u0001"}), /invalid string/u);
  assert.doesNotThrow(() => api["chart-native-payload"].validateDeckNativeChartPayloads([{}]));
  assert.deepEqual(api["text-ink-geometry"].measureTextInkGeometry(emptyTextRequest), { measurements: [], samples: 0 });
  assert.deepEqual(api["measured-text-fit"].planMeasuredSingleLineTextFit({ ...emptyTextRequest, measurements: [] }).textBoxes, []);
  const isolatedSource = path.join(directory, "source.png");
  api.png.writePng(isolatedSource, emptyImage);
  assert.deepEqual(await api["gray-border-residual"].refineGrayBorderResiduals({ page: { shapes: [], images: [] }, slideSize: { widthPt: 1, heightPt: 1 }, sourceFile: isolatedSource, root: directory }), { acceptedNodes: 0, changedLayers: 0, changedPixels: 0 });
  assert.deepEqual(api["knowledge-graph-gray-node-fit"].fitKnowledgeGraphGrayNodes({ shapes: [], slideSize: { widthPt: 1, heightPt: 1 }, image: emptyImage }).borders, []);
  assert.equal(api["gray-border-pixels"].cleanGrayBorderPixels({ sourceImage: emptyImage, layerImage: emptyImage, layerBox: { x: 0, y: 0, w: 1, h: 1 }, slideSize: { widthPt: 1, heightPt: 1 }, borders: [] }).image, emptyImage);
  const sanitizer = api["native-output-sanitizer"];
  assert.deepEqual(sanitizer.sanitizeNativeShapes(null), []);
  assert.deepEqual(sanitizer.sanitizeNativeShape({ type: "freeform", points: [{ x: "0.25", y: "0.75" }] }).points, [{ x: 0.25, y: 0.75 }]);
  const chart = sanitizer.sanitizeNativeChart({ box: { x: 0, y: 0, w: 100, h: 100 }, values: [1, Infinity, 3], categories: ["A", "B", "C"] }, 0);
  assert.deepEqual(chart.values, [1, 3]);
  assert.deepEqual(chart.categories, ["A", "C"]);
  const emptyNativeStage = api["page-native-graphics-stage"].buildPageNativeGraphicsStage({ image: null, options: {}, pageDraft: { images: [], shapes: [], textBoxes: [] }, nativeTextBoxes: [], slideSize: { widthPt: 960, heightPt: 540 }, decorativeBackground: [], nativeRebuildCandidateImages: candidates, rawTextBoxes: [], textBoxes: [], pageIndex: 0, specializedNativeEligiblePageDraft: () => ({ images: [] }), specializedNativeEligibleImages: () => [], autoObjectifySystemMap: false, unreadableSystemMapFidelityProtected: false }, {
    syncObjectifiedCandidateSources() {}, syncPrdGenerationMinimumUnitBoxes() {}, applyPrototypeValidationScreenshotPolicy() {}, syncPrototypeValidationCandidateSources() {}, shouldAutoObjectifyEntropyIsland: () => false,
    createEntropyChallengeAnnotationObjects: () => ({ shapes: [], textBoxes: [] }), createEntropyChallengeFooterBulletShapes: () => []
  });
  assert.deepEqual(emptyNativeStage.nativeRebuildCandidateImages, candidates);
  assert.deepEqual(emptyNativeStage.prdGenerationFlowShapes, []);
  assert.deepEqual(emptyNativeStage.pageLevelNetworkDiagramShapes, []);
  const emptyHybridStage = api["page-hybrid-graphics-stage"].buildPageHybridGraphicsStage({ options: {}, pageDraft: { images: [], shapes: [], textBoxes: [] }, slideSize: { widthPt: 960, heightPt: 540 }, image: null, pageIndex: 0, rawTextBoxes: [], imageFile: null, componentIndexPage: null, nativeRebuildCandidateImages: candidates, textBoxes: [], productCollaborationChallenge: { shapes: [], images: [] } }, emptyNativeStage, {
    shouldObjectifyProductBrainWmsQualityGate: () => false, shouldPreferAppliedPluginComponent: () => false,
    mergeDiagramTextBoxes: () => [], filterComponentTemplateNativeInputs: () => [],
    collectObjectifiedDiagramTextBoxes: () => [], collectComponentTemplateFallbackDiagramTextBoxes: () => []
  });
  assert.equal(emptyHybridStage.nativeRebuildCandidateImages, candidates);
  assert.deepEqual(emptyHybridStage.componentTemplateNativeShapes, []);
  const demand = api["demand-understanding-shapes"];
  assert.deepEqual(demand.createDemandUnderstandingFlowShapes(), []);
  assert.deepEqual(demand.demandUnderstandingMaterialTextBoxes(), []);
  const material = { label: "Input", box: { x: 0, y: 0, w: 100, h: 100 } };
  const materials = [material, { ...material, materialIndex: null }, { ...material, materialIndex: 7 }, { ...material, materialIndex: 0 }];
  const originalMaterials = structuredClone(materials);
  const materialLabels = demand.demandUnderstandingMaterialTextBoxes(materials);
  assert.deepEqual(materialLabels.map(label => label.source.nativeComponentRole), ["input-material-0", "input-material-1", "input-material-7", "input-material-0"]);
  assert.deepEqual(materials, originalMaterials);
  assert.deepEqual(api["prd-generation-shapes"].createPrdGenerationFlowShapes(), []);
  assert.deepEqual(api["prototype-validation-shapes"].createPrototypeValidationFlowShapes(), []);
  assert.deepEqual(api["residual-splitting"].splitErasedResidualCrop({}, directory), []);
  assert.equal(api["diagram-residual-crops"].triangleTopologyResidualRegions({ width: 100, height: 100 }).length, 10);
  assert.deepEqual(api["diagram-residual-crops"].triangleTopologyResidualRegionsWithOptions({ width: 100, height: 100 }, { nodesObjectified: true, visualConnectorsObjectified: true, sideTextObjectified: true, bottomTextObjectified: true, includeCenter: false }), []);
  assert.deepEqual(api["structured-residual-splitting"].clampLocalBox({ x: 150, y: 90, w: 200, h: 200 }, { width: 200, height: 100 }), { x: 150, y: 90, w: 50, h: 10 });
  const components = api["residual-component-analysis"];
  const emptyRaster = { width: 200, height: 100, rgba: Buffer.alloc(80000, 255) };
  assert.deepEqual(components.residualSplitComponents(emptyRaster), []);
  assert.equal(components.residualSplitDecision([], emptyRaster).use, false);
  const erasure = api["residual-primitive-erasure"];
  const blank = { width: 4, height: 4, rgba: Buffer.alloc(64, 255) };
  const erased = erasure.eraseMasks(blank, []);
  assert.deepEqual(erased, blank);
  assert.notEqual(erased.rgba, blank.rgba);
  const metadata = api["image-layer-metadata"];
  assert.equal(metadata.normalizeImageLayerMetadata(null), null);
  const crop = { id: "protected", source: { wmsRouteChainWholeFidelityCrop: true } };
  const normalized = metadata.normalizeImageLayerMetadata(crop);
  assert.equal(normalized.source.protectedMinimumUnit, true);
  assert.equal(normalized.expressionSubtype, "wms-route-chain-illustration");
  assert.deepEqual(crop, { id: "protected", source: { wmsRouteChainWholeFidelityCrop: true } });
  assert.equal(typeof api["graphic-expression-policy"].classifyGraphicExpressionPolicy({}), "object");
  const raster = { width: 100, height: 100, rgba: Buffer.alloc(100 * 100 * 4, 255) };
  const detected = api["raster-native-detection"].detectLongLines(raster, { widthPt: 100, heightPt: 100 });
  assert.deepEqual(detected, []);
  assert.equal(api["raster-native-detection"].sampleInkColor(raster, { x: 0, y: 0, w: 10, h: 10 }, { widthPt: 100, heightPt: 100 }, "#123456"), "#FFFFFF");
  const wmsImage = {
    id: "isolated-wms-route-chain",
    box: { x: 26, y: 337, w: 905, h: 185 },
    source: {
      detector: "wms-chain-underlay-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "route-chain-diagram",
      layer: {
        layerType: "diagram-zone",
        diagramUnderstanding: {
          nodes: [
            { id: "challenge", text: "挑战", box: { x: 60, y: 361, w: 40, h: 22 } },
            { id: "ai", text: "AI介入", box: { x: 356, y: 362, w: 61, h: 21 } },
            { id: "value", text: "价值落地", box: { x: 671, y: 363, w: 70, h: 18 } }
          ]
        }
      }
    }
  };
  const wmsShapes = api["wms-route-reconstruction"].createWmsRouteChainShapes([wmsImage], [], null, { widthPt: 960, heightPt: 540 });
  assert.equal(wmsImage.source.wmsRouteChainObjectified, true);
  assert.equal(wmsImage.source.objectifiedWmsRouteChainShapes, 6);
  assert.equal(wmsImage.source.objectifiedWmsRouteChainTextBoxes, 3);
  assert.equal(wmsShapes.filter((shape) => shape.source.detector === "wms-route-chain-native-value-card").length, 3);
  assert.equal(wmsShapes.filter((shape) => shape.source.detector === "wms-route-chain-native-value-card-divider").length, 2);
  assert.deepEqual(wmsImage.source.wmsRouteChainNativeTextBoxes.map((box) => box.text), ["挑战", "AI介入", "价值落地"]);
  assert.ok(wmsImage.source.wmsRouteChainNativeTextBoxes.every((box) => box.source.textErasedFromCrop === false && box.source.nativeComponentMinimumUnit === "semantic-component"));
  const fourStepTextBoxes = [
    ["规模化落地路径：从单域试点到全局覆盖", 155.94, 70.13, 645.87, 31.88, 22.95],
    ["01", 90.71, 186.38, 58.1, 47.63, 30], ["02", 298.76, 185.63, 68.22, 48.38, 30],
    ["03", 505.68, 185.63, 68.22, 49.5, 30], ["04", 710.72, 185.63, 70.1, 48.38, 30],
    ["建域仓(Init)", 91.84, 297.75, 110.96, 23.63, 17.01], ["接系统（Connect）", 299.88, 297.75, 160.06, 22.88, 16.47],
    ["固流程（Embed)", 508.68, 299.63, 145.07, 21, 15.12], ["升平台（Scale）", 709.97, 297.75, 133.82, 23.63, 17.01],
    ["一键初始化", 104.96, 325.5, 75.72, 20.63, 14.85], ["扩展业务入口", 298.76, 323.25, 106.08, 22.88, 16.47],
    ["固化AI链路", 507.93, 325.5, 87.72, 20.63, 14.85], ["集中演进升级", 711.85, 322.5, 106.08, 23.63, 17.01],
    ["选择高价值试点领域", 92.96, 355.13, 133.82, 16.88, 12.15], ["连接现有系统，通过", 299.88, 355.13, 136.82, 19.88, 14.31]
  ].map(([text, x, y, w, h, sizePt]) => ({ text, box: { x, y, w, h }, font: { sizePt, opacity: 0 } }));
  const fourStepPage = {
    images: [{ id: "isolated-four-step-underlay", type: "fidelity-crop", box: { x: 25.49, y: 130.5, w: 887.28, h: 343.5 }, source: { detector: "content-foreground-graphic-underlay-crop" } }],
    textBoxes: fourStepTextBoxes
  };
  const fourStepObjects = api["four-step-landing-reconstruction"].createFourStepLandingPathObjects(fourStepPage, fourStepTextBoxes, fourStepTextBoxes.slice(0, 1), { widthPt: 960, heightPt: 540 });
  assert.equal(fourStepObjects.shapes.filter((shape) => shape.source.detector === "four-step-landing-path-native-card").length, 4);
  assert.equal(fourStepObjects.shapes.filter((shape) => shape.source.detector === "four-step-landing-path-native-arrow").length, 3);
  assert.equal(fourStepObjects.textBoxes.filter((box) => box.source.detector === "four-step-landing-path-native-text").length, 14);
  assert.equal(fourStepObjects.textBoxes.some((box) => box.text === "01" && box.font.opacity === 1), true);
  assert.equal(new Set(fourStepObjects.shapes.filter((shape) => shape.source.nativeComponentGroupId).map((shape) => shape.source.nativeComponentGroupId)).size, 4);
  assert.ok(fourStepObjects.textBoxes.every((box) => box.style.nativeComponentGroupId === box.source.nativeComponentGroupId && box.source.nativeComponentMinimumUnit === "semantic-component"));
  assert.ok(fourStepPage.images.every((image) => image.source.fourStepLandingPathObjectified === true && image.source.dropErasedResidualAfterNativeRebuild === true));
  const assetHubPage = {
    textBoxes: [{ text: "构建企业级AI原生产品资产中枢", box: { x: 238, y: 53, w: 480, h: 27 } }],
    images: [{
      id: "isolated-asset-hub-underlay",
      type: "fidelity-crop",
      box: { x: 65.6, y: 91.5, w: 819.43, h: 367.5 },
      source: { detector: "cycle-illustration-underlay-crop", layer: { layerType: "illustration-zone" } }
    }]
  };
  const assetHubObjects = api["asset-hub-cycle-reconstruction"].createAssetHubCycleIllustrationObjects(assetHubPage, { widthPt: 960, heightPt: 540 });
  assert.equal(assetHubObjects.shapes.filter((shape) => shape.source.detector === "asset-hub-cycle-native-connector").length >= 10, true);
  assert.equal(assetHubObjects.shapes.some((shape) => shape.source.detector === "asset-hub-cycle-native-shield"), false);
  assert.equal(assetHubObjects.shapes.some((shape) => shape.source.detector === "asset-hub-cycle-native-input-icon"), false);
  assert.equal(assetHubObjects.shapes.some((shape) => shape.source.detector === "asset-hub-cycle-native-output-gem"), false);
  assert.deepEqual(assetHubObjects.textBoxes.map((box) => box.text), ["PM Portal\nPlatform", "AI Skills 驱动引擎\n+ 分布式域仓"]);
  assert.ok(assetHubObjects.textBoxes.every((box) => box.source.nativeComponentGroupId === "isolated-asset-hub-underlay-hub-spoke-center"));
  assert.deepEqual(
    [...new Set(assetHubObjects.shapes.map((shape) => shape.source.nativeComponentGroupId))].sort(),
    ["left-bottom", "left-mid", "left-top", "right-bottom", "right-mid", "right-top"].map((role) => `isolated-asset-hub-underlay-hub-spoke-${role}`)
  );
  assert.equal(assetHubPage.images[0].source.assetHubCycleObjectified, true);
  assert.equal(assetHubPage.images[0].source.assetHubCycleInputIconsObjectified, false);
  assert.equal(assetHubPage.images[0].source.assetHubCycleOutputGemsObjectified, false);
  assert.equal(assetHubPage.images[0].source.assetHubCycleResidualBoxes.filter((item) => item.name.endsWith("-icon")).length, 6);
  assert.equal(assetHubPage.images[0].source.dropErasedResidualAfterNativeRebuild, undefined);
  const atomLayer = { id: "isolated-visual-atom-layer", source: { layer: { layerType: "diagram-zone" } } };
  const atomNative = api["visual-atom-native-shapes"];
  const rectAtom = { id: "stage", kind: "native-rect-candidate", shapeHint: "pill", box: { x: 40, y: 80, w: 90, h: 48 }, color: "#2f80ed", density: 0.9 };
  const rectShape = atomNative.visualAtomNativeShape(atomLayer, rectAtom, 0);
  assert.deepEqual(rectShape.box, rectAtom.box);
  assert.deepEqual(rectShape.style, { fill: "#2f80ed", stroke: "#2f80ed", strokeWidthPt: 0, radiusRatio: 0.5 });
  assert.deepEqual(rectShape.source, {
    editable: true, nativeRebuild: true, detector: "visual-atom-native-rect", layerSourceId: "isolated-visual-atom-layer", layerType: "diagram-zone",
    atomId: "stage", atomKind: "native-rect-candidate", shapeHint: "pill", confidence: 0.9, containerAtomId: null, topologyRole: null, containedAtomIds: []
  });
  const arrowShape = atomNative.visualAtomNativeShape(atomLayer, {
    id: "transition", kind: "connector-arrow-candidate", shapeHint: "arrow-horizontal", box: { x: 165, y: 99, w: 70, h: 8 }, color: "#27ae60", density: 0.95,
    lineEndpoints: { from: { x: 170, y: 103 }, to: { x: 230, y: 115 } }
  }, 1, { visualConnectors: [{ id: "stage-transition", atomId: "transition", fromAtomId: "stage", toAtomId: "result" }] });
  assert.deepEqual(arrowShape.box, { x: 170, y: 103, w: 60, h: 12 });
  assert.deepEqual(arrowShape.style, { stroke: "#27ae60", strokeWidthPt: 4, connectorType: "straight", endArrow: "triangle" });
  assert.deepEqual({ detector: arrowShape.source.detector, axis: arrowShape.source.axis, from: arrowShape.source.fromAtomId, to: arrowShape.source.toAtomId, connector: arrowShape.source.visualConnectorId }, { detector: "visual-atom-native-connector", axis: "diagonal", from: "stage", to: "result", connector: "stage-transition" });
  const ringShape = atomNative.visualAtomNativeShape(atomLayer, {
    id: "ring-quarter", kind: "native-donut-segment-candidate", shapeHint: "donut-segment", donutParentBox: { x: 300, y: 100, w: 80, h: 80 }, box: { x: 300, y: 100, w: 80, h: 80 },
    donutSegmentAngles: { startDeg: 0, endDeg: 90 }, holeRatio: 0.52, color: "#F2994A", density: 0.7
  }, 2);
  assert.equal(ringShape.type, "freeform");
  assert.deepEqual(ringShape.box, { x: 300, y: 100, w: 80, h: 80 });
  assert.deepEqual(ringShape.style, { fill: "#F2994A", stroke: "#F2994A", strokeWidthPt: 0 });
  assert.equal(ringShape.points.length > 8, true);
  assert.deepEqual({ detector: ringShape.source.detector, startDeg: ringShape.source.startDeg, endDeg: ringShape.source.endDeg, atomId: ringShape.source.atomId }, { detector: "visual-atom-native-donut-segment", startDeg: 0, endDeg: 90, atomId: "ring-quarter" });
  const topology = api["visual-atom-topology"].annotateVisualAtomTopology([
    { id: "source", kind: "native-rect-candidate", box: { x: 10, y: 20, w: 40, h: 30 } },
    { id: "target", kind: "native-ellipse-candidate", box: { x: 160, y: 20, w: 40, h: 30 } },
    { id: "route", kind: "connector-arrow-candidate", box: { x: 50, y: 30, w: 110, h: 8 }, lineEndpoints: { from: { x: 50, y: 34 }, to: { x: 160, y: 34 } } }
  ]);
  assert.deepEqual(topology.find((atom) => atom.id === "route"), { id: "route", kind: "connector-arrow-candidate", box: { x: 50, y: 30, w: 110, h: 8 }, lineEndpoints: { from: { x: 50, y: 34 }, to: { x: 160, y: 34 } }, fromAtomId: "source", toAtomId: "target", topologyInferred: true });
  const relationship = api["relationship-native-shell"];
  const relationshipAtoms = [
    ["a", "native-rect-candidate", { x: 48, y: 118, w: 84, h: 48 }], ["b", "native-ellipse-candidate", { x: 246, y: 42, w: 82, h: 58 }],
    ["c", "native-diamond-candidate", { x: 438, y: 118, w: 76, h: 58 }], ["d", "native-rect-candidate", { x: 246, y: 224, w: 82, h: 48 }]
  ].map(([id, kind, box]) => ({ id, kind, box, nativeCandidate: true, density: 1, color: "#60A5FA" }));
  const measuredRoute = (id, from, to) => ({ id, kind: "connector-line-candidate", shapeHint: "line-diagonal", box: { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) }, lineEndpoints: { from, to }, nativeCandidate: true, residualCandidate: false, density: 0.3, color: "#64748B" });
  const relationshipConnectors = [
    measuredRoute("ab", { x: 132, y: 136 }, { x: 246, y: 80 }), measuredRoute("bc", { x: 328, y: 80 }, { x: 438, y: 136 }),
    measuredRoute("cd", { x: 438, y: 154 }, { x: 328, y: 244 }), measuredRoute("da", { x: 246, y: 244 }, { x: 132, y: 154 })
  ];
  const relationshipUnderstanding = { archetype: "generic-node-diagram", confidence: 0.92, visualConnectors: [
    { atomId: "ab", fromAtomId: "a", toAtomId: "b" }, { atomId: "bc", fromAtomId: "b", toAtomId: "c" },
    { atomId: "cd", fromAtomId: "c", toAtomId: "d" }, { atomId: "da", fromAtomId: "d", toAtomId: "a" }
  ] };
  const relationshipShell = relationship.createRelationshipNativeShell({ id: "isolated-relationship", box: { x: 0, y: 0, w: 560, h: 320 } }, [...relationshipAtoms, ...relationshipConnectors], { layerType: "diagram-zone" }, relationshipUnderstanding);
  assert.equal(relationshipShell.fullyObjectified, true);
  assert.equal(relationshipShell.shellKind, "measured-generic-graph");
  assert.equal(relationshipShell.shapes.filter((shape) => shape.source.detector === "visual-relationship-native-generic-node").length, 4);
  assert.equal(relationshipShell.shapes.filter((shape) => shape.source.detector === "visual-relationship-native-generic-connector").length, 4);
  const incompleteRelationshipAtoms = [
    ["a", "native-rect-candidate", { x: 40, y: 80, w: 80, h: 48 }], ["b", "native-rect-candidate", { x: 240, y: 40, w: 80, h: 48 }], ["c", "native-rect-candidate", { x: 420, y: 140, w: 80, h: 48 }]
  ].map(([id, kind, box]) => ({ id, kind, box, nativeCandidate: true, density: 1, color: "#60A5FA" }));
  const incompleteShell = relationship.createRelationshipNativeShell({ id: "isolated-unsafe-relationship", box: { x: 0, y: 0, w: 540, h: 260 } }, [
    ...incompleteRelationshipAtoms, measuredRoute("ab", { x: 120, y: 104 }, { x: 240, y: 64 }), { id: "bc", kind: "connector-line-candidate", box: { x: 320, y: 64, w: 100, h: 100 }, lineEndpoints: null, nativeCandidate: true, density: 1, color: "#60A5FA" }
  ], { layerType: "diagram-zone" }, { archetype: "generic-node-diagram", confidence: 0.92, visualConnectors: relationshipUnderstanding.visualConnectors.slice(0, 2) });
  assert.deepEqual({ preserveWhole: incompleteShell.preserveWhole, shellKind: incompleteShell.shellKind, shapes: incompleteShell.shapes }, { preserveWhole: true, shellKind: "measured-generic-graph", shapes: [] });
  const reconstructedAtoms = api["visual-atom-native-reconstruction"].createVisualAtomNativeShapes([{
    id: "isolated-relationship-reconstruction", box: { x: 0, y: 0, w: 560, h: 320 },
    source: { layer: { layerType: "diagram-zone", recommendedAction: "attempt-native-reconstruction", diagramUnderstanding: { ...relationshipUnderstanding, visualAtoms: [...relationshipAtoms, ...relationshipConnectors] } } }
  }]);
  assert.equal(reconstructedAtoms.filter((shape) => shape.source.detector === "visual-relationship-native-generic-node").length, 4);
  assert.equal(reconstructedAtoms.filter((shape) => shape.source.detector === "visual-relationship-native-generic-connector").length, 4);
  const comparison = api["comparison-matrix-reconstruction"];
  const matrixSkeletonImage = {
    id: "isolated-comparison-skeleton",
    box: { x: 45.85, y: 43.38, w: 549.35, h: 438.25 },
    source: { detector: "comparison-matrix-crop", expressionForm: "table-or-matrix", expressionSubtype: "comparison-matrix", componentTemplateGroupApplied: true, componentTemplateFamilyApplied: "matrix" }
  };
  const matrixSkeleton = comparison.createComparisonMatrixShapes([matrixSkeletonImage], [], null, { widthPt: 960, heightPt: 540 });
  assert.equal(matrixSkeletonImage.source.comparisonMatrixSkeletonObjectified, true);
  assert.equal(matrixSkeleton.filter((shape) => shape.source.detector === "comparison-matrix-native-skeleton-bg").length, 1);
  assert.equal(matrixSkeleton.filter((shape) => shape.source.detector === "comparison-matrix-native-skeleton-header").length, 1);
  assert.equal(matrixSkeleton.filter((shape) => shape.source.detector === "comparison-matrix-native-skeleton-grid-line").length, 7);
  assert.equal(matrixSkeleton.filter((shape) => shape.source.detector === "comparison-matrix-native-skeleton-status").length, 4);
  assert.ok(matrixSkeleton.every((shape) => shape.source.skeletonOnly === true));
  const comparisonTextImages = [
    { id: "isolated-comparison-left", box: { x: 45.85, y: 43.38, w: 549.35, h: 438.25 }, source: { detector: "comparison-matrix-crop", strategy: "local-fidelity-crop" } },
    { id: "isolated-comparison-right", box: { x: 595.2, y: 43.38, w: 320.45, h: 438.25 }, source: { detector: "comparison-matrix-crop", strategy: "local-fidelity-crop" } }
  ];
  const comparisonText = [
    ["传统工作方式", 203.92, 69.38, 116.95, 20.63], ["普通AI工具", 418.71, 69.38, 107.96, 20.63], ["PMPortalAISkills", 645.87, 70.13, 196.8, 19.88],
    ["场景理解", 74.97, 147.75, 68.97, 18], ["人工翻阅大量历史材料", 183.68, 147.75, 156.31, 16.88], ["深度结合真实系统架构与沉淀资产", 632.75, 145.88, 242.16, 20.63],
    ["需求→PRD→评审→原型无缝串联", 632.75, 243, 242.91, 19.88], ["产出自动落盘为标准分布式域仓资产", 629.75, 434.63, 257.9, 19.88]
  ].map(([text, x, y, w, h]) => ({ text, box: { x, y, w, h }, font: { opacity: 0, color: "#FFFFFF", sizePt: 14 } }));
  const comparisonSourceImage = { width: 960, height: 540, rgba: Buffer.alloc(960 * 540 * 4, 255) };
  assert.deepEqual(comparison.createComparisonMatrixShapes(comparisonTextImages, comparisonText, comparisonSourceImage, { widthPt: 960, heightPt: 540 }), []);
  assert.ok(comparisonTextImages.every((image) => image.source.comparisonMatrixTextObjectified === true));
  assert.deepEqual(comparisonTextImages.map((image) => image.source.comparisonMatrixNativeTextBoxes.length), [4, 4]);
  assert.ok(comparisonTextImages[1].source.comparisonMatrixNativeTextBoxes.some((box) => box.text === "PM Portal AI Skills"));
  const nonMatrixImage = { id: "isolated-non-matrix", box: { x: 80, y: 90, w: 320, h: 120 }, source: { detector: "foreground-graphic-crop", layer: { layerType: "illustration-zone" } } };
  assert.deepEqual(comparison.createComparisonMatrixShapes([nonMatrixImage], [], null, { widthPt: 960, heightPt: 540 }), []);
  assert.equal(nonMatrixImage.source.comparisonMatrixSkeletonObjectified, undefined);
  assert.equal(nonMatrixImage.source.comparisonMatrixNativeTextBoxes, undefined);

  fs.copyFileSync(path.join(root, "packages/slideclone-core/page-text-finalizer.js"), path.join(installed, "page-text-finalizer.js"));
  const { fixture } = require("./helpers/page-text-fixture.cjs");
  const textStage = fixture();
  const retained = { id: "isolated-text" };
  textStage.inputs.retainedComponentBackfillFilteredNativeTextBoxes = [retained];
  load("@common-tools/slideclone-core/page-text-finalizer").createPageTextFinalizer(textStage.operations)(textStage.page, textStage.inputs);
  assert.equal(textStage.page.textBoxes[0], retained);
  fs.copyFileSync(path.join(root, "packages/slideclone-core/page-shape-finalizer.js"), path.join(installed, "page-shape-finalizer.js"));
  const shapeStage = require("./helpers/page-shape-fixture.cjs").fixture();
  const retainedShape = { id: "isolated-shape" };
  shapeStage.inputs.titleChromeShapes = [retainedShape];
  load("@common-tools/slideclone-core/page-shape-finalizer").createPageShapeFinalizer(shapeStage.operations)(shapeStage.page, shapeStage.inputs);
  assert.equal(shapeStage.page.shapes[0], retainedShape);
  fs.copyFileSync(path.join(root, "packages/slideclone-core/page-output-finalizer.js"), path.join(installed, "page-output-finalizer.js"));
  const outputStage = require("./helpers/page-output-fixture.cjs").fixture();
  load("@common-tools/slideclone-core/page-output-finalizer").createPageOutputFinalizer(outputStage.operations)(outputStage.page, outputStage.inputs);
  assert.equal(outputStage.calls.filter(call => call.name === "applyPrototypeValidationScreenshotPolicy").length, 2);
  const semantic = api["page-semantic-claims"].createPageSemanticClaims({
    createSkillsCapabilityMatrixObjects: api["skills-capability-matrix"].createSkillsCapabilityMatrixObjects,
    createDemandIntakeFunnelObjects: api["demand-intake-funnel"].createDemandIntakeFunnelObjects,
    createSmartReviewBranchGateObjects: api["smart-review-branch-gate"].createSmartReviewBranchGateObjects,
    createSkillChainOrchestrationObjects: api["skill-chain-orchestration"].createSkillChainOrchestrationObjects,
    createAssetLandingTriadObjects: api["asset-landing-triad"].createAssetLandingTriadObjects
  });
  const semanticResult = semantic.claimPageSemanticImages({ page: { images: [] }, candidateImages: [], textBoxes: [], image: {}, slideSize: { widthPt: 960, heightPt: 540 }, pageIndex: 0, options: { objectifyLayerConnectors: true } });
  for (const name of ["skillsCapabilityMatrix", "demandIntakeFunnel", "smartReviewBranchGate", "skillChainOrchestration", "assetLandingTriad"]) assert.equal(semanticResult[name].matched, false);
  const source = api["ocr-source-deck"].boundedOcrSourceDeck({ metadata: { dimensions: { widthPx: 100, heightPx: 100 } }, ocr: { lines: [] }, sourceImage: "assets/source.png" });
  const events = [];
  const plan = api["native-rebuild-deck-pipeline"].createNativeRebuildPlan({
    workDir: directory,
    options: { pages: "1", progressReporter: { emit(event) { events.push(event); } } },
    services: { readJson: () => source, sourceNativeSlideMetadata: () => new Map() }
  });
  assert.equal(plan.selectedPageTotal, 1);
  assert.equal(plan.selectedPages[0].page, source.pages[0]);
  const lifecycle = api["native-rebuild-deck-pipeline"].createPageProgressLifecycle({ progressReporter: plan.progressReporter, pageIndex: 0, selectedPageOrdinal: 0, selectedPageTotal: 1 });
  assert.equal(lifecycle.complete(source.pages[0]), source.pages[0]);
  assert.equal(api["native-rebuild-deck-pipeline"].createPageProgressLifecycle, api["page-progress-lifecycle"].createPageProgressLifecycle);
  assert.deepEqual(events.map((event) => event.status), ["start", "done"]);
  const graphics = api["page-graphics-stage"].createPageGraphicsStage(Object.fromEntries([
    "detectLongLines", "createKpiEvidenceCrops", "createKpiEvidenceShapes", "shouldFullyObjectifyEntropyChallenge",
    "createTitleChromeShapes", "keepStructuralLines", "createGraphicUnderlayCrop", "decorativeBackgroundMode",
    "normalizeDecorativeCoverTextBoxes", "createDecorativeCoverBackground", "createGraphicCrops"
  ].map((name) => [name, () => []])));
  assert.deepEqual(graphics.preparePageGraphics({ image: null, textBoxes: [], slideSize: { widthPt: 960, heightPt: 540 }, pageIndex: 0 }).images, []);
  assert.equal(api["graphic-crop-policy"].shouldProtectSmallForegroundGraphicCrop({ detector: "foreground-graphic-crop", box: { w: 50, h: 50 } }), true);
  const finalize = api["page-image-finalizer"].createPageImageFinalizer({
    normalizeImageLayerMetadata: (image) => image,
    shouldPreserveTwoPanelChaosIllustrationCrop: () => false,
    markTwoPanelChaosIllustrationPreserved: (image) => image
  });
  const output = { images: [{ type: "fidelity-crop", source: {} }] };
  assert.equal(finalize.normalizePageImageMetadata(output), output);
  assert.equal(output.images[0].source.componentRenderStrategy.mode, "preserve-local-crop");
  assert.deepEqual(api["page-selection"].parsePageSelection("1"), new Set([0]));
  const sourceFile = path.join(directory, "source.png");
  const outputFile = path.join(directory, "residual.png");
  const pixels = Buffer.alloc(32 * 32 * 4, 128);
  for (let offset = 3; offset < pixels.length; offset += 4) pixels[offset] = 255;
  api.png.writePng(sourceFile, { width: 32, height: 32, rgba: pixels });
  assert.deepEqual(api.png.readPng(sourceFile).rgba, pixels);
  const icon = { width: 20, height: 14, rgba: Buffer.alloc(20 * 14 * 4, 255) };
  for (let y = 3; y <= 10; y++) for (let x = 3; x <= 10; x++) icon.rgba.set([20, 180, 100, 255], (y * 20 + x) * 4);
  for (let y = 5; y <= 8; y++) for (let x = 16; x <= 19; x++) icon.rgba.set([20, 180, 100, 255], (y * 20 + x) * 4);
  const refined = api["icon-crop-refiner"].refineStandaloneIconCrop(icon, { paddingPx: 1 });
  assert.equal(refined.removedNeighborPixels, 16);
  assert.ok(refined.image.width < 14);
  assert.equal(refined.image.rgba[3], 0);
  assert.equal(icon.rgba[3], 255);
  assert.deepEqual(api["knowledge-graph-icon-crops"].refineKnowledgeGraphIconCrops({ page: { images: [] }, slideSize: { widthPt: 32, heightPt: 32 }, sourceFile, root: directory }), { matched: false, replacedCrops: 0, createdCrops: 0 });
  const buildResidual = api["full-slide-native-residual"].createFullSlideResidualBuilder({
    readPng: api.png.readPng, writePng: api.png.writePng,
    eraseMasks(image, masks) {
      const result = { ...image, rgba: Buffer.from(image.rgba) };
      for (const mask of masks) {
        for (let y = mask.y; y < mask.y + mask.h; y++) {
          for (let x = mask.x; x < mask.x + mask.w; x++) result.rgba.fill(255, (y * image.width + x) * 4, (y * image.width + x + 1) * 4);
        }
      }
      return result;
    }
  });
  const residual = await buildResidual({ sourceFile, outputFile, objects: [{ box: { x: 12, y: 12, w: 4, h: 4 } }], slideSize: { x: 0, y: 0, w: 32, h: 32 } });
  assert.equal(residual.erasedObjects, 1);
  const decoded = api.png.readPng(outputFile);
  assert.equal(decoded.rgba[(12 * 32 + 12) * 4], 255);
  assert.equal(decoded.rgba[0], 128);
  assert.deepEqual(api.png.readPng(sourceFile).rgba, pixels);
  assert.equal(fs.existsSync(path.join(directory, "skills")), false);
});

test("Worker composition cannot return to legacy pixel IO and residual implementations", () => {
  const { verifyWorkspaceBoundaries } = require("../scripts/verify-workspace-boundaries");
  const edges = verifyWorkspaceBoundaries(root).legacyEdges;
  assert.equal(edges.some((edge) => /\/(png|full-slide-native-residual|knowledge-graph-icon-crops)\.js$/.test(edge.target)), false);
});

test("pixel compatibility entries load from the bundled Runtime without workspace package links", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pixel-runtime-layout-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, "packages/slideclone-core"), { recursive: true });
  fs.copyFileSync(path.join(root, "packages/slideclone-core/residual-publication.js"), path.join(directory, "packages/slideclone-core/residual-publication.js"));
  fs.copyFileSync(path.join(root, "packages/slideclone-core/arc-residual-masks.js"), path.join(directory, "packages/slideclone-core/arc-residual-masks.js"));
  for (const name of ["png", "full-slide-native-residual"]) {
    for (const folder of ["packages/slideclone-core", "skills/pd-hifi-slideclone/scripts/lib"]) {
      const target = path.join(directory, folder, `${name}.js`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, folder, `${name}.js`), target);
    }
    assert.equal(require(path.join(directory, "skills/pd-hifi-slideclone/scripts/lib", `${name}.js`)), require(path.join(directory, "packages/slideclone-core", `${name}.js`)));
  }
  assert.equal(fs.existsSync(path.join(directory, "node_modules")), false);
});

test("release admission requires every migrated core file", () => {
  for (const name of modules) assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes(`packages/slideclone-core/${name}.js`), name);
});

test("legacy consumers share the core implementation rather than a second code path", () => {
  for (const name of ["edge-background-alpha", "icon-crop-refiner", "knowledge-graph-icon-crops", "png", "full-slide-native-residual", "page-selection", "progress-reporter", "native-rebuild-deck-pipeline"]) {
    assert.equal(require(`../skills/pd-hifi-slideclone/scripts/lib/${name}`), require(`../packages/slideclone-core/${name}`));
  }
  assert.equal(require("../packages/slideclone-core/team-native-rebuild").boundedOcrSourceDeck, require("../packages/slideclone-core/ocr-source-deck").boundedOcrSourceDeck);
  assert.equal(require("../skills/pd-hifi-slideclone/scripts/lib/minimum-unit-crop-evidence").buildMinimumUnitCropEvidence, require("../packages/slideclone-core/graphic-crop-policy").buildMinimumUnitCropEvidence);
});


test("graphic expression policy removes all ASCII controls without changing Unicode text", () => {
  const { classifyGraphicExpressionPolicy } = require("../packages/slideclone-core/graphic-expression-policy");
  const input = { expressionForm: "icon-or-illustration", expressionSubtype: "图标😀", recommendedAction: "keep-local-crop" };
  const expected = classifyGraphicExpressionPolicy(input);
  for (const code of [...Array(32).keys(), 127]) {
    const control = String.fromCharCode(code);
    assert.deepEqual(classifyGraphicExpressionPolicy(Object.fromEntries(Object.entries(input).map(([key,value]) => [key, control + value + control]))), expected);
  }
  assert.equal(require("../skills/pd-hifi-slideclone/scripts/lib/graphic-expression-policy"), require("../packages/slideclone-core/graphic-expression-policy"));
});
