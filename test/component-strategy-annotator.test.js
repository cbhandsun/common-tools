"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  annotateImagesWithComponentAssets,
  annotateImagesWithComponentStrategies,
  buildComponentAssetIndex,
  buildComponentStrategyIndex,
  componentAssetLayersForPage,
  componentAssetShapeLayersForPage,
  shouldDeferNativeRebuildForComponentStrategy
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-strategy-annotator");
const {
  collectComponentTemplateFallbackDiagramTextBoxes,
  componentAssetLayerPseudoImages,
  createComponentTemplateNativeShapes,
  dedupeTextBoxesByStableId,
  filterComponentTemplateShapeLayerInputs,
  filterTextBoxesConsumedByComponentTemplateBackfill,
  filterTextBoxesOutsideSpecializedNativeObjects,
  mergeDiagramTextBoxes,
  resolveComponentIndexPage,
  shouldAllowSpecializedNativeRebuildForDeferredComponent,
  suppressComponentTemplateShapesForSpecializedLayers
} = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

test("component strategy annotator maps report layers back to page images", () => {
  const index = buildComponentStrategyIndex({
    layers: [{
      pageIndex: 1,
      imageIndex: 2,
      componentRenderStrategy: {
        mode: "plugin-component-template",
        implementationMode: "auth-or-download-required",
        editableExpectation: "candidate-editable-template-after-download",
        visualFidelityBias: "component-first",
        reason: "use grouped component candidate",
        applicationPlan: {
          currentStep: "preserve-source-crop-and-record-component-replacement",
          targetStep: "replace-fidelity-crop-with-editable-plugin-component-when-download-is-available",
          sourceProvider: "officeplus",
          componentKind: "component",
          componentId: "MatlComponentContent-11617",
          suitabilityTier: "strong",
          suitabilityScore: 96,
          targetMotifs: ["linear-arrow-chain"],
          requiresDownload: true,
          preservesFidelityNow: true
        },
        bestCandidate: {
          sourceProvider: "officeplus",
          kind: "component",
          id: "MatlComponentContent-11617",
          title: "渐变6项流程",
          targetMotifs: ["linear-arrow-chain", "whole-process-template"],
          structureSignature: {
            primaryKind: "process-chain",
            layout: "linear-process",
            motifs: ["linear-arrow-chain"]
          },
          roleTags: ["component-template"],
          coverUrl: "https://image-prod.officeplus.cn/demo.png",
          candidateScore: 58,
          suitability: { tier: "strong", score: 96 }
        }
      }
    }]
  });

  const images = annotateImagesWithComponentStrategies([
    { id: "img-1", source: { layer: { layerType: "diagram-zone" } } },
    { id: "img-2", source: { layer: { layerType: "diagram-zone" } } },
    { id: "img-3", source: { layer: { layerType: "diagram-zone" } } }
  ], 1, index);

  assert.equal(images[0].source.componentRenderStrategy, undefined);
  assert.equal(images[2].source.componentRenderStrategy.mode, "plugin-component-template");
  assert.equal(images[2].source.componentRenderStrategy.applicationPlan.requiresDownload, true);
  assert.equal(images[2].source.componentRenderStrategy.applicationPlan.suitabilityTier, "strong");
  assert.deepEqual(images[2].source.componentRenderStrategy.applicationPlan.targetMotifs, ["linear-arrow-chain"]);
  assert.deepEqual(images[2].source.componentRenderStrategy.bestCandidate.targetMotifs, ["linear-arrow-chain", "whole-process-template"]);
  assert.equal(images[2].source.componentRenderStrategy.bestCandidate.structureSignature.primaryKind, "process-chain");
  assert.deepEqual(images[2].source.componentRenderStrategy.bestCandidate.roleTags, ["component-template"]);
  assert.equal(images[2].source.componentRenderStrategy.bestCandidate.suitability.score, 96);
  assert.equal(images[2].source.layer.componentRenderStrategy.bestCandidate.id, "MatlComponentContent-11617");
  assert.equal(shouldDeferNativeRebuildForComponentStrategy(images[2]), true);
});

test("component strategy annotator preserves expression policy disposition for final IR audits", () => {
  const index = buildComponentStrategyIndex({
    layers: [{
      pageIndex: 0,
      imageIndex: 0,
      componentRenderStrategy: {
        mode: "preserve-local-crop",
        implementationMode: "native-generator-safe-fallback",
        editableExpectation: "standalone-visual-asset-preserved-as-movable-crop",
        visualFidelityBias: "fidelity-first",
        expressionPolicy: {
          kind: "standalone-visual-asset",
          minimumUnitPolicy: "preserve-as-single-crop",
          unitDisposition: "intentional-visual-crop",
          allowNativeRebuild: false,
          protectCrop: true,
          allowPluginTemplate: false,
          reasons: ["pictorial-single-asset-preserved", "x".repeat(20)]
        }
      }
    }]
  });

  const [image] = annotateImagesWithComponentStrategies([{ id: "visual-asset" }], 0, index);

  assert.equal(image.source.componentRenderStrategy.expressionPolicy.kind, "standalone-visual-asset");
  assert.equal(image.source.componentRenderStrategy.expressionPolicy.unitDisposition, "intentional-visual-crop");
  assert.equal(image.source.componentRenderStrategy.expressionPolicy.protectCrop, true);
  assert.equal(image.source.layer, undefined);
});

test("component strategy annotator sanitizes unsafe candidate fields", () => {
  const index = buildComponentStrategyIndex({
    layers: [{
      pageIndex: 0,
      imageIndex: 0,
      componentRenderStrategy: {
        mode: "preserve-crop-with-component-reference",
        reason: `x${"y".repeat(400)}`,
        bestCandidate: {
          sourceProvider: "islide",
          kind: "diagram",
          id: "5114996",
          title: "demo\u0000",
          coverUrl: "file:///unsafe.png",
          confidence: 2
        }
      }
    }]
  });

  const [image] = annotateImagesWithComponentStrategies([{ id: "img" }], 0, index);
  assert.equal(image.source.componentRenderStrategy.bestCandidate.title, "demo");
  assert.equal(image.source.componentRenderStrategy.bestCandidate.coverUrl, "");
  assert.equal(image.source.componentRenderStrategy.reason.length, 320);
  assert.equal(shouldDeferNativeRebuildForComponentStrategy(image), true);
});

test("component strategy annotator defers screenshot crops while allowing native overlay strategies downstream", () => {
  const index = buildComponentStrategyIndex({
    layers: [{
      pageIndex: 0,
      imageIndex: 0,
      componentRenderStrategy: {
        mode: "preserve-crop-with-native-overlays",
        implementationMode: "hybrid-native-overlay",
        editableExpectation: "fidelity-screenshot-with-editable-native-diagram-overlays",
        visualFidelityBias: "balanced",
        applicationPlan: {
          currentStep: "preserve-source-crop-and-rebuild-detected-overlays-as-native",
          targetStep: "replace-only-non-screenshot-overlay-atoms-with-editable-native-shapes",
          preservesFidelityNow: true
        }
      }
    }]
  });

  const [image] = annotateImagesWithComponentStrategies([{
    id: "screenshot-layer",
    source: { layer: { layerType: "screenshot-zone" } }
  }], 0, index);

  assert.equal(image.source.componentRenderStrategy.mode, "preserve-crop-with-native-overlays");
  assert.equal(image.source.layer.componentRenderStrategy.implementationMode, "hybrid-native-overlay");
  assert.equal(shouldDeferNativeRebuildForComponentStrategy(image), true);
});

test("component strategy annotator attaches local component assets to matching images", () => {
  const index = buildComponentAssetIndex({
    layers: [{
      pageIndex: 1,
      imageIndex: 0,
      layerKey: "1:0",
      readiness: {
        status: "local-template-learning-ready",
        nextStep: "extract-openxml-grouped-shapes-from-local-template",
        currentStep: "preserve-source-crop",
        targetMotifs: ["arc-arrow"],
        appliedMotifReadyAssets: 0
      },
      localAssets: [{
        id: "officeplus-local",
        provider: "officeplus",
        path: "C:\\OfficePLUS\\officeplus.pptx",
        name: "officeplus.pptx",
        assetKind: "presentation-template",
        roleTags: ["diagram", "template-layout"],
        reusePolicy: "inspect-openxml-and-learn-style",
        matchScore: 94,
        suggestedUse: "inspect-openxml-groups-and-learn-editable-component",
        reasonCodes: ["provider-match"],
        learningSummary: {
          status: "ok",
          assetType: "pptx-template",
          totals: { groups: 4, shapes: 20 },
          componentSignals: ["grouped-shape-components"]
        },
        recommendedComponentGroups: [{
          id: "slide2-group2",
          slide: 2,
          groupIndex: 1,
          name: "组合 173",
          boundsPt: { x: 1, y: 2, w: 300, h: 40 },
          childCount: 35,
          shapeCount: 31,
          pictureCount: 0,
          connectorCount: 4,
          textRuns: 0,
          structure: {
            kind: "process-chain",
            motifs: ["arc-arrow"],
            motifCounts: { "arc-arrow": 2 }
          },
          reuseReadiness: {
            level: "high",
            score: 91,
            reasons: ["has-child-layout"]
          },
          topColors: [
            { value: "#185ABD", count: 5 },
            { value: "<script>", count: 2 }
          ],
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            boundsSource: "group-xfrm",
            childBoxCount: 2,
            children: [
              {
                kind: "shape",
                box: { x: 0.05, y: 0.1, w: 0.2, h: 0.3 },
                style: {
                  fill: "#185ABD",
                  stroke: "#FFFFFF",
                  strokeWidthPt: 1.5,
                  radiusRatio: 0.22,
                  shapeType: "blockArc",
                  dash: "dash",
                  adjustments: [0.12, 0.76, 999],
                  text: {
                    placeholderText: "阶段一",
                    fontSizePt: 16,
                    color: "#FFFFFF",
                    weight: "bold",
                    align: "center",
                    valign: "middle",
                    family: "Microsoft YaHei"
                  },
                  picture: {
                    embedRelId: "rId7",
                    mediaTarget: "ppt/media/image7.png",
                    crop: { left: 0.1, top: 0.2 },
                    unsafePath: "../evil.png"
                  },
                  unsafeHtml: "<script>alert(1)</script>"
                }
              },
              { kind: "script", box: { x: 0, y: 0, w: 1, h: 1 } }
            ]
          },
          replayChildLayout: {
            provider: "pptx-group-replay-layout-v1",
            boundsSource: "nested-child-union",
            childBoxCount: 2,
            children: [
              { kind: "shape", box: { x: 0.1, y: 0.2, w: 0.25, h: 0.3 }, style: { fill: "#F97316", shapeType: "roundRect", rotation: 90, flipH: true, flipV: true } },
              { kind: "connector", box: { x: 0.35, y: 0.3, w: 0.2, h: 0.01 }, style: { stroke: "#64748B", connectorType: "straight" } }
            ]
          },
          componentScore: 110,
          score: 86,
          matchScore: 86,
          matchReasons: ["process-chain-connectors"]
        }]
      }]
    }]
  });

  const images = annotateImagesWithComponentAssets([{ source: {} }, { source: {} }], 1, index);

  assert.equal(images[0].source.componentAssetLayerKey, "1:0");
  assert.equal(images[0].source.componentAssetReadiness.status, "local-template-learning-ready");
  assert.deepEqual(images[0].source.componentAssetReadiness.targetMotifs, ["arc-arrow"]);
  assert.equal(images[0].source.componentAssetReadiness.appliedMotifReadyAssets, 0);
  assert.equal(images[0].source.componentLocalAssets[0].provider, "officeplus");
  assert.equal(images[0].source.componentLocalAssets[0].learningSummary.assetType, "pptx-template");
  assert.equal(images[0].source.componentLocalAssets[0].recommendedComponentGroups[0].id, "slide2-group2");
  assert.equal(images[0].source.componentLocalAssets[0].recommendedComponentGroups[0].score, 86);
  assert.equal(images[0].source.componentLocalAssets[0].recommendedComponentGroups[0].structure.kind, "process-chain");
  assert.deepEqual(images[0].source.componentLocalAssets[0].recommendedComponentGroups[0].structure.motifs, ["arc-arrow"]);
  assert.deepEqual(images[0].source.componentLocalAssets[0].recommendedComponentGroups[0].reuseReadiness, {
    level: "high",
    score: 91,
    reasons: ["has-child-layout"]
  });
  assert.deepEqual(images[0].source.componentLocalAssets[0].recommendedComponentGroups[0].topColors, [{ value: "#185ABD", count: 5 }]);
  assert.equal(images[0].source.componentLocalAssets[0].recommendedComponentGroups[0].replayChildLayout.children.length, 2);
  assert.equal(images[0].source.componentLocalAssets[0].recommendedComponentGroups[0].replayChildLayout.children[0].style.rotation, 90);
  assert.equal(images[0].source.componentLocalAssets[0].recommendedComponentGroups[0].replayChildLayout.children[0].style.flipH, true);
  assert.equal(images[0].source.componentLocalAssets[0].recommendedComponentGroups[0].replayChildLayout.children[0].style.flipV, true);
  assert.equal(images[0].source.componentLocalAssets[0].recommendedComponentGroups[0].replayChildLayout.children[1].kind, "connector");
  assert.deepEqual(images[0].source.componentLocalAssets[0].recommendedComponentGroups[0].childLayout.children, [
    {
      kind: "shape",
      box: { x: 0.05, y: 0.1, w: 0.2, h: 0.3 },
      style: {
        fill: "#185ABD",
        stroke: "#FFFFFF",
        strokeWidthPt: 1.5,
        radiusRatio: 0.22,
        shapeType: "blockArc",
        dash: "dash",
        adjustments: [0.12, 0.76, 2],
        text: {
          placeholderText: "阶段一",
          fontSizePt: 16,
          color: "#FFFFFF",
          weight: "bold",
          align: "center",
          valign: "middle",
          family: "Microsoft YaHei"
        },
        picture: {
          embedRelId: "rId7",
          mediaTarget: "ppt/media/image7.png",
          crop: { left: 0.1, top: 0.2 }
        }
      }
    }
  ]);
  assert.equal(images[1].source.componentLocalAssets, undefined);
});

test("component strategy annotator exposes native shape-group component asset layers", () => {
  const index = buildComponentAssetIndex({
    layers: [{
      pageIndex: 0,
      imageIndex: null,
      shapeLayerId: "p1-semantic-cycle-native-shapes",
      layerKey: "0:shape:p1-semantic-cycle-native-shapes",
      box: { x: 120, y: 140, width: 320, height: 220 },
      layerType: "diagram-zone",
      detector: "semantic-cycle-native-shape-group",
      templateFamily: "cycle-loop",
      strategyMode: "plugin-component-template",
      remoteCandidate: {
        sourceProvider: "officeplus",
        kind: "component",
        id: "MatlComponentContent-13534",
        title: "扁平6项循环闭环",
        candidateScore: 80
      },
      readiness: { status: "local-template-learning-ready" },
      localAssets: [{
        id: "officeplus-downloaded-cycle",
        provider: "officeplus",
        path: "C:\\OfficePLUS\\Temp\\Files\\cycle.pptx",
        name: "cycle.pptx",
        assetKind: "presentation-template",
        roleTags: ["downloaded-component", "template-layout"],
        reusePolicy: "inspect-openxml-downloaded-plugin-component",
        matchScore: 110,
        recommendedComponentGroups: [{
          id: "slide1-group1",
          name: "cycle group",
          childCount: 20,
          shapeCount: 20,
          pictureCount: 0,
          connectorCount: 0,
          score: 72,
          matchScore: 72
        }]
      }]
    }]
  });

  const layers = componentAssetShapeLayersForPage(index, 0);
  assert.equal(layers.length, 1);
  assert.equal(componentAssetLayersForPage(index, 0).length, 1);
  assert.equal(layers[0].shapeLayerId, "p1-semantic-cycle-native-shapes");
  assert.deepEqual(layers[0].box, { x: 120, y: 140, w: 320, h: 220 });

  const pseudo = componentAssetLayerPseudoImages(0, index);
  assert.equal(pseudo.length, 1);
  assert.equal(componentAssetLayerPseudoImages(0, index, [{ source: { componentAssetLayerKey: "0:shape:p1-semantic-cycle-native-shapes" } }]).length, 0);
  assert.equal(pseudo[0].source.componentRenderStrategy.mode, "plugin-component-template");
  assert.equal(pseudo[0].source.layer.templateFamily, "cycle-loop");

  const shapes = createComponentTemplateNativeShapes(pseudo, { widthPt: 960, heightPt: 540 }, { minScore: 58 });
  assert.ok(shapes.length >= 6);
  assert.equal(shapes[0].source.layerSourceId, "p1-semantic-cycle-native-shapes");
  assert.equal(shapes[0].source.componentTemplateGroupApplied, true);

  assert.equal(resolveComponentIndexPage(index, 7, 0), 0);
});

test("component asset pseudo images preserve applied plugin child styles for native replay", () => {
  const index = buildComponentAssetIndex({
    layers: [{
      pageIndex: 0,
      imageIndex: null,
      shapeLayerId: "p1-officeplus-roadmap",
      layerKey: "0:shape:p1-officeplus-roadmap",
      box: { x: 100, y: 120, w: 520, h: 160 },
      layerType: "diagram-zone",
      detector: "component-asset-layer",
      templateFamily: "process-chain",
      strategyMode: "plugin-component-template",
      remoteCandidate: {
        sourceProvider: "officeplus",
        kind: "diagram",
        id: "roadmap",
        candidateScore: 88
      },
      readiness: {
        status: "applied-plugin-motif-ready",
        targetMotifs: ["arc-arrow"],
        appliedMotifReadyAssets: 1
      },
      localAssets: [{
        id: "officeplus-applied-roadmap",
        provider: "officeplus",
        path: "C:\\OfficePLUS\\roadmap-applied.pptx",
        name: "roadmap-applied.pptx",
        assetKind: "presentation-template",
        roleTags: ["applied-component", "template-layout"],
        reusePolicy: "inspect-openxml-applied-plugin-component",
        matchScore: 120,
        selfFidelityPromoted: true,
        selfFidelity: {
          provider: "component-self-fidelity-promotion-v1",
          passed: true,
          sha256: "a".repeat(64),
          reportFile: "C:\\reports\\roadmap.json",
          comparison: { ok: true, pixelDiffRatio: 0.03, foregroundMissingRatio: 0.08, meanAbsoluteDelta: 5 },
          regionSummary: { regions: 4, passed: 4, maxPixelDiffRatio: 0.04, maxForegroundMissingRatio: 0.1, maxMeanAbsoluteDelta: 7 }
        },
        recommendedComponentGroups: [{
          id: "slide1-group8",
          score: 88,
          matchScore: 88,
          childCount: 4,
          shapeCount: 4,
          pictureCount: 0,
          connectorCount: 0,
          structure: { kind: "process-chain", motifs: ["arc-arrow"] },
          childLayout: {
            provider: "pptx-group-child-layout-v1",
            children: [
              { kind: "shape", box: { x: 0.05, y: 0.16, w: 0.18, h: 0.28 }, style: { fill: "#185ABD", stroke: "none", shapeType: "roundRect", text: { placeholderText: "阶段一", color: "#FFFFFF", fontSizePt: 15, weight: "bold" } } },
              { kind: "shape", box: { x: 0.30, y: 0.16, w: 0.18, h: 0.28 }, style: { fill: "#09BF5D", stroke: "#FFFFFF", strokeWidthPt: 1, shapeType: "rect" } },
              { kind: "shape", box: { x: 0.55, y: 0.16, w: 0.18, h: 0.28 }, style: { fill: "#F59E0B", stroke: "#FFFFFF", strokeWidthPt: 1, shapeType: "ellipse" } },
              { kind: "shape", box: { x: 0.80, y: 0.16, w: 0.14, h: 0.28 }, style: { fill: "#EF4444", stroke: "#FFFFFF", strokeWidthPt: 1, shapeType: "diamond" } }
            ]
          }
        }]
      }]
    }]
  });

  const pseudo = componentAssetLayerPseudoImages(0, index);
  const shapes = createComponentTemplateNativeShapes(pseudo, { widthPt: 960, heightPt: 540 }, { minScore: 58 });

  assert.equal(pseudo.length, 1);
  assert.equal(pseudo[0].source.componentAssetReadiness.status, "applied-plugin-motif-ready");
  assert.equal(pseudo[0].source.componentLocalAssets[0].selfFidelityPromoted, true);
  assert.equal(pseudo[0].source.componentLocalAssets[0].selfFidelity.sha256, "a".repeat(64));
  assert.equal(pseudo[0].source.componentLocalAssets[0].selfFidelity.comparison.pixelDiffRatio, 0.03);
  assert.deepEqual(pseudo[0].source.componentAssetReadiness.targetMotifs, ["arc-arrow"]);
  assert.equal(pseudo[0].source.componentLocalAssets[0].recommendedComponentGroups[0].childLayout.children[0].style.fill, "#185ABD");
  assert.equal(shapes.length, 4);
  assert.deepEqual(shapes.map((shape) => shape.style.fill), ["#185ABD", "#09BF5D", "#F59E0B", "#EF4444"]);
  assert.deepEqual(shapes.map((shape) => shape.type), ["roundRect", "rect", "ellipse", "diamond"]);
  assert.ok(shapes.every((shape) => shape.source.appliedPluginDirectReplay === true));
  assert.ok(shapes.every((shape) => shape.source.matchedComponentAssetMotifReady === true));
  assert.ok(shapes.every((shape) => shape.source.matchedComponentTargetMotifs.includes("arc-arrow")));
  assert.equal(pseudo[0].source.componentTemplateAssetMotifReady, true);
  assert.ok(pseudo[0].source.componentTemplateTargetMotifs.includes("arc-arrow"));
  assert.ok(pseudo[0].source.componentTemplateTargetMotifs.includes("linear-arrow-chain"));
  assert.equal(shapes[0].source.layerSourceId, "p1-officeplus-roadmap");
});

test("component template native replay prefers applied assets matching the ready target motif", () => {
  const index = buildComponentAssetIndex({
    layers: [{
      pageIndex: 0,
      imageIndex: null,
      shapeLayerId: "p1-cycle",
      layerKey: "0:shape:p1-cycle",
      box: { x: 100, y: 100, w: 360, h: 180 },
      layerType: "diagram-zone",
      detector: "component-asset-layer",
      templateFamily: "cycle-loop",
      strategyMode: "plugin-component-template",
      remoteCandidate: { sourceProvider: "islide", kind: "smartdiagram", id: "cycle", candidateScore: 88 },
      readiness: {
        status: "applied-plugin-motif-ready",
        targetMotifs: ["arc-arrow"],
        appliedMotifReadyAssets: 1
      },
      localAssets: [
        appliedAsset("radial", "#EF4444", 90, "radial-link"),
        appliedAsset("arc", "#185ABD", 88, "arc-arrow")
      ]
    }]
  });

  const pseudo = componentAssetLayerPseudoImages(0, index);
  const shapes = createComponentTemplateNativeShapes(pseudo, { widthPt: 960, heightPt: 540 }, { minScore: 58 });

  assert.equal(pseudo[0].source.componentTemplateGroupId, "arc-group");
  assert.equal(pseudo[0].source.componentTemplateAssetMotifReady, true);
  assert.ok(shapes.length > 0);
  assert.ok(shapes.every((shape) => shape.source.matchedComponentGroupId === "arc-group"));
  assert.ok(shapes.every((shape) => shape.source.matchedComponentAssetMotifReady === true));
  assert.ok(shapes.every((shape) => shape.source.matchedComponentTargetMotifs.includes("arc-arrow")));
});

test("component asset pseudo images are only created for native shape layers", () => {
  const index = buildComponentAssetIndex({
    layers: [{
      pageIndex: 0,
      imageIndex: 0,
      layerKey: "0:0",
      box: { x: 0, y: 400, w: 960, h: 80 },
      layerType: "value-banner-zone",
      detector: "saturated-diagram-bottom-banner-crop",
      templateFamily: "grid-or-matrix",
      readiness: { status: "local-template-learning-ready" },
      localAssets: [{ provider: "officeplus", recommendedComponentGroups: [{ id: "slide1-group1", score: 80 }] }]
    }]
  });

  assert.equal(componentAssetLayerPseudoImages(0, index).length, 0);
});

function appliedAsset(id, fill, score, motif) {
  return {
    id: `asset-${id}`,
    provider: "islide",
    path: `C:\\iSlide\\${id}.pptx`,
    name: `${id}.pptx`,
    assetKind: "presentation-template",
    roleTags: ["applied-component", "template-layout"],
    reusePolicy: "inspect-openxml-applied-plugin-component",
    matchScore: 120,
    learningSummary: {
      componentCatalog: [{
        id: `${id}-catalog`,
        structure: { kind: "cycle-loop", motifs: [motif] },
        reuseReadiness: { level: "high", score }
      }]
    },
    recommendedComponentGroups: [{
      id: `${id}-group`,
      score,
      matchScore: score,
      childCount: 1,
      shapeCount: 1,
      pictureCount: 0,
      connectorCount: 0,
      structure: { kind: "cycle-loop", motifs: [motif] },
      reuseReadiness: { level: "high", score },
      childLayout: {
        provider: "pptx-group-child-layout-v1",
        children: [
          { kind: "shape", box: { x: 0.1, y: 0.2, w: 0.25, h: 0.3 }, style: { fill, stroke: "none", shapeType: "roundRect" } }
        ]
      }
    }]
  };
}

test("diagram text merge keeps pre component replacement labels without duplicating them", () => {
  const shared = {
    text: "结构化标准",
    box: { x: 318.2, y: 221.1, w: 80.4, h: 18.2 },
    source: { detector: "saturated-diagram-native-visible-label", role: "loop-node-label" }
  };
  const unique = {
    text: "DOM语义",
    box: { x: 512, y: 221, w: 70, h: 18 },
    source: { detector: "saturated-diagram-native-visible-label", role: "loop-node-label" }
  };

  const merged = mergeDiagramTextBoxes([
    shared,
    { ...shared, box: { ...shared.box } },
    unique,
    null
  ]);

  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((item) => item.text), ["结构化标准", "DOM语义"]);
});

test("component template fallback keeps semantic cycle labels editable", () => {
  const image = {
    id: "native-graphic-saturated-diagram-underlay",
    box: { x: 80, y: 140, w: 820, h: 300 },
    source: { detector: "saturated-diagram-graphic-underlay-crop" }
  };
  const labels = [
    ["痛点", 105, 220],
    ["解决方案", 780, 220],
    ["结构化标准", 320, 220],
    ["DOM语义", 600, 220],
    ["自动生成操作手册", 320, 335],
    ["交互原型", 600, 335]
  ].map(([text, x, y]) => ({
    text,
    box: { x, y, w: 90, h: 20 },
    font: { color: "#111111" },
    source: {}
  }));

  const fallback = collectComponentTemplateFallbackDiagramTextBoxes([image], labels);

  assert.equal(fallback.length, 6);
  assert.equal(fallback[0].source.detector, "saturated-diagram-native-visible-label");
  assert.equal(fallback.some((item) => item.text === "结构化标准"), true);
  assert.equal(fallback.some((item) => item.source.role === "side-heading"), true);
});

test("plugin component strategy does not block high-confidence semantic cycle rebuilds", () => {
  const image = {
    id: "native-graphic-saturated-diagram-underlay",
    box: { x: 80, y: 140, w: 820, h: 300 },
    source: {
      detector: "saturated-diagram-graphic-underlay-crop",
      componentRenderStrategy: { mode: "plugin-component-template" }
    }
  };
  const labels = [
    ["痛点", 105, 220],
    ["解决方案", 780, 220],
    ["结构化标准", 320, 220],
    ["DOM语义", 600, 220],
    ["自动生成操作手册", 320, 335],
    ["交互原型", 600, 335]
  ].map(([text, x, y]) => ({ text, box: { x, y, w: 90, h: 20 } }));
  const pseudoInputs = [{
    id: "component-asset-layer-0-0",
    box: { x: 90, y: 150, w: 780, h: 260 },
    source: { detector: "component-asset-layer" }
  }];

  assert.equal(shouldAllowSpecializedNativeRebuildForDeferredComponent(image, labels), true);
  assert.equal(filterComponentTemplateShapeLayerInputs(pseudoInputs, [{
    ...image,
    source: { ...image.source, semanticCycleDiagramObjectified: true }
  }]).length, 0);
});

test("specialized native rebuilds suppress stale plugin template shells for the same source layer", () => {
  const componentShapes = [
    { source: { detector: "plugin-component-template-native-shape", layerSourceId: "matrix-layer" } },
    { source: { detector: "plugin-component-template-native-shape", layerSourceId: "other-layer" } },
    { source: { detector: "semantic-cycle-native-ring", layerSourceId: "matrix-layer" } }
  ];
  const specialized = [{
    shapes: [{ source: { detector: "skills-engine-ai-comparison-native-grid-line", layerSourceId: "matrix-layer" } }]
  }];

  const retained = suppressComponentTemplateShapesForSpecializedLayers(componentShapes, specialized);

  assert.equal(retained.length, 2);
  assert.equal(retained.some((shape) => shape.source.detector === "plugin-component-template-native-shape" && shape.source.layerSourceId === "matrix-layer"), false);
  assert.equal(retained.some((shape) => shape.source.layerSourceId === "other-layer"), true);
  assert.equal(retained.some((shape) => shape.source.detector === "semantic-cycle-native-ring"), true);
});

test("specialized native text suppression keeps labels outside the rebuilt region", () => {
  const textBoxes = [
    { text: "标题", box: { x: 40, y: 40, w: 300, h: 30 } },
    { text: "矩阵内旧OCR", box: { x: 100, y: 180, w: 140, h: 24 } }
  ];
  const specialized = [{
    shapes: [{ box: { x: 80, y: 120, w: 760, h: 340 }, source: { layerSourceId: "matrix" } }]
  }];

  const retained = filterTextBoxesOutsideSpecializedNativeObjects(textBoxes, specialized);

  assert.deepEqual(retained.map((item) => item.text), ["标题"]);
});

test("specialized native text suppression honors explicit coverage boxes", () => {
  const textBoxes = [
    { text: "标题", box: { x: 40, y: 40, w: 300, h: 30 } },
    { text: "矩阵左列旧OCR", box: { x: 70, y: 230, w: 120, h: 24 } }
  ];
  const specialized = [{
    coverageBox: { x: 60, y: 120, w: 820, h: 360 },
    shapes: [{ box: { x: 420, y: 140, w: 300, h: 300 }, source: { layerSourceId: "matrix" } }]
  }];

  const retained = filterTextBoxesOutsideSpecializedNativeObjects(textBoxes, specialized);

  assert.deepEqual(retained.map((item) => item.text), ["标题"]);
});

test("component template backfilled text suppresses the consumed source text box", () => {
  const textBoxes = [
    { id: "ocr-title", text: "策略洞察", box: { x: 120, y: 90, w: 180, h: 28 } },
    { id: "ocr-body", text: "保留说明", box: { x: 120, y: 130, w: 240, h: 32 } }
  ];
  const componentTemplateTextBoxes = [{
    text: "策略洞察",
    box: { x: 118, y: 88, w: 184, h: 30 },
    source: {
      pluginPlaceholderTextBackfilled: true,
      pluginTextBackfillSourceId: "ocr-title"
    }
  }];

  const retained = filterTextBoxesConsumedByComponentTemplateBackfill(textBoxes, componentTemplateTextBoxes);

  assert.deepEqual(retained.map((item) => item.id), ["ocr-body"]);
});

test("component template text suppression ignores non-backfilled template text", () => {
  const textBoxes = [
    { id: "ocr-title", text: "策略洞察", box: { x: 120, y: 90, w: 180, h: 28 } }
  ];
  const componentTemplateTextBoxes = [{
    text: "策略洞察",
    source: {
      pluginPlaceholderTextBackfilled: false,
      pluginTextBackfillSourceId: "ocr-title"
    }
  }];

  const retained = filterTextBoxesConsumedByComponentTemplateBackfill(textBoxes, componentTemplateTextBoxes);

  assert.deepEqual(retained.map((item) => item.id), ["ocr-title"]);
});

test("stable text box dedupe removes duplicate OCR ids after final merge", () => {
  const textBoxes = [
    { id: "p4-ocr-003", text: "会议纪要", box: { x: 95, y: 188, w: 76, h: 20 } },
    { id: "native-bound", text: "业务目标", box: { x: 560, y: 135, w: 360, h: 30 } },
    { id: "p4-ocr-003", text: "会议纪要", box: { x: 95, y: 188, w: 76, h: 20 } },
    { text: "无 id 保留", box: { x: 10, y: 10, w: 20, h: 20 } }
  ];

  const retained = dedupeTextBoxesByStableId(textBoxes);

  assert.deepEqual(retained.map((item) => item.id || item.text), ["p4-ocr-003", "native-bound", "无 id 保留"]);
});
