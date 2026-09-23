"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { buildPageNativeGraphicsStage } = require("../packages/slideclone-core/page-native-graphics-stage");

function baseDependencies(overrides = {}) {
  return {
    syncObjectifiedCandidateSources() {},
    syncPrdGenerationMinimumUnitBoxes() {},
    applyPrototypeValidationScreenshotPolicy() {},
    syncPrototypeValidationCandidateSources() {},
    hasSpecializedComparisonSkeletonCandidate: () => false,
    shouldAutoObjectifyEntropyIsland: () => false,
    createEntropyChallengeAnnotationObjects: () => ({ shapes: [], textBoxes: [] }),
    createEntropyChallengeFooterBulletShapes: () => [],
    ...overrides
  };
}

test("native graphics stage recovers deferred triangle topology candidates from page draft", () => {
  const triangleImage = {
    id: "triangle-crop",
    box: { x: 296.13, y: 108.38, w: 369.61, h: 329.25 },
    source: {
      detector: "foreground-graphic-crop",
      layer: {
        layerType: "diagram-zone",
        diagramUnderstanding: {
          evidence: { nativeGeometryUnverified: true }
        }
      }
    }
  };
  const seenCandidateCounts = [];
  const result = buildPageNativeGraphicsStage({
    image: { width: 1, height: 1, rgba: Buffer.alloc(4) },
    options: { objectifyLayerConnectors: false },
    pageDraft: { images: [triangleImage], shapes: [], textBoxes: [] },
    nativeTextBoxes: [],
    slideSize: { widthPt: 960, heightPt: 540 },
    decorativeBackground: [{ id: "background" }],
    nativeRebuildCandidateImages: [],
    rawTextBoxes: [{ text: "铁三角 PRD Review 原型 可视化 基线", box: { x: 0, y: 0, w: 100, h: 20 } }],
    textBoxes: [],
    pageIndex: 0,
    specializedNativeEligiblePageDraft: () => ({ images: [] }),
    specializedNativeEligibleImages: () => [],
    autoObjectifySystemMap: false,
    autoObjectifyTriangleTopology: false,
    unreadableSystemMapFidelityProtected: false
  }, baseDependencies({
    createTriangleTopologyDiagramShapes(images) {
      seenCandidateCounts.push(images.length);
      assert.equal(images[0], triangleImage);
      triangleImage.source.triangleTopologyObjectified = true;
      return [{
        id: "triangle-native-edge",
        type: "line",
        box: { x: 0, y: 0, w: 10, h: 10 },
        source: { detector: "triangle-topology-native-edge" }
      }];
    },
    syncObjectifiedCandidateSources(images, candidates, options) {
      if (!options.objectifiedFlags.includes("triangleTopologyObjectified")) return;
      assert.equal(images[0], triangleImage);
      assert.equal(candidates[0], triangleImage);
      assert.deepEqual(options.objectifiedFlags, ["triangleTopologyObjectified"]);
      assert.equal(options.dropResidual, true);
    }
  }));

  assert.deepEqual(seenCandidateCounts, [1]);
  assert.equal(result.triangleTopologyShapes.length, 1);
  assert.equal(result.nativeRebuildCandidateImages.length, 0);
});
