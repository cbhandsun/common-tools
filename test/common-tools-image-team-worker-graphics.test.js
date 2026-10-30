"use strict";
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { addNativeResidualPrimitives, changedComponentKeysFromFit, compactDeckFinalQualitySourceProvenance, compactDeckLateShapeSourceBudgetProvenance, compactDeckLateTextSourceBudgetProvenance, compactDeckNativeShapeSourceProvenance, createImageToEditableArchiveHandler, finalRefinementQualityAcceptable, fitDeckEditableTextFontFamily, fitDeckLightCardGeometry, fitDeckLightCardSideAccents, fitDeckLightCardSourceStrokes, fitDeckLightCardStrokeColors, fitDeckLightCardStrokes, fitDeckLowContrastFooterMarks, fitDeckLowContrastFooterPrimitives, fitDeckLowSaturationPanelFills, fitDeckMissingNativeVisualAtomShapes, fitDeckNativeShapeThinStrokes, fitDeckOcrEvidenceToSource, fitDeckSaturatedColorPanels, fitDeckSourceVerticalLines, fitDeckTextFidelityPrimitives, fitDeckWorstComponentFidelityPrimitives, fitDeckWorstConnectorStyles, fitDeckWorstRichOcrTextLayout, fitDeckWorstTextArrowGlyphs, fitDeckWorstTextBoxNudge, fitDeckWorstTextColors, fitDeckWorstTextComposite, fitDeckWorstTextInkBoxes, fitDeckWorstTextScale, fitDeckWorstTextWeight, focusedCandidateLimits, focusedLightCardStrokeWidthCandidates, isReliableMissingNativeVisualAtom, lightCardSourceStrokeQualityAcceptable, missingNativeTargetInkRunShapes, nativeOnlyMissingNativeLinesDoesNotRegress, nativeOnlyRefinementDoesNotMateriallyRegress, nativeOnlyResidualQualityAcceptable, removeFullSlideResidualImages, replacePictorialIconCropsWithNativeShapes, residualDeduplicationStatus, targetComponentQualityImproves, targetMissingNativeComponentQualityImproves, tryBuildFinalLineTextCoveredCropDropCandidate, tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate, tryBuildNativeOnlyPictorialIconCandidate, tryBuildNativeOnlyRichOcrTextLayoutCandidate, validateDeckIr, worstTextBoxNudgeCandidates, worstTextCompositeScaleCandidates } = require("../packages/slideclone-worker-adapter/team-worker");
const { writePng } = require("../packages/slideclone-core/png");
const { addKnowledgeGraphPictorialConnectors, applyKnowledgeGraphPanelNativeRebuild, findKnowledgeGraphPanelModel } = require("../packages/slideclone-core/archetypes/knowledge-graph-native");
const { addLowContrastFooterNativeMarks, boundedOcrSourceDeck, correctContextualOcrLines, createRawImageNativeRebuilder, largeRasterEditability, nativeObjectMetrics, residualEraseObjects, shouldOmitFullSlideResidual, writeTextErasedVisualFallbackAsset } = require("../packages/slideclone-core/team-native-rebuild");
const { refineKnowledgeGraphIconCrops } = require("../packages/slideclone-core/archetypes/knowledge-graph-icon-crops");
const { spawnSync } = require("node:child_process");
const { createFullSlideResidual, deck, readPng, rebuildDeckFromWorkDir, writeMinimalPptx, writeThreeCardDiagram } = require('./helpers/image-team-worker.cjs');

test("rebuilt metadata admits local sources and bounded counters without evaluating getters", t => {
  const { admitRebuiltPageMetadata } = require("../packages/slideclone-core/rebuilt-page-metadata");
  const pageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rebuilt-metadata-"));
  t.after(() => fs.rmSync(pageRoot, { recursive: true, force: true }));
  const sourceInputFile = path.join(pageRoot, "source.png");
  fs.writeFileSync(sourceInputFile, "fixture");
  const context = { pageRoot, sourceInputFile };
  assert.deepEqual(admitRebuiltPageMetadata({}, context), { sourceImage: sourceInputFile, residual: null, reconstructionProfile: null, nativeComponentQuality: null, ocrCropRecovery: null });
  const input = { residual: { candidateObjects: 2, erasedObjects: 1 }, reconstructionProfile: "test-v1", nativeComponentQuality: { passed: true, metrics: { connectors: 3, ignoredPixelPrimitives: 2 } }, ocrCropRecovery: { sourceLines: 12, recovered: 4, cropsErased: 1 } };
  const output = admitRebuiltPageMetadata(input, context);
  assert.equal(output.nativeComponentQuality.metrics.connectors, 3);
  assert.equal(output.nativeComponentQuality.metrics.minimumUnitCrops, 0);
  assert.equal(output.nativeComponentQuality.metrics.ignoredPixelPrimitives, 2);
  assert.deepEqual(output.ocrCropRecovery, { sourceLines: 12, recovered: 4, cropsErased: 1 });
  assert.ok(Object.isFrozen(output.residual));
  let getters = 0;
  for (const key of ["sourceImage", "residual", "reconstructionProfile", "nativeComponentQuality", "ocrCropRecovery"]) {
    assert.throws(() => admitRebuiltPageMetadata(Object.defineProperty({}, key, { get() { getters++; return null; } }), context), /data properties/);
  }
  assert.equal(getters, 0);
  for (const count of [-1, NaN, Infinity, "2", Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => admitRebuiltPageMetadata({ residual: { candidateObjects: count } }, context), /metric/);
    assert.throws(() => admitRebuiltPageMetadata({ nativeComponentQuality: { passed: true, metrics: { connectors: count } } }, context), /metric/);
    assert.throws(() => admitRebuiltPageMetadata({ ocrCropRecovery: { sourceLines: count } }, context), /metric/);
  }
  assert.throws(() => admitRebuiltPageMetadata({ ocrCropRecovery: { sourceLines: 2, recovered: 3 } }, context), /inconsistent/);
  assert.throws(() => admitRebuiltPageMetadata({ residual: { candidateObjects: 1, erasedObjects: 2 } }, context), /inconsistent/);
  assert.throws(() => admitRebuiltPageMetadata({ sourceImage: __filename }, context), /outside/);
  assert.throws(() => admitRebuiltPageMetadata({ sourceImage: "../secret" }, context), /invalid/);
  assert.throws(() => admitRebuiltPageMetadata({ nativeComponentQuality: { passed: "true" } }, context), /status/);
});

test("native-only missing native gate rejects repaired targets when global render dirties", () => {
  const baselineQuality = {
    metrics: {
      "pixel-diff-ratio": 0.097,
      "foreground-missing-ratio": 0.055,
      "mean-absolute-delta": 16.0,
      "component-regions-attention": 4,
      "worst-component-normalized-severity": 2.8
    },
    checks: [{ name: "quality-rendered", passed: true }],
    componentWorst: [
      { pageIndex: 0, id: "missing-curve", kind: "missing", role: "missing-native-component", severity: 2.8, pixelDiffRatio: 0.34, foregroundMissingRatio: 0.42, attention: true },
      { pageIndex: 0, id: "other-card", kind: "shape", role: "shape", severity: 1.2, pixelDiffRatio: 0.12, foregroundMissingRatio: 0.1, attention: true }
    ]
  };
  const candidateQuality = {
    metrics: {
      "pixel-diff-ratio": 0.0973,
      "foreground-missing-ratio": 0.0554,
      "mean-absolute-delta": 16.08,
      "component-regions-attention": 5,
      "worst-component-normalized-severity": 2.8
    },
    checks: [{ name: "quality-rendered", passed: true }],
    componentWorst: [
      { pageIndex: 0, id: "other-card", kind: "shape", role: "shape", severity: 1.2, pixelDiffRatio: 0.12, foregroundMissingRatio: 0.1, attention: true }
    ]
  };

  assert.equal(targetMissingNativeComponentQualityImproves({
    baselineQuality,
    candidateQuality,
    targetKeys: new Set(["0:missing-curve"])
  }), false);
  assert.equal(nativeOnlyRefinementDoesNotMateriallyRegress({ baselineQuality, candidateQuality }), true);
  assert.equal(nativeOnlyMissingNativeLinesDoesNotRegress({ baselineQuality, candidateQuality }), false);
  assert.equal(targetMissingNativeComponentQualityImproves({
    baselineQuality,
    candidateQuality: {
      ...candidateQuality,
      metrics: {
        ...candidateQuality.metrics,
        "pixel-diff-ratio": 0.0969,
        "foreground-missing-ratio": 0.055,
        "mean-absolute-delta": 16.0,
        "component-regions-attention": 4
      }
    },
    targetKeys: new Set(["0:missing-curve"])
  }), true);
  assert.equal(nativeOnlyMissingNativeLinesDoesNotRegress({
    baselineQuality,
    candidateQuality: {
      ...candidateQuality,
      metrics: {
        ...candidateQuality.metrics,
        "pixel-diff-ratio": 0.0969,
        "foreground-missing-ratio": 0.055,
        "mean-absolute-delta": 16.0,
        "component-regions-attention": 4
      }
    }
  }), true);
  assert.equal(nativeOnlyRefinementDoesNotMateriallyRegress({
    baselineQuality,
    candidateQuality: {
      ...candidateQuality,
      metrics: {
        ...candidateQuality.metrics,
        "pixel-diff-ratio": 0.098
      }
    }
  }), false);
});

test("native-only missing native atom gate rejects low-confidence residual fragments", () => {
  assert.equal(isReliableMissingNativeVisualAtom({ kind: "grid-line-candidate", density: 0.5065 }), false);
  assert.equal(isReliableMissingNativeVisualAtom({ kind: "grid-line-candidate", density: 0.0527 }), false);
  assert.equal(isReliableMissingNativeVisualAtom({ kind: "connector-line-candidate", density: 0.2227 }), false);
  assert.equal(isReliableMissingNativeVisualAtom({ kind: "connector-line-candidate", density: 0.58 }), true);
  assert.equal(isReliableMissingNativeVisualAtom({ kind: "connector-arrow-candidate", confidence: 0.6 }), true);
  assert.equal(isReliableMissingNativeVisualAtom({ kind: "grid-line-candidate", density: 0.68 }), true);
});

test("native-only missing native fit does not guess primitives from a single missing box", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-single-missing-box-"));
  const sourceFile = path.join(temporaryRoot, "source.png");
  try {
    writePng(sourceFile, { width: 120, height: 80, rgba: Buffer.alloc(120 * 80 * 4, 255) });
    const deck = {
      version: "1.0",
      slideSize: { widthPt: 120, heightPt: 80 },
      pages: [{ textBoxes: [], shapes: [], images: [] }]
    };
    const visualQuality = {
      checks: [{ name: "quality-rendered", passed: true }],
      metrics: { "pixel-diff-ratio": 0.1 },
      componentWorst: [
        {
          pageIndex: 0,
          id: "missing-single-line",
          kind: "missing",
          role: "missing-native-component",
          box: { x: 20, y: 40, w: 72, h: 4 },
          source: { dominantColor: "#3366FF" }
        }
      ]
    };

    const result = fitDeckMissingNativeVisualAtomShapes(deck, {
      sourceImages: [sourceFile],
      renderedImages: [],
      visualQuality,
      maximumTargets: 1,
      maximumAtoms: 8
    });

    assert.equal(result.addedShapes, 0);
    assert.equal(result.candidateTargets, 0);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("missing native line bundles rank equal-support groups without throwing", () => {
  const { missingNativeVisualAtomLineBundles } = require("../packages/slideclone-worker-adapter/team-worker");
  const target = { box: { x: 0, y: 0, w: 100, h: 100 } };
  const atoms = [
    { id: "short-a", kind: "connector-line-candidate", box: { x: 5, y: 10, w: 8, h: 2 }, color: "#1473E6" },
    { id: "short-b", kind: "connector-line-candidate", box: { x: 15, y: 10, w: 8, h: 2 }, color: "#1473E6" },
    { id: "long-a", kind: "connector-line-candidate", box: { x: 5, y: 60, w: 30, h: 2 }, color: "#1473E6" },
    { id: "long-b", kind: "connector-line-candidate", box: { x: 37, y: 60, w: 30, h: 2 }, color: "#1473E6" }
  ];
  const bundles = missingNativeVisualAtomLineBundles(atoms, target);
  assert.equal(bundles.length, 2);
  assert.equal(bundles[0].shape.box.w, 62);
  assert.equal(bundles[1].shape.box.w, 18);
  assert.deepEqual(missingNativeVisualAtomLineBundles([], target), []);
  assert.deepEqual(missingNativeVisualAtomLineBundles(null, target), []);
});

test("missing native visual atom repair promotes single line components to native lines", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "missing-native-single-line-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const sourceFile = path.join(temporaryRoot, "source.png");
  const width = 100; const height = 100;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let x = 10; x < 50; x += 1) {
    for (const y of [20, 21]) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 18; rgba[offset + 1] = 82; rgba[offset + 2] = 180; rgba[offset + 3] = 255;
    }
  }
  for (let y = 10; y < 40; y += 1) {
    for (const x of [70, 71]) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 90; rgba[offset + 1] = 92; rgba[offset + 2] = 96; rgba[offset + 3] = 255;
    }
  }
  writePng(sourceFile, { width, height, rgba });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{ pageIndex: 0, shapes: [], textBoxes: [], images: [] }]
  };
  const visualQuality = {
    componentWorst: [
      { pageIndex: 0, id: "missing-h", kind: "missing", role: "missing-native-component", box: { x: 10, y: 20, w: 40, h: 2 } },
      { pageIndex: 0, id: "missing-v", kind: "missing", role: "missing-native-component", box: { x: 70, y: 10, w: 2, h: 30 } }
    ]
  };

  const result = fitDeckMissingNativeVisualAtomShapes(deck, { sourceImages: [sourceFile], visualQuality, maximumTargets: 2 });

  assert.equal(result.addedShapes, 2);
  assert.deepEqual(result.changedComponentKeys.sort(), ["0:missing-h", "0:missing-v"]);
  const lines = result.deck.pages[0].shapes;
  assert.equal(lines.every((shape) => shape.type === "line"), true);
  assert.equal(lines.every((shape) => shape.source.detector === "missing-native-line-component"), true);
  assert.equal(lines.every((shape) => shape.source.semanticNativeStructure === true), true);
  assert.equal(lines.some((shape) => shape.box.w > 0 && shape.box.h === 0), true);
  assert.equal(lines.some((shape) => shape.box.w === 0 && shape.box.h > 0), true);
  assert.equal(lines.some((shape) => shape.source.visualFallbackPrimitive === true), false);
});

test("missing native visual atom repair preserves diagonal connector atoms as editable lines", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "missing-native-diagonal-line-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const sourceFile = path.join(temporaryRoot, "source.png");
  const renderedFile = path.join(temporaryRoot, "rendered.png");
  const width = 120; const height = 90;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (let step = 0; step < 54; step += 1) {
    const x = 28 + step;
    const y = 66 - step;
    for (let dy = -1; dy <= 1; dy += 1) {
      const py = y + dy;
      if (x < 0 || py < 0 || x >= width || py >= height) continue;
      const offset = (py * width + x) * 4;
      source[offset] = 26; source[offset + 1] = 98; source[offset + 2] = 220; source[offset + 3] = 255;
    }
  }
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 120, heightPt: 90 },
    pages: [{ pageIndex: 0, shapes: [], textBoxes: [], images: [] }]
  };
  const visualQuality = {
    componentWorst: [
      { pageIndex: 0, id: "missing-diagonal", kind: "missing", role: "missing-native-component", box: { x: 25, y: 10, w: 64, h: 62 } }
    ]
  };

  const result = fitDeckMissingNativeVisualAtomShapes(deck, {
    sourceImages: [sourceFile],
    renderedImages: [renderedFile],
    visualQuality,
    maximumTargets: 1,
    maximumAtoms: 6,
    clusterMissingTargets: false
  });

  assert.ok(result.addedShapes >= 1);
  const shapes = result.deck.pages[0].shapes;
  assert.equal(shapes.some((shape) => shape.source?.detector === "missing-native-visual-atom-rect"), false);
  assert.equal(shapes.some((shape) => shape.type === "line" || shape.type === "freeform"), true);
});

test("missing native visual atom repair promotes tiny marks to native rectangles", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "missing-native-tiny-rect-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const sourceFile = path.join(temporaryRoot, "source.png");
  const width = 80; const height = 60;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 20; y < 24; y += 1) {
    for (let x = 30; x < 36; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 210; rgba[offset + 1] = 32; rgba[offset + 2] = 45; rgba[offset + 3] = 255;
    }
  }
  writePng(sourceFile, { width, height, rgba });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 80, heightPt: 60 },
    pages: [{ pageIndex: 0, shapes: [], textBoxes: [], images: [] }]
  };
  const visualQuality = {
    componentWorst: [
      { pageIndex: 0, id: "missing-tiny-mark", kind: "missing", role: "missing-native-component", box: { x: 30, y: 20, w: 6, h: 4 } }
    ]
  };

  const result = fitDeckMissingNativeVisualAtomShapes(deck, { sourceImages: [sourceFile], visualQuality, maximumTargets: 1 });

  assert.equal(result.addedShapes, 1);
  const [shape] = result.deck.pages[0].shapes;
  assert.equal(shape.type, "rect");
  assert.equal(shape.source.detector, "missing-native-tiny-rect-component");
  assert.equal(shape.source.semanticNativeStructure, true);
  assert.equal(shape.source.visualFallbackPrimitive === true, false);
  const second = fitDeckMissingNativeVisualAtomShapes(result.deck, { sourceImages: [sourceFile], visualQuality, maximumTargets: 1 });
  assert.equal(second.addedShapes, 1);
  const third = fitDeckMissingNativeVisualAtomShapes(second.deck, { sourceImages: [sourceFile], visualQuality, maximumTargets: 1 });
  assert.equal(third.addedShapes, 1);
  assert.equal(new Set(third.deck.pages[0].shapes.map(item => item.id)).size, third.deck.pages[0].shapes.length);
  assert.deepEqual(third.deck.pages[0].shapes[0], shape);
});

test("missing native visual atom repair emits native ink runs from source-rendered gaps", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "missing-native-ink-runs-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const sourceFile = path.join(temporaryRoot, "source.png");
  const renderedFile = path.join(temporaryRoot, "rendered.png");
  const width = 96; const height = 72;
  const sourceRgba = Buffer.alloc(width * height * 4, 255);
  const renderedRgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 20; y < 48; y += 1) {
    for (let x = 30; x < 34; x += 1) {
      const offset = (y * width + x) * 4;
      sourceRgba[offset] = 72; sourceRgba[offset + 1] = 74; sourceRgba[offset + 2] = 78; sourceRgba[offset + 3] = 255;
    }
  }
  for (let y = 44; y < 48; y += 1) {
    for (let x = 30; x < 58; x += 1) {
      const offset = (y * width + x) * 4;
      sourceRgba[offset] = 72; sourceRgba[offset + 1] = 74; sourceRgba[offset + 2] = 78; sourceRgba[offset + 3] = 255;
    }
  }
  writePng(sourceFile, { width, height, rgba: sourceRgba });
  writePng(renderedFile, { width, height, rgba: renderedRgba });
  const target = {
    id: "missing-l-corner",
    kind: "missing",
    role: "missing-native-component",
    box: { x: 30, y: 20, w: 28, h: 28 },
    sourceBoxes: [{ id: "missing-l-corner", box: { x: 30, y: 20, w: 28, h: 28 } }],
    color: "#484A4E",
    source: { detector: "missing-native-component-quality", dominantColor: "#484A4E" }
  };

  const inkRuns = missingNativeTargetInkRunShapes(target, readPng(sourceFile), { widthPt: 96, heightPt: 72 }, readPng(renderedFile), 4);

  assert.ok(inkRuns.length >= 1);
  assert.equal(inkRuns.every((shape) => shape.type === "rect"), true);
  assert.equal(inkRuns.every((shape) => shape.source.detector === "missing-native-ink-run-component"), true);
  assert.equal(inkRuns.every((shape) => shape.source.semanticNativeStructure === true), true);
  assert.equal(inkRuns.every((shape) => shape.source.visualFallbackPrimitive === true), false);
});

test("missing native visual atom repair keeps ink runs as a fallback after atom shapes", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "missing-native-ink-run-fallback-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const sourceFile = path.join(temporaryRoot, "source.png");
  const renderedFile = path.join(temporaryRoot, "rendered.png");
  const width = 96; const height = 72;
  const sourceRgba = Buffer.alloc(width * height * 4, 255);
  const renderedRgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 20; y < 48; y += 1) {
    for (let x = 30; x < 34; x += 1) {
      const offset = (y * width + x) * 4;
      sourceRgba[offset] = 72; sourceRgba[offset + 1] = 74; sourceRgba[offset + 2] = 78; sourceRgba[offset + 3] = 255;
    }
  }
  writePng(sourceFile, { width, height, rgba: sourceRgba });
  writePng(renderedFile, { width, height, rgba: renderedRgba });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 96, heightPt: 72 },
    pages: [{ pageIndex: 0, shapes: [], textBoxes: [], images: [] }]
  };
  const visualQuality = {
    componentWorst: [{
      pageIndex: 0,
      id: "missing-native-line",
      kind: "missing",
      role: "missing-native-component",
      box: { x: 30, y: 20, w: 4, h: 28 },
      source: { detector: "missing-native-component-quality", dominantColor: "#484A4E" }
    }]
  };

  const result = fitDeckMissingNativeVisualAtomShapes(deck, {
    sourceImages: [sourceFile],
    renderedImages: [renderedFile],
    visualQuality,
    maximumTargets: 1,
    maximumAtoms: 4
  });

  assert.equal(result.deck.pages[0].shapes.some((shape) => shape.source?.detector === "missing-native-line-component"), true);
  assert.equal(result.deck.pages[0].shapes.some((shape) => shape.source?.detector === "missing-native-ink-run-component"), false);
  assert.equal(result.changedComponentKeys.includes("0:missing-native-line"), true);
});

test("missing native visual atom repair does not cluster neighboring block fragments into one target", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "missing-native-block-no-cluster-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const sourceFile = path.join(temporaryRoot, "source.png");
  const renderedFile = path.join(temporaryRoot, "rendered.png");
  const width = 96; const height = 72;
  const sourceRgba = Buffer.alloc(width * height * 4, 255);
  const renderedRgba = Buffer.alloc(width * height * 4, 255);
  for (const [left, top] of [[28, 22], [40, 24]]) {
    for (let y = top; y < top + 8; y += 1) {
      for (let x = left; x < left + 8; x += 1) {
        const offset = (y * width + x) * 4;
        sourceRgba[offset] = 24; sourceRgba[offset + 1] = 72; sourceRgba[offset + 2] = 168; sourceRgba[offset + 3] = 255;
      }
    }
  }
  writePng(sourceFile, { width, height, rgba: sourceRgba });
  writePng(renderedFile, { width, height, rgba: renderedRgba });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 96, heightPt: 72 },
    pages: [{ pageIndex: 0, shapes: [], textBoxes: [], images: [] }]
  };
  const visualQuality = {
    componentWorst: [
      { pageIndex: 0, id: "missing-block-a", kind: "missing", role: "missing-native-component", box: { x: 28, y: 22, w: 8, h: 8 }, source: { detector: "missing-native-component-quality", dominantColor: "#1848A8" } },
      { pageIndex: 0, id: "missing-block-b", kind: "missing", role: "missing-native-component", box: { x: 40, y: 24, w: 8, h: 8 }, source: { detector: "missing-native-component-quality", dominantColor: "#1848A8" } }
    ]
  };

  const result = fitDeckMissingNativeVisualAtomShapes(deck, {
    sourceImages: [sourceFile],
    renderedImages: [renderedFile],
    visualQuality,
    maximumTargets: 1,
    maximumAtoms: 8
  });

  assert.ok(result.addedShapes > 0);
  assert.equal(result.changedComponentKeys.includes("0:missing-block-a"), true);
  assert.equal(result.changedComponentKeys.includes("0:missing-block-b"), false);
});

test("missing native visual atom repair uses oval ink runs only for single-target refinement", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "missing-native-single-oval-ink-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const sourceFile = path.join(temporaryRoot, "source.png");
  const renderedFile = path.join(temporaryRoot, "rendered.png");
  const width = 120; const height = 80;
  const sourceRgba = Buffer.alloc(width * height * 4, 255);
  const renderedRgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 20; y < 32; y += 1) {
    for (let x = 30; x < 78; x += 1) {
      const nx = (x - 54) / 24;
      const ny = (y - 26) / 6;
      if (nx * nx + ny * ny > 1) continue;
      const offset = (y * width + x) * 4;
      sourceRgba[offset] = 25; sourceRgba[offset + 1] = 112; sourceRgba[offset + 2] = 230; sourceRgba[offset + 3] = 255;
    }
  }
  writePng(sourceFile, { width, height, rgba: sourceRgba });
  writePng(renderedFile, { width, height, rgba: renderedRgba });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 120, heightPt: 80 },
    pages: [{ pageIndex: 0, shapes: [], textBoxes: [], images: [] }]
  };
  const visualQuality = {
    componentWorst: [
      { pageIndex: 0, id: "missing-oval", kind: "missing", role: "missing-native-component", box: { x: 30, y: 20, w: 48, h: 12 } },
      { pageIndex: 0, id: "missing-other", kind: "missing", role: "missing-native-component", box: { x: 90, y: 20, w: 4, h: 20 } }
    ]
  };

  const single = fitDeckMissingNativeVisualAtomShapes(deck, {
    sourceImages: [sourceFile],
    renderedImages: [renderedFile],
    visualQuality,
    maximumTargets: 1,
    maximumAtoms: 16
  });
  const multi = fitDeckMissingNativeVisualAtomShapes(deck, {
    sourceImages: [sourceFile],
    renderedImages: [renderedFile],
    visualQuality,
    maximumTargets: 2,
    maximumAtoms: 16
  });

  assert.equal(single.deck.pages[0].shapes.some((shape) => shape.source?.detector === "missing-native-ink-run-component"), true);
  assert.equal(multi.deck.pages[0].shapes.some((shape) => shape.source?.detector === "missing-native-oval-component"), true);
});

test("missing native visual atom repair promotes saturated oval caps to native ellipses", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "missing-native-oval-cap-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const sourceFile = path.join(temporaryRoot, "source.png");
  const width = 120; const height = 80;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 20; y < 32; y += 1) {
    for (let x = 30; x < 78; x += 1) {
      const nx = (x - 54) / 24;
      const ny = (y - 26) / 6;
      if (nx * nx + ny * ny > 1) continue;
      const offset = (y * width + x) * 4;
      rgba[offset] = 25; rgba[offset + 1] = 112; rgba[offset + 2] = 230; rgba[offset + 3] = 255;
    }
  }
  writePng(sourceFile, { width, height, rgba });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 120, heightPt: 80 },
    pages: [{ pageIndex: 0, shapes: [], textBoxes: [], images: [] }]
  };
  const visualQuality = {
    componentWorst: [
      { pageIndex: 0, id: "missing-oval", kind: "missing", role: "missing-native-component", box: { x: 30, y: 20, w: 48, h: 12 } }
    ]
  };

  const result = fitDeckMissingNativeVisualAtomShapes(deck, { sourceImages: [sourceFile], visualQuality, maximumTargets: 1 });

  assert.equal(result.addedShapes, 1);
  const [shape] = result.deck.pages[0].shapes;
  assert.equal(shape.type, "ellipse");
  assert.equal(shape.source.detector, "missing-native-oval-component");
  assert.equal(shape.source.semanticNativeStructure, true);
  assert.equal(shape.source.visualFallbackPrimitive === true, false);
});

test("missing native visual atom repair keeps saturated oval caps inside clustered targets", (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "missing-native-clustered-oval-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const sourceFile = path.join(temporaryRoot, "source.png");
  const width = 120; const height = 80;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 20; y < 32; y += 1) {
    for (let x = 30; x < 78; x += 1) {
      const nx = (x - 54) / 24;
      const ny = (y - 26) / 6;
      if (nx * nx + ny * ny > 1) continue;
      const offset = (y * width + x) * 4;
      rgba[offset] = 25; rgba[offset + 1] = 112; rgba[offset + 2] = 230; rgba[offset + 3] = 255;
    }
  }
  for (let y = 36; y < 44; y += 1) {
    const offset = (y * width + 77) * 4;
    rgba[offset] = 25; rgba[offset + 1] = 112; rgba[offset + 2] = 230; rgba[offset + 3] = 255;
  }
  writePng(sourceFile, { width, height, rgba });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 120, heightPt: 80 },
    pages: [{ pageIndex: 0, shapes: [], textBoxes: [], images: [] }]
  };
  const visualQuality = {
    componentWorst: [
      { pageIndex: 0, id: "missing-oval", kind: "missing", role: "missing-native-component", box: { x: 30, y: 20, w: 48, h: 12 } },
      { pageIndex: 0, id: "missing-nearby-line", kind: "missing", role: "missing-native-component", box: { x: 77, y: 36, w: 1, h: 8 } }
    ]
  };

  const result = fitDeckMissingNativeVisualAtomShapes(deck, { sourceImages: [sourceFile], visualQuality, maximumTargets: 1, maximumAtoms: 4 });

  assert.equal(result.deck.pages[0].shapes.some((shape) => shape.type === "ellipse" && shape.source.detector === "missing-native-oval-component"), true);
  assert.equal(result.changedComponentKeys.includes("0:missing-oval"), true);
});

test("large raster blocking still allows native shape structural refinement", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();
  assert.match(source, /function blockLateVisualRefinementForLargeRaster\(visualQuality, deck\) \{\s+if \(!qualityRendered\(visualQuality\) \|\| largeRasterEditability\(deck\)\.passed\) return visualQuality;\s+if \(topWorstComponentNeedsNativeShapeRefinement\(visualQuality\)\) return visualQuality;/u);
  assert.match(source, /shouldTryFinalComponentFidelityPrimitiveRefinement\(visualQuality\)[\s\S]+const finalWorstComponentFidelityPrimitives =/u);
});

test("native-only pictorial replacement converts verified icon crops to native shapes", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-pictorial-icons-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  const icon = { width: 20, height: 20, rgba: Buffer.alloc(20 * 20 * 4, 0) };
  for (let y = 3; y < 17; y += 1) {
    for (let x = 3; x < 17; x += 1) {
      const offset = (y * icon.width + x) * 4;
      icon.rgba[offset] = 36;
      icon.rgba[offset + 1] = 106;
      icon.rgba[offset + 2] = 215;
      icon.rgba[offset + 3] = 255;
    }
  }
  writePng(path.join(root, "assets", "icon.png"), icon);
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      pageIndex: 0,
      shapes: [],
      textBoxes: [{ id: "label", text: "A", box: { x: 5, y: 5, w: 10, h: 8 }, font: { family: "Arial", sizePt: 8, color: "#111111" }, source: { editable: true, nativeRebuild: true } }],
      images: [{
        id: "kg-icon",
        type: "fidelity-crop",
        assetPath: "assets/icon.png",
        box: { x: 20, y: 20, w: 20, h: 20 },
        source: {
          detector: "knowledge-graph-semantic-icon-crop",
          protectedMinimumUnit: true,
          expressionForm: "icon-or-illustration",
          intentionalMinimumUnitCrop: true
        }
      }]
    }]
  };

  const replacement = replacePictorialIconCropsWithNativeShapes(deck, root);
  assert.ok(replacement);
  assert.equal(replacement.vectorizedImages, 1);
  assert.equal(replacement.deck.pages[0].images.length, 0);
  assert.ok(replacement.deck.pages[0].shapes.some((shape) => shape.source?.detector === "dense-pictorial-icon-native-vector"));

  const baseline = {
    deck,
    removed: 1,
    quality: {
      passed: false,
      checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
      metrics: { "pixel-diff-ratio": 0.1, "foreground-missing-ratio": 0.05, "mean-absolute-delta": 12 }
    }
  };
  const candidate = await tryBuildNativeOnlyPictorialIconCandidate({
    root,
    baseline,
    sourceImages: [path.join(root, "source.png")],
    isCancellationRequested: async () => false,
    runBuild: async ({ pptxFile }) => { writeMinimalPptx(pptxFile); },
    rawImageQualityVerifier: async ({ deck: candidateDeck, collectRenderedPages }) => {
      collectRenderedPages([path.join(root, "rendered.png")]);
      assert.equal(candidateDeck.pages[0].images.length, 0);
      return {
        passed: false,
        checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
        metrics: { "pixel-diff-ratio": 0.1001, "foreground-missing-ratio": 0.0501, "mean-absolute-delta": 12.05 }
      };
    }
  });

  assert.ok(candidate);
  assert.equal(candidate.quality.metrics["native-only-pictorial-icons-accepted"], 1);
  assert.equal(candidate.quality.metrics["native-only-pictorial-icons-vectorized"], 1);
});

test("final component fidelity primitive refinement keeps bounded render attempts", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();

  assert.match(source, /const COMPONENT_FIDELITY_PRIMITIVE_MAX_RUNS = 160;/u);
  assert.match(source, /const COMPONENT_FIDELITY_PRIMITIVE_BUDGETS = Object\.freeze\(\[160, 80, 40, 20\]\);/u);
});

test("residual duplicate-removal gate fails closed when a residual lacks complete erase evidence", () => {
  const residualDeck = { pages: [{ images: [{ source: { residualCrop: true } }] }] };
  assert.deepEqual(residualDeduplicationStatus({ pages: [{ images: [] }] }), { required: false, passed: true, candidateObjects: 0, erasedObjects: 0 });
  assert.deepEqual(residualDeduplicationStatus(residualDeck, { candidateObjects: 3, erasedObjects: 3 }), { required: true, passed: true, candidateObjects: 3, erasedObjects: 3 });
  assert.equal(residualDeduplicationStatus(residualDeck, { candidateObjects: 3, erasedObjects: 2 }).passed, false);
  assert.equal(residualDeduplicationStatus(residualDeck, { candidateObjects: Number.NaN, erasedObjects: 0 }).passed, false);
});

test("structured source image resolver rejects empty, malicious, missing, and ambiguous page evidence", t => {
  const { resolveStructuredSourceImages } = require("../packages/slideclone-core/archetypes/structured-source-images");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "structured-source-image-resolver-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets")); fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), path.join(root, "assets", "source.png"));
  assert.throws(() => resolveStructuredSourceImages({ pages: [] }, root), /invalid page count/);
  assert.equal(resolveStructuredSourceImages({ pages: [{ source: { origin: "legacy" } }, {}] }, root), null);
  assert.throws(() => resolveStructuredSourceImages({ pages: [{ source: { pageImage: "../private.png" } }] }, root), /unsafe asset path|inside assets/);
  assert.throws(() => resolveStructuredSourceImages({ pages: [{ source: { pageImage: "assets/missing.png" } }] }, root), /missing/);
  assert.throws(() => resolveStructuredSourceImages({ pages: [{ source: { pageImage: "assets/source.png" } }, {}] }, root), /declared for every page/);
});

test("delivery artifact boundary bounds files and rechecks them after asynchronous work", () => {
  const { prepareDeliveryArtifacts, readDeliveryArtifact, MAX_ARTIFACT_BYTES } = require("../packages/slideclone-core/archetypes/delivery-artifacts");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-delivery-boundary-"));
  const file = path.join(root, "deck.pdf");
  const item = { name: "deck.pdf", file, mediaType: "application/pdf" };
  try {
    fs.writeFileSync(file, "%PDF");
    const prepared = prepareDeliveryArtifacts([item], root);
    assert.ok(Object.isFrozen(prepared) && Object.isFrozen(prepared[0]));
    assert.equal(readDeliveryArtifact(prepared[0], root).toString(), "%PDF");
    assert.equal(prepareDeliveryArtifacts(Array.from({ length: 32 }, (_, index) => ({ ...item, name: `deck-${index}.pdf` })), root).length, 32);
    for (const value of [null, {}, [null], [[]], [{ ...item, name: "../deck.pdf" }], [{ ...item, name: "a".repeat(129) }], [{ ...item, file: root }], [{ ...item, mediaType: "text/html" }], [{ ...item, file: path.join(root, "..", "private.pdf") }]]) assert.throws(() => prepareDeliveryArtifacts(value, root), /editable delivery artifact/);
    fs.truncateSync(file, 0);
    assert.throws(() => readDeliveryArtifact(prepared[0], root), /editable delivery artifact/);
    fs.truncateSync(file, MAX_ARTIFACT_BYTES + 1);
    assert.throws(() => prepareDeliveryArtifacts([item], root), /editable delivery artifact/);
    fs.unlinkSync(file);
    assert.throws(() => readDeliveryArtifact(prepared[0], root), error => error.message === "editable delivery artifact file is invalid");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("remote image path reconstructs a high-confidence three-panel knowledge graph as native structure", () => {
  const box = (text, x, y, w = 100, h = 24) => ({ id: text, text, box: { x, y, w, h } });
  const page = { textBoxes: [
    box("动态本体：知识图谱升级", 190, 20, 520, 42),
    box("传统知识图谱问题", 60, 105, 180, 28), box("动态本体思路", 385, 105, 160, 28), box("本体生长能力", 710, 105, 160, 28),
    box("公安系统", 80, 260), box("(身份证号)", 78, 290), box("监控系统", 200, 290), box("(人脸ID)", 202, 320), box("12345工单", 100, 380), box("(手机号)", 98, 410), box("网格员", 210, 382), box("(姓名+住址)", 206, 412),
    box("翻译层", 430, 190), box("人员", 445, 285), box("属性", 360, 355), box("事件", 540, 355),
    box("✓", 360, 205, 28, 28), box("✓", 570, 205, 28, 28), box("✓", 360, 390, 28, 28),
    box("高空事件", 700, 190), box("工单文本", 700, 285), box("视频数据", 700, 320), box("新型事件", 820, 285),
    box("数据接入层", 105, 560), box("本体生成层", 420, 560), box("应用服务层", 730, 560)
  ], shapes: [{ id: "bad-check", type: "ellipse", box: { x: 400, y: 300, w: 20, h: 20 }, source: { detector: "simple-status-icon" } }], images: [] };
  assert.ok(findKnowledgeGraphPanelModel(page.textBoxes, { widthPt: 960, heightPt: 720 }));
  const rebuilt = applyKnowledgeGraphPanelNativeRebuild(page, { widthPt: 960, heightPt: 720 }, { sourceImageWidthPx: 944, enableSemanticPictorialNative: true });
  assert.equal(rebuilt.matched, true);
  assert.ok(rebuilt.addedShapes >= 11);
  assert.ok(rebuilt.connectors >= 6);
  assert.equal(page.shapes.some((item) => item.id === "bad-check"), false);
  assert.ok(page.shapes.filter((item) => item.source?.nativeComponentRole === "node").every((item) => item.type === "roundRect" && item.style.fill === "#FFFFFF"));
  const pictorialShapes = page.shapes.filter((item) => item.source?.semanticPictorialNative === true);
  assert.ok(pictorialShapes.length >= 24);
  assert.ok(pictorialShapes.every((item) => item.source?.nativeComponentRole === "pictorial"));
  assert.ok(page.shapes.find((item) => item.id === "team-knowledge-graph-legacy-team-primary-head").box.y > 300);
  assert.ok(page.shapes.find((item) => item.id === "team-knowledge-graph-legacy-document-left").box.y > 300);
  assert.equal(page.images.length, 0);
  const frames = page.shapes.filter((item) => item.source?.preserveResidualInterior === true);
  assert.equal(frames.length, 4);
  assert.ok(frames.every((item) => item.type === "roundRect" && item.style.fill === "#F8FAFC"));
  assert.equal(page.shapes.filter((item) => item.source?.nativeComponentRole === "node").length, 5);
  const translatorFrame = page.shapes.find((item) => item.id === "team-knowledge-graph-node-2").box;
  const translatorLink = page.shapes.find((item) => item.id === "team-knowledge-graph-translator-hub").box;
  // A relationship must leave the node boundary, not run through its editable label.
  assert.ok(Math.abs(translatorLink.y - (translatorFrame.y + translatorFrame.h)) < 0.02);
  assert.ok(translatorLink.x >= translatorFrame.x && translatorLink.x <= translatorFrame.x + translatorFrame.w);
  const curvedRelationships = page.shapes.filter((item) => item.type === "arc" && item.source?.nativeComponentRole === "relationship");
  assert.equal(curvedRelationships.length, 2);
  assert.ok(curvedRelationships.every((item) => item.style.stroke === "#4F81E0" && item.style.strokeWidthPt === 2 && item.style.lineCap === "round"));
  assert.ok(curvedRelationships.every((item) => item.style.endArrowWidth === "medium" && item.style.endArrowLength === "medium"));
  assert.equal(curvedRelationships.filter((item) => item.style.endArrow === "triangle").length, 1);
  assert.equal(curvedRelationships.filter((item) => item.style.startArrow === "triangle").length, 1);
  const upperArc = curvedRelationships.find((item) => item.id.endsWith("right-high-target"));
  assert.equal(upperArc.style.endArrow, "triangle");
  assert.equal(upperArc.style.startArrow, undefined);
  assert.equal(page.shapes.some((item) => item.source?.detector === "team-knowledge-graph-node-6"), false);
  assert.equal(page.textBoxes.some((item) => item.text === "✓"), false);
  assert.deepEqual(page.source.semanticNativeStructure.connectorCalibration, {
    strokeWidthPt: 2, observedStrokeWidthPx: 2, pixelsPerPoint: 944 / 960,
    sampleCount: 1, usedFallback: false, quantumPt: 0.25, sourceImageWidthPx: 944
  });
  assert.deepEqual(page.intent, { rasterBackgroundAllowed: true, primarySemanticStructureNative: true, semanticStructureProfile: "knowledge-graph-three-panel-v1" });
  assert.equal(applyKnowledgeGraphPanelNativeRebuild({ textBoxes: [box("普通图片", 10, 10)], shapes: [] }, { widthPt: 960, heightPt: 720 }).matched, false);
});

test("full-slide residual is omitted only after semantic structure, icon refinement, and pictorial connectors all succeed", () => {
  assert.equal(shouldOmitFullSlideResidual({ matched: true, imageRefinement: { matched: true }, pictorialConnectors: { matched: true } }), true);
  assert.equal(shouldOmitFullSlideResidual({ matched: true, imageRefinement: { matched: true, nativePictorialPreserved: true }, pictorialConnectors: { matched: true, nativePictorialPreserved: true } }), true);
  assert.equal(shouldOmitFullSlideResidual({ matched: true, imageRefinement: { matched: true }, pictorialConnectors: { matched: false } }), false);
  assert.equal(shouldOmitFullSlideResidual({ matched: false }), false);
  assert.equal(shouldOmitFullSlideResidual(null), false);
});

test("knowledge graph crop refiner replaces mixed central crops with four bounded icon assets", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-knowledge-crops-"));
  const sourceFile = path.join(temporaryRoot, "source.png");
  const width = 960; const height = 720; const rgba = Buffer.alloc(width * height * 4, 255);
  for (const [x, y, w, h] of [[350, 160, 50, 50], [535, 160, 48, 50], [350, 355, 58, 55], [530, 355, 52, 60]]) {
    for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) {
      const offset = (py * width + px) * 4; rgba[offset] = 20; rgba[offset + 1] = 105; rgba[offset + 2] = 225;
    }
  }
  writePng(sourceFile, { width, height, rgba });
  const page = {
    source: { semanticNativeStructure: { profile: "knowledge-graph-three-panel-v1" } },
    shapes: [
      { type: "line", box: { x: 440, y: 280, w: -40, h: -70 }, source: { detector: "semantic-pictorial-1" } },
      { type: "line", box: { x: 500, y: 280, w: 35, h: -70 }, source: { detector: "semantic-pictorial-2" } },
      { type: "line", box: { x: 440, y: 310, w: -32, h: 45 }, source: { detector: "semantic-pictorial-3" } },
      { type: "line", box: { x: 500, y: 310, w: 30, h: 45 }, source: { detector: "semantic-pictorial-4" } }
    ],
    images: [
      { id: "left-icon", box: { x: 70, y: 160, w: 70, h: 70 }, source: { strategy: "local-fidelity-crop" } },
      { id: "mixed-central", box: { x: 340, y: 150, w: 190, h: 120 }, source: { strategy: "local-fidelity-crop" } },
      { id: "upper-right", box: { x: 525, y: 150, w: 72, h: 85 }, source: { strategy: "local-fidelity-crop" } },
      { id: "lower-left", box: { x: 340, y: 340, w: 88, h: 90 }, source: { strategy: "local-fidelity-crop" } },
      { id: "lower-right", box: { x: 520, y: 340, w: 78, h: 92 }, source: { strategy: "local-fidelity-crop" } }
    ]
  };
  try {
    const result = refineKnowledgeGraphIconCrops({ page, slideSize: { widthPt: 960, heightPt: 720 }, sourceFile, root: temporaryRoot });
    assert.deepEqual(result, { matched: true, replacedCrops: 4, createdCrops: 4 });
    assert.equal(page.images.length, 5);
    assert.equal(page.images[0].id, "left-icon");
    assert.ok(page.images.slice(1).every((item) => item.source.intentionalMinimumUnitCrop === true && item.box.w < 80 && item.box.h < 90));
    assert.ok(page.images.slice(1).every((item) => Array.isArray(item.source.intrusionEdges)));
    assert.ok(page.images.slice(1).every((item) => Number.isFinite(item.source.connectorAnchorPoint?.x) && Number.isFinite(item.source.connectorAnchorPoint?.y)));
    assert.ok(page.images.slice(1).every((item) => item.source.connectorAnchorPoint.x >= item.box.x && item.source.connectorAnchorPoint.x <= item.box.x + item.box.w));
    assert.ok(page.images.slice(1).every((item) => fs.existsSync(path.join(temporaryRoot, ...item.assetPath.split("/")))));
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("knowledge graph crop refiner removes central crops when semantic pictorial native shapes exist", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-knowledge-native-icons-"));
  const sourceFile = path.join(temporaryRoot, "source.png");
  const width = 960; const height = 720; const rgba = Buffer.alloc(width * height * 4, 255);
  writePng(sourceFile, { width, height, rgba });
  const pictorial = (id, x, y) => ({
    id,
    type: "ellipse",
    box: { x, y, w: 18, h: 18 },
    source: { semanticPictorialNative: true, nativeComponentRole: "pictorial" }
  });
  const page = {
    source: { semanticNativeStructure: { profile: "knowledge-graph-three-panel-v1" } },
    shapes: [
      { id: "team-knowledge-graph-node-1", type: "roundRect", box: { x: 430, y: 260, w: 100, h: 80 }, source: { nativeComponentRole: "node" } },
      pictorial("native-a", 350, 170), pictorial("native-b", 375, 170),
      pictorial("native-c", 540, 170), pictorial("native-d", 565, 170),
      pictorial("native-e", 350, 360), pictorial("native-f", 540, 360)
    ],
    images: [
      { id: "left-icon", box: { x: 70, y: 160, w: 70, h: 70 }, source: { strategy: "local-fidelity-crop" } },
      { id: "mixed-central", box: { x: 340, y: 150, w: 190, h: 120 }, source: { strategy: "local-fidelity-crop" } },
      { id: "upper-right", box: { x: 525, y: 150, w: 72, h: 85 }, source: { strategy: "local-fidelity-crop" } },
      { id: "lower-left", box: { x: 340, y: 340, w: 88, h: 90 }, source: { strategy: "local-fidelity-crop" } },
      { id: "lower-right", box: { x: 520, y: 340, w: 78, h: 92 }, source: { strategy: "local-fidelity-crop" } }
    ]
  };
  try {
    const result = refineKnowledgeGraphIconCrops({ page, slideSize: { widthPt: 960, heightPt: 720 }, sourceFile, root: temporaryRoot });
    assert.equal(result.matched, true);
    assert.equal(result.replacedCrops, 4);
    assert.equal(result.createdCrops, 0);
    assert.equal(result.nativePictorialPreserved, true);
    assert.ok(result.createdNativeShapes >= 12);
    assert.deepEqual(page.images.map((item) => item.id), ["left-icon"]);
    assert.equal(page.shapes.some((item) => /dynamic-cube/u.test(item.id)), false);
    assert.ok(page.shapes.some((item) => item.id === "team-knowledge-graph-dynamic-fitted-1-front"));
    assert.ok(page.shapes.some((item) => item.id === "team-knowledge-graph-pictorial-hub-fitted-1"));
    assert.ok(page.shapes.filter((item) => item.source?.nativeComponentRole === "relationship").every((item) => item.style.endArrowWidth === "medium" && item.style.endArrowLength === "medium"));
    assert.equal(fs.existsSync(path.join(temporaryRoot, "assets")), false);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("knowledge graph pictorial connectors replace relationships previously carried by the full-slide raster", () => {
  const image = (id, x, y, connectorAnchorPoint = null) => ({ id, box: { x, y, w: 60, h: 60 }, source: { strategy: "local-fidelity-crop", connectorAnchorPoint } });
  const page = {
    source: { semanticNativeStructure: { profile: "knowledge-graph-three-panel-v1" } },
    shapes: [{ id: "team-knowledge-graph-node-1", type: "roundRect", box: { x: 430, y: 260, w: 100, h: 80 }, source: { editable: true } }],
    images: [image("left-a", 60, 150), image("left-b", 205, 150), image("left-c", 60, 340), image("left-d", 205, 340), image("center-a", 345, 150, { x: 398, y: 202 }), image("center-b", 535, 150, { x: 542, y: 203 }), image("center-c", 345, 350, { x: 397, y: 356 }), image("center-d", 535, 350, { x: 542, y: 356 })]
  };
  const result = addKnowledgeGraphPictorialConnectors(page, { widthPt: 960, heightPt: 720 });
  assert.deepEqual(result, { matched: true, added: 7 });
  assert.equal(page.shapes.filter((item) => item.source?.nativeComponentRole === "relationship").length, 7);
  assert.equal(page.shapes.filter((item) => item.style?.dash === "dash").length, 3);
  assert.ok(page.shapes.filter((item) => item.source?.nativeComponentRole === "relationship").every((item) => item.style.strokeWidthPt === 2));
  const pictorial = page.shapes.filter((item) => /pictorial-hub/u.test(item.id));
  assert.ok(pictorial.slice(0, 2).every((item) => item.box.x === 480 && item.box.y === 260));
  assert.ok(pictorial.slice(2).every((item) => item.box.x === 480 && item.box.y === 340));
  assert.deepEqual({ x: pictorial[0].box.x + pictorial[0].box.w, y: pictorial[0].box.y + pictorial[0].box.h }, { x: 398, y: 202 });
});

test("real native rebuild removes native diagram objects from its fidelity residual", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-native-diagram-"));
  const source = path.join(temporaryRoot, "diagram.png");
  writeThreeCardDiagram(source);
  const lines = [
    { text: "Input", box: { x: 130, y: 235, w: 100, h: 30 } },
    { text: "Process", box: { x: 425, y: 235, w: 110, h: 30 } },
    { text: "Output", box: { x: 730, y: 235, w: 100, h: 30 } }
  ];
  writePng(source, require("./helpers/ocr-ink-fixture.cjs").paintOcrFixtureInk(readPng(source), lines));
  const rebuild = createRawImageNativeRebuilder({ rebuildDeckFromWorkDir, createFullSlideResidual });
  try {
    const result = await rebuild({
      root: temporaryRoot,
      metadata: { inputFile: source, assetPath: "assets/source.png", dimensions: { widthPx: 960, heightPx: 540 } },
      ocr: { lines },
      isCancellationRequested: async () => false
    });
    assert.ok(result.metrics.shapes >= 3);
    assert.equal(result.metrics.images, 1);
    assert.equal(result.deck.pages[0].images[0].source.strategy, "full-slide-object-erased-residual");
    assert.deepEqual(result.deck.pages[0].images[0].source.componentRenderStrategy, { mode: "preserve-crop-with-native-overlays" });
    assert.equal(result.deck.pages[0].images[0].source.nativeObjectsErased, true);
    assert.equal(result.residual.erasedObjects, result.residual.candidateObjects);
    assert.ok(result.residual.erasedObjects >= 3);
    assert.ok(fs.existsSync(path.join(temporaryRoot, "assets", "deck-p01-full-residual.png")));
    const residualImage = readPng(path.join(temporaryRoot, "assets", "deck-p01-full-residual.png"));
    const nativeCard = result.deck.pages[0].shapes.find((item) => item.type !== "line" && item.box?.w > 50 && item.box?.h > 30);
    assert.ok(nativeCard);
    const sampleX = Math.round(nativeCard.box.x + nativeCard.box.w / 2);
    const sampleY = Math.round(nativeCard.box.y + nativeCard.box.h / 2);
    const sampleOffset = (sampleY * residualImage.width + sampleX) * 4;
    assert.ok([...residualImage.rgba.subarray(sampleOffset, sampleOffset + 3)].every((channel) => channel >= 240));
    assert.ok(result.deck.pages[0].shapes.every((item) => !item.style?.nativeComponentGroupId));
    assert.ok(result.deck.pages[0].textBoxes.every((item) => !item.style?.nativeComponentGroupId));
    assert.equal(path.isAbsolute(result.sourceImage), true);
    assert.ok(fs.existsSync(result.sourceImage));
    assert.equal(result.deck.pages[0].sourceImage, "assets/source.png");
    assert.ok(result.deck.pages[0].textBoxes.every((item) => item.source.pageImage === "assets/source.png"));
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("visual fallback erases accepted native line and panel pixels from the retained source image", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-visual-fallback-erase-"));
  const sourceFile = path.join(temporaryRoot, "source.png");
  const outputFile = path.join(temporaryRoot, "erased.png");
  const width = 160; const height = 90;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 30; y < 50; y += 1) {
    for (let x = 20; x < 70; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 0; rgba[offset + 1] = 150; rgba[offset + 2] = 136; rgba[offset + 3] = 255;
    }
  }
  for (let x = 90; x < 130; x += 1) {
    const offset = (40 * width + x) * 4;
    rgba[offset] = 51; rgba[offset + 1] = 102; rgba[offset + 2] = 255; rgba[offset + 3] = 255;
  }
  writePng(sourceFile, { width, height, rgba });
  try {
    const result = writeTextErasedVisualFallbackAsset({
      sourceFile,
      outputFile,
      slideSize: { widthPt: 160, heightPt: 90 },
      eraseNativeShapes: true,
      page: {
        textBoxes: [],
        shapes: [
          { id: "panel", type: "rect", box: { x: 20, y: 30, w: 50, h: 20 }, style: { fill: "#009688" }, source: { detector: "line-text-native-color-panel" } },
          { id: "line", type: "line", box: { x: 90, y: 40, w: 40, h: 0 }, style: { strokeWidthPt: 1.5 }, source: { detector: "long-axis-line" } }
        ]
      }
    });
    const erased = readPng(outputFile);
    assert.equal(result.shapeMasks, 2);
    assert.ok(result.erasedPixels > 1000);
    const panelOffset = (35 * width + 30) * 4;
    const lineOffset = (40 * width + 100) * 4;
    assert.ok(erased.rgba[panelOffset] > 240 && erased.rgba[panelOffset + 1] > 240 && erased.rgba[panelOffset + 2] > 240);
    assert.ok(erased.rgba[lineOffset] > 240 && erased.rgba[lineOffset + 1] > 240 && erased.rgba[lineOffset + 2] > 240);
    const linesOnlyFile = path.join(temporaryRoot, "lines-only.png");
    const linesOnly = writeTextErasedVisualFallbackAsset({
      sourceFile,
      outputFile: linesOnlyFile,
      slideSize: { widthPt: 160, heightPt: 90 },
      eraseNativeShapes: true,
      eraseNativeShapeMode: "lines",
      page: {
        textBoxes: [],
        shapes: [
          { id: "panel", type: "rect", box: { x: 20, y: 30, w: 50, h: 20 }, style: { fill: "#009688" }, source: { detector: "line-text-native-color-panel" } },
          { id: "line", type: "line", box: { x: 90, y: 40, w: 40, h: 0 }, style: { strokeWidthPt: 1.5 }, source: { detector: "long-axis-line" } }
        ]
      }
    });
    const lineErased = readPng(linesOnlyFile);
    assert.equal(linesOnly.shapeMasks, 1);
    assert.equal(lineErased.rgba[panelOffset], 0);
    assert.equal(lineErased.rgba[panelOffset + 1], 150);
    assert.equal(lineErased.rgba[panelOffset + 2], 136);
    assert.ok(lineErased.rgba[lineOffset] > 240 && lineErased.rgba[lineOffset + 1] > 240 && lineErased.rgba[lineOffset + 2] > 240);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("residual erase collection deduplicates geometry and excludes explicitly non-editable graphics", () => {
  const box = { x: 10, y: 10, w: 100, h: 40 };
  const objects = residualEraseObjects({
    textBoxes: [{ id: "text-a", box }, { id: "text-b", box }],
    shapes: [{ id: "native", type: "roundRect", box: { x: 150, y: 10, w: 100, h: 40 }, source: { editable: true } }, { id: "frame", type: "roundRect", box: { x: 20, y: 80, w: 400, h: 300 }, source: { editable: true, preserveResidualInterior: true } }, { id: "raster", type: "roundRect", box: { x: 300, y: 10, w: 100, h: 40 }, source: { editable: false } }],
    tables: [], charts: [], icons: []
  });
  assert.deepEqual(objects.map((item) => item.id), ["text-a", "native"]);
  assert.deepEqual(residualEraseObjects({ textBoxes: [], shapes: [], tables: [], charts: [], icons: [], images: [{ id: "crop", box: { x: 40, y: 40, w: 20, h: 20 }, source: { editable: false } }] }, { includeLocalFidelityImages: true }).map((item) => item.id), ["crop"]);
  assert.throws(() => residualEraseObjects({ textBoxes: [{ id: "bad", box: { x: 0, y: 0, w: Number.NaN, h: 1 } }] }), /invalid/);
  assert.throws(() => residualEraseObjects({ images: [{ id: "bad-crop", box: { x: 0, y: 0, w: 0, h: 1 } }] }, { includeLocalFidelityImages: true }), /invalid/);
});

test("team native rebuild preserves refined local crops and erases their source pixels from the full residual", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-native-local-crops-"));
  const source = path.join(temporaryRoot, "source.png");
  fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), source);
  let erasedObjects = [];
  const rebuild = createRawImageNativeRebuilder({
    preserveLocalFidelityImages: true,
    rebuildDeckFromWorkDir: (workDir) => {
      const rebuilt = JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8"));
      const assetDir = path.join(temporaryRoot, "assets"); fs.mkdirSync(assetDir, { recursive: true });
      fs.copyFileSync(source, path.join(assetDir, "refined-icon.png"));
      rebuilt.pages[0].shapes.push({ id: "native-line", type: "line", box: { x: 10, y: 10, w: 40, h: 0 }, source: { editable: true } });
      rebuilt.pages[0].images.push({ id: "refined-icon", assetPath: "assets/refined-icon.png", box: { x: 70, y: 70, w: 24, h: 24 }, source: { editable: false, iconCropRefined: true } });
      return rebuilt;
    },
    createFullSlideResidual: async ({ sourceFile, outputFile, objects }) => {
      erasedObjects = objects;
      fs.mkdirSync(path.dirname(outputFile), { recursive: true }); fs.copyFileSync(sourceFile, outputFile);
      return { erasedObjects: objects.length };
    }
  });
  try {
    const result = await rebuild({ root: temporaryRoot, metadata: { inputFile: source, assetPath: "assets/source.png", dimensions: { widthPx: 960, heightPx: 540 } }, ocr: { lines: [] }, isCancellationRequested: async () => false });
    assert.deepEqual(result.deck.pages[0].images.map((item) => item.id), ["full-slide-residual", "refined-icon"]);
    assert.equal(result.deck.pages[0].images[0].source.fullSlideResidual, true);
    assert.equal(result.deck.pages[0].images[1].source.iconCropRefined, true);
    assert.equal(result.deck.meta.preservedLocalFidelityImages, 1);
    assert.ok(erasedObjects.some((item) => item.id === "refined-icon"));
    assert.equal(result.residual.erasedObjects, result.residual.candidateObjects);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team native rebuild calibrates newly created semantic connectors before residual erasure", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-semantic-edge-order-"));
  const source = path.join(root, "source.png");
  writePng(source, { width: 960, height: 720, rgba: Buffer.alloc(960 * 720 * 4, 255) });
  const lines = [
    ["动态本体：知识图谱升级", 190, 20, 520, 42],
    ["传统知识图谱问题", 60, 105, 180, 28], ["动态本体思路", 385, 105, 160, 28], ["本体生长能力", 710, 105, 160, 28],
    ["公安系统", 80, 260], ["监控系统", 200, 290], ["12345工单", 100, 380],
    ["翻译层", 430, 190, 60, 24], ["人员", 445, 285, 58, 37],
    ["高空抛物", 700, 190, 84, 25], ["工单文本\n视频数据", 700, 285, 84, 48], ["新型事件", 820, 285, 82, 30],
    ["可信连接层", 105, 560, 140, 31], ["动态本体层", 420, 560, 130, 31], ["智能体应用层", 730, 560, 145, 31]
  ].map(([text, x, y, w = 100, h = 24]) => ({ text, box: { x, y, w, h }, confidence: 0.99 }));
  let calibrated = false;
  let erasedCalibrated = false;
  const rebuild = createRawImageNativeRebuilder({
    rebuildDeckFromWorkDir: (workDir) => JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8")),
    refineNativeEdges: ({ page }) => {
      const next = structuredClone(page);
      const semanticLines = next.shapes.filter(item => item.type === "line" && item.source?.semanticNativeStructure === true);
      for (const line of semanticLines) {
        line.style.strokeWidthPt = 2.25;
        line.source.sourceNativeEdgeRefinement = { provider: "test", kind: "line", sides: 1 };
      }
      if (semanticLines.length) calibrated = true;
      return { page: next, evidence: { linesRefined: semanticLines.length } };
    },
    createFullSlideResidual: async ({ sourceFile, outputFile, objects }) => {
      erasedCalibrated = objects.some(item => item.type === "line" && item.style?.strokeWidthPt === 2.25);
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.copyFileSync(sourceFile, outputFile);
      return { erasedObjects: objects.length };
    }
  });
  try {
    const result = await rebuild({ root, metadata: { inputFile: source, assetPath: "assets/source.png",
      dimensions: { widthPx: 960, heightPx: 720 } }, ocr: { lines }, isCancellationRequested: async () => false });
    assert.equal(calibrated, true);
    assert.equal(erasedCalibrated, true);
    assert.ok(result.deck.meta.sourceNativeEdgeRefinement.linesRefined > 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("team native rebuild refines source-backed native edges before residual erasure", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-native-source-edge-"));
  const source = path.join(temporaryRoot, "source.png");
  const width = 160; const height = 90; const rgba = Buffer.alloc(width * height * 4, 255);
  writePng(source, { width, height, rgba });
  let erasedObjects = [];
  const rebuild = createRawImageNativeRebuilder({
    rebuildDeckFromWorkDir: (workDir) => {
      const rebuilt = JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8"));
      rebuilt.pages[0].shapes.push({
        id: "native-offset-line",
        type: "line",
        box: { x: 76, y: 12, w: 0, h: 64 },
        style: { stroke: "#B5DFCA", strokeWidthPt: 0.9 },
        source: { editable: true, nativeRebuild: true, detector: "long-axis-line" }
      });
      return rebuilt;
    },
    refineNativeEdges: ({ page, image }) => {
      assert.equal(image.width, width);
      const next = structuredClone(page);
      next.shapes[0].box = { ...next.shapes[0].box, x: 80 };
      next.shapes[0].source = { ...next.shapes[0].source, sourceNativeEdgeRefinement: { provider: "test", kind: "line", sides: 1 } };
      return { page: next, evidence: { candidates: 1, rectsRefined: 0, partialSideLines: 0, panelsWithoutStroke: 0, linesRefined: 1, samples: 200000 } };
    },
    createFullSlideResidual: async ({ sourceFile, outputFile, objects }) => {
      erasedObjects = objects;
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.copyFileSync(sourceFile, outputFile);
      return { erasedObjects: objects.length };
    }
  });
  try {
    const result = await rebuild({ root: temporaryRoot, metadata: { inputFile: source, assetPath: "assets/source.png", dimensions: { widthPx: width, heightPx: height } }, ocr: { lines: [] }, isCancellationRequested: async () => false });
    assert.equal(result.deck.pages[0].shapes[0].box.x, 80);
    assert.equal(erasedObjects.find((item) => item.id === "native-offset-line")?.box.x, 80);
    assert.equal(result.deck.meta.sourceNativeEdgeRefinement.linesRefined, 1);
    assert.equal(result.deck.meta.sourceNativeEdgeRefinement.samples, 100000);
    assert.equal(result.residual.erasedObjects, result.residual.candidateObjects);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("local deployment rejects unsafe existing secret files before Docker without printing values", () => {
  const root = path.resolve(__dirname, "..");
  const script = path.join(root, "scripts", "team-runtime-local-deploy.ps1");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-local-secret-import-"));
  const secretFile = path.join(directory, "common-tools-public.env");
  const run = () => spawnSync("pwsh", ["-NoProfile", "-File", script, "-Mode", "Plan", "-Project", "common-tools-public", "-ExistingSecretFile", secretFile], {
    cwd: root, encoding: "utf8", env: { PATH: process.env.PATH || "" }, windowsHide: true
  });
  try {
    const missing = run();
    assert.equal(missing.status, 1);
    assert.match(`${missing.stdout}${missing.stderr}`, /Existing secret file is unavailable/u);
    fs.writeFileSync(secretFile, "COMMON_TOOLS_PROJECT=wrong-project\nCOMMON_TOOLS_POSTGRES_PASSWORD=private-marker\n");
    const wrongProject = run();
    assert.equal(wrongProject.status, 1);
    assert.match(`${wrongProject.stdout}${wrongProject.stderr}`, /belongs to another project/u);
    assert.doesNotMatch(`${wrongProject.stdout}${wrongProject.stderr}`, /private-marker/u);
    fs.writeFileSync(secretFile, "COMMON_TOOLS_PROJECT=common-tools-public\nCOMMON_TOOLS_POSTGRES_PASSWORD=private-marker\nCOMMON_TOOLS_POSTGRES_PASSWORD=duplicate\n");
    const duplicate = run();
    assert.equal(duplicate.status, 1);
    assert.match(`${duplicate.stdout}${duplicate.stderr}`, /invalid variable name/u);
    assert.doesNotMatch(`${duplicate.stdout}${duplicate.stderr}`, /private-marker|duplicate/u);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Deck IR admission rejects malformed page collections and boxes before building", () => {
  const { validateDeckIr } = require("../packages/slideclone-worker-adapter/team-worker");
  assert.deepEqual(validateDeckIr(deck(), os.tmpdir()), { pages: 1, assets: 0 });
  assert.deepEqual(validateDeckIr(deck({ pages: [{}] }), os.tmpdir()), { pages: 1, assets: 0 });
  for (const page of [null, 1, [], { pageIndex: -1 }, { pageIndex: 0.5 }, { shapes: {} }, { images: [null] }, { textBoxes: [{ text: 4 }] }, { shapes: [{ box: { x: 0, y: 0, w: -1, h: 10 } }] }, { shapes: [{ box: { x: 0, y: 0, w: "1", h: 10 } }] }, { shapes: [{ box: { x: 0 } }] }]) {
    assert.throws(() => validateDeckIr(deck({ pages: [page] }), os.tmpdir()), /editable deck/);
  }
  const zeroWidthLine = { shapes: [{ type: "line", box: { x: -1, y: 0, w: 0, h: 10 } }] };
  assert.equal(validateDeckIr(deck({ pages: [zeroWidthLine] }), os.tmpdir()).pages, 1);
  for (const type of ["line", "LINE"]) {
    for (const box of [{ x: 100, y: 100, w: -50, h: 0 }, { x: 100, y: 100, w: 0, h: -50 }, { x: 100, y: 100, w: -50, h: -50 }]) {
      assert.equal(validateDeckIr(deck({ pages: [{ shapes: [{ type, box }] }] }), os.tmpdir()).pages, 1);
    }
  }
  for (const collection of ["images", "tables", "charts"]) {
    assert.throws(() => validateDeckIr(deck({ pages: [{ [collection]: [{ type: "line", box: { x: 0, y: 0, w: -1, h: 10 } }] }] }), os.tmpdir()), /editable deck object box/);
  }
  assert.throws(() => validateDeckIr(deck({ pages: [{ shapes: [{ type: "line", box: { x: 0, y: 0, w: -100001, h: 10 } }] }] }), os.tmpdir()), /editable deck/);
});

test("Deck IR checks table and chart data before OpenXML deserialization", () => {
  const { validateDeckIr } = require("../packages/slideclone-worker-adapter/team-worker");
  const admit = (page) => validateDeckIr(deck({ pages: [Object.fromEntries(Object.entries(page).map(([key, items]) => [key, items.map(item => ({ box: { x: 0, y: 0, w: 100, h: 50 }, ...item }))]))] }), os.tmpdir());
  assert.equal(admit({ tables: [{ rows: [["A", "42"], ["B"]] }], charts: [{ categories: ["A"], series: [{ name: "Value", values: [1, -2] }] }] }).pages, 1);
  assert.equal(admit({ tables: [{ rows: null }], charts: [{ categories: null, values: [], series: null }] }).pages, 1);
  // All three collections bind to VisualElementIr, including its optional Rows.
  for (const key of ["shapes", "images", "tables"]) {
    for (const rows of [null, [], [[]], [["A", "42"], ["B"]]]) assert.equal(admit({ [key]: [{ rows }] }).pages, 1);
    for (const rows of [{}, [null], [[1]], [[{}]], [[null]], Array(10001).fill([])]) assert.throws(() => admit({ [key]: [{ rows }] }), /editable deck/);
  }
  for (const chart of [{ categories: [1] }, { categories: ["x".repeat(4097)] }, { values: ["1"] }, { values: [null] }, { values: [Infinity] }, { series: {} }, { series: [null] }, { series: [{}] }, { series: [{ name: 1, values: [1] }] }, { series: [{ Name: 1, values: [1] }] }, { series: [{ name: "case alias", Values: [1] }] }, { series: Array.from({ length: 65 }, () => ({ values: [1] })) }]) assert.throws(() => admit({ charts: [chart] }), /editable deck/);
  assert.equal(admit({ charts: [{ series: Array.from({ length: 64 }, () => ({ name: "", values: [0] })) }] }).pages, 1);
  assert.equal(admit({ charts: [{ values: Array(10000).fill(0) }] }).pages, 1);
  assert.throws(() => admit({ charts: [{ values: Array(10001).fill(0) }] }), /editable deck/);
});

test("Deck IR admits bounded visual fallback pixel-erasure counts", () => {
  const { validateDeckIr } = require("../packages/slideclone-worker-adapter/team-worker");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-visual-fallback-pixels-"));
  try {
    const assetDir = path.join(temporaryRoot, "assets");
    fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(path.join(assetDir, "fallback.png"), Buffer.from("png"));
    const image = {
      id: "fallback",
      type: "fidelity-crop",
      assetPath: "assets/fallback.png",
      box: { x: 0, y: 0, w: 960, h: 540 },
      source: {
        editable: false,
        detector: "foreground-graphic-crop",
        erasedNativeTextPixels: 250000
      }
    };
    assert.equal(validateDeckIr(deck({ pages: [{ images: [image] }] }), temporaryRoot).assets, 1);
    assert.throws(() => validateDeckIr(deck({ pages: [{ images: [{ ...image, source: { ...image.source, erasedNativeTextPixels: 40000001 } }] }] }), temporaryRoot), /invalid number/);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("Deck IR rejects rendered objects without boxes instead of crashing the builder", () => {
  const { validateDeckIr } = require("../packages/slideclone-worker-adapter/team-worker");
  for (const collection of ["textBoxes", "shapes", "images", "tables", "charts"]) {
    assert.throws(() => validateDeckIr(deck({ pages: [{ [collection]: [{ id: "missing-box", rows: [["A", "B"]] }] }] }), os.tmpdir()), (error) => error.message === "editable deck object box is required");
    assert.throws(() => validateDeckIr(deck({ pages: [{ [collection]: [{ box: null }] }] }), os.tmpdir()), /editable deck/);
  }
});

test("Deck IR rejects case-insensitive model aliases and ambiguous fields", () => {
  const { validateDeckIr } = require("../packages/slideclone-worker-adapter/team-worker");
  const box = { x: 0, y: 0, w: 10, h: 10 };
  for (const page of [{ Shapes: [{ box }] }, { images: [{ box, AssetPath: "../private.png" }] }, { images: [{ box, Source: { pageImage: "../private.png" } }] }, { textBoxes: [{ box, Text: "unvalidated" }] }]) {
    assert.throws(() => validateDeckIr(deck({ pages: [page] }), os.tmpdir()), /field casing/);
  }
  assert.throws(() => validateDeckIr({ ...deck(), Pages: [{}] }, os.tmpdir()), /ambiguous field casing/);
  assert.throws(() => validateDeckIr(deck({ pages: [{ shapes: [{ box, source: { assetPath: "assets/a.png", AssetPath: "../private.png" } }] }] }), os.tmpdir()), /ambiguous field casing/);
  assert.throws(() => validateDeckIr(deck({ pages: [{ images: [{ box, style: { AssetPath: "../private.png" } }] }] }), os.tmpdir()), /asset/);
});

test("Deck IR page model admission matches builder indices and optional dimensions", () => {
  const { validateDeckIr } = require("../packages/slideclone-worker-adapter/team-worker");
  const admit = (pages) => validateDeckIr(deck({ pages }), os.tmpdir());
  assert.equal(admit([{}]).pages, 1);
  assert.equal(admit([{}, { pageIndex: 9999, slideSize: { widthPt: 960, heightPt: 540 } }]).pages, 2);
  assert.equal(admit([{ pageIndex: 2, slideSize: null }, { pageIndex: 1, slideSize: {} }]).pages, 2);
  for (const pages of [[{}, {}], [{}, { pageIndex: 0 }], [{ pageIndex: 1 }, { pageIndex: 1 }], [{ pageIndex: 10000 }], [{ pageIndex: -1 }], [{ pageIndex: 0.5 }], [{ pageIndex: null }]]) {
    assert.throws(() => admit(pages), /editable deck page index/);
  }
  for (const slideSize of ["private-content", [], false, { widthPt: "private-content" }, { heightPt: null }, { WidthPt: 960 }, { heightPt: Infinity }]) {
    assert.throws(() => admit([{ slideSize }]), error => /editable deck/.test(error.message) && !error.message.includes("private-content"));
  }
  assert.throws(() => admit([{ SlideSize: "private-content" }]), /field casing/);
});

test("Deck IR validates page metadata, placeholder bindings and model point lists", () => {
  const { validateDeckIr } = require("../packages/slideclone-worker-adapter/team-worker");
  const admit = (page) => validateDeckIr(deck({ pages: [page] }), os.tmpdir());
  const box = { x: 0, y: 0, w: 100, h: 100 };
  assert.equal(admit({ speakerNotes: "Note", preserveTemplateSlide: false, citations: [{ id: "ref", title: "Source", locator: "local reference" }], intent: { templatePlaceholderCapacity: 1, templatePlaceholderBindings: [{ objectId: "shape", collection: "charts", placeholderType: "chart", placeholderIndex: 0 }] }, shapes: [{ id: "shape", box, points: [{ x: -1, y: 2 }, { x: 3, y: 4 }] }] }).pages, 1);
  assert.equal(admit({ intent: null, citations: [], speakerNotes: null }).pages, 1);
  for (const page of [{ speakerNotes: {} }, { preserveTemplateSlide: "false" }, { citations: [null] }, { citations: [{ title: 1 }] }, { intent: [] }, { intent: { templatePlaceholderCapacity: 0.5 } }, { intent: { templatePlaceholderBindings: [false] } }, { intent: { templatePlaceholderBindings: [{ placeholderIndex: "1" }] } }, { intent: { TemplateLayoutName: "alias" } }, { shapes: [{ box, points: [[1, 2]] }] }, { shapes: [{ box, points: [{ x: 1 }] }] }, { shapes: [{ box, points: [{ X: 1, y: 2 }] }] }]) assert.throws(() => admit(page), /editable deck/);
});
