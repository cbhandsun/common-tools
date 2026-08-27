#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readPng } = require("./lib/png");

const DEFAULT_THRESHOLDS = {
  minInkRatio: 0.015,
  maxWhiteRatio: 0.985,
  maxDimensionOutlierRatio: 0.02,
  sampleBudget: 120000
};

function auditRenderedPreviews(input = {}, options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const pages = collectPreviewPages(input.renderDir || input.previewDir || input.dir, input.pages);
  const expectedPages = expectedPageCount(input);
  const issues = [];
  const pageReports = pages.map((page) => analyzePreviewPage(page, thresholds));
  const baseline = mostCommonDimensions(pageReports);

  if (expectedPages !== null && pages.length !== expectedPages) {
    issues.push({
      type: "rendered-page-count-mismatch",
      severity: "high",
      expectedPages,
      actualPages: pages.length,
      message: "Rendered preview page count does not match the expected deck page count."
    });
  }

  for (const page of pageReports) {
    if (baseline && isDimensionOutlier(page, baseline, thresholds.maxDimensionOutlierRatio)) {
      issues.push({
        type: "rendered-page-dimension-outlier",
        severity: "high",
        pageIndex: page.pageIndex,
        width: page.width,
        height: page.height,
        expectedWidth: baseline.width,
        expectedHeight: baseline.height,
        message: "Rendered page dimensions differ from the deck baseline."
      });
    }
    if (page.inkRatio < thresholds.minInkRatio || page.whiteRatio > thresholds.maxWhiteRatio) {
      issues.push({
        type: "rendered-page-nearly-blank",
        severity: "high",
        pageIndex: page.pageIndex,
        inkRatio: page.inkRatio,
        whiteRatio: page.whiteRatio,
        message: "Rendered page appears nearly blank or lost most visible content."
      });
    }
  }

  return {
    ok: issues.length === 0,
    totals: {
      expectedPages,
      renderedPages: pages.length,
      issues: issues.length,
      blankLikePages: issues.filter((issue) => issue.type === "rendered-page-nearly-blank").length,
      dimensionOutliers: issues.filter((issue) => issue.type === "rendered-page-dimension-outlier").length
    },
    baselineDimensions: baseline,
    issues,
    pages: pageReports
  };
}

function collectPreviewPages(renderDir, providedPages = null) {
  if (Array.isArray(providedPages) && providedPages.length > 0) {
    return providedPages
      .filter((page) => page && page.image)
      .map((page, index) => ({ pageIndex: Number.isInteger(page.pageIndex) ? page.pageIndex : index, image: path.resolve(page.image) }))
      .sort((a, b) => a.pageIndex - b.pageIndex);
  }
  if (!renderDir) return [];
  const dir = path.resolve(renderDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^page-\d+\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name, index) => ({ pageIndex: index, image: path.join(dir, name) }));
}

function analyzePreviewPage(page, thresholds = DEFAULT_THRESHOLDS) {
  const image = readPng(page.image);
  const total = image.width * image.height;
  const step = Math.max(1, Math.floor(total / Math.max(1, thresholds.sampleBudget || DEFAULT_THRESHOLDS.sampleBudget)));
  let sampled = 0;
  let ink = 0;
  let white = 0;
  let dark = 0;
  for (let pixel = 0; pixel < total; pixel += step) {
    const offset = pixel * 4;
    const alpha = image.rgba[offset + 3];
    if (alpha < 8) continue;
    const r = image.rgba[offset];
    const g = image.rgba[offset + 1];
    const b = image.rgba[offset + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (r + g + b) / 3;
    if (lightness < 245 || max - min > 18) ink += 1;
    if (lightness > 248 && max - min < 8) white += 1;
    if (lightness < 60) dark += 1;
    sampled += 1;
  }
  const safeSampled = Math.max(1, sampled);
  return {
    pageIndex: page.pageIndex,
    image: page.image,
    width: image.width,
    height: image.height,
    sampled,
    inkRatio: round(ink / safeSampled),
    whiteRatio: round(white / safeSampled),
    darkRatio: round(dark / safeSampled)
  };
}

function expectedPageCount(input = {}) {
  if (Number.isInteger(input.expectedPages) && input.expectedPages >= 0) return input.expectedPages;
  if (input.irFile) {
    const ir = readJson(input.irFile);
    return Array.isArray(ir?.pages) ? ir.pages.length : null;
  }
  return null;
}

function mostCommonDimensions(pages = []) {
  if (!Array.isArray(pages) || pages.length === 0) return null;
  const counts = new Map();
  for (const page of pages) {
    const key = `${page.width}x${page.height}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const [key] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const [width, height] = key.split("x").map((value) => Number.parseInt(value, 10));
  return { width, height };
}

function isDimensionOutlier(page, baseline, toleranceRatio) {
  const widthTolerance = Math.max(1, baseline.width * toleranceRatio);
  const heightTolerance = Math.max(1, baseline.height * toleranceRatio);
  return Math.abs(page.width - baseline.width) > widthTolerance
    || Math.abs(page.height - baseline.height) > heightTolerance;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8").replace(/^\uFEFF/, ""));
}

function round(value) {
  return Number(value.toFixed(4));
}

function parseArgs(argv = []) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const renderDir = args["render-dir"] || args.dir;
  if (!renderDir) {
    process.stderr.write("Usage: node rendered-preview-audit.js --render-dir <dir> [--ir deck.ir.json] [--expected-pages n] [--out report.json] [--fail-on-issue]\n");
    process.exit(2);
  }
  const report = auditRenderedPreviews({
    renderDir,
    irFile: args.ir || null,
    expectedPages: args["expected-pages"] ? Number.parseInt(args["expected-pages"], 10) : undefined
  });
  if (args.out) {
    const outFile = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify(report.totals, null, 2)}\n`);
  if (args["fail-on-issue"] && !report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  analyzePreviewPage,
  auditRenderedPreviews,
  collectPreviewPages,
  isDimensionOutlier,
  mostCommonDimensions
};
