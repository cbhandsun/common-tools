"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildQualityGateArgs,
  countRenderedPages,
  discoverCases,
  findRenderDirsByPrefix,
  findRenderDirsFromQualityReports,
  isPaddleOcrAdapter,
  makeReport,
  parseBooleanFlag,
  parsePositiveInt,
  resolveReusableRenderDir,
  resolveTextOcrPages,
  selectRepresentativeOcrPageIndexes,
  shouldUsePaddleOcrBroker,
  summarizeTotals,
  validationStrategyProfile
} = require("../skills/pd-hifi-slideclone/scripts/quality-gate-ocr-batch");

test("discoverCases pairs native editable PPTX files with matching IR files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-batch-test-"));
  try {
    fs.writeFileSync(path.join(tmp, "B.native-editable.pptx"), "");
    fs.writeFileSync(path.join(tmp, "B.native.ir.json"), "{}");
    fs.writeFileSync(path.join(tmp, "A.native-editable.pptx"), "");
    fs.writeFileSync(path.join(tmp, "A.native.ir.json"), "{}");
    fs.writeFileSync(path.join(tmp, "missing.native-editable.pptx"), "");

    assert.deepEqual(discoverCases(tmp).map((item) => item.id), ["A", "B"]);
    assert.deepEqual(discoverCases(tmp, { only: "B" }).map((item) => item.id), ["B"]);
    assert.deepEqual(discoverCases(tmp, { limit: 1 }).map((item) => item.id), ["A"]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("summarizeTotals reports OCR batch coverage and failures", () => {
  assert.deepEqual(summarizeTotals([
    { ok: true, rejected: 0, textCoverage: 0.95 },
    { ok: true, rejected: 1, textCoverage: 0.75 },
    { ok: false, error: "boom" }
  ], 4), {
    totalCases: 4,
    completedCases: 3,
    passedCases: 1,
    failedCases: 2,
    meanTextCoverage: 0.85,
    minTextCoverage: 0.75
  });
});

test("makeReport preserves dry-run case list without pretending completion", () => {
  const report = makeReport({
    inputDir: "in",
    outputDir: "out",
    dryRun: true,
    cases: [{ id: "deck" }],
    results: []
  });

  assert.equal(report.provider, "quality-gate-ocr-batch");
  assert.equal(report.dryRun, true);
  assert.equal(report.totals.totalCases, 1);
  assert.equal(report.totals.completedCases, 0);
  assert.equal(report.validationStrategy.name, "source-render-ocr-and-editability-gate");
});

test("validation strategy records renderer, OCR mode, and visual gate checks", () => {
  const strategy = validationStrategyProfile({
    renderer: "libreoffice",
    "text-ocr-mode": "fullPage",
    "text-ocr-pages": "all",
    "min-text-coverage": "0.90"
  });

  assert.equal(strategy.renderer, "libreoffice");
  assert.equal(strategy.textOcrMode, "fullPage");
  assert.equal(strategy.textOcrPages, "all");
  assert.equal(strategy.minTextCoverage, "0.90");
  assert.ok(strategy.checks.includes("intentional-local-crop-accounting"));
});

test("validation strategy records visual-only mode without OCR thresholds", () => {
  const strategy = validationStrategyProfile({
    renderer: "powerpoint",
    "text-ocr": "false",
    "min-text-coverage": "0.90"
  });

  assert.equal(strategy.name, "source-render-visual-and-editability-gate");
  assert.equal(strategy.renderer, "powerpoint");
  assert.equal(strategy.textOcrEnabled, false);
  assert.equal(strategy.textOcrMode, null);
  assert.equal(strategy.minTextCoverage, null);
  assert.ok(strategy.checks.includes("render-source-vs-generated-pixel-diff"));
});

test("parseBooleanFlag accepts explicit off values for fast visual gates", () => {
  assert.equal(parseBooleanFlag("false", true), false);
  assert.equal(parseBooleanFlag("0", true), false);
  assert.equal(parseBooleanFlag("off", true), false);
  assert.equal(parseBooleanFlag("true", false), true);
  assert.equal(parseBooleanFlag(undefined, true), true);
});

test("parsePositiveInt falls back for invalid values", () => {
  assert.equal(parsePositiveInt("12", 3), 12);
  assert.equal(parsePositiveInt("0", 3), 3);
  assert.equal(parsePositiveInt("nope", 3), 3);
});

test("resolveReusableRenderDir only reuses directories with rendered page images", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-render-reuse-test-"));
  try {
    const renderRoot = path.join(tmp, "render-cache");
    const renderDir = path.join(renderRoot, "Deck_A", "render");
    fs.mkdirSync(renderDir, { recursive: true });
    fs.writeFileSync(path.join(renderDir, "page-01.png"), "");
    fs.writeFileSync(path.join(renderDir, "notes.txt"), "");

    assert.equal(countRenderedPages(renderDir), 1);
    assert.equal(
      resolveReusableRenderDir({ id: "Deck_A" }, { reuseRender: "true", renderRoot }),
      renderDir
    );
    assert.equal(resolveReusableRenderDir({ id: "Deck_A" }, { renderRoot }), null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("explicit render-dir wins when it contains rendered page images", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-render-explicit-test-"));
  try {
    const renderDir = path.join(tmp, "render");
    fs.mkdirSync(renderDir, { recursive: true });
    fs.writeFileSync(path.join(renderDir, "page-1.png"), "");

    assert.equal(
      resolveReusableRenderDir({ id: "Missing" }, { renderDir }),
      renderDir
    );
    assert.equal(
      resolveReusableRenderDir({ id: "Missing" }, { renderDir: path.join(tmp, "empty") }),
      null
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("quality gate OCR batch passes renderer selection to each case", () => {
  const args = buildQualityGateArgs({
    entry: { irFile: "deck.ir.json", pptxFile: "deck.pptx" },
    caseOut: "out/case",
    qualityGateScript: "quality-gate-real-pptx.js",
    reusableRenderDir: null,
    options: {
      textOcrAdapter: "ocr.js",
      textOcrMode: "anchored",
      minTextCoverage: "0.8",
      renderer: "powerpoint"
    }
  });

  assert.ok(args.includes("--renderer"));
  assert.equal(args[args.indexOf("--renderer") + 1], "powerpoint");
});

test("quality gate OCR batch forwards official PaddleOCR runtime and model options", () => {
  const args = buildQualityGateArgs({
    entry: { irFile: "deck.ir.json", pptxFile: "deck.pptx" },
    caseOut: "out/case",
    qualityGateScript: "quality-gate-real-pptx.js",
    options: {
      textOcrAdapter: "scripts/adapters/ocr-paddleocr-local.js",
      textOcrMode: "anchored",
      minTextCoverage: "0.9",
      paddleOcrPython: "python-paddle",
      paddleOcrVersion: "PP-OCRv6",
      paddleOcrDevice: "gpu:0",
      paddleOcrTextlineOrientation: "true"
    }
  });
  assert.equal(args[args.indexOf("--paddle-ocr-python") + 1], "python-paddle");
  assert.equal(args[args.indexOf("--paddle-ocr-version") + 1], "PP-OCRv6");
  assert.equal(args[args.indexOf("--paddle-ocr-device") + 1], "gpu:0");
  assert.equal(args[args.indexOf("--paddle-ocr-textline-orientation") + 1], "true");
});

test("quality gate OCR batch only enables the shared broker for the local PaddleOCR adapter", () => {
  assert.equal(isPaddleOcrAdapter("scripts/adapters/ocr-paddleocr-local.js"), true);
  assert.equal(isPaddleOcrAdapter("C:\\tools\\ocr-paddleocr-local.js"), true);
  assert.equal(isPaddleOcrAdapter("scripts/adapters/ocr-umi-paddle.js"), false);
  const report = makeReport({ inputDir: "in", outputDir: "out", cases: [], results: [], dryRun: false, brokerMetrics: { requests: 2, completed: 2, failed: 0 } });
  assert.deepEqual(report.paddleOcrBroker, { enabled: true, requests: 2, completed: 2, failed: 0 });
  const base = { textOcr: true, textOcrAdapter: "scripts/adapters/ocr-paddleocr-local.js", caseCount: 2 };
  assert.equal(shouldUsePaddleOcrBroker({ ...base, concurrency: 1 }), true);
  assert.equal(shouldUsePaddleOcrBroker({ ...base, concurrency: 2 }), false);
  assert.equal(shouldUsePaddleOcrBroker({ ...base, concurrency: 2, args: { "paddle-ocr-broker": "true" } }), true);
  assert.equal(shouldUsePaddleOcrBroker({ ...base, concurrency: 1, args: { "paddle-ocr-broker": "false" } }), false);
  assert.throws(() => shouldUsePaddleOcrBroker({ ...base, args: { "paddle-ocr-broker": "sometimes" } }), /auto, true, or false/);
});

test("quality gate OCR batch can build visual-only args without enabling OCR implicitly", () => {
  const args = buildQualityGateArgs({
    entry: { irFile: "deck.ir.json", pptxFile: "deck.pptx" },
    caseOut: "out/case",
    qualityGateScript: "quality-gate-real-pptx.js",
    reusableRenderDir: null,
    selectedTextOcrPages: "1,2",
    options: {
      textOcr: false,
      textOcrAdapter: "ocr.js",
      textOcrMode: "fullPage",
      minTextCoverage: "0.95",
      renderer: "powerpoint"
    }
  });

  assert.equal(args[args.indexOf("--text-ocr") + 1], "false");
  assert.equal(args.includes("--text-ocr-adapter"), false);
  assert.equal(args.includes("--text-ocr-mode"), false);
  assert.equal(args.includes("--text-ocr-pages"), false);
  assert.equal(args.includes("--min-text-coverage"), false);
  assert.equal(args[args.indexOf("--renderer") + 1], "powerpoint");
});

test("quality gate OCR batch resolves auto OCR pages from representative IR pages", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-auto-pages-test-"));
  try {
    const irFile = path.join(tmp, "Deck.native.ir.json");
    fs.writeFileSync(irFile, `${JSON.stringify({
      pages: [
        { pageIndex: 0, textBoxes: [{ text: "封面" }], shapes: [], images: [] },
        {
          pageIndex: 1,
          textBoxes: [
            { text: "这一页有大量正文用于验证 OCR 回读覆盖率" },
            { text: "还有更多正文内容，避免只看图示页" }
          ],
          shapes: []
        },
        {
          pageIndex: 2,
          textBoxes: [{ text: "WMS -> API -> Output 流程节点" }],
          shapes: [{ id: "a" }, { id: "b" }, { id: "c" }],
          images: [{ id: "crop" }]
        }
      ]
    })}\n`);

    assert.equal(
      resolveTextOcrPages({ irFile }, { textOcrPages: "auto", autoTextOcrMaxPages: 2 }),
      "2,3"
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("auto OCR page selection falls back to strongest text pages when diagram page duplicates", () => {
  assert.deepEqual(selectRepresentativeOcrPageIndexes({
    pages: [
      { pageIndex: 0, textBoxes: [{ text: "short" }] },
      { pageIndex: 1, textBoxes: [{ text: "很多很多很多很多很多很多正文" }] },
      { pageIndex: 2, textBoxes: [{ text: "次强正文内容" }] }
    ]
  }, { maxPages: 2 }), [1, 2]);
});

test("resolveReusableRenderDir reuses render dir recorded in quality reports", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-render-report-test-"));
  try {
    const renderDir = path.join(tmp, "render-cache", "Deck_A-baseline-powerpoint-quality", "render");
    const qualityDir = path.join(tmp, "quality", "Deck_A-baseline-powerpoint-quality");
    fs.mkdirSync(renderDir, { recursive: true });
    fs.mkdirSync(qualityDir, { recursive: true });
    fs.writeFileSync(path.join(renderDir, "page-01.png"), "");
    fs.writeFileSync(path.join(qualityDir, "quality-gate-report.json"), `${JSON.stringify({
      pptxFile: path.join(tmp, "Deck_A.native-editable.pptx"),
      render: { renderDir }
    })}\n`);

    assert.deepEqual(
      findRenderDirsFromQualityReports(
        { id: "Deck_A", pptxFile: path.join(tmp, "Deck_A.native-editable.pptx") },
        { qualityRoot: path.join(tmp, "quality") }
      ),
      [renderDir]
    );
    assert.equal(
      resolveReusableRenderDir(
        { id: "Deck_A", pptxFile: path.join(tmp, "Deck_A.native-editable.pptx") },
        { reuseRender: "true", renderRoot: path.join(tmp, "render-cache"), qualityRoot: path.join(tmp, "quality") }
      ),
      renderDir
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("resolveReusableRenderDir falls back to prefixed render cache directories", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-render-prefix-test-"));
  try {
    const renderRoot = path.join(tmp, "render-cache");
    const renderDir = path.join(renderRoot, "Deck_A-baseline-powerpoint-quality", "render");
    fs.mkdirSync(renderDir, { recursive: true });
    fs.writeFileSync(path.join(renderDir, "page-01.png"), "");

    assert.deepEqual(findRenderDirsByPrefix(renderRoot, "Deck_A"), [renderDir]);
    assert.equal(
      resolveReusableRenderDir(
        { id: "Deck_A", pptxFile: path.join(tmp, "Deck_A.native-editable.pptx") },
        { reuseRender: "true", renderRoot, qualityRoot: path.join(tmp, "missing-quality") }
      ),
      renderDir
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
