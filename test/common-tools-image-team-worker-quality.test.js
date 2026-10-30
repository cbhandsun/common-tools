"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { addNativeResidualPrimitives, changedComponentKeysFromFit, compactDeckFinalQualitySourceProvenance, compactDeckLateShapeSourceBudgetProvenance, compactDeckLateTextSourceBudgetProvenance, compactDeckNativeShapeSourceProvenance, createImageToEditableArchiveHandler, finalRefinementQualityAcceptable, fitDeckEditableTextFontFamily, fitDeckLightCardGeometry, fitDeckLightCardSideAccents, fitDeckLightCardSourceStrokes, fitDeckLightCardStrokeColors, fitDeckLightCardStrokes, fitDeckLowContrastFooterMarks, fitDeckLowContrastFooterPrimitives, fitDeckLowSaturationPanelFills, fitDeckMissingNativeVisualAtomShapes, fitDeckNativeShapeThinStrokes, fitDeckOcrEvidenceToSource, fitDeckSaturatedColorPanels, fitDeckSourceVerticalLines, fitDeckTextFidelityPrimitives, fitDeckWorstComponentFidelityPrimitives, fitDeckWorstConnectorStyles, fitDeckWorstRichOcrTextLayout, fitDeckWorstTextArrowGlyphs, fitDeckWorstTextBoxNudge, fitDeckWorstTextColors, fitDeckWorstTextComposite, fitDeckWorstTextInkBoxes, fitDeckWorstTextScale, fitDeckWorstTextWeight, focusedCandidateLimits, focusedLightCardStrokeWidthCandidates, isReliableMissingNativeVisualAtom, lightCardSourceStrokeQualityAcceptable, missingNativeTargetInkRunShapes, nativeOnlyMissingNativeLinesDoesNotRegress, nativeOnlyRefinementDoesNotMateriallyRegress, nativeOnlyResidualQualityAcceptable, removeFullSlideResidualImages, replacePictorialIconCropsWithNativeShapes, residualDeduplicationStatus, targetComponentQualityImproves, targetMissingNativeComponentQualityImproves, tryBuildFinalLineTextCoveredCropDropCandidate, tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate, tryBuildNativeOnlyPictorialIconCandidate, tryBuildNativeOnlyRichOcrTextLayoutCandidate, validateDeckIr, worstTextBoxNudgeCandidates, worstTextCompositeScaleCandidates } = require("../packages/slideclone-worker-adapter/team-worker");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { writePng } = require("../packages/slideclone-core/png");
const { addLowContrastFooterNativeMarks, boundedOcrSourceDeck, correctContextualOcrLines, createRawImageNativeRebuilder, largeRasterEditability, nativeObjectMetrics, residualEraseObjects, shouldOmitFullSlideResidual, writeTextErasedVisualFallbackAsset } = require("../packages/slideclone-core/team-native-rebuild");
const { assessStrictNativeCandidate } = require("../packages/slideclone-worker-adapter/candidate-quality-policy");
const { deck } = require('./helpers/image-team-worker.cjs');

test("final refinement quality accepts strict visual improvements despite diagnostic component churn", () => {
  const baselineQuality = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.151354,
      "foreground-missing-ratio": 0.143946,
      "mean-absolute-delta": 14.1304,
      "component-regions-attention": 31,
      "worst-component-foreground-missing-ratio": 0.851,
      "worst-component-normalized-severity": 2.29
    }
  };
  const strictImprovement = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.151216,
      "foreground-missing-ratio": 0.143441,
      "mean-absolute-delta": 14.1303,
      "component-regions-attention": 32,
      "worst-component-foreground-missing-ratio": 0.9
    }
  };
  const foregroundRegression = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.1511,
      "foreground-missing-ratio": 0.144,
      "mean-absolute-delta": 14.12,
      "component-regions-attention": 31
    }
  };
  const componentRepair = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.151374,
      "foreground-missing-ratio": 0.1435,
      "mean-absolute-delta": 14.13,
      "component-regions-attention": 30,
      "worst-component-normalized-severity": 2.02
    }
  };
  const noisyComponentRepair = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.1515,
      "foreground-missing-ratio": 0.1435,
      "mean-absolute-delta": 14.13,
      "component-regions-attention": 30,
      "worst-component-normalized-severity": 2.02
    }
  };

  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality: strictImprovement }), true);
  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality: foregroundRegression }), false);
  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality: componentRepair }), true);
  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality: noisyComponentRepair }), false);
});

test("final refinement quality accepts tiny pixel noise when foreground and mean improve", () => {
  const baselineQuality = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.137835,
      "foreground-missing-ratio": 0.117445,
      "mean-absolute-delta": 12.866,
      "component-regions-attention": 20,
      "worst-component-normalized-severity": 1.604938
    }
  };
  const tinyPixelNoise = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.137836,
      "foreground-missing-ratio": 0.117357,
      "mean-absolute-delta": 12.846,
      "component-regions-attention": 20,
      "worst-component-normalized-severity": 1.604938
    }
  };
  const severityRegression = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      ...tinyPixelNoise.metrics,
      "worst-component-normalized-severity": 1.7
    }
  };

  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality: tinyPixelNoise }), true);
  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality: severityRegression }), false);
});

test("final refinement quality accepts tiny pixel noise for major worst-component repair", () => {
  const baselineQuality = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.156905,
      "foreground-missing-ratio": 0.176592,
      "mean-absolute-delta": 13.959,
      "component-regions-attention": 37,
      "worst-component-normalized-severity": 2.838
    }
  };
  const repairedWorst = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.157043,
      "foreground-missing-ratio": 0.175935,
      "mean-absolute-delta": 13.958,
      "component-regions-attention": 36,
      "worst-component-normalized-severity": 1.515
    }
  };
  const tooMuchPixelNoise = {
    ...repairedWorst,
    metrics: { ...repairedWorst.metrics, "pixel-diff-ratio": 0.1572 }
  };
  const meanRegression = {
    ...repairedWorst,
    metrics: { ...repairedWorst.metrics, "mean-absolute-delta": 13.96 }
  };

  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality: repairedWorst }), true);
  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality: tooMuchPixelNoise }), false);
  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality: meanRegression }), false);
});

test("final refinement quality rejects local component collapse despite small global improvements", () => {
  const baselineQuality = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.13783564814814814,
      "foreground-missing-ratio": 0.11534763742604975,
      "mean-absolute-delta": 12.808644065072016,
      "component-regions-attention": 20,
      "worst-component-normalized-severity": 1.6049382716049383
    }
  };
  const candidateQuality = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.137758487654321,
      "foreground-missing-ratio": 0.11561896036129204,
      "mean-absolute-delta": 12.805534336419752,
      "component-regions-attention": 22,
      "worst-component-normalized-severity": 2.292387543252595
    }
  };

  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality }), false);
});

test("final refinement quality accepts tiny mean noise when component attention and strict pixels improve", () => {
  const baselineQuality = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.1422916667,
      "foreground-missing-ratio": 0.0868292376,
      "mean-absolute-delta": 12.5392074974,
      "component-regions-attention": 4,
      "worst-component-normalized-severity": 1.1177136389
    }
  };
  const candidateQuality = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.1422884516,
      "foreground-missing-ratio": 0.0868036781,
      "mean-absolute-delta": 12.5392698688,
      "component-regions-attention": 3,
      "worst-component-normalized-severity": 1.1177136389
    }
  };
  const severityRegression = {
    ...candidateQuality,
    metrics: { ...candidateQuality.metrics, "worst-component-normalized-severity": 1.13 }
  };
  const attentionRegression = {
    ...candidateQuality,
    metrics: { ...candidateQuality.metrics, "component-regions-attention": 4 }
  };

  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality }), true);
  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality: severityRegression }), false);
  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality: attentionRegression }), false);
});

test("final refinement quality accepts tiny strict-pixel gains when component attention improves", () => {
  const baselineQuality = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.1436689814814815,
      "foreground-missing-ratio": 0.09154003291265171,
      "mean-absolute-delta": 12.617008101851852,
      "component-regions-attention": 7,
      "worst-component-normalized-severity": 1.2396069538926682
    }
  };
  const candidateQuality = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.1436644804526749,
      "foreground-missing-ratio": 0.09151054128925581,
      "mean-absolute-delta": 12.617005369084362,
      "component-regions-attention": 6,
      "worst-component-normalized-severity": 1.2396069538926682
    }
  };
  const pixelRegression = {
    ...candidateQuality,
    metrics: { ...candidateQuality.metrics, "pixel-diff-ratio": 0.14368 }
  };

  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality }), true);
  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality: pixelRegression }), false);
});

test("final refinement quality rejects shared worst-component regression despite global metric improvement", () => {
  const baselineQuality = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.1452539866255144,
      "foreground-missing-ratio": 0.095,
      "mean-absolute-delta": 12.89,
      "component-regions-attention": 11,
      "worst-component-normalized-severity": 1.8
    },
    componentWorst: [{
      pageIndex: 0,
      id: "line-text-card-row-1",
      severity: 1.19
    }]
  };
  const candidateQuality = {
    checks: [{ name: "quality-rendered", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.145,
      "foreground-missing-ratio": 0.094,
      "mean-absolute-delta": 12.88,
      "component-regions-attention": 11,
      "worst-component-normalized-severity": 1.79
    },
    componentWorst: [{
      pageIndex: 0,
      id: "line-text-card-row-1",
      severity: 1.31
    }]
  };

  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality }), false);
});

test("final refinement quality preserves an already passed quality gate", () => {
  const baselineQuality = {
    passed: true,
    checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: true }],
    metrics: {
      "pixel-diff-ratio": 0.095,
      "foreground-missing-ratio": 0.03,
      "mean-absolute-delta": 8,
      "component-regions-attention": 12,
      "worst-component-normalized-severity": 2.1
    }
  };
  const candidateQuality = {
    passed: false,
    checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    metrics: {
      "pixel-diff-ratio": 0.094,
      "foreground-missing-ratio": 0.029,
      "mean-absolute-delta": 7.9,
      "component-regions-attention": 11,
      "worst-component-normalized-severity": 2
    }
  };

  assert.equal(finalRefinementQualityAcceptable({ baselineQuality, candidateQuality }), false);
});

test("low contrast footer native marks refine coarse grid candidates to source pixels", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "footer-mark-refine-"));
  const sourceFile = path.join(root, "source.png");
  const width = 120; const height = 120;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 111; y < 117; y += 1) for (let x = 53; x < 84; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 176; rgba[offset + 1] = 172; rgba[offset + 2] = 168; rgba[offset + 3] = 255;
  }
  writePng(sourceFile, { width, height, rgba });
  const page = { pageIndex: 0, textBoxes: [], images: [], shapes: [] };

  try {
    const added = addLowContrastFooterNativeMarks(page, { widthPt: 120, heightPt: 120 }, sourceFile);
    const mark = page.shapes.find((shape) => shape.source?.detector === "low-contrast-footer-native-mark");

    assert.equal(added, 1);
    assert.ok(mark);
    assert.deepEqual(mark.box, { x: 53, y: 111, w: 31, h: 6 });
    assert.equal(mark.style.fill, "#B0ACA8");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("native-only residual candidate rejects full-slide fallback removal until visual quality is green", () => {
  const deck = {
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      images: [
        { id: "full", box: { x: 0, y: 0, w: 100, h: 100 }, source: { detector: "foreground-graphic-crop", fullSlideResidual: true } },
        { id: "small", box: { x: 10, y: 10, w: 10, h: 10 }, source: { detector: "foreground-graphic-crop", residualCrop: true } }
      ],
      shapes: [{ id: "native", type: "rect", box: { x: 10, y: 10, w: 40, h: 20 }, source: { editable: true } }],
      textBoxes: []
    }]
  };
  const stripped = removeFullSlideResidualImages(deck);
  assert.equal(stripped.removed, 1);
  assert.equal(stripped.deck.pages[0].images.length, 1);
  assert.equal(deck.pages[0].images.length, 2);
  const baselineQuality = { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }], metrics: { "pixel-diff-ratio": 0.15, "foreground-missing-ratio": 0.17, "mean-absolute-delta": 13 } };
  const candidateQuality = { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }], metrics: { "pixel-diff-ratio": 0.158, "foreground-missing-ratio": 0.205, "mean-absolute-delta": 14 } };
  assert.equal(nativeOnlyResidualQualityAcceptable({ baselineQuality, candidateQuality, baselineDeck: deck, candidateDeck: stripped.deck }), false);
  assert.equal(nativeOnlyResidualQualityAcceptable({
    baselineQuality,
    candidateQuality: { ...candidateQuality, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: true }] },
    baselineDeck: deck,
    candidateDeck: stripped.deck
  }), true);
  assert.equal(nativeOnlyResidualQualityAcceptable({
    baselineQuality,
    candidateQuality: { ...candidateQuality, metrics: { ...candidateQuality.metrics, "pixel-diff-ratio": 0.18 } },
    baselineDeck: deck,
    candidateDeck: stripped.deck
  }), false);
  assert.equal(candidateQuality.passed, false);
});

test("native-only residual candidate removes legacy full-slide erased residual crops", () => {
  const deck = {
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      images: [
        {
          id: "legacy-full",
          box: { x: 0, y: 0, w: 100, h: 100 },
          source: {
            editable: false,
            residualCrop: true,
            nativeObjectsErased: true,
            strategy: "full-slide-object-erased-residual"
          }
        },
        {
          id: "large-local",
          box: { x: 0, y: 0, w: 50, h: 20 },
          source: { residualCrop: true, strategy: "local-fidelity-crop" }
        }
      ],
      shapes: [{ id: "native", type: "rect", box: { x: 10, y: 10, w: 40, h: 20 }, source: { editable: true } }],
      textBoxes: []
    }]
  };

  const stripped = removeFullSlideResidualImages(deck);

  assert.equal(stripped.removed, 1);
  assert.deepEqual(stripped.deck.pages[0].images.map((image) => image.id), ["large-local"]);
  assert.equal(largeRasterEditability(stripped.deck).passed, false);
});

test("native-only residual candidate keeps knowledge graph connectors behind nodes", () => {
  const deck = {
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      images: [],
      shapes: [
        { id: "team-knowledge-graph-node-1", type: "roundRect", box: { x: 30, y: 30, w: 30, h: 20 }, source: { detector: "team-knowledge-graph-node-1" } },
        { id: "team-knowledge-graph-hub-link-1", type: "line", box: { x: 20, y: 40, w: 60, h: 0 }, source: { detector: "team-knowledge-graph-hub-link-1" } }
      ],
      textBoxes: []
    }]
  };

  const stripped = removeFullSlideResidualImages(deck);
  const ids = stripped.deck.pages[0].shapes.map((shape) => shape.id);

  assert.ok(ids.indexOf("team-knowledge-graph-hub-link-1") < ids.indexOf("team-knowledge-graph-node-1"));
  assert.deepEqual(deck.pages[0].shapes.map((shape) => shape.id), ["team-knowledge-graph-node-1", "team-knowledge-graph-hub-link-1"]);
});

test("native-only residual candidate can replace residual pixels with bounded native primitives", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-residual-primitives-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  const residual = { width: 24, height: 16, rgba: Buffer.alloc(24 * 16 * 4, 255) };
  for (let y = 4; y < 8; y += 1) {
    for (let x = 3; x < 18; x += 1) {
      const offset = (y * residual.width + x) * 4;
      residual.rgba[offset] = 35;
      residual.rgba[offset + 1] = 98;
      residual.rgba[offset + 2] = 220;
      residual.rgba[offset + 3] = 255;
    }
  }
  writePng(path.join(root, "assets", "residual.png"), residual);
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 240, heightPt: 160 },
    pages: [{
      pageIndex: 0,
      images: [{ id: "full", type: "fidelity-crop", assetPath: "assets/residual.png", box: { x: 0, y: 0, w: 240, h: 160 }, source: { residualCrop: true, fullSlideResidual: true } }],
      shapes: [],
      textBoxes: []
    }]
  };
  const vectorized = addNativeResidualPrimitives(deck, root);
  assert.ok(vectorized.added > 0);
  assert.equal(vectorized.skipped, 0);
  assert.equal(vectorized.deck.pages[0].images.length, 1);
  assert.ok(vectorized.deck.pages[0].shapes.every((shape) => shape.source.detector === "native-residual-primitive-rect"));
  assert.ok(vectorized.deck.pages[0].shapes.every((shape) => shape.style.opacity === undefined));
  assert.ok(vectorized.deck.pages[0].shapes.every((shape) => shape.source.semanticNativeStructure === undefined));
  assert.ok(vectorized.deck.pages[0].shapes.every((shape) => shape.source.nativeComponentArchetype === undefined));
  assert.ok(vectorized.deck.pages[0].shapes.every((shape) => shape.source.nativeComponentRole === undefined));
  const stripped = removeFullSlideResidualImages(vectorized.deck);
  assert.equal(stripped.removed, 1);
  assert.equal(stripped.deck.pages[0].images.length, 0);
  assert.ok(stripped.deck.pages[0].shapes.length > 0);
  assert.equal(validateDeckIr(stripped.deck, root).assets, 0);
});

test("strict native candidate policy rejects raster-derived primitive replacements", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "strict-native-policy-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  const residual = { width: 12, height: 8, rgba: Buffer.alloc(12 * 8 * 4, 255) };
  for (let y = 2; y < 6; y += 1) {
    for (let x = 2; x < 10; x += 1) {
      const offset = (y * residual.width + x) * 4;
      residual.rgba[offset] = 40;
      residual.rgba[offset + 1] = 80;
      residual.rgba[offset + 2] = 180;
      residual.rgba[offset + 3] = 255;
    }
  }
  writePng(path.join(root, "assets", "residual.png"), residual);
  const deck = {
    slideSize: { widthPt: 120, heightPt: 80 },
    pages: [{
      images: [{ id: "full", type: "fidelity-crop", assetPath: "assets/residual.png", box: { x: 0, y: 0, w: 120, h: 80 }, source: { residualCrop: true, fullSlideResidual: true } }],
      shapes: [],
      textBoxes: []
    }]
  };
  const primitive = removeFullSlideResidualImages(addNativeResidualPrimitives(deck, root).deck).deck;
  const baselineQuality = { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }], metrics: { "pixel-diff-ratio": 0.15, "foreground-missing-ratio": 0.12, "mean-absolute-delta": 12 } };
  const candidateQuality = { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }], metrics: { "pixel-diff-ratio": 0.149, "foreground-missing-ratio": 0.119, "mean-absolute-delta": 11.9 } };
  const result = assessStrictNativeCandidate({ baselineQuality, candidateQuality, candidateDeck: primitive });
  assert.equal(result.passed, false);
  assert.ok(result.reasons.includes("visual-fidelity"));
  assert.ok(result.reasons.includes("semantic-editability"));
  assert.ok(result.reasons.includes("native-component-quality"));
});

test("native-only residual candidate tries pure native deck without raster primitive diagnostics", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();
  const bodyStart = source.indexOf("async function tryBuildNativeOnlyResidualCandidate");
  const bodyEnd = source.indexOf("async function buildNativeOnlyResidualCandidate", bodyStart);
  const body = source.slice(bodyStart, bodyEnd);

  assert.ok(bodyStart > -1);
  assert.ok(bodyEnd > bodyStart);
  assert.ok(body.indexOf("suffix: \"direct\"") > -1);
  assert.equal(body.includes("addNativeResidualPrimitives("), false);
  assert.match(body, /return \{ \.\.\.direct, nativeResidualPrimitives: 0, previousOutputFile: outputFile \};/u);
});

test("native-only residual transaction repairs missing components before strict policy", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();
  const bodyStart = source.indexOf("async function buildNativeOnlyResidualCandidate");
  const bodyEnd = source.indexOf("async function tryBuildNativeOnlyRichOcrTextLayoutCandidate", bodyStart);
  const body = source.slice(bodyStart, bodyEnd);

  assert.ok(bodyStart > -1);
  assert.ok(bodyEnd > bodyStart);
  assert.match(body, /const panelBaseline = panelRefined \|\| direct;/u);
  assert.match(body, /const primitive = hasAttentionTextWorstComponent\(panelBaseline\.quality\) \? null : await tryBuildNativeOnlyComponentFidelityPrimitiveCandidate\(\{\s+root,\s+baseline: panelBaseline,/u);
  assert.match(body, /const repaired = primitive \|\| panelBaseline;/u);
  assert.match(body, /tryBuildNativeOnlyRichOcrTextLayoutCandidate\(\{\s+root,\s+baseline: repaired,/u);
  assert.match(body, /prioritizeComponentWorstByContribution\(baseline\.quality, \{ targetKinds: \["missing", "shape"\] \}\)/u);
  assert.match(body, /for \(const maximumRuns of NATIVE_ONLY_COMPONENT_FIDELITY_PRIMITIVE_BUDGETS\)/u);
  assert.match(body, /fitDeckWorstComponentFidelityPrimitives\(baseline\.deck, \{[\s\S]+maximumTargets: 16,[\s\S]+targetKinds: \["missing", "shape"\]/u);
  assert.match(body, /nativeOnlySemanticChecksPass\(candidate\.deck\)/u);
  assert.match(body, /"native-only-component-fidelity-primitives-applied": 1/u);
  assert.match(source, /function nativeOnlyMissingNativeTargetBudgets\(targetCount\) \{[\s\S]+1, 2, 3, 4, 5, 6, 8, 12, total/u);
  const missingRefinerSource = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "native-only-missing-refinement.js"), "utf8");
  assert.match(source, /refineNativeOnlyResidualCandidateMissingNativeLines = createNativeOnlyMissingRefiner/u);
  assert.match(missingRefinerSource, /async function evaluate\(maximumTargets, isCancellationRequested\)[\s\S]+fitDeckMissingNativeVisualAtomShapes\(nativeOnlyCandidate\.deck,[\s\S]+maximumTargets,[\s\S]+runCandidatePair\(schedule\.slice\(offset, offset \+ 2\)[\s\S]+"native-only-missing-native-lines-target-budget": best\.maximumTargets/u);
});

test("native-only residual transaction tries gated pictorial native replacement after missing repair before strict policy", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();
  const bodyStart = source.indexOf("nativeOnlyCandidate = await runWorkerStage(\"IMAGE_QUALITY_FAILED\", () => refineNativeOnlyResidualCandidateMissingNativeLines({");
  const bodyEnd = source.indexOf("const nativeOnlyPolicy = nativeOnlyCandidate?.rejected === true ? null : assessStrictNativeCandidate", bodyStart);
  const body = source.slice(bodyStart, bodyEnd);

  assert.ok(bodyStart > -1);
  assert.ok(bodyEnd > bodyStart);
  assert.match(body, /refineNativeOnlyResidualCandidateMissingNativeLines\(\{/u);
  assert.match(body, /tryBuildNativeOnlyPictorialIconCandidate\(\{\s+root,\s+baseline: nativeOnlyCandidate,/u);
  assert.match(body, /nativeOnlyCandidate = pictorialNativeOnlyCandidate \|\| nativeOnlyCandidate;/u);
  assert.ok(body.indexOf("refineNativeOnlyResidualCandidateMissingNativeLines({") < body.indexOf("tryBuildNativeOnlyPictorialIconCandidate({"));
  assert.match(source, /createPictorialCandidateBuilder\(\{[^\n]+semanticChecksPass: nativeOnlySemanticChecksPass,[^\n]+doesNotRegress: nativeOnlyRefinementDoesNotMateriallyRegress/u);
  const transaction = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "pictorial-candidate-transaction.js"), "utf8");
  assert.match(transaction, /"native-only-pictorial-icons-rejected": 1/u);
  assert.match(source, /\$\{prefix\}-pictorial-icons-candidate-pixel-diff-ratio/u);
});

test("strict native candidate policy requires visual fidelity instead of accepting non-regression", () => {
  const candidateDeck = {
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      shapes: [{ id: "native-card", type: "rect", box: { x: 10, y: 10, w: 20, h: 12 }, style: { fill: "#FFFFFF", stroke: "#111111", strokeWidthPt: 1 }, source: { nativeRebuild: true, detector: "line-text-native-card-row" } }],
      textBoxes: [{ id: "native-label", text: "native", box: { x: 12, y: 12, w: 16, h: 6 } }],
      images: []
    }]
  };
  const baselineQuality = { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }], metrics: { "pixel-diff-ratio": 0.14, "foreground-missing-ratio": 0.1, "mean-absolute-delta": 12 } };
  const candidateQuality = { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }], metrics: { "pixel-diff-ratio": 0.13, "foreground-missing-ratio": 0.09, "mean-absolute-delta": 11 } };

  const result = assessStrictNativeCandidate({ baselineQuality, candidateQuality, candidateDeck });

  assert.equal(result.passed, false);
  assert.deepEqual(result.reasons, ["visual-fidelity"]);
});

test("strict native candidate policy fails closed for malformed decks", () => {
  const quality = { passed: true, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: true }], metrics: { "pixel-diff-ratio": 0.01, "foreground-missing-ratio": 0.01, "mean-absolute-delta": 1 } };

  const result = assessStrictNativeCandidate({ baselineQuality: quality, candidateQuality: quality, candidateDeck: { slideSize: { widthPt: 100, heightPt: 100 }, pages: [] } });

  assert.equal(result.passed, false);
  assert.ok(result.reasons.includes("native-component-quality"));
  assert.ok(result.reasons.includes("semantic-editability"));
});

test("early native-only residual adoption requires strict native candidate policy", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();
  const branchStart = source.indexOf("let nativeOnlyCandidate = await runWorkerStage(\"IMAGE_QUALITY_FAILED\", () => tryBuildNativeOnlyResidualCandidate({");
  const earlyBranch = source.slice(
    branchStart,
    source.indexOf("if (bestRejectedRecovery", branchStart)
  );

  assert.match(earlyBranch, /refineNativeOnlyResidualCandidateText\(\{/u);
  assert.ok(earlyBranch.indexOf("refineNativeOnlyResidualCandidateText({") < earlyBranch.indexOf("assessStrictNativeCandidate({"));
  assert.match(earlyBranch, /const nativeOnlyPolicy = nativeOnlyCandidate\?\.rejected === true \? null : assessStrictNativeCandidate/u);
  assert.match(earlyBranch, /nativeOnlyResidualQualityAcceptable\([\s\S]+&& nativeOnlyPolicy\?\.passed === true/u);
  assert.match(earlyBranch, /"native-only-residual-semantic-rejected": 1/u);
});

test("native-only residual candidate removes large local crops only after native primitive replacement", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-large-crop-primitives-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });
  const residual = { width: 24, height: 16, rgba: Buffer.alloc(24 * 16 * 4, 255) };
  for (let y = 4; y < 12; y += 1) {
    for (let x = 3; x < 21; x += 1) {
      const offset = (y * residual.width + x) * 4;
      residual.rgba[offset] = 22;
      residual.rgba[offset + 1] = 122;
      residual.rgba[offset + 2] = 204;
      residual.rgba[offset + 3] = 255;
    }
  }
  writePng(path.join(root, "assets", "large-crop.png"), residual);
  const deck = {
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      images: [{
        id: "large-local",
        type: "fidelity-crop",
        assetPath: "assets/large-crop.png",
        box: { x: 0, y: 0, w: 40, h: 30 },
        source: { strategy: "local-fidelity-crop", detector: "foreground-graphic-crop" }
      }],
      shapes: [],
      textBoxes: []
    }]
  };
  assert.equal(largeRasterEditability(deck).passed, false);
  assert.equal(removeFullSlideResidualImages(deck).removed, 0);
  const vectorized = addNativeResidualPrimitives(deck, root);
  assert.ok(vectorized.added > 0);
  assert.equal(vectorized.deck.pages[0].images[0].source.nativeResidualPrimitiveSource, true);
  const stripped = removeFullSlideResidualImages(vectorized.deck);
  assert.equal(stripped.removed, 1);
  assert.equal(stripped.deck.pages[0].images.length, 0);
  assert.equal(largeRasterEditability(stripped.deck).passed, true);
});

test("raw native rebuild returns failed component quality for the final gate", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-native-component-quality-"));
  const source = path.join(temporaryRoot, "source.png");
  fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), source);
  const rebuild = createRawImageNativeRebuilder({ rebuildDeckFromWorkDir: (workDir) => {
    const rebuilt = JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8"));
    rebuilt.pages[0].shapes.push({ id: "unsupported-relationship-arrow", type: "triangle", box: { x: 1, y: 1, w: 20, h: 20 }, source: { editable: true, role: "relationship" } });
    return rebuilt;
  } });
  try {
    const result = await rebuild({ root: temporaryRoot, metadata: { inputFile: source, assetPath: "assets/source.png", dimensions: { widthPx: 960, heightPx: 540 } }, ocr: { lines: [] }, isCancellationRequested: async () => false });
    assert.equal(result.nativeComponentQuality.passed, false);
    assert.ok(result.nativeComponentQuality.findings.some((finding) => finding.code === "standalone-relationship-arrow"));
    assert.equal(result.deck.meta.nativeComponentQuality.passed, false);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("visual fallback solid region native backgrounds are ignored by component quality", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-visual-fallback-solid-region-"));
  const sourceFile = path.join(temporaryRoot, "source.png");
  const outputFile = path.join(temporaryRoot, "erased.png");
  const width = 160; const height = 90;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 30; y < 52; y += 1) {
    for (let x = 20; x < 94; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 253; rgba[offset + 1] = 246; rgba[offset + 2] = 239; rgba[offset + 3] = 255;
    }
  }
  writePng(sourceFile, { width, height, rgba });

  try {
    const result = writeTextErasedVisualFallbackAsset({
      sourceFile,
      outputFile,
      slideSize: { widthPt: 160, heightPt: 90 },
      objectifySolidRegions: true,
      page: { textBoxes: [], shapes: [] }
    });

    assert.ok(result.nativeShapes.length > 0);
    assert.equal(result.nativeShapes[0].source.componentQualityIgnore, true);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("Deck IR validates declared reconstruction contracts using the shared policy", () => {
  const { validateDeckIr } = require("../packages/slideclone-worker-adapter/team-worker");
  const { enrichReconstructionContracts } = require("../packages/slideclone-core/quality/reconstruction-contract");
  const enriched = JSON.parse(JSON.stringify(enrichReconstructionContracts(deck(), { baseDir: os.tmpdir() })));
  assert.equal(validateDeckIr(enriched, os.tmpdir()).pages, 1);
  assert.throws(() => validateDeckIr({ ...enriched, "pages.0.reconstruction.qualityBudget.metrics.slideAreaPt2": 518400 }, os.tmpdir()), /invalid number/);
  const tooLarge = structuredClone(enriched);
  tooLarge.pages[0].reconstruction.qualityBudget.metrics.slideAreaPt2 = 960 * 540 + 1;
  assert.throws(() => validateDeckIr(tooLarge, os.tmpdir()), /invalid number/);
  assert.throws(() => validateDeckIr({ ...enriched, arbitraryArea: 960 * 540 }, os.tmpdir()), /invalid number/);

  for (const contract of ["invalid", [], { contractVersion: "2.0" }]) {
    assert.throws(() => validateDeckIr(deck({ pages: [{ reconstruction: contract }] }), os.tmpdir()), /editable deck/);
  }
  const invalid = structuredClone(enriched);
  invalid.pages[0].textBoxes[0].source.reconstruction.realization = "invented";
  assert.throws(() => validateDeckIr(invalid, os.tmpdir()), (error) => error.message === "editable deck reconstruction metadata is invalid");
  assert.equal(require("../skills/pd-hifi-slideclone/scripts/lib/reconstruction-contract"), require("../packages/slideclone-core/quality/reconstruction-contract"));
  assert.equal(require("../skills/pd-hifi-slideclone/scripts/lib/reconstruction-quality-budget"), require("../packages/slideclone-core/quality/reconstruction-quality-budget"));
});
