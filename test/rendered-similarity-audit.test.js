"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writePng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");

const {
  auditRenderedSimilarity,
  collectPages,
  comparePageImages
} = require("../skills/pd-hifi-slideclone/scripts/rendered-similarity-audit");

test("rendered similarity audit accepts identical previews", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rendered-similarity-pass-"));
  const sourceDir = path.join(root, "source");
  const renderDir = path.join(root, "render");
  fs.mkdirSync(sourceDir);
  fs.mkdirSync(renderDir);
  try {
    const image = pageImage(80, 48, [{ x: 10, y: 12, w: 52, h: 10, color: "#2476b8" }]);
    writePng(path.join(sourceDir, "001.png"), image);
    writePng(path.join(renderDir, "page-01.png"), image);

    const report = auditRenderedSimilarity({ sourceDir, renderDir, expectedPages: 1 }, {
      thresholds: { sampleBudget: 10000, maxPixelDiffRatio: 0.01, maxForegroundMissingRatio: 0.01, maxMeanAbsoluteDelta: 1 }
    });

    assert.equal(report.ok, true);
    assert.equal(report.summary.comparedPages, 1);
    assert.equal(report.pages[0].pixelDiffRatio, 0);
    assert.deepEqual(collectPages(sourceDir, null, /^(\d{3})\.png$/i).map((page) => page.pageIndex), [0]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rendered similarity audit flags visible differences and missing pages", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rendered-similarity-fail-"));
  const sourceDir = path.join(root, "source");
  const renderDir = path.join(root, "render");
  fs.mkdirSync(sourceDir);
  fs.mkdirSync(renderDir);
  try {
    writePng(path.join(sourceDir, "001.png"), pageImage(80, 48, [{ x: 8, y: 8, w: 60, h: 20, color: "#111111" }]));
    writePng(path.join(sourceDir, "002.png"), pageImage(80, 48, [{ x: 8, y: 8, w: 60, h: 20, color: "#111111" }]));
    writePng(path.join(renderDir, "page-01.png"), pageImage(80, 48, []));

    const report = auditRenderedSimilarity({ sourceDir, renderDir, expectedPages: 2 }, {
      thresholds: { sampleBudget: 10000, maxPixelDiffRatio: 0.01, maxForegroundMissingRatio: 0.01, maxMeanAbsoluteDelta: 1 }
    });

    assert.equal(report.ok, false);
    assert.equal(report.summary.comparedPages, 1);
    assert.equal(report.summary.failedPages, 1);
    assert.ok(report.issues.some((issue) => issue.type === "foreground-missing-threshold-exceeded"));
    assert.ok(report.issues.some((issue) => issue.type === "missing-rendered-page" && issue.pageIndex === 1));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("comparePageImages rescales rendered images before scoring", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rendered-similarity-scale-"));
  try {
    const source = path.join(root, "source.png");
    const rendered = path.join(root, "rendered.png");
    writePng(source, pageImage(80, 48, [{ x: 10, y: 10, w: 40, h: 12, color: "#2f88c9" }]));
    writePng(rendered, pageImage(160, 96, [{ x: 20, y: 20, w: 80, h: 24, color: "#2f88c9" }]));

    const page = comparePageImages(0, source, rendered, {
      sampleBudget: 10000,
      foregroundTolerancePx: 2,
      foregroundToleranceDelta: 48,
      maxPixelDiffRatio: 0.05,
      maxForegroundMissingRatio: 0.05,
      maxMeanAbsoluteDelta: 5
    });

    assert.equal(page.ok, true);
    assert.equal(page.renderedSize.width, 160);
    assert.equal(page.renderedSize.height, 96);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function pageImage(width, height, rects) {
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (const rect of rects) fillRect(rgba, width, height, rect);
  return { width, height, rgba };
}

function fillRect(rgba, width, height, rect) {
  const color = hexToRgb(rect.color);
  for (let y = Math.max(0, rect.y); y < Math.min(height, rect.y + rect.h); y += 1) {
    for (let x = Math.max(0, rect.x); x < Math.min(width, rect.x + rect.w); x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = color.r;
      rgba[offset + 1] = color.g;
      rgba[offset + 2] = color.b;
      rgba[offset + 3] = 255;
    }
  }
}

function hexToRgb(hex) {
  const value = hex.replace(/^#/, "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  };
}
