"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");
const { addNativeResidualPrimitives, changedComponentKeysFromFit, compactDeckFinalQualitySourceProvenance, compactDeckLateShapeSourceBudgetProvenance, compactDeckLateTextSourceBudgetProvenance, compactDeckNativeShapeSourceProvenance, createImageToEditableArchiveHandler, finalRefinementQualityAcceptable, fitDeckEditableTextFontFamily, fitDeckLightCardGeometry, fitDeckLightCardSideAccents, fitDeckLightCardSourceStrokes, fitDeckLightCardStrokeColors, fitDeckLightCardStrokes, fitDeckLowContrastFooterMarks, fitDeckLowContrastFooterPrimitives, fitDeckLowSaturationPanelFills, fitDeckMissingNativeVisualAtomShapes, fitDeckNativeShapeThinStrokes, fitDeckOcrEvidenceToSource, fitDeckSaturatedColorPanels, fitDeckSourceVerticalLines, fitDeckTextFidelityPrimitives, fitDeckWorstComponentFidelityPrimitives, fitDeckWorstConnectorStyles, fitDeckWorstRichOcrTextLayout, fitDeckWorstTextArrowGlyphs, fitDeckWorstTextBoxNudge, fitDeckWorstTextColors, fitDeckWorstTextComposite, fitDeckWorstTextInkBoxes, fitDeckWorstTextScale, fitDeckWorstTextWeight, focusedCandidateLimits, focusedLightCardStrokeWidthCandidates, isReliableMissingNativeVisualAtom, lightCardSourceStrokeQualityAcceptable, missingNativeTargetInkRunShapes, nativeOnlyMissingNativeLinesDoesNotRegress, nativeOnlyRefinementDoesNotMateriallyRegress, nativeOnlyResidualQualityAcceptable, removeFullSlideResidualImages, replacePictorialIconCropsWithNativeShapes, residualDeduplicationStatus, targetComponentQualityImproves, targetMissingNativeComponentQualityImproves, tryBuildFinalLineTextCoveredCropDropCandidate, tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate, tryBuildNativeOnlyPictorialIconCandidate, tryBuildNativeOnlyRichOcrTextLayoutCandidate, validateDeckIr, worstTextBoxNudgeCandidates, worstTextCompositeScaleCandidates } = require("../packages/slideclone-worker-adapter/team-worker");
const { addLowContrastFooterNativeMarks, boundedOcrSourceDeck, correctContextualOcrLines, createRawImageNativeRebuilder, largeRasterEditability, nativeObjectMetrics, residualEraseObjects, shouldOmitFullSlideResidual, writeTextErasedVisualFallbackAsset } = require("../packages/slideclone-core/team-native-rebuild");
const { PRODUCTION_PROFILE_NAME } = require("../packages/slideclone-core/native-rebuild-profile");
const { PROFILE_NAME, sha256File } = require("../packages/slideclone-core/team-ocr-profile");
const { PROFILE_NAME: PADDLE_PROFILE_NAME } = require("../packages/slideclone-core/team-paddleocr-profile");
const { createNativeRebuilder, startupFailureCode, workerSettings } = require("../packages/remote-mcp-server/bin/common-tools-team-image-worker");
const { eraseMasks, readPng, rebuildDeckFromWorkDir } = require("../packages/slideclone-native-engine").loadNativeImageEngine();
const { createFullSlideResidualBuilder } = require("../packages/slideclone-core/full-slide-native-residual");
const { addKnowledgeGraphPictorialConnectors, applyKnowledgeGraphPanelNativeRebuild, findKnowledgeGraphPanelModel } = require("../packages/slideclone-core/knowledge-graph-native");
const { writePng } = require("../packages/slideclone-core/png");
const { refineKnowledgeGraphIconCrops } = require("../packages/slideclone-core/knowledge-graph-icon-crops");
const { assessStrictNativeCandidate } = require("../packages/slideclone-worker-adapter/candidate-quality-policy");
const { auditNativeComponentQuality } = require("../packages/slideclone-core/native-component-quality");
const { auditSemanticEditability } = require("../packages/slideclone-core/semantic-editability-quality");
const { readZipEntries, writeStoredZipAtomic } = require("../packages/ooxml-core/pptx-zip");

const createFullSlideResidual = createFullSlideResidualBuilder({ eraseMasks, readPng, writePng });
const MINIMAL_PPTX_ENTRIES = Object.freeze([
  { name: "[Content_Types].xml", data: Buffer.from('<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>') },
  { name: "ppt/presentation.xml", data: Buffer.from('<p:presentation xmlns:p="urn:p"/>') }
]);

function writeMinimalPptx(file) {
  writeStoredZipAtomic(file, MINIMAL_PPTX_ENTRIES);
}

function assertMinimalPptxBuffer(value) {
  const entries = readZipEntries(Buffer.from(value));
  const names = new Set(entries.map((entry) => entry.name));
  assert.equal(names.has("[Content_Types].xml"), true);
  assert.equal(names.has("ppt/presentation.xml"), true);
}

function minimalPptxBuilderSource() {
  const zipModule = require.resolve("../packages/ooxml-core/pptx-zip");
  const entries = MINIMAL_PPTX_ENTRIES.map((entry) => ({
    name: entry.name,
    data: entry.data.toString("utf8")
  }));
  return `const { writeStoredZipAtomic } = require(${JSON.stringify(zipModule)});\nconst out = process.argv[process.argv.indexOf('--out') + 1];\nwriteStoredZipAtomic(out, ${JSON.stringify(entries)}.map((entry) => ({ name: entry.name, data: Buffer.from(entry.data) })));\n`;
}

function delayedMinimalPptxBuilderSource({ readyFile, finishedFile, releaseFile }) {
  const zipModule = require.resolve("../packages/ooxml-core/pptx-zip");
  const entries = MINIMAL_PPTX_ENTRIES.map((entry) => ({
    name: entry.name,
    data: entry.data.toString("utf8")
  }));
  return `const fs = require('node:fs');\nconst { writeStoredZipAtomic } = require(${JSON.stringify(zipModule)});\nconst entries = ${JSON.stringify(entries)}.map((entry) => ({ name: entry.name, data: Buffer.from(entry.data) }));\nfs.writeFileSync(${JSON.stringify(readyFile)}, JSON.stringify({ pid: process.pid }));\nconst timer = setInterval(() => { if (!fs.existsSync(${JSON.stringify(releaseFile)})) return; clearInterval(timer); writeStoredZipAtomic(process.argv[process.argv.indexOf('--out') + 1], entries); fs.writeFileSync(${JSON.stringify(finishedFile)}, 'finished'); }, 25);\n`;
}

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
  const source = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "team-worker.js"), "utf8");
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

test("low contrast footer native marks ignore sparse footer text strokes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "footer-mark-sparse-text-"));
  const sourceFile = path.join(root, "source.png");
  const width = 120; const height = 120;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 110; y < 116; y += 1) {
    for (let x = 36; x < 84; x += 6) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 170; rgba[offset + 1] = 168; rgba[offset + 2] = 166; rgba[offset + 3] = 255;
    }
  }
  writePng(sourceFile, { width, height, rgba });
  const page = { pageIndex: 0, textBoxes: [], images: [], shapes: [] };

  try {
    const added = addLowContrastFooterNativeMarks(page, { widthPt: 120, heightPt: 120 }, sourceFile);

    assert.equal(added, 0);
    assert.equal(page.shapes.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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

test("early worst text composite candidates stay focused on useful nudge directions", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "team-worker.js"), "utf8");
  assert.match(source, /function earlyWorstTextCompositeNudgeCandidates\(\) \{\s+return \[0\.35, -0\.35\];\s+\}/u);
});

test("raw image Worker prioritizes worst text scale and weight before light card stroke search", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "team-worker.js"), "utf8");
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
  const source = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "team-worker.js"), "utf8");
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
  const source = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "team-worker.js"), "utf8");
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
  const source = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "team-worker.js"), "utf8");
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
  const source = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "team-worker.js"), "utf8");
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
  const source = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "team-worker.js"), "utf8");
  assert.match(source, /function blockLateVisualRefinementForLargeRaster\(visualQuality, deck\) \{\s+if \(!qualityRendered\(visualQuality\) \|\| largeRasterEditability\(deck\)\.passed\) return visualQuality;\s+if \(topWorstComponentNeedsNativeShapeRefinement\(visualQuality\)\) return visualQuality;/u);
  assert.match(source, /shouldTryFinalComponentFidelityPrimitiveRefinement\(visualQuality\)[\s\S]+const finalWorstComponentFidelityPrimitives =/u);
});

test("native-only residual gap blocks native-only text refinement from reopening late text candidates", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "team-worker.js"), "utf8");
  assert.match(source, /visualQuality = blockLateVisualRefinementForNativeOnlyResidualGap\(visualQuality\);[\s\S]+if \(rawImageTextRefiner && nativeOnlyCandidate\.renderedImages\?\.length && shouldTryFinalWorstTextRefinement\(visualQuality\)\)/u);
  assert.match(source, /visualQuality = blockLateVisualRefinementForNativeOnlyResidualGap\(refined\.quality\);/u);
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

function field(buffer, offset, length, value) { buffer.write(value.slice(0, length), offset, length, "utf8"); }
function tarEntry(name, content) {
  const body = Buffer.from(content);
  const header = Buffer.alloc(512);
  field(header, 0, 100, name);
  field(header, 100, 8, "0000600\0");
  field(header, 124, 12, `${body.length.toString(8).padStart(11, "0")}\0`);
  field(header, 156, 1, "0");
  field(header, 257, 6, "ustar\0");
  return Buffer.concat([header, body, Buffer.alloc((512 - (body.length % 512)) % 512)]);
}
function archive(entries) { return zlib.gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)])); }

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

test("native-only residual candidate removes legacy invented status icon glyph text boxes", () => {
  const deck = {
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      images: [],
      shapes: [{ id: "native-icon-0", type: "ellipse", box: { x: 20, y: 20, w: 20, h: 20 }, source: { detector: "simple-status-icon" } }],
      textBoxes: [
        { id: "native-icon-0-mark", text: "✓", box: { x: 24, y: 24, w: 12, h: 12 }, source: { detector: "simple-status-icon-mark" } },
        { id: "ocr-check", text: "✓ 保留正文", box: { x: 50, y: 20, w: 32, h: 10 }, source: { detector: "ocr" } }
      ]
    }]
  };

  const stripped = removeFullSlideResidualImages(deck);
  const page = stripped.deck.pages[0];

  assert.equal(page.textBoxes.some((item) => item.id === "native-icon-0-mark"), false);
  assert.equal(page.textBoxes.some((item) => item.id === "ocr-check" && item.text === "✓ 保留正文"), true);
  assert.equal(page.shapes.some((shape) => String(shape.source?.detector || "").includes("simple-status-icon-checkmark")), false);
  assert.equal(deck.pages[0].textBoxes.some((item) => item.id === "native-icon-0-mark"), true);
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
  const source = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "team-worker.js"), "utf8");
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
  const source = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "team-worker.js"), "utf8");
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
  const source = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "team-worker.js"), "utf8");
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
  const source = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "team-worker.js"), "utf8");

  assert.match(source, /const COMPONENT_FIDELITY_PRIMITIVE_MAX_RUNS = 160;/u);
  assert.match(source, /const COMPONENT_FIDELITY_PRIMITIVE_BUDGETS = Object\.freeze\(\[160, 80, 40, 20\]\);/u);
});

test("native-only pre-policy text refinement can run while missing geometry remains worst", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "team-worker.js"), "utf8");
  assert.match(source, /function shouldTryNativeOnlyPrePolicyTextRefinement\(visualQuality\) \{\s+return qualityRendered\(visualQuality\) && visualQuality\?\.passed !== true && hasAttentionTextWorstComponent\(visualQuality\);/u);
  assert.match(source, /refineNativeOnlyResidualCandidateText[\s\S]+shouldTryNativeOnlyPrePolicyTextRefinement\(nativeOnlyCandidate\.quality\)/u);
  assert.match(source, /refineNativeOnlyResidualCandidateText[\s\S]+candidateSpecLimit: 1,/u);
  assert.doesNotMatch(source, /refineNativeOnlyResidualCandidateText[\s\S]{0,500}shouldTryFinalWorstTextRefinement\(nativeOnlyCandidate\.quality\)/u);
});

test("native-only rich OCR candidate preserves its rendered pages for measured refinement", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-only-rich-ocr-rendered-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const renderedFile = path.join(root, "rendered.png");
  fs.writeFileSync(renderedFile, "rendered");
  const deck = {
    version: "1.0",
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      pageIndex: 0,
      shapes: [{ id: "native-card", type: "rect", box: { x: 5, y: 5, w: 90, h: 50 }, style: { fill: "#FFFFFF", stroke: "#111111", strokeWidthPt: 1 }, source: { nativeRebuild: true, detector: "line-text-native-card-row" } }],
      textBoxes: [{
        id: "rich-label",
        text: "ABCD",
        box: { x: 10, y: 10, w: 50, h: 12 },
        font: { family: "Arial", sizePt: 8, color: "#111111", align: "left", valign: "middle" },
        style: { visibility: "visible", opacity: 1, wrap: false, fit: "shrink" },
        runs: [
          { text: "AB", font: { family: "Arial", sizePt: 8, color: "#111111" } },
          { text: "CD", font: { family: "Arial", sizePt: 8, color: "#3366CC" } }
        ],
        source: { editable: true, nativeRebuild: true, ocrProvider: "team-pinned-ocr", confidence: 0.98, mixedColorTextRuns: 2 }
      }],
      images: [],
      tables: [],
      charts: [],
      icons: []
    }]
  };
  const baseline = {
    deck,
    removed: 1,
    quality: {
      passed: false,
      checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
      metrics: { "pixel-diff-ratio": 0.15, "foreground-missing-ratio": 0.14, "mean-absolute-delta": 13 },
      componentWorst: [{ pageIndex: 0, id: "rich-label", kind: "text", role: "text", severity: 1.2 }]
    }
  };

  const result = await tryBuildNativeOnlyRichOcrTextLayoutCandidate({
    root,
    baseline,
    sourceImages: [path.join(root, "source.png")],
    isCancellationRequested: async () => false,
    runBuild: async ({ pptxFile }) => { fs.writeFileSync(pptxFile, "candidate"); },
    rawImageQualityVerifier: async ({ collectRenderedPages }) => {
      collectRenderedPages([renderedFile]);
      return {
        passed: false,
        checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
        metrics: { "pixel-diff-ratio": 0.14, "foreground-missing-ratio": 0.13, "mean-absolute-delta": 12.9 }
      };
    }
  });

  assert.ok(result);
  assert.deepEqual(result.renderedImages, [renderedFile]);
  assert.equal(result.quality.metrics["native-only-rich-ocr-text-layout-applied"], 1);
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
  const source = fs.readFileSync(path.join(__dirname, "..", "packages", "slideclone-worker-adapter", "team-worker.js"), "utf8");
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

function lineTextCoveredCropDeck({ includeCoveredCrop = true, includeUncoveredLargeCrop = false, coveredBox = { x: 20, y: 20, w: 60, h: 30 } } = {}) {
  const images = [];
  if (includeCoveredCrop) {
    images.push({
      id: "covered-foreground",
      type: "fidelity-crop",
      assetPath: "assets/covered.png",
      box: coveredBox,
      source: {
        detector: "foreground-graphic-crop",
        reason: "complex-graphic-preserved-as-movable-crop",
        strategy: "local-fidelity-crop",
        editable: false
      }
    });
  }
  if (includeUncoveredLargeCrop) {
    images.push({
      id: "uncovered-foreground",
      type: "fidelity-crop",
      assetPath: "assets/uncovered.png",
      box: { x: 4, y: 64, w: 30, h: 30 },
      source: {
        detector: "foreground-graphic-crop",
        reason: "complex-graphic-preserved-as-movable-crop",
        strategy: "local-fidelity-crop",
        editable: false
      }
    });
  }
  return {
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      images,
      shapes: [
        { id: "panel", type: "rect", box: { x: 20, y: 20, w: 60, h: 30 }, style: { fill: "#FFFFFF", stroke: "#CBD5E1", strokeWidthPt: 1 }, source: { detector: "line-text-native-numbered-section-panel", editable: true, nativeRebuild: true } },
        ...Array.from({ length: 8 }, (_, index) => ({
          id: `card-${index}`,
          type: "rect",
          box: { x: 24 + (index % 4) * 13, y: 24 + Math.floor(index / 4) * 12, w: 10, h: 8 },
          style: { fill: "#FFFFFF", stroke: "#CBD5E1", strokeWidthPt: 1 },
          source: { detector: "line-text-native-card-row", editable: true, nativeRebuild: true }
        }))
      ],
      textBoxes: Array.from({ length: 8 }, (_, index) => ({
        id: `label-${index}`,
        text: `label ${index}`,
        box: { x: 25 + (index % 4) * 13, y: 26 + Math.floor(index / 4) * 12, w: 8, h: 4 },
        source: { editable: true, nativeRebuild: true }
      }))
    }]
  };
}

test("final line-text covered crop candidate removes covered large foreground crops", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "final-line-text-covered-crop-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const baselineDeck = lineTextCoveredCropDeck();
  const visualQuality = {
    passed: false,
    checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    metrics: { "pixel-diff-ratio": 0.15, "foreground-missing-ratio": 0.12, "mean-absolute-delta": 12 }
  };
  const candidateQuality = {
    passed: false,
    checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    metrics: { "pixel-diff-ratio": 0.149, "foreground-missing-ratio": 0.119, "mean-absolute-delta": 11.9 }
  };
  let buildCalls = 0;
  let verifierSawDrop = false;

  const result = await tryBuildFinalLineTextCoveredCropDropCandidate({
    root,
    metadata: { generatedDeck: baselineDeck },
    sourceImages: [],
    visualQuality,
    isCancellationRequested: async () => false,
    runBuild: async ({ pptxFile }) => {
      buildCalls += 1;
      writeMinimalPptx(pptxFile);
    },
    rawImageQualityVerifier: async ({ deck }) => {
      verifierSawDrop = !deck.pages[0].images.some((image) => image.id === "covered-foreground");
      return candidateQuality;
    }
  });

  assert.equal(result.accepted, true);
  assert.equal(buildCalls, 1);
  assert.equal(verifierSawDrop, true);
  assert.equal(result.removedImages, 1);
  assert.equal(result.deck.pages[0].images.length, 0);
  assert.equal(result.candidateRaster.passed, true);
  assert.equal(result.candidateRaster.largeRasterCount < result.baselineRaster.largeRasterCount, true);
  assert.equal(result.deck.meta.finalLineTextCoveredCropDrop.removedImages, 1);
});

test("final line-text covered crop candidate rejects empty PPTX artifacts before verification", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "final-line-text-covered-crop-empty-pptx-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const visualQuality = {
    passed: false,
    checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    metrics: { "pixel-diff-ratio": 0.15, "foreground-missing-ratio": 0.12, "mean-absolute-delta": 12 }
  };
  let verified = false;

  await assert.rejects(() => tryBuildFinalLineTextCoveredCropDropCandidate({
    root,
    metadata: { generatedDeck: lineTextCoveredCropDeck() },
    sourceImages: [],
    visualQuality,
    isCancellationRequested: async () => false,
    runBuild: async () => {},
    rawImageQualityVerifier: async () => { verified = true; return visualQuality; }
  }), /invalid artifact/);
  assert.equal(verified, false);
});

test("final line-text covered crop candidate rejects corrupt PPTX packages before verification", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "final-line-text-covered-crop-corrupt-pptx-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const visualQuality = {
    passed: false,
    checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    metrics: { "pixel-diff-ratio": 0.15, "foreground-missing-ratio": 0.12, "mean-absolute-delta": 12 }
  };
  let verified = false;

  await assert.rejects(() => tryBuildFinalLineTextCoveredCropDropCandidate({
    root,
    metadata: { generatedDeck: lineTextCoveredCropDeck() },
    sourceImages: [],
    visualQuality,
    isCancellationRequested: async () => false,
    runBuild: async ({ pptxFile }) => fs.writeFileSync(pptxFile, Buffer.from("PK\x03\x04")),
    rawImageQualityVerifier: async () => { verified = true; return visualQuality; }
  }), /invalid PPTX package/);
  assert.equal(verified, false);
});

test("final line-text covered crop candidate rejects partial large-raster cleanup", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "final-line-text-covered-crop-partial-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const visualQuality = {
    passed: false,
    checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    metrics: { "pixel-diff-ratio": 0.15, "foreground-missing-ratio": 0.12, "mean-absolute-delta": 12 }
  };

  const result = await tryBuildFinalLineTextCoveredCropDropCandidate({
    root,
    metadata: { generatedDeck: lineTextCoveredCropDeck({ includeUncoveredLargeCrop: true }) },
    sourceImages: [],
    visualQuality,
    isCancellationRequested: async () => false,
    runBuild: async () => { throw new Error("partial large-raster cleanup should not build"); },
    rawImageQualityVerifier: async () => { throw new Error("partial large-raster cleanup should not verify"); }
  });

  assert.equal(result.accepted, false);
  assert.equal(result.rejectionCode, "large-raster-remaining");
  assert.equal(result.removedImages, 1);
  assert.equal(result.baselineRaster.largeRasterCount, 2);
  assert.equal(result.candidateRaster.largeRasterCount, 1);
  assert.equal(result.candidateRaster.passed, false);
});

test("final line-text covered crop candidate rejects visual regressions and non-improvements", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "final-line-text-covered-crop-reject-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const visualQuality = {
    passed: false,
    checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    metrics: { "pixel-diff-ratio": 0.15, "foreground-missing-ratio": 0.12, "mean-absolute-delta": 12 }
  };
  const regressed = await tryBuildFinalLineTextCoveredCropDropCandidate({
    root,
    metadata: { generatedDeck: lineTextCoveredCropDeck() },
    sourceImages: [],
    visualQuality,
    isCancellationRequested: async () => false,
    runBuild: async ({ pptxFile }) => writeMinimalPptx(pptxFile),
    rawImageQualityVerifier: async () => ({
      passed: false,
      checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
      metrics: { "pixel-diff-ratio": 0.16, "foreground-missing-ratio": 0.12, "mean-absolute-delta": 12 }
    })
  });
  assert.equal(regressed.accepted, false);
  assert.equal(regressed.rejectionCode, "visual-regressed");

  const notImproved = await tryBuildFinalLineTextCoveredCropDropCandidate({
    root,
    metadata: { generatedDeck: lineTextCoveredCropDeck({ includeUncoveredLargeCrop: true, coveredBox: { x: 20, y: 20, w: 20, h: 20 } }) },
    sourceImages: [],
    visualQuality,
    isCancellationRequested: async () => false,
    runBuild: async () => { throw new Error("non-improving candidate should not build"); },
    rawImageQualityVerifier: async () => { throw new Error("non-improving candidate should not verify"); }
  });
  assert.equal(notImproved.accepted, false);
  assert.equal(notImproved.rejectionCode, "large-raster-not-improved");
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

test("raw image Worker rejects native-only primitive residual when editability would beat large raster fidelity", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-native-only-editability-first-"));
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
      if (largeRasterEditability(deck).passed) {
        nativeOnlyChecks += 1;
        return { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }], metrics: { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.22, "mean-absolute-delta": 15 } };
      }
      return { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }], metrics: { "pixel-diff-ratio": 0.1, "foreground-missing-ratio": 0.1, "mean-absolute-delta": 10 } };
    },
    rawImageTextRefiner: async () => ({ accepted: false, changedTextBoxes: 0, skippedPixelBudget: 0 }),
    objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async () => {} }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-native-editability-first/" }, isCancellationRequested: async () => false });
    assert.equal(output.quality.passed, false);
    assert.equal(nativeOnlyChecks >= 1, true);
    assert.equal(output.quality.metrics["large-raster-count"], 1);
    assert.equal(output.quality.metrics["final-native-only-residual-forced-editability"], undefined);
    assert.equal((output.quality.metrics["final-native-only-residual-policy-rejected"] || output.quality.metrics["native-only-residual-policy-rejected"]), 1);
    assert.equal(output.quality.metrics["final-native-only-residual-semantic-rejected"], undefined);
    assert.equal(output.quality.metrics["final-native-only-residual-component-rejected"], undefined);
    assert.equal((output.quality.metrics["final-native-only-residual-removed"] || output.quality.metrics["native-only-residual-removed"]), 1);
    assert.equal(output.quality.metrics["final-native-residual-primitives"] || output.quality.metrics["native-residual-primitives"] || 0, 0);
    assert.equal(output.quality.checks.find((check) => check.name === "large-raster-editability").passed, false);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("raw image Worker rejects native-only primitive residual when baseline quality render fails", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-native-only-after-render-fail-"));
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
      if (!largeRasterEditability(deck).passed) {
        return { passed: false, checks: [{ name: "quality-rendered", passed: false }], metrics: { "quality-render-failed": 1 } };
      }
      nativeOnlyChecks += 1;
      return { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }], metrics: { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.22, "mean-absolute-delta": 15 } };
    },
    rawImageTextRefiner: async () => ({ accepted: false, changedTextBoxes: 0, skippedPixelBudget: 0 }),
    objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async () => {} }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-native-after-render-fail/" }, isCancellationRequested: async () => false });
    assert.equal(output.quality.passed, false);
    assert.equal(nativeOnlyChecks, 1);
    assert.equal(output.quality.metrics["large-raster-count"], 1);
    assert.equal(output.quality.metrics["final-native-only-residual-forced-editability"], undefined);
    assert.equal(output.quality.metrics["final-native-only-residual-policy-rejected"], 1);
    assert.equal(output.quality.metrics["final-native-only-residual-semantic-rejected"], undefined);
    assert.equal(output.quality.metrics["final-native-only-residual-component-rejected"], undefined);
    assert.equal(output.quality.metrics["final-native-only-residual-removed"], 1);
    assert.equal(output.quality.metrics["final-native-residual-primitives"], 0);
    assert.equal(output.quality.checks.find((check) => check.name === "large-raster-editability").passed, false);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("raw image Worker blocks late visual micro-refinement while large raster crops remain", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-large-raster-late-block-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    builderArgs: [builderFile],
    rawImageOcr: async () => ({ lines: [{ text: "Editable text", box: { x: 8, y: 8, w: 100, h: 20 } }] }),
    rawImageRebuilder: async ({ metadata, ocr }) => {
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" });
      rebuilt.pages[0].images.push({
        id: "large-local-crop",
        type: "fidelity-crop",
        assetPath: "assets/source.png",
        box: { x: 0, y: 0, w: 420, h: 180 },
        source: { editable: false, strategy: "local-fidelity-crop" }
      });
      return { deck: rebuilt, metrics: nativeObjectMetrics(rebuilt), residual: { candidateObjects: 0, erasedObjects: 0 } };
    },
    rawImageQualityVerifier: async () => ({
      passed: false,
      checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
      metrics: { "pixel-diff-ratio": 0.15, "foreground-missing-ratio": 0.12, "mean-absolute-delta": 12 }
    }),
    rawImageTextRefiner: async () => ({ accepted: false, changedTextBoxes: 0, skippedPixelBudget: 0 }),
    objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async () => {} }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-large-raster-block/" }, isCancellationRequested: async () => false });
    assert.equal(output.quality.passed, false);
    assert.equal(output.quality.metrics["large-raster-late-refinement-blocked"], 1);
    assert.equal(output.quality.metrics["final-ocr-evidence-fit-accepted"], undefined);
    assert.equal(output.quality.metrics["large-raster-count"], 1);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("image Worker delivers the selected refinement IR and PPTX, preserving the baseline on rejection", async (t) => {
  for (const accepted of [true, false]) await t.test(accepted ? "accepted" : "rejected", async (t) => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "image-refinement-flow-"));
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
    const builderFile = path.join(temporaryRoot, "builder.cjs");
    fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
    const source = fs.readFileSync(path.join(__dirname, "../skills/pd-hifi-slideclone/examples/ocr-text-smoke.source.png"));
    let baselineSize, deliveredSize, uploaded, refinements = 0, verifications = 0;
    const report = passed => ({ passed, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed }], metrics: { "pixel-diff-ratio": passed ? 0.03 : 0.1 } });
    const handler = createImageToEditableArchiveHandler({
      temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
      rawImageOcr: async () => ({ lines: [{ text: "测试文字", box: { x: 10, y: 10, w: 100, h: 20 } }] }),
      rawImageRebuilder: async ({ metadata, ocr }) => {
        const deck = boundedOcrSourceDeck({ metadata, ocr, sourceImage: metadata.assetPath });
        baselineSize = deck.pages[0].textBoxes[0].font.sizePt;
        deck.pages[0].shapes.push({ id: "card", type: "rect", box: { x: 100, y: 100, w: 100, h: 50 }, source: { editable: true } });
        return { deck };
      },
      rawImageQualityVerifier: async ({ root, collectRenderedPages }) => { verifications++; if (collectRenderedPages) collectRenderedPages([path.join(root, "render.png")]); return report(verifications > 1); },
      rawImageTextRefiner: async request => {
        refinements++;
        assert.equal(request.renderedImages.length, 1);
        assert.equal(request.acceptImprovedFailure, true);
        const deck = structuredClone(request.deck); deck.pages[0].textBoxes[0].font.sizePt += 2;
        const deckFile = path.join(request.root, "candidate.json"), pptxFile = path.join(request.root, "candidate.pptx");
        fs.writeFileSync(deckFile, JSON.stringify(deck));
        await request.buildCandidate({ deckFile, pptxFile });
        const quality = await request.verifyCandidate({ deck, pptxFile });
        return { deck, deckFile, pptxFile, quality, accepted, changedTextBoxes: 1, skippedPixelBudget: accepted ? 0 : 123 };
      },
      createDelivery: async ({ irFile, pptxFile }) => {
        deliveredSize = JSON.parse(fs.readFileSync(irFile)).pages[0].textBoxes[0].font.sizePt;
        return { checks: [], artifacts: [{ name: "deck.pptx", file: pptxFile, mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }] };
      },
    objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async ({ body }) => { uploaded = Buffer.from(body); } }
    });
    const result = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/input.tar.gz", outputPrefix: "owners/a/jobs/refinement/" }, isCancellationRequested: async () => false });
    assert.equal(refinements, 1); assert.equal(verifications, accepted ? 2 : 4);
    assert.equal(deliveredSize, baselineSize + (accepted ? 2 : 0));
    assertMinimalPptxBuffer(uploaded);
    assert.equal(result.quality.passed, accepted);
    assert.equal(result.quality.metrics["text-refinement-accepted"], Number(accepted));
    if (accepted) assert.equal(result.quality.metrics["final-ocr-evidence-fit-accepted"], undefined);
    assert.equal(result.quality.metrics["text-refinement-skipped-pixel-budget"], accepted ? undefined : 123);
    if (!accepted) assert.equal(result.quality.checks.some(check => check.name === "visual-fidelity" && check.passed === false), true);
  });
});

test("accepted raw image text refinement updates the verification deck", () => {
  const source = fs.readFileSync(path.join(__dirname, "../packages/slideclone-worker-adapter/team-worker.js"), "utf8");
  const firstRefinement = source.indexOf("if (raw && rawImageQualityVerifier && rawImageTextRefiner && renderedImages.length");
  assert.notEqual(firstRefinement, -1);
  const acceptedBranch = source.indexOf("if (refined.accepted) {", firstRefinement);
  assert.notEqual(acceptedBranch, -1);
  const branchEnd = source.indexOf("visualQuality = { ...visualQuality", acceptedBranch);
  assert.notEqual(branchEnd, -1);
  const branch = source.slice(acceptedBranch, branchEnd);
  assert.match(branch, /metadata\.generatedDeck = refined\.deck; metadata\.deckFile = refined\.deckFile; outputFile = refined\.pptxFile; verificationDeck = refined\.deck; visualQuality = refined\.quality;/u);
});

test("raw image Worker skips text refinement for catastrophically regressed OCR recovery candidates", () => {
  const source = fs.readFileSync(path.join(__dirname, "../packages/slideclone-worker-adapter/team-worker.js"), "utf8");
  const rejectedRecovery = source.indexOf("if (bestRejectedRecovery && metadata.ocrCropRecovery?.recovered === 0 && rawImageTextRefiner");
  assert.notEqual(rejectedRecovery, -1);
  const refinerCall = source.indexOf("rawImageTextRefiner({", rejectedRecovery);
  assert.notEqual(refinerCall, -1);
  const guardedBlock = source.slice(rejectedRecovery, refinerCall);
  assert.match(guardedBlock, /!shouldStopOcrRecoverySearch\(\{\s*baselineQuality:\s*visualQuality,\s*candidateQuality:\s*bestRejectedRecovery\.quality\s*\}\)/u);
});

test("image Worker keeps searching primitive budgets after an oversized primitive candidate is rejected", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "image-primitive-budget-search-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const builderFile = path.join(temporaryRoot, "builder.cjs");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const width = 64; const height = 2100;
  const sourceRgba = Buffer.alloc(width * height * 4, 255);
  const renderedRgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 20; y < 2020; y += 2) {
    for (let x = 20; x < 24; x += 1) {
      const offset = (y * width + x) * 4;
      sourceRgba[offset] = 24; sourceRgba[offset + 1] = 58; sourceRgba[offset + 2] = 160; sourceRgba[offset + 3] = 255;
    }
  }
  const sourceFile = path.join(temporaryRoot, "source.png");
  writePng(sourceFile, { width, height, rgba: sourceRgba });
  const source = fs.readFileSync(sourceFile);
  const uploaded = [];
  const primitiveAttempts = [];
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    builderArgs: [builderFile],
    rawImageOcr: async () => ({ lines: [{ text: "Primitive budget", box: { x: 18, y: 18, w: 12, h: 2010 } }] }),
    rawImageRebuilder: async ({ metadata }) => ({
      deck: {
        version: "1.0",
        slideSize: { widthPt: 960, heightPt: 540 },
        pages: [{
          pageIndex: 0,
          source: { pageImage: metadata.assetPath },
          textBoxes: [{ id: "text-1", text: "Primitive budget", box: { x: 270, y: 4.6, w: 180, h: 517 }, source: { evidenceBox: { x: 270, y: 4.6, w: 180, h: 517 } } }],
          images: [],
          shapes: [{ id: "native-card", type: "rect", box: { x: 1, y: 1, w: 8, h: 8 }, style: { fill: "#FFFFFF" }, source: { editable: true } }]
        }]
      }
    }),
    rawImageQualityVerifier: async ({ root, deck, collectRenderedPages }) => {
      if (collectRenderedPages) {
        const renderedFile = path.join(root, `rendered-${primitiveAttempts.length}.png`);
        writePng(renderedFile, { width, height, rgba: renderedRgba });
        collectRenderedPages([renderedFile]);
      }
      const primitiveCount = deck.meta?.finalTextFidelityPrimitiveFit?.addedShapes || 0;
      if (primitiveCount > 0) primitiveAttempts.push(primitiveCount);
      const passed = primitiveCount > 0 && primitiveCount <= 800;
      const bestPrimitiveBudget = primitiveCount === 800;
      return {
        passed,
        checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed }],
        metrics: {
          "pixel-diff-ratio": bestPrimitiveBudget ? 0.07 : passed ? 0.071 : 0.2,
          "foreground-missing-ratio": bestPrimitiveBudget ? 0.01 : passed ? 0.011 : 0.12,
          "mean-absolute-delta": bestPrimitiveBudget ? 4 : passed ? 4.1 : 18
        }
      };
    },
    objectStore: {
      readObject: async () => archive([tarEntry("assets/source.png", source)]),
      putObject: async ({ body }) => uploaded.push(Buffer.from(body))
    }
  });

  const result = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/input.tar.gz", outputPrefix: "owners/a/jobs/primitive-budget/" }, isCancellationRequested: async () => false });

  assert.equal(result.quality.passed, true);
  const firstOversizedAttempt = primitiveAttempts.indexOf(1000);
  const acceptedAttempt = primitiveAttempts.indexOf(800);
  assert.notEqual(firstOversizedAttempt, -1);
  assert.notEqual(acceptedAttempt, -1);
  assert.equal(acceptedAttempt > firstOversizedAttempt, true);
  assert.equal(result.quality.metrics["final-text-fidelity-primitives-accepted"], 1);
  assert.equal(result.quality.metrics["final-text-fidelity-primitives-shapes"], 800);
  assertMinimalPptxBuffer(uploaded.at(-1));
});

test("image Worker reruns text fidelity primitives after accepted component primitive repair", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "image-late-text-primitive-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const builderFile = path.join(temporaryRoot, "builder.cjs");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const width = 80; const height = 60;
  const slideSize = { widthPt: 960, heightPt: 720 };
  const sx = slideSize.widthPt / width;
  const sy = slideSize.heightPt / height;
  const sourceRgba = Buffer.alloc(width * height * 4, 255);
  for (const pixel of [{ x: 14, y: 10 }, { x: 15, y: 10 }, { x: 34, y: 30 }, { x: 35, y: 30 }]) {
    const offset = (pixel.y * width + pixel.x) * 4;
    sourceRgba[offset] = 20; sourceRgba[offset + 1] = 64; sourceRgba[offset + 2] = 180; sourceRgba[offset + 3] = 255;
  }
  const sourceFile = path.join(temporaryRoot, "source.png");
  writePng(sourceFile, { width, height, rgba: sourceRgba });
  const source = fs.readFileSync(sourceFile);
  const uploaded = [];
  const lateTextPrimitiveAttempts = [];
  function renderedFile(root, name, includeTextInk) {
    const rgba = Buffer.alloc(width * height * 4, 255);
    if (includeTextInk) for (const pixel of [{ x: 14, y: 10 }, { x: 15, y: 10 }]) {
      const offset = (pixel.y * width + pixel.x) * 4;
      rgba[offset] = 20; rgba[offset + 1] = 64; rgba[offset + 2] = 180; rgba[offset + 3] = 255;
    }
    const file = path.join(root, `${name}.png`);
    writePng(file, { width, height, rgba });
    return file;
  }
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    builderArgs: [builderFile],
    rawImageOcr: async () => ({ lines: [{ text: "Late text", box: { x: 10, y: 8, w: 16, h: 6 } }] }),
    rawImageRebuilder: async ({ metadata }) => ({
      deck: {
        version: "1.0",
        slideSize,
        pages: [{
          pageIndex: 0,
          source: { pageImage: metadata.assetPath },
          textBoxes: [{ id: "text-1", text: "Late text", box: { x: 10 * sx, y: 8 * sy, w: 18 * sx, h: 8 * sy }, source: { evidenceBox: { x: 10 * sx, y: 8 * sy, w: 18 * sx, h: 8 * sy } } }],
          images: [],
          shapes: [{ id: "component-1", type: "rect", box: { x: 30 * sx, y: 26 * sy, w: 12 * sx, h: 10 * sy }, style: { fill: "#ffffff" }, source: { editable: true } }]
        }]
      }
    }),
    rawImageQualityVerifier: async ({ root, deck, collectRenderedPages }) => {
      const componentRepaired = deck.meta?.finalWorstComponentFidelityPrimitiveFit?.addedShapes > 0;
      const textPrimitiveCount = deck.meta?.finalTextFidelityPrimitiveFit?.addedShapes || 0;
      if (collectRenderedPages) {
        collectRenderedPages([renderedFile(root, `rendered-${componentRepaired ? "late" : "early"}`, !componentRepaired)]);
      }
      if (componentRepaired && textPrimitiveCount > 0) lateTextPrimitiveAttempts.push(textPrimitiveCount);
      return {
        passed: componentRepaired && textPrimitiveCount > 0,
        checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: componentRepaired && textPrimitiveCount > 0 }],
        componentWorst: componentRepaired ? [] : [{ pageIndex: 0, id: "component-1", kind: "shape", role: "shape", attention: true, severity: 1.2 }],
        metrics: componentRepaired && textPrimitiveCount > 0
          ? { "pixel-diff-ratio": 0.07, "foreground-missing-ratio": 0.01, "mean-absolute-delta": 3, "component-regions-attention": 0, "worst-component-normalized-severity": 0 }
          : componentRepaired
            ? { "pixel-diff-ratio": 0.09, "foreground-missing-ratio": 0.03, "mean-absolute-delta": 5, "component-regions-attention": 0, "worst-component-normalized-severity": 0 }
            : { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.1, "mean-absolute-delta": 12, "component-regions-attention": 1, "worst-component-normalized-severity": 1.2 }
      };
    },
    objectStore: {
      readObject: async () => archive([tarEntry("assets/source.png", source)]),
      putObject: async ({ body }) => uploaded.push(Buffer.from(body))
    }
  });

  const result = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/input.tar.gz", outputPrefix: "owners/a/jobs/late-text-primitive/" }, isCancellationRequested: async () => false });

  assert.equal(result.quality.passed, true);
  assert.ok(lateTextPrimitiveAttempts.length > 0);
  assert.ok(lateTextPrimitiveAttempts.every((count) => count === 1));
  assert.equal(result.quality.metrics["final-late-text-fidelity-primitives-accepted"], 1);
  assertMinimalPptxBuffer(uploaded.at(-1));
});

test("OCR checkpoint survives reconstruction failure and a fresh Worker handler without bypassing quality", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-stage-retry-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.resolve("skills/pd-hifi-slideclone/examples/ocr-text-smoke.source.png"));
  const input = archive([tarEntry("assets/source.png", source)]);
  const prefix = require("../packages/team-runtime/job-input").ownerPrefix("checkpoint-test-owner");
  const id = "1e4a9e5c-4f5f-4c7e-9f44-84725a42a1ad";
  const job = { id, ownerId: "checkpoint-test-owner", capability: "image-to-editable", inputObjectKey: `${prefix}inputs/source.tar.gz`, outputPrefix: `${prefix}jobs/${id}/attempts/1/`, attempt: 1 };
  const objects = new Map(); const roots = []; let ocrCalls = 0; let rebuildCalls = 0;
  const options = {
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile], ocrCheckpointFingerprint: "a".repeat(64),
    objectStore: {
      async readObject({ objectKey }) {
        if (objectKey === job.inputObjectKey) return input;
        if (objects.has(objectKey)) return objects.get(objectKey);
        const error = new Error("missing object"); error.name = "NoSuchKey"; throw error;
      },
      async putObject({ objectKey, body }) { objects.set(objectKey, Buffer.from(body)); }
    },
    async rawImageOcr() { ocrCalls++; return { lines: [{ text: "Editable label", confidence: 0.99, box: { x: 8, y: 8, w: 100, h: 20 } }] }; },
    async rawImageRebuilder({ root, metadata, ocr }) {
      roots.push(root); rebuildCalls++;
      if (rebuildCalls === 1) throw new Error("injected reconstruction failure");
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" });
      rebuilt.pages[0].shapes.push({ id: "card", type: "rect", box: { x: 4, y: 4, w: 120, h: 40 }, source: { editable: true } });
      return { deck: rebuilt };
    }
  };
  await assert.rejects(createImageToEditableArchiveHandler(options)({ job, isCancellationRequested: async () => false }), (error) => error.code === "IMAGE_REBUILD_FAILED");
  assert.equal(fs.existsSync(roots[0]), false);
  const recoveredJob = { ...job, attempt: 2, outputPrefix: `${prefix}jobs/${id}/attempts/2/` };
  const result = await createImageToEditableArchiveHandler(options)({ job: recoveredJob, isCancellationRequested: async () => false });
  assert.equal(ocrCalls, 1);
  assert.equal(rebuildCalls, 2);
  assert.notEqual(roots[0], roots[1]);
  assert.equal(result.quality.passed, false);
  assert.ok(result.quality.checks.some(check => check.name === "quality-render-not-configured" && check.passed === false));
  assert.equal(fs.existsSync(roots[1]), false);
  const checkpoints = [...objects.keys()].filter(key => key.includes("/.internal/ocr/"));
  assert.equal(checkpoints.length, 1);
  assert.ok(checkpoints[0].startsWith(`${prefix}jobs/${id}/.internal/ocr/`));
  assert.ok(result.artifacts.every(artifact => artifact.objectKey.startsWith(recoveredJob.outputPrefix)));
  const retainedKeys = await require("../packages/team-runtime/retention-output-keys").collectRetentionOutputKeys({
    prefix: `${prefix}jobs/${id}/`, listPage: async () => ({ keys: [...objects.keys()], nextToken: null })
  });
  assert.ok(retainedKeys.includes(checkpoints[0]), "checkpoint participates in ordinary job retention");
});

function writeThreeCardDiagram(file) {
  const width = 960; const height = 540; const rgba = Buffer.alloc(width * height * 4, 255);
  const pixel = (x, y, color) => { const offset = (y * width + x) * 4; rgba[offset] = color[0]; rgba[offset + 1] = color[1]; rgba[offset + 2] = color[2]; rgba[offset + 3] = 255; };
  const fillRect = (x, y, w, h, fill, stroke) => {
    for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) pixel(px, py, px < x + 3 || px >= x + w - 3 || py < y + 3 || py >= y + h - 3 ? stroke : fill);
  };
  for (const [x, fill] of [[80, [222, 235, 255]], [380, [225, 246, 232]], [680, [255, 237, 213]]]) fillRect(x, 200, 200, 100, fill, [45, 74, 110]);
  for (const start of [280, 580]) {
    for (let x = start; x < start + 100; x += 1) for (let y = 247; y <= 252; y += 1) pixel(x, y, [45, 74, 110]);
    for (let delta = 0; delta < 16; delta += 1) for (let y = 250 - delta; y <= 250 + delta; y += 1) pixel(start + 99 - delta, y, [45, 74, 110]);
  }
  writePng(file, { width, height, rgba });
}
function deck(overrides = {}) {
  return {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{ pageIndex: 0, background: { fill: "#FFFFFF" }, textBoxes: [{ id: "title", text: "Team deck", box: { x: 10, y: 10, w: 200, h: 30 }, font: { family: "Arial", sizePt: 20 } }], shapes: [], images: [], tables: [], charts: [], icons: [] }],
    ...overrides
  };
}

test("image worker classifies external stage failures and cleans temporary artifacts", async (t) => {
  const { storedWorkerFailure } = require("../packages/team-runtime/worker-failure");
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "image-stage-failures-"));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const builderFile = path.join(temporaryRoot, "builder.cjs");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "../skills/pd-hifi-slideclone/examples/ocr-text-smoke.source.png"));
  const rawArchive = archive([tarEntry("assets/source.png", source)]);
  const fail = () => { throw new Error("private-provider-token"); };
  const job = { capability: "image-to-editable", inputObjectKey: "input", outputPrefix: "output/" };
  for (const stage of ["INPUT_READ", "NORMALIZATION", "OCR", "REBUILD", "BUILD", "QUALITY", "UPLOAD"]) {
    let uploads = 0;
    const handler = createImageToEditableArchiveHandler({
      temporaryRoot, builderExecutable: process.execPath,
      builderArgs: stage === "BUILD" ? ["-e", "process.stderr.write('private-provider-token');process.exit(3)", "--"] : [builderFile],
      objectStore: {
        readObject: stage === "INPUT_READ" ? fail : async () => stage === "NORMALIZATION" ? archive([tarEntry("assets/source.pdf", "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n")]) : rawArchive,
        putObject: async () => { uploads++; if (stage === "UPLOAD") fail(); }
      },
      documentNormalizer: fail,
      rawImageOcr: stage === "OCR" ? fail : async () => ({ lines: [] }),
      rawImageRebuilder: stage === "REBUILD" ? fail : async ({ metadata, ocr }) => {
        const rebuilt = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" });
        rebuilt.pages[0].shapes.push({ id: "card", type: "rect", box: { x: 4, y: 4, w: 20, h: 20 } });
        return { deck: rebuilt };
      },
      rawImageQualityVerifier: stage === "QUALITY" ? fail : async () => ({ checks: [{ name: "fixture", passed: true }], metrics: {} })
    });
    const spans = [];
    const traced = require("../packages/remote-mcp-server/telemetry").createTracedWorkerHandler(handler, { capability: "image-to-editable", exporter: { exportSpan(value) { spans.push(value); } } });
    await assert.rejects(traced({ job, isCancellationRequested: async () => false }), (error) => {
      const stored = storedWorkerFailure(error);
      assert.equal(stored.code, `IMAGE_${stage}_FAILED`);
      assert.equal(stored.retryable, false);
      assert.equal(JSON.stringify(stored).includes("private-provider-token"), false);
      return true;
    });
    const stageSpans = spans.filter((span) => span.spanName === "common-tools.worker.stage");
    assert.equal(stageSpans.at(-1).stage, `IMAGE_${stage}_FAILED`);
    assert.equal(stageSpans.at(-1).statusCode, 500);
    const workerSpan = spans.at(-1);
    for (const span of stageSpans) {
      assert.equal(span.traceParent.split("-")[1], workerSpan.identity.traceId);
      assert.equal(span.traceParent.split("-")[2], workerSpan.identity.spanId);
    }
    assert.doesNotMatch(JSON.stringify(spans), /private-provider-token|inputObjectKey|outputPrefix/);
    assert.equal(uploads, stage === "UPLOAD" ? 1 : 0);
    assert.deepEqual(fs.readdirSync(temporaryRoot), ["builder.cjs"]);
  }
});

test("contextual OCR correction only repairs AI Agent when the page contains canonical evidence", () => {
  assert.equal(correctContextualOcrLines([{ text: "Al Agent" }, { text: "AIAgent pipeline" }])[0].text, "AI Agent");
  assert.equal(correctContextualOcrLines([{ text: "Al Agent" }, { text: "Al Smith" }])[0].text, "Al Agent");
});

test("team image worker validates the optional render quality dependency at composition time", () => {
  assert.throws(() => createImageToEditableArchiveHandler({
    temporaryRoot: path.resolve(os.tmpdir()),
    rawImageQualityVerifier: {},
    objectStore: { readObject: async () => Buffer.alloc(0), putObject: async () => {} }
  }), /rawImageQualityVerifier/);
});

test("residual duplicate-removal gate fails closed when a residual lacks complete erase evidence", () => {
  const residualDeck = { pages: [{ images: [{ source: { residualCrop: true } }] }] };
  assert.deepEqual(residualDeduplicationStatus({ pages: [{ images: [] }] }), { required: false, passed: true, candidateObjects: 0, erasedObjects: 0 });
  assert.deepEqual(residualDeduplicationStatus(residualDeck, { candidateObjects: 3, erasedObjects: 3 }), { required: true, passed: true, candidateObjects: 3, erasedObjects: 3 });
  assert.equal(residualDeduplicationStatus(residualDeck, { candidateObjects: 3, erasedObjects: 2 }).passed, false);
  assert.equal(residualDeduplicationStatus(residualDeck, { candidateObjects: Number.NaN, erasedObjects: 0 }).passed, false);
});

test("team image worker accepts a bounded Deck IR archive and returns an owner-scoped PPTX", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const uploads = new Map();
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    builderArgs: [builderFile],
    objectStore: {
      readObject: async () => archive([tarEntry("deck.json", JSON.stringify(deck()))]),
      putObject: async ({ objectKey, body, contentType }) => uploads.set(objectKey, { body, contentType })
    }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/deck.tar.gz", outputPrefix: "owners/a/jobs/job-1/" }, isCancellationRequested: async () => false });
    assert.equal(output.artifacts[0].name, "deck.pptx");
    assert.equal(output.quality.passed, true);
    assert.deepEqual(output.quality.checks.map((check) => check.name), ["deck-ir-validated", "assets-resolved", "pptx-generated"]);
    assert.equal(output.quality.checks.some((check) => check.name === "visual-fidelity"), false);
    assert.equal(output.quality.metrics.pages, 1);
    assert.equal(uploads.get("owners/a/jobs/job-1/deck.pptx").contentType, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    assert.equal(fs.readdirSync(temporaryRoot).filter((entry) => entry !== "builder.js").length, 0);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

for (const cancellationMode of ["requested", "check-failed"]) {
test(`team image worker stops an active builder on cancellation (${cancellationMode}) and can run again`, { timeout: 15000 }, async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-builder-cancel-"));
  const builderFile = path.join(temporaryRoot, "builder.cjs");
  const ready = path.join(temporaryRoot, "ready.json");
  const finished = path.join(temporaryRoot, "finished");
  const release = path.join(temporaryRoot, "release");
  fs.writeFileSync(builderFile, delayedMinimalPptxBuilderSource({ readyFile: ready, finishedFile: finished, releaseFile: release }), "utf8");
  let uploads = 0;
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    objectStore: {
      readObject: async () => archive([tarEntry("deck.json", JSON.stringify(deck()))]),
      putObject: async () => { uploads += 1; }
    }
  });
  const job = { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/deck.tar.gz", outputPrefix: "owners/a/jobs/cancel-build/" };
  try {
    await assert.rejects(() => handler({ job, isCancellationRequested: async () => {
      if (!fs.existsSync(ready)) return false;
      if (cancellationMode === "check-failed") throw new Error("private-cancellation-provider-content");
      return true;
    } }), error => error.code === "IMAGE_BUILD_FAILED" && error.cause?.message === "editable job was cancelled");
    const { pid } = JSON.parse(fs.readFileSync(ready, "utf8"));
    assert.throws(() => process.kill(pid, 0), error => error.code === "ESRCH");
    assert.equal(fs.existsSync(finished), false);
    assert.equal(uploads, 0);
    assert.equal(fs.readdirSync(temporaryRoot).some(name => name.startsWith("common-tools-editable-")), false);
    fs.writeFileSync(release, "continue");
    const result = await handler({ job, isCancellationRequested: async () => false });
    assert.equal(result.quality.passed, true);
    assert.equal(uploads, 1);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

}

test("team image worker compares a fully sourced structured Deck IR against its admitted page images", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-structured-source-quality-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const sourced = deck();
  sourced.pages[0].source = { pageImage: "assets/source.png" };
  let request;
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    rawImageQualityVerifier: async (value) => { request = value; return { checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: true }], metrics: { "pixel-diff-ratio": 0.01 } }; },
    objectStore: { readObject: async () => archive([tarEntry("deck.json", JSON.stringify(sourced)), tarEntry("assets/source.png", source)]), putObject: async () => {} }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/deck.tar.gz", outputPrefix: "owners/a/jobs/structured-quality/" }, isCancellationRequested: async () => false });
    assert.equal(output.quality.passed, true);
    assert.deepEqual(output.quality.checks.map((check) => check.name), ["deck-ir-validated", "assets-resolved", "quality-rendered", "visual-fidelity", "pptx-generated"]);
    assert.deepEqual(request.sourceImages, [path.join(request.root, "assets", "source.png")]);
    assert.equal(request.deck.pages.length, 1);
    assert.equal(request.deck.pages[0].source.pageImage, "assets/source.png");
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker rejects partial structured source evidence before build and reports structured verifier failures", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-structured-source-reject-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const partial = deck();
  partial.pages.push(structuredClone(partial.pages[0])); partial.pages[1].pageIndex = 1;
  partial.pages[0].source = { pageImage: "assets/source.png" };
  const baseJob = { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/deck.tar.gz", outputPrefix: "owners/a/jobs/structured-reject/" };
  try {
    const rejectHandler = createImageToEditableArchiveHandler({
      temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
      rawImageQualityVerifier: async () => assert.fail("must not compare partial sources"),
      objectStore: { readObject: async () => archive([tarEntry("deck.json", JSON.stringify(partial)), tarEntry("assets/source.png", source)]), putObject: async () => assert.fail("must not upload") }
    });
    await assert.rejects(() => rejectHandler({ job: baseJob, isCancellationRequested: async () => false }), /source\.pageImage must be declared for every page/);
    const complete = deck(); complete.pages[0].source = { pageImage: "assets/source.png" };
    for (const response of [null, { checks: [], metrics: {} }, { checks: [{ name: "quality-rendered", passed: false }], metrics: {} }]) {
    const failedHandler = createImageToEditableArchiveHandler({
      temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
      rawImageQualityVerifier: response === null ? undefined : async () => response,
      objectStore: { readObject: async () => archive([tarEntry("deck.json", JSON.stringify(complete)), tarEntry("assets/source.png", source)]), putObject: async () => {} }
    });
    const output = await failedHandler({ job: { ...baseJob, outputPrefix: "owners/a/jobs/structured-failed/" }, isCancellationRequested: async () => false });
    assert.equal(output.quality.passed, false);
    assert.deepEqual(output.quality.checks.find((check) => check.name === "quality-rendered"), { name: "quality-rendered", passed: false });
    }
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("structured source image resolver rejects empty, malicious, missing, and ambiguous page evidence", t => {
  const { resolveStructuredSourceImages } = require("../packages/slideclone-core/structured-source-images");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "structured-source-image-resolver-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets")); fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), path.join(root, "assets", "source.png"));
  assert.throws(() => resolveStructuredSourceImages({ pages: [] }, root), /invalid page count/);
  assert.equal(resolveStructuredSourceImages({ pages: [{ source: { origin: "legacy" } }, {}] }, root), null);
  assert.throws(() => resolveStructuredSourceImages({ pages: [{ source: { pageImage: "../private.png" } }] }, root), /unsafe asset path|inside assets/);
  assert.throws(() => resolveStructuredSourceImages({ pages: [{ source: { pageImage: "assets/missing.png" } }] }, root), /missing/);
  assert.throws(() => resolveStructuredSourceImages({ pages: [{ source: { pageImage: "assets/source.png" } }, {}] }, root), /declared for every page/);
});

test("team image worker can publish the same bounded multi-format delivery contract", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-delivery-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const uploads = new Map();
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    createDelivery: ({ root, irFile, pptxFile }) => {
      assert.equal(path.basename(irFile), "deck.json"); assert.equal(path.basename(pptxFile), "source.pptx");
      const preview = path.join(root, "deck.preview.html"); const pdf = path.join(root, "deck.pdf");
      fs.writeFileSync(preview, "<!doctype html><title>preview</title>"); fs.writeFileSync(pdf, "%PDF-1.4\n%%EOF");
      return { artifacts: [
        { name: "deck.pptx", file: pptxFile, mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
        { name: "deck.preview.html", file: preview, mediaType: "text/html" }, { name: "deck.pdf", file: pdf, mediaType: "application/pdf" }
      ], checks: [{ name: "shared-preview-present", passed: true }, { name: "multi-format-artifacts-present", passed: true }] };
    },
    objectStore: { readObject: async () => archive([tarEntry("deck.json", JSON.stringify(deck()))]), putObject: async ({ objectKey, body, contentType }) => uploads.set(objectKey, { body, contentType }) }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/deck.tar.gz", outputPrefix: "owners/a/jobs/job-delivery/" }, isCancellationRequested: async () => false });
    assert.deepEqual(output.artifacts.map((artifact) => artifact.name), ["deck.pptx", "deck.preview.html", "deck.pdf"]);
    assert.equal(output.quality.passed, true); assert.ok(uploads.has("owners/a/jobs/job-delivery/deck.preview.html"));
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("delivery artifact boundary bounds files and rechecks them after asynchronous work", () => {
  const { prepareDeliveryArtifacts, readDeliveryArtifact, MAX_ARTIFACT_BYTES } = require("../packages/slideclone-core/delivery-artifacts");
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

for (const invalidList of ["invalid-last", "missing-last", "duplicate", "oversized", "empty", "quality-type", "quality-duplicate", "quality-oversized"]) {
test(`team image worker validates the entire delivery result before uploads (${invalidList})`, async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-artifact-admission-"));
  const builderFile = path.join(temporaryRoot, "builder.cjs");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  let uploads = 0;
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    createDelivery: ({ root, pptxFile }) => {
      const item = { name: "deck.pptx", file: pptxFile, mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
      const lists = {
        "invalid-last": [item, { ...item, name: "../outside.pptx" }],
        "missing-last": [item, { ...item, name: "missing.pptx", file: path.join(root, "missing-private-file.pptx") }],
        duplicate: [item, { ...item }],
        oversized: Array.from({ length: 33 }, (_, index) => ({ ...item, name: `deck-${index}.pptx` })),
        empty: [],
        "quality-type": [item], "quality-duplicate": [item], "quality-oversized": [item]
      };
      const checks = invalidList === "quality-type" ? [{ name: "adapter-check", passed: "true" }]
        : invalidList === "quality-duplicate" ? [{ name: "pptx-generated", passed: true }]
          : invalidList === "quality-oversized" ? Array.from({ length: 33 }, (_, index) => ({ name: `adapter-${index}`, passed: true })) : [];
      return { checks, artifacts: lists[invalidList] };
    },
    objectStore: { readObject: async () => archive([tarEntry("deck.json", JSON.stringify(deck()))]), putObject: async () => { uploads += 1; } }
  });
  try {
    await assert.rejects(() => handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/deck.tar.gz", outputPrefix: "owners/a/jobs/invalid-artifacts/" }, isCancellationRequested: async () => false }), error => /editable delivery artifact|quality/.test(error.message) && !error.message.includes("private-file"));
    assert.equal(uploads, 0);
    assert.deepEqual(fs.readdirSync(temporaryRoot), ["builder.cjs"]);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});
}

for (const cancelAfter of ["delivery", "first-upload", "last-upload"]) {
test(`team image worker rejects completion when cancelled after ${cancelAfter}`, async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-delivery-cancel-"));
  const builderFile = path.join(temporaryRoot, "builder.cjs");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  let cancelled = false;
  let uploads = 0;
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    createDelivery: async ({ root, pptxFile }) => {
      const metadataFile = path.join(root, "delivery.json");
      fs.writeFileSync(metadataFile, "{}");
      cancelled = cancelAfter === "delivery";
      return { checks: [], artifacts: [
        { name: "deck.pptx", file: pptxFile, mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
        { name: "delivery.json", file: metadataFile, mediaType: "application/json" }
      ] };
    },
    objectStore: {
      readObject: async () => archive([tarEntry("deck.json", JSON.stringify(deck()))]),
      putObject: async () => { uploads += 1; cancelled = cancelAfter === "first-upload" || (cancelAfter === "last-upload" && uploads === 2); }
    }
  });
  try {
    await assert.rejects(() => handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/deck.tar.gz", outputPrefix: "owners/a/jobs/delivery-cancel/" }, isCancellationRequested: async () => cancelled }), /editable job was cancelled/);
    assert.equal(uploads, { delivery: 0, "first-upload": 1, "last-upload": 2 }[cancelAfter]);
    assert.deepEqual(fs.readdirSync(temporaryRoot), ["builder.cjs"]);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});
}

test("team image worker rejects archive resources that can escape the isolated asset package", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-invalid-"));
  const invalidDeck = deck({ pages: [{ pageIndex: 0, images: [{ id: "outside", assetPath: "../outside.png", box: { x: 0, y: 0, w: 1, h: 1 } }] }] });
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    objectStore: { readObject: async () => archive([tarEntry("deck.json", JSON.stringify(invalidDeck))]), putObject: async () => assert.fail("must not upload") }
  });
  try {
    await assert.rejects(() => handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/deck.tar.gz", outputPrefix: "owners/a/jobs/job-1/" }, isCancellationRequested: async () => false }), /asset/);
    assert.equal(fs.readdirSync(temporaryRoot).length, 0);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test('raw Worker asset namespace preserves only the original private whole-line candidate',async t=>{
 const temporaryRoot=fs.mkdtempSync(path.join(os.tmpdir(),'worker-word-candidate-'));t.after(()=>fs.rmSync(temporaryRoot,{recursive:true,force:true}));
 const builderFile=path.join(temporaryRoot,'builder.js');fs.writeFileSync(builderFile,minimalPptxBuilderSource());
 const image={width:120,height:40,rgba:Buffer.alloc(120*40*4,255)};
 for(let y=15;y<25;y++)for(let x=12;x<108;x++)if(x<52||x>=64)image.rgba.set([30,35,40,255],(y*120+x)*4);
 const source=path.join(temporaryRoot,'source.png');writePng(source,image);
 const line={text:'AABBCC',confidence:.99,box:{x:10,y:10,w:100,h:20},wordPositionHints:[
  {text:'AA',box:{x:10,y:10,w:35,h:20}},{text:'BB',box:{x:53,y:10,w:5,h:20}},{text:'CC',box:{x:60,y:10,w:50,h:20}}]};
 const registry=require('../packages/slideclone-core/source-word-layout-registry');let observed=0;
 const handler=createImageToEditableArchiveHandler({temporaryRoot,builderExecutable:process.execPath,builderArgs:[builderFile],
  rawImageOcr:async()=>({lines:[line]}),
  rawImageRebuilder:async()=>{
   const text={id:'private-line',text:line.text,box:{x:80,y:80,w:800,h:160},font:{family:'Arial',sizePt:12,color:'#1E2328'},style:{wrap:false},source:{pageImage:'assets/source.png',editable:true}};
   registry.registerSourceWordLayout(text,line,image,{remaining:4000000},[line.box]);
   const page=registry.applySourceWordLayouts({textBoxes:[text]},[text]).page;
   page.shapes=[{id:'native-card',type:'rect',box:{x:1,y:1,w:5,h:5},style:{fill:'#FFFFFF'},source:{editable:true}}];page.images=[];
   const rebuilt={version:'1.0',slideSize:{widthPt:960,heightPt:320},pages:[page]};
   return {deck:rebuilt,metrics:nativeObjectMetrics(rebuilt)};
  },
  rawImageTextRefiner:async()=>{throw Error('passed visual fidelity must not reopen typography');},
  rawImageQualityVerifier:async({deck,sourceImages,collectRenderedPages})=>{
   observed++;assert.equal(deck.pages[0].textBoxes[0].source.pageImage,'assets/page-001/source.png');
   assert.equal(registry.planIntactSourceWordLayouts(structuredClone(deck.pages[0])).changes.length,0);
   const candidate=registry.planIntactSourceWordLayouts(deck.pages[0]);assert.equal(candidate.changes.length,1);
   assert.equal(candidate.textBoxes[0].positionedRuns[0].text,line.text);
   if(collectRenderedPages)collectRenderedPages(sourceImages);
   return {passed:false,checks:[{name:'quality-rendered',passed:true},{name:'visual-fidelity',passed:true},{name:'source-scene-complete',passed:false}],metrics:{'pixel-diff-ratio':0,'foreground-missing-ratio':0,'mean-absolute-delta':0}};
  },
  objectStore:{readObject:async()=>archive([tarEntry('assets/source.png',fs.readFileSync(source))]),putObject:async()=>{}}
 });
 await handler({job:{capability:'image-to-editable',inputObjectKey:'owners/a/inputs/source.tar.gz',outputPrefix:'owners/a/jobs/candidate/'},isCancellationRequested:async()=>false});
 assert.equal(observed,1);
});

test("team image worker requires native graphical reconstruction for a raw image and reports native metrics", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-raw-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const uploads = new Map();
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    builderArgs: [builderFile],
    rawImageOcr: async ({ inputFile, dimensions }) => {
      assert.equal(path.basename(inputFile), "source.png");
      assert.ok(dimensions.widthPx > 0 && dimensions.heightPx > 0);
      return { lines: [{ text: "Editable text", box: { x: 8, y: 8, w: 100, h: 20 } }] };
    },
    rawImageRebuilder: async ({ metadata, ocr }) => {
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" });
      rebuilt.pages[0].textBoxes[0].font.opacity = 1;
      rebuilt.pages[0].textBoxes[0].style.opacity = 1;
      rebuilt.pages[0].textBoxes[0].style.visibility = "visible";
      rebuilt.pages[0].shapes.push({ id: "native-card", type: "roundRect", box: { x: 4, y: 4, w: 120, h: 40 }, fill: "#FFFFFF", source: { editable: true, detector: "test-native-card" } });
      rebuilt.pages[0].images.push({ id: "residual", assetPath: "assets/source.png", box: { x: 0, y: 0, w: 960, h: 540 }, source: { editable: false, residualCrop: true, nativeObjectsErased: true } });
      return { deck: rebuilt, metrics: nativeObjectMetrics(rebuilt), residual: { candidateObjects: 2, erasedObjects: 2 }, ocrCropRecovery: { sourceLines: 1, recovered: 1, cropsErased: 1 } };
    },
    objectStore: {
      readObject: async () => archive([tarEntry("assets/source.png", source)]),
      putObject: async ({ objectKey, body, contentType }) => uploads.set(objectKey, { body, contentType })
    }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-raw/" }, isCancellationRequested: async () => false });
    assert.equal(output.artifacts[0].name, "deck.pptx");
    assert.equal(output.quality.passed, false);
    assert.deepEqual(output.quality.checks.map((check) => check.name), ["raw-image-validated", "assets-resolved", "native-graphics-rebuilt", "semantic-editability", "residual-native-duplicates-removed", "quality-render-not-configured", "large-raster-editability", "pptx-generated"]);
    assert.equal(output.quality.checks.find((check) => check.name === "semantic-editability").passed, false);
    assert.equal(output.quality.checks.find((check) => check.name === "large-raster-editability").passed, false);
    assert.equal(output.quality.metrics["large-raster-count"], 1);
    assert.equal(output.quality.metrics["native-shapes"], 1);
    assert.equal(output.quality.metrics["native-text-boxes"], 1);
    assert.equal(output.quality.metrics["residual-erased-native-objects"], 2);
    assert.equal(output.quality.metrics["semantic-large-raster-lineages"], 1);
    assert.equal(output.quality.metrics["ocr-crop-lines-recovered"], 1);
    assert.ok(uploads.has("owners/a/jobs/job-raw/deck.pptx"));
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker rejects native residual primitives before tiled visual fallback", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-native-fallback-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  let fallbackDeck = null;
  let fallbackAttempts = 0;
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    builderArgs: [builderFile],
    rawImageOcr: async () => ({ lines: [{ text: "Editable text", box: { x: 8, y: 8, w: 100, h: 20 } }] }),
    rawImageRebuilder: async ({ metadata, ocr }) => {
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" });
      rebuilt.pages[0].shapes.push(
        { id: "native-card", type: "roundRect", box: { x: 4, y: 4, w: 120, h: 40 }, style: { fill: "#FFFFFF", stroke: "#3366FF", strokeWidthPt: 1 }, source: { editable: true, detector: "test-native-card" } },
        { id: "native-line", type: "line", box: { x: 130, y: 24, w: 60, h: 0 }, style: { stroke: "#3366FF", strokeWidthPt: 1.2, lineCap: "round", endArrow: "triangle", endArrowWidth: "sm", endArrowLength: "sm" }, source: { editable: true, detector: "long-axis-line" } }
      );
      rebuilt.pages[0].images.push({ id: "residual", assetPath: "assets/source.png", box: { x: 0, y: 0, w: 960, h: 540 }, source: { editable: false, residualCrop: true, nativeObjectsErased: true } });
      return { deck: rebuilt, metrics: nativeObjectMetrics(rebuilt), residual: { candidateObjects: 3, erasedObjects: 3 } };
    },
    rawImageQualityVerifier: async ({ deck }) => {
      if (deck.meta?.visualFallback) {
        fallbackAttempts += 1;
        if (deck.pages[0].images.some((image) => image.source?.erasedNativeShapes > 0)) throw new Error("enhanced fallback candidate failed quality");
        fallbackDeck = deck;
      }
      return deck.meta?.visualFallback
        ? { checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }], metrics: { "pixel-diff-ratio": 0.095, "foreground-missing-ratio": 0.03, "mean-absolute-delta": 8, "component-regions-attention": 12, "worst-component-normalized-severity": 2.1 } }
        : { passed: false, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }], metrics: { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.1, "mean-absolute-delta": 12 } };
    },
    objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async () => {} }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-native-fallback/" }, isCancellationRequested: async () => false });
    assert.equal(output.quality.passed, false);
    assert.equal(output.quality.metrics["native-shapes"], 2);
    assert.equal(output.quality.metrics["native-only-residual-policy-rejected"], 1);
    assert.equal(output.quality.metrics["native-only-residual-semantic-rejected"], undefined);
    assert.equal(output.quality.metrics["native-residual-primitives"], 0);
    assert.equal(output.quality.metrics["semantic-raster-derived-primitives"], 0);
    assert.equal(output.quality.metrics["editable-visible-text-fallback-accepted"], undefined);
    assert.equal(output.quality.metrics["editable-visible-text-fallback-native-lines-rejected"], 1);
    assert.equal(output.quality.metrics["editable-visible-text-fallback-native-lines-rejection-code"], 3);
    assert.equal(output.quality.metrics["editable-visible-text-fallback-enhanced-primitives"], undefined);
    assert.equal(output.quality.metrics["final-ocr-evidence-fit-accepted"], undefined);
    assert.equal(fallbackAttempts, 0);
    assert.equal(fallbackDeck, null);
    assert.equal(output.quality.checks.some((check) => check.name === "large-raster-editability" && check.passed === false), true);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker reports visual fallback rejection diagnostics when every candidate fails", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-fallback-rejections-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  let fallbackAttempts = 0;
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    builderArgs: [builderFile],
    rawImageOcr: async () => ({ lines: [{ text: "Editable text", box: { x: 8, y: 8, w: 100, h: 20 } }] }),
    rawImageRebuilder: async ({ metadata, ocr }) => {
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" });
      rebuilt.pages[0].shapes.push({ id: "native-card", type: "roundRect", box: { x: 4, y: 4, w: 120, h: 40 }, style: { fill: "#FFFFFF", stroke: "#3366FF", strokeWidthPt: 1 }, source: { editable: true, detector: "test-native-card" } });
      rebuilt.pages[0].images.push({ id: "residual", assetPath: "assets/source.png", box: { x: 0, y: 0, w: 960, h: 540 }, source: { editable: false, residualCrop: true, nativeObjectsErased: true } });
      return { deck: rebuilt, metrics: nativeObjectMetrics(rebuilt), residual: { candidateObjects: 2, erasedObjects: 2 } };
    },
    rawImageQualityVerifier: async ({ deck }) => {
      if (deck.meta?.visualFallback) fallbackAttempts += 1;
      if (!deck.meta?.visualFallback && largeRasterEditability(deck).passed) throw new Error("native-only candidate failed quality");
      return { checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }], metrics: { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.1, "mean-absolute-delta": 12 } };
    },
    objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async () => {} }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-fallback-rejections/" }, isCancellationRequested: async () => false });
    assert.equal(output.quality.passed, false);
    assert.equal(output.quality.metrics["native-only-residual-rejected"], 1);
    assert.equal(output.quality.metrics["native-only-residual-rejection-code"], 4);
    assert.equal(fallbackAttempts, 0);
    assert.equal(output.quality.metrics["editable-visible-text-fallback-native-lines-rejected"], 1);
    assert.equal(output.quality.metrics["editable-visible-text-fallback-native-lines-rejection-code"], 3);
    assert.equal(output.quality.metrics["editable-visible-text-fallback-native-erased-rejected"], 1);
    assert.equal(output.quality.metrics["editable-visible-text-fallback-native-erased-rejection-code"], 3);
    assert.equal(output.quality.metrics["editable-visible-text-fallback-solid-regions-rejected"], 1);
    assert.equal(output.quality.metrics["editable-visible-text-fallback-solid-regions-rejection-code"], 3);
    assert.equal(output.quality.metrics["editable-visible-text-fallback-conservative-rejected"], 1);
    assert.equal(output.quality.metrics["editable-visible-text-fallback-conservative-rejection-code"], 3);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("raw image Worker compares isolated OCR recovery against one OCR baseline", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-ocr-selection-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  try {
    for (const { candidateDiff, split, refineRejected = false } of [{ candidateDiff: 0.08, split: false }, { candidateDiff: 0.12, split: false }, { candidateDiff: 0.12, split: true }, { candidateDiff: 0.12, split: false, refineRejected: true }]) {
      let ocrCalls = 0;
      const modes = [];
      const handler = createImageToEditableArchiveHandler({
        temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
        rawImageOcr: async () => { ocrCalls += 1; return { lines: [{ text: "Editable text", box: { x: 8, y: 8, w: 100, h: 20 } }] }; },
        rawImageRebuilder: async ({ metadata, ocr, recoverOcrCropText, recoverOcrCropIds }) => {
          modes.push(!recoverOcrCropText ? "baseline" : recoverOcrCropIds?.[0] || "all");
          const deck = boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" });
          deck.pages[0].shapes.push({ id: "card", type: "rect", box: { x: 1, y: 1, w: 10, h: 10 }, fill: "#FFFFFF", source: { editable: true } });
          const cropIds = split ? ["crop-1", "crop-2"] : ["crop-1"];
          cropIds.forEach((id, index) => deck.pages[0].images.push({ id, assetPath: "assets/source.png", box: { x: index * 400, y: 0, w: index === 0 ? 320 : 300, h: 150 }, source: { editable: false, detector: "foreground-graphic-crop" } }));
          const recoveredIds = recoverOcrCropText ? cropIds.filter((id) => !recoverOcrCropIds || recoverOcrCropIds.includes(id)) : [];
          recoveredIds.forEach((id, index) => deck.pages[0].textBoxes.push({ ...deck.pages[0].textBoxes[0], id: `recovered-${id}`, box: { x: 20 + index * 400, y: 40, w: 100, h: 20 } }));
          return { deck, ocrCropRecovery: { sourceLines: 5, recovered: recoveredIds.length, cropsErased: recoveredIds.length } };
        },
        rawImageQualityVerifier: async ({ deck, collectRenderedPages }) => {
          collectRenderedPages?.(refineRejected ? ["rendered.png"] : []);
          const recoveredIds = deck.pages[0].textBoxes.map((item) => item.id).filter((id) => id.startsWith("recovered-"));
          const pixelDiff = deck.meta?.refinedRecovery ? 0.08 : recoveredIds.length === 0 ? 0.1 : split && recoveredIds.length === 1 && recoveredIds[0] === "recovered-crop-2" ? 0.08 : candidateDiff;
          return { checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: true }], metrics: { "pixel-diff-ratio": pixelDiff, "foreground-missing-ratio": 0.02, "mean-absolute-delta": 8 } };
        },
        ...(refineRejected ? { rawImageTextRefiner: async request => {
          assert.equal(request.acceptImprovedFailure, true);
          if (!request.root.includes(".ocr-recovery-candidate-")) return { accepted: false, changedTextBoxes: 0, skippedPixelBudget: 0 };
          const deck = structuredClone(request.deck);
          deck.meta = { ...deck.meta, refinedRecovery: true };
          const deckFile = path.join(request.root, "refined.json"), pptxFile = path.join(request.root, "refined.pptx");
          fs.writeFileSync(deckFile, JSON.stringify(deck));
          await request.buildCandidate({ deckFile, pptxFile });
          return { accepted: true, deck, deckFile, pptxFile, quality: await request.verifyCandidate({ deck, pptxFile }), changedTextBoxes: 1, skippedPixelBudget: 0 };
        } } : {}),
        objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async () => {} }
      });
      const result = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: `owners/a/jobs/ocr-${candidateDiff}-${split}-${refineRejected}/` }, isCancellationRequested: async () => false });
      assert.equal(ocrCalls, 1);
      assert.deepEqual(modes, candidateDiff === 0.08 ? ["baseline", "all"] : split ? ["baseline", "all", "crop-1", "crop-2"] : ["baseline", "all", "crop-1"]);
      assert.equal(result.quality.metrics["ocr-crop-lines-recovered"], candidateDiff === 0.08 || refineRejected ? 1 : Number(split));
      assert.equal(result.quality.metrics["pixel-diff-ratio"], candidateDiff === 0.08 || split || refineRejected ? 0.08 : 0.1);
    }
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker rebuilds an ordered raw-image batch into one page per source", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-batch-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const calls = [];
  const semanticResults = [];
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    rawImageOcr: async ({ pageIndex }) => { calls.push(`ocr-${pageIndex}`); return { lines: [] }; },
    rawImageRebuilder: async ({ metadata, pageIndex }) => {
      calls.push(`rebuild-${pageIndex}`);
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr: { lines: [] }, sourceImage: metadata.assetPath });
      rebuilt.pages[0].shapes.push({ id: `shape-${pageIndex}`, type: "roundRect", box: { x: 4, y: 4, w: 120, h: 40 }, fill: "#FFFFFF", source: { editable: true, pageImage: metadata.assetPath } });
      const semanticNative = Object.freeze({ matched: true, addedShapes: 1, connectors: 0 });
      rebuilt.meta = { ...(rebuilt.meta || {}), semanticNative };
      semanticResults.push(semanticNative);
      return { deck: rebuilt };
    },
    objectStore: { readObject: async () => archive([tarEntry("assets/source-001.png", source), tarEntry("assets/source-002.png", source)]), putObject: async () => {} }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/batch.tar.gz", outputPrefix: "owners/a/jobs/job-batch/" }, isCancellationRequested: async () => false });
    assert.deepEqual(calls, ["ocr-0", "rebuild-0", "ocr-1", "rebuild-1"]);
    assert.equal(output.quality.metrics.pages, 2);
    assert.equal(output.quality.metrics["native-shapes"], 2);
    assert.equal(output.quality.checks[0].name, "raw-image-batch-validated");
    assert.deepEqual(semanticResults, [{ matched: true, addedShapes: 1, connectors: 0 }, { matched: true, addedShapes: 1, connectors: 0 }]);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker normalizes a bounded document before native reconstruction", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-document-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const sourcePng = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
  const calls = [];
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    documentNormalizer: async ({ root, metadata }) => {
      calls.push(metadata.documentKind); const file = path.join(root, "assets", "source-001.png"); fs.writeFileSync(file, sourcePng);
      return { pages: 1, assets: 1, sources: [{ inputFile: file, assetPath: "assets/source-001.png", dimensions: { widthPx: 960, heightPx: 540 }, pageIndex: 0 }] };
    },
    rawImageOcr: async () => ({ lines: [] }),
    rawImageRebuilder: async ({ metadata }) => { const rebuilt = boundedOcrSourceDeck({ metadata, ocr: { lines: [] }, sourceImage: metadata.assetPath }); rebuilt.pages[0].shapes.push({ id: "document-shape", type: "roundRect", box: { x: 4, y: 4, w: 120, h: 40 }, fill: "#FFFFFF", source: { editable: true } }); return { deck: rebuilt }; },
    rawImageQualityVerifier: async () => ({ checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: true }], metrics: { "pixel-diff-ratio": 0.01 } }),
    objectStore: { readObject: async () => archive([tarEntry("assets/source.pdf", pdf)]), putObject: async () => {} }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/document.tar.gz", outputPrefix: "owners/a/jobs/job-document/" }, isCancellationRequested: async () => false });
    assert.deepEqual(calls, ["pdf"]); assert.equal(output.quality.passed, true); assert.equal(output.quality.metrics.pages, 1);
    assert.equal(output.quality.checks[0].name, "document-pages-normalized");
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker retains an OCR-only raw-image diagnostic artifact while failing graphical editability", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-overlay-only-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const uploads = new Map();
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    builderArgs: [builderFile],
    rawImageOcr: async () => ({ lines: [{ text: "overlay only", box: { x: 8, y: 8, w: 100, h: 20 } }] }),
    rawImageRebuilder: async ({ metadata, ocr }) => ({ deck: boundedOcrSourceDeck({ metadata, ocr, sourceImage: "assets/source.png" }) }),
    objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async ({ objectKey, body }) => uploads.set(objectKey, body) }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-raw/" }, isCancellationRequested: async () => false });
    assert.equal(output.quality.passed, false);
    assert.deepEqual(output.quality.checks.find((check) => check.name === "native-graphics-rebuilt"), { name: "native-graphics-rebuilt", passed: false });
    assert.equal(output.artifacts.length, 1);
    assert.ok(uploads.has("owners/a/jobs/job-raw/deck.pptx"));
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker routes admitted raw semantic fallback metadata to native rebuilding", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-semantic-fallback-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  let receivedFallback;
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    builderArgs: [builderFile],
    rawImageOcr: async () => ({ lines: [] }),
    rawImageRebuilder: async ({ metadata, ocr }) => {
      receivedFallback = metadata.semanticFallback;
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr, sourceImage: metadata.assetPath });
      rebuilt.pages[0].shapes.push({ id: "native-shape", type: "roundRect", box: { x: 4, y: 4, w: 120, h: 40 }, style: { fill: "#FFFFFF" }, source: { editable: true } });
      return { deck: rebuilt, nativeComponentQuality: { passed: true, metrics: { connectors: 0, minimumUnitCrops: 0, evidencedMinimumUnitCrops: 0, unverifiedMinimumUnitCrops: 0 } } };
    },
    objectStore: { readObject: async () => archive([
      tarEntry("assets/source.png", source),
      tarEntry("assets/semantic-fallback.json", JSON.stringify({ semanticFallback: { archetype: "process_flow", items: [{ title: "From archive" }] } }))
    ]), putObject: async () => {} }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-raw/" }, isCancellationRequested: async () => false });
    assert.equal(output.quality.checks.find((check) => check.name === "native-component-quality")?.passed, true);
    assert.equal(receivedFallback.archetype, "process_flow");
    assert.equal(receivedFallback.items[0].title, "From archive");
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker retains a batch diagnostic artifact when one page has no native graphics", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-batch-graphics-gate-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const uploads = new Map();
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile],
    rawImageOcr: async () => ({ lines: [] }),
    rawImageRebuilder: async ({ metadata, pageIndex }) => {
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr: { lines: [] }, sourceImage: metadata.assetPath });
      if (pageIndex === 1) rebuilt.pages[0].shapes.push({ id: "native-shape", type: "roundRect", box: { x: 4, y: 4, w: 120, h: 40 }, fill: "#FFFFFF", source: { editable: true } });
      return { deck: rebuilt, nativeComponentQuality: { passed: pageIndex === 1, metrics: { connectors: 0, minimumUnitCrops: 0, evidencedMinimumUnitCrops: 0, unverifiedMinimumUnitCrops: 0 } } };
    },
    objectStore: { readObject: async () => archive([tarEntry("assets/source-001.png", source), tarEntry("assets/source-002.png", source)]), putObject: async ({ objectKey, body }) => uploads.set(objectKey, body) }
  });
  try {
    const output = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/batch.tar.gz", outputPrefix: "owners/a/jobs/job-batch/" }, isCancellationRequested: async () => false });
    assert.equal(output.quality.passed, false);
    assert.equal(output.quality.metrics["native-shapes"], 1);
    assert.deepEqual(output.quality.checks.find((check) => check.name === "native-graphics-rebuilt"), { name: "native-graphics-rebuilt", passed: false });
    assert.deepEqual(output.quality.checks.find((check) => check.name === "native-component-quality"), { name: "native-component-quality", passed: false });
    assert.ok(uploads.has("owners/a/jobs/job-batch/deck.pptx"));
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("raw native rebuild adapter materializes a bounded work IR and requires graphical output", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-native-adapter-"));
  const source = path.join(temporaryRoot, "source.png");
  fs.copyFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"), source);
  let receivedWorkDir; let receivedOptions;
  const rebuild = createRawImageNativeRebuilder({ rebuildDeckFromWorkDir: (workDir, options) => {
    receivedWorkDir = workDir;
    receivedOptions = options;
    const sourceIr = JSON.parse(fs.readFileSync(path.join(workDir, "ir", "deck.json"), "utf8"));
    assert.equal(sourceIr.pages[0].sourceImage, "normalized/001.png");
    assert.ok(fs.existsSync(path.join(workDir, sourceIr.pages[0].sourceImage)));
    sourceIr.pages[0].shapes.push({ id: "native-line", type: "line", box: { x: 1, y: 1, w: 20, h: 0 }, source: { editable: true } });
    return sourceIr;
  } });
  try {
    const result = await rebuild({ root: temporaryRoot, metadata: { inputFile: source, assetPath: "assets/source.png", dimensions: { widthPx: 960, heightPx: 540 } }, ocr: { lines: [] }, isCancellationRequested: async () => false });
    assert.equal(result.metrics.shapes, 1);
    assert.equal(result.metrics.connectors, 1);
    assert.equal(result.reconstructionProfile, PRODUCTION_PROFILE_NAME);
    assert.equal(result.nativeComponentQuality.passed, true);
    assert.equal(result.deck.meta.nativeComponentQuality.passed, true);
    assert.equal(receivedOptions.reconstructionProfile, PRODUCTION_PROFILE_NAME);
    assert.equal(receivedOptions.vectorizeStatusIcons, false);
    assert.equal(receivedOptions.objectifyLayerConnectors, true);
    assert.equal(receivedOptions.objectifyStructuredVisualAtomText, true);
    assert.ok(fs.existsSync(path.join(receivedWorkDir, "normalized", "001.png")));
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
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

test("knowledge graph rebuild uses pre-crop OCR and removes crops that own native cards or routes", () => {
  const box = (text, x, y, w = 100, h = 24) => ({ id: `source-${text}`, text, box: { x, y, w, h }, font: { family: "Microsoft YaHei", sizePt: 16, opacity: 0 }, style: { visibility: "hidden", opacity: 0 } });
  const semanticTextBoxes = [
    box("动态本体：知识图谱升级", 190, 20, 520, 42),
    box("传统知识图谱问题", 60, 105, 180, 28), box("动态本体思路", 385, 105, 160, 28), box("本体生长能力", 710, 105, 160, 28),
    box("公安系统", 80, 260), box("监控系统", 200, 290), box("12345工单", 100, 380),
    box("翻译层", 430, 190, 60, 24), box("人员", 445, 285, 58, 37),
    box("高空抛物", 700, 190, 84, 25), box("工单文本\n视频数据", 700, 285, 84, 48), box("新型事件", 820, 285, 82, 30),
    box("可信连接层", 105, 560, 140, 31), box("动态本体层", 420, 560, 130, 31), box("智能体应用层", 730, 560, 145, 31),
    box("升级终点：感知→决策→行动→反馈", 288, 656, 384, 36)
  ];
  const page = {
    textBoxes: semanticTextBoxes.filter((item) => !/翻译层|工单文本/u.test(item.text)).map((item) => ({ ...item, font: { ...item.font, opacity: 1 }, style: { visibility: "visible", opacity: 1 } })),
    shapes: [],
    images: [
      { id: "mixed-translator-crop", box: { x: 338, y: 150, w: 194, h: 118 }, source: { strategy: "local-fidelity-crop" } },
      { id: "standalone-icon", box: { x: 526, y: 153, w: 70, h: 82 }, source: { strategy: "local-fidelity-crop" } },
      { id: "bottom-route-crop", box: { x: 145, y: 628, w: 120, h: 78 }, source: { strategy: "local-fidelity-crop" } }
    ]
  };
  const rebuilt = applyKnowledgeGraphPanelNativeRebuild(page, { widthPt: 960, heightPt: 720 }, { semanticTextBoxes, enableSemanticPictorialNative: true });
  assert.equal(rebuilt.matched, true);
  assert.equal(rebuilt.restoredTextBoxes, 2);
  assert.equal(rebuilt.removedCrops, 1);
  assert.deepEqual(page.images.map((item) => item.id), ["mixed-translator-crop", "standalone-icon"]);
  assert.ok(page.textBoxes.filter((item) => /翻译层|工单文本/u.test(item.text)).every((item) => item.style.visibility === "visible" && item.font.opacity === 1));
  assert.ok(page.shapes.some((item) => item.source?.detector === "team-knowledge-graph-feedback-left-up"));
  assert.ok(rebuilt.connectors >= 10);
  const pictorialCount = page.shapes.filter((item) => item.source?.semanticPictorialNative === true).length;
  const rerun = applyKnowledgeGraphPanelNativeRebuild(page, { widthPt: 960, heightPt: 720 }, { semanticTextBoxes, enableSemanticPictorialNative: true });
  assert.equal(rerun.matched, true);
  assert.equal(page.shapes.filter((item) => item.source?.detector === "team-knowledge-graph-panel-1").length, 1);
  assert.equal(page.shapes.filter((item) => item.source?.semanticPictorialNative === true).length, pictorialCount);
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

test("full-slide residual builder validates geometry and erases bounded text regions", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-full-residual-"));
  const source = path.join(temporaryRoot, "source.png");
  const output = path.join(temporaryRoot, "assets", "residual.png");
  writeThreeCardDiagram(source);
  try {
    const result = await createFullSlideResidual({
      sourceFile: source,
      outputFile: output,
      textBoxes: [{ box: { x: 120, y: 220, w: 100, h: 30 } }],
      slideSize: { x: 0, y: 0, w: 960, h: 540 },
      isCancellationRequested: async () => false
    });
    assert.equal(result.erasedTextBoxes, 1);
    assert.ok(fs.statSync(output).size > 24);
    await assert.rejects(() => createFullSlideResidual({
      sourceFile: source,
      outputFile: path.join(temporaryRoot, "bad.png"),
      textBoxes: [{ box: { x: 950, y: 530, w: 20, h: 20 } }],
      slideSize: { x: 0, y: 0, w: 960, h: 540 }
    }), /geometry/);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("full-slide residual builder erases native objects, bounds volume, and honors cancellation", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-full-residual-objects-"));
  const source = path.join(temporaryRoot, "source.png");
  writeThreeCardDiagram(source);
  try {
    const objects = [
      { type: "roundRect", box: { x: 80, y: 200, w: 200, h: 100 } },
      { type: "line", box: { x: 280, y: 250, w: 100, h: 0 } }
    ];
    const result = await createFullSlideResidual({ sourceFile: source, outputFile: path.join(temporaryRoot, "objects.png"), objects, slideSize: { x: 0, y: 0, w: 960, h: 540 } });
    assert.equal(result.erasedObjects, 2);
    assert.equal(result.erasedTextBoxes, 0);
    const reverse = await createFullSlideResidual({ sourceFile: source, outputFile: path.join(temporaryRoot, "reverse.png"), objects: [{ type: "line", box: { x: 700, y: 400, w: -300, h: -100 } }], slideSize: { x: 0, y: 0, w: 960, h: 540 } });
    assert.equal(reverse.erasedObjects, 1);
    await assert.rejects(() => createFullSlideResidual({ sourceFile: source, outputFile: path.join(temporaryRoot, "reverse-outside.png"), objects: [{ type: "line", box: { x: 100, y: 100, w: -200, h: 0 } }], slideSize: { x: 0, y: 0, w: 960, h: 540 } }), /geometry/);
    await assert.rejects(() => createFullSlideResidual({ sourceFile: source, outputFile: path.join(temporaryRoot, "outside.png"), objects: [{ type: "roundRect", box: { x: 950, y: 530, w: 20, h: 20 } }], slideSize: { x: 0, y: 0, w: 960, h: 540 } }), /geometry/);
    await assert.rejects(() => createFullSlideResidual({ sourceFile: source, outputFile: path.join(temporaryRoot, "extreme.png"), objects: Array.from({ length: 30001 }, () => objects[0]), slideSize: { x: 0, y: 0, w: 960, h: 540 } }), /request/);
    await assert.rejects(() => createFullSlideResidual({ sourceFile: source, outputFile: path.join(temporaryRoot, "cancelled.png"), objects: [], slideSize: { x: 0, y: 0, w: 960, h: 540 }, isCancellationRequested: async () => true }), /cancelled/);
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

test("team image worker gates every raw page on the shared production reconstruction profile", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-production-profile-"));
  const builderFile = path.join(temporaryRoot, "builder.js");
  fs.writeFileSync(builderFile, minimalPptxBuilderSource(), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  let profile = PRODUCTION_PROFILE_NAME;
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot, builderExecutable: process.execPath, builderArgs: [builderFile], requiredReconstructionProfile: PRODUCTION_PROFILE_NAME,
    rawImageOcr: async () => ({ lines: [] }),
    rawImageRebuilder: async ({ metadata, pageIndex }) => {
      const rebuilt = boundedOcrSourceDeck({ metadata, ocr: { lines: [] }, sourceImage: metadata.assetPath });
      rebuilt.pages[0].shapes.push({ id: "native-card", type: "roundRect", box: { x: 4, y: 4, w: 120, h: 40 }, source: { editable: true } });
      return { deck: rebuilt, reconstructionProfile: profile === "mixed" ? (pageIndex === 0 ? PRODUCTION_PROFILE_NAME : null) : profile };
    },
    rawImageQualityVerifier: async () => ({ checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: true }], metrics: { "pixel-diff-ratio": 0.01 } }),
    objectStore: { readObject: async () => archive([tarEntry("assets/source-001.png", source), tarEntry("assets/source-002.png", source)]), putObject: async () => {} }
  });
  try {
    const aligned = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/aligned.tar.gz", outputPrefix: "owners/a/jobs/aligned/" }, isCancellationRequested: async () => false });
    assert.equal(aligned.quality.checks.find((check) => check.name === "local-production-profile-aligned").passed, true);
    assert.equal(aligned.quality.metrics["production-profile-aligned"], 1);
    profile = "mixed";
    const mixed = await handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/mixed.tar.gz", outputPrefix: "owners/a/jobs/mixed/" }, isCancellationRequested: async () => false });
    assert.equal(mixed.quality.passed, false);
    assert.equal(mixed.quality.checks.find((check) => check.name === "local-production-profile-aligned").passed, false);
    assert.equal(mixed.quality.metrics["production-profile-aligned"], 0);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker refuses raw images when its pinned OCR profile is not configured", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-image-raw-disabled-"));
  const source = fs.readFileSync(path.join(__dirname, "..", "skills", "pd-hifi-slideclone", "examples", "ocr-text-smoke.source.png"));
  const handler = createImageToEditableArchiveHandler({
    temporaryRoot,
    builderExecutable: process.execPath,
    objectStore: { readObject: async () => archive([tarEntry("assets/source.png", source)]), putObject: async () => assert.fail("must not upload") }
  });
  try {
    await assert.rejects(() => handler({ job: { capability: "image-to-editable", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-raw/" }, isCancellationRequested: async () => false }), error => error.code === "IMAGE_OCR_NOT_CONFIGURED");
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team image worker configuration only permits its dedicated capability and a real builder", () => {
  assert.equal(workerSettings({ OPENXML_BUILDER_EXE: process.execPath }).builderExecutable, process.execPath);
  assert.equal(workerSettings({ OPENXML_BUILDER_EXE: process.execPath }).rawImageOcrProfile.enabled, false);
  assert.deepEqual(workerSettings({ OPENXML_BUILDER_EXE: process.execPath, COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE: PROFILE_NAME, COMMON_TOOLS_IMAGE_RAW_OCR_EXECUTABLE: process.execPath, COMMON_TOOLS_IMAGE_RAW_OCR_SHA256: sha256File(process.execPath), COMMON_TOOLS_IMAGE_RAW_OCR_LANGUAGES: "eng" }).rawImageOcrProfile.languages, ["eng"]);
  assert.throws(() => workerSettings({ COMMON_TOOLS_WORKER_CAPABILITIES: "project-audit" }), /only image-to-editable/);
  assert.throws(() => workerSettings({ OPENXML_BUILDER_EXE: "/not/a/builder" }), /unavailable/);
  assert.throws(() => workerSettings({ OPENXML_BUILDER_EXE: process.execPath, COMMON_TOOLS_IMAGE_RAW_OCR_EXECUTABLE: process.execPath }), /require COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE/);
  assert.throws(() => workerSettings({ OPENXML_BUILDER_EXE: process.execPath, COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE: PADDLE_PROFILE_NAME }), /PADDLEOCR_MODEL_CACHE/);
});

test("team image worker startup diagnostics classify errors without exposing their text", () => {
  assert.equal(startupFailureCode(new Error("OPENXML_BUILDER_EXE is unavailable")), "invalid-builder");
  assert.equal(startupFailureCode(new Error("raw image OCR language pack is unavailable")), "invalid-raw-ocr-profile");
  assert.equal(startupFailureCode(new Error("COMMON_TOOLS_WORKER_ID is invalid")), "invalid-configuration");
  assert.equal(startupFailureCode(new Error("redis password=sensitive")), "provider-initialization");
});

test("image Worker Docker context contains only runtime sources and OpenXML builder inputs", () => {
  const root = path.resolve(__dirname, "..");
  const dockerfile = fs.readFileSync(path.join(root, "deploy", "docker", "Dockerfile.image-to-editable"), "utf8");
  const ignore = fs.readFileSync(path.join(root, "deploy", "docker", "Dockerfile.image-to-editable.dockerignore"), "utf8");
  assert.match(dockerfile, /COPY packages\/slideclone-native-engine\/dotnet\/OpenXmlDeckBuilder \.\/OpenXmlDeckBuilder/);
  assert.match(dockerfile, /COPY packages \.\/packages/);
  assert.doesNotMatch(dockerfile, /COPY skills\/pd-hifi-slideclone\/scripts\/rebuild-real-pptx-native\.js/);
  assert.doesNotMatch(dockerfile, /COPY skills\/pd-hifi-slideclone\/scripts\/lib\b/);
  assert.match(dockerfile, /apt-get install --yes --no-install-recommends libicu72 libssl3 libreoffice-impress poppler-utils fonts-noto-cjk fonts-liberation/);
  assert.doesNotMatch(ignore, /^!runtime\/slideclone-native-engine\/\*\*$/m);
  assert.doesNotMatch(dockerfile, /COPY skills\/pd-hifi-slideclone \.\/skills\/pd-hifi-slideclone/);
  assert.match(ignore, /^\*\*$/m);
  assert.match(ignore, /^!packages\/\*\*$/m);
  assert.match(ignore, /^!packages\/slideclone-native-engine\/\*\*$/m);
  assert.doesNotMatch(ignore, /^!skills\/pd-hifi-slideclone\/scripts\/rebuild-real-pptx-native\.js$/m);
  assert.doesNotMatch(ignore, /^!skills\/pd-hifi-slideclone\/scripts\/lib\/\*\*$/m);
});

test("optional team OCR Docker profile is separate, version-bounded, and never part of the default Compose file", () => {
  const root = path.resolve(__dirname, "..");
  const ocrDockerfile = fs.readFileSync(path.join(root, "deploy", "docker", "Dockerfile.image-to-editable-ocr"), "utf8");
  const ocrCompose = fs.readFileSync(path.join(root, "deploy", "compose.team-image-ocr.yaml"), "utf8");
  const defaultCompose = fs.readFileSync(path.join(root, "deploy", "compose.team-api.yaml"), "utf8");
  assert.match(ocrDockerfile, /^ARG BASE_IMAGE=common-tools-image-to-editable:local/m);
  assert.match(ocrDockerfile, /tesseract-ocr=\$\{TESSERACT_VERSION\}/);
  assert.match(ocrDockerfile, /tesseract-ocr-eng=\$\{TESSERACT_LANGUAGE_VERSION\}/);
  assert.match(ocrDockerfile, /tesseract-ocr-chi-sim=\$\{TESSERACT_LANGUAGE_VERSION\}/);
  assert.match(ocrDockerfile, /COPY --chown=worker:worker packages \.\/packages/);
  assert.match(ocrCompose, /COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE/);
  assert.match(ocrCompose, /COMMON_TOOLS_IMAGE_OCR_IMAGE:-common-tools-image-to-editable-ocr:local/);
  assert.doesNotMatch(defaultCompose, /COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE/);
});

test("PaddleOCR team image pins the runtime and remains an explicit deployment overlay", () => {
  const root = path.resolve(__dirname, "..");
  const dockerfile = fs.readFileSync(path.join(root, "deploy", "docker", "Dockerfile.image-to-editable-paddleocr"), "utf8");
  const compose = fs.readFileSync(path.join(root, "deploy", "compose.team-image-paddleocr.yaml"), "utf8");
  const ignore = fs.readFileSync(path.join(root, "deploy", "docker", "Dockerfile.image-to-editable-paddleocr.dockerignore"), "utf8");
  const requirements = fs.readFileSync(path.join(root, "scripts", "paddleocr-requirements.lock.txt"), "utf8");
  assert.match(requirements, /^paddleocr==3\.7\.0$/m);
  assert.match(requirements, /^paddlepaddle==3\.3\.1$/m);
  assert.match(dockerfile, /paddleocr-requirements\.lock\.txt/);
  assert.match(dockerfile, /COPY packages\/slideclone-native-engine\/scripts\/python\/paddleocr_worker\.py \/opt\/paddleocr\/paddleocr_worker\.py/);
  assert.match(dockerfile, /COPY packages\/slideclone-native-engine\/scripts\/adapters\/ocr-paddleocr-local\.js \/opt\/paddleocr\/skill\/scripts\/adapters\/ocr-paddleocr-local\.js/);
  assert.match(dockerfile, /PP-OCRv6_small_det/);
  assert.match(dockerfile, /PP-OCRv6_small_rec/);
  assert.match(dockerfile, /image_to_png\.py/);
  assert.match(dockerfile, /COPY --chown=worker:worker packages \.\/packages/);
  assert.doesNotMatch(dockerfile, /COPY skills\/pd-hifi-slideclone\/scripts\//);
  assert.doesNotMatch(dockerfile, /skills\/pd-hifi-slideclone\/scripts\/rebuild-real-pptx-native\.js/);
  assert.match(ignore, /^!packages\/slideclone-native-engine\/scripts\/python\/image_to_png\.py$/m);
  assert.doesNotMatch(ignore, /^!skills\/pd-hifi-slideclone\/scripts\//m);
  assert.doesNotMatch(ignore, /^!runtime\/slideclone-native-engine\/\*\*$/m);
  assert.doesNotMatch(ignore, /^!skills\/pd-hifi-slideclone\/scripts\/rebuild-real-pptx-native\.js$/m);
  assert.match(dockerfile, /--engine paddle_dynamic/);
  assert.match(compose, /paddleocr-ppocrv6-v1/);
  assert.match(compose, /COMMON_TOOLS_IMAGE_PADDLEOCR_WORKER_SHA256/);
  assert.match(compose, /COMMON_TOOLS_IMAGE_PADDLEOCR_PROTOCOL_SHA256/);
  assert.match(compose, /COMMON_TOOLS_IMAGE_PADDLEOCR_IMAGE_NORMALIZER_SHA256/);
  assert.match(compose, /COMMON_TOOLS_IMAGE_PADDLEOCR_IMAGE:-common-tools-image-to-editable-paddleocr:local/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "deploy", "compose.team-api.yaml"), "utf8"), /PADDLEOCR/);
});

test("offline PaddleOCR refresh changes only Worker code and supports a prebuilt deployment", () => {
  const root = path.resolve(__dirname, "..");
  const dockerfile = fs.readFileSync(path.join(root, "deploy/docker/Dockerfile.image-to-editable-paddleocr-offline"), "utf8");
  const deploy = fs.readFileSync(path.join(root, "scripts/team-runtime-local-deploy.ps1"), "utf8");
  assert.match(dockerfile, /^ARG BASE_IMAGE=common-tools-image-to-editable-paddleocr:local\s+FROM \$\{BASE_IMAGE\}\s+COPY --chown=worker:worker packages \.\/packages/u);
  assert.match(dockerfile, /ENV OPENXML_BUILDER_EXE=\/opt\/openxml\/OpenXmlDeckBuilder/u);
  assert.match(dockerfile, /OpenXmlDeckBuilder\/bin\/Debug\/net8\.0\/OpenXmlDeckBuilder\.dll/u);
  assert.doesNotMatch(dockerfile, /ADD|https?:/u);
  assert.match(deploy, /\$buildMode = if \(\$SkipRawImageOcrBuild\) \{ '--no-build' \} else \{ '--build' \}/u);
  assert.match(deploy, /SetEnvironmentVariable\('COMMON_TOOLS_IMAGE_PADDLEOCR_IMAGE', \$resolvedRawImageOcrImage/u);
  assert.match(deploy, /SetEnvironmentVariable\('COMMON_TOOLS_IMAGE_OCR_IMAGE', \$resolvedRawImageOcrImage/u);
});

test("PaddleOCR Docker adapter loads using only its declared image COPY dependencies", () => {
  const root = path.resolve(__dirname, "..");
  const dockerfile = fs.readFileSync(path.join(root, "deploy/docker/Dockerfile.image-to-editable-paddleocr"), "utf8");
  const directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "paddle-image-import-"));
  try {
    for (const match of dockerfile.matchAll(/^COPY (\S+) \/opt\/paddleocr\/skill\/(\S+)$/gm)) {
      const target = path.resolve(directory, match[2]);
      assert.equal(path.relative(directory, target).startsWith(".."), false);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.resolve(root, match[1]), target);
    }
    const imageAdapter = require(path.join(directory, "scripts/adapters/ocr-paddleocr-local.js"));
    assert.equal(typeof imageAdapter, "function");
    assert.equal(typeof imageAdapter.closeActiveEngineAndWait, "function");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("local deployment script keeps raw OCR opt-in and Plan mode non-mutating", () => {
  const deployScript = fs.readFileSync(path.join(path.resolve(__dirname, ".."), "scripts", "team-runtime-local-deploy.ps1"), "utf8");
  assert.match(deployScript, /\[switch\]\$EnableRawImageOcr/);
  assert.match(deployScript, /\[string\]\$RawImageOcrProvider = 'PaddleOCR'/);
  assert.match(deployScript, /if \(\$Mode -eq 'Apply' -and -not \$SkipRawImageOcrBuild\) \{ Invoke-RawImageOcrImageBuild \}/);
  assert.match(deployScript, /'deploy\/compose\.team-image-paddleocr\.yaml'/);
  assert.match(deployScript, /'deploy\/compose\.team-image-ocr\.yaml'/);
  assert.match(deployScript, /COMMON_TOOLS_IMAGE_PADDLEOCR_ADAPTER/);
  assert.match(deployScript, /\/opt\/paddleocr\/paddleocr_worker\.py/);
  assert.match(deployScript, /COMMON_TOOLS_IMAGE_PADDLEOCR_HEALTHCHECK_SHA256/);
  assert.equal((deployScript.match(/\.Replace\("`r`n", "`n"\)\.Replace\("`r", "`n"\)/g) || []).length, 2);
  assert.match(deployScript, /deployment = 'No containers or images were changed\.'/);
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


test("Deck IR validates declared reconstruction contracts using the shared policy", () => {
  const { validateDeckIr } = require("../packages/slideclone-worker-adapter/team-worker");
  const { enrichReconstructionContracts } = require("../packages/slideclone-core/reconstruction-contract");
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
  assert.equal(require("../skills/pd-hifi-slideclone/scripts/lib/reconstruction-contract"), require("../packages/slideclone-core/reconstruction-contract"));
  assert.equal(require("../skills/pd-hifi-slideclone/scripts/lib/reconstruction-quality-budget"), require("../packages/slideclone-core/reconstruction-quality-budget"));
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


test("Deck IR validates font and text run types while preserving nullable style defaults", () => {
  const { validateDeckIr } = require("../packages/slideclone-worker-adapter/team-worker");
  const admit = (patch) => validateDeckIr(deck({ pages: [{ textBoxes: [{ text: "Text", box: { x: 0, y: 0, w: 100, h: 30 }, ...patch }] }] }), os.tmpdir());
  assert.equal(admit({ font: { family: "Arial", sizePt: 20, opacity: 0.5, weight: "bold" }, wrap: false, rotation: 15, runs: [{ text: "", font: null }, { text: "你好", font: { sizePt: null } }] }).pages, 1);
  assert.equal(admit({ font: null, runs: null, rotation: null, wrap: null }).pages, 1);
  for (const patch of [{ id: 1 }, { font: "Arial" }, { font: [] }, { font: { sizePt: "20" } }, { font: { weight: 700 } }, { font: { SizePt: 20 } }, { wrap: "false" }, { rotation: "15" }, { runs: {} }, { runs: [null] }, { runs: [{ text: 3 }] }, { runs: [{ font: { family: false } }] }, { runs: [{ Text: "alias" }] }]) assert.throws(() => admit(patch), /editable deck/);
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
