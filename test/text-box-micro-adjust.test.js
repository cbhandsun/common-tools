"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { writePng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");
const {
  applyTextBoxSuggestionSet,
  applyTextBoxEvidenceFit,
  fitHighConfidenceSingleLineOcrToEvidence,
  suggestTextBoxMicroAdjustments,
  applyTextBoxMicroAdjustments
} = require("../skills/pd-hifi-slideclone/scripts/lib/text-box-micro-adjust");

test("suggestTextBoxMicroAdjustments nudges box position and font size from crop mismatch", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-text-adjust-"));
  const sourceCropImage = path.join(tempDir, "source.png");
  const renderedCropImage = path.join(tempDir, "rendered.png");
  writePng(sourceCropImage, makeInkImage(120, 40, { x: 44, y: 14, w: 34, h: 12 }));
  writePng(renderedCropImage, makeInkImage(120, 40, { x: 34, y: 10, w: 34, h: 9 }));

  const suggestions = suggestTextBoxMicroAdjustments({
    page: {
      pageIndex: 0,
      textBoxes: [{
        id: "title",
        text: "Hello",
        box: { x: 100, y: 80, w: 90, h: 20 },
        font: { sizePt: 16 },
        source: { evidenceBox: { x: 100, y: 80, w: 90, h: 20 } }
      }]
    },
    textCoveragePage: {
      pageIndex: 0,
      boxes: [{
        elementId: "title",
        ok: true,
        textCoverage: 0.9,
        expectedCoverage: 0.92,
        sourceCropImage,
        renderedCropImage,
        evidenceBox: { x: 100, y: 80, w: 90, h: 20 }
      }]
    },
    paddingPt: 12
  });

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].elementId, "title");
  assert.ok(suggestions[0].dx > 0);
  assert.ok(suggestions[0].dy > 0);
  assert.ok(suggestions[0].fontSizePt > 16);
  assert.ok(suggestions[0].boxHeightPt > 20);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("suggestTextBoxMicroAdjustments stays quiet for fully aligned crops", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-text-adjust-"));
  const sourceCropImage = path.join(tempDir, "source.png");
  const renderedCropImage = path.join(tempDir, "rendered.png");
  const image = makeInkImage(100, 36, { x: 28, y: 10, w: 32, h: 10 });
  writePng(sourceCropImage, image);
  writePng(renderedCropImage, image);

  const suggestions = suggestTextBoxMicroAdjustments({
    page: {
      pageIndex: 0,
      textBoxes: [{
        id: "caption",
        text: "Aligned",
        box: { x: 40, y: 40, w: 72, h: 18 },
        font: { sizePt: 14 },
        source: { evidenceBox: { x: 40, y: 40, w: 72, h: 18 } }
      }]
    },
    textCoveragePage: {
      pageIndex: 0,
      boxes: [{
        elementId: "caption",
        ok: true,
        textCoverage: 1,
        expectedCoverage: 1,
        sourceCropImage,
        renderedCropImage,
        evidenceBox: { x: 40, y: 40, w: 72, h: 18 }
      }]
    },
    paddingPt: 12
  });

  assert.equal(suggestions.length, 0);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("suggestTextBoxMicroAdjustments can inspect aligned OCR text when local ink is still offset", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-text-adjust-"));
  const sourceCropImage = path.join(tempDir, "source.png");
  const renderedCropImage = path.join(tempDir, "rendered.png");
  writePng(sourceCropImage, makeInkImage(120, 40, { x: 44, y: 14, w: 34, h: 12 }));
  writePng(renderedCropImage, makeInkImage(120, 40, { x: 38, y: 16, w: 34, h: 12 }));

  const suggestions = suggestTextBoxMicroAdjustments({
    page: {
      pageIndex: 0,
      textBoxes: [{
        id: "title",
        text: "Aligned OCR",
        box: { x: 100, y: 80, w: 90, h: 20 },
        font: { sizePt: 16 },
        source: { evidenceBox: { x: 100, y: 80, w: 90, h: 20 } }
      }]
    },
    textCoveragePage: {
      pageIndex: 0,
      boxes: [{
        elementId: "title",
        ok: true,
        textCoverage: 1,
        expectedCoverage: 1,
        sourceCropImage,
        renderedCropImage,
        evidenceBox: { x: 100, y: 80, w: 90, h: 20 }
      }]
    },
    paddingPt: 12,
    inspectAligned: true
  });

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].elementId, "title");
  assert.notEqual(suggestions[0].dx, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("suggestTextBoxMicroAdjustments proposes width, line height, and middle vertical anchor", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-text-adjust-"));
  const sourceCropImage = path.join(tempDir, "source.png");
  const renderedCropImage = path.join(tempDir, "rendered.png");
  writePng(sourceCropImage, makeInkImage(140, 60, { x: 45, y: 22, w: 58, h: 22 }));
  writePng(renderedCropImage, makeInkImage(140, 60, { x: 44, y: 14, w: 42, h: 15 }));

  const suggestions = suggestTextBoxMicroAdjustments({
    page: {
      pageIndex: 0,
      textBoxes: [{
        id: "body",
        text: "Line one\nLine two",
        box: { x: 100, y: 80, w: 110, h: 36 },
        font: { sizePt: 16 },
        source: { evidenceBox: { x: 100, y: 80, w: 110, h: 36 } }
      }]
    },
    textCoveragePage: {
      pageIndex: 0,
      boxes: [{
        elementId: "body",
        ok: true,
        textCoverage: 1,
        expectedCoverage: 1,
        sourceCropImage,
        renderedCropImage,
        evidenceBox: { x: 100, y: 80, w: 110, h: 36 }
      }]
    },
    paddingPt: 12,
    inspectAligned: true,
    maxWidthAdjustPt: 8
  });

  assert.equal(suggestions.length, 1);
  assert.ok(suggestions[0].boxWidthPt > 110);
  assert.ok(suggestions[0].lineHeightMultiple > 1);
  assert.equal(suggestions[0].valign, "middle");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("applyTextBoxMicroAdjustments mutates the cloned IR instead of the input", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-text-adjust-"));
  const sourceCropImage = path.join(tempDir, "source.png");
  const renderedCropImage = path.join(tempDir, "rendered.png");
  writePng(sourceCropImage, makeInkImage(120, 40, { x: 44, y: 14, w: 34, h: 12 }));
  writePng(renderedCropImage, makeInkImage(120, 40, { x: 34, y: 10, w: 34, h: 9 }));

  const inputIr = {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{
        id: "title",
        text: "Hello",
        box: { x: 100, y: 80, w: 90, h: 20 },
        font: { sizePt: 16 },
        source: { evidenceBox: { x: 100, y: 80, w: 90, h: 20 } }
      }]
    }]
  };
  const result = applyTextBoxMicroAdjustments(inputIr, {
    pages: [{
      pageIndex: 0,
      boxes: [{
        elementId: "title",
        ok: true,
        textCoverage: 0.9,
        expectedCoverage: 0.92,
        sourceCropImage,
        renderedCropImage,
        evidenceBox: { x: 100, y: 80, w: 90, h: 20 }
      }]
    }]
  }, { paddingPt: 12 });

  assert.equal(result.changed, true);
  assert.ok(result.changes.length > 0);
  assert.equal(inputIr.pages[0].textBoxes[0].box.x, 100);
  assert.notEqual(result.ir.pages[0].textBoxes[0].box.x, 100);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("applyTextBoxSuggestionSet scales box move, font size, height, width, line height, and valign independently", () => {
  const inputIr = {
    version: "1.0",
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{
        id: "title",
        text: "Hello",
        box: { x: 100, y: 80, w: 90, h: 20 },
        font: { sizePt: 16 }
      }]
    }]
  };

  const result = applyTextBoxSuggestionSet(inputIr, [{
    pageIndex: 0,
    suggestions: [{
      elementId: "title",
      dx: 2,
      dy: 4,
      fontSizePt: 18,
      boxHeightPt: 24,
      boxWidthPt: 96,
      lineHeightMultiple: 1.2,
      valign: "middle",
      reason: "scaled adjust"
    }]
  }], {
    moveScale: 0.5,
    fontScale: 0.5,
    heightScale: 0.25,
    widthScale: 0.5,
    lineHeightScale: 0.5,
    minDeltaPt: 0.1
  });

  assert.equal(result.changed, true);
  assert.equal(result.ir.pages[0].textBoxes[0].box.x, 101);
  assert.equal(result.ir.pages[0].textBoxes[0].box.y, 82);
  assert.equal(result.ir.pages[0].textBoxes[0].font.sizePt, 17);
  assert.equal(result.ir.pages[0].textBoxes[0].box.h, 21);
  assert.equal(result.ir.pages[0].textBoxes[0].box.w, 93);
  assert.equal(result.ir.pages[0].textBoxes[0].font.lineHeightMultiple, 1.1);
  assert.equal(result.ir.pages[0].textBoxes[0].font.valign, "middle");
  assert.equal(inputIr.pages[0].textBoxes[0].box.x, 100);
});

test("applyTextBoxEvidenceFit tightens a single-line box to source evidence with a safety edge", () => {
  const inputIr = { pages: [{ pageIndex: 0, textBoxes: [{
    id: "caption", text: "Caption", box: { x: 20, y: 30, w: 120, h: 28 }, style: { wrap: false }
  }] }] };
  const result = applyTextBoxEvidenceFit(inputIr, { pages: [{ pageIndex: 0, boxes: [{
    elementId: "caption", evidenceBox: { x: 22, y: 35, w: 90, h: 16 }
  }] }] }, { paddingPt: 1 });

  assert.equal(result.changed, true);
  assert.deepEqual(result.ir.pages[0].textBoxes[0].box, { x: 21, y: 34, w: 92, h: 18 });
  assert.deepEqual(inputIr.pages[0].textBoxes[0].box, { x: 20, y: 30, w: 120, h: 28 });
});

test("high-confidence OCR evidence fit tightens one-line title geometry and font size", () => {
  const title = {
    id: "ocr-title",
    text: "异构源材料的终极净化：从“远古混沌”到“可运行原型”",
    box: { x: 43, y: 61, w: 870, h: 42 },
    font: { family: "Microsoft YaHei", sizePt: 31, weight: "bold", valign: "middle" },
    style: { wrap: false },
    source: {
      ocrProvider: "umi-paddleocr-json",
      overlayVisibility: "visible",
      confidence: 0.98,
      evidenceBox: { x: 45.73, y: 60.38, w: 772.95, h: 31.88 }
    }
  };
  const lowConfidence = { ...title, id: "uncertain", source: { ...title.source, confidence: 0.5 } };
  const result = fitHighConfidenceSingleLineOcrToEvidence([title, lowConfidence]);

  assert.deepEqual(result[0].box, title.source.evidenceBox);
  assert.ok(result[0].font.sizePt <= 31 && result[0].font.sizePt > 26);
  assert.equal(result[0].source.ocrEvidenceFit.provider, "single-line-ocr-evidence-fit-v1");
  assert.equal(result[1], lowConfidence);
});

test("high-confidence OCR evidence fit prevents same-width title overflow", () => {
  const title = {
    id: "title",
    text: "产研资产的中枢操作系统",
    box: { x: 199.8, y: 51.38, w: 558.91, h: 40.88 },
    font: { family: "Microsoft YaHei", sizePt: 51.8, weight: "bold" },
    style: { wrap: false },
    source: {
      ocrProvider: "umi-paddleocr-json",
      overlayVisibility: "visible",
      confidence: 0.94,
      evidenceBox: { x: 199.8, y: 51.38, w: 558.91, h: 40.88 }
    }
  };

  const [result] = fitHighConfidenceSingleLineOcrToEvidence([title]);

  assert.ok(result.font.sizePt < title.font.sizePt);
  assert.equal(result.style.wrap, false);
  assert.equal(result.style.fit, "shrink");
  assert.equal(result.source.ocrEvidenceFit.originalSizePt, 51.8);
});

test("high-confidence OCR evidence fit supplies bounded typography when OCR omitted font metadata", () => {
  const title = {
    id: "title-without-font",
    text: "终极远景：构建企业级「数字化产品大脑」",
    box: { x: 181.8, y: 21.23, w: 576.9, h: 42 },
    style: { wrap: false },
    source: {
      ocrProvider: "umi-paddleocr-json",
      overlayVisibility: "visible",
      confidence: 0.95,
      evidenceBox: { x: 181.8, y: 26.63, w: 576.9, h: 31.88 }
    }
  };

  const [result] = fitHighConfidenceSingleLineOcrToEvidence([title]);

  assert.equal(result.font.family, "Microsoft YaHei");
  assert.ok(result.font.sizePt >= 6 && result.font.sizePt <= 60);
  assert.equal(result.source.ocrEvidenceFit.originalSizePt, null);
});

test("high-confidence OCR evidence fit preserves a source-sized pure CJK title", () => {
  const title = {
    id: "cjk-title",
    text: "产品经理日常工作中的高频摩擦",
    box: { x: 219.66, y: 43.5, w: 518.05, h: 32.63 },
    font: { family: "Microsoft YaHei", sizePt: 34.26, weight: "bold" },
    style: { wrap: false },
    source: {
      ocrProvider: "umi-paddleocr-json",
      overlayVisibility: "visible",
      confidence: 0.94,
      evidenceBox: { x: 219.66, y: 43.5, w: 518.05, h: 32.63 }
    }
  };

  const [result] = fitHighConfidenceSingleLineOcrToEvidence([title]);

  assert.equal(result.font.sizePt, 34.26);
  assert.equal(result.source.ocrEvidenceFit, undefined);
});

function makeInkImage(width, height, bounds) {
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = bounds.y; y < bounds.y + bounds.h; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.w; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 0;
      rgba[offset + 1] = 0;
      rgba[offset + 2] = 0;
      rgba[offset + 3] = 255;
    }
  }
  return { width, height, rgba };
}
