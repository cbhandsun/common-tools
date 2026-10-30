"use strict";
const test = require("node:test");
const { addNativeResidualPrimitives, changedComponentKeysFromFit, compactDeckFinalQualitySourceProvenance, compactDeckLateShapeSourceBudgetProvenance, compactDeckLateTextSourceBudgetProvenance, compactDeckNativeShapeSourceProvenance, createImageToEditableArchiveHandler, finalRefinementQualityAcceptable, fitDeckEditableTextFontFamily, fitDeckLightCardGeometry, fitDeckLightCardSideAccents, fitDeckLightCardSourceStrokes, fitDeckLightCardStrokeColors, fitDeckLightCardStrokes, fitDeckLowContrastFooterMarks, fitDeckLowContrastFooterPrimitives, fitDeckLowSaturationPanelFills, fitDeckMissingNativeVisualAtomShapes, fitDeckNativeShapeThinStrokes, fitDeckOcrEvidenceToSource, fitDeckSaturatedColorPanels, fitDeckSourceVerticalLines, fitDeckTextFidelityPrimitives, fitDeckWorstComponentFidelityPrimitives, fitDeckWorstConnectorStyles, fitDeckWorstRichOcrTextLayout, fitDeckWorstTextArrowGlyphs, fitDeckWorstTextBoxNudge, fitDeckWorstTextColors, fitDeckWorstTextComposite, fitDeckWorstTextInkBoxes, fitDeckWorstTextScale, fitDeckWorstTextWeight, focusedCandidateLimits, focusedLightCardStrokeWidthCandidates, isReliableMissingNativeVisualAtom, lightCardSourceStrokeQualityAcceptable, missingNativeTargetInkRunShapes, nativeOnlyMissingNativeLinesDoesNotRegress, nativeOnlyRefinementDoesNotMateriallyRegress, nativeOnlyResidualQualityAcceptable, removeFullSlideResidualImages, replacePictorialIconCropsWithNativeShapes, residualDeduplicationStatus, targetComponentQualityImproves, targetMissingNativeComponentQualityImproves, tryBuildFinalLineTextCoveredCropDropCandidate, tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate, tryBuildNativeOnlyPictorialIconCandidate, tryBuildNativeOnlyRichOcrTextLayoutCandidate, validateDeckIr, worstTextBoxNudgeCandidates, worstTextCompositeScaleCandidates } = require("../packages/slideclone-worker-adapter/team-worker");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { writePng } = require("../packages/slideclone-core/png");
const { createNativeRebuilder, startupFailureCode, workerSettings } = require("../packages/remote-mcp-server/bin/common-tools-team-image-worker");
const { addLowContrastFooterNativeMarks, boundedOcrSourceDeck, correctContextualOcrLines, createRawImageNativeRebuilder, largeRasterEditability, nativeObjectMetrics, residualEraseObjects, shouldOmitFullSlideResidual, writeTextErasedVisualFallbackAsset } = require("../packages/slideclone-core/team-native-rebuild");
const { archive, minimalPptxBuilderSource, tarEntry } = require('./helpers/image-team-worker.cjs');

test("final worker saturated color panel fit prioritizes verifier-worst native card rows", () => {
  const width = 180; const height = 120;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 16; y < 68; y += 1) for (let x = 16; x < 116; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 214; rgba[offset + 1] = 69; rgba[offset + 2] = 107; rgba[offset + 3] = 255;
  }
  for (let y = 78; y < 110; y += 1) for (let x = 124; x < 168; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 14; rgba[offset + 1] = 156; rgba[offset + 2] = 156; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const larger = {
    id: "larger-row",
    type: "roundRect",
    box: { x: 36, y: 30, w: 58, h: 28 },
    style: { fill: "#D6456B", stroke: "#D6456B", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const worst = {
    id: "worst-row",
    type: "roundRect",
    box: { x: 132, y: 84, w: 28, h: 20 },
    style: { fill: "#0C8989", stroke: "#0C8989", strokeWidthPt: 0.55 },
    source: { detector: "line-text-native-card-row" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 180, heightPt: 120 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [larger, worst] }] };
  const priorityIds = new Map([["0:worst-row", 0]]);

  const result = fitDeckSaturatedColorPanels(deck, { pageImages: [image], candidateLimit: 1, priorityIds });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 2);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, larger.box);
  assert.deepEqual(result.deck.pages[0].shapes[1].box, { x: 124, y: 78, w: 44, h: 32 });
  assert.equal(result.deck.pages[0].shapes[1].source.finalSaturatedColorPanelFit.provider, "worker-final-saturated-color-panel-fit-v1");
});

test("final worker saturated color panel fit covers leading icon swatches without taking neighbors", () => {
  const width = 180; const height = 90;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 24; y < 68; y += 1) for (let x = 46; x < 91; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 214; rgba[offset + 1] = 69; rgba[offset + 2] = 107; rgba[offset + 3] = 255;
  }
  for (let y = 24; y < 68; y += 1) for (let x = 102; x < 162; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 214; rgba[offset + 1] = 69; rgba[offset + 2] = 107; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const swatch = {
    id: "swatch",
    type: "roundRect",
    box: { x: 63, y: 33, w: 25, h: 24 },
    style: { fill: "#D6456B", stroke: "#D6456B", strokeWidthPt: 0.25 },
    source: { detector: "line-text-native-leading-icon-swatch" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 180, heightPt: 90 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [swatch] }] };

  const result = fitDeckSaturatedColorPanels(deck, { pageImages: [image], candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.ok(result.deck.pages[0].shapes[0].box.x >= 46);
  assert.ok(result.deck.pages[0].shapes[0].box.x <= 48);
  assert.equal(result.deck.pages[0].shapes[0].box.y, 24);
  assert.ok(result.deck.pages[0].shapes[0].box.w >= 43);
  assert.ok(result.deck.pages[0].shapes[0].box.w <= 46);
  assert.equal(result.deck.pages[0].shapes[0].box.h, 44);
  assert.ok(result.deck.pages[0].shapes[0].box.x + result.deck.pages[0].shapes[0].box.w < 94);
  assert.deepEqual(deck.pages[0].shapes[0].box, swatch.box);
});

test("final worker low saturation panel fill fit samples pale source panel colors", () => {
  const width = 100; const height = 100;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 20; y < 70; y += 1) for (let x = 20; x < 80; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 241; rgba[offset + 1] = 246; rgba[offset + 2] = 255; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const panel = {
    id: "pale-panel",
    type: "rect",
    box: { x: 18, y: 18, w: 64, h: 54 },
    style: { fill: "#FFFFFF", stroke: "#7A6BC1", strokeWidthPt: 0.7 },
    source: { detector: "line-text-native-title-band-panel" }
  };
  const ignored = {
    id: "ignored",
    type: "rect",
    box: { x: 5, y: 5, w: 10, h: 10 },
    style: { fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidthPt: 0 },
    source: { detector: "unknown" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [panel, ignored] }] };

  const result = fitDeckLowSaturationPanelFills(deck, { pageImages: [image], candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.equal(result.deck.pages[0].shapes[0].style.fill.toLowerCase(), "#f1f6ff");
  assert.equal(result.deck.pages[0].shapes[0].style.stroke, "#7A6BC1");
  assert.equal(result.deck.pages[0].shapes[0].source.finalLowSaturationPanelFillFit.provider, "worker-final-low-saturation-panel-fill-fit-v1");
  assert.equal(result.deck.pages[0].shapes[1].style.fill, "#FFFFFF");
  assert.equal(deck.pages[0].shapes[0].style.fill, "#FFFFFF");
});

test("final worker native shape thin stroke fit is bounded and skips connectors", () => {
  const panel = {
    id: "panel",
    type: "roundRect",
    box: { x: 10, y: 10, w: 80, h: 40 },
    style: { fill: "#FFFFFF", stroke: "#D0D7E2", strokeWidthPt: 0.8 },
    source: { nativeRebuild: true }
  };
  const line = {
    id: "line",
    type: "line",
    box: { x: 20, y: 20, w: 60, h: 0 },
    style: { stroke: "#D0D7E2", strokeWidthPt: 0.8 },
    source: { nativeRebuild: true }
  };
  const heavy = {
    id: "heavy",
    type: "ellipse",
    box: { x: 20, y: 40, w: 20, h: 20 },
    style: { stroke: "#D0D7E2", strokeWidthPt: 3 },
    source: { nativeRebuild: true }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [panel, line, heavy] }] };

  const result = fitDeckNativeShapeThinStrokes(deck, { candidateLimit: 1, strokeWidthMultiplier: 0.6 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.equal(result.deck.pages[0].shapes[0].style.strokeWidthPt, 0.48);
  assert.equal(result.deck.pages[0].shapes[0].source.finalNativeShapeThinStrokeFit.provider, "worker-final-native-shape-thin-stroke-fit-v1");
  assert.equal(result.deck.pages[0].shapes[0].source.finalNativeShapeThinStrokeFit.strokeWidthMultiplier, 0.6);
  assert.equal(result.deck.meta.finalNativeShapeThinStrokeFit.strokeWidthMultiplier, 0.6);
  assert.equal(result.deck.pages[0].shapes[1].style.strokeWidthPt, 0.8);
  assert.equal(result.deck.pages[0].shapes[2].style.strokeWidthPt, 3);
  assert.equal(deck.pages[0].shapes[0].style.strokeWidthPt, 0.8);
});

test("final worker editable text font family fit changes only visible editable text", () => {
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      pageIndex: 0,
      textBoxes: [
        {
          id: "visible",
          text: "企业知识中枢",
          box: { x: 10, y: 10, w: 40, h: 10 },
          font: { family: "Microsoft YaHei", sizePt: 9, opacity: 1 },
          style: { visibility: "visible", opacity: 1 },
          source: { editable: true }
        },
        {
          id: "hidden",
          text: "隐藏",
          box: { x: 10, y: 24, w: 20, h: 8 },
          font: { family: "Microsoft YaHei", sizePt: 8, opacity: 1 },
          style: { visibility: "hidden", opacity: 1 },
          source: { editable: true }
        },
        {
          id: "locked",
          text: "锁定",
          box: { x: 10, y: 38, w: 20, h: 8 },
          font: { family: "Microsoft YaHei", sizePt: 8, opacity: 1 },
          style: { visibility: "visible", opacity: 1 },
          source: { editable: false }
        }
      ],
      images: [],
      shapes: []
    }]
  };

  const result = fitDeckEditableTextFontFamily(deck, { fontFamily: "Aptos" });

  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.candidateTextBoxes, 1);
  assert.equal(result.deck.pages[0].textBoxes[0].font.family, "Aptos");
  assert.equal(result.deck.pages[0].textBoxes[0].source.finalEditableTextFontFamilyFit.fontFamily, "Aptos");
  assert.equal(result.deck.meta.finalEditableTextFontFamilyFit.provider, "worker-final-editable-text-font-family-fit-v1");
  assert.equal(result.deck.pages[0].textBoxes[1].font.family, "Microsoft YaHei");
  assert.equal(result.deck.pages[0].textBoxes[2].font.family, "Microsoft YaHei");
  assert.equal(deck.pages[0].textBoxes[0].font.family, "Microsoft YaHei");
});

test("final worker editable text font family fit includes common CJK fallback candidates", () => {
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{
        id: "visible-cjk",
        text: "知识图谱",
        box: { x: 10, y: 10, w: 40, h: 10 },
        font: { family: "Microsoft YaHei", sizePt: 9, opacity: 1 },
        style: { visibility: "visible", opacity: 1 },
        source: { editable: true }
      }],
      images: [],
      shapes: []
    }]
  };

  const result = fitDeckEditableTextFontFamily(deck, { fontFamily: "DengXian" });

  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.candidateTextBoxes, 1);
  assert.equal(result.deck.pages[0].textBoxes[0].font.family, "DengXian");
  assert.equal(result.deck.pages[0].textBoxes[0].source.finalEditableTextFontFamilyFit.fontFamily, "DengXian");
  assert.equal(deck.pages[0].textBoxes[0].font.family, "Microsoft YaHei");
});

test("final worker editable text font family candidates prioritize Office CJK fonts without hiding same-family alternatives", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();
  assert.match(source, /return \["Microsoft YaHei", "DengXian", "SimHei", "SimSun", "Noto Sans SC", "Arial", "Aptos", "Noto Sans CJK SC", "Noto Sans"\];/u);
  assert.match(source, /function focusedEditableTextFontFamilyCandidates\(\) \{\s+return editableTextFontFamilyCandidates\(\)\.slice\(0, 5\);/u);
  assert.match(source, /function focusedEditableTextFontFamilyCandidateLimits\(count\) \{[\s\S]+Math\.min\(3, count\)/u);
  assert.match(source, /const candidateTextBoxes = Math\.max\(0, \.\.\.fontFamilies[\s\S]+\.candidateTextBoxes\)\);/u);
});

test("final worker worst connector style fit targets prioritized straight connectors only", () => {
  const worst = {
    id: "worst-line",
    type: "line",
    box: { x: 10, y: 10, w: 0, h: 90 },
    style: { stroke: "#B5DFCA", strokeWidthPt: 0.9, connectorType: "straight" },
    source: { detector: "long-axis-line" }
  };
  const otherLine = {
    id: "other-line",
    type: "line",
    box: { x: 30, y: 10, w: 80, h: 0 },
    style: { stroke: "#B5DFCA", strokeWidthPt: 0.9, connectorType: "straight" },
    source: { detector: "long-axis-line" }
  };
  const card = {
    id: "card",
    type: "roundRect",
    box: { x: 60, y: 20, w: 40, h: 30 },
    style: { fill: "#FFFFFF", stroke: "#B5DFCA", strokeWidthPt: 0.9 },
    source: { detector: "line-text-native-card-row" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 120, heightPt: 120 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [otherLine, worst, card] }] };
  const priorityIds = new Map([["0:worst-line", 0]]);

  const result = fitDeckWorstConnectorStyles(deck, { priorityIds, candidateLimit: 1, strokeWidthMultiplier: 1.25, lineCap: "round" });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.equal(result.deck.pages[0].shapes[1].style.strokeWidthPt, 1.13);
  assert.equal(result.deck.pages[0].shapes[1].style.lineCap, "round");
  assert.equal(result.deck.pages[0].shapes[1].source.finalWorstConnectorStyleFit.provider, "worker-final-worst-connector-style-fit-v1");
  assert.equal(result.deck.pages[0].shapes[0].style.strokeWidthPt, 0.9);
  assert.equal(result.deck.pages[0].shapes[2].style.strokeWidthPt, 0.9);
  assert.equal(deck.pages[0].shapes[1].style.strokeWidthPt, 0.9);
});

test("final worker shape source provenance compaction preserves rendering and OCR evidence", () => {
  const source = {
    editable: true,
    nativeRebuild: true,
    semanticNativeStructure: true,
    detector: "line-text-native-card-row",
    componentQualityIgnore: true,
    sourceComponentId: "card-1"
  };
  const input = {
    version: "1.0",
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{
        id: "ocr-text",
        text: "Editable",
        box: { x: 12, y: 14, w: 40, h: 10 },
        source: {
          editable: true,
          ocrProvider: "team-pinned-ocr",
          overlayVisibility: "visible",
          confidence: 0.98,
          evidenceBox: { x: 12, y: 14, w: 40, h: 10 }
        }
      }],
      images: [],
      shapes: [
        { id: "card", type: "roundRect", box: { x: 10, y: 10, w: 80, h: 40 }, style: { fill: "#FFFFFF", stroke: "#D0D7E2", strokeWidthPt: 0.8 }, source },
        { id: "line", type: "line", box: { x: 10, y: 60, w: 80, h: 0 }, style: { stroke: "#D0D7E2", strokeWidthPt: 0.8 }, source: { detector: "long-axis-line" } },
        { id: "ordinary", type: "rect", box: { x: 10, y: 70, w: 20, h: 10 }, style: { fill: "#EEF2FF" }, source: { editable: true, detector: "ordinary-shape" } }
      ]
    }]
  };
  const before = JSON.stringify(input);

  const result = compactDeckNativeShapeSourceProvenance(input);

  assert.equal(result.changedShapes, 2);
  assert.equal(result.removedFields, 4);
  assert.deepEqual(result.removedFieldNames, ["editable", "nativeRebuild", "semanticNativeStructure"]);
  assert.deepEqual(result.deck.pages[0].shapes[0].source, {
    detector: "line-text-native-card-row",
    componentQualityIgnore: true,
    sourceComponentId: "card-1"
  });
  assert.deepEqual(result.deck.pages[0].shapes[1].source, { detector: "long-axis-line" });
  assert.deepEqual(result.deck.pages[0].shapes[2].source, { detector: "ordinary-shape" });
  assert.equal(result.deck.pages[0].textBoxes[0].source.ocrProvider, "team-pinned-ocr");
  assert.deepEqual(result.deck.pages[0].textBoxes[0].source.evidenceBox, { x: 12, y: 14, w: 40, h: 10 });
  assert.equal(result.deck.meta.finalShapeSourceProvenanceCompaction.provider, "worker-final-shape-source-provenance-compaction-v1");
  assert.equal(JSON.stringify(input), before);
});

test("final worker late shape source budget compaction preserves quality-critical provenance", () => {
  const input = {
    version: "1.0",
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{
        id: "ocr-text",
        text: "Editable",
        box: { x: 12, y: 14, w: 40, h: 10 },
        source: { ocrProvider: "team-pinned-ocr", evidenceBox: { x: 12, y: 14, w: 40, h: 10 } }
      }],
      images: [],
      shapes: [{
        id: "shape",
        type: "rect",
        box: { x: 10, y: 10, w: 20, h: 10 },
        style: { fill: "#EEF2FF" },
        source: {
          detector: "line-text-native-card-row",
          componentQualityIgnore: true,
          sourceComponentId: "component-1",
          sourceComponentKind: "shape",
          nativeComponentArchetype: "line-text-card",
          nativeComponentRole: "container",
          pageImage: "assets/source.png",
          textCount: 3,
          rowSize: 2,
          sourceTextId: "text-1",
          rowIndex: 1,
          columnIndex: 2,
          finalSourceVerticalLineFit: { provider: "worker-final-source-vertical-line-fit-v1" },
          finalSaturatedColorPanelFit: { provider: "worker-final-saturated-color-panel-fit-v1" }
        }
      }, {
        id: "primitive",
        type: "rect",
        box: { x: 40, y: 10, w: 2, h: 2 },
        style: { fill: "#111111" },
        source: {
          detector: "component-fidelity-native-primitive",
          componentQualityIgnore: true,
          sourceComponentId: "component-2",
          sourceComponentKind: "text"
        }
      }]
    }]
  };
  const before = JSON.stringify(input);

  const result = compactDeckLateShapeSourceBudgetProvenance(input);

  assert.equal(result.changedShapes, 2);
  assert.equal(result.removedFields, 15);
  assert.deepEqual(result.removedFieldNames, ["columnIndex", "detector", "finalSaturatedColorPanelFit", "finalSourceVerticalLineFit", "nativeComponentArchetype", "nativeComponentRole", "pageImage", "rowIndex", "rowSize", "sourceComponentId", "sourceComponentKind", "sourceTextId", "textCount"]);
  assert.deepEqual(result.deck.pages[0].shapes[0].source, {
    detector: "line-text-native-card-row",
    componentQualityIgnore: true
  });
  assert.deepEqual(result.deck.pages[0].shapes[1].source, { componentQualityIgnore: true });
  assert.deepEqual(result.deck.pages[0].textBoxes[0].source.evidenceBox, { x: 12, y: 14, w: 40, h: 10 });
  assert.equal(result.deck.meta.finalLateShapeSourceBudgetCompaction.provider, "worker-final-late-shape-source-budget-compaction-v1");
  assert.equal(JSON.stringify(input), before);
});

test("final worker late text source budget compaction preserves OCR evidence", () => {
  const input = {
    version: "1.0",
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{
        id: "ocr-text",
        text: "Editable",
        box: { x: 12, y: 14, w: 40, h: 10 },
        source: {
          ocrProvider: "team-pinned-ocr",
          confidence: 0.94,
          evidenceBox: { x: 12, y: 14, w: 40, h: 10 },
          detector: "line-text-native-recovery",
          pageImage: "assets/source.png",
          editable: true,
          nativeRebuild: true,
          overlayVisibility: "visible",
          lineTextCropIds: ["crop-1", "crop-2"],
          ocrRecoveredFromLineTextCrop: true,
          ocrRecoveredFromNativeLineTextShape: true,
          ocrRecoveredFromCrop: true,
          splitFromTextBoxId: "source-text",
          semanticNativeStructure: true,
          ocrEvidenceFit: { dx: 1, dy: 2 },
          finalWorstTextScaleFit: { before: 12, after: 13 },
          finalWorstTextBoxNudgeFit: { deltaYPt: 0.5 },
          finalWorstTextInkBoxFit: { adjusted: true },
          finalWorstTextWeightFit: { before: 400, after: 600 },
          finalWorstTextColorFit: { before: "#111111", after: "#222222" }
        }
      }],
      images: [],
      shapes: [{
        id: "shape",
        type: "rect",
        box: { x: 10, y: 10, w: 20, h: 10 },
        style: { fill: "#EEF2FF" },
        source: { detector: "line-text-native-card-row", pageImage: "assets/source.png" }
      }]
    }]
  };
  const before = JSON.stringify(input);

  const result = compactDeckLateTextSourceBudgetProvenance(input);

  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.removedFields, 16);
  assert.deepEqual(result.removedFieldNames, [
    "editable",
    "finalWorstTextBoxNudgeFit",
    "finalWorstTextColorFit",
    "finalWorstTextInkBoxFit",
    "finalWorstTextScaleFit",
    "finalWorstTextWeightFit",
    "lineTextCropIds",
    "nativeRebuild",
    "ocrEvidenceFit",
    "ocrRecoveredFromCrop",
    "ocrRecoveredFromLineTextCrop",
    "ocrRecoveredFromNativeLineTextShape",
    "overlayVisibility",
    "pageImage",
    "semanticNativeStructure",
    "splitFromTextBoxId"
  ]);
  assert.deepEqual(result.deck.pages[0].textBoxes[0].source, {
    ocrProvider: "team-pinned-ocr",
    confidence: 0.94,
    evidenceBox: { x: 12, y: 14, w: 40, h: 10 },
    detector: "line-text-native-recovery"
  });
  assert.equal(result.deck.pages[0].shapes[0].source.pageImage, "assets/source.png");
  assert.equal(result.deck.meta.finalLateTextSourceBudgetCompaction.provider, "worker-final-late-text-source-budget-compaction-v1");
  assert.equal(JSON.stringify(input), before);
});

test("final worker source vertical line fit tightens long-axis lines to source runs", () => {
  const width = 100; const height = 100;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 25; y < 75; y += 1) for (let x = 61; x <= 62; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 108; rgba[offset + 1] = 190; rgba[offset + 2] = 151; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const line = {
    id: "vertical-line",
    type: "line",
    box: { x: 58, y: 20, w: 0, h: 65 },
    style: { stroke: "#6CBE97", strokeWidthPt: 0.9, connectorType: "straight" },
    source: { detector: "long-axis-line" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [line] }] };

  const result = fitDeckSourceVerticalLines(deck, { pageImages: [image], candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, { x: 62, y: 25, w: 0, h: 50 });
  assert.equal(result.deck.pages[0].shapes[0].source.finalSourceVerticalLineFit.provider, "worker-final-source-vertical-line-fit-v1");
  assert.deepEqual(deck.pages[0].shapes[0].box, line.box);
});

test("final worker source line fit tightens horizontal long-axis lines to source runs", () => {
  const width = 100; const height = 100;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 62; y <= 63; y += 1) for (let x = 25; x < 75; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 108; rgba[offset + 1] = 190; rgba[offset + 2] = 151; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const line = {
    id: "horizontal-line",
    type: "line",
    box: { x: 20, y: 58, w: 65, h: 0 },
    style: { stroke: "#6CBE97", strokeWidthPt: 0.9, connectorType: "straight" },
    source: { detector: "long-axis-line" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [line] }] };

  const result = fitDeckSourceVerticalLines(deck, { pageImages: [image], candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, { x: 25, y: 62, w: 50, h: 0 });
  assert.equal(result.deck.pages[0].shapes[0].source.finalSourceVerticalLineFit.provider, "worker-final-source-vertical-line-fit-v1");
  assert.deepEqual(deck.pages[0].shapes[0].box, line.box);
});

test("final worker source line fit tightens card side accent lines to source runs", () => {
  const width = 100; const height = 100;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 25; y < 75; y += 1) for (let x = 61; x <= 63; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 242; rgba[offset + 1] = 246; rgba[offset + 2] = 254; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const line = {
    id: "card-accent",
    type: "line",
    box: { x: 58, y: 20, w: 0, h: 65 },
    style: { stroke: "#F2F6FE", strokeWidthPt: 2.4, connectorType: "straight", lineCap: "round" },
    source: { detector: "line-text-native-card-side-accent", sourceCardId: "card", side: "left" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [line] }] };

  const result = fitDeckSourceVerticalLines(deck, { pageImages: [image], candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.deepEqual(result.deck.pages[0].shapes[0].box, { x: 62, y: 25, w: 0, h: 50 });
  assert.equal(result.deck.pages[0].shapes[0].source.finalSourceVerticalLineFit.provider, "worker-final-source-vertical-line-fit-v1");
});

test("final worker low contrast footer mark fit softens only neutral footer marks", () => {
  const footer = {
    id: "footer-mark",
    type: "ellipse",
    box: { x: 10, y: 90, w: 20, h: 8 },
    style: { fill: "#BDB9B6", stroke: "none", opacity: 1 },
    source: { detector: "low-contrast-footer-native-mark" }
  };
  const saturated = {
    id: "saturated-mark",
    type: "ellipse",
    box: { x: 40, y: 90, w: 20, h: 8 },
    style: { fill: "#0E9C9C", stroke: "none", opacity: 1 },
    source: { detector: "low-contrast-footer-native-mark" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [footer, saturated] }] };

  const result = fitDeckLowContrastFooterMarks(deck, { candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.equal(result.deck.pages[0].shapes[0].style.opacity, 0.5);
  assert.equal(result.deck.pages[0].shapes[1].style.opacity, 1);
  assert.equal(result.deck.pages[0].shapes[0].source.finalLowContrastFooterMarkFit.provider, "worker-final-low-contrast-footer-mark-fit-v1");
  assert.equal(deck.pages[0].shapes[0].style.opacity, 1);
});

test("final worker low contrast footer mark fit samples native fill from source pixels", () => {
  const width = 100; const height = 100;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 88; y < 96; y += 1) for (let x = 10; x < 30; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 200; rgba[offset + 1] = 194; rgba[offset + 2] = 189; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const footer = {
    id: "footer-mark",
    type: "roundRect",
    box: { x: 10, y: 88, w: 20, h: 8 },
    style: { fill: "#BDB9B6", stroke: "none", opacity: 1 },
    source: { detector: "low-contrast-footer-native-mark" }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [], images: [], shapes: [footer] }] };

  const result = fitDeckLowContrastFooterMarks(deck, { pageImages: [image], candidateLimit: 1 });

  assert.equal(result.changedShapes, 1);
  assert.equal(result.candidateShapes, 1);
  assert.equal(result.deck.pages[0].shapes[0].style.fill, "#C8C2BD");
  assert.equal(result.deck.pages[0].shapes[0].style.opacity, 1);
  assert.equal(deck.pages[0].shapes[0].style.fill, "#BDB9B6");
});

test("final worker low contrast footer primitives add native shapes without retaining source crops", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "footer-primitives-"));
  const assets = path.join(root, "assets");
  fs.mkdirSync(assets, { recursive: true });
  const sourceFile = path.join(assets, "source.png");
  const width = 120; const height = 120;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 108; y < 116; y += 1) for (let x = 50; x < 82; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 170; rgba[offset + 1] = 168; rgba[offset + 2] = 166; rgba[offset + 3] = 255;
  }
  writePng(sourceFile, { width, height, rgba });
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 120, heightPt: 120 },
    pages: [{
      pageIndex: 0,
      textBoxes: [],
      images: [],
      shapes: [{
        id: "footer-mark",
        type: "roundRect",
        box: { x: 48, y: 108, w: 20, h: 8 },
        style: { fill: "#AAA8A6", stroke: "none", strokeWidthPt: 0, opacity: 1 },
        source: { detector: "low-contrast-footer-native-mark", editable: true }
      }]
    }]
  };

  const result = fitDeckLowContrastFooterPrimitives(deck, { root, sourceImages: [sourceFile] });

  assert.equal(result.candidatePages, 1);
  assert.ok(result.addedShapes > 0);
  assert.equal(result.deck.pages[0].images.length, 0);
  assert.ok(result.deck.pages[0].shapes.some((shape) => shape.source.detector === "native-residual-primitive-rect"));
  assert.equal(result.deck.meta.finalLowContrastFooterPrimitives.provider, "worker-final-low-contrast-footer-primitives-v1");
  fs.rmSync(root, { recursive: true, force: true });
});

test("final worker worst text color fit samples dark source ink on light backgrounds", () => {
  const width = 100; const height = 60;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 22; y < 30; y += 1) for (let x = 26; x < 68; x += 1) {
    if ((x - 26) % 7 > 3) continue;
    const offset = (y * width + x) * 4;
    rgba[offset] = 32; rgba[offset + 1] = 38; rgba[offset + 2] = 55; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const wrongColor = {
    id: "wrong-color",
    text: "开沿 AI 员工",
    box: { x: 25, y: 20, w: 45, h: 12 },
    font: { sizePt: 8, family: "Microsoft YaHei", color: "#FFFFFF" },
    source: { editable: true, evidenceBox: { x: 25, y: 20, w: 45, h: 12 } }
  };
  const lowPriority = {
    id: "low-priority",
    text: "其他文本",
    box: { x: 25, y: 40, w: 45, h: 12 },
    font: { sizePt: 8, family: "Microsoft YaHei", color: "#FFFFFF" },
    source: { editable: true, evidenceBox: { x: 25, y: 40, w: 45, h: 12 } }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 60 }, pages: [{ pageIndex: 0, textBoxes: [lowPriority, wrongColor], images: [], shapes: [] }] };
  const priorityIds = new Map([["0:wrong-color", 0], ["0:low-priority", 1]]);

  const result = fitDeckWorstTextColors(deck, { pageImages: [image], priorityIds, candidateLimit: 1 });

  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.candidateTextBoxes, 1);
  assert.equal(result.deck.pages[0].textBoxes[0].font.color, "#FFFFFF");
  assert.equal(result.deck.pages[0].textBoxes[1].font.color.toLowerCase(), "#202637");
  assert.equal(result.deck.pages[0].textBoxes[1].source.finalWorstTextColorFit.provider, "worker-final-worst-text-color-fit-v1");
  assert.equal(deck.pages[0].textBoxes[1].font.color, "#FFFFFF");
});

test("final worker worst text color fit preserves light source ink on saturated backgrounds", () => {
  const width = 100; const height = 60;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 12; y < 42; y += 1) for (let x = 12; x < 88; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 45; rgba[offset + 1] = 85; rgba[offset + 2] = 225; rgba[offset + 3] = 255;
  }
  for (let y = 22; y < 30; y += 1) for (let x = 28; x < 72; x += 1) {
    if ((x - 28) % 6 > 3) continue;
    const offset = (y * width + x) * 4;
    rgba[offset] = 255; rgba[offset + 1] = 255; rgba[offset + 2] = 255; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const textBox = {
    id: "light-ink",
    text: "通用聊天 AI",
    box: { x: 24, y: 20, w: 52, h: 12 },
    font: { sizePt: 8, family: "Microsoft YaHei", color: "#2D55E1" },
    source: { editable: true, evidenceBox: { x: 24, y: 20, w: 52, h: 12 } }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 60 }, pages: [{ pageIndex: 0, textBoxes: [textBox], images: [], shapes: [] }] };
  const priorityIds = new Map([["0:light-ink", 0]]);

  const result = fitDeckWorstTextColors(deck, { pageImages: [image], priorityIds, candidateLimit: 1 });

  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.candidateTextBoxes, 1);
  assert.equal(result.deck.pages[0].textBoxes[0].font.color.toLowerCase(), "#ffffff");
});

test("final worker worst text arrow glyph fit promotes prioritized arrows to native connectors", () => {
  const arrow = {
    id: "arrow-text",
    text: "→",
    box: { x: 20, y: 12, w: 12, h: 8 },
    font: { family: "Microsoft YaHei", sizePt: 7, color: "#3E63E3" },
    style: { wrap: false },
    source: { ocrProvider: "team-pinned-ocr", confidence: 0.98, evidenceBox: { x: 20, y: 12, w: 12, h: 8 } }
  };
  const other = { ...arrow, id: "other-arrow", box: { x: 50, y: 12, w: 12, h: 8 } };
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 100, heightPt: 50 },
    pages: [{ pageIndex: 0, textBoxes: [arrow, other], images: [], shapes: [] }]
  };
  const priorityIds = new Map([["0:arrow-text", 0]]);

  const result = fitDeckWorstTextArrowGlyphs(deck, { priorityIds });

  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.candidateTextBoxes, 1);
  assert.equal(result.deck.pages[0].textBoxes[0].style.visibility, "hidden");
  assert.equal(result.deck.pages[0].textBoxes[0].source.componentQualityIgnore, true);
  assert.equal(result.deck.pages[0].textBoxes[1].style.visibility, undefined);
  assert.equal(result.deck.pages[0].shapes.length, 1);
  assert.equal(result.deck.pages[0].shapes[0].type, "line");
  assert.equal(result.deck.pages[0].shapes[0].style.endArrow, "triangle");
  assert.equal(result.deck.pages[0].shapes[0].source.detector, "ocr-arrow-glyph-native-connector");
});

test("final worker worst text arrow glyph with text fidelity accepts native connector plus primitive repair", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arrow-text-fidelity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const width = 80; const height = 60;
  const slideSize = { widthPt: 960, heightPt: 720 };
  const sx = slideSize.widthPt / width;
  const sy = slideSize.heightPt / height;
  const sourceRgba = Buffer.alloc(width * height * 4, 255);
  const renderedRgba = Buffer.alloc(width * height * 4, 255);
  for (let x = 12; x < 16; x += 1) {
    const offset = (10 * width + x) * 4;
    sourceRgba[offset] = 62; sourceRgba[offset + 1] = 99; sourceRgba[offset + 2] = 227; sourceRgba[offset + 3] = 255;
  }
  const sourceFile = path.join(root, "source.png");
  const renderedFile = path.join(root, "rendered.png");
  writePng(sourceFile, { width, height, rgba: sourceRgba });
  writePng(renderedFile, { width, height, rgba: renderedRgba });
  const arrow = {
    id: "arrow-text",
    text: "→",
    box: { x: 10 * sx, y: 8 * sy, w: 10 * sx, h: 6 * sy },
    font: { family: "Microsoft YaHei", sizePt: 7, color: "#3E63E3" },
    style: { wrap: false },
    source: { ocrProvider: "team-pinned-ocr", confidence: 0.98, evidenceBox: { x: 10 * sx, y: 8 * sy, w: 10 * sx, h: 6 * sy } }
  };
  const deck = { version: "1.0", slideSize, pages: [{ pageIndex: 0, textBoxes: [arrow], images: [], shapes: [] }] };
  const visualQuality = {
    checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    componentWorst: [{ pageIndex: 0, id: "arrow-text", kind: "text", role: "text", attention: true, severity: 1 }],
    metrics: {
      "pixel-diff-ratio": 0.15,
      "foreground-missing-ratio": 0.09,
      "mean-absolute-delta": 12,
      "component-regions-attention": 1,
      "worst-component-normalized-severity": 1
    }
  };
  let buildCount = 0;
  const result = await tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate({
    root,
    metadata: { generatedDeck: deck },
    sourceImages: [sourceFile],
    visualQuality,
    isCancellationRequested: async () => false,
    runBuild: async ({ pptxFile }) => { buildCount += 1; fs.writeFileSync(pptxFile, `pptx-${buildCount}`); },
    rawImageQualityVerifier: async ({ deck: candidateDeck, collectRenderedPages }) => {
      if (collectRenderedPages) collectRenderedPages([renderedFile]);
      const accepted = candidateDeck.meta?.finalTextFidelityPrimitiveFit?.addedShapes > 0;
      return {
        passed: accepted,
        checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: accepted }],
        metrics: accepted
          ? { "pixel-diff-ratio": 0.149, "foreground-missing-ratio": 0.088, "mean-absolute-delta": 12.00005, "component-regions-attention": 0, "worst-component-normalized-severity": 1 }
          : visualQuality.metrics
      };
    }
  });

  assert.equal(result.accepted, true);
  assert.equal(result.changedTextBoxes, 1);
  assert.ok(result.addedShapes > 0);
  assert.equal(result.deck.pages[0].textBoxes[0].style.visibility, "hidden");
  assert.ok(result.deck.pages[0].shapes.some((shape) => shape.source.detector === "ocr-arrow-glyph-native-connector"));
  assert.ok(result.deck.pages[0].shapes.some((shape) => shape.source.detector === "text-fidelity-native-primitive"));
});

test("final worker worst text scale fit only changes prioritized text boxes", () => {
  const first = {
    id: "first",
    text: "短文本",
    box: { x: 10, y: 10, w: 30, h: 10 },
    font: { sizePt: 8, family: "Microsoft YaHei" },
    source: { editable: true }
  };
  const second = {
    id: "second",
    text: "这是一段较长文本",
    box: { x: 10, y: 30, w: 80, h: 12 },
    font: { sizePt: 9, family: "Microsoft YaHei" },
    source: { editable: true }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [first, second], images: [], shapes: [] }] };
  const priorityIds = new Map([["0:second", 0], ["0:first", 1]]);

  const result = fitDeckWorstTextScale(deck, { priorityIds, candidateLimit: 1 });

  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.candidateTextBoxes, 2);
  assert.equal(result.deck.pages[0].textBoxes[0].font.sizePt, 8);
  assert.equal(result.deck.pages[0].textBoxes[1].font.sizePt, 9 * 1.04);
  assert.equal(result.deck.pages[0].textBoxes[1].source.finalWorstTextScaleFit.provider, "worker-final-worst-text-scale-fit-v1");
  assert.equal(deck.pages[0].textBoxes[1].font.sizePt, 9);
});

test("final worker worst text scale fit can shrink oversized prioritized text", () => {
  const textBox = {
    id: "oversized",
    text: "业务系统数据",
    box: { x: 10, y: 10, w: 60, h: 14 },
    font: { sizePt: 12, family: "Microsoft YaHei" },
    source: { editable: true }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [textBox], images: [], shapes: [] }] };
  const priorityIds = new Map([["0:oversized", 0]]);

  const result = fitDeckWorstTextScale(deck, { priorityIds, candidateLimit: 1, targetScale: 0.96 });

  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.candidateTextBoxes, 1);
  assert.equal(result.deck.pages[0].textBoxes[0].font.sizePt, 12 * 0.96);
  assert.equal(result.deck.pages[0].textBoxes[0].source.finalWorstTextScaleFit.provider, "worker-final-worst-text-scale-fit-v1");
  assert.equal(result.deck.pages[0].textBoxes[0].source.finalWorstTextScaleFit.scale, 0.96);
  assert.equal(deck.pages[0].textBoxes[0].font.sizePt, 12);
});

test("final worker worst text scale fit includes high-confidence title sized text", () => {
  const title = {
    id: "title",
    text: "动态本体：知识图谱的可生长升级",
    box: { x: 20, y: 10, w: 260, h: 34 },
    font: { sizePt: 42, family: "Microsoft YaHei", weight: "bold" },
    source: { editable: true }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 320, heightPt: 180 }, pages: [{ pageIndex: 0, textBoxes: [title], images: [], shapes: [] }] };
  const priorityIds = new Map([["0:title", 0]]);

  const result = fitDeckWorstTextScale(deck, { priorityIds, candidateLimit: 1, targetScale: 0.96 });

  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.candidateTextBoxes, 1);
  assert.equal(result.deck.pages[0].textBoxes[0].font.sizePt, 42 * 0.96);
  assert.equal(result.deck.pages[0].textBoxes[0].source.finalWorstTextScaleFit.provider, "worker-final-worst-text-scale-fit-v1");
  assert.equal(deck.pages[0].textBoxes[0].font.sizePt, 42);
});

test("final worker rich OCR text layout syncs parent and run font sizes", () => {
  const rich = {
    id: "rich",
    text: "企业知识中枢AI员工",
    box: { x: 20, y: 16, w: 120, h: 12 },
    font: { sizePt: 8, color: "#111111" },
    runs: [
      { text: "企业知识中枢", font: { sizePt: 8, color: "#78808C" } },
      { text: "AI员工", font: { sizePt: 8, color: "#5278E6" } }
    ],
    style: { wrap: true },
    source: { ocrProvider: "team-pinned-ocr", confidence: 0.98, mixedColorTextRuns: 2 }
  };
  const other = {
    id: "other",
    text: "普通文本",
    box: { x: 10, y: 40, w: 60, h: 12 },
    font: { sizePt: 8, color: "#111111" },
    source: { ocrProvider: "team-pinned-ocr", confidence: 0.98 }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 180, heightPt: 80 }, pages: [{ pageIndex: 0, textBoxes: [other, rich], images: [], shapes: [] }] };
  const priorityIds = new Map([["0:rich", 0], ["0:other", 1]]);

  const result = fitDeckWorstRichOcrTextLayout(deck, { priorityIds, candidateLimit: 1, targetScale: 1.08, heightScale: 1.12, deltaYPt: -0.25 });
  const changed = result.deck.pages[0].textBoxes[1];

  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.candidateTextBoxes, 1);
  assert.equal(result.deck.pages[0].textBoxes[0].font.sizePt, 8);
  assert.equal(changed.font.sizePt, 8.64);
  assert.deepEqual(changed.runs.map((run) => run.font.sizePt), [8.64, 8.64]);
  assert.equal(changed.style.wrap, false);
  assert.equal(changed.style.fit, "shrink");
  assert.equal(changed.source.finalWorstRichOcrTextLayoutFit.provider, "worker-final-worst-rich-ocr-text-layout-fit-v1");
  assert.equal(deck.pages[0].textBoxes[1].font.sizePt, 8);
});

test("final worker rich OCR text layout reaches positioned OCR segments", () => {
  const segment = {
    id: "p0-ocr-002-seg-3",
    text: "AI员工",
    box: { x: 20, y: 16, w: 34, h: 12 },
    font: { sizePt: 8, color: "#5278E6" },
    style: { wrap: true },
    source: {
      ocrProvider: "team-pinned-ocr",
      confidence: 0.98,
      evidenceBox: { x: 20, y: 16, w: 34, h: 12 },
      mixedColorTextSegments: 4,
      segmentedOcrLineId: "p0-ocr-002",
      segmentStartIndex: 8,
      segmentEndIndex: 12,
      sourceInkPixelBox: { x: 20, y: 16, w: 34, h: 12 }
    }
  };
  const other = {
    id: "other",
    text: "普通文本",
    box: { x: 10, y: 40, w: 60, h: 12 },
    font: { sizePt: 8, color: "#111111" },
    source: { ocrProvider: "team-pinned-ocr", confidence: 0.98 }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 180, heightPt: 80 }, pages: [{ pageIndex: 0, textBoxes: [other, segment], images: [], shapes: [] }] };
  const priorityIds = new Map([["0:p0-ocr-002-seg-3", 0], ["0:other", 1]]);

  const result = fitDeckWorstRichOcrTextLayout(deck, { priorityIds, candidateLimit: 1, targetScale: 1.24, heightScale: 1.48, deltaYPt: 0.25 });
  const changed = result.deck.pages[0].textBoxes[1];

  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.candidateTextBoxes, 1);
  assert.equal(result.deck.pages[0].textBoxes[0].font.sizePt, 8);
  assert.equal(changed.font.sizePt, 9.92);
  assert.equal(changed.box.h, 12 * 1.1);
  assert.equal(changed.runs, undefined);
  assert.equal(changed.style.wrap, false);
  assert.equal(changed.style.fit, "shrink");
  assert.equal(changed.source.finalWorstRichOcrTextLayoutFit.provider, "worker-final-worst-rich-ocr-text-layout-fit-v1");
  assert.equal(deck.pages[0].textBoxes[1].font.sizePt, 8);
});

test("final worker rich OCR text layout skips unsafe rich text", () => {
  const base = {
    id: "rich",
    text: "企业知识中枢AI员工",
    box: { x: 20, y: 16, w: 120, h: 12 },
    font: { sizePt: 8, color: "#111111" },
    runs: [{ text: "企业知识中枢", font: { sizePt: 8, color: "#78808C" } }, { text: "AI", font: { sizePt: 8, color: "#5278E6" } }],
    source: { ocrProvider: "team-pinned-ocr", confidence: 0.98, mixedColorTextRuns: 2 }
  };
  for (const patch of [
    { source: { ocrProvider: "team-pinned-ocr", confidence: 0.4, mixedColorTextRuns: 2 } },
    { style: { visibility: "hidden" } },
    { text: "企业知识中枢\nAI员工" }
  ]) {
    const textBox = { ...base, ...patch, source: patch.source || base.source };
    const deck = { version: "1.0", slideSize: { widthPt: 180, heightPt: 80 }, pages: [{ pageIndex: 0, textBoxes: [textBox], images: [], shapes: [] }] };
    const result = fitDeckWorstRichOcrTextLayout(deck, { priorityIds: new Map([["0:rich", 0]]), candidateLimit: 1, targetScale: 1.08 });
    assert.equal(result.changedTextBoxes, 0);
  }
});

test("final worker worst text box nudge moves only prioritized text baselines", () => {
  const first = {
    id: "first",
    text: "普通文本",
    box: { x: 10, y: 10, w: 60, h: 12 },
    font: { sizePt: 8, family: "Microsoft YaHei" },
    style: { wrap: true },
    source: { editable: true }
  };
  const worst = {
    id: "worst",
    text: "最差文本",
    box: { x: 80, y: 20, w: 64, h: 12 },
    font: { sizePt: 10, family: "Microsoft YaHei" },
    style: { wrap: true },
    source: { editable: true }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 200, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [first, worst], images: [], shapes: [] }] };
  const priorityIds = new Map([["0:worst", 0]]);

  const result = fitDeckWorstTextBoxNudge(deck, { priorityIds, candidateLimit: 1, deltaYPt: 0.5 });

  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.candidateTextBoxes, 1);
  assert.equal(result.deck.pages[0].textBoxes[0].box.y, 10);
  assert.equal(result.deck.pages[0].textBoxes[1].box.y, 20.5);
  assert.equal(result.deck.pages[0].textBoxes[1].style.wrap, false);
  assert.equal(result.deck.pages[0].textBoxes[1].source.finalWorstTextBoxNudgeFit.provider, "worker-final-worst-text-box-nudge-fit-v1");
  assert.equal(deck.pages[0].textBoxes[1].box.y, 20);
});

test("final worker worst text box nudge candidates include micro offsets", () => {
  assert.deepEqual(worstTextBoxNudgeCandidates().slice(0, 4), [0.2, -0.2, 0.35, -0.35]);
});

test("final worker worst text weight fit only bolds prioritized regular text", () => {
  const first = {
    id: "first",
    text: "短文本",
    box: { x: 10, y: 10, w: 30, h: 10 },
    font: { sizePt: 8, family: "Microsoft YaHei", weight: "regular" },
    source: { editable: true }
  };
  const second = {
    id: "second",
    text: "已经是粗体",
    box: { x: 10, y: 30, w: 80, h: 12 },
    font: { sizePt: 9, family: "Microsoft YaHei", weight: "bold" },
    source: { editable: true }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [first, second], images: [], shapes: [] }] };
  const priorityIds = new Map([["0:first", 0], ["0:second", 1]]);

  const result = fitDeckWorstTextWeight(deck, { priorityIds, candidateLimit: 1 });

  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.candidateTextBoxes, 1);
  assert.equal(result.deck.pages[0].textBoxes[0].font.weight, "bold");
  assert.equal(result.deck.pages[0].textBoxes[0].source.finalWorstTextWeightFit.provider, "worker-final-worst-text-weight-fit-v1");
  assert.equal(result.deck.pages[0].textBoxes[1].font.weight, "bold");
  assert.equal(deck.pages[0].textBoxes[0].font.weight, "regular");
});

test("final worker worst text weight fit can regularize prioritized bold text", () => {
  const first = {
    id: "first",
    text: "过粗文本",
    box: { x: 10, y: 10, w: 80, h: 12 },
    font: { sizePt: 9, family: "Microsoft YaHei", weight: "bold" },
    source: { editable: true }
  };
  const second = {
    id: "second",
    text: "普通文本",
    box: { x: 10, y: 30, w: 80, h: 12 },
    font: { sizePt: 9, family: "Microsoft YaHei", weight: "regular" },
    source: { editable: true }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [first, second], images: [], shapes: [] }] };
  const priorityIds = new Map([["0:first", 0], ["0:second", 1]]);

  const result = fitDeckWorstTextWeight(deck, { priorityIds, candidateLimit: 1, targetWeight: "regular" });

  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.candidateTextBoxes, 1);
  assert.equal(result.deck.pages[0].textBoxes[0].font.weight, "regular");
  assert.equal(result.deck.pages[0].textBoxes[1].font.weight, "regular");
  assert.equal(result.deck.pages[0].textBoxes[0].source.finalWorstTextWeightFit.weight, "regular");
  assert.equal(deck.pages[0].textBoxes[0].font.weight, "bold");
});

test("final worker text weight fitting includes large editable headings and respects visibility", () => {
  const textBoxes = [34, 72, 73, NaN, 4].map((sizePt, index) => ({
    id: `heading-${index}`, text: "Heading", font: { sizePt, weight: "bold" }, source: { editable: true }
  }));
  textBoxes.push({ id: "hidden", text: "Hidden", font: { sizePt: 36, weight: "bold" }, style: { visibility: "hidden" } });
  textBoxes.push({ id: "locked", text: "Locked", font: { sizePt: 36, weight: "bold" }, source: { editable: false } });
  textBoxes.push({ id: "transparent", text: "Transparent", font: { sizePt: 36, weight: "bold", opacity: 0 } });
  const priorityIds = new Map(textBoxes.map((item, index) => [`0:${item.id}`, index]));
  const deck = { pages: [{ textBoxes }] };
  const fitted = fitDeckWorstTextWeight(deck, { priorityIds, targetWeight: "regular" });
  assert.equal(fitted.changedTextBoxes, 2);
  assert.deepEqual(fitted.deck.pages[0].textBoxes.map((item) => item.font.weight), ["regular", "regular", "bold", "bold", "bold", "bold", "bold", "bold"]);
  assert.equal(deck.pages[0].textBoxes[0].font.weight, "bold");
});

test("final worker worst text ink box fit preserves OCR evidence bounds for prioritized text", () => {
  const width = 100; const height = 100;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 42; y < 50; y += 1) for (let x = 35; x < 58; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 0; rgba[offset + 1] = 0; rgba[offset + 2] = 0; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const first = {
    id: "first",
    text: "aligned",
    box: { x: 20, y: 35, w: 55, h: 24 },
    font: { sizePt: 10, color: "#000000" },
    style: { wrap: false },
    source: { evidenceBox: { x: 20, y: 35, w: 55, h: 24 } }
  };
  const second = {
    id: "second",
    text: "ignored",
    box: { x: 10, y: 10, w: 30, h: 12 },
    font: { sizePt: 10, color: "#000000" },
    source: { evidenceBox: { x: 10, y: 10, w: 30, h: 12 } }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [first, second], images: [], shapes: [] }] };
  const priorityIds = new Map([["0:first", 0]]);

  const result = fitDeckWorstTextInkBoxes(deck, { pageImages: [image], priorityIds, candidateLimit: 1 });

  assert.equal(result.changedTextBoxes, 0);
  assert.equal(result.candidateTextBoxes, 0);
  assert.deepEqual(result.deck.pages[0].textBoxes[0].box, first.box);
  assert.equal(result.deck.pages[0].textBoxes[0].source.finalWorstTextInkBoxFit, undefined);
  assert.deepEqual(result.deck.pages[0].textBoxes[1].box, second.box);
  assert.deepEqual(deck.pages[0].textBoxes[0].box, first.box);
});

test("final worker worst text ink box can tighten rich OCR runs to source ink", () => {
  const width = 160; const height = 60;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 24; y < 32; y += 1) {
    for (let x = 42; x < 74; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 120; rgba[offset + 1] = 128; rgba[offset + 2] = 140; rgba[offset + 3] = 255;
    }
    for (let x = 82; x < 118; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 82; rgba[offset + 1] = 120; rgba[offset + 2] = 230; rgba[offset + 3] = 255;
    }
  }
  const image = { width, height, rgba };
  const textBox = {
    id: "rich-ocr",
    text: "企业知识中枢AI员工",
    box: { x: 20, y: 16, w: 120, h: 26 },
    font: { sizePt: 9, color: "#445577" },
    runs: [
      { text: "企业知识中枢", font: { color: "#78808C" } },
      { text: "AI员工", font: { color: "#5278E6" } }
    ],
    source: { evidenceBox: { x: 20, y: 16, w: 120, h: 26 }, mixedColorTextRuns: 2 }
  };
  const deck = { version: "1.0", slideSize: { widthPt: 160, heightPt: 60 }, pages: [{ pageIndex: 0, textBoxes: [textBox], images: [], shapes: [] }] };
  const priorityIds = new Map([["0:rich-ocr", 0]]);

  const result = fitDeckWorstTextInkBoxes(deck, { pageImages: [image], priorityIds, candidateLimit: 1 });

  assert.equal(result.changedTextBoxes, 1);
  assert.ok(result.deck.pages[0].textBoxes[0].box.x > 38);
  assert.ok(result.deck.pages[0].textBoxes[0].box.w < 82);
  assert.equal(result.deck.pages[0].textBoxes[0].source.finalWorstTextInkBoxFit.provider, "worker-final-worst-text-ink-box-fit-v1");
  assert.deepEqual(deck.pages[0].textBoxes[0].box, textBox.box);
});

test("final worker worst text ink box can tighten non-OCR text using source-colored ink", () => {
  const width = 100; const height = 100;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 42; y < 50; y += 1) for (let x = 35; x < 58; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 0; rgba[offset + 1] = 0; rgba[offset + 2] = 0; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const first = {
    id: "first",
    text: "aligned",
    box: { x: 20, y: 35, w: 55, h: 24 },
    font: { sizePt: 10, color: "#000000" },
    style: { wrap: false },
    source: {}
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [first], images: [], shapes: [] }] };
  const priorityIds = new Map([["0:first", 0]]);

  const result = fitDeckWorstTextInkBoxes(deck, { pageImages: [image], priorityIds, candidateLimit: 1 });

  assert.equal(result.changedTextBoxes, 1);
  assert.ok(result.deck.pages[0].textBoxes[0].box.x > 30);
  assert.ok(result.deck.pages[0].textBoxes[0].box.w < 30);
  assert.equal(result.deck.pages[0].textBoxes[0].source.finalWorstTextInkBoxFit.provider, "worker-final-worst-text-ink-box-fit-v1");
});

test("final worker worst text composite fit combines ink box, scale, and nudge for prioritized text", () => {
  const width = 100; const height = 100;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 42; y < 50; y += 1) for (let x = 35; x < 58; x += 1) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 0; rgba[offset + 1] = 0; rgba[offset + 2] = 0; rgba[offset + 3] = 255;
  }
  const image = { width, height, rgba };
  const first = {
    id: "first",
    text: "ignored",
    box: { x: 8, y: 8, w: 30, h: 12 },
    font: { sizePt: 10, color: "#000000" },
    source: {}
  };
  const worst = {
    id: "worst",
    text: "aligned",
    box: { x: 20, y: 35, w: 55, h: 24 },
    font: { sizePt: 10, color: "#000000" },
    style: { wrap: true },
    source: {}
  };
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, textBoxes: [first, worst], images: [], shapes: [] }] };
  const priorityIds = new Map([["0:worst", 0], ["0:first", 1]]);

  const result = fitDeckWorstTextComposite(deck, { pageImages: [image], priorityIds, candidateLimit: 1, targetScale: 0.96, deltaYPt: -0.5 });

  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.candidateTextBoxes, 2);
  assert.deepEqual(result.deck.pages[0].textBoxes[0].box, first.box);
  assert.ok(result.deck.pages[0].textBoxes[1].box.x > 30);
  assert.ok(result.deck.pages[0].textBoxes[1].box.y < 42);
  assert.ok(result.deck.pages[0].textBoxes[1].box.w < 30);
  assert.equal(result.deck.pages[0].textBoxes[1].font.sizePt, 9.6);
  assert.equal(result.deck.pages[0].textBoxes[1].style.wrap, false);
  assert.equal(result.deck.pages[0].textBoxes[1].source.finalWorstTextCompositeFit.provider, "worker-final-worst-text-composite-fit-v1");
  assert.equal(result.deck.pages[0].textBoxes[1].source.finalWorstTextCompositeFit.usedInkBox, true);
  assert.equal(deck.pages[0].textBoxes[1].font.sizePt, 10);
});

test("final worker worst text composite fit skips unchanged prioritized text", () => {
  const image = { width: 60, height: 40, rgba: Buffer.alloc(60 * 40 * 4, 255) };
  const textBox = {
    id: "stable",
    text: "stable",
    box: { x: 10, y: 10, w: 30, h: 12 },
    font: { sizePt: 10, color: "#000000" },
    source: {}
  };
  const deck = { version: "1.0", slideSize: { widthPt: 60, heightPt: 40 }, pages: [{ pageIndex: 0, textBoxes: [textBox], images: [], shapes: [] }] };
  const priorityIds = new Map([["0:stable", 0]]);

  const result = fitDeckWorstTextComposite(deck, { pageImages: [image], priorityIds, targetScale: 1, deltaYPt: 0 });

  assert.equal(result.changedTextBoxes, 0);
  assert.equal(result.candidateTextBoxes, 0);
  assert.deepEqual(result.deck.pages[0].textBoxes[0].box, textBox.box);
});

test("final worker worst text composite candidates include neutral and small scale adjustments", () => {
  assert.deepEqual(worstTextCompositeScaleCandidates(), [1, 0.98, 1.02, 0.96, 1.04]);
});

test("raw image Worker prioritizes worst text scale and weight before light card stroke search", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();
  const composite = source.indexOf("const finalWorstTextCompositeFit =");
  const scale = source.indexOf("const finalWorstTextScaleFit =", composite);
  const weight = source.indexOf("const finalWorstTextWeightFit =", scale);
  const lightCard = source.indexOf("const finalEarlyLightCardStrokeFit =", weight);

  assert.ok(composite > 0);
  assert.ok(scale > composite);
  assert.ok(weight > scale);
  assert.ok(lightCard > weight);
  assert.match(source, /final-worst-text-scale-fit-accepted"\] !== 1[\s\S]+const finalWorstTextScaleFit =/u);
  assert.match(source, /final-worst-text-weight-fit-accepted"\] !== 1[\s\S]+const finalWorstTextWeightFit =/u);
});

test("raw image Worker runs native card geometry before low-yield panel fill fallback", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();
  const saturated = source.indexOf("const finalSaturatedColorPanelFit =");
  const geometry = source.indexOf("const finalLightCardGeometryFit =", saturated);
  const lowSaturation = source.indexOf("const finalLowSaturationPanelFillFit =", geometry);
  const lateGeometry = source.indexOf("const finalLateLightCardGeometryFit =", lowSaturation);

  assert.ok(saturated > 0);
  assert.ok(geometry > saturated);
  assert.ok(lowSaturation > geometry);
  assert.ok(lateGeometry > lowSaturation);
  assert.match(source, /final-light-card-geometry-fit-shapes"\] === undefined[\s\S]+const finalLateLightCardGeometryFit =/u);
});

test("raw image Worker tries focused text size before font family and repeated text ink geometry candidates", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();
  const ocrEvidence = source.indexOf("const finalOcrEvidenceFit =");
  const scale = source.indexOf("const finalWorstTextScaleFit =", ocrEvidence);
  const weight = source.indexOf("const finalWorstTextWeightFit =", scale);
  const fontFamily = source.indexOf("const finalEditableTextFontFamilyFit =", weight);
  const firstInkBox = source.indexOf("const finalWorstTextInkBoxFit =", ocrEvidence);

  assert.ok(ocrEvidence > 0);
  assert.ok(scale > ocrEvidence);
  assert.ok(weight > scale);
  assert.ok(fontFamily > weight);
  assert.ok(firstInkBox > fontFamily);
  assert.match(source, /targetScales: \[0\.94, 0\.96, 1\.04\],[\s\S]+candidateLimits: \[1, 2\]/u);
  assert.match(source, /final-editable-text-font-family-fit-accepted"\] === undefined[\s\S]+const finalEditableTextFontFamilyFit =/u);
});

test("raw image Worker gates final text refinements when top worst component needs native shape repair", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();
  const textCandidateNames = [
    "finalWorstTextCompositeFit",
    "finalWorstTextColorFit",
    "finalWorstTextArrowGlyphFit",
    "finalWorstTextBoxNudgeFit",
    "finalTextFidelityPrimitives",
    "finalLateTextSourceBudgetCompaction",
    "finalLateTextFidelityPrimitives",
    "finalLateArrowTextFidelity"
  ];

  const {shouldTryFinalWorstTextRefinement}=require('../packages/slideclone-worker-adapter/team-worker');
  const quality={passed:false,checks:[{name:'quality-rendered',passed:true}],componentWorst:[{kind:'shape',role:'container-border'}]};
  assert.equal(shouldTryFinalWorstTextRefinement(quality),false);
  quality.componentWorst=[{kind:'text',role:'text'}];assert.equal(shouldTryFinalWorstTextRefinement(quality),true);
  quality.checks.push({name:'visual-fidelity',passed:true});assert.equal(shouldTryFinalWorstTextRefinement(quality),false);
  quality.componentWorst[0].attention=true;assert.equal(shouldTryFinalWorstTextRefinement(quality),true);
  assert.match(source, /function shouldTryFinalWorstTextInkBoxRefinement\(visualQuality\) \{\s+return shouldTryFinalWorstTextRefinement\(visualQuality\) \|\| \(shouldTryFinalVisualRefinement\(visualQuality\) && hasAttentionTextWorstComponent\(visualQuality\)\);/u);
  assert.match(source, /function shouldTryFinalEditableTextFontFamilyRefinement\(visualQuality\) \{\s+return shouldTryFinalWorstTextRefinement\(visualQuality\) \|\| \(shouldTryFinalVisualRefinement\(visualQuality\) && hasAttentionTextWorstComponent\(visualQuality\)\);/u);
  assert.match(source, /function shouldTryFinalAttentionTextRefinement\(visualQuality\) \{\s+return shouldTryFinalWorstTextRefinement\(visualQuality\) \|\| \(shouldTryFinalVisualRefinement\(visualQuality\) && hasAttentionTextWorstComponent\(visualQuality\)\);/u);
  assert.match(source, /const finalWorstTextInkBoxFit =[\s\S]{0,500}tryBuildFinalWorstTextInkBoxCandidate/u);
  assert.match(source, /shouldTryFinalWorstTextInkBoxRefinement\(visualQuality\)[\s\S]{0,500}const finalWorstTextInkBoxFit =/u);
  assert.match(source, /shouldTryFinalEditableTextFontFamilyRefinement\(visualQuality\)[\s\S]{0,500}const finalEditableTextFontFamilyFit =/u);
  assert.match(source, /shouldTryFinalAttentionTextRefinement\(visualQuality\)[\s\S]{0,500}const finalWorstTextScaleFit =/u);
  assert.match(source, /shouldTryFinalAttentionTextRefinement\(visualQuality\)[\s\S]{0,500}const finalWorstTextWeightFit =/u);
  for (const name of textCandidateNames) {
    const declaration = source.indexOf(`const ${name} =`);
    assert.notEqual(declaration, -1, `${name} candidate should exist`);
    const guardStart = source.lastIndexOf("if (raw && rawImageQualityVerifier", declaration);
    assert.notEqual(guardStart, -1, `${name} should have a raw-image guard`);
    const guard = source.slice(guardStart, declaration);
    assert.match(guard, /shouldTryFinalWorstTextRefinement\(visualQuality\)/u, `${name} must use the text-specific guard`);
  }
});

test("raw image Worker treats missing native components as native shape repair targets", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();
  assert.match(source, /function topWorstComponentIsMissingNative\(visualQuality\) \{[\s\S]+return String\(worst\?\.kind \|\| ""\) === "missing" && String\(worst\?\.role \|\| ""\) === "missing-native-component";/u);
  assert.match(source, /if \(topWorstComponentIsMissingNative\(visualQuality\)\) return worst\?\.textAdjacent !== true && String\(worst\?\.repairHint \|\| ""\) !== "text";/u);
  const {shouldTryFinalWorstTextRefinement}=require('../packages/slideclone-worker-adapter/team-worker');
  const quality={passed:false,checks:[{name:'quality-rendered',passed:true}],componentWorst:[{kind:'missing',role:'missing-native-component'}]};
  assert.equal(shouldTryFinalWorstTextRefinement(quality),false);
  quality.componentWorst[0].repairHint='text';assert.equal(shouldTryFinalWorstTextRefinement(quality),true);
  assert.match(source, /function blockLateVisualRefinementForLargeRaster\(visualQuality, deck\) \{\s+if \(!qualityRendered\(visualQuality\) \|\| largeRasterEditability\(deck\)\.passed\) return visualQuality;\s+if \(topWorstComponentNeedsNativeShapeRefinement\(visualQuality\)\) return visualQuality;/u);
  assert.match(source, /raw && !adoptedNativeOnlyResidual && !textRefinementExplicitlyRejected && qualityRendered\(visualQuality\)\s+&& !topWorstComponentNeedsNativeShapeRefinement\(visualQuality\)\s+&& \(visualQuality\?\.passed !== true \|\| !largeRasterEditability\(metadata\.generatedDeck\)\.passed\)/u);
  assert.match(source, /topWorstComponentIsMissingNative\(visualQuality\)[\s\S]{0,500}tryBuildFinalMissingNativeVisualAtomCandidate/u);
  assert.match(source, /"final-missing-native-visual-atom-fit-accepted": 0,[\s\S]{0,240}"final-missing-native-visual-atom-fit-shapes": finalMissingNativeVisualAtomFit\.addedShapes \|\| 0/u);
  assert.match(source, /topWorstComponentIsMissingNative\(visualQuality\)[\s\S]{0,220}"final-missing-native-visual-atom-fit-accepted"\] === 0[\s\S]{0,260}"missing-native-late-refinement-blocked": 1/u);
  assert.match(source, /visualQuality\?\.metrics\?\.\["missing-native-late-refinement-blocked"\] !== 1/u);
  assert.match(source, /function shouldTryFinalComponentFidelityPrimitiveRefinement\(visualQuality\) \{[\s\S]+topWorstComponentIsMissingNative\(visualQuality\)[\s\S]+visualQuality\?\.metrics\?\.\["final-missing-native-visual-atom-fit-accepted"\] === 0;/u);
  assert.match(source, /raw && rawImageQualityVerifier && shouldTryFinalComponentFidelityPrimitiveRefinement\(visualQuality\)[\s\S]+const finalWorstComponentFidelityPrimitives =/u);
});

test("Worker residual composition needs only the runtime deck rebuilder and preserves pixels", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "worker-core-residual-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const png = require("../packages/slideclone-core/png");
  const inputFile = path.join(root, "source.png");
  const width = 96; const height = 54;
  const rgba = Buffer.alloc(width * height * 4, 255);
  const black = (x, y) => rgba.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
  black(2, 2);
  for (let y = 20; y < 30; y++) for (let x = 20; x < 40; x++) black(x, y);
  png.writePng(inputFile, { width, height, rgba });
  const original = fs.readFileSync(inputFile);
  let calls = 0;
  const rebuild = createNativeRebuilder({ rawImageOcrProfile: { kind: "umi" } }, {
    loadImplementation: () => ({
      rebuildDeckFromWorkDir(workDir) {
        calls++;
        const ir = JSON.parse(fs.readFileSync(path.join(workDir, "ir/deck.json"), "utf8"));
        ir.pages[0].shapes.push({ id: "card", type: "rect", box: { x: 200, y: 200, w: 200, h: 100 }, source: { editable: true } });
        return ir;
      },
      get eraseMasks() { throw new Error("legacy eraseMasks must not be accessed"); },
      get readPng() { throw new Error("legacy readPng must not be accessed"); }
    })
  });
  const result = await rebuild({ root, metadata: { inputFile, assetPath: "assets/source.png", dimensions: { widthPx: width, heightPx: height } }, ocr: { lines: [] }, isCancellationRequested: async () => false });
  assert.equal(calls, 1);
  assert.equal(result.nativeComponentQuality.passed, true);
  assert.deepEqual(result.deck.meta.residualDeduplication, { candidateObjects: 1, erasedObjects: 1 });
  const residual = png.readPng(path.join(root, "assets/deck-p01-full-residual.png"));
  const expected = Buffer.alloc(width * height * 4, 255);
  expected.fill(0, (2 * width + 2) * 4, (2 * width + 2) * 4 + 3);
  // The native card replaces this footprint. Alpha holes must remain transparent
  // so intersecting native objects cannot repaint foreground into the residual.
  for (let y = 17; y < 33; y++) for (let x = 16; x < 44; x++) expected[(y * width + x) * 4 + 3] = 0;
  assert.deepEqual(residual.rgba, expected);
  assert.deepEqual(fs.readFileSync(inputFile), original);
});

test("Worker rejects rebuild accessors before evaluating them or copying page output", async t => {
  const temporaryRoot=fs.mkdtempSync(path.join(os.tmpdir(),"rebuild-data-boundary-"));
  t.after(()=>fs.rmSync(temporaryRoot,{recursive:true,force:true}));
  const source=fs.readFileSync(path.join(__dirname,"..","skills","pd-hifi-slideclone","examples","ocr-text-smoke.source.png"));
  for(const location of ["result", "page", "sourceImage", "residual", "nativeComponentQuality"]) {
    let getters=0,uploads=0;
    const handler=createImageToEditableArchiveHandler({temporaryRoot,
      rawImageOcr:async()=>({lines:[]}),
      rawImageRebuilder:async({metadata})=>{
        const deck=boundedOcrSourceDeck({metadata,ocr:{lines:[]},sourceImage:metadata.assetPath});
        const result={deck};
        Object.defineProperty(location === "page" ? deck.pages[0] : result, location === "result" ? "deck" : location === "page" ? "shapes" : location,{enumerable:true,get(){getters++;throw new Error("private-sentinel");}});
        return result;
      },
      objectStore:{readObject:async()=>archive([tarEntry("assets/source.png",source)]),putObject:async()=>{uploads++;}}
    });
    await assert.rejects(()=>handler({job:{capability:"image-to-editable",inputObjectKey:"owners/a/input.tar.gz",outputPrefix:"owners/a/jobs/check/"},isCancellationRequested:async()=>false}),/data propert/u);
    assert.equal(getters,0);assert.equal(uploads,0);
    assert.deepEqual(fs.readdirSync(temporaryRoot),[]);
  }
});

test("Worker rejects live OCR accessors before rebuilding or uploading", async t => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-admission-worker-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  let getters = 0;
  const handler = createImageToEditableArchiveHandler({ temporaryRoot,
    rawImageOcr: async () => ({ get lines() { getters++; return []; } }),
    rawImageRebuilder: async () => assert.fail("must not rebuild rejected OCR"),
    objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async () => assert.fail("must not upload rejected OCR") }
  });
  await assert.rejects(() => handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/input.tar.gz", outputPrefix: "owners/a/jobs/check/" }, isCancellationRequested: async () => false }), error => error.code === "IMAGE_OCR_FAILED");
  assert.equal(getters, 0);
  assert.deepEqual(fs.readdirSync(temporaryRoot), []);
});

test("Worker stops invalid normalized page paths before OCR", async t => {
  const temporaryRoot=fs.mkdtempSync(path.join(os.tmpdir(),"normalized-path-worker-"));
  t.after(()=>fs.rmSync(temporaryRoot,{recursive:true,force:true}));
  let ocrCalls=0;
  const pdf=Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
  const handler=createImageToEditableArchiveHandler({temporaryRoot,
    documentNormalizer:async()=>({pages:1,assets:1,sources:[{inputFile:"outside.png",assetPath:"../outside.png",dimensions:{widthPx:960,heightPx:540},pageIndex:0}]}),
    rawImageOcr:async()=>{ocrCalls++;return {lines:[]};},
    rawImageRebuilder:async()=>assert.fail("must not rebuild"),
    objectStore:{readObject:async()=>archive([tarEntry("assets/source.pdf",pdf)]),putObject:async()=>assert.fail("must not upload")}
  });
  await assert.rejects(()=>handler({job:{capability:"image-to-editable",inputObjectKey:"owners/a/input.tar.gz",outputPrefix:"owners/a/jobs/check/"},isCancellationRequested:async()=>false}),error=>error.code === "IMAGE_NORMALIZATION_FAILED");
  assert.equal(ocrCalls,0);assert.deepEqual(fs.readdirSync(temporaryRoot),[]);
});

test("raw image Worker rejects native-only primitive residual before final quality gates", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-final-native-only-residual-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  let nativeOnlyChecks = 0;
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    builderArgs: [builderFile],
    rawImageOcr: async () => ({ lines: [{ text: "Editable text", box: { x: 8, y: 8, w: 100, h: 20 } }] }),
    rawImageRebuilder: async ({ metadata, ocr }) => {
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" });
      rebuilt.pages[0].images.push({ id: "full", type: "fidelity-crop", assetPath: "assets/source.png", box: { x: 0, y: 0, w: 960, h: 540 }, source: { editable: false, residualCrop: true, fullSlideResidual: true, nativeObjectsErased: true } });
      return { deck: rebuilt, metrics: nativeObjectMetrics(rebuilt), residual: { candidateObjects: 1, erasedObjects: 1 } };
    },
    rawImageQualityVerifier: async ({ deck, sourceImage, collectRenderedPages }) => {
      if (typeof collectRenderedPages === "function" && typeof sourceImage === "string") collectRenderedPages([sourceImage]);
      const hasLargeRaster = !largeRasterEditability(deck).passed;
      if (!hasLargeRaster) {
        nativeOnlyChecks += 1;
        return nativeOnlyChecks === 1
          ? { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }], metrics: { "pixel-diff-ratio": 0.18, "foreground-missing-ratio": 0.18, "mean-absolute-delta": 13 } }
          : { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }], metrics: { "pixel-diff-ratio": 0.156, "foreground-missing-ratio": 0.14, "mean-absolute-delta": 13.5 } };
      }
      return { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }], metrics: { "pixel-diff-ratio": 0.15, "foreground-missing-ratio": 0.12, "mean-absolute-delta": 12 } };
    },
    rawImageTextRefiner: async () => ({ accepted: false, changedTextBoxes: 0, skippedPixelBudget: 0 }),
    objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async () => {} }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-final-native-only/" }, isCancellationRequested: async () => false });
    assert.equal(nativeOnlyChecks >= 1, true);
    assert.equal(output.quality.passed, false);
    assert.equal((output.quality.metrics["final-native-only-residual-removed"] || output.quality.metrics["native-only-residual-removed"]), 1);
    assert.equal((output.quality.metrics["final-native-only-residual-policy-rejected"] || output.quality.metrics["native-only-residual-policy-rejected"]), 1);
    assert.equal(output.quality.metrics["final-native-only-residual-semantic-rejected"], undefined);
    assert.equal(output.quality.metrics["final-native-only-residual-component-rejected"], undefined);
    assert.equal(output.quality.metrics["final-native-residual-primitives"] || output.quality.metrics["native-residual-primitives"] || 0, 0);
    assert.equal(output.quality.metrics["large-raster-count"], 1);
    assert.equal(output.quality.checks.find((check) => check.name === "large-raster-editability").passed, false);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("raw image Worker resumes a visual-only shadow without rebuilding or publishing it", async t => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "worker-shadow-resume-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "../skills/pd-hifi-slideclone/examples/ocr-text-smoke.source.png"));
  let nativeVerifications = 0;
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    rawImageOcr: async () => ({ provider: "fixture", lines: [{ text: "Editable", confidence: 1, box: { x: 8, y: 8, w: 100, h: 20 } }] }),
    rawImageRebuilder: async ({ metadata, ocr }) => {
      const deck = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" });
      for (const text of deck.pages[0].textBoxes) { text.style.visibility = "visible"; text.style.opacity = 1; text.font.opacity = 1; }
      deck.pages[0].shapes.push({ id: "card", type: "rect", box: { x: 100, y: 100, w: 100, h: 50 }, source: { editable: true } });
      deck.pages[0].images.push({ id: "full", type: "fidelity-crop", assetPath: "assets/source.png",
        box: { x: 0, y: 0, w: 960, h: 540 }, source: { editable: false, fullSlideResidual: true, residualCrop: true, nativeObjectsErased: true } });
      return { deck, metrics: nativeObjectMetrics(deck), residual: { candidateObjects: 1, erasedObjects: 1 } };
    },
    rawImageQualityVerifier: async ({ deck, sourceImage, collectRenderedPages }) => {
      if (collectRenderedPages && sourceImage) collectRenderedPages([sourceImage]);
      const native = largeRasterEditability(deck).passed;
      if (native) nativeVerifications++;
      return { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
        metrics: { "pixel-diff-ratio": native ? 0.085 : 0.096, "foreground-missing-ratio": native ? 0.03 : 0.05, "mean-absolute-delta": native ? 10 : 12 } };
    },
    objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async () => {} }
  });
  const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/input.tar.gz", outputPrefix: "owners/a/jobs/shadow/" },
    isCancellationRequested: async () => false });
  assert.equal(nativeVerifications, 1);
  assert.equal(output.quality.metrics["native-shadow-resumed"], 1);
  assert.equal(output.quality.passed, false);
  assert.equal(output.quality.metrics["large-raster-count"], 1);
  assert.equal(output.quality.metrics["final-native-only-residual-policy-rejected"], 1);
});

test('raw Worker resolves the full-page raster before typography, retaining strict publication gates',async t=>{
 const temporaryRoot=fs.mkdtempSync(path.join(os.tmpdir(),'native-before-fonts-'));t.after(()=>fs.rmSync(temporaryRoot,{recursive:true,force:true}));
 const builderFile=path.join(temporaryRoot,'builder.cjs');fs.writeFileSync(builderFile,minimalPptxBuilderSource());
 const source=fs.readFileSync(path.join(__dirname,'../skills/pd-hifi-slideclone/examples/ocr-text-smoke.source.png'));
 let nativeVerified=false,fonts=0;
 const handler=createImageToEditableArchiveHandler({temporaryRoot,builderExecutable:process.execPath,builderArgs:[builderFile],
  rawImageOcr:async()=>({lines:[{text:'Editable label',box:{x:8,y:8,w:100,h:20}}]}),
  rawImageRebuilder:async({metadata,ocr})=>{
   const deck=boundedOcrSourceDeck({metadata,ocr,sourceImage:'assets/source.png'});
   deck.pages[0].shapes.push({id:'native-card',type:'rect',box:{x:100,y:100,w:100,h:50},source:{editable:true}});
   deck.pages[0].images.push({id:'full',type:'fidelity-crop',assetPath:'assets/source.png',box:{x:0,y:0,w:960,h:540},source:{editable:false,residualCrop:true,fullSlideResidual:true,nativeObjectsErased:true}});
   deck.pages[0].images.push({id:'local-erased-residual',type:'fidelity-crop',assetPath:'assets/source.png',box:{x:300,y:300,w:10,h:10},source:{editable:false,residualCrop:true,pageImage:'assets/source.png'}});
   return {deck,metrics:nativeObjectMetrics(deck),residual:{candidateObjects:1,erasedObjects:1}};
  },
  rawImageQualityVerifier:async({deck,sourceImage,collectRenderedPages})=>{
   if(collectRenderedPages)collectRenderedPages([sourceImage]);
   const passed=largeRasterEditability(deck).passed;if(passed)nativeVerified=true;
   return {passed,checks:[{name:'quality-rendered',passed:true},{name:'visual-fidelity',passed}],metrics:{'pixel-diff-ratio':passed?.074:.081,'foreground-missing-ratio':.01,'mean-absolute-delta':8}};
  },
  rawImageTextRefiner:async()=>{fonts++;assert.equal(nativeVerified,true,'a blocked page raster must not spend the typography budget');return {accepted:false,changedTextBoxes:0,skippedPixelBudget:0};},
  objectStore:{readObject:async()=>archive([tarEntry('assets/source.png',source)]),putObject:async()=>{}}
 });
 const output=await handler({job:{capability:'image-to-editable',inputObjectKey:'owners/a/input.tar.gz',outputPrefix:'owners/a/jobs/native-first/'},isCancellationRequested:async()=>false});
 assert.equal(nativeVerified,true);assert.equal(fonts,0);assert.equal(output.quality.passed,true);
 assert.equal(output.quality.metrics['large-raster-count'],0);
 assert.equal(output.quality.metrics['semantic-large-raster-lineages'],0);
 assert.equal(output.quality.checks.find(c=>c.name==='residual-native-duplicates-removed').passed,true);
});

test("raw image Worker rejects a failing native-only residual candidate without aborting final quality", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-native-only-residual-quality-reject-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  let candidateVerifications = 0;
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    builderArgs: [builderFile],
    rawImageOcr: async () => ({ lines: [{ text: "Editable text", box: { x: 8, y: 8, w: 100, h: 20 } }] }),
    rawImageRebuilder: async ({ metadata, ocr }) => {
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" });
      rebuilt.pages[0].images.push({ id: "full", type: "fidelity-crop", assetPath: "assets/source.png", box: { x: 0, y: 0, w: 960, h: 540 }, source: { editable: false, residualCrop: true, fullSlideResidual: true, nativeObjectsErased: true } });
      return { deck: rebuilt, metrics: nativeObjectMetrics(rebuilt), residual: { candidateObjects: 1, erasedObjects: 1 } };
    },
    rawImageQualityVerifier: async ({ deck, sourceImage, collectRenderedPages }) => {
      if (typeof collectRenderedPages === "function" && typeof sourceImage === "string") collectRenderedPages([sourceImage]);
      if (largeRasterEditability(deck).passed) {
        candidateVerifications += 1;
        throw new Error("candidate render failed");
      }
      return { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }], metrics: { "pixel-diff-ratio": 0.15, "foreground-missing-ratio": 0.12, "mean-absolute-delta": 12 } };
    },
    rawImageTextRefiner: async () => ({ accepted: false, changedTextBoxes: 0, skippedPixelBudget: 0 }),
    objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async () => {} }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-native-only-reject/" }, isCancellationRequested: async () => false });
    assert.equal(output.quality.passed, false);
    assert.equal(candidateVerifications >= 1, true);
    assert.equal(output.quality.metrics["native-only-residual-rejected"], 1);
    assert.equal(output.quality.metrics["native-only-residual-rejection-code"], 4);
    assert.equal(output.quality.metrics["large-raster-count"], 1);
    assert.equal(output.quality.checks.find((check) => check.name === "large-raster-editability").passed, false);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});
