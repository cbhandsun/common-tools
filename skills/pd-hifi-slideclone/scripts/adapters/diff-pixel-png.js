"use strict";

const fs = require("fs");
const path = require("path");
const { readPng, writePng } = require("../lib/png");

module.exports = async function diffPixelPng(input, context) {
  const threshold = Number(process.env.SLIDECLONE_PIXEL_THRESHOLD || "24");
  const foregroundTolerancePx = Number(context.config?.diff?.foregroundTolerancePx ?? 2);
  const foregroundToleranceDelta = Number(context.config?.diff?.foregroundToleranceDelta ?? Math.max(42, threshold * 1.8));
  const rendered = new Map((input.render?.renderedPages || []).map((page) => [page.pageIndex, page]));
  const metrics = [];

  for (const page of input.ir.pages || []) {
    const renderedPage = rendered.get(page.pageIndex);
    if (!renderedPage) {
      metrics.push({
        pageIndex: page.pageIndex,
        ok: false,
        error: "Rendered page is missing."
      });
      continue;
    }
    try {
      const source = readPng(page.sourceImage);
      const generated = readPng(renderedPage.image);
      const diffImage = path.join(context.outputDir, "diff", `page-${page.pageIndex + 1}.iteration-${input.iteration || 0}.diff.png`);
      metrics.push(compareImages(page.pageIndex, source, generated, {
        threshold,
        foregroundTolerancePx,
        foregroundToleranceDelta
      }, renderedPage.image, diffImage));
    } catch (error) {
      metrics.push({
        pageIndex: page.pageIndex,
        ok: false,
        sourceImage: page.sourceImage,
        renderedImage: renderedPage.image,
        error: error.message
      });
    }
  }

  const okMetrics = metrics.filter((metric) => metric.ok);
  const summary = {
    pixelDiffRatio: okMetrics.length
      ? okMetrics.reduce((sum, metric) => sum + metric.pixelDiffRatio, 0) / okMetrics.length
      : null,
    foregroundMissingRatio: okMetrics.length
      ? okMetrics.reduce((sum, metric) => sum + metric.foregroundMissingRatio, 0) / okMetrics.length
      : null,
    foregroundMissingRatioRaw: okMetrics.length
      ? okMetrics.reduce((sum, metric) => sum + metric.foregroundMissingRatioRaw, 0) / okMetrics.length
      : null,
    layoutMeanIoU: null,
    textCoverage: null,
    maxCriticalOffsetPt: null,
    comparedPages: okMetrics.length,
    failedPages: metrics.length - okMetrics.length
  };

  const reportFile = path.join(context.outputDir, "diff", `pixel-diff.iteration-${input.iteration || 0}.json`);
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify({ summary, metrics }, null, 2)}\n`, "utf8");

  return {
    ok: true,
    data: {
      provider: "diff-pixel-png",
      reportFile,
      metrics,
      summary
    }
  };
};

function compareImages(pageIndex, source, generated, options, renderedImage, diffImage) {
  const threshold = options.threshold;
  let changed = 0;
  let totalDelta = 0;
  let foreground = 0;
  let foregroundMissing = 0;
  let foregroundMissingRaw = 0;
  const total = source.width * source.height;
  const diff = {
    width: source.width,
    height: source.height,
    rgba: Buffer.alloc(total * 4)
  };
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const srcOffset = (y * source.width + x) * 4;
      const gx = Math.min(generated.width - 1, Math.round(x * generated.width / source.width));
      const gy = Math.min(generated.height - 1, Math.round(y * generated.height / source.height));
      const genOffset = (gy * generated.width + gx) * 4;
      const delta = Math.abs(source.rgba[srcOffset] - generated.rgba[genOffset])
        + Math.abs(source.rgba[srcOffset + 1] - generated.rgba[genOffset + 1])
        + Math.abs(source.rgba[srcOffset + 2] - generated.rgba[genOffset + 2])
        + Math.abs(source.rgba[srcOffset + 3] - generated.rgba[genOffset + 3]);
      totalDelta += delta / 4;
      const sourceForeground = isForeground(source.rgba, srcOffset);
      const isChanged = delta / 4 > threshold;
      if (sourceForeground) foreground += 1;
      if (isChanged) changed += 1;
      if (sourceForeground && isChanged) {
        foregroundMissingRaw += 1;
        if (!hasNearbyForegroundMatch(source, srcOffset, generated, gx, gy, options)) {
          foregroundMissing += 1;
        }
      }
      writeDiffPixel(diff.rgba, srcOffset, source.rgba, srcOffset, generated.rgba, genOffset, isChanged);
    }
  }
  fs.mkdirSync(path.dirname(diffImage), { recursive: true });
  writePng(diffImage, diff);
  return {
    pageIndex,
    ok: true,
    renderedImage,
    diffImage,
    sourceSize: { width: source.width, height: source.height },
    renderedSize: { width: generated.width, height: generated.height },
    pixelDiffRatio: total ? changed / total : 1,
    foregroundMissingRatio: foreground ? foregroundMissing / foreground : 1,
    foregroundMissingRatioRaw: foreground ? foregroundMissingRaw / foreground : 1,
    foregroundPixels: foreground,
    meanAbsoluteDelta: total ? totalDelta / total : 255,
    foregroundTolerancePx: options.foregroundTolerancePx,
    foregroundToleranceDelta: options.foregroundToleranceDelta
  };
}

function hasNearbyForegroundMatch(source, srcOffset, generated, gx, gy, options) {
  const radius = Math.max(0, Math.floor(options.foregroundTolerancePx || 0));
  const maxDelta = options.foregroundToleranceDelta;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= generated.width || ny >= generated.height) continue;
      const genOffset = (ny * generated.width + nx) * 4;
      if (!isForeground(generated.rgba, genOffset)) continue;
      const delta = Math.abs(source.rgba[srcOffset] - generated.rgba[genOffset])
        + Math.abs(source.rgba[srcOffset + 1] - generated.rgba[genOffset + 1])
        + Math.abs(source.rgba[srcOffset + 2] - generated.rgba[genOffset + 2])
        + Math.abs(source.rgba[srcOffset + 3] - generated.rgba[genOffset + 3]);
      if (delta / 4 <= maxDelta) return true;
    }
  }
  return false;
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

function writeDiffPixel(out, offset, source, srcOffset, generated, genOffset, isChanged) {
  if (isChanged) {
    out[offset] = 255;
    out[offset + 1] = Math.floor(generated[genOffset + 1] * 0.25);
    out[offset + 2] = Math.floor(generated[genOffset + 2] * 0.25);
    out[offset + 3] = 255;
    return;
  }
  out[offset] = Math.floor(source[srcOffset] * 0.35 + generated[genOffset] * 0.65);
  out[offset + 1] = Math.floor(source[srcOffset + 1] * 0.35 + generated[genOffset + 1] * 0.65);
  out[offset + 2] = Math.floor(source[srcOffset + 2] * 0.35 + generated[genOffset + 2] * 0.65);
  out[offset + 3] = 255;
}
