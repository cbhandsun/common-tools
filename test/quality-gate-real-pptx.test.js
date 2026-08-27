"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  alignRenderedPageIndexesToIr,
  appendBoundedOutput,
  assessPageQuality,
  assessPages,
  boundedHeartbeatMs,
  countRenderedPages,
  createRenderCacheIdentity,
  collectTextOverlayRisks,
  findRenderDirsByIdentity,
  findRenderDirsByPrefix,
  findRenderDirsFromQualityReports,
  hydrateSourceImages,
  normalizeRenderer,
  parsePageIndexes,
  parseRendererReport,
  readRenderedPages,
  readRenderCacheMetadata,
  readReconstructionBudgetConfig,
  readTextOcrConfig,
  resolveRenderOutputDir,
  readThresholds,
  readUmiOcrConfig,
  resolveReusableRenderDir,
  reusableRenderMatches,
  sanitizeRendererError,
  selectRendererForIr,
  summarizeComparedDeckMetrics,
  summarizeComponentTemplateCropStatus,
  summarizeEditabilityProfile,
  countLogicalNativeShapes,
  countLogicalNativeTextBoxes,
  summarizeNativeComponentProfile,
  summarizeVisualUnitDecisionProfile,
  summarizeQualityGateStatus,
  summarizePages,
  summarizeRasterImages,
  writeRenderCacheMetadata
} = require("../skills/pd-hifi-slideclone/scripts/quality-gate-real-pptx");

test("decorative backgrounds with native text require a verified text-free band", () => {
  const image = {
    id: "cover-underlay",
    type: "fidelity-background",
    box: { x: 0, y: 0, w: 960, h: 540 },
    source: { detector: "decorative-cover-background-underlay", expressionForm: "decorative-cover-visual" }
  };
  const textBoxes = [{ box: { x: 140, y: 320, w: 620, h: 55 }, source: {} }];

  const risks = collectTextOverlayRisks({ images: [image], textBoxes });
  assert.equal(risks.length, 1);
  assert.equal(risks[0].textBoxes, 1);
  assert.match(risks[0].reason, /text-free-band/);

  image.source.textFreeBandSplit = true;
  image.box = { x: 0, y: 0, w: 960, h: 300 };
  assert.deepEqual(collectTextOverlayRisks({ images: [image], textBoxes }), []);

  image.box = { x: 0, y: 0, w: 960, h: 540 };
  const staleSplitRisks = collectTextOverlayRisks({ images: [image], textBoxes });
  assert.equal(staleSplitRisks.length, 1);
  assert.equal(staleSplitRisks[0].reason, "verified-text-free-band-overlaps-native-text");

  // Even a shallow overlap can reveal raster glyphs under the editable title.
  image.box = { x: 0, y: 0, w: 960, h: 320 };
  textBoxes[0].box = { x: 140, y: 319, w: 620, h: 55 };
  const edgeOverlapRisks = collectTextOverlayRisks({ images: [image], textBoxes });
  assert.equal(edgeOverlapRisks.length, 1);
  assert.equal(edgeOverlapRisks[0].textBoxes, 1);
  assert.equal(edgeOverlapRisks[0].reason, "verified-text-free-band-overlaps-native-text");

  // A 1pt gap is not enough: crop antialiasing can still leave a visible
  // ghost edge beneath the native title even though rectangles do not overlap.
  image.box = { x: 0, y: 0, w: 960, h: 318 };
  textBoxes[0].box = { x: 140, y: 319, w: 620, h: 55 };
  const nearMissRisks = collectTextOverlayRisks({ images: [image], textBoxes });
  assert.equal(nearMissRisks.length, 1);
  assert.equal(nearMissRisks[0].textBoxes, 1);
  assert.equal(nearMissRisks[0].reason, "verified-text-free-band-too-close-to-native-text");

  image.box = { x: 0, y: 0, w: 960, h: 300 };
  textBoxes[0].box = { x: 140, y: 320, w: 620, h: 55 };
  assert.deepEqual(collectTextOverlayRisks({ images: [image], textBoxes }), []);
});

test("renderer heartbeat and output boundaries reject malformed external values", () => {
  assert.equal(boundedHeartbeatMs(undefined), 10_000);
  assert.equal(boundedHeartbeatMs("0"), 0);
  assert.equal(boundedHeartbeatMs("1"), 1_000);
  assert.equal(boundedHeartbeatMs("120000"), 120_000);
  for (const value of ["NaN", -1, 120_001, 1.5]) assert.throws(() => boundedHeartbeatMs(value), /heartbeat-ms/);

  assert.deepEqual(appendBoundedOutput("ab", "cd", 3), { value: "bcd", overflow: true });
  assert.deepEqual(parseRendererReport('{"renderedPages":[]} ', "test"), { renderedPages: [] });
  assert.throws(() => parseRendererReport("not-json", "test"), /invalid JSON/);

  const sanitized = sanitizeRendererError("Bearer abc token=xyz password=hunter2\nfailed");
  assert.doesNotMatch(sanitized, /abc|xyz|hunter2/);
  assert.match(sanitized, /redacted/);
});

test("renderer routing preserves the explicitly selected supported engine", () => {
  assert.deepEqual(selectRendererForIr("powerpoint", { pages: [{ tables: [{ id: "table" }] }] }), {
    requestedRenderer: "powerpoint",
    effectiveRenderer: "powerpoint",
    tableCount: 1,
    mixedImageTextGroupCount: 0,
    largeNoWrapGroupTextCount: 0,
    fallbackApplied: false,
    reason: "requested renderer is compatible with detected IR content"
  });
  assert.equal(selectRendererForIr("powerpoint", { pages: [{ shapes: [] }] }).effectiveRenderer, "powerpoint");
});

test("renderer routing reports mixed native groups without changing engines", () => {
  const selection = selectRendererForIr("powerpoint", { pages: [{
    images: [{ source: { nativeComponentGroupId: "mixed-component" } }],
    textBoxes: [{ source: { nativeComponentGroupId: "mixed-component" } }]
  }] });

  assert.deepEqual(selection, {
    requestedRenderer: "powerpoint",
    effectiveRenderer: "powerpoint",
    tableCount: 0,
    mixedImageTextGroupCount: 1,
    largeNoWrapGroupTextCount: 0,
    fallbackApplied: false,
    reason: "requested renderer is compatible with detected IR content"
  });
});

test("renderer routing reports large no-wrap grouped text without changing engines", () => {
  const ir = { pages: [{ textBoxes: [{
    text: "02",
    wrap: false,
    font: { sizePt: 30 },
    source: { nativeComponentGroupId: "stage-2" }
  }] }] };
  const selection = selectRendererForIr("powerpoint", ir);
  assert.equal(selection.effectiveRenderer, "powerpoint");
  assert.equal(selection.largeNoWrapGroupTextCount, 1);
  assert.equal(selection.fallbackApplied, false);
});

test("summarizeNativeComponentProfile counts semantic groups and fails closed on ungrouped parts", () => {
  const profile = summarizeNativeComponentProfile({
    pages: [{
      pageIndex: 2,
      shapes: [
        { id: "stage-1-top", source: { nativeComponentInstance: true, nativeComponentGroupId: "stage-1", nativeComponentArchetype: "roadmap-stage" } },
        { id: "stage-1-body", source: { nativeComponentInstance: true, nativeComponentGroupId: "stage-1", nativeComponentArchetype: "roadmap-stage" } },
        { id: "orphan", source: { nativeComponentInstance: true, detector: "native-orphan" } }
      ],
      textBoxes: [{ id: "stage-2-text", style: { nativeComponentGroupId: "stage-2" }, source: { nativeComponentArchetype: "roadmap-stage" } }],
      images: [],
      tables: [{ id: "stage-2-table", source: { nativeComponentInstance: true, nativeComponentGroupId: "stage-2", nativeComponentArchetype: "roadmap-stage" } }]
    }]
  });

  assert.equal(profile.groups, 2);
  assert.equal(profile.shapeParts, 2);
  assert.equal(profile.textParts, 1);
  assert.equal(profile.tableParts, 1);
  assert.equal(profile.totalParts, 4);
  assert.equal(profile.ungroupedNativeComponentParts, 1);
  assert.deepEqual(profile.byArchetype, { "roadmap-stage": 4 });
  assert.equal(profile.ungroupedExamples[0].id, "orphan");
});

test("alignRenderedPageIndexesToIr remaps ordinal render pages for sparse page-shard IR", () => {
  const aligned = alignRenderedPageIndexesToIr(
    { provider: "powerpoint", renderedPages: [{ pageIndex: 0, image: "page-1.png" }] },
    { pages: [{ pageIndex: 3, sourceImage: "slide-4.png" }] }
  );

  assert.equal(aligned.renderedPages[0].pageIndex, 3);
  assert.equal(aligned.renderedPages[0].originalRenderedPageIndex, 0);
  assert.equal(aligned.pageIndexAlignment.irPageIndexes[0], 3);
  assert.equal(aligned.pageIndexAlignment.originalRenderedPageIndexes[0], 0);
});

test("render cache reuse is enabled by default and can be disabled explicitly", () => {
  const source = fs.readFileSync(path.join(__dirname, "../skills/pd-hifi-slideclone/scripts/quality-gate-real-pptx.js"), "utf8");
  assert.match(source, /args\["reuse-render"\] \|\| "true"/);
  assert.match(source, /=== "false"\) return null/);
});

test("render cache discovery matches exact package identity across output folders", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-render-identity-"));
  try {
    const renderDir = path.join(tmp, "unrelated-output-name", "render");
    fs.mkdirSync(renderDir, { recursive: true });
    const identity = {
      provider: "slideclone-render-cache-v1",
      packageFingerprint: "abc123",
      renderer: "libreoffice",
      expectedPages: 11,
      dpi: 144
    };
    writeRenderCacheMetadata(renderDir, identity);
    assert.deepEqual(findRenderDirsByIdentity(tmp, identity), [renderDir]);
    assert.deepEqual(findRenderDirsByIdentity(tmp, { ...identity, packageFingerprint: "changed" }), []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("render cache discovery reuses completed renderer iteration directories", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-render-iteration-"));
  try {
    const renderRoot = path.join(tmp, "render-cache");
    const renderDir = path.join(renderRoot, "unrelated-output-name", "render", "iteration-0");
    fs.mkdirSync(renderDir, { recursive: true });
    fs.writeFileSync(path.join(renderDir, "page-1.png"), "");
    const identity = {
      provider: "slideclone-render-cache-v1",
      packageFingerprint: "abc123",
      renderer: "powerpoint",
      expectedPages: 1,
      dpi: 144
    };
    writeRenderCacheMetadata(renderDir, identity);

    assert.deepEqual(findRenderDirsByIdentity(renderRoot, identity), [renderDir]);
    assert.equal(resolveReusableRenderDir({
      args: { "reuse-render": "true", "render-root": renderRoot, "quality-root": path.join(tmp, "missing-quality") },
      outputDir: path.join(tmp, "out"),
      irFile: path.join(tmp, "missing.ir.json"),
      pptxFile: path.join(tmp, "deck.pptx"),
      renderOutputDir: path.join(tmp, "missing-render-out"),
      renderer: "powerpoint",
      cacheIdentity: identity
    }), renderDir);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("alignRenderedPageIndexesToIr keeps already aligned full-deck render pages unchanged", () => {
  const render = {
    renderedPages: [
      { pageIndex: 0, image: "page-1.png" },
      { pageIndex: 1, image: "page-2.png" }
    ]
  };

  assert.equal(alignRenderedPageIndexesToIr(render, { pages: [{ pageIndex: 0 }, { pageIndex: 1 }] }), render);
});

test("alignRenderedPageIndexesToIr avoids unsafe remap when render and IR page counts differ", () => {
  const render = { renderedPages: [{ pageIndex: 0, image: "page-1.png" }] };

  assert.equal(alignRenderedPageIndexesToIr(render, { pages: [{ pageIndex: 3 }, { pageIndex: 4 }] }), render);
});

test("assessPageQuality accepts low-diff pages with no full-page raster", () => {
  const result = assessPageQuality({
    sourceImage: "source.png",
    renderedImage: "rendered.png",
    metrics: { ok: true, pixelDiffRatio: 0.05, foregroundMissingRatio: 0.08 },
    raster: { fullPageImages: 0, imageAreaRatio: 0.1 },
    thresholds: {
      acceptPixelDiffRatio: 0.22,
      acceptForegroundMissingRatio: 0.3,
      reviewPixelDiffRatio: 0.38,
      reviewForegroundMissingRatio: 0.5,
      maxRasterImageAreaRatio: 0.58
    }
  });

  assert.equal(result.status, "accepted");
  assert.deepEqual(result.reasons, []);
});

test("assessPageQuality rejects full-page raster even when visual diff is good", () => {
  const result = assessPageQuality({
    sourceImage: "source.png",
    renderedImage: "rendered.png",
    metrics: { ok: true, pixelDiffRatio: 0.01, foregroundMissingRatio: 0.01 },
    raster: { fullPageImages: 1, imageAreaRatio: 0.99 },
    thresholds: {
      acceptPixelDiffRatio: 0.22,
      acceptForegroundMissingRatio: 0.3,
      reviewPixelDiffRatio: 0.38,
      reviewForegroundMissingRatio: 0.5,
      maxRasterImageAreaRatio: 0.58
    }
  });

  assert.equal(result.status, "rejected");
  assert.ok(result.reasons.includes("contains-full-page-raster-image"));
});

test("assessPageQuality allows explicit decorative full-page background under editable text", () => {
  const result = assessPageQuality({
    sourceImage: "source.png",
    renderedImage: "rendered.png",
    metrics: { ok: true, pixelDiffRatio: 0.01, foregroundMissingRatio: 0.01 },
    raster: {
      fullPageImages: 1,
      allowedFullPageBackgroundImages: 1,
      imageAreaRatio: 0.99,
      maxImageAreaRatio: 0.99,
      maxDisallowedImageAreaRatio: 0
    },
    thresholds: {
      acceptPixelDiffRatio: 0.22,
      acceptForegroundMissingRatio: 0.3,
      reviewPixelDiffRatio: 0.38,
      reviewForegroundMissingRatio: 0.5,
      maxRasterImageAreaRatio: 0.58
    }
  });

  assert.equal(result.status, "accepted");
  assert.deepEqual(result.reasons, []);
});

test("assessPageQuality allows multiple local crops when no single crop is too large", () => {
  const result = assessPageQuality({
    sourceImage: "source.png",
    renderedImage: "rendered.png",
    metrics: { ok: true, pixelDiffRatio: 0.04, foregroundMissingRatio: 0.05 },
    raster: { fullPageImages: 0, imageAreaRatio: 0.8, maxImageAreaRatio: 0.46 },
    thresholds: {
      acceptPixelDiffRatio: 0.22,
      acceptForegroundMissingRatio: 0.3,
      reviewPixelDiffRatio: 0.38,
      reviewForegroundMissingRatio: 0.5,
      maxRasterImageAreaRatio: 0.58
    }
  });

  assert.equal(result.status, "accepted");
});

test("assessPageQuality flags low page-level OCR coverage for review", () => {
  const result = assessPageQuality({
    sourceImage: "source.png",
    renderedImage: "rendered.png",
    metrics: { ok: true, pixelDiffRatio: 0.02, foregroundMissingRatio: 0.04 },
    raster: { fullPageImages: 0, imageAreaRatio: 0.1, maxImageAreaRatio: 0.1 },
    textCoverage: { textCoverage: 0.74 },
    thresholds: {
      acceptPixelDiffRatio: 0.22,
      acceptForegroundMissingRatio: 0.3,
      reviewPixelDiffRatio: 0.38,
      reviewForegroundMissingRatio: 0.5,
      maxRasterImageAreaRatio: 0.58,
      textCoverage: 0.8
    }
  });

  assert.equal(result.status, "needs-review");
  assert.deepEqual(result.reasons, ["text-coverage-too-low"]);
});

test("assessPageQuality ignores OCR coverage when no threshold is configured", () => {
  const result = assessPageQuality({
    sourceImage: "source.png",
    renderedImage: "rendered.png",
    metrics: { ok: true, pixelDiffRatio: 0.02, foregroundMissingRatio: 0.04 },
    raster: { fullPageImages: 0, imageAreaRatio: 0.1, maxImageAreaRatio: 0.1 },
    textCoverage: { textCoverage: 0.1 },
    thresholds: {
      acceptPixelDiffRatio: 0.22,
      acceptForegroundMissingRatio: 0.3,
      reviewPixelDiffRatio: 0.38,
      reviewForegroundMissingRatio: 0.5,
      maxRasterImageAreaRatio: 0.58
    }
  });

  assert.equal(result.status, "accepted");
});

test("summarizeRasterImages detects oversized page images", () => {
  const summary = summarizeRasterImages({
    slideSize: { widthPt: 100, heightPt: 50 },
    pages: [
      {
        pageIndex: 0,
        images: [{ box: { x: 0, y: 0, w: 96, h: 48 } }]
      },
      {
        pageIndex: 1,
        images: [{ box: { x: 10, y: 10, w: 20, h: 10 } }]
      }
    ]
  });

  assert.equal(summary.fullPageImages, 1);
  assert.equal(summary.pages[0].fullPageImages, 1);
  assert.equal(summary.pages[1].fullPageImages, 0);
  assert.equal(summary.pages[0].maxImageAreaRatio, 0.9216);
});

test("summarizeRasterImages treats decorative background underlays as allowed full-page images", () => {
  const summary = summarizeRasterImages({
    slideSize: { widthPt: 100, heightPt: 50 },
    pages: [
      {
        pageIndex: 0,
        images: [{
          type: "fidelity-background",
          box: { x: 0, y: 0, w: 100, h: 50 },
          source: { detector: "decorative-cover-background-underlay" }
        }]
      },
      {
        pageIndex: 1,
        images: [{
          type: "fidelity-background",
          box: { x: 0, y: 0, w: 100, h: 50 },
          source: { detector: "decorative-page-chrome-underlay" }
        }]
      }
    ]
  });

  assert.equal(summary.pages[0].fullPageImages, 1);
  assert.equal(summary.pages[0].allowedFullPageBackgroundImages, 1);
  assert.equal(summary.pages[0].maxDisallowedImageAreaRatio, 0);
  assert.equal(summary.pages[1].fullPageImages, 1);
  assert.equal(summary.pages[1].allowedFullPageBackgroundImages, 1);
  assert.equal(summary.pages[1].maxDisallowedImageAreaRatio, 0);
});

test("summarizeEditabilityProfile explains local crops and full-page raster risk", () => {
  const raster = summarizeRasterImages({
    slideSize: { widthPt: 100, heightPt: 50 },
    pages: [
      {
        pageIndex: 0,
        textBoxes: [{ id: "t0" }],
        images: [{
          id: "img0",
          type: "fidelity-crop",
          box: { x: 10, y: 10, w: 30, h: 20 },
          source: {
            detector: "mixed-diagram-graphic-underlay-crop",
            expressionForm: "complex-diagram",
            expressionSubtype: "saturated-multi-flow-diagram",
            recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident"
          }
        }]
      },
      {
        pageIndex: 1,
        textBoxes: [{ id: "t1" }],
        shapes: [{ id: "s1" }],
        images: [{
          id: "img1",
          box: { x: 0, y: 0, w: 96, h: 48 },
          source: { detector: "unknown-full-page" }
        }]
      }
    ]
  });

  const profile = summarizeEditabilityProfile({
    ir: {
      slideSize: { widthPt: 100, heightPt: 50 },
      pages: [
        {
          pageIndex: 0,
          textBoxes: [{ id: "t0" }],
          images: [{
            id: "img0",
            type: "fidelity-crop",
            box: { x: 10, y: 10, w: 30, h: 20 },
            source: {
              detector: "mixed-diagram-graphic-underlay-crop",
              expressionForm: "complex-diagram",
              expressionSubtype: "saturated-multi-flow-diagram",
              recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident"
            }
          }]
        },
        {
          pageIndex: 1,
          textBoxes: [{ id: "t1" }],
          shapes: [{ id: "s1" }],
          images: [
            {
              id: "img1",
              box: { x: 0, y: 0, w: 96, h: 48 },
              source: { detector: "unknown-full-page" }
            },
            {
              id: "img2",
              type: "fidelity-crop",
              box: { x: 30, y: 8, w: 12, h: 10 },
              source: {
                detector: "component-template-picture-residual-crop",
                expressionForm: "icon-or-illustration",
                expressionSubtype: "component-picture-residual",
                recommendedAction: "keep-local-crop-for-picture-child-only",
                componentTemplateCropSplitIntoResiduals: true
              }
            }
          ]
        }
      ]
    },
    raster
  });

  assert.equal(profile.pages, 2);
  assert.equal(profile.nonEditableImages, 3);
  assert.equal(profile.intentionalRasterImages, 2);
  assert.equal(profile.actionableNonEditableImages, 1);
  assert.equal(profile.actionableEditableObjectRatio, 0.75);
  assert.equal(profile.pagesWithRasterImages, 2);
  assert.equal(profile.fullPageImages, 1);
  assert.equal(profile.disallowedFullPageImages, 1);
  assert.equal(profile.editableObjectRatio, 0.5);
  assert.deepEqual(profile.detectorCounts, {
    "mixed-diagram-graphic-underlay-crop": 1,
    "unknown-full-page": 1,
    "component-template-picture-residual-crop": 1
  });
  assert.deepEqual(profile.intentionalRasterDetectorCounts, {
    "mixed-diagram-graphic-underlay-crop": 1,
    "component-template-picture-residual-crop": 1
  });
  assert.deepEqual(profile.actionableRasterDetectorCounts, {
    "unknown-full-page": 1
  });
  assert.deepEqual(profile.imageExpressionCounts, {
    "complex-diagram": 1,
    "icon-or-illustration": 1,
    "unknown-expression": 1
  });
  assert.deepEqual(profile.imageSubtypeCounts, {
    "saturated-multi-flow-diagram": 1,
    "component-picture-residual": 1,
    "unknown-subtype": 1
  });
  assert.deepEqual(profile.imageRecommendationCounts, {
    "preserve-fidelity-crop-until-subtype-rebuilder-is-confident": 1,
    "keep-local-crop-for-picture-child-only": 1,
    "manual-review-before-native-rebuild": 1
  });
  assert.deepEqual(profile.pagesDetail[0].imageSubtypes, ["saturated-multi-flow-diagram"]);
  assert.deepEqual(profile.pagesDetail[1].imageRecommendations, [
    "manual-review-before-native-rebuild",
    "keep-local-crop-for-picture-child-only"
  ]);
});

test("countLogicalNativeShapes expands only bounded, internally consistent promoted connectors", () => {
  const promoted = {
    source: {
      promotedOrthogonalSegmentCount: 3,
      promotedSegmentIds: ["route-a", "route-b", "route-c"]
    }
  };
  assert.equal(countLogicalNativeShapes([{}, promoted]), 4);
  assert.equal(countLogicalNativeShapes([]), 0);
  assert.equal(countLogicalNativeShapes(null), 0);

  const invalidPromotions = [
    { source: { promotedOrthogonalSegmentCount: 3, promotedSegmentIds: ["a", "b"] } },
    { source: { promotedOrthogonalSegmentCount: 3, promotedSegmentIds: ["a", "a", "c"] } },
    { source: { promotedOrthogonalSegmentCount: 65, promotedSegmentIds: Array.from({ length: 65 }, (_, index) => `s-${index}`) } },
    { source: { promotedOrthogonalSegmentCount: "3", promotedSegmentIds: ["a", "b", "c"] } },
    { source: { promotedOrthogonalSegmentCount: 2, promotedSegmentIds: ["safe", "x".repeat(257)] } }
  ];
  assert.equal(countLogicalNativeShapes(invalidPromotions), invalidPromotions.length);
});

test("countLogicalNativeTextBoxes excludes only labels linked to an existing bounded native shape id", () => {
  const shapes = [{ id: "roadmap-arrow-2" }, { id: "roadmap-flag-wave" }];
  const textBoxes = [
    { text: "regular" },
    { text: "arrow label", source: { embeddedNativeShapeId: "roadmap-arrow-2" } },
    { text: "flag label", source: { embeddedNativeShapeId: "roadmap-flag-wave" } },
    { text: "missing target", source: { embeddedNativeShapeId: "not-present" } },
    { text: "unsafe", source: { embeddedNativeShapeId: "x".repeat(257) } }
  ];
  assert.equal(countLogicalNativeTextBoxes(textBoxes, shapes), 3);
  assert.equal(countLogicalNativeTextBoxes([], shapes), 0);
  assert.equal(countLogicalNativeTextBoxes(null, shapes), 0);
  assert.equal(countLogicalNativeTextBoxes(textBoxes, null), textBoxes.length);
});

test("summarizeEditabilityProfile reports physical and logical native shape counts", () => {
  const profile = summarizeEditabilityProfile({
    ir: {
      slideSize: { widthPt: 960, heightPt: 540 },
      pages: [{
        pageIndex: 0,
        textBoxes: [{}, { source: { embeddedNativeShapeId: "route" } }],
        shapes: [{}, {
          source: {
            promotedOrthogonalSegmentCount: 3,
            promotedSegmentIds: ["a", "b", "c"]
          }
        }, { id: "route" }]
      }]
    },
    raster: { pages: [] }
  });
  assert.equal(profile.physicalShapes, 3);
  assert.equal(profile.logicalShapes, 5);
  assert.equal(profile.physicalTextBoxes, 2);
  assert.equal(profile.logicalTextBoxes, 1);
});

test("summarizeEditabilityProfile treats allowed decorative backgrounds as intentional raster", () => {
  const ir = {
    slideSize: { widthPt: 100, heightPt: 50 },
    pages: [
      {
        pageIndex: 0,
        textBoxes: [{ id: "title" }],
        images: [{
          id: "cover-bg",
          type: "fidelity-background",
          box: { x: 0, y: 0, w: 100, h: 50 },
          source: { detector: "decorative-cover-background-underlay" }
        }]
      }
    ]
  };
  const raster = summarizeRasterImages(ir);
  const profile = summarizeEditabilityProfile({ ir, raster });

  assert.equal(profile.fullPageImages, 1);
  assert.equal(profile.allowedFullPageBackgroundImages, 1);
  assert.equal(profile.disallowedFullPageImages, 0);
  assert.equal(profile.intentionalRasterImages, 1);
  assert.equal(profile.actionableNonEditableImages, 0);
  assert.equal(profile.actionableEditableObjectRatio, 1);
});

test("summarizeEditabilityProfile treats page chrome backgrounds as intentional raster", () => {
  const ir = {
    slideSize: { widthPt: 100, heightPt: 50 },
    pages: [
      {
        pageIndex: 0,
        textBoxes: [{ id: "title" }, { id: "body" }],
        images: [{
          id: "page-chrome",
          type: "fidelity-background",
          box: { x: 0, y: 0, w: 100, h: 50 },
          source: { detector: "decorative-page-chrome-underlay" }
        }]
      }
    ]
  };
  const raster = summarizeRasterImages(ir);
  const profile = summarizeEditabilityProfile({ ir, raster });

  assert.equal(profile.fullPageImages, 1);
  assert.equal(profile.allowedFullPageBackgroundImages, 1);
  assert.equal(profile.disallowedFullPageImages, 0);
  assert.equal(profile.intentionalRasterImages, 1);
  assert.equal(profile.actionableNonEditableImages, 0);
  assert.equal(profile.actionableEditableObjectRatio, 1);
  assert.deepEqual(profile.intentionalRasterDetectorCounts, {
    "decorative-page-chrome-underlay": 1
  });
});

test("summarizeEditabilityProfile treats explicitly preserved brand assets as intentional raster", () => {
  const ir = {
    slideSize: { widthPt: 100, heightPt: 50 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{ id: "title" }],
      images: [{
        id: "brand-strip",
        type: "fidelity-crop",
        box: { x: 25, y: 40, w: 50, h: 8 },
        source: { detector: "decorative-cover-brand-strip", intentionalBrandAsset: true }
      }]
    }]
  };
  const profile = summarizeEditabilityProfile({ ir, raster: summarizeRasterImages(ir) });

  assert.equal(profile.intentionalRasterImages, 1);
  assert.equal(profile.actionableNonEditableImages, 0);
  assert.equal(profile.actionableEditableObjectRatio, 1);
  assert.deepEqual(profile.intentionalRasterDetectorCounts, {
    "decorative-cover-brand-strip": 1
  });
});

test("summarizeVisualUnitDecisionProfile separates protected visual units from actionable crops", () => {
  const profile = summarizeVisualUnitDecisionProfile({
    slideSize: { widthPt: 100, heightPt: 50 },
    pages: [{
      pageIndex: 0,
      shapes: [{
        id: "native-process-node",
        source: {
          detector: "process-node-native-shape",
          expressionForm: "complex-diagram",
          minimumUnitPolicy: "rebuild-semantic-structure"
        }
      }],
      images: [
        {
          id: "plugin-cycle-arrow",
          type: "fidelity-crop",
          box: { x: 10, y: 10, w: 20, h: 15 },
          source: {
            detector: "plugin-cycle-arrow-illustration-crop",
            expressionForm: "icon-or-illustration",
            expressionSubtype: "illustration",
            recommendedAction: "match-icon-library-or-keep-local-crop",
            minimumUnitPolicy: "preserve-obvious-visual-asset-crop",
            expressionPolicy: {
              kind: "standalone-visual-asset",
              unitDisposition: "intentional-visual-crop"
            }
          }
        },
        {
          id: "nested-policy-icon",
          type: "fidelity-crop",
          box: { x: 60, y: 10, w: 10, h: 10 },
          source: {
            detector: "plugin-icon-visual-unit-crop",
            expressionForm: "icon-or-illustration",
            expressionSubtype: "图标图示",
            componentRenderStrategy: {
              mode: "preserve-local-crop",
              expressionPolicy: {
                kind: "standalone-visual-asset",
                minimumUnitPolicy: "preserve-as-single-crop",
                unitDisposition: "intentional-visual-crop"
              }
            }
          }
        },
        {
          id: "semantic-structure-left-as-image",
          type: "image",
          box: { x: 5, y: 5, w: 30, h: 20 },
          source: {
            detector: "process-diagram-underlay-crop",
            expressionForm: "complex-diagram",
            expressionSubtype: "linear-process-diagram",
            recommendedAction: "replace-with-native-components",
            expressionPolicy: {
              kind: "structured-native",
              unitDisposition: "semantic-native-structure"
            }
          }
        },
        {
          id: "unknown-large-crop",
          type: "image",
          box: { x: 0, y: 0, w: 70, h: 40 },
          source: {
            detector: "unknown-full-page",
            expressionForm: "unknown-visual"
          }
        }
      ]
    }]
  });

  assert.equal(profile.nativeStructureCandidates, 1);
  assert.equal(profile.intentionalMinimumUnitCrops, 2);
  assert.equal(profile.actionableUnexplainedCrops, 2);
  assert.deepEqual(profile.byDecision, {
    "native-structure-candidate": 1,
    "intentional-minimum-unit-crop": 2,
    "actionable-unexplained-crop": 2
  });
  assert.deepEqual(profile.byUnitDisposition, {
    "semantic-native-structure": 2,
    "intentional-visual-crop": 2,
    "classification-needed": 1
  });
  assert.equal(profile.examples.find((item) => item.id === "plugin-cycle-arrow").reason, "preserve-obvious-visual-asset-crop");
  assert.equal(profile.examples.find((item) => item.id === "nested-policy-icon").decision, "intentional-minimum-unit-crop");
  assert.equal(profile.examples.find((item) => item.id === "nested-policy-icon").unitDisposition, "intentional-visual-crop");
  assert.equal(profile.examples.find((item) => item.id === "semantic-structure-left-as-image").decision, "actionable-unexplained-crop");
  assert.equal(profile.examples.find((item) => item.id === "semantic-structure-left-as-image").unitDisposition, "semantic-native-structure");
  assert.equal(profile.examples.find((item) => item.id === "unknown-large-crop").decision, "actionable-unexplained-crop");
  assert.equal(profile.examplesByDecision["intentional-minimum-unit-crop"][0].id, "plugin-cycle-arrow");
  assert.equal(profile.examplesByDecision["actionable-unexplained-crop"][0].id, "semantic-structure-left-as-image");
});

test("visual unit profile rejects monolithic process screenshots with almost no editable structure", () => {
  const profile = summarizeVisualUnitDecisionProfile({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 7,
      textBoxes: [{ id: "title", text: "视觉还原与操作同步" }],
      images: [{
        id: "monolithic-process",
        type: "fidelity-crop",
        box: { x: 37, y: 92, w: 885, h: 321 },
        source: {
          detector: "screenshot-process-underlay-crop",
          expressionForm: "screenshot-or-document",
          recommendedAction: "keep-local-crop-and-overlay-external-text-only",
          pageText: "标准 PRD 文本进入形态转换引擎，输出交互原型和操作手册，最后路由到门户展示"
        }
      }]
    }]
  });

  assert.equal(profile.actionableUnexplainedCrops, 1);
  assert.equal(profile.suspiciousMonolithicStructuredCrops, 1);
  assert.equal(profile.pagesDetail[0].suspiciousMonolithicStructuredCrops, 1);
  const crop = profile.examples.find((item) => item.id === "monolithic-process");
  assert.equal(crop.decision, "actionable-unexplained-crop");
  assert.equal(crop.unitDisposition, "semantic-native-structure");
});

test("visual unit profile preserves a genuine large screenshot without process semantics", () => {
  const profile = summarizeVisualUnitDecisionProfile({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      textBoxes: [{ id: "title", text: "Debugger Window" }],
      images: [{
        id: "debugger-screenshot",
        type: "fidelity-crop",
        box: { x: 30, y: 80, w: 880, h: 360 },
        source: {
          detector: "screenshot-process-underlay-crop",
          expressionForm: "screenshot-or-document",
          recommendedAction: "keep-local-crop-and-overlay-external-text-only",
          pageText: "Debugger Window 修复建议 自动补充规则"
        }
      }]
    }]
  });

  assert.equal(profile.suspiciousMonolithicStructuredCrops, 0);
  assert.equal(profile.actionableUnexplainedCrops, 0);
});

test("visual unit profile rejects a component shell layered over an unreplaced process crop", () => {
  const profile = summarizeVisualUnitDecisionProfile({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      shapes: Array.from({ length: 15 }, (_, index) => ({ id: `shell-${index}`, source: { nativeRebuild: true } })),
      textBoxes: [{ id: "title", text: "视觉还原与操作同步" }],
      images: [{
        id: "retained-process-underlay",
        type: "fidelity-crop",
        box: { x: 37, y: 92, w: 885, h: 321 },
        source: {
          detector: "screenshot-process-underlay-crop",
          expressionForm: "screenshot-or-document",
          componentTemplateApplicationMode: "native-shell-over-fidelity-crop",
          componentTemplateCropReplacedByNative: false,
          pageText: "标准 PRD 文本进入形态转换引擎，输出交互原型和操作手册，最后路由到门户展示"
        }
      }]
    }]
  });

  assert.equal(profile.suspiciousMonolithicStructuredCrops, 1);
  assert.equal(profile.actionableUnexplainedCrops, 1);
});

test("component template crop status protects no-decision visual assets", () => {
  const summary = summarizeComponentTemplateCropStatus({
    pages: [{
      pageIndex: 0,
      images: [
        {
          id: "cover-bg",
          box: { x: 0, y: 0, w: 960, h: 540 },
          source: {
            detector: "decorative-cover-background-underlay",
            expressionForm: "decorative-cover-visual",
            expressionSubtype: "cover-decoration",
            recommendedAction: "prefer-native-background-shape-or-keep-local-crop",
            componentTemplateGroupApplied: true,
            componentTemplateCropReplacementReason: "component-template-crop-no-decision"
          }
        },
        {
          id: "ui-shot",
          box: { x: 20, y: 90, w: 800, h: 320 },
          source: {
            detector: "screenshot-process-underlay-crop",
            expressionForm: "screenshot-or-document",
            expressionSubtype: "ui-screenshot",
            recommendedAction: "keep-local-crop-and-overlay-external-text-only",
            componentTemplateGroupApplied: true,
            componentTemplateCropReplacementReason: "component-template-crop-no-decision"
          }
        },
        {
          id: "matrix-underlay",
          box: { x: 40, y: 100, w: 780, h: 280 },
          source: {
            detector: "structured-case-graphic-underlay-crop",
            expressionForm: "complex-diagram",
            expressionSubtype: "structured-case-matrix",
            recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
            componentTemplateGroupApplied: true,
            componentTemplateCropReplacementReason: "component-template-crop-no-decision",
            componentTemplateGroupId: "matrix-group",
            componentTemplateGroupScore: 82,
            componentTemplateFamilyApplied: "matrix",
            componentRenderStrategy: {
              mode: "plugin-component-template",
              targetMotifs: ["card-grid", "linear-arrow-chain"],
              applicationPlan: {
                currentStep: "preserve-source-crop-and-record-component-replacement",
                targetStep: "replace-fidelity-crop-with-editable-plugin-component-after-visual-promotion",
                sourceProvider: "officeplus",
                componentKind: "component",
                componentId: "MatlComponentContent-1906"
              },
              bestCandidate: {
                sourceProvider: "officeplus",
                kind: "component",
                id: "MatlComponentContent-1906",
                title: "渐变风流程箭头元素_6项",
                targetMotifs: ["card-grid"]
              }
            }
          }
        },
        {
          id: "download-gated-matrix",
          box: { x: 50, y: 120, w: 700, h: 260 },
          source: {
            detector: "entropy-challenge-island-crop",
            expressionForm: "table-or-matrix",
            expressionSubtype: "table-grid",
            recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
            componentTemplateGroupApplied: true,
            componentTemplateCropReplacementReason: "component-template-crop-no-decision",
            componentRenderStrategy: {
              mode: "plugin-component-template",
              implementationMode: "auth-or-download-required",
              applicationPlan: {
                currentStep: "preserve-source-crop-and-record-component-replacement",
                targetStep: "replace-fidelity-crop-with-editable-plugin-component-when-download-is-available",
                requiresDownload: true
              }
            }
          }
        }
      ]
    }]
  }, { maxExamples: 6 });

  assert.equal(summary.templateImages, 4);
  assert.equal(summary.protectedRetainedImages, 3);
  assert.equal(summary.actionableRetainedImages, 1);
  assert.equal(summary.protectedByReason["component-template-crop-no-decision"], 3);
  assert.equal(summary.actionableByReason["component-template-crop-no-decision"], 1);
  assert.equal(summary.examples.find((item) => item.imageId === "cover-bg").retainedActionable, false);
  assert.equal(summary.examples.find((item) => item.imageId === "ui-shot").retainedActionable, false);
  assert.equal(summary.examples.find((item) => item.imageId === "download-gated-matrix").retainedActionable, false);
  assert.equal(summary.examples.find((item) => item.imageId === "matrix-underlay").retainedActionable, true);
  assert.equal(summary.repairCandidates.length, 1);
  assert.deepEqual(summary.repairCandidates[0], {
    pageIndex: 0,
    imageId: "matrix-underlay",
    detector: "structured-case-graphic-underlay-crop",
    reason: "component-template-crop-no-decision",
    priority: 100,
    expressionForm: "complex-diagram",
    expressionSubtype: "structured-case-matrix",
    layerType: "unknown-layer",
    recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
    family: "matrix",
    componentGroupId: "matrix-group",
    componentGroupScore: 82,
    sourceProvider: "officeplus",
    componentKind: "component",
    componentId: "MatlComponentContent-1906",
    componentTitle: "渐变风流程箭头元素_6项",
    targetMotifs: ["card-grid", "linear-arrow-chain"],
    currentStep: "preserve-source-crop-and-record-component-replacement",
    targetStep: "replace-fidelity-crop-with-editable-plugin-component-after-visual-promotion",
    requiresDownload: false,
    box: { x: 40, y: 100, w: 780, h: 280 },
    areaRatio: 0.4213
  });
});

test("summarizeEditabilityProfile reports editable text over preserved crop risk", () => {
  const ir = {
    slideSize: { widthPt: 100, heightPt: 50 },
    pages: [{
      pageIndex: 0,
      textBoxes: [
        { id: "t1", box: { x: 15, y: 15, w: 10, h: 4 } },
        { id: "t2", box: { x: 30, y: 16, w: 10, h: 4 } },
        { id: "t3", box: { x: 45, y: 17, w: 10, h: 4 } },
        { id: "t4", box: { x: 60, y: 18, w: 10, h: 4 } },
        { id: "outside", box: { x: 92, y: 42, w: 6, h: 4 } }
      ],
      images: [{
        id: "diagram-crop",
        type: "fidelity-crop",
        box: { x: 10, y: 8, w: 78, h: 28 },
        source: {
          detector: "wms-chain-underlay-crop",
          expressionForm: "complex-diagram",
          expressionSubtype: "route-chain-diagram",
          recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident"
        }
      }]
    }]
  };

  const profile = summarizeEditabilityProfile({ ir, raster: summarizeRasterImages(ir) });

  assert.equal(profile.textOverlayRiskBoxes, 4);
  assert.equal(profile.textOverlayRiskImages, 1);
  assert.equal(profile.pagesWithTextOverlayRisk, 1);
  assert.deepEqual(profile.textOverlayRiskSubtypeCounts, {
    "route-chain-diagram": 1
  });
  assert.deepEqual(profile.textOverlayRiskRecommendationCounts, {
    "preserve-fidelity-crop-until-subtype-rebuilder-is-confident": 1
  });
  assert.equal(profile.pagesDetail[0].textOverlayRisks[0].textBoxes, 4);
  assert.equal(profile.pagesDetail[0].textOverlayRisks[0].areaRatio, 0.4368);
});

test("summarizeEditabilityProfile allows decorative background text only after a verified text-free split", () => {
  const makePage = (pageIndex, image) => ({
    pageIndex,
    textBoxes: Array.from({ length: 4 }, (_, index) => ({
      id: `text-${pageIndex}-${index}`,
      box: { x: 10 + index * 20, y: 15, w: 15, h: 5 }
    })),
    images: [image]
  });
  const ir = {
    slideSize: { widthPt: 100, heightPt: 50 },
    pages: [
      makePage(0, {
        id: "decorative-background",
        type: "fidelity-background",
        // Keep a real 12pt+ text-free gap before the first editable text box.
        box: { x: 0, y: 0, w: 100, h: 2 },
        source: {
          detector: "decorative-page-chrome-underlay",
          expressionForm: "icon-or-illustration",
          recommendedAction: "match-icon-library-or-keep-local-crop",
          textFreeBandSplit: true
        }
      }),
      makePage(1, {
        id: "unknown-full-page",
        type: "fidelity-crop",
        box: { x: 0, y: 0, w: 100, h: 50 },
        source: {
          detector: "unknown-full-page",
          expressionForm: "unknown",
          recommendedAction: "keep-local-crop"
        }
      })
    ]
  };

  const profile = summarizeEditabilityProfile({ ir, raster: summarizeRasterImages(ir) });

  assert.equal(profile.pagesDetail[0].textOverlayRiskBoxes, 0);
  assert.equal(profile.pagesDetail[1].textOverlayRiskBoxes, 4);
  assert.equal(profile.textOverlayRiskBoxes, 4);
});

test("summarizeEditabilityProfile ignores visible text that was erased from its source crop", () => {
  const erasedText = (id, x) => ({
    id,
    box: { x, y: 15, w: 10, h: 4 },
    source: {
      layerSourceId: "diagram-crop",
      textErasedFromCrop: true
    }
  });
  const ir = {
    slideSize: { widthPt: 100, heightPt: 50 },
    pages: [{
      pageIndex: 0,
      textBoxes: [
        erasedText("t1", 15),
        erasedText("t2", 30),
        erasedText("t3", 45),
        erasedText("t4", 60)
      ],
      images: [{
        id: "diagram-crop",
        type: "fidelity-crop",
        box: { x: 10, y: 8, w: 78, h: 28 },
        source: {
          detector: "wms-chain-underlay-crop",
          expressionForm: "complex-diagram",
          expressionSubtype: "route-chain-diagram",
          recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident"
        }
      }]
    }]
  };

  const profile = summarizeEditabilityProfile({ ir, raster: summarizeRasterImages(ir) });

  assert.equal(profile.textOverlayRiskBoxes, 0);
  assert.equal(profile.textOverlayRiskImages, 0);
  assert.equal(profile.pagesWithTextOverlayRisk, 0);
});

test("summarizeEditabilityProfile flags even one title over an uncleared raster crop", () => {
  const ir = {
    slideSize: { widthPt: 100, heightPt: 50 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{ id: "title", text: "AI Skills 核心能力矩阵", box: { x: 15, y: 12, w: 70, h: 10 }, source: {} }],
      images: [{
        id: "workflow-residual",
        type: "fidelity-crop",
        box: { x: 10, y: 8, w: 80, h: 24 },
        source: {
          detector: "workflow-diagram-residual-crop",
          expressionForm: "complex-diagram",
          expressionSubtype: "workflow-diagram",
          recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident"
        }
      }]
    }]
  };

  const profile = summarizeEditabilityProfile({ ir, raster: summarizeRasterImages(ir) });
  const gate = summarizeQualityGateStatus({
    summary: { rejected: 0 },
    editabilityProfile: profile,
    requireNoTextOverlayRisk: true
  });

  assert.equal(profile.textOverlayRiskBoxes, 1);
  assert.equal(profile.textOverlayRiskImages, 1);
  assert.equal(profile.pagesDetail[0].textOverlayRisks[0].reason, "fidelity-crop-with-native-text-overlay");
  assert.deepEqual(gate.failures, ["text-overlay-risk"]);
});

test("summarizeEditabilityProfile reports native overlay shapes over protected fidelity crops", () => {
  const ir = {
    slideSize: { widthPt: 100, heightPt: 50 },
    pages: [{
      pageIndex: 0,
      images: [{
        id: "top-complex",
        type: "fidelity-crop",
        box: { x: 5, y: 5, w: 90, h: 35 },
        source: {
          detector: "top-complex-diagram-crop",
          expressionForm: "complex-diagram",
          expressionSubtype: "top-complex-diagram",
          recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident"
        }
      }],
      shapes: [
        {
          id: "grid-line",
          type: "line",
          box: { x: 10, y: 20, w: 75, h: 0 },
          source: {
            editable: true,
            nativeRebuild: true,
            detector: "visual-atom-native-connector",
            layerSourceId: "top-complex"
          }
        },
        {
          id: "unrelated",
          type: "line",
          box: { x: 1, y: 1, w: 4, h: 0 },
          source: {
            editable: true,
            nativeRebuild: true,
            detector: "visual-atom-native-connector",
            layerSourceId: "other-layer"
          }
        }
      ]
    }]
  };

  const profile = summarizeEditabilityProfile({ ir, raster: summarizeRasterImages(ir) });
  const gate = summarizeQualityGateStatus({
    summary: { rejected: 0 },
    editabilityProfile: profile,
    requireNoTextOverlayRisk: true
  });

  assert.equal(profile.nativeOverlayRiskShapes, 1);
  assert.equal(profile.nativeOverlayRiskImages, 1);
  assert.equal(profile.pagesWithNativeOverlayRisk, 1);
  assert.deepEqual(profile.nativeOverlayRiskDetectorCounts, {
    "top-complex-diagram-crop": 1
  });
  assert.equal(profile.pagesDetail[0].nativeOverlayRisks[0].shapes, 1);
  assert.deepEqual(gate.failures, ["native-overlay-risk"]);
  assert.equal(gate.nativeOverlayRiskShapes, 1);
});

test("summarizeEditabilityProfile allows protected fidelity crops with deferred native atoms", () => {
  const ir = {
    slideSize: { widthPt: 100, heightPt: 50 },
    pages: [{
      pageIndex: 0,
      images: [{
        id: "top-complex",
        type: "fidelity-crop",
        box: { x: 5, y: 5, w: 90, h: 35 },
        source: {
          detector: "top-complex-diagram-crop",
          expressionForm: "complex-diagram",
          expressionSubtype: "top-complex-diagram",
          visualAtomObjectified: false,
          deferredVisualAtomsDueToProtectedComplexCrop: 13,
          topComplexDiagramNativeRebuildDeferred: true
        }
      }],
      shapes: []
    }]
  };

  const profile = summarizeEditabilityProfile({ ir, raster: summarizeRasterImages(ir) });

  assert.equal(profile.nativeOverlayRiskShapes, 0);
  assert.equal(profile.nativeOverlayRiskImages, 0);
  assert.equal(profile.pagesWithNativeOverlayRisk, 0);
});

test("hydrateSourceImages promotes OCR evidence images to page.sourceImage", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quality-gate-test-"));
  try {
    const source = path.join(tmp, "001.png");
    fs.writeFileSync(source, "not-a-real-png");
    const ir = hydrateSourceImages({
      pages: [
        {
          pageIndex: 0,
          textBoxes: [{ source: { pageImage: "001.png" } }]
        }
      ]
    }, tmp);

    assert.equal(ir.pages[0].sourceImage, source);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("summarizePages counts accepted, review, and rejected pages", () => {
  assert.deepEqual(summarizePages([
    { status: "accepted" },
    { status: "needs-review" },
    { status: "rejected" }
  ]), {
    pages: 3,
    accepted: 1,
    needsReview: 1,
    rejected: 1,
    passed: false
  });
});

test("assessPages only scores rendered sampled pages", () => {
  const pages = assessPages({
    ir: {
      pages: [
        { sourceImage: "source-0.png" },
        { sourceImage: "source-1.png" },
        { sourceImage: "source-2.png" }
      ]
    },
    render: {
      renderedPages: [
        { pageIndex: 0, image: "render-0.png" }
      ]
    },
    diff: {
      metrics: [
        { pageIndex: 0, ok: true, pixelDiffRatio: 0.02, foregroundMissingRatio: 0.04 }
      ]
    },
    compare: {},
    raster: {
      pages: [
        { pageIndex: 0, fullPageImages: 0, imageAreaRatio: 0, maxImageAreaRatio: 0 },
        { pageIndex: 1, fullPageImages: 0, imageAreaRatio: 0, maxImageAreaRatio: 0 },
        { pageIndex: 2, fullPageImages: 0, imageAreaRatio: 0, maxImageAreaRatio: 0 }
      ]
    },
    thresholds: {
      acceptPixelDiffRatio: 0.22,
      acceptForegroundMissingRatio: 0.3,
      reviewPixelDiffRatio: 0.38,
      reviewForegroundMissingRatio: 0.5,
      maxRasterImageAreaRatio: 0.58
    }
  });
  const summary = summarizePages(pages);
  const deckMetrics = summarizeComparedDeckMetrics({ comparedPages: 1, failedPages: 2 }, pages);

  assert.equal(pages.length, 1);
  assert.equal(pages[0].pageIndex, 0);
  assert.equal(pages[0].status, "accepted");
  assert.deepEqual(summary, {
    pages: 1,
    accepted: 1,
    needsReview: 0,
    rejected: 0,
    passed: true
  });
  assert.equal(deckMetrics.comparedPages, 1);
  assert.equal(deckMetrics.failedPages, 0);
});

test("quality gate status can fail on text overlay risk explicitly", () => {
  const relaxed = summarizeQualityGateStatus({
    summary: { rejected: 0 },
    editabilityProfile: { textOverlayRiskBoxes: 2, textOverlayRiskImages: 1 },
    requireNoTextOverlayRisk: false
  });
  assert.equal(relaxed.passed, true);
  assert.deepEqual(relaxed.failures, []);
  assert.equal(relaxed.requireNoTextOverlayRisk, false);
  assert.equal(relaxed.textOverlayRiskBoxes, 2);
  assert.equal(relaxed.textOverlayRiskImages, 1);

  const strict = summarizeQualityGateStatus({
    summary: { rejected: 0 },
    editabilityProfile: { textOverlayRiskBoxes: 2, textOverlayRiskImages: 1 },
    requireNoTextOverlayRisk: true
  });
  assert.equal(strict.passed, false);
  assert.deepEqual(strict.failures, ["text-overlay-risk"]);
  assert.equal(strict.requireNoTextOverlayRisk, true);
  assert.equal(strict.textOverlayRiskBoxes, 2);
  assert.equal(strict.textOverlayRiskImages, 1);
});

test("quality gate status can fail on duplicate PPTX text shapes explicitly", () => {
  const strict = summarizeQualityGateStatus({
    summary: { rejected: 0 },
    pptxTextLayerAudit: { duplicateTextShapeCount: 1 },
    requireNoDuplicatePptxText: true
  });

  assert.equal(strict.passed, false);
  assert.deepEqual(strict.failures, ["duplicate-pptx-text"]);
  assert.equal(strict.duplicatePptxTextShapes, 1);
});

test("quality gate status fails when explicitly required compare thresholds fail", () => {
  const relaxed = summarizeQualityGateStatus({
    summary: { rejected: 0 },
    comparePassed: false
  });
  assert.equal(relaxed.passed, true);

  const strict = summarizeQualityGateStatus({
    summary: { rejected: 0 },
    comparePassed: false,
    requireCompareThresholds: true
  });
  assert.equal(strict.passed, false);
  assert.deepEqual(strict.failures, ["required-thresholds"]);
  assert.equal(strict.comparePassed, false);
});

test("quality gate status can fail on residual layer candidates explicitly", () => {
  const relaxed = summarizeQualityGateStatus({
    summary: { rejected: 0 },
    editabilityProfile: {},
    layerProfile: { totals: { residualCandidates: 2 } },
    requireNoResidualLayerCandidates: false
  });
  assert.equal(relaxed.passed, true);
  assert.deepEqual(relaxed.failures, []);
  assert.equal(relaxed.requireNoResidualLayerCandidates, false);
  assert.equal(relaxed.residualLayerCandidates, 2);

  const strict = summarizeQualityGateStatus({
    summary: { rejected: 0 },
    editabilityProfile: {},
    layerProfile: { totals: { residualCandidates: 2 } },
    requireNoResidualLayerCandidates: true
  });
  assert.equal(strict.passed, false);
  assert.deepEqual(strict.failures, ["residual-layer-candidates"]);
  assert.equal(strict.requireNoResidualLayerCandidates, true);
  assert.equal(strict.residualLayerCandidates, 2);
});

test("quality gate status can fail on actionable unexplained crops explicitly", () => {
  const relaxed = summarizeQualityGateStatus({
    summary: { rejected: 0 },
    visualUnitDecisionProfile: { actionableUnexplainedCrops: 1 },
    requireNoActionableUnexplainedCrops: false
  });
  assert.equal(relaxed.passed, true);
  assert.deepEqual(relaxed.failures, []);
  assert.equal(relaxed.requireNoActionableUnexplainedCrops, false);
  assert.equal(relaxed.actionableUnexplainedCrops, 1);

  const strict = summarizeQualityGateStatus({
    summary: { rejected: 0 },
    visualUnitDecisionProfile: { actionableUnexplainedCrops: 1 },
    requireNoActionableUnexplainedCrops: true
  });
  assert.equal(strict.passed, false);
  assert.deepEqual(strict.failures, ["actionable-unexplained-crops"]);
  assert.equal(strict.requireNoActionableUnexplainedCrops, true);
  assert.equal(strict.actionableUnexplainedCrops, 1);
});

test("quality gate status fails closed on reconstruction contracts and source-page media by defaulted callers", () => {
  const strict = summarizeQualityGateStatus({
    reconstructionContract: { ok: false },
    sourceMediaExclusion: { passed: false },
    requireReconstructionContract: true,
    requireNoSourceMedia: true
  });
  assert.equal(strict.passed, false);
  assert.deepEqual(strict.failures, ["reconstruction-contract", "source-media-exclusion"]);
  const relaxed = summarizeQualityGateStatus({
    reconstructionContract: { ok: false },
    sourceMediaExclusion: { passed: false }
  });
  assert.equal(relaxed.passed, true);
});

test("quality gate defaults reconstruction budget enforcement on and parses bounded overrides", () => {
  assert.deepEqual(readReconstructionBudgetConfig({}), { required: true });
  assert.deepEqual(readReconstructionBudgetConfig({
    "fail-on-reconstruction-budget": "false",
    "reconstruction-budget-policy": "editable-first",
    "max-reconstruction-residual-area-ratio": "0.2",
    "max-reconstruction-largest-residual-area-ratio": "0.1",
    "min-reconstruction-native-objects": "3"
  }), {
    required: false,
    policy: "editable-first",
    maxResidualAreaRatio: 0.2,
    maxLargestResidualAreaRatio: 0.1,
    minNativeObjectCount: 3
  });
  for (const value of ["yes", "", "TRUE"]) {
    assert.throws(() => readReconstructionBudgetConfig({ "fail-on-reconstruction-budget": value }), /true or false/);
  }
  assert.throws(() => readReconstructionBudgetConfig({ "reconstruction-budget-policy": "unknown" }), /policy/);
  assert.throws(() => readReconstructionBudgetConfig({ "max-reconstruction-residual-area-ratio": "1.1" }), /maxResidualAreaRatio/);
  assert.throws(() => readReconstructionBudgetConfig({ "min-reconstruction-native-objects": "1.5" }), /minNativeObjectCount/);
});

test("quality gate can fail delivery on recomputed reconstruction budget", () => {
  const strict = summarizeQualityGateStatus({
    reconstructionBudget: {
      passed: false,
      failedPageCount: 2,
      maxResidualAreaRatio: 0.72,
      maxLargestResidualAreaRatio: 0.55
    },
    requireReconstructionBudget: true
  });
  assert.equal(strict.passed, false);
  assert.deepEqual(strict.failures, ["reconstruction-budget"]);
  assert.equal(strict.reconstructionBudgetFailedPages, 2);
  assert.equal(strict.reconstructionBudgetMaxResidualAreaRatio, 0.72);
  assert.equal(strict.reconstructionBudgetMaxLargestResidualAreaRatio, 0.55);

  const diagnostic = summarizeQualityGateStatus({
    reconstructionBudget: { passed: false, failedPageCount: 2 },
    requireReconstructionBudget: false
  });
  assert.equal(diagnostic.passed, true);
});

test("resolveRenderOutputDir uses a short cache path by default", () => {
  const renderDir = resolveRenderOutputDir(
    {},
    path.join("runs", "quality-gate", "A Very Long Output Name With Spaces And A Deck Name That Would Make Windows Paths Fragile"),
    path.join("fixtures", "deck.native.ir.json")
  );

  const normalized = renderDir.replace(/\\/g, "/");
  const cacheName = path.basename(renderDir);
  assert.match(normalized, /runs\/quality-gate-render-cache\/A-Very-Long-Output-Name-With-Spaces-And-[a-f0-9]{8}$/);
  assert.ok(cacheName.length <= 48);
});

test("resolveRenderOutputDir isolates concurrent quality folders with the same basename", () => {
  const first = resolveRenderOutputDir(
    {},
    path.join("runs", "golden-a", "_quality"),
    path.join("runs", "golden-a", "deck.native.ir.json")
  );
  const second = resolveRenderOutputDir(
    {},
    path.join("runs", "golden-b", "_quality"),
    path.join("runs", "golden-b", "deck.native.ir.json")
  );

  assert.notEqual(first, second);
  assert.match(path.basename(first), /^_quality-[a-f0-9]{8}$/);
  assert.match(path.basename(second), /^_quality-[a-f0-9]{8}$/);
});

test("quality gate renderer aliases can select PowerPoint", () => {
  assert.equal(normalizeRenderer("powerpoint"), "powerpoint");
  assert.equal(normalizeRenderer("office"), "powerpoint");
  assert.equal(normalizeRenderer("libreoffice"), "libreoffice");
  assert.throws(() => normalizeRenderer("unknown"), /Unsupported renderer/);
});

test("quality gate can read existing PowerPoint render directories", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quality-gate-powerpoint-render-"));
  try {
    fs.writeFileSync(path.join(tmp, "page-02.png"), "");
    fs.writeFileSync(path.join(tmp, "page-01.png"), "");
    fs.writeFileSync(path.join(tmp, "notes.txt"), "");

    const render = readRenderedPages(tmp);
    assert.deepEqual(render.renderedPages.map((page) => path.basename(page.image)), [
      "page-01.png",
      "page-02.png"
    ]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("quality gate reads one renderer family from mixed render directories", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quality-gate-mixed-render-"));
  try {
    fs.writeFileSync(path.join(tmp, "page-01.png"), "");
    fs.writeFileSync(path.join(tmp, "page-02.png"), "");
    fs.writeFileSync(path.join(tmp, "lo-page-01.png"), "");
    fs.writeFileSync(path.join(tmp, "lo-page-02.png"), "");
    fs.writeFileSync(path.join(tmp, "lo-page-03.png"), "");

    const powerpoint = readRenderedPages(tmp, { renderer: "powerpoint", expectedPages: 2 });
    assert.deepEqual(powerpoint.renderedPages.map((page) => path.basename(page.image)), [
      "page-01.png",
      "page-02.png"
    ]);
    assert.equal(countRenderedPages(tmp, { renderer: "powerpoint", expectedPages: 3 }), 0);

    const libreOffice = readRenderedPages(tmp, { renderer: "libreoffice", expectedPages: 3 });
    assert.deepEqual(libreOffice.renderedPages.map((page) => path.basename(page.image)), [
      "lo-page-01.png",
      "lo-page-02.png",
      "lo-page-03.png"
    ]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("quality gate does not auto-reuse mixed render dirs when requested renderer is incomplete", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quality-gate-reuse-mixed-render-"));
  try {
    const renderRoot = path.join(tmp, "render-cache");
    const renderDir = path.join(renderRoot, "Deck_A-baseline-powerpoint-quality", "render");
    const irFile = path.join(tmp, "Deck_A.native.ir.json");
    fs.mkdirSync(renderDir, { recursive: true });
    fs.writeFileSync(irFile, JSON.stringify({ pages: [{}, {}, {}, {}] }));
    fs.writeFileSync(path.join(renderDir, "page-01.png"), "");
    fs.writeFileSync(path.join(renderDir, "page-02.png"), "");
    fs.writeFileSync(path.join(renderDir, "lo-page-01.png"), "");
    fs.writeFileSync(path.join(renderDir, "lo-page-02.png"), "");
    fs.writeFileSync(path.join(renderDir, "lo-page-03.png"), "");
    fs.writeFileSync(path.join(renderDir, "lo-page-04.png"), "");

    assert.equal(
      resolveReusableRenderDir({
        args: {
          "reuse-render": "true",
          "max-pages": "4",
          "quality-root": path.join(tmp, "missing-quality"),
          "render-root": renderRoot
        },
        outputDir: path.join(tmp, "out"),
        irFile,
        pptxFile: path.join(tmp, "Deck_A.native-editable.pptx"),
        renderOutputDir: path.join(tmp, "missing-render-out"),
        renderer: "powerpoint"
      }),
      null
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("quality gate can auto-reuse explicit render directories", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quality-gate-reuse-explicit-"));
  try {
    fs.writeFileSync(path.join(tmp, "page-01.png"), "");
    assert.equal(countRenderedPages(tmp), 1);
    assert.equal(
      resolveReusableRenderDir({
        args: { "render-dir": tmp },
        outputDir: path.join(tmp, "out"),
        irFile: path.join(tmp, "deck.ir.json"),
        pptxFile: path.join(tmp, "deck.pptx"),
        renderOutputDir: path.join(tmp, "render-out")
      }),
      tmp
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("quality gate can auto-reuse render dirs from quality reports", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quality-gate-reuse-report-"));
  try {
    const pptxFile = path.join(tmp, "Deck_A.native-editable.pptx");
    const renderDir = path.join(tmp, "render-cache", "Deck_A-baseline-powerpoint-quality", "render");
    const qualityDir = path.join(tmp, "quality", "Deck_A-baseline-powerpoint-quality");
    fs.mkdirSync(renderDir, { recursive: true });
    fs.mkdirSync(qualityDir, { recursive: true });
    fs.writeFileSync(path.join(renderDir, "page-01.png"), "");
    fs.writeFileSync(path.join(qualityDir, "quality-gate-report.json"), `${JSON.stringify({
      pptxFile,
      render: { renderDir }
    })}\n`);

    assert.deepEqual(findRenderDirsFromQualityReports({
      qualityRoot: path.join(tmp, "quality"),
      pptxFile
    }), [renderDir]);
    assert.equal(
      resolveReusableRenderDir({
        args: {
          "reuse-render": "true",
          "quality-root": path.join(tmp, "quality"),
          "render-root": path.join(tmp, "render-cache")
        },
        outputDir: path.join(tmp, "out"),
        irFile: path.join(tmp, "Deck_A.native.ir.json"),
        pptxFile,
        renderOutputDir: path.join(tmp, "missing-render-out")
      }),
      renderDir
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("quality gate can auto-reuse prefixed render cache directories", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quality-gate-reuse-prefix-"));
  try {
    const renderRoot = path.join(tmp, "render-cache");
    const renderDir = path.join(renderRoot, "Deck_A-baseline-powerpoint-quality", "render");
    fs.mkdirSync(renderDir, { recursive: true });
    fs.writeFileSync(path.join(renderDir, "page-01.png"), "");

    assert.deepEqual(findRenderDirsByPrefix(renderRoot, ["Deck_A"]), [renderDir]);
    assert.equal(
      resolveReusableRenderDir({
        args: {
          "reuse-render": "true",
          "quality-root": path.join(tmp, "missing-quality"),
          "render-root": renderRoot
        },
        outputDir: path.join(tmp, "out"),
        irFile: path.join(tmp, "Deck_A.native.ir.json"),
        pptxFile: path.join(tmp, "Deck_A.native-editable.pptx"),
        renderOutputDir: path.join(tmp, "missing-render-out")
      }),
      renderDir
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("quality gate only reuses automatic render caches with matching content identity", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quality-gate-content-cache-"));
  try {
    const renderDir = path.join(tmp, "render");
    fs.mkdirSync(renderDir, { recursive: true });
    fs.writeFileSync(path.join(renderDir, "page-01.png"), "");
    const identity = {
      provider: "slideclone-render-cache-v1",
      packageFingerprint: "a".repeat(64),
      renderer: "powerpoint",
      expectedPages: 1,
      dpi: 144
    };
    assert.equal(reusableRenderMatches(renderDir, {
      renderer: "powerpoint",
      expectedPages: 1,
      cacheIdentity: identity
    }), false);

    writeRenderCacheMetadata(renderDir, identity);
    assert.deepEqual(readRenderCacheMetadata(renderDir), identity);
    assert.equal(reusableRenderMatches(renderDir, {
      renderer: "powerpoint",
      expectedPages: 1,
      cacheIdentity: identity
    }), true);
    assert.equal(reusableRenderMatches(renderDir, {
      renderer: "powerpoint",
      expectedPages: 1,
      cacheIdentity: { ...identity, packageFingerprint: "b".repeat(64) }
    }), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("quality gate text OCR config is opt-in and skips source OCR by default", () => {
  assert.equal(readTextOcrConfig({}).enabled, false);
  assert.equal(readTextOcrConfig({ "text-ocr": "true" }).paddingPt, 16);
  assert.equal(readTextOcrConfig({ "min-text-coverage": "0.9" }).enabled, true);
  assert.equal(readTextOcrConfig({ "text-ocr-mode": "fullPage" }).enabled, true);
  assert.equal(readTextOcrConfig({ "text-ocr-pages": "1,3" }).enabled, true);
  assert.deepEqual(readTextOcrConfig({
    "text-ocr": "true",
    "text-ocr-adapter": "scripts/adapters/ocr-umi-paddle.js",
    "text-ocr-padding": "4"
  }), {
    enabled: true,
    adapter: "scripts/adapters/ocr-umi-paddle.js",
    mode: "anchored",
    sourceOcr: false,
    paddingPt: 4,
    microBatch: true,
    microBatchSize: 8,
    psm: undefined,
    pageIndexes: null
  });
});

test("quality gate parses one-based OCR page selections", () => {
  assert.deepEqual(parsePageIndexes("1,3-5,2"), [0, 1, 2, 3, 4]);
  assert.equal(parsePageIndexes("nope"), null);
  assert.deepEqual(readTextOcrConfig({ "text-ocr-pages": "2,4" }).pageIndexes, [1, 3]);
});

test("quality gate reads optional OCR thresholds and Umi path", () => {
  assert.equal(readThresholds({ "min-text-coverage": "0.91" }).textCoverage, 0.91);
  assert.deepEqual(readUmiOcrConfig({
    "umi-bin": "C:/OCR/PaddleOCR-json.exe",
    "umi-init-timeout-ms": "120000",
    "ocr-cache-dir": "runs/custom-ocr-cache"
  }), {
    paddleBin: "C:/OCR/PaddleOCR-json.exe",
    cacheDir: "runs/custom-ocr-cache",
    cache: true,
    initTimeoutMs: 120000
  });
  assert.equal(readUmiOcrConfig({ "ocr-cache": "false" }).cache, false);
});
