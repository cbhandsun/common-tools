"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writePng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");

const {
  auditRenderedPreviews,
  collectPreviewPages,
  mostCommonDimensions
} = require("../skills/pd-hifi-slideclone/scripts/rendered-preview-audit");

test("rendered preview audit passes non-blank consistent pages", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rendered-preview-pass-"));
  try {
    writePng(path.join(dir, "page-01.png"), pageImage(100, 60, [{ x: 10, y: 10, w: 80, h: 8, color: "#111111" }]));
    writePng(path.join(dir, "page-02.png"), pageImage(100, 60, [{ x: 20, y: 18, w: 60, h: 18, color: "#2f88c9" }]));

    const report = auditRenderedPreviews({ renderDir: dir, expectedPages: 2 }, {
      thresholds: { minInkRatio: 0.01, maxWhiteRatio: 0.99, sampleBudget: 10000 }
    });

    assert.equal(report.ok, true);
    assert.equal(report.totals.renderedPages, 2);
    assert.equal(report.totals.issues, 0);
    assert.deepEqual(collectPreviewPages(dir).map((page) => path.basename(page.image)), ["page-01.png", "page-02.png"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("rendered preview audit flags blank pages, page count mismatch, and dimension outliers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rendered-preview-fail-"));
  try {
    writePng(path.join(dir, "page-01.png"), pageImage(100, 60, [{ x: 10, y: 10, w: 70, h: 10, color: "#111111" }]));
    writePng(path.join(dir, "page-02.png"), pageImage(100, 60, []));
    writePng(path.join(dir, "page-03.png"), pageImage(140, 60, [{ x: 20, y: 20, w: 70, h: 12, color: "#111111" }]));

    const report = auditRenderedPreviews({ renderDir: dir, expectedPages: 4 }, {
      thresholds: { minInkRatio: 0.01, maxWhiteRatio: 0.99, sampleBudget: 10000 }
    });

    assert.equal(report.ok, false);
    assert.equal(report.totals.renderedPages, 3);
    assert.ok(report.issues.some((issue) => issue.type === "rendered-page-count-mismatch"));
    assert.ok(report.issues.some((issue) => issue.type === "rendered-page-nearly-blank" && issue.pageIndex === 1));
    assert.ok(report.issues.some((issue) => issue.type === "rendered-page-dimension-outlier" && issue.pageIndex === 2));
    assert.deepEqual(mostCommonDimensions(report.pages), { width: 100, height: 60 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
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
