#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const renderLibreOffice = require("./adapters/render-libreoffice");
const renderPowerPointCom = require("./adapters/render-powerpoint-com");
const { readImageSize } = require("./lib/image-size");
const { cropPng, readPng, writePng } = require("./lib/png");
const {
  collectTargetSlides
} = require("./component-ir-replacement-object-audit");
const {
  comparePageImages,
  compareRasterImages
} = require("./rendered-similarity-audit");

const DEFAULT_THRESHOLDS = {
  maxPixelDiffRatio: 0.42,
  maxForegroundMissingRatio: 0.58,
  maxMeanAbsoluteDelta: 72,
  sampleBudget: 120000,
  foregroundTolerancePx: 2,
  foregroundToleranceDelta: 56,
  maxTargetPixelDiffRatio: 0.22,
  maxTargetForegroundMissingRatio: 0.28,
  maxTargetMeanAbsoluteDelta: 46,
  slideWidthPt: 720,
  slideHeightPt: 540
};

function parseArgs(argv = process.argv) {
  const args = {
    report: "",
    out: path.join("runs", "component-ir-visual-regression-audit"),
    renderer: "libreoffice",
    maxDecks: 0,
    maxPagesPerDeck: 0,
    pageBudget: 0,
    reuseRender: false,
    reviewAssets: false,
    targetRegionAudit: false,
    failOnThreshold: false,
    thresholds: { ...DEFAULT_THRESHOLDS }
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--report" && next) {
      args.report = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--renderer" && next) {
      args.renderer = next;
      index += 1;
    } else if (arg === "--max-decks" && next) {
      args.maxDecks = Number(next);
      index += 1;
    } else if (arg === "--max-pages-per-deck" && next) {
      args.maxPagesPerDeck = Number(next);
      index += 1;
    } else if (arg === "--page-budget" && next) {
      args.pageBudget = Number(next);
      index += 1;
    } else if (arg === "--reuse-render") {
      args.reuseRender = true;
    } else if (arg === "--review-assets") {
      args.reviewAssets = true;
    } else if (arg === "--target-region-audit") {
      args.targetRegionAudit = true;
    } else if (arg === "--fail-on-threshold") {
      args.failOnThreshold = true;
    } else if (arg === "--max-pixel-diff-ratio" && next) {
      args.thresholds.maxPixelDiffRatio = Number(next);
      index += 1;
    } else if (arg === "--max-foreground-missing-ratio" && next) {
      args.thresholds.maxForegroundMissingRatio = Number(next);
      index += 1;
    } else if (arg === "--max-mean-delta" && next) {
      args.thresholds.maxMeanAbsoluteDelta = Number(next);
      index += 1;
    } else if (arg === "--max-target-pixel-diff-ratio" && next) {
      args.thresholds.maxTargetPixelDiffRatio = Number(next);
      index += 1;
    } else if (arg === "--max-target-foreground-missing-ratio" && next) {
      args.thresholds.maxTargetForegroundMissingRatio = Number(next);
      index += 1;
    } else if (arg === "--max-target-mean-delta" && next) {
      args.thresholds.maxTargetMeanAbsoluteDelta = Number(next);
      index += 1;
    } else {
      throw new Error(`Unknown component-ir-visual-regression-audit argument: ${arg}`);
    }
  }
  if (!args.report) throw new Error("--report is required.");
  return args;
}

async function runComponentIrVisualRegressionAudit(options = {}) {
  const args = normalizeOptions(options);
  const batch = readJson(args.report);
  const jobs = selectJobs(batch.results || [], args);
  fs.mkdirSync(args.out, { recursive: true });

  const results = [];
  for (const job of jobs) {
    results.push(await auditDeckSafely(job, args));
  }

  const report = {
    provider: "component-ir-visual-regression-audit-v1",
    createdAt: new Date().toISOString(),
    sourceReport: args.report,
    out: args.out,
    renderer: args.renderer,
    thresholds: args.thresholds,
    totals: summarizeDeckResults(results),
    results
  };
  const reportFile = path.join(args.out, "component-ir-visual-regression-audit.json");
  writeJson(reportFile, report);
  report.reportFile = reportFile;
  if (args.failOnThreshold && report.totals.failedDecks > 0) {
    const error = new Error(`Component IR visual regression audit failed for ${report.totals.failedDecks} deck(s).`);
    error.report = report;
    throw error;
  }
  return report;
}

function normalizeOptions(options = {}) {
  const args = {
    report: path.resolve(String(options.report || "")),
    out: path.resolve(String(options.out || path.join("runs", "component-ir-visual-regression-audit"))),
    renderer: String(options.renderer || "libreoffice"),
    maxDecks: normalizeNonNegativeInt(options.maxDecks, 0),
    maxPagesPerDeck: normalizeNonNegativeInt(options.maxPagesPerDeck, 0),
    pageBudget: normalizeNonNegativeInt(options.pageBudget, 0),
    reuseRender: options.reuseRender === true,
    reviewAssets: options.reviewAssets === true,
    targetRegionAudit: options.targetRegionAudit === true,
    failOnThreshold: options.failOnThreshold === true,
    thresholds: { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) },
    renderDeck: options.renderDeck
  };
  if (!args.report) throw new Error("report is required.");
  if (!fs.existsSync(args.report)) throw new Error(`Batch report was not found: ${args.report}`);
  if (!["powerpoint-com", "libreoffice"].includes(args.renderer) && typeof args.renderDeck !== "function") {
    throw new Error(`Unsupported renderer: ${args.renderer}`);
  }
  return args;
}

function selectJobs(results = [], args = {}) {
  const jobs = results
    .filter((item) => item && item.status === "applied" && item.inputPptx && item.outputPptx && item.planFile)
    .slice(0, args.maxDecks > 0 ? args.maxDecks : undefined)
    .map((job) => {
    const plan = readJson(job.planFile);
    const slides = collectTargetSlides(plan);
    return {
      ...job,
      targetSlides: args.maxPagesPerDeck > 0 ? slides.slice(0, args.maxPagesPerDeck) : slides,
      targetRegions: collectTargetRegions(plan)
    };
  }).filter((job) => job.targetSlides.length > 0);
  return applyPageBudget(jobs, args.pageBudget);
}

function applyPageBudget(jobs = [], pageBudget = 0) {
  const budget = normalizeNonNegativeInt(pageBudget, 0);
  if (budget === 0) return jobs;
  const selectedByDeck = jobs.map(() => []);
  let selected = 0;
  let round = 0;
  while (selected < budget) {
    let addedThisRound = 0;
    for (let index = 0; index < jobs.length && selected < budget; index += 1) {
      const slide = jobs[index].targetSlides[round];
      if (!slide) continue;
      selectedByDeck[index].push(slide);
      selected += 1;
      addedThisRound += 1;
    }
    if (addedThisRound === 0) break;
    round += 1;
  }
  return jobs.map((job, index) => ({
    ...job,
    targetSlides: selectedByDeck[index]
  })).filter((job) => job.targetSlides.length > 0);
}

function collectTargetRegions(plan = {}) {
  const bySlide = new Map();
  for (const operation of safeArray(plan.operations)) {
    const slide = Number(operation?.slide ?? operation?.target?.slide);
    const bounds = normalizeBounds(operation?.targetBox || operation?.target?.box);
    if (!Number.isInteger(slide) || slide < 1 || !bounds) continue;
    const entries = bySlide.get(slide) || [];
    entries.push({
      operationId: safeString(operation?.imageId || operation?.layerKey || operation?.component?.componentId),
      bounds
    });
    bySlide.set(slide, entries);
  }
  return bySlide;
}

function compareTargetRegions({ slide, regions = [], beforeImage, afterImage, thresholds }) {
  if (!regions.length) return [];
  const before = readPng(beforeImage);
  const after = readPng(afterImage);
  return regions.map((region, index) => {
    const beforeBox = projectBoundsToImage(region.bounds, before, thresholds);
    const afterBox = projectBoundsToImage(region.bounds, after, thresholds);
    const comparison = compareRasterImages({
      pageIndex: slide - 1,
      source: cropPng(before, beforeBox),
      rendered: cropPng(after, afterBox),
      sourceImage: beforeImage,
      renderedImage: afterImage,
      thresholds: {
        ...thresholds,
        maxPixelDiffRatio: thresholds.maxTargetPixelDiffRatio,
        maxForegroundMissingRatio: thresholds.maxTargetForegroundMissingRatio,
        maxMeanAbsoluteDelta: thresholds.maxTargetMeanAbsoluteDelta
      }
    });
    return {
      targetIndex: index,
      operationId: region.operationId,
      sourceBoundsPt: region.bounds,
      sourceBoundsPx: beforeBox,
      renderedBoundsPx: afterBox,
      ...comparison
    };
  });
}

function projectBoundsToImage(bounds, image, thresholds = DEFAULT_THRESHOLDS) {
  const width = Math.max(1, Number(thresholds.slideWidthPt) || DEFAULT_THRESHOLDS.slideWidthPt);
  const height = Math.max(1, Number(thresholds.slideHeightPt) || DEFAULT_THRESHOLDS.slideHeightPt);
  return {
    x: Math.round(bounds.x / width * image.width),
    y: Math.round(bounds.y / height * image.height),
    w: Math.max(1, Math.round(bounds.w / width * image.width)),
    h: Math.max(1, Math.round(bounds.h / height * image.height))
  };
}

function normalizeBounds(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const x = Number(value.x ?? value.X);
  const y = Number(value.y ?? value.Y);
  const w = Number(value.w ?? value.W ?? value.width ?? value.Width);
  const h = Number(value.h ?? value.H ?? value.height ?? value.Height);
  return [x, y, w, h].every(Number.isFinite) && w > 0 && h > 0 ? { x, y, w, h } : null;
}

async function auditDeckSafely(job, args) {
  try {
    return await auditDeck(job, args);
  } catch (error) {
    return buildRenderErrorDeckResult(job, args, error);
  }
}

async function auditDeck(job, args) {
  const deckOut = path.join(args.out, safeFileStem(job.deck || "deck"));
  const beforeDir = path.join(deckOut, "before");
  const afterDir = path.join(deckOut, "after");
  const before = await renderDeck(job.inputPptx, beforeDir, job.targetSlides, args);
  const after = await renderDeck(job.outputPptx, afterDir, job.targetSlides, args);
  const beforePages = new Map(before.renderedPages.map((page) => [page.pageIndex, page]));
  const afterPages = new Map(after.renderedPages.map((page) => [page.pageIndex, page]));
  const pages = job.targetSlides.map((slide) => {
    const pageIndex = slide - 1;
    const beforePage = beforePages.get(pageIndex);
    const afterPage = afterPages.get(pageIndex);
    if (!beforePage || !afterPage) {
      return {
        slide,
        pageIndex,
        ok: false,
        status: "missing-render",
        issues: [!beforePage ? "missing-before-render" : "missing-after-render"]
      };
    }
    const comparison = comparePageImages(pageIndex, beforePage.image, afterPage.image, args.thresholds);
    const page = {
      slide,
      ...comparison,
      targetRegions: args.targetRegionAudit ? compareTargetRegions({
        slide,
        regions: job.targetRegions?.get(slide) || [],
        beforeImage: beforePage.image,
        afterImage: afterPage.image,
        thresholds: args.thresholds
      }) : []
    };
    page.issues.push(...page.targetRegions.flatMap((region) => region.issues.map((issue) => `target-region:${issue}`)));
    page.ok = page.issues.length === 0;
    if (args.reviewAssets) {
      page.reviewImage = createReviewAsset({
        beforeImage: beforePage.image,
        afterImage: afterPage.image,
        outFile: path.join(deckOut, "review-assets", `slide-${String(slide).padStart(3, "0")}.before-after-diff.png`)
      });
    }
    return page;
  });
  const compared = pages.filter((page) => page.status === "compared");
  const issues = pages.flatMap((page) => (page.issues || []).map((issue) => ({
    slide: page.slide,
    pageIndex: page.pageIndex,
    issue
  })));
  const summary = {
    targetSlides: job.targetSlides.length,
    comparedPages: compared.length,
    failedPages: pages.length - compared.filter((page) => page.ok).length,
    meanPixelDiffRatio: average(compared, "pixelDiffRatio"),
    maxPixelDiffRatio: max(compared, "pixelDiffRatio"),
    meanForegroundMissingRatio: average(compared, "foregroundMissingRatio"),
    maxForegroundMissingRatio: max(compared, "foregroundMissingRatio"),
    meanAbsoluteDelta: average(compared, "meanAbsoluteDelta"),
    maxMeanAbsoluteDelta: max(compared, "meanAbsoluteDelta"),
    targetRegions: compared.reduce((sum, page) => sum + safeArray(page.targetRegions).length, 0),
    failedTargetRegions: compared.reduce((sum, page) => sum + safeArray(page.targetRegions).filter((region) => !region.ok).length, 0),
    maxTargetPixelDiffRatio: max(compared.flatMap((page) => safeArray(page.targetRegions)), "pixelDiffRatio"),
    maxTargetForegroundMissingRatio: max(compared.flatMap((page) => safeArray(page.targetRegions)), "foregroundMissingRatio"),
    maxTargetMeanAbsoluteDelta: max(compared.flatMap((page) => safeArray(page.targetRegions)), "meanAbsoluteDelta")
  };
  return {
    deck: job.deck,
    inputPptx: job.inputPptx,
    outputPptx: job.outputPptx,
    targetSlides: job.targetSlides,
    beforeRenderDir: before.renderDir,
    afterRenderDir: after.renderDir,
    ok: issues.length === 0,
    summary,
    issues,
    worstPages: [...compared].sort((a, b) => b.pixelDiffRatio - a.pixelDiffRatio).slice(0, 5),
    pages
  };
}

function buildRenderErrorDeckResult(job, args, error) {
  const deckOut = path.join(args.out, safeFileStem(job.deck || "deck"));
  const message = sanitizeErrorMessage(error);
  return {
    deck: job.deck,
    inputPptx: job.inputPptx,
    outputPptx: job.outputPptx,
    targetSlides: job.targetSlides || [],
    beforeRenderDir: path.join(deckOut, "before"),
    afterRenderDir: path.join(deckOut, "after"),
    ok: false,
    status: "render-error",
    summary: {
      targetSlides: safeArray(job.targetSlides).length,
      comparedPages: 0,
      failedPages: safeArray(job.targetSlides).length,
      meanPixelDiffRatio: null,
      maxPixelDiffRatio: null,
      meanForegroundMissingRatio: null,
      maxForegroundMissingRatio: null,
      meanAbsoluteDelta: null,
      maxMeanAbsoluteDelta: null
    },
    issues: [{
      issue: "render-error",
      message
    }],
    error: {
      message
    },
    worstPages: [],
    pages: safeArray(job.targetSlides).map((slide) => ({
      slide,
      pageIndex: slide - 1,
      ok: false,
      status: "render-error",
      issues: ["render-error"]
    }))
  };
}

function createReviewAsset({ beforeImage, afterImage, outFile }) {
  const before = readPng(beforeImage);
  const after = readPng(afterImage);
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const gutter = 8;
  const out = {
    width: width * 3 + gutter * 2,
    height,
    rgba: Buffer.alloc((width * 3 + gutter * 2) * height * 4, 255)
  };
  blitContain(out, before, 0, 0, width, height);
  blitContain(out, after, width + gutter, 0, width, height);
  blitContain(out, makeDiffPng(before, after, width, height), (width + gutter) * 2, 0, width, height);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  writePng(outFile, out);
  return path.resolve(outFile);
}

function makeDiffPng(before, after, width, height) {
  const diff = {
    width,
    height,
    rgba: Buffer.alloc(width * height * 4, 255)
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const outOffset = (y * width + x) * 4;
      const beforeOffset = sampleOffset(before, x, y, width, height);
      const afterOffset = sampleOffset(after, x, y, width, height);
      const delta = beforeOffset === null || afterOffset === null
        ? 0
        : Math.max(
          Math.abs(before.rgba[beforeOffset] - after.rgba[afterOffset]),
          Math.abs(before.rgba[beforeOffset + 1] - after.rgba[afterOffset + 1]),
          Math.abs(before.rgba[beforeOffset + 2] - after.rgba[afterOffset + 2])
        );
      diff.rgba[outOffset] = 255;
      diff.rgba[outOffset + 1] = Math.max(0, 255 - delta);
      diff.rgba[outOffset + 2] = Math.max(0, 255 - delta);
      diff.rgba[outOffset + 3] = 255;
    }
  }
  return diff;
}

function blitContain(out, image, x0, y0, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / image.width, targetHeight / image.height);
  const drawWidth = Math.max(1, Math.round(image.width * scale));
  const drawHeight = Math.max(1, Math.round(image.height * scale));
  const dx = x0 + Math.floor((targetWidth - drawWidth) / 2);
  const dy = y0 + Math.floor((targetHeight - drawHeight) / 2);
  for (let y = 0; y < drawHeight; y += 1) {
    for (let x = 0; x < drawWidth; x += 1) {
      const sx = Math.min(image.width - 1, Math.floor(x / scale));
      const sy = Math.min(image.height - 1, Math.floor(y / scale));
      const src = (sy * image.width + sx) * 4;
      const dst = ((dy + y) * out.width + dx + x) * 4;
      image.rgba.copy(out.rgba, dst, src, src + 4);
    }
  }
}

function sampleOffset(image, x, y, targetWidth, targetHeight) {
  if (targetWidth <= 0 || targetHeight <= 0 || image.width <= 0 || image.height <= 0) return null;
  const sx = Math.min(image.width - 1, Math.floor(x * image.width / targetWidth));
  const sy = Math.min(image.height - 1, Math.floor(y * image.height / targetHeight));
  return (sy * image.width + sx) * 4;
}

async function renderDeck(pptxFile, outDir, targetSlides, args) {
  const cached = args.reuseRender ? collectReusableRender(outDir, targetSlides) : null;
  if (cached) return cached;
  if (typeof args.renderDeck === "function") {
    return args.renderDeck({ pptxFile, outDir, targetSlides, args });
  }
  const maxPage = Math.max(...targetSlides);
  const context = {
    outputDir: outDir,
    config: {
      render: { maxPages: maxPage, dpi: 96 },
      powerPoint: { exportTimeoutMs: 120000, cleanupHidden: true }
    }
  };
  const input = {
    pptx: { pptxFile },
    iteration: 0,
    ir: { pages: [{ sourceImage: "", pageIndex: 0 }] }
  };
  const result = args.renderer === "libreoffice"
    ? await renderLibreOffice(input, context)
    : await renderPowerPointCom(input, context);
  if (result.ok !== true) throw new Error(result.error || `Failed to render ${pptxFile}`);
  const data = result.data || result;
  return {
    renderDir: data.renderDir,
    renderedPages: normalizeRenderedPages(data.renderedPages || data.pages || [])
  };
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      ...options,
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function sanitizeErrorMessage(error) {
  return String(error?.message || error || "unknown error").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 1000);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return typeof value === "string" ? value.slice(0, 300) : "";
}

function collectReusableRender(outDir, targetSlides = []) {
  const renderDir = path.join(outDir, "render", "iteration-0");
  if (!fs.existsSync(renderDir)) return null;
  const maxPage = Math.max(...targetSlides);
  const pages = collectRenderedPagesFromDir(renderDir);
  if (pages.length < maxPage) return null;
  const byIndex = new Map(pages.map((page) => [page.pageIndex, page]));
  if (!targetSlides.every((slide) => byIndex.has(slide - 1))) return null;
  return {
    renderDir,
    reused: true,
    renderedPages: pages
  };
}

function collectRenderedPagesFromDir(renderDir) {
  return fs.readdirSync(renderDir)
    .filter((name) => /^page-\d+\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => {
      const match = name.match(/^page-(\d+)\.png$/i);
      const image = path.join(renderDir, name);
      return {
        pageIndex: Number.parseInt(match[1], 10) - 1,
        image,
        ...readImageSize(image)
      };
    });
}

function normalizeRenderedPages(pages = []) {
  return pages.map((page, index) => ({
    ...page,
    pageIndex: Number.isInteger(page.pageIndex) ? page.pageIndex : index,
    image: path.resolve(page.image)
  }));
}

function summarizeDeckResults(results = []) {
  const okDecks = results.filter((item) => item.ok);
  return {
    decks: results.length,
    passedDecks: okDecks.length,
    failedDecks: results.length - okDecks.length,
    targetSlides: results.reduce((sum, item) => sum + Number(item.summary?.targetSlides || 0), 0),
    comparedPages: results.reduce((sum, item) => sum + Number(item.summary?.comparedPages || 0), 0),
    failedPages: results.reduce((sum, item) => sum + Number(item.summary?.failedPages || 0), 0),
    meanPixelDiffRatio: average(results.map((item) => item.summary).filter(Boolean), "meanPixelDiffRatio"),
    maxPixelDiffRatio: max(results.map((item) => item.summary).filter(Boolean), "maxPixelDiffRatio"),
    meanForegroundMissingRatio: average(results.map((item) => item.summary).filter(Boolean), "meanForegroundMissingRatio"),
    maxForegroundMissingRatio: max(results.map((item) => item.summary).filter(Boolean), "maxForegroundMissingRatio"),
    meanAbsoluteDelta: average(results.map((item) => item.summary).filter(Boolean), "meanAbsoluteDelta"),
    maxMeanAbsoluteDelta: max(results.map((item) => item.summary).filter(Boolean), "maxMeanAbsoluteDelta"),
    targetRegions: results.reduce((sum, item) => sum + Number(item.summary?.targetRegions || 0), 0),
    failedTargetRegions: results.reduce((sum, item) => sum + Number(item.summary?.failedTargetRegions || 0), 0),
    maxTargetPixelDiffRatio: max(results.map((item) => item.summary).filter(Boolean), "maxTargetPixelDiffRatio"),
    maxTargetForegroundMissingRatio: max(results.map((item) => item.summary).filter(Boolean), "maxTargetForegroundMissingRatio"),
    maxTargetMeanAbsoluteDelta: max(results.map((item) => item.summary).filter(Boolean), "maxTargetMeanAbsoluteDelta")
  };
}

function average(items, field) {
  const values = items.map((item) => Number(item?.[field])).filter(Number.isFinite);
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function max(items, field) {
  const values = items.map((item) => Number(item?.[field])).filter(Number.isFinite);
  if (!values.length) return null;
  return round(Math.max(...values));
}

function round(value) {
  return Number(value.toFixed(4));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(file, payload) {
  const out = path.resolve(file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function normalizeNonNegativeInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function safeFileStem(value) {
  return String(value || "deck").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "deck";
}

async function main() {
  try {
    const report = await runComponentIrVisualRegressionAudit(parseArgs(process.argv));
    process.stdout.write(`${JSON.stringify({
      ...report.totals,
      reportFile: report.reportFile
    }, null, 2)}\n`);
    if (report.totals.failedDecks > 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  auditDeckSafely,
  applyPageBudget,
  collectTargetRegions,
  compareTargetRegions,
  collectReusableRender,
  createReviewAsset,
  renderDeck,
  runComponentIrVisualRegressionAudit,
  selectJobs,
  summarizeDeckResults
};
