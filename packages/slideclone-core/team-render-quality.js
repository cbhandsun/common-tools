"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_THRESHOLDS = Object.freeze({ maximumPixelDiffRatio: 0.09, maximumForegroundMissingRatio: 0.12, maximumMeanAbsoluteDelta: 12 });

function boundedThreshold(value, fallback, maximum) {
  const resolved = value === undefined ? fallback : value;
  if (!Number.isFinite(resolved) || resolved < 0 || resolved > maximum) throw new TypeError("raw image quality threshold is invalid");
  return resolved;
}
function insideRoot(root, file) {
  const relative = path.relative(root, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function createRawImageRenderQualityVerifier({ renderPresentation, comparePageFiles, thresholds = {} } = {}) {
  if (typeof renderPresentation !== "function" || typeof comparePageFiles !== "function") throw new TypeError("raw image quality adapters are required");
  const policy = Object.freeze({
    maximumPixelDiffRatio: boundedThreshold(thresholds.maximumPixelDiffRatio, DEFAULT_THRESHOLDS.maximumPixelDiffRatio, 1),
    maximumForegroundMissingRatio: boundedThreshold(thresholds.maximumForegroundMissingRatio, DEFAULT_THRESHOLDS.maximumForegroundMissingRatio, 1),
    maximumMeanAbsoluteDelta: boundedThreshold(thresholds.maximumMeanAbsoluteDelta, DEFAULT_THRESHOLDS.maximumMeanAbsoluteDelta, 255)
  });
  return async ({ root, pptxFile, sourceImage, isCancellationRequested }) => {
    if (typeof root !== "string" || !path.isAbsolute(root)
      || typeof pptxFile !== "string" || !path.isAbsolute(pptxFile) || !insideRoot(root, pptxFile)
      || typeof sourceImage !== "string" || !path.isAbsolute(sourceImage) || !insideRoot(root, sourceImage)) throw new TypeError("raw image quality request is invalid");
    for (const file of [pptxFile, sourceImage]) {
      const info = fs.lstatSync(file);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("raw image quality input is invalid");
    }
    if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
    const outputDir = path.join(root, "quality-render");
    const startedAt = Date.now();
    try {
      const rendered = await renderPresentation({ pptx: { pptxFile }, iteration: 0 }, { outputDir, config: { render: { dpi: 144, maxPages: 1, convertTimeoutMs: 120000, renderTimeoutMs: 120000 } } });
      const renderedPages = rendered?.data?.renderedPages;
      if (!rendered?.ok || !Array.isArray(renderedPages) || renderedPages.length !== 1 || typeof renderedPages[0]?.image !== "string") throw new Error("quality renderer returned an invalid result");
      if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
      const metric = comparePageFiles({ pageIndex: 0, sourceImage, renderedImage: renderedPages[0].image, diffImage: path.join(outputDir, "diff.png"), options: { threshold: 24, foregroundTolerancePx: 2, foregroundToleranceDelta: 54 } });
      if (!metric?.ok || ![metric.pixelDiffRatio, metric.foregroundMissingRatio, metric.meanAbsoluteDelta].every(Number.isFinite)) throw new Error("quality comparison returned an invalid result");
      const passed = metric.pixelDiffRatio <= policy.maximumPixelDiffRatio && metric.foregroundMissingRatio <= policy.maximumForegroundMissingRatio && metric.meanAbsoluteDelta <= policy.maximumMeanAbsoluteDelta;
      return Object.freeze({
        passed,
        checks: Object.freeze([Object.freeze({ name: "quality-rendered", passed: true }), Object.freeze({ name: "visual-fidelity", passed })]),
        metrics: Object.freeze({ "pixel-diff-ratio": metric.pixelDiffRatio, "foreground-missing-ratio": metric.foregroundMissingRatio, "mean-absolute-delta": metric.meanAbsoluteDelta, "quality-render-milliseconds": Date.now() - startedAt })
      });
    } catch (error) {
      if (error instanceof Error && error.message === "editable job was cancelled") throw error;
      return Object.freeze({ passed: false, checks: Object.freeze([Object.freeze({ name: "quality-rendered", passed: false })]), metrics: Object.freeze({ "quality-render-milliseconds": Date.now() - startedAt }) });
    }
  };
}

module.exports = { DEFAULT_THRESHOLDS, createRawImageRenderQualityVerifier };
