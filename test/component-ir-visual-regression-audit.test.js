"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  parseArgs,
  collectReusableRender,
  applyPageBudget,
  createReviewAsset,
  runComponentIrVisualRegressionAudit,
  selectJobs,
  summarizeDeckResults
} = require("../skills/pd-hifi-slideclone/scripts/component-ir-visual-regression-audit");
const { writePng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");
const { readPng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");

test("component IR visual regression audit parses CLI flags", () => {
  const args = parseArgs([
    "node",
    "component-ir-visual-regression-audit.js",
    "--report",
    "batch.json",
    "--out",
    "out",
    "--renderer",
    "libreoffice",
    "--max-decks",
    "2",
    "--max-pages-per-deck",
    "3",
    "--page-budget",
    "5",
    "--reuse-render",
    "--review-assets",
    "--target-region-audit",
    "--fail-on-threshold",
    "--max-pixel-diff-ratio",
    "0.5",
    "--max-foreground-missing-ratio",
    "0.6",
    "--max-mean-delta",
    "80",
    "--max-target-pixel-diff-ratio",
    "0.2",
    "--max-target-foreground-missing-ratio",
    "0.3",
    "--max-target-mean-delta",
    "40"
  ]);

  assert.equal(args.report, "batch.json");
  assert.equal(args.out, "out");
  assert.equal(args.renderer, "libreoffice");
  assert.equal(args.maxDecks, 2);
  assert.equal(args.maxPagesPerDeck, 3);
  assert.equal(args.pageBudget, 5);
  assert.equal(args.reuseRender, true);
  assert.equal(args.reviewAssets, true);
  assert.equal(args.targetRegionAudit, true);
  assert.equal(args.failOnThreshold, true);
  assert.equal(args.thresholds.maxPixelDiffRatio, 0.5);
  assert.equal(args.thresholds.maxForegroundMissingRatio, 0.6);
  assert.equal(args.thresholds.maxMeanAbsoluteDelta, 80);
  assert.equal(args.thresholds.maxTargetPixelDiffRatio, 0.2);
  assert.equal(args.thresholds.maxTargetForegroundMissingRatio, 0.3);
  assert.equal(args.thresholds.maxTargetMeanAbsoluteDelta, 40);
  assert.throws(() => parseArgs(["node", "script"]), /--report is required/);
  assert.equal(parseArgs(["node", "script", "--report", "batch.json"]).renderer, "libreoffice");
});

test("component IR visual regression audit selects target slides from plans", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-visual-select-"));
  const plan = path.join(tmp, "plan.json");
  fs.writeFileSync(plan, JSON.stringify({
    operations: [
      { slides: [4], target: { slide: 2 } },
      { target: { slide: 7 } }
    ]
  }));

  const jobs = selectJobs([{
    status: "applied",
    deck: "Deck",
    inputPptx: "before.pptx",
    outputPptx: "after.pptx",
    planFile: plan
  }], { maxDecks: 0, maxPagesPerDeck: 2 });

  assert.deepEqual(jobs[0].targetSlides, [2, 4]);
});

test("component IR visual regression audit applies page budget across decks evenly", () => {
  const budgeted = applyPageBudget([
    { deck: "A", targetSlides: [1, 2, 3] },
    { deck: "B", targetSlides: [4, 5] },
    { deck: "C", targetSlides: [6, 7] }
  ], 5);

  assert.deepEqual(budgeted.map((job) => ({ deck: job.deck, slides: job.targetSlides })), [
    { deck: "A", slides: [1, 2] },
    { deck: "B", slides: [4, 5] },
    { deck: "C", slides: [6] }
  ]);
});

test("component IR visual regression audit passes matching rendered target pages", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-visual-pass-"));
  const reportFile = writeBatchReport(tmp);
  const renderDeck = makeMockRenderer(tmp, {
    beforeColor: [20, 120, 200, 255],
    afterColor: [20, 120, 200, 255]
  });

  const report = await runComponentIrVisualRegressionAudit({
    report: reportFile,
    out: path.join(tmp, "out"),
    renderDeck,
    thresholds: { maxPixelDiffRatio: 0.01, maxForegroundMissingRatio: 0.01, maxMeanAbsoluteDelta: 1 }
  });

  assert.equal(report.totals.decks, 1);
  assert.equal(report.totals.passedDecks, 1);
  assert.equal(report.totals.failedDecks, 0);
  assert.equal(report.totals.comparedPages, 2);
  assert.equal(fs.existsSync(report.reportFile), true);
});

test("component IR visual regression audit accepts PowerPoint renderer", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-visual-powerpoint-"));
  const reportFile = writeBatchReport(tmp);
  const renderDeck = makeMockRenderer(tmp, {
    beforeColor: [20, 120, 200, 255],
    afterColor: [20, 120, 200, 255]
  });

  const report = await runComponentIrVisualRegressionAudit({
    report: reportFile,
    out: path.join(tmp, "out"),
    renderer: "powerpoint",
    renderDeck,
    thresholds: { maxPixelDiffRatio: 0.01, maxForegroundMissingRatio: 0.01, maxMeanAbsoluteDelta: 1 }
  });

  assert.equal(report.renderer, "powerpoint");
  assert.equal(report.totals.failedDecks, 0);
});

test("component IR visual regression audit fails changed rendered target pages", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-visual-fail-"));
  const reportFile = writeBatchReport(tmp);
  const renderDeck = makeMockRenderer(tmp, {
    beforeColor: [20, 120, 200, 255],
    afterColor: [240, 240, 240, 255]
  });

  const report = await runComponentIrVisualRegressionAudit({
    report: reportFile,
    out: path.join(tmp, "out"),
    renderDeck,
    thresholds: { maxPixelDiffRatio: 0.01, maxForegroundMissingRatio: 0.01, maxMeanAbsoluteDelta: 1 }
  });

  assert.equal(report.totals.failedDecks, 1);
  assert.equal(report.results[0].ok, false);
  assert.ok(report.results[0].issues.length > 0);
});

test("component IR visual regression audit rejects a changed replacement region even when the full page passes", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-visual-local-fail-"));
  const reportFile = writeBatchReport(tmp, [{ target: { slide: 1, box: { x: 0, y: 0, w: 180, h: 180 } } }]);
  const renderDeck = async ({ pptxFile, outDir, targetSlides }) => {
    fs.mkdirSync(outDir, { recursive: true });
    const after = /after\.pptx$/i.test(pptxFile);
    const renderedPages = targetSlides.map((slide) => {
      const image = path.join(outDir, `page-${slide}.png`);
      writeSplitPng(image, after);
      return { pageIndex: slide - 1, image, widthPx: 40, heightPx: 40 };
    });
    return { renderDir: outDir, renderedPages };
  };

  const report = await runComponentIrVisualRegressionAudit({
    report: reportFile,
    out: path.join(tmp, "out"),
    renderDeck,
    targetRegionAudit: true,
    thresholds: {
      maxPixelDiffRatio: 0.3,
      maxForegroundMissingRatio: 1,
      maxMeanAbsoluteDelta: 80,
      maxTargetPixelDiffRatio: 0.05,
      maxTargetForegroundMissingRatio: 1,
      maxTargetMeanAbsoluteDelta: 20,
      slideWidthPt: 720,
      slideHeightPt: 540
    }
  });

  assert.equal(report.totals.failedDecks, 1);
  assert.equal(report.totals.targetRegions, 1);
  assert.equal(report.totals.failedTargetRegions, 1);
  assert.ok(report.results[0].pages[0].issues.some((issue) => issue.startsWith("target-region:")));
});

test("component IR visual regression audit records renderer errors per deck", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-visual-render-error-"));
  const reportFile = writeBatchReport(tmp);
  const report = await runComponentIrVisualRegressionAudit({
    report: reportFile,
    out: path.join(tmp, "out"),
    renderDeck: async () => {
      throw new Error("renderer failed with token SECRET_SHOULD_NOT_EXPAND");
    }
  });

  assert.equal(report.totals.failedDecks, 1);
  assert.equal(report.totals.failedPages, 2);
  assert.equal(report.results[0].status, "render-error");
  assert.match(report.results[0].error.message, /renderer failed/);
  assert.equal(fs.existsSync(report.reportFile), true);
});

test("component IR visual regression audit reuses existing render pages", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-visual-reuse-"));
  const reportFile = writeBatchReport(tmp);
  writeRenderCache(path.join(tmp, "out", "Deck", "before"), [1, 2], [20, 120, 200, 255]);
  writeRenderCache(path.join(tmp, "out", "Deck", "after"), [1, 2], [20, 120, 200, 255]);
  let renderCalls = 0;

  const report = await runComponentIrVisualRegressionAudit({
    report: reportFile,
    out: path.join(tmp, "out"),
    reuseRender: true,
    renderDeck: async () => {
      renderCalls += 1;
      throw new Error("renderer should not be called on cache hit");
    },
    thresholds: { maxPixelDiffRatio: 0.01, maxForegroundMissingRatio: 0.01, maxMeanAbsoluteDelta: 1 }
  });

  assert.equal(renderCalls, 0);
  assert.equal(report.totals.failedDecks, 0);
  assert.equal(report.results[0].beforeRenderDir.endsWith(path.join("before", "render", "iteration-0")), true);
  assert.equal(collectReusableRender(path.join(tmp, "out", "Deck", "before"), [1, 2]).renderedPages.length, 2);
});

test("component IR visual regression audit writes review assets", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-visual-review-assets-"));
  const reportFile = writeBatchReport(tmp);
  const renderDeck = makeMockRenderer(tmp, {
    beforeColor: [20, 120, 200, 255],
    afterColor: [240, 240, 240, 255]
  });

  const report = await runComponentIrVisualRegressionAudit({
    report: reportFile,
    out: path.join(tmp, "out"),
    renderDeck,
    reviewAssets: true,
    thresholds: { maxPixelDiffRatio: 1, maxForegroundMissingRatio: 1, maxMeanAbsoluteDelta: 255 }
  });

  const reviewImage = report.results[0].pages[0].reviewImage;
  assert.equal(fs.existsSync(reviewImage), true);
  const png = readPng(reviewImage);
  assert.equal(png.width, 28);
  assert.equal(png.height, 4);
});

test("component IR visual regression audit creates standalone review asset triptychs", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-visual-review-direct-"));
  const before = path.join(tmp, "before.png");
  const after = path.join(tmp, "after.png");
  const out = path.join(tmp, "review.png");
  writeSolidPng(before, [0, 0, 0, 255]);
  writeSolidPng(after, [255, 255, 255, 255]);

  const review = createReviewAsset({ beforeImage: before, afterImage: after, outFile: out });

  assert.equal(review, path.resolve(out));
  assert.equal(readPng(review).width, 28);
});

test("component IR visual regression audit ignores incomplete render cache", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-visual-reuse-miss-"));
  const reportFile = writeBatchReport(tmp);
  writeRenderCache(path.join(tmp, "out", "Deck", "before"), [1], [20, 120, 200, 255]);
  let renderCalls = 0;
  const renderDeck = makeMockRenderer(tmp, {
    beforeColor: [20, 120, 200, 255],
    afterColor: [20, 120, 200, 255]
  }, () => { renderCalls += 1; });

  const report = await runComponentIrVisualRegressionAudit({
    report: reportFile,
    out: path.join(tmp, "out"),
    reuseRender: true,
    renderDeck,
    thresholds: { maxPixelDiffRatio: 0.01, maxForegroundMissingRatio: 0.01, maxMeanAbsoluteDelta: 1 }
  });

  assert.equal(renderCalls, 2);
  assert.equal(report.totals.failedDecks, 0);
});

test("component IR visual regression audit summarizes deck metrics", () => {
  assert.deepEqual(summarizeDeckResults([
    {
      ok: true,
      summary: {
        targetSlides: 2,
        comparedPages: 2,
        failedPages: 0,
        meanPixelDiffRatio: 0.1,
        maxPixelDiffRatio: 0.2,
        meanForegroundMissingRatio: 0.3,
        maxForegroundMissingRatio: 0.4,
        meanAbsoluteDelta: 10,
        maxMeanAbsoluteDelta: 20
      }
    },
    {
      ok: false,
      summary: {
        targetSlides: 1,
        comparedPages: 1,
        failedPages: 1,
        meanPixelDiffRatio: 0.5,
        maxPixelDiffRatio: 0.6,
        meanForegroundMissingRatio: 0.7,
        maxForegroundMissingRatio: 0.8,
        meanAbsoluteDelta: 30,
        maxMeanAbsoluteDelta: 40
      }
    }
  ]), {
    decks: 2,
    passedDecks: 1,
    failedDecks: 1,
    targetSlides: 3,
    comparedPages: 3,
    failedPages: 1,
    meanPixelDiffRatio: 0.3,
    maxPixelDiffRatio: 0.6,
    meanForegroundMissingRatio: 0.5,
    maxForegroundMissingRatio: 0.8,
    meanAbsoluteDelta: 20,
    maxMeanAbsoluteDelta: 40,
    targetRegions: 0,
    failedTargetRegions: 0,
    maxTargetPixelDiffRatio: null,
    maxTargetForegroundMissingRatio: null,
    maxTargetMeanAbsoluteDelta: null
  });
});

function writeBatchReport(tmp, operations = null) {
  const planFile = path.join(tmp, "plan.json");
  fs.writeFileSync(planFile, JSON.stringify({
    operations: operations || [
      { slides: [1] },
      { target: { slide: 2 } }
    ]
  }));
  const reportFile = path.join(tmp, "batch.json");
  fs.writeFileSync(reportFile, JSON.stringify({
    results: [{
      status: "applied",
      deck: "Deck",
      inputPptx: path.join(tmp, "before.pptx"),
      outputPptx: path.join(tmp, "after.pptx"),
      planFile
    }]
  }));
  return reportFile;
}

function makeMockRenderer(tmp, colors, onCall = null) {
  return async ({ pptxFile, outDir, targetSlides }) => {
    if (onCall) onCall({ pptxFile, outDir, targetSlides });
    fs.mkdirSync(outDir, { recursive: true });
    const isAfter = /after\.pptx$/i.test(pptxFile);
    const color = isAfter ? colors.afterColor : colors.beforeColor;
    const renderedPages = targetSlides.map((slide) => {
      const image = path.join(outDir, `page-${slide}.png`);
      writeSolidPng(image, color);
      return { pageIndex: slide - 1, image, widthPx: 4, heightPx: 4 };
    });
    return { renderDir: outDir, renderedPages };
  };
}

function writeRenderCache(outDir, slides, color) {
  const renderDir = path.join(outDir, "render", "iteration-0");
  fs.mkdirSync(renderDir, { recursive: true });
  for (const slide of slides) {
    writeSolidPng(path.join(renderDir, `page-${String(slide).padStart(2, "0")}.png`), color);
  }
}

function writeSolidPng(file, rgba) {
  const pixels = Buffer.alloc(4 * 4 * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = rgba[0];
    pixels[offset + 1] = rgba[1];
    pixels[offset + 2] = rgba[2];
    pixels[offset + 3] = rgba[3];
  }
  writePng(file, { width: 4, height: 4, rgba: pixels });
}

function writeSplitPng(file, changed) {
  const width = 40;
  const height = 40;
  const pixels = Buffer.alloc(width * height * 4, 255);
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 10; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = changed ? 220 : 20;
      pixels[offset + 1] = changed ? 40 : 120;
      pixels[offset + 2] = changed ? 40 : 200;
      pixels[offset + 3] = 255;
    }
  }
  writePng(file, { width, height, rgba: pixels });
}
