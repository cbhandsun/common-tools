"use strict";
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { writePng } = require("../packages/slideclone-core/png");
const { addLowContrastFooterNativeMarks, boundedOcrSourceDeck, correctContextualOcrLines, createRawImageNativeRebuilder, largeRasterEditability, nativeObjectMetrics, residualEraseObjects, shouldOmitFullSlideResidual, writeTextErasedVisualFallbackAsset } = require("../packages/slideclone-core/team-native-rebuild");
const assert = require("node:assert/strict");
const { addNativeResidualPrimitives, changedComponentKeysFromFit, compactDeckFinalQualitySourceProvenance, compactDeckLateShapeSourceBudgetProvenance, compactDeckLateTextSourceBudgetProvenance, compactDeckNativeShapeSourceProvenance, createImageToEditableArchiveHandler, finalRefinementQualityAcceptable, fitDeckEditableTextFontFamily, fitDeckLightCardGeometry, fitDeckLightCardSideAccents, fitDeckLightCardSourceStrokes, fitDeckLightCardStrokeColors, fitDeckLightCardStrokes, fitDeckLowContrastFooterMarks, fitDeckLowContrastFooterPrimitives, fitDeckLowSaturationPanelFills, fitDeckMissingNativeVisualAtomShapes, fitDeckNativeShapeThinStrokes, fitDeckOcrEvidenceToSource, fitDeckSaturatedColorPanels, fitDeckSourceVerticalLines, fitDeckTextFidelityPrimitives, fitDeckWorstComponentFidelityPrimitives, fitDeckWorstConnectorStyles, fitDeckWorstRichOcrTextLayout, fitDeckWorstTextArrowGlyphs, fitDeckWorstTextBoxNudge, fitDeckWorstTextColors, fitDeckWorstTextComposite, fitDeckWorstTextInkBoxes, fitDeckWorstTextScale, fitDeckWorstTextWeight, focusedCandidateLimits, focusedLightCardStrokeWidthCandidates, isReliableMissingNativeVisualAtom, lightCardSourceStrokeQualityAcceptable, missingNativeTargetInkRunShapes, nativeOnlyMissingNativeLinesDoesNotRegress, nativeOnlyRefinementDoesNotMateriallyRegress, nativeOnlyResidualQualityAcceptable, removeFullSlideResidualImages, replacePictorialIconCropsWithNativeShapes, residualDeduplicationStatus, targetComponentQualityImproves, targetMissingNativeComponentQualityImproves, tryBuildFinalLineTextCoveredCropDropCandidate, tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate, tryBuildNativeOnlyPictorialIconCandidate, tryBuildNativeOnlyRichOcrTextLayoutCandidate, validateDeckIr, worstTextBoxNudgeCandidates, worstTextCompositeScaleCandidates } = require("../packages/slideclone-worker-adapter/team-worker");
const { addKnowledgeGraphPictorialConnectors, applyKnowledgeGraphPanelNativeRebuild, findKnowledgeGraphPanelModel } = require("../packages/slideclone-core/archetypes/knowledge-graph-native");
const { createFullSlideResidual, deck, lineTextCoveredCropDeck, writeMinimalPptx, writeThreeCardDiagram } = require('./helpers/image-team-worker.cjs');

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

test("early worst text composite candidates stay focused on useful nudge directions", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();
  assert.match(source, /function earlyWorstTextCompositeNudgeCandidates\(\) \{\s+return \[0\.35, -0\.35\];\s+\}/u);
});

test("native-only residual gap blocks native-only text refinement from reopening late text candidates", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();
  assert.match(source, /visualQuality = blockLateVisualRefinementForNativeOnlyResidualGap\(visualQuality\);[\s\S]+if \(rawImageTextRefiner && nativeOnlyCandidate\.renderedImages\?\.length && shouldTryFinalWorstTextRefinement\(visualQuality\)\)/u);
  assert.match(source, /visualQuality = blockLateVisualRefinementForNativeOnlyResidualGap\(refined\.quality\);/u);
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

test("native-only pre-policy text refinement can run while missing geometry remains worst", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();
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

test("accepted raw image text refinement updates the verification deck", () => {
  const source = require("./helpers/worker-implementation-source.cjs").readWorkerImplementation();
  const firstRefinement = source.indexOf("if (raw && rawImageQualityVerifier && rawImageTextRefiner && renderedImages.length");
  assert.notEqual(firstRefinement, -1);
  const acceptedBranch = source.indexOf("if (refined.accepted) {", firstRefinement);
  assert.notEqual(acceptedBranch, -1);
  const branchEnd = source.indexOf("visualQuality = { ...visualQuality", acceptedBranch);
  assert.notEqual(branchEnd, -1);
  const branch = source.slice(acceptedBranch, branchEnd);
  assert.match(branch, /metadata\.generatedDeck = refined\.deck; metadata\.deckFile = refined\.deckFile; outputFile = refined\.pptxFile; verificationDeck = refined\.deck; visualQuality = refined\.quality;/u);
});

test("contextual OCR correction only repairs AI Agent when the page contains canonical evidence", () => {
  assert.equal(correctContextualOcrLines([{ text: "Al Agent" }, { text: "AIAgent pipeline" }])[0].text, "AI Agent");
  assert.equal(correctContextualOcrLines([{ text: "Al Agent" }, { text: "Al Smith" }])[0].text, "Al Agent");
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

test("Deck IR validates font and text run types while preserving nullable style defaults", () => {
  const { validateDeckIr } = require("../packages/slideclone-worker-adapter/team-worker");
  const admit = (patch) => validateDeckIr(deck({ pages: [{ textBoxes: [{ text: "Text", box: { x: 0, y: 0, w: 100, h: 30 }, ...patch }] }] }), os.tmpdir());
  assert.equal(admit({ font: { family: "Arial", sizePt: 20, opacity: 0.5, weight: "bold" }, wrap: false, rotation: 15, runs: [{ text: "", font: null }, { text: "你好", font: { sizePt: null } }] }).pages, 1);
  assert.equal(admit({ font: null, runs: null, rotation: null, wrap: null }).pages, 1);
  for (const patch of [{ id: 1 }, { font: "Arial" }, { font: [] }, { font: { sizePt: "20" } }, { font: { weight: 700 } }, { font: { SizePt: 20 } }, { wrap: "false" }, { rotation: "15" }, { runs: {} }, { runs: [null] }, { runs: [{ text: 3 }] }, { runs: [{ font: { family: false } }] }, { runs: [{ Text: "alias" }] }]) assert.throws(() => admit(patch), /editable deck/);
});
