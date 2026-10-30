"use strict";
const test = require("node:test");
const { addNativeResidualPrimitives, changedComponentKeysFromFit, compactDeckFinalQualitySourceProvenance, compactDeckLateShapeSourceBudgetProvenance, compactDeckLateTextSourceBudgetProvenance, compactDeckNativeShapeSourceProvenance, createImageToEditableArchiveHandler, finalRefinementQualityAcceptable, fitDeckEditableTextFontFamily, fitDeckLightCardGeometry, fitDeckLightCardSideAccents, fitDeckLightCardSourceStrokes, fitDeckLightCardStrokeColors, fitDeckLightCardStrokes, fitDeckLowContrastFooterMarks, fitDeckLowContrastFooterPrimitives, fitDeckLowSaturationPanelFills, fitDeckMissingNativeVisualAtomShapes, fitDeckNativeShapeThinStrokes, fitDeckOcrEvidenceToSource, fitDeckSaturatedColorPanels, fitDeckSourceVerticalLines, fitDeckTextFidelityPrimitives, fitDeckWorstComponentFidelityPrimitives, fitDeckWorstConnectorStyles, fitDeckWorstRichOcrTextLayout, fitDeckWorstTextArrowGlyphs, fitDeckWorstTextBoxNudge, fitDeckWorstTextColors, fitDeckWorstTextComposite, fitDeckWorstTextInkBoxes, fitDeckWorstTextScale, fitDeckWorstTextWeight, focusedCandidateLimits, focusedLightCardStrokeWidthCandidates, isReliableMissingNativeVisualAtom, lightCardSourceStrokeQualityAcceptable, missingNativeTargetInkRunShapes, nativeOnlyMissingNativeLinesDoesNotRegress, nativeOnlyRefinementDoesNotMateriallyRegress, nativeOnlyResidualQualityAcceptable, removeFullSlideResidualImages, replacePictorialIconCropsWithNativeShapes, residualDeduplicationStatus, targetComponentQualityImproves, targetMissingNativeComponentQualityImproves, tryBuildFinalLineTextCoveredCropDropCandidate, tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate, tryBuildNativeOnlyPictorialIconCandidate, tryBuildNativeOnlyRichOcrTextLayoutCandidate, validateDeckIr, worstTextBoxNudgeCandidates, worstTextCompositeScaleCandidates } = require("../packages/slideclone-worker-adapter/team-worker");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { writePng } = require("../packages/slideclone-core/png");
const { auditNativeComponentQuality } = require("../packages/slideclone-core/quality/native-component-quality");
const { auditSemanticEditability } = require("../packages/slideclone-core/quality/semantic-editability-quality");
const {  } = require('./helpers/image-team-worker.cjs');

test("final worker OCR evidence fit tightens recovered crop text after late refinement drift", () => {
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      shapes: [],
      images: [],
      textBoxes: [{
        id: "crop-ocr-title",
        text: "文档与表格",
        box: { x: 314.42, y: 118.22, w: 56.89, h: 15.11 },
        font: { family: "Microsoft YaHei", sizePt: 10.32, weight: "regular", valign: "middle" },
        style: { wrap: false, fit: "shrink" },
        source: {
          ocrProvider: "team-pinned-ocr",
          overlayVisibility: "visible",
          ocrRecoveredFromCrop: true,
          confidence: 0.99,
          evidenceBox: { x: 311.11, y: 117.33, w: 56.89, h: 15.11 }
        }
      }]
    }]
  };

  const result = fitDeckOcrEvidenceToSource(deck);

  assert.equal(result.changedTextBoxes, 1);
  assert.deepEqual(result.deck.pages[0].textBoxes[0].box, deck.pages[0].textBoxes[0].source.evidenceBox);
  assert.equal(result.deck.meta.finalOcrEvidenceFit.provider, "worker-final-ocr-evidence-fit-v1");
  assert.deepEqual(result.changedComponentKeys, ["0:crop-ocr-title"]);
  assert.deepEqual(result.deck.meta.finalOcrEvidenceFit.changedComponentKeys, ["0:crop-ocr-title"]);
  assert.deepEqual(deck.pages[0].textBoxes[0].box, { x: 314.42, y: 118.22, w: 56.89, h: 15.11 });
});

test("final worker OCR evidence fit can limit changes to the highest-score subset", () => {
  const first = {
    id: "small-drift",
    text: "小偏移",
    box: { x: 100.5, y: 80.5, w: 40, h: 14 },
    font: { family: "Microsoft YaHei", sizePt: 10, weight: "regular", valign: "middle" },
    style: { wrap: false, fit: "shrink" },
    source: { ocrProvider: "team-pinned-ocr", overlayVisibility: "visible", ocrRecoveredFromCrop: true, confidence: 0.99, evidenceBox: { x: 100, y: 80, w: 40, h: 14 } }
  };
  const second = {
    id: "large-drift",
    text: "大偏移",
    box: { x: 210, y: 84, w: 40, h: 14 },
    font: { family: "Microsoft YaHei", sizePt: 10, weight: "regular", valign: "middle" },
    style: { wrap: false, fit: "shrink" },
    source: { ocrProvider: "team-pinned-ocr", overlayVisibility: "visible", ocrRecoveredFromCrop: true, confidence: 0.99, evidenceBox: { x: 205, y: 80, w: 40, h: 14 } }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0, shapes: [], images: [], textBoxes: [first, second] }] };

  const result = fitDeckOcrEvidenceToSource(deck, { candidateLimit: 1 });

  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.candidateTextBoxes, 2);
  assert.deepEqual(result.deck.pages[0].textBoxes[0].box, first.box);
  assert.deepEqual(result.deck.pages[0].textBoxes[1].box, second.source.evidenceBox);
});

test("final worker OCR evidence fit prioritizes verifier-worst text boxes", () => {
  const smallWorst = {
    id: "small-worst",
    text: "小偏移",
    box: { x: 100.5, y: 80.5, w: 40, h: 14 },
    font: { family: "Microsoft YaHei", sizePt: 10, weight: "regular", valign: "middle" },
    style: { wrap: false, fit: "shrink" },
    source: { ocrProvider: "team-pinned-ocr", overlayVisibility: "visible", ocrRecoveredFromCrop: true, confidence: 0.99, evidenceBox: { x: 100, y: 80, w: 40, h: 14 } }
  };
  const largeOther = {
    id: "large-other",
    text: "大偏移",
    box: { x: 210, y: 84, w: 40, h: 14 },
    font: { family: "Microsoft YaHei", sizePt: 10, weight: "regular", valign: "middle" },
    style: { wrap: false, fit: "shrink" },
    source: { ocrProvider: "team-pinned-ocr", overlayVisibility: "visible", ocrRecoveredFromCrop: true, confidence: 0.99, evidenceBox: { x: 205, y: 80, w: 40, h: 14 } }
  };
  const priorityIds = new Map([["0:small-worst", 0]]);
  const deck = { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0, shapes: [], images: [], textBoxes: [smallWorst, largeOther] }] };

  const result = fitDeckOcrEvidenceToSource(deck, { candidateLimit: 1, priorityIds });

  assert.equal(result.changedTextBoxes, 1);
  assert.deepEqual(result.deck.pages[0].textBoxes[0].box, smallWorst.source.evidenceBox);
  assert.deepEqual(result.deck.pages[0].textBoxes[1].box, largeOther.box);
});

test("final worker light card stroke fit limits changes to low-contrast native card rows", () => {
  const lightCard = {
    id: "light-card",
    type: "roundRect",
    box: { x: 20, y: 20, w: 140, h: 60 },
    style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const deepCard = {
    id: "deep-card",
    type: "roundRect",
    box: { x: 180, y: 20, w: 140, h: 60 },
    style: { fill: "#1E3A8A", stroke: "#1E3A8A", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const strongBorder = {
    id: "strong-border",
    type: "roundRect",
    box: { x: 340, y: 20, w: 140, h: 60 },
    style: { fill: "#FFFFFF", stroke: "#336AEF", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [lightCard, deepCard, strongBorder] }] };

  const result = fitDeckLightCardStrokes(deck, { candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.equal(result.deck.pages[0].shapes[0].style.strokeWidthPt, 0.8);
  assert.equal(result.deck.meta.finalLightCardStrokeFit.provider, "worker-final-light-card-stroke-fit-v1");
  assert.equal(result.deck.pages[0].shapes[1].style.strokeWidthPt, 0.55);
  assert.equal(result.deck.pages[0].shapes[2].style.strokeWidthPt, 0.55);
  assert.equal(deck.pages[0].shapes[0].style.strokeWidthPt, 0.55);
});

test("final worker light card stroke search stays focused on representative candidates", () => {
  assert.deepEqual(focusedLightCardStrokeWidthCandidates(0.55), [0.68, 0.8]);
  assert.deepEqual(focusedLightCardStrokeWidthCandidates(0.7), [0.8]);
  assert.deepEqual(focusedCandidateLimits(1), [1]);
  assert.deepEqual(focusedCandidateLimits(2), [1, 2]);
  assert.deepEqual(focusedCandidateLimits(8), [1, 3]);
});

test("final worker light card stroke fit prioritizes quality worst card rows", () => {
  const largeCard = {
    id: "large-card",
    type: "roundRect",
    box: { x: 20, y: 20, w: 180, h: 80 },
    style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const worstCard = {
    id: "worst-card",
    type: "roundRect",
    box: { x: 220, y: 20, w: 120, h: 60 },
    style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const priorityIds = new Map([["0:worst-card", 0]]);
  const deck = { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [largeCard, worstCard] }] };

  const result = fitDeckLightCardStrokes(deck, { candidateLimit: 1, priorityIds });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 2);
  assert.equal(result.deck.pages[0].shapes[0].style.strokeWidthPt, 0.55);
  assert.equal(result.deck.pages[0].shapes[1].style.strokeWidthPt, 0.8);
});

test("final worker light card stroke color fit samples source card outlines", () => {
  const width = 100; const height = 100;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 20; y < 60; y += 1) for (let x = 20; x < 80; x += 1) {
    const edge = x < 23 || x >= 77 || y < 23 || y >= 57;
    if (!edge) continue;
    const offset = (y * width + x) * 4;
    rgba[offset] = 45; rgba[offset + 1] = 85; rgba[offset + 2] = 225; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const card = {
    id: "card",
    type: "roundRect",
    box: { x: 20, y: 20, w: 60, h: 40 },
    style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const ignored = {
    id: "ignored",
    type: "roundRect",
    box: { x: 5, y: 5, w: 10, h: 10 },
    style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-title-band-panel" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [card, ignored] }] };

  const result = fitDeckLightCardStrokeColors(deck, { pageImages: [image], candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.equal(result.deck.pages[0].shapes[0].style.stroke.toLowerCase(), "#2d55e1");
  assert.equal(result.deck.pages[0].shapes[0].style.fill, "#FFFFFF");
  assert.equal(result.deck.meta.finalLightCardStrokeColorFit.provider, "worker-final-light-card-stroke-color-fit-v1");
  assert.equal(result.deck.pages[0].shapes[1].style.stroke, "#F0F4FE");
  assert.equal(deck.pages[0].shapes[0].style.stroke, "#F0F4FE");
});

test("final worker light card source stroke fit restores native borders for stroke-less cards", () => {
  const width = 100; const height = 100;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 20; y < 60; y += 1) for (let x = 20; x < 80; x += 1) {
    const edge = x < 23 || x >= 77 || y < 23 || y >= 57;
    if (!edge) continue;
    const offset = (y * width + x) * 4;
    rgba[offset] = 214; rgba[offset + 1] = 226; rgba[offset + 2] = 248; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const card = {
    id: "card",
    type: "roundRect",
    box: { x: 20, y: 20, w: 60, h: 40 },
    style: { fill: "#FFFFFF", stroke: "none", strokeWidthPt: 0 },
    source: { detector: "line-text-native-card-row" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [card] }] };

  const result = fitDeckLightCardSourceStrokes(deck, { pageImages: [image], candidateLimit: 1, targetStrokeWidthPt: 0.68 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.equal(result.deck.pages[0].shapes[0].style.stroke.toLowerCase(), "#d6e2f8");
  assert.equal(result.deck.pages[0].shapes[0].style.strokeWidthPt, 0.68);
  assert.equal(result.deck.pages[0].shapes[0].style.fill, "#FFFFFF");
  assert.equal(result.deck.meta.finalLightCardSourceStrokeFit.provider, "worker-final-light-card-source-stroke-fit-v1");
  assert.equal(deck.pages[0].shapes[0].style.stroke, "none");
});

test("final worker light card source stroke quality accepts local border repair with tiny mean noise", () => {
  const baseline = {
    checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    metrics: {
      "pixel-diff-ratio": 0.15607317386831276,
      "foreground-missing-ratio": 0.15389515531271936,
      "mean-absolute-delta": 14.772005851337449,
      "component-regions-attention": 46,
      "worst-component-normalized-severity": 2.860520094562648
    },
    componentWorst: [{ pageIndex: 0, id: "line-text-card-row-2", severity: 2.860520094562648 }]
  };
  const repaired = {
    checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    metrics: {
      "pixel-diff-ratio": 0.1560699588477366,
      "foreground-missing-ratio": 0.15388532477158737,
      "mean-absolute-delta": 14.772706243569958,
      "component-regions-attention": 46,
      "worst-component-normalized-severity": 2.5742574257425743
    },
    componentWorst: [{ pageIndex: 0, id: "line-text-card-row-2", severity: 2.5742574257425743 }]
  };
  const regressed = {
    ...repaired,
    metrics: { ...repaired.metrics, "foreground-missing-ratio": 0.154 }
  };

  assert.equal(finalRefinementQualityAcceptable({ baselineQuality: baseline, candidateQuality: repaired }), false);
  assert.equal(lightCardSourceStrokeQualityAcceptable({ baselineQuality: baseline, candidateQuality: repaired }), true);
  assert.equal(lightCardSourceStrokeQualityAcceptable({ baselineQuality: baseline, candidateQuality: regressed }), false);
});

test("final worker light card source stroke fit skips cards already repaired from source", () => {
  const width = 100; const height = 100;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 20; y < 60; y += 1) for (let x = 20; x < 80; x += 1) {
    const edge = x < 23 || x >= 77 || y < 23 || y >= 57;
    if (!edge) continue;
    const offset = (y * width + x) * 4;
    rgba[offset] = 214; rgba[offset + 1] = 226; rgba[offset + 2] = 248; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const repaired = {
    id: "repaired",
    type: "roundRect",
    box: { x: 20, y: 20, w: 60, h: 40 },
    style: { fill: "#FFFFFF", stroke: "#d6e2f8", strokeWidthPt: 0.68 },
    source: {
      detector: "line-text-native-card-row",
      finalLightCardSourceStrokeFit: { provider: "worker-final-light-card-source-stroke-fit-v1" }
    }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [repaired] }] };

  const result = fitDeckLightCardSourceStrokes(deck, { pageImages: [image], candidateLimit: 1, targetStrokeWidthPt: 0.8 });

  assert.equal(result.changedShapes, 0);
  assert.equal(result.candidateShapes, 0);
  assert.equal(result.deck.pages[0].shapes[0].style.strokeWidthPt, 0.68);
});

test("final worker light card side accent fit adds native lines for source side-only borders", () => {
  const width = 120; const height = 90;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 18; y < 62; y += 1) for (let x = 20; x < 24; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 51; rgba[offset + 1] = 106; rgba[offset + 2] = 239; rgba[offset + 3] = 255;
  }
  for (let y = 18; y < 22; y += 1) for (let x = 20; x < 86; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 51; rgba[offset + 1] = 106; rgba[offset + 2] = 239; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const card = {
    id: "card",
    type: "roundRect",
    box: { x: 20, y: 18, w: 66, h: 44 },
    style: { fill: "#FFFFFF", stroke: "#F1F5FE", strokeWidthPt: 0.8 },
    source: { detector: "line-text-native-card-row" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 120, heightPt: 90 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [card] }] };

  const result = fitDeckLightCardSideAccents(deck, { pageImages: [image] });

  assert.equal(result.addedShapes, 2);
  assert.equal(result.candidateShapes, 2);
  const accents = result.deck.pages[0].shapes.slice(1);
  assert.deepEqual(accents.map((shape) => shape.source.side).sort(), ["left", "top"]);
  assert.ok(accents.every((shape) => shape.type === "line"));
  assert.ok(accents.every((shape) => shape.style.stroke.toLowerCase() === "#336aef"));
  assert.equal(result.deck.meta.finalLightCardSideAccentFit.provider, "worker-final-light-card-side-accent-fit-v1");
  assert.equal(deck.pages[0].shapes.length, 1);
});

test("final worker light card side accent fit prioritizes quality worst cards and ignores noise", () => {
  const width = 200; const height = 90;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 18; y < 62; y += 1) for (let x = 120; x < 124; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 172; rgba[offset + 1] = 152; rgba[offset + 2] = 235; rgba[offset + 3] = 255;
  }
  for (let y = 20; y < 24; y += 1) for (let x = 30; x < 34; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 51; rgba[offset + 1] = 106; rgba[offset + 2] = 239; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const first = { id: "first-card", type: "roundRect", box: { x: 20, y: 18, w: 66, h: 44 }, style: { fill: "#FFFFFF", stroke: "#F1F5FE", strokeWidthPt: 0.8 }, source: { detector: "line-text-native-card-row" } };
  const worst = { id: "worst-card", type: "roundRect", box: { x: 120, y: 18, w: 58, h: 44 }, style: { fill: "#FFFFFF", stroke: "#F1F5FE", strokeWidthPt: 0.8 }, source: { detector: "line-text-native-card-row" } };
  const priorityIds = new Map([["0:worst-card", 0]]);
  const deck = { version: "1.0", slideSize: { widthPt: 200, heightPt: 90 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [first, worst] }] };

  const result = fitDeckLightCardSideAccents(deck, { pageImages: [image], priorityIds, candidateLimit: 1 });

  assert.equal(result.addedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.equal(result.deck.pages[0].shapes[2].source.sourceCardId, "worst-card");
  assert.equal(result.deck.pages[0].shapes[2].source.side, "left");
});

test("final worker text fidelity primitive fit adds native rectangles for missing source text ink", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "text-fidelity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 48; const height = 24;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (let x = 10; x < 14; x += 1) {
    const offset = (10 * width + x) * 4;
    source[offset] = 24; source[offset + 1] = 58; source[offset + 2] = 160; source[offset + 3] = 255;
  }
  const isolatedOffset = (11 * width + 20) * 4;
  source[isolatedOffset] = 24; source[isolatedOffset + 1] = 58; source[isolatedOffset + 2] = 160; source[isolatedOffset + 3] = 255;
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 48, heightPt: 24 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{ id: "text-1", box: { x: 8, y: 8, w: 18, h: 8 }, source: { evidenceBox: { x: 8, y: 8, w: 18, h: 8 } } }],
      images: [],
      shapes: []
    }]
  };

  const result = fitDeckTextFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile] });

  assert.equal(result.addedShapes, 1);
  assert.equal(result.candidateTextBoxes, 1);
  assert.equal(result.skippedRuns, 1);
  assert.equal(result.deck.pages[0].shapes.length, 1);
  const primitive = result.deck.pages[0].shapes[0];
  assert.equal(primitive.type, "rect");
  assert.deepEqual(primitive.box, { x: 10, y: 10, w: 4, h: 1 });
  assert.equal(primitive.style.fill.toLowerCase(), "#183aa0");
  assert.equal(primitive.source.detector, "text-fidelity-native-primitive");
  assert.equal(primitive.source.sourceTextId, "text-1");
  assert.equal(primitive.source.componentQualityIgnore, true);
  assert.equal(deck.pages[0].shapes.length, 0);
});

test("final worker text fidelity primitive fit prefers component quality boxes over mixed evidence", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "text-fidelity-quality-box-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 48; const height = 24;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (let x = 30; x < 34; x += 1) {
    const offset = (10 * width + x) * 4;
    source[offset] = 24; source[offset + 1] = 58; source[offset + 2] = 160; source[offset + 3] = 255;
  }
  for (let x = 8; x < 12; x += 1) {
    const offset = (10 * width + x) * 4;
    source[offset] = 20; source[offset + 1] = 160; source[offset + 2] = 80; source[offset + 3] = 255;
  }
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 48, heightPt: 24 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{
        id: "status-text",
        box: { x: 28, y: 8, w: 10, h: 8 },
        source: {
          evidenceBox: { x: 6, y: 8, w: 32, h: 8 },
          componentQualityBox: { x: 28, y: 8, w: 10, h: 8 }
        }
      }],
      images: [],
      shapes: []
    }]
  };

  const result = fitDeckTextFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile] });

  assert.equal(result.addedShapes, 1);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, { x: 30, y: 10, w: 4, h: 1 });
});

test("final worker text fidelity primitive fit merges adjacent native text runs vertically", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "text-fidelity-vertical-merge-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 48; const height = 24;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (const y of [10, 11, 12]) {
    for (let x = 18; x < 23; x += 1) {
      const offset = (y * width + x) * 4;
      source[offset] = 24; source[offset + 1] = 58; source[offset + 2] = 160; source[offset + 3] = 255;
    }
  }
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 48, heightPt: 24 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{ id: "text-1", box: { x: 16, y: 8, w: 12, h: 8 } }],
      images: [],
      shapes: []
    }]
  };

  const result = fitDeckTextFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], maximumRuns: 1 });

  assert.equal(result.addedShapes, 1);
  assert.equal(result.deck.pages[0].shapes.length, 1);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, { x: 18, y: 10, w: 5, h: 3 });
  assert.equal(result.deck.pages[0].shapes[0].source.detector, "text-fidelity-native-primitive");
});

test("final worker text fidelity primitive fit keeps one-pixel vertical text strokes after merging", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "text-fidelity-thin-stroke-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 32; const height = 24;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (const y of [9, 10, 11, 12]) {
    const offset = (y * width + 14) * 4;
    source[offset] = 28; source[offset + 1] = 52; source[offset + 2] = 148; source[offset + 3] = 255;
  }
  const isolatedOffset = (16 * width + 20) * 4;
  source[isolatedOffset] = 28; source[isolatedOffset + 1] = 52; source[isolatedOffset + 2] = 148; source[isolatedOffset + 3] = 255;
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 32, heightPt: 24 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{ id: "thin-text", box: { x: 12, y: 8, w: 12, h: 10 } }],
      images: [],
      shapes: []
    }]
  };

  const result = fitDeckTextFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], maximumRuns: 2 });

  assert.equal(result.addedShapes, 1);
  assert.equal(result.skippedRuns, 1);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, { x: 14, y: 9, w: 1, h: 4 });
});

test("final worker text fidelity primitive fit captures low-delta antialiased text edges", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "text-fidelity-antialias-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 32; const height = 20;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (let x = 10; x < 14; x += 1) {
    const offset = (9 * width + x) * 4;
    source[offset] = 190; source[offset + 1] = 190; source[offset + 2] = 190; source[offset + 3] = 255;
    rendered[offset] = 207; rendered[offset + 1] = 207; rendered[offset + 2] = 207; rendered[offset + 3] = 255;
  }
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 32, heightPt: 20 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{ id: "soft-text", box: { x: 8, y: 7, w: 12, h: 6 } }],
      images: [],
      shapes: []
    }]
  };

  const result = fitDeckTextFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], maximumRuns: 2 });

  assert.equal(result.addedShapes, 1);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, { x: 10, y: 9, w: 4, h: 1 });
  assert.equal(result.deck.pages[0].shapes[0].style.fill.toLowerCase(), "#bebebe");
});

test("final worker text fidelity primitive fit respects run caps without mutating input", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "text-fidelity-cap-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 48; const height = 24;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (const y of [8, 10, 12]) {
    for (let x = 10; x < 13; x += 1) {
      const offset = (y * width + x) * 4;
      source[offset] = 30; source[offset + 1] = 30; source[offset + 2] = 30; source[offset + 3] = 255;
    }
  }
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 48, heightPt: 24 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{ id: "text-1", box: { x: 8, y: 6, w: 12, h: 10 } }],
      images: [],
      shapes: [{ id: "existing", type: "rect", box: { x: 1, y: 1, w: 2, h: 2 }, style: { fill: "#ffffff" } }]
    }]
  };
  const before = JSON.stringify(deck);

  const result = fitDeckTextFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], maximumRuns: 2 });

  assert.equal(result.addedShapes, 2);
  assert.equal(result.deck.pages[0].shapes.length, 3);
  assert.deepEqual(result.deck.pages[0].shapes.slice(1).map((shape) => shape.box.y), [8, 10]);
  assert.equal(result.deck.meta.finalTextFidelityPrimitiveFit.addedShapes, 2);
  assert.equal(JSON.stringify(deck), before);
});

test("final worker text fidelity primitive fit prioritizes high-delta native runs under caps", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "text-fidelity-priority-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 48; const height = 24;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (let x = 8; x < 12; x += 1) {
    const offset = (8 * width + x) * 4;
    source[offset] = 190; source[offset + 1] = 190; source[offset + 2] = 190; source[offset + 3] = 255;
    rendered[offset] = 207; rendered[offset + 1] = 207; rendered[offset + 2] = 207; rendered[offset + 3] = 255;
  }
  for (let x = 30; x < 34; x += 1) {
    const offset = (14 * width + x) * 4;
    source[offset] = 24; source[offset + 1] = 58; source[offset + 2] = 160; source[offset + 3] = 255;
  }
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 48, heightPt: 24 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{ id: "ranked-text", box: { x: 6, y: 6, w: 34, h: 12 } }],
      images: [],
      shapes: []
    }]
  };

  const result = fitDeckTextFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], maximumRuns: 1 });

  assert.equal(result.addedShapes, 1);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, { x: 30, y: 14, w: 4, h: 1 });
});

test("final worker text fidelity primitive fit can use higher native run budgets", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "text-fidelity-high-cap-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runCount = 2601;
  const width = runCount * 3;
  const height = 3;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (let run = 0; run < runCount; run += 1) {
    for (let x = run * 3; x < run * 3 + 2; x += 1) {
      const offset = (width + x) * 4;
      source[offset] = 30; source[offset + 1] = 72; source[offset + 2] = 160; source[offset + 3] = 255;
    }
  }
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: width, heightPt: height },
    pages: [{
      pageIndex: 0,
      textBoxes: [{ id: "dense-text", box: { x: 0, y: 0, w: width, h: height }, source: { componentQualityBox: { x: 0, y: 0, w: width, h: height } } }],
      images: [],
      shapes: []
    }]
  };

  const result = fitDeckTextFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], maximumRuns: 2600 });

  assert.equal(result.addedShapes, 2600);
  assert.equal(result.deck.pages[0].shapes.length, 2600);
  assert.equal(result.deck.pages[0].shapes.at(-1).source.detector, "text-fidelity-native-primitive");
});

test("final worker quality source compaction keeps audit fields and primitive identity", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quality-source-compaction-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 160, heightPt: 90 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{
        id: "text-1",
        text: "Editable",
        box: { x: 10, y: 8, w: 40, h: 12 },
        font: { family: "Microsoft YaHei", sizePt: 8, color: "#111111", opacity: 1, weight: "regular", align: "left", valign: "middle" },
        style: { visibility: "visible", opacity: 1, marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0, wrap: false, fit: "shrink" },
        source: {
          componentQualityBox: { x: 10, y: 8, w: 40, h: 12 },
          componentQualityRole: "text",
          detector: "ocr-text",
          evidenceBox: { x: 9, y: 7, w: 42, h: 14 },
          nativeRebuild: { details: Array(40).fill({ detector: "debug" }) }
        }
      }],
      images: [],
      shapes: [{
        id: "card",
        type: "rect",
        box: { x: 6, y: 6, w: 100, h: 60 },
        style: { fill: "#ffffff", stroke: "#dddddd" },
        source: {
          componentQualityBox: { x: 6, y: 6, w: 100, h: 60 },
          componentQualityRole: "container-border",
          detector: "line-text-native-card-row",
          nativeRebuild: { details: Array(40).fill({ detector: "debug" }) },
          semanticNativeStructure: { rows: Array(40).fill({ role: "card" }) }
        }
      }, {
        id: "text-fidelity-native-run-1-1",
        type: "rect",
        box: { x: 12, y: 12, w: 4, h: 1 },
        style: { fill: "#111111", stroke: "#111111", strokeWidthPt: 0, opacity: 1 },
        source: {
          detector: "text-fidelity-native-primitive",
          componentQualityIgnore: true,
          sourceTextId: "text-1"
        }
      }, {
        id: "native-residual-p1-final-low-contrast-footer-primitives-source-1-1",
        type: "rect",
        box: { x: 20, y: 20, w: 4, h: 1 },
        style: { fill: "#222222", stroke: "#222222", strokeWidthPt: 0, opacity: 1 },
        source: { componentQualityIgnore: true }
      }]
    }]
  };

  const result = compactDeckFinalQualitySourceProvenance(deck);

  assert.ok(result.removedFields > 0);
  assert.deepEqual(result.deck.pages[0].textBoxes[0].source, {
    detector: "ocr-text",
    componentQualityBox: { x: 10, y: 8, w: 40, h: 12 },
    componentQualityRole: "text"
  });
  assert.deepEqual(result.deck.pages[0].textBoxes[0].style, { wrap: false });
  assert.deepEqual(result.deck.pages[0].textBoxes[0].font, {
    family: "Microsoft YaHei",
    sizePt: 8,
    color: "#111111",
    valign: "middle"
  });
  assert.deepEqual(result.deck.pages[0].shapes[0].source, {
    detector: "line-text-native-card-row",
    componentQualityBox: { x: 6, y: 6, w: 100, h: 60 },
    componentQualityRole: "container-border"
  });
  assert.deepEqual(result.deck.pages[0].shapes[1].source, { detector: "text-fidelity-native-primitive", componentQualityIgnore: true });
  assert.equal(result.deck.pages[0].shapes[1].type, "rect");
  assert.deepEqual(result.deck.pages[0].shapes[1].style, { fill: "#111111" });
  assert.deepEqual(result.deck.pages[0].shapes[2].source, { componentQualityIgnore: true });
  assert.equal(result.deck.pages[0].shapes[2].type, "rect");
  assert.deepEqual(result.deck.pages[0].shapes[2].style, { fill: "#222222" });
  assert.equal(result.deck.meta.finalQualitySourceProvenanceCompaction.provider, "worker-final-quality-source-provenance-compaction-v1");
  validateDeckIr(result.deck, root);
  assert.deepEqual(deck.pages[0].shapes[1].source, {
    detector: "text-fidelity-native-primitive",
    componentQualityIgnore: true,
    sourceTextId: "text-1"
  });
});

test("final worker quality source compaction preserves minimum-unit crop evidence", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "final-crop-evidence-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const assetDir = path.join(root, "assets");
  fs.mkdirSync(assetDir, { recursive: true });
  fs.writeFileSync(path.join(assetDir, "icon.png"), "fixture");
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 100, heightPt: 100 },
    meta: { fullSlideResidualOmitted: true },
    pages: [{
      images: [{
        id: "icon",
        type: "fidelity-crop",
        assetPath: "assets/icon.png",
        box: { x: 80, y: 80, w: 4, h: 4 },
        source: {
          protectedMinimumUnit: true,
          cropEvidenceRequired: true,
          originalPixelBox: { x: 10, y: 20, w: 30, h: 40 },
          coordinateReferenceSizePx: { width: 960, height: 1280 },
          mappedPixelBox: { x: 10, y: 20, w: 30, h: 40 },
          tightenedPixelBox: { x: 12, y: 23, w: 24, h: 32 },
          removedNeighborPixels: 9,
          retainedDetailComponents: 2,
          nativeRebuild: { verbose: Array(30).fill({ detector: "debug" }) },
          semanticNativeStructure: { rows: Array(30).fill({ role: "icon" }) }
        }
      }],
      shapes: [],
      textBoxes: []
    }]
  };

  const result = compactDeckFinalQualitySourceProvenance(deck);

  assert.deepEqual(result.deck.pages[0].images[0].source, {
    protectedMinimumUnit: true,
    cropEvidenceRequired: true,
    originalPixelBox: { x: 10, y: 20, w: 30, h: 40 },
    coordinateReferenceSizePx: { width: 960, height: 1280 },
    mappedPixelBox: { x: 10, y: 20, w: 30, h: 40 },
    tightenedPixelBox: { x: 12, y: 23, w: 24, h: 32 },
    removedNeighborPixels: 9,
    retainedDetailComponents: 2
  });
  assert.equal(auditNativeComponentQuality(result.deck).passed, true);
  assert.equal(auditSemanticEditability(result.deck).passed, true);
  validateDeckIr(result.deck, root);
});

test("final worker worst component primitive fit adds native rectangles for verifier-prioritized components", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "component-fidelity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 80; const height = 36;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (let x = 42; x < 48; x += 1) {
    const offset = (18 * width + x) * 4;
    source[offset] = 42; source[offset + 1] = 82; source[offset + 2] = 220; source[offset + 3] = 255;
  }
  for (let x = 10; x < 16; x += 1) {
    const offset = (10 * width + x) * 4;
    source[offset] = 20; source[offset + 1] = 20; source[offset + 2] = 20; source[offset + 3] = 255;
  }
  const isolatedOffset = (19 * width + 52) * 4;
  source[isolatedOffset] = 42; source[isolatedOffset + 1] = 82; source[isolatedOffset + 2] = 220; source[isolatedOffset + 3] = 255;
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 80, heightPt: 36 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{ id: "ignored-text", box: { x: 8, y: 8, w: 14, h: 6 } }],
      images: [],
      shapes: [{ id: "worst-shape", type: "rect", box: { x: 40, y: 16, w: 18, h: 7 }, style: { fill: "#ffffff" } }]
    }]
  };
  const visualQuality = {
    componentWorst: [
      { pageIndex: 0, id: "worst-shape", kind: "shape", role: "shape", attention: true },
      { pageIndex: 0, id: "ignored-text", kind: "text", role: "text", attention: true }
    ]
  };
  const before = JSON.stringify(deck);

  const result = fitDeckWorstComponentFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], visualQuality, maximumRuns: 1 });

  assert.equal(result.addedShapes, 1);
  assert.equal(result.candidateComponents, 1);
  assert.equal(result.candidateTargets, 2);
  assert.equal(result.skippedRuns, 1);
  assert.equal(result.deck.pages[0].shapes.length, 2);
  const primitive = result.deck.pages[0].shapes[1];
  assert.equal(primitive.type, "rect");
  assert.deepEqual(primitive.box, { x: 42, y: 18, w: 6, h: 1 });
  assert.equal(primitive.style.fill.toLowerCase(), "#2a52dc");
  assert.equal(primitive.source.detector, "component-fidelity-native-primitive");
  assert.equal(primitive.source.sourceComponentId, "worst-shape");
  assert.equal(primitive.source.sourceComponentKind, "shape");
  assert.equal(primitive.source.componentQualityIgnore, true);
  assert.equal(result.deck.meta.finalWorstComponentFidelityPrimitiveFit.addedShapes, 1);
  assert.equal(JSON.stringify(deck), before);
});

test("final worker worst component primitive fit prioritizes high-delta runs under caps", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "component-fidelity-priority-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 80; const height = 36;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (let x = 10; x < 16; x += 1) {
    const offset = (10 * width + x) * 4;
    source[offset] = 242; source[offset + 1] = 245; source[offset + 2] = 253; source[offset + 3] = 255;
    rendered[offset] = 255; rendered[offset + 1] = 255; rendered[offset + 2] = 255; rendered[offset + 3] = 255;
  }
  for (let x = 42; x < 48; x += 1) {
    const offset = (18 * width + x) * 4;
    source[offset] = 42; source[offset + 1] = 82; source[offset + 2] = 220; source[offset + 3] = 255;
  }
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 80, heightPt: 36 },
    pages: [{
      pageIndex: 0,
      textBoxes: [],
      images: [],
      shapes: [{ id: "worst-shape", type: "rect", box: { x: 8, y: 8, w: 46, h: 14 }, style: { fill: "#ffffff" } }]
    }]
  };
  const visualQuality = { componentWorst: [{ pageIndex: 0, id: "worst-shape", kind: "shape", role: "shape", attention: true }] };

  const result = fitDeckWorstComponentFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], visualQuality, maximumRuns: 1 });

  assert.equal(result.addedShapes, 1);
  assert.deepEqual(result.deck.pages[0].shapes[1].box, { x: 42, y: 18, w: 6, h: 1 });
  assert.equal(result.deck.pages[0].shapes[1].style.fill.toLowerCase(), "#2a52dc");
});

test("final worker worst component primitive fit uses text evidence boxes and skips non-worst components", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "component-fidelity-text-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 60; const height = 30;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (let x = 24; x < 29; x += 1) {
    const offset = (14 * width + x) * 4;
    source[offset] = 12; source[offset + 1] = 12; source[offset + 2] = 12; source[offset + 3] = 255;
  }
  for (let x = 6; x < 12; x += 1) {
    const offset = (8 * width + x) * 4;
    source[offset] = 12; source[offset + 1] = 12; source[offset + 2] = 12; source[offset + 3] = 255;
  }
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 60, heightPt: 30 },
    pages: [{
      pageIndex: 0,
      textBoxes: [
        { id: "worst-text", box: { x: 4, y: 4, w: 20, h: 8 }, source: { evidenceBox: { x: 22, y: 12, w: 10, h: 6 } } },
        { id: "other-text", box: { x: 4, y: 6, w: 12, h: 6 } }
      ],
      images: [],
      shapes: []
    }]
  };
  const visualQuality = { componentWorst: [{ pageIndex: 0, id: "worst-text", kind: "text", role: "text", attention: true }] };

  const result = fitDeckWorstComponentFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], visualQuality });

  assert.equal(result.addedShapes, 1);
  assert.equal(result.candidateComponents, 1);
  assert.equal(result.deck.pages[0].shapes.length, 1);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, { x: 24, y: 14, w: 5, h: 1 });
  assert.equal(result.deck.pages[0].shapes[0].source.sourceComponentId, "worst-text");
});

test("final worker worst component primitive fit can restrict primitive targets to shapes", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "component-fidelity-shape-only-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 60; const height = 30;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (let x = 24; x < 29; x += 1) {
    const offset = (14 * width + x) * 4;
    source[offset] = 12; source[offset + 1] = 12; source[offset + 2] = 12; source[offset + 3] = 255;
  }
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 60, heightPt: 30 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{ id: "worst-text", box: { x: 22, y: 12, w: 10, h: 6 } }],
      images: [],
      shapes: []
    }]
  };
  const visualQuality = { componentWorst: [{ pageIndex: 0, id: "worst-text", kind: "text", role: "text", attention: true }] };

  const result = fitDeckWorstComponentFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], visualQuality, targetKinds: ["shape"] });

  assert.equal(result.addedShapes, 0);
  assert.equal(result.candidateTargets, 0);
  assert.equal(result.deck.pages[0].shapes.length, 0);
});

test("final worker worst component primitive fit prefers component quality boxes over mixed evidence", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "component-fidelity-quality-box-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 60; const height = 30;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (let x = 34; x < 39; x += 1) {
    const offset = (14 * width + x) * 4;
    source[offset] = 12; source[offset + 1] = 12; source[offset + 2] = 12; source[offset + 3] = 255;
  }
  for (let x = 8; x < 14; x += 1) {
    const offset = (14 * width + x) * 4;
    source[offset] = 20; source[offset + 1] = 160; source[offset + 2] = 80; source[offset + 3] = 255;
  }
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 60, heightPt: 30 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{
        id: "status-text",
        box: { x: 32, y: 12, w: 12, h: 6 },
        source: {
          evidenceBox: { x: 6, y: 12, w: 38, h: 6 },
          componentQualityBox: { x: 32, y: 12, w: 12, h: 6 }
        }
      }],
      images: [],
      shapes: []
    }]
  };
  const visualQuality = { componentWorst: [{ pageIndex: 0, id: "status-text", kind: "text", role: "text", attention: true }] };

  const result = fitDeckWorstComponentFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], visualQuality });

  assert.equal(result.addedShapes, 1);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, { x: 34, y: 14, w: 5, h: 1 });
});

test("final worker worst component primitive fit covers more than twenty four verifier-prioritized components by default", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "component-fidelity-default-targets-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 120; const height = 140;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  const shapes = [];
  const componentWorst = [];
  for (let index = 0; index < 30; index += 1) {
    const y = 4 + index * 4;
    for (let x = 14; x < 18; x += 1) {
      const offset = (y * width + x) * 4;
      source[offset] = 35; source[offset + 1] = 74; source[offset + 2] = 210; source[offset + 3] = 255;
    }
    const id = `component-${String(index).padStart(2, "0")}`;
    shapes.push({ id, type: "rect", box: { x: 10, y: y - 1, w: 12, h: 3 }, style: { fill: "#ffffff" } });
    componentWorst.push({ pageIndex: 0, id, kind: "shape", role: "shape", attention: index < 4 });
  }
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: width, heightPt: height },
    pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes }]
  };

  const result = fitDeckWorstComponentFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], visualQuality: { componentWorst }, maximumRuns: 40 });

  assert.equal(result.candidateTargets, 30);
  assert.equal(result.candidateComponents, 30);
  assert.equal(result.addedShapes, 30);
  assert.equal(result.deck.pages[0].shapes.at(-1).source.sourceComponentId, "component-29");
});

test("final worker worst component primitive fit merges vertical runs into fewer native rectangles", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "component-fidelity-merge-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 50; const height = 30;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (let y = 12; y < 16; y += 1) for (let x = 20; x < 26; x += 1) {
    const offset = (y * width + x) * 4;
    source[offset] = 30; source[offset + 1] = 110; source[offset + 2] = 210; source[offset + 3] = 255;
  }
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 50, heightPt: 30 },
    pages: [{
      pageIndex: 0,
      textBoxes: [],
      images: [],
      shapes: [{ id: "worst-shape", type: "rect", box: { x: 18, y: 10, w: 12, h: 10 }, style: { fill: "#ffffff" } }]
    }]
  };
  const visualQuality = { componentWorst: [{ pageIndex: 0, id: "worst-shape", kind: "shape", role: "shape", attention: true }] };

  const result = fitDeckWorstComponentFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], visualQuality, maximumRuns: 1 });

  assert.equal(result.addedShapes, 1);
  assert.equal(result.candidateComponents, 1);
  assert.deepEqual(result.deck.pages[0].shapes[1].box, { x: 20, y: 12, w: 6, h: 4 });
  assert.equal(result.deck.pages[0].shapes[1].style.fill.toLowerCase(), "#1e6ed2");
});

test("final worker worst component primitive fit captures low-contrast native component edges", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "component-fidelity-low-contrast-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 50; const height = 30;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (let x = 10; x < 30; x += 1) {
    const offset = (12 * width + x) * 4;
    source[offset] = 241; source[offset + 1] = 245; source[offset + 2] = 254; source[offset + 3] = 255;
  }
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 50, heightPt: 30 },
    pages: [{
      pageIndex: 0,
      textBoxes: [],
      images: [],
      shapes: [{ id: "pale-card", type: "roundRect", box: { x: 8, y: 10, w: 24, h: 8 }, style: { fill: "#ffffff", stroke: "#f1f5fe" } }]
    }]
  };
  const visualQuality = { componentWorst: [{ pageIndex: 0, id: "pale-card", kind: "shape", role: "container-border", attention: true }] };

  const result = fitDeckWorstComponentFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], visualQuality, maximumRuns: 2 });

  assert.equal(result.addedShapes, 1);
  assert.equal(result.candidateComponents, 1);
  assert.deepEqual(result.deck.pages[0].shapes[1].box, { x: 10, y: 12, w: 20, h: 1 });
  assert.equal(result.deck.pages[0].shapes[1].style.fill.toLowerCase(), "#f1f5fe");
  assert.equal(result.deck.pages[0].shapes[1].source.sourceComponentId, "pale-card");
});

test("final worker worst component primitive fit keeps one-pixel border antialias runs only for border roles", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "component-fidelity-border-aa-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 40; const height = 24;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  const offset = (8 * width + 18) * 4;
  source[offset] = 51; source[offset + 1] = 106; source[offset + 2] = 239; source[offset + 3] = 255;
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 40, heightPt: 24 },
    pages: [{
      pageIndex: 0,
      textBoxes: [],
      images: [],
      shapes: [{ id: "card", type: "roundRect", box: { x: 10, y: 8, w: 18, h: 8 }, style: { fill: "#ffffff", stroke: "#f1f5fe" } }]
    }]
  };
  const borderQuality = { componentWorst: [{ pageIndex: 0, id: "card", kind: "shape", role: "container-border", attention: true }] };
  const shapeQuality = { componentWorst: [{ pageIndex: 0, id: "card", kind: "shape", role: "shape", attention: true }] };

  const borderResult = fitDeckWorstComponentFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], visualQuality: borderQuality, maximumRuns: 2 });
  const shapeResult = fitDeckWorstComponentFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], visualQuality: shapeQuality, maximumRuns: 2 });

  assert.equal(borderResult.addedShapes, 1);
  assert.deepEqual(borderResult.deck.pages[0].shapes[1].box, { x: 18, y: 8, w: 1, h: 1 });
  assert.equal(shapeResult.addedShapes, 0);
  assert.equal(shapeResult.skippedRuns, 1);
});

test("final worker worst component primitive fit expands zero-width line targets", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "component-fidelity-line-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 60; const height = 60;
  const source = Buffer.alloc(width * height * 4, 255);
  const rendered = Buffer.alloc(width * height * 4, 255);
  for (let y = 12; y < 42; y += 1) {
    for (let x = 33; x < 35; x += 1) {
      const offset = (y * width + x) * 4;
      source[offset] = 181; source[offset + 1] = 223; source[offset + 2] = 202; source[offset + 3] = 255;
    }
  }
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: source });
  writePng(renderedFile, { width, height, rgba: rendered });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 60, heightPt: 60 },
    pages: [{
      pageIndex: 0,
      textBoxes: [],
      images: [],
      shapes: [{ id: "v-line", type: "line", box: { x: 30, y: 10, w: 0, h: 34 }, style: { stroke: "#b5dfca", strokeWidthPt: 0.9, connectorType: "straight" } }]
    }]
  };
  const visualQuality = { componentWorst: [{ pageIndex: 0, id: "v-line", kind: "shape", role: "connector-straight", attention: true }] };

  const result = fitDeckWorstComponentFidelityPrimitives(deck, { sourceImages: [sourceFile], renderedImages: [renderedFile], visualQuality, maximumRuns: 2 });

  assert.equal(result.addedShapes, 1);
  assert.equal(result.candidateComponents, 1);
  assert.deepEqual(result.deck.pages[0].shapes[1].box, { x: 33, y: 12, w: 2, h: 30 });
  assert.equal(result.deck.pages[0].shapes[1].style.fill.toLowerCase(), "#b5dfca");
  assert.equal(result.deck.pages[0].shapes[1].source.sourceComponentId, "v-line");
});

test("final worker light card geometry fit tightens native card rows to source edges", () => {
  const width = 120; const height = 90;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 16; y < 62; y += 1) for (let x = 18; x < 86; x += 1) {
    const edge = x < 21 || x >= 83 || y < 19 || y >= 59;
    if (!edge) continue;
    const offset = (y * width + x) * 4;
    rgba[offset] = 45; rgba[offset + 1] = 85; rgba[offset + 2] = 225; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const card = {
    id: "card",
    type: "roundRect",
    box: { x: 20, y: 20, w: 60, h: 40 },
    style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 120, heightPt: 90 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [card] }] };

  const result = fitDeckLightCardGeometry(deck, { pageImages: [image], candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, { x: 18, y: 16, w: 68, h: 46 });
  assert.equal(result.deck.meta.finalLightCardGeometryFit.provider, "worker-final-light-card-geometry-fit-v1");
  assert.deepEqual(deck.pages[0].shapes[0].box, card.box);
});

test("final worker light card geometry fit prioritizes quality worst card rows", () => {
  const width = 220; const height = 90;
  const rgba = Buffer.alloc(width * height * 4, 255);
  const drawBorder = (left, top, right, bottom, color) => {
    for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
      const edge = x < left + 3 || x >= right - 3 || y < top + 3 || y >= bottom - 3;
      if (!edge) continue;
      const offset = (y * width + x) * 4;
      rgba[offset] = color.r; rgba[offset + 1] = color.g; rgba[offset + 2] = color.b; rgba[offset + 3] = 255;
    }
  };
  drawBorder(17, 15, 85, 61, { r: 45, g: 85, b: 225 });
  drawBorder(128, 17, 191, 57, { r: 45, g: 85, b: 225 });
  const image = { width, height, rgba };
  const first = { id: "first-card", type: "roundRect", box: { x: 20, y: 20, w: 60, h: 40 }, style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 }, source: { detector: "line-text-native-card-row" } };
  const worst = { id: "worst-card", type: "roundRect", box: { x: 130, y: 20, w: 58, h: 36 }, style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 }, source: { detector: "line-text-native-card-row" } };
  const priorityIds = new Map([["0:worst-card", 0]]);
  const deck = { version: "1.0", slideSize: { widthPt: 220, heightPt: 90 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [first, worst] }] };

  const result = fitDeckLightCardGeometry(deck, { pageImages: [image], priorityIds, candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 2);
  assert.deepEqual(result.changedComponentKeys, ["0:worst-card"]);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, first.box);
  assert.deepEqual(result.deck.pages[0].shapes[1].box, { x: 128, y: 17, w: 63, h: 40 });
});

test("final worker light card geometry quality gate requires target component improvement", () => {
  const baselineQuality = {
    componentWorst: [
      { pageIndex: 0, id: "worst-card", severity: 2.86, pixelDiffRatio: 0.35, foregroundMissingRatio: 0.42, attention: true },
      { pageIndex: 0, id: "other-card", severity: 1.5, pixelDiffRatio: 0.2, foregroundMissingRatio: 0.22, attention: true }
    ]
  };
  assert.equal(targetComponentQualityImproves({
    baselineQuality,
    candidateQuality: { componentWorst: [{ pageIndex: 0, id: "worst-card", severity: 2.57, pixelDiffRatio: 0.35, foregroundMissingRatio: 0.42, attention: true }] },
    targetKeys: new Set(["0:worst-card"])
  }), true);
  assert.equal(targetComponentQualityImproves({
    baselineQuality,
    candidateQuality: { componentWorst: [{ pageIndex: 0, id: "other-card", severity: 1.5, pixelDiffRatio: 0.2, foregroundMissingRatio: 0.22, attention: true }] },
    targetKeys: new Set(["0:worst-card"])
  }), false);
  assert.equal(targetComponentQualityImproves({
    baselineQuality,
    candidateQuality: {
      componentWorst: [{ pageIndex: 0, id: "other-card", severity: 1.5, pixelDiffRatio: 0.2, foregroundMissingRatio: 0.22, attention: true }],
      componentLocalMetrics: [{ pageIndex: 0, id: "worst-card", severity: 2.57, pixelDiffRatio: 0.34, foregroundMissingRatio: 0.4, attention: true }]
    },
    targetKeys: new Set(["0:worst-card"])
  }), true);
  assert.equal(targetComponentQualityImproves({
    baselineQuality,
    candidateQuality: { componentWorst: [
      { pageIndex: 0, id: "worst-card", severity: 2.86, pixelDiffRatio: 0.35, foregroundMissingRatio: 0.42, attention: true },
      { pageIndex: 0, id: "other-card", severity: 0.8, pixelDiffRatio: 0.1, foregroundMissingRatio: 0.1, attention: false }
    ] },
    targetKeys: new Set(["0:worst-card"])
  }), false);
  assert.equal(targetComponentQualityImproves({
    baselineQuality,
    candidateQuality: { componentWorst: [{ pageIndex: 0, id: "worst-card", severity: 2.89, pixelDiffRatio: 0.35, foregroundMissingRatio: 0.42, attention: true }] },
    targetKeys: new Set(["0:worst-card"])
  }), false);
});

test("final worker light card geometry target keys come from changed shapes before priority fallback", () => {
  assert.deepEqual([...changedComponentKeysFromFit({ changedComponentKeys: ["0:changed-card"] }, new Map([["0:priority-card", 0]]))], ["0:changed-card"]);
  assert.deepEqual([...changedComponentKeysFromFit({ changedComponentKeys: [] }, new Map([["0:priority-card", 0]]))], ["0:priority-card"]);
});

test("final worker light card geometry fit uses source projection for pale borders", () => {
  const width = 130; const height = 90;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 14; y < 64; y += 1) for (let x = 16; x < 88; x += 1) {
    const edge = x < 18 || x >= 86 || y < 16 || y >= 62;
    if (!edge) continue;
    const offset = (y * width + x) * 4;
    rgba[offset] = 238; rgba[offset + 1] = 240; rgba[offset + 2] = 244; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const card = {
    id: "pale-card",
    type: "roundRect",
    box: { x: 20, y: 20, w: 60, h: 38 },
    style: { fill: "#FFFFFF", stroke: "#F7F9FC", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 130, heightPt: 90 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [card] }] };

  const result = fitDeckLightCardGeometry(deck, { pageImages: [image], candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, { x: 16, y: 14, w: 72, h: 50 });
  assert.deepEqual(deck.pages[0].shapes[0].box, card.box);
});

test("final worker light card geometry fit falls back to text anchors for pale card rows", () => {
  const width = 960; const height = 540;
  const image = { width, height, rgba: Buffer.alloc(width * height * 4, 255) };
  const card = {
    id: "pale-card",
    type: "roundRect",
    box: { x: 282.67, y: 107.33, w: 118.67, h: 58 },
    style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const textBoxes = [
    { id: "title", text: "文档与表格", box: { x: 311.11, y: 117.33, w: 56.89, h: 15.11 } },
    { id: "body", text: "制度/合同/报价/SOP /", box: { x: 311.11, y: 132.44, w: 111.11, h: 12.44 } },
    { id: "tail", text: "图纸", box: { x: 310.22, y: 144, w: 23.11, h: 13.33 } }
  ];
  const deck = { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0, textBoxes, images: [], shapes: [card] }] };

  const result = fitDeckLightCardGeometry(deck, { pageImages: [image], candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  const fitted = result.deck.pages[0].shapes[0].box;
  assert.ok(Math.abs(fitted.x - 303.1) < 0.01);
  assert.ok(Math.abs(fitted.y - 102.25) < 0.01);
  assert.ok(Math.abs(fitted.w - 112) < 0.01);
  assert.ok(Math.abs(fitted.h - 71.9) < 0.01);
  assert.equal(result.deck.pages[0].shapes[0].source.finalLightCardTextAnchorGeometryFit.provider, "worker-final-light-card-text-anchor-geometry-fit-v1");
});

test("final worker light card geometry fit disables text-anchor guesses for verifier-worst borders", () => {
  const width = 960; const height = 540;
  const image = { width, height, rgba: Buffer.alloc(width * height * 4, 255) };
  const card = {
    id: "pale-card",
    type: "roundRect",
    box: { x: 282.67, y: 107.33, w: 118.67, h: 58 },
    style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const textBoxes = [
    { id: "title", text: "文档与表格", box: { x: 311.11, y: 117.33, w: 56.89, h: 15.11 } },
    { id: "body", text: "制度/合同/报价/SOP /", box: { x: 311.11, y: 132.44, w: 111.11, h: 12.44 } },
    { id: "tail", text: "图纸", box: { x: 310.22, y: 144, w: 23.11, h: 13.33 } }
  ];
  const deck = { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ pageIndex: 0, textBoxes, images: [], shapes: [card] }] };

  const result = fitDeckLightCardGeometry(deck, {
    pageImages: [image],
    candidateLimit: 1,
    priorityIds: new Map([["0:pale-card", 0]]),
    allowTextAnchorGeometry: false
  });

  assert.equal(result.changedShapes, 0);
  assert.equal(result.candidateShapes, 0);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, card.box);
});

test("final worker light card geometry fit uses accumulated pale border pixels when edges are interrupted", () => {
  const width = 130; const height = 90;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 14; y < 64; y += 1) for (let x = 16; x < 88; x += 1) {
    const verticalEdge = (x < 18 || x >= 86) && y % 2 === 0;
    const horizontalEdge = (y < 16 || y >= 62) && x % 2 === 0;
    if (!verticalEdge && !horizontalEdge) continue;
    const offset = (y * width + x) * 4;
    rgba[offset] = 238; rgba[offset + 1] = 240; rgba[offset + 2] = 244; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const card = {
    id: "dashed-pale-card",
    type: "roundRect",
    box: { x: 20, y: 20, w: 60, h: 38 },
    style: { fill: "#FFFFFF", stroke: "#F7F9FC", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 130, heightPt: 90 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [card] }] };

  const result = fitDeckLightCardGeometry(deck, { pageImages: [image], candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, { x: 16, y: 14, w: 72, h: 50 });
});

test("final worker light card geometry fit moves existing side accents with their card", () => {
  const width = 140; const height = 92;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 14; y < 66; y += 1) for (let x = 18; x < 94; x += 1) {
    const edge = x < 21 || x >= 91 || y < 17 || y >= 63;
    if (!edge) continue;
    const offset = (y * width + x) * 4;
    rgba[offset] = 80; rgba[offset + 1] = 120; rgba[offset + 2] = 235; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const card = {
    id: "accent-card",
    type: "roundRect",
    box: { x: 22, y: 20, w: 60, h: 40 },
    style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const accent = {
    id: "accent-card-source-side-accent-left",
    type: "line",
    box: { x: 22, y: 22, w: 0, h: 32 },
    style: { stroke: "#5078EB", strokeWidthPt: 1.2, connectorType: "straight" },
    source: { detector: "line-text-native-card-side-accent", sourceCardId: "accent-card", side: "left" }
  };
  const sourceEdge = {
    id: "accent-card-source-top",
    type: "line",
    box: { x: 24, y: 20, w: 54, h: 0 },
    style: { stroke: "#5078EB", strokeWidthPt: 0.8, connectorType: "straight" },
    source: { detector: "source-native-edge-refinement", sourceShapeId: "accent-card", supportedSide: "top" }
  };
  const adjacentMislabeledEdge = {
    id: "adjacent-card-source-top",
    type: "line",
    box: { x: 102, y: 20, w: 26, h: 0 },
    style: { stroke: "#5078EB", strokeWidthPt: 0.8, connectorType: "straight" },
    source: { detector: "source-native-edge-refinement", sourceShapeId: "accent-card", supportedSide: "top" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 140, heightPt: 92 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [card, accent, sourceEdge, adjacentMislabeledEdge] }] };

  const result = fitDeckLightCardGeometry(deck, { pageImages: [image], candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, { x: 18, y: 14, w: 76, h: 52 });
  assert.equal(result.deck.pages[0].shapes[1].box.x, 18);
  assert.equal(result.deck.pages[0].shapes[1].box.y, 16.6);
  assert.equal(result.deck.pages[0].shapes[1].box.h, 41.6);
  assert.ok(Math.abs(result.deck.pages[0].shapes[2].box.x - 20.53) < 0.01);
  assert.equal(result.deck.pages[0].shapes[2].box.y, 14);
  assert.ok(Math.abs(result.deck.pages[0].shapes[2].box.w - 68.4) < 0.01);
  assert.deepEqual(result.deck.pages[0].shapes[3].box, adjacentMislabeledEdge.box);
  assert.deepEqual(deck.pages[0].shapes[1].box, accent.box);
  assert.deepEqual(deck.pages[0].shapes[2].box, sourceEdge.box);
  assert.deepEqual(deck.pages[0].shapes[3].box, adjacentMislabeledEdge.box);
});

test("final worker light card geometry fit reassigns source edge owners by side geometry", () => {
  const first = {
    id: "first-card",
    type: "roundRect",
    box: { x: 20, y: 20, w: 50, h: 34 },
    style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const second = {
    id: "second-card",
    type: "roundRect",
    box: { x: 90, y: 20, w: 42, h: 34 },
    style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const misplaced = {
    id: "first-card-source-top-1",
    type: "line",
    box: { x: 90, y: 20, w: 42, h: 0 },
    style: { stroke: "#DCE5F3", strokeWidthPt: 0.8, connectorType: "straight" },
    source: { detector: "source-native-edge-refinement", sourceShapeId: "first-card", supportedSide: "top" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 160, heightPt: 90 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [first, second, misplaced] }] };

  const result = fitDeckLightCardGeometry(deck);

  assert.equal(result.changedShapes, 0);
  assert.equal(result.reassignedSourceEdgeLines, 1);
  assert.equal(result.deck.pages[0].shapes[2].source.sourceShapeId, "second-card");
  assert.equal(result.deck.pages[0].shapes[2].source.sourceNativeEdgeOwnerReassigned.previousSourceShapeId, "first-card");
  assert.equal(deck.pages[0].shapes[2].source.sourceShapeId, "first-card");
});

test("final worker light card geometry fit tolerates source edge top offset when reassigning owners", () => {
  const first = {
    id: "first-card",
    type: "roundRect",
    box: { x: 20, y: 50, w: 50, h: 34 },
    style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const second = {
    id: "second-card",
    type: "roundRect",
    box: { x: 90, y: 50, w: 122, h: 46 },
    style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const offsetTop = {
    id: "first-card-source-top-1",
    type: "line",
    box: { x: 90, y: 44.6, w: 122, h: 0 },
    style: { stroke: "#DCE5F3", strokeWidthPt: 0.8, connectorType: "straight" },
    source: { detector: "source-native-edge-refinement", sourceShapeId: "first-card", supportedSide: "top" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 240, heightPt: 140 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [first, second, offsetTop] }] };

  const result = fitDeckLightCardGeometry(deck);

  assert.equal(result.reassignedSourceEdgeLines, 1);
  assert.equal(result.deck.pages[0].shapes[2].source.sourceShapeId, "second-card");
});

test("final worker light card geometry fit ignores non-card detectors and implausible noise", () => {
  const width = 90; const height = 70;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 10; y < 14; y += 1) for (let x = 10; x < 14; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 30; rgba[offset + 1] = 60; rgba[offset + 2] = 180; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const noisyCard = { id: "noisy-card", type: "roundRect", box: { x: 20, y: 20, w: 44, h: 28 }, style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 }, source: { detector: "line-text-native-card-row" } };
  const ignoredPanel = { id: "ignored-panel", type: "roundRect", box: { x: 18, y: 18, w: 48, h: 32 }, style: { fill: "#FFFFFF", stroke: "#F0F4FE", strokeWidthPt: 0.55 }, source: { detector: "line-text-native-title-band-panel" } };
  const deck = { version: "1.0", slideSize: { widthPt: 90, heightPt: 70 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [noisyCard, ignoredPanel] }] };

  const result = fitDeckLightCardGeometry(deck, { pageImages: [image] });

  assert.equal(result.changedShapes, 0);
  assert.equal(result.candidateShapes, 0);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, noisyCard.box);
  assert.deepEqual(result.deck.pages[0].shapes[1].box, ignoredPanel.box);
});

test("final worker saturated color panel fit tightens native panels to source color bounds", () => {
  const width = 100; const height = 100;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 35; y < 65; y += 1) for (let x = 40; x < 70; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 14; rgba[offset + 1] = 156; rgba[offset + 2] = 156; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const panel = {
    id: "color-panel",
    type: "roundRect",
    box: { x: 35, y: 30, w: 40, h: 40 },
    style: { fill: "#0C8989", stroke: "#0C8989", strokeWidthPt: 0 },
    source: { detector: "line-text-native-color-panel" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [panel] }] };

  const result = fitDeckSaturatedColorPanels(deck, { pageImages: [image], candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, { x: 40, y: 35, w: 30, h: 30 });
  assert.equal(result.deck.pages[0].shapes[0].style.fill.toLowerCase(), "#0e9c9c");
  assert.equal(result.deck.pages[0].shapes[0].source.finalSaturatedColorPanelFit.provider, "worker-final-saturated-color-panel-fit-v1");
  assert.deepEqual(deck.pages[0].shapes[0].box, panel.box);
});

test("final worker saturated color panel fit covers native card rows", () => {
  const width = 160; const height = 110;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 35; y < 79; y += 1) for (let x = 45; x < 140; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 214; rgba[offset + 1] = 69; rgba[offset + 2] = 107; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const row = {
    id: "saturated-row",
    type: "roundRect",
    box: { x: 66, y: 47, w: 72, h: 25 },
    style: { fill: "#D6456B", stroke: "#D6456B", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 160, heightPt: 110 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [row] }] };

  const result = fitDeckSaturatedColorPanels(deck, { pageImages: [image], candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, { x: 45, y: 35, w: 95, h: 44 });
  assert.equal(result.deck.pages[0].shapes[0].style.fill.toLowerCase(), "#d6456b");
  assert.equal(result.deck.pages[0].shapes[0].source.finalSaturatedColorPanelFit.provider, "worker-final-saturated-color-panel-fit-v1");
  assert.deepEqual(deck.pages[0].shapes[0].box, row.box);
});
