"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const compareThresholds = require("../skills/pd-hifi-slideclone/scripts/adapters/compare-placeholder");

test("anchored OCR batches a page in bounded chunks and preserves request ownership", async () => {
  const calls = [];
  const adapter = async () => { throw new Error("unexpected sequential fallback"); };
  adapter.runBatch = async (inputs) => {
    calls.push(inputs.map((item) => item.id));
    return inputs.map((item) => ({ ok: true, data: { id: item.id } }));
  };
  const owners = Array.from({ length: 5 }, () => ({}));
  const entries = owners.map((owner, index) => ({ owner, kind: "rendered", input: { id: index } }));
  await compareThresholds._private.runOcrRequestEntries(adapter, entries, {}, { microBatchSize: 2 });
  assert.deepEqual(calls, [[0, 1], [2, 3], [4]]);
  assert.deepEqual(owners.map((owner) => owner.renderedResult.data.id), [0, 1, 2, 3, 4]);
});

test("editability keeps allowed decorative backgrounds out of the actionable raster gate", () => {
  const summary = compareThresholds._private.summarizeEditability({
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      images: [
        {
          type: "fidelity-background",
          box: { x: 0, y: 0, w: 100, h: 100 },
          source: { detector: "decorative-cover-background-underlay" }
        },
        {
          type: "fidelity-crop",
          box: { x: 0, y: 0, w: 20, h: 10 },
          source: { detector: "screenshot" }
        }
      ]
    }]
  });

  assert.equal(summary.rasterImageAreaRatio, 1.02);
  assert.equal(summary.actionableRasterImageAreaRatio, 0.02);
});

test("editability counts source-native passthrough objects without treating them as raster", () => {
  const summary = compareThresholds._private.summarizeEditability({
    slideSize: { widthPt: 100, heightPt: 100 },
    pages: [{
      preserveTemplateSlide: true,
      source: { detector: "source-native-slide-passthrough", nativeObjects: 3 },
      images: [], textBoxes: [], shapes: [], tables: [], charts: [], icons: []
    }]
  });

  assert.equal(summary.editableObjects, 3);
  assert.equal(summary.sourceNativePassthroughPages, 1);
  assert.equal(summary.sourceNativePassthroughObjects, 3);
  assert.equal(summary.rasterImageAreaRatio, 0);
});

test("full-page OCR coverage tolerates reading order changes", () => {
  const result = compareThresholds._private.compareOcrText(
    0,
    { lines: [{ text: "标题" }, { text: "左侧内容" }, { text: "右侧内容" }] },
    { lines: [{ text: "右侧内容" }, { text: "标题" }, { text: "左侧内容" }] }
  );

  assert.equal(result.textCoverage, 1);
  assert.ok(result.sequenceCoverage < 1);
  assert.equal(result.bagCoverage, 1);
  assert.equal(result.sourceSample, "标题左侧内容右侧内容");
  assert.equal(result.renderedSample, "右侧内容标题左侧内容");
});

test("full-page OCR coverage still penalizes missing characters", () => {
  const result = compareThresholds._private.compareOcrText(
    0,
    { lines: [{ text: "供应链配置材料跨越多版本" }] },
    { lines: [{ text: "供应链材料多版本" }] }
  );

  assert.ok(result.textCoverage < 1);
  assert.ok(result.bagCoverage < 1);
  assert.ok(result.missingSample.length > 0);
});

test("full-page OCR diagnostic samples are truncated", () => {
  const sample = compareThresholds._private.truncateTextSample("长".repeat(650), 20);
  assert.equal(sample.length, 21);
  assert.equal(sample.endsWith("…"), true);
});

test("layout diagnostics round expected and measured boxes consistently", () => {
  assert.deepEqual(compareThresholds._private.roundedBox({
    x: 12.34567,
    y: 45.67891,
    w: 100.00004,
    h: 20.99996
  }), {
    x: 12.3457,
    y: 45.6789,
    w: 100,
    h: 21
  });
});

test("layout diagnostics use canonical semantic placement without discarding OCR evidence", () => {
  const canonicalBox = { x: 120, y: 80, w: 360, h: 28 };
  const result = compareThresholds._private.summarizeLayoutEvidence({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{
        id: "merged-title",
        type: "text",
        box: canonicalBox,
        source: {
          evidenceBox: { x: 120, y: 80, w: 130, h: 28 },
          layoutEvidenceBox: canonicalBox
        }
      }]
    }]
  });

  assert.equal(result.comparedObjects, 1);
  assert.equal(result.layoutMeanIoU, 1);
  assert.equal(result.maxCriticalOffsetPt, 0);
  assert.deepEqual(result.worstObjects[0].expectedBox, canonicalBox);
});

test("layout diagnostics use the final box for explicitly merged OCR fragments", () => {
  const canonicalBox = { x: 500, y: 410, w: 370, h: 50 };
  const result = compareThresholds._private.summarizeLayoutEvidence({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      pageIndex: 0,
      textBoxes: [{
        id: "merged-body",
        type: "text",
        box: canonicalBox,
        source: {
          evidenceBox: { x: 501, y: 414, w: 369, h: 17 },
          normalizedOcrTextBox: true,
          mergedElementIds: ["ocr-01", "ocr-02"]
        }
      }]
    }]
  });

  assert.equal(result.layoutMeanIoU, 1);
  assert.deepEqual(result.worstObjects[0].expectedBox, canonicalBox);
});

test("layout diagnostics expand rotated text to its axis-aligned measurement box", () => {
  assert.deepEqual(compareThresholds._private.rotatedBoundingBox(
    { x: 10, y: 20, w: 100, h: 20 },
    90
  ), { x: 50, y: -20, w: 20.000000000000007, h: 100 });
  assert.deepEqual(compareThresholds._private.rotatedBoundingBox(
    { x: 10, y: 20, w: 100, h: 20 },
    0
  ), { x: 10, y: 20, w: 100, h: 20 });
});

test("layout color bounds rasterize fractional crop coordinates before indexing PNG pixels", () => {
  const image = { width: 4, height: 3, rgba: Buffer.alloc(4 * 3 * 4, 255) };
  const offset = (1 * image.width + 2) * 4;
  image.rgba[offset] = 31;
  image.rgba[offset + 1] = 31;
  image.rgba[offset + 2] = 31;
  image.rgba[offset + 3] = 255;

  assert.deepEqual(
    compareThresholds._private.findColorBounds(
      image,
      { x: 0.4, y: 0.2, w: 3.2, h: 2.4 },
      [31, 31, 31],
      8
    ),
    { x: 2, y: 1, w: 1, h: 1 }
  );
});

test("full-page OCR rejects CJK pages when OCR output is mojibake", () => {
  const result = compareThresholds._private.compareOcrText(
    0,
    { lines: [{ text: "prd ebfe ezì ezeijfsghittk ffwt e" }] },
    { lines: [{ text: "prd esäbjift sebjfeitts ftfwken" }] },
    "PRD自动生成：告别重复性的标准化表达\n结构化需求\n业务背景\n功能说明\n验收口径"
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /unreliable for CJK text/);
  assert.ok(result.expectedCjkCharCount >= 8);
  assert.equal(result.sourceCjkRatio, 0);
  assert.equal(result.renderedCjkRatio, 0);
});

test("anchored OCR treats the same uncertain source glyph position as diagnostic uncertainty", () => {
  const result = compareThresholds._private.compareAnchoredOcrTexts("维护高冗余", "维护高穴余", "维护高几余");

  assert.equal(result.expectedCoverage, 0.8);
  assert.equal(result.sourceRelativeCoverage, 0.8);
  assert.equal(result.uncertaintyAdjustedCoverage, 1);
  assert.equal(result.ocrUncertainCharCount, 1);
});

test("anchored OCR still rejects a rendered error when source OCR recognized the expected glyph", () => {
  const result = compareThresholds._private.compareAnchoredOcrTexts("维护高冗余", "维护高冗余", "维护高几余");

  assert.equal(result.textCoverage, 0.8);
  assert.equal(result.ocrUncertainCharCount, 0);
});

test("anchored OCR tolerates token order changes without hiding missing characters", () => {
  const reordered = compareThresholds._private.compareAnchoredOcrTexts(
    "AI能力引擎结构化PRD生成",
    "AI能力引擎结构化PRD生成",
    "结构化PRD生成AI能力引擎"
  );
  const missing = compareThresholds._private.compareAnchoredOcrTexts(
    "AI能力引擎结构化PRD生成",
    "AI能力引擎结构化PRD生成",
    "结构化PRD生成AI能力"
  );

  assert.equal(reordered.textCoverage, 1);
  assert.ok(reordered.expectedSequenceMatchedCharCount < reordered.expectedBagMatchedCharCount);
  assert.ok(missing.textCoverage < 1);
});

test("anchored OCR failed boxes remain in the coverage denominator", () => {
  const result = compareThresholds._private.summarizeAnchoredBoxResults([
    { ok: true, textCoverage: 1, expectedCharCount: 5, matchedCharCount: 5 },
    { ok: false, textCoverage: 0, expectedCharCount: 3, matchedCharCount: 0 }
  ]);

  assert.deepEqual(result, {
    measurableBoxCount: 2,
    expectedCharCount: 8,
    matchedCharCount: 5,
    textCoverage: 0.625
  });
});
