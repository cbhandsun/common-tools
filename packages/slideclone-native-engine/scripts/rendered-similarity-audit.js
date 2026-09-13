#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { readPng } = require("./lib/png");

const DEFAULT_THRESHOLDS = {
  maxPixelDiffRatio: 0.38,
  maxForegroundMissingRatio: 0.55,
  maxMeanAbsoluteDelta: 62,
  sampleBudget: 160000,
  foregroundTolerancePx: 2,
  foregroundToleranceDelta: 48
};

function auditRenderedSimilarity(input = {}, options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const sourcePages = collectPages(input.sourceDir, input.sourcePages, /^(\d{3})\.png$/i);
  const renderedPages = collectPages(input.renderDir, input.renderedPages, /^page-(\d+)\.png$/i);
  const expectedPages = expectedPageCount(input, sourcePages);
  const renderedByIndex = new Map(renderedPages.map((page) => [page.pageIndex, page]));
  const sourceByIndex = new Map(sourcePages.map((page) => [page.pageIndex, page]));
  const pageIndexes = expectedPages !== null
    ? Array.from({ length: expectedPages }, (_, index) => index)
    : [...new Set([...sourceByIndex.keys(), ...renderedByIndex.keys()])].sort((a, b) => a - b);
  const pages = [];

  for (const pageIndex of pageIndexes) {
    const source = sourceByIndex.get(pageIndex);
    const rendered = renderedByIndex.get(pageIndex);
    if (!source || !rendered) {
      pages.push({
        pageIndex,
        ok: false,
        status: "missing-page",
        sourceImage: source?.image || null,
        renderedImage: rendered?.image || null,
        issues: [!source ? "missing-source-page" : "missing-rendered-page"]
      });
      continue;
    }
    pages.push(comparePageImages(pageIndex, source.image, rendered.image, thresholds));
  }

  const compared = pages.filter((page) => page.status === "compared");
  const summary = {
    expectedPages,
    sourcePages: sourcePages.length,
    renderedPages: renderedPages.length,
    comparedPages: compared.length,
    failedPages: pages.length - compared.length,
    meanPixelDiffRatio: average(compared, "pixelDiffRatio"),
    meanForegroundMissingRatio: average(compared, "foregroundMissingRatio"),
    meanAbsoluteDelta: average(compared, "meanAbsoluteDelta"),
    maxPixelDiffRatio: max(compared, "pixelDiffRatio"),
    maxForegroundMissingRatio: max(compared, "foregroundMissingRatio"),
    maxMeanAbsoluteDelta: max(compared, "meanAbsoluteDelta")
  };
  const issues = pages.flatMap((page) => page.issues.map((issue) => ({
    type: issue,
    severity: issue === "missing-rendered-page" || issue === "missing-source-page" ? "high" : "medium",
    pageIndex: page.pageIndex,
    pixelDiffRatio: page.pixelDiffRatio ?? null,
    foregroundMissingRatio: page.foregroundMissingRatio ?? null,
    meanAbsoluteDelta: page.meanAbsoluteDelta ?? null
  })));
  return {
    ok: issues.length === 0,
    thresholds,
    summary,
    issues,
    worstPages: [...compared]
      .sort((a, b) => b.pixelDiffRatio - a.pixelDiffRatio)
      .slice(0, 5)
      .map((page) => ({
        pageIndex: page.pageIndex,
        pixelDiffRatio: page.pixelDiffRatio,
        foregroundMissingRatio: page.foregroundMissingRatio,
        meanAbsoluteDelta: page.meanAbsoluteDelta
      })),
    pages
  };
}

function comparePageImages(pageIndex, sourceImage, renderedImage, thresholds = DEFAULT_THRESHOLDS) {
  const source = readPng(sourceImage);
  const rendered = readPng(renderedImage);
  return compareRasterImages({
    pageIndex,
    source,
    rendered,
    sourceImage,
    renderedImage,
    thresholds
  });
}

function compareRasterImages({
  pageIndex = 0,
  source,
  rendered,
  sourceImage = null,
  renderedImage = null,
  thresholds = DEFAULT_THRESHOLDS
} = {}) {
  if (!source?.rgba || !rendered?.rgba) throw new Error("source and rendered raster images are required.");
  const total = source.width * source.height;
  const step = Math.max(1, Math.floor(total / Math.max(1, thresholds.sampleBudget || DEFAULT_THRESHOLDS.sampleBudget)));
  let sampled = 0;
  let changed = 0;
  let foreground = 0;
  let foregroundMissing = 0;
  let totalDelta = 0;
  for (let pixel = 0; pixel < total; pixel += step) {
    const x = pixel % source.width;
    const y = Math.floor(pixel / source.width);
    const srcOffset = pixel * 4;
    const gx = Math.min(rendered.width - 1, Math.round(x * rendered.width / source.width));
    const gy = Math.min(rendered.height - 1, Math.round(y * rendered.height / source.height));
    const genOffset = (gy * rendered.width + gx) * 4;
    const delta = rgbaDelta(source.rgba, srcOffset, rendered.rgba, genOffset);
    const sourceForeground = isForeground(source.rgba, srcOffset);
    const isChanged = delta > thresholds.foregroundToleranceDelta;
    sampled += 1;
    totalDelta += delta;
    if (isChanged) changed += 1;
    if (sourceForeground) foreground += 1;
    if (sourceForeground && isChanged && !hasNearbyForegroundMatch(source, srcOffset, rendered, gx, gy, thresholds)) {
      foregroundMissing += 1;
    }
  }
  const safeSampled = Math.max(1, sampled);
  const safeForeground = Math.max(1, foreground);
  const metrics = {
    pageIndex,
    ok: true,
    status: "compared",
    sourceImage,
    renderedImage,
    sourceSize: { width: source.width, height: source.height },
    renderedSize: { width: rendered.width, height: rendered.height },
    sampled,
    pixelDiffRatio: round(changed / safeSampled),
    foregroundMissingRatio: round(foregroundMissing / safeForeground),
    meanAbsoluteDelta: round(totalDelta / safeSampled),
    foregroundPixels: foreground,
    issues: []
  };
  if (metrics.pixelDiffRatio > thresholds.maxPixelDiffRatio) metrics.issues.push("pixel-diff-threshold-exceeded");
  if (metrics.foregroundMissingRatio > thresholds.maxForegroundMissingRatio) metrics.issues.push("foreground-missing-threshold-exceeded");
  if (metrics.meanAbsoluteDelta > thresholds.maxMeanAbsoluteDelta) metrics.issues.push("mean-delta-threshold-exceeded");
  metrics.ok = metrics.issues.length === 0;
  return metrics;
}

function collectPages(dir, providedPages = null, pattern = /^page-(\d+)\.png$/i) {
  if (Array.isArray(providedPages) && providedPages.length > 0) {
    return providedPages
      .filter((page) => page && page.image)
      .map((page, index) => ({ pageIndex: Number.isInteger(page.pageIndex) ? page.pageIndex : index, image: path.resolve(page.image) }))
      .sort((a, b) => a.pageIndex - b.pageIndex);
  }
  if (!dir) return [];
  const root = path.resolve(dir);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .map((name) => {
      const match = name.match(pattern);
      if (!match) return null;
      return { pageIndex: Number.parseInt(match[1], 10) - 1, image: path.join(root, name) };
    })
    .filter(Boolean)
    .sort((a, b) => a.pageIndex - b.pageIndex);
}

function expectedPageCount(input = {}, sourcePages = []) {
  if (Number.isInteger(input.expectedPages) && input.expectedPages >= 0) return input.expectedPages;
  if (input.irFile) {
    const ir = readJson(input.irFile);
    return Array.isArray(ir?.pages) ? ir.pages.length : null;
  }
  return sourcePages.length || null;
}

function hasNearbyForegroundMatch(source, srcOffset, rendered, gx, gy, thresholds) {
  const radius = Math.max(0, Math.floor(thresholds.foregroundTolerancePx || 0));
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= rendered.width || ny >= rendered.height) continue;
      const genOffset = (ny * rendered.width + nx) * 4;
      if (!isForeground(rendered.rgba, genOffset)) continue;
      if (rgbaDelta(source.rgba, srcOffset, rendered.rgba, genOffset) <= thresholds.foregroundToleranceDelta) return true;
    }
  }
  return false;
}

function rgbaDelta(a, aOffset, b, bOffset) {
  return (
    Math.abs(a[aOffset] - b[bOffset])
    + Math.abs(a[aOffset + 1] - b[bOffset + 1])
    + Math.abs(a[aOffset + 2] - b[bOffset + 2])
    + Math.abs(a[aOffset + 3] - b[bOffset + 3])
  ) / 4;
}

function isForeground(rgba, offset) {
  const r = rgba[offset];
  const g = rgba[offset + 1];
  const b = rgba[offset + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  return brightness < 245 || max - min > 18;
}

function average(items, field) {
  if (!items.length) return null;
  return round(items.reduce((sum, item) => sum + Number(item[field] || 0), 0) / items.length);
}

function max(items, field) {
  if (!items.length) return null;
  return round(Math.max(...items.map((item) => Number(item[field] || 0))));
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

function thresholdOverrides(args) {
  const thresholds = {};
  const mapping = {
    "max-pixel-diff-ratio": "maxPixelDiffRatio",
    "max-foreground-missing-ratio": "maxForegroundMissingRatio",
    "max-mean-delta": "maxMeanAbsoluteDelta",
    "sample-budget": "sampleBudget"
  };
  for (const [argName, key] of Object.entries(mapping)) {
    if (args[argName] === undefined) continue;
    const value = Number(args[argName]);
    if (Number.isFinite(value)) thresholds[key] = value;
  }
  return thresholds;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceDir = args["source-dir"];
  const renderDir = args["render-dir"];
  if (!sourceDir || !renderDir) {
    process.stderr.write("Usage: node rendered-similarity-audit.js --source-dir <normalized> --render-dir <preview> [--ir deck.ir.json] [--out report.json] [--fail-on-threshold]\n");
    process.exit(2);
  }
  const report = auditRenderedSimilarity({
    sourceDir,
    renderDir,
    irFile: args.ir || null,
    expectedPages: args["expected-pages"] ? Number.parseInt(args["expected-pages"], 10) : undefined
  }, { thresholds: thresholdOverrides(args) });
  if (args.out) {
    const outFile = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  if (args["fail-on-threshold"] && !report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  auditRenderedSimilarity,
  collectPages,
  comparePageImages,
  compareRasterImages,
  isForeground
};
