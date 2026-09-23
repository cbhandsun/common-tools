"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createProductBrainVisionObjects,
  prepareSystemMapTopologyProbe,
  protectUnreadableSystemMapFidelityCrop,
  shouldAllowSpecializedNativeRebuildForDeferredComponent
} = require("../packages/slideclone-native-engine/scripts/rebuild-real-pptx-native");

test("product brain vision does not claim system-map fidelity pages", () => {
  const page = {
    textBoxes: [
      { text: "终极远景：构建企业级「数字化产品大脑」", box: { x: 181, y: 26, w: 576, h: 31 } },
      { text: "多域聚合：一站式查阅全公司产品版图与系统血缘关系。", box: { x: 35, y: 463, w: 220, h: 38 } },
      { text: "产品版图（System Map）", box: { x: 404, y: 121, w: 165, h: 19 } }
    ],
    images: [{
      id: "system-map-source",
      type: "fidelity-crop",
      box: { x: 34.49, y: 87.38, w: 887.28, h: 379.13 },
      source: {
        detector: "screenshot-process-underlay-crop",
        reason: "screenshot-like-process-illustration-preserved-as-local-crop"
      }
    }]
  };

  const objects = createProductBrainVisionObjects(page, { widthPt: 960, heightPt: 540 }, {
    allowHeuristicProductBrainVision: true
  });

  assert.deepEqual(objects, { shapes: [], textBoxes: [] });
  assert.equal(page.images[0].source.productBrainVisionObjectified, undefined);
});

test("deferred fidelity-first triangle topology can still enter the specialized rebuilder", () => {
  const image = {
    id: "triangle-deferred",
    box: { x: 296.13, y: 108.38, w: 369.61, h: 329.25 },
    source: {
      detector: "foreground-graphic-crop",
      pageText: "核心综合：原型、PRD与评审的“铁三角”拓扑 智能评审 PRD 文档 Review 辅以描述推导PRD 并非线性单向，而是通过可视化确立意图，通过文档补全规则，最终通过智能评审强制拉齐三者的一致性。",
      layer: {
        layerType: "diagram-zone",
        recommendedAction: "preserve-local-crop"
      },
      componentRenderStrategy: {
        mode: "preserve-local-crop",
        implementationMode: "native-generator-safe-fallback"
      },
      expressionForm: "complex-diagram",
      expressionSubtype: "dense-complex-diagram",
      recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident"
    }
  };
  const textBoxes = [
    { text: "核心综合：原型、PRD与评审的“铁三角”拓扑", box: { x: 50.98, y: 35.63, w: 554.78, h: 22.88 } },
    { text: "智能评审", box: { x: 216.67, y: 378, w: 104, h: 21 } },
    { text: "PRD", box: { x: 672.86, y: 379.13, w: 37.86, h: 18.75 } },
    { text: "文档", box: { x: 671.74, y: 397.88, w: 40.11, h: 24 } },
    { text: "Review", box: { x: 220.79, y: 402, w: 64.85, h: 17.63 } },
    { text: "辅以描述推导PRD", box: { x: 413.84, y: 432.75, w: 131.95, h: 16.88 } },
    { text: "并非线性单向，而是通过可视化确立意图，通过文档补全规则，最终通过智能评审强制拉齐三者的一致性。", box: { x: 60.73, y: 481.13, w: 828.05, h: 16.88 } }
  ];

  assert.equal(shouldAllowSpecializedNativeRebuildForDeferredComponent(image, textBoxes), true);
});

test("non-deferred triangle topology stays out of automatic specialized rebuild", () => {
  const image = {
    id: "triangle-standard",
    box: { x: 296.13, y: 108.38, w: 369.61, h: 329.25 },
    source: {
      detector: "foreground-graphic-crop",
      pageText: "核心综合：原型、PRD与评审的“铁三角”拓扑 智能评审 PRD 文档 Review",
      layer: { layerType: "diagram-zone" },
      expressionForm: "complex-diagram",
      expressionSubtype: "dense-complex-diagram"
    }
  };
  const textBoxes = [
    { text: "核心综合：原型、PRD与评审的“铁三角”拓扑", box: { x: 50.98, y: 35.63, w: 554.78, h: 22.88 } },
    { text: "智能评审", box: { x: 216.67, y: 378, w: 104, h: 21 } },
    { text: "PRD", box: { x: 672.86, y: 379.13, w: 37.86, h: 18.75 } },
    { text: "文档", box: { x: 671.74, y: 397.88, w: 40.11, h: 24 } },
    { text: "Review", box: { x: 220.79, y: 402, w: 64.85, h: 17.63 } }
  ];

  assert.equal(shouldAllowSpecializedNativeRebuildForDeferredComponent(image, textBoxes), false);
});

test("full-slide system-map probes preserve the complete fidelity unit", () => {
  const sourceImage = { width: 960, height: 540, rgba: Buffer.alloc(960 * 540 * 4, 255) };
  const drawBlueRect = (x, y, w, h) => {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        const offset = (yy * sourceImage.width + xx) * 4;
        sourceImage.rgba[offset] = 18;
        sourceImage.rgba[offset + 1] = 108;
        sourceImage.rgba[offset + 2] = 180;
        sourceImage.rgba[offset + 3] = 255;
      }
    }
  };
  const drawBlueLine = (x1, y1, x2, y2) => {
    if (y1 === y2) drawBlueRect(Math.min(x1, x2), y1, Math.abs(x2 - x1) + 1, 3);
    else drawBlueRect(x1, Math.min(y1, y2), 3, Math.abs(y2 - y1) + 1);
  };
  for (const x of [365, 420, 475, 530, 585, 640]) {
    for (const y of [190, 240, 290, 340, 390]) drawBlueRect(x - 7, y - 7, 14, 14);
    drawBlueLine(x, 190, x, 390);
  }
  for (const y of [190, 240, 290, 340, 390]) drawBlueLine(365, y, 640, y);

  const page = {
    images: [{
      id: "legacy-system-map-underlay",
      box: { x: 27, y: 82, w: 906, h: 392 },
      source: { detector: "screenshot-process-underlay-crop" }
    }]
  };
  const textBoxes = [
    { text: "终局视野：生生不息的企业级数字化产品大脑", box: { x: 31, y: 34, w: 460, h: 35 } },
    { text: "产品版图（System Map）", box: { x: 404, y: 121, w: 165, h: 19 } }
  ];

  const automaticPromotion = prepareSystemMapTopologyProbe(page, textBoxes, { widthPt: 960, heightPt: 540 }, { sourceImage });
  const protectedCrop = protectUnreadableSystemMapFidelityCrop(page, textBoxes, { widthPt: 960, heightPt: 540 }, { sourceImage });

  assert.equal(automaticPromotion, true);
  assert.equal(protectedCrop, true);
  assert.equal(page.images[0].source.systemMapFidelityProtected, true);
  assert.equal(page.images[0].source.systemMapSyntheticSourceCandidate, true);
  assert.equal(page.images[0].source.systemMapReconstructionReasonCode, "system-map.promoted-full-slide-source-preserved");
  assert.equal(page.images[0].source.detector, "system-map-fidelity-crop");
  assert.deepEqual(page.images.map((image) => image.source.detector), ["system-map-fidelity-crop"]);
  assert.ok(page.images[0].box.w < 960);
  assert.ok(page.images[0].source.systemMapTopologyProbeNodeCount >= 24);
  assert.ok(page.images[0].source.systemMapTopologyProbeEdgeCount >= 32);
});
