"use strict";
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { addNativeResidualPrimitives, changedComponentKeysFromFit, compactDeckFinalQualitySourceProvenance, compactDeckLateShapeSourceBudgetProvenance, compactDeckLateTextSourceBudgetProvenance, compactDeckNativeShapeSourceProvenance, createImageToEditableArchiveHandler, finalRefinementQualityAcceptable, fitDeckEditableTextFontFamily, fitDeckLightCardGeometry, fitDeckLightCardSideAccents, fitDeckLightCardSourceStrokes, fitDeckLightCardStrokeColors, fitDeckLightCardStrokes, fitDeckLowContrastFooterMarks, fitDeckLowContrastFooterPrimitives, fitDeckLowSaturationPanelFills, fitDeckMissingNativeVisualAtomShapes, fitDeckNativeShapeThinStrokes, fitDeckOcrEvidenceToSource, fitDeckSaturatedColorPanels, fitDeckSourceVerticalLines, fitDeckTextFidelityPrimitives, fitDeckWorstComponentFidelityPrimitives, fitDeckWorstConnectorStyles, fitDeckWorstRichOcrTextLayout, fitDeckWorstTextArrowGlyphs, fitDeckWorstTextBoxNudge, fitDeckWorstTextColors, fitDeckWorstTextComposite, fitDeckWorstTextInkBoxes, fitDeckWorstTextScale, fitDeckWorstTextWeight, focusedCandidateLimits, focusedLightCardStrokeWidthCandidates, isReliableMissingNativeVisualAtom, lightCardSourceStrokeQualityAcceptable, missingNativeTargetInkRunShapes, nativeOnlyMissingNativeLinesDoesNotRegress, nativeOnlyRefinementDoesNotMateriallyRegress, nativeOnlyResidualQualityAcceptable, removeFullSlideResidualImages, replacePictorialIconCropsWithNativeShapes, residualDeduplicationStatus, targetComponentQualityImproves, targetMissingNativeComponentQualityImproves, tryBuildFinalLineTextCoveredCropDropCandidate, tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate, tryBuildNativeOnlyPictorialIconCandidate, tryBuildNativeOnlyRichOcrTextLayoutCandidate, validateDeckIr, worstTextBoxNudgeCandidates, worstTextCompositeScaleCandidates } = require("../packages/slideclone-worker-adapter/team-worker");
const { addLowContrastFooterNativeMarks, boundedOcrSourceDeck, correctContextualOcrLines, createRawImageNativeRebuilder, largeRasterEditability, nativeObjectMetrics, residualEraseObjects, shouldOmitFullSlideResidual, writeTextErasedVisualFallbackAsset } = require("../packages/slideclone-core/team-native-rebuild");
const assert = require("node:assert/strict");
const { writePng } = require("../packages/slideclone-core/png");
const { PRODUCTION_PROFILE_NAME } = require("../packages/slideclone-core/native-rebuild-profile");
const { createNativeRebuilder, startupFailureCode, workerSettings } = require("../packages/remote-mcp-server/bin/common-tools-team-image-worker");
const { PROFILE_NAME, sha256File } = require("../packages/slideclone-core/ocr/team-ocr-profile");
const { PROFILE_NAME: PADDLE_PROFILE_NAME } = require("../packages/slideclone-core/ocr/team-paddleocr-profile");
const { archive, assertMinimalPptxBuffer, createFullSlideResidual, deck, delayedMinimalPptxBuilderSource, minimalPptxBuilderSource, tarEntry, writeThreeCardDiagram } = require('./helpers/image-team-worker.cjs');

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

test("raw image Worker skips text refinement for catastrophically regressed OCR recovery candidates", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();
  const rejectedRecovery = source.indexOf("if (bestRejectedRecovery && metadata.ocrCropRecovery?.recovered === 0 && rawImageTextRefiner");
  assert.notEqual(rejectedRecovery, -1);
  const refinerCall = source.indexOf("rawImageTextRefiner({", rejectedRecovery);
  assert.notEqual(refinerCall, -1);
  const guardedBlock = source.slice(rejectedRecovery, refinerCall);
  assert.match(guardedBlock, /!shouldStopOcrRecoverySearch\(\{\s*baselineQuality:\s*visualQuality,\s*candidateQuality:\s*bestRejectedRecovery\.quality\s*\}\)/u);
});

test("image Worker searches smaller primitive budgets while preserving the semantic publication rejection", async (t) => {
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

  assert.equal(result.quality.passed, false);
  assert.ok(result.quality.checks.some(check => check.name === "visual-fidelity" && check.passed));
  assert.ok(result.quality.checks.some(check => check.name === "semantic-editability" && !check.passed));
  assert.equal(result.quality.metrics["semantic-raster-derived-primitives"], 800);
  const firstOversizedAttempt = primitiveAttempts.indexOf(1000);
  const acceptedAttempt = primitiveAttempts.indexOf(800);
  assert.notEqual(firstOversizedAttempt, -1);
  assert.notEqual(acceptedAttempt, -1);
  assert.equal(acceptedAttempt > firstOversizedAttempt, true);
  assert.equal(result.quality.metrics["final-text-fidelity-primitives-accepted"], 1);
  assert.equal(result.quality.metrics["final-text-fidelity-primitives-shapes"], 800);
  assertMinimalPptxBuffer(uploaded.at(-1));
});

test("image Worker reruns text fidelity primitives after component repair without bypassing semantic publication", async (t) => {
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

  assert.equal(result.quality.passed, false);
  assert.ok(result.quality.checks.some(check => check.name === "visual-fidelity" && check.passed));
  assert.ok(result.quality.checks.some(check => check.name === "semantic-editability" && !check.passed));
  assert.equal(result.quality.metrics["semantic-raster-derived-primitives"], 2);
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

test("team image worker validates the optional render quality dependency at composition time", () => {
  assert.throws(() => createImageToEditableArchiveHandler({
    temporaryRoot: path.resolve(os.tmpdir()),
    rawImageQualityVerifier: {},
    objectStore: { readObject: async () => Buffer.alloc(0), putObject: async () => {} }
  }), /rawImageQualityVerifier/);
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
 const registry=require('../packages/slideclone-core/typography/source-word-layout-registry');let observed=0;
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
  assert.match(dockerfile, /apt-get install --yes --no-install-recommends libicu72 libssl3 libreoffice-impress python3-uno poppler-utils fonts-noto-cjk fonts-liberation/);
  assert.match(dockerfile, /ENV LIBREOFFICE_PYTHON_BIN=\/usr\/bin\/python3/);
  assert.doesNotMatch(ignore, /^!runtime\/slideclone-native-engine\/\*\*$/m);
  assert.doesNotMatch(dockerfile, /COPY skills\/pd-hifi-slideclone \.\/skills\/pd-hifi-slideclone/);
  assert.match(ignore, /^\*\*$/m);
  assert.match(ignore, /^!packages\/\*\*$/m);
  assert.match(ignore, /^!packages\/slideclone-native-engine\/\*\*$/m);
  assert.doesNotMatch(ignore, /^!skills\/pd-hifi-slideclone\/scripts\/rebuild-real-pptx-native\.js$/m);
  assert.doesNotMatch(ignore, /^!skills\/pd-hifi-slideclone\/scripts\/lib\/\*\*$/m);
});

test("offline PaddleOCR refresh rebuilds package code and supports a prebuilt deployment", () => {
  const root = path.resolve(__dirname, "..");
  const dockerfile = fs.readFileSync(path.join(root, "deploy/docker/Dockerfile.image-to-editable-paddleocr-offline"), "utf8");
  const deploy = fs.readFileSync(path.join(root, "scripts/team-runtime-local-deploy.ps1"), "utf8");
  assert.match(dockerfile, /^ARG BASE_IMAGE=common-tools-image-to-editable-paddleocr:local\s+FROM mcr\.microsoft\.com\/dotnet\/sdk:8\.0-bookworm-slim AS openxml-builder/u);
  assert.match(dockerfile, /FROM \$\{BASE_IMAGE\}[\s\S]*COPY --chown=worker:worker packages \.\/packages/u);
  assert.match(dockerfile, /ENV OPENXML_BUILDER_EXE=\/opt\/openxml\/OpenXmlDeckBuilder/u);
  assert.match(dockerfile, /COPY --from=openxml-builder --chown=worker:worker \/opt\/openxml \/opt\/openxml/u);
  assert.doesNotMatch(dockerfile, /OpenXmlDeckBuilder\/bin\/Debug\//u);
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
